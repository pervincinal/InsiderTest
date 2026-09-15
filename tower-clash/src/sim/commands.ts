import type { Command, GameState } from './types';
import { C } from './constants';
import { roadIdFor } from './create';
import { linksFrom, maxLinksOf, removeLink, unitPosition } from './step';

/**
 * Apply a command to the state. Invalid commands (wrong owner, no road, not enough units, …)
 * are ignored silently — the sim never throws on input.
 */
export function applyCommand(state: GameState, cmd: Command): void {
  if (cmd.owner === 'neutral') return;
  switch (cmd.type) {
    case 'link':
      link(state, cmd);
      return;
    case 'unlink':
      unlink(state, cmd);
      return;
    case 'sendUnits':
      sendUnits(state, cmd);
      return;
    case 'upgrade':
      upgrade(state, cmd);
      return;
    case 'cutBridge':
      cutBridge(state, cmd);
      return;
    case 'booster':
      booster(state, cmd);
      return;
  }
}

/**
 * Rules v2: start a persistent attack stream `from → to`. Valid when the owner holds `from`, an uncut
 * road joins the two towers, the link does not already exist and `from` is under its per-level limit.
 */
function link(state: GameState, cmd: Extract<Command, { type: 'link' }>): void {
  const from = state.towers[cmd.from];
  const to = state.towers[cmd.to];
  if (!from || !to || from === to || from.owner !== cmd.owner) return;
  const road = state.roads[roadIdFor(from.id, to.id)];
  if (!road || road.cut) return;
  const existing = linksFrom(state, from.id);
  if (existing.some((l) => l.to === to.id)) return;
  if (existing.length >= maxLinksOf(from)) return;
  state.links.push({ owner: cmd.owner, from: from.id, to: to.id, roadId: road.id, createdMs: state.time });
  state.events.push({ type: 'linked', owner: cmd.owner, from: from.id, to: to.id });
}

/** Rules v2: remove one (`to` given) or every link leaving `from`, if they belong to the owner. */
function unlink(state: GameState, cmd: Extract<Command, { type: 'unlink' }>): void {
  for (const l of linksFrom(state, cmd.from)) {
    if (l.owner !== cmd.owner) continue;
    if (cmd.to !== undefined && l.to !== cmd.to) continue;
    removeLink(state, l, 'manual');
  }
}

/** @deprecated legacy one-shot send kept for the AI during the transition to links. */
function sendUnits(state: GameState, cmd: Extract<Command, { type: 'sendUnits' }>): void {
  const from = state.towers[cmd.from];
  const to = state.towers[cmd.to];
  if (!from || !to || from === to || from.owner !== cmd.owner) return;
  const road = state.roads[roadIdFor(from.id, to.id)];
  if (!road || road.cut) return;
  const ratio = cmd.ratio === undefined ? 1 : Math.min(1, Math.max(0, cmd.ratio));
  const unitKind = from.kind === 'tankFactory' ? 'tank' : 'infantry';
  const weight = unitKind === 'tank' ? C.TANK_WEIGHT : C.INFANTRY_WEIGHT;
  const count = Math.floor(Math.floor(from.units * ratio) / weight);
  if (count <= 0) return;
  from.units -= count * weight;
  const existing = state.queues.find(
    (q) => q.owner === cmd.owner && q.from === from.id && q.to === to.id && q.unitKind === unitKind,
  );
  if (existing) {
    existing.remaining += count;
    return;
  }
  state.queues.push({
    owner: cmd.owner,
    from: from.id,
    to: to.id,
    roadId: road.id,
    remaining: count,
    unitKind,
    nextLeaveMs: state.time,
  });
}

/**
 * @deprecated Rules v2: towers upgrade automatically when full (see `tryAutoUpgrade`). The command is
 * still accepted for save/replay compatibility but changes nothing.
 */
function upgrade(state: GameState, cmd: Extract<Command, { type: 'upgrade' }>): void {
  const tower = state.towers[cmd.towerId];
  if (!tower || tower.owner !== cmd.owner) return;
  // intentionally a no-op
}

function cutBridge(state: GameState, cmd: Extract<Command, { type: 'cutBridge' }>): void {
  const road = state.roads[cmd.roadId];
  if (!road || road.kind !== 'bridge' || road.cut) return;
  const a = state.towers[road.a];
  const b = state.towers[road.b];
  if (a?.owner !== cmd.owner && b?.owner !== cmd.owner) return;
  road.cut = true;
  const survivors = [];
  for (const u of state.units) {
    if (u.roadId !== road.id) {
      survivors.push(u);
      continue;
    }
    const pos = unitPosition(state, u);
    state.events.push({ type: 'unitDied', x: pos.x, y: pos.y, owner: u.owner, cause: 'bridge' });
  }
  state.units = survivors;
  state.queues = state.queues.filter((q) => q.roadId !== road.id);
  for (const l of state.links.filter((l) => l.roadId === road.id)) removeLink(state, l, 'roadCut');
  state.events.push({ type: 'bridgeCut', roadId: road.id });
}

function booster(state: GameState, cmd: Extract<Command, { type: 'booster' }>): void {
  switch (cmd.booster) {
    case 'overdrive':
      state.boosters.push({ type: 'overdrive', owner: cmd.owner, untilMs: state.time + C.OVERDRIVE_MS });
      return;
    case 'freeze':
      state.boosters.push({ type: 'freeze', owner: cmd.owner, untilMs: state.time + C.FREEZE_MS });
      return;
    case 'airstrike': {
      if (cmd.towerId === undefined) return;
      const tower = state.towers[cmd.towerId];
      if (!tower || tower.owner === cmd.owner || tower.owner === 'neutral') return;
      tower.units = Math.max(0, tower.units - C.AIRSTRIKE_DAMAGE);
      return;
    }
  }
}
