import type { Command, GameState } from './types';
import { C } from './constants';
import { roadIdFor } from './create';
import { unitPosition } from './step';

/**
 * Apply a command to the state. Invalid commands (wrong owner, no road, not enough units, …)
 * are ignored silently — the sim never throws on input.
 */
export function applyCommand(state: GameState, cmd: Command): void {
  if (cmd.owner === 'neutral') return;
  switch (cmd.type) {
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

function upgrade(state: GameState, cmd: Extract<Command, { type: 'upgrade' }>): void {
  const tower = state.towers[cmd.towerId];
  if (!tower || tower.owner !== cmd.owner) return;
  const max = tower.kind === 'fortress' ? C.FORTRESS_MAX_LEVEL : C.MAX_LEVEL;
  if (tower.level >= max) return;
  const cost: number | undefined = (C.UPGRADE_COST as readonly number[])[tower.level];
  if (cost === undefined || tower.units < cost) return;
  tower.units -= cost;
  tower.level = (tower.level + 1) as 1 | 2 | 3;
  state.events.push({ type: 'upgrade', towerId: tower.id, level: tower.level });
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
