/* ============================================================================
   COIL AND STATOR LAYOUT — buildCoil output into artwork.

   Two jobs. Turning one winding into primitives, and tiling it around a ring
   for an axial-flux stator, including the phase interconnect that a real
   stator needs and that a bare array of coils does not have.
   ========================================================================= */

import {
  artwork, track, via, pad, label, run, arcPts, merge, transform, bounds, TAU,
} from './artwork.js';
import { layerNames } from './coil.js';

export const PHASE_NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];

/* Which instances exist, and what phase each belongs to. Only the sector coil
   tiles: every other winding is centred on the origin, so rotating a copy of
   it would land exactly on top of the original. */
export function instances(cfg) {
  if (cfg.shape !== 'wedge' || !cfg.arrayEnabled || cfg.coilCount < 2) {
    return [{ angle: 0, phase: 0, index: 0 }];
  }
  const n = cfg.coilCount;
  const out = [];
  for (let i = 0; i < n; i++) out.push({ angle: TAU * i / n, phase: i % cfg.phases, index: i });
  return out;
}

/**
 * One winding as artwork, centred on the origin.
 * `names` overrides the layer names so a coil can be dropped onto whichever
 * copper layers the open board actually has.
 */
export function coilArtwork(cfg, coil, opt = {}) {
  const A = artwork({ name: opt.name || 'coil', kind: 'coil' });
  const names = coil.names || layerNames(cfg.layers);
  const net = opt.net || 'COIL';

  for (const layer of coil.layers) {
    A.tracks.push(track(names[layer.index], cfg.traceW, layer.pts, {
      role: 'winding', layerIndex: layer.index, net,
    }));
  }
  for (const lk of coil.links) {
    A.tracks.push(track(names[lk.layer], cfg.traceW, lk.pts, { role: 'transition', layerIndex: lk.layer, net }));
  }
  for (const ld of coil.leads) {
    A.tracks.push(track(names[ld.layer], cfg.traceW, ld.pts, { role: 'lead', layerIndex: ld.layer, terminal: ld.terminal, net }));
  }
  for (const v of coil.vias) {
    A.vias.push(via(v.x, v.y, {
      drill: cfg.viaDrill, diameter: cfg.viaPad, net,
      role: v.stitch ? 'stitch' : 'transition', from: v.from, to: v.to,
    }));
  }
  coil.terminals.forEach((t, i) => {
    A.pads.push(pad(t[0], t[1], {
      w: cfg.padSize, drill: cfg.padDrill, number: String(i + 1), net, role: 'terminal',
    }));
  });
  return A;
}

/**
 * A full design: one coil, or a ring of them with the phase interconnect.
 *
 * The interconnect is the part that separates a stator from a picture of one.
 * Coils of the same phase have to be joined in series or parallel, and the
 * joins have to happen somewhere that does not cross another phase. Two
 * concentric ring buses on a spare layer do it: an inner bus per phase and an
 * outer star point, with each coil dropping onto its own ring through a via.
 */
export function buildArtwork(cfg, coil, opt = {}) {
  const A = artwork({ name: opt.name || 'coil', kind: cfg.arrayEnabled && cfg.shape === 'wedge' ? 'stator' : 'coil' });
  const inst = instances(cfg);
  const arrayed = inst.length > 1;
  const names = coil.names || layerNames(cfg.layers);

  for (const it of inst) {
    const netName = arrayed ? `${opt.net || 'COIL'}_${PHASE_NAMES[it.phase]}` : (opt.net || 'COIL');
    const one = coilArtwork(cfg, coil, { net: netName, name: `${opt.name || 'coil'}-${it.index}` });
    merge(A, it.angle ? transform(one, { angle: it.angle }) : one);
  }

  if (arrayed && cfg.busEnabled !== false) {
    merge(A, phaseBus(cfg, coil, inst, names, opt));
  }

  if (opt.silk !== false) {
    const b = bounds(A);
    A.labels.push(label(0, b.y1 + 1.4, opt.label || A.meta.name, { size: 1 }));
  }
  A.meta.instances = inst.length;
  A.meta.phases = arrayed ? cfg.phases : 1;
  return A;
}

/* Concentric ring buses joining same-phase coils, plus a star point. */
function phaseBus(cfg, coil, inst, names, opt) {
  const A = artwork({ name: 'bus', kind: 'bus' });
  const busLayer = names[names.length - 1];
  const w = Math.max(cfg.traceW * 2, 0.4);
  const clearance = cfg.traceS;

  // Rings sit inside the stator bore, where there is no winding copper.
  const rBase = Math.max(cfg.dInner / 2 - (w + clearance) * 1.5, w * 2);
  const phases = cfg.phases;
  const rings = [];
  for (let p = 0; p < phases; p++) rings.push(rBase - p * (w + clearance));
  const rStar = rBase - phases * (w + clearance);

  if (rStar <= w) {
    A.notes.push({
      level: 'warn',
      text: 'No room inside the bore for the phase buses. Increase the inner diameter or route the '
        + 'interconnect by hand.',
    });
    return A;
  }

  for (let p = 0; p < phases; p++) {
    A.tracks.push(track(busLayer, w, arcPts(0, 0, rings[p], 0, TAU, 0.06), {
      role: 'phase-bus', net: `${opt.net || 'COIL'}_${PHASE_NAMES[p]}`,
    }));
  }
  A.tracks.push(track(busLayer, w, arcPts(0, 0, rStar, 0, TAU, 0.06), { role: 'star', net: 'STAR' }));

  // Each coil's inner terminal drops to its phase ring.
  for (const it of inst) {
    const t = coil.terminals[1];
    const ang = Math.atan2(t[1], t[0]) + it.angle;
    const rTerm = Math.hypot(t[0], t[1]);
    const r = rings[it.phase];
    const x0 = rTerm * Math.cos(ang), y0 = rTerm * Math.sin(ang);
    const x1 = r * Math.cos(ang), y1 = r * Math.sin(ang);
    A.vias.push(via(x0, y0, { drill: cfg.viaDrill, diameter: cfg.viaPad, net: `${opt.net || 'COIL'}_${PHASE_NAMES[it.phase]}`, role: 'bus-drop' }));
    A.tracks.push(track(busLayer, w, run(x0, y0, x1, y1), {
      role: 'bus-drop', net: `${opt.net || 'COIL'}_${PHASE_NAMES[it.phase]}`,
    }));
  }

  A.notes.push({
    level: 'info',
    text: `Phase buses are on ${busLayer} inside the bore. Coils of one phase are joined in `
      + `${cfg.coilSeries ? 'series' : 'parallel'}; the star ring is the neutral point for a wye connection.`,
  });
  return A;
}

/** Board outline hints: a disc for a stator, a rounded rectangle otherwise. */
export function outlineFor(cfg, coil, margin = 2) {
  const out = [];
  const R = coil.outerR + margin;
  if (cfg.shape === 'wedge' && cfg.arrayEnabled) {
    out.push({ layer: 'Edge.Cuts', pts: arcPts(0, 0, R, 0, TAU, 0.05) });
    const ri = Math.max(1, cfg.dInner / 2 - margin);
    out.push({ layer: 'Edge.Cuts', pts: arcPts(0, 0, ri, 0, TAU, 0.05) });
  } else {
    out.push({ layer: 'Edge.Cuts', pts: arcPts(0, 0, R, 0, TAU, 0.05) });
  }
  return out;
}
