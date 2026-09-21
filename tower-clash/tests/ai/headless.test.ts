import { describe, expect, it } from 'vitest';
import { loadLevel } from '../../src/levels/index';
import { DEFAULT_MODIFIERS } from '../../src/sim/index';
import type { PlayerModifiers } from '../../src/sim/index';
import { referencePlayerCommands } from '../../src/ai/index';
import { HEADLESS_MAX_MS, runHeadless, starsFor } from '../../src/ai/headless';
import { makeLevel, wall } from '../helpers';

/** Every Commander track at its cap (ECONOMY.md §3.2 / catalog ADVANTAGE_LIMIT). */
const MAX_MODIFIERS: PlayerModifiers = { productionMul: 1.2, capacityMul: 1.25, startGarrisonBonus: 5, unitSpeedMul: 1.15 };

const level1 = (await loadLevel(1))!;

describe('runHeadless', () => {
  it('defaults to no upgrades and the 180 s budget', () => {
    const a = runHeadless(level1, 1, referencePlayerCommands);
    const b = runHeadless(level1, 1, referencePlayerCommands, { modifiers: DEFAULT_MODIFIERS, maxMs: HEADLESS_MAX_MS });
    expect(a).toEqual(b);
    expect(a.outcome).toBe('won');
    expect(a.ticks).toBe(a.timeMs / 50);
  });

  it('with max modifiers is deterministic on level 1: same seed, same result, tick for tick', () => {
    for (const seed of [1, 2, 3, 7, 42]) {
      const a = runHeadless(level1, seed, referencePlayerCommands, { modifiers: MAX_MODIFIERS });
      const b = runHeadless(level1, seed, referencePlayerCommands, { modifiers: MAX_MODIFIERS });
      expect(a).toEqual(b);
      expect(a.outcome).toBe('won');
    }
  });

  it('wins level 1 on 20 seeds with and without max modifiers, and the boost is never slower in total', () => {
    // Rules v3 (2026-09-21): a stream lands its rate whatever the garrison, so the +5 start bonus and the
    // capacity are worth little on level 1; production ×1.2 and march ×1.15 shave a few seconds. The
    // pinned times are the campaign clock for level 1 seed 1 (re-pin when the AI or the level changes).
    const first = runHeadless(level1, 1, referencePlayerCommands);
    const firstBoosted = runHeadless(level1, 1, referencePlayerCommands, { modifiers: MAX_MODIFIERS });
    expect(first).toMatchObject({ outcome: 'won', timeMs: 34_850 });
    expect(firstBoosted).toMatchObject({ outcome: 'won', timeMs: 33_900 });

    let baseTotal = 0;
    let boostedTotal = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const base = runHeadless(level1, seed, referencePlayerCommands);
      const boosted = runHeadless(level1, seed, referencePlayerCommands, { modifiers: MAX_MODIFIERS });
      expect(base.outcome).toBe('won');
      expect(boosted.outcome).toBe('won');
      baseTotal += base.timeMs;
      boostedTotal += boosted.timeMs;
    }
    expect(boostedTotal).toBeLessThanOrEqual(baseTotal);
  });

  it('never lets the idle player win level 1, with or without upgrades', () => {
    const idle = runHeadless(level1, 1, undefined, { maxMs: 60_000 });
    const boostedIdle = runHeadless(level1, 1, undefined, { modifiers: MAX_MODIFIERS, maxMs: 60_000 });
    expect(idle.outcome).not.toBe('won');
    expect(boostedIdle.outcome).not.toBe('won');
  });

  it('stops at the sim-time budget when nobody wins', () => {
    // Two towers, a wall between them: no lane, nothing can ever happen.
    const stalemate = makeLevel({ obstacles: [wall(100, 700, 620, 700)] });
    const r = runHeadless(stalemate, 1, referencePlayerCommands, { maxMs: 10_000 });
    expect(r).toEqual({ outcome: 'playing', timeMs: 10_000, ticks: 200, modifiers: DEFAULT_MODIFIERS });
  });
});

describe('starsFor', () => {
  const level = makeLevel({ star3: 30_000, star2: 60_000 });
  it('scores by the level clocks, 0 for anything but a win', () => {
    expect(starsFor(level, { outcome: 'won', timeMs: 30_000, ticks: 600 })).toBe(3);
    expect(starsFor(level, { outcome: 'won', timeMs: 30_050, ticks: 601 })).toBe(2);
    expect(starsFor(level, { outcome: 'won', timeMs: 60_000, ticks: 1200 })).toBe(2);
    expect(starsFor(level, { outcome: 'won', timeMs: 60_050, ticks: 1201 })).toBe(1);
    expect(starsFor(level, { outcome: 'lost', timeMs: 10_000, ticks: 200 })).toBe(0);
    expect(starsFor(level, { outcome: 'playing', timeMs: 180_000, ticks: 3600 })).toBe(0);
  });
});
