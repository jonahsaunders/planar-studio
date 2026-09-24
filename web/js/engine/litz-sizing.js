/* Fast, bounded preflight for the fixed four-layer Litz routing family.
 * These dimensional checks do not replace strand-aware copper validation.
 */
const TAU = 2 * Math.PI;
export const LITZ_LAYOUT_DEFAULTS = {
  litzSizeMode: 'nominal', litzTargetOuter: 170, litzMinBore: 40,
  litzTerminalPad: 1.6, litzTerminalDrill: 0.8, litzBusWidth: null,
  litzTerminalLead: 2, litzTerminalOffset: 2,
  litzOutline: false, litzEdgeClearance: 1, litzBoreCutout: false,
};

function number(value, label, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`PCB Litz: ${label} must be between ${min} and ${max}.`);
  return value;
}

/** Shared routing dimensions. Kept independent of the artwork generator so
 * sizing and fit suggestions do not allocate thousands of track primitives. */
export function litzRoutingMetrics(input) {
  const cfg = { ...LITZ_LAYOUT_DEFAULTS, ...input };
  for (const key of ['litzOutline', 'litzBoreCutout']) if (typeof cfg[key] !== 'boolean') throw new Error(`PCB Litz: ${key} must be enabled or disabled.`);
  const width = number(cfg.traceW, 'trace width (mm)', 0.1, 3);
  const gap = number(cfg.litzStrandGap, 'strand clearance (mm)', 0.1, 2);
  const turnGap = number(cfg.litzTurnSpacing, 'turn spacing (mm)', 0.2, 30);
  const diameter = number(cfg.litzViaDiameter, 'via diameter (mm)', 0.25, 2);
  const drill = number(cfg.litzViaDrill, 'via drill (mm)', 0.1, 1);
  const turns = number(cfg.turns, 'turn count', 1, 30);
  if (!Number.isInteger(turns)) throw new Error('PCB Litz: use an integer turn count to finish every transposition cycle.');
  if (![7.5, 15, 30].includes(cfg.litzStepDeg)) throw new Error('PCB Litz: step angle must be 7.5°, 15°, or 30°.');
  if (diameter - drill < 0.15 - 1e-9) throw new Error('PCB Litz: via diameter must exceed drill by at least 0.15 mm.');
  if (diameter > width + 2 * gap) throw new Error('PCB Litz: via diameter is too large for the strand spacing. Reduce via diameter or increase strand clearance.');
  const terminalPad = number(cfg.litzTerminalPad, 'terminal pad diameter (mm)', 0.5, 12);
  const terminalDrill = number(cfg.litzTerminalDrill, 'terminal drill (mm)', 0.2, 8);
  if (terminalPad - terminalDrill < 0.3 - 1e-9) throw new Error('PCB Litz: terminal pad diameter must exceed its drill by at least 0.3 mm.');
  const busWidth = cfg.litzBusWidth == null ? width : number(cfg.litzBusWidth, 'terminal bus width (mm)', 0.1, 10);
  const terminalLead = number(cfg.litzTerminalLead, 'terminal lead length (mm)', 0.5, 30);
  const terminalOffset = number(cfg.litzTerminalOffset, 'terminal pad offset (mm)', 0.5, 30);
  const minLead = (width + busWidth) / 2 + gap + 0.5;
  if (terminalLead < minLead - 1e-9) throw new Error(`PCB Litz: these trace and bus widths need at least ${minLead.toFixed(2)} mm terminal lead length.`);
  const minOffset = (width + terminalPad) / 2 + gap;
  if (terminalOffset < minOffset - 1e-9) throw new Error(`PCB Litz: this terminal pad needs at least ${minOffset.toFixed(2)} mm radial offset from the strands.`);
  const edgeClearance = number(cfg.litzEdgeClearance, 'copper-to-board-edge clearance (mm)', 0.1, 20);
  if (cfg.litzBoreCutout && !cfg.litzOutline) throw new Error('PCB Litz: enable the board outline before adding a bore cutout.');
  const lanePitch = (width + gap) * 1.05;
  const ribbonWidth = 3 * lanePitch + width;
  const pitch = ribbonWidth + turnGap;
  // Explicit XY-quantization allowance at the tight fanout junctions.
  const fan = Math.max(width + gap, diameter + gap) * 1.27 + 0.003;
  const innerFan = (width + gap) * 0.7;
  const stepAngle = cfg.litzStepDeg * Math.PI / 180;
  const minR = Math.max(3 * fan + 2, width * 3, 12 * fan / stepAngle,
    terminalOffset + terminalPad / 2 + gap);
  const minimumNominalOuterMM = 2 * (minR + turns * pitch + width / 2 + 3 * lanePitch);
  return { width, gap, turnGap, diameter, drill, turns, lanePitch, ribbonWidth,
    pitch, fan, innerFan, stepAngle, terminalPad, terminalDrill, busWidth,
    terminalLead, terminalOffset, edgeClearance, minimumNominalOuterMM };
}

