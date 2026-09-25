import { beforeEach, describe, expect, it } from 'vitest';
import type { LevelDef } from '../../src/sim/types';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen } from '../../src/ui/screens';
import { PlayScreen } from '../../src/ui/play';
import { TRIPLE_STREAM_LINKS, evaluateAchievements } from '../../src/economy/achievements';
import { makeLevel, wall } from '../helpers';

/*
 * QA bug hunt 2026-09-22, item 9: `first_triple_stream` (ECON-4) is set from the `linked` events the
 * play screen sees — only for the player's links, and granted once per save.
 */

function fakeApp(save: SaveData) {
  let current: Screen | null = null;
  const app: App = {
    view: {} as View,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {},
    goShop() {},
    goAchievements() {},
    startLevel: () => Promise.resolve(true),
    go(screen) {
      current = screen;
    },
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-09-22',
    weekKey: () => '2026-09-21',
  };
  return { app, current: () => current };
}

/** An L3 player keep `p` and an L3 enemy keep `e`, each with three clear lanes (a, b, c); p–e is walled off. */
function keepLevel(): LevelDef {
  return makeLevel({
    enemies: [{ owner: 'enemy1', personality: 'turtle', aggression: 0 }],
    towers: [
      { id: 'p', x: 360, y: 1100, owner: 'player', units: 100, level: 3 },
      { id: 'a', x: 120, y: 900, owner: 'neutral', units: 30 },
      { id: 'b', x: 360, y: 900, owner: 'neutral', units: 30 },
      { id: 'c', x: 600, y: 900, owner: 'neutral', units: 30 },
      { id: 'e', x: 360, y: 200, owner: 'enemy1', units: 100, level: 3 },
      { id: 'x', x: 120, y: 400, owner: 'neutral', units: 30 },
      { id: 'y', x: 360, y: 400, owner: 'neutral', units: 30 },
      { id: 'z', x: 600, y: 400, owner: 'neutral', units: 30 },
    ],
    obstacles: [wall(0, 650, 720, 650)],
  });
}

let save: SaveData;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
});

function start(): PlayScreen {
  const shell = fakeApp(save);
  const play = new PlayScreen(shell.app, keepLevel(), 3, 1);
  shell.app.go(play);
  return play;
}

/** One 50 ms tick of real time. */
function tick(play: PlayScreen, clock: { now: number }): void {
  clock.now += 50;
  play.update(50, clock.now);
}

describe('first_triple_stream match fact', () => {
  it('three player links from one tower set it; two do not', () => {
    const play = start();
    const clock = { now: 0 };
    play.loop.enqueue({ type: 'link', owner: 'player', from: 'p', to: 'a' });
    play.loop.enqueue({ type: 'link', owner: 'player', from: 'p', to: 'b' });
    tick(play, clock);
    expect(play.state.links.filter((l) => l.owner === 'player')).toHaveLength(2);
    expect(play.match.tripleStream).toBe(false);
    play.loop.enqueue({ type: 'link', owner: 'player', from: 'p', to: 'c' });
    tick(play, clock);
    expect(play.state.links.filter((l) => l.owner === 'player')).toHaveLength(TRIPLE_STREAM_LINKS);
    expect(play.match.tripleStream).toBe(true);
    // stays set once earned, whatever happens to the links afterwards
    play.loop.enqueue({ type: 'unlink', owner: 'player', from: 'p' });
    tick(play, clock);
    expect(play.state.links.filter((l) => l.owner === 'player')).toEqual([]);
    expect(play.match.tripleStream).toBe(true);
  });

  it('three enemy links from one tower never set it, even when a player stream runs alongside', () => {
    const play = start();
    const clock = { now: 0 };
    for (const to of ['x', 'y', 'z']) play.loop.enqueue({ type: 'link', owner: 'enemy1', from: 'e', to });
    play.loop.enqueue({ type: 'link', owner: 'player', from: 'p', to: 'a' });
    tick(play, clock);
    expect(play.state.links.filter((l) => l.owner === 'enemy1')).toHaveLength(3);
    expect(play.match.tripleStream).toBe(false);
    for (let i = 0; i < 20; i++) tick(play, clock);
    expect(play.match.tripleStream).toBe(false);
  });

  it('three links from two different towers (2 + 1) do not count: the fact needs one tower with three', () => {
    const play = start();
    const clock = { now: 0 };
    play.loop.enqueue({ type: 'link', owner: 'player', from: 'p', to: 'a' });
    play.loop.enqueue({ type: 'link', owner: 'player', from: 'p', to: 'b' });
    tick(play, clock);
    Object.assign(play.state.towers['a']!, { owner: 'player', units: 5 }); // the test hands the player a second source (below capacity, so p → a stays a supply line)
    play.loop.enqueue({ type: 'link', owner: 'player', from: 'a', to: 'b' });
    tick(play, clock);
    expect(play.state.links.filter((l) => l.owner === 'player')).toHaveLength(3);
    expect(play.match.tripleStream).toBe(false);
  });

  it('the achievement is granted once per save: a second match with the same fact pays nothing', () => {
    const play = start();
    const clock = { now: 0 };
    for (const to of ['a', 'b', 'c']) play.loop.enqueue({ type: 'link', owner: 'player', from: 'p', to });
    tick(play, clock);
    expect(play.match.tripleStream).toBe(true);
    const first = evaluateAchievements(save, play.match);
    expect(first.unlocked.map((a) => a.id)).toEqual(['first_triple_stream']);
    expect(first.crystals).toBe(5);
    expect(save.crystals).toBe(5);
    const again = start();
    for (const to of ['a', 'b', 'c']) again.loop.enqueue({ type: 'link', owner: 'player', from: 'p', to });
    tick(again, { now: 0 });
    expect(again.match.tripleStream).toBe(true);
    expect(evaluateAchievements(save, again.match)).toEqual({ unlocked: [], crystals: 0 });
    expect(save.crystals).toBe(5);
    expect(save.achievements.unlocked.filter((id) => id === 'first_triple_stream')).toHaveLength(1);
  });
});
