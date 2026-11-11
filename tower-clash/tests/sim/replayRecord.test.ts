import { describe, expect, it } from 'vitest';
import { loadLevel } from '../../src/levels/index';
import { makeLevel } from '../helpers';
import { C } from '../../src/sim/constants';
import { SNAPSHOT_VERSION } from '../../src/sim/snapshot';
import { createState } from '../../src/sim/create';
import {
  REPLAY_VERSION,
  challengeDescriptor,
  finishReplay,
  fnv1a,
  hashState,
  newReplay,
  parseReplay,
  recordInto,
  replayOf,
  rulesId,
  runReplay,
  serializeReplay,
  verifyReplay,
} from '../../src/sim/replay';
import type { Replay, ReplayEntry } from '../../src/sim/replay';
import type { Command } from '../../src/sim/types';
import { referencePlayerCommands } from '../../src/ai/index';
import { recordHeadless } from '../../scripts/lib/recordReplay';
import { readFileSync } from 'node:fs';

/** The committed fixture (`npx tsx scripts/replay.ts --record 15 1 --out tests/fixtures/replay-l15-s1.json`), read by e2e/replay.spec.ts too. */
const FIXTURE = readFileSync(new URL('../fixtures/replay-l15-s1.json', import.meta.url), 'utf8');

/*
 * SIM-R1 replay record v1 (src/sim/replay.ts): a headless reference-bot match recorded, serialized to JSON,
 * parsed back and re-run from the record alone reaches the identical final state. The AI is not consulted
 * at playback — every command (both bots') is in the record.
 */

const LEVEL_IDS = [3, 15, 49] as const;
const SEEDS = [1, 2] as const;

describe('replay record v1: record → JSON → re-run', () => {
  for (const id of LEVEL_IDS) {
    for (const seed of SEEDS) {
      it(`level ${id} seed ${seed}: the re-run from JSON ends on the recorded hash, outcome and time`, async () => {
        const level = (await loadLevel(id))!;
        const { replay, state } = recordHeadless(level, seed, referencePlayerCommands);
        expect(replay.outcome!.result).toBe('won'); // the reference player wins every shipped level (playtest gate)
        expect(replay.outcome!.timeMs).toBe(state.time);
        expect(replay.outcome!.hash).toBe(hashState(state));
        expect(replay.commands.length).toBeGreaterThan(5);
        for (const e of replay.commands) expect(e.a).toBe(1); // both sides were bots

        const json = serializeReplay(replay);
        const parsed = parseReplay(json);
        expect(parsed).toEqual(replay);
        const rerun = runReplay(level, parsed);
        expect(rerun.time).toBe(state.time);
        expect(hashState(rerun)).toBe(replay.outcome!.hash);
        expect(JSON.stringify(rerun)).toBe(JSON.stringify(state)); // the hash stands for the whole state (events included here: both loops are headless)

        const v = verifyReplay(level, parsed);
        expect(v.matches).toBe(true);
        expect(v.rulesMatch).toBe(true);
        expect(v.hash).toBe(replay.outcome!.hash);
        expect(v.outcome).toBe('won');
        expect(v.timeMs).toBe(state.time);
        expect(v.reason).toBeUndefined();
      });
    }
  }

  it('entries carry the sim time of the tick they precede, in application order, and on 500 ms AI ticks', async () => {
    const level = (await loadLevel(3))!;
    const { replay } = recordHeadless(level, 1, referencePlayerCommands);
    let last = 0;
    for (const e of replay.commands) {
      expect(e.t).toBeGreaterThanOrEqual(last);
      expect(e.t % C.AI_TICK_MS).toBe(0);
      expect(e.t % C.TICK_MS).toBe(0);
      last = e.t;
    }
    expect(replay.commands[0]!.t).toBe(0); // the bots act on tick 0
    expect(replay.commands[0]!.c.owner).toBe('player'); // the player's commands land first on a tick (like a tap)
  });

  it('the `a` flag is informational: a record with the flags stripped re-runs to the same hash', async () => {
    const level = (await loadLevel(15))!;
    const { replay } = recordHeadless(level, 2, referencePlayerCommands);
    const stripped: Replay = { ...replay, commands: replay.commands.map(({ t, c }) => ({ t, c })) };
    expect(verifyReplay(level, stripped).matches).toBe(true);
  });
});

