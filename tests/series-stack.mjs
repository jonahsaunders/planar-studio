import assert from 'node:assert/strict';
import { artwork, rect, toKicad } from '../web/js/engine/artwork.js';
import { parseBoard, reviewBoardPlacement } from '../web/js/engine/boardcheck.js';
import { polyLength, viaResistance } from '../web/js/engine/coil.js';
import { exportKicadMod, exportKicadPcb, exportSvg } from '../web/js/engine/exporters.js';
import { pointSegment } from '../web/js/engine/obstacles.js';
import { compute, defaults } from '../web/js/ws/inductor.js';
import { compute as computeMotor, defaults as motorDefaults } from '../web/js/ws/motor.js';
import { compute as computeFilter, defaults as filterDefaults } from '../web/js/ws/filter.js';

const base = defaults();
const touchingTracks = (point, segments) => segments
  .filter(segment => pointSegment(point.pts[0], ...segment.pts) < (segment.width + point.width) / 2);
const cases = [
  ...[3, 4, 8, 16].map(layers => ({ layers })),
  { layers: 5, turns: 8.5, padDrill: 0 },
  { layers: 8, shape: 'polygon' },
  { layers: 6, shape: 'log' },
  { layers: 6, shape: 'racetrack' },
  { layers: 6, shape: 'wedge', dOuter: 60, dInner: 28 },
];

for (const spec of cases) {
  const config = { ...base, ...spec };
  const { art, coil, layers } = compute(config, {}, { quick: true });
  assert.equal(art.meta.routingError, undefined, JSON.stringify(spec));
  assert.equal(art.vias.length, config.layers - 1);
  assert.equal(art.tracks.length, config.layers);
  assert.ok(Math.abs(coil.lenTotal - art.tracks.reduce((sum, t) => sum + polyLength(t.pts, false), 0)) < 1e-8);
  assert.ok(coil.lenTotal > coil.lenPerLayer * config.layers, 'Copper length includes breakouts');

  const pcb = exportKicadPcb(art, { tolerance: 2 });
  const board = parseBoard(pcb);
  const holes = board.copper.filter(item => item.kind === 'via' || item.kind === 'pad');
  const traces = board.copper.filter(item => item.kind === 'segment');
  assert.equal(holes.length, config.layers + 1);
  assert.equal(new Set(holes.map(h => h.pts[0].join(','))).size, holes.length);
  for (const [index, hole] of holes.entries()) {
    const expected = index < config.layers - 1 ? layers.slice(index, index + 2)
      : [index === config.layers - 1 ? layers[0] : layers.at(-1)];
    const incident = touchingTracks(hole, traces);
    assert.deepEqual([...new Set(incident.map(t => t.layer))], expected,
      `Barrel ${index} must touch exactly its intended sections after export`);
    for (const layer of expected) {
      const track = traces.filter(t => t.layer === layer);
      const contact = track.flatMap((t, i) => incident.includes(t) ? [i] : []);
      assert.ok(contact[0] === 0 || contact.at(-1) === track.length - 1, 'Contact occurs at a winding end');
      assert.equal(contact.at(-1) - contact[0] + 1, contact.length, 'Barrel does not touch nonadjacent turns');
      assert.ok([track[0].pts[0], track.at(-1).pts.at(-1)].some(p => p.join() === hole.pts[0].join()),
        'A track endpoint terminates at the centre of its node');
    }
  }
  assert.deepEqual(toKicad(art, { tolerance: 2 }).tracks, toKicad(art).tracks);
  const footprint = exportKicadMod(art, { tolerance: 2 });
  assert.equal((footprint.match(/\(pad "" thru_hole/g) || []).length, config.layers - 1);
  for (const layer of layers) assert.ok(footprint.includes(`(layer "${layer}")`));
}

const config = { ...base, layers: 4 };
const { art, analysis } = compute(config, {});
assert.ok(Math.abs(analysis.viaR - viaResistance(config)) < 1e-12, 'Use only the current-carrying barrel spans');
const empty = artwork();
empty.meta.boardLayers = ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'];
empty.outline = [{ layer: 'Edge.Cuts', pts: rect(-25, -25, 25, 25) }];
const placement = reviewBoardPlacement(art, config, exportKicadPcb(empty), [], { seriesWinding: true });
assert.equal(placement.ready, true, JSON.stringify(placement.issues));
assert.equal(placement.payload.vias.length, 5);
assert.equal(placement.windingTerminals.length, 2);

const cramped = compute({ ...config, dOuter: 3, turns: 1 }, {}, { quick: true }).art;
assert.throws(() => toKicad(cramped), /No clear breakout/);
assert.throws(() => exportKicadPcb(cramped), /No clear breakout/);
assert.throws(() => exportKicadMod(cramped), /No clear breakout/);
assert.match(exportSvg(cramped), /<svg/);
assert.match(exportKicadPcb(compute({ ...config, connection: 'parallel' }, {}, { quick: true }).art), /\(via /);

const motor = computeMotor({ ...motorDefaults(), layers: 4, busEnabled: false }, {}, { quick: true });
assert.equal(toKicad(motor.art).vias.length, motor.instances * 5);
for (const band of ['lowpass', 'highpass']) {
  const filter = computeFilter({ ...filterDefaults(), family: 'lumped', capStyle: 'plate', coilLayers: 4, band }, {}, { quick: true });
  assert.match(exportKicadPcb(filter.art), /\(layer "In2\.Cu"\)/);
  const feeds = filter.art.tracks.filter(t => ['route', 'link', 'coil-return', 'gnd-drop'].includes(t.role));
  for (const v of filter.art.vias.filter(v => v.role === 'coil-via')) {
    assert.ok(feeds.every(t => t.pts.slice(1).every((p, i) =>
      pointSegment([v.x, v.y], t.pts[i], p) > (v.diameter + t.width) / 2)),
    'Filter interconnect must approach the exterior terminals without touching an intermediate barrel');
  }
}
console.log('Multilayer series stacks preserve the full electrical path in placement, PCB and footprint exports.');
