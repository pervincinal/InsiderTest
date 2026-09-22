/**
 * Shared AI helpers (rules v3 "free lanes", GDD §2.0b / §2.5). Everything here reads only what a human
 * sees on screen: tower owners / garrisons / levels / kinds, the lanes (every clear pair of towers),
 * the mines, the units walking the lanes, the ribbons (links) and the active boosters. Nothing mutates
 * state; every function is deterministic.
 *
 * Threat model (GDD §2.0b rule 10). A stream from `from` lands `linkRate(from)` weight per second on its
 * target after the lane's travel time — the source's garrison does not matter, only its kind, level and
 * how many links it may run. On one lane two hostile streams in opposite directions cancel 1:1 in weight
 * (only the surplus lands); an artillery post kills `1000 / ARTILLERY_COOLDOWN_MS` units per second of
 * anything hostile within its range, on any lane — one budget shared by every stream it reaches; mines
 * eat their charges once. From its first hostile landing a tower is under fire and regenerates nothing
 * (a stream landing less than `UNDER_FIRE_MS` apart keeps it so),
 * so a target with `units` falls `(units + 1) / net` seconds after the landings start (fortress: two
 * weight per defender). `siegeOf` walks exactly that: the streams already drawn plus the links a planner
 * is about to issue, the units already walking toward the tower, the tower's regeneration between hostile
 * landings and its capacity.
 */
import type { Command, EnemyDef, GameState, Link, Owner, Road, Tower, Unit, UnitKind } from '../sim/index';
import {
  C,
  Rng,
  capacityOf,
  distPointSegment,
  hasOverdrive,
  isFrozen,
  isLinked,
  linksFrom,
  maxLevelOf,
  maxLinksOf,
  modifiersFor,
  productionIntervalMs,
  roadIdFor,
  streamIntervalMs,
  streamRate,
} from '../sim/index';

/**
 * The part of the state the arithmetic needs: the player's permanent modifiers (public — the player
 * bought them), the clock (a tower's under-fire window is drawn in the attacker's colour) and the active
 * boosters (an overdrive ribbon is thicker, a freeze is a screen-wide effect).
 */
export type Visible = Pick<GameState, 'modifiers' | 'time' | 'boosters'>;

/** A link a planner is about to issue, or one already on the map (`Link` is structurally one). */
export interface PlannedLink {
  owner: Owner;
  from: string;
  to: string;
}

/** Beyond this the model does not look: a fall later than two minutes is "never" for every planner. */
export const FALLS_HORIZON_MS = 120_000;

/* ---------- Owners and towers ---------- */

export function isEnemyOwner(owner: Owner): boolean {
  return owner === 'enemy1' || owner === 'enemy2' || owner === 'enemy3';
}

/** Towers of `owner`, in level order (the sim keeps `state.towers` in definition order). */
export function ownedTowers(state: GameState, owner: Owner): Tower[] {
  const out: Tower[] = [];
  for (const id in state.towers) {
    const t = state.towers[id]!;
    if (t.owner === owner) out.push(t);
  }
  return out;
}

/** What a stream from this tower is made of right now: whole tanks while a tank factory holds ≥ 5. */
export function unitKindOf(tower: Pick<Tower, 'kind' | 'units'>): UnitKind {
  return tower.kind === 'tankFactory' && tower.units >= C.TANK_WEIGHT ? 'tank' : 'infantry';
}

/** Weight of one unit the tower streams right now. */
export function unitWeightOf(tower: Pick<Tower, 'kind' | 'units'>): number {
  return unitKindOf(tower) === 'tank' ? C.TANK_WEIGHT : C.INFANTRY_WEIGHT;
}

/** Fortress defenders count double (GDD §2.2). */
export function defenceMultiplier(tower: Pick<Tower, 'kind'>): number {
  return tower.kind === 'fortress' ? C.FORTRESS_DEFENCE : 1;
}

export { maxLevelOf };

export function atMaxLevel(tower: Pick<Tower, 'kind' | 'level'>): boolean {
  return tower.level >= maxLevelOf(tower);
}

/** A finished keep: top level and at capacity — it makes nothing while it waits, streaming costs it nothing. */
export function isCapped(state: Visible, tower: Tower): boolean {
  return atMaxLevel(tower) && tower.units >= capacityOf(tower, state);
}

