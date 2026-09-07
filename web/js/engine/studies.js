/* Bounded design searches and reproducible manufacturing studies. These run
   in a Worker; callbacks report progress, never mutate the active design. */
import { buildCoil, analyse, solveCoilForL, sweep } from './coil.js';
import { buildArtwork } from './coilgeom.js';
import { boundsCopper } from './artwork.js';
import { compute as filterCompute, synth } from '../ws/filter.js';
import { DISTRIBUTED, plain } from './filtertune.js';
import { interpolate } from './measurements.js';

const positive = (x, name) => { if (!(x > 0) || !Number.isFinite(x)) throw new Error(`${name} must be positive.`); return x; };
const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
const unique = (xs) => [...new Set(xs)];

export function optimizeCoil(cfg, opt, progress = () => {}) {
  for (const key of ['targetL', 'maxWidth', 'maxHeight', 'frequency', 'minWidth', 'maxTrace', 'minGap', 'maxGap']) positive(opt[key], key);
  if (opt.minWidth > opt.maxTrace || opt.minGap > opt.maxGap) throw new Error('Minimum exceeds maximum.');
  const layers = unique(opt.layers.map(Number));
  if (!layers.length || layers.some((n) => !Number.isInteger(n) || n < 1 || n > 16)) throw new Error('Choose copper layers from 1 through 16.');
  const trials = [];
  for (const layersN of layers) for (const w of unique(linspace(opt.minWidth, opt.maxTrace, 3))) for (const s of unique(linspace(opt.minGap, opt.maxGap, 3))) trials.push({ layers: layersN, traceW: w, traceS: s });
  const candidates = [];
  for (let i = 0; i < trials.length; i++) {
    const config = { ...cfg, ...trials[i], arrayEnabled: false, freq: opt.frequency };
    const dMax = Math.min(opt.maxWidth, opt.maxHeight / (cfg.shape === 'racetrack' ? cfg.aspect : 1));
    let sol;
    let limit = dMax;
    for (let trim = 0; trim < 3; trim++) {
      sol = solveCoilForL(config, opt.targetL, { dMax: limit, dMin: Math.max(1, 4 * (config.traceW + config.traceS)), maxTurns: 40, coarseCap: 800, segmentCap: 1800, tol: 0.003 });
      const size = boundsCopper(buildArtwork(sol.cfg, sol.coil, { silk: false }));
      const ratio = Math.min(opt.maxWidth / size.w, opt.maxHeight / size.h);
      if (ratio >= 0.999) break;
      limit *= ratio * 0.99;
    }
    const a = analyse(sol.cfg, sol.coil, { segmentCap: 3600 });
    const art = buildArtwork(sol.cfg, sol.coil, { silk: false }), box = boundsCopper(art);
    const error = Math.abs(a.L / opt.targetL - 1);
    const feasible = error <= (opt.errorPct || 3) / 100 && box.w <= opt.maxWidth && box.h <= opt.maxHeight && a.drc.turnsOK && a.drc.clearanceOK && a.Q > 0 && a.srf >= opt.frequency * (opt.srfMargin || 3);
    if (feasible) candidates.push({ config: sol.cfg, L: a.L, Q: a.Q, Rdc: a.Rdc, area: box.w * box.h, width: box.w, height: box.h, srf: a.srf, error, art });
    progress({ done: i + 1, total: trials.length, message: `${candidates.length} feasible designs` });
  }
  const pareto = candidates.filter((a) => !candidates.some((b) => b !== a && b.area <= a.area && b.Rdc <= a.Rdc && b.Q >= a.Q && (b.area < a.area || b.Rdc < a.Rdc || b.Q > a.Q)));
  return { candidates: candidates.sort((a, b) => b.Q - a.Q), pareto: pareto.sort((a, b) => a.area - b.area), evaluated: trials.length };
}

