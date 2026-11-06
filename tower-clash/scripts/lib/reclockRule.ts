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
 * - LV-12 (2026-11-06) human-clock pins: a `HUMAN` entry (`./reclockPins.ts`) replaces the bot's `star3` and / or
 *   `star2` for that level (`applyHumanPin`); the row prints the pinned clock as `human-pinned` next to what the
 *   bot would propose, and a pinned clock never counts towards `CHANGED`. A `star3` pin does not re-derive the
 *   base `star2` (the 2 × rule keeps reading the bot's `star3`): pin `star2` too if the ladder should follow.
 * - LV-12 GD-12 card-reader floor past 16 (GDD §3 "Star-2 floor after launch", AUD-B5 — reported, not applied
 *   until the B5 switch): on 17–50 `star2` ≥ the shipped card's literal reader (`CARD_SPECS`, `./cardSpecs.ts`,
 *   run through `runNaive` with the `--follow` spec; a level without a spec reads the plain naive line) — the
 *   slower of its `asc` / `tie desc` medians at the run's K (AUD-B10's both-orders reading of the GDD's
 *   "the `asc` row"), rounded up to the 5 s step, capped at 180 s, never below the reference player's `star2`
 *   (`gd12Floor`). `--gd12` prints it with `BELOW` where today's clock is under it; only `--write --gd12-apply`
 *   writes it, and never over a human-pinned `star2`.
 */
import type { LevelDef, PlayerModifiers } from '../../src/sim/types';
import { referencePlayerCommands } from '../../src/ai/referencePlayer';
import { runHeadless } from '../../src/ai/headless';
import { DEFAULT_POOL, inPool } from './daily';
import type { PoolRange } from './daily';
import { NAIVE_GATE_LAST, NAIVE_REACT_MS, formatFollowSpec, parseFollowSpec, runNaive } from './naivePlayer';
import type { NaiveRow } from './naivePlayer';
import { MAX_LEVEL_ID } from './validateLevel';
import type { CardSpec } from './cardSpecs';
import type { HumanPin } from './reclockPins';

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

// ---------------------------------------------------------------------------------------------------------------
// LV-12 (2026-11-06): human-clock pins and the GD-12 card-reader floor past 16.
// ---------------------------------------------------------------------------------------------------------------

/** First / last level of the GD-12 card-reader floor: everything past the naive gate (17–50). */
export const GD12_FIRST_LEVEL = TIE_FLOOR_ALWAYS_LAST + 1;
export const GD12_LAST_LEVEL = MAX_LEVEL_ID;

/** What `reclock.ts --gd12-apply` prints (exit 1) without `--write`: the AUD-B5 switch is both flags. */
export const GD12_APPLY_REFUSAL =
  'reclock: --gd12-apply is the AUD-B5 switch and needs --write as well (`--write --gd12-apply`); without --write the GD-12 floor is reported only (--gd12). Nothing was run.';

/** Does the GD-12 floor apply to this level? 17–50 (the levels item 10's naive floor does not cover). */
export function gd12Applies(levelId: number): boolean {
  return levelId >= GD12_FIRST_LEVEL && levelId <= GD12_LAST_LEVEL;
}

export interface Gd12Input {
  /** The level's `star2` in its JSON today. */
  currentStar2: number;
  /** The reference player's proposed `star2` (base + tie floor) — the GD-12 floor never goes under it. */
  refStar2: number;
  asc: TieLine;
  desc: TieLine;
}

export interface Gd12Verdict extends Gd12Input {
  /** The card reader's floor: the slower of the two medians rounded up to the step, capped; undefined when no order won. */
  floorMs: number | undefined;
  /** Today's `star2` is under the floor (the GD-12 trigger's "2★ out of the card reader's reach"). */
  below: boolean;
  /** `star2` with the floor applied: max(`refStar2`, floor). */
  star2: number;
}

