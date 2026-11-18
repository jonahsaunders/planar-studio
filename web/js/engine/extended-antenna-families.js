import { antennaArt, finishAntenna } from './antenna-artwork.js';
import { range } from './creator-validation.js';
import { annularPatch, cavitySlot, leakyWave, stackedPatch, uSlotPatch } from './guided-antenna-families.js';
import { ellipticalMonopole, forkedMonopole, franklin, sinuous, turnstile } from './printed-antenna-families.js';

function field(key, label, value, min, max, step, unit) {
  return { key, label, value, min, max, step, unit, type: 'range' };
}

// The workspace and imported designs use the same parameter ranges.
export const EXTENDED_ANTENNAS = {
  'cpw-ellipse': {
    name: 'CPW-fed elliptical monopole', build: ellipticalMonopole, trace: true, launch: true, width: true,
    fields: [
      field('cpwGap', 'Coplanar ground gap', 0.4, 0.15, 3, 0.05, 'mm'),
      field('ellipseAspect', 'Ellipse width / height', 1.35, 0.5, 2.5, 0.05),
      field('ellipseScale', 'Radiator length tuning', 1, 0.5, 1.5, 0.01),
      field('cpwProfileStep', 'Ellipse edge step', 0.35, 0.1, 2, 0.05, 'mm'),
    ],
    metrics: [['Radiator height', 'height', 'mm'], ['Radiator width', 'width', 'mm'], ['Coplanar gap', 'gap', 'mm']],
  },
  'forked-monopole': {
    name: 'Dual-band forked monopole', build: forkedMonopole, trace: true, feed: true, width: true, ground: true,
    fields: [
      field('forkRatio', 'Upper / lower frequency', 1.8, 1.2, 3.5, 0.05),
      field('forkSpread', 'Branch offset from center', 3, 0.8, 30, 0.1, 'mm'),
      field('forkScale', 'Branch length tuning', 1, 0.5, 1.5, 0.01),
    ],
    metrics: [['Long branch length', 'low', 'mm'], ['Short branch length', 'high', 'mm'], ['Lower frequency reference', 'lowFrequency', 'Hz'], ['Upper frequency reference', 'highFrequency', 'Hz']],
  },
  'u-slot-patch': {
    name: 'U-slot microstrip patch', build: uSlotPatch, feed: true, patch: true,
    fields: [
      field('uSlotSpan', 'U span / patch width', 0.55, 0.2, 0.85, 0.01),
      field('uSlotDepth', 'U depth / patch length', 0.46, 0.15, 0.65, 0.01),
      field('uSlotWidth', 'U-slot width', 0.65, 0.15, 6, 0.05, 'mm'),
    ],
    metrics: [['Patch width', 'W', 'mm'], ['Patch length', 'L', 'mm'], ['Slot span', 'span', 'mm'], ['Slot depth', 'depth', 'mm'], ['Unslotted resonance', 'resonance', 'Hz']],
  },
  'annular-ring-patch': {
    name: 'Annular-ring microstrip patch', build: annularPatch, feed: true,
    fields: [
      field('ringInnerRatio', 'Inner / outer radius', 0.55, 0.2, 0.8, 0.01),
      field('ringScale', 'Ring size tuning', 1, 0.5, 1.5, 0.01),
      field('ringStep', 'Ring edge step', 0.35, 0.1, 2, 0.05, 'mm'),
    ],
    metrics: [['Outer radius', 'outer', 'mm'], ['Inner radius', 'inner', 'mm'], ['Ring width', 'thickness', 'mm'], ['Circumference reference', 'resonance', 'Hz']],
  },
  'aperture-stacked-patch': {
    name: 'Aperture-coupled stacked patch', build: stackedPatch, feed: true,
    fields: [
      field('stackPatchScale', 'Coupled patch size tuning', 1, 0.65, 1.35, 0.01),
      field('stackTopScale', 'Parasitic / coupled patch side', 1.08, 0.7, 1.4, 0.01),
      field('stackAperture', 'Aperture length / patch side', 0.5, 0.25, 0.8, 0.01),
      field('stackSlotWidth', 'Aperture width', 0.8, 0.15, 6, 0.05, 'mm'),
      field('stackStub', 'Feed stub / dielectric wavelength', 0.12, 0.05, 0.3, 0.01),
      field('stackFeedFraction', 'Feed-to-ground / board thickness', 0.32, 0.15, 0.7, 0.01),
      field('stackDrivenFraction', 'Ground-to-patch / board thickness', 0.3, 0.15, 0.7, 0.01),
    ],
    metrics: [['Coupled patch side', 'driven', 'mm'], ['Parasitic patch side', 'top', 'mm'], ['Aperture length', 'slotLength', 'mm'], ['Feed-to-ground spacing', 'feedHeight', 'mm'], ['Ground-to-patch spacing', 'drivenHeight', 'mm'], ['Patch-to-patch spacing', 'upperHeight', 'mm']],
  },
  turnstile: {
    name: 'Crossed-dipole turnstile', build: turnstile, trace: true, gap: true,
    fields: [field('turnstileScale', 'Dipole length tuning', 1, 0.5, 1.5, 0.01)],
    metrics: [['Dipole span', 'span', 'mm'], ['Balanced feed gap', 'gap', 'mm'], ['Half-wave reference', 'resonance', 'Hz']],
  },
  'four-arm-sinuous': {
    name: 'Four-arm planar sinuous antenna', build: sinuous,
    fields: [
      field('sinuousCells', 'Cells per arm', 4, 2, 12, 1),
      field('sinuousTau', 'Cell radius ratio', 0.76, 0.55, 0.92, 0.01),
      field('sinuousSwing', 'Angular swing', 25, 10, 42, 1, '°'),
      field('sinuousWidth', 'Sinuous trace width', 0.4, 0.1, 3, 0.05, 'mm'),
      field('sinuousGap', 'Minimum arm clearance', 0.3, 0.1, 3, 0.05, 'mm'),
      field('sinuousScale', 'Outer-radius tuning', 1.35, 0.8, 3, 0.01),
    ],
    metrics: [['Inner radius', 'inner', 'mm'], ['Outer radius', 'outer', 'mm'], ['Cells per arm', 'turns'], ['Angular swing', 'swing', '°'], ['Required copper gap', 'gap', 'mm']],
  },
  'cavity-backed-slot': {
    name: 'Cavity-backed slot antenna', build: cavitySlot, feed: true,
    fields: [
      field('cavityAspect', 'Cavity length / width', 1.05, 0.65, 1.5, 0.01),
      field('cavitySlotScale', 'Slot length tuning', 0.9, 0.55, 1.1, 0.01),
      field('cavitySlotWidth', 'Radiating slot width', 0.9, 0.15, 5, 0.05, 'mm'),
      field('cavitySlotPosition', 'Slot position / cavity length', 0.66, 0.2, 0.8, 0.01),
      field('cavityVia', 'Cavity via pad diameter', 0.8, 0.35, 4, 0.05, 'mm'),
      field('cavityDrill', 'Cavity via drill', 0.4, 0.2, 3, 0.05, 'mm'),
      field('cavityPitch', 'Maximum cavity via pitch', 1.38, 0.4, 8, 0.01, 'mm'),
    ],
    metrics: [['Cavity width', 'width', 'mm'], ['Cavity length', 'length', 'mm'], ['Slot length', 'slotLength', 'mm'], ['Slot width', 'slotWidth', 'mm'], ['Fence vias', 'vias'], ['Input opening', 'entrance', 'mm']],
  },
  'microstrip-leaky-wave': {
    name: 'Periodic microstrip leaky-wave antenna', build: leakyWave, feed: true,
    fields: [
      field('lwaCells', 'Loading cells', 6, 2, 24, 1),
      field('lwaAngle', 'Unloaded-line angle reference', 15, -50, 50, 1, '°'),
      field('lwaStubScale', 'Stub length / guide wavelength', 0.22, 0.08, 0.45, 0.01),
      field('lwaStubWidth', 'Loading stub width', 1, 0.2, 5, 0.05, 'mm'),
    ],
    metrics: [['Cells', 'count'], ['Cell pitch', 'period', 'mm'], ['Stub length', 'stubLength', 'mm'], ['Active length', 'activeLength', 'mm'], ['Angle used for sizing', 'angle', '°']],
  },
  'franklin-collinear': {
    name: 'Printed Franklin collinear array', build: franklin, trace: true, feed: true, width: true, ground: true,
    fields: [
      field('franklinSections', 'Radiating sections', 3, 2, 12, 1),
      field('franklinGap', 'Phasing fold copper gap', 0.7, 0.15, 8, 0.05, 'mm'),
      field('franklinScale', 'Section length tuning', 1, 0.6, 1.4, 0.01),
    ],
    metrics: [['Sections', 'count'], ['Section length', 'halfWave', 'mm'], ['Fold leg length', 'depth', 'mm'], ['Radiating span', 'span', 'mm']],
  },
};

export const EXTENDED_ANTENNA_NAMES = Object.fromEntries(Object.entries(EXTENDED_ANTENNAS).map(([id, family]) => [id, family.name]));
export const extendedAntennaDefaults = () => Object.fromEntries(Object.values(EXTENDED_ANTENNAS)
  .flatMap(family => family.fields.map(f => [f.key, f.value])));

export function buildExtendedAntenna(c, env) {
  const family = EXTENDED_ANTENNAS[c.family];
  for (const field of family.fields) range(c, field.key, field.min, field.max, field.step === 1);
  const art = antennaArt(c, env);
  return finishAntenna(art, c, env, family.build(art, c, env));
}
