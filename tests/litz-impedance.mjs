import assert from 'node:assert/strict';
import { C } from '../web/js/engine/complex.js';
import { rectangularConductorImpedance as extract, rectangularProximityCoefficients,
  rectangularSkinFactor, validateExtractedImpedance } from '../web/js/engine/litz-impedance.js';

const close = (actual, expected, relative = 1e-8, absolute = 1e-15) =>
  assert.ok(Math.abs(actual - expected) <= Math.max(absolute, Math.abs(expected) * relative), `${actual} != ${expected}`);
const rho = 1.724e-8, mu = 4e-7 * Math.PI;
const nominal = { width: 0.8e-3, thickness: 70e-6, rho, f: 6.78e6 };

// Analytical DC: every cell carries area-proportional current, including the
// unequal boundary cells of the graded mesh; external DC H produces no loss.
{
  const r = extract({ ...nominal, f: 0, length: .12, current: [2, -1], externalH: { normal: 1e6, transverse: 1e6 } });
  close(r.resistance, rho * .12 / (nominal.width * nominal.thickness));
  close(r.skinFactor, 1); close(r.copperLoss, 5 * r.dcResistance);
  close(r.Z[1], 0); close(r.fieldLossCoefficients.normal, 0); close(r.fieldLossCoefficients.transverse, 0);
  for (const c of r.cells) {
    close(c.current[0], 2 * c.area / (nominal.width * nominal.thickness));
    close(c.current[1], -c.area / (nominal.width * nominal.thickness));
  }
  close(rectangularSkinFactor(nominal.width, nominal.thickness, Infinity), 1);
}

// Real two-dimensional geometry matters: rotation exchanges H modes, while
// changing width at fixed foil thickness changes transport skin crowding.
{
  const a = extract(nominal), b = extract({ ...nominal, width: nominal.thickness, thickness: nominal.width });
  close(a.resistance, b.resistance, 1e-10);
  close(a.fieldLossCoefficients.normal, b.fieldLossCoefficients.transverse, 1e-9);
  close(a.fieldLossCoefficients.transverse, b.fieldLossCoefficients.normal, 1e-9);
  const square = extract({ ...nominal, width: nominal.thickness });
  assert.ok(a.skinFactor > square.skinFactor * 1.1, 'finite-width edge crowding must not collapse to a thickness-only slab');
  assert.ok(a.inductanceCorrectionPerMeter < 0, 'skin crowding reduces stored partial inductance relative to uniform DC current');
  close(a.copperLoss, a.resistance);
}

// Arbitrary simultaneous complex transport/H excitations: current conservation,
// independently evaluated copper power, and the Hermitian PSD loss Gram matrix.
{
  const drive = [[1.2, -.3], [220, -70], [-90, 45]];
  const r = extract({ ...nominal, length: .2, current: drive[0], externalH: { normal: drive[1], transverse: drive[2] } });
  const total = r.currents.reduce(C.add, [0, 0]);
  close(total[0], drive[0][0]); close(total[1], drive[0][1]);
  let power = [0, 0];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const a = r.lossMatrix[i][j], b = r.lossMatrix[j][i];
    close(a[0], b[0]); close(a[1], -b[1]);
    power = C.add(power, C.mul(C.mul([drive[i][0], -drive[i][1]], a), drive[j]));
  }
  close(power[0], r.copperLoss); close(power[1], 0);
  assert.ok(power[0] > 0);
  const eddy = extract({ ...nominal, current: 0, externalH: { normal: [500, 20] } });
  const net = eddy.currents.reduce(C.add, [0, 0]);
  close(net[0], 0); close(net[1], 0); assert.ok(eddy.copperLoss > 0);
}

// Infinite-line reference gauge changes only the common external inductance;
// current distribution, loss and the AC-to-DC L correction remain invariant.
{
  const a = extract(nominal), b = extract({ ...nominal, referenceRadius: .1 });
  close(a.resistance, b.resistance, 1e-10);
  close(a.inductanceCorrectionPerMeter, b.inductanceCorrectionPerMeter, 1e-8);
  close(b.Z[1] - a.Z[1], 2 * Math.PI * nominal.f * mu / (2 * Math.PI) * Math.log(.1 / a.referenceRadius), 1e-10);
  close(a.fieldLossCoefficients.normal, b.fieldLossCoefficients.normal, 1e-9);
}

