/* Obstacle-aware contour windings. Boolean clipping uses integer micrometres;
   electrical calculations consume the actual continuous, checked paths.
   The search follows one connected pocket, never bridges disconnected copper. */
import Clipper from '../vendor/clipper.js';
import { polyLength, layerNames, KICAD_COLORS, bboxOf } from './coil.js';
const SCALE = 10000, EPS = 0.002;
const xy = path => path.map(p => [p.X / SCALE, p.Y / SCALE]);
const ints = path => path.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));
const area = p => Clipper.Clipper.Area(ints(p));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const rectangle = (x, y, w, h) => [[x-w/2,y-h/2],[x+w/2,y-h/2],[x+w/2,y+h/2],[x-w/2,y+h/2]];
export function obstacleDefaults() { return { obstacleEnabled: false, areaWidth: 60, areaHeight: 45, areaClearance: 0.5, obstacles: [], obstacleSeedX: 0, obstacleSeedY: 0, obstacleSeedAuto: true }; }

export function obstacleRegions(cfg) {
  if (![cfg.areaWidth, cfg.areaHeight].every(v => Number.isFinite(v) && v >= 5 && v <= 500)
    || !Number.isFinite(cfg.areaClearance) || cfg.areaClearance < 0 || cfg.areaClearance > 20) throw new Error('Use a board area from 5–500 mm and clearance from 0–20 mm.');
  if (!Array.isArray(cfg.obstacles) || cfg.obstacles.length > 40) throw new Error('Use at most 40 obstacle regions.');
  const obstacles = cfg.obstacles.map((o, i) => {
    if (!o || ![o.x, o.y].every(v => Number.isFinite(v) && Math.abs(v) <= 1000)) throw new Error(`Obstacle ${i+1} needs finite coordinates in millimetres.`);
    let polygon;
    if (o.shape === 'circle') {
      if (!(Number.isFinite(o.radius) && o.radius > 0 && o.radius <= 500)) throw new Error(`Obstacle ${i+1} needs a positive radius.`);
      // Circumscribe the true circle so chords cannot eat into its clearance.
      polygon = Array.from({ length: 64 }, (_, j) => { const a=2*Math.PI*j/64, r=o.radius/Math.cos(Math.PI/64);return [o.x+r*Math.cos(a),o.y+r*Math.sin(a)]; });
    } else if (o.shape === 'rect') {
      if (![o.width,o.height].every(v=>Number.isFinite(v)&&v>0&&v<=1000)) throw new Error(`Obstacle ${i+1} needs positive width and height.`);
      polygon = rectangle(o.x,o.y,o.width,o.height);
    } else if (o.shape === 'polygon') {
      if (!Array.isArray(o.points) || o.points.length < 3 || o.points.length > 100 || !o.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&Math.abs(v)<=1000))) throw new Error(`Obstacle ${i+1} needs 3–100 valid polygon vertices.`);
      polygon = o.points.map(([x,y])=>[x+o.x,y+o.y]);
      for(let a=0;a<polygon.length;a++)for(let b=a+1;b<polygon.length;b++) {
        if(b===a+1||a===0&&b===polygon.length-1)continue;
        if(segmentDistance(polygon[a],polygon[(a+1)%polygon.length],polygon[b],polygon[(b+1)%polygon.length])<EPS)throw new Error(`Obstacle ${i+1} polygon edges must not cross or touch.`);
      }
      if (Math.abs(area(polygon)) < 1 || Clipper.Clipper.SimplifyPolygon(ints(polygon),Clipper.PolyFillType.pftNonZero).length !== 1) throw new Error(`Obstacle ${i+1} must be a simple polygon with nonzero area.`);
    } else throw new Error(`Unsupported shape for obstacle ${i+1}.`);
    if (area(polygon) < 0) polygon.reverse();
    return { ...o, name: String(o.name || `Region ${i+1}`), polygon };
  });
  return { board: rectangle(0,0,cfg.areaWidth,cfg.areaHeight), obstacles };
}

