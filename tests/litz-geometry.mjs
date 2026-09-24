import assert from 'node:assert/strict';
import { validateLitz } from '../web/js/engine/litz-validation.js';
import { buildLitz, litzPreset } from '../web/js/engine/litz.js';

// Independent fixture: sixteen parallel conductors with a single adjacent-
// layer transition each, and two declared common terminal buses. This exercises
// physical contact rules without copying the braid generator's implementation.
function fixture() {
  const config = { traceW: 0.2, litzStrandGap: 0.2, boardT: 1.2, turns: 1 };
  const layers = ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'];
  const art = { meta: {}, tracks: [], vias: [], pads: [] }, strands = [];
  const terminalGroups = [{ id: 'start', members: [] }, { id: 'end', members: [] }];
  for (let id = 0; id < 16; id++) {
    const x = id * 2, sections = [{ layer: 'F.Cu', pts: [[x, 0], [x, 10]] }, { layer: 'In1.Cu', pts: [[x, 10], [x, 20]] }];
    sections.forEach((s, sequence) => art.tracks.push({ ...structuredClone(s), width: 0.2, net: 'LITZ', strandId: id, sequence }));
    const v = { x, y: 10, from: 'F.Cu', to: 'In1.Cu', zFrom: 0, zTo: 0.4, drill: 0.3, diameter: 0.6, strandId: id, net: 'LITZ' };
    art.vias.push(v);
    strands.push({ id, bundle: id < 12 ? 'outer' : 'inner', sections, vias: [structuredClone(v)], lengthMM: 20.4 });
    terminalGroups[0].members.push({ strandId: id, layer: 'F.Cu', point: [x, 0] });
    terminalGroups[1].members.push({ strandId: id, layer: 'In1.Cu', point: [x, 20] });
  }
  art.tracks.push({ layer: 'F.Cu', pts: [[0, 0], [30, 0]], width: 0.2, role: 'terminal-bus', terminalGroup: 'start', net: 'LITZ' });
  art.tracks.push({ layer: 'In1.Cu', pts: [[0, 20], [30, 20]], width: 0.2, role: 'terminal-bus', terminalGroup: 'end', net: 'LITZ' });
  return { config, layers, art, strands, terminalGroups };
}
const has = (result, code) => result.errors.some(e => e.code === code);
const base = fixture();
assert.equal(validateLitz(base).ok, true, JSON.stringify(validateLitz(base).errors));

const missingVia = structuredClone(base);
missingVia.art.vias.shift();
assert.ok(has(validateLitz(missingVia), 'missing-via'), 'a removed exported via opens the physical strand');

const broken = structuredClone(base);
broken.strands[0].sections[1].pts[0][1] += 0.5;
broken.art.tracks[1].pts[0][1] += 0.5;
assert.ok(has(validateLitz(broken), 'open-strand'), 'ordered sections must touch at their actual endpoints');

const bridge = structuredClone(base);
bridge.strands[0].sections[0].pts = [[0, 0], [3, 5], [0, 10]];
bridge.art.tracks[0].pts = structuredClone(bridge.strands[0].sections[0].pts);
assert.ok(has(validateLitz(bridge), 'copper-short'), 'same-net strands are still electrically distinct away from the terminals');

const selfBridge = structuredClone(base);
selfBridge.strands[0].sections[0].pts = [[0, 0], [0.5, 7], [-0.5, 7], [0.5, 3], [0, 10]];
selfBridge.art.tracks[0].pts = structuredClone(selfBridge.strands[0].sections[0].pts);
assert.ok(has(validateLitz(selfBridge), 'copper-short'), 'nonadjacent copper in one strand must not bypass its ordered path');

const artOnly = structuredClone(base);
artOnly.art.tracks[0].pts[1][0] += 1;
assert.ok(has(validateLitz(artOnly), 'artwork-mismatch'), 'checks must cover the copper exported, not only cached strand metadata');
const modelOnly = structuredClone(base);
modelOnly.strands[0].vias[0].drill = 0.1;
assert.ok(has(validateLitz(modelOnly), 'artwork-mismatch'), 'the resistance model must use the fabricated via geometry');
const widthOnly = structuredClone(base);
widthOnly.art.tracks[0].width = 0.3;
assert.ok(has(validateLitz(widthOnly), 'artwork-mismatch'), 'the electrical-model width must match exported copper');