describe('replay record v1: mismatches', () => {
  it('a mutated command (another target) ends on a different hash and verify says so', async () => {
    const level = (await loadLevel(15))!;
    const { replay } = recordHeadless(level, 1, referencePlayerCommands);
    const json = serializeReplay(replay);
    const mutated = parseReplay(json);
    // the player's first link: swap the target for another lane-connected tower of the same source
    const first = mutated.commands.find((e) => e.c.type === 'link' && e.c.owner === 'player')!;
    const link = first.c as Extract<Command, { type: 'link' }>;
    const state = createState(level, replay.seed);
    const other = Object.values(state.roads).find((r) => (r.a === link.from || r.b === link.from) && r.a !== link.to && r.b !== link.to)!;
    link.to = other.a === link.from ? other.b : other.a;
    const v = verifyReplay(level, mutated);
    expect(v.matches).toBe(false);
    expect(v.rulesMatch).toBe(true);
    expect(v.hash).not.toBe(replay.outcome!.hash);
    expect(['hash', 'time', 'outcome']).toContain(v.reason);
    // and the untouched record still verifies (the mutation did not leak through the parse)
    expect(verifyReplay(level, parseReplay(json)).matches).toBe(true);
  });

  it('a dropped command mismatches too', async () => {
    const level = (await loadLevel(3))!;
    const { replay } = recordHeadless(level, 2, referencePlayerCommands);
    const dropped = parseReplay(serializeReplay(replay));
    dropped.commands.splice(2, 1);
    expect(verifyReplay(level, dropped).matches).toBe(false);
  });

  it('another seed, another record: hashes differ', async () => {
    const level = (await loadLevel(3))!;
    const a = recordHeadless(level, 1, referencePlayerCommands).replay;
    const b = recordHeadless(level, 2, referencePlayerCommands).replay;
    expect(a.outcome!.hash).not.toBe(b.outcome!.hash);
    expect(serializeReplay(a)).not.toBe(serializeReplay(b));
    // and the same seed twice is byte-identical
    expect(serializeReplay(recordHeadless(level, 1, referencePlayerCommands).replay)).toBe(serializeReplay(a));
  });

  it('an open record (no outcome) re-runs to its budget and verifies as `open`; a continued one as `continued`', () => {
    const level = makeLevel();
    const state = createState(level, 5);
    const replay = newReplay(level, state);
    recordInto(replay, state, { type: 'link', owner: 'player', from: 'p', to: 'e' });
    const v = verifyReplay(level, replay, { maxMs: 3000 });
    expect(v.matches).toBe(false);
    expect(v.reason).toBe('open');
    expect(v.timeMs).toBe(3000);
    expect(v.expected).toBeUndefined();
    const closed = finishReplay(replay, runReplay(level, replay, { maxMs: 3000 }));
    expect(verifyReplay(level, closed).matches).toBe(true);
    const continued: Replay = { ...closed, continued: true };
    const c = verifyReplay(level, continued);
    expect(c.matches).toBe(false);
    expect(c.reason).toBe('continued');
    expect(c.hash).toBe(closed.outcome!.hash); // the re-run itself still agrees
  });

  it('the wrong level is refused outright', async () => {
    const level3 = (await loadLevel(3))!;
    const level4 = (await loadLevel(4))!;
    const { replay } = recordHeadless(level3, 1, referencePlayerCommands);
    expect(() => runReplay(level4, replay)).toThrow(/level 3 recorded, level 4 given/);
  });
});

