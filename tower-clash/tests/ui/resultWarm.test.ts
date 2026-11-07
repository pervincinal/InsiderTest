import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { resultShownAt } from '../../src/render/hud';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen } from '../../src/ui/screens';
import { ResultScreen, resetDefeatStreakForTests } from '../../src/ui/result';
import '../registerResult'; // PERF-11: the lazy result chunk is in
import { setReducedMotionOverride } from '../../src/ui/motion';
import { PlayScreen, RESULT_BEAT_MS } from '../../src/ui/play';
import { makeLevel } from '../helpers';

/*
 * FEEL-1-8: the result screen is built half way through the AUD-F4 beat and its entry work (the share chunk,
 * one off-screen pass of the card drawer) runs there, one step per frame — the card's timeline, the screen
 * shown and the defeat bookkeeping stay as they were.
 */

function fakeApp(save: SaveData) {
  let current: Screen | null = null;
  const app: App = {
    view: { scale: 0.5 } as View,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {},
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
    dayKey: () => '2026-11-07',
    weekKey: () => '2026-11-02',
  };
  return { app, current: () => current };
}

/** A level lost on the next tick (every tower the enemy's). */
function losing(shell: ReturnType<typeof fakeApp>): PlayScreen {
  const play = new PlayScreen(shell.app, makeLevel({ id: 6 }), 1, 1);
  shell.app.go(play);
  play.startMatch();
  for (const tw of Object.values(play.state.towers)) tw.owner = 'enemy1';
  play.state.units = [];
  play.state.links = [];
  return play;
}

type Pending = { screen?: ResultScreen | null } | null;
const pendingOf = (play: PlayScreen): Pending => (play as unknown as { pendingResult: Pending }).pendingResult;
const stepOf = (r: ResultScreen): number => (r as unknown as { warmStep: number }).warmStep;

let save: SaveData;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  resetDefeatStreakForTests();
});
afterEach(() => setReducedMotionOverride(null));

describe('FEEL-1-8 result entry work in the beat', () => {
  it('the screen is built half way through the beat, warmed one step per frame, and is the one shown at the end of the beat', () => {
    const shell = fakeApp(save);
    const play = losing(shell);
    play.update(50, 1000);
    expect(play.over).toBe(true);
    play.update(16, 1000 + RESULT_BEAT_MS / 2 - 16);
    expect(pendingOf(play)?.screen).toBeUndefined(); // first half: the world only
    play.update(16, 1000 + RESULT_BEAT_MS / 2);
    const built = pendingOf(play)?.screen;
    expect(built).toBeInstanceOf(ResultScreen);
    expect(stepOf(built!)).toBe(1); // step 0 (the share chunk) on this frame
    play.update(16, 1000 + RESULT_BEAT_MS / 2 + 16);
    expect(stepOf(built!)).toBe(2); // step 1 (the drawer's pass) on the next
    expect(shell.current()).toBe(play); // still the beat: the card's timeline did not move
    expect(resultShownAt(play.state)).toBeUndefined();
    play.update(16, 1000 + RESULT_BEAT_MS);
    expect(shell.current()).toBe(built);
    expect(built!.info.ui.outcome).toBe('lost');
    // the defeat was counted once (the HOW TO PLAY link comes with the second defeat in a row, FE-4)
    expect(built!.extras().howto).toBe(false);
  });

  it('reduced motion: the result at the outcome, nothing built ahead', () => {
    setReducedMotionOverride(true);
    const shell = fakeApp(save);
    const play = losing(shell);
    play.update(50, 1000);
    expect(shell.current()).toBeInstanceOf(ResultScreen);
    expect(pendingOf(play)).toBeNull();
  });
});