const illegalSpan = structuredClone(base);
illegalSpan.art.vias[0].to = 'B.Cu';
assert.ok(has(validateLitz(illegalSpan), 'via-span'), 'a through via is invalid for the adjacent-layer braid');

const viaBridge = structuredClone(base);
viaBridge.strands[1].sections[0].pts[1][0] = 0.4;
viaBridge.strands[1].sections[1].pts[0][0] = 0.4;
viaBridge.art.tracks[2].pts[1][0] = 0.4;
viaBridge.art.tracks[3].pts[0][0] = 0.4;
viaBridge.art.vias[1].x = viaBridge.strands[1].vias[0].x = 0.4;
assert.ok(validateLitz(viaBridge).errors.some(e => e.code === 'copper-short' && e.kinds.every(kind => kind === 'via')),
  'adjacent annular pads can short even when their drills remain separate');

const wrongTerminal = structuredClone(base);
wrongTerminal.terminalGroups[0].members[0].point = [0, 5];
assert.ok(has(validateLitz(wrongTerminal), 'terminal-endpoint'), 'declaring a mid-strand contact a terminal cannot authorize a bypass');

const invalidDimension = validateLitz(base, { ...base.config, litzStrandGap: NaN });
assert.ok(has(invalidDimension, 'dimensions'));

// An annular pad occupies only its stated physical span. It must collide with
// copper on either touched layer, while the same XY crossing on B.Cu is safe.
const layerCrossing = structuredClone(base);
layerCrossing.strands[1].sections = [{ layer: 'B.Cu', pts: [[2, 0], [0, 10], [2, 20]] }];
layerCrossing.strands[1].vias = [];
layerCrossing.strands[1].lengthMM = 2 * Math.hypot(2, 10);
layerCrossing.art.tracks = layerCrossing.art.tracks.filter(t => t.strandId !== 1);
layerCrossing.art.tracks.push({ ...structuredClone(layerCrossing.strands[1].sections[0]), width: 0.2, strandId: 1, sequence: 0, net: 'LITZ' });
layerCrossing.art.vias = layerCrossing.art.vias.filter(v => v.strandId !== 1);
for (const g of layerCrossing.terminalGroups) {
  g.members.find(m => m.strandId === 1).layer = 'B.Cu';
  const m = g.members.find(m => m.strandId === 1);
  layerCrossing.art.tracks.push({ layer: 'B.Cu', pts: [m.point, [m.point[0] + 1, m.point[1]]], width: 0.2, role: 'terminal-bus', terminalGroup: g.id });
}
assert.ok(!has(validateLitz(layerCrossing), 'copper-short'), 'a buried pair must not touch unrelated copper on B.Cu');
assert.ok(has(validateLitz(layerCrossing), 'terminal-open'), 'separate buses on different layers still need a physical interconnect');
const touchedLayer = structuredClone(layerCrossing);
touchedLayer.art.vias[0].to = 'B.Cu';
assert.ok(has(validateLitz(touchedLayer), 'copper-short'), 'expanded via span physically shorts copper on an additional layer');

console.log('PCB Litz independent geometry checks passed: continuity, same-net shorts, bypasses, artwork integrity, terminal ownership, and via spans.');

// Exercise every supported transposition pitch and meaningful dimensional
// variants through actual geometry, including the exported through-hole buses.
function quantizedCopper(geometry, decimals) {
  const out = structuredClone(geometry), round = n => Number(n.toFixed(decimals));
  const xy = p => [round(p[0]), round(p[1])];
  for (const t of out.art.tracks) t.pts = t.pts.map(xy);
  for (const p of [...out.art.vias, ...out.art.pads]) { p.x = round(p.x); p.y = round(p.y); }
  for (const strand of out.strands) {
    const copper = out.art.tracks.filter(t => t.strandId === strand.id);
    strand.sections.forEach((s, i) => { s.pts = copper[i].pts; });
    for (const v of strand.vias) { v.x = round(v.x); v.y = round(v.y); }
    strand.path3 = strand.path3.map(p => [...xy(p), p[2]]);
    strand.positions.forEach(p => { p.point = xy(p.point); });
    strand.traceLengthMM = strand.sections.reduce((sum, s) => sum + s.pts.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - s.pts[i][0], p[1] - s.pts[i][1]), 0), 0);
    strand.lengthMM = strand.traceLengthMM + strand.vias.reduce((sum, v) => sum + Math.abs(v.zTo - v.zFrom), 0);
  }
  for (const group of out.terminalGroups) {
    group.members.forEach(m => { m.point = xy(m.point); });
    if (group.padPoint) group.padPoint = xy(group.padPoint);
  }
  return out;
}
const variants = [{}, { turns: 2 }, { turns: 3, dOuter: 260, litzStepDeg: 15 },
  { turns: 2, dOuter: 400, litzStepDeg: 7.5 }, { traceW: 0.4 },
  { litzViaDiameter: 0.8, litzViaDrill: 0.4, turns: 3, dOuter: 180 }];
