/* First-order planar current-sheet estimates. SI internally. Their useful
   domain is a thin, concentric winding stack below resonance; not a field solver.
   Leakage is the positive field-energy integral μ0*l/b ∫ H(z)H(z)^T dz.
   AC foil factors follow Dowell (1966), with radial copper fill correction. */
import { MU0, OZ_MM, RHO_CU20, ALPHA_CU } from './coil.js';
import { range, choice } from './creator-validation.js';
import { quadraticLoss } from './transformer-network.js';

export function sheetModel(c, branches) {
  const n = branches.length, t = c.copperOz * OZ_MM * 1e-3;
  const sections = branches.flatMap((q, branch) => q.sections.map(s => ({ ...s, branch }))).sort((a, b) => a.z - b.z);
  const turns = branches.map(q => q.turns);
  const build = Math.max(...sections.map(s => s.turns * (s.width + c.traceS))) * 1e-3;
  const meanLength = sections.reduce((sum, s) => sum + s.length / s.turns, 0) / sections.length;
  const coefficient = MU0 * meanLength / build;
  const matrix = Array.from({ length: n }, () => Array(n).fill(0));
  let field = turns.map(v => -v / 2), previous = sections[0].z * 1e-3 - t / 2;
  const fields = [];
  function integrate(a, b, dz) {
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) matrix[i][j] += coefficient * dz * (2*a[i]*a[j] + a[i]*b[j] + b[i]*a[j] + 2*b[i]*b[j]) / 6;
  }
  for (const s of sections) {
    const start = s.z * 1e-3 - t / 2, end = start + t;
    integrate(field, field, Math.max(0, start - previous));
    const next = [...field]; next[s.branch] += s.turns;
    integrate(field, next, t);
    fields.push({ ...s, average: field.map((v, i) => (v + next[i]) / 2) });
    field = next; previous = end;
  }
  // Conductor internal energy keeps coincident parallel branches nonsingular.
  matrix.forEach((row, i) => { row[i] += 1e-12; });
  return { matrix, fields, build, meanLength };
}

export function acResistance(c, branches, sheet, frequency = c.freq) {
  const n = branches.length, rho = RHO_CU20 * (1 + ALPHA_CU * (c.tempC - 20));
  const t = c.copperOz * OZ_MM * 1e-3, delta = Math.sqrt(rho / (Math.PI * frequency * MU0));
  const R = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? branches[i].resistance : 0));
  if (c.lossModel !== 'ac') return { matrix: R, skinDepth: delta };
  for (const s of sheet.fields) {
    const fill = s.width / (s.width + c.traceS), x = t / delta * Math.sqrt(fill);
    let skin, proximity;
    // Self skin term uses symmetric fields. The average external field below
    // supplies proximity separately; the one-sided foil factor would count it twice.
    if (x < 0.01) { skin = 1 + x**4/180; proximity = x**4/3; }
    else if (x > 30) { skin = x/2; proximity = 2*x; }
    else {
      skin = x/2 * (Math.sinh(x) + Math.sin(x)) / (Math.cosh(x) - Math.cos(x));
      proximity = 2*x * (Math.sinh(x) - Math.sin(x)) / (Math.cosh(x) + Math.cos(x));
    }
    const dc = rho * s.length / (s.width * 1e-3 * t);
    R[s.branch][s.branch] += dc * Math.max(0, skin - 1);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) R[i][j] += dc * proximity * s.average[i] * s.average[j] / (s.turns*s.turns);
  }
  return { matrix: R, skinDepth: delta };
}

