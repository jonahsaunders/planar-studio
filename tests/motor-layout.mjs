/* Check the physical interconnect graph, not just its labels. Coils are removed
   from this graph so an accidental bypass cannot hide behind winding continuity. */
import assert from 'node:assert/strict';
import { defaults, compute, notes } from '../web/js/ws/motor.js';
import { defaults as inductorDefaults } from '../web/js/ws/inductor.js';
import { buildCoil, analyse } from '../web/js/engine/coil.js';
import { instances, buildArtwork } from '../web/js/engine/coilgeom.js';
import { exportKicadPcb, exportKicadMod, exportSvg, exportDxf } from '../web/js/engine/exporters.js';

import { interconnectGroups } from './helpers/motor-connectivity.mjs';
function expectedGroups(cfg) {
  const groups=[], neutral=['N'];
  for(let p=0;p<cfg.phases;p++) {
    const coils=Array.from({length:cfg.coilCount},(_,i)=>i).filter(i=>i%cfg.phases===p);
    const phase=String.fromCharCode(65+p);
    if(cfg.coilSeries) {
      groups.push([phase,`C${coils[0]+1}.1`]);
      for(let i=0;i<coils.length-1;i++) groups.push([`C${coils[i]+1}.2`,`C${coils[i+1]+1}.1`]);
      neutral.push(`C${coils.at(-1)+1}.2`);
    } else {
      groups.push([phase,...coils.map(i=>`C${i+1}.1`)]);
      neutral.push(...coils.map(i=>`C${i+1}.2`));
    }
  }
  const mode = cfg.terminalBreakout ?? 'phase-neutral';
  return [...groups,neutral].map(g=>g.filter(n => /^C\d/.test(n) || (n === 'N' ? mode === 'phase-neutral' : mode !== 'none')).sort().join(',')).filter(Boolean).sort();
}
let cases=0;
for(const shape of ['wedge','circle','racetrack','polygon']) {
  for(const coilSeries of [true,false]) for(const terminalAngle of [-90,0,137]) {
    const cfg={...defaults(),shape,coilSeries,terminalAngle};
    const r=compute(cfg,{}, {quick:true});
    assert.equal(r.instances,12);
    assert.equal(r.art.meta.starRouted,true,JSON.stringify(r.art.notes));
    assert.deepEqual(interconnectGroups(r.art),expectedGroups(cfg),`${shape}, series=${coilSeries}, angle=${terminalAngle}`);
    const R=Math.hypot(...r.art.outline[0].pts[0]);
    for(const t of r.art.tracks) for(const p of t.pts) assert.ok(Math.hypot(...p)+t.width/2<R);
    for(const p of r.art.pads) assert.ok(Math.hypot(p.x,p.y)+p.w/2<R);
    assert.equal(new Set(r.art.pads.map(p=>p.number)).size,r.art.pads.length);
    assert.equal(new Set(r.art.tracks.map(t=>t.net)).size,1,'continuous winding must not export conflicting nets');
    for(const p of r.art.ports) assert.ok(Math.abs(Math.sin(Math.atan2(p.y,p.x)-terminalAngle*Math.PI/180))<1e-9);
    if(shape!=='wedge') for(const [x,y] of r.coil.spiral.path) {
      assert.ok(Math.hypot(x,y)>=cfg.dInner/2+cfg.traceW/2-1e-8,'bore clearance');
      assert.ok(Math.hypot(x,y)<=cfg.dOuter/2-cfg.traceW/2+1e-8,'outer clearance');
      assert.ok(Math.abs(Math.atan2(y,x))<=cfg.spanDeg*Math.PI/360,'slot containment');
    }
    for(const exporter of [exportKicadPcb,exportKicadMod,exportSvg,exportDxf]) {
      const text=exporter(r.art);assert.ok(text.length>100);assert.ok(!/NaN|Infinity/.test(text));
    }
    assert.match(exportSvg(r.art), />N<\/text>/);
    assert.match(exportDxf(r.art), /\nTEXT\n/);
    const roundTrip=compute(JSON.parse(JSON.stringify(cfg)),{}, {quick:true});
    assert.deepEqual(roundTrip.art,r.art);
    cases++;
  }
  const cfg={...defaults(),shape};
  const r=compute(cfg,{}, {segmentCap:1000});
  assert.ok(r.analysis.L>0 && Number.isFinite(r.analysis.Rdc));
  assert.equal(r.motor.coilsTotal,12);
  assert.equal(r.motor.phases,3);
  // Translation into the stator must not alter the coil's numerical inductance.
  if(shape!=='wedge') {
    const shifted=structuredClone(r.coil);
    for(const l of [...shifted.layers,...shifted.links,...shifted.leads]) for(const p of l.pts)p[0]-=r.coil.motorCentre;
    for(const v of shifted.vias)v.x-=r.coil.motorCentre;
    assert.ok(Math.abs(analyse(cfg,shifted,{segmentCap:1000}).L/r.analysis.L-1)<1e-10);
  }
}
// Omitting a terminal must remove only the breakout, never the internal star.
for (const shape of ['wedge','circle','racetrack','polygon']) {
  for (const coilSeries of [true, false]) for (const terminalBreakout of ['phases', 'none']) {
    const cfg = {...defaults(), shape, coilSeries, terminalBreakout, terminalAngle: 73};
    const r = compute(cfg, {}, {quick:true});
    assert.equal(r.art.meta.starRouted, true);
    assert.deepEqual(r.art.ports.map(p=>p.name), terminalBreakout === 'phases' ? ['A','B','C'] : []);
    assert.ok(!r.art.pads.some(p=>p.role === 'neutral-terminal'));
    assert.ok(!r.art.labels.some(l=>l.text === 'N'));
    assert.deepEqual(interconnectGroups(r.art), expectedGroups(cfg));
    const star = r.art.tracks.find(t=>t.role === 'star');
    assert.ok(star, 'internal star remains connected');
    if (terminalBreakout === 'none') {
      assert.equal(r.art.pads.length, cfg.coilCount * 2);
      assert.ok(!r.art.tracks.some(t=>t.role === 'phase-feed'));
    }
    assert.deepEqual(compute(JSON.parse(JSON.stringify(cfg)), {}, {quick:true}).art, r.art);
    assert.ok(!/>N<\/text>/.test(exportSvg(r.art)));
    assert.ok(!/\(pad "N"/.test(exportKicadMod(r.art)));
    cases++;
  }
}
const legacy = {...defaults()}; delete legacy.terminalBreakout;
assert.deepEqual(compute(legacy, {}, {quick:true}).art.ports.map(p=>p.name), ['A','B','C','N']);
assert.throws(()=>compute({...defaults(), terminalBreakout:'invalid'}, {}, {quick:true}));
for(const count of [3,6,18,24]) {
  const cfg={...defaults(),coilCount:count,spanDeg:Math.min(26,360/count-2)};
  const r=compute(cfg,{}, {quick:true});
  assert.equal(r.art.meta.starRouted,true);
  assert.deepEqual(interconnectGroups(r.art),expectedGroups(cfg));cases++;
}
for(const sides of [4,6,8,10,12]) {
  const cfg={...defaults(),shape:'polygon',sides,turns:60};
  const r=compute(cfg,{}, {segmentCap:500});
  assert.ok(r.coil.spiral.turnsUsed<=r.coil.spiral.maxTurns);
  assert.ok(notes(cfg,r).some(n=>/requested turns/.test(n.text)));cases++;
}
for(const changes of [{layers:1},{layers:3},{layers:4},{connection:'parallel'},{coilCount:13},{spanDeg:30}]) {
  const cfg={...defaults(),...changes};const r=compute(cfg,{}, {quick:true});
  assert.equal(r.art.meta.starRouted,false);
  assert.equal(r.art.ports.length,0);
  assert.ok(notes(cfg,r).some(n=>n.level==='error' && /omitted/.test(n.text)));cases++;
}
for(const changes of [{dInner:60},{dInner:-1},{phases:0},{shape:'custom'},{shape:'polygon',sides:0},{shape:'circle',spanDeg:0.1}]) {
  assert.throws(()=>compute({...defaults(),...changes},{},{quick:true}));cases++;
}
const cfg={...defaults(),shape:'circle',busEnabled:false};
assert.equal(compute(cfg,{},{quick:true}).art.ports.length,0);
const single={...inductorDefaults(),arrayEnabled:true,coilCount:12};
assert.equal(instances(single).length,1);
assert.equal(buildArtwork(single,buildCoil(single)).meta.kind,'coil');
console.log(`${cases} motor layout scenarios passed: connectivity, containment, exports, persistence, and validation.`);
