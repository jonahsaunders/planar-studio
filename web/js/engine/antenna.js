/* Parametric antenna layouts. Each family declares its actual model scope. */
import { buildRoundOrSlot } from './round-slot-antennas.js';
import { buildDirectional, DIRECTIONAL_FAMILIES, directionalDefaults } from './directional-antennas.js';
import { buildPatch } from './patch-antenna.js';
import { artwork, pad, track, run, rect, bounds, label, transform, merge } from './artwork.js';
import { buildCoil, toFilaments, inductanceOf, discretisationCorrection, OZ_MM, RHO_CU20 } from './coil.js';
import { range, choice } from './creator-validation.js';

export const ANTENNA_FAMILIES = {
  patch: 'Edge-fed patch', 'inset-patch': 'Inset-fed patch', dipole: 'Printed dipole',
  'folded-dipole': 'Folded dipole', ifa: 'Inverted-F', mifa: 'Meandered inverted-F',
  'circular-patch': 'Circular patch', slot: 'Microstrip-fed slot',
  nfc: 'NFC loop', 'patch-array': 'Patch array',
  vivaldi: 'Vivaldi tapered slot', yagi: 'Printed Yagi', lpda: 'Printed log-periodic', bowtie: 'Bow-tie dipole',
};
export const MAX_ARRAY_DIMENSION = 32;
export const antennaExtras = () => ({
  ...directionalDefaults(),
  radiusScale: 1, slotScale: 1, slotWidth: 1.5, slotStub: 5,
  family: 'patch', insetFraction: 0.32, insetGap: 0.4, edgeResistance: 300,
  traceW: 0.8, feedGap: 1, armScale: 0.95, foldSpacing: 3, groundWidth: 45,
  groundLength: 30, antennaHeight: 6, feedOffset: 2, meanderRuns: 5, meanderPitch: 2,
  loopShape: 'circle', loopTurns: 3, loopDiameter: 40, loopGap: 0.4,
  targetLoopL: 1e-6, parasiticPf: 5, arrayRows: 2, arrayCols: 2,
  spacingX: 0.6, spacingY: 0.6, arrayFeed: 'individual',
});
const info = text => ({ level: 'info', text });
const warn = text => ({ level: 'warn', text });
function terminal(A, x, y, number, net, width, name) {
  A.pads.push(pad(x, y, { w: width, number: String(number), net, role: 'terminal' }));
  A.ports.push({ x, y, net, name });
}
function finish(A, analysis, notes, model, capabilities) {
  A.meta.model = model; A.meta.capabilities = capabilities;
  return { art: A, bounds: bounds(A), layers: [...new Set([...A.tracks, ...A.pads].map(p => p.layer))], analysis, notes, model, capabilities };
}
function clearanceGuide(A, x0, y0, x1, y1, text) {
  A.outline.push({ layer: 'Dwgs.User', pts: rect(x0, y0, x1, y1) });
  A.labels.push(label((x0 + x1) / 2, y1 + 1.5, text, { layer: 'Dwgs.User' }));
}
export function buildAntenna(input, env = {}, opt = {}) {
  const c = { ...antennaExtras(), ...input };
  choice(c, 'family', Object.keys(ANTENNA_FAMILIES));
  range(c, 'freq', c.family === 'nfc' ? 1e5 : 1e8, c.family === 'nfc' ? 30e6 : 30e9);
  range(c, 'boardT', 0.05, 10); range(c, 'epsR', 1.01, 20);
  range(c, 'copperOz', 0.25, 4); range(c, 'margin', 0.1, 100);
  if (DIRECTIONAL_FAMILIES.includes(c.family)) return buildDirectional(c, env);
  if (['circular-patch', 'slot'].includes(c.family)) return buildRoundOrSlot(c, env);
  if (c.family === 'nfc') return nfc(c, env, opt);
  if (['dipole', 'folded-dipole', 'ifa', 'mifa'].includes(c.family)) return wireAntenna(c, env);
  if (c.family === 'patch-array') return patchArray(c, env);
  const r = buildPatch(c, env);
  r.model = 'Patch transmission-line estimate';
  r.capabilities = ['Starting dimensions', 'Estimated resonance', 'Feed-line impedance'];
  if (c.family === 'inset-patch') {
    range(c, 'insetFraction', 0.01, 0.45); range(c, 'insetGap', 0.1, 5); range(c, 'edgeResistance', 1, 5000);
    const { W, L, feedW } = r.analysis, depth = L * c.insetFraction, slotW = feedW + 2 * c.insetGap;
    if (slotW >= W - 2 * c.insetGap) throw new Error('Inset slot is wider than the patch. Reduce feed width or inset gap.');
    const net = env.net || 'RF', A = r.art;
    A.pads = A.pads.filter(p => p.role !== 'patch');
    // Exact union of three rectangles: no ground/signal bridge across the slot.
    const sideW = (W - slotW) / 2;
    for (const s of [-1, 1]) A.pads.push(pad(s * (slotW + sideW) / 2, -L / 2 + depth / 2, { w: sideW, h: depth, shape: 'rect', number: '1', net, role: 'patch' }));
    A.pads.push(pad(0, depth / 2, { w: W, h: L - depth, shape: 'rect', number: '1', net, role: 'patch' }));
    A.tracks[0].pts[1][1] = -L / 2 + depth + feedW / 2;
    r.analysis.insetDepth = depth;
    r.analysis.inputResistance = c.edgeResistance * Math.cos(Math.PI * depth / L) ** 2;
    r.notes.push(info('Inset resistance uses the entered edge resistance × cos²(π·depth/L). It is a matching estimate; slot loading and feed reactance are not solved.'));
    r.capabilities.push('Inset resistance estimate from supplied edge resistance');
  }
  r.art.meta.family = c.family; r.art.meta.model = r.model; r.art.meta.capabilities = r.capabilities;
  return r;
}

