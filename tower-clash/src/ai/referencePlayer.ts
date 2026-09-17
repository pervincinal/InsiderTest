/**
 * Reference player: a competent, non-cheating bot for the `player` owner. It is what `npm run playtest`
 * uses to prove every level is winnable. Deterministic: the only randomness is tie-breaking through
 * the supplied rng. Rules v2 (GDD §2.0): every move is a stream — `link` starts one, `unlink` ends it —
 * and a linked tower never grows, so the planner spends as much thought on *ending* streams as on
 * starting them. Rules run in priority order, each tower starting at most one stream per tick:
 *   0) maintain — end streams that have done their job or turned bad:
 *      · an attack that can no longer flip its target with what is on the road, what its sources still
 *        hold and what they trickle in over `MAX_STREAM_MS` (a stalemate feeds the enemy's production);
 *      · a supply line into an own tower that is safe and holds enough (`wantAt`: 10, or up to 25 when an
 *        enemy borders it), unless it relays into a tower that is attacking or comes from a finished rear
 *        keep that has nothing better to do with its production;
 *      · any stream whose source has drained to the reserve it must keep (`reserveToHold`: what survives
 *        the strongest column an enemy neighbour could throw, counting the hostile columns already on
 *        their way) — a wave, not a leak; the source then regrows unlinked,
 *      · a supply line whose source is drained (≤ `DRAINED_UNITS`) into a tower that a hostile stream
 *        still bleeds (`siegeNetRate` ≤ 0: the trickle out-delivers everything it gets) — the line only
 *        feeds a tower it cannot save; the answer to that trickle is a counter-stream at the drained
 *        enemy source (rule 4) or a bridge cut (rule 5), not a second tower starved at 0,
 *   1) reinforce — link a friendly neighbour to a tower under attack, only when its column lands before
 *      the tower falls and only when the helpers together save it (an all-in is answered, not raced):
 *      their bursts and trickle cover what it is short of within the horizon, and either the bursts
 *      alone absorb it or the helpers' trickle turns the siege around (`siegeNetRate` > 0 with them);
 *      ended by rule 0 once the tower is safe,
 *   2) capture — link to a neighbouring neutral the garrison can flip and hold (contested neutrals need
 *      more); in the opening a tower below `OPENING_GROW_LEVEL` keeps growing toward its auto-upgrade
 *      unless the neutral is free (no enemy borders it). The stream keeps supplying the captured tower
 *      until rule 0 ends it,
 *   3) supply — a finished rear keep (max level, producing into a cap) streams forward to the emptiest
 *      friendly tower toward the front (chained streams relay through),
 *   4) attack — the weakest adjacent enemy tower, with every free adjacent own tower (up to its link
 *      limit) plus rear relays chained into them, when what lands ≥ defenders × 1.2 + 2 (fortress-aware,
 *      counting what the target grows before the first landing, the sources' own production while the
 *      stream runs — the burst plus `SIEGE_PLAN_MS` of trickle, rules v2.1: from the first landing the
 *      target recruits nothing while landings are < `UNDER_FIRE_MS` apart — and what the captured tower
 *      needs to be held). A drained enemy source at 0 is the weakest target there is: streaming at it from
 *      a tower next to it — or from the sieged tower itself when its garrison exceeds what is still
 *      coming down that road (`spare` with the attacker excluded, `needed` counting its burst and the
 *      units on the road) — is how a hostile ribbon is answered. Bridge-aware: a bridge into an enemy
 *      keep that could cut it (a finished keep — the turtle's rule) is an exposed route; a stream over it
 *      is planned as losing everything landing later than one AI tick after its first unit steps on
 *      (`bridgeLoss`), and the plan without such sources is preferred when it reaches `needed` within
 *      +30 % of the exposed plan's delivery time (`SAFE_PLAN_SLOWDOWN`); a running stream is never joined
 *      over an exposed route,
 *   5) cut a bridge it owns an end of (`bridges.ts`) when a hostile column or stream on it — or the
 *      garrison about to come over it — would take the tower and the reinforcements above cannot save it,
 *      provided no own units or streams use the bridge and every enemy tower stays reachable.
 *
 * Commander upgrades (`state.modifiers`) are part of what the bot sees: its own capacities, production
 * and march times include them (via `capacityOf` / `modifiersFor` through the shared helpers), enemy
 * towers and columns never do. Never issues `sendUnits` or `upgrade` (legacy commands).
 */
import type { Command, GameState, Tower } from '../sim/index';
import { C, Rng, capacityOf, maxLinksOf } from '../sim/index';
import { bridgeCutCommands, keepsRoutes } from './bridges';
import {
  arrivalMs,
  atMaxLevel,
  defenceMultiplier,
  effectiveDefenders,
  enemyNeighbours,
  fallsAtMs,
  friendlyNeighbours,
  genPerSecond,
  holdReserve,
  hopsToOpponent,
  incomingSupport,
  incomingThreat,
  incomingWeight,
  inboundByOwner,
  inflowRate,
  isEnemyOwner,
  landings,
  linkCommand,
  linkPending,
  linkRate,
  neighbours,
  ownedTowers,
  producedIn,
  projectedUnits,
  roadBetween,
  siegeNetRate,
  siegeRegenPerSecond,
  threatFrom,
  unlinkCommand,
  walkingWeight,
  wholeUnits,
  SIEGE_PLAN_MS,
  STREAM_HORIZON_MS,
  type Neighbour,
  type ThreatSource,
} from './common';

const OWNER = 'player' as const;
/** Rule 0: a captured tower is supplied to at least this garrison before its stream ends. */
export const SUPPLY_MIN = 10;
/** Rule 0: a captured front tower is supplied to at most this (a full L1 garrison: it upgrades there). */
export const SUPPLY_MAX = C.CAPACITY[1];
/** Rule 3: a finished rear keep ships its production forward once it holds this fraction of its capacity. */
const SUPPLY_FILL = 0.6;
/**
 * Rule 2: a tower below this level lets its garrison grow toward the auto-upgrade rather than stream
 * into a contested neutral (a free neutral — no enemy borders it — is always taken). Measured over all
 * levels: taking contested neutrals from L1 (value 1) wins more than growing to L2 first (value 2):
 * 148/160 vs 127/160 over seeds 1–4, because enemy chains claim the neutrals otherwise.
 */
