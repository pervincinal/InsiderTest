import type { GameState, Owner, Unit, UnitKind } from '../../src/sim/types';
import { C } from '../../src/sim/constants';
import { roadIdFor } from '../../src/sim/create';
import { step } from '../../src/sim/step';

/** Run `n` fixed ticks. */
export function run(state: GameState, n: number): void {
  for (let i = 0; i < n; i++) step(state);
}

/** Place a unit directly on the road between `from` and `to` (bypasses queues; for rule tests). */
export function spawn(
  state: GameState,
  opts: { owner: Owner; from: string; to: string; progress?: number; weight?: number; kind?: UnitKind },
): Unit {
  const kind = opts.kind ?? (opts.weight === C.TANK_WEIGHT ? 'tank' : 'infantry');
  const unit: Unit = {
    id: state.nextUnitId++,
    owner: opts.owner,
    kind,
    weight: opts.weight ?? (kind === 'tank' ? C.TANK_WEIGHT : C.INFANTRY_WEIGHT),
    roadId: roadIdFor(opts.from, opts.to),
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
