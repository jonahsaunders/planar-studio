/* ============================================================================
   COIL ENGINE — geometry generators, stack-up, electromagnetic solver.

   Ported from planar-coil-studio, which validated it against closed-form and
   elliptic-integral references (see tests/verify.mjs). The numerics are
   unchanged: the agreement figures in the README are only meaningful if the
   code that produced them is the code that ships.

   Geometry is carried in millimetres. Physics converts to SI at the boundary.
   ========================================================================= */

export const MU0      = 4e-7 * Math.PI;      // H/m
export const EPS0     = 8.8541878128e-12;    // F/m
export const RHO_CU20 = 1.724e-8;            // ohm-m at 20 C
export const ALPHA_CU = 0.00393;             // 1/K
export const DENS_CU  = 8960;                // kg/m^3
export const OZ_MM    = 0.0348;              // 1 oz/ft^2 finished copper, mm

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------------------------------------------------------------------------
   1.  POLYLINE UTILITIES
   ------------------------------------------------------------------------ */

export function polyLength(pts, closed) {
  let L = 0;
  const n = pts.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    L += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return L;
}

/* Uniform arc-length resample of a CLOSED polygon to exactly n points. */
export function resampleClosed(pts, n) {
  const m = pts.length;
  const cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % m];
    cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const total = cum[m];
  const out = new Array(n);
  let seg = 0;
  for (let i = 0; i < n; i++) {
    const s = total * i / n;
    while (seg < m - 1 && cum[seg + 1] < s) seg++;
    const t = (s - cum[seg]) / Math.max(1e-12, cum[seg + 1] - cum[seg]);
    const a = pts[seg], b = pts[(seg + 1) % m];
    out[i] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  return out;
}

export function signedArea(pts) {
  let A = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    A += a[0] * b[1] - b[0] * a[1];
  }
  return A / 2;
}

/* Inward miter-offset basis. For each vertex returns the direction such that
   P + d*B is the vertex of the polygon offset inward by perpendicular d.
   Miter length is clamped so acute corners bevel instead of exploding.      */
export function offsetBasis(pts, miterLimit = 4) {
  const n = pts.length;
  const ccw = signedArea(pts) > 0;
  const B = new Array(n);
  const nrm = new Array(n);            // inward normal of edge i -> i+1
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    let ex = b[0] - a[0], ey = b[1] - a[1];
    const len = Math.hypot(ex, ey) || 1e-12;
    ex /= len; ey /= len;
    nrm[i] = ccw ? [-ey, ex] : [ey, -ex];   // points into the polygon
  }
  for (let i = 0; i < n; i++) {
    const n1 = nrm[(i - 1 + n) % n], n2 = nrm[i];
    const dot = n1[0] * n2[0] + n1[1] * n2[1];
    const k = 1 + dot;
    let bx, by;
    if (k < 1e-9) { bx = n2[0]; by = n2[1]; }
    else { bx = (n1[0] + n2[0]) / k; by = (n1[1] + n2[1]) / k; }
    const mag = Math.hypot(bx, by);
    if (mag > miterLimit) { bx = bx / mag * miterLimit; by = by / mag * miterLimit; }
    B[i] = [bx, by];
  }
  return B;
}

/* Per-vertex offset cap: the distance at which an incident edge collapses.
   Freezing a vertex at its cap turns a sharp corner into a point instead of a
   self-intersecting loop, which is what an inward offset should produce.    */
export function offsetCaps(pts, basis) {
  const n = pts.length;
  const edge = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = pts[j][0] - pts[i][0], ey = pts[j][1] - pts[i][1];
    const gx = basis[j][0] - basis[i][0], gy = basis[j][1] - basis[i][1];
    const eg = ex * gx + ey * gy;
    edge[i] = eg < -1e-12 ? (ex * ex + ey * ey) / -eg : Infinity;
  }
  const cap = new Float64Array(n);
  for (let i = 0; i < n; i++) cap[i] = Math.min(edge[(i - 1 + n) % n], edge[i]);
  return cap;
}

export function offsetVertex(pts, basis, caps, i, d) {
  const t = Math.min(d, caps[i]);
  return [pts[i][0] + basis[i][0] * t, pts[i][1] + basis[i][1] * t];
}

/* Largest inward offset that still leaves a usable contour. With the caps in
   place the failure mode is area collapse, not local edge reversal.         */
export function maxInwardOffset(pts, basis, caps, hi) {
  const n = pts.length;
  const A0 = Math.abs(signedArea(pts));
  const area = (d) => {
    let A = 0, P = 0;
    let px = 0, py = 0, x0 = 0, y0 = 0;
    for (let i = 0; i < n; i++) {
      const t = Math.min(d, caps[i]);
      const x = pts[i][0] + basis[i][0] * t, y = pts[i][1] + basis[i][1] * t;
      if (i === 0) { x0 = x; y0 = y; } else { P += Math.hypot(x - px, y - py); A += px * y - x * py; }
      px = x; py = y;
    }
    P += Math.hypot(x0 - px, y0 - py); A += px * y0 - x0 * py;
    return { a: Math.abs(A / 2), p: P };
  };
  const ok = (d) => { const r = area(d); return r.a > A0 * 0.004 && r.p > hi * 0.05; };
  if (ok(hi)) return hi;
  let lo = 0, h = hi;
  for (let it = 0; it < 34; it++) {
    const mid = (lo + h) / 2;
    if (ok(mid)) lo = mid; else h = mid;
  }
  return lo;
}

/* ---------------------------------------------------------------------------
   2.  SPIRAL GENERATORS — one algorithm per winding family
   ------------------------------------------------------------------------ */

export const ALGORITHMS = {
  circle:    { name: 'Archimedean',             note: 'r(θ) = r₀ − (p/2π)·θ — closed-form constant-pitch spiral, exact clearance everywhere.' },
  polygon:   { name: 'Corner-step polygon',     note: 'Apothem advances p/n at each of the n corners, so edge-to-edge clearance is exactly p. Corners filleted by tangent arcs.' },
  racetrack: { name: 'Stadium offset',          note: 'Rounded rectangle whose width, height and corner radius are offset continuously with the turn parameter.' },
  log:       { name: 'Logarithmic',             note: 'r(θ) = r₀·e^(−bθ). Equiangular: clearance grows outward, so the inner turns set the DRC limit.' },
  wedge:     { name: 'Sector offset',           note: 'Trapezoidal stator coil. At radius r the flank rotates by asin(d/r), keeping perpendicular clearance p between turns.' },
  super:     { name: 'Superformula + miter',    note: 'Gielis superformula seeds the contour; a clamped miter offset walks it inward once per turn.' },
  custom:    { name: 'Contour miter offset',    note: 'Arbitrary user contour, uniformly resampled, then walked inward by a clamped miter offset per turn.' },
};

/* All generators return { path:[[x,y],..] outer→inner, base:[[x,y],..] contour,
   turnsUsed, maxTurns, minClearance }                                        */

function genCircle(g) {
  const { turns, pitch, rOuter, ppt } = g;
  const N = Math.max(8, Math.round(turns * ppt));
  const path = new Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const t = i / ppt;                       // turns elapsed
    const th = TAU * t, r = rOuter - pitch * t;
    path[i] = [r * Math.cos(th), r * Math.sin(th)];
  }
  const base = [];
  for (let i = 0; i < 256; i++) base.push([rOuter * Math.cos(TAU * i / 256), rOuter * Math.sin(TAU * i / 256)]);
  return { path, base, maxTurns: (rOuter - pitch * 0.5) / pitch, minClearance: pitch, turnsUsed: turns };
}

