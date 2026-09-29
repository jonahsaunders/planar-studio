import { buildTransformer, transformerExtras } from './transformer.js';
import { candidateSnapshot, evaluateOperatingPoint, transformerSweep } from './transformer-studies.js';
import { transformerMode, windingSettings } from './transformer-config.js';
import { CORE_CATALOG, corePresetPatch } from './transformer-cores.js';
import { range } from './creator-validation.js';
import { projectKeys, fingerprint, outputRequirements, nominalPatch } from './transformer-project.js';

const copy = x => JSON.parse(JSON.stringify(x));
export function modelSignature(c) {
  const result = { ...c };
  for (const key of projectKeys) delete result[key];
  return fingerprint(result);
}

export function assessTransformer(c, result, req = c.requirements, maxTemperature = null, maxRegulation = null) {
  const m = candidateSnapshot(c,result).metrics, issues = [];
  const add = (key, actual, limit, excess, message) => issues.push({ key, actual, limit, excess, message });
  const unknown=[];
  if(req)for(const target of outputRequirements({...c,requirements:req})) {
    const voltage=result.analysis.loaded?.outputs.find(q=>q.name===target.name)?.voltage;
    if(voltage==null){unknown.push(`${target.name} output requires a loaded voltage solve.`);continue;}
    const error=Math.abs(voltage/target.voltage-1),allowed=target.tolerance/100;
    if(error>allowed){add('voltage',voltage,target.voltage,error/allowed-1,`${target.name} output voltage misses its tolerance.`);issues.at(-1).winding=target.name;}
  }
  if (req && Math.max(m.width,m.height) > req.diameter) add('area',Math.max(m.width,m.height),req.diameter,Math.max(m.width,m.height)/req.diameter-1,'Board footprint is too large.');
  const requiredLayers=Math.max(Math.ceil(result.layers.length/2)*2,...result.layers.filter(n=>n.startsWith('In')).map(n=>Number(n.match(/\d+/)[0])+2));
  if (req && requiredLayers > req.layers) add('layers',requiredLayers,req.layers,requiredLayers/req.layers-1,'More copper layers are required.');
  if (m.fluxMargin != null && m.fluxMargin < 0) add('flux',result.core.Bpeak,c.coreFluxLimit,-m.fluxMargin,'Peak flux exceeds the design limit.');
  const temperature = result.analysis.losses?.temperature ?? null;
  if (maxTemperature != null && temperature != null && temperature > maxTemperature) add('temperature',temperature,maxTemperature,(temperature-maxTemperature)/100,'Estimated assembly temperature exceeds its limit.');
  if(maxTemperature!=null&&temperature==null)unknown.push('Temperature requires known losses and assembly thermal resistance.');
  if(maxRegulation!=null)for(const q of result.analysis.loaded?.outputs||[]) {
    if(q.regulation==null)unknown.push(`${q.name} regulation is undefined for this termination.`);
    else if(Math.abs(q.regulation)*100>maxRegulation)add('regulation',Math.abs(q.regulation)*100,maxRegulation,Math.abs(q.regulation)*100/Math.max(maxRegulation,.001)-1,`${q.name} no-load to loaded regulation exceeds its limit.`);
  }
  return { metrics:m, issues, unknown, temperature, pass:issues.length===0 && unknown.length===0,
    limiting:issues.length ? [...issues].sort((a,b)=>b.excess-a.excess)[0].message : unknown[0] || 'Selected requirements met at this operating point.' };
}

function validateRequirements(req) {
  for(const [key,lo,hi] of [['voltage',.01,1000],['outputVoltage',.01,1000],['outputCurrent',.0001,100],['frequency',100,1e7],['diameter',5,200],['layers',2,8],['voltageTolerance',.1,50]]) range(req,key,lo,hi,key==='layers');
  if(req.layers%2)throw new Error('Available PCB layers must be an even number.');
  if(req.outputs?.S3?.enabled&&!req.outputs?.S2?.enabled)throw new Error('Enable the S2 requirement before adding S3.');
  for(const q of outputRequirements({requirements:req}).slice(1))for(const [key,lo,hi] of [['voltage',.01,1000],['current',.0001,100],['tolerance',.1,50]])range(q,key,lo,hi);
}

