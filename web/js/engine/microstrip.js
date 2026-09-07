/* ============================================================================
   MICROSTRIP AND COPLANAR MODELS

   Analysis is Hammerstad–Jensen, which is the model most PCB tools use and is
   good to about 1 % over 0.05 < w/h < 20. Synthesis is bisection on the same
   analysis rather than a separate closed-form inverse, so the width a filter
   is built with is exactly the width that reproduces the target impedance when
   you check it — the two can never drift apart.

   Dispersion is Getsinger. It is the simple model, not the most accurate one,
   but it captures the effect that matters here: on FR-4 above roughly 2 GHz
   the effective permittivity climbs, resonators come out electrically long,
   and a filter designed from the static value lands low in frequency.

   References
     Hammerstad & Jensen, "Accurate models for microstrip computer-aided
       design", IEEE MTT-S 1980.
     Getsinger, "Microstrip dispersion model", IEEE Trans. MTT-21, 1973.
     Gupta, Garg, Bahl & Bhartia, "Microstrip Lines and Slotlines", 2nd ed.
     Bahl, "Lumped Elements for RF and Microwave Circuits", 2003.
   ========================================================================= */

const ETA0 = 376.730313668;   // free-space wave impedance, ohm
const C0 = 299792458;         // m/s
const EPS0 = 8.8541878128e-12;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ---------------------------------------------------------------------------
   Complete elliptic integral ratio K(k)/K(k'), Hilberg's closed form.
   Accurate to a few parts in 10^-8 across the whole range, and free of the
   iteration a direct AGM would need inside a synthesis loop.
   ------------------------------------------------------------------------ */
export function ellipticRatio(k) {
  k = clamp(k, 0, 1 - 1e-15);
  const kp = Math.sqrt(1 - k * k);
  if (k <= Math.SQRT1_2) {
    const r = Math.sqrt(kp);
    return Math.PI / Math.log(2 * (1 + r) / (1 - r));
  }
  const r = Math.sqrt(k);
  return Math.log(2 * (1 + r) / (1 - r)) / Math.PI;
}

/* ---------------------------------------------------------------------------
   Single microstrip line
   ------------------------------------------------------------------------ */

/* Air-filled ("homogeneous") impedance of a strip over a ground plane. */
function z01(u) {
  const F = 6 + (2 * Math.PI - 6) * Math.exp(-Math.pow(30.666 / u, 0.7528));
  return (ETA0 / (2 * Math.PI)) * Math.log(F / u + Math.sqrt(1 + Math.pow(2 / u, 2)));
}

/* Static effective permittivity, Hammerstad–Jensen. */
function epsEffStatic(u, er) {
  const a = 1
    + Math.log((Math.pow(u, 4) + Math.pow(u / 52, 2)) / (Math.pow(u, 4) + 0.432)) / 49
    + Math.log(1 + Math.pow(u / 18.1, 3)) / 18.7;
  const b = 0.564 * Math.pow((er - 0.9) / (er + 3), 0.053);
  return (er + 1) / 2 + ((er - 1) / 2) * Math.pow(1 + 10 / u, -a * b);
}

/* Finite copper thickness widens the strip electrically. Two corrections:
   one for the air case and a smaller one for the dielectric case. */
function thicknessCorrection(u, t_h, er) {
  if (t_h <= 0) return { u1: u, ur: u };
  const coth = Math.cosh(Math.sqrt(6.517 * u)) / Math.sinh(Math.sqrt(6.517 * u));
  const du1 = (t_h / Math.PI) * Math.log(1 + (4 * Math.E) / (t_h * coth * coth));
  const dur = 0.5 * (1 + 1 / Math.cosh(Math.sqrt(Math.max(er - 1, 0)))) * du1;
  return { u1: u + du1, ur: u + dur };
}

/**
 * Analyse a microstrip line.
 * @param {number} w  strip width, mm
 * @param {number} h  substrate height to the reference plane, mm
 * @param {number} er relative permittivity
 * @param {object} opt {t: copper thickness mm, f: frequency Hz, tanD, rho}
 */
export function microstrip(w, h, er, opt = {}) {
  const u = clamp(w / Math.max(h, 1e-9), 1e-4, 1e4);
  const t_h = (opt.t || 0) / Math.max(h, 1e-9);
  const { u1, ur } = thicknessCorrection(u, t_h, er);

  const ee0 = epsEffStatic(ur, er);
  const Z0static = z01(u1) / Math.sqrt(ee0);

  const f = opt.f || 0;
  let ee = ee0;
  let Z0 = Z0static;
  if (f > 0) {
    // Getsinger: fp is the frequency at which the fields begin to concentrate
    // in the dielectric.
    const fp = Z0static / (2 * 4e-7 * Math.PI * (h * 1e-3));
    const G = 0.6 + 0.009 * Z0static;
    const x = f / fp;
    ee = er - (er - ee0) / (1 + G * x * x);
    // Impedance dispersion follows the permittivity, holding the line
    // capacitance at its quasi-static value.
    Z0 = Z0static * Math.sqrt(ee0 / ee);
  }

  const lambda = f > 0 ? C0 / (f * Math.sqrt(ee)) * 1e3 : Infinity;   // mm

  // Losses, per metre. Conductor loss uses the surface resistance of the
  // strip with a Hammerstad roughness-free assumption; dielectric loss is the
  // standard filling-factor expression.
  let alphaC = 0, alphaD = 0;
  if (f > 0) {
    const rho = opt.rho || 1.724e-8;
    const mu0 = 4e-7 * Math.PI;
    const Rs = Math.sqrt(Math.PI * f * mu0 * rho);
    alphaC = Rs / (Z0 * (w * 1e-3));                       // Np/m
    const tanD = opt.tanD || 0;
    if (tanD > 0) {
      const q = (ee - 1) / (er - 1);                       // filling factor
      alphaD = (Math.PI * f / C0) * q * er / Math.sqrt(ee) * tanD;
    }
  }

  return {
    w, h, er, u,
    epsEff: ee, epsEffStatic: ee0,
    Z0, Z0static,
    lambda,
    alphaC, alphaD, alpha: alphaC + alphaD,
    /* Physical length for an electrical length in degrees. */
    lengthForDegrees: (deg) => (lambda === Infinity ? NaN : lambda * deg / 360),
    /* Radians of electrical length for a physical length in mm. */
    thetaFor: (lenMM) => (lambda === Infinity ? 0 : 2 * Math.PI * lenMM / lambda),
  };
}

/**
 * Width (mm) that gives a target characteristic impedance.
 * Z0 falls monotonically with width, so a bisection is both safe and fast.
 */
export function microstripWidth(Z0target, h, er, opt = {}) {
  let lo = h * 0.02, hi = h * 60;
  const f = (w) => microstrip(w, h, er, opt).Z0;
  if (f(lo) < Z0target) return lo;      // even a hair-thin trace is too low
  if (f(hi) > Z0target) return hi;      // even a very wide trace is too high
  for (let i = 0; i < 60; i++) {
    const mid = Math.sqrt(lo * hi);     // geometric bisection: w spans decades
    if (f(mid) > Z0target) lo = mid; else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

/* ---------------------------------------------------------------------------
   Coupled microstrip — even and odd mode impedances

   Built from modal capacitances rather than curve fits to Z0e/Z0o directly.
   The capacitance decomposition is physically legible (parallel plate, plus
   fringe to the outside, plus the gap terms) and it degrades sensibly at wide
   spacing, where the fitted forms tend to misbehave.
   ------------------------------------------------------------------------ */

function modalCapacitances(w, s, h, er) {
  const W = w / h, S = s / h;

  const single = microstrip(w, h, er, {});
  const singleAir = microstrip(w, h, 1, {});

  // Parallel-plate term
  const Cp = EPS0 * er * W;

  // Fringe to the outside edge, from the single-line solution
  const Cf = 0.5 * (Math.sqrt(single.epsEffStatic) / (C0 * single.Z0static) - Cp);

  // Even mode: the outer fringe is modified by the presence of the neighbour
  const A = Math.exp(-0.1 * Math.exp(2.33 - 2.53 * W));
  const Cfe = Cf / (1 + A * (1 / S) * Math.tanh(10 * S)) * Math.sqrt(er / single.epsEffStatic);

  // Odd mode: coupling through the air gap and through the substrate
  const k = S / (S + 2 * W);
  // ellipticRatio(x) is K(x)/K(x'), so passing k' gives the K(k')/K(k) the
  // coplanar gap capacitance is written in terms of.
  const Cga = EPS0 * ellipticRatio(Math.sqrt(1 - k * k));
  const Cgd = (EPS0 * er / Math.PI) * Math.log(
    Math.cosh(Math.PI * S / 4) / Math.sinh(Math.PI * S / 4) + 1e-30,
  ) + 0.65 * Cf * (0.02 * Math.sqrt(er) / S + 1 - Math.pow(er, -2));

  const Ce = Cp + Cf + Cfe;
  const Co = Cp + Cf + Cga + Cgd;

  // Air-filled counterparts set the mode velocities
  const CpA = EPS0 * W;
  const CfA = 0.5 * (1 / (C0 * singleAir.Z0static) - CpA);
  const CfeA = CfA / (1 + A * (1 / S) * Math.tanh(10 * S));
  const CgdA = (EPS0 / Math.PI) * Math.log(
    Math.cosh(Math.PI * S / 4) / Math.sinh(Math.PI * S / 4) + 1e-30,
  ) + 0.65 * CfA * (0.02 / S);
  const CeA = CpA + CfA + CfeA;
  const CoA = CpA + CfA + Cga + CgdA;

  return { Ce, Co, CeA, CoA };
}

/**
 * Even/odd mode impedances and permittivities of a symmetric coupled pair.
 * @param {number} w  strip width, mm
 * @param {number} s  edge-to-edge gap, mm
 */
export function coupledMicrostrip(w, s, h, er, opt = {}) {
  const { Ce, Co, CeA, CoA } = modalCapacitances(w, Math.max(s, 1e-6), h, er);
  const Z0e = 1 / (C0 * Math.sqrt(Math.max(Ce * CeA, 1e-30)));
  const Z0o = 1 / (C0 * Math.sqrt(Math.max(Co * CoA, 1e-30)));
  const eEe = Ce / Math.max(CeA, 1e-30);
  const eEo = Co / Math.max(CoA, 1e-30);

  const f = opt.f || 0;
  const lamE = f > 0 ? (C0 / (f * Math.sqrt(eEe))) * 1e3 : Infinity;
  const lamO = f > 0 ? (C0 / (f * Math.sqrt(eEo))) * 1e3 : Infinity;
  // Coupled-section length is normally set from the mean of the two mode
  // wavelengths; using either one alone skews the passband centre.
  const lamMean = f > 0 ? (lamE + lamO) / 2 : Infinity;

  return {
    w, s, Z0e, Z0o,
    epsEffEven: eEe, epsEffOdd: eEo,
    Z0: Math.sqrt(Z0e * Z0o),
    coupling: (Z0e - Z0o) / (Z0e + Z0o),
    lambdaEven: lamE, lambdaOdd: lamO, lambda: lamMean,
    quarterWave: lamMean === Infinity ? NaN : lamMean / 4,
  };
}

/**
 * Solve for the (w, s) that realise a target Z0e / Z0o pair.
 *
 * Nested bisection: the outer loop moves the gap, which controls the spread
 * Z0e − Z0o, and the inner loop moves the width to hold the geometric mean
 * sqrt(Z0e·Z0o). The two knobs are close to orthogonal in that parameterisation,
 * which is what makes the nesting converge instead of chasing its tail.
 */
export function synthCoupled(Z0eTarget, Z0oTarget, h, er, opt = {}) {
  const targetMean = Math.sqrt(Z0eTarget * Z0oTarget);
  const targetSpread = Z0eTarget - Z0oTarget;

  const widthFor = (s) => {
    let lo = h * 0.02, hi = h * 20;
    for (let i = 0; i < 44; i++) {
      const w = Math.sqrt(lo * hi);
      const r = coupledMicrostrip(w, s, h, er, opt);
      if (r.Z0 > targetMean) lo = w; else hi = w;
    }
    return Math.sqrt(lo * hi);
  };

  let sLo = h * 0.01, sHi = h * 12;
  let best = null, bestErr = Infinity;
  for (let i = 0; i < 40; i++) {
    const s = Math.sqrt(sLo * sHi);
    const w = widthFor(s);
    const r = coupledMicrostrip(w, s, h, er, opt);
    const spread = r.Z0e - r.Z0o;
    const err = Math.abs(spread - targetSpread) / Math.max(targetSpread, 1e-9);
    if (err < bestErr) { bestErr = err; best = { ...r, w, s }; }
    // Wider gap -> weaker coupling -> smaller spread.
    if (spread > targetSpread) sLo = s; else sHi = s;
  }
  return {
    ...best,
    error: bestErr,
    converged: bestErr < 0.05,
    Z0eTarget, Z0oTarget,
  };
}

/* ---------------------------------------------------------------------------
   Planar lumped elements
   ------------------------------------------------------------------------ */

/**
 * Interdigital capacitor.
 *
 * Treated as (N−1) coplanar-strip gaps in parallel, each contributing the
 * conformal-mapping capacitance per unit length, plus an end-fringe term for
 * the finger tips. That is the structure of Alley's classic expression, kept
 * in explicit SI so every term can be checked rather than trusted.
 *
 * @param {object} p {fingers, length mm, width mm, gap mm, er, h mm, t mm}
 */
export function interdigitalCap(p) {
  const N = Math.max(2, Math.round(p.fingers));
  const l = Math.max(p.length, 1e-6) * 1e-3;      // m
  const w = Math.max(p.width, 1e-6) * 1e-3;
  const g = Math.max(p.gap, 1e-6) * 1e-3;
  const er = p.er || 4.4;

  // Coplanar strips on a thick substrate see the average of both half-spaces.
  const epsEff = (er + 1) / 2;
  const k = g / (g + 2 * w);
  const kp = Math.sqrt(Math.max(0, 1 - k * k));
  // Coplanar-strip capacitance per unit length is eps0*epsEff*K(k')/K(k),
  // and ellipticRatio(k') is exactly that ratio.
  const CperLen = EPS0 * epsEff * ellipticRatio(kp);

  const Cgaps = (N - 1) * l * CperLen;
  // Finger ends: roughly one extra gap-width of coupling at each tip.
  const Cend = (N - 1) * EPS0 * epsEff * w * 0.5;
  const C = Cgaps + Cend;

  // Series parasitics: the fingers are also conductors.
  const t = Math.max(p.t || 0.035, 1e-3) * 1e-3;
  const rho = p.rho || 1.724e-8;
  const Rs = rho * l / (w * t) / Math.max(N, 1) * 0.5;
  // Self inductance of the finger array, as a short wide strip.
  const Lpar = 2e-7 * l * (Math.log(2 * l / (w + t)) + 0.5 + 0.2235 * (w + t) / l);

  const srf = 1 / (2 * Math.PI * Math.sqrt(Math.max(C * Lpar, 1e-30)));
  return {
    C, Cgaps, Cend, Rs, L: Lpar, srf,
    area: (N * p.width + (N - 1) * p.gap) * p.length,   // mm^2
    span: N * p.width + (N - 1) * p.gap,                // mm across the fingers
    fingers: N,
  };
}

/** Fingers needed for a target capacitance at a fixed finger geometry. */
export function interdigitalFingersFor(targetC, p) {
  let best = 2, bestErr = Infinity;
  for (let n = 2; n <= 220; n++) {
    const c = interdigitalCap({ ...p, fingers: n }).C;
    const err = Math.abs(c - targetC);
    if (err < bestErr) { bestErr = err; best = n; }
    if (c > targetC) break;
  }
  return best;
}

/**
 * Parallel-plate capacitor between two copper layers.
 * The fringe term is the standard first-order edge correction; it matters at
 * the small plate sizes a filter actually uses.
 */
export function plateCap(p) {
  const wm = p.width * 1e-3, lm = p.length * 1e-3, hm = Math.max(p.h, 1e-4) * 1e-3;
  const er = p.er || 4.4;
  const Cpp = EPS0 * er * (wm * lm) / hm;
  const perim = 2 * (wm + lm);
  const Cfr = EPS0 * er * perim * (1 + Math.log(1 + hm / Math.max(hm, 1e-9))) * 0.5;
  const C = Cpp + Cfr * 0.4;
  const rho = p.rho || 1.724e-8;
  const t = Math.max(p.t || 0.035, 1e-3) * 1e-3;
  const Rs = rho * lm / (wm * t) / 3;      // distributed plate resistance
  const L = 2e-7 * lm * (Math.log(2 * lm / (wm + t)) + 0.5);
  return { C, Cpp, Cfringe: C - Cpp, Rs, L, srf: 1 / (2 * Math.PI * Math.sqrt(Math.max(C * L, 1e-30))) };
}

/** Plate area (mm^2) for a target capacitance across a given dielectric. */
export function plateAreaFor(targetC, hMM, er) {
  return (targetC * (hMM * 1e-3)) / (EPS0 * er) * 1e6;   // mm^2
}

/* Quarter-wave and guided-wavelength helpers used by the layout generators. */
export function guidedWavelength(f, epsEff) {
  return (C0 / (f * Math.sqrt(Math.max(epsEff, 1)))) * 1e3;   // mm
}

export const CONSTANTS = { ETA0, C0, EPS0 };
