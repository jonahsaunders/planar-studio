import { el, eng, num, specTable } from './controls.js';
import { LineChart, legendFor } from './charts.js';
import { Viewport } from './canvas.js';
import { bounds } from '../engine/artwork.js';
import { modelSignature } from '../engine/transformer-workflow.js';
import { importTransformerTest } from '../engine/transformer-measurements.js';
import { saveStudy, studyStatus, physicsSignature, recordId, designSnapshot } from '../engine/transformer-project.js';

export const button=(text,fn)=>el('button',{type:'button',class:'btn small',text,onClick:fn});
const hint=text=>el('p',{class:'hint',text});
const copy=x=>JSON.parse(JSON.stringify(x));
export function dialog(title,api) {
  if(api?.reviewHost){
    const host=api.reviewHost;host.dispose?.();const body=el('div',{class:'transformer-review-body'}),footer=el('footer'),cleanups=[];
    const close=()=>{cleanups.splice(0).forEach(fn=>fn());host.replaceChildren();host.hidden=true;api.overviewHost.hidden=false;api.overviewHost.closest('.transformer-page').scrollTop=0;[...api.overviewHost.querySelectorAll('button')].find(n=>!n.closest('[hidden]')&&n.getClientRects().length)?.focus();host.dispose=null;};
    host.dispose=close;api.overviewHost.hidden=true;host.hidden=false;
    host.append(el('h2',{text:title,tabindex:-1}),body,footer);footer.append(button('Back to overview',close));host.firstChild.focus();return {body,footer,close,cleanups};
  }
  const previous=document.activeElement,body=el('div',{class:'transformer-review-body'}),footer=el('footer'),cleanups=[];
  const node=el('div',{class:'scrim tools-scrim'},el('section',{class:'modal transformer-review',role:'dialog','aria-modal':'true','aria-label':title},el('header',{},el('h2',{text:title})),body,footer));
  const close=()=>{cleanups.forEach(fn=>fn());document.removeEventListener('keydown',keys);node.remove();previous?.focus();};
  const keys=e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){
    const focus=[...node.querySelectorAll('button,input,select,a[href]')].filter(n=>!n.disabled&&!n.hidden),first=focus[0],last=focus.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }};
  document.addEventListener('keydown',keys);footer.append(button('Close',close));document.body.append(node);footer.firstChild.focus();
  return {body,footer,close,cleanups};
}
export function jobs(d,api) {
  let worker=null,seq=0;const status=el('p',{role:'status',class:'hint'}),cancel=button('Cancel calculation',()=>{stop();status.textContent='Calculation canceled.';});cancel.hidden=true;
  const stop=()=>{seq++;worker?.terminate();worker=null;cancel.hidden=true;};d.cleanups.push(stop);d.footer.prepend(status,cancel);
  const currentSignature=()=>JSON.stringify([modelSignature(api.config()),api.config().requirements,api.config().scenarios,api.config().operatingRange,api.config().transformerTolerances,api.boardContext()]);
  return {status,invalidate(){stop();status.textContent='Settings changed. Run the study again.';},run(task,args,done){stop();const token=seq,signature=currentSignature();status.textContent='Calculating…';cancel.hidden=false;
    if(typeof Worker==='undefined'){status.textContent='This calculation requires Web Workers.';cancel.hidden=true;return;}
    worker=new Worker(new URL('../study-worker.js',import.meta.url),{type:'module'});
    worker.onerror=e=>{stop();status.textContent=e.message;};
    worker.onmessage=({data})=>{if(token!==seq)return;if(data.progress){status.textContent=`${data.progress.done}/${data.progress.total} · ${data.progress.message}`;return;}stop();if(data.error){status.textContent=data.error;return;}if(signature!==currentSignature()){status.textContent='Design changed. Run the study again.';return;}status.textContent='Calculation complete.';done(data.result);};
    worker.postMessage({task,args:{cfg:copy(api.config()),env:{board:api.boardContext(),name:api.designName()},...args}});
  }};
}
export function plots(d) {
  let charts=[];const clear=()=>{charts.forEach(c=>c.destroy());charts=[];};d.cleanups.push(clear);
  return {clear,add(host,title,x,series,unit,xLabel='Hz',log=true){const canvas=el('canvas',{'aria-label':title}),spec={x:{values:x,label:xLabel,log},y:{label:unit},series};
    const data=el('details',{},el('summary',{text:`${title} data table`})),table=el('table',{class:'transformer-table'},el('tr',{},el('th',{text:xLabel}),series.map(s=>el('th',{text:`${s.name} (${unit})`}))));
    x.forEach((f,i)=>table.append(el('tr',{},el('td',{text:xLabel==='Hz'?eng(f,'Hz',4):String(f)}),series.map(s=>el('td',{text:num(s.values[i],4)})))));data.append(table);
    const section=el('section',{class:'transformer-review-plot'},el('h3',{text:title}),canvas,legendFor(spec.series,el('div',{class:'chart-legend'})),data);host.append(section);const chart=new LineChart(canvas);chart.setSpec(spec);charts.push(chart);}};
}
export const scalar=(label,value,onChange)=>{
  const input=el('input',{type:'number',step:'any',value,'aria-label':label});input.addEventListener('change',()=>{const valid=input.value!==''&&Number.isFinite(Number(input.value));input.setCustomValidity(valid?'':'Enter a finite number.');input.setAttribute('aria-invalid',String(!valid));if(valid)onChange(Number(input.value));else input.reportValidity();});
  return el('label',{class:'transformer-scalar'},el('span',{text:label}),input);
};

