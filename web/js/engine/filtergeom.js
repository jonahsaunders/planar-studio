/* ============================================================================
   FILTER LAYOUT — synthesised networks into copper.

   Every generator returns an `artwork` and takes the same context: the layer
   names of the real board, the process minimums, and the substrate. They share
   one layout discipline:

     • The signal runs left to right along y = 0. Port 1 is at the left edge,
       port 2 at the right. Whatever the topology, the thing plugs into a board
       the same way.
     • Ground, where a topology needs it, is a rail below the signal at a fixed
       offset, stitched with vias.
     • Nothing crosses. Series elements sit above the spine, shunt elements
       below it, and the two never share an x-range — which is what makes the
       result routable on one copper layer without an underpass.

   The layouts are the textbook forms, not optimised ones. A parallel-coupled
   filter built from first-order synthesis lands maybe 20 % wide in bandwidth
   and a percent or two low in centre frequency; that is a property of the
   synthesis, not of the drawing, and the response plot shows it honestly
   rather than quietly retuning the geometry to hide it.
   ========================================================================= */

import {
  artwork, track, via, pad, label, run, fillRect, uBend,
  merge, transform, defaultNet,
} from './artwork.js';
import { buildCoil, analyse, solveCoilForL } from './coil.js';
import { interdigitalCap, interdigitalFingersFor, plateAreaFor, microstrip } from './microstrip.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* --------------------------------------------------------------------------
   Context defaults
   ----------------------------------------------------------------------- */

export function defaultContext(over = {}) {
  return {
    layers: ['F.Cu', 'B.Cu'],
    signalLayer: 'F.Cu',
    groundLayer: 'B.Cu',
    net: 'RF',
    gndNet: 'GND',
    traceW: 0.25,
    clearance: 0.2,
    minTrace: 0.15,
    viaDrill: 0.3,
    viaPad: 0.6,
    padSize: 1.6,
    padDrill: 0.8,
    feedLength: 3.0,
    railGap: 2.0,          // clearance between the lowest copper and the rail
    railWidth: 1.2,
    // Substrate
    h: 1.6, er: 4.4, t: 0.035, tanD: 0.02, minGap: 0.15,
    boardT: 1.6, copperOz: 1.0,
    // Lumped realisation
    capStyle: 'interdigital',   // or 'plate'
    fingerW: 0.25, fingerG: 0.25, capOverlap: 3.0,
    coilShape: 'racetrack', coilLayers: 2, coilDiameter: 6.0,
    ...over,
  };
}

/* --------------------------------------------------------------------------
   Small routing helpers. An L-route is two segments; nothing here needs more.
   ----------------------------------------------------------------------- */

function lroute(x0, y0, x1, y1, vertFirst) {
  if (Math.abs(x0 - x1) < 1e-9) return [[x0, y0], [x1, y1]];
  if (Math.abs(y0 - y1) < 1e-9) return [[x0, y0], [x1, y1]];
  return vertFirst
    ? [[x0, y0], [x0, y1], [x1, y1]]
    : [[x0, y0], [x1, y0], [x1, y1]];
}

/* --------------------------------------------------------------------------
   1.  STEPPED-IMPEDANCE LOW-PASS
   ----------------------------------------------------------------------- */

export function layoutStepped(design, ctx) {
  const A = artwork({ name: 'stepped-lpf', kind: 'filter', topology: 'stepped' });
  const L = ctx.signalLayer;
  const feedW = design.feed.w;
  let x = 0;

  A.tracks.push(track(L, feedW, run(x, 0, x + ctx.feedLength, 0), { role: 'feed' }));
  A.ports.push({ x, y: 0, name: 'P1', angle: Math.PI });
  A.pads.push(pad(x, 0, { w: ctx.padSize, drill: ctx.padDrill, number: '1', role: 'port' }));
  x += ctx.feedLength;

  design.sections.forEach((s, i) => {
    A.tracks.push(track(L, s.w, run(x, 0, x + s.length, 0), { role: s.role === 'L' ? 'high-Z' : 'low-Z' }));
    A.labels.push(label(x + s.length / 2, s.w / 2 + 0.6, `${s.role}${i + 1} ${s.Z.toFixed(0)}Ω`, { size: 0.7 }));
    x += s.length;
  });

  A.tracks.push(track(L, feedW, run(x, 0, x + ctx.feedLength, 0), { role: 'feed' }));
  x += ctx.feedLength;
  A.ports.push({ x, y: 0, name: 'P2', angle: 0 });
  A.pads.push(pad(x, 0, { w: ctx.padSize, drill: ctx.padDrill, number: '2', role: 'port' }));

  defaultNet(A, ctx.net);
  A.notes.push({
    level: 'info',
    text: 'Stepped-impedance sections are lumped approximations. The corner sits a little high and the '
      + 'stopband re-enters near the first section resonance; the response plot shows both.',
  });
  return A;
}

/* --------------------------------------------------------------------------
   2.  PARALLEL EDGE-COUPLED BAND-PASS

   n+1 coupled sections, n resonators. Resonator j is one continuous
   half-wavelength line spanning sections j-1 and j; consecutive resonators
   step down in y by (w + s) so each adjacent pair overlaps for exactly one
   section length. That staircase is the whole layout.
   ----------------------------------------------------------------------- */

