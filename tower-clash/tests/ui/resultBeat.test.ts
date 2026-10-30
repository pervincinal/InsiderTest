import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { HudPlayUi } from '../../src/render/hud';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen } from '../../src/ui/screens';
import { ResultScreen } from '../../src/ui/screens';
import { setReducedMotionOverride } from '../../src/ui/motion';
import { PlayScreen, RESULT_BEAT_MS } from '../../src/ui/play';
import { makeLevel } from '../helpers';

/*
 * AUD-F4: the result's last capture is seen — RESULT_BEAT_MS of real time between the outcome and the
 * result screen (its dim and card), the world still drawing, input ignored; the save is written at
 * the outcome. Reduced motion keeps the instant result.
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
    dayKey: () => '2026-10-30',
    weekKey: () => '2026-10-26',
  };
  return { app, current: () => current };
}

let save: SaveData;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
});
afterEach(() => setReducedMotionOverride(null));

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

describe(`the result beat (AUD-F4, ${RESULT_BEAT_MS} ms)`, () => {
  it('the play screen stays up (undimmed, input ignored) for the beat, the save is written at the outcome', () => {
    expect(RESULT_BEAT_MS).toBe(600);
    const shell = fakeApp(save);
    const play = winning(shell);
    play.update(50, 1000);
    expect(play.over).toBe(true);
    expect(save.stars['5']).toBeGreaterThan(0); // booked at the outcome
    expect(shell.current()).toBe(play);
    expect((play as unknown as { buildUi(): HudPlayUi }).buildUi().resultBeat).toBe(true);
    // input during the beat does nothing (no pause card, no selection)
    play.down({ x: 360, y: 1000, id: 1, timeMs: 1100 });
    play.up({ x: 360, y: 1000, id: 1, timeMs: 1100 });
    play.key({ key: 'Escape' } as KeyboardEvent);
    expect(play.loop.paused).toBe(false);
    play.update(16, 1000 + RESULT_BEAT_MS - 16);
    expect(shell.current()).toBe(play);
    play.update(16, 1000 + RESULT_BEAT_MS);
    const result = shell.current();
    expect(result).toBeInstanceOf(ResultScreen);
    expect((result as ResultScreen).info.ui.outcome).toBe('won');
    expect((result as ResultScreen).info.ui.resultBeat).toBeUndefined(); // the result screen draws its card at once
  });

  it('reduced motion: the result screen at the outcome', () => {
    setReducedMotionOverride(true);
    const shell = fakeApp(save);
    const play = winning(shell);
    play.update(50, 1000);
    expect(shell.current()).toBeInstanceOf(ResultScreen);
  });
});
