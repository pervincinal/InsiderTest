/**
 * Public AI API. Controllers are pure functions of (state, rng) and return commands only; the caller
 * applies them with `applyCommand` on every AI tick (`C.AI_TICK_MS`, see `isAiTick`).
 */
import type { Command, EnemyDef, GameState } from '../sim/index';
import { Rng } from '../sim/index';
import { opportunistCommands, rusherCommands, turtleCommands } from './personalities';

export { referencePlayerCommands } from './referencePlayer';
export { rusherCommands, turtleCommands, opportunistCommands, OPPORTUNIST_RESERVE } from './personalities';
export {
  isAiTick,
  ownedTowers,
  neighbours,
  hostileNeighbours,
  enemyNeighbours,
  friendlyNeighbours,
  incomingThreat,
  incomingSupport,
  effectiveDefenders,
  hopsToOpponent,
} from './common';
export type { Neighbour } from './common';

/** Commands for one enemy this AI tick, according to its personality and aggression. */
export function enemyCommands(state: GameState, enemy: EnemyDef, rng: Rng): Command[] {
  switch (enemy.personality) {
    case 'rusher':
      return rusherCommands(state, enemy, rng);
    case 'turtle':
      return turtleCommands(state, enemy, rng);
    case 'opportunist':
      return opportunistCommands(state, enemy, rng);
    default:
      return [];
  }
}

/** Commands for every enemy listed in the level, in level order. */
export function runAiTick(state: GameState, rng: Rng): Command[] {
  const cmds: Command[] = [];
  for (const enemy of state.enemies) cmds.push(...enemyCommands(state, enemy, rng));
  return cmds;
}
