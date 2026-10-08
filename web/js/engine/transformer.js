/* Routed multi-winding PCB transformers. Air-core and magnetic-circuit models
   stay separate: multiplying free-space inductance by permeability is invalid. */
import { buildAirTransformer } from './air-transformer.js';
import { buildCoil, layerNames, toFilaments, inductanceOf, discretisationCorrection, mutualOf, OZ_MM, RHO_CU20, ALPHA_CU, MU0 } from './coil.js';
import { artwork, track, via, pad, label, rect, arcPts, bounds, rotatePts } from './artwork.js';
import { range, choice, positiveMatrix } from './creator-validation.js';
import { loadDefaults, loadedTransformer } from './transformer-load.js';
import { C } from './complex.js';
import { resolveStack } from './winding-stack.js';
import { designDefaults, transformerMode, windingSettings, windingTurns } from './transformer-config.js';
import { sheetModel, acResistance, windingCapacitance, lossBreakdown, coreLossAt } from './transformer-physics.js';
import { effectiveInductance, loadedBranches, imposedBranches } from './transformer-network.js';
import { catalogFor, catalogAL, coreOpenings, assemblyStatus } from './transformer-cores.js';
import { windingNet } from './transformer-project.js';

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
  ...loadDefaults(), ...designDefaults(),
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
  const mode = transformerMode(c);
  const catalog = mode.magnetic === 'ferrite' ? catalogFor(c) : null;
  choice(mode, 'magnetic', ['air', 'ferrite']); choice(mode, 'topology', ['standard', 'tapped', 'multiple', 'multiple-tapped']);
  choice(c, 'lossModel', ['dc', 'ac']); choice(c, 'leakageModel', ['supplied', 'geometry', 'measured']);
  if (mode.surface) {
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
  if (!mode.topology.startsWith('multiple') && names.length !== 2) throw new Error('Choose Multiple secondaries to use S2/S3 layers.');
  if (mode.topology.startsWith('multiple') && (names.length < 3 || (names.includes('S3') && !names.includes('S2')))) throw new Error('Multiple secondaries needs P, S and S2, with optional S3.');
  const secCount = stack.filter(n => n === 'S').length;
  const tappedSecondary = mode.topology.includes('tapped');
  if (tappedSecondary && secCount % 2 !== 0) throw new Error('Center tap requires an even number of identical secondary layers.');
  if (tappedSecondary && windingSettings(c, 'S').connection === 'parallel') throw new Error('A center-tapped secondary needs series sections. Other windings may be parallel.');
  const turns = { P: c.primaryTurns, S: c.secondaryTurns, S2: c.secondary2Turns, S3: c.secondary3Turns };
  for (const n of names) { if (n === 'S2' || n === 'S3') range(c, n === 'S2' ? 'secondary2Turns' : 'secondary3Turns', 1, 60, true); }
  const { layers, z, assumedZ, fullLayers } = resolveStack(c, env.board, stack.length);
  const A = artwork({ name: env.name || 'T1', kind: 'transformer', family: c.family });
  A.meta.boardLayers = fullLayers;
  const base = {};
  for (const n of names) {
    const settings = windingSettings(c, n); range(settings, 'width', .1, 3); choice(settings, 'connection', ['series', 'parallel']);
    if (catalog) {
      const steps = turns[n]*128, pitch = settings.width+c.traceS;
      base[n] = Array.from({length:steps+1},(_,i)=>{const a=i/128*2*Math.PI,r=c.dOuter/2-pitch*i/128;
        const scale=r/Math.max(Math.abs(Math.cos(a)),Math.abs(Math.sin(a)));return [scale*Math.cos(a),scale*Math.sin(a)];});
      if(c.dOuter/2-pitch*turns[n]<=0)throw new Error(`${n} turns do not fit around the catalog core.`);
      continue;
    }
    const coil = buildCoil({ ...c, traceW: settings.width, turns: turns[n], layers: 1, sides: 4, fillet: 0.6, connection: 'series', padSize: settings.width, arrayEnabled: false });
    if (coil.spiral.turnsUsed !== turns[n]) throw new Error(`${n} turns do not fit. Increase diameter or reduce turns.`);
    base[n] = coil.layers[0].pts;
  }
  const maxWidth = Math.max(...names.map(n => windingSettings(c, n).width));
  const inner = Math.min(...names.map(n => minRadius(base[n]) - windingSettings(c, n).width / 2)) - c.traceS - c.viaPad / 2 - 0.1;
  const outer = c.dOuter / 2 + maxWidth / 2 + c.traceS + c.viaPad / 2 + 0.5;
  if (inner < 2 * (c.viaPad + c.traceS)) throw new Error('No clear central area for isolated transition vias. Increase diameter or reduce turns/width/clearance.');
  const core = mode.magnetic === 'ferrite' ? coreParameters(c, inner) : null;
  const slug = String(env.name || 'T1').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const windings = [];
  let padNumber = 1;
  for (const [wi, name] of names.entries()) {
    const indices = stack.map((n, i) => n === name ? i : -1).filter(i => i >= 0), count = indices.length;
    const { width, connection } = windingSettings(c, name), parallel = connection === 'parallel';
    const nodeCount = parallel ? 1 : count;
    // Catalog rectangular spirals must stay aligned with the core's leg slots.
    const sector=catalog&&names.length>2?Math.PI/2:2*Math.PI/names.length;
    const angle = wi * sector + (catalog ? Math.PI / 2 : 0);
    const delta = 2 * Math.asin((c.viaPad + c.traceS + maxWidth + 0.15) / (2 * inner));
    if (delta * (nodeCount + 1) > sector * 0.85) throw new Error('Transition vias need more angular clearance. Increase diameter or reduce layer count.');
    const net = windingNet(c,name,`${slug}_${name === 'P' ? 'PRI' : name === 'S' ? 'SEC' : `SEC${name.slice(1)}`}`);
    if(windings.some(w=>w.net===net))throw new Error('Separate windings must use separate nets.');
    const nodes = Array.from({ length: nodeCount + 1 }, (_, j) => {
      const theta = angle + (j - nodeCount / 2) * delta, baseRadius = j % 2 ? inner : outer;
      const terminal=j===0||j===nodeCount||(tappedSecondary&&name==='S'&&j===count/2),offset=terminal?(c.terminalOffsets?.[`${name}:${j}`]||0):0;
      if(!Number.isFinite(offset)||offset<0||offset>3)throw new Error('Terminal offsets must be between 0 and 3 mm.');
      const direction=j%2?-1:1,radius=baseRadius+direction*offset;
      if(radius<c.viaPad+c.traceS)throw new Error('Terminal is too close to the winding center.');
      if(core&&direction<0&&offset>0)coreParameters(c,radius);
      return { x: radius * Math.cos(theta), y: radius * Math.sin(theta), theta, radius, baseRadius, direction, terminal, id: `${name}:${j}` };
    });
    const paths = [], sections = [], terminalNames = [];
    for (let j = 0; j <= nodeCount; j++) {
      const node = nodes[j], tapped = tappedSecondary && name === 'S' && j === count / 2;
      if (j === 0 || j === nodeCount || tapped) {
        const text = tapped ? 'S_CT' : `${name}${j === 0 ? '+ (dot)' : '−'}`;
        A.pads.push(pad(node.x, node.y, { w: c.viaPad, drill: c.viaDrill, number: String(padNumber++), net, role: 'terminal', nodeId: node.id, winding: name }));
        A.ports.push({ x: node.x, y: node.y, name: text, net, nodeId:node.id,winding:name });
        A.labels.push(label(node.x, node.y + c.viaPad + 0.5, text));
        terminalNames.push(text);
      } else A.vias.push(via(node.x, node.y, { diameter: c.viaPad, drill: c.viaDrill, net, role: 'transition', nodeId: node.id, winding: name }));
    }
    for (let j = 0; j < count; j++) {
      const layer = indices[j], theta = parallel || catalog ? angle : angle + (j + 0.5 - count / 2) * delta;
      // Reverse traversal AND mirror geometry: all series sections circulate in the same direction.
      const raw = !parallel && j % 2 ? base[name].slice().reverse().map(([x, y]) => [x, -y]) : base[name];
      const pts = rotatePts(raw, theta);
      const start = nodes[parallel ? 0 : j], end = nodes[parallel ? 1 : j + 1];
      const first = fanLead(pts[0], start, theta), last = fanLead(pts.at(-1), end, theta);
      const poly = [...first.slice().reverse(), ...pts.slice(1), ...last.slice(1)];
      A.tracks.push(track(layers[layer], width, poly, { net, role: 'winding', startNode: start.id, endNode: end.id, winding: name, section: j }));
      const path = poly.map(([x, y]) => [x, y, z[layer]]);
      // Barrel spans only the electrical path between participating layers. Through stubs are excluded from L.
      if (!parallel && j > 0) paths.push([[nodes[j].x, nodes[j].y, z[indices[j - 1]]], [nodes[j].x, nodes[j].y, z[layer]]]);
      const length = path.slice(1).reduce((sum, p, k) => sum + Math.hypot(p[0]-path[k][0], p[1]-path[k][1]) * 1e-3, 0);
      paths.push(path); sections.push({ layer: layers[layer], z: z[layer], turns: turns[name], width, length, path, section: j });
    }
    windings.push({ name, net, turns: windingTurns(c, name, count), connection, width, layers: indices.map(i => layers[i]), nodes, paths, sections, terminals: terminalNames });
  }
  checkVias(A, windings, c.traceS);
  if (catalog) {
    // Extend the straight sides of the square spiral around a rectangular E
    // post without scaling trace width or turn spacing. Apply the same mapping
    // to routed artwork and model paths; shared point objects are visited once.
    const extension = (c.corePostH-c.corePostW)/2, visited = new Set();
    const extend = p => { if (!visited.has(p)) { visited.add(p); p[1] += Math.sign(p[1])*extension; } };
    A.tracks.forEach(t=>t.pts.forEach(extend));
    for(const p of [...A.pads,...A.vias,...A.ports,...A.labels])p.y += Math.sign(p.y)*extension;
    for(const q of windings){q.paths.forEach(path=>path.forEach(extend));q.nodes.forEach(p=>{p.y+=Math.sign(p.y)*extension;});
      q.sections.forEach(s=>{s.length=s.path.slice(1).reduce((sum,p,k)=>sum+Math.hypot(p[0]-s.path[k][0],p[1]-s.path[k][1])*1e-3,0);});}
  }
  const b = bounds(A), margin = 2;
  const halfWidth = catalog ? (catalog.widthMax ?? catalog.width+.65)/2+c.coreClearance : 0;
  A.outline.push({ layer: 'Edge.Cuts', pts: rect(Math.min(b.x0,-halfWidth) - margin, b.y0 - margin, Math.max(b.x1,halfWidth) + margin, b.y1 + margin) });
  if (core) {
    const w = c.corePostW + 2 * c.coreClearance, h = c.corePostH + 2 * c.coreClearance;
    const openings = catalog ? coreOpenings(c) : [c.coreShape === 'round' ? arcPts(0, 0, w / 2, 0, 2 * Math.PI, 0.025) : rect(-w / 2, -h / 2, w / 2, h / 2)];
    openings.forEach(pts=>A.outline.push({layer:'Edge.Cuts',pts}));
    A.labels.push(label(0, 0, 'Core post opening', { layer: 'Dwgs.User' }));
  }
  const notes = [info('Turns are per section. Series sections add turns; parallel sections share terminal voltage and retain the section turn count. Through-hole terminals expose internal layers.'), info('All terminals of a DC-connected winding share one net; separate windings have separate nets. Use net-tie symbols/footprints as appropriate when integrating winding terminals into a schematic.')];
  if (assumedZ) notes.push(warn('Layer heights use uniform spacing across the board. Enter actual copper center heights for an asymmetric stack-up.'));
  notes.push(info('Return wiring, conducting planes/shields, gap fringing and parasitic resonance are excluded. Interwinding capacitance is a separate common-mode estimate, not part of the differential load circuit.'));
  if (c.lossModel === 'ac' || c.leakageModel === 'geometry') notes.push(warn('Current-sheet leakage and Dowell copper loss are first-order estimates for thin concentric stacks below resonance. Validate against measurements or a field solver; gap fringing is excluded.'));
  if (core) notes.push(...core.notes);
  const model = core ? `Ferrite reluctance + ${c.leakageModel === 'geometry' ? 'current-sheet leakage' : c.leakageModel === 'measured' ? 'measured primary leakage' : 'supplied leakage fraction'}` : 'Air-core multi-winding Neumann matrix';
  A.meta.model = model; A.meta.stack = stack.map((winding, i) => ({ layer: layers[i], winding, z: z[i] }));
  const r = { art: A, bounds: bounds(A), layers, notes, model, windings, core, mode,temperature:c.tempC };
  r.assembly = catalog ? assemblyStatus(c, A) : null;
  if (r.assembly && !r.assembly.fits) throw new Error(r.assembly.issues[0]);
  if (opt.quick) return r;
  const rho = RHO_CU20 * (1 + ALPHA_CU * (c.tempC - 20)), t = c.copperOz * OZ_MM * 1e-3;
  const branches = windings.flatMap((q, port) => q.connection === 'parallel'
    ? q.sections.map(s => ({ name: `${q.name}/${s.layer}`, port, turns: s.turns, width: q.width, sections: [s], paths: [s.path] }))
    : [{ name: q.name, port, turns: q.turns, width: q.width, sections: q.sections, paths: q.paths }]);
  const F = branches.map(q => toFilaments(q.paths, Math.max(0.12, Math.min(0.8, (q.width + c.traceS) * 0.6)), opt.segmentCap || 1800));
  branches.forEach((q, i) => {
    const length = q.sections.reduce((sum, s) => sum + s.length, 0);
    q.resistance = rho * length / (q.width * 1e-3 * t) + rho * Math.max(0, F[i].totalLen - length) / (Math.PI * c.viaDrill * 1e-3 * 25e-6);
  });
  notes.push(info('Barrel plating is 25 µm. Parallel terminal buses are ideal equipotential connections; their shared barrel impedance and external leads are excluded.'));
  const sheet = sheetModel(c, branches), n = branches.length;
  let leakageScale = c.leakageFraction / (1 - c.leakageFraction);
  if (core && c.leakageModel === 'measured') {
    range(c, 'measuredLeakage', 1e-12, 1);
    if (names.length !== 2 || branches.length !== 2) throw new Error('Measured primary leakage override needs two series windings. Use geometry leakage for multiple outputs or parallel sections.');
    const x = c.measuredLeakage / (core.AL * windings[0].turns ** 2);
    leakageScale = (x + Math.sqrt(x*x + 4)) / 2 - 1;
  }
  const branchMatrix = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    const w = branches[i].width * 1e-3;
    for (let j = 0; j <= i; j++) {
      const common = core ? core.AL * branches[i].turns * branches[j].turns : 0;
      branchMatrix[i][j] = branchMatrix[j][i] = core
        ? common + (c.leakageModel === 'geometry' ? sheet.matrix[i][j] : i === j ? common * leakageScale : 0)
        : i === j ? inductanceOf(F[i], w, t, discretisationCorrection(F[i].totalLen/F[i].n,w,t)) : mutualOf(F[i],F[j],0);
    }
  }
  const ports = branches.map(q => q.port);
  const matrix = n === names.length ? branchMatrix : effectiveInductance(branchMatrix, ports, names.length);
  const resistances = names.map((_, p) => 1 / branches.filter(q => q.port === p).reduce((sum, q) => sum + 1/q.resistance, 0));
  r.network = { matrix: branchMatrix, resistanceMatrix: acResistance(c, branches, sheet).matrix, branches, ports, names, sheet };
  positiveMatrix(matrix);
  const coupling = matrix.map((row, i) => row.map((v, j) => v / Math.sqrt(matrix[i][i] * matrix[j][j])));
  const [L1, L2, M] = [matrix[0][0], matrix[1][1], matrix[0][1]], k = coupling[0][1];
  const outputs = windings.slice(1).map((q, j) => ({ name: q.name, turns: q.turns, ratio: windings[0].turns / q.turns, induced: 2 * Math.PI * c.freq * Math.abs(matrix[0][j + 1]) * c.current }));
  r.analysis = { L1, L2, M, k, ratio: outputs[0].ratio, R1: resistances[0], R2: resistances[1], leakage: L1 * (1 - k * k), induced: outputs[0].induced, loss: resistances.reduce((s, R, i) => s + R * (i ? c.secondaryCurrent : c.current) ** 2, 0), matrix, coupling, resistances, outputs, turns: windings.map(q => q.turns) };
  r.analysis.capacitance = windingCapacitance(c, windings);
  if (tappedSecondary) r.analysis.tapTurns = windings[1].turns / 2;
  if (core) {
    core.Bpeak = c.coreVoltage * Math.sqrt(2) / (2 * Math.PI * c.freq * windings[0].turns * c.coreAe * 1e-6);
    core.fluxUtilization = core.Bpeak / c.coreFluxLimit;
    core.loss = c.coreLossDensity > 0 ? c.coreLossDensity * 1e3 * c.coreAe * c.coreLe * 1e-9 : null;
    if (c.driveMode !== 'voltage' && core.Bpeak > c.coreFluxLimit) notes.push(warn('Sinusoidal drive exceeds the entered design flux limit. Increase turns/frequency/core area or reduce voltage. The linear model is not valid after saturation.'));
  }
  attachLoad(c, r);
  finishLosses(c, r);
  return r;
}

