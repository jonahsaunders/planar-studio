/* Experimental, quasi-static PCB Litz model.
 *
 * Conductive strand connections occur only at the terminal buses. Each path contributes
 * its own resistance and partial inductance; a coupled impedance solve finds
 * the terminal current and the (generally complex) strand currents. There is no
 * empirical "Litz improvement" factor and no fit to the reference paper.
 *
 * Proximity loss uses routed-path fields with either slab diffusion or a local
 * rectangular cross-section filament solve. Shared buses, barrel resistance and
 * an annular via-pad spreading estimate are included. Optional floating pair
 * capacitance and dielectric conductance connect interpolated winding voltages.
 * Loss and capacitance matrices preserve passivity; their approximations still
 * omit global field reaction, shielding and terminal-pad current crowding.
 * This is an unvalidated engineering model, not a full-wave solution.
 */

import { C } from './complex.js';
import { MU0, RHO_CU20, ALPHA_CU, OZ_MM, TAU, toFilaments } from './coil.js';
import { solvePassiveNetwork, stampPair } from './litz-network.js';
import { prepareLitzCapacitance } from './litz-capacitance.js';
import { rectangularProximityCoefficients } from './litz-impedance.js';

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
  const lossSamples = Math.max(16, Math.min(512, Math.round(positive(opts.lossSamples, positive(cfg.litzLossSamples, 64)))));
  const cells = cfg.litzCapacitanceMode === 'distributed' ? Math.max(2, Math.min(4, Math.round(positive(cfg.litzCapacitanceCells, 2)))) : 1;
  return { width, thickness, plating, rho, cap, lossSamples, cells,
    acModel: cfg.litzAcModel || 'slab', tanD: Math.max(0, Math.min(0.2, finite(cfg.litzTanD, 0.02))),
    capacitanceMode: cfg.litzCapacitanceMode || 'off', epsR: positive(cfg.epsR, 4.4),
    capacitanceSamples: Math.max(32, Math.min(512, Math.round(positive(cfg.litzCapacitanceSamples, 128)))) };
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
    let viaR = 0, viaLength = 0, padR = 0;
    for (const via of s.vias || []) {
      const span = viaSpan(via, layers), drill = positive(via.drill, positive(cfg.litzViaDrill, 0.3)) * 1e-3;
      // Finished hole plus copper plating forms an annulus, not a solid barrel.
      const area = Math.PI * m.plating * (drill + m.plating);
      viaLength += span;
      viaR += m.rho * span / area;
      const radiusOuter = positive(via.diameter, positive(cfg.litzViaDiameter, 0.6)) * 0.5e-3;
      const radiusInner = drill / 2 + m.plating;
      // Two radial annular sheets, one at each barrel connection. Real current
      // enters over a finite trace angle, so this full-annulus expression is a
      // lower-complexity spreading estimate, not a crowding correction fit.
      padR += 2 * m.rho / (TAU * m.thickness) * Math.max(0, Math.log(radiusOuter / radiusInner));
    }
    const F = segmentsOf(s, layers, m);
    const traceLen = len || F.filter(s => s.trace).reduce((a, s) => a + s.l, 0);
    return { id: s.id, bundle: s.bundle, traceLength: traceLen, viaLength,
      traceR: m.rho * traceLen / (m.width * m.thickness), viaR, padR, F };
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
  // Independently controlled trace-field samples. All source trace/via segments
  // contribute. The exact copper length weights the quadrature, even when the
  // numerical paths have fewer points than the artwork.
  for (const target of strands) {
    const traceSegments = target.F.filter(s => s.trace);
    const total = traceSegments.reduce((a, s) => a + s.l, 0);
    const samples = m.lossSamples;
    // Bias sample density toward corners and via landings while preserving
    // physical-length integration weights. This is feature-aware quadrature;
    // only a resolution comparison can establish its numerical convergence.
    const factors = traceSegments.map((s, i) => {
      const prev = traceSegments[Math.max(0, i - 1)], next = traceSegments[Math.min(traceSegments.length - 1, i + 1)];
      const bend = 1 - Math.min(1, Math.abs(prev.u[0] * next.u[0] + prev.u[1] * next.u[1]));
      const nearVia = target.F.some(v => !v.trace && Math.hypot(s.mid[0] - v.mid[0], s.mid[1] - v.mid[1]) < 2 * m.width + s.l / 2);
      return 1 + Math.min(2, 8 * bend) + (nearVia ? 2 : 0);
    });
    const importanceLength = traceSegments.reduce((sum, s, i) => sum + s.l * factors[i], 0);
    const locations = [];
    let index = 0, before = 0;
    for (let q = 0; q < samples; q++) {
      const position = importanceLength * (q + 0.5) / samples;
      while (index < traceSegments.length - 1 && before + traceSegments[index].l * factors[index] < position) before += traceSegments[index].l * factors[index++];
      locations.push({ s: traceSegments[index], offset: (position - before) / factors[index], weight: importanceLength / samples / factors[index] });
    }
    const weightTotal = locations.reduce((sum, q) => sum + q.weight, 0);
    for (const { s, offset, weight: rawWeight } of locations) {
      const point = s.a.map((v, k) => v + s.u[k] * offset);
      const hz = new Array(n).fill(0), hn = new Array(n).fill(0);
      for (let j = 0; j < n; j++) for (const source of strands[j].F) {
        if (source === s) continue; // transport skin effect is counted separately
        const H = fieldOf(source, point, source.gmd * source.gmd);
        hz[j] += H[2];
        hn[j] += -s.u[1] * H[0] + s.u[0] * H[1];
      }
      const weight = rawWeight * target.traceLength / weightTotal;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        Pz[i][j] += weight * hz[i] * hz[j];
        Pn[i][j] += weight * hn[i] * hn[j];
      }
    }
  }
  const value = { ...m, strands, L, Pz, Pn, regularisationH,
    segmentCount: strands.reduce((a, s) => a + s.F.length, 0) };
  value.network = preparePhysicalNetwork(cfg, geometry, value);
  cache.set(geometry, { key, value });
  return value;
}

