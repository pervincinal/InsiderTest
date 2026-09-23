/**
 * Reference player (rules v3, GDD §2.5): a strong, deterministic, non-cheating bot for the `player`
 * owner. `npm run playtest` uses it to prove every level is winnable within the 180 s budget and the
 * star clocks are measured against it. The only randomness is the supplied rng, which it does not
 * need (ties break by tower id) — it is kept in the signature so the game client and the headless runner
 * derive the same streams.
 *
 * Rules in priority order each tick (each tower starts at most one new stream per tick; the shared
 * engine is `tactics.ts`, the arithmetic `common.ts`):
 *   0. maintain — end an attack whose target no longer falls within `HOPELESS_MS` (unless it shields its
 *      source), a supply line that is neither a reinforcement nor free production from a capped keep, a
 *      stream into a contested neutral whose race is lost (`CONTEST_MARGIN_MS`), and every losing stream
 *      of a tower under fire below `RETREAT_UNITS`;
 *   1. defend — a tower that falls to what is coming: reinforce from neighbours when their streams make it
 *      hold, else besiege the attackers' sources from other towers (a linked source does not grow, so it
 *      falls at `(units + 1) / rate` after the travel time, and its capture ends the stream), else stream
 *      back on the attacker's lane when our rate is at least theirs (cancel) — never at the price of a
 *      capture that completes within `FINISH_MS` unless the shield keeps the tower past that (AI-8b);
 *   1b. grow — the tower within `GROW_HOME_MS` of its next level whose streams are all dispensable
 *      (supply that is no reinforcement, sieges our other streams still carry) drops them and is kept
 *      out of captures, attacks and stacks until it has the level (AI-8a: under lean the L2 home never
 *      grew because it was always linked);
 *   2. capture — expand into neutrals with the cheapest streams: every tower with a free link except the
 *      growing keep (`grower`) takes the neutral that falls soonest within `CAPTURE_PLAN_MS`, stacking
 *      links when one cannot break it; a contested neutral is taken when the race is ours;
 *   3. attack — focus fire on the enemy tower that falls soonest within `ATTACK_PLAN_MS`, every adjacent
 *      tower with a free link (or a supply link it can reclaim) stacked until it breaks; the growing keep
 *      joins only when the others cannot break it;
 *   3b. stack — an idle tower (a free link, no target of its own) joins a siege we already run when its
 *      stream lands and brings the fall forward (`STACK_MIN_GAIN_MS`);
 *   4. supply — a capped keep (top level at capacity: it makes nothing, streaming costs it nothing) pours
 *      into the friendly neighbour nearest the front that is not full.
 * A tower with no takeable target stays unlinked and grows toward its next level (faster stream, one
 * more link); the `grower` — the highest, rearmost own tower below its top level — is kept out of
 * captures so that at least one keep reaches L2/L3 (`GROWER_MIN_TOWERS`).
 */
import type { Command, GameState, Link, Tower } from '../sim/index';
import { Rng, capacityOf, isLinked, isUnderFire } from '../sim/index';
import { atMaxLevel, contestHeld, contestOf, genPerSecond, hopsToOpponent, isCapped, isEnemyOwner, ownedTowers, siegeOf, underSiege, type Plan } from './common';
import { activeLinks, attack, defend, isReinforcement, isShield, issueUnlink, maintain, newCtx, reclaimForAttack, stack, supply, type Ctx, type RuleTrace } from './tactics';

export type { RuleTrace };

const OWNER = 'player' as const;
/** Rule 2: a neutral must fall within this to be worth a stream. */
export const CAPTURE_PLAN_MS = 30_000;
/** Rule 3: an enemy tower must fall within this (with every link we can stack) to be attacked. */
export const ATTACK_PLAN_MS = 45_000;
/** Rule 1: horizon for a counter-siege of an attacker's source. */
export const COUNTER_PLAN_MS = 30_000;
/** Rule 0: an attack whose target no longer falls within this ends. */
export const HOPELESS_MS = 60_000;
/** Rule 2: the growing keep is kept out of captures only while we hold at least this many towers. */
export const GROWER_MIN_TOWERS = 2;
/**
 * Rules 0, 2, 3b (AI-8c): a contested neutral is ours when we land the flipping unit, or take it back
 * from the rival's capture within this margin — its capture leaves a garrison of 1 (`contestOf`), which
 * a tank or a column already on the lane lands on next; a race lost by one landing to a unit that is
 * already committed is a tie, not a loss (level 26: a tank 52 ms behind the rival's 4th infantry).
 * Small on purpose: a retake that depends on *later* landings gives the rival time to shield or
 * reinforce — measured 2026-09-23 at 2 s it cost lean 14 (36.6 → 51.0 s), lean 23 (44 → 36/50), lean
 * 49 (50 → 47/50), plain 14 (+7.6 s) and 43 (+4.7 s); 0 and 500 ms measure alike everywhere but the
 * tank case. Until 2026-09-23 a contested neutral also scored a flat `CONTEST_PENALTY_MS` = 10 s worse,
 * which ceded every cheap contested neutral, and the fortress parity was off by one landing (level 10's
 * fort under lean).
 */