function genLog(g) {
  const { turns, pitch, rOuter, ppt } = g;
  const rIn = Math.max(pitch, rOuter - turns * pitch);
  const b = Math.log(rOuter / rIn) / (TAU * Math.max(turns, 1e-6));
  const N = Math.max(8, Math.round(turns * ppt));
  const path = new Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const th = TAU * i / ppt;
    const r = rOuter * Math.exp(-b * th);
    path[i] = [r * Math.cos(th), r * Math.sin(th)];
  }
  // radial gap between successive turns is smallest at the inner end
  const minClearance = rIn * (Math.exp(b * TAU) - 1);
  const base = [];
  for (let i = 0; i < 256; i++) base.push([rOuter * Math.cos(TAU * i / 256), rOuter * Math.sin(TAU * i / 256)]);
  return { path, base, maxTurns: turns, minClearance, turnsUsed: turns };
}

function genPolygon(g) {
  const { turns, pitch, rOuter, sides, fillet, ppt } = g;
  const n = Math.max(3, Math.round(sides));
  const cosr = Math.cos(Math.PI / n);
  const apOuter = rOuter * cosr;                       // outer apothem
  const totalCorners = Math.max(1, Math.round(turns * n));
  // corner vertices with apothem stepping down pitch/n each corner
  const V = [];
  for (let k = 0; k <= totalCorners; k++) {
    const ap = apOuter - pitch * k / n;
    if (ap <= pitch * 0.25) break;
    const R = ap / cosr;
    const th = TAU * k / n;
    V.push([R * Math.cos(th), R * Math.sin(th)]);
  }
  const path = filletPolyline(V, fillet, Math.max(4, Math.round(ppt / n)));
  const base = [];
  for (let k = 0; k < n; k++) {
    const th = TAU * k / n;
    base.push([rOuter * Math.cos(th), rOuter * Math.sin(th)]);
  }
  return {
    path, base,
    maxTurns: (apOuter - pitch * 0.25) / pitch,
    minClearance: pitch,
    turnsUsed: (V.length - 1) / n,
  };
}

/* Replace interior corners of an open polyline with tangent circular arcs. */
export function filletPolyline(V, radius, arcPts) {
  if (radius <= 1e-6 || V.length < 3) return V.slice();
  const out = [V[0]];
  for (let i = 1; i < V.length - 1; i++) {
    const p0 = V[i - 1], p1 = V[i], p2 = V[i + 1];
    let ax = p0[0] - p1[0], ay = p0[1] - p1[1];
    let bx = p2[0] - p1[0], by = p2[1] - p1[1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1e-9 || lb < 1e-9) { out.push(p1); continue; }
    ax /= la; ay /= la; bx /= lb; by /= lb;
    const cosA = clamp(ax * bx + ay * by, -1, 1);
    const ang = Math.acos(cosA);
    if (ang > Math.PI - 1e-3 || ang < 1e-3) { out.push(p1); continue; }
    const tanHalf = Math.tan(ang / 2);
    let tl = radius / tanHalf;                    // tangent length
    tl = Math.min(tl, la * 0.49, lb * 0.49);
    const r = tl * tanHalf;
    const t1 = [p1[0] + ax * tl, p1[1] + ay * tl];
    const t2 = [p1[0] + bx * tl, p1[1] + by * tl];
    // arc centre along the internal bisector
    let mx = ax + bx, my = ay + by;
    const ml = Math.hypot(mx, my) || 1e-9; mx /= ml; my /= ml;
    const dc = r / Math.sin(ang / 2);
    const C = [p1[0] + mx * dc, p1[1] + my * dc];
    const a1 = Math.atan2(t1[1] - C[1], t1[0] - C[0]);
    const a2 = Math.atan2(t2[1] - C[1], t2[0] - C[0]);
    let d = a2 - a1;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    const steps = Math.max(2, arcPts);
    for (let s = 0; s <= steps; s++) {
      const a = a1 + d * s / steps;
      out.push([C[0] + r * Math.cos(a), C[1] + r * Math.sin(a)]);
    }
  }
  out.push(V[V.length - 1]);
  return out;
}

function genRacetrack(g) {
  const { turns, pitch, rOuter, aspect, cornerR, ppt } = g;
  const W0 = 2 * rOuter, H0 = 2 * rOuter * clamp(aspect, 0.1, 1);
  const N = Math.max(16, Math.round(turns * ppt));
  const path = new Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const t = i / ppt;
    const d = pitch * t;
    const w = W0 / 2 - d, h = H0 / 2 - d;
    if (w <= pitch * 0.25 || h <= pitch * 0.25) { path.length = i; break; }
    const rc = Math.max(0, Math.min(cornerR - d, w, h));    // offsetting shrinks the corner radius by d
    path[i] = roundRectPoint(w, h, rc, (i % ppt) / ppt);
  }
  const base = [];
  for (let i = 0; i < 256; i++) base.push(roundRectPoint(W0 / 2, H0 / 2, Math.min(cornerR, W0 / 2, H0 / 2), i / 256));
  return {
    path, base,
    maxTurns: Math.min(W0 / 2, H0 / 2) / pitch,
    minClearance: pitch,
    turnsUsed: (path.length - 1) / ppt,
  };
}

/* Point at perimeter fraction u on an axis-aligned rounded rectangle of
   half-width w, half-height h, corner radius r. Travels counter-clockwise
   from the middle of the right-hand flat.                                   */
