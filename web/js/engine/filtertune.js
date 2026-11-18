/* Re-evaluate fixed distributed geometry. Material studies must not synthesize
   a new layout for each sample: doing so would tune away manufacturing error.
   Hairpin/interdigital use a narrowband resonator equivalent; no full-wave EM. */
import { microstrip, coupledMicrostrip } from './microstrip.js';
import { evaluateHairpin, hairpinLength, hairpinTap } from './hairpin-model.js';
import { evaluateInterdigital } from './filter.js';

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
  if (hairpin) {
    d.tap.length = positive(d.tap.length * (tuning.taps?.[0] || 1));
    d.tapOut = d.tapOut || { ...nominal.tap };
    d.tapOut.length = positive(d.tapOut.length * (tuning.taps?.[1] || 1));
    return evaluateHairpin(d, sub);
  }
  d.gaps = d.gaps.map((g, i) => ({ ...g, s: positive(gap(i, g.s)) }));
  d.quarter = Math.max(...d.resonators.map((r) => r.length));
  return evaluateInterdigital(d, sub);
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
    if (d.kind === 'hairpin') {
      const width = d.resonators.reduce((sum, r, i) => sum + r.span + (i ? r.gapLeft : 0), 0);
      [d.resonators[0], d.resonators.at(-1)].forEach((r, i) => {
        const tap = i ? d.tapOut || d.tap : d.tap;
        const p = hairpinTap(r, tap, d.feed.w, d.Z0);
        out.push({ id: `tap-${i}`, x: i ? width - r.w / 2 : r.w / 2, y: p.y,
          cursor: 'ns-resize', hint: `${i ? 'Output' : 'Input'} tap: ${p.distance.toFixed(2)} mm from midpoint`,
          drag: (_wx, wy) => {
            const fromOpen = r.flipped ? r.armLen - wy : wy;
            setFactor('taps', i, Math.max(0.01, hairpinLength(r) / 2 - fromOpen) / tap.length);
          } });
      });
    }
  }
  return out;
}