function wireAntenna(c, env) {
  range(c, 'traceW', 0.1, 5); range(c, 'armScale', 0.5, 1.5); range(c, 'feedGap', 0.1, 10);
  const A = artwork({ name: env.name || 'ANT1', kind: 'antenna', family: c.family });
  // Exposed printed conductors: a deliberately simple effective-medium estimate.
  const ee = (c.epsR + 1) / 2, lambda0 = 299792458e3 / c.freq;
  const half = lambda0 / (2 * Math.sqrt(ee)) * c.armScale, w = c.traceW;
  const notes = [info('First-order electrical-length starting geometry. No S11, radiation pattern, gain, efficiency or bandwidth prediction; tune on the actual board and enclosure.')];
  const differential = ['dipole', 'folded-dipole'].includes(c.family);
  let pathLength;
  if (differential) {
    // Feed gap is edge-to-edge; tracks and circular terminals have round caps.
    const gap = c.feedGap + w, span = half;
    if (span < gap + 4 * w) throw new Error('Dipole is too short for its trace width and feed gap.');
    const left = -span / 2, right = span / 2;
    if (c.family === 'dipole') {
      for (const [s, net] of [[-1, 'RF_P'], [1, 'RF_N']]) {
        A.tracks.push(track('F.Cu', w, run(s * gap / 2, 0, s * span / 2, 0), { net, role: 'radiator' }));
      }
      terminal(A, -gap / 2, 0, 1, 'RF_P', w, 'Balanced +');
      terminal(A, gap / 2, 0, 2, 'RF_N', w, 'Balanced −');
      pathLength = span - gap;
    } else {
      range(c, 'foldSpacing', w + 0.1, 30);
      // One DC-connected folded conductor; both feed terminals intentionally share its net.
      const net = env.net || 'RF';
      A.tracks.push(track('F.Cu', w, [[-gap / 2, 0], [left, 0], [left, c.foldSpacing], [right, c.foldSpacing], [right, 0], [gap / 2, 0]], { net, role: 'radiator' }));
      terminal(A, -gap / 2, 0, 1, net, w, 'Balanced feed +');
      terminal(A, gap / 2, 0, 2, net, w, 'Balanced feed − (DC connected)');
      pathLength = 2 * span - gap + 2 * c.foldSpacing;
      notes.push(info('The folded conductor joins both feed pads at DC. Use a differential source or suitable balun; terminal impedance is not estimated.'));
    }
    clearanceGuide(A, left - c.margin, -c.margin - w, right + c.margin, (c.family === 'folded-dipole' ? c.foldSpacing : 0) + c.margin + w, 'ANTENNA: keep other copper clear on all layers');
    notes.push(info('Balanced feed required. The drawing marks an all-layer copper-clearance region; it is a guide, not a KiCad rule area.'));
    return finish(A, { span, conductorLength: pathLength, ee, lambda0 }, notes, 'Printed half-wave starting dimensions', ['Geometry', 'Electrical-length estimate']);
  }
  range(c, 'groundWidth', 5, 300); range(c, 'groundLength', 5, 300);
  range(c, 'antennaHeight', w + 0.2, 100); range(c, 'feedOffset', w + 0.2, 50);
  const height = c.antennaHeight, length = half / 2, feedX = c.feedOffset;
  let pts;
  if (c.family === 'ifa') {
    const arm = length - height;
    if (arm <= feedX + w) throw new Error('Quarter-wave path is too short for this height/feed offset. Reduce height or frequency.');
    pts = [[0, 0], [0, height], [arm, height]];
  } else {
    range(c, 'meanderRuns', 3, 15, true); range(c, 'meanderPitch', w + 0.2, 20);
    const n = c.meanderRuns, pitch = c.meanderPitch;
    const runLength = (length - height - (n - 1) * pitch) / n;
    if (runLength <= feedX + w) throw new Error('Not enough electrical length for the meander. Reduce runs, pitch, height or frequency.');
    pts = [[0, 0], [0, height]];
    // Fold away from the board, keeping the short and feed outside every return run.
    for (let i = 0; i < n; i++) {
      pts.push([i % 2 ? 0 : runLength, height + i * pitch]);
      if (i < n - 1) pts.push([i % 2 ? 0 : runLength, height + (i + 1) * pitch]);
    }
  }
  const xmax = Math.max(...pts.map(p => p[0])), ymax = Math.max(...pts.map(p => p[1]));
  if (xmax + 2 * w > c.groundWidth) throw new Error('Antenna exceeds the ground-board width. Increase ground width.');
  // IFA is DC grounded; all continuous metal must use GND, including the RF tap.
  A.pads.push(pad(c.groundWidth / 2 - w, -c.groundLength / 2 - w / 2, { w: c.groundWidth, h: c.groundLength, shape: 'rect', number: '2', net: 'GND', role: 'ground' }));
  A.tracks.push(track('F.Cu', w, [[0, -w], ...pts], { net: 'GND', role: 'radiator' }));
  A.tracks.push(track('F.Cu', w, run(feedX, w + c.feedGap, feedX, height), { net: 'GND', role: 'feed' }));
  if (w + c.feedGap >= height - w) throw new Error('Feed gap leaves no room for the IFA feed. Increase antenna height or reduce feed gap.');
  terminal(A, feedX, w + c.feedGap, 1, 'GND', w, 'RF tap (DC grounded)');
  A.ports.push({ x: 0, y: -c.groundLength / 2, net: 'GND', name: 'Ground reference' });
  clearanceGuide(A, -c.margin - w, 0, xmax + c.margin + w, ymax + c.margin + w, 'ANTENNA: no copper behind radiator');
  notes.push(info('The shorted radiator and RF tap are DC-connected to GND. Connect the radio through a series matching/DC-block component to this tap. Do not assign a separate RF net to continuous grounded copper.'));
  notes.push(info('Ground dimensions are part of this starting layout. The radiator clearance is a drawing guide; keep intermediate/back copper clear and tune with the final ground and enclosure.'));
  return finish(A, { conductorLength: length, ee, lambda0, span: xmax }, notes, 'Quarter-wave path-length estimate', ['Geometry', 'Electrical-length estimate']);
}

