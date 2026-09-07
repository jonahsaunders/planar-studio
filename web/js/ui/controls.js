/* ============================================================================
   CONTROLS — declarative parameter panels.

   Each workspace declares its parameters as data and this builds them. Two
   things it does that a plain form does not:

   • A slider and a number box are one control, not two. You can drag for feel
     or type for precision, and typing is not clamped to the slider's range —
     the slider is a convenient span, not a limit, so a coil can be 400 mm
     across even though dragging only reaches 120.

   • `when` hides a field that does not apply. A racetrack has an aspect ratio
     and a polygon does not; showing a dead control is worse than showing
     nothing, because it invites you to change something that has no effect.
   ========================================================================= */

const svgNS = 'http://www.w3.org/2000/svg';

export function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

export function icon(path, size = 13) {
  const s = document.createElementNS(svgNS, 'svg');
  s.setAttribute('viewBox', '0 0 16 16');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.5');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  const p = document.createElementNS(svgNS, 'path');
  p.setAttribute('d', path);
  s.append(p);
  return s;
}

export const ICONS = {
  chev: 'M6 3.5 10.5 8 6 12.5',
  info: 'M8 7.2v4M8 4.8h.01M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13Z',
  warn: 'M8 6v3.2M8 11.6h.01M6.9 2.4 1.6 12a1.2 1.2 0 0 0 1.1 1.8h10.6A1.2 1.2 0 0 0 14.4 12L9.1 2.4a1.2 1.2 0 0 0-2.2 0Z',
  ok:   'M3 8.5 6.4 12 13 4.5',
  err:  'M10.5 5.5 5.5 10.5M5.5 5.5l5 5M8 14.5A6.5 6.5 0 1 0 8 1.5a6.5 6.5 0 0 0 0 13Z',
  x:    'M11.5 4.5 4.5 11.5M4.5 4.5l7 7',
};

/* --------------------------------------------------------------------------
   Number formatting used by both the controls and the readouts
   ----------------------------------------------------------------------- */

