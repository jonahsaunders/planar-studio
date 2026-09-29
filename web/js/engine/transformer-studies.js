import { buildTransformer, finishLosses, transformerExtras } from './transformer.js';
import { loadedTransformer } from './transformer-load.js';
import { loadedBranches } from './transformer-network.js';
import { acResistance } from './transformer-physics.js';
import { transformerMode } from './transformer-config.js';
import { C } from './complex.js';
import { range } from './creator-validation.js';

const logspace=(a,b,n)=>Array.from({length:n},(_,i)=>a*(b/a)**(i/(n-1)));
function boardSize(result) {
  const points=result.art.outline?.flatMap(q=>q.layer==='Edge.Cuts'?q.pts:[])||[];
  if(!points.length)return {width:result.bounds.w,height:result.bounds.h};
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  return {width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
}
// Reuse the geometry and inductance solve. Sweeps only solve the small circuit.
export function evaluateOperatingPoint(input, result, frequency = input.freq) {
  const c={...transformerExtras(),...input,freq:frequency,driveMode:'voltage'}, a=result.analysis;
  const network=result.network ? {...result.network,resistanceMatrix:acResistance(c,result.network.branches,result.network.sheet,frequency).matrix} : null;
  const loaded=network ? loadedBranches(c,network) : loadedTransformer(c,a.matrix||[[a.L1,a.M],[a.M,a.L2]],a.resistances||[a.R1,a.R2]);
  const r={...result,network,analysis:{...a,loaded},core:result.core?{...result.core}:null};
  if(r.core){const flux=loaded.branchCurrents.reduce((sum,I,i)=>C.add(sum,C.scale(I,r.core.AL*network.branches[i].turns)),[0,0]);r.core.Bpeak=Math.SQRT2*C.abs(flux)/(c.coreAe*1e-6);r.core.fluxUtilization=r.core.Bpeak/c.coreFluxLimit;}
  finishLosses(c,r);
  return r;
}

export function transformerSweep(input, result) {
  const c={...transformerExtras(),...input};
  range(c,'sweepMin',1,1e8);range(c,'sweepMax',1,1e8);range(c,'sweepPoints',8,121,true);
  range(c,'loadSweepMin',1e-6,1e9);range(c,'loadSweepMax',1e-6,1e9);
  if(c.sweepMax<=c.sweepMin||c.loadSweepMax<=c.loadSweepMin)throw new Error('Sweep maximum must exceed minimum.');
  const frequencies=logspace(c.sweepMin,c.sweepMax,c.sweepPoints), loads=logspace(c.loadSweepMin,c.loadSweepMax,c.sweepPoints);
  const responses=frequencies.map(f=>evaluateOperatingPoint(c,result,f));
  const names=responses[0].analysis.loaded.outputs.map(q=>q.name);
  return { frequencies, loads, outputs:names.map((name,i)=>({name,
    gain:responses.map(r=>20*Math.log10(Math.max(1e-12,r.analysis.loaded.outputs[i].voltage/c.sourceVoltage))),
    phase:responses.map(r=>r.analysis.loaded.outputs[i].phaseDeg),
    voltage:loads.map(loadR=>evaluateOperatingPoint({...c,loadMode:'load',loadKind:'impedance',loadR,loadX:0},result).analysis.loaded.outputs[i].voltage)
  })), copper:responses.map(r=>r.analysis.losses?.copper ?? r.analysis.loaded.copperLoss),
    flux:responses.map(r=>r.core?.Bpeak ?? 0), fluxLimit:c.coreFluxLimit, circuitOnly:true };
}

export function candidateSnapshot(c,r,name) {
  const config=JSON.parse(JSON.stringify(c));delete config.candidates;
  const size=boardSize(r);
  return { name:String(name||'Candidate').slice(0,80), config,
    metrics:{ area:size.width*size.height, ...size,
      copper:r.analysis.losses?.copper ?? r.analysis.loss, leakage:r.analysis.leakage,
      capacitance:r.analysis.capacitance?.value ?? null, fluxMargin:r.core?1-r.core.fluxUtilization:null,
      voltage:r.analysis.loaded?.outputs[0]?.voltage ?? null, efficiency:r.analysis.estimatedEfficiency ?? null,
      model:r.model, lossModel:c.lossModel||'dc', frequency:c.freq, sourceVoltage:c.sourceVoltage }, schema:1 };
}

export function designFromRequirements(input, requirements, env={}, progress=()=>{}) {
  const c={...transformerExtras(),...input}, req={...requirements};
  for(const [key,lo,hi] of [['voltage',.01,1000],['outputVoltage',.01,1000],['outputCurrent',.0001,100],['frequency',100,1e7],['diameter',5,200],['layers',2,8],['voltageTolerance',.1,50]])range(req,key,lo,hi,key==='layers');
  if(req.layers%2)throw new Error('Available PCB layers must be an even number.');
  const available=Math.min(req.layers,env.board?.layerCount||req.layers);
  const mode=transformerMode(c), layouts=['P,S'];
  if(available>=4)layouts.push('P,P,S,S','P,S,P,S');
  if(available>=6)layouts.push('P,P,P,S,S,S','P,S,P,S,P,S');
  if(available>=8)layouts.push('P,P,P,P,S,S,S,S','P,S,P,S,P,S,P,S');
  // Search integer turns around the target ratio, and several footprints.
  // Every candidate is validated and scored with the actual loaded solver.
  const trials=[];
  for(const stackPlan of layouts)for(const primaryTurns of [1,2,3,4,6,8,10,12]) {
    const ns=primaryTurns*req.outputVoltage/req.voltage;
    for(const secondaryTurns of new Set([Math.max(1,Math.floor(ns)),Math.max(1,Math.ceil(ns))]))
      for(const scale of [.75,1])trials.push({stackPlan,primaryTurns,secondaryTurns,dOuter:(c.corePreset==='custom'?req.diameter-6:Math.min(c.dOuter,req.diameter-6))*scale});
  }
  const matches=[], rejected={geometry:0,flux:0,voltage:0,area:0};
  trials.forEach((trial,index)=>{
    const cfg={...c,...trial,family:'multilayer',magneticModel:mode.magnetic,windingTopology:'standard',routedWindings:true,
      copperLayers:'',layerPositions:'',windingOptions:{},freq:req.frequency,driveMode:'voltage',sourceVoltage:req.voltage,
      loadMode:'load',loadKind:'impedance',loadR:req.outputVoltage/req.outputCurrent,loadX:0,candidates:[]};
    try {
      const r=buildTransformer(cfg,env,{segmentCap:600});
      const size=boardSize(r);
      if(size.width>req.diameter||size.height>req.diameter){rejected.area++;return;}
      if(r.core?.fluxUtilization>1){rejected.flux++;return;}
      const error=Math.abs(r.analysis.loaded.outputs[0].voltage/req.outputVoltage-1);
      if(error>req.voltageTolerance/100){rejected.voltage++;return;}
      const candidate=candidateSnapshot(cfg,r,`${trial.stackPlan} · ${r.analysis.turns[0]}:${r.analysis.turns[1]}`);
      matches.push({...candidate,error,score:error+(candidate.metrics.copper/Math.max(r.analysis.loaded.outputPower,1e-9))*.1+candidate.metrics.area/req.diameter**2*.01});
    } catch {rejected.geometry++;}
    finally {progress({done:index+1,total:trials.length,message:`${matches.length} feasible candidates`});}
  });
  matches.sort((a,b)=>a.score-b.score);
  // Refine finalists at production resolution and recheck all acceptance bounds.
  const finalists=[];
  for(const q of matches.slice(0,12)){
    try {
      const r=buildTransformer(q.config,env), error=Math.abs(r.analysis.loaded.outputs[0].voltage/req.outputVoltage-1);
      const size=boardSize(r);
      if(size.width<=req.diameter&&size.height<=req.diameter&&error<=req.voltageTolerance/100&&(!r.core||r.core.fluxUtilization<=1))finalists.push({...candidateSnapshot(q.config,r,q.name),error});
    } catch { rejected.geometry++; }
    if(finalists.length===3)break;
  }
  return {candidates:finalists,rejected,tried:trials.length,requirements:req,
    message:finalists.length?'Feasible sinusoidal starting designs; compare before applying.':'No design met all constraints. Increase board size/layers, relax voltage tolerance, or change the core/source impedance.'};
}
