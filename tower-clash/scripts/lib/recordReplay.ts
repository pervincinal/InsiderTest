import type { GameState, LevelDef, PlayerModifiers, Replay, ReplayChallenge } from '../../src/sim/index';
import { C, applyCommand, createState, finishReplay, getOutcome, newReplay, recordInto, step } from '../../src/sim/index';
import { isAiTick, rngsFor, runAiTick } from '../../src/ai/index';
import type { PlayerBot } from '../../src/ai/headless';
import { HEADLESS_MAX_MS } from '../../src/ai/headless';
import type { RebuiltChallenge } from '../../src/daily/replayLevel';

/**
 * `runHeadless` (src/ai/headless.ts) with a replay record (SIM-R1): the same loop, the same rng streams,
 * the player's commands first on every AI tick, every applied command recorded with `a: 1` (both sides
 * are bots here). Used by `scripts/replay.ts --record` (the committed fixture tests/fixtures/replay-l15-s1.json),
 * tests/sim/replayRecord.test.ts and tests/ui/replayRing.test.ts; kept out of `src/` because the sim layer
 * must not import the AI and the game never records headlessly.
 *
 * SIM-R2: `options.modifiers` are the player's modifiers (a challenge's twist; default `DEFAULT_MODIFIERS` like
 * the campaign without upgrades) and `options.challenge` the record's Daily / Weekly descriptor — `recordChallengeHeadless`
 * fills both from a rebuilt challenge (`src/daily/replayLevel.ts`), the way the play screen does for a live one.
 */
export interface RecordOptions {
  modifiers?: Readonly<PlayerModifiers>;
  challenge?: ReplayChallenge;
}

export function recordHeadless(level: LevelDef, seed: number, player: PlayerBot, maxMs = HEADLESS_MAX_MS, options: RecordOptions = {}): { replay: Replay; state: GameState } {
  const state = createState(level, seed, options.modifiers ? { ...options.modifiers } : undefined);
  const replay = newReplay(level, state);
  if (options.challenge) replay.challenge = { ...options.challenge };
  const rngs = rngsFor(seed, level.enemies);
  while (getOutcome(state) === 'playing' && state.time < maxMs) {
    if (isAiTick(state)) {
      const playerCmds = player ? player(state, rngs.player) : [];
      const enemyCmds = runAiTick(state, rngs.enemies, undefined, level.ai);
      for (const cmd of [...playerCmds, ...enemyCmds]) {
        recordInto(replay, state, cmd, true);
        applyCommand(state, cmd);
      }
    }
    step(state, C.TICK_MS);
  }
  return { replay: finishReplay(replay, state), state };
}

/** SIM-R2: a headless record of a Daily / Weekly Challenge — its level (`level.id` must be the challenge's), seed, twist modifiers and descriptor. */
export function recordChallengeHeadless(level: LevelDef, challenge: RebuiltChallenge, player: PlayerBot, maxMs = HEADLESS_MAX_MS): { replay: Replay; state: GameState } {
  if (level.id !== challenge.levelId) throw new Error(`recordChallengeHeadless: ${challenge.kind} ${challenge.key} plays level ${challenge.levelId}, level ${level.id} given`);
  return recordHeadless(level, challenge.seed, player, maxMs, { modifiers: challenge.twist.modifiers, challenge: { kind: challenge.kind, key: challenge.key, twist: challenge.twist.id } });
}