const SI = [
  [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''],
  [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f'],
];

/** Engineering notation: 4.7 nH, 2.45 GHz, 120 mΩ. */
export function eng(value, unit = '', digits = 3) {
  if (value == null || !isFinite(value)) return '—';
  if (value === 0) return `0 ${unit}`.trim();
  const a = Math.abs(value);
  for (const [scale, prefix] of SI) {
    if (a >= scale * 0.9995) {
      const v = value / scale;
      const d = Math.max(0, digits - Math.floor(Math.log10(Math.abs(v))) - 1);
      return `${v.toFixed(Math.min(d, 4))} ${prefix}${unit}`.trim();
    }
  }
  return `${value.toExponential(2)} ${unit}`.trim();
}

/** Fixed decimals, with a dash for nothing. */
export const num = (v, d = 2) => (v == null || !isFinite(v) ? '—' : v.toFixed(d));

/** Parse a value that may carry an SI prefix: "4.7n", "2.4G", "100k". */
export function parseEng(text) {
  const m = String(text).trim().match(/^([-+]?[\d.]+(?:[eE][-+]?\d+)?)\s*([TGMkKmuµnpf]?)/);
  if (!m) return NaN;
  const base = parseFloat(m[1]);
  const mult = { T: 1e12, G: 1e9, M: 1e6, k: 1e3, K: 1e3, '': 1, m: 1e-3, u: 1e-6, µ: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 }[m[2]];
  return base * (mult == null ? 1 : mult);
}

/* --------------------------------------------------------------------------
   Panel
   ----------------------------------------------------------------------- */

export class Panel {
  /**
   * @param {HTMLElement} host
   * @param {object} state   the config object being edited
   * @param {Function} onChange (key, value, spec) => void
   */
  constructor(host, state, onChange) {
    this.host = host;
    this.state = state;
    this.onChange = onChange;
    this.fields = new Map();
    this.groups = [];
    this.openState = new Map();
  }

  clear() {
    // Remember which groups were open so a workspace switch does not reset
    // the reader's place in the panel.
    for (const g of this.groups) this.openState.set(g.dataset.key, g.open);
    this.host.replaceChildren();
    this.fields.clear();
    this.groups = [];
  }

  /** @param {object} spec {key, title, badge, open, fields:[...]} */
  group(spec) {
    const remembered = this.openState.get(spec.key);
    const det = el('details', {
      class: 'group',
      dataset: { key: spec.key },
      open: remembered != null ? remembered : (spec.open !== false),
    });
    const badge = el('span', { class: 'badge', text: spec.badge || '' });
    det.append(el('summary', {}, icon(ICONS.chev, 10), el('span', { text: spec.title }), badge));
    const body = el('div', { class: 'group-body' });
    det.append(body);
    this.host.append(det);
    this.groups.push(det);
    det._badge = badge;
    det._when = spec.when;

    for (const f of spec.fields || []) {
      if (!f) continue;
      const node = this.buildField(f);
      if (node) body.append(node);
    }
    return det;
  }

  setBadge(key, text) {
    const g = this.groups.find((x) => x.dataset.key === key);
    if (g && g._badge) g._badge.textContent = text || '';
  }

  buildField(spec) {
    const builder = {
      range: buildRange, number: buildNumber, select: buildSelect,
      seg: buildSeg, check: buildCheck, text: buildText,
      shapes: buildShapes, note: buildNote, row: buildRow, action: buildAction,
    }[spec.type] || buildRange;
    const entry = builder(spec, this);
    if (!entry) return null;
    if (spec.key) this.fields.set(spec.key, entry);
    if (spec.when) entry.when = spec.when;
    return entry.node;
  }

  /** Push state values into the controls, and apply `when` visibility. */
  sync() {
    for (const group of this.groups) group.hidden = !!group._when && !group._when(this.state);
    for (const [key, entry] of this.fields) {
      if (entry.when) {
        const visible = entry.when(this.state);
        entry.node.style.display = visible ? '' : 'none';
        if (!visible) continue;
      }
      if (entry.set) entry.set(this.state[key]);
    }
  }

  commit(key, value, spec) {
    this.state[key] = value;
    this.onChange(key, value, spec);
  }
}

/* --------------------------------------------------------------------------
   Field builders
   ----------------------------------------------------------------------- */

function labelRow(spec, valueNode) {
  return el('div', { class: 'lab' },
    el('span', { class: 'name', text: spec.label, title: spec.hint || '' }),
    valueNode,
    spec.unit ? el('span', { class: 'unit', text: spec.unit }) : null);
}

function buildRange(spec, panel) {
  const box = el('input', {
    class: 'val', type: 'text', inputmode: 'decimal',
    'aria-label': spec.label, spellcheck: 'false',
  });
  const slider = el('input', {
    type: 'range',
    min: spec.min, max: spec.max, step: spec.step != null ? spec.step : 'any',
  });
  const node = el('div', { class: 'field' }, labelRow(spec, box), slider,
    spec.hint ? el('div', { class: 'hint', text: spec.hint }) : null);

  const decimals = spec.decimals != null ? spec.decimals : decimalsFor(spec.step);
  const show = (v) => {
    box.value = spec.format ? spec.format(v) : Number(v).toFixed(decimals);
    slider.value = clampToRange(v, spec);
    const pct = ((clampToRange(v, spec) - spec.min) / (spec.max - spec.min)) * 100;
    slider.style.setProperty('--fill', `${Math.max(0, Math.min(100, pct))}%`);
  };

  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    show(v);
    panel.commit(spec.key, v, spec);
  });
  const commitBox = () => {
    const raw = spec.si ? parseEng(box.value) : parseFloat(box.value);
    if (!isFinite(raw)) { show(panel.state[spec.key]); return; }
    const v = spec.hardMin != null || spec.hardMax != null
      ? Math.min(spec.hardMax != null ? spec.hardMax : Infinity, Math.max(spec.hardMin != null ? spec.hardMin : -Infinity, raw))
      : raw;
    show(v);
    panel.commit(spec.key, v, spec);
  };
  box.addEventListener('change', commitBox);
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { commitBox(); box.blur(); }
    // Arrow keys nudge by the step, shift for ten times that.
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = (spec.step || 0.01) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
      const v = (parseFloat(box.value) || 0) + step;
      show(v); panel.commit(spec.key, v, spec);
    }
  });

  return { node, set: show, spec };
}

function clampToRange(v, spec) {
  return Math.max(spec.min, Math.min(spec.max, Number(v) || 0));
}
function decimalsFor(step) {
  if (!step || step >= 1) return 0;
  return Math.min(4, Math.max(0, Math.ceil(-Math.log10(step))));
}

