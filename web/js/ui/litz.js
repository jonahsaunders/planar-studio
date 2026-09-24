/* Experimental PCB Litz controls and readouts. These stay separate from the
   conventional spiral's Dowell loss and isolated-trace thermal estimates. */
import { el, eng, num } from './controls.js';
import { litzPreset } from '../engine/litz.js';
import { FAB_PROFILES } from '../engine/litz-manufacturing.js';
import { checkLitzFit, suggestLitzFit } from '../engine/litz-sizing.js';

export const isLitz = c => c.windingMode === 'pcb-litz';

// The standard winding rail edits the same scalar configuration keys. Give
// these entries separate panel identities so both modes synchronize correctly.
const sharedField = spec => ({ key: `_litz_${spec.key}`, type: 'custom', when: c => isLitz(c) && (!spec.when || spec.when(c)), build: panel => {
  panel.buildField(spec);
  const entry = panel.fields.get(spec.key), sync = entry.set;
  return { ...entry, set: () => sync?.(panel.state[spec.key]) };
} });

function sizingHelp(panel, api) {
  const node = el('div', { class: 'litz-sizing-help', 'aria-label': 'Litz sizing guidance' });
  const keys = ['shape', 'layers', 'turns', 'dOuter', 'traceW', 'obstacleEnabled', 'arrayEnabled', 'motorGeometry',
    'litzSizeMode', 'litzTargetOuter', 'litzMinBore', 'litzStrandGap', 'litzTurnSpacing', 'litzStepDeg',
    'litzViaDiameter', 'litzViaDrill', 'litzTerminalPad', 'litzTerminalDrill', 'litzBusWidth',
    'litzTerminalLead', 'litzTerminalOffset', 'litzOutline', 'litzEdgeClearance', 'litzBoreCutout'];
  let previous;
  return { node, set: () => {
    const signature = JSON.stringify(keys.map(key => panel.state[key]));
    if (signature === previous) return;
    previous = signature;
    const fit = checkLitzFit(panel.state);
    node.replaceChildren();
    node.dataset.fit = fit.ok ? 'passed' : 'failed';
    if (fit.ok) {
      const d = fit.dimensions;
      node.append(el('p', { class: 'hint', role: 'status', text: `Sizing preflight: about ${num(d.fullCopperDiameterMM, 2)} mm complete copper diameter and ${num(d.fullCopperBoreMM, 2)} mm bore. Generated copper still requires routing and fabrication checks.` }));
      return;
    }
    for (const message of fit.errors) node.append(el('p', { class: 'hint', role: 'status', text: message }));
    const suggestions = suggestLitzFit(panel.state, { limit: 4 });
    if (!suggestions.candidates.length) {
      node.append(el('p', { class: 'hint', text: 'No turn/step change fits these constraints. Adjust the diameter, bore, spacing or terminal dimensions described above.' }));
      return;
    }
    node.append(el('p', { class: 'hint', text: 'Possible sizing changes, estimated before copper validation. Apply a suggestion to regenerate and check the layout.' }));
    for (const [index, candidate] of suggestions.candidates.entries()) {
      node.append(el('div', { class: 'litz-sizing-candidate' },
        el('p', { class: 'hint', text: `${candidate.turns} turns · ${num(candidate.litzStepDeg, 1)}° steps · about ${num(candidate.fullCopperDiameterMM, 2)} mm copper / ${num(candidate.fullCopperBoreMM, 2)} mm bore · ${candidate.viaCount} vias` }),
        el('button', { type: 'button', class: 'btn small', text: `Apply sizing suggestion ${index + 1}`, onclick: () => api.setMany({ turns: candidate.turns, litzStepDeg: candidate.litzStepDeg, dOuter: candidate.dOuter }) })));
    }
  } };
}