/* ---------- Speeds and lanes ---------- */

/** Speed of a unit `owner` puts on a lane (player march bonus applied, tanks ×0.7). */
export function unitSpeedFor(state: Pick<GameState, 'modifiers'>, owner: Owner, kind: UnitKind): number {
  const base = kind === 'tank' ? C.UNIT_SPEED * C.TANK_SPEED_MUL : C.UNIT_SPEED;
  return base * modifiersFor(owner, state).unitSpeedMul;
}

/** Travel time along a lane for a unit of `owner`, ms. */
export function travelMsFor(state: Pick<GameState, 'modifiers'>, road: Road, owner: Owner, kind: UnitKind = 'infantry'): number {
  return (road.length / unitSpeedFor(state, owner, kind)) * 1000;
}

/** Charges still armed on the mines a lane crosses (the first that much weight on it dies). */
export function mineChargesOn(state: Pick<GameState, 'mines'>, road: Road): number {
  let total = 0;
  for (const hit of road.mineHits) total += Math.max(0, state.mines[hit.mine]?.charges ?? 0);
  return total;
}

/** A tower connected to a source tower by a lane. */
export interface Neighbour {
  tower: Tower;
  road: Road;
  /** Travel time for what the source streams (its unit kind, its owner's march bonus), ms. */
  travelMs: number;
  /** Charges still armed on the lane's mines. */
  mineCharges: number;
}

export function roadBetween(state: Pick<GameState, 'roads'>, a: string, b: string): Road | undefined {
  return state.roads[roadIdFor(a, b)];
}

/** Every tower `towerId` has a lane to, sorted by id (deterministic whatever the lane order). */
export function neighbours(state: GameState, towerId: string): Neighbour[] {
  const self = state.towers[towerId];
  if (!self) return [];
  const out: Neighbour[] = [];
  for (const id in state.roads) {
    const road = state.roads[id]!;
    const otherId = road.a === towerId ? road.b : road.b === towerId ? road.a : undefined;
    if (otherId === undefined) continue;
    const tower = state.towers[otherId];
    if (!tower) continue;
    out.push({ tower, road, travelMs: travelMsFor(state, road, self.owner, unitKindOf(self)), mineCharges: mineChargesOn(state, road) });
  }
  out.sort((p, q) => (p.tower.id < q.tower.id ? -1 : p.tower.id > q.tower.id ? 1 : 0));
  return out;
}

/** Neighbours not owned by the source's owner (neutral or rival). */
export function hostileNeighbours(state: GameState, towerId: string): Neighbour[] {
  const owner = state.towers[towerId]?.owner;
  return neighbours(state, towerId).filter((n) => n.tower.owner !== owner);
}

/** Neighbours owned by a rival (neither the source's owner nor neutral). */
export function enemyNeighbours(state: GameState, towerId: string): Neighbour[] {
  const owner = state.towers[towerId]?.owner;
  return neighbours(state, towerId).filter((n) => n.tower.owner !== owner && n.tower.owner !== 'neutral');
}

export function friendlyNeighbours(state: GameState, towerId: string): Neighbour[] {
  const owner = state.towers[towerId]?.owner;
  return neighbours(state, towerId).filter((n) => n.tower.owner === owner);
}

/* ---------- Links ---------- */

export function linksTo(state: Pick<GameState, 'links'>, towerId: string): Link[] {
  return state.links.filter((l) => l.to === towerId);
}

export function hasLink(state: Pick<GameState, 'links'>, from: string, to: string): boolean {
  return state.links.some((l) => l.from === from && l.to === to);
}

/** Link slots the tower's level still allows. */
export function freeLinkSlots(state: Pick<GameState, 'links'>, tower: Tower): number {
  return Math.max(0, maxLinksOf(tower) - linksFrom(state, tower.id).length);
}

export function linkCommand(tower: Tower, to: string): Command {
  return { type: 'link', owner: tower.owner, from: tower.id, to };
}

export function unlinkCommand(tower: Tower, to?: string): Command {
  return to === undefined ? { type: 'unlink', owner: tower.owner, from: tower.id } : { type: 'unlink', owner: tower.owner, from: tower.id, to };
}

