import assert from 'node:assert/strict';
import { defaults, compute, maxRoutedTurns } from '../web/js/ws/motor.js';
import { optimizeMotor } from '../web/js/engine/motor-optimizer.js';
import { motorEnvelope } from '../web/js/engine/motor-envelope.js';
import { motorFieldMap, parseMotorFieldMap } from '../web/js/engine/motor-field-map.js';
import { allocatePlanarForce, linearThrust, planarForceMap, stepperSpeed } from '../web/js/engine/motor-motion.js';
import { exportKicadPcb, exportKicadMod } from '../web/js/engine/exporters.js';
import { interconnectGroups } from './helpers/motor-connectivity.mjs';

const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, a + ' versus ' + b);
const cfg = { ...defaults(), turns: 4 };
const study = { vdc: 24, current: 2, ambient: 25, maxTemperature: 100, thermalResistance: 12,
  speed: 1000, targetTorque: 0.008, modulation: 'spaceVector' };
const wound = (patch, opt) => compute({ ...cfg, ...patch }, { net: 'MOTOR' }, opt);

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
