import { el } from './controls.js';
import { obstacleRegions } from '../engine/obstacles.js';

export function obstacleEditor(panel, api) {
  const node=el('div',{class:'obstacle-editor'});let signature='',mode=null;
  const save=obstacles=>api.set('obstacles',obstacles);
  function sync() {
    const c=panel.state,next=JSON.stringify([c.areaWidth,c.areaHeight,c.obstacles,c.areaClearance]);
    if(signature===next)return;signature=next;node.replaceChildren();
    const status=el('p',{class:'hint',role:'status',text:'Choose a region, then drag on the board to mark it. Drag an existing region to move it. Coordinates are relative to the design origin; +Y is up.'});
    const actions=el('div',{class:'winding-actions'});
    for(const [key,text]of [['hole','Mark mounting hole'],['connector','Mark connector'],['forbidden','Mark forbidden region']]) {
      const b=el('button',{type:'button',class:'btn small',text});b.addEventListener('click',()=>{mode=key;status.textContent=`Drag to mark ${key==='hole'?'a mounting-hole circle':key==='connector'?'a connector rectangle':'a forbidden rectangle'}. A click uses a default size.`;});actions.append(b);
    }
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox',`${-c.areaWidth/2-2} ${-c.areaHeight/2-2} ${c.areaWidth+4} ${c.areaHeight+4}`);
    svg.setAttribute('role','img');svg.setAttribute('aria-label','Board obstacle editor');svg.classList.add('obstacle-map');
    const draw=(tag,attrs)=>{const n=document.createElementNS(svg.namespaceURI,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));svg.append(n);return n;};
    draw('rect',{x:-c.areaWidth/2,y:-c.areaHeight/2,width:c.areaWidth,height:c.areaHeight,fill:'var(--bg)',stroke:'#8a929e','stroke-width':0.2});
    let regions;
    try {regions=obstacleRegions(c);}catch(e){status.textContent=e.message;}
    for(const [i,o]of (regions?.obstacles||[]).entries()) {
      const p=draw('polygon',{points:o.polygon.map(([x,y])=>`${x},${-y}`).join(' '),fill:o.kind==='hole'?'#b68048':'#bb5573','fill-opacity':0.35,stroke:'#ce6986','stroke-width':0.25,'data-region':i});
      const title=document.createElementNS(svg.namespaceURI,'title');title.textContent=o.name;p.append(title);
    }
    const point=e=>{const r=svg.getBoundingClientRect(),scale=Math.min(r.width/(c.areaWidth+4),r.height/(c.areaHeight+4));return [(e.clientX-r.left-r.width/2)/scale,-(e.clientY-r.top-r.height/2)/scale];};
    let drag=null;
    svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;const index=e.target.getAttribute('data-region');if(!mode&&index===null)return;drag={start:point(e),index:mode?null:Number(index),mode};svg.setPointerCapture?.(e.pointerId);});
    svg.addEventListener('pointerup',e=>{
      if(!drag)return;const end=point(e),d=drag;drag=null;
      const obstacles=structuredClone(c.obstacles||[]);
      if(d.index!==null) {const o=obstacles[d.index];o.x+=end[0]-d.start[0];o.y+=end[1]-d.start[1];}
      else {
        const [x,y]=d.start,dx=end[0]-x,dy=end[1]-y;
        const common={kind:d.mode,name:d.mode==='hole'?'Mounting hole':d.mode==='connector'?'Connector':'Forbidden region'};
        obstacles.push(d.mode==='hole'?{...common,shape:'circle',x,y,radius:Math.max(0.5,Math.hypot(dx,dy)||2)}:{...common,shape:'rect',x:Math.abs(dx)>0.5?(x+end[0])/2:x,y:Math.abs(dy)>0.5?(y+end[1])/2:y,width:Math.max(2,Math.abs(dx)||8),height:Math.max(2,Math.abs(dy)||5)});
      }
      obstacles.forEach(o=>{o.x=Number(o.x.toFixed(2));o.y=Number(o.y.toFixed(2));});mode=null;save(obstacles);
    });
    svg.addEventListener('pointercancel',()=>{drag=null;});
    node.append(actions,status,svg);
    const add=(text,region)=>{const b=el('button',{class:'btn small',type:'button',text});b.addEventListener('click',()=>save([...(c.obstacles||[]),region]));return b;};
    node.append(el('div',{class:'winding-actions'},
      add('Add hole',{name:'Mounting hole',kind:'hole',shape:'circle',x:c.areaWidth/4,y:c.areaHeight/4,radius:2}),
      add('Add connector',{name:'Connector',kind:'connector',shape:'rect',x:c.areaWidth/2-4,y:0,width:8,height:10}),
      add('Add polygon',{name:'Forbidden polygon',kind:'forbidden',shape:'polygon',x:0,y:0,points:[[5,5],[12,5],[10,12]]})));
    (c.obstacles||[]).forEach((o,i)=>{
      const card=el('fieldset',{class:'obstacle-card'},el('legend',{text:`Region ${i+1}`}));
      const update=(key,value)=>save(c.obstacles.map((o,j)=>j===i?{...o,[key]:value}:o));
      const name=el('input',{value:o.name||'',type:'text','aria-label':`Region ${i+1} name`});name.addEventListener('change',()=>update('name',name.value));card.append(el('label',{},'Name',name));
      const fields=[['x','X'],['y','Y'],...(o.shape==='circle'?[['radius','Radius']]:o.shape==='rect'?[['width','Width'],['height','Height']]:[])];
      const grid=el('div',{class:'obstacle-fields'});
      fields.forEach(([key,label])=>{const input=el('input',{type:'number',step:0.1,value:o[key],'aria-label':`Region ${i+1} ${label} (mm)`});input.addEventListener('change',()=>{if(input.value!=='')update(key,Number(input.value));});grid.append(el('label',{},`${label} (mm)`,input));});card.append(grid);
      if(o.shape==='polygon') {
        const points=el('textarea',{'aria-label':`Region ${i+1} polygon points`,rows:3});points.value=o.points.map(p=>p.join(', ')).join('\n');
        points.addEventListener('change',()=>{const p=points.value.trim().split(/\n|;/).map(row=>row.trim().split(/[ ,]+/).map(Number));if(p.length<3||p.some(p=>p.length!==2||!p.every(Number.isFinite))){status.textContent='Enter one x, y vertex per line, relative to the region position.';return;}update('points',p);});card.append(el('label',{},'Vertices relative to X / Y (mm)',points));
      }
      const remove=el('button',{type:'button',class:'btn small',text:'Remove', 'aria-label':`Remove region ${i+1}`});remove.addEventListener('click',()=>save(c.obstacles.filter((_,j)=>i!==j)));card.append(remove);node.append(card);
    });
  }
  return {node,set:sync};
}

export function obstacleHandles(cfg,app) {
  return (cfg.obstacles||[]).map((o,i)=>({id:`obstacle-${i}`,x:o.x,y:o.y,cursor:'move',hint:`Move ${o.name||'region'}`,drag:(x,y)=>app.set('obstacles',cfg.obstacles.map((o,j)=>j===i?{...o,x:Number(x.toFixed(2)),y:Number(y.toFixed(2))}:o))}));
}
