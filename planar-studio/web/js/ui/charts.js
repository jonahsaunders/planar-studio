/* ============================================================================
   CHARTS — small canvas line plots with a crosshair readout.

   Rules this file holds itself to, because they are the ones that go wrong:

   • One y-axis. Never two. Q and |Z| share a frequency axis but not a scale,
     so they are two charts stacked, not one chart with a scale up each side.
     A dual axis lets you place the crossing anywhere you like, which means it
     tells you nothing.
   • Series colours are assigned from a fixed slot order and never cycled. Two
     or more series always get a legend, and the crosshair reads out every
     series by name, so identity never rests on colour alone.
   • Axes and gridlines recede; the data is the only thing at full strength.
   ========================================================================= */

const DPR = () => Math.min(window.devicePixelRatio || 1, 2.5);

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (v || fallback).trim();
}

/* 1-2-5 tick sequence covering [lo, hi] with roughly `count` ticks. */
function niceTicks(lo, hi, count = 5) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / pow;
  const step = (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * pow;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(v);
  return out;
}

/* Decade ticks for a log axis, with 2/5 subdivisions when there is room. */
function logTicks(lo, hi) {
  const out = [];
  const d0 = Math.floor(Math.log10(lo)), d1 = Math.ceil(Math.log10(hi));
  const decades = d1 - d0;
  const subs = decades <= 2 ? [1, 2, 3, 5, 7] : decades <= 4 ? [1, 2, 5] : [1];
  for (let d = d0; d <= d1; d++) {
    for (const s of subs) {
      const v = s * Math.pow(10, d);
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push({ v, major: s === 1 });
    }
  }
  return out;
}

