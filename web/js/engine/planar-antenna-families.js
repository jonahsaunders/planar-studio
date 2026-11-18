import { arcPts, artwork, bounds, boundsCopper, pad, rect, run, TAU, track, via } from './artwork.js';
import { segmentDistance } from './boardcheck.js';
import { polyLength, OZ_MM } from './coil.js';
import { choice, range } from './creator-validation.js';
import { microstripWidth } from './microstrip.js';
import { hasNonlocalContact } from './series-routing.js';

const C0 = 299792458e3;
const copperOverlap = 0.02; // Positive copper area at seams, including after export.
const warn = text => ({ level: 'warn', text });
const info = text => ({ level: 'info', text });

export const PLANAR_ANTENNA_FAMILIES = {
  monopole: 'Printed quarter-wave monopole',
  'full-wave-loop': 'Full-wave printed loop',
  'truncated-patch': 'Corner-truncated CP patch',
  'archimedean-spiral': 'Two-arm Archimedean spiral',
  'siw-slot-array': 'SIW slot array',
};

export const planarAntennaDefaults = () => ({
  cpCornerCut: 0.1, cpDiagonal: 'ascending', cpProfileStep: 0.1,
  spiralTurns: 2.5, spiralInnerRadius: 1.2, spiralOuterScale: 1.4, spiralDirection: 'ccw', spiralClearance: 0.3,
  siwSlots: 4, siwCutoffRatio: 0.72, siwSlotScale: 1, siwSlotWidth: 1,
  siwSlotOffset: 0.16, siwViaDiameter: 0.8, siwViaDrill: 0.4, siwViaPitch: 1.4,
  siwTaperLength: 0.3, siwTaperWidth: 0.45,
});

function plate(art, [x0, y0, x1, y1], net, number, role, layer = 'F.Cu') {
  art.pads.push(pad((x0 + x1) / 2, (y0 + y1) / 2, {
    shape: 'rect', w: x1 - x0, h: y1 - y0, net, number, role, layer, mask: false,
  }));
}

function port(art, x, y, net, name, layer = 'F.Cu') {
  art.ports.push({ x, y, net, name, layer });
}

function terminal(art, [x, y], width, number, net, name) {
  art.pads.push(pad(x, y, { w: width, number, net, role: 'terminal' }));
  port(art, x, y, net, name);
}

function feedWidth(c, env) {
  if (env.board?.layerCount < 2) throw new Error('This antenna needs front and back copper.');
  range(c, 'feedZ', 20, 150);
  range(c, 'feedLength', 1, 200);
  const w = microstripWidth(c.feedZ, c.boardT, c.epsR, { t: c.copperOz * OZ_MM, f: c.freq });
  if (w < 0.1) throw new Error('The feed line is below 0.1 mm. Increase the substrate spacing or lower the feed impedance.');
  return w;
}

const exposedEr = c => (1 + c.epsR) / 2;

function buildMonopole(art, c, env) {
  const width = range(c, 'traceW', 0.1, 5);
  const scale = range(c, 'armScale', 0.5, 1.5);
  const groundWidth = range(c, 'groundWidth', 5, 200);
  const groundLength = range(c, 'groundLength', 5, 200);
  const feedW = feedWidth(c, env);
  const ee = exposedEr(c);
  const length = C0 / (4 * c.freq * Math.sqrt(ee)) * scale;
  if (length <= 2 * width) throw new Error('The radiator is too short for its trace width. Reduce the frequency or trace width.');
  if (groundWidth <= feedW || groundLength < c.feedLength + feedW / 2) {
    throw new Error('The ground plane must cover the feed line. Enlarge the ground or shorten the feed.');
  }
  const net = env.net || 'RF';
  art.tracks.push(
    track('F.Cu', feedW, run(0, -c.feedLength, 0, 0), { net, role: 'feed' }),
    track('F.Cu', width, run(0, 0, 0, length - width / 2), { net, role: 'radiator' }),
  );
  terminal(art, [0, -c.feedLength], feedW, '1', net, 'Microstrip RF feed');
  plate(art, [-groundWidth / 2, -groundLength, groundWidth / 2, 0], 'GND', '2', 'ground', 'B.Cu');
  const groundPoint = groundLength * (c.feedLength > groundLength / 2 ? 0.2 : 0.8);
  port(art, 0, -groundPoint, 'GND', 'Back ground', 'B.Cu');
  const margin = c.margin / 2;
  art.outline.push({ layer: 'Dwgs.User', pts: rect(-width / 2 - margin, 0, width / 2 + margin, length + margin) });
  return {
    model: 'Quarter-wave monopole length estimate',
    analysis: { length, width, feedW, ee, groundWidth, groundLength, resonance: C0 / (4 * length * Math.sqrt(ee)) },
    capabilities: ['Quarter-wave starting length', 'Feed-line width', 'Ground-plane dimensions'],
    notes: [warn('Keep copper clear beneath and beside the radiating strip on all layers. The drawing guide does not create a KiCad keepout. Finite ground and enclosure changes can shift resonance.')],
  };
}

