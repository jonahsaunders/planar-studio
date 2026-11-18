/* Design Tools: explicitly run studies, inspect results, then apply a candidate.
   Workers are terminated on Cancel, tab change, or close. Settings and imported
   measurements live in the normal design JSON; board snapshots stay transient. */
import { el, eng, num, specTable } from './controls.js';
import { mountModal } from './modal-focus.js';
import { LineChart, legendFor } from './charts.js';
import { Viewport } from './canvas.js';
import { artwork, track, bounds } from '../engine/artwork.js';
import { parseMeasurement, measurementValues, interpolate } from '../engine/measurements.js';
import { makeMeasurementRecord, measurementConfiguration, measurementSignature, hasStaleFit, readCouponMeasurement } from '../engine/measurement-records.js';
import { DISTRIBUTED, plain } from '../engine/filtertune.js';
import { windingPolys, transformPolys, rotorDesign } from '../engine/magnetics.js';
import { lineCurrentFactor, motorEnvelope } from '../engine/motor-envelope.js';
import { motorStudies } from './motor-design-tools.js';
import { extractedHairpin, hairpinFixtures } from '../engine/hairpin-fixtures.js';
import { zipTextFiles } from '../engine/zip-text.js';
import * as bridge from '../bridge.js';

const TABS = [['optimize', 'Optimize'], ['measurements', 'Measurements'], ['coupling', 'Coupled coils'], ['tolerance', 'Tolerances'], ['tune', 'Filter tuning'], ['field', 'Magnetic field'], ['board', 'Board checks'], ['rotor', 'Rotor']];
const MOTOR_TABS = [['motorSizing', 'Motor sizing'], ['fieldMap', 'Field map'], ['motionMaps', 'Motion maps']];
const button = (text, fn, primary = false) => el('button', { class: `btn${primary ? ' primary' : ''}`, type: 'button', text, onClick: fn });
const note = (text) => el('p', { class: 'hint', text });

