/* Rectangular, edge-fed TM10 patch. Dimensions in mm; frequency in Hz.
   Transmission-line starting dimensions, not a full-wave antenna simulation.
   See docs/creators.md for equations and assumptions. */
import { artwork, pad, track, run, rect, bounds } from './artwork.js';
import { microstrip, microstripWidth } from './microstrip.js';
import { OZ_MM } from './coil.js';

export function buildPatch(c, env = {}) {
  for (const key of ['freq', 'boardT', 'epsR', 'copperOz', 'feedZ', 'feedLength', 'lengthScale', 'widthScale', 'margin']) {
    if (!Number.isFinite(c[key]) || c[key] <= 0) throw new Error(`${key} must be positive and finite.`);
  }
  if (c.epsR <= 1 || c.freq < 1e8 || c.freq > 30e9 || c.boardT < 0.05 || c.boardT > 10 || c.epsR > 20 || c.feedZ < 20 || c.feedZ > 150 || c.feedLength > 200 || c.margin > 100 || c.lengthScale < 0.5 || c.lengthScale > 1.5 || c.widthScale < 0.5 || c.widthScale > 1.5) throw new Error('Antenna parameters are outside the supported design range.');
  if (env.board?.layerCount < 2) throw new Error('A patch antenna requires front copper and a back ground plane.');
  const lambda0 = 299792458e3 / c.freq;
  const W = lambda0 / 2 * Math.sqrt(2 / (c.epsR + 1)) * c.widthScale;
  const ee = (c.epsR + 1) / 2 + (c.epsR - 1) / (2 * Math.sqrt(1 + 12 * c.boardT / W));
  const deltaL = 0.412 * c.boardT * (ee + 0.3) * (W / c.boardT + 0.264) / ((ee - 0.258) * (W / c.boardT + 0.8));
  const L = (lambda0 / (2 * Math.sqrt(ee)) - 2 * deltaL) * c.lengthScale;
  if (L <= c.boardT || W <= c.boardT) throw new Error('Substrate is too thick for this patch model. Reduce thickness or frequency.');
  const opt = { t: c.copperOz * OZ_MM, f: c.freq };
  const feedW = microstripWidth(c.feedZ, c.boardT, c.epsR, opt);
  if (feedW >= W) throw new Error('Feed is wider than the patch; increase feed impedance or reduce substrate thickness.');
  const feedY = -L / 2 - c.feedLength;
  const art = artwork({ name: env.name || 'ANT1', kind: 'antenna' });
  const signal = env.net || 'RF';
  art.pads.push(pad(0, 0, { w: W, h: L, shape: 'rect', number: '1', net: signal, layer: 'F.Cu', role: 'patch' }));
  art.tracks.push(track('F.Cu', feedW, run(0, feedY, 0, -L / 2 + feedW / 2), { net: signal, role: 'feed' }));
  const x = W / 2 + c.margin, y0 = feedY - feedW / 2 - c.margin, y1 = L / 2 + c.margin;
  art.pads.push(pad(0, (y0 + y1) / 2, { w: 2 * x, h: y1 - y0, shape: 'rect', number: '2', net: 'GND', layer: 'B.Cu', role: 'ground' }));
  art.ports.push({ x: 0, y: feedY, name: 'RF feed', net: signal }, { x, y: feedY, name: 'Ground (back)', net: 'GND' });
  art.outline.push({ layer: 'Edge.Cuts', pts: rect(-x - 0.5, y0 - 0.5, x + 0.5, y1 + 0.5) });
  const notes = [{ level: 'info', text: 'Edge-fed rectangular patch with a back copper ground plane. Feed impedance describes the line only; add a matching network after EM simulation or VNA measurement. S11, gain, efficiency and bandwidth are not predicted.' }];
  if (c.boardT / lambda0 > 0.02) notes.push({ level: 'warn', text: 'Electrically thick substrate: surface waves and feed radiation can invalidate the thin-substrate estimate.' });
  if (env.board?.layerCount > 2) notes.push({ level: 'warn', text: 'The model uses F.Cu to B.Cu spacing. Remove intermediate copper beneath the antenna and feed; nearer ground planes change the design.' });
  notes.push({ level: 'info', text: 'Ground and patch are separate SMD copper pads, with no connecting via. Connect RF on the front and GND on the back. Keep solder mask off the modeled antenna copper.' });
  return { art, bounds: bounds(art), layers: ['F.Cu', 'B.Cu'], notes, analysis: { W, L, ee, deltaL, feedW, feedZ: microstrip(feedW, c.boardT, c.epsR, opt).Z0, resonance: 299792458e3 / (2 * (L + 2 * deltaL) * Math.sqrt(ee)), lambda0 } };
}