export function roundRectPoint(w, h, r, u) {
  r = clamp(r, 0, Math.min(w, h));
  const sx = 2 * (w - r), sy = 2 * (h - r), ar = Math.PI * r / 2;
  const P = 2 * sx + 2 * sy + 4 * ar;
  const arc = (cx, cy, a0) => { const a = a0 + (s / (ar || 1)) * (Math.PI / 2); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const hy = sy / 2;
  let s = u * P;
  if (s < hy) return [w, s];                                // upper half of right flat
  s -= hy;
  if (s < ar) return arc(w - r, h - r, 0);                  // top-right
  s -= ar;
  if (s < sx) return [w - r - s, h];                        // top flat, -x
  s -= sx;
  if (s < ar) return arc(-w + r, h - r, Math.PI / 2);       // top-left
  s -= ar;
  if (s < sy) return [-w, h - r - s];                       // left flat, -y
  s -= sy;
  if (s < ar) return arc(-w + r, -h + r, Math.PI);          // bottom-left
  s -= ar;
  if (s < sx) return [-w + r + s, -h];                      // bottom flat, +x
  s -= sx;
  if (s < ar) return arc(w - r, -h + r, 3 * Math.PI / 2);   // bottom-right
  s -= ar;
  return [w, -hy + s];                                      // lower half of right flat
}

/* Axial-flux stator coil: annular sector walked inward.
   Two limits bind: the radial depth (rO−rI)/2, and the tangential width at
   the inner arc, which runs out when d = rI·sin(α/2)/(1−sin(α/2)).          */
function genWedge(g) {
  const { turns, pitch, rOuter, rInner, spanDeg, ppt } = g;
  const alpha = spanDeg * Math.PI / 180;
  const sh = Math.sin(clamp(alpha / 2, 0, Math.PI / 2 - 1e-4));
  const dRadial = (rOuter - rInner) / 2;
  const dTangential = sh < 0.999 ? rInner * sh / (1 - sh) : dRadial;
  const dMax = Math.max(0, Math.min(dRadial, dTangential) - pitch * 0.35);
  const maxTurns = dMax / pitch;
  const useTurns = Math.max(1, Math.min(Math.round(turns), Math.floor(maxTurns)));
  const N = Math.max(24, Math.round(useTurns * ppt));
  const path = new Array(N + 1);
  const contour = (d, u) => {
    const ro = rOuter - d, ri = rInner + d;
    if (ro <= ri + 1e-6) return null;
    const half = (r) => Math.max(1e-4, alpha / 2 - Math.asin(clamp(d / Math.max(r, 1e-6), -0.999, 0.999)));
    const lo = ro * 2 * half(ro), li = ri * 2 * half(ri), side = ro - ri;
    const P = lo + li + 2 * side;
    // starts at the mid-point of the outer arc, on the coil's symmetry axis
    let s = u * P;
    if (s < lo / 2) {                   // outer arc, 0 → −φ
      const ha = half(ro), a = -(s / (lo / 2)) * ha;
      return [ro * Math.cos(a), ro * Math.sin(a)];
    }
    s -= lo / 2;
    if (s < side) {                     // flank inward at −φ
      const r = ro - s, a = -half(r);
      return [r * Math.cos(a), r * Math.sin(a)];
    }
    s -= side;
    if (s < li) {                       // inner arc, −φ → +φ
      const ha = half(ri), a = -ha + (s / li) * 2 * ha;
      return [ri * Math.cos(a), ri * Math.sin(a)];
    }
    s -= li;
    if (s < side) {                     // flank outward at +φ
      const r = ri + s, a = half(r);
      return [r * Math.cos(a), r * Math.sin(a)];
    }
    s -= side;
    { const ha = half(ro), a = ha - (s / (lo / 2)) * ha; return [ro * Math.cos(a), ro * Math.sin(a)]; }
  };
  let used = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / ppt;
    const p = contour(pitch * t, (i % ppt) / ppt);
    if (!p) break;
    path[i] = p; used = i;
  }
  path.length = used + 1;
  const base = [];
  for (let i = 0; i < 256; i++) { const p = contour(0, i / 256); if (p) base.push(p); }
  return { path, base, maxTurns, minClearance: pitch, turnsUsed: useTurns };
}

/* Gielis superformula contour. */
export function superContour(g, n = 512) {
  const { m, n1, n2, n3, sa, sb, rOuter } = g;
  const pts = [];
  let rmax = 0;
  for (let i = 0; i < n; i++) {
    const th = TAU * i / n;
    const t1 = Math.pow(Math.abs(Math.cos(m * th / 4) / sa), n2);
    const t2 = Math.pow(Math.abs(Math.sin(m * th / 4) / sb), n3);
    const r = Math.pow(t1 + t2, -1 / n1);
    if (!isFinite(r)) { pts.push([0, 0]); continue; }
    rmax = Math.max(rmax, r);
    pts.push([r * Math.cos(th), r * Math.sin(th)]);
  }
  const k = rOuter / (rmax || 1);
  return pts.map(p => [p[0] * k, p[1] * k]);
}

/* Generic contour → spiral by continuous clamped miter offset. */
function genOffsetSpiral(base0, g) {
  const { turns, pitch, ppt } = g;
  const M = clamp(Math.round(ppt * 1.5), 128, 720);
  const base = startOnPlusX(resampleClosed(base0, M));
  const basis = offsetBasis(base);
  const caps = offsetCaps(base, basis);
  const rough = Math.max(...base.map(p => Math.hypot(p[0], p[1])));
  const dMax = maxInwardOffset(base, basis, caps, rough);
  const maxTurns = dMax / pitch;
  const useTurns = Math.max(1, Math.min(Math.round(turns), Math.floor(maxTurns)));
  const N = Math.max(16, Math.round(useTurns * ppt));
  const path = new Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const d = pitch * (i / ppt);
    const fu = (i % ppt) / ppt * M;
    const i0 = Math.floor(fu) % M, i1 = (i0 + 1) % M, fr = fu - Math.floor(fu);
    const a = offsetVertex(base, basis, caps, i0, d);
    const b = offsetVertex(base, basis, caps, i1, d);
    path[i] = [a[0] + (b[0] - a[0]) * fr, a[1] + (b[1] - a[1]) * fr];
  }
  return { path, base, maxTurns, minClearance: pitch, turnsUsed: useTurns };
}

/* Rotate a closed contour so index 0 sits on the +X ray. Every generator
   starts and ends there, which is what lets a mirrored series layer land its
   via exactly on the previous layer's last point.                           */
export function startOnPlusX(pts) {
  const n = pts.length;
  let best = 0, bestA = Infinity;
  for (let i = 0; i < n; i++) {
    if (pts[i][0] <= 0) continue;
    const a = Math.abs(Math.atan2(pts[i][1], pts[i][0]));
    if (a < bestA) { bestA = a; best = i; }
  }
  const out = pts.slice(best).concat(pts.slice(0, best));
  out[0] = [Math.hypot(out[0][0], out[0][1]), 0];
  return out;
}

export function generateSpiral(g) {
  let r;
  switch (g.shape) {
    case 'circle':    r = genCircle(g); break;
    case 'log':       r = genLog(g); break;
    case 'polygon':   r = genPolygon(g); break;
    case 'racetrack': r = genRacetrack(g); break;
    case 'wedge':     r = genWedge(g); break;
    case 'super':     r = genOffsetSpiral(superContour(g), g); break;
    case 'custom':    r = genOffsetSpiral(g.customPoly && g.customPoly.length > 2 ? g.customPoly : superContour(g), g); break;
    default:          r = genCircle(g);
  }
  r.turnsUsed = r.turnsUsed != null ? r.turnsUsed : Math.min(g.turns, r.maxTurns);
  r.algorithm = ALGORITHMS[g.shape] || ALGORITHMS.circle;
  if (g.dir < 0) r.path = r.path.map(p => [p[0], -p[1]]);
  return r;
}

/* ---------------------------------------------------------------------------
   3.  STACK-UP — layers, direction, transition vias
   ------------------------------------------------------------------------ */

/* KiCad 8/9 default copper layer colours — instantly readable to a KiCad user */
export const KICAD_COLORS = ['#C83434', '#7FC64D', '#CC7FCC', '#4CC3BD', '#BC8455',
  '#70A2E8', '#42B8B8', '#C7C74C', '#DE8686', '#3EBF3E', '#B37DB3', '#5BB8CE',
  '#A87A54', '#6E7FD6', '#5FB89B', '#4D7FC4'];

export function layerNames(n) {
  if (n <= 1) return ['F.Cu'];
  const out = ['F.Cu'];
  for (let i = 1; i < n - 1; i++) out.push('In' + i + '.Cu');
  out.push('B.Cu');
  return out;
}