/** The GD-12 floor from two card-reader tie lines (pure; see the module comment). */
export function gd12Floor(input: Gd12Input): Gd12Verdict {
  const floorMs = star2Floor(input.asc.medianMs, input.desc.medianMs);
  const below = floorMs !== undefined && input.currentStar2 < floorMs;
  const star2 = Math.max(input.refStar2, floorMs ?? 0);
  return { ...input, floorMs, below, star2 };
}

export interface Gd12Line extends Gd12Verdict {
  /** The spec as run (canonical `formatFollowSpec`), or undefined when the plain naive line stood in for a card without one. */
  spec: string | undefined;
  source: string;
}

/**
 * Run the level's card reader in both tie orders at K (4 s reactions) and read the GD-12 floor from it. With no
 * `card.spec` (today only level 26) the plain naive line stands in — `spec` is undefined and the row says so.
 */
export function gd12Line(level: LevelDef, k: number, card: CardSpec | undefined, currentStar2: number, refStar2: number): Gd12Line {
  const follow = card?.spec !== undefined ? parseFollowSpec(card.spec) : undefined;
  const asc = tieLineOf(runNaive(level, k, NAIVE_REACT_MS, follow, 'asc'));
  const desc = tieLineOf(runNaive(level, k, NAIVE_REACT_MS, follow, 'desc'));
  return {
    ...gd12Floor({ currentStar2, refStar2, asc, desc }),
    spec: follow ? formatFollowSpec(follow) : undefined,
    source: card?.source ?? 'no entry in CARD_SPECS',
  };
}

export interface ClockProposal {
  star3: number;
  star2: number;
  /** The bot's own clocks where a pin or the GD-12 floor replaced them (for the row's "bot would"). */
  bot3: number;
  bot2: number;
  pinned3: boolean;
  pinned2: boolean;
  /** The GD-12 floor raised `star2` (only under `--write --gd12-apply`, never over a `star2` pin). */
  gd12Applied: boolean;
  /** A pinned clock differs from the JSON: the pin is not CHANGED (never written over by the bot), the JSON is to be edited by hand. */
  pinMismatch: boolean;
}

/** The bot's clocks with a human pin over them (a pinned clock is the pin; the other stays the bot's). */
export function applyHumanPin(star3: number, star2: number, pin: HumanPin | undefined): ClockProposal {
  const pinned3 = pin?.star3 !== undefined;
  const pinned2 = pin?.star2 !== undefined;
  return {
    star3: pinned3 ? pin.star3! : star3,
    star2: pinned2 ? pin.star2! : star2,
    bot3: star3,
    bot2: star2,
    pinned3,
    pinned2,
    gd12Applied: false,
    pinMismatch: false,
  };
}

/**
 * The clocks `reclock.ts` prints and writes for a row: the bot's, under the human pin, with the GD-12 floor on
 * `star2` when `gd12Apply` (the AUD-B5 switch) and no `star2` pin. `changed` is false when only pinned clocks
 * differ from the JSON — a pin is never a `CHANGED` row (it is what the JSON must already say).
 */
export function proposeClocks(row: Pick<ReclockRow, 'star3' | 'star2' | 'level'>, pin: HumanPin | undefined, gd12?: Gd12Verdict, gd12Apply = false): ClockProposal & { changed: boolean } {
  const p = applyHumanPin(row.star3, row.star2, pin);
  if (gd12 && gd12Apply && !p.pinned2 && gd12.floorMs !== undefined && gd12.star2 > p.star2) {
    p.star2 = gd12.star2;
    p.gd12Applied = true;
  }
  const changed = (!p.pinned3 && p.star3 !== row.level.star3) || (!p.pinned2 && p.star2 !== row.level.star2);
  p.pinMismatch = (p.pinned3 && p.star3 !== row.level.star3) || (p.pinned2 && p.star2 !== row.level.star2);
  return { ...p, changed };
}

const sec = (ms: number | undefined): string => (ms === undefined ? '—' : `${(ms / 1000).toFixed(1)}s`);
const clock = (ms: number): string => `${ms / 1000}`;