export function openComparison(api) {
  const d=dialog('Compare transformer candidates',api),j=jobs(d,api),p=plots(d),output=el('div'),same=el('input',{type:'checkbox','aria-label':'Use current operating point for all candidates'});
  const run=()=>j.run('transformerCompare',{candidates:api.config().candidates||[],normalized:same.checked},result=>{
    p.clear();output.replaceChildren();if(result.conditionsDiffer)output.append(hint('Operating points differ. Enable the common operating point for a controlled comparison.'));
    const rows=result.rows,valid=rows.filter(q=>q.metrics),table=el('table',{class:'transformer-table'}),head=el('tr',{},el('th',{text:'Measure'}),rows.map(q=>el('th',{text:q.name})));table.append(head);
    const metrics=[['Output voltage','voltage','V'],['Copper loss','copper','W'],['Board area','area','mm²'],['Layers','layers',''],['Leakage','leakage','H'],['Interwinding C','capacitance','F'],['Flux margin','fluxMargin',''],['Frequency','frequency','Hz'],['Source','sourceVoltage','V']];
    table.append(el('tr',{},el('th',{text:'Best among these designs'}),rows.map(q=>el('td',{text:q.error||q.badges.join(' · ')||'—'}))));
    const format=(m,key,unit)=>m[key]==null?'—':key==='fluxMargin'?`${num(m[key]*100,1)}%`:key==='layers'?String(m[key]):key==='area'?`${num(m[key],1)} mm²`:eng(m[key],unit,4);
    for(const [label,key,unit] of metrics)table.append(el('tr',{},el('th',{text:label}),rows.map(q=>el('td',{text:q.metrics?format(q.metrics,key,unit):'Unavailable'}))));
    output.append(table);
    if(valid.length>1){const a=valid[0];output.append(hint(`Differences from ${a.name}: ${valid.slice(1).map(q=>`${q.name}: ${num(q.metrics.area-a.metrics.area,1)} mm² area, ${eng(q.metrics.copper-a.metrics.copper,'W',3)} copper loss, ${eng(q.metrics.leakage-a.metrics.leakage,'H',3)} leakage, ${q.metrics.capacitance==null||a.metrics.capacitance==null?'unknown':eng(q.metrics.capacitance-a.metrics.capacitance,'F',3)} interwinding capacitance`).join('; ')}.`));}
    if(valid.length){const x=valid[0].response.frequencies;
      for(const [title,key,unit] of [['Transfer gain','gain','dB'],['Transfer phase','phase','°'],['Copper loss','copper','W'],['Peak flux','flux','T']])p.add(output,title,x,valid.flatMap(q=>['gain','phase'].includes(key)?q.response.outputs.map(o=>({name:`${q.name} · ${o.name}`,values:o[key],unit})):[{name:q.name,values:q.response[key],unit}]),unit);
    }
    output.append(hint('Badges compare only the displayed candidates. Curves use the linear sinusoidal model; capacitance and core dissipation remain separate estimates.'));
  });
  same.addEventListener('change',run);d.body.append(el('label',{},same,' Use current operating point for all candidates'),output);run();
}

