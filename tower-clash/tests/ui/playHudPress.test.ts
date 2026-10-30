import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Command, LevelDef } from '../../src/sim/types';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { BOOSTERS, HUD, PAUSE } from '../../src/render/layout';
import type { Rect } from '../../src/render/widgets';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { PlayScreen } from '../../src/ui/play';
import { makeLevel } from '../helpers';

/*
 * BUG-36 / BUG-37 (QA, real CDP touch at 430×932): the play HUD buttons used to act on the lift-off
 * point alone. A drag or swipe that began on the map and ended over a booster / MENU / pause pressed
 * it (BUG-36), and a press that began on the HUD band and lifted on a tower acted as a tap on that
 * tower (BUG-37). Now a HUD button acts only for a press that began on it and lifts on it, a press
 * that began on the map always ends through the gestures, and a press the gestures never saw never
 * reaches them.
 */

function fakeApp(save: SaveData, nav: string[]): App {
  return {
    view: {} as View,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {
      nav.push('levels');
    },
    goShop() {},
    goAchievements() {},
    startLevel: () => Promise.resolve(true),
    go() {},
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-10-12',
    weekKey: () => '2026-10-12',
  };
}

function fixture(): LevelDef {
  return makeLevel({
    towers: [
      { id: 'p', x: 200, y: 1000, owner: 'player', units: 20, level: 1 },
      { id: 'q', x: 520, y: 1000, owner: 'player', units: 20, level: 1 },
      { id: 'n', x: 520, y: 700, owner: 'neutral', units: 5 },
      { id: 'e', x: 200, y: 400, owner: 'enemy1', units: 10, level: 1 },
    ],
  });
}

/** A pointer at map / layout point (x, y), placed where the play screen draws it (ART-21: towers through the tilted camera, HUD rects as they are). */
const pt = (x: number, y: number) => ({ ...play.fromLayout(x, y), id: 1, type: 'touch' as const, timeMs: 0 });
const centre = (r: Rect) => pt(r.x + r.w / 2, r.y + r.h / 2);

/** A press at `from`, eight moves along the straight line, the lift at `to` (QA's repro shape). */
function gesture(play: PlayScreen, from: { x: number; y: number }, to: { x: number; y: number }): void {
  play.down(pt(from.x, from.y));
  for (let i = 1; i <= 8; i++) play.move(pt(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8));
  play.up(pt(to.x, to.y));
}

let save: SaveData;
let nav: string[];
let play: PlayScreen;
let commands: Command[];

beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  save.gold = 200;
  nav = [];
  play = new PlayScreen(fakeApp(save, nav), fixture(), 1, 1);
  commands = [];
  const enqueue = play.loop.enqueue.bind(play.loop);
  vi.spyOn(play.loop, 'enqueue').mockImplementation((cmd: Command) => {
    commands.push(cmd);
    enqueue(cmd);
  });
});

const boosterCommands = () => commands.filter((c) => c.type === 'booster');
const links = () => commands.filter((c) => c.type === 'link');