export const OPENING_GROW_LEVEL = 1;
/** Rule 4: attack when what lands ≥ defenders × ATTACK_FACTOR + ATTACK_SLACK. */
const ATTACK_FACTOR = 1.2;
const ATTACK_SLACK = 2;
/** Rule 4: a stream longer than this is not planned for (later units are a bonus). */
const MAX_STREAM_MS = 20_000;
/**
 * Rule 4: how long after the first unit steps on a bridge the far tower could cut it — one enemy AI tick.
 * Everything of the stream landing later than that is planned as lost (the sim drowns walking units and
 * the stream's road is gone).
 */
export const CUT_REACTION_MS = C.AI_TICK_MS;
/** Rule 4: a plan without exposed routes is preferred when it delivers `needed` within this factor of the exposed plan's time. */
export const SAFE_PLAN_SLOWDOWN = 1.3;
/** Home reserve: defenders kept above the strongest column that could land. */
const HOLD_MARGIN = 1;
/** Rule 0: a stream source holding at most this is drained — it only relays its production. */
export const DRAINED_UNITS = 1;
/** Rule 1: the smallest burst worth pouring into a siege the helpers cannot turn — one AI tick of drain. */
export const MIN_WAVE = Math.floor(C.AI_TICK_MS / C.LEAVE_INTERVAL_MS);
/**
 * Rule 4: hard cap on plans launched per tick. Every launched plan marks its sources used, so the loop
 * ends after at most one iteration per own tower; the cap is a last line of defence against a plan that
 * launches nothing.
 */
const MAX_PLANS_PER_TICK = 64;

/** Optional hook for tooling: called with the rule that produced each command. */
export type RuleTrace = (rule: string, cmd: Command) => void;

interface Ctx {
  state: GameState;
  rng: Rng;
  hops: Map<string, number>;
  /** Towers that started a stream this tick (one per tick). */
  used: Set<string>;
  cmds: Command[];
  rule: string;
  trace?: RuleTrace;
  /** Own streams as they will be after this tick's commands: source id → target ids. */
  links: Map<string, Set<string>>;
  /** Pairs `from>to` ended this tick (never re-linked in the same tick). */
  ended: Set<string>;
  /** Roads own streams use after this tick (commands are not applied until the tick ends). */
  usedRoads: Set<string>;
  /** Friendly weight committed to each tower by this tick's new streams. */
  sentTo: Map<string, number>;
  /** Weight committed away from each tower by this tick's new streams. */
  sentFrom: Map<string, number>;
}

function costToTake(n: Neighbour): number {
  return n.roadCost + n.oncoming;
}

function isRear(ctx: Ctx, tower: Tower): boolean {
  return (ctx.hops.get(tower.id) ?? Infinity) >= 2;
}

/* ---------- Stream bookkeeping for this tick ---------- */

function targetsOf(ctx: Ctx, from: string): Set<string> {
  let set = ctx.links.get(from);
  if (!set) {
    set = new Set();
    ctx.links.set(from, set);
  }
  return set;
}

function isLinkedTo(ctx: Ctx, from: string, to: string): boolean {
  return targetsOf(ctx, from).has(to);
}

/** Link slots the tower still has after this tick's commands. */
function slots(ctx: Ctx, tower: Tower): number {
  return maxLinksOf(tower) - targetsOf(ctx, tower.id).size;
}

/**
 * A tower pours its whole garrison into its streams round-robin, so a new capture, attack or supply
 * starts only from a tower with no stream at all (one purpose at a time; reinforcing is the exception,
 * it uses a spare slot). Also false when the level allows no more links.
 */
function idle(ctx: Ctx, tower: Tower): boolean {
  return targetsOf(ctx, tower.id).size === 0 && slots(ctx, tower) > 0;
}

/** Is the tower streaming into a tower it does not own (an attack or a capture)? */
function attacks(ctx: Ctx, tower: Tower): boolean {
  for (const to of targetsOf(ctx, tower.id)) if (ctx.state.towers[to]?.owner !== OWNER) return true;
  return false;
}

function free(ctx: Ctx, tower: Tower): boolean {
  return !ctx.used.has(tower.id);
}

/** Record a new stream `tower → to` carrying about `weight`. The tower counts as used for this tick. */
function pushLink(ctx: Ctx, tower: Tower, to: string, weight: number): void {
  ctx.used.add(tower.id);
  if (isLinkedTo(ctx, tower.id, to) || ctx.ended.has(`${tower.id}>${to}`) || slots(ctx, tower) <= 0) return;
  const cmd = linkCommand(tower, to);
  ctx.cmds.push(cmd);
  ctx.trace?.(ctx.rule, cmd);
  targetsOf(ctx, tower.id).add(to);
  const road = roadBetween(ctx.state, tower.id, to);
  if (road) ctx.usedRoads.add(road.id);
  ctx.sentTo.set(to, (ctx.sentTo.get(to) ?? 0) + weight);
  ctx.sentFrom.set(tower.id, (ctx.sentFrom.get(tower.id) ?? 0) + weight);
}

/** Record the end of the stream `tower → to`. */
function pushUnlink(ctx: Ctx, tower: Tower, to: string): void {
  if (!isLinkedTo(ctx, tower.id, to)) return;
  const cmd = unlinkCommand(tower, to);
  ctx.cmds.push(cmd);
  ctx.trace?.(ctx.rule, cmd);
  targetsOf(ctx, tower.id).delete(to);
  ctx.ended.add(`${tower.id}>${to}`);
  const road = roadBetween(ctx.state, tower.id, to);
  if (road && ![...ctx.links.entries()].some(([f, set]) => [...set].some((t) => roadBetween(ctx.state, f, t)?.id === road.id))) {
    ctx.usedRoads.delete(road.id);
  }
}

/* ---------- Threat model (what a human sees: garrisons, columns and streams on the roads) ---------- */

/** Every column that could be sent at `tower`, one per hostile neighbour (excluding `exclude`). */
function threatSources(state: GameState, tower: Tower, exclude?: string): ThreatSource[] {
  const out: ThreatSource[] = [];
  for (const n of neighbours(state, tower.id)) {
    if (n.tower.id === exclude) continue;
    const src = threatFrom(state, OWNER, n);
    if (src) out.push(src);
  }
  return out;
}

