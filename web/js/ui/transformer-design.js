import { el, eng, num, specTable } from './controls.js';
import { candidateSnapshot } from '../engine/transformer-studies.js';
import { transformerMode } from '../engine/transformer-config.js';
import { CORE_CATALOG, corePresetPatch, checkCoreCutouts } from '../engine/transformer-cores.js';
import { parseBoard } from '../engine/boardcheck.js';
import { N87_SOURCE } from '../engine/transformer-physics.js';
import { openComparison } from './transformer-review.js';
import { presetPicker } from './transformer-workspace.js';
import { searchSignature } from '../engine/transformer-project.js';

const colors={P:'#e99158',S:'#5dabdf',S2:'#b69beb',S3:'#7cc5a1'};
const button=(text,fn)=>el('button',{type:'button',class:'btn small',text,onClick:fn});
const svgNode=(tag,attrs={},text='')=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));n.textContent=text;return n;};

export function transformerPreview(c,r,api) {
  if(!r.windings)return null;
  const box=el('section',{class:'side-section transformer-preview'},el('h3',{text:'Winding stack & connections'}));
  const stack=r.art.meta.stack, height=52+stack.length*32;
  const svg=svgNode('svg',{viewBox:`0 0 310 ${height}`,role:'img','aria-label':'Front-to-back winding cross-section, with copper heights'});
  svg.append(svgNode('rect',{x:92,y:20,width:202,height:height-38,rx:5,fill:'var(--surface-2, #252c33)',stroke:'var(--line, #52606a)'}));
  stack.forEach((s,i)=>{
    const y=36+i*32,group=svgNode('g',{role:'button',tabindex:0,'aria-label':`Select ${s.layer} ${s.winding}`,'data-transformer-layer':s.layer});
    group.append(svgNode('rect',{x:92,y:y-9,width:202,height:18,rx:3,fill:colors[s.winding]}));
    group.append(svgNode('text',{x:4,y:y+4,fill:'currentColor','font-size':11},s.layer));
    group.append(svgNode('text',{x:101,y:y+4,fill:'#101820','font-size':11,'font-weight':600},`${s.winding} · z ${num(s.z,3)} mm`));
    const select=()=>api.focusWinding(s.layer);group.addEventListener('click',select);group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}});svg.append(group);
  });
  box.append(svg,el('p',{class:'hint',text:'Spacing shown schematically; labeled heights are physical. Select a layer to follow its copper and terminal connections.'}));
  const schematic=el('div',{class:'transformer-schematic'});
  for(const q of r.windings){
    const row=el('div',{class:'schematic-winding'},el('strong',{text:`${q.name}+ ● → ${q.name}− · ${q.turns} turns · ${q.connection}`}));
    const sections=el('div',{class:`schematic-sections ${q.connection}`});
    q.sections.forEach((s,i)=>{
      const b=button(`${s.layer}: ${s.turns} turns`,()=>api.focusWinding(s.layer));b.dataset.transformerLayer=s.layer;b.style.borderColor=colors[q.name];sections.append(b);
      if(q.name==='S'&&r.analysis.tapTurns&&i+1===q.sections.length/2)sections.append(el('span',{class:'tap-label',text:'↳ S_CT'}));
    });
    row.append(sections);schematic.append(row);
  }
  box.append(schematic,button('Show all copper',()=>api.focusWinding(null)));
  if(r.assembly) box.append(assemblyPreview(c,r,api));
  return box;
}

