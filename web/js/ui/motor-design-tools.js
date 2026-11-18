import { el, eng, num, specTable } from './controls.js';
import { parseMotorFieldMap } from '../engine/motor-field-map.js';
import { lineCurrentFactor } from '../engine/motor-envelope.js';

const phaseName = i => String.fromCharCode(65 + i);
const isRotary = cfg => ['rotary', 'dual-rotor'].includes(cfg.motorFamily ?? 'rotary');
const fmtForce = value => eng(value, 'N');

export function motorStudies(api) {
  const { body, config, host, settings, form, field, select, button, runButton, run, output, note, chart, status,
    exportReport, changed, pruneViews } = api;
  const plot = (parent, values, series, units, heading, xLabel) => chart(parent, values, series, units, false, heading, xLabel);
  const enter = (layout, state, definitions) => {
    for (const [key, label, min, max, step] of definitions) field(layout, state, key, label, min, max, step);
  };

  function motorSizing() {
    const c = config(), motor = host.result().motor;
    if (host.result().wave) { body.append(note('Select Spiral coils in Rotary winding to run coil-count and turn-count sizing.')); return; }
    if (!isRotary(c) || c.phases !== 3) { body.append(note('Choose a three-phase rotary or dual-rotor stator to size a winding.')); return; }
    body.append(note('Search within the current coil shape, bore, rotor field, phase connection, and copper stack. Ranked candidates include the complete routing collar in the finished diameter.'));
    const s = settings('motorSizing', {
      speed: c.rpm, targetTorque: Math.max(0.001, (motor?.torque || 0) / 2), vdc: c.vdc, current: Math.max(0.001, c.current * lineCurrentFactor(motor?.topology)),
      ambient: 25, maxTemperature: 100, thermalResistance: 25, modulation: 'spaceVector',
      diameter: Math.ceil(2 * Math.hypot(...host.result().art.outline[0].pts[0]) + 5),
      minCoils: Math.max(3, c.coilCount - 3), maxCoils: Math.min(48, c.coilCount + 3), maxTurns: Math.max(12, Math.ceil(c.turns)),
      maxPolePairs: Math.max(12, c.polePairs),
      minWidth: c.fabricationProfile?.minTrace ?? c.traceW, clearance: c.fabricationProfile?.minGap ?? c.traceS,
    });
    const f = form();
    enter(f, s, [
      ['speed', 'Target speed (rpm)', 0, 300000], ['targetTorque', 'Target torque (N·m)', 0.000001, 1000],
      ['vdc', 'DC bus voltage (V)', 0.1, 1000], ['current', 'Driver peak line current (A)', 0.001, 1000],
      ['ambient', 'Ambient temperature (°C)', -50, 150], ['maxTemperature', 'Winding temperature limit (°C)', -40, 250],
      ['thermalResistance', 'Winding-to-ambient thermal resistance (°C/W)', 0.001, 10000],
      ['diameter', 'Maximum finished diameter (mm)', 10, 600],
      ['minCoils', 'Minimum coil count', 3, 48, 1], ['maxCoils', 'Maximum coil count', 3, 48, 1],
      ['maxPolePairs', 'Maximum pole pairs', 1, 30, 1],
      ['maxTurns', 'Maximum turns per layer', 1, 60, 1], ['minWidth', 'Minimum track width (mm)', 0.025, 3],
      ['clearance', 'Minimum copper clearance (mm)', 0.025, 3],
    ]);
    if (c.motorTopology !== 'independent') select(f, s, 'modulation', 'Inverter modulation', [['spaceVector', 'Space-vector PWM'], ['sine', 'Sinusoidal PWM']]);
    runButton('Find motor designs', () => {
      out.replaceChildren();
      const request = { ...s };
      run('motorSizing', { cfg: c, settings: request, env: host.environment() }, result => {
        out.append(note(result.candidates.some(candidate => candidate.point.feasible)
          ? 'Ranked by estimated copper loss. The smallest qualifying design is included.'
          : 'No sampled design met the operating target. Check the available torque and limiting factor below.'));
        out.append(note(result.tried + ' layouts tried · ' + result.routed + ' routed within the diameter limit · ' + result.verified + ' checked at the requested speed with interconnect loss'));
        for (const { patch, point, finishedDiameter, routingLoss, windingFactor } of result.candidates) {
          const heading = patch.coilCount + ' coils · ' + (2 * patch.polePairs) + ' poles · ' + patch.turns + ' turns per layer';
          const item = el('details', { class: 'motor-candidate' }, el('summary', { text: heading + ' · ' + num(finishedDiameter, 1) + ' mm' }));
          item.append(specTable([
            ['Phase branches', patch.coilSeries ? 'Series coils' : 'Parallel coils'],
            ['Track width / clearance', num(patch.traceW, 3) + ' / ' + num(patch.traceS, 3) + ' mm'],
            ['Winding factor', num(windingFactor, 3)],
            ['Target torque', point.feasible ? 'Within estimated limits' : 'Outside estimated limits'],
            ['Available torque at target speed', eng(point.torque, 'N·m') + ' · ' + point.limit],
            ['Peak line current at target torque', eng(point.requestedLineCurrent, 'A')],
            ['Copper loss at target torque', eng(point.copperLoss, 'W') + ' (' + eng(routingLoss, 'W') + ' in routing)'],
            ['Voltage headroom at target torque', eng(point.voltageMargin, 'V')],
            ['Temperature headroom at target torque', num(point.temperatureMargin, 1) + ' °C'],
          ]));
          const use = button('Use this winding', () => {
            if (JSON.stringify(request) !== JSON.stringify(s)) {
              status.textContent = 'The target changed. Run motor sizing again before applying a winding.';
              return;
            }
            host.apply(patch);
            status.textContent = 'Applied ' + heading + '.';
          });
          item.append(use); out.append(item);
        }
        if (out.querySelector('details')) out.querySelector('details').open = true;
        exportReport(out, 'motor-sizing', { settings: request, ...result });
      });
    });
    const out = output();
  }

  function fieldMap() {
    const c = config();
    if (!isRotary(c)) { body.append(note('Use a rotary or dual-rotor stator for rotating field-map analysis.')); return; }
    body.append(note('Import the combined axial field in the rotor frame at the copper midplane. Use a complete rectangular CSV grid with x_mm, y_mm and bz_t. Add gap_mm to compare several measured or simulated gaps.'));
    const s = settings('motorFieldMap', { rpm: c.rpm, current: c.current, advance: 0, filename: '', planes: null });
    const f = form();
    enter(f, s, [['rpm', 'Field map speed (rpm)', 0, 300000], ['current', 'Peak winding current (A)', 0, 1000], ['advance', 'Electrical advance from best alignment (°)', -360, 360]]);
    const input = el('input', { type: 'file', accept: '.csv,text/csv', 'aria-label': 'Import motor field map CSV' });
    const description = el('span', { role: 'status', class: 'hint' });
    let importId = 0;
    const setDescription = () => {
      description.textContent = s.planes ? s.filename + ' · ' + s.planes.length + ' field plane' + (s.planes.length === 1 ? '' : 's') : 'No field map loaded.';
      clear.disabled = !s.planes;
      calculate.disabled = !s.planes;
    };
    const clear = button('Remove field map', () => {
      importId++;
      s.planes = null; s.filename = ''; input.value = '';
      changed(); out.replaceChildren(); pruneViews(); setDescription();
    });
    body.append(el('div', { class: 'tools-form' }, el('label', { class: 'tools-field' }, 'Field map CSV', input), description), clear);
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      const id = ++importId;
      try {
        if (file.size > 1500000) throw new Error('Choose a field map CSV under 1.5 MB.');
        const text = await file.text();
        if (id !== importId || !input.isConnected) return;
        s.planes = parseMotorFieldMap(text);
        s.filename = file.name;
        changed(); out.replaceChildren(); pruneViews();
        status.textContent = 'Field map loaded.';
      } catch (error) { if (id === importId && input.isConnected) status.textContent = error.message; }
      input.value = '';
      setDescription();
    });
    const calculate = runButton('Analyze field map', () => {
      out.replaceChildren();
      const { advance, current, rpm } = s;
      run('motorFieldMap', { cfg: c, settings: { advance, current, rpm }, planes: s.planes, env: host.environment() }, planes => {
        const details = el('div', { class: 'tools-results' });
        const draw = plane => {
          details.replaceChildren();
          const phase = plane.peakEmf.map((_, i) => ({ name: 'Winding ' + phaseName(i), values: plane.points.map(point => point.emf[i]) }));
          const angles = plane.points.map(point => point.angle);
          plot(details, angles, phase, 'V', 'Open-circuit winding back-EMF', 'Mechanical angle (°)');
          plot(details, angles, [{ name: 'Rotor torque', values: plane.points.map(point => point.torque * 1000) }], 'mN·m', 'Torque with sinusoidal drive', 'Mechanical angle (°)');
          details.append(specTable([
            ['Mean torque', eng(plane.meanTorque, 'N·m')], ['Torque ripple peak-to-peak', eng(plane.ripple, 'N·m')],
            ['Ripple relative to mean', plane.ripplePercent == null ? 'Mean torque is zero' : num(plane.ripplePercent, 2) + '%'],
            ['Peak back-EMF by winding', plane.peakEmf.map(value => eng(value, 'V')).join(' / ')],
          ]));
        };
        if (planes.length > 1) {
          const choose = el('select', { 'aria-label': 'Field-map air gap' },
            planes.map((plane, i) => el('option', { value: i, text: plane.gap + ' mm' })));
          choose.addEventListener('change', () => draw(planes[Number(choose.value)]));
          out.append(el('label', { class: 'tools-field' }, 'View air gap', choose));
          plot(out, planes.map(plane => plane.gap), [
            { name: 'Mean torque', values: planes.map(plane => plane.meanTorque * 1000) },
            { name: 'Peak-to-peak torque ripple', values: planes.map(plane => plane.ripple * 1000) },
          ], 'mN·m', 'Torque sensitivity to air gap', 'Air gap (mm)');
          out.append(specTable(planes.map(plane => [
            'Peak back-EMF at ' + plane.gap + ' mm', plane.peakEmf.map(value => eng(value, 'V')).join(' / '),
          ])));
        }
        out.append(details); draw(planes[0]);
        out.append(note(host.result().wave
          ? 'The field model integrates the active radial wave winding. One Bz plane applies to all layers. Outer routing and external returns are outside the modeled field.'
          : 'The model uses generated coil copper, leads and layer transitions. One Bz plane applies to all layers. Phase routing collars, external returns, induced circulating currents, and mechanical losses are excluded.'));
        exportReport(out, 'motor-field-map', { speed: rpm, current, advance, planes });
      });
    });
    const out = output();
    setDescription();
  }

  function motionMaps() {
    const c = config(), family = c.motorFamily ?? 'rotary', model = host.result().familyAnalysis, build = host.result().construction;
    const definitions = {
      stepper: [['vdc', 'Stepper DC bus voltage (V)', 0.1, 1000], ['drop', 'H-bridge voltage drop (V)', 0, 50],
        ['current', 'Stepper peak phase current limit (A)', 0, 100], ['rpmMax', 'Maximum sweep speed (rpm)', 1, 300000]],
      linear: [['current', 'Linear peak phase current limit (A)', 0, 100], ['target', 'Thrust target (N)', 0, 1000],
        ['magnetLength', 'Magnet pattern length (mm, 0 for full coverage)', 0, 10000]],
      planar: [['current', build ? 'Peak current limit per winding (A)' : 'Bipolar current limit per coil (A)', 0, 100], ['forceX', 'Target force X (N)', -1000, 1000],
        ['forceY', 'Target force Y (N)', -1000, 1000]],
    };
    if (!definitions[family] || !model) { body.append(note('Select a stepper, linear or two-axis planar motor to open its performance map.')); return; }
    const descriptions = {
      stepper: 'Estimated synchronized sinusoidal torque using winding R/L, reciprocal back-EMF, bridge voltage and phase-current limits. Rotor inertia, resonance and missed steps are outside the model.',
      linear: 'Current-limited thrust with active commutation along the configured stroke. A finite magnet length applies a sharp field edge. Fringing, speed and the drive voltage are outside the model.',
      planar: 'Solve for a force vector at each X/Y position using the prescribed magnet field and independent bipolar coil drivers. Each cell shows whether the requested force can be reached within the coil-current limit.',
    };
    body.append(note(build ? build.title + ' · ' + build.limits : descriptions[family]));
    if (build?.needsCalibration) body.append(note('Enter the measured force per amp in the main workspace for each axis you want to evaluate.'));
    if (build?.needsCalibration && !c.planarForceX && !c.planarForceY) return;
    const s = settings('motorMotion-' + family + (build ? '-' + build.mode + (build.details.voice ? '-voice' : '') : ''), family === 'stepper' ? {
      vdc: c.vdc, drop: 0, current: c.current, rpmMax: Math.max(100, c.rpm),
    } : family === 'linear' ? { current: c.current, magnetLength: 0, target: Math.abs(model.force) }
      : { current: c.current, forceX: model.fx, forceY: model.fy });
    enter(form(), s, definitions[family]);
    runButton('Calculate motion map', () => {
      out.replaceChildren();
      const request = { ...s };
      run('motorMotion', { cfg: c, settings: request, env: host.environment() }, result => {
        if (family === 'stepper') {
          const rpm = result.map(point => point.rpm);
          plot(out, rpm, [{ name: 'Synchronized torque', values: result.map(point => 1000 * point.torque) }], 'mN·m', 'Stepper torque versus speed', 'Speed (rpm)');
          plot(out, rpm, [{ name: 'Peak phase current', values: result.map(point => point.current) }], 'A', 'Current available at speed', 'Speed (rpm)');
        } else if (family === 'linear') {
          plot(out, result.points.map(point => point.position), [
            { name: 'Available thrust magnitude', values: result.points.map(point => point.maximum) },
            { name: 'Thrust target', values: result.points.map(() => request.target), dash: [4, 4] },
          ], 'N', 'Thrust across the stroke', 'Travel position (mm)');
          out.append(specTable([
            ['Lowest available thrust', fmtForce(result.minimumThrust)],
            ['Sampled positions meeting target', num(result.reachableFraction * 100, 1) + '%'],
            ['Magnet pattern used / length for full coverage', num(result.magnetLength, 1) + ' / ' + num(result.minimumMagnetLength, 1) + ' mm'],
          ]));
        } else {
          out.append(note(num(100 * result.reachableFraction, 1) + '% of sampled positions reach the target. Select a cell to see its force and currents.'));
          drawPlanar(out, result);
        }
        exportReport(out, 'motor-' + family + '-map', { settings: request, result });
      });
    });
    const out = output();
  }

  return { motorSizing, fieldMap, motionMaps };
}

