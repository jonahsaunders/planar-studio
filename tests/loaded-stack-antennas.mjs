import assert from 'node:assert/strict';
import { loadedTransformer } from '../web/js/engine/transformer-load.js';
import { C } from '../web/js/engine/complex.js';
import { windingSetup, resolveStack } from '../web/js/engine/winding-stack.js';
import * as transformer from '../web/js/ws/transformer.js';
import * as antenna from '../web/js/ws/antenna.js';
import { STACK_PRESETS } from '../web/js/engine/transformer.js';
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`  ok ${name}`); };
const c = { ...transformer.defaults(), driveMode: 'voltage', sourceVoltage: 2, sourceR: 3, sourceX: 4, freq: 10000, loadR: 17, loadX: -8 };
const L = [[200e-6, 60e-6], [60e-6, 50e-6]], R = [0.8, 0.3], w = 2 * Math.PI * c.freq;
check('Two-winding loaded solve agrees with independent reflected impedance', () => {
  const z2 = [R[1] + c.loadR, w * L[1][1] + c.loadX];
  const zin = C.add([R[0] + c.sourceR, w * L[0][0] + c.sourceX], C.div([w ** 2 * L[0][1] ** 2, 0], z2));
  const i1 = C.div([c.sourceVoltage, 0], zin), i2 = C.div(C.mul([0, -w * L[0][1]], i1), z2);
  const r = loadedTransformer(c, L, R);
  r.currents.forEach((z, i) => z.forEach((v, j) => near(v, [i1, i2][i][j])));
  near(r.outputs[0].voltage, C.abs(C.mul([c.loadR, c.loadX], i2)));
  near(r.powerBalanceError, 0);
  assert.ok(r.efficiency > 0 && r.efficiency < 1);
});
check('Open, short, uncoupled and purely reactive loads obey physical limits', () => {
  const open = loadedTransformer({ ...c, loadMode: 'open' }, L, R);
  near(open.outputs[0].current, 0); near(open.outputs[0].voltage, open.outputs[0].openVoltage);
  const short = loadedTransformer({ ...c, loadMode: 'short' }, L, R);
  near(short.outputs[0].voltage, 0); near(short.outputPower, 0); near(short.powerBalanceError, 0);
  assert.ok(short.outputs[0].current > 0); assert.equal(short.outputs[0].regulation, null);
  const zero = loadedTransformer(c, [[L[0][0], 0], [0, L[1][1]]], R);
  near(zero.outputs[0].voltage, 0); near(zero.outputs[0].current, 0);
  const reactive = loadedTransformer({ ...c, loadR: 0 }, L, R);
  near(reactive.outputPower, 0); near(reactive.powerBalanceError, 0);
});
check('Four-winding mixed terminations satisfy every port KVL and conservation', () => {
  const turns = [10, 5, 3, 2], matrix = turns.map((a, i) => turns.map((b, j) => a * b * 1e-6 + (i === j ? 5e-6 : 0)));
  const cfg = { ...c, load2Mode: 'open', load3Mode: 'short' }, rs = [1, 0.7, 0.6, 0.5];
  const r = loadedTransformer(cfg, matrix, rs, ['P', 'S', 'S2', 'S3']);
  const sourceDrop = C.mul([c.sourceR, c.sourceX], r.currents[0]);
  near(sourceDrop[0] + r.voltages[0][0], c.sourceVoltage); near(sourceDrop[1] + r.voltages[0][1], 0);
  const loadDrop = C.mul([c.loadR, c.loadX], r.currents[1]);
  near(loadDrop[0] + r.voltages[1][0], 0); near(loadDrop[1] + r.voltages[1][1], 0);
  near(C.abs(r.currents[2]), 0); near(C.abs(r.voltages[3]), 0); near(r.powerBalanceError, 0);
});
check('Negative, nonfinite and unknown circuit inputs fail explicitly', () => {
  for (const extra of [{ loadR: -1 }, { sourceR: -1 }, { sourceVoltage: NaN }, { loadX: Infinity }, { loadMode: 'invalid' }]) assert.throws(() => loadedTransformer({ ...c, ...extra }, L, R));
});
check('Layer assistant handles odd occupied counts and sparse physical layers', () => {
  near(windingSetup({ ...c, family: 'center-tapped', stackPlan: 'P,S,S' }, { layerCount: 2 }).required, 4);
  assert.equal(windingSetup({ ...c, family: 'multilayer', stackPlan: 'P,P,S,S' }, { layerCount: 4 }).insufficient, false);
  const sparse = { ...c, family: 'multilayer', stackPlan: 'P,P,S,S', copperLayers: 'F.Cu,In2.Cu,In4.Cu,B.Cu' };
  near(windingSetup(sparse, { layerCount: 4 }).required, 6);
  assert.equal(windingSetup(sparse, { layerCount: 4 }).insufficient, true);
  assert.deepEqual(resolveStack(sparse, { layerCount: 6 }, 4).layers, ['F.Cu', 'In2.Cu', 'In4.Cu', 'B.Cu']);
  assert.equal(windingSetup(c, null).available, null);
  near(windingSetup({ ...sparse, family: 'aircore' }, { layerCount: 2 }).required, 2);
});
for (const family of ['aircore', ...Object.keys(STACK_PRESETS)]) check(`${family}: loaded results, unchanged artwork and serializable specification`, () => {
  const config = { ...c, family, stackPlan: STACK_PRESETS[family] || c.stackPlan, dOuter: 40 };
  const r = transformer.compute(config), legacy = transformer.compute({ ...config, driveMode: 'current' });
  assert.deepEqual(r.art, legacy.art);
  assert.ok(r.analysis.loaded.outputs.length > 0);
  near(r.analysis.loaded.powerBalanceError, 0);
  assert.ok(!/NaN|undefined|Infinity/.test(JSON.stringify(transformer.spec(config, r))));
  assert.deepEqual(transformer.compute(JSON.parse(JSON.stringify(config))).analysis.loaded, r.analysis.loaded);
  if (family === 'ferrite') {
    const flux = r.analysis.loaded.currents.reduce((sum, I, i) => C.add(sum, C.scale(I, r.core.AL * r.windings[i].turns)), [0, 0]);
    near(r.core.Bpeak, Math.SQRT2 * C.abs(flux) / (config.coreAe * 1e-6));
    const changedUnusedVoltage = transformer.compute({ ...config, coreVoltage: 999 });
    near(changedUnusedVoltage.core.Bpeak, r.core.Bpeak);
    assert.equal(changedUnusedVoltage.notes.some(n => n.text.includes('exceeds the entered design flux limit')), false);
  }
});
check('Circular patch radius scales resonance and preserves an isolated back ground', () => {
  const config = { ...antenna.defaults(), family: 'circular-patch' }, r = antenna.compute(config);
  near(r.analysis.resonance, config.freq, 1e-8);
  assert.ok(r.analysis.radius > 15 && r.analysis.radius < 18, '2.45 GHz FR4 radius should be about 16 mm');
  assert.ok(antenna.compute({ ...config, radiusScale: 1.1 }).analysis.resonance < r.analysis.resonance);
  assert.equal(r.art.pads.find(p => p.role === 'patch').shape, 'circle');
  assert.equal(r.art.vias.length, 0);
  assert.throws(() => antenna.compute({ ...config, boardT: 10, freq: 30e9 }), /thick/);
});
check('Slot aperture contains no back copper and its feed crosses on the front', () => {
  const config = { ...antenna.defaults(), family: 'slot' }, r = antenna.compute(config);
  const ground = r.art.pads.filter(p => p.layer === 'B.Cu'); assert.equal(ground.length, 4);
  for (const p of ground) {
    const overlapX = Math.min(p.x + p.w / 2, r.analysis.slotLength / 2) - Math.max(p.x - p.w / 2, -r.analysis.slotLength / 2);
    const overlapY = Math.min(p.y + p.h / 2, config.slotWidth / 2) - Math.max(p.y - p.h / 2, -config.slotWidth / 2);
    assert.ok(overlapX < 1e-10 || overlapY < 1e-10, 'Ground fills slot');
  }
  const feed = r.art.tracks[0]; assert.equal(feed.layer, 'F.Cu');
  assert.ok(feed.pts[0][1] < -config.slotWidth / 2 && feed.pts[1][1] > config.slotWidth / 2);
  assert.equal(r.art.outline.length, 1, 'Slot is not an Edge.Cuts opening');
  assert.equal(r.analysis.resonance, undefined, 'Half-wave initial length is not a solved resonance');
  near(antenna.compute({ ...config, freq: config.freq * 2 }).analysis.slotLength, r.analysis.slotLength / 2);
  assert.throws(() => antenna.compute({ ...config, slotWidth: 20 }), /too short/);
});
console.log(`${checks} loaded circuit, layer setup and antenna checks passed.`);