describe('replay record v1: format', () => {
  it('carries the level `ai` (LV-13) through JSON, and omits it when the level has none', () => {
    const ai = { opponentAwareness: true, frontBiasS: { rusher: 20, turtle: 5, opportunist: 10 } };
    const level = makeLevel({ ai });
    const state = createState(level, 1);
    const replay = newReplay(level, state);
    expect(replay.ai).toEqual(ai);
    expect(replay.ai).not.toBe(ai); // a copy, not the level's object
    const parsed = parseReplay(serializeReplay(finishReplay(replay, state)));
    expect(parsed.ai).toEqual(ai);
    expect(parseReplay(serializeReplay(newReplay(makeLevel(), state))).ai).toBeUndefined();
    expect('ai' in newReplay(makeLevel(), state)).toBe(false);
  });

  it('has the v1 fields: v, levelId, seed, modifiers, rules, commands; outcome once closed', () => {
    const level = makeLevel();
    const mods = { productionMul: 1.1, capacityMul: 1.25, startGarrisonBonus: 3, unitSpeedMul: 1 };
    const state = createState(level, 42, mods);
    const replay = newReplay(level, state);
    expect(Object.keys(replay)).toEqual(['v', 'levelId', 'seed', 'modifiers', 'rules', 'commands']);
    expect(replay.v).toBe(REPLAY_VERSION);
    expect(replay.v).toBe(1);
    expect(replay.levelId).toBe(999);
    expect(replay.seed).toBe(42);
    expect(replay.modifiers).toEqual(mods);
    expect(replay.modifiers).not.toBe(state.modifiers);
    expect(replay.rules).toBe(rulesId());
    expect(replay.commands).toEqual([]);
    finishReplay(replay, state);
    expect(replay.outcome).toEqual({ result: 'playing', timeMs: 0, hash: hashState(state) });
    // the re-run of a closed record honours the modifiers (a bonus garrison is in the hash)
    expect(verifyReplay(level, replay).matches).toBe(true);
    expect(runReplay(level, replay).towers['p']!.units).toBe(13);
  });

  it('hashState ignores the last tick’s events (the game loop drains them, a headless loop does not)', () => {
    const level = makeLevel();
    const state = runReplay(level, { ...newReplay(level, createState(level, 1)), commands: [{ t: 0, c: { type: 'link', owner: 'player', from: 'p', to: 'e' } }] }, { maxMs: 50 });
    state.events.push({ type: 'linked', owner: 'player', from: 'p', to: 'e' }); // what a tick may leave behind
    const drained = { ...state, events: [] };
    expect(hashState(drained)).toBe(hashState(state));
    expect(fnv1a(JSON.stringify(drained))).not.toBe(fnv1a(JSON.stringify(state)));
    expect(hashState({ ...state, time: state.time + C.TICK_MS })).not.toBe(hashState(state));
  });

  it('the rules id is the snapshot version plus a hash of every sim constant', () => {
    const id = rulesId();
    expect(id).toMatch(new RegExp(`^${SNAPSHOT_VERSION}:[0-9a-f]{8}$`));
    expect(id.split(':')[1]).toBe(fnv1a(JSON.stringify(C)));
    expect(fnv1a('')).toBe('811c9dc5'); // FNV-1a offset basis
    expect(fnv1a('a')).toBe('e40c292c'); // FNV-1a 32-bit test vector
    expect(fnv1a(JSON.stringify({ ...C, TICK_MS: 51 }))).not.toBe(id.split(':')[1]);
  });

  it('a record from another rules build verifies the hash but flags the rules', () => {
    const level = makeLevel();
    const state = createState(level, 1);
    const replay = finishReplay(newReplay(level, state), runReplay(level, newReplay(level, state), { maxMs: 2000 }));
    const foreign: Replay = { ...replay, rules: '2:00000000' };
    const v = verifyReplay(level, foreign);
    expect(v.matches).toBe(true);
    expect(v.rulesMatch).toBe(false);
  });

  it('`replayOf` builds a closed record from an external log (the play screen’s) with `continued` carried', () => {
    const level = makeLevel();
    const state = createState(level, 9);
    const log: ReplayEntry[] = [{ t: 0, c: { type: 'link', owner: 'player', from: 'p', to: 'e' } }, { t: 500, c: { type: 'link', owner: 'enemy1', from: 'e', to: 'p' }, a: 1 }];
    const final = runReplay(level, { ...newReplay(level, state), commands: log }, { maxMs: 5000 });
    const replay = replayOf(level, final, log);
    expect(replay.commands).toEqual(log);
    expect(replay.commands[0]).not.toBe(log[0]); // copies
    expect(replay.continued).toBeUndefined();
    expect(replay.outcome).toEqual({ result: 'playing', timeMs: 5000, hash: hashState(final) });
    expect(verifyReplay(level, replay).matches).toBe(true);
    expect(replayOf(level, final, log, true).continued).toBe(true);
  });

  it('parseReplay rejects a wrong version and malformed shapes', () => {
    const level = makeLevel();
    const ok = serializeReplay(newReplay(level, createState(level, 1)));
    expect(() => parseReplay(ok)).not.toThrow();
    expect(() => parseReplay(ok.replace('"v":1', '"v":2'))).toThrow(/version 2/);
    expect(() => parseReplay('[]')).toThrow(/not an object/);
    expect(() => parseReplay(ok.replace('"commands":[]', '"commands":{}'))).toThrow(/commands/);
    expect(() => parseReplay(ok.replace('"commands":[]', '"commands":[{"t":"x"}]'))).toThrow(/command 0/);
    expect(() => parseReplay(ok.replace('"rules":"', '"rulez":"'))).toThrow(/rules/);
  });

  it('the committed fixture replay-l15-s1.json verifies on this build and equals a fresh node recording', async () => {
    const level = (await loadLevel(15))!;
    const fixture = parseReplay(FIXTURE);
    expect(fixture.levelId).toBe(15);
    expect(fixture.seed).toBe(1);
    const v = verifyReplay(level, fixture);
    expect(v.matches, `re-record the fixture when a sim rule changes: ${v.reason ?? ''} ${v.hash} vs ${v.expected}`).toBe(true);
    expect(v.rulesMatch, 'a sim constant changed since the fixture was recorded — re-record it').toBe(true);
    // the AI may change without touching the fixture (it is self-contained); today it still equals a fresh recording
    const fresh = recordHeadless(level, 1, referencePlayerCommands).replay;
    expect(fresh.outcome).toEqual(fixture.outcome);
  });

  it('size: a 60 s reference-bot record on level 15 (seed 1) serializes well under 32 kB', async () => {
    const level = (await loadLevel(15))!;
    const { replay, state } = recordHeadless(level, 1, referencePlayerCommands, 60_000);
    expect(state.time).toBeLessThanOrEqual(60_000);
    const json = serializeReplay(replay);
    const bytes = new TextEncoder().encode(json).length;
    expect(bytes).toBeGreaterThan(500);
    expect(bytes).toBeLessThan(32_768);
    expect(bytes / Math.max(1, replay.commands.length)).toBeLessThan(120); // ≈ 70–90 B per entry
  });
});

