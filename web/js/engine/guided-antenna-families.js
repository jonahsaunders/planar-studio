import { merge, run, TAU, track, via } from './artwork.js';
import { C0, copperOverlap, exposedEr, feedWidth, info, plate, plateBands, plateWithWindows, port, terminal, warn } from './antenna-artwork.js';
import { OZ_MM } from './coil.js';
import { microstrip } from './microstrip.js';
import { buildPatch } from './patch-antenna.js';

const BACK = 'B.Cu';

export function uSlotPatch(art, c, env) {
  const base = buildPatch(c, env);
  const { W, L, feedW, resonance } = base.analysis;
  const width = c.uSlotWidth, span = W * c.uSlotSpan, depth = L * c.uSlotDepth;
  const bottom = -L / 4, upper = bottom + depth, left = -span / 2, right = span / 2;
  if (span < 3 * width || depth < 3 * width || L / 4 <= feedW + 0.2) {
    throw new Error('The U-slot needs room for its legs and clearance from the feed. Narrow the slot or feed, or increase the patch dimensions.');
  }
  const windows = [
    [left, bottom, right, bottom + width],
    [left, bottom, left + width, upper],
    [right - width, bottom, right, upper],
  ];
  base.art.pads = base.art.pads.filter(p => p.role !== 'patch');
  merge(art, base.art);
  plateWithWindows(art, [-W / 2, -L / 2, W / 2, L / 2], windows, env.net || 'RF', '1', 'u-slot-patch');
  terminal(art, [0, -L / 2 - c.feedLength], feedW, '1', env.net || 'RF', 'RF input');
  // Use the explicit feed pad as the front connection point.
  art.ports = art.ports.filter(p => p.name !== 'RF feed');
  return {
    model: 'Rectangular patch reference with a U-shaped slot',
    analysis: { W, L, span, depth, width, feedW, resonance },
    capabilities: ['Continuous slotted patch', 'Unslotted patch resonance reference', 'Feed-line width'],
    notes: [warn('The U shapes a second coupled resonance. Slot parameters and feed matching need full-wave tuning. The displayed frequency is the unslotted patch reference.')],
  };
}

export function annularPatch(art, c, env) {
  const feedW = feedWidth(c, env), ratio = c.ringInnerRatio;
  const ee = exposedEr(c);
  const mean = C0 * c.ringScale / (TAU * c.freq * Math.sqrt(ee)), outer = 2 * mean / (1 + ratio);
  const inner = outer * ratio, thickness = outer - inner;
  if (thickness < Math.max(feedW, 2 * c.ringStep) || inner < c.ringStep) {
    throw new Error('The ring is too narrow for the feed or profile resolution. Reduce the inner-radius ratio, edge step, frequency, or feed width.');
  }
  const bands = [];
  for (const [lower, upper] of [[-outer, -inner], [-inner, inner], [inner, outer]]) {
    const count = Math.ceil((upper - lower) / c.ringStep);
    if (count > 1024) throw new Error('The ring needs more than 1024 bands in a region. Increase its copper edge step.');
    for (let i = 0; i < count; i++) {
      const bottom = lower + (upper - lower) * i / count, top = lower + (upper - lower) * (i + 1) / count;
      const x = Math.sqrt(outer * outer - ((bottom + top) / 2) ** 2);
      const nearest = Math.max(bottom, -top, 0);
      const hole = Math.sqrt(Math.max(0, inner * inner - nearest ** 2));
      if (hole >= x) throw new Error('The annular profile cannot maintain a continuous ring. Reduce its copper edge step or inner radius.');
      bands.push({ bottom, top, spans: hole ? [[-x, -hole], [hole, x]] : [[-x, x]] });
    }
  }
  const net = env.net || 'RF', start = -outer - c.feedLength, groundHalf = outer + c.margin;
  plateBands(art, bands, net, '1', 'annular-patch');
  art.tracks.push(track('F.Cu', feedW, run(0, start, 0, -outer + thickness / 4), { net, role: 'feed' }));
  terminal(art, [0, start], feedW, '1', net, 'RF feed');
  plate(art, [-groundHalf, start - feedW / 2 - 0.25, groundHalf, groundHalf], 'GND', '2', 'ground', BACK);
  port(art, groundHalf / 2, -outer, 'GND', 'Back ground', BACK);
  return {
    model: 'Annular mean-circumference starting dimensions',
    analysis: { inner, outer, thickness, feedW, resonance: C0 / (TAU * mean * Math.sqrt(ee)) },
    capabilities: ['Open ring center above a back ground', 'Mean-circumference frequency reference', 'Feed-line width'],
    notes: [warn('This reference sizes the ring from its mean circumference. Actual annular cavity modes, coupling and impedance depend on the inner radius and substrate and require EM tuning.')],
  };
}

