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
 * The one thing an enemy carries between ticks is its per-match memory (`memory.ts`, AUD-A11): a shield that
 * a rival's stream cancels with nothing landing on either tower for `STANDOFF_RELEASE_MS` is dropped and
 * its lane left alone until something lands there again.
 */
import type { Command, EnemyDef, GameState, Personality, Tower } from '../sim/index';
import { Rng, isUnderFire } from '../sim/index';
import { clamp01, hopsToOpponent, isCapped, linksTo, skipsAction, type Plan } from './common';
import { barredLanes, commit, memoryFor, observe, type EnemyMemory } from './memory';
import { actors, attack, defend, maintain, newCtx, reclaimForAttack, stack, supply, type Ctx } from './tactics';

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

/**
 * Opponent awareness (AUD-A3 prototype, 2026-11-05 — **off by default**, a per-match option, not a level
 * or sim field). The audit measured that from the second enemy on, 65–99 % of the enemies' first-30-s
 * ribbons go to greys and to each other: `attack` ranks every hostile tower by when it falls, and a
 * neutral at 10 or a rival's wounded post always falls sooner than the player's L2 home at 30, so the
 * enemies "fight each other and the greys" (AUD-A3, R3, X2). With `opponentAwareness` the enemies know
 * who the opponent is — the player's colour, which a human sees too — and `attack` gives the player's
 * towers a *front bias* (`AttackConfig.front`): a plan on the player's tower may use a horizon of
 * `planMs + bias` and is ranked as if the tower fell `bias` sooner. The bias is per personality
 * (`FRONT_BIAS_S`, rusher highest, turtle lowest — the rusher is the one meant to come for the player),
 * scaled like the horizon by `0.5 + 0.5 × aggression`, and **zero below `DEFENCE_MIN_AGGRESSION`**: a
 * tutorial enemy that never defends does not hunt the player either (measured 2026-11-05 without the
 * gate: level 2's 0.2 rusher took the naive line from 20/20 to 0/20 and level 5's from 20/20 to 8/20
 * under `tie desc`, with the band-1 idle player dying at 43–95 s where it never died). Nothing else moves: the aggression gate,
 * `maintain` (`MIN_ATTACK_MS`, the hopeless rule), `defend`, the opportunist's under-fire preference,
 * `stack`, `supply` and the rival parity races are as before, so an enemy still answers an attacker and
 * still takes a free grey when the player's tower is out of every reach. Off, every seed is byte-identical
 * to today (`tests/ai/opponentAwareness.test.ts`). Measurement and the 1.0.1 decision:
 * `docs/reviews/2026-11-05-ai-engagement.md`.
 */
export interface EnemyAiOptions {
  /** Give the player's towers the front bias in `attack` (default false: today's behaviour). */
  opponentAwareness?: boolean;
  /** Per-personality front bias in seconds at aggression 1 (default `FRONT_BIAS_S`; measurement sweeps). */
  frontBiasS?: Readonly<Record<Personality, number>>;
}
/** Front bias per personality at aggression 1, seconds (scaled by `0.5 + 0.5 × aggression`). */
export const FRONT_BIAS_S: Readonly<Record<Personality, number>> = Object.freeze({ rusher: 20, opportunist: 10, turtle: 5 });

/**
 * Front bias in ms a personality at an aggression gives the player's towers under `options`; 0 when the
 * option is off or the enemy is below `DEFENCE_MIN_AGGRESSION` (a tutorial enemy).
 */
export function frontBiasMs(personality: Personality, aggression: number, options?: EnemyAiOptions): number {
  if (!options?.opponentAwareness || clamp01(aggression) < DEFENCE_MIN_AGGRESSION) return 0;
  return (options.frontBiasS ?? FRONT_BIAS_S)[personality] * 1000 * (0.5 + 0.5 * clamp01(aggression));
}

/** `AttackConfig.front` for an enemy: the bias on the player's towers, nothing on greys and rivals; undefined when off. */
function frontFor(enemy: EnemyDef, options?: EnemyAiOptions): ((target: Tower) => number) | undefined {
  const bias = frontBiasMs(enemy.personality, enemy.aggression, options);
  if (bias <= 0) return undefined;
  return (target) => (target.owner === 'player' ? bias : 0);
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
  /**
   * Idle towers join sieges already running (`stack`, turtle only): with it the rusher and the
   * opportunist pile every tower onto one target — measured 2026-09-22, level 8 (rusher, a = 0.3) went
   * from 20/20 to 14/20 for the reference player — which is not the per-tower rusher the design asks for.
   */
  stacks?: boolean;
  /** Front bias per target (`AttackConfig.front`, opponent awareness); undefined when off. */
  front?: (target: Tower) => number;
}

/**
 * The shared tick: observe (enemy memory: standoff timers, AUD-A11) → aggression gate → maintain →
 * defend → attack → stack (→ supply) → commit the lanes released this tick.
 */
function run(state: GameState, enemy: EnemyDef, rng: Rng, cfg: PersonalityConfig, memory: EnemyMemory = memoryFor(state, enemy.owner)): Command[] {
  observe(memory, state, enemy.owner);
  const ctx = newCtx(state, enemy.owner, undefined, barredLanes(memory, state));
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
    front: cfg.front,
  });
  if (cfg.stacks) stack(ctx, { cap: cfg.cap, sources: cfg.sources, anticipate: cfg.anticipate });
  if (cfg.supplies) supply(ctx, hopsToOpponent(state, enemy.owner), cfg.cap);
  commit(memory, state, ctx.ended);
  return ctx.cmds;
}

/** Rusher: any tower streams at the hostile neighbour that falls soonest within 30 s (scaled by aggression). */
export function rusherCommands(state: GameState, enemy: EnemyDef, rng: Rng, memory?: EnemyMemory, options?: EnemyAiOptions): Command[] {
  return run(state, enemy, rng, { cap: RUSHER_MAX_LINKS, planMs: planMsFor('rusher', enemy.aggression), races: true, front: frontFor(enemy, options) }, memory);
}

/** Turtle: towers grow to L2 before their first attack, then use every link; capped keeps supply neighbours. */
export function turtleCommands(state: GameState, enemy: EnemyDef, rng: Rng, memory?: EnemyMemory, options?: EnemyAiOptions): Command[] {
  return run(
    state,
    enemy,
    rng,
    {
      cap: TURTLE_MAX_LINKS,
      planMs: planMsFor('turtle', enemy.aggression),
      sources: (t) => t.level >= TURTLE_MIN_LEVEL,
      supplies: true,
      anticipate: true,
      stacks: true,
      front: frontFor(enemy, options),
    },
    memory,
  );
}

/** Opportunist: targets already under fire from someone else come first, then whatever falls soonest. */
export function opportunistCommands(state: GameState, enemy: EnemyDef, rng: Rng, memory?: EnemyMemory, options?: EnemyAiOptions): Command[] {
  return run(
    state,
    enemy,
    rng,
    {
      cap: OPPORTUNIST_MAX_LINKS,
      planMs: planMsFor('opportunist', enemy.aggression),
      score: (target, plan) => plan.siege.fallsAtMs - (underFireByOther(state, target, enemy.owner) ? HOPELESS_MS : 0),
      races: true,
      front: frontFor(enemy, options),
    },
    memory,
  );
}
