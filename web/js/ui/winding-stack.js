import { el } from './controls.js';
import { windingSetup, resolveStack, tokens } from '../engine/winding-stack.js';
import { layerNames } from '../engine/coil.js';
import { transformerMode, windingSettings, windingTurns } from '../engine/transformer-config.js';

export function layerAssistant(panel, api) {
  const node = el('div', { class: 'layer-assistant' });
  const status = el('p', { role: 'status', 'aria-live': 'polite' });
  const help = el('div', { class: 'hint' });
  const refresh = el('button', { type: 'button', class: 'btn small', text: 'Refresh board settings' });
  const result = el('div', { class: 'hint', role: 'status' });
  let busy = false;
  refresh.addEventListener('click', async () => {
    busy = true; refresh.disabled = true; result.textContent = 'Reading the open KiCad board…';
    try { await api.refreshBoard(); result.textContent = 'Board settings refreshed.'; }
    catch (e) { result.textContent = e.message; }
    finally { busy = false; sync(); }
  });
  node.append(status, help, refresh, result);
  function sync() {
    const s = windingSetup(panel.state, api.boardContext());
    status.textContent = s.available == null ? `This design needs a ${s.required}-layer board. No board settings loaded.`
      : `Requires ${s.required} copper layers · Board has ${s.available}${s.insufficient ? ' · Setup needed' : ' · Layer count ready'}`;
    node.dataset.state = s.insufficient ? 'warn' : 'info';
    help.textContent = s.insufficient || s.available == null
      ? `In KiCad PCB Editor: File → Board Setup… → Board Stackup → Physical Stackup. Set Copper layers to ${s.required} or more (an even number), click OK, then refresh here. This does not change the board automatically.`
      : 'The layer count fits. Assignments and copper spacing are checked when generating geometry. Refresh after changing the KiCad stack-up.';
    refresh.disabled = busy || !api.canRefreshBoard();
  }
  return { node, set: sync };
}

