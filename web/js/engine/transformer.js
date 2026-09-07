/* Routed multi-winding PCB transformers. Air-core and magnetic-circuit models
   stay separate: multiplying free-space inductance by permeability is invalid. */
import { buildAirTransformer } from './air-transformer.js';
import { buildCoil, layerNames, toFilaments, inductanceOf, discretisationCorrection, mutualOf, OZ_MM, RHO_CU20, ALPHA_CU, MU0 } from './coil.js';
import { artwork, track, via, pad, label, rect, arcPts, bounds, rotatePts } from './artwork.js';
import { range, choice, positiveMatrix } from './creator-validation.js';
import { loadDefaults, loadedTransformer } from './transformer-load.js';
import { C } from './complex.js';
import { resolveStack } from './winding-stack.js';

export const TRANSFORMER_FAMILIES = {
  aircore: 'Two-layer air-core', multilayer: 'Multilayer air-core',
  'center-tapped': 'Center-tapped secondary', 'multi-secondary': 'Multiple secondaries',
  interleaved: 'Interleaved windings', ferrite: 'Ferrite-core planar',
};
export const STACK_PRESETS = {
  multilayer: 'P,P,S,S', 'center-tapped': 'P,S,S',
  'multi-secondary': 'P,S,S2', interleaved: 'P,S,P,S', ferrite: 'P,S,P,S',
};
// Nominal initial permeability at 25 °C, not a large-signal/temperature model.
// TDK N87: https://www.tdk-electronics.tdk.com/download/187238/990c299b916e9f3eb7e44ad563b7f0b9/pdf-n87.pdf
// Ferroxcube 3C95: https://www.ferroxcube.com/en-global/news/download/37
export const CORE_MATERIALS = { custom: { name: 'User material' }, N87: { name: 'TDK N87 (nominal μi)', muR: 2200 }, '3C95': { name: 'Ferroxcube 3C95 (nominal μi)', muR: 3000 } };
export const transformerExtras = () => ({
  ...loadDefaults(),
  family: 'aircore', stackPlan: 'P,P,S,S', copperLayers: '', layerPositions: '',
  secondary2Turns: 3, secondary3Turns: 3, viaPad: 0.8, viaDrill: 0.4,
  coreShape: 'rectangular', corePostW: 6, corePostH: 6, coreClearance: 0.5,
  coreMaterial: 'custom', coreMuR: 2200, coreAe: 25, coreLe: 50, coreGap: 0.1,
  coreWindowHeight: 3, coreFluxLimit: 0.2, coreVoltage: 1,
  leakageFraction: 0.02, coreLossDensity: 0,
});
const info = text => ({ level: 'info', text });
const warn = text => ({ level: 'warn', text });
const tokens = text => String(text || '').split(',').map(s => s.trim()).filter(Boolean);
const dot = (p, q) => p[0] * q[0] + p[1] * q[1];
function pointSegment(p, a, b) {
  const d = [b[0] - a[0], b[1] - a[1]], u = [p[0] - a[0], p[1] - a[1]];
  const t = Math.max(0, Math.min(1, dot(u, d) / (dot(d, d) || 1)));
  return Math.hypot(u[0] - t * d[0], u[1] - t * d[1]);
}
function minRadius(pts) {
  let r = Infinity;
  for (let i = 1; i < pts.length; i++) r = Math.min(r, pointSegment([0, 0], pts[i - 1], pts[i]));
  return r;
}

