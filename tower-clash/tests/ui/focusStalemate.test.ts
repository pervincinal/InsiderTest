import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LevelDef } from '../../src/sim/types';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { STALL, loadHudOverlays } from '../../src/render/hud';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen } from '../../src/ui/screens';
import { ResultScreen } from '../../src/ui/result';
import '../registerResult'; // the lazy result chunk is in
import { PlayScreen, STALEMATE_CARD_FROM_LEVEL } from '../../src/ui/play';
import type { FocusHost } from '../../src/ui/focus';
import { focusItems, focusKey, focusState, resetFocusForTests } from '../../src/ui/focus';
import { makeLevel, wall } from '../helpers';

/*
 * REV-7 (2026-11-20): the "Nothing is changing" card (AUD-B2 / A11) is reachable by keyboard — Tab walks
 * Keep playing → Restart → Retreat and Enter is the tap at the ringed button (play.ts's own down / up).
 * REV-5b: a held Enter does not re-tap.
 */

/** 9:16 phone, logical = layout. */
const VIEW = { cssW: 360, cssH: 640, scale: 0.5, offsetX: 0, offsetY: 0, dpr: 1, insets: { top: 0, right: 0, bottom: 0, left: 0 } } as unknown as View;

function fakeApp(save: SaveData) {
  let current: Screen | null = null;
  const starts: number[] = [];
  const app: App = {
    view: VIEW,
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
    dayKey: () => '2026-11-20',
    weekKey: () => '2026-11-16',
  };
  return { app, starts, current: () => current };
}

/** Player and enemy with a wall between them: nothing can ever change hands. */
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

const key = (k: string, repeat = false): KeyboardEvent => ({ key: k, shiftKey: false, repeat, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {} }) as unknown as KeyboardEvent;
const same = (a: { x: number; y: number; w: number; h: number } | null | undefined, b: { x: number; y: number; w: number; h: number }): boolean =>
  !!a && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

let save: SaveData;
let now: number;
beforeAll(async () => {
  await loadHudOverlays();
});
beforeEach(() => {
  resetFocusForTests();
  setSaveStorageForTests(null);
  save = defaultSave();
  now = 1000;
});

function frame(play: PlayScreen, dt = 250): void {
  now += dt;
  play.update(dt, now);
}

/** A frozen match at ×20 run until the card is up. */
function toCard(shell: ReturnType<typeof fakeApp>, id = 15): PlayScreen {
  const play = new PlayScreen(shell.app, frozen(id), 1, 1);
  shell.app.go(play);
  play.loop.speed = 20;
  play.startMatch();
  play.state.time = 40_000;
  for (let i = 0; i < 400 && !play.stalemateCardUp; i++) frame(play);
  expect(play.stalemateCardUp).toBe(true);
  return play;
}

describe('REV-7: the stalemate card by keyboard', () => {
  it('a real PlayScreen lists the three card buttons; none while the match runs', () => {
    const shell = fakeApp(save);
    const play = new PlayScreen(shell.app, frozen(STALEMATE_CARD_FROM_LEVEL), 1, 1);
    expect(focusItems(play, VIEW)).toEqual([]);
    play.loop.speed = 20;
    play.startMatch();
    play.state.time = 40_000;
    for (let i = 0; i < 400 && !play.stalemateCardUp; i++) frame(play);
    expect(focusItems(play, VIEW)).toEqual([STALL.keep, STALL.restart, STALL.retreat]);
  });

  it('Tab, Tab, Tab rings Retreat; Enter retreats (the loss result, retreated); a held Enter does not re-fire', () => {
    const shell = fakeApp(save);
    const play = toCard(shell);
    const h: FocusHost = { current: play, view: VIEW };
    focusKey(h, key('Tab'));
    expect(same(focusState(h).rect, STALL.keep)).toBe(true);
    focusKey(h, key('Tab'));
    focusKey(h, key('Tab'));
    expect(same(focusState(h).rect, STALL.retreat)).toBe(true);
    expect(focusKey(h, key('Enter'))).toBe(true);
    expect(play.stalemateCardUp).toBe(false);
    frame(play, 16);
    const r = shell.current();
    expect(r).toBeInstanceOf(ResultScreen);
    expect((r as ResultScreen).info.retreated).toBe(true);
    expect((r as ResultScreen).info.ui.outcome).toBe('lost');
    expect(save.defeats['15']).toBe(1);
  });

  it('Enter on Keep playing closes the card and the sim runs on; a repeat of that Enter taps nothing more', () => {
    const shell = fakeApp(save);
    const play = toCard(shell);
    const h: FocusHost = { current: play, view: VIEW };
    focusKey(h, key('Tab'));
    focusKey(h, key('Enter'));
    expect(play.stalemateCardUp).toBe(false);
    expect(focusItems(play, VIEW)).toEqual([]);
    expect(focusKey(h, key('Enter', true))).toBe(false); // no items mid-match: the repeat is the screen's (play.ts key)
    const t = play.state.time;
    frame(play);
    expect(play.state.time).toBeGreaterThan(t);
  });

  it('Enter on Restart starts the level again (play.ts restart: app.startLevel)', () => {
    const shell = fakeApp(save);
    const play = toCard(shell);
    const h: FocusHost = { current: play, view: VIEW };
    focusKey(h, key('Tab'));
    focusKey(h, key('Tab'));
    expect(same(focusState(h).rect, STALL.restart)).toBe(true);
    focusKey(h, key('Enter'));
    focusKey(h, key('Enter', true)); // held: once
    expect(shell.starts).toEqual([15]);
  });
});