/* ---------- Rates ---------- */

/**
 * Units (count) per second one link of `from` emits right now: its production interval for its kind
 * and level (GDD §2.0b rule 4), ×OVERDRIVE_MUL under its owner's overdrive, 0 while the owner is frozen
 * or the garrison holds less than one unit (rule 6).
 */
export function emitRate(state: Visible, from: Tower, owner: Owner = from.owner): number {
  if (from.units < 1 || owner === 'neutral') return 0;
  if (isFrozen(state, owner)) return 0;
  return streamRate(from, state) * (hasOverdrive(state, owner) ? C.OVERDRIVE_MUL : 1);
}

/** Weight per second one link of `from` puts on its lane (tanks count 5). */
export function linkRate(state: Visible, from: Tower, owner: Owner = from.owner): number {
  return emitRate(state, from, owner) * unitWeightOf(from);
}

/** Weight per second the tower recruits while it grows (neutral, frozen: 0; a tank factory makes whole tanks). */
export function genPerSecond(tower: Tower, state: Visible): number {
  if (tower.owner === 'neutral' || isFrozen(state, tower.owner)) return 0;
  const weight = tower.kind === 'tankFactory' ? C.TANK_WEIGHT : C.INFANTRY_WEIGHT;
  return (weight * 1000 * (hasOverdrive(state, tower.owner) ? C.OVERDRIVE_MUL : 1)) / productionIntervalMs(tower, state);
}

/** Weight the tower recruits within `ms` if it grows the whole time (not linked, not under fire), fractional. */
export function producedIn(tower: Tower, ms: number, state: Visible): number {
  return (genPerSecond(tower, state) * ms) / 1000;
}

/** Whole units the tower holds after `ms` of undisturbed growth, capped at its capacity. */
export function projectedUnits(tower: Tower, afterMs: number, state: Visible): number {
  return Math.min(capacityOf(tower, state), tower.units + Math.floor(producedIn(tower, afterMs, state)));
}

/** Hostile artillery posts (owned by another owner than `owner`) whose range covers the lane. */
export function artilleryCovering(state: Pick<GameState, 'towers'>, road: Road, owner: Owner): Tower[] {
  const a = road.points[0]!;
  const b = road.points[road.points.length - 1]!;
  const out: Tower[] = [];
  for (const id in state.towers) {
    const t = state.towers[id]!;
    if (t.kind !== 'artillery' || t.owner === 'neutral' || t.owner === owner) continue;
    if (distPointSegment(t, a, b) <= C.ARTILLERY_RANGE) out.push(t);
  }
  return out;
}

/** Kills per second one artillery post fires: once per `ARTILLERY_COOLDOWN_MS` (1.25/s) at any hostile unit within `ARTILLERY_RANGE`. */
export const ARTILLERY_FIRE_RATE = 1000 / C.ARTILLERY_COOLDOWN_MS;

/**
 * Gross fire covering a lane: every owned artillery post of another owner within `ARTILLERY_RANGE` of
 * the segment, 1.25 kills/s each. A post shoots at whatever hostile unit is in range, on **any** lane,
 * so this is not what one stream loses — `artilleryLossOn` shares each post's fire among the streams
 * it reaches.
 */
export function artilleryKillRate(state: Pick<GameState, 'towers'>, road: Road, owner: Owner): number {
  return artilleryCovering(state, road, owner).length * ARTILLERY_FIRE_RATE;
}

/**
 * Weight per second of `link`'s stream that walks past the lane's clashes: its emit weight minus the
 * weight of a hostile stream running the other way on the same lane (`all`: links on the map plus the
 * planned ones). Units clash 1:1 in weight before anything else happens to them, so only the surplus of
 * the faster stream walks on toward the target — and toward the artillery covering the far end.
 */
export function surplusWeight(state: GameState, link: PlannedLink, all: readonly PlannedLink[]): number {
  const from = state.towers[link.from];
  if (!from) return 0;
  const raw = emitRate(state, from, link.owner) * unitWeightOf(from);
  if (raw <= 0) return 0;
  const reverse = all.find((l) => l.from === link.to && l.to === link.from && l.owner !== link.owner);
  const rf = reverse ? state.towers[reverse.from] : undefined;
  const back = reverse && rf ? emitRate(state, rf, reverse.owner) * unitWeightOf(rf) : 0;
  return Math.max(0, raw - back);
}

