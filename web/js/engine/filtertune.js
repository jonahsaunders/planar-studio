/* Re-evaluate fixed distributed geometry. Material studies must not synthesize
   a new layout for each sample: doing so would tune away manufacturing error.
   Hairpin/interdigital use a narrowband resonator equivalent; no full-wave EM. */
import { microstrip, coupledMicrostrip } from './microstrip.js';

export const DISTRIBUTED = ['stepped', 'edgeCoupled', 'hairpin', 'interdigital'];
export const plain = (v) => JSON.parse(JSON.stringify(v));

export function tuneDistributed(base, cfg, tuning = {}, variation = {}) {
  const d = plain(base), nominal = plain(base);
  if (!DISTRIBUTED.includes(d.kind)) return d;
  const sub = { h: cfg.subH, er: cfg.subEr, t: cfg.subT, tanD: cfg.tanD, ...variation };
  const f = d.f0 || d.spec.fc, dw = variation.etch || 0;
  const model = (w) => microstrip(w, sub.h, sub.er, { t: sub.t, f, tanD: sub.tanD });
  const cp = (w, s) => coupledMicrostrip(w, s, sub.h, sub.er, { t: sub.t, f });
  const length = (i, v) => v * (tuning.lengthScale || 1) * (tuning.lengths?.[i] || 1);
  const gap = (i, v) => v * (tuning.gapScale || 1) * (tuning.gaps?.[i] || 1) - dw;
  const positive = (x) => { if (!(x > 0) || !Number.isFinite(x)) throw new Error('Variation closes a gap or produces invalid geometry.'); return x; };
  d.feed.w = positive(d.feed.w + dw); d.feed.model = model(d.feed.w);
  if (d.kind === 'stepped' || d.kind === 'edgeCoupled') {
    d.sections = d.sections.map((s, i) => {
      s.length = positive(length(i, s.length)); s.w = positive(s.w + dw);
      if (d.kind === 'stepped') { s.model = model(s.w); s.Z = s.model.Z0; }
      else { s.s = positive(gap(i, s.s)); s.coupled = cp(s.w, s.s); s.alpha = model(s.w).alpha; }
      return s;
    });
    d.elements = d.sections.map((s) => d.kind === 'stepped'
      ? { kind: 'line', length: s.length, model: s.model, role: s.role }
      : { kind: 'coupledSection', length: s.length, coupled: s.coupled, alpha: s.alpha });
    d.totalLength = d.sections.reduce((sum, s) => sum + s.length, 0);
    return d;
  }
  // Rebuild the tank frequencies and inverter strengths from physical lengths
  // and gaps, keeping the original specification available for comparison.
  const hairpin = d.kind === 'hairpin';
  d.resonators = d.resonators.map((r, i) => {
    r.w = positive(r.w + dw); r.model = model(r.w);
    if (hairpin) {
      r.armLen = positive(length(i, r.armLen)); r.armGap = positive(r.armGap - dw);
      r.span = 2 * r.w + r.armGap;
      r.gapLeft = positive(gap(i, r.gapLeft)); r.gapRight = positive(gap(i + 1, r.gapRight));
    } else r.length = positive(length(i, r.length));
    return r;
  });
  if (!hairpin) {
    d.gaps = d.gaps.map((g, i) => ({ ...g, s: positive(gap(i, g.s)) }));
    d.quarter = Math.max(...d.resonators.map((r) => r.length));
  }
  const n = d.resonators.length;
  const frequencies = d.resonators.map((r) => 299792458 / (Math.sqrt(r.model.epsEff) * 1e-3 * (hairpin ? 2 * (2 * r.armLen + r.armGap + r.w) : 4 * r.length)));
  const tanks = d.resonators.map((r, i) => {
    const b = (hairpin ? Math.PI / 2 : Math.PI / 4) / r.model.Z0;
    const w0 = 2 * Math.PI * frequencies[i], C = b / w0, L = 1 / (w0 * w0 * C);
    const qu = r.model.alpha > 0 ? 2 * Math.PI / (r.model.lambda * 1e-3) / (2 * r.model.alpha) : 0;
    return { kind: 'shunt', type: 'LC-parallel', L, C, qu, b, resonator: i };
  });
  const G = 1 / d.Z0, fbw = d.fbw;
  d.elements = [{ kind: 'inverter', J: Math.sqrt(G * tanks[0].b * fbw / (d.g[0] * d.g[1])) }];
  for (let i = 0; i < n; i++) {
    d.elements.push(tanks[i]);
    if (i < n - 1) {
      const a = d.resonators[i], b = d.resonators[i + 1];
      const oldGap = hairpin ? nominal.resonators[i + 1].gapLeft : nominal.gaps[i].s;
      const newGap = hairpin ? b.gapLeft : d.gaps[i].s;
      const oldW = (nominal.resonators[i].w + nominal.resonators[i + 1].w) / 2;
      const oldK = coupledMicrostrip(oldW, oldGap, cfg.subH, cfg.subEr, { t: cfg.subT, f }).coupling;
      const newK = cp((a.w + b.w) / 2, newGap).coupling;
      const J = fbw * Math.sqrt(tanks[i].b * tanks[i + 1].b) / Math.sqrt(d.g[i + 1] * d.g[i + 2]) * newK / oldK;
      d.elements.push({ kind: 'inverter', J });
    }
  }
  d.elements.push({ kind: 'inverter', J: Math.sqrt(tanks.at(-1).b * G * fbw / (d.g[n] * d.g[n + 1])) });
  d.tuningModel = 'Narrowband coupled-resonator equivalent; fixed external Q. Bends, taps, and nonadjacent coupling need EM validation.';
  return d;
}

