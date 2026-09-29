import { parseMeasurement, interpolate } from './measurements.js';
import { buildTransformer } from './transformer.js';
import { evaluateOperatingPoint } from './transformer-studies.js';
import { modelSignature } from './transformer-workflow.js';
import { C } from './complex.js';
import { designSnapshot, physicsSignature, recordId, revisionId } from './transformer-project.js';

export function importTransformerTest(text, name, kind, conditions, config) {
  if(!['open','short','loaded'].includes(kind))throw new Error('Choose open, short or loaded test.');
  if(!conditions.fixture?.trim())throw new Error('Record the fixture and terminal reference plane.');
  if(!Number.isFinite(conditions.temperature)||conditions.temperature < -40||conditions.temperature>125)throw new Error('Record a copper temperature between −40 and 125 °C.');
  // Source-referenced transfer gain is not a scattering parameter. Require an
  // explicit CSV heading; do not silently overlay S21 onto Vout/Vsource.
  if(kind==='loaded') {
    if(!/^.*\bgain_?db\b.*$/im.test(text)||/\.s[12]p$/i.test(name))throw new Error('Loaded test needs CSV columns Frequency (Hz), Gain_dB, where gain = Vout / source RMS voltage.');
    text=text.replace(/\bgain_?db\b/i,'s21db');
  }
  const data=parseMeasurement(text,name);
  if(data.rows.length>5000)throw new Error('Reduce each test to at most 5,000 points.');
  if(kind!=='loaded'&&(data.ports===2||data.rows.some(q=>!Number.isFinite(q.zRe)||!Number.isFinite(q.zIm))))throw new Error('Open/short tests need primary R and X versus frequency, or a one-port S1P measurement.');
  if(kind==='loaded'&&data.rows.some(q=>!Number.isFinite(q.s21db)))throw new Error('Every loaded row needs Gain_dB.');
  return {id:recordId(),kind,data,prototype:conditions.prototype?.trim()||'Unassigned prototype',conditions:{...conditions},date:new Date().toISOString(),signature:modelSignature(config),geometry:physicsSignature(config,true),revision:revisionId(config),configuration:designSnapshot(config)};
}

function testConfig(c,test) {
  const out={...c,driveMode:'voltage',tempC:test.conditions.temperature};
  if(test.kind==='open'||test.kind==='short')Object.assign(out,{sourceVoltage:1,sourceR:0,sourceX:0,loadMode:test.kind==='open'?'open':'short',load2Mode:'open',load3Mode:'open'});
  else {
    // Loaded fixtures retain the source and load recorded when the file arrived.
    for(const key of ['sourceVoltage','sourceR','sourceX','loadMode','loadKind','loadR','loadX','loadL','loadC','load2Mode','load2Kind','load2R','load2X','load2L','load2C','load3Mode','load3Kind','load3R','load3X','load3L','load3C'])out[key]=test.configuration[key];
  }
  return out;
}

export function compareTransformerTest(c,test,env={}) {
  const cfg=testConfig(c,test),base=buildTransformer(cfg,env);
  const xs=test.data.rows.map(q=>q.f),actual=test.data.rows.map(q=>test.kind==='loaded'?q.s21db:q.Z),predicted=xs.map(f=>{
    const r=evaluateOperatingPoint(cfg,base,f),l=r.analysis.loaded;
    if(test.kind==='loaded')return 20*Math.log10(Math.max(1e-15,l.outputs[0].voltage/cfg.sourceVoltage));
    // The test fixture has an ideal 1 V source, so its input impedance is 1/I.
    return C.abs(C.div([1,0],l.currents[0]));
  });
  return {xs,actual,predicted,unit:test.kind==='loaded'?'dB':'Ω',name:test.data.name,
    changed:modelSignature(c)!==test.signature,rmse:Math.sqrt(actual.reduce((sum,v,i)=>sum+(v-predicted[i])**2,0)/xs.length)};
}

