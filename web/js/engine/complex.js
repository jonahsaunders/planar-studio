/* Minimal complex arithmetic and 2x2 ABCD matrices.

   Written as flat [re, im] pairs rather than objects: a filter sweep evaluates
   a few hundred frequencies across a cascade of ten or so two-ports, and the
   allocation churn of a class-per-number is the difference between a response
   plot that tracks a slider and one that stutters behind it. */

export const C = {
  re: (a) => a[0],
  im: (a) => a[1],
  of: (re, im = 0) => [re, im],
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
  scale: (a, s) => [a[0] * s, a[1] * s],
  div: (a, b) => {
    const d = b[0] * b[0] + b[1] * b[1] || 1e-300;
    return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
  },
  inv: (a) => C.div([1, 0], a),
  abs: (a) => Math.hypot(a[0], a[1]),
  arg: (a) => Math.atan2(a[1], a[0]),
  neg: (a) => [-a[0], -a[1]],
  sqrt: (a) => {
    const r = Math.hypot(a[0], a[1]);
    const re = Math.sqrt(Math.max(0, (r + a[0]) / 2));
    let im = Math.sqrt(Math.max(0, (r - a[0]) / 2));
    if (a[1] < 0) im = -im;
    return [re, im];
  },
};

/* Decibels of a linear magnitude, floored so a transmission zero plots as a
   deep notch instead of running off to negative infinity. */
export const dB = (mag) => 20 * Math.log10(Math.max(mag, 1e-12));

/* ---------------------------------------------------------------------------
   ABCD two-ports. Stored as [A, B, C, D], each a complex pair.
   ------------------------------------------------------------------------ */

export const ABCD = {
  identity: () => [[1, 0], [0, 0], [0, 0], [1, 0]],

  /* Impedance in the series arm. */
  series: (Z) => [[1, 0], Z, [0, 0], [1, 0]],

  /* Admittance from the line to ground. */
  shunt: (Y) => [[1, 0], [0, 0], Y, [1, 0]],

  /* Ideal transmission line: characteristic impedance Z0 (real), electrical
     length theta in radians, with an optional attenuation alpha*l in nepers. */
  line: (Z0, theta, alphaL = 0) => {
    // cosh(gamma l) and sinh(gamma l) with gamma l = alphaL + j*theta
    const ch = [Math.cosh(alphaL) * Math.cos(theta), Math.sinh(alphaL) * Math.sin(theta)];
    const sh = [Math.sinh(alphaL) * Math.cos(theta), Math.cosh(alphaL) * Math.sin(theta)];
    return [ch, C.scale(sh, Z0), C.scale(sh, 1 / Z0), ch];
  },

  /* Admittance inverter of value J -- the idealisation the coupled-line
     bandpass synthesis is built on. */
  inverterJ: (J) => [[0, 0], [0, 1 / J], [0, J], [0, 0]],

  multiply: (m, n) => [
    C.add(C.mul(m[0], n[0]), C.mul(m[1], n[2])),
    C.add(C.mul(m[0], n[1]), C.mul(m[1], n[3])),
    C.add(C.mul(m[2], n[0]), C.mul(m[3], n[2])),
    C.add(C.mul(m[2], n[1]), C.mul(m[3], n[3])),
  ],

  cascade: (list) => list.reduce(ABCD.multiply, ABCD.identity()),

  /* S-parameters of the cascade between (real) source and load impedances. */
  toS: (m, Zs = 50, Zl = 50) => {
    const [A, B, Cc, D] = m;
    const den = C.add(
      C.add(C.scale(A, Zl), B),
      C.add(C.scale(Cc, Zs * Zl), C.scale(D, Zs)),
    );
    const s21 = C.div(C.of(2 * Math.sqrt(Zs * Zl)), den);
    const s11 = C.div(
      C.add(C.sub(C.scale(A, Zl), C.scale(Cc, Zs * Zl)), C.sub(B, C.scale(D, Zs))),
      den,
    );
    return { s11, s21 };
  },
};

/* Input impedance looking into a cascade terminated in Zl. */
export function inputImpedance(m, Zl = 50) {
  const [A, B, Cc, D] = m;
  return C.div(C.add(C.scale(A, Zl), B), C.add(C.scale(Cc, Zl), D));
}

/* Group delay from a phase array, in seconds. Central differences on the
   unwrapped phase; the endpoints reuse the neighbouring interval. */
export function groupDelay(freqs, phases) {
  const n = freqs.length;
  const out = new Array(n).fill(0);
  if (n < 2) return out;
  const un = new Array(n);
  un[0] = phases[0];
  for (let i = 1; i < n; i++) {
    let d = phases[i] - phases[i - 1];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    un[i] = un[i - 1] + d;
  }
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const dw = 2 * Math.PI * (freqs[b] - freqs[a]);
    out[i] = dw !== 0 ? -(un[b] - un[a]) / dw : 0;
  }
  return out;
}