function buildLoop(art, c, env) {
  const width = range(c, 'traceW', 0.1, 5);
  const gap = range(c, 'feedGap', 0.1, 10);
  const scale = range(c, 'armScale', 0.5, 1.5);
  const ee = exposedEr(c);
  const targetLength = C0 * scale / (c.freq * Math.sqrt(ee));
  const openingAt = r => 2 * Math.asin((gap + width) / (2 * r));
  let lo = Math.max(2 * (gap + width), 4 * width);
  if ((TAU - openingAt(lo)) * lo > targetLength) {
    throw new Error('The loop is too small for its feed gap and trace width. Reduce the frequency, gap, or width.');
  }
  let hi = lo + targetLength / TAU;
  for (let i = 0; i < 40; i++) {
    const r = (lo + hi) / 2;
    if ((TAU - openingAt(r)) * r < targetLength) lo = r;
    else hi = r;
  }
  const radius = (lo + hi) / 2, opening = openingAt(radius);
  const start = -Math.PI / 2 + opening / 2;
  const points = arcPts(0, 0, radius, start, start + TAU - opening, Math.min(0.05, Math.sqrt(0.08 / radius)));
  const net = env.net || 'RF';
  const length = polyLength(points, false);
  art.tracks.push(track('F.Cu', width, points, { net, role: 'loop' }));
  terminal(art, points[0], width, '1', net, 'RF+');
  terminal(art, points.at(-1), width, '2', net, 'RF−');
  art.meta.exactPaths = true;
  return {
    model: 'Full-wave loop perimeter estimate',
    analysis: { radius, length, width, gap, ee, resonance: C0 / (length * Math.sqrt(ee)) },
    capabilities: ['Single-turn loop dimensions', 'Length-based resonance estimate', 'Balanced feed locations'],
    notes: [info('The loop is one DC-connected conductor around the opening. Use a balanced feed or external balun and provide DC isolation if the radio requires it.'), warn('Keep copper clear beneath the loop. The perimeter estimate excludes loading from the board, enclosure and feed.')],
  };
}