/**
 * Units per second `link`'s stream (`count` units/s reaching the guns, i.e. its surplus after the lane's
 * clashes) loses to artillery. Each hostile post covering its lane kills at most 1.25/s in total, split
 * among every stream in `all` (links on the map plus the planned ones; `link` itself counts once) whose
 * surplus reaches the post's range, in proportion to their rates, and never more than the stream
 * brings. One L1 stream (1/s) into a post: all of it dies; two L1 streams: 0.625/s each, so 0.75/s
 * lands; an L3 (2/s) alone nets 0.75/s. The sim (rules v3 rule 7) fires at the nearest hostile unit
 * regardless of lane, so a post's fire is one budget, not one per lane.
 */
export function artilleryLossOn(state: GameState, link: PlannedLink, count: number, all: readonly PlannedLink[]): number {
  if (count <= 0) return 0;
  const road = roadBetween(state, link.from, link.to);
  if (!road) return 0;
  const posts = artilleryCovering(state, road, link.owner);
  if (posts.length === 0) return 0;
  const isSelf = (l: PlannedLink): boolean => l.from === link.from && l.to === link.to && l.owner === link.owner;
  let loss = 0;
  for (const post of posts) {
    let total = count;
    for (const l of all) {
      if (l.owner === post.owner || isSelf(l)) continue;
      const from = state.towers[l.from];
      const lane = roadBetween(state, l.from, l.to);
      if (!from || !lane) continue;
      if (distPointSegment(post, lane.points[0]!, lane.points[lane.points.length - 1]!) > C.ARTILLERY_RANGE) continue;
      total += surplusWeight(state, l, all) / unitWeightOf(from);
    }
    loss += total > 0 ? Math.min(count, (ARTILLERY_FIRE_RATE * count) / total) : 0;
  }
  return Math.min(count, loss);
}

/** What one stream lands on its target once it is flowing. */
export interface Flow {
  link: PlannedLink;
  /** ms until the first unit lands: the emit phase (a fresh link waits one interval), the travel time, what the lane's mines eat. */
  startMs: number;
  /** Weight of the first landing (one unit, scaled down when the lane eats part of the stream). */
  firstWeight: number;
  /** Weight per second that lands (after artillery and the opposite stream on the same lane). */
  rate: number;
  /** Units per second that land (`rate ÷ unit weight`) — the under-fire cadence. */
  countRate: number;
  /** True when the stream is hostile to its target's current owner. */
  hostile: boolean;
  /** Weight per second the source emits (before clashes and guns). */
  emitted: number;
}

/**
 * The stream of `link` as it lands: emitted weight minus a hostile stream running the other way on the
 * same lane (units clash 1:1, the surplus walks on), minus what the artillery covering the lane kills
 * of that surplus. `all` is every link on the map plus the planned ones (for the opposite stream and
 * the posts' shared fire). Undefined when the lane does not exist or the source emits nothing.
 */
export function laneFlow(state: GameState, link: PlannedLink, all: readonly PlannedLink[]): Flow | undefined {
  const from = state.towers[link.from];
  const to = state.towers[link.to];
  if (!from || !to) return undefined;
  const road = roadBetween(state, from.id, to.id);
  if (!road) return undefined;
  const count = emitRate(state, from, link.owner);
  if (count <= 0) return undefined;
  const w = unitWeightOf(from);
  const raw = count * w;
  // Clashes first: a hostile stream the other way cancels ours 1:1 in weight; only the surplus walks on,
  // and only the surplus is what the artillery covering the lane gets to shoot.
  const surplus = surplusWeight(state, link, all) / w;
  const rate = Math.max(0, surplus - artilleryLossOn(state, link, surplus, all)) * w;
  const mines = mineChargesOn(state, road);
  // Emit phase: an existing link has accumulated `emitAccMs` toward its next unit, a fresh one starts at 0.
  const interval = streamIntervalMs(from, state);
  const existing = state.links.find((l) => l.from === link.from && l.to === link.to && l.owner === link.owner);
  const phase = Math.max(0, interval - (existing?.emitAccMs ?? 0)) / (hasOverdrive(state, link.owner) ? C.OVERDRIVE_MUL : 1);
  const startMs = phase + travelMsFor(state, road, link.owner, unitKindOf(from)) + (mines > 0 ? (mines / raw) * 1000 : 0);
  return { link, startMs, rate, countRate: rate / w, firstWeight: (w * rate) / raw, hostile: link.owner !== to.owner, emitted: raw };
}

