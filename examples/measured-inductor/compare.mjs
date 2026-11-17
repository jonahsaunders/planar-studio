// Compare the imported design using the same impedance model as the workspace.
import { readFileSync } from 'node:fs';
import { defaults, compute } from '../../web/js/ws/inductor.js';
import { sweep } from '../../web/js/engine/coil.js';
import { parseMeasurement } from '../../web/js/engine/measurements.js';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const design = JSON.parse(read('design.json'));
const config = { ...defaults(), ...design.config };
const { analysis } = compute(config, { name: design.name });
const samples = ['impedance.csv', 'reactance.csv'].flatMap(name => parseMeasurement(read(name), name).rows);

console.log('frequency_Hz,measured_R_ohm,predicted_R_ohm,measured_X_ohm,predicted_X_ohm');
for (const point of samples) {
  const [prediction] = sweep(config, analysis, point.f, point.f, 2);
  if (![prediction.zRe, prediction.zIm].every(Number.isFinite)) {
    throw new Error(`Invalid predicted impedance at ${point.f} Hz`);
  }
  console.log([point.f, point.zRe ?? '', prediction.zRe.toFixed(4),
    point.zIm, prediction.zIm.toFixed(4)].join(','));
}
console.error(`Inductance ${(analysis.L * 1e6).toFixed(3)} uH; self-resonance ${(analysis.srf / 1e6).toFixed(2)} MHz`);
