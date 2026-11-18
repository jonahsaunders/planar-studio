import assert from 'node:assert/strict';
import { defaults, compute, maxRoutedTurns } from '../web/js/ws/motor.js';
import { optimizeMotor } from '../web/js/engine/motor-optimizer.js';
import { motorEnvelope } from '../web/js/engine/motor-envelope.js';
import { motorFieldMap, parseMotorFieldMap } from '../web/js/engine/motor-field-map.js';
import { allocatePlanarForce, linearThrust, planarForceMap, stepperSpeed } from '../web/js/engine/motor-motion.js';
import { exportKicadPcb, exportKicadMod } from '../web/js/engine/exporters.js';
import { interconnectGroups } from './helpers/motor-connectivity.mjs';
import { toKicad } from '../web/js/engine/artwork.js';
import { reviewBoardPlacement } from '../web/js/engine/boardcheck.js';
import { calibrateStepper, parseStepperTorque, stepperCurrentCsv, stepperTorqueModel } from '../web/js/engine/stepper-drive.js';
import { simulateStepperMove } from '../web/js/engine/stepper-move.js';

const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, a + ' versus ' + b);
const cfg = { ...defaults(), turns: 4 };
const study = { vdc: 24, current: 2, ambient: 25, maxTemperature: 100, thermalResistance: 12,
  speed: 1000, targetTorque: 0.008, modulation: 'spaceVector' };
const wound = (patch, opt) => compute({ ...cfg, ...patch }, { net: 'MOTOR' }, opt);
const placement = (res, layers, nets) => {
  const copper = layers.map((name, i) => '(' + i + ' "' + name + '" signal)').join(' ');
  const board = '(kicad_pcb (layers ' + copper + ' (37 "F.SilkS" user) (39 "F.Mask" user) (38 "B.Mask" user))'
    + ' (gr_rect (start -200 -200) (end 200 200) (layer "Edge.Cuts") (stroke (width 0.1))))';
  return reviewBoardPlacement(res.art, cfg, board, [], { kind: 'motor', requireNets: true, nets });
};

for (const layers of [4, 6]) for (const coilSeries of [true, false]) {
  const byType = {};
  for (const motorTopology of ['wye', 'delta', 'independent']) {
    const r = wound({ layers, coilSeries, motorTopology });
    assert.equal(r.art.meta.routingError, undefined);
    assert.equal(r.layers.length, layers);
    assert.equal(r.art.meta.busRouted, true);
    const groups = interconnectGroups(r.art);
    const find = name => groups.find(g => g.split(',').includes(name)).split(',');
    for (let p = 0; p < 3; p++) {
      const phase = String.fromCharCode(65 + p);
      const next = String.fromCharCode(65 + (p + 1) % 3);
      const first = 'C' + (p + 1) + '.1';
      const last = 'C' + (p + 10) + '.2';
      const [input, output] = motorTopology === 'wye' ? [phase, 'N'] :
        motorTopology === 'delta' ? [phase, next] : [phase + '+', phase + '-'];
      assert.ok(find(input).includes(first));
      assert.ok(find(output).includes(last));
      assert.ok(!find(input).includes(last));
      if (coilSeries) assert.deepEqual(find('C' + (p + 1) + '.2'), ['C' + (p + 1) + '.2', 'C' + (p + 4) + '.1']);
    }
    const nets = [...new Set(r.art.tracks.map(t => t.net))].sort();
    assert.deepEqual(nets, motorTopology === 'independent' ? ['MOTOR_A', 'MOTOR_B', 'MOTOR_C'] : ['MOTOR']);
    assert.ok(r.motor.routingLoss > 0 && r.motor.Pcu > r.motor.routingLoss);
    const unrouted = wound({ layers, coilSeries, motorTopology, busEnabled: false });
    if (coilSeries) near(r.motor.Pcu - r.motor.routingLoss, unrouted.motor.Pcu, motorTopology === 'delta' ? unrouted.motor.Pcu * 0.01 : 1e-8);
    for (const exporter of [exportKicadPcb, exportKicadMod]) assert.doesNotMatch(exporter(r.art), /NaN|Infinity/);
    byType[motorTopology] = motorEnvelope(r.motor, r.modelCfg, study);
  }
  near(byType.delta.phaseVoltage / byType.wye.phaseVoltage, Math.sqrt(3));
  near(byType.delta.point.requestedLineCurrent / byType.wye.point.requestedLineCurrent, Math.sqrt(3));
  near(byType.independent.phaseVoltage, study.vdc);
}
const blockedDelta = wound({ polePairs: 12, motorTopology: 'delta' }, { quick: true });
assert.match(blockedDelta.art.meta.routingError, /120°/);
const dense = { ...cfg, shape: 'circle', layers: 6, turns: 9 };
const top = maxRoutedTurns(dense, compute(dense, {}, { quick: true }), {});
assert.ok(top >= 1 && top < 9);
assert.equal(compute({ ...dense, turns: top }, {}, { quick: true }).art.meta.busRouted, true);