/** ms until a walking unit lands. */
export function remainingMs(state: Pick<GameState, 'roads'>, u: Unit): number {
  const road = state.roads[u.roadId];
  if (!road) return 0;
  return Math.max(0, ((1 - u.progress) * road.length * 1000) / u.speed);
}

/**
 * Units walking toward `target` as landings `{ t, weight, hostile }`, net of the lane clashes ahead of
 * them: on each lane the opposite hostile walkers cancel them in weight (nearest first), and a hostile
 * stream running the other way (`all`: links plus planned ones) kills what is left — its next units meet
 * every one of them before they land.
 */
export function walkingLandings(state: GameState, target: Tower, all: readonly PlannedLink[]): { t: number; weight: number; hostile: boolean }[] {
  const byLane = new Map<string, Unit[]>();
  for (const u of state.units) {
    if (u.to !== target.id) continue;
    const list = byLane.get(u.roadId);
    if (list) list.push(u);
    else byLane.set(u.roadId, [u]);
  }
  const out: { t: number; weight: number; hostile: boolean }[] = [];
  for (const [roadId, inbound] of byLane) {
    inbound.sort((p, q) => q.progress - p.progress); // nearest to the target first
    for (const u of inbound) {
      const swept = all.some((l) => l.from === target.id && l.to === u.from && l.owner !== u.owner);
      if (swept) continue;
      // Opposite walkers of another owner on the same lane that this unit still has to pass.
      let opposing = 0;
      for (const o of state.units) {
        if (o.roadId !== roadId || o.to !== u.from || o.owner === u.owner) continue;
        if (1 - o.progress > u.progress) opposing += o.weight; // still ahead of u
      }
      const weight = Math.max(0, u.weight - opposing);
      if (weight <= 0) continue;
      out.push({ t: remainingMs(state, u), weight, hostile: u.owner !== target.owner });
    }
  }
  return out;
}

/** Result of `siegeOf`: when the tower falls to what is coming, and the rates behind it. */
export interface Siege {
  /** ms until the tower changes hands (Infinity when it holds within `FALLS_HORIZON_MS`). */
  fallsAtMs: number;
  /** Hostile weight per second landing once every stream flows. */
  hostileRate: number;
  /** Friendly weight per second landing once every stream flows. */
  friendlyRate: number;
  /** Net loss of "hit points" per second in the steady state (> 0: the tower bleeds). */
  netRate: number;
  /** Lowest hit points on the way (weight the attackers still need; ≤ 0 = it falls). */
  minHp: number;
  /** ms until the first hostile landing (Infinity when nothing hostile comes). */
  firstHitMs: number;
  /** Weight per second each owner's streams land once they flow (hostile and friendly alike). */
  byOwner: Map<Owner, number>;
}

export interface SiegeOptions {
  /** Links a planner is about to issue (counted for their flow and for what they cancel). */
  planned?: readonly PlannedLink[];
  /** Existing links to leave out (e.g. one the planner is about to end). */
  exclude?: readonly Link[];
}

/**
 * The threat model: walks the landings on `target` — units already on its lanes at their remaining
 * walk, every stream (existing links minus `exclude`, plus `planned`) from its travel time on at its net
 * lane rate, the tower's own regeneration when it is not linked and not under fire (0 while hostile
 * landings arrive ≤ `UNDER_FIRE_MS` apart, the idle share of the gap otherwise), capped at capacity.
 * Hit points start at `units × defence + defence` (the landing that flips a tower is the one beyond
 * its last defender; a fortress needs two weight per defender), fall by hostile weight and rise by
 * friendly weight and regeneration. Returns when they reach 0.
 */
