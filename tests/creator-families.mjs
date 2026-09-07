/* Independent geometry, model-boundary and export regressions for every family. */
import assert from 'node:assert/strict';
import * as antenna from '../web/js/ws/antenna.js';
import * as transformer from '../web/js/ws/transformer.js';
import { ANTENNA_FAMILIES, sizeNfcLoop } from '../web/js/engine/antenna.js';
import { STACK_PRESETS, CORE_MATERIALS } from '../web/js/engine/transformer.js';
import { toKicad, boundsCopper, simplify } from '../web/js/engine/artwork.js';
import { exportKicadPcb, exportKicadMod, exportSvg, exportDxf, exportSpec } from '../web/js/engine/exporters.js';
import { parseBoard, sexpr, segmentDistance } from '../web/js/engine/boardcheck.js';
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`  ok ${name}`); }
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= Math.abs(b) * tol + 1e-14, `${a} vs ${b}`);
const ac = (family, extra = {}) => { const c = { ...antenna.defaults(), family }; antenna.reconcile(c, 'family', family); return { ...c, ...extra }; };
const tc = (family, extra = {}) => ({ ...transformer.defaults(), family, stackPlan: STACK_PRESETS[family], ...extra });

function exportRoundtrip(ws, c, r) {
  for (const exporter of [exportKicadPcb, exportKicadMod, exportSvg, exportDxf]) {
    const text = exporter(r.art, { tolerance: c.tolerance });
    assert.ok(text.length > 100); assert.ok(!/NaN|Infinity|undefined/.test(text));
  }
  const pcb = exportKicadPcb(r.art), board = parseBoard(pcb);
  assert.ok(board.copper.length > 0);
  const root = sexpr(pcb), layers = root.find(n => n[0] === 'layers').filter(n => Array.isArray(n) && n[2] === 'signal');
  assert.equal(layers.length % 2, 0, 'PCB copper stack must be even');
  assert.equal(layers[0][1], 'F.Cu'); assert.equal(layers.at(-1)[1], 'B.Cu');
  for (const n of layers.slice(1, -1)) assert.equal(n[1], `In${n[0]}.Cu`, 'Canonical layer number retained');
  const payload = toKicad(r.art, { dx: 3, dy: 7 });
  assert.equal(payload.pads.length, r.art.pads.filter(p => !p.drill).length);
  assert.ok(payload.pads.every(p => ['F.Cu', 'B.Cu'].includes(p.layer)), 'No inaccessible internal SMD pads');
  const again = ws.compute(JSON.parse(JSON.stringify(c)), { name: r.art.meta.name });
  assert.deepEqual(again.art, r.art, 'Saved geometry round-trips exactly');
  near(boundsCopper(again.art).w, boundsCopper(r.art).w);
  const spec = exportSpec(ws.spec(c, r), { notes: r.notes });
  assert.ok(!/undefined|NaN|Infinity/.test(spec)); assert.ok(spec.includes(r.model));
}

