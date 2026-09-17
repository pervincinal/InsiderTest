/**
 * Shared AI helpers. Everything here reads only what a human player could see on screen:
 * tower owners/garrisons/levels, roads (cut, barrier, mine), units walking the roads and the attack
 * streams (links) drawn on them (GDD §2.0: every link is visible in its owner's colour).
 * Nothing mutates state.
 */
import type { Command, EnemyDef, GameState, Link, Owner, Road, Tower, Unit, UnitKind } from '../sim/index';
import { C, Rng, capacityOf, isUnderFire, linksFrom, maxLinksOf, modifiersFor, roadIdFor } from '../sim/index';

/**
 * A snapshot the AI reasons about: the towers/roads/units it can see plus the player's permanent
 * modifiers and the clock. `state.modifiers` is public information (the player bought them), so both
 * sides may read it: the enemy planners estimate a boosted player, the reference player its own boosted
 * towers. `time` is needed to read a tower's under-fire window (rules v2.1, GDD §2.0: the garrison
 * number is drawn in the attacker's colour while `time < underFireUntilMs`).
 */
export type Visible = Pick<GameState, 'modifiers' | 'time'>;

/**
 * Rules v2.1: how long a trickle an attacker is willing to wait for. A tower under fire recruits
 * nothing, so a stream's source production keeps landing on a garrison that no longer regrows; every
 * attack rule counts `production × SIEGE_PLAN_MS` on top of the burst (GDD §2.0 v2.1, `SIEGE_PLAN_S`).
 */
export const SIEGE_PLAN_MS = 10_000;

/** A tower reachable from a source tower over one uncut road. */
export interface Neighbour {
  tower: Tower;
  road: Road;
  /** Weight lost on the way before anything arrives: barrier hp + mine charges still on the road. */
  roadCost: number;
  /** Weight of hostile units currently walking this road toward the source tower (they clash 1:1 with anything sent). */
  oncoming: number;
  /** Infantry travel time along the road for a column the *source's* owner sends, ms (its march bonus applied). */
  travelMs: number;
  /** Infantry travel time for a column the *neighbour's* owner sends back to the source, ms. */
  theirTravelMs: number;
}

/** Speed of a freshly spawned unit of `kind` owned by `owner`, px/s — exactly what the sim gives it. */
export function unitSpeedFor(state: Visible, owner: Owner, kind: UnitKind): number {
  const base = kind === 'tank' ? C.UNIT_SPEED * C.TANK_SPEED_MUL : C.UNIT_SPEED;
  return base * modifiersFor(owner, state).unitSpeedMul;
}

/** Time for a unit of `kind` owned by `owner` to walk the whole road, ms. */
export function travelMsFor(state: Visible, road: Road, owner: Owner, kind: UnitKind = 'infantry'): number {
  return (road.length * 1000) / unitSpeedFor(state, owner, kind);
}

export function isEnemyOwner(owner: Owner): boolean {
  return owner === 'enemy1' || owner === 'enemy2' || owner === 'enemy3';
}

/** Towers owned by `owner`, in level order (deterministic). */
export function ownedTowers(state: GameState, owner: Owner): Tower[] {
  const out: Tower[] = [];
  for (const id in state.towers) {
    const t = state.towers[id]!;
    if (t.owner === owner) out.push(t);
  }
  return out;
}

/** Adjacent towers over roads that are not cut. Barriers/mines are reported as extra cost, not as blockers. */
export function neighbours(state: GameState, towerId: string): Neighbour[] {
  const source = state.towers[towerId];
  if (!source) return [];
  const out: Neighbour[] = [];
  for (const id in state.roads) {
    const road = state.roads[id]!;
    if (road.cut) continue;
    const otherId = road.a === towerId ? road.b : road.b === towerId ? road.a : undefined;
    if (otherId === undefined) continue;
    const tower = state.towers[otherId];
    if (!tower) continue;
    let oncoming = 0;
    for (const u of state.units) {
      if (u.roadId === road.id && u.to === towerId && u.owner !== source.owner) oncoming += u.weight;
    }
    out.push({
      tower,
      road,
      roadCost: road.barrier + road.mine,
      oncoming,
      travelMs: travelMsFor(state, road, source.owner),
      theirTravelMs: travelMsFor(state, road, tower.owner),
    });
  }
  return out;
}

