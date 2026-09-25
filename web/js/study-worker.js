import { optimizeCoil, toleranceStudy, fitMeasurement, tuneToMask } from './engine/studies.js';
import { coupledCoils, fieldSlice, rotorDesign } from './engine/magnetics.js';
import { parseBoard, checkPlacement } from './engine/boardcheck.js';
import { plain } from './engine/filtertune.js';

self.onmessage = ({ data: { task, args } }) => {
  const progress = (value) => self.postMessage({ progress: value });
  try {
    const jobs = {
      optimize: () => optimizeCoil(args.cfg, args.opt, progress),
      tolerance: () => toleranceStudy(args.kind, args.cfg, args.opt, progress),
      fit: () => fitMeasurement(args.kind, args.cfg, args.data, args.opt, progress),
      tune: () => tuneToMask(args.cfg, args.opt, progress),
      coupling: () => coupledCoils(args.cfg, args.rx, args.pose, args.opt),
      field: () => fieldSlice(args.cfg, args.opt),
      rotor: () => rotorDesign(args.cfg, args.opt),
      board: () => checkPlacement(args.art, parseBoard(args.text, args.excluded || []), args.opt),
    };
    if (!jobs[task]) throw new Error('Unknown study.');
    self.postMessage({ result: plain(jobs[task]()) });
  } catch (error) { self.postMessage({ error: error.message || String(error) }); }
};
