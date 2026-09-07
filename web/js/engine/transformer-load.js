/* RMS phasor circuit: V = (R + jωL) I, currents enter dotted terminals.
   Secondary terminal voltage is -Zload I. Open windings are eliminated,
   rather than approximated by an arbitrarily large resistance. */
import { C } from './complex.js';
import { range, choice, positiveMatrix } from './creator-validation.js';

export const loadDefaults = () => ({ driveMode: 'current', sourceVoltage: 1, sourceR: 1, sourceX: 0,
  loadMode: 'load', loadR: 50, loadX: 0, load2Mode: 'load', load2R: 50, load2X: 0,
  load3Mode: 'load', load3R: 50, load3X: 0 });

function solve(A, b) {
  A = A.map((row, i) => [...row.map(z => [...z]), [...b[i]]]);
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let p = col;
    for (let i = col + 1; i < n; i++) if (C.abs(A[i][col]) > C.abs(A[p][col])) p = i;
    if (!(C.abs(A[p][col]) > 1e-20)) throw new Error('Loaded winding circuit is singular. Check impedances and coupling.');
    [A[col], A[p]] = [A[p], A[col]];
    const pivot = A[col][col];
    for (let j = col; j <= n; j++) A[col][j] = C.div(A[col][j], pivot);
    for (let i = 0; i < n; i++) if (i !== col) {
      const factor = A[i][col];
      for (let j = col; j <= n; j++) A[i][j] = C.sub(A[i][j], C.mul(factor, A[col][j]));
    }
  }
  const result = A.map(row => row[n]);
  if (result.flat().some(v => !Number.isFinite(v))) throw new Error('Loaded winding circuit did not produce finite currents.');
  return result;
}

export function loadedTransformer(input, matrix, resistances, names = ['P', 'S']) {
  const c = { ...loadDefaults(), ...input }, n = names.length;
  range(c, 'freq', 1, 1e8); range(c, 'sourceVoltage', 0.000001, 1000);
  range(c, 'sourceR', 0, 1e9); range(c, 'sourceX', -1e9, 1e9);
  if (matrix.length !== n || matrix.some(row => row.length !== n) || resistances.length !== n || resistances.some(r => !Number.isFinite(r) || r <= 0)) throw new Error('Invalid winding circuit dimensions or resistance.');
  positiveMatrix(matrix);
  const w = 2 * Math.PI * c.freq, sourceZ = [c.sourceR, c.sourceX];
  const loads = names.slice(1).map(name => {
    const prefix = name === 'S' ? 'load' : `load${name.slice(1)}`;
    choice(c, `${prefix}Mode`, ['load', 'open', 'short']);
    if (c[`${prefix}Mode`] === 'load') {
      range(c, `${prefix}R`, 0, 1e9); range(c, `${prefix}X`, -1e9, 1e9);
    }
    return { name, mode: c[`${prefix}Mode`], z: c[`${prefix}Mode`] === 'load' ? [c[`${prefix}R`], c[`${prefix}X`]] : [0, 0] };
  });
  const active = [0, ...loads.flatMap((q, i) => q.mode === 'open' ? [] : [i + 1])];
  const Z = active.map(i => active.map(j => C.add([i === j ? resistances[i] : 0, w * matrix[i][j]],
    i !== j ? [0, 0] : i === 0 ? sourceZ : loads[i - 1].z)));
  const solved = solve(Z, active.map(i => [i === 0 ? c.sourceVoltage : 0, 0]));
  const currents = names.map(() => [0, 0]); active.forEach((i, j) => { currents[i] = solved[j]; });
  const voltages = matrix.map((row, i) => row.reduce((sum, L, j) => C.add(sum, C.mul([i === j ? resistances[i] : 0, w * L], currents[j])), [0, 0]));
  const unloadedI = C.div([c.sourceVoltage, 0], [resistances[0] + c.sourceR, w * matrix[0][0] + c.sourceX]);
  const outputs = loads.map((q, j) => {
    const i = j + 1, voltage = C.abs(voltages[i]), current = C.abs(currents[i]);
    const openVoltage = C.abs(C.mul([0, w * matrix[0][i]], unloadedI));
    return { name: q.name, mode: q.mode, voltage, current, voltagePhasor: voltages[i], loadCurrentPhasor: C.neg(currents[i]),
      phaseDeg: C.arg(voltages[i]) * 180 / Math.PI, power: current ** 2 * q.z[0], openVoltage,
      regulation: q.mode === 'load' && voltage > 1e-12 ? (openVoltage - voltage) / voltage : null };
  });
  const copperLoss = currents.reduce((s, I, i) => s + C.abs(I) ** 2 * resistances[i], 0);
  const outputPower = outputs.reduce((s, q) => s + q.power, 0);
  const sourceLoss = C.abs(currents[0]) ** 2 * c.sourceR;
  const inputPower = C.mul(voltages[0], [currents[0][0], -currents[0][1]])[0];
  const sourcePower = c.sourceVoltage * currents[0][0];
  return { currents, voltages, outputs, primaryCurrent: C.abs(currents[0]), primaryVoltage: C.abs(voltages[0]),
    copperLoss, outputPower, sourceLoss, inputPower, sourcePower,
    efficiency: inputPower > 1e-18 ? outputPower / inputPower : null,
    powerBalanceError: sourcePower - sourceLoss - copperLoss - outputPower };
}