function offset(paths, delta) {
  if (!paths.length) return [];
  const co = new Clipper.ClipperOffset(2, EPS*SCALE);
  co.AddPaths(paths.map(ints), Clipper.JoinType.jtRound, Clipper.EndType.etClosedPolygon);
  const out=[]; co.Execute(out,delta*SCALE);return out.map(xy);
}
function difference(subject, clips) {
  const c=new Clipper.Clipper();c.AddPaths(subject.map(ints),Clipper.PolyType.ptSubject,true);
  c.AddPaths(clips.map(ints),Clipper.PolyType.ptClip,true);
  const out=[];c.Execute(Clipper.ClipType.ctDifference,out,Clipper.PolyFillType.pftNonZero,Clipper.PolyFillType.pftNonZero);return out.map(xy);
}
export function pointIn(p, polygon) { return Clipper.Clipper.PointInPolygon({X:Math.round(p[0]*SCALE),Y:Math.round(p[1]*SCALE)},ints(polygon))!==0; }
export function pointSegment(p,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1],u=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(p[0]-a[0]-u*dx,p[1]-a[1]-u*dy);
}
export function segmentDistance(a,b,c,d) {
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)return 0;
  return Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b));
}
function boundaryDistance(a,b,poly) { let d=Infinity; for(let i=0;i<poly.length;i++)d=Math.min(d,segmentDistance(a,b,poly[i],poly[(i+1)%poly.length]));return d; }

/* Validate complete copper, including its width, pad/via disks and nonlocal
   self-approaches. Local neighbours along one continuous track are exempt. */
export function checkObstacleCopper(coil,cfg,regions=obstacleRegions(cfg)) {
  const {board,obstacles}=regions,clear=cfg.areaClearance;
  const segments=[];
  for(const l of [...coil.layers,...coil.links,...coil.leads]) {
    let length=0;const layer=l.index??l.layer;
    l.pts.slice(1).forEach((b,i)=>{const a=l.pts[i],len=dist(a,b);if(len>1e-8){segments.push({a,b,layer,path:l,start:length,end:length+len});length+=len;}});
  }
  const check=(a,b,radius)=> {
    if(!pointIn(a,board)||!pointIn(b,board)||boundaryDistance(a,b,board)<radius+clear-EPS)throw new Error('Copper lacks clearance to the board-area edge.');
    for(const o of obstacles)if(pointIn(a,o.polygon)||pointIn(b,o.polygon)||boundaryDistance(a,b,o.polygon)<radius+clear-EPS)throw new Error(`Copper lacks clearance to ${o.name}.`);
  };
  segments.forEach(s=>check(s.a,s.b,cfg.traceW/2));
  const circles=[...coil.vias.map(v=>({p:[v.x,v.y],r:cfg.viaPad/2})),...coil.terminals.map(p=>({p,r:cfg.padSize/2}))];
  circles.forEach(c=>check(c.p,c.p,c.r));
  const gap=cfg.traceW+cfg.traceS;
  for(let i=0;i<segments.length;i++)for(let j=0;j<i;j++) {
    const a=segments[i],b=segments[j];if(a.layer!==b.layer)continue;
    if(a.path===b.path&&Math.max(a.start,b.start)-Math.min(a.end,b.end)<gap*2)continue;
    if(Math.max(a.a[0],a.b[0])+gap<Math.min(b.a[0],b.b[0])||Math.max(b.a[0],b.b[0])+gap<Math.min(a.a[0],a.b[0])||Math.max(a.a[1],a.b[1])+gap<Math.min(b.a[1],b.b[1])||Math.max(b.a[1],b.b[1])+gap<Math.min(a.a[1],a.b[1]))continue;
    if(segmentDistance(a.a,a.b,b.a,b.b)<gap-EPS)throw new Error('Contour turns or connections lack trace clearance. Try fewer turns or move the winding center.');
  }
  for(let i=0;i<circles.length;i++) {
    const c=circles[i];for(let j=0;j<i;j++)if(dist(c.p,circles[j].p)<c.r+circles[j].r+cfg.traceS-EPS)throw new Error('Terminal or via pads overlap.');
    for(const s of segments) {
      const connected=dist(s.path.pts[0],c.p)<EPS||dist(s.path.pts.at(-1),c.p)<EPS;
      const total=polyLength(s.path.pts,false);
      if(connected&&(dist(s.path.pts[0],c.p)<EPS?s.start<2*(c.r+gap):total-s.end<2*(c.r+gap)))continue;
      if(pointSegment(c.p,s.a,s.b)<c.r+cfg.traceW/2+cfg.traceS-EPS)throw new Error('A terminal or transition via is too close to another turn.');
    }
  }
  return true;
}

/* Cut a narrow horizontal seam from a closed contour. A valid seam opens
   exactly one chain; multiply intersected concave contours try another pose. */