export function layoutEdgeCoupled(design, ctx) {
  const A = artwork({ name: 'edge-coupled-bpf', kind: 'filter', topology: 'edgeCoupled' });
  const L = ctx.signalLayer;
  const S = design.sections;                  // length n+1
  const n = S.length - 1;                     // resonator count
  const feedW = design.feed.w;

  // x where each section starts
  const X = [0];
  for (let k = 0; k < S.length; k++) X.push(X[k] + S[k].length);

  // y of each conductor: conductor k and k+1 are the pair of section k
  const Y = [0];
  for (let k = 0; k < S.length; k++) Y.push(Y[k] - (S[k].w + S[k].s));

  // Conductor 0 is the input feed line, conductors 1..n the resonators,
  // conductor n+1 the output feed line.
  for (let i = 0; i <= n + 1; i++) {
    const xStart = i === 0 ? X[0] : X[i - 1];
    const xEnd = i === n + 1 ? X[n] + S[n].length : X[i] + S[i].length;
    const w = i === 0 ? S[0].w : i === n + 1 ? S[n].w : (S[i - 1].w + S[i].w) / 2;
    const role = (i === 0 || i === n + 1) ? 'feed-coupled' : 'resonator';
    A.tracks.push(track(L, w, run(xStart, Y[i], xEnd, Y[i]), { role, index: i }));
    if (role === 'resonator') {
      A.labels.push(label((xStart + xEnd) / 2, Y[i] + w / 2 + 0.5, `R${i}`, { size: 0.7 }));
    }
  }

  // Feed lines: in at the left end of conductor 0, out at the right end of the
  // last conductor.
  const inX = X[0], inY = Y[0];
  A.tracks.push(track(L, feedW, run(inX - ctx.feedLength, inY, inX, inY), { role: 'feed' }));
  A.ports.push({ x: inX - ctx.feedLength, y: inY, name: 'P1', angle: Math.PI });
  A.pads.push(pad(inX - ctx.feedLength, inY, { w: ctx.padSize, drill: ctx.padDrill, number: '1', role: 'port' }));

  const outX = X[n] + S[n].length, outY = Y[n + 1];
  A.tracks.push(track(L, feedW, run(outX, outY, outX + ctx.feedLength, outY), { role: 'feed' }));
  A.ports.push({ x: outX + ctx.feedLength, y: outY, name: 'P2', angle: 0 });
  A.pads.push(pad(outX + ctx.feedLength, outY, { w: ctx.padSize, drill: ctx.padDrill, number: '2', role: 'port' }));

  for (let k = 0; k < S.length; k++) {
    A.labels.push(label(X[k] + S[k].length / 2, (Y[k] + Y[k + 1]) / 2, `${S[k].s.toFixed(2)}`, { size: 0.55, layer: 'F.SilkS' }));
  }

  defaultNet(A, ctx.net);
  A.notes.push({
    level: 'info',
    text: 'Parallel-coupled synthesis is first-order in the fractional bandwidth. Expect the built '
      + 'filter to come out 10–25 % wide and a little low in centre frequency, and a spurious '
      + 'passband near 2·f₀ where the odd and even modes fall back into step.',
  });
  return A;
}

/* --------------------------------------------------------------------------
   3.  HAIRPIN BAND-PASS

   Same electrical synthesis as edge-coupled; each half-wave resonator is
   folded into a U so the array runs across the board instead of along it.
   ----------------------------------------------------------------------- */

export function layoutHairpin(design, ctx) {
  const A = artwork({ name: 'hairpin-bpf', kind: 'filter', topology: 'hairpin' });
  const L = ctx.signalLayer;
  const R = design.resonators;
  if (!R || !R.length) return A;

  let x = 0;
  const centres = [];
  R.forEach((r, i) => {
    const half = (r.armGap + r.w) / 2;
    const xc = x + r.span / 2;
    centres.push(xc);

    const xa = xc - half, xb = xc + half;
    // Two arms, open at y = 0, joined by a bend at y = armLen.
    A.tracks.push(track(L, r.w, run(xa, 0, xa, r.armLen), { role: 'hairpin-arm', index: i }));
    A.tracks.push(track(L, r.w, run(xb, 0, xb, r.armLen), { role: 'hairpin-arm', index: i }));
    A.tracks.push(track(L, r.w, uBend(xa, xb, r.armLen), { role: 'hairpin-bend', index: i }));
    A.labels.push(label(xc, -1.2, `R${i + 1}`, { size: 0.7 }));

    // Gap to the next hairpin comes from the coupled-section solution.
    const gap = i < R.length - 1 ? R[i + 1].gapLeft : 0;
    x += r.span + gap;
  });

  // Tapped feeds on the outer arms of the first and last resonators.
  const first = R[0], last = R[R.length - 1];
  const tapY = clamp(design.tap ? design.tap.length : first.armLen * 0.3, first.w, first.armLen - first.w);
  const xIn = centres[0] - (first.armGap + first.w) / 2;
  const xOut = centres[centres.length - 1] + (last.armGap + last.w) / 2;

  A.tracks.push(track(L, design.feed.w, run(xIn - ctx.feedLength, tapY, xIn, tapY), { role: 'feed' }));
  A.ports.push({ x: xIn - ctx.feedLength, y: tapY, name: 'P1', angle: Math.PI });
  A.pads.push(pad(xIn - ctx.feedLength, tapY, { w: ctx.padSize, drill: ctx.padDrill, number: '1', role: 'port' }));

  A.tracks.push(track(L, design.feed.w, run(xOut, tapY, xOut + ctx.feedLength, tapY), { role: 'feed' }));
  A.ports.push({ x: xOut + ctx.feedLength, y: tapY, name: 'P2', angle: 0 });
  A.pads.push(pad(xOut + ctx.feedLength, tapY, { w: ctx.padSize, drill: ctx.padDrill, number: '2', role: 'port' }));

  defaultNet(A, ctx.net);
  A.notes.push({
    level: 'info',
    text: `Tap height ${tapY.toFixed(2)} mm sets the external Q (${design.Qe ? design.Qe.toFixed(1) : '—'}). `
      + 'It is the first thing to trim if the passband edges are not symmetric.',
  });
  return A;
}

