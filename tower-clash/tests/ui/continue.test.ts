import { beforeEach, describe, expect, it } from 'vitest';
import type { GameState, LevelDef } from '../../src/sim/types';
import { C } from '../../src/sim/constants';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests, starsFor } from '../../src/ui/save';
import type { App, Screen, StartOptions } from '../../src/ui/screens';
import { ResultScreen } from '../../src/ui/screens';
import { PlayScreen } from '../../src/ui/play';
import { makeLevel } from '../helpers';

/* Minimal application shell: records navigation and level starts, no DOM. */
function fakeApp(save: SaveData) {
  const starts: { levelId: number; opts?: StartOptions }[] = [];
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
    startLevel(levelId, _seed, opts) {
      starts.push({ levelId, opts });
      return Promise.resolve(true);
    },
    go(screen) {
      current = screen;
    },
    openSettings() {},
    setSpeed() {},
    setLanguage() {},
  };
  return { app, starts, current: () => current };
}

/**
 * Two player towers against a strong enemy; the debug "suicide" mode loses it after ~22+ s of sim
 * time (the rules-v2 rusher streams its garrison, so the enemy sits a long road away and the
 * player starts with a few more defenders than before to keep a full rewind window in play).
 */
function losingLevel(): LevelDef {
  return makeLevel({
    star3: 30_000,
    star2: 60_000,
    towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 40, level: 1 },
      { id: 'q', x: 160, y: 900, owner: 'player', units: 24, level: 1 },
      { id: 'e', x: 360, y: 160, owner: 'enemy1', units: 100, level: 1 },
    ],
    roads: [
      { a: 'p', b: 'e' },
      { a: 'q', b: 'p' },
      { a: 'q', b: 'e' },
    ],
  });
}

/** Drive the screen at ×20 (10 ticks per 250 ms frame) until it leaves or `maxSimMs` passes. */
function runUntilFinished(play: PlayScreen, shell: ReturnType<typeof fakeApp>, clock: { now: number }, maxSimMs = 300_000): void {
  const start = play.state.time;
  while (shell.current() === play && play.state.time - start < maxSimMs) {
    clock.now += 250;
    play.update(250, clock.now);
  }
}

let save: SaveData;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  save.crystals = 10;
});

const SEED = 7;

/** Start a level in suicide mode at ×20 and drive it to the defeat screen. */
function loseLevel(level: LevelDef) {
  const shell = fakeApp(save);
  const play = new PlayScreen(shell.app, level, SEED, 20);
  shell.app.go(play);
  play.setSuicide(true);
  const clock = { now: 0 };
  runUntilFinished(play, shell, clock);
  const result = shell.current();
  if (!(result instanceof ResultScreen)) throw new Error('expected the result screen');
  return { shell, play, clock, result };
}

/** A fresh, identical run stepped tick by tick to exactly `timeMs` (determinism reference). */
function replayTo(level: LevelDef, timeMs: number): GameState {
  const shell = fakeApp(defaultSave());
  const play = new PlayScreen(shell.app, level, SEED, 20);
  shell.app.go(play);
  play.setSuicide(true);
  let now = 0;
  while (play.state.time < timeMs) {
    now += 2.5; // × 20 = one 50 ms tick
    play.update(2.5, now);
  }
  return play.state;
}

function playerTowers(state: GameState) {
  return Object.values(state.towers).filter((t) => t.owner === 'player');
}

