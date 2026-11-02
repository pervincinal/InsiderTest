import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadLevel } from '../../src/levels/index';
import {
  RECLOCK_RULE_K,
  applyTieFloor,
  ceilStep,
  provisionalWarning,
  reclockLevel,
  star2Floor,
  tieFloorApplies,
  twoStarGapMin,
} from '../../scripts/lib/reclockRule';
import type { TieLine } from '../../scripts/lib/reclockRule';

/*
 * AUD-B10 (2026-11-02, GDD §3 "Pacing / star clocks"): `scripts/reclock.ts` floors `star2` on the slower of the
 * naive line's two tie orders (`asc`, `tie desc`) at the run's K, rounded up to 5 s — 1–16 always, past 16 on a
 * daily-pool level whose two medians differ by > 5 s; defined at K = 20. A floor that would raise today's clock
 * needs an `asc` / `desc` 2★ gap of ≥ 8 of 20 (the Producer's reporting filter), else it is listed as
 * "floor would be X — not applied" and the clock is held. Before QA 2026-11-02 the script floored on the `asc`
 * median at K = 5, so `--write` reverted the six AUD-B10 clocks (5 110 → 75, 7 90 → 65, 11 70 → 60,
 * 16 75 → 65, 26 60 → 50, 45 95 → 80).
 */

const line = (medianMs: number | undefined, twoStar = 0, wins = 20): TieLine => ({ medianMs, wins, twoStar });

describe('reclock star2 tie floor (AUD-B10)', () => {
  it('the floor is the slower of the two medians rounded up to the 5 s step, capped at 180 s', () => {
    expect(ceilStep(70_050)).toBe(75_000);
    expect(ceilStep(70_000)).toBe(70_000);
    expect(star2Floor(71_300, 108_000)).toBe(110_000);
    expect(star2Floor(84_700, 80_100)).toBe(85_000); // the slower order may be asc
    expect(star2Floor(63_600, 70_050)).toBe(75_000);
    expect(star2Floor(57_500, undefined)).toBe(60_000); // an order with no win does not floor
    expect(star2Floor(undefined, undefined)).toBeUndefined();
    expect(star2Floor(176_000, 183_000)).toBe(180_000);
  });

  it('1–16 always; past 16 only a daily-pool level whose medians differ by more than 5 s', () => {
    expect(tieFloorApplies(2, 68_000, 68_000)).toBe(true);
    expect(tieFloorApplies(16, 63_600, 70_050)).toBe(true);
    expect(tieFloorApplies(26, 49_100, 55_400)).toBe(true); // 6.3 s apart
    expect(tieFloorApplies(45, 71_300, 92_700)).toBe(true);
    expect(tieFloorApplies(17, 54_400, 54_100)).toBe(false);
    expect(tieFloorApplies(30, 70_000, 75_000)).toBe(false); // exactly one step is not "more than"
    expect(tieFloorApplies(30, 70_000, 75_001)).toBe(true);
    expect(tieFloorApplies(30, 70_000, undefined)).toBe(false);
    // outside the pool (a narrowed pool here) no floor past 16, whatever the spread
    expect(tieFloorApplies(45, 71_300, 92_700, { from: 9, to: 40 })).toBe(false);
    expect(tieFloorApplies(12, 50_000, 90_000, { from: 30, to: 40 })).toBe(true);
  });

  it('applies the floor, holds a raising floor under the 2★-gap filter, and ignores ineligible levels', () => {
    expect(twoStarGapMin(20)).toBe(8);
    expect(twoStarGapMin(5)).toBe(2);
    // 5 before AUD-B10: base 75, 2★ 16 / 0 at 75 → raised to 110
    const raised = applyTieFloor({ levelId: 5, currentStar2: 75_000, baseStar2: 75_000, asc: line(71_300, 16), desc: line(108_000, 0), k: 20 });
    expect(raised).toMatchObject({ eligible: true, floorMs: 110_000, gap: 16, gapMin: 8, applied: true, star2: 110_000, note: '' });
    // 5 today: floor equals the clock → applied (no filter needed), no change
    expect(applyTieFloor({ levelId: 5, currentStar2: 110_000, baseStar2: 60_000, asc: line(71_300, 20), desc: line(108_000, 13), k: 20 }).star2).toBe(110_000);
    // 10: floor 70 over 65, gap 12 / 7 = 5 < 8 → held at 65 (never under it by the base)
    const held = applyTieFloor({ levelId: 10, currentStar2: 65_000, baseStar2: 50_000, asc: line(63_200, 12), desc: line(67_000, 7), k: 20 });
    expect(held).toMatchObject({ floorMs: 70_000, applied: false, star2: 65_000, note: 'floor would be 70 — not applied, 2★ gap 5 < 8' });
    // a base above the held clock still wins
    expect(applyTieFloor({ levelId: 10, currentStar2: 65_000, baseStar2: 90_000, asc: line(63_200, 12), desc: line(67_000, 7), k: 20 }).star2).toBe(90_000);
    // a floor under today's clock lowers it towards the floor (a layout cure brings the clock down with it)
    expect(applyTieFloor({ levelId: 12, currentStar2: 65_000, baseStar2: 40_000, asc: line(58_600, 20), desc: line(58_600, 20), k: 20 }).star2).toBe(60_000);
    // past 16 with medians ≤ 5 s apart: no floor, the base alone
    const off = applyTieFloor({ levelId: 17, currentStar2: 50_000, baseStar2: 50_000, asc: line(54_400, 2), desc: line(54_100, 3), k: 20 });
    expect(off).toMatchObject({ eligible: false, floorMs: undefined, applied: false, star2: 50_000 });
  });

  it('a run below K = 20 warns that the floors are provisional; K = 20 does not', () => {
    expect(RECLOCK_RULE_K).toBe(20);
    expect(provisionalWarning(20)).toBeUndefined();
    expect(provisionalWarning(25)).toBeUndefined();
    expect(provisionalWarning(5)).toBe(
      'reclock: WARNING --seeds 5 < 20 — the star2 tie floor (AUD-B10) is defined at K = 20; floors below are provisional, do not --write them',
    );
    const tsx = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));
    const r = spawnSync(process.execPath, [tsx, 'scripts/reclock.ts', '--seeds', '1', '--only', '2-2'], { cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout.split('\n')[0]).toBe(provisionalWarning(1));
    expect(r.stdout).toMatch(/^2\tSupply Line .* naive asc\/desc [\d.]+s\/[\d.]+s 2★ \d+\/\d+/m);
    expect(r.stdout).toContain('reclock: dry run (add --write)');
  }, 60_000);
});

