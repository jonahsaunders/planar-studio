import { el, eng } from './controls.js';
import { changedFields } from '../engine/design-history.js';
import { assessTransformer, modelSignature } from '../engine/transformer-workflow.js';
import { button, openVerification, openMeasurements } from './transformer-review.js';
import { ledgerControls, scenarioControls, repairControls } from './transformer-project.js';

export function presetPicker(panel,api,label,options,patchFor,key) {
  const node=el('div'),select=el('select',{'aria-label':label},options.map(o=>el('option',{value:o.value,text:o.label}))),preview=el('div',{class:'transformer-preset-preview'});
  select.addEventListener('change',()=>{
    const patch=patchFor(select.value),fields=changedFields(panel.state,patch);preview.replaceChildren();
    if(!fields.length)return;
    preview.append(el('p',{class:'hint',text:'Review the fields this preset will replace. An automatic checkpoint preserves the previous design.'}));
    const text=v=>typeof v==='object'?JSON.stringify(v):String(v??'—');
    fields.forEach(k=>preview.append(el('p',{class:'hint',text:`${k.replace(/([A-Z])/g,' $1')}: ${text(panel.state[k])} → ${text(patch[k])}`})));
    preview.append(button('Apply preset',()=>api.applyDesign(patch,`Before ${label.toLowerCase()} preset`)),button('Cancel preset',()=>{preview.replaceChildren();select.value=panel.state[key];}));
  });
  node.append(select,preview);return {node,set:()=>{if(!preview.childNodes.length)select.value=panel.state[key]||'custom';}};
}

export function verificationControls(panel,api) {
  const ledger=ledgerControls(panel,api),repairs=repairControls(panel,api);
  return {node:el('div',{class:'transformer-actions'},el('p',{class:'hint',text:'Verify operating limits, fabrication variation, measured behavior and destination placement.'}),el('div',{class:'transformer-action-row'},button('Check operating envelope',()=>openVerification(api,'envelope')),button('Study fabrication tolerances',()=>openVerification(api,'tolerance')),button('Check named conditions',()=>openVerification(api,'scenarios')),button('Measure and calibrate',()=>openMeasurements(api)),button('Review board placement',()=>api.reviewPlacement())),ledger.node,repairs.node),set:()=>{ledger.set();repairs.set();}};
}
export function exportControls(panel,api) {
  return {node:el('div',{class:'transformer-actions'},el('p',{class:'hint',text:'Export a coordinated build package with KiCad copper, drawing, stack, connections, terminal table, core parts and an analysis dossier. The HTML dossier is ready to print.'}),button('Export build package and files',()=>api.openExport()),button('Review board placement',()=>api.reviewPlacement()))};
}