// Internal planes are generated as overlapping tracks, which KiCad can
// place and export on inner copper without creating inaccessible SMD pads.
function innerPlate(art, [left, bottom, right, top], layer, net, role) {
  const height = top - bottom, width = Math.min(0.5, height, (right - left) / 2);
  const intervals = Math.ceil((height - width) / (width * 0.7));
  for (let i = 0; i <= intervals; i++) {
    const y = bottom + width / 2 + (height - width) * i / (intervals || 1);
    art.tracks.push(track(layer, width, run(left + width / 2, y, right - width / 2, y), { net, role }));
  }
}

export function stackedPatch(art, c, env) {
  const feedHeight = c.boardT * c.stackFeedFraction;
  const drivenHeight = c.boardT * c.stackDrivenFraction;
  const upperHeight = c.boardT - feedHeight - drivenHeight;
  if (upperHeight < c.boardT * 0.1) throw new Error('Leave at least 10% of the board thickness between the two patches.');
  const feedW = feedWidth(c, {}, feedHeight), lambda = C0 / (c.freq * Math.sqrt(c.epsR));
  const driven = lambda * c.stackPatchScale / 2, top = driven * c.stackTopScale;
  const slotLength = driven * c.stackAperture, slotWidth = c.stackSlotWidth, stub = lambda * c.stackStub;
  if (slotWidth * 4 >= slotLength || slotWidth >= driven * 0.3 || stub <= slotWidth / 2) {
    throw new Error('The coupling aperture or feed stub does not fit. Narrow the slot or increase patch size and stub length.');
  }
  const half = Math.max(driven, top) / 2 + Math.max(c.margin, 1.75);
  const groundX = half - 0.8, land = 1.05;
  if (groundX < (feedW + land) / 2 + 0.2) throw new Error('The feed is too wide for its ground lands. Increase ground margin or use a narrower feed.');
  const feedY = -driven / 2 - c.feedLength;
  const net = env.net || 'RF';
  const layers = ['F.Cu', 'In1.Cu', 'In2.Cu', BACK];
  art.meta.boardLayers = layers;
  plate(art, [-top / 2, -top / 2, top / 2, top / 2], null, '', 'parasitic-patch');
  innerPlate(art, [-driven / 2, -driven / 2, driven / 2, driven / 2], layers[1], null, 'coupled-patch');
  const x = slotLength / 2, y = slotWidth / 2;
  for (const box of [
    [-half, feedY - feedW / 2 - 1, half, -y],
    [-half, y, half, Math.max(half, stub + feedW / 2 + 1)],
    [-half, -y - 0.3, -x, y + 0.3],
    [x, -y - 0.3, half, y + 0.3],
  ]) innerPlate(art, box, layers[2], 'GND', 'aperture-ground');
  art.tracks.push(track(BACK, feedW, run(0, feedY, 0, stub), { net, role: 'aperture-feed' }));
  terminal(art, [0, feedY], feedW, '1', net, 'Back RF feed', BACK);
  for (const sign of [-1, 1]) {
    const x = sign * groundX;
    art.vias.push(via(x, feedY, { net: 'GND', diameter: 0.65, drill: 0.3, role: 'ground-access' }));
    // Add a board-side solder land larger than the via annulus.
    terminal(art, [x, feedY], land, '2', 'GND', sign < 0 ? 'GND L' : 'GND R', BACK);
  }
  return {
    model: 'Four-layer aperture-coupled stacked patch layout',
    analysis: { driven, top, slotLength, slotWidth, feedW, stub, feedHeight, drivenHeight, upperHeight },
    capabilities: ['Isolated driven and parasitic patches', 'Inner ground aperture and back feed', 'Physical spacing targets'],
    notes: [info('From front to back the layout uses F.Cu, In1.Cu, In2.Cu and B.Cu. Set the board’s physical stack-up to the shown spacings.'), warn('The patch lengths are dielectric half-wave references. The model does not solve coupled resonances or impedance match. Keep any extra copper layers clear of the stack.')],
  };
}

