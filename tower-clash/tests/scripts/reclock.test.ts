import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadLevel } from '../../src/levels/index';
import { CARD_SPECS, missingCardSpecs } from '../../scripts/lib/cardSpecs';
import { NAIVE_REACT_MS, parseFollowSpec, runNaive, validateFollowSpec } from '../../scripts/lib/naivePlayer';
import { HUMAN, KEEP, validateHumanPin, validateHumanPins } from '../../scripts/lib/reclockPins';
import type { HumanPin } from '../../scripts/lib/reclockPins';
import {
  GD12_APPLY_REFUSAL,
  GD12_FIRST_LEVEL,
  GD12_LAST_LEVEL,
  RECLOCK_RULE_K,
  applyHumanPin,
  applyTieFloor,
  ceilStep,
  formatReclockRow,
  gd12Applies,
  gd12Floor,
  gd12Line,
  gd12Note,
  proposeClocks,
  provisionalWarning,
  reclockLevel,
  star2Floor,
  tieFloorApplies,
  twoStarGapMin,
} from '../../scripts/lib/reclockRule';
import type { ReclockRow, TieLine } from '../../scripts/lib/reclockRule';
import { makeLevel } from '../helpers';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TSX = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));
const reclock = (...argv: string[]) => spawnSync(process.execPath, [TSX, 'scripts/reclock.ts', ...argv], { cwd: ROOT, encoding: 'utf8' });

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
    [13, 80_000], // LV-1.0.1a (2026-11-04): outpost 3 → 6 u moved the floor to the JSON clock
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
  ])('level %i is held at star2 %i (floor would be %i, not applied)', async (id, star2, floorMs) => {
    const level = (await loadLevel(id))!;
    expect(level.star2).toBe(star2);
    const row = reclockLevel(level, RECLOCK_RULE_K)!;
    expect(row.floor).toMatchObject({ eligible: true, applied: false, floorMs });
    expect(row.floor!.gap).toBeLessThan(8);
    expect(row.star2).toBe(star2);
  }, 60_000);
});

/*
 * LV-12 (2026-11-06, QA): two mechanisms for the day the human playtest sets clocks
 * (docs/reviews/2026-11-05-human-playtest-sheet.md §C). (1) `HUMAN` pins (`scripts/lib/reclockPins.ts`): a pinned
 * `star3` / `star2` replaces the bot's proposal, prints as `human-pinned … bot would N`, never counts as CHANGED,
 * and a pinned `star2` blocks the GD-12 floor. (2) The GD-12 card-reader floor past 16 (GDD §3 "Star-2 floor after
 * launch"): each level's shipped card spec (`scripts/lib/cardSpecs.ts`) through the follower in both tie orders,
 * the slower median rounded up to 5 s, capped, never below the bot's `star2` — reported by `--gd12`, written only
 * by `--write --gd12-apply` (the AUD-B5 switch; refused without `--write`).
 */

/** A hand-made reclock row (no sim): the bot proposes `star3` / `star2` for a fixture level with `jsonStar3` / `jsonStar2`. */
function fixtureRow(over: { id?: number; jsonStar3: number; jsonStar2: number; star3: number; star2: number; step?: string }): ReclockRow {
  const level = makeLevel({ id: over.id ?? 40, name: 'Fixture Keep', star3: over.jsonStar3, star2: over.jsonStar2 });
  return {
    level,
    seeds: 20,
    wins: 20,
    medianMs: 33_400,
    worstMs: 41_900,
    star3: over.star3,
    step: over.step ?? '',
    baseStar2: over.star2,
    star2: over.star2,
    same: over.star3 === over.jsonStar3 && over.star2 === over.jsonStar2,
  };
}

const PIN3: HumanPin = { star3: 35_000, source: 'sheet 2026-11-10', note: 'zone S, H 48 s / B 33.4 s, r 1.44' };
const PIN2: HumanPin = { star2: 70_000, source: 'sheet 2026-11-10', note: 'C.2 adopted' };

