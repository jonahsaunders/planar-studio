/* Bounded PCB Litz comparisons and geometry/DC design searches. These helpers
   return candidates; applying a candidate must regenerate and revalidate it. */
import { buildLitz, litzCopperEnvelope } from './litz.js';
import { validateLitz } from './litz-validation.js';
import { validateManufacturing } from './litz-manufacturing.js';
import { analyseLitz, sweepLitz } from './litz-model.js';
import { track } from './artwork.js';
import { RHO_CU20, ALPHA_CU, OZ_MM, buildCoil, analyse, sweep, viaResistance } from './coil.js';
import { buildArtwork } from './coilgeom.js';

const TAU = Math.PI * 2;
const length = pts => pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
const unique = xs => [...new Set(xs)];
const positive = (v, label) => { if (!Number.isFinite(v) || v <= 0) throw new Error(`${label} must be finite and positive.`); return v; };
function frequencyGrid(cfg, opt) {
  if (opt.frequencies) {
    if (!Array.isArray(opt.frequencies) || !opt.frequencies.length || opt.frequencies.length > 61 || opt.frequencies.some((f, i, a) => !Number.isFinite(f) || f <= 0 || i && f <= a[i - 1])) throw new Error('Comparison requires 1–61 strictly increasing positive frequencies.');
    return opt.frequencies.slice();
  }
  const low = positive(opt.fMin || cfg.freq / 10, 'Minimum frequency'), high = positive(opt.fMax || cfg.freq * 2, 'Maximum frequency');
  if (high < low) throw new Error('Comparison frequency range is reversed.');
  const count = Math.max(2, Math.min(61, Math.round(opt.count || 25)));
  return Array.from({ length: count }, (_, i) => low * Math.pow(high / low, i / (count - 1)));
}

function dcMetrics(geometry, cfg) {
  const t = geometry.config.copperThicknessMM || cfg.copperOz * OZ_MM;
  const rho = RHO_CU20 * (1 + ALPHA_CU * ((cfg.tempC ?? 20) - 20));
  if (!(rho > 0) || !Number.isFinite(rho)) throw new Error('Invalid copper temperature.');
  const plating = cfg.litzViaPlating / 1000;
  let volume = 0;
  const branches = geometry.strands.map(s => {
    const traceLength = s.sections.reduce((sum, p) => sum + length(p.pts), 0);
    let viaR = 0;
    volume += traceLength * cfg.traceW * t;
    for (const v of s.vias) {
      const span = Math.abs(v.zTo - v.zFrom), area = Math.PI * plating * (v.drill + plating);
      viaR += rho * span * 1000 / area; volume += span * area;
    }
    const traceR = rho * traceLength * 1000 / (cfg.traceW * t);
    return { Rdc: traceR + viaR, viaR };
  });
  const conductance = branches.reduce((sum, b) => sum + 1 / b.Rdc, 0), Rdc = 1 / conductance;
  const viaR = branches.reduce((sum, b) => sum + b.viaR * (Rdc / b.Rdc) ** 2, 0);
  const envelope = litzCopperEnvelope(geometry.art), box = envelope.bounds;
  return { Rdc, viaR, viaCount: geometry.art.vias.length, copperVolumeMM3: volume,
    copperVolumeScope: 'Strand traces and plated barrels; terminal buses and pads excluded',
    widthMM: box.w, heightMM: box.h, outerDiameterMM: envelope.diameterMM, innerDiameterMM: envelope.boreMM,
    boardDiameterMM: geometry.stats?.boardOuterDiameterMM ?? null, edgeClearanceMM: cfg.litzEdgeClearance ?? null,
    L: null, Q: null, targetError: null };
}