/** Every link the model sees: the map's links minus `exclude`, plus `planned`. */
export function allLinks(state: Pick<GameState, 'links'>, options: SiegeOptions = {}): PlannedLink[] {
  const exclude = options.exclude;
  const all: PlannedLink[] = [];
  for (const l of state.links) if (!exclude || !exclude.includes(l)) all.push(l);
  for (const p of options.planned ?? []) all.push(p);
  return all;
}

export function siegeOf(state: GameState, target: Tower, options: SiegeOptions = {}): Siege {
  const planned = options.planned ?? [];
  const all = allLinks(state, options);

  const D = defenceMultiplier(target);
  type Ev = { t: number; flow?: Flow; weight?: number; hostile?: boolean };
  const events: Ev[] = [];
  let hostileRate = 0;
  let friendlyRate = 0;
  const byOwner = new Map<Owner, number>();
  for (const l of all) {
    if (l.to !== target.id) continue;
    const f = laneFlow(state, l, all);
    if (!f || f.rate <= 0) continue;
    events.push({ t: f.startMs, flow: f });
    if (f.hostile) hostileRate += f.rate;
    else friendlyRate += f.rate;
    byOwner.set(l.owner, (byOwner.get(l.owner) ?? 0) + f.rate);
  }
  for (const landing of walkingLandings(state, target, all)) events.push(landing);
  events.sort((p, q) => p.t - q.t);

  const gen = genPerSecond(target, state);
  const linked = isLinked(state, target.id) || planned.some((p) => p.from === target.id);
  const capHp = capacityOf(target, state) * D + D;
  let hp = target.units * D + D;
  let minHp = hp;
  let t = 0;
  let hostile = 0; // weight/s landing
  let hostileCount = 0; // units/s landing (under-fire cadence)
  let friendly = 0;
  let underFireUntil = target.underFireUntilMs - state.time; // relative ms, ≤ 0 = not under fire now
  let firstHitMs = Infinity;

  const regenAt = (time: number): number => {
    if (gen <= 0 || linked || time < underFireUntil) return 0;
    if (hostileCount > 0) {
      const gap = 1000 / hostileCount;
      return gap <= C.UNDER_FIRE_MS ? 0 : (gen * (gap - C.UNDER_FIRE_MS)) / gap;
    }
    return gen;
  };
  /** Integrate up to `to`; returns the fall time if hp reaches 0 on the way. */
  const advance = (to: number): number | undefined => {
    while (t < to) {
      const segEnd = t < underFireUntil && underFireUntil < to ? underFireUntil : to;
      const loss = hostile - D * friendly - D * regenAt(t); // hp per second
      if (loss > 0) {
        const dt = (hp / loss) * 1000;
        if (t + dt <= segEnd) return t + dt;
      }
      if (!Number.isFinite(segEnd)) return undefined;
      hp = Math.min(capHp, hp - (loss * (segEnd - t)) / 1000);
      minHp = Math.min(minHp, hp);
      t = segEnd;
    }
    return undefined;
  };

  let fallsAtMs = Infinity;
  for (const ev of events) {
    const fell = advance(ev.t);
    if (fell !== undefined) {
      fallsAtMs = fell;
      break;
    }
    if (ev.flow) {
      // The first unit lands now; the stream then flows at its rate.
      if (ev.flow.hostile) {
        hp -= ev.flow.firstWeight;
        hostile += ev.flow.rate;
        hostileCount += ev.flow.countRate;
        firstHitMs = Math.min(firstHitMs, ev.t);
        underFireUntil = Math.max(underFireUntil, ev.t + C.UNDER_FIRE_MS);
      } else {
        hp = Math.min(capHp, hp + D * ev.flow.firstWeight);
        friendly += ev.flow.rate;
      }
    } else if (ev.hostile) {
      hp -= ev.weight!;
      firstHitMs = Math.min(firstHitMs, ev.t);
      underFireUntil = Math.max(underFireUntil, ev.t + C.UNDER_FIRE_MS);
    } else {
      hp = Math.min(capHp, hp + D * ev.weight!);
    }
    minHp = Math.min(minHp, hp);
    if (hp <= 0) {
      fallsAtMs = ev.t;
      break;
    }
  }
  if (fallsAtMs === Infinity) {
    const fell = advance(Infinity);
    if (fell !== undefined) fallsAtMs = fell;
  }
  if (fallsAtMs > FALLS_HORIZON_MS) fallsAtMs = Infinity;
  const netRate = hostile - D * friendly - D * regenAt(Math.max(t, underFireUntil));
  return { fallsAtMs, hostileRate, friendlyRate, netRate, minHp, firstHitMs, byOwner };
}

