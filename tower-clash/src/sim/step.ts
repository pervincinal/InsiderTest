import type { GameState, Link, Owner, PlayerModifiers, Road, SimEvent, Tower, Unit, UnitKind, UnlinkReason } from './types';
import { DEFAULT_MODIFIERS } from './types';
import { C } from './constants';
import { getOutcome } from './outcome';

/** Tolerance for floating-point accumulation of progress along a lane. */
const EPS = 1e-9;

/** Player modifiers for `owner`: the state's modifiers for `player`, defaults for everyone else. */
export function modifiersFor(owner: Owner, state?: Pick<GameState, 'modifiers'>): Readonly<PlayerModifiers> {
  return owner === 'player' && state ? state.modifiers : DEFAULT_MODIFIERS;
}

/** Rules v2: every kind uses the 25 / 50 / 100 ladder; a fortress holds ×1.5 (37 / 75). */
function baseCapacityOf(tower: Tower): number {
  const base = C.CAPACITY[tower.level];
  return tower.kind === 'fortress' ? Math.floor(base * C.FORTRESS_CAPACITY_MUL) : base;
}

/** Highest level a tower of this kind can reach (fortress stops at L2). */
export function maxLevelOf(tower: Pick<Tower, 'kind'>): number {
  return tower.kind === 'fortress' ? C.FORTRESS_MAX_LEVEL : C.MAX_LEVEL;
}

/** Maximum simultaneous outgoing links of a tower (GDD §2.0: L1 = 1, L2 = 2, L3 = 3). */
export function maxLinksOf(tower: Pick<Tower, 'level'>): number {
  return C.LINKS_PER_LEVEL[tower.level];
}

/** Active links leaving `towerId`, in creation order. */
export function linksFrom(state: Pick<GameState, 'links'>, towerId: string): Link[] {
  return state.links.filter((l) => l.from === towerId);
}

/** True when the tower currently streams through at least one link (its growth is paused). */
export function isLinked(state: Pick<GameState, 'links'>, towerId: string): boolean {
  return state.links.some((l) => l.from === towerId);
}

/**
 * Rules v2.1 "Under fire": true while a hostile landing has paused the tower's production
 * (`time < underFireUntilMs`). Pure read for the renderer and the AI. Streams are not paused by it.
 */
export function isUnderFire(state: Pick<GameState, 'time'>, tower: Pick<Tower, 'underFireUntilMs'>): boolean {
  return state.time < tower.underFireUntilMs;
}

/** True while a `freeze` booster cast by another owner is active: `owner` neither generates nor streams. */
export function isFrozen(state: Pick<GameState, 'boosters'>, owner: Owner): boolean {
  return state.boosters.some((b) => b.type === 'freeze' && b.owner !== owner);
}

/** True while `owner` has an active `overdrive` booster (production and streams accumulate ×OVERDRIVE_MUL). */
export function hasOverdrive(state: Pick<GameState, 'boosters'>, owner: Owner): boolean {
  return state.boosters.some((b) => b.type === 'overdrive' && b.owner === owner);
}

/**
 * Base production interval of a tower kind at its level, ÷ the owner's `productionMul` (GDD §2.2):
 * barracks / fortress `GEN_MS[level]`, artillery × `ARTILLERY_GEN_MUL`, tank factory `TANK_GEN_MS[level]`.
 * Overdrive is not included (it multiplies the accumulation instead).
 */
export function productionIntervalMs(tower: Pick<Tower, 'kind' | 'level' | 'owner'>, state?: Pick<GameState, 'modifiers'>): number {
  let interval: number;
  switch (tower.kind) {
    case 'tankFactory':
      interval = C.TANK_GEN_MS[tower.level];
      break;
    case 'artillery':
      interval = C.GEN_MS[tower.level] * C.ARTILLERY_GEN_MUL;
      break;
    default:
      interval = C.GEN_MS[tower.level];
  }
  return interval / modifiersFor(tower.owner, state).productionMul;
}

/** Weight of one produced unit of the tower's kind (a tank factory produces whole tanks). */
function productionWeight(tower: Pick<Tower, 'kind'>): number {
  return tower.kind === 'tankFactory' ? C.TANK_WEIGHT : C.INFANTRY_WEIGHT;
}