/** Neighbours not owned by the source tower's owner (neutral included). */
export function hostileNeighbours(state: GameState, towerId: string): Neighbour[] {
  const source = state.towers[towerId];
  if (!source) return [];
  return neighbours(state, towerId).filter((n) => n.tower.owner !== source.owner);
}

/** Neighbours owned by a player/enemy other than the source tower's owner (neutral excluded). */
export function enemyNeighbours(state: GameState, towerId: string): Neighbour[] {
  return hostileNeighbours(state, towerId).filter((n) => n.tower.owner !== 'neutral');
}

/** Neighbours with the same owner as the source tower. */
export function friendlyNeighbours(state: GameState, towerId: string): Neighbour[] {
  const source = state.towers[towerId];
  if (!source) return [];
  return neighbours(state, towerId).filter((n) => n.tower.owner === source.owner);
}

/* ---------- Streams (links) as a human reads them ---------- */

/** Links whose target is `towerId`, in creation order. */
export function linksTo(state: GameState, towerId: string): Link[] {
  return state.links.filter((l) => l.to === towerId);
}

/** Free outgoing link slots of a tower right now (per-level limit minus its active links). */
export function freeLinkSlots(state: GameState, tower: Tower): number {
  return Math.max(0, maxLinksOf(tower) - linksFrom(state, tower.id).length);
}

/** Does a link `from → to` exist? */
export function hasLink(state: GameState, from: string, to: string): boolean {
  return state.links.some((l) => l.from === from && l.to === to);
}

/**
 * Weight still to leave through `link`: the source's garrison is drained round-robin over its links, so
 * each stream gets an equal share (whole weight units). What has already left is on the road.
 */
export function linkPending(state: GameState, link: Link): number {
  const from = state.towers[link.from];
  if (!from) return 0;
  const n = linksFrom(state, from.id).length;
  if (n === 0) return 0;
  return Math.floor(from.units / n);
}

/** Weight the source of `towerId`'s links still holds for them, all links together (0 when unlinked). */
export function pendingOf(state: GameState, towerId: string): number {
  let sum = 0;
  for (const l of linksFrom(state, towerId)) sum += linkPending(state, l);
  return sum;
}

/** Kind of unit a tower puts on the road (a tank while a factory holds one). */
function streamKind(tower: Tower): UnitKind {
  return tower.kind === 'tankFactory' && tower.units >= C.TANK_WEIGHT ? 'tank' : 'infantry';
}

/** Depth limit for chained streams (a → b → c …) when reading a stream's rate. */
const CHAIN_DEPTH = 4;

/**
 * Units per second `link` delivers once its source is drained: the source's production plus what the
 * source's own supply streams pour into it (chained streams relay through a linked tower), shared over
 * the source's links round-robin. Chain-aware up to `CHAIN_DEPTH` hops; a linked tower never grows, so
 * everything that reaches it leaves again.
 */
export function linkRate(state: GameState, link: Link, depth = 0): number {
  const from = state.towers[link.from];
  if (!from || depth > CHAIN_DEPTH) return 0;
  const n = linksFrom(state, from.id).length;
  if (n === 0) return 0;
  let rate = genPerSecond(from, state);
  for (const l of linksTo(state, from.id)) if (l.owner === from.owner) rate += linkRate(state, l, depth + 1);
  return rate / n;
}

/**
 * Units per second streams pour into `towerId` after their sources are drained: hostile streams (link
 * owner ≠ tower owner) with `hostile: true`, the tower owner's own supply streams otherwise.
 */
