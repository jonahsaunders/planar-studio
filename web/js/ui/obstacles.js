import { el } from './controls.js';
import { obstacleRegions } from '../engine/obstacles.js';
import { boardObstacleSource, boardObstaclePatch } from '../engine/board-obstacles.js';

const action = (text, onClick) => el('button', { type: 'button', class: 'btn small', text, onClick });

function outlinePreview(regions, width, height) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `${-width / 2 - 2} ${-height / 2 - 2} ${width + 4} ${height + 4}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Board obstacle editor');
  svg.classList.add('obstacle-map');
  for (const [index, shape] of [{ polygon: regions.board, name: 'Board outline' }, ...regions.obstacles].entries()) {
    const node = document.createElementNS(svg.namespaceURI, 'polygon');
    node.setAttribute('points', shape.polygon.map(([x, y]) => `${x},${-y}`).join(' '));
    node.setAttribute('fill', !index ? 'var(--bg)' : shape.kind === 'hole' ? '#b68048' : '#bb5573');
    node.setAttribute('fill-opacity', index ? 0.35 : 1);
    node.setAttribute('stroke', index ? '#ce6986' : '#8a929e');
    node.setAttribute('stroke-width', '0.25');
    if (index) node.dataset.region = index - 1;
    const title = document.createElementNS(svg.namespaceURI, 'title');
    title.textContent = shape.name;
    node.append(title);
    svg.append(node);
  }
  return svg;
}

function boardImporter(panel, api) {
  const target = el('div', { class: 'tools-mask' });
  const status = el('p', { class: 'hint', role: 'status' });
  const controls = el('div', { class: 'winding-actions' });
  const file = el('input', { type: 'file', accept: '.kicad_pcb', 'aria-label': 'Winding layout board file' });
  const output = el('div', { class: 'tools-mask' });
  let request = 0;
  async function read(load) {
    const pending = ++request;
    const designId = api.designId?.();
    output.replaceChildren();
    status.textContent = 'Reading board outline and obstacles…';
    try {
      const { text, name, excludedIds } = await load();
      if (pending !== request || designId !== api.designId?.() || !target.isConnected) return;
      preview(boardObstacleSource(text, name, excludedIds));
      status.textContent = name;
    } catch (error) {
      if (pending === request) status.textContent = error.message;
    }
  }
  function preview(source) {
    const outline = el('select', { 'aria-label': 'Board island' }, source.islands.map((_, i) =>
      el('option', { value: i, text: `Board island ${i + 1}` })));
    const holes = el('input', { type: 'checkbox', checked: true });
    const keepouts = el('fieldset', {}, el('legend', { text: 'Copper keepouts' }));
    const choices = source.keepouts.map((entry, i) => {
      const check = el('input', { type: 'checkbox', checked: true });
      keepouts.append(el('label', {}, check, entry.name || `Keepout ${i + 1}`));
      return check;
    });
    const drawing = el('div');
    const summary = el('p', { class: 'hint' });
    let patch = null;
    const apply = action('Use board constraints', () => {
      api.setMany(patch);
      output.replaceChildren();
      status.textContent = `Imported constraints from ${source.name}.`;
    });
    function redraw() {
      try {
        patch = boardObstaclePatch(source, Number(outline.value), holes.checked, choices.flatMap((c, i) => c.checked ? [i] : []));
        const regions = obstacleRegions({ ...panel.state, ...patch });
        drawing.replaceChildren(outlinePreview(regions, patch.areaWidth, patch.areaHeight));
        const { cutouts, drills, keepouts } = patch.obstacleBoard;
        summary.textContent = `${cutouts.length} cutouts · ${drills.length} drilled pads · ${keepouts.length} keepouts`;
        apply.disabled = false;
      } catch (error) {
        summary.textContent = error.message;
        drawing.replaceChildren();
        apply.disabled = true;
      }
    }
    output.append(el('label', {}, 'Board island', outline), el('label', {}, holes, 'Avoid drilled pads'), summary, drawing, apply);
    if (choices.length) output.insertBefore(keepouts, summary);
    outline.addEventListener('change', redraw);
    holes.addEventListener('change', redraw);
    keepouts.addEventListener('change', redraw);
    redraw();
  }
  const live = action('Read live board for winding', () => read(() => api.readPlacementSnapshot(api.designId())));
  file.addEventListener('change', () => {
    const selected = file.files[0];
    if (selected) read(async () => ({ name: selected.name, text: await selected.text() }));
    file.value = '';
  });
  controls.append(live, file);
  target.append(controls, status, output);
  return { target, live };
}

export function obstacleEditor(panel, api) {
  const node=el('div',{class:'obstacle-editor'});let signature='',mode=null;
  const imported = boardImporter(panel, api);
  const save=obstacles=>api.set('obstacles',obstacles);
  function sync() {
    imported.live.disabled = !api.canRefreshBoard?.();
    const c=panel.state,next=JSON.stringify([c.areaWidth,c.areaHeight,c.obstacles,c.areaClearance,c.obstacleBoard]);
    if(signature===next)return;signature=next;node.replaceChildren();
    const status=el('p',{class:'hint',role:'status',text:'Choose a region, then drag on the board to mark it. Drag an existing region to move it. Coordinates are relative to the design origin; +Y is up.'});
    const actions=el('div',{class:'winding-actions'});
    for(const [key,text]of [['hole','Mark mounting hole'],['connector','Mark connector'],['forbidden','Mark forbidden region']]) {
      const b=el('button',{type:'button',class:'btn small',text});b.addEventListener('click',()=>{mode=key;status.textContent=`Drag to mark ${key==='hole'?'a mounting-hole circle':key==='connector'?'a connector rectangle':'a forbidden rectangle'}. A click uses a default size.`;});actions.append(b);
    }
    let regions;
    try {regions=obstacleRegions(c);}catch(e){status.textContent=e.message;}
    const svg = regions ? outlinePreview(regions, c.areaWidth, c.areaHeight) : document.createElement('div');
    const point=e=>{const r=svg.getBoundingClientRect(),scale=Math.min(r.width/(c.areaWidth+4),r.height/(c.areaHeight+4));return [(e.clientX-r.left-r.width/2)/scale,-(e.clientY-r.top-r.height/2)/scale];};
    let drag=null;
    svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;const index=e.target.getAttribute('data-region');if(!mode&&(index===null||Number(index)>=c.obstacles.length))return;drag={start:point(e),index:mode?null:Number(index),mode};svg.setPointerCapture?.(e.pointerId);});
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
    node.append(imported.target);
    if (c.obstacleBoard) node.append(el('p', { class: 'hint', text: `Board constraints from ${c.obstacleBoard.name}` }),
      action('Return to a rectangular area', () => api.set('obstacleBoard', null)));
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