export function openVerification(api,kind,saved=null) {
  const tolerance=kind==='tolerance',d=dialog(tolerance?'Fabrication tolerance study':kind==='scenarios'?'Named operating conditions':'Operating envelope',api),j=jobs(d,api),p=plots(d),form=el('div',{class:'transformer-range-form'}),output=el('div');
  const key=tolerance?'transformerTolerances':'operatingRange',options=copy(api.config()[key]);
  form.addEventListener('change',()=>{output.replaceChildren();j.invalidate();});
  if(tolerance){for(const [field,label] of [['copper','Copper thickness ± (%)'],['spacing','Layer spacing ± (%)'],['al','Core AL ± (%)'],['samples','Samples (5–200)'],['seed','Repeatable random seed']])form.append(scalar(label,options[field],v=>options[field]=v));}
  else if(kind!=='scenarios') {
    form.append(hint('Minimum / nominal / maximum. All combinations are checked; the S load is resistive.'));
    for(const [field,label] of [['voltage','Input RMS voltage (V)'],['frequency','Frequency (Hz)'],['load','S load (Ω)'],['ambient','Ambient temperature (°C)']]){
      const row=el('fieldset',{},el('legend',{text:label}));['Minimum','Nominal','Maximum'].forEach((n,i)=>row.append(scalar(`${n} ${label}`,options[field][i],v=>options[field][i]=v)));form.append(row);
    }
    form.append(scalar('Maximum assembly temperature (°C)',options.maxTemperature,v=>options.maxTemperature=v));
    form.append(scalar('Maximum absolute regulation (%)',options.maxRegulation??20,v=>options.maxRegulation=v),hint(`Peak flux limit: ${api.config().coreFluxLimit} T (edit under Windings → Ferrite core and material). Regulation uses (Vopen − Vload) / Vload.`));
  }
  let config=saved?.config||copy(api.config());
  const show=result=>{
    p.clear();output.replaceChildren();const samples=result.samples||result.points;
    output.append(hint(`Report inputs: ${eng(config.sourceVoltage,'V',4)} source · ${eng(config.freq,'Hz',4)} · S ${eng(config.loadR,'Ω',4)} · ${config.tempC} °C copper. ${config.operatingLinked?'Linked to nominal requirements.':'Experiment override.'}`));
    output.append(el('h3',{text:`${result.passed}/${samples.length} pass · ${result.unknown} with unknown results`}),hint(result.scope),hint('Failures and unknown results can overlap. Unknown temperature or regulation is never counted as passing.'));
    const voltages=samples.map(q=>q.metrics?.voltage).filter(Number.isFinite).sort((a,b)=>a-b);
    if(voltages.length)output.append(specTable([['Output range',`${eng(voltages[0],'V',4)} – ${eng(voltages.at(-1),'V',4)}`],['Sample P5 / P50 / P95', [.05,.5,.95].map(f=>eng(voltages[Math.round(f*(voltages.length-1))],'V',4)).join(' / ')]]));
    if(result.sensitivity)output.append(el('h3',{text:'Sensitivity at each tolerance endpoint'}),specTable(result.sensitivity.map(q=>[q.key,q.error||`${eng(q.voltageSpan,'V',3)} output span · ${eng(q.lossSpan,'W',3)} loss span`])));
    const table=el('table',{class:'transformer-table'},el('tr',{},['Case','Output','Status'].map(text=>el('th',{text}))));
    samples.map((q,i)=>({q,i})).sort((a,b)=>Number(a.q.pass)-Number(b.q.pass)).slice(0,12).forEach(({q,i})=>table.append(el('tr',{},el('td',{text:q.name||(tolerance?`Sample ${i+1}`:`${q.voltage} V · ${q.frequency/1000} kHz · ${q.load} Ω · ${q.ambient} °C`)}),el('td',{text:eng(q.metrics?.voltage,'V',3)}),el('td',{text:q.pass?'Pass':[...q.issues.map(x=>x.message),...q.unknown].join(' ')}))));
    output.append(table,hint('First 12 cases, with failures and unknowns first. Download the full report for every sampled case.'),button('Download study report',()=>api.saveFile(`${api.designName()}-${kind}.json`,JSON.stringify({config,...result},null,2),'application/json')));
    if(samples.some(q=>q.metrics))p.add(output,'Output by case',samples.map((_,i)=>i+1),[{name:'S output',values:samples.map(q=>q.metrics?.voltage??null),unit:'V'}],'V','Case',false);
  };
  const run=button('Run study',()=>{if(![...form.querySelectorAll('input')].every(i=>i.reportValidity()))return;if(kind!=='scenarios')api.set(key,copy(options));config=copy(api.config());j.run(tolerance?'transformerTolerance':kind==='scenarios'?'transformerScenarios':'transformerEnvelope',{},result=>{api.set('studies',[...(api.config().studies||[]),saveStudy(config,kind,result,api.boardContext(),`${kind} · ${new Date().toLocaleString()}`)].slice(-20));saved=null;show(result);});});run.classList.add('primary');
  if(saved){d.body.append(hint(`${studyStatus(saved,api.config(),api.boardContext())} · Saved ${new Date(saved.date).toLocaleString()}. The report retains its original inputs.`),button('Restore study inputs',()=>api.applyDesign(saved.config,'Before restoring study revision')));show(saved.result);}
  d.body.append(form,run,output);
}

