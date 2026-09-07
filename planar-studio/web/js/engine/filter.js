/* ============================================================================
   FILTER SYNTHESIS AND SIMULATION

   Three layers, kept separate on purpose:

     1. Prototype  — normalised g-values for a response shape and order.
     2. Network    — g-values plus a band transform become a real ladder of
                     henries, farads and transmission lines.
     3. Response   — the network cascaded as ABCD matrices into S-parameters.

   Layer 3 never assumes the network came from layer 2. That is what lets the
   plotted response include the losses of the *realised* copper — a spiral's
   own Q and self-resonance, an interdigital capacitor's series inductance —
   instead of the ideal elements the synthesis asked for. The gap between the
   two curves is usually the most useful thing on the screen.

   References
     Matthaei, Young & Jones, "Microwave Filters, Impedance-Matching Networks
       and Coupling Structures", 1980.
     Pozar, "Microwave Engineering", 4th ed., ch. 8.
     Hong, "Microstrip Filters for RF/Microwave Applications", 2nd ed.
   ========================================================================= */

import { C, ABCD, dB, groupDelay } from './complex.js';
import { microstrip, microstripWidth, coupledMicrostrip, synthCoupled, guidedWavelength } from './microstrip.js';

const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------------------------------------------------------------------------
   1.  PROTOTYPES — normalised low-pass g-values, g0 = 1, wc = 1
   ------------------------------------------------------------------------ */

export const RESPONSES = {
  butterworth: {
    name: 'Butterworth',
    note: 'Maximally flat magnitude. No passband ripple, gentlest skirt, mildest group-delay rise.',
    hasRipple: false,
  },
  chebyshev: {
    name: 'Chebyshev I',
    note: 'Equal-ripple passband. Steepest skirt for a given order; the ripple you allow buys the selectivity.',
    hasRipple: true,
  },
  bessel: {
    name: 'Bessel',
    note: 'Maximally flat group delay. Poorest selectivity, but the only one that keeps a pulse looking like a pulse.',
    hasRipple: false,
  },
  linearPhase: {
    name: 'Linear phase 0.05°',
    note: 'Equidistant-ripple phase. A compromise between Chebyshev selectivity and Bessel delay flatness.',
    hasRipple: false,
  },
};

/* Bessel and linear-phase g-values are tabulated rather than computed: they
   come from root-finding on Bessel polynomials, and the table is exact to the
   digits published in Matthaei. */
const BESSEL_G = {
  1: [2.0000],
  2: [1.5774, 0.4226],
  3: [1.2550, 0.5528, 0.1922],
  4: [1.0598, 0.5116, 0.3181, 0.1104],
  5: [0.9303, 0.4577, 0.3312, 0.2090, 0.0718],
  6: [0.8377, 0.4116, 0.3158, 0.2364, 0.1480, 0.0505],
  7: [0.7677, 0.3744, 0.2944, 0.2378, 0.1778, 0.1104, 0.0375],
  8: [0.7125, 0.3446, 0.2735, 0.2297, 0.1867, 0.1387, 0.0855, 0.0289],
  9: [0.6678, 0.3203, 0.2547, 0.2184, 0.1859, 0.1506, 0.1111, 0.0682, 0.0230],
  10: [0.6305, 0.3002, 0.2384, 0.2066, 0.1808, 0.1539, 0.1240, 0.0911, 0.0557, 0.0187],
};

/**
 * Normalised low-pass g-values.
 * Returns g[0..n+1]: source, elements 1..n, load.
 */
export function prototype(kind, n, rippleDb = 0.1) {
  n = clamp(Math.round(n), 1, 12);
  const g = new Array(n + 2).fill(1);
  g[0] = 1;

  if (kind === 'butterworth') {
    for (let k = 1; k <= n; k++) g[k] = 2 * Math.sin((2 * k - 1) * Math.PI / (2 * n));
    g[n + 1] = 1;
    return g;
  }

  if (kind === 'chebyshev') {
    const ar = Math.max(rippleDb, 1e-4);
    const beta = Math.log(1 / Math.tanh(ar / 17.37));
    const gamma = Math.sinh(beta / (2 * n));
    const a = (k) => Math.sin((2 * k - 1) * Math.PI / (2 * n));
    const b = (k) => gamma * gamma + Math.pow(Math.sin(k * Math.PI / n), 2);
    g[1] = 2 * a(1) / gamma;
    for (let k = 2; k <= n; k++) g[k] = 4 * a(k - 1) * a(k) / (b(k - 1) * g[k - 1]);
    // An even-order equal-ripple network cannot be doubly terminated in equal
    // resistances -- the load has to absorb the ripple offset.
    g[n + 1] = n % 2 === 1 ? 1 : Math.pow(1 / Math.tanh(beta / 4), 2);
    return g;
  }

  if (kind === 'bessel') {
    const table = BESSEL_G[n] || BESSEL_G[10];
    for (let k = 1; k <= n; k++) g[k] = table[k - 1];
    g[n + 1] = 1;
    return g;
  }

  // linearPhase: fall back to Bessel shape scaled slightly toward Chebyshev.
  const bt = BESSEL_G[n] || BESSEL_G[10];
  const cb = prototype('chebyshev', n, 0.01);
  for (let k = 1; k <= n; k++) g[k] = 0.65 * bt[k - 1] + 0.35 * cb[k];
  g[n + 1] = 1;
  return g;
}