export function inflowRate(state: GameState, towerId: string, hostile: boolean): number {
  const tower = state.towers[towerId];
  if (!tower) return 0;
  let rate = 0;
  for (const l of linksTo(state, towerId)) if ((l.owner !== tower.owner) === hostile) rate += linkRate(state, l);
  return rate;
}

/** A unit about to land on a tower. */
export interface Landing {
  etaMs: number;
  weight: number;
  hostile: boolean;
}

/** How far ahead the landing model reads a stream's trickle. */
export const STREAM_HORIZON_MS = 10_000;

/**
 * Everything that will land on `tower` within `horizonMs`, as a human reads it: units on the roads (at
 * their remaining walk), what every stream into the tower still drains out of its source (one unit per
 * `LEAVE_INTERVAL_MS` from its travel time on) and the trickle each stream keeps delivering after that
 * (`linkRate`). `exclude` leaves one stream out (to judge a tower without that help). Unsorted.
 */
export function landings(state: GameState, tower: Tower, horizonMs = STREAM_HORIZON_MS, exclude?: Link, excludeFrom?: string): Landing[] {
  const out: Landing[] = [];
  for (const u of state.units) {
    if (u.to !== tower.id || u.from === excludeFrom) continue;
    const eta = remainingMs(state, u);
    if (eta <= horizonMs) out.push({ etaMs: eta, weight: u.weight, hostile: u.owner !== tower.owner });
  }
  for (const l of state.links) {
    if (l.to !== tower.id || l === exclude || l.from === excludeFrom) continue;
    const from = state.towers[l.from];
    const road = state.roads[l.roadId];
    if (!from || !road) continue;
    const hostile = l.owner !== tower.owner;
    const kind = streamKind(from);
    const unit = kind === 'tank' ? C.TANK_WEIGHT : C.INFANTRY_WEIGHT;
    const travel = travelMsFor(state, road, l.owner, kind);
    const n = Math.max(1, linksFrom(state, from.id).length);
    const pending = linkPending(state, l);
    let t = travel;
    for (let left = pending; left > 0 && t <= horizonMs; left -= unit) {
      out.push({ etaMs: t, weight: Math.min(unit, left), hostile });
      t += C.LEAVE_INTERVAL_MS * n;
    }
    const rate = linkRate(state, l);
    if (rate <= 0) continue;
    const gap = (1000 * unit) / rate;
    for (t = Math.max(t, travel) + gap; t <= horizonMs; t += gap) out.push({ etaMs: t, weight: unit, hostile });
  }
  for (const q of state.queues) {
    if (q.to !== tower.id) continue;
    const road = state.roads[q.roadId];
    if (!road) continue;
    const unit = q.unitKind === 'tank' ? C.TANK_WEIGHT : C.INFANTRY_WEIGHT;
    const travel = travelMsFor(state, road, q.owner, q.unitKind);
    for (let k = 0; k < q.remaining; k++) {
      const eta = travel + k * C.LEAVE_INTERVAL_MS;
      if (eta <= horizonMs) out.push({ etaMs: eta, weight: unit, hostile: q.owner !== tower.owner });
    }
  }
  return out;
}

/**
 * Walk the landings on `tower` in time order from a garrison of `start`, adding the tower's own
 * production between landings (fortress defenders count double against hostile weight). Rules v2.1:
 * production is 0 while the tower is under fire — for the rest of its current window and for
 * `UNDER_FIRE_MS` after every hostile landing — so a trickle with landings closer than that stops it
 * recruiting altogether. Returns the lowest garrison on the way and the time of the first hostile
 * landing that would have flipped the tower (Infinity when it holds within the horizon). Pure
 * arithmetic on what is visible.
 */
