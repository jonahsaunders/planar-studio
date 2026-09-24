/* Experimental, quasi-static PCB Litz model.
 *
 * All strands are connected ONLY at their two terminals. Each path contributes
 * its own resistance and partial inductance; a coupled impedance solve finds
 * the terminal current and the (generally complex) strand currents. There is no
 * empirical "Litz improvement" factor and no fit to the reference paper.
 *
 * Proximity loss uses the external field of the routed paths and two independent
 * one-dimensional slab diffusion solutions. Their quadratic loss matrices are
 * positive semidefinite. This is an engineering estimate, not a rectangular
 * conductor/full-wave solution: edge crowding, field reaction, capacitance,
 * dielectric loss and terminal spreading resistance remain unresolved.
 */

import { C } from './complex.js';
import { MU0, RHO_CU20, ALPHA_CU, OZ_MM, TAU, toFilaments } from './coil.js';

const cache = new WeakMap();
const zeros = n => Array.from({ length: n }, () => new Array(n).fill(0));
const positive = (value, fallback) => Number.isFinite(+value) && +value > 0 ? +value : fallback;
const finite = (value, fallback) => Number.isFinite(+value) ? +value : fallback;

function material(cfg, geometry, opts) {
  const c = geometry.config || cfg;
  const width = positive(c.traceW, positive(cfg.traceW, 0.8)) * 1e-3;
  const thickness = positive(c.copperThicknessMM,
    positive(c.copperOz, positive(cfg.copperOz, 2)) * OZ_MM) * 1e-3;
  const plating = positive(cfg.litzViaPlating, positive(c.litzViaPlating, 25)) * 1e-6;
  const rho = RHO_CU20 * Math.max(0.05, 1 + ALPHA_CU * (finite(cfg.tempC, 20) - 20));
  const cap = Math.max(48, Math.min(768, Math.round(positive(opts.segmentCap, 128))));
  return { width, thickness, plating, rho, cap };
}