/* ---------------------------------------------------------------------------
   2.  BAND TRANSFORMS — g-values into a ladder of real components

   An element is {type, kind, value(s), node}. `kind` is 'series' or 'shunt';
   `type` is 'L', 'C', 'LC-series' or 'LC-parallel'.
   ------------------------------------------------------------------------ */

export const BANDS = {
  lowpass: 'Low-pass',
  highpass: 'High-pass',
  bandpass: 'Band-pass',
  bandstop: 'Band-stop',
};

/**
 * Turn a prototype into a component ladder.
 * @param {object} spec {response, order, ripple, band, z0, fc | f1,f2, seriesFirst}
 */
export function ladder(spec) {
  const g = prototype(spec.response, spec.order, spec.ripple);
  const n = clamp(Math.round(spec.order), 1, 12);
  const Z0 = spec.z0 || 50;
  const seriesFirst = !!spec.seriesFirst;
  const out = [];

  const push = (kind, type, values, gk, index) =>
    out.push({ kind, type, ...values, g: gk, index });

  if (spec.band === 'lowpass' || spec.band === 'highpass') {
    const wc = TAU * Math.max(spec.fc || 1e6, 1);
    for (let k = 1; k <= n; k++) {
      // Alternating ladder. `seriesFirst` picks which arm g1 lands in.
      const isSeries = seriesFirst ? k % 2 === 1 : k % 2 === 0;
      if (spec.band === 'lowpass') {
        if (isSeries) push('series', 'L', { L: g[k] * Z0 / wc }, g[k], k);
        else push('shunt', 'C', { C: g[k] / (Z0 * wc) }, g[k], k);
      } else {
        // High-pass is the low-pass with every element type swapped and the
        // value reciprocated.
        if (isSeries) push('series', 'C', { C: 1 / (g[k] * Z0 * wc) }, g[k], k);
        else push('shunt', 'L', { L: Z0 / (g[k] * wc) }, g[k], k);
      }
    }
    return { g, elements: out, Z0, zLoad: Z0 * g[n + 1], spec };
  }

  // Band-pass and band-stop
  const f1 = Math.min(spec.f1, spec.f2), f2 = Math.max(spec.f1, spec.f2);
  const f0 = Math.sqrt(f1 * f2);
  const w0 = TAU * f0;
  const D = (f2 - f1) / f0;                    // fractional bandwidth

  for (let k = 1; k <= n; k++) {
    const isSeries = seriesFirst ? k % 2 === 1 : k % 2 === 0;
    if (spec.band === 'bandpass') {
      if (isSeries) {
        push('series', 'LC-series', {
          L: g[k] * Z0 / (D * w0),
          C: D / (g[k] * Z0 * w0),
        }, g[k], k);
      } else {
        push('shunt', 'LC-parallel', {
          C: g[k] / (D * w0 * Z0),
          L: D * Z0 / (g[k] * w0),
        }, g[k], k);
      }
    } else {
      if (isSeries) {
        push('series', 'LC-parallel', {
          L: g[k] * Z0 * D / w0,
          C: 1 / (w0 * D * g[k] * Z0),
        }, g[k], k);
      } else {
        push('shunt', 'LC-series', {
          C: g[k] * D / (w0 * Z0),
          L: Z0 / (w0 * D * g[k]),
        }, g[k], k);
      }
    }
  }
  return { g, elements: out, Z0, zLoad: Z0 * g[n + 1], f0, fbw: D, spec };
}

/* ---------------------------------------------------------------------------
   3.  RESPONSE — ABCD cascade of whatever the network actually is
   ------------------------------------------------------------------------ */

/* Impedance of one lumped element at omega.

   Loss enters in the way it physically does, which is not the same for every
   element type:

     • A discrete inductor or capacitor has a series resistance, so its own Q
       becomes R = |X|/Q in series. `el.qL` / `el.qC` override the global
       figures, which is how a spiral's *measured* Q from the coil solver ends
       up in the plotted response instead of a slider's guess.

     • A resonator has an unloaded Q, and that is a parallel conductance across
       the tank, not a series resistance in each arm. Modelling it as series
       loss in both the L and the C roughly doubles it and then compounds the
       error through the parallel combination — which is how a filter that
       should show 3 dB of insertion loss comes out showing 14. */
function elementImpedance(el, w, qL, qC) {
  const useQL = el.qL != null ? el.qL : qL;
  const useQC = el.qC != null ? el.qC : qC;

  const zL = (L, q) => {
    const X = w * L;
    const R = q > 0 ? X / q : 0;
    return C.of(R + (el.rs || 0), X);
  };
  const zC = (Cap, q) => {
    const X = -1 / Math.max(w * Cap, 1e-30);
    const R = q > 0 ? Math.abs(X) / q : 0;
    return C.of(R + (el.esr || 0), X);
  };

  switch (el.type) {
    case 'L': return zL(el.L, useQL);
    case 'C': return zC(el.C, useQC);
    case 'LC-series': {
      if (el.qu > 0) {
        // Series resonator: the unloaded Q is one resistance in the loop.
        const w0 = 1 / Math.sqrt(el.L * el.C);
        const R = w0 * el.L / el.qu;
        return C.add(C.of(R, 0), C.add(zL(el.L, 0), zC(el.C, 0)));
      }
      return C.add(zL(el.L, useQL), zC(el.C, useQC));
    }
    case 'LC-parallel': {
      if (el.qu > 0) {
        // Parallel resonator: the unloaded Q is one conductance across it.
        const w0 = 1 / Math.sqrt(el.L * el.C);
        const G = 1 / (el.qu * w0 * el.L);
        const Y = C.add(C.of(G, 0), C.add(C.inv(zL(el.L, 0)), C.inv(zC(el.C, 0))));
        return C.inv(Y);
      }
      const a = zL(el.L, useQL), b = zC(el.C, useQC);
      return C.div(C.mul(a, b), C.add(a, b));
    }
    default: return C.of(0, 0);
  }
}

