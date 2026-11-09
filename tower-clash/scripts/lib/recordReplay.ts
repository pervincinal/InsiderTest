import type { GameState, LevelDef, Replay } from '../../src/sim/index';
import { C, applyCommand, createState, finishReplay, getOutcome, newReplay, recordInto, step } from '../../src/sim/index';
import { isAiTick, rngsFor, runAiTick } from '../../src/ai/index';
import type { PlayerBot } from '../../src/ai/headless';
import { HEADLESS_MAX_MS } from '../../src/ai/headless';

/**
 * `runHeadless` (src/ai/headless.ts) with a replay record (SIM-R1): the same loop, the same rng streams,
 * the player's commands first on every AI tick, every applied command recorded with `a: 1` (both sides
 * are bots here). Used by `scripts/replay.ts --record` (the committed fixture tests/fixtures/replay-l15-s1.json),
 * tests/sim/replayRecord.test.ts and tests/ui/replayRing.test.ts; kept out of `src/` because the sim layer
 * must not import the AI and the game never records headlessly.
 */
export function recordHeadless(level: LevelDef, seed: number, player: PlayerBot, maxMs = HEADLESS_MAX_MS): { replay: Replay; state: GameState } {
  const state = createState(level, seed);
  const replay = newReplay(level, state);
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