/**
 * Rules v3: ms between two units of one stream leaving `from` — its production interval for its kind
 * and level (1000 / 700 / 500 for barracks; artillery ×2; tank factory 4000 / 2800 / 2000), ÷ the
 * owner's `productionMul`. Every link of the tower streams at this rate independently.
 */
export function streamIntervalMs(from: Pick<Tower, 'kind' | 'level' | 'owner'>, state?: Pick<GameState, 'modifiers'>): number {
  return productionIntervalMs(from, state);
}

/** Units per second one stream from `from` delivers (`1000 / streamIntervalMs`); overdrive / freeze not included. */
export function streamRate(from: Pick<Tower, 'kind' | 'level' | 'owner'>, state?: Pick<GameState, 'modifiers'>): number {
  return 1000 / streamIntervalMs(from, state);
}

/**
 * Rules v2 auto-upgrade: an owned L1/L2 tower whose garrison has reached its (modified) capacity
 * gains a level at once, keeping its garrison. A linked tower never upgrades (its growth is paused).
 * At the kind's max level the garrison is clamped at capacity. Returns whether a level was gained.
 */
export function tryAutoUpgrade(state: GameState, tower: Tower): boolean {
  if (!C.AUTO_UPGRADE || tower.owner === 'neutral') return false;
  const cap = capacityOf(tower, state);
  if (tower.units < cap) return false;
  if (tower.level >= maxLevelOf(tower)) {
    tower.units = Math.min(tower.units, cap);
    return false;
  }
  if (isLinked(state, tower.id)) return false;
  tower.level = (tower.level + 1) as 1 | 2 | 3;
  state.events.push({ type: 'upgrade', towerId: tower.id, level: tower.level });
  return true;
}

/**
 * Maximum garrison (in weight) a tower can hold. Pass the state to include the player's
 * `capacityMul` (floored, min 1); it is applied by the tower's *current* owner, so a tower gains or
 * loses the bonus the moment it is captured. Without a state the base (unmodified) capacity is returned.
 */
export function capacityOf(tower: Tower, state?: Pick<GameState, 'modifiers'>): number {
  const base = baseCapacityOf(tower);
  const mul = modifiersFor(tower.owner, state).capacityMul;
  return mul === 1 ? base : Math.max(1, Math.floor(base * mul));
}

/** Point at fraction `t` (0..1) along the lane, measured from road.a. */
export function roadPointAt(road: Road, t: number): { x: number; y: number } {
  const pts = road.points;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  if (t <= 0) return { x: first.x, y: first.y };
  if (t >= 1) return { x: last.x, y: last.y };
  let remaining = t * road.length;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1]!;
    const q = pts[i]!;
    const seg = Math.hypot(q.x - p.x, q.y - p.y);
    if (remaining <= seg || i === pts.length - 1) {
      const k = seg === 0 ? 0 : Math.min(1, remaining / seg);
      return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k };
    }
    remaining -= seg;
  }
  return { x: last.x, y: last.y };
}

/** Fraction along the lane measured from road.a, whichever way the unit travels. */
function roadFraction(road: Road, unit: Unit, progress: number): number {
  return unit.from === road.a ? progress : 1 - progress;
}

/** World position of a unit, interpolated along its lane. */
export function unitPosition(state: GameState, unit: Unit): { x: number; y: number } {
  const road = state.roads[unit.roadId];
  if (!road) return { x: 0, y: 0 };
  return roadPointAt(road, roadFraction(road, unit, unit.progress));
}

function kill(state: GameState, unit: Unit, cause: 'clash' | 'artillery' | 'mine'): void {
  const pos = unitPosition(state, unit);
  state.events.push({ type: 'unitDied', x: pos.x, y: pos.y, owner: unit.owner, cause });
}

/**
 * Growth. A tower generates nothing while neutral, frozen, under fire or linked (rules v3 rule 5: a
 * streaming tower keeps its garrison but does not grow — its production goes into its streams).
 */
