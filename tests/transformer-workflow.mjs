import assert from 'node:assert/strict';
import { defaults, compute } from '../web/js/ws/transformer.js';
import { DesignHistory, checkpoint, changedFields } from '../web/js/engine/design-history.js';
import { searchTransformer, compareTransformers, operatingEnvelope, transformerTolerance, modelSignature } from '../web/js/engine/transformer-workflow.js';
import { candidateSnapshot } from '../web/js/engine/transformer-studies.js';
import { importTransformerTest, compareTransformerTest, calibrateTransformer } from '../web/js/engine/transformer-measurements.js';
import { transformerPreflight, transformerDossier } from '../web/js/engine/transformer-handoff.js';
import { corePresetPatch } from '../web/js/engine/transformer-cores.js';
import { exportKicadPcb } from '../web/js/engine/exporters.js';
import { zipTextFiles } from '../web/js/engine/zip-text.js';
import { C } from '../web/js/engine/complex.js';
const base={...defaults(),...corePresetPatch('eelp32'),driveMode:'voltage',sourceVoltage:12,loadR:60,leakageModel:'geometry',sweepPoints:8};
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t*Math.max(Math.abs(b),1e-12),`${a} != ${b}`);
let count=0;function check(name,fn){fn();count++;console.log(`ok ${name}`);}
check('History branching, deep copies and bounded checkpoints',()=>{
  const h=new DesignHistory({x:[1]},2);h.record({x:[2]});const back=h.undo();back.x[0]=9;assert.deepEqual(h.redo(),{x:[2]});h.record({x:[3]});h.record({x:[4]});assert.equal(h.past.length,2);h.undo();h.record({x:[5]});assert.equal(h.redo(),null);
  const q=checkpoint({...base,candidates:[{}],checkpoints:[{}]},'Before');assert.equal(q.config.checkpoints,undefined);assert.equal(q.config.candidates,undefined);assert.deepEqual(changedFields(base,{primaryTurns:99,candidates:[]}),['primaryTurns']);
});
check('Locked search preserves the actual core, turns, widths, heights and connections',()=>{
  const c={...base,coreGap:0,windingOptions:{P:{width:.7,connection:'series'},S:{width:.6,connection:'parallel'}},layerPositions:'0,.2,1.4,1.6',searchLocks:{core:true,turns:true,widths:true,stack:true,connections:true,footprint:true}},r=compute(c),req={...c.requirements,outputVoltage:r.analysis.loaded.outputs[0].voltage};req.outputCurrent=req.outputVoltage/c.loadR;
  const out=searchTransformer(c,req,{},()=>{},false);assert.equal(out.tried,1);assert.equal(out.candidates.length,1);
  for(const key of ['corePreset','primaryTurns','secondaryTurns','dOuter','layerPositions','stackPlan','windingOptions'])assert.deepEqual(out.candidates[0].config[key],c[key]);
});
check('Search reports individual rejection reasons and fully recalculated near misses',()=>{
  const c={...base,searchLocks:{core:true,turns:true,widths:true,stack:true,connections:true,footprint:true}},out=searchTransformer(c,{...c.requirements,outputVoltage:500}, {},()=>{},false);
  assert.equal(out.candidates.length,0);assert.ok(out.rejected.voltage);assert.ok(out.nearMisses[0].issues.some(i=>i.key==='voltage'));
  const geometric=searchTransformer({...c,primaryTurns:60},c.requirements,{},()=>{},false);assert.ok(geometric.rejected.geometry);assert.ok(Object.keys(geometric.geometryReasons).length);
});
check('Comparison normalizes source and load without mutating snapshots',()=>{
  const a=candidateSnapshot(base,compute(base),'A'),bc={...base,sourceVoltage:6,loadR:30},b=candidateSnapshot(bc,compute(bc),'B'),before=JSON.stringify([a,b]);
  const own=compareTransformers(base,[a,b]);assert.equal(own.conditionsDiffer,true);
  const normalized=compareTransformers(base,[a,b],true);near(normalized.rows[0].metrics.voltage,normalized.rows[1].metrics.voltage);assert.deepEqual(normalized.rows[0].response,normalized.rows[1].response);assert.ok(normalized.rows.every(q=>q.badges.includes('Smallest')));assert.equal(JSON.stringify([a,b]),before);
});
check('Requirement suggestions are confirmed by a feasible expanded search',()=>{
  const out=searchTransformer(base,{...base.requirements,diameter:36});assert.equal(out.candidates.length,0);const suggestion=out.suggestions.find(q=>q.patch.diameter===45);assert.ok(suggestion);assert.ok(suggestion.candidate.metrics.width<=45&&suggestion.candidate.metrics.height<=45);
});
check('Operating envelope never converts unknown thermal behavior into passing points',()=>{
  const r=compute(base),c={...base,requirements:{...base.requirements,outputVoltage:r.analysis.loaded.outputs[0].voltage},operatingRange:{voltage:[12,12,12],frequency:[1e5,1e5,1e5],load:[60,60,60],ambient:[25,25,25],maxTemperature:100}};
  const unknown=operatingEnvelope(c);assert.equal(unknown.points.length,1);assert.equal(unknown.unknown,1);assert.equal(unknown.passed,0);
  const known=operatingEnvelope({...c,thermalResistance:10,coreLossModel:'density',coreLossDensity:10});assert.equal(known.passed,1);
  assert.throws(()=>operatingEnvelope({...c,operatingRange:{...c.operatingRange,voltage:[12,10,13]}}),/ordered/);
});
check('Tolerance samples are repeatable; zero tolerances reproduce the nominal solve',()=>{
  const c={...base,transformerTolerances:{samples:5,seed:123,copper:0,spacing:0,al:0}},a=transformerTolerance(c),r=compute(c);
  a.samples.forEach(q=>near(q.metrics.voltage,r.analysis.loaded.outputs[0].voltage));assert.deepEqual(a,transformerTolerance(c));
  const varied={...c,transformerTolerances:{...c.transformerTolerances,copper:10,spacing:5,al:10}};assert.deepEqual(transformerTolerance(varied),transformerTolerance(varied));assert.equal(a.passed,0);assert.equal(a.unknown,5);
});
const actual={...base,coreALMeasured:compute(base).core.AL*.8,leakageModel:'measured',measuredLeakage:2e-6};
const fixture={fixture:'Primary terminals; leads de-embedded',temperature:25};
const measured=kind=>{
  const rows=[80000,100000,120000].map(freq=>{const c={...actual,freq,sourceVoltage:1,sourceR:0,sourceX:0,loadMode:kind==='open'?'open':'short'},r=compute(c),z=C.div([1,0],r.analysis.loaded.currents[0]);return `${freq},${z[0]},${z[1]}`;});
  return importTransformerTest(`Frequency (Hz),R (ohm),X (ohm)\n${rows.join('\n')}`,`${kind}.csv`,kind,fixture,base);
};
check('Synthetic open and short measurements recover AL and leakage and reduce residuals',()=>{
  const tests=[measured('open'),measured('short')],fit=calibrateTransformer(base,tests);near(fit.patch.coreALMeasured,actual.coreALMeasured,.002);near(fit.patch.measuredLeakage,actual.measuredLeakage,.002);assert.ok(fit.fitted.every((q,i)=>q.rmse<fit.baseline[i].rmse));
  assert.throws(()=>calibrateTransformer({...base,primaryTurns:base.primaryTurns+1},tests),/unchanged/);
  assert.throws(()=>calibrateTransformer(base,[tests[0],{...tests[1],conditions:{...fixture,fixture:'Different leads'}}]),/fixture/);
  assert.ok(compareTransformerTest(actual,tests[0]).changed);
});
check('Loaded imports distinguish source-referenced gain from scattering S21',()=>{
  const text='Frequency (Hz),Gain_dB\n80000,-6\n120000,-6';const test=importTransformerTest(text,'loaded.csv','loaded',fixture,base);assert.equal(compareTransformerTest(base,test).unit,'dB');
  assert.throws(()=>importTransformerTest(text.replace('Gain_dB','S21db'),'loaded.csv','loaded',fixture,base),/Gain_dB/);
  assert.throws(()=>importTransformerTest(text,'loaded.s2p','loaded',fixture,base),/Gain_dB/);
});
check('Preflight checks the actual destination layers, nets, cutouts, origin and collision points',()=>{
  const r=compute(base),blank={...r.art,tracks:[],arcs:[],vias:[],pads:[]};let board=exportKicadPcb(blank);
  board=board.replace('(net 0 "")',`(net 0 "")\n${r.windings.map((w,i)=>`(net ${i+1} "${w.net}")`).join('\n')}`);
  const ready=transformerPreflight(base,r,board);assert.equal(ready.issues.length,0,JSON.stringify(ready.issues));assert.ok(ready.ready);
  const moved=transformerPreflight({...base,placementOrigin:[100,100]},r,board);assert.ok(moved.issues.some(q=>q.type==='cutout'&&q.point));assert.ok(moved.issues.some(q=>q.type==='edge'));
  const noNets=transformerPreflight(base,r,exportKicadPcb(blank));assert.ok(noNets.issues.some(q=>q.type==='net'));
});
check('Build dossier escapes names, contains matching files and a valid stored ZIP directory',()=>{
  const d=transformerDossier(base,compute(base),'T<unsafe>'),zip=zipTextFiles(d.files),v=new DataView(zip.buffer);
  assert.ok(d.html.includes('T&lt;unsafe&gt;'));assert.ok(d.html.includes('Measured')||d.html.includes('Manufacturer-derived'));assert.ok(d.html.includes('Terminal table'));assert.equal(v.getUint32(0,true),0x04034b50);assert.equal(v.getUint32(zip.length-22,true),0x06054b50);assert.equal(v.getUint16(zip.length-14,true),6);
  assert.equal(JSON.parse(d.files['T<unsafe>.json']).config.sourceVoltage,base.sourceVoltage);
  assert.equal(modelSignature({...base,candidates:[{}]}),modelSignature(base));
});
console.log(`${count} transformer workflow checks passed.`);