/** The `human-pinned` note of a row: ` [star3 human-pinned (sheet …): bot would 30]`; empty without a pin. */
export function humanPinNote(p: ClockProposal, pin: HumanPin | undefined, json?: Pick<LevelDef, 'star3' | 'star2'>): string {
  if (!pin || (!p.pinned3 && !p.pinned2)) return '';
  const which = p.pinned3 && p.pinned2 ? 'star3/star2' : p.pinned3 ? 'star3' : 'star2';
  const would = p.pinned3 && p.pinned2 ? `${clock(p.bot3)}/${clock(p.bot2)}` : p.pinned3 ? clock(p.bot3) : clock(p.bot2);
  const off: string[] = [];
  if (json && p.pinned3 && json.star3 !== p.star3) off.push(`star3 ${clock(json.star3)}`);
  if (json && p.pinned2 && json.star2 !== p.star2) off.push(`star2 ${clock(json.star2)}`);
  const mismatch = off.length > 0 ? `; PIN ≠ JSON (JSON says ${off.join(', ')} — edit the JSON by hand, the bot never writes over a pin)` : '';
  return ` [${which} human-pinned (${pin.source}): bot would ${would}${mismatch}]`;
}

/** The GD-12 column of a row: ` gd12 [spec] asc/desc m/m (w/K, w/K) floor N BELOW|ok|applied`. */
export function gd12Note(g: Gd12Line, k: number, applied: boolean): string {
  const card = g.spec !== undefined ? `[${g.spec}]` : '[naive (no card spec)]';
  const floor = g.floorMs === undefined ? 'floor —' : `floor ${clock(g.floorMs)}`;
  const verdict = g.floorMs === undefined ? 'no win' : applied ? 'applied' : g.below ? 'BELOW' : 'ok';
  return ` gd12 ${card} asc/desc ${sec(g.asc.medianMs)}/${sec(g.desc.medianMs)} (${g.asc.wins}/${k}, ${g.desc.wins}/${k}) ${floor} ${verdict}`;
}

export interface RowReport {
  text: string;
  changed: boolean;
  /** The tie floor was held back by the 2★-gap filter. */
  held: boolean;
  pinned: boolean;
  /** A pinned clock differs from the JSON (the row says `PIN ≠ JSON`). */
  pinMismatch: boolean;
}

/** One reclock row as `scripts/reclock.ts` prints it (byte-identical to the pre-LV-12 row without a pin or `--gd12`). */
export function formatReclockRow(row: ReclockRow, opts: { keep?: string | undefined; pin?: HumanPin | undefined; gd12?: Gd12Line | undefined; gd12Apply?: boolean } = {}): RowReport {
  const { level, seeds } = row;
  const p = proposeClocks(row, opts.pin, opts.gd12, opts.gd12Apply ?? false);
  const losses = seeds - row.wins;
  const naive = row.asc && row.desc ? ` naive asc/desc ${sec(row.asc.medianMs)}/${sec(row.desc.medianMs)} 2★ ${row.asc.twoStar}/${row.desc.twoStar}` : '';
  const floor = row.floor?.eligible
    ? row.floor.note
      ? ` — ${row.floor.note}`
      : row.floor.floorMs !== undefined
        ? ` floor ${row.floor.floorMs / 1000}`
        : ''
    : '';
  const gd12 = opts.gd12 ? gd12Note(opts.gd12, seeds, p.gd12Applied) : '';
  const same = !p.changed;
  const tail = same ? '' : opts.keep ? `\tKEPT (${opts.keep})` : '\tCHANGED';
  const text =
    `${level.id}\t${level.name.padEnd(22)}\t${row.wins}/${seeds}${losses ? ` (${losses} lost)` : ''}\tmedian ${sec(row.medianMs)}\tworst ${sec(row.worstMs)}\t` +
    `${clock(level.star3)}/${clock(level.star2)} → ${clock(p.star3)}/${clock(p.star2)}${row.step ? ` ${row.step}` : ''}${humanPinNote(p, opts.pin, level)}${naive}${floor}${gd12}${tail}`;
  return { text, changed: p.changed && !opts.keep, held: Boolean(row.floor?.note), pinned: p.pinned3 || p.pinned2, pinMismatch: p.pinMismatch };
}
