/**
 * Enemy personalities (GDD §2.5, rules v2 §2.0). Each is a pure function (state, enemy, rng) => Command[]
 * called on every AI tick (0.5 s). An attack is a persistent stream (`link`); "reserve" means "unlink
 * when the source is threatened or the goal is reached". One decision per own tower per tick, gated by
 * `aggression` (0..1: lower thresholds, fewer skipped ticks). Thresholds are in attacker weight and
 * fortress-aware. Upgrades are automatic (rules v2): no personality issues `upgrade` or `sendUnits`.
 *
 * Rules v2.1 (GDD §2.0 "Under fire"): a tower being hit recruits nothing, so a stream's trickle keeps
 * landing on a garrison that no longer regrows. Every personality therefore attacks when
 * `siegeForce ≥ costToTake + margin`: the spendable burst plus, once that burst alone matches the
 * target's effective garrison, `siegeCredit` — the source's production over `SIEGE_PLAN_MS` (10 s) in
 * whole units, minus what the target still recruits between landings that far apart (nothing against
 * a barracks trickle; most of it against a lone tank factory); an opportunist's second stream gets
 * half the burst and half the trickle, gated the same way. A rusher L3 at 100 therefore streams at
 * a player L3 at 100 (v2: never), and any drained source at 0 is the weakest target on the map — the
 * counter a human plays against a thin trickle.
 *
 * Shared stream rules (every personality):
 *   - unlink everything when a hostile column approaches the source and its garrison is under the
 *     reserve it needs (`threatReserve`, opportunists at least 5): the production stays home;
 *   - unlink a stream whose target the enemy has captured once that target is "full": it holds
 *     `SUPPLY_FULL_UNITS` of its own (or its capacity, which the sim releases by itself);
 *   - never link a target the tower already streams to; respect `maxLinksOf` and the personality's own
 *     cap (`ENEMY_MAX_LINKS` = 1; an opportunist may run `OPPORTUNIST_MAX_LINKS` = 2 at L2+).
 */
import type { Command, EnemyDef, GameState, Tower } from '../sim/index';
import { Rng, capacityOf, linksFrom, maxLinksOf } from '../sim/index';
import { bridgeCutCommands } from './bridges';
import {
  atMaxLevel,
  clamp01,
  defenceMultiplier,
  effectiveDefenders,
  hostileNeighbours,
  incomingThreat,
  linkCommand,
  ownedTowers,
  roadBetween,
  siegeCredit,
  skipsAction,
  spendable,
  threatReserve,
  unlinkCommand,
  wholeUnits,
  SIEGE_PLAN_MS,
  type Neighbour,
} from './common';

/** Opportunists always keep this many units at home (they stop their streams when it is threatened below that). */
export const OPPORTUNIST_RESERVE = 5;
/** Streams per tower a rusher or turtle runs, whatever the level allows. */
export const ENEMY_MAX_LINKS = 1;
/** Streams per tower an opportunist may run once its level allows (L2+). */
export const OPPORTUNIST_MAX_LINKS = 2;
/**
 * A captured target counts as "full" for an enemy supply line once it holds this many units of its own
 * (or its capacity, whichever is lower): enough to stand on its own; the source then grows again.
 */
export const SUPPLY_FULL_UNITS = 5;

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

/**
 * Rules v2.1: what a stream from `tower` at `target` lands within the siege plan — the burst it can
 * send now plus its production over `SIEGE_PLAN_MS`, net of what the target still recruits between
 * landings. The trickle counts only when the burst alone already matches the target's effective
 * garrison: a siege is opened with a real wave and finished by the trickle, never opened by the
 * trickle alone. (Measured 2026-09-17 over levels 1–40 × seeds 1–5: crediting the trickle to any
 * tower with a unit to send makes every freshly captured 1-unit tower stream onward at once, so a
 * rusher becomes a chain of drained towers pouring 3/s at the front — 19 failed gates against 10 with
 * this rule, and the tutorial band 5 and 8 lost 4/5.)
 */
export function siegeForce(state: GameState, tower: Tower, burst: number, target: Tower, share = 1): number {
  if (burst <= 0) return 0;
  if (burst < effectiveDefenders(target)) return burst;
  return burst + Math.floor(siegeCredit(tower, target, SIEGE_PLAN_MS, state) / share);
}

/** Garrison at which the enemy stops supplying a captured target. */
export function supplyFull(state: GameState, target: Tower): number {
  return Math.min(SUPPLY_FULL_UNITS, capacityOf(target, state));
}

/**
 * Stream maintenance shared by every personality: `unlink` commands for `tower` this tick, and whether
 * the tower is under threat (then it links nothing new). `reserve` is what it must keep at home.
 */
function maintain(state: GameState, tower: Tower, reserve: number): { cmds: Command[]; threatened: boolean } {
  const links = linksFrom(state, tower.id);
  if (links.length === 0) return { cmds: [], threatened: false };
  if (incomingThreat(state, tower.id) > 0 && tower.units < reserve) return { cmds: [unlinkCommand(tower)], threatened: true };
  const cmds: Command[] = [];
  for (const l of links) {
    const target = state.towers[l.to];
    if (target && target.owner === tower.owner && target.units >= supplyFull(state, target)) cmds.push(unlinkCommand(tower, l.to));
  }
  return { cmds, threatened: false };
}

/** Targets the tower does not stream to yet. */
function openTargets(state: GameState, tower: Tower): Neighbour[] {
  const linked = new Set(linksFrom(state, tower.id).map((l) => l.to));
  return hostileNeighbours(state, tower.id).filter((n) => !linked.has(n.tower.id));
}

/** Link slots left for this personality after `removed` of its links end this tick. */
function slotsLeft(state: GameState, tower: Tower, cap: number, removed: number): number {
  return Math.min(cap, maxLinksOf(tower)) - (linksFrom(state, tower.id).length - removed);
}