function traceLength(strand) {
  let length = 0;
  for (const section of strand.sections || []) {
    for (let i = 1; i < section.pts.length; i++) {
      const a = section.pts[i - 1], b = section.pts[i];
      length += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
  }
  return length * 1e-3;
}

function viaEnds(via, layers) {
  // Export layer names may be canonical top-to-bottom. Traversal indices carry
  // current direction independently, which matters for signed mutual L.
  const z1 = Number.isInteger(via.fromIndex) ? layers.get(via.fromIndex)
    : Number.isFinite(via.zFrom) ? via.zFrom : layers.get(via.from);
  const z2 = Number.isInteger(via.toIndex) ? layers.get(via.toIndex)
    : Number.isFinite(via.zTo) ? via.zTo : layers.get(via.to);
  if (!Number.isFinite(z1) || !Number.isFinite(z2)) throw new Error('Litz via is missing its physical layer span.');
  return [z1, z2];
}

function viaSpan(via, layers) {
  const [z1, z2] = viaEnds(via, layers);
  return Math.abs(z2 - z1) * 1e-3;
}

function segmentsOf(strand, layers, m) {
  const polys = [];
  for (const section of strand.sections || []) {
    const z = layers.get(section.layer);
    if (!Number.isFinite(z)) throw new Error(`Unknown Litz copper layer: ${section.layer}`);
    polys.push(section.pts.map(p => [p[0], p[1], z]));
  }
  for (const via of strand.vias || []) {
    const [z1, z2] = viaEnds(via, layers);
    polys.push([[via.x, via.y, z1], [via.x, via.y, z2]]);
  }
  if (!polys.length && strand.path3?.length > 1) polys.push(strand.path3);
  let lengthMM = 0;
  for (const p of polys) for (let i = 1; i < p.length; i++) {
    lengthMM += Math.hypot(...p[i].map((v, k) => v - p[i - 1][k]));
  }
  if (!(lengthMM > 0)) throw new Error('Litz analysis requires nonzero continuous strand paths.');
  // Keep every section endpoint and every via. The cap bounds subdivision,
  // rather than silently removing short transitions from the electrical path.
  const F = toFilaments(polys, Math.max(0.05, lengthMM / m.cap), m.cap);
  const result = [];
  for (let i = 0; i < F.n; i++) {
    const l = F.ln[i], d = [F.dx[i], F.dy[i], F.dz[i]];
    const mid = [F.mx[i], F.my[i], F.mz[i]];
    const trace = Math.abs(d[2]) < 1e-12;
    result.push({ l, mid, u: d.map(v => v / l), a: mid.map((v, k) => v - d[k] / 2),
      b: mid.map((v, k) => v + d[k] / 2), trace,
      gmd: trace ? 0.2235 * (m.width + m.thickness) : 0.5 * (positive(strand.vias?.[0]?.drill, 0.3) * 1e-3 + m.plating) });
  }
  return result;
}

const GL_X = [-Math.sqrt(3 / 5), 0, Math.sqrt(3 / 5)];
const GL_W = [5 / 9, 8 / 9, 5 / 9];

// Integrate one finite source segment analytically, then use three-point
// Gaussian integration along the receiving segment. Symmetrisation preserves
// reciprocity. Softening is the conductor geometric-mean distance (GMD).
function integratePair(a, b, g2) {
  let sum = 0;
  for (let q = 0; q < 3; q++) {
    const t = GL_X[q] * a.l / 2;
    const rx = a.mid[0] + a.u[0] * t - b.a[0];
    const ry = a.mid[1] + a.u[1] * t - b.a[1];
    const rz = a.mid[2] + a.u[2] * t - b.a[2];
    const along = rx * b.u[0] + ry * b.u[1] + rz * b.u[2];
    const distance = Math.sqrt(Math.max(g2, rx * rx + ry * ry + rz * rz - along * along + g2));
    sum += GL_W[q] * (Math.asinh(along / distance) - Math.asinh((along - b.l) / distance));
  }
  return a.l * sum / 2;
}

function partialMutual(a, b) {
  const dot = a.u[0] * b.u[0] + a.u[1] * b.u[1] + a.u[2] * b.u[2];
  if (Math.abs(dot) < 1e-14) return 0;
  const g2 = a.gmd * b.gmd;
  const rx = a.mid[0] - b.mid[0], ry = a.mid[1] - b.mid[1], rz = a.mid[2] - b.mid[2];
  const r2 = rx * rx + ry * ry + rz * rz;
  // The midpoint Neumann rule is adequate for well-separated short segments.
  // Reserve the expensive finite-source integration for near interactions.
  if (r2 > 16 * Math.max(a.l * a.l, b.l * b.l)) {
    return MU0 / (4 * Math.PI) * dot * a.l * b.l / Math.sqrt(r2 + g2);
  }
  return MU0 / (8 * Math.PI) * dot * (integratePair(a, b, g2) + integratePair(b, a, g2));
}

function partialSelf(s) {
  const g = s.gmd, l = s.l;
  return MU0 / (2 * Math.PI) * (l * Math.asinh(l / g) - Math.hypot(l, g) + g);
}

// Jacobi eigenvalues are cheap for <=16 branches. Small quadrature errors must
// never create a negative-energy inductance. Any diagonal correction is exposed
// in the result instead of being hidden in the reported accuracy.
function minimumEigenvalue(matrix) {
  const a = matrix.map(r => r.slice()), n = a.length;
  for (let k = 0; k < n * n * 40; k++) {
    let p = 0, q = 0, largest = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (Math.abs(a[i][j]) > largest) { largest = Math.abs(a[i][j]); p = i; q = j; }
    }
    if (largest < 1e-16) break;
    const angle = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const c = Math.cos(angle), s = Math.sin(angle);
    const app = a[p][p], aqq = a[q][q], apq = a[p][q];
    for (let i = 0; i < n; i++) if (i !== p && i !== q) {
      const aip = a[i][p], aiq = a[i][q];
      a[i][p] = a[p][i] = c * aip - s * aiq;
      a[i][q] = a[q][i] = s * aip + c * aiq;
    }
    a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p][q] = a[q][p] = 0;
  }
  return Math.min(...a.map((r, i) => r[i]));
}

function fieldOf(source, point, soften2) {
  const rx = point[0] - source.a[0], ry = point[1] - source.a[1], rz = point[2] - source.a[2];
  const [ux, uy, uz] = source.u;
  const along = rx * ux + ry * uy + rz * uz;
  const perpendicular2 = Math.max(soften2, rx * rx + ry * ry + rz * rz - along * along + soften2);
  const end = along - source.l;
  const k = (along / Math.sqrt(perpendicular2 + along * along)
    - end / Math.sqrt(perpendicular2 + end * end)) / (4 * Math.PI * perpendicular2);
  return [(uy * rz - uz * ry) * k, (uz * rx - ux * rz) * k, (ux * ry - uy * rx) * k];
}