function generation(state: GameState, dt: number): void {
  for (const id in state.towers) {
    const tower = state.towers[id]!;
    if (tower.owner === 'neutral') continue;
    // Rules v3: a linked tower neither accumulates nor auto-upgrades.
    if (isLinked(state, tower.id)) continue;

    const cap = capacityOf(tower, state);
    if (tower.units >= cap) {
      // Rules v2: the level is taken "on the spot" — before the freeze / under-fire gates below, which
      // pause growth only (QA 2026-09-22: an L1 at 25 unlinked under fire stayed L1 until the fire stopped).
      tryAutoUpgrade(state, tower);
      tower.genAccMs = 0;
      continue;
    }
    if (isFrozen(state, tower.owner)) continue;
    // Rules v2.1: a tower under fire recruits nothing (same mechanism as Freeze: the accumulator pauses).
    if (isUnderFire(state, tower)) continue;
    const interval = productionIntervalMs(tower, state);
    const weight = productionWeight(tower);
    // Multiplicative with overdrive: interval ÷ productionMul, accumulation × OVERDRIVE_MUL.
    tower.genAccMs += dt * (hasOverdrive(state, tower.owner) ? C.OVERDRIVE_MUL : 1);
    while (tower.genAccMs >= interval && tower.units < cap) {
      tower.genAccMs -= interval;
      tower.units = Math.min(cap, tower.units + weight);
    }
    if (tower.units >= cap) {
      // Reaching capacity at L1/L2 upgrades at once (garrison kept); at max level production stops.
      if (!tryAutoUpgrade(state, tower)) tower.genAccMs = 0;
    }
  }
}

/** Put a fresh unit on `roadId` leaving `from` toward `to`. Speed is fixed at spawn (player march bonus). */
function spawnUnit(state: GameState, owner: Owner, kind: UnitKind, from: string, to: string, roadId: string): Unit {
  const tank = kind === 'tank';
  const speedMul = modifiersFor(owner, state).unitSpeedMul;
  const unit: Unit = {
    id: state.nextUnitId++,
    owner,
    kind,
    weight: tank ? C.TANK_WEIGHT : C.INFANTRY_WEIGHT,
    roadId,
    from,
    to,
    progress: 0,
    speed: (tank ? C.UNIT_SPEED * C.TANK_SPEED_MUL : C.UNIT_SPEED) * speedMul,
  };
  state.units.push(unit);
  return unit;
}

/** Remove `link` from the state and emit the `unlinked` event. */
export function removeLink(state: GameState, link: Link, reason: UnlinkReason): void {
  const i = state.links.indexOf(link);
  if (i < 0) return;
  state.links.splice(i, 1);
  state.events.push({ type: 'unlinked', owner: link.owner, from: link.from, to: link.to, reason });
}

/**
 * Auto-unlink: a link ends when its source changed owner or is gone (`sourceLost`), its source holds
 * less than one unit (`sourceEmpty`, rules v3 rule 6), or its target is the link owner's and sits at
 * capacity (`targetFull`).
 */
function pruneLinks(state: GameState): void {
  for (const link of [...state.links]) {
    const from = state.towers[link.from];
    const to = state.towers[link.to];
    if (!from || !to || from.owner !== link.owner) removeLink(state, link, 'sourceLost');
    else if (from.units < 1) removeLink(state, link, 'sourceEmpty');
    else if (to.owner === link.owner && to.units >= capacityOf(to, state)) removeLink(state, link, 'targetFull');
  }
}

/**
 * Rules v3 stream emission: every link accumulates `emitAccMs` (×OVERDRIVE_MUL under overdrive, paused
 * while the owner is frozen) and spawns one unit per `streamIntervalMs(from)` — a whole tank from a tank
 * factory holding ≥ TANK_WEIGHT, else infantry — as long as the source holds ≥ 1. The garrison does not
 * change. With nothing to send the timer stays armed at one interval so the next unit leaves at once.
 */
function emit(state: GameState, dt: number): void {
  for (const link of state.links) {
    const from = state.towers[link.from];
    if (!from || from.owner !== link.owner) continue; // pruneLinks ends it
    if (isFrozen(state, link.owner)) continue;
    const interval = streamIntervalMs(from, state);
    link.emitAccMs += dt * (hasOverdrive(state, link.owner) ? C.OVERDRIVE_MUL : 1);
    while (link.emitAccMs >= interval) {
      if (from.units < 1) {
        link.emitAccMs = interval;
        break;
      }
      link.emitAccMs -= interval;
      const kind: UnitKind = from.kind === 'tankFactory' && from.units >= C.TANK_WEIGHT ? 'tank' : 'infantry';
      spawnUnit(state, link.owner, kind, link.from, link.to, link.roadId);
    }
  }
}

/** Move every unit; returns progress before the move, keyed by unit id. */
function move(state: GameState, dt: number): Map<number, number> {
  const prev = new Map<number, number>();
  for (const u of state.units) {
    prev.set(u.id, u.progress);
    const road = state.roads[u.roadId];
    if (!road) continue;
    u.progress += (u.speed * dt) / 1000 / road.length;
  }
  return prev;
}