function buildTruncatedPatch(art, c, env) {
  const trimRatio = range(c, 'cpCornerCut', 0.02, 0.28);
  const stepLimit = range(c, 'cpProfileStep', 0.01, 1);
  const diagonal = choice(c, 'cpDiagonal', ['ascending', 'descending']) === 'ascending' ? 1 : -1;
  const scale = range(c, 'lengthScale', 0.5, 1.5);
  const feedW = feedWidth(c, env);
  const h = c.boardT, er = c.epsR;
  const cavity = side => {
    const ee = exposedEr(c) + (er - 1) / (2 * Math.sqrt(1 + 12 * h / side));
    const extension = 0.412 * h * (ee + 0.3) * (side / h + 0.264) / ((ee - 0.258) * (side / h + 0.8));
    return C0 / (2 * (side + 2 * extension) * Math.sqrt(ee));
  };
  let lo = h, hi = C0 / (2 * c.freq);
  if (cavity(lo) <= c.freq) throw new Error('The substrate is too thick for this patch at the target frequency.');
  for (let i = 0; i < 44; i++) {
    const mid = (lo + hi) / 2;
    if (cavity(mid) > c.freq) lo = mid;
    else hi = mid;
  }
  const side = (lo + hi) / 2 * scale, half = side / 2, cut = trimRatio * side;
  if (side <= h || feedW >= side - 2 * cut) throw new Error('The patch cannot fit the feed and corner cuts. Use a thinner substrate, smaller cuts, or a narrower feed.');
  const steps = Math.ceil(cut / stepLimit), step = cut / steps;
  if (steps > 4096) throw new Error('Increase the copper edge step or reduce the patch size.');
  const overlap = Math.min(copperOverlap, step / 2);
  const net = env.net || 'RF';
  plate(art, [-half, -half + cut, half, half - cut], net, '1', 'patch-body');
  for (const sideSign of [-1, 1]) {
    for (let i = 0; i < steps; i++) {
      const inner = half - cut + i * step, outer = inner + step;
      const [y0, y1] = sideSign > 0 ? [inner - overlap, outer] : [-outer, -inner + overlap];
      const cutWidth = step * (i + 1), right = diagonal * sideSign > 0;
      plate(art, [right ? -half : -half + cutWidth, y0, right ? half - cutWidth : half, y1], net, '1', 'patch-corner');
    }
  }
  const feedY = -half - c.feedLength, groundHalf = half + c.margin;
  art.tracks.push(track('F.Cu', feedW, run(0, feedY, 0, -half + feedW / 2), { net, role: 'feed' }));
  terminal(art, [0, feedY], feedW, '1', net, 'Microstrip RF feed');
  plate(art, [-groundHalf, feedY - feedW / 2 - c.margin, groundHalf, groundHalf], 'GND', '2', 'ground', 'B.Cu');
  port(art, 0, -half, 'GND', 'Back ground', 'B.Cu');
  return {
    model: 'Square patch cavity reference with two corner trims',
    analysis: { side, cut, steps, step, feedW, resonance: cavity(side) },
    capabilities: ['Untrimmed square resonance reference', 'Opposite corner cuts', 'Feed-line width'],
    notes: [info('The opposite trims split the two modes of the square patch. Switching the trimmed diagonal mirrors the layout while keeping the same feed edge.'), warn('Tune the corner cuts and feed in an EM model or on the bench. The displayed resonance is for the untrimmed square. Axial ratio and polarization sense are not predicted.')],
  };
}

function armSpacingClear(arms, distance) {
  const segments = arms.flatMap((path, arm) => path.slice(1).map((b, i) => {
    const a = path[i];
    return { a, b, arm, left: Math.min(a[0], b[0]), right: Math.max(a[0], b[0]), low: Math.min(a[1], b[1]), high: Math.max(a[1], b[1]) };
  })).sort((a, b) => a.left - b.left);
  for (const [i, a] of segments.entries()) {
    for (let j = i + 1; j < segments.length && segments[j].left < a.right + distance; j++) {
      const b = segments[j];
      if (a.arm === b.arm || a.high + distance < b.low || b.high + distance < a.low) continue;
      if (segmentDistance(a.a, a.b, b.a, b.b) < distance) return false;
    }
  }
  return true;
}

function buildSpiral(art, c) {
  const width = range(c, 'traceW', 0.1, 5);
  const gap = range(c, 'spiralClearance', 0.1, 5);
  const turns = range(c, 'spiralTurns', 1, 8);
  const inner = range(c, 'spiralInnerRadius', 0.15, 30);
  const outerScale = range(c, 'spiralOuterScale', 1.05, 3);
  const sign = choice(c, 'spiralDirection', ['cw', 'ccw']) === 'ccw' ? 1 : -1;
  const ee = exposedEr(c), active = C0 / (TAU * c.freq * Math.sqrt(ee)), outer = active * outerScale;
  const separation = width + gap + 0.002;
  if (inner >= active || 2 * inner < separation || (outer - inner) / (2 * turns) < separation) {
    throw new Error('The spiral cannot fit the target active region and arm clearance. Reduce the turns, inner radius, or trace width, or increase the outer radius scale.');
  }
  const samples = Math.ceil(TAU * turns / Math.min(Math.PI / 48, Math.sqrt(0.08 / outer)));
  const arms = [0, Math.PI].map(phase => Array.from({ length: samples + 1 }, (_, i) => {
    const f = i / samples, r = inner + (outer - inner) * f, theta = phase + sign * TAU * turns * f;
    return [r * Math.cos(theta), r * Math.sin(theta)];
  }));
  if (!armSpacingClear(arms, separation) || arms.some(points => hasNonlocalContact(points, separation))) {
    throw new Error('Spiral copper falls below the arm clearance. Reduce the turns or trace width, or increase the outer radius scale.');
  }
  for (const [i, points] of arms.entries()) {
    const net = i ? 'RF_N' : 'RF_P';
    art.tracks.push(track('F.Cu', width, points, { net, role: 'spiral-arm' }));
    terminal(art, points[0], width, String(i + 1), net, i ? 'RF−' : 'RF+');
  }
  art.meta.exactPaths = true;
  return {
    model: 'Archimedean geometry with an active-radius estimate',
    analysis: { turns, inner, outer, active, ee, width, gap, armLength: polyLength(arms[0], false) },
    capabilities: ['Interleaved balanced arms', 'Checked arm clearance', 'Target active-region radius estimate'],
    notes: [info('Feed the two isolated centre terminals from a balanced source or an external balun. Winding direction is viewed from the front copper.'), warn('Keep other copper clear beneath the arms unless you are designing a backing cavity. The active-radius estimate does not establish impedance, axial ratio or bandwidth.')],
  };
}