function assemblyPreview(c,r,api) {
  const p=r.assembly, box=el('section',{class:'core-assembly'},el('h3',{text:'Core assembly'}));
  const svg=svgNode('svg',{viewBox:'0 0 310 150',role:'img','aria-label':`${p.name} assembled cross-section`});
  const scale=6,x=155-p.width*scale/2, y=24, thickness=(p.height-p.windowHeight)/2*scale, gap=p.windowHeight*scale;
  svg.append(svgNode('rect',{x,y,width:p.width*scale,height:thickness,fill:'#78848d'}));
  svg.append(svgNode('rect',{x,y:y+thickness+gap,width:p.width*scale,height:thickness,fill:'#78848d'}));
  for(const px of [x,155-p.postW*scale/2,x+(p.width-p.outerLegW)*scale])svg.append(svgNode('rect',{x:px,y:y+thickness,width:(px===155-p.postW*scale/2?p.postW:p.outerLegW)*scale,height:gap,fill:'#78848d'}));
  svg.append(svgNode('rect',{x:15,y:y+thickness+(gap-c.boardT*scale)/2,width:280,height:c.boardT*scale,fill:'#e99158'}));
  // Redraw core legs over the PCB to represent the three machined openings.
  for(const px of [x,155-p.postW*scale/2,x+(p.width-p.outerLegW)*scale])svg.append(svgNode('rect',{x:px,y:y+thickness,width:(px===155-p.postW*scale/2?p.postW:p.outerLegW)*scale,height:gap,fill:'#78848d'}));
  svg.append(svgNode('text',{x:15,y:140,fill:'currentColor','font-size':11},`${num(p.width,2)} × ${num(p.depth,2)} × ${num(p.height,2)} mm · PCB ${c.boardT} mm`));
  box.append(svg,el('p',{text:p.name}),el('p',{class:'hint',text:`${p.parts.join(' + ')}. ${p.mounting}`}),
    el('a',{href:p.source,target:'_blank',rel:'noopener',text:'Manufacturer drawing & tolerances'}),
    el('a',{href:N87_SOURCE,target:'_blank',rel:'noopener',text:'N87 material and loss data (100 °C)'}),
    el('p',{class:'hint',text:'Core and copper clearances fit. Three leg openings are included in the board export. Direct placement does not cut the board.'}));
  const status=el('p',{role:'status',class:'hint',text:'Destination cutouts: not checked.'});
  const inspect=(text,source)=>{try{const result=checkCoreCutouts(r.assembly.openings,parseBoard(text),c.placementOrigin||[0,0]);status.textContent=`${source}: ${result.complete?'all three matching closed cutouts found':`missing/mismatched openings ${result.results.filter(x=>!x.found).map(x=>x.opening).join(', ')}`}. Checked at placement origin ${c.placementOrigin||[0,0]}.`;}catch(e){status.textContent=e.message;}};
  const live=button('Check cutouts in KiCad',async()=>{live.disabled=true;status.textContent='Reading board…';try{const bridge=await import('../bridge.js');const result=await bridge.call('board.snapshot',{});inspect(result.text,'Live board snapshot');}catch(e){status.textContent=`Cutouts not verified: ${e.message}`;}finally{live.disabled=!api.canRefreshBoard();}});
  live.disabled=!api.canRefreshBoard();
  const file=el('input',{type:'file',accept:'.kicad_pcb',hidden:true,'aria-label':'Board file for core cutout check'});file.addEventListener('change',async()=>{if(file.files[0])inspect(await file.files[0].text(),file.files[0].name);});
  box.append(live,button('Check board file…',()=>file.click()),file,status);
  return box;
}