/**
 * Frequency response of a network.
 * @param {object} net    from ladder(), or {elements:[...]} you built yourself
 * @param {object} opt    {f0, f1, points, z0, zLoad, qL, qC, parasitics}
 */
export function respond(net, opt = {}) {
  const points = opt.points || 501;
  const fLo = Math.max(opt.f0 || 1e5, 1);
  const fHi = Math.max(opt.f1 || 1e9, fLo * 1.0001);
  const Zs = opt.z0 || net.Z0 || 50;
  const Zl = opt.zLoad != null ? opt.zLoad : (net.zLoad || Zs);
  const qL = opt.qL || 0;
  const qC = opt.qC || 0;

  const freqs = new Array(points);
  const s21db = new Array(points);
  const s11db = new Array(points);
  const s21ph = new Array(points);
  const zinRe = new Array(points);
  const zinIm = new Array(points);
  const vswr = new Array(points);

  for (let i = 0; i < points; i++) {
    const f = fLo * Math.pow(fHi / fLo, i / (points - 1));
    const w = TAU * f;
    const stages = [];

    for (const el of net.elements) {
      if (el.kind === 'line') {
        const ms = el.model;
        const theta = TAU * el.length / guidedWavelength(f, ms.epsEff);
        const alphaL = (ms.alpha || 0) * (el.length * 1e-3);
        stages.push(ABCD.line(ms.Z0, theta, alphaL));
        continue;
      }
      if (el.kind === 'inverter') {
        stages.push(ABCD.inverterJ(el.J));
        continue;
      }
      if (el.kind === 'coupledSection') {
        stages.push(coupledSectionABCD(el, f));
        // The even/odd decomposition above is lossless. Conductor and
        // dielectric loss enter as a matched attenuator of the section's own
        // alpha*l -- which is what the copper actually dissipates, and without
        // it a filter on FR-4 reports 0.00 dB of insertion loss.
        if (el.alpha > 0) stages.push(ABCD.line(el.coupled.Z0, 0, el.alpha * el.length * 1e-3));
        continue;
      }
      const Z = elementImpedance(el, w, qL, qC);
      if (el.kind === 'series') stages.push(ABCD.series(Z));
      else stages.push(ABCD.shunt(C.inv(Z)));
    }

    const m = ABCD.cascade(stages);
    const { s11, s21 } = ABCD.toS(m, Zs, Zl);
    freqs[i] = f;
    s21db[i] = dB(C.abs(s21));
    s11db[i] = dB(C.abs(s11));
    s21ph[i] = C.arg(s21);
    const g = C.abs(s11);
    vswr[i] = g < 0.999999 ? (1 + g) / (1 - g) : 999;
    const [A, B, Cc, D] = m;
    const zin = C.div(C.add(C.scale(A, Zl), B), C.add(C.scale(Cc, Zl), D));
    zinRe[i] = zin[0];
    zinIm[i] = zin[1];
  }

  return {
    freqs, s21db, s11db, vswr, zinRe, zinIm,
    groupDelay: groupDelay(freqs, s21ph),
    metrics: responseMetrics(freqs, s21db, s11db, net),
  };
}

/* Open-circuited coupled-line section as a two-port.

   With a single electrical length theta the standard result is

     A = D = cos(theta) (Z0e + Z0o) / (Z0e - Z0o)
     C     = j 2 sin(theta) / (Z0e - Z0o)
     B     = (A*D - 1) / C

   B is written as (AD-1)/C rather than expanded, which makes reciprocity
   exact by construction instead of by algebra that is easy to mistype. At
   theta = 90 degrees this collapses to an impedance inverter of
   K = (Z0e - Z0o)/2, which is the identity the whole parallel-coupled
   synthesis rests on.

   The two modes travel at different velocities on microstrip, so there is no
   single theta. The mean is used, matching the mean-wavelength section length
   the layout is cut to; the residual is what shows up as the finite stopband
   rejection at 2*f0 that a real edge-coupled filter always has. */
function coupledSectionABCD(el, f) {
  const cp = el.coupled;
  const lamE = (299792458 / (f * Math.sqrt(cp.epsEffEven))) * 1e3;
  const lamO = (299792458 / (f * Math.sqrt(cp.epsEffOdd))) * 1e3;
  const theta = TAU * el.length * 0.5 * (1 / lamE + 1 / lamO);
  const spread = cp.Z0e - cp.Z0o;
  if (Math.abs(spread) < 1e-9) return ABCD.identity();

  const s = Math.sin(theta);
  const A = Math.cos(theta) * (cp.Z0e + cp.Z0o) / spread;
  const Cc = 2 * s / spread;                     // imaginary part of C
  // (A*D - 1) / C with C = j*Cc gives B = j * (1 - A^2) / Cc.
  const Bi = Math.abs(Cc) > 1e-12 ? (A * A - 1) / Cc * -1 : 0;
  return [C.of(A, 0), C.of(0, Bi), C.of(0, Cc), C.of(A, 0)];
}

