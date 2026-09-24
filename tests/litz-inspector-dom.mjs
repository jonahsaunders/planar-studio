/* Actual generated paths plus real DOM events. Worker execution and native
   commands remain host responsibilities; this checks their UI contracts. */
import assert from 'node:assert/strict';
const { Window } = await import(process.env.PLANAR_DOM_MODULE || 'happy-dom');
const w = new Window({ url: 'http://localhost/' });
globalThis.document = w.document;
const { defaults, reconcile, compute, rail, charts, tiles } = await import('../web/js/ws/inductor.js');
const { Panel } = await import('../web/js/ui/controls.js');
const { renderLitzInspector } = await import('../web/js/ui/litz-inspector.js');
const { renderLitzTools } = await import('../web/js/ui/litz-tools.js');
const { parseMeasurement } = await import('../web/js/engine/measurements.js');

const cfg = defaults(); reconcile(cfg, 'windingMode', 'pcb-litz');
const geometry = compute(cfg, {}, { quick: true });
assert.equal(geometry.validation.ok, true);
const copperBefore = JSON.stringify(geometry.art);
const calls = [], focus = [];
const inspector = renderLitzInspector({ ...cfg, litzHighlight: 'strand:0' }, {
  ...geometry, validation: { ...geometry.validation, errors: [{ code: 'clearance', message: 'Fixture finding', strandIds: [0, 1], layer: 'F.Cu', at: [2, 3] }] },
}, { set: (...args) => calls.push(args), focusFinding: (...args) => focus.push(args) });
document.body.append(inspector);
const range = inspector.querySelector('[aria-label="Inspect transposition step"]');
assert.ok(range); assert.ok(inspector.querySelector('svg[aria-label="Exploded four-layer PCB Litz copper"]'));
assert.equal(inspector.querySelectorAll('g[data-layer]').length, 4);
assert.ok(inspector.querySelectorAll('line[data-via-strand="0"]').length > 0, 'Selected strand includes its actual connected vias.');
range.value = '0'; range.dispatchEvent(new w.Event('input', { bubbles: true }));
assert.deepEqual(calls.at(-1), ['litzInspectStep', 0]);
assert.equal(inspector.querySelector('[aria-label="Inspect transposition step"]'), range, 'Scrubbing retains the active range node.');
assert.ok(inspector.textContent.includes('Step 1 of'));
const selector = inspector.querySelector('[aria-label="Inspector strand or bundle"]');
selector.value = 'all'; selector.dispatchEvent(new w.Event('change', { bubbles: true }));
assert.ok(inspector.querySelectorAll('line[data-via-strand]').length > 0, 'A chosen step shows its actual via connections.');
for (const line of inspector.querySelectorAll('line[data-via-strand]')) {
  assert.notEqual(line.dataset.from, line.dataset.to);
  assert.ok(['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'].includes(line.dataset.from));
}
[...inspector.querySelectorAll('button')].find(button => button.textContent.startsWith('clearance')).click();
assert.deepEqual(focus[0][0], [2, 3]); assert.equal(focus[0][1].layer, 'F.Cu');
assert.equal(JSON.stringify(geometry.art), copperBefore, 'Inspection does not change the checked/exported copper.');

