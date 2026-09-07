import assert from 'node:assert/strict';
import { defaults, compute, tiles, spec, charts, notes } from '../web/js/ws/motor.js';
import { lorentz, dualRotorField } from '../web/js/engine/motorfamilies.js';
import { exportKicadPcb, exportKicadMod, exportSvg, exportDxf } from '../web/js/engine/exporters.js';
import { interconnectGroups } from './helpers/motor-connectivity.mjs';
const config=(family,extra={})=>({...defaults(),motorFamily:family,...extra});
const solve=(family,extra={})=>compute(config(family,extra),{},{segmentCap:600});
const close=(a,b,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
function expected(c,n) {
  const groups=[],neutral=[],step=c.motorFamily==='stepper',breakout=c.terminalBreakout!=='none';
  for(let p=0;p<(step?2:3);p++) {
    const ids=Array.from({length:n},(_,i)=>i).filter(i=>i%(step?2:3)===p),name=String.fromCharCode(65+p);
    if(step||c.coilSeries) {
      groups.push([`C${ids[0]+1}.1`,...(breakout?[step?name+'+':name]:[])]);
      for(let j=1;j<ids.length;j++)groups.push([`C${ids[j-1]+1}.2`,`C${ids[j]+1}.1`]);
      if(step)groups.push([`C${ids.at(-1)+1}.2`,...(breakout?[name+'−']:[])]);
      else neutral.push(`C${ids.at(-1)+1}.2`);
    } else {groups.push([...ids.map(i=>`C${i+1}.1`),...(breakout?[name]:[])]);neutral.push(...ids.map(i=>`C${i+1}.2`));}
  }
  if(!step)groups.push([...neutral,...(c.terminalBreakout==='phase-neutral'?['N']:[])]);
  return groups.map(g=>g.sort().join(',')).sort();
}
let layouts=0;
for(const family of ['stepper','linear','planar','dual-rotor']) {
  for(const shape of (['stepper','dual-rotor'].includes(family)?['wedge','circle','racetrack','polygon']:['circle','racetrack','polygon'])) {
    for(const terminalBreakout of ['phase-neutral','phases','none']) {
      const c=config(family,{shape,cellShape:shape,terminalBreakout});
      const r=compute(c,{},{quick:true});
      assert.ok(r.art.tracks.length>0);
      if(family==='stepper'||family==='linear')assert.deepEqual(interconnectGroups(r.art),expected(c,r.instances),`${family} ${shape} ${terminalBreakout}`);
      if(family==='planar') {
        assert.equal(r.art.ports.length,2*c.gridRows*c.gridCols);
        assert.equal(new Set(r.art.tracks.map(t=>t.net)).size,r.instances);
        assert.deepEqual(interconnectGroups(r.art),r.art.pads.map(p=>p.number).sort());
      }
      if(family==='stepper')assert.equal(new Set(r.art.tracks.map(t=>t.net)).size,2);
      for(const exporter of [exportKicadPcb,exportKicadMod,exportSvg,exportDxf]) {
        const text=exporter(r.art);assert.ok(text.length>100);assert.doesNotMatch(text,/NaN|Infinity/);
      }
      assert.deepEqual(compute(JSON.parse(JSON.stringify(c)),{},{quick:true}).art,r.art);
      // Every copper item fits the generated board perimeter.
      const outline=r.art.outline[0].pts;
      const x0=Math.min(...outline.map(p=>p[0])),x1=Math.max(...outline.map(p=>p[0]));
      const y0=Math.min(...outline.map(p=>p[1])),y1=Math.max(...outline.map(p=>p[1]));
      const inside=(x,y,size)=>assert.ok(x-size/2>x0&&x+size/2<x1&&y-size/2>y0&&y+size/2<y1);
      for(const t of r.art.tracks)for(const [x,y]of t.pts)inside(x,y,t.width);
      for(const p of [...r.art.pads,...r.art.vias])inside(p.x,p.y,p.w||p.diameter);
      layouts++;
    }
  }
  const r=solve(family),c=config(family);
  assert.ok(tiles(c,r).length>3&&spec(c,r).length>0&&charts(c,r).length>0);
  assert.ok(r.analysis.Rdc>0&&r.analysis.L>0);
  if(family!=='dual-rotor') {assert.equal(r.motor,undefined);assert.ok(notes(c,r).some(n=>/Lorentz/.test(n.text)));}
}
for(const n of [3,6,12])for(const coilSeries of [true,false]) {
  const c=config('linear',{linearCoils:n,coilSeries});const r=compute(c,{},{quick:true});
  assert.deepEqual(interconnectGroups(r.art),expected(c,n));layouts++;
}
for(const p of [1,3,4])for(const angle of [0,137]) {
  const c=config('stepper',{stepperPolePairs:p,terminalAngle:angle});const r=compute(c,{},{quick:true});
  assert.deepEqual(interconnectGroups(r.art),expected(c,4*p));layouts++;
}
for(const family of ['stepper','linear']) {
  const r=compute(config(family,{busEnabled:false}),{},{quick:true});
  assert.equal(r.art.ports.length,0);assert.equal(r.art.meta.interconnected,false);
  assert.deepEqual(interconnectGroups(r.art),r.art.pads.map(p=>p.number).sort());
}
// Independent physics checks: closed loops in a uniform field have zero net
// force; a linear gradient has a known area-dependent force and winding sign.
const loop=[[0,0],[10,0],[10,10],[0,10],[0,0]];
close(lorentz([loop],()=>1).fx,0);close(lorentz([loop],()=>1).fy,0);
close(lorentz([loop],x=>x/1000).fx,1e-4);
close(lorentz([[...loop].reverse()],x=>x/1000).fx,-1e-4);
const st=solve('stepper').familyAnalysis;
close(st.fullStep,45);close(st.stepsPerRev,8);
const [a,b]=st.phaseCoefficients;
close(a[0]*b[0]+a[1]*b[1],0,1e-10);close(Math.hypot(...a),Math.hypot(...b));
const next=solve('stepper',{stepIndex:1}).familyAnalysis;
close(Math.abs(((next.equilibrium-st.equilibrium+270)%180)-90),45);
close(next.holding,st.holding);
close(solve('stepper',{current:3}).familyAnalysis.holding,st.holding*2);
close(solve('stepper',{current:0}).familyAnalysis.holding,0);
const micro=solve('stepper',{microsteps:16}).familyAnalysis;
close(micro.commandStep,45/16);close(micro.stepsPerRev,128);close(micro.Pcu,st.Pcu/2);
const lin=solve('linear').familyAnalysis;
assert.ok(lin.force>0.01);close(lin.currents.reduce((s,i)=>s+i,0),0);
close(solve('linear',{driveAngle:180}).familyAnalysis.force,-lin.force);
close(solve('linear',{current:3}).familyAnalysis.force,lin.force*2);
close(solve('linear',{bGap:0.9}).familyAnalysis.force,lin.force*2);
close(solve('linear',{driveAngle:90}).familyAnalysis.force,0);
close(solve('linear',{moverX:15}).familyAnalysis.force,0);
close(solve('linear',{moverX:15,driveAngle:90}).familyAnalysis.force,lin.force);
close(solve('linear',{coilSeries:false}).familyAnalysis.force,lin.force/3);
const xy=solve('planar').familyAnalysis;
assert.ok(xy.fx>0.01);close(xy.fy,0);
const yy=solve('planar',{current:0,currentY:1.5}).familyAnalysis;
close(yy.fx,0);close(yy.fy,xy.fx,1e-4);
const both=solve('planar',{currentY:1.5}).familyAnalysis;
close(both.fx,xy.fx);close(both.fy,yy.fy);assert.ok(both.peakCurrent>xy.peakCurrent);
const d=dualRotorField(config('dual-rotor'));
close(d.combined,2*d.top);close(d.top,d.bottom);
close(dualRotorField(config('dual-rotor',{rotorOffset:180/8})).combined,0);
assert.ok(dualRotorField(config('dual-rotor',{topGap:2})).combined<d.combined);
const asym=dualRotorField(config('dual-rotor',{topGap:2,rotorOffset:180/8}));close(asym.combined,Math.abs(asym.top-asym.bottom));
close(solve('dual-rotor',{rotorOffset:180/8}).motor.Kt,0);
for(const [family,extra]of [['stepper',{layers:4}],['stepper',{microsteps:3}],['stepper',{padSize:30}],['stepper',{stepperFill:0.999}],['linear',{linearCoils:4}],['linear',{polePitch:5}],['linear',{moverX:21}],['linear',{driveAngle:NaN}],['planar',{gridPitch:5}],['planar',{moverY:21}],['planar',{gridRows:1}],['dual-rotor',{topGap:-1}],['linear',{turns:1.5}]]) {
  assert.throws(()=>compute(config(family,extra),{},{quick:true}),`${family} ${JSON.stringify(extra)}`);
}
const old=defaults();delete old.motorFamily;
assert.deepEqual(compute(old,{},{quick:true}).art,compute(defaults(),{},{quick:true}).art);
console.log(`${layouts} family layouts passed; isolated routing, exports, persistence, force/torque invariants, dual-rotor superposition and invalid inputs verified.`);