export function walkLandings(state: GameState, tower: Tower, start: number, list: Landing[]): { minUnits: number; fallsAtMs: number; hostile: boolean } {
  const sorted = [...list].sort((a, b) => a.etaMs - b.etaMs || (a.hostile ? 1 : -1));
  const rate = tower.owner === 'neutral' ? 0 : genPerSecond(tower, state);
  const mult = defenceMultiplier(tower);
  const cap = capacityOf(tower, state);
  let g = start;
  let minUnits = start;
  let tPrev = 0;
  let pausedUntil = underFireLeftMs(state, tower);
  let fallsAtMs = Infinity;
  let hostile = false;
  for (const l of sorted) {
    const from = Math.max(tPrev, pausedUntil);
    if (l.etaMs > from) g = Math.min(cap, g + (rate * (l.etaMs - from)) / 1000);
    tPrev = l.etaMs;
    if (l.hostile) {
      hostile = true;
      g -= l.weight / mult;
      pausedUntil = l.etaMs + C.UNDER_FIRE_MS;
      if (g < 0 && fallsAtMs === Infinity) fallsAtMs = l.etaMs;
    } else g = Math.min(cap, g + l.weight);
    minUnits = Math.min(minUnits, g);
  }
  return { minUnits, fallsAtMs, hostile };
}

/**
 * Rules v2.1 steady state of a tower under streams, units per second, once every burst has landed: the
 * friendly streams' trickle plus what the tower still recruits between hostile landings, minus the
 * hostile trickle. `extraFriendly` adds helpers about to link. ≤ 0 means the tower bleeds: a supply
 * line only delays its fall (a counter-stream or a bridge cut is the answer, not more supply).
 */
export function siegeNetRate(state: GameState, tower: Tower, extraFriendly = 0): number {
  let hostileRate = 0;
  let underFire = 0; // fraction of the time the hostile trickles keep the tower under fire
  for (const l of linksTo(state, tower.id)) {
    if (l.owner === tower.owner) continue;
    const from = state.towers[l.from];
    const rate = linkRate(state, l);
    if (!from || rate <= 0) continue;
    hostileRate += rate;
    underFire += Math.min(1, (C.UNDER_FIRE_MS * rate) / (1000 * unitWeightOf(from)));
  }
  const own = tower.owner === 'neutral' ? 0 : genPerSecond(tower, state) * (1 - Math.min(1, underFire));
  return inflowRate(state, tower.id, false) + extraFriendly + own - hostileRate / defenceMultiplier(tower);
}

/**
 * Units the tower must hold right now to survive what is visibly coming at it within the horizon — the
 * columns on the roads and the streams (burst and trickle) aimed at it, net of its own production and of
 * the friendly streams feeding it — plus `margin`. 0 when nothing hostile is coming. `exclude` judges the
 * tower without one of its supply streams; `excludeFrom` leaves out everything coming from one
 * neighbour (a stream the tower is about to attack head-on: its own units clash with that column).
 */
export function holdReserve(state: GameState, tower: Tower, margin = 1, exclude?: Link, excludeFrom?: string): number {
  const walk = walkLandings(state, tower, 0, landings(state, tower, STREAM_HORIZON_MS, exclude, excludeFrom));
  if (!walk.hostile) return 0;
  return Math.max(0, Math.ceil(-walk.minUnits)) + margin;
}

/** When the tower would fall to what is visibly coming at it, ms (Infinity when it holds within the horizon). */
export function fallsAtMs(state: GameState, tower: Tower): number {
  return walkLandings(state, tower, tower.units, landings(state, tower)).fallsAtMs;
}

/** Weight of `owner`'s units already walking the roads to a tower (what has left its sources). */
export function walkingWeight(state: GameState, towerId: string, owner: Owner): number {
  let sum = 0;
  for (const u of state.units) if (u.to === towerId && u.owner === owner) sum += u.weight;
  return sum;
}

