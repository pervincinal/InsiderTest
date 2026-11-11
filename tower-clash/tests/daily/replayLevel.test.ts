import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import { createAdSession } from '../../src/economy/adsFlow';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { SaveData } from '../../src/ui/save';
import type { App, Screen, StartOptions } from '../../src/ui/screens';
import '../registerResult'; // PERF-11: the lazy result chunk is in (the play screen presents the result)
import { PlayScreen } from '../../src/ui/play';
import { diagReplayOf } from '../../src/ui/diagnostics';
import { loadLevel } from '../../src/levels/index';
import { TWISTS, challengeFor, weeklyFor } from '../../src/daily/challenge';
import { challengeMismatch, levelForReplay, rebuildChallenge } from '../../src/daily/replayLevel';
import type { Replay } from '../../src/sim/replay';
import { challengeDescriptor, hashState, parseReplay, replayOf, serializeReplay, verifyReplay } from '../../src/sim/replay';
import { DEFAULT_MODIFIERS } from '../../src/sim/types';
import { referencePlayerCommands } from '../../src/ai/index';
import { recordChallengeHeadless, recordHeadless } from '../../scripts/lib/recordReplay';

/*
 * SIM-R2 (2026-11-11): a Daily / Weekly Challenge record carries `challenge: { kind, key, twist }` and
 * src/daily/replayLevel.ts rebuilds the challenge from the key through the generator, checks the record's
 * level / seed / twist / modifiers against it and hands the verifier the level. Here: the rebuild, every
 * mismatch, a daily and a weekly match recorded through the play screen's GameLoop that verify, the
 * diagnostics row's record carrying the descriptor, and the committed fixture.
 */

/** `npx tsx scripts/replay.ts --record-daily 2026-11-11 --out tests/fixtures/replay-daily-2026-11-11.json` (level 37 "Tank Country", seed 542490, plain). */
const FIXTURE_KEY = '2026-11-11';
const FIXTURE = readFileSync(new URL(`../fixtures/replay-daily-${FIXTURE_KEY}.json`, import.meta.url), 'utf8');
/** A Monday after the AUD-B13 cut-over: level 42 "Siege Engine", lean (tests/daily/weeklyCycle.test.ts). */
const WEEK_KEY = '2026-11-09';
/** A day whose twist is not plain, so the modifiers check has something to see (2026-11-10 is the day before the fixture's). */
const TWISTED_DAY = '2026-11-10';

function fakeApp(save: SaveData, dayKey: string, weekKey: string) {
  const starts: { levelId: number; seed?: number; opts?: StartOptions }[] = [];
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
    startLevel(levelId, seed, opts) {
      starts.push({ levelId, seed, opts });
      return Promise.resolve(true);
    },
    go(screen) {
      current = screen;
    },
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => dayKey,
    weekKey: () => weekKey,
  };
  return { app, starts, current: () => current };
}

/** Drive a play screen with the reference bot at ×20 until it leaves (result) or 180 s of sim. */
function playOut(play: PlayScreen, current: () => Screen | null): void {
  play.setPlayerBot(referencePlayerCommands);
  let now = 0;
  let frames = 0;
  while (current() === play && play.state.time < 180_000 && frames++ < 4000) {
    now += 250;
    play.update(250, now);
  }
  expect(play.loop.finished).toBe(true);
}

beforeEach(() => setSaveStorageForTests(null));

