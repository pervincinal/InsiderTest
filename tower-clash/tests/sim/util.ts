import type { Command, GameState, LevelDef, Owner, Unit, UnitKind } from '../../src/sim/types';
import { C } from '../../src/sim/constants';
import { roadIdFor } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { step } from '../../src/sim/step';
import { makeLevel } from '../helpers';

/** Run `n` fixed ticks. */
export function run(state: GameState, n: number): void {
  for (let i = 0; i < n; i++) step(state);
}

/** Step until `pred` holds (inclusive) or `maxMs` of sim time passed; returns the sim time when it held, or -1. */
export function runUntil(state: GameState, pred: (s: GameState) => boolean, maxMs: number): number {
  while (state.time < maxMs) {
    step(state);
    if (pred(state)) return state.time;
  }
  return -1;
}

/** Place a unit directly on the lane between `from` and `to` (bypasses streams; for rule tests). Throws if no lane joins them. */
export function spawn(
  state: GameState,
  opts: { owner: Owner; from: string; to: string; progress?: number; weight?: number; kind?: UnitKind },
): Unit {
  const roadId = roadIdFor(opts.from, opts.to);
  if (!state.roads[roadId]) throw new Error(`spawn: no lane ${roadId}`);
  const kind = opts.kind ?? (opts.weight === C.TANK_WEIGHT ? 'tank' : 'infantry');
  const unit: Unit = {
    id: state.nextUnitId++,
    owner: opts.owner,
    kind,
    weight: opts.weight ?? (kind === 'tank' ? C.TANK_WEIGHT : C.INFANTRY_WEIGHT),
    roadId,
    from: opts.from,
    to: opts.to,
    progress: opts.progress ?? 0,
    speed: kind === 'tank' ? C.UNIT_SPEED * C.TANK_SPEED_MUL : C.UNIT_SPEED,
  };
  state.units.push(unit);
  return unit;
}

export function unitsOf(state: GameState, owner: Owner): Unit[] {
  return state.units.filter((u) => u.owner === owner);
}

/**
 * Synthetic rules-v3 map shared by the determinism and snapshot tests: an artillery hub `a` blocks
 * the direct `p`–`e` line (it sits 10 px off it), a wall blocks `p`–`t`, and two mines guard `a`.
 * Lanes: a-e, a-p, a-t, e-t.
 */
export function scenarioLevel(): LevelDef {
  return makeLevel({
    towers: [
      { id: 'p', x: 100, y: 1100, owner: 'player', units: 20, level: 1 },
      { id: 'a', x: 360, y: 700, owner: 'neutral', units: 5, kind: 'artillery' },
      { id: 'e', x: 600, y: 300, owner: 'enemy1', units: 12, kind: 'fortress' },
      { id: 't', x: 100, y: 300, owner: 'enemy1', units: 10, kind: 'tankFactory' },
    ],
    obstacles: [{ kind: 'wall', points: [{ x: 0, y: 700 }, { x: 200, y: 700 }] }],
    mines: [
      { x: 230, y: 900, charges: 2 }, // on a-p
      { x: 480, y: 500, charges: 3 }, // on a-e
    ],
  });
}

/** Command script for `scenarioLevel` (tick → command): links, boosters, a legacy no-op and an airstrike. */
export const SCENARIO_SCRIPT: [number, Command][] = [
  [0, { type: 'link', owner: 'player', from: 'p', to: 'a' }],
  [0, { type: 'link', owner: 'enemy1', from: 't', to: 'a' }],
  [40, { type: 'link', owner: 'enemy1', from: 'e', to: 'a' }],
  [60, { type: 'upgrade', owner: 'player', towerId: 'p' }], // rules v2: ignored
  [80, { type: 'sendUnits', owner: 'player', from: 'p', to: 'a' }], // rules v3: ignored
  [120, { type: 'booster', owner: 'player', booster: 'overdrive' }],
  [300, { type: 'booster', owner: 'player', booster: 'freeze' }],
  [340, { type: 'unlink', owner: 'player', from: 'p' }],
  [360, { type: 'booster', owner: 'player', booster: 'airstrike', towerId: 't' }],
  [400, { type: 'link', owner: 'player', from: 'p', to: 'a' }],
  [440, { type: 'link', owner: 'player', from: 'a', to: 'e' }],
];

/** Apply the script's commands for `tick` (sim time = tick × 50 ms before the step), then step. */
export function scriptedTick(state: GameState, tick: number): void {
  for (const [at, cmd] of SCENARIO_SCRIPT) if (at === tick) applyCommand(state, cmd);
  step(state);
}
