import { describe, expect, it } from 'vitest';
import { LEVEL_META, getLoadedLevel, levelIndex, loadAllLevels, loadLevel } from '../../src/levels/index';
import { checkManifest } from '../../scripts/lib/levelManifest';
import {
  bandFor,
  validateBand,
  validateConnectivity,
  validateLevel,
  validateLevels,
  validateOwnership,
  validateRoads,
  validateStars,
  validateTowers,
} from '../../scripts/lib/validateLevel';
import { makeLevel } from '../helpers';

const LEVELS = await loadAllLevels();

describe('shipped levels', () => {
  it('has at least one level', () => {
    expect(LEVELS.length).toBeGreaterThan(0);
  });

  it.each(LEVELS.map((level) => [level.id, level.name, level] as const))('level %i "%s" is valid', (_id, _name, level) => {
    expect(validateLevel(level)).toEqual([]);
  });

  it('has unique ids in ascending play order', () => {
    const reports = validateLevels(LEVELS);
    expect(reports.flatMap((r) => r.errors)).toEqual([]);
    const ids = LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it('loadLevel finds levels by id and caches them; unknown ids resolve undefined', async () => {
    const first = await loadLevel(1);
    expect(first?.name).toBe(LEVELS[0]?.name);
    expect(getLoadedLevel(1)).toBe(first);
    expect(await loadLevel(1)).toBe(first);
    expect(await loadLevel(9999)).toBeUndefined();
    expect(getLoadedLevel(9999)).toBeUndefined();
    expect(levelIndex(1)).toBe(0);
    expect(levelIndex(9999)).toBe(-1);
  });

  it('LEVEL_META mirrors the level files (PERF-2 manifest is not stale)', () => {
    expect(checkManifest()).toEqual([]);
    expect(LEVEL_META.map((m) => m.id)).toEqual(LEVELS.map((l) => l.id));
    for (const level of LEVELS) {
      const meta = LEVEL_META[levelIndex(level.id)]!;
      expect(meta).toEqual({ id: level.id, name: level.name, star3: level.star3, star2: level.star2 });
    }
  });

  it('every level starts with exactly one player tower group', () => {
    for (const level of LEVELS) {
      expect(level.towers.filter((t) => t.owner === 'player').length).toBeGreaterThanOrEqual(1);
      expect(validateOwnership(level)).toEqual([]);
    }
  });
});

describe('validator rules', () => {
  it('rejects star3 >= star2', () => {
    expect(validateStars(makeLevel({ star3: 60_000, star2: 60_000 }))).toHaveLength(1);
    expect(validateStars(makeLevel({ star3: 30_000, star2: 60_000 }))).toEqual([]);
  });

  it('rejects towers near the edge and towers too close together', () => {
    const level = makeLevel({
      towers: [
        { id: 'p', x: 50, y: 1000, owner: 'player', units: 10 },
        { id: 'e', x: 100, y: 1000, owner: 'enemy1', units: 10 },
      ],
    });
    const errors = validateTowers(level);
    expect(errors.some((e) => e.includes('≥ 90 px'))).toBe(true);
    expect(errors.some((e) => e.includes('min 150'))).toBe(true);
  });

  it('rejects unknown tower ids, self loops and duplicate roads', () => {
    const level = makeLevel({
      roads: [
        { a: 'p', b: 'e' },
        { a: 'e', b: 'p' },
        { a: 'p', b: 'p' },
        { a: 'p', b: 'ghost' },
      ],
    });
    const errors = validateRoads(level);
    expect(errors.some((e) => e.includes('duplicate road'))).toBe(true);
    expect(errors.some((e) => e.includes('same tower'))).toBe(true);
    expect(errors.some((e) => e.includes('"ghost" does not exist'))).toBe(true);
  });

  it('rejects a disconnected graph', () => {
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
        { id: 'n', x: 360, y: 700, owner: 'neutral', units: 5 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10 },
      ],
      roads: [{ a: 'p', b: 'n' }],
    });
    expect(validateConnectivity(level)).toHaveLength(1);
  });

  it('requires enemies to own towers and tower owners to be listed', () => {
    const missingTower = makeLevel({
      enemies: [
        { owner: 'enemy1', personality: 'rusher', aggression: 0.5 },
        { owner: 'enemy2', personality: 'turtle', aggression: 0.5 },
      ],
    });
    expect(validateOwnership(missingTower)).toEqual(['enemy "enemy2" is listed in enemies but owns no tower']);
    const unlisted = makeLevel({ enemies: [] });
    expect(validateOwnership(unlisted)).toEqual(['enemy "enemy1" owns a tower but is not listed in enemies']);
  });

  it('rejects a split player group', () => {
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1100, owner: 'player', units: 10 },
        { id: 'e', x: 360, y: 700, owner: 'enemy1', units: 10 },
        { id: 'q', x: 360, y: 300, owner: 'player', units: 10 },
      ],
      roads: [
        { a: 'p', b: 'e' },
        { a: 'e', b: 'q' },
      ],
    });
    expect(validateOwnership(level)).toEqual(['player towers must form one connected group at start (found 2)']);
  });

  it('applies band rules by level id', () => {
    expect(bandFor(0)).toBeUndefined();
    expect(bandFor(41)).toBeUndefined();
    expect(bandFor(8)?.maxEnemies).toBe(1);
    expect(bandFor(20)?.maxEnemies).toBe(2);
    expect(bandFor(40)?.maxEnemies).toBe(3);

    const fortressEarly = makeLevel({
      id: 3,
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, kind: 'fortress' },
      ],
    });
    expect(validateBand(fortressEarly)).toEqual(['band 1-8 does not allow tower kind "fortress" (tower e)']);
    expect(validateBand({ ...fortressEarly, id: 9 })).toEqual([]);

    const bridgeEarly = makeLevel({ id: 20, roads: [{ a: 'p', b: 'e', kind: 'bridge', mine: 5 }] });
    expect(validateBand(bridgeEarly)).toEqual(['band 17-24 does not allow bridges (road p-e)']);
    expect(validateBand({ ...bridgeEarly, id: 25 })).toEqual([]);

    const tankEarly = makeLevel({
      id: 17,
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, kind: 'tankFactory' },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10 },
      ],
      roads: [{ a: 'p', b: 'e', barrier: 12 }],
    });
    expect(validateBand(tankEarly)).toEqual(['band 17-24 does not allow tower kind "tankFactory" (tower p)']);

    const twoEnemiesEarly = makeLevel({
      id: 5,
      enemies: [
        { owner: 'enemy1', personality: 'rusher', aggression: 0.5 },
        { owner: 'enemy2', personality: 'rusher', aggression: 0.5 },
      ],
    });
    expect(validateBand(twoEnemiesEarly)).toEqual(['band 1-8 allows ≤ 1 enemies (got 2)']);
  });

  it('reports duplicate ids and bad play order across the list', () => {
    const a = makeLevel({ id: 2, name: 'A' });
    const b = makeLevel({ id: 2, name: 'B' });
    const c = makeLevel({ id: 1, name: 'C' });
    const errors = validateLevels([a, b, c]).flatMap((r) => r.errors);
    expect(errors).toContain('duplicate level id 2');
    expect(errors).toContain('play order: id 1 follows id 2');
  });
});
