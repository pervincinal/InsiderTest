/**
 * Reference player: a competent, non-cheating bot for the `player` owner. It is what `npm run playtest`
 * uses to prove every level is winnable. Deterministic: the only randomness is tie-breaking through
 * the supplied rng. Rules run in priority order, each tower acting at most once per tick:
 *   1) take a neighbouring neutral it can capture (contested neutrals get a bigger force),
 *   2) upgrade a rear tower to L2 when garrison ≥ cost + 5 and nothing is incoming,
 *   3) reinforce a tower under threat from friendly neighbours (only when that saves it), and ship
 *      surplus from filling rear towers one hop toward the front,
 *   4) attack the weakest adjacent enemy tower when the own towers adjacent to it — plus rear towers
 *      that can relay through them in the same stream — hold ≥ defenders × 1.2 + 2 (fortress-aware,
 *      counting what the target grows before and during the stream); keep feeding a wave that is
 *      still enough to take the tower,
 *   5) otherwise wait — or, if nothing better is on, upgrade a frontline tower when it would still
 *      survive an all-in from its strongest enemy neighbour (covered by rear reinforcements).
 */
import type { Command, GameState, Tower } from '../sim/index';
import { C, Rng, capacityOf } from '../sim/index';
import {
  defenceMultiplier,
  effectiveDefenders,
  enemyNeighbours,
  friendlyNeighbours,
  genPerSecond,
  hopsToOpponent,
  incomingSupport,
  incomingThreat,
  incomingWeight,
  neighbours,
  ownedTowers,
  projectedDefenders,
  sendCommand,
  spendable,
  upgradeCost,
  wholeUnits,
  type Neighbour,
} from './common';

const OWNER = 'player' as const;
/** Rule 2: upgrade when garrison ≥ cost + this. */
const UPGRADE_SLACK = 5;
/** Rule 2: rear towers stop here (GDD: "upgrade a rear tower to L2") unless they are sitting full. */
const REAR_UPGRADE_LEVEL = 2;
const REAR_FULL_FRACTION = 0.8;
/** Rule 3b: a rear tower ships surplus once it holds this fraction of its capacity. */
const SUPPLY_FILL = 0.6;
/** Rule 3b: units a rear tower keeps when shipping surplus forward. */
const SUPPLY_KEEP = 5;
/** Rule 4: attack when own force ≥ defenders × ATTACK_FACTOR + ATTACK_SLACK. */
const ATTACK_FACTOR = 1.2;
const ATTACK_SLACK = 2;
/** Rule 4: a stream longer than this is not planned for (later units are a bonus). */
const MAX_STREAM_MS = 20_000;
/** Rule 5: extra defenders wanted after a frontline upgrade, on top of the enemy's all-in. */
const UPGRADE_SAFETY = 1;
/** Rule 5: a reinforcement counts as covering the upgrade if it lands within this of the enemy's wave. */
const COVER_GRACE_MS = 1000;
/**
 * Rule 4b: hard cap on plans launched per tick. Every launched plan marks its sources used, so the loop
 * ends after at most one iteration per own tower; the cap is a last line of defence against a plan that
 * launches nothing (that once hung `npm run playtest` on a tank factory holding less than one tank).
 */
const MAX_PLANS_PER_TICK = 64;

interface Ctx {
  state: GameState;
  rng: Rng;
  hops: Map<string, number>;
  used: Set<string>;
  cmds: Command[];
}

function costToTake(n: Neighbour): number {
  return n.roadCost + n.oncoming;
}

/** Time until a column of `weight` sent now has fully arrived over `travelMs`. */
function arrivalMs(travelMs: number, weight: number): number {
  return travelMs + weight * C.LEAVE_INTERVAL_MS;
}

function isRear(ctx: Ctx, tower: Tower): boolean {
  return (ctx.hops.get(tower.id) ?? Infinity) >= 2;
}

/**
 * Defenders the tower would have (in attacker weight) when an all-in from enemy neighbour `n` lands,
 * starting from `remaining` units now: production during the enemy's travel counts. `level` lets the
 * caller evaluate the tower as it would be right after an upgrade.
 */
function defendersAgainst(tower: Tower, remaining: number, n: Neighbour, level: 1 | 2 | 3 = tower.level): number {
  const upgraded: Tower = level === tower.level ? tower : { ...tower, level };
  const grown = Math.floor((genPerSecond(upgraded) * arrivalMs(n.travelMs, n.tower.units)) / 1000);
  return Math.min(capacityOf(upgraded), remaining + grown) * defenceMultiplier(upgraded);
}

