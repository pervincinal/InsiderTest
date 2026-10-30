import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LevelDef, SimEvent } from '../../src/sim/types';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { STALL, loadHudOverlays } from '../../src/render/hud';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen } from '../../src/ui/screens';
import { ResultScreen } from '../../src/ui/screens';
import { PlayScreen, STALEMATE_CARD_FROM_LEVEL, STALEMATE_CARD_MS, StalemateCardWatch } from '../../src/ui/play';
import { makeLevel, wall } from '../helpers';

/*
 * AUD-B2 / A11 (GDD §2.4 "Stalemate"): when no tower has changed owner for STALEMATE_CARD_MS of sim
 * time while playing, the "Nothing is changing" card pauses the sim with Keep playing / Restart /
 * Retreat. The window opens at the sim start and restarts on every capture (any owner), on Keep
 * playing and on a Continue; at most once per window; never on levels 1–8.
 */

function fakeApp(save: SaveData) {
  let current: Screen | null = null;
  const starts: number[] = [];
  const app: App = {
    view: { scale: 0.5 } as View,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {},
    goShop() {},
    goAchievements() {},
    startLevel: (id: number) => {
      starts.push(id);
      return Promise.resolve(true);
    },
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
  return { app, starts, current: () => current };
}

/** Player `p` and enemy `e` with a wall between them: no lane, so nothing can ever change hands. */
function frozen(id: number): LevelDef {
  return makeLevel({
    id,
    towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, level: 1 },
      { id: 'e', x: 360, y: 400, owner: 'enemy1', units: 10, level: 1 },
    ],
    obstacles: [wall(0, 700, 720, 700)],
  });
}

let save: SaveData;
let now: number;
beforeAll(async () => {
  await loadHudOverlays(); // the card is the overlay chunk's; the play screen raises it once that is in
});
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  now = 1000;
});

function frame(play: PlayScreen, dt = 250): void {
  now += dt;
  play.update(dt, now);
}

/** Started at ×20 (10 ticks a frame) with sim time moved to `timeMs`. */
function startAt(play: PlayScreen, timeMs: number): void {
  play.loop.speed = 20;
  play.startMatch();
  play.state.time = timeMs;
}

/** Run frames until the card is up (or `limitMs` of sim time passed); returns the sim time then. */
function runToCard(play: PlayScreen, limitMs = 200_000): number {
  const start = play.state.time;
  while (!play.stalemateCardUp && play.state.time - start < limitMs) frame(play);
  return play.state.time;
}

const press = (play: PlayScreen, x: number, y: number, x2 = x, y2 = y) => {
  play.down({ x, y, id: 1, timeMs: now });
  play.up({ x: x2, y: y2, id: 1, timeMs: now });
};
const centre = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2] as const;

describe('StalemateCardWatch (the 45 s window)', () => {
  it(`is due once at ${STALEMATE_CARD_MS} ms of sim time without a capture, never before`, () => {
    expect(STALEMATE_CARD_MS).toBe(45_000);
    const w = new StalemateCardWatch(true);
    w.restart(0);
    expect(w.due(44_950)).toBe(false);
    expect(w.due(45_000)).toBe(true);
    expect(w.due(45_050)).toBe(false); // at most once per window
    expect(w.due(500_000)).toBe(false);
  });

  it('a capture (restart) opens a new window from its time', () => {
    const w = new StalemateCardWatch(true);
    w.restart(0);
    w.restart(30_000); // a capture at 30 s
    expect(w.due(74_950)).toBe(false);
    expect(w.due(75_000)).toBe(true);
    w.restart(75_000); // Keep playing
    expect(w.due(119_950)).toBe(false);
    expect(w.due(120_000)).toBe(true);
  });

  it('a disabled watch is never due', () => {
    const w = new StalemateCardWatch(false);
    w.restart(0);
    expect(w.due(1_000_000)).toBe(false);
  });
});