/**
 * Units `tower` must keep so that it survives what is visibly coming at it (`holdReserve`: columns and
 * streams, burst and trickle, over the next `STREAM_HORIZON_MS`) and, with what it produces before each
 * possible column lands, the strongest column a hostile neighbour could still throw. A column no
 * garrison could stop (bigger than the capacity) does not lock units at home: those are better spent
 * elsewhere. 0 when nothing can reach the tower.
 */
function reserveFor(state: GameState, as: Tower, sources: ThreatSource[], exclude?: string): number {
  const mult = defenceMultiplier(as);
  const threat = incomingThreat(state, as.id);
  let reserve = holdReserve(state, as, HOLD_MARGIN, undefined, exclude);
  const cap = capacityOf(as, state);
  if (reserve > cap) reserve = 0;
  for (const src of sources) {
    const need = Math.ceil((src.attackers + threat) / mult) + HOLD_MARGIN;
    const grown = Math.floor(producedIn(as, src.etaMs, state));
    if (need - grown > cap) continue;
    reserve = Math.max(reserve, need - grown);
  }
  return Math.max(0, reserve);
}

/**
 * Home reserve of a tower; `exclude` is a neighbour this tower's stream attacks head-on: its garrison is
 * spoken for and whatever it sends down that road meets our column.
 */
function reserveToHold(state: GameState, tower: Tower, exclude?: string): number {
  return reserveFor(state, tower, threatSources(state, tower, exclude), exclude);
}

/** Weight the tower can pour into a stream and still hold, in whole units of its kind (0 for a sub-tank factory). */
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

/* ---------- Bridge awareness (rule 4): routes an enemy could cut under the stream ---------- */

/**
 * Could the owner of `tower` cut a bridge under a stream heading to it? An enemy tower at its max level:
 * the turtle burns bridges only for a keep it has finished building, and that is what a human would
 * expect of any careful opponent. Neutral towers have nobody to cut; other enemy towers are not planned
 * for (over-caution on every bridge would send the bot the long way round on levels 28–36).
 */
export function mayCutBridge(tower: Tower): boolean {
  return isEnemyOwner(tower.owner) && atMaxLevel(tower);
}

/**
 * A stream over `n` that the far end could cut: a bridge into a tower that `mayCutBridge` — unless the
 * cut would strand the far side. Nobody burns the last road to the towers they mean to take (rule 5 never
 * does; `keepsRoutes` is the same public test from the far owner's side), so a bridge whose loss would
 * lengthen the enemy's way to one of our towers by more than `MAX_DETOUR_HOPS` is safe to use.
 */
export function exposedRoute(state: GameState, n: Neighbour): boolean {
  return n.road.kind === 'bridge' && mayCutBridge(n.tower) && keepsRoutes(state, n.tower.owner, n.road, new Set());
}

/**
 * Weight of a `force` stream over an exposed bridge of `travelMs` that is lost when the far end cuts
 * `CUT_REACTION_MS` after the first unit steps on: every unit landing later than that. Units leave one
 * per `LEAVE_INTERVAL_MS`, so unit k lands at `travelMs + k × LEAVE_INTERVAL_MS` — on any real bridge
 * (longer than 60 px) that is the whole stream.
 */
export function bridgeLoss(force: number, travelMs: number): number {
  const kept = Math.max(0, Math.floor((CUT_REACTION_MS - travelMs) / C.LEAVE_INTERVAL_MS) + 1);
  return Math.max(0, force - kept);
}

/* ---------- Attack plans (rules 0 and 4) ---------- */

interface Source {
  tower: Tower;
  n: Neighbour;
  /** Weight the source adds if it starts streaming now (0 when it already streams: that is in `inbound`). */
  force: number;
  /** Already streaming into the target. */
  linked: boolean;
  /** The route is a bridge the target could cut (`exposedRoute`). */
  exposed: boolean;
}

interface Plan {
  target: Tower;
  sources: Source[];
  relays: RelayOption[];
  /** Weight that must land to flip the target with what it grows meanwhile (no margin). */
  toFlip: number;
  /** `toFlip` with the attack margin and what the captured tower needs to be held. */
  needed: number;
  /** Weight that lands: the stream minus what exposed routes lose to a cut (`bridgeLoss`). */
  force: number;
  /** When `needed` weight has landed, ms: the slowest road plus the stream shared by the surviving sources. */
  deliveryMs: number;
}

/**
 * Units the captured target needs to survive its strongest enemy neighbour: that neighbour's possible
 * column minus what the target (as ours) produces between our landing at `landingMs` and that column's
 * landing. A column bigger than the tower's capacity counts too — a capture that cannot be held is a
 * gift, so the wave must bring that surplus or wait. 0 when no enemy borders the target.
 */
function holdNeed(state: GameState, target: Tower, landingMs: number): number {
  const asOurs: Tower = { ...target, owner: OWNER };
  let need = 0;
  for (const n of neighbours(state, target.id)) {
    const src = threatFrom(state, OWNER, n, landingMs);
    if (!src) continue;
    const grown = Math.floor((genPerSecond(asOurs, state) * Math.max(0, src.etaMs - landingMs)) / 1000);
    need = Math.max(need, Math.ceil(src.attackers / defenceMultiplier(asOurs)) - grown);
  }
  return Math.max(0, need);
}

/**
 * Extra weight a stream landing at `landingMs` with `surplus` left over must bring so the captured target
 * can be held: `holdNeed` minus the spare units of own *rear* towers next to the target that are not
 * part of the stream (they can stream over right after). A neighbour that borders an enemy tower does
 * not count: it has its own fight and the attack rule will spend it there. Positive means the stream
 * would be the last units thrown at a tower we cannot keep — a gift to the enemy.
 */
function holdShortfall(ctx: Ctx, target: Tower, surplus: number, landingMs: number, waveIds: Set<string>): number {
  const need = holdNeed(ctx.state, target, landingMs);
  if (need <= surplus) return 0;
  let support = 0;
  for (const n of neighbours(ctx.state, target.id)) {
    if (n.tower.owner !== OWNER || waveIds.has(n.tower.id) || !free(ctx, n.tower)) continue;
    if (enemyNeighbours(ctx.state, n.tower.id).length > 0) continue;
    support += spare(ctx.state, n.tower);
  }
  return Math.max(0, need - surplus - support);
}

