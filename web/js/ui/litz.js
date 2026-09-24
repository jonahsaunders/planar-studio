/* Experimental PCB Litz controls and readouts. These stay separate from the
   conventional spiral's Dowell loss and isolated-trace thermal estimates. */
import { el, eng, num } from './controls.js';
import { litzPreset } from '../engine/litz.js';

export const isLitz = c => c.windingMode === 'pcb-litz';

// The standard winding rail edits the same scalar configuration keys. Give
// these entries separate panel identities so both modes synchronize correctly.
const sharedField = spec => ({ key: `_litz_${spec.key}`, type: 'custom', when: isLitz, build: panel => {
  panel.buildField(spec);
  const entry = panel.fields.get(spec.key), sync = entry.set;
  return { ...entry, set: () => sync?.(panel.state[spec.key]) };
} });

function gapEditor(panel, api) {
  const node = el('div', { class: 'litz-gap-editor' });
  const inputs = Array.from({ length: 3 }, (_, i) => {
    const label = `Dielectric gap ${i + 1} (mm)`;
    const input = el('input', { type: 'number', min: '0.05', max: '3', step: '0.01', 'aria-label': label });
    input.addEventListener('change', () => {
      if (input.value === '') return;
      const gaps = [...panel.state.litzDielectricGaps];
      gaps[i] = Number(input.value);
      api.set('litzDielectricGaps', gaps);
    });
    node.append(el('label', { class: 'field' }, el('span', { class: 'name', text: label }), input));
    return input;
  });
  return { node, set: () => inputs.forEach((input, i) => { input.value = String(panel.state.litzDielectricGaps?.[i] ?? ''); }) };
}

export function litzRail(panel, api) {
  panel.group({ key: 'winding-mode', title: 'Winding mode', fields: [
    { key: 'windingMode', type: 'select', label: 'Winding mode', options: [
      { value: 'spiral', label: 'Standard spiral' },
      { value: 'pcb-litz', label: 'PCB Litz · experimental' },
    ] },
  ] });
  panel.group({ key: 'litz-winding', title: 'PCB Litz winding', badge: 'Experimental', when: isLitz, fields: [
    { type: 'note', text: 'Sixteen strands in two concentric bundles transpose across four copper layers. Geometry and loss estimates are experimental; the preset is inspired by the paper, with routing clearances chosen for this implementation.' },
    { key: '_litzPreset', type: 'custom', build: () => ({ node: el('button', { type: 'button', class: 'btn small', text: 'Load paper-inspired preset', onclick: () => api.setMany({ ...litzPreset(), windingMode: 'pcb-litz', litzConfigured: true, litzHighlight: 'all' }) }) }) },
    sharedField({ key: 'turns', type: 'number', label: 'Litz coil turns', hint: 'Whole turns shared by all sixteen parallel strands.' }),
    sharedField({ key: 'dOuter', type: 'number', label: 'Litz outer diameter', unit: 'mm', hint: 'Nominal spiral diameter. Via fanouts and terminals extend beyond this diameter; read the generated dimensions below.' }),
    sharedField({ key: 'traceW', type: 'number', label: 'Strand trace width', unit: 'mm' }),
    { key: 'litzStrandGap', type: 'number', label: 'Strand gap', unit: 'mm' },
    { key: 'litzTurnSpacing', type: 'number', label: 'Turn spacing', unit: 'mm' },
    { key: 'litzStepDeg', type: 'number', label: 'Transposition step', unit: '°', hint: `Allowed steps are 7.5°, 15° and 30°, subject to routing fit. This preset uses ${litzPreset().litzStepDeg}°. The paper used 10°; this is not an exact reproduction.` },
    { key: 'litzHighlight', type: 'select', label: 'Highlight Litz copper', options: [
      { value: 'all', label: 'All strands' }, { value: 'outer', label: 'Outer bundle' }, { value: 'inner', label: 'Inner bundle' },
      ...Array.from({ length: 16 }, (_, i) => ({ value: `strand:${i}`, label: `Strand ${i + 1}` })),
    ], hint: 'Highlight a complete electrical strand across layers. Layer visibility controls still apply.' },
  ] });
  panel.group({ key: 'litz-process', title: 'Litz stack and vias', when: isLitz, fields: [
    { type: 'note', text: 'Four-layer geometry uses explicit via spans. Confirm the chosen blind/buried via process and dielectric stack with your PCB manufacturer.' },
    { key: '_litzGaps', type: 'custom', build: p => gapEditor(p, api) },
    { key: 'litzViaDrill', type: 'number', label: 'Litz via drill', unit: 'mm' },
    { key: 'litzViaDiameter', type: 'number', label: 'Litz via pad diameter', unit: 'mm' },
    { key: 'litzViaPlating', type: 'number', label: 'Litz via plating', unit: 'µm' },
    sharedField({ key: 'copperOz', type: 'number', label: 'Litz copper weight', unit: 'oz', hint: '1 oz is 34.8 µm of copper.' }),
    sharedField({ key: 'tempC', type: 'number', label: 'Litz operating temperature', unit: '°C' }),
    { key: '_litzStackTotal', type: 'custom', when: isLitz, build: p => {
      const node = el('p', { class: 'hint', role: 'status' });
      return { node, set: () => { node.textContent = `Calculated four-layer board thickness: ${num(p.state.boardT, 3)} mm. Changing a dielectric gap or copper weight updates this total.`; } };
    } },
  ] });
  panel.group({ key: 'litz-model', title: 'Litz electrical model', when: isLitz, fields: [
    { key: 'litzModelSegments', type: 'custom', build: () => {
      const select = el('select', { 'aria-label': 'Litz model resolution' },
        ...[[96, 'preview'], [192, 'refine'], [384, 'convergence check']].map(([value, label]) => el('option', { value: String(value), text: `${value} · ${label}` })));
      select.addEventListener('change', () => api.set('litzModelSegments', Number(select.value)));
      return { node: el('div', { class: 'field' }, el('div', { class: 'lab', text: 'Litz model resolution' }), select,
        el('p', { class: 'hint', text: 'Target subdivisions per strand; section endpoints and vias are always retained. Higher resolution increases solve time. Convergence does not establish accuracy of the AC loss model.' })), set: value => { select.value = String(value); } };
    } },
    { type: 'note', text: 'Calculated current sharing and Q use a simplified strand model that may understate loss and overstate Q. These estimates need simulation or measurement comparison.' },
  ] });
}

