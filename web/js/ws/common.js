/* Shared workspace pieces: defaults, layer handling, and the bridge between a
   real KiCad board and a design that has not been placed yet.

   The interesting function here is `applyBoardContext`. When a board is open,
   its stack-up is the truth: layer count, copper weight, dielectric constant
   and board thickness are facts, not preferences. Reading them and pushing
   them into the design is most of what "integrated" means in practice -- the
   difference between a tool that computes inductance for a board you might
   build and one that computes it for the board on your screen. */

import { KICAD_COLORS, OZ_MM, layerNames } from '../engine/coil.js';

export const LAYER_PALETTE = KICAD_COLORS;

export function colourFor(name, index) {
  if (name === 'F.Cu') return KICAD_COLORS[0];
  if (name === 'B.Cu') return KICAD_COLORS[15];
  const m = /^In(\d+)\.Cu$/.exec(name);
  if (m) return KICAD_COLORS[Number(m[1]) % KICAD_COLORS.length];
  return KICAD_COLORS[(index || 0) % KICAD_COLORS.length];
}

/** Layer names the design should use, given the board when there is one. */
export function chooseLayers(cfg, boardCtx) {
  const want = Math.max(1, cfg.layers | 0);
  const available = boardCtx && boardCtx.copperLayers && boardCtx.copperLayers.length
    ? boardCtx.copperLayers.map((l) => l.name)
    : layerNames(want);
  if (available.length >= want) {
    if (want === 1) return [available[0]];
    // Front, then inner layers in order, then back -- the natural stack for a
    // winding that has to get from top to bottom.
    if (want === available.length) return available.slice();
    const out = [available[0]];
    for (let i = 1; i < want - 1; i++) out.push(available[i]);
    out.push(available[available.length - 1]);
    return out;
  }
  return layerNames(want);
}

/** Pull substrate and process facts out of the open board. */
export function applyBoardContext(cfg, ctx) {
  if (!ctx) return { applied: [], cfg };
  const applied = [];
  const next = { ...cfg };

  if (ctx.layerCount >= 1 && next.layers > ctx.layerCount) {
    next.layers = ctx.layerCount;
    applied.push(`layer count clamped to the board's ${ctx.layerCount}`);
  }
  if (ctx.thickness > 0.05 && Math.abs(ctx.thickness - next.boardT) > 1e-3) {
    next.boardT = Number(ctx.thickness.toFixed(4));
    applied.push(`board thickness ${next.boardT} mm`);
  }
  if (ctx.epsR > 1.2 && Math.abs(ctx.epsR - next.epsR) > 1e-3) {
    next.epsR = Number(ctx.epsR.toFixed(3));
    applied.push(`εr ${next.epsR}`);
  }
  if (ctx.copperThicknessMm > 0.005) {
    const oz = ctx.copperThicknessMm / OZ_MM;
    if (Math.abs(oz - next.copperOz) > 0.05) {
      next.copperOz = Number(oz.toFixed(2));
      applied.push(`copper ${next.copperOz.toFixed(2)} oz`);
    }
  }
  return { applied, cfg: next };
}

/** A stable id for a design, so a placement can be found and replaced later. */
export function designId(kind, name) {
  const slug = String(name || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${kind}:${slug || 'design'}`;
}

/* Shared process/substrate fields, used by every workspace so the same board
   facts are edited in the same place whatever you are designing. */
export const substrateFields = (over = {}) => [
  {
    key: 'boardT', type: 'range', label: 'Board thickness', unit: 'mm',
    min: 0.2, max: 3.2, step: 0.01, hardMin: 0.05,
    hint: over.boardHint,
  },
  { key: 'epsR', type: 'range', label: 'Dielectric εr', min: 2.2, max: 10.5, step: 0.05, hardMin: 1 },
  {
    key: 'copperOz', type: 'range', label: 'Copper weight', unit: 'oz',
    min: 0.25, max: 4, step: 0.25,
    hint: 'Finished copper. 1 oz is 34.8 µm.',
  },
  { key: 'tempC', type: 'range', label: 'Operating temperature', unit: '°C', min: -40, max: 125, step: 1 },
];

export const processFields = () => [
  { key: 'traceW', type: 'range', label: 'Track width', unit: 'mm', min: 0.075, max: 2, step: 0.005, hardMin: 0.02 },
  { key: 'traceS', type: 'range', label: 'Clearance', unit: 'mm', min: 0.075, max: 2, step: 0.005, hardMin: 0.02 },
  { key: 'viaDrill', type: 'range', label: 'Via drill', unit: 'mm', min: 0.15, max: 1, step: 0.05 },
  { key: 'viaPad', type: 'range', label: 'Via pad', unit: 'mm', min: 0.3, max: 1.8, step: 0.05 },
  { key: 'padSize', type: 'range', label: 'Terminal pad', unit: 'mm', min: 0.6, max: 4, step: 0.1 },
  { key: 'padDrill', type: 'range', label: 'Terminal drill', unit: 'mm', min: 0.2, max: 2.5, step: 0.05 },
];

/** Shared operating-point fields. */
export const driveFields = () => [
  {
    key: 'freq', type: 'range', label: 'Frequency', unit: 'Hz', si: true,
    min: 1e3, max: 1e9, step: 1e3, format: (v) => fmtHz(v),
    hint: 'Sets the skin depth, the AC resistance and the Q that are reported.',
  },
  { key: 'current', type: 'range', label: 'Current', unit: 'A', min: 0.01, max: 40, step: 0.01 },
  { key: 'cExtra', type: 'range', label: 'Added capacitance', unit: 'pF', min: 0, max: 200, step: 0.5 },
];

export function fmtHz(v) {
  if (!isFinite(v)) return '—';
  if (v >= 1e9) return `${(v / 1e9).toPrecision(4)}G`;
  if (v >= 1e6) return `${(v / 1e6).toPrecision(4)}M`;
  if (v >= 1e3) return `${(v / 1e3).toPrecision(4)}k`;
  return String(Math.round(v));
}

export const SHAPES = [
  { value: 'circle', label: 'Circle', hint: 'Archimedean spiral. Constant pitch, exact clearance everywhere, highest inductance per unit area.' },
  { value: 'polygon', label: 'Polygon', hint: 'Corner-stepped regular polygon with filleted corners. The classic square spiral when sides = 4.' },
  { value: 'racetrack', label: 'Racetrack', hint: 'Rounded rectangle offset continuously. Best when the space is not square.' },
  { value: 'log', label: 'Log', hint: 'Equiangular spiral. Clearance grows outward, so the innermost turn sets the DRC limit.' },
  { value: 'wedge', label: 'Wedge', hint: 'Annular sector for an axial-flux stator. Tiles around a ring without gaps.' },
  { value: 'super', label: 'Gielis', hint: 'Superformula contour walked inward. Stars, polygons and lobed shapes from four numbers.' },
  { value: 'custom', label: 'Custom', hint: 'Any closed contour, resampled and offset inward once per turn.' },
];