function buildSiw(art, c, env) {
  const feedW = feedWidth(c, env);
  const count = range(c, 'siwSlots', 1, 16, true);
  const ratio = range(c, 'siwCutoffRatio', 0.55, 0.9);
  const slotScale = range(c, 'siwSlotScale', 0.65, 1.35);
  const slotWidth = range(c, 'siwSlotWidth', 0.15, 10);
  const offsetRatio = range(c, 'siwSlotOffset', 0.03, 0.35);
  const diameter = range(c, 'siwViaDiameter', 0.35, 4);
  const drill = range(c, 'siwViaDrill', 0.2, 3);
  const maxPitch = range(c, 'siwViaPitch', 0.4, 8);
  const taperScale = range(c, 'siwTaperLength', 0.1, 0.75);
  const taperRatio = range(c, 'siwTaperWidth', 0.2, 0.85);
  if (diameter < drill + 0.2 || maxPitch > 2 * diameter || maxPitch <= diameter) {
    throw new Error('Use at least a 0.10 mm via annular ring and a pitch greater than one and no more than two via diameters.');
  }
  const dielectricWavelength = C0 / (c.freq * Math.sqrt(c.epsR));
  const effectiveWidth = dielectricWavelength / (2 * ratio);
  const cutoff = C0 / (2 * effectiveWidth * Math.sqrt(c.epsR));
  const higherCutoff = Math.min(2 * cutoff, C0 / (2 * c.boardT * Math.sqrt(c.epsR)));
  const guidedWavelength = dielectricWavelength / Math.sqrt(1 - ratio ** 2);
  const slotLength = C0 * slotScale / (2 * c.freq * Math.sqrt(exposedEr(c)));
  const spacing = guidedWavelength / 2, backshort = spacing / 2;
  const shortY = count * spacing + backshort;
  const wallIntervals = Math.ceil(shortY / maxPitch), wallPitch = shortY / wallIntervals;
  const width = effectiveWidth + diameter ** 2 / (0.95 * wallPitch);
  const shortIntervals = Math.ceil(width / maxPitch), shortPitch = width / shortIntervals;
  if (2 * wallIntervals + shortIntervals + 1 > 4096) throw new Error('The via fence exceeds 4096 vias. Reduce the slot count or increase the via diameter and pitch.');
  if (diameter > Math.min(guidedWavelength, width) / 5 || c.freq >= higherCutoff ||
      Math.min(wallPitch, shortPitch) < Math.max(diameter + 0.02, drill + 0.25)) {
    throw new Error('The via fence or board spacing is outside the single-mode starting model. Adjust frequency, substrate thickness, via size or pitch.');
  }
  const offset = offsetRatio * width, taperWidth = taperRatio * width, taperLength = taperScale * dielectricWavelength;
  const slotClearance = width / 2 - offset - slotWidth / 2 - diameter / 2;
  if (slotLength < 4 * slotWidth || slotLength / 2 + 0.2 >= backshort || slotClearance < 0.2 || feedW >= taperWidth) {
    throw new Error('The slots or feed do not fit the guide. Shorten or narrow the slots, decrease their offset, or use a thinner substrate or wider taper.');
  }
  const net = 'GND';
  const outside = width / 2 + diameter / 2 + 0.25;
  const endY = shortY + diameter / 2 + 0.25;
  const feedY = -taperLength - c.feedLength;
  const slots = Array.from({ length: count }, (_, i) => ({ x: (i % 2 ? -1 : 1) * offset, y: (i + 1) * spacing }));
  let lower = 0;
  for (const { x, y } of slots) {
    const near = y - slotLength / 2, far = y + slotLength / 2;
    plate(art, [-outside, lower, outside, near], net, '1', 'siw-top');
    plate(art, [-outside, near - copperOverlap, x - slotWidth / 2, far + copperOverlap], net, '1', 'siw-slot-edge');
    plate(art, [x + slotWidth / 2, near - copperOverlap, outside, far + copperOverlap], net, '1', 'siw-slot-edge');
    lower = far;
  }
  plate(art, [-outside, lower, outside, endY], net, '1', 'siw-top');
  plate(art, [-outside, feedY - feedW / 2 - 0.25, outside, endY], net, '1', 'siw-back', 'B.Cu');
  const taperSteps = Math.ceil(Math.max(taperLength, (taperWidth - feedW) / 2) / 0.2);
  const step = taperLength / taperSteps, overlap = Math.min(copperOverlap, step / 2);
  for (let i = 0; i < taperSteps; i++) {
    const x = (feedW + (taperWidth - feedW) * (i + 1) / taperSteps) / 2;
    const y = -taperLength + i * step;
    plate(art, [-x, y, x, y + step + overlap], net, '1', 'siw-taper');
  }
  art.tracks.push(track('F.Cu', feedW, run(0, feedY, 0, -taperLength), { net, role: 'feed' }));
  terminal(art, [0, feedY], feedW, '1', net, 'Microstrip launch (DC short)');
  port(art, 0, 0, net, 'Back ground', 'B.Cu');
  for (let i = 0; i <= wallIntervals; i++) for (const s of [-1, 1]) {
    art.vias.push(via(s * width / 2, shortY * i / wallIntervals, { diameter, drill, net, role: 'siw-wall' }));
  }
  for (let i = 1; i < shortIntervals; i++) {
    art.vias.push(via(-width / 2 + width * i / shortIntervals, shortY, { diameter, drill, net, role: 'siw-short' }));
  }
  return {
    model: 'TE10 guide dimensions and resonant slot spacing',
    analysis: { width, effectiveWidth, cutoff, higherCutoff, guidedWavelength, spacing, backshort, slotLength, slotWidth,
      slots, offset, wallPitch, shortPitch, vias: art.vias.length, feedW, taperLength, taperWidth },
    capabilities: ['Waveguide and cutoff estimates', 'Alternating longitudinal slots', 'Plated via fences and microstrip launch'],
    notes: [info('The launch, guide walls, and ground are one DC-connected conductor. Use an external DC block if needed.'), warn('Slot length, offset, and taper need EM tuning. The guide model does not predict impedance match, gain, or sidelobes. Keep the slots free of pours and keep intermediate layers clear through the guide and launch.')],
  };
}

const generators = {
  monopole: buildMonopole,
  'full-wave-loop': buildLoop,
  'truncated-patch': buildTruncatedPatch,
  'archimedean-spiral': buildSpiral,
  'siw-slot-array': buildSiw,
};

export function buildPlanarAntenna(c, env) {
  const art = artwork({ name: env.name || 'ANT1', kind: 'antenna', family: c.family });
  const result = generators[c.family](art, c, env);
  const { x0, y0, x1, y1 } = boundsCopper(art);
  art.outline.push({ layer: 'Edge.Cuts', pts: rect(x0 - c.margin, y0 - c.margin, x1 + c.margin, y1 + c.margin) });
  const layers = [...new Set([...art.tracks, ...art.pads].map(item => item.layer))];
  if (layers.length > 1 && env.board?.layerCount > 2) {
    result.notes.push(warn('Use the actual front-to-back dielectric spacing and keep intermediate copper clear under this antenna.'));
  }
  result.notes.push(info('These are starting dimensions. Verify the antenna on its actual substrate with electromagnetic analysis or measurements.'));
  Object.assign(art.meta, { model: result.model, capabilities: result.capabilities });
  return { art, bounds: bounds(art), layers, ...result };
}
