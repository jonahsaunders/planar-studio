import { buildTransformer, TRANSFORMER_FAMILIES, transformerExtras, STACK_PRESETS, CORE_MATERIALS } from '../engine/transformer.js';
import { layerAssistant, windingEditor } from '../ui/winding-stack.js';
import { eng, num } from '../ui/controls.js';
import { colourFor, fmtHz } from './common.js';
import { transformerMode, transformerName } from '../engine/transformer-config.js';
import { transformerSweep } from '../engine/transformer-studies.js';
import { coreLossAt } from '../engine/transformer-physics.js';
import { transformerPreview, designWorkflow, candidateControls, corePicker } from '../ui/transformer-design.js';
export const id = 'transformer', title = 'Transformer';
export const defaults = () => ({ ...transformerExtras(), shape: 'circle', primaryTurns: 6, secondaryTurns: 3, dOuter: 30, traceW: 0.5, traceS: 0.3, boardT: 1.6, copperOz: 1, tempC: 25, freq: 1e5, current: 1, secondaryCurrent: 1, ppt: 128, tolerance: 0.004 });
const advanced = c => !transformerMode(c).surface;
const loaded = c => c.driveMode === 'voltage';
const ferrite = c => transformerMode(c).magnetic === 'ferrite';
const multiple = c => transformerMode(c).topology.startsWith('multiple');
const options = o => Object.entries(o).map(([value, label]) => ({ value, label }));
export function reconcile(c, key, value) {
  if (key === 'family' && STACK_PRESETS[value]) {
    c.stackPlan = STACK_PRESETS[value]; c.copperLayers = ''; c.layerPositions = '';
    c.magneticModel='auto';c.windingTopology='auto';c.corePreset='custom';c.routedWindings=false;
    if (value === 'ferrite') c.dOuter = Math.max(40, c.dOuter);
  }
  if(key==='family'&&value==='aircore'){c.magneticModel='auto';c.windingTopology='auto';c.routedWindings=false;c.corePreset='custom';}
  if(key==='magneticModel'&&value==='ferrite'){c.routedWindings=true;if(!c.corePreset||c.corePreset==='custom')c.dOuter=Math.max(c.dOuter,40);}
  if(key==='windingTopology'&&value!=='auto') {
    c.routedWindings=true;
    const previous=c.stackPlan, plan=c.stackPlan.split(',').map(s=>s.trim());
    if(value.startsWith('multiple')&&!plan.includes('S2'))plan.push('S2');
    if(value.includes('tapped')&&plan.filter(n=>n==='S').length%2)plan.push('S');
    c.stackPlan=plan.filter(n=>value.startsWith('multiple')||!['S2','S3'].includes(n)).join(',');
    if(c.stackPlan!==previous){c.copperLayers='';c.layerPositions='';}
  }
}
export function rail(panel, api) {
  panel.group({key:'transformer-requirements',title:'Design from requirements',open:false,fields:[{key:'_requirements',type:'custom',build:p=>designWorkflow(p,api)}]});
  panel.group({ key: 'layer-assistant', title: 'Layer setup assistant', fields: [
    { key: '_layerAssistant', type: 'custom', build: p => layerAssistant(p, api) },
  ] });
  panel.group({ key: 'windings', title: 'Planar transformer', fields: [
    { key: 'family', type: 'select', label: 'Transformer type', options: options(TRANSFORMER_FAMILIES) },
    { key:'magneticModel',type:'select',label:'Magnetic model',options:options({auto:'From starting preset',air:'Air-core',ferrite:'Ferrite core'}),hint:'Core choice is independent of taps, output count and layer arrangement.' },
    { key:'windingTopology',type:'select',label:'Winding connections',options:options({auto:'From starting preset',standard:'One secondary',tapped:'Center-tapped secondary',multiple:'Multiple secondaries','multiple-tapped':'Multiple secondaries + S center tap'}) },
    { key:'routedWindings',type:'check',label:'Route multilayer winding terminals',hint:'Enables section editing and accessible drilled terminals.',when:c=>!ferrite(c)&&transformerMode(c).topology==='standard' },
    { key: 'shape', type: 'seg', label: 'Winding shape', options: [{ value: 'circle', label: 'Circular' }, { value: 'polygon', label: 'Square' }] },
    { key: 'primaryTurns', type: 'range', label: 'Primary turns', min: 1, max: 60, step: 1, hint: 'Turns per occupied copper layer; the readouts account for series or parallel sections.' },
    { key: 'secondaryTurns', type: 'range', label: 'Secondary turns', min: 1, max: 60, step: 1, hint: 'Turns per S layer. Center-tapped halves have equal layer counts.' },
    { key: 'secondary2Turns', type: 'range', label: 'Second secondary turns per layer', min: 1, max: 60, step: 1, when: multiple },
    { key: 'secondary3Turns', type: 'range', label: 'Third secondary turns per layer', min: 1, max: 60, step: 1, when: c => multiple(c) && c.stackPlan.split(',').some(n => n.trim() === 'S3') },
    { key: 'dOuter', type: 'range', label: 'Outer diameter', unit: 'mm', min: 5, max: 160, step: 0.1 },
    { key: 'traceW', type: 'range', label: 'Track width', unit: 'mm', min: 0.1, max: 3, step: 0.01 },
    { key: 'traceS', type: 'range', label: 'Turn clearance', unit: 'mm', min: 0.1, max: 3, step: 0.01 },
  ] });
  panel.group({ key: 'visual-stack', title: 'Interactive winding stack', when: advanced, fields: [
    { key: '_windingEditor', type: 'custom', build: p => windingEditor(p, api), when: advanced },
  ] });
  panel.group({ key: 'stack', title: 'Stack details and copper', fields: [
    { key: 'stackPlan', type: 'text', label: 'Winding assignment, front to back', hint: 'One entry per used layer: P,P,S,S or P,S,P,S. Use S2/S3 for additional secondaries. Choose series or parallel connections in the winding editor.', when: advanced },
    { key: 'copperLayers', type: 'text', label: 'Copper layer names (optional)', hint: 'Example: F.Cu,In1.Cu,In2.Cu,B.Cu. Blank selects available layers in order, including the back.', when: advanced },
    { key: 'layerPositions', type: 'text', label: 'Copper center heights (optional, mm)', hint: 'Example: 0,0.2,1.4,1.6. Same order as the assigned layers; blank uses physical board heights when available, otherwise uniform spacing.', when: advanced },
    { key: 'boardT', type: 'range', label: 'Winding separation', unit: 'mm', min: 0.1, max: 3.2, step: 0.01, hint: 'Total front-to-back separation; individual heights can override uniform spacing.' },
    { key: 'viaPad', type: 'range', label: 'Transition / terminal diameter', unit: 'mm', min: 0.5, max: 2, step: 0.05, when: advanced },
    { key: 'viaDrill', type: 'range', label: 'Transition / terminal drill', unit: 'mm', min: 0.2, max: 1, step: 0.05, when: advanced },
    { key: 'copperOz', type: 'range', label: 'Copper weight', unit: 'oz', min: 0.25, max: 4, step: 0.25 },
    { key: 'tempC', type: 'range', label: 'Operating temperature', unit: '°C', min: -40, max: 125, step: 1 },
  ] });
  panel.group({ key: 'core', title: 'Ferrite core and material', when: ferrite, fields: [
    {key:'_corePicker',type:'custom',build:p=>corePicker(p,api),when:ferrite},
    { key: 'coreShape', type: 'select', label: 'Core post shape', options: options({ rectangular: 'Rectangular post (E/ER-style opening)', round: 'Round post (pot/RM-style opening)' }), when: ferrite },
    { key: 'corePostW', type: 'number', label: 'Core post width / diameter', unit: 'mm', when: ferrite },
    { key: 'corePostH', type: 'number', label: 'Core post height', unit: 'mm', when: c => ferrite(c) && c.coreShape === 'rectangular' },
    { key: 'coreClearance', type: 'number', label: 'Core assembly clearance', unit: 'mm', when: ferrite },
    { key: 'coreWindowHeight', type: 'number', label: 'Core window height for PCB', unit: 'mm', when: ferrite },
    { key: 'coreMaterial', type: 'select', label: 'Core material', options: Object.entries(CORE_MATERIALS).map(([value, m]) => ({ value, label: m.name })), when: ferrite },
    { key: 'coreMuR', type: 'number', label: 'Material relative permeability', when: c => ferrite(c) && c.coreMaterial === 'custom' },
    { key: 'coreAe', type: 'number', label: 'Effective core area Ae', unit: 'mm²', when: ferrite },
    { key: 'coreLe', type: 'number', label: 'Effective magnetic path le', unit: 'mm', when: ferrite },
    { key: 'coreGap', type: 'number', label: 'Total magnetic gap', unit: 'mm', when: ferrite },
    {key:'leakageModel',type:'select',label:'Leakage calculation',options:options({supplied:'Supplied fraction (legacy)',geometry:'From winding stack (current-sheet estimate)',measured:'Measured primary short-circuit inductance'}),when:ferrite},
    {key:'measuredLeakage',type:'number',label:'Measured primary leakage',unit:'H',si:true,when:c=>ferrite(c)&&c.leakageModel==='measured',hint:'Secondary shorted; two series windings only.'},
    { key: 'leakageFraction', type: 'range', label: 'Assumed series leakage / self L', min: 0.001, max: 0.3, step: 0.001, when: c=>ferrite(c)&&c.leakageModel==='supplied', hint: 'Supplied assumption, not calculated from interleaving.' },
    { key: 'coreVoltage', type: 'number', label: 'Sinusoidal primary RMS voltage', unit: 'V', when: c => ferrite(c) && !loaded(c) },
    { key: 'coreFluxLimit', type: 'number', label: 'Design peak flux limit', unit: 'T', when: ferrite },
    { key: 'coreLossDensity', type: 'number', label: 'Core loss density at operating point', unit: 'kW/m³', when: c=>ferrite(c)&&c.coreLossModel==='density', hint: 'From the material curve at actual frequency, flux and core temperature. Zero leaves core loss unknown.' },
    {key:'coreLossModel',type:'select',label:'Core loss model',options:options({density:'Entered operating-point density','n87-fit':'N87 fit to datasheet points at 100 °C',steinmetz:'User Steinmetz coefficients'}),when:ferrite},
    {key:'coreTemperature',type:'number',label:'Core temperature for loss data',unit:'°C',when:ferrite},
    ...[['steinmetzK','Steinmetz k'],['steinmetzAlpha','Frequency exponent α'],['steinmetzBeta','Flux exponent β']].map(([key,label])=>({key,label,type:'number',when:c=>ferrite(c)&&c.coreLossModel==='steinmetz',hint:'P/V = k f^α Bpk^β, in W/m³, Hz and T. Use coefficients fitted at the entered temperature.'})),
  ] });
  panel.group({key:'transformer-physics',title:'Loss & capacitance estimates',open:false,when:advanced,fields:[
    {key:'lossModel',type:'select',label:'Copper loss model',options:options({dc:'DC resistance (legacy)',ac:'DC + skin and proximity estimate'})},
    {key:'capacitanceModel',type:'select',label:'Interwinding capacitance',options:options({estimate:'Adjacent-layer overlap estimate',measured:'Measured total interwinding capacitance'})},
    {key:'dielectricEr',type:'number',label:'Winding dielectric εr',when:c=>c.capacitanceModel==='estimate'},
    {key:'measuredCapacitance',type:'number',label:'Measured interwinding capacitance',si:true,unit:'F',when:c=>c.capacitanceModel==='measured'},
    {key:'thermalResistance',type:'number',label:'Assembly thermal resistance',unit:'K/W',hint:'User-supplied assembly-to-ambient estimate. Zero disables temperature prediction.'},
    {key:'ambientTemperature',type:'number',label:'Ambient temperature',unit:'°C'},
    {type:'note',text:'Capacitance is reported separately for stack comparison. Differential sweeps exclude parasitic resonance. Thermal estimates require known core loss and do not feed back into material properties.'},
  ]});
  panel.group({ key: 'drive', title: 'Operating point', fields: [
    { key: 'driveMode', type: 'select', label: 'Drive model', options: options({ current: 'Imposed currents / open-circuit estimate', voltage: 'Voltage source with secondary loads' }) },
    { key: 'freq', type: 'number', label: 'Frequency', unit: 'Hz', si: true, format: fmtHz },
    { key: 'current', type: 'range', label: 'Primary RMS current', when: c => !loaded(c), unit: 'A', min: 0.01, max: 20, step: 0.01 },
    { key: 'secondaryCurrent', type: 'range', label: 'Secondary RMS current', when: c => !loaded(c), unit: 'A', min: 0.01, max: 20, step: 0.01, hint: 'For multiple secondaries this entered current applies to each winding for the DC-loss estimate.' },
  ] });
  panel.group({ key: 'source', title: 'Sinusoidal source', when: loaded, fields: [
    { key: 'sourceVoltage', type: 'number', label: 'Source RMS voltage', unit: 'V' },
    { key: 'sourceR', type: 'number', label: 'Source resistance', unit: 'Ω' },
    { key: 'sourceX', type: 'number', label: 'Source reactance', unit: 'Ω', hint: 'At the operating frequency: positive inductive, negative capacitive.' },
    { type: 'note', text: 'Linear sinusoidal circuit. Routed windings can include estimated AC copper loss. Rectifiers, switching waveforms and parasitic resonance are excluded.' },
  ] });
  for (const [name, prefix] of [['S', 'load'], ['S2', 'load2'], ['S3', 'load3']]) {
      const visible = c => loaded(c) && (name === 'S' || (multiple(c) && c.stackPlan.split(',').map(n => n.trim()).includes(name)));
    panel.group({ key: `load-${name}`, title: `${name} secondary load`, when: visible, fields: [
      { key: `${prefix}Mode`, type: 'select', label: `${name} termination`, options: options({ load: 'Impedance load', open: 'Open circuit', short: 'Short circuit' }) },
      {key:`${prefix}Kind`,type:'select',label:`${name} load representation`,options:options({impedance:'Fixed R + jX',rlc:'Series R, L and C components'}),when:c=>c[`${prefix}Mode`]==='load'},
      { key: `${prefix}R`, type: 'number', label: `${name} load resistance`, unit: 'Ω', when: c => c[`${prefix}Mode`] === 'load' },
      { key: `${prefix}X`, type: 'number', label: `${name} load reactance`, unit: 'Ω', when: c => c[`${prefix}Mode`] === 'load'&&c[`${prefix}Kind`]!=='rlc' },
      {key:`${prefix}L`,type:'number',label:`${name} load inductance`,unit:'H',si:true,when:c=>c[`${prefix}Mode`]==='load'&&c[`${prefix}Kind`]==='rlc'},
      {key:`${prefix}C`,type:'number',label:`${name} load capacitance`,unit:'F',si:true,when:c=>c[`${prefix}Mode`]==='load'&&c[`${prefix}Kind`]==='rlc',hint:'Zero omits the series capacitor. Reactance is recalculated at each sweep frequency.'},
      { type: 'note', text: 'Load connects from the dotted + to − terminal of the complete winding. A center tap remains open.' },
    ] });
  }
  panel.group({key:'transformer-sweeps',title:'Response sweeps',open:false,when:loaded,fields:[
    {key:'sweepMin',type:'number',label:'Sweep start frequency',unit:'Hz',si:true},{key:'sweepMax',type:'number',label:'Sweep stop frequency',unit:'Hz',si:true},
    {key:'loadSweepMin',type:'number',label:'S load sweep minimum',unit:'Ω'},{key:'loadSweepMax',type:'number',label:'S load sweep maximum',unit:'Ω'},
    {type:'note',text:'Load sweep varies a resistive S load while retaining the other outputs. Frequency sweeps preserve each selected termination.'},
  ]});
  panel.group({key:'transformer-candidates',title:'Compare up to three designs',open:false,fields:[{key:'_candidates',type:'custom',build:p=>candidateControls(p,api)}]});
}
export const compute = buildTransformer;
export const handles = () => [];
export const layerList = (c, r) => r.layers.map((n, i) => [n, colourFor(n, i)]);
export const notes = (c, r) => r.notes;
export const preview = transformerPreview;
export function charts(c,r) {
  const material=[];
  if(r.core && ['n87-fit','steinmetz'].includes(c.coreLossModel)) {
    const flux=Array.from({length:31},(_,i)=>.05+i*.005), losses=flux.map(b=>coreLossAt(c,b,1e-3).watts);
    if(losses.every(Number.isFinite))material.push({id:'core-material-loss',title:'Core loss density vs peak flux',note:`${c.freq/1000} kHz · ${c.coreTemperature} °C · ${c.coreLossModel==='n87-fit'?'fit to four typical N87 datasheet points; approximate':'user Steinmetz coefficients'}`,spec:{x:{values:flux,label:'B peak (T)'},y:{label:'kW/m³'},series:[{name:'Loss density',values:losses,unit:'kW/m³'}]}});
  }
  if(!r.analysis?.loaded)return material;
  let s;try{s=transformerSweep(c,r);}catch(error){return [{id:'sweep-error',title:'Sweep unavailable',note:error.message,spec:{x:{values:[1,2]},series:[],y:{label:''}}}];}
  const plot=(id,title,x,series,label,note)=>({id,title,note,spec:{x:{values:x,label:id==='load'?'S load Ω':'Hz',log:true},y:{label},series}});
  const circuitNote='Linear differential model; excludes parasitic resonance and core-loss feedback. Source X remains fixed; component loads rescale with frequency.';
  const out=[plot('load','Output voltage vs S load',s.loads,s.outputs.map(q=>({name:q.name,values:q.voltage,unit:'V'})),'V','Other output loads stay fixed.'),
    plot('gain','Voltage transfer vs frequency',s.frequencies,s.outputs.map(q=>({name:q.name,values:q.gain,unit:'dB'})),'dB',circuitNote),
    plot('phase','Output phase vs frequency',s.frequencies,s.outputs.map(q=>({name:q.name,values:q.phase,unit:'°'})),'°'),
    plot('loss','Copper loss vs frequency',s.frequencies,[{name:c.lossModel==='ac'?'DC + AC estimate':'DC loss',values:s.copper,unit:'W'}],'W')];
  if(r.core)out.push(plot('flux','Peak flux vs frequency',s.frequencies,[{name:'B peak',values:s.flux,unit:'T'},{name:'Design limit',values:s.frequencies.map(()=>s.fluxLimit),dash:[4,3],unit:'T'}],'T','Above the design limit, linear-core results are outside the intended range.'));
  return [...out,...material];
}
export function tiles(c, r) {
  const a = r.analysis; if (!a) return [];
  const out = [{ k: 'Primary L', v: eng(a.L1, 'H', 4) }, { k: 'Secondary L', v: eng(a.L2, 'H', 4) }, { k: 'Mutual M', v: eng(a.M, 'H', 4) }, { k: 'Coupling k', v: num(a.k, 4), sub: r.core ? `${c.leakageModel || 'supplied'} leakage model` : '' }, { k: 'Turns ratio Np:Ns', v: `${num(a.ratio, 3)}:1` }, { k: 'DC copper loss', v: eng(a.loss, 'W', 3), sub: a.loaded ? 'from solved RMS currents' : 'at entered winding currents' }];
  if(r.windings)out.unshift({k:'Total primary / secondary turns',v:`${r.windings[0].turns} / ${r.windings[1].turns}`,sub:'Includes series / parallel connections'});
  if(a.losses&&c.lossModel==='ac')out.push({k:'AC + DC copper loss',v:eng(a.losses.copper,'W',3),sub:'Current-sheet / Dowell estimate'});
  if(a.capacitance)out.push({k:'Interwinding capacitance',v:eng(a.capacitance.value,'F',3),sub:a.capacitance.source==='measured'?'Measured total':'Adjacent-layer overlap estimate'});
  if(a.losses?.temperature!=null)out.push({k:'Assembly temperature estimate',v:`${num(a.losses.temperature,1)} °C`,sub:'User-supplied thermal resistance'});
  if(a.estimatedEfficiency!=null)out.push({k:'Efficiency incl. entered/estimated core loss',v:`${num(a.estimatedEfficiency*100,2)}%`,sub:'Core loss added after circuit solve'});
  if (a.loaded) {
    const l = a.loaded;
    out.push({ k: 'Loaded primary current', v: eng(l.primaryCurrent, 'A', 4) }, { k: 'Delivered load power', v: eng(l.outputPower, 'W', 4) },
      { k: 'Circuit efficiency', v: l.efficiency == null ? '—' : `${num(l.efficiency * 100, 2)}%`, sub: `${c.lossModel==='ac'&&r.network?'DC + AC copper':'DC winding loss'}; excludes core loss` });
    for (const q of l.outputs) out.push({ k: `${q.name} loaded voltage`, v: eng(q.voltage, 'V', 4), sub: `${q.mode}; ${eng(q.current, 'A', 3)}` });
  }
  if (a.tapTurns) out.push({ k: 'Turns per tapped half', v: String(a.tapTurns) });
  if (r.core) out.push({ k: 'Core AL', v: eng(r.core.AL, 'H/turn²', 4) }, { k: 'Peak core flux', v: eng(r.core.Bpeak, 'T', 4) }, { k: 'Flux / design limit', v: `${num(r.core.fluxUtilization * 100, 1)}%` }, { k: 'Estimated core loss', v: eng(r.core.loss, 'W', 3), sub: r.core.lossSource||'from entered loss density' });
  return out;
}
export function spec(c, r) {
  const a = r.analysis; if (!a) return [];
  const sections = [{ title: 'Transformer estimates', rows: [['Topology', TRANSFORMER_FAMILIES[c.family || 'aircore']], ['Model', r.model], ['Primary DC resistance', eng(a.R1, 'Ω', 4)], ['Secondary DC resistance', eng(a.R2, 'Ω', 4)], ['Primary leakage L (S shorted, other secondaries open)', eng(a.leakage, 'H', 4)], ['Open-secondary induced RMS voltage', eng(a.induced, 'V', 4)], ['Voltage assumption', 'Sinusoidal imposed primary current, open secondaries']] }];
  if (a.loaded) {
    const l = a.loaded;
    sections[0].rows = sections[0].rows.filter(row => !['Open-secondary induced RMS voltage', 'Voltage assumption'].includes(row[0]));
    sections.push({ title: 'Loaded sinusoidal circuit', rows: [
      ['Source', `${eng(c.sourceVoltage, 'V', 4)} RMS; R=${eng(c.sourceR, 'Ω', 4)}, X=${eng(c.sourceX, 'Ω', 4)}`],
      ['Primary terminal voltage / current', `${eng(l.primaryVoltage, 'V', 4)} / ${eng(l.primaryCurrent, 'A', 4)}`],
      ['Transformer real input power', eng(l.inputPower, 'W', 4)], ['Total load power', eng(l.outputPower, 'W', 4)],
      ['Circuit winding loss', eng(l.copperLoss, 'W', 4)], ['Source resistance loss', eng(l.sourceLoss, 'W', 4)],
      ['Scope', `Linear sinusoidal loads, ${c.lossModel==='ac'?'estimated AC + DC':'DC'} copper resistance. Core dissipation and capacitance evaluated separately.`],
    ] });
    for (const q of l.outputs) sections.push({ title: `${q.name} loaded output`, rows: [
      ['Termination', q.mode], ['RMS voltage / current', `${eng(q.voltage, 'V', 4)} / ${eng(q.current, 'A', 4)}`],
      ['Voltage phase relative to source', `${num(q.phaseDeg, 2)}°`], ['Real load power', eng(q.power, 'W', 4)],
      ['All-secondaries-open voltage', eng(q.openVoltage, 'V', 4)],
      ['Regulation (Vopen − Vload) / Vload', q.regulation == null ? '—' : `${num(q.regulation * 100, 2)}%`],
    ] });
  }
  if (!r.windings) {
    sections[0].rows.push(['Terminals', '1 (dot), 2 primary; 3 (dot), 4 secondary'], ['Breakout', 'Inner terminals require insulated jumpers']);
    return sections;
  }
  sections[0].rows[0]=['Configuration',transformerName(c)];
  if(a.branchCurrents)sections.push({title:'Solved winding branches',rows:r.network.branches.map((q,i)=>[q.name,`${eng(Math.hypot(...a.branchCurrents[i]),'A',4)} RMS · ${eng(q.resistance,'Ω',4)} DC`])});
  if(a.capacitance)sections.push({title:'Capacitance estimate',rows:[['Total',eng(a.capacitance.value,'F',4)],['Method',a.capacitance.source],...a.capacitance.pairs.map(q=>[q.pair,eng(q.value,'F',4)]),['Scope','Adjacent-layer overlap; excludes fringing and distributed resonance. Measured total overrides only the aggregate.']]});
  if(r.assembly)sections.push({title:'Catalog assembly',rows:[['Core',r.assembly.name],['Parts',r.assembly.parts.join(' + ')],['Envelope',`${r.assembly.width} × ${r.assembly.depth} × ${r.assembly.height} mm`],['Required cutouts',String(r.assembly.openings.length)],['Destination','Check live board or board file; direct placement does not cut board edges.']]});
  sections.push({ title: 'Layer assignment', rows: r.art.meta.stack.map(s => [s.layer, `${s.winding} · z=${num(s.z, 3)} mm`]) });
  sections.push({ title: 'Winding totals and terminals', rows: r.windings.map((q, i) => [q.name, `${q.turns} turns; ${eng(a.resistances[i], 'Ω', 4)}; ${q.net}; ${q.terminals.join(', ')}`]) });
  const pairs = [];
  for (let i = 0; i < r.windings.length; i++) for (let j = i; j < r.windings.length; j++) pairs.push([`${r.windings[i].name} ↔ ${r.windings[j].name}`, `${eng(a.matrix[i][j], 'H', 4)}; k=${num(a.coupling[i][j], 4)}`]);
  sections.push({ title: 'Inductance / coupling matrix', rows: pairs });
  if (!a.loaded) sections.push({ title: 'Open-secondary outputs', rows: a.outputs.map(q => [q.name, `Np:Ns ${num(q.ratio, 3)}:1; ${eng(q.induced, 'V', 4)} at imposed primary current`]) });
  if (r.core) sections.push({ title: 'Core assumptions', rows: [['Material', r.core.material], ['Relative permeability', num(r.core.muR, 0)], ['Core AL', eng(r.core.AL, 'H/turn²', 4)], [a.loaded ? 'Peak flux from solved currents' : 'Peak flux at supplied voltage', eng(r.core.Bpeak, 'T', 4)], ['Core loss', r.core.loss == null ? r.core.lossSource || 'Unknown: supply operating-point loss density' : eng(r.core.loss, 'W', 4)], ['Loss data', r.core.lossSource || 'Entered density'], ['Mechanical export', r.assembly ? 'Three core-leg cutouts in board export; verify destination before direct placement' : 'Post cutout in board export; add/verify manually for direct placement']] });
  return sections;
}
export const status = (c, r) => ({ algo: r.model, summary: r.analysis ? `${transformerName(c)} · Np:Ns ${num(r.analysis.ratio, 3)}:1 · k ${num(r.analysis.k, 3)}` : 'solving…' });