describe('reclock on today\'s JSON (K = 20)', () => {
  // the six AUD-B10 clocks: the K = 20 tie floor reproduces each one, so --write cannot revert them
  it.each([
    [5, 110_000],
    [7, 90_000],
    [11, 70_000],
    [16, 75_000],
    [26, 60_000],
    [45, 95_000],
  ])('level %i keeps star2 %i (floor applied, equal to the JSON)', async (id, star2) => {
    const level = (await loadLevel(id))!;
    expect(level.star2).toBe(star2);
    const row = reclockLevel(level, RECLOCK_RULE_K)!;
    expect(row.floor).toMatchObject({ eligible: true, applied: true, floorMs: star2 });
    expect(row.star2).toBe(star2);
  }, 60_000);

  // flagged by the level designer, left by the Producer (2★ gap < 8 of 20): listed, held at today's clock
  it.each([
    [10, 65_000, 70_000],
    [13, 80_000, 85_000],
  ])('level %i is held at star2 %i (floor would be %i, not applied)', async (id, star2, floorMs) => {
    const level = (await loadLevel(id))!;
    expect(level.star2).toBe(star2);
    const row = reclockLevel(level, RECLOCK_RULE_K)!;
    expect(row.floor).toMatchObject({ eligible: true, applied: false, floorMs });
    expect(row.floor!.gap).toBeLessThan(8);
    expect(row.star2).toBe(star2);
  }, 60_000);
});