// New size/process/model inputs use the same real rail and reconciliation path.
const railHost = document.createElement('div'); document.body.append(railHost);
const edited = { ...defaults(), ...cfg }, set = (key, value) => { edited[key] = value; reconcile(edited, key, value); panel.sync(); };
const panel = new Panel(railHost, edited, (key, value) => { reconcile(edited, key, value); panel.sync(); });
rail(panel, { set, setMany: values => { Object.assign(edited, values); for (const [key, value] of Object.entries(values)) reconcile(edited, key, value); panel.sync(); } }); panel.sync();
const change = (label, value) => { const input = railHost.querySelector(`[aria-label="${label}"]`); assert.ok(input, label); input.value = String(value); input.dispatchEvent(new w.Event('change', { bubbles: true })); };
change('Litz size constraint', 'finished'); change('Maximum finished copper diameter', 180); change('Minimum finished copper bore', 35);
assert.equal(edited.litzSizeMode, 'finished'); assert.equal(edited.litzTargetOuter, 180); assert.equal(edited.litzMinBore, 35);
change('Litz coil turns', 12);
const sizingHelp = railHost.querySelector('[aria-label="Litz sizing guidance"]');
assert.equal(sizingHelp.dataset.fit, 'failed');
assert.ok(sizingHelp.textContent.includes('bore'));
const sizingApply = [...sizingHelp.querySelectorAll('button')].find(node => node.textContent === 'Apply sizing suggestion 1');
assert.ok(sizingApply, 'Sizing suggestions remain in the rail when geometry cannot be generated.');
const beforeSuggestion = JSON.stringify(edited); panel.sync();
assert.equal(JSON.stringify(edited), beforeSuggestion, 'Sizing suggestions never apply themselves on a quick refresh.');
assert.equal(sizingHelp.querySelector('button'), sizingApply, 'An unchanged fit check retains its controls.');
sizingApply.click();
assert.ok(edited.turns < 12); assert.equal(edited.litzTargetOuter, 180); assert.equal(edited.litzMinBore, 35);
assert.equal(sizingHelp.dataset.fit, 'passed');
assert.equal(compute(edited, {}, { quick: true }).validation.ok, true, 'Applied sizing suggestion passes the ordinary full routing validation.');
change('Litz terminal pad diameter', 2); change('Litz terminal bus width', 1);
assert.equal(edited.litzTerminalPad, 2); assert.equal(edited.litzBusWidth, 1);
change('Litz fabrication profile', 'conservative'); change('Etch allowance per edge', .04);
assert.equal(edited.litzFabProfile, 'custom'); assert.equal(edited.litzFabRules.etchAllowance, .04);
const pair = railHost.querySelector('[aria-label="Allow In1.Cu-In2.Cu vias"]'); pair.click();
assert.ok(!edited.litzFabRules.allowedViaPairs.includes('In1.Cu-In2.Cu'));
change('Litz distributed capacitance', 'distributed'); change('Capacitance cells per strand', 3); change('Litz dielectric loss tangent', .015);
assert.equal(edited.litzCapacitanceCells, 3); assert.equal(edited.litzTanD, .015);

const requested = [], applied = [], settings = [], downloads = [], measurements = [];
const data = parseMeasurement('f (MHz),R (ohm),X (ohm)\n5,0.4,90\n8,0.5,140', 'coil.csv');
const savedCfg = { ...cfg, measurement: data, litzMeasurementOptions: { referencePlane: 'other', interpolation: 'linear' },
  litzStudySettings: { search: { turns: '4,5', widths: '.7,.8', pitches: '5.5', steps: '30', vias: '900', diameter: '180', bore: '30', target: '2.5' } } };
const fab = { ok: true, summary: { checkedClearanceMM: .2, minAnnulusMM: .15, maxAspectRatio: 2, platingUM: 25 }, viaPairs: [], errors: [], warnings: [] };
const api = { onTask: (...args) => requested.push(args), onApply: value => applied.push(value), onSettings: (...args) => settings.push(args),
  onDownload: file => downloads.push(file), onMeasure: (...args) => measurements.push(args), results: {} };
