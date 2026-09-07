import { buildAntenna } from '../engine/antenna.js';
import { eng, num } from '../ui/controls.js';
import { colourFor } from './common.js';
export const id = 'antenna', title = 'Antenna';
export const defaults = () => ({ freq: 2.45e9, boardT: 1.6, epsR: 4.4, copperOz: 1, feedZ: 50, feedLength: 10, lengthScale: 1, widthScale: 1, margin: 5, tolerance: 0.004 });
export function rail(panel) {
  panel.group({ key: 'patch', title: 'Rectangular patch antenna', fields: [
    { key: 'freq', type: 'range', label: 'Target frequency', unit: 'Hz', si: true, min: 1e8, max: 30e9, step: 1e7 },
    { key: 'lengthScale', type: 'range', label: 'Length tuning', min: 0.5, max: 1.5, step: 0.005 },
    { key: 'widthScale', type: 'range', label: 'Width tuning', min: 0.5, max: 1.5, step: 0.005 },
    { type: 'note', text: 'TM10 starting dimensions. Tune the length and width against an EM solver or a measured prototype.' },
  ] });
  panel.group({ key: 'feed', title: 'Feed and ground', fields: [
    { key: 'feedZ', type: 'range', label: 'Feed line impedance', unit: 'Ω', min: 20, max: 150, step: 1 },
    { key: 'feedLength', type: 'range', label: 'Feed length', unit: 'mm', min: 1, max: 100, step: 0.1 },
    { key: 'margin', type: 'range', label: 'Ground margin', unit: 'mm', min: 1, max: 30, step: 0.1 },
    { type: 'note', text: 'Front patch and edge feed, back ground. A 50 Ω feed line does not match the patch by itself.' },
  ] });
  panel.group({ key: 'substrate', title: 'Substrate', fields: [
    { key: 'boardT', type: 'range', label: 'Patch to ground spacing', unit: 'mm', min: 0.1, max: 3.2, step: 0.01 },
    { key: 'epsR', type: 'range', label: 'Dielectric εr', min: 1.1, max: 12, step: 0.05 },
    { key: 'copperOz', type: 'range', label: 'Copper weight', unit: 'oz', min: 0.25, max: 4, step: 0.25 },
  ] });
}
export const compute = (cfg, env) => buildAntenna(cfg, env);
export const handles = () => [];
export const layerList = (c, r) => r.layers.map((n, i) => [n, colourFor(n, i)]);
export const notes = (c, r) => r.notes;
export const charts = () => [];
export function tiles(c, r) {
  const a = r.analysis;
  return [{ k: 'Estimated resonance', v: eng(a.resonance, 'Hz', 4) }, { k: 'Patch W × L', v: `${num(a.W, 2)} × ${num(a.L, 2)}`, sub: 'mm' }, { k: 'Feed width', v: `${num(a.feedW, 3)} mm` }, { k: 'Effective εr', v: num(a.ee, 3) }];
}
export function spec(c, r) {
  const a = r.analysis;
  return [{ title: 'Antenna geometry', rows: [['Topology', 'Rectangular edge-fed patch (TM10)'], ['Patch width', `${num(a.W, 3)} mm`], ['Patch length', `${num(a.L, 3)} mm`], ['Fringing extension per end', `${num(a.deltaL, 3)} mm`], ['Free-space wavelength', `${num(a.lambda0, 2)} mm`], ['Feed characteristic impedance', `${num(a.feedZ, 2)} Ω`], ['Copper layers', 'F.Cu patch / B.Cu ground']] }];
}
export const status = (c, r) => ({ algo: 'Patch transmission-line estimate', summary: `${eng(r.analysis.resonance, 'Hz', 3)} · ${num(r.analysis.W, 1)} × ${num(r.analysis.L, 1)} mm` });
