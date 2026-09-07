/* PCB motor families. Geometry is mm; force/torque are SI. The new force
   models integrate I dl × B over closed winding loops in prescribed sinusoidal
   Bz fields. They are static field models, not finite-magnet or motion solvers. */
import { buildCoil, analyse, TAU } from './coil.js';
import { coilArtwork } from './coilgeom.js';
import { artwork, track, via, pad, label, merge, bounds, arcPts, rect } from './artwork.js';

export const MOTOR_FAMILIES = [
  {value:'rotary',label:'Three-phase rotary'},
  {value:'stepper',label:'Two-phase PCB stepper'},
  {value:'linear',label:'Linear PCB motor'},
  {value:'dual-rotor',label:'Dual-rotor axial flux'},
  {value:'planar',label:'Two-axis planar motor'},
];
export const familyOf = c => c.motorFamily || 'rotary';
export const isTranslation = c => ['linear','planar'].includes(familyOf(c));
export const familyDefaults = () => ({ motorFamily:'rotary', stepperPolePairs:2, stepperFill:0.8,
  stepIndex:0, microsteps:1, cellShape:'circle', cellDiameter:12,
  linearCoils:9, polePitch:30, travel:40, moverX:0, moverY:0, driveAngle:0,
  gridCols:3, gridRows:3, gridPitch:20, yPolePitch:30, currentY:0,
  topGap:1, bottomGap:1, magnetThickness:3, magnetDiameter:6, magnetBr:1.2, rotorOffset:0,
});
const positive = (x,name) => {if (!Number.isFinite(x)||x<=0) throw new Error(`${name} must be positive.`);};
const integer = (x,a,b,name) => {if (!Number.isInteger(x)||x<a||x>b) throw new Error(`${name} must be a whole number from ${a} to ${b}.`);};
const point = (p,it) => {const c=Math.cos(it.angle||0),s=Math.sin(it.angle||0),y=p[1]*(it.sign||1);return [p[0]*c-y*s+(it.x||0),p[0]*s+y*c+(it.y||0)];};
function placedArtwork(A,it) {
  for(const t of A.tracks)t.pts=t.pts.map(p=>point(p,it));
  for(const p of [...A.vias,...A.pads,...A.labels,...A.ports]) [p.x,p.y]=point([p.x,p.y],it);
  return A;
}
function closedLoops(coil,it) {
  return coil.layers.map(l=>{const pts=l.pts.map(p=>point(p,it));return [...pts,pts[0]];});
}

/** Route isolated connections on separate lanes. Every terminal has one
    front-layer escape; every connection has its own back-layer lane. Negative
    stepper coils can therefore swap terminal sides without bypassing a coil. */
function routeConnections(cfg,A,placed,connections,circular) {
  if(cfg.layers!==2||cfg.connection!=='series') throw new Error('Family interconnect routing needs two series copper layers. Disable automatic interconnection for manual wiring.');
  const b=bounds(A), lane=Math.max(cfg.padSize,cfg.viaPad,cfg.traceW)+cfg.traceS+0.3;
  const seam=(cfg.terminalAngle??-90)*Math.PI/180;
  const r0=Math.max(cfg.dOuter/2,...A.pads.map(p=>Math.hypot(p.x,p.y)))+lane+cfg.padSize;
  const front=cfg.layerNames[0],back=cfg.layerNames.at(-1);
  const terminal = ref => placed[ref[0]].ends[ref[1]];
  const polar=(r,a)=>[r*Math.cos(a),r*Math.sin(a)];
  const wrapped=t=>seam+((Math.atan2(t[1],t[0])-seam)%TAU+TAU)%TAU;
  for(const [i,connection] of connections.entries()) {
    const r=r0+i*lane, y=b.y0-lane*(i+1), x=b.x0-lane;
    const ends=connection.ends.map(terminal), drops=[];
    for(const t of ends) {
      const end=circular?polar(r,wrapped(t)):[t[0],y];
      A.tracks.push(track(front,cfg.traceW,[t,end],{net:connection.net,role:'family-drop'}));
      A.vias.push(via(...end,{diameter:cfg.viaPad,drill:cfg.viaDrill,net:connection.net,role:'family-drop'}));
      drops.push(end);
    }
    if(connection.name) {
      const p=circular?polar(r,seam):[x,y];drops.push(p);
      A.pads.push(pad(...p,{w:cfg.padSize,drill:cfg.padDrill,number:connection.name,net:connection.net,role:'family-terminal'}));
      A.ports.push({x:p[0],y:p[1],name:connection.name,net:connection.net});
      A.labels.push(label(p[0]+cfg.padSize+0.6,p[1],connection.name,{size:0.8}));
    }
    if(drops.length>1) {
      const coords=circular?ends.map(wrapped):drops.map(p=>p[0]);
      if(circular&&connection.name)coords.push(seam);
      const pts=circular?arcPts(0,0,r,Math.min(...coords),Math.max(...coords),0.01)
        :[[Math.min(...coords),y],[Math.max(...coords),y]];
      A.tracks.push(track(back,cfg.traceW,pts,{net:connection.net,role:'family-link'}));
    }
  }
  A.meta.interconnected=true;
}

