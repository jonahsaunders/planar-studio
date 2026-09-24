/* Explicit Litz studies run separately from the main electrical preview.
   The application terminates this worker on edits, replacement jobs or Cancel. */
import { compareLitzConvergence } from './engine/litz-model.js';
import { compareLitzBaseline, searchLitzDesigns } from './engine/litz-studies.js';

self.onmessage = async ({ data: { task, cfg, geometry, opt = {} } }) => {
  try {
    const started = performance.now();
    let result;
    if (task === 'convergence') result = await compareLitzConvergence(cfg, geometry, opt);
    else if (task === 'compare') result = await compareLitzBaseline(cfg, geometry, opt);
    else if (task === 'search') result = await searchLitzDesigns(cfg, opt, progress => self.postMessage({ progress }));
    else throw new Error(`Unknown PCB Litz study: ${task}`);
    self.postMessage({ result, elapsed: performance.now() - started });
  } catch (error) { self.postMessage({ error: error.message || String(error) }); }
};
