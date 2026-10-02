import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { LEVEL_MAP, levelMapMinScroll } from '../../src/render/menuLayout';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData, SaveStorage } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen, StartOptions } from '../../src/ui/screens';
import { ResultScreen } from '../../src/ui/screens';
import { PlayScreen } from '../../src/ui/play';
import { LevelSelectScreen } from '../../src/ui/levelSelect';
import type { DailyChallenge } from '../../src/daily/challenge';
import { TWISTS, UNLOCK_AFTER_LEVEL, challengeFor } from '../../src/daily/challenge';
import { practiceResult, previousDayKey, yesterdayOffered } from '../../src/ui/daily';
import { setLanguage, t } from '../../src/ui/i18n';
import { makeLevel } from '../helpers';

/*
 * Yesterday's map (DAILY-6, GDD §7.3, ECONOMY.md §6.1): a second row under the daily card replays
 * `challengeFor(yesterday)` as practice — offered while the daily is unlocked and yesterday is
 * unwon; the run pays nothing, moves no streak, writes no best, milestone or achievement, and the
 * save is not written at all. No DOM: the app shell is a recorder.
 */

const DAY = '2026-09-27';
const YESTERDAY = '2026-09-26';
const pointer = (x: number, y: number) => ({ x, y, id: 1, timeMs: 0 });

function fakeApp(save: SaveData, day: { key: string } = { key: DAY }) {
  const starts: { levelId: number; seed?: number; opts?: StartOptions }[] = [];
  const nav: string[] = [];
  let current: Screen | null = null;
  const app: App = {
    view: {} as View,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {
      nav.push('title');
    },
    goLevels(notice?: string) {
      nav.push(notice ? `levels:${notice}` : 'levels');
    },
    goShop() {},
    goAchievements() {},
    startLevel(levelId, seed, opts) {
      starts.push({ levelId, seed, opts });
      return Promise.resolve(true);
    },
    go(screen) {
      current = screen;
    },
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => day.key,
    weekKey: () => '2026-09-21',
  };
  return { app, starts, nav, current: () => current };
}

/** Records every write so "nothing was written" is checkable. */
function recordingStorage(): SaveStorage & { writes: number } {
  const map = new Map<string, string>();
  return {
    writes: 0,
    getItem: (k) => map.get(k) ?? null,
    setItem(k, v) {
      this.writes += 1;
      map.set(k, v);
    },
    removeItem: (k) => void map.delete(k),
  };
}

/** Every tower becomes the player's: the next tick ends the match as a win (see daily.test.ts). */
function winNow(play: PlayScreen, clock: { now: number }): void {
  const state = play.state;
  for (const tw of Object.values(state.towers)) tw.owner = 'player';
  state.units = state.units.filter((u) => u.owner === 'player');
  state.links = state.links.filter((l) => l.owner === 'player');
  clock.now += 250;
  play.update(250, clock.now);
}

function yesterdayChallenge(): DailyChallenge {
  return { dayKey: YESTERDAY, levelId: 999, seed: 77, twist: TWISTS.find((tw) => tw.id === 'lean')! };
}

let save: SaveData;
let store: ReturnType<typeof recordingStorage>;
beforeEach(() => {
  store = recordingStorage();
  setSaveStorageForTests(store);
  save = defaultSave();
  save.gold = 100;
  save.crystals = 3;
  for (let id = 1; id <= UNLOCK_AFTER_LEVEL; id++) save.stars[String(id)] = 1;
});
afterEach(() => setSaveStorageForTests(null));

