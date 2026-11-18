import { windingPhasors, phaseAngle } from './winding-design.js';

const TAU = 2 * Math.PI;
const degrees = Math.PI / 180;

/** A numeric Cartesian Bz slice in the rotor's reference frame, optionally at
 * multiple measured or simulated air gaps. All distances are millimetres. */
export function parseMotorFieldMap(text) {
  if (typeof text !== 'string' || text.length > 1500000) throw new Error('Choose a field map CSV under 1.5 MB.');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  const header = (lines.shift() ?? '').toLowerCase().split(',').map(value => value.trim());
  const columns = ['x_mm', 'y_mm', 'bz_t'].map(name => header.indexOf(name));
  const gapColumn = header.indexOf('gap_mm');
  if (columns.includes(-1) || new Set(header).size !== header.length || !lines.length || lines.length > 25000) {
    throw new Error('Use CSV columns x_mm, y_mm and bz_t, with optional gap_mm and up to 25,000 samples.');
  }
  const byGap = new Map();
  lines.forEach((line, i) => {
    const cells = line.split(',').map(value => value.trim());
    const required = gapColumn >= 0 ? [...columns, gapColumn] : columns;
    if (cells.length !== header.length || required.some(index => !cells[index] || !Number.isFinite(Number(cells[index])))) {
      throw new Error('Field map sample ' + (i + 1) + ' has a missing or invalid number.');
    }
    const [x, y, bz] = columns.map(index => Number(cells[index]));
    const gap = gapColumn < 0 ? null : Number(cells[gapColumn]);
    if (gap < 0) throw new Error('Air gap values must be nonnegative.');
    if (!byGap.has(gap)) byGap.set(gap, []);
    byGap.get(gap).push({ x, y, bz });
  });
  if (byGap.size > 8) throw new Error('Import at most eight air-gap planes per study.');
  return [...byGap].sort((a, b) => a[0] - b[0]).map(([gap, rows]) => {
    const x = [...new Set(rows.map(row => row.x))].sort((a, b) => a - b);
    const y = [...new Set(rows.map(row => row.y))].sort((a, b) => a - b);
    const data = new Map(rows.map(row => [row.x + ',' + row.y, row.bz]));
    if (x.length < 2 || y.length < 2 || data.size !== rows.length || data.size !== x.length * y.length) {
      throw new Error('Each field plane needs a complete rectangular grid with unique x/y coordinates.');
    }
    return { gap, x, y, bz: y.flatMap(yi => x.map(xi => data.get(xi + ',' + yi))) };
  });
}

function cell(axis, v) {
  let lo = 0, hi = axis.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (axis[mid] <= v) lo = mid;
    else hi = mid;
  }
  return lo;
}

function fieldAt(plane, x, y) {
  const ix = cell(plane.x, x), iy = cell(plane.y, y);
  const fx = (x - plane.x[ix]) / (plane.x[ix + 1] - plane.x[ix]);
  const fy = (y - plane.y[iy]) / (plane.y[iy + 1] - plane.y[iy]);
  const i = iy * plane.x.length + ix, j = i + plane.x.length;
  const low = plane.bz[i] + fx * (plane.bz[i + 1] - plane.bz[i]);
  const high = plane.bz[j] + fx * (plane.bz[j + 1] - plane.bz[j]);
  return low + fy * (high - low);
}

function segments(cfg, art, map) {
  const wave = art.meta.radialWave;
  const phases = Array.from({ length: wave ? 3 : cfg.phases }, () => []);
  const weights = [];
  if (!wave) {
    const winding = windingPhasors(cfg);
    if (winding.parallelMismatch || winding.phases.some(phase => !phase.branches.length)) {
      throw new Error('Use a complete winding schedule with compatible parallel branches.');
    }
    for (const phase of winding.phases) for (const branch of phase.branches) for (const i of branch.coils) {
      weights[i] = phase.resistanceFactor / branch.coils.length;
    }
  }
  const copper = art.tracks.filter(track => wave ? track.role === 'wave-winding' : Number.isInteger(track.coilIndex));
  let radius = 0;
  for (const track of copper) for (const [x, y] of track.pts) radius = Math.max(radius, Math.hypot(x, y));
  if (!radius) throw new Error('Generate the rotary winding first.');
  let step = 2;
  for (const { x, y } of map) {
    if (x[0] > -radius || x.at(-1) < radius || y[0] > -radius || y.at(-1) < radius) {
      throw new Error('Every field plane must cover the rotating winding out to ±' + radius.toFixed(2) + ' mm on both axes.');
    }
    step = Math.min(step, (x.at(-1) - x[0]) / (2 * (x.length - 1)), (y.at(-1) - y[0]) / (2 * (y.length - 1)));
  }
  let count = 0;
  for (const { pts, phase, coilIndex } of copper) for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i - 1], [endX, endY] = pts[i];
    const dx = endX - x, dy = endY - y;
    const pieces = Math.ceil(Math.hypot(dx, dy) / step);
    if ((count += pieces) > 160000) throw new Error('This field-grid and winding combination is too dense. Use a smaller field grid or simplify the winding.');
    for (let k = 0; k < pieces; k++) {
      const fraction = (k + 0.5) / pieces;
      const mx = x + fraction * dx, my = y + fraction * dy;
      // Rotor reaction is the opposite of the moment on the conductor.
      const moment = 1e-6 * (mx * dx + my * dy) * (wave ? 1 : weights[coilIndex]) / pieces;
      if (Math.abs(moment) > 1e-15) phases[phase].push([mx, my, moment]);
    }
  }
  return phases;
}

