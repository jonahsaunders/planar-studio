import assert from 'node:assert/strict';
import { defaults, compute, charts, spec, reconcile } from '../web/js/ws/transformer.js';
import { transformerMode } from '../web/js/engine/transformer-config.js';
import { loadedBranches, effectiveInductance } from '../web/js/engine/transformer-network.js';
import { loadedTransformer, loadImpedance } from '../web/js/engine/transformer-load.js';
import { coreLossAt, acResistance } from '../web/js/engine/transformer-physics.js';
import { CORE_CATALOG, corePresetPatch, checkCoreCutouts } from '../web/js/engine/transformer-cores.js';
import { candidateSnapshot, transformerSweep, designFromRequirements } from '../web/js/engine/transformer-studies.js';
import { resolveStack } from '../web/js/engine/winding-stack.js';
import { exportKicadPcb } from '../web/js/engine/exporters.js';
import { parseBoard } from '../web/js/engine/boardcheck.js';
import { dowellFr, RHO_CU20, OZ_MM } from '../web/js/engine/coil.js';
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<=t*Math.max(1e-10,Math.abs(b)),`${a} != ${b}`);
let count=0;const check=(name,fn)=>{fn();console.log(`ok ${name}`);count++;};
const base={...defaults(),family:'ferrite',dOuter:40,stackPlan:'P,P,S,S',driveMode:'voltage',leakageModel:'geometry'};