export function buildLitzReference(geometry) {
  const out = structuredClone(geometry), turns = geometry.config.turns;
  out.config = { ...out.config, windingMode: 'parallel-reference' };
  delete out.config.litzStepDeg;
  delete out.transpositions;
  out.art.meta = { ...out.art.meta, kind: 'pcb-litz-reference', name: 'Untransposed parallel-strand reference', experimental: true };
  out.art.tracks = out.art.tracks.filter(t => t.role === 'terminal-bus');
  out.art.vias = [];
  out.art.notes = [{ level: 'info', text: 'Untransposed comparison reference: sixteen parallel strands on fixed layers and radial lanes. Copper volume and occupied envelope differ from the braided winding.' }];
  for (const s of out.strands) {
    const first = s.positions[0], last = s.positions.at(-1), layer = first.layer;
    const r0 = Math.hypot(...first.point), r1 = Math.hypot(...last.point);
    const start = s.sections[0].pts[0], end = s.sections.at(-1).pts.at(-1);
    const angle = TAU * turns, radialSlope = (r0 - r1) / angle;
    const integral = r => (r * Math.hypot(r, radialSlope) + radialSlope ** 2 * Math.asinh(r / radialSlope)) / 2;
    const fullLength = (integral(r0) - integral(r1)) / radialSlope;
    const count = Math.max(128, Math.ceil(fullLength / 0.45));
    const spiral = Array.from({ length: count + 1 }, (_, i) => {
      const target = fullLength * i / count;
      let a = angle * i / count;
      // Uniform arc-length chords avoid undersampling the outside or creating
      // tiny inner chords; Newton solves the analytic Archimedean arc integral.
      for (let n = 0; n < 6; n++) {
        const r = r0 - radialSlope * a, elapsed = (integral(r0) - integral(r)) / radialSlope;
        a = Math.max(0, Math.min(angle, a - (elapsed - target) / Math.hypot(r, radialSlope)));
      }
      const r = r0 - radialSlope * a;
      return [r * Math.cos(a), r * Math.sin(a)];
    });
    spiral[0] = first.point.slice(); spiral[count] = last.point.slice();
    s.sections = [[start, first.point], spiral, [last.point, end]].map((pts, sequence) => ({ layer, pts, strandId: s.id, sequence, sectionIndex: sequence }));
    s.vias = []; delete s.positions;
    s.traceLengthMM = s.sections.reduce((sum, p) => sum + length(p.pts), 0); s.viaLengthMM = 0; s.lengthMM = s.traceLengthMM;
    const z = out.layers.find(l => l.name === layer).z;
    s.path3 = [];
    for (const section of s.sections) for (const p of section.pts) {
      const prev = s.path3.at(-1);
      if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 1e-6) s.path3.push([...p, z]);
    }
    s.sections.forEach((section, sequence) => out.art.tracks.push(track(layer, out.config.traceW, section.pts,
      { net: 'LITZ', role: 'litz-strand', strandId: s.id, sequence, sectionIndex: sequence })));
  }
  const full = litzCopperEnvelope(out.art), winding = litzCopperEnvelope(out.art, { windingOnly: true });
  const lengths = out.strands.map(s => s.lengthMM);
  out.stats = { ...out.stats, viaCount: 0, outerViaCount: 0, innerViaCount: 0, completeCycles: 0, steps: 0, stepDeg: null,
    traceLengthMM: out.strands.reduce((n, s) => n + s.traceLengthMM, 0),
    minStrandLengthMM: Math.min(...lengths), maxStrandLengthMM: Math.max(...lengths),
    outerDiameterMM: winding.diameterMM, innerDiameterMM: winding.boreMM,
    fullCopperDiameterMM: full.diameterMM, fullCopperBoreMM: full.boreMM,
    fullCopperBounds: full.bounds, windingBounds: winding.bounds };
  return out;
}