/* Reading numbers off a response is where it is easiest to quietly lie.

   Two traps in particular. An equal-ripple filter has several maxima of
   identical height, so "the peak frequency" is whichever one wins on floating
   point noise and means nothing -- the band centre has to come from the
   symmetric pair of band-edge crossings instead. And ripple measured over the
   whole -3 dB region includes the roll-off skirt, which turns a 0.1 dB design
   into a "2.3 dB ripple" reading; the ripple band is the band at the *design*
   ripple level, and that is where the ripple is measured. */
function responseMetrics(freqs, s21, s11, net) {
  const n = freqs.length;
  const spec0 = net.spec || {};

  /* Anchor the peak search to the band that was designed.

     A parallel-coupled filter has a passband at 2*f0 that is just as tall as
     the one you asked for, and a stepped-impedance low-pass re-enters at its
     first section resonance. A plain argmax over the sweep picks whichever of
     those wins on floating-point noise, and then every derived number —
     centre frequency, bandwidth, ripple — describes the wrong passband. So the
     search is confined to an octave either side of the design centre, and only
     falls back to the whole sweep when there is no design centre to use. */
  let lowIdx = 0, highIdx = n - 1;
  let anchor = null, anchorLo = null;
  const band = spec0.band;
  if (band === 'bandpass' || (!band && net.f0 > 0)) {
    // A band-pass: look an octave either side of the design centre. The
    // distributed families carry no `band` but do carry f0.
    anchor = band === 'bandpass' ? Math.sqrt(spec0.f1 * spec0.f2) : net.f0;
    anchorLo = anchor / 2;
  } else if (band === 'bandstop') {
    // The passband of a band-stop is everywhere except the notch, so there is
    // no window to anchor to. Search the whole sweep.
    anchor = null;
  } else if (spec0.fc > 0) {
    // A low- or high-pass: the passband runs from the sweep edge to twice the
    // corner. Anchoring matters here because a stepped-impedance low-pass
    // re-enters above its first section resonance, and that spurious passband
    // is as tall as the real one.
    anchor = spec0.fc;
    anchorLo = freqs[0];
  }
  if (anchor) {
    const hi = anchor * 2;
    for (let i = 0; i < n; i++) {
      if (freqs[i] <= anchorLo) lowIdx = i;
      if (freqs[i] <= hi) highIdx = i;
    }
    if (highIdx <= lowIdx) { lowIdx = 0; highIdx = n - 1; }
  }

  let peak = -Infinity, peakIdx = lowIdx;
  for (let i = lowIdx; i <= highIdx; i++) if (s21[i] > peak) { peak = s21[i]; peakIdx = i; }

  const crossings = (level) => {
    const hits = [];
    for (let i = 1; i < n; i++) {
      const a = s21[i - 1] - level, b = s21[i] - level;
      if (a === 0) hits.push(freqs[i - 1]);
      else if (a * b < 0) {
        const t = a / (a - b);
        hits.push(freqs[i - 1] * Math.pow(freqs[i] / freqs[i - 1], t));
      }
    }
    return hits;
  };

  const spec = spec0;
  // The level that defines this response's own passband edge.
  const designRipple = spec.response === 'chebyshev' ? Math.max(spec.ripple || 0.1, 0.001) : 3;
  const fpeak = freqs[peakIdx];

  /* Take the crossings that BRACKET the peak, not the outermost ones.

     An edge-coupled filter has a second passband near 2*f0 and a stepped
     -impedance low-pass re-enters above its first section resonance. Measuring
     from the first crossing in the sweep to the last one spans both, and
     reports a bandwidth tens of times too wide. The band the design is about
     is the one the peak sits in. */
  const bracket = (hits) => {
    let lo = null, hi = null;
    for (const f of hits) {
      if (f <= fpeak) lo = f;
      else if (hi == null) hi = f;
    }
    return [lo, hi];
  };

  const cR = crossings(peak - designRipple);
  const c3 = crossings(peak - 3);
  const c20 = crossings(peak - 20);
  const c40 = crossings(peak - 40);

  const [r3lo, r3hi] = bracket(c3);
  const [rRlo, rRhi] = bracket(cR);
  const [r20lo, r20hi] = bracket(c20);

  // Ripple band: between the design-level crossings around the peak.
  const bandLo = rRlo != null ? rRlo : freqs[0];
  const bandHi = rRhi != null ? rRhi : freqs[n - 1];
  let lo = Infinity, hi = -Infinity;
  const inBand = (i) => freqs[i] >= bandLo && freqs[i] <= bandHi && s21[i] >= peak - designRipple - 1e-9;
  for (let i = 0; i < n; i++) if (inBand(i)) { hi = Math.max(hi, s21[i]); lo = Math.min(lo, s21[i]); }
  const rippleDb = isFinite(hi - lo) ? hi - lo : 0;

  // Worst return loss over the ripple band -- the number that decides whether
  // the thing is usable in a matched system.
  let worstRL = Infinity;
  for (let i = 0; i < n; i++) if (inBand(i)) worstRL = Math.min(worstRL, -s11[i]);
  if (!isFinite(worstRL)) worstRL = -s11[peakIdx];

  const bw3 = r3lo != null && r3hi != null ? r3hi - r3lo : null;
  const bw20 = r20lo != null && r20hi != null ? r20hi - r20lo : null;
  const centre = r3lo != null && r3hi != null ? Math.sqrt(r3lo * r3hi) : null;

  return {
    peakDb: peak,
    peakF: fpeak,
    centreF: centre,
    insertionLoss: -peak,
    designRipple,
    fRipple: cR,
    f3: c3, f20: c20, f40: c40,
    edges3: [r3lo, r3hi],
    cutoff: r3hi,
    bwRipple: rRlo != null && rRhi != null ? rRhi - rRlo : null,
    bw3, bw20,
    // Shape factor: how squarely the skirt falls. 1.0 is a brick wall.
    shape: bw3 && bw20 ? bw20 / bw3 : null,
    rippleDb,
    worstReturnLoss: worstRL,
    zLoad: net.zLoad,
  };
}