check('Legacy family migration and independent magnetic/topology choices',()=>{
  assert.deepEqual(transformerMode({...defaults(),family:'center-tapped'}),{magnetic:'air',topology:'tapped',surface:false});
  const r=compute({...base,magneticModel:'ferrite',windingTopology:'multiple-tapped',stackPlan:'P,S,S,S2'});
  assert.ok(r.core);assert.equal(r.analysis.tapTurns,3);assert.equal(r.analysis.loaded.outputs.length,2);
  assert.ok(r.art.ports.some(p=>p.name==='S_CT'));
  assert.throws(()=>compute({...base,windingTopology:'tapped',windingOptions:{S:{connection:'parallel'}}}),/series/);
});
check('Geometry leakage responds to interleaving and spacing; supplied mode remains stable',()=>{
  const a=compute(base),b=compute({...base,stackPlan:'P,S,P,S'}),wide=compute({...base,layerPositions:'0,0.05,1.55,1.6'});
  assert.ok(b.analysis.leakage<a.analysis.leakage);assert.ok(wide.analysis.leakage>a.analysis.leakage);
  near(compute({...base,leakageModel:'supplied'}).analysis.k,.98);
  near(compute({...base,leakageModel:'supplied',stackPlan:'P,S,P,S'}).analysis.k,.98);
});
check('Measured leakage is calibrated to the short-circuit port definition',()=>{
  near(compute({...base,leakageModel:'measured',measuredLeakage:2e-6}).analysis.leakage,2e-6);
  assert.throws(()=>compute({...base,leakageModel:'measured',measuredLeakage:-1}),/measuredLeakage/);
});
check('Parallel branches preserve equal voltage and conserve real power',()=>{
  const c={...base,windingOptions:{S:{connection:'parallel',width:.8}},lossModel:'ac'},r=compute(c),l=r.analysis.loaded;
  assert.equal(r.windings[1].turns,3);assert.equal(r.analysis.ratio,4);assert.equal(l.branchCurrents.length,3);
  const secondary=l.branchCurrents.slice(1).reduce((s,I)=>s.map((v,i)=>v+I[i]),[0,0]);
  secondary.forEach((v,i)=>near(v,l.currents[1][i]));assert.ok(Math.abs(l.powerBalanceError)<1e-10);
  assert.ok(r.art.tracks.filter(t=>t.winding==='S').every(t=>t.width===.8));
  const sec=r.art.tracks.filter(t=>t.winding==='S');assert.equal(sec[0].startNode,sec[1].startNode);assert.equal(sec[0].endNode,sec[1].endNode);
});
check('Independent parallel RL branches match an analytic admittance sum',()=>{
  const L=[[2e-6,0],[0,4e-6]],R=[[1,0],[0,2]],f=1000;
  const r=loadedBranches({...base,freq:f,sourceVoltage:1,sourceR:0}, {matrix:L,resistanceMatrix:R,ports:[0,0],names:['P']});
  const x=2*Math.PI*f*2e-6;
  near(r.currents[0][0],1.5/(1+x*x));near(r.currents[0][1],-1.5*x/(1+x*x));near(effectiveInductance(L,[0,0],1)[0][0],4e-6/3);
});
check('Branch solver reduces to the original two-port circuit including reactive loads',()=>{
  const L=[[200e-6,60e-6],[60e-6,50e-6]],R=[.8,.3],c={...base,sourceVoltage:2,sourceR:3,sourceX:4,loadR:17,loadX:-8};
  const a=loadedTransformer(c,L,R),b=loadedBranches(c,{matrix:L,resistanceMatrix:[[R[0],0],[0,R[1]]],ports:[0,1],names:['P','S']});
  a.currents.forEach((I,i)=>I.forEach((v,j)=>near(v,b.currents[i][j])));near(a.outputPower,b.outputPower);
});
check('AC loss tends to DC at low frequency and remains passive at high frequency',()=>{
  const r=compute(base),low=acResistance({...base,lossModel:'ac'},r.network.branches,r.network.sheet,1).matrix;
  low.forEach((row,i)=>near(row[i],r.network.branches[i].resistance,1e-6));
  const high=compute({...base,lossModel:'ac',freq:1e6});assert.ok(high.analysis.losses.acExcess>0);assert.ok(Math.abs(high.analysis.loaded.powerBalanceError)<1e-9);
});
check('Sheet AC resistance reproduces the independent Dowell stack formula',()=>{
  const c={...base,tempC:20,lossModel:'ac',copperOz:2},width=.8,length=.1,t=c.copperOz*OZ_MM*1e-3;
  for(const count of [1,2,4])for(const f of [1e4,1e6,1e7]){
    const dc=RHO_CU20*length/(width*1e-3*t),branch={resistance:count*dc};
    const fields=Array.from({length:count},(_,i)=>({branch:0,width,length,turns:1,average:[i+.5]}));
    const matrix=acResistance(c,[branch],{fields},f).matrix;
    near(matrix[0][0]/branch.resistance,dowellFr(f,t,width,width+c.traceS,count,RHO_CU20));
  }
});
check('Interleaving increases estimated adjacent interwinding capacitance; measured override is explicit',()=>{
  const a=compute(base),b=compute({...base,stackPlan:'P,S,P,S'});
  assert.ok(b.analysis.capacitance.value>a.analysis.capacitance.value);
  const m=compute({...base,capacitanceModel:'measured',measuredCapacitance:12e-12});near(m.analysis.capacitance.value,12e-12);assert.equal(m.analysis.capacitance.source,'measured');
});
check('RLC loads recalculate reactance and zero components remain finite',()=>{
  const c={...base,loadKind:'rlc',loadL:10e-6,loadC:1e-9};
  near(loadImpedance(c,'load',1e6).z[1],2*Math.PI*1e6*10e-6-1/(2*Math.PI*1e6*1e-9));
  near(loadImpedance({...c,loadL:0,loadC:0},'load').z[1],0);
  assert.throws(()=>loadImpedance({...c,loadC:-1},'load'),/nonnegative/);
});
check('Loss fits reject temperature/frequency/flux extrapolation and unknown loss stays unknown',()=>{
  const c={...base,coreMaterial:'N87',coreLossModel:'n87-fit'};
  assert.ok(coreLossAt(c,.1,1e-6).watts>0);assert.equal(coreLossAt({...c,coreTemperature:25},.1,1e-6).watts,null);
  assert.equal(coreLossAt(c,.4,1e-6).watts,null);assert.equal(coreLossAt({...c,freq:1e6},.1,1e-6).watts,null);
  near(coreLossAt({...base,coreLossModel:'steinmetz',steinmetzK:2,steinmetzAlpha:1,steinmetzBeta:2},.1,1e-6).watts,.002);
  const r=compute({...base,thermalResistance:10});assert.equal(r.analysis.losses.temperature,null);
  const known=compute({...base,coreLossDensity:100,thermalResistance:10});near(known.analysis.losses.temperature,25+10*known.analysis.losses.total);
});
for(const id of Object.keys(CORE_CATALOG))check(`${id}: mechanical fit, complete core openings and destination verification`,()=>{
  const c={...defaults(),...corePresetPatch(id)},r=compute(c);assert.ok(r.assembly.fits);assert.equal(r.art.outline.length,4);
  reconcile(c,'magneticModel','ferrite');assert.equal(c.dOuter,22);
  near(r.core.AL,CORE_CATALOG[id].al);
  const board=parseBoard(exportKicadPcb(r.art));assert.equal(board.loops.length,4);
  // The UI replaces display bounds with copper-only bounds. Comparison sizes
  // must still include outer-leg slots and the board margin.
  const snapshot=candidateSnapshot(c,{...r,bounds:{w:22,h:39}},'Catalog');
  assert.ok(snapshot.metrics.width>CORE_CATALOG[id].width);near(snapshot.metrics.height,r.bounds.h);
  assert.ok(checkCoreCutouts(r.assembly.openings,board).complete);
  assert.equal(checkCoreCutouts(r.assembly.openings,{loops:board.loops.slice(0,1)}).complete,false);
  assert.equal(checkCoreCutouts(r.assembly.openings,board,[10,0]).complete,false);
  assert.throws(()=>compute({...c,corePostW:20}),/Custom core/);
  assert.throws(()=>compute({...c,boardT:10}),/window height/);
});
check('Physical copper heights override uniform spacing without overwriting user heights',()=>{
  const board={layerCount:4,copperLayers:['F.Cu','In1.Cu','In2.Cu','B.Cu'].map((name,i)=>({name,centerHeightMm:[.02,.15,1.42,1.58][i]}))};
  const r=resolveStack(base,board,4);near(r.z[1],.13);assert.equal(r.assumedZ,false);
  near(resolveStack({...base,layerPositions:'0,.3,1.2,1.6'},board,4).z[1],.3);
});
check('Sweeps reuse geometry, expose every output and reject inverted ranges',()=>{
  const c={...base,windingTopology:'multiple',stackPlan:'P,S,S2',sweepPoints:12},r=compute(c),before=JSON.stringify(r.art),s=transformerSweep(c,r);
  assert.equal(s.outputs.length,2);assert.equal(s.frequencies.length,12);assert.equal(JSON.stringify(r.art),before);
  assert.ok(s.outputs.every(q=>q.gain.every(Number.isFinite)));assert.ok(charts(c,r).length>=4);
  assert.throws(()=>transformerSweep({...c,sweepMax:10},r),/maximum/);
});
check('Candidate snapshots are independent and requirements search enforces all constraints',()=>{
  const r=compute(base),snap=candidateSnapshot(base,r,'Test');snap.config.primaryTurns=99;assert.equal(base.primaryTurns,6);
  assert.equal(snap.config.candidates,undefined);assert.ok(!/NaN|undefined/.test(JSON.stringify(spec(base,r))));
  const req={...defaults().requirements},s=designFromRequirements(base,req);assert.equal(s.candidates.length,3);
  s.candidates.forEach(q=>{assert.ok(q.metrics.width<=req.diameter&&q.metrics.height<=req.diameter);assert.ok(q.error<=req.voltageTolerance/100);assert.ok(q.metrics.fluxMargin>=0);});
  assert.equal(designFromRequirements(base,{...req,diameter:5}).candidates.length,0);
  assert.throws(()=>designFromRequirements(base,{...req,layers:3}),/even/);
});
console.log(`${count} transformer design checks passed.`);