export function assessConditions(c,base,env={},includeLimits=true) {
  const scenarios=(c.scenarios||[]).filter(q=>q.enabled);
  if(scenarios.length>8)throw new Error('Select at most eight operating conditions.');
  const points=[{name:c.operatingLinked?'Nominal':'Current override',point:{}},...scenarios].map((q,index)=>{
    const cfg={...c,...q.point,driveMode:'voltage'};
    try {const r=index===0&&c.driveMode==='voltage'?base:evaluateOperatingPoint(cfg,base,cfg.freq);
      return {name:q.name,point:q.point,...assessTransformer(cfg,r,c.requirements,includeLimits?c.operatingRange.maxTemperature:null,includeLimits?c.operatingRange.maxRegulation:null),outputs:r.analysis.loaded?.outputs.map(o=>({name:o.name,voltage:o.voltage,power:o.power}))};
    }catch(error){return {name:q.name,point:q.point,pass:false,issues:[{key:'solve',message:error.message,excess:100}],unknown:[]};}
  });
  const margins=points.flatMap(q=>q.outputs?outputRequirements(c).map(t=>{const v=q.outputs.find(o=>o.name===t.name)?.voltage;return v==null?-1:1-Math.abs(v/t.voltage-1)/(t.tolerance/100);}):[-1]);
  const worstMargin=Math.min(...margins,...points.map(q=>q.metrics?.fluxMargin??1));
  return {points,passed:points.filter(q=>q.pass).length,unknown:points.filter(q=>q.unknown.length).length,worstMargin,worstCopper:Math.max(...points.map(q=>q.metrics?.copper??0)),scope:'Nominal plus selected named conditions. Every enabled output is checked; these discrete cases are not continuous worst-case proof.'};
}

