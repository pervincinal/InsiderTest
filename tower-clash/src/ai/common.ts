/**
 * Shared AI helpers. Everything here reads only what a human player could see on screen:
 * tower owners/garrisons/levels, roads (cut, barrier, mine), and units walking the roads.
 * Nothing mutates state.
 */
import type { Command, EnemyDef, GameState, Owner, Road, Tower, Unit, UnitKind } from '../sim/index';
import { C, Rng, capacityOf, modifiersFor, roadIdFor } from '../sim/index';

/**
 * A snapshot the AI reasons about: the towers/roads/units it can see plus the player's permanent
 * modifiers. `state.modifiers` is public information (the player bought them), so both sides may
 * read it: the enemy planners estimate a boosted player, the reference player its own boosted towers.
 */
export type Visible = Pick<GameState, 'modifiers'>;

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

/** Weight of `owner`'s units heading to a tower: on the roads plus still streaming out of a queue. */
export function incomingWeight(state: GameState, towerId: string, owner: Owner): number {
  let sum = 0;
  for (const u of state.units) if (u.to === towerId && u.owner === owner) sum += u.weight;
  for (const q of state.queues) {
    if (q.to === towerId && q.owner === owner) sum += q.remaining * (q.unitKind === 'tank' ? C.TANK_WEIGHT : 1);
  }
  return sum;
}

/**
 * Sum of hostile unit weight heading to a tower (everyone but the tower's owner): units on roads plus
 * units still streaming out of a hostile tower toward it (a human sees the column forming; the source
 * garrison already dropped).
 */
export function incomingThreat(state: GameState, towerId: string): number {
  const tower = state.towers[towerId];
  if (!tower) return 0;
  let sum = 0;
  for (const u of state.units) if (u.to === towerId && u.owner !== tower.owner) sum += u.weight;
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

/** Garrison the tower will have after `afterMs` of generation (capped at its owner's capacity), as raw units. */
export function projectedUnits(tower: Tower, afterMs: number, state: Visible): number {
  return Math.min(capacityOf(tower, state), tower.units + Math.floor((genPerSecond(tower, state) * afterMs) / 1000));
}

/** Projected garrison in attacker weight (fortress-aware). */
export function projectedDefenders(tower: Tower, afterMs: number, state: Visible): number {
  return projectedUnits(tower, afterMs, state) * defenceMultiplier(tower);
}

/** Highest level this tower can reach. */
export function maxLevelOf(tower: Tower): number {
  return tower.kind === 'fortress' ? C.FORTRESS_MAX_LEVEL : C.MAX_LEVEL;
}

/** Units needed for the next upgrade, or undefined when already at max. */
export function upgradeCost(tower: Tower): number | undefined {
  if (tower.level >= maxLevelOf(tower)) return undefined;
  return (C.UPGRADE_COST as readonly number[])[tower.level];
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

/** Ratio that makes the sim send exactly `count` weight from the tower (1 when sending everything). */
export function sendRatio(tower: Tower, count: number): number {
  if (count >= tower.units) return 1;
  if (count <= 0) return 0;
  return (count + 0.5) / tower.units;
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

/** Build a sendUnits command for `count` weight; `undefined` when nothing would be sent. */
export function sendCommand(tower: Tower, to: string, count: number): Command | undefined {
  const whole = wholeUnits(tower, count);
  if (whole <= 0) return undefined;
  return { type: 'sendUnits', owner: tower.owner, from: tower.id, to, ratio: sendRatio(tower, whole) };
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
 * The column neighbour `n` could throw at a tower of `self`: a hostile garrison as it will be at now +
 * `atMs` (plus its reinforcements on the way, minus what is already attacking it), or a hostile column
 * that is about to flip the neighbour — neutral or another rival's — and carry on from there. The column
 * is timed as if it left right now (a racing rival does not wait) at *its* owner's speed, never at
 * `self`'s. `undefined` when nothing could come from that side.
 */
export function threatFrom(state: GameState, self: Owner, n: Neighbour, atMs = 0): ThreatSource | undefined {
  const from = n.tower;
  if (from.owner === self) return undefined;
  const inbound = inboundByOwner(state, from.id);
  let attackers = 0;
  let landMs = 0;
  if (from.owner !== 'neutral') {
    let hostile = 0;
    let support = 0;
    for (const [owner, v] of inbound) {
      if (owner === from.owner) support += v.weight;
      else hostile += v.weight;
    }
    attackers = projectedUnits(from, atMs, state) + support - Math.ceil(hostile / defenceMultiplier(from));
  }
  // A column of another rival bigger than the garrison flips the neighbour and keeps the remainder.
  for (const [owner, v] of inbound) {
    if (owner === self || owner === 'neutral' || owner === from.owner) continue;
    const remainder = v.weight - effectiveDefenders(from);
    if (remainder > attackers) {
      attackers = remainder;
      landMs = v.etaMs;
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
