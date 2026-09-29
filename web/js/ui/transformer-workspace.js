import { el, eng } from './controls.js';
import { changedFields } from '../engine/design-history.js';
import { assessTransformer, modelSignature } from '../engine/transformer-workflow.js';
import { button, openVerification, openMeasurements } from './transformer-review.js';

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
  return {node:el('div',{class:'transformer-actions'},el('p',{class:'hint',text:'Verify operating limits, fabrication variation, measured behavior and destination placement.'}),button('Check operating envelope',()=>openVerification(api,'envelope')),button('Study fabrication tolerances',()=>openVerification(api,'tolerance')),button('Measure and calibrate',()=>openMeasurements(api)),button('Review board placement',()=>api.reviewPlacement()))};
}
export function exportControls(panel,api) {
  return {node:el('div',{class:'transformer-actions'},el('p',{class:'hint',text:'Export a coordinated build package with KiCad copper, drawing, stack, connections, terminal table, core parts and an analysis dossier. The HTML dossier is ready to print.'}),button('Export build package and files',()=>api.openExport()),button('Review board placement',()=>api.reviewPlacement()))};
}

export function finishRail(panel,api) {
  panel.workflowStep=api.workflowStep;
  const stages=['requirements','candidates','windings','verify','export'],names=['Requirements','Candidates','Windings','Verify','Export'];
  const map={'transformer-requirements':['requirements','candidates'],'drive':['requirements'],'source':['requirements'],'load-S':['requirements'],'load-S2':['requirements'],'load-S3':['requirements'],'transformer-candidates':['candidates'],'transformer-verification':['verify'],'transformer-sweeps':['verify'],'transformer-export':['export'],'designs':stages};
  for(const g of panel.groups){g._steps=map[g.dataset.key]||['windings'];if(['stack','core','transformer-physics'].includes(g.dataset.key))g.open=false;}
  const nav=el('nav',{class:'transformer-steps','aria-label':'Transformer workflow'}),summary=el('div',{class:'transformer-summary',role:'status'}),undo=button('Undo',()=>api.undo()),redo=button('Redo',()=>api.redo()),checkpoints=el('select',{'aria-label':'Restore checkpoint'});
  stages.forEach((s,i)=>{const b=button(`${i+1} ${names[i]}`,()=>api.navigateTransformer(s));b.dataset.step=s;nav.append(b);});
  const node=el('section',{class:'transformer-navigation'},nav,el('div',{class:'transformer-history'},undo,redo),summary),checkpointRow=el('div',{class:'transformer-checkpoints'},checkpoints);
  checkpoints.addEventListener('change',()=>{if(checkpoints.value==='')return;const q=panel.state.checkpoints[Number(checkpoints.value)];if(q)api.applyDesign({...q.config,candidates:panel.state.candidates},`Before restoring ${q.label}`);});
  node.append(checkpointRow);panel.host.prepend(node);
  panel.fields.set('_transformerNavigation',{node,set:()=>{
    nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',b.dataset.step===api.workflowStep()?'step':'false'));
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
  if(c.calibration?.signature&&c.calibration.signature!==modelSignature(c))summary.append(el('div',{text:'Design differs from its calibration conditions. Recheck measured parameters.'}));
}
