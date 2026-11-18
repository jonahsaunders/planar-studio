import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { artwork, boundsCopper, rect, toKicad, transform } from '../web/js/engine/artwork.js';
import { exportKicadPcb } from '../web/js/engine/exporters.js';
import { defaults, compute } from '../web/js/ws/inductor.js';
import { defaults as filterDefaults, compute as computeFilter } from '../web/js/ws/filter.js';
import { defaults as antennaDefaults, compute as computeAntenna } from '../web/js/ws/antenna.js';
import { PLANAR_ANTENNA_FAMILIES } from '../web/js/engine/planar-antenna-families.js';
import { EXTENDED_ANTENNA_NAMES } from '../web/js/engine/extended-antenna-families.js';
import { defaults as motorDefaults, compute as computeMotor } from '../web/js/ws/motor.js';
import { constructionFiles } from '../web/js/engine/planar-constructions.js';

const [fixture, exported, filterFixture, seriesFixture, seriesPayload, insetFixture, creatorFixtures] = process.argv.slice(2);
const board = artwork();
board.meta.boardLayers = ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'];
board.outline = [{ layer: 'Edge.Cuts', pts: rect(0, -50, 50, 0) }];
writeFileSync(fixture, exportKicadPcb(board).replace('(net 0 "")', '(net 0 "")\n  (net 1 "COIL")'));
const config = { ...defaults(), layers: 1 };
const { art } = compute(config, { name: 'Export fixture' }, { quick: true });
const positioned = transform(art, { dx: 25, dy: -25 });
positioned.outline = board.outline;
writeFileSync(exported, exportKicadPcb(positioned, { tolerance: config.tolerance }));

const filter = computeFilter({ ...filterDefaults(), family: 'lumped', capStyle: 'plate', order: 3 }, {}, { quick: true }).art;
const { x0, y0, x1, y1 } = boundsCopper(filter);
filter.outline = [{ layer: 'Edge.Cuts', pts: rect(x0 - 4, y0 - 4, x1 + 4, y1 + 4) }];
writeFileSync(filterFixture, exportKicadPcb(filter));

const series = compute({ ...defaults(), layers: 4, turns: 4, ppt: 64 }, { name: 'Series stack' }, { quick: true }).art;
writeFileSync(seriesFixture, exportKicadPcb(series));
writeFileSync(seriesPayload, JSON.stringify(toKicad(series, { dx: 29, dy: 29 })));

const antenna = computeAntenna({ ...antennaDefaults(), family: 'inset-patch' }, {}, { quick: true });
writeFileSync(insetFixture, exportKicadPcb(antenna.art));

mkdirSync(creatorFixtures);
for (const family of Object.keys({ ...PLANAR_ANTENNA_FAMILIES, ...EXTENDED_ANTENNA_NAMES })) {
  const config = { ...antennaDefaults(), family };
  const { art } = computeAntenna(config, { name: family }, { quick: true });
  writeFileSync(join(creatorFixtures, `${family}.kicad_pcb`), exportKicadPcb(art, { tolerance: config.tolerance }));
}
for (const [layers, motorTopology] of [[4, 'wye'], [6, 'delta'], [6, 'independent']]) {
  const name = `motor-${layers}-layer-${motorTopology}`;
  const config = { ...motorDefaults(), turns: 4, layers, motorTopology };
  const { art } = computeMotor(config, { name }, { quick: true });
  if (!art.meta.busRouted || art.meta.routingError) throw new Error(`Could not generate ${name}.`);
  writeFileSync(join(creatorFixtures, `${name}.kicad_pcb`), exportKicadPcb(art));
}
for (const [name, patch] of [
  ['motor-stepper-4', { motorFamily: 'stepper', layers: 4 }],
  ['motor-stepper-6', { motorFamily: 'stepper', layers: 6 }],
  ['motor-radial-wave', { rotaryWinding: 'radial-wave' }],
]) {
  const { art } = computeMotor({ ...motorDefaults(), ...patch }, { name }, { quick: true });
  writeFileSync(join(creatorFixtures, name + '.kicad_pcb'), exportKicadPcb(art));
}
for (const planarConstruction of ['moving-coil', 'double-sided', 'crossed']) {
  const config = { ...motorDefaults(), motorFamily: 'planar', planarConstruction, turns: 4 };
  const result = computeMotor(config, { name: planarConstruction }, { quick: true });
  for (const [filename, text] of Object.entries(constructionFiles(result))) {
    if (filename.endsWith('.kicad_pcb')) writeFileSync(join(creatorFixtures, 'planar-' + planarConstruction + '-' + filename), text);
  }
}
