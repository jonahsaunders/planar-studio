import { evaluatePlanarDrive } from './planar-constructions.js';

const TAU = 2 * Math.PI;
const harmonic = ([cos, sin], angle) => cos * Math.cos(angle) + sin * Math.sin(angle);
const finiteNonnegative = value => Number.isFinite(value) && value >= 0;
const sum = values => values.reduce((a, b) => a + b, 0);
const cross = ([ax, ay], [bx, by]) => ax * by - ay * bx;
const dot = ([ax, ay], [bx, by]) => ax * bx + ay * by;
const scale = ([x, y], factor) => [x * factor, y * factor];
const add = ([ax, ay], [bx, by]) => [ax + bx, ay + by];
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function stepperSpeed(res, settings) {
  const { phaseCoefficients, Rphase, Lphase } = res.familyAnalysis;
  const { vdc, drop, current, rpmMax } = settings;
  if (![vdc, drop, current, rpmMax].every(finiteNonnegative) || drop >= vdc || !rpmMax) {
    throw new Error('Enter a positive speed range and bus voltage above the bridge voltage drop.');
  }
  const peak = phaseCoefficients.map(c => Math.hypot(...c));
  const max = Math.max(...peak);
  const kt = max ? sum(peak.map(v => v ** 2)) / (2 * max) : 0;
  const voltage = vdc - drop;
  return Array.from({ length: 81 }, (_, i) => {
    const rpm = rpmMax * i / 80, omega = rpm * TAU / 60, reactance = omega * res.cfg.stepperPolePairs * Lphase;
    let amps = max ? current : 0, openCircuitVoltage = 0;
    for (const magnitude of peak) {
      if (magnitude === 0) continue;
      const emf = omega * magnitude;
      openCircuitVoltage = Math.max(openCircuitVoltage, emf);
      const factor = magnitude / max;
      const headroom = (voltage - emf) * (voltage + emf);
      const real = Rphase * emf;
      const limit = headroom > 0 ? headroom / (real + Math.hypot(real, Math.sqrt(headroom) * Math.hypot(Rphase, reactance))) : 0;
      amps = Math.min(amps, limit / factor);
    }
    return { rpm, torque: kt * amps, current: amps, openCircuitVoltage, copperLoss: sum(peak.map(v => max ? (amps * v / max) ** 2 * Rphase / 2 : 0)) };
  });
}

function clippedLinearForce(loops, position, length, k, field) {
  const left = position - length / 2, right = position + length / 2;
  let force = 0;
  for (const path of loops) for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1], [x1, y1] = path[i];
    const dx = x1 - x0, dy = y1 - y0;
    if (dy === 0 || Math.max(x0, x1) < left || Math.min(x0, x1) > right) continue;
    let a = 0, b = 1;
    if (dx !== 0) {
      const t0 = (left - x0) / dx, t1 = (right - x0) / dx;
      a = Math.max(0, Math.min(t0, t1));
      b = Math.min(1, Math.max(t0, t1));
    }
    const phase = k * (x0 + dx * (a + b) / 2 - position);
    const halfSpan = k * dx * (b - a) / 2;
    const average = Math.cos(phase) * (halfSpan ? Math.sin(halfSpan) / halfSpan : 1);
    force -= field * average * (b - a) * dy * 1e-3;
  }
  return force;
}

export function linearThrust(res, settings) {
  const { cfg, placed, familyAnalysis: m } = res;
  const { current, magnetLength, target } = settings;
  if (![current, magnetLength, target].every(finiteNonnegative)) throw new Error('Enter a nonnegative current limit, magnet length and thrust target.');
  const k = Math.PI / cfg.polePitch;
  const length = magnetLength || m.minimumMagnetLength;
  const points = Array.from({ length: 81 }, (_, i) => {
    const position = -cfg.travel / 2 + cfg.travel * i / 80;
    const coefficients = length >= m.minimumMagnetLength ? m.phaseCoefficients.map(c => harmonic(c, k * position)) : [0, 0, 0];
    if (length < m.minimumMagnetLength) {
      const share = cfg.coilSeries ? 1 : placed.length / 3;
      for (const coil of placed) {
        coefficients[coil.phase] += clippedLinearForce(coil.loops, position, length, k, cfg.bGap) / share;
      }
    }
    // For three phases with no neutral, the extrema of the peak-current
    // limits and sum-zero constraint use +I, 0 and -I.
    const rank = coefficients.map((value, phase) => ({ value, phase })).sort((a, b) => a.value - b.value);
    const maximum = current * (rank[2].value - rank[0].value);
    const amps = maximum > 0 ? current * Math.min(1, target / maximum) : 0;
    const currents = [0, 0, 0];
    currents[rank[2].phase] = amps;
    currents[rank[0].phase] = -amps;
    return { position, maximum, force: Math.min(target, maximum), reachable: target <= maximum + 1e-12, currents };
  });
  return { points, magnetLength: length, minimumMagnetLength: m.minimumMagnetLength,
    minimumThrust: Math.min(...points.map(p => p.maximum)), reachableFraction: points.filter(p => p.reachable).length / points.length };
}

/** The image of independent current limits is a convex polygon in force
 * space. Sort oriented generators to walk its boundary, carrying the coil
 * currents with every vertex. This also handles collinear force directions. */
