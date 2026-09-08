import { buildAntenna, ANTENNA_FAMILIES, MAX_ARRAY_DIMENSION, antennaExtras, sizeNfcLoop } from '../engine/antenna.js';
import { eng, num } from '../ui/controls.js';
import { colourFor, fmtHz } from './common.js';
export const id = 'antenna', title = 'Antenna';
export const defaults = () => ({ ...antennaExtras(), freq: 2.45e9, boardT: 1.6, epsR: 4.4, copperOz: 1, feedZ: 50, feedLength: 10, lengthScale: 1, widthScale: 1, margin: 5, tolerance: 0.004 });
const patch = c => ['patch', 'inset-patch', 'patch-array'].includes(c.family || 'patch');
const isNfc = c => c.family === 'nfc';
const isIfa = c => ['ifa', 'mifa'].includes(c.family);
const wire = c => ['dipole', 'folded-dipole', 'ifa', 'mifa'].includes(c.family);
const directional = c => ['vivaldi', 'yagi', 'lpda', 'bowtie'].includes(c.family);
const scaledArms = c => wire(c) || ['yagi', 'lpda', 'bowtie'].includes(c.family);
const balancedGap = c => wire(c) || ['yagi', 'bowtie'].includes(c.family);
const lineFed = c => patch(c) || ['circular-patch', 'slot', 'vivaldi'].includes(c.family);
const options = o => Object.entries(o).map(([value, label]) => ({ value, label }));
export function reconcile(c, key, value) {
  if (key !== 'family') return;
  if (value === 'nfc' && c.freq > 30e6) c.freq = 13.56e6;
  if (value !== 'nfc' && c.freq < 1e8) c.freq = 2.45e9;
  // A compact meander needs a longer path than a straight IFA on the same substrate.
  if (value === 'mifa' && c.freq > 1e9) c.freq = 915e6;
}
export function rail(panel, api) {
  panel.group({ key: 'family', title: 'Antenna family', fields: [
    { key: 'family', type: 'select', label: 'Antenna type', options: options(ANTENNA_FAMILIES) },
    { key: 'freq', type: 'number', label: 'Target frequency', si: true, unit: 'Hz', format: fmtHz },
    { type: 'note', text: 'Each family reports its supported estimates. Validate the final feed, ground and enclosure with simulation or measurement.' },
  ] });
  panel.group({ key: 'geometry', title: 'Radiator geometry', fields: [
    { key: 'radiusScale', type: 'range', label: 'Circular patch radius tuning', min: 0.5, max: 1.5, step: 0.005, when: c => c.family === 'circular-patch' },
    { key: 'slotScale', type: 'range', label: 'Slot length tuning', min: 0.5, max: 1.5, step: 0.005, when: c => c.family === 'slot' },
    { key: 'slotWidth', type: 'range', label: 'Slot width', unit: 'mm', min: 0.2, max: 10, step: 0.1, when: c => c.family === 'slot' },
    { key: 'slotStub', type: 'range', label: 'Open stub beyond slot', unit: 'mm', min: 0.1, max: 30, step: 0.1, when: c => c.family === 'slot' },
    { key: 'lengthScale', type: 'range', label: 'Length tuning', min: 0.5, max: 1.5, step: 0.005, when: patch },
    { key: 'widthScale', type: 'range', label: 'Width tuning', min: 0.5, max: 1.5, step: 0.005, when: patch },
    { key: 'insetFraction', type: 'range', label: 'Inset depth / patch length', min: 0.01, max: 0.45, step: 0.005, when: c => c.family === 'inset-patch' },
    { key: 'insetGap', type: 'range', label: 'Inset side gap', unit: 'mm', min: 0.1, max: 3, step: 0.05, when: c => c.family === 'inset-patch' },
    { key: 'edgeResistance', type: 'number', label: 'Assumed edge resistance', unit: 'Ω', when: c => c.family === 'inset-patch', hint: 'Supply from an edge-feed model or measurement; used only in the cosine-squared estimate.' },
    { key: 'armScale', type: 'range', label: 'Electrical-length scale', min: 0.5, max: 1.5, step: 0.01, when: scaledArms },
    { key: 'traceW', type: 'range', label: 'Radiator trace width', unit: 'mm', min: 0.1, max: 3, step: 0.05, when: c => scaledArms(c) || isNfc(c) },
    { key: 'feedGap', type: 'range', label: 'Feed gap', unit: 'mm', min: 0.1, max: 5, step: 0.1, when: balancedGap },
    { key: 'foldSpacing', type: 'range', label: 'Fold spacing', unit: 'mm', min: 1, max: 20, step: 0.1, when: c => c.family === 'folded-dipole' },
    { key: 'antennaHeight', type: 'range', label: 'Radiator height above ground edge', unit: 'mm', min: 1, max: 30, step: 0.1, when: isIfa },
    { key: 'feedOffset', type: 'range', label: 'Feed distance from short', unit: 'mm', min: 1, max: 20, step: 0.1, when: isIfa },
    { key: 'meanderRuns', type: 'range', label: 'Meander runs', min: 3, max: 15, step: 1, when: c => c.family === 'mifa' },
    { key: 'meanderPitch', type: 'range', label: 'Meander pitch', unit: 'mm', min: 1, max: 10, step: 0.1, when: c => c.family === 'mifa' },
  ] });
  panel.group({ key: 'directional', title: 'Antenna shape and feed', when: directional, open: true, fields: [
    { key: 'bowtieAngle', type: 'range', label: 'Bow-tie flare angle', unit: '°', min: 10, max: 120, step: 1, when: c => c.family === 'bowtie' },
    { key: 'profileStep', type: 'range', label: 'Copper edge step', unit: 'mm', min: 0.01, max: 1, step: 0.01, when: c => ['vivaldi', 'bowtie'].includes(c.family), hint: 'Smaller steps give smoother filled copper profiles and larger exports.' },
    { key: 'yagiDirectors', type: 'range', label: 'Yagi directors', min: 1, max: 20, step: 1, when: c => c.family === 'yagi' },
    { key: 'yagiSpacing', type: 'range', label: 'Director spacing / estimated wavelength', min: 0.05, max: 0.5, step: 0.005, when: c => c.family === 'yagi' },
    { key: 'yagiReflectorSpacing', type: 'range', label: 'Reflector spacing / estimated wavelength', min: 0.05, max: 0.5, step: 0.005, when: c => c.family === 'yagi' },
    { key: 'yagiReflectorScale', type: 'range', label: 'Reflector / driven length', min: 1.01, max: 1.3, step: 0.005, when: c => c.family === 'yagi' },
    { key: 'yagiDirectorScale', type: 'range', label: 'First director / driven length', min: 0.7, max: 0.99, step: 0.005, when: c => c.family === 'yagi' },
    { key: 'yagiDirectorTaper', type: 'range', label: 'Director shortening per element', min: 0, max: 0.03, step: 0.001, when: c => c.family === 'yagi' },
    { key: 'lpdaElements', type: 'range', label: 'Log-periodic elements', min: 3, max: 24, step: 1, when: c => c.family === 'lpda' },
    { key: 'lpdaTau', type: 'range', label: 'Log-periodic scale ratio (tau)', min: 0.75, max: 0.98, step: 0.005, when: c => c.family === 'lpda' },
    { key: 'lpdaSpacing', type: 'range', label: 'Spacing / preceding full dipole length', min: 0.1, max: 0.5, step: 0.005, when: c => c.family === 'lpda' },
    { key: 'lpdaArmWidth', type: 'range', label: 'Longest dipole arm width', unit: 'mm', min: 0.1, max: 5, step: 0.05, when: c => c.family === 'lpda' },
    { type: 'note', when: c => c.family === 'lpda', text: 'Target frequency sizes the longest dipole. Radiator trace width sets the overlapping front/back boom width. Feed at the smallest-element end; add an external balun for a single-ended radio.' },
    { key: 'vivaldiLength', type: 'number', label: 'Vivaldi taper length', unit: 'mm', when: c => c.family === 'vivaldi' },
    { key: 'vivaldiAperture', type: 'number', label: 'Vivaldi aperture width', unit: 'mm', when: c => c.family === 'vivaldi' },
    { key: 'vivaldiThroat', type: 'range', label: 'Vivaldi throat width', unit: 'mm', min: 0.1, max: 10, step: 0.05, when: c => c.family === 'vivaldi' },
    { key: 'vivaldiBackslot', type: 'range', label: 'Vivaldi back slot length', unit: 'mm', min: 1, max: 100, step: 0.1, when: c => c.family === 'vivaldi' },
    { key: 'vivaldiStub', type: 'range', label: 'Vivaldi open feed stub', unit: 'mm', min: 0.1, max: 100, step: 0.1, when: c => c.family === 'vivaldi' },
    { type: 'note', when: c => c.family === 'vivaldi', text: 'Taper dimensions are entered directly. Target frequency sizes the microstrip feed and reports aperture / wavelength; it does not automatically tune the antenna.' },
  ] });
  panel.group({ key: 'nfc', title: 'NFC loop and tuning', when: isNfc, open: true, fields: [
    { key: 'loopShape', type: 'select', label: 'Loop shape', options: options({ circle: 'Circular', polygon: 'Square' }), when: isNfc },
    { key: 'loopTurns', type: 'range', label: 'Loop turns', min: 1, max: 20, step: 1, when: isNfc },
    { key: 'loopDiameter', type: 'range', label: 'Loop outer diameter', unit: 'mm', min: 5, max: 150, step: 0.1, when: isNfc },
    { key: 'loopGap', type: 'range', label: 'Loop turn clearance', unit: 'mm', min: 0.1, max: 3, step: 0.05, when: isNfc },
    { key: 'parasiticPf', type: 'number', label: 'Parallel parasitic capacitance', unit: 'pF', when: isNfc },
    { key: 'targetLoopL', type: 'number', label: 'Target loop inductance', unit: 'H', si: true, format: v => eng(v, '', 5), when: isNfc },
    { key: '_sizeNfc', type: 'action', label: 'Size loop to target inductance', when: isNfc, onClick: () => {
      try { api.set('loopDiameter', sizeNfcLoop(panel.state)); }
      catch (e) { api.toast(e.message, 'error'); }
    } },
  ] });
  panel.group({ key: 'array', title: 'Patch array', when: c => c.family === 'patch-array', fields: [
    { key: 'arrayRows', type: 'range', label: 'Array rows', min: 1, max: MAX_ARRAY_DIMENSION, step: 1, when: c => c.family === 'patch-array' },
    { key: 'arrayCols', type: 'range', label: 'Array columns', min: 1, max: MAX_ARRAY_DIMENSION, step: 1, when: c => c.family === 'patch-array' },
    { type: 'note', text: `Up to ${MAX_ARRAY_DIMENSION} × ${MAX_ARRAY_DIMENSION} elements. Rows and columns can differ; use one row or column for a linear array. Check the overall board dimensions before fabrication.` },
    { key: 'spacingX', type: 'range', label: 'Column spacing / free-space wavelength', min: 0.3, max: 1.5, step: 0.01, when: c => c.family === 'patch-array' },
    { key: 'spacingY', type: 'range', label: 'Row spacing / free-space wavelength', min: 0.3, max: 1.5, step: 0.01, when: c => c.family === 'patch-array' },
    { key: 'arrayFeed', type: 'select', label: 'Array feed', options: options({ individual: 'Individual element ports', tree: 'Connected feed tree (requires matching)' }), when: c => c.family === 'patch-array' },
  ] });
  panel.group({ key: 'feed', title: 'Feed and ground', fields: [
    { key: 'feedZ', type: 'range', label: 'Feed line impedance', unit: 'Ω', min: 20, max: 150, step: 1, when: lineFed },
    { key: 'feedLength', type: 'range', label: 'Feed length', unit: 'mm', min: 1, max: 100, step: 0.1, when: c => (lineFed(c) && c.family !== 'vivaldi') || c.family === 'lpda' },
    { key: 'groundWidth', type: 'range', label: 'Ground width', unit: 'mm', min: 5, max: 150, step: 0.5, when: isIfa },
    { key: 'groundLength', type: 'range', label: 'Ground length', unit: 'mm', min: 5, max: 150, step: 0.5, when: isIfa },
    { key: 'margin', type: 'range', label: 'Ground / clearance margin', unit: 'mm', min: 1, max: 30, step: 0.1 },
  ] });
  panel.group({ key: 'substrate', title: 'Substrate', fields: [
    { key: 'boardT', type: 'range', label: 'Front to back copper spacing', unit: 'mm', min: 0.1, max: 3.2, step: 0.01, when: c => lineFed(c) || c.family === 'lpda' },
    { key: 'epsR', type: 'range', label: 'Dielectric εr', min: 1.1, max: 12, step: 0.05, when: c => !isNfc(c) },
    { key: 'copperOz', type: 'range', label: 'Copper weight', unit: 'oz', min: 0.25, max: 4, step: 0.25 },
  ] });
}
export const compute = buildAntenna;
export const handles = () => [];
export const layerList = (c, r) => r.layers.map((n, i) => [n, colourFor(n, i)]);
export const notes = (c, r) => r.notes;
export function charts(c, r) {
  const a = r.analysis;
  if (!a?.angles) return [];
  return [{ id: 'array-factor', title: 'Ideal array factor — equal phase/amplitude', note: 'Normalized point-element cuts; excludes feed network and element pattern.', spec: {
    x: { values: a.angles, label: 'Angle from broadside (°)' }, y: { label: 'Normalized amplitude (dB)', min: -60, max: 0 },
    series: [{ name: 'X cut', values: a.arrayFactorX, color: '#70A2E8' }, { name: 'Y cut', values: a.arrayFactorY, color: '#DE8686' }],
  } }];
}
export function tiles(c, r) {
  const a = r.analysis; if (!a) return [];
  if (directional(c)) {
    const out = [{ k: 'Overall board W × H', v: `${num(a.boardWidth, 2)} × ${num(a.boardHeight, 2)}`, sub: 'mm' }];
    if (c.family === 'vivaldi') out.push({ k: 'Taper length × aperture', v: `${num(a.taperLength, 2)} × ${num(a.aperture, 2)}`, sub: 'mm' }, { k: 'Throat width', v: `${num(a.throat, 2)} mm` }, { k: 'Feed width', v: `${num(a.feedW, 3)} mm` }, { k: 'Aperture / free-space wavelength', v: num(a.apertureWavelengths, 3) });
    else if (c.family === 'lpda') out.push({ k: 'Dipole elements', v: String(a.elements) }, { k: 'Longest / shortest dipole', v: `${num(a.longestLength, 2)} / ${num(a.shortestLength, 2)}`, sub: 'mm' }, { k: 'Element-length frequency span', v: `${eng(a.lengthFrequencyLow, 'Hz', 3)} – ${eng(a.lengthFrequencyHigh, 'Hz', 3)}`, sub: 'half-wave reference, not usable bandwidth' });
    else out.push({ k: 'Driven span', v: `${num(a.drivenLength, 2)} mm` }, ...(c.family === 'yagi' ? [{ k: 'Total elements', v: String(a.elements) }, { k: 'Reflector length', v: `${num(a.reflectorLength, 2)} mm` }, { k: 'Director spacing', v: `${num(a.directorSpacing, 2)} mm` }] : [{ k: 'Flare angle', v: `${num(a.flareAngle, 1)}°` }]));
    if (a.profileSteps) out.push({ k: 'Copper profile steps / side', v: String(a.profileSteps), sub: `${num(a.profileStep, 3)} mm edge step` });
    if (c.family !== 'vivaldi') out.push({ k: 'Assumed effective εr', v: num(a.ee, 3) });
    return out;
  }
  if (c.family === 'circular-patch') return [{ k: 'Patch radius', v: `${num(a.radius, 3)} mm` }, { k: 'Estimated TM11 resonance', v: eng(a.resonance, 'Hz', 4) }, { k: 'Feed width', v: `${num(a.feedW, 3)} mm` }];
  if (c.family === 'slot') return [{ k: 'Slot length × width', v: `${num(a.slotLength, 2)} × ${num(a.slotWidth, 2)} mm` }, { k: 'Open stub length', v: `${num(a.stub, 2)} mm` }, { k: 'Feed width', v: `${num(a.feedW, 3)} mm` }, { k: 'Assumed effective εr', v: num(a.ee, 3) }];
  if (isNfc(c)) return [{ k: 'Loop inductance', v: eng(a.inductance, 'H', 4) }, { k: 'DC resistance (20 °C)', v: eng(a.resistance, 'Ω', 4) }, { k: 'External tuning C', v: eng(a.externalC, 'F', 4), sub: 'ideal unloaded resonance' }, { k: 'Total resonant C', v: eng(a.totalC, 'F', 4) }];
  if (!patch(c)) return [{ k: 'Radiator span', v: eng(a.span * 1e-3, 'm', 4) }, { k: 'Conductor length', v: eng(a.conductorLength * 1e-3, 'm', 4) }, { k: 'Assumed effective εr', v: num(a.ee, 3) }];
  const out = [{ k: 'Estimated resonance', v: eng(a.resonance, 'Hz', 4) }, { k: 'Patch W × L', v: `${num(a.W, 2)} × ${num(a.L, 2)}`, sub: 'mm' }, { k: 'Feed width', v: `${num(a.feedW, 3)} mm` }, { k: 'Effective εr', v: num(a.ee, 3) }];
  if (a.insetDepth != null) out.push({ k: 'Estimated inset resistance', v: eng(a.inputResistance, 'Ω', 4), sub: 'from assumed edge resistance' });
  if (a.elements != null) out.push({ k: 'Array elements', v: String(a.elements), sub: `${a.rows} rows × ${a.cols} columns` }, { k: 'Element spacing X × Y', v: `${num(a.dx, 1)} × ${num(a.dy, 1)}`, sub: 'mm' }, { k: 'Overall board W × H', v: `${num(a.boardWidth, 1)} × ${num(a.boardHeight, 1)}`, sub: 'mm' });
  return out;
}
export function spec(c, r) {
  const rows = [['Topology', ANTENNA_FAMILIES[c.family || 'patch']], ['Model', r.model], ['Supported outputs', r.capabilities.join('; ')], ['Copper layers', r.layers.join(', ')]];
  for (const t of tiles(c, r)) rows.push([t.k, `${t.v}${t.sub ? ` (${t.sub})` : ''}`]);
  for (const p of r.art.ports) rows.push([p.name, `${p.net}${p.layer ? `; ${p.layer}` : ''}; x=${num(p.x, 3)}, y=${num(p.y, 3)} mm`]);
  return [{ title: 'Antenna geometry and model', rows }];
}
export const status = (c, r) => ({ algo: r.model, summary: `${ANTENNA_FAMILIES[c.family || 'patch']} · ${eng(c.freq, 'Hz', 3)}` });
