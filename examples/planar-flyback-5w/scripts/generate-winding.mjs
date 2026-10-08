import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const engineRoot=process.env.PLANAR_STUDIO_ROOT
  ? pathToFileURL(path.resolve(process.env.PLANAR_STUDIO_ROOT)+path.sep)
  : new URL('../../../',import.meta.url);
const {defaults,compute}=await import(new URL('web/js/ws/transformer.js',engineRoot));
const {corePresetPatch, catalogAL, CORE_CATALOG}=await import(new URL('web/js/engine/transformer-cores.js',engineRoot));
const {exportKicadPcb,exportSvg}=await import(new URL('web/js/engine/exporters.js',engineRoot));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const stack=JSON.parse(fs.readFileSync(path.join(root,'stackup.json'),'utf8'));
const mag=JSON.parse(fs.readFileSync(path.join(root,'magnetics.json'),'utf8'));
const cfg={...defaults(),...corePresetPatch(mag.core_preset),
  coreClearance:mag.core_clearance_mm,viaPad:.6,viaDrill:.3,
  primaryTurns:2,secondaryTurns:2,stackPlan:'P,S,S,P',
  copperLayers:'F.Cu,In1.Cu,In4.Cu,B.Cu',layerPositions:stack.winding_centers_relative_top_center_mm.join(','),
  dOuter:13.6,traceW:0.6,traceS:0.2,copperOz:stack.winding_model_copper_mm/0.035,
  windingOptions:{P:{width:.6,connection:'series'},S:{width:.6,connection:'parallel'}},
  driveMode:'current',operatingLinked:false,coreVoltage:1,current:1,secondaryCurrent:1,
  coreLossModel:'density',coreLossDensity:0,freq:200000,tempC:60,
  requirements:{voltage:24,outputVoltage:5,outputCurrent:1,frequency:200000,diameter:80,layers:6,voltageTolerance:5},
};
const result=compute(cfg,{name:'T1'});
// The app verifies ferrite openings. Enlarge only the OUTSIDE edges of the
// two outer slots for the clips; winding-facing edges and copper stay fixed.
const clipOuter=mag.core_half_dimensions_mm.width_max/2+mag.clip_outer_projection_envelope_mm+mag.core_clearance_mm;
for (const loop of [...result.assembly.openings.slice(1),...result.art.outline.slice(2).map(o=>o.pts)]) {
  const side=Math.sign(loop.reduce((s,p)=>s+p[0],0));
  const outer=Math.max(...loop.map(p=>side*p[0]));
  loop.forEach(p=>{if(Math.abs(side*p[0]-outer)<1e-8)p[0]=side*clipOuter;});
}
result.assembly.clipClearanceScope=mag.clip_projection_note;
fs.writeFileSync(path.join(root,'planar-studio','T1.planar.json'),JSON.stringify({tool:'planar-studio',version:'1.6.0',kind:'transformer',name:'T1 — PS-FLYBACK-5W geometry',config:cfg},null,2));
fs.writeFileSync(path.join(root,'planar-studio','T1-config.json'),JSON.stringify(cfg,null,2));
fs.writeFileSync(path.join(root,'planar-studio','T1-artwork.json'),JSON.stringify(result.art,null,2));
fs.writeFileSync(path.join(root,'planar-studio','T1-windings.kicad_pcb'),exportKicadPcb(result.art,{name:'T1',boardThickness:stack.published_copper_plus_dielectric_mm}));
fs.writeFileSync(path.join(root,'planar-studio','T1-windings.svg'),exportSvg(result.art,{name:'PCB planar flyback winding geometry'}));
const summary={scope:'Geometry, small-signal inductance and resistance only. Sinusoidal loaded voltage is not flyback output validation.',
  core:result.core,assembly:result.assembly,analysis:result.analysis,windings:result.windings.map(w=>({name:w.name,turns:w.turns,connection:w.connection,ports:w.ports})),
  manufacturingStack:stack,layerStack:result.art.meta.stack,ports:result.art.ports,notes:result.notes,
  gapFormula:{source:mag.source,AL_nH:mag.nominal_pair_AL_nH,totalCenterGap_mm:cfg.coreGap,basis:mag.AL_basis},
  magnetizingInductance_H:catalogAL(cfg,CORE_CATALOG[mag.core_preset])*result.windings[0].turns**2};
fs.writeFileSync(path.join(root,'evidence','winding-model.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({turns:result.analysis.turns,magnetizing_uH:summary.magnetizingInductance_H*1e6,R1:result.analysis.R1,R2:result.analysis.R2,leakage_uH:result.analysis.leakage*1e6,dimensions:result.bounds,ports:result.art.ports},null,2));