export function litzTiles(cfg, res) {
  const g = res.litz, a = res.analysis, v = res.validation;
  const out = [
    { k: 'PCB Litz', v: '16 strands · 4 layers', sub: '2 bundles · experimental', wide: true },
    { k: 'Routing validation', v: v?.ok ? 'Passed' : 'Needs attention', tone: v?.ok ? 'good' : 'bad', sub: v?.ok ? `${num(v.minClearance, 3)} mm minimum checked gap` : `${v?.errors?.length || 0} routing errors`, wide: true },
    { k: 'Vias', v: String(g.art.vias.length), sub: 'Includes strand transpositions' },
  ];
  if (!a) return out;
  return out.concat([
    { k: 'Estimated L', v: eng(a.L, 'H', 4) },
    { k: 'Estimated R dc', v: eng(a.Rdc, 'Ω', 4) },
    { k: 'Estimated R ac', v: eng(a.Rac, 'Ω', 4), sub: `at ${eng(cfg.freq, 'Hz')}` },
    { k: 'Estimated Q', v: num(a.Q, 1), sub: 'Unvalidated AC model' },
    { k: 'Estimated copper loss', v: eng(a.Ploss, 'W'), sub: `${num(cfg.current, 2)} A RMS; no thermal rating` },
    { k: 'Self-resonance', v: 'Unknown', sub: 'Distributed capacitance not solved' },
    ...(a.lumpedResonanceHz ? [{ k: 'Lumped resonance', v: eng(a.lumpedResonanceHz, 'Hz'), sub: 'From supplied capacitance only' }] : []),
  ]);
}