/* Build the full multi-layer winding: geometry, vias, terminals. */
export function buildCoil(cfg) {
  if (cfg.motorGeometry && cfg.shape !== 'wedge') return buildMotorCoil(cfg);
  const pitch = cfg.traceW + cfg.traceS;
  const g = {
    shape: cfg.shape, turns: cfg.turns, pitch,
    rOuter: cfg.dOuter / 2, rInner: cfg.dInner / 2,
    ppt: cfg.ppt, sides: cfg.sides, fillet: cfg.fillet,
    aspect: cfg.aspect, cornerR: cfg.cornerR,
    spanDeg: cfg.spanDeg, filletW: 0,
    m: cfg.sfM, n1: cfg.sfN1, n2: cfg.sfN2, n3: cfg.sfN3, sa: 1, sb: 1,
    customPoly: cfg.customPoly, dir: 1,
  };
  const spiral = generateSpiral(g);
  // Series stacking mirrors alternate layers about X, so both ends of the
  // spiral are pulled onto that axis and every via lands on a shared point.
  {
    const P = spiral.path, last = P.length - 1;
    if (last > 2 && Math.abs(P[0][1]) < pitch) P[0] = [P[0][0], 0];
    if (last > 2 && Math.abs(P[last][1]) < pitch) P[last] = [P[last][0], 0];
  }
  const nL = cfg.layers;
  const names = cfg.layerNames && cfg.layerNames.length === nL ? cfg.layerNames.slice() : layerNames(nL);
  const zPitch = nL > 1 ? cfg.boardT / (nL - 1) : cfg.boardT;   // mm between copper planes
  const layers = [];
  const vias = [];
  const links = [];                                   // short arcs onto the via
  const series = cfg.connection === 'series';

  for (let k = 0; k < nL; k++) {
    let pts = spiral.path;
    // Series stacking alternates the traversal direction, so the geometry is
    // mirrored as well — otherwise the reversed traversal would circulate the
    // current the wrong way and the layers would cancel instead of add.
    const reversed = series && (k % 2 === 1);
    if (reversed) pts = pts.slice().reverse().map(p => [p[0], -p[1]]);
    layers.push({
      index: k, name: names[k],
      color: KICAD_COLORS[k % KICAD_COLORS.length],
      z: nL === 1 ? 0 : -cfg.boardT / 2 + k * zPitch,
      pts, reversed,
    });
  }

  let linkLen = 0;
  if (series) {
    for (let k = 0; k < nL - 1; k++) {
      const a = layers[k], b = layers[k + 1];
      const pa = a.pts[a.pts.length - 1], pb = b.pts[0];
      vias.push({ x: pa[0], y: pa[1], from: k, to: k + 1, kind: (k % 2 === 0) ? 'inner' : 'outer' });
      // the mirror preserves radius, so the two ends are joined by a constant
      // radius arc on the arriving layer
      const arc = radialArc(pa, pb);
      if (arc.length > 1) { links.push({ layer: k + 1, pts: arc }); linkLen += polyLength(arc, false); }
    }
  } else if (nL > 1) {
    const s = layers[0].pts[0], e = layers[0].pts[layers[0].pts.length - 1];
    vias.push({ x: s[0], y: s[1], from: 0, to: nL - 1, kind: 'outer', stitch: true });
    vias.push({ x: e[0], y: e[1], from: 0, to: nL - 1, kind: 'inner', stitch: true });
  }

  /* Terminal breakouts. With an even layer count the chain ends where it
     began, on a different layer but the same (x, y) — so each end is fanned
     out to its own pad clear of the winding. An odd count leaves the second
     terminal at the centre, enclosed by its own turns.                      */
  const leads = [];
  const startPt = layers[0].pts[0];
  const endPt = layers[nL - 1].pts[layers[nL - 1].pts.length - 1];
  const rStart = Math.hypot(startPt[0], startPt[1]);
  const padS = cfg.padSize > 0 ? cfg.padSize : 1.2;
  const leadR = rStart + padS * 0.9 + cfg.traceS;
  const dAng = Math.asin(Math.min(0.99, (padS + cfg.traceS) / (2 * leadR)));
  // an odd layer count leaves the far end deep inside its own winding
  const enclosed = Math.hypot(endPt[0], endPt[1]) < rStart - pitch * 0.5;
  const fan = (p, dir) => {
    const r0 = Math.hypot(p[0], p[1]), a0 = Math.atan2(p[1], p[0]);
    const out = [];
    for (let i = 0; i <= 16; i++) {
      const f = i / 16, e = f * f * (3 - 2 * f);
      const r = r0 + (leadR - r0) * f, a = a0 + dir * dAng * e;
      out.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    return out;
  };
  let leadLen = 0;
  const leadA = fan(startPt, -1);
  leads.push({ layer: 0, pts: leadA, terminal: 0 });
  leadLen += polyLength(leadA, false);
  let padB = endPt;
  if (!enclosed) {
    const leadB = fan(endPt, +1);
    leads.push({ layer: nL - 1, pts: leadB, terminal: 1 });
    leadLen += polyLength(leadB, false);
    padB = leadB[leadB.length - 1];
  }
  const start = leadA[leadA.length - 1];
  const end = padB;
  const lenPerLayer = polyLength(spiral.path, false);

  // shape-aware outer / inner dimensions. Regular polygons are quoted across
  // the flats, which is the convention the closed-form expressions assume.
  const rMax = Math.max(...spiral.path.map(p => Math.hypot(p[0], p[1])));
  const rMin = innerRadiusOf(spiral.path);
  let dOutFlat = 2 * rMax, dInFlat = 2 * rMin;
  if (cfg.shape === 'polygon') {
    // the sampled path holds only corner vertices, so both radii are
    // circumradii — convert each to the across-flats convention
    const cf = Math.cos(Math.PI / Math.max(3, cfg.sides));
    dOutFlat = 2 * rMax * cf; dInFlat = 2 * rMin * cf;
  }
  if (cfg.shape === 'racetrack') {
    dOutFlat = cfg.dOuter * (1 + clamp(cfg.aspect, 0.1, 1)) / 2;
    dInFlat = Math.max(0, dOutFlat - 2 * pitch * spiral.turnsUsed);
  }

  return {
    spiral, layers, vias, links, leads, names, pitch, zPitch, enclosed,
    terminals: [start, end],
    lenPerLayer, linkLen, leadLen,
    lenTotal: lenPerLayer * nL + linkLen + leadLen,
    bbox: bboxOf(spiral.path),
    outerR: Math.max(rMax, leadR), innerR: rMin, dOutFlat, dInFlat,
  };
}

/* Fit a conventional spiral into one stator slot before rotating instances.
   Keep the local winding dimensions for the electrical solver; translate only
   geometry, otherwise a small circular coil would be analysed as a 60 mm coil. */
function buildMotorCoil(cfg) {
  const ro = cfg.dOuter / 2, ri = cfg.dInner / 2;
  const cx = (ro + ri) / 2;
  const half = clamp(cfg.spanDeg * Math.PI / 360, 0, Math.PI / 2);
  const radius = Math.min((ro - ri) / 2, cx * Math.sin(half)) - cfg.traceW / 2;
  const pitch = cfg.traceW + cfg.traceS;
  if (!(radius > pitch)) throw new Error('No room for this coil. Increase the ring depth or coil span, or reduce track width and clearance.');
  const aspect = clamp(cfg.aspect, 0.2, 1);
  // A stadium's bounding rectangle is inscribed in the available circle.
  const localR = cfg.shape === 'racetrack' ? radius / Math.sqrt(1 + aspect * aspect) : radius;
  const apothem = cfg.shape === 'polygon' ? localR * Math.cos(Math.PI / cfg.sides)
    : cfg.shape === 'racetrack' ? localR * aspect : localR;
  // Leave room for the inner transition via, including copper clearance.
  const maxTurns = Math.floor((apothem - cfg.viaPad / 2 - cfg.traceS - cfg.traceW / 2) / pitch);
  if (maxTurns < 1) throw new Error('No complete turn fits around the inner via. Increase the coil span or reduce the trace/via sizes.');
  const local = { ...cfg, motorGeometry: false, arrayEnabled: false,
    dOuter: localR * 2, turns: Math.min(maxTurns, Math.max(1, Math.floor(cfg.turns))),
    aspect, fillet: 0, cornerR: localR * aspect };
  const coil = buildCoil(local);
  const move = pts => pts.map(([x, y]) => [x + cx, y]);
  coil.spiral.path = move(coil.spiral.path);
  coil.spiral.base = move(coil.spiral.base);
  coil.spiral.maxTurns = maxTurns;
  for (const l of [...coil.layers, ...coil.links, ...coil.leads]) l.pts = move(l.pts);
  for (const v of coil.vias) v.x += cx;
  coil.terminals = move(coil.terminals);
  coil.bbox = bboxOf(coil.spiral.path);
  coil.outerR += cx;
  coil.motorCentre = cx;
  return coil;
}

/* Constant-radius arc between two points at (nearly) equal radius. */
export function radialArc(a, b) {
  const ra = Math.hypot(a[0], a[1]), rb = Math.hypot(b[0], b[1]);
  const aa = Math.atan2(a[1], a[0]);
  const ab = Math.atan2(b[1], b[0]);
  let d = ab - aa;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  if (Math.abs(d) < 1e-6 && Math.abs(ra - rb) < 1e-6) return [a];
  const steps = Math.max(2, Math.ceil(Math.abs(d) * 24 / Math.PI * 4));
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps, r = ra + (rb - ra) * f, th = aa + d * f;
    out.push([r * Math.cos(th), r * Math.sin(th)]);
  }
  return out;
}

