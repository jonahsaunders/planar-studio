/* Behavior and physics checks for the study tools. No browser dependencies. */
import assert from 'node:assert/strict';
import { parseMeasurement, parseTouchstone, interpolate } from '../web/js/engine/measurements.js';
import { fieldAt, coupledCoils, magnetCenterField, transformPolys } from '../web/js/engine/magnetics.js';
import { toFilaments, MU0, buildCoil, analyse } from '../web/js/engine/coil.js';
import { defaults as defaultsCoil } from '../web/js/ws/inductor.js';
import { defaults as defaultsFilter, compute as computeFilter, synth } from '../web/js/ws/filter.js';
import { tuneDistributed } from '../web/js/engine/filtertune.js';
import { optimizeCoil, toleranceStudy, fitMeasurement, responseOf, maskScore, tuneToMask } from '../web/js/engine/studies.js';
import { parseBoard, checkPlacement, segmentDistance, arcPoints } from '../web/js/engine/boardcheck.js';
import { artwork, track, toKicad } from '../web/js/engine/artwork.js';

let count = 0;
function check(name, fn) { fn(); count++; console.log(`  ok ${name}`); }
const near = (x, y, relative = 0.01) => assert.ok(Math.abs(x - y) <= Math.max(1e-15, Math.abs(y) * relative), `${x} ≠ ${y}`);
check('Touchstone DB units, port ordering, reference impedance', () => {
  const m = parseMeasurement('# MHz S DB R 75\n1 -20 0 -3 90 -3 -90 -20 0\n2 -10 0 -6 0 -6 0 -10 0', 'vna.s2p');
  assert.equal(m.z0, 75); assert.equal(m.rows[0].f, 1e6); near(m.rows[0].s21db, -3, 1e-9);
});
check('Wrapped Touchstone RI records and S1P impedance', () => {
  const m = parseTouchstone('# Hz S RI R 50\n1000 0 0\n2000 0.5 0', 'z.s1p');
  near(m.rows[0].Z, 50); near(m.rows[1].Z, 150);
  assert.equal(parseTouchstone('# GHz S RI R 50\n1 0 0 1 0\n1 0 0 0\n2 0 0 1 0 1 0 0 0').rows.length, 2);
});
check('CSV column mapping, reordered rows, MHz and complex impedance', () => {
  const m = parseMeasurement('R (ohm),Frequency (MHz),X (ohm)\n3,2,4\n6,1,8');
  assert.equal(m.rows[0].f, 1e6); near(m.rows[0].Z, 10);
});
check('Malformed and unsupported measurement formats are rejected', () => {
  assert.throws(() => parseMeasurement('Frequency (Hz),Z (ohm)\n0,2\n1,3'));
  assert.throws(() => parseMeasurement('Frequency (Hz),Z (ohm)\n1,2\n1,3'));
  assert.throws(() => parseTouchstone('[Version] 2.0'));
  assert.throws(() => parseTouchstone('# MHz Y RI R 50\n1 1 2'));
  assert.throws(() => parseMeasurement('Frequency (Hz),Z (ohm)\n1,\n2,3'));
});
check('Interpolation is logarithmic and never extrapolates', () => {
  near(interpolate([1, 100], [0, 20], 10), 10); assert.ok(Number.isNaN(interpolate([1, 100], [0, 20], 200)));
});
const loop = Array.from({ length: 2049 }, (_, i) => [10 * Math.cos(i * 2 * Math.PI / 2048), 10 * Math.sin(i * 2 * Math.PI / 2048), 0]);
check('Biot–Savart circular loop field agrees with analytic on-axis field', () => {
  const F = toFilaments([loop], 0.05, 2000), z = 0.003, r = 0.01;
  const B = fieldAt(F, [0, 0, z * 1000], 2);
  near(B[2], MU0 * 2 * r * r / (2 * (r * r + z * z) ** 1.5), 0.001);
  assert.ok(Math.abs(B[0]) < 1e-8 && Math.abs(B[1]) < 1e-8);
  near(fieldAt(F, [0, 0, 3], -2)[2], -B[2], 1e-8);
});
check('Tilt rotates 3D coordinates and translation uses mm', () => {
  const p = transformPolys([[[1, 0, 0]]], { tilt: 90, x: 2, z: 3 })[0][0];
  near(p[0], 2); near(p[2], 2);
});
const coil = { ...defaultsCoil(), turns: 3, layers: 1, ppt: 128, dOuter: 20 };
check('Coupling reciprocity, separation trend, and intersection rejection', () => {
  const rx = { ...coil, dOuter: 16, turns: 4 };
  const a = coupledCoils(coil, rx, { z: 6, x: 0, y: 0, tilt: 0 }, { points: 2 });
  const b = coupledCoils(rx, coil, { z: 6, x: 0, y: 0, tilt: 0 }, { points: 2 });
  near(a.M, b.M, 1e-8); assert.ok(a.k > 0 && a.k < 1);
  const far = coupledCoils(coil, rx, { z: 20 }, { points: 2 }); assert.ok(far.M < a.M);
  assert.throws(() => coupledCoils(coil, rx, { z: 0.1 }, { points: 2 }));
});
check('Magnet estimate has correct surface limit and decreases with distance', () => {
  const atFace = magnetCenterField(1.2, 3, 4, 0); near(atFace, 0.6 * 4 / 5, 1e-9);
  assert.ok(magnetCenterField(1.2, 3, 4, 10) < atFace);
  assert.throws(() => magnetCenterField(1, -2, 3, 1));
});
for (const family of ['stepped', 'edgeCoupled', 'hairpin', 'interdigital']) {
  check(`${family}: physical length tuning shifts frequency and placed copper`, () => {
    const c = { ...defaultsFilter(), family, order: 3, band: family === 'stepped' ? 'lowpass' : 'bandpass', fc: 2e9, points: 401, spanDecades: 0.6 };
    const a = computeFilter(c, {}), b = computeFilter({ ...c, tuning: { lengthScale: 1.1 } }, {});
    assert.notDeepEqual(a.art.tracks, b.art.tracks);
    const features = (r) => r.design.kind === 'stepped' ? r.design.sections[0].length : r.design.kind === 'edgeCoupled' ? r.design.sections[0].length : r.design.resonators[0].armLen || r.design.resonators[0].length;
    near(features(b), features(a) * 1.1, 1e-9);
    assert.ok(b.response.s21db.every(Number.isFinite));
    const peak = (r) => r.response.freqs[r.response.s21db.indexOf(Math.max(...r.response.s21db))];
    if (family !== 'stepped') assert.ok(peak(b) < peak(a), `${peak(b)} >= ${peak(a)}`);
    if (family === 'interdigital') {
      const t = computeFilter({ ...c, tuning: { lengths: [1.3, 1, 0.8] } }, {});
      const tracks = t.art.tracks.filter((t) => t.role === 'resonator');
      near(tracks[0].pts[1][1] / tracks[1].pts[1][1], 1.3); near(tracks[2].pts[1][1] / tracks[1].pts[1][1], 0.8);
    }
  });
}
check('Fixed copper material variation does not resize resonators', () => {
  const c = { ...defaultsFilter(), family: 'edgeCoupled', order: 3 }, base = synth(c);
  const a = tuneDistributed(base, c), b = tuneDistributed(base, c, {}, { er: 6 });
  near(a.sections[0].length, b.sections[0].length, 1e-9);
  assert.notEqual(a.elements[0].coupled.epsEffEven, b.elements[0].coupled.epsEffEven);
  const etch = tuneDistributed(base, c, {}, { etch: 0.02 });
  near(etch.sections[0].w + etch.sections[0].s, a.sections[0].w + a.sections[0].s, 1e-9);
});
check('Seeded zero-tolerance study collapses exactly to nominal', () => {
  const L = analyse(coil, buildCoil(coil), { segmentCap: 1400 }).L;
  const opt = { samples: 4, seed: 42, ranges: { etch: 0, er: 0, copper: 0, thickness: 0 }, targetL: L, errorPct: 1, minQ: 0 };
  const r = toleranceStudy('inductor', coil, opt);
  assert.deepEqual(r.low, r.nominal.y); assert.deepEqual(r.high, r.nominal.y); assert.equal(r.yield, 1);
  const noisy = { ...opt, ranges: { etch: 0.01, er: 5, copper: 10, thickness: 5 } };
  assert.deepEqual(toleranceStudy('inductor', coil, noisy).low, toleranceStudy('inductor', coil, noisy).low);
});
check('Response mask includes endpoints and rejects unmodeled bands', () => {
  const c = { x: [1, 10, 100], y: [-2, -1, -30] };
  assert.equal(maskScore(c, [{ from: 1, to: 10, min: -3, max: 0 }]).passes, true);
  assert.equal(maskScore(c, [{ from: 1, to: 10, min: -1, max: 0 }]).passes, false);
  assert.throws(() => maskScore(c, [{ from: 1, to: 101, min: -90, max: 0 }]));
});
check('Fitting synthetic coil measurement lowers residual and respects bounds', () => {
  const nominal = { ...coil, studyF0: 1e6, studyF1: 1e8 }, actual = responseOf('inductor', { ...nominal, cExtra: 30 });
  const m = { rows: actual.x.map((f, i) => ({ f, Z: actual.y[i] })) };
  const fit = fitMeasurement('inductor', nominal, m, { fields: [{ key: 'cExtra', min: 0, max: 60 }] });
  assert.ok(fit.loss < fit.originalLoss * 0.01); near(fit.config.cExtra, 30, 0.05); assert.equal(nominal.cExtra, 0);
});
check('Optimizer returns only candidates fitting copper bounds and the target', () => {
  const opt = { targetL: 1e-6, maxWidth: 25, maxHeight: 25, frequency: 1e6, minWidth: 0.3, maxTrace: 0.3, minGap: 0.2, maxGap: 0.2, layers: [2], errorPct: 4, srfMargin: 3 };
  const r = optimizeCoil(coil, opt); assert.ok(r.candidates.length > 0);
  for (const p of r.candidates) { assert.ok(p.width <= 25 && p.height <= 25); near(p.L, 1e-6, 0.04); assert.equal(p.config.turns % 1, 0); }
});
const boardText = `(kicad_pcb (version 20240108) (net 1 "GND") (net 2 "OTHER")
  (gr_rect (start -15 -15) (end 15 15) (layer "Edge.Cuts") (stroke (width 0.1)))
  (segment (start -5 0) (end 5 0) (width 0.3) (layer "F.Cu") (net 2) (uuid "track1"))
  (footprint "Mount" (at 4 4 90) (pad "1" np_thru_hole circle (at 2 0) (size 3 3) (drill 3) (layers "*.Cu" "*.Mask")))
  (zone (net 1) (layer "B.Cu") (filled_polygon (layer "B.Cu") (pts (xy -14 -14) (xy 14 -14) (xy 14 14) (xy -14 14))))
  (zone (layer "F.Cu") (keepout (tracks not_allowed)) (polygon (pts (xy -8 -8) (xy -5 -8) (xy -5 -5) (xy -8 -5)))))`;
