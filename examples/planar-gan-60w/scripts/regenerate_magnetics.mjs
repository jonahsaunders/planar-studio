import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const checkout=path.resolve(process.argv[2]||'planar-studio');
const {defaults,compute}=await import(pathToFileURL(path.join(checkout,'web/js/ws/transformer.js')));
const {CORE_CATALOG,corePresetPatch,assemblyStatus}=await import(pathToFileURL(path.join(checkout,'web/js/engine/transformer-cores.js')));
const {exportKicadPcb,exportSvg}=await import(pathToFileURL(path.join(checkout,'web/js/engine/exporters.js')));
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const folder of ['kicad','planar-studio','evidence','sourcing','scripts'])fs.mkdirSync(path.join(root,folder),{recursive:true});
const cfg={...defaults(),...corePresetPatch('eelp22-stock-gap'),coreClearance:.5,
 primaryTurns:2,secondaryTurns:2,windingTopology:'tapped',stackPlan:'P,S,S,P',
 copperLayers:'F.Cu,In1.Cu,In6.Cu,B.Cu',layerPositions:'0,.20,1.33,1.53',
 windingOptions:{P:{width:.6,connection:'series'},S:{width:.6,connection:'series'}},
 dOuter:14.4,traceW:.6,traceS:.2,copperOz:2,boardT:1.6,
 viaPad:.6,viaDrill:.3,driveMode:'current',operatingLinked:false,
 current:3.25,secondaryCurrent:3.93,coreVoltage:24,freq:193000,tempC:80,
 coreLossModel:'n87-fit',coreTemperature:100,lossModel:'ac',leakageModel:'geometry'};
const base=compute(cfg,{name:'T1'}),art=structuredClone(base.art);
// Each half of the center-tapped winding gets a second copper layer.
// Same start/end nodes: duplicate sections are parallel, never shorted turns.
for(const [from,to] of [['In1.Cu','In2.Cu'],['In6.Cu','In5.Cu']]){
 for(const t of base.art.tracks.filter(t=>t.layer===from))art.tracks.push({...structuredClone(t),layer:to});
}
art.meta.stack=[['F.Cu','P1',0],['In1.Cu','S_A',.20],['In2.Cu','S_A',.40],['In3.Cu','ROUTING',.64],['In4.Cu','ROUTING',.89],['In5.Cu','S_B',1.13],['In6.Cu','S_B',1.33],['B.Cu','P2',1.53]].map(([layer,winding,z])=>({layer,winding,z}));
art.meta.boardLayers=['F.Cu','In1.Cu','In2.Cu','In3.Cu','In4.Cu','In5.Cu','In6.Cu','B.Cu'];
// Extend the outer edges of the leg slots for the two stock spring clips.
for(const opening of art.outline.slice(2)){
 const side=Math.sign(opening.pts.reduce((s,p)=>s+p[0],0));
 const old=Math.max(...opening.pts.map(p=>side*p[0]));
 opening.pts.forEach(p=>{if(Math.abs(side*p[0]-old)<1e-6)p[0]=side*13.1;});
}
const fit=assemblyStatus(cfg,art);
if(!fit.fits)throw new Error(fit.issues.join('\n'));
// Catalog preset and ordered two-gapped-half assembly match.
// Do not label a manufacturer AL estimate as a measured calibration.
const summary={
 status:'ENGINEERING PROTOTYPE; NOT RELEASED FOR FABRICATION',
 generation:'Planar Studio 1.6.0 center-tapped seed; duplicate each secondary section on one adjacent layer. Six final winding layers.',
 seed_configuration:cfg,
 ordered_core:{upper:'B66285G0050X187',lower:'B66285G0050X187',clips:'B66286A2000X000',clip_quantity:2,AL_nH:820,AL_basis:'TDK approximate value for 0.10 mm total gap; not measured and not guaranteed assembly tolerance',Lm_uH:13.12},
 seed_core_note:'Two stock 0.05 mm gapped halves; nominal total gap 0.10 mm and Lm 13.12 uH. Measure the assembled transformer.',
 turns:{primary:4,secondary_half_A:2,secondary_half_B:2},
 copper_um:70,stackup_status:'8 layers, six winding layers plus two routing layers; 2 oz all layers; dielectric positions are preliminary. JLCPCB must accept exact build.',
 P_Rdc_80C_ohm:base.analysis.R1,S_half_Rdc_80C_ohm:base.analysis.R2/4,
 expected_P_Irms_A:3.25,expected_S_half_Irms_A:Math.PI*5/4,
 winding_DC_loss_W:base.analysis.R1*3.25**2+2*(base.analysis.R2/4)*(Math.PI*5/4)**2,
 leakage_seed_H:base.analysis.leakage,
 leakage_note:'Seed estimate only; duplicated secondary layers and delivered stack change this. Measure Lshort; tune discrete resonant inductor.',
 flux_square_wave_screen_T:24/(4*193000*4*77.9e-6),
 limitations:['No solved LLC rectifier waveforms in Planar Studio.','Core-loss model is sinusoidal and is not a thermal qualification.','Internal copper weights, dielectric spacing, DFM and core fit require factory review.'],
 mechanical:fit,
 ports:art.ports,
};
fs.writeFileSync(path.join(root,'planar-studio/T1.planar.json'),JSON.stringify({tool:'planar-studio',version:'1.6.0',kind:'transformer',name:'PS-GAN-60W center-tapped seed - see final winding derivation',config:cfg},null,2));
fs.writeFileSync(path.join(root,'planar-studio/T1-artwork.json'),JSON.stringify(art,null,2));
fs.writeFileSync(path.join(root,'planar-studio/T1-windings.kicad_pcb'),exportKicadPcb(art,{name:'T1 SIX WINDING LAYERS ON EIGHT-LAYER PCB',boardThickness:1.6}));
fs.writeFileSync(path.join(root,'planar-studio/T1-windings.svg'),exportSvg(art,{name:'PS-GAN-60W / 4:2:2 / six winding layers'}));
fs.writeFileSync(path.join(root,'evidence/magnetics.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({Rpri:summary.P_Rdc_80C_ohm,RsecHalf:summary.S_half_Rdc_80C_ohm,DC_loss:summary.winding_DC_loss_W,B:summary.flux_square_wave_screen_T,fit:fit.fits}));
