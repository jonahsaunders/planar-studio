/* Independent copper-path, tap-loading and response-sensitivity regressions.
 * These are model/software checks, not full-wave validation of the hardware. */
import assert from 'node:assert/strict';
import { defaults, compute, synth, spec, charts, handles } from '../web/js/ws/filter.js';
import { hairpin, respond } from '../web/js/engine/filter.js';
import { coupledMicrostrip } from '../web/js/engine/microstrip.js';
import { hairpinCoupling } from '../web/js/engine/hairpin-model.js';
import { tuneDistributed } from '../web/js/engine/filtertune.js';
import { segmentDistance } from '../web/js/engine/boardcheck.js';
import { exportKicadPcb, exportSvg } from '../web/js/engine/exporters.js';

const cfg = { ...defaults(), family: 'hairpin', band: 'bandpass', points: 801, spanDecades: 0.15 };
const sub = { h: cfg.subH, er: cfg.subEr, t: cfg.subT, tanD: cfg.tanD, minGap: cfg.minGap };
const clone = (x) => JSON.parse(JSON.stringify(x));
const near = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= rel * Math.max(Math.abs(b), 1e-12), `${a} != ${b}`);
const pathLength = (pts) => pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
const difference = (a, b) => Math.max(...a.response.s21db.map((v, i) => Math.abs(v - b.response.s21db[i])));
let count = 0;
function check(name, fn) { fn(); count++; console.log(`  ok ${name}`); }

for (const order of [1, 2, 3, 4, 5, 10, 12]) {
  check(`Order ${order}: copper length, resonance, tap loading, isolation and exports`, () => {
    const r = compute({ ...cfg, order }, {}), d = r.design;
    const byResonator = d.resonators.map((_, i) => r.art.tracks.filter((t) => t.index === i && t.role.startsWith('hairpin')));
    const lengths = byResonator.map((ts) => ts.reduce((s, t) => s + pathLength(t.pts), 0));
    lengths.forEach((length, i) => {
      const resonator = d.resonators[i];
      // Sum the generated polylines, independently of the model's length helper.
      near(length, 299792458 / (2 * d.f0 * Math.sqrt(resonator.model.epsEff)) * 1e3, 1e-4);
      const tank = d.elements.find((e) => e.resonator === i);
      near(1 / (2 * Math.PI * Math.sqrt(tank.L * tank.C)), d.f0);
    });
    for (const [port, index] of [[0, 0], [1, order - 1]]) {
      const resonator = d.resonators[index], y = r.art.ports[port].y;
      // Read the feed position from the artwork, not the stored tap distance.
      const fromOpen = resonator.flipped ? resonator.armLen - y : y;
      const voltage = Math.cos(Math.PI * fromOpen / lengths[index]);
      const qe = Math.PI * d.Z0 / (2 * resonator.model.Z0 * voltage ** 2);
      const actual = port ? d.Qen : d.Qe1;
      near(qe, actual, 5e-4);
      if (!d.tapPositions[port].clamped) near(actual, d.targetQe[port]);
      assert.ok(fromOpen >= d.feed.w / 2 && fromOpen <= resonator.armLen - d.feed.w / 2);
    }
    // Distinct resonators must remain separated even at the curved bends.
    for (let i = 0; i < order - 1; i++) {
      let clearance = Infinity;
      for (const a of byResonator[i]) for (const b of byResonator[i + 1]) {
        for (let j = 1; j < a.pts.length; j++) for (let k = 1; k < b.pts.length; k++) {
          clearance = Math.min(clearance, segmentDistance(a.pts[j - 1], a.pts[j], b.pts[k - 1], b.pts[k]) - (a.width + b.width) / 2);
        }
      }
      near(clearance, d.resonators[i + 1].gapLeft, 1e-7);
    }
    for (const exporter of [exportKicadPcb, exportSvg]) assert.ok(!/NaN|Infinity|undefined/.test(exporter(r.art)));
    assert.ok(spec({ ...cfg, order }, r).some((s) => s.title === 'Hairpin resonators'));
    assert.ok(r.response.s21db.every(Number.isFinite));
  });
}

const base = compute(cfg, {});
check('Moving a tap changes the placed feed, external Q and S21', () => {
  const fixed = clone(base.nominal);
  fixed.tap.length *= 1.6;
  const moved = compute({ ...cfg, fixedDesign: fixed }, {});
  assert.notEqual(moved.art.ports[0].y, base.art.ports[0].y);
  assert.ok(moved.design.Qe1 < base.design.Qe1);
  near(moved.design.Qen, base.design.Qen);
  assert.ok(difference(base, moved) > 0.1);
});

check('Actual nominal gaps determine coupling, including the disconnected limit', () => {
  const fixed = clone(base.nominal);
  fixed.resonators.forEach((r) => { r.gapLeft = 20; r.gapRight = 20; });
  const wide = compute({ ...cfg, fixedDesign: fixed }, {});
  assert.ok(wide.design.kCouple.every((k) => Math.abs(k) < 1e-6));
  assert.ok(wide.response.s21db.every(Number.isFinite));
  assert.ok(Math.max(...wide.response.s21db) < -100);
  assert.ok(difference(base, wide) > 50);
  assert.ok(wide.review.some((n) => n.text.includes('model range')));
});