/*
 * SIM-R2 (2026-11-11): the optional `challenge` descriptor — `{ kind: 'daily' | 'weekly', key, twist }`, the
 * generator's inputs — rides in the v1 record. The sim only carries it (src/daily/replayLevel.ts rebuilds and
 * checks it, tests/daily/replayLevel.test.ts); here: it round-trips, old records without it still parse, a
 * campaign record is byte-for-byte what SIM-R1 wrote, and `runReplay` / `verifyReplay` do not read it.
 */
describe('replay record v1: SIM-R2 challenge descriptor', () => {
  const level = makeLevel();
  const log: ReplayEntry[] = [{ t: 0, c: { type: 'link', owner: 'player', from: 'p', to: 'e' } }];

  it('challengeDescriptor maps the play screen’s daily / weekly objects to { kind, key, twist }, campaign to undefined', () => {
    const daily = { dayKey: '2026-11-11', twist: { id: 'plain' } };
    const weekly = { weekKey: '2026-11-09', twist: { id: 'lean' } };
    expect(challengeDescriptor(daily, null)).toEqual({ kind: 'daily', key: '2026-11-11', twist: 'plain' });
    expect(challengeDescriptor(null, weekly)).toEqual({ kind: 'weekly', key: '2026-11-09', twist: 'lean' });
    expect(challengeDescriptor(daily, weekly)).toEqual({ kind: 'daily', key: '2026-11-11', twist: 'plain' }); // the play screen never has both; the daily wins
    expect(challengeDescriptor(null, null)).toBeUndefined();
    expect(challengeDescriptor()).toBeUndefined();
  });

  it('replayOf carries the descriptor (a copy) and it round-trips through JSON; the version stays 1', () => {
    const state = runReplay(level, { ...newReplay(level, createState(level, 7)), commands: log }, { maxMs: 2000 });
    const desc = { kind: 'daily' as const, key: '2026-11-11', twist: 'fastFeet' };
    const replay = replayOf(level, state, log, false, desc);
    expect(replay.v).toBe(1);
    expect(replay.challenge).toEqual(desc);
    expect(replay.challenge).not.toBe(desc);
    const json = serializeReplay(replay);
    expect(json).toContain('"challenge":{"kind":"daily","key":"2026-11-11","twist":"fastFeet"}');
    const parsed = parseReplay(json);
    expect(parsed.challenge).toEqual(desc);
    expect(parsed).toEqual(replay);
    expect(verifyReplay(level, parsed).matches).toBe(true);
    // the weekly kind too
    expect(parseReplay(serializeReplay(replayOf(level, state, log, true, { kind: 'weekly', key: '2026-11-09', twist: 'lean' }))).challenge).toEqual({ kind: 'weekly', key: '2026-11-09', twist: 'lean' });
  });

  it('a campaign record is unchanged: no `challenge` key at all, byte-identical to the SIM-R1 shape', () => {
    const state = runReplay(level, { ...newReplay(level, createState(level, 7)), commands: log }, { maxMs: 2000 });
    const replay = replayOf(level, state, log);
    expect('challenge' in replay).toBe(false);
    expect(Object.keys(replay)).toEqual(['v', 'levelId', 'seed', 'modifiers', 'rules', 'commands', 'outcome']);
    expect(serializeReplay(replay)).toBe(serializeReplay(replayOf(level, state, log, false, undefined)));
    expect(parseReplay(serializeReplay(replay)).challenge).toBeUndefined();
    // the committed SIM-R1 fixture (no descriptor) still parses and verifies
    expect(parseReplay(FIXTURE).challenge).toBeUndefined();
  });

  it('parseReplay accepts a record without the field (old v1), rejects a malformed descriptor', () => {
    const state = createState(level, 1);
    const ok = serializeReplay(finishReplay(newReplay(level, state), state));
    expect(ok).not.toContain('challenge');
    expect(() => parseReplay(ok)).not.toThrow();
    const withField = (c: string): string => ok.replace('"commands":[]', `"commands":[],"challenge":${c}`);
    expect(() => parseReplay(withField('{"kind":"daily","key":"2026-11-11","twist":"plain"}'))).not.toThrow();
    expect(() => parseReplay(withField('{"kind":"monthly","key":"2026-11-11","twist":"plain"}'))).toThrow(/challenge malformed/);
    expect(() => parseReplay(withField('{"kind":"daily","twist":"plain"}'))).toThrow(/challenge malformed/);
    expect(() => parseReplay(withField('{"kind":"daily","key":"2026-11-11"}'))).toThrow(/challenge malformed/);
    expect(() => parseReplay(withField('{"kind":"daily","key":20261111,"twist":"plain"}'))).toThrow(/challenge malformed/);
    expect(() => parseReplay(withField('"daily"'))).toThrow(/challenge malformed/);
    expect(() => parseReplay(withField('null'))).toThrow(/challenge malformed/);
  });

  it('the sim does not read the descriptor: the same commands re-run to the same hash with or without it, or with a wrong one', () => {
    const state = runReplay(level, { ...newReplay(level, createState(level, 3)), commands: log }, { maxMs: 3000 });
    const plain = replayOf(level, state, log);
    const tagged = replayOf(level, state, log, false, { kind: 'weekly', key: 'not-even-a-key', twist: 'x' });
    expect(tagged.outcome).toEqual(plain.outcome);
    expect(hashState(runReplay(level, tagged))).toBe(plain.outcome!.hash);
    expect(verifyReplay(level, tagged).matches).toBe(true); // the descriptor check is src/daily/replayLevel.ts's job
  });
});
