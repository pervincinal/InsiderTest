import { beforeEach, describe, expect, it } from 'vitest';
import type { LevelDef } from '../../src/sim/types';
import { C } from '../../src/sim/constants';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { createAdSession } from '../../src/economy/adsFlow';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, Screen } from '../../src/ui/screens';
import { ResultScreen } from '../../src/ui/result';
import '../registerResult'; // PERF-11: the lazy result chunk is in
import { PlayScreen } from '../../src/ui/play';
import { hashState, liveTimeline, parseReplay, replayOf, serializeReplay, verifyReplay } from '../../src/sim/replay';
import type { Replay } from '../../src/sim/replay';
import { makeLevel } from '../helpers';
import { suicideCommands } from '../../src/debug';

/*
 * SIM-R3 (2026-11-12): the play screen's Continue (`resumeFromSnapshot`: the ring's snapshot ≈ 20 s back, the
 * AI rng streams restored, `applyContinue`'s free Freeze + infantry) is logged into `replayLog` as
 * `{ t: <defeat time>, r: { toMs, freezeMs, infantry } }` right after the abandoned future's commands, so the
 * match's record (`replayOf`, what the debug `getReplay` and DIAG-2 build) re-runs to the live state's hash
 * and verifies — `reason` is no longer 'continued'. The fixture and the drive are tests/ui/continue.test.ts's.
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
    dayKey: () => '2026-11-12',
    weekKey: () => '2026-11-09',
  };
  return { app, current: () => current };
}

/** Two player towers against a strong enemy; the lose bot loses it after a full rewind window (tests/ui/continue.test.ts). */
function losingLevel(): LevelDef {
  return makeLevel({
    star3: 30_000,
    star2: 60_000,
    towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 40, level: 1 },
      { id: 'q', x: 160, y: 900, owner: 'player', units: 24, level: 1 },
      { id: 'e', x: 360, y: 160, owner: 'enemy1', units: 100, level: 3 },
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

const SEED = 7;
let save: SaveData;
beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  save.crystals = 10;
});

/** The match's record as the debug surface / DIAG-2 build it (`hasContinued` passed through). */
const recordOf = (play: PlayScreen): Replay => replayOf(play.level, play.state, play.replayLog, play.hasContinued);

describe('replay record of a continued match (SIM-R3)', () => {
  it('loses, continues, plays to the end: the record carries the rewind entry, is not flagged, and verifies to the live hash', () => {
    const level = losingLevel();
    const shell = fakeApp(save);
    const play = new PlayScreen(shell.app, level, SEED, 20);
    shell.app.go(play);
    play.setLoseBot(suicideCommands);
    const clock = { now: 0 };
    runUntilFinished(play, shell, clock);
    const result = shell.current();
    if (!(result instanceof ResultScreen)) throw new Error('expected the result screen');
    expect(result.info.ui.outcome).toBe('lost');
    const tLost = play.state.time;
    const lostLog = play.replayLog.length;
    const lostRecord = recordOf(play);
    expect(lostRecord.continued).toBeUndefined();
    expect(verifyReplay(level, lostRecord)).toMatchObject({ matches: true, outcome: 'lost', timeMs: tLost });

    result.continueWithCrystals();
    expect(shell.current()).toBe(play);
    expect(play.hasContinued).toBe(true);
    const tCont = play.state.time;
    expect(tLost - tCont).toBeGreaterThanOrEqual(C.CONTINUE_REWIND_MS);

    // the entry: logged once, after the abandoned future's commands, with the defeat's time and the grant
    expect(play.replayLog.length).toBe(lostLog + 1);
    const entry = play.replayLog[lostLog]!;
    expect(entry).toEqual({ t: tLost, r: { toMs: tCont, freezeMs: C.CONTINUE_FREEZE_MS, infantry: C.CONTINUE_INFANTRY } });
    expect(play.replayLog.slice(0, lostLog).some((e) => e.t >= tCont)).toBe(true); // the abandoned future stays in the log
    expect(play.replayLog.slice(0, lostLog).every((e) => !e.r)).toBe(true);

    // right after the rewind: the record closed on the restored, granted state verifies (the re-run lands on it)
    const atContinue = recordOf(play);
    expect(atContinue.continued).toBeUndefined();
    expect(atContinue.outcome).toEqual({ result: 'playing', timeMs: tCont, hash: hashState(play.state) });
    const live = liveTimeline(atContinue.commands);
    expect(live[live.length - 1]).toEqual({ t: tCont, r: entry.r });
    expect(live.every((e) => e.t <= tCont)).toBe(true);
    const vc = verifyReplay(level, atContinue);
    expect(vc.matches, `${vc.reason ?? ''} ${vc.hash} vs ${vc.expected}`).toBe(true);
    expect(vc.reason).toBeUndefined();
    expect(JSON.stringify({ ...vc.state, events: [] })).toBe(JSON.stringify({ ...play.state, events: [] }));

    // the continued match plays to its end (the lose bot is still on: a loss, or — rules v2 — a win)
    runUntilFinished(play, shell, clock);
    const again = shell.current();
    expect(again).toBeInstanceOf(ResultScreen);
    const outcome = (again as ResultScreen).info.ui.outcome;
    expect(['won', 'lost']).toContain(outcome);
    expect(play.state.time).toBeGreaterThan(tCont);
    expect(play.replayLog.filter((e) => e.r).length).toBe(1);
    expect(play.replayLog.slice(lostLog + 1).every((e) => e.c && e.t >= tCont)).toBe(true);

    const record = recordOf(play);
    expect(record.continued).toBeUndefined();
    expect(record.outcome).toEqual({ result: outcome, timeMs: play.state.time, hash: hashState(play.state) });
    const json = serializeReplay(record);
    expect(json).toContain(`{"t":${tLost},"r":{"toMs":${tCont},"freezeMs":${C.CONTINUE_FREEZE_MS},"infantry":${C.CONTINUE_INFANTRY}}}`);
    const parsed = parseReplay(json);
    expect(parsed).toEqual(record);
    const v = verifyReplay(level, parsed);
    expect(v.matches, `${v.reason ?? ''} ${v.hash} vs ${v.expected}`).toBe(true);
    expect(v.reason).toBeUndefined();
    expect(v.outcome).toBe(outcome);
    expect(v.timeMs).toBe(play.state.time);
    expect(v.hash).toBe(hashState(play.state));

    // the rule: the same log without the entry (the pre-SIM-R3 record) does not re-run to the live state
    const without: Replay = { ...record, commands: record.commands.filter((e) => !e.r) };
    expect(verifyReplay(level, without).matches).toBe(false);
    // and the pre-SIM-R3 flag on it still reads as `continued`
    expect(verifyReplay(level, { ...without, continued: true }).reason).toBe('continued');
  });

  it('a match that never continued logs no entry and its record is unchanged', () => {
    const level = losingLevel();
    const shell = fakeApp(save);
    const play = new PlayScreen(shell.app, level, SEED, 20);
    shell.app.go(play);
    play.setLoseBot(suicideCommands);
    runUntilFinished(play, shell, { now: 0 });
    expect(play.hasContinued).toBe(false);
    expect(play.replayLog.some((e) => e.r)).toBe(false);
    const record = recordOf(play);
    expect(record.continued).toBeUndefined();
    expect(liveTimeline(record.commands)).toEqual(record.commands);
    expect(verifyReplay(level, record)).toMatchObject({ matches: true, outcome: 'lost' });
  });
});