/**
 * Who lands the unit that flips a **neutral** tower, replaying every stream's landings one by one (first
 * unit at `startMs`, then one per `1000 / countRate` ms) together with the walking units, in time order,
 * until the landed weight exceeds the garrison. Undefined when nothing flips it within the horizon.
 * (A neutral neither regenerates nor streams, so the race is pure arithmetic; ties go to the earlier
 * landing, and the sim resolves equal times in unit order — the earlier link.)
 */
export function flipOwner(state: GameState, target: Tower, options: SiegeOptions = {}): Owner | undefined {
  const all = allLinks(state, options);
  type Stream = { owner: Owner; next: number; gap: number; weight: number; order: number };
  const streams: Stream[] = [];
  let order = 0;
  for (const l of all) {
    if (l.to !== target.id) continue;
    const f = laneFlow(state, l, all);
    if (!f || f.rate <= 0 || f.countRate <= 0) continue;
    streams.push({ owner: l.owner, next: f.startMs, gap: 1000 / f.countRate, weight: f.rate / f.countRate, order: order++ });
  }
  const walking = walkingLandings(state, target, all)
    .map((w, i) => ({ owner: state.units.find((u) => u.to === target.id && remainingMs(state, u) === w.t)?.owner ?? target.owner, t: w.t, weight: w.weight, order: -1 - i }))
    .sort((p, q) => p.t - q.t);
  let need = target.units * defenceMultiplier(target) + 1e-9;
  let wi = 0;
  for (let guard = 0; guard < 10_000; guard++) {
    let best: Stream | undefined;
    for (const st of streams) if (!best || st.next < best.next || (st.next === best.next && st.order < best.order)) best = st;
    const walker = walking[wi];
    if (!best && !walker) return undefined;
    if (walker && (!best || walker.t <= best.next)) {
      if (walker.t > FALLS_HORIZON_MS) return undefined;
      need -= walker.weight;
      wi++;
      if (need < 0) return walker.owner;
      continue;
    }
    if (!best || best.next > FALLS_HORIZON_MS) return undefined;
    need -= best.weight;
    if (need < 0) return best.owner;
    best.next += best.gap;
  }
  return undefined;
}

/** Shorthand: when the tower falls to what is visibly coming (Infinity = it holds). */
export function fallsAtMs(state: GameState, target: Tower, options?: SiegeOptions): number {
  return siegeOf(state, target, options).fallsAtMs;
}

/** True when a hostile stream or column is heading for the tower. */
export function underSiege(state: GameState, tower: Tower): boolean {
  if (state.links.some((l) => l.to === tower.id && l.owner !== tower.owner)) return true;
  return state.units.some((u) => u.to === tower.id && u.owner !== tower.owner);
}

/* ---------- Plans ---------- */

export interface Plan {
  links: PlannedLink[];
  siege: Siege;
}

/** Sources ordered for a plan: the fastest stream first, the shorter lane on a tie, then id. */
export function bySpeed(state: GameState, target: Tower, owner: Owner): (p: Tower, q: Tower) => number {
  return (p, q) => {
    const rp = linkRate(state, p, owner);
    const rq = linkRate(state, q, owner);
    if (rp !== rq) return rq - rp;
    const dp = roadBetween(state, p.id, target.id)?.length ?? Infinity;
    const dq = roadBetween(state, q.id, target.id)?.length ?? Infinity;
    if (dp !== dq) return dp - dq;
    return p.id < q.id ? -1 : p.id > q.id ? 1 : 0;
  };
}

/**
 * The smallest prefix of `sources` (in the given order) whose streams onto `target` make it fall within
 * `planMs`, counting `extra` links the planner already decided on. A source whose stream would not land
 * (no lane, nothing to emit, cancelled or shot down on the way) is skipped. Undefined when even all of
 * them cannot break it in time — then no link is worth issuing (GDD §2.5: never waste a link).
 */
