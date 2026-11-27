import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { HudPlayUi } from '../../src/render/hud';
import { createAdSession } from '../../src/economy/adsFlow';
import type { LoadChunkOptions } from '../../src/lazyChunk';
import { RETRY_AFTER_MS, resetChunkFailuresForTests } from '../../src/lazyChunk';
import type { DailyChallenge, WeeklyChallenge } from '../../src/daily/challenge';
import { REWARD, TWISTS, WEEKLY_REWARD } from '../../src/daily/challenge';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen, StartOptions } from '../../src/ui/screens';
import { ResultScreen } from '../../src/ui/result';
import '../registerResult'; // PERF-11: the lazy result chunk is in — this file is about the challenge chunk only
import { PlayScreen, RESULT_BEAT_MS } from '../../src/ui/play';
import * as challengeRecord from '../../src/ui/challengeRecord';
import { CHALLENGE_CHUNK, challengeChunk, challengeChunkFailures, registerChallengeChunk } from '../../src/ui/challengeChunk';
import { challengeDone } from '../../src/ui/daily';
import { weeklyDone } from '../../src/ui/weekly';
import { t } from '../../src/ui/i18n';
import { makeLevel } from '../helpers';

/*
 * PERF-16: the Daily / Weekly result rules (src/ui/daily.ts + weekly.ts via src/ui/challengeRecord.ts) are a
 * lazy chunk (src/ui/challengeChunk.ts). tests/setup.ts registers it for every other file; here it starts out
 * missing and its download is driven by `net`: 'hold' keeps it in flight until `net.release()`, 'offline'
 * fails it, 'online' loads the real module. A challenge outcome must wait for it inside the result beat (no
 * visible change when it lands in time), never be lost or booked twice, say so on a failed download, and a
 * campaign match must never need it.
 */

const net = vi.hoisted(() => ({
  mode: 'online' as 'online' | 'offline' | 'hold',
  loads: 0,
  release: null as (() => void) | null,
}));
vi.mock('../../src/lazyChunk', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/lazyChunk')>();
  return {
    ...real,
    loadChunk: <T>(key: string, load: () => Promise<T>, opts?: LoadChunkOptions<T>): Promise<T> => {
      if (key !== 'challenge') return real.loadChunk(key, load, opts);
      net.loads += 1;
      if (net.mode === 'offline') return real.loadChunk(key, () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')), opts);
      if (net.mode === 'hold') return real.loadChunk(key, () => new Promise<void>((r) => (net.release = r)).then(load), opts);
      return real.loadChunk(key, load, opts);
    },
  };
});

const DAY = '2026-09-18';
const WEEK = '2026-09-14';
const LEAN = TWISTS.find((x) => x.id === 'lean')!;
const daily = (): DailyChallenge => ({ dayKey: DAY, levelId: 999, seed: 5, twist: LEAN });
const weekly = (): WeeklyChallenge => ({ weekKey: WEEK, levelId: 999, seed: 5, twist: LEAN, targetMs: 1 });

function fakeApp(save: SaveData) {
  const starts: { levelId: number; seed?: number; opts?: StartOptions }[] = [];
  let current: Screen | null = null;
  let levels = 0;
  const app: App = {
    view: { scale: 0.5 } as View,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {
      levels += 1;
    },
    goShop() {},
    goAchievements() {},
    startLevel(levelId, seed, opts) {
      starts.push({ levelId, seed, opts });
      return Promise.resolve(true);
    },
    go(s: Screen) {
      current = s;
    },
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => DAY,
    weekKey: () => WEEK,
  };
  return { app, starts, current: () => current, levels: () => levels };
}

/** Every tower the player's: the next tick is a win (outcome at `at`). */
function winAt(play: PlayScreen, at: number): void {
  play.startMatch();
  for (const tw of Object.values(play.state.towers)) tw.owner = 'player';
  play.state.units = [];
  play.state.links = [];
  play.update(250, at);
  expect(play.over).toBe(true);
}

const beat = (play: PlayScreen) => (play as unknown as { buildUi(): HudPlayUi }).buildUi().resultBeat;
const flush = () => new Promise((r) => setTimeout(r, 0));
const POLL = { timeout: 30_000, interval: 10 } as const;

let save: SaveData;
let clock = 1_000_000;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  save.gold = 0;
  net.mode = 'online';
  net.loads = 0;
  net.release = null;
  resetChunkFailuresForTests();
  registerChallengeChunk(null);
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  vi.restoreAllMocks();
  registerChallengeChunk(challengeRecord);
});

