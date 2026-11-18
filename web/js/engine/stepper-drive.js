const TAU = 2 * Math.PI;
const DEG = Math.PI / 180;
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const modulo = (x, period) => ((x % period) + period) % period;

export function phaseCurrents(step, microsteps, current) {
  const angle = modulo(step, 4 * microsteps) * Math.PI / (2 * microsteps) + Math.PI / 4;
  return [Math.cos(angle), Math.sin(angle)].map(value => current * (microsteps === 1 ? Math.sign(value) : value));
}

export function stepperCalibrationKey(cfg) {
  return JSON.stringify([cfg.shape, cfg.dOuter, cfg.dInner, cfg.stepperPolePairs, cfg.stepperFill, cfg.turns,
    cfg.layers, cfg.traceW, cfg.traceS, cfg.boardT, cfg.copperOz, cfg.bGap, cfg.terminalAngle, cfg.padSize, cfg.viaPad,
    cfg.fillet, cfg.ppt, cfg.cornerR, cfg.aspect, cfg.sides, cfg.viaDrill, cfg.padDrill]);
}

export function parseStepperTorque(text, cfg, referenceCurrent) {
  if (!Number.isFinite(referenceCurrent) || referenceCurrent <= 0) throw new Error('Enter a positive measurement current.');
  const lines = text.trim().split(/\r?\n/).filter(row => row.trim());
  const columns = lines.shift()?.replace(/^\uFEFF/, '').split(',').map(cell => cell.trim().toLowerCase()) ?? [];
  const names = ['angle_deg', 'torque_a_nm', 'torque_b_nm', 'detent_nm'];
  const order = names.map(name => columns.indexOf(name));
  if (order.slice(0, 3).some(index => index < 0) || new Set(columns).size !== columns.length || lines.length > 4096) {
    throw new Error('Use angle_deg, torque_a_nm, torque_b_nm and optional detent_nm columns, with up to 4096 samples.');
  }
  const period = 360 / cfg.stepperPolePairs;
  const samples = lines.map((row, i) => {
    const cells = row.split(',').map(cell => cell.trim());
    const values = order.map(index => index < 0 ? 0 : cells[index] ? Number(cells[index]) : NaN);
    if (cells.length !== columns.length || !values.every(Number.isFinite) || values[0] < 0 || values[0] > period) {
      throw new Error('Invalid torque sample on row ' + (i + 2) + '. Angles must be within 0–' + period + ' mechanical degrees.');
    }
    return values;
  }).sort((a, b) => a[0] - b[0]);
  if (samples[0]?.[0] === 0 && samples.at(-1)[0] === period) {
    const first = samples[0], last = samples.pop();
    for (let i = 1; i < first.length; i++) first[i] = (first[i] + last[i]) / 2;
  }
  if (samples.length < 8 || samples.some((row, i) => {
    const gap = i ? row[0] - samples[i - 1][0] : row[0] + period - samples.at(-1)[0];
    return gap <= 0 || gap > period / 4;
  })) throw new Error('Use at least eight distinct samples spanning the full electrical cycle, with gaps no larger than one quarter cycle.');
  return { referenceCurrent, samples, geometry: stepperCalibrationKey(cfg) };
}

export function stepperTorqueModel({ cfg, familyAnalysis: m, art }, measured) {
  if (!m?.phaseCoefficients || m.kind !== 'stepper') throw new Error('Choose a two-phase PCB stepper.');
  if (art.meta.routingError) throw new Error(art.meta.routingError);
  const p = cfg.stepperPolePairs, period = TAU / p;
  const [a, b] = m.phaseCoefficients;
  const direction = Math.sign(a[0] * b[1] - a[1] * b[0]);
  if (!direction) throw new Error('Use a nonzero airgap field and a working stepper winding.');
  const startingCurrents = phaseCurrents(0, cfg.microsteps, 1);
  const origin = (Math.atan2(dot([a[1], b[1]], startingCurrents), dot([a[0], b[0]], startingCurrents)) + Math.PI / 2) / p;
  const angleAt = step => origin + direction * step * period / (4 * cfg.microsteps);
  const sample = theta => {
    const s = Math.sin(p * theta), c = Math.cos(p * theta);
    return [a[0] * c + a[1] * s, b[0] * c + b[1] * s, 0];
  };
  if (!measured) return { period, angleAt, direction, sample };
  if (measured.geometry !== stepperCalibrationKey(cfg)) throw new Error('The winding or field changed. Import measurements for the current design.');
  const { referenceCurrent, samples } = measured;
  const knots = samples.map(row => row[0] * DEG);
  return { period, angleAt, direction, knots, sample(theta) {
    let x = modulo(theta / DEG, period / DEG);
    const first = samples[0], last = samples.at(-1), degrees = period / DEG;
    if (x < first[0]) x += degrees;
    let lo = 0, hi = samples.length;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid][0] <= x) lo = mid;
      else hi = mid;
    }
    const left = samples[lo], right = samples[hi] || [first[0] + degrees, ...first.slice(1)];
    const f = (x - left[0]) / (right[0] - left[0]);
    return right.slice(1).map((value, i) => (left[i + 1] * (1 - f) + value * f) / (i === 2 ? 1 : referenceCurrent));
  } };
}