export const CONTEST_MARGIN_MS = 500;
/**
 * Rule 1 (AI-8b): a capture that completes within this is finished — a shield does not reclaim its
 * stream unless the tower being defended falls before the capture completes even with the shield in
 * place (a shield that comes too late costs the capture and saves nothing). Three seconds is one more
 * landing at any lane length the levels use.
 */
export const FINISH_MS = 3_000;
/**
 * Rule 1b (AI-8a): a tower within this of its next level at its own growth rate, whose streams are all
 * dispensable, unlinks to grow; the same reach as `GROW_FIRST_MS` — the wait only pays when it is short.
 */
export const GROW_HOME_MS = 8_000;
/**
 * Rules 2–3 (AI-7a): a lone home (fewer than `GROWER_MIN_TOWERS` towers) that reaches its next level
 * within this grows first — the level doubles its links and speeds every stream, so a capture that
 * starts a few seconds later lands faster and a second one runs beside it (GDD §2.0b rule 10: grow
 * now vs attack now). It still defends meanwhile, and never waits while under fire or under siege.
 * Measured (50 levels × 5 seeds): 8 s speeds up levels 6, 7 and 41 by 10–12 s and slows none; 10 s
 * costs level 4 1.6 s, 15 s slows a dozen levels (1, 2, 10, 13, 18, 33–35 by 8–26 s).
 */
export const GROW_FIRST_MS = 8_000;
/** Grow-first applies only when the enemies hold at least this many towers (AI-7a: "facing ≥ 2 enemy towers"). */
export const GROW_FIRST_MIN_ENEMY_TOWERS = 2;

/** Towers held by any enemy. */
export function enemyTowerCount(state: GameState): number {
  let n = 0;
  for (const id in state.towers) if (isEnemyOwner(state.towers[id]!.owner)) n++;
  return n;
}

/** ms of undisturbed growth until the tower's next level (Infinity at its top level or when it makes nothing). */
export function msToNextLevel(tower: Tower, state: GameState): number {
  if (atMaxLevel(tower)) return Infinity;
  const gen = genPerSecond(tower, state);
  if (gen <= 0) return Infinity;
  return ((capacityOf(tower, state) - tower.units) / gen) * 1000;
}

/** Grower order: the highest level below its top, the rearmost (most lane hops from an enemy tower), then the fullest. */
function betterGrower(t: Tower, best: Tower, hops: ReadonlyMap<string, number>): boolean {
  const h = hops.get(t.id) ?? Infinity;
  const hb = hops.get(best.id) ?? Infinity;
  return t.level > best.level || (t.level === best.level && (h > hb || (h === hb && t.units > best.units)));
}

/**
 * The tower kept growing: highest level below its top, rearmost (most lane hops from an enemy tower),
 * then the fullest; none while it is linked, under fire, or we hold fewer than `GROWER_MIN_TOWERS`.
 * (Choosing it after `maintain` instead, with this tick's ended links excluded, was measured on
 * 2026-09-22 and rejected: levels 2, 7 and 47 got 6–12 s slower.)
 */
export function grower(state: GameState, hops: ReadonlyMap<string, number>): Tower | undefined {
  const own = ownedTowers(state, OWNER);
  if (own.length < GROWER_MIN_TOWERS) return undefined;
  let best: Tower | undefined;
  for (const t of own) {
    if (atMaxLevel(t) || isUnderFire(state, t) || state.links.some((l) => l.from === t.id)) continue;
    if (!best || betterGrower(t, best, hops)) best = t;
  }
  return best;
}

/**
 * The lone home that grows before it expands: our only tower, below its top level, unlinked, not under
 * fire or siege, and within `GROW_FIRST_MS` of its next level at its own growth rate.
 */
export function growsFirst(state: GameState, own: readonly Tower[]): Tower | undefined {
  if (own.length >= GROWER_MIN_TOWERS) return undefined;
  // Only against a real front: with a single enemy tower on the map (tutorial band) attacking now is
  // always faster than the level-up, and a Commander bonus that shortens the wait must never make the
  // player slower (tests/ai/headless.test.ts pins level 1 with and without max modifiers).
  if (enemyTowerCount(state) < GROW_FIRST_MIN_ENEMY_TOWERS) return undefined;
  const home = own[0];
  if (!home || atMaxLevel(home) || isLinked(state, home.id) || isUnderFire(state, home) || underSiege(state, home)) return undefined;
  return msToNextLevel(home, state) <= GROW_FIRST_MS ? home : undefined;
}

/**
 * Rule 1b: a stream the growing tower may drop — a supply line that is no reinforcement, or a siege our
 * other streams (on the map or issued this tick) still carry alone: the target still falls within
 * `planMs` to them, and a contested neutral stays ours. A shield is never dispensable (the hostile
 * stream it cancels would land in full), nor a capture only this stream carries.
 */