export function tuningHandles(cfg, res, app) {
  const d = res.design;
  if (!DISTRIBUTED.includes(d.kind)) return [];
  const t = cfg.tuning || {}, out = [];
  const setFactor = (key, i, ratio) => {
    const values = [...(t[key] || [])]; values[i] = Math.max(0.3, Math.min(3, (values[i] || 1) * ratio));
    app.set('tuning', { ...t, [key]: values });
  };
  if (['stepped', 'edgeCoupled'].includes(d.kind)) {
    let x = d.kind === 'stepped' ? cfg.feedLength : 0, y = 0;
    d.sections.forEach((s, i) => {
      const startX = x, startY = y;
      out.push({ id: `length-${i}`, x: x + s.length, y, cursor: 'ew-resize', hint: `Section ${i + 1}: ${s.length.toFixed(2)} mm`, drag: (wx) => setFactor('lengths', i, Math.max(0.1, wx - startX) / s.length) });
      if (d.kind === 'edgeCoupled') out.push({ id: `gap-${i}`, x: x + s.length / 2, y: y - s.w - s.s, cursor: 'ns-resize', hint: `Gap ${i + 1}: ${s.s.toFixed(3)} mm`, drag: (_wx, wy) => setFactor('gaps', i, Math.max(cfg.minGap, startY - wy - s.w) / s.s) });
      x += s.length; if (d.kind === 'edgeCoupled') y -= s.w + s.s;
    });
  } else {
    let x = 0;
    d.resonators.forEach((r, i) => {
      const hairpin = d.kind === 'hairpin', len = hairpin ? r.armLen : r.length;
      const span = hairpin ? r.span : r.w, cx = x + span / 2;
      out.push({ id: `length-${i}`, x: cx, y: len, cursor: 'ns-resize', hint: `Resonator ${i + 1}: ${len.toFixed(2)} mm`, drag: (_wx, wy) => setFactor('lengths', i, Math.max(0.2, wy) / len) });
      if (i < d.resonators.length - 1) {
        const gap = hairpin ? d.resonators[i + 1].gapLeft : d.gaps[i].s, edge = x + span;
        out.push({ id: `gap-${i}`, x: edge + gap, y: len / 2, cursor: 'ew-resize', hint: `Gap ${i + 1}: ${gap.toFixed(3)} mm`, drag: (wx) => setFactor('gaps', hairpin ? i + 1 : i, Math.max(cfg.minGap, wx - edge) / gap) });
        x += span + gap;
      }
    });
  }
  return out;
}
