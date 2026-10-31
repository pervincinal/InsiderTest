import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { HudPlayUi } from '../../src/render/hud';
import { createAdSession } from '../../src/economy/adsFlow';
import type { LoadChunkOptions } from '../../src/lazyChunk';
import { RETRY_AFTER_MS, resetChunkFailuresForTests } from '../../src/lazyChunk';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen } from '../../src/ui/screens';
import { t } from '../../src/ui/i18n';
import { setReducedMotionOverride } from '../../src/ui/motion';
import { PlayScreen, RESULT_BEAT_MS } from '../../src/ui/play';
import { resultChunkLoaded } from '../../src/ui/resultChunk';
import { makeLevel } from '../helpers';

/*
 * PERF-11: the result screen is a lazy chunk (src/ui/resultChunk.ts). This file does not import
 * tests/registerResult.ts: the chunk starts out missing and its download fails until `net.offline`
 * is cleared. The play screen must then hold the beat's undimmed frame (never a blank, never a
 * half-drawn result), say so once, let platform back leave for the map (the result is booked), and
 * open the result as soon as a retry lands.
 */

const net = vi.hoisted(() => ({ offline: true }));
vi.mock('../../src/lazyChunk', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/lazyChunk')>();
  return {
    ...real,
    loadChunk: <T>(key: string, load: () => Promise<T>, opts?: LoadChunkOptions<T>): Promise<T> =>
      real.loadChunk(key, key === 'result' && net.offline ? () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')) : load, opts),
  };
});

function fakeApp(save: SaveData) {
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
    startLevel: () => Promise.resolve(true),
    go(s: Screen) {
      current = s;
    },
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-10-30',
    weekKey: () => '2026-10-26',
  };
  return { app, current: () => current, levels: () => levels };
}

/** A level won on the next tick (every tower the player's). */
function winning(shell: ReturnType<typeof fakeApp>): PlayScreen {
  const play = new PlayScreen(shell.app, makeLevel({ id: 5 }), 1, 1);
  shell.app.go(play);
  play.startMatch();
  for (const tw of Object.values(play.state.towers)) tw.owner = 'player';
  play.state.units = [];
  play.state.links = [];
  return play;
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const beat = (play: PlayScreen) => (play as unknown as { buildUi(): HudPlayUi }).buildUi().resultBeat;

let save: SaveData;
let clock = 1_000_000;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  net.offline = true;
  resetChunkFailuresForTests();
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  setReducedMotionOverride(null);
  vi.restoreAllMocks();
});

describe('result chunk (PERF-11)', () => {
  it('a failed download holds the undimmed last frame with a toast; back leaves for the map; a retry after the back-off opens the result', async () => {
    const shell = fakeApp(save);
    const play = winning(shell); // the constructor's warm fails
    await flush();
    expect(resultChunkLoaded()).toBe(false);
    play.update(50, 1000);
    expect(play.over).toBe(true);
    expect(save.stars['5']).toBeGreaterThan(0); // booked at the outcome, chunk or not
    play.update(16, 1000 + RESULT_BEAT_MS);
    // the beat is over but the chunk is not in: still the play screen, still undimmed, and the player is told
    expect(shell.current()).toBe(play);
    expect(beat(play)).toBe(true);
    expect(play.toast.opts(1000 + RESULT_BEAT_MS)?.text).toBe(t('common.loadFailed'));
    play.update(16, 2000);
    expect(shell.current()).toBe(play);
    // platform back is no longer swallowed once a failure was reported: the map (the result is saved)
    expect(play.back()).toBe(true);
    expect(shell.levels()).toBe(1);

    // network back: the next frame after the back-off re-requests the chunk and the result opens once it lands
    net.offline = false;
    clock += RETRY_AFTER_MS + 1;
    play.update(16, 5000);
    await vi.waitFor(() => expect(resultChunkLoaded()).toBe(true));
    play.update(16, 5016);
    const result = shell.current();
    expect(result?.name).toBe('result');
    const { ResultScreen } = await import('../../src/ui/result');
    expect(result).toBeInstanceOf(ResultScreen);
    expect((result as InstanceType<typeof ResultScreen>).info.ui.outcome).toBe('won');
  });
});
