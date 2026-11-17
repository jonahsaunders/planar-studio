import { parseBoard, inside } from './boardcheck.js';

const polygonArea = points => Math.abs(points.reduce((sum, [x, y], i) => {
  const [u, v] = points[(i + 1) % points.length];
  return sum + x * v - y * u;
}, 0) / 2);

export function boardObstacleSource(text, name, excluded = []) {
  const board = parseBoard(text, excluded);
  if (!board.loops.length || board.warnings.some(w => w.includes('Edge.Cuts') || w.includes('board edges are open'))) {
    throw new Error('Close the board outline in KiCad and use supported straight, circular, or arc outlines.');
  }
  if (board.loops.length > 301) throw new Error('Use a board with at most 301 closed edge contours.');
  const loops = board.loops.map(loop => loop.slice(0, -1)).sort((a, b) => polygonArea(b) - polygonArea(a));
  const parents = loops.map((loop, i) => loops.findLastIndex((outer, j) => j < i && inside(loop[0], outer)));
  const depth = i => parents[i] < 0 ? 0 : 1 + depth(parents[i]);
  const keepouts = [...new Map(board.keepouts.map(k => [JSON.stringify([k.id, k.polygon]), k])).values()];
  return {
    name, holes: board.holes.filter(hole => hole.kind === 'pad'),
    keepouts, islands: loops.flatMap((outline, i) => depth(i) % 2 ? [] : [{
      outline, cutouts: loops.filter((_, j) => parents[j] === i),
    }]),
  };
}

export function boardObstaclePatch(source, island, includeHoles, selectedKeepouts) {
  const { outline, cutouts } = source.islands[island];
  const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
  const left = Math.min(...xs), right = Math.max(...xs), bottom = Math.min(...ys), top = Math.max(...ys);
  const center = [(left + right) / 2, (top + bottom) / 2];
  const local = ([x, y]) => [x - center[0], y - center[1]];
  const drills = includeHoles ? source.holes.filter(({ point: [x, y], radius }) =>
    x + radius >= left && x - radius <= right && y + radius >= bottom && y - radius <= top).map(h => {
    const [x, y] = local(h.point);
    return { name: 'Existing drilled pad', x, y, radius: h.radius };
  }) : [];
  return {
    obstacleEnabled: true, obstacleSeedAuto: true, areaWidth: right - left, areaHeight: top - bottom,
    placementOrigin: [center[0], -center[1]], placementRotation: 0,
    obstacleBoard: {
      name: source.name, outline: outline.map(local), cutouts: cutouts.map(p => p.map(local)), drills,
      keepouts: selectedKeepouts.map(i => ({
        name: source.keepouts[i].name || `KiCad keepout ${i + 1}`,
        polygon: source.keepouts[i].polygon.map(local),
      })),
    },
  };
}