describe('continue after defeat — rewind (ECONOMY.md §3.5, ECON-6b)', () => {
  it('rewinds ~20 s to a deterministic snapshot, grants the freeze + infantry and resumes on the same screen', () => {
    const level = losingLevel();
    const { shell, play, result } = loseLevel(level);
    const tLost = play.state.time;
    const lostState = play.state;
    expect(tLost).toBeGreaterThanOrEqual(C.CONTINUE_REWIND_MS + 2000); // the fixture must lose after a full rewind window
    expect(result.info.ui.outcome).toBe('lost');
    expect(result.info.continued).toBe(false);
    expect(result.extras().continueCrystals).toBe(10);

    result.continueWithCrystals();
    expect(save.crystals).toBe(0);
    expect(shell.current()).toBe(play);
    expect(play.hasContinued).toBe(true);
    expect(play.loop.paused).toBe(false);
    expect(play.loop.finished).toBe(false);

    const back = tLost - play.state.time;
    expect(back).toBeGreaterThanOrEqual(C.CONTINUE_REWIND_MS);
    expect(back).toBeLessThan(C.CONTINUE_REWIND_MS + C.SNAPSHOT_INTERVAL_MS);
    expect(play.state).not.toBe(lostState);
    expect(play.elapsedMs()).toBe(tLost); // the star clock keeps the original start

    // the free freeze
    expect(play.state.boosters).toEqual([{ type: 'freeze', owner: 'player', untilMs: play.state.time + C.CONTINUE_FREEZE_MS }]);
    // the restored state equals a fresh replay to the same tick, plus the infantry on the strongest tower
    const ref = replayTo(level, play.state.time);
    expect(ref.time).toBe(play.state.time);
    const refPlayer = playerTowers(ref);
    expect(refPlayer.length).toBeGreaterThan(0);
    const strongest = refPlayer.reduce((a, b) => (b.units > a.units ? b : a));
    const expectedTowers = structuredClone(ref.towers);
    const cap = C.CAPACITY[strongest.level]!;
    expectedTowers[strongest.id]!.units = Math.min(cap, strongest.units + C.CONTINUE_INFANTRY);
    expect(play.state.towers).toEqual(expectedTowers);
    expect(play.state.units).toEqual(ref.units);
    expect(play.state.queues).toEqual(ref.queues);
    expect(play.state.links).toEqual(ref.links);
    expect(play.state.rngState).toBe(ref.rngState);
  });

  it('the rewound match replays deterministically (AI rng streams are restored with the state)', () => {
    const level = losingLevel();
    const a = loseLevel(level);
    a.result.continueWithCrystals();
    const t0 = a.play.state.time;
    // reference: the same continue on an identical run
    save.crystals = 10;
    const b = loseLevel(level);
    b.result.continueWithCrystals();
    expect(b.play.state.time).toBe(t0);
    for (let i = 0; i < 40; i++) {
      a.clock.now += 250;
      a.play.update(250, a.clock.now);
      b.clock.now += 250;
      b.play.update(250, b.clock.now);
    }
    expect(a.play.state.time).toBeGreaterThan(t0 + 5000);
    expect(a.play.state).toEqual(b.play.state);
  });

  it('result stars use the original clock, not the rewound sim time', () => {
    const level = losingLevel();
    const { shell, play, clock, result } = loseLevel(level);
    result.continueWithCrystals();
    play.setSuicide(false);
    // force a win now: by sim time this is a 3★ finish, by the original clock only 2★
    const state = play.state;
    level.star3 = state.time + 5000;
    level.star2 = play.elapsedMs() + 5000;
    for (const t of Object.values(state.towers)) t.owner = 'player';
    state.units = state.units.filter((u) => u.owner === 'player');
    state.queues = state.queues.filter((q) => q.owner === 'player');
    state.links = state.links.filter((l) => l.owner === 'player');
    clock.now += 250;
    play.update(250, clock.now);
    const won = shell.current();
    expect(won).toBeInstanceOf(ResultScreen);
    const info = (won as ResultScreen).info;
    expect(info.ui.outcome).toBe('won');
    expect(starsFor(level, info.state.time)).toBe(3);
    expect(info.ui.stars).toBe(2);
    expect(save.stars[String(level.id)]).toBe(2);
    expect(play.match.timeMs).toBe(play.elapsedMs());
  });

  it('is offered once per attempt: a second defeat has no continue and the crystals stay', () => {
    const level = losingLevel();
    const { shell, play, clock, result } = loseLevel(level);
    result.continueWithCrystals();
    expect(play.resumeFromSnapshot()).toBe(false); // already used (and the level is running)
    // lose again right away (the reinforced run would otherwise win): every player tower falls
    const state = play.state;
    for (const t of Object.values(state.towers)) if (t.owner === 'player') t.owner = 'enemy1';
    state.units = state.units.filter((u) => u.owner !== 'player');
    state.queues = state.queues.filter((q) => q.owner !== 'player');
    state.links = state.links.filter((l) => l.owner !== 'player');
    clock.now += 250;
    play.update(250, clock.now);
    const again = shell.current();
    expect(again).toBeInstanceOf(ResultScreen);
    const r2 = again as ResultScreen;
    expect(r2.info.ui.outcome).toBe('lost');
    expect(r2.info.continued).toBe(true);
    expect(r2.extras().continueCrystals).toBeNull();
    expect(r2.extras().continueAd).toBe(false);
    save.crystals = 10;
    r2.continueWithCrystals();
    expect(save.crystals).toBe(10);
    expect(shell.current()).toBe(r2);
    expect(shell.starts).toEqual([]);
  });

  it('falls back to a restart with the bonus garrison when no snapshot can be resumed', () => {
    const level = losingLevel();
    const { shell, result } = loseLevel(level);
    const fallback = new ResultScreen(shell.app, { ...result.info, resume: () => false });
    fallback.continueWithCrystals();
    expect(save.crystals).toBe(0);
    expect(shell.starts).toEqual([{ levelId: level.id, opts: { reinforcements: true } }]);
    // the restarted attempt carries the bonus and cannot continue again
    const restarted = new PlayScreen(shell.app, level, SEED, 20, { reinforcements: true });
    expect(restarted.hasContinued).toBe(true);
    expect(restarted.state.modifiers.startGarrisonBonus).toBe(C.CONTINUE_INFANTRY);
    expect(restarted.resumeFromSnapshot()).toBe(false);
  });

  it('without a continue the clock is plain sim time and the offer is present', () => {
    const level = losingLevel();
    const { play, result } = loseLevel(level);
    expect(play.elapsedMs()).toBe(play.state.time);
    expect(play.hasContinued).toBe(false);
    expect(result.extras().continueCrystals).toBe(10);
  });
});
