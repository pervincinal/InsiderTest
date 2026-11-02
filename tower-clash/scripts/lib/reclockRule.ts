/**
 * `scripts/reclock.ts`'s clock rule, pure and importable from tests (GDD §3 "Pacing / star clocks").
 *
 * - `star3` = 0.9 × the reference player's median over K seeds, rounded to the 5 s step, capped at 180 s;
 *   boundary step: if ≥ 8 of 10 max-upgrade runs would be 3★ at that clock, `star3` steps down 5 s once.
 * - base `star2` = max(2 × `star3`, worst reference win rounded up to 5 s), capped at 180 s.
 * - AUD-B10 (2026-11-02) tie floor: the `star2` floor is the **slower of the naive line's two tie orders**
 *   (`asc`, `tie desc` — the `--tie both` rows of `npm run playtest -- --naive`, 4 s reactions) at the K the
 *   run uses, rounded up to the 5 s step. The rule is defined at K = 20 (`RECLOCK_RULE_K`); a run at a lower
 *   K prints `provisionalWarning`. It applies on levels 1–16 always, and past 16 on a daily-pool level whose
 *   two medians differ by more than one step (> 5 s).
 * - Reporting filter (the Producer's 8-of-20, AUD-B10): a floor that would **raise** the level's current
 *   `star2` is applied only when the `asc` vs `tie desc` 2★ counts at the current clock differ by
 *   ≥ `twoStarGapMin(K)` (8 at K = 20); otherwise the row says `floor would be X — not applied` and the clock is
 *   held at the current `star2` (never lowered under it by the base). The filter decides nothing about the
 *   floor's value.
 */
import type { LevelDef, PlayerModifiers } from '../../src/sim/types';
import { referencePlayerCommands } from '../../src/ai/referencePlayer';
import { runHeadless } from '../../src/ai/headless';
import { DEFAULT_POOL, inPool } from './daily';
import type { PoolRange } from './daily';
import { NAIVE_GATE_LAST, NAIVE_REACT_MS, runNaive } from './naivePlayer';
import type { NaiveRow } from './naivePlayer';

/** The clock step: `star3` rounds to it, `star2` rounds up to it (GDD §3). */
export const RECLOCK_STEP_MS = 5000;
/** Both clocks are capped here. */
export const RECLOCK_CAP_MS = 180_000;
/** The K at which the AUD-B10 tie floor is defined; a lower K makes every floor provisional. */
export const RECLOCK_RULE_K = 20;
/** Last level the tie floor always applies to — the naive gate's last level (GDD §3 "first-time line" 5). */
export const TIE_FLOOR_ALWAYS_LAST = NAIVE_GATE_LAST;
/** Past `TIE_FLOOR_ALWAYS_LAST`, a daily-pool level gets the floor when its two medians differ by more than this. */
export const TIE_FLOOR_SPREAD_MS = RECLOCK_STEP_MS;
/** Reporting filter: a raising floor needs the two 2★ counts to differ by ≥ this share of K (8 of 20). */
export const TWO_STAR_GAP_SHARE = 0.4;
/** Maxed Commander upgrades for the boundary step. */
export const MAX_MODIFIERS: PlayerModifiers = Object.freeze({ productionMul: 1.2, capacityMul: 1.25, startGarrisonBonus: 5, unitSpeedMul: 1.15 });

export const roundStep = (ms: number): number => Math.round(ms / RECLOCK_STEP_MS) * RECLOCK_STEP_MS;
export const ceilStep = (ms: number): number => Math.ceil(ms / RECLOCK_STEP_MS) * RECLOCK_STEP_MS;

/** The `star2` floor: the slower of the two tie orders' medians rounded up to the step, capped; undefined when neither order won. */
export function star2Floor(ascMs: number | undefined, descMs: number | undefined, capMs: number = RECLOCK_CAP_MS): number | undefined {
  const medians = [ascMs, descMs].filter((m): m is number => m !== undefined);
  if (medians.length === 0) return undefined;
  return Math.min(capMs, ceilStep(Math.max(...medians)));
}

/** Does the tie floor apply to this level? 1–16 always; past 16 only in the daily pool with the two medians > 5 s apart. */
export function tieFloorApplies(levelId: number, ascMs: number | undefined, descMs: number | undefined, pool: Readonly<PoolRange> = DEFAULT_POOL): boolean {
  if (levelId <= TIE_FLOOR_ALWAYS_LAST) return true;
  if (!inPool({ id: levelId }, pool) || ascMs === undefined || descMs === undefined) return false;
  return Math.abs(ascMs - descMs) > TIE_FLOOR_SPREAD_MS;
}

/** Minimum 2★-count gap (out of K) for a floor to raise a clock: 8 at K = 20, 2 at K = 5. */
export function twoStarGapMin(k: number): number {
  return Math.ceil(TWO_STAR_GAP_SHARE * k);
}

/** The warning a run below `RECLOCK_RULE_K` prints; undefined at K ≥ 20. */
export function provisionalWarning(k: number): string | undefined {
  if (k >= RECLOCK_RULE_K) return undefined;
  return `reclock: WARNING --seeds ${k} < ${RECLOCK_RULE_K} — the star2 tie floor (AUD-B10) is defined at K = ${RECLOCK_RULE_K}; floors below are provisional, do not --write them`;
}

/** One tie order of the naive line as the floor reads it. */
export interface TieLine {
  medianMs: number | undefined;
  wins: number;
  /** Runs with ≥ 2★ at the level's current clocks. */
  twoStar: number;
}