export function calibrateTransformer(c, tests, env={}) {
  const open=tests.find(q=>q.kind==='open'),short=tests.find(q=>q.kind==='short');
  if(!open||!short)throw new Error('Import both open and short tests first.');
  const geometry=q=>q.geometry||physicsSignature(q.configuration,true);
  if(geometry(open)!==geometry(short)||geometry(open)!==physicsSignature(c,true))throw new Error('Open and short tests must describe this unchanged geometry. Restore their design or remeasure it.');
  if(open.prototype!==short.prototype)throw new Error('Choose open and short tests from the same physical prototype.');
  if(open.conditions.temperature!==short.conditions.temperature||open.conditions.fixture!==short.conditions.fixture)throw new Error('Open and short tests must share copper temperature and fixture reference plane.');
  const r=buildTransformer(c,env);
  if(!r.core||r.windings.length!==2||r.windings.some(w=>w.connection!=='series'))throw new Error('AL/leakage calibration supports two series windings on a ferrite core.');
  const xs=q=>q.data.rows.map(x=>x.f),ys=q=>q.data.rows.map(x=>x.zIm);
  if([open,short].some(q=>c.freq<q.data.rows[0].f||c.freq>q.data.rows.at(-1).f))throw new Error('Both measured sweeps must bracket the operating frequency. No extrapolation is used.');
  const Lopen=interpolate(xs(open),ys(open),c.freq)/(2*Math.PI*c.freq),Lshort=interpolate(xs(short),ys(short),c.freq)/(2*Math.PI*c.freq);
  if(!Number.isFinite(Lopen)||!Number.isFinite(Lshort))throw new Error('Both measured sweeps must bracket the operating frequency. No extrapolation is used.');
  if(!(Lopen>Lshort&&Lshort>0))throw new Error('Expected positive inductive values with open inductance greater than short inductance. Check fixtures and frequency.');
  const patch={coreALMeasured:Math.sqrt(Lopen*(Lopen-Lshort))/r.windings[0].turns**2,coreALScale:1,leakageModel:'measured',measuredLeakage:Lshort};
  // The analytic estimate initializes a bounded numerical fit to measured X.
  // This accounts for finite winding resistance in the short-circuit test.
  const targets=[open,short].map(test=>interpolate(xs(test),ys(test),c.freq));
  const loss=p=>[open,short].reduce((sum,test,i)=>{
    const cfg=testConfig({...c,...p},test),v=buildTransformer(cfg,env).analysis.loaded;
    const x=C.div([1,0],v.currents[0])[1];return sum+((x-targets[i])/targets[i])**2;
  },0);
  let best=loss(patch),step=.3;
  for(let round=0;round<22;round++){
    let improved=false;
    for(const key of ['coreALMeasured','measuredLeakage'])for(const direction of [-1,1]){
      const p={...patch,[key]:patch[key]*(1+direction*step)};
      if(p[key]<=0||p[key]>1)continue;
      try{const score=loss(p);if(score<best){Object.assign(patch,p);best=score;improved=true;}}catch{}
    }
    if(!improved)step*=.5;
  }
  const baseline=tests.map(test=>compareTransformerTest(c,test,env)),fitted=tests.map(test=>compareTransformerTest({...c,...patch},test,env));
  return {patch,baseline,fitted,residual:Math.sqrt(best/2),fields:['coreALMeasured','measuredLeakage'],
    source:{date:new Date().toISOString(),frequency:c.freq,prototype:open.prototype,temperature:open.conditions.temperature,fixture:open.conditions.fixture,testIds:[open.id,short.id],files:[open.data.name,short.data.name]},
    scope:'Small-signal AL and primary leakage fitted at the operating frequency. Resistance, capacitance, core loss and large-signal behavior are not calibrated.'};
}

export function comparePrototypes(tests) {
  if(tests.length<2||tests.length>4)throw new Error('Select two to four tests for comparison.');
  if(new Set(tests.map(q=>q.kind)).size!==1)throw new Error('Compare the same test type across prototypes.');
  const min=Math.max(...tests.map(t=>t.data.rows[0].f)),max=Math.min(...tests.map(t=>t.data.rows.at(-1).f));
  if(max<=min)throw new Error('Selected tests need overlapping frequency ranges; no extrapolation is used.');
  const xs=[...new Set(tests.flatMap(t=>t.data.rows.map(q=>q.f)).filter(f=>f>=min&&f<=max))].sort((a,b)=>a-b);
  return {xs,unit:tests[0].kind==='loaded'?'dB':'Ω',series:tests.map(t=>({name:`${t.prototype||'Unassigned'} · ${t.data.name} · ${t.conditions.temperature} °C`,values:xs.map(f=>interpolate(t.data.rows.map(q=>q.f),t.data.rows.map(q=>t.kind==='loaded'?q.s21db:q.Z),f))})),conditionsDiffer:new Set(tests.map(t=>JSON.stringify([t.conditions.fixture,t.conditions.temperature]))).size>1};
}
