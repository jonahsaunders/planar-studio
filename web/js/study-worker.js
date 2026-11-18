import { optimizeCoil, toleranceStudy, fitMeasurement, tuneToMask } from './engine/studies.js';
import { coupledCoils, fieldSlice, rotorDesign } from './engine/magnetics.js';
import { parseBoard, checkPlacement } from './engine/boardcheck.js';
import { plain } from './engine/filtertune.js';
import { designFromRequirements } from './engine/transformer-studies.js';
import { compareTransformers, operatingEnvelope, transformerTolerance, assessConditions, transformerRepairs } from './engine/transformer-workflow.js';
import { buildTransformer } from './engine/transformer.js';
import { compareTransformerTest, calibrateTransformer, comparePrototypes } from './engine/transformer-measurements.js';
import { optimizeMotor } from './engine/motor-optimizer.js';
import { motorFieldMap } from './engine/motor-field-map.js';
import { stepperSpeed, linearThrust, planarForceMap } from './engine/motor-motion.js';
import { simulateStepperMove } from './engine/stepper-move.js';
import { calibrateStepper } from './engine/stepper-drive.js';
import { compute as computeMotor } from './ws/motor.js';

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
      transformerPrototypes: () => comparePrototypes(args.tests),
      transformerScenarios: () => assessConditions(args.cfg,buildTransformer(args.cfg,args.env),args.env),
      transformerRepairs: () => transformerRepairs(args.cfg,args.env,progress),
      optimize: () => optimizeCoil(args.cfg, args.opt, progress),
      tolerance: () => toleranceStudy(args.kind, args.cfg, args.opt, progress),
      fit: () => fitMeasurement(args.kind, args.cfg, args.data, args.opt, progress),
      tune: () => tuneToMask(args.cfg, args.opt, progress),
      coupling: () => coupledCoils(args.cfg, args.rx, args.pose, args.opt),
      field: () => fieldSlice(args.cfg, args.opt),
      rotor: () => rotorDesign(args.cfg, args.opt),
      board: () => checkPlacement(args.art, parseBoard(args.text, args.excluded || []), args.opt),
      motorSizing: () => optimizeMotor(args.cfg, args.settings, args.env, progress),
      motorFieldMap: () => {
        const layout = computeMotor(args.cfg, args.env, { quick: true });
        return motorFieldMap(layout.modelCfg || args.cfg, layout.art, args.planes, args.settings, progress);
      },
      stepperMove: () => simulateStepperMove(computeMotor(args.cfg, args.env), args.settings, args.measured),
      stepperCalibration: () => calibrateStepper(computeMotor(args.cfg, args.env), args.measured, args.settings),
      motorMotion: () => {
        const layout = computeMotor(args.cfg, args.env, { skipCurve: true });
        const study = { stepper: stepperSpeed, linear: linearThrust, planar: planarForceMap }[layout.family];
        if (!study) throw new Error('Choose a stepper, linear or planar motor.');
        return study(layout, args.settings);
      },
    };
    if (!jobs[task]) throw new Error('Unknown study.');
    self.postMessage({ result: plain(jobs[task]()) });
  } catch (error) { self.postMessage({ error: error.message || String(error) }); }
};