/** Would the tower still hold if its strongest enemy neighbour sent everything once the garrison is `remaining`? */
function survivesAllIn(state: GameState, tower: Tower, remaining: number): boolean {
  for (const n of enemyNeighbours(state, tower.id)) {
    const attackers = n.tower.units + incomingThreat(state, tower.id);
    if (attackers > 0 && defendersAgainst(tower, remaining, n) < attackers) return false;
  }
  return true;
}

function pick<T>(ctx: Ctx, items: T[], score: (item: T) => number): T | undefined {
  let best: T[] = [];
  let bestScore = Infinity;
  for (const item of items) {
    const s = score(item);
    if (s < bestScore) {
      best = [item];
      bestScore = s;
    } else if (s === bestScore) best.push(item);
  }
  if (best.length === 0) return undefined;
  return best.length === 1 ? best[0] : best[ctx.rng.int(best.length)];
}

/**
 * Record a decision for `tower`. The tower counts as used even when the command is `undefined` (nothing
 * sendable, e.g. a tank factory with less than one tank): a rule that picked it must not pick it again.
 */
function push(ctx: Ctx, tower: Tower, cmd: Command | undefined): void {
  ctx.used.add(tower.id);
  if (cmd) ctx.cmds.push(cmd);
}

/** Weight the tower can put on the road right now, in whole units of its kind (0 for a sub-tank factory). */
function sendable(ctx: Ctx, tower: Tower): number {
  return wholeUnits(tower, spendable(ctx.state, tower));
}

function free(ctx: Ctx, tower: Tower): boolean {
  return !ctx.used.has(tower.id);
}

/**
 * Rule 1: capture a neighbouring neutral when the garrison can flip it and still hold. A neutral that an
 * enemy tower can also reach is contested: send enough to beat that enemy's garrison as well when
 * affordable, otherwise everything that can be spared — but never so much that home would fall.
 */
function captureNeutrals(ctx: Ctx, mine: Tower[]): void {
  const { state } = ctx;
  const taken = new Set<string>();
  for (const tower of mine) {
    if (!free(ctx, tower)) continue;
    const neutrals = neighbours(state, tower.id).filter((n) => n.tower.owner === 'neutral' && !taken.has(n.tower.id));
    const target = pick(ctx, neutrals, (n) => effectiveDefenders(n.tower) + costToTake(n));
    if (!target) continue;
    const mult = defenceMultiplier(target.tower);
    const ours = incomingWeight(state, target.tower.id, OWNER);
    const theirs = incomingThreat(state, target.tower.id) - ours;
    // "garrison > units + 1": arrive with strictly more than the garrison (and whatever else lands there), keep one spare.
    const base = effectiveDefenders(target.tower) + mult + 1 + costToTake(target) + theirs;
    if (ours > 0) {
      // Column already walking: only top it up if the enemy started racing after we committed.
      const deficit = base - ours;
      if (deficit <= 0 || spendable(state, tower) < deficit) continue;
      if (!survivesAllIn(state, tower, tower.units - deficit)) continue;
      taken.add(target.tower.id);
      push(ctx, tower, sendCommand(tower, target.tower.id, deficit));
      continue;
    }
    // An enemy tower next to the neutral can race us for it: bring enough to beat its garrison too.
    let racers = 0;
    for (const e of neighbours(state, target.tower.id)) {
      if (e.tower.owner !== OWNER && e.tower.owner !== 'neutral') racers = Math.max(racers, e.tower.units);
    }
    const amount = Math.min(spendable(state, tower), base + racers);
    if (amount < base) continue;
    if (!survivesAllIn(state, tower, tower.units - amount)) continue;
    taken.add(target.tower.id);
    push(ctx, tower, sendCommand(tower, target.tower.id, amount));
  }
}

/** Rule 2: upgrade rear towers to L2 when rich and calm (to L3 only when they sit nearly full). */
function upgradeRear(ctx: Ctx, mine: Tower[]): void {
  const { state } = ctx;
  for (const tower of mine) {
    if (!free(ctx, tower) || !isRear(ctx, tower)) continue;
    const cost = upgradeCost(tower);
    if (cost === undefined || tower.units < cost + UPGRADE_SLACK) continue;
    if (incomingThreat(state, tower.id) > 0) continue;
    if (tower.level >= REAR_UPGRADE_LEVEL && tower.units < capacityOf(tower) * REAR_FULL_FRACTION) continue;
    push(ctx, tower, { type: 'upgrade', owner: OWNER, towerId: tower.id });
  }
}