export function finishLosses(c, r) {
  if (!r.network) return;
  const a = r.analysis;
  if (r.core) {
    const loss = coreLossAt(c, r.core.Bpeak, c.coreAe * c.coreLe * 1e-9);
    r.core.loss = loss.watts; r.core.lossSource = loss.source;
  }
  const solved = a.loaded || imposedBranches(r.network, r.network.names.map((_, i) => i ? -c.secondaryCurrent : c.current), c.freq);
  a.branchCurrents = solved.branchCurrents;
  a.losses = lossBreakdown(c, r.network, solved.branchCurrents, r.core ? r.core.loss : 0);
  a.loss = a.losses.dc;
  a.estimatedEfficiency = a.loaded && a.losses.total != null && a.loaded.outputPower + a.losses.total > 0 ? a.loaded.outputPower / (a.loaded.outputPower + a.losses.total) : null;
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
  range(c, 'thermalResistance', 0, 10000); range(c, 'ambientTemperature', -40, 125); range(c, 'coreTemperature', -40, 200);
  const catalog = catalogFor(c);
  // The narrow factory-gapped preset needs a flat-side preliminary screen:
  // a circumscribed circle rejects its valid side-centered transition vias.
  // assemblyStatus checks every finished segment, pad and via against the
  // actual slots. Preserve the existing conservative screen for other cores.
  const radius = c.coreShape === 'round' || catalog?.factoryGap ? c.corePostW / 2 + c.coreClearance : Math.hypot(c.corePostW / 2 + c.coreClearance, (catalog ? c.corePostW : c.corePostH) / 2 + c.coreClearance);
  if (radius + c.viaPad / 2 + c.traceS >= inner) throw new Error('Core opening intersects the transition-via area. Increase winding diameter or reduce core post/turns.');
  if (c.boardT + 2 * c.coreClearance > c.coreWindowHeight) throw new Error('PCB plus assembly clearance exceeds the core window height.');
  const muR = CORE_MATERIALS[c.coreMaterial].muR || c.coreMuR;
  let AL = catalog ? catalogAL(c,catalog) : MU0 * c.coreAe * 1e-6 / (c.coreLe * 1e-3 / muR + c.coreGap * 1e-3);
  range(c, 'coreALMeasured', 0, 1); range(c, 'coreALScale', .1, 10);
  if(c.coreALMeasured>0)AL=c.coreALMeasured;
  AL *= c.coreALScale;
  const gapNote = catalog?.factoryGap ? [warn(catalog.alScope+' Factory machining is included in the listed parts. Verify clamps separately; flyback performance, bias and fringing loss require measurement.')] : catalog && c.coreGap > 0 ? [warn('Prepared EELP32 center-leg gap: AL uses the TDK nominal gap curve. Requires a supplier drawing, gap/AL acceptance testing and core installation. Ungapped catalog halves are not a substitute. This model does not validate a switching flyback or gap-fringing copper loss.')] : [];
  return { AL, muR, material: CORE_MATERIALS[c.coreMaterial].name, notes: [
    ...gapNote,
    info(c.coreALMeasured>0 ? 'Measured AL calibration overrides the magnetic-circuit/catalog value. Small-signal fit only; no nonlinear B-H curve, DC bias or temperature-dependent permeability.' : catalog ? 'Catalog AL uses the manufacturer’s nominal ungapped value or published prepared-gap curve. No nonlinear B-H curve, DC bias or temperature-dependent permeability.' : 'Linear magnetic-circuit estimate: AL = μ0·Ae/(le/μr + gap). No gap fringing, nonlinear B-H curve, DC bias or temperature-dependent permeability. Material presets supply nominal initial μ at 25 °C only.'),
    info(c.leakageModel === 'geometry' ? 'Leakage integrates current-sheet field energy through the actual winding stack. It excludes fringing and finite-core effects.' : c.leakageModel === 'measured' ? 'Leakage is calibrated to the supplied primary short-circuit inductance for two series windings.' : 'Leakage is an entered fraction of winding self-inductance. Coupling follows that assumption; interleaving does not change this estimate.'),
    info(c.driveMode === 'voltage' ? 'Loaded flux uses solved winding currents. Core dissipation is evaluated at that flux, frequency and the selected loss-data temperature, separately from the circuit.' : 'Flux uses the entered sinusoidal primary RMS voltage; copper loss separately uses entered RMS currents, with secondaries in antiphase to the primary. These are independent estimates.'),
    warn(catalog ? 'All three core-leg openings are included in the board export. Use the destination cutout check before direct placement, which does not modify board edges. Mechanical clearance does not establish an isolation rating.' : 'The core post cutout is included in the board export. Direct placement does not modify board edges: create this cutout and check the complete core assembly separately. Post geometry does not specify a purchasable core or an isolation rating.'),
  ] };
}

