import { optimizeCoil, toleranceStudy, fitMeasurement, tuneToMask } from './engine/studies.js';
import { coupledCoils, fieldSlice, rotorDesign } from './engine/magnetics.js';
import { parseBoard, checkPlacement } from './engine/boardcheck.js';
import { plain } from './engine/filtertune.js';
import { designFromRequirements } from './engine/transformer-studies.js';
import { compareTransformers, operatingEnvelope, transformerTolerance } from './engine/transformer-workflow.js';
import { compareTransformerTest, calibrateTransformer } from './engine/transformer-measurements.js';

self.onmessage = ({ data: { task, args } }) => {
  const progress = (value) => self.postMessage({ progress: value });
  try {
    const jobs = {
      transformerDesign: () => designFromRequirements(args.cfg, args.requirements, args.env, progress),
      transformerCompare: () => compareTransformers(args.cfg,args.candidates,args.normalized,args.env),
      transformerEnvelope: () => operatingEnvelope(args.cfg,args.env,progress),
      transformerTolerance: () => transformerTolerance(args.cfg,args.env,progress),
      transformerTest: () => compareTransformerTest(args.cfg,args.test,args.env),
      transformerCalibrate: () => calibrateTransformer(args.cfg,args.tests,args.env),
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