export function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function innerRadiusOf(pts) {
  let m = Infinity;
  for (const p of pts) m = Math.min(m, Math.hypot(p[0], p[1]));
  return m;
}

/* ---------------------------------------------------------------------------
   4.  INDUCTANCE
   ------------------------------------------------------------------------ */

/* Resample a 3-D polyline (mm) into equal-length filaments (m). */
export function toFilaments(polys, targetLenMM, capSegments) {
  let total = 0;
  for (const poly of polys)
    for (let i = 1; i < poly.length; i++)
      total += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1], poly[i][2] - poly[i - 1][2]);
  let step = targetLenMM;
  if (total / step > capSegments) step = total / capSegments;
  const mx = [], my = [], mz = [], dx = [], dy = [], dz = [], ln = [];
  function push(x0, y0, z0, x1, y1, z1) {
    const ux = (x1 - x0) * 1e-3, uy = (y1 - y0) * 1e-3, uz = (z1 - z0) * 1e-3;
    const l = Math.hypot(ux, uy, uz);
    if (l < 1e-12) return;
    mx.push((x0 + x1) * 0.5e-3); my.push((y0 + y1) * 0.5e-3); mz.push((z0 + z1) * 0.5e-3);
    dx.push(ux); dy.push(uy); dz.push(uz); ln.push(l);
  }
  for (const poly of polys) {
    let carry = 0, acc = null;
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1], b = poly[i];
      const vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2];
      const L = Math.hypot(vx, vy, vz);
      if (L < 1e-12) continue;
      let s = 0;
      while (s < L) {
        const take = Math.min(step - carry, L - s);
        const p0 = [a[0] + vx * (s / L), a[1] + vy * (s / L), a[2] + vz * (s / L)];
        const p1 = [a[0] + vx * ((s + take) / L), a[1] + vy * ((s + take) / L), a[2] + vz * ((s + take) / L)];
        if (!acc) acc = { x0: p0[0], y0: p0[1], z0: p0[2] };
        carry += take; s += take;
        if (carry >= step - 1e-12) {
          push(acc.x0, acc.y0, acc.z0, p1[0], p1[1], p1[2]);
          acc = null; carry = 0;
        } else {
          acc.x1 = p1[0]; acc.y1 = p1[1]; acc.z1 = p1[2];
        }
      }
    }
    if (acc && acc.x1 !== undefined) push(acc.x0, acc.y0, acc.z0, acc.x1, acc.y1, acc.z1);
  }
  return {
    n: ln.length, totalLen: total * 1e-3,
    mx: Float64Array.from(mx), my: Float64Array.from(my), mz: Float64Array.from(mz),
    dx: Float64Array.from(dx), dy: Float64Array.from(dy), dz: Float64Array.from(dz),
    ln: Float64Array.from(ln),
  };
}

/* Self partial inductance of a straight bar, Grover/Rosa (SI, metres). */
export function barSelf(l, w, t) {
  const s = w + t;
  return (MU0 / TAU) * l * (Math.log(2 * l / s) + 0.5 + 0.2235 * s / l);
}

/* Deficit of the midpoint-discretised Neumann sum for a STRAIGHT run, per
   metre of conductor. Computed on the fly so the correction is exact for the
   segment length and cross-section actually in use.                          */
export function discretisationCorrection(segLen, w, t, m = 256) {
  const gmd = 0.2235 * (w + t);
  const g2 = gmd * gmd;
  const l = segLen;
  let sum = m * barSelf(l, w, t);
  const c = (MU0 / TAU) * l * l;
  for (let k = 1; k < m; k++) sum += (m - k) * c / Math.sqrt(k * k * l * l + g2);
  const exact = barSelf(m * l, w, t);
  return (exact - sum) / (m * l);          // H per metre of path
}

/* Numerical partial inductance of a filament set. */
export function inductanceOf(F, w, t, corrPerM) {
  const { n, mx, my, mz, dx, dy, dz, ln } = F;
  const gmd = 0.2235 * (w + t), g2 = gmd * gmd;
  let L = 0;
  for (let i = 0; i < n; i++) L += barSelf(ln[i], w, t);
  const c = MU0 / (4 * Math.PI);
  let M = 0;
  for (let i = 0; i < n; i++) {
    const xi = mx[i], yi = my[i], zi = mz[i], ax = dx[i], ay = dy[i], az = dz[i];
    let acc = 0;
    for (let j = i + 1; j < n; j++) {
      const dot = ax * dx[j] + ay * dy[j] + az * dz[j];
      if (dot === 0) continue;
      const rx = xi - mx[j], ry = yi - my[j], rz = zi - mz[j];
      acc += dot / Math.sqrt(rx * rx + ry * ry + rz * rz + g2);
    }
    M += acc;
  }
  L += 2 * c * M;
  return L + corrPerM * F.totalLen;
}

/* Mutual inductance between two filament sets (SI). */
export function mutualOf(A, B, gmd2) {
  const c = MU0 / (4 * Math.PI);
  let M = 0;
  for (let i = 0; i < A.n; i++) {
    const xi = A.mx[i], yi = A.my[i], zi = A.mz[i], ax = A.dx[i], ay = A.dy[i], az = A.dz[i];
    let acc = 0;
    for (let j = 0; j < B.n; j++) {
      const dot = ax * B.dx[j] + ay * B.dy[j] + az * B.dz[j];
      if (dot === 0) continue;
      const rx = xi - B.mx[j], ry = yi - B.my[j], rz = zi - B.mz[j];
      acc += dot / Math.sqrt(rx * rx + ry * ry + rz * rz + gmd2);
    }
    M += acc;
  }
  return c * M;          // full double sum over distinct sets — no factor 2
}

