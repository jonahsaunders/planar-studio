import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { artwork, label, merge, rect, transform } from '../../web/js/engine/artwork.js';
import { exportKicadPcb } from '../../web/js/engine/exporters.js';
import { compute, defaults } from '../../web/js/ws/inductor.js';
import { sweep } from '../../web/js/engine/coil.js';
import { COUPONS, COUPON_BOARD_SHA, couponConfiguration } from '../../web/js/engine/measurement-records.js';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
export const definition = JSON.parse(read('coupons.json'));
assert.deepEqual(definition, COUPONS);
export const sha256 = input => createHash('sha256').update(input).digest('hex');

export function solveCoupon(id) {
  const coupon = definition.coupons[id];
  if (!coupon) throw new Error('Choose coupon A or B.');
  const { turns, center, role } = coupon;
  const config = couponConfiguration(id, defaults());
  const result = compute(config, { name: `Coupon ${id}`, net: `COIL_${id}` });
  assert.equal(result.coil.spiral.turnsUsed, turns, `Coupon ${id} turn count`);
  assert.ok(result.analysis.drc.clearanceOK && result.analysis.squareCapModel, `Coupon ${id} geometry`);
  assert.equal(result.art.vias.length, 0);
  assert.equal(result.art.pads.length, 2);
  const art = transform(result.art, { dx: center[0], dy: -center[1] });
  art.outline = [];
  art.labels = [label(center[0], -5, `${id} · ${turns} turns`)];
  const sample = sweep(config, result.analysis, 1e6, 1e6, 2)[0];
  const report = value => Number(value.toPrecision(10));
  const prediction = {
    role, turns, terminalsKiCadMm: art.pads.map(p => [Number(p.x.toFixed(3)), Number((-p.y).toFixed(3))]),
    inductance_H: report(result.analysis.L), resistanceAt1MHz_ohm: report(sample.zRe),
    reactanceAt1MHz_ohm: report(sample.zIm), selfResonance_Hz: report(result.analysis.srf),
  };
  return { config, art, analysis: result.analysis, prediction };
}

export function buildBoard() {
  const board = artwork({ name: 'Planar Studio impedance coupons' });
  board.outline = [{ layer: 'Edge.Cuts', pts: rect(0, -44, 94, 0) }];
  const solves = Object.fromEntries(Object.keys(definition.coupons).map(id => [id, solveCoupon(id)]));
  for (const { art } of Object.values(solves)) merge(board, art);
  const pcb = exportKicadPcb(board, { boardThickness: definition.boardThicknessMm, tolerance: 0.004 });
  return { pcb, solves };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { pcb, solves } = buildBoard();
  const file = 'inductor-coupons.kicad_pcb';
  const boardSHA256 = sha256(pcb);
  if (process.argv.includes('--check')) {
    assert.equal(read(file).replaceAll('\r\n', '\n'), pcb, `Regenerate ${file}`);
    assert.equal(JSON.parse(read('predictions.json')).boardSHA256, boardSHA256, 'The frozen prediction must match the board.');
    assert.equal(COUPON_BOARD_SHA, boardSHA256, 'The app importer must recognize the checked-in board.');
  } else {
    writeFileSync(new URL(file, import.meta.url), pcb);
    if (process.argv.includes('--write-baseline')) {
      const coupons = Object.fromEntries(Object.entries(solves).map(([id, value]) => [id, value.prediction]));
      writeFileSync(new URL('predictions.json', import.meta.url), JSON.stringify({ boardSHA256, coupons }, null, 2) + '\n');
    }
  }
}
