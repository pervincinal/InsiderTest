import { describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { C, Rng, applyCommand, createState, step } from '../../src/sim/index';
import type { Command, EnemyDef, GameState, TowerDef } from '../../src/sim/index';
import { loadLevel } from '../../src/levels/index';
import { STANDOFF_RELEASE_MS, barredLanes, enemyCommands, laneKey, memoryFor, newMemory, rusherCommands } from '../../src/ai/index';
import { runHeadless } from '../../src/ai/headless';
import type { EnemyMemory } from '../../src/ai/index';

/*
 * AUD-A11 (GDD §2.5 "Standoff shield release", 2026-10-30): an enemy stream that a rival's stream cancels
 * on its lane, with no unit landing on either tower for STANDOFF_RELEASE_MS = 20 s, is dropped; the lane
 * may not be re-linked until something lands on either of its towers again. The timer lives in the
 * enemy's per-match memory (`memory.ts`): deterministic, no clock, no randomness.
 */

const e1: EnemyDef = { owner: 'enemy1', personality: 'rusher', aggression: 1 };
const e2: EnemyDef = { owner: 'enemy2', personality: 'rusher', aggression: 1 };
const link = (owner: Command['owner'], from: string, to: string): Command => ({ type: 'link', owner, from, to });
const unlink = (owner: Command['owner'], from: string, to: string): Command => ({ type: 'unlink', owner, from, to });

/** `a` (enemy1) and `b` (enemy2), equal L1 garrisons, one 600 px lane (5 s walk); optional extras. */
function towers(extra: TowerDef[] = []): TowerDef[] {
  return [
    { id: 'a', x: 360, y: 300, owner: 'enemy1', units: 20, level: 1 },
    { id: 'b', x: 360, y: 900, owner: 'enemy2', units: 20, level: 1 },
    ...extra,
  ];
}

/** Both stream at each other from t = 0: the lane cancels and nothing lands (GDD §2.0b test (d)). */
function standoff(extra: TowerDef[] = []): GameState {
  const state = createState(makeLevel({ towers: towers(extra), enemies: [e1, e2] }), 1);
  applyCommand(state, link('enemy1', 'a', 'b'));
  applyCommand(state, link('enemy2', 'b', 'a'));
  return state;
}

interface Tick {
  t: number;
  cmds: Command[];
}

/**
 * Drive enemy1 only (enemy2's stream stays where it is, as if its controller were skipped) for `ms`,
 * with `script` commands from other owners applied at given times. Returns enemy1's commands per tick.
 */
function drive(state: GameState, memory: EnemyMemory, ms: number, script: Record<number, Command[]> = {}): Tick[] {
  const out: Tick[] = [];
  while (state.time < ms) {
    const cmds = rusherCommands(state, e1, new Rng(1), memory);
    out.push({ t: state.time, cmds });
    for (const c of cmds) applyCommand(state, c);
    for (const c of script[state.time] ?? []) applyCommand(state, c);
    for (let i = 0; i < C.AI_TICK_MS / C.TICK_MS; i++) step(state, C.TICK_MS);
  }
  return out;
}

const firstTick = (ticks: Tick[], pred: (c: Command) => boolean): Tick | undefined => ticks.find((k) => k.cmds.some(pred));
const isUnlinkAB = (c: Command) => c.type === 'unlink' && c.from === 'a' && c.to === 'b';
const isLinkAB = (c: Command) => c.type === 'link' && c.from === 'a' && c.to === 'b';

describe('AUD-A11 standoff shield release (enemy memory)', () => {
  it('a silent mutual hold is released at exactly 20 s, the lane is barred, and nothing re-links it before a landing', () => {
    const state = standoff();
    const memory = newMemory();
    const ticks = drive(state, memory, 30_000);
    // Nothing lands while both stream (the under-fire markers never arm) …
    const release = firstTick(ticks, isUnlinkAB)!;
    expect(release.t).toBe(STANDOFF_RELEASE_MS);
    expect(release.cmds).toEqual([unlink('enemy1', 'a', 'b')]);
    for (const k of ticks) if (k.t < STANDOFF_RELEASE_MS) expect(k.cmds).toEqual([]);
    // … the lane is barred from the release on, until b's held units land on a (within their 5 s walk);
    // then a is under fire and `defend` raises the shield again (the GDD's "decides as always").
    const relink = firstTick(ticks, isLinkAB)!;
    expect(relink).toBeDefined();
    expect(relink.t).toBeGreaterThan(release.t + C.AI_TICK_MS);
    expect(relink.t).toBeLessThanOrEqual(release.t + 5_000 + C.AI_TICK_MS);
    // Between the release and the landing the lane was barred and no link was issued on it.
    for (const k of ticks) if (k.t > release.t && k.t < relink.t) expect(k.cmds).toEqual([]);
    // The re-raised shield starts a fresh count: no second release before relink + 20 s.
    expect(memory.holds.get(laneKey('a', 'b'))).toBe(relink.t);
    expect(ticks.filter((k) => k.cmds.some(isUnlinkAB))).toHaveLength(1);
    expect(STANDOFF_RELEASE_MS).toBe(20_000);
  });

  it('the count runs only while neither tower receives a unit: a friendly landing on the rival tower restarts it', () => {
    // enemy2's `c` reinforces `b` from 10 s to 15 s (300 px: its last unit lands ≈ 17.5 s); b's garrison changes.
    const state = standoff([{ id: 'c', x: 660, y: 900, owner: 'enemy2', units: 20, level: 1 }]);
    const memory = newMemory();
    const ticks = drive(state, memory, 45_000, { 10_000: [link('enemy2', 'c', 'b')], 15_000: [unlink('enemy2', 'c', 'b')] });
    const release = firstTick(ticks, isUnlinkAB)!;
    expect(release).toBeDefined();
    // Not at 20 s (the unreset count), but 20 s after the last landing on b, which is after 15 s.
    expect(release.t).toBeGreaterThanOrEqual(15_000 + STANDOFF_RELEASE_MS);
    expect(release.t).toBeLessThanOrEqual(15_000 + 2_500 + C.AI_TICK_MS + STANDOFF_RELEASE_MS);
    expect(release.t - memory.time).toBeLessThanOrEqual(0); // the memory moved with the match
    expect(ticks.filter((k) => k.t === STANDOFF_RELEASE_MS)[0]!.cmds).toEqual([]);
  });

  it('a hostile landing from a third party on either tower restarts it too (the player shoots b)', () => {
    const state = standoff([{ id: 'p', x: 60, y: 900, owner: 'player', units: 20, level: 1 }]);
    const memory = newMemory();
    const ticks = drive(state, memory, 45_000, { 10_000: [link('player', 'p', 'b')], 12_000: [unlink('player', 'p', 'b')] });
    const release = firstTick(ticks, isUnlinkAB)!;
    expect(release.t).toBeGreaterThanOrEqual(12_000 + STANDOFF_RELEASE_MS);
    expect(release.t).toBeLessThanOrEqual(12_000 + 2_500 + C.AI_TICK_MS + STANDOFF_RELEASE_MS);
    expect(ticks.filter((k) => k.t === STANDOFF_RELEASE_MS)[0]!.cmds).toEqual([]);
  });

  it('a partial shield whose surplus keeps landing is never released', () => {
    // a is L2 (faster stream) against b's L1: a's surplus lands on b every few seconds.
    const state = createState(makeLevel({ towers: [{ ...towers()[0]!, level: 2, units: 40 }, towers()[1]!], enemies: [e1, e2] }), 1);
    applyCommand(state, link('enemy1', 'a', 'b'));
    applyCommand(state, link('enemy2', 'b', 'a'));
    const memory = newMemory();
    const ticks = drive(state, memory, 40_000);
    expect(firstTick(ticks, isUnlinkAB)).toBeUndefined();
    expect(state.towers['b']!.units).toBeLessThan(20);
  });

  it('on release the tower resumes its normal attack choice on another lane', () => {
    // A neutral `c` (19 units, 670 px: falls in 25.6 s at the L1 rate of 1/s — inside the rusher's 30 s
    // horizon, but not worth a race (a falls to b's stream in 26 s, no RACE_MARGIN_MS ahead) so the shield
    // is not reclaimed early) is the target once a's link is free; b (still streaming back) is not.
    const state = standoff([{ id: 'c', x: 660, y: 900, owner: 'neutral', units: 19, level: 1 }]);
    const memory = newMemory();
    const ticks = drive(state, memory, STANDOFF_RELEASE_MS + C.AI_TICK_MS);
    const release = ticks[ticks.length - 1]!;
    expect(release.t).toBe(STANDOFF_RELEASE_MS);
    for (const k of ticks) if (k.t < STANDOFF_RELEASE_MS) expect(k.cmds).toEqual([]);
    expect(release.cmds).toEqual([unlink('enemy1', 'a', 'b'), link('enemy1', 'a', 'c')]);
    expect(barredLanes(memory, state)).toEqual(new Set([laneKey('a', 'b')]));
  });

  it("the player's towers are not part of the rule: a hold against the player's held units is kept past 20 s", () => {
    // Brief AUD-A11 (2026-10-30): enemies only — releasing a hold against a human would hand them the lane
    // for nothing; a player's standoff is GDD §2.4's stalemate card. (The GDD §2.5 paragraph's wider
    // wording, the player's stream as a rival too, is one predicate in `observe` and was gate-green too.)
    const state = createState(makeLevel({ towers: [towers()[0]!, { id: 'p', x: 360, y: 900, owner: 'player', units: 20, level: 1 }], enemies: [e1] }), 1);
    applyCommand(state, link('enemy1', 'a', 'p'));
    applyCommand(state, link('player', 'p', 'a'));
    const memory = newMemory();
    const ticks = drive(state, memory, 45_000);
    expect(firstTick(ticks, (c) => c.type === 'unlink' && c.from === 'a' && c.to === 'p')).toBeUndefined();
    expect(memory.holds.size).toBe(0);
    expect(state.links.filter((l) => l.owner === 'enemy1')).toHaveLength(1);
  });

  it('is deterministic: two fresh runs issue the same commands, and a repeated call on one snapshot too', () => {
    const run = () => {
      const state = standoff([{ id: 'c', x: 660, y: 900, owner: 'enemy2', units: 20, level: 1 }]);
      return drive(state, newMemory(), 60_000, { 10_000: [link('enemy2', 'c', 'b')], 15_000: [unlink('enemy2', 'c', 'b')] });
    };
    const first = run();
    expect(first.some((k) => k.cmds.length > 0)).toBe(true);
    expect(run()).toEqual(first);
    // Default memory (`memoryFor`): the same for the same state object, and one observation per sim time.
    const state = standoff();
    const memory = memoryFor(state, 'enemy1');
    expect(memoryFor(state, 'enemy1')).toBe(memory);
    drive(state, memory, STANDOFF_RELEASE_MS);
    const once = enemyCommands(state, e1, new Rng(1));
    expect(once).toEqual([unlink('enemy1', 'a', 'b')]);
    expect(enemyCommands(state, e1, new Rng(1))).toEqual(once);
    expect(memoryFor(createState(makeLevel({ enemies: [e1] }), 1), 'enemy1')).not.toBe(memory);
  });

  it('the memory starts over when the match rewinds (Continue): a jump back in time clears it', () => {
    const state = standoff();
    const memory = newMemory();
    drive(state, memory, 10_000);
    expect(memory.holds.size).toBe(1);
    state.time = 5_000;
    const cmds = rusherCommands(state, e1, new Rng(1), memory);
    expect(cmds).toEqual([]);
    expect(memory.time).toBe(5_000);
    expect(memory.holds.get(laneKey('a', 'b'))).toBe(0); // the links' creation time, as on a first observation
  });

  it('engagement regression (AUD-A12 shape): level 37 with the idle player, 5 seeds — the enemies take the home on every seed, median before 120 s', async () => {
    // Measured 2026-10-30 (same before and after the release rule: 37's longest silent hold is 14.9 s, below
    // the 20 s): seeds 1–5 lose at 112.0 / 96.8 / 139.5 / 125.3 / 95.5 s. The two rushers (horizon 30 s ×
    // 0.825) have no player target inside their horizon while the home sits at L3/100, so they trade L1
    // towers for ~90 s first — AUD-A12's engagement question, not a shield standoff. The target of
    // "every seed before 120 s" is that item's; this pins today's floor so the rule cannot regress it.
    const level = (await loadLevel(37))!;
    const times: number[] = [];
    for (let seed = 1; seed <= 5; seed++) {
      const r = runHeadless(level, seed, undefined);
      expect({ seed, outcome: r.outcome }).toEqual({ seed, outcome: 'lost' });
      expect(r.timeMs).toBeLessThan(150_000);
      times.push(r.timeMs);
    }
    expect(times.sort((a, b) => a - b)[2]!).toBeLessThan(120_000);
  });
});