/* --------------------------------------------------------------------------
   4.  INTERDIGITAL BAND-PASS

   Quarter-wave resonators grounded at alternating ends. Half the length of an
   edge-coupled filter and with no spurious response at 2·f₀ — paid for with a
   via to ground under every resonator.
   ----------------------------------------------------------------------- */

export function layoutInterdigital(design, ctx) {
  const A = artwork({ name: 'interdigital-bpf', kind: 'filter', topology: 'interdigital' });
  const L = ctx.signalLayer;
  const R = design.resonators;
  const len = design.quarter;
  const railW = ctx.railWidth;

  let x = 0;
  const centres = [];
  R.forEach((r, i) => {
    const xc = x + r.w / 2;
    centres.push(xc);
    const rlen = r.length || len;
    A.tracks.push(track(L, r.w, run(xc, 0, xc, rlen), { role: 'resonator', index: i }));

    // Grounded end alternates so adjacent resonators couple through their
    // open ends -- that is what makes the structure interdigital rather than
    // combline.
    const groundedAtBottom = i % 2 === 0;
    const gy = groundedAtBottom ? 0 : rlen;
    A.vias.push(via(xc, gy, { drill: ctx.viaDrill, diameter: ctx.viaPad, net: ctx.gndNet, role: 'resonator-ground' }));
    A.labels.push(label(xc, groundedAtBottom ? rlen + 0.9 : -0.9, `R${i + 1}`, { size: 0.6 }));

    const gap = i < R.length - 1 ? design.gaps[i].s : 0;
    x += r.w + gap;
  });

  const span = x - (R.length ? design.gaps.length ? design.gaps[design.gaps.length - 1].s : 0 : 0);
  const xEnd = centres[centres.length - 1] + R[R.length - 1].w / 2;

  // Ground rails top and bottom, stitched.
  for (const [y, tag] of [[-ctx.railGap, 'bottom'], [len + ctx.railGap, 'top']]) {
    A.tracks.push(track(L, railW, run(-ctx.feedLength - 1, y, xEnd + ctx.feedLength + 1, y), { role: `rail-${tag}`, net: ctx.gndNet }));
    const stitch = Math.max(2, Math.round((xEnd + 2 * ctx.feedLength) / 4));
    for (let i = 0; i <= stitch; i++) {
      const sx = -ctx.feedLength - 1 + (xEnd + 2 * ctx.feedLength + 2) * i / stitch;
      A.vias.push(via(sx, y, { drill: ctx.viaDrill, diameter: ctx.viaPad, net: ctx.gndNet, role: 'stitch' }));
    }
  }

  // Connect each grounded resonator end to its rail.
  R.forEach((r, i) => {
    const xc = centres[i];
    const bottom = i % 2 === 0;
    const y0 = bottom ? 0 : (r.length || len);
    const y1 = bottom ? -ctx.railGap : len + ctx.railGap;
    A.tracks.push(track(L, r.w, run(xc, y0, xc, y1), { role: 'ground-stub', net: ctx.gndNet }));
  });

  // Tapped feeds on the first and last resonators.
  const tapLen = clamp(design.tap ? design.tap.length : len * 0.25, 0.5, len - 0.5);
  const inY = Math.min(tapLen, R[0].length || len), outY = R.length % 2 === 0 ? Math.max(0, (R.at(-1).length || len) - tapLen) : Math.min(tapLen, R.at(-1).length || len);
  A.tracks.push(track(L, design.feed.w, run(centres[0] - ctx.feedLength - 1, inY, centres[0], inY), { role: 'feed' }));
  A.ports.push({ x: centres[0] - ctx.feedLength - 1, y: inY, name: 'P1', angle: Math.PI });
  A.pads.push(pad(centres[0] - ctx.feedLength - 1, inY, { w: ctx.padSize, drill: ctx.padDrill, number: '1', role: 'port' }));

  const lastX = centres[centres.length - 1];
  A.tracks.push(track(L, design.feed.w, run(lastX, outY, lastX + ctx.feedLength + 1, outY), { role: 'feed' }));
  A.ports.push({ x: lastX + ctx.feedLength + 1, y: outY, name: 'P2', angle: 0 });
  A.pads.push(pad(lastX + ctx.feedLength + 1, outY, { w: ctx.padSize, drill: ctx.padDrill, number: '2', role: 'port' }));

  A.tracks.filter((t) => !t.net).forEach((t) => { t.net = ctx.net; });
  A.vias.filter((v) => !v.net).forEach((v) => { v.net = ctx.gndNet; });
  A.pads.filter((p) => !p.net).forEach((p) => { p.net = ctx.net; });

  A.notes.push({
    level: 'warn',
    text: 'Every resonator needs a low-inductance path to ground. A single 0.3 mm via adds roughly '
      + '0.5 nH, which pulls f₀ down by a percent or two — use two or three vias per resonator end.',
  });
  return A;
}

/* --------------------------------------------------------------------------
   5.  PLANAR PASSIVE COMPONENTS
   ----------------------------------------------------------------------- */

/**
 * Interdigital capacitor as artwork, vertical: comb A spine at the top, comb B
 * spine at the bottom, fingers interleaved between them.
 *
 * Returns {art, width, height, portA, portB, model} where the ports are the
 * mid-points of the two spines.
 */
