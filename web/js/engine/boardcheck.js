/* Read-only KiCad board geometry. +Y is converted to maths convention here.
   This is a conservative placement preview, not a replacement for KiCad DRC.
   Pads use enclosing circles; arcs are sampled at <= 0.025 mm sagitta. */
import { artwork, track } from './artwork.js';

export function sexpr(text) {
  if (text.length > 40e6) throw new Error('Board exceeds 40 MB. Use a smaller board snapshot.');
  const tokens = text.match(/"(?:\\.|[^"\\])*"|[()]|[^\s()]+/g) || [];
  const root = [], stack = [root];
  for (const t of tokens) {
    if (t === '(') { const a = []; stack.at(-1).push(a); stack.push(a); if (stack.length > 100) throw new Error('Board nesting too deep.'); }
    else if (t === ')') { if (stack.length === 1) throw new Error('Unbalanced board file.'); stack.pop(); }
    else stack.at(-1).push(t.startsWith('"') ? JSON.parse(t) : t);
  }
  if (stack.length !== 1 || root[0]?.[0] !== 'kicad_pcb') throw new Error('Expected a complete .kicad_pcb file.');
  return root[0];
}
const all = (a, key) => a.filter((x) => Array.isArray(x) && x[0] === key);
const one = (a, key) => all(a, key)[0] || [];
const number = (a, key, i = 1, fallback = 0) => { const v = Number(one(a, key)[i] ?? fallback); if (!Number.isFinite(v)) throw new Error(`Invalid ${key} coordinate.`); return v; };
const xy = (a, key) => [number(a, key), number(a, key, 2)];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function arcPoints(a, m, b) {
  const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
  if (Math.abs(d) < 1e-12) return [a, m, b];
  const norm = (p) => p[0] ** 2 + p[1] ** 2, A = norm(a), M = norm(m), B = norm(b);
  const cx = (A * (m[1] - b[1]) + M * (b[1] - a[1]) + B * (a[1] - m[1])) / d;
  const cy = (A * (b[0] - m[0]) + M * (a[0] - b[0]) + B * (m[0] - a[0])) / d;
  const r = distance(a, [cx, cy]), angle = (p) => Math.atan2(p[1] - cy, p[0] - cx), tau = 2 * Math.PI;
  const mod = (v) => (v + tau) % tau, start = angle(a);
  let sweep = mod(angle(b) - start); if (mod(angle(m) - start) > sweep) sweep -= tau;
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / Math.min(0.1, 2 * Math.acos(Math.max(-1, 1 - 0.025 / r)))));
  return Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos(start + sweep * i / n), cy + r * Math.sin(start + sweep * i / n)]);
}