/** The radial envelope extrema occur at fan vertices and terminal endpoints.
 * The generator additionally measures every actual segment, including its
 * nearest point to the origin, before accepting a finished-size constraint. */
export function estimateLitzEnvelope(input) {
  const cfg = { ...LITZ_LAYOUT_DEFAULTS, ...input };
  const m = litzRoutingMetrics(cfg);
  const dOuter = number(cfg.dOuter, 'nominal outer diameter (mm)', 20, 1000);
  const ro = dOuter / 2 - m.width / 2;
  const r0 = ro - 3 * m.lanePitch;
  const rMin = r0 - m.turns * m.pitch;
  const shift = m.pitch * cfg.litzStepDeg / 360 / 3;
  const windingRadius = ro - shift + 3 * m.fan + Math.max(m.width, m.diameter) / 2;
  const windingBoreRadius = rMin + shift - 3 * m.fan - Math.max(m.width, m.diameter) / 2;
  const leadRadius = Math.hypot(ro, m.terminalLead) + Math.max(m.width, m.busWidth) / 2;
  const outerPadRadius = Math.hypot(ro + m.terminalOffset, m.terminalLead) + Math.max(m.terminalPad, m.busWidth) / 2;
  const innerPadRadius = Math.hypot(rMin - m.terminalOffset, m.terminalLead) - Math.max(m.terminalPad, m.busWidth) / 2;
  const fullRadius = Math.max(windingRadius, leadRadius, outerPadRadius);
  const fullBoreRadius = Math.min(windingBoreRadius, rMin - m.width / 2, innerPadRadius);
  return { ...m, r0, rMin, outerDiameterMM: 2 * windingRadius,
    innerDiameterMM: 2 * windingBoreRadius, fullCopperDiameterMM: 2 * fullRadius,
    fullCopperBoreMM: 2 * fullBoreRadius, nominalOuterDiameterMM: dOuter,
    viaCount: Math.round(m.turns * 360 / cfg.litzStepDeg) * 8, estimated: true };
}

/** Resolve the nominal spiral diameter for a requested complete copper OD.
 * It includes terminal copper and fanouts. Board-edge clearance is additional.
 * No input object is changed, and neither turns nor step angle is changed. */
export function resolveLitzSize(input) {
  const cfg = { ...LITZ_LAYOUT_DEFAULTS, ...input };
  if (!['nominal', 'finished'].includes(cfg.litzSizeMode)) throw new Error('PCB Litz: size mode must be nominal or finished.');
  if (cfg.litzSizeMode === 'nominal') return cfg;
  const target = number(cfg.litzTargetOuter, 'finished copper diameter (mm)', 20, 1100);
  const minBore = number(cfg.litzMinBore, 'minimum clear copper bore (mm)', 0, 1000);
  if (minBore >= target) throw new Error('PCB Litz: the minimum copper bore must be smaller than the finished copper diameter.');
  litzRoutingMetrics(cfg);
  const envelope = dOuter => estimateLitzEnvelope({ ...cfg, dOuter });
  // Reserve two micrometres at the target boundary for serialized coordinates.
  const guardedTarget = target - 0.002;
  let lo = 20, hi = 1000;
  if (envelope(lo).fullCopperDiameterMM > guardedTarget || envelope(hi).fullCopperDiameterMM < guardedTarget) throw new Error('PCB Litz: the requested finished diameter is outside the supported nominal diameter range.');
  for (let i = 0; i < 44; i++) {
    const mid = (lo + hi) / 2;
    if (envelope(mid).fullCopperDiameterMM <= guardedTarget) lo = mid; else hi = mid;
  }
  const resolved = { ...cfg, dOuter: lo };
  const e = envelope(lo);
  if (e.fullCopperBoreMM < minBore + 0.002) throw new Error(`PCB Litz: ${target.toFixed(2)} mm finished diameter leaves about ${Math.max(0, e.fullCopperBoreMM).toFixed(2)} mm copper bore; ${minBore.toFixed(2)} mm was requested. Reduce turns or increase the finished diameter.`);
  return resolved;
}

