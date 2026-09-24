/* Bounded magnetoquasistatic rectangular-conductor extraction, SI units.
 *
 * The cross section is divided into rectangular volume filaments, each with
 * its own rho/area resistance. Their reciprocal partial-inductance matrix is
 * the area-averaged 2-D Green kernel mu/(2 pi) log(referenceRadius/distance).
 * Solving (R+jwL)i + jw A_external = v 1 with sum(i)=I accounts for both
 * dimensions, edge crowding, skin diffusion and reaction to a locally uniform
 * applied field. This is a local, infinitely straight conductor model; it is
 * not a 3-D/full-wave or measured validation of the routed coil.
 *
 * Basis: Kamon, Tsuk & White, FASTHENRY, IEEE MTT 42 (1994), 1750-1758,
 * DOI 10.1109/22.310584; authors' earlier paper:
 * https://www.rle.mit.edu/cpg/publications/pub53.pdf
 * Haus & Melcher, Electromagnetic Fields and Energy, chapter 10 (MQS diffusion):
 * https://ocw.mit.edu/courses/res-6-001-electromagnetic-fields-and-energy-spring-2008/pages/chapter-10/
 * This implementation is an independent dense 2-D discretization, not FastHenry.
 *
 * Phasors are RMS with exp(+jwt). Copper power = sum(Rcell |icell|^2).
 * Absolute partial L depends on the explicit return/reference radius. The
 * frequency correction L(f)-L(0), resistance and field loss are gauge invariant.
 */

import { C } from './complex.js';

const MU0 = 4e-7 * Math.PI;
const RHO = 1.724e-8;
const MAX_CELLS = 64;
const geometryCache = new Map();
const responseCache = new Map();
const zeros = n => Array.from({ length: n }, () => Array(n).fill(0));
const sum = values => values.reduce((a, b) => C.add(a, b), [0, 0]);

