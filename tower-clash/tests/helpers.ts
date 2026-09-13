import type { LevelDef, TowerDef, RoadDef, EnemyDef } from '../src/sim/types';

/** Build a small level quickly for tests. Defaults: player tower `p`, enemy tower `e`, one road. */
export function makeLevel(over: Partial<LevelDef> & { towers?: TowerDef[]; roads?: RoadDef[]; enemies?: EnemyDef[] } = {}): LevelDef {
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
    roads: over.roads ?? [{ a: 'p', b: 'e' }],
    ...over,
  };
}