function nfc(c, env, opt) {
  range(c, 'loopTurns', 1, 20, true); range(c, 'loopDiameter', 5, 200);
  range(c, 'traceW', 0.1, 5); range(c, 'loopGap', 0.1, 5); range(c, 'parasiticPf', 0, 10000);
  choice(c, 'loopShape', ['circle', 'polygon']);
  const coil = buildCoil({ ...c, shape: c.loopShape, turns: c.loopTurns, dOuter: c.loopDiameter, traceS: c.loopGap, layers: 1, connection: 'series', sides: 4, fillet: 0.5, ppt: 128, padSize: c.traceW });
  if (coil.spiral.turnsUsed !== c.loopTurns || coil.innerR < c.traceW) throw new Error('NFC turns do not fit. Increase loop diameter or reduce turns/width/gap.');
  const A = artwork({ name: env.name || 'ANT1', kind: 'antenna', family: 'nfc' }), pts = coil.layers[0].pts, net = env.net || 'RF';
  A.tracks.push(track('F.Cu', c.traceW, pts, { net, role: 'nfc-loop' }));
  terminal(A, ...pts[0], 1, net, c.traceW, 'Loop outer');
  terminal(A, ...pts.at(-1), 2, net, c.traceW, 'Loop inner');
  const b = bounds(A);
  clearanceGuide(A, b.x0 - c.margin, b.y0 - c.margin, b.x1 + c.margin, b.y1 + c.margin, 'NFC: keep nearby metal clear');
  const notes = [info('Free-space loop inductance and DC resistance. No ferrite backing, nearby-metal loss, reader IC load, AC Q or read-range prediction.'), warn('The inner surface terminal needs an insulated jumper or separately checked breakout layer. Both terminals belong to the same DC-connected loop net.')];
  let a;
  if (!opt.quick) {
    const F = toFilaments([pts.map(([x, y]) => [x, y, 0])], 0.4, opt.segmentCap || 1800);
    const w = c.traceW * 1e-3, t = c.copperOz * OZ_MM * 1e-3;
    const L = inductanceOf(F, w, t, discretisationCorrection(F.totalLen / F.n, w, t));
    if (!(L > 0) || !Number.isFinite(L)) throw new Error('NFC inductance solve failed.');
    const totalC = 1 / ((2 * Math.PI * c.freq) ** 2 * L), externalC = totalC - c.parasiticPf * 1e-12;
    a = { inductance: L, resistance: RHO_CU20 * F.totalLen / (w * t), totalC, externalC: externalC > 0 ? externalC : null, conductorLength: F.totalLen * 1000 };
    if (externalC <= 0) notes.push(warn('Entered parasitic capacitance already exceeds the resonant total. Positive external tuning capacitance cannot reach this frequency.'));
    notes.push(info('Tuning C assumes an ideal unloaded LC resonance, with entered parallel parasitics subtracted. Final IC matching requires its input model or measurement.'));
  }
  return finish(A, a, notes, 'NFC Neumann inductance + ideal LC tuning', ['Numerical inductance', 'DC resistance at 20 °C', 'Unloaded tuning capacitance']);
}

