import { RHO_CU20, viaResistance } from './coil.js';
import { phaseAngle } from './winding-design.js';

const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);

// The grounded conductance matrix is sparse. Solve its two sinusoidal
// components with diagonally preconditioned conjugate gradients.
function solve(edges, diagonal, current) {
  const n = current.length;
  const voltage = new Float64Array(n);
  const residual = current.slice();
  const preconditioned = residual.map((v, i) => v / diagonal[i]);
  const direction = preconditioned.slice();
  const product = new Float64Array(n);
  let norm = dot(residual, preconditioned);
  const tolerance = Math.max(1e-24, 1e-20 * norm);
  for (let iteration = 0; norm > tolerance && iteration < 3 * n; iteration++) {
    product.fill(0);
    for (const { from, to, resistance } of edges) {
      const flow = ((direction[from] ?? 0) - (direction[to] ?? 0)) / resistance;
      if (from >= 0) product[from] += flow;
      if (to >= 0) product[to] -= flow;
    }
    const step = norm / dot(direction, product);
    for (let i = 0; i < n; i++) {
      voltage[i] += step * direction[i];
      residual[i] -= step * product[i];
      preconditioned[i] = residual[i] / diagonal[i];
    }
    const next = dot(residual, preconditioned);
    for (let i = 0; i < n; i++) direction[i] = preconditioned[i] + next / norm * direction[i];
    norm = next;
  }
  return voltage;
}

/** Effective resistance for one amp peak per winding with balanced drive.
 *  Copper tracks and via barrels are charged according to their own currents. */
export function routedMotorResistance(cfg, analysis, circuit) {
  if (!circuit) return null;
  const { input, output, topology } = circuit;
  const references = new Set(topology === 'independent' ? output : [output[0]]);
  const ids = new Map();
  const index = id => {
    if (references.has(id)) return -1;
    if (!ids.has(id)) ids.set(id, ids.size);
    return ids.get(id);
  };
  const temperatureFactor = analysis.rho / RHO_CU20;
  const trackOhmPerMm = analysis.rho * 1e3 / (analysis.tCu * cfg.traceW);
  const viaOhm = viaResistance(cfg) * temperatureFactor;
  const padOhm = viaResistance({ ...cfg, viaDrill: cfg.padDrill }) * temperatureFactor;
  const edges = circuit.edges.map(e => ({ from: index(e.from), to: index(e.to),
    resistance: e.length === undefined ? viaOhm : e.length * trackOhmPerMm }));
  const coilEdges = Array.from({ length: cfg.coilCount }, (_, i) => ({
    from: index('C' + (i + 1) + '.1'), to: index('C' + (i + 1) + '.2'),
    resistance: analysis.Rdc + padOhm, coil: true,
  }));
  edges.push(...coilEdges);
  const phases = input.map((id, i) => ({ from: index(id), to: index(output[i]), angle: phaseAngle(i, cfg.phases) }));
  const diagonal = new Float64Array(ids.size);
  for (const { from, to, resistance } of edges) {
    if (from >= 0) diagonal[from] += 1 / resistance;
    if (to >= 0) diagonal[to] += 1 / resistance;
  }
  const voltage = [Math.cos, Math.sin].map(component => {
    const current = new Float64Array(ids.size);
    for (const { from, to, angle } of phases) {
      const value = component(angle);
      if (from >= 0) current[from] += value;
      if (to >= 0) current[to] -= value;
    }
    return solve(edges, diagonal, current);
  });
  const loss = { winding: 0, interconnect: 0 };
  for (const edge of edges) {
    const rmsSquared = voltage.reduce((sum, v) => {
      const amps = ((v[edge.from] ?? 0) - (v[edge.to] ?? 0)) / edge.resistance;
      return sum + amps * amps / 2;
    }, 0);
    loss.winding += edge.coil ? analysis.Rdc * rmsSquared : 0;
    loss.interconnect += (edge.coil ? padOhm : edge.resistance) * rmsSquared;
  }
  return { ...loss, phaseEquivalent: 2 * (loss.winding + loss.interconnect) / cfg.phases };
}