export function searchTransformer(input, requirements, env = {}, progress = () => {}, followups = true) {
  const c={...transformerExtras(),...input},req={...requirements};validateRequirements(req);
  const locks={...transformerExtras().searchLocks,...c.searchLocks},mode=transformerMode(c);
  if(c.leakageModel==='measured'&&Object.values(locks).some(v=>!v))throw new Error('Measured leakage describes one geometry. Lock all geometry choices, or select geometry-based leakage before searching variations.');
  const targets=outputRequirements({...c,requirements:req}),names=targets.map(q=>q.name);
  const available=Math.min(req.layers,env.board?.layerCount||req.layers),layouts=[];
  if(locks.stack)layouts.push(c.stackPlan);
  else for(let layers=2;layers<=available;layers+=2){if(layers<names.length+1)continue;const half=Math.min(4,Math.floor(layers/2)),second=Array.from({length:layers-half},(_,i)=>names[i%names.length]);layouts.push([...Array(half).fill('P'),...second].join(','));if(layers>2)layouts.push(Array.from({length:layers},(_,i)=>i%2?second.shift():'P').filter(Boolean).join(','));}
  if(locks.stack&&names.some(name=>!c.stackPlan.split(',').map(n=>n.trim()).includes(name)))throw new Error('The locked stack lacks a required output. Add its winding or unlock layers.');
  const cores=locks.core?[c.corePreset]:[...new Set([c.corePreset,...Object.keys(CORE_CATALOG)])];
  const trials=[],seen=new Set();
  for(const core of cores){
    const preset=core && core!=='custom' && core!==c.corePreset ? corePresetPatch(core) : {};
    const base={...c,...preset, requirements:req,family:'multilayer',magneticModel:core&&core!=='custom'?'ferrite':mode.magnetic,routedWindings:true,
      coreALMeasured:Object.values(locks).every(Boolean)?c.coreALMeasured:0,calibration:Object.values(locks).every(Boolean)?c.calibration:null,
      ...nominalPatch({...c,requirements:req}),windingTopology:names.length>1?'multiple':'standard',operatingLinked:true,candidates:[],checkpoints:[],terminalOffsets:Object.values(locks).every(Boolean)?c.terminalOffsets:{}};
    if(locks.footprint){base.shape=c.shape;base.dOuter=c.dOuter;}
    for(const stackPlan of layouts){
      const pcount=stackPlan.split(',').filter(x=>x.trim()==='P').length,scount=stackPlan.split(',').filter(x=>x.trim()==='S').length;
      const connections=locks.connections?[[windingSettings(c,'P').connection,windingSettings(c,'S').connection]]:[['series','series'],['series','parallel'],['parallel','series']];
      for(const [pc,sc] of connections)for(const primaryTurns of locks.turns?[c.primaryTurns]:[1,2,3,4,6,8,10,12]){
        const ideal=primaryTurns*(pc==='series'?pcount:1)/(sc==='series'?scount:1)*req.outputVoltage/req.voltage;
        const secondary=locks.turns?[c.secondaryTurns]:[...new Set([Math.max(1,Math.floor(ideal)),Math.max(1,Math.ceil(ideal))])];
        for(const secondaryTurns of secondary)for(const widthScale of locks.widths?[1]:[1,1.5])for(const sizeScale of locks.footprint?[1]:names.length>1?[.75,.9,1]:[.75,1]){
          const cfg={...base,stackPlan,primaryTurns,secondaryTurns,
            copperLayers:locks.stack?c.copperLayers:'',layerPositions:locks.stack?c.layerPositions:'',
            dOuter:locks.footprint?c.dOuter:(core==='custom'?req.diameter-6:Math.min(base.dOuter,req.diameter-6))*sizeScale,
            windingOptions:Object.fromEntries(['P',...names].map(name=>[name,{connection:name==='P'?pc:name==='S'?sc:locks.connections?windingSettings(c,name).connection:'series',width:Math.min(3,(locks.widths?windingSettings(c,name).width:base.traceW)*widthScale)}]))};
          let variants=[cfg];
          for(const t of targets.slice(1)){const count=stackPlan.split(',').filter(n=>n.trim()===t.name).length,key=`secondary${t.name.slice(1)}Turns`,ideal=primaryTurns*(pc==='series'?pcount:1)/(cfg.windingOptions[t.name].connection==='series'?count:1)*t.voltage/req.voltage;
            const choices=locks.turns?[c[key]]:[...new Set([Math.max(1,Math.floor(ideal)),Math.max(1,Math.ceil(ideal))])];variants=variants.flatMap(v=>choices.map(n=>({...v,[key]:n})));}
          for(const variant of variants){const key=JSON.stringify([core,stackPlan,pc,sc,primaryTurns,secondaryTurns,variant.secondary2Turns,variant.secondary3Turns,cfg.dOuter,cfg.windingOptions]);if(!seen.has(key)){seen.add(key);trials.push(variant);}}
        }
      }
    }
  }
  const matches=[],near=[],rejected={geometry:0,flux:0,voltage:0,area:0,layers:0},geometryReasons={};
  trials.forEach((cfg,index)=>{
    try{
      const r=buildTransformer(cfg,env,{segmentCap:400}),a=assessTransformer(cfg,r,req),robust=assessConditions(cfg,r,env),error=Math.abs(a.metrics.voltage/req.outputVoltage-1);
      a.issues=robust.points.flatMap(q=>q.issues);
      const candidate={...candidateSnapshot(cfg,r,`${cfg.corePreset} · ${cfg.stackPlan} · ${r.analysis.turns.join(':')}`),error,
        robust,score:error+robust.worstCopper/Math.max(r.analysis.loaded.outputPower,1e-9)*.1+a.metrics.area/req.diameter**2*.01};
      if(a.issues.length){for(const issue of a.issues)rejected[issue.key]=(rejected[issue.key]||0)+1;near.push({...candidate,issues:a.issues,distance:a.issues.reduce((sum,q)=>sum+q.excess,0)});}
      else matches.push(candidate);
    }catch(error){rejected.geometry++;geometryReasons[error.message]=(geometryReasons[error.message]||0)+1;}
    if(index%8===0||index===trials.length-1)progress({done:index+1,total:trials.length,message:`${matches.length} feasible candidates`});
  });
  // Retain different objectives, then refine with the same resolution as export.
  const ordered=[...matches].sort((a,b)=>a.score-b.score),objectives=[...matches].sort((a,b)=>a.metrics.copper-b.metrics.copper);
  const small=[...matches].sort((a,b)=>a.metrics.area-b.metrics.area),margin=[...matches].sort((a,b)=>(b.metrics.fluxMargin??0)-(a.metrics.fluxMargin??0));
  const finalists=[],used=new Set();
  for(const q of [ordered[0],small[0],objectives[0],margin[0],...ordered.slice(0,20)].filter(Boolean)){
    const key=modelSignature(q.config);if(used.has(key))continue;used.add(key);
    try{const r=buildTransformer(q.config,env),a=assessTransformer(q.config,r,req),robust=assessConditions(q.config,r,env);if(!robust.points.some(p=>p.issues.length))finalists.push({...candidateSnapshot(q.config,r,q.name),robust,error:Math.abs(a.metrics.voltage/req.outputVoltage-1)});}catch{rejected.geometry++;}
    if(finalists.length===24)break;
  }
  const nearMisses=[];
  for(const q of near.sort((a,b)=>a.distance-b.distance).slice(0,8)){
    try{const r=buildTransformer(q.config,env),a=assessTransformer(q.config,r,req);if(a.issues.length)nearMisses.push({...candidateSnapshot(q.config,r,q.name),issues:a.issues});}catch{}
    if(nearMisses.length===3)break;
  }
  const suggestions=[];
  if(!finalists.length&&followups){
    const relaxations=[{diameter:Math.min(200,Number((req.diameter*1.25).toFixed(1)))}];
    if(!locks.stack&&available<8&&(!env.board||env.board.layerCount>available))relaxations.push({layers:Math.min(8,available+2)});
    for(const patch of relaxations){
      progress({done:trials.length,total:trials.length,message:`Checking ${Object.keys(patch)[0]} change…`});
      const next=searchTransformer(c,{...req,...patch},env,()=>{},false);
      if(next.candidates.length)suggestions.push({patch,candidate:next.candidates[0],tested:next.tried});
    }
  }
  return {candidates:finalists.slice(0,3),frontier:finalists,nearMisses,suggestions,rejected,geometryReasons,tried:trials.length,requirements:req,
    message:finalists.length?'Starting designs meet known limits at the selected operating conditions. Check Unknown results before building.':'No design met every known constraint in this bounded search.'};
}

