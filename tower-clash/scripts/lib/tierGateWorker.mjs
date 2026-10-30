// Worker entry of the Commander tier gate (`runTierGateJobs`, scripts/lib/tierGateRun.ts). tsx's loader
// does not resolve the extensionless TS imports of a worker thread by itself (tsx 4.19, Node 22), so this
// plain-JS entry registers tsx's ESM hooks in the worker and then loads the TS body.
import { register } from 'tsx/esm/api';

register();
await import('./tierGateWorker.ts');
