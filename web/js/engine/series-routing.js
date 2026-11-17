import { pointSegment, segmentDistance } from './obstacles.js';

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
// KiCad board and footprint coordinates are rounded to micrometres.
const exportMargin = 0.01;

function segments(path) {
  let along = 0;
  return path.slice(1).map((b, i) => {
    const a = path[i], start = along;
    along += distance(a, b);
    return { a, b, start, end: along };
  });
}

function near(a, b, c, d, gap) {
  for (const axis of [0, 1]) {
    if (Math.max(a[axis], b[axis]) + gap < Math.min(c[axis], d[axis]) ||
        Math.max(c[axis], d[axis]) + gap < Math.min(a[axis], b[axis])) return false;
  }
  return segmentDistance(a, b, c, d) < gap;
}

function hasTurnBypass(winding, width) {
  const gap = width + exportMargin;
  const sorted = winding.map(s => ({ ...s, left: Math.min(s.a[0], s.b[0]), right: Math.max(s.a[0], s.b[0]) }))
    .sort((a, b) => a.left - b.left);
  for (const [i, a] of sorted.entries()) {
    for (let j = i + 1; j < sorted.length && sorted[j].left < a.right + gap; j++) {
      const b = sorted[j];
      if (Math.max(a.start, b.start) - Math.min(a.end, b.end) > 2 * gap &&
          near(a.a, a.b, b.a, b.b, gap)) return true;
    }
  }
  return false;
}

// Each layer has just one connection at either end. Through barrels on
// other layers are obstacles even though all sections carry the same net.
function breakout(end, node, allNodes, cfg, enterFrom) {
  const { path, escape } = end;
  const start = path[0], target = node.point;
  const gap = cfg.traceW + cfg.traceS;
  const approach = [target[0] + enterFrom * (node.radius + gap), target[1]];
  const options = [
    [start, target],
    [start, approach, target],
    [start, escape, target],
    [start, escape, approach, target],
  ];
  const winding = segments(path);
  for (const option of options) {
    const route = option.filter((p, i) => i === 0 || distance(p, option[i - 1]) > 1e-8);
    if (segments(route).every(({ a, b, start: from }) => {
      if (allNodes.some(other => other !== node &&
          pointSegment(other.point, a, b) < other.radius + cfg.traceW / 2 + cfg.traceS + exportMargin)) return false;
      return !winding.some(segment => {
        // Adjacent parts of the same conductor meet at the endpoint. Where
        // the existing shape is already narrower than the requested pitch,
        // the breakout may preserve that spacing but cannot reduce it.
        if (segment.start + from <= 2 * gap || !near(a, b, segment.a, segment.b, gap)) return false;
        const oldGap = pointSegment(start, segment.a, segment.b);
        const allowed = Math.max(cfg.traceW + exportMargin, Math.min(oldGap, gap) - 0.002);
        return segmentDistance(a, b, segment.a, segment.b) < allowed;
      });
    })) return route;
  }
  return null;
}

function fitColumn(nodes, x, endSide, windings, otherNodes, cfg) {
  const gap = cfg.traceS + exportMargin;
  let y = 0;
  for (const [i, node] of nodes.entries()) {
    if (i) y += nodes[i - 1].radius + node.radius + gap;
    node.point = [x, y];
  }
  for (const node of nodes) node.point[1] -= y / 2;
  const allNodes = [...otherNodes, ...nodes];
  for (const node of nodes) {
    if (otherNodes.some(p => distance(p.point, node.point) < p.radius + node.radius + gap)) return false;
    if (windings.some(path => path.some(({ a, b }) =>
      pointSegment(node.point, a, b) < node.radius + cfg.traceW / 2 + gap))) return false;
    node.routes = node.ends.map(end => breakout(end, node, allNodes, cfg, endSide));
    if (node.routes.some(route => !route)) return false;
  }
  return true;
}

export function routeSeriesLayers(layers, cfg) {
  if (!(cfg.viaPad > cfg.viaDrill && cfg.viaDrill > 0 && cfg.padSize > cfg.padDrill && cfg.padDrill >= 0)) return null;
  const count = layers.length;
  const centerX = cfg.shape === 'wedge' ? (cfg.dOuter + cfg.dInner) / 4 : 0;
  const forward = layers[0].pts, mirrored = layers[1].pts;
  const windings = [segments(forward), segments(mirrored)];
  if (hasTurnBypass(windings[0], cfg.traceW)) return null;
  const maxX = forward.reduce((x, p) => Math.max(x, p[0]), -Infinity);
  const outerEscape = maxX + cfg.traceW / 2 + cfg.traceS + exportMargin;
  const nodes = Array.from({ length: count + 1 }, (_, i) => {
    const outer = i % 2 === 0;
    const ends = [];
    for (const index of [i - 1, i]) {
      if (!layers[index]) continue;
      const path = index === i ? layers[index].pts : layers[index].pts.slice().reverse();
      const [x, y] = path[0];
      ends.push({ path, escape: outer ? [outerEscape, y] : [(x + centerX) / 2, y / 2] });
    }
    return { i, ends, radius: (i === 0 || i === count ? cfg.padSize : cfg.viaPad) / 2 };
  });
  const outer = nodes.filter(node => node.i % 2 === 0);
  const inner = nodes.filter(node => node.i % 2 === 1);
  const outerX = outerEscape + Math.max(cfg.padSize, cfg.viaPad) / 2 + cfg.traceW + cfg.traceS;
  if (!fitColumn(outer, outerX, -1, windings, [], cfg)) return null;
  const offset = forward.at(-1)[0] - centerX;
  const enterFrom = Math.sign(offset) || 1;
  if (![0.55, 0.35, 0.15, 0, -0.2, -0.4].some(f =>
    fitColumn(inner, centerX + f * offset, enterFrom, windings, outer, cfg)
  )) return null;

  const paths = layers.map((layer, i) => {
    const start = nodes[i].routes.at(-1);
    const end = nodes[i + 1].routes[0];
    const a = segments(start), b = segments(end);
    const gap = Math.max(cfg.traceW + exportMargin,
      Math.min(cfg.traceW + cfg.traceS, distance(start[0], end[0])) - 0.002);
    if (a.some(p => b.some(q => near(p.a, p.b, q.a, q.b, gap)))) return null;
    // Check both banks of barrels against the entire breakout after each
    // bank has been fitted. Only its own node may touch a breakout trace.
    for (const [path, node] of [[a, nodes[i]], [b, nodes[i + 1]]]) {
      if (nodes.some(other => other !== node && path.some(({ a, b }) =>
        pointSegment(other.point, a, b) < other.radius + cfg.traceW / 2 + cfg.traceS + exportMargin))) return null;
    }
    return [...start.slice().reverse(), ...layer.pts.slice(1), ...end.slice(1)];
  });
  if (paths.some(path => !path)) return null;
  return {
    paths,
    vias: nodes.slice(1, -1).map(({ i, point: [x, y] }) =>
      ({ x, y, from: i - 1, to: i, kind: i % 2 ? 'inner' : 'outer' })),
    terminals: [nodes[0].point, nodes[count].point],
  };
}
