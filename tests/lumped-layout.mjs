/* Physical-copper regressions, independent of the circuit response model.
   Run: node tests/lumped-layout.mjs (no third-party packages required). */
import assert from 'node:assert/strict';
import { defaults, compute } from '../web/js/ws/filter.js';
import { defaultContext, interdigitalGeom } from '../web/js/engine/filtergeom.js';
import { segmentDistance } from '../web/js/engine/boardcheck.js';
import { toKicad, boundsCopper } from '../web/js/engine/artwork.js';
import { exportKicadPcb } from '../web/js/engine/exporters.js';

const eps = 1e-7;
const routeRoles = new Set(['route', 'link', 'par-link', 'spine', 'feed', 'coil-return', 'gnd-drop', 'gnd-rail']);
const distance = (a, b) => {
  let d = Infinity;
  for (let i = 1; i < a.pts.length; i++) for (let j = 1; j < b.pts.length; j++) {
    d = Math.min(d, segmentDistance(a.pts[i - 1], a.pts[i], b.pts[j - 1], b.pts[j]));
  }
  return d;
};
const gap = (a, b) => distance(a, b) - (a.width + b.width) / 2;
const samePoint = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < eps;
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`  ok ${name}`); }

function assertRouting(art) {
  const fingers = art.tracks.filter(t => t.role.startsWith('idc-finger'));
  // Different components may have the same orientation, so test every pair.
  for (let i = 0; i < fingers.length; i++) for (let j = i + 1; j < fingers.length; j++) {
    const a = fingers[i], b = fingers[j];
    if (a.layer === b.layer) assert.ok(gap(a, b) > eps, 'Capacitor fingers touch or cross');
  }
  const routes = art.tracks.filter(t => routeRoles.has(t.role));
  const coils = art.tracks.filter(t => t.role === 'coil');
  const leads = art.tracks.filter(t => t.role === 'coil-lead');
  for (const a of routes) {
    for (const b of coils) if (a.layer === b.layer) {
      assert.ok(gap(a, b) >= -eps, `${a.role} cuts through a winding`);
    }
    // A wire may join its own terminal, but must not run over the other lead.
    for (const b of leads) if (a.layer === b.layer && gap(a, b) < -eps) {
      assert.ok(a.pts.some(p => samePoint(p, b.pts.at(-1))), `${a.role} crosses an unrelated coil lead`);
    }
    for (const b of fingers) if (a.layer === b.layer) {
      // Contacts at an electrode spine are intentional; crossing the finger
      // interior is not. Trim only the small endpoint contact neighborhoods.
      const [p, q] = b.pts, len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const trim = (a.width + b.width) / 2 + 0.01;
      if (len <= 2 * trim) continue;
      const inside = { ...b, pts: [p.map((v, i) => v + (q[i] - v) * trim / len), q.map((v, i) => v + (p[i] - v) * trim / len)] };
      assert.ok(gap(a, inside) >= -eps, `${a.role} crosses capacitor fingers`);
    }
  }
  // Through vias must escape the plate on BOTH layers before changing layers.
  const plates = art.tracks.filter(t => t.role === 'plate-a' || t.role === 'plate-b');
  for (const v of art.vias.filter(v => v.role === 'plate-escape')) {
    for (const p of plates) {
      const hole = { pts: [[v.x, v.y], [v.x, v.y]], width: v.diameter };
      assert.ok(gap(hole, p) >= 0.2 - eps, 'Plate escape via shorts/approaches a plate');
    }
  }
  // P2 must be beyond the last component, not inside a giant shunt capacitor.
  const components = { ...art, tracks: art.tracks.filter(t => !routeRoles.has(t.role)), pads: [], vias: [], outline: [] };
  assert.ok(boundsCopper(components).x1 < art.ports[1].x, 'Component extends beyond P2');
  const rail = art.tracks.find(t => t.role === 'gnd-rail');
  if (rail) {
    const copper = { ...art, tracks: art.tracks.filter(t => !['gnd-rail', 'gnd-drop'].includes(t.role)), vias: [], pads: [], outline: [] };
    assert.ok(rail.pts[0][1] + rail.width / 2 <= boundsCopper(copper).y0 - 0.2 + eps, 'Ground rail overlaps component copper');
  }
}

for (const capStyle of ['interdigital', 'plate']) {
  for (const band of ['lowpass', 'highpass', 'bandpass', 'bandstop']) {
    for (const seriesFirst of [true, false]) {
      check(`${capStyle}, ${band}, ${seriesFirst ? 'series' : 'shunt'} first: physical routing`, () => {
        const cfg = { ...defaults(), capStyle, band, seriesFirst, response: 'butterworth', f1: 90e6, f2: 110e6 };
        assertRouting(compute(cfg, {}, { quick: true }).art);
      });
    }
  }
}

for (const order of [3, 7]) check(`Narrow band-pass, order ${order}: oversized capacitors stay in their slots`, () => {
  assertRouting(compute({ ...defaults(), order, band: 'bandpass', response: 'chebyshev', f1: 95e6, f2: 105e6 }, {}, { quick: true }).art);
});

check('IDC physical end gaps include round trace caps', () => {
  const ctx = defaultContext({ fingerW: 0.2, fingerG: 0.2, traceW: 0.3 });
  const { art } = interdigitalGeom(ctx, 100e-12);
  for (const f of art.tracks.filter(t => t.role.startsWith('idc-finger'))) {
    const other = art.tracks.find(t => t.role === (f.role.endsWith('-a') ? 'idc-spine-b' : 'idc-spine-a'));
    assert.ok(gap(f, other) >= ctx.fingerG - eps, 'Rounded finger tip violates its configured end gap');
  }
});

check('KiCad placement payload preserves the checked geometry and adds no crossings', () => {
  const { art } = compute({ ...defaults(), band: 'bandpass', response: 'butterworth', f1: 90e6, f2: 110e6 }, {}, { quick: true });
  const placed = toKicad(art, { tolerance: 0 });
  assert.equal(placed.tracks.length, art.tracks.length);
  placed.tracks.forEach((t, i) => {
    assert.equal(t.layer, art.tracks[i].layer);
    assert.equal(t.width, art.tracks[i].width);
    assert.equal(t.pts.length, art.tracks[i].pts.length);
    t.pts.forEach(([x, y], j) => assert.ok(samePoint([x, -y], art.tracks[i].pts[j])));
  });
  const pcb = exportKicadPcb(art, { name: 'layout-regression', tolerance: 0 });
  assert.match(pcb, /\(kicad_pcb/);
  assert.match(pcb, /\(segment/);
});
console.log(`\n${checks} lumped-layout checks passed`);