describe('HUD buttons need a press that began on them (BUG-36)', () => {
  it('controls: a plain tap on OVERDRIVE fires it, on pause pauses, on MENU opens the pause card (AUD-U4), whose MENU leaves', () => {
    play.down(centre(BOOSTERS.overdrive));
    play.up(centre(BOOSTERS.overdrive));
    expect(boosterCommands()).toHaveLength(1);
    expect(save.gold).toBeLessThan(200);
    play.down(centre(HUD.pause));
    play.up(centre(HUD.pause));
    expect(play.loop.paused).toBe(true);
    play.togglePause();
    play.down(centre(HUD.menu));
    play.up(centre(HUD.menu));
    expect(nav).toEqual([]);
    expect(play.loop.paused).toBe(true);
    // the band's MENU again closes the card
    play.down(centre(HUD.menu));
    play.up(centre(HUD.menu));
    expect(play.loop.paused).toBe(false);
    play.down(centre(HUD.menu));
    play.up(centre(HUD.menu));
    play.down(centre(PAUSE.menu));
    play.up(centre(PAUSE.menu));
    expect(nav).toEqual(['levels']);
  });

  it('AUD-U4: Esc opens and closes the pause card, never leaves; R opens it, R on the card restarts', () => {
    const key = (k: string) => play.key({ key: k } as KeyboardEvent);
    key('Escape');
    expect(play.loop.paused).toBe(true);
    key('Escape');
    expect(play.loop.paused).toBe(false);
    expect(nav).toEqual([]);
    const restart = vi.spyOn(play, 'restart').mockImplementation(() => undefined);
    key('r');
    expect(play.loop.paused).toBe(true);
    expect(restart).not.toHaveBeenCalled();
    key('R');
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('AUD-U7: a pause-card button acts only for a press that began on it (RETRY / MENU included)', () => {
    const restart = vi.spyOn(play, 'restart').mockImplementation(() => undefined);
    play.togglePause();
    // a press that starts on SPEED and lifts on MENU / RETRY presses neither
    play.down(centre(PAUSE.speed));
    play.move(centre(PAUSE.menu));
    play.up(centre(PAUSE.menu));
    play.down(centre(PAUSE.resume));
    play.up(centre(PAUSE.retry));
    expect(nav).toEqual([]);
    expect(restart).not.toHaveBeenCalled();
    expect(play.loop.paused).toBe(true);
    // a press that leaves RETRY and comes back still counts; one that ends off it does not
    play.down(centre(PAUSE.retry));
    play.move(centre(PAUSE.howto));
    play.up(centre(PAUSE.retry));
    expect(restart).not.toHaveBeenCalled();
    play.down(centre(PAUSE.retry));
    play.up(pt(PAUSE.retry.x + 6, PAUSE.retry.y + 6));
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('(a) a drag from an own tower that ends on OVERDRIVE does not fire it (no gold spent)', () => {
    gesture(play, { x: 200, y: 1000 }, centre(BOOSTERS.overdrive));
    expect(boosterCommands()).toEqual([]);
    expect(save.gold).toBe(200);
    expect(play.gestures.drag).toBeNull(); // the drag ended through the gestures
  });

  it('(b) a drag that overshoots onto MENU does not leave the level', () => {
    gesture(play, { x: 200, y: 1000 }, centre(HUD.menu));
    expect(nav).toEqual([]);
  });

  it('(c) a swipe from a tower to MENU does not leave the level', () => {
    gesture(play, { x: 520, y: 700 }, centre(HUD.menu));
    expect(nav).toEqual([]);
  });

  it('(d) a swipe from empty ground up to pause does not pause', () => {
    gesture(play, { x: 600, y: 600 }, centre(HUD.pause));
    expect(play.loop.paused).toBe(false);
  });

  it('a press on pause that slides off it and back does not pause either; one that stays on it does', () => {
    play.down(centre(HUD.pause));
    play.move(pt(HUD.mute.x + 10, HUD.mute.y + 10));
    play.move(centre(HUD.pause));
    play.up(centre(HUD.pause));
    expect(play.loop.paused).toBe(false);
    play.down(centre(HUD.pause));
    play.move(pt(HUD.pause.x + 8, HUD.pause.y + 8));
    play.up(pt(HUD.pause.x + 8, HUD.pause.y + 8));
    expect(play.loop.paused).toBe(true);
  });

  it('a press from one button lifted on another presses neither', () => {
    gesture(play, centre(BOOSTERS.freeze), centre(BOOSTERS.overdrive));
    gesture(play, centre(HUD.streams), centre(HUD.menu));
    expect(boosterCommands()).toEqual([]);
    expect(nav).toEqual([]);
  });
});

describe('a press the gestures never saw never reaches them (BUG-37)', () => {
  it('home selected, a press on the STREAMS pill slid onto a reachable tower links nothing', () => {
    play.down(pt(200, 1000));
    play.up(pt(200, 1000));
    expect(play.gestures.selectedTowerId).toBe('p');
    gesture(play, centre(HUD.streams), { x: 520, y: 700 });
    expect(links()).toEqual([]);
    // control: the same tower tapped directly links
    play.down(pt(520, 700));
    play.up(pt(520, 700));
    expect(links()).toEqual([expect.objectContaining({ from: 'p', to: 'n' })]);
  });

  it('a lift with no press (or a press that began while paused) does nothing', () => {
    play.down(pt(200, 1000));
    play.up(pt(200, 1000)); // select p
    play.up(pt(520, 700)); // no down: not a tap on n
    expect(links()).toEqual([]);
    play.togglePause();
    play.down(pt(520, 700));
    play.togglePause();
    play.up(pt(520, 700));
    expect(links()).toEqual([]);
  });

  it('a platform cancel of a HUD press does not finish a drag at its last point', () => {
    play.down(pt(200, 1000));
    play.up(pt(200, 1000)); // select p
    play.down(centre(HUD.streams));
    play.cancel(pt(520, 700));
    expect(links()).toEqual([]);
    // a world drag cancelled mid-way still finishes where the finger was (BUG-33)
    play.down(pt(520, 1000));
    play.move(pt(520, 900));
    play.move(pt(520, 760));
    play.cancel(pt(520, 700));
    expect(links()).toEqual([expect.objectContaining({ from: 'q', to: 'n' })]);
  });
});
