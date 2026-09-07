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
const { responseOf } = await import('../web/js/engine/studies.js');
let kind = 'inductor', cfg, result, dirty = 0;
const workspaces = { inductor: ind, filter, motor };
function reset(k) { kind = k; cfg = workspaces[k].defaults(); cfg.turns = k === 'motor' ? 4 : 3; if (k === 'filter') { cfg.family = 'hairpin'; cfg.order = 3; cfg.band = 'bandpass'; } result = workspaces[k].compute(cfg, {}); }
const host = { kind: () => kind, config: () => cfg, result: () => result, name: () => 'Test', designId: () => 'test', dirty: () => { dirty++; }, apply: (patch) => { Object.assign(cfg, patch); result = workspaces[kind].compute(cfg, {}); }, switch: (k, tab) => { reset(k); openDesignTools(host, tab); } };
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
  });
  click('Close'); reset('motor'); openDesignTools(host, 'rotor');
  await check('Rotor preview and external field update motor results', () => {
    assert.match(text(), /Rotor poles/); set('Measured / external-solver peak Bgap (T)', 0.6); click('Apply external field to motor'); assert.equal(cfg.bGap, 0.6); assert.ok(document.querySelector('.tools-view canvas'));
  });
  await check('Motor phase animation can start, pause, and dispose', async () => {
    click('Magnetic field'); set('Grid resolution', 9); await calculate('Calculate field slice'); click('Animate phase currents'); click('Pause animation'); click('Close'); assert.equal(liveWorkers, 0);
  });
  assert.ok(dirty > 0);
  console.log(`\n${checks} DOM/worker integration checks passed (canvas rendering stubbed)`);
} finally {
  byText('Close')?.click(); await w.happyDOM.abort();
}
function near(a, b) { assert.ok(Math.abs(a - b) < 1e-8); }
