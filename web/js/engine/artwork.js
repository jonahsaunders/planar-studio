/* ============================================================================
   ARTWORK — the single geometry format everything downstream consumes.

   Coils, filters and motors all reduce to the same handful of primitives, and
   every consumer (the canvas renderer, the KiCad placer, the SVG/DXF/footprint
   writers) reads only this. Adding a new structure means writing one generator;
   it does not mean touching six exporters.

   Conventions, fixed here and nowhere else:
     • Millimetres throughout.
     • +Y is up, the way the maths reads. KiCad's +Y is down, so exactly one
       function flips it — `toKicad` — and everything else stays in one frame.
     • Layers are canonical KiCad names ("F.Cu", "In1.Cu", "B.Cu"). Generators
       are handed the real names of the open board, so a four-layer coil on a
       ten-layer board lands on the layers the user actually chose.
   ========================================================================= */

export const TAU = Math.PI * 2;

/* --------------------------------------------------------------------------
   Constructors
   ----------------------------------------------------------------------- */

export function artwork(meta = {}) {
  return {
    meta: { name: 'design', kind: 'generic', ...meta },
    tracks: [],   // {layer, width, pts, net, role}
    arcs: [],     // {layer, width, start, mid, end, net, role}
    vias: [],     // {x, y, drill, diameter, net, role, from, to}
    pads: [],     // {x, y, w, h, shape, number, net, layer, drill, role}
    labels: [],   // {x, y, text, layer, size}
    outline: [],  // {pts, layer} board edge / courtyard hints
    ports: [],    // {x, y, name, net, angle} — where the rest of the board joins
    notes: [],    // {level, text}
  };
}

export const track = (layer, width, pts, opt = {}) => ({ layer, width, pts, net: opt.net || null, role: opt.role || '', ...opt });
export const via = (x, y, opt = {}) => ({ x, y, drill: opt.drill || 0.3, diameter: opt.diameter || 0.6, net: opt.net || null, role: opt.role || '', from: opt.from, to: opt.to });
export const pad = (x, y, opt = {}) => ({
  x, y,
  w: opt.w || 1.6, h: opt.h || opt.w || 1.6,
  shape: opt.shape || 'circle',
  number: opt.number || '',
  net: opt.net || null,
  layer: opt.layer || 'F.Cu',
  drill: opt.drill || 0,
  role: opt.role || '',
  mask: opt.mask !== false,
});
export const label = (x, y, text, opt = {}) => ({ x, y, text, layer: opt.layer || 'F.SilkS', size: opt.size || 1 });

/* --------------------------------------------------------------------------
   Primitive shapes as polylines
   ----------------------------------------------------------------------- */

/** A straight run, as the two-point polyline a track wants. */
export const run = (x0, y0, x1, y1) => [[x0, y0], [x1, y1]];

/** Axis-aligned rectangle outline, counter-clockwise, closed. */
export function rect(x0, y0, x1, y1) {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
}

/**
 * A filled rectangle drawn as a track.
 *
 * KiCad has no "filled shape" among the items a plugin can place as routable
 * copper, but a track *is* a rectangle: a run of length L and width W is a
 * W-by-L pad of copper with rounded ends. So a wide low-impedance line, a
 * capacitor plate and a ground rail are all just tracks with a large width.
 * That keeps the placement path to tracks, arcs and vias -- the three item
 * types the IPC API handles without surprises.
 */
export function fillRect(layer, x0, y0, x1, y1, opt = {}) {
  const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (w >= h) {
    // Draw along the long axis, inset by half the width so the round ends
    // land flush with the corners instead of bulging past them.
    return track(layer, h, run(Math.min(x0, x1) + h / 2, cy, Math.max(x0, x1) - h / 2, cy), opt);
  }
  return track(layer, w, run(cx, Math.min(y0, y1) + w / 2, cx, Math.max(y0, y1) - w / 2), opt);
}

/** Arc sampled as a polyline. Angles in radians, CCW positive. */
export function arcPts(cx, cy, r, a0, a1, step = 0.12) {
  const sweep = a1 - a0;
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / step));
  const out = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const a = a0 + sweep * i / n;
    out[i] = [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }
  return out;
}

