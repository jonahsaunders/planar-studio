import { writeFileSync } from 'node:fs';
import { artwork, rect, transform } from '../web/js/engine/artwork.js';
import { exportKicadPcb } from '../web/js/engine/exporters.js';
import { defaults, compute } from '../web/js/ws/inductor.js';

const [fixture, exported] = process.argv.slice(2);
const board = artwork();
board.outline = [{ layer: 'Edge.Cuts', pts: rect(0, -50, 50, 0) }];
writeFileSync(fixture, exportKicadPcb(board));
const config = { ...defaults(), layers: 1 };
const { art } = compute(config, { name: 'Export fixture' }, { quick: true });
const positioned = transform(art, { dx: 25, dy: -25 });
positioned.outline = board.outline;
writeFileSync(exported, exportKicadPcb(positioned, { tolerance: config.tolerance }));