const limits = { ...study, diameter: 86, minWidth: 0.24, clearance: 0.2, minCoils: 9, maxCoils: 15, maxTurns: 12, maxPolePairs: 12 };
const found = optimizeMotor(cfg, limits);
assert.ok(found.tried >= found.routed && found.routed >= found.verified);
assert.ok(found.candidates.length && found.candidates.every(c => c.point.feasible));
for (const { patch, finishedDiameter, point } of found.candidates) {
  const layout = wound(patch);
  assert.ok(finishedDiameter <= limits.diameter && patch.traceW >= limits.minWidth);
  assert.ok(layout.art.meta.busRouted);
  assert.ok(point.voltageMargin >= 0 && point.temperatureMargin >= 0);
  assert.ok(motorEnvelope(layout.motor, layout.modelCfg, limits).point.feasible);
}
assert.throws(() => optimizeMotor(cfg, { ...limits, maxTemperature: 20 }), /temperature limit/);
assert.ok(!optimizeMotor(cfg, { ...limits, targetTorque: 20, minCoils: 12, maxCoils: 12 }).candidates.some(c => c.point.feasible));

const grid = ['x_mm,y_mm,bz_t,gap_mm'];
for (const gap of [1, 2, 3]) for (let x = -36; x <= 36; x += 2) for (let y = -36; y <= 36; y += 2) {
  const bz = gap === 3 ? 0.3 : 0.5 * Math.cos(cfg.polePairs * Math.atan2(y, x)) / gap;
  grid.push([x, y, bz, gap].join(','));
}
const planes = parseMotorFieldMap(grid.join('\n'));
const art = wound({}, { quick: true }).art;
const field = motorFieldMap(cfg, art, planes, { rpm: 1500, current: 1.5, advance: 0 });
assert.ok(field[0].meanTorque > 0 && field[0].ripple < field[0].meanTorque * 0.02);
near(field[0].meanTorque / field[1].meanTorque, 2);
near(field[0].peakEmf[0] / field[1].peakEmf[0], 2);
near(field[2].meanTorque, 0);
near(field[2].peakEmf[0], 0);
const reduced = motorFieldMap(cfg, art, planes.slice(0, 1), { rpm: 750, current: 1.5, advance: 90 })[0];
near(reduced.peakEmf[0] / field[0].peakEmf[0], 0.5);
near(reduced.meanTorque, 0);
assert.throws(() => parseMotorFieldMap('x_mm,y_mm,bz_t\n0,0,0\n0,0,1'), /complete rectangular/);
const tiny = parseMotorFieldMap('x_mm,y_mm,bz_t\n-1,-1,0\n-1,1,0\n1,-1,0\n1,1,0');
assert.throws(() => motorFieldMap(cfg, art, tiny, { rpm: 1000, current: 1, advance: 0 }), /must cover/);