function ordinaryBaseline(cfg, geometry, braidMetrics, opt) {
  const width = 4 * cfg.traceW, pitch = geometry.config.pitchMM;
  const config = { ...cfg, windingMode: 'spiral', shape: 'circle', connection: 'parallel', layers: 4,
    traceW: width, traceS: pitch - width, dOuter: geometry.config.dOuter - width,
    layerNames: geometry.layers.map(l => l.name), ppt: 256, tempC: cfg.tempC ?? 20,
    epsR: cfg.epsR ?? 4.4, cExtra: cfg.cExtra ?? 0, current: cfg.current ?? 1,
    padSize: cfg.litzTerminalPad ?? 1.6, padDrill: cfg.litzTerminalDrill ?? .8,
    viaDrill: cfg.litzViaDrill, viaPad: cfg.litzViaDiameter,
    obstacleEnabled: false, arrayEnabled: false, motorGeometry: false };
  const coil = buildCoil(config);
  if (Math.abs(coil.spiral.turnsUsed - cfg.turns) > 1e-9) throw new Error('The ordinary reference cannot fit every requested turn.');
  // buildCoil normally spaces planes uniformly. Use the actual comparison
  // stack for its routed geometry and numerical partial-inductance solver.
  coil.layers.forEach((layer, i) => { layer.z = geometry.layers[i].z; });
  const art = buildArtwork(config, coil, { silk: false });
  art.meta = { ...geometry.art.meta, name: 'Conventional four-layer parallel reference',
    kind: 'pcb-litz-conventional-reference', exactPaths: true };
  delete art.meta.terminalGroups;
  art.outline = [];
  const envelope = litzCopperEnvelope(art), t = geometry.config.copperThicknessMM;
  const rho = RHO_CU20 * (1 + ALPHA_CU * (config.tempC - 20));
  const metrics = { Rdc: rho * coil.lenPerLayer * 1000 / (width * t * 4) + viaResistance(config) * coil.vias.length,
    viaR: viaResistance(config) * coil.vias.length, viaCount: coil.vias.length,
    copperVolumeMM3: coil.lenTotal * width * t,
    copperVolumeScope: 'Conventional trace copper including routed leads; stitch barrel and terminal pad copper excluded',
    widthMM: envelope.bounds.w, heightMM: envelope.bounds.h, outerDiameterMM: envelope.diameterMM,
    innerDiameterMM: envelope.boreMM, L: null, Q: null, modelValidated: false };
  const rows = (key, label, a, b, note = '') => ({ key, label, braid: a, reference: b,
    matched: typeof a === 'number' ? Math.abs(a - b) <= Math.max(1e-9, Math.abs(a) * 1e-9) : JSON.stringify(a) === JSON.stringify(b), note });
  const constraints = [rows('turns', 'Turns per branch', cfg.turns, config.turns),
    rows('branches', 'Parallel conductor branches', 16, 4, 'Ordinary reference uses one wide spiral on each of four parallel layers.'),
    rows('strandWidth', 'Individual trace width (mm)', cfg.traceW, width),
    rows('crossSection', 'Aggregate trace cross-section (mm²)', 16 * cfg.traceW * t, 4 * width * t),
    rows('copper', 'Copper thickness per layer (mm)', t, t),
    rows('stack', 'Physical copper layer depths (mm)', geometry.layers.map(l => l.z), coil.layers.map(l => l.z)),
    rows('pitch', 'Nominal spiral pitch (mm)', pitch, config.traceW + config.traceS),
    rows('actualDiameter', 'Full copper outer diameter (mm)', braidMetrics.outerDiameterMM, metrics.outerDiameterMM),
    rows('actualBore', 'Full copper clear bore (mm)', braidMetrics.innerDiameterMM, metrics.innerDiameterMM),
    rows('copperVolume', 'Conductor volume (mm³; see scope)', braidMetrics.copperVolumeMM3, metrics.copperVolumeMM3,
      'Volumes are not matched. Braid includes strand traces and plated transposition barrels; ordinary value includes traces/leads and excludes terminal/stitch copper.'),
    rows('terminals', 'Terminal pad positions', geometry.terminalGroups.map(g => g.padPoint), coil.terminals,
      'The existing conventional generator uses its own terminal routing.'),
    rows('vias', 'Winding via count', braidMetrics.viaCount, metrics.viaCount, 'Ordinary reference uses through-layer stitching, not adjacent-layer transposition.')];
  const warnings = ['Ordinary reference is a four-layer parallel conventional spiral with the same aggregate trace cross-section; occupied area, copper volume and terminal routes are not matched.',
    'Its physical geometry and numerical inductance use the specified copper plane depths. The conventional capacitance/loss approximation still assumes uniform effective layer separation.',
    'The conventional Dowell/capacitance model differs from the Litz coupled-strand model. A Q difference cannot be attributed solely to braiding or treated as measured improvement.',
    'This comparison reference has not passed native KiCad DRC or manufacturing screening; regenerate an ordinary design and review its terminal routing before fabrication.'];
  let curve = [];
  if (opt.analyse !== false) {
    const analysis = analyse(config, coil, { segmentCap: 768 });
    Object.assign(metrics, { Rdc: analysis.Rdc, Rac: analysis.Rac, L: analysis.L, Q: analysis.Q });
    curve = frequencyGrid(cfg, opt).map(f => { const p = sweep(config, analysis, f, f, 2)[0]; return { ...p, L: p.Ls }; });
  }
  return { kind: 'conventional-four-layer-parallel', metrics, curve, config, constraints, warnings,
    geometry: { art, coil, config, layers: coil.layers }, validated: false };
}

/** A controlled transposition comparison. Same 16 strand widths, copper stack,
 * nominal spiral pitch, turn count and terminal locations; routing copper
 * volume, via count and actual envelopes are deliberately measured differences. */
