import { MOTOR_FAMILIES, familyOf, isTranslation } from '../engine/motorfamilies.js';
import { substrateFields, processFields } from '../ws/common.js';
import { el, eng, num } from './controls.js';
import { windingDesigner } from './winding-design.js';
const rotational=c=>['rotary','dual-rotor'].includes(familyOf(c));
const stepper=c=>familyOf(c)==='stepper';
const planar=c=>familyOf(c)==='planar';
const linear=c=>familyOf(c)==='linear';
const shapes=[{value:'circle',label:'Circular spiral'},{value:'racetrack',label:'Racetrack / oval'},{value:'polygon',label:'Polygon'}];
const range=(key,label,min,max,step=1,unit,when)=>({key,type:'range',label,min,max,step,unit,when});
export function familyRail(panel,app) {
  panel.group({key:'motor-family',title:'Motor family',fields:[{key:'motorFamily',type:'select',label:'Motor family',options:MOTOR_FAMILIES}]});
  panel.group({key:'stator',title:'Stator ring',when:c=>!isTranslation(c),fields:[
    {key:'shape',type:'select',label:'Coil shape',options:[{value:'wedge',label:'Annular sector'},...shapes]},
    range('dOuter','Outer diameter',10,300,0.5,'mm'),range('dInner','Bore diameter',2,260,0.5,'mm'),
    range('coilCount','Coils',3,48,1,null,rotational),range('phases','Phases',1,6,1,null,rotational),
    range('polePairs','Pole pairs',1,30,1,null,rotational),range('spanDeg','Coil span',3,120,0.5,'°',rotational),
    {key:'ringActions',type:'row',when:rotational,buttons:[{label:'Fill the ring',onClick:p=>{const c=p.state;const gap=2*Math.asin(Math.min(1,(c.traceW+c.traceS)/c.dInner))*180/Math.PI;app.set('spanDeg',Number(Math.max(2,360/c.coilCount-gap).toFixed(2)));}}]},
  ]});
  panel.group({key:'winding-designer',title:'Motor winding designer',when:rotational,fields:[
    {key:'_motorWindingDesigner',type:'custom',when:rotational,build:p=>windingDesigner(p,app)},
  ]});
  panel.group({key:'stepper',title:'Stepper command',when:stepper,fields:[
    range('stepperPolePairs','Stepper pole pairs',1,6),range('stepperFill','Stepper slot fill',0.3,0.9,0.01),
    {key:'microsteps',type:'select',label:'Microsteps per full step',options:[1,2,4,8,16,32].map(value=>({value,label:String(value)}))},
    range('stepIndex','Step command',0,63),
    {key:'stepHint',type:'note',text:'Four coils per pole pair, repeating A+, B+, A−, B−. Full steps energize both phases; microsteps use sine/cosine currents. The preview can animate commands.'},
  ]});
  panel.group({key:'translation',title:'Linear / planar array',when:isTranslation,fields:[
    {key:'cellShape',type:'select',label:'Cell shape',options:shapes},range('cellDiameter','Coil diameter',3,60,0.5,'mm'),
    range('linearCoils','Linear coils',3,36,3,null,linear),range('polePitch','Magnet pole pitch X',5,100,0.5,'mm'),
    range('gridCols','Grid columns',2,8,1,null,planar),range('gridRows','Grid rows',2,8,1,null,planar),
    range('gridPitch','Grid pitch',5,100,0.5,'mm',planar),range('yPolePitch','Magnet pole pitch Y',5,100,0.5,'mm',planar),
    range('travel','Travel stroke',1,200,1,'mm'),range('moverX','Mover X',-100,100,0.5,'mm'),range('moverY','Mover Y',-100,100,0.5,'mm',planar),
    range('driveAngle','Electrical drive angle',0,360,1,'°',linear),
    {key:'coverageHint',type:'note',text:'The field model assumes the magnet pattern covers the whole coil array throughout the stroke. Required pattern dimensions are reported; finite-carriage edge effects are not modeled.'},
  ]});
  panel.group({key:'coil-profile',title:'Coil profile',fields:[
    range('sides','Polygon sides',4,12,2,null,c=>(isTranslation(c)?c.cellShape:c.shape)==='polygon'),
    range('aspect','Oval aspect ratio',0.2,1,0.05,null,c=>(isTranslation(c)?c.cellShape:c.shape)==='racetrack'),
  ]});
  panel.group({key:'routing',title:'Connections',when:c=>!planar(c),fields:[
    {key:'coilSeries',type:'seg',label:'Coils per phase',when:c=>!stepper(c)&&(!rotational(c)||c.windingMode!=='custom'),options:[{value:true,label:'Series'},{value:false,label:'Parallel'}]},
    {key:'busEnabled',type:'check',label:'Automatic phase interconnection',hint:'Rotary and linear families use star wiring. The stepper gets two isolated series phase circuits. Turn off to wire individual coils manually.'},
    {key:'terminalBreakout',type:'select',label:'Terminal breakout',when:c=>c.busEnabled,options:[
      {value:'phase-neutral',label:'Phase terminals + neutral (if applicable)'},{value:'phases',label:'Phase terminals only'},{value:'none',label:'No grouped terminals'}],
      hint:'Star motors can expose N or keep it internal. A stepper always uses A+/A− and B+/B−, with no neutral. No grouped terminals retains individual coil pads.'},
    range('terminalAngle','Terminal position',-180,180,1,'°',c=>c.busEnabled&&!isTranslation(c)),
  ]});
  panel.group({key:'winding',title:'Winding',fields:[
    range('turns','Turns per layer',1,60),range('layers','Copper layers',1,16),
    {key:'connection',type:'seg',label:'Layer connection',options:[{value:'series',label:'Series'},{value:'parallel',label:'Parallel'}]},
    {key:'maxTurnsAction',type:'row',buttons:[{label:'Max turns',onClick:()=>app.setMaxTurns()}]},
    ...substrateFields(),
  ]});
  panel.group({key:'dual',title:'Two magnet rotors',when:c=>familyOf(c)==='dual-rotor',fields:[
    range('topGap','Upper rotor gap',0,10,0.1,'mm'),range('bottomGap','Lower rotor gap',0,10,0.1,'mm'),
    range('magnetThickness','Magnet thickness',0.5,15,0.1,'mm'),range('magnetDiameter','Magnet diameter',1,20,0.5,'mm'),
    range('magnetBr','Magnet remanence Br',0.1,1.5,0.01,'T'),range('rotorOffset','Relative rotor alignment',-90,90,0.5,'°'),
    {key:'dualHint',type:'note',text:'Zero offset means reinforcing axial fields. Each face is approximated by an isolated cylindrical magnet at the copper midplane; their amplitudes are combined as spatial harmonics.'},
  ]});
  panel.group({key:'machine',title:'Drive and field',fields:[
    range('bGap','Airgap flux density',0.01,1.4,0.01,'T',c=>familyOf(c)!=='dual-rotor'),
    range('current','Drive current / X command',0,30,0.1,'A'),range('currentY','Y drive current',-30,30,0.1,'A',planar),
    range('vdc','Bus voltage',3,800,1,'V',rotational),range('rpm','Speed',100,40000,50,'rpm',rotational),
    range('tempC','Winding temperature',-40,155,1,'°C'),
  ]});
  panel.group({key:'process',title:'Process',open:false,fields:processFields()});
}