/**
 * Mines (rules v3 rule 3): a unit that crosses a mine's lane fraction this tick (direction aware) dies
 * if the mine still holds at least its weight (charges −= weight); a heavier unit survives intact and
 * empties the mine. A spent mine (0 charges) is skipped on every lane.
 */
function hazards(state: GameState, prev: Map<number, number>): void {
  const dead = new Set<number>();
  for (const u of state.units) {
    const road = state.roads[u.roadId];
    if (!road || road.mineHits.length === 0) continue;
    const before = prev.get(u.id) ?? 0;
    const forward = u.from === road.a;
    // Hits in travel order: lane fractions run a → b, a backward unit meets them in reverse.
    const hits = forward ? road.mineHits : [...road.mineHits].reverse();
    for (const hit of hits) {
      const t = forward ? hit.t : 1 - hit.t;
      if (!(before < t && u.progress >= t)) continue;
      const mine = state.mines[hit.mine];
      if (!mine || mine.charges <= 0) continue;
      if (mine.charges >= u.weight) {
        mine.charges -= u.weight;
        kill(state, u, 'mine');
        dead.add(u.id);
        break;
      }
      mine.charges = 0;
    }
  }
  if (dead.size) state.units = state.units.filter((u) => !dead.has(u.id));
}

function clashes(state: GameState, prev: Map<number, number>): void {
  const byRoad = new Map<string, Unit[]>();
  for (const u of state.units) {
    const list = byRoad.get(u.roadId);
    if (list) list.push(u);
    else byRoad.set(u.roadId, [u]);
  }
  const dead = new Set<number>();
  for (const [roadId, list] of byRoad) {
    const road = state.roads[roadId];
    if (!road || list.length < 2) continue;
    const forward = list.filter((u) => u.from === road.a);
    const backward = list.filter((u) => u.from !== road.a);
    if (!forward.length || !backward.length) continue;
    for (const f of forward) {
      if (dead.has(f.id)) continue;
      const fPrev = prev.get(f.id) ?? f.progress;
      for (const b of backward) {
        if (dead.has(b.id) || dead.has(f.id)) continue;
        if (b.owner === f.owner) continue;
        const bPrev = 1 - (prev.get(b.id) ?? b.progress);
        const bNow = 1 - b.progress;
        const crossed = fPrev < bPrev && f.progress >= bNow;
        if (!crossed) continue;
        if (f.weight < b.weight) {
          b.weight -= f.weight;
          kill(state, f, 'clash');
          dead.add(f.id);
        } else if (f.weight > b.weight) {
          f.weight -= b.weight;
          kill(state, b, 'clash');
          dead.add(b.id);
        } else {
          kill(state, f, 'clash');
          kill(state, b, 'clash');
          dead.add(f.id);
          dead.add(b.id);
        }
      }
    }
  }
  if (dead.size) state.units = state.units.filter((u) => !dead.has(u.id));
}

function artillery(state: GameState, dt: number): void {
  const dead = new Set<number>();
  for (const id in state.towers) {
    const tower = state.towers[id]!;
    if (tower.kind !== 'artillery' || tower.owner === 'neutral') continue;
    tower.artilleryCooldownMs = Math.max(0, tower.artilleryCooldownMs - dt);
    if (tower.artilleryCooldownMs > 0) continue;
    let best: Unit | undefined;
    let bestDist: number = C.ARTILLERY_RANGE;
    for (const u of state.units) {
      if (u.owner === tower.owner || dead.has(u.id)) continue;
      const p = unitPosition(state, u);
      const d = Math.hypot(p.x - tower.x, p.y - tower.y);
      if (d <= bestDist && (best === undefined || d < bestDist)) {
        best = u;
        bestDist = d;
      }
    }
    if (best) {
      kill(state, best, 'artillery');
      dead.add(best.id);
      tower.artilleryCooldownMs = C.ARTILLERY_COOLDOWN_MS;
    }
  }
  if (dead.size) state.units = state.units.filter((u) => !dead.has(u.id));
}

