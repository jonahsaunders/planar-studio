/* Full application DOM/worker integration without a browser or network socket.
 * Happy DOM runs the actual app shell and controls. Canvas/layout are stubbed;
 * Node workers execute the real browser worker module. Only the bridge's HTTP
 * transport and persistent store are replaced with an in-memory RPC fixture.
 * This does not validate rendered pixels, browser CSP, or a live KiCad link.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Worker as NodeWorker } from 'node:worker_threads';
import { setTimeout as pause } from 'node:timers/promises';
import { sexpr } from '../web/js/engine/boardcheck.js';

const { Window } = await import(process.env.PLANAR_DOM_MODULE || 'happy-dom');
const w = new Window({ url: 'http://localhost/', settings: {
  disableCSSFileLoading: true, disableJavaScriptFileLoading: true,
} });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLCanvasElement', 'Event', 'MouseEvent', 'File', 'Blob', 'ResizeObserver', 'getComputedStyle', 'localStorage']) {
  globalThis[key] = key === 'window' ? w : key === 'getComputedStyle' ? w[key].bind(w) : w[key];
}
const nativeTimers = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
globalThis.setTimeout = w.setTimeout.bind(w);
globalThis.clearTimeout = w.clearTimeout.bind(w);
globalThis.requestAnimationFrame = w.requestAnimationFrame.bind(w);
globalThis.cancelAnimationFrame = w.cancelAnimationFrame.bind(w);
w.HTMLCanvasElement.prototype.getContext = () => new Proxy({ measureText: value => ({ width: String(value).length * 6 }) }, {
  get: (object, key) => object[key] ?? (() => {}), set: (object, key, value) => (object[key] = value, true),
});
w.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 360, right: 800, bottom: 360 });
w.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [this.getBoundingClientRect()]; };
const domErrors = [];
w.addEventListener('error', e => domErrors.push(e.error?.message || e.message));

const workers = [], active = new Set();
let failNextWorkerConstruction = false, failNextWorkerPost = false;
globalThis.Worker = class BrowserWorkerAdapter {
  constructor(url) {
    if (failNextWorkerConstruction) { failNextWorkerConstruction = false; throw new Error('Test Worker constructor unavailable'); }
    this.url = String(url); this.queue = []; this.ready = false; this.ended = false;
    this.messages = []; this.response = null;
    this.worker = new NodeWorker(new URL('./helpers/study-node-worker.mjs', import.meta.url), { workerData: { url: this.url } });
    workers.push(this); active.add(this);
    this.worker.on('message', data => {
      if (data.ready) {
        this.ready = true;
        this.queue.forEach(message => this.worker.postMessage(message));
        this.queue = [];
      } else {
        this.response = data;
        this.onmessage?.({ data });
      }
    });
    this.worker.on('error', error => this.onerror?.({ message: error.message }));
  }
  postMessage(message) {
    if (failNextWorkerPost) { failNextWorkerPost = false; throw new Error('Test Worker postMessage unavailable'); }
    // Browser postMessage clones synchronously, including before Worker startup.
    const copy = structuredClone(message);
    this.messages.push(copy);
    if (this.ready) this.worker.postMessage(copy); else this.queue.push(copy);
  }
  terminate() {
    if (!this.ended) { this.ended = true; active.delete(this); this.exit = this.worker.terminate(); }
    return this.exit;
  }
};

const rpc = [], designs = new Map(), files = [];
globalThis.fetch = async (url, request) => {
  assert.equal(url, '/api');
  assert.equal(request.headers['X-Planar-Token'], 'test-litz-session');
  const { method, params } = JSON.parse(request.body);
  rpc.push({ method, params });
  let result;
  if (method === 'kicad.status') result = { connected: false, hasBoard: false, error: 'DOM test has no live KiCad link' };
  else if (method === 'designs.save') {
    designs.set(params.id, { ...structuredClone(params), saved: 1780000000 }); result = { id: params.id };
  } else if (method === 'designs.list') result = { designs: [...designs.values()].map(({ id, name, kind, saved }) => ({ id, name, kind, saved })) };
  else if (method === 'designs.load') result = structuredClone(designs.get(params.id));
  else if (method === 'file.save') { files.push(params); result = { path: `/test-export/${params.name}` }; }
  else if (method === 'manufacturing.run') result = { available: false, ok: false, status: 'unavailable', message: 'Test fixture: KiCad CLI unavailable', checks: {}, files: [] };
  else throw new Error(`Unexpected bridge request in Litz app integration test: ${method}`);
  return { ok: true, status: 200, json: async () => ({ ok: true, result }) };
};

const html = (await readFile(new URL('../web/index.html', import.meta.url), 'utf8'))
  .replace('__PLANAR_TOKEN__', 'test-litz-session').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
document.write(html); document.close();
const $ = id => document.getElementById(id);
const side = () => $('side').textContent;
const status = () => $('st-solve').textContent;
const input = label => {
  const node = document.querySelector(`[aria-label="${label}"]`);
  assert.ok(node, `Missing control: ${label}`); return node;
};
const set = (label, value) => {
  const node = input(label); node.value = String(value);
  node.dispatchEvent(new w.Event('change', { bubbles: true }));
};
const button = (label, host = document) => {
  const node = [...host.querySelectorAll('button')].find(b => b.textContent.trim() === label);
  assert.ok(node, `Missing button: ${label}`); return node;
};
const exportCard = title => {
  const node = [...document.querySelectorAll('.modal .export-card')].find(b => b.querySelector('.t')?.textContent === title);
  assert.ok(node, `Missing export card: ${title}`); return node;
};
async function until(predicate, label) {
  const deadline = Date.now() + 30000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`${label}: ${status()}\n${side()}\n${$('toasts').textContent}`);
    await pause(10);
  }
}
async function solved(label = 'Litz worker finished') {
  await until(() => active.size === 0 && /Estimated Q/.test(side()) && !/solving|failed/i.test(status()), label);
}
let checks = 0;
async function check(label, fn) { await fn(); checks++; console.log(`  ok ${label}`); }

try {
  await import('../web/js/app.js');
  if (!document.querySelector('[aria-label="Winding mode"]')) document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await until(() => document.querySelector('#side .tile') && !/solving/.test(status()), 'Initial spiral calculation');

  let completedResponse;
  await check('Mode activation runs the real Litz worker and renders estimates', async () => {
    set('Winding mode', 'pcb-litz');
    await until(() => active.size === 1, 'Litz worker starts');
    assert.match(status(), /background/);
    assert.ok(workers.at(-1).url.endsWith('/litz-worker.js'));
    assert.equal(workers.at(-1).messages[0].geometry.strands.length, 16);
    await solved();
    completedResponse = workers.at(-1).response;
    assert.equal(completedResponse.analysis.currentShares.length, 16);
    assert.match(side(), /Routing validationPassed/);
    assert.match(side(), /Self-resonanceUnknown/);
    assert.equal(document.querySelectorAll('#side canvas.chart').length, 6, 'Terminal R/L/Q, impedance, phase and copper-loss curves render.');
    assert.ok(workers.at(-1).ended, 'The completed worker is terminated.');
  });

  await check('Export reuses analysis, blocks footprints and writes span-preserving board copper', async () => {
    const workerCount = workers.length;
    $('btn-export').click();
    assert.equal(exportCard('KiCad footprint (.kicad_mod)').disabled, true);
    assert.equal(exportCard('KiCad board (.kicad_pcb)').disabled, false);
    assert.equal(exportCard('Design JSON').disabled, false);
    assert.equal(workers.length, workerCount, 'Opening export must not restart an unchanged solve.');
    exportCard('KiCad board (.kicad_pcb)').click();
    await until(() => files.length === 1 && !document.querySelector('.modal'), 'Board RPC export');
    const board = sexpr(files[0].text), vias = board.filter(n => n[0] === 'via' && n[1] === 'blind');
    assert.equal(vias.length, 480);
    assert.deepEqual(new Set(vias.map(v => v.find(n => n[0] === 'layers').slice(1).join('/'))),
      new Set(['F.Cu/In1.Cu', 'In1.Cu/In2.Cu', 'In2.Cu/B.Cu']));
    $('btn-library').click();
    assert.match($('toasts').textContent, /a footprint cannot preserve/);
    assert.ok(!rpc.some(r => r.method === 'library.write'));
  });

  await check('Edits terminate an in-flight worker and reject a late stale response', async () => {
    set('Litz outer diameter', 180);
    await until(() => active.size === 1, 'First edited worker starts');
    const stale = workers.at(-1);
    set('Litz outer diameter', 190);
    assert.equal(stale.ended, true);
    assert.equal(active.size, 0);
    await until(() => active.size === 1, 'Replacement worker starts');
    const replacement = workers.at(-1);
    assert.notEqual(replacement, stale);
    assert.equal(replacement.messages[0].cfg.dOuter, 190);
    stale.onmessage({ data: completedResponse }); // a real earlier solve, delivered late
    assert.equal(active.has(replacement), true);
    assert.match(status(), /background/);
    await solved();
    assert.equal(input('Litz outer diameter').value, '190');
    assert.match(side(), /5 \/ 190/);
  });

  await check('Switching to a standard spiral cancels Litz work and excludes stale estimates', async () => {
    set('Litz model resolution', 192);
    await until(() => active.size === 1, 'Refinement worker starts');
    const stale = workers.at(-1);
    set('Winding mode', 'spiral');
    assert.equal(stale.ended, true);
    await until(() => !/solving/.test(status()) && !/PCB Litz/.test($('st-algo').textContent), 'Standard spiral restored');
    const before = side();
    stale.onmessage({ data: completedResponse });
    assert.equal(side(), before);
    assert.equal(active.size, 0);
    assert.ok(!/Estimated strand currents/.test(side()));
    set('Winding mode', 'pcb-litz');
    await until(() => active.size === 1, 'Returning Litz worker starts');
    await solved();
    assert.equal(input('Litz outer diameter').value, '190', 'Switching modes preserves Litz edits.');
  });

  await check('Save/Open bridge round trip restores Litz settings and starts a fresh worker', async () => {
    set('Dielectric gap 2 (mm)', 0.55);
    set('Litz via plating', 30);
    set('Highlight Litz copper', 'strand:3');
    await until(() => active.size === 1, 'Saved-settings worker starts');
    await solved();
    $('design-name').value = 'Experimental Litz DOM';
    $('design-name').dispatchEvent(new w.Event('input', { bubbles: true }));
    button('Save').click();
    await until(() => designs.size === 1, 'Design stored through bridge');
    const saved = [...designs.values()][0];
    assert.equal(saved.kind, 'inductor'); assert.equal(saved.config.windingMode, 'pcb-litz');
    assert.equal(saved.config.dOuter, 190); assert.equal(saved.config.litzModelSegments, 192);
    assert.equal(saved.config.litzDielectricGaps[1], 0.55);
    assert.equal(saved.config.litzViaPlating, 30); assert.equal(saved.config.litzHighlight, 'strand:3');
    button('Load paper-inspired preset').click();
    await until(() => active.size === 1, 'Preset worker starts');
    const discarded = workers.at(-1);
    button('Open…').click();
    await until(() => document.querySelector('.modal h2')?.textContent === 'Open a design', 'Open-design picker');
    exportCard('Experimental Litz DOM').click();
    await until(() => !document.querySelector('.modal') && input('Litz outer diameter').value === '190', 'Saved design loaded');
    assert.equal(discarded.ended, true, 'Loading a saved design cancels the pending preset solve.');
    await until(() => active.size === 1, 'Loaded design worker starts');
    await solved();
    assert.equal(input('Winding mode').value, 'pcb-litz');
    assert.equal(input('Litz model resolution').value, '192');
    assert.equal(input('Dielectric gap 2 (mm)').value, '0.55');
    assert.equal(input('Litz via plating').value, '30');
    assert.equal(input('Highlight Litz copper').value, 'strand:3');
    assert.equal(workers.at(-1).messages[0].geometry.art.meta.previewStrandId, 3);
    assert.equal(saved.config.litzDielectricGaps[1], 0.55, 'Subsequent UI changes do not mutate saved RPC state.');
  });

  await check('Invalid geometry clears stale results, blocks export and recovers from the preset', async () => {
    set('Litz coil turns', 1.5);
    await until(() => /Fix parameters/.test(status()), 'Invalid geometry surfaced');
    assert.equal(active.size, 0); assert.equal(side(), '');
    assert.match($('toasts').textContent, /integer turn count/);
    $('btn-export').click();
    assert.equal(document.querySelector('.modal'), null);
    button('Load paper-inspired preset').click();
    await until(() => active.size === 1, 'Recovery worker starts');
    await solved();
    assert.equal(input('Litz coil turns').value, '5');
    assert.equal(input('Litz outer diameter').value, '160');
    assert.equal(input('Highlight Litz copper').value, 'all');
    assert.match(side(), /Routing validationPassed/);
  });

  await check('Worker startup/post failures retain geometry, release workers and recover after an edit', async () => {
    failNextWorkerConstruction = true;
    set('Litz outer diameter', 180);
    await until(() => /Electrical analysis failed/.test(status()), 'Worker constructor error surfaced');
    assert.equal(active.size, 0);
    assert.match(side(), /Routing validationPassed/);
    assert.ok(!/Estimated Q/.test(side()), 'Failed analysis must not display old electrical estimates.');
    assert.match($('toasts').textContent, /Test Worker constructor unavailable/);
    failNextWorkerPost = true;
    set('Litz outer diameter', 190);
    await until(() => !failNextWorkerPost && /Electrical analysis failed/.test(status()), 'Worker postMessage error surfaced');
    assert.equal(active.size, 0);
    assert.ok(workers.at(-1).ended, 'Worker is terminated when posting fails.');
    assert.match(side(), /Routing validationPassed/);
    assert.match($('toasts').textContent, /Test Worker postMessage unavailable/);
    set('Litz outer diameter', 160);
    await until(() => active.size === 1, 'Worker retry after editing');
    await solved();
  });

  await check('Inspection and study settings persist without restarting electrical work', async () => {
    const count = workers.length, slider = input('Inspect transposition step');
    slider.value = '3'; slider.dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.equal(input('Inspect transposition step'), slider, 'Scrubbing retains the active slider node.');
    assert.match(side(), /Step 4 of/);
    set('Inspector strand or bundle', 'strand:2');
    set('Search maximum vias', 800);
    await pause(30);
    assert.equal(workers.length, count);
    button('Save').click();
    await until(() => [...designs.values()].some(d => d.config.litzInspectStep === 3), 'View and study settings saved');
    const saved = [...designs.values()].find(d => d.config.litzInspectStep === 3);
    assert.equal(saved.config.litzHighlight, 'strand:2');
    assert.equal(saved.config.litzStudySettings.search.vias, '800');
  });

  await check('Real study workers return references and cancel without accepting stale results', async () => {
    button('Compare reference winding').click();
    await until(() => active.size === 1, 'Reference study starts');
    const worker = workers.at(-1);
    assert.ok(worker.url.endsWith('/litz-tools-worker.js'));
    await until(() => active.size === 0 && /Conventional four-layer parallel spiral/.test(side()), 'Reference study completed');
    assert.ok(worker.response.result.ordinary);
    const reference = document.querySelector('[data-task-result="compare"]').textContent;
    button('Compare resolutions').click();
    await until(() => active.size === 1, 'Convergence study starts');
    const stale = workers.at(-1);
    button('Cancel Litz study').click();
    assert.equal(active.size, 0); assert.ok(stale.ended);
    stale.onmessage({ data: { result: { levels: [{ L: 999 }], limitations: ['STALE STUDY MUST NOT APPEAR'] } } });
    assert.ok(!side().includes('STALE STUDY MUST NOT APPEAR'));
    assert.equal(document.querySelector('[data-task-result="compare"]').textContent, reference);
    assert.match(side(), /Study canceled/);
  });

  await check('Bounded search applies checked geometry and manufacturing reports missing CLI accurately', async () => {
    set('Search turn spacings (mm)', '5.5');
    button('Search feasible candidates').click();
    await until(() => active.size === 0 && /Apply candidate 1/.test(side()), 'Candidate search completed');
    assert.equal(workers.at(-1).response.result.evaluated, 1);
    button('Apply candidate 1').click();
    await until(() => active.size === 1, 'Applied candidate analysis starts');
    await solved();
    assert.equal([...document.querySelectorAll('label')].find(label => label.textContent.trim() === 'Generate board outline')?.querySelector('input').checked, true);
    assert.equal(button('Run KiCad checks and package').disabled, false);
    $('design-name').value = 'Experimental Litz DOM';
    $('design-name').dispatchEvent(new w.Event('input', { bubbles: true }));
    button('Run KiCad checks and package').click();
    await until(() => /Native KiCad: unavailable/.test(side()), 'Native unavailability surfaced');
    const request = rpc.findLast(r => r.method === 'manufacturing.run');
    assert.equal(request.params.filename, 'Experimental-Litz-DOM.kicad_pcb');
    assert.match(request.params.boardText, /Edge.Cuts/);
    assert.equal(request.params.runDrc, true);
  });

  await check('Complex measurement residuals require explicit matching planes and do not launch workers', async () => {
    const count = workers.length;
    const upload = input('Import Litz impedance measurement');
    const file = new w.File(['frequencyhz,R,X\n1000000,1,10\n10000000,2,100'], 'measured.csv', { type: 'text/csv' });
    Object.defineProperty(upload, 'files', { value: [file], configurable: true });
    upload.dispatchEvent(new w.Event('change', { bubbles: true }));
    await until(() => /Measured R/.test(side()), 'Complex measurement imported');
    assert.match(side(), /Residuals are unavailable until/);
    assert.ok(!side().includes('Residual: model − measured'));
    set('Measurement reference plane', 'coil-terminals');
    assert.match(side(), /Residual: model − measured/);
    set('Measurement reference plane', 'other');
    assert.ok(!side().includes('Residual: model − measured'));
    assert.equal(workers.length, count);
  });

  await check('Starting a study immediately after an edit flushes pending previews', async () => {
    const count = workers.length;
    set('Litz outer diameter', 165);
    button('Compare reference winding').click(); // before requestAnimationFrame
    await until(() => workers.slice(count).some(worker => worker.messages[0]?.task === 'compare'), 'Immediate study starts');
    const study = workers.slice(count).find(worker => worker.messages[0]?.task === 'compare');
    assert.equal(study.messages[0].cfg.dOuter, 165);
    assert.equal(study.messages[0].geometry.config.dOuter, 165);
    await until(() => active.size === 0 && /Conventional four-layer parallel spiral/.test(side()), 'Immediate study finishes on current geometry');
    assert.ok(!side().includes('Running…'));
  });

  assert.deepEqual(domErrors, []);
  assert.equal(active.size, 0);
  console.log(`\n${checks} full-app Litz DOM/real-worker checks passed (canvas/layout and bridge transport stubbed).`);
} finally {
  await Promise.all(workers.map(worker => worker.terminate()));
  await w.happyDOM.abort();
  Object.assign(globalThis, nativeTimers);
}
