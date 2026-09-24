import assert from 'node:assert/strict';
import { prepareLitzCapacitance } from '../web/js/engine/litz-capacitance.js';
const cfg = { traceW: .8, copperOz: .07 / .0348, turns: 1, epsR: 4.4 };
const fixture = (gap = .5, scale = 1) => ({ config: { traceW: cfg.traceW * scale, copperThicknessMM: .07 * scale },
  layers: [{ name: 'F.Cu', z: 0 }, { name: 'B.Cu', z: gap * scale }], stats: { pitchMM: 2 * scale },
  strands: [0, 1].map((i) => ({ id: i, sections: [{ layer: i ? 'B.Cu' : 'F.Cu', pts: [[0, 0], [100 * scale, 0]] }], vias: [] })) });
const total = a => a.couplings.reduce((sum, c) => sum + c.C, 0);
const a = prepareLitzCapacitance(cfg, fixture(), { samples: 32 });
const refined = prepareLitzCapacitance(cfg, fixture(), { samples: 128 });
assert.ok(a.couplings.every(p => p.C > 0 && p.a !== p.b && p.fa >= 0 && p.fb <= 1));
assert.ok(Math.abs(total(a) / total(refined) - 1) < 1e-10, 'Subdividing parallel straight traces cannot multiply capacitance.');
const farther = prepareLitzCapacitance(cfg, fixture(1), { samples: 32 });
assert.ok(total(farther) < total(a), 'Greater dielectric separation reduces pair capacitance.');
const doubled = prepareLitzCapacitance(cfg, fixture(.5, 2), { samples: 32 });
assert.ok(Math.abs(total(doubled) / total(a) - 2) < 1e-8, 'Uniform geometric scaling scales electrostatic capacitance linearly.');
const reversed = fixture(); reversed.strands.reverse();
assert.ok(Math.abs(total(prepareLitzCapacitance(cfg, reversed, { samples: 32 })) / total(a) - 1) < 1e-10);
assert.equal(a.validated, false);
assert.ok(a.limitations.some(s => s.includes('not a Maxwell')));
console.log('Litz capacitance: subdivision invariance, geometric scaling, separation, symmetry and floating pairs passed.');
