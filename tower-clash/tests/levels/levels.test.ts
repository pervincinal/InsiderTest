import { describe, expect, it } from 'vitest';
import { LEVEL_META, getLoadedLevel, levelIndex, loadAllLevels, loadLevel } from '../../src/levels/index';
import { checkManifest } from '../../scripts/lib/levelManifest';
import {
  FIRST_MINE_LEVEL,
  FIRST_OBSTACLE_LEVEL,
  LANE_WARNING_FROM_LEVEL,
  LEVEL_TEXT_FIELDS,
  MIN_ATTACK_LANES,
  LEVEL_TEXT_LANGS,
  MINE_TOWER_CLEARANCE,
  OBSTACLE_TOWER_CLEARANCE,
  bandFor,
  laneKeys,
  laneWarnings,
  translationMaxLength,
  translationWarnings,
  validateBand,
  validateConnectivity,
  validateFields,
  validateLevel,
  validateLevels,
  validateMines,
  validateObstacles,
  validateOwnership,
  validateStars,
  validateTowers,
  validateTranslations,
} from '../../scripts/lib/validateLevel';
import type { AuthoredLevel } from '../../scripts/lib/validateLevel';
import type { LevelDef, MineDef, ObstacleDef, TowerDef } from '../../src/sim/types';
import { levelLesson, levelName } from '../../src/ui/i18n';
import { makeLevel, wall } from '../helpers';

const LEVELS = await loadAllLevels();