/**
 * A stream that lands less than this share of what it emits is a waste of the source's growth (GDD
 * §2.5 "never waste a link"): an L2 stream into an artillery post under lean lands 0.04 of its 1.29/s.
 * `maintain` ends such a stream unless it shields. (Planners keep the `rate > 0` test: a source that
 * lands little alone may land enough once the plan's other streams share the guns' fire.)
 */
export const MIN_LANDING_SHARE = 0.25;

/** True when the flow lands at least `MIN_LANDING_SHARE` of what its source emits. */
export function landsEnough(flow: Flow): boolean {
  return flow.rate > 0 && flow.rate >= MIN_LANDING_SHARE * flow.emitted;
}

export function siegePlan(
  state: GameState,
  owner: Owner,
  target: Tower,
  sources: readonly Tower[],
  planMs: number,
  options: SiegeOptions = {},
  /** Anticipated reaction to each added link (e.g. the target streaming back): hypothetical links added to the model. */
  onAdd?: (link: PlannedLink, planned: readonly PlannedLink[]) => PlannedLink[],
): Plan | undefined {
  const extra = options.planned ?? [];
  const links: PlannedLink[] = [];
  const reactions: PlannedLink[] = [];
  for (const s of sources) {
    const link: PlannedLink = { owner, from: s.id, to: target.id };
    const flow = laneFlow(state, link, [...allLinks(state, options), ...reactions, ...links, link]);
    if (!flow || flow.rate <= 0) continue;
    links.push(link);
    if (onAdd) reactions.push(...onAdd(link, [...extra, ...reactions, ...links]));
    const siege = siegeOf(state, target, { planned: [...extra, ...reactions, ...links], exclude: options.exclude });
    if (siege.fallsAtMs <= planMs) return { links, siege };
  }
  return undefined;
}

/**
 * The smallest prefix of `helpers` whose supply streams into `target` (own tower under siege) make it
 * hold (`fallsAtMs` = Infinity). Undefined when even all of them cannot save it — a trickle into a
 * tower that falls anyway only feeds the enemy (GDD §2.5).
 */
export function reinforcePlan(
  state: GameState,
  owner: Owner,
  target: Tower,
  helpers: readonly Tower[],
  options: SiegeOptions = {},
): Plan | undefined {
  const extra = options.planned ?? [];
  const links: PlannedLink[] = [];
  for (const h of helpers) {
    const link: PlannedLink = { owner, from: h.id, to: target.id };
    const flow = laneFlow(state, link, [...allLinks(state, options), ...links, link]);
    if (!flow || flow.rate <= 0) continue;
    links.push(link);
    const siege = siegeOf(state, target, { planned: [...extra, ...links], exclude: options.exclude });
    if (siege.fallsAtMs === Infinity) return { links, siege };
  }
  return undefined;
}

/* ---------- Map reading ---------- */

/**
 * Lane hops from every tower to the nearest tower of a rival of `owner` (0 for rival towers, Infinity
 * when unreachable). "Front" towers have 1, a rear keep more.
 */
export function hopsToOpponent(state: GameState, owner: Owner): Map<string, number> {
  const hops = new Map<string, number>();
  const queue: string[] = [];
  for (const id in state.towers) {
    const t = state.towers[id]!;
    if (t.owner !== owner && t.owner !== 'neutral') {
      hops.set(id, 0);
      queue.push(id);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    const d = hops.get(id)!;
    for (const n of neighbours(state, id)) {
      if (hops.has(n.tower.id)) continue;
      hops.set(n.tower.id, d + 1);
      queue.push(n.tower.id);
    }
  }
  for (const id in state.towers) if (!hops.has(id)) hops.set(id, Infinity);
  return hops;
}

/* ---------- Ticks and aggression ---------- */

/** Aggression gate: an enemy skips a tower's decision this tick with probability `(1 − a) × 0.5`. */
export function skipsAction(enemy: EnemyDef, rng: Rng): boolean {
  return rng.next() < (1 - clamp01(enemy.aggression)) * 0.5;
}

export function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
}

/** True on the ticks the AI runs (every `AI_TICK_MS` of sim time, including time 0). */
export function isAiTick(state: Pick<GameState, 'time'>): boolean {
  return state.time % C.AI_TICK_MS === 0;
}