/* Mohan current-sheet closed form + modified Wheeler, single layer. */
const CS_COEF = {
  circle:    [1.00, 2.46, 0.00, 0.20],
  polygon4:  [1.27, 2.07, 0.18, 0.13],
  polygon6:  [1.09, 2.23, 0.00, 0.17],
  polygon8:  [1.07, 2.29, 0.00, 0.19],
};
const CS_SHAPES = ['circle', 'log', 'polygon', 'racetrack'];

export function currentSheetL(shape, sides, n, dOut, dIn) {
  if (!CS_SHAPES.includes(shape)) return null;
  let key = 'circle';
  if (shape === 'polygon') key = sides <= 4 ? 'polygon4' : (sides <= 6 ? 'polygon6' : (sides <= 10 ? 'polygon8' : 'circle'));
  else if (shape === 'racetrack') key = 'polygon4';
  const c = CS_COEF[key];
  if (!c || dOut <= dIn) return null;
  const dAvg = (dOut + dIn) / 2, rho = (dOut - dIn) / (dOut + dIn);
  if (rho <= 0.01) return null;
  return c[0] * MU0 * n * n * dAvg / 2 * (Math.log(c[1] / rho) + c[2] * rho + c[3] * rho * rho);
}

export function wheelerL(shape, sides, n, dOut, dIn) {
  if (!CS_SHAPES.includes(shape)) return null;
  const K = shape === 'polygon' && sides <= 4 ? [2.34, 2.75]
    : shape === 'polygon' && sides <= 6 ? [2.33, 3.82]
      : [2.25, 3.55];
  const dAvg = (dOut + dIn) / 2, rho = (dOut - dIn) / (dOut + dIn);
  if (rho <= 0.01) return null;
  return K[0] * MU0 * n * n * dAvg / (1 + K[1] * rho);
}

/* ---------------------------------------------------------------------------
   5.  LOSS, CAPACITANCE, RATINGS
   ------------------------------------------------------------------------ */

export function skinDepth(f, rho) { return Math.sqrt(rho / (Math.PI * Math.max(f, 1e-9) * MU0)); }

/* Dowell with a porosity correction — the standard planar-winding model. */
export function dowellFr(f, tCu, w, pitch, layersInField, rho) {
  const d = skinDepth(f, rho);
  const eta = clamp(w / pitch, 0.05, 1);
  const D = tCu * Math.sqrt(eta) / d;
  if (D < 1e-3) return 1;
  const m = Math.max(1, layersInField);
  const s2 = Math.sinh(2 * D), sn2 = Math.sin(2 * D), c2 = Math.cosh(2 * D), cs2 = Math.cos(2 * D);
  const A = (s2 + sn2) / Math.max(1e-12, c2 - cs2);
  const B = (Math.sinh(D) - Math.sin(D)) / Math.max(1e-12, Math.cosh(D) + Math.cos(D));
  const Fr = D * (A + (2 / 3) * (m * m - 1) * B);
  return Math.max(1, Fr);
}

/* IPC-2221 conductor current for a temperature rise. */
export function ipcCurrent(wMM, tMM, dT, external) {
  const A = (wMM / 0.0254) * (tMM / 0.0254);        // mil^2
  const k = external ? 0.048 : 0.024;
  return k * Math.pow(dT, 0.44) * Math.pow(A, 0.725);
}

export function ipcRise(I, wMM, tMM, external) {
  const A = (wMM / 0.0254) * (tMM / 0.0254);
  const k = external ? 0.048 : 0.024;
  const x = I / (k * Math.pow(A, 0.725));
  return Math.pow(Math.max(x, 0), 1 / 0.44);
}

/* ---------------------------------------------------------------------------
   6.  TOP-LEVEL ANALYSIS
   ------------------------------------------------------------------------ */

