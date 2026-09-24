import assert from 'node:assert/strict';
import { artwork, via, track, toKicad, viaSpan, copperStack } from '../web/js/engine/artwork.js';
import { exportKicadPcb, exportKicadMod, usedLayers } from '../web/js/engine/exporters.js';
import { sexpr } from '../web/js/engine/boardcheck.js';
import { buildLitz, litzPreset } from '../web/js/engine/litz.js';

const stack = ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'];
const A = artwork({ name: 'Litz via spans', boardLayers: stack });
const spans = [['F.Cu', 'In1.Cu'], ['In1.Cu', 'In2.Cu'], ['In2.Cu', 'B.Cu']];
for (const [i, [from, to]] of spans.entries()) A.vias.push(via(i * 2, 4, {
  from, to, viaType: 'blind_buried', strandId: `strand-${i}`, net: 'COIL', drill: 0.3, diameter: 0.6,
}));
A.tracks.push(track('In1.Cu', 0.3, [[0, 4], [2, 4]], { strandId: 'strand-0', net: 'COIL' }));
const payload = toKicad(A, { dx: 10, dy: 20 });
assert.deepEqual(payload.boardLayers, stack);
assert.equal(payload.tracks[0].strandId, 'strand-0');
for (const [i, v] of payload.vias.entries()) {
  assert.deepEqual([v.from, v.to], spans[i]);
  assert.equal(v.viaType, 'blind_buried');
  assert.equal(v.strandId, `strand-${i}`);
  assert.deepEqual([v.x, v.y], [i * 2 + 10, 16]);
}
const pcb = sexpr(exportKicadPcb(A));
const entries = pcb.filter(n => n[0] === 'via');
assert.equal(entries.length, spans.length);
assert.deepEqual(pcb.find(n => n[0] === 'layers').filter(n => n[2] === 'signal').map(n => [n[0], n[1]]),
  [['0', 'F.Cu'], ['1', 'In1.Cu'], ['2', 'In2.Cu'], ['31', 'B.Cu']]);
for (const [i, v] of entries.entries()) {
  assert.equal(v[1], 'blind', 'KiCad uses the blind token for both blind and buried vias');
  assert.deepEqual(v.find(n => n[0] === 'layers').slice(1), spans[i]);
  assert.equal(v.find(n => n[0] === 'net')[1], '1');
  assert.deepEqual(v.find(n => n[0] === 'at').slice(1).map(Number), [i * 2, -4]);
}
assert.deepEqual(usedLayers(A), stack, 'via-only endpoints participate in layer discovery');
assert.throws(() => exportKicadMod(A), /footprints cannot preserve.*\.kicad_pcb/);
for (const bad of [
  { from: 'In2.Cu', to: 'In1.Cu', viaType: 'blind_buried' },
  { from: 'In1.Cu', to: 'In1.Cu', viaType: 'blind_buried' },
  { from: 'F.Cu', to: 'In3.Cu', viaType: 'blind_buried' },
  { from: 'F.Cu', to: 'B.Cu', viaType: 'blind_buried' },
  { from: 0, to: 1, viaType: 'blind_buried' },
  { from: 'F.Cu', to: 'In1.Cu' },
  { from: 'F.Cu', viaType: 'blind_buried' },
  { viaType: 'micro' },
]) {
  assert.throws(() => viaSpan(bad, stack));
  const B = artwork({ boardLayers: stack }); B.vias.push(via(0, 0, bad));
  assert.throws(() => toKicad(B));
  assert.throws(() => exportKicadPcb(B));
  assert.throws(() => exportKicadMod(B));
}
for (const bad of [['F.Cu', 'In1.Cu', 'B.Cu'], ['F.Cu', 'In2.Cu', 'In1.Cu', 'B.Cu'], ['F.Cu', 'In1.Cu', 'In1.Cu', 'B.Cu']]) {
  assert.throws(() => copperStack(artwork({ boardLayers: bad })));
}
// Old spiral from/to indexes describe its intended series route, while the
// existing generator physically uses through vias. Retain that legacy output.
const legacy = artwork();
legacy.vias.push(via(0, 0, { from: 0, to: 1 }), via(1, 0), via(2, 0, { from: 'F.Cu', to: 'B.Cu' }));
const oldVias = sexpr(exportKicadPcb(legacy)).filter(n => n[0] === 'via');
assert.equal(oldVias.length, 3);
for (const v of oldVias) {
  assert.notEqual(v[1], 'blind');
  assert.deepEqual(v.find(n => n[0] === 'layers').slice(1), ['F.Cu', 'B.Cu']);
}
assert.equal((exportKicadMod(legacy).match(/thru_hole circle/g) || []).length, 3);
assert.equal(sexpr(exportKicadPcb(legacy)).find(n => n[0] === 'setup').some(n => n[0] === 'stackup'), false,
  'conventional exports retain their existing stackup behavior');

// Reconstruct layer center depths from exported thicknesses and compare them
// against the geometry actually used by the electrical model.
for (const gaps of [[0.4, 0.5, 0.4], [0.2, 0.6, 0.35]]) {
  const cfg = litzPreset(); cfg.litzDielectricGaps = gaps;
  cfg.boardT = gaps.reduce((a, b) => a + b, 0) + 4 * 0.07;
  const geometry = buildLitz(cfg), root = sexpr(exportKicadPcb(geometry.art));
  assert.equal(root.find(n => n[0] === 'version')[1], '20241229');
  const terminalVias = root.filter(n => n[0] === 'via' && n[1] !== 'blind');
  assert.equal(terminalVias.length, 2);
  assert.ok(terminalVias.every(n => n.some(x => x[0] === 'tenting' && x[1] === 'none')),
    'both solder terminals must have explicit mask openings regardless of the board default');
  assert.ok(root.filter(n => n[0] === 'via' && n[1] === 'blind').every(n => !n.some(x => x[0] === 'tenting')),
    'transition vias keep the board default mask treatment');
  assert.equal(toKicad(geometry.art).vias.filter(v => v.exposedTerminal).length, 2);
  const boardThickness = Number(root.find(n => n[0] === 'general').find(n => n[0] === 'thickness')[1]);
  assert.ok(Math.abs(boardThickness - cfg.boardT) < 1e-6);
  const stackup = root.find(n => n[0] === 'setup').find(n => n[0] === 'stackup').filter(n => n[0] === 'layer');
  assert.deepEqual(stackup.map(n => n[1]), ['F.Cu', 'dielectric 1', 'In1.Cu', 'dielectric 2', 'In2.Cu', 'dielectric 3', 'B.Cu']);
  let depth = -boardThickness / 2;
  const centers = [];
  for (const entry of stackup) {
    const t = Number(entry.find(n => n[0] === 'thickness')[1]);
    if (entry[1].endsWith('.Cu')) centers.push(depth + t / 2);
    depth += t;
  }
  assert.ok(Math.abs(depth - boardThickness / 2) < 1e-6);
  assert.ok(centers.every((z, i) => Math.abs(z - geometry.layers[i].z) < 1e-6));
  assert.throws(() => exportKicadPcb(geometry.art, { boardThickness: 1 }), /cannot override/);
  const missing = structuredClone(geometry.art); delete missing.meta.dielectricThicknessMM;
  assert.throws(() => exportKicadPcb(missing), /complete copper and dielectric/);
}
console.log('PCB Litz exports preserve blind/buried spans, full stacks, strand IDs, and legacy through vias.');
