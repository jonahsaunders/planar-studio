/* Nominal mechanical data transcribed from TDK's October 2022 drawing,
   pages 6–7 (without clamp recess). Dimensions are mm; these are core sets,
   not individual halves. Max post / min window dimensions govern clearance. */
import { rect } from './artwork.js';
export const CORE_SOURCE = 'https://www.tdk-electronics.tdk.com/inf/80/db/fer/elp_32_6_20.pdf';
const base = { manufacturer: 'TDK', material: 'N87', width: 31.75, depth: 20.35, postW: 6.35, postH: 20.35,
  postMaxW: 6.5, postMaxH: 20.75, innerLegSpan: 25.4, innerLegSpanMin: 24.9, outerLegW: 3.175,
  ae: 130, source: CORE_SOURCE, mounting: 'Adhesive or an external fixture; no integral screw holes. No clamp recess on B66457.' };
export const CORE_CATALOG = {
  'eelp32': { ...base, name: 'TDK EELP 32/6/20 · E + E · N87', parts: ['2 × B66457G0000X187'], le: 41.4, volume: 5390, al: 5700e-9, height: 12.7, windowHeight: 6.4, windowMin: 6.1 },
  'eilp32': { ...base, name: 'TDK EILP 32/6/20 · E + I · N87', parts: ['B66457G0000X187', 'B66457K0000X187'], le: 35.1, volume: 4560, al: 6300e-9, height: 9.5, windowHeight: 3.2, windowMin: 3.05 },
};
export function corePresetPatch(id) {
  const p = CORE_CATALOG[id];
  if (!p) { if (id === 'custom') return { corePreset: id }; throw new Error('Unknown catalog core.'); }
  return { corePreset: id, magneticModel: 'ferrite', routedWindings: true, coreMaterial: 'N87', coreShape: 'rectangular',
    corePostW: p.postMaxW, corePostH: p.postMaxH, coreWindowHeight: p.windowMin, coreClearance: .25,
    coreAe: p.ae, coreLe: p.le, coreGap: 0, shape: 'polygon', dOuter: 22,
    primaryTurns: 3, secondaryTurns: 2, traceW: .35, traceS: .2, windingOptions: {},
    leakageModel: 'geometry', coreLossModel: 'n87-fit', coreTemperature: 100, lossModel: 'ac' };
}
export function catalogFor(c) {
  if (!c.corePreset || c.corePreset === 'custom') return null;
  const p = CORE_CATALOG[c.corePreset];
  if (!p) throw new Error('Unknown catalog core.');
  if (c.coreGap !== 0) throw new Error('Catalog parts are ungapped. Select Custom core to model an added magnetic gap.');
  if (c.corePostW !== p.postMaxW || c.corePostH !== p.postMaxH || c.coreAe !== p.ae || c.coreLe !== p.le || c.coreWindowHeight !== p.windowMin || c.coreMaterial !== p.material || c.coreShape !== 'rectangular') throw new Error('Catalog dimensions were edited. Select Custom core before changing the assembly or magnetic data.');
  if (c.shape !== 'polygon') throw new Error('Catalog E cores require the rectangular winding shape. Select Square or use a custom core.');
  return p;
}
export function coreOpenings(c) {
  const p = catalogFor(c), clearance = c.coreClearance;
  const center = rect(-c.corePostW/2-clearance, -c.corePostH/2-clearance, c.corePostW/2+clearance, c.corePostH/2+clearance);
  if (!p) return [center];
  const inner = p.innerLegSpanMin/2-clearance, outer = (p.width+.65)/2+clearance, y = p.postMaxH/2+clearance;
  return [center, rect(-outer,-y,-inner,y), rect(inner,-y,outer,y)];
}
export function assemblyStatus(c, art) {
  const p = catalogFor(c); if (!p) return null;
  const slots = coreOpenings(c), issues = [];
  // Every generated track vertex and segment is checked against all rectangular
  // leg openings expanded by half track width. Axis slab clipping catches crossings.
  const hit = (a,b,box) => {
    let lo=0,hi=1;
    for(let k=0;k<2;k++) {const d=b[k]-a[k];if(Math.abs(d)<1e-12){if(a[k]<box[k]||a[k]>box[k+2])return false;}
      else {let u=(box[k]-a[k])/d,v=(box[k+2]-a[k])/d;if(u>v)[u,v]=[v,u];lo=Math.max(lo,u);hi=Math.min(hi,v);if(lo>hi)return false;}}
    return true;
  };
  slots.forEach((pts, slot) => {
    for(const t of art.tracks){const m=t.width/2+c.traceS, xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);const b=[Math.min(...xs)-m,Math.min(...ys)-m,Math.max(...xs)+m,Math.max(...ys)+m];
      if(t.pts.slice(1).some((v,i)=>hit(t.pts[i],v,b)))issues.push(`${t.layer} copper intersects core opening ${slot+1}. Reduce winding width/turns or move terminals.`);}
    for(const v of [...art.pads,...art.vias]){const m=(v.w||v.diameter)/2+c.traceS,xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
      if(v.x>=Math.min(...xs)-m&&v.x<=Math.max(...xs)+m&&v.y>=Math.min(...ys)-m&&v.y<=Math.max(...ys)+m)issues.push(`Terminal or via intersects core opening ${slot+1}.`);}
  });
  if(c.boardT+2*c.coreClearance>p.windowMin)issues.push('PCB and clearance exceed the minimum core window.');
  return { ...p, issues: [...new Set(issues)], fits: !issues.length, openings: slots, cutoutStatus: 'Not checked against destination board' };
}

export function checkCoreCutouts(required, board, origin = [0,0], tolerance = .08) {
  // Require closed local loops, not just a nearby edge or the outside outline.
  const distance=(p,a,b)=>{const x=b[0]-a[0],y=b[1]-a[1],u=Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/(x*x+y*y||1)));return Math.hypot(p[0]-a[0]-u*x,p[1]-a[1]-u*y);};
  const directed=(a,b)=>a.every(p=>Math.min(...b.slice(1).map((q,i)=>distance(p,b[i],q)))<=tolerance);
  const results=required.map((loop,index)=>{
    const target=loop.map(([x,y])=>[x+origin[0],y-origin[1]]);
    const found=board.loops.some(loop=>directed(target,loop)&&directed(loop,target));
    return { opening:index+1, found };
  });
  return { results, complete: results.every(r=>r.found) };
}