/** Rule 3: reinforce towers under threat from friendly neighbours — only when together they can save it. */
function reinforce(ctx: Ctx, mine: Tower[]): void {
  const { state } = ctx;
  for (const tower of mine) {
    const threat = incomingThreat(state, tower.id);
    if (threat <= 0) continue;
    const mult = defenceMultiplier(tower);
    let deficit = Math.ceil(threat / mult) + 1 - tower.units - incomingSupport(state, tower.id);
    if (deficit <= 0) continue;
    const helpers = friendlyNeighbours(state, tower.id)
      .filter((n) => free(ctx, n.tower))
      .map((n) => ({ n, spare: Math.max(0, spendable(state, n.tower) - n.oncoming) }))
      .filter((h) => h.spare > 0)
      .sort((a, b) => a.n.travelMs - b.n.travelMs);
    const total = helpers.reduce((sum, h) => sum + h.spare, 0);
    if (total < deficit) continue; // do not feed a tower that is lost anyway
    for (const h of helpers) {
      if (deficit <= 0) break;
      const amount = Math.min(h.spare, deficit + 1);
      push(ctx, h.n.tower, sendCommand(h.n.tower, tower.id, amount));
      deficit -= amount;
    }
  }
}

/** Rule 3b: rear towers that are filling up ship surplus one hop toward the front. */
function supplyForward(ctx: Ctx, mine: Tower[]): void {
  const { state } = ctx;
  for (const tower of mine) {
    if (!free(ctx, tower)) continue;
    const myHops = ctx.hops.get(tower.id);
    if (myHops === undefined || myHops < 2) continue;
    if (incomingThreat(state, tower.id) > 0) continue;
    if (tower.units < capacityOf(tower) * SUPPLY_FILL) continue;
    const cost = upgradeCost(tower);
    if (cost !== undefined && tower.level < REAR_UPGRADE_LEVEL && tower.units < cost + UPGRADE_SLACK) continue;
    const forward = friendlyNeighbours(state, tower.id).filter((n) => (ctx.hops.get(n.tower.id) ?? Infinity) < myHops);
    const target = pick(ctx, forward, (n) => n.tower.units);
    if (!target) continue;
    const room = capacityOf(target.tower) - target.tower.units - incomingSupport(state, target.tower.id);
    const amount = Math.min(tower.units - SUPPLY_KEEP, Math.max(0, room));
    push(ctx, tower, sendCommand(tower, target.tower.id, amount));
  }
}

/** Rule 4a: keep feeding a wave that is landing while it is still enough to take the tower. */
function sustain(ctx: Ctx, mine: Tower[]): void {
  const { state } = ctx;
  for (const tower of mine) {
    if (!free(ctx, tower)) continue;
    const force = sendable(ctx, tower);
    if (force <= 0) continue;
    const targets = enemyNeighbours(state, tower.id).filter((n) => {
      const inbound = incomingWeight(state, n.tower.id, OWNER);
      return inbound > 0 && inbound + force > effectiveDefenders(n.tower) + costToTake(n);
    });
    const target = pick(ctx, targets, (n) => effectiveDefenders(n.tower));
    if (target) push(ctx, tower, sendCommand(tower, target.tower.id, force));
  }
}

interface Plan {
  target: Tower;
  sources: { tower: Tower; n: Neighbour; force: number }[];
  relays: { tower: Tower; via: Tower; force: number }[];
  needed: number;
  force: number;
}