export function interdigitalGeom(ctx, targetC, opt = {}) {
  const fw = opt.fingerW || ctx.fingerW;
  const fg = opt.fingerG || ctx.fingerG;
  const spineW = opt.spineW || Math.max(fw, ctx.traceW);
  const endGap = opt.endGap || fg;

  /* Two knobs, used in the order that keeps the comb buildable.

     Finger count is quantised, so it is chosen first, at the nominal overlap;
     if that would need an absurd number of fingers the fingers are lengthened
     instead of running a hundred of them. Then the overlap is trimmed, which
     is continuous, to land the value exactly.

     Without the second step the comb can overshoot badly: after the overlap
     has been multiplied a few times, even the two-finger minimum can be worth
     more than the target, and taking "the nearest finger count" then delivers
     a capacitor 80 % too large with nothing to say about it. */
  const cell = (n, l) => interdigitalCap({
    fingers: n, length: l, width: fw, gap: fg, er: ctx.er, h: ctx.h, t: ctx.t,
  });

  let overlap = opt.overlap || ctx.capOverlap;
  let fingers = 2;
  for (let attempt = 0; attempt < 5; attempt++) {
    fingers = Math.max(2, interdigitalFingersFor(targetC, {
      length: overlap, width: fw, gap: fg, er: ctx.er, h: ctx.h, t: ctx.t,
    }));
    if (fingers <= 48) break;
    overlap *= 1.8;
  }

  // Trim the overlap. Capacitance is very nearly linear in it, so two or three
  // secant steps land inside a fraction of a percent.
  const minOverlap = Math.max(fw, 0.2);
  for (let i = 0; i < 6; i++) {
    const c = cell(fingers, overlap).C;
    if (Math.abs(c / targetC - 1) < 0.005) break;
    const next = clamp(overlap * (targetC / c), minOverlap, 400);
    if (Math.abs(next - overlap) < 1e-4) break;
    overlap = next;
  }

  const model = cell(fingers, overlap);

  const A = artwork({ name: 'idc', kind: 'component' });
  const L = ctx.signalLayer;
  const pitch = fw + fg;
  const width = fingers * fw + (fingers - 1) * fg;
  const x0 = -width / 2 + fw / 2;
  const yTop = overlap / 2, yBot = -overlap / 2;

  for (let i = 0; i < fingers; i++) {
    const x = x0 + i * pitch;
    if (i % 2 === 0) A.tracks.push(track(L, fw, run(x, yBot + endGap, x, yTop), { role: 'idc-finger-a' }));
    else A.tracks.push(track(L, fw, run(x, yBot, x, yTop - endGap), { role: 'idc-finger-b' }));
  }
  const spineA = yTop + spineW / 2;
  const spineB = yBot - spineW / 2;
  A.tracks.push(track(L, spineW, run(-width / 2, spineA, width / 2, spineA), { role: 'idc-spine-a' }));
  A.tracks.push(track(L, spineW, run(-width / 2, spineB, width / 2, spineB), { role: 'idc-spine-b' }));

  return {
    art: A,
    width, height: spineA - spineB,
    portA: [0, spineA], portB: [0, spineB],
    model, fingers, overlap,
    kind: 'interdigital',
  };
}

/**
 * Parallel-plate capacitor across two copper layers.
 *
 * Far denser than an interdigital comb -- a 1 nF shunt is a few square
 * millimetres on 0.1 mm prepreg and is simply not buildable as a comb -- at
 * the cost of needing the layer pair and a stack-up you control.
 */
export function plateGeom(ctx, targetC, opt = {}) {
  const layerA = opt.layerA || ctx.layers[0] || 'F.Cu';
  const layerB = opt.layerB || ctx.layers[1] || 'B.Cu';
  const hDiel = opt.h != null ? opt.h : (ctx.layers.length > 1 ? ctx.boardT / (ctx.layers.length - 1) : ctx.boardT);
  const areaMM2 = plateAreaFor(targetC, hDiel, ctx.er);
  const side = Math.sqrt(Math.max(areaMM2, 0.01));

  const A = artwork({ name: 'plate-cap', kind: 'component' });
  A.tracks.push(fillRect(layerA, -side / 2, -side / 2, side / 2, side / 2, { role: 'plate-a' }));
  A.tracks.push(fillRect(layerB, -side / 2, -side / 2, side / 2, side / 2, { role: 'plate-b' }));

  const model = { C: targetC, area: side * side, side, h: hDiel };
  return {
    art: A, width: side, height: side,
    portA: [0, side / 2], portB: [0, -side / 2],
    layerA, layerB, model, kind: 'plate',
  };
}

/**
 * A spiral inductor sized to a target inductance, oriented so its two
 * terminals point downward — left terminal on the left, right on the right.
 *
 * That orientation is the whole trick behind the lumped layouts. Both ends of
 * a planar spiral naturally leave on the same side, which normally forces an
 * underpass on a second layer. Rotating the coil a quarter turn puts one
 * terminal just left of bottom-dead-centre and the other just right of it, so
 * a series element can be entered from the left and left from the right with
 * no crossing at all.
 */