/** A rear tower that could chain into a source of the plan. */
interface RelayOption {
  tower: Tower;
  via: Tower;
  force: number;
}

/** Free rear neighbours of the plan's sources that could chain into them, biggest first. */
function relayOptions(ctx: Ctx, sources: Source[]): RelayOption[] {
  const { state } = ctx;
  const out: RelayOption[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    for (const r of friendlyNeighbours(state, s.tower.id)) {
      const rear = r.tower;
      if (!free(ctx, rear) || seen.has(rear.id) || sources.some((x) => x.tower.id === rear.id)) continue;
      if (!idle(ctx, rear) || ctx.ended.has(`${rear.id}>${s.tower.id}`)) continue;
      if (enemyNeighbours(state, rear.id).length > 0) continue;
      const force = spare(state, rear);
      if (force <= 0) continue;
      seen.add(rear.id);
      out.push({ tower: rear, via: s.tower, force });
    }
  }
  return out.sort((a, b) => b.force - a.force || a.tower.id.localeCompare(b.tower.id));
}

/**
 * The stream `sources` (own towers next to `target`, with `inbound` already on the road or draining
 * toward it) can throw at it, with the given rear `relays` chained into them: what lands after bridge
 * losses, what the target needs, and when.
 */
function evaluatePlan(ctx: Ctx, target: Tower, sources: Source[], inbound: number, relays: RelayOption[], hold = true): Plan {
  const { state } = ctx;
  let losses = 0;
  let slowest = 0;
  for (const s of sources) {
    losses += costToTake(s.n);
    slowest = Math.max(slowest, s.n.travelMs);
  }
  let raw = inbound;
  let lost = 0;
  let streams = 0;
  for (const s of sources) {
    // A streaming source's garrison is in `inbound`; what walks into a source flows on through it.
    let through = s.force + incomingSupport(state, s.tower.id);
    for (const r of relays) if (r.via.id === s.tower.id) through += r.force;
    raw += through;
    const loss = s.exposed ? bridgeLoss(through, s.n.travelMs) : 0;
    lost += loss;
    if (through - loss > 0 || s.linked) streams++;
  }
  let force = raw - lost;
  const burstMs = Math.min(MAX_STREAM_MS, Math.max(force, 1) * C.LEAVE_INTERVAL_MS);
  // A source with nothing to hold back keeps producing into the stream — unless its route is cut under
  // it. Rules v2.1: that trickle keeps landing on a target that recruits nothing, so the plan runs
  // `SIEGE_PLAN_MS` past the burst (within `MAX_STREAM_MS`) when there is a trickle at all.
  const trickling = sources.filter((s) => !s.exposed && reserveToHold(state, s.tower, target.id) <= 0);
  let trickle = 0;
  for (const s of trickling) trickle += genPerSecond(s.tower, state);
  // Rules v2.1: nothing is recruited during the burst (a landing every 120 ms) and only what the gap
  // between trickle landings leaves after it; friendly supply into the target still lands. The siege
  // phase is planned only when our trickle gains on that.
  const unit = trickling.length > 0 && trickling.every((s) => s.tower.kind === 'tankFactory') ? C.TANK_WEIGHT : C.INFANTRY_WEIGHT;
  const gapMs = trickle > 0 ? (1000 * unit) / trickle : Infinity;
  const supplyRate = inflowRate(state, target.id, false);
  // What the target itself streams down our roads meets our column there: a loss over the siege phase
  // (its growth before our first landing is in `firstHit`, whether it stays in the garrison or walks).
  let roadTrickle = 0;
  for (const s of sources) roadTrickle += streamRateInto(state, target.id, s.tower.id);
  const siegeGain = trickle - roadTrickle - (supplyRate + siegeRegenPerSecond(target, gapMs, state)) * defenceMultiplier(target);
  const firstHit = defendersAtLanding(state, target, slowest);
  // The siege phase is opened by a wave that matches the garrison it hits — a thin stream is walked
  // through by the target's own counter (a turtle keep at 100 answers a 1-unit source at once).
  const planMs = siegeGain > 0 && force >= firstHit ? Math.min(MAX_STREAM_MS, burstMs + SIEGE_PLAN_MS) : burstMs;
  for (const s of trickling) force += Math.floor(producedIn(s.tower, planMs, state));
  losses += Math.ceil((roadTrickle * Math.max(0, planMs - burstMs)) / 1000);
  const regenUnits = (supplyRate * planMs + siegeRegenPerSecond(target, gapMs, state) * Math.max(0, planMs - burstMs)) / 1000;
  const regenDuringStream = Math.ceil(regenUnits) * defenceMultiplier(target);
  const streamMs = planMs;
  const toFlip = firstHit + regenDuringStream + losses;
  let needed = firstHit * ATTACK_FACTOR + ATTACK_SLACK + regenDuringStream + losses;
  // The captured tower must be holdable with what is left of the stream (the remainder becomes the
  // garrison one unit per weight, fortress or not), or the stream is just a gift.
  const waveIds = new Set([...sources.map((s) => s.tower.id), ...relays.map((r) => r.tower.id)]);
  const shortfall = hold ? holdShortfall(ctx, target, Math.max(0, force - toFlip), slowest + streamMs, waveIds) : 0;
  needed += shortfall;
  const deliveryMs = slowest + Math.min(MAX_STREAM_MS, (needed * C.LEAVE_INTERVAL_MS) / Math.max(1, streams));
  return { target, sources, relays, toFlip, needed, force, deliveryMs };
}

/**
 * The plan for `target` from `sources`: without relays when they suffice, otherwise with rear relays
 * chained in one at a time (biggest first) until it is covered — rear garrisons that are not needed
 * keep growing toward their auto-upgrade. `recruit: false` judges a running stream as it is.
 */
function buildPlan(ctx: Ctx, target: Tower, sources: Source[], inbound: number, recruit: boolean, hold = true): Plan {
  let plan = evaluatePlan(ctx, target, sources, inbound, [], hold);
  if (!recruit || plan.force >= plan.needed) return plan;
  const options = relayOptions(ctx, sources);
  const relays: RelayOption[] = [];
  for (const r of options) {
    relays.push(r);
    plan = evaluatePlan(ctx, target, sources, inbound, relays, hold);
    if (plan.force >= plan.needed) break;
  }
  return plan;
}