function attachLoad(c, r) {
  if (!r.analysis || c.driveMode !== 'voltage') return;
  const a = r.analysis, names = r.windings?.map(q => q.name) || ['P', 'S'];
  a.loaded = r.network ? loadedBranches(c, r.network) : loadedTransformer(c, a.matrix || [[a.L1, a.M], [a.M, a.L2]], a.resistances || [a.R1, a.R2], names);
  a.loss = a.loaded.copperLoss;
  r.notes.push(info(`Linear sinusoidal circuit with independent secondary loads. Circuit efficiency includes ${c.lossModel === 'ac' && r.network ? 'estimated AC and DC' : 'DC'} copper loss. Core loss is evaluated separately; rectifiers and switching waveforms are not modeled.`));
  if (transformerMode(c).topology.includes('tapped')) r.notes.push(info('The load is connected across the complete S winding. The center tap is open; asymmetric half-winding loads and rectifiers are not modeled.'));
  if (r.core) {
    const flux = (a.loaded.branchCurrents || a.loaded.currents).reduce((s, I, i) => C.add(s, C.scale(I, r.core.AL * (r.network?.branches[i].turns ?? r.windings[i].turns))), [0, 0]);
    r.core.Bpeak = Math.SQRT2 * C.abs(flux) / (c.coreAe * 1e-6);
    r.core.fluxUtilization = r.core.Bpeak / c.coreFluxLimit;
    if (r.core.Bpeak > c.coreFluxLimit) r.notes.push(warn('Loaded drive exceeds the design flux limit. The linear core model is outside its intended range.'));
    r.notes.push(info('Loaded peak flux comes from the common core flux AL × sum(N × I). Core loss does not alter the circuit solution.'));
  }
}