export function coilGeom(ctx, targetL, opt = {}) {
  const dOuter = opt.diameter || ctx.coilDiameter;
  const base = {
    shape: opt.shape || ctx.coilShape,
    turns: 6,
    dOuter,
    dInner: dOuter * 0.35,
    traceW: opt.traceW || Math.max(ctx.minTrace, ctx.traceW),
    traceS: opt.traceS || Math.max(ctx.minTrace, ctx.clearance),
    layers: opt.layers || ctx.coilLayers,
    connection: 'series',
    ppt: 96,
    sides: 4, fillet: dOuter * 0.06,
    aspect: opt.aspect || 1, cornerR: dOuter * 0.18,
    spanDeg: 30,
    sfM: 4, sfN1: 1, sfN2: 1, sfN3: 1,
    boardT: ctx.boardT, epsR: ctx.er, copperOz: ctx.copperOz,
    viaDrill: ctx.viaDrill, viaPad: ctx.viaPad,
    padSize: ctx.padSize, padDrill: ctx.padDrill,
    freq: opt.freq || 1e8, current: 0.5, tempC: 25, cExtra: 0,
    layerNames: (opt.layers || ctx.coilLayers) <= ctx.layers.length ? ctx.layers.slice(0, opt.layers || ctx.coilLayers) : null,
  };

  const sol = solveCoilForL(base, targetL, {
    dMax: dOuter,
    dMin: opt.minDiameter || dOuter * 0.3,
    segmentCap: 1200,
  });
  const cfg = sol.cfg || base;
  const coil = sol.coil || buildCoil(cfg);
  const a = sol.a || analyse(cfg, coil, { segmentCap: 1200 });

  // Quarter turn clockwise brings the terminal pair to the bottom.
  const A = artwork({ name: 'spiral', kind: 'component' });
  const ang = -Math.PI / 2;
  const rot = (p) => [p[0] * Math.cos(ang) - p[1] * Math.sin(ang), p[0] * Math.sin(ang) + p[1] * Math.cos(ang)];

  for (const layer of coil.layers) {
    A.tracks.push(track(layer.name, cfg.traceW, layer.pts.map(rot), { role: 'coil', layerIndex: layer.index }));
  }
  for (const lk of coil.links) {
    A.tracks.push(track(coil.layers[lk.layer].name, cfg.traceW, lk.pts.map(rot), { role: 'coil-link' }));
  }
  for (const ld of coil.leads) {
    A.tracks.push(track(coil.layers[ld.layer].name, cfg.traceW, ld.pts.map(rot), { role: 'coil-lead', terminal: ld.terminal }));
  }
  for (const v of coil.vias) {
    const [x, y] = rot([v.x, v.y]);
    A.vias.push(via(x, y, { drill: ctx.viaDrill, diameter: ctx.viaPad, role: 'coil-via' }));
  }

  const termA = rot(coil.terminals[0]);
  const termB = rot(coil.terminals[1]);
  // After the rotation the first terminal is the left one. If the geometry
  // came out the other way round (an odd layer count leaves the second end
  // buried), swap so the caller can always trust left/right.
  const [pa, pb] = termA[0] <= termB[0] ? [termA, termB] : [termB, termA];

  return {
    art: A,
    coil, cfg, analysis: a, solve: sol,
    width: coil.outerR * 2, height: coil.outerR * 2,
    radius: coil.outerR,
    portA: pa, portB: pb,
    enclosed: coil.enclosed,
    kind: 'spiral',
  };
}

/* --------------------------------------------------------------------------
   6.  LUMPED LC LADDER

   The signal spine runs along y = 0. Series elements sit above it, shunt
   elements below, and the ground rail is below everything. Because a series
   element and a shunt element never share an x-range, the whole ladder routes
   on one layer.
   ----------------------------------------------------------------------- */

export function layoutLumped(design, ctx) {
  const A = artwork({ name: 'lc-ladder', kind: 'filter', topology: design.kind || 'lumped' });
  const L = ctx.signalLayer;
  const gap = Math.max(ctx.clearance * 3, 0.8);
  const placed = [];

  let x = 0;
  A.ports.push({ x, y: 0, name: 'P1', angle: Math.PI });
  A.pads.push(pad(x, 0, { w: ctx.padSize, drill: ctx.padDrill, number: '1', role: 'port', net: ctx.net }));
  A.tracks.push(track(L, ctx.traceW, run(x, 0, x + ctx.feedLength, 0), { role: 'feed', net: ctx.net }));
  x += ctx.feedLength;

  let maxUp = 0, maxDown = 0;
  const warn = [];

  for (const el of design.elements) {
    if (el.kind === 'series') {
      const built = buildSeries(el, ctx, warn);
      const span = built.span;
      // Enter the element from the left node, leave from the right node.
      const dx = x + span / 2;
      merge(A, transform(built.art, { dx, dy: built.dy || 0 }));
      const aX = dx + built.portA[0], aY = built.portA[1] + (built.dy || 0);
      const bX = dx + built.portB[0], bY = built.portB[1] + (built.dy || 0);
      A.tracks.push(track(L, ctx.traceW, lroute(x, 0, aX, aY, false), { role: 'route', net: ctx.net }));
      A.tracks.push(track(L, ctx.traceW, lroute(bX, bY, x + span, 0, true), { role: 'route', net: ctx.net }));
      maxUp = Math.max(maxUp, built.up || 0);
      maxDown = Math.max(maxDown, built.down || 0);
      placed.push({ el, x: dx, ...built });
      x += span;
    } else {
      const built = buildShunt(el, ctx, warn);
      // Shunt elements hang below the spine at a single node.
      const dx = x + built.span / 2;
      merge(A, transform(built.art, { dx, dy: built.dy || 0 }));
      const aX = dx + built.portA[0], aY = built.portA[1] + (built.dy || 0);
      A.tracks.push(track(L, ctx.traceW, lroute(dx, 0, aX, aY, true), { role: 'route', net: ctx.net }));
      built.groundPoints.forEach((gp) => {
        placed.push({ ground: [dx + gp[0], gp[1] + (built.dy || 0)] });
      });
      A.tracks.push(track(L, ctx.traceW, run(x, 0, x + built.span, 0), { role: 'spine', net: ctx.net }));
      maxDown = Math.max(maxDown, built.down || 0);
      placed.push({ el, x: dx, ...built });
      x += built.span;
    }
    x += gap;
    A.tracks.push(track(L, ctx.traceW, run(x - gap, 0, x, 0), { role: 'spine', net: ctx.net }));
  }

  A.tracks.push(track(L, ctx.traceW, run(x, 0, x + ctx.feedLength, 0), { role: 'feed', net: ctx.net }));
  x += ctx.feedLength;
  A.ports.push({ x, y: 0, name: 'P2', angle: 0 });
  A.pads.push(pad(x, 0, { w: ctx.padSize, drill: ctx.padDrill, number: '2', role: 'port', net: ctx.net }));

  // Ground rail below everything that reaches downward.
  const grounds = placed.filter((p) => p.ground).map((p) => p.ground);
  if (grounds.length) {
    const railY = Math.min(...grounds.map((g) => g[1])) - ctx.railGap;
    A.tracks.push(track(L, ctx.railWidth, run(-1, railY, x + 1, railY), { role: 'gnd-rail', net: ctx.gndNet }));
    grounds.forEach((g) => {
      A.tracks.push(track(L, ctx.traceW, run(g[0], g[1], g[0], railY), { role: 'gnd-drop', net: ctx.gndNet }));
      A.vias.push(via(g[0], railY, { drill: ctx.viaDrill, diameter: ctx.viaPad, net: ctx.gndNet, role: 'gnd' }));
    });
    A.vias.push(via(-1 + ctx.viaPad, railY, { drill: ctx.viaDrill, diameter: ctx.viaPad, net: ctx.gndNet, role: 'gnd' }));
    A.vias.push(via(x + 1 - ctx.viaPad, railY, { drill: ctx.viaDrill, diameter: ctx.viaPad, net: ctx.gndNet, role: 'gnd' }));
    maxDown = Math.max(maxDown, -railY);
  }

  A.tracks.filter((t) => !t.net).forEach((t) => { t.net = ctx.net; });
  A.vias.filter((v) => !v.net).forEach((v) => { v.net = ctx.net; });
  warn.forEach((w) => A.notes.push({ level: 'warn', text: w }));
  A.notes.push({
    level: 'info',
    text: 'Element values shown are what the geometry realises, not what the synthesis asked for. '
      + 'The response plot is computed from the realised values with their parasitics included.',
  });
  A.meta.placed = placed.filter((p) => p.el).map((p) => ({
    type: p.el.type, kind: p.el.kind, x: p.x, realised: p.realised, target: p.target,
  }));
  return A;
}