export function openDesignTools(host, initial = 'optimize') {
  const scrim = el('div', { class: 'scrim tools-scrim' });
  const title = el('h2', { id: 'tools-title', text: 'Design tools', tabindex: -1 });
  const body = el('div', { class: 'tools-content' });
  const nav = el('nav', { class: 'tools-tabs', 'aria-label': 'Design tools' });
  const status = el('div', { class: 'tools-status', role: 'status', 'aria-live': 'polite', text: 'Choose a study.' });
  const cancel = button('Cancel calculation', () => stop('Calculation canceled.')); cancel.hidden = true;
  const dialog = el('div', { class: 'modal tools-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'tools-title', tabindex: '-1' },
    el('header', {}, title, el('span', { class: 'spacer' }), button('Close', () => close())), nav, body,
    el('footer', {}, status, cancel));
  scrim.append(dialog);
  let active = initial, worker = null, job = 0, disposed = false, cleanups = [], boardText = '', excluded = [], boardSource = '';
  const config = () => host.config();
  const analysisConfig = () => host.analysisConfig?.() || config();
  const kind = () => host.kind();
  const settings = (id, defaults) => {
    config().tools ||= {};
    config().tools[id] = { ...defaults, ...config().tools[id] };
    return config().tools[id];
  };
  function stop(message = '') {
    job++; worker?.terminate(); worker = null; cancel.hidden = true;
    body.querySelectorAll('[data-run]').forEach((b) => { b.disabled = false; });
    if (message) status.textContent = message;
  }
  function clearViews() { for (const dispose of cleanups) dispose(); cleanups = []; }
  function pruneViews() {
    cleanups = cleanups.filter((dispose) => {
      if (dispose.element && !dispose.element.isConnected) { dispose(); return false; }
      return true;
    });
  }
  const close = mountModal(scrim, dialog, { initial: title, onClose: () => {
    disposed = true;
    stop();
    clearViews();
  } });
  scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(); });
  function changed() {
    host.dirty();
    if (worker) stop('Settings changed; run the calculation again.');
    else if (body.querySelector('.tools-results')?.children.length) status.textContent = 'Settings changed; displayed results are from the previous calculation.';
  }
  function field(parent, state, key, label, min, max, step = 'any', type = 'number') {
    const input = el('input', { type, value: state[key], min, max, step, 'aria-label': label });
    input.addEventListener('change', () => {
      const numeric = type === 'number' || type === 'range';
      const value = numeric ? Number(input.value) : input.value;
      if (numeric && (!input.value || !Number.isFinite(value) || (min != null && value < min) || (max != null && value > max))) {
        input.value = state[key]; status.textContent = `${label}: enter a value${min != null ? ` ≥ ${min}` : ''}${max != null ? ` and ≤ ${max}` : ''}.`; return;
      }
      state[key] = value; changed();
    });
    parent.append(el('label', { class: 'tools-field' }, el('span', { text: label }), input));
    return input;
  }
  function select(parent, state, key, label, options) {
    const input = el('select', { 'aria-label': label }, options.map(([value, text]) => el('option', { value, text })));
    input.value = state[key]; input.addEventListener('change', () => { state[key] = input.value; changed(); });
    parent.append(el('label', { class: 'tools-field' }, el('span', { text: label }), input)); return input;
  }
  function form() { const f = el('div', { class: 'tools-form' }); body.append(f); return f; }
  function output() { const o = el('div', { class: 'tools-results' }); body.append(o); return o; }
  function runButton(text, fn, parent = body) { const b = button(text, fn, true); b.dataset.run = 'true'; parent.append(b); return b; }
  async function run(task, args, done) {
    stop(); const token = job; status.textContent = 'Calculating…'; cancel.hidden = false;
    body.querySelectorAll('[data-run]').forEach((b) => { b.disabled = true; });
    worker = new Worker(new URL('../study-worker.js', import.meta.url), { type: 'module' });
    worker.onerror = (e) => { if (token === job) stop(`Calculation failed: ${e.message}`); };
    worker.onmessage = ({ data }) => {
      if (token !== job || disposed) return;
      if (data.progress) { const p = data.progress; status.textContent = `${p.done}/${p.total} · ${p.message || ''}`; return; }
      stop();
      if (data.error) { status.textContent = data.error; return; }
      status.textContent = 'Calculation complete.';
      try { done(data.result); } catch (e) { status.textContent = e.message; }
    };
    worker.postMessage({ task, args: plain(args) });
  }
  function exportReport(parent, name, result) {
    const savedConfig = plain(config()), savedKind = kind();
    parent.append(button('Export study JSON', async () => {
      try { await bridge.saveFile(`${name}-study.json`, JSON.stringify({ schema: 1, kind: savedKind, config: savedConfig, result }, null, 2), 'application/json'); status.textContent = 'Study exported.'; }
      catch (e) { status.textContent = e.message; }
    }));
  }
  function chart(parent, x, series, label, log = true, heading = '', xLabel = log ? 'Hz' : 'x') {
    pruneViews();
    const c = el('canvas', { class: 'chart tools-chart', 'aria-label': heading || label, role: 'img' }), legend = el('div', { class: 'chart-legend' });
    if (heading) parent.append(el('h3', { text: heading }));
    parent.append(c, legend);
    const plot = new LineChart(c, { x: { values: x, log, label: xLabel }, y: { label }, series, directLabels: false });
    plot.draw(); legendFor(series, legend);
    const dispose = () => plot.destroy(); dispose.element = c; cleanups.push(dispose); return plot;
  }
  function view(parent, art, layers = [['F.Cu', '#dd8150'], ['B.Cu', '#59aeee']]) {
    pruneViews();
    const wrap = el('div', { class: 'tools-view' }), c = el('canvas', { 'aria-label': 'Geometry preview', role: 'img' });
    wrap.append(c); parent.append(wrap);
    const viewport = new Viewport(c, { onHandleDrag: (handle, x, y) => handle.drag?.(x, y) }); viewport.show.labels = false;
    viewport.setArtwork(art, layers); viewport.fit(bounds(art));
    const dispose = () => viewport.destroy(); dispose.element = c; cleanups.push(dispose); return viewport;
  }
  function requireKind(wanted, text) {
    if (kind() === wanted) return true;
    body.append(note(text), button(`Open ${wanted === 'motor' ? 'PCB motor' : wanted}`, () => { close(); host.switch(wanted, active); })); return false;
  }
  function requireDistributed() {
    if (!requireKind('filter', 'Choose a distributed filter to tune or study its physical copper.')) return false;
    if (DISTRIBUTED.includes(config().family)) return true;
    body.append(note('Fixed-copper tuning and material studies support stepped, edge-coupled, hairpin, and interdigital filters.'), button('Use hairpin filter', () => { host.apply({ family: 'hairpin', band: 'bandpass' }); render(active); })); return false;
  }
  function maskEditor(parent, s) {
    s.mask ||= kind() === 'filter' && config().family === 'stepped'
      ? [{ from: config().fc * 0.2, to: config().fc * 0.8, min: -3, max: 1 }, { from: config().fc * 2, to: config().fc * 3, min: -150, max: -20 }]
      : [{ from: config().f1, to: config().f2, min: -6, max: 1 }];
    const box = el('div', { class: 'tools-mask' }); parent.append(el('h3', { text: 'Response mask · S21 in dB' }), box);
    const draw = () => {
      box.replaceChildren();
      s.mask.forEach((b, i) => {
        const row = el('div', { class: 'tools-form' });
        field(row, b, 'from', `Band ${i + 1} from (Hz)`, 1); field(row, b, 'to', `Band ${i + 1} to (Hz)`, 1);
        field(row, b, 'min', `Band ${i + 1} minimum (dB)`, -300, 100); field(row, b, 'max', `Band ${i + 1} maximum (dB)`, -300, 100);
        row.append(button('Remove band', () => { s.mask.splice(i, 1); changed(); draw(); })); box.append(row);
      });
      box.append(button('Add band', () => { s.mask.push({ from: config().f1 || config().fc, to: config().f2 || config().fc * 2, min: -100, max: -20 }); changed(); draw(); }));
    }; draw();
  }
  function optimize() {
    if (!requireKind('inductor', 'The optimizer searches standalone coil geometry.')) return;
    if(config().obstacleEnabled){body.append(note('Use Design around obstacles in the main parameter rail to size this winding. The diameter optimizer does not support constrained contours.'));return;}
    body.append(note('Search whole turns and diameter across three trace widths, three gaps, and your chosen layer counts. Candidates must fit including terminals, meet the inductance tolerance, and stay below self-resonance. This bounded search does not guarantee a global optimum.'));
    const c = config(), s = settings('optimize', { target: host.result()?.analysis?.L * 1e6 || 10, maxWidth: 30, maxHeight: 30, frequency: c.freq, minWidth: 0.2, maxTrace: 0.6, minGap: 0.15, maxGap: 0.35, layerList: `${c.layers}`, errorPct: 3, srfMargin: 3 });
    const trackFloor = c.fabricationProfile?.minTrace || 0.02, gapFloor = c.fabricationProfile?.minGap || 0.02;
    s.minWidth = Math.max(s.minWidth, trackFloor); s.maxTrace = Math.max(s.maxTrace, s.minWidth);
    s.minGap = Math.max(s.minGap, gapFloor); s.maxGap = Math.max(s.maxGap, s.minGap);
    if (c.fabricationProfile) body.append(note(`Fabrication limits from ${c.fabricationProfile.name} apply to the search.`));
    const f = form();
    field(f, s, 'target', 'Target inductance (µH)', 0.0001); field(f, s, 'frequency', 'Operating frequency (Hz)', 1);
    field(f, s, 'maxWidth', 'Maximum width (mm)', 1); field(f, s, 'maxHeight', 'Maximum height (mm)', 1);
    field(f, s, 'minWidth', 'Minimum trace width (mm)', trackFloor); field(f, s, 'maxTrace', 'Maximum trace width (mm)', trackFloor);
    field(f, s, 'minGap', 'Minimum gap (mm)', gapFloor); field(f, s, 'maxGap', 'Maximum gap (mm)', gapFloor);
    field(f, s, 'layerList', 'Layer counts, comma separated', null, null, 'any', 'text');
    field(f, s, 'errorPct', 'Inductance tolerance (%)', 0.1, 30); field(f, s, 'srfMargin', 'Minimum SRF / operating frequency', 1);
    const out = output();
    runButton('Find designs', () => {
      const layers = s.layerList.split(',').map(Number), available = bridge.state.context?.layerCount;
      if (available && layers.some((n) => n > available)) { status.textContent = `The open board has only ${available} copper layers.`; return; }
      run('optimize', { cfg: c, opt: { ...s, targetL: s.target * 1e-6, layers } }, (r) => {
        clearViews(); out.replaceChildren();
        out.append(el('h3', { text: `${r.candidates.length} feasible designs · ${r.evaluated} combinations` }));
        if (!r.candidates.length) { out.append(note('No feasible design met these bounds. Increase the available area or layers, widen the trace/gap search, or relax the target.')); return; }
        const cards = el('div', { class: 'tools-candidates' }); out.append(cards);
        const picks = [['Highest Q', r.candidates[0]], ['Smallest area', [...r.candidates].sort((a, b) => a.area - b.area)[0]], ['Lowest resistance', [...r.candidates].sort((a, b) => a.Rdc - b.Rdc)[0]]];
        const preview = el('div'); out.append(preview);
        for (const [name, p] of picks) {
          const card = el('div', { class: 'tools-card' }, el('h3', { text: name }), specTable([['L / Q', `${eng(p.L, 'H')} / ${num(p.Q, 1)}`], ['Width × height', `${num(p.width, 1)} × ${num(p.height, 1)} mm`], ['Rdc', eng(p.Rdc, 'Ω')], ['Turns / layers', `${p.config.turns} / ${p.config.layers}`]]));
          card.append(button('Preview', () => { preview.replaceChildren(); view(preview, p.art); }), button('Apply design', () => { host.apply(p.config); status.textContent = 'Candidate applied. Save the design to keep it.'; })); cards.append(card);
        }
        view(preview, r.candidates[0].art);
        if (r.pareto.length > 1) chart(out, r.pareto.map((p, i) => i + 1), [{ name: 'Q', values: r.pareto.map((p) => p.Q) }], 'Q', false, 'Nondominated designs, ordered by area');
        out.append(specTable(r.pareto.map((p, i) => [`Tradeoff ${i + 1}`, `${num(p.area, 1)} mm² · ${eng(p.Rdc, 'Ω')} · Q ${num(p.Q, 1)}`])));
        exportReport(out, 'optimizer', r);
      });
    });
  }
  function measurements() {
    if (kind() === 'motor') { body.append(note('Measurement overlays compare a standalone coil or filter. Motor phase impedance includes the phase interconnect.'), button('Open inductor', () => { close(); host.switch('inductor', active); })); return; }
    const recordMode = ['inductor', 'filter'].includes(kind());
    body.append(note('Import Touchstone 1.x or a CSV with frequency and impedance or scattering data. To import a coupon record, select its JSON and sweep together.'));
    const conditions = settings('measurementConditions', { prototype: '', fixture: '', referencePlane: '', measuredOn: '' });
    if (recordMode) {
      const metadata = el('div', { class: 'tools-form' });
      for (const [key, label] of [['prototype', 'Prototype'], ['fixture', 'Fixture or calibration'], ['referencePlane', 'Measurement reference plane']]) {
        field(metadata, conditions, key, label, null, null, 'any', 'text');
      }
      field(metadata, conditions, 'measuredOn', 'Measurement date', null, null, undefined, 'date');
      body.append(el('details', { class: 'measurement-details' }, el('summary', { text: 'Measurement details' }), metadata));
    }
    const file = el('input', { type: 'file', multiple: true, accept: '.s1p,.s2p,.csv,.tsv,.json', 'aria-label': 'Measurement file' });
    const drop = el('label', { class: 'tools-drop' }, el('span', { text: 'Choose or drop measurement files' }), file); body.append(drop);
    async function load(files) {
      if (!files?.length) return;
      const ws = kind(), destination = host.designId?.();
      const inputConfig = measurementConfiguration(analysisConfig());
      const inputConditions = { ...conditions };
      try {
        const manifest = [...files].find(f => /\.json$/i.test(f.name));
        const sweep = [...files].find(f => f !== manifest);
        if (!sweep || files.length !== (manifest ? 2 : 1)) throw new Error('Choose one sweep, or a coupon JSON and its sweep.');
        const raw = await sweep.text();
        if (manifest && ws !== 'inductor') throw new Error('Open the Inductor workspace to import a coupon record.');
        const entry = manifest
          ? readCouponMeasurement(JSON.parse(await manifest.text()), raw, sweep.name, host.defaults?.() || inputConfig)
          : { data: parseMeasurement(raw, sweep.name), configuration: inputConfig, conditions: inputConditions };
        if (disposed || destination !== host.designId?.() || ws !== kind()) return;
        if (recordMode) {
          const result = host.solveMeasurement?.(entry.configuration) || host.result();
          const baseline = ws === 'filter' && result?.response ? { x: result.response.freqs, y: result.response.s21db }
            : result?.sweep ? { x: result.sweep.map(p => p.f), y: result.sweep.map(p => p.Z) } : null;
          const record = makeMeasurementRecord(ws, entry.configuration, entry.data, entry.conditions, baseline);
          const records = [...(config().measurementRecords || [])];
          if (!records.length && config().measurement) records.push(makeMeasurementRecord(ws, null, config().measurement, {}));
          records.push(record);
          host.apply({ measurementRecords: records, activeMeasurementId: record.id, measurement: record.data });
        } else host.apply({ measurement: entry.data, measurementFit: null });
        render('measurements');
        body.querySelector('[aria-label="Saved measurement"]')?.focus();
        status.textContent = `${entry.data.rows.length} measurement points imported.`;
      } catch (e) { status.textContent = e.message; }
    }
    file.addEventListener('change', () => load(file.files));
    drop.addEventListener('dragover', (e) => e.preventDefault()); drop.addEventListener('drop', (e) => { e.preventDefault(); load(e.dataTransfer.files); });
    const records = config().measurementRecords || [];
    const activeRecord = records.find(record => record.id === config().activeMeasurementId);
    function selectRecord(record, nextRecords = records) {
      host.apply({ measurementRecords: nextRecords, activeMeasurementId: record?.id ?? null,
        measurement: record?.data ?? null });
      render('measurements');
      body.querySelector('[aria-label="Saved measurement"]')?.focus();
    }
    if (records.length) {
      const chooser = el('select', { 'aria-label': 'Saved measurement' }, records.map(record => el('option', {
        value: record.id, text: [record.conditions.prototype, record.data.name].filter(Boolean).join(' · '),
      })));
      chooser.value = activeRecord?.id || '';
      chooser.addEventListener('change', () => selectRecord(records.find(record => record.id === chooser.value)));
      body.append(el('label', { class: 'tools-field' }, 'Saved measurement', chooser));
    }
    if (hasStaleFit(config(), analysisConfig())) body.append(note('The measurement fit is out of date for the current design.'));
    const data = config().measurement;
    if (!data) return;
    const metric = kind() === 'filter' ? 's21db' : 'Z', r = host.result();
    const x = kind() === 'filter' ? r?.response?.freqs : r?.sweep?.map((p) => p.f);
    const y = kind() === 'filter' ? r?.response?.s21db : r?.sweep?.map((p) => p.Z);
    body.append(el('h3', { text: `${data.name} · ${data.rows.length} points` }), button('Remove measurement', () => {
      const remaining = records.filter(record => record.id !== activeRecord?.id);
      selectRecord(remaining.at(-1), remaining);
    }));
    if (activeRecord) {
      const { prototype, fixture, referencePlane, measuredOn, role, instrument, stackup } = activeRecord.conditions;
      const details = [['Prototype', prototype], ['Fixture or calibration', fixture], ['Reference plane', referencePlane],
        ['Measurement date', measuredOn], ['Coupon role', role], ['Instrument', instrument], ['Stackup', stackup]].filter(([, value]) => value);
      if (details.length) body.append(specTable(details));
      if (!activeRecord.configuration) body.append(note('This earlier import has no recorded test configuration.'));
      else if (activeRecord.signature !== measurementSignature(analysisConfig())) body.append(note('The current design differs from the tested configuration.'));
      if (activeRecord.configuration && host.restoreMeasurement) body.append(button('Restore tested design', () => {
        host.restoreMeasurement(activeRecord.configuration);
        render('measurements');
        body.querySelector('[aria-label="Saved measurement"]')?.focus();
        status.textContent = 'Tested configuration restored.';
      }));
    }
    if (x && y) {
      const series = [{ name: 'Current design', values: y }, { name: 'Measured', values: measurementValues(data, metric, x), dash: [4, 3] }];
      const baseline = activeRecord?.baseline;
      if (baseline) series.push({ name: 'Tested design baseline', values: x.map(f => interpolate(baseline.x, baseline.y, f)), dash: [2, 4] });
      chart(body, x, series, metric === 'Z' ? '|Z| Ω' : 'S21 dB', true, 'Measured versus simulated');
      if (kind() === 'filter' && data.rows.some((p) => p.s11db != null)) chart(body, x, [{ name: 'Simulated S11', values: r.response.s11db }, { name: 'Measured S11', values: measurementValues(data, 's11db', x), dash: [4, 3] }], 'S11 dB');
      if (!measurementValues(data, metric, x).some(Number.isFinite)) body.append(note(`No ${metric} data overlaps this sweep. Adjust the frequency range or import a matching measurement.`));
    }
    if (kind() === 'filter' && !DISTRIBUTED.includes(config().family)) { body.append(note('Parameter fitting currently supports coils and distributed filters. The imported overlay works for all filter families.')); return; }
    body.append(el('h3', { text: 'Fit selected parameters' }), note('Bounded least-squares fit. A fitted material value can also absorb fixture or model error; it is not a unique material measurement. The original prediction is retained.'));
    const s = settings('fit', { aMin: 2, aMax: 7, bMin: 0, bMax: kind() === 'filter' ? 0.08 : 100, fitA: 'yes', fitB: 'yes' }), f = form();
    const fields = kind() === 'filter' ? [['subEr', 'Dielectric εr'], ['tanD', 'Loss tangent']] : [['epsR', 'Dielectric εr'], ['cExtra', 'Added capacitance (pF)']];
    select(f, s, 'fitA', `Fit ${fields[0][1]}`, [['yes', 'Yes'], ['no', 'Keep fixed']]); field(f, s, 'aMin', `${fields[0][1]} minimum`, 1); field(f, s, 'aMax', `${fields[0][1]} maximum`, 1);
    select(f, s, 'fitB', `Fit ${fields[1][1]}`, [['yes', 'Yes'], ['no', 'Keep fixed']]); field(f, s, 'bMin', `${fields[1][1]} minimum`, 0); field(f, s, 'bMax', `${fields[1][1]} maximum`, 0);
    const out = output(); runButton('Fit measurement', () => {
      const inputSignature = measurementSignature(analysisConfig());
      const recordId = config().activeMeasurementId ?? null;
      const chosen = [];
      if (s.fitA === 'yes') chosen.push({ key: fields[0][0], min: s.aMin, max: s.aMax });
      if (s.fitB === 'yes') chosen.push({ key: fields[1][0], min: s.bMin, max: s.bMax });
      run('fit', { kind: kind(), cfg: analysisConfig(), data, opt: { fields: chosen } }, (fit) => {
        out.replaceChildren();
        chart(out, fit.curve.x, [{ name: 'Original', values: fit.original.y }, { name: 'Fitted', values: fit.curve.y }, { name: 'Measured', values: measurementValues(data, metric, fit.curve.x), dash: [3, 3] }], metric === 'Z' ? '|Z| Ω' : 'S21 dB');
        out.append(specTable([['RMS residual before → after', `${num(Math.sqrt(fit.originalLoss), 4)} → ${num(Math.sqrt(fit.loss), 4)} ${metric === 'Z' ? '(log magnitude)' : 'dB'}`], ...chosen.map((p) => [p.key, String(fit.config[p.key])])]));
        if (fit.boundary.length) out.append(note(`Fit reached a bound: ${fit.boundary.join(', ')}. Inspect residuals before applying.`));
        out.append(button('Apply fitted parameters', () => {
          if (inputSignature !== measurementSignature(analysisConfig()) || recordId !== (config().activeMeasurementId ?? null)) {
            status.textContent = 'The design or measurement changed. Run the fit again.';
            return;
          }
          const patch = Object.fromEntries(chosen.map((p) => [p.key, fit.config[p.key]]));
          if (kind() === 'filter') patch.fixedDesign = plain(host.result().nominal);
          const signature = measurementSignature({ ...analysisConfig(), ...patch });
          host.apply({ ...patch, measurementFit: { recordId, signature, original: fit.original, loss: fit.loss, fields: chosen } }); status.textContent = 'Fitted parameters applied; original curve retained.';
        })); exportReport(out, 'measurement-fit', fit);
      });
    });
  }
  function coupling() {
    if (!requireKind('inductor', 'Use the inductor workspace as the transmitter, then design and position its receiver here.')) return;
    if(config().obstacleEnabled){body.append(note('The receiver editor currently sizes standard coil shapes. Coupled obstacle-contour designs are not supported in this panel.'));return;}
    body.append(note('Air-core Neumann mutual inductance, including winding layers and series vias. Parallel layers assume equal current sharing. The voltage is the open-circuit sinusoidal receiver voltage; load, resonance, ferrite, and shielding are excluded. Drag the receiver in the top view to change offset.'));
    const c = config(), s = settings('coupling', { diameter: c.dOuter, turns: c.turns, layers: c.layers, traceW: c.traceW, traceS: c.traceS, boardT: c.boardT, x: 0, y: 0, z: 5, tilt: 0 });
    const f = form();
    for (const [key, label, min, max] of [['diameter', 'Receiver diameter (mm)', 1, 300], ['turns', 'Receiver turns', 1, 60], ['layers', 'Receiver layers', 1, 16], ['traceW', 'Receiver trace width (mm)', 0.02, 5], ['traceS', 'Receiver clearance (mm)', 0.02, 5], ['boardT', 'Receiver board thickness (mm)', 0.1, 10], ['x', 'Receiver X offset (mm)', -300, 300], ['y', 'Receiver Y offset (mm)', -300, 300], ['z', 'Center-plane separation (mm)', 0.1, 300], ['tilt', 'Receiver tilt (degrees)', -80, 80]]) field(f, s, key, label, min, max, ['turns', 'layers'].includes(key) ? 1 : 'any');
    const preview = el('div'); body.append(preview); let viewport;
    const receiver = () => ({ ...c, dOuter: s.diameter, turns: Math.round(s.turns), layers: Math.round(s.layers), traceW: s.traceW, traceS: s.traceS, boardT: s.boardT });
    function draw() {
      const A = artwork();
      for (const [layer, polys] of [['Tx', windingPolys(c)], ['Rx', transformPolys(windingPolys(receiver()), s)]]) for (const p of polys) A.tracks.push(track(layer, layer === 'Tx' ? c.traceW : s.traceW, p.map(([x, y]) => [x, y])));
      if (!viewport) { viewport = view(preview, A, [['Tx', '#dd8150'], ['Rx', '#59aeee']]); viewport.onHandleDone = () => calculate(); }
      else viewport.setArtwork(A, [['Tx', '#dd8150'], ['Rx', '#59aeee']]);
      viewport.setHandles([{ id: 'receiver', x: s.x, y: s.y, cursor: 'grab', hint: 'Move receiver', drag: (x, y) => { s.x = Math.round(x * 100) / 100; s.y = Math.round(y * 100) / 100; f.querySelector('[aria-label="Receiver X offset (mm)"]').value = s.x; f.querySelector('[aria-label="Receiver Y offset (mm)"]').value = s.y; changed(); draw(); } }]);
    }
    f.addEventListener('change', () => { draw(); viewport.fit(bounds(viewport.art)); }); draw();
    const out = output();
    function calculate() { run('coupling', { cfg: c, rx: receiver(), pose: s, opt: { maxOffset: c.dOuter } }, (r) => {
      out.replaceChildren(specTable([['Mutual inductance M', eng(r.M, 'H')], ['Signed coupling k', num(r.k, 4)], ['Transmitter / receiver L', `${eng(r.L1, 'H')} / ${eng(r.L2, 'H')}`], ['Open-circuit receiver voltage', `${num(r.inducedVrms, 3)} V RMS at ${c.current} A RMS, ${eng(c.freq, 'Hz')}`]]));
      chart(out, r.curve.map((p) => p.x), [{ name: 'k', values: r.curve.map((p) => p.k) }], 'k', false, 'Coupling versus X offset (mm) · Y, separation, tilt fixed'); exportReport(out, 'coupled-coils', r);
    }); }
    runButton('Calculate coupling', calculate);
    body.append(button('Open receiver as inductor', () => { const rx = receiver(); host.apply(rx); close(); }));
  }
  function tolerance() {
    if(config().obstacleEnabled){body.append(note('Fixed-copper tolerance studies are not yet supported for obstacle contours.'));return;}
    if (kind() === 'motor') { body.append(note('Tolerance studies operate on one winding or a distributed filter.'), button('Open inductor', () => { close(); host.switch('inductor', active); })); return; }
    if (kind() === 'filter' && !requireDistributed()) return;
    body.append(note('Independent uniform variations within ± limits, with a repeatable seed. Etch is total width change: centerlines stay fixed and gaps change oppositely. The curves show pointwise 5th–95th percentiles; yield is conditional on these tolerances and the model. Invalid samples count as failures.'));
    const s = settings('tolerance', { samples: 50, seed: 42, etch: 0.025, thickness: 5, copper: 10, er: 5, target: host.result()?.analysis?.L * 1e6 || 10, errorPct: 10, minQ: 1 });
    if (config().fabricationProfile) body.append(note(`Tolerance starting values come from ${config().fabricationProfile.name}.`));
    const f = form(); field(f, s, 'samples', 'Samples', 2, 500, 1); field(f, s, 'seed', 'Random seed', 1, 4294967295, 1);
    field(f, s, 'etch', 'Etch width ± (mm)', 0, 1); field(f, s, 'thickness', 'Dielectric thickness ± (%)', 0, 99); field(f, s, 'copper', 'Copper thickness ± (%)', 0, 99); field(f, s, 'er', 'Dielectric εr ± (%)', 0, 99);
    if (kind() === 'filter') maskEditor(body, s);
    else { field(f, s, 'target', 'Target inductance (µH)', 0.0001); field(f, s, 'errorPct', 'Allowed inductance error (%)', 0.1, 99); field(f, s, 'minQ', 'Minimum Q at operating frequency', 0); }
    const out = output(); runButton('Run tolerance study', () => run('tolerance', { kind: kind(), cfg: analysisConfig(), opt: { ...s, targetL: s.target * 1e-6, ranges: { etch: s.etch, thickness: s.thickness, copper: s.copper, er: s.er } } }, (r) => {
      out.replaceChildren(el('h3', { text: `${num(r.yield * 100, 1)}% estimated yield · ${r.passed}/${r.samples} pass` }), note(`${r.invalid} invalid samples. Seed ${r.seed}. Finite-sample estimate; increase the sample count to assess stability.`));
      chart(out, r.nominal.x, [{ name: 'Nominal', values: r.nominal.y }, { name: '5th percentile', values: r.low, dash: [4, 3] }, { name: '95th percentile', values: r.high, dash: [4, 3] }], kind() === 'filter' ? 'S21 dB' : '|Z| Ω');
      out.append(el('h3', { text: 'Sensitivity ranking' }), note(kind() === 'filter' ? 'RMS response change (dB) from the negative to positive tolerance bound, one parameter at a time.' : 'Inductance change (%) from the negative to positive tolerance bound, one parameter at a time.'), specTable(r.sensitivity.map((p) => [p.key, p.impact == null ? 'Invalid endpoint geometry' : num(p.impact, 3)]))); exportReport(out, 'tolerance', r);
    }));
  }
  function tune() {
    if (!requireDistributed()) return;
    if (config().family === 'hairpin') hairpinHandoff();
    body.append(note('Drag section/resonator ends and gaps on the main canvas. These edits change the generated copper and the response. Automatic tuning searches global length and gap scales from 0.5× to 1.5×; individual handle edits remain in place. It may find no feasible mask.'));
    const s = settings('tune', {}); maskEditor(body, s);
    body.append(button('Return to canvas handles', close), button('Reset geometry tuning', () => { host.apply({ tuning: {}, fixedDesign: null }); status.textContent = 'Original synthesis restored.'; }));
    const out = output(); runButton('Tune to response mask', () => run('tune', { cfg: analysisConfig(), opt: s }, (r) => {
      out.replaceChildren(el('h3', { text: r.passes ? 'Response mask met in this model' : 'Best result still misses the mask' }), note(`Mask penalty ${num(r.originalLoss, 4)} → ${num(r.loss, 4)} dB².`));
      chart(out, r.curve.x, [{ name: 'Before', values: r.original.y }, { name: 'Tuned', values: r.curve.y }], 'S21 dB');
      out.append(specTable([['Length scale', num(r.config.tuning.lengthScale || 1, 4)], ['Gap scale', num(r.config.tuning.gapScale || 1, 4)]]), button('Apply tuning', () => { host.apply({ tuning: r.config.tuning }); status.textContent = 'Tuned geometry applied.'; })); exportReport(out, 'filter-tuning', r);
    }));
  }
  function hairpinHandoff() {
    const section = el('details', {}, el('summary', { text: 'Full-wave simulation fixtures' }));
    const input = el('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Hairpin extraction JSON' });
    section.append(note('Export isolated resonators, adjacent pairs and tapped feeds from the current copper. Solve the fixtures externally, enter the extracted values in the included template, then open the completed JSON here.'),
      button('Export hairpin fixtures', async () => {
        try {
          const { files } = hairpinFixtures(host.result(), host.name());
          await bridge.saveBytes('hairpin-fixtures.zip', zipTextFiles(files));
          status.textContent = 'Hairpin fixtures exported.';
        } catch (error) { status.textContent = error.message; }
      }),
      el('label', { class: 'tools-field' }, 'Open extraction report', input));
    body.append(section);

    const review = host.result();
    if (review.extractionError) {
      section.open = true;
      section.append(note(review.extractionError));
    } else if (review.extractedResponse) {
      section.open = true;
      const baseline = review.response, extracted = review.extractedResponse;
      const before = baseline.metrics, after = extracted.metrics, { f1, f2 } = config();
      const width = f2 - f1;
      const start = Math.min(before.peakF, after.peakF, f1) - width;
      const end = Math.max(before.peakF, after.peakF, f2) + width;
      const inWindow = frequency => frequency >= start && frequency <= end;
      const windowIndices = baseline.freqs.flatMap((frequency, i) => inWindow(frequency) ? [i] : []);
      const indices = windowIndices.length >= 5 ? windowIndices : baseline.freqs.map((_, i) => i);
      chart(section, indices.map(i => baseline.freqs[i]), [
        { name: 'Geometry estimate', values: indices.map(i => baseline.s21db[i]) },
        { name: 'With EM extraction', values: indices.map(i => extracted.s21db[i]), dash: [4, 3] },
      ], 'S21 dB', true, 'Passband comparison');
      section.append(specTable([
        ['Centre frequency, before → after', `${before.centreF ? eng(before.centreF, 'Hz') : '—'} → ${after.centreF ? eng(after.centreF, 'Hz') : '—'}`],
        ['Insertion loss, before → after', `${num(before.insertionLoss, 2)} → ${num(after.insertionLoss, 2)} dB`],
      ]));
    }
    if (config().hairpinExtraction) section.append(button('Remove extraction', () => {
      host.apply({ hairpinExtraction: null });
      render('tune');
    }));
    input.addEventListener('change', async () => {
      const selected = input.files[0];
      const id = host.designId?.();
      if (!selected) return;
      try {
        const contents = await selected.text();
        if (disposed || !input.isConnected || id !== host.designId?.()) return;
        const report = JSON.parse(contents);
        extractedHairpin(host.result(), report);
        host.apply({ hairpinExtraction: report });
        render('tune');
        status.textContent = 'Extraction applied to the comparison curve.';
      } catch (error) { status.textContent = error.message; }
    });
  }
  function fieldTool() {
    if(kind()==='motor' && ['stepper','linear','planar'].includes(config().motorFamily)) { body.append(note('This field-slice tool assumes a rotary polyphase ring. Use the selected family’s force/torque charts and drive preview; export its geometry for a full magnetic field solve.')); return; }
    if (kind() === 'filter') { body.append(note('The magnetic field tool needs a winding current path.'), button('Open inductor', () => { close(); host.switch('inductor', active); })); return; }
    body.append(note('Biot–Savart field above the upper copper plane, in free space. Motors combine the actual winding paths with sinusoidal phase currents; the phase buses, external return wiring, rotor magnets, and induced currents are excluded. The animation is slowed for inspection.'));
    const c = config(), s = settings('field', { height: 2, resolution: 31, component: 'Bz' }), f = form();
    field(f, s, 'height', 'Height above top copper (mm)', 0.1, 100); field(f, s, 'resolution', 'Grid resolution', 9, 61, 2);
    select(f, s, 'component', 'Field component', [['Bz', 'Signed Bz'], ['magnitude', '|B|']]);
    const out = output(); runButton('Calculate field slice', () => run('field', { cfg: c, opt: { ...s, motor: kind() === 'motor' } }, (r) => {
      out.replaceChildren();
      const canvas = el('canvas', { class: 'tools-field-map', width: 640, height: 540, role: 'img', 'aria-label': 'Magnetic field map with probe' }), probe = note('Move over the field map to inspect a point.'); out.append(canvas, probe);
      const ctx = canvas.getContext('2d'); let phase = 0, raf = 0, playing = false;
      const component = (v) => s.component === 'Bz' ? v[2] : Math.hypot(...v);
      const maxB = Math.max(1e-12, ...r.maps[0].map((_, i) => r.maps.reduce((sum, map) => sum + Math.hypot(...map[i]), 0)));
      let vectors = [];
      function draw() {
        vectors = r.maps[0].map((_, i) => [0, 1, 2].map((axis) => r.maps.reduce((sum, map, p) => sum + map[i][axis] * (r.phases > 1 ? Math.cos(phase - (r.phaseAngles?.[p] ?? p * 2 * Math.PI / r.phases)) : 1), 0)));
        ctx.fillStyle = '#111823'; ctx.fillRect(0, 0, 640, 540);
        const cell = 480 / r.n;
        vectors.forEach((v, i) => {
          const b = component(v), t = Math.max(-1, Math.min(1, b / maxB));
          ctx.fillStyle = t >= 0 ? `rgb(${30 + 225 * t},${40 + 100 * t},${60 - 30 * t})` : `rgb(${30 - 10 * t},${40 - 130 * t},${60 - 190 * t})`;
          ctx.fillRect(50 + i % r.n * cell, 20 + (r.n - 1 - Math.floor(i / r.n)) * cell, cell + 0.5, cell + 0.5);
        });
        ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = 0.6;
        for (const poly of r.polys) { ctx.beginPath(); poly.forEach(([x, y], i) => { const px = 50 + (x / r.extent + 1) * 240, py = 20 + (1 - y / r.extent) * 240; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); }
        ctx.fillStyle = '#edf4ff'; ctx.font = '13px system-ui';
        ctx.fillText(`${s.component} · ${s.component === 'Bz' ? '±' : '0 to '}${eng(maxB, 'T')} scale`, 50, 522);
        ctx.fillText(`±${num(r.extent, 1)} mm`, 440, 522);
        ctx.fillText('+', 553, 42); ctx.fillText(s.component === 'Bz' ? '0' : '½', 553, 260); ctx.fillText(s.component === 'Bz' ? '−' : '0', 553, 490);
        for (let j = 0; j < 480; j++) { const t = 1 - j / (s.component === 'Bz' ? 240 : 480); ctx.fillStyle = t >= 0 ? `rgb(${30 + 225 * t},${40 + 100 * t},${60 - 30 * t})` : `rgb(${30 - 10 * t},${40 - 130 * t},${60 - 190 * t})`; ctx.fillRect(535, 20 + j, 12, 1); }
      }
      canvas.addEventListener('pointermove', (e) => {
        const b = canvas.getBoundingClientRect(), px = (e.clientX - b.left) * 640 / b.width, py = (e.clientY - b.top) * 540 / b.height;
        const i = Math.floor((px - 50) / 480 * r.n), j = r.n - 1 - Math.floor((py - 20) / 480 * r.n);
        if (i < 0 || i >= r.n || j < 0 || j >= r.n) return;
        const v = vectors[j * r.n + i]; probe.textContent = `x ${num(-r.extent + i * 2 * r.extent / (r.n - 1), 2)} mm · y ${num(-r.extent + j * 2 * r.extent / (r.n - 1), 2)} mm · Bx ${eng(v[0], 'T')} · By ${eng(v[1], 'T')} · Bz ${eng(v[2], 'T')}`;
      });
      if (r.phases > 1) {
        const phases = { angle: 0 }, bar = el('div', { class: 'tools-form' }); out.append(bar);
        const input = field(bar, phases, 'angle', 'Electrical phase (degrees)', 0, 360, 1, 'range');
        input.addEventListener('input', () => { phase = Number(input.value) * Math.PI / 180; draw(); });
        const play = button('Animate phase currents', () => {
          playing = !playing; play.textContent = playing ? 'Pause animation' : 'Animate phase currents';
          let last = performance.now();
          const tick = (now) => { if (!playing) return; phase += Math.min(100, now - last) / 1000; last = now; input.value = phase * 180 / Math.PI % 360; draw(); raf = requestAnimationFrame(tick); };
          if (playing) raf = requestAnimationFrame(tick); else cancelAnimationFrame(raf);
        }); out.append(play);
      }
      const dispose = () => { playing = false; cancelAnimationFrame(raf); }; dispose.element = canvas;
      cleanups.push(dispose); pruneViews(); draw(); exportReport(out, 'magnetic-field', r);
    }));
  }
  function board() {
    body.append(note('Read the live board or import .kicad_pcb. Preview conflicts with copper, keepouts, drills, and edges, plus ground overlap and missing reference planes. Pads use conservative bounding circles. Run KiCad DRC after placement for authoritative netclass and shape checks.'));
    const s = settings('board', { x: config().placementOrigin?.[0] || 0, y: config().placementOrigin?.[1] || 0, clearance: 0.2, groundNet: 'GND', groundLayer: 'B.Cu' }), f = form();
    field(f, s, 'x', 'Placement X (KiCad mm)', -10000, 10000); field(f, s, 'y', 'Placement Y (KiCad mm)', -10000, 10000); field(f, s, 'clearance', 'Clearance (mm)', 0, 10);
    field(f, s, 'groundNet', 'Ground net', null, null, 'any', 'text');
    if (!host.result()?.rfStack) field(f, s, 'groundLayer', 'Reference copper layer', null, null, 'any', 'text');
    const input = el('input', { type: 'file', accept: '.kicad_pcb', 'aria-label': 'Board file' }); body.append(input);
    const out = output();
    function inspect() {
      if (!boardText) { status.textContent = 'Read a live board or import a board file first.'; return; }
      const result = host.result(), stack = result.rfStack;
      const seriesWinding = kind() === 'inductor' && result.art.meta.kind === 'coil' && config().connection === 'series';
      run('board', { art: result.art, text: boardText, excluded, opt: { kind: kind(), distributed: !!stack, seriesWinding, origin: [s.x, s.y], clearance: s.clearance, groundNet: s.groundNet, signalLayer: stack?.signal, groundLayer: stack?.reference ?? s.groundLayer } }, (r) => {
        out.replaceChildren(el('h3', { text: `${r.total} findings · ${boardSource}` }));
        view(out, r.preview, [['Board', '#526276'], ['Edge', '#c7d2dd'], ['Design', '#ee9c48'], ['Conflict', '#fb4d66']]);
        for (const warning of r.warnings) out.append(note(warning));
        if (!r.total) out.append(note('No conflicts found by the supported geometric checks. This is not a KiCad DRC pass.'));
        out.append(specTable(r.findings.map((f) => [f.type, f.message])));
        out.append(button('Use this placement origin', () => { host.apply({ placementOrigin: r.origin }); status.textContent = `Place will use X ${r.origin[0]}, Y ${r.origin[1]} mm.`; })); exportReport(out, 'board-check', r);
      });
    }
    input.addEventListener('change', async () => {
      try { const file = input.files[0]; if (!file) return; boardText = await file.text(); excluded = []; boardSource = `${file.name} (imported file)`; inspect(); }
      catch (e) { status.textContent = e.message; }
    });
    runButton('Read live KiCad board', async () => {
      try {
        status.textContent = 'Reading live board…'; const snapshot = await bridge.call('board.snapshot', { designId: host.designId() });
        if (disposed || active !== 'board') return;
        boardText = snapshot.text; excluded = snapshot.excludedIds; boardSource = `${snapshot.name} (live snapshot)`; inspect();
      } catch (e) { status.textContent = e.message; }
    }); runButton('Check placement', inspect);
  }
  function rotor() {
    if (!requireKind('motor', 'Design a rotor alongside a PCB motor stator. Magnet count follows twice the motor pole-pair count.')) return;
    if (config().motorFamily === 'dual-rotor') { driveEnvelope(); return; }
    if (config().motorFamily && config().motorFamily !== 'rotary') {
      body.append(note('The magnet ring is for rotary stators. Use Motion maps for the selected motor family.'));
      return;
    }
    body.append(note('Alternating axial N/S cylindrical magnets. The field estimate is the centerline field of one isolated, uniformly magnetized cylinder in free space. It excludes neighboring magnets, back iron, leakage, and the rotor field fundamental. Use a measured or external-solver peak air-gap field for motor performance.'));
    const c = config(), s = settings('rotor', { radius: (c.dOuter + c.dInner) / 4, diameter: 6, thickness: 3, gap: 1, br: 1.2, angle: 0, externalB: c.bGap });
    const f = form();
    for (const [key, label, min, max] of [['radius', 'Magnet pitch radius (mm)', 1, 500], ['diameter', 'Magnet diameter (mm)', 0.1, 100], ['thickness', 'Magnet thickness (mm)', 0.1, 100], ['gap', 'Magnet face to copper (mm)', 0, 100], ['br', 'Remanence Br (T)', 0.01, 2], ['angle', 'Rotor angle (degrees)', -360, 360]]) field(f, s, key, label, min, max);
    const out = output();
    function draw() {
      try {
        clearViews(); out.replaceChildren(); const r = rotorDesign(c, s), A = plain(host.result().art);
        for (const magnet of r.magnets) {
          const pts = Array.from({ length: 65 }, (_, i) => [magnet.x + magnet.radius * Math.cos(i * Math.PI / 32), magnet.y + magnet.radius * Math.sin(i * Math.PI / 32)]);
          A.tracks.push(track(magnet.polarity > 0 ? 'North' : 'South', 0.3, pts));
          A.labels.push({ x: magnet.x, y: magnet.y, text: magnet.polarity > 0 ? 'N' : 'S', size: 1, layer: 'F.SilkS' });
        }
        const v = view(out, A, [['F.Cu', '#73563e'], ['B.Cu', '#525e73'], ['North', '#ef725e'], ['South', '#59aeee']]); v.show.labels = true; v.draw();
        out.append(specTable([['Rotor poles', String(r.count)], ['Isolated pole center field', eng(r.estimate, 'T')]]));
        r.warnings.forEach((w) => out.append(note(w)));
        chart(out, r.curve.map((p) => p.gap), [{ name: 'Isolated pole Bz', values: r.curve.map((p) => p.B) }], 'T', false, 'Isolated magnet field versus face-to-probe distance (mm)');
        exportReport(out, 'rotor', { ...r, geometry: { ...s }, stator: { dOuter: c.dOuter, dInner: c.dInner, boardT: c.boardT } });
      } catch (e) { status.textContent = e.message; }
    }
    f.addEventListener('change', draw); draw();
    const external = el('div', { class: 'tools-form' }); body.append(external);
    field(external, s, 'externalB', 'Measured / external-solver peak Bgap (T)', 0.001, 2);
    body.append(button('Apply external field to motor', () => {
      host.apply({ bGap: s.externalB });
      redrawEnvelope();
      status.textContent = 'Motor performance recomputed from external Bgap.';
    }));
    const redrawEnvelope = driveEnvelope();
  }
  function driveEnvelope() {
    const c = config(), topology = host.result()?.motor?.topology;
    body.append(el('h3', { text: 'Continuous speed and torque' }),
      note('Balanced three-phase estimate using winding resistance at the temperature limit. Enter the thermal resistance for your cooling setup. The model assumes sinusoidal winding current and excludes field weakening, speed-dependent losses and inverter voltage drop. Six-terminal mode assumes three independent H-bridges.'));
    const s = settings('driveEnvelope', { vdc: c.vdc, current: c.current * lineCurrentFactor(topology), ambient: 25, maxTemperature: 100,
      thermalResistance: 25, speed: c.rpm, targetTorque: Math.max(0, host.result()?.motor?.torque || 0), modulation: 'spaceVector' });
    const f = form();
    for (const [key, label, min, max] of [['vdc', 'DC bus voltage (V)', 0.1, 1000], ['current', 'Driver peak line current (A)', 0.001, 1000],
      ['ambient', 'Ambient temperature (°C)', -50, 150], ['maxTemperature', 'Winding temperature limit (°C)', -40, 250],
      ['thermalResistance', 'Winding-to-ambient thermal resistance (°C/W)', 0.001, 10000],
      ['speed', 'Requested speed (rpm)', 0, 300000], ['targetTorque', 'Requested torque (N·m)', 0, 1000]]) {
      field(f, s, key, label, min, max);
    }
    if (topology !== 'independent') select(f, s, 'modulation', 'Inverter modulation', [['spaceVector', 'Space-vector PWM'], ['sine', 'Sinusoidal PWM']]);
    const out = output();
    const draw = () => {
      out.replaceChildren();
      pruneViews();
      try {
        const result = motorEnvelope(host.result().motor, c, s);
        chart(out, result.curve.map(row => row.rpm), [
          { name: 'Continuous torque', values: result.curve.map(row => row.torque) },
          { name: 'Driver current ceiling', values: result.curve.map(() => result.driverTorque), dash: [4, 4] },
          { name: 'Winding temperature ceiling', values: result.curve.map(() => result.thermalTorque), dash: [2, 4] },
        ], 'N·m', false, 'Continuous torque versus speed (rpm)');
        out.append(specTable([
          ['Requested operating point', result.point.feasible ? 'Within estimated limits' : 'Outside estimated limits'],
          ['Limit at requested speed', result.point.limit],
          ['Available torque', eng(result.point.torque, 'N·m')],
          ['Peak line current at requested torque', eng(result.point.requestedLineCurrent, 'A')],
          ['Copper loss at requested torque', eng(result.point.copperLoss, 'W')],
          ['Voltage-limited no-load speed', `${num(result.noLoadRpm, 0)} rpm`],
        ]));
        exportReport(out, 'motor-envelope', { assumptions: { ...s }, ...result });
      } catch (error) { out.append(note(error.message)); }
    };
    f.addEventListener('change', draw);
    draw();
    return draw;
  }
  const renderers = { optimize, measurements, coupling, tolerance, tune, field: fieldTool, board, rotor,
    ...motorStudies({ body, config, host, settings, form, field, select, button, runButton, run, output, note, chart, status,
      exportReport, changed, pruneViews }) };
  function render(id) {
    stop(); clearViews(); body.replaceChildren(); active = id;
    title.textContent = `Design tools · ${host.name()}`;
    for (const b of nav.children) b.setAttribute('aria-pressed', String(b.dataset.tool === id));
    status.textContent = 'Settings are included when you save the design.';
    if (['antenna', 'transformer'].includes(kind()) && id !== 'board') {
      body.append(note('This study supports the Inductor, PCB motor or Filter workspace. Antenna and Transformer calculations are shown in their main workspace.'));
      return;
    }
    try { renderers[id](); } catch (e) { status.textContent = e.message; }
  }
  const tabs = kind() === 'motor' ? [...TABS, ...MOTOR_TABS] : TABS;
  for (const [id, label] of tabs) { const b = button(label, () => render(id)); b.dataset.tool = id; nav.append(b); }
  render(initial);
}

/** Add measurements to the normal response plots, retaining a fitted baseline. */
export function withMeasurements(charts, cfg, kind, effective = cfg) {
  if (!cfg.measurement) return charts;
  for (const c of charts) {
    const metric = kind === 'filter' && c.id === 'compare' ? 's21db' : kind === 'inductor' && c.id === 'z' ? 'Z' : null;
    if (!metric) continue;
    const values = measurementValues(cfg.measurement, metric, c.spec.x.values);
    if (values.some(Number.isFinite)) c.spec.series.push({ name: 'Measured', values, dash: [3, 3], color: '#a784ef' });
    const original = cfg.measurementFit?.original;
    if (original) c.spec.series.push({ name: hasStaleFit(cfg, effective) ? 'Before fit (out of date)' : 'Before fit', values: c.spec.x.values.map((f) => interpolate(original.x, original.y, f)), dash: [6, 4], color: '#d6a53d' });
  }
  return charts;
}