function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive and finite (SI units).`);
  return value;
}

function boundedCache(cache, key, value, size) {
  if (cache.size >= size) cache.delete(cache.keys().next().value);
  cache.set(key, value);
  return value;
}

function gauss(n) {
  const result = [];
  for (let i = 1; i <= n; i++) {
    let x = Math.cos(Math.PI * (i - 0.25) / (n + 0.5)), derivative = 0;
    for (let k = 0; k < 20; k++) {
      let p = 1, previous = 0;
      for (let j = 1; j <= n; j++) { const old = p; p = ((2 * j - 1) * x * p - (j - 1) * previous) / j; previous = old; }
      derivative = n * (x * p - previous) / (x * x - 1);
      const change = p / derivative; x -= change;
      if (Math.abs(change) < 1e-15) break;
    }
    result.push([x, 2 / ((1 - x * x) * derivative * derivative)]);
  }
  return result;
}
const Q4 = gauss(4), Q20 = gauss(20);

// Exact first integration of the triangular self-distance distribution, then
// smooth 20-point Gaussian integration in the shorter direction. No arbitrary
// softening radius is inserted into a filament's self term.
function selfMeanLog(width, thickness) {
  const a = Math.max(width, thickness), ratio = Math.min(width, thickness) / a;
  let integral = 0;
  for (const [x, weight] of Q20) {
    const v = (x + 1) / 2, y = ratio * v;
    const primitive = 0.25 * (1 - y * y) * Math.log1p(y * y)
      + 0.5 * y * y * Math.log(y) - 0.75 + y * Math.atan(1 / y);
    integral += weight / 2 * (1 - v) * primitive;
  }
  return Math.log(a) + 4 * integral;
}

// Second antiderivative in x of log(hypot(x,y)), in dimensionless coordinates.
function primitiveLog(x, y) {
  const xx = x * x, yy = y * y, radius2 = xx + yy;
  if (!radius2) return 0;
  return 0.25 * (xx - yy) * Math.log(radius2) - 0.75 * xx
    + (y === 0 ? 0 : x * y * Math.atan(x / y));
}

function pairMeanLog(a, b, scale, swap) {
  // Integrate the long direction analytically to retain accuracy for thin foil
  // cells, and the short direction using Gaussian product quadrature.
  const ax = (swap ? a.z : a.x) / scale, az = (swap ? a.x : a.z) / scale;
  const bx = (swap ? b.z : b.x) / scale, bz = (swap ? b.x : b.z) / scale;
  const aw = (swap ? a.dz : a.dx) / scale, ah = (swap ? a.dx : a.dz) / scale;
  const bw = (swap ? b.dz : b.dx) / scale, bh = (swap ? b.dx : b.dz) / scale;
  const x = ax - bx;
  let result = 0;
  for (const [u, wu] of Q4) for (const [v, wv] of Q4) {
    const y = Math.abs(az + u * ah / 2 - bz - v * bh / 2);
    const integral = primitiveLog(x + (aw + bw) / 2, y)
      - primitiveLog(x + (aw - bw) / 2, y)
      - primitiveLog(x - (aw - bw) / 2, y)
      + primitiveLog(x - (aw + bw) / 2, y);
    result += wu * wv / 4 * integral / (aw * bw);
  }
  return Math.log(scale) + result;
}

function meshDimensions(width, thickness, resolution) {
  if (typeof resolution === 'object' && resolution !== null) {
    const { nx, ny } = resolution;
    if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 1 || ny < 1 || nx * ny > MAX_CELLS) {
      throw new Error('Rectangular mesh requires integer nx, ny and at most 64 cells.');
    }
    return [nx, ny];
  }
  if (!Number.isInteger(resolution) || resolution < 2 || resolution > 8) {
    throw new Error('Rectangular resolution must be an integer from 2 to 8, or {nx, ny}.');
  }
  const budget = resolution * resolution, longIsWidth = width >= thickness;
  const ratio = Math.sqrt(Math.max(width, thickness) / Math.min(width, thickness));
  // Search symmetric axis allocations. At least two cells in each direction
  // preserve both independent eddy-current modes.
  let best = [resolution, resolution], score = Infinity;
  for (let short = 2; short <= resolution; short++) {
    const long = Math.floor(budget / short);
    const candidate = Math.abs(Math.log((long / short) / ratio));
    if (candidate < score) { best = [long, short]; score = candidate; }
  }
  return longIsWidth ? best : [best[1], best[0]];
}

function geometry(width, thickness, rho, resolution, referenceRadius) {
  positive(width, 'Width'); positive(thickness, 'Thickness'); positive(rho, 'Resistivity');
  positive(referenceRadius, 'Reference radius');
  if (referenceRadius < Math.hypot(width, thickness)) throw new Error('Reference radius must exceed the cross-section diagonal.');
  const [nx, ny] = meshDimensions(width, thickness, resolution);
  const key = JSON.stringify([width, thickness, rho, nx, ny, referenceRadius]);
  if (geometryCache.has(key)) return geometryCache.get(key);
  const edges = (dimension, count) => Array.from({ length: count + 1 }, (_, i) => -dimension / 2 * Math.cos(Math.PI * i / count));
  const xs = edges(width, nx), zs = edges(thickness, ny), cells = [];
  for (let iz = 0; iz < ny; iz++) for (let ix = 0; ix < nx; ix++) {
    const dx = xs[ix + 1] - xs[ix], dz = zs[iz + 1] - zs[iz];
    cells.push({ x: (xs[ix + 1] + xs[ix]) / 2, z: (zs[iz + 1] + zs[iz]) / 2,
      dx, dz, area: dx * dz, resistancePerMeter: rho / (dx * dz) });
  }
  const n = cells.length, L = zeros(n), scale = Math.max(width, thickness);
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
    const meanLog = i === j ? selfMeanLog(cells[i].dx, cells[i].dz)
      : pairMeanLog(cells[i], cells[j], scale, thickness > width);
    L[i][j] = L[j][i] = MU0 / (2 * Math.PI) * (Math.log(referenceRadius) - meanLog);
  }
  const fractions = cells.map(c => c.area / (width * thickness));
  let dcL = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) dcL += fractions[i] * L[i][j] * fractions[j];
  return boundedCache(geometryCache, key, { key, cells, L, dcL, fractions, nx, ny, width, thickness, rho,
    dcResistance: rho / (width * thickness), referenceRadius }, 24);
}

// Dense complex LU with scaled partial pivoting. One factorization supplies
// transport and both field excitations, rather than three separate inverses.
function factor(matrix) {
  const n = matrix.length, a = matrix.map(row => row.map(z => [...z]));
  const swaps = [], scales = a.map(row => Math.max(...row.map(C.abs)));
  for (let k = 0; k < n; k++) {
    let pivot = k, score = -1;
    for (let i = k; i < n; i++) { const s = C.abs(a[i][k]) / scales[i]; if (s > score) { score = s; pivot = i; } }
    if (!(score > 1e-14)) throw new Error('Rectangular impedance system is numerically singular.');
    swaps.push(pivot);
    [a[k], a[pivot]] = [a[pivot], a[k]]; [scales[k], scales[pivot]] = [scales[pivot], scales[k]];
    for (let i = k + 1; i < n; i++) {
      a[i][k] = C.div(a[i][k], a[k][k]);
      for (let j = k + 1; j < n; j++) a[i][j] = C.sub(a[i][j], C.mul(a[i][k], a[k][j]));
    }
  }
  return rhs => {
    const b = rhs.map(z => [...z]);
    for (let k = 0; k < n; k++) [b[k], b[swaps[k]]] = [b[swaps[k]], b[k]];
    for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) b[i] = C.sub(b[i], C.mul(a[i][j], b[j]));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = i + 1; j < n; j++) b[i] = C.sub(b[i], C.mul(a[i][j], b[j]));
      b[i] = C.div(b[i], a[i][i]);
    }
    return b;
  };
}

function response(g, frequency) {
  if (!Number.isFinite(frequency) || frequency < 0) throw new Error('Frequency must be finite and nonnegative (Hz).');
  const key = `${g.key}:${frequency}`;
  if (responseCache.has(key)) return responseCache.get(key);
  const w = 2 * Math.PI * frequency, n = g.cells.length;
  const solve = factor(g.L.map((row, i) => row.map((l, j) => [i === j ? g.cells[i].resistancePerMeter : 0, w * l])));
  const y = solve(Array.from({ length: n }, () => [1, 0])), totalY = sum(y);
  const impedance = C.inv(totalY), transport = y.map(v => C.mul(v, impedance));
  const fieldMode = coordinate => {
    // A_y = mu (H_normal*x - H_transverse*z). The sign is included in
    // the mode; arbitrary complex field phases can be superposed later.
    const rhs = g.cells.map(c => [0, -w * MU0 * coordinate(c)]);
    const free = solve(rhs), voltage = C.neg(C.div(sum(free), totalY));
    return free.map((i, k) => C.add(i, C.mul(y[k], voltage)));
  };
  const normal = fieldMode(c => c.x), transverse = fieldMode(c => -c.z);
  const modes = [transport, normal, transverse];
  const lossMatrix = modes.map(a => modes.map(b => {
    let entry = [0, 0];
    for (let i = 0; i < n; i++) entry = C.add(entry, C.scale(C.mul([a[i][0], -a[i][1]], b[i]), g.cells[i].resistancePerMeter));
    return entry;
  }));
  const skinDepth = frequency ? Math.sqrt(g.rho / (Math.PI * MU0 * frequency)) : Infinity;
  const largestBoundaryCell = Math.max(g.width / 2 * (1 - Math.cos(Math.PI / g.nx)), g.thickness / 2 * (1 - Math.cos(Math.PI / g.ny)));
  const resolved = largestBoundaryCell <= skinDepth;
  return boundedCache(responseCache, key, { impedance, transport, normal, transverse, lossMatrix, skinDepth, resolved,
    skinFactor: impedance[0] / g.dcResistance,
    inductanceCorrectionPerMeter: frequency ? impedance[1] / w - g.dcL : 0,
    warnings: resolved ? [] : ['Boundary cells exceed one skin depth; refine the mesh or use external extraction.'] }, 192);
}

/** Solve a straight rectangular cross section. Dimensions/length in m, f in Hz.
 * externalH.normal is perpendicular to the PCB; transverse is in-plane across
 * the trace. Both may be real A/m or complex [re,im] RMS A/m. current is RMS A.
 * impedance is the transport partial impedance, never power divided by a
 * possibly zero current when externally driven eddy currents are present.
 */
export function rectangularConductorImpedance({ width, thickness, length = 1, frequency, f = frequency ?? 0,
  rho = RHO, resolution = 6, referenceRadius = 4 * Math.max(width, thickness), current = 1, externalH = {} }) {
  positive(length, 'Length');
  const g = geometry(width, thickness, rho, resolution, referenceRadius), r = response(g, f);
  const phasor = (v, label) => {
    const z = Array.isArray(v) ? v : [v ?? 0, 0];
    if (z.length !== 2 || !z.every(Number.isFinite)) throw new Error(`${label} must be finite, real or [re, im].`);
    return z;
  };
  const excitation = [phasor(current, 'Current'), phasor(externalH.normal, 'Normal field'), phasor(externalH.transverse, 'Transverse field')];
  const modes = [r.transport, r.normal, r.transverse];
  const currents = g.cells.map((_, i) => sum(modes.map((mode, k) => C.mul(mode[i], excitation[k]))));
  const copperLoss = currents.reduce((p, i, k) => p + g.cells[k].resistancePerMeter * length * C.abs(i) ** 2, 0);
  return { impedance: C.scale(r.impedance, length), Z: C.scale(r.impedance, length), resistance: r.impedance[0] * length,
    dcResistance: g.dcResistance * length, skinFactor: r.skinFactor,
    inductanceCorrectionPerMeter: r.inductanceCorrectionPerMeter,
    partialInductanceDCPerMeter: g.dcL, referenceRadius, copperLoss, currents,
    cells: g.cells.map((c, i) => ({ ...c, current: currents[i], currentDensity: C.scale(currents[i], 1 / c.area) })),
    lossMatrix: r.lossMatrix.map(row => row.map(z => C.scale(z, length))),
    fieldLossCoefficients: { normal: r.lossMatrix[1][1][0] * length, transverse: r.lossMatrix[2][2][0] * length },
    cellCount: g.cells.length, mesh: { nx: g.nx, ny: g.ny }, skinDepth: r.skinDepth,
    resolved: r.resolved, warnings: [...r.warnings], frequency: f,
    model: 'rectangular-volume-filament-mqs', validated: false };
}

export function rectangularProximityCoefficients({ width, thickness, rho = RHO, f = 0, frequency = f, resolution = 6 }) {
  const g = geometry(width, thickness, rho, resolution, 4 * Math.max(width, thickness)), r = response(g, frequency);
  return { normal: r.lossMatrix[1][1][0], transverse: r.lossMatrix[2][2][0], skinFactor: r.skinFactor,
    inductanceCorrectionPerMeter: r.inductanceCorrectionPerMeter,
    cellCount: g.cells.length, skinDepth: r.skinDepth, resolved: r.resolved, warnings: [...r.warnings],
    model: 'rectangular-volume-filament-mqs', validated: false };
}

export function rectangularSkinFactor(width, thickness, delta, resolution = 6) {
  if (delta === Infinity) { positive(width, 'Width'); positive(thickness, 'Thickness'); return 1; }
  positive(delta, 'Skin depth');
  return rectangularProximityCoefficients({ width, thickness, rho: RHO,
    f: RHO / (Math.PI * MU0 * delta * delta), resolution }).skinFactor;
}

export function clearRectangularImpedanceCache() { geometryCache.clear(); responseCache.clear(); }

/** Validate explicitly dimensioned, externally extracted reciprocal matrices.
 * Schema: {frequencyUnit:'Hz', impedanceUnit:'ohm', ports:['name',...],
 * samples:[{frequency, impedance:[[[re,im],...],...]}]}. Values are copied.
 * A passive Hermitian part is mandatory; sampled passivity does not establish
 * causality or passivity between samples. No extrapolation is performed here.
 */
export function validateExtractedImpedance(data, expectedPorts) {
  if (data?.frequencyUnit !== 'Hz' || data?.impedanceUnit !== 'ohm') throw new Error('Extracted impedance requires explicit Hz and ohm units.');
  const ports = data.ports;
  if (!Array.isArray(ports) || !ports.length || ports.length > 64 || ports.some(p => typeof p !== 'string' || !p.trim()) || new Set(ports).size !== ports.length) {
    throw new Error('Extracted impedance requires 1–64 unique named ports.');
  }
  if (expectedPorts && JSON.stringify(expectedPorts) !== JSON.stringify(ports)) throw new Error('Extracted impedance port order does not match the routed network.');
  if (!Array.isArray(data.samples) || !data.samples.length || data.samples.length > 2048) throw new Error('Extracted impedance requires 1–2048 samples.');
  let previous = -1;
  const samples = data.samples.map(sample => {
    const f = sample.frequency, matrix = sample.impedance, n = ports.length;
    if (!Number.isFinite(f) || f < 0 || f <= previous) throw new Error('Extracted frequencies must be finite, nonnegative and strictly increasing.');
    previous = f;
    if (!Array.isArray(matrix) || matrix.length !== n || matrix.some(row => !Array.isArray(row) || row.length !== n)) throw new Error('Extracted matrix dimensions must match the port count.');
    const Z = matrix.map(row => row.map(z => {
      if (!Array.isArray(z) || z.length !== 2 || !z.every(Number.isFinite)) throw new Error('Extracted impedances must be finite [re, im] pairs.');
      return [...z];
    }));
    const scale = Math.max(1e-30, ...Z.flat().map(C.abs)), tolerance = scale * 1e-9;
    for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) {
      if (C.abs(C.sub(Z[i][j], Z[j][i])) > tolerance) throw new Error('Extracted impedance must be complex symmetric (reciprocal).');
    }
    // Check the actual Hermitian part, including tiny imaginary antisymmetry
    // accepted by the reciprocity tolerance. A large reactance must not mask
    // negative real power in a nearly lossless imported matrix.
    const H = Z.map((row, i) => row.map((z, j) => [(z[0] + Z[j][i][0]) / 2, (z[1] - Z[j][i][1]) / 2]));
    const hScale = Math.max(1e-30, ...H.flat().map(C.abs)), tol = 1e-9 * hScale;
    for (let k = 0; k < n; k++) {
      let pivot = k;
      for (let i = k + 1; i < n; i++) if (H[i][i][0] > H[pivot][pivot][0]) pivot = i;
      [H[k], H[pivot]] = [H[pivot], H[k]];
      for (let i = 0; i < n; i++) [H[i][k], H[i][pivot]] = [H[i][pivot], H[i][k]];
      if (H[k][k][0] < -tol) throw new Error('Extracted impedance has a non-passive Hermitian part.');
      if (H[k][k][0] <= tol) {
        for (let i = k; i < n; i++) for (let j = k; j < n; j++) if (C.abs(H[i][j]) > tol) throw new Error('Extracted impedance has a non-passive Hermitian part.');
        break;
      }
      for (let i = k + 1; i < n; i++) for (let j = i; j < n; j++) {
        H[i][j] = C.sub(H[i][j], C.scale(C.mul(H[i][k], [H[j][k][0], -H[j][k][1]]), 1 / H[k][k][0]));
        H[j][i] = [H[i][j][0], -H[i][j][1]];
      }
    }
    return { frequency: f, impedance: Z };
  });
  return { frequencyUnit: 'Hz', impedanceUnit: 'ohm', ports: [...ports], samples,
    validation: 'sampled-reciprocity-and-passivity', physicallyValidated: false };
}
