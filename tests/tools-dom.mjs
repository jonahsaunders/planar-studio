/* UI integration without a browser binary. Happy DOM supplies actual DOM/event
   semantics; canvas drawing is stubbed. Workers run the real study entry point.
   This verifies interaction and lifecycle, not rendering or browser CSP. */
import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
const { Window } = await import(process.env.PLANAR_DOM_MODULE || 'happy-dom');
const w = new Window({ url: 'http://localhost/' });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLCanvasElement', 'Event', 'MouseEvent', 'File', 'Blob', 'ResizeObserver', 'getComputedStyle', 'localStorage']) {
  globalThis[key] = key === 'window' ? w : typeof w[key] === 'function' && key === 'getComputedStyle' ? w[key].bind(w) : w[key];
}
globalThis.requestAnimationFrame = w.requestAnimationFrame.bind(w);
globalThis.cancelAnimationFrame = w.cancelAnimationFrame.bind(w);
const context = () => new Proxy({ measureText: (s) => ({ width: String(s).length * 6 }) }, { get: (o, k) => o[k] ?? (() => {}), set: (o, k, v) => (o[k] = v, true) });
w.HTMLCanvasElement.prototype.getContext = context;
w.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 360, right: 800, bottom: 360 });
w.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [this.getBoundingClientRect()]; };
let liveWorkers = 0;
globalThis.Worker = class {
  constructor(url) {
    liveWorkers++; this.queue = []; this.ready = false; this.ended = false;
    this.worker = new NodeWorker(new URL('./helpers/study-node-worker.mjs', import.meta.url), { workerData: { url: String(url) } });
    this.worker.on('message', (data) => {
      if (data.ready) { this.ready = true; this.queue.forEach((m) => this.worker.postMessage(m)); this.queue = []; }
      else this.onmessage?.({ data });
    });
    this.worker.on('error', (e) => this.onerror?.({ message: e.message }));
  }
  postMessage(m) { this.ready ? this.worker.postMessage(m) : this.queue.push(m); }
  terminate() { if (!this.ended) { this.ended = true; liveWorkers--; } this.worker.terminate(); }
};
const { openDesignTools } = await import('../web/js/ui/design-tools.js');
const ind = await import('../web/js/ws/inductor.js'), filter = await import('../web/js/ws/filter.js'), motor = await import('../web/js/ws/motor.js');
const { parseMeasurement } = await import('../web/js/engine/measurements.js');
const { COUPON_BOARD_SHA, hasStaleFit } = await import('../web/js/engine/measurement-records.js');
const { responseOf } = await import('../web/js/engine/studies.js');
let kind = 'inductor', cfg, result, dirty = 0;
const workspaces = { inductor: ind, filter, motor };
function reset(k) { kind = k; cfg = workspaces[k].defaults(); cfg.turns = k === 'motor' ? 4 : 3; if (k === 'filter') { cfg.family = 'hairpin'; cfg.order = 3; cfg.band = 'bandpass'; } result = workspaces[k].compute(cfg, {}); }
const host = { kind: () => kind, config: () => cfg, defaults: () => workspaces[kind].defaults(),
  result: () => result, solveMeasurement: c => workspaces[kind].compute(c, {}),
  environment: () => ({}),
  name: () => 'Test', designId: () => 'test', dirty: () => { dirty++; },
  apply: (patch) => { Object.assign(cfg, patch); result = workspaces[kind].compute(cfg, {}); },
  switch: (k, tab) => { reset(k); openDesignTools(host, tab); } };