const SI_STEPS = [[1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
function siLabel(v, digits = 3) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  for (const [s, p] of SI_STEPS) {
    if (a >= s * 0.999) {
      const n = v / s;
      return `${Number(n.toPrecision(digits))}${p}`;
    }
  }
  return v.toExponential(1);
}

/**
 * A line chart.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {object} spec
 *   x:      {values:[], label, log:boolean, format(v)}
 *   series: [{name, values:[], color?, dash?, unit?}]
 *   y:      {label, min?, max?, format(v)}
 *   markers:[{x, label, color?}]     vertical reference lines
 *   bands:  [{from, to, color?}]     shaded x ranges
 */
export class LineChart {
  constructor(canvas, spec = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.spec = spec;
    this.hoverIndex = -1;
    this._raf = 0;
    this._bind();
  }

  setSpec(spec) { this.spec = spec; this.draw(); }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      const px = e.clientX - r.left;
      const idx = this._indexAt(px, r.width);
      if (idx !== this.hoverIndex) { this.hoverIndex = idx; this.draw(); }
    });
    c.addEventListener('pointerleave', () => { this.hoverIndex = -1; this.draw(); });
    const ro = new ResizeObserver(() => this.draw());
    ro.observe(c);
  }

  _plotBox(W, H) {
    return { l: 44, r: 10, t: 10, b: 22, w: W - 54, h: H - 32 };
  }

  _indexAt(px, W) {
    const x = this.spec.x;
    if (!x || !x.values || !x.values.length) return -1;
    const box = this._plotBox(W, this.canvas.getBoundingClientRect().height);
    const t = (px - box.l) / box.w;
    if (t < -0.02 || t > 1.02) return -1;
    const n = x.values.length;
    return Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
  }

  draw() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this._draw(); });
  }

  _draw() {
    const spec = this.spec;
    const c = this.canvas;
    const rect = c.getBoundingClientRect();
    const dpr = DPR();
    const W = Math.max(80, rect.width), H = Math.max(60, rect.height);
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const ink = cssVar('--text-mute', '#6B7686');
    const inkStrong = cssVar('--text-dim', '#9BA6B5');
    const grid = cssVar('--line-soft', '#212934');
    const surface = cssVar('--panel-2', '#1B212A');
    const palette = [cssVar('--series-1', '#3987E5'), cssVar('--series-2', '#D95926'), cssVar('--series-3', '#199E70')];

    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, W, H);

    if (!spec || !spec.x || !spec.x.values || spec.x.values.length < 2) {
      ctx.fillStyle = ink;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('no data', W / 2, H / 2);
      return;
    }

    const box = this._plotBox(W, H);
    const xs = spec.x.values;
    const xLog = !!spec.x.log;
    const x0 = xs[0], x1 = xs[xs.length - 1];
    const sx = (v) => box.l + box.w * (xLog
      ? (Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0))
      : (v - x0) / (x1 - x0));

    // y range across every visible series
    let lo = spec.y && spec.y.min != null ? spec.y.min : Infinity;
    let hi = spec.y && spec.y.max != null ? spec.y.max : -Infinity;
    if (!isFinite(lo) || !isFinite(hi)) {
      for (const s of spec.series) {
        for (const v of s.values) {
          if (!isFinite(v)) continue;
          if (spec.y && spec.y.min == null && v < lo) lo = v;
          if (spec.y && spec.y.max == null && v > hi) hi = v;
          if (!spec.y) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
        }
      }
    }
    if (!isFinite(lo) || !isFinite(hi) || hi - lo < 1e-12) { lo -= 1; hi += 1; }
    const padY = (hi - lo) * 0.06;
    lo -= padY; hi += padY;
    const sy = (v) => box.t + box.h * (1 - (v - lo) / (hi - lo));

    // --- bands ---------------------------------------------------------
    for (const b of spec.bands || []) {
      ctx.fillStyle = b.color || cssVar('--series-1-soft', '#3987E526');
      const a = sx(Math.max(b.from, x0)), z = sx(Math.min(b.to, x1));
      ctx.fillRect(Math.min(a, z), box.t, Math.abs(z - a), box.h);
    }

    // --- grid ----------------------------------------------------------
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.fillStyle = ink;
    ctx.font = '10px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';

    for (const t of niceTicks(lo, hi, 4)) {
      const y = Math.round(sy(t)) + 0.5;
      if (y < box.t - 1 || y > box.t + box.h + 1) continue;
      ctx.beginPath(); ctx.moveTo(box.l, y); ctx.lineTo(box.l + box.w, y); ctx.stroke();
      ctx.fillText(spec.y && spec.y.format ? spec.y.format(t) : siLabel(t), box.l - 6, y);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xticks = xLog ? logTicks(x0, x1) : niceTicks(x0, x1, 5).map((v) => ({ v, major: true }));
    for (const t of xticks) {
      const px = Math.round(sx(t.v)) + 0.5;
      if (px < box.l - 1 || px > box.l + box.w + 1) continue;
      ctx.strokeStyle = grid;
      ctx.globalAlpha = t.major ? 1 : 0.45;
      ctx.beginPath(); ctx.moveTo(px, box.t); ctx.lineTo(px, box.t + box.h); ctx.stroke();
      ctx.globalAlpha = 1;
      if (t.major) {
        ctx.fillStyle = ink;
        ctx.fillText(spec.x.format ? spec.x.format(t.v) : siLabel(t.v, 2), px, box.t + box.h + 5);
      }
    }

    // --- markers -------------------------------------------------------
    for (const m of spec.markers || []) {
      if (m.x < x0 || m.x > x1) continue;
      const px = Math.round(sx(m.x)) + 0.5;
      ctx.strokeStyle = m.color || inkStrong;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(px, box.t); ctx.lineTo(px, box.t + box.h); ctx.stroke();
      ctx.setLineDash([]);
      if (m.label) {
        ctx.fillStyle = m.color || inkStrong;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillText(m.label, px + 3, box.t + 2);
      }
    }

    // --- series --------------------------------------------------------
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    spec.series.forEach((s, i) => {
      const colour = s.color || palette[i % palette.length];
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      if (s.dash) ctx.setLineDash(s.dash);
      ctx.beginPath();
      let started = false;
      for (let k = 0; k < xs.length; k++) {
        const v = s.values[k];
        if (!isFinite(v)) { started = false; continue; }
        const px = sx(xs[k]);
        const py = sy(Math.max(lo, Math.min(hi, v)));
        if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // Direct labels at the right-hand end: identity without relying on colour,
    // which the light-mode aqua slot needs and the others benefit from.
    if (spec.series.length > 1 && spec.directLabels !== false) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = '600 10px system-ui, sans-serif';
      const used = [];
      spec.series.forEach((s, i) => {
        let last = NaN, k = xs.length - 1;
        while (k >= 0 && !isFinite(s.values[k])) k--;
        if (k < 0) return;
        last = s.values[k];
        let py = sy(Math.max(lo, Math.min(hi, last)));
        while (used.some((u) => Math.abs(u - py) < 11)) py += 11;
        used.push(py);
        ctx.fillStyle = s.color || palette[i % palette.length];
        ctx.fillText(s.name, box.l + box.w - 3, py);
      });
    }

    // --- crosshair -----------------------------------------------------
    if (this.hoverIndex >= 0 && this.hoverIndex < xs.length) {
      const k = this.hoverIndex;
      const px = sx(xs[k]);
      ctx.strokeStyle = inkStrong;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, box.t); ctx.lineTo(px, box.t + box.h); ctx.stroke();

      const rows = [[spec.x.label || 'x', spec.x.format ? spec.x.format(xs[k]) : siLabel(xs[k])]];
      spec.series.forEach((s) => {
        const v = s.values[k];
        rows.push([s.name, isFinite(v) ? (s.format ? s.format(v) : `${siLabel(v)}${s.unit ? ' ' + s.unit : ''}`) : '—']);
      });

      ctx.font = '10px ui-monospace, monospace';
      let tw = 0;
      for (const [a, b] of rows) tw = Math.max(tw, ctx.measureText(`${a}  ${b}`).width);
      const bw = tw + 16, bh = rows.length * 13 + 8;
      let bx = px + 10;
      if (bx + bw > box.l + box.w) bx = px - bw - 10;
      const by = Math.min(box.t + 4, box.t + box.h - bh);

      ctx.fillStyle = cssVar('--raised', '#222A35');
      ctx.globalAlpha = 0.96;
      ctx.fillRect(bx, by, bw, bh);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = cssVar('--line', '#2B3441');
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

      rows.forEach(([a, b], i) => {
        const ty = by + 10 + i * 13;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = ink;
        ctx.fillText(a, bx + 8, ty);
        ctx.textAlign = 'right';
        ctx.fillStyle = cssVar('--text', '#E4E9F0');
        ctx.fillText(b, bx + bw - 8, ty);
      });

      spec.series.forEach((s, i) => {
        const v = s.values[k];
        if (!isFinite(v)) return;
        ctx.fillStyle = s.color || palette[i % palette.length];
        ctx.beginPath();
        ctx.arc(px, sy(Math.max(lo, Math.min(hi, v))), 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = surface;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }

    // --- frame ---------------------------------------------------------
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(box.l + 0.5, box.t + 0.5, box.w, box.h);

    if (spec.y && spec.y.label) {
      ctx.save();
      ctx.translate(11, box.t + box.h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = ink;
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(spec.y.label, 0, 0);
      ctx.restore();
    }
  }
}

/** Legend markup for a chart with two or more series. */
export function legendFor(series, host) {
  host.replaceChildren();
  if (!series || series.length < 2) return host;
  const palette = ['--series-1', '--series-2', '--series-3'];
  series.forEach((s, i) => {
    const span = document.createElement('span');
    const swatch = document.createElement('i');
    swatch.style.background = s.color || cssVar(palette[i % palette.length], '#3987E5');
    span.append(swatch, document.createTextNode(s.name));
    host.append(span);
  });
  return host;
}

export { siLabel };
