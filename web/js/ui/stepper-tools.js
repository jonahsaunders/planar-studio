import { el, eng, num, specTable } from './controls.js';
import { parseStepperTorque, stepperCalibrationKey, stepperCurrentCsv } from '../engine/stepper-drive.js';
import { saveFile } from '../bridge.js';

export function stepperStudies(api) {
  const { body, config, host, settings, field, select, form, button, runButton, run, output, note, chart, status,
    exportReport, changed, pruneViews } = api;
  const enter = (parent, state, fields) => fields.forEach(args => field(parent, state, ...args));
  const plot = (parent, x, series, unit, title, axis) => chart(parent, x, series, unit, false, title, axis);
  const series = (name, rows, value) => ({ name, values: rows.map(value) });
  const measuredFor = c => c.tools?.stepperCalibration?.measured;

  function loadedMove() {
    const c = config();
    const routingError = host.result()?.art.meta.routingError;
    if (routingError) { body.append(note(routingError)); return; }
    body.append(note('Simulate a rest-to-rest move with acceleration and deceleration. Positive move angles follow the stator preview. Positive load opposes the move and remains applied while the rotor settles.'));
    const s = settings('stepperMove', {
      distance: 180, speed: 360, acceleration: 1000, inertia: 0.00001, damping: 0.0005, load: 0,
      current: Math.max(0.01, c.current), vdc: c.vdc, drop: 0, response: 0.001, observe: 0.5, model: 'ideal',
    });
    const inputs = form(), measured = measuredFor(c);
    enter(inputs, s, [
      ['distance', 'Move distance (°)', -36000, 36000], ['speed', 'Maximum speed (°/s)', 0.1, 200000],
      ['acceleration', 'Acceleration (°/s²)', 0.1, 1000000], ['inertia', 'Rotor and load inertia (kg·m²)', 1e-10, 10],
      ['damping', 'Viscous damping (N·m·s/rad)', 0, 10], ['load', 'Load torque (N·m)', -100, 100],
      ['current', 'Peak phase current command (A)', 0.001, 100], ['vdc', 'DC bus voltage (V)', 0.1, 1000],
      ['drop', 'H-bridge voltage drop (V)', 0, 100], ['response', 'Current loop response time (s)', 0.00001, 0.5],
      ['observe', 'Observation after move (s)', 0.05, 30],
    ]);
    const currentMeasurement = measured && measured.geometry === stepperCalibrationKey(c);
    if (currentMeasurement) select(inputs, s, 'model', 'Torque model and drive', [
      ['ideal', 'Sinusoidal axial field'],
      ['measured', 'Measured phase torque, nominal currents'],
      ['corrected', 'Measured phase torque, corrected currents'],
    ]);
    else if (measured) body.append(note('The saved phase torque data belongs to an earlier winding or field. Import new measurements to use them in this simulation.'));
    runButton('Simulate loaded move', () => {
      out.replaceChildren();
      pruneViews();
      const input = { ...s, model: currentMeasurement ? s.model : 'ideal' };
      run('stepperMove', { cfg: c, env: host.environment(), settings: input, measured: input.model === 'ideal' ? null : measured }, result => {
        const time = result.points.map(point => point.time);
        out.append(specTable([
          ['Torque model', result.source], ['Quantized move', num(result.commandedDistance, 3) + '°'],
          ['Move duration', eng(result.moveTime, 's')], ['Peak tracking error', num(result.peakError, 3) + '°'],
          ['Final position error', num(result.finalError, 3) + '°'],
          ['Settling after command', result.settlingTime === null ? 'Outside observation window or persistent position error' : eng(result.settlingTime, 's')],
          ['Loss of synchronism indicator', result.riskTime === null ? 'No sustained full-step error' : 'Sustained full-step error detected at ' + eng(result.riskTime, 's')],
          ['Time at bridge voltage limit', num(result.voltageFraction * 100, 1) + '%'],
          ['Simulated peak phase current', eng(result.peakCurrent, 'A')],
        ]));
        plot(out, time, [
          series('Commanded', result.points, p => p.commanded), series('Rotor', result.points, p => p.actual),
        ], '°', 'Commanded and actual rotor angle', 'Time (s)');
        plot(out, time, [
          series('A', result.points, p => p.currents[0]), series('B', result.points, p => p.currents[1]),
        ], 'A', 'Phase currents', 'Time (s)');
        out.append(note('Settling requires position within half a command increment and near-zero speed. The synchronism indicator flags a full-step error sustained for ' + eng(result.riskWindow, 's') + '.'));
        out.append(note('The model uses averaged bridge voltage, phase resistance and inductance, reciprocal back-EMF and one rotor inertia.'));
        exportReport(out, 'stepper-loaded-move', { settings: input, ...result });
      });
    });
    const out = output();
  }

  function microstepCalibration() {
    const c = config(), signature = stepperCalibrationKey(c);
    const routingError = host.result()?.art.meta.routingError;
    if (routingError) { body.append(note(routingError)); return; }
    body.append(note('Measure signed torque against mechanical angle for one electrical cycle at a fixed positive current, first driving A alone, then B alone. Use the preview’s rotor zero and A+/B+ current directions. Enter detent-subtracted phase torque and optionally the separately measured no-current detent torque.'));
    body.append(note('CSV columns are angle_deg, torque_a_nm, torque_b_nm and optional detent_nm. Angles span 0 to ' + num(360 / c.stepperPolePairs, 3) + '°, with samples across the entire cycle.'));
    const s = settings('stepperCalibration', { reference: 1, current: Math.max(0.01, c.current), load: 0, filename: '', measured: null });
    enter(form(), s, [
      ['reference', 'Measurement phase current (A)', 0.001, 100], ['current', 'Calibration peak current limit (A)', 0.001, 100],
      ['load', 'Static load torque (N·m, positive resists increasing angle)', -100, 100],
    ]);
    const importInput = el('input', { type: 'file', accept: '.csv,text/csv', 'aria-label': 'Import stepper torque CSV' });
    const description = el('span', { role: 'status', class: 'hint' });
    let importId = 0;
    const syncDescription = () => {
      description.textContent = s.measured ? s.filename + ' · ' + s.measured.samples.length + ' samples · ' +
        eng(s.measured.referenceCurrent, 'A') + (s.measured.geometry === signature ? '' : ' · Winding or field changed') : 'No phase torque data loaded.';
      remove.disabled = !s.measured;
      calculate.disabled = s.measured?.geometry !== signature;
    };
    const clear = () => { changed(); out.replaceChildren(); pruneViews(); syncDescription(); };
    const remove = button('Remove torque data', () => {
      importId++;
      s.measured = null;
      s.filename = '';
      clear();
    });
    body.append(el('div', { class: 'tools-form' }, el('label', { class: 'tools-field' }, 'Phase torque CSV', importInput), description), remove);
    importInput.addEventListener('change', async () => {
      const file = importInput.files[0];
      if (!file) return;
      const id = ++importId, reference = s.reference;
      try {
        if (file.size > 500000) throw new Error('Choose a phase torque CSV under 500 KB.');
        const text = await file.text();
        if (id !== importId || !importInput.isConnected) return;
        s.measured = parseStepperTorque(text, c, reference);
        s.filename = file.name;
        clear();
        status.textContent = 'Phase torque data loaded.';
      } catch (error) {
        if (id === importId && importInput.isConnected) status.textContent = error.message;
      } finally {
        if (id === importId) importInput.value = '';
      }
    });
    const calculate = runButton('Calculate corrected currents', () => {
      if (s.measured?.geometry !== signature) return;
      out.replaceChildren();
      pruneViews();
      run('stepperCalibration', { cfg: c, env: host.environment(), measured: s.measured, settings: { current: s.current, load: s.load } }, result => {
        const { rows } = result;
        const formatAngle = value => value === null ? '—' : num(value, 3) + '°';
        out.append(specTable([
          ['Nominal commands with a stable position', result.stable + ' / ' + rows.length],
          ['Worst nominal angle error', formatAngle(result.maximumError)],
          ['Commands with a stable current correction', result.reachable + ' / ' + rows.length],
        ]));
        if (result.stable) plot(out, rows.map(row => row.step), [series('Nominal error', rows, row => row.error ?? NaN)],
          '°', 'Nominal microstep angle error', 'Command index');
        const details = el('details', {}, el('summary', { text: 'Corrected current table' }));
        const table = el('table', { class: 'spec-table', 'aria-label': 'Corrected microstep currents' });
        table.append(el('thead', {}, el('tr', {}, ...['Command', 'Target', 'Nominal error', 'A (A)', 'B (A)'].map(text => el('th', { scope: 'col', text })))));
        const cells = rows.map(row => el('tr', {}, el('th', { scope: 'row', text: String(row.step) }),
          ...[formatAngle(row.target), formatAngle(row.error), ...(row.corrected ? row.corrected.map(i => num(i, 4)) : ['—', '—'])]
            .map(text => el('td', { text }))));
        table.append(el('tbody', {}, ...cells));
        out.append(details);
        details.append(table);
        out.append(note('The corrected currents target evenly spaced static positions at the entered load. Blank current pairs indicate a position outside the current or restoring torque limits.'));
        out.append(button('Export current table CSV', async () => {
          try {
            await saveFile('stepper-microstep-currents.csv', stepperCurrentCsv(result), 'text/csv');
            status.textContent = 'Current table exported.';
          } catch (error) { status.textContent = error.message; }
        }));
        exportReport(out, 'stepper-calibration', result);
      });
    });
    const out = output();
    syncDescription();
  }

  return { loadedMove, microstepCalibration };
}
