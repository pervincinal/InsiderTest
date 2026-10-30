import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LevelDef } from '../../src/sim/types';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { HUD } from '../../src/render/layout';
import type { HudPlayUi } from '../../src/render/hud';
import { lessonCardAlpha, lessonCardLayout } from '../../src/render/hud';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { setReducedMotionOverride } from '../../src/ui/motion';
import { LESSON_FADE_MS, PlayScreen } from '../../src/ui/play';
import { makeLevel } from '../helpers';

/*
 * AUD-B11 (GDD §4 "Lesson card holds the match"): while the lesson card is up the sim does not
 * advance — `state.time` stays 0, no tick runs, the clock shows 00:00 — until the player's first
 * input on the map (a tower, empty ground) or on the card. That input starts the sim in the same
 * frame and is processed normally (a drag places its link); the card fades over LESSON_FADE_MS
 * (reduced motion: at once) and never times out. The tutorial bubble waits until the card is gone.
 */

function fakeApp(save: SaveData): App {
  return {
    view: { scale: 0.5 } as View,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {},
    goShop() {},
    goAchievements() {},
    startLevel: () => Promise.resolve(true),
    go() {},
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-10-30',
    weekKey: () => '2026-10-26',
  };
}

/** Player `p`, enemy `e`, neutral `n` (tests/ui/v3Sounds.test.ts's map without the walled-off tower). */
function fixture(id = 999): LevelDef {
  return makeLevel({
    id,
    towers: [
      { id: 'p', x: 200, y: 1000, owner: 'player', units: 10, level: 1 },
      { id: 'e', x: 200, y: 400, owner: 'enemy1', units: 10, level: 1 },
      { id: 'n', x: 520, y: 700, owner: 'neutral', units: 5 },
    ],
  });
}

let now: number;
let save: SaveData;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  now = 1000;
});
afterEach(() => setReducedMotionOverride(null));

function frame(play: PlayScreen, dt = 50): void {
  now += dt;
  play.update(dt, now);
}

const at = (play: PlayScreen, x: number, y: number) => ({ ...play.fromLayout(x, y), id: 1, type: 'touch' as const, timeMs: now });
const tower = (play: PlayScreen, id: string) => play.state.towers[id]!;
const ui = (play: PlayScreen): HudPlayUi => (play as unknown as { buildUi(): HudPlayUi }).buildUi();

/** A fake 2D context: lesson-card layout only measures text. */
const ctx = { font: '', measureText: (s: string) => ({ width: s.length * 10 }) } as unknown as CanvasRenderingContext2D;

