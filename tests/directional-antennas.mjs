import assert from 'node:assert/strict';
import * as antenna from '../web/js/ws/antenna.js';
import { toKicad } from '../web/js/engine/artwork.js';
import { exportKicadPcb } from '../web/js/engine/exporters.js';
import { sexpr } from '../web/js/engine/boardcheck.js';
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`  ok ${name}`); }
const config = (family, extra = {}) => ({ ...antenna.defaults(), family, ...extra });
const build = (family, extra = {}, env = {}) => antenna.compute(config(family, extra), env);
const near = (a, b, tol = 1e-8) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const box = p => [p.x - p.w / 2, p.y - p.h / 2, p.x + p.w / 2, p.y + p.h / 2];
const contains = (p, x, y) => { const b = box(p); return x >= b[0] - 1e-9 && x <= b[2] + 1e-9 && y >= b[1] - 1e-9 && y <= b[3] + 1e-9; };
const sameCopper = (a, b) => a.layer === b.layer && a.net === b.net;
function exportedPads(r) {
  const find = (n, name) => n.find(p => Array.isArray(p) && p[0] === name);
  return sexpr(exportKicadPcb(r.art)).filter(n => n[0] === 'footprint').map(n => {
    const p = find(n, 'pad'), at = find(n, 'at'), size = find(p, 'size');
    return { x: +at[1], y: -at[2], w: +size[1], h: +size[2], layer: find(p, 'layers')[1], net: find(p, 'net')[2] || null };
  });
}
for (const family of ['vivaldi', 'yagi', 'lpda', 'bowtie']) check(`${family}: feeds touch their copper; exported pads and IPC retain layers/nets`, () => {
  const r = build(family), payload = toKicad(r.art, { dx: 12, dy: 9 }), pads = exportedPads(r);
  assert.equal(pads.length, r.art.pads.length);
  assert.equal(payload.vias.length, 0, 'No through shorts');
  r.art.pads.forEach((p, i) => {
    assert.equal(pads[i].net, p.net); assert.equal(pads[i].layer, p.layer);
    near(pads[i].x, p.x, 0.000001); near(pads[i].y, p.y, 0.000001);
    near(payload.pads[i].x, p.x + 12); near(payload.pads[i].y, 9 - p.y);
  });
  for (const p of r.art.ports) assert.ok(r.art.pads.some(q => sameCopper(p, q) && contains(q, p.x, p.y)), `No copper at ${p.name}`);
  // Rectangle intersection, independent of the app's conservative circular
  // board-check envelopes. Opposite nets on different layers may overlap.
  for (let i = 0; i < pads.length; i++) for (let j = i + 1; j < pads.length; j++) {
    if (pads[i].layer !== pads[j].layer || pads[i].net === pads[j].net) continue;
    const [a, b] = [box(pads[i]), box(pads[j])];
    assert.ok(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1], 'Different nets overlap');
  }
  assert.equal(antenna.charts(config(family), r).length, 0, 'Do not fabricate radiation plots');
});
check('Yagi scaling, ordering and isolated parasitic conductors', () => {
  const c = config('yagi', { yagiDirectors: 12 }), a = antenna.compute(c), b = antenna.compute({ ...c, freq: c.freq * 2 });
  const driven = a.art.pads.filter(p => p.role === 'driven'), ref = a.art.pads.find(p => p.role === 'reflector'), dirs = a.art.pads.filter(p => p.role === 'director');
  assert.equal(dirs.length, 12); assert.ok(ref.y < 0); assert.equal(ref.net, null);
  near(box(driven[1])[0] - box(driven[0])[2], c.feedGap);
  near(a.analysis.drivenLength, 299792458e3 / c.freq / Math.sqrt((c.epsR + 1) / 2) / 2 * c.armScale);
  near(b.analysis.drivenLength * 2, a.analysis.drivenLength);
  for (let i = 0; i < dirs.length; i++) {
    assert.equal(dirs[i].net, null); assert.ok(dirs[i].y > 0);
    near(dirs[i].w, a.analysis.drivenLength * (c.yagiDirectorScale - i * c.yagiDirectorTaper));
    if (i) assert.ok(dirs[i].y > dirs[i - 1].y && dirs[i].w < dirs[i - 1].w);
  }
});
check('LPDA arms alternate layer/polarity, scale geometrically and join only their own boom', () => {
  const c = config('lpda'), r = antenna.compute(c), a = r.analysis;
  const booms = r.art.pads.filter(p => p.role === 'lpda-boom'), arms = r.art.pads.filter(p => p.role === 'lpda-arm');
  assert.equal(booms.length, 2); assert.equal(arms.length, 2 * c.lpdaElements);
  assert.notEqual(booms[0].net, booms[1].net); assert.notEqual(booms[0].layer, booms[1].layer);
  for (let i = 0; i < c.lpdaElements; i++) {
    const left = arms[2 * i], right = arms[2 * i + 1];
    assert.notEqual(left.layer, right.layer); assert.notEqual(left.net, right.net);
    assert.ok(left.x < 0 && right.x > 0);
    if (i) {
      assert.notEqual(left.layer, arms[2 * (i - 1)].layer);
      near(a.elementLengths[i] / a.elementLengths[i - 1], c.lpdaTau);
      near(a.elementWidths[i] / a.elementWidths[i - 1], c.lpdaTau);
      near(a.elementPositions[i] - a.elementPositions[i - 1], c.lpdaSpacing * a.elementLengths[i - 1]);
    }
    for (const arm of [left, right]) assert.ok(booms.some(b => sameCopper(b, arm) && contains(b, 0, arm.y)));
  }
  assert.ok(r.art.ports.every(p => p.y > a.elementPositions.at(-1)));
  near(a.lengthFrequencyHigh / a.lengthFrequencyLow, c.lpdaTau ** -(c.lpdaElements - 1));
});
for (const profileStep of [0.1, 0.2]) check(`Vivaldi ${profileStep} mm: exponential slot stays open and connected copper survives rounding`, () => {
  const c = config('vivaldi', { profileStep }), r = antenna.compute(c), a = r.analysis;
  const pads = r.art.pads.filter(p => p.role === 'vivaldi-flare' && p.x > 0).sort((u, v) => u.y - v.y);
  for (let i = 0; i < pads.length; i++) {
    const b = box(pads[i]);
    for (const y of [b[1], b[3]]) {
      const ideal = c.vivaldiThroat / 2 * (c.vivaldiAperture / c.vivaldiThroat) ** (y / c.vivaldiLength);
      assert.ok(b[0] >= ideal - 1e-8 && b[0] - ideal <= profileStep, 'Bounded exponential-profile error');
    }
    if (i) assert.ok(b[1] < box(pads[i - 1])[3], 'Positive copper overlap');
  }
  const back = r.art.pads.find(p => p.role === 'slot-back');
  for (const p of r.art.pads.filter(p => p.role === 'slot-throat')) near(box(p)[1], box(back)[3]);
  const feed = r.art.tracks[0];
  assert.equal(feed.layer, 'F.Cu');
  assert.ok(feed.pts[0][0] < -c.vivaldiThroat / 2 && feed.pts[1][0] > c.vivaldiThroat / 2);
  near(feed.pts[0][1], -c.vivaldiBackslot / 2);
  assert.ok(feed.width < c.vivaldiBackslot);
  const ex = exportedPads(r).filter(p => p.layer === 'B.Cu' && p.x > 0 && p.y > 0).sort((u, v) => u.y - v.y);
  for (let i = 1; i < ex.length; i++) assert.ok(box(ex[i])[1] < box(ex[i - 1])[3], 'Export rounding must not open the flare');
  assert.equal(a.profileSteps, pads.length);
});
for (const profileStep of [0.01, 0.1]) check(`Bow-tie ${profileStep} mm: filled symmetric arms, true gap, bounded flare error and continuous exports`, () => {
  const c = config('bowtie', { profileStep }), r = antenna.compute(c);
  const arms = r.art.pads.filter(p => p.x > 0).sort((a, b) => a.x - b.x);
  near(box(arms[0])[0], c.feedGap / 2);
  const slope = Math.tan(c.bowtieAngle * Math.PI / 360);
  for (let i = 0; i < arms.length; i++) {
    const p = arms[i], b = box(p), mirror = r.art.pads.find(q => Math.abs(q.x + p.x) < 1e-9);
    assert.ok(mirror); near(p.h, mirror.h); near(p.w, mirror.w); assert.notEqual(p.net, mirror.net);
    for (const x of [b[0], b[2]]) assert.ok(Math.abs(p.h / 2 - (c.traceW / 2 + (x - c.feedGap / 2) * slope)) <= profileStep);
    if (i) assert.ok(b[0] < box(arms[i - 1])[2]);
  }
  const ex = exportedPads(r).filter(p => p.x > 0).sort((a, b) => a.x - b.x);
  for (let i = 1; i < ex.length; i++) assert.ok(box(ex[i])[0] < box(ex[i - 1])[2], 'Export rounding must not open an arm');
});
check('Invalid imported geometries fail instead of changing element counts or shorting feeds', () => {
  for (const [family, extra] of [
    ['vivaldi', { vivaldiThroat: 10, vivaldiAperture: 15 }], ['vivaldi', { vivaldiBackslot: 1 }], ['vivaldi', { vivaldiStub: 100 }], ['vivaldi', { profileStep: 0.01 }],
    ['yagi', { yagiDirectors: 2.5 }], ['yagi', { yagiDirectors: 20, yagiDirectorTaper: 0.03 }], ['yagi', { freq: 30e9, traceW: 3 }],
    ['lpda', { lpdaElements: 24, lpdaTau: 0.75 }], ['lpda', { lpdaTau: 1 }], ['lpda', { lpdaElements: Infinity }],
    ['bowtie', { bowtieAngle: 0 }], ['bowtie', { feedGap: 10, freq: 30e9 }], ['bowtie', { profileStep: NaN }],
  ]) assert.throws(() => build(family, extra));
  for (const family of ['lpda', 'vivaldi']) assert.throws(() => build(family, {}, { board: { layerCount: 1 } }), /front.*back/);
});
check('Maximum useful element counts remain available with valid dimensions', () => {
  assert.equal(build('lpda', { lpdaElements: 24, lpdaTau: 0.95 }).analysis.elements, 24);
  assert.equal(build('yagi', { yagiDirectors: 20, yagiDirectorTaper: 0 }).analysis.elements, 22);
});
console.log(`${checks} directional antenna checks passed.`);
