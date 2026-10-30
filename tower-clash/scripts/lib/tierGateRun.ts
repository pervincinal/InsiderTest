/**
 * The simulation half of the Commander tier gate (AUD-B1): one gate run — the naive line in both tie
 * orders at the default reaction and the reference player — on levels 1–16 over seeds 1..K, with one
 * tier's modifiers or none. `runTierGateJobs` spreads the runs (unmodified + every tier) over worker
 * threads (scripts/lib/tierGateWorker.mjs → tierGateWorker.ts); each run is a pure function of (levels, K, modifiers), so the
 * rows do not depend on the worker count or the order the jobs finish in. The decision is
 * `tierGateFailures` (scripts/lib/tierGate.ts); the table is printed by scripts/playtest.ts.
 */
import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';
import { loadAllLevels } from '../../src/levels/index';
import type { LevelDef, PlayerModifiers } from '../../src/sim/index';
import { referencePlayerCommands } from '../../src/ai/index';
import { runHeadless } from '../../src/ai/headless';
import { NAIVE_REACT_MS, runNaive } from './naivePlayer';
import type { NaiveTie } from './naivePlayer';
import { TIER_GATE_FROM, TIER_GATE_TO, tierModifiers } from './tierGate';
import type { TierGateLine, TierGateRow, UpgradeTier } from './tierGate';

export interface TierGateRunResult {
  rows: TierGateRow[];
  ticks: number;
  /** Wall time of this run, ms (informational). */
  ms: number;
}

function medianOf(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const NAIVE_LINES: readonly (readonly [TierGateLine, NaiveTie])[] = [
  ['naive', 'asc'],
  ['naive tie desc', 'desc'],
];

/** One gate run on `levels` over seeds 1..k with `mods` (undefined = unmodified); rows per level in `TIER_GATE_LINES` order. */
export function tierGateRun(levels: readonly LevelDef[], k: number, mods: Readonly<PlayerModifiers> | undefined): TierGateRunResult {
  const start = performance.now();
  const rows: TierGateRow[] = [];
  let ticks = 0;
  for (const level of levels) {
    for (const [line, tie] of NAIVE_LINES) {
      const r = runNaive(level, k, NAIVE_REACT_MS, undefined, tie, mods);
      ticks += r.ticks;
      rows.push({ levelId: level.id, name: level.name, line, k, wins: r.wins, losers: r.losers, ...(r.medianMs !== undefined ? { medianMs: r.medianMs } : {}) });
    }
    const winTimes: number[] = [];
    const losers: number[] = [];
    for (let seed = 1; seed <= k; seed++) {
      const r = runHeadless(level, seed, referencePlayerCommands, mods ? { modifiers: mods } : {});
      ticks += r.ticks;
      if (r.outcome === 'won') winTimes.push(r.timeMs);
      else losers.push(seed);
    }
    const medianMs = medianOf(winTimes);
    rows.push({ levelId: level.id, name: level.name, line: 'reference', k, wins: winTimes.length, losers, ...(medianMs !== undefined ? { medianMs } : {}) });
  }
  return { rows, ticks, ms: performance.now() - start };
}

/** Levels the gate covers (1–16), id order. */
export async function tierGateLevels(): Promise<LevelDef[]> {
  return (await loadAllLevels()).filter((l) => l.id >= TIER_GATE_FROM && l.id <= TIER_GATE_TO);
}

/** One job of the gate: the unmodified run (`tier` null) or one tier alone. */
export interface TierGateJob {
  tier: UpgradeTier | null;
  k: number;
}

/** Run one job in this thread. */
export async function runTierGateJob(job: TierGateJob): Promise<TierGateRunResult> {
  return tierGateRun(await tierGateLevels(), job.k, job.tier ? tierModifiers(job.tier) : undefined);
}

/**
 * Run `jobs` on up to `threads` worker threads (1 = in this thread, no worker); results in `jobs` order.
 * `onDone(i, result)` fires as each job finishes (any order).
 */
export async function runTierGateJobs(jobs: readonly TierGateJob[], threads: number, onDone?: (i: number, r: TierGateRunResult) => void): Promise<TierGateRunResult[]> {
  const results: TierGateRunResult[] = new Array(jobs.length);
  if (threads <= 1) {
    for (let i = 0; i < jobs.length; i++) {
      results[i] = await runTierGateJob(jobs[i]!);
      onDone?.(i, results[i]!);
    }
    return results;
  }
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await new Promise<TierGateRunResult>((resolve, reject) => {
        const w = new Worker(new URL('./tierGateWorker.mjs', import.meta.url), { workerData: jobs[i] });
        w.once('message', (r: TierGateRunResult) => resolve(r));
        w.once('error', reject);
        w.once('exit', (code) => {
          if (code !== 0) reject(new Error(`tier gate worker for job ${i} exited with code ${code}`));
        });
      });
      onDone?.(i, results[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(threads, jobs.length) }, lane));
  return results;
}