export function openMeasurements(api) {
  if((api.config().transformerTests||[]).some(t=>!t.id))api.set('transformerTests',api.config().transformerTests.map(t=>t.id?t:{...t,id:recordId()}));
  const d=dialog('Measure and calibrate',api),j=jobs(d,api),p=plots(d),output=el('div'),list=el('div'),kind=el('select',{'aria-label':'Measurement test'},['open','short','loaded'].map(value=>el('option',{value,text:{open:'1 · Open secondary',short:'2 · Short secondary',loaded:'3 · Loaded transfer'}[value]}))),fixture=el('input',{type:'text','aria-label':'Fixture and reference plane',placeholder:'Fixture and terminal reference plane'}),conditions={temperature:api.config().tempC};
  const prototype=el('input',{type:'text','aria-label':'Prototype identifier',placeholder:'Prototype or specimen identifier',value:api.config().prototypeName||'',maxlength:80}),selected=new Set(),pair=['open','short'].map(k=>el('select',{'aria-label':`${k} test for calibration`})),alternatives=el('div');
  prototype.addEventListener('change',()=>api.set('prototypeName',prototype.value));
  const guide=el('p',{class:'hint'}),explain=()=>guide.textContent=kind.value==='loaded'?'Connect the recorded source and loads. Import CSV Frequency (Hz), Gain_dB (Vout / source RMS). S21 is not equivalent. Source and load settings are saved with the test.':'Measure primary impedance at small signal with all additional outputs open. CSV Frequency (Hz), R (ohm), X (ohm), or a one-port .s1p. De-embed leads to the named reference plane.';kind.addEventListener('change',explain);explain();
  const file=el('input',{type:'file',accept:'.csv,.s1p','aria-label':'Transformer measurement file'});
  file.addEventListener('change',async()=>{const f=file.files[0];if(!f)return;try{if(f.size>8*1024*1024)throw new Error('Measurement files must be under 8 MB.');if((api.config().transformerTests||[]).length>=24)throw new Error('Archive the design or remove an unused test before importing more (maximum 24).');const recorded=copy(api.config()),recordedKind=kind.value,recordedConditions={...conditions,fixture:fixture.value,prototype:prototype.value};const test=importTransformerTest(await f.text(),f.name,recordedKind,recordedConditions,recorded);if(!d.body.isConnected)return;api.set('transformerTests',[...(api.config().transformerTests||[]),test]);render();j.status.textContent='Measurement, prototype and tested revision saved.';}catch(error){j.status.textContent=error.message;}});
  const render=()=>{list.replaceChildren();const tests=api.config().transformerTests||[];
    pair.forEach((s,i)=>{const value=s.value;s.replaceChildren(el('option',{value:'',text:`Choose ${i?'short':'open'} test…`}),...tests.filter(t=>t.kind===(i?'short':'open')).map(t=>el('option',{value:t.id,text:`${t.prototype||'Unassigned'} · ${t.data.name} · ${t.conditions.temperature} °C · ${new Date(t.date).toLocaleString()}`})));s.value=value;});
    for(const [index,test] of tests.entries()){const select=el('input',{type:'checkbox','aria-label':`Compare test ${index+1}: ${test.data.name}`,checked:selected.has(index)});select.addEventListener('change',()=>select.checked?selected.add(index):selected.delete(index));
      list.append(el('article',{class:'transformer-test'},el('label',{},select,el('strong',{text:` ${test.prototype||'Unassigned prototype'} · ${test.kind} · ${test.data.name}`})),hint(`${test.conditions.fixture} · ${test.conditions.temperature} °C · ${test.revision||"Legacy revision"} · ${test.date}`),button('Compare measured and predicted',()=>j.run('transformerTest',{test},r=>{p.clear();output.replaceChildren(hint(`RMSE ${eng(r.rmse,r.unit,3)}.${r.changed?' Design differs from the recorded test configuration.':''}`));p.add(output,`${test.kind} measurement`,r.xs,[{name:'Measured',values:r.actual,unit:r.unit},{name:'Estimated',values:r.predicted,unit:r.unit}],r.unit);})),button('Restore tested revision',()=>api.applyDesign(test.configuration,'Before restoring tested revision')),button('Remove test',()=>{api.set('transformerTests',api.config().transformerTests.filter(q=>q!==test));selected.clear();render();})));}
    alternatives.replaceChildren(el('h3',{text:'Retained calibrations'}));
    for(const fit of api.config().calibrations||[])alternatives.append(el('article',{class:'transformer-test'},el('strong',{text:fit.label}),hint(`${num(fit.result.residual*100,3)}% residual · ${fit.result.source.fixture} · ${fit.date}`),button('Review retained fit',()=>showFit(fit.result,fit.signature,fit.config)),button('Remove calibration record',()=>{api.set('calibrations',api.config().calibrations.filter(q=>q.id!==fit.id));render();})));
  };
  const showFit=(r,signature,config)=>{
    p.clear();output.replaceChildren(hint(r.scope),specTable([['Measured AL',eng(r.patch.coreALMeasured,'H/turn²',4)],['Measured leakage',eng(r.patch.measuredLeakage,'H',4)],['Relative fit residual',`${num(r.residual*100,3)}%`]]));
    r.fitted.forEach((q,i)=>p.add(output,q.name,q.xs,[{name:'Measured',values:q.actual,unit:q.unit},{name:'Before fit',values:r.baseline[i].predicted,unit:q.unit},{name:'After fit',values:q.predicted,unit:q.unit}],q.unit));
    output.append(button('Restore calibration baseline',()=>api.applyDesign(config,'Before restoring calibration baseline')),button('Apply measured calibration',()=>{if(signature!==physicsSignature(api.config(),true)){j.status.textContent='Geometry changed. Restore the tested revision or fit again before applying.';return;}api.applyDesign({...r.patch,calibration:{source:r.source,residual:r.residual,scope:r.scope,signature:modelSignature({...api.config(),...r.patch})}},'Before measured calibration');d.close();}));
  };
  const calibrate=button('Fit AL and leakage from open / short tests',()=>{if(pair.some(s=>!s.value)){j.status.textContent='Choose the exact open and short tests to fit.';return;}const signature=physicsSignature(api.config(),true),config=designSnapshot(api.config()),tests=pair.map(s=>api.config().transformerTests.find(t=>t.id===s.value));j.run('transformerCalibrate',{tests},r=>{const fit={id:recordId(),label:`${r.source.prototype||'Prototype'} · ${r.source.frequency/1000} kHz`,date:new Date().toISOString(),signature,config,result:r};api.set('calibrations',[...(api.config().calibrations||[]),fit].slice(-12));render();showFit(r,signature,config);});});
  const compare=button('Compare selected prototypes',()=>j.run('transformerPrototypes',{tests:[...selected].map(i=>api.config().transformerTests[i]).filter(Boolean)},r=>{p.clear();output.replaceChildren(hint(r.conditionsDiffer?'Fixture or temperature differs. Interpret this as an uncontrolled comparison.':'Matching fixture and temperature. Curves use the common measured frequency range without extrapolation.'));p.add(output,'Prototype comparison',r.xs,r.series,r.unit);}));
  d.body.append(hint('Measurements append to the prototype history. Each retains the tested design, fixture and temperature. Calibration changes AL and leakage only; alternative fits stay available.'),el('label',{},'Prototype identifier',prototype),kind,guide,el('label',{},'Fixture and reference plane',fixture),scalar('Measured copper temperature (°C)',conditions.temperature,v=>conditions.temperature=v),file,list,compare,el('h3',{text:'Choose a matched calibration pair'}),...pair,calibrate,alternatives,output);render();
}