/** Rule 4b: attack the weakest adjacent enemy tower with every adjacent own tower plus rear relays at once. */
function attack(ctx: Ctx, mine: Tower[]): void {
  const { state } = ctx;
  const targets = new Map<string, Tower>();
  for (const tower of mine) for (const n of enemyNeighbours(state, tower.id)) targets.set(n.tower.id, n.tower);

  const plans: Plan[] = [];
  for (const target of targets.values()) {
    const sources: Plan['sources'] = [];
    const relays: Plan['relays'] = [];
    const relayIds = new Set<string>();
    let losses = 0;
    let slowest = 0;
    for (const tower of mine) {
      if (!free(ctx, tower)) continue;
      const n = neighbours(state, tower.id).find((x) => x.tower.id === target.id);
      if (!n) continue;
      const force = sendable(ctx, tower);
      sources.push({ tower, n, force });
      losses += costToTake(n);
      slowest = Math.max(slowest, n.travelMs);
    }
    if (sources.length === 0) continue;
    // Rear towers next to a source can pour into it and continue in the same stream.
    for (const s of sources) {
      for (const r of friendlyNeighbours(state, s.tower.id)) {
        const rear = r.tower;
        if (!free(ctx, rear) || relayIds.has(rear.id) || sources.some((x) => x.tower.id === rear.id)) continue;
        if (enemyNeighbours(state, rear.id).length > 0) continue;
        const force = sendable(ctx, rear);
        if (force <= 0) continue;
        relayIds.add(rear.id);
        relays.push({ tower: rear, via: s.tower, force });
      }
    }
    let force = incomingWeight(state, target.id, OWNER);
    for (const s of sources) force += s.force;
    for (const r of relays) force += r.force;
    const streamMs = Math.min(MAX_STREAM_MS, force * C.LEAVE_INTERVAL_MS);
    for (const s of sources) force += Math.floor((genPerSecond(s.tower) * streamMs) / 1000);
    const firstHit = projectedDefenders(target, slowest);
    const regenDuringStream = Math.ceil((genPerSecond(target) * streamMs) / 1000) * defenceMultiplier(target);
    const needed = firstHit * ATTACK_FACTOR + ATTACK_SLACK + regenDuringStream + losses;
    plans.push({ target, sources, relays, needed, force });
  }

  for (let launched = 0; launched < MAX_PLANS_PER_TICK; launched++) {
    const ready = plans.filter(
      (p) =>
        p.force >= p.needed &&
        p.sources.every((s) => free(ctx, s.tower)) &&
        p.relays.every((r) => free(ctx, r.tower)) &&
        p.sources.some((s) => s.force > 0),
    );
    const plan = pick(ctx, ready, (p) => p.needed);
    if (!plan) return;
    for (const s of plan.sources) {
      if (s.force > 0) push(ctx, s.tower, sendCommand(s.tower, plan.target.id, s.force));
      else ctx.used.add(s.tower.id);
    }
    for (const r of plan.relays) push(ctx, r.tower, sendCommand(r.tower, r.via.id, r.force));
  }
}

/**
 * Rule 5: with nothing better to do, upgrade a frontline tower if it would still survive an all-in from
 * its strongest enemy neighbour — with rear neighbours covering the temporary weakness in the same tick.
 */
function upgradeFrontline(ctx: Ctx, mine: Tower[]): void {
  const { state } = ctx;
  for (const tower of mine) {
    if (!free(ctx, tower) || isRear(ctx, tower)) continue;
    const cost = upgradeCost(tower);
    if (cost === undefined || tower.units < cost + UPGRADE_SLACK) continue;
    if (incomingThreat(state, tower.id) > 0) continue;
    const remaining = tower.units - cost;
    const nextLevel = (tower.level + 1) as 1 | 2 | 3;
    let deficit = 0;
    let soonest = Infinity;
    for (const n of enemyNeighbours(state, tower.id)) {
      if (n.tower.units <= 0) continue;
      const gap = n.tower.units + UPGRADE_SAFETY - defendersAgainst(tower, remaining, n, nextLevel);
      if (gap > 0) deficit = Math.max(deficit, Math.ceil(gap / defenceMultiplier(tower)));
      soonest = Math.min(soonest, n.travelMs);
    }
    deficit -= incomingSupport(state, tower.id);
    const cover: { tower: Tower; amount: number }[] = [];
    if (deficit > 0) {
      const helpers = friendlyNeighbours(state, tower.id)
        .filter((h) => free(ctx, h.tower) && isRear(ctx, h.tower) && h.travelMs <= soonest + COVER_GRACE_MS)
        .sort((a, b) => a.travelMs - b.travelMs);
      let left = deficit;
      for (const h of helpers) {
        if (left <= 0) break;
        const spare = spendable(state, h.tower);
        if (spare <= 0) continue;
        const amount = Math.min(spare, left);
        cover.push({ tower: h.tower, amount });
        left -= amount;
      }
      if (left > 0) continue;
    }
    push(ctx, tower, { type: 'upgrade', owner: OWNER, towerId: tower.id });
    for (const c of cover) push(ctx, c.tower, sendCommand(c.tower, tower.id, c.amount));
  }
}

/** Commands for the player owner this AI tick. Deterministic for a given state and rng. */
export function referencePlayerCommands(state: GameState, rng: Rng): Command[] {
  const mine = ownedTowers(state, OWNER);
  if (mine.length === 0) return [];
  const ctx: Ctx = { state, rng, hops: hopsToOpponent(state, OWNER), used: new Set(), cmds: [] };
  captureNeutrals(ctx, mine);
  upgradeRear(ctx, mine);
  reinforce(ctx, mine);
  supplyForward(ctx, mine);
  sustain(ctx, mine);
  attack(ctx, mine);
  upgradeFrontline(ctx, mine);
  return ctx.cmds;
}