check('Retuned and reloaded identical copper have identical response', () => {
  const tuned = compute({ ...cfg, tuning: { gapScale: 1.4, lengths: [1.03, 1, 1, 1, 0.98], taps: [1.3, 1.2] } }, {});
  const reloaded = compute({ ...cfg, fixedDesign: clone(tuned.design) }, {});
  near(difference(tuned, reloaded), 0, 0.01);
  assert.deepEqual(tuned.art.tracks, reloaded.art.tracks);
});

check('Tap drag handles work independently for both feed orientations', () => {
  const c = { ...cfg, order: 4 }, r = compute(c, {});
  for (const i of [0, 1]) {
    let tuning;
    const h = handles(c, r, { set: (key, value) => { assert.equal(key, 'tuning'); tuning = value; } }).find((h) => h.id === `tap-${i}`);
    assert.ok(h);
    h.drag(h.x, h.y + (i ? 1 : -1));
    const changed = compute({ ...c, tuning }, {});
    assert.notEqual(changed.art.ports[i].y, r.art.ports[i].y);
    near(changed.art.ports[1 - i].y, r.art.ports[1 - i].y);
    assert.ok(difference(r, changed) > 0.1);
  }
});

check('Length and material studies use frozen copper and do not mutate the base', () => {
  const initial = synth(cfg), saved = clone(initial);
  const nominal = tuneDistributed(initial, cfg);
  const varied = tuneDistributed(initial, cfg, {}, { er: 6 });
  assert.deepEqual(clone(initial), saved);
  near(varied.resonators[0].armLen, nominal.resonators[0].armLen);
  assert.notEqual(varied.Qe1, nominal.Qe1);
  assert.notEqual(varied.kCouple[0], nominal.kCouple[0]);
  const longer = compute({ ...cfg, tuning: { lengthScale: 1.1 } }, {});
  assert.ok(longer.response.metrics.centreF < base.response.metrics.centreF);
});

check('Absolute overlap estimate has the homogeneous-line limiting values', () => {
  // In a homogeneous medium capacitive and inductive coupling are equal.
  // Negligible bends: opposite U's -> 2*k_line/pi; same U's -> cancellation.
  const a = { w: 1, armGap: 1, armLen: 1e6 }, b = { ...a, flipped: true };
  const air = { h: 1, er: 1, t: 0 }, gap = 1, f = 1e9;
  const k = coupledMicrostrip(a.w, gap, air.h, air.er, { f }).coupling;
  near(hairpinCoupling(a, b, gap, air, f).k, 2 * k / Math.PI, 1e-5);
  assert.ok(Math.abs(hairpinCoupling(a, a, gap, air, f).k) < 1e-5);
  near(hairpinCoupling(a, b, gap, air, f).k, hairpinCoupling(b, a, gap, air, f).k);
});

check('Lossless response conserves power and removes per-resonator loss', () => {
  assert.ok(base.response.metrics.insertionLoss > 1);
  assert.ok(base.ideal.metrics.insertionLoss < 1e-6);
  base.ideal.s21db.forEach((v, i) => near(10 ** (v / 10) + 10 ** (base.ideal.s11db[i] / 10), 1, 1e-8));
  assert.ok(charts(cfg, base).some((c) => c.title === 'Hairpin estimate against the lumped prototype'));
});

check('Unreachable geometry and process-limited taps/gaps are exposed', () => {
  for (const edges of [[0, 2e9], [2e9, 2e9], [2e9, Infinity]]) {
    assert.throws(() => hairpin({ response: 'chebyshev', order: 3, ripple: 0.1, f1: edges[0], f2: edges[1] }, sub));
  }
  assert.throws(() => compute({ ...cfg, f1: 19e9, f2: 20e9 }, {}), /too short/);
  const narrow = compute({ ...cfg, f1: 2.399e9, f2: 2.401e9 }, {});
  assert.ok(narrow.review.some((n) => n.text.includes('tap was limited')));
  assert.ok(narrow.design.Qe1 < narrow.design.targetQe[0]);
  const limited = compute({ ...cfg, minGap: 5 }, {});
  assert.ok(limited.review.some((n) => n.text.includes('cannot reach')));
  assert.ok(limited.design.resonators.every((r) => r.gapLeft >= 5));
  const tuned = compute({ ...cfg, tuning: { gapScale: 0.01 } }, {});
  assert.ok(tuned.review.some((n) => n.level === 'error' && n.text.includes('gap')));
});

check('Direct synthesis and workspace computation share one response model', () => {
  const direct = respond(synth(cfg), { f0: base.response.freqs[0], f1: base.response.freqs.at(-1), points: cfg.points });
  direct.s21db.forEach((v, i) => near(v, base.response.s21db[i], 1e-8));
});

console.log(`\n${count} hairpin checks passed`);
