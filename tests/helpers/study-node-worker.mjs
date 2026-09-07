// Adapt the browser worker entry point to node:worker_threads for DOM tests.
import { parentPort, workerData } from 'node:worker_threads';
globalThis.self = { postMessage: (data) => parentPort.postMessage(data) };
await import(workerData.url);
parentPort.on('message', (data) => self.onmessage({ data }));
parentPort.postMessage({ ready: true });
