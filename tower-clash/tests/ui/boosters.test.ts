import { describe, expect, it } from 'vitest';
import { C } from '../../src/sim/constants';
import { allBoosterStatus, boosterStatus, canUseBooster } from '../../src/ui/boosters';
import { applyMotionPref, reducedMotionOverride, setReducedMotionOverride } from '../../src/ui/motion';

describe('booster bar model (M3-1, GDD §2.6)', () => {
  const idle = { boosters: [], time: 4000 };

  it('costs match the constants and affordability follows the coin balance', () => {
    expect(boosterStatus(idle, 'overdrive', 30)).toMatchObject({ cost: 30, affordable: true, active: false, remainingMs: 0 });
    expect(boosterStatus(idle, 'freeze', 39)).toMatchObject({ cost: 40, affordable: false });
    expect(boosterStatus(idle, 'airstrike', 50)).toMatchObject({ cost: 50, affordable: true, durationMs: 0 });
    expect(allBoosterStatus(idle, 100).map((s) => s.kind)).toEqual(['overdrive', 'freeze', 'airstrike']);
  });

  it('an active player booster reports its remaining time and blocks a second purchase', () => {
    const state = { boosters: [{ type: 'overdrive' as const, owner: 'player' as const, untilMs: 10_000 }], time: 4000 };
    const s = boosterStatus(state, 'overdrive', 100);
    expect(s.active).toBe(true);
    expect(s.remainingMs).toBe(6000);
    expect(s.durationMs).toBe(C.OVERDRIVE_MS);
    expect(canUseBooster(state, 'overdrive', 100)).toBe(false);
    expect(canUseBooster(state, 'freeze', 100)).toBe(true);
    expect(canUseBooster(state, 'freeze', 10)).toBe(false);
  });

  it('BUG-3 regression: a missing wallet reads as "no gold" instead of throwing inside the draw loop', () => {
    // src/ui/play.ts once passed `save.coins` after the rename to `gold`: `walletOf(undefined)` threw
    // "reading 'prices'" on every frame and froze every level. The guard must keep the bar drawable.
    const status = boosterStatus(idle, 'overdrive', undefined as never);
    expect(status).toMatchObject({ kind: 'overdrive', cost: C.BOOSTER_COST.overdrive, charges: 0, affordable: false, adOffer: false, active: false });
    expect(allBoosterStatus(idle, undefined as never).map((s) => s.affordable)).toEqual([false, false, false]);
    expect(canUseBooster(idle, 'airstrike', undefined as never)).toBe(false);
  });

  it("an enemy's booster does not count as the player's", () => {
    const state = { boosters: [{ type: 'freeze' as const, owner: 'enemy1' as const, untilMs: 9000 }], time: 4000 };
    expect(boosterStatus(state, 'freeze', 100).active).toBe(false);
  });
});

describe('reduced-motion override (M3-3)', () => {
  it('maps the persisted preference onto the override', () => {
    applyMotionPref('auto');
    expect(reducedMotionOverride()).toBeNull();
    applyMotionPref('on');
    expect(reducedMotionOverride()).toBe(true);
    applyMotionPref('off');
    expect(reducedMotionOverride()).toBe(false);
    setReducedMotionOverride(null);
    expect(reducedMotionOverride()).toBeNull();
  });
});