/** Weight of `owner`'s units heading to a tower: on the roads plus still to drain out of its links (and legacy queues). */
export function incomingWeight(state: GameState, towerId: string, owner: Owner): number {
  let sum = 0;
  for (const u of state.units) if (u.to === towerId && u.owner === owner) sum += u.weight;
  for (const l of state.links) if (l.to === towerId && l.owner === owner) sum += linkPending(state, l);
  for (const q of state.queues) {
    if (q.to === towerId && q.owner === owner) sum += q.remaining * (q.unitKind === 'tank' ? C.TANK_WEIGHT : 1);
  }
  return sum;
}

/**
 * Sum of hostile unit weight heading to a tower (everyone but the tower's owner): units on roads plus
 * what hostile streams still hold in their source garrisons (a human sees the ribbon and the source
 * draining; the trickle that follows is `inflowRate`).
 */
export function incomingThreat(state: GameState, towerId: string): number {
  const tower = state.towers[towerId];
  if (!tower) return 0;
  let sum = 0;
  for (const u of state.units) if (u.to === towerId && u.owner !== tower.owner) sum += u.weight;
  for (const l of state.links) if (l.to === towerId && l.owner !== tower.owner) sum += linkPending(state, l);
  for (const q of state.queues) {
    if (q.to === towerId && q.owner !== tower.owner) sum += q.remaining * (q.unitKind === 'tank' ? C.TANK_WEIGHT : 1);
  }
  return sum;
}

/** Friendly weight heading to a tower (reinforcements already on the way). */
export function incomingSupport(state: GameState, towerId: string): number {
  const tower = state.towers[towerId];
  if (!tower) return 0;
  return incomingWeight(state, towerId, tower.owner);
}

/** Attackers needed per defender: 2 for a fortress, 1 otherwise. */
export function defenceMultiplier(tower: Tower): number {
  return tower.kind === 'fortress' ? C.FORTRESS_DEFENCE : 1;
}

/** Garrison expressed in attacker weight: fortress defenders count double. */
export function effectiveDefenders(tower: Tower): number {
  return tower.units * defenceMultiplier(tower);
}

/** Smallest arriving weight that flips the tower right now (damage must exceed the garrison). */
export function weightToCapture(tower: Tower): number {
  return effectiveDefenders(tower) + defenceMultiplier(tower);
}

/**
 * Production of the tower in weight per second (0 for neutral), by its *current* owner: a player tower
 * includes the player's production bonus, so does an enemy tower once the player has captured it.
 */
export function genPerSecond(tower: Tower, state: Visible): number {
  if (tower.owner === 'neutral') return 0;
  let base: number;
  switch (tower.kind) {
    case 'tankFactory':
      base = (C.TANK_WEIGHT * 1000) / C.TANK_GEN_MS;
      break;
    case 'artillery':
      base = 1000 / (C.GEN_MS[tower.level] * C.ARTILLERY_GEN_MUL);
      break;
    default:
      base = 1000 / C.GEN_MS[tower.level];
  }
  return base * modifiersFor(tower.owner, state).productionMul;
}

/** Rules v2.1: milliseconds of the tower's current under-fire window still to run (0 when it recruits). */
export function underFireLeftMs(state: Visible, tower: Tower): number {
  return isUnderFire(state, tower) ? tower.underFireUntilMs - state.time : 0;
}

/**
 * Raw weight the tower produces within the next `ms` if nothing else hits it: its rate over the part of
 * the window that is not under fire (rules v2.1). Fractional; callers round as the sim would.
 */
export function producedIn(tower: Tower, ms: number, state: Visible): number {
  return (genPerSecond(tower, state) * Math.max(0, ms - underFireLeftMs(state, tower))) / 1000;
}

/**
 * Rules v2.1: the production of `tower` that survives a hostile stream landing one unit every `gapMs`,
 * per second. Every landing pauses recruiting for `UNDER_FIRE_MS`, so a barracks trickle (gap ≤ 1 s)
 * leaves nothing and a lone tank factory (gap 4 s) leaves 2.5 s of every 4.
 */
