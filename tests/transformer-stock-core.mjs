import assert from 'node:assert/strict';
import {defaults,compute} from '../web/js/ws/transformer.js';
import {corePresetPatch,catalogFor,assemblyStatus} from '../web/js/engine/transformer-cores.js';
const cfg={...defaults(),...corePresetPatch('eelp22-stock-gap'),
  primaryTurns:2,secondaryTurns:2,stackPlan:'P,S,S,P',copperLayers:'F.Cu,In1.Cu,In4.Cu,B.Cu',
  layerPositions:'0,.1015,1.4815,1.583',dOuter:13.6,viaPad:.6,viaDrill:.3,coreClearance:.5,
  windingOptions:{P:{width:.6,connection:'series'},S:{width:.6,connection:'parallel'}},
  coreLossModel:'density',coreLossDensity:0};
const r=compute(cfg);
assert.deepEqual(r.windings.map(w=>w.turns),[4,2]);
assert.equal(r.assembly.modified,false);
assert.equal(r.assembly.fits,true);
assert.equal(r.core.AL,820e-9);
assert.ok(Math.abs(r.core.AL*16-13.12e-6)<1e-15);
assert.ok(r.assembly.parts[0].includes('2 × B66285G0050X187'));
assert.ok(r.core.loss===null,'Unknown core loss must remain unknown');
for (const patch of [{coreGap:0},{coreGap:.05},{coreGapTreatment:'ground-center-leg'},{corePostW:6.5}]) {
  assert.throws(()=>catalogFor({...cfg,...patch}),/Factory-gapped|dimensions/);
}
// Test final segment/terminal checks independently of the early radius screen.
for (const x of [0,-9.5,9.5]) {
  const art=structuredClone(r.art);
  art.tracks.push({layer:'F.Cu',width:.6,pts:[[x,-20],[x,20]]});
  assert.equal(assemblyStatus(cfg,art).fits,false,`Crossing at x=${x} must fail`);
}
const art=structuredClone(r.art);art.vias.push({x:2.6,y:8,diameter:.6});
assert.equal(assemblyStatus(cfg,art).fits,false,'Corner via crossing must fail');
assert.throws(()=>compute({...cfg,dOuter:20}),/intersects core opening/);
assert.throws(()=>compute({...cfg,dOuter:10}),/Core opening|central area|Transition/);
console.log('Factory-gapped catalog identity, AL, 4:2 connections and real slot-crossing rejection passed.');