export function designWorkflow(panel,api) {
  const node=el('div',{class:'transformer-workflow'}), requirements=el('div',{class:'transformer-requirements'}),locks=el('fieldset',{class:'transformer-locks'},el('legend',{text:'Keep fixed during search'}));
  for(const [key,label] of [['core','Core'],['turns','Turns'],['widths','Widths'],['stack','Layers and heights'],['connections','Connections'],['footprint','Footprint']]){
    const input=el('input',{type:'checkbox','aria-label':`Lock ${label.toLowerCase()}`,dataset:{lock:key}});input.addEventListener('change',()=>api.set('searchLocks',{...panel.state.searchLocks,[key]:input.checked}));locks.append(el('label',{},input,` ${label}`));
  }
  let worker=null,generation=0,signature='', configAtRun='';
  const status=el('p',{class:'hint',role:'status'}),results=el('div',{class:'transformer-search-results'});
  const fields=[['voltage','Nominal input RMS voltage (V)',.01,1000],['outputVoltage','Target output RMS voltage',.01,1000],['outputCurrent','Target output RMS current',.0001,100],['frequency','Design frequency (Hz)',100,1e7],['diameter','Maximum board width / height (mm)',5,200],['layers','Available PCB layers',2,8],['voltageTolerance','Output voltage tolerance (%)',.1,50]];
  for(const[key,label,min,max]of fields){const input=el('input',{type:'number',required:true,min,max,step:key==='layers'?2:'any','aria-label':label});input.dataset.requirement=key;
    input.addEventListener('change',()=>{const valid=input.reportValidity();input.setAttribute('aria-invalid',String(!valid));if(!valid)return;api.set('requirements',{...panel.state.requirements,[key]:Number(input.value)});});
    requirements.append(el('label',{},el('span',{text:label}),input));}
  const extra=el('div',{class:'transformer-extra-outputs'});
  for(const name of ['S2','S3']){
    const enabled=el('input',{type:'checkbox','aria-label':`Require ${name} output`}),box=el('fieldset',{},el('legend',{},el('label',{},enabled,` ${name} output`)));
    const update=patch=>api.set('requirements',{...panel.state.requirements,outputs:{...panel.state.requirements.outputs,[name]:{voltage:3.3,current:.1,tolerance:10,...panel.state.requirements.outputs?.[name],...patch}}});
    enabled.addEventListener('change',()=>update({enabled:enabled.checked}));enabled.dataset.output=name;
    for(const [key,label] of [['voltage','Target RMS voltage (V)'],['current','Target RMS current (A)'],['tolerance','Voltage tolerance (%)']]){const input=el('input',{type:'number',min:.0001,step:'any','aria-label':`${name} ${label}`});input.dataset.output=name;input.dataset.outputField=key;input.addEventListener('change',()=>{if(input.reportValidity()&&input.value)update({[key]:Number(input.value)});});box.append(el('label',{},label,input));}extra.append(box);
  }
  const stop=()=>{generation++;worker?.terminate();worker=null;run.disabled=false;cancel.hidden=true;};
  const cancel=button('Cancel search',()=>{stop();status.textContent='Search canceled.';});cancel.hidden=true;
  const run=button('Find feasible starting designs',()=>{
    stop();const token=generation;results.replaceChildren();status.textContent='Searching turns, stacks and board sizes…';run.disabled=true;cancel.hidden=false;
    const cfg=JSON.parse(JSON.stringify(panel.state));delete cfg.candidates;configAtRun=searchSignature(cfg,api.boardContext());
    if(typeof Worker==='undefined'){stop();status.textContent='Design search needs a browser with Web Worker support.';return;}
    worker=new Worker(new URL('../study-worker.js',import.meta.url),{type:'module'});
    worker.onerror=e=>{if(token===generation){stop();status.textContent=`Search failed: ${e.message}`;}};
    worker.onmessage=({data})=>{
      if(token!==generation)return;if(data.progress){status.textContent=`${data.progress.done}/${data.progress.total} · ${data.progress.message}`;return;}
      stop();if(data.error){status.textContent=data.error;return;}
      api.set('searchResults',{signature:configAtRun,result:data.result});renderSearch(data.result);
    };
    worker.postMessage({task:'transformerDesign',args:{cfg,requirements:cfg.requirements,env:{board:api.boardContext(),name:api.designName()}}});
  });run.classList.add('primary');
  const renderSearch=result=>{const data={result};results.replaceChildren();
      status.textContent=`${data.result.message} ${data.result.tried} combinations checked.`;
      const diagnostics=el('details',{},el('summary',{text:'Search exclusions and closest designs'}),el('p',{class:'hint',text:'A trial can violate more than one constraint; counts overlap.'}),specTable(Object.entries(data.result.rejected).map(([key,n])=>[key,String(n)])));
      for(const [reason,n] of Object.entries(data.result.geometryReasons||{}).sort((a,b)=>b[1]-a[1]).slice(0,5))diagnostics.append(el('p',{class:'hint',text:`${n} trials: ${reason}`}));
      for(const q of data.result.nearMisses||[])diagnostics.append(el('p',{class:'hint',text:`${q.name}: ${q.issues.map(i=>`${i.message} Actual ${num(i.actual,3)}, limit ${num(i.limit,3)}.`).join(' ')}`}));
      results.append(diagnostics);
      for(const s of data.result.suggestions||[])results.append(button(`Try tested requirement change: ${Object.entries(s.patch).map(([k,v])=>`${k} → ${v}`).join(', ')}`,()=>{api.set('requirements',{...panel.state.requirements,...s.patch});status.textContent='Requirement updated. Search again to refresh the candidates.';results.replaceChildren();}));
      const frontier=data.result.frontier||data.result.candidates;
      if(frontier.length){const svg=svgNode('svg',{viewBox:'0 0 680 300',role:'group','aria-label':'Candidate board area versus worst-case copper loss. Select a point to inspect its candidate.'}),areas=frontier.map(q=>q.metrics.area),losses=frontier.map(q=>q.robust?.worstCopper??q.metrics.copper),minA=Math.min(...areas)*.9,maxA=Math.max(...areas)*1.05,maxL=Math.max(...losses)*1.15||1,selection=el('p',{class:'hint',role:'status',text:'Select or focus a point to read its exact values. Enter opens its candidate card.'});
        svg.append(svgNode('path',{d:'M60 20V255H655',fill:'none',stroke:'currentColor'}),svgNode('text',{x:300,y:290,fill:'currentColor'},'Board area (mm²)'),svgNode('text',{x:65,y:18,fill:'currentColor'},'Worst-case copper loss (W)'));
        for(let i=0;i<=4;i++){svg.append(svgNode('text',{x:60+(i*595/4),y:274,fill:'currentColor','font-size':11},num(minA+(maxA-minA)*i/4,0)),svgNode('text',{x:4,y:255-i*220/4,fill:'currentColor','font-size':11},num(maxL*i/4,3)));}
        frontier.forEach((q,i)=>{const x=60+(areas[i]-minA)/(maxA-minA||1)*595,y=255-losses[i]/maxL*220,label=`Candidate ${i+1}: ${num(areas[i],1)} mm², ${eng(losses[i],'W',3)} worst copper, ${num((q.robust?.worstMargin??0)*100,1)}% margin`,point=svgNode('circle',{cx:x,cy:y,r:7,fill:(q.robust?.worstMargin??0)<.1?'var(--warn)':'var(--accent)',tabindex:0,role:'button','aria-label':label});point.append(svgNode('title',{},label));const inspect=()=>{selection.textContent=label;const card=results.querySelector(`[data-candidate="${i}"]`);card?.scrollIntoView?.({block:'center'});card?.querySelector('button')?.focus();};point.addEventListener('focus',()=>selection.textContent=label);point.addEventListener('pointerenter',()=>selection.textContent=label);point.addEventListener('click',inspect);point.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();inspect();}});svg.append(point);});results.append(el('div',{class:'transformer-pareto'},svg,selection),el('p',{class:'hint',text:'Candidate cards provide exact values and keyboard access to overlapping points. Margin is the smallest remaining output-voltage or peak-flux allowance across selected cases. Unknown thermal results remain labeled.'}));}
      for(const [i,candidate] of frontier.entries()){const card=el('article',{class:'transformer-candidate',dataset:{candidate:i}},el('strong',{text:`${i+1}. ${candidate.name}`}),
        el('p',{class:'hint',text:`${eng(candidate.metrics.voltage,'V',3)} output · ${eng(candidate.metrics.copper,'W',3)} copper loss · ${num(candidate.metrics.width,1)} × ${num(candidate.metrics.height,1)} mm`}));
        card.append(button('Apply starting design',()=>{
          if(searchSignature(panel.state,api.boardContext())!==configAtRun){status.textContent='Settings changed. Run the search again before applying a result.';return;}
          api.applyDesign({...candidate.config,candidates:panel.state.candidates,requirements:panel.state.requirements},'Before applying search candidate');api.navigateTransformer?.('windings');
        }));if(candidate.robust)card.append(el('p',{class:'hint',text:`Worst-case margin ${num(candidate.robust.worstMargin*100,1)}% · ${candidate.robust.passed}/${candidate.robust.points.length} cases pass · ${candidate.robust.unknown} unknown. Worst copper ${eng(candidate.robust.worstCopper,'W',3)}.`}));results.append(card);}
  };
  const observer=new window.MutationObserver(()=>{if(!node.isConnected){stop();observer.disconnect();}});
  queueMicrotask(()=>{if(node.isConnected)observer.observe(document.body,{childList:true,subtree:true});});
  const search=el('div',{class:'transformer-search'},el('p',{class:'hint',text:'Search nominal resistive loads plus selected named conditions. Vary turns, widths, connections, stacks and size within your locks. Unlock Core to include supported catalog assemblies.'}),locks,run,cancel,status,results);
  node.append(requirements,extra,el('div',{class:'transformer-next'},button('Explore candidates',()=>api.navigateTransformer('candidates'))),search);
  if(panel.state.searchResults){configAtRun=panel.state.searchResults.signature;renderSearch(panel.state.searchResults.result);}
  return {node,set:()=>{const next=JSON.stringify(panel.state.requirements);if(next!==signature){signature=next;for(const input of requirements.querySelectorAll('input'))input.value=panel.state.requirements[input.dataset.requirement];}
    locks.querySelectorAll('input').forEach(input=>input.checked=!!panel.state.searchLocks[input.dataset.lock]);
    extra.querySelectorAll('input').forEach(input=>{const q=panel.state.requirements.outputs?.[input.dataset.output]||{};if(input.type==='checkbox')input.checked=!!q.enabled;else {input.value=q[input.dataset.outputField]??({voltage:3.3,current:.1,tolerance:10}[input.dataset.outputField]);input.disabled=!q.enabled;input.parentElement.hidden=!q.enabled;}});
    if(worker&&searchSignature(panel.state,api.boardContext())!==configAtRun){stop();status.textContent='Settings changed; search canceled.';}
    if(!worker&&panel.state.searchResults&&searchSignature(panel.state,api.boardContext())!==configAtRun)status.textContent='Outdated search: settings changed. Run the search again before applying a result.';}};
}