export function extraTiles(cfg,res) {
  const m=res.familyAnalysis,a=res.analysis;if(!m)return null;
  const common=[{k:'Copper loss',v:eng(m.Pcu,'W',3)}, {k:'Coil resistance',v:eng(a.Rdc,'Ω',3)}, {k:'Coil inductance',v:eng(a.L,'H',3)}];
  if(m.kind==='stepper')return [
    {k:'Full-step angle',v:num(m.fullStep,2),u:'°'}, {k:'Command increment',v:num(m.commandStep,3),u:'°'},
    {k:'Holding torque estimate',v:num(m.holding*1000,2),u:'mN·m'}, {k:'Equilibrium (one pole pair)',v:num(m.equilibrium,2),u:'°'},
    {k:'Phase A / B current',v:`${num(m.currents[0],2)} / ${num(m.currents[1],2)}`,u:'A'},...common];
  if(m.kind==='linear')return [{k:'Mover force',v:num(m.force,4),u:'N'},{k:'Phase force constant',v:num(m.forceConstant,4),u:'N/A'},
    {k:'Active track length',v:num(m.trackLength,1),u:'mm'},{k:'Phase resistance',v:eng(m.Rphase,'Ω',3)},...common];
  return [{k:'Mover force X',v:num(m.fx,4),u:'N'},{k:'Mover force Y',v:num(m.fy,4),u:'N'},
    {k:'Peak coil current',v:num(m.peakCurrent,2),u:'A'},{k:'Independent coil drivers',v:String(res.instances)},...common];
}
export function extraSpec(cfg,res) {
  const m=res.familyAnalysis,a=res.analysis;if(!m)return null;
  const rows=[['Family',MOTOR_FAMILIES.find(f=>f.value===res.family).label],['Coils / copper layers',`${res.instances} / ${a.nL}`],
    ['Turns per layer',`${a.turns} of ${cfg.turns} requested`],['Connection points',res.art.ports.map(p=>p.name).join(', ')||'None grouped; use individual coil pads'],
    ['Automatic interconnection',res.art.meta.interconnected?'Routed':'Independent coils / manual routing']];
  if(m.kind==='stepper')rows.push(['Commands per revolution',String(m.stepsPerRev)],['Phase resistance',eng(m.Rphase,'Ω')],['Phase inductance (mutual between coils omitted)',eng(m.Lphase,'H')]);
  if(m.kind==='linear')rows.push(['Minimum magnet-pattern length for full stroke',`${num(m.minimumMagnetLength,1)} mm`],['Instantaneous phase currents',m.currents.map(i=>`${num(i,2)} A`).join(' / ')]);
  if(m.kind==='planar')rows.push(['Minimum magnet-pattern coverage',`${num(m.minimumMagnetWidth,1)} × ${num(m.minimumMagnetHeight,1)} mm`],['Peak field of each X/Y harmonic',`${num(cfg.bGap,3)} T`],['Coil currents',m.currents.map((v,i)=>`C${i+1}: ${num(v,2)} A`).join('; ')]);
  return [{title:'Family design',rows},{title:'Model boundary',note:m.limits,rows:[['Copper loss at command',eng(m.Pcu,'W')],['Motion dynamics','Not modeled; no acceleration, pull-out speed, or position error prediction']]}];
}
export function extraCharts(cfg,res) {
  const m=res.familyAnalysis;if(!m)return null;
  const step=m.kind==='stepper',grid=m.kind==='planar';
  const series=[{name:step?'Rotor torque':grid?'Fx, sweep X':'Mover Fx',values:m.curve.map(p=>p.y*(step?1000:1))}];
  if(grid)series.push({name:'Fy, sweep Y',values:m.curve.map(p=>p.y2)});
  return [{id:'family-response',title:step?'Torque versus rotor angle':grid?'Axis force sweeps at fixed coil currents':'Force versus mover position at fixed drive',
    note:step?'Static torque for the selected command. It is not a pull-out torque curve.':'Currents are held at the selected command. Fringing and partial magnet coverage are excluded.',
    spec:{x:{values:m.curve.map(p=>p.x),label:step?'Mechanical degrees':'Position (mm)'},y:{label:step?'mN·m':'N'},series}}];
}

