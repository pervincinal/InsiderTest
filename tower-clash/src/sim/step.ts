import type { GameState, Road, SimEvent, Tower, Unit } from './types';
import { C } from './constants';
import { getOutcome } from './outcome';

/** Tolerance for floating-point accumulation of progress along a road. */
const EPS = 1e-9;

/** Maximum garrison (in weight) a tower can hold. */
export function capacityOf(tower: Tower): number {
  switch (tower.kind) {
    case 'barracks':
      return C.CAPACITY[tower.level];
    case 'fortress':
      return Math.floor(C.CAPACITY[tower.level] * C.FORTRESS_CAPACITY_MUL);
    case 'artillery':
      return C.ARTILLERY_CAPACITY;
    case 'tankFactory':
      return C.TANK_FACTORY_CAPACITY;
  }
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

    const cap = capacityOf(tower);
    if (tower.units >= cap) {
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
    const mul = overdrive.has(tower.owner) ? C.OVERDRIVE_MUL : 1;
    tower.genAccMs += dt * mul;
    while (tower.genAccMs >= interval && tower.units < cap) {
      tower.genAccMs -= interval;
      tower.units = Math.min(cap, tower.units + weight);
    }
    if (tower.units >= cap) tower.genAccMs = 0;
  }
}

function releaseQueues(state: GameState): void {
  const keep = [];
  for (const q of state.queues) {
    const road = state.roads[q.roadId];
    if (!road || road.cut) continue; // road destroyed under the queue: units are lost
    if (q.remaining > 0 && state.time >= q.nextLeaveMs) {
      const tank = q.unitKind === 'tank';
      state.units.push({
        id: state.nextUnitId++,
        owner: q.owner,
        kind: q.unitKind,
        weight: tank ? C.TANK_WEIGHT : C.INFANTRY_WEIGHT,
        roadId: q.roadId,
        from: q.from,
        to: q.to,
        progress: 0,
        speed: tank ? C.UNIT_SPEED * C.TANK_SPEED_MUL : C.UNIT_SPEED,
      });
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
    tower.units = Math.min(capacityOf(tower), tower.units + unit.weight);
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
    state.events.push({ type: 'capture', towerId: tower.id, by: unit.owner, from });
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
  // 2) generation
  generation(state, dtMs);
  // 3) queues release units
  releaseQueues(state);
  // 4) movement
  const prev = move(state, dtMs);
  // 5) hazards
  hazards(state, prev);
  // 6) clashes
  clashes(state, prev);
  // 7) artillery
  artillery(state, dtMs);
  // 8) arrivals
  arrivals(state);
  // 9) outcome, emitted once
  if (outcomeBefore === 'playing') {
    const now = getOutcome(state);
    if (now !== 'playing') {
      const ev: SimEvent = { type: now, timeMs: state.time };
      state.events.push(ev);
    }
  }
}
