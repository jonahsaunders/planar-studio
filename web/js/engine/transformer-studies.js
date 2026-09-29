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
  const config=JSON.parse(JSON.stringify(c));delete config.candidates;delete config.checkpoints;
  const size=boardSize(r);
  return { name:String(name||'Candidate').slice(0,80), config,
    metrics:{ area:size.width*size.height, ...size,
      copper:r.analysis.losses?.copper ?? r.analysis.loss, leakage:r.analysis.leakage,
      capacitance:r.analysis.capacitance?.value ?? null, fluxMargin:r.core?1-r.core.fluxUtilization:null,
      voltage:r.analysis.loaded?.outputs[0]?.voltage ?? null, efficiency:r.analysis.estimatedEfficiency ?? null,
      layers:r.layers.length, core:c.corePreset||'custom', turns:r.analysis.turns||[c.primaryTurns,c.secondaryTurns], model:r.model, lossModel:c.lossModel||'dc', frequency:c.freq, sourceVoltage:c.sourceVoltage }, schema:1 };
}

export { searchTransformer as designFromRequirements } from './transformer-workflow.js';
