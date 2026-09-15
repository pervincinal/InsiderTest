/**
 * Enemy personalities (GDD §2.5). Each is a pure function (state, enemy, rng) => Command[] called on
 * every AI tick (0.5 s). One action per own tower per tick. Thresholds are in attacker weight and
 * fortress-aware; `aggression` (0..1) lowers thresholds and raises how often a tower acts.
 */
import type { Command, EnemyDef, GameState, Tower } from '../sim/index';
import { Rng } from '../sim/index';
import { bridgeCutCommands } from './bridges';
import {
  clamp01,
  defenceMultiplier,
  effectiveDefenders,
  hostileNeighbours,
  ownedTowers,
  roadBetween,
  sendCommand,
  skipsAction,
  spendable,
  threatReserve,
  upgradeCost,
  wholeUnits,
  type Neighbour,
} from './common';

/** Opportunists always keep this many units at home. */
export const OPPORTUNIST_RESERVE = 5;

/** Weight that must arrive at the neighbour to flip it, plus what the road eats on the way. */
function costToTake(n: Neighbour): number {
  return effectiveDefenders(n.tower) + n.roadCost + n.oncoming;
}

function weakest(targets: Neighbour[], score: (n: Neighbour) => number): Neighbour | undefined {
  let best: Neighbour | undefined;
  let bestScore = Infinity;
  for (const n of targets) {
    const s = score(n);
    if (s < bestScore) {
      best = n;
      bestScore = s;
    }
  }
  return best;
}

/** Margin the rusher wants above the target: +3 at aggression 0, never below what a capture needs. */
export function rusherMargin(target: Tower, aggression: number): number {
  return Math.max(defenceMultiplier(target), 3 * (1 - clamp01(aggression)));
}

/** Turtle multiplier on the target's strength: ×2 at aggression 0, ×1 at aggression 1. */
export function turtleFactor(aggression: number): number {
  return 2 - clamp01(aggression);
}

/** Opportunist margin above the target: +2 at aggression 0, never below what a capture needs. */
export function opportunistMargin(target: Tower, aggression: number): number {
  return Math.max(defenceMultiplier(target), 2 * (1 - clamp01(aggression)));
}

/** Weight a tower can actually put on the road: spendable, in whole units of its kind (whole tanks). */
function sendableWeight(state: GameState, tower: Tower): number {
  return wholeUnits(tower, spendable(state, tower));
}

/** Rusher: from each own tower attack the weakest adjacent non-own target when strong enough. */
export function rusherCommands(state: GameState, enemy: EnemyDef, rng: Rng): Command[] {
  const cmds: Command[] = [];
  for (const tower of ownedTowers(state, enemy.owner)) {
    const available = sendableWeight(state, tower);
    if (available <= 0) continue;
    const target = weakest(hostileNeighbours(state, tower.id), costToTake);
    if (!target) continue;
    if (available < costToTake(target) + rusherMargin(target.tower, enemy.aggression)) continue;
    if (skipsAction(enemy, rng)) continue;
    const cmd = sendCommand(tower, target.tower.id, available);
    if (cmd) cmds.push(cmd);
  }
  return cmds;
}

/** Roads this tick's sendUnits commands use. */
function roadsUsedBy(state: GameState, cmds: readonly Command[]): Set<string> {
  const out = new Set<string>();
  for (const cmd of cmds) {
    if (cmd.type !== 'sendUnits') continue;
    const road = roadBetween(state, cmd.from, cmd.to);
    if (road) out.add(road.id);
  }
  return out;
}

/**
 * Turtle: upgrade to max level whenever affordable; otherwise attack only with ×2 superiority. It is also
 * the one personality that cuts a bridge (`bridges.ts`, the reference player's rule without cover — a
 * turtle never reinforces — and without the pre-emptive case): under a column that would take one of
 * its max-level towers (a fresh L1 capture is not worth a bridge to it, just as it does not attack
 * before max level), never under its own column and never its last route to an opponent.
 */
export function turtleCommands(state: GameState, enemy: EnemyDef, rng: Rng): Command[] {
  const cmds: Command[] = [];
  for (const tower of ownedTowers(state, enemy.owner)) {
    const cost = upgradeCost(tower);
    if (cost !== undefined && tower.units >= cost && tower.units - cost >= threatReserve(state, tower)) {
      if (skipsAction(enemy, rng)) continue;
      cmds.push({ type: 'upgrade', owner: enemy.owner, towerId: tower.id });
      continue;
    }
    if (cost !== undefined) continue; // still building up: no attacks before max level
    const available = sendableWeight(state, tower);
    if (available <= 0) continue;
    const target = weakest(hostileNeighbours(state, tower.id), costToTake);
    if (!target) continue;
    const needed = costToTake(target) * turtleFactor(enemy.aggression) + defenceMultiplier(target.tower);
    if (available < needed) continue;
    if (skipsAction(enemy, rng)) continue;
    const cmd = sendCommand(tower, target.tower.id, available);
    if (cmd) cmds.push(cmd);
  }
  const opts = { usedRoads: roadsUsedBy(state, cmds), preemptive: false, worthSaving: (t: Tower) => upgradeCost(t) === undefined };
  for (const cut of bridgeCutCommands(state, enemy.owner, opts)) {
    if (skipsAction(enemy, rng)) continue;
    cmds.push(cut);
  }
  return cmds;
}

/**
 * Opportunist: hit whichever adjacent tower has the fewest units regardless of owner, always keeping
 * 5 at home; when nothing is takeable and the tower is rich, upgrade.
 */
export function opportunistCommands(state: GameState, enemy: EnemyDef, rng: Rng): Command[] {
  const cmds: Command[] = [];
  for (const tower of ownedTowers(state, enemy.owner)) {
    const reserve = Math.max(OPPORTUNIST_RESERVE, threatReserve(state, tower));
    const available = wholeUnits(tower, tower.units - reserve);
    const target = weakest(hostileNeighbours(state, tower.id), (n) => n.tower.units * 1000 + costToTake(n));
    if (target && available >= costToTake(target) + opportunistMargin(target.tower, enemy.aggression)) {
      if (skipsAction(enemy, rng)) continue;
      const cmd = sendCommand(tower, target.tower.id, available);
      if (cmd) cmds.push(cmd);
      continue;
    }
    const cost = upgradeCost(tower);
    if (cost !== undefined && tower.units >= cost + reserve + OPPORTUNIST_RESERVE) {
      if (skipsAction(enemy, rng)) continue;
      cmds.push({ type: 'upgrade', owner: enemy.owner, towerId: tower.id });
    }
  }
  return cmds;
}
