import { beforeEach, describe, expect, it } from 'vitest';
import { loadLevel } from '../../src/levels/index';
import { makeLevel } from '../helpers';
import { GameLoop } from '../../src/ui/loop';
import { PlayScreen } from '../../src/ui/play';
import type { App, Screen } from '../../src/ui/screens';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { createAdSession } from '../../src/economy/adsFlow';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { SaveData } from '../../src/ui/save';
import { createState } from '../../src/sim/create';
import { applyCommand } from '../../src/sim/commands';
import { hashState, parseReplay, replayOf, serializeReplay, verifyReplay } from '../../src/sim/replay';
import type { ReplayEntry } from '../../src/sim/replay';
import { isAiTick, referencePlayerCommands, rngsFor, runAiTick } from '../../src/ai/index';
import { recordHeadless } from '../../scripts/lib/recordReplay';

/*
 * SIM-R1 capture path: the loop's `onCommand` hook records what the sim is about to apply (player queue
 * and AI hook alike), so the play screen's `replayLog` is a replay record (`replayOf`) that re-runs to
 * the live state's hash — the same record the headless recorder makes for the same seed.
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
    dayKey: () => '2026-11-09',
    weekKey: () => '2026-11-09',
  };
  return { app, current: () => current };
}

beforeEach(() => setSaveStorageForTests(null));

describe('GameLoop onCommand hook', () => {
  it('records every applied command with its tick time: the loop record equals the headless record for the same seed', async () => {
    const level = (await loadLevel(3))!;
    const seed = 1;
    const headless = recordHeadless(level, seed, referencePlayerCommands);

    const log: ReplayEntry[] = [];
    const rngs = rngsFor(seed, level.enemies);
    const loop = new GameLoop({
      // the headless order: the player's commands first, then the enemies', on every AI tick
      beforeTick: (s) => (isAiTick(s) ? [...referencePlayerCommands(s, rngs.player), ...runAiTick(s, rngs.enemies, undefined, level.ai)] : undefined),
      onCommand: (c, t, a) => void log.push({ t, c, a }),
    });
    loop.load(createState(level, seed));
    let guard = 0;
    while (!loop.finished && guard++ < 10_000) loop.advance(50);
    expect(loop.finished).toBe(true);

    const replay = replayOf(level, loop.state!, log);
    expect(replay.commands.length).toBe(headless.replay.commands.length);
    expect(serializeReplay(replay)).toBe(serializeReplay(headless.replay));
    expect(replay.outcome).toEqual(headless.replay.outcome);
    expect(verifyReplay(level, parseReplay(serializeReplay(replay))).matches).toBe(true);
    // the loop drains `events` after every step; everything else of the state is identical to the headless run
    expect(JSON.stringify({ ...loop.state!, events: [] })).toBe(JSON.stringify({ ...headless.state, events: [] }));
  });

  it('queued (player) commands are recorded without the `a` flag at the time of the frame’s first tick, AI commands with it', () => {
    const level = makeLevel();
    const log: ReplayEntry[] = [];
    const loop = new GameLoop({
      beforeTick: (s) => (s.time === 1000 ? [{ type: 'link', owner: 'enemy1', from: 'e', to: 'p' }] : undefined),
      onCommand: (c, t, a) => void log.push({ t, c, a }),
    });
    loop.load(createState(level, 1));
    loop.advance(50); // t 0 → 50, nothing queued
    loop.enqueue({ type: 'link', owner: 'player', from: 'p', to: 'e' });
    loop.advance(100); // the queued command applies before the tick at t = 50
    expect(loop.state!.time).toBe(150);
    for (let i = 0; i < 4; i++) loop.advance(250); // a frame is clamped at 250 ms: 5 ticks each → 1150, the AI command at t = 1000
    expect(loop.state!.time).toBe(1150);
    expect(JSON.parse(JSON.stringify(log))).toEqual([
      { t: 50, c: { type: 'link', owner: 'player', from: 'p', to: 'e' } },
      { t: 1000, c: { type: 'link', owner: 'enemy1', from: 'e', to: 'p' }, a: 1 },
    ]);
    // and a re-run of exactly that log lands on the live state
    const replay = replayOf(level, loop.state!, log);
    const v = verifyReplay(level, replay);
    expect(v.matches).toBe(true);
    expect(v.timeMs).toBe(1150);
  });

  it('a command the sim ignores is still recorded (the record is what was asked, the sim decides)', () => {
    const level = makeLevel();
    const log: ReplayEntry[] = [];
    const loop = new GameLoop({ onCommand: (c, t, a) => void log.push({ t, c, a }) });
    loop.load(createState(level, 1));
    loop.enqueue({ type: 'link', owner: 'player', from: 'e', to: 'p' }); // not the player's tower: ignored
    loop.advance(50);
    expect(loop.state!.links).toEqual([]);
    expect(log.length).toBe(1);
    const check = createState(level, 1);
    applyCommand(check, log[0]!.c);
    expect(check.links).toEqual([]);
    expect(verifyReplay(level, replayOf(level, loop.state!, log)).matches).toBe(true);
  });
});

describe('PlayScreen replayLog', () => {
  it('an autoplay match on level 15 is a closed record that re-runs to the screen’s final state', async () => {
    const level = (await loadLevel(15))!; // no tutorial (levels 1–4 gate the sim on the player's steps)
    const shell = fakeApp(defaultSave());
    const play = new PlayScreen(shell.app, level, 1, 20);
    shell.app.go(play);
    play.setPlayerBot(referencePlayerCommands);
    let now = 0;
    let frames = 0;
    while (shell.current() === play && play.state.time < 180_000 && frames++ < 2000) {
      now += 250;
      play.update(250, now);
    }
    expect(play.loop.finished).toBe(true);
    expect(play.replayLog.length).toBeGreaterThan(5);
    expect(play.replayLog.every((e) => e.a === 1)).toBe(true); // every command came from the AI hook (enemies + the autoplay bot)
    expect(play.replayLog.some((e) => e.c.owner === 'player')).toBe(true);
    expect(play.replayLog.some((e) => e.c.owner === 'enemy1')).toBe(true);

    const json = serializeReplay(replayOf(play.level, play.state, play.replayLog, play.hasContinued));
    const replay = parseReplay(json);
    expect(replay.levelId).toBe(15);
    expect(replay.seed).toBe(1);
    expect(replay.continued).toBeUndefined();
    expect(replay.outcome!.result).toBe('won');
    expect(replay.outcome!.timeMs).toBe(play.state.time);
    const v = verifyReplay(level, replay);
    expect(v.matches).toBe(true);
    expect(v.hash).toBe(hashState(play.state));
    expect(JSON.stringify({ ...v.state, events: [] })).toBe(JSON.stringify({ ...play.state, events: [] }));
  });

  it('a human-style command (enqueue) is logged without the `a` flag and the record still verifies', () => {
    const level = makeLevel();
    const shell = fakeApp(defaultSave());
    const play = new PlayScreen(shell.app, level, 3, 20);
    shell.app.go(play);
    play.startMatch();
    play.loop.enqueue({ type: 'link', owner: 'player', from: 'p', to: 'e' });
    let now = 0;
    for (let i = 0; i < 40; i++) {
      now += 250;
      play.update(250, now);
    }
    const first = play.replayLog[0]!;
    expect(first.c).toEqual({ type: 'link', owner: 'player', from: 'p', to: 'e' });
    expect(first.a).toBeUndefined();
    expect(play.replayLog.some((e) => e.a === 1 && e.c.owner === 'enemy1')).toBe(true);
    expect(verifyReplay(level, replayOf(play.level, play.state, play.replayLog, play.hasContinued)).matches).toBe(true);
  });
});