export function siegeRegenPerSecond(tower: Tower, gapMs: number, state: Visible): number {
  if (!(gapMs > C.UNDER_FIRE_MS)) return 0;
  if (!Number.isFinite(gapMs)) return genPerSecond(tower, state);
  return (genPerSecond(tower, state) * (gapMs - C.UNDER_FIRE_MS)) / gapMs;
}

/**
 * Weight `source` adds to a stream it runs for `planMs` after its burst (rules v2.1: the trickle keeps
 * landing on a target that recruits nothing), in whole units of its kind, minus what the target still
 * recruits between landings that far apart. 0 for a source that produces nothing.
 */
export function siegeCredit(source: Tower, target: Tower, planMs: number, state: Visible): number {
  const rate = genPerSecond(source, state);
  if (rate <= 0) return 0;
  const unit = unitWeightOf(source);
  const lands = Math.floor((rate * planMs) / 1000 / unit) * unit;
  const regen = Math.ceil((siegeRegenPerSecond(target, (1000 * unit) / rate, state) * planMs) / 1000) * defenceMultiplier(target);
  return Math.max(0, lands - regen);
}

/**
 * Garrison the tower will have after `afterMs` of generation (capped at its owner's capacity), as raw
 * units — nothing while it is under fire (rules v2.1). A streaming tower drains every recruit into its
 * ribbons instead, but those meet whatever is sent at it on the road, so counting them as growth is the
 * same arithmetic for an attacker.
 */
export function projectedUnits(tower: Tower, afterMs: number, state: Visible): number {
  return Math.min(capacityOf(tower, state), tower.units + Math.floor(producedIn(tower, afterMs, state)));
}

/** Projected garrison in attacker weight (fortress-aware). */
export function projectedDefenders(tower: Tower, afterMs: number, state: Visible): number {
  return projectedUnits(tower, afterMs, state) * defenceMultiplier(tower);
}

/** Highest level this tower can reach. */
export function maxLevelOf(tower: Pick<Tower, 'kind'>): number {
  return tower.kind === 'fortress' ? C.FORTRESS_MAX_LEVEL : C.MAX_LEVEL;
}

/** Rules v2: is the tower at its kind's top level (garrison capped, nothing left to grow into)? */
export function atMaxLevel(tower: Pick<Tower, 'kind' | 'level'>): boolean {
  return tower.level >= maxLevelOf(tower);
}

/**
 * Units the tower must keep to survive the hostile weight already heading its way, plus a small
 * margin. 0 when nothing is incoming.
 */
export function threatReserve(state: GameState, tower: Tower, margin = 2): number {
  const threat = incomingThreat(state, tower.id);
  if (threat <= 0) return 0;
  return Math.ceil(threat / defenceMultiplier(tower)) + margin;
}

/** Units the tower can send without being captured by what is already incoming. */
export function spendable(state: GameState, tower: Tower, margin = 2): number {
  return Math.max(0, tower.units - threatReserve(state, tower, margin));
}

/** Weight of one unit produced by this tower: a tank for a tank factory, infantry otherwise. */
export function unitWeightOf(tower: Tower): number {
  return tower.kind === 'tankFactory' ? C.TANK_WEIGHT : C.INFANTRY_WEIGHT;
}

/**
 * `count` weight rounded down to whole units of the tower's kind (and to what the garrison holds):
 * exactly what a sendUnits command would put on the road. A tank factory holding less than one tank
 * (weight 1–4) yields 0 — decision rules must size tank sources with this, never with raw weight.
 */
export function wholeUnits(tower: Tower, count: number): number {
  const w = unitWeightOf(tower);
  return Math.floor(Math.max(0, Math.min(count, tower.units)) / w) * w;
}