describe('rebuildChallenge / challengeMismatch', () => {
  it('rebuilds a daily and a weekly from the key alone, the way the generator makes them', () => {
    const d = challengeFor(TWISTED_DAY);
    expect(d.twist.id).not.toBe('plain');
    expect(rebuildChallenge({ kind: 'daily', key: TWISTED_DAY, twist: d.twist.id })).toEqual({ kind: 'daily', key: TWISTED_DAY, levelId: d.levelId, seed: d.seed, twist: d.twist });
    const w = weeklyFor(WEEK_KEY);
    expect(rebuildChallenge({ kind: 'weekly', key: WEEK_KEY, twist: w.twist.id })).toEqual({ kind: 'weekly', key: WEEK_KEY, levelId: w.levelId, seed: w.seed, twist: w.twist });
    // the twist id in the descriptor is not an input: the rebuild ignores it (challengeMismatch compares it)
    expect(rebuildChallenge({ kind: 'daily', key: TWISTED_DAY, twist: 'nonsense' }).twist).toBe(d.twist);
    expect(() => rebuildChallenge({ kind: 'daily', key: 'yesterday', twist: 'plain' })).toThrow(/bad day key/);
    expect(() => rebuildChallenge({ kind: 'weekly', key: '2026-11-10', twist: 'lean' })).toThrow(/not a Monday/);
  });

  it('a consistent descriptor has no mismatch; a campaign record (no descriptor) has none either', async () => {
    const d = challengeFor(TWISTED_DAY);
    const level = (await loadLevel(d.levelId))!;
    const { replay } = recordChallengeHeadless(level, rebuildChallenge({ kind: 'daily', key: TWISTED_DAY, twist: d.twist.id }), referencePlayerCommands, 5000);
    expect(replay.challenge).toEqual({ kind: 'daily', key: TWISTED_DAY, twist: d.twist.id });
    expect(replay.modifiers).toEqual(d.twist.modifiers);
    expect(replay.seed).toBe(d.seed);
    expect(challengeMismatch(replay)).toBeNull();
    expect(challengeMismatch(recordHeadless(level, 1, referencePlayerCommands, 1000).replay)).toBeNull();
    expect((await levelForReplay(replay)).id).toBe(d.levelId);
  });

  it('names every tampered field: key, twist, seed, level, modifiers, malformed key', async () => {
    const d = challengeFor(TWISTED_DAY);
    const level = (await loadLevel(d.levelId))!;
    const base = recordChallengeHeadless(level, rebuildChallenge({ kind: 'daily', key: TWISTED_DAY, twist: d.twist.id }), referencePlayerCommands, 5000).replay;
    const clone = (): Replay => parseReplay(serializeReplay(base));

    const otherDay = clone();
    otherDay.challenge!.key = FIXTURE_KEY; // another day: another level or seed
    expect(challengeMismatch(otherDay)).toMatch(/^daily 2026-11-11 plays (level|seed) \d+, the record says/);
    await expect(levelForReplay(otherDay)).rejects.toThrow(/challenge descriptor does not match the record/);

    const otherTwist = clone();
    otherTwist.challenge!.twist = 'plain';
    expect(challengeMismatch(otherTwist)).toBe(`daily ${TWISTED_DAY} plays twist ${d.twist.id}, the record says plain`);

    const otherSeed = clone();
    otherSeed.seed = d.seed + 1;
    expect(challengeMismatch(otherSeed)).toBe(`daily ${TWISTED_DAY} plays seed ${d.seed}, the record says seed ${d.seed + 1}`);

    const otherLevel = clone();
    otherLevel.levelId = d.levelId === 9 ? 10 : 9;
    expect(challengeMismatch(otherLevel)).toBe(`daily ${TWISTED_DAY} plays level ${d.levelId}, the record says level ${otherLevel.levelId}`);

    const otherMods = clone();
    otherMods.modifiers = { ...DEFAULT_MODIFIERS }; // the twist's modifiers replaced by the plain set
    expect(challengeMismatch(otherMods)).toMatch(new RegExp(`^daily ${TWISTED_DAY} twist ${d.twist.id} has modifiers `));

    const badKey = clone();
    badKey.challenge!.key = 'yesterday';
    expect(challengeMismatch(badKey)).toMatch(/bad day key yesterday/);
    const notMonday = clone();
    notMonday.challenge = { kind: 'weekly', key: TWISTED_DAY, twist: 'lean' };
    expect(challengeMismatch(notMonday)).toMatch(/not a Monday key/);

    // the field order of the modifiers does not matter
    const reordered = clone();
    const m = reordered.modifiers;
    reordered.modifiers = { unitSpeedMul: m.unitSpeedMul, startGarrisonBonus: m.startGarrisonBonus, capacityMul: m.capacityMul, productionMul: m.productionMul };
    expect(challengeMismatch(reordered)).toBeNull();
  });

  it('levelForReplay loads a campaign record’s level and refuses an unknown one; the loader is injectable', async () => {
    const level = (await loadLevel(3))!;
    const replay = recordHeadless(level, 1, referencePlayerCommands, 1000).replay;
    expect((await levelForReplay(replay)).id).toBe(3);
    expect((await levelForReplay(replay, (id) => (id === 3 ? level : undefined))).id).toBe(3);
    await expect(levelForReplay({ ...replay, levelId: 9999 })).rejects.toThrow(/level 9999 is not a shipped level/);
    await expect(levelForReplay(replay, () => undefined)).rejects.toThrow(/level 3 is not a shipped level/);
  });
});