// Numerical convergence of a finite PCB rectangle. This does not substitute
// for a 3-D solver or measurement, but bounds the default-versus-refined error
// for this representative frequency and geometry.
{
  const a = extract({ ...nominal, resolution: 4 }), b = extract({ ...nominal, resolution: 6 }), c = extract({ ...nominal, resolution: 8 });
  assert.ok(Math.abs(b.resistance - c.resistance) < Math.abs(a.resistance - c.resistance));
  close(b.resistance, c.resistance, .02);
  close(b.fieldLossCoefficients.normal, c.fieldLossCoefficients.normal, .02);
  close(b.fieldLossCoefficients.transverse, c.fieldLossCoefficients.transverse, .04);
  assert.ok(c.cellCount <= 64 && b.cellCount <= 36);
  assert.equal(extract({ ...nominal, f: 1e12 }).resolved, false);
  assert.ok(extract({ ...nominal, f: 1e12 }).warnings.length);
}

// Independent analytic magnetic-diffusion benchmark (Haus & Melcher, ch.10):
// project the rectangular kernel onto a uniform-width foil mode, with 64 cells
// through thickness. A width/thickness ratio of 1000 approaches the infinite
// slab skin solution. This deliberately constrained mode checks the kernel and
// complex diffusion solve, not the omitted width-direction edge crowding.
for (const u of [.2, 1, 3, 6]) {
  const thickness = 10e-6, delta = thickness / u, f = rho / (Math.PI * mu * delta ** 2);
  const r = extract({ width: thickness * 1000, thickness, rho, f, resolution: { nx: 1, ny: 64 } });
  const analytical = u / 2 * (Math.sinh(u) + Math.sin(u)) / (Math.cosh(u) - Math.cos(u));
  close(r.skinFactor, analytical, .004);
}

// Independently benchmark the externally driven odd diffusion mode, whose
// exact RMS Joule loss coefficient is 2 rho w/delta * (sinh u - sin u)/
// (cosh u + cos u). The result converges as thickness cells are refined.
{
  const width = 1e-3, thickness = 10e-6, f = 5e7, delta = Math.sqrt(rho / (Math.PI * mu * f)), u = thickness / delta;
  const analytical = 2 * rho * width / delta * (Math.sinh(u) - Math.sin(u)) / (Math.cosh(u) + Math.cos(u));
  const coarse = rectangularProximityCoefficients({ width, thickness, rho, f, resolution: { nx: 2, ny: 8 } });
  const fine = rectangularProximityCoefficients({ width, thickness, rho, f, resolution: { nx: 2, ny: 32 } });
  assert.ok(Math.abs(fine.transverse - analytical) < Math.abs(coarse.transverse - analytical));
  close(fine.transverse, analytical, .003);
}

// Reject invalid model inputs rather than silently changing dimensions/units.
for (const override of [{ width: 0 }, { rho: -1 }, { f: NaN }, { resolution: 9 }, { resolution: { nx: 9, ny: 9 } }, { current: [1, NaN] }]) {
  assert.throws(() => extract({ ...nominal, ...override }));
}

// External extraction is an explicit route to independently computed matrices.
// Enforce units, port mapping, ordered samples, reciprocity and sampled PSD.
const data = { frequencyUnit: 'Hz', impedanceUnit: 'ohm', ports: ['inner:0', 'outer:0'], samples: [
  { frequency: 0, impedance: [[[1, 0], [.2, 0]], [[.2, 0], [2, 0]]] },
  { frequency: 1e6, impedance: [[[2, 12], [.4, 8]], [[.4, 8], [3, 12]]] },
] };
{
  const copy = validateExtractedImpedance(data, data.ports);
  assert.equal(copy.samples.length, 2);
  assert.notEqual(copy.samples[0].impedance, data.samples[0].impedance);
  assert.equal(copy.physicallyValidated, false);
  for (const modify of [
    d => { d.frequencyUnit = 'MHz'; }, d => { d.impedanceUnit = 'mohm'; },
    d => { d.samples[1].frequency = 0; }, d => { d.samples[0].impedance[0][0] = [NaN, 0]; },
    d => { d.samples[0].impedance[0][1] = [.5, 0]; },
    d => { d.samples[0].impedance = [[[1, 0], [2, 0]], [[2, 0], [1, 0]]]; },
  ]) { const invalid = structuredClone(data); modify(invalid); assert.throws(() => validateExtractedImpedance(invalid)); }
  assert.throws(() => validateExtractedImpedance(data, [...data.ports].reverse()));
  // Positive semidefinite singular Hermitian part is valid (a lossless mode).
  const semi = structuredClone(data); semi.samples[0].impedance = [[[1, 0], [1, 0]], [[1, 0], [1, 0]]];
  validateExtractedImpedance(semi);
  // Large reactance cannot hide an active eigenmode in the Hermitian part.
  const active = structuredClone(data); active.samples[0].impedance = [[[1e-12, 1e6], [0, 1]], [[0, 1 + 1e-5], [1e-12, 1e6]]];
  assert.throws(() => validateExtractedImpedance(active), /non-passive/);
}

console.log('Rectangular impedance: DC, 2-D crowding, RMS power, reciprocity, mesh convergence, slab diffusion and external-matrix validation passed.');