/** Own towers streaming into `target` right now, as plan sources (force 0: their garrison is inbound). */
function streamingSources(ctx: Ctx, target: Tower): Source[] {
  const { state } = ctx;
  const out: Source[] = [];
  for (const l of state.links) {
    if (l.owner !== OWNER || l.to !== target.id) continue;
    const tower = state.towers[l.from];
    if (!tower || !isLinkedTo(ctx, tower.id, target.id)) continue;
    const n = neighbours(state, tower.id).find((x) => x.tower.id === target.id);
    if (!n) continue;
    out.push({ tower, n, force: 0, linked: true, exposed: exposedRoute(state, n) });
  }
  return out;
}

/* ---------- Rule 0: maintain ---------- */

/**
 * Does the attack `tower` streams into still need what `relay` pours in? A relay is a wave, not a
 * leak: it goes on only while the plan is covered *with* what the relay still holds and short without
 * it. Once the rest suffices — or the plan is short even with everything the relay has — the rear
 * tower goes back to growing.
 */
function relayStillNeeded(ctx: Ctx, tower: Tower, relay: Tower): boolean {
  const { state } = ctx;
  const link = state.links.find((l) => l.owner === OWNER && l.from === relay.id && l.to === tower.id);
  const remaining = link ? linkPending(state, link) : 0;
  for (const to of targetsOf(ctx, tower.id)) {
    const target = state.towers[to];
    if (!target || target.owner === OWNER) continue;
    const sources = streamingSources(ctx, target);
    if (sources.length === 0) continue;
    const plan = buildPlan(ctx, target, sources, incomingWeight(state, target.id, OWNER), false);
    if (plan.force >= plan.needed && plan.force - remaining < plan.needed) return true;
  }
  return false;
}

/**
 * Garrison a supplied own tower should reach before its stream ends: nothing when no enemy borders it
 * and nothing is coming (both towers grow best on their own), otherwise what it needs to hold, between
 * `SUPPLY_MIN` and `SUPPLY_MAX`.
 */
export function wantAt(state: GameState, tower: Tower): number {
  if (enemyNeighbours(state, tower.id).length === 0 && incomingThreat(state, tower.id) <= 0) return 0;
  return Math.min(SUPPLY_MAX, Math.max(SUPPLY_MIN, reserveToHold(state, tower)));
}

/** Is a hostile stream (a ribbon of another owner) aimed at the tower? */
function besieged(state: GameState, tower: Tower): boolean {
  return state.links.some((l) => l.to === tower.id && l.owner !== tower.owner);
}

/** Units per second the enemy tower `from` streams into `to` right now (0 without such a ribbon). */
function streamRateInto(state: GameState, from: string, to: string): number {
  let rate = 0;
  for (const l of state.links) if (l.from === from && l.to === to) rate += linkRate(state, l);
  return rate;
}

/**
 * Rules v2.1 parry: a stream from `tower` back at an enemy `source` that streams into it, run only
 * while the enemy keeps its ribbon up and our production on that road is at least its trickle. The two
 * trickles annihilate on the road, nothing lands on either side, and the rest of our economy outgrows
 * theirs — the last resort when supply cannot save the tower and no surplus can flip the source.
 */
function isParry(state: GameState, tower: Tower, source: Tower): boolean {
  if (!isEnemyOwner(source.owner)) return false;
  const theirs = streamRateInto(state, source.id, tower.id);
  return theirs > 0 && genPerSecond(tower, state) >= theirs;
}

function maintain(ctx: Ctx, mine: Tower[]): void {
  const { state } = ctx;
  // (a) hopeless attacks: everything this owner streams into an enemy tower, judged per target.
  const targets = new Map<string, Tower>();
  for (const l of state.links) {
    const t = state.towers[l.to];
    if (l.owner === OWNER && t && isEnemyOwner(t.owner)) targets.set(t.id, t);
  }
  for (const target of targets.values()) {
    const sources = streamingSources(ctx, target).filter((s) => !isParry(state, s.tower, target));
    if (sources.length === 0) continue;
    const plan = buildPlan(ctx, target, sources, incomingWeight(state, target.id, OWNER), false);
    if (plan.force >= plan.toFlip) continue;
    for (const s of sources) pushUnlink(ctx, s.tower, target.id);
  }
  // (b) supply lines and drained sources.
  for (const tower of mine) {
    for (const to of [...targetsOf(ctx, tower.id)]) {
      const target = state.towers[to];
      if (!target) continue;
      if (target.owner === OWNER) {
        const link = state.links.find((l) => l.owner === OWNER && l.from === tower.id && l.to === to);
        const threatened = holdReserve(state, target, HOLD_MARGIN, link) > target.units;
        const relay = attacks(ctx, target) && relayStillNeeded(ctx, target, tower);
        const supply = atMaxLevel(tower) && isRear(ctx, tower) && (ctx.hops.get(target.id) ?? Infinity) < (ctx.hops.get(tower.id) ?? Infinity);
        if (!threatened && !relay && !supply && target.units >= wantAt(state, target)) {
          pushUnlink(ctx, tower, to);
          continue;
        }
        // Rules v2.1: a drained source feeding a tower that a hostile stream still bleeds is a leak —
        // the target cannot be saved by supply, only by a counter-stream or a cut (rules 4 and 5).
        if (!relay && tower.units <= DRAINED_UNITS && besieged(state, target) && siegeNetRate(state, target) <= 0) {
          pushUnlink(ctx, tower, to);
          continue;
        }
      }
      if (target.owner === 'neutral') {
        // Metered capture: once enough is walking, the rest stays home.
        const n = neighbours(state, tower.id).find((x) => x.tower.id === to);
        if (n && walkingWeight(state, to, OWNER) >= captureWant(ctx, tower, n).want) {
          pushUnlink(ctx, tower, to);
          continue;
        }
      }
      if (isParry(state, tower, target)) continue; // the road duel goes on while their ribbon is up
      const reserve = reserveToHold(state, tower, target.owner === OWNER ? undefined : to);
      if (reserve > 0 && tower.units <= reserve) pushUnlink(ctx, tower, to);
    }
  }
}