export function familyLayout(input,names,opt={}) {
  const cfg={...familyDefaults(),...input,layerNames:names};
  const family=familyOf(cfg),stepper=family==='stepper',planar=family==='planar';
  if(!['stepper','linear','planar'].includes(family))throw new Error('Not a translated or stepper family.');
  integer(cfg.layers,1,16,'Copper layers');positive(cfg.traceW,'Track width');positive(cfg.traceS,'Clearance');positive(cfg.turns,'Turns');
  if(cfg.layers!==2||cfg.connection!=='series') throw new Error('The stepper, linear and planar families currently require two series copper layers for unambiguous winding continuity.');
  if(!(cfg.padSize>cfg.padDrill&&cfg.padDrill>0&&cfg.viaPad>cfg.viaDrill&&cfg.viaDrill>0))throw new Error('Copper pads must be larger than their positive drill diameters.');
  if(!Number.isFinite(cfg.bGap)||cfg.bGap<0)throw new Error('Peak magnetic field must be finite and nonnegative.');
  integer(cfg.turns,1,1000,'Turns');
  if(!Number.isFinite(cfg.current)||!Number.isFinite(cfg.currentY))throw new Error('Drive currents must be finite.');
  const coilCfg={...cfg};
  const placements=[];
  if(stepper) {
    integer(cfg.stepperPolePairs,1,6,'Stepper pole pairs');
    if(![1,2,4,8,16,32].includes(cfg.microsteps))throw new Error('Microsteps must be 1, 2, 4, 8, 16 or 32.');
    integer(cfg.stepIndex,0,1000000,'Step command');
    if(!Number.isFinite(cfg.terminalAngle))throw new Error('Terminal position must be finite.');
    if(!(cfg.stepperFill>0&&cfg.stepperFill<1))throw new Error('Stepper slot fill must be between zero and one.');
    if(!(cfg.dOuter>cfg.dInner&&cfg.dInner>0))throw new Error('The bore must be smaller than the outer diameter.');
    if(!['wedge','circle','racetrack','polygon'].includes(cfg.shape))throw new Error('Choose a supported stepper coil shape.');
    const n=4*cfg.stepperPolePairs;
    if(cfg.dInner*Math.sin(Math.PI/n*(1-cfg.stepperFill))<cfg.traceW+cfg.traceS)throw new Error('Adjacent stepper slots lack clearance at the bore. Reduce slot fill or increase the bore.');
    Object.assign(coilCfg,{motorGeometry:true,arrayEnabled:false,spanDeg:360/n*cfg.stepperFill,coilCount:n,phases:2});
    for(let i=0;i<n;i++)placements.push({index:i,phase:i%2,sign:i%4<2?1:-1,angle:(cfg.terminalAngle??-90)*Math.PI/180+Math.PI/n+TAU*i/n,x:0,y:0});
  } else {
    positive(cfg.cellDiameter,'Coil diameter');positive(cfg.polePitch,'Magnet pole pitch');positive(cfg.travel,'Travel stroke');
    if(!Number.isFinite(cfg.moverX)||Math.abs(cfg.moverX)>cfg.travel/2)throw new Error('Mover X must lie within half the travel stroke of the center.');
    if(!['circle','racetrack','polygon'].includes(cfg.cellShape))throw new Error('Choose a circular, racetrack or polygon cell.');
    const radius=cfg.cellDiameter/2,pitch=cfg.traceW+cfg.traceS;
    const ap=cfg.cellShape==='polygon'?radius*Math.cos(Math.PI/cfg.sides):cfg.cellShape==='racetrack'?radius*cfg.aspect:radius;
    const max=Math.floor((ap-cfg.viaPad/2-cfg.traceS-cfg.traceW/2)/pitch);
    if(max<1)throw new Error('No full turn fits around the cell via. Increase coil diameter.');
    Object.assign(coilCfg,{shape:cfg.cellShape,motorGeometry:false,arrayEnabled:false,dOuter:cfg.cellDiameter,
      turns:Math.min(Math.floor(cfg.turns),max),fillet:0,cornerR:radius*cfg.aspect});
    if(planar) {
      integer(cfg.gridCols,2,8,'Grid columns');integer(cfg.gridRows,2,8,'Grid rows');positive(cfg.gridPitch,'Grid pitch');positive(cfg.yPolePitch,'Y pole pitch');
      if(!Number.isFinite(cfg.moverY)||Math.abs(cfg.moverY)>cfg.travel/2)throw new Error('Mover Y must lie within half the travel stroke of the center.');
      for(let row=0;row<cfg.gridRows;row++)for(let col=0;col<cfg.gridCols;col++)placements.push({index:row*cfg.gridCols+col,phase:row*cfg.gridCols+col,sign:1,angle:-Math.PI/2,x:(col-(cfg.gridCols-1)/2)*cfg.gridPitch,y:(row-(cfg.gridRows-1)/2)*cfg.gridPitch});
    } else {
      integer(cfg.linearCoils,3,36,'Linear coils');
      if(!Number.isFinite(cfg.driveAngle))throw new Error('Electrical drive angle must be finite.');
      if(cfg.linearCoils%3)throw new Error('Linear coils must be a multiple of three.');
      for(let i=0;i<cfg.linearCoils;i++)placements.push({index:i,phase:i%3,sign:1,angle:-Math.PI/2,x:(i-(cfg.linearCoils-1)/2)*2*cfg.polePitch/3,y:0});
    }
  }
  if(coilCfg.shape==='polygon')integer(cfg.sides,3,12,'Polygon sides');
  if(coilCfg.shape==='racetrack'&&!(cfg.aspect>=0.2&&cfg.aspect<=1))throw new Error('Oval aspect ratio must be between 0.2 and 1.');
  const coil=buildCoil(coilCfg);
  if(coil.spiral.maxTurns<1)throw new Error('No complete turn fits this slot.');
  if(!stepper)coil.spiral.maxTurns=Math.min(coil.spiral.maxTurns,Math.floor(((coilCfg.shape==='racetrack'?coilCfg.dOuter/2*cfg.aspect:coilCfg.shape==='polygon'?coilCfg.dOuter/2*Math.cos(Math.PI/cfg.sides):coilCfg.dOuter/2)-cfg.viaPad/2-cfg.traceS-cfg.traceW/2)/(cfg.traceW+cfg.traceS)));
  const A=artwork({name:opt.name||'M1',kind:'stator',motorFamily:family,interconnected:false});
  const placed=[];
  for(const it of placements) {
    const net=planar?`${opt.net||'COIL'}_C${it.index+1}`:stepper?`${opt.net||'COIL'}_${it.phase?'B':'A'}`:(opt.net||'COIL');
    const one=placedArtwork(coilArtwork(coilCfg,coil,{net}),it);
    one.pads.forEach((p,i)=>{p.number=`C${it.index+1}.${i+1}`;});
    for(const t of one.tracks){t.phase=it.phase;t.coilIndex=it.index;}
    const ends=one.pads.map(p=>[p.x,p.y]);
    const b=bounds(one);
    if(!stepper) {
      const spacing=planar?cfg.gridPitch:2*cfg.polePitch/3;
      if(b.w+cfg.traceS>spacing||(planar&&b.h+cfg.traceS>spacing))throw new Error('Coil copper or terminal pads overlap adjacent cells. Increase pitch or reduce coil/pad size.');
    }
    merge(A,one);
    const txt=planar?`C${it.index+1}`:`${String.fromCharCode(65+it.phase)}${it.sign<0?'−':'+'}`;
    A.labels.push(label((b.x0+b.x1)/2,b.y1+0.7,txt,{size:0.65}));
    placed.push({...it,ends,net,loops:closedLoops(coil,it)});
  }
  // Through-hole copper must clear all other terminal pads. For ring escapes,
  // use angular spacing as well: radially aligned terminals would share a spoke.
  for(let i=0;i<A.pads.length;i++)for(let j=0;j<i;j++) {
    const a=A.pads[i],b=A.pads[j];
    const d=stepper?2*Math.min(Math.hypot(a.x,a.y),Math.hypot(b.x,b.y))*Math.abs(Math.sin((Math.atan2(a.y,a.x)-Math.atan2(b.y,b.x))/2)):Math.hypot(a.x-b.x,a.y-b.y);
    if(d<Math.max(cfg.padSize,cfg.viaPad,cfg.traceW)+cfg.traceS-1e-6)throw new Error('Terminal pads or escapes lack clearance. Increase coil size/pitch or reduce pad size.');
  }
  const mode=cfg.terminalBreakout??'phase-neutral';
  if(!['phase-neutral','phases','none'].includes(mode))throw new Error('Choose a supported terminal breakout.');
  if(!planar&&cfg.busEnabled) {
    const connections=[],neutral=[];
    const groupCount=stepper?2:3;
    for(let p=0;p<groupCount;p++) {
      const group=placed.filter(it=>it.phase===p), net=group[0].net,name=String.fromCharCode(65+p);
      if(stepper||cfg.coilSeries) {
        for(let i=0;i<group.length-1;i++)connections.push({ends:[[group[i].index,1],[group[i+1].index,0]],net});
        if(mode!=='none')connections.push({ends:[[group[0].index,0]],net,name:stepper?`${name}+`:name});
        if(stepper) {if(mode!=='none')connections.push({ends:[[group.at(-1).index,1]],net,name:`${name}−`});}
        else neutral.push([group.at(-1).index,1]);
      } else {
        connections.push({ends:group.map(it=>[it.index,0]),net,name:mode!=='none'?name:null});
        neutral.push(...group.map(it=>[it.index,1]));
      }
    }
    if(!stepper)connections.push({ends:neutral,net:placed[0].net,name:mode==='phase-neutral'?'N':null});
    routeConnections(coilCfg,A,placed,connections,stepper);
  }
  if(planar) {
    for(const it of placed)for(let t=0;t<2;t++)A.ports.push({x:it.ends[t][0],y:it.ends[t][1],name:`C${it.index+1}${t?'−':'+'}`,net:it.net});
    A.notes.push({level:'info',text:'Each planar coil is electrically independent and needs its own bipolar current driver. Individual coil pads are the connection points; no star bus is generated.'});
  } else A.notes.push({level:'info',text:cfg.busEnabled
    ? stepper?'Two isolated series phase circuits. A+/A− and B+/B− require two bipolar bridges; negative coils are mirrored to reinforce the phase field.':'Three-phase linear star circuit. The shared copper uses one KiCad net; phase names identify winding taps.'
    :'Automatic interconnection is off. Wire the labeled coil phases and polarities manually before driving them.'});
  if(cfg.busEnabled&&!planar&&mode==='none')A.notes.push({level:'info',text:stepper
    ? `Phase endpoints: A+ at C1.1, A− at C${placed.length-1}.2; B+ at C2.1, B− at C${placed.length}.2. Other coil pads are intermediate series junctions.`
    : 'Phase inputs: A at C1.1, B at C2.1, C at C3.1. The star junction remains internal; intermediate series junctions are not drive inputs.'});
  const b=bounds(A);
  if(stepper){const r=Math.max(...A.pads.map(p=>Math.hypot(p.x,p.y)),...A.vias.map(p=>Math.hypot(p.x,p.y)))+cfg.padSize+2;A.outline=[{layer:'Edge.Cuts',pts:arcPts(0,0,r,0,TAU,0.03)},{layer:'Edge.Cuts',pts:arcPts(0,0,Math.max(0.5,cfg.dInner/2-2),0,TAU,0.03)}];}
  else A.outline=[{layer:'Edge.Cuts',pts:rect(b.x0-2,b.y0-2,b.x1+2,b.y1+2)}];
  A.meta.instances=placed.length;A.meta.phases=stepper?2:planar?placed.length:3;
  return {family,cfg,coilCfg,coil,art:A,placed,layers:names,instances:placed.length,bounds:bounds(A)};
}