for (const family of Object.keys(ANTENNA_FAMILIES)) check(`${family}: finite geometry, all exports and saved-design round trip`, () => {
  const c = ac(family), r = antenna.compute(c, { name: 'ANT1' });
  assert.ok(r.capabilities.length && r.notes.length && antenna.tiles(c, r).length);
  exportRoundtrip(antenna, c, r);
});
check('Inset feed preserves two side gaps and matching estimate follows depth', () => {
  const c = ac('inset-patch'), a = antenna.compute(c), b = antenna.compute({ ...c, insetFraction: 0.4 });
  assert.ok(b.analysis.inputResistance < a.analysis.inputResistance);
  near(a.analysis.inputResistance, c.edgeResistance * Math.cos(Math.PI * c.insetFraction) ** 2);
  const side = a.art.pads.filter(p => p.role === 'patch' && p.h === a.analysis.insetDepth);
  assert.equal(side.length, 2);
  for (const p of side) near(Math.abs(p.x) - p.w / 2 - a.analysis.feedW / 2, c.insetGap);
  assert.equal(toKicad(a.art).vias.length, 0);
});
check('Dipole symmetry, isolated feeds and folded DC connectivity', () => {
  const a = antenna.compute(ac('dipole')), b = antenna.compute(ac('folded-dipole'));
  assert.notEqual(a.art.pads[0].net, a.art.pads[1].net);
  near(a.art.tracks[0].pts[1][0], -a.art.tracks[1].pts[1][0]);
  assert.equal(b.art.pads[0].net, b.art.pads[1].net);
  assert.equal(b.art.tracks.length, 1);
  const narrow = antenna.compute(ac('dipole', { feedGap: 0.1 }));
  near(narrow.art.pads[1].x - narrow.art.pads[0].x - narrow.art.pads[0].w, 0.1);
  const doubleF = antenna.compute(ac('dipole', { freq: 4.9e9 }));
  near(doubleF.analysis.span * 2, a.analysis.span);
});
for (const family of ['ifa', 'mifa']) check(`${family}: RF tap and short join one DC net without shorting the feed gap`, () => {
  const c = ac(family), r = antenna.compute(c);
  assert.deepEqual([...new Set([...r.art.tracks, ...r.art.pads].map(p => p.net))], ['GND']);
  const radiator = r.art.tracks.find(t => t.role === 'radiator'), feed = r.art.tracks.find(t => t.role === 'feed');
  assert.ok(segmentDistance(...feed.pts, radiator.pts[2], radiator.pts[3]) < 1e-10);
  let length = 0;
  for (let i = 2; i < radiator.pts.length; i++) length += Math.hypot(radiator.pts[i][0] - radiator.pts[i - 1][0], radiator.pts[i][1] - radiator.pts[i - 1][1]);
  near(length, r.analysis.conductorLength);
  const ground = r.art.pads.find(p => p.role === 'ground');
  assert.ok(feed.pts[0][1] - c.traceW / 2 > ground.y + ground.h / 2);
  if (family === 'mifa') near(radiator.pts[4][1] - radiator.pts[3][1], c.meanderPitch);
});
check('NFC tuning obeys LC resonance, handles excess parasitics and sizes to target', () => {
  const c = ac('nfc'), r = antenna.compute(c);
  near(1 / (2 * Math.PI * Math.sqrt(r.analysis.inductance * r.analysis.totalC)), c.freq);
  near(r.analysis.totalC - r.analysis.externalC, c.parasiticPf * 1e-12);
  assert.equal(antenna.compute({ ...c, parasiticPf: 10000 }).analysis.externalC, null);
  const diameter = sizeNfcLoop(c);
  near(antenna.compute({ ...c, loopDiameter: diameter }).analysis.inductance, c.targetLoopL, 1e-5);
  const refined = antenna.compute(c, {}, { segmentCap: 3600 });
  near(refined.analysis.inductance, r.analysis.inductance, 0.025);
  assert.equal(antenna.compute(c, {}, { quick: true }).analysis, undefined);
  assert.throws(() => sizeNfcLoop({ ...c, targetLoopL: 1e-3 }), /outside/);
});
check('Array factor has unity broadside, expected two-element null, and independent ports', () => {
  const r = antenna.compute(ac('patch-array', { spacingX: 0.5 }));
  near(r.analysis.arrayFactorX[90], 0); near(r.analysis.arrayFactorY[90], 0);
  near(r.analysis.arrayFactorX[0], -60);
  assert.equal(new Set(r.art.tracks.map(t => t.net)).size, 4);
  assert.equal(r.art.pads.filter(p => p.role === 'ground').length, 1);
  assert.equal(antenna.charts(ac('patch-array'), r).length, 1);
});
check('Connected 3×4 array exports one feed net, with feed routes below every patch', () => {
  const c = ac('patch-array', { arrayRows: 3, arrayCols: 4, arrayFeed: 'tree', spacingY: 0.8 }), r = antenna.compute(c);
  assert.equal(new Set(r.art.tracks.map(t => t.net)).size, 1);
  assert.equal(r.art.ports.filter(p => p.net !== 'GND').length, 1);
  for (const t of r.art.tracks.filter(t => t.role === 'array-feed')) for (const p of r.art.pads.filter(p => p.role === 'patch')) {
    for (const q of t.pts) assert.ok(Math.abs(q[0] - p.x) > p.w / 2 + t.width / 2 || Math.abs(q[1] - p.y) > p.h / 2 + t.width / 2, 'Feed crosses patch');
  }
  exportRoundtrip(antenna, c, r);
});