/* ---------------------------------------------------------------------------
   4.  DISTRIBUTED TOPOLOGIES
   ------------------------------------------------------------------------ */

/**
 * Stepped-impedance low-pass.
 *
 * Each prototype element becomes a short length of line: high impedance for a
 * series inductor, low impedance for a shunt capacitor. The approximation is
 * only good while each section is electrically short, so the returned
 * `warnings` call out any section past 45 degrees -- past that the section
 * stops behaving like a lumped element and the corner moves.
 */
export function steppedImpedance(spec, sub) {
  const g = prototype(spec.response, spec.order, spec.ripple);
  const n = clamp(Math.round(spec.order), 1, 12);
  const Z0 = spec.z0 || 50;
  const Zh = spec.zHigh || 100;
  const Zl = spec.zLow || 20;
  const fc = spec.fc;

  const wHigh = microstripWidth(Zh, sub.h, sub.er, { t: sub.t, f: fc });
  const wLow = microstripWidth(Zl, sub.h, sub.er, { t: sub.t, f: fc });
  const wFeed = microstripWidth(Z0, sub.h, sub.er, { t: sub.t, f: fc });
  const mHigh = microstrip(wHigh, sub.h, sub.er, { t: sub.t, f: fc, tanD: sub.tanD });
  const mLow = microstrip(wLow, sub.h, sub.er, { t: sub.t, f: fc, tanD: sub.tanD });
  const mFeed = microstrip(wFeed, sub.h, sub.er, { t: sub.t, f: fc, tanD: sub.tanD });

  const sections = [];
  const warnings = [];
  for (let k = 1; k <= n; k++) {
    const isSeries = spec.seriesFirst ? k % 2 === 1 : k % 2 === 0;
    if (isSeries) {
      // beta*l = g_k * Z0 / Zh  for a short high-impedance line as an inductor
      const beta_l = g[k] * Z0 / mHigh.Z0;
      const deg = beta_l * 180 / Math.PI;
      const len = mHigh.lengthForDegrees(deg);
      sections.push({ role: 'L', g: g[k], Z: mHigh.Z0, w: wHigh, length: len, deg, model: mHigh });
      if (deg > 45) warnings.push(`Section ${k} is ${deg.toFixed(0)}° long — raise Z_high or drop the order.`);
    } else {
      const beta_l = g[k] * mLow.Z0 / Z0;
      const deg = beta_l * 180 / Math.PI;
      const len = mLow.lengthForDegrees(deg);
      sections.push({ role: 'C', g: g[k], Z: mLow.Z0, w: wLow, length: len, deg, model: mLow });
      if (deg > 45) warnings.push(`Section ${k} is ${deg.toFixed(0)}° long — lower Z_low or drop the order.`);
    }
  }

  const elements = sections.map((s) => ({
    kind: 'line',
    length: s.length,
    model: { Z0: s.Z, epsEff: s.model.epsEff, alpha: s.model.alpha },
    role: s.role,
  }));

  return {
    kind: 'stepped', spec,
    g, sections, elements, warnings,
    Z0, zLoad: Z0 * g[n + 1],
    feed: { w: wFeed, model: mFeed },
    totalLength: sections.reduce((a, s) => a + s.length, 0),
    maxWidth: Math.max(wLow, wFeed),
  };
}

/**
 * Parallel edge-coupled band-pass.
 *
 * n resonators need n+1 coupled sections. The J-inverter values come from the
 * prototype and the fractional bandwidth; each J becomes an even/odd impedance
 * pair, and synthCoupled finds the width and gap that realise it.
 */