export function windingEditor(panel, api) {
  const node = el('div', { class: 'winding-editor' });
  let signature = '';
  const change = values => api.setMany(values);
  function sync() {
    const c = panel.state, board = api.boardContext();
    const next = JSON.stringify([c.family,c.windingTopology,c.magneticModel,c.windingOptions,c.primaryTurns,c.secondaryTurns,c.secondary2Turns,c.secondary3Turns,c.traceW,c.stackPlan,c.copperLayers,c.layerPositions,c.boardT,c.copperOz,board?.copperLayers,board?.layerCount]);
    if (next === signature) return;
    signature = next; node.replaceChildren();
    const { plan, required, insufficient } = windingSetup(c, board);
    let mapping, error;
    try { mapping = resolveStack(c, board, plan.length); }
    catch (e) { error = e.message; try { mapping = resolveStack({ ...c, copperLayers: '', layerPositions: '' }, null, plan.length); } catch { /* malformed raw input remains editable */ } }
    const available = !insufficient && board?.copperLayers?.length ? board.copperLayers.map(l => l.name) : layerNames(Math.min(32, !insufficient && board?.layerCount ? board.layerCount : required));
    const mode=transformerMode(c);
    node.append(el('p', { class: 'hint', text: 'Front → back. Select a section to highlight its copper, connected vias and polarity. ↑/↓ swap windings while physical layers stay fixed.' }));
    for(const name of [...new Set(plan)].filter(n=>['P','S','S2','S3'].includes(n))) {
      const count=plan.filter(n=>n===name).length, settings=windingSettings(c,name);
      const width=el('input',{type:'number',min:.1,max:3,step:.05,value:settings.width,'aria-label':`${name} track width (mm)`});
      const connection=el('select',{'aria-label':`${name} section connection`},el('option',{value:'series',text:'Series'}),el('option',{value:'parallel',text:'Parallel'}));
      connection.value=settings.connection;
      const update=patch=>change({windingOptions:{...c.windingOptions,[name]:{...c.windingOptions?.[name],...patch}}});
      width.addEventListener('change',()=>{if(width.value&&Number.isFinite(Number(width.value)))update({width:Number(width.value)});});
      connection.addEventListener('change',()=>update({connection:connection.value}));
      node.append(el('div',{class:'winding-summary'},el('strong',{text:`${name} · ${windingTurns(c,name,count)} total turns`}),el('span',{class:'hint',text:`${count} sections · width in mm`}),width,connection));
    }
    if (error) node.append(el('p', { class: 'stack-error', role: 'status', text: `${error} Rows below show a suggested mapping until the configuration is valid.` }));
    const layers = mapping?.layers || [], heights = mapping?.z || [];
    plan.forEach((name, i) => {
      const row = el('div', { class: 'winding-row', dataset: { winding: name, transformerLayer: layers[i] || '' } });
      const winding = el('select', { 'aria-label': `Winding on section ${i + 1}` });
      for (const n of mode.topology.startsWith('multiple') ? ['P', 'S', 'S2', 'S3'] : ['P', 'S']) winding.append(el('option', { value: n, text: n }));
      winding.value = name;
      winding.addEventListener('change', () => { const p = [...plan]; p[i] = winding.value; change({ stackPlan: p.join(',') }); });
      const layer = el('select', { 'aria-label': `Copper layer for section ${i + 1}` });
      for (const n of available) layer.append(el('option', { value: n, text: n }));
      layer.value = layers[i] || '';
      layer.addEventListener('change', () => { const p = [...layers]; p[i] = layer.value; change({ copperLayers: p.join(','), layerPositions: '' }); });
      const height = el('input', { type: 'number', step: '0.01', min: '0', max: c.boardT, value: heights[i] == null ? '' : Number(heights[i].toFixed(4)), 'aria-label': `Copper height for section ${i + 1} (mm)` });
      height.addEventListener('change', () => {
        if (height.value === '' || !Number.isFinite(Number(height.value))) { signature = ''; sync(); return; }
        const p = [...heights]; p[i] = Number(height.value); change({ layerPositions: p.map(v => Number(v.toFixed(6))).join(',') });
      });
      const actions = el('div', { class: 'winding-actions' });
      for (const [delta, text] of [[-1, '↑'], [1, '↓']]) {
        const b = el('button', { type: 'button', class: 'btn small', text, 'aria-label': `Move winding ${i + 1} ${delta < 0 ? 'up' : 'down'}` });
        b.disabled = i + delta < 0 || i + delta >= plan.length;
        b.addEventListener('click', () => { const p = [...plan]; [p[i], p[i + delta]] = [p[i + delta], p[i]]; change({ stackPlan: p.join(',') }); });
        actions.append(b);
      }
      const remove = el('button', { type: 'button', class: 'btn small', text: 'Remove', 'aria-label': `Remove section ${i + 1}` });
      remove.disabled = plan.length <= 2;
      remove.addEventListener('click', () => change({ stackPlan: plan.filter((_, j) => j !== i).join(','), copperLayers: c.copperLayers||c.layerPositions ? layers.filter((_,j)=>j!==i).join(',') : '', layerPositions: c.layerPositions ? heights.filter((_,j)=>j!==i).join(',') : '' }));
      actions.append(remove);
      row.append(el('button',{type:'button',class:'btn small',text:`${i+1}`,'aria-label':`Highlight section ${i+1}`,onClick:()=>api.focusWinding?.(layers[i])}),layer,winding,el('label',{},height,'mm'),actions);
      node.append(row);
    });
    const add = el('button', { type: 'button', class: 'btn small', text: 'Add winding layer' });
    add.disabled = plan.length >= 8;
    add.addEventListener('click', () => change({ stackPlan: [...plan, 'S'].join(','), copperLayers: '', layerPositions: '' }));
    const reset = el('button', { type: 'button', class: 'btn small', text: 'Use automatic spacing' });
    reset.addEventListener('click', () => change({ layerPositions: '' }));
    node.append(el('div', { class: 'winding-actions' }, add, reset), el('p', { class: 'hint', text: 'Adding a section resets mapping and heights. Removing one preserves explicit assignments. Choosing a layer resets heights. Automatic spacing uses physical board heights when available; otherwise it assumes uniform spacing.' }));
    if (mode.topology.includes('tapped')) node.append(el('p', { class: 'hint', text: 'S needs an even number of series sections. The S_CT terminal is halfway through S; P+ and S+ are dotted terminals.' }));
    else node.append(el('p', { class: 'hint', text: 'Each winding runs from its dotted + terminal through its assigned sections to −. Series sections use transition vias; parallel sections share the two terminals.' }));
  }
  return { node, set: sync };
}