describe('the "Nothing is changing" card on the play screen (GDD §2.4)', () => {
  it('comes up at 45 s of sim with nothing captured and holds the sim while it is up', () => {
    const shell = fakeApp(save);
    const play = new PlayScreen(shell.app, frozen(STALEMATE_CARD_FROM_LEVEL), 1, 1);
    startAt(play, 40_000);
    const t = runToCard(play);
    expect(play.stalemateCardUp).toBe(true);
    expect(t).toBe(45_000);
    for (let i = 0; i < 20; i++) frame(play);
    expect(play.state.time).toBe(45_000); // paused like the pause card
  });

  it(`never on levels 1–${STALEMATE_CARD_FROM_LEVEL - 1}`, () => {
    for (let id = 1; id < STALEMATE_CARD_FROM_LEVEL; id++) {
      const play = new PlayScreen(fakeApp(save).app, frozen(id), 1, 1);
      startAt(play, 0);
      runToCard(play, 120_000);
      expect(play.stalemateCardUp, `level ${id}`).toBe(false);
      expect(play.state.time).toBeGreaterThanOrEqual(120_000);
    }
  });

  it('a capture of any owner restarts the window (an enemy taking a neutral too)', () => {
    const play = new PlayScreen(fakeApp(save).app, frozen(12), 1, 1);
    startAt(play, 30_000);
    const capture: SimEvent = { type: 'capture', towerId: 'e', by: 'enemy2', from: 'neutral' } as SimEvent;
    (play as unknown as { onEvents(ev: SimEvent[]): void }).onEvents([capture]);
    expect(runToCard(play)).toBe(75_000);
  });

  it('Keep playing closes it, resumes the sim and restarts the window: the next card is 45 s later at the earliest', () => {
    const play = new PlayScreen(fakeApp(save).app, frozen(20), 1, 1);
    startAt(play, 40_000);
    runToCard(play);
    press(play, ...centre(STALL.keep));
    expect(play.stalemateCardUp).toBe(false);
    frame(play);
    expect(play.state.time).toBeGreaterThan(45_000);
    expect(runToCard(play)).toBe(90_000);
  });

  it('Esc, the platform back button and a tap outside the card are Keep playing; a press that slides off a button is nothing', () => {
    const play = new PlayScreen(fakeApp(save).app, frozen(20), 1, 1);
    startAt(play, 40_000);
    runToCard(play);
    press(play, ...centre(STALL.keep), 360, STALL.card.y + 40); // keep → lifted on the card's title: nothing
    expect(play.stalemateCardUp).toBe(true);
    press(play, 360, STALL.card.y + 40); // on the card between buttons: nothing
    expect(play.stalemateCardUp).toBe(true);
    press(play, 360, 1100); // outside the card
    expect(play.stalemateCardUp).toBe(false);
    runToCard(play);
    play.key({ key: 'Escape' } as KeyboardEvent);
    expect(play.stalemateCardUp).toBe(false);
    runToCard(play);
    expect(play.back()).toBe(true);
    expect(play.stalemateCardUp).toBe(false);
    expect(play.back()).toBe(false); // no card: the app's own back handling
  });

  it("Restart is the pause menu's restart: the same level starts again, nothing is recorded", () => {
    const shell = fakeApp(save);
    const play = new PlayScreen(shell.app, frozen(15), 1, 1);
    shell.app.go(play);
    startAt(play, 40_000);
    runToCard(play);
    press(play, ...centre(STALL.restart));
    expect(shell.starts).toEqual([15]);
    expect(save.defeats['15']).toBeUndefined();
  });

  it('Retreat ends the match as a defeat at the current sim time: recordResult loss, defeat tip, no Continue, no gold, at once', () => {
    save.crystals = 50;
    const shell = fakeApp(save);
    const level = frozen(15);
    const play = new PlayScreen(shell.app, level, 1, 1);
    shell.app.go(play);
    startAt(play, 40_000);
    runToCard(play);
    const gold = save.gold;
    press(play, ...centre(STALL.retreat));
    frame(play, 16);
    const result = shell.current();
    expect(result).toBeInstanceOf(ResultScreen);
    const r = result as ResultScreen;
    expect(r.info.ui.outcome).toBe('lost');
    expect(r.info.state.time).toBe(45_000);
    expect(r.info.retreated).toBe(true);
    expect(r.info.resume).toBeUndefined();
    expect(save.defeats['15']).toBe(1);
    expect(save.gold).toBe(gold);
    const ex = r.extras();
    expect(ex.continueCrystals).toBeNull();
    expect(ex.continueAd).toBe(false);
    expect(ex.tip).not.toBeNull();
    r.continueWithCrystals();
    expect(save.crystals).toBe(50);
  });

  it('three retreats are three defeats: the skip offer becomes reachable', () => {
    save.crystals = 50;
    let last: ResultScreen | null = null;
    for (let i = 0; i < 3; i++) {
      const shell = fakeApp(save);
      const play = new PlayScreen(shell.app, frozen(15), 1, 1);
      shell.app.go(play);
      startAt(play, 40_000);
      runToCard(play);
      press(play, ...centre(STALL.retreat));
      frame(play, 16);
      last = shell.current() as ResultScreen;
    }
    expect(save.defeats['15']).toBe(3);
    expect(last!.extras().skipCrystals).not.toBeNull();
  });
});
