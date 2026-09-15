/**
 * Bridge cutting, shared by the reference player and the turtle personality. A cut is irreversible and
 * kills everything on the bridge, so the rule is conservative. For every uncut bridge with exactly one
 * endpoint owned by `self` (`home`; the far end is neutral or hostile) it cuts when all of:
 *   (a) ownership — `self` owns `home` (the sim refuses anything else);
 *   (b) threat — either a hostile column is on the bridge heading to `home` and what is heading to `home`
 *       altogether is at least the garrison it will have when the first unit lands plus the friendly
 *       support on its way (the cut must either drown a column that alone could take the tower, or turn a
 *       lost tower into a held one); or nothing is on the bridge yet but the far tower could send a
 *       column (`threatFrom`: its garrison, or a rival's column about to flip it) that `home` plus its
 *       support and `cover` could not stop — "about to send one" (enemy-owned far tower only; a rival
 *       column about to flip a neutral far tower is judged once it owns it);
 *   (c) own use — none of `self`'s units or queues are on the bridge, `self` has not committed units to
 *       it this tick (`usedRoads`), and every opponent tower reachable over uncut roads before the cut
 *       is still reachable after it within `MAX_DETOUR_HOPS` extra road hops (BFS from `self`'s towers
 *       over uncut roads): the last route to a remaining enemy tower is never cut, nor a bridge whose
 *       loss would send the next attack the long way round. Cuts chosen earlier in the same tick count
 *       as cut already.
 * Pure and deterministic: roads are visited in state order, no rng.
 */
import type { Command, GameState, Owner, Road, Tower } from '../sim/index';
import { C } from '../sim/index';
import {
  defenceMultiplier,
  incomingSupport,
  incomingThreat,
  neighbours,
  ownedTowers,
  projectedUnits,
  remainingMs,
  threatFrom,
  travelMsFor,
} from './common';

export interface BridgeCutOptions {
  /** Roads `self` has already committed units to this tick (commands not yet applied): never cut those. */
  usedRoads?: ReadonlySet<string>;
  /** Friendly weight `self` sent to each tower this tick (commands not yet applied): counts as support. */
  sentTo?: ReadonlyMap<string, number>;
  /**
   * Units friendly towers could still add to `home` before a column landing at `etaMs` arrives, for the
   * "about to send" case (the reference player answers an attack from its neighbours; a turtle does not).
   */
  cover?: (home: Tower, etaMs: number) => number;
  /** Also cut before anything is on the bridge, when the enemy garrison across it could take `home`. Default true. */
  preemptive?: boolean;
  /** Only bridges whose own endpoint passes this are considered (default: every own tower). */
  worthSaving?: (home: Tower) => boolean;
}

/** Hostile weight of `self` on `road` walking or queued toward `home`, with the earliest landing. */
export function columnOnBridge(state: GameState, road: Road, home: Tower, self: Owner): { weight: number; etaMs: number } {
  let weight = 0;
  let etaMs = Infinity;
  for (const u of state.units) {
    if (u.roadId !== road.id || u.to !== home.id || u.owner === self) continue;
    weight += u.weight;
    etaMs = Math.min(etaMs, remainingMs(state, u));
  }
  for (const q of state.queues) {
    if (q.roadId !== road.id || q.to !== home.id || q.owner === self) continue;
    weight += q.remaining * (q.unitKind === 'tank' ? C.TANK_WEIGHT : C.INFANTRY_WEIGHT);
    etaMs = Math.min(etaMs, travelMsFor(state, road, q.owner, q.unitKind));
  }
  return { weight, etaMs };
}

/** Does `self` have units walking or queued on the road (either direction)? */
export function ownUnitsOnRoad(state: GameState, road: Road, self: Owner): boolean {
  for (const u of state.units) if (u.roadId === road.id && u.owner === self) return true;
  for (const q of state.queues) if (q.roadId === road.id && q.owner === self) return true;
  return false;
}

/** A cut may lengthen the road to an opponent tower by at most this many hops. */
export const MAX_DETOUR_HOPS = 1;