/** A 180-degree U-turn joining two parallel arms, as used by a hairpin. */
export function uBend(xLeft, xRight, y, opt = {}) {
  const r = (xRight - xLeft) / 2;
  const cx = (xLeft + xRight) / 2;
  return arcPts(cx, y, r, Math.PI, 0, opt.step || 0.1);
}

/* --------------------------------------------------------------------------
   Transforms
   ----------------------------------------------------------------------- */

export const rotatePts = (pts, ang) => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return pts.map((p) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c]);
};
export const translatePts = (pts, dx, dy) => pts.map((p) => [p[0] + dx, p[1] + dy]);

const xf = (x, y, ang, dx, dy) => {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [x * c - y * s + dx, x * s + y * c + dy];
};

/** Rotate then translate an entire artwork. Returns a new object. */
export function transform(A, { angle = 0, dx = 0, dy = 0 } = {}) {
  const P = (p) => xf(p[0], p[1], angle, dx, dy);
  const out = artwork(A.meta);
  out.tracks = A.tracks.map((t) => ({ ...t, pts: t.pts.map(P) }));
  out.arcs = A.arcs.map((a) => ({ ...a, start: P(a.start), mid: P(a.mid), end: P(a.end) }));
  out.vias = A.vias.map((v) => { const [x, y] = xf(v.x, v.y, angle, dx, dy); return { ...v, x, y }; });
  out.pads = A.pads.map((p) => { const [x, y] = xf(p.x, p.y, angle, dx, dy); return { ...p, x, y }; });
  out.labels = A.labels.map((l) => { const [x, y] = xf(l.x, l.y, angle, dx, dy); return { ...l, x, y }; });
  out.outline = A.outline.map((o) => ({ ...o, pts: o.pts.map(P) }));
  out.ports = A.ports.map((p) => { const [x, y] = xf(p.x, p.y, angle, dx, dy); return { ...p, x, y, angle: (p.angle || 0) + angle }; });
  out.notes = A.notes.slice();
  return out;
}

/** Fold `src` into `dst` in place. */
export function merge(dst, src) {
  dst.tracks.push(...src.tracks);
  dst.arcs.push(...src.arcs);
  dst.vias.push(...src.vias);
  dst.pads.push(...src.pads);
  dst.labels.push(...src.labels);
  dst.outline.push(...src.outline);
  dst.ports.push(...src.ports);
  dst.notes.push(...src.notes);
  return dst;
}

/** Set the net name on every primitive that does not already have one. */
export function defaultNet(A, name) {
  const fill = (o) => { if (!o.net) o.net = name; };
  A.tracks.forEach(fill); A.arcs.forEach(fill); A.vias.forEach(fill); A.pads.forEach(fill);
  return A;
}

/* --------------------------------------------------------------------------
   Measurement
   ----------------------------------------------------------------------- */

/** Bounding box including trace width, which is what fits on a board. */
export function bounds(A) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const hit = (x, y, pad_ = 0) => {
    if (x - pad_ < x0) x0 = x - pad_;
    if (y - pad_ < y0) y0 = y - pad_;
    if (x + pad_ > x1) x1 = x + pad_;
    if (y + pad_ > y1) y1 = y + pad_;
  };
  for (const t of A.tracks) for (const p of t.pts) hit(p[0], p[1], t.width / 2);
  for (const a of A.arcs) { hit(a.start[0], a.start[1], a.width / 2); hit(a.mid[0], a.mid[1], a.width / 2); hit(a.end[0], a.end[1], a.width / 2); }
  for (const v of A.vias) hit(v.x, v.y, v.diameter / 2);
  for (const p of A.pads) { hit(p.x - p.w / 2, p.y - p.h / 2); hit(p.x + p.w / 2, p.y + p.h / 2); }
  for (const o of A.outline) for (const p of o.pts) hit(p[0], p[1]);
  if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0, cx: 0, cy: 0 };
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** Bounds of the copper alone, ignoring the board-outline hint.

    The outline is a suggestion drawn a few millimetres clear of everything, so
    it is the wrong thing to quote as "how big is this" -- it would report the
    same size for every winding shape at a given diameter. */
export function boundsCopper(A) {
  return bounds({ ...A, outline: [] });
}

/** Total copper length, for the resistance and cost numbers. */
export function copperLength(A) {
  let L = 0;
  for (const t of A.tracks) for (let i = 1; i < t.pts.length; i++) L += Math.hypot(t.pts[i][0] - t.pts[i - 1][0], t.pts[i][1] - t.pts[i - 1][1]);
  return L;
}