/**
 * Rusher: from each own tower stream into the weakest adjacent non-own target as soon as the garrison
 * plus its siege trickle (`siegeForce`) is ≥ what the capture needs + `rusherMargin`; keeps the stream
 * until the target is captured and full or a hostile column approaches while the garrison is under its
 * reserve.
 */
export function rusherCommands(state: GameState, enemy: EnemyDef, rng: Rng): Command[] {
  const cmds: Command[] = [];
  for (const tower of ownedTowers(state, enemy.owner)) {
    const m = maintain(state, tower, threatReserve(state, tower));
    const mine: Command[] = [...m.cmds];
    if (!m.threatened && slotsLeft(state, tower, ENEMY_MAX_LINKS, m.cmds.length) > 0) {
      const available = sendableWeight(state, tower);
      const target = weakest(openTargets(state, tower), costToTake);
      if (target && siegeForce(state, tower, available, target.tower) >= costToTake(target) + rusherMargin(target.tower, enemy.aggression)) {
        mine.push(linkCommand(tower, target.tower.id));
      }
    }
    if (mine.length === 0 || skipsAction(enemy, rng)) continue;
    cmds.push(...mine);
  }
  return cmds;
}

/** Roads used by this tick's link commands plus the enemy's active streams. */
function roadsUsedBy(state: GameState, self: EnemyDef['owner'], cmds: readonly Command[]): Set<string> {
  const out = new Set<string>();
  for (const l of state.links) if (l.owner === self) out.add(l.roadId);
  for (const cmd of cmds) {
    if (cmd.type !== 'link') continue;
    const road = roadBetween(state, cmd.from, cmd.to);
    if (road) out.add(road.id);
  }
  return out;
}

/**
 * Turtle: no attacks before the tower is at its top level — with rules v2 that means letting it grow,
 * unlinked, to 100 (a fortress to 75 at L2); then it streams into the weakest adjacent target when its
 * garrison plus its siege trickle (`siegeForce`) is ≥ that target × (2 − aggression) + 1. It is also the one personality that cuts a bridge
 * (`bridges.ts`, the reference player's rule without cover — a turtle never reinforces — and without the
 * pre-emptive case): under a column that would take one of its finished keeps (a fresh L1 capture is
 * not worth a bridge to it, just as it does not attack before max level), never under its own stream
 * and never its last route to an opponent.
 */
export function turtleCommands(state: GameState, enemy: EnemyDef, rng: Rng): Command[] {
  const cmds: Command[] = [];
  for (const tower of ownedTowers(state, enemy.owner)) {
    const m = maintain(state, tower, threatReserve(state, tower));
    const mine: Command[] = [...m.cmds];
    if (!m.threatened && atMaxLevel(tower) && slotsLeft(state, tower, ENEMY_MAX_LINKS, m.cmds.length) > 0) {
      const available = sendableWeight(state, tower);
      const target = weakest(openTargets(state, tower), costToTake);
      if (target && available > 0) {
        const needed = costToTake(target) * turtleFactor(enemy.aggression) + defenceMultiplier(target.tower);
        if (siegeForce(state, tower, available, target.tower) >= needed) mine.push(linkCommand(tower, target.tower.id));
      }
    }
    if (mine.length === 0 || skipsAction(enemy, rng)) continue;
    cmds.push(...mine);
  }
  const opts = { usedRoads: roadsUsedBy(state, enemy.owner, cmds), preemptive: false, worthSaving: (t: Tower) => atMaxLevel(t) };
  for (const cut of bridgeCutCommands(state, enemy.owner, opts)) {
    if (skipsAction(enemy, rng)) continue;
    cmds.push(cut);
  }
  return cmds;
}

/**
 * Opportunist: stream into whichever adjacent tower has the fewest units regardless of owner, keeping 5
 * at home in the sense of rules v2 — it stops its streams when a column approaches and it holds fewer —
 * and only starting one when the units above that reserve plus its siege trickle can flip the target
 * (+ `opportunistMargin`). At L2+ it may run two streams: the second target must be takeable with half
 * the garrison and half the trickle, and so must the first (the drain is shared round-robin).
 */
export function opportunistCommands(state: GameState, enemy: EnemyDef, rng: Rng): Command[] {
  const cmds: Command[] = [];
  for (const tower of ownedTowers(state, enemy.owner)) {
    const reserve = Math.max(OPPORTUNIST_RESERVE, threatReserve(state, tower));
    const m = maintain(state, tower, reserve);
    const mine: Command[] = [...m.cmds];
    const slots = m.threatened ? 0 : slotsLeft(state, tower, OPPORTUNIST_MAX_LINKS, m.cmds.length);
    if (slots > 0) {
      const available = wholeUnits(tower, tower.units - reserve);
      const need = (n: Neighbour) => costToTake(n) + opportunistMargin(n.tower, enemy.aggression);
      const ranked = openTargets(state, tower).sort((a, b) => a.tower.units - b.tower.units || costToTake(a) - costToTake(b));
      const first = ranked[0];
      const second = ranked[1];
      if (first && siegeForce(state, tower, available, first.tower) >= need(first)) {
        mine.push(linkCommand(tower, first.tower.id));
        // Two streams share the drain and the trickle round-robin: half of each must cover both targets.
        const half = (n: Neighbour) => siegeForce(state, tower, wholeUnits(tower, Math.floor(available / 2)), n.tower, 2);
        if (slots > 1 && second && half(first) >= need(first) && half(second) >= need(second)) mine.push(linkCommand(tower, second.tower.id));
      }
    }
    if (mine.length === 0 || skipsAction(enemy, rng)) continue;
    cmds.push(...mine);
  }
  return cmds;
}
