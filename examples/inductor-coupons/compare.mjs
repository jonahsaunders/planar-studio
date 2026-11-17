// Compare one real impedance sweep with its pre-measurement prediction.
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { buildBoard, sha256 } from './generate.mjs';
import { parseMeasurement, measurementValues } from '../../web/js/engine/measurements.js';
import { sweep } from '../../web/js/engine/coil.js';

const [id, recordPath] = process.argv.slice(2);
if (!id || !recordPath) throw new Error('Usage: node compare.mjs A|B path/to/measurement.json');
const record = JSON.parse(readFileSync(recordPath, 'utf8'));
if (record.coupon !== id) throw new Error('The measurement record belongs to a different coupon.');
for (const key of ['sampleId', 'measuredOn', 'instrument', 'calibration', 'referencePlane', 'stackup', 'impedanceFile']) {
  if (typeof record[key] !== 'string' || !record[key].trim()) throw new Error(`Record the ${key} before comparing.`);
}
const pcb = readFileSync(new URL('inductor-coupons.kicad_pcb', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const baseline = JSON.parse(readFileSync(new URL('predictions.json', import.meta.url), 'utf8'));
const expectedHash = baseline.boardSHA256;
const generated = buildBoard();
if (record.boardSHA256 !== expectedHash || sha256(pcb) !== expectedHash || sha256(generated.pcb) !== expectedHash) {
  throw new Error('The measurement board revision does not match the frozen prediction.');
}
const file = resolve(dirname(recordPath), record.impedanceFile);
const raw = readFileSync(file);
const measured = parseMeasurement(raw.toString('utf8'), basename(file));
if (measured.ports === 2 || measured.rows.some(p => !Number.isFinite(p.zRe) || !Number.isFinite(p.zIm))) {
  throw new Error('Use a one-port Touchstone 1.x .s1p or a CSV with Frequency (Hz), R (ohm) and X (ohm).');
}
const { config, analysis, prediction } = generated.solves[id];
console.log('frequency_Hz,measured_R_ohm,predicted_R_ohm,measured_X_ohm,predicted_X_ohm');
for (const { f, zRe, zIm } of measured.rows) {
  const [model] = sweep(config, analysis, f, f, 2);
  console.log([f, zRe, model.zRe, zIm, model.zIm].join(','));
}
const idx = measured.rows.findIndex((row, i, rows) => i > 0 && rows[i - 1].zIm > 0 && row.zIm <= 0);
let measuredSRF = null;
if (idx > 0) {
  const [a, b] = measured.rows.slice(idx - 1, idx + 1);
  measuredSRF = a.f + (b.f - a.f) * a.zIm / (a.zIm - b.zIm);
}
const [resistance] = measurementValues(measured, 'zRe', [1e6]);
const [reactance] = measurementValues(measured, 'zIm', [1e6]);
console.error(JSON.stringify({
  coupon: id, sampleId: record.sampleId, role: prediction.role, boardSHA256: expectedHash,
  impedanceSHA256: sha256(raw), measuredResistanceAt1MHz_ohm: resistance,
  measuredInductanceAt1MHz_H: reactance / (2 * Math.PI * 1e6),
  predictedResistanceAt1MHz_ohm: prediction.resistanceAt1MHz_ohm,
  predictedInductanceAt1MHz_H: prediction.reactanceAt1MHz_ohm / (2 * Math.PI * 1e6),
  measuredSelfResonance_Hz: measuredSRF, predictedSelfResonance_Hz: prediction.selfResonance_Hz,
  baselineSelfResonance_Hz: baseline.coupons[id].selfResonance_Hz,
  resonanceErrorPercent: measuredSRF ? 100 * (prediction.selfResonance_Hz / measuredSRF - 1) : null,
}, null, 2));