export function allocatePlanarForce(generators, target, limit) {
  const result = currents => {
    const force = generators.reduce((total, g, i) => add(total, scale(g, currents[i])), [0, 0]);
    const error = Math.hypot(force[0] - target[0], force[1] - target[1]);
    return { currents, force, error, reachable: error <= 1e-10 + 1e-8 * Math.hypot(...target) };
  };
  const active = generators.map((g, i) => {
    const sign = g[1] > 0 || (g[1] === 0 && g[0] >= 0) ? 1 : -1;
    const oriented = scale(g, sign);
    return { i, sign, oriented, angle: Math.atan2(oriented[1], oriented[0]) };
  }).filter(({ oriented }) => Math.hypot(...oriented) > 1e-15).sort((a, b) => a.angle - b.angle);
  if (!active.length || !limit || target.every(v => v === 0)) return result(generators.map(() => 0));

  // The unconstrained minimum-loss allocation is preferable when it fits.
  let xx = 0, yy = 0, xy = 0;
  for (const [x, y] of generators) { xx += x * x; yy += y * y; xy += x * y; }
  const determinant = xx * yy - xy * xy;
  if (determinant > 16 * Number.EPSILON * (xx + yy) ** 2) {
    const dual = [(yy * target[0] - xy * target[1]) / determinant, (xx * target[1] - xy * target[0]) / determinant];
    const currents = generators.map(g => dot(g, dual));
    if (currents.every(v => Math.abs(v) <= limit)) return result(currents);
  } else {
    // Rank-one minimum-loss allocation for the projected target. Bipolar
    // clipping is monotone, so bisection finds the current multiplier.
    const longest = active.reduce((a, b) => dot(a.oriented, a.oriented) >= dot(b.oriented, b.oriented) ? a : b).oriented;
    const axis = scale(longest, 1 / Math.hypot(...longest));
    const coefficients = generators.map(g => dot(g, axis));
    const desired = dot(target, axis);
    if (Math.abs(desired) > 1e-14) {
      let low = 0, high = Math.max(...coefficients.filter(v => v !== 0).map(v => limit / Math.abs(v)));
      for (let i = 0; i < 64; i++) {
        const mid = (low + high) / 2;
        if (sum(coefficients.map(v => v * clamp(mid * v, -limit, limit))) < Math.abs(desired)) low = mid;
        else high = mid;
      }
      return result(coefficients.map(v => Math.sign(desired) * clamp(high * v, -limit, limit)));
    }
    return result(generators.map(() => 0));
  }
  const start = generators.map(() => 0);
  for (const { i, sign } of active) start[i] = -sign * limit;
  let position = active.reduce((v, g) => add(v, scale(g.oriented, -limit)), [0, 0]);
  const currents = start.slice();
  let bestError = Infinity, best = start;
  for (const direction of [1, -1]) for (const { i, sign, oriented } of active) {
    const edge = scale(oriented, direction * 2 * limit);
    const next = add(position, edge);
    const delta = add(target, scale(position, -1));
    const determinant = cross(position, next);
    if (Math.abs(determinant) > 1e-26) {
      const a = cross(target, next) / determinant, b = cross(position, target) / determinant;
      if (a >= -1e-10 && b >= -1e-10 && a + b <= 1 + 1e-10) {
        const inside = currents.map(v => v * (a + b));
        inside[i] += direction * 2 * limit * sign * b;
        return result(inside.map(v => clamp(v, -limit, limit)));
      }
    }
    const t = clamp(dot(delta, edge) / dot(edge, edge), 0, 1);
    const residual = add(delta, scale(edge, -t));
    const error = dot(residual, residual);
    if (error < bestError) {
      bestError = error;
      best = currents.slice();
      best[i] += direction * 2 * limit * sign * t;
    }
    currents[i] = direction * sign * limit;
    position = next;
  }
  return result(best);
}

export function planarForceMap(res, settings) {
  const { cfg, familyAnalysis: m } = res;
  const target = [settings.forceX, settings.forceY], limit = settings.current;
  if (!finiteNonnegative(limit) || !target.every(Number.isFinite)) throw new Error('Enter finite force targets and a nonnegative current limit.');
  const kx = Math.PI / cfg.polePitch, ky = Math.PI / cfg.yPolePitch;
  const size = 13;
  const at = (x, y) => {
    if (res.construction) {
      const drive = res.construction.driveAt(x, y);
      const biasedTarget = target.map((value, i) => value - (drive.bias?.[i] ?? 0));
      const solved = allocatePlanarForce(drive.generators, biasedTarget, limit);
      const evaluated = evaluatePlanarDrive(res.construction, [x, y], { currents: solved.currents, drive });
      return { x, y, ...solved, force: evaluated.force, currents: evaluated.currents, copperLoss: evaluated.copperLoss };
    }
    const generators = m.xCoefficients.map((c, i) => [harmonic(c, kx * x), harmonic(m.yCoefficients[i], ky * y)]);
    const solved = allocatePlanarForce(generators, target, limit);
    return { x, y, ...solved, copperLoss: res.analysis.Rdc * sum(solved.currents.map(i => i * i)) };
  };
  const positions = Array.from({ length: size }, (_, i) => -cfg.travel / 2 + cfg.travel * i / (size - 1));
  const points = positions.flatMap(y => positions.map(x => at(x, y)));
  return { size, positions, target, points, selected: at(cfg.moverX, cfg.moverY), channelNames: res.construction?.channelNames,
    reachableFraction: points.filter(point => point.reachable).length / points.length };
}