/** Midpoint Lorentz sum over CLOSED loops. Returns force on the copper per amp
    and axial torque on the copper per amp. Mover/rotor reaction has opposite sign. */
export function lorentz(loops,field) {
  let fx=0,fy=0,t=0;
  for(const pts of loops)for(let i=1;i<pts.length;i++) {
    const a=pts[i-1],b=pts[i],x=(a[0]+b[0])/2,y=(a[1]+b[1])/2;
    const B=field(x,y),dx=(b[0]-a[0])*1e-3,dy=(b[1]-a[1])*1e-3;
    const fxi=dy*B,fyi=-dx*B;fx+=fxi;fy+=fyi;t+=(x*fyi-y*fxi)*1e-3;
  }
  return {fx,fy,torque:t};
}
const at = (c,a) => c[0]*Math.cos(a)+c[1]*Math.sin(a);
function coefficients(placed,field,quantity) {
  return placed.map(it=>[0,Math.PI/2].map(a=>-lorentz(it.loops,(x,y)=>field(x,y,a))[quantity]));
}
export function familyAnalysis(res,opt={}) {
  const c=res.cfg,f=res.family;
  const a=analyse(res.coilCfg,res.coil,{segmentCap:opt.segmentCap||1800});
  // DRC warnings compare the requested turns, not the internally capped value.
  a.drc.turnsOK=c.turns<=res.coil.spiral.maxTurns+1e-9;
  const n=res.placed.length;
  const limits='Prescribed sinusoidal Bz field and quasi-static Lorentz integration. Each layer spiral is closed by an ideal straight return. Interconnect force/resistance/inductance, mutual coupling between coils, edge fringing, iron, eddy-current and mechanical losses are excluded. Verify with magnetic FEA and measurement.';
  let data;
  if(f==='stepper') {
    integer(c.microsteps,1,32,'Microsteps');integer(c.stepIndex,0,1000000,'Step command');
    if(![1,2,4,8,16,32].includes(c.microsteps))throw new Error('Microsteps must be 1, 2, 4, 8, 16 or 32.');
    const p=c.stepperPolePairs,command=c.stepIndex*Math.PI/(2*c.microsteps)+Math.PI/4;
    const currents=c.microsteps===1?[Math.sign(Math.cos(command))*c.current,Math.sign(Math.sin(command))*c.current]:[Math.cos(command)*c.current,Math.sin(command)*c.current];
    const coeff=coefficients(res.placed,(x,y,angle)=>c.bGap*Math.cos(p*Math.atan2(y,x)-angle),'torque');
    const phase=[[0,0],[0,0]];
    coeff.forEach((v,i)=>{const g=phase[res.placed[i].phase];g[0]+=v[0];g[1]+=v[1];});
    const total=[0,1].map(k=>phase.reduce((s,v,i)=>s+v[k]*currents[i],0));
    const holding=Math.hypot(...total),equilibrium=(Math.atan2(total[1],total[0])+Math.PI/2)/p;
    data={kind:f,phaseCoefficients:phase,currents,holding,fullStep:90/p,commandStep:90/(p*c.microsteps),stepsPerRev:4*p*c.microsteps,
      equilibrium:((equilibrium*180/Math.PI)% (360/p)+360/p)%(360/p),Rphase:a.Rdc*n/2,Lphase:a.L*n/2,
      Pcu:(currents[0]**2+currents[1]**2)*a.Rdc*n/2,
      curve:Array.from({length:97},(_,i)=>{const deg=360/p*i/96;return {x:deg,y:at(total,deg*p*Math.PI/180)};}),limits};
  } else if(f==='linear') {
    const k=Math.PI/c.polePitch;
    const coeff=coefficients(res.placed,(x,y,angle)=>c.bGap*Math.cos(k*x-angle),'fx');
    const perPhase=n/3,phase=Array.from({length:3},()=>[0,0]);
    coeff.forEach((v,i)=>{const g=phase[res.placed[i].phase];g[0]+=v[0]/(c.coilSeries?1:perPhase);g[1]+=v[1]/(c.coilSeries?1:perPhase);});
    const currents=phase.map(v=>c.current*Math.cos(c.driveAngle*Math.PI/180-Math.atan2(v[1],v[0])));
    const total=[0,1].map(j=>phase.reduce((s,v,i)=>s+v[j]*currents[i],0));
    const Rphase=a.Rdc*(c.coilSeries?perPhase:1/perPhase);
    data={kind:f,currents,force:at(total,k*c.moverX),forceConstant:phase.reduce((s,v)=>s+Math.hypot(...v),0)/3,
      Rphase,Lphase:a.L*(c.coilSeries?perPhase:1/perPhase),Pcu:currents.reduce((s,i)=>s+i*i,0)*Rphase,
      trackLength:(n-1)*2*c.polePitch/3+c.cellDiameter,minimumMagnetLength:(n-1)*2*c.polePitch/3+c.cellDiameter+c.travel,
      curve:Array.from({length:81},(_,i)=>{const x=-c.travel/2+c.travel*i/80;return{x,y:at(total,k*x)};}),limits};
  } else {
    const kx=Math.PI/c.polePitch,ky=Math.PI/c.yPolePitch;
    const cx=coefficients(res.placed,(x,y,angle)=>c.bGap*Math.cos(kx*x-angle),'fx');
    const cy=coefficients(res.placed,(x,y,angle)=>c.bGap*Math.cos(ky*y-angle),'fy');
    const gx=cx.map(v=>at(v,kx*c.moverX)),gy=cy.map(v=>at(v,ky*c.moverY));
    const scaleX=Math.max(1e-15,...cx.map(v=>Math.hypot(...v))),scaleY=Math.max(1e-15,...cy.map(v=>Math.hypot(...v)));
    const currents=gx.map((v,i)=>c.current*v/scaleX+c.currentY*gy[i]/scaleY);
    const fx=gx.reduce((s,v,i)=>s+v*currents[i],0),fy=gy.reduce((s,v,i)=>s+v*currents[i],0);
    data={kind:f,currents,fx,fy,peakCurrent:Math.max(...currents.map(Math.abs)),Pcu:a.Rdc*currents.reduce((s,i)=>s+i*i,0),
      minimumMagnetWidth:(c.gridCols-1)*c.gridPitch+c.cellDiameter+c.travel,
      minimumMagnetHeight:(c.gridRows-1)*c.gridPitch+c.cellDiameter+c.travel,
      curve:Array.from({length:61},(_,i)=>{const x=-c.travel/2+c.travel*i/60;return {x,y:cx.reduce((s,v,j)=>s+at(v,kx*x)*currents[j],0),y2:cy.reduce((s,v,j)=>s+at(v,ky*x)*currents[j],0)};}),limits:limits+' X/Y fields are two independent orthogonal harmonics, each with the entered peak B. Current weights follow mover position; force sweeps hold those currents fixed. Truncated grids can cross-couple the axes.'};
  }
  return {...res,analysis:a,familyAnalysis:data};
}

