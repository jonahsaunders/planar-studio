import assert from 'node:assert/strict';
import {defaults,compute} from '../web/js/ws/inductor.js';
import {checkObstacleCopper,segmentDistance} from '../web/js/engine/obstacles.js';
import {toKicad} from '../web/js/engine/artwork.js';
import {exportKicadPcb,exportKicadMod,exportSvg,exportDxf} from '../web/js/engine/exporters.js';
const base={...defaults(),obstacleEnabled:true,turns:5};
const cases=[[],[{name:'M3 hole',kind:'hole',shape:'circle',x:15,y:5,radius:3}],
 [{name:'Connector',kind:'connector',shape:'rect',x:22,y:3,width:16,height:12}],
 [{name:'Forbidden polygon',shape:'polygon',x:0,y:0,points:[[12,2],[24,4],[17,15]]}],
 [{name:'Dividing connector',shape:'rect',x:0,y:0,width:4,height:45}]];
let total=0;
for(const obstacles of cases)for(const stack of [{layers:1,connection:'series'},{layers:2,connection:'series'},{layers:4,connection:'parallel'}]) {
 const cfg={...base,...stack,obstacles};const r=compute(cfg,{},{segmentCap:600});
 assert.ok(r.analysis.L>0&&r.analysis.Rdc>0);assert.equal(r.analysis.Lcs,null);assert.equal(r.analysis.Lwh,null);
 assert.ok(r.coil.spiral.turnsUsed>=1&&r.coil.spiral.turnsUsed<=cfg.turns);assert.ok(checkObstacleCopper(r.coil,cfg));
 if(stack.layers===2){assert.deepEqual(r.coil.layers[0].pts.at(-1),r.coil.layers[1].pts[0]);
 // Electrical circulation must add across the via, even for asymmetric shapes.
 const circulation=l=>l.pts.slice(1).reduce((s,p,i)=>s+l.pts[i][0]*p[1]-p[0]*l.pts[i][1],0);
 assert.ok(circulation(r.coil.layers[0])*circulation(r.coil.layers[1])>0);}
 assert.deepEqual(r.coil.layers[0].pts[0],r.coil.terminals[0]);
 assert.deepEqual(r.coil.layers.at(-1).pts.at(-1),r.coil.terminals[1]);
 for(const f of [exportKicadPcb,exportKicadMod,exportSvg,exportDxf])assert.ok(!/NaN|Infinity/.test(f(r.art,{tolerance:2})));
 assert.deepEqual(toKicad(r.art,{tolerance:2}).tracks,toKicad(r.art,{tolerance:0}).tracks,'exports preserve checked geometry');
 assert.deepEqual(compute(JSON.parse(JSON.stringify(cfg)),{},{quick:true}).art,r.art,'constraints and geometry round trip');
 // Independent exact circular-hole check on all track segments.
 for(const o of obstacles.filter(o=>o.shape==='circle'))for(const t of r.art.tracks)for(let i=1;i<t.pts.length;i++)assert.ok(segmentDistance([o.x,o.y],[o.x,o.y],t.pts[i-1],t.pts[i])>=o.radius+cfg.areaClearance+t.width/2-0.002);
 total++;
}
const reference=compute(base,{},{quick:true});
const p=reference.coil.layers[0].pts[5];
assert.throws(()=>checkObstacleCopper(reference.coil,{...base,obstacles:[{shape:'circle',x:p[0],y:p[1],radius:1}]}),/clearance/);
for(const change of [{layers:4,connection:'series'},{turns:1.5},{areaClearance:-1},{obstacles:[{shape:'circle',x:0,y:0,radius:100}]},{obstacleSeedAuto:false,obstacleSeedX:100,obstacleSeedY:100}])assert.throws(()=>compute({...base,...change},{},{quick:true}));
const notched=compute({...base,obstacles:cases[2]},{},{quick:true});
assert.ok(notched.coil.bbox.x1-notched.coil.bbox.x0>40,'uses remaining board width around the connector');
console.log(`${total} obstacle layouts passed; hole/rectangle/polygon clearance, split pockets, continuity, additive stacking, exports and persistence verified.`);