export function parseBoard(text, excludedIds = []) {
  const root = sexpr(text), excluded = new Set(excludedIds), nets = new Map(all(root, 'net').map((n) => [n[1], n[2]]));
  const out = { name: 'Board snapshot', copper: [], keepouts: [], edges: [], holes: [], warnings: [], source: 'file' };
  const copperLayer = (name) => /\.Cu$/.test(name || '');
  let seq = 0;
  function walk(items, pose = { x: 0, y: 0, a: 0 }) {
    const point = ([x, y]) => { const c = Math.cos(pose.a), s = Math.sin(pose.a); return [pose.x + x * c - y * s, -(pose.y + x * s + y * c)]; };
    for (const item of items.filter(Array.isArray)) {
      const kind = item[0], id = one(item, 'uuid')[1] || one(item, 'tstamp')[1] || `item-${seq++}`;
      if (excluded.has(id)) continue;
      const layer = one(item, 'layer')[1], layers = one(item, 'layers').slice(1);
      const netItem = one(item, 'net'), net = netItem[2] || nets.get(netItem[1]) || null;
      const base = { id, layer, net, kind };
      if (kind === 'footprint' || kind === 'module') {
        const [x, y] = xy(item, 'at');
        walk(item, { x, y, a: -number(item, 'at', 3) * Math.PI / 180 });
      } else if (kind === 'segment' || kind === 'arc') {
        const pts = kind === 'arc' ? arcPoints(xy(item, 'start'), xy(item, 'mid'), xy(item, 'end')) : [xy(item, 'start'), xy(item, 'end')];
        out.copper.push({ ...base, width: number(item, 'width'), pts: pts.map(point) });
      } else if (kind === 'pad' || kind === 'via') {
        const p = point(xy(item, 'at'));
        const size = one(item, 'size').slice(1).map(Number), drill = one(item, 'drill').slice(1).filter((x) => /^\d/.test(x)).map(Number);
        const radius = kind === 'via' ? size[0] / 2 : (item[3] === 'circle' ? size[0] : Math.hypot(...size)) / 2;
        if (!Number.isFinite(radius)) { out.warnings.push(`Unsupported pad ${id}.`); continue; }
        if (kind === 'via' || layers.some(copperLayer)) out.copper.push({ ...base, layer: layers.includes('*.Cu') || kind === 'via' ? '*.Cu' : layers[0], layers, pts: [p, p], width: radius * 2 });
        if (drill.length && Math.max(...drill) > 0) out.holes.push({ ...base, point: p, radius: Math.max(...drill) / 2 });
      } else if (kind === 'zone') {
        const zoneLayers = layers.length ? layers : [layer], keepout = one(item, 'keepout');
        const polygons = all(item, keepout.length ? 'polygon' : 'filled_polygon');
        if (!keepout.length && !polygons.length) out.warnings.push(`Unfilled zone ${id}: refill zones in KiCad to check copper coverage.`);
        for (const poly of polygons) {
          const polygon = all(one(poly, 'pts'), 'xy').map((p) => point([Number(p[1]), Number(p[2])]));
          const polyLayers = one(poly, 'layer')[1] ? [one(poly, 'layer')[1]] : zoneLayers;
          for (const l of polyLayers) {
            if (polygon.length >= 3) (keepout.length ? out.keepouts : out.copper).push({ ...base, layer: l, polygon });
          }
        }
      } else if (/^(gr|fp)_/.test(kind)) {
        const shape = kind.slice(3); let pts = null, polygon = null;
        if (shape === 'line') pts = [xy(item, 'start'), xy(item, 'end')];
        else if (shape === 'arc' && one(item, 'mid').length) pts = arcPoints(xy(item, 'start'), xy(item, 'mid'), xy(item, 'end'));
        else if (shape === 'rect') { const [a, b] = [xy(item, 'start'), xy(item, 'end')]; pts = [a, [b[0], a[1]], b, [a[0], b[1]], a]; }
        else if (shape === 'circle') {
          const c = xy(item, 'center'), r = distance(c, xy(item, 'end')), n = Math.max(32, Math.ceil(2 * Math.PI * r / 0.2));
          pts = Array.from({ length: Math.min(10000, n) + 1 }, (_, i) => [c[0] + r * Math.cos(i * 2 * Math.PI / Math.min(10000, n)), c[1] + r * Math.sin(i * 2 * Math.PI / Math.min(10000, n))]);
        } else if (shape === 'poly') pts = all(one(item, 'pts'), 'xy').map((p) => [Number(p[1]), Number(p[2])]);
        if (!pts) { if (layer === 'Edge.Cuts' || copperLayer(layer)) out.warnings.push(`Unsupported ${kind} on ${layer}.`); continue; }
        pts = pts.map(point);
        if (layer === 'Edge.Cuts') out.edges.push(pts);
        else if (copperLayer(layer)) {
          if (one(item, 'fill')[1] === 'solid' && ['rect', 'circle', 'poly'].includes(shape)) polygon = pts;
          const stroke = one(item, 'stroke');
          out.copper.push({ ...base, pts, polygon, width: stroke.length ? number(stroke, 'width') : number(item, 'width') });
        }
      }
    }
  }
  walk(root);
  out.loops = stitchEdges(out.edges);
  if (!out.loops.length) out.warnings.push('No closed board outline found; outside-board checks are unavailable.');
  if (out.edges.some((e) => !out.loops.some((l) => l.some((p) => distance(p, e[0]) < 0.01)))) out.warnings.push('Some board edges are open or unsupported.');
  return out;
}

function stitchEdges(edges) {
  const remaining = edges.map((e) => e.slice()), loops = [];
  while (remaining.length) {
    const path = remaining.shift();
    while (distance(path[0], path.at(-1)) > 0.01) {
      const index = remaining.findIndex((e) => distance(e[0], path.at(-1)) < 0.01 || distance(e.at(-1), path.at(-1)) < 0.01);
      if (index < 0) break;
      const next = remaining.splice(index, 1)[0];
      if (distance(next[0], path.at(-1)) > 0.01) next.reverse();
      path.push(...next.slice(1));
    }
    if (path.length >= 4 && distance(path[0], path.at(-1)) <= 0.01) loops.push(path);
  }
  return loops;
}

export function inside(p, polygon) {
  let yes = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
  }
  return yes;
}
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function pointDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return distance(p, [a[0] + t * dx, a[1] + t * dy]);
}
export function segmentDistance(a, b, c, d) {
  if (((cross(a, b, c) > 0 && cross(a, b, d) < 0) || (cross(a, b, c) < 0 && cross(a, b, d) > 0)) && ((cross(c, d, a) > 0 && cross(c, d, b) < 0) || (cross(c, d, a) < 0 && cross(c, d, b) > 0))) return 0;
  return Math.min(pointDistance(a, c, d), pointDistance(b, c, d), pointDistance(c, a, b), pointDistance(d, a, b));
}
const edgesOf = (poly) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
function hits(a, b, radius, o) {
  if (o.polygon) return inside(a, o.polygon) || inside(b, o.polygon) || edgesOf(o.polygon).some(([c, d]) => segmentDistance(a, b, c, d) <= radius);
  return o.pts?.slice(1).some((p, i) => segmentDistance(a, b, o.pts[i], p) <= radius + (o.width || 0) / 2);
}
const sameLayer = (a, b) => a === b || a === '*.Cu' || b === '*.Cu';