export function sizeNfcLoop(input) {
  const c = { ...antennaExtras(), ...input, family: 'nfc' };
  range(c, 'targetLoopL', 1e-9, 1e-3);
  let lo = Math.max(5, 2 * ((c.traceW + c.loopGap) * c.loopTurns + 2 * c.traceW) / (c.loopShape === 'polygon' ? Math.SQRT1_2 : 1)), hi = 200;
  if (lo >= hi) throw new Error('These turns cannot fit within the 200 mm loop limit.');
  const value = d => buildAntenna({ ...c, loopDiameter: d }, {}).analysis.inductance;
  if (value(lo) > c.targetLoopL || value(hi) < c.targetLoopL) throw new Error('Target inductance is outside the diameter range for these turns. Change turns or target.');
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (value(mid) < c.targetLoopL) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function patchArray(c, env) {
  range(c, 'arrayRows', 1, MAX_ARRAY_DIMENSION, true); range(c, 'arrayCols', 1, MAX_ARRAY_DIMENSION, true);
  range(c, 'spacingX', 0.3, 1.5); range(c, 'spacingY', 0.3, 1.5);
  choice(c, 'arrayFeed', ['individual', 'tree']);
  const element = buildPatch(c, env), { W, L, feedW, lambda0 } = element.analysis;
  const dx = c.spacingX * lambda0, dy = c.spacingY * lambda0;
  const feedDepth = c.arrayFeed === 'tree' ? (Math.ceil(Math.log2(c.arrayCols)) + 1) * (feedW + 2) : 0;
  if ((c.arrayCols > 1 && dx < W + 2 * c.margin) || (c.arrayRows > 1 && dy < L + c.feedLength + feedDepth + 2 * c.margin)) throw new Error('Array cells overlap or leave too little feed clearance. Increase spacing.');
  const A = artwork({ name: env.name || 'ANT1', kind: 'antenna', family: 'patch-array' });
  const rowPorts = [];
  for (let row = 0; row < c.arrayRows; row++) {
    const ports = [];
    for (let col = 0; col < c.arrayCols; col++) {
      const x = (col - (c.arrayCols - 1) / 2) * dx, y = (row - (c.arrayRows - 1) / 2) * dy;
      const idx = row * c.arrayCols + col + 1, net = c.arrayFeed === 'tree' ? (env.net || 'RF') : `RF_${idx}`;
      const one = transform(element.art, { dx: x, dy: y });
      one.pads = one.pads.filter(p => p.role !== 'ground').map(p => ({ ...p, net, number: String(idx) }));
      one.tracks.forEach(t => { t.net = net; }); one.outline = []; one.ports = [];
      merge(A, one);
      ports.push([x, y - L / 2 - c.feedLength]);
      if (c.arrayFeed === 'individual') A.ports.push({ x: ports.at(-1)[0], y: ports.at(-1)[1], net, name: `Element ${idx}` });
    }
    if (c.arrayFeed === 'tree') rowPorts.push(feedTree(A, ports, feedW, env.net || 'RF', 'y'));
  }
  if (c.arrayFeed === 'tree') {
    // Row fanout lives outside the left edge, below each row's elements.
    const left = -(c.arrayCols - 1) * dx / 2 - W / 2 - c.margin;
    const ends = rowPorts.map(p => { const q = [left, p[1]]; A.tracks.push(track('F.Cu', feedW, [p, q], { net: env.net || 'RF', role: 'array-feed' })); return q; });
    const p = feedTree(A, ends, feedW, env.net || 'RF', 'x');
    A.ports.push({ x: p[0], y: p[1], net: env.net || 'RF', name: 'Array feed' });
  }
  const b = bounds(A), gx0 = b.x0 - c.margin, gx1 = b.x1 + c.margin, gy0 = b.y0 - c.margin, gy1 = b.y1 + c.margin;
  A.pads.push(pad((gx0 + gx1) / 2, (gy0 + gy1) / 2, { w: gx1 - gx0, h: gy1 - gy0, shape: 'rect', number: String(c.arrayRows * c.arrayCols + 1), layer: 'B.Cu', net: 'GND', role: 'ground' }));
  A.ports.push({ x: gx0, y: gy0, net: 'GND', name: 'Back ground' });
  A.outline.push({ layer: 'Edge.Cuts', pts: rect(gx0 - 0.5, gy0 - 0.5, gx1 + 0.5, gy1 + 0.5) });
  // Resolve narrow lobes as the electrical aperture grows; retain the original
  // one-degree grid for small arrays and always include broadside exactly.
  const samplesPerDegree = Math.max(1, Math.ceil(Math.max(c.arrayCols * c.spacingX, c.arrayRows * c.spacingY) / 4));
  const angles = Array.from({ length: 180 * samplesPerDegree + 1 }, (_, i) => i / samplesPerDegree - 90);
  const cut = (n, spacing) => angles.map(deg => {
    const phase = 2 * Math.PI * spacing * Math.sin(deg * Math.PI / 180);
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { re += Math.cos(i * phase); im += Math.sin(i * phase); }
    return 20 * Math.log10(Math.max(1e-3, Math.hypot(re, im) / n));
  });
  const notes = [...element.notes, info('Array-factor cuts assume ideal equal-amplitude, equal-phase point elements. They exclude the patch element pattern, mutual coupling and feed effects; these are not realized gain/radiation predictions.')];
  if (c.arrayFeed === 'tree') notes.push(warn('Generated feed tree uses the entered line impedance throughout. T-junction matching and electrical path balancing are not synthesized; simulate and tune before use. The ideal array-factor plot does not model this feed.'));
  else notes.push(info('Each element has its own RF_n net and port. Supply the desired amplitude/phase with an external feed network.'));
  return finish(A, { ...element.analysis, rows: c.arrayRows, cols: c.arrayCols, elements: c.arrayRows * c.arrayCols, boardWidth: gx1 - gx0 + 1, boardHeight: gy1 - gy0 + 1, dx, dy, angles, arrayFactorX: cut(c.arrayCols, c.spacingX), arrayFactorY: cut(c.arrayRows, c.spacingY) }, notes, 'Patch estimate + ideal array factor', ['Element dimensions', 'Estimated element resonance', 'Ideal normalized array factor']);
}

function feedTree(A, points, width, net, axis) {
  if (points.length === 1) return points[0];
  const mid = Math.floor(points.length / 2), coord = axis === 'y' ? 1 : 0, cross = 1 - coord;
  const children = [feedTree(A, points.slice(0, mid), width, net, axis), feedTree(A, points.slice(mid), width, net, axis)];
  const p = [];
  p[coord] = Math.min(...children.map(q => q[coord])) - width - 2;
  p[cross] = (children[0][cross] + children[1][cross]) / 2;
  for (const q of children) {
    const elbow = [...q]; elbow[coord] = p[coord];
    A.tracks.push(track('F.Cu', width, [q, elbow, p], { net, role: 'array-feed' }));
  }
  return p;
}