const tools = renderLitzTools(savedCfg, { ...geometry, manufacturing: fab }, api); document.body.append(tools);
const button = (host, label) => { const b = [...host.querySelectorAll('button')].find(node => node.textContent === label); assert.ok(b, label); return b; };
button(tools, 'Search feasible candidates').click();
assert.equal(requested.at(-1)[0], 'search'); assert.deepEqual(requested.at(-1)[1].turns, [4, 5]);
assert.ok(Math.abs(requested.at(-1)[1].targetL - 2.5e-6) < 1e-18); assert.equal(requested.at(-1)[1].maxModelEvaluations, 2);
assert.equal(settings.at(-1)[0], 'search'); assert.equal(settings.at(-1)[1].target, '2.5');
assert.equal(applied.length, 0, 'Starting or rendering a study does not apply a design.');
button(tools, 'Compare resolutions').click(); assert.deepEqual(requested.at(-1)[1].levels, [48, 96, 192]);
assert.equal(requested.at(-1)[1].tolerance, .02);
button(tools, 'Compare reference winding').click(); assert.equal(requested.at(-1)[0], 'compare');
assert.equal(tools.querySelector('[aria-label="Measurement reference plane"]').value, 'other');
assert.equal(tools.querySelector('[aria-label="Measurement interpolation"]').value, 'linear');
const plane = tools.querySelector('[aria-label="Measurement reference plane"]'); plane.value = 'coil-terminals'; plane.dispatchEvent(new w.Event('change', { bubbles: true }));
assert.equal(measurements.at(-1)[0], data); assert.equal(measurements.at(-1)[1].referencePlane, 'coil-terminals');
button(tools, 'Run KiCad checks and package').click(); assert.equal(requested.at(-1)[0], 'manufacturing');

const file = { name: 'review.zip', encoding: 'base64', mime: 'application/zip', content: 'UEs=' };
const finished = renderLitzTools(savedCfg, { ...geometry, manufacturing: fab }, { ...api, results: {
  convergence: { status: 'running' },
  search: { status: 'done', result: { evaluated: 2, candidates: [{ config: { ...cfg, turns: 4 }, metrics: { Rdc: .04, viaCount: 384, outerDiameterMM: 160, innerDiameterMM: 50 } }] } },
  manufacturing: { status: 'done', result: { available: false, status: 'unavailable', message: 'kicad-cli is not installed.', checks: {}, files: [file] } },
} }); document.body.append(finished);
assert.equal(finished.open, true); button(finished, 'Cancel Litz study').click(); assert.equal(requested.at(-1)[0], 'cancel');
button(finished, 'Apply candidate 1').click(); assert.equal(applied.at(-1).turns, 4);
assert.ok(finished.querySelector('[data-task-result="manufacturing"]').textContent.includes('CLI unavailable'));
button(finished, 'Download review.zip').click(); assert.equal(downloads.at(-1), file);
const invalidFab = renderLitzTools(cfg, { ...geometry, manufacturing: { ok: false, errors: [], summary: {}, viaPairs: [] } }, api);
assert.equal(button(invalidFab, 'Run KiCad checks and package').disabled, true);

// Measurement overlay chart IDs all use terminal impedance, even when an
// internal copper-loss field has a deliberately different value.
const terminal = charts(cfg, { sweep: [{ f: 1e6, Zr: 2, Zi: 10, Z: Math.hypot(2, 10), copperR: .1, Rac: .2, Q: 99 }] });
assert.equal(terminal.find(c => c.id === 'rac').spec.series[0].values[0], 2);
assert.equal(terminal.find(c => c.id === 'q').spec.series[0].values[0], 5);
assert.equal(terminal.find(c => c.id === 'l').spec.series[0].values[0], 10 / (2 * Math.PI * 1e6));
assert.equal(terminal.find(c => c.id === 'litz-copper-r').spec.series[0].values[0], .1);
const capacitive = tiles({ ...cfg, litzCapacitanceMode: 'distributed' }, { ...geometry, analysis: { L: -1e-6, Rdc: .1, Rac: 2, Zr: 2, Zi: -10, Q: -5, Ploss: .1 } });
assert.equal(capacitive.find(t => t.k === 'Estimated L').v, 'Capacitive');
assert.equal(capacitive.find(t => t.k === 'Estimated Q').v, '—');
console.log('Litz inspector, sizing/rules/model controls, study callbacks/settings, measurement reference replay, native-result downloads and terminal chart semantics passed.');
await w.happyDOM.close();
