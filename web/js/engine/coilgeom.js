/* ============================================================================
   COIL AND STATOR LAYOUT — buildCoil output into artwork.

   Two jobs. Turning one winding into primitives, and tiling it around a ring
   for an axial-flux stator, including the phase interconnect that a real
   stator needs and that a bare array of coils does not have.
   ========================================================================= */

import {
  artwork, track, via, pad, label, arcPts, merge, transform, bounds, TAU,
} from './artwork.js';
import { layerNames } from './coil.js';
import { starBus } from './motorbus.js';

export const PHASE_NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];

/* Motor coils are positioned in their slot by buildCoil before rotation.
   Ordinary inductor shapes remain centred and are never arrayed. */
export function instances(cfg) {
  if ((!cfg.motorGeometry && cfg.shape !== 'wedge') || !cfg.arrayEnabled || cfg.coilCount < 2) {
    return [{ angle: 0, phase: 0, index: 0 }];
  }
  const n = cfg.coilCount;
  const out = [];
  const offset = cfg.motorGeometry ? (cfg.terminalAngle ?? -90) * Math.PI / 180 + Math.PI / n : 0;
  for (let i = 0; i < n; i++) out.push({ angle: TAU * i / n + offset, phase: i % cfg.phases, index: i });
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
 * A star connection uses an outer collar and two layers for crossings.
 * Its arcs implement the selected series or parallel topology.
 */
export function buildArtwork(cfg, coil, opt = {}) {
  const A = artwork({ name: opt.name || 'coil', kind: cfg.arrayEnabled && (cfg.shape === 'wedge' || cfg.motorGeometry) ? 'stator' : 'coil' });
  const inst = instances(cfg);
  const arrayed = inst.length > 1;
  const names = coil.names || layerNames(cfg.layers);

  const bus = arrayed && cfg.busEnabled !== false ? starBus(cfg, coil, inst, names, opt) : null;
  for (const it of inst) {
    const netName = bus?.meta.routed ? (opt.net || 'COIL') : arrayed ? `${opt.net || 'COIL'}_${PHASE_NAMES[it.phase]}` : (opt.net || 'COIL');
    const one = coilArtwork(cfg, coil, { net: netName, name: `${opt.name || 'coil'}-${it.index}` });
    for (const t of one.tracks) t.phase = it.phase;
    if (arrayed) one.pads.forEach((p, i) => { p.number = `C${it.index + 1}.${i + 1}`; });
    merge(A, it.angle ? transform(one, { angle: it.angle }) : one);
  }

  if (bus) {
    merge(A, bus);
    A.meta.starRouted = !!bus.meta.routed;
    A.meta.routingOuterRadius = bus.meta.outerRadius;
  }

  if (opt.silk !== false) {
    const b = bounds(A);
    A.labels.push(label(0, b.y1 + 1.4, opt.label || A.meta.name, { size: 1 }));
  }
  A.meta.instances = inst.length;
  A.meta.phases = arrayed ? cfg.phases : 1;
  return A;
}

/** Disc outline, including the routing collar; stators also have a bore. */
export function outlineFor(cfg, coil, margin = 2, art = null) {
  const out = [];
  const R = Math.max(coil.outerR, art?.meta.routingOuterRadius || 0) + margin;
  if ((cfg.shape === 'wedge' || cfg.motorGeometry) && cfg.arrayEnabled) {
    out.push({ layer: 'Edge.Cuts', pts: arcPts(0, 0, R, 0, TAU, 0.05) });
    const ri = Math.max(1, cfg.dInner / 2 - margin);
    out.push({ layer: 'Edge.Cuts', pts: arcPts(0, 0, ri, 0, TAU, 0.05) });
  } else {
    out.push({ layer: 'Edge.Cuts', pts: arcPts(0, 0, R, 0, TAU, 0.05) });
  }
  return out;
}
