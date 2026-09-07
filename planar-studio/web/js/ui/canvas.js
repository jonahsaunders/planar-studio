/* ============================================================================
   VIEWPORT — canvas renderer and direct manipulation.

   Draws artwork the way a PCB editor does: one pass per copper layer, back to
   front, with round caps and joins so a polyline reads as the copper it will
   become rather than as a hairline. Traces are stroked at their true width, so
   what is on screen is a real picture of the etch at every zoom level.

   The handles are the point of the whole thing. Numbers in a panel tell you
   what a coil is; dragging its outer edge and watching the inductance move
   tells you how it behaves. Each handle is a world-space point with a setter,
   and the workspace decides which ones exist.
   ========================================================================= */

const DPR = () => Math.min(window.devicePixelRatio || 1, 2.5);

export class Viewport {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 8;             // pixels per millimetre
    this.tx = 0;                // world origin in css pixels
    this.ty = 0;
    this.art = null;
    this.handles = [];
    this.layerVisible = new Map();
    this.layerColor = new Map();
    this.show = { grid: true, vias: true, labels: false, handles: true, outline: true, ports: true };
    this.hover = null;
    this.dragging = null;
    this.onHover = opts.onHover || (() => {});
    this.onHandleDrag = opts.onHandleDrag || (() => {});
    this.onHandleDone = opts.onHandleDone || (() => {});
    this.theme = { };
    this._raf = 0;
    this._bind();
    this.resize();
  }

  /* ------------------------------------------------------------ transform */

  toScreen(x, y) { return [x * this.scale + this.tx, -y * this.scale + this.ty]; }
  toWorld(px, py) { return [(px - this.tx) / this.scale, -(py - this.ty) / this.scale]; }

  fit(box, pad = 24) {
    const r = this.canvas.getBoundingClientRect();
    if (!box || !isFinite(box.w) || box.w <= 0 || box.h <= 0) {
      this.scale = 8;
      this.tx = r.width / 2; this.ty = r.height / 2;
      this.draw();
      return;
    }
    const sx = (r.width - pad * 2) / box.w;
    const sy = (r.height - pad * 2) / box.h;
    this.scale = Math.max(0.02, Math.min(sx, sy));
    const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
    this.tx = r.width / 2 - cx * this.scale;
    this.ty = r.height / 2 + cy * this.scale;
    this.draw();
  }

  zoomBy(factor, cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    const px = cx != null ? cx : r.width / 2;
    const py = cy != null ? cy : r.height / 2;
    const [wx, wy] = this.toWorld(px, py);
    this.scale = Math.max(0.02, Math.min(4000, this.scale * factor));
    this.tx = px - wx * this.scale;
    this.ty = py + wy * this.scale;
    this.draw();
  }

  /* --------------------------------------------------------------- events */

  _bind() {
    const c = this.canvas;

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      // Trackpads report small deltas continuously; a fixed step per notch
      // feels wrong on both. Scale the factor by the delta itself.
      const k = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018));
      this.zoomBy(Math.max(0.2, Math.min(5, k)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    c.addEventListener('pointerdown', (e) => {
      const r = c.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const h = this.show.handles ? this.hitHandle(px, py) : null;
      c.setPointerCapture(e.pointerId);
      if (h && e.button === 0) {
        this.dragging = { kind: 'handle', handle: h, id: e.pointerId };
      } else {
        this.dragging = { kind: 'pan', id: e.pointerId, px, py, tx: this.tx, ty: this.ty };
        c.style.cursor = 'grabbing';
      }
    });

    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const [wx, wy] = this.toWorld(px, py);

      if (this.dragging && this.dragging.id === e.pointerId) {
        if (this.dragging.kind === 'pan') {
          this.tx = this.dragging.tx + (px - this.dragging.px);
          this.ty = this.dragging.ty + (py - this.dragging.py);
          this.draw();
        } else {
          this.onHandleDrag(this.dragging.handle, wx, wy, e);
        }
        this.onHover({ x: wx, y: wy, handle: this.dragging.handle || null });
        return;
      }

      const h = this.show.handles ? this.hitHandle(px, py) : null;
      if (h !== this.hover) { this.hover = h; c.style.cursor = h ? (h.cursor || 'pointer') : 'default'; this.draw(); }
      this.onHover({ x: wx, y: wy, handle: h });
    });

    const end = (e) => {
      if (this.dragging && this.dragging.id === e.pointerId) {
        if (this.dragging.kind === 'handle') this.onHandleDone(this.dragging.handle);
        this.dragging = null;
        c.style.cursor = this.hover ? 'pointer' : 'default';
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => { this.onHover(null); });

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(c.parentElement || c);
  }

  hitHandle(px, py) {
    let best = null, bestD = 13;
    for (const h of this.handles) {
      const [hx, hy] = this.toScreen(h.x, h.y);
      const d = Math.hypot(hx - px, hy - py);
      if (d < bestD) { bestD = d; best = h; }
    }
    return best;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = DPR();
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.draw();
  }

  /* ----------------------------------------------------------- appearance */

  readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const get = (n, fallback) => (cs.getPropertyValue(n) || fallback).trim();
    this.theme = {
      bg: get('--bg', '#0E1116'),
      grid: get('--line-soft', '#212934'),
      gridBold: get('--line', '#2B3441'),
      text: get('--text-mute', '#6B7686'),
      accent: get('--accent', '#4C9AFF'),
      copper: get('--copper', '#C87137'),
      good: get('--good', '#3FBF7F'),
      warn: get('--warn', '#E0A63C'),
    };
  }

  setArtwork(art, layers) {
    this.art = art;
    if (layers) {
      for (const [name, colour] of layers) {
        this.layerColor.set(name, colour);
        if (!this.layerVisible.has(name)) this.layerVisible.set(name, true);
      }
    }
    this.draw();
  }

  setHandles(handles) { this.handles = handles || []; this.draw(); }

  toggleLayer(name, on) {
    this.layerVisible.set(name, on != null ? on : !this.layerVisible.get(name));
    this.draw();
  }

  /* --------------------------------------------------------------- render */

  draw() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = 0; this._draw(); });
  }

  _draw() {
    const ctx = this.ctx;
    const dpr = DPR();
    const W = this.canvas.width / dpr, H = this.canvas.height / dpr;
    this.readTheme();

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = this.theme.bg;
    ctx.fillRect(0, 0, W, H);

    if (this.show.grid) this.drawGrid(ctx, W, H);
    if (this.art) {
      this.drawOutline(ctx);
      this.drawCopper(ctx);
      if (this.show.vias) this.drawVias(ctx);
      if (this.show.labels) this.drawLabels(ctx);
      if (this.show.ports) this.drawPorts(ctx);
    }
    if (this.show.handles) this.drawHandles(ctx);
    this.drawScale(ctx, W, H);
    ctx.restore();
  }

  drawGrid(ctx, W, H) {
    // Pick a spacing that keeps grid lines 8–80 px apart at any zoom, from a
    // 1-2-5 sequence so the numbers stay readable.
    const target = 48 / this.scale;
    const pow = Math.pow(10, Math.floor(Math.log10(target)));
    const mant = target / pow;
    const step = (mant < 1.5 ? 1 : mant < 3.5 ? 2 : mant < 7.5 ? 5 : 10) * pow;

    const [wx0, wy1] = this.toWorld(0, 0);
    const [wx1, wy0] = this.toWorld(W, H);
    ctx.lineWidth = 1;

    for (let pass = 0; pass < 2; pass++) {
      const s = pass === 0 ? step : step * 5;
      ctx.strokeStyle = pass === 0 ? this.theme.grid : this.theme.gridBold;
      ctx.beginPath();
      const x0 = Math.floor(wx0 / s) * s, x1 = Math.ceil(wx1 / s) * s;
      for (let x = x0; x <= x1; x += s) {
        if (pass === 0 && Math.abs(x % (s * 5)) < s * 1e-6) continue;
        const px = Math.round(x * this.scale + this.tx) + 0.5;
        ctx.moveTo(px, 0); ctx.lineTo(px, H);
      }
      const y0 = Math.floor(wy0 / s) * s, y1 = Math.ceil(wy1 / s) * s;
      for (let y = y0; y <= y1; y += s) {
        if (pass === 0 && Math.abs(y % (s * 5)) < s * 1e-6) continue;
        const py = Math.round(-y * this.scale + this.ty) + 0.5;
        ctx.moveTo(0, py); ctx.lineTo(W, py);
      }
      ctx.stroke();
    }

    // Origin cross: the board origin, which is where a placement lands.
    const [ox, oy] = this.toScreen(0, 0);
    ctx.strokeStyle = this.theme.text;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(ox - 9, oy); ctx.lineTo(ox + 9, oy);
    ctx.moveTo(ox, oy - 9); ctx.lineTo(ox, oy + 9);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  layersInOrder() {
    const order = ['F.Cu'].concat(Array.from({ length: 30 }, (_, i) => `In${i + 1}.Cu`)).concat(['B.Cu']);
    const present = new Set(this.art.tracks.map((t) => t.layer));
    const known = order.filter((n) => present.has(n));
    const extra = [...present].filter((n) => !order.includes(n));
    return known.concat(extra);
  }

  drawCopper(ctx) {
    const layers = this.layersInOrder();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Back to front, so F.Cu is on top exactly as KiCad renders it.
    for (let i = layers.length - 1; i >= 0; i--) {
      const name = layers[i];
      if (this.layerVisible.get(name) === false) continue;
      const colour = this.layerColor.get(name) || this.theme.copper;
      const front = name === 'F.Cu';
      ctx.globalAlpha = front || layers.length === 1 ? 1 : 0.82;
      ctx.strokeStyle = colour;
      for (const t of this.art.tracks) {
        if (t.layer !== name || t.pts.length < 2) continue;
        const w = Math.max(t.width * this.scale, 0.8);
        ctx.lineWidth = w;
        ctx.beginPath();
        const [x0, y0] = this.toScreen(t.pts[0][0], t.pts[0][1]);
        ctx.moveTo(x0, y0);
        for (let k = 1; k < t.pts.length; k++) {
          const [x, y] = this.toScreen(t.pts[k][0], t.pts[k][1]);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      for (const a of this.art.arcs) {
        if (a.layer !== name) continue;
        ctx.lineWidth = Math.max(a.width * this.scale, 0.8);
        ctx.beginPath();
        const [sx, sy] = this.toScreen(a.start[0], a.start[1]);
        const [mx, my] = this.toScreen(a.mid[0], a.mid[1]);
        const [ex, ey] = this.toScreen(a.end[0], a.end[1]);
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(2 * mx - (sx + ex) / 2, 2 * my - (sy + ey) / 2, ex, ey);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawOutline(ctx) {
    if (!this.show.outline || !this.art.outline.length) return;
    ctx.strokeStyle = this.theme.warn;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    for (const o of this.art.outline) {
      if (o.pts.length < 2) continue;
      ctx.beginPath();
      const [x0, y0] = this.toScreen(o.pts[0][0], o.pts[0][1]);
      ctx.moveTo(x0, y0);
      for (let k = 1; k < o.pts.length; k++) {
        const [x, y] = this.toScreen(o.pts[k][0], o.pts[k][1]);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  drawVias(ctx) {
    for (const v of this.art.vias) {
      const [x, y] = this.toScreen(v.x, v.y);
      const r = Math.max(v.diameter * this.scale / 2, 1.4);
      ctx.fillStyle = '#D8D2C4';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      const rd = v.drill * this.scale / 2;
      if (rd > 1) {
        ctx.fillStyle = this.theme.bg;
        ctx.beginPath(); ctx.arc(x, y, rd, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const p of this.art.pads) {
      const [x, y] = this.toScreen(p.x, p.y);
      const r = Math.max(Math.max(p.w, p.h) * this.scale / 2, 2);
      ctx.fillStyle = '#E8B23A';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      if (p.drill > 0) {
        const rd = p.drill * this.scale / 2;
        if (rd > 1) { ctx.fillStyle = this.theme.bg; ctx.beginPath(); ctx.arc(x, y, rd, 0, Math.PI * 2); ctx.fill(); }
      }
      if (p.number && this.scale > 6) {
        ctx.fillStyle = this.theme.text;
        ctx.font = '600 10px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.number, x, y - r - 4);
      }
    }
  }

  drawLabels(ctx) {
    ctx.fillStyle = this.theme.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of this.art.labels) {
      const size = Math.max(8, l.size * this.scale);
      if (size > 70) continue;
      ctx.font = `500 ${size}px ${'ui-monospace, monospace'}`;
      const [x, y] = this.toScreen(l.x, l.y);
      ctx.fillText(l.text, x, y);
    }
  }

  drawPorts(ctx) {
    for (const p of this.art.ports) {
      const [x, y] = this.toScreen(p.x, p.y);
      ctx.strokeStyle = this.theme.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
      if (this.scale > 3) {
        ctx.fillStyle = this.theme.accent;
        ctx.font = '600 10px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.name, x, y - 11);
      }
    }
  }

  drawHandles(ctx) {
    for (const h of this.handles) {
      const [x, y] = this.toScreen(h.x, h.y);
      const active = this.hover === h || (this.dragging && this.dragging.handle === h);
      const r = active ? 6.5 : 5;
      ctx.fillStyle = this.theme.bg;
      ctx.strokeStyle = active ? this.theme.accent : this.theme.text;
      ctx.lineWidth = active ? 2 : 1.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (active && h.hint) {
        ctx.font = '500 11px system-ui, sans-serif';
        const w = ctx.measureText(h.hint).width;
        ctx.fillStyle = this.theme.bg;
        ctx.globalAlpha = 0.92;
        ctx.fillRect(x + 10, y - 10, w + 12, 20);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = this.theme.gridBold;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 10.5, y - 9.5, w + 11, 19);
        ctx.fillStyle = this.theme.accent;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(h.hint, x + 16, y);
      }
    }
  }

  drawScale(ctx, W, H) {
    // A physical scale bar, because a zoom percentage means nothing when the
    // question is always "how big is this on the board".
    const target = 110 / this.scale;
    const pow = Math.pow(10, Math.floor(Math.log10(target)));
    const mant = target / pow;
    const mm = (mant < 1.5 ? 1 : mant < 3.5 ? 2 : mant < 7.5 ? 5 : 10) * pow;
    const px = mm * this.scale;
    const x = W - px - 16, y = H - 18;
    ctx.strokeStyle = this.theme.text;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + px, y); ctx.lineTo(x + px, y - 4);
    ctx.stroke();
    ctx.fillStyle = this.theme.text;
    ctx.font = '500 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(mm >= 1 ? `${mm} mm` : `${(mm * 1000).toFixed(0)} µm`, x + px / 2, y - 5);
  }
}