export function litzSpec(cfg, res) {
  const a = res.analysis, g = res.litz;
  const out = [{ title: 'Experimental PCB Litz geometry', rows: [
    ['Topology', '16 strands; 2 concentric bundles; 4 copper layers'],
    ['Turns / nominal outer diameter', `${cfg.turns} / ${num(cfg.dOuter, 2)} mm`],
    ['Generated winding outer diameter / bore', `${num(g.stats.outerDiameterMM, 2)} / ${num(g.stats.innerDiameterMM, 2)} mm`],
    ['Ribbon width', `${num(g.stats.ribbonWidthMM, 3)} mm`],
    ['Strand width / gap', `${num(cfg.traceW, 3)} / ${num(cfg.litzStrandGap, 3)} mm`],
    ['Turn spacing / transposition step', `${num(cfg.litzTurnSpacing, 3)} mm / ${num(cfg.litzStepDeg, 1)}°`],
    ['Dielectric gaps', `${cfg.litzDielectricGaps.map(v => num(v, 3)).join(' / ')} mm`],
    ['Board thickness including copper', `${num(cfg.boardT, 3)} mm`],
    ['Via count', String(g.art.vias.length)],
    ['Via drill / pad diameter', `${num(cfg.litzViaDrill, 3)} / ${num(cfg.litzViaDiameter, 3)} mm`],
    ['Copper layers', res.layers.join(', ')],
    ['Routing checks', res.validation?.ok ? 'Passed implemented geometric checks' : 'Failed — repair before fabrication'],
  ], note: 'The conservative preset differs from the paper geometry. A geometric check is not a certification of a fabrication process.' }];
  if (!a) return out;
  out.push({ title: 'Experimental electrical estimates', note: a.method || a.model || 'Experimental strand network model.', rows: [
    ['Inductance', eng(a.L, 'H', 4)], ['DC resistance', eng(a.Rdc, 'Ω', 4)], ['AC resistance', eng(a.Rac, 'Ω', 4)],
    ['Q at operating frequency', `${num(a.Q, 2)} at ${eng(cfg.freq, 'Hz')}`],
    ['AC / DC resistance ratio', num(a.Fr, 3)], ['Copper loss', eng(a.Ploss, 'W', 4)],
    ['Supplied parallel capacitance', eng(a.Ctot, 'F', 3)],
    ['Intrinsic self-resonance', 'Unknown; intrinsic capacitance is not solved'],
    ...(a.lumpedResonanceHz ? [['Lumped resonance with supplied capacitance', eng(a.lumpedResonanceHz, 'Hz')]] : []),
  ] });
  if (a.currentShares?.length) out.push({ title: 'Estimated strand currents', note: 'Phasors are relative to total winding current. Magnitude percentages need not sum to 100% when phases differ.', rows: a.currentShares.map(s => [
    `Strand ${Number(s.id) + 1}${s.bundle ? ` · ${s.bundle}` : ''}`,
    `${num(s.percent, 2)}% · ${num(s.phase, 2)}° · ${eng(s.Rdc, 'Ω', 3)} DC`,
  ]) });
  out.push({ title: 'Paper reference', note: 'Independent measurements reported by Kale and Wicht, WPTCE 2026, DOI 10.1109/WPTCE66920.2026.11691238. These values do not validate this generated layout or its model.', rows: [
    ['Measured paper coil at 6.78 MHz', 'L = 3.44 µH; ESR = 0.425 Ω; Q = 344.5'],
  ] });
  return out;
}

export function litzNotes(cfg, res) {
  const out = [{ level: 'warn', text: 'Experimental PCB Litz: the AC model may understate loss and overstate Q. Current sharing and Q are not validated predictions of the paper’s measured performance.' }];
  for (const n of res.art?.notes || []) out.push(typeof n === 'string' ? { level: 'info', text: n } : n);
  for (const e of (res.validation?.errors || []).slice(0, 12)) {
    const where = [e.layer, e.strandIds?.filter(id => id != null).map(id => `strand ${Number(id) + 1}`).join(' / ')].filter(Boolean).join(', ');
    const distance = Number.isFinite(e.clearance) ? ` Checked gap ${num(e.clearance, 3)} mm.` : '';
    out.push({ level: 'error', text: `${e.message || String(e)}${where ? ` (${where})` : ''}${distance}` });
  }
  if (res.validation?.errors.length > 12) out.push({ level: 'error', text: `${res.validation.errors.length - 12} additional routing findings. Repair the dimensions or reload the preset before placement.` });
  for (const w of res.validation?.warnings || []) out.push({ level: 'warn', text: w.message || String(w) });
  for (const w of res.analysis?.warnings || []) out.push({ level: 'warn', text: w.message || String(w) });
  for (const text of res.analysis?.limitations || []) out.push({ level: 'info', text });
  if (res.analysis && !res.analysis.srfKnown) out.push({ level: 'warn', text: 'Intrinsic distributed capacitance and self-resonance are unknown. The frequency curves show the strand model without an intrinsic resonance limit.' });
  return out;
}

export function litzCharts(cfg, res) {
  if (!res.sweep?.length) return [];
  const f = res.sweep.map(p => p.f);
  return [
    ['q', 'Estimated Q against frequency', 'Q', 'Q'],
    ['rac', 'Estimated AC resistance', 'R', 'R Ω'],
    ['z', 'Estimated impedance magnitude', 'Z', '|Z| Ω'],
  ].map(([id, title, key, label]) => ({ id, title,
    note: 'Experimental strand model. Intrinsic capacitance, MHz current crowding and losses require external validation.',
    spec: { x: { values: f, label: 'f', log: true, format: v => eng(v, 'Hz') },
      y: { label, min: 0, format: v => num(v, 1) },
      series: [{ name: `Estimated ${key}`, values: res.sweep.map(p => p[key] > 0 ? p[key] : NaN) }],
      markers: [{ x: cfg.freq, label: 'f₀' }],
    },
  }));
}