export function compareLitzBaseline(cfg, geometry, opt = {}) {
  if (!geometry) geometry = buildLitz(cfg);
  const validation = validateLitz(geometry, cfg);
  if (!validation.ok) throw new Error(`PCB Litz comparison requires valid copper: ${validation.errors[0].message}`);
  const reference = buildLitzReference(geometry);
  // Geometry may have been retained while operating/model settings changed.
  // Both windings must use the currently selected model and drive settings.
  reference.config = { ...reference.config, ...cfg, windingMode: 'parallel-reference' };
  delete reference.config.litzStepDeg;
  const referenceCheck = validateLitz(reference, reference.config);
  if (!referenceCheck.ok) throw new Error(`Parallel reference cannot be routed safely: ${referenceCheck.errors[0].message}`);
  const a = dcMetrics(geometry, cfg), b = dcMetrics(reference, reference.config);
  const same = (key, label, braid, ref, note = '') => ({ key, label, braid, reference: ref,
    matched: typeof braid === 'number' ? Math.abs(braid - ref) <= Math.max(1e-9, Math.abs(braid) * 1e-9) : JSON.stringify(braid) === JSON.stringify(ref), note });
  const constraints = [same('strands', 'Parallel strands', 16, 16), same('turns', 'Turns per strand', cfg.turns, reference.config.turns),
    same('width', 'Strand width (mm)', cfg.traceW, reference.config.traceW),
    same('stack', 'Copper layer depths (mm)', geometry.layers.map(l => l.z), reference.layers.map(l => l.z)),
    same('copper', 'Copper thickness per layer (mm)', geometry.config.copperThicknessMM, reference.config.copperThicknessMM),
    same('pitch', 'Nominal spiral pitch (mm)', geometry.config.pitchMM, reference.config.pitchMM),
    same('terminals', 'Terminal pad positions', geometry.terminalGroups.map(g => g.padPoint), reference.terminalGroups.map(g => g.padPoint)),
    same('nominalDiameter', 'Nominal spiral outer diameter (mm)', geometry.config.dOuter, reference.config.dOuter),
    same('actualDiameter', 'Full copper outer diameter (mm)', a.outerDiameterMM, b.outerDiameterMM, 'Includes fanouts and terminal pads; equal nominal diameter does not imply equal occupied area.'),
    same('actualBore', 'Full copper clear bore (mm)', a.innerDiameterMM, b.innerDiameterMM),
    same('copperVolume', 'Trace and barrel copper volume (mm³)', a.copperVolumeMM3, b.copperVolumeMM3, a.copperVolumeScope),
    same('vias', 'Transposition via count', a.viaCount, b.viaCount, 'Reference strands stay on their initial layer and radial lane.')];
  const warnings = ['Comparison is an unvalidated quasi-static estimate, not a measured Q improvement or WPT-efficiency prediction.',
    'The reference is a 16-strand untransposed winding with the same nominal spiral and stack. It is not an equal-volume optimization or a conventional single-trace spiral.',
    'Shared terminal tracks and plated terminal barrels are explicit network branches with bus transport skin loss. Bus proximity and terminal-pad spreading are omitted.',
    'Via-pad spreading uses a full-annulus DC sheet approximation; finite trace-entry angles and AC crowding require external validation.',
    cfg.litzCapacitanceMode === 'distributed'
      ? 'Distributed pair capacitance and dielectric conductance are enabled in a bounded circuit-cell model. Capacitance extraction and estimated resonances remain unvalidated.'
      : 'Intrinsic distributed capacitance and dielectric loss are disabled. Any supplied external capacitance is ideal.',
    cfg.litzAcModel === 'rectangular'
      ? 'The local rectangular-filament model resolves cross-section redistribution, edge crowding and local field reaction at finite mesh resolution. Global field reaction and the routed three-dimensional electromagnetic problem remain unresolved.'
      : 'The foil/slab AC-loss model omits rectangular edge crowding and field reaction; MHz resistance and Q require external validation.'];
  let curveA = [], curveB = [];
  let resolution = null;
  if (opt.analyse !== false) {
    const cap = Math.max(48, Math.min(128, Math.round(Number(opt.segmentCap) || 48)));
    const lossSamples = Math.max(16, Math.min(512, Math.round(Number(opt.lossSamples) || Number(cfg.litzLossSamples) || 64)));
    const acModel = cfg.litzAcModel || 'slab', capacitanceMode = cfg.litzCapacitanceMode || 'off';
    const cells = capacitanceMode === 'distributed' ? Math.max(2, Math.min(4, Math.round(Number(cfg.litzCapacitanceCells) || 2))) : 1;
    const options = { segmentCap: cap, lossSamples, estimateResonance: false };
    // A serialized result cannot establish geometry/material/frequency identity.
    // Re-evaluate both sides with the same options; analyseLitz itself reuses its
    // geometry cache when that cache is available in this execution context.
    const analysisA = analyseLitz(cfg, geometry, options);
    const analysisB = analyseLitz(reference.config, reference, options);
    if (opt.analysis) warnings.push('The supplied braid result and sweep were recalculated with the reference at matching model and numerical settings; serialized results do not establish a complete geometry/material match.');
    resolution = { segmentCap: cap, lossSamples, acModel, capacitanceMode, cellsPerStrand: cells,
      cachedBraidReused: false, note: 'Matched subdivision budgets; every physical section endpoint and via is preserved, so actual filament counts can differ.' };
    Object.assign(a, { Rdc: analysisA.Rdc, L: analysisA.L, Rac: analysisA.Rac, Q: analysisA.Q, modelValidated: false, segmentCapUsed: cap, lossSamplesUsed: lossSamples });
    Object.assign(b, { Rdc: analysisB.Rdc, L: analysisB.L, Rac: analysisB.Rac, Q: analysisB.Q, modelValidated: false, segmentCapUsed: cap, lossSamplesUsed: lossSamples });
    const frequencies = frequencyGrid(cfg, opt);
    curveA = frequencies.map(f => sweepLitz(cfg, analysisA, f, f, 2)[0]);
    curveB = frequencies.map(f => sweepLitz(reference.config, analysisB, f, f, 2)[0]);
  }
  const ordinary = ordinaryBaseline(cfg, geometry, a, opt);
  return { scope: 'Same 16 strands and nominal spiral; measured footprint and copper-budget differences are explicit.', warnings, constraints, resolution,
    braid: { kind: 'transposed-16-strand', metrics: a, curve: curveA },
    reference: { kind: 'untransposed-16-strand', metrics: b, curve: curveB, geometry: reference }, ordinary, validated: false };
}