function prepare(cfg, geometry, opts) {
  if (!Array.isArray(geometry?.strands) || !geometry.strands.length || geometry.strands.length > 16) {
    throw new Error('Experimental Litz analysis supports 1–16 individually routed strands.');
  }
  const m = material(cfg, geometry, opts), key = JSON.stringify(m);
  const cached = cache.get(geometry);
  if (cached?.key === key) return cached.value;
  const layers = new Map((geometry.layers || []).flatMap((l, i) => [[l.name || l.layer || String(i), l.z], [i, l.z]]));
  const strands = geometry.strands.map(s => {
    const len = traceLength(s);
    let viaR = 0, viaLength = 0;
    for (const via of s.vias || []) {
      const span = viaSpan(via, layers), drill = positive(via.drill, positive(cfg.litzViaDrill, 0.3)) * 1e-3;
      // Finished hole plus copper plating forms an annulus, not a solid barrel.
      const area = Math.PI * m.plating * (drill + m.plating);
      viaLength += span;
      viaR += m.rho * span / area;
    }
    const F = segmentsOf(s, layers, m);
    const traceLen = len || F.filter(s => s.trace).reduce((a, s) => a + s.l, 0);
    return { id: s.id, bundle: s.bundle, traceLength: traceLen, viaLength,
      traceR: m.rho * traceLen / (m.width * m.thickness), viaR, F };
  });
  const n = strands.length, L = zeros(n), Pz = zeros(n), Pn = zeros(n);
  for (let i = 0; i < n; i++) {
    const A = strands[i].F;
    for (let a = 0; a < A.length; a++) {
      L[i][i] += partialSelf(A[a]);
      for (let b = a + 1; b < A.length; b++) L[i][i] += 2 * partialMutual(A[a], A[b]);
    }
    for (let j = i + 1; j < n; j++) {
      let mutual = 0;
      for (const a of A) for (const b of strands[j].F) mutual += partialMutual(a, b);
      L[i][j] = L[j][i] = mutual;
    }
  }
  const meanDiagonal = L.reduce((a, row, i) => a + row[i], 0) / n;
  const regularisationH = Math.max(0, Math.max(1e-15, meanDiagonal * 1e-9) - minimumEigenvalue(L));
  for (let i = 0; i < n; i++) L[i][i] += regularisationH;
  // Sample at most 64 trace locations per strand. All source trace/via segments
  // contribute. The exact copper length weights the quadrature, even when the
  // numerical paths have fewer points than the artwork.
  for (const target of strands) {
    const traceSegments = target.F.filter(s => s.trace);
    const total = traceSegments.reduce((a, s) => a + s.l, 0);
    const samples = Math.min(64, traceSegments.length);
    let index = 0, before = 0;
    for (let q = 0; q < samples; q++) {
      const position = total * (q + 0.5) / samples;
      while (index < traceSegments.length - 1 && before + traceSegments[index].l < position) before += traceSegments[index++].l;
      const s = traceSegments[index], offset = position - before;
      const point = s.a.map((v, k) => v + s.u[k] * offset);
      const hz = new Array(n).fill(0), hn = new Array(n).fill(0);
      for (let j = 0; j < n; j++) for (const source of strands[j].F) {
        if (source === s) continue; // transport skin effect is counted separately
        const H = fieldOf(source, point, source.gmd * source.gmd);
        hz[j] += H[2];
        hn[j] += -s.u[1] * H[0] + s.u[0] * H[1];
      }
      const weight = target.traceLength / samples;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        Pz[i][j] += weight * hz[i] * hz[j];
        Pn[i][j] += weight * hn[i] * hn[j];
      }
    }
  }
  const value = { ...m, strands, L, Pz, Pn, regularisationH,
    segmentCount: strands.reduce((a, s) => a + s.F.length, 0) };
  cache.set(geometry, { key, value });
  return value;
}

/** Isolated infinite foil carrying transport current; thickness and depth in m. */
export function foilSkinFactor(thickness, delta) {
  const D = thickness / delta;
  if (D < 1e-3) return 1 + D ** 4 / 180;
  if (D > 40) return D / 2;
  return Math.max(1, D / 2 * (Math.sinh(D) + Math.sin(D)) / (Math.cosh(D) - Math.cos(D)));
}

// Slab eddy power per length / |H_external|², with RMS fields. At low frequency
// this tends to omega² * mu0² * breadth * dimension³ / (12 rho).
function proximityCoefficient(dimension, breadth, delta, rho) {
  const D = dimension / delta;
  const ratio = D < 1e-3 ? D ** 3 / 6 : D > 40 ? 1
    : (Math.sinh(D) - Math.sin(D)) / (Math.cosh(D) + Math.cos(D));
  return 2 * rho * breadth / delta * ratio;
}

