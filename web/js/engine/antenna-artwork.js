import { artwork, bounds, boundsCopper, pad, rect } from './artwork.js';
import { segmentDistance } from './boardcheck.js';
import { OZ_MM } from './coil.js';
import { range } from './creator-validation.js';
import { microstripWidth } from './microstrip.js';

export const C0 = 299792458e3;
export const copperOverlap = 0.02;
export const warn = text => ({ level: 'warn', text });
export const info = text => ({ level: 'info', text });
export const exposedEr = c => (1 + c.epsR) / 2;
export const antennaArt = (c, env) => artwork({ name: env.name || 'ANT1', kind: 'antenna', family: c.family });

export function plate(art, [x0, y0, x1, y1], net, number, role, layer = 'F.Cu') {
  art.pads.push(pad((x0 + x1) / 2, (y0 + y1) / 2, {
    shape: 'rect', w: x1 - x0, h: y1 - y0, net, number, role, layer, mask: false,
  }));
}

// Join adjacent filled bands only where their copper spans intersect. The
// overlap survives export rounding and leaves all the intended voids open.
export function plateBands(art, bands, net, number, role, layer) {
  for (const [i, band] of bands.entries()) {
    const { bottom, top, spans } = band;
    for (const [left, right] of spans) plate(art, [left, bottom, right, top], net, number, role, layer);
    const previous = bands[i - 1];
    if (!previous) continue;
    const overlap = Math.min(copperOverlap, (top - bottom) / 4, (previous.top - previous.bottom) / 4);
    for (const [left, right] of spans) for (const [a, b] of previous.spans) {
      const x0 = Math.max(a, left), x1 = Math.min(b, right);
      if (x1 - x0 > 0.00001) plate(art, [x0, bottom - overlap, x1, bottom + overlap], net, number, role, layer);
    }
  }
}

export function plateWithWindows(art, [left, bottom, right, top], windows, net, number, role, layer) {
  const edges = [...new Set([bottom, top, ...windows.flatMap(([, a, , b]) => [a, b])])].sort((a, b) => a - b);
  const bands = edges.slice(1).map((hi, i) => {
    const lo = edges[i], mid = (lo + hi) / 2;
    const blocked = windows.filter(([, y0, , y1]) => y0 < mid && y1 > mid).sort((a, b) => a[0] - b[0]);
    let x = left;
    const spans = [];
    for (const [x0, , x1] of blocked) {
      if (x0 > x) spans.push([x, x0]);
      x = Math.max(x, x1);
    }
    if (x < right) spans.push([x, right]);
    return { bottom: lo, top: hi, spans };
  });
  plateBands(art, bands, net, number, role, layer);
}

export function port(art, x, y, net, name, layer = 'F.Cu') {
  art.ports.push({ x, y, net, name, layer });
}

export function terminal(art, [x, y], width, number, net, name, layer = 'F.Cu') {
  art.pads.push(pad(x, y, { w: width, number, net, role: 'terminal', layer }));
  port(art, x, y, net, name, layer);
}

export function feedWidth(c, env, height = c.boardT) {
  if (env.board?.layerCount < 2) throw new Error('This antenna needs front and back copper.');
  range(c, 'feedZ', 20, 150);
  range(c, 'feedLength', 1, 200);
  const w = microstripWidth(c.feedZ, height, c.epsR, { t: c.copperOz * OZ_MM, f: c.freq });
  if (w < 0.1) throw new Error('The feed line is below 0.1 mm. Increase the substrate spacing or lower the feed impedance.');
  return w;
}

export function armSpacingClear(arms, distance) {
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

export function finishAntenna(art, c, env, result) {
  const { x0, y0, x1, y1 } = boundsCopper(art);
  if (!art.outline.some(item => item.layer === 'Edge.Cuts')) {
    art.outline.push({ layer: 'Edge.Cuts', pts: rect(x0 - c.margin, y0 - c.margin, x1 + c.margin, y1 + c.margin) });
  }
  const layers = art.meta.boardLayers ?? [...new Set([...art.tracks, ...art.pads].map(item => item.layer))];
  if (layers.length === 2 && env.board?.layerCount > 2) {
    result.notes.push(warn('Use the actual front-to-back dielectric spacing and keep intermediate copper clear under this antenna.'));
  }
  result.notes.push(info('These are starting dimensions. Verify the antenna on its actual substrate with electromagnetic analysis or measurements.'));
  Object.assign(art.meta, { model: result.model, capabilities: result.capabilities });
  return { art, bounds: bounds(art), layers, ...result };
}