export function dispensable(ctx: Ctx, link: Link, planMs: number): boolean {
  const target = ctx.state.towers[link.to];
  if (!target) return true;
  if (target.owner === ctx.owner) return !isReinforcement(ctx, link);
  if (isShield(ctx, link)) return false;
  const without = { planned: ctx.planned, exclude: [...ctx.ended, link] };
  const s = siegeOf(ctx.state, target, without);
  if (s.fallsAtMs > planMs || !(s.byOwner.get(ctx.owner) ?? 0)) return false;
  if (target.owner === 'neutral' && !contestHeld(contestOf(ctx.state, target, without), ctx.owner, CONTEST_MARGIN_MS)) return false;
  return true;
}

/**
 * Rule 1b (AI-8a): the tower that grows to its next level now — below its top, not under fire or siege,
 * not used by this tick's defence, within `GROW_HOME_MS` of the level at its own growth rate, and with
 * every stream dispensable; the best by the grower order. Only against ≥ `GROW_FIRST_MIN_ENEMY_TOWERS`
 * enemy towers (nothing is left to grow for on a one-tower map). Under lean an L2 home that streams
 * from the first tick never reaches L3: its garrison changes only by landings, and every rule re-links it
 * the moment it has a free slot — this one drops its dispensable streams and reserves it until the level.
 */
export function growHome(ctx: Ctx, hops: ReadonlyMap<string, number>, planMs: number): Tower | undefined {
  const state = ctx.state;
  if (enemyTowerCount(state) < GROW_FIRST_MIN_ENEMY_TOWERS) return undefined;
  let best: Tower | undefined;
  let bestLinked = false;
  for (const t of ownedTowers(state, ctx.owner)) {
    if (ctx.used.has(t.id) || atMaxLevel(t) || isUnderFire(state, t) || underSiege(state, t)) continue;
    if (msToNextLevel(t, state) > GROW_HOME_MS) continue;
    const links = activeLinks(ctx, t.id);
    if (!links.every((l) => dispensable(ctx, l, planMs))) continue;
    // Sticky: a tower already growing (unlinked) stays the one — unlinking a second one each tick as
    // "fullest" changes hands would free the first for the attack rules again.
    const linked = links.length > 0;
    if (!best || (bestLinked && !linked) || (bestLinked === linked && betterGrower(t, best, hops))) {
      best = t;
      bestLinked = linked;
    }
  }
  return best;
}

/** Rule 0: a supply line goes on only as free production from a capped keep (reinforcements are kept by the engine). */
function keepSupply(ctx: Ctx, source: Tower): boolean {
  return isCapped(ctx.state, source);
}

/** Rules 2–3: a supply line (not a reinforcement) or a shield that wins its race can be given up for an attack. */
function reclaim(ctx: Ctx, source: Tower, plan?: Plan): Link | undefined {
  return reclaimForAttack(ctx, source, plan, true);
}

export function referencePlayerCommands(state: GameState, _rng: Rng, trace?: RuleTrace): Command[] {
  const ctx = newCtx(state, OWNER, trace);
  const hops = hopsToOpponent(state, OWNER);
  const keep = grower(state, hops);
  const own = ownedTowers(state, OWNER);

  for (const t of own) maintain(ctx, t, { hopelessMs: HOPELESS_MS, keepSupply, contestMarginMs: CONTEST_MARGIN_MS });
  for (const t of own) defend(ctx, t, { counterMs: COUNTER_PLAN_MS, reclaimReinforcement: true, finishMs: FINISH_MS });
  // Rule 1b: the tower about to level drops its dispensable streams and is reserved below.
  const home = growHome(ctx, hops, HOPELESS_MS);
  if (home) {
    ctx.rule = 'grow';
    for (const link of activeLinks(ctx, home.id)) issueUnlink(ctx, link);
    ctx.used.add(home.id);
  }
  const growing = growsFirst(state, own) ?? home;

  attack(ctx, {
    rule: 'capture',
    planMs: CAPTURE_PLAN_MS,
    targets: (t) => t.owner === 'neutral',
    sources: (t) => t.id !== keep?.id && t.id !== growing?.id,
    reclaim,
    holdCheck: true,
    contestMarginMs: CONTEST_MARGIN_MS,
  });
  attack(ctx, {
    rule: 'attack',
    planMs: ATTACK_PLAN_MS,
    targets: (t) => t.owner !== 'neutral',
    sources: (t) => t.id !== growing?.id,
    lastResort: (t) => t.id === keep?.id,
    reclaim,
    anticipate: true,
  });
  // Rule 3b: idle towers (a free link, nothing of their own to take) join the sieges already running.
  // The growing keep stays out (measured 2026-09-22: letting it join enemy sieges cost 14 and 41 about
  // 4 s at 20 seeds) — except when the enemies are down to their last tower: nothing is left to grow for.
  const lastStand = enemyTowerCount(state) < GROW_FIRST_MIN_ENEMY_TOWERS;
  stack(ctx, { sources: (t) => t.id !== growing?.id && (lastStand || t.id !== keep?.id), anticipate: true, contestMarginMs: CONTEST_MARGIN_MS });
  supply(ctx, hops);
  return ctx.cmds;
}
