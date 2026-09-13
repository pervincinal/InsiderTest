/**
 * Headless match runner shared by `scripts/playtest.ts` and the AI tests: one level, one seed, an
 * optional player bot (undefined = idle player), the level's enemies, 50 ms ticks, AI every
 * `C.AI_TICK_MS`. Rng streams come from `rngsFor`, exactly as the game client derives them, so a seed
 * replays the same match here, in the browser and in a test. Pure: no DOM, no clock, no globals.
 */
import type { Command, GameState, LevelDef, Outcome, PlayerModifiers, Rng } from '../sim/index';
import { C, DEFAULT_MODIFIERS, applyCommand, createState, getOutcome, step } from '../sim/index';
import { rngsFor, runAiTick } from './index';
import { isAiTick } from './common';

/** Sim-time budget for one headless match (GDD §3: every level is winnable in under 3 min). */
export const HEADLESS_MAX_MS = 180_000;

export type PlayerBot = ((state: GameState, rng: Rng) => Command[]) | undefined;

export interface RunResult {
  outcome: Outcome;
  /** Sim time when the match ended (or the budget ran out), ms. */
  timeMs: number;
  ticks: number;
}

export interface RunOptions {
  /** Player's commander upgrades; enemies never get any. Default: none. */
  modifiers?: Readonly<PlayerModifiers>;
  /** Sim-time budget, ms. */
  maxMs?: number;
}

/** Run one headless match. Both sides decide on the same snapshot; the player's commands land first, like a human tap. */
export function runHeadless(level: LevelDef, seed: number, player: PlayerBot, options: RunOptions = {}): RunResult {
  const maxMs = options.maxMs ?? HEADLESS_MAX_MS;
  const state = createState(level, seed, options.modifiers ?? DEFAULT_MODIFIERS);
  const rngs = rngsFor(seed, level.enemies);
  let ticks = 0;
  let outcome = getOutcome(state);
  while (outcome === 'playing' && state.time < maxMs) {
    if (isAiTick(state)) {
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

/** Stars a finished match earns on its level: 3/2/1 for a win by the level's clocks, 0 for anything else. */
export function starsFor(level: LevelDef, result: RunResult): 0 | 1 | 2 | 3 {
  if (result.outcome !== 'won') return 0;
  if (result.timeMs <= level.star3) return 3;
  if (result.timeMs <= level.star2) return 2;
  return 1;
}