function buildNumber(spec, panel) {
  const box = el('input', { class: 'val', type: 'text', spellcheck: 'false', 'aria-label': spec.label });
  const node = el('div', { class: 'field' }, labelRow(spec, box),
    spec.hint ? el('div', { class: 'hint', text: spec.hint }) : null);
  const show = (v) => { box.value = spec.format ? spec.format(v) : String(v); };
  const commit = () => {
    const v = spec.si ? parseEng(box.value) : parseFloat(box.value);
    if (!isFinite(v)) { show(panel.state[spec.key]); return; }
    show(v);
    panel.commit(spec.key, v, spec);
  };
  box.addEventListener('change', commit);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { commit(); box.blur(); } });
  return { node, set: show, spec };
}

function buildSelect(spec, panel) {
  const sel = el('select', { 'aria-label': spec.label });
  for (const o of spec.options) {
    sel.append(el('option', { value: o.value, text: o.label, title: o.hint || '' }));
  }
  sel.addEventListener('change', () => panel.commit(spec.key, sel.value, spec));
  const node = el('div', { class: 'field' },
    spec.label ? el('div', { class: 'lab' }, el('span', { class: 'name', text: spec.label })) : null,
    sel,
    spec.hint ? el('div', { class: 'hint', text: spec.hint }) : null);
  const hintNode = node.querySelector('.hint');
  return {
    node,
    set: (v) => {
      sel.value = v;
      if (hintNode && spec.optionHint) {
        const o = spec.options.find((x) => String(x.value) === String(v));
        hintNode.textContent = (o && o.hint) || spec.hint || '';
      }
    },
    spec,
  };
}

function buildSeg(spec, panel) {
  const wrap = el('div', { class: 'seg', role: 'group', 'aria-label': spec.label });
  const buttons = spec.options.map((o) => {
    const b = el('button', { type: 'button', text: o.label, title: o.hint || '', dataset: { value: o.value } });
    b.addEventListener('click', () => panel.commit(spec.key, o.value, spec));
    wrap.append(b);
    return b;
  });
  const node = el('div', { class: 'field' },
    spec.label ? el('div', { class: 'lab' }, el('span', { class: 'name', text: spec.label })) : null,
    wrap,
    spec.hint ? el('div', { class: 'hint', text: spec.hint }) : null);
  return {
    node,
    set: (v) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === String(v)))),
    spec,
  };
}

function buildCheck(spec, panel) {
  const input = el('input', { type: 'checkbox' });
  input.addEventListener('change', () => panel.commit(spec.key, input.checked, spec));
  const node = el('label', { class: 'check', title: spec.hint || '' }, input, el('span', { text: spec.label }));
  return { node, set: (v) => { input.checked = !!v; }, spec };
}

function buildText(spec, panel) {
  const input = el('input', { class: 'textin', type: 'text', spellcheck: 'false', placeholder: spec.placeholder || '', 'aria-label': spec.label });
  const commit = () => panel.commit(spec.key, input.value, spec);
  input.addEventListener('change', commit);
  const node = el('div', { class: 'field' },
    spec.label ? el('div', { class: 'lab' }, el('span', { class: 'name', text: spec.label })) : null,
    input,
    spec.hint ? el('div', { class: 'hint', text: spec.hint }) : null);
  return { node, set: (v) => { input.value = v == null ? '' : v; }, spec };
}

/* Winding-shape picker with a miniature of each family. */
const SHAPE_ART = {
  circle: 'M13 13a5.6 5.6 0 1 1-1.9-4.2A4.1 4.1 0 1 0 13 13Z',
  polygon: 'M13 4.6H4.6v8.4h6.6V7.2H7.3v3.6',
  racetrack: 'M13 8.4a3.8 3.8 0 0 0-3.8-3.8H7.8A3.8 3.8 0 0 0 4 8.4v.2a3.8 3.8 0 0 0 3.8 3.8h1.4A2.4 2.4 0 0 0 11.6 10v-.2A2.4 2.4 0 0 0 9.2 7.4H8.4',
  log: 'M13 10.5A5 5 0 1 1 6 5.2a3.2 3.2 0 1 0 3.4 4.4',
  wedge: 'M3.4 12.4A7 7 0 0 1 13 5.6M5.2 12.6a5 5 0 0 1 6.6-4.8M6.9 12.8a3 3 0 0 1 3.6-3',
  super: 'M8.5 3c2 2.6 4.5 2.9 4.5 5.5S10.5 13 8.5 13 4 11.1 4 8.5 6.5 5.6 8.5 3Z',
  custom: 'M4 11.5c1-3.4 2.6-5.2 4.6-5.4 2-.2 3.4 1 3.4 2.6 0 1.4-1.2 2.5-2.6 2.5M4 11.5h1.4M12 4.5h.01',
};