describe('a challenge match through the play screen (GameLoop) verifies', () => {
  it(`daily ${TWISTED_DAY}: the record carries the descriptor and the twist's modifiers, and re-runs through levelForReplay`, async () => {
    const challenge = challengeFor(TWISTED_DAY);
    const level = (await loadLevel(challenge.levelId))!;
    const shell = fakeApp(defaultSave(), TWISTED_DAY, WEEK_KEY);
    const play = new PlayScreen(shell.app, level, challenge.seed, 20, { challenge });
    shell.app.go(play);
    playOut(play, shell.current);

    const desc = challengeDescriptor(play.challenge, play.weekly);
    expect(desc).toEqual({ kind: 'daily', key: TWISTED_DAY, twist: challenge.twist.id });
    const json = serializeReplay(replayOf(play.level, play.state, play.replayLog, play.hasContinued, desc));
    const replay = parseReplay(json);
    expect(replay.challenge).toEqual(desc);
    expect(replay.levelId).toBe(challenge.levelId);
    expect(replay.seed).toBe(challenge.seed);
    expect(replay.modifiers).toEqual(challenge.twist.modifiers);
    expect(replay.modifiers).not.toEqual(DEFAULT_MODIFIERS);
    expect(replay.outcome!.timeMs).toBe(play.state.time);

    const rebuilt = await levelForReplay(replay);
    expect(rebuilt.id).toBe(challenge.levelId);
    const v = verifyReplay(rebuilt, replay);
    expect(v.matches, `${v.reason ?? ''} ${v.hash} vs ${v.expected}`).toBe(true);
    expect(v.hash).toBe(hashState(play.state));

    // the diagnostics row's record (DIAG-2) is the same one, descriptor included
    const diag = diagReplayOf(play);
    expect(diag && 'challenge' in diag ? diag.challenge : undefined).toEqual(desc);
    expect(serializeReplay(diag as Replay)).toBe(json);

    // a tampered descriptor on that very record fails
    const tampered = parseReplay(json);
    tampered.challenge!.key = FIXTURE_KEY;
    await expect(levelForReplay(tampered)).rejects.toThrow(/does not match the record/);
  });

  it(`weekly ${WEEK_KEY}: descriptor kind weekly, Monday key, the week's twist; verifies; matches the headless record of the same week`, async () => {
    const weekly = weeklyFor(WEEK_KEY);
    const level = (await loadLevel(weekly.levelId))!;
    const shell = fakeApp(defaultSave(), '2026-11-11', WEEK_KEY);
    const play = new PlayScreen(shell.app, level, weekly.seed, 20, { weekly });
    shell.app.go(play);
    playOut(play, shell.current);

    const replay = parseReplay(serializeReplay(replayOf(play.level, play.state, play.replayLog, play.hasContinued, challengeDescriptor(play.challenge, play.weekly))));
    expect(replay.challenge).toEqual({ kind: 'weekly', key: WEEK_KEY, twist: weekly.twist.id });
    expect(replay.modifiers).toEqual(weekly.twist.modifiers);
    expect(challengeMismatch(replay)).toBeNull();
    const v = verifyReplay(await levelForReplay(replay), replay);
    expect(v.matches, `${v.reason ?? ''} ${v.hash} vs ${v.expected}`).toBe(true);

    // the headless recorder of the same week (what scripts/replay.ts --record-weekly writes) lands on the same final
    // state (the play screen applies the enemies' commands before the autoplay bot's on a tick, the headless loop the
    // player's first — a different record order within a tick, the same match)
    const headless = recordChallengeHeadless(level, rebuildChallenge(replay.challenge!), referencePlayerCommands).replay;
    expect(headless.challenge).toEqual(replay.challenge);
    expect(headless.modifiers).toEqual(replay.modifiers);
    expect(headless.commands.length).toBe(replay.commands.length);
    expect(headless.outcome).toEqual(replay.outcome);

    const diag = diagReplayOf(play);
    expect(diag && 'challenge' in diag ? diag.challenge : undefined).toEqual(replay.challenge);
  });

  it('a campaign match through the same screen carries no descriptor', async () => {
    const level = (await loadLevel(15))!;
    const shell = fakeApp(defaultSave(), '2026-11-11', WEEK_KEY);
    const play = new PlayScreen(shell.app, level, 1, 20);
    shell.app.go(play);
    playOut(play, shell.current);
    expect(challengeDescriptor(play.challenge, play.weekly)).toBeUndefined();
    const diag = diagReplayOf(play);
    expect(diag && 'challenge' in diag ? diag.challenge : undefined).toBeUndefined();
    expect(serializeReplay(diag as Replay)).not.toContain('"challenge"');
  });
});

describe('the committed daily fixture', () => {
  it(`replay-daily-${FIXTURE_KEY}.json rebuilds through the generator, verifies on this build and equals a fresh recording`, async () => {
    const fixture = parseReplay(FIXTURE);
    expect(fixture.v).toBe(1);
    expect(fixture.challenge).toEqual({ kind: 'daily', key: FIXTURE_KEY, twist: 'plain' });
    const d = challengeFor(FIXTURE_KEY);
    expect(fixture.levelId).toBe(d.levelId);
    expect(fixture.seed).toBe(d.seed);
    expect(fixture.levelId).toBe(37);
    expect(challengeMismatch(fixture)).toBeNull();
    const level = await levelForReplay(fixture);
    const v = verifyReplay(level, fixture);
    expect(v.matches, `re-record the fixture when a sim rule changes: ${v.reason ?? ''} ${v.hash} vs ${v.expected}`).toBe(true);
    expect(v.rulesMatch, 'a sim constant changed since the fixture was recorded — re-record it').toBe(true);
    expect(v.outcome).toBe('won');
    const fresh = recordChallengeHeadless(level, rebuildChallenge(fixture.challenge!), referencePlayerCommands).replay;
    expect(fresh.outcome).toEqual(fixture.outcome);
    expect(serializeReplay(fresh) + '\n').toBe(FIXTURE);
    expect(FIXTURE.length).toBeLessThan(32_768); // fits a DIAG-2 row
    expect(TWISTS.some((t) => t.id === fixture.challenge!.twist)).toBe(true);
  });
});
