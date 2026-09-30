// Refresh only the five motor screenshots used by the documentation gallery.
import { captureShowcase } from './showcase-shots.mjs';
await captureShowcase({ motorOnly: true });
