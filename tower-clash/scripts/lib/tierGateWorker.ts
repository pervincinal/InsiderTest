/**
 * Worker thread of the Commander tier gate (`runTierGateJobs` in scripts/lib/tierGateRun.ts): runs one
 * job (the unmodified run or one tier alone, levels 1–16, K seeds) and posts its rows back.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { runTierGateJob } from './tierGateRun';
import type { TierGateJob } from './tierGateRun';

parentPort!.postMessage(await runTierGateJob(workerData as TierGateJob));
