import { buildTransformer, TRANSFORMER_FAMILIES, transformerExtras, STACK_PRESETS, CORE_MATERIALS } from '../engine/transformer.js';
import { eng, num } from '../ui/controls.js';
import { colourFor, fmtHz } from './common.js';
export const id = 'transformer', title = 'Transformer';
export const defaults = () => ({ ...transformerExtras(), shape: 'circle', primaryTurns: 6, secondaryTurns: 3, dOuter: 30, traceW: 0.5, traceS: 0.3, boardT: 1.6, copperOz: 1, tempC: 25, freq: 1e5, current: 1, secondaryCurrent: 1, ppt: 128, tolerance: 0.004 });
const advanced = c => c.family && c.family !== 'aircore';
const ferrite = c => c.family === 'ferrite';
const options = o => Object.entries(o).map(([value, label]) => ({ value, label }));
export function reconcile(c, key, value) {
  if (key === 'family' && STACK_PRESETS[value]) {
    c.stackPlan = STACK_PRESETS[value]; c.copperLayers = ''; c.layerPositions = '';
    if (value === 'ferrite') c.dOuter = Math.max(40, c.dOuter);
  }
}
export function rail(panel) {
  panel.group({ key: 'windings', title: 'Planar transformer', fields: [
    { key: 'family', type: 'select', label: 'Transformer type', options: options(TRANSFORMER_FAMILIES) },
    { key: 'shape', type: 'seg', label: 'Winding shape', options: [{ value: 'circle', label: 'Circular' }, { value: 'polygon', label: 'Square' }] },
    { key: 'primaryTurns', type: 'range', label: 'Primary turns', min: 1, max: 60, step: 1, hint: 'Turns per occupied copper layer; the readouts show the series total.' },
    { key: 'secondaryTurns', type: 'range', label: 'Secondary turns', min: 1, max: 60, step: 1, hint: 'Turns per S layer. Center-tapped halves have equal layer counts.' },
    { key: 'secondary2Turns', type: 'range', label: 'Second secondary turns per layer', min: 1, max: 60, step: 1, when: c => c.family === 'multi-secondary' },
    { key: 'secondary3Turns', type: 'range', label: 'Third secondary turns per layer', min: 1, max: 60, step: 1, when: c => c.family === 'multi-secondary' && c.stackPlan.split(',').some(n => n.trim() === 'S3') },
    { key: 'dOuter', type: 'range', label: 'Outer diameter', unit: 'mm', min: 5, max: 160, step: 0.1 },
    { key: 'traceW', type: 'range', label: 'Track width', unit: 'mm', min: 0.1, max: 3, step: 0.01 },
    { key: 'traceS', type: 'range', label: 'Turn clearance', unit: 'mm', min: 0.1, max: 3, step: 0.01 },
  ] });
  panel.group({ key: 'stack', title: 'Winding stack-up', fields: [
    { key: 'stackPlan', type: 'text', label: 'Winding assignment, front to back', hint: 'One entry per used layer: P,P,S,S or P,S,P,S. Use S2/S3 for additional secondaries. Every winding connects its layers in series.', when: advanced },
    { key: 'copperLayers', type: 'text', label: 'Copper layer names (optional)', hint: 'Example: F.Cu,In1.Cu,In2.Cu,B.Cu. Blank selects available layers in order, including the back.', when: advanced },
    { key: 'layerPositions', type: 'text', label: 'Copper center heights (optional, mm)', hint: 'Example: 0,0.2,1.4,1.6. Same order as the assigned layers; blank assumes uniform spacing.', when: advanced },
    { key: 'boardT', type: 'range', label: 'Winding separation', unit: 'mm', min: 0.1, max: 3.2, step: 0.01, hint: 'Total front-to-back separation; individual heights can override uniform spacing.' },
    { key: 'viaPad', type: 'range', label: 'Transition / terminal diameter', unit: 'mm', min: 0.5, max: 2, step: 0.05, when: advanced },
    { key: 'viaDrill', type: 'range', label: 'Transition / terminal drill', unit: 'mm', min: 0.2, max: 1, step: 0.05, when: advanced },
    { key: 'copperOz', type: 'range', label: 'Copper weight', unit: 'oz', min: 0.25, max: 4, step: 0.25 },
    { key: 'tempC', type: 'range', label: 'Operating temperature', unit: '°C', min: -40, max: 125, step: 1 },
  ] });
  panel.group({ key: 'core', title: 'Ferrite core and material', when: ferrite, fields: [
    { key: 'coreShape', type: 'select', label: 'Core post shape', options: options({ rectangular: 'Rectangular post (E/ER-style opening)', round: 'Round post (pot/RM-style opening)' }), when: ferrite },
    { key: 'corePostW', type: 'number', label: 'Core post width / diameter', unit: 'mm', when: ferrite },
    { key: 'corePostH', type: 'number', label: 'Core post height', unit: 'mm', when: c => ferrite(c) && c.coreShape === 'rectangular' },
    { key: 'coreClearance', type: 'number', label: 'Core assembly clearance', unit: 'mm', when: ferrite },
    { key: 'coreWindowHeight', type: 'number', label: 'Core window height for PCB', unit: 'mm', when: ferrite },
    { key: 'coreMaterial', type: 'select', label: 'Core material', options: Object.entries(CORE_MATERIALS).map(([value, m]) => ({ value, label: m.name })), when: ferrite },
    { key: 'coreMuR', type: 'number', label: 'Material relative permeability', when: c => ferrite(c) && c.coreMaterial === 'custom' },
    { key: 'coreAe', type: 'number', label: 'Effective core area Ae', unit: 'mm²', when: ferrite },
    { key: 'coreLe', type: 'number', label: 'Effective magnetic path le', unit: 'mm', when: ferrite },
    { key: 'coreGap', type: 'number', label: 'Total magnetic gap', unit: 'mm', when: ferrite },
    { key: 'leakageFraction', type: 'range', label: 'Assumed series leakage / self L', min: 0.001, max: 0.3, step: 0.001, when: ferrite, hint: 'Supplied assumption, not calculated from interleaving.' },
    { key: 'coreVoltage', type: 'number', label: 'Sinusoidal primary RMS voltage', unit: 'V', when: ferrite },
    { key: 'coreFluxLimit', type: 'number', label: 'Design peak flux limit', unit: 'T', when: ferrite },
    { key: 'coreLossDensity', type: 'number', label: 'Core loss density at operating point', unit: 'kW/m³', when: ferrite, hint: 'From the material curve at actual frequency, flux and core temperature. Zero leaves core loss unknown.' },
  ] });
  panel.group({ key: 'drive', title: 'Operating point', fields: [
    { key: 'freq', type: 'number', label: 'Frequency', unit: 'Hz', si: true, format: fmtHz },
    { key: 'current', type: 'range', label: 'Primary RMS current', unit: 'A', min: 0.01, max: 20, step: 0.01 },
    { key: 'secondaryCurrent', type: 'range', label: 'Secondary RMS current', unit: 'A', min: 0.01, max: 20, step: 0.01, hint: 'For multiple secondaries this entered current applies to each winding for the DC-loss estimate.' },
  ] });
}
export const compute = buildTransformer;
export const handles = () => [];
export const layerList = (c, r) => r.layers.map((n, i) => [n, colourFor(n, i)]);
export const notes = (c, r) => r.notes;
export const charts = () => [];
export function tiles(c, r) {
  const a = r.analysis; if (!a) return [];
  const out = [{ k: 'Primary L', v: eng(a.L1, 'H', 4) }, { k: 'Secondary L', v: eng(a.L2, 'H', 4) }, { k: 'Mutual M', v: eng(a.M, 'H', 4) }, { k: 'Coupling k', v: num(a.k, 4), sub: r.core ? 'from supplied leakage assumption' : '' }, { k: 'Turns ratio Np:Ns', v: `${num(a.ratio, 3)}:1` }, { k: 'DC copper loss', v: eng(a.loss, 'W', 3), sub: 'at entered winding currents' }];
  if (a.tapTurns) out.push({ k: 'Turns per tapped half', v: String(a.tapTurns) });
  if (r.core) out.push({ k: 'Core AL', v: eng(r.core.AL, 'H/turn²', 4) }, { k: 'Peak core flux', v: eng(r.core.Bpeak, 'T', 4) }, { k: 'Flux / design limit', v: `${num(r.core.fluxUtilization * 100, 1)}%` }, { k: 'Estimated core loss', v: eng(r.core.loss, 'W', 3), sub: 'from entered loss density' });
  return out;
}
export function spec(c, r) {
  const a = r.analysis; if (!a) return [];
  const sections = [{ title: 'Transformer estimates', rows: [['Topology', TRANSFORMER_FAMILIES[c.family || 'aircore']], ['Model', r.model], ['Primary DC resistance', eng(a.R1, 'Ω', 4)], ['Secondary DC resistance', eng(a.R2, 'Ω', 4)], ['Primary leakage L (S shorted, other secondaries open)', eng(a.leakage, 'H', 4)], ['Open-secondary induced RMS voltage', eng(a.induced, 'V', 4)], ['Voltage assumption', 'Sinusoidal imposed primary current, open secondaries']] }];
  if (!r.windings) {
    sections[0].rows.push(['Terminals', '1 (dot), 2 primary; 3 (dot), 4 secondary'], ['Breakout', 'Inner terminals require insulated jumpers']);
    return sections;
  }
  sections.push({ title: 'Layer assignment', rows: r.art.meta.stack.map(s => [s.layer, `${s.winding} · z=${num(s.z, 3)} mm`]) });
  sections.push({ title: 'Winding totals and terminals', rows: r.windings.map((q, i) => [q.name, `${q.turns} turns; ${eng(a.resistances[i], 'Ω', 4)}; ${q.net}; ${q.terminals.join(', ')}`]) });
  const pairs = [];
  for (let i = 0; i < r.windings.length; i++) for (let j = i; j < r.windings.length; j++) pairs.push([`${r.windings[i].name} ↔ ${r.windings[j].name}`, `${eng(a.matrix[i][j], 'H', 4)}; k=${num(a.coupling[i][j], 4)}`]);
  sections.push({ title: 'Inductance / coupling matrix', rows: pairs });
  sections.push({ title: 'Open-secondary outputs', rows: a.outputs.map(q => [q.name, `Np:Ns ${num(q.ratio, 3)}:1; ${eng(q.induced, 'V', 4)} at imposed primary current`]) });
  if (r.core) sections.push({ title: 'Core assumptions', rows: [['Material', r.core.material], ['Relative permeability', num(r.core.muR, 0)], ['Core AL', eng(r.core.AL, 'H/turn²', 4)], ['Peak flux at supplied voltage', eng(r.core.Bpeak, 'T', 4)], ['Core loss', r.core.loss == null ? 'Unknown: supply operating-point loss density' : eng(r.core.loss, 'W', 4)], ['Mechanical export', 'Post cutout in board export; add/verify manually for direct placement']] });
  return sections;
}
export const status = (c, r) => ({ algo: r.model, summary: r.analysis ? `${TRANSFORMER_FAMILIES[c.family || 'aircore']} · Np:Ns ${num(r.analysis.ratio, 3)}:1 · k ${num(r.analysis.k, 3)}` : 'solving…' });
