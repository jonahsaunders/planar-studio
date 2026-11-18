/* Read-only KiCad board geometry. +Y is converted to maths convention here.
   This is a conservative placement preview, not a replacement for KiCad DRC.
   Pads use enclosing circles; arcs are sampled at <= 0.025 mm sagitta. */
import { artwork, decimate, track, toKicad } from './artwork.js';

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
  const out = { name: 'Board snapshot', copper: [], keepouts: [], edges: [], holes: [], warnings: [], source: 'file',
    layers: one(root, 'layers').filter(Array.isArray).map(entry => entry[1]), nets: new Set(nets.values()) };
  const copperLayer = (name) => /\.Cu$/.test(name || '');
  const stack = out.layers.filter(copperLayer);
  let seq = 0;
  function walk(items, pose = { x: 0, y: 0, a: 0 }) {
    const point = ([x, y]) => { const c = Math.cos(pose.a), s = Math.sin(pose.a); return [pose.x + x * c - y * s, -(pose.y + x * s + y * c)]; };
    for (const item of items.filter(Array.isArray)) {
      const kind = item[0], id = one(item, 'uuid')[1] || one(item, 'tstamp')[1] || `item-${seq++}`;
      if (excluded.has(id)) continue;
      const layer = one(item, 'layer')[1], layers = one(item, 'layers').slice(1);
      const netItem = one(item, 'net'), net = netItem[2] || nets.get(netItem[1])
        || (netItem.length === 2 && !/^\d+$/.test(netItem[1]) ? netItem[1] : null);
      if (net) out.nets.add(net);
      const base = { id, layer, net, kind };
      if (kind === 'footprint' || kind === 'module') {
        const [x, y] = xy(item, 'at');
        walk(item, { x, y, a: -number(item, 'at', 3) * Math.PI / 180, owner: id });
      } else if (kind === 'segment' || kind === 'arc') {
        const pts = kind === 'arc' ? arcPoints(xy(item, 'start'), xy(item, 'mid'), xy(item, 'end')) : [xy(item, 'start'), xy(item, 'end')];
        out.copper.push({ ...base, width: number(item, 'width'), pts: pts.map(point) });
      } else if (kind === 'pad' || kind === 'via') {
        const p = point(xy(item, 'at'));
        const size = one(item, 'size').slice(1).map(Number);
        const first = stack.indexOf(layers[0]), last = stack.indexOf(layers[1]);
        const viaSpan = kind === 'via' && first >= 0 && last >= 0
          ? stack.slice(Math.min(first, last), Math.max(first, last) + 1) : null;
        const drillSpec = one(item, 'drill');
        const drill = drillSpec.slice(1).filter(x => typeof x === 'string' && Number(x) > 0).map(Number);
        if (drill.length) {
          // A centered bounding circle also covers oval and offset drills.
          const offset = xy(drillSpec, 'offset');
          out.holes.push({ ...base, point: p, radius: Math.max(...drill) / 2 + Math.hypot(...offset),
            layer: '*.Cu', layers: viaSpan });
        }
        const radius = kind === 'via' ? size[0] / 2 : (item[3] === 'circle' ? size[0] : Math.hypot(...size)) / 2;
        if (!Number.isFinite(radius)) { out.warnings.push(`Unsupported pad ${id}.`); continue; }
        const plated = kind === 'via' || item[2] !== 'np_thru_hole';
        if (plated && (kind === 'via' || layers.some(copperLayer))) {
          out.copper.push({ ...base, owner: pose.owner, layer: layers.includes('*.Cu') || kind === 'via' ? '*.Cu' : layers[0],
            layers: viaSpan || layers.filter(copperLayer), pts: [p, p], width: radius * 2, approxPad: kind === 'pad' && item[3] !== 'circle' });
        }
      } else if (kind === 'zone') {
        const zoneLayers = layers.length ? layers : [layer], keepout = one(item, 'keepout');
        const restricted = ['tracks', 'vias', 'pads'].filter(type => one(keepout, type)[1] === 'not_allowed');
        const polygons = all(item, keepout.length ? 'polygon' : 'filled_polygon');
        if (!keepout.length && !polygons.length) out.warnings.push(`Unfilled zone ${id}: refill zones in KiCad to check copper coverage.`);
        for (const poly of polygons) {
          const polygon = all(one(poly, 'pts'), 'xy').map((p) => point([Number(p[1]), Number(p[2])]));
          const polyLayers = one(poly, 'layer')[1] ? [one(poly, 'layer')[1]] : zoneLayers;
          for (const l of polyLayers) {
            if (polygon.length >= 3) (keepout.length ? out.keepouts : out.copper).push({
              ...base, layer: l, polygon, name: one(item, 'name')[1], ...(keepout.length ? { restricted } : {}),
            });
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
        } else if (shape === 'poly') {
          pts = all(one(item, 'pts'), 'xy').map((p) => [Number(p[1]), Number(p[2])]);
          if (pts.length && distance(pts[0], pts.at(-1)) > 0.01) pts.push(pts[0]);
        }
        if (!pts || pts.length < 2 || pts.some(p => !p.every(Number.isFinite))) {
          if (layer === 'Edge.Cuts' || copperLayer(layer)) out.warnings.push(`Unsupported ${kind} on ${layer}.`);
          continue;
        }
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
  const { loops, open } = stitchEdges(out.edges);
  out.loops = loops;
  if (!out.loops.length) out.warnings.push('No closed board outline found; outside-board checks are unavailable.');
  if (open) out.warnings.push('Some board edges are open or unsupported.');
  out.nets = [...out.nets].filter(Boolean).sort();
  return out;
}

function stitchEdges(edges) {
  const remaining = edges.map((e) => e.slice()), loops = [];
  let open = false;
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
    else open = true;
  }
  return { loops, open };
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

// Fall back to the wildcard for vias whose span could not be read.
function layersOf(item) {
  return item.layers?.length ? item.layers : [item.layer];
}

function shareCopperLayer(a, b) {
  return layersOf(a).some(x => layersOf(b).some(y => sameLayer(x, y)));
}

function routedGroups(items) {
  const entries = items.filter(o => o.pts && !o.approxPad && ['segment', 'arc', 'via', 'pad'].includes(o.kind))
    .map(item => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const r = (item.width || 0) / 2;
      for (const [x, y] of item.pts) {
        x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r);
        y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r);
      }
      return { item, x0, x1, y0, y1 };
    }).sort((a, b) => a.x0 - b.x0);
  const parent = entries.map((_, i) => i);
  function root(i) {
    while (i !== parent[i]) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  }
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    for (let j = i + 1; j < entries.length && entries[j].x0 <= a.x1 + 1e-6; j++) {
      const b = entries[j];
      if (a.y0 > b.y1 + 1e-6 || b.y0 > a.y1 + 1e-6 || !shareCopperLayer(a.item, b.item)) continue;
      if (a.item.pts.slice(1).some((q, k) => hits(a.item.pts[k], q, a.item.width / 2 + 1e-6, b.item))) {
        parent[root(j)] = root(i);
      }
    }
  }
  const groups = new Map();
  entries.forEach(({ item }, i) => {
    const key = root(i);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return [...groups.values()];
}

function windingBypasses(art, board, origin, add) {
  const windings = art.tracks.filter(t => t.role === 'winding');
  const net = windings[0]?.net;
  if (!net) return;
  const groups = routedGroups(board.copper.filter(o => o.net === net));
  if (!groups.length) return;
  const memberships = new Map(groups.flatMap(group => group.map(item => [item, group])));
  const candidates = [...memberships.keys()];
  const lastContact = new Map();
  let along = 0;
  const move = ([x, y]) => [x + origin[0], y - origin[1]];
  const lead = index => art.tracks.find(t => t.role === 'lead' && t.terminal === index);
  const start = lead(0), end = lead(1);
  const path = windings.flatMap(winding => [
    ...art.tracks.filter(t => t.role === 'transition' && t.layerIndex === winding.layerIndex), winding,
  ]);
  if (start) path.unshift({ ...start, pts: start.pts.slice().reverse() });
  if (end) path.push(end);
  const terminals = art.pads.filter(p => p.role === 'terminal');
  const contact = (group, at, until, point, margin) => {
    if (at - (lastContact.get(group) ?? at) > margin) {
      add(group.length > 1 ? 'winding-bypass-route' : 'winding-bypass', group[0], point,
        `Connected copper on ${net} bridges separated winding sections. Inspect the route at this contact.`);
    }
    lastContact.set(group, until);
  };
  const terminalContact = (pad, endOfPath) => {
    if (!pad) return;
    const point = move([pad.x, pad.y]), radius = pad.w / 2;
    for (const item of candidates) {
      if (!shareCopperLayer({ layer: pad.drill ? '*.Cu' : pad.layer }, item) || !hits(point, point, radius, item)) continue;
      contact(memberships.get(item), endOfPath ? along - radius : 0, along + radius, point, pad.w);
    }
  };
  terminalContact(terminals[0], false);
  for (const { pts, width, layer } of path) {
    for (let i = 1; i < pts.length; i++) {
      const a = move(pts[i - 1]), b = move(pts[i]), end = along + distance(a, b);
      for (const item of candidates) {
        if (!shareCopperLayer({ layer }, item) || !hits(a, b, width / 2, item)) continue;
        contact(memberships.get(item), along, end, a, width);
      }
      along = end;
    }
  }
  terminalContact(terminals[1], true);
}

function windingContinuity(items, previous) {
  const terminals = previous?.meta?.windingTerminals;
  if (terminals?.length !== 2 || !terminals.every(t => Array.isArray(t.point) &&
    t.point.length === 2 && t.point.every(Number.isFinite))) return [];
  const owned = new Set(previous.ids);
  const groups = routedGroups(items.filter(o => owned.has(o.id) || owned.has(o.owner)));
  const touching = (item, { point, layer }) =>
    shareCopperLayer(item, { layer }) && hits(point, point, 1e-6, item);
  if (groups.some(group => terminals.every(t => group.some(item => touching(item, t))))) return [];
  const missing = terminals.find(t => !groups.some(group => group.some(item => touching(item, t))));
  if (missing) return [{ type: 'winding-terminal', point: missing.point,
    message: 'A recorded winding terminal has moved or is missing. Inspect the existing copper before replacing it.' }];
  const reached = groups.find(group => group.some(item => touching(item, terminals[0]))) || [];
  const breakPoint = reached.filter(item => item.kind === 'segment' || item.kind === 'arc')
    .flatMap(item => [item.pts[0], item.pts.at(-1)].filter(p =>
      !reached.some(other => other !== item && shareCopperLayer(other, item) && hits(p, p, 1e-6, other))))
    .find(p => distance(p, terminals[0].point) > 1e-6);
  return [{ type: 'winding-open', point: breakPoint || terminals[1].point,
    message: 'The existing generated winding path is open between its terminals. Replacement will restore the generated copper.' }];
}

export function checkPlacement(art, board, opt = {}) {
  const clearance = opt.clearance ?? 0.2, origin = opt.origin || [0, 0];
  if (!Number.isFinite(clearance) || clearance < 0 || !origin.every(Number.isFinite)) throw new Error('Invalid clearance or placement origin.');
  const findings = [], seen = new Set();
  const add = (type, o, point, message) => { const key = `${type}:${o.id}`; if (!seen.has(key)) { seen.add(key); findings.push({ type, id: o.id, point, message }); } };
  const p = ([x, y]) => [x + origin[0], y - origin[1]];
  const conductors = [
    ...art.tracks, ...art.arcs.map(a => ({ ...a, pts: arcPoints(a.start, a.mid, a.end) })),
    ...art.vias.map(v => ({ ...v, pts: [[v.x, v.y], [v.x, v.y]], width: v.diameter, layer: '*.Cu', item: 'vias' })),
    ...art.pads.map(v => ({
      ...v, pts: [[v.x, v.y], [v.x, v.y]], width: v.shape === 'circle' ? v.w : Math.hypot(v.w, v.h),
      layer: v.drill ? '*.Cu' : v.layer, item: v.drill ? 'vias' : 'pads',
    })),
  ];
  const planes = board.copper.filter((o) => o.polygon && o.net === (opt.groundNet || 'GND'));
  const outside = points => board.loops.length &&
    points.some(q => board.loops.filter(l => inside(q, l)).length % 2 !== 1);
  const boardEdges = board.edges.flatMap(e => e.slice(1).map((q, j) => [e[j], q]));
  const edgeMargin = clearance + 0.025;
  for (const t of conductors) {
    // A generated rectangular SMD pad is axis-aligned on the board. Its
    // enclosing circle can extend far beyond the copper at a board edge.
    const padOutline = t.item === 'pads' && t.shape === 'rect' ? {
      polygon: [
        [t.x - t.w / 2, t.y - t.h / 2], [t.x + t.w / 2, t.y - t.h / 2],
        [t.x + t.w / 2, t.y + t.h / 2], [t.x - t.w / 2, t.y + t.h / 2],
      ].map(p),
    } : null;
    const contactEnd = new Map();
    let along = 0;
    for (let i = 1; i < t.pts.length; i++) {
      const a = p(t.pts[i - 1]), b = p(t.pts[i]), radius = t.width / 2 + edgeMargin;
      if (outside(padOutline?.polygon ?? [a, b])) add('edge', { id: 'outline' }, a, 'Copper extends outside the board or into an outline cutout.');
      if (boardEdges.some(([c, d]) => padOutline ? hits(c, d, edgeMargin, padOutline) : segmentDistance(a, b, c, d) < radius)) {
        add('edge', { id: 'outline-clearance' }, a, 'Copper is too close to a board edge.');
      }
      for (const o of board.holes) if (shareCopperLayer(t, o) && pointDistance(o.point, a, b) < radius + o.radius) add('hole', o, o.point, 'Copper conflicts with a drill or mounting hole.');
      for (const o of board.keepouts) {
        if (sameLayer(t.layer, o.layer) && (o.restricted?.includes(t.item || 'tracks') ?? true) && hits(a, b, radius, o)) {
          add('keepout', o, a, 'Copper enters a keepout.');
        }
      }
      for (const o of board.copper) {
        if (!shareCopperLayer(t, o)) continue;
        if (t.net && t.net === o.net) {
          if (t.role !== 'winding' || !hits(a, b, t.width / 2, o)) continue;
          if (along - (contactEnd.get(o) ?? along) > t.width) {
            add('winding-bypass', o, a, `Copper on ${t.net} touches separated sections of the winding on ${t.layer} and may bypass turns.`);
          }
          contactEnd.set(o, along + distance(a, b));
        } else if (hits(a, b, radius, o)) {
          add('copper', o, a, `Clearance conflict with ${o.net || 'unassigned copper'} on ${o.layer}.`);
        }
      }
      if (opt.kind !== 'filter' && t.role === 'winding') for (const o of planes) if (!sameLayer(t.layer, o.layer) && hits(a, b, radius, o)) add('ground-overlap', o, a, 'Ground copper overlaps the winding projection; inductance and loss models exclude its effect.');
      if (opt.distributed && t.layer === (opt.signalLayer ?? art.tracks[0]?.layer)
          && (t.net !== (opt.groundNet || 'GND') || t.referenceSignal)) {
        const groundLayer = opt.groundLayer || 'B.Cu';
        const covered = planes.filter((o) => o.layer === groundLayer).some((o) => inside(a, o.polygon) && inside(b, o.polygon) && !edgesOf(o.polygon).some(([c, d]) => segmentDistance(a, b, c, d) < radius));
        if (!covered) add('reference-ground', { id: 'ground' }, a, `Continuous reference ground on ${groundLayer} was not confirmed beneath the signal.`);
      }
      along += distance(a, b);
    }
  }
  if (opt.seriesWinding) windingBypasses(art, board, origin, add);
  return { findings: opt.allFindings ? findings : findings.slice(0, 200), total: findings.length, warnings: board.warnings,
    preview: boardArtwork(board, art, origin, findings), origin, clearance };
}

function boardArtwork(board, design, origin, findings) {
  const A = artwork({ name: 'Placement preview' });
  for (const o of [...board.copper, ...board.keepouts]) {
    const pts = o.polygon ? [...o.polygon, o.polygon[0]] : o.pts;
    if (pts) A.tracks.push(track('Board', o.width || 0.12, pts));
  }
  for (const e of board.edges) A.tracks.push(track('Edge', 0.2, e));
  const move = ([x, y]) => [x + origin[0], y - origin[1]];
  for (const t of design.tracks) A.tracks.push({ ...t, layer: 'Design', pts: t.pts.map(move) });
  for (const a of design.arcs) A.tracks.push(track('Design', a.width, arcPoints(a.start, a.mid, a.end).map(move)));
  for (const pad of [...design.pads, ...design.vias]) {
    const [x, y] = move([pad.x, pad.y]);
    A.pads.push({ ...pad, x, y, w: pad.w ?? pad.diameter, h: pad.h ?? pad.diameter,
      shape: pad.shape || 'circle', layer: 'Design', drill: 0 });
  }
  for (const f of findings.slice(0, 200)) A.pads.push({ x: f.point[0], y: f.point[1], w: 0.8, h: 0.8, shape: 'circle', layer: 'Conflict', drill: 0 });
  return A;
}

export function reviewBoardPlacement(art, config, text, excluded, options = {}) {
  const tolerance = art.meta.exactPaths ? 0 : config.tolerance;
  const prepared = tolerance > 0 ? {
    ...art, tracks: art.tracks.map(t => ({ ...t, pts: decimate(t.pts, tolerance) })),
  } : art;
  const board = parseBoard(text, excluded);
  const origin = config.placementOrigin || [0, 0];
  const checked = checkPlacement(prepared, board, { origin, clearance: config.traceS, ...options, allFindings: true });
  const payload = toKicad(prepared);
  const copper = [...payload.tracks, ...payload.arcs, ...payload.pads];
  const layers = new Set([...copper, ...payload.texts].map(p => p.layer));
  if (options.distributed && options.groundLayer) layers.add(options.groundLayer);
  if (payload.vias.length) for (const name of ['F.Cu', 'B.Cu']) layers.add(name);
  if (payload.pads.length) layers.add('F.Cu');
  for (const pad of payload.pads.filter(p => p.mask !== false)) layers.add(pad.layer.replace('.Cu', '.Mask'));
  const requiredNets = [...new Set([...copper, ...payload.vias].map(p => p.net).filter(Boolean))];
  const nets = options.nets ?? board.nets;
  const issues = checked.findings.filter(f => options.kind === 'transformer' || f.type !== 'ground-overlap');
  for (const layer of layers) {
    if (!board.layers.includes(layer)) issues.push({ type: 'layer', layer, message: `Destination lacks ${layer}.` });
  }
  if (options.requireNets) for (const net of requiredNets) {
    if (!nets.includes(net)) issues.push({ type: 'net', net, message: `Create or map the ${net} net in KiCad.` });
  }
  const removed = new Set(excluded);
  const previous = removed.size ? parseBoard(text).copper.filter(item => removed.has(item.id) || removed.has(item.owner)) : [];
  for (const item of previous) {
    const pts = item.pts || [...item.polygon, item.polygon[0]];
    checked.preview.tracks.push(track('Previous placement', item.width || 0.2, pts));
  }
  const added = payload.tracks.reduce((n, t) => n + t.pts.length - 1, 0)
    + payload.arcs.length + payload.vias.length + payload.pads.length + payload.texts.length;
  const windingTerminals = options.seriesWinding ? art.pads.filter(p => p.role === 'terminal').map(p => ({
    point: [p.x + origin[0], p.y - origin[1]], layer: p.drill ? '*.Cu' : p.layer,
  })) : [];
  const continuity = windingContinuity(previous, options.previousPlacement);
  for (const { point: [x, y] } of continuity) {
    checked.preview.pads.push({ x, y, w: 0.8, h: 0.8, shape: 'circle', layer: 'Conflict', drill: 0 });
  }
  return {
    ...checked, board, payload, issues: issues.slice(0, 200), requiredNets, layers: board.layers, nets,
    windingTerminals: windingTerminals.length === 2 ? windingTerminals : null,
    warnings: [...checked.warnings, ...checked.findings.filter(f => !issues.includes(f)), ...continuity],
    replacement: { removed: removed.size, added, previousCopper: previous.length },
    ready: issues.length === 0,
  };
}
