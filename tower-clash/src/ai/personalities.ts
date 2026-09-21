/**
 * Enemy personalities (rules v3, GDD §2.0b rule 10 / §2.5). Each is a pure function
 * (state, enemy, rng) => Command[] called on every AI tick (0.5 s); they read only what a human sees.
 *
 * Under v3 a stream lands its source's rate whatever the source holds, so the enemies weigh "grow now
 * (the next level = a faster stream and one more link) vs attack now" through one number: the plan
 * horizon `SIEGE_PLAN_S` — a target is takeable when the links a tower (with its neighbours) can afford
 * make it fall within that horizon (`siegePlan`: first landing after the travel time, then
 * `(units + 1) / net rate` seconds of landings with the target under fire and regenerating nothing).
 *   rusher      — links as soon as any target falls within its horizon (30 s); never waits for a level;
 *                 one ribbon per tower (`RUSHER_MAX_LINKS`), the weakest target first.
 *   turtle      — attacks only from towers at L2 or above (`TURTLE_MIN_LEVEL`): its towers grow first,
 *                 then use every link their level allows (`TURTLE_MAX_LINKS`) within 45 s; its finished
 *                 keeps supply neighbours that still grow.
 *   opportunist — prefers targets already under fire from someone else (they regenerate nothing and
 *                 fall to the sum), up to two ribbons per tower, 45 s horizon.
 * Aggression `a` (0..1): a tower's decisions are skipped this tick with probability `(1 − a) × 0.5`, the
 * plan horizon is scaled by `0.5 + 0.5 × a` (an enemy at a = 0 only takes what falls in half the time),
 * and below `DEFENCE_MIN_AGGRESSION` the enemy does not defend at all (tutorial enemies).
 * From there every personality defends the same way (GDD §2.5 defence): reinforce a falling tower from
 * a neighbour when that makes it hold, else besiege the attacker's source from a second tower, else
 * stream back on the same lane when its rate is at least the attacker's (the streams cancel and nothing lands).
 */
import type { Command, EnemyDef, GameState, Tower } from '../sim/index';
import { Rng, isUnderFire } from '../sim/index';
import { clamp01, hopsToOpponent, isCapped, linksTo, skipsAction, type Plan } from './common';
import { actors, attack, defend, maintain, newCtx, reclaimForAttack, supply, type Ctx } from './tactics';

/** Plan horizon per personality: a target must fall within this (× the aggression scale) to be attacked, seconds. */
export const SIEGE_PLAN_S = Object.freeze({ rusher: 30, turtle: 45, opportunist: 45 });
/** An attack whose target no longer falls within this ends (unless the stream shields its source), ms. */
export const HOPELESS_MS = 60_000;
/** Horizon for a counter-siege of an attacker's source, ms. */
export const COUNTER_PLAN_MS = 30_000;
/** Ribbons per tower: rusher one whatever its level; opportunist two (from L2); turtle every link its level allows. */
export const RUSHER_MAX_LINKS = 1;
export const OPPORTUNIST_MAX_LINKS = 2;
export const TURTLE_MAX_LINKS = 3;
/** The turtle opens no attack from a tower below this level (it grows first). */
export const TURTLE_MIN_LEVEL = 2;
/**
 * Enemies below this aggression never defend (no reinforcement, counter or shield): a tutorial enemy
 * only attacks and lets its towers be taken. From this value up the defence is the full GDD §2.5 rule.
 */
export const DEFENCE_MIN_AGGRESSION = 0.35;
/**
 * An enemy supply line into a tower it captured ends once the target holds this many units of its own
 * (or its capacity, which the sim releases by itself) — unless the source is a capped keep, whose
 * production is free.
 */
export const SUPPLY_FULL_UNITS = 5;

/** Plan horizon in ms for a personality at an aggression. */
export function planMsFor(personality: keyof typeof SIEGE_PLAN_S, aggression: number): number {
  return SIEGE_PLAN_S[personality] * 1000 * (0.5 + 0.5 * clamp01(aggression));
}

/** True when another owner (not `owner`, not the target's own) has a stream into the tower or it is under fire. */
export function underFireByOther(state: GameState, tower: Tower, owner: EnemyDef['owner']): boolean {
  if (linksTo(state, tower.id).some((l) => l.owner !== owner && l.owner !== tower.owner)) return true;
  return isUnderFire(state, tower) && !linksTo(state, tower.id).some((l) => l.owner === owner);
}

function keepEnemySupply(ctx: Ctx, source: Tower, target: Tower): boolean {
  if (isCapped(ctx.state, source)) return true;
  return target.units < SUPPLY_FULL_UNITS;
}

interface PersonalityConfig {
  cap: number;
  planMs: number;
  sources?: (tower: Tower) => boolean;
  score?: (target: Tower, plan: Plan) => number;
  supplies?: boolean;
  anticipate?: boolean;
  /** Drop a shield for an attack that wins its race (rusher, opportunist). */
  races?: boolean;
}

/** The shared tick: aggression gate → maintain → defend → attack (→ supply). */
function run(state: GameState, enemy: EnemyDef, rng: Rng, cfg: PersonalityConfig): Command[] {
  const ctx = newCtx(state, enemy.owner);
  // One rng draw per own tower, in level order, whatever the tower does this tick (determinism).
  for (const t of actors(ctx)) if (skipsAction(enemy, rng)) ctx.skipped.add(t.id);
  const towers = actors(ctx);
  for (const t of towers) maintain(ctx, t, { hopelessMs: HOPELESS_MS, keepSupply: keepEnemySupply });
  if (clamp01(enemy.aggression) >= DEFENCE_MIN_AGGRESSION) for (const t of towers) defend(ctx, t, { counterMs: COUNTER_PLAN_MS, cap: cfg.cap });
  attack(ctx, {
    planMs: cfg.planMs,
    cap: cfg.cap,
    sources: cfg.sources,
    score: cfg.score,
    anticipate: cfg.anticipate,
    reclaim: (c, source, plan) => reclaimForAttack(c, source, plan, cfg.races === true),
  });
  if (cfg.supplies) supply(ctx, hopsToOpponent(state, enemy.owner), cfg.cap);
  return ctx.cmds;
}

/** Rusher: any tower streams at the hostile neighbour that falls soonest within 30 s (scaled by aggression). */
export function rusherCommands(state: GameState, enemy: EnemyDef, rng: Rng): Command[] {
  return run(state, enemy, rng, { cap: RUSHER_MAX_LINKS, planMs: planMsFor('rusher', enemy.aggression), races: true });
}

/** Turtle: towers grow to L2 before their first attack, then use every link; capped keeps supply neighbours. */
export function turtleCommands(state: GameState, enemy: EnemyDef, rng: Rng): Command[] {
  return run(state, enemy, rng, {
    cap: TURTLE_MAX_LINKS,
    planMs: planMsFor('turtle', enemy.aggression),
    sources: (t) => t.level >= TURTLE_MIN_LEVEL,
    supplies: true,
    anticipate: true,
  });
}

/** Opportunist: targets already under fire from someone else come first, then whatever falls soonest. */
export function opportunistCommands(state: GameState, enemy: EnemyDef, rng: Rng): Command[] {
  return run(state, enemy, rng, {
    cap: OPPORTUNIST_MAX_LINKS,
    planMs: planMsFor('opportunist', enemy.aggression),
    score: (target, plan) => plan.siege.fallsAtMs - (underFireByOther(state, target, enemy.owner) ? HOPELESS_MS : 0),
    races: true,
  });
}