function cutContour(poly,seed,half) {
  const kept=[];
  for(let i=0;i<poly.length;i++) {
    const a=poly[i],b=poly[(i+1)%poly.length],ts=[0,1];
    for(const [axis,value]of [[0,seed[0]],[1,seed[1]-half],[1,seed[1]+half]]) {
      const delta=b[axis]-a[axis];if(Math.abs(delta)>1e-10){const t=(value-a[axis])/delta;if(t>0&&t<1)ts.push(t);}
    }
    ts.sort((a,b)=>a-b);
    for(let j=1;j<ts.length;j++) {
      const at=t=>[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])],p=at(ts[j-1]),q=at(ts[j]),m=at((ts[j]+ts[j-1])/2);
      if(!(m[0]>=seed[0]-1e-9&&Math.abs(m[1]-seed[1])<half-1e-9)&&dist(p,q)>1e-8)kept.push([p,q]);
    }
  }
  const chains=[];for(const [a,b]of kept){const last=chains.at(-1);if(last&&dist(last.at(-1),a)<EPS)last.push(b);else chains.push([a,b]);}
  if(chains.length>1&&dist(chains.at(-1).at(-1),chains[0][0])<EPS){const last=chains.pop();chains[0]=last.concat(chains[0].slice(1));}
  if(chains.length!==1)throw new Error('The seam crosses multiple pockets.');
  const path=chains[0];if(path[0][1]<path.at(-1)[1])path.reverse();
  if(Math.abs(path[0][1]-seed[1]-half)>EPS||Math.abs(path.at(-1)[1]-seed[1]+half)>EPS||path[0][0]<=seed[0]||path.at(-1)[0]<=seed[0])throw new Error('The winding pocket is too narrow for a terminal seam.');
  return path;
}

function assemble(cfg,contours,seed,angle,regions,pitch) {
  const c=Math.cos(angle),s=Math.sin(angle),local=p=>[c*(p[0]-seed[0])+s*(p[1]-seed[1]),-s*(p[0]-seed[0])+c*(p[1]-seed[1])];
  const world=p=>[c*p[0]-s*p[1]+seed[0],s*p[0]+c*p[1]+seed[1]];
  const half=Math.max(cfg.padSize+cfg.traceS,cfg.viaPad+cfg.traceS,pitch*2)/2+EPS;
  const rings=contours.map(p=>cutContour(p.map(local),[0,0],half));
  const forward=rings.flatMap(p=>p),backward=rings.flatMap(p=>p.slice().reverse());
  // Bring both inner ends into the free pocket, on their own copper layers.
  const inner=[0,0];forward.push(inner);backward.push(inner);
  const lead=cfg.padSize+cfg.traceS+cfg.traceW;
  const padA=[forward[0][0]+lead,half],padB=[backward[0][0]+lead,-half];
  forward.unshift(padA);backward.unshift(padB);
  const series=cfg.connection==='series',names=cfg.layerNames||layerNames(cfg.layers);
  const paths=Array.from({length:cfg.layers},(_,k)=>series&&k%2?backward.slice().reverse():forward);
  const layers=paths.map((pts,index)=>({index,name:names[index],color:KICAD_COLORS[index%KICAD_COLORS.length],z:cfg.layers===1?0:-cfg.boardT/2+index*cfg.boardT/(cfg.layers-1),pts:pts.map(world),reversed:series&&index%2===1}));
  const vias=cfg.layers>1?(series?[{x:seed[0],y:seed[1],from:0,to:1,kind:'inner'}]:[]):[];
  const terminals=[world(padA),series&&cfg.layers===2?world(padB):seed.slice()];
  // Through-hole terminal pads stitch parallel layers at both ends.
  const lenTotal=layers.reduce((sum,l)=>sum+polyLength(l.pts,false),0),all=layers.flatMap(l=>l.pts),box=bboxOf(all);
  const outerR=Math.max(...all.map(p=>Math.hypot(...p))),innerR=Math.max(cfg.viaPad,Math.min(box.w,box.h)/2-contours.length*pitch);
  const coil={spiral:{path:layers[0].pts,base:contours[0],turnsUsed:contours.length,maxTurns:contours.length,minClearance:cfg.traceS,algorithm:{name:'Obstacle-aware contour spiral',note:'Nested offsets of the available board area with checked connections.'}},
    layers,vias,links:[],leads:[],names,pitch,zPitch:cfg.layers>1?cfg.boardT/(cfg.layers-1):cfg.boardT,enclosed:!(series&&cfg.layers===2),terminals,
    lenPerLayer:lenTotal/cfg.layers,lenTotal,linkLen:0,leadLen:0,bbox:box,outerR,innerR,dOutFlat:Math.min(box.w,box.h),dInFlat:Math.max(0,Math.min(box.w,box.h)-2*contours.length*pitch),obstacleRegions:regions,obstacleSeed:seed};
  checkObstacleCopper(coil,cfg,regions);return coil;
}

