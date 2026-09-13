/**
 * `npm run playtest [-- --level N] [-- --seed S] [-- --seeds N]`
 * Headless balance run: for every level (or one), simulate (a) the reference player vs the enemies and
 * (b) an idle player vs the enemies, 50 ms ticks, AI every 500 ms, up to 180 s of sim time.
 *
 * Single-seed mode (default, `--seed S`): gates are (a) must win within 180 s; (b) must not win.
 * Multi-seed mode (`--seeds N`): runs (a) over seeds 1..N and prints per level wins/N, median win time,
 * worst time and the losing seeds. Gate: levels 1–8 must win every seed, later levels ≥ 95 %.
 * Exit 1 if any gate fails. Rng streams come from `rngsFor`, exactly as the game client derives them.
 */
import { performance } from 'node:perf_hooks';
import { LEVELS } from '../src/levels/index';
import { C, applyCommand, createState, getOutcome, step } from '../src/sim/index';
import type { Command, GameState, LevelDef, Outcome, Rng } from '../src/sim/index';
import { isAiTick, referencePlayerCommands, rngsFor, runAiTick } from '../src/ai/index';

const MAX_MS = 180_000;
const DEFAULT_SEED = 1;
/** Multi-seed gate: levels up to this id must win every seed. */
const TUTORIAL_BAND_LAST = 8;
/** Multi-seed gate for later levels. */
const LATER_WIN_RATE = 0.95;

interface RunResult {
  outcome: Outcome;
  timeMs: number;
  ticks: number;
}

type PlayerBot = ((state: GameState, rng: Rng) => Command[]) | undefined;

interface Args {
  level?: number;
  seed: number;
  seeds?: number;
}

function parseArgs(argv: string[]): Args {
  let level: number | undefined;
  let seed = DEFAULT_SEED;
  let seeds: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    if (arg === '--level' && next !== undefined) level = Number(next);
    else if (arg.startsWith('--level=')) level = Number(arg.slice('--level='.length));
    else if (arg === '--seeds' && next !== undefined) seeds = Number(next);
    else if (arg.startsWith('--seeds=')) seeds = Number(arg.slice('--seeds='.length));
    else if (arg === '--seed' && next !== undefined) seed = Number(next);
    else if (arg.startsWith('--seed=')) seed = Number(arg.slice('--seed='.length));
  }
  if (level !== undefined && !Number.isInteger(level)) throw new Error(`bad --level ${String(level)}`);
  if (!Number.isInteger(seed)) throw new Error(`bad --seed ${String(seed)}`);
  if (seeds !== undefined && (!Number.isInteger(seeds) || seeds < 1)) throw new Error(`bad --seeds ${String(seeds)}`);
  return { level, seed, seeds };
}

/** Run one headless game; the player bot may be undefined (idle). Rng streams as in the game client. */
export function runHeadless(level: LevelDef, seed: number, player: PlayerBot, maxMs = MAX_MS): RunResult {
  const state = createState(level, seed);
  const rngs = rngsFor(seed, level.enemies);
  let ticks = 0;
  let outcome = getOutcome(state);
  while (outcome === 'playing' && state.time < maxMs) {
    if (isAiTick(state)) {
      // Both sides decide on the same snapshot; the player's commands land first, like a human tap.
      const playerCmds = player ? player(state, rngs.player) : [];
      const enemyCmds = runAiTick(state, rngs.enemies);
      for (const cmd of playerCmds) applyCommand(state, cmd);
      for (const cmd of enemyCmds) applyCommand(state, cmd);
    }
    step(state, C.TICK_MS);
    ticks++;
    outcome = getOutcome(state);
  }
  return { outcome, timeMs: state.time, ticks };
}