/**
 * Road hops from `self`'s nearest tower to every opponent tower (not `self`, not neutral) reachable over
 * uncut roads not in `exclude`; unreachable towers are absent.
 */
export function opponentHops(state: GameState, self: Owner, exclude: ReadonlySet<string>): Map<string, number> {
  const hops = new Map<string, number>();
  const queue: string[] = [];
  for (const t of ownedTowers(state, self)) {
    hops.set(t.id, 0);
    queue.push(t.id);
  }
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    const d = hops.get(id)!;
    for (const n of neighbours(state, id)) {
      if (exclude.has(n.road.id) || hops.has(n.tower.id)) continue;
      hops.set(n.tower.id, d + 1);
      queue.push(n.tower.id);
    }
  }
  const out = new Map<string, number>();
  for (const [id, d] of hops) {
    const owner = state.towers[id]!.owner;
    if (owner !== self && owner !== 'neutral') out.set(id, d);
  }
  return out;
}

/**
 * Would every opponent tower still be reachable — within `MAX_DETOUR_HOPS` extra hops — with `road` cut
 * as well as `alreadyCut`?
 */
export function keepsRoutes(state: GameState, self: Owner, road: Road, alreadyCut: ReadonlySet<string>): boolean {
  const before = opponentHops(state, self, alreadyCut);
  const after = opponentHops(state, self, new Set([...alreadyCut, road.id]));
  for (const [id, d] of before) {
    const now = after.get(id);
    if (now === undefined || now > d + MAX_DETOUR_HOPS) return false;
  }
  return true;
}

/**
 * Should `self` cut `road` to protect `home` right now? Condition (b) above; `far` is the other endpoint.
 * Exported for tests; `bridgeCutCommands` is the rule.
 */
export function bridgeThreatens(state: GameState, self: Owner, road: Road, home: Tower, far: Tower, opts: BridgeCutOptions): boolean {
  const mult = defenceMultiplier(home);
  const support = incomingSupport(state, home.id) + (opts.sentTo?.get(home.id) ?? 0);
  const on = columnOnBridge(state, road, home, self);
  if (on.weight > 0) {
    const threat = incomingThreat(state, home.id); // everything heading to home, the bridge column included
    const defence = (projectedUnits(home, on.etaMs, state) + support) * mult;
    if (threat < defence) return false;
    return on.weight >= defence || threat - on.weight < defence;
  }
  // Nothing on the bridge: only an enemy garrison across it counts as "about to send" (a rival column
  // that is merely about to flip a neutral far tower is judged once it owns it).
  if (opts.preemptive === false || far.owner === 'neutral') return false;
  const n = neighbours(state, home.id).find((x) => x.road.id === road.id && x.tower.id === far.id);
  if (!n) return false;
  const src = threatFrom(state, self, n);
  if (!src) return false;
  const cover = opts.cover?.(home, src.etaMs) ?? 0;
  const defence = (projectedUnits(home, src.etaMs, state) + support + cover) * mult;
  return src.attackers >= defence;
}

/** Bridges `self` should cut this tick, in road order. */
export function bridgeCutCommands(state: GameState, self: Owner, opts: BridgeCutOptions = {}): Command[] {
  const cmds: Command[] = [];
  const cut = new Set<string>();
  for (const id in state.roads) {
    const road = state.roads[id]!;
    if (road.kind !== 'bridge' || road.cut) continue;
    const a = state.towers[road.a];
    const b = state.towers[road.b];
    if (!a || !b) continue;
    const home = a.owner === self ? a : b.owner === self ? b : undefined;
    if (!home || (opts.worthSaving && !opts.worthSaving(home))) continue; // (a)
    const far = home === a ? b : a;
    if (far.owner === self) continue; // a link between two own towers is never cut
    if (opts.usedRoads?.has(road.id) || ownUnitsOnRoad(state, road, self)) continue; // (c) own use
    if (!bridgeThreatens(state, self, road, home, far, opts)) continue; // (b)
    if (!keepsRoutes(state, self, road, cut)) continue; // (c) never the last route
    cut.add(road.id);
    cmds.push({ type: 'cutBridge', owner: self, roadId: road.id });
  }
  return cmds;
}
