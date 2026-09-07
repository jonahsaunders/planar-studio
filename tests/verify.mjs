/* ============================================================================
   NUMERICAL VALIDATION

   Every claim the tool makes about accuracy is checked here against something
   independent: a closed form, an elliptic-integral exact result, or a
   published table. The tolerances are asserted, not printed — a regression
   that moves the single-loop result by 2 % fails the run rather than scrolling
   past in the log.

   Where a reference carries its own error (the Mohan current-sheet expression
   is fitted, with roughly ±3–8 % of spread), the tolerance is set to the
   reference's own uncertainty and the row is marked as agreement rather than
   accuracy.

       node tests/verify.mjs
   ========================================================================= */

import {
  MU0, buildCoil, analyse, motorAnalysis, toFilaments, inductanceOf, mutualOf,
  discretisationCorrection, currentSheetL, wheelerL, solveCoilForL, ipcCurrent,
  dowellFr, skinDepth,
} from '../web/js/engine/coil.js';
import {
  prototype, ladder, respond, steppedImpedance, edgeCoupled, hairpin,
  interdigitalFilter, emiFilter,
} from '../web/js/engine/filter.js';
import {
  microstrip, microstripWidth, coupledMicrostrip, synthCoupled, interdigitalCap,
  ellipticRatio,
} from '../web/js/engine/microstrip.js';
import { defaultContext, layoutFilter } from '../web/js/engine/filtergeom.js';
import { buildArtwork } from '../web/js/engine/coilgeom.js';
import { bounds, toKicad } from '../web/js/engine/artwork.js';
import { exportKicadMod, exportKicadPcb, exportSvg, exportDxf } from '../web/js/engine/exporters.js';

const TAU = Math.PI * 2;
let pass = 0, fail = 0;
const rows = [];

function check(name, got, want, tolPct, note = '') {
  const err = want === 0 ? Math.abs(got) : (got / want - 1) * 100;
  const ok = Math.abs(err) <= tolPct;
  rows.push({ name, got, want, err, tolPct, ok, note });
  if (ok) pass++; else fail++;
  const mark = ok ? '  ok  ' : ' FAIL ';
  console.log(`${mark} ${name.padEnd(46)} ${fmt(got).padStart(12)} vs ${fmt(want).padStart(12)}  ${err >= 0 ? '+' : ''}${err.toFixed(2)}%  (±${tolPct}%)${note ? '  ' + note : ''}`);
}