function drawPlanar(parent, map) {
  const info = el('div', { class: 'tools-results', 'aria-live': 'polite' });
  const table = el('table', { class: 'motor-force-grid', 'aria-label': 'Planar force reachability by X and Y position' });
  const positions = map.positions.map(p => num(p, 1)), cells = [];
  table.append(el('thead', {}, el('tr', {}, el('th', { text: 'Y / X (mm)' }), ...positions.map(text => el('th', { scope: 'col', text })))));
  const rows = el('tbody');
  const show = p => info.replaceChildren(specTable([
    ['Position X / Y', num(p.x, 2) + ' / ' + num(p.y, 2) + ' mm'],
    ['Target', p.reachable ? 'Reached' : 'Outside the drive limits'],
    ['Achieved Fx / Fy', p.force.map(fmtForce).join(' / ')],
    ['Force error', fmtForce(p.error)], ['Winding loss', p.copperLoss == null ? 'Enter measured resistance' : eng(p.copperLoss, 'W')],
    ['Coil currents', p.currents.map((value, i) => (map.channelNames?.[i] ?? 'C' + (i + 1)) + ' ' + num(value, 3) + ' A').join(' · ')],
  ]));
  let active = null;
  const choose = (cell, point, focus) => {
    if (active) { active.tabIndex = -1; active.setAttribute('aria-pressed', 'false'); }
    active = cell; cell.tabIndex = 0; cell.setAttribute('aria-pressed', 'true');
    if (focus) cell.focus();
    show(point);
  };
  for (let y = map.size - 1; y >= 0; y--) {
    const row = el('tr', {}, el('th', { scope: 'row', text: positions[y] }));
    for (let x = 0; x < map.size; x++) {
      const index = y * map.size + x, p = map.points[index];
      const label = 'X ' + positions[x] + ', Y ' + positions[y] + ' mm · ' + (p.reachable ? 'reachable' : fmtForce(p.error) + ' force error');
      const b = el('button', { type: 'button', title: label, 'aria-label': label, 'aria-pressed': 'false',
        class: p.reachable ? 'reachable' : 'unreachable', text: p.reachable ? '✓' : '·',
        tabindex: index === Math.floor(map.points.length / 2) ? 0 : -1 });
      b.addEventListener('click', () => choose(b, p, false));
      b.addEventListener('keydown', event => {
        const moves = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
        if (!Object.hasOwn(moves, event.key)) return;
        event.preventDefault();
        const [dx, dy] = moves[event.key], tx = x + dx, ty = y + dy;
        if (tx >= 0 && tx < map.size && ty >= 0 && ty < map.size) {
          const next = ty * map.size + tx;
          choose(cells[next], map.points[next], true);
        }
      });
      cells[index] = b;
      row.append(el('td', {}, b));
    }
    rows.append(row);
  }
  table.append(rows);
  active = cells[Math.floor(map.points.length / 2)];
  active.setAttribute('aria-pressed', 'true');
  parent.append(el('div', { class: 'motor-force-scroll' }, table), info);
  show(map.points[Math.floor(map.points.length / 2)]);
}
