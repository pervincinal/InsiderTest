/**
 * Public AI API. Controllers are pure functions of (state, rng) and return commands only; the caller
 * applies them with `applyCommand` on every AI tick (`C.AI_TICK_MS`, see `isAiTick`).
 */
import type { Command, EnemyDef, GameState, Owner } from '../sim/index';
import { Rng } from '../sim/index';
import { opportunistCommands, rusherCommands, turtleCommands } from './personalities';

export { referencePlayerCommands } from './referencePlayer';
export type { RuleTrace } from './referencePlayer';
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

/**
 * Commands for every enemy listed in the level, in level order. `rng` is either one shared stream or a
 * per-owner map (see `rngsFor`); an enemy without a stream in the map is skipped.
 */
export function runAiTick(state: GameState, rng: Rng | ReadonlyMap<Owner, Rng>): Command[] {
  const cmds: Command[] = [];
  for (const enemy of state.enemies) {
    const r = rng instanceof Rng ? rng : rng.get(enemy.owner);
    if (r) cmds.push(...enemyCommands(state, enemy, r));
  }
  return cmds;
}

/** Player rng seed for a game seed (mirrors the game client, `ui/play.ts`). */
export const PLAYER_RNG_SALT = 0x9e3779b9;
/** Per-enemy rng seed stride for a game seed (mirrors the game client, `ui/play.ts`). */
export const ENEMY_RNG_STRIDE = 1013904223;

/**
 * The rng streams one game uses: one for the player's bot (autoplay / playtest) and one per enemy in
 * level order. The game client and the headless playtest must both derive them from here so a seed
 * replays the same game in the browser and on the command line.
 */
export function rngsFor(seed: number, enemies: readonly EnemyDef[]): { player: Rng; enemies: Map<Owner, Rng> } {
  const player = new Rng((seed ^ PLAYER_RNG_SALT) >>> 0);
  const map = new Map<Owner, Rng>();
  enemies.forEach((e, i) => map.set(e.owner, new Rng((seed + ENEMY_RNG_STRIDE * (i + 1)) >>> 0)));
  return { player, enemies: map };
}
