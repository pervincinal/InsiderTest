/**
 * `npm run playtest [-- --level N] [-- --seed S]`
 * Headless balance run: for every level (or one), simulate (a) the reference player vs the enemies and
 * (b) an idle player vs the enemies, 50 ms ticks, AI every 500 ms, up to 180 s of sim time.
 * Gates: (a) must win within 180 s; (b) must not win. Exit 1 if any gate fails.
 */
import { performance } from 'node:perf_hooks';
import { LEVELS } from '../src/levels/index';
import { C, Rng, applyCommand, createState, getOutcome, step } from '../src/sim/index';
import type { Command, GameState, LevelDef, Outcome } from '../src/sim/index';
import { isAiTick, referencePlayerCommands, runAiTick } from '../src/ai/index';

const MAX_MS = 180_000;
const DEFAULT_SEED = 1;

interface RunResult {
  outcome: Outcome;
  timeMs: number;
  ticks: number;
}

type PlayerBot = ((state: GameState, rng: Rng) => Command[]) | undefined;

function parseArgs(argv: string[]): { level?: number; seed: number } {
  let level: number | undefined;
  let seed = DEFAULT_SEED;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    if (arg === '--level' && next !== undefined) level = Number(next);
    else if (arg.startsWith('--level=')) level = Number(arg.slice('--level='.length));
    else if (arg === '--seed' && next !== undefined) seed = Number(next);
    else if (arg.startsWith('--seed=')) seed = Number(arg.slice('--seed='.length));
  }
  if (level !== undefined && !Number.isInteger(level)) throw new Error(`bad --level ${String(level)}`);
  if (!Number.isInteger(seed)) throw new Error(`bad --seed ${String(seed)}`);
  return { level, seed };
}

/** Run one headless game; the player bot may be undefined (idle). */
export function runHeadless(level: LevelDef, seed: number, player: PlayerBot, maxMs = MAX_MS): RunResult {
  const state = createState(level, seed);
  const enemyRng = new Rng(seed);
  const playerRng = new Rng(seed ^ 0x5bd1e995);
  let ticks = 0;
  let outcome = getOutcome(state);
  while (outcome === 'playing' && state.time < maxMs) {
    if (isAiTick(state)) {
      // Both sides decide on the same snapshot; the player's commands land first, like a human tap.
      const playerCmds = player ? player(state, playerRng) : [];
      const enemyCmds = runAiTick(state, enemyRng);
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

function main(): void {
  const { level: only, seed } = parseArgs(process.argv.slice(2));
  const levels = only === undefined ? LEVELS : LEVELS.filter((l) => l.id === only);
  if (levels.length === 0) {
    console.error(`No level with id ${String(only)}`);
    process.exit(1);
  }

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
  if (failed > 0) process.exit(1);
}

main();
