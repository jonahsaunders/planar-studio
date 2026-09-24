import assert from 'node:assert/strict';
import { solvePassiveNetwork, stampPair } from '../web/js/engine/litz-network.js';

const close = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) < Math.max(1e-12, Math.abs(b) * rel), `${a} != ${b}`);

// A known parallel RLC, including dielectric conductance, spans both sides of
// resonance and validates real/reactive power identities against analytic Z.
{
  const R = 2, L = 10e-6, capacitance = 100e-12, leakage = 1e-4;
  const C = new Float64Array(4), G = new Float64Array(4);
  stampPair(C, 2, [[0, 1], [1, -1]], capacitance);
  stampPair(G, 2, [[0, 1], [1, -1]], leakage);
  for (const f of [0, 1e5, 1 / (2 * Math.PI * Math.sqrt(L * capacitance)), 1e7]) {
    const w = 2 * Math.PI * f, denominator = R * R + (w * L) ** 2;
    const yr = R / denominator + leakage, yi = -w * L / denominator + w * capacitance;
    const d = yr * yr + yi * yi;
    const a = solvePassiveNetwork({ branches: [{ a: 0, b: 1 }], nodeCount: 2, R: [[R]], L: [[L]], C, G }, f);
    close(a.Z[0], yr / d); close(a.Z[1], -yi / d);
    close(a.copperLoss + a.dielectricLoss, a.Z[0]);
    close(w * (a.magneticEnergy - a.electricEnergy), a.Z[1]);
    assert.ok(a.copperLoss >= 0 && a.dielectricLoss >= 0);
  }
}

// Shared bus: one 2-ohm conductor feeds parallel 3-ohm and 6-ohm branches.
// Duplicating the common bus into each winding would give the wrong 4 ohms.
{
  const a = solvePassiveNetwork({ nodeCount: 3, inputNode: 0, outputNode: 2,
    branches: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 1, b: 2 }],
    R: [[2, 0, 0], [0, 3, 0], [0, 0, 6]], L: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] }, 0);
  close(a.Z[0], 4); close(a.currents[0][0], 1);
  close(a.currents[1][0], 2 / 3); close(a.currents[2][0], 1 / 3);
  close(a.copperLoss, 4); close(a.powerBalanceError, 0);
}

// Distributed RC: two resistors separated by a shunt C have different currents
// at RF, unlike a single terminal capacitance. Rinput=R1+R2/(1+jwR2C).
{
  const C = new Float64Array(9), R1 = 3, R2 = 7, c = 1e-6, f = 10000, x = 2 * Math.PI * f * R2 * c;
  stampPair(C, 3, [[1, 1], [2, -1]], c);
  const a = solvePassiveNetwork({ nodeCount: 3, inputNode: 0, outputNode: 2,
    branches: [{ a: 0, b: 1 }, { a: 1, b: 2 }], R: [[R1, 0], [0, R2]], L: [[0, 0], [0, 0]], C }, f);
  close(a.Z[0], R1 + R2 / (1 + x * x)); close(a.Z[1], -R2 * x / (1 + x * x));
  close(a.currents[0][0], 1); assert.ok(Math.abs(a.currents[1][1]) > .1);
}

// Interpolated floating capacitance has no ground leakage and nonnegative
// electric energy, including repeated nodes in the voltage interpolation.
{
  const C = new Float64Array(16);
  stampPair(C, 4, [[0, .3], [1, .7], [2, -.4], [3, -.6]], 8e-12);
  for (let i = 0; i < 4; i++) close(C.slice(i * 4, (i + 1) * 4).reduce((a, b) => a + b), 0);
  const v = [2, 7, -1, 3], difference = .3 * 2 + .7 * 7 - .4 * -1 - .6 * 3;
  let energy = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) energy += v[i] * C[i * 4 + j] * v[j];
  close(energy, 8e-12 * difference * difference);
  assert.ok(energy >= 0);
}
assert.throws(() => solvePassiveNetwork({ nodeCount: 3, branches: [], R: [], L: [] }, 1e6), /disconnected/);
assert.throws(() => stampPair(new Float64Array(4), 2, [[0, 1], [1, -1]], -1), /nonnegative/);
console.log('Litz network: analytic RLC, shared buses, distributed RC, floating capacitance and power balance passed.');
