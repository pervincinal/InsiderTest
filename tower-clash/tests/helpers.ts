import type { LevelDef, TowerDef, ObstacleDef, MineDef, EnemyDef } from '../src/sim/types';

/**
 * Build a small level quickly for tests (rules v3: towers + obstacles + mines, no roads).
 * Defaults: player tower `p` (360,1000) and enemy tower `e` (360,400), 600 px apart, one lane `e-p`.
 * Passing a `roads` key is an error in `createState` — build chokepoints with `obstacles` instead.
 */
export function makeLevel(
  over: Partial<LevelDef> & { towers?: TowerDef[]; obstacles?: ObstacleDef[]; mines?: MineDef[]; enemies?: EnemyDef[] } = {},
): LevelDef {
  return {
    id: 999,
    name: 'test',
    lesson: 'test',
    star3: 30_000,
    star2: 60_000,
    enemies: over.enemies ?? [{ owner: 'enemy1', personality: 'rusher', aggression: 0.5 }],
    towers: over.towers ?? [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
    ],
    ...over,
  };
}

/** A straight wall obstacle between two points (default width, GDD §2.0b rule 2). */
export function wall(x1: number, y1: number, x2: number, y2: number, width?: number): ObstacleDef {
  const def: ObstacleDef = { kind: 'wall', points: [{ x: x1, y: y1 }, { x: x2, y: y2 }] };
  if (width !== undefined) def.width = width;
  return def;
}
