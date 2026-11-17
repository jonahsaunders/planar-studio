// Published dimensions and measurements from Olivo et al., Tables I and II.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaults, compute, notes } from '../../web/js/ws/inductor.js';

const { config } = JSON.parse(readFileSync(new URL('design.json', import.meta.url), 'utf8'));
// oldMHz and oldPF are the predictions from commit f3c7c45 on the same inputs.
const coils = [
  { name: 'TxA', outer: 38, w: 1.2, s: 2.5, turns: 5, fillet: 3.8, h: 1.2,
    measuredMHz: 112.2, measuredPF: 3.42, oldMHz: 310.1991, oldPF: 0.6142 },
  { name: 'TxB', outer: 38, w: 1, s: 1, turns: 8, fillet: 2, h: 1.2,
    measuredMHz: 70.4, measuredPF: 3.34, oldMHz: 123.6757, oldPF: 1.2395 },
  { name: 'TxC', outer: 24.3, w: 0.254, s: 0.146, turns: 29, fillet: 0, h: 0.8,
    measuredMHz: 32.6, measuredPF: 2.52, oldMHz: 45.2806, oldPF: 1.3725 },
];

console.log('coil,generated_turns,measured_MHz,old_MHz,new_MHz,error_percent,measured_pF,old_pF,new_pF');
for (const c of coils) {
  const params = { ...defaults(), ...config, traceW: c.w, traceS: c.s, turns: c.turns,
    fillet: c.fillet, boardT: c.h, dOuter: (c.outer - c.w) / Math.cos(Math.PI / 4) };
  const { analysis, coil } = compute(params, { name: c.name });
  const mhz = analysis.srf / 1e6;
  const pf = analysis.Ctot * 1e12;
  const error = 100 * (mhz / c.measuredMHz - 1);
  assert.ok(analysis.squareCapModel, c.name);
  assert.ok(Math.abs(mhz - c.measuredMHz) < Math.abs(c.oldMHz - c.measuredMHz), c.name);
  assert.ok(Math.abs(pf - c.measuredPF) < Math.abs(c.oldPF - c.measuredPF), c.name);
  if (c.name === 'TxC') assert.ok(Math.abs(error) < 5, 'held-out TxC resonance regression');
  if (c.name === 'TxB') {
    const noteText = freq => notes({ ...params, freq }, { coil, analysis }).map(n => n.text).join(' ');
    assert.match(noteText(analysis.srf / 2), /2% to 71% high/);
    assert.doesNotMatch(noteText(params.freq), /2% to 71% high/);
  }
  console.log([c.name, coil.spiral.turnsUsed, c.measuredMHz, c.oldMHz, mhz.toFixed(2),
    error.toFixed(1), c.measuredPF, c.oldPF, pf.toFixed(3)].join(','));
}

for (const patch of [{ layers: 2 }, { shape: 'circle' }, { turns: 2 }, { traceS: 0.04 }]) {
  const { analysis } = compute({ ...defaults(), ...config, ...patch }, { name: 'scope check' });
  assert.equal(analysis.squareCapModel, false);
  assert.ok(Number.isFinite(analysis.srf) && analysis.srf > 0);
}
