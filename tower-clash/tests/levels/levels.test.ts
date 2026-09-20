import { describe, expect, it } from 'vitest';
import { LEVEL_META, getLoadedLevel, levelIndex, loadAllLevels, loadLevel } from '../../src/levels/index';
import { checkManifest } from '../../scripts/lib/levelManifest';
import {
  LEVEL_TEXT_FIELDS,
  LEVEL_TEXT_LANGS,
  bandFor,
  translationMaxLength,
  translationWarnings,
  validateBand,
  validateConnectivity,
  validateLevel,
  validateLevels,
  validateOwnership,
  validateRoads,
  validateStars,
  validateTowers,
  validateTranslations,
} from '../../scripts/lib/validateLevel';
import type { AuthoredLevel } from '../../scripts/lib/validateLevel';
import { levelLesson, levelName } from '../../src/ui/i18n';
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

  it('every level starts with exactly one player tower group', () => {
    for (const level of LEVELS) {
      expect(level.towers.filter((t) => t.owner === 'player').length).toBeGreaterThanOrEqual(1);
      expect(validateOwnership(level)).toEqual([]);
    }
  });
});

describe('validator rules', () => {
  it('checks translations only when present: non-empty and at most EN + 20 %', () => {
    const base = makeLevel({ id: 5, name: 'Two Roads', lesson: 'Hold one road while you push down the other' });
    expect(validateTranslations(base)).toEqual([]);
    expect(translationWarnings(base)).toEqual(['name not translated: az, ru, tr', 'lesson not translated: az, ru, tr']);
    expect(validateLevel(base), 'missing translations never fail').toEqual([]);

    const partial: AuthoredLevel = { ...base, name_ru: 'Две дороги', lesson_ru: 'Держи одну дорогу, пока давишь по другой' };
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
    expect(bandFor(51)).toBeUndefined();
    expect(bandFor(8)?.maxEnemies).toBe(1);
    expect(bandFor(20)?.maxEnemies).toBe(2);
    expect(bandFor(40)?.maxEnemies).toBe(3);
    expect(bandFor(41)?.name).toBe('41-50');
    expect(bandFor(50)?.maxEnemies).toBe(3);

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
