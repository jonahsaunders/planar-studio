import assert from 'node:assert/strict';
import { analyseLitz, sweepLitz, solveLitzNetwork, foilSkinFactor } from '../web/js/engine/litz-model.js';
import { buildLitz, litzPreset } from '../web/js/engine/litz.js';

const close = (actual, expected, relative = 1e-8, absolute = 1e-14) =>
  assert.ok(Math.abs(actual - expected) <= Math.max(absolute, Math.abs(expected) * relative), `${actual} ≠ ${expected}`);

// Exact coupled-parallel limit: preserving mutual coupling is essential. Two
// matched branches have Req=R/2 and Leq=(L+M)/2, not L/2.
{
  const a = solveLitzNetwork([[0.8, 0], [0, 0.8]], [[2e-6, 1.8e-6], [1.8e-6, 2e-6]], 6.78e6);
  close(a.R, 0.4);
  close(a.L, 1.9e-6);
  for (const i of a.currents) { close(i[0], 0.5); close(i[1], 0); }
  close(a.copperLossPerAmp2, a.R);
  close(a.energyL, a.L);
}

// DC sharing follows conductor resistance even when the inductance is unequal.
{
  const a = solveLitzNetwork([[1, 0], [0, 3]], [[4e-6, 1e-6], [1e-6, 2e-6]], 0);
  close(a.R, 0.75);
  close(a.currents[0][0], 0.75);
  close(a.currents[1][0], 0.25);
}

// A deliberately asymmetric coupled pair must still satisfy both branch KVLs,
// current conservation and real/reactive power balance.
{
  const R = [[0.2, 0.03], [0.03, 0.7]], L = [[2e-6, 1e-6], [1e-6, 3e-6]], f = 1e6;
  const a = solveLitzNetwork(R, L, f), w = 2 * Math.PI * f;
  close(a.currents[0][0] + a.currents[1][0], 1);
  close(a.currents[0][1] + a.currents[1][1], 0);
  assert.ok(Math.abs(a.currents[0][0] - a.currents[1][0]) > 0.2);
  assert.ok(Math.abs(a.currents[0][1]) > 1e-4);
  for (let i = 0; i < 2; i++) {
    let real = 0, imaginary = 0;
    for (let j = 0; j < 2; j++) {
      real += R[i][j] * a.currents[j][0] - w * L[i][j] * a.currents[j][1];
      imaginary += R[i][j] * a.currents[j][1] + w * L[i][j] * a.currents[j][0];
    }
    close(real, a.Z[0]); close(imaginary, a.Z[1]);
  }
  close(a.copperLossPerAmp2, a.R);
  close(a.energyL, a.L);
  assert.ok(a.R > 0 && a.L > 0);
}

// Independent slab limits: DC resistance at very large skin depth; two-face
// conduction at high frequency approaches thickness/(2 delta).
close(foilSkinFactor(70e-6, 1), 1);
close(foilSkinFactor(70e-6, 0.5e-6), 70);
assert.ok(foilSkinFactor(70e-6, 25e-6) > 1);

const cfg = { traceW: 0.8, copperOz: 70 / 34.8, tempC: 20, freq: 6.78e6,
  current: 2, cExtra: 0, litzViaPlating: 25, litzViaDrill: 0.3 };

function loop(radius, offset = 0) {
  const p = [];
  for (let i = 0; i <= 64; i++) {
    const theta = (0.05 + 1.9 * i / 64) * Math.PI;
    p.push([radius * Math.cos(theta) + offset, radius * Math.sin(theta)]);
  }
  return p;
}

function pairGeometry() {
  return { config: { ...cfg }, layers: [{ name: 'F.Cu', z: 0 }, { name: 'B.Cu', z: 1.6 }],
    strands: [10, 12].map((r, id) => ({ id, bundle: id ? 'outer' : 'inner',
      sections: [{ layer: 'F.Cu', pts: loop(r) }], vias: [] })) };
}