export function finishRail(panel,api) {
  panel.workflowStep=api.workflowStep;
  const stages=['requirements','candidates','windings','verify','export'],names=['Requirements','Candidates','Windings','Verify','Export'];
  const title=el('h1',{text:'Requirements'}),subtitle=el('p',{class:'hint'}),overview=el('div',{class:'transformer-overview'}),review=el('section',{class:'transformer-embedded',hidden:true}),page=el('section',{id:'transformer-page',class:'transformer-page',role:'tabpanel',tabindex:-1},el('header',{},title,subtitle),overview,review);
  document.getElementById('stage').append(page);api.reviewHost=review;api.overviewHost=overview;
  const map={'transformer-requirements':['requirements','candidates'],'drive':['requirements'],'source':['requirements'],'load-S':['requirements'],'load-S2':['requirements'],'load-S3':['requirements'],'transformer-candidates':['candidates'],'transformer-verification':['verify'],'transformer-sweeps':['verify'],'transformer-export':['export'],'designs':stages};
  for(const g of panel.groups){g._steps=map[g.dataset.key]||['windings'];if(['stack','core','transformer-physics'].includes(g.dataset.key))g.open=false;if(g.dataset.key!=='designs'&&g._steps[0]!=='windings')overview.append(g);}
  const scenarios=scenarioControls(panel,api);overview.append(scenarios.node);panel.fields.set('_scenarios',scenarios);
  const nav=el('nav',{class:'transformer-steps',role:'tablist','aria-label':'Transformer workflow','aria-orientation':'vertical'}),summary=el('div',{class:'transformer-summary',role:'status'}),undo=button('Undo',()=>api.undo()),redo=button('Redo',()=>api.redo()),checkpoints=el('select',{'aria-label':'Restore checkpoint'});
  stages.forEach((s,i)=>{const b=button(`${i+1} ${names[i]}`,()=>api.navigateTransformer(s));b.dataset.step=s;b.id=`transformer-tab-${s}`;b.setAttribute('role','tab');b.setAttribute('aria-controls',s==='windings'?'view':'transformer-page');nav.append(b);});
  nav.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const i=stages.indexOf(api.workflowStep()),next=e.key==='Home'?0:e.key==='End'?4:(i+(['ArrowRight','ArrowDown'].includes(e.key)?1:4))%5;api.navigateTransformer(stages[next]);nav.children[next].focus();});
  const node=el('section',{class:'transformer-navigation'},nav,el('div',{class:'transformer-history'},undo,redo),summary),checkpointRow=el('div',{class:'transformer-checkpoints'},checkpoints);
  checkpoints.addEventListener('change',()=>{if(checkpoints.value==='')return;const q=panel.state.checkpoints[Number(checkpoints.value)];if(q)api.applyDesign({...q.config,candidates:panel.state.candidates},`Before restoring ${q.label}`);});
  node.append(checkpointRow);panel.host.prepend(node);
  panel.fields.set('_transformerNavigation',{node,set:()=>{
    const step=api.workflowStep(),index=stages.indexOf(step);page.dataset.step=step;document.getElementById('app').dataset.transformerStep=step;page.hidden=step==='windings';title.textContent=names[index];page.setAttribute('aria-labelledby',`transformer-tab-${step}`);
    subtitle.textContent=['Set the nominal input, output targets and board limits.','Explore the size and loss tradeoffs, then compare your selected designs.','', 'Saved evidence, operating limits and prototype measurements.','Review board placement or export a coordinated build package.'][index];
    scenarios.node.hidden=!['requirements','verify','candidates'].includes(step);
    nav.querySelectorAll('button').forEach(b=>{const selected=b.dataset.step===step;b.setAttribute('aria-current',selected?'step':'false');b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
    undo.disabled=!api.historyState().past.length;redo.disabled=!api.historyState().future.length;
    checkpoints.replaceChildren(el('option',{value:'',text:'Restore an automatic checkpoint…'}),...(panel.state.checkpoints||[]).map((q,i)=>el('option',{value:i,text:`${new Date(q.date).toLocaleTimeString()} · ${q.label}`})));checkpointRow.hidden=!panel.state.checkpoints?.length;
  }});
  updateWorkflow(panel.state,api.result());
}

export function updateWorkflow(c,r,error) {
  const summary=document.querySelector('.transformer-summary');if(!summary)return;
  if(!r?.analysis){summary.textContent=error||'Calculating design…';return;}
  const a=assessTransformer(c,r);
  summary.replaceChildren(el('div',{},el('strong',{text:`Target ${eng(c.requirements.outputVoltage,'V',3)} → predicted ${eng(a.metrics.voltage,'V',3)}`})),el('div',{text:`Copper ${eng(a.metrics.copper,'W',3)} · core ${r.core?eng(r.core.loss,'W',3):'N/A'}`}),el('div',{text:a.metrics.voltage==null?'Select voltage drive to verify the target output.':a.limiting}));
  summary.append(el('div',{text:`${c.operatingLinked?'Nominal requirements':'Experiment override'} · ${eng(c.sourceVoltage,'V',3)} · ${eng(c.freq,'Hz',3)} · S ${c.loadMode==='load'?eng(c.loadR,'Ω',3):c.loadMode}`}));
  if(c.calibration?.signature&&c.calibration.signature!==modelSignature(c))summary.append(el('div',{text:'Design differs from its calibration conditions. Recheck measured parameters.'}));
}