export function buildTransformer(input, env = {}, opt = {}) {
  const c = { ...transformerExtras(), ...input };
  choice(c, 'family', Object.keys(TRANSFORMER_FAMILIES));
  choice(c, 'driveMode', ['current', 'voltage']);
  if (c.family === 'aircore') {
    const r = buildAirTransformer(c, env, opt);
    r.model = 'Air-core Neumann partial inductance';
    r.art.meta.family = c.family;
    attachLoad(c, r);
    return r;
  }
  for (const key of ['primaryTurns', 'secondaryTurns']) range(c, key, 1, 60, true);
  range(c, 'dOuter', 5, 200); range(c, 'traceW', 0.1, 3); range(c, 'traceS', 0.1, 3);
  range(c, 'boardT', 0.1, 10); range(c, 'copperOz', 0.25, 4); range(c, 'tempC', -40, 125);
  range(c, 'freq', 100, 1e8); range(c, 'current', 0, 100); range(c, 'secondaryCurrent', 0, 100);
  range(c, 'ppt', 24, 256, true); range(c, 'viaDrill', 0.2, 1.5); range(c, 'viaPad', c.viaDrill + 0.2, 3);
  choice(c, 'shape', ['circle', 'polygon']);
  const stack = tokens(c.stackPlan);
  if (stack.length < 2 || stack.length > 8 || stack.some(n => !['P', 'S', 'S2', 'S3'].includes(n)) || !stack.includes('P') || !stack.includes('S')) throw new Error('Layer assignment needs 2–8 comma-separated P/S/S2/S3 entries including P and S.');
  const names = ['P', 'S', 'S2', 'S3'].filter(n => stack.includes(n));
  if (names.some(n => stack.filter(x => x === n).length > 4)) throw new Error('At most four series layers per winding are supported.');
  if (c.family !== 'multi-secondary' && names.length !== 2) throw new Error('Choose Multiple secondaries to use S2/S3 layers.');
  if (c.family === 'multi-secondary' && (names.length < 3 || (names.includes('S3') && !names.includes('S2')))) throw new Error('Multiple secondaries needs P, S and S2, with optional S3.');
  const secCount = stack.filter(n => n === 'S').length;
  if (c.family === 'center-tapped' && secCount % 2 !== 0) throw new Error('Center tap requires an even number of identical secondary layers.');
  const turns = { P: c.primaryTurns, S: c.secondaryTurns, S2: c.secondary2Turns, S3: c.secondary3Turns };
  for (const n of names) { if (n === 'S2' || n === 'S3') range(c, n === 'S2' ? 'secondary2Turns' : 'secondary3Turns', 1, 60, true); }
  const { layers, z, assumedZ, fullLayers } = resolveStack(c, env.board, stack.length);
  const A = artwork({ name: env.name || 'T1', kind: 'transformer', family: c.family });
  A.meta.boardLayers = fullLayers;
  const base = {};
  for (const n of names) {
    const coil = buildCoil({ ...c, turns: turns[n], layers: 1, sides: 4, fillet: 0.6, connection: 'series', padSize: c.traceW, arrayEnabled: false });
    if (coil.spiral.turnsUsed !== turns[n]) throw new Error(`${n} turns do not fit. Increase diameter or reduce turns.`);
    base[n] = coil.layers[0].pts;
  }
  const inner = Math.min(...names.map(n => minRadius(base[n]))) - c.traceW / 2 - c.traceS - c.viaPad / 2 - 0.1;
  const outer = c.dOuter / 2 + c.traceW / 2 + c.traceS + c.viaPad / 2 + 0.5;
  if (inner < 2 * (c.viaPad + c.traceS)) throw new Error('No clear central area for isolated transition vias. Increase diameter or reduce turns/width/clearance.');
  const core = c.family === 'ferrite' ? coreParameters(c, inner) : null;
  const slug = String(env.name || 'T1').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const windings = [];
  let padNumber = 1;
  for (const [wi, name] of names.entries()) {
    const indices = stack.map((n, i) => n === name ? i : -1).filter(i => i >= 0), count = indices.length;
    const angle = wi * 2 * Math.PI / names.length;
    const delta = 2 * Math.asin((c.viaPad + c.traceS + c.traceW + 0.15) / (2 * inner));
    if (delta * (count + 1) > 2 * Math.PI / names.length * 0.85) throw new Error('Transition vias need more angular clearance. Increase diameter or reduce layer count.');
    const net = `${slug}_${name === 'P' ? 'PRI' : name === 'S' ? 'SEC' : `SEC${name.slice(1)}`}`;
    const nodes = Array.from({ length: count + 1 }, (_, j) => {
      const theta = angle + (j - count / 2) * delta, radius = j % 2 ? inner : outer;
      return { x: radius * Math.cos(theta), y: radius * Math.sin(theta), theta, radius, id: `${name}:${j}` };
    });
    const paths = [], sections = [], terminalNames = [];
    for (let j = 0; j <= count; j++) {
      const node = nodes[j], tapped = c.family === 'center-tapped' && name === 'S' && j === count / 2;
      if (j === 0 || j === count || tapped) {
        const text = tapped ? 'S_CT' : `${name}${j === 0 ? '+ (dot)' : '−'}`;
        A.pads.push(pad(node.x, node.y, { w: c.viaPad, drill: c.viaDrill, number: String(padNumber++), net, role: 'terminal' }));
        A.ports.push({ x: node.x, y: node.y, name: text, net });
        A.labels.push(label(node.x, node.y + c.viaPad + 0.5, text));
        terminalNames.push(text);
      } else A.vias.push(via(node.x, node.y, { diameter: c.viaPad, drill: c.viaDrill, net, role: 'transition' }));
    }
    for (let j = 0; j < count; j++) {
      const layer = indices[j], theta = angle + (j + 0.5 - count / 2) * delta;
      // Reverse traversal AND mirror geometry: all series sections circulate in the same direction.
      const raw = j % 2 ? base[name].slice().reverse().map(([x, y]) => [x, -y]) : base[name];
      const pts = rotatePts(raw, theta);
      const first = fanLead(pts[0], nodes[j], theta), last = fanLead(pts.at(-1), nodes[j + 1], theta);
      const poly = [...first.slice().reverse(), ...pts.slice(1), ...last.slice(1)];
      A.tracks.push(track(layers[layer], c.traceW, poly, { net, role: 'winding', startNode: nodes[j].id, endNode: nodes[j + 1].id, winding: name, section: j }));
      const path = poly.map(([x, y]) => [x, y, z[layer]]);
      // Barrel spans only the electrical path between participating layers. Through stubs are excluded from L.
      if (j > 0) paths.push([[nodes[j].x, nodes[j].y, z[indices[j - 1]]], [nodes[j].x, nodes[j].y, z[layer]]]);
      paths.push(path); sections.push({ layer: layers[layer], z: z[layer], turns: turns[name], path });
    }
    windings.push({ name, net, turns: count * turns[name], layers: indices.map(i => layers[i]), nodes, paths, sections, terminals: terminalNames });
  }
  checkVias(A, windings, c.traceS);
  const b = bounds(A), margin = 2;
  A.outline.push({ layer: 'Edge.Cuts', pts: rect(b.x0 - margin, b.y0 - margin, b.x1 + margin, b.y1 + margin) });
  if (core) {
    const w = c.corePostW + 2 * c.coreClearance, h = c.corePostH + 2 * c.coreClearance;
    A.outline.push({ layer: 'Edge.Cuts', pts: c.coreShape === 'round' ? arcPts(0, 0, w / 2, 0, 2 * Math.PI, 0.025) : rect(-w / 2, -h / 2, w / 2, h / 2) });
    A.labels.push(label(0, 0, 'Core post opening', { layer: 'Dwgs.User' }));
  }
  const notes = [info('Turns inputs are per occupied layer. Each winding is series-connected through distinct clear-area vias. Through-hole terminals expose internal-layer windings; no buried surface pads are used.'), info('All terminals of a DC-connected winding share one net; separate windings have separate nets. Use net-tie symbols/footprints as appropriate when integrating winding terminals into a schematic.')];
  if (assumedZ) notes.push(warn('Layer heights use uniform spacing across the board. Enter actual copper center heights for an asymmetric stack-up.'));
  notes.push(info('Return wiring, conducting planes/shields, interwinding capacitance, resonance, AC winding loss and temperature rise are excluded. DC copper loss is not a power rating.'));
  if (core) notes.push(...core.notes);
  const model = core ? 'Ferrite reluctance model + supplied leakage fraction' : 'Air-core multi-winding Neumann matrix';
  A.meta.model = model; A.meta.stack = stack.map((winding, i) => ({ layer: layers[i], winding, z: z[i] }));
  const r = { art: A, bounds: bounds(A), layers, notes, model, windings, core };
  if (opt.quick) return r;
  const rho = RHO_CU20 * (1 + ALPHA_CU * (c.tempC - 20)), w = c.traceW * 1e-3, t = c.copperOz * OZ_MM * 1e-3;
  const F = windings.map(q => toFilaments(q.paths, Math.max(0.12, Math.min(0.8, (c.traceW + c.traceS) * 0.6)), opt.segmentCap || 1800));
  const resistances = windings.map((q, i) => {
    // Copper length excludes barrels, which use an explicit 25 µm plating assumption.
    let length = 0;
    for (const s of q.sections) for (let j = 1; j < s.path.length; j++) length += Math.hypot(s.path[j][0] - s.path[j - 1][0], s.path[j][1] - s.path[j - 1][1]) * 1e-3;
    const barrelLength = F[i].totalLen - length;
    return rho * length / (w * t) + rho * barrelLength / (Math.PI * c.viaDrill * 1e-3 * 25e-6);
  });
  notes.push(info('Via DC resistance assumes 25 µm barrel plating. Winding AC resistance is not inferred from this value.'));
  const n = names.length, matrix = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    matrix[i][i] = core ? core.AL * windings[i].turns ** 2 / (1 - c.leakageFraction) : inductanceOf(F[i], w, t, discretisationCorrection(F[i].totalLen / F[i].n, w, t));
    for (let j = 0; j < i; j++) matrix[i][j] = matrix[j][i] = core ? core.AL * windings[i].turns * windings[j].turns : mutualOf(F[i], F[j], 0);
  }
  positiveMatrix(matrix);
  const coupling = matrix.map((row, i) => row.map((v, j) => v / Math.sqrt(matrix[i][i] * matrix[j][j])));
  const [L1, L2, M] = [matrix[0][0], matrix[1][1], matrix[0][1]], k = coupling[0][1];
  const outputs = windings.slice(1).map((q, j) => ({ name: q.name, turns: q.turns, ratio: windings[0].turns / q.turns, induced: 2 * Math.PI * c.freq * Math.abs(matrix[0][j + 1]) * c.current }));
  r.analysis = { L1, L2, M, k, ratio: outputs[0].ratio, R1: resistances[0], R2: resistances[1], leakage: L1 * (1 - k * k), induced: outputs[0].induced, loss: resistances.reduce((s, R, i) => s + R * (i ? c.secondaryCurrent : c.current) ** 2, 0), matrix, coupling, resistances, outputs, turns: windings.map(q => q.turns) };
  if (c.family === 'center-tapped') r.analysis.tapTurns = windings[1].turns / 2;
  if (core) {
    core.Bpeak = c.coreVoltage * Math.sqrt(2) / (2 * Math.PI * c.freq * windings[0].turns * c.coreAe * 1e-6);
    core.fluxUtilization = core.Bpeak / c.coreFluxLimit;
    core.loss = c.coreLossDensity > 0 ? c.coreLossDensity * 1e3 * c.coreAe * c.coreLe * 1e-9 : null;
    if (c.driveMode !== 'voltage' && core.Bpeak > c.coreFluxLimit) notes.push(warn('Sinusoidal drive exceeds the entered design flux limit. Increase turns/frequency/core area or reduce voltage. The linear model is not valid after saturation.'));
  }
  attachLoad(c, r);
  return r;
}