/* One series arm of a ladder, as a self-contained artwork centred on x = 0. */
function buildSeries(el, ctx, warn) {
  const parts = [];
  if (el.type === 'L') parts.push({ kind: 'L', value: el.L });
  else if (el.type === 'C') parts.push({ kind: 'C', value: el.C });
  else if (el.type === 'LC-series') { parts.push({ kind: 'L', value: el.L }); parts.push({ kind: 'C', value: el.C }); }
  else if (el.type === 'LC-parallel') { parts.push({ kind: 'L', value: el.L }); parts.push({ kind: 'Cpar', value: el.C }); }

  const A = artwork({ kind: 'element' });
  const L = ctx.signalLayer;
  const inner = Math.max(ctx.clearance * 3, 0.8);
  let cursor = 0;
  let portA = null, portB = null;
  let up = 0, down = 0;
  const realised = {};
  const target = {};

  const chain = parts.filter((p) => p.kind !== 'Cpar');
  for (let i = 0; i < chain.length; i++) {
    const p = chain[i];
    if (p.kind === 'L') {
      const g = coilGeom(ctx, p.value, { freq: ctx.designF || 1e8 });
      // Coil sits above the spine; its terminals point down.
      const dy = g.radius + Math.max(ctx.clearance * 2, 0.6);
      merge(A, transform(g.art, { dx: cursor + g.radius, dy }));
      const a = [cursor + g.radius + g.portA[0], g.portA[1] + dy];
      const b = [cursor + g.radius + g.portB[0], g.portB[1] + dy];
      if (!portA) portA = a; else A.tracks.push(track(L, ctx.traceW, [portB, a], { role: 'link' }));
      portB = b;
      up = Math.max(up, dy + g.radius);
      cursor += g.radius * 2 + inner;
      realised.L = g.analysis.L; realised.qL = g.analysis.Q; target.L = p.value;
      if (g.solve && g.solve.saturated) warn.push(`A ${(p.value * 1e9).toFixed(1)} nH series inductor does not fit in a ${ctx.coilDiameter} mm spiral — widen the coil budget.`);
      if (g.enclosed) warn.push('The spiral came out with an odd layer count, so one terminal is enclosed by its own turns. Use an even layer count.');
    } else {
      const g = ctx.capStyle === 'plate' && ctx.layers.length > 1
        ? plateGeom(ctx, p.value)
        : interdigitalGeom(ctx, p.value);
      // Series capacitor: rotate a quarter turn so the two combs face left
      // and right instead of up and down.
      const rotated = transform(g.art, { angle: Math.PI / 2 });
      const halfW = g.height / 2;
      merge(A, transform(rotated, { dx: cursor + halfW, dy: 0 }));
      const a = [cursor + halfW - g.portA[1], 0];
      const b = [cursor + halfW - g.portB[1], 0];
      const left = a[0] <= b[0] ? a : b, right = a[0] <= b[0] ? b : a;
      if (!portA) portA = left; else A.tracks.push(track(L, ctx.traceW, [portB, left], { role: 'link' }));
      portB = right;
      up = Math.max(up, g.width / 2);
      down = Math.max(down, g.width / 2);
      cursor += g.height + inner;
      realised.C = g.model.C; target.C = p.value;
      if (g.kind === 'interdigital' && g.fingers >= 48) {
        warn.push(`A ${(p.value * 1e12).toFixed(1)} pF series capacitor needs ${g.fingers} fingers — switch to plate capacitors or a higher-impedance design.`);
      }
    }
  }

  // A parallel capacitor bridges the same two nodes, below the spine.
  const par = parts.find((p) => p.kind === 'Cpar');
  if (par && portA && portB) {
    const g = ctx.capStyle === 'plate' && ctx.layers.length > 1 ? plateGeom(ctx, par.value) : interdigitalGeom(ctx, par.value);
    const rotated = transform(g.art, { angle: Math.PI / 2 });
    const mid = (portA[0] + portB[0]) / 2;
    const dy = -(g.width / 2 + Math.max(ctx.clearance * 2, 0.7));
    merge(A, transform(rotated, { dx: mid, dy }));
    const a = [mid - g.portA[1], dy];
    const b = [mid - g.portB[1], dy];
    A.tracks.push(track(L, ctx.traceW, lroute(portA[0], portA[1], a[0], a[1], true), { role: 'par-link' }));
    A.tracks.push(track(L, ctx.traceW, lroute(b[0], b[1], portB[0], portB[1], false), { role: 'par-link' }));
    down = Math.max(down, -dy + g.width / 2);
    realised.Cpar = g.model.C; target.Cpar = par.value;
  }

  const span = Math.max(cursor - inner, 1) + 2 * Math.max(ctx.clearance * 2, 0.6);
  const shift = -span / 2 + Math.max(ctx.clearance * 2, 0.6);
  const shifted = transform(A, { dx: shift, dy: 0 });
  return {
    art: shifted,
    portA: [portA[0] + shift, portA[1]],
    portB: [portB[0] + shift, portB[1]],
    span, up, down, realised, target,
    groundPoints: [],
  };
}