function fabricationEditor(panel, api) {
  const node = el('div', { class: 'litz-fab-rules' });
  const fields = [['minClearance', 'Minimum finished clearance', 'mm'], ['minAnnulus', 'Minimum finished annulus', 'mm'],
    ['minDrill', 'Minimum drill', 'mm'], ['minPlating', 'Minimum via plating', 'µm'],
    ['maxAspectRatio', 'Maximum drill aspect ratio', ''], ['etchAllowance', 'Etch allowance per edge', 'mm']];
  const rules = () => ({ ...FAB_PROFILES[panel.state.litzFabProfile === 'conservative' ? 'conservative' : 'experimental'], ...(panel.state.litzFabRules || {}) });
  const update = patch => api.setMany({ litzFabProfile: 'custom', litzFabRules: { ...rules(), ...patch } });
  const inputs = fields.map(([key, label, unit]) => {
    const input = el('input', { type: 'number', min: 0, step: .01, 'aria-label': label });
    input.addEventListener('change', () => { if (input.value !== '') update({ [key]: Number(input.value) }); });
    node.append(el('label', { class: 'field' }, el('span', { class: 'name', text: `${label}${unit ? ` (${unit})` : ''}` }), input));
    return [key, input];
  });
  const pairs = ['F.Cu-In1.Cu', 'In1.Cu-In2.Cu', 'In2.Cu-B.Cu'].map(pair => {
    const input = el('input', { type: 'checkbox', 'aria-label': `Allow ${pair} vias` });
    input.addEventListener('change', () => update({ allowedViaPairs: pairs.filter(([, item]) => item.checked).map(([name]) => name) }));
    node.append(el('label', {}, input, ` ${pair}`));
    return [pair, input];
  });
  return { node, set: () => {
    const r = rules();
    for (const [key, input] of inputs) input.value = String(r[key]);
    for (const [pair, input] of pairs) input.checked = r.allowedViaPairs?.includes(pair) || false;
  } };
}

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
    { key: 'litzSizeMode', type: 'select', label: 'Litz size constraint', options: [{ value: 'nominal', label: 'Nominal spiral diameter' }, { value: 'finished', label: 'Finished copper envelope' }] },
    sharedField({ key: 'turns', type: 'number', label: 'Litz coil turns', hint: 'Whole turns shared by all sixteen parallel strands.' }),
    sharedField({ key: 'dOuter', type: 'number', label: 'Litz outer diameter', unit: 'mm', when: c => c.litzSizeMode !== 'finished', hint: 'Nominal spiral diameter. Via fanouts and terminals extend beyond this diameter; read the generated dimensions below.' }),
    { key: 'litzTargetOuter', type: 'number', label: 'Maximum finished copper diameter', unit: 'mm', when: c => c.litzSizeMode === 'finished' },
    { key: 'litzMinBore', type: 'number', label: 'Minimum finished copper bore', unit: 'mm', when: c => c.litzSizeMode === 'finished' },
    { key: '_litzSizingHelp', type: 'custom', when: isLitz, build: p => sizingHelp(p, api) },
    sharedField({ key: 'traceW', type: 'number', label: 'Strand trace width', unit: 'mm' }),
    { key: 'litzStrandGap', type: 'number', label: 'Strand gap', unit: 'mm' },
    { key: 'litzTurnSpacing', type: 'number', label: 'Turn spacing', unit: 'mm' },
    { key: 'litzStepDeg', type: 'number', label: 'Transposition step', unit: '°', hint: `Allowed steps are 7.5°, 15° and 30°, subject to routing fit. This preset uses ${litzPreset().litzStepDeg}°. The paper used 10°; this is not an exact reproduction.` },
    { key: 'litzHighlight', type: 'select', label: 'Highlight Litz copper', options: [
      { value: 'all', label: 'All strands' }, { value: 'outer', label: 'Outer bundle' }, { value: 'inner', label: 'Inner bundle' },
      ...Array.from({ length: 16 }, (_, i) => ({ value: `strand:${i}`, label: `Strand ${i + 1}` })),
    ], hint: 'Highlight a complete electrical strand across layers. Layer visibility controls still apply.' },
  ] });
  panel.group({ key: 'litz-terminals', title: 'Terminals and board outline', when: isLitz, open: false, fields: [
    { key: 'litzTerminalPad', type: 'number', label: 'Litz terminal pad diameter', unit: 'mm' },
    { key: 'litzTerminalDrill', type: 'number', label: 'Litz terminal drill', unit: 'mm' },
    { key: 'litzTerminalLead', type: 'number', label: 'Litz terminal lead length', unit: 'mm' },
    { key: 'litzTerminalOffset', type: 'number', label: 'Litz terminal offset', unit: 'mm' },
    { key: 'litzBusWidth', type: 'custom', build: p => {
      const input = el('input', { type: 'number', min: .1, step: .05, placeholder: 'Automatic: strand width', 'aria-label': 'Litz terminal bus width' });
      input.addEventListener('change', () => api.set('litzBusWidth', input.value === '' ? null : Number(input.value)));
      return { node: el('label', { class: 'field' }, 'Litz terminal bus width (mm)', input), set: value => { input.value = value == null ? '' : String(value); } };
    } },
    { key: 'litzOutline', type: 'check', label: 'Generate board outline' },
    { key: 'litzEdgeClearance', type: 'number', label: 'Copper to board edge', unit: 'mm', when: c => c.litzOutline },
    { key: 'litzBoreCutout', type: 'check', label: 'Cut out the board bore', when: c => c.litzOutline },
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
  panel.group({ key: 'litz-fabrication', title: 'Fabrication screening rules', when: isLitz, open: false, fields: [
    { key: 'litzFabProfile', type: 'custom', build: () => {
      const select = el('select', { 'aria-label': 'Litz fabrication profile' },
        ...[['experimental', 'Generic experimental'], ['conservative', 'Generic conservative'], ['custom', 'Custom rules']].map(([value, text]) => el('option', { value, text })));
      select.addEventListener('change', () => api.setMany({ litzFabProfile: select.value, ...(select.value === 'custom' ? {} : { litzFabRules: {} }) }));
      return { node: el('label', { class: 'field' }, 'Litz fabrication profile', select), set: value => { select.value = value || 'experimental'; } };
    } },
    { key: '_litzFabRules', type: 'custom', build: p => fabricationEditor(p, api) },
    { type: 'note', text: 'Generic screening assumptions are editable. They do not represent a specific fabricator’s capabilities; confirm the stack, via sequence and tolerances before ordering.' },
  ] });
  panel.group({ key: 'litz-model', title: 'Litz electrical model', when: isLitz, fields: [
    { key: 'litzModelSegments', type: 'custom', build: () => {
      const select = el('select', { 'aria-label': 'Litz model resolution' },
        ...[[96, 'preview'], [192, 'refine'], [384, 'convergence check']].map(([value, label]) => el('option', { value: String(value), text: `${value} · ${label}` })));
      select.addEventListener('change', () => api.set('litzModelSegments', Number(select.value)));
      return { node: el('div', { class: 'field' }, el('div', { class: 'lab', text: 'Litz model resolution' }), select,
        el('p', { class: 'hint', text: 'Target subdivisions per strand; section endpoints and vias are always retained. Higher resolution increases solve time. Convergence does not establish accuracy of the AC loss model.' })), set: value => { select.value = String(value); } };
    } },
    { key: 'litzLossSamples', type: 'number', label: 'Litz field samples per strand', hint: '32–512 adaptive target samples. Refine this separately from inductance path resolution.' },
    { key: 'litzAcModel', type: 'select', label: 'Litz AC loss approximation', options: [{ value: 'slab', label: 'Slab field approximation' }, { value: 'rectangular', label: 'Rectangular conductor approximation' }] },
    { key: 'litzCapacitanceMode', type: 'select', label: 'Litz distributed capacitance', options: [{ value: 'off', label: 'Off · intrinsic resonance unknown' }, { value: 'distributed', label: 'Experimental distributed model' }] },
    { key: 'litzCapacitanceCells', type: 'number', label: 'Capacitance cells per strand', when: c => c.litzCapacitanceMode === 'distributed', hint: 'Choose 2, 3 or 4 cells. This is an unvalidated low-order model.' },
    sharedField({ key: 'epsR', type: 'number', label: 'Litz dielectric permittivity', when: c => c.litzCapacitanceMode === 'distributed' }),
    { key: 'litzTanD', type: 'number', label: 'Litz dielectric loss tangent', when: c => c.litzCapacitanceMode === 'distributed' },
    { type: 'note', text: 'Calculated current sharing and Q use a simplified strand model that may understate loss and overstate Q. These estimates need simulation or measurement comparison.' },
  ] });
}

export function litzTiles(cfg, res) {
  const g = res.litz, a = res.analysis, v = res.validation;
  const capacitive = a && (a.Zi < 0 || a.L < 0);
  const out = [
    { k: 'PCB Litz', v: '16 strands · 4 layers', sub: '2 bundles · experimental', wide: true },
    { k: 'Routing validation', v: v?.ok ? 'Passed' : 'Needs attention', tone: v?.ok ? 'good' : 'bad', sub: v?.ok ? `${num(v.minClearance, 3)} mm minimum checked gap` : `${v?.errors?.length || 0} routing errors`, wide: true },
    { k: 'Vias', v: String(g.art.vias.length), sub: 'Includes strand transpositions' },
  ];
  if (!a) return out;
  return out.concat([
    { k: 'Estimated L', v: capacitive ? 'Capacitive' : eng(a.L, 'H', 4), sub: capacitive ? 'Model is not inductive at this frequency' : cfg.litzCapacitanceMode === 'distributed' || cfg.cExtra > 0 ? 'Terminal series equivalent' : '' },
    { k: 'Estimated R dc', v: eng(a.Rdc, 'Ω', 4) },
    { k: 'Estimated terminal ESR', v: eng(a.Zr ?? a.Rac, 'Ω', 4), sub: `at ${eng(cfg.freq, 'Hz')}` },
    { k: 'Estimated Q', v: capacitive ? '—' : num(a.Zr > 0 ? a.Zi / a.Zr : a.Q, 1), sub: capacitive ? 'No inductive Q in the capacitive region' : 'Terminal Q · unvalidated' },
    { k: 'Estimated copper loss', v: eng(a.Ploss, 'W'), sub: `${num(cfg.current, 2)} A RMS${cfg.litzCapacitanceMode === 'distributed' || cfg.cExtra > 0 ? ' terminal drive' : ''}; no thermal rating` },
    ...(a.Pdielectric > 0 ? [{ k: 'Estimated dielectric loss', v: eng(a.Pdielectric, 'W'), sub: 'Unvalidated dielectric model' }] : []),
    { k: a.resonanceIncludesExternalCapacitance ? 'Estimated model resonance' : 'Self-resonance', v: a.estimatedSrfHz ? eng(a.estimatedSrfHz, 'Hz') : 'Unknown', sub: a.estimatedSrfHz ? a.resonanceIncludesExternalCapacitance ? 'Unvalidated; includes added capacitance' : 'Unvalidated distributed estimate' : cfg.litzCapacitanceMode === 'distributed' ? 'No resonance found in model range' : 'Distributed capacitance not solved' },
    ...(a.lumpedResonanceHz ? [{ k: 'Lumped resonance', v: eng(a.lumpedResonanceHz, 'Hz'), sub: 'From supplied capacitance only' }] : []),
  ]);
}

export function litzSpec(cfg, res) {
  const a = res.analysis, g = res.litz;
  const capacitive = a && (a.Zi < 0 || a.L < 0);
  const out = [{ title: 'Experimental PCB Litz geometry', rows: [
    ['Topology', '16 strands; 2 concentric bundles; 4 copper layers'],
    ['Turns / resolved nominal outer diameter', `${cfg.turns} / ${num(g.config?.dOuter ?? cfg.dOuter, 2)} mm`],
    ['Sizing mode', cfg.litzSizeMode === 'finished' ? `Finished copper: maximum ${num(cfg.litzTargetOuter, 2)} mm, minimum bore ${num(cfg.litzMinBore, 2)} mm` : 'Nominal spiral diameter'],
    ['Complete copper diameter / bore', `${num(g.stats.fullCopperDiameterMM ?? g.stats.outerDiameterMM, 2)} / ${num(g.stats.fullCopperBoreMM ?? g.stats.innerDiameterMM, 2)} mm`],
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
    ['Fabrication screening', res.manufacturing ? res.manufacturing.ok ? 'Passed selected generic rules' : 'Changes required' : 'Not checked'],
  ], note: 'The conservative preset differs from the paper geometry. A geometric check is not a certification of a fabrication process.' }];
  if (!a) return out;
  out.push({ title: 'Experimental electrical estimates', note: a.method || a.model || 'Experimental strand network model.', rows: [
    ['Inductance', capacitive ? 'Capacitive terminal response; no inductive equivalent' : eng(a.L, 'H', 4)], ['DC resistance', eng(a.Rdc, 'Ω', 4)], ['Terminal ESR', eng(a.Zr ?? a.Rac, 'Ω', 4)],
    ['Terminal Q at operating frequency', capacitive ? `Not inductive at ${eng(cfg.freq, 'Hz')}` : `${num(a.Zr > 0 ? a.Zi / a.Zr : a.Q, 2)} at ${eng(cfg.freq, 'Hz')}`],
    ['Terminal reactance', eng(a.Zi, 'Ω', 4)],
    ['AC / DC resistance ratio', num(a.Fr, 3)], ['Copper loss', eng(a.Ploss, 'W', 4)],
    ['Supplied parallel capacitance', eng(a.Ctot, 'F', 3)],
    ['Terminal bus DC resistance', eng(a.terminalBusRdc, 'Ω', 4)], ['Via-pad DC resistance', eng(a.viaPadRdc, 'Ω', 4)],
    ['Estimated terminal bus loss', eng(a.terminalBusLoss, 'W', 4)], ['Estimated dielectric loss', eng(a.Pdielectric, 'W', 4)],
    [a.resonanceIncludesExternalCapacitance ? 'Model resonance including added capacitance' : 'Distributed self-resonance', a.estimatedSrfHz ? `${eng(a.estimatedSrfHz, 'Hz')} — unvalidated estimate` : cfg.litzCapacitanceMode === 'distributed' ? 'No resonance found in modeled range' : 'Unknown; distributed capacitance is disabled'],
    ...(a.lumpedResonanceHz ? [['Lumped resonance with supplied capacitance', eng(a.lumpedResonanceHz, 'Hz')]] : []),
  ] });
  if (a.currentShares?.length) out.push({ title: 'Estimated strand currents', note: 'Phasors are relative to terminal drive current. The distributed model can vary current along a strand. Magnitude percentages need not sum to 100% when phases differ.', rows: a.currentShares.map(s => [
    `Strand ${Number(s.id) + 1}${s.bundle ? ` · ${s.bundle}` : ''}`,
    `${num(s.percent, 2)}%${cfg.litzCapacitanceMode === 'distributed' && Number.isFinite(s.endPercent) ? ` start / ${num(s.endPercent, 2)}% end` : ''} · ${num(s.phase, 2)}° · ${eng(s.Rdc, 'Ω', 3)} DC`,
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
  if (res.analysis && cfg.litzCapacitanceMode !== 'distributed') out.push({ level: 'warn', text: 'Intrinsic distributed capacitance and self-resonance are unknown. The frequency curves show the strand model without an intrinsic resonance limit.' });
  else if (res.analysis) out.push({ level: 'warn', text: 'Distributed capacitance and dielectric loss use an unvalidated low-order model. Any resonance estimate requires external simulation or measurement.' });
  return out;
}

export function litzCharts(cfg, res) {
  if (!res.sweep?.length) return [];
  const f = res.sweep.map(p => p.f);
  const terminal = p => Number.isFinite(p.Zr) && Number.isFinite(p.Zi);
  return [
    ['q', 'Estimated terminal Q', 'Q', p => terminal(p) ? p.Zr > 0 && p.Zi > 0 ? p.Zi / p.Zr : NaN : p.Q],
    ['rac', 'Estimated terminal resistance', 'R Ω', p => p.Zr ?? p.R],
    ['l', 'Estimated terminal series inductance', 'L H', p => terminal(p) ? p.Zi > 0 ? p.Zi / (2 * Math.PI * p.f) : NaN : p.Ls],
    ['z', 'Estimated terminal impedance magnitude', '|Z| Ω', p => p.Z],
    ['terminal-phase', 'Estimated terminal phase', 'Phase °', p => terminal(p) ? Math.atan2(p.Zi, p.Zr) * 180 / Math.PI : p.phase],
    ['litz-copper-r', 'Estimated equivalent copper resistance', 'Copper R Ω', p => p.copperR ?? p.Rac ?? p.R],
  ].map(([id, title, label, value]) => ({ id, title,
    note: id === 'q' || id === 'l' ? 'Terminal impedance-derived values, shown in the inductive region. The experimental model requires measurement comparison.' : 'Experimental terminal network and loss estimates. Numerical refinement does not validate physical accuracy.',
    spec: { x: { values: f, label: 'f', log: true, format: v => eng(v, 'Hz') },
      y: { label, ...(id === 'terminal-phase' ? {} : { min: 0 }), format: v => id === 'l' ? eng(v, 'H') : id === 'terminal-phase' ? `${num(v, 0)}°` : num(v, 1) },
      series: [{ name: title, values: res.sweep.map(value) }],
      markers: [{ x: cfg.freq, label: 'f₀' }],
    },
  }));
}