function fanLead(end, node, theta) {
  const radial = [node.radius * Math.cos(theta), node.radius * Math.sin(theta)];
  return [end, radial, ...arcPts(0, 0, node.radius, theta, node.theta, 0.025).slice(1)];
}


function checkVias(A, windings, clearance) {
  const nodes = windings.flatMap(q => q.nodes.map(n => ({ ...n, net: q.net })));
  const diameter = A.pads[0].w;
  for (let i = 0; i < nodes.length; i++) {
    const p = nodes[i];
    for (let j = 0; j < i; j++) if (Math.hypot(p.x - nodes[j].x, p.y - nodes[j].y) < diameter + clearance - 1e-6) throw new Error('Transition vias overlap. Increase diameter or reduce layers.');
    for (const t of A.tracks) {
      // Only the two adjacent sections may touch this series node, even on the same net.
      if (t.startNode === p.id || t.endNode === p.id) continue;
      for (let j = 1; j < t.pts.length; j++) if (pointSegment([p.x, p.y], t.pts[j - 1], t.pts[j]) < diameter / 2 + t.width / 2 + clearance - 1e-6) throw new Error(`Transition via would bypass/short a winding on ${t.layer}. Increase diameter or clearance area.`);
    }
  }
}

function coreParameters(c, inner) {
  choice(c, 'coreShape', ['rectangular', 'round']); choice(c, 'coreMaterial', Object.keys(CORE_MATERIALS));
  range(c, 'corePostW', 1, 100); range(c, 'corePostH', 1, 100); range(c, 'coreClearance', 0.1, 5);
  range(c, 'coreAe', 1, 10000); range(c, 'coreLe', 1, 1000); range(c, 'coreGap', 0, 10);
  range(c, 'coreMuR', 1, 20000); range(c, 'coreWindowHeight', 0.2, 30); range(c, 'coreFluxLimit', 0.01, 1);
  if (c.driveMode !== 'voltage') range(c, 'coreVoltage', 0.01, 1000); range(c, 'leakageFraction', 0.001, 0.5); range(c, 'coreLossDensity', 0, 100000);
  const radius = c.coreShape === 'round' ? c.corePostW / 2 + c.coreClearance : Math.hypot(c.corePostW / 2 + c.coreClearance, c.corePostH / 2 + c.coreClearance);
  if (radius + c.viaPad / 2 + c.traceS >= inner) throw new Error('Core opening intersects the transition-via area. Increase winding diameter or reduce core post/turns.');
  if (c.boardT + 2 * c.coreClearance > c.coreWindowHeight) throw new Error('PCB plus assembly clearance exceeds the core window height.');
  const muR = CORE_MATERIALS[c.coreMaterial].muR || c.coreMuR;
  const AL = MU0 * c.coreAe * 1e-6 / (c.coreLe * 1e-3 / muR + c.coreGap * 1e-3);
  return { AL, muR, material: CORE_MATERIALS[c.coreMaterial].name, notes: [
    info('Linear magnetic-circuit estimate: AL = μ0·Ae/(le/μr + gap). No gap fringing, nonlinear B-H curve, DC bias or temperature-dependent permeability. Material presets supply nominal initial μ at 25 °C only.'),
    info('Leakage is an entered fraction of winding self-inductance, not a field solution. Coupling follows that assumption; interleaving does not automatically improve this ferrite estimate.'),
    info(c.driveMode === 'voltage' ? 'Loaded flux uses the solved winding currents. Supplied loss density must match that operating point; it is reported separately from the circuit.' : 'Flux uses the entered sinusoidal primary RMS voltage; copper loss separately uses entered RMS currents. Enter loss density from the material curve at this frequency, flux and temperature to estimate core loss (zero means unknown).'),
    warn('The core post cutout is included in the board export. Direct placement does not modify board edges: create this cutout and check the complete core assembly separately. Post geometry does not specify a purchasable core or an isolation rating.'),
  ] };
}

