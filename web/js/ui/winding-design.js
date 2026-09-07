import { el, num } from './controls.js';
import { windingSchedule, windingPhasors, compatibleWindings } from '../engine/winding-design.js';
const name = p => String.fromCharCode(65 + p);
const colors = ['#ce5959', '#66b081', '#579cd1', '#bf7ad7', '#d4a850', '#59bdbb'];

export function windingDesigner(panel, api) {
  const node = el('div', { class: 'winding-designer' });
  let signature = '';
  function sync() {
    const c = panel.state, next = JSON.stringify([c.coilCount, c.phases, c.polePairs, c.coilSeries, c.spanDeg, c.windingMode, c.windingSchedule]);
    if (signature === next) return; signature = next; node.replaceChildren();
    const mode = el('select', { 'aria-label': 'Winding assignments' });
    for (const [value, text] of [['repeat', 'Repeating phases'], ['auto', 'Automatic phase / polarity'], ['custom', 'Custom assignments']]) mode.append(el('option', { value, text }));
    mode.value = c.windingMode || 'repeat';
    mode.addEventListener('change', () => {
      let schedule;
      try { schedule = windingSchedule(c); } catch { schedule = windingSchedule({ ...c, windingMode: 'auto' }); }
      api.setMany({ windingMode: mode.value, ...(mode.value === 'custom' ? { windingSchedule: schedule } : {}) });
    });
    node.append(el('label', {}, 'Assignments ', mode));
    let schedule;
    try { schedule = windingSchedule(c); }
    catch (e) { node.append(el('p', { class: 'stack-error', text: e.message })); }
    const reset = el('button', { class: 'btn small', type: 'button', text: 'Reset to automatic' });
    reset.addEventListener('click', () => api.setMany({ windingMode: 'auto', windingSchedule: null }));
    node.append(reset);
    if (!schedule) return;
    node.append(el('p', { class: 'hint', text: 'Coils in the same phase and branch connect in series, in coil order. Different branches of a phase connect in parallel. Polarity mirrors the physical winding. Editing a row switches to Custom.' }));
    const table = el('table', { class: 'design-table' });
    table.append(el('thead', {}, el('tr', {}, ...['Coil', 'Phase', 'Polarity', 'Branch'].map(text => el('th', { text })))));
    const body = el('tbody'); table.append(body);
    schedule.forEach((s, i) => {
      const row = el('tr'); row.append(el('th', { scope: 'row', text: `C${i + 1}` }));
      const change = (key, value) => api.setMany({ windingMode: 'custom', windingSchedule: schedule.map((s, j) => j === i ? { ...s, [key]: value } : { ...s }) });
      for (const [key, options] of [['phase', Array.from({ length: c.phases }, (_, p) => [p, name(p)])], ['polarity', [[1, '+'], [-1, '−']]]]) {
        const select = el('select', { 'aria-label': `Coil ${i + 1} ${key}` });
        options.forEach(([value, text]) => select.append(el('option', { value, text })));
        select.value = String(s[key]); select.addEventListener('change', () => change(key, Number(select.value)));
        row.append(el('td', {}, select));
      }
      const branch = el('input', { type: 'number', min: 1, max: 48, step: 1, value: s.branch, 'aria-label': `Coil ${i + 1} branch` });
      branch.addEventListener('change', () => { if (branch.value !== '') change('branch', Number(branch.value)); });
      row.append(el('td', {}, branch)); body.append(row);
    });
    const scroll = el('div', { class: 'design-table-scroll' }, table); node.append(scroll);
    const suggestions = compatibleWindings(c);
    node.append(el('p', { class: 'hint', text: 'Suggested pole counts for this coil count and span (ranked by fundamental winding factor). Applying one uses Automatic assignments.' }));
    const actions = el('div', { class: 'winding-actions' });
    suggestions.forEach(s => {
      const b = el('button', { type: 'button', class: 'btn small', text: `${2 * s.polePairs} poles · kw ${num(s.kw, 2)}` });
      b.addEventListener('click', () => api.setMany({ polePairs: s.polePairs, windingMode: 'auto', windingSchedule: null })); actions.append(b);
    });
    node.append(actions);
    if (!suggestions.length) node.append(el('p', { class: 'hint', text: 'No balanced candidate found in 1–30 pole pairs. Try a different coil count or series connection.' }));
  }
  return { node, set: sync };
}

export function windingPreview(cfg, res) {
  if (!['rotary', 'dual-rotor'].includes(res.family)) return null;
  const w = res.motor?.winding || windingPhasors(cfg);
  const node = el('div', { class: 'side-section' }, el('h3', { text: 'Winding phasors' }));
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 300 220'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Coil contributions and resultant phase phasors'); svg.style.width = '100%';
  const add = (tag, attrs, text) => { const n = document.createElementNS(svg.namespaceURI, tag); Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v)); if (text) n.textContent = text; svg.append(n); };
  add('circle', { cx: 150, cy: 105, r: 80, fill: 'none', stroke: '#8c939f', 'stroke-opacity': 0.4 });
  w.schedule.forEach((s, i) => {
    const angle = 2 * Math.PI * cfg.polePairs * i / cfg.coilCount + (s.polarity < 0 ? Math.PI : 0);
    add('line', { x1: 150, y1: 105, x2: 150 + 80 * Math.cos(angle), y2: 105 - 80 * Math.sin(angle), stroke: colors[s.phase], 'stroke-opacity': 0.2, 'stroke-width': 1 });
  });
  w.phases.forEach(p => {
    const x = 80 * p.re / Math.max(p.effectiveTurns, 1e-12), y = -80 * p.im / Math.max(p.effectiveTurns, 1e-12);
    add('line', { x1: 150, y1: 105, x2: 150 + x, y2: 105 + y, stroke: colors[p.phase], 'stroke-width': 3 });
    add('circle', { cx: 150 + x, cy: 105 + y, r: 4, fill: colors[p.phase] });
    add('text', { x: 150 + x + 7, y: 105 + y - 7, fill: colors[p.phase], 'font-size': 13 }, name(p.phase));
  });
  node.append(svg, el('p', { class: 'hint', text: `Faint rays: signed coil contributions. Bold rays: phase resultant / effective series coil count. Distribution factor ${num(w.kd, 3)}; drive sequence ${w.sequence > 0 ? 'reverse phase order' : 'forward phase order'}.` }));
  const table = el('table', { class: 'design-table' });
  table.append(el('thead', {}, el('tr', {}, ...['Phase', 'kd', 'Angle', 'Branches'].map(text => el('th', { text })))));
  const body = el('tbody');
  w.phases.forEach(p => body.append(el('tr', {}, ...[name(p.phase), num(p.kd, 3), `${num(p.angle * 180 / Math.PI, 1)}°`, String(p.branches.length)].map(text => el('td', { text })))));
  table.append(body); node.append(table); return node;
}
