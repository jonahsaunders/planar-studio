/* The expensive geometry matrices run off the UI thread. The owning app
   terminates this worker whenever parameters change, so stale results cannot
   be attached to newer copper. Frequency points reuse the prepared matrices. */
import { analyseLitz, sweepLitz } from './engine/litz-model.js';

self.onmessage = ({ data: { cfg, geometry, segmentCap } }) => {
  try {
    const start = performance.now();
    const analysis = analyseLitz(cfg, geometry, { segmentCap });
    const sweep = sweepLitz(cfg, analysis);
    self.postMessage({ analysis, sweep, elapsed: performance.now() - start });
  } catch (error) {
    self.postMessage({ error: error.message || String(error) });
  }
};