let defaultGeometry;
for (const delta of variants) {
  const cfg = { ...litzPreset(), ...delta }, geometry = buildLitz(cfg), result = validateLitz(geometry, cfg);
  assert.equal(result.ok, true, `${JSON.stringify(delta)}: ${JSON.stringify(result.errors)}`);
  assert.ok(result.minClearance >= cfg.litzStrandGap - 1e-6, 'actual copper clearance, including annular pads');
  assert.equal(geometry.stats.steps, cfg.turns * 360 / cfg.litzStepDeg, 'all requested turns must be generated');
  assert.equal(geometry.art.vias.length, geometry.stats.steps * 8, 'every step must contain six outer and two inner transitions');
  assert.equal(geometry.strands.length, 16);
  for (const strand of geometry.strands) {
    assert.equal(strand.positions.length, geometry.stats.steps + 1);
    assert.ok(strand.lengthMM > cfg.turns * Math.PI * geometry.stats.innerDiameterMM);
  }
  assert.ok(result.checkedPairs < result.primitiveCount * 40, 'spatial checking must stay bounded for a dense braid');
  // Three decimal places deliberately stress placement/export rounding more
  // than the six-decimal KiCad writer. Recheck physical copper, not just the
  // in-memory ideal curves; matching metadata and measured length are updated.
  const rounded = validateLitz(quantizedCopper(geometry, 3), cfg);
  assert.equal(rounded.ok, true, `Rounded copper ${JSON.stringify(delta)}: ${JSON.stringify(rounded.errors)}`);
  assert.ok(rounded.minClearance >= cfg.litzStrandGap - 1e-6, 'requested clearance must survive 0.001 mm coordinate quantization');
  if (!defaultGeometry) defaultGeometry = geometry;
}

const noPad = structuredClone(defaultGeometry);
noPad.art.pads = [];
assert.ok(has(validateLitz(noPad), 'terminal-open'), 'removing the terminal plated hole isolates the four layer buses');
const noRealVia = structuredClone(defaultGeometry);
noRealVia.art.vias.splice(5, 1);
assert.ok(has(validateLitz(noRealVia), 'missing-via'));
const wrongPath = structuredClone(defaultGeometry);
wrongPath.strands[0].path3[4][2] += 0.1;
assert.ok(has(validateLitz(wrongPath), 'path'), 'the model path must match the actual exported conductor');
const occupiedSlot = structuredClone(defaultGeometry);
occupiedSlot.transpositions.outer.states[2][0] = occupiedSlot.transpositions.outer.states[2][1];
assert.ok(has(validateLitz(occupiedSlot), 'slot-occupancy'));
const exposure = structuredClone(defaultGeometry);
exposure.transpositions.outer.states[2] = structuredClone(exposure.transpositions.outer.states[1]);
assert.ok(has(validateLitz(exposure), 'strand-exposure'));
const droppedTurn = structuredClone(defaultGeometry);
droppedTurn.transpositions.outer.states.splice(-13, 12);
assert.ok(has(validateLitz(droppedTurn), 'turn-count'));
const mirroredVia = structuredClone(defaultGeometry);
mirroredVia.art.vias[0].zFrom += 0.1;
assert.ok(has(validateLitz(mirroredVia), 'via-depth'));

for (const delta of [{ turns: 5.5 }, { turns: 30 }, { traceW: NaN }, { traceW: 0.1 },
  { litzTurnSpacing: 0.5 }, { litzViaDiameter: 0.32 }, { litzDielectricGaps: [0.1, 0.2] },
  { layers: 2 }, { shape: 'polygon' }, { litzStepDeg: 16 }]) {
  assert.throws(() => buildLitz({ ...litzPreset(), ...delta }), /PCB Litz/, JSON.stringify(delta));
}
console.log(`${variants.length} PCB Litz generator variants passed physical validation; incomplete turns, missing vias/pads, false 3D paths, slot collisions and unequal exposures rejected.`);
