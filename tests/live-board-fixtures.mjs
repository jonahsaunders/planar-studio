import { writeFileSync } from 'node:fs';
import { artwork, boundsCopper, rect, transform } from '../web/js/engine/artwork.js';
import { exportKicadPcb } from '../web/js/engine/exporters.js';
import { defaults, compute } from '../web/js/ws/inductor.js';
import { defaults as filterDefaults, compute as computeFilter } from '../web/js/ws/filter.js';

const [fixture, exported, filterFixture] = process.argv.slice(2);
const board = artwork();
board.outline = [{ layer: 'Edge.Cuts', pts: rect(0, -50, 50, 0) }];
writeFileSync(fixture, exportKicadPcb(board));
const config = { ...defaults(), layers: 1 };
const { art } = compute(config, { name: 'Export fixture' }, { quick: true });
const positioned = transform(art, { dx: 25, dy: -25 });
positioned.outline = board.outline;
writeFileSync(exported, exportKicadPcb(positioned, { tolerance: config.tolerance }));

const filter = computeFilter({ ...filterDefaults(), family: 'lumped', capStyle: 'plate', order: 3 }, {}, { quick: true }).art;
const { x0, y0, x1, y1 } = boundsCopper(filter);
filter.outline = [{ layer: 'Edge.Cuts', pts: rect(x0 - 4, y0 - 4, x1 + 4, y1 + 4) }];
writeFileSync(filterFixture, exportKicadPcb(filter));
