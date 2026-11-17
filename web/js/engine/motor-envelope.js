const rpmToRadians = 2 * Math.PI / 60;
const copperTempFactor = temperature => 1 + 0.00393 * (temperature - 20);

export const phaseVoltageFromBus = (busVoltage, modulation) =>
  busVoltage * (modulation === 'spaceVector' ? 1 / Math.sqrt(3) : 0.5);

/** Steady-state, sinusoidal, three-phase wye operation with zero d-axis current. */
export function motorEnvelope(motor, config, input) {
  const { Kt, KeMech, Rphase, Lphase } = motor;
  const { vdc, current, ambient, maxTemperature, thermalResistance, speed, targetTorque, modulation } = input;
  if (config.phases !== 3 || !motor.winding?.balanced) {
    throw new Error('The envelope requires a balanced three-phase rotary winding.');
  }
  if (![Kt, KeMech, Rphase, Lphase, vdc, current, thermalResistance, config.polePairs].every(v => Number.isFinite(v) && v > 0) ||
      ![ambient, maxTemperature, config.tempC].every(Number.isFinite) || maxTemperature <= ambient ||
      copperTempFactor(config.tempC) <= 0 || copperTempFactor(maxTemperature) <= 0 ||
      ![speed, targetTorque].every(v => Number.isFinite(v) && v >= 0) ||
      !['spaceVector', 'sine'].includes(modulation)) {
    throw new Error('Enter valid driver limits and a winding temperature limit above ambient.');
  }
  const phaseVoltage = phaseVoltageFromBus(vdc, modulation);
  const resistance = Rphase * copperTempFactor(maxTemperature) / copperTempFactor(config.tempC);
  const heatPerAmpSquared = 1.5 * resistance;
  const thermalCurrent = Math.sqrt((maxTemperature - ambient) / (thermalResistance * heatPerAmpSquared));
  const noLoadRpm = phaseVoltage / (KeMech * rpmToRadians);
  function at(rpm) {
    const omega = rpm * rpmToRadians;
    const emf = KeMech * omega;
    const reactance = config.polePairs * omega * Lphase;
    const headroom = Math.max(0, (phaseVoltage - emf) * (phaseVoltage + emf));
    const b = resistance * emf;
    const denominator = b + Math.sqrt(b * b + (resistance ** 2 + reactance ** 2) * headroom);
    const voltageCurrent = headroom > 0 ? headroom / denominator : 0;
    const peakCurrent = Math.min(current, thermalCurrent, voltageCurrent);
    const limit = voltageCurrent <= Math.min(current, thermalCurrent) ? 'Bus voltage'
      : current <= thermalCurrent ? 'Driver current' : 'Winding temperature';
    return { rpm, peakCurrent, torque: Kt * peakCurrent, limit, voltageTorque: Kt * voltageCurrent };
  }
  const point = at(speed);
  const requestedCurrent = targetTorque / Kt;
  return {
    phaseVoltage, thermalCurrent, noLoadRpm, driverTorque: current * Kt, thermalTorque: thermalCurrent * Kt,
    curve: Array.from({ length: 81 }, (_, i) => at(Math.max(speed, noLoadRpm) * i / 80)),
    point: { ...point, requestedCurrent, copperLoss: heatPerAmpSquared * requestedCurrent ** 2,
      feasible: speed <= noLoadRpm && targetTorque <= point.torque + 1e-12 },
  };
}
