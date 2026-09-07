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
for (const [kind, field, value] of [['antenna', 'Length tuning', 1.1], ['transformer', 'Primary turns', 7]]) {
  document.querySelector(`[data-ws="${kind}"]`).click(); await solved();
  set(field, value); await new Promise(r => setTimeout(r, 200)); await solved();
  button('Save'); await until(() => localStorage.getItem(`planar.design.${kind}:${kind === 'antenna' ? 'ant1' : 't1'}`));
  const saved = JSON.parse(localStorage.getItem(`planar.design.${kind}:${kind === 'antenna' ? 'ant1' : 't1'}`));
  assert.equal(saved.config[kind === 'antenna' ? 'lengthScale' : 'primaryTurns'], value);
  document.querySelector('#btn-export').click(); assert.equal(document.querySelectorAll('.export-card').length, 6); button('Close');
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
  await new Promise(r => setTimeout(r, 220)); await solved();
};
for (const family of ['inset-patch', 'dipole', 'folded-dipole', 'ifa', 'mifa', 'nfc', 'patch-array']) {
  await choose('Antenna type', family);
  assert.equal(document.querySelector('[data-key="nfc"]').hidden, family !== 'nfc');
  assert.equal(document.querySelector('[data-key="array"]').hidden, family !== 'patch-array');
  button('Save');
  await until(() => JSON.parse(localStorage.getItem('planar.design.antenna:ant1')).config.family === family);
  assert.ok(!/undefined|NaN/.test(document.querySelector('#side').textContent));
  if (family === 'nfc') {
    const before = Number(document.querySelector('[aria-label="Loop outer diameter"]').value);
    button('Size loop to target inductance'); await new Promise(r => setTimeout(r, 220)); await solved();
    assert.notEqual(Number(document.querySelector('[aria-label="Loop outer diameter"]').value), before);
  }
}
document.querySelector('[data-ws="transformer"]').click(); await solved();
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
console.log('Whole-app creator DOM flows passed: tabs, edits, saved configs, export dialogs, tools, all antenna/transformer families, target sizing, core materials and invalid-state recovery. Canvas/layout not tested.');
await w.happyDOM.abort();
process.exit(0);
