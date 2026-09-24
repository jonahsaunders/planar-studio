import assert from 'node:assert/strict';
import { parseMeasurement } from '../web/js/engine/measurements.js';
import { litzMeasurementMetrics } from '../web/js/engine/litz-measurements.js';
const close = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} != ${b}`);

// Independent series RL circuit: Z = 2 Ω + jω·1 µH. Complex interpolation on
// a linear frequency axis must reproduce its exact impedance between samples.
const R = 2, L = 1e-6, f0 = 1e6, f1 = 3e6;
const data = parseMeasurement(`frequency_hz,R,X\n${f0},${R},${2 * Math.PI * f0 * L}\n${f1},${R},${2 * Math.PI * f1 * L}`.replace('frequency_hz', 'frequencyhz'));
const opt = { frequency: 2e6, referencePlane: 'coil-terminals', modelReferencePlane: 'coil-terminals', interpolation: 'linear' };
const r = litzMeasurementMetrics(data, opt);
close(r.atFrequency.R, R); close(r.atFrequency.L, L, 1e-15); close(r.atFrequency.Q, 2 * Math.PI);
assert.equal(r.scope.extrapolated, false);
assert.equal(litzMeasurementMetrics(data, { ...opt, frequency: 4e6 }).atFrequency, null);

const model = { analysis: { f: 2e6, Zr: 100, Zi: 100 }, sweep: [{ f: f0, Zr: 3, Zi: 2 * Math.PI * f0 * 1.5e-6 }, { f: f1, Zr: 3, Zi: 2 * Math.PI * f1 * 1.5e-6 }] };
const compare = litzMeasurementMetrics(data, { ...opt, model });
close(compare.predicted.R, 3); close(compare.predicted.L, 1.5e-6, 1e-15);
close(compare.residuals.R.absolute, 1); close(compare.residuals.R.relative, .5);
close(compare.residuals.L.absolute, .5e-6, 1e-15); close(compare.residuals.L.relative, .5);
close(compare.residuals.Q.absolute, 0);
assert.equal(litzMeasurementMetrics(data, { ...opt, model, referencePlane: 'instrument-port' }).residuals, null);
assert.equal(litzMeasurementMetrics(data, { frequency: 2e6, model }).residuals, null);

const log = litzMeasurementMetrics({ rows: [{ f: 1, zRe: 1, zIm: 10 }, { f: 100, zRe: 3, zIm: 30 }] }, { frequency: 10, interpolation: 'log' });
close(log.atFrequency.R, 2); close(log.atFrequency.zIm, 20); close(log.atFrequency.L, 1 / Math.PI);
const invalid = litzMeasurementMetrics({ rows: [{ f: 0, zRe: 2, zIm: 3 }, { f: 1, zRe: 0, zIm: 3 }, { f: 2, zRe: 2, zIm: -3 }, { f: 3, Z: 100 }] });
assert.equal(invalid.points[0].R, null); assert.equal(invalid.points[0].L, null); assert.equal(invalid.points[0].Q, null);
assert.equal(invalid.points[1].Q, null, 'zero resistance must not produce an infinite Q');
assert.equal(invalid.points[2].L, null); assert.equal(invalid.points[2].Q, null, 'capacitive reactance is not inductance');
assert.equal(invalid.points[3].R, null, 'magnitude alone does not specify series R or phase');
assert.equal(litzMeasurementMetrics({ rows: [{ f: 1, zRe: 1, zIm: 1 }, { f: 1, zRe: 2, zIm: 2 }] }, { frequency: 1 }).atFrequency, null);
const s2 = litzMeasurementMetrics({ ...data, ports: 2 }, opt);
assert.ok(s2.warnings.some(s => /terminated/.test(s)), 'a terminated S2P input is not automatically an isolated coil');
assert.throws(() => litzMeasurementMetrics(data, { interpolation: 'spline' }));
console.log('PCB Litz measurement math passed: exact RL interpolation, explicit residual signs and reference planes, no extrapolation, and invalid/noninductive/zero-R handling.');