export function checkPlacement(art, board, opt = {}) {
  const clearance = opt.clearance ?? 0.2, origin = opt.origin || [0, 0];
  if (!Number.isFinite(clearance) || clearance < 0 || !origin.every(Number.isFinite)) throw new Error('Invalid clearance or placement origin.');
  const findings = [], seen = new Set();
  const add = (type, o, point, message) => { const key = `${type}:${o.id}`; if (!seen.has(key)) { seen.add(key); findings.push({ type, id: o.id, point, message }); } };
  const p = ([x, y]) => [x + origin[0], y - origin[1]];
  const conductors = [...art.tracks, ...art.arcs.map((a) => ({ ...a, pts: arcPoints(a.start, a.mid, a.end) })), ...art.vias.map((v) => ({ pts: [[v.x, v.y], [v.x, v.y]], width: v.diameter, layer: '*.Cu', net: v.net })), ...art.pads.map((v) => ({ pts: [[v.x, v.y], [v.x, v.y]], width: v.shape === 'circle' ? v.w : Math.hypot(v.w, v.h), layer: v.drill ? '*.Cu' : v.layer, net: v.net }))];
  const planes = board.copper.filter((o) => o.polygon && o.net === (opt.groundNet || 'GND'));
  for (const t of conductors) for (let i = 1; i < t.pts.length; i++) {
    const a = p(t.pts[i - 1]), b = p(t.pts[i]), radius = t.width / 2 + clearance + 0.025;
    if (board.loops.length && [a, b].some((q) => board.loops.filter((l) => inside(q, l)).length % 2 !== 1)) add('edge', { id: 'outline' }, a, 'Copper extends outside the board or into an outline cutout.');
    if (board.edges.some((e) => e.slice(1).some((q, j) => segmentDistance(a, b, e[j], q) < radius))) add('edge', { id: 'outline-clearance' }, a, 'Copper is too close to a board edge.');
    for (const o of board.holes) if (pointDistance(o.point, a, b) < radius + o.radius) add('hole', o, o.point, 'Copper conflicts with a drill or mounting hole.');
    for (const o of board.keepouts) if (sameLayer(t.layer, o.layer) && hits(a, b, radius, o)) add('keepout', o, a, 'Copper enters a keepout.');
    for (const o of board.copper) if (sameLayer(t.layer, o.layer) && !(t.net && t.net === o.net) && hits(a, b, radius, o)) add('copper', o, a, `Clearance conflict with ${o.net || 'unassigned copper'} on ${o.layer}.`);
    if (opt.kind !== 'filter' && t.role === 'winding') for (const o of planes) if (!sameLayer(t.layer, o.layer) && hits(a, b, radius, o)) add('ground-overlap', o, a, 'Ground copper overlaps the winding projection; inductance and loss models exclude its effect.');
    if (opt.distributed && t.layer === art.tracks[0]?.layer && t.net !== (opt.groundNet || 'GND')) {
      const groundLayer = opt.groundLayer || 'B.Cu';
      const covered = planes.filter((o) => o.layer === groundLayer).some((o) => inside(a, o.polygon) && inside(b, o.polygon) && !edgesOf(o.polygon).some(([c, d]) => segmentDistance(a, b, c, d) < radius));
      if (!covered) add('reference-ground', { id: 'ground' }, a, `Continuous reference ground on ${groundLayer} was not confirmed beneath the signal.`);
    }
  }
  return { findings: findings.slice(0, 200), total: findings.length, warnings: board.warnings,
    preview: boardArtwork(board, art, origin, findings), origin, clearance };
}

function boardArtwork(board, design, origin, findings) {
  const A = artwork({ name: 'Placement preview' });
  for (const o of [...board.copper, ...board.keepouts]) {
    const pts = o.polygon ? [...o.polygon, o.polygon[0]] : o.pts;
    if (pts) A.tracks.push(track('Board', o.width || 0.12, pts));
  }
  for (const e of board.edges) A.tracks.push(track('Edge', 0.2, e));
  for (const t of design.tracks) A.tracks.push({ ...t, layer: 'Design', pts: t.pts.map(([x, y]) => [x + origin[0], y - origin[1]]) });
  for (const f of findings.slice(0, 200)) A.pads.push({ x: f.point[0], y: f.point[1], w: 0.8, h: 0.8, shape: 'circle', layer: 'Conflict', drill: 0 });
  return A;
}
