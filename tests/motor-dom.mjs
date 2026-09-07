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
console.log('Motor controls, shape-specific fields, recomputation, save, export and routing errors passed.');
await w.happyDOM.close();
process.exit(0);