export function random(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export function responseOf(kind, cfg, fixed = null, variation = null, cap = 1400) {
  if (kind === 'filter') {
    if (!DISTRIBUTED.includes(cfg.family)) throw new Error('Fixed-copper studies currently support distributed filters. Select stepped, edge-coupled, hairpin, or interdigital.');
    const res = filterCompute(cfg, {}, { fixedDesign: fixed || cfg.fixedDesign || synth(cfg), variation: variation || {} });
    return { x: res.response.freqs, y: res.response.s21db, metric: 's21db', result: res.response };
  }
  const a = analyse(cfg, buildCoil(cfg), { segmentCap: cap });
  const f0 = cfg.studyF0 || Math.max(1e3, cfg.freq / 100), f1 = cfg.studyF1 || Math.max(cfg.freq * 10, a.srf * 1.5);
  const values = sweep(cfg, a, f0, f1, 151);
  return { x: values.map((v) => v.f), y: values.map((v) => v.Z), metric: 'Z', analysis: a };
}

function perturb(kind, cfg, key, delta) {
  const next = { ...cfg }, variation = {};
  if (kind === 'filter') {
    if (key === 'etch') variation.etch = delta;
    else variation[{ thickness: 'h', copper: 't', er: 'er' }[key]] = cfg[{ thickness: 'subH', copper: 'subT', er: 'subEr' }[key]] * (1 + delta / 100);
  } else {
    if (key === 'etch') { next.traceW += delta; next.traceS -= delta; }
    else next[{ thickness: 'boardT', copper: 'copperOz', er: 'epsR' }[key]] *= 1 + delta / 100;
    if (next.traceW <= 0 || next.traceS <= 0) throw new Error('Etch variation closes the winding gap or removes a trace.');
  }
  return { next, variation };
}

export function maskScore(curve, mask) {
  if (!mask.length) throw new Error('Add at least one response-mask band.');
  let loss = 0, count = 0, failed = 0;
  for (const b of mask) {
    if (!(b.from > 0 && b.to > b.from) || !Number.isFinite(b.min) || !Number.isFinite(b.max) || b.min > b.max) throw new Error('Invalid response mask band.');
    if (b.from < curve.x[0] || b.to > curve.x.at(-1)) throw new Error('Response mask extends outside the simulated sweep.');
    const xs = [b.from, ...curve.x.filter((x) => x > b.from && x < b.to), b.to];
    for (const x of xs) {
      const y = interpolate(curve.x, curve.y, x);
      if (!Number.isFinite(y)) throw new Error('Non-finite response in the mask.');
      const e = Math.max(0, b.min - y, y - b.max);
      loss += e * e; count++; if (e > 1e-9) failed++;
    }
  }
  return { loss: loss / count, passes: failed === 0 };
}

export function toleranceStudy(kind, cfg, opt, progress = () => {}) {
  const samples = Math.round(opt.samples || 50);
  if (samples < 2 || samples > 500) throw new Error('Choose 2–500 samples.');
  for (const [key, value] of Object.entries(opt.ranges)) if (!Number.isFinite(value) || value < 0 || (key !== 'etch' && value >= 100)) throw new Error('Tolerances must be nonnegative and relative tolerances below 100%.');
  const fixed = kind === 'filter' ? plain(cfg.fixedDesign || synth(cfg)) : null;
  const nominal = responseOf(kind, cfg, fixed);
  // Every sample must use the same frequencies, including when SRF moves.
  cfg = { ...cfg, studyF0: nominal.x[0], studyF1: nominal.x.at(-1) };
  const rng = random(opt.seed || 1), curves = [], scalars = []; let passed = 0, invalid = 0;
  const pass = (r) => kind === 'filter' ? maskScore(r, opt.mask).passes :
    Math.abs(r.analysis.L / positive(opt.targetL, 'Target inductance') - 1) <= opt.errorPct / 100 && r.analysis.Q >= opt.minQ;
  if (kind === 'filter') maskScore(nominal, opt.mask);
  for (let i = 0; i < samples; i++) {
    const deltas = Object.entries(opt.ranges).map(([key, range]) => [key, (2 * rng() - 1) * range]);
    try {
      let c = { ...cfg }, v = {};
      for (const [key, delta] of deltas) {
        const p = perturb(kind, c, key, delta); c = p.next; Object.assign(v, p.variation);
      }
      const r = responseOf(kind, c, fixed, v);
      if (!r.y.every(Number.isFinite)) throw new Error('Non-finite sample');
      curves.push(r.y); scalars.push(kind === 'filter' ? maskScore(r, opt.mask).loss : r.analysis.L);
      if (pass(r)) passed++;
    } catch { invalid++; }
    progress({ done: i + 1, total: samples, message: `${passed} samples meet the specification` });
  }
  if (!curves.length) throw new Error('Every sample produced invalid geometry. Reduce the tolerances.');
  const percentile = (a, q) => { const s = a.slice().sort((a, b) => a - b); const k = (s.length - 1) * q, i = Math.floor(k); return s[i] + (s[Math.min(s.length - 1, i + 1)] - s[i]) * (k - i); };
  const sensitivity = Object.entries(opt.ranges).filter(([, r]) => r > 0).map(([key, range]) => {
    try {
      const a = perturb(kind, cfg, key, -range), b = perturb(kind, cfg, key, range);
      const low = responseOf(kind, a.next, fixed, a.variation), high = responseOf(kind, b.next, fixed, b.variation);
      const impact = kind === 'filter' ? Math.sqrt(low.y.reduce((sum, y, i) => sum + (high.y[i] - y) ** 2, 0) / low.y.length) : Math.abs(high.analysis.L - low.analysis.L) / nominal.analysis.L * 100;
      return { key, impact };
    } catch { return { key, impact: null }; }
  }).sort((a, b) => (b.impact ?? Infinity) - (a.impact ?? Infinity));
  return { nominal, low: nominal.x.map((_, i) => percentile(curves.map((c) => c[i]), 0.05)), high: nominal.x.map((_, i) => percentile(curves.map((c) => c[i]), 0.95)), samples, passed, invalid, yield: passed / samples, seed: opt.seed || 1, sensitivity, scalars };
}

export function fitMeasurement(kind, cfg, data, opt, progress = () => {}) {
  const fixed = kind === 'filter' ? plain(cfg.fixedDesign || synth(cfg)) : null;
  const base = responseOf(kind, cfg, fixed), metric = kind === 'filter' ? 's21db' : 'Z';
  cfg = { ...cfg, studyF0: base.x[0], studyF1: base.x.at(-1) };
  const points = data.rows.filter((r) => Number.isFinite(r[metric]) && r.f >= base.x[0] && r.f <= base.x.at(-1));
  if (points.length < 5) throw new Error(`At least five ${metric} points must overlap the simulated sweep.`);
  if (kind === 'filter' && data.z0 && Math.abs(data.z0 - cfg.z0) > 1e-6) throw new Error('Measurement reference impedance differs from the design. Renormalize the measurement first.');
  const fields = opt.fields;
  const allowed = kind === 'filter' ? ['subEr', 'tanD'] : ['epsR', 'cExtra'];
  if (!fields?.length || fields.some((p) => !allowed.includes(p.key) || !Number.isFinite(p.min) || !Number.isFinite(p.max) || p.min < (p.key === 'subEr' || p.key === 'epsR' ? 1 : 0) || p.max <= p.min)) throw new Error('Invalid fit bounds.');
  const evaluate = (c) => {
    const v = kind === 'filter' ? { er: c.subEr, tanD: c.tanD } : null;
    const r = responseOf(kind, c, fixed, v, 3600);
    const loss = points.reduce((sum, p) => {
      const predicted = interpolate(r.x, r.y, p.f);
      const residual = metric === 'Z' ? Math.log(Math.max(predicted, 1e-12) / Math.max(p.Z, 1e-12)) : predicted - p.s21db;
      return sum + residual * residual;
    }, 0) / points.length;
    return { config: c, curve: r, loss };
  };
  let best = evaluate({ ...cfg, ...Object.fromEntries(fields.map((p) => [p.key, Math.max(p.min, Math.min(p.max, cfg[p.key]))])) });
  const before = evaluate(cfg);
  for (let round = 0; round < 5; round++) {
    for (const p of fields) {
      const radius = (p.max - p.min) / 2 ** round;
      const lo = Math.max(p.min, best.config[p.key] - radius), hi = Math.min(p.max, best.config[p.key] + radius);
      for (const value of linspace(lo, hi, 9)) {
        const trial = evaluate({ ...best.config, [p.key]: value });
        if (trial.loss < best.loss) best = trial;
      }
    }
    progress({ done: round + 1, total: 5, message: `RMS residual ${Math.sqrt(best.loss).toPrecision(3)}` });
  }
  return { ...best, original: before.curve, originalLoss: before.loss, count: points.length, fields, boundary: fields.filter((p) => Math.abs(best.config[p.key] - p.min) < 1e-6 || Math.abs(best.config[p.key] - p.max) < 1e-6).map((p) => p.key) };
}

export function tuneToMask(cfg, opt, progress = () => {}) {
  const fixed = plain(cfg.fixedDesign || synth(cfg)), initial = cfg.tuning || {};
  const evaluate = (tuning) => {
    const config = { ...cfg, tuning }, curve = responseOf('filter', config, fixed);
    return { config, curve, ...maskScore(curve, opt.mask) };
  };
  let best = evaluate(initial), original = best;
  const keys = cfg.family === 'stepped' ? ['lengthScale'] : ['lengthScale', 'gapScale'];
  for (let round = 0; round < 5; round++) {
    for (const key of keys) {
      const center = best.config.tuning[key] || 1, radius = 0.3 / 2 ** round;
      for (const value of linspace(Math.max(0.5, center - radius), Math.min(1.5, center + radius), 9)) {
        const trial = evaluate({ ...best.config.tuning, [key]: value });
        const d = filterCompute(trial.config, {}, { quick: true, fixedDesign: fixed }).design;
        const gaps = d.kind === 'edgeCoupled' ? d.sections.map((s) => s.s) : d.kind === 'hairpin' ? d.resonators.slice(1).map((r) => r.gapLeft) : d.gaps?.map((g) => g.s) || [];
        if (gaps.some((g) => g < cfg.minGap)) continue;
        if (trial.loss < best.loss) best = trial;
      }
    }
    progress({ done: round + 1, total: 5, message: best.passes ? 'Mask met' : `Mask penalty ${best.loss.toPrecision(3)}` });
  }
  return { ...best, original: original.curve, originalLoss: original.loss };
}