/* ---------- Rule 1: reinforce ---------- */

/**
 * Link friendly neighbours to a tower that cannot hold what is coming at it (`holdReserve` above its
 * garrison) — only helpers whose stream lands before the tower falls, and only when together they save
 * it (an all-in is answered, not raced). A helper brings its spare garrison and, when nothing forces it
 * to keep a reserve, its production for the rest of the horizon; rule 0 ends its stream once the tower
 * holds on its own.
 */
function reinforce(ctx: Ctx, mine: Tower[]): void {
  const { state } = ctx;
  for (const tower of mine) {
    // A streaming tower relays whatever lands on it straight onto the road: nothing to hold there.
    if (targetsOf(ctx, tower.id).size > 0) continue;
    let deficit = holdReserve(state, tower, HOLD_MARGIN) - tower.units - (ctx.sentTo.get(tower.id) ?? 0);
    if (deficit <= 0) continue;
    const falls = fallsAtMs(state, tower);
    // The garrison absorbs a stream one unit per LEAVE_INTERVAL_MS: help landing within that window still counts.
    const deadline = falls === Infinity ? STREAM_HORIZON_MS : falls + Math.max(0, tower.units) * C.LEAVE_INTERVAL_MS;
    const helpers = friendlyNeighbours(state, tower.id)
      .filter((n) => free(ctx, n.tower) && slots(ctx, n.tower) > 0 && !isLinkedTo(ctx, n.tower.id, tower.id) && n.travelMs <= deadline)
      .map((n) => {
        // The helper's reserve is judged without the tower it is about to save (its fall is the threat).
        const reserve = reserveToHold(state, n.tower, tower.id);
        const burst = Math.max(0, wholeUnits(n.tower, n.tower.units - reserve) - n.oncoming);
        const rate = reserve > 0 ? 0 : genPerSecond(n.tower, state);
        const trickle = Math.floor((rate * Math.max(0, STREAM_HORIZON_MS - n.travelMs)) / 1000);
        return { n, burst, rate, help: burst + trickle };
      })
      .filter((h) => h.help > 0)
      .sort((a, b) => a.n.travelMs - b.n.travelMs);
    const total = helpers.reduce((sum, h) => sum + h.help, 0);
    if (total < deficit) continue; // do not feed a tower that is lost anyway
    // Rules v2.1: a tower under a trickle recruits nothing, so the helpers must either absorb the
    // attack's burst (what is on the roads and still to drain) with their bursts or out-deliver the
    // trickle with theirs — otherwise the line is a leak.
    const bursts = helpers.reduce((sum, h) => sum + h.burst, 0);
    const rates = helpers.reduce((sum, h) => sum + h.rate, 0);
    const hostileBurst = Math.ceil(incomingThreat(state, tower.id) / defenceMultiplier(tower)) + HOLD_MARGIN;
    const leak = siegeNetRate(state, tower, rates) <= 0;
    if (leak && bursts + Math.max(0, tower.units) < hostileBurst) continue;
    for (const h of helpers) {
      if (deficit <= 0) break;
      // Into a siege the helpers cannot turn, only a wave goes: at least one AI tick of drain, never a
      // trickle-only helper (that is a leak, and a 1-unit source re-linking every tick is the same leak).
      if (leak && h.burst < MIN_WAVE) continue;
      pushLink(ctx, h.n.tower, tower.id, h.burst);
      deficit -= h.help;
    }
  }
}

/* ---------- Rule 2: capture neutrals ---------- */

/** Neighbours owned by an enemy owner (whatever the tower's own owner: also right for a neutral target). */
function rivalNeighbours(state: GameState, towerId: string): Neighbour[] {
  return neighbours(state, towerId).filter((n) => isEnemyOwner(n.tower.owner));
}

/** A neutral nobody else can reach: no enemy tower borders it and nothing hostile heads to it. */
function freeNeutral(state: GameState, target: Tower): boolean {
  return rivalNeighbours(state, target.id).length === 0 && incomingThreat(state, target.id) <= 0;
}

/**
 * What a capture of the neutral `n` from `tower` must land: the garrison, the road and whatever else
 * lands there, one spare ("garrison > units + 1"), and what holding it takes once captured.
 */
function captureWant(ctx: Ctx, tower: Tower, n: Neighbour): { base: number; want: number; theirs: number; theirEta: number } {
  const { state } = ctx;
  const mult = defenceMultiplier(n.tower);
  let theirs = 0;
  let theirEta = Infinity;
  for (const [owner, v] of inboundByOwner(state, n.tower.id)) {
    if (owner === OWNER) continue;
    theirs += v.weight;
    theirEta = Math.min(theirEta, v.etaMs);
  }
  const flip = effectiveDefenders(n.tower) + costToTake(n) + theirs;
  const base = flip + mult + 1;
  const landing = arrivalMs(n.travelMs, base);
  const hold = holdShortfall(ctx, n.tower, base - flip, landing, new Set([tower.id]));
  return { base, want: base + hold, theirs, theirEta };
}

/**
 * Stream into a neighbouring neutral when the garrison can flip it and still hold. A neutral that an
 * enemy tower can also reach is contested: it takes enough to beat that enemy's garrison as well when
 * affordable, otherwise everything that can be spared — but never the home reserve — and, in the
 * opening, a tower still growing toward L2 leaves contested neutrals alone. The stream is metered:
 * rule 0 ends it once enough is on the road (the surplus stays home and grows).
 */