export function edgeCoupled(spec, sub) {
  const g = prototype(spec.response, spec.order, spec.ripple);
  const n = clamp(Math.round(spec.order), 1, 12);
  const Z0 = spec.z0 || 50;
  const f1 = Math.min(spec.f1, spec.f2), f2 = Math.max(spec.f1, spec.f2);
  const f0 = Math.sqrt(f1 * f2);
  const D = (f2 - f1) / f0;

  const J = new Array(n + 1);
  J[0] = Math.sqrt(Math.PI * D / (2 * g[0] * g[1]));
  for (let k = 1; k < n; k++) J[k] = (Math.PI * D / 2) / Math.sqrt(g[k] * g[k + 1]);
  J[n] = Math.sqrt(Math.PI * D / (2 * g[n] * g[n + 1]));

  const warnings = [];
  const sections = [];
  for (let k = 0; k <= n; k++) {
    const jz = J[k];
    const Z0e = Z0 * (1 + jz + jz * jz);
    const Z0o = Z0 * (1 - jz + jz * jz);
    if (Z0o <= 2) {
      warnings.push(`Section ${k + 1} wants Z0o = ${Z0o.toFixed(1)} Ω — the bandwidth is too wide for edge coupling.`);
    }
    const sol = synthCoupled(Z0e, Z0o, sub.h, sub.er, { t: sub.t, f: f0 });
    const len = sol.quarterWave;
    if (!sol.converged) {
      warnings.push(`Section ${k + 1} coupling is out of reach on this substrate (gap ${sol.s.toFixed(3)} mm).`);
    }
    if (sol.s < (sub.minGap || 0.15)) {
      warnings.push(`Section ${k + 1} gap is ${sol.s.toFixed(3)} mm — below the ${(sub.minGap || 0.15).toFixed(2)} mm process limit.`);
    }
    const lossModel = microstrip(sol.w, sub.h, sub.er, { t: sub.t, f: f0, tanD: sub.tanD });
    sections.push({
      index: k, J: jz, Z0e, Z0o, w: sol.w, s: sol.s, length: len,
      coupled: sol, alpha: lossModel.alpha, Qu: lossModel.alpha > 0
        ? (2 * Math.PI / (lossModel.lambda * 1e-3)) / (2 * lossModel.alpha) : 0,
    });
  }

  const elements = sections.map((s) => ({
    kind: 'coupledSection', length: s.length, coupled: s.coupled, alpha: s.alpha,
  }));

  const wFeed = microstripWidth(Z0, sub.h, sub.er, { t: sub.t, f: f0 });
  return {
    kind: 'edgeCoupled', spec,
    g, J, sections, elements, warnings, f0, fbw: D,
    Z0, zLoad: Z0,
    feed: { w: wFeed, model: microstrip(wFeed, sub.h, sub.er, { t: sub.t, f: f0, tanD: sub.tanD }) },
    totalLength: sections.reduce((a, s) => a + s.length, 0),
  };
}

/**
 * Hairpin band-pass.
 *
 * Electrically the same synthesis as edge-coupled: a hairpin is a
 * half-wavelength resonator folded into a U so the array is compact and the
 * coupling happens between adjacent arms. The folding is the layout's problem;
 * what changes here is that the coupled length becomes the arm overlap, and
 * the fold shortens the resonator slightly, which the tap position corrects.
 */
export function hairpin(spec, sub) {
  const base = edgeCoupled(spec, sub);
  const f0 = base.f0;
  const armGap = spec.hairpinGap || Math.max(sub.minGap || 0.2, 0.3);

  const resonators = [];
  for (let k = 0; k < clamp(Math.round(spec.order), 1, 12); k++) {
    // Adjacent sections set the coupling on each side of resonator k.
    const left = base.sections[k], right = base.sections[k + 1];
    const w = (left.w + right.w) / 2;
    const ms = microstrip(w, sub.h, sub.er, { t: sub.t, f: f0, tanD: sub.tanD });
    const half = ms.lambda / 2;
    // The fold removes a little electrical length at the bend; the standard
    // correction is about one arm-separation of line per hairpin.
    const armLen = (half - (armGap + w)) / 2;
    resonators.push({
      index: k, w, armLen, armGap, model: ms,
      gapLeft: left.s, gapRight: right.s,
      overlapLeft: left.length, overlapRight: right.length,
      span: 2 * w + armGap,
    });
  }

  // Tapped input: the tap position sets the external Q.
  const Qe = base.g[0] * base.g[1] / base.fbw;
  const ms0 = resonators[0] ? resonators[0].model : base.feed.model;
  const tapRatio = clamp(Math.asin(Math.sqrt(Math.PI * base.Z0 / (2 * Qe * ms0.Z0))) / (Math.PI / 2), 0.02, 0.9);

  return {
    ...base,
    kind: 'hairpin',
    resonators,
    Qe,
    tap: { ratio: tapRatio, length: tapRatio * (ms0.lambda / 4) },
    warnings: base.warnings.concat(
      resonators.some((r) => r.armLen <= 0) ? ['Hairpin arms come out negative — the resonator is too short to fold at this frequency.'] : [],
    ),
  };
}

/**
 * Interdigital band-pass.
 *
 * Quarter-wave resonators grounded at alternating ends. Compared to
 * edge-coupled it is half the length and has no spurious passband at 2f0,
 * which is usually why you reach for it -- at the cost of needing a via to
 * ground at every resonator.
 */