export function tieLineOf(row: Pick<NaiveRow, 'medianMs' | 'wins' | 'starCounts'>): TieLine {
  return { medianMs: row.medianMs, wins: row.wins, twoStar: row.starCounts[2] + row.starCounts[3] };
}

export interface FloorInput {
  levelId: number;
  /** The level's `star2` in its JSON today. */
  currentStar2: number;
  /** max(2 × star3, worst reference win rounded up), capped. */
  baseStar2: number;
  asc: TieLine;
  desc: TieLine;
  k: number;
  pool?: Readonly<PoolRange>;
}

export interface FloorVerdict {
  eligible: boolean;
  floorMs: number | undefined;
  /** |asc 2★ − desc 2★| at the current clock. */
  gap: number;
  gapMin: number;
  /** The floor is in the proposal (false when ineligible, no floor, or held back by the 2★-gap filter). */
  applied: boolean;
  /** The proposed `star2`. */
  star2: number;
  /** `floor would be X s — not applied, 2★ gap G < M` when held back; empty otherwise. */
  note: string;
}

/** Combine the base `star2` with the tie floor (see the module comment for the rule and the filter). */
export function applyTieFloor(input: FloorInput): FloorVerdict {
  const { levelId, currentStar2, baseStar2, asc, desc, k } = input;
  const eligible = tieFloorApplies(levelId, asc.medianMs, desc.medianMs, input.pool ?? DEFAULT_POOL);
  const floorMs = eligible ? star2Floor(asc.medianMs, desc.medianMs) : undefined;
  const gap = Math.abs(asc.twoStar - desc.twoStar);
  const gapMin = twoStarGapMin(k);
  if (floorMs === undefined) return { eligible, floorMs, gap, gapMin, applied: false, star2: baseStar2, note: '' };
  if (floorMs <= currentStar2 || gap >= gapMin) {
    return { eligible, floorMs, gap, gapMin, applied: true, star2: Math.max(baseStar2, floorMs), note: '' };
  }
  return {
    eligible,
    floorMs,
    gap,
    gapMin,
    applied: false,
    star2: Math.max(baseStar2, Math.min(floorMs, currentStar2)),
    note: `floor would be ${floorMs / 1000} — not applied, 2★ gap ${gap} < ${gapMin}`,
  };
}

export interface ReclockRow {
  level: LevelDef;
  seeds: number;
  wins: number;
  medianMs: number;
  worstMs: number;
  star3: number;
  /** `step(n/10)` when the boundary step fired. */
  step: string;
  baseStar2: number;
  star2: number;
  /** Both tie orders; absent when the level is past 16 and outside the daily pool (no naive run). */
  asc?: TieLine;
  desc?: TieLine;
  floor?: FloorVerdict;
  /** Proposed clocks equal the JSON's. */
  same: boolean;
}

/** Whether the naive line must run for this level at all (1–16, or a daily-pool level). */
export function needsNaive(levelId: number, pool: Readonly<PoolRange> = DEFAULT_POOL): boolean {
  return levelId <= TIE_FLOOR_ALWAYS_LAST || inPool({ id: levelId }, pool);
}

/** Re-clock one level over reference seeds 1..k and (when needed) the naive line's two tie orders at the same k; undefined on no reference win. */
export function reclockLevel(level: LevelDef, k: number): ReclockRow | undefined {
  const times: number[] = [];
  for (let s = 1; s <= k; s++) {
    const r = runHeadless(level, s, referencePlayerCommands);
    if (r.outcome === 'won') times.push(r.timeMs);
  }
  if (times.length === 0) return undefined;
  times.sort((a, b) => a - b);
  const medianMs = times[Math.floor((times.length - 1) / 2)]!;
  const worstMs = times[times.length - 1]!;
  let star3 = Math.min(RECLOCK_CAP_MS, roundStep(0.9 * medianMs));
  let step = '';
  // Boundary step: maxed commander upgrades must not push a level to ≥ 80 % 3★.
  let threeStar = 0;
  for (let s = 1; s <= 10; s++) {
    const r = runHeadless(level, s, referencePlayerCommands, { modifiers: MAX_MODIFIERS });
    if (r.outcome === 'won' && r.timeMs <= star3) threeStar++;
  }
  if (threeStar >= 8 && star3 > RECLOCK_STEP_MS) {
    star3 -= RECLOCK_STEP_MS;
    step = `step(${threeStar}/10)`;
  }
  const baseStar2 = Math.min(RECLOCK_CAP_MS, Math.max(2 * star3, ceilStep(worstMs)));
  let star2 = baseStar2;
  let asc: TieLine | undefined;
  let desc: TieLine | undefined;
  let floor: FloorVerdict | undefined;
  if (needsNaive(level.id)) {
    asc = tieLineOf(runNaive(level, k, NAIVE_REACT_MS, undefined, 'asc'));
    desc = tieLineOf(runNaive(level, k, NAIVE_REACT_MS, undefined, 'desc'));
    floor = applyTieFloor({ levelId: level.id, currentStar2: level.star2, baseStar2, asc, desc, k });
    star2 = floor.star2;
  }
  return {
    level,
    seeds: k,
    wins: times.length,
    medianMs,
    worstMs,
    star3,
    step,
    baseStar2,
    star2,
    ...(asc ? { asc } : {}),
    ...(desc ? { desc } : {}),
    ...(floor ? { floor } : {}),
    same: star3 === level.star3 && star2 === level.star2,
  };
}