export function candidateControls(panel,api) {
  const node=el('div',{class:'transformer-comparisons'}),list=el('div'),name=el('input',{type:'text',placeholder:'Candidate name','aria-label':'Candidate name',maxlength:80});
  const status=el('p',{class:'hint',role:'status'});
  const pin=button('Pin current design',()=>{const r=api.result();if(!r?.analysis){status.textContent='Wait for a valid solved design.';return;}const saved=panel.state.candidates||[];if(saved.length>=3){status.textContent='Remove a candidate before pinning another (maximum three).';return;}
    api.set('candidates',[...saved,candidateSnapshot(panel.state,r,name.value||`Candidate ${saved.length+1}`)]);name.value='';});
  node.append(name,pin,button('Compare table and curves',()=>openComparison(api)),status,list);
  let signature='';
  return {node,set:()=>{const candidates=panel.state.candidates||[],next=JSON.stringify(candidates);if(next===signature)return;signature=next;list.replaceChildren();
    const table=el('table',{class:'transformer-table'},el('tr',{},['Candidate','Output / copper loss'].map(text=>el('th',{text}))));
    candidates.slice(0,3).forEach((q,i)=>{const m=q.metrics,card=el('tr',{class:'transformer-candidate'},el('td',{},el('strong',{text:q.name}),button('Restore candidate',()=>api.applyDesign({...q.config,candidates:panel.state.candidates},'Before restoring candidate')),button('Remove candidate',()=>api.set('candidates',candidates.filter((_,j)=>j!==i)))),el('td',{text:`${eng(m.voltage,'V',3)} / ${eng(m.copper,'W',3)}`}));table.append(card);});
    if(candidates.length)list.append(table);
    if(candidates.length)list.append(el('p',{class:'hint',text:'Snapshots retain their own source, load and model settings. Compare candidates at the same operating point. Saved with the design and JSON export.'}));}};
}

export function corePicker(panel,api) {
  return presetPicker(panel,api,'Catalog core assembly',[{value:'custom',label:'Custom core'},...Object.entries(CORE_CATALOG).map(([value,p])=>({value,label:p.name}))],value=>value==='custom'?{corePreset:'custom',coreALMeasured:0,calibration:null}:{...corePresetPatch(value),coreALMeasured:0,calibration:null},'corePreset');
}