/** Copper area on each layer, in mm^2. Useful for plating and etch estimates. */
export function copperArea(A) {
  const per = new Map();
  for (const t of A.tracks) {
    let L = 0;
    for (let i = 1; i < t.pts.length; i++) L += Math.hypot(t.pts[i][0] - t.pts[i - 1][0], t.pts[i][1] - t.pts[i - 1][1]);
    per.set(t.layer, (per.get(t.layer) || 0) + L * t.width);
  }
  for (const p of A.pads) per.set(p.layer, (per.get(p.layer) || 0) + (p.shape === 'rect' ? p.w * p.h : Math.PI * p.w * p.h / 4));
  return per;
}

export function segmentCount(A) {
  let n = 0;
  for (const t of A.tracks) n += Math.max(0, t.pts.length - 1);
  return n + A.arcs.length;
}

/* --------------------------------------------------------------------------
   Simplification
   ----------------------------------------------------------------------- */

/**
 * Ramer–Douglas–Peucker on every polyline.
 *
 * A 16-layer spiral with 60 turns is a few hundred thousand segments if it is
 * emitted at full sample density, which is enough to make KiCad's board editor
 * unpleasant. The tolerance is a real distance, so the guarantee is concrete:
 * no copper edge moves by more than `tol` millimetres.
 */
export function decimate(pts, tol) {
  if (pts.length < 3 || tol <= 0) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop();
    if (i1 <= i0 + 1) continue;
    const a = pts[i0], b = pts[i1];
    let ex = b[0] - a[0], ey = b[1] - a[1];
    const L = Math.hypot(ex, ey) || 1e-12;
    ex /= L; ey /= L;
    let best = -1, bd = tol;
    for (let i = i0 + 1; i < i1; i++) {
      const px = pts[i][0] - a[0], py = pts[i][1] - a[1];
      const d = Math.abs(px * ey - py * ex);
      if (d > bd) { bd = d; best = i; }
    }
    if (best > 0) { keep[best] = 1; stack.push([i0, best], [best, i1]); }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}

export function simplify(A, tol) {
  if (!(tol > 0)) return A;
  const out = { ...A, tracks: A.tracks.map((t) => ({ ...t, pts: decimate(t.pts, tol) })) };
  return out;
}

/* --------------------------------------------------------------------------
   Output
   ----------------------------------------------------------------------- */

/**
 * Convert to KiCad's coordinate frame and shape.
 *
 * This is the only place Y is negated. Everything upstream can reason in
 * ordinary maths orientation, and everything downstream of here is already in
 * board coordinates.
 */
export function toKicad(A, opt = {}) {
  const tol = opt.tolerance || 0;
  const dx = opt.dx || 0, dy = opt.dy || 0;
  const P = (p) => [p[0] + dx, -p[1] + dy];

  const tracks = [];
  for (const t of A.tracks) {
    const pts = (tol > 0 ? decimate(t.pts, tol) : t.pts).map(P);
    if (pts.length >= 2) tracks.push({ layer: t.layer, width: t.width, net: t.net, pts });
  }
  const arcs = A.arcs.map((a) => ({
    layer: a.layer, width: a.width, net: a.net,
    start: P(a.start), mid: P(a.mid), end: P(a.end),
  }));
  const vias = A.vias.map((v) => ({ x: v.x + dx, y: -v.y + dy, drill: v.drill, diameter: v.diameter, net: v.net }));
  // Drilled terminals become vias. Surface pads remain layer-specific and
  // are grouped in a footprint by the IPC backend; never short them through.
  const padVias = A.pads.filter(p => p.drill > 0).map((p) => ({
    x: p.x + dx, y: -p.y + dy,
    drill: p.drill || Math.min(p.w, p.h) * 0.5,
    diameter: Math.max(p.w, p.h),
    net: p.net,
  }));
  const texts = A.labels.map((l) => ({ x: l.x + dx, y: -l.y + dy, value: l.text, layer: l.layer }));

  const pads = A.pads.filter(p => !p.drill).map(p => ({ ...p, x: p.x + dx, y: -p.y + dy }));
  return { tracks, arcs, vias: vias.concat(padVias), pads, texts };
}