export function cavitySlot(art, c, env) {
  const feedW = feedWidth(c, env), diameter = c.cavityVia, drill = c.cavityDrill, pitch = c.cavityPitch;
  if (diameter < drill + 0.2 || pitch <= diameter || pitch > 2 * diameter) {
    throw new Error('Use a via annular ring of at least 0.10 mm and a pitch greater than one and no more than two via diameters.');
  }
  const lambda = C0 / (c.freq * Math.sqrt(c.epsR)), aspect = c.cavityAspect;
  const effectiveWidth = lambda / 2 * Math.sqrt(1 + 1 / aspect ** 2);
  const width = effectiveWidth + diameter ** 2 / (0.95 * pitch);
  const length = effectiveWidth * aspect + diameter ** 2 / (0.95 * pitch);
  const nx = Math.ceil(width / pitch), ny = Math.ceil(length / pitch);
  const pitchX = width / nx, pitchY = length / ny;
  const slotLength = C0 / (2 * c.freq * Math.sqrt(exposedEr(c))) * c.cavitySlotScale;
  const slotWidth = c.cavitySlotWidth, slotY = length * c.cavitySlotPosition;
  const edge = diameter / 2 + 0.25, launchWidth = width * 0.36, launchLength = lambda * 0.22;
  if (2 * (nx + ny) > 2048) throw new Error('The cavity via fence exceeds 2048 positions. Reduce the cavity size or increase the via diameter and pitch.');
  if (diameter > Math.min(width, length) / 5 || Math.min(pitchX, pitchY) < Math.max(diameter + 0.02, drill + 0.25) ||
      slotLength + 2 * edge >= width || slotLength < 4 * slotWidth ||
      Math.min(slotY, length - slotY) <= slotWidth / 2 + edge || feedW >= launchWidth) {
    throw new Error('The slot, launch or vias do not fit the cavity. Adjust slot size and position, substrate thickness, or via spacing.');
  }
  const half = width / 2, side = half + edge, feedY = -launchLength - c.feedLength, net = 'GND';
  plateWithWindows(art, [-side, -edge, side, length + edge], [
    [-slotLength / 2, slotY - slotWidth / 2, slotLength / 2, slotY + slotWidth / 2],
  ], net, '1', 'cavity-top');
  plate(art, [-side, feedY - feedW / 2 - 0.25, side, length + edge], net, '1', 'cavity-back', BACK);
  const steps = Math.ceil(launchLength / 0.3), step = launchLength / steps;
  for (let i = 0; i < steps; i++) {
    const x = (feedW + (launchWidth - feedW) * (i + 1) / steps) / 2;
    const y = -launchLength + i * step;
    plate(art, [-x, y, x, y + step + Math.min(copperOverlap, step / 2)], net, '1', 'cavity-taper');
  }
  art.tracks.push(track('F.Cu', feedW, run(0, feedY, 0, -launchLength), { net, role: 'feed' }));
  terminal(art, [0, feedY], feedW, '1', net, 'Launch (DC short)');
  port(art, 0, 0, net, 'Back ground', BACK);
  const stitch = (x, y) => art.vias.push(via(x, y, { net, diameter, drill, role: 'cavity-wall' }));
  for (let i = 0; i <= ny; i++) for (const s of [-1, 1]) stitch(s * half, length * i / ny);
  for (let i = 1; i < nx; i++) {
    const x = -half + width * i / nx;
    stitch(x, length);
    if (Math.abs(x) > launchWidth / 2 + diameter / 2) stitch(x, 0);
  }
  return {
    model: 'Via-fenced rectangular cavity with one radiating slot',
    analysis: { width, length, slotLength, slotWidth, vias: art.vias.length, feedW, entrance: launchWidth },
    capabilities: ['Cavity fundamental-mode dimensions', 'Single front aperture', 'Coupled via-wall launch'],
    notes: [info('The input wall leaves a guide opening for the taper. The launch and cavity walls share one GND net at DC.'), warn('The cavity dimensions are a closed-cavity starting estimate. Tune the open launch and slot together. Provide an external DC block if needed, and keep the aperture and intermediate layers free of pours.')],
  };
}

export function leakyWave(art, c, env) {
  const feedW = feedWidth(c, env);
  const { epsEff, lambda: guided } = microstrip(feedW, c.boardT, c.epsR, { t: c.copperOz * OZ_MM, f: c.freq });
  const lambda = C0 / c.freq;
  const period = lambda / (Math.sqrt(epsEff) - Math.sin(c.lwaAngle * Math.PI / 180));
  const stubLength = guided * c.lwaStubScale, stubWidth = c.lwaStubWidth, count = c.lwaCells;
  if (stubLength < feedW / 2 + 2 * stubWidth || period < 4 * stubWidth) throw new Error('The stubs do not fit the line. Reduce stub width, increase stub length, or change substrate and frequency.');
  const net = env.net || 'RF', end = count * period + c.feedLength;
  art.tracks.push(track('F.Cu', feedW, run(0, -c.feedLength, 0, end), { net, role: 'leaky-spine' }));
  for (let i = 0; i < count; i++) {
    const y = (i + 0.5) * period;
    art.tracks.push(track('F.Cu', stubWidth, run(0, y, stubLength, y), { net, role: 'loading-stub' }));
  }
  terminal(art, [0, -c.feedLength], feedW, '1', net, 'RF input');
  terminal(art, [0, end], feedW, '2', net, 'Load connection');
  plate(art, [-feedW / 2 - c.margin, -c.feedLength - feedW / 2 - 0.25,
    stubLength + stubWidth / 2 + c.margin, end + feedW / 2 + 0.25], 'GND', '3', 'ground', BACK);
  port(art, -feedW / 2, 0, 'GND', 'Back ground', BACK);
  return {
    model: 'Periodic loaded microstrip with an unloaded-line harmonic reference',
    analysis: { count, period, stubLength, stubWidth, feedW, angle: c.lwaAngle, activeLength: count * period },
    capabilities: ['Periodic open-stub layout', 'Unloaded-line period estimate', 'Input and termination locations'],
    notes: [info('Use an external termination at the far port. The requested angle sets the period using the unloaded-line n = −1 harmonic.'), warn('The stubs change the actual phase and leakage. The model does not predict beam angle, stopband, unwanted harmonics, or matched bandwidth.')],
  };
}