export function openPlacementReview(api, kind, makeReview) {
  const transformer = kind === 'transformer';
  const d = dialog(`Review ${kind} placement`, transformer ? api : null);
  const status = el('p', { role: 'status', class: 'hint' });
  const details = el('div'), findings = el('div'), mapping = el('div');
  const pose = el('div', { class: 'transformer-placement-pose' });
  const canvas = el('canvas', { 'aria-label': 'Destination board and placement findings' });
  const wrap = el('div', { class: 'transformer-board-preview' }, canvas);
  const designId = api.designId();
  const origin = [...(api.config().placementOrigin || [0, 0])];
  let snapshot, review, view, fitted = false, request = 0;
  const place = button(`Place reviewed ${kind}`, () => {
    if (!review?.ready || !review.revision) return;
    d.close();
    api.placeReviewed(review);
  });
  place.disabled = true;
  d.footer.prepend(place);

  function inspect() {
    place.disabled = true;
    review = null;
    if (!snapshot || !d.body.isConnected) return;
    if (api.designId() !== designId) {
      status.textContent = 'The active design changed. Open a new placement review.';
      return;
    }
    try {
      const result = api.solveDesign();
      review = {
        ...makeReview(api.config(), result, snapshot), revision: snapshot.revision,
        designId, signature: JSON.stringify(api.config()),
      };
      const count = review.issues.length;
      status.textContent = `${snapshot.name || 'Live KiCad board'} · ${count ? `${count} findings` : 'Supported checks passed'} · ${review.warnings.length} warnings`;
      const rows = [
        ['Origin (KiCad mm)', origin.join(', ')],
        ['Rotation (clockwise)', `${api.config().placementRotation || 0}°`],
        ['Destination copper layers', review.layers.filter(l => l.endsWith('.Cu')).join(', ')],
        ['Design nets', review.requiredNets.join(', ')],
        ['Replacement preview', `${review.replacement.removed} items to remove · ${review.replacement.added} primitives to add`],
      ];
      if (transformer) rows.push(['Core cutouts', `${review.cutouts.results.filter(q => q.found).length}/${review.cutouts.results.length} found`]);
      details.replaceChildren(specTable(rows));
      if (review.replacement.removed) details.append(hint('Gray copper will be replaced, including edits to previously generated items.'));
      if (transformer) {
        details.append(el('h3', { text: 'Terminal placement' }),
          specTable(review.terminals.map(q => [`${q.name} · ${q.net}`, `${num(q.x, 3)}, ${num(q.y, 3)} mm`])), hint(review.scope));
        mapNets(result);
      }
      view ||= new Viewport(canvas, { onHandleDrag: (_, x, y) => updateOrigin([x, -y]) });
      view.setArtwork(review.preview, [
        ['Board', '#526276'], ['Edge', '#c7d2dd'], ['Design', '#ee9c48'],
        ['Previous placement', '#8e98a6'], ['Conflict', '#fb4d66'],
      ]);
      if (!fitted) { view.fit(bounds(review.preview)); fitted = true; }
      view.setHandles([{ id: 'origin', x: origin[0], y: -origin[1], hint: 'Move origin', cursor: 'move' }]);
      findings.replaceChildren();
      for (const issue of review.issues) {
        const row = button(issue.message, () => {
          const [x, y] = issue.point;
          view.fit({ x0: x - 3, x1: x + 3, y0: y - 3, y1: y + 3, w: 6, h: 6 });
        });
        row.disabled = !issue.point;
        findings.append(row);
      }
      review.warnings.forEach(w => findings.append(hint(typeof w === 'string' ? w : w.message)));
      place.disabled = !review.ready || !review.revision;
    } catch (err) {
      review = null;
      status.textContent = err.message;
    }
  }

  function mapNets(result) {
    mapping.replaceChildren(el('h3', { text: 'Map winding nets' }));
    const ports = result.art.ports, winding = p => p.winding || p.name[0];
    for (const name of new Set(ports.map(winding))) {
      const current = ports.find(p => winding(p) === name).net;
      const select = el('select', { 'aria-label': `${name} destination net` },
        [...new Set([current, ...review.nets])].map(net => el('option', { value: net, text: net })));
      select.value = current;
      select.addEventListener('change', () => {
        const error = api.tryGeometryPatch({ windingNets: { ...api.config().windingNets, [name]: select.value } });
        if (error) { status.textContent = error; select.value = current; }
        else inspect();
      });
      mapping.append(el('label', {}, `${name} winding`, select));
    }
  }

  const refresh = button('Read live KiCad board', async () => {
    const id = ++request;
    refresh.disabled = true;
    place.disabled = true;
    snapshot = null;
    status.textContent = 'Reading the open board…';
    try {
      const loaded = await api.readPlacementSnapshot(designId);
      if (id === request && d.body.isConnected) { snapshot = loaded; fitted = false; inspect(); }
    } catch (err) {
      if (id === request) status.textContent = err.message;
    } finally {
      refresh.disabled = !api.canRefreshBoard();
    }
  });
  refresh.disabled = !api.canRefreshBoard();
  const file = el('input', { type: 'file', accept: '.kicad_pcb', 'aria-label': 'Destination KiCad board file' });
  file.addEventListener('change', async () => {
    const selected = file.files[0];
    if (!selected) return;
    const id = ++request;
    place.disabled = true;
    snapshot = null;
    try {
      const text = await selected.text();
      if (id !== request || !d.body.isConnected) return;
      snapshot = { text, name: selected.name };
      fitted = false;
      inspect();
    } catch (err) {
      if (id === request) status.textContent = err.message;
    }
  });
  function updateOrigin(next) {
    const grid = api.config().placementGrid || 0.5;
    next.forEach((value, i) => { origin[i] = Math.round(value / grid) * grid; });
    api.set('placementOrigin', [...origin]);
    pose.querySelectorAll('[data-axis]').forEach(input => { input.value = origin[Number(input.dataset.axis)]; });
    inspect();
  }
  ['X', 'Y'].forEach((axis, i) => {
    const control = scalar(`Placement origin ${axis} (mm)`, origin[i], value => {
      const next = [...origin]; next[i] = value; updateOrigin(next);
    });
    control.querySelector('input').dataset.axis = i;
    pose.append(control);
  });
  pose.append(scalar('Clockwise rotation (degrees)', api.config().placementRotation || 0, value => {
    api.set('placementRotation', ((value % 360) + 360) % 360); inspect();
  }), scalar('Placement snap grid (mm)', api.config().placementGrid || 0.5, value => {
    if (value < 0.01 || value > 10) { status.textContent = 'Grid must be between 0.01 and 10 mm.'; return; }
    api.set('placementGrid', value); inspect();
  }));
  d.body.append(hint('Set the origin and review clearance, winding contacts and replacement items. Use a live board snapshot to place, or open a board file for a preview. Run KiCad DRC after placement.'),
    pose, refresh, file, status, mapping, details, wrap, findings);
  d.cleanups.push(() => view?.destroy());
  if (api.canRefreshBoard()) refresh.click();
}
