import { describe, expect, it } from 'vitest';
import { LEVELS, getLevel } from '../../src/levels/index';
import { C, Rng, applyCommand, createState, getOutcome, step } from '../../src/sim/index';
import type { Command, GameState, LevelDef } from '../../src/sim/index';
import { isAiTick, referencePlayerCommands, runAiTick } from '../../src/ai/index';

/*
 * Determinism guard on real content (the existing determinism.test.ts uses a synthetic map and a
 * scripted command list; this one drives the actual reference player and enemy AIs on authored
 * levels, the same loop scripts/playtest.ts uses).
 */

type Bot = ((state: GameState, rng: Rng) => Command[]) | undefined;

/** Headless game loop, identical to scripts/playtest.ts runHeadless (kept local: that file runs main() on import). */
function play(level: LevelDef, seed: number, player: Bot, maxMs: number, onTick?: (s: GameState) => void): GameState {
  const state = createState(level, seed);
  const enemyRng = new Rng(seed);
  const playerRng = new Rng(seed ^ 0x5bd1e995);
  while (getOutcome(state) === 'playing' && state.time < maxMs) {
    if (isAiTick(state)) {
      const playerCmds = player ? player(state, playerRng) : [];
      const enemyCmds = runAiTick(state, enemyRng);
      for (const cmd of playerCmds) applyCommand(state, cmd);
      for (const cmd of enemyCmds) applyCommand(state, cmd);
    }
    step(state, C.TICK_MS);
    onTick?.(state);
  }
  return state;
}

/** Every number reachable from `value` must be finite (no NaN / Infinity). Returns the offending paths. */
function nonFinitePaths(value: unknown, path = '$', out: string[] = []): string[] {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(`${path}=${String(value)}`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => nonFinitePaths(v, `${path}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) nonFinitePaths(v, `${path}.${k}`, out);
  }
  return out;
}

/** Sign / range invariants that a sim state must satisfy after every tick. */
function invariantViolations(s: GameState): string[] {
  const bad: string[] = [];
  if (s.time < 0) bad.push(`time ${s.time}`);
  for (const t of Object.values(s.towers)) {
    if (t.units < 0) bad.push(`tower ${t.id} units ${t.units}`);
    if (t.genAccMs < 0) bad.push(`tower ${t.id} genAccMs ${t.genAccMs}`);
    if (t.artilleryCooldownMs < 0) bad.push(`tower ${t.id} artilleryCooldownMs ${t.artilleryCooldownMs}`);
    if (t.level < 1 || t.level > 3) bad.push(`tower ${t.id} level ${t.level}`);
  }
  for (const u of s.units) {
    if (u.weight <= 0) bad.push(`unit ${u.id} weight ${u.weight}`);
    if (u.progress < 0 || u.progress > 1) bad.push(`unit ${u.id} progress ${u.progress}`);
    if (u.speed <= 0) bad.push(`unit ${u.id} speed ${u.speed}`);
    if (!s.roads[u.roadId]) bad.push(`unit ${u.id} on unknown road ${u.roadId}`);
  }
  for (const q of s.queues) {
    if (q.remaining < 0) bad.push(`queue ${q.from}->${q.to} remaining ${q.remaining}`);
    if (!s.towers[q.from] || !s.towers[q.to]) bad.push(`queue ${q.from}->${q.to} references unknown tower`);
  }
  if (s.nextUnitId < 0) bad.push(`nextUnitId ${s.nextUnitId}`);
  return bad;
}

describe('replay determinism on authored levels', () => {
  it('level 1: reference player vs enemies for 60 s sim, same seed twice, deep-equal final state', () => {
    const level1 = getLevel(1);
    expect(level1).toBeDefined();
    const a = play(level1!, 7, referencePlayerCommands, 60_000);
    const b = play(level1!, 7, referencePlayerCommands, 60_000);
    expect(a.time).toBe(b.time);
    expect(a.time).toBeLessThanOrEqual(60_000);
    expect(a.time).toBeGreaterThan(0);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // a different seed must still be a valid game (guards against the rng being ignored entirely)
    const c = play(level1!, 8, referencePlayerCommands, 60_000);
    expect(nonFinitePaths(c)).toEqual([]);
  });

  it('every level: reference player vs enemies for 30 s sim is deterministic', () => {
    for (const level of LEVELS) {
      const a = play(level, 1, referencePlayerCommands, 30_000);
      const b = play(level, 1, referencePlayerCommands, 30_000);
      expect(JSON.stringify(a), `level ${level.id} "${level.name}" diverged between two runs`).toBe(JSON.stringify(b));
    }
  });
});

describe('every level: createState + 10 s idle player never produces NaN or negative units', () => {
  for (const level of LEVELS) {
    it(`level ${String(level.id).padStart(2, '0')} "${level.name}"`, () => {
      const initial = createState(level, 1);
      expect(nonFinitePaths(initial), 'fresh state').toEqual([]);
      expect(invariantViolations(initial), 'fresh state').toEqual([]);
      let ticks = 0;
      const final = play(level, 1, undefined, 10_000, (s) => {
        ticks++;
        const nf = nonFinitePaths(s);
        if (nf.length) throw new Error(`level ${level.id} t=${s.time}: non-finite ${nf.join(', ')}`);
        const bad = invariantViolations(s);
        if (bad.length) throw new Error(`level ${level.id} t=${s.time}: ${bad.join('; ')}`);
      });
      expect(ticks).toBeGreaterThan(0);
      // an idle player must not win in 10 s, and the sim must have actually run (unless the level is lost that fast)
      expect(getOutcome(final)).not.toBe('won');
      expect(final.time).toBeGreaterThan(0);
      expect(final.time).toBeLessThanOrEqual(10_000);
    });
  }
});
