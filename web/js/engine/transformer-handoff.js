import { parseBoard, sexpr, checkPlacement } from './boardcheck.js';
import { checkCoreCutouts } from './transformer-cores.js';
import { modelSignature, assessTransformer } from './transformer-workflow.js';
import { exportKicadPcb, exportKicadMod, exportSvg } from './exporters.js';

export function transformerPreflight(c,r,text,context={},excluded=[]) {
  const board=parseBoard(text,excluded),root=sexpr(text),list=key=>root.filter(x=>Array.isArray(x)&&x[0]===key);
  const layers=(list('layers')[0]||[]).filter(Array.isArray).map(x=>x[1]).filter(n=>/\.Cu$/.test(n));
  const nets=[...new Set(list('net').map(x=>x[2]))];
  const required=[...new Set([...r.art.tracks,...r.art.pads].map(x=>x.net).filter(Boolean))];
  const origin=c.placementOrigin||[0,0],checked=checkPlacement(r.art,board,{origin,clearance:c.traceS,kind:'transformer'}),issues=[...checked.findings];
  for(const layer of r.layers)if(!layers.includes(layer))issues.push({type:'layer',layer,message:`Destination lacks ${layer}.`});
  for(const net of required)if(!nets.includes(net))issues.push({type:'net',net,message:`Create or map the ${net} net in KiCad.`});
  const openings=r.art.outline.slice(1).filter(q=>q.layer==='Edge.Cuts').map(q=>q.pts);
  const cutouts=checkCoreCutouts(openings,board,origin);
  cutouts.results.forEach((q,i)=>{if(!q.found){const pts=openings[i];issues.push({type:'cutout',message:`Required core opening ${i+1} is missing or different.`,point:[pts.reduce((s,p)=>s+p[0],0)/pts.length+origin[0],pts.reduce((s,p)=>s+p[1],0)/pts.length-origin[1]]});}});
  if(!board.loops.length)issues.push({type:'outline',message:'No complete destination board outline was found.'});
  return {...checked,issues,cutouts,layers,nets,requiredNets:required,signature:modelSignature(c),ready:issues.length===0&&checked.warnings.length===0,
    terminals:r.art.ports.map(p=>({name:p.name,net:p.net,x:p.x+origin[0],y:-p.y+origin[1]})),
    stack:r.art.meta.stack||r.layers.map(layer=>({layer})),destination:context.name||board.name,
    scope:'Supported geometric checks only. Live KiCad DRC and assembly inspection remain separate; direct placement does not cut board edges.'};
}

const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const table=rows=>`<table>${rows.map(row=>`<tr>${row.map(v=>`<td>${escape(v)}</td>`).join('')}</tr>`).join('')}</table>`;
export function transformerDossier(c,r,name='T1') {
  const assessment=assessTransformer(c,r),stack=r.art.meta.stack||[],total=stack.length*30+30;
  const diagram=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 ${total}">${stack.map((q,i)=>`<rect x="10" y="${i*30+5}" width="620" height="24" fill="${q.winding==='P'?'#efa96d':'#83bce8'}"/><text x="20" y="${i*30+22}" font-size="13">${escape(q.layer)} · ${escape(q.winding)} · z ${q.z.toFixed(4)} mm</text>`).join('')}</svg>`;
  const connections=(r.windings||[]).map(w=>[`${w.name}+ (dot) → ${w.name}−`,`${w.turns} turns`,w.connection,w.layers.join(w.connection==='parallel'?' ∥ ':' → '),w.terminals.join(', ')]);
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>${escape(name)} build dossier</title><style>body{font:15px system-ui;max-width:1000px;margin:30px auto;padding:20px;color:#172436}table{border-collapse:collapse;width:100%;margin:15px 0}td{border:1px solid #ccd5df;padding:8px;overflow-wrap:anywhere}svg{max-width:100%;max-height:650px}pre{white-space:pre-wrap}h2{margin-top:35px}@media print{h2{break-after:avoid}table,svg{break-inside:avoid}}</style></head><body><h1>${escape(name)} — transformer build dossier</h1><p>Generated ${new Date().toISOString()}. Same configuration and geometry as the accompanying copper files.</p><h2>Requested and predicted</h2>${table([['Target output (V)',c.requirements.outputVoltage],['Predicted output (V RMS)',assessment.metrics.voltage??'Unknown'],['Copper loss (W)',assessment.metrics.copper],['Core loss (W)',r.core?.loss??'Unknown / not applicable'],['Interwinding C (F)',assessment.metrics.capacitance],['Flux margin',assessment.metrics.fluxMargin??'Air core'],['Status',assessment.limiting]])}<h2>Copper drawing</h2>${exportSvg(r.art,{name,tolerance:c.tolerance})}<h2>Stack and connections</h2>${diagram}${table(connections)}<h2>Terminal table</h2>${table([['Terminal','Net','Local X (mm)','Local Y (KiCad mm)'],...r.art.ports.map(p=>[p.name,p.net,p.x.toFixed(3),(-p.y).toFixed(3)])])}<h2>Core parts</h2>${table((r.assembly?.parts||['Custom / no catalog core']).map(p=>[p,r.assembly?.mounting||'Assembly not specified']))}<h2>Data provenance</h2>${table([['Inductance',c.coreALMeasured>0?'Measured calibration':r.assembly?'Manufacturer-derived AL; estimated leakage':'Estimated'],['Copper loss','Estimated'],['Capacitance',c.capacitanceModel==='measured'?'Measured aggregate':'Estimated'],['Core loss',r.core?.lossSource||'Unknown / not applicable']])}<h2>Models and limits</h2><ul>${r.notes.map(n=>`<li>${escape(n.text)}</li>`).join('')}</ul><h2>Calibration record</h2><pre>${escape(JSON.stringify(c.calibration?.source||null,null,2))}</pre><p>Run live KiCad DRC and inspect the physical assembly. This dossier is not a manufacturing approval.</p></body></html>`;
  return {name,html,files:{[`${name}.kicad_pcb`]:exportKicadPcb(r.art,{tolerance:c.tolerance,boardThickness:c.boardT}),[`${name}.kicad_mod`]:exportKicadMod(r.art,{name,tolerance:c.tolerance}),[`${name}.svg`]:exportSvg(r.art,{name,tolerance:c.tolerance}),[`${name}-dossier.html`]:html,[`${name}.json`]:JSON.stringify({kind:'transformer',name,config:c},null,2),[`${name}-analysis.json`]:JSON.stringify({analysis:r.analysis,core:r.core,assembly:r.assembly,assessment,notes:r.notes},null,2)}};
}
