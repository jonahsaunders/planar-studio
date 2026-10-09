/* Geometry-based, narrowband hairpin equivalent. Dimensions are in mm.
 *
 * The semicircular bend belongs to the resonator's centerline length. Tap
 * distance is measured ALONG that centerline from its midpoint, not from an
 * open end. Layout and simulation must use the same clamped tap coordinates.
 *
 * Adjacent-arm coupling is a first-order energy-overlap estimate using the
 * even/odd modal capacitance and inductance of coupledMicrostrip. It is not an
 * EM extraction of a folded resonator: open-end fringing, intra-resonator
 * coupling, bend loading, feed discontinuities and nonadjacent coupling are
 * omitted. See docs/engineering-models.md for the model and its limits.
 */
import { coupledMicrostrip } from './microstrip.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const hairpinBendLength = (r) => Math.PI * (r.armGap + r.w) / 2;
export const hairpinLength = (r) => 2 * r.armLen + hairpinBendLength(r);

export function hairpinTap(r, tap, feedWidth, z0) {
  const halfLength = hairpinLength(r) / 2;
  const requested = tap.length;
  if (!(requested >= 0) || !Number.isFinite(requested)) throw new Error('Hairpin tap distance must be finite and nonnegative.');
  const margin = feedWidth / 2;
  if (!(r.armLen > 2 * margin)) throw new Error('Hairpin arm is too short for the feed width.');
  // First find the distance from the open end, then reflect flipped U's.
  const fromOpen = clamp(halfLength - requested, margin, r.armLen - margin);
  const distance = halfLength - fromOpen;
  const Qe = Math.PI * z0 / (2 * r.model.Z0 * Math.sin(Math.PI * distance / (2 * halfLength)) ** 2);
  return { y: r.flipped ? r.armLen - fromOpen : fromOpen, fromOpen, distance, Qe,
    clamped: Math.abs(distance - requested) > 1e-9 };
}

/* Modal energy overlap of the facing arms. A uniform half-wave has voltage
 * cos(pi*s/l) and current sin(pi*s/l). The energy normalization for a pair is
 * sqrt(l1*l2)/2. Counter-directed currents subtract magnetic coupling for U's
 * with the same orientation; alternating U's make the two terms add.
 * For equal homogeneous lines with vanishing bend length this reduces to
 * 2*k_line/pi (opposite U's), or zero (same U's).
 */
export function hairpinCoupling(a, b, gap, sub, f) {
  if (!(gap > 0) || !Number.isFinite(gap)) throw new Error('Hairpin coupling gap must be positive.');
  const cp = coupledMicrostrip((a.w + b.w) / 2, gap, sub.h, sub.er, { t: sub.t, f });
  const ee = Math.sqrt(cp.epsEffEven), eo = Math.sqrt(cp.epsEffOdd);
  const ce = ee / cp.Z0e, co = eo / cp.Z0o;
  const le = ee * cp.Z0e, lo = eo * cp.Z0o;
  // The underlying modal fit becomes unphysical at very wide spacing.
  // Clip negative mutual terms to zero; never turn them into growing coupling.
  const kc = Math.max(0, (co - ce) / (co + ce));
  const kl = Math.max(0, (le - lo) / (le + lo));
  const la = hairpinLength(a), lb = hairpinLength(b), overlap = Math.min(a.armLen, b.armLen);
  const same = !!a.flipped === !!b.flipped;
  const steps = 64, dy = overlap / steps;
  let integral = 0;
  for (let j = 0; j <= steps; j++) {
    const y = j * dy;
    const pa = Math.PI * (a.flipped ? a.armLen - y : y) / la;
    const pb = Math.PI * (b.flipped ? b.armLen - y : y) / lb;
    const value = kc * Math.cos(pa) * Math.cos(pb)
      + (same ? -1 : 1) * kl * Math.sin(pa) * Math.sin(pb);
    integral += (j === 0 || j === steps ? 1 : j % 2 ? 4 : 2) * value;
  }
  return { k: 2 * integral * dy / (3 * Math.sqrt(la * lb)),
    outsideModalRange: co < ce || le < lo };
}

export function hairpinGapFor(target, a, b, sub, f) {
  let lo = sub.minGap || 0.15, hi = Math.max(lo, sub.h * 12);
  const value = (s) => Math.abs(hairpinCoupling(a, b, s, sub, f).k);
  if (value(lo) < target) return { s: lo, achievable: false };
  for (let i = 0; i < 48; i++) {
    const mid = Math.sqrt(lo * hi);
    if (value(mid) > target) lo = mid; else hi = mid;
  }
  const s = Math.sqrt(lo * hi);
  return { s, achievable: Math.abs(value(s) / target - 1) < 0.02 };
}

/** Rebuild exclusively from current copper, without nominal-gap normalization. */
export function evaluateHairpin(d, sub) {
  const r = d.resonators;
  d.modelWarnings = [];
  const tanks = r.map((r, i) => {
    const length = hairpinLength(r);
    const frequency = 299792458 / (Math.sqrt(r.model.epsEff) * length * 2e-3);
    const b = Math.PI / (2 * r.model.Z0), w0 = 2 * Math.PI * frequency;
    const C = b / w0, L = 1 / (w0 * b);
    const qu = r.model.alpha > 0 ? Math.PI / (r.model.lambda * 1e-3 * r.model.alpha) : 0;
    return { kind: 'shunt', type: 'LC-parallel', L, C, qu, b, resonator: i };
  });
  d.tapPositions = [hairpinTap(r[0], d.tap, d.feed.w, d.Z0),
    hairpinTap(r.at(-1), d.tapOut || d.tap, d.feed.w, d.Z0)];
  [d.Qe1, d.Qen] = d.tapPositions.map((p) => p.Qe);
  d.tapPositions.forEach((p, i) => {
    if (p.clamped) d.modelWarnings.push(`${i ? 'Output' : 'Input'} tap was limited to the straight arm; estimated external Q is ${p.Qe.toFixed(2)}.`);
  });
  const G = 1 / d.Z0;
  d.elements = [{ kind: 'inverter', J: Math.sqrt(G * tanks[0].b / d.Qe1) }];
  d.kCouple = [];
  for (let i = 0; i < r.length; i++) {
    d.elements.push(tanks[i]);
    if (i < r.length - 1) {
      const c = hairpinCoupling(r[i], r[i + 1], r[i + 1].gapLeft, sub, d.f0);
      d.kCouple.push(c.k);
      if (c.outsideModalRange) d.modelWarnings.push(`Gap ${i + 1}–${i + 2} exceeds the coupled-line model range; negative mutual terms were set to zero.`);
      // Avoid the numerical singularity of an exactly disconnected ABCD
      // inverter. 1e-12 S places transmission far below the plot's floor.
      d.elements.push({ kind: 'inverter', J: Math.max(1e-12, Math.abs(c.k) * Math.sqrt(tanks[i].b * tanks[i + 1].b)) });
    }
  }
  d.elements.push({ kind: 'inverter', J: Math.sqrt(G * tanks.at(-1).b / d.Qen) });
  d.totalLength = r.reduce((sum, x) => sum + hairpinLength(x), 0);
  d.tuningModel = 'First-order narrowband hairpin estimate from the placed lengths, taps and adjacent-arm coupling. Open ends, self-coupling, bends and feed loading require EM validation; harmonics are not modeled.';
  return d;
}