function analysePlane(cfg, paths, plane, opt) {
  const count = 360;
  const phaseTorque = paths.map(path => Array.from({ length: count }, (_, i) => {
    const angle = TAU * i / count;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    let sum = 0;
    for (const [x, y, moment] of path) sum += moment * fieldAt(plane, cos * x + sin * y, -sin * x + cos * y);
    return sum;
  }));
  // The flux linkage is periodic. Remove the DC term associated with the
  // stationary reference return omitted from each open copper path.
  for (const phase of phaseTorque) {
    const mean = phase.reduce((sum, value) => sum + value, 0) / count;
    for (let i = 0; i < count; i++) phase[i] -= mean;
  }
  const sequence = sign => {
    let cos = 0, sin = 0;
    for (let i = 0; i < count; i++) for (let phase = 0; phase < paths.length; phase++) {
      const angle = TAU * cfg.polePairs * i / count + sign * phaseAngle(phase, paths.length);
      cos += phaseTorque[phase][i] * Math.cos(angle);
      sin += phaseTorque[phase][i] * Math.sin(angle);
    }
    return { sign, angle: Math.atan2(sin, cos), strength: Math.hypot(cos, sin) };
  };
  const forward = sequence(1), reverse = sequence(-1);
  const drive = forward.strength >= reverse.strength ? forward : reverse;
  const omega = opt.rpm * TAU / 60;
  const points = Array.from({ length: count }, (_, i) => {
    const phi = TAU * cfg.polePairs * i / count - drive.angle + opt.advance * degrees;
    const phase = phaseTorque.map(samples => samples[i]);
    const torque = phase.reduce((sum, factor, p) => sum + opt.current * factor * Math.cos(phi + drive.sign * phaseAngle(p, paths.length)), 0);
    return { angle: 360 * i / count, emf: phase.map(factor => omega * factor), torque };
  });
  const meanTorque = points.reduce((sum, p) => sum + p.torque, 0) / count;
  const ripple = Math.max(...points.map(p => p.torque)) - Math.min(...points.map(p => p.torque));
  const peakEmf = phaseTorque.map(values => omega * Math.max(...values.map(Math.abs)));
  points.push({ ...points[0], angle: 360 });
  return { gap: plane.gap, meanTorque, ripple, ripplePercent: Math.abs(meanTorque) > 1e-12 ? 100 * ripple / Math.abs(meanTorque) : null,
    peakEmf, driveSequence: drive.sign, electricalOffset: -drive.angle / degrees + opt.advance, points };
}

export function motorFieldMap(cfg, art, map, opt, progress = () => {}) {
  if (!['rotary', 'dual-rotor'].includes(cfg.motorFamily ?? 'rotary') || !art.meta.radialWave && (cfg.connection !== 'series' || cfg.phases < 2)) {
    throw new Error('Field-map analysis needs a rotary stator with series layers and at least two phases.');
  }
  if (art.meta.routingError) throw new Error(art.meta.routingError);
  if (!Array.isArray(map) || !map.length) throw new Error('Import a field map CSV first.');
  const validAxis = axis => Array.isArray(axis) && axis.length >= 2 && axis.every((v, i) => Number.isFinite(v) && (!i || v > axis[i - 1]));
  if (map.length > 8 || map.some(plane => !plane || !validAxis(plane.x) || !validAxis(plane.y) ||
    !Array.isArray(plane.bz) || plane.bz.length !== plane.x.length * plane.y.length || !plane.bz.every(Number.isFinite) ||
    (plane.gap !== null && (!Number.isFinite(plane.gap) || plane.gap < 0))) ||
    map.reduce((sum, plane) => sum + plane.bz.length, 0) > 25000) {
    throw new Error('The saved field map is incomplete or invalid. Import the CSV again.');
  }
  if (![opt.rpm, opt.current].every(value => value >= 0 && Number.isFinite(value)) || !Number.isFinite(opt.advance)) {
    throw new Error('Enter a nonnegative speed and current and a valid electrical advance.');
  }
  const paths = segments(cfg, art, map);
  return map.map((plane, i) => {
    progress({ done: i, total: map.length, message: 'Integrating the winding paths' });
    return analysePlane(cfg, paths, plane, opt);
  });
}
