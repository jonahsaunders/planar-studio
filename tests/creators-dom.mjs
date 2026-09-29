/* Whole application DOM/events with real engines; canvas/layout are stubbed. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Worker as NodeWorker } from 'node:worker_threads';
let liveWorkers=0;
globalThis.Worker=class {
  constructor(url){liveWorkers++;this.queue=[];this.ready=false;this.ended=false;this.worker=new NodeWorker(new URL('./helpers/study-node-worker.mjs',import.meta.url),{workerData:{url:String(url)}});this.worker.on('message',data=>{if(data.ready){this.ready=true;this.queue.forEach(m=>this.worker.postMessage(m));this.queue=[];}else this.onmessage?.({data});});this.worker.on('error',error=>this.onerror?.({message:error.message}));}
  postMessage(m){this.ready?this.worker.postMessage(m):this.queue.push(m);}
  terminate(){if(!this.ended){this.ended=true;liveWorkers--;}this.worker.terminate();}
};
const { Window } = await import(process.env.PLANAR_DOM_MODULE || 'happy-dom');
const w = new Window({ url: 'http://localhost/', settings: { disableCSSFileLoading: true, disableJavaScriptFileLoading: true } });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLCanvasElement', 'Event', 'KeyboardEvent', 'MouseEvent', 'File', 'Blob', 'ResizeObserver', 'localStorage']) globalThis[key] = key === 'window' ? w : w[key];
globalThis.getComputedStyle = w.getComputedStyle.bind(w);
globalThis.requestAnimationFrame = w.requestAnimationFrame.bind(w);
globalThis.cancelAnimationFrame = w.cancelAnimationFrame.bind(w);
w.HTMLCanvasElement.prototype.getContext = () => new Proxy({ measureText: s => ({ width: String(s).length * 6 }) }, { get: (o, k) => o[k] ?? (() => {}), set: (o, k, v) => (o[k] = v, true) });
w.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });
w.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [this.getBoundingClientRect()]; };
document.write(fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8').replace(/<script[\s\S]*?<\/script>/, ''));
await import('../web/js/app.js');
document.dispatchEvent(new w.Event('DOMContentLoaded'));
const until = async (fn) => { const end = Date.now() + 10000; while (!fn()) { if (Date.now() > end) throw new Error(document.querySelector('#st-solve').textContent); await new Promise(r => setTimeout(r, 20)); } };
const solved = () => until(() => document.querySelector('#side .tile') && !document.querySelector('#st-solve').textContent.includes('solving'));
const button = (text) => { const b = [...document.querySelectorAll('button')].find(n => n.textContent === text); assert.ok(b, `button ${text}`); b.click(); };
const set = (name, value) => { const input = document.querySelector(`input[aria-label="${name}"]`); assert.ok(input, name); input.value = String(value); input.dispatchEvent(new w.Event('change', { bubbles: true })); };
await solved();
for (const [kind, field, value] of [['antenna', 'Length tuning', 1.1], ['transformer', 'Primary turns', 7]]) {
  document.querySelector(`[data-ws="${kind}"]`).click(); await solved();
  set(field, value); await new Promise(r => setTimeout(r, 200)); await solved();
  button('Save'); await until(() => localStorage.getItem(`planar.design.${kind}:${kind === 'antenna' ? 'ant1' : 't1'}`));
  const saved = JSON.parse(localStorage.getItem(`planar.design.${kind}:${kind === 'antenna' ? 'ant1' : 't1'}`));
  assert.equal(saved.config[kind === 'antenna' ? 'lengthScale' : 'primaryTurns'], value);
  document.querySelector('#btn-export').click(); assert.equal(document.querySelectorAll('.export-card').length, kind==='transformer'?7:6); button('Close');
  document.querySelector('#btn-tools').click();
  assert.equal(document.querySelector('[data-tool="board"]').getAttribute('aria-pressed'), 'true');
  document.querySelector('[data-tool="tolerance"]').click();
  assert.match(document.querySelector('.tools-content').textContent, /main workspace/); button('Close');
}
set('Primary turns', 60); await until(() => document.querySelector('#st-algo').textContent === 'geometry failed');
assert.equal(document.querySelectorAll('#side .tile').length, 0);
document.querySelector('#btn-export').click(); assert.equal(document.querySelectorAll('.export-card').length, 0);
set('Primary turns', 6); await solved();
for (const kind of ['inductor', 'motor', 'filter', 'antenna']) { document.querySelector(`[data-ws="${kind}"]`).click(); await new Promise(r => setTimeout(r, 200)); await solved(); }
assert.equal(Number(document.querySelector('[aria-label="Length tuning"]').value), 1.1);
// Exercise every family through the real panel/reconcile/save pipeline.
const choose = async (label, value) => {
  const select = document.querySelector(`select[aria-label="${label}"]`);
  assert.ok(select, label); select.value = value; select.dispatchEvent(new w.Event('change', { bubbles: true }));
  if(['Transformer type','Catalog core assembly'].includes(label)) { const apply=[...document.querySelectorAll('button')].find(b=>b.textContent==='Apply preset');if(apply)apply.click(); }
  await new Promise(r => setTimeout(r, 220)); await solved();
};
for (const family of ['circular-patch', 'slot', 'inset-patch', 'dipole', 'folded-dipole', 'ifa', 'mifa', 'nfc', 'vivaldi', 'yagi', 'lpda', 'bowtie', 'patch-array']) {
  await choose('Antenna type', family);
  assert.equal(document.querySelector('[data-key="nfc"]').hidden, family !== 'nfc');
  assert.equal(document.querySelector('[data-key="array"]').hidden, family !== 'patch-array');
  assert.equal(document.querySelector('[data-key="directional"]').hidden, !['vivaldi', 'yagi', 'lpda', 'bowtie'].includes(family));
  button('Save');
  await until(() => JSON.parse(localStorage.getItem('planar.design.antenna:ant1')).config.family === family);
  assert.ok(!/undefined|NaN/.test(document.querySelector('#side').textContent));
  if (family === 'nfc') {
    const before = Number(document.querySelector('[aria-label="Loop outer diameter"]').value);
    button('Size loop to target inductance'); await new Promise(r => setTimeout(r, 220)); await solved();
    assert.notEqual(Number(document.querySelector('[aria-label="Loop outer diameter"]').value), before);
  }
  const field = { vivaldi: ['Vivaldi aperture width', 50, 'vivaldiAperture'], yagi: ['Yagi directors', 7, 'yagiDirectors'], lpda: ['Log-periodic elements', 10, 'lpdaElements'], bowtie: ['Bow-tie flare angle', 75, 'bowtieAngle'] }[family];
  if (field) {
    set(field[0], field[1]); await new Promise(r => setTimeout(r, 220)); await solved();
    button('Save');
    await until(() => JSON.parse(localStorage.getItem('planar.design.antenna:ant1')).config[field[2]] === field[1]);
    document.querySelector('#btn-export').click(); assert.equal(document.querySelectorAll('.export-card').length, 6); button('Close');
  }
}
// Large array dimensions must survive actual controls and saved designs.
set('Array rows', 32); set('Array columns', 32);
await new Promise(r => setTimeout(r, 220)); await solved();
assert.match(document.querySelector('#side').textContent, /1024/);
assert.match(document.querySelector('#side').textContent, /Overall board W × H/);
button('Save');
await until(() => JSON.parse(localStorage.getItem('planar.design.antenna:ant1')).config.arrayCols === 32);
assert.equal(JSON.parse(localStorage.getItem('planar.design.antenna:ant1')).config.arrayRows, 32);
document.querySelector('[data-ws="transformer"]').click(); await solved();
button('3 Windings');
for (const family of ['multilayer', 'center-tapped', 'multi-secondary', 'interleaved', 'ferrite']) {
  await choose('Transformer type', family);
  assert.equal(document.querySelector('[data-key="core"]').hidden, family !== 'ferrite');
  button('Save');
  await until(() => JSON.parse(localStorage.getItem('planar.design.transformer:t1')).config.family === family);
  if (family === 'center-tapped') assert.match(document.querySelector('#side').textContent, /S_CT/);
  if (family === 'ferrite') {
    await choose('Core material', 'N87');
    assert.match(document.querySelector('#side').textContent, /TDK N87/);
    set('Core post width / diameter', 100);
    await until(() => document.querySelector('#st-algo').textContent === 'geometry failed');
    assert.equal(document.querySelectorAll('#side .tile').length, 0);
    set('Core post width / diameter', 6); await new Promise(r => setTimeout(r, 220)); await solved();
  }
}
// New winding editor, loaded circuit and explicit board refresh.
await choose('Transformer type', 'multilayer');
assert.equal(document.querySelectorAll('.winding-row').length, 4);
await choose('Drive model', 'voltage');
assert.match(document.querySelector('#side').textContent, /Loaded primary current/);
set('S load resistance', 25); await new Promise(r => setTimeout(r, 220)); await solved();
await choose('S termination', 'open');
assert.match(document.querySelector('#side').textContent, /open; 0 A/);
await choose('S termination', 'load');
const winding = document.querySelector('[aria-label="Winding on section 2"]');
winding.value = 'S'; winding.dispatchEvent(new w.Event('change', { bubbles: true }));
await new Promise(r => setTimeout(r, 220)); await solved();
button('Save');
await until(() => JSON.parse(localStorage.getItem('planar.design.transformer:t1')).config.stackPlan === 'P,S,S,S');
const savedLoad = JSON.parse(localStorage.getItem('planar.design.transformer:t1')).config;
assert.equal(savedLoad.driveMode, 'voltage'); assert.equal(savedLoad.loadR, 25);
document.querySelector('[aria-label="Move winding 1 down"]').click();
await new Promise(r => setTimeout(r, 220)); await solved();
assert.equal(document.querySelector('[aria-label="Winding assignment, front to back"]').value, 'S,P,S,S');
button('Add winding layer');
await new Promise(r => setTimeout(r, 220)); await solved();
assert.equal(document.querySelectorAll('.winding-row').length, 5);
document.querySelector('[aria-label="Remove section 5"]').click();
await new Promise(r => setTimeout(r, 220)); await solved();
set('Copper height for section 2 (mm)', 0.3);
await new Promise(r => setTimeout(r, 220)); await solved();
assert.match(document.querySelector('[aria-label="Copper center heights (optional, mm)"]').value, /0.3/);
button('Use automatic spacing');
await new Promise(r => setTimeout(r, 220)); await solved();
assert.equal(document.querySelector('[aria-label="Copper center heights (optional, mm)"]').value, '');
const bridge = await import('../web/js/bridge.js');
bridge.state.standalone = false;
bridge.state.context = { layerCount: 2, thickness: 1.6 };
set('Outer diameter', 41);
await until(() => document.querySelector('#st-algo').textContent === 'geometry failed');
assert.match(document.querySelector('.layer-assistant').textContent, /Requires 4 copper layers · Board has 2/);
assert.match(document.querySelector('.layer-assistant').textContent, /Physical Stackup/);
bridge.api.context = async () => ({ layerCount: 4, thickness: 2, warnings: [] });
button('Refresh board settings');
await new Promise(r => setTimeout(r, 220)); await solved();
assert.match(document.querySelector('.layer-assistant').textContent, /Board has 4 · Layer count ready/);
assert.equal(Number(document.querySelector('[aria-label="Winding separation"]').value), 2);
// Regression: adopting context must retain the config object bound to Panel.
set('Primary turns', 8); await new Promise(r => setTimeout(r, 220)); await solved();
button('Save');
await until(() => JSON.parse(localStorage.getItem('planar.design.transformer:t1')).config.primaryTurns === 8);
assert.equal(JSON.parse(localStorage.getItem('planar.design.transformer:t1')).config.boardT, 2);
bridge.api.context = async () => { throw new Error('No PCB open'); };
button('Refresh board settings'); await until(() => document.querySelector('.layer-assistant').textContent.includes('No PCB open'));
assert.equal([...document.querySelectorAll('button')].find(b => b.textContent === 'Refresh board settings').disabled, false);
// Independent magnetic/topology controls, cross-section, parallel branches,
// immutable comparison snapshots and catalog assembly survive the real UI.
bridge.state.context=null;bridge.state.standalone=true;
await choose('Transformer type','ferrite');
set('Primary turns',6);await new Promise(r=>setTimeout(r,220));await solved();
await choose('Winding connections','multiple-tapped');
assert.match(document.querySelector('#side').textContent,/S_CT/);
assert.equal(document.querySelectorAll('.winding-row').length,5);
await choose('Winding connections','standard');
await choose('Leakage calculation','geometry');
await choose('S section connection','parallel');
assert.match(document.querySelector('#side').textContent,/parallel/);
assert.equal(document.querySelectorAll('#side .chart').length,5);
document.querySelector('[aria-label="Highlight section 2"]').click();
assert.ok(document.querySelectorAll('[data-transformer-layer][data-selected="true"]').length>=2);
set('Candidate name','Parallel candidate'); // generic helper dispatches change
document.querySelector('[aria-label="Candidate name"]').value='Parallel candidate';
button('Pin current design');await new Promise(r=>setTimeout(r,220));await solved();
assert.equal(document.querySelectorAll('.transformer-comparisons .transformer-candidate').length,1);
set('Primary turns',8);await new Promise(r=>setTimeout(r,220));await solved();
button('Restore candidate');await new Promise(r=>setTimeout(r,220));await solved();
assert.equal(Number(document.querySelector('[aria-label="Primary turns"]').value),6);
await choose('Catalog core assembly','eelp32');
assert.match(document.querySelector('.core-assembly').textContent,/B66457G0000X187/);
assert.equal(Number(document.querySelector('[aria-label="Outer diameter"]').value),22);
assert.ok(document.querySelector('.transformer-preview svg'));
button('Save');await until(()=>JSON.parse(localStorage.getItem('planar.design.transformer:t1')).config.corePreset==='eelp32');
assert.equal(JSON.parse(localStorage.getItem('planar.design.transformer:t1')).config.candidates.length,1);
button('Remove candidate');await new Promise(r=>setTimeout(r,220));await solved();
assert.equal(document.querySelectorAll('.transformer-comparisons .transformer-candidate').length,0);
// Guided workflow, reversible edits, review-before-apply and real study workers.
button('4 Verify');assert.equal(document.querySelector('[data-key="transformer-verification"]').hidden,false);assert.equal(document.querySelector('[data-key="windings"]').hidden,true);
button('3 Windings');const originalTurns=Number(document.querySelector('[aria-label="Primary turns"]').value);
set('Primary turns',originalTurns+1);await new Promise(r=>setTimeout(r,220));await solved();button('Undo');await new Promise(r=>setTimeout(r,220));await solved();assert.equal(Number(document.querySelector('[aria-label="Primary turns"]').value),originalTurns);
button('Redo');await new Promise(r=>setTimeout(r,220));await solved();assert.equal(Number(document.querySelector('[aria-label="Primary turns"]').value),originalTurns+1);
const core=document.querySelector('[aria-label="Catalog core assembly"]');core.value='eilp32';core.dispatchEvent(new w.Event('change',{bubbles:true}));assert.ok([...document.querySelectorAll('.transformer-preset-preview')].some(n=>n.textContent.includes('Review')));assert.match(document.querySelector('.core-assembly').textContent,/B66457/);button('Cancel preset');
assert.ok(document.querySelector('[aria-label="Restore checkpoint"]').options.length>1);
button('2 Candidates');button('Pin current design');await new Promise(r=>setTimeout(r,220));await solved();button('Compare table and curves');await until(()=>liveWorkers===0);assert.equal(document.querySelectorAll('.transformer-review-plot').length,4);
const normalized=document.querySelector('[aria-label="Use current operating point for all candidates"]');normalized.checked=true;normalized.dispatchEvent(new w.Event('change'));await until(()=>liveWorkers===0);assert.match(document.querySelector('.transformer-review-body').textContent,/Lowest copper loss/);button('Close');
button('4 Verify');button('Check operating envelope');button('Run study');await until(()=>liveWorkers===0);assert.match(document.querySelector('.transformer-review-body').textContent,/unknown temperature/);button('Close');
button('Study fabrication tolerances');set('Samples (5–200)',5);button('Run study');await until(()=>liveWorkers===0);assert.match(document.querySelector('.transformer-review-body').textContent,/Sensitivity/);button('Run study');assert.equal(liveWorkers,1);button('Close');assert.equal(liveWorkers,0);
button('Measure and calibrate');set('Fixture and reference plane','Terminals');const measurement=document.querySelector('[aria-label="Measurement test"]');measurement.value='loaded';measurement.dispatchEvent(new w.Event('change'));
const file=document.querySelector('[aria-label="Transformer measurement file"]');Object.defineProperty(file,'files',{value:[{name:'loaded.csv',size:100,text:async()=> 'Frequency (Hz),Gain_dB\n80000,-6\n120000,-6'}]});file.dispatchEvent(new w.Event('change'));await until(()=>document.querySelector('.transformer-test'));button('Compare measured and predicted');await until(()=>liveWorkers===0);assert.equal(document.querySelectorAll('.transformer-review-plot').length,1);assert.match(document.querySelector('.transformer-review-body').textContent,/RMSE/);button('Close');
button('Review board placement');assert.ok(document.querySelector('[aria-label="Destination KiCad board file"]'));assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='Place reviewed transformer').disabled,true);button('Close');
button('5 Export');assert.equal(document.querySelector('[data-key="transformer-export"]').hidden,false);button('Export build package and files');assert.match(document.querySelector('.export-grid').textContent,/Transformer build package/);button('Close');
console.log('Guided workflow, undo/redo, preset preview, checkpoints, comparison, operating envelope, tolerances, worker cleanup, measurement overlays and placement review passed.');
console.log('Whole-app creator DOM flows passed, including composed transformers, parallel windings, charts, selection, candidate restore and catalog persistence. Canvas/layout not tested.');
await w.happyDOM.abort();
process.exit(0);