describe('the lesson card holds the match (AUD-B11)', () => {
  it('the sim stays at 0 — no tick, no production, clock 00:00 — however long the card is up; it never times out', () => {
    const play = new PlayScreen(fakeApp(save), fixture(), 1, 1);
    const units = tower(play, 'e').units;
    for (let i = 0; i < 2400; i++) frame(play, 250); // ten minutes of real time
    expect(play.cardUp).toBe(true);
    expect(play.state.time).toBe(0);
    expect(play.elapsedMs()).toBe(0);
    expect(tower(play, 'e').units).toBe(units);
    expect(play.state.links).toEqual([]);
    const u = ui(play);
    expect(u.clockMs).toBe(0);
    expect(u.cardUp).toBe(true);
    expect(lessonCardAlpha(u, play.state)).toBe(1);
    expect(lessonCardLayout(ctx, play.state, u)).not.toBeNull();
  });

  it('the first drag both starts the sim and places its link (the input is not swallowed)', () => {
    const play = new PlayScreen(fakeApp(save), fixture(), 1, 1);
    frame(play);
    const p = tower(play, 'p');
    const n = tower(play, 'n');
    play.down(at(play, p.x, p.y));
    expect(play.cardUp).toBe(false); // the press started it
    for (let k = 1; k <= 6; k++) {
      now += 16;
      play.move(at(play, p.x + ((n.x - p.x) * k) / 6, p.y + ((n.y - p.y) * k) / 6));
    }
    play.up(at(play, n.x, n.y));
    frame(play);
    expect(play.state.time).toBe(50); // the first tick ran in the input's frame
    expect(play.state.links.filter((l) => l.owner === 'player').map((l) => `${l.from}->${l.to}:${l.createdMs}`)).toEqual(['p->n:0']);
  });

  it('a tap on a tower selects it as usual; a tap on empty map starts it too', () => {
    const tapAt = (play: PlayScreen, x: number, y: number) => {
      play.down(at(play, x, y));
      play.up(at(play, x, y));
    };
    const a = new PlayScreen(fakeApp(save), fixture(), 1, 1);
    frame(a);
    tapAt(a, 200, 1000);
    expect(a.cardUp).toBe(false);
    expect(a.gestures.selectedTowerId).toBe('p');
    frame(a);
    expect(a.state.time).toBe(50);

    const b = new PlayScreen(fakeApp(save), fixture(), 1, 1);
    frame(b);
    tapAt(b, 620, 980); // grass, far from every tower
    expect(b.cardUp).toBe(false);
    expect(b.gestures.selectedTowerId).toBeNull();
    frame(b);
    expect(b.state.time).toBe(50);
  });

  it('a tap on the card starts the sim and ends there (nothing under it is selected)', () => {
    const play = new PlayScreen(fakeApp(save), fixture(), 1, 1);
    // the rect `draw` keeps from `lessonCardLayout`; here set by hand over tower `n`
    (play as unknown as { cardRect: { x: number; y: number; w: number; h: number } }).cardRect = { x: 420, y: 600, w: 200, h: 200 };
    play.down(at(play, 520, 700));
    play.up(at(play, 520, 700));
    expect(play.cardUp).toBe(false);
    expect(play.gestures.selectedTowerId).toBeNull();
  });

  it('pause while the card is up holds it: the HUD band does not start the match, Resume returns to the held card', () => {
    const play = new PlayScreen(fakeApp(save), fixture(), 1, 1);
    const c = { x: HUD.pause.x + HUD.pause.w / 2, y: HUD.pause.y + HUD.pause.h / 2, id: 1, type: 'touch' as const, timeMs: now };
    play.down(c);
    play.up(c);
    expect(play.loop.paused).toBe(true);
    frame(play, 250);
    play.togglePause();
    frame(play, 250);
    expect(play.cardUp).toBe(true);
    expect(play.state.time).toBe(0);
  });

  it('a programmatic player counts as the first input: autoplay / lose bots, a booster command, the debug hook', () => {
    const bot = new PlayScreen(fakeApp(save), fixture(), 1, 1);
    bot.setPlayerBot(() => []);
    expect(bot.cardUp).toBe(false);
    const lose = new PlayScreen(fakeApp(save), fixture(), 1, 1);
    lose.setLoseBot(() => []);
    expect(lose.cardUp).toBe(false);
    save.charges.overdrive = 1;
    const boost = new PlayScreen(fakeApp(save), fixture(), 1, 1);
    expect(boost.useBooster('overdrive')).toBe(true);
    expect(boost.cardUp).toBe(false);
    const hook = new PlayScreen(fakeApp(save), fixture(), 1, 1);
    expect(hook.startMatch()).toBe(true);
    expect(hook.startMatch()).toBe(false); // once
  });

  it(`the card fades over ${LESSON_FADE_MS} ms after the first input; the tutorial bubble shows only once it is gone`, () => {
    const play = new PlayScreen(fakeApp(save), fixture(1), 1, 1); // level 1, first play: the tutorial
    frame(play);
    expect(play.tutorialStep()).toBeNull(); // the card holds: no bubble with it
    play.down(at(play, 620, 980));
    play.up(at(play, 620, 980));
    expect(lessonCardAlpha(ui(play), play.state)).toBe(1);
    frame(play, 100);
    expect(lessonCardAlpha(ui(play), play.state)).toBeCloseTo(0.6, 5);
    expect(play.tutorialStep()).toBeNull();
    frame(play, 100);
    frame(play, 100);
    expect(lessonCardAlpha(ui(play), play.state)).toBe(0);
    expect(lessonCardLayout(ctx, play.state, ui(play))).toBeNull();
    expect(play.tutorialStep()?.towerId).toBe('home');
  });

  it('reduced motion: the card is gone with the first input', () => {
    setReducedMotionOverride(true);
    const play = new PlayScreen(fakeApp(save), fixture(1), 1, 1);
    frame(play);
    play.down(at(play, 620, 980));
    play.up(at(play, 620, 980));
    expect(lessonCardAlpha(ui(play), play.state)).toBe(0);
    expect(play.tutorialStep()).not.toBeNull();
  });
});