export function dualRotorField(input) {
  const c={...familyDefaults(),...input};
  for(const [v,n] of [[c.magnetBr,'Magnet remanence'],[c.magnetDiameter,'Magnet diameter'],[c.magnetThickness,'Magnet thickness'],[c.boardT,'Board thickness']])positive(v,n);
  for(const v of [c.topGap,c.bottomGap])if(!Number.isFinite(v)||v<0)throw new Error('Rotor air gaps cannot be negative.');
  integer(c.polePairs,1,30,'Pole pairs');
  if(!Number.isFinite(c.rotorOffset))throw new Error('Rotor alignment must be finite.');
  const radius=c.magnetDiameter/2;
  const field=gap=>{const z=gap+c.boardT/2,t=c.magnetThickness;return c.magnetBr/2*((z+t)/Math.hypot(z+t,radius)-z/Math.hypot(z,radius));};
  const top=field(c.topGap),bottom=field(c.bottomGap),phi=c.polePairs*c.rotorOffset*Math.PI/180;
  const combined=Math.hypot(top+bottom*Math.cos(phi),bottom*Math.sin(phi));
  return {top,bottom,combined:combined<1e-12?0:combined,discSpacing:c.boardT+c.topGap+c.bottomGap,
    stackHeight:c.boardT+c.topGap+c.bottomGap+2*c.magnetThickness,
    phase:Math.atan2(bottom*Math.sin(phi),top+bottom*Math.cos(phi)),
    curve:Array.from({length:91},(_,i)=>{const x=360/c.polePairs*i/90;return {x,y:Math.hypot(top+bottom*Math.cos(c.polePairs*x*Math.PI/180),bottom*Math.sin(c.polePairs*x*Math.PI/180))};})};
}