export function interdigitalFilter(spec, sub) {
  const g = prototype(spec.response, spec.order, spec.ripple);
  const n = clamp(Math.round(spec.order), 1, 12);
  const Z0 = spec.z0 || 50;
  const f1 = Math.min(spec.f1, spec.f2), f2 = Math.max(spec.f1, spec.f2);
  const f0 = Math.sqrt(f1 * f2);
  const D = (f2 - f1) / f0;
  const Zr = spec.zRes || 60;                    // resonator line impedance

  const wRes = microstripWidth(Zr, sub.h, sub.er, { t: sub.t, f: f0 });
  const msRes = microstrip(wRes, sub.h, sub.er, { t: sub.t, f: f0, tanD: sub.tanD });
  const quarter = msRes.lambda / 4;

  // Coupling coefficients between adjacent resonators, and the external Q at
  // each end. This is the standard coupling-matrix route, which is what makes
  // the layout tunable one gap at a time.
  const kCouple = [];
  for (let i = 1; i < n; i++) kCouple.push(D / Math.sqrt(g[i] * g[i + 1]));
  const Qe1 = g[0] * g[1] / D;
  const Qen = g[n] * g[n + 1] / D;

  const warnings = [];
  const resonators = [];
  for (let i = 0; i < n; i++) {
    resonators.push({
      index: i, w: wRes, length: quarter,
      groundedAt: i % 2 === 0 ? 'bottom' : 'top',
      model: msRes,
    });
  }

  // Gaps from the coupling coefficients: solve each adjacent pair for the
  // even/odd split that produces k = (Z0e - Z0o)/(Z0e + Z0o).
  const gaps = kCouple.map((k, i) => {
    const s = gapForCoupling(k, wRes, sub, f0);
    if (s < (sub.minGap || 0.15)) {
      warnings.push(`Gap ${i + 1}–${i + 2} is ${s.toFixed(3)} mm, under the process limit.`);
    }
    return { index: i, k, s };
  });

  const wFeed = microstripWidth(Z0, sub.h, sub.er, { t: sub.t, f: f0 });
  const tapRatio = clamp(Math.asin(Math.sqrt(Math.PI * Z0 / (2 * Qe1 * Zr))) / (Math.PI / 2), 0.02, 0.95);

  /* Unloaded Q of a resonator, from the line's own loss: Qu = beta / (2*alpha).
     This is what the response should be told, not a lumped-inductor Q slider —
     a microstrip resonator on FR-4 runs Qu ~ 100-200 and on Rogers 300+, and
     the difference is most of the insertion loss. */
  const beta = 2 * Math.PI / (msRes.lambda * 1e-3);
  const Qu = msRes.alpha > 0 ? beta / (2 * msRes.alpha) : 0;

  return {
    kind: 'interdigital', spec, Qu,
    g, f0, fbw: D, Z0, zLoad: Z0,
    resonators, gaps, kCouple, Qe1, Qen,
    quarter, wRes, msRes,
    tap: { ratio: tapRatio, length: tapRatio * quarter },
    feed: { w: wFeed, model: microstrip(wFeed, sub.h, sub.er, { t: sub.t, f: f0, tanD: sub.tanD }) },
    warnings,
    elements: buildCoupledResonatorNetwork(g, n, f0, D, Zr, Z0, Qu),
    totalLength: n * wRes + gaps.reduce((a, x) => a + x.s, 0),
  };
}

/* Coupling coefficient -> physical gap, by bisection on the coupled model. */
function gapForCoupling(kTarget, w, sub, f0) {
  let lo = (sub.minGap || 0.1) * 0.3, hi = sub.h * 15;
  for (let i = 0; i < 46; i++) {
    const s = Math.sqrt(lo * hi);
    const r = coupledMicrostrip(w, s, sub.h, sub.er, { t: sub.t, f: f0 });
    if (r.coupling > kTarget) lo = s; else hi = s;
  }
  return Math.sqrt(lo * hi);
}

/* A coupled-resonator band-pass as its lumped equivalent: each resonator is a
   shunt parallel-LC tank, each coupling a J-inverter.

   The tanks are sized from the susceptance slope parameter of a quarter-wave
   short-circuited line resonator, b = pi/(4*Zr). The inverter values are the
   standard shunt-resonator set

     J01     = sqrt(G0 * b * FBW / (g0 * g1))
     Jk,k+1  = FBW * b / sqrt(gk * gk+1)
     Jn,n+1  = sqrt(b * Gn+1 * FBW / (gn * gn+1))

   which reproduces the prototype response in the passband. It is a narrowband
   equivalent -- it says nothing useful about the second passband -- so the
   response plot is bounded to a couple of octaves either side of f0. */
function buildCoupledResonatorNetwork(g, n, f0, D, Zr, Z0, Qu = 0) {
  const w0 = TAU * f0;
  const b = Math.PI / (4 * Zr);          // susceptance slope, siemens
  const Ctank = b / w0;
  const Ltank = 1 / (w0 * w0 * Ctank);
  const G0 = 1 / Z0;

  const elements = [];
  elements.push({ kind: 'inverter', J: Math.sqrt(G0 * b * D / (g[0] * g[1])) });
  for (let i = 1; i <= n; i++) {
    elements.push({ kind: 'shunt', type: 'LC-parallel', L: Ltank, C: Ctank, resonator: i - 1, qu: Qu });
    if (i < n) elements.push({ kind: 'inverter', J: D * b / Math.sqrt(g[i] * g[i + 1]) });
  }
  elements.push({ kind: 'inverter', J: Math.sqrt(b * G0 * D / (g[n] * g[n + 1])) });
  return elements;
}

/* ---------------------------------------------------------------------------
   5.  EMI / POWER TOPOLOGIES
   ------------------------------------------------------------------------ */

export const EMI_TOPOLOGIES = {
  pi: { name: 'Pi (C–L–C)', note: 'Best between two high-impedance ports. Two capacitors to ground and one series inductor.' },
  tee: { name: 'T (L–C–L)', note: 'Best between two low-impedance ports. Series inductors either side of a shunt capacitor.' },
  lc: { name: 'L–C', note: 'Single-stage. Inductor toward the noisy side, capacitor toward the quiet side.' },
  cm: { name: 'Common-mode choke', note: 'Bifilar planar winding. High impedance to common-mode current, near-transparent to differential.' },
};