export async function searchLitzDesigns(cfg, opt = {}, progress = () => {}) {
  if (opt.targetQ != null || opt.minQ != null || opt.optimizeQ || /q/i.test(opt.rankBy || '')) throw new Error('Q optimization is disabled until the PCB Litz MHz-loss model is independently validated.');
  const maxEvaluations = opt.maxEvaluations ?? 12;
  if (!Number.isInteger(maxEvaluations) || maxEvaluations < 1 || maxEvaluations > 12) throw new Error('Choose 1–12 full geometry evaluations.');
  const maxModels = opt.maxModelEvaluations ?? 2;
  if (!Number.isInteger(maxModels) || maxModels < 0 || maxModels > 2) throw new Error('Choose 0–2 inductance-model evaluations.');
  if (opt.targetL != null) positive(opt.targetL, 'Target inductance');
  if (opt.errorPct != null && (!(opt.errorPct > 0) || !Number.isFinite(opt.errorPct) || opt.errorPct > 100)) throw new Error('Target tolerance must be greater than zero and at most 100 percent.');
  for (const key of ['maxVias', 'maxRdc', 'maxDiameter', 'maxBoardDiameter', 'minBore']) if (opt[key] != null) positive(opt[key], key);
  const cancelled = () => opt.signal?.aborted || opt.cancelled?.() === true;
  const axes = { turns: opt.turns || [cfg.turns, Math.max(1, cfg.turns - 1), cfg.turns + 1],
    traceW: opt.widths || [cfg.traceW, cfg.traceW * 0.9, cfg.traceW * 1.1],
    litzTurnSpacing: opt.pitches || [cfg.litzTurnSpacing, cfg.litzTurnSpacing * 1.1, cfg.litzTurnSpacing * 0.9],
    litzStepDeg: opt.stepAngles || unique([cfg.litzStepDeg, 15, 30, 7.5]) };
  for (const [key, values] of Object.entries(axes)) {
    if (!Array.isArray(values) || !values.length || values.length > 8 || values.some(v => !Number.isFinite(v) || v <= 0)) throw new Error(`Choose 1–8 positive ${key} values.`);
    axes[key] = unique(values);
  }
  const keys = Object.keys(axes), trials = [], seen = new Set();
  const initial = Object.fromEntries(keys.map(k => [k, axes[k][0]]));
  const add = delta => { const next = { ...cfg, ...initial, ...delta, litzOutline: true }; const key = keys.map(k => next[k]).join(':'); if (!seen.has(key)) { seen.add(key); trials.push(next); } };
  // Explore one change on each axis before spending the budget on combinations.
  add(Object.fromEntries(keys.map(k => [k, axes[k][0]])));
  for (const key of keys) for (const value of axes[key]) add({ [key]: value });
  outer: for (const turns of axes.turns) for (const traceW of axes.traceW) for (const litzTurnSpacing of axes.litzTurnSpacing) for (const litzStepDeg of axes.litzStepDeg) {
    add({ turns, traceW, litzTurnSpacing, litzStepDeg }); if (trials.length >= 512) break outer;
  }
  const { checkLitzFit } = await import('./litz-sizing.js');
  const candidates = [], rejected = [];
  let evaluated = 0, pruned = 0, models = 0;
  for (const config of trials) {
    if (cancelled() || evaluated >= maxEvaluations) break;
    const fit = checkLitzFit(config);
    if (!fit.ok) { pruned++; if (rejected.length < 24) rejected.push({ config, stage: 'fit', issues: fit.errors }); continue; }
    evaluated++;
    try {
      const geometry = buildLitz(fit.config || config), validation = validateLitz(geometry, geometry.config);
      if (!validation.ok) throw new Error(validation.errors[0].message);
      const fabrication = validateManufacturing(geometry, geometry.config, validation);
      if (!fabrication.ok) throw new Error(fabrication.errors[0].message);
      const metrics = dcMetrics(geometry, geometry.config);
      if (opt.maxVias && metrics.viaCount > opt.maxVias || opt.maxRdc && metrics.Rdc > opt.maxRdc || opt.maxDiameter && metrics.outerDiameterMM > opt.maxDiameter || opt.maxBoardDiameter && metrics.boardDiameterMM > opt.maxBoardDiameter || opt.minBore && metrics.innerDiameterMM < opt.minBore) throw new Error('Candidate exceeds the specified via, resistance, copper envelope, board edge or bore budget.');
      const score = metrics.Rdc + metrics.viaCount * 1e-5;
      candidates.push({ config: geometry.config, metrics, issues: cfg.litzOutline ? [] : ['Board outline enabled for fabrication checks; board diameter includes the configured edge clearance.'], score,
        manufacturing: fabrication.summary, targetAssessed: false,
        _geometry: opt.targetL ? geometry : null });
    } catch (error) { if (rejected.length < 24) rejected.push({ config, stage: 'physical', issues: [error.message] }); }
    progress({ done: evaluated, total: maxEvaluations, pruned, message: `${candidates.length} copper and fabrication candidates` });
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  candidates.sort((a, b) => a.score - b.score);
  if (opt.targetL) for (const candidate of candidates) {
    if (cancelled() || models >= maxModels) break;
    models++;
    try {
      const analysis = analyseLitz(candidate.config, candidate._geometry, { segmentCap: 48 });
      candidate.metrics.L = analysis.L;
      candidate.metrics.targetError = Math.abs(analysis.L / opt.targetL - 1);
      candidate.targetAssessed = true;
      candidate.targetMet = candidate.metrics.targetError <= (opt.errorPct ?? 10) / 100;
      candidate.score = candidate.metrics.targetError;
    } catch (error) { candidate.issues.push(`Inductance estimate unavailable: ${error.message}`); }
    progress({ done: evaluated, total: maxEvaluations, models, message: `${models} unvalidated inductance estimates` });
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  for (const candidate of candidates) {
    delete candidate._geometry;
    if (opt.targetL && !candidate.targetAssessed) candidate.issues.push('Inductance target was not evaluated within the model budget.');
  }
  if (opt.targetL) candidates.sort((a, b) => Number(b.targetAssessed) - Number(a.targetAssessed) || a.score - b.score);
  return { candidates, evaluated, pruned, rejected, cancelled: !!cancelled(), models,
    ranking: opt.targetL ? 'Estimated inductance error among at most two DC-ranked candidates; other targets remain unassessed.' : 'Rdc in ohms + 0.00001 × via count; geometry/DC screening only.',
    limits: { maxEvaluations, maxModelEvaluations: maxModels, maxPreflightTrials: 512, QOptimization: false },
    warnings: ['Candidate application must regenerate and revalidate geometry and fabrication rules.', 'Generic manufacturing screening requires separate native KiCad DRC and fabricator approval.', 'Inductance estimates are unvalidated; Q and WPT efficiency are not search objectives.'] };
}