function preparePhysicalNetwork(cfg, geometry, model) {
  const nodes = new Map(), node = key => {
    if (!nodes.has(key)) nodes.set(key, nodes.size);
    return nodes.get(key);
  };
  const pointNode = (layer, p) => node(`${layer}:${p[0].toFixed(6)},${p[1].toFixed(6)}`);
  const layers = geometry.layers || [], layerZ = new Map(layers.map(l => [l.name, l.z * 1e-3]));
  const busTracks = (geometry.art?.tracks || []).filter(t => t.role === 'terminal-bus');
  const pads = (geometry.art?.pads || []).filter(p => p.role === 'terminal-bus' && p.drill);
  const explicitBuses = busTracks.length > 0 && pads.length === 2;
  let inputNode, outputNode;
  if (explicitBuses) {
    const input = pads.find(p => p.terminalGroup === 'start') || pads[0];
    const output = pads.find(p => p.terminalGroup === 'end') || pads[1];
    inputNode = pointNode(layers[0].name, [input.x, input.y]);
    outputNode = pointNode(layers[0].name, [output.x, output.y]);
  } else { inputNode = node('port:start'); outputNode = node('port:end'); }
  const branches = [], strandNodes = [], bus = [];
  for (let strand = 0; strand < model.strands.length; strand++) {
    const s = geometry.strands[strand], first = s.sections[0], last = s.sections.at(-1);
    const contacts = [explicitBuses ? pointNode(first.layer, first.pts[0]) : inputNode];
    for (let k = 1; k < model.cells; k++) contacts.push(node(`strand:${strand}:${k}`));
    contacts.push(explicitBuses ? pointNode(last.layer, last.pts.at(-1)) : outputNode);
    strandNodes.push(contacts);
    for (let cell = 0; cell < model.cells; cell++) branches.push({ a: contacts[cell], b: contacts[cell + 1], type: 'winding', strand, cell });
  }
  const addBus = (a, b, start, end, width, resistance, type) => {
    const d = end.map((v, k) => v - start[k]), length = Math.hypot(...d);
    if (!(length > 1e-12)) return;
    const segment = { a: start, b: end, mid: start.map((v, k) => (v + end[k]) / 2),
      l: length, u: d.map(v => v / length), gmd: 0.2235 * (width + model.thickness) };
    branches.push({ a, b, type, busIndex: bus.length });
    bus.push({ resistance, segment, type, width });
  };
  if (explicitBuses) {
    for (const t of busTracks) {
      const taps = t.contacts?.length ? t.contacts : t.pts;
      for (let k = 1; k < taps.length; k++) {
      const a = taps[k - 1], b = taps[k], width = t.width * 1e-3;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]) * 1e-3;
      addBus(pointNode(t.layer, a), pointNode(t.layer, b), [a[0] * 1e-3, a[1] * 1e-3, layerZ.get(t.layer)],
        [b[0] * 1e-3, b[1] * 1e-3, layerZ.get(t.layer)], width, model.rho * length / (width * model.thickness), 'terminal-bus');
      }
    }
    for (const pad of pads) for (let k = 1; k < layers.length; k++) {
      const p = [pad.x, pad.y], start = [pad.x * 1e-3, pad.y * 1e-3, layers[k - 1].z * 1e-3];
      const end = [pad.x * 1e-3, pad.y * 1e-3, layers[k].z * 1e-3];
      const drill = pad.drill * 1e-3, area = Math.PI * model.plating * (drill + model.plating);
      addBus(pointNode(layers[k - 1].name, p), pointNode(layers[k].name, p), start, end, drill,
        model.rho * Math.abs(end[2] - start[2]) / area, 'terminal-barrel');
    }
  }
  const baseCount = model.strands.length + bus.length, baseL = zeros(baseCount);
  for (let i = 0; i < model.strands.length; i++) for (let j = 0; j < model.strands.length; j++) baseL[i][j] = model.L[i][j];
  for (let i = 0; i < bus.length; i++) {
    const k = model.strands.length + i;
    baseL[k][k] = partialSelf(bus[i].segment);
    for (let j = 0; j < model.strands.length; j++) {
      let mutual = 0;
      for (const s of model.strands[j].F) mutual += partialMutual(s, bus[i].segment);
      baseL[k][j] = baseL[j][k] = mutual;
    }
    for (let j = 0; j < i; j++) baseL[k][model.strands.length + j] = baseL[model.strands.length + j][k] = partialMutual(bus[i].segment, bus[j].segment);
  }
  const repair = Math.max(0, 1e-15 - minimumEigenvalue(baseL));
  for (let i = 0; i < baseCount; i++) baseL[i][i] += repair;
  const size = branches.length, L = zeros(size);
  const baseIndex = branch => branch.type === 'winding' ? branch.strand : model.strands.length + branch.busIndex;
  const factor = branch => branch.type === 'winding' ? 1 / model.cells : 1;
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) L[i][j] = baseL[baseIndex(branches[i])][baseIndex(branches[j])] * factor(branches[i]) * factor(branches[j]);
  const nodeCount = nodes.size, C = new Float64Array(nodeCount * nodeCount);
  let capacitance = null;
  if (model.capacitanceMode === 'distributed') {
    capacitance = prepareLitzCapacitance(cfg, geometry, { samples: model.capacitanceSamples });
    const voltageWeights = (strand, fraction, sign) => {
      const position = Math.max(0, Math.min(model.cells, fraction * model.cells));
      const cell = Math.min(model.cells - 1, Math.floor(position)), within = position - cell;
      return [[strandNodes[strand][cell], sign * (1 - within)], [strandNodes[strand][cell + 1], sign * within]];
    };
    for (const pair of capacitance.couplings) stampPair(C, nodeCount,
      [...voltageWeights(pair.a, pair.fa, 1), ...voltageWeights(pair.b, pair.fb, -1)], pair.C);
  }
  return { branches, nodeCount, inputNode, outputNode, strandNodes, L, C, bus, explicitBuses,
    capacitance, regularisationH: repair,
    method: explicitBuses ? 'Shared terminal-track and plated terminal-barrel graph, mutually coupled to winding paths' : 'Ideal terminal contacts (no physical terminal buses supplied)' };
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
  const rectangular = model.acModel === 'rectangular' ? rectangularProximityCoefficients({ width: model.width,
    thickness: model.thickness, rho: model.rho, f }) : null;
  const skin = rectangular?.skinFactor ?? foilSkinFactor(model.thickness, delta), viaSkin = foilSkinFactor(model.plating, delta);
  const cz = rectangular?.normal ?? proximityCoefficient(model.width, model.thickness, delta, model.rho);
  const cn = rectangular?.transverse ?? proximityCoefficient(model.thickness, model.width, delta, model.rho);
  const net = model.network, size = net.branches.length, R = zeros(size);
  const busSkin = new Map();
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const proximity = (cz * model.Pz[i][j] + cn * model.Pn[i][j]) / (model.cells * model.cells);
    for (let a = 0; a < model.cells; a++) for (let b = 0; b < model.cells; b++) R[i * model.cells + a][j * model.cells + b] = proximity;
  }
  for (let i = 0; i < size; i++) {
    const branch = net.branches[i];
    if (branch.type === 'winding') {
      const s = model.strands[branch.strand];
      R[i][i] += (s.traceR * skin + s.viaR * viaSkin + s.padR * skin) / model.cells;
    } else {
      const b = net.bus[branch.busIndex];
      if (!busSkin.has(b.width)) busSkin.set(b.width, rectangular && branch.type !== 'terminal-barrel'
        ? rectangularProximityCoefficients({ width: b.width, thickness: model.thickness, rho: model.rho, f }).skinFactor : skin);
      R[i][i] = b.resistance * (branch.type === 'terminal-barrel' ? viaSkin : busSkin.get(b.width));
    }
  }
  const Cmatrix = Float64Array.from(net.C), G = Float64Array.from(net.C, value => TAU * f * model.tanD * value);
  if (capacitance > 0) stampPair(Cmatrix, net.nodeCount, [[net.inputNode, 1], [net.outputNode, -1]], capacitance);
  const network = solvePassiveNetwork({ ...net, R, C: Cmatrix, G }, f);
  const Zterminal = network.Z, currents = model.strands.map((_, i) => network.currents[i * model.cells]);
  const endCurrents = model.strands.map((_, i) => network.currents[(i + 1) * model.cells - 1]);
  const terminalBusLoss = net.branches.reduce((sum, branch, i) => branch.type === 'winding' ? sum
    : sum + R[i][i] * C.abs(network.currents[i]) ** 2, 0);
  const w = TAU * f;
  const L = w ? Zterminal[1] / w : network.magneticEnergy;
  return { f, L, R: Zterminal[0], Rac: Zterminal[0], Zseries: Zterminal, Z: C.abs(Zterminal), Zr: Zterminal[0], Zi: Zterminal[1],
    currents, endCurrents, allBranchCurrents: network.currents, nodeVoltages: network.voltages,
    energyL: network.magneticEnergy, copperLossPerAmp2: network.copperLoss,
    copperResistanceEquivalent: network.copperLoss, dielectricResistanceEquivalent: network.dielectricLoss,
    terminalBusLoss: terminalBusLoss * current * current, terminalBusResistanceEquivalent: terminalBusLoss,
    powerBalanceError: network.powerBalanceError, electricEnergyPerAmp2: network.electricEnergy,
    Ls: L, Leff: L,
    Q: Zterminal[0] > 0 ? Zterminal[1] / Zterminal[0] : 0,
    phase: C.arg(Zterminal) * 180 / Math.PI, delta: delta * 1e3, skinFactor: skin,
    Ploss: current * current * network.copperLoss, Pdielectric: current * current * network.dielectricLoss,
    Ptotal: current * current * (network.copperLoss + network.dielectricLoss), resistanceMatrix: R,
    rectangularModel: rectangular ? { cellCount: rectangular.cellCount, resolved: rectangular.resolved, warnings: rectangular.warnings } : null };
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
      endRe: ac.endCurrents[i][0], endIm: ac.endCurrents[i][1], endPercent: 100 * C.abs(ac.endCurrents[i]),
      traceRdc: s.traceR, viaRdc: s.viaR, viaPadRdc: s.padR, Rdc: s.traceR + s.viaR + s.padR };
  });
  const viaR = model.strands.reduce((r, s, i) => r + s.viaR * C.abs(dc.currents[i]) ** 2, 0);
  const viaPadRdc = model.strands.reduce((r, s, i) => r + s.padR * C.abs(dc.currents[i]) ** 2, 0);
  const warnings = [];
  if (model.regularisationH > 1e-12) warnings.push('Inductance quadrature needed a passivity correction; increase segmentCap and compare convergence.');
  if (ac.f > 10e6) warnings.push(model.capacitanceMode === 'distributed'
    ? 'Above 10 MHz, the coarse distributed-capacitance approximation and omitted global field reaction may dominate model error; numerical convergence does not validate accuracy.'
    : 'Above 10 MHz, omitted distributed capacitance, dielectric loss and global field reaction may dominate model error; numerical convergence does not validate accuracy.');
  const magnitudes = currentShares.map(s => s.magnitude);
  if (Math.max(...magnitudes) > 2 / magnitudes.length) warnings.push('One or more strands carry over twice the equal-share current; inspect branch imbalance.');
  if (Math.max(...magnitudes) > 2 * Math.min(...magnitudes)) warnings.push('Largest strand current exceeds twice the smallest; inspect branch imbalance.');
  if (ac.rectangularModel?.warnings) warnings.push(...ac.rectangularModel.warnings);
  if (model.network.regularisationH > 1e-12) warnings.push('The terminal-bus inductance graph required a passivity correction; compare numerical resolution.');
  const resonance = model.capacitanceMode === 'distributed' && opts.estimateResonance !== false
    ? findFirstResonance(model, Ctot) : { frequency: null, band: null };
  const result = { ...ac, L: ac.L, Rdc: dc.R, Rac: ac.R, Fr: ac.R / dc.R,
    Iop: current, viaR, viaPadRdc, terminalBusRdc: dc.terminalBusResistanceEquivalent,
    Ctot, Cinter: null, Cturn: null,
    srf: resonance.frequency || (Ctot > 0 ? 1 / (TAU * Math.sqrt(Math.max(dc.L, 1e-15) * Ctot)) : Infinity),
    srfKnown: false, estimatedSrfHz: resonance.frequency, srfConfidence: resonance.frequency ? 'unvalidated' : 'unknown',
    resonanceSearchBand: resonance.band, resonanceIncludesExternalCapacitance: Ctot > 0,
    lumpedResonanceHz: Ctot > 0 ? 1 / (TAU * Math.sqrt(Math.max(dc.L, 1e-15) * Ctot)) : null,
    capacitanceMode: model.capacitanceMode, capacitanceModel: model.network.capacitance?.method || 'Off',
    distributedCapacitance: model.network.capacitance ? { totals: model.network.capacitance.totals,
      pairCount: model.network.capacitance.pairCount, sampleCount: model.network.capacitance.sampleCount,
      cellsPerStrand: model.cells, validated: false } : null,
    terminalBusModel: model.network.method, terminalBusBranchCount: model.network.bus.length,
    networkNodeCount: model.network.nodeCount, networkBranchCount: model.network.branches.length,
    segmentCapUsed: model.cap, lossSamplesUsed: model.lossSamples, cellsPerStrand: model.cells, acModel: model.acModel,
    averageMagneticEnergy: 0.5 * ac.energyL * current * current,
    averageElectricEnergy: 0.5 * ac.electricEnergyPerAmp2 * current * current,
    currentShares, currentImbalance: Math.max(...magnitudes) / Math.max(1e-30, Math.min(...magnitudes)),
    inductanceMatrix: model.L, couplingMatrix: model.L.map((row, i) => row.map((v, j) => v / Math.sqrt(model.L[i][i] * model.L[j][j]))),
    regularisationH: model.regularisationH, networkRegularisationH: model.network.regularisationH,
    rho: model.rho, tCu: model.thickness * 1e3,
    lenTotal: model.strands.reduce((sum, s) => sum + s.traceLength + s.viaLength, 0),
    nL: geometry.layers.length, strands: model.strands.length, segments: model.segmentCount,
    method: `Experimental coupled-strand / shared-bus network + ${model.acModel === 'rectangular' ? 'rectangular cross-section filament' : 'foil / slab'} AC loss${model.capacitanceMode === 'distributed' ? ' + distributed pair capacitance' : ''}`,
    model: 'litz-network-v2', validated: false, warnings,
    limitations: [
      'Unvalidated engineering estimate; no calibration to the paper’s measured ESR or Q.',
      'Three-dimensional path partial inductance uses finite-segment quadrature and a conductor GMD; compare finer segmentCap values for convergence.',
      ...(model.acModel === 'rectangular' ? [
        'The rectangular cross-section filament model resolves local cross-section current redistribution at finite mesh resolution; global field reaction, via-pad crowding and manufacturing details are not solved. MHz loss may still be underestimated.',
        'The local solver’s AC internal-inductance change is not added to the routed-path inductance; global magnetic coupling remains quasi-static.',
      ] : ['Foil skin and two independent 1D slab proximity solutions omit rectangular demagnetizing fields, edge crowding, field reaction and via-pad crowding. MHz loss may be substantially underestimated and Q overestimated.']),
      'Via resistance uses actual connected layer spans and the specified uniform copper plating; unused barrel stubs are not modeled.',
      'Via-pad spreading uses two full-annulus radial sheets: 2*rho/(2*pi*t)*ln(rPad/rBarrel). Finite trace entry angles and AC current crowding need external validation.',
      ...(model.capacitanceMode === 'distributed' ? [
        ...model.network.capacitance.limitations,
        'Circuit cells distribute the strand inductance and proximity-energy matrices uniformly along the path; the bounded model is not a full segmented PEEC/full-wave solution.',
        'Dielectric loss is omega*C*tan(delta) on the floating intrinsic pair matrix; the supplied external capacitance is ideal. Reported resonance is an unvalidated sign crossing within the searched band.',
      ] : ['Intrinsic distributed capacitance and dielectric loss are omitted. Any finite resonance uses only the supplied lumped capacitance and is not a predicted self-resonant frequency.']),
      model.network.explicitBuses ? 'Shared terminal tracks and plated pad barrels are explicit network branches. Bus transport skin loss is included; bus proximity and terminal-pad spreading are omitted.'
        : 'The two terminal connections are ideal because this geometry does not provide physical terminal buses.',
      'Drive current is RMS terminal current. Copper and dielectric power are reported separately; AC resistance and Q use terminal impedance. Thermal ratings, WPT efficiency and high-power performance are not predicted.',
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
      Q: a.Q, Z: a.Z, Zr: a.Zr, Zi: a.Zi, phase: a.phase, Ploss: a.Ploss,
      copperR: a.copperResistanceEquivalent, dielectricR: a.dielectricResistanceEquivalent,
      Pdielectric: a.Pdielectric, Ptotal: a.Ptotal });
  }
  return out;
}