let cachedKey = null, cachedCoil = null;
export function buildObstacleCoil(cfg) {
  const key=JSON.stringify(Object.fromEntries(['areaWidth','areaHeight','areaClearance','obstacles','obstacleSeedAuto','obstacleSeedX','obstacleSeedY','layers','connection','turns','traceW','traceS','boardT','padSize','padDrill','viaPad','viaDrill','layerNames'].map(k=>[k,cfg[k]])));
  if(cachedKey===key)return structuredClone(cachedCoil);
  const regions=obstacleRegions(cfg);
  if(!Number.isInteger(cfg.layers)||cfg.layers<1||cfg.layers>16||!['series','parallel'].includes(cfg.connection)||cfg.connection==='series'&&cfg.layers>2)throw new Error('Obstacle windings support one layer, two series layers, or up to sixteen parallel layers.');
  if(!Number.isInteger(cfg.turns)||cfg.turns<1||cfg.turns>60)throw new Error('Obstacle windings need 1–60 whole turns.');
  if(![cfg.traceW,cfg.traceS,cfg.boardT,cfg.padSize,cfg.padDrill,cfg.viaPad,cfg.viaDrill].every(v=>Number.isFinite(v)&&v>0)||cfg.padSize<=cfg.padDrill||cfg.viaPad<=cfg.viaDrill)throw new Error('Use positive copper dimensions and pads larger than their drills.');
  const pitch=(cfg.traceW+cfg.traceS+EPS*2)*1.2;
  const safe=cfg.areaClearance+cfg.traceW/2+EPS*2;
  const shapes=regions.obstacles.map(o=>o.polygon);
  const layers=[];
  for(let k=0;k<cfg.turns;k++) {
    const board=offset([regions.board],-(safe+cfg.padSize*1.6+cfg.traceS+cfg.traceW+k*pitch));
    if(!board.length)break;
    const free=difference(board,offset(shapes,safe+k*pitch));
    const outer=free.filter(p=>area(p)>0);if(!outer.length)break;layers.push({outer,holes:free.filter(p=>area(p)<0)});
  }
  if(!layers.length)throw new Error('No winding fits in the remaining board area. Enlarge it or reduce obstacle clearance.');
  const seeds=[];
  if(cfg.obstacleSeedAuto!==false) {
    // Rank free grid points by distance from every boundary (deterministic).
    const deep=layers.at(-1);
    for(let iy=1;iy<24;iy++)for(let ix=1;ix<24;ix++) {
      const p=[cfg.areaWidth*(ix/24-0.5),cfg.areaHeight*(iy/24-0.5)];
      const poly=deep.outer.find(poly=>pointIn(p,poly));if(!poly||deep.holes.some(h=>pointIn(p,h)))continue;
      let distance=boundaryDistance(p,p,poly);for(const h of deep.holes)distance=Math.min(distance,boundaryDistance(p,p,h));
      seeds.push({p,distance});
    }
    seeds.sort((a,b)=>b.distance-a.distance||dist(a.p,[0,0])-dist(b.p,[0,0]));
  } else {
    const p=[cfg.obstacleSeedX,cfg.obstacleSeedY];if(!p.every(Number.isFinite))throw new Error('Enter a finite winding center.');seeds.push({p,distance:0});
  }
  let lastError='No clear winding center was found.', attempts=0;
  for(const {p:seed}of seeds.slice(0,12)) {
    const contours=[];for(const layer of layers) {
      const p=layer.outer.find(p=>pointIn(seed,p));if(!p||layer.holes.some(h=>pointIn(seed,h)))break;contours.push(p);
    }
    for(let count=contours.length;count>=1;count--)for(const angle of [0,Math.PI/2,Math.PI,3*Math.PI/2]) {
      if(++attempts>96)throw new Error(`Contour search limit reached. ${lastError} Move the winding center or reduce turns.`);
      try {const coil=assemble(cfg,contours.slice(0,count),seed,angle,regions,pitch);coil.obstacleDropped=cfg.turns-count;cachedKey=key;cachedCoil=structuredClone(coil);return coil;}
      catch(e){lastError=e.message;}
    }
  }
  throw new Error(`No clearance-safe winding found. ${lastError} Try moving the winding center, reducing turns, or changing the obstacles.`);
}