function attachLoad(c, r) {
  if (!r.analysis || c.driveMode !== 'voltage') return;
  const a = r.analysis, names = r.windings?.map(q => q.name) || ['P', 'S'];
  a.loaded = loadedTransformer(c, a.matrix || [[a.L1, a.M], [a.M, a.L2]], a.resistances || [a.R1, a.R2], names);
  a.loss = a.loaded.copperLoss;
  r.notes.push(info('Loaded analysis solves the linear RMS phasor circuit with a sinusoidal source and independent secondary impedances. Efficiency includes DC winding resistance only; AC copper loss, core dissipation and parasitic capacitance are excluded.'));
  if (c.family === 'center-tapped') r.notes.push(info('The load is connected across the complete S winding. The center tap is open; asymmetric half-winding loads and rectifiers are not modeled.'));
  if (r.core) {
    const flux = a.loaded.currents.reduce((s, I, i) => C.add(s, C.scale(I, r.core.AL * r.windings[i].turns)), [0, 0]);
    r.core.Bpeak = Math.SQRT2 * C.abs(flux) / (c.coreAe * 1e-6);
    r.core.fluxUtilization = r.core.Bpeak / c.coreFluxLimit;
    if (r.core.Bpeak > c.coreFluxLimit) r.notes.push(warn('Loaded drive exceeds the design flux limit. The linear core model is outside its intended range.'));
    r.notes.push(info('Loaded peak flux comes from the common core flux AL × sum(N × I). Supplied core loss density is reported separately and does not alter the circuit solution.'));
  }
}
