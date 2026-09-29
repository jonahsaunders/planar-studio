import assert from 'node:assert/strict';
import { defaults, compute, reconcile, handles } from '../web/js/ws/transformer.js';
import { corePresetPatch } from '../web/js/engine/transformer-cores.js';
import { clone, nominalPatch, saveScenario, saveStudy, studyStatus, physicsSignature, designSnapshot } from '../web/js/engine/transformer-project.js';
import { assessConditions, searchTransformer, transformerRepairs } from '../web/js/engine/transformer-workflow.js';
import { importTransformerTest, comparePrototypes, calibrateTransformer } from '../web/js/engine/transformer-measurements.js';
import { placementArtwork, transformerPreflight } from '../web/js/engine/transformer-handoff.js';
import { exportKicadPcb } from '../web/js/engine/exporters.js';
import { C } from '../web/js/engine/complex.js';
import { evaluateOperatingPoint } from '../web/js/engine/transformer-studies.js';

const base={...defaults(),...corePresetPatch('eelp32'),sweepPoints:8};
let passed=0;const check=(name,fn)=>{fn();passed++;console.log(`ok ${name}`);};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
check('Nominal linking, explicit experimental overrides and legacy behavior',()=>{
  const c=defaults();assert.equal(c.operatingLinked,true);c.requirements.frequency=180000;c.requirements.voltage=10;reconcile(c,'requirements',c.requirements);assert.equal(c.freq,180000);assert.equal(c.sourceVoltage,10);assert.equal(c.loadR,60);
  c.sourceVoltage=9;reconcile(c,'sourceVoltage',9);assert.equal(c.operatingLinked,false);c.requirements.voltage=13;reconcile(c,'requirements',c.requirements);assert.equal(c.sourceVoltage,9);
  c.operatingLinked=true;reconcile(c,'operatingLinked',true);assert.equal(c.sourceVoltage,13);
  const old={...defaults(),operatingLinked:false,freq:23456};reconcile(old,'requirements',old.requirements);assert.equal(old.freq,23456);
});
check('Study validity follows relevant dependencies, not net names or record history',()=>{
  const c=clone(base),result={points:[{pass:true,issues:[],unknown:[]}]},board={layerCount:4,nets:['A'],name:'Old name'};
  const envelope=saveStudy(c,'envelope',result,board),tolerance=saveStudy(c,'tolerance',result,board);
  assert.equal(studyStatus(envelope,c,{...board,nets:['B'],name:'Renamed'}),'Pass');
  c.windingNets={P:'INPUT',S:'OUTPUT'};c.placementRotation=90;c.studies=[envelope];assert.equal(studyStatus(envelope,c,board),'Pass');
  c.operatingRange.voltage=[8,12,16];assert.equal(studyStatus(envelope,c,board),'Outdated');assert.equal(studyStatus(tolerance,c,board),'Pass');
  c.primaryTurns++;assert.equal(studyStatus(tolerance,c,board),'Outdated');
  assert.equal(studyStatus(saveStudy(c,'envelope',{points:[{pass:false,issues:[],unknown:['Missing thermal data']}]},board),c,board),'Unknown');
  assert.equal(studyStatus(saveStudy(c,'envelope',{points:[{pass:false,issues:[{key:'flux'}],unknown:[]}]},board),c,board),'Fail');
  assert.equal(designSnapshot(c).studies,undefined);
});
check('Named cases retain independent load combinations and both outputs are checked',()=>{
  const c={...clone(base),dOuter:20,windingTopology:'multiple',stackPlan:'P,P,S,S2',secondary2Turns:2,load2Mode:'load',load2R:60,requirements:{...base.requirements,outputs:{S2:{enabled:true,voltage:4,current:4/60,tolerance:10}}}},r=compute(c);
  c.requirements.outputVoltage=r.analysis.loaded.outputs[0].voltage;c.requirements.outputCurrent=c.requirements.outputVoltage/60;c.requirements.outputs.S2.voltage=r.analysis.loaded.outputs[1].voltage;c.requirements.outputs.S2.current=c.requirements.outputs.S2.voltage/60;
  const s=saveScenario({...c,load2R:30},'Heavy second output');c.scenarios=[s];s.point.load2R=25;assert.equal(c.load2R,60);
  const checked=assessConditions(c,r);assert.equal(checked.points.length,2);assert.equal(checked.points[1].outputs.length,2);
  c.scenarios=[saveScenario({...c,sourceVoltage:1},'Nominal')];assert.ok(assessConditions(c,r).points[1].issues.filter(q=>q.key==='voltage').length===2,'A user scenario named Nominal must still solve its own conditions');
  c.searchLocks={core:true,turns:true,widths:true,stack:true,connections:true,footprint:true};assert.equal(searchTransformer(c,c.requirements,{},()=>{},false).candidates.length,0);
  c.scenarios=[];const out=searchTransformer(c,c.requirements,{},()=>{},false);assert.equal(out.candidates.length,1);assert.equal(out.candidates[0].config.stackPlan,c.stackPlan);assert.equal(out.candidates[0].config.secondary2Turns,2);
});
check('Candidate frontier retains more than three fully checked designs',()=>{
  const found=searchTransformer(base,base.requirements,{},()=>{},false);assert.equal(found.candidates.length,3);assert.ok(found.frontier.length>3&&found.frontier.length<=24);
  for(const q of found.frontier){const checked=assessConditions(q.config,compute(q.config));assert.equal(checked.points.some(p=>p.issues.length),false);near(checked.worstMargin,q.robust.worstMargin);}
});
check('Reused geometry agrees with a fresh solve when scenario copper temperature changes',()=>{
  for(const c of [base,defaults()]){const hot={...c,tempC:95,sourceVoltage:9,loadR:30},reused=evaluateOperatingPoint(hot,compute(c)),fresh=compute(hot);near(reused.analysis.loaded.outputs[0].voltage,fresh.analysis.loaded.outputs[0].voltage);near(reused.analysis.loaded.copperLoss,fresh.analysis.loaded.copperLoss);near(reused.analysis.loss,fresh.analysis.loss);}
});
check('Repairs improve checked violations and preserve unknown evidence',()=>{
  const r=transformerRepairs(base);assert.ok(r.repairs.length);for(const q of r.repairs){assert.ok(q.improvement>0);const checked=assessConditions({...base,...q.patch},compute({...base,...q.patch}));assert.deepEqual(checked,q.after);}
  assert.equal(transformerRepairs({...base,coreALMeasured:1e-6}).repairs.length,0);
});
check('Terminal edits snap, alter exported paths and model lengths, and reject core crossings',()=>{
  const r=compute(base),c={...base,terminalOffsets:{'P:0':.5}},moved=compute(c),a=r.windings[0].nodes[0],b=moved.windings[0].nodes[0];near(Math.hypot(b.x-a.x,b.y-a.y),.5);assert.notEqual(r.windings[0].sections[0].length,moved.windings[0].sections[0].length);
  const port=moved.art.ports.find(p=>p.nodeId==='P:0');near(port.x,b.x);near(port.y,b.y);
  assert.throws(()=>compute({...base,terminalOffsets:{'P:0':4}}),/0 and 3/);
  let patch;const h=handles(base,r,{tryGeometryPatch:p=>{patch=p;}}).find(h=>h.id==='P:0');h.drag(h.x,h.y+.73);assert.equal(patch.terminalOffsets['P:0'],.5);
  const one={...base,stackPlan:'P,S',primaryTurns:4,secondaryTurns:3};const inner=compute(one).windings[0].nodes[1];assert.throws(()=>compute({...one,terminalOffsets:{[inner.id]:3}}),/Core opening|via|clearance|core opening/i);
});
check('Net mapping keeps windings isolated and rotation matches checked terminal coordinates',()=>{
  const c={...base,windingNets:{P:'INPUT',S:'OUTPUT'},placementRotation:90,placementOrigin:[0,0]},r=compute(c),art=placementArtwork(c,r.art),board=exportKicadPcb(art,{tolerance:.004}),review=transformerPreflight(c,r,board);
  assert.deepEqual(review.requiredNets,['INPUT','OUTPUT']);near(review.terminals[0].x,art.ports[0].x);near(review.terminals[0].y,-art.ports[0].y);assert.ok(review.cutouts.complete);
  assert.throws(()=>compute({...c,windingNets:{P:'INPUT',S:'INPUT'}}),/separate nets/);
  assert.throws(()=>compute({...defaults(),windingNets:{P:'T1_SEC'}}),/separate nets/);
});
check('Prototype records append with revisions; matched pairs and overlaps are enforced',()=>{
  const text='Frequency (Hz),Gain_dB\n80000,-6\n120000,-5',a=importTransformerTest(text,'a.csv','loaded',{fixture:'Terminals',temperature:25,prototype:'A'},base),b=importTransformerTest(text,'b.csv','loaded',{fixture:'Terminals',temperature:25,prototype:'B'},base);
  assert.notEqual(a.id,b.id);assert.ok(a.revision);assert.equal(a.configuration.transformerTests,undefined);assert.equal(comparePrototypes([a,b]).series.length,2);
  const disjoint=clone(b);disjoint.data.rows.forEach(q=>q.f+=1e6);assert.throws(()=>comparePrototypes([a,disjoint]),/overlapping/);
  const tests=['open','short'].map(kind=>{const rows=[80000,120000].map(freq=>{const cfg={...base,freq,sourceVoltage:1,sourceR:0,sourceX:0,loadMode:kind},r=compute(cfg),z=C.div([1,0],r.analysis.loaded.currents[0]);return `${freq},${z[0]},${z[1]}`;});return importTransformerTest(`Frequency (Hz),R (ohm),X (ohm)\n${rows.join('\n')}`,`${kind}.csv`,kind,{fixture:'Terminals',temperature:25,prototype:'A'},base);});
  assert.ok(calibrateTransformer(base,tests).patch.coreALMeasured>0);assert.throws(()=>calibrateTransformer(base,[tests[0],{...tests[1],prototype:'B'}]),/same physical prototype/);
  assert.equal(physicsSignature({...base,windingNets:{P:'NEW'}},true),physicsSignature(base,true));
});
console.log(`${passed} transformer project checks passed.`);
