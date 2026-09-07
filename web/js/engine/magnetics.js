/* Air-core magnetics. Geometry in mm, fields in tesla, inductances in henries.
   Equal current sharing is assumed for parallel layers. No ferrite, ground
   planes, eddy currents, or external lead return path is modeled. */
import { buildCoil, analyse, toFilaments, mutualOf, MU0 } from './coil.js';

export function windingPolys(cfg, coil = buildCoil(cfg)) {
  const polys = coil.layers.map((l) => l.pts.map(([x, y]) => [x, y, l.z]));
  for (const link of coil.links) polys.push(link.pts.map(([x, y]) => [x, y, coil.layers[link.layer].z]));
  if (cfg.connection === 'series') {
    for (const v of coil.vias) polys.push([[v.x, v.y, coil.layers[v.from].z], [v.x, v.y, coil.layers[v.to].z]]);
    for (const lead of coil.leads) {
      const pts = lead.terminal === 0 ? lead.pts.slice().reverse() : lead.pts;
      polys.push(pts.map(([x, y]) => [x, y, coil.layers[lead.layer].z]));
    }
  }
  return polys;
}

export function transformPolys(polys, pose = {}) {
  const tilt = (pose.tilt || 0) * Math.PI / 180, rot = (pose.rotation || 0) * Math.PI / 180;
  const ct = Math.cos(tilt), st = Math.sin(tilt), c = Math.cos(rot), s = Math.sin(rot);
  return polys.map((p) => p.map(([x, y, z]) => {
    const xt = x * ct + z * st, zt = -x * st + z * ct;
    return [xt * c - y * s + (pose.x || 0), xt * s + y * c + (pose.y || 0), zt + (pose.z || 0)];
  }));
}

export function coupledCoils(tx, rx, pose, opt = {}) {
  if (!(pose.z > (tx.boardT + rx.boardT) / 2 + rx.dOuter / 2 * Math.abs(Math.sin((pose.tilt || 0) * Math.PI / 180)) + Math.max(tx.traceW, rx.traceW))) {
    throw new Error('Increase center-plane separation: tilted receiver or copper may intersect the transmitter board.');
  }
  const a = buildCoil(tx), b = buildCoil(rx), cap = opt.segmentCap || 1500;
  const aa = analyse(tx, a, { segmentCap: cap }), bb = analyse(rx, b, { segmentCap: cap });
  const P = windingPolys(tx, a), Q = windingPolys(rx, b);
  const A = toFilaments(P, 0.25, cap);
  const scale = (tx.connection === 'parallel' ? tx.layers : 1) * (rx.connection === 'parallel' ? rx.layers : 1);
  const at = (p) => mutualOf(A, toFilaments(transformPolys(Q, p), 0.25, cap), 0) / scale;
  const M = at(pose), k = M / Math.sqrt(aa.L * bb.L);
  if (!Number.isFinite(k) || Math.abs(k) > 1.02) throw new Error('Coupling failed the |k| ≤ 1 check; increase separation or solver resolution.');
  const samples = Math.max(2, Math.min(41, opt.points || 17));
  const maxOffset = opt.maxOffset || tx.dOuter;
  const curve = Array.from({ length: samples }, (_, i) => {
    const x = maxOffset * i / (samples - 1), m = at({ ...pose, x });
    return { x, M: m, k: m / Math.sqrt(aa.L * bb.L) };
  });
  return { L1: aa.L, L2: bb.L, M, k, curve,
    inducedVrms: 2 * Math.PI * tx.freq * Math.abs(M) * tx.current,
    txPolys: P, rxPolys: transformPolys(Q, pose) };
}