function assert(name, condition, detail = '') {
  if (condition) pass++; else fail++;
  console.log(`${condition ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
}

const fmt = (v) => {
  if (!isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a >= 1e4 || (a < 1e-3 && a > 0)) return v.toExponential(3);
  return v.toPrecision(6);
};

const section = (t) => console.log(`\n── ${t} ${'─'.repeat(Math.max(0, 70 - t.length))}`);

/* Complete elliptic integrals by AGM, for the exact mutual-inductance case. */
function ellipK(k) {
  let a = 1, b = Math.sqrt(1 - k * k);
  for (let i = 0; i < 60; i++) { const an = (a + b) / 2; b = Math.sqrt(a * b); a = an; }
  return Math.PI / (2 * a);
}
function ellipE(k) {
  let a = 1, b = Math.sqrt(1 - k * k), c = k, sum = c * c / 2, p = 1;
  for (let i = 0; i < 60; i++) {
    const an = (a + b) / 2; c = (a - b) / 2; b = Math.sqrt(a * b); a = an;
    p *= 2; sum += p * c * c / 2;
    if (Math.abs(c) < 1e-16) break;
  }
  return ellipK(k) * (1 - sum);
}

function circleLoop(R, n, z = 0) {
  const p = [];
  for (let i = 0; i <= n; i++) { const a = TAU * i / n; p.push([R * Math.cos(a), R * Math.sin(a), z]); }
  return p;
}

function baseCfg(o) {
  return {
    shape: 'circle', dOuter: 30, dInner: 8, turns: 10, traceW: 0.4, traceS: 0.4,
    layers: 1, copperOz: 1, boardT: 1.6, epsR: 4.4, ppt: 180, sides: 4, fillet: 0,
    aspect: 1, cornerR: 3, spanDeg: 24, sfM: 5, sfN1: 0.6, sfN2: 0.3, sfN3: 0.3,
    customPoly: null, connection: 'series', tempC: 25, freq: 1e6, current: 1,
    cExtra: 0, viaDrill: 0.3, viaPad: 0.6, padSize: 1.4, padDrill: 0.8,
    arrayEnabled: false, polePairs: 7, phases: 3, coilCount: 12,
    coilSeries: true, bGap: 0.35, rpm: 3000, vdc: 24, busEnabled: true,
    ...o,
  };
}

/* ==========================================================================
   1.  INDUCTANCE SOLVER
   ======================================================================= */

section('Partial-inductance solver against closed forms');

{
  // A single circular loop has an exact answer: L = mu0*R*(ln(8R/GMD) - 2).
  const R = 10, w = 0.5, t = 0.035;
  const gmd = 0.2235 * (w + t);
  const exact = MU0 * (R * 1e-3) * (Math.log(8 * R / gmd) - 2);
  const corr = discretisationCorrection(0.25e-3, w * 1e-3, t * 1e-3);
  const F = toFilaments([circleLoop(R, 720)], 0.25, 20000);
  const L = inductanceOf(F, w * 1e-3, t * 1e-3, corr);
  check('single circular loop, 10 mm', L, exact, 0.5, 'closed form');
}

{
  // Mutual between two coaxial loops has Maxwell's elliptic-integral answer.
  const R = 10, w = 0.5, t = 0.035, gap = 1.0;
  const FA = toFilaments([circleLoop(R, 720)], 0.3, 20000);
  const FB = toFilaments([circleLoop(R, 720, gap)], 0.3, 20000);
  const M = mutualOf(FA, FB, Math.pow(0.2235 * (w + t) * 1e-3, 2));
  const Rm = R * 1e-3, d = gap * 1e-3;
  const k = Math.sqrt(4 * Rm * Rm / (4 * Rm * Rm + d * d));
  const Mex = MU0 * Rm * ((2 / k - k) * ellipK(k) - (2 / k) * ellipE(k));
  check('coaxial loop mutual, 1 mm apart', M, Mex, 1.0, 'Maxwell elliptic');
}

{
  // Convergence: halving the segment length must not move the answer much.
  const R = 10, w = 0.5, t = 0.035;
  const solve = (sl) => {
    const corr = discretisationCorrection(sl * 1e-3, w * 1e-3, t * 1e-3);
    return inductanceOf(toFilaments([circleLoop(R, 1440)], sl, 40000), w * 1e-3, t * 1e-3, corr);
  };
  const coarse = solve(0.8), fine = solve(0.15);
  check('discretisation independence 0.8 vs 0.15 mm', coarse, fine, 0.6);
}

section('Planar spirals against the Mohan current-sheet expression');

for (const c of [
  { shape: 'polygon', sides: 4, dOut: 30, turns: 10, w: 0.5, s: 0.5, tol: 9 },
  { shape: 'polygon', sides: 4, dOut: 20, turns: 8, w: 0.3, s: 0.3, tol: 9 },
  { shape: 'polygon', sides: 4, dOut: 40, turns: 20, w: 0.4, s: 0.4, tol: 9 },
  { shape: 'circle', sides: 0, dOut: 30, turns: 12, w: 0.4, s: 0.4, tol: 6 },
  { shape: 'circle', sides: 0, dOut: 15, turns: 6, w: 0.25, s: 0.25, tol: 6 },
]) {
  const cfg = baseCfg({ shape: c.shape, sides: c.sides || 4, dOuter: c.dOut, turns: c.turns, traceW: c.w, traceS: c.s, layers: 1, fillet: 0 });
  const coil = buildCoil(cfg);
  const a = analyse(cfg, coil, { segmentCap: 12000 });
  const Lcs = currentSheetL(c.shape, c.sides || 4, a.turns, coil.dOutFlat * 1e-3, coil.dInFlat * 1e-3);
  check(`${c.shape} ⌀${c.dOut} ${c.turns}T vs current sheet`, a.L, Lcs, c.tol, 'agreement, not accuracy');
}

section('Multilayer stacking');

{
  const results = [];
  for (const nl of [1, 2, 4, 8]) {
    const cfg = baseCfg({ dOuter: 30, turns: 10, traceW: 0.4, traceS: 0.4, layers: nl, boardT: 1.6 });
    const coil = buildCoil(cfg);
    const a = analyse(cfg, coil, { segmentCap: 6000 });
    results.push({ nl, L: a.L, k: a.k, ratio: a.L / (a.Lsingle * nl * nl) });
  }
  // Tightly coupled series layers approach n^2. On a 1.6 mm board with eight
  // layers the coupling is high but not unity, so the ratio sits below 1.
  for (const r of results.slice(1)) {
    assert(`layers=${r.nl}: L/(n²·L₁) in (0.55, 1.0]`, r.ratio > 0.55 && r.ratio <= 1.0, `ratio ${r.ratio.toFixed(3)}, k ${r.k.toFixed(3)}`);
  }
  assert('series stacking increases inductance monotonically',
    results.every((r, i) => i === 0 || r.L > results[i - 1].L),
    results.map((r) => `${r.nl}L:${(r.L * 1e6).toFixed(2)}µH`).join(' '));
}

section('Inverse design: whole turns, trimmed diameter');

for (const target of [20e-9, 91.26e-9, 400e-9, 1e-6]) {
  const cfg = baseCfg({ shape: 'racetrack', dOuter: 12, dInner: 4, traceW: 0.25, traceS: 0.2, layers: 2, cornerR: 2, aspect: 1 });
  const sol = solveCoilForL(cfg, target, { dMax: 12, dMin: 3 });
  check(`solve for ${(target * 1e9).toFixed(1)} nH`, sol.L, target, 1.5,
    `${sol.turns.toFixed(0)} turns, ⌀${sol.dOuter.toFixed(2)} mm`);
  assert(`  turn count is whole`, Math.abs(sol.turns - Math.round(sol.turns)) < 0.05, sol.turns.toFixed(3));
}

section('Loss and rating models');

{
  // Skin depth in copper at 1 MHz is a textbook 65-66 um.
  check('copper skin depth at 1 MHz', skinDepth(1e6, 1.724e-8) * 1e6, 65.2, 2, 'µm');
  // Dowell reduces to unity well below the skin-depth transition.
  check('Dowell Fr well below transition', dowellFr(1e3, 35e-6, 0.4e-3, 0.8e-3, 1, 1.724e-8), 1, 0.001);
  // IPC-2221: 1 oz, 1 mm wide, external, 10 K rise.
  const I = ipcCurrent(1.0, 0.0348, 10, true);
  assert('IPC-2221 1 mm 1 oz external ΔT=10 K in 1.5–3.5 A', I > 1.5 && I < 3.5, `${I.toFixed(2)} A`);
}

/* ==========================================================================
   2.  MICROSTRIP
   ======================================================================= */

section('Microstrip against published values');

{
  // 50 ohm on 1.6 mm FR-4 is famously about 3 mm.
  const w = microstripWidth(50, 1.6, 4.4, { t: 0.035, f: 1e9 });
  check('50 Ω width on 1.6 mm FR-4', w, 2.95, 6, 'mm');
  const ms = microstrip(w, 1.6, 4.4, { t: 0.035, f: 1e9 });
  check('  its impedance back again', ms.Z0, 50, 1.5, 'Ω');
  assert('  effective εr between 1 and εr', ms.epsEff > 1 && ms.epsEff < 4.4, ms.epsEff.toFixed(3));

  // 50 ohm on 0.203 mm Rogers 4350B is about 0.44 mm.
  const w2 = microstripWidth(50, 0.203, 3.48, { t: 0.035, f: 2.4e9 });
  check('50 Ω width on 0.203 mm RO4350B', w2, 0.44, 12, 'mm');
}

{
  // Synthesis must invert analysis exactly, at every impedance.
  let worst = 0;
  for (const z of [25, 50, 75, 100, 120]) {
    for (const h of [0.2, 0.8, 1.6]) {
      const w = microstripWidth(z, h, 4.4, { t: 0.035, f: 2e9 });
      const back = microstrip(w, h, 4.4, { t: 0.035, f: 2e9 }).Z0;
      worst = Math.max(worst, Math.abs(back / z - 1) * 100);
    }
  }
  assert('synthesis inverts analysis to <0.5 %', worst < 0.5, `worst ${worst.toFixed(3)} %`);
}

{
  const cp = coupledMicrostrip(1.5, 0.3, 1.6, 4.4, { f: 2e9 });
  // Reference for w/h≈0.94, s/h≈0.19 on FR-4: Z0e≈97 Ω, Z0o≈47 Ω.
  check('coupled Z0e (w 1.5, s 0.3, FR-4)', cp.Z0e, 97, 8, 'Ω');
  check('coupled Z0o (w 1.5, s 0.3, FR-4)', cp.Z0o, 47, 10, 'Ω');
  assert('  even mode is slower than odd', cp.epsEffEven > cp.epsEffOdd, `${cp.epsEffEven.toFixed(2)} > ${cp.epsEffOdd.toFixed(2)}`);

  const sol = synthCoupled(97, 47, 1.6, 4.4, { f: 2e9 });
  assert('coupled synthesis converges', sol.converged, `w ${sol.w.toFixed(3)} s ${sol.s.toFixed(3)}, err ${(sol.error * 100).toFixed(1)}%`);
}

{
  // K(k)/K(k') is 1 at k = 1/sqrt(2), by symmetry.
  check('elliptic ratio at k = 1/√2', ellipticRatio(Math.SQRT1_2), 1, 0.01);
}

/* ==========================================================================
   3.  FILTER SYNTHESIS
   ======================================================================= */

section('Prototype g-values against Matthaei tables');

{
  const b3 = prototype('butterworth', 3);
  check('Butterworth n=3 g1', b3[1], 1.0, 0.1);
  check('Butterworth n=3 g2', b3[2], 2.0, 0.1);

  const c3 = prototype('chebyshev', 3, 0.5);
  check('Chebyshev 0.5 dB n=3 g1', c3[1], 1.5963, 0.1);
  check('Chebyshev 0.5 dB n=3 g2', c3[2], 1.0967, 0.1);
  check('Chebyshev 0.5 dB n=3 g4', c3[4], 1.0, 0.1);

  const c4 = prototype('chebyshev', 4, 0.5);
  check('Chebyshev 0.5 dB n=4 g1', c4[1], 1.6703, 0.1);
  check('Chebyshev 0.5 dB n=4 g4', c4[4], 0.8419, 0.2);
  check('Chebyshev 0.5 dB n=4 g5 (load)', c4[5], 1.9841, 0.1);

  const c5 = prototype('chebyshev', 5, 0.1);
  check('Chebyshev 0.1 dB n=5 g1', c5[1], 1.1468, 0.2);
  check('Chebyshev 0.1 dB n=5 g3', c5[3], 1.9750, 0.2);

  const bs = prototype('bessel', 5);
  assert('Bessel g-values decrease monotonically',
    bs.slice(1, 6).every((g, i, arr) => i === 0 || g < arr[i - 1]), bs.slice(1, 6).map((g) => g.toFixed(3)).join(' '));
}

section('Band transforms and the simulated response');

{
  const lp = ladder({ response: 'chebyshev', order: 5, ripple: 0.1, band: 'lowpass', z0: 50, fc: 100e6, seriesFirst: true });
  const r = respond(lp, { f0: 1e6, f1: 1e9, points: 1601 });
  check('LP ripple equals the design ripple', r.metrics.rippleDb, 0.1, 5, 'dB');
  // Chebyshev return loss follows from the ripple: RL = -10log10(1-10^(-Ar/10)).
  const rlTheory = -10 * Math.log10(1 - Math.pow(10, -0.1 / 10));
  check('LP return loss matches the ripple', r.metrics.worstReturnLoss, rlTheory, 3, 'dB');
  // The ripple bandwidth edge is the design cut-off, exactly.
  const edge = r.metrics.fRipple[r.metrics.fRipple.length - 1];
  check('LP ripple band edge is fc', edge, 100e6, 1, 'Hz');
}

{
  const bp = ladder({ response: 'chebyshev', order: 3, ripple: 0.1, band: 'bandpass', z0: 50, f1: 900e6, f2: 1100e6 });
  const r = respond(bp, { f0: 3e8, f1: 3e9, points: 3001 });
  const lo = r.metrics.fRipple[0], hi = r.metrics.fRipple[r.metrics.fRipple.length - 1];
  check('BP lower ripple edge', lo, 900e6, 1, 'Hz');
  check('BP upper ripple edge', hi, 1100e6, 1, 'Hz');
  check('BP centre is the geometric mean', r.metrics.centreF, Math.sqrt(900e6 * 1100e6), 3, 'Hz');
}

{
  const bs = ladder({ response: 'butterworth', order: 3, band: 'bandstop', z0: 50, f1: 900e6, f2: 1100e6 });
  const r = respond(bs, { f0: 3e8, f1: 3e9, points: 2001 });
  let min = 0, minF = 0;
  r.s21db.forEach((v, i) => { if (v < min) { min = v; minF = r.freqs[i]; } });
  assert('BS notch is deeper than 60 dB', min < -60, `${min.toFixed(0)} dB`);
  check('BS notch sits at f0', minF, Math.sqrt(900e6 * 1100e6), 1, 'Hz');
}

{
  // Roll-off must follow 20n dB/decade well into the stopband.
  const lp = ladder({ response: 'butterworth', order: 4, band: 'lowpass', z0: 50, fc: 10e6 });
  const r = respond(lp, { f0: 1e8, f1: 1e9, points: 201 });
  const slope = (r.s21db[r.s21db.length - 1] - r.s21db[0]);   // one decade
  check('4th-order roll-off per decade', slope, -80, 4, 'dB');
}

section('EMI synthesis hits its attenuation target');

for (const topo of ['lc', 'pi', 'tee']) {
  const f = emiFilter({ topology: topo, zSource: 50, zLoad: 50, fTarget: 30e6, attnDb: 40 });
  check(`${topo} attenuation at the target`, f.achieved, 40, 1, 'dB');
}
{
  const f = emiFilter({ topology: 'tee', zSource: 2, zLoad: 2, fTarget: 1e6, attnDb: 60 });
  check('T network into 2 Ω, 60 dB target', f.achieved, 60, 1, 'dB');
  const cm = emiFilter({ topology: 'cm', lcm: 22e-6, coupling: 0.95, yCap: 2.2e-9 });
  check('CM choke common-mode inductance', cm.Lcm, 22e-6 * 1.95, 0.1, 'H');
  check('CM choke leakage inductance', cm.Ldm, 22e-6 * 0.05, 0.1, 'H');
}

section('Distributed filters');

{
  const sub = { h: 1.6, er: 4.4, t: 0.035, tanD: 0.02, minGap: 0.15 };
  const ec = edgeCoupled({ response: 'chebyshev', order: 3, ripple: 0.1, f1: 2.3e9, f2: 2.5e9, z0: 50 }, sub);
  const r = respond(ec, { f0: 1.2e9, f1: 4.5e9, points: 1201 });
  const f0 = Math.sqrt(2.3e9 * 2.5e9);
  check('edge-coupled centre frequency', r.metrics.centreF, f0, 3, 'Hz');
  assert('edge-coupled bandwidth runs wide (first-order synthesis)',
    r.metrics.bw3 > 200e6 && r.metrics.bw3 < 400e6, `${(r.metrics.bw3 / 1e6).toFixed(0)} MHz for a 200 MHz design`);
  assert('end sections couple more tightly than the middle',
    ec.sections[0].s < ec.sections[1].s, `${ec.sections[0].s.toFixed(3)} < ${ec.sections[1].s.toFixed(3)} mm`);

  const hp = hairpin({ response: 'chebyshev', order: 3, ripple: 0.1, f1: 2.3e9, f2: 2.5e9, z0: 50 }, sub);
  assert('hairpin arms are positive', hp.resonators.every((x) => x.armLen > 0), hp.resonators.map((x) => x.armLen.toFixed(2)).join(' '));

  // Insertion loss of a coupled-resonator filter follows the standard
  // expression IL ≈ 4.343·Σg/(FBW·Qu).
  for (const tanD of [0.02, 0.004]) {
    const idf = interdigitalFilter({ response: 'chebyshev', order: 4, ripple: 0.1, f1: 2.3e9, f2: 2.6e9, z0: 50, zRes: 60 }, { ...sub, tanD });
    const rr = respond(idf, { f0: 1.5e9, f1: 4e9, points: 1201 });
    const D = (2.6e9 - 2.3e9) / Math.sqrt(2.3e9 * 2.6e9);
    const sumG = idf.g.slice(1, 5).reduce((a, b) => a + b, 0);
    const theory = 4.343 * sumG / (D * idf.Qu);
    check(`interdigital IL, tanδ=${tanD}`, rr.metrics.insertionLoss, theory, 25, `Qu ${idf.Qu.toFixed(0)}`);
  }
  // FR-4's dielectric loss alone caps the unloaded Q at 1/tanδ.
  const idf = interdigitalFilter({ response: 'chebyshev', order: 4, ripple: 0.1, f1: 2.3e9, f2: 2.6e9, z0: 50, zRes: 60 }, sub);
  check('resonator Qu on FR-4 ≈ 1/tanδ', idf.Qu, 50, 12);
}

{
  const sub = { h: 1.6, er: 4.4, t: 0.035, tanD: 0.02, minGap: 0.15 };
  const si = steppedImpedance({ response: 'chebyshev', order: 5, ripple: 0.1, fc: 2e9, z0: 50, zHigh: 110, zLow: 20, seriesFirst: true }, sub);
  const r = respond(si, { f0: 2e8, f1: 8e9, points: 1201 });
  assert('stepped-impedance corner lands near the design',
    r.metrics.cutoff > 1.8e9 && r.metrics.cutoff < 2.8e9, `${(r.metrics.cutoff / 1e9).toFixed(3)} GHz`);
  assert('high-Z sections are narrower than low-Z',
    si.sections.filter((s) => s.role === 'L')[0].w < si.sections.filter((s) => s.role === 'C')[0].w);
}

section('Planar passive components');

{
  // An interdigital capacitor's value must scale with finger count.
  const base = { length: 3, width: 0.2, gap: 0.2, er: 4.4, h: 1.6, t: 0.035 };
  const c8 = interdigitalCap({ ...base, fingers: 8 }).C;
  const c16 = interdigitalCap({ ...base, fingers: 16 }).C;
  check('interdigital C doubles with finger count', c16 / c8, 16 / 8 * (15 / 7) / (16 / 8), 12, 'gap count scaling');
  assert('interdigital C is in the picofarad range', c8 > 0.1e-12 && c8 < 20e-12, `${(c8 * 1e12).toFixed(2)} pF`);
  assert('interdigital SRF is above the useful band', interdigitalCap({ ...base, fingers: 8 }).srf > 1e9);
}

/* ==========================================================================
   4.  GEOMETRY AND OUTPUT
   ======================================================================= */

section('Geometry sanity across every family');

for (const shape of ['circle', 'polygon', 'racetrack', 'log', 'wedge', 'super', 'custom']) {
  const cfg = baseCfg({ shape, dOuter: 30, dInner: 12, turns: 8, spanDeg: 28, traceW: 0.4, traceS: 0.4, layers: 2 });
  const coil = buildCoil(cfg);
  const a = analyse(cfg, coil, { segmentCap: 4000 });
  const art = buildArtwork(cfg, coil, { name: shape });
  const b = bounds(art);
  const finite = art.tracks.every((t) => t.pts.every((p) => isFinite(p[0]) && isFinite(p[1])));
  assert(`${shape.padEnd(10)} builds clean geometry`,
    finite && isFinite(b.w) && b.w > 0 && a.L > 0 && isFinite(a.Rdc),
    `${coil.spiral.path.length} pts, L=${(a.L * 1e6).toFixed(3)} µH, ${b.w.toFixed(1)}×${b.h.toFixed(1)} mm`);
}

section('Stator arraying and the motor model');

{
  const cfg = baseCfg({
    shape: 'wedge', arrayEnabled: true, dOuter: 60, dInner: 26, spanDeg: 26,
    turns: 9, layers: 4, traceW: 0.3, traceS: 0.2, coilCount: 12, phases: 3,
    // A compatible repeating schedule; cancellation is tested separately.
    polePairs: 8, bGap: 0.45, current: 6, rpm: 3000, vdc: 24,
  });
  const coil = buildCoil(cfg);
  const a = analyse(cfg, coil, { segmentCap: 3000 });
  const m = motorAnalysis(cfg, coil, a);
  const art = buildArtwork(cfg, coil, { name: 'stator' });

  assert('twelve coils are placed', art.meta.instances === 12, String(art.meta.instances));
  assert('three phase nets exist', new Set(art.tracks.map((t) => t.net).filter(Boolean)).size >= 3,
    [...new Set(art.tracks.map((t) => t.net))].join(' '));
  assert('winding factor is physical', m.kw > 0 && m.kw <= 1, m.kw.toFixed(4));
  // Kt and Ke are the same constant in SI: Kt = 1.5*p*lambda, Ke = p*lambda.
  check('Kt / Ke ratio is 1.5', m.Kt / m.KeMech, 1.5, 0.01);
  // Kv and Ke are reciprocal through 60/2π.
  check('Kv from Ke', m.Kv, 60 / (TAU * m.KeMech), 0.01, 'rpm/V');
  assert('no-load speed exceeds the operating point', m.noLoad > 0, `${m.noLoad.toFixed(0)} rpm`);
}

section('Exporters');

{
  const cfg = baseCfg({ shape: 'circle', dOuter: 20, turns: 6, layers: 2 });
  const coil = buildCoil(cfg);
  const art = buildArtwork(cfg, coil, { name: 'TESTCOIL' });

  const mod = exportKicadMod(art, { name: 'TESTCOIL' });
  assert('footprint is a balanced s-expression', balanced(mod), `${mod.length} bytes`);
  assert('footprint declares its layers', /\(layer "F\.Cu"\)/.test(mod));
  assert('footprint contains pads', /\(pad "1"/.test(mod));

  const pcb = exportKicadPcb(art, { boardThickness: 1.6 });
  assert('board is a balanced s-expression', balanced(pcb), `${pcb.length} bytes`);
  assert('board declares net 0 first', /\(net 0 ""\)/.test(pcb));
  assert('board emits segments', (pcb.match(/\(segment /g) || []).length > 100);

  const svg = exportSvg(art, { name: 'TESTCOIL' });
  assert('SVG is well-formed enough to open', svg.startsWith('<svg') && svg.trim().endsWith('</svg>'));
  assert('SVG has no NaN coordinates', !/NaN/.test(svg));

  const dxf = exportDxf(art);
  assert('DXF ends with EOF', dxf.trim().endsWith('EOF'));
  assert('DXF has no NaN coordinates', !/NaN/.test(dxf));

  const payload = toKicad(art, { tolerance: 0.004 });
  assert('KiCad payload flips Y exactly once', payload.tracks.length > 0
    && Math.abs(payload.tracks[0].pts[0][1] + art.tracks[0].pts[0][1]) < 1e-9);
  assert('payload carries vias and terminals', payload.vias.length >= 2, `${payload.vias.length} vias`);
  assert('payload has no NaN', payload.tracks.every((t) => t.pts.every((p) => isFinite(p[0]) && isFinite(p[1]))));
}

function balanced(text) {
  let depth = 0, inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && text[i - 1] !== '\\') inStr = !inStr;
    if (inStr) continue;
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth < 0) return false; }
  }
  return depth === 0;
}

section('Filter layouts produce placeable copper');

{
  const sub = { h: 1.6, er: 4.4, t: 0.035, tanD: 0.02, minGap: 0.15 };
  const ctx = defaultContext({ ...sub, layers: ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'] });
  const designs = {
    'lumped LP': ladder({ response: 'chebyshev', order: 5, ripple: 0.1, band: 'lowpass', z0: 50, fc: 100e6, seriesFirst: true }),
    stepped: steppedImpedance({ response: 'chebyshev', order: 5, ripple: 0.1, fc: 2e9, z0: 50, zHigh: 100, zLow: 25, seriesFirst: true }, sub),
    'edge-coupled': edgeCoupled({ response: 'chebyshev', order: 3, ripple: 0.1, f1: 2.3e9, f2: 2.5e9, z0: 50 }, sub),
    hairpin: hairpin({ response: 'chebyshev', order: 3, ripple: 0.1, f1: 2.3e9, f2: 2.5e9, z0: 50 }, sub),
    interdigital: interdigitalFilter({ response: 'chebyshev', order: 4, ripple: 0.1, f1: 2.3e9, f2: 2.6e9, z0: 50, zRes: 60 }, sub),
    'CM choke': emiFilter({ topology: 'cm', lcm: 10e-6, coupling: 0.95, yCap: 2.2e-9 }),
  };
  for (const [name, d] of Object.entries(designs)) {
    const art = layoutFilter(d, ctx);
    const b = bounds(art);
    const finite = art.tracks.every((t) => t.pts.every((p) => isFinite(p[0]) && isFinite(p[1])));
    const hasPorts = art.ports.length >= 2;
    assert(`${name.padEnd(14)} lays out`, finite && hasPorts && b.w > 0 && b.w < 2000,
      `${b.w.toFixed(1)}×${b.h.toFixed(1)} mm, ${art.tracks.length} tracks, ${art.vias.length} vias`);
  }
}

section('Solver timing at the interactive cap');

{
  const cfg = baseCfg({ shape: 'circle', dOuter: 40, turns: 25, traceW: 0.25, traceS: 0.25, layers: 4 });
  const coil = buildCoil(cfg);
  const t0 = Date.now();
  analyse(cfg, coil, { segmentCap: 3600 });
  const ms = Date.now() - t0;
  assert('full solve under 400 ms at the UI cap', ms < 400, `${ms} ms`);
}

/* ======================================================================= */

console.log(`\n${'═'.repeat(78)}`);
console.log(`${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:');
  for (const r of rows.filter((x) => !x.ok)) {
    console.log(`  ${r.name}: got ${fmt(r.got)}, expected ${fmt(r.want)} ±${r.tolPct}% (off by ${r.err.toFixed(2)}%)`);
  }
}
process.exitCode = fail ? 1 : 0;
