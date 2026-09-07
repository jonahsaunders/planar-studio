function pointDistance(p, a, b) {
  const dx=b[0]-a[0], dy=b[1]-a[1];
  const u=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy || 1)));
  return Math.hypot(p[0]-a[0]-u*dx,p[1]-a[1]-u*dy);
}
function distance(p, pts) {
  let d=Infinity;
  for(let i=1;i<pts.length;i++) d=Math.min(d,pointDistance(p,pts[i-1],pts[i]));
  return d;
}
export function interconnectGroups(art) {
  const nodes=[...art.tracks.filter(t=>!['winding','lead','transition'].includes(t.role)),
    ...art.vias.filter(v=>['bus-drop','family-drop'].includes(v.role)),...art.pads];
  const parent=nodes.map((_,i)=>i);
  const root=i=>parent[i]===i?i:(parent[i]=root(parent[i]));
  const join=(i,j)=>{parent[root(i)]=root(j);};
  for(let i=0;i<nodes.length;i++) for(let j=0;j<i;j++) {
    const a=nodes[i],b=nodes[j];
    let d, threshold;
    if(a.pts && b.pts) {
      if(a.layer!==b.layer) continue;
      d=Math.min(distance(a.pts[0],b.pts),distance(a.pts.at(-1),b.pts),distance(b.pts[0],a.pts),distance(b.pts.at(-1),a.pts));
      threshold=(a.width+b.width)/2;
    } else if(a.pts || b.pts) {
      const t=a.pts?a:b,p=a.pts?b:a;
      d=distance([p.x,p.y],t.pts);threshold=(t.width+(p.w || p.diameter))/2;
    } else { d=Math.hypot(a.x-b.x,a.y-b.y);threshold=((a.w||a.diameter)+(b.w||b.diameter))/2; }
    if(d < threshold+1e-7) join(i,j);
  }
  const groups=new Map();
  nodes.forEach((n,i)=> {if(n.number){const k=root(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(n.number);}});
  return [...groups.values()].map(g=>g.sort().join(',')).sort();
}