export function analyse(cfg, coil, opts = {}) {
  const nL = cfg.layers;
  const series = cfg.connection === 'series';
  const tCu = cfg.copperOz * OZ_MM;                 // mm
  const w = cfg.traceW, s = cfg.traceS, pitch = w + s;
  const rho = RHO_CU20 * (1 + ALPHA_CU * (cfg.tempC - 20));

  /* ---- geometry-derived scalars ---- */
  const turns = coil.spiral.turnsUsed;
  const lenLayer = coil.lenPerLayer * 1e-3;         // m
  const lenTotal = coil.lenTotal * 1e-3;            // m, links included
  const cuArea = w * tCu * 1e-6;                    // m^2 cross-section
  const cuVol = cuArea * lenTotal;
  const cuMass = cuVol * DENS_CU;

  /* ---- inductance ---- */
  const segTarget = clamp(pitch * 0.6, 0.12, 0.8);
  const corr = discretisationCorrection(segTarget * 1e-3, w * 1e-3, tCu * 1e-3);
  const cap = opts.segmentCap || 3600;

  const path3 = (layer) => layer.pts.map(p => [p[0], p[1], layer.z]);
  let Lnum = null, kCouple = null, Fone = null;

  const leadOf = (k, term) => {
    const l = coil.leads.find(x => x.layer === k && x.terminal === term);
    return l ? l.pts.map(p => [p[0], p[1], coil.layers[k].z]) : null;
  };
  if (series) {
    const polys = [];
    const la = leadOf(0, 0); if (la) polys.push(la.slice().reverse());
    for (let k = 0; k < nL; k++) {
      if (k > 0) {
        const a = coil.layers[k - 1], b = coil.layers[k];
        const pa = a.pts[a.pts.length - 1];
        polys.push([[pa[0], pa[1], a.z], [pa[0], pa[1], b.z]]);      // via barrel
        const lk = coil.links.find(l => l.layer === k);
        if (lk) polys.push(lk.pts.map(p => [p[0], p[1], b.z]));      // arrival arc
      }
      polys.push(path3(coil.layers[k]));
    }
    const lb = leadOf(nL - 1, 1); if (lb) polys.push(lb);
    const F = toFilaments(polys, segTarget, cap);
    Lnum = inductanceOf(F, w * 1e-3, tCu * 1e-3, corr);
    if (nL > 1) {
      const F1 = toFilaments([path3(coil.layers[0])], segTarget, Math.round(cap / nL));
      const L1 = inductanceOf(F1, w * 1e-3, tCu * 1e-3, corr);
      Fone = L1;
      const Mbar = (Lnum - nL * L1) / (nL * (nL - 1));
      kCouple = clamp(Mbar / L1, -1, 1);
    }
  } else {
    const F1 = toFilaments([path3(coil.layers[0])], segTarget, Math.round(cap / Math.max(1, nL)));
    const L1 = inductanceOf(F1, w * 1e-3, tCu * 1e-3, corr);
    Fone = L1;
    if (nL > 1) {
      const polys = [];
      for (let k = 0; k < nL; k++) polys.push(path3(coil.layers[k]));
      const Fall = toFilaments(polys, segTarget, cap);
      const Lall = inductanceOf(Fall, w * 1e-3, tCu * 1e-3, corr);
      const Mbar = (Lall - nL * L1) / (nL * (nL - 1));
      kCouple = clamp(Mbar / L1, -1, 1);
      Lnum = (L1 + (nL - 1) * Mbar) / nL;
    } else Lnum = L1;
  }

  const dOutEff = coil.dOutFlat * 1e-3, dInEff = coil.dInFlat * 1e-3;
  const Lcs = currentSheetL(cfg.shape, cfg.sides, turns, dOutEff, dInEff);
  const Lwh = wheelerL(cfg.shape, cfg.sides, turns, dOutEff, dInEff);
  const Lsingle = Fone != null ? Fone : Lnum;

  /* ---- resistance ---- */
  const Rlayer = rho * lenLayer / cuArea;
  const viaR = viaResistance(cfg) * coil.vias.length;
  const Rdc = series
    ? rho * lenTotal / cuArea + viaR
    : Rlayer / nL + viaR;

  const fOp = cfg.freq;
  const layersInField = nL;
  const Fr = dowellFr(fOp, tCu * 1e-3, w * 1e-3, pitch * 1e-3, layersInField, rho);
  const Rac = Rdc * Fr;
  const delta = skinDepth(fOp, rho) * 1e3;          // mm

  /* ---- capacitance & SRF ---- */
  const epsR = cfg.epsR;
  const hDiel = nL > 1 ? cfg.boardT / (nL - 1) : cfg.boardT;   // mm
  let Cinter = 0;
  if (nL > 1) {
    const Aov = w * 1e-3 * lenLayer;                            // m^2 overlap
    const Cpair = EPS0 * epsR * Aov / (hDiel * 1e-3);
    Cinter = series ? Cpair / (3 * Math.max(1, nL - 1)) : 0;
  }
  const epsEff = (1 + epsR) / 2;
  const Ctt = EPS0 * epsEff * ((tCu / s) + (2 / Math.PI) * Math.log(1 + 2 * w / s)) * lenLayer;
  const Cturn = turns > 1 ? Ctt / (turns * turns) * (turns - 1) : 0;
  const Ctot = Math.max(1e-15, Cinter + Cturn + cfg.cExtra * 1e-12);
  const srf = 1 / (TAU * Math.sqrt(Math.max(Lnum, 1e-15) * Ctot));

  /* ---- Q ---- */
  const wOp = TAU * fOp;
  const detune = 1 - Math.pow(fOp / srf, 2);
  const Leff = Lnum / (Math.abs(detune) < 1e-3 ? 1e-3 : detune);
  const Q = wOp * Lnum / Rac * detune;

  /* ---- current & thermal ---- */
  const external = nL <= 2;
  const I10 = ipcCurrent(w, tCu, 10, external);
  const I20 = ipcCurrent(w, tCu, 20, external);
  const I40 = ipcCurrent(w, tCu, 40, external);
  const Iop = cfg.current;
  const rise = ipcRise(Iop, w, tCu, external);
  const Ploss = Iop * Iop * Rac;

  /* ---- fill / DRC ---- */
  const boardArea = Math.PI * Math.pow(coil.outerR * 1e-3, 2);
  const cuAreaPlan = w * 1e-3 * lenLayer;
  const fill = cuAreaPlan / boardArea;
  const drc = {
    enclosed: coil.enclosed,
    minClearance: coil.spiral.minClearance,
    clearanceOK: coil.spiral.minClearance >= s - 1e-9,
    turnsOK: cfg.turns <= coil.spiral.maxTurns + 1e-6,
    maxTurns: coil.spiral.maxTurns,
  };

  return {
    turns, nL, series, tCu, pitch, rho, delta,
    lenLayer, lenTotal, cuVol, cuMass, cuArea, fill,
    L: Lnum, Lsingle, Lcs, Lwh, k: kCouple,
    Rdc, Rac, Fr, viaR,
    Cinter, Cturn, Ctot, srf, Q, Leff,
    I10, I20, I40, rise, Ploss, Iop,
    dOutEff: dOutEff * 1e3, dInEff: dInEff * 1e3,
    drc, segments: cap,
  };
}

export function viaResistance(cfg) {
  const h = cfg.boardT * 1e-3;
  const d = cfg.viaDrill * 1e-3;
  const pl = 25e-6;                                  // 25 um plating
  const A = Math.PI * d * pl;
  return RHO_CU20 * h / A;
}

/* Frequency sweep for the Q / |Z| plots. */
export function sweep(cfg, a, f0, f1, n) {
  const out = [];
  const rho = a.rho, tCu = a.tCu * 1e-3, w = cfg.traceW * 1e-3, pitch = a.pitch * 1e-3;
  for (let i = 0; i < n; i++) {
    const f = f0 * Math.pow(f1 / f0, i / (n - 1));
    const Fr = dowellFr(f, tCu, w, pitch, a.nL, rho);
    const R = a.Rdc * Fr;
    const wf = TAU * f;
    // series RL in parallel with C
    const zr = R, zi = wf * a.L;
    const yc = wf * a.Ctot;
    const den = Math.pow(1 - wf * wf * a.L * a.Ctot, 2) + Math.pow(R * yc, 2);
    const Zr = zr / den;
    const Zi = (zi * (1 - wf * wf * a.L * a.Ctot) - R * R * yc) / den;
    const mag = Math.hypot(Zr, Zi);
    const Qv = Zr > 0 ? Zi / Zr : 0;
    out.push({ f, R, Fr, Z: mag, Q: Qv, Ls: zi / wf });
  }
  return out;
}

/* ---------------------------------------------------------------------------
   7.  INVERSE DESIGN — turns for a target inductance
   ------------------------------------------------------------------------ */

/* Inductance is NOT a smooth function of fractional turns, and a bisection on
   the turn count quietly gives the wrong answer because of it. A spiral that
   stops three-quarters of the way round ends at an arbitrary angle: the lead
   breakout swings to a different side, the terminal may or may not end up
   enclosed by its own turns, and the transition via lands somewhere else on
   the layer below. L can jump 30 % between 1.70 and 1.75 turns and then fall
   again. There is no monotonic curve there to bisect.

   Whole turns do behave. So the search is two stages, and both are over
   quantities that are actually monotonic:

     1. Integer turns. Sweep upward at the largest permitted diameter until
        the inductance passes the target. Real spirals have whole turns anyway
        -- a partial turn is an asymmetric coil with a lead coming off the
        wrong side.
     2. Outer diameter. At that fixed turn count, L rises smoothly with size,
        so a bisection on diameter lands the target exactly.

   The result is a coil you would have drawn by hand: n whole turns, sized to
   fit.                                                                       */