/* One shunt arm: node at the top, ground at the bottom. */
function buildShunt(el, ctx, warn) {
  const A = artwork({ kind: 'element' });
  const L = ctx.signalLayer;
  const inner = Math.max(ctx.clearance * 3, 0.8);
  const realised = {}, target = {};
  let span = 2, down = 0;
  let portA = [0, 0];
  const groundPoints = [];

  const makeCap = (value) => (ctx.capStyle === 'plate' && ctx.layers.length > 1 ? plateGeom(ctx, value) : interdigitalGeom(ctx, value));

  if (el.type === 'C') {
    const g = makeCap(el.C);
    const dy = -(g.height / 2 + Math.max(ctx.clearance * 2, 0.7));
    merge(A, transform(g.art, { dx: 0, dy }));
    portA = [g.portA[0], g.portA[1] + dy];
    groundPoints.push([g.portB[0], g.portB[1] + dy]);
    span = g.width + 2 * ctx.clearance;
    down = -(g.portB[1] + dy);
    realised.C = g.model.C; target.C = el.C;
    if (g.kind === 'interdigital' && g.fingers >= 48) {
      warn.push(`A ${(el.C * 1e12).toFixed(1)} pF shunt capacitor needs ${g.fingers} fingers — plate capacitors would be far smaller.`);
    }
  } else if (el.type === 'L') {
    const g = coilGeom(ctx, el.L, { freq: ctx.designF || 1e8 });
    const dy = -(g.radius + Math.max(ctx.clearance * 2, 0.6));
    // Terminals point down; the node is above, so the coil is flipped.
    const flipped = transform(g.art, { angle: Math.PI });
    merge(A, transform(flipped, { dx: 0, dy }));
    const a = [-g.portA[0], -g.portA[1] + dy];
    const b = [-g.portB[0], -g.portB[1] + dy];
    portA = a;
    // Bring the second terminal round the outside of the coil to the rail.
    const side = g.radius + Math.max(ctx.clearance * 2, 0.5);
    A.tracks.push(track(L, ctx.traceW, [b, [side, b[1]], [side, dy - g.radius - 0.4]], { role: 'coil-return' }));
    groundPoints.push([side, dy - g.radius - 0.4]);
    span = g.radius * 2 + side + 2 * ctx.clearance;
    down = -(dy - g.radius - 0.4);
    realised.L = g.analysis.L; realised.qL = g.analysis.Q; target.L = el.L;
    if (g.solve && g.solve.saturated) warn.push(`A ${(el.L * 1e9).toFixed(1)} nH shunt inductor does not fit in a ${ctx.coilDiameter} mm spiral.`);
  } else if (el.type === 'LC-series') {
    // Capacitor first from the node, then the inductor to ground.
    const gc = makeCap(el.C);
    const dyC = -(gc.height / 2 + Math.max(ctx.clearance * 2, 0.7));
    merge(A, transform(gc.art, { dx: 0, dy: dyC }));
    portA = [gc.portA[0], gc.portA[1] + dyC];
    const gl = coilGeom(ctx, el.L, { freq: ctx.designF || 1e8 });
    const dyL = dyC + gc.portB[1] - Math.max(ctx.clearance * 2, 0.6) - gl.radius;
    const flipped = transform(gl.art, { angle: Math.PI });
    merge(A, transform(flipped, { dx: 0, dy: dyL }));
    const a = [-gl.portA[0], -gl.portA[1] + dyL];
    const b = [-gl.portB[0], -gl.portB[1] + dyL];
    A.tracks.push(track(L, ctx.traceW, lroute(gc.portB[0], gc.portB[1] + dyC, a[0], a[1], true), { role: 'link' }));
    const side = gl.radius + Math.max(ctx.clearance * 2, 0.5);
    A.tracks.push(track(L, ctx.traceW, [b, [side, b[1]], [side, dyL - gl.radius - 0.4]], { role: 'coil-return' }));
    groundPoints.push([side, dyL - gl.radius - 0.4]);
    span = Math.max(gc.width, gl.radius * 2 + side) + 2 * ctx.clearance;
    down = -(dyL - gl.radius - 0.4);
    realised.C = gc.model.C; realised.L = gl.analysis.L; realised.qL = gl.analysis.Q; target.C = el.C; target.L = el.L;
  } else if (el.type === 'LC-parallel') {
    // Side by side, both from the node to the rail.
    const gl = coilGeom(ctx, el.L, { freq: ctx.designF || 1e8 });
    const gc = makeCap(el.C);
    const dyL = -(gl.radius + Math.max(ctx.clearance * 2, 0.6));
    const flipped = transform(gl.art, { angle: Math.PI });
    const xL = -(gl.radius + inner / 2);
    merge(A, transform(flipped, { dx: xL, dy: dyL }));
    const la = [xL - gl.portA[0], -gl.portA[1] + dyL];
    const lb = [xL - gl.portB[0], -gl.portB[1] + dyL];

    const xC = gc.width / 2 + inner / 2;
    const dyC = -(gc.height / 2 + Math.max(ctx.clearance * 2, 0.7));
    merge(A, transform(gc.art, { dx: xC, dy: dyC }));
    const ca = [xC + gc.portA[0], gc.portA[1] + dyC];
    const cb = [xC + gc.portB[0], gc.portB[1] + dyC];

    portA = [0, Math.max(la[1], ca[1]) + 0.4];
    A.tracks.push(track(L, ctx.traceW, lroute(portA[0], portA[1], la[0], la[1], false), { role: 'link' }));
    A.tracks.push(track(L, ctx.traceW, lroute(portA[0], portA[1], ca[0], ca[1], false), { role: 'link' }));
    const bottom = Math.min(lb[1] - gl.radius, cb[1]) - 0.4;
    const side = xL - gl.radius - Math.max(ctx.clearance * 2, 0.5);
    A.tracks.push(track(L, ctx.traceW, [lb, [side, lb[1]], [side, bottom]], { role: 'coil-return' }));
    groundPoints.push([side, bottom]);
    groundPoints.push([cb[0], cb[1]]);
    span = (xC + gc.width / 2) - side + 2 * ctx.clearance;
    down = -bottom;
    realised.C = gc.model.C; realised.L = gl.analysis.L; realised.qL = gl.analysis.Q; target.C = el.C; target.L = el.L;
  }

  const shift = -0;
  return { art: A, portA, groundPoints, span, down, realised, target, dy: shift };
}

