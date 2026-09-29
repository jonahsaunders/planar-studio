/* Saved project records and dependency-aware study validity. */
export const clone = value => JSON.parse(JSON.stringify(value));
export const recordId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const projectKeys = ['candidates','checkpoints','transformerTests','calibrations','calibration','studies','searchResults','scenarios','requirements','searchLocks','operatingRange','transformerTolerances','operatingLinked','prototypeName'];
export const pointKeys = ['freq','driveMode','sourceVoltage','sourceR','sourceX','loadMode','loadKind','loadR','loadX','loadL','loadC','load2Mode','load2Kind','load2R','load2X','load2L','load2C','load3Mode','load3Kind','load3R','load3X','load3L','load3C','tempC','ambientTemperature','coreTemperature'];
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])) : value;
export const fingerprint = value => JSON.stringify(canonical(value));
export function windingNet(c,name,fallback) {
  const mappings=Object.entries(c.windingNets||{}).filter(([,v])=>v);
  if(mappings.some(([,v])=>typeof v!=='string'||!v.trim()))throw new Error('Winding nets need nonempty names.');
  if(new Set(mappings.map(([,v])=>v.trim())).size!==mappings.length)throw new Error('Separate windings must use separate nets.');
  return c.windingNets?.[name]?.trim()||fallback;
}
export function designSnapshot(c) {
  const q=clone(c);for(const key of ['candidates','checkpoints','transformerTests','calibrations','studies','searchResults'])delete q[key];return q;
}
export function physicsSignature(c, measurement=false) {
  const q={...c};for(const key of [...projectKeys,'placementOrigin','placementRotation','placementGrid','windingNets'])delete q[key];
  if(measurement)for(const key of [...pointKeys,'coreALMeasured','coreALScale','measuredLeakage','leakageModel'])delete q[key];
  for(const key of Object.keys(q))if(/^(sweep|loadSweep)/.test(key))delete q[key];
  return fingerprint(q);
}
export function revisionId(c) {let h=2166136261;for(const x of physicsSignature(c))h=Math.imul(h^x.charCodeAt(0),16777619);return `R-${(h>>>0).toString(16).padStart(8,'0')}`;}
export function outputRequirements(c) {
  const r=c.requirements;
  return [{name:'S',voltage:r.outputVoltage,current:r.outputCurrent,tolerance:r.voltageTolerance},...['S2','S3'].filter(name=>r.outputs?.[name]?.enabled).map(name=>({name,...r.outputs[name]}))];
}
export function nominalPatch(c) {
  const r=c.requirements,patch={driveMode:'voltage',freq:r.frequency,sourceVoltage:r.voltage};
  for(const q of outputRequirements(c)) {const p=q.name==='S'?'load':`load${q.name.slice(1)}`;Object.assign(patch,{[`${p}Mode`]:'load',[`${p}Kind`]:'impedance',[`${p}R`]:q.voltage/q.current,[`${p}X`]:0});}
  return patch;
}
export function reconcileOperating(c,key) {
  if(['requirements','operatingLinked'].includes(key)&&c.operatingLinked)Object.assign(c,nominalPatch(c));
  else if(c.operatingLinked&&pointKeys.includes(key)&&!['tempC','ambientTemperature','coreTemperature'].includes(key))c.operatingLinked=false;
}
export function saveScenario(c,name) {
  if(!name?.trim())throw new Error('Give the operating condition a name.');
  return {id:recordId(),name:name.trim().slice(0,80),enabled:true,point:Object.fromEntries(pointKeys.filter(k=>c[k]!==undefined).map(k=>[k,clone(c[k])]))};
}
export function studySignature(c,kind,board=null) {
  const stack=board?{layerCount:board.layerCount,copperLayers:board.copperLayers?.map(q=>({name:q.name,centerHeightMm:c.layerPositions?undefined:q.centerHeightMm}))}:null;
  const dependencies={physics:physicsSignature(c),requirements:c.requirements,limits:{maxTemperature:c.operatingRange.maxTemperature,maxRegulation:c.operatingRange.maxRegulation},board:stack};
  if(kind==='envelope')dependencies.range=c.operatingRange;
  if(kind==='tolerance')dependencies.tolerances=c.transformerTolerances;
  if(kind==='scenarios')dependencies.scenarios=c.scenarios;
  return fingerprint(dependencies);
}
export const searchSignature=(c,board=null)=>fingerprint({physics:physicsSignature(c),requirements:c.requirements,locks:c.searchLocks,scenarios:c.scenarios,limits:c.operatingRange,board:board?{layerCount:board.layerCount,copperLayers:board.copperLayers}:null});
export function saveStudy(c,kind,result,board=null,label=kind) {
  return {id:recordId(),label,date:new Date().toISOString(),revision:revisionId(c),signature:studySignature(c,kind,board),kind,board:clone(board),config:designSnapshot(c),result:clone(result)};
}
export function studyStatus(record,c,board=record.board) {
  if(record.signature!==studySignature(c,record.kind,board))return 'Outdated';
  const cases=record.result.samples||record.result.points||[];
  if(cases.some(q=>q.issues?.length))return 'Fail';
  if(!cases.length||cases.some(q=>q.unknown?.length||!q.pass))return 'Unknown';
  return 'Pass';
}