/** Cheap preflight only; generated copper still requires validateLitz(). */
export function checkLitzFit(input) {
  try {
    const config = resolveLitzSize(input);
    if (config.layers !== 4 || config.shape !== 'circle') throw new Error('PCB Litz currently supports a circular winding on exactly four copper layers.');
    if (config.obstacleEnabled || config.arrayEnabled || config.motorGeometry) throw new Error('PCB Litz cannot be combined with obstacle, array, or motor routing.');
    const dimensions = estimateLitzEnvelope(config);
    if (dimensions.turnGap < 4 * dimensions.fan + dimensions.gap + dimensions.width * 0.25) throw new Error('PCB Litz: turn spacing is too small for the layer-transition fanouts. Increase turn spacing or reduce trace/via size.');
    if (config.dOuter < dimensions.minimumNominalOuterMM - 1e-9) {
      const required = estimateLitzEnvelope({ ...config, dOuter: Math.min(1000, dimensions.minimumNominalOuterMM) });
      throw new Error(`PCB Litz: these turns and steps need at least ${dimensions.minimumNominalOuterMM.toFixed(2)} mm nominal diameter (about ${required.fullCopperDiameterMM.toFixed(2)} mm complete copper). Reduce turns, use a larger step, or increase diameter.`);
    }
    if (16 * dimensions.turns * Math.PI * config.dOuter / 0.45 > 400000) throw new Error('PCB Litz: this design exceeds the experimental geometry size limit. Reduce diameter or turns.');
    if (config.litzBoreCutout && dimensions.fullCopperBoreMM / 2 <= dimensions.edgeClearance + 0.5) throw new Error('PCB Litz: the copper bore is too small for a cutout with the requested edge clearance.');
    return { ok: true, errors: [], config, dimensions };
  } catch (error) {
    return { ok: false, errors: [error.message], config: null, dimensions: null };
  }
}

/** At most 90 analytic checks, independent of the artwork sampling density.
 * Candidates are suggestions; normal build + strand validation runs on apply. */
export function suggestLitzFit(input, { limit = 6 } = {}) {
  const cfg = { ...LITZ_LAYOUT_DEFAULTS, ...input };
  const initial = checkLitzFit(cfg), candidates = [];
  const currentTurns = Number.isFinite(cfg.turns) ? Math.max(1, Math.min(30, Math.round(cfg.turns))) : 5;
  const turns = Array.from({ length: 30 }, (_, i) => i + 1).sort((a, b) => Math.abs(a - currentTurns) - Math.abs(b - currentTurns) || a - b);
  const steps = [...new Set([cfg.litzStepDeg, 30, 15, 7.5].filter(s => [7.5, 15, 30].includes(s)))];
  let checked = 0;
  for (const n of turns) for (const step of steps) {
    checked++;
    const fit = checkLitzFit({ ...cfg, turns: n, litzStepDeg: step });
    if (!fit.ok) continue;
    const changes = [];
    if (n !== cfg.turns) changes.push(`${n} turns`);
    if (step !== cfg.litzStepDeg) changes.push(`${step}° steps`);
    candidates.push({ turns: n, litzStepDeg: step, dOuter: fit.config.dOuter,
      fullCopperDiameterMM: fit.dimensions.fullCopperDiameterMM,
      fullCopperBoreMM: fit.dimensions.fullCopperBoreMM, viaCount: fit.dimensions.viaCount,
      changes, config: fit.config, estimated: true });
  }
  candidates.sort((a, b) => Math.abs(a.turns - currentTurns) - Math.abs(b.turns - currentTurns)
    || a.changes.length - b.changes.length || a.viaCount - b.viaCount);
  return { candidates: candidates.slice(0, Math.max(1, Math.min(12, limit))),
    reason: initial.ok ? null : initial.errors[0], checked, requiresCopperValidation: true };
}