/* --------------------------------------------------------------------------
   7.  COMMON-MODE CHOKE

   Two identical windings on adjacent layers, wound the same way so their
   fluxes add for common-mode current and cancel for differential. Stacking
   rather than interleaving on one layer is what buys the coupling: k above
   0.95 is routine across a thin prepreg and hard to reach side by side.
   ----------------------------------------------------------------------- */

export function layoutCMChoke(design, ctx) {
  const A = artwork({ name: 'cm-choke', kind: 'filter', topology: 'cm' });
  const perWinding = design.Lwinding || 10e-6;

  const layers = ctx.layers.length >= 2 ? ctx.layers : ['F.Cu', 'B.Cu'];
  const w1 = coilGeom({ ...ctx, coilLayers: 1, layers: [layers[0]] }, perWinding, { layers: 1, freq: 1e6 });
  const w2 = coilGeom({ ...ctx, coilLayers: 1, layers: [layers[1]] }, perWinding, { layers: 1, freq: 1e6 });

  merge(A, w1.art);
  merge(A, w2.art);

  // Line 1 enters left and leaves right on the top layer; line 2 mirrors it
  // on the layer below. Same winding sense, so common-mode flux adds.
  const r = Math.max(w1.radius, w2.radius);
  const feed = ctx.feedLength;
  A.tracks.push(track(layers[0], ctx.traceW, run(w1.portA[0] - feed, w1.portA[1], w1.portA[0], w1.portA[1]), { role: 'feed', net: `${ctx.net}_1` }));
  A.tracks.push(track(layers[0], ctx.traceW, run(w1.portB[0], w1.portB[1], w1.portB[0] + feed, w1.portB[1]), { role: 'feed', net: `${ctx.net}_1` }));
  A.tracks.push(track(layers[1], ctx.traceW, run(w2.portA[0] - feed, w2.portA[1] - 0, w2.portA[0], w2.portA[1]), { role: 'feed', net: `${ctx.net}_2` }));
  A.tracks.push(track(layers[1], ctx.traceW, run(w2.portB[0], w2.portB[1], w2.portB[0] + feed, w2.portB[1]), { role: 'feed', net: `${ctx.net}_2` }));

  A.ports.push({ x: w1.portA[0] - feed, y: w1.portA[1], name: 'L1-in', angle: Math.PI });
  A.ports.push({ x: w1.portB[0] + feed, y: w1.portB[1], name: 'L1-out', angle: 0 });
  A.ports.push({ x: w2.portA[0] - feed, y: w2.portA[1], name: 'L2-in', angle: Math.PI });
  A.ports.push({ x: w2.portB[0] + feed, y: w2.portB[1], name: 'L2-out', angle: 0 });

  A.pads.push(pad(w1.portA[0] - feed, w1.portA[1] + 0, { w: ctx.padSize, drill: ctx.padDrill, number: '1', layer: layers[0] }));
  A.pads.push(pad(w1.portB[0] + feed, w1.portB[1] + 0, { w: ctx.padSize, drill: ctx.padDrill, number: '2', layer: layers[0] }));

  A.labels.push(label(0, r + 1.5, `CM choke  L=${(design.Lcm * 1e6).toFixed(1)} µH  DM=${(design.Ldm * 1e6).toFixed(2)} µH`, { size: 0.8 }));
  A.notes.push({
    level: 'info',
    text: `Coupling is set by the prepreg between ${layers[0]} and ${layers[1]}. Thinner is better: `
      + 'the leakage L(1−k) is what appears differentially and what saturates first.',
  });
  A.notes.push({
    level: 'warn',
    text: 'Both windings carry the full line current. Check the trace width against the IPC rating on '
      + 'the Inductor tab before committing.',
  });
  return A;
}

/* --------------------------------------------------------------------------
   Dispatch
   ----------------------------------------------------------------------- */

export function layoutFilter(design, ctx) {
  switch (design.kind) {
    case 'stepped': return layoutStepped(design, ctx);
    case 'edgeCoupled': return layoutEdgeCoupled(design, ctx);
    case 'hairpin': return layoutHairpin(design, ctx);
    case 'interdigital': return layoutInterdigital(design, ctx);
    case 'cm': return layoutCMChoke(design, ctx);
    default: return layoutLumped(design, ctx);
  }
}