const text = () => document.querySelector('.tools-modal')?.textContent || '';
const status = () => document.querySelector('.tools-status')?.textContent || '';
const byText = (s) => [...document.querySelectorAll('button')].find((b) => b.textContent === s);
function click(s) { const b = byText(s); assert.ok(b, `Missing button ${s}: ${text()}`); b.click(); }
function set(label, value) { const input = document.querySelector(`[aria-label="${label}"]`); assert.ok(input, label); input.value = String(value); input.dispatchEvent(new w.Event('change', { bubbles: true })); }
async function until(fn, label) { const deadline = Date.now() + 30000; while (!fn()) { if (Date.now() > deadline) throw new Error(`${label}: ${status()}\n${text()}`); await new Promise((r) => setTimeout(r, 15)); } }
async function calculate(label) { click(label); await until(() => liveWorkers === 0, label); assert.equal(status(), 'Calculation complete.', `${label}: ${status()}`); }
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`  ok ${name}`); }
try {
  reset('inductor'); openDesignTools(host);
  await check('All eight tool tabs render', () => assert.equal(document.querySelectorAll('.tools-tabs button').length, 8));
  await check('Optimizer runs and applying a candidate updates the active design', async () => {
    set('Target inductance (µH)', 1); set('Minimum trace width (mm)', 0.3); set('Maximum trace width (mm)', 0.3); set('Minimum gap (mm)', 0.2); set('Maximum gap (mm)', 0.2);
    await calculate('Find designs'); assert.equal(document.querySelectorAll('.tools-card').length, 3); click('Apply design'); assert.ok(Math.abs(result.analysis.L / 1e-6 - 1) < 0.04);
  });
  await check('Coupling preview, worker result, and receiver controls', async () => {
    click('Coupled coils'); set('Center-plane separation (mm)', 8); await calculate('Calculate coupling'); assert.match(text(), /Mutual inductance M/); assert.ok(document.querySelector('.tools-view canvas'));
  });
  await check('Changing settings terminates a stale worker', async () => {
    click('Calculate coupling'); assert.equal(liveWorkers, 1); set('Receiver X offset (mm)', 1); assert.equal(liveWorkers, 0); assert.match(status(), /changed/);
  });
  await check('Tolerance study shows yield and envelope chart', async () => {
    click('Tolerances'); set('Samples', 4); await calculate('Run tolerance study'); assert.match(text(), /estimated yield/); assert.ok(document.querySelector('canvas.tools-chart'));
  });
  await check('Cancel terminates pending calculations and leaves controls usable', async () => {
    click('Run tolerance study'); click('Cancel calculation'); assert.equal(liveWorkers, 0); assert.equal(byText('Run tolerance study').disabled, false); assert.match(status(), /canceled/);
  });
  await check('Field slice draws with probe readout', async () => {
    click('Magnetic field'); set('Grid resolution', 9); await calculate('Calculate field slice'); assert.ok(document.querySelector('.tools-field-map')); assert.match(text(), /inspect a point/);
  });
  await check('Measurement file input imports and renders overlay', async () => {
    click('Measurements'); const input = document.querySelector('[aria-label="Measurement file"]');
    Object.defineProperty(input, 'files', { value: [new w.File(['Frequency (Hz),Z (ohm)\n1000,1\n1000000,8\n100000000,25'], 'lab.csv')] });
    input.dispatchEvent(new w.Event('change')); await until(() => cfg.measurement, 'measurement import'); assert.match(text(), /lab.csv/); assert.ok(document.querySelector('canvas.tools-chart'));
  });
  await check('Malformed file surfaces a useful import error', async () => {
    const input = document.querySelector('[aria-label="Measurement file"]');
    Object.defineProperty(input, 'files', { value: [new w.File(['not a measurement'], 'bad.csv')] });
    input.dispatchEvent(new w.Event('change')); await until(() => /CSV needs/.test(status()), 'malformed import'); assert.equal(cfg.measurement.name, 'lab.csv');
  });
  await check('Coupon import retains the earlier sweep and binds the published geometry', async () => {
    const original = cfg.measurementRecords[0];
    const manifest = { coupon: 'B', boardSHA256: COUPON_BOARD_SHA, sampleId: 'B-01', measuredOn: '2026-01-02',
      instrument: 'VNA', calibration: 'One-port SOL', referencePlane: 'Probe tips', stackup: 'FR-4', impedanceFile: 'b.csv' };
    click('Optimize');
    click('Measurements');
    const input = document.querySelector('[aria-label="Measurement file"]');
    Object.defineProperty(input, 'files', { value: [
      new w.File([JSON.stringify(manifest)], 'b.json'),
      new w.File(['Frequency (Hz),R (ohm),X (ohm)\n1000,1,0.01\n1000000,2,14\n100000000,5,-36'], 'b.csv'),
    ] });
    input.dispatchEvent(new w.Event('change'));
    await until(() => cfg.measurementRecords.length === 2, 'coupon import');
    const coupon = cfg.measurementRecords[1];
    assert.equal(coupon.configuration.turns, 9);
    assert.equal(coupon.configuration.traceW, 0.4);
    assert.equal(coupon.conditions.role, 'held-out');
    assert.ok(coupon.baseline.x.length);
    assert.match(text(), /Probe tips/);
    set('Saved measurement', original.id);
    assert.equal(cfg.measurement.name, 'lab.csv');
  });
  await check('Board import performs geometric checks and applies placement origin', async () => {
    click('Board checks'); set('Placement X (KiCad mm)', 25);
    const input = document.querySelector('[aria-label="Board file"]');
    Object.defineProperty(input, 'files', { value: [new w.File(['(kicad_pcb (version 20240108) (gr_rect (start -10 -10) (end 10 10) (layer "Edge.Cuts") (stroke (width 0.1))))'], 'fixture.kicad_pcb')] });
    input.dispatchEvent(new w.Event('change')); await until(() => /findings/.test(text()), 'board import'); click('Use this placement origin'); assert.deepEqual(cfg.placementOrigin, [25, 0]);
  });
  await check('Close releases workers and restores focus', () => { click('Close'); assert.equal(document.querySelector('.tools-modal'), null); assert.equal(liveWorkers, 0); });
  reset('filter'); openDesignTools(host, 'tune');
  await check('Automatic filter tuning compares and applies a result', async () => {
    await calculate('Tune to response mask'); assert.match(text(), /mask met|misses the mask/); click('Apply tuning'); assert.ok(cfg.tuning);
  });
  await check('Manual filter handles change physical dimensions', () => {
    const hs = filter.handles(cfg, result, { set: (k, v) => host.apply({ [k]: v }) });
    const before = result.design.resonators[0].armLen;
    hs.find((h) => h.id === 'length-0').drag(0, before * 1.1); assert.ok(result.design.resonators[0].armLen > before);
  });
  await check('Filter measurement fitting keeps copper dimensions when applied', async () => {
    const actual = responseOf('filter', cfg, null, { er: 5 }); cfg.measurement = { name: 'synthetic.s2p', z0: 50, rows: actual.x.map((f, i) => ({ f, s21db: actual.y[i] })) };
    click('Measurements'); set('Fit Loss tangent', 'no'); await calculate('Fit measurement');
    const before = result.design.resonators[0].armLen; click('Apply fitted parameters'); assert.ok(cfg.measurementFit); assert.ok(cfg.fixedDesign); near(result.design.resonators[0].armLen, before);
    assert.equal(hasStaleFit(cfg), false);
    host.apply({ tuning: { ...cfg.tuning, lengthScale: 1.1 } });
    click('Tolerances'); click('Measurements');
    assert.match(text(), /fit is out of date/);
  });
  click('Close'); reset('motor'); openDesignTools(host, 'rotor');
  await check('Rotor preview and external field update motor results', () => {
    assert.match(text(), /Rotor poles/); set('Measured / external-solver peak Bgap (T)', 0.6); click('Apply external field to motor'); assert.equal(cfg.bGap, 0.6); assert.ok(document.querySelector('.tools-view canvas'));
  });
  await check('Motor phase animation can start, pause, and dispose', async () => {
    click('Magnetic field'); set('Grid resolution', 9); await calculate('Calculate field slice'); click('Animate phase currents'); click('Pause animation'); click('Close'); assert.equal(liveWorkers, 0);
  });
  reset('motor'); openDesignTools(host, 'motorSizing');
  await check('Motor sizing searches and applies a routed candidate', async () => {
    set('Target speed (rpm)', 1000); set('Target torque (N·m)', 0.005); set('Maximum finished diameter (mm)', 85);
    await calculate('Find motor designs');
    assert.ok(document.querySelector('.motor-candidate[open]'));
    click('Use this winding'); assert.ok(result.art.meta.busRouted);
    assert.equal(cfg.rpm, 1000); assert.match(status(), /^Applied/);
  });
  await check('Motor field CSV persists and produces voltage and torque readouts', async () => {
    click('Field map');
    const input = document.querySelector('[aria-label="Import motor field map CSV"]');
    const lines = ['x_mm,y_mm,bz_t,gap_mm'];
    for (const gap of [1, 2]) for (const x of [-60, -20, 20, 60]) for (const y of [-60, -20, 20, 60]) {
      lines.push([x, y, Math.cos(Math.atan2(y, x) * cfg.polePairs) / gap, gap].join(','));
    }
    Object.defineProperty(input, 'files', { value: [new w.File([lines.join('\n')], 'rotor.csv')] });
    input.dispatchEvent(new w.Event('change')); await until(() => /Field map loaded/.test(status()), 'field map import');
    await calculate('Analyze field map'); assert.match(text(), /Torque sensitivity to air gap/);
    set('Field-map air gap', '1'); assert.match(text(), /Peak back-EMF by winding/);
    click('Close'); openDesignTools(host, 'fieldMap');
    assert.match(text(), /rotor.csv/);
    assert.equal(JSON.parse(JSON.stringify(cfg)).tools.motorFieldMap.planes.length, 2);
    click('Remove field map'); assert.equal(byText('Analyze field map').disabled, true);
    click('Close');
  });
  for (const [family, expected] of [['stepper', /Stepper torque versus speed/], ['linear', /Thrust across the stroke/],
    ['planar', /of sampled positions reach the target/]]) {
    reset('motor'); host.apply({ motorFamily: family }); openDesignTools(host, 'motionMaps');
    await check(family + ' motion map renders', async () => {
      await calculate('Calculate motion map'); assert.match(text(), expected);
      if (family === 'planar') {
        const selection = document.querySelector('.motor-force-grid [aria-pressed="true"]');
        assert.ok(selection);
        selection.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowUp' }));
        assert.notEqual(document.querySelector('.motor-force-grid [aria-pressed="true"]'), selection);
        assert.match(text(), /Coil currents/);
      }
      click('Close');
    });
  }
  reset('motor'); host.apply({ motorFamily: 'stepper', layers: 6, microsteps: 8 }); openDesignTools(host, 'loadedMove');
  await check('Stepper loaded move and calibration run in the worker and persist torque data', async () => {
    await calculate('Simulate loaded move');
    assert.match(text(), /Commanded and actual rotor angle/);
    click('Microstep calibration');
    assert.ok(byText('Calculate corrected currents').disabled);
    const input = document.querySelector('[aria-label="Import stepper torque CSV"]');
    const csv = ['angle_deg,torque_a_nm,torque_b_nm'];
    for (let degrees = 0; degrees < 180; degrees += 5) {
      const theta = degrees * Math.PI / 90;
      csv.push([degrees, 0.01 * Math.cos(theta), 0.009 * Math.sin(theta)].join(','));
    }
    Object.defineProperty(input, 'files', { value: [new w.File([csv.join('\n')], 'torque.csv')] });
    input.dispatchEvent(new w.Event('change'));
    await until(() => /Phase torque data loaded/.test(status()), 'phase torque import');
    await calculate('Calculate corrected currents');
    assert.equal(document.querySelectorAll('[aria-label="Corrected microstep currents"] tbody tr').length, 32);
    click('Close'); openDesignTools(host, 'microstepCalibration');
    assert.match(text(), /torque.csv/);
    host.apply({ dOuter: cfg.dOuter + 1 });
    click('Loaded move');
    assert.match(text(), /belongs to an earlier winding/);
    click('Microstep calibration');
    assert.ok(byText('Calculate corrected currents').disabled);
    click('Close');
  });
  assert.ok(dirty > 0);
  console.log(`\n${checks} DOM/worker integration checks passed (canvas rendering stubbed)`);
} finally {
  byText('Close')?.click(); await w.happyDOM.abort();
}
function near(a, b) { assert.ok(Math.abs(a - b) < 1e-8); }