/** Midpoint Biot–Savart sum. NaN marks a probe inside the wire exclusion radius. */
export function fieldAt(F, pointMM, current = 1, exclusionMM = 0) {
  const [x, y, z] = pointMM.map((v) => v * 1e-3), out = [0, 0, 0];
  const minR2 = (exclusionMM * 1e-3) ** 2;
  for (let i = 0; i < F.n; i++) {
    const rx = x - F.mx[i], ry = y - F.my[i], rz = z - F.mz[i];
    const r2 = rx * rx + ry * ry + rz * rz;
    if (r2 <= Math.max(minR2, 1e-30)) return [NaN, NaN, NaN];
    const a = MU0 * current / (4 * Math.PI * r2 ** 1.5);
    out[0] += a * (F.dy[i] * rz - F.dz[i] * ry);
    out[1] += a * (F.dz[i] * rx - F.dx[i] * rz);
    out[2] += a * (F.dx[i] * ry - F.dy[i] * rx);
  }
  return out;
}

export function fieldSlice(cfg, opt = {}) {
  const height = opt.height ?? 2;
  if (!(height > cfg.traceW / 2)) throw new Error('Probe height must exceed half the trace width.');
  const n = Math.max(9, Math.min(61, opt.resolution || 31)), extent = cfg.dOuter * 0.65;
  const polys = windingPolys(cfg), phases = opt.motor ? cfg.phases : 1;
  const groups = Array.from({ length: phases }, () => []);
  const count = opt.motor ? cfg.coilCount : 1;
  for (let i = 0; i < count; i++) groups[i % phases].push(...transformPolys(polys, { rotation: i * 360 / count }));
  const filaments = groups.map((p) => toFilaments(p, 0.35, 8000));
  const current = cfg.current / (cfg.connection === 'parallel' ? cfg.layers : 1)
    / (opt.motor && !cfg.coilSeries ? cfg.coilCount / cfg.phases : 1);
  const z = (cfg.layers > 1 ? cfg.boardT / 2 : 0) + height;
  const maps = filaments.map((F) => {
    const values = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) values.push(fieldAt(F, [-extent + 2 * extent * i / (n - 1), -extent + 2 * extent * j / (n - 1), z], current, cfg.traceW / 2));
    return values;
  });
  return { n, extent, z, maps, phases, current: cfg.current, polys: groups.flat() };
}

/** Axial field on the centerline of one uniformly magnetized cylindrical magnet
    in free space. An estimate for a single pole, not the rotor fundamental. */
export function magnetCenterField(br, radius, thickness, gap) {
  if (![br, radius, thickness, gap].every(Number.isFinite) || br <= 0 || radius <= 0 || thickness <= 0 || gap < 0) throw new Error('Invalid magnet dimensions, remanence, or air gap.');
  return br / 2 * ((gap + thickness) / Math.hypot(gap + thickness, radius) - gap / Math.hypot(gap, radius));
}

export function rotorDesign(cfg, r) {
  const count = 2 * cfg.polePairs, radius = r.radius, magnetR = r.diameter / 2;
  if (![count, radius, magnetR, r.angle || 0].every(Number.isFinite) || count < 2 || radius <= 0 || magnetR <= 0) throw new Error('Invalid rotor geometry.');
  const magnets = Array.from({ length: count }, (_, i) => {
    const a = (r.angle || 0) * Math.PI / 180 + i * 2 * Math.PI / count;
    return { x: radius * Math.cos(a), y: radius * Math.sin(a), radius: magnetR, polarity: i % 2 ? -1 : 1 };
  });
  const warnings = [];
  if (2 * radius * Math.sin(Math.PI / count) < 2 * magnetR) warnings.push('Adjacent magnets overlap. Reduce diameter or increase pitch radius.');
  if (radius - magnetR < cfg.dInner / 2 || radius + magnetR > cfg.dOuter / 2) warnings.push('Magnets extend outside the stator active annulus.');
  const estimate = magnetCenterField(r.br, magnetR, r.thickness, r.gap);
  return { magnets, count, estimate, warnings,
    curve: Array.from({ length: 40 }, (_, i) => { const gap = 0.1 + i * Math.max(10, r.gap * 2) / 39; return { gap, B: magnetCenterField(r.br, magnetR, r.thickness, gap) }; }) };
}