let animation=null;
function stopAnimation(){if(animation)clearInterval(animation.timer);animation=null;}
export function motorPreview(cfg,res,app) {
  if(!res.familyAnalysis&&!res.dual)return null;
  const family=familyOf(cfg),m=res.familyAnalysis;
  if(animation&&animation.family===family)animation.cfg=cfg;
  const section=el('div',{class:'side-section'},el('h3',{text:res.dual?'Dual-rotor arrangement':'Motion / drive preview'}));
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 340 210');svg.setAttribute('role','img');svg.setAttribute('aria-label',`${family} motor preview`);svg.style.width='100%';
  const add=(tag,attrs,text)=>{const n=document.createElementNS(svg.namespaceURI,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text)n.textContent=text;svg.append(n);return n;};
  const text=(x,y,t)=>add('text',{x,y,fill:'currentColor','font-size':12,'text-anchor':'middle'},t);
  if(res.dual) {
    add('rect',{x:35,y:92,width:270,height:16,fill:'#b58c54'});text(170,87,'PCB stator');
    add('rect',{x:35,y:25,width:270,height:8,fill:'#7e8796'});add('rect',{x:35,y:166,width:270,height:8,fill:'#7e8796'});
    for(let i=0;i<8;i++){add('rect',{x:40+i*33,y:33,width:24,height:18,fill:i%2?'#4e9acb':'#ce5959'});add('rect',{x:40+i*33,y:148,width:24,height:18,fill:i%2?'#4e9acb':'#ce5959'});}
    text(170,69,`Upper gap ${num(cfg.topGap,1)} mm`);text(170,130,`Lower gap ${num(cfg.bottomGap,1)} mm`);
    text(170,194,`Offset ${num(cfg.rotorOffset,1)}° · side view, not to scale`);
  } else if(family==='stepper') {
    add('circle',{cx:170,cy:95,r:66,fill:'none',stroke:'#8c939f','stroke-width':2});
    for(const it of res.placed){const x=170+78*Math.cos(it.angle),y=95-78*Math.sin(it.angle);add('circle',{cx:x,cy:y,r:8,fill:it.phase?'#579cd1':'#d26060'});}
    const a=m.equilibrium*Math.PI/180;add('line',{x1:170,y1:95,x2:170+58*Math.cos(a),y2:95-58*Math.sin(a),stroke:'#d7a64e','stroke-width':4});
    text(170,193,`Command ${cfg.stepIndex} · A ${num(m.currents[0],2)} / B ${num(m.currents[1],2)} A`);
    const toggle=el('button',{class:'btn',type:'button',text:animation?'Stop stepping':'Animate steps'});
    toggle.addEventListener('click',()=>{
      if(animation){stopAnimation();toggle.textContent='Animate steps';return;}
      animation={family,cfg,timer:setInterval(()=>{
        const active=document.querySelector('.tab[aria-selected="true"]');const selected=document.querySelector('select[aria-label="Motor family"]');
        if(!animation||active?.dataset.ws!=='motor'||selected?.value!=='stepper'){stopAnimation();return;}
        app.set('stepIndex',(animation.cfg.stepIndex+1)% (4*animation.cfg.microsteps));
      },650)};toggle.textContent='Stop stepping';
    });section.append(toggle);
  } else if(family==='linear') {
    add('rect',{x:20,y:112,width:300,height:14,fill:'#b58c54'});
    for(let i=0;i<Math.min(cfg.linearCoils,18);i++)add('circle',{cx:30+i*280/(Math.min(cfg.linearCoils,18)-1),cy:113,r:7,fill:['#ce5959','#66b081','#579cd1'][i%3]});
    const x=170+110*cfg.moverX/cfg.travel;add('rect',{x:x-35,y:58,width:70,height:25,fill:'#579cd1'});text(x,49,'Magnet pattern');
    text(170,155,`X ${num(cfg.moverX,1)} mm · Fx ${num(m.force,4)} N`);text(170,182,'Schematic; full field coverage assumed');
  } else {
    const sx=240/Math.max(1,cfg.gridCols-1),sy=110/Math.max(1,cfg.gridRows-1);
    for(let row=0;row<cfg.gridRows;row++)for(let col=0;col<cfg.gridCols;col++){const i=row*cfg.gridCols+col;add('circle',{cx:50+col*sx,cy:30+row*sy,r:Math.min(12,sx/4,sy/4),fill:m.currents[i]>=0?'#ce5959':'#579cd1'});}
    const norm=Math.max(1e-12,Math.hypot(m.fx,m.fy));add('line',{x1:170,y1:85,x2:170+45*m.fx/norm,y2:85-45*m.fy/norm,stroke:'#dfba63','stroke-width':4});
    text(170,174,`Fx ${num(m.fx,4)} N · Fy ${num(m.fy,4)} N`);text(170,197,'Red / blue = positive / negative coil current');
  }
  section.append(svg);return section;
}
