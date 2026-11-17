import { layerNames, OZ_MM } from './coil.js';

export const fabricationFields = [
  ['layers', 'Available copper layers', 2, 32, 2, 2],
  ['boardT', 'Board thickness (mm)', 0.05, 20, 0.01, 1.6],
  ['copperOz', 'Copper weight (oz)', 0.05, 10, 0.05, 1],
  ['epsR', 'Dielectric relative permittivity', 1, 30, 0.01, 4.4],
  ['rfHeight', 'RF signal-to-reference dielectric (mm)', 0.02, 20, 0.01, 1.6],
  ['tanD', 'Dielectric loss tangent', 0, 0.5, 0.001, 0.02],
  ['minTrace', 'Minimum track width (mm)', 0.025, 2, 0.005, 0.15],
  ['minGap', 'Minimum copper gap (mm)', 0.025, 2, 0.005, 0.15],
  ['minDrill', 'Minimum finished drill (mm)', 0.05, 5, 0.01, 0.3],
  ['etch', 'Etch width variation ± (mm)', 0, 1, 0.005, 0.025],
  ['thickness', 'Dielectric thickness variation ± (%)', 0, 99, 0.1, 5],
  ['copper', 'Copper weight variation ± (%)', 0, 99, 0.1, 10],
  ['er', 'Dielectric permittivity variation ± (%)', 0, 99, 0.1, 5],
];

export const fabricationDefaults = Object.fromEntries(fabricationFields.map(([key, , , , , value]) => [key, value]));

export function captureFabricationStack(board) {
  const names = layerNames(board?.copperLayers?.length || 2);
  const stack = board?.copperLayers;
  if (!stack || stack.length < 2 || stack.length > 32 || stack.length % 2 !== 0 ||
      stack.some((layer, i) => layer.name !== names[i] || !Number.isFinite(layer.centerHeightMm)
        || !(layer.thicknessMm > 0) || (i && layer.centerHeightMm <= stack[i - 1].centerHeightMm))) {
    throw new Error('The open KiCad board must have a complete physical copper stack.');
  }
  return stack.map(({ name, centerHeightMm, thicknessMm }) => ({ name, centerHeightMm, thicknessMm }));
}

export function validateFabrication(profile) {
  if (!String(profile.name || '').trim()) throw new Error('Enter a name for this fabrication profile.');
  for (const [key, name, min, max] of fabricationFields) {
    if (!Number.isFinite(profile[key]) || profile[key] < min || profile[key] > max) {
      throw new Error(`${name} must be between ${min} and ${max}.`);
    }
  }
  if (profile.layers % 2 !== 0) throw new Error('Use an even copper layer count.');
  if (profile.rfHeight > profile.boardT + 1e-9) throw new Error('The RF dielectric span cannot exceed the board thickness.');
  if (profile.stack) {
    captureFabricationStack({ copperLayers: profile.stack });
    if (profile.stack.length !== profile.layers) throw new Error('The captured stack and layer count differ.');
  }
  return profile;
}

export function enforceFabrication(config, profile) {
  if (!profile) return;
  for (const key of ['traceW', 'minTrace', 'fingerW', 'loopWidth', 'loopW']) {
    if (Number.isFinite(config[key])) config[key] = Math.max(config[key], profile.minTrace);
  }
  for (const key of ['traceS', 'clearance', 'minGap', 'fingerG', 'loopGap']) {
    if (Number.isFinite(config[key])) config[key] = Math.max(config[key], profile.minGap);
  }
  for (const key of ['layers', 'coilLayers']) {
    if (Number.isFinite(config[key])) config[key] = Math.min(config[key], profile.layers);
  }
  for (const [drill, diameter] of [['viaDrill', 'viaPad'], ['padDrill', 'padSize']]) {
    if (!(config[drill] > 0) || config[drill] >= profile.minDrill) continue;
    const ring = Math.max(0.2, (config[diameter] || 0) - config[drill]);
    config[drill] = profile.minDrill;
    config[diameter] = Math.max(config[diameter] || 0, profile.minDrill + ring);
  }
}

export function fabricationPatch(config, kind, profile) {
  validateFabrication(profile);
  const patch = {
    fabricationProfile: { ...profile }, boardT: profile.boardT, copperOz: profile.copperOz, epsR: profile.epsR,
    tools: {
      ...config.tools,
      tolerance: { ...config.tools?.tolerance, etch: profile.etch, thickness: profile.thickness, copper: profile.copper, er: profile.er },
    },
  };
  if (kind === 'transformer') patch.dielectricEr = profile.epsR;
  if (kind === 'filter') Object.assign(patch, {
    rfStackSource: profile.stack ? 'board' : 'manual', subH: profile.rfHeight, subEr: profile.epsR,
    subT: profile.copperOz * OZ_MM, subReferenceT: profile.copperOz * OZ_MM, tanD: profile.tanD, fixedDesign: null,
  });
  const effective = { ...config, ...patch };
  enforceFabrication(effective, profile);
  for (const key of Object.keys(effective)) {
    if (effective[key] !== config[key]) patch[key] = effective[key];
  }
  return patch;
}

export function fabricationFindings(art, profile) {
  if (!profile) return [];
  const findings = [];
  for (const [label, shapes, field, minimum] of [
    ['track width', [...art.tracks, ...art.arcs], 'width', profile.minTrace],
    ['drill', [...art.vias, ...art.pads], 'drill', profile.minDrill],
  ]) {
    const sizes = shapes.map(shape => shape[field]).filter(size => size > 0);
    const smallest = sizes.reduce((a, b) => Math.min(a, b), Infinity);
    if (smallest < minimum - 1e-6) {
      findings.push(`Generated ${label} ${smallest.toFixed(3)} mm is below the ${profile.name} minimum (${minimum} mm).`);
    }
  }
  const layers = layerNames(profile.layers);
  const used = [...new Set([...art.tracks, ...art.arcs, ...art.pads].map(item => item.layer).concat(art.meta.boardLayers || []))];
  const missing = used.filter(layer => layer?.endsWith('.Cu') && !layers.includes(layer));
  if (missing.length) findings.push(`${profile.name} has no ${missing.join(', ')}.`);
  return findings;
}
