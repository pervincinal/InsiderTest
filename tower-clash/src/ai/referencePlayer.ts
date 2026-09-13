/**
 * Reference player: a competent, non-cheating bot for the `player` owner. It is what `npm run playtest`
 * uses to prove every level is winnable. Deterministic: the only randomness is tie-breaking through
 * the supplied rng. Rules run in priority order, each tower acting at most once per tick:
 *   1) reinforce a tower under attack from friendly neighbours — only with columns that land before it
 *      falls, and only when that saves it (an all-in on one tower is answered, not raced),
 *   2) take a neighbouring neutral it can capture (contested neutrals get a bigger force),
 *   3) upgrade a rear tower to L2 when garrison ≥ cost + 5 and nothing is incoming, and ship surplus
 *      from filling rear towers one hop toward the front,
 *   4) attack the weakest adjacent enemy tower when the own towers adjacent to it — plus rear towers
 *      that can relay through them in the same stream — hold ≥ defenders × 1.2 + 2 (fortress-aware,
 *      counting what the target grows before and during the stream) and the captured tower could be
 *      held against its other enemy neighbours; top up a wave that has become too small to land,
 *   5) otherwise wait — or, if nothing better is on, upgrade a frontline tower when it would still
 *      survive an all-in from its strongest enemy neighbour (covered by rear reinforcements).
 *
 * Every send keeps a home reserve (`reserveToHold`): what the tower needs to survive the strongest
 * column that could reach it — an adjacent enemy garrison, or an enemy column about to take an adjacent
 * neutral — counting what the tower produces before that column lands. A tower is never emptied while
 * such a column exists, and a wave already on its way is not fed one unit at a time.
 */
import type { Command, GameState, Owner, Tower, Unit } from '../sim/index';
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
  isEnemyOwner,
  neighbours,
  ownedTowers,
  projectedDefenders,
  projectedUnits,
  sendCommand,
  threatReserve,
  upgradeCost,
  wholeUnits,
  type Neighbour,
} from './common';

const OWNER = 'player' as const;
/** Rule 3: upgrade when garrison ≥ cost + this. */
const UPGRADE_SLACK = 5;
/** Rule 3: rear towers stop here (GDD: "upgrade a rear tower to L2") unless they are sitting full. */
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
/** Home reserve: defenders kept above the strongest column that could land. */
const HOLD_MARGIN = 1;
/**
 * Rule 4b: hard cap on plans launched per tick. Every launched plan marks its sources used, so the loop
 * ends after at most one iteration per own tower; the cap is a last line of defence against a plan that
 * launches nothing (that once hung `npm run playtest` on a tank factory holding less than one tank).
 */
const MAX_PLANS_PER_TICK = 64;

/** Optional hook for tooling: called with the rule that produced each command. */
export type RuleTrace = (rule: string, cmd: Command) => void;