function findFirstResonance(model, capacitance) {
  const band = [1e4, 1e8], samples = 18;
  let previousF = band[0], previous = atFrequency(model, previousF, capacitance, 0).Zi;
  for (let i = 1; i < samples; i++) {
    const f = band[0] * Math.pow(band[1] / band[0], i / (samples - 1));
    const imaginary = atFrequency(model, f, capacitance, 0).Zi;
    if (previous > 0 && imaginary <= 0) {
      let low = previousF, high = f;
      for (let j = 0; j < 9; j++) {
        const mid = Math.sqrt(low * high);
        if (atFrequency(model, mid, capacitance, 0).Zi > 0) low = mid; else high = mid;
      }
      return { frequency: Math.sqrt(low * high), band };
    }
    previous = imaginary; previousF = f;
  }
  return { frequency: null, band };
}

/** Independent source-filament and field-loss sampling refinement. Numerical
 * convergence is reported separately from (currently absent) validation. */
export function compareLitzConvergence(cfg, geometry, options = {}) {
  const resolutions = options.levels || [96, 192, 384];
  const lossSamples = options.lossSamples || [32, 64, 128];
  if (!Array.isArray(resolutions) || resolutions.length < 2 || resolutions.length > 5
    || resolutions.some((n, i) => !Number.isInteger(n) || n < 48 || n > 768 || (i && n <= resolutions[i - 1]))
    || !Array.isArray(lossSamples) || lossSamples.length < 2 || lossSamples.length > 5
    || lossSamples.some((n, i) => !Number.isInteger(n) || n < 16 || n > 512 || (i && n <= lossSamples[i - 1]))) {
    throw new Error('Each convergence axis needs 2–5 strictly increasing levels within the model bounds; the lists may have different lengths.');
  }
  const tolerance = Math.max(1e-5, Math.min(0.5, positive(options.tolerance, 0.02)));
  const levels = [], changes = [], evaluated = new Map();
  const fixedSource = resolutions.at(-1), fixedLoss = lossSamples.at(-1);
  const evaluate = (axis, segmentCap, lossCount) => {
    const key = `${segmentCap}:${lossCount}`;
    if (evaluated.has(key)) return { ...evaluated.get(key), axis, elapsedMs: 0, reused: true };
    const start = performance.now();
    const analysis = analyseLitz({ ...cfg, litzLossSamples: lossCount }, geometry,
      { segmentCap, lossSamples: lossCount, estimateResonance: false });
    const value = { segmentCap: analysis.segmentCapUsed, lossSamples: analysis.lossSamplesUsed,
      L: analysis.L, Rac: analysis.Rac, Q: analysis.Q,
      currentShares: analysis.currentShares, elapsedMs: performance.now() - start,
      regularisationH: analysis.regularisationH, validated: false };
    evaluated.set(key, value);
    return { ...value, axis, reused: false };
  };
  const difference = (axis, from, to) => {
    const before = levels[from], level = levels[to];
    const absolute = level.currentShares.map((s, j) => Math.hypot(s.re - before.currentShares[j].re, s.im - before.currentShares[j].im));
    return { axis, from, to,
      relativeL: Math.abs(level.L - before.L) / Math.max(1e-20, Math.abs(level.L)),
      relativeRac: Math.abs(level.Rac - before.Rac) / Math.max(1e-20, Math.abs(level.Rac)),
      maxCurrentPhasorChange: Math.max(...absolute.map((difference, j) => difference / Math.max(1e-9, level.currentShares[j].magnitude))),
      maxCurrentChangeFractionOfTerminal: Math.max(...absolute) };
  };
  const axisStudy = (axis, settings, heldConstant) => {
    const levelIndices = [], changeIndices = [];
    for (const [segmentCap, lossCount] of settings) {
      levelIndices.push(levels.length);
      levels.push(evaluate(axis, segmentCap, lossCount));
      if (levelIndices.length > 1) {
        changeIndices.push(changes.length);
        changes.push(difference(axis, levelIndices.at(-2), levelIndices.at(-1)));
      }
    }
    const last = changes[changeIndices.at(-1)];
    return { heldConstant, levelIndices, changeIndices,
      convergedNumerically: last.relativeL <= tolerance && last.relativeRac <= tolerance && last.maxCurrentPhasorChange <= tolerance };
  };
  // Vary one source of numerical error at a time. Zipping both resolution
  // lists could let two opposing errors cancel and create false convergence.
  const axes = {
    source: axisStudy('source', resolutions.map(cap => [cap, fixedLoss]), { lossSamples: fixedLoss }),
    loss: axisStudy('loss', lossSamples.map(samples => [fixedSource, samples]), { segmentCap: fixedSource }),
  };
  return { levels, changes, axes, tolerance, uniqueEvaluations: evaluated.size,
    convergedNumerically: axes.source.convergedNumerically && axes.loss.convergedNumerically,
    accuracyValidated: false, limitations: [
      'A small change with resolution establishes numerical stability, not agreement with measured or full-wave results.',
      'Source segmentation is refined at fixed finest loss sampling; loss sampling is then refined at fixed finest source segmentation. Both axes must meet the tolerance.',
      'Cross-section and distributed-capacitance/circuit-cell resolutions are held fixed and are not certified by these two axis studies.',
    ] };
}
