import assert from 'node:assert/strict';
import { compute, defaults, notes, spec, tiles } from '../web/js/ws/motor.js';
import { PLANAR_CONSTRUCTIONS, constructionFiles } from '../web/js/engine/planar-constructions.js';
import { planarForceMap } from '../web/js/engine/motor-motion.js';
import { exportKicadPcb, exportKicadMod } from '../web/js/engine/exporters.js';
import { toKicad } from '../web/js/engine/artwork.js';

const c = { ...defaults(), motorFamily: 'planar', turns: 4, moverX: 3, moverY: 2, currentY: -0.7,
  planarForceX: 0.2, planarForceY: 0.3, planarPhaseR: 2 };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, a + ' versus ' + b);
const make = (planarConstruction, settings = {}, options = {}) => compute({ ...c, planarConstruction, ...settings }, {}, options);
const old = { ...c };
delete old.planarConstruction;
const original = make('pcb-grid');
assert.deepEqual(compute(old, {}).art, original.art);
assert.deepEqual(compute(old, {}).familyAnalysis, original.familyAnalysis);

const expectations = {
  'wire-tile': ['wire-carrier.dxf', 'magnet-carriage.dxf'],
  'moving-coil': ['coil-board.kicad_pcb', 'coil-board.kicad_mod', 'magnet-bed.dxf'],
  'double-sided': ['coil-board.kicad_pcb', 'upper-magnet-plate.dxf', 'lower-magnet-plate.dxf'],
  crossed: ['X-axis.kicad_pcb', 'Y-axis.kicad_pcb', 'X-magnet-track.dxf', 'Y-magnet-track.dxf', 'stage-arrangement.dxf'],
  sawyer: ['toothed-platen.dxf', 'forcer-layout.dxf'],
};
for (const { value, label } of PLANAR_CONSTRUCTIONS.slice(1)) {
  const r = make(value), quick = make(value, {}, { quick: true });
  assert.equal(r.construction.title, label);
  assert.deepEqual(r.art, quick.art);
  assert.deepEqual(r.art, compute(JSON.parse(JSON.stringify(r.cfg)), {}).art);
  assert.ok(notes(r.cfg, r).length && spec(r.cfg, r).length && tiles(r.cfg, r).length);
  const files = constructionFiles(r);
  assert.equal(JSON.parse(files['construction.json']).construction, value);
  for (const key of expectations[value]) assert.ok(files[key], key);
  for (const file of Object.values(files)) assert.doesNotMatch(file, /\b(?:NaN|Infinity)\b/);
  const electrical = value === 'moving-coil' || value === 'double-sided';
  for (const convert of [exportKicadPcb, exportKicadMod, toKicad]) {
    if (electrical) assert.ok(convert(r.art));
    else assert.throws(() => convert(r.art), /construction package/);
  }
  const map = planarForceMap(r, { current: 1.5, forceX: 0.01, forceY: -0.01 });
  assert.equal(map.points.length, 169);
  assert.ok(map.selected.reachable);
  near(map.selected.force[0], 0.01);
  near(map.selected.force[1], -0.01);
  assert.ok(map.points.every(p => p.currents.every(i => Number.isFinite(i) && Math.abs(i) <= 1.5 + 1e-10)));
}

const tile = make('wire-tile', { gridRows: 7, gridCols: 7 });
const warm = make('wire-tile', { tempC: 80 });
assert.equal(tile.instances, 4);
assert.equal(tile.construction.details.coilCenters.length, 4);
assert.ok(tile.construction.details.wireLength > 8 * 4 * 4);
assert.ok(warm.construction.resistance[0] > tile.construction.resistance[0]);
assert.throws(() => make('wire-tile', { wireTurns: 40 }), /coil center/);
assert.throws(() => make('wire-tile', { wireInsulated: 0.3 }), /Insulated wire diameter/);

const dual = make('double-sided');
const oneFace = make('double-sided', { planarLowerB: 0 });
const moving = make('moving-coil');
const opposite = moving.construction.driveAt(-c.moverX, -c.moverY).generators;
oneFace.construction.driveAt(c.moverX, c.moverY).generators.forEach((pair, i) => pair.forEach((v, axis) => near(v, -opposite[i][axis])));
assert.ok(dual.familyAnalysis.fx > oneFace.familyAnalysis.fx * 1.8);
assert.equal(dual.construction.details.faceSpan, 2 + c.boardT);
assert.notEqual(dual.construction.details.magnets[0].face, dual.construction.details.lowerMagnets[0].face);
const distant = make('moving-coil', { planarGap: 10 });
assert.ok(Math.abs(distant.familyAnalysis.fx) < Math.abs(moving.familyAnalysis.fx));
const movesOut = make('moving-coil', { gridCols: 2, gridRows: 2, polePitch: 12, yPolePitch: 12, magnetCols: 2, magnetRows: 2, travel: 150 });
assert.ok(movesOut.construction.driveAt(0, 0).generators.some(g => Math.hypot(...g) > 0));
assert.ok(movesOut.construction.driveAt(75, -75).generators.every(g => Math.hypot(...g) === 0));

const crossed = make('crossed', { crossedXCoils: 3, crossedYCoils: 9 });
assert.equal(crossed.instances, 12);
assert.equal(crossed.construction.boardParts['X-axis'].meta.instances, 3);
assert.equal(crossed.construction.boardParts['Y-axis'].meta.instances, 9);
assert.ok(crossed.construction.details.magnetTracks[1].length > crossed.construction.details.magnetTracks[0].length);
near(crossed.familyAnalysis.currents.slice(0, 3).reduce((a, b) => a + b, 0), 0);
near(crossed.familyAnalysis.currents.slice(3).reduce((a, b) => a + b, 0), 0);
const voice = make('crossed', { crossedDrive: 'voice-coil', current: 1, currentY: 0, flexureX: 0.1 });
near(voice.familyAnalysis.fx, -0.1);
assert.ok(!Object.keys(constructionFiles(voice)).some(name => name.endsWith('.kicad_pcb')));
const biasedMap = planarForceMap(voice, { current: 1.5, forceX: 0, forceY: 0 });
near(biasedMap.selected.currents[0], 1.5);
assert.equal(biasedMap.points.find(p => p.x === 20 && p.y === 0).reachable, false);

const sawyer = make('sawyer', { toothPitch: 2.4, sawyerHead: 23, sawyerMicrosteps: 8 });
near(sawyer.construction.details.fullStep, 0.6);
near(sawyer.construction.details.microstep, 0.075);
near(sawyer.familyAnalysis.fx, c.current * c.planarForceX);
near(sawyer.familyAnalysis.fy, c.currentY * c.planarForceY);
const teeth = sawyer.construction.parts['forcer-layout'].tracks.filter(t => t.layer === 'Pole_Tooth_Lands');
for (const tooth of teeth) {
  const x = (tooth.pts[0][0] + tooth.pts[2][0]) / 2, y = (tooth.pts[0][1] + tooth.pts[2][1]) / 2;
  const shifted = x > 0 ? 0.25 : 0;
  const phase = (y > 0 ? x : y) / 2.4 - shifted;
  near(phase, Math.round(phase));
}
const uncalibrated = make('sawyer', { planarForceX: 0, planarForceY: 0, planarPhaseR: 0 });
assert.ok(uncalibrated.construction.needsCalibration);
assert.equal(uncalibrated.familyAnalysis.Pcu, null);
assert.throws(() => make('wrong'), /supported planar construction/);
console.log('All planar constructions passed geometry, drive, force-map, mechanical export and legacy compatibility checks.');