function captureNeutrals(ctx: Ctx, mine: Tower[]): void {
  const { state } = ctx;
  const taken = new Set<string>();
  for (const tower of mine) {
    if (!free(ctx, tower) || !idle(ctx, tower)) continue;
    const neutrals = neighbours(state, tower.id).filter(
      (n) => n.tower.owner === 'neutral' && !taken.has(n.tower.id) && !isLinkedTo(ctx, tower.id, n.tower.id) && !ctx.ended.has(`${tower.id}>${n.tower.id}`),
    );
    const target = pick(ctx, neutrals, (n) => effectiveDefenders(n.tower) + costToTake(n));
    if (!target) continue;
    if (tower.level < OPENING_GROW_LEVEL && !freeNeutral(state, target.tower)) continue;
    const ours = incomingWeight(state, target.tower.id, OWNER);
    const { base, want, theirEta } = captureWant(ctx, tower, target);
    const available = spare(state, tower, target.tower.id);
    if (ours > 0) {
      // A column is already walking: join only if the enemy started racing after we committed and the
      // extra weight still lands before the enemy's column does.
      const deficit = base - ours;
      if (deficit <= 0 || available < deficit) continue;
      if (arrivalMs(target.travelMs, deficit) > theirEta) continue;
      taken.add(target.tower.id);
      pushLink(ctx, tower, target.tower.id, Math.min(available, deficit));
      continue;
    }
    if (available < want) continue;
    taken.add(target.tower.id);
    pushLink(ctx, tower, target.tower.id, Math.min(available, want));
  }
}

/* ---------- Rule 3: supply forward ---------- */

/** A finished rear keep (max level, its production capped) streams forward to the emptiest friendly tower. */
function supplyForward(ctx: Ctx, mine: Tower[]): void {
  const { state } = ctx;
  for (const tower of mine) {
    if (!free(ctx, tower) || !idle(ctx, tower) || !atMaxLevel(tower)) continue;
    const myHops = ctx.hops.get(tower.id);
    if (myHops === undefined || myHops < 2) continue;
    if (incomingThreat(state, tower.id) > 0) continue;
    if (tower.units < capacityOf(tower, state) * SUPPLY_FILL) continue;
    const forward = friendlyNeighbours(state, tower.id).filter(
      (n) =>
        (ctx.hops.get(n.tower.id) ?? Infinity) < myHops &&
        n.tower.units < capacityOf(n.tower, state) &&
        !isLinkedTo(ctx, tower.id, n.tower.id) &&
        !ctx.ended.has(`${tower.id}>${n.tower.id}`),
    );
    const target = pick(ctx, forward, (n) => n.tower.units);
    if (!target) continue;
    pushLink(ctx, tower, target.tower.id, spare(state, tower));
  }
}

/* ---------- Rule 4: attack ---------- */

/**
 * Defenders (in attacker weight) the target will have when a unit sent now lands: its garrison plus
 * what it produces on the way, plus the friendly weight already walking or streaming to it.
 */
function defendersAtLanding(state: GameState, target: Tower, travelMs: number): number {
  const cap = capacityOf(target, state);
  const units = Math.min(cap, projectedUnits(target, travelMs, state) + incomingSupport(state, target.id));
  return units * defenceMultiplier(target);
}

/**
 * Is a stream of `inbound` weight enough to flip the neighbour by `margin`, counting what it grows and
 * receives before a unit sent now lands?
 */
function waveSuffices(state: GameState, inbound: number, n: Neighbour, margin = 0): boolean {
  return inbound > defendersAtLanding(state, n.tower, n.travelMs) + costToTake(n) + margin;
}

/**
 * Attack the weakest adjacent enemy tower with every free adjacent own tower plus rear relays at once;
 * a running stream that is short is joined by the free sources next to it (never over an exposed
 * route). When some routes are bridges the target could cut, the plan without them is taken if it is
 * enough and not much slower (`SAFE_PLAN_SLOWDOWN`); otherwise the exposed plan stands, judged on what
 * survives the cut.
 */
function attack(ctx: Ctx, mine: Tower[]): void {
  const { state } = ctx;
  const targets = new Map<string, Tower>();
  for (const tower of mine) for (const n of enemyNeighbours(state, tower.id)) targets.set(n.tower.id, n.tower);
  launchPlans(ctx, mine, targets, true);
}

/**
 * Rules v2.1 answer to a hostile ribbon that rule 1 could not (or need not) answer with supply: stream
 * at the stream's source. A streaming enemy tower drains to nothing and recruits nothing once hit, so
 * it is the weakest target on the map, and its capture ends the stream (`sourceLost`). Towers other
 * than the sieged one go first; the sieged tower joins only when its own spare — what it holds above
 * every *other* threat — beats what is still coming down that road (`needed` counts the source's burst
 * as garrison and the units on the road as losses): a counter without a surplus is the deadlock the
 * GDD warns of. Holding the capture is not required: killing the stream is the point.
 */
function counter(ctx: Ctx, mine: Tower[]): void {
  const { state } = ctx;
  const targets = new Map<string, Tower>();
  for (const tower of mine) {
    for (const l of state.links) {
      const from = state.towers[l.from];
      if (l.to === tower.id && from && isEnemyOwner(from.owner)) targets.set(from.id, from);
    }
  }
  if (targets.size === 0) return;
  const calm = mine.filter((t) => !besieged(state, t));
  launchPlans(ctx, calm, targets, false);
  launchPlans(ctx, mine, targets, false);
}

/**
 * Does `tower`'s garrison plus its production meet every hostile landing on it in time when all of it
 * is sent down the road instead (a parry)? Units clash on the road, so nothing pauses recruiting; a
 * negative balance means their surplus lands on an empty tower.
 */
function parryHolds(state: GameState, tower: Tower): boolean {
  const mult = defenceMultiplier(tower);
  const rate = genPerSecond(tower, state);
  const hostile = landings(state, tower)
    .filter((l) => l.hostile)
    .sort((a, b) => a.etaMs - b.etaMs);
  let g = tower.units;
  let tPrev = 0;
  for (const l of hostile) {
    g += (rate * (l.etaMs - tPrev)) / 1000 - l.weight / mult;
    tPrev = l.etaMs;
    if (g < 0) return false;
  }
  return true;
}

/**
 * Rules v2.1 last resort for a sieged tower that rule 1 did not reinforce and rule 2 could not answer
 * with a surplus: stream back at the strongest hostile source whose trickle our production matches
 * (`isParry`). Nothing lands on either side while the duel lasts, so the tower is no longer under fire
 * and the enemy's production is spent on the road. One parry per tower, its strongest matchable ribbon.
 */
