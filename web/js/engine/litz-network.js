/* Small passive RL/C network solver used by the experimental Litz model.
 * Branch orientation is a -> b. R/L are symmetric branch matrices, C/G are
 * symmetric nodal matrices (including the reference node). RMS phasors use
 * exp(+j omega t). A 1 A terminal excitation makes Re(Z) equal total watts.
 */
const TAU = 2 * Math.PI;

/** Dense complex Gaussian elimination with partial pivoting. Typed storage
 * avoids allocation churn in repeated bounded (usually <100 unknown) solves. */
export function solveComplexSystem(real, imaginary, rhsReal, rhsImaginary) {
  const n = rhsReal.length, ar = Float64Array.from(real), ai = Float64Array.from(imaginary);
  const br = Float64Array.from(rhsReal), bi = Float64Array.from(rhsImaginary);
  if (ar.length !== n * n || ai.length !== ar.length || bi.length !== n) throw new Error('Invalid complex matrix dimensions.');
  for (let k = 0; k < n; k++) {
    let pivot = k, magnitude = 0;
    for (let i = k; i < n; i++) {
      const p = i * n + k, v = ar[p] * ar[p] + ai[p] * ai[p];
      if (v > magnitude) { magnitude = v; pivot = i; }
    }
    if (!(magnitude > 1e-50) || !Number.isFinite(magnitude)) throw new Error('Singular or disconnected electrical network.');
    if (pivot !== k) {
      for (let j = k; j < n; j++) {
        const p = pivot * n + j, q = k * n + j;
        [ar[p], ar[q]] = [ar[q], ar[p]]; [ai[p], ai[q]] = [ai[q], ai[p]];
      }
      [br[pivot], br[k]] = [br[k], br[pivot]]; [bi[pivot], bi[k]] = [bi[k], bi[pivot]];
    }
    const d = k * n + k, denominator = ar[d] * ar[d] + ai[d] * ai[d];
    for (let i = k + 1; i < n; i++) {
      const p = i * n + k;
      if (ar[p] === 0 && ai[p] === 0) continue;
      const rr = (ar[p] * ar[d] + ai[p] * ai[d]) / denominator;
      const ri = (ai[p] * ar[d] - ar[p] * ai[d]) / denominator;
      ar[p] = ai[p] = 0;
      for (let j = k + 1; j < n; j++) {
        const q = i * n + j, s = k * n + j;
        ar[q] -= rr * ar[s] - ri * ai[s];
        ai[q] -= rr * ai[s] + ri * ar[s];
      }
      br[i] -= rr * br[k] - ri * bi[k]; bi[i] -= rr * bi[k] + ri * br[k];
    }
  }
  const xr = new Float64Array(n), xi = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let rr = br[i], ri = bi[i];
    for (let j = i + 1; j < n; j++) {
      const p = i * n + j;
      rr -= ar[p] * xr[j] - ai[p] * xi[j]; ri -= ar[p] * xi[j] + ai[p] * xr[j];
    }
    const d = i * n + i, denominator = ar[d] * ar[d] + ai[d] * ai[d];
    xr[i] = (rr * ar[d] + ri * ai[d]) / denominator;
    xi[i] = (ri * ar[d] - rr * ai[d]) / denominator;
  }
  return { real: xr, imaginary: xi };
}

/** Stamp a capacitance between linearly interpolated conductor potentials.
 * weights is [[node,coefficient],...], sum(coefficient)=0 for floating pairs.
 * The rank-one stamp C*w*w^T is positive semidefinite by construction. */
export function stampPair(matrix, nodeCount, weights, value) {
  if (!(value >= 0) || !Number.isFinite(value)) throw new Error('A passive pair element must be finite and nonnegative.');
  for (const [i, a] of weights) for (const [j, b] of weights) matrix[i * nodeCount + j] += value * a * b;
}

export function solvePassiveNetwork({ branches, nodeCount, R, L, C, G, inputNode = 0, outputNode = 1 }, frequency) {
  const m = branches.length, voltageCount = nodeCount - 1, size = m + voltageCount;
  const omega = TAU * Math.max(0, frequency);
  const index = node => node === outputNode ? -1 : m + (node < outputNode ? node : node - 1);
  if (inputNode === outputNode || inputNode < 0 || inputNode >= nodeCount) throw new Error('Invalid network terminals.');
  const real = new Float64Array(size * size), imaginary = new Float64Array(size * size);
  const rhs = new Float64Array(size), rhsI = new Float64Array(size);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      real[i * size + j] = R[i][j]; imaginary[i * size + j] = omega * L[i][j];
    }
    for (const [node, sign] of [[branches[i].a, 1], [branches[i].b, -1]]) {
      const k = index(node); if (k < 0) continue;
      real[i * size + k] -= sign; real[k * size + i] += sign;
    }
  }
  for (let i = 0; i < nodeCount; i++) {
    const p = index(i); if (p < 0) continue;
    for (let j = 0; j < nodeCount; j++) {
      const q = index(j); if (q < 0) continue;
      real[p * size + q] += G?.[i * nodeCount + j] || 0;
      imaginary[p * size + q] += omega * (C?.[i * nodeCount + j] || 0);
    }
  }
  rhs[index(inputNode)] = 1;
  const solved = solveComplexSystem(real, imaginary, rhs, rhsI);
  const currents = Array.from({ length: m }, (_, i) => [solved.real[i], solved.imaginary[i]]);
  const voltages = Array.from({ length: nodeCount }, (_, i) => {
    const k = index(i); return k < 0 ? [0, 0] : [solved.real[k], solved.imaginary[k]];
  });
  let copperLoss = 0, magneticEnergy = 0, dielectricLoss = 0, electricEnergy = 0;
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
    const dot = currents[i][0] * currents[j][0] + currents[i][1] * currents[j][1];
    copperLoss += dot * R[i][j]; magneticEnergy += dot * L[i][j];
  }
  for (let i = 0; i < nodeCount; i++) for (let j = 0; j < nodeCount; j++) {
    const dot = voltages[i][0] * voltages[j][0] + voltages[i][1] * voltages[j][1];
    dielectricLoss += dot * (G?.[i * nodeCount + j] || 0);
    electricEnergy += dot * (C?.[i * nodeCount + j] || 0);
  }
  return { Z: voltages[inputNode], currents, voltages, copperLoss, dielectricLoss,
    magneticEnergy, electricEnergy, powerBalanceError: voltages[inputNode][0] - copperLoss - dielectricLoss };
}