describe('visibility rule (yesterdayOffered)', () => {
  it('offered while the daily is unlocked and yesterday has no win', () => {
    expect(yesterdayOffered(save, DAY)).toBe(true);
    // won today but not yesterday: still offered
    save.challenge.best[DAY] = { stars: 2, timeMs: 60_000 };
    save.challenge.lastWinDay = DAY;
    expect(yesterdayOffered(save, DAY)).toBe(true);
  });

  it('hidden while the daily is locked', () => {
    delete save.stars[String(UNLOCK_AFTER_LEVEL)];
    expect(yesterdayOffered(save, DAY)).toBe(false);
  });

  it('hidden once yesterday is won (best entry or lastWinDay)', () => {
    save.challenge.best[YESTERDAY] = { stars: 1, timeMs: 90_000 };
    expect(yesterdayOffered(save, DAY)).toBe(false);
    delete save.challenge.best[YESTERDAY];
    save.challenge.lastWinDay = YESTERDAY;
    expect(yesterdayOffered(save, DAY)).toBe(false);
  });

  it('an older win does not hide it; yesterday crosses month boundaries', () => {
    save.challenge.best['2026-09-25'] = { stars: 3, timeMs: 30_000 };
    expect(yesterdayOffered(save, DAY)).toBe(true);
    save.challenge.best['2026-09-30'] = { stars: 3, timeMs: 30_000 };
    expect(yesterdayOffered(save, '2026-10-01')).toBe(false);
    expect(previousDayKey('2026-10-01')).toBe('2026-09-30');
  });
});

describe('level map row', () => {
  it('the row is up on the DAILY tab and carries challengeFor(yesterday); the map may pull down by its height', () => {
    const shell = fakeApp(save);
    const map = new LevelSelectScreen(shell.app);
    expect(map.getCardTab()).toBe('daily');
    expect(map.yesterday()).toEqual(challengeFor(YESTERDAY));
    map.setScroll(-10_000);
    expect(map.getScroll()).toBe(levelMapMinScroll(true));
    expect(levelMapMinScroll(true)).toBe(LEVEL_MAP.daily.y + LEVEL_MAP.daily.h - (LEVEL_MAP.yesterday.y + LEVEL_MAP.yesterday.h));
    expect(levelMapMinScroll(false)).toBe(0);
  });

  it('tap starts yesterday’s level, seed and twist with the practice flag', () => {
    const shell = fakeApp(save);
    const map = new LevelSelectScreen(shell.app);
    const r = LEVEL_MAP.yesterday;
    const p = pointer(r.x + r.w / 2, r.y + r.h / 2);
    map.down(p);
    map.up(p);
    const y = challengeFor(YESTERDAY);
    expect(shell.starts).toEqual([{ levelId: y.levelId, seed: y.seed, opts: { challenge: y, practice: true } }]);
  });

  it('the today card still starts today’s challenge without the flag', () => {
    const shell = fakeApp(save);
    const map = new LevelSelectScreen(shell.app);
    const r = LEVEL_MAP.daily;
    const p = pointer(r.x + r.w / 2, r.y + r.h - 10);
    map.down(p);
    map.up(p);
    expect(shell.starts).toEqual([{ levelId: challengeFor(DAY).levelId, seed: challengeFor(DAY).seed, opts: { challenge: challengeFor(DAY) } }]);
  });

  it('no row once yesterday is won: no practice start, scroll floor back to 0', () => {
    save.challenge.best[YESTERDAY] = { stars: 1, timeMs: 90_000 };
    const shell = fakeApp(save);
    const map = new LevelSelectScreen(shell.app);
    expect(map.yesterday()).toBeNull();
    map.setScroll(-10_000);
    expect(map.getScroll()).toBe(0);
    const r = LEVEL_MAP.yesterday;
    const p = pointer(r.x + r.w / 2, r.y + r.h / 2);
    map.down(p);
    map.up(p);
    expect(shell.starts.some((s) => s.opts?.practice)).toBe(false);
  });
});