export function windingCapacitance(c, windings) {
  choice(c, 'capacitanceModel', ['estimate', 'measured']);
  range(c, 'dielectricEr', 1, 30);
  const rows = windings.flatMap(q => q.sections.map(s => ({ ...s, name: q.name }))).sort((a, b) => a.z - b.z);
  const pairs = new Map();
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i-1], b = rows[i];
    if (a.name === b.name) continue;
    const gap = (b.z - a.z - c.copperOz * OZ_MM) * 1e-3;
    if (!(gap > 0)) throw new Error('Capacitance needs positive dielectric spacing.');
    // Adjacent layers screen more distant conductors. Copper overlap is a
    // fill-factor estimate, not a distributed winding capacitance extraction.
    const fill = Math.min(a.width, b.width) / (Math.max(a.width, b.width) + c.traceS);
    const area = Math.min(a.length * a.width, b.length * b.width) * 1e-3 * fill;
    const key = [a.name, b.name].sort().join(' ↔ ');
    pairs.set(key, (pairs.get(key) || 0) + 8.8541878128e-12 * c.dielectricEr * area / gap);
  }
  const estimate = [...pairs.values()].reduce((a, b) => a + b, 0);
  if (c.capacitanceModel === 'measured') range(c, 'measuredCapacitance', 0, 1);
  return { pairs: [...pairs].map(([pair, value]) => ({ pair, value })), value: c.capacitanceModel === 'measured' ? c.measuredCapacitance : estimate, source: c.capacitanceModel };
}

export function lossBreakdown(c, network, currents, coreLoss = null) {
  const dc = currents.reduce((sum, I, i) => sum + (I[0]**2 + I[1]**2) * network.branches[i].resistance, 0);
  const copper = quadraticLoss(network.resistanceMatrix, currents);
  const total = coreLoss == null ? null : copper + coreLoss;
  return { dc, acExcess: Math.max(0, copper - dc), copper, core: coreLoss, total,
    temperature: total != null && c.thermalResistance > 0 ? c.ambientTemperature + total * c.thermalResistance : null };
}

// TDK N87 typical points, 100 °C, June 2025 datasheet page 2.
export const N87_LOSS_POINTS = [[25000,.2,57],[100000,.2,375],[300000,.1,390],[500000,.05,215]];
export const N87_SOURCE = 'https://www.tdk-electronics.tdk.com/blob/528882/download/3/pdf-n87.pdf';

export function coreLossAt(c, B, volume) {
  choice(c, 'coreLossModel', ['density', 'n87-fit', 'steinmetz']);
  if (c.coreLossModel === 'density') return { watts: c.coreLossDensity > 0 ? c.coreLossDensity * 1e3 * volume : null, source: 'Entered operating-point density' };
  if (c.coreLossModel === 'n87-fit') {
    if (c.coreMaterial !== 'N87' || c.coreTemperature !== 100 || c.freq < 25000 || c.freq > 500000 || B < .05 || B > .2) return { watts: null, source: 'N87 fit unavailable outside 25–500 kHz, 50–200 mT, 100 °C' };
    // Least-squares fit log(P[kW/m³]) = a + b log(f/100kHz) + c log(B/.2T).
    const A = N87_LOSS_POINTS.map(([f,b]) => [1, Math.log(f/1e5), Math.log(b/.2)]), y = N87_LOSS_POINTS.map(p => Math.log(p[2]));
    const gram = A[0].map((_,i) => A[0].map((_,j) => A.reduce((s,r) => s+r[i]*r[j],0)));
    const rhs = A[0].map((_,i) => A.reduce((s,r,j) => s+r[i]*y[j],0));
    for (let i=0;i<3;i++) { const d=gram[i][i]; for(let j=i;j<3;j++)gram[i][j]/=d;rhs[i]/=d;
      for(let k=0;k<3;k++)if(k!==i){const v=gram[k][i];for(let j=i;j<3;j++)gram[k][j]-=v*gram[i][j];rhs[k]-=v*rhs[i];} }
    return { watts: Math.exp(rhs[0]+rhs[1]*Math.log(c.freq/1e5)+rhs[2]*Math.log(B/.2))*1e3*volume, source: 'N87 fit to four typical datasheet points at 100 °C; approximate' };
  }
  range(c, 'steinmetzK', 0, 1e12); range(c, 'steinmetzAlpha', .1, 5); range(c, 'steinmetzBeta', .1, 5);
  return { watts: c.steinmetzK * c.freq ** c.steinmetzAlpha * B ** c.steinmetzBeta * volume, source: 'User Steinmetz coefficients: W/m³, Hz, T at entered core temperature' };
}
