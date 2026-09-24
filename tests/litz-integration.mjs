/* Physical layer spans survive board export/import and placement preview. */
import assert from 'node:assert/strict';
import { artwork, track, via } from '../web/js/engine/artwork.js';
import { exportKicadPcb } from '../web/js/engine/exporters.js';
import { parseBoard, checkPlacement } from '../web/js/engine/boardcheck.js';
import { buildCoil } from '../web/js/engine/coil.js';
import { applyBoardContext } from '../web/js/ws/common.js';

const stack = ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'];
const a = artwork({ boardLayers: stack });
a.vias.push(via(0, 0, { from: 'F.Cu', to: 'In1.Cu', viaType: 'blind_buried', net: 'LITZ' }));
const parsed = parseBoard(exportKicadPcb(a));
assert.deepEqual(parsed.copper.find(x => x.kind === 'via').layer, ['F.Cu', 'In1.Cu']);

function crossing(layer) {
  const art = artwork({ boardLayers: stack });
  art.tracks.push(track(layer, 0.2, [[-1, 0], [1, 0]], { net: 'OTHER' }));
  return art;
}
assert.equal(checkPlacement(crossing('B.Cu'), parsed).findings.length, 0, 'A front blind via has no copper or drill on B.Cu');
assert.ok(checkPlacement(crossing('In1.Cu'), parsed).findings.some(x => x.type === 'copper'), 'Blind via annulus obstructs its destination layer');
const back = artwork({ boardLayers: stack });
back.tracks.push(track('B.Cu', 0.2, [[-1, 0], [1, 0]], { net: 'OTHER' }));
assert.equal(checkPlacement(a, parseBoard(exportKicadPcb(back))).findings.length, 0, 'Generated via span also controls placement checks');

assert.throws(() => buildCoil({ windingMode: 'pcb-litz' }), /strand-aware/, 'Legacy studies cannot silently reinterpret a Litz config as a spiral');
const cfg = { windingMode: 'pcb-litz', layers: 4, boardT: 1.58, copperOz: 2, litzDielectricGaps: [0.4, 0.5, 0.4] };
assert.deepEqual(applyBoardContext(cfg, { layerCount: 2, thickness: 1, copperThicknessMm: 0.035 }).cfg, cfg, 'A connected board must not silently change Litz topology');
console.log('Litz board span roundtrip, placement checks, legacy-study guard and explicit stack preservation passed.');