function solveComplex(matrix, rhs) {
  const n = rhs.length, a = matrix.map((r, i) => [...r.map(z => z.slice()), rhs[i].slice()]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (C.abs(a[i][k]) > C.abs(a[p][k])) p = i;
    if (!(C.abs(a[p][k]) > 1e-30)) throw new Error('Singular Litz impedance matrix. Check strand connectivity.');
    [a[p], a[k]] = [a[k], a[p]];
    for (let i = k + 1; i < n; i++) {
      const ratio = C.div(a[i][k], a[k][k]);
      for (let j = k + 1; j <= n; j++) a[i][j] = C.sub(a[i][j], C.mul(ratio, a[k][j]));
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = a[i][n];
    for (let j = i + 1; j < n; j++) sum = C.sub(sum, C.mul(a[i][j], x[j]));
    x[i] = C.div(sum, a[i][i]);
  }
  return x;
}

/** Parallel branches, including mutual inductance and reciprocal loss coupling.
 * R is in ohms, L in henries, f in Hz. Current phasors sum to 1 A RMS. */
export function solveLitzNetwork(R, L, f) {
  const w = TAU * Math.max(0, finite(f, 0));
  const matrix = R.map((row, i) => row.map((r, j) => [r, w * L[i][j]]));
  const currentsAtOneVolt = solveComplex(matrix, R.map(() => [1, 0]));
  const total = currentsAtOneVolt.reduce((a, i) => C.add(a, i), [0, 0]);
  const Z = C.inv(total), currents = currentsAtOneVolt.map(i => C.div(i, total));
  let energyL = 0, loss = 0;
  for (let i = 0; i < R.length; i++) for (let j = 0; j < R.length; j++) {
    const product = currents[i][0] * currents[j][0] + currents[i][1] * currents[j][1];
    energyL += L[i][j] * product;
    loss += R[i][j] * product;
  }
  return { Z, currents, L: w ? Z[1] / w : energyL, R: Z[0], copperLossPerAmp2: loss, energyL };
}

function atFrequency(model, frequency, capacitance, current) {
  const f = Math.max(0, finite(frequency, 0)), n = model.strands.length;
  const delta = f ? Math.sqrt(model.rho / (Math.PI * f * MU0)) : Infinity;
  const skin = foilSkinFactor(model.thickness, delta), viaSkin = foilSkinFactor(model.plating, delta);
  const cz = proximityCoefficient(model.width, model.thickness, delta, model.rho);
  const cn = proximityCoefficient(model.thickness, model.width, delta, model.rho);
  const R = zeros(n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    R[i][j] = cz * model.Pz[i][j] + cn * model.Pn[i][j];
    if (i === j) R[i][j] += model.strands[i].traceR * skin + model.strands[i].viaR * viaSkin;
  }
  const network = solveLitzNetwork(R, model.L, f);
  const Zterminal = capacitance > 0 ? C.inv(C.add(C.inv(network.Z), [0, TAU * f * capacitance])) : network.Z;
  const w = TAU * f;
  return { ...network, f, Rac: network.R, Zseries: network.Z, Z: C.abs(Zterminal), Zr: Zterminal[0], Zi: Zterminal[1],
    Ls: network.L, Leff: w ? Zterminal[1] / w : network.L,
    Q: Zterminal[0] > 0 ? Zterminal[1] / Zterminal[0] : 0,
    phase: C.arg(Zterminal) * 180 / Math.PI, delta: delta * 1e3, skinFactor: skin,
    Ploss: current * current * network.R, resistanceMatrix: R };
}

/** Geometry matrices are cached per immutable geometry object and material.
 * segmentCap limits subdivisions PER STRAND; section endpoints/vias survive. */
export function analyseLitz(cfg, geometry, opts = {}) {
  const model = prepare(cfg, geometry, opts);
  const capacitancePF = Math.max(0, finite(opts.capacitancePF, finite(cfg.cExtra, 0)));
  const Ctot = capacitancePF * 1e-12, current = Math.max(0, finite(cfg.current, 0));
  const dc = atFrequency(model, 0, 0, current);
  const ac = atFrequency(model, Math.max(0, finite(cfg.freq, 6.78e6)), Ctot, current);
  const currentShares = model.strands.map((s, i) => {
    const [re, im] = ac.currents[i], magnitude = Math.hypot(re, im);
    return { id: s.id, bundle: s.bundle, re, im, magnitude, percent: 100 * magnitude,
      phase: Math.atan2(im, re) * 180 / Math.PI, ampsRMS: magnitude * current,
      traceRdc: s.traceR, viaRdc: s.viaR, Rdc: s.traceR + s.viaR };
  });
  const viaR = model.strands.reduce((r, s, i) => r + s.viaR * C.abs(dc.currents[i]) ** 2, 0);
  const warnings = [];
  if (model.regularisationH > 1e-12) warnings.push('Inductance quadrature needed a passivity correction; increase segmentCap and compare convergence.');
  if (ac.f > 10e6) warnings.push('Above 10 MHz, omitted distributed capacitance and field reaction may dominate this quasi-static estimate.');
  const magnitudes = currentShares.map(s => s.magnitude);
  if (Math.max(...magnitudes) > 2 / magnitudes.length) warnings.push('One or more strands carry over twice the equal-share current; inspect branch imbalance.');
  if (Math.max(...magnitudes) > 2 * Math.min(...magnitudes)) warnings.push('Largest strand current exceeds twice the smallest; inspect branch imbalance.');
  const result = { ...ac, L: ac.L, Rdc: dc.R, Rac: ac.R, Fr: ac.R / dc.R,
    Iop: current, viaR, Ctot, Cinter: null, Cturn: null,
    srf: Ctot > 0 ? 1 / (TAU * Math.sqrt(ac.L * Ctot)) : Infinity,
    srfKnown: false, lumpedResonanceHz: Ctot > 0 ? 1 / (TAU * Math.sqrt(ac.L * Ctot)) : null,
    currentShares, currentImbalance: Math.max(...magnitudes) / Math.max(1e-30, Math.min(...magnitudes)),
    inductanceMatrix: model.L, couplingMatrix: model.L.map((row, i) => row.map((v, j) => v / Math.sqrt(model.L[i][i] * model.L[j][j]))),
    regularisationH: model.regularisationH, rho: model.rho, tCu: model.thickness * 1e3,
    lenTotal: model.strands.reduce((sum, s) => sum + s.traceLength + s.viaLength, 0),
    nL: geometry.layers.length, strands: model.strands.length, segments: model.segmentCount,
    method: 'Experimental coupled-strand partial inductance + foil skin and local-field slab proximity estimate',
    model: 'litz-quasistatic-v1', validated: false, warnings,
    limitations: [
      'Unvalidated engineering estimate; no calibration to the paper’s measured ESR or Q.',
      'Three-dimensional path partial inductance uses finite-segment quadrature and a conductor GMD; compare finer segmentCap values for convergence.',
      'Foil skin and two independent 1D slab proximity solutions omit rectangular demagnetizing fields, edge crowding, field reaction and via-pad crowding. MHz loss may be substantially underestimated and Q overestimated.',
      'Via resistance uses actual connected layer spans and the specified uniform copper plating; unused barrel stubs are not modeled.',
      'Intrinsic distributed capacitance and dielectric loss are omitted. Any finite resonance uses only the supplied lumped capacitance and is not a predicted self-resonant frequency.',
      'The two terminal buses are ideal equipotential connections; their finite resistance, inductance and spreading loss are omitted.',
      'Current is RMS winding-branch current; loss is I²R copper loss. Thermal ratings, coupled WPT efficiency and high-power performance are not predicted.',
    ] };
  Object.defineProperty(result, '_litzModel', { value: model });
  return result;
}

/** Reuses all geometry matrices; only the small branch network is solved. */
export function sweepLitz(cfg, analysis, fMin, fMax, count = 100) {
  if (!analysis?._litzModel) throw new Error('Litz sweep requires an analyseLitz result.');
  const op = positive(cfg.freq, 6.78e6);
  const low = positive(fMin, op / 10), high = positive(fMax, op * 2);
  if (high < low) throw new Error('Litz sweep maximum frequency must be at least the minimum.');
  const n = Math.max(2, Math.min(2000, Math.round(positive(count, 100))));
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = low * Math.pow(high / low, i / (n - 1));
    const a = atFrequency(analysis._litzModel, f, analysis.Ctot, Math.max(0, finite(cfg.current, 0)));
    out.push({ f, L: a.L, Ls: a.L, R: a.R, Rac: a.R, Fr: a.R / analysis.Rdc,
      Q: a.Q, Z: a.Z, Zr: a.Zr, Zi: a.Zi, phase: a.phase, Ploss: a.Ploss });
  }
  return out;
}