{
  const geom = pairGeometry(), a = analyseLitz(cfg, geom, { segmentCap: 64 });
  const dcExpected = 1 / a.currentShares.reduce((sum, s) => sum + 1 / s.Rdc, 0);
  close(a.Rdc, dcExpected);
  assert.ok(a.Rac >= a.Rdc && a.Q > 0 && a.L > 0);
  close(a.Ploss, cfg.current ** 2 * a.Rac);
  close(a.copperLossPerAmp2, a.Rac);
  close(a.currentShares.reduce((s, i) => s + i.re, 0), 1);
  close(a.currentShares.reduce((s, i) => s + i.im, 0), 0);
  assert.ok(a.currentImbalance > 1.01, 'different radii must produce unequal currents');
  assert.equal(a.Ctot, 0);
  assert.equal(a.srf, Infinity);
  assert.equal(a.srfKnown, false);
  assert.equal(a.validated, false);
  assert.ok(a.limitations.some(s => s.includes('Intrinsic distributed capacitance')));
  const b = analyseLitz({ ...cfg, freq: 1 }, geom, { segmentCap: 64 });
  assert.equal(a.inductanceMatrix, b.inductanceMatrix, 'material/geometry cache must survive frequency changes');
  close(b.Rac, b.Rdc, 1e-7);
  const atDC = analyseLitz({ ...cfg, freq: 0 }, geom, { segmentCap: 64 });
  close(atDC.Rac, atDC.Rdc);
  close(atDC.Q, 0);
  const sweep = sweepLitz(cfg, a, 1e4, 1e7, 24);
  assert.equal(sweep.length, 24);
  for (const p of sweep) {
    assert.ok(Number.isFinite(p.Z) && p.R > 0 && p.L > 0);
    close(p.Ploss, cfg.current ** 2 * p.R);
  }
  const finer = analyseLitz(cfg, geom, { segmentCap: 128 });
  close(finer.L, a.L, 0.03);
  assert.ok(a.regularisationH < 0.01 * a.L, 'basic loop must not require material passivity repair');
  const withC = analyseLitz({ ...cfg, cExtra: 1000 }, geom, { segmentCap: 64 });
  assert.ok(Number.isFinite(withC.lumpedResonanceHz));
  assert.equal(withC.srfKnown, false, 'added capacitance is not a distributed SRF prediction');
}

// Barrel resistance must use CONNECTED span and annular plating area. Changing
// board thickness alone must not change a via restricted to two inner layers.
function viaGeometry(span, count = 1) {
  const top = [[-10, 0], [10, 0]], bottom = [[10, 0], [10, 10]];
  return { config: cfg, layers: [{ name: 'F.Cu', z: 0 }, { name: 'In1.Cu', z: span }, { name: 'B.Cu', z: 3.2 }],
    strands: [{ id: 0, bundle: 'outer', sections: [{ layer: 'F.Cu', pts: top }, { layer: 'In1.Cu', pts: bottom }],
      vias: Array.from({ length: count }, () => ({ x: 10, y: 0, from: 'F.Cu', to: 'In1.Cu', drill: 0.3, diameter: 0.6 })) }] };
}
{
  const a = analyseLitz(cfg, viaGeometry(0.4), { segmentCap: 48 });
  const b = analyseLitz(cfg, viaGeometry(1.6), { segmentCap: 48 });
  close(b.currentShares[0].viaRdc / a.currentShares[0].viaRdc, 4);
  close(a.currentShares[0].traceRdc, b.currentShares[0].traceRdc);
  const expectedVia = 1.724e-8 * 0.4e-3 / (Math.PI * 25e-6 * (0.3e-3 + 25e-6));
  close(a.viaR, expectedVia);
  const hotter = analyseLitz({ ...cfg, tempC: 60 }, viaGeometry(0.4), { segmentCap: 48 });
  close(hotter.Rdc / a.Rdc, 1 + 0.00393 * 40);
  const thicker = analyseLitz({ ...cfg, litzViaPlating: 50 }, viaGeometry(0.4), { segmentCap: 48 });
  assert.ok(thicker.viaR < a.viaR);
}

// Exercise the real sixteen-strand exported routing, not just small algebraic
// fixtures. Reversing export layer-name order must not reverse via currents:
// traversal indices remain authoritative for the impedance geometry.
{
  const preset = { ...cfg, ...litzPreset() }, geometry = buildLitz(preset);
  const a = analyseLitz(preset, geometry, { segmentCap: 96 });
  assert.equal(a.currentShares.length, 16);
  assert.ok(a.L > 0 && a.Rac >= a.Rdc && Number.isFinite(a.Q));
  close(a.currentShares.reduce((sum, s) => sum + s.re, 0), 1);
  close(a.currentShares.reduce((sum, s) => sum + s.im, 0), 0);
  close(a.copperLossPerAmp2, a.Rac);
  assert.ok(a.regularisationH < 0.01 * a.L);
  assert.ok(a.limitations.some(s => s.includes('underestimated')));
  assert.ok(sweepLitz(preset, a, 1e5, 1e7, 12).every(p => Number.isFinite(p.Z) && p.R > 0));
}

assert.throws(() => analyseLitz(cfg, { layers: [], strands: [] }), /1–16/);
assert.throws(() => sweepLitz(cfg, {}), /analyseLitz/);
console.log('Litz model: coupled branch limits, conservation/passivity, AC/DC, via spans and cached sweeps passed.');
