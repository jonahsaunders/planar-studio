/* Real parameter controls, mode reconciliation and saved-configuration replay.
   Routing/physics assertions live in the Litz engine suites. */
import assert from 'node:assert/strict';
const { Window } = await import(process.env.PLANAR_DOM_MODULE || 'happy-dom');
const w = new Window({ url: 'http://localhost/' });
globalThis.document = w.document;
const { Panel } = await import('../web/js/ui/controls.js');
const { defaults, reconcile, rail, compute, tiles, spec, notes, charts } = await import('../web/js/ws/inductor.js');
const { litzPreset } = await import('../web/js/engine/litz.js');

function mount(config) {
  const host = document.createElement('div'); document.body.append(host);
  let panel;
  const api = {
    set(key, value) { config[key] = value; reconcile(config, key, value); panel.sync(); },
    setMany(values) { Object.assign(config, values); for (const [key, value] of Object.entries(values)) reconcile(config, key, value); panel.sync(); },
  };
  panel = new Panel(host, config, (key, value) => { reconcile(config, key, value); panel.sync(); });
  rail(panel, api); panel.sync();
  const change = (label, value) => {
    const node = host.querySelector(`[aria-label="${label}"]`); assert.ok(node, `Control: ${label}`);
    node.value = String(value); node.dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  return { host, change, panel };
}

const original = defaults();
assert.equal(original.windingMode, 'spiral');
assert.equal(original.dOuter, 24); assert.equal(original.turns, 8); assert.equal(original.layers, 2);
assert.ok(compute(original, {}, { quick: true }).coil, 'Existing defaults remain conventional spirals.');
const ui = mount(original);
assert.equal(ui.host.querySelector('[data-key="litz-winding"]').hidden, true);
ui.change('Winding mode', 'pcb-litz');
assert.equal(original.litzConfigured, true); assert.equal(original.layers, 4);
assert.equal(original.obstacleEnabled, false); assert.equal(original.arrayEnabled, false);
assert.equal(ui.host.querySelector('[data-key="litz-winding"]').hidden, false);
assert.equal(ui.host.querySelector('[data-key="shape"]').hidden, true);
assert.equal(ui.host.querySelector('[data-key="process"]').hidden, true);
assert.equal(ui.host.querySelector('[aria-label="Litz outer diameter"]').value, String(original.dOuter), 'Shared controls synchronize after activation.');

ui.change('Litz outer diameter', original.dOuter + 10);
ui.change('Dielectric gap 2 (mm)', 0.55);
ui.change('Litz via plating', 30);
ui.change('Litz model resolution', '192');
assert.equal(original.litzModelSegments, 192);
ui.change('Highlight Litz copper', 'strand:3');
assert.equal(original.litzDielectricGaps[1], 0.55);
assert.equal(original.litzViaPlating, 30);
const saved = JSON.parse(JSON.stringify({ kind: 'inductor', config: original }));
const restored = mount({ ...defaults(), ...saved.config });
assert.equal(restored.host.querySelector('[aria-label="Winding mode"]').value, 'pcb-litz');
assert.equal(restored.host.querySelector('[aria-label="Dielectric gap 2 (mm)"]').value, '0.55');
assert.equal(restored.host.querySelector('[aria-label="Highlight Litz copper"]').value, 'strand:3');
assert.equal(restored.host.querySelector('[aria-label="Litz outer diameter"]').value, String(original.dOuter));
assert.equal(restored.host.querySelector('[aria-label="Litz model resolution"]').value, '192');
const modifiedDiameter = original.dOuter;
ui.change('Winding mode', 'spiral'); ui.change('Winding mode', 'pcb-litz');
assert.equal(original.dOuter, modifiedDiameter, 'Returning to Litz preserves edited settings.');
const presetButton = [...ui.host.querySelectorAll('button')].find(b => b.textContent === 'Load paper-inspired preset');
assert.ok(presetButton); presetButton.click();
const preset = litzPreset();
assert.equal(original.dOuter, preset.dOuter); assert.equal(original.litzStepDeg, preset.litzStepDeg);
assert.deepEqual(original.litzDielectricGaps, preset.litzDielectricGaps);
assert.equal(original.litzHighlight, 'all');
assert.equal(ui.host.querySelector('[aria-label="Litz outer diameter"]').value, String(preset.dOuter));

ui.change('Highlight Litz copper', 'strand:3');
const geometry = compute(original, {}, { quick: true });
assert.ok(geometry.litz); assert.equal(geometry.coil, undefined);
assert.equal(geometry.validation.ok, true, 'The selectable preset must pass the current routing validator.');
assert.equal(geometry.art.meta.previewStrandId, 3); assert.equal(geometry.art.meta.previewBundle, null);
ui.change('Highlight Litz copper', 'inner');
const bundle = compute(original, {}, { quick: true });
assert.equal(bundle.art.meta.previewStrandId, null); assert.equal(bundle.art.meta.previewBundle, 'inner');

// Exercise display contracts with an explicit unknown self-resonance result;
// the conventional model must not leak a thermal rating or Dowell claim.
const shown = { ...bundle, analysis: { L: 3e-6, Rdc: .1, Rac: .2, Q: 100, Fr: 2, Ploss: .2,
  srf: Infinity, srfKnown: false, Ctot: 0, method: 'Experimental test fixture', warnings: [], limitations: [],
  currentShares: [{ id: 0, bundle: 'outer', percent: 6.25, phase: 0, Rdc: 1.6 }] },
  sweep: [{ f: 1e6, Q: 100, R: .2, Z: 20 }] };
assert.equal(tiles(original, shown).find(t => t.k === 'Self-resonance').v, 'Unknown');
assert.ok(tiles(original, shown).some(t => t.k === 'Estimated Q'));
const display = JSON.stringify([tiles(original, shown), spec(original, shown), notes(original, shown), charts(original, shown)]);
assert.ok(!display.includes('Dowell')); assert.ok(!display.includes('IPC-2221'));
assert.ok(display.includes('344.5') && display.includes('do not validate'));
assert.ok(display.includes('unknown') && display.includes('Estimated strand currents'));

console.log('PCB Litz UI mode, controls, preset, highlighting, saved-config replay and experimental readouts passed.');
await w.happyDOM.close();
