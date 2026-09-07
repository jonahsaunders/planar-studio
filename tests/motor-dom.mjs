/* Whole application DOM/events with real engines; canvas/layout are stubbed. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
document.querySelector('[data-ws="motor"]').click(); await new Promise(r => setTimeout(r, 220)); await solved();
const choose = async (label, value) => {
  const select = document.querySelector(`select[aria-label="${label}"]`);
  assert.ok(select, label); select.value = value; select.dispatchEvent(new w.Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 220)); await solved();
};
for (const shape of ['circle', 'racetrack', 'polygon', 'wedge']) {
  await choose('Coil shape', shape);
  assert.match(document.querySelector('#st-algo').textContent, /12 coils/);
  if (shape === 'racetrack') { set('Oval aspect ratio', 0.8); }
  if (shape === 'polygon') { set('Polygon sides', 4); }
  await new Promise(r => setTimeout(r, 220)); await solved();
  assert.match(document.querySelector('#side').textContent, /Star connection:/);
}
await choose('Coil shape', 'polygon');
await choose('Terminal breakout', 'phases');
assert.match(document.querySelector('#side').textContent, /neutral N stays internal/);
await choose('Terminal breakout', 'none');
assert.match(document.querySelector('#side').textContent, /no grouped terminal pads or breakout tails/);
set('Terminal position', -45); await new Promise(r => setTimeout(r, 220)); await solved();
button('Save'); await until(() => localStorage.getItem('planar.design.motor:m1'));
const saved = JSON.parse(localStorage.getItem('planar.design.motor:m1'));
assert.equal(saved.config.shape, 'polygon');
assert.equal(saved.config.sides, 4);
assert.equal(saved.config.terminalAngle, -45);
assert.equal(saved.config.motorGeometry, true);
assert.equal(saved.config.terminalBreakout, 'none');
set('Copper layers', 4); await new Promise(r => setTimeout(r, 220)); await solved();
assert.match(document.querySelector('#side').textContent, /requires exactly two series copper layers/);
set('Copper layers', 2); await new Promise(r => setTimeout(r, 220)); await solved();
set('Coils', 13); await new Promise(r => setTimeout(r, 220)); await solved();
assert.match(document.querySelector('#side').textContent, /divisible by the phase count/);
set('Coils', 12); await new Promise(r => setTimeout(r, 220)); await solved();
document.querySelector('#btn-export').click();
assert.equal(document.querySelectorAll('.export-card').length, 6); button('Close');
// Loading the saved design restores the new shape and routing controls.
set('Terminal position', 20); await new Promise(r => setTimeout(r, 220)); await solved();
await choose('Terminal breakout', 'phase-neutral');
const { api } = await import('../web/js/bridge.js');
api.listDesigns = async () => ({ designs: [{ id: 'motor:m1', name: 'M1', kind: 'motor', saved: 0 }] });
api.loadDesign = async () => saved;
button('Open…'); await until(() => document.querySelector('.export-card .t'));
document.querySelector('.export-card').click(); await new Promise(r => setTimeout(r, 220)); await solved();
assert.equal(document.querySelector('input[aria-label="Terminal position"]').value, '-45');
assert.equal(document.querySelector('select[aria-label="Terminal breakout"]').value, 'none');
for (const kind of ['inductor', 'motor']) {
  document.querySelector(`[data-ws="${kind}"]`).click(); await new Promise(r => setTimeout(r, 220)); await solved();
}
assert.equal(document.querySelector('select[aria-label="Coil shape"]').value, 'polygon');
assert.equal(document.querySelector('input[aria-label="Polygon sides"]').value, '4');
const visible=(label)=>{
  const n=document.querySelector(`[aria-label="${label}"]`);
  if(!n)return false;
  for(let p=n;p;p=p.parentElement)if(p.hidden||p.style.display==='none')return false;
  return true;
};
for(const [family,label,param,value]of [
  ['stepper','Holding torque estimate','Step command',3],
  ['linear','Mover force','Mover X',5],
  ['dual-rotor','Combined field at copper midplane','Upper rotor gap',2],
  ['planar','Mover force X','Y drive current',1.5],
]) {
  await choose('Motor family',family);
  assert.match(document.querySelector('#side').textContent,new RegExp(label));
  assert.ok(document.querySelector(`svg[aria-label="${family} motor preview"]`));
  assert.equal(visible('Speed'),family==='dual-rotor');
  assert.equal(visible('Mover Y'),family==='planar');
  assert.equal(visible('Coil shape'),family==='stepper'||family==='dual-rotor');
  assert.equal(visible('Terminal breakout'),family!=='planar');
  set(param,value);await new Promise(r=>setTimeout(r,220));await solved();
  button('Save');await until(()=>JSON.parse(localStorage.getItem('planar.design.motor:m1')).config.motorFamily===family);
  const snapshot=JSON.parse(localStorage.getItem('planar.design.motor:m1'));
  assert.equal(snapshot.config.motorFamily,family);
  assert.equal(snapshot.config.terminalBreakout,'none');
  await choose('Motor family','rotary');
  api.loadDesign=async()=>snapshot;
  button('Open…');await until(()=>document.querySelector('.export-card .t'));
  document.querySelector('.export-card').click();await new Promise(r=>setTimeout(r,220));await solved();
  assert.equal(document.querySelector('select[aria-label="Motor family"]').value,family);
  assert.equal(Number(document.querySelector(`input[aria-label="${param}"]`).value),value);
  document.querySelector('#btn-export').click();assert.equal(document.querySelectorAll('.export-card').length,6);button('Close');
}
await choose('Motor family','stepper');
await choose('Microsteps per full step','16');
const index=()=>Number(document.querySelector('input[aria-label="Step command"]').value);
const initial=index();button('Animate steps');await until(()=>index()!==initial);await solved();
button('Stop stepping');const stopped=index();await new Promise(r=>setTimeout(r,750));assert.equal(index(),stopped);
button('Animate steps');document.querySelector('[data-ws="inductor"]').click();
await new Promise(r=>setTimeout(r,750));await solved();
document.querySelector('[data-ws="motor"]').click();await new Promise(r=>setTimeout(r,220));await solved();
assert.equal(index(),stopped,'animation must not modify an inactive workspace');
assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent==='Animate steps'));
await choose('Motor family','planar');
set('Grid pitch',5);await until(()=>/overlap adjacent cells/.test(document.querySelector('#toasts').textContent));
assert.equal(document.querySelector('#side .tile'),null,'invalid geometry must clear stale results');
set('Grid pitch',20);await new Promise(r=>setTimeout(r,220));await solved();
const {state}=await import('../web/js/bridge.js');
let placements=0;api.place=async()=>{placements++;return {};};
state.hasBoard=true;state.context={nets:[]};
for(const family of ['planar','stepper']) {
  await choose('Motor family',family);
  const btn=document.querySelector('#btn-place');btn.disabled=false;btn.click();
  await until(()=>/Create these nets in KiCad/.test(document.querySelector('#toasts').textContent));
  assert.equal(placements,0,'missing independent nets must prevent placement');
}
state.hasBoard=false;state.context=null;
await choose('Motor family','rotary');
assert.equal(document.querySelector('select[aria-label="Coil shape"]').value,'polygon');
assert.equal(document.querySelector('select[aria-label="Terminal breakout"]').value,'none');
console.log('All motor families: controls, previews, step animation, save/load, exports, legacy settings and invalid-layout recovery passed.');
await w.happyDOM.close();
process.exit(0);