export function compareTransformers(c, candidates, normalized = false, env = {}) {
  if(!Array.isArray(candidates)||candidates.length>3)throw new Error('Compare at most three candidates.');
  const pointKeys=['freq','sourceVoltage','sourceR','sourceX','loadMode','loadKind','loadR','loadX','loadL','loadC','load2Mode','load2Kind','load2R','load2X','load2L','load2C','load3Mode','load3Kind','load3R','load3X','load3L','load3C','tempC','ambientTemperature','coreTemperature'];
  const rows=candidates.map(q=>{
    const cfg={...copy(q.config),driveMode:'voltage',sweepMin:c.sweepMin,sweepMax:c.sweepMax,sweepPoints:c.sweepPoints};
    if(normalized)for(const key of pointKeys)cfg[key]=c[key];
    try{const r=buildTransformer(cfg,env);return {...candidateSnapshot(cfg,r,q.name),response:transformerSweep(cfg,r),badges:[]};}
    catch(error){return {name:q.name,error:error.message};}
  });
  const valid=rows.filter(q=>q.metrics);
  for(const [key,label,direction] of [['area','Smallest',1],['copper','Lowest copper loss',1],['fluxMargin','Highest flux margin',-1]]){
    const eligible=valid.filter(q=>Number.isFinite(q.metrics[key]));
    if(eligible.length){const best=[...eligible].sort((a,b)=>direction*(a.metrics[key]-b.metrics[key]))[0].metrics[key];eligible.filter(q=>Math.abs(q.metrics[key]-best)<1e-12).forEach(q=>q.badges.push(label));}
  }
  return {rows,normalized,conditionsDiffer:!normalized&&new Set(valid.map(q=>JSON.stringify(pointKeys.map(k=>q.config[k])))).size>1};
}

export function transformerRepairs(c,env={},progress=()=>{}) {
  const before=assessConditions(c,buildTransformer(c,env),env),score=r=>r.points.reduce((n,p)=>n+p.issues.reduce((s,i)=>s+(i.excess??1),0),0);
  if(c.leakageModel==='measured'||c.coreALMeasured>0)return {before,repairs:[],message:'Geometry repairs require geometry-based magnetic parameters. Preserve the measured calibration and switch models before exploring changes.'};
  const patches=[];
  for(const key of ['primaryTurns','secondaryTurns',...outputRequirements(c).slice(1).map(q=>`secondary${q.name.slice(1)}Turns`)])for(const n of [-2,-1,1,2])if(c[key]+n>0)patches.push({[key]:c[key]+n});
  for(const scale of [1.1,1.25])patches.push({dOuter:Math.min(160,c.dOuter*scale)},{traceW:Math.min(3,c.traceW*scale),windingOptions:Object.fromEntries(Object.entries(c.windingOptions||{}).map(([n,o])=>[n,{...o,width:Math.min(3,(o.width||c.traceW)*scale)}]))});
  const repairs=[];
  patches.forEach((patch,i)=>{try {const cfg={...c,...patch},r=buildTransformer(cfg,env),after=assessConditions(cfg,r,env);if(score(after)<score(before)-1e-8&&!after.points.some((p,j)=>p.issues.some(x=>!before.points[j].issues.some(y=>y.key===x.key))))repairs.push({patch,before,after,improvement:score(before)-score(after),metrics:candidateSnapshot(cfg,r).metrics});}catch{}progress({done:i+1,total:patches.length,message:'Checking repair effects'});});
  return {before,repairs:repairs.sort((a,b)=>b.improvement-a.improvement).slice(0,5),message:repairs.length?'These changes reduce a current violation without introducing a new class of violation in the selected cases.':'No improving change was found in this bounded check. Review requirements or add missing material data.'};
}