check('Board parser: footprint rotation, ground polygons, keepouts, exclusions', () => {
  const b = parseBoard(boardText); assert.equal(b.loops.length, 1); assert.equal(b.keepouts.length, 1);
  near(b.holes[0].point[0], 4); near(b.holes[0].point[1], -2);
  assert.equal(parseBoard(boardText, ['track1']).copper.filter((t) => t.id === 'track1').length, 0);
});
check('Segment intersection catches crossings without vertex proximity', () => near(segmentDistance([-10, 0], [10, 0], [0, -10], [0, 10]), 0));
check('Board checks detect crossing copper, board edges and placement origin', () => {
  const b = parseBoard(boardText), a = artwork(); a.tracks.push(track('F.Cu', 0.3, [[0, -5], [0, 5]], { net: 'COIL', role: 'winding' }));
  const r = checkPlacement(a, b, { kind: 'inductor', origin: [0, 0] });
  assert.ok(r.findings.some((f) => f.type === 'copper')); assert.ok(r.findings.some((f) => f.type === 'ground-overlap'));
  assert.ok(checkPlacement(a, b, { origin: [50, 0] }).findings.some((f) => f.type === 'edge'));
  assert.ok(!checkPlacement(a, b, { kind: 'filter', distributed: true }).findings.some((f) => f.type === 'reference-ground'));
  const noGround = { ...b, copper: b.copper.filter((p) => !p.polygon) };
  assert.ok(checkPlacement(a, noGround, { kind: 'filter', distributed: true }).findings.some((f) => f.type === 'reference-ground'));
});
check('Arc sampling preserves semicircle midpoint and endpoints', () => {
  const p = arcPoints([1, 0], [0, 1], [-1, 0]); near(p[0][0], 1); near(p.at(-1)[0], -1); assert.ok(p.some((x) => x[1] > 0.99));
});
console.log(`\n${count} design-tool checks passed`);
