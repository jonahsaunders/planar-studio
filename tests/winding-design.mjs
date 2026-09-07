import assert from 'node:assert/strict';
import {defaults,compute} from '../web/js/ws/motor.js';
import {windingSchedule,windingPhasors,compatibleWindings} from '../web/js/engine/winding-design.js';
import {interconnectGroups} from './helpers/motor-connectivity.mjs';
import {exportKicadPcb,exportKicadMod,exportSvg,exportDxf} from '../web/js/engine/exporters.js';
function expected(c) {
 const w=windingPhasors(c),groups=[],neutral=c.terminalBreakout==='phase-neutral'?['N']:[];
 for(const p of w.phases){const inputs=c.terminalBreakout!=='none'?[String.fromCharCode(65+p.phase)]:[];
  for(const b of p.branches){inputs.push(`C${b.coils[0]+1}.1`);neutral.push(`C${b.coils.at(-1)+1}.2`);for(let i=1;i<b.coils.length;i++)groups.push([`C${b.coils[i-1]+1}.2`,`C${b.coils[i]+1}.1`]);}groups.push(inputs);
 }groups.push(neutral);return groups.map(g=>g.sort().join(',')).filter(Boolean).sort();
}
let cases=0;
for(const shape of ['wedge','circle','racetrack','polygon'])for(const polePairs of [4,7,8])for(const terminalBreakout of ['phase-neutral','phases','none']) {
 const c={...defaults(),shape,polePairs,windingMode:'auto',terminalBreakout};
 const r=compute(c,{},{quick:true});assert.equal(r.art.meta.starRouted,true,JSON.stringify(r.art.notes));
 assert.deepEqual(interconnectGroups(r.art),expected(c),`${shape}, ${polePairs}, ${terminalBreakout}`);
 for(const group of interconnectGroups(r.art))for(let i=1;i<=c.coilCount;i++)assert.ok(!(group.split(',').includes(`C${i}.1`)&&group.split(',').includes(`C${i}.2`)),'no bypass');
 for(const f of [exportKicadPcb,exportKicadMod,exportSvg,exportDxf])assert.ok(!/NaN|Infinity/.test(f(r.art)));
 assert.deepEqual(compute(JSON.parse(JSON.stringify(c)),{},{quick:true}).art,r.art);cases++;
}
const c={...defaults(),windingMode:'auto',polePairs:7};
const automatic=compute(c,{},{segmentCap:600});
const repeat=compute({...c,windingMode:'repeat'},{},{segmentCap:600});
assert.equal(repeat.motor.kw,0);assert.equal(repeat.motor.Kt,0,'fully cancelled winding gives zero fundamental torque');
assert.ok(automatic.motor.winding.kd>0.96);assert.ok(automatic.motor.Kt>0);
// Reverse every coil: phase EMF changes sign, magnitude and attainable torque remain.
const reversed={...c,windingMode:'custom',windingSchedule:windingSchedule(c).map(s=>({...s,polarity:-s.polarity}))};
const rev=compute(reversed,{},{segmentCap:600});assert.ok(Math.abs(rev.motor.Kt/automatic.motor.Kt-1)<1e-10);
const signedArea=pts=>pts.reduce((sum,p,i)=>{const q=pts[(i+1)%pts.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
const originalTracks=automatic.art.tracks.filter(t=>t.role==='winding'),reversedTracks=rev.art.tracks.filter(t=>t.role==='winding');
originalTracks.forEach((t,i)=>assert.ok(Math.abs(signedArea(t.pts)+signedArea(reversedTracks[i].pts))<1e-8,'polarity reverses physical copper circulation'));
const a=windingPhasors(c),b=windingPhasors(reversed);a.phases.forEach((p,i)=>assert.ok(Math.hypot(p.re+b.phases[i].re,p.im+b.phases[i].im)<1e-10));
// Balanced two-branch series/parallel topology: independently check R and L factors.
const mixed={...defaults(),windingMode:'custom'};
mixed.windingSchedule=windingSchedule({...mixed,windingMode:'repeat'}).map((s,i)=>({...s,branch:i<6?1:2}));
const m=compute(mixed,{},{segmentCap:600});assert.equal(m.art.meta.starRouted,true);assert.deepEqual(interconnectGroups(m.art),expected(mixed));
assert.ok(Math.abs(m.motor.Rphase/m.analysis.Rdc-1)<1e-12);assert.ok(Math.abs(m.motor.Lphase/m.analysis.L-1)<1e-12);
const bad=structuredClone(mixed);bad.windingSchedule[0].polarity=-1;
assert.equal(compute(bad,{},{quick:true}).art.meta.starRouted,false,'incompatible parallel EMFs are not connected');
assert.ok(compatibleWindings(c).every(s=>s.kw<=1+1e-12&&s.kw>0));
for(const delta of [{windingSchedule:[]},{windingSchedule:mixed.windingSchedule.map(s=>({...s,branch:0}))},{polePairs:NaN},{coilCount:49}])assert.throws(()=>compute({...mixed,...delta},{},{quick:true}));
console.log(`${cases} winding routing scenarios passed; cancellation, reversal, mixed branches, unsafe parallel rejection and exports verified.`);
