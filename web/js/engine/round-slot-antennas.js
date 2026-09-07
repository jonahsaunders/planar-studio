/* Starting geometries, not full-wave impedance or radiation solutions.
   Circular TM11 cavity radius includes the standard fringing correction.
   Slot length uses an explicitly approximate effective-medium half wavelength. */
import { artwork, pad, track, run, rect, bounds } from './artwork.js';
import { microstripWidth } from './microstrip.js';
import { OZ_MM } from './coil.js';
import { range } from './creator-validation.js';
const C0 = 299792458e3; // mm/s
export const effectiveRadius = (a, h, er) => a * Math.sqrt(1 + 2 * h / (Math.PI * er * a) * (Math.log(Math.PI * a / (2 * h)) + 1.7726));

export function buildRoundOrSlot(c, env = {}) {
  range(c, 'feedZ', 20, 150); range(c, 'feedLength', 1, 200);
  if (env.board?.layerCount < 2) throw new Error('This antenna needs front copper and a back ground layer.');
  const A = artwork({ name: env.name || 'ANT1', kind: 'antenna', family: c.family });
  const net = env.net || 'RF', feedW = microstripWidth(c.feedZ, c.boardT, c.epsR, { t: c.copperOz * OZ_MM, f: c.freq });
  const lambda0 = C0 / c.freq;
  let a, x, y0, y1, feedY, feedEnd, model, capabilities;
  const notes = [{ level: 'info', text: 'Feed impedance describes the microstrip line only. Matching, S11, gain, efficiency and bandwidth require full-wave simulation or measurement on the final board.' }];
  if (c.family === 'circular-patch') {
    range(c, 'radiusScale', 0.5, 1.5);
    const target = 1.84118 * lambda0 / (2 * Math.PI * Math.sqrt(c.epsR));
    if (target <= 2 * c.boardT) throw new Error('Substrate is too thick for the circular patch estimate. Reduce thickness or frequency.');
    let lo = c.boardT / 10, hi = target;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (effectiveRadius(mid, c.boardT, c.epsR) < target) lo = mid; else hi = mid;
    }
    const radius = (lo + hi) / 2 * c.radiusScale;
    if (radius <= c.boardT || feedW >= radius) throw new Error('Circular patch is too small for this substrate/feed. Increase radius or feed impedance.');
    A.pads.push(pad(0, 0, { w: 2 * radius, h: 2 * radius, shape: 'circle', layer: 'F.Cu', number: '1', net, role: 'patch' }));
    feedY = -radius - c.feedLength; feedEnd = -radius + feedW / 2;
    x = radius + c.margin; y0 = feedY - feedW / 2 - c.margin; y1 = radius + c.margin;
    A.pads.push(pad(0, (y0 + y1) / 2, { w: 2 * x, h: y1 - y0, shape: 'rect', layer: 'B.Cu', number: '2', net: 'GND', role: 'ground' }));
    a = { radius, effectiveRadius: effectiveRadius(radius, c.boardT, c.epsR), resonance: 1.84118 * C0 / (2 * Math.PI * effectiveRadius(radius, c.boardT, c.epsR) * Math.sqrt(c.epsR)), feedW, lambda0 };
    model = 'Circular TM11 cavity estimate with fringing'; capabilities = ['Physical radius', 'Estimated TM11 resonance', 'Feed-line width'];
    notes.push({ level: 'info', text: 'Single edge-fed circular patch with linear polarization. Circular shape does not imply circular polarization. Feed loading and the finite ground are excluded from the cavity estimate.' });
  } else {
    range(c, 'slotScale', 0.5, 1.5); range(c, 'slotWidth', 0.2, 20); range(c, 'slotStub', 0.1, 100);
    const ee = (c.epsR + 1) / 2, length = lambda0 / (2 * Math.sqrt(ee)) * c.slotScale, width = c.slotWidth;
    if (length < 6 * width || length < 2 * feedW) throw new Error('Slot is too short relative to its width or feed. Reduce slot width or frequency.');
    x = length / 2 + c.margin; feedY = -width / 2 - c.feedLength; feedEnd = width / 2 + c.slotStub;
    y0 = feedY - feedW / 2 - c.margin; y1 = feedEnd + feedW / 2 + c.margin;
    // Four positive copper rectangles leave an exact empty slot in B.Cu.
    const ground = (x0, ya, x1, yb) => A.pads.push(pad((x0 + x1) / 2, (ya + yb) / 2, { w: x1 - x0, h: yb - ya, shape: 'rect', layer: 'B.Cu', number: '2', net: 'GND', role: 'slot-ground' }));
    ground(-x, y0, x, -width / 2); ground(-x, width / 2, x, y1);
    ground(-x, -width / 2, -length / 2, width / 2); ground(length / 2, -width / 2, x, width / 2);
    a = { slotLength: length, slotWidth: width, feedW, stub: c.slotStub, ee, lambda0 };
    model = 'Microstrip-fed slot: half-wave starting length'; capabilities = ['Slot geometry', 'Approximate electrical length', 'Feed-line width'];
    notes.push({ level: 'info', text: 'The front feed crosses the slot in the back ground and ends in an adjustable open stub. Slot length starts at λ0/(2√((εr+1)/2)); this is not a solved resonance. Tune slot length, width and stub together.' });
    notes.push({ level: 'warn', text: 'Keep the B.Cu slot empty when adding ground pours. The slot is a copper opening, not a hole through the PCB. No automatic keepout zone is created.' });
  }
  A.tracks.push(track('F.Cu', feedW, run(0, feedY, 0, feedEnd), { net, role: 'feed' }));
  A.ports.push({ x: 0, y: feedY, net, name: 'RF feed (front)' }, { x: 0, y: y0 + c.margin / 2, net: 'GND', name: 'Ground reference (back)' });
  A.outline.push({ layer: 'Edge.Cuts', pts: rect(-x - 0.5, y0 - 0.5, x + 0.5, y1 + 0.5) });
  if (env.board?.layerCount > 2) notes.push({ level: 'warn', text: 'This model uses the full F.Cu–B.Cu spacing. Keep intermediate copper clear beneath the antenna and feed.' });
  if (c.boardT / lambda0 > 0.02) notes.push({ level: 'warn', text: 'Electrically thick substrate: the thin-substrate starting estimate may be inaccurate.' });
  A.meta.model = model; A.meta.capabilities = capabilities;
  return { art: A, bounds: bounds(A), layers: ['F.Cu', 'B.Cu'], analysis: a, notes, model, capabilities };
}