function assertViasClear(r, clearance) {
  // Test simplified copper as exported, using an independent distance routine.
  const art = simplify(r.art, 0.004), nodes = r.windings.flatMap(q => q.nodes);
  for (const p of [...art.pads, ...art.vias]) {
    const node = nodes.find(n => Math.hypot(n.x - p.x, n.y - p.y) < 1e-8);
    assert.ok(node);
    for (const t of art.tracks) {
      if (t.startNode === node.id || t.endNode === node.id) continue;
      for (let i = 1; i < t.pts.length; i++) assert.ok(segmentDistance([p.x, p.y], [p.x, p.y], t.pts[i - 1], t.pts[i]) >= (p.w || p.diameter) / 2 + t.width / 2 + clearance - 0.005, `Via bypasses ${t.layer}`);
    }
  }
  for (const q of r.windings) {
    const tracks = r.art.tracks.filter(t => t.winding === q.name);
    assert.equal(tracks.length, q.layers.length);
    for (let i = 0; i < tracks.length; i++) {
      const start = tracks[i].pts[0], end = tracks[i].pts.at(-1);
      near(start[0], q.nodes[i].x); near(start[1], q.nodes[i].y);
      near(end[0], q.nodes[i + 1].x); near(end[1], q.nodes[i + 1].y);
    }
  }
}
for (const family of Object.keys(STACK_PRESETS)) for (const shape of ['circle', 'polygon']) check(`${family}/${shape}: isolated vias, connected series paths, export and model`, () => {
  const c = tc(family, { shape, dOuter: 40 }), r = transformer.compute(c, { name: 'T1' });
  assertViasClear(r, c.traceS);
  assert.equal(new Set(r.windings.map(w => w.net)).size, r.windings.length);
  assert.ok(r.analysis.k > 0 && r.analysis.k < 1);
  assert.ok(r.analysis.matrix.every((row, i) => row.every((v, j) => v === r.analysis.matrix[j][i])));
  exportRoundtrip(transformer, c, r);
});
check('Eight-layer, four-winding matrix has positive energy for independent current vectors', () => {
  const c = tc('multi-secondary', { dOuter: 45, stackPlan: 'P,P,S,S,S2,S2,S3,S3', secondary2Turns: 4, secondary3Turns: 2 }), r = transformer.compute(c);
  assert.deepEqual(r.analysis.turns, [12, 6, 8, 4]);
  assert.deepEqual(r.analysis.outputs.map(o => o.ratio), [2, 1.5, 3]);
  for (const I of [[1, 1, 1, 1], [1, -1, 0, 0], [0, 1, -2, 1], [2, -3, 5, -4]]) {
    const energy = I.reduce((sum, a, i) => sum + a * r.analysis.matrix[i].reduce((s, m, j) => s + m * I[j], 0), 0) / 2;
    assert.ok(energy > 0);
  }
  assertViasClear(r, c.traceS);
});
check('Interleaving alters the geometry-based coupling, and refinement agrees', () => {
  const grouped = transformer.compute(tc('multilayer')), interleaved = transformer.compute(tc('interleaved'));
  assert.ok(interleaved.analysis.k > grouped.analysis.k);
  const refined = transformer.compute(tc('interleaved'), {}, { segmentCap: 3600 });
  near(refined.analysis.L1, interleaved.analysis.L1, 0.025); near(refined.analysis.M, interleaved.analysis.M, 0.025);
});
check('Center tap exposes the midpoint with equal turns and one secondary DC net', () => {
  const r = transformer.compute(tc('center-tapped'));
  assert.equal(r.analysis.tapTurns, 3);
  assert.equal(r.art.ports.filter(p => p.name === 'S_CT').length, 1);
  const sec = r.windings.find(w => w.name === 'S');
  assert.equal(sec.sections[0].turns, sec.sections[1].turns);
  assert.ok(r.art.ports.filter(p => p.name.startsWith('S')).every(p => p.net === sec.net));
});
check('Sparse board layers and explicit asymmetric heights retain their identity', () => {
  const c = tc('multilayer', { copperLayers: 'F.Cu,In2.Cu,In4.Cu,B.Cu', layerPositions: '0,0.3,1.4,1.6' });
  const board = { layerCount: 6, copperLayers: ['F.Cu','In1.Cu','In2.Cu','In3.Cu','In4.Cu','B.Cu'].map(name => ({ name })) };
  const r = transformer.compute(c, { board });
  assert.deepEqual(r.art.meta.stack.map(s => s.z), [0, 0.3, 1.4, 1.6]);
  const pcb = exportKicadPcb(r.art);
  assert.ok(pcb.includes('(2 "In2.Cu" signal)')); assert.ok(pcb.includes('(4 "In4.Cu" signal)'));
  assert.throws(() => transformer.compute(c, { board: { layerCount: 4 } }), /does not exist/);
  assert.throws(() => transformer.compute(tc('multilayer'), { board: { layerCount: 2 } }), /needs 4/);
});
check('Ferrite AL and flux follow independent SI calculations and preserve core cutouts', () => {
  const c = tc('ferrite', { coreLossDensity: 100 }), r = transformer.compute(c);
  const AL = 4 * Math.PI * 1e-7 * 25e-6 / (0.05 / 2200 + 0.0001);
  near(r.core.AL, AL);
  near(r.analysis.L1 * (1 - c.leakageFraction), AL * 12 ** 2);
  near(r.core.Bpeak, 1 / (4.442882938 * 1e5 * 12 * 25e-6), 1e-8);
  near(r.core.loss, 0.125);
  const board = parseBoard(exportKicadPcb(r.art));
  assert.equal(board.loops.length, 2, 'Outer outline and central post cutout');
  assert.ok(transformer.compute({ ...c, coreGap: 0.2 }).core.AL < r.core.AL);
  assert.ok(transformer.compute({ ...c, coreVoltage: 100 }).notes.some(n => n.text.includes('exceeds the entered design flux limit')));
  for (const coreMaterial of Object.keys(CORE_MATERIALS)) assert.ok(transformer.compute({ ...c, coreMaterial }).core.AL > 0);
  assert.equal(transformer.compute({ ...c, coreLossDensity: 0 }).core.loss, null);
  const round = transformer.compute({ ...c, coreShape: 'round' });
  assert.equal(parseBoard(exportKicadPcb(round.art)).loops.length, 2);
});
check('Invalid antenna and transformer configurations fail explicitly', () => {
  for (const [family, extra] of [['patch', { family: 'unknown' }], ['inset-patch', { insetFraction: NaN }], ['dipole', { traceW: 0 }], ['mifa', { meanderRuns: 2.5 }], ['nfc', { loopTurns: 20, loopDiameter: 5 }], ['patch-array', { spacingX: 0.3 }], ['patch-array', { arrayRows: 1000 }]]) assert.throws(() => antenna.compute(ac(family, extra)));
  for (const [family, extra] of [['multilayer', { stackPlan: 'P,X,S' }], ['multilayer', { copperLayers: 'F.Cu,In1.Cu,In1.Cu,B.Cu' }], ['multilayer', { layerPositions: '0,0.6,0.3,1.6' }], ['multilayer', { primaryTurns: 60 }], ['center-tapped', { stackPlan: 'P,S' }], ['multi-secondary', { secondary2Turns: Infinity }], ['ferrite', { coreGap: -1 }], ['ferrite', { corePostW: 100 }], ['ferrite', { coreWindowHeight: 1 }], ['ferrite', { leakageFraction: 0 }]]) assert.throws(() => transformer.compute(tc(family, extra)));
});
console.log(`${checks} creator family checks passed.`);
