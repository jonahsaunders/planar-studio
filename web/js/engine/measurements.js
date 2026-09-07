/* Local measurement import. Frequency is always Hz; phase is degrees on input.
   Touchstone 1.x S1P/S2P, RI/MA/DB, including wrapped records. No extrapolation. */
const units = { hz: 1, khz: 1e3, mhz: 1e6, ghz: 1e9 };
const complex = (a, b, format) => {
  if (format === 'ri') return [a, b];
  const mag = format === 'db' ? 10 ** (a / 20) : a;
  return [mag * Math.cos(b * Math.PI / 180), mag * Math.sin(b * Math.PI / 180)];
};
const db = (z) => 20 * Math.log10(Math.max(1e-15, Math.hypot(...z)));

export function parseMeasurement(text, name = 'measurement.csv') {
  if (text.length > 8e6) throw new Error('Measurement exceeds 8 MB. Reduce the sweep before importing.');
  return /\.s[12]p$/i.test(name) || /^\s*#\s*(hz|khz|mhz|ghz)\b/im.test(text)
    ? parseTouchstone(text, name) : parseCSV(text, name);
}

function finish(name, rows, extra = {}) {
  if (rows.length < 2) throw new Error('At least two measurement points are required.');
  rows.sort((a, b) => a.f - b.f);
  for (let i = 0; i < rows.length; i++) {
    if (!(rows[i].f > 0) || !Object.values(rows[i]).every(Number.isFinite)) throw new Error('Non-finite data or non-positive frequency.');
    if (i && rows[i].f === rows[i - 1].f) throw new Error('Duplicate measurement frequencies.');
  }
  return { name, rows, ...extra };
}

export function parseTouchstone(text, name = 'measurement.s2p') {
  let unit = 1e9, format = 'ma', z0 = 50, n = /\.s1p$/i.test(name) ? 1 : 2;
  const data = [];
  for (let raw of text.split(/\r?\n/)) {
    const line = raw.split('!')[0].trim();
    if (!line) continue;
    if (line.startsWith('[')) throw new Error('Touchstone 2.x keywords are not supported. Export Touchstone 1.x S1P or S2P.');
    if (line.startsWith('#')) {
      if (data.length) throw new Error('Option line must precede data.');
      const t = line.slice(1).trim().toLowerCase().split(/\s+/);
      if (!units[t[0]] || t[1] !== 's' || !['ri', 'ma', 'db'].includes(t[2])) throw new Error('Expected # Hz|kHz|MHz|GHz S RI|MA|DB R <ohms>.');
      unit = units[t[0]]; format = t[2];
      if (t.includes('r')) z0 = Number(t[t.indexOf('r') + 1]);
      if (!(z0 > 0) || !Number.isFinite(z0)) throw new Error('Reference impedance must be positive.');
    } else {
      const nums = line.split(/\s+/).map((v) => Number(v.replace(/[dD]/, 'e')));
      if (!nums.every(Number.isFinite)) throw new Error('Invalid Touchstone number.');
      data.push(...nums);
    }
  }
  const width = 1 + 2 * n * n;
  if (data.length % width) throw new Error(`Incomplete ${n}-port record. Noise blocks are not supported.`);
  const rows = [];
  for (let i = 0; i < data.length; i += width) {
    const s11 = complex(data[i + 1], data[i + 2], format);
    const row = { f: data[i] * unit, s11db: db(s11) };
    if (n === 2) row.s21db = db(complex(data[i + 3], data[i + 4], format));
    const [re, im] = s11, den = (1 - re) ** 2 + im ** 2;
    if (den > 1e-24) {
      row.zRe = z0 * (1 - re * re - im * im) / den;
      row.zIm = z0 * 2 * im / den;
      row.Z = Math.hypot(row.zRe, row.zIm);
    }
    rows.push(row);
  }
  return finish(name, rows, { z0, ports: n, format: 'touchstone' });
}

export function parseCSV(text, name = 'measurement.csv') {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((s) => s.trim() && !/^\s*[!#]/.test(s));
  if (!lines.length) throw new Error('Empty CSV.');
  const delim = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const split = (s) => s.split(delim).map((s) => s.trim().replace(/^"|"$/g, ''));
  const h = split(lines.shift()).map((s) => s.toLowerCase().replace(/[\s()[\]|]/g, ''));
  const fi = h.findIndex((s) => /^(f|freq|frequency)(hz|khz|mhz|ghz)?$/.test(s));
  if (fi < 0) throw new Error('CSV needs a Frequency (Hz/kHz/MHz/GHz) column.');
  const mult = units[(h[fi].match(/(ghz|mhz|khz|hz)$/) || [])[1]] || 1;
  const aliases = { s21db: ['s21db', 's21_db'], s11db: ['s11db', 's11_db'], Z: ['z', 'zohm', 'zohms', 'zmag', 'zmagohm', 'impedanceohm'], zRe: ['r', 'rohm', 'real', 're', 'zre', 'zreohm'], zIm: ['x', 'xohm', 'imag', 'im', 'zim', 'zimohm'] };
  const cols = Object.entries(aliases).map(([key, names]) => [key, h.findIndex((s) => names.includes(s))]).filter(([, i]) => i >= 0);
  if (!cols.length) throw new Error('CSV needs S21 (dB), S11 (dB), Z (ohm), or R and X columns.');
  const rows = lines.map((line, index) => {
    const t = split(line);
    if (t.length !== h.length || t.some((v) => !v.length)) throw new Error(`Missing cell on CSV row ${index + 2}.`);
    const row = { f: Number(t[fi]) * mult };
    for (const [key, i] of cols) row[key] = Number(t[i]);
    if (row.zRe != null && row.zIm != null) row.Z = Math.hypot(row.zRe, row.zIm);
    if (row.Z < 0) throw new Error('Impedance magnitude cannot be negative.');
    return row;
  });
  return finish(name, rows, { format: 'csv' });
}

export function interpolate(xs, ys, x) {
  if (x < xs[0] || x > xs.at(-1)) return NaN;
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  if (!Number.isFinite(ys[lo]) || !Number.isFinite(ys[hi])) return NaN;
  const t = (Math.log(x) - Math.log(xs[lo])) / (Math.log(xs[hi]) - Math.log(xs[lo]));
  return ys[lo] + t * (ys[hi] - ys[lo]);
}

export function measurementValues(measurement, metric, frequencies) {
  const xs = measurement.rows.map((r) => r.f), ys = measurement.rows.map((r) => r[metric]);
  return frequencies.map((f) => interpolate(xs, ys, f));
}