function fmtTime(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function stars(level: LevelDef, timeMs: number): string {
  if (timeMs <= level.star3) return '***';
  if (timeMs <= level.star2) return '** ';
  return '*  ';
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function selectLevels(only: number | undefined): LevelDef[] {
  const levels = only === undefined ? LEVELS : LEVELS.filter((l) => l.id === only);
  if (levels.length === 0) {
    console.error(`No level with id ${String(only)}`);
    process.exit(1);
  }
  return levels;
}

/** Default mode: one seed, reference player and idle player, both gates. */
function runSingleSeed(levels: LevelDef[], seed: number): number {
  const header = `${pad('lvl', 4)} ${pad('name', 20)} ${pad('reference player', 24)} ${pad('idle player', 16)} gate`;
  console.log(`playtest  seed=${seed}  max=${fmtTime(MAX_MS)}  tick=${C.TICK_MS}ms  ai=${C.AI_TICK_MS}ms`);
  console.log(header);
  console.log('-'.repeat(header.length));

  let failed = 0;
  let totalTicks = 0;
  const t0 = performance.now();
  for (const level of levels) {
    const ref = runHeadless(level, seed, referencePlayerCommands);
    const idle = runHeadless(level, seed, undefined);
    totalTicks += ref.ticks + idle.ticks;

    const reasons: string[] = [];
    if (ref.outcome !== 'won') reasons.push(`reference player ${ref.outcome === 'lost' ? 'lost' : 'did not win'} by ${fmtTime(MAX_MS)}`);
    if (idle.outcome === 'won') reasons.push(`idle player won at ${fmtTime(idle.timeMs)}`);
    if (reasons.length) failed++;

    const refCell = ref.outcome === 'won' ? `won ${fmtTime(ref.timeMs)} ${stars(level, ref.timeMs)}` : `${ref.outcome} ${fmtTime(ref.timeMs)}`;
    const idleCell = idle.outcome === 'playing' ? `alive ${fmtTime(idle.timeMs)}` : `${idle.outcome} ${fmtTime(idle.timeMs)}`;
    const gate = reasons.length ? `FAIL: ${reasons.join('; ')}` : 'ok';
    console.log(`${pad(String(level.id), 4)} ${pad(level.name, 20)} ${pad(refCell, 24)} ${pad(idleCell, 16)} ${gate}`);
  }
  const elapsed = (performance.now() - t0) / 1000;
  console.log('-'.repeat(header.length));
  console.log(
    `${levels.length} level(s), ${failed} failed gate(s). perf: ${totalTicks} ticks in ${elapsed.toFixed(2)}s = ${Math.round(totalTicks / Math.max(elapsed, 1e-6))} ticks/s`,
  );
  return failed;
}

/** Required win rate for a level in multi-seed mode. */
export function winRateGate(levelId: number): number {
  return levelId <= TUTORIAL_BAND_LAST ? 1 : LATER_WIN_RATE;
}

interface SeedsRow {
  level: LevelDef;
  wins: number;
  medianMs: number | undefined;
  worstMs: number | undefined;
  losers: number[];
}

/** Reference player over seeds 1..n for one level. */
export function runSeeds(level: LevelDef, n: number): SeedsRow & { ticks: number } {
  const winTimes: number[] = [];
  const losers: number[] = [];
  let ticks = 0;
  for (let seed = 1; seed <= n; seed++) {
    const ref = runHeadless(level, seed, referencePlayerCommands);
    ticks += ref.ticks;
    if (ref.outcome === 'won') winTimes.push(ref.timeMs);
    else losers.push(seed);
  }
  winTimes.sort((a, b) => a - b);
  const mid = winTimes.length >> 1;
  const medianMs =
    winTimes.length === 0 ? undefined : winTimes.length % 2 ? winTimes[mid] : (winTimes[mid - 1]! + winTimes[mid]!) / 2;
  const worstMs = winTimes.length ? winTimes[winTimes.length - 1] : undefined;
  return { level, wins: winTimes.length, medianMs, worstMs, losers, ticks };
}

/** Multi-seed mode: reference player over seeds 1..n per level, win-rate gates by band. */
function runMultiSeed(levels: LevelDef[], n: number): number {
  const header = `${pad('lvl', 4)} ${pad('name', 20)} ${pad('wins', 9)} ${pad('median', 8)} ${pad('worst', 8)} ${pad('gate', 6)} losing seeds`;
  console.log(`playtest  seeds=1..${n}  max=${fmtTime(MAX_MS)}  gate: lvl 1-${TUTORIAL_BAND_LAST} 100%, later ≥ ${Math.round(LATER_WIN_RATE * 100)}%`);
  console.log(header);
  console.log('-'.repeat(header.length));

  let failed = 0;
  let totalTicks = 0;
  const t0 = performance.now();
  for (const level of levels) {
    const row = runSeeds(level, n);
    totalTicks += row.ticks;
    const rate = row.wins / n;
    const ok = rate >= winRateGate(level.id);
    if (!ok) failed++;
    const wins = `${row.wins}/${n}`;
    const median = row.medianMs === undefined ? '-' : fmtTime(row.medianMs);
    const worst = row.worstMs === undefined ? '-' : fmtTime(row.worstMs);
    const losers = row.losers.length ? row.losers.join(',') : '-';
    console.log(
      `${pad(String(level.id), 4)} ${pad(level.name, 20)} ${pad(wins, 9)} ${pad(median, 8)} ${pad(worst, 8)} ${pad(ok ? 'ok' : 'FAIL', 6)} ${losers}`,
    );
  }
  const elapsed = (performance.now() - t0) / 1000;
  console.log('-'.repeat(header.length));
  console.log(
    `${levels.length} level(s) x ${n} seed(s), ${failed} failed gate(s). perf: ${totalTicks} ticks in ${elapsed.toFixed(2)}s = ${Math.round(totalTicks / Math.max(elapsed, 1e-6))} ticks/s`,
  );
  return failed;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const levels = selectLevels(args.level);
  const failed = args.seeds === undefined ? runSingleSeed(levels, args.seed) : runMultiSeed(levels, args.seeds);
  if (failed > 0) process.exit(1);
}

main();