const stepper = wound({ motorFamily: 'stepper' });
let previous = stepper.familyAnalysis;
for (const layers of [4, 6]) {
  const result = wound({ motorFamily: 'stepper', layers });
  assert.equal(result.art.meta.interconnected, true);
  assert.equal(result.art.meta.exactPaths, true);
  assert.equal(new Set(result.art.tracks.map(track => track.layer)).size, layers);
  assert.deepEqual(interconnectGroups(result.art), interconnectGroups(stepper.art));
  const nets = ['MOTOR_A', 'MOTOR_B'];
  assert.deepEqual([...new Set(toKicad(result.art).tracks.map(track => track.net))].sort(), nets);
  assert.equal(placement(result, result.layers, nets).ready, true);
  assert.equal(placement(result, stepper.layers, nets).ready, false);
  assert.ok(result.familyAnalysis.holding > previous.holding && result.familyAnalysis.Lphase > previous.Lphase);
  assert.ok(result.familyAnalysis.phaseResistance.every((value, i) => value > previous.phaseResistance[i]));
  previous = result.familyAnalysis;
}
const moveMotor = wound({ motorFamily: 'stepper', microsteps: 8, turns: 9 });
const move = { distance: 180, speed: 360, acceleration: 1000, inertia: 1e-5, damping: 5e-4,
  load: 0, current: 1.5, vdc: 24, drop: 0, response: 0.001, observe: 0.5 };
for (const distance of [180, -180]) {
  const result = simulateStepperMove(moveMotor, { ...move, distance });
  near(result.moveTime, 0.86);
  near(result.points.at(-1).commanded, distance);
  near(result.points.at(-1).actual, distance, 0.01);
  assert.ok(result.settlingTime !== null);
  assert.equal(result.riskTime, null);
}
assert.notEqual(simulateStepperMove(moveMotor, { ...move, inertia: 0.001, speed: 3000, acceleration: 50000 }).riskTime, null);
assert.ok(simulateStepperMove(moveMotor, { ...move, vdc: 2 }).voltageFraction > 0.5);
assert.throws(() => simulateStepperMove(moveMotor, { ...move, load: 1 }), /cannot hold/);
assert.throws(() => simulateStepperMove(moveMotor, { ...move, distance: 0.1 }), /rounds to zero/);

const ideal = stepperTorqueModel(moveMotor, null);
const csv = ['angle_deg,torque_a_nm,torque_b_nm,detent_nm'];
for (let deg = 0; deg <= 180; deg += 2.5) {
  const angle = deg * Math.PI / 180, [a, b] = ideal.sample(angle - 0.08);
  csv.push([deg, 2 * a, 1.6 * b, 0.0001 * Math.sin(8 * angle)].join(','));
}
const measurement = JSON.parse(JSON.stringify(parseStepperTorque(csv.join('\n'), moveMotor.cfg, 2)));
const model = stepperTorqueModel(moveMotor, measurement);
for (const theta of [-0.1, 0, 1.2]) model.sample(theta).forEach((value, i) => near(value, model.sample(theta + Math.PI)[i]));
const calibrated = calibrateStepper(moveMotor, measurement, { current: 1.5, load: 0.001 });
assert.equal(calibrated.reachable, 32);
assert.equal(calibrated.stable, 32);
assert.ok(calibrated.maximumError > 1);
for (const row of calibrated.rows) {
  const angle = row.target * Math.PI / 180;
  const torque = theta => {
    const [a, b, detent] = model.sample(theta);
    return a * row.corrected[0] + b * row.corrected[1] + detent;
  };
  near(torque(angle), 0.001, 1e-12);
  assert.ok(torque(angle - 0.001) > torque(angle + 0.001));
  assert.ok(row.corrected.every(i => Math.abs(i) <= 1.5 + 1e-12));
}
assert.equal(stepperCurrentCsv(calibrated).trim().split('\n').length, 33);
assert.equal(calibrateStepper(moveMotor, measurement, { current: 1.5, load: 0.1 }).reachable, 0);
assert.equal(simulateStepperMove(moveMotor, move, measurement).source, 'Measured phase torque');
const correctedMove = simulateStepperMove(moveMotor, { ...move, model: 'corrected' }, measurement);
assert.ok(Math.abs(correctedMove.finalError) < Math.abs(simulateStepperMove(moveMotor, move, measurement).finalError));
assert.throws(() => calibrateStepper(wound({ motorFamily: 'stepper', layers: 4 }), measurement, { current: 1, load: 0 }), /winding or field changed/);
assert.throws(() => parseStepperTorque(csv.slice(0, 7).join('\n'), moveMotor.cfg, 2), /eight distinct samples/);