export function operatingEnvelope(input, env = {}, progress = () => {}) {
  const c={...transformerExtras(),...input,driveMode:'voltage'},options=c.operatingRange;
  for(const [key,lo,hi] of [['voltage',.01,1000],['frequency',100,1e7],['load',1e-6,1e9],['ambient',-40,125]]){
    const values=options[key];if(!Array.isArray(values)||values.length!==3||values.some((v,i)=>!Number.isFinite(v)||v<lo||v>hi||(i&&v<values[i-1])))throw new Error(`${key}: enter ordered minimum, nominal and maximum values.`);
  }
  range(options,'maxTemperature',-40,250);
  if(options.maxRegulation!=null)range(options,'maxRegulation',0,10000);
  const base=buildTransformer(c,env),points=[];
  for(const voltage of [...new Set(options.voltage)])for(const frequency of [...new Set(options.frequency)])for(const load of [...new Set(options.load)])for(const ambient of [...new Set(options.ambient)]){
    const cfg={...c,sourceVoltage:voltage,freq:frequency,loadMode:'load',loadKind:'impedance',loadR:load,loadX:0,ambientTemperature:ambient};
    try{const result=evaluateOperatingPoint(cfg,base,frequency);points.push({voltage,frequency,load,ambient,...assessTransformer(cfg,result,c.requirements,options.maxTemperature,options.maxRegulation)});}
    catch(error){points.push({voltage,frequency,load,ambient,pass:false,issues:[{key:'solve',message:error.message}],unknown:[]});}
    progress({done:points.length,total:81,message:'Evaluating operating corners'});
  }
  return {points,passed:points.filter(p=>p.pass).length,failed:points.filter(p=>p.issues.length).length,unknown:points.filter(p=>p.unknown.length).length,
    scope:'Grid samples, not continuous worst-case proof. S is resistive; other loads stay fixed. Copper temperature and loss-data temperature retain their selected values.'};
}

export function transformerTolerance(input, env = {}, progress = () => {}) {
  const c={...transformerExtras(),...input,driveMode:'voltage'},o=c.transformerTolerances;
  range(o,'samples',5,200,true);range(o,'seed',0,4294967295,true);
  for(const key of ['copper','spacing','al'])range(o,key,0,40);
  let seed=o.seed>>>0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const nominal=buildTransformer(c,env), samples=[],board=env.board?copy(env.board):null;
  const run=(factors)=>{
    const cfg={...c,copperOz:c.copperOz*factors.copper,boardT:c.boardT*factors.spacing,coreALScale:(c.coreALScale||1)*factors.al};
    if(nominal.art.meta.stack)cfg.layerPositions=nominal.art.meta.stack.map(q=>q.z*factors.spacing).join(',');
    const variationBoard=board?{...board,thickness:cfg.boardT}:null;
    const r=buildTransformer(cfg,{...env,board:variationBoard});return assessTransformer(cfg,r,c.requirements,c.operatingRange.maxTemperature,c.operatingRange.maxRegulation);
  };
  for(let i=0;i<o.samples;i++){
    const factors=Object.fromEntries(['copper','spacing','al'].map(k=>[k,1+(2*random()-1)*o[k]/100]));
    if(!nominal.core)factors.al=1;
    try{samples.push({factors,...run(factors)});}catch(error){samples.push({factors,pass:false,issues:[{key:'geometry',message:error.message}],unknown:[]});}
    progress({done:i+1,total:o.samples,message:'Sampling fabrication tolerances'});
  }
  const sensitivity=['copper','spacing',...(nominal.core?['al']:[])].map(key=>{
    try{const low=run({...{copper:1,spacing:1,al:1},[key]:1-o[key]/100}),high=run({...{copper:1,spacing:1,al:1},[key]:1+o[key]/100});
      return {key,voltageSpan:Math.abs(high.metrics.voltage-low.metrics.voltage),lossSpan:Math.abs(high.metrics.copper-low.metrics.copper)};
    }catch(error){return {key,error:error.message};}
  }).sort((a,b)=>(b.voltageSpan||0)-(a.voltageSpan||0));
  return {samples,sensitivity,passed:samples.filter(p=>p.pass).length,unknown:samples.filter(p=>p.unknown.length).length,
    scope:'Independent uniform variations; fixed turns and planar copper centerlines. Yield is conditional on this model and selected limits. Air-core samples omit AL variation.'};
}