describe('human-clock pins (LV-12)', () => {
  it('HUMAN is empty today (the first entry is a deliberate test update) and KEEP still pins 1 and 33', () => {
    expect(HUMAN).toEqual({});
    expect(Object.isFrozen(HUMAN)).toBe(true);
    expect(validateHumanPins(HUMAN)).toBe(HUMAN);
    expect(Object.keys(KEEP).map(Number)).toEqual([1, 33]);
  });

  it('validates a hand-edited pin: ms on the 5 s step up to 180 s, star3 under star2, a sheet date, a note', () => {
    expect(() => validateHumanPin(40, PIN3)).not.toThrow();
    expect(() => validateHumanPin(40, { ...PIN3, star3: 35_500 })).toThrow(/HUMAN\[40\] star3 35500 is not a positive multiple of 5000/);
    expect(() => validateHumanPin(40, { ...PIN3, star3: 185_000 })).toThrow(/up to 180000/);
    expect(() => validateHumanPin(40, { star3: 70_000, star2: 70_000, source: 'sheet 2026-11-10', note: 'x' })).toThrow(/star3 70000 must be under star2 70000/);
    expect(() => validateHumanPin(40, { ...PIN3, source: '2026-11-10' })).toThrow(/is not "sheet YYYY-MM-DD"/);
    expect(() => validateHumanPin(40, { ...PIN3, note: ' ' })).toThrow(/needs a note/);
    expect(() => validateHumanPin(40, { source: 'sheet 2026-11-10', note: 'x' })).toThrow(/pins neither star3 nor star2/);
    expect(() => validateHumanPins({ 40: PIN3, 41: { ...PIN2, star2: 1 } })).toThrow(/HUMAN\[41\] star2 1/);
  });

  it('a pinned clock replaces the bot proposal; the other clock stays the bot\'s', () => {
    expect(applyHumanPin(30_000, 60_000, undefined)).toMatchObject({ star3: 30_000, star2: 60_000, pinned3: false, pinned2: false });
    expect(applyHumanPin(30_000, 60_000, PIN3)).toMatchObject({ star3: 35_000, star2: 60_000, bot3: 30_000, bot2: 60_000, pinned3: true, pinned2: false });
    expect(applyHumanPin(30_000, 60_000, PIN2)).toMatchObject({ star3: 30_000, star2: 70_000, pinned3: false, pinned2: true });
    expect(applyHumanPin(30_000, 60_000, { ...PIN3, star2: 80_000 })).toMatchObject({ star3: 35_000, star2: 80_000, pinned3: true, pinned2: true });
  });

  it('the row prints the pin as human-pinned beside what the bot would propose, and the pin is not CHANGED', () => {
    // JSON 35 / 70 (the human clock already written), bot would say 30 / 70 → with the pin nothing changed
    const row = fixtureRow({ jsonStar3: 35_000, jsonStar2: 70_000, star3: 30_000, star2: 70_000 });
    const pinned = formatReclockRow(row, { pin: PIN3 });
    expect(pinned.text).toBe(
      '40\tFixture Keep          \t20/20\tmedian 33.4s\tworst 41.9s\t35/70 → 35/70 [star3 human-pinned (sheet 2026-11-10): bot would 30]',
    );
    expect(pinned).toMatchObject({ changed: false, pinned: true, held: false });
    // the same row without the pin is the bot's CHANGED row, byte-identical to the pre-LV-12 format
    const bare = formatReclockRow(row);
    expect(bare.text).toBe('40\tFixture Keep          \t20/20\tmedian 33.4s\tworst 41.9s\t35/70 → 30/70\tCHANGED');
    expect(bare).toMatchObject({ changed: true, pinned: false });
    // a KEEP level is never CHANGED either, pin or not
    expect(formatReclockRow(row, { keep: 'weekly pin' })).toMatchObject({ changed: false });
    expect(formatReclockRow(row, { keep: 'weekly pin' }).text).toMatch(/\tKEPT \(weekly pin\)$/);
  });

  it('a pin on one clock does not hide a change on the other; the JSON not yet at the pin is CHANGED towards it', () => {
    // star3 pinned, bot moves star2 70 → 80: CHANGED (star2), the row shows the pin and the step
    const row = fixtureRow({ jsonStar3: 35_000, jsonStar2: 70_000, star3: 30_000, star2: 80_000, step: 'step(8/10)' });
    const r = formatReclockRow(row, { pin: PIN3 });
    expect(r.text).toContain('35/70 → 35/80 step(8/10) [star3 human-pinned (sheet 2026-11-10): bot would 30]\tCHANGED');
    expect(r.changed).toBe(true);
    expect(proposeClocks(row, PIN3)).toMatchObject({ star3: 35_000, star2: 80_000, changed: true });
    // both pinned: nothing the bot says counts
    expect(proposeClocks(row, { ...PIN3, star2: 70_000 })).toMatchObject({ star3: 35_000, star2: 70_000, changed: false });
    expect(formatReclockRow(row, { pin: { ...PIN3, star2: 70_000 } }).text).toContain('→ 35/70 step(8/10) [star3/star2 human-pinned (sheet 2026-11-10): bot would 30/80]');
    // JSON still at the bot's 30 while the pin says 35: not CHANGED (a pin is never written by the bot), but flagged
    // PIN ≠ JSON in the row and the summary — the JSON is edited by hand, as the sheet's §D step 5 says
    const stale = fixtureRow({ jsonStar3: 30_000, jsonStar2: 60_000, star3: 30_000, star2: 60_000 });
    expect(proposeClocks(stale, PIN3)).toMatchObject({ star3: 35_000, star2: 60_000, changed: false, pinMismatch: true });
    const flagged = formatReclockRow(stale, { pin: PIN3 });
    expect(flagged.text).toBe(
      '40\tFixture Keep          \t20/20\tmedian 33.4s\tworst 41.9s\t30/60 → 35/60 [star3 human-pinned (sheet 2026-11-10): bot would 30; PIN ≠ JSON (JSON says star3 30 — edit the JSON by hand, the bot never writes over a pin)]',
    );
    expect(flagged).toMatchObject({ changed: false, pinned: true, pinMismatch: true });
    expect(formatReclockRow(row, { pin: PIN3 }).pinMismatch).toBe(false);
  });
});