/** Player `p` at the bottom, enemy `e` at the top, neutral `n` between them but off the p–e line. */
const triangle = (over: Partial<LevelDef> = {}): LevelDef =>
  makeLevel({
    towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
      { id: 'n', x: 150, y: 700, owner: 'neutral', units: 5 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10 },
    ],
    ...over,
  });

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

  it('carries no v2 road data and follows the obstacle / mine bands (rules v3)', () => {
    for (const level of LEVELS) {
      expect('roads' in level, `level ${level.id} still has roads`).toBe(false);
      expect(laneKeys(level).length, `level ${level.id} has lanes`).toBeGreaterThan(0);
      if (level.id < FIRST_OBSTACLE_LEVEL) expect(level.obstacles ?? [], `level ${level.id} obstacles`).toEqual([]);
      if (level.id < FIRST_MINE_LEVEL) expect(level.mines ?? [], `level ${level.id} mines`).toEqual([]);
      for (const o of level.obstacles ?? []) expect(o.points.length).toBeGreaterThanOrEqual(o.kind === 'rock' ? 1 : 2);
      for (const m of level.mines ?? []) expect(Number.isInteger(m.charges) && m.charges > 0).toBe(true);
    }
    // the first wall is the lesson of level 5; the first mine is the lesson of level 17
    expect(LEVELS.find((l) => l.id === FIRST_OBSTACLE_LEVEL)?.obstacles?.length ?? 0).toBeGreaterThan(0);
    expect(LEVELS.find((l) => l.id === FIRST_MINE_LEVEL)?.mines?.length ?? 0).toBeGreaterThan(0);
  });

  it('derives the tutorial lane graphs from geometry (a tower in the way blocks the line)', () => {
    const supplyLine = LEVELS.find((l) => l.id === 2)!;
    expect(laneKeys(supplyLine)).not.toContain('foe-home'); // mid stands on the home–foe line
    expect(laneKeys(supplyLine)).toEqual(expect.arrayContaining(['foe-mid', 'home-mid', 'foe-side', 'home-side'])); // the side tower is the way around
    const aroundTheWall = LEVELS.find((l) => l.id === 5)!;
    expect(laneKeys(aroundTheWall)).not.toContain('foe-home'); // the wall blocks the straight line
    expect(laneKeys(aroundTheWall)).toContain('home-west1');
    expect(laneKeys(aroundTheWall)).toContain('foe-west2');
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
      const { name_az, name_ru, name_tr } = level as AuthoredLevel;
      expect(meta).toEqual({ id: level.id, name: level.name, name_az, name_ru, name_tr, star3: level.star3, star2: level.star2 });
    }
  });

  it('every level carries az / ru / tr names and lessons within the length limit (I18N-2)', () => {
    for (const level of LEVELS as AuthoredLevel[]) {
      expect(translationWarnings(level), `level ${level.id}`).toEqual([]);
      expect(validateTranslations(level), `level ${level.id}`).toEqual([]);
      for (const field of LEVEL_TEXT_FIELDS) {
        for (const lang of LEVEL_TEXT_LANGS) {
          const v = level[`${field}_${lang}`];
          expect(typeof v, `level ${level.id} ${field}_${lang}`).toBe('string');
          expect(v!.trim().length, `level ${level.id} ${field}_${lang} empty`).toBeGreaterThan(0);
          expect(v, `level ${level.id} ${field}_${lang} is untranslated`).not.toBe(level[field]);
          expect(v!.length, `level ${level.id} ${field}_${lang} length`).toBeLessThanOrEqual(translationMaxLength(level[field].length));
        }
      }
      // the helpers pick the translation and never return English for a translated level
      expect(levelName(level, 'ru')).toBe(level.name_ru);
      expect(levelLesson(level, 'tr')).toBe(level.lesson_tr);
      expect(levelName(level, 'en')).toBe(level.name);
    }
    // translated names are unique per language (they label the level-select node)
    for (const lang of LEVEL_TEXT_LANGS) {
      const names = (LEVELS as AuthoredLevel[]).map((l) => l[`name_${lang}`]);
      expect(new Set(names).size, `${lang} names unique`).toBe(names.length);
    }
  });

  it('no lesson or name uses the v2 road vocabulary', () => {
    const v2 = /\b(roads?|bridges?|barriers?|waypoints?|drawbridge)\b/i;
    for (const level of LEVELS) {
      expect(level.name, `level ${level.id} name`).not.toMatch(v2);
      expect(level.lesson, `level ${level.id} lesson`).not.toMatch(v2);
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
  it('checks translations only when present: non-empty and at most EN + 20 %', () => {
    const base = makeLevel({ id: 5, name: 'Around the Wall', lesson: 'Walls block the line: go around' });
    expect(validateTranslations(base)).toEqual([]);
    expect(translationWarnings(base)).toEqual(['name not translated: az, ru, tr', 'lesson not translated: az, ru, tr']);
    expect(validateLevel(base), 'missing translations never fail').toEqual([]);

    const partial: AuthoredLevel = { ...base, name_ru: 'Обойди стену', lesson_ru: 'Стена перекрывает линию: обойди' };
    expect(validateTranslations(partial)).toEqual([]);
    expect(translationWarnings(partial)).toEqual(['name not translated: az, tr', 'lesson not translated: az, tr']);
    expect(validateLevels([partial])[0]!.warnings).toEqual(['name not translated: az, tr', 'lesson not translated: az, tr']);
    expect(validateLevels([partial])[0]!.errors).toEqual([]);

    expect(translationMaxLength(10)).toBe(12);
    expect(translationMaxLength(9)).toBe(11);
    const tooLong: AuthoredLevel = { ...base, name_az: 'x'.repeat(translationMaxLength(base.name.length) + 1) };
    expect(validateTranslations(tooLong)).toEqual([`name_az is ${tooLong.name_az!.length} characters, max ${translationMaxLength(base.name.length)} (name + 20 %)`]);
    expect(validateLevel(tooLong)).toHaveLength(1);
    const empty: AuthoredLevel = { ...base, lesson_tr: '  ' };
    expect(validateTranslations(empty)).toEqual(['lesson_tr must be a non-empty string when present']);
    const wrongType = { ...base, name_ru: 7 } as unknown as AuthoredLevel;
    expect(validateTranslations(wrongType)).toEqual(['name_ru must be a non-empty string when present']);
  });

  it('warns (never fails) about non-player towers with fewer than MIN_ATTACK_LANES lanes from band 2 on', () => {
    // p sees e and n; n stands between e and nothing else: e has 2 lanes, n has 2 lanes
    const towers: TowerDef[] = [
      { id: 'p', x: 360, y: 1100, owner: 'player', units: 10, level: 1 },
      { id: 'n', x: 150, y: 700, owner: 'neutral', units: 5 },
      { id: 'e', x: 360, y: 300, owner: 'enemy1', units: 10, level: 1 },
    ];
    const band2 = makeLevel({ id: LANE_WARNING_FROM_LEVEL, towers });
    expect(laneWarnings(band2)).toEqual([
      `tower n (neutral) has 2 clear lane(s), fewer than ${MIN_ATTACK_LANES}: a defender can shield every lane to it`,
      `tower e (enemy1) has 2 clear lane(s), fewer than ${MIN_ATTACK_LANES}: a defender can shield every lane to it`,
    ]);
    expect(validateLevel(band2), 'a warning is not an error').toEqual([]);
    const report = validateLevels([band2])[0]!;
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual(expect.arrayContaining(laneWarnings(band2)));
    expect(laneWarnings(makeLevel({ id: LANE_WARNING_FROM_LEVEL - 1, towers })), 'band 1 is exempt').toEqual([]);
    // a wall that cuts p off from e leaves e with one lane and is still only a warning
    const walled = makeLevel({ id: LANE_WARNING_FROM_LEVEL, towers, obstacles: [wall(250, 600, 470, 600)] });
    expect(laneWarnings(walled)).toContain(`tower e (enemy1) has 1 clear lane(s), fewer than ${MIN_ATTACK_LANES}: a defender can shield every lane to it`);
    // four lanes: no warning
    const open = makeLevel({
      id: LANE_WARNING_FROM_LEVEL,
      towers: [
        ...towers,
        { id: 'w', x: 570, y: 700, owner: 'neutral', units: 5 },
        { id: 's', x: 570, y: 1000, owner: 'neutral', units: 5 },
        { id: 'x', x: 150, y: 1000, owner: 'neutral', units: 5 },
      ],
    });
    expect(laneWarnings(open).filter((w) => w.startsWith('tower e '))).toEqual([]);
  });

  it('rejects duplicate translated names across levels', () => {
    const a: AuthoredLevel = { ...makeLevel({ id: 1, name: 'Alpha' }), name_tr: 'Aynı' };
    const b: AuthoredLevel = { ...makeLevel({ id: 2, name: 'Bravo' }), name_tr: 'Aynı' };
    const errors = validateLevels([a, b]).flatMap((r) => r.errors);
    expect(errors).toEqual(['duplicate level name_tr "Aynı"', 'duplicate level name_tr "Aynı"']);
  });

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

  it('rejects a level that still carries a v2 roads list', () => {
    const level = { ...makeLevel(), roads: [{ a: 'p', b: 'e' }] } as unknown as LevelDef;
    expect(validateFields(level)).toEqual(['roads are gone (rules v3): remove the list — lanes are derived from towers and obstacles']);
    expect(validateLevel(level)).toHaveLength(1);
  });

  it('derives lanes from geometry: a wall or a third tower blocks the straight line', () => {
    expect(laneKeys(makeLevel())).toEqual(['e-p']);
    expect(laneKeys(makeLevel({ obstacles: [wall(200, 700, 520, 700)] }))).toEqual([]);
    // the neutral sits off the p–e line, so all three pairs are lanes …
    expect(laneKeys(triangle())).toEqual(['e-n', 'e-p', 'n-p']);
    // … until it stands on it (within TOWER_BLOCK_RADIUS)
    const inTheWay = triangle({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
        { id: 'n', x: 380, y: 700, owner: 'neutral', units: 5 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10 },
      ],
    });
    expect(laneKeys(inTheWay)).toEqual(['e-n', 'n-p']);
  });

  it('rejects a disconnected graph and isolated towers', () => {
    // a wall across the whole map: nothing south of it can reach the enemy
    const cut = triangle({ obstacles: [wall(0, 550, 720, 550)] });
    expect(validateConnectivity(cut)).toEqual([
      'tower e is isolated: no clear lane to any other tower',
      'not every tower is reachable from p through clear lanes: {e}',
    ]);
    // a wall that only cuts one of the two ways to e still leaves e reachable through n
    expect(validateConnectivity(triangle({ obstacles: [wall(300, 700, 420, 700)] }))).toEqual([]);
    // a rock ring around the neutral leaves it with no lane at all
    const ringed = triangle({
      obstacles: [
        { kind: 'wall', points: [{ x: 60, y: 610 }, { x: 240, y: 610 }, { x: 240, y: 790 }, { x: 60, y: 790 }, { x: 60, y: 610 }] },
      ],
    });
    const errors = validateConnectivity(ringed);
    expect(errors).toContain('tower n is isolated: no clear lane to any other tower');
    expect(errors).toContain('not every tower is reachable from p through clear lanes: {n}');
    expect(validateConnectivity(triangle())).toEqual([]);
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

  it('rejects a split player group (player towers joined only through a foreign tower)', () => {
    const level = makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1100, owner: 'player', units: 10 },
        { id: 'e', x: 360, y: 700, owner: 'enemy1', units: 10 },
        { id: 'q', x: 360, y: 300, owner: 'player', units: 10 },
      ],
    });
    expect(validateOwnership(level)).toEqual(['player towers must form one connected group at start (found 2)']);
    const joined = makeLevel({
      towers: [
        { id: 'p', x: 200, y: 1100, owner: 'player', units: 10 },
        { id: 'e', x: 360, y: 700, owner: 'enemy1', units: 10 },
        { id: 'q', x: 520, y: 1100, owner: 'player', units: 10 },
      ],
    });
    expect(validateOwnership(joined)).toEqual([]);
  });

  it('validates obstacle shape, placement and tower clearance', () => {
    const check = (o: unknown) => validateObstacles(triangle({ obstacles: [o as ObstacleDef] }));
    expect(check({ kind: 'hedge', points: [{ x: 100, y: 500 }, { x: 200, y: 500 }] })).toEqual([
      'obstacles[0]: kind "hedge" is not an obstacle kind (wall | water | rock)',
    ]);
    expect(check({ kind: 'wall', points: [{ x: 100, y: 500 }] })).toEqual(['obstacles[0]: needs ≥ 2 points (a rock may be a single point), got 1']);
    expect(check({ kind: 'rock', points: [{ x: 500, y: 550 }] })).toEqual([]);
    expect(check({ kind: 'wall', points: [{ x: 100, y: 500 }, { x: 'b', y: 500 }] })).toEqual(['obstacles[0]: points[1] must be {x, y} with finite numbers']);
    expect(check({ kind: 'wall', points: [{ x: 100, y: 500 }, { x: 200, y: 500 }], width: 0 })).toEqual(['obstacles[0]: width must be a positive number (got 0)']);
    // walls must stay inside the map; water may run up to EDGE_MARGIN off-map
    expect(check({ kind: 'wall', points: [{ x: -20, y: 500 }, { x: 200, y: 500 }] })).toEqual(['obstacles[0].points[0] (-20, 500) is outside the 720×1280 map']);
    expect(check({ kind: 'water', points: [{ x: -40, y: 500 }, { x: 760, y: 500 }] })).toEqual([]);
    expect(check({ kind: 'water', points: [{ x: -100, y: 500 }, { x: 760, y: 500 }] })).toEqual([
      'obstacles[0].points[0] (-100, 500) is outside the 720×1280 map (+90 px tolerance)',
    ]);
    // no obstacle within OBSTACLE_TOWER_CLEARANCE of a tower centre
    expect(check(wall(300, 950, 420, 950))).toEqual([`obstacles[0] (wall) is 50 px from tower p (min ${OBSTACLE_TOWER_CLEARANCE})`]);
    expect(check({ kind: 'rock', points: [{ x: 360, y: 460 }] })).toEqual([`obstacles[0] (rock) is 60 px from tower e (min ${OBSTACLE_TOWER_CLEARANCE})`]);
    expect(check(wall(300, 920, 420, 920))).toEqual([]);
  });

  it('validates mines: on the map, integer charges, away from towers, on a lane', () => {
    const check = (m: unknown) => validateMines(triangle({ id: 20, mines: [m as MineDef] }));
    expect(check({ x: 360, y: 700, charges: 5 })).toEqual([]); // on the p–e lane
    expect(check({ x: 360, y: 700, charges: 2.5 })).toEqual(['mines[0].charges must be a positive integer (got 2.5)']);
    expect(check({ x: 360, y: 700, charges: 0 })).toEqual(['mines[0].charges must be a positive integer (got 0)']);
    expect(check({ x: 800, y: 700, charges: 5 })).toEqual(['mines[0] (800, 700) is outside the 720×1280 map', 'mines[0] (800, 700) lies on no lane (within 30 px of none)']);
    expect(check({ x: 360, y: 980, charges: 5 })).toEqual([`mines[0] is 20 px from tower p (min ${MINE_TOWER_CLEARANCE})`]);
    expect(check({ x: 600, y: 900, charges: 5 })).toEqual(['mines[0] (600, 900) lies on no lane (within 30 px of none)']);
    // a mine 20 px off the lane is on it, 40 px off is not (MINE_RADIUS = 30)
    expect(check({ x: 380, y: 700, charges: 5 })).toEqual([]);
    expect(check({ x: 400, y: 700, charges: 5 })).toEqual(['mines[0] (400, 700) lies on no lane (within 30 px of none)']);
    // a mine behind a wall counts only for lanes that exist
    const walled = triangle({ id: 20, obstacles: [wall(250, 550, 470, 550)], mines: [{ x: 360, y: 700, charges: 5 }] });
    expect(validateMines(walled)).toEqual(['mines[0] (360, 700) lies on no lane (within 30 px of none)']);
  });

  it('applies band rules by level id', () => {
    expect(bandFor(0)).toBeUndefined();
    expect(bandFor(51)).toBeUndefined();
    expect(bandFor(8)?.maxEnemies).toBe(1);
    expect(bandFor(20)?.maxEnemies).toBe(2);
    expect(bandFor(40)?.maxEnemies).toBe(3);
    expect(bandFor(41)?.name).toBe('41-50');
    expect(bandFor(50)?.maxEnemies).toBe(3);
    expect(bandFor(4)?.obstacles).toBe(false);
    expect(bandFor(5)?.obstacles).toBe(true);
    expect(bandFor(16)?.mines).toBe(false);
    expect(bandFor(17)?.mines).toBe(true);

    const fortressEarly = makeLevel({
      id: 3,
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, kind: 'fortress' },
      ],
    });
    expect(validateBand(fortressEarly)).toEqual(['band 1-8 does not allow tower kind "fortress" (tower e)']);
    expect(validateBand({ ...fortressEarly, id: 9 })).toEqual([]);

    const wallEarly = triangle({ id: 4, obstacles: [wall(200, 850, 520, 850)] });
    expect(validateBand(wallEarly)).toEqual(['level 4 may not have obstacles (they start at level 5; got 1)']);
    expect(validateBand({ ...wallEarly, id: 5 })).toEqual([]);

    const mineEarly = makeLevel({ id: 16, mines: [{ x: 360, y: 700, charges: 5 }] });
    expect(validateBand(mineEarly)).toEqual(['band 9-16 does not allow mines (they start at level 17; got 1)']);
    expect(validateBand({ ...mineEarly, id: 17 })).toEqual([]);

    const tankEarly = makeLevel({
      id: 17,
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, kind: 'tankFactory' },
        { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10 },
      ],
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

  it('reports lane, obstacle and mine counts per level', () => {
    const report = validateLevels([triangle({ id: 20, obstacles: [wall(420, 850, 520, 850)], mines: [{ x: 360, y: 700, charges: 5 }] })])[0]!;
    expect(report.lanes).toBe(3);
    expect(report.obstacles).toBe(1);
    expect(report.mines).toBe(1);
    expect(report.errors).toEqual([]);
  });
});