const wave = wound({ rotaryWinding: 'radial-wave', phases: 1, connection: 'parallel', motorTopology: 'wye' });
assert.equal(wave.layers.length, 6);
assert.equal(wave.modelCfg.phases, 3);
assert.deepEqual(interconnectGroups(wave.art), ['A+,A-', 'B+,B-', 'C+,C-']);
assert.deepEqual([...new Set(toKicad(wave.art).tracks.map(track => track.net))].sort(), ['MOTOR_A', 'MOTOR_B', 'MOTOR_C']);
assert.equal(placement(wave, wave.layers, ['MOTOR_A', 'MOTOR_B', 'MOTOR_C']).ready, true);
assert.equal(placement(wave, wave.layers, ['MOTOR_A', 'MOTOR_B']).ready, false);
assert.ok(wave.wave.phase.every(phase => phase.resistance > 0 && phase.inductance > 0));
assert.ok(motorEnvelope(wave.motor, wave.modelCfg, study).point.torque > 0);
for (const exporter of [exportKicadMod, exportKicadPcb]) assert.doesNotMatch(exporter(wave.art), /NaN|Infinity/);
assert.throws(() => wound({ rotaryWinding: 'radial-wave', dOuter: 26.1 }), /bore/);
const waveField = motorFieldMap(wave.modelCfg, wave.art, planes, { rpm: 1500, current: cfg.current, advance: 0 });
// A 2 mm field grid attenuates the fundamental near the 13 mm bore.
near(waveField[0].meanTorque, wave.motor.torque * 0.5 / cfg.bGap, wave.motor.torque * 0.06);
near(waveField[0].meanTorque / waveField[1].meanTorque, 2);
near(waveField[2].meanTorque, 0);
assert.ok(waveField[0].ripple < waveField[0].meanTorque * 0.015);

const high = stepperSpeed(stepper, { vdc: 24, drop: 1, current: 2, rpmMax: 75000 });
const low = stepperSpeed(stepper, { vdc: 2, drop: 1, current: 2, rpmMax: 75000 });
assert.ok(high[0].torque > low[0].torque && high.at(-1).torque === 0);
assert.ok(high.every((p, i) => p.torque >= low[i].torque && (!i || p.torque <= high[i - 1].torque)));
const linear = wound({ motorFamily: 'linear' });
const full = linearThrust(linear, { current: 2, target: 0.025, magnetLength: 0 });
const short = linearThrust(linear, { current: 2, target: 0.025, magnetLength: 1 });
assert.ok(full.minimumThrust > short.minimumThrust);
assert.ok(full.points.every(p => p.reachable && Math.abs(p.currents.reduce((s, i) => s + i, 0)) < 1e-12));
assert.ok(short.reachableFraction < full.reachableFraction);
const planar = planarForceMap(wound({ motorFamily: 'planar' }), { current: 1.2, forceX: 0.05, forceY: 0.06 });
assert.equal(planar.points.length, planar.size ** 2);
assert.ok(planar.points.every(p => p.currents.every(i => Math.abs(i) <= 1.2 + 1e-10)));
assert.ok(planar.selected.reachable);
const limited = allocatePlanarForce([[1, 0], [0, 1], [1, 1]], [1.9, 0.1], 1);
assert.ok(limited.reachable && limited.currents.every(i => Math.abs(i) <= 1));
const unreachable = allocatePlanarForce([[1, 0], [0, 1]], [2, 3], 1);
assert.deepEqual(unreachable.force, [1, 1]);
assert.equal(unreachable.reachable, false);
const line = allocatePlanarForce([[1, 2], [2, 4]], [1, 2], 1);
assert.ok(line.reachable);
near(line.currents[0], 0.2);
near(line.currents[1], 0.4);
const narrow = allocatePlanarForce([[1e-10, 0], [0, 1], [0, 2]], [0, 1], 1);
assert.ok(narrow.reachable);
near(narrow.currents[1], 0.2);
near(narrow.currents[2], 0.4);
console.log('Multilayer motor connectivity, loss, sizing, field-map integration and motion studies passed.');