export function stepperEquilibrium(model, target, currents, load) {
  const torque = theta => dot(model.sample(theta), [...currents, 1]) - load;
  const start = target - model.period / 2;
  const boundaries = model.knots
    ? model.knots.map(theta => start + modulo(theta - start, model.period)).sort((a, b) => a - b)
    : Array.from({ length: 31 }, (_, i) => start + model.period * (i + 1) / 32);
  boundaries.push(start + model.period);
  let left = start, previous = torque(start), nearest = null;
  for (const next of boundaries) {
    const value = torque(next);
    if (previous >= 0 && value < 0) {
      let root;
      if (model.knots) root = left + (next - left) * previous / (previous - value);
      else {
        let low = left, high = next;
        for (let j = 0; j < 30; j++) {
          const middle = (low + high) / 2;
          if (torque(middle) >= 0) low = middle;
          else high = middle;
        }
        root = (low + high) / 2;
      }
      // A flat zero-torque interval gives no restoring force on one side.
      const epsilon = model.period * 1e-8;
      if (torque(root - epsilon) > 0 && torque(root + epsilon) < 0 &&
          (nearest === null || Math.abs(root - target) < Math.abs(nearest - target))) nearest = root;
    }
    left = next;
    previous = value;
  }
  return nearest;
}

function correctedCurrents(model, target, nominal, load, limit) {
  const [a, b, detent] = model.sample(target), magnitude = Math.hypot(a, b);
  if (magnitude < 1e-12) return null;
  const axis = [a / magnitude, b / magnitude], across = [-axis[1], axis[0]];
  const base = axis.map(value => value * (load - detent) / magnitude);
  let low = -Infinity, high = Infinity;
  const bound = (offset, slope, ceiling) => {
    if (Math.abs(slope) < 1e-12) return offset <= ceiling;
    const edge = (ceiling - offset) / slope;
    if (slope > 0) high = Math.min(high, edge);
    else low = Math.max(low, edge);
    return low <= high;
  };
  for (let i = 0; i < 2; i++) {
    if (!bound(base[i], across[i], limit) || !bound(-base[i], -across[i], limit)) return null;
  }
  // Require restoring torque on each side, including at interpolation knots.
  const delta = model.period * 1e-5;
  for (const sign of [-1, 1]) {
    const near = model.sample(target + sign * delta);
    const slope = near.map((value, i) => (value - [a, b, detent][i]) / (sign * delta));
    if (!bound(dot(slope, [...base, 1]), dot(slope, [...across, 0]), -magnitude * limit * 0.01 / model.period)) return null;
  }
  return base.map((value, i) => value + across[i] * clamp(dot(nominal, across), low, high));
}

export function calibrateStepper(res, measured, settings) {
  const { current, load } = settings, { cfg } = res;
  if (!measured) throw new Error('Import measured phase torque first.');
  if (!(Number.isFinite(current) && current > 0 && Number.isFinite(load))) throw new Error('Use a positive current limit and a finite load torque.');
  const model = stepperTorqueModel(res, measured);
  const rows = Array.from({ length: 4 * cfg.microsteps }, (_, step) => {
    const target = model.angleAt(step), nominal = phaseCurrents(step, cfg.microsteps, current);
    const actual = stepperEquilibrium(model, target, nominal, load);
    const corrected = correctedCurrents(model, target, nominal, load, current);
    return { step, target: modulo(target, model.period) / DEG, nominal,
      actual: actual === null ? null : modulo(actual, model.period) / DEG,
      error: actual === null ? null : (actual - target) / DEG, corrected };
  });
  const errors = rows.filter(row => row.error !== null).map(row => Math.abs(row.error));
  return { rows, settings: { current, load }, period: model.period / DEG, maximumError: errors.length ? Math.max(...errors) : null,
    reachable: rows.filter(row => row.corrected).length, stable: errors.length };
}

export function stepperCurrentCsv(result) {
  const header = 'step,target_angle_deg,nominal_a,nominal_b,actual_angle_deg,nominal_error_deg,corrected_a,corrected_b,reachable';
  return [header, ...result.rows.map(row =>
    [row.step, row.target, ...row.nominal, row.actual, row.error, ...(row.corrected || [null, null]), !!row.corrected].join(','))].join('\n') + '\n';
}
