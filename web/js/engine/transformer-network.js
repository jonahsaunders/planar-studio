/* Branch formulation preserves unequal currents in coupled parallel sections.
   Each branch obeys Vport = (R + jωL) I; port KCL supplies the load equation. */
import { C } from './complex.js';
import { solveComplex, loadDefaults, loadImpedance } from './transformer-load.js';
import { range, positiveMatrix } from './creator-validation.js';

function circuit(L, R, ports, count, constraints, omega) {
  const n = L.length, size = n + count;
  const A = Array.from({ length: size }, () => Array.from({ length: size }, () => [0, 0]));
  const b = Array.from({ length: size }, () => [0, 0]);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) A[i][j] = [R[i][j], omega * L[i][j]];
    A[i][n + ports[i]] = [-1, 0];
  }
  constraints.forEach((q, p) => {
    if (!q.current) A[n + p][n + p] = [1, 0];
    ports.forEach((port, i) => { if (port === p) A[n + p][i] = q.current ? [1, 0] : q.z; });
    b[n + p] = q.value || [0, 0];
  });
  const x = solveComplex(A, b), branchCurrents = x.slice(0, n), voltages = x.slice(n);
  const currents = Array.from({ length: count }, (_, p) => branchCurrents.reduce((s, I, i) => ports[i] === p ? C.add(s, I) : s, [0, 0]));
  return { branchCurrents, voltages, currents };
}

export function effectiveInductance(matrix, ports, count) {
  positiveMatrix(matrix);
  const zero = matrix.map(row => row.map(() => 0));
  const columns = Array.from({ length: count }, (_, p) => circuit(matrix, zero, ports, count,
    Array.from({ length: count }, (_, i) => ({ current: true, value: [i === p ? 1 : 0, 0] })), 1).voltages.map(v => v[1]));
  return columns.map((row, i) => row.map((v, j) => (v + columns[j][i]) / 2));
}

export function imposedBranches(network, currents, frequency) {
  return circuit(network.matrix, network.resistanceMatrix, network.ports, network.names.length,
    currents.map(value => ({ current: true, value: Array.isArray(value) ? value : [value, 0] })), 2 * Math.PI * frequency);
}

export function loadedBranches(input, network) {
  const c = { ...loadDefaults(), ...input }, { matrix: L, resistanceMatrix: R, ports, names } = network;
  range(c, 'freq', 1, 1e8); range(c, 'sourceVoltage', 1e-6, 1000);
  range(c, 'sourceR', 0, 1e9); range(c, 'sourceX', -1e9, 1e9);
  positiveMatrix(L);
  const loads = names.slice(1).map(name => ({ name, ...loadImpedance(c, name === 'S' ? 'load' : `load${name.slice(1)}`) }));
  const constraints = [{ z: [c.sourceR, c.sourceX], value: [c.sourceVoltage, 0] }, ...loads.map(q => q.mode === 'open' ? { current: true } : { z: q.z })];
  const r = circuit(L, R, ports, names.length, constraints, 2 * Math.PI * c.freq);
  const open = circuit(L, R, ports, names.length, [constraints[0], ...loads.map(() => ({ current: true }))], 2 * Math.PI * c.freq);
  const outputs = loads.map((q, j) => {
    const i = j + 1, voltage = C.abs(r.voltages[i]), current = q.mode==='open'?0:C.abs(r.currents[i]), openVoltage = C.abs(open.voltages[i]);
    return { name: q.name, mode: q.mode, voltage, current, voltagePhasor: r.voltages[i], loadCurrentPhasor: C.neg(r.currents[i]), phaseDeg: C.arg(r.voltages[i]) * 180 / Math.PI,
      power: current ** 2 * q.z[0], openVoltage, regulation: q.mode === 'load' && voltage > 1e-12 ? (openVoltage - voltage) / voltage : null };
  });
  const copperLoss = quadraticLoss(R, r.branchCurrents);
  const outputPower = outputs.reduce((s, o) => s + o.power, 0), sourceLoss = C.abs(r.currents[0]) ** 2 * c.sourceR;
  const inputPower = C.mul(r.voltages[0], [r.currents[0][0], -r.currents[0][1]])[0];
  const sourcePower = c.sourceVoltage * r.currents[0][0];
  return { ...r, outputs, primaryVoltage: C.abs(r.voltages[0]), primaryCurrent: C.abs(r.currents[0]), copperLoss, outputPower, sourceLoss, inputPower, sourcePower,
    efficiency: inputPower > 1e-18 ? outputPower / inputPower : null, powerBalanceError: sourcePower - sourceLoss - copperLoss - outputPower };
}
export function quadraticLoss(matrix, currents) {
  return currents.reduce((sum, I, i) => sum + matrix[i].reduce((s, r, j) => s + r * (I[0] * currents[j][0] + I[1] * currents[j][1]), 0), 0);
}