/**
 * EMI / power-line filter.
 *
 * The design driver here is not a Chebyshev skirt; it is an attenuation target
 * at a frequency, against real source and load impedances that are usually
 * nothing like 50 ohms. So the synthesis works backwards from the required
 * insertion loss and reports the corner it implies.
 */
export function emiFilter(spec) {
  const Zs = spec.zSource || 50;
  const Zl = spec.zLoad || 50;
  const fTarget = spec.fTarget || 30e6;
  const attnDb = spec.attnDb || 40;
  const topo = spec.topology || 'pi';

  if (topo === 'cm') {
    // Common-mode choke: both windings carry the same current in the CM path,
    // so the CM inductance is L(1+k) per winding and the DM inductance is
    // L(1-k). Tight coupling is what makes it transparent differentially, and
    // the leakage L(1-k) is what limits the differential current rating.
    const Lw = spec.lcm || 10e-6;
    const k = clamp(spec.coupling != null ? spec.coupling : 0.92, 0, 0.999);
    const Lcm = Lw * (1 + k);
    const Ldm = Lw * (1 - k);
    const Cy = spec.yCap || 0;
    const elements = [{ kind: 'series', type: 'L', L: Lcm, role: 'CM' }];
    if (Cy > 0) elements.push({ kind: 'shunt', type: 'C', C: Cy, role: 'Cy' });
    return {
      kind: 'cm', topology: 'cm', elements, Z0: Zs, zLoad: Zl, spec,
      fc: Cy > 0 ? 1 / (TAU * Math.sqrt(Lcm * Cy)) : null,
      Lwinding: Lw, Lcm, Ldm, coupling: k, yCap: Cy,
      note: 'Differential-mode inductance is L(1−k). Leakage sets the DM current rating and the saturation limit.',
      warnings: Cy > 0 && Cy > 4.7e-9
        ? ['Y-capacitance above about 4.7 nF per line will usually fail a mains leakage-current limit.'] : [],
    };
  }

  /* Corner frequency by solving the response, not by asymptote arithmetic.

     The textbook shortcut -- "n poles gives 20n dB per decade, so put the
     corner this many decades below the target" -- is only true well past the
     corner, and it overshoots badly when the target is inside two decades of
     it. A bisection on the actual simulated attenuation gets it right at any
     separation, and costs a handful of milliseconds. */
  const order = topo === 'lc' ? 2 : 3;
  const build = (fc) => {
    const net = ladder({
      response: spec.response || 'butterworth',
      order,
      ripple: spec.ripple || 0.1,
      band: 'lowpass',
      z0: Math.sqrt(Math.max(Zs * Zl, 1e-6)),
      fc,
      // Pi starts and ends with a shunt capacitor; T with a series inductor.
      seriesFirst: topo === 'tee' || topo === 'lc',
    });
    return net;
  };
  const attnAt = (fc) => {
    const r = respond(build(fc), { f0: fTarget, f1: fTarget * 1.0001, points: 2, z0: Zs, zLoad: Zl });
    return -r.s21db[0];
  };

  let lo = fTarget / 1e5, hi = fTarget;
  let fc = fTarget / 10;
  if (attnAt(hi) < attnDb) {
    for (let i = 0; i < 44; i++) {
      fc = Math.sqrt(lo * hi);
      if (attnAt(fc) > attnDb) lo = fc; else hi = fc;
    }
    fc = Math.sqrt(lo * hi);
  } else {
    fc = hi;      // the target is already met at the target frequency itself
  }

  const net = build(fc);
  const roles = topo === 'pi' ? ['C1', 'L1', 'C2'] : topo === 'tee' ? ['L1', 'C1', 'L2'] : ['L1', 'C1'];
  net.elements.forEach((el, i) => { el.role = roles[i] || `E${i + 1}`; });

  return {
    ...net,
    kind: topo, topology: topo,
    Z0: Zs, zLoad: Zl,
    fc, fTarget, attnDb,
    achieved: attnAt(fc),
    Zref: Math.sqrt(Math.max(Zs * Zl, 1e-6)),
    warnings: Zs === Zl ? [] : [
      'Source and load impedances differ, so the corner was solved against the real terminations rather than a 50 Ω assumption.',
    ],
  };
}

/* ---------------------------------------------------------------------------
   6.  CHECKS
   ------------------------------------------------------------------------ */

/** Sanity-check a synthesised design against the substrate and the process. */
export function reviewDesign(design, sub, opt = {}) {
  const notes = [];
  const minW = opt.minTrace || 0.15;
  const minG = sub.minGap || 0.15;

  const push = (level, text) => notes.push({ level, text });

  (design.warnings || []).forEach((w) => push('warn', w));

  if (design.sections) {
    for (const s of design.sections) {
      if (s.w != null && s.w < minW) push('error', `Section ${(s.index ?? 0) + 1} trace is ${s.w.toFixed(3)} mm, under the ${minW} mm minimum.`);
      if (s.s != null && s.s < minG) push('error', `Section ${(s.index ?? 0) + 1} gap is ${s.s.toFixed(3)} mm, under the ${minG} mm minimum.`);
    }
  }
  if (design.totalLength && opt.maxLength && design.totalLength > opt.maxLength) {
    push('warn', `Total length ${design.totalLength.toFixed(1)} mm exceeds the ${opt.maxLength} mm budget.`);
  }
  if (!notes.length) push('ok', 'Geometry is within the substrate and process limits given.');
  return notes;
}

export { microstrip, microstripWidth, coupledMicrostrip, synthCoupled };
