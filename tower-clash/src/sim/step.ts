import type { GameState, Link, Owner, PlayerModifiers, Road, SimEvent, Tower, Unit, UnitKind, UnlinkReason } from './types';
import { DEFAULT_MODIFIERS } from './types';
import { C } from './constants';
import { getOutcome } from './outcome';

/** Tolerance for floating-point accumulation of progress along a road. */
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

/** True when the tower currently drains through at least one link. */
export function isLinked(state: Pick<GameState, 'links'>, towerId: string): boolean {
  return state.links.some((l) => l.from === towerId);
}

/**
 * Rules v2 auto-upgrade: an owned L1/L2 tower whose garrison has reached its (modified) capacity
 * gains a level at once, keeping its garrison. A linked tower never upgrades (its garrison drains).
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

/** Point at fraction `t` (0..1) along the road's polyline, measured from road.a. */
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

/** Fraction along the road measured from road.a, whichever way the unit travels. */
function roadFraction(road: Road, unit: Unit, progress: number): number {
  return unit.from === road.a ? progress : 1 - progress;
}

/** World position of a unit, interpolated along its road. */
export function unitPosition(state: GameState, unit: Unit): { x: number; y: number } {
  const road = state.roads[unit.roadId];
  if (!road) return { x: 0, y: 0 };
  return roadPointAt(road, roadFraction(road, unit, unit.progress));
}

function kill(state: GameState, unit: Unit, cause: 'clash' | 'artillery' | 'mine' | 'barrier' | 'bridge'): void {
  const pos = unitPosition(state, unit);
  state.events.push({ type: 'unitDied', x: pos.x, y: pos.y, owner: unit.owner, cause });
}

