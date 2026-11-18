import { calibrateStepper, clamp, phaseCurrents, stepperEquilibrium, stepperTorqueModel } from './stepper-drive.js';

const DEG = Math.PI / 180;

export function simulateStepperMove(res, settings, measured = null) {
  const { distance, speed, acceleration, inertia, damping, load, vdc, drop, current, response, observe } = settings;
  if (![speed, acceleration, inertia, vdc, current, response, observe].every(v => Number.isFinite(v) && v > 0) ||
      ![damping, drop].every(v => Number.isFinite(v) && v >= 0) || drop >= vdc ||
      ![distance, load].every(Number.isFinite) || !distance) {
    throw new Error('Use a nonzero move, positive motion and drive limits, and a bridge drop below the bus voltage.');
  }
  const model = stepperTorqueModel(res, measured);
  const { cfg, familyAnalysis: m } = res;
  const voltageLimit = vdc - drop;
  const resistances = m.phaseResistance ?? [m.Rphase, m.Rphase], inductance = m.Lphase;
  if (!(inductance > 0) || !resistances.every(r => r > 0)) throw new Error('The winding requires positive phase resistance and inductance.');
  const steps = Math.round(Math.abs(distance) / m.commandStep), sign = Math.sign(distance);
  if (!steps) throw new Error('The move rounds to zero steps. Increase distance or microstep resolution.');
  const commandedDistance = steps * m.commandStep, endStep = sign * model.direction * steps;
  const startAngle = model.angleAt(cfg.stepIndex);
  const resistingTorque = sign * load;
  let command = step => phaseCurrents(cfg.stepIndex + step, cfg.microsteps, current);
  if (settings.model === 'corrected') {
    const { rows } = calibrateStepper(res, measured, { current, load: resistingTorque });
    command = step => rows[((cfg.stepIndex + step) % rows.length + rows.length) % rows.length].corrected;
    for (let i = 0; i < Math.min(steps + 1, rows.length); i++) {
      if (!command(Math.sign(endStep) * i)) throw new Error('The move includes a step with no stable current correction. Reduce the load or use nominal phase currents.');
    }
  }
  const initial = command(0).map((i, phase) => clamp(i, -voltageLimit / resistances[phase], voltageLimit / resistances[phase]));
  let angle = stepperEquilibrium(model, startAngle, initial, resistingTorque), omega = 0;
  if (angle === null) throw new Error('The loaded rotor cannot hold the starting step at the selected voltage and current.');
  const peakSpeed = Math.min(speed, Math.sqrt(commandedDistance * acceleration));
  const ramp = peakSpeed / acceleration, rampDistance = peakSpeed * ramp / 2;
  const moveTime = ramp * 2 + (commandedDistance - 2 * rampDistance) / peakSpeed;
  const duration = moveTime + observe;
  const stepAt = time => {
    const position = time < ramp ? acceleration * time ** 2 / 2
      : time < moveTime - ramp ? rampDistance + peakSpeed * (time - ramp)
        : commandedDistance - acceleration * Math.max(0, moveTime - time) ** 2 / 2;
    return sign * model.direction * Math.min(steps, Math.floor(Math.max(0, position / m.commandStep) + 1e-9));
  };
  const sampledTorque = Array.from({ length: 96 }, (_, i) => model.sample(model.period * i / 96));
  const stiffness = Math.max(...sampledTorque.map((value, i) => {
    const next = sampledTorque[(i + 1) % sampledTorque.length];
    return value.reduce((sum, v, j) => sum + Math.abs(next[j] - v) * (j === 2 ? 1 : current), 0) * sampledTorque.length / model.period;
  }));
  const dtLimit = Math.min(0.001, response / 2, m.commandStep / (4 * peakSpeed),
    0.1 * Math.sqrt(inertia / stiffness), 0.2 * inertia / damping);
  const count = Math.ceil(duration / dtLimit);
  if (!(count > 0 && count <= 250000)) throw new Error('The move needs too many integration steps. Shorten the move or settling window, or reduce peak speed.');
  const dt = duration / count, stride = Math.max(1, Math.ceil(count / 500));
  const decay = resistances.map(r => -Math.expm1(-dt * r / inductance));
  const responseFraction = -Math.expm1(-dt / response);
  const phase = initial.slice(), points = [];
  const riskWindow = 0.02;
  let riskTime = null, largeErrorSince = null, peakError = 0, voltageSteps = 0, lastUnsettled = moveTime;
  let peakCurrent = Math.max(...initial.map(Math.abs));
  const endAngle = model.angleAt(cfg.stepIndex + endStep);
  const tolerance = m.commandStep * DEG / 2;
  for (let i = 0; i <= count; i++) {
    const time = i * dt, step = stepAt(time), desired = model.angleAt(cfg.stepIndex + step);
    const error = (angle - desired) / DEG;
    peakError = Math.max(peakError, Math.abs(error));
    if (Math.abs(error) >= m.fullStep) {
      largeErrorSince ??= time;
      if (riskTime === null && time - largeErrorSince >= riskWindow) riskTime = time;
    } else largeErrorSince = null;
    if (time >= moveTime && (Math.abs(angle - endAngle) > tolerance || Math.abs(omega) > tolerance / 0.05)) lastUnsettled = time;
    if (i % stride === 0 || i === count) {
      points.push({ time, commanded: (desired - startAngle) / DEG, actual: (angle - startAngle) / DEG, error, currents: phase.slice() });
    }
    if (i === count) break;
    const [a, b, detent] = model.sample(angle), demand = command(step), gain = [a, b];
    let voltageLimited = false;
    for (let j = 0; j < 2; j++) {
      const emf = gain[j] * omega;
      // Invert the exact RL update to request one current-loop response step.
      const requested = emf + resistances[j] * (phase[j] + (demand[j] - phase[j]) * responseFraction / decay[j]);
      const applied = clamp(requested, -voltageLimit, voltageLimit);
      voltageLimited ||= requested !== applied;
      const steady = (applied - emf) / resistances[j];
      phase[j] += (steady - phase[j]) * decay[j];
      peakCurrent = Math.max(peakCurrent, Math.abs(phase[j]));
    }
    if (voltageLimited) voltageSteps++;
    const torque = a * phase[0] + b * phase[1] + detent - resistingTorque - damping * omega;
    omega += dt * torque / inertia;
    angle += dt * omega;
    if (![angle, omega, ...phase].every(Number.isFinite)) throw new Error('The move is numerically unstable. Check inertia, damping and drive limits.');
  }
  return { points, moveTime, commandedDistance: sign * commandedDistance, peakError, riskTime, riskWindow, peakCurrent, voltageFraction: voltageSteps / count,
    finalError: points.at(-1).error, settlingTime: duration - lastUnsettled < Math.min(0.05, observe / 2) ? null : lastUnsettled - moveTime,
    source: settings.model === 'corrected' ? 'Measured phase torque with corrected currents' : measured ? 'Measured phase torque' : 'Sinusoidal field model' };
}