function parry(ctx: Ctx, mine: Tower[]): void {
  const { state } = ctx;
  for (const tower of mine) {
    if (!free(ctx, tower) || !idle(ctx, tower) || !besieged(state, tower)) continue;
    if (siegeNetRate(state, tower) + (ctx.sentTo.get(tower.id) ?? 0) / (STREAM_HORIZON_MS / 1000) > 0) continue;
    // Rule 2a already answers a besieger that an own stream (after this tick's commands) is aimed at.
    const countered = state.links.some((l) => l.to === tower.id && l.owner !== OWNER && [...ctx.links.values()].some((set) => set.has(l.from)));
    if (countered) continue;
    // The whole garrison goes down the road and meets what is already coming 1:1, and the production
    // that follows meets the rest: what the garrison and that production cannot cover walks into an
    // empty tower (the deadlock the GDD warns of), so the duel must never go negative.
    if (!parryHolds(state, tower)) continue;
    let best: Tower | undefined;
    let bestRate = 0;
    for (const n of enemyNeighbours(state, tower.id)) {
      if (ctx.ended.has(`${tower.id}>${n.tower.id}`) || !isParry(state, tower, n.tower)) continue;
      const rate = streamRateInto(state, n.tower.id, tower.id);
      if (rate > bestRate) {
        best = n.tower;
        bestRate = rate;
      }
    }
    if (best) pushLink(ctx, tower, best.id, 0);
  }
}

/**
 * Plan a stream at each of `targets` from the free idle towers among `mine` next to it (plus rear
 * relays), and launch the plans that are covered, cheapest first. `hold` requires the capture to be
 * holdable (rule 4); the counter rule (rule 2) waives it.
 */
function launchPlans(ctx: Ctx, mine: Tower[], targets: Map<string, Tower>, hold: boolean): void {
  const { state } = ctx;
  const plans: Plan[] = [];
  for (const target of targets.values()) {
    const inbound = incomingWeight(state, target.id, OWNER);
    const sources: Source[] = streamingSources(ctx, target);
    const running = sources.length > 0;
    for (const tower of mine) {
      if (!free(ctx, tower) || !idle(ctx, tower) || ctx.ended.has(`${tower.id}>${target.id}`)) continue;
      const n = neighbours(state, tower.id).find((x) => x.tower.id === target.id);
      if (!n) continue;
      // A stream that is still enough on its own needs no company: keep the garrison at home.
      if (inbound > 0 && waveSuffices(state, inbound, n)) continue;
      const exposed = exposedRoute(state, n);
      if (running && exposed) continue;
      const force = spare(state, tower, target.id);
      // A column that dies on its own road (the hostile units walking it outnumber it) adds only losses.
      if (force <= costToTake(n)) continue;
      sources.push({ tower, n, force, linked: false, exposed });
    }
    if (!sources.some((s) => !s.linked)) continue;
    const full = buildPlan(ctx, target, sources, inbound, true, hold);
    let plan = full;
    if (full.sources.some((s) => s.exposed && !s.linked)) {
      const safeSources = sources.filter((s) => !s.exposed || s.linked);
      const safe = safeSources.some((s) => !s.linked) ? buildPlan(ctx, target, safeSources, inbound, true, hold) : undefined;
      if (safe && safe.force >= safe.needed && safe.deliveryMs <= full.deliveryMs * SAFE_PLAN_SLOWDOWN) plan = safe;
    }
    plans.push(plan);
  }

  for (let launched = 0; launched < MAX_PLANS_PER_TICK; launched++) {
    const ready = plans.filter(
      (p) =>
        p.force >= p.needed &&
        p.sources.every((s) => s.linked || free(ctx, s.tower)) &&
        p.relays.every((r) => free(ctx, r.tower)) &&
        (p.sources.some((s) => !s.linked && s.force > 0) || p.relays.some((r) => r.force > 0)),
    );
    const plan = pick(ctx, ready, (p) => p.needed);
    if (!plan) return;
    for (const s of plan.sources) {
      if (s.linked) continue;
      if (s.force > 0) pushLink(ctx, s.tower, plan.target.id, s.force);
      else ctx.used.add(s.tower.id);
    }
    for (const r of plan.relays) pushLink(ctx, r.tower, r.via.id, r.force);
  }
}

/* ---------- Rule 5: bridges ---------- */

/**
 * Cut a bridge under a column or stream that would take the tower (or before the garrison across it
 * comes), after every other rule has had its say: a bridge an own stream uses is never cut, streams
 * started this tick count as defenders, and for the "about to send" case the spare units of friendly
 * neighbours that could still answer the attack count as cover. See `bridges.ts` for the full rule.
 */
function cutBridges(ctx: Ctx): void {
  const { state } = ctx;
  const cover = (home: Tower, etaMs: number): number => {
    let total = 0;
    for (const h of friendlyNeighbours(state, home.id)) {
      if (h.travelMs > etaMs) continue;
      total += Math.max(0, spare(state, h.tower) - (ctx.sentFrom.get(h.tower.id) ?? 0));
    }
    return total;
  };
  for (const cmd of bridgeCutCommands(state, OWNER, { usedRoads: ctx.usedRoads, sentTo: ctx.sentTo, cover })) {
    ctx.cmds.push(cmd);
    ctx.trace?.(ctx.rule, cmd);
  }
}

/** Commands for the player owner this AI tick. Deterministic for a given state and rng. */
export function referencePlayerCommands(state: GameState, rng: Rng, trace?: RuleTrace): Command[] {
  const mine = ownedTowers(state, OWNER);
  if (mine.length === 0) return [];
  const ctx: Ctx = {
    state,
    rng,
    hops: hopsToOpponent(state, OWNER),
    used: new Set(),
    cmds: [],
    rule: '',
    trace,
    links: new Map(),
    ended: new Set(),
    usedRoads: new Set(),
    sentTo: new Map(),
    sentFrom: new Map(),
  };
  for (const l of state.links) {
    if (l.owner !== OWNER) continue;
    targetsOf(ctx, l.from).add(l.to);
    ctx.usedRoads.add(l.roadId);
  }
  const rules: [string, (ctx: Ctx, mine: Tower[]) => void][] = [
    ['maintain', maintain],
    ['reinforce', reinforce],
    ['counter', counter],
    ['parry', parry],
    ['capture', captureNeutrals],
    ['supply', supplyForward],
    ['attack', attack],
    ['cutBridge', cutBridges],
  ];
  for (const [name, rule] of rules) {
    ctx.rule = name;
    rule(ctx, mine);
  }
  return ctx.cmds;
}