function generation(state: GameState, dt: number): void {
  const overdrive = new Set<string>();
  const freezeCasters = new Set<string>();
  for (const b of state.boosters) {
    if (b.type === 'overdrive') overdrive.add(b.owner);
    else freezeCasters.add(b.owner);
  }
  for (const id in state.towers) {
    const tower = state.towers[id]!;
    if (tower.owner === 'neutral') continue;
    // Freeze stops generation for every owner except the caster.
    let frozen = false;
    for (const caster of freezeCasters) if (caster !== tower.owner) frozen = true;
    if (frozen) continue;

    const cap = capacityOf(tower, state);
    if (tower.units >= cap) {
      tryAutoUpgrade(state, tower);
      tower.genAccMs = 0;
      continue;
    }
    let interval: number;
    let weight: number;
    switch (tower.kind) {
      case 'tankFactory':
        interval = C.TANK_GEN_MS;
        weight = C.TANK_WEIGHT;
        break;
      case 'artillery':
        interval = C.GEN_MS[tower.level] * C.ARTILLERY_GEN_MUL;
        weight = C.INFANTRY_WEIGHT;
        break;
      default:
        interval = C.GEN_MS[tower.level];
        weight = C.INFANTRY_WEIGHT;
    }
    // Player production bonus, by the tower's current owner (a captured tower switches rate at once).
    // Multiplicative with overdrive: interval ÷ productionMul, accumulation × OVERDRIVE_MUL.
    interval /= modifiersFor(tower.owner, state).productionMul;
    const mul = overdrive.has(tower.owner) ? C.OVERDRIVE_MUL : 1;
    tower.genAccMs += dt * mul;
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
 * Rules v2 auto-unlink: a link ends when its source changed owner (`sourceLost`), its road is cut or
 * gone (`roadCut`), or its target is the link owner's and sits at capacity (`targetFull`).
 */
function pruneLinks(state: GameState): void {
  for (const link of [...state.links]) {
    const from = state.towers[link.from];
    const to = state.towers[link.to];
    const road = state.roads[link.roadId];
    if (!from || !to || from.owner !== link.owner) removeLink(state, link, 'sourceLost');
    else if (!road || road.cut) removeLink(state, link, 'roadCut');
    else if (to.owner === link.owner && to.units >= capacityOf(to, state)) removeLink(state, link, 'targetFull');
  }
}

/**
 * Rules v2 draining: every tower with ≥ 1 link sends one unit every `LEAVE_INTERVAL_MS` into its
 * links round-robin (infantry; a tank factory sends a whole tank while it holds ≥ TANK_WEIGHT).
 * The timer keeps running while the garrison is empty (clamped to one interval) so a freshly
 * produced or arrived unit leaves on the same tick — a linked tower never grows.
 */
function drain(state: GameState, dt: number): void {
  for (const id in state.towers) {
    const tower = state.towers[id]!;
    const links = linksFrom(state, tower.id);
    if (links.length === 0) {
      tower.drainAccMs = 0;
      continue;
    }
    tower.drainAccMs += dt;
    while (tower.drainAccMs >= C.LEAVE_INTERVAL_MS) {
      let kind: UnitKind = 'infantry';
      let weight: number = C.INFANTRY_WEIGHT;
      if (tower.kind === 'tankFactory' && tower.units >= C.TANK_WEIGHT) {
        kind = 'tank';
        weight = C.TANK_WEIGHT;
      }
      if (tower.units < weight) {
        tower.drainAccMs = C.LEAVE_INTERVAL_MS; // stay armed: the next unit leaves as soon as it exists
        break;
      }
      tower.drainAccMs -= C.LEAVE_INTERVAL_MS;
      const link = links[tower.linkCursor % links.length]!;
      tower.linkCursor = (tower.linkCursor + 1) % links.length;
      tower.units -= weight;
      spawnUnit(state, tower.owner, kind, link.from, link.to, link.roadId);
    }
  }
}

/** @deprecated legacy `sendUnits` queues (one-shot sends); links are the rules-v2 path. */
function releaseQueues(state: GameState): void {
  const keep = [];
  for (const q of state.queues) {
    const road = state.roads[q.roadId];
    if (!road || road.cut) continue; // road destroyed under the queue: units are lost
    if (q.remaining > 0 && state.time >= q.nextLeaveMs) {
      spawnUnit(state, q.owner, q.unitKind, q.from, q.to, q.roadId);
      q.remaining -= 1;
      q.nextLeaveMs += C.LEAVE_INTERVAL_MS;
    }
    if (q.remaining > 0) keep.push(q);
  }
  state.queues = keep;
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

function hazards(state: GameState, prev: Map<number, number>): void {
  const dead = new Set<number>();
  for (const u of state.units) {
    const road = state.roads[u.roadId];
    if (!road || (road.barrier <= 0 && road.mine <= 0)) continue;
    const before = prev.get(u.id) ?? 0;
    const crossedMid = before < 0.5 && u.progress >= 0.5;
    if (!crossedMid) continue;
    if (road.barrier > 0) {
      if (road.barrier >= u.weight) {
        road.barrier -= u.weight;
        kill(state, u, 'barrier');
        dead.add(u.id);
        continue;
      }
      u.weight -= road.barrier;
      road.barrier = 0;
    }
    if (road.mine > 0) {
      if (road.mine >= u.weight) {
        road.mine -= u.weight;
        kill(state, u, 'mine');
        dead.add(u.id);
        continue;
      }
      road.mine = 0;
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

function arrive(state: GameState, tower: Tower, unit: Unit): void {
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
  if (damage > tower.units) {
    const from = tower.owner;
    tower.owner = unit.owner;
    tower.units = Math.max(1, Math.round(unit.weight - consumedForDefenders));
    tower.genAccMs = 0;
    tower.artilleryCooldownMs = 0;
    tower.defenceAcc = 0;
    tower.drainAccMs = 0;
    tower.linkCursor = 0;
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
  // 2) generation (+ auto-upgrade)
  generation(state, dtMs);
  // 3) links: auto-unlink, then drain one unit per LEAVE_INTERVAL_MS round-robin
  pruneLinks(state);
  drain(state, dtMs);
  // 3b) legacy queues release units
  releaseQueues(state);
  // 4) movement
  const prev = move(state, dtMs);
  // 5) hazards
  hazards(state, prev);
  // 6) clashes
  clashes(state, prev);
  // 7) artillery
  artillery(state, dtMs);
  // 8) arrivals (+ auto-upgrade on reinforcement, links of a captured source removed)
  arrivals(state);
  // 8b) a target filled by this tick's arrivals releases its supply lines now
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
