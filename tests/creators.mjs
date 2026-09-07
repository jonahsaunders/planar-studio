import assert from 'node:assert/strict';
import * as antenna from '../web/js/ws/antenna.js';
import * as transformer from '../web/js/ws/transformer.js';
import { toKicad, boundsCopper } from '../web/js/engine/artwork.js';
import { exportKicadMod, exportKicadPcb, exportSvg, exportDxf } from '../web/js/engine/exporters.js';
const near = (a, b, tolerance) => assert.ok(Math.abs(a / b - 1) < tolerance, `${a} vs ${b}`);
const ac = antenna.defaults(), a = antenna.compute(ac, {});
// Independent rounded hand-calculation: 2.45 GHz, er=4.4, h=1.6 mm.
near(a.analysis.W, 37.2343, 1e-5); near(a.analysis.L, 28.8093, 1e-5);
near(a.analysis.feedZ, 50, 1e-6);
assert.ok(antenna.compute({ ...ac, lengthScale: 1.1 }, {}).analysis.resonance < a.analysis.resonance);
assert.ok(antenna.compute({ ...ac, epsR: 2.2 }, {}).analysis.W > a.analysis.W);
assert.ok(antenna.compute({ ...ac, freq: 5e9 }, {}).analysis.L < a.analysis.L);
for (const cfg of [{ freq: NaN }, { boardT: 0 }, { epsR: 1 }, { lengthScale: -1 }]) assert.throws(() => antenna.compute({ ...ac, ...cfg }, {}));
assert.throws(() => antenna.compute(ac, { board: { layerCount: 1 } }));
const tc = transformer.defaults(), t = transformer.compute(tc, { name: 'T1' });
assert.equal(t.analysis.ratio, 2);
assert.ok(t.analysis.k > 0 && t.analysis.k < 1);
const equal = transformer.compute({ ...tc, secondaryTurns: tc.primaryTurns }, {});
near(equal.analysis.L1, equal.analysis.L2, 1e-10);
const swapped = transformer.compute({ ...tc, primaryTurns: tc.secondaryTurns, secondaryTurns: tc.primaryTurns }, {});
near(swapped.analysis.M, t.analysis.M, 1e-9);
assert.ok(transformer.compute({ ...tc, boardT: 3.2 }, {}).analysis.k < t.analysis.k);
near(transformer.compute({ ...tc, current: 2 }, {}).analysis.induced, t.analysis.induced * 2, 1e-9);
near(transformer.compute({ ...tc, copperOz: 2 }, {}).analysis.R1, t.analysis.R1 / 2, 1e-9);
const refined = transformer.compute(tc, {}, { segmentCap: 3600 });
near(refined.analysis.L1, t.analysis.L1, 0.02); near(refined.analysis.M, t.analysis.M, 0.02);
assert.ok(transformer.compute({ ...tc, shape: 'polygon' }, {}).analysis.L1 > 0);
for (const cfg of [{ primaryTurns: 60, dOuter: 5 }, { primaryTurns: 1.5 }, { secondaryTurns: Infinity }, { traceW: 0 }, { tempC: NaN }]) assert.throws(() => transformer.compute({ ...tc, ...cfg }, {}));
assert.equal(transformer.compute(tc, {}, { quick: true }).analysis, undefined);
assert.deepEqual([...new Set(t.art.tracks.map(p => p.net))], ['T1_PRI', 'T1_SEC']);
for (const [ws, c, r] of [[antenna, ac, a], [transformer, tc, t]]) {
  const payload = toKicad(r.art, { dx: 5, dy: 7 });
  assert.equal(payload.vias.length, 0, 'No accidental through vias');
  assert.equal(payload.pads.length, r.art.pads.length);
  for (let i = 0; i < payload.pads.length; i++) {
    assert.equal(payload.pads[i].layer, r.art.pads[i].layer);
    assert.equal(payload.pads[i].y, -r.art.pads[i].y + 7);
  }
  const pcb = exportKicadPcb(r.art), mod = exportKicadMod(r.art);
  assert.ok(pcb.includes(' smd ')); assert.ok(!pcb.includes('(via '));
  assert.ok(!mod.includes('thru_hole'));
  for (const exporter of [exportKicadPcb, exportKicadMod, exportSvg, exportDxf]) {
    const text = exporter(r.art);
    assert.ok(!/NaN|Infinity|undefined/.test(text)); assert.ok(text.length > 100);
  }
  const roundtrip = ws.compute(JSON.parse(JSON.stringify(c)), {});
  near(boundsCopper(roundtrip.art).w, boundsCopper(r.art).w, 1e-10);
  assert.ok(ws.tiles(c, r).length && ws.spec(c, r).length && ws.notes(c, r).length);
}
assert.ok(exportSvg(a.art).includes('<rect'));
assert.ok(exportKicadPcb(a.art).includes('smd rect'));
console.log('Creator numerics, validation, isolation, surface pads and export round-trips passed.');