export function solveCoilForL(cfg, targetL, opts = {}) {
  const tol = opts.tol || 0.005;
  const dMax = opts.dMax || cfg.dOuter;
  const dMin = opts.dMin || Math.max(dMax * 0.25, (cfg.traceW + cfg.traceS) * 6);
  const innerRatio = cfg.dOuter > 0 ? clamp(cfg.dInner / cfg.dOuter, 0.05, 0.9) : 0.35;
  const coarseCap = opts.coarseCap || 700;
  const fineCap = opts.segmentCap || 1600;
  const maxTurnsAllowed = opts.maxTurns || 40;

  const evaluate = (turns, dOuter, cap) => {
    const trial = { ...cfg, turns, dOuter, dInner: dOuter * innerRatio };
    const coil = buildCoil(trial);
    const a = analyse(trial, coil, { segmentCap: cap });
    return { turns: coil.spiral.turnsUsed, dOuter, L: a.L, coil, a, cfg: trial };
  };

  // --- stage 1: fewest whole turns that reach the target at full size ----
  let chosen = null;
  let ceiling = maxTurnsAllowed;
  let last = null;
  for (let n = 1; n <= Math.min(maxTurnsAllowed, Math.ceil(ceiling)); n++) {
    const res = evaluate(n, dMax, coarseCap);
    ceiling = Math.min(ceiling, res.coil.spiral.maxTurns);
    last = res;
    if (res.L >= targetL) { chosen = res; break; }
    if (n >= ceiling) break;
  }

  if (!chosen) {
    // Even the largest coil that fits cannot reach the target.
    const fine = last ? evaluate(Math.max(1, Math.floor(ceiling)), dMax, fineCap) : null;
    return {
      ...(fine || last),
      converged: false, saturated: true, maxTurns: ceiling,
      reason: `A ${dMax.toFixed(1)} mm coil tops out near `
        + `${(((fine || last).L) * 1e9).toFixed(1)} nH at ${Math.floor(ceiling)} turns.`,
    };
  }

  if (chosen.turns <= 1.001 && chosen.L > targetL * (1 + tol)) {
    // One turn already overshoots; shrink the diameter to suit.
    const small = bisectDiameter(evaluate, targetL, 1, dMin * 0.4, dMax, tol, fineCap);
    return { ...small, converged: Math.abs(small.L / targetL - 1) < tol * 3, floor: true };
  }

  // --- stage 2: shrink the diameter until L lands on the target -----------
  const lowEnd = Math.max(dMin, (cfg.traceW + cfg.traceS) * (2 * chosen.turns + 2));
  const res = bisectDiameter(evaluate, targetL, chosen.turns, lowEnd, dMax, tol, fineCap);
  return { ...res, converged: Math.abs(res.L / targetL - 1) < tol * 3, maxTurns: ceiling };
}

function bisectDiameter(evaluate, targetL, turns, dLo, dHi, tol, cap) {
  let lo = dLo, hi = dHi;
  const atLo = evaluate(turns, lo, cap);
  if (atLo.L >= targetL) return atLo;      // cannot get smaller and still fit
  let best = evaluate(turns, hi, cap);
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    const r = evaluate(turns, mid, cap);
    if (Math.abs(r.L - targetL) < Math.abs(best.L - targetL)) best = r;
    if (Math.abs(r.L / targetL - 1) < tol) return r;
    if (r.L < targetL) lo = mid; else hi = mid;
    if (hi - lo < 1e-3) break;
  }
  return best;
}

/* Kept for callers that only want a turn count at a fixed diameter. */
export function solveTurnsForL(cfg, targetL, opts = {}) {
  return solveCoilForL(cfg, targetL, { ...opts, dMax: cfg.dOuter, dMin: cfg.dOuter });
}

/* ---------------------------------------------------------------------------
   8.  AXIAL-FLUX MOTOR MODEL
   ------------------------------------------------------------------------ */

export function motorAnalysis(cfg, coil, a) {
  const p = Math.max(1, cfg.polePairs);
  const arrayed = cfg.arrayEnabled && (cfg.shape === 'wedge' || cfg.motorGeometry);
  const phases = arrayed ? cfg.phases : 1;
  const coilsTotal = arrayed ? Math.max(1, cfg.coilCount) : 1;
  const coilsPerPhase = coilsTotal / phases;
  const rO = cfg.dOuter / 2e3, rI = Math.max(coil.innerR / 1e3, 1e-4);
  const rOa = rO, rIa = arrayed ? cfg.dInner / 2e3 : rI;

  const alpha = (arrayed ? cfg.spanDeg : 360 / Math.max(coilsTotal, 2 * p)) * Math.PI / 180;
  const kp = Math.abs(Math.sin(clamp(p * alpha / 2, -Math.PI * 1.5, Math.PI * 1.5)));
  const kw = clamp(kp, 0.05, 1);

  const Apole = Math.PI * (rOa * rOa - rIa * rIa) / (2 * p);
  const Bpk = cfg.bGap;
  const flux = (2 / Math.PI) * Bpk * Apole;                 // Wb per pole, sinusoidal

  const seriesCoils = cfg.coilSeries ? coilsPerPhase : 1;
  const Nseries = a.turns * (a.series ? a.nL : 1) * seriesCoils;
  const lambda = Nseries * kw * flux;                       // Wb-turn per phase

  const Kt = 1.5 * p * lambda;                              // N.m per A(peak)
  const KeMech = p * lambda;                                // V per (rad/s), peak LN
  const Kv = KeMech > 0 ? 60 / (TAU * KeMech) : Infinity;   // rpm/V

  const RphaseCoil = a.Rdc;
  const Rphase = cfg.coilSeries ? RphaseCoil * coilsPerPhase : RphaseCoil / coilsPerPhase;
  const Lphase = cfg.coilSeries ? a.L * coilsPerPhase : a.L / coilsPerPhase;

  const Ipk = cfg.current;
  const torque = Kt * Ipk;
  const Pcu = 1.5 * Ipk * Ipk * Rphase;
  const km = Kt / Math.sqrt(1.5 * Rphase);                  // N.m per sqrt(W)
  const rpm = cfg.rpm;
  const fElec = p * rpm / 60;
  const omega = TAU * rpm / 60;
  const Pmech = torque * omega;
  const eff = Pmech + Pcu > 0 ? Pmech / (Pmech + Pcu) : 0;
  const Vbemf = KeMech * omega;
  const tauE = Lphase / Math.max(Rphase, 1e-9);

  // torque-speed at a supply voltage
  const Vdc = cfg.vdc;
  const noLoad = KeMech > 0 ? (Vdc / Math.SQRT2) / KeMech * 60 / TAU : 0;
  const stall = KeMech > 0 ? Kt * (Vdc / Math.SQRT2) / Rphase : 0;

  return {
    p, phases, coilsTotal, coilsPerPhase, kw, alpha: alpha * 180 / Math.PI,
    Apole, flux, Nseries, lambda, Kt, KeMech, Kv, Rphase, Lphase,
    torque, Pcu, km, fElec, Pmech, eff, Vbemf, tauE, noLoad, stall,
    srfMargin: a.srf / Math.max(fElec, 1e-9),
    rOa: rOa * 1e3, rIa: rIa * 1e3,
  };
}

/* Torque–speed locus at a fixed bus voltage, for the motor chart. */
export function motorCurve(m, n = 64) {
  const out = [];
  if (!(m.noLoad > 0) || !(m.stall > 0)) return out;
  for (let i = 0; i < n; i++) {
    const rpm = m.noLoad * i / (n - 1);
    const torque = m.stall * (1 - rpm / m.noLoad);
    const omega = TAU * rpm / 60;
    const Pmech = torque * omega;
    const I = m.Kt > 0 ? torque / m.Kt : 0;
    const Pcu = 1.5 * I * I * m.Rphase;
    out.push({ rpm, torque, Pmech, Pcu, eff: Pmech + Pcu > 0 ? Pmech / (Pmech + Pcu) : 0 });
  }
  return out;
}