/** Rules v2: the command that starts a stream `tower → to` (the sim validates road, owner and slots). */
export function linkCommand(tower: Tower, to: string): Command {
  return { type: 'link', owner: tower.owner, from: tower.id, to };
}

/** Rules v2: the command that ends one stream of `tower` (or every stream when `to` is omitted). */
export function unlinkCommand(tower: Tower, to?: string): Command {
  return to === undefined ? { type: 'unlink', owner: tower.owner, from: tower.id } : { type: 'unlink', owner: tower.owner, from: tower.id, to };
}

/**
 * Road hops from every tower to the nearest tower owned by an opponent of `owner` (neutral towers are
 * not opponents). Unreachable towers are absent from the map.
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
      if (!hops.has(n.tower.id)) {
        hops.set(n.tower.id, d + 1);
        queue.push(n.tower.id);
      }
    }
  }
  return hops;
}

/** The road between two towers, if any (cut or not). */
export function roadBetween(state: GameState, a: string, b: string): Road | undefined {
  return state.roads[roadIdFor(a, b)];
}

/* ---------- Threat model (what a human sees: garrisons and columns on the roads) ---------- */

/** Time until a walking unit reaches its destination, ms. */
export function remainingMs(state: GameState, u: Unit): number {
  const road = state.roads[u.roadId];
  if (!road) return 0;
  return ((1 - u.progress) * road.length * 1000) / u.speed;
}

export interface Inbound {
  weight: number;
  /** Earliest landing of that owner's column, ms. */
  etaMs: number;
}

/** Weight heading to a tower, per owner, with the earliest landing (walking units plus queued ones). */
export function inboundByOwner(state: GameState, towerId: string): Map<Owner, Inbound> {
  const out = new Map<Owner, Inbound>();
  const add = (owner: Owner, weight: number, etaMs: number): void => {
    const cur = out.get(owner);
    if (cur) {
      cur.weight += weight;
      cur.etaMs = Math.min(cur.etaMs, etaMs);
    } else out.set(owner, { weight, etaMs });
  };
  for (const u of state.units) if (u.to === towerId) add(u.owner, u.weight, remainingMs(state, u));
  for (const l of state.links) {
    if (l.to !== towerId) continue;
    const road = state.roads[l.roadId];
    const from = state.towers[l.from];
    if (!road || !from) continue;
    const pending = linkPending(state, l);
    if (pending > 0) add(l.owner, pending, travelMsFor(state, road, l.owner, streamKind(from)));
  }
  for (const q of state.queues) {
    if (q.to !== towerId) continue;
    const road = state.roads[q.roadId];
    if (!road) continue;
    add(q.owner, q.remaining * (q.unitKind === 'tank' ? C.TANK_WEIGHT : C.INFANTRY_WEIGHT), travelMsFor(state, road, q.owner, q.unitKind));
  }
  return out;
}

/** Time until a column of `weight` sent now has fully arrived over `travelMs`. */
export function arrivalMs(travelMs: number, weight: number): number {
  return travelMs + weight * C.LEAVE_INTERVAL_MS;
}

/** A column that could be thrown at one of `self`'s towers from a neighbour. */
export interface ThreatSource {
  from: Tower;
  /** Weight that would land after the road's barrier/mine ate its share. */
  attackers: number;
  /** When the last unit of that column could have landed, ms (its production credit window). */
  etaMs: number;
}

/**
 * A hostile tower's own column: its garrison as it will be at now + `atMs`, plus its reinforcements on
 * the way, minus what is already attacking it and minus what its own streams drain away.
 */
function ownColumn(state: GameState, from: Tower, atMs: number): number {
  let hostile = 0;
  let support = 0;
  for (const [owner, v] of inboundByOwner(state, from.id)) {
    if (owner === from.owner) support += v.weight;
    else hostile += v.weight;
  }
  // What the tower still holds for its streams counts too: a link is redirected in one tick (rushers
  // drop and re-aim theirs whenever a column shows), so a garrison is a threat until it has left.
  return projectedUnits(from, atMs, state) + support - Math.ceil(hostile / defenceMultiplier(from));
}

