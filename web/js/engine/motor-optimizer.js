import { ALPHA_CU, analyse, motorAnalysis } from './coil.js';
import { enforceFabrication } from './fabrication.js';
import { windingPhasors } from './winding-design.js';
import { motorEnvelope } from './motor-envelope.js';
import { routedMotorResistance } from './motor-resistance.js';
import { compute } from '../ws/motor.js';

const TAU = Math.PI * 2;
const unique = values => [...new Set(values)];
const round = value => Math.round(value * 1000) / 1000;

function rotorCandidates(config, limit) {
  const choices = [];
  for (let polePairs = 1; polePairs <= limit; polePairs++) {
    for (const windingMode of ['repeat', 'auto']) {
      const winding = windingPhasors({ ...config, polePairs, windingMode });
      if (!winding.deltaCompatible || winding.parallelMismatch || winding.kd < 0.6) continue;
      const kw = winding.kd * Math.abs(Math.sin(polePairs * config.spanDeg * TAU / 720));
      if (kw >= 0.15) {
        choices.push({ polePairs, windingMode, kw });
        break;
      }
    }
  }
  choices.sort((a, b) => b.kw - a.kw || a.polePairs - b.polePairs);
  const slow = choices.filter(candidate => candidate.kw > 0.5).sort((a, b) => a.polePairs - b.polePairs)[0];
  return unique([...choices.slice(0, 2), choices.find(candidate => candidate.polePairs === config.polePairs) || slow].filter(Boolean));
}

