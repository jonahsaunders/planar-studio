import { buildTransformer } from '../engine/transformer.js';
import { eng, num } from '../ui/controls.js';
import { colourFor } from './common.js';
export const id = 'transformer', title = 'Transformer';
export const defaults = () => ({ shape: 'circle', primaryTurns: 6, secondaryTurns: 3, dOuter: 30, traceW: 0.5, traceS: 0.3, boardT: 1.6, copperOz: 1, tempC: 25, freq: 1e5, current: 1, secondaryCurrent: 1, ppt: 128, tolerance: 0.004 });
export function rail(panel) {
  panel.group({ key: 'windings', title: 'Air-core planar transformer', fields: [
    { key: 'shape', type: 'seg', label: 'Winding shape', options: [{ value: 'circle', label: 'Circular' }, { value: 'polygon', label: 'Square' }] },
    { key: 'primaryTurns', type: 'range', label: 'Primary turns', min: 1, max: 60, step: 1 },
    { key: 'secondaryTurns', type: 'range', label: 'Secondary turns', min: 1, max: 60, step: 1 },
    { key: 'dOuter', type: 'range', label: 'Outer diameter', unit: 'mm', min: 5, max: 160, step: 0.1 },
    { key: 'traceW', type: 'range', label: 'Track width', unit: 'mm', min: 0.1, max: 3, step: 0.01 },
    { key: 'traceS', type: 'range', label: 'Turn clearance', unit: 'mm', min: 0.1, max: 3, step: 0.01 },
    { type: 'note', text: 'Independent windings on front and back copper, with surface terminals. No ferrite core is modeled.' },
  ] });
  panel.group({ key: 'stack', title: 'Stack-up', fields: [
    { key: 'boardT', type: 'range', label: 'Winding separation', unit: 'mm', min: 0.1, max: 3.2, step: 0.01 },
    { key: 'copperOz', type: 'range', label: 'Copper weight', unit: 'oz', min: 0.25, max: 4, step: 0.25 },
    { key: 'tempC', type: 'range', label: 'Operating temperature', unit: '°C', min: -40, max: 125, step: 1 },
  ] });
  panel.group({ key: 'drive', title: 'Operating point', fields: [
    { key: 'freq', type: 'range', label: 'Frequency', unit: 'Hz', si: true, min: 100, max: 1e7, step: 100 },
    { key: 'current', type: 'range', label: 'Primary RMS current', unit: 'A', min: 0.01, max: 20, step: 0.01 },
    { key: 'secondaryCurrent', type: 'range', label: 'Secondary RMS current', unit: 'A', min: 0.01, max: 20, step: 0.01 },
  ] });
}
export const compute = buildTransformer;
export const handles = () => [];
export const layerList = (c, r) => r.layers.map((n, i) => [n, colourFor(n, i)]);
export const notes = (c, r) => r.notes;
export const charts = () => [];
export function tiles(c, r) {
  const a = r.analysis; if (!a) return [];
  return [{ k: 'Primary L', v: eng(a.L1, 'H', 4) }, { k: 'Secondary L', v: eng(a.L2, 'H', 4) }, { k: 'Mutual M', v: eng(a.M, 'H', 4) }, { k: 'Coupling k', v: num(a.k, 4) }, { k: 'Turns ratio Np:Ns', v: `${num(a.ratio, 3)}:1` }, { k: 'DC copper loss', v: eng(a.loss, 'W', 3), sub: 'at entered winding currents' }];
}
export function spec(c, r) {
  const a = r.analysis; if (!a) return [];
  return [{ title: 'Transformer estimates', rows: [['Primary DC resistance', eng(a.R1, 'Ω', 4)], ['Secondary DC resistance', eng(a.R2, 'Ω', 4)], ['Primary leakage L (secondary shorted)', eng(a.leakage, 'H', 4)], ['Open-secondary induced RMS voltage', eng(a.induced, 'V', 4)], ['Voltage assumption', 'Sinusoidal primary current, open secondary'], ['Terminals', '1 (dot), 2 primary; 3 (dot), 4 secondary'], ['Breakout', 'Inner terminals require insulated jumpers']] }];
}
export const status = (c, r) => ({ algo: 'Air-core Neumann partial inductance', summary: r.analysis ? `Np:Ns ${c.primaryTurns}:${c.secondaryTurns} · k ${num(r.analysis.k, 3)}` : 'solving…' });