/**
 * True while the link's lane carries a shield: at least one unit of the link owner walking `from → to`
 * and at least one unit of another owner walking the other way. Opposing streams cancel 1:1 on a lane
 * (GDD §2.0b rule 10), so while this holds the link lands nothing — the play screen uses it to tell the
 * player a stream is stuck (BUG-13). Pure read; units of the same owner never shield each other.
 */
export function laneStalemate(state: Pick<GameState, 'units'>, link: Pick<Link, 'owner' | 'from' | 'to' | 'roadId'>): boolean {
  let outbound = false;
  let opposing = false;
  for (const u of state.units) {
    if (u.roadId !== link.roadId) continue;
    if (u.owner === link.owner) {
      if (u.from === link.from && u.to === link.to) outbound = true;
    } else if (u.from === link.to && u.to === link.from) {
      opposing = true;
    }
    if (outbound && opposing) return true;
  }
  return false;
}

function arrive(state: GameState, tower: Tower, unit: Unit): void {
  state.events.push({ type: 'landed', towerId: tower.id, owner: unit.owner, weight: unit.weight, hostile: tower.owner !== unit.owner });
  if (tower.owner === unit.owner) {
    tower.units = Math.min(capacityOf(tower, state), tower.units + unit.weight);
    tryAutoUpgrade(state, tower); // reinforcements count toward the auto-upgrade too
    return;
  }
  let damage: number;
  let consumedForDefenders: number;
  if (tower.kind === 'fortress') {
    const accBefore = tower.defenceAcc;
    const acc = accBefore + unit.weight / C.FORTRESS_DEFENCE;
    damage = Math.floor(acc + EPS);
    tower.defenceAcc = acc - damage;
    consumedForDefenders = Math.max(0, (tower.units - accBefore) * C.FORTRESS_DEFENCE);
  } else {
    damage = unit.weight;
    consumedForDefenders = tower.units;
  }
  // Rules v2.1 "Under fire": every hostile landing on an owned tower pauses its production (a
  // fortress half-hit that removes nobody counts too); lane deaths never reach here. Neutral towers
  // never generate and are left unmarked. A capture below clears it: the new owner starts fresh.
  if (tower.owner !== 'neutral') tower.underFireUntilMs = state.time + C.UNDER_FIRE_MS;
  if (damage > tower.units) {
    const from = tower.owner;
    tower.owner = unit.owner;
    tower.units = Math.max(1, Math.round(unit.weight - consumedForDefenders));
    tower.genAccMs = 0;
    tower.artilleryCooldownMs = 0;
    tower.defenceAcc = 0;
    tower.underFireUntilMs = 0;
    state.events.push({ type: 'capture', towerId: tower.id, by: unit.owner, from });
    // The old owner's streams out of this tower die with it (the new owner may re-link).
    for (const link of linksFrom(state, tower.id)) removeLink(state, link, 'sourceLost');
  } else {
    tower.units -= damage;
  }
}

function arrivals(state: GameState): void {
  const dead = new Set<number>();
  for (const u of state.units) {
    if (u.progress < 1 - EPS) continue;
    const tower = state.towers[u.to];
    if (tower) arrive(state, tower, u);
    dead.add(u.id);
  }
  if (dead.size) state.units = state.units.filter((u) => !dead.has(u.id));
}

/** Advance the simulation by exactly one tick. Callers accumulate real time and call this per TICK_MS. */
export function step(state: GameState, dtMs: number = C.TICK_MS): void {
  const outcomeBefore = getOutcome(state);
  state.events = [];
  state.time += dtMs;

  // 1) boosters expire
  state.boosters = state.boosters.filter((b) => b.untilMs >= state.time);
  // 2) generation (+ auto-upgrade); linked towers skip it
  generation(state, dtMs);
  // 3) links: auto-unlink, then every link emits its stream
  pruneLinks(state);
  emit(state, dtMs);
  // 4) movement
  const prev = move(state, dtMs);
  // 5) mines
  hazards(state, prev);
  // 6) clashes
  clashes(state, prev);
  // 7) artillery
  artillery(state, dtMs);
  // 8) arrivals (+ auto-upgrade on reinforcement, links of a captured source removed)
  arrivals(state);
  // 8b) a target filled or a source emptied by this tick's arrivals releases its links now
  pruneLinks(state);
  // 9) outcome, emitted once
  if (outcomeBefore === 'playing') {
    const now = getOutcome(state);
    if (now !== 'playing') {
      const ev: SimEvent = { type: now, timeMs: state.time };
      state.events.push(ev);
    }
  }
}