describe('GD-12 card-reader star2 floor past 16 (LV-12)', () => {
  const line = (medianMs: number | undefined, wins = 20, twoStar = 0): TieLine => ({ medianMs, wins, twoStar });

  it('applies to 17–50 only', () => {
    expect(GD12_FIRST_LEVEL).toBe(17);
    expect(GD12_LAST_LEVEL).toBe(50);
    expect(gd12Applies(16)).toBe(false);
    expect(gd12Applies(17)).toBe(true);
    expect(gd12Applies(50)).toBe(true);
    expect(gd12Applies(51)).toBe(false);
  });

  it('the floor is the slower card-reader median rounded up to 5 s, capped, never under the bot\'s star2', () => {
    // 17 (GD-8a): reader 54.4 / 59.5 s at star2 50 → floor 60, below
    const v = gd12Floor({ currentStar2: 50_000, refStar2: 50_000, asc: line(54_400), desc: line(59_500) });
    expect(v).toMatchObject({ floorMs: 60_000, below: true, star2: 60_000 });
    // the bot's star2 above the floor wins (never below the reference player's star2)
    expect(gd12Floor({ currentStar2: 50_000, refStar2: 65_000, asc: line(54_400), desc: line(59_500) })).toMatchObject({ floorMs: 60_000, below: true, star2: 65_000 });
    // today's clock at or over the floor: not below, star2 unchanged
    expect(gd12Floor({ currentStar2: 60_000, refStar2: 60_000, asc: line(54_400), desc: line(59_500) })).toMatchObject({ floorMs: 60_000, below: false, star2: 60_000 });
    // an order with no win does not floor; no win at all → no floor
    expect(gd12Floor({ currentStar2: 50_000, refStar2: 50_000, asc: line(54_400), desc: line(undefined, 0) })).toMatchObject({ floorMs: 55_000, below: true });
    expect(gd12Floor({ currentStar2: 50_000, refStar2: 50_000, asc: line(undefined, 0), desc: line(undefined, 0) })).toMatchObject({ floorMs: undefined, below: false, star2: 50_000 });
    // capped at 180 s
    expect(gd12Floor({ currentStar2: 150_000, refStar2: 150_000, asc: line(183_000), desc: line(100_000) })).toMatchObject({ floorMs: 180_000, star2: 180_000 });
  });

  it('is applied only under the B5 switch, and never over a human-pinned star2', () => {
    const row = fixtureRow({ jsonStar3: 25_000, jsonStar2: 50_000, star3: 25_000, star2: 50_000 });
    const g = gd12Floor({ currentStar2: 50_000, refStar2: 50_000, asc: line(54_400), desc: line(59_500) });
    expect(proposeClocks(row, undefined, g)).toMatchObject({ star2: 50_000, gd12Applied: false, changed: false });
    expect(proposeClocks(row, undefined, g, true)).toMatchObject({ star2: 60_000, gd12Applied: true, changed: true });
    expect(proposeClocks(row, PIN2, g, true)).toMatchObject({ star2: 70_000, gd12Applied: false, pinned2: true, changed: false });
    expect(proposeClocks(row, PIN3, g, true)).toMatchObject({ star3: 35_000, star2: 60_000, gd12Applied: true, changed: true });
    // a floor under the bot's star2 applies nothing
    const under = gd12Floor({ currentStar2: 50_000, refStar2: 50_000, asc: line(44_000), desc: line(41_000) });
    expect(proposeClocks(row, undefined, under, true)).toMatchObject({ star2: 50_000, gd12Applied: false, changed: false });
    // the row column
    const full = { ...g, spec: 'prio=east,west', source: 'GD-8a' };
    expect(gd12Note(full, 20, false)).toBe(' gd12 [prio=east,west] asc/desc 54.4s/59.5s (20/20, 20/20) floor 60 BELOW');
    expect(gd12Note(full, 20, true)).toBe(' gd12 [prio=east,west] asc/desc 54.4s/59.5s (20/20, 20/20) floor 60 applied');
    expect(gd12Note({ ...full, below: false }, 20, false)).toMatch(/floor 60 ok$/);
    expect(gd12Note({ ...full, spec: undefined }, 20, false)).toContain(' gd12 [naive (no card spec)] ');
    expect(formatReclockRow(row, { gd12: full }).text).toContain('25/50 → 25/50 gd12 [prio=east,west] asc/desc 54.4s/59.5s (20/20, 20/20) floor 60 BELOW');
    expect(formatReclockRow(row, { gd12: full }).changed).toBe(false);
    expect(formatReclockRow(row, { gd12: full, gd12Apply: true }).text).toMatch(/→ 25\/60 gd12 .* floor 60 applied\tCHANGED$/);
  });

  it('CARD_SPECS covers every level 17–50 with a spec that validates against the level; only 26 reads the naive line', async () => {
    expect(missingCardSpecs()).toEqual([]);
    expect(missingCardSpecs({})).toHaveLength(34);
    const fallback: number[] = [];
    for (let id = GD12_FIRST_LEVEL; id <= GD12_LAST_LEVEL; id++) {
      const card = CARD_SPECS[id]!;
      expect(card.source, `level ${id} source`).not.toBe('');
      if (card.spec === undefined) {
        fallback.push(id);
        continue;
      }
      const level = (await loadLevel(id))!;
      expect(() => validateFollowSpec(parseFollowSpec(card.spec!), level), `level ${id} ${card.spec}`).not.toThrow();
    }
    expect(fallback).toEqual([26]);
  });

  it('gd12Line runs the card spec in both tie orders at K and reads the floor from the slower median (level 17, K = 2)', async () => {
    const level = (await loadLevel(17))!;
    const k = 2;
    const card = CARD_SPECS[17]!;
    const spec = parseFollowSpec(card.spec!);
    const asc = runNaive(level, k, NAIVE_REACT_MS, spec, 'asc');
    const desc = runNaive(level, k, NAIVE_REACT_MS, spec, 'desc');
    const g = gd12Line(level, k, card, level.star2, 50_000);
    expect(g.spec).toBe('prio=east,west;noprioFrom=west,east,mid,nw,ne');
    expect(g.source).toBe('GD-8a');
    expect(g.asc).toEqual({ medianMs: asc.medianMs, wins: asc.wins, twoStar: asc.starCounts[2] + asc.starCounts[3] });
    expect(g.desc.medianMs).toBe(desc.medianMs);
    expect(g.floorMs).toBe(star2Floor(asc.medianMs, desc.medianMs));
    expect(g.below).toBe(level.star2 < g.floorMs!);
    // without a spec the plain naive line stands in, marked
    const plain = gd12Line(level, k, undefined, level.star2, 50_000);
    expect(plain.spec).toBeUndefined();
    expect(plain.source).toBe('no entry in CARD_SPECS');
    expect(plain.asc.medianMs).toBe(runNaive(level, k, NAIVE_REACT_MS, undefined, 'asc').medianMs);
  }, 30_000);

  it('--gd12-apply without --write is refused before anything runs, and the JSON is untouched', () => {
    const path = `${ROOT}src/levels/017-minefield.json`;
    const before = readFileSync(path, 'utf8');
    const r = reclock('--gd12-apply', '--only', '17-17', '--seeds', '1');
    expect(r.status).toBe(1);
    expect(r.stderr.trim()).toBe(GD12_APPLY_REFUSAL);
    expect(r.stdout).toBe('');
    expect(readFileSync(path, 'utf8')).toBe(before);
  }, 30_000);

  it('--gd12 prints the column, the 17–50 table and the "reported, not applied" line (level 17, K = 1)', () => {
    const r = reclock('--seeds', '1', '--only', '17-17', '--gd12');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^17\tMinefield .* naive asc\/desc .* gd12 \[prio=east,west;noprioFrom=west,east,mid,nw,ne\] asc\/desc [\d.]+s\/[\d.]+s \(1\/1, 1\/1\) floor \d+ (BELOW|ok)(\tCHANGED)?$/m);
    expect(r.stdout).toContain('lvl\tstar2 today\tGD-12 floor\tbelow?\tcard reader asc/desc\tspec (source)');
    expect(r.stdout).toMatch(/^17\t50\t\d+\t(YES|no)\t[\d.]+\/[\d.]+ \(1\/1, 1\/1\)\tprio=east,west;noprioFrom=west,east,mid,nw,ne \(GD-8a\)$/m);
    expect(r.stdout).toMatch(/^reclock: GD-12 floor BELOW today's star2 on (17|none) — reported, not applied \(the AUD-B5 switch is --write --gd12-apply\)$/m);
    expect(r.stdout).toContain('; human-pinned none');
    expect(r.stdout).toContain('reclock: dry run (add --write)');
  }, 60_000);
});