interface Ctx {
  state: GameState;
  rng: Rng;
  hops: Map<string, number>;
  used: Set<string>;
  cmds: Command[];
  rule: string;
  trace?: RuleTrace;
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

/* ---------- Threat model (what a human sees: garrisons and columns on the roads) ---------- */

/** Time until a walking unit reaches its destination, ms. */
function remainingMs(state: GameState, u: Unit): number {
  const road = state.roads[u.roadId];
  if (!road) return 0;
  return ((1 - u.progress) * road.length * 1000) / u.speed;
}

interface Inbound {
  weight: number;
  /** Earliest landing of that owner's column, ms. */
  etaMs: number;
}

/** Weight heading to a tower, per owner, with the earliest landing (walking units plus queued ones). */
function inboundByOwner(state: GameState, towerId: string): Map<Owner, Inbound> {
  const out = new Map<Owner, Inbound>();
  const add = (owner: Owner, weight: number, etaMs: number): void => {
    const cur = out.get(owner);
    if (cur) {
      cur.weight += weight;
      cur.etaMs = Math.min(cur.etaMs, etaMs);
    } else out.set(owner, { weight, etaMs });
  };
  for (const u of state.units) if (u.to === towerId) add(u.owner, u.weight, remainingMs(state, u));
  for (const q of state.queues) {
    if (q.to !== towerId) continue;
    const road = state.roads[q.roadId];
    if (!road) continue;
    const tank = q.unitKind === 'tank';
    const speed = tank ? C.UNIT_SPEED * C.TANK_SPEED_MUL : C.UNIT_SPEED;
    add(q.owner, q.remaining * (tank ? C.TANK_WEIGHT : C.INFANTRY_WEIGHT), (road.length * 1000) / speed);
  }
  return out;
}

/** Earliest landing of hostile weight already heading to the tower (Infinity when nothing is). */
function threatEtaMs(state: GameState, tower: Tower): number {
  let eta = Infinity;
  for (const [owner, v] of inboundByOwner(state, tower.id)) if (owner !== tower.owner) eta = Math.min(eta, v.etaMs);
  return eta;
}

/** A column that could be thrown at one of our towers from a neighbour. */
interface ThreatSource {
  from: Tower;
  /** Weight that would land after the road's barrier/mine ate its share. */
  attackers: number;
  /** When the last unit of that column could have landed, ms (its production credit window). */
  etaMs: number;
}

/**
 * The column neighbour `n` could throw at `tower`: an enemy garrison as it will be at now + `atMs` (plus
 * its reinforcements on the way, minus what is already attacking it), or an enemy column that is about
 * to flip the neighbour — neutral or another enemy's — and carry on from there. The column is timed as
 * if it left right now (a racing enemy does not wait for us to land). `undefined` when nothing could
 * come from that side.
 */
function threatFrom(state: GameState, n: Neighbour, atMs = 0): ThreatSource | undefined {
  const from = n.tower;
  if (from.owner === OWNER) return undefined;
  const inbound = inboundByOwner(state, from.id);
  let attackers = 0;
  let landMs = 0;
  if (isEnemyOwner(from.owner)) {
    let hostile = 0;
    let support = 0;
    for (const [owner, v] of inbound) {
      if (owner === from.owner) support += v.weight;
      else hostile += v.weight;
    }
    attackers = projectedUnits(from, atMs) + support - Math.ceil(hostile / defenceMultiplier(from));
  }
  // A column of another enemy bigger than the garrison flips the neighbour and keeps the remainder.
  for (const [owner, v] of inbound) {
    if (!isEnemyOwner(owner) || owner === from.owner) continue;
    const remainder = v.weight - effectiveDefenders(from);
    if (remainder > attackers) {
      attackers = remainder;
      landMs = v.etaMs;
    }
  }
  attackers -= n.roadCost;
  if (attackers <= 0) return undefined;
  return { from, attackers, etaMs: landMs + arrivalMs(n.travelMs, attackers) };
}

/** Every column that could be sent at `tower`, one per hostile neighbour (excluding `exclude`). */
function threatSources(state: GameState, tower: Tower, exclude?: string): ThreatSource[] {
  const out: ThreatSource[] = [];
  for (const n of neighbours(state, tower.id)) {
    if (n.tower.id === exclude) continue;
    const src = threatFrom(state, n);
    if (src) out.push(src);
  }
  return out;
}

/**
 * Units `tower` (evaluated as `as`, e.g. after an upgrade) must keep so that, with what it produces before
 * each possible column lands, it survives the strongest one plus whatever is already walking toward it.
 * A column no garrison could stop (bigger than the capacity) does not lock units at home: those are
 * better spent elsewhere. 0 when nothing can reach the tower.
 */
function reserveFor(state: GameState, as: Tower, sources: ThreatSource[]): number {
  const mult = defenceMultiplier(as);
  const threat = incomingThreat(state, as.id);
  let reserve = threatReserve(state, as);
  const cap = capacityOf(as);
  for (const src of sources) {
    const need = Math.ceil((src.attackers + threat) / mult) + HOLD_MARGIN;
    const grown = Math.floor((genPerSecond(as) * src.etaMs) / 1000);
    if (need - grown > cap) continue;
    reserve = Math.max(reserve, need - grown);
  }
  return Math.max(0, reserve);
}

/** Home reserve of a tower; `exclude` is a neighbour being attacked by this very send (its garrison is spoken for). */
function reserveToHold(state: GameState, tower: Tower, exclude?: string): number {
  return reserveFor(state, tower, threatSources(state, tower, exclude));
}

/** Weight the tower can put on the road and still hold, in whole units of its kind (0 for a sub-tank factory). */
function spare(state: GameState, tower: Tower, exclude?: string): number {
  return wholeUnits(tower, tower.units - reserveToHold(state, tower, exclude));
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
  if (!cmd) return;
  ctx.cmds.push(cmd);
  ctx.trace?.(ctx.rule, cmd);
}

function free(ctx: Ctx, tower: Tower): boolean {
  return !ctx.used.has(tower.id);
}

/**
 * Rule 1: reinforce towers under attack from friendly neighbours — only with columns that land before the
 * tower falls, and only when together they can save it. The tower's own production until the first hostile
 * unit lands counts; a helper keeps its own home reserve.
 */
function reinforce(ctx: Ctx, mine: Tower[]): void {
  const { state } = ctx;
  for (const tower of mine) {
    const threat = incomingThreat(state, tower.id);
    if (threat <= 0) continue;
    const mult = defenceMultiplier(tower);
    const eta = threatEtaMs(state, tower);
    const atLanding = projectedUnits(tower, eta);
    let deficit = Math.ceil(threat / mult) + 1 - atLanding - incomingSupport(state, tower.id);
    if (deficit <= 0) continue;
    // The garrison absorbs the stream one unit per LEAVE_INTERVAL_MS: help landing within that window still counts.
    const deadline = eta + atLanding * mult * C.LEAVE_INTERVAL_MS;
    const helpers = friendlyNeighbours(state, tower.id)
      .filter((n) => free(ctx, n.tower) && n.travelMs <= deadline)
      .map((n) => ({ n, spare: Math.max(0, spare(state, n.tower) - n.oncoming) }))
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

/**
 * Rule 2: capture a neighbouring neutral when the garrison can flip it and still hold. A neutral that an
 * enemy tower can also reach is contested: send enough to beat that enemy's garrison as well when
 * affordable, otherwise everything that can be spared — but never the home reserve.
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
    const inbound = inboundByOwner(state, target.tower.id);
    const ours = inbound.get(OWNER)?.weight ?? 0;
    let theirs = 0;
    let theirEta = Infinity;
    for (const [owner, v] of inbound) {
      if (owner === OWNER) continue;
      theirs += v.weight;
      theirEta = Math.min(theirEta, v.etaMs);
    }
    // Weight that dies on the way in: the garrison, the road, and whatever else lands there.
    const flip = effectiveDefenders(target.tower) + costToTake(target) + theirs;
    // "garrison > units + 1": arrive with strictly more than that, keep one spare.
    const base = flip + mult + 1;
    const available = spare(state, tower, target.tower.id);
    if (ours > 0) {
      // Column already walking: top it up only if the enemy started racing after we committed and the
      // top-up still lands before the enemy's column does.
      const deficit = base - ours;
      if (deficit <= 0 || available < deficit) continue;
      if (arrivalMs(target.travelMs, deficit) > theirEta) continue;
      taken.add(target.tower.id);
      push(ctx, tower, sendCommand(tower, target.tower.id, deficit));
      continue;
    }
    // An enemy tower next to the neutral can race us for it or take it straight back: bring enough to
    // hold it once captured, and when affordable enough to beat that garrison outright.
    const landing = arrivalMs(target.travelMs, base);
    const hold = holdShortfall(ctx, target.tower, base - flip, landing, new Set([tower.id]));
    let racers = 0;
    for (const e of neighbours(state, target.tower.id)) {
      if (e.tower.owner !== OWNER && e.tower.owner !== 'neutral') racers = Math.max(racers, e.tower.units);
    }
    const want = base + hold;
    if (available < want) continue;
    const amount = Math.min(available, Math.max(want, base + racers));
    taken.add(target.tower.id);
    push(ctx, tower, sendCommand(tower, target.tower.id, amount));
  }
}

/** Rule 3: upgrade rear towers to L2 when rich and calm (to L3 only when they sit nearly full). */
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
    const amount = Math.min(tower.units - SUPPLY_KEEP, spare(state, tower), Math.max(0, room));
    push(ctx, tower, sendCommand(tower, target.tower.id, amount));
  }
}

/**
 * Is a wave of `inbound` weight enough to flip the neighbour by `margin`, counting what it grows before a
 * unit sent now lands?
 */
function waveSuffices(inbound: number, n: Neighbour, margin = 0): boolean {
  return inbound > projectedDefenders(n.tower, n.travelMs) + costToTake(n) + margin;
}

/**
 * Rule 4a: top up a wave that has become too small to land — with a second wave that closes the gap by
 * the attack slack, never one unit at a time (a wave that stays short is written off).
 */
function sustain(ctx: Ctx, mine: Tower[]): void {
  const { state } = ctx;
  for (const tower of mine) {
    if (!free(ctx, tower)) continue;
    const targets = enemyNeighbours(state, tower.id).filter((n) => {
      const inbound = incomingWeight(state, n.tower.id, OWNER);
      if (inbound <= 0 || waveSuffices(inbound, n)) return false;
      return waveSuffices(inbound + spare(state, tower, n.tower.id), n, ATTACK_SLACK);
    });
    const target = pick(ctx, targets, (n) => effectiveDefenders(n.tower));
    if (target) push(ctx, tower, sendCommand(tower, target.tower.id, spare(state, tower, target.tower.id)));
  }
}

interface Plan {
  target: Tower;
  sources: { tower: Tower; n: Neighbour; force: number }[];
  relays: { tower: Tower; via: Tower; force: number }[];
  needed: number;
  force: number;
}

/**
 * Units the captured target needs to survive its strongest enemy neighbour: that neighbour's possible
 * column minus what the target (as ours) produces between our landing at `landingMs` and that column's
 * landing. A column no garrison could stop is not planned for. 0 when no enemy borders the target.
 */
function holdNeed(state: GameState, target: Tower, landingMs: number): number {
  const asOurs: Tower = { ...target, owner: OWNER };
  const cap = capacityOf(asOurs);
  let need = 0;
  for (const n of neighbours(state, target.id)) {
    const src = threatFrom(state, n, landingMs);
    if (!src || src.attackers > cap) continue;
    const grown = Math.floor((genPerSecond(asOurs) * Math.max(0, src.etaMs - landingMs)) / 1000);
    need = Math.max(need, Math.ceil(src.attackers / defenceMultiplier(asOurs)) - grown);
  }
  return Math.max(0, need);
}

/**
 * Extra weight a wave landing at `landingMs` with `surplus` left over must bring so the captured target
 * can be held: `holdNeed` minus the spare units of own towers next to the target that are not part of
 * the wave (they can walk over right after). Positive means the wave would be the last units thrown at
 * a tower we cannot keep — a gift to the enemy.
 */
function holdShortfall(ctx: Ctx, target: Tower, surplus: number, landingMs: number, waveIds: Set<string>): number {
  const need = holdNeed(ctx.state, target, landingMs);
  if (need <= surplus) return 0;
  let support = 0;
  for (const n of neighbours(ctx.state, target.id)) {
    if (n.tower.owner !== OWNER || waveIds.has(n.tower.id) || !free(ctx, n.tower)) continue;
    support += spare(ctx.state, n.tower);
  }
  return Math.max(0, need - surplus - support);
}

/** Rule 4b: attack the weakest adjacent enemy tower with every adjacent own tower plus rear relays at once. */
function attack(ctx: Ctx, mine: Tower[]): void {
  const { state } = ctx;
  const targets = new Map<string, Tower>();
  for (const tower of mine) for (const n of enemyNeighbours(state, tower.id)) targets.set(n.tower.id, n.tower);

  const plans: Plan[] = [];
  for (const target of targets.values()) {
    const inbound = incomingWeight(state, target.id, OWNER);
    const sources: Plan['sources'] = [];
    const relays: Plan['relays'] = [];
    const relayIds = new Set<string>();
    let losses = 0;
    let slowest = 0;
    for (const tower of mine) {
      if (!free(ctx, tower)) continue;
      const n = neighbours(state, tower.id).find((x) => x.tower.id === target.id);
      if (!n) continue;
      // A wave that is still enough on its own needs no company: keep the garrison at home.
      if (inbound > 0 && waveSuffices(inbound, n)) continue;
      const force = spare(state, tower, target.id);
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
        const force = spare(state, rear);
        if (force <= 0) continue;
        relayIds.add(rear.id);
        relays.push({ tower: rear, via: s.tower, force });
      }
    }
    let force = inbound;
    for (const s of sources) force += s.force;
    for (const r of relays) force += r.force;
    const streamMs = Math.min(MAX_STREAM_MS, force * C.LEAVE_INTERVAL_MS);
    for (const s of sources) force += Math.floor((genPerSecond(s.tower) * streamMs) / 1000);
    const firstHit = projectedDefenders(target, slowest);
    const regenDuringStream = Math.ceil((genPerSecond(target) * streamMs) / 1000) * defenceMultiplier(target);
    const toFlip = firstHit + regenDuringStream + losses;
    let needed = firstHit * ATTACK_FACTOR + ATTACK_SLACK + regenDuringStream + losses;
    // The captured tower must be holdable with what is left of the wave (the remainder becomes the
    // garrison one unit per weight, fortress or not), or the wave is just a gift.
    const waveIds = new Set([...sources.map((s) => s.tower.id), ...relays.map((r) => r.tower.id)]);
    needed += holdShortfall(ctx, target, Math.max(0, force - toFlip), slowest + streamMs, waveIds);
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
 * its strongest enemy neighbour — with friendly neighbours that can spare it covering the temporary
 * weakness in the same tick (a capped tower produces nothing, so a stalemate is broken here).
 */
function upgradeFrontline(ctx: Ctx, mine: Tower[]): void {
  const { state } = ctx;
  for (const tower of mine) {
    if (!free(ctx, tower) || isRear(ctx, tower)) continue;
    const cost = upgradeCost(tower);
    if (cost === undefined || tower.units < cost + UPGRADE_SLACK) continue;
    if (incomingThreat(state, tower.id) > 0) continue;
    const remaining = tower.units - cost;
    const upgraded: Tower = { ...tower, level: (tower.level + 1) as 1 | 2 | 3 };
    const sources = threatSources(state, upgraded);
    let deficit = reserveFor(state, upgraded, sources) + UPGRADE_SAFETY - remaining - incomingSupport(state, tower.id);
    const soonest = sources.reduce((min, s) => Math.min(min, s.etaMs), Infinity);
    const cover: { tower: Tower; amount: number }[] = [];
    if (deficit > 0) {
      const helpers = friendlyNeighbours(state, tower.id)
        .filter((h) => free(ctx, h.tower) && h.travelMs <= soonest + COVER_GRACE_MS)
        .sort((a, b) => a.travelMs - b.travelMs);
      for (const h of helpers) {
        if (deficit <= 0) break;
        const amount = Math.min(spare(state, h.tower), deficit);
        if (amount <= 0) continue;
        cover.push({ tower: h.tower, amount });
        deficit -= amount;
      }
      if (deficit > 0) continue;
    }
    push(ctx, tower, { type: 'upgrade', owner: OWNER, towerId: tower.id });
    for (const c of cover) push(ctx, c.tower, sendCommand(c.tower, tower.id, c.amount));
  }
}

/** Commands for the player owner this AI tick. Deterministic for a given state and rng. */
export function referencePlayerCommands(state: GameState, rng: Rng, trace?: RuleTrace): Command[] {
  const mine = ownedTowers(state, OWNER);
  if (mine.length === 0) return [];
  const ctx: Ctx = { state, rng, hops: hopsToOpponent(state, OWNER), used: new Set(), cmds: [], rule: '', trace };
  const rules: [string, (ctx: Ctx, mine: Tower[]) => void][] = [
    ['reinforce', reinforce],
    ['capture', captureNeutrals],
    ['upgradeRear', upgradeRear],
    ['supply', supplyForward],
    ['sustain', sustain],
    ['attack', attack],
    ['upgradeFront', upgradeFrontline],
  ];
  for (const [name, rule] of rules) {
    ctx.rule = name;
    rule(ctx, mine);
  }
  return ctx.cmds;
}