export function optimizeMotor(base, settings, env = {}, progress = () => {}) {
  if (!['rotary', 'dual-rotor'].includes(base.motorFamily ?? 'rotary') || base.phases !== 3) {
    throw new Error('Select a three-phase rotary or dual-rotor stator before running the optimizer.');
  }
  if (base.connection !== 'series' || ![2, 4, 6].includes(base.layers)) {
    throw new Error('Choose two, four, or six series copper layers before running the optimizer.');
  }
  const { minCoils, maxCoils, diameter, minWidth, clearance, maxTurns, maxPolePairs = 30 } = settings;
  if (![minCoils, maxCoils, maxTurns, maxPolePairs].every(Number.isInteger) || minCoils < 3 || maxCoils > 48 || minCoils > maxCoils ||
      maxPolePairs < 1 || maxPolePairs > 30 ||
      maxTurns < 1 || maxTurns > 60 || ![diameter, minWidth, clearance].every(v => Number.isFinite(v) && v > 0) ||
      diameter <= base.dInner || !(settings.targetTorque > 0)) {
    throw new Error('Enter a positive torque target and search bounds that leave space outside the stator bore.');
  }
  // Validate the shared electrical inputs once, even if no layout fits.
  motorEnvelope({ Kt: 1, KeMech: 1, Rphase: 1, Lphase: 1, winding: { balanced: true } }, base, settings, false);
  const validCounts = Array.from({ length: 16 }, (_, i) => (i + 1) * 3).filter(n => n >= minCoils && n <= maxCoils);
  if (!validCounts.length) throw new Error('Include a multiple of three in the coil-count limits.');
  const coilCounts = validCounts.length <= 6 ? validCounts : unique([
    ...Array.from({ length: 5 }, (_, i) => validCounts[Math.round(i * (validCounts.length - 1) / 4)]),
    validCounts.includes(base.coilCount) ? base.coilCount : validCounts[Math.floor(validCounts.length / 2)],
  ]);
  const common = { ...base, traceW: minWidth, traceS: clearance };
  enforceFabrication(common, base.fabricationProfile);
  const availableLayers = env.board?.copperLayers?.length || env.board?.layerCount;
  if (common.layers !== base.layers || (availableLayers > 1 && base.layers > availableLayers)) {
    throw new Error('The board or fabrication profile has fewer copper layers than the requested winding.');
  }
  const trials = [];
  for (const coilCount of coilCounts) for (const coilSeries of [true, false]) {
    const variant = { ...common, coilCount, coilSeries,
      spanDeg: Math.floor(10 * (360 / coilCount - Math.max(2, 2 * Math.asin(Math.min(1, (common.traceS + common.traceW) / common.dInner)) * 180 / Math.PI))) / 10,
    };
    if (variant.spanDeg < 3) continue;
    for (const { polePairs, windingMode } of rotorCandidates(variant, maxPolePairs)) {
      const topology = variant.motorTopology ?? 'wye';
      const scheduled = windingMode !== 'repeat' || topology !== 'wye';
      const lanes = (topology === 'independent' ? 6 : 3) + (scheduled && coilSeries ? coilCount - 3 : 0);
      const spacing = Math.max(variant.padSize, variant.viaPad, variant.traceW) + variant.traceS + 0.3;
      const collar = 2 * (2.5 + variant.padSize * 1.9 + variant.traceS + lanes * spacing);
      const largest = Math.min(300, diameter - collar);
      if (largest <= variant.dInner + 2) continue;
      const diameters = unique([largest, largest * 0.85, largest * 0.7, base.dOuter].map(round)).filter(d => d >= 10 && d <= largest + 0.01 && d > variant.dInner + 2);
      const widths = unique([variant.traceW, Math.max(variant.traceW, base.traceW), Math.min(3, variant.traceW * 2)].map(round));
      for (const dOuter of diameters) {
        const pitchRadius = (dOuter + variant.dInner) / 4;
        if (variant.motorFamily === 'dual-rotor' && (variant.magnetDiameter > (dOuter - variant.dInner) / 2 ||
            variant.magnetDiameter > 2 * pitchRadius * Math.sin(Math.PI / (2 * polePairs)))) continue;
        for (const traceW of widths) trials.push({ ...variant, dOuter, traceW, polePairs, windingMode,
          busEnabled: true, windingSchedule: null, vdc: settings.vdc, rpm: settings.speed });
      }
    }
  }

  const ranked = [];
  let tried = 0;
  for (let i = 0; i < trials.length; i++) {
    if (i % 8 === 0) progress({ done: i, total: trials.length, message: 'Testing winding dimensions' });
    const config = trials[i];
    let maximum;
    try { maximum = compute({ ...config, turns: maxTurns }, env, { quick: true }).coil.spiral.maxTurns; }
    catch { continue; }
    if (maximum < 1) continue;
    const cap = Math.min(maxTurns, Math.floor(maximum));
    for (const turns of unique([1, Math.max(1, Math.round(cap / 2)), cap, Math.min(cap, Math.max(1, Math.floor(base.turns)))])) {
      tried++;
      try {
        const candidate = { ...config, turns };
        const layout = compute(candidate, env, { quick: true });
        const { art, coil, modelCfg } = layout;
        const finishedDiameter = 2 * Math.hypot(...art.outline[0].pts[0]);
        if (!art.meta.busRouted || art.meta.routingError || finishedDiameter > diameter + 1e-9 || coil.spiral.turnsUsed !== turns) continue;
        const analysis = analyse(modelCfg, coil, { segmentCap: 160 });
        const topology = art.meta.motorCircuit.topology;
        const motor = motorAnalysis(modelCfg, coil, analysis, null, topology);
        const point = motorEnvelope(motor, modelCfg, settings, false).point;
        ranked.push({ candidate, finishedDiameter, point });
      } catch { /* Skip invalid geometry and windings with zero usable flux. */ }
    }
  }
  const compare = (a, b) => Number(b.point.feasible) - Number(a.point.feasible)
    || (!a.point.feasible ? b.point.torque - a.point.torque : 0)
    || a.point.copperLoss - b.point.copperLoss || a.finishedDiameter - b.finishedDiameter;
  ranked.sort(compare);
  const shortlist = unique([
    ...ranked.slice(0, 30),
    ...ranked.slice().sort((a, b) => a.finishedDiameter - b.finishedDiameter).slice(0, 10),
  ]);
  const verified = [];
  for (let i = 0; i < shortlist.length; i++) {
    progress({ done: i, total: shortlist.length, message: 'Rechecking routed copper and operating limits' });
    const { candidate, finishedDiameter } = shortlist[i];
    try {
      const layout = compute(candidate, env, { quick: true });
      const { modelCfg, coil, art } = layout;
      const analysis = analyse(modelCfg, coil, { segmentCap: 1500 });
      const circuit = art.meta.motorCircuit;
      const resistance = routedMotorResistance(modelCfg, analysis, circuit);
      const motor = motorAnalysis(modelCfg, coil, analysis, resistance, circuit.topology);
      const point = motorEnvelope(motor, modelCfg, settings, false).point;
      const patch = Object.fromEntries(['coilCount', 'coilSeries', 'dOuter', 'spanDeg', 'traceW', 'traceS', 'turns', 'polePairs',
        'windingMode', 'windingSchedule', 'busEnabled', 'vdc', 'rpm', 'viaDrill', 'viaPad', 'padDrill', 'padSize'].map(key => [key, candidate[key]]));
      patch.current = Math.min(point.requestedCurrent, point.peakCurrent);
      const ambientFactor = (1 + ALPHA_CU * (settings.maxTemperature - 20)) / (1 + ALPHA_CU * (modelCfg.tempC - 20));
      verified.push({ patch, point, finishedDiameter, windingFactor: motor.kw,
        routingLoss: resistance.interconnect * ambientFactor * point.requestedCurrent ** 2 });
    } catch { /* Retain only candidates whose detailed computation succeeds. */ }
  }
  verified.sort(compare);
  const feasible = verified.filter(candidate => candidate.point.feasible);
  const smallest = feasible.slice().sort((a, b) => a.finishedDiameter - b.finishedDiameter)[0];
  const candidates = feasible.length ? unique([...feasible.slice(0, 7), smallest]) : verified.slice(0, 8);
  return { tried, routed: ranked.length, verified: verified.length, candidates };
}