function buildShapes(spec, panel) {
  const wrap = el('div', { class: 'shapes' });
  const buttons = spec.options.map((o) => {
    const s = document.createElementNS(svgNS, 'svg');
    s.setAttribute('viewBox', '0 0 17 17');
    s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.25');
    s.setAttribute('stroke-linecap', 'round');
    s.setAttribute('stroke-linejoin', 'round');
    const p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', SHAPE_ART[o.value] || SHAPE_ART.circle);
    s.append(p);
    const b = el('button', { type: 'button', class: 'shape', title: o.hint || o.label, dataset: { value: o.value } });
    b.append(s, el('span', { text: o.label }));
    b.addEventListener('click', () => panel.commit(spec.key, o.value, spec));
    wrap.append(b);
    return b;
  });
  const node = el('div', { class: 'field' }, wrap,
    spec.hint ? el('div', { class: 'hint', text: spec.hint }) : null);
  const hintNode = node.querySelector('.hint');
  return {
    node,
    set: (v) => {
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === String(v))));
      if (hintNode && spec.optionHint) {
        const o = spec.options.find((x) => x.value === v);
        hintNode.textContent = (o && o.hint) || '';
      }
    },
    spec,
  };
}

function buildNote(spec) {
  const node = el('div', { class: 'hint', text: spec.text || '' });
  return { node, set: () => {}, spec };
}

function buildRow(spec, panel) {
  const node = el('div', { style: 'display:flex; gap:6px;' });
  for (const b of spec.buttons || []) {
    const btn = el('button', { class: `btn small ${b.variant || ''}`, type: 'button', text: b.label, title: b.hint || '' });
    btn.style.flex = '1';
    btn.addEventListener('click', () => b.onClick(panel));
    node.append(btn);
  }
  return { node, set: () => {}, spec };
}

function buildAction(spec, panel) {
  const btn = el('button', { class: `btn ${spec.variant || ''}`, type: 'button', text: spec.label, title: spec.hint || '' });
  btn.addEventListener('click', () => spec.onClick(panel));
  const node = el('div', { class: 'field' }, btn,
    spec.hint ? el('div', { class: 'hint', text: spec.hint }) : null);
  return { node, set: () => {}, spec, button: btn };
}

/* --------------------------------------------------------------------------
   Readout helpers used by the analysis side panel
   ----------------------------------------------------------------------- */

export function tile(k, value, unit, opt = {}) {
  return el('div', { class: `tile ${opt.tone || ''} ${opt.wide ? 'wide' : ''}`, title: opt.title || '' },
    el('div', { class: 'k', text: k }),
    el('div', { class: 'v' }, String(value), unit ? el('span', { class: 'u', text: ` ${unit}` }) : null),
    opt.sub ? el('div', { class: 'sub', text: opt.sub }) : null);
}

export function specTable(rows) {
  const t = el('table', { class: 'spec' });
  for (const r of rows) {
    if (!r) continue;
    if (r === '---') { t.append(el('tr', { class: 'sep' }, el('td', { colspan: 2 }))); continue; }
    const [k, v, dim] = r;
    t.append(el('tr', {}, el('td', { text: k }), el('td', { class: dim ? 'dim' : '', text: v })));
  }
  return t;
}

export function noteList(notes) {
  const wrap = el('div', { class: 'notes' });
  for (const n of notes) {
    const level = n.level || 'info';
    const path = { warn: ICONS.warn, error: ICONS.err, ok: ICONS.ok }[level] || ICONS.info;
    const mark = icon(path, 13);
    mark.classList.add('ic');
    wrap.append(el('div', { class: 'note', dataset: { level } }, mark, el('span', { text: n.text })));
  }
  return wrap;
}