describe('challenge result chunk (PERF-16)', () => {
  it('a chunk still in flight at the outcome: the beat holds, the result is booked once it lands and opens on the beat\'s schedule', async () => {
    net.mode = 'hold';
    const shell = fakeApp(save);
    const play = new PlayScreen(shell.app, makeLevel({ id: 999 }), 5, 1, { challenge: daily() });
    shell.app.go(play);
    expect(net.loads).toBe(1); // warmed at the match start
    winAt(play, 1000);
    // not booked yet, and the screen is the beat's undimmed frame
    expect(challengeDone(save, DAY)).toBe(false);
    expect(save.gold).toBe(0);
    expect(beat(play)).toBe(true);
    expect(play.back()).toBe(true); // swallowed: leaving now would lose the outcome
    expect(shell.levels()).toBe(0);
    play.update(16, 1200);
    expect(shell.current()).toBe(play);

    net.release!();
    await vi.waitFor(() => expect(challengeChunk()).not.toBeNull(), POLL);
    play.update(16, 1300); // lands inside the beat: booked now
    expect(challengeDone(save, DAY)).toBe(true);
    const paid = save.gold;
    expect(paid).toBeGreaterThan(0);
    expect(save.crystals).toBeGreaterThanOrEqual(REWARD.crystals);
    expect(shell.current()).toBe(play); // still the beat
    play.update(16, 1000 + RESULT_BEAT_MS - 1);
    expect(shell.current()).toBe(play);
    play.update(16, 1000 + RESULT_BEAT_MS); // counted from the outcome, not from the chunk's arrival
    const result = shell.current();
    expect(result).toBeInstanceOf(ResultScreen);
    expect((result as ResultScreen).info.daily?.firstWin).toBe(true);
    expect((result as ResultScreen).info.daily?.gold).toBe(paid);
    expect((result as ResultScreen).info.challenge?.dayKey).toBe(DAY);
    // nothing is booked twice by later frames
    play.update(16, 5000);
    expect(save.gold).toBe(paid);
    expect(play.toast.opts(5000)).toBeFalsy();
  }, 40_000);

  it('a failed download: the toast once per failure, input held, nothing booked; a retry after the back-off books once and shows the result', async () => {
    net.mode = 'offline';
    const shell = fakeApp(save);
    const play = new PlayScreen(shell.app, makeLevel({ id: 999 }), 5, 1, { weekly: weekly() });
    shell.app.go(play);
    await vi.waitFor(() => expect(challengeChunkFailures()).toBe(1), POLL);
    winAt(play, 1000);
    expect(play.toast.opts(1000)?.text).toBe(t('common.loadFailed'));
    play.update(16, 1000 + RESULT_BEAT_MS);
    expect(shell.current()).toBe(play);
    expect(beat(play)).toBe(true);
    expect(weeklyDone(save, WEEK)).toBe(false);
    expect(play.back()).toBe(true);
    expect(shell.levels()).toBe(0);
    const loadsBefore = net.loads;
    play.update(16, 2000); // inside the back-off: no new request
    expect(net.loads).toBe(loadsBefore);

    net.mode = 'online';
    clock += RETRY_AFTER_MS + 1;
    play.update(16, 5000);
    expect(net.loads).toBe(loadsBefore + 1);
    await vi.waitFor(() => expect(challengeChunk()).not.toBeNull(), POLL);
    play.update(16, 5016); // booked, and the beat (counted from the outcome) is long over: the result at once
    expect(weeklyDone(save, WEEK)).toBe(true);
    expect(save.gold).toBe(WEEKLY_REWARD.gold);
    const result = shell.current();
    expect(result).toBeInstanceOf(ResultScreen);
    expect((result as ResultScreen).info.weeklyOutcome?.firstWin).toBe(true);
    play.update(16, 6000);
    expect(save.gold).toBe(WEEKLY_REWARD.gold);
  }, 40_000);

  it('a campaign match never asks for the chunk: with it failed (title idle warm) the result is booked and shown on time, no toast', async () => {
    net.mode = 'offline';
    void import('../../src/ui/challengeChunk').then((m) => m.warmChallengeChunk()); // what the title's idle preload does
    await vi.waitFor(() => expect(challengeChunkFailures()).toBe(1), POLL);
    const loads = net.loads;
    const shell = fakeApp(save);
    const play = new PlayScreen(shell.app, makeLevel({ id: 5 }), 1, 1);
    shell.app.go(play);
    winAt(play, 1000);
    expect(save.stars['5']).toBeGreaterThan(0);
    play.update(16, 1000 + RESULT_BEAT_MS);
    const result = shell.current();
    expect(result).toBeInstanceOf(ResultScreen);
    expect((result as ResultScreen).info.daily).toBeUndefined();
    expect(play.toast.opts(1000 + RESULT_BEAT_MS)).toBeFalsy();
    expect(net.loads).toBe(loads);
    expect(CHALLENGE_CHUNK).toBe('challenge');
  });

  it('restart: a campaign level restarts without the chunk; a challenge restarts through it, and a failed download says so', async () => {
    net.mode = 'offline';
    const shell = fakeApp(save);
    const campaign = new PlayScreen(shell.app, makeLevel({ id: 5 }), 1, 1);
    campaign.restart();
    expect(shell.starts).toEqual([{ levelId: 5, seed: undefined, opts: undefined }]);
    expect(net.loads).toBe(0);

    const ch = daily();
    const play = new PlayScreen(shell.app, makeLevel({ id: 999 }), ch.seed, 1, { challenge: ch });
    await vi.waitFor(() => expect(challengeChunkFailures()).toBe(1), POLL);
    play.restart();
    await vi.waitFor(() => expect(challengeChunkFailures()).toBe(2), POLL);
    await flush();
    expect(shell.starts).toHaveLength(1);
    expect(play.toast.opts((play as unknown as { nowMs: number }).nowMs)?.text).toBe(t('common.loadFailed'));

    net.mode = 'online';
    play.restart();
    await vi.waitFor(() => expect(shell.starts).toHaveLength(2), POLL);
    expect(shell.starts[1]).toEqual({ levelId: 999, seed: ch.seed, opts: { challenge: ch } });
  }, 40_000);
});