describe('practice run (PlayScreen)', () => {
  it('a win leaves the save byte-identical and unwritten: no gold, crystals, streak, best or achievement', () => {
    save.challenge = { lastWinDay: DAY, streak: 6, best: { [DAY]: { stars: 2, timeMs: 61_000 } }, milestones: [3] };
    const before = JSON.stringify(save);
    const shell = fakeApp(save);
    const ch = yesterdayChallenge();
    const play = new PlayScreen(shell.app, makeLevel({ star3: 30_000, star2: 60_000 }), ch.seed, 20, { challenge: ch, practice: true });
    expect(play.practice).toBe(true);
    expect(play.state.modifiers).toEqual(ch.twist.modifiers);
    shell.app.go(play);
    winNow(play, { now: 0 });
    const result = shell.current() as ResultScreen;
    expect(result).toBeInstanceOf(ResultScreen);
    expect(result.info.ui.outcome).toBe('won');
    expect(result.info.daily).toEqual({ dayKey: YESTERDAY, won: true, stars: 3, firstWin: false, gold: 0, crystals: 0, milestone: 0, streak: 0, best: { stars: 3, timeMs: play.elapsedMs() }, practice: true });
    expect(result.info.earnings).toMatchObject({ gold: 0, crystals: 0 });
    expect(result.info.ui.coinsEarned).toBe(0);
    expect(result.info.achievements).toEqual({ unlocked: [], crystals: 0 });
    expect(result.extras().daily).toMatchObject({ practice: true, gold: 0, crystals: 0 });
    expect(result.extras().doubleGold).toBeNull();
    expect(JSON.stringify(save)).toBe(before);
    expect(store.writes).toBe(0);
  });

  it('a loss writes nothing either', () => {
    const before = JSON.stringify(save);
    const out = practiceResult(yesterdayChallenge(), { star3: 30_000, star2: 60_000 }, 'lost', 40_000);
    expect(out).toMatchObject({ won: false, stars: 0, gold: 0, crystals: 0, best: null, practice: true });
    expect(JSON.stringify(save)).toBe(before);
    expect(store.writes).toBe(0);
  });

  it('without the flag the same challenge books normally (control)', () => {
    const shell = fakeApp(save);
    const ch = yesterdayChallenge();
    const play = new PlayScreen(shell.app, makeLevel(), ch.seed, 20, { challenge: ch });
    expect(play.practice).toBe(false);
    shell.app.go(play);
    winNow(play, { now: 0 });
    expect((shell.current() as ResultScreen).info.daily?.practice).toBeUndefined();
    expect(save.challenge.best[YESTERDAY]).toBeDefined();
    expect(store.writes).toBeGreaterThan(0);
  });

  it('RETRY keeps the practice flag and seed; NEXT returns to the map; a further rollover sends RETRY to the map', async () => {
    const day = { key: DAY };
    const shell = fakeApp(save, day);
    const ch = yesterdayChallenge();
    const play = new PlayScreen(shell.app, makeLevel(), ch.seed, 20, { challenge: ch, practice: true });
    shell.app.go(play);
    winNow(play, { now: 0 });
    const result = shell.current() as ResultScreen;
    expect(result.info.ui.hasNext).toBe(true);
    play.restart();
    expect(shell.starts).toEqual([{ levelId: 999, seed: ch.seed, opts: { challenge: ch, practice: true } }]);
    result.key({ key: 'Enter' } as KeyboardEvent); // NEXT → the level map, never another level
    await new Promise((r) => setTimeout(r, 0));
    expect(shell.nav).toEqual(['levels']);
    day.key = '2026-09-28'; // yesterday's map is now two days old
    play.restart();
    expect(shell.nav).toEqual(['levels', `levels:${t('daily.newReady')}`]);
    expect(shell.starts).toHaveLength(1);
  });
});

describe('strings', () => {
  afterEach(async () => {
    await setLanguage('en');
  });

  it('the run opens with the no-reward toast', () => {
    const shell = fakeApp(save);
    const play = new PlayScreen(shell.app, makeLevel(), 1, 20, { challenge: yesterdayChallenge(), practice: true });
    expect(play.toast.opts(performance.now())?.text).toBe(t('daily.yesterdayNoReward'));
    const normal = new PlayScreen(shell.app, makeLevel(), 1, 20, { challenge: yesterdayChallenge() });
    expect(normal.toast.opts(performance.now())).toBeNull();
  });

  const expected = {
    en: ["Yesterday's map", "Yesterday's map — no reward"],
    az: ['Dünənki xəritə', 'Dünənki xəritə — mükafat yoxdur'],
    ru: ['Вчерашняя карта', 'Вчерашняя карта — без награды'],
    tr: ['Dünkü harita', 'Dünkü harita — ödül yok'],
  } as const;
  for (const [code, [row, toast]] of Object.entries(expected)) {
    it(`${code}: row label and no-reward line`, async () => {
      await setLanguage(code as keyof typeof expected);
      expect(t('daily.yesterday')).toBe(row);
      expect(t('daily.yesterdayNoReward')).toBe(toast);
      expect(t('daily.practice').length).toBeGreaterThan(0);
    });
  }
});