/**
 * Share of a hostile column two hops away (through a neutral) that counts as a threat: it must want
 * and take the neutral first, and its capture is visible for a whole travel time before it can carry
 * on — a human keeps something at home for it, not everything.
 */
export const TWO_HOP_DISCOUNT = 0.5;

/**
 * The column neighbour `n` could throw at a tower of `self` right now: a hostile garrison as it will be
 * at now + `atMs` (plus its reinforcements on the way, minus what is already attacking it and minus what
 * its own streams drain away), or a hostile column that is about to flip the neighbour — neutral or
 * another rival's — and carry on from there. A neutral neighbour also relays what a hostile tower on
 * its far side could throw through it: that column minus what flipping the neutral costs, discounted by
 * `TWO_HOP_DISCOUNT` (a home whose neighbours are all neutral is not safe when an enemy sits behind
 * one of them). An own neighbour that falls within the landing horizon relays the surplus of the
 * attack that takes it (nothing is kept for a neighbour that holds). The column is timed as if it left right now (a racing rival does not wait) at *its*
 * owner's speed, never at `self`'s. What streams keep trickling later is not a column: `holdReserve`
 * reads the streams actually aimed at a tower. `undefined` when nothing could come from that side.
 */
export function threatFrom(state: GameState, self: Owner, n: Neighbour, atMs = 0): ThreatSource | undefined {
  const from = n.tower;
  if (from.owner === self) {
    // An own neighbour that falls to what is visibly coming at it: the surplus of that attack carries
    // on from there (a stream keeps flowing through the tower it took).
    const walk = walkLandings(state, from, from.units, landings(state, from));
    if (walk.fallsAtMs === Infinity) return undefined;
    const attackers = Math.ceil(-walk.minUnits) - n.roadCost;
    if (attackers <= 0) return undefined;
    return { from, attackers, etaMs: walk.fallsAtMs + arrivalMs(n.theirTravelMs, attackers) };
  }
  const inbound = inboundByOwner(state, from.id);
  let attackers = 0;
  let landMs = 0;
  if (from.owner !== 'neutral') attackers = ownColumn(state, from, atMs);
  // A column of another rival bigger than the garrison flips the neighbour and keeps the remainder.
  for (const [owner, v] of inbound) {
    if (owner === self || owner === 'neutral' || owner === from.owner) continue;
    const remainder = v.weight - effectiveDefenders(from);
    if (remainder > attackers) {
      attackers = remainder;
      landMs = v.etaMs;
    }
  }
  if (from.owner === 'neutral') {
    // Two hops: a hostile tower behind the neutral could take it and carry the remainder on to us.
    for (const m of neighbours(state, from.id)) {
      if (m.tower.owner === self || m.tower.owner === 'neutral') continue;
      const through = (ownColumn(state, m.tower, atMs) - m.roadCost - weightToCapture(from)) * TWO_HOP_DISCOUNT;
      if (through > attackers) {
        attackers = through;
        landMs = arrivalMs(travelMsFor(state, m.road, m.tower.owner), through);
      }
    }
  }
  attackers -= n.roadCost;
  if (attackers <= 0) return undefined;
  return { from, attackers, etaMs: landMs + arrivalMs(n.theirTravelMs, attackers) };
}

/** Aggression gate: an enemy tower skips its action this tick with probability (1 - aggression) * 0.5. */
export function skipsAction(enemy: EnemyDef, rng: Rng): boolean {
  const p = (1 - clamp01(enemy.aggression)) * 0.5;
  return rng.next() < p;
}

export function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
}

/** Whether sim time is on an AI tick boundary (every C.AI_TICK_MS). */
export function isAiTick(state: GameState): boolean {
  return state.time % C.AI_TICK_MS === 0;
}
