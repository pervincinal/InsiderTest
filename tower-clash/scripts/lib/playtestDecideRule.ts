/**
 * `scripts/playtestDecide.ts`'s rules, pure and importable from tests: the mechanical §C of
 * docs/reviews/2026-11-05-human-playtest-sheet.md applied to a CSV of human tries (one row per try).
 *
 * - C.0: a try is **valid** when it is a win at ×1 with 0 boosters and no REINFORCEMENTS (`help`). **H** per level =
 *   the median over testers of each tester's fastest valid win. **First win** = the tester's first won try (lowest
 *   attempt number), whatever its validity. **B** = the bot median (reference player, K = 20; the CSV `bot` column).
 *   Rows are tagged `DECISION` at N ≥ 3 testers, else `PROVISIONAL` (proposed; nothing moves without the
 *   stakeholder's sign-off on the row). "≥ 2 of 3 testers" reads as max(2, ⌈2N / 3⌉); "≥ 2 testers" stays 2.
 * - C.1 (AUD-B4 / A13): r = H / B; zone F when r < 0.85 → min(S3, round5(1.1 × H)); M when 0.85 ≤ r ≤ 1.10 → S3;
 *   S when r > 1.10 → max(S3, round5(B)); then new `star3` < S2 (else S2 − 5 s); levels 1 and 33 never move
 *   (`reclock.ts` KEEP). Band move: ≥ 2 non-pinned sampled levels of a band in the same zone F or S move every
 *   other non-pinned level of the band with the band's median r (F: min(S3, round5(1.1 × r_band × B)); S:
 *   max(S3, round5(B))), same guard. H3: 3★ on ≤ 10 % of valid first wins.
 * - C.2 (AUD-B5) human half: refuted = N ≥ 3 and ≥ 2 testers win their first try of ≥ 4 of the 5 floored sample
 *   levels (17, 23, 32, 38, 49) at ≥ 2★. A first-win 2★ share < 30 % on the GD-12 floored levels is the trigger
 *   firing. The economy half (ECONOMY §6 re-run, ±10 % day-15 / day-30 gold) is an input from Monetization.
 * - C.3 / C.4 (bands 5–6 re-open, the AUD-A3 flag) per tester, and the C.3 lever finding on 32 / 41.
 *
 * Times are milliseconds inside; the tables print seconds.
 */
import { RECLOCK_STEP_MS, roundStep } from './reclockRule';
import { KEEP } from './reclockPins';
import type { HumanPin } from './reclockPins';

export type { HumanPin };

/** C.1 zone F below this ratio (the human beats the bot by more than 15 %). */
export const FAST_BELOW = 0.85;
/** C.1 zone S above this ratio (the human is more than 10 % slower than the bot). */
export const SLOW_ABOVE = 1.1;
/** Zone F's new clock is this multiple of H (3★ = within 10 % of a strong human's pace). */
export const FAST_FACTOR = 1.1;
/** Tester count at which a rule is a `DECISION` (C.0). */
export const DECISION_MIN_TESTERS = 3;
/** Pinned clocks: `scripts/reclock.ts`'s `KEEP` (levels 1 and 33 never move). */
export const PINNED: Readonly<Record<number, string>> = KEEP;
/** GDD §3 progression bands. */
export const BANDS: readonly (readonly [number, number])[] = [[1, 8], [9, 16], [17, 24], [25, 32], [33, 40], [41, 50]];
/** GD-12 card-reader floor past 16 (GDD "Star-2 floor after launch"): level → `star2` if adopted, ms. */
export const GD12_FLOOR: Readonly<Record<number, number>> = Object.freeze({
  17: 55_000, 18: 65_000, 19: 55_000, 21: 60_000, 23: 85_000, 24: 70_000, 25: 50_000, 28: 80_000,
  29: 65_000, 32: 90_000, 34: 80_000, 35: 65_000, 38: 70_000, 43: 70_000, 44: 80_000, 49: 70_000,
});
/** C.2's five floored sample levels. */
export const FLOOR_SAMPLE: readonly number[] = [17, 23, 32, 38, 49];
/** C.2: refuted when a tester wins the first try of at least this many of `FLOOR_SAMPLE` at ≥ 2★. */
export const FLOOR_REFUTE_MIN = 4;
/** C.2: the GD-12 trigger fires under this first-win 2★ share on the floored levels. */
export const GD12_TRIGGER_SHARE = 0.3;
/** C.1 "other half of A13": H3 holds while 3★ is on at most this share of valid first wins. */
export const H3_MAX_SHARE = 0.1;
/** C.5: a first-win 2★ share past 16 of at least this makes the 15-gold 2★ rung the 1.1 candidate. */
export const RUNG_CANDIDATE_SHARE = 0.6;

export type Zone = 'F' | 'M' | 'S';
export type Result = 'W' | 'L' | 'R';
export type Colour = 'red' | 'green' | 'yellow' | 'nobody';
export type Tag = 'DECISION' | 'PROVISIONAL';

export class SheetError extends Error {
  override name = 'SheetError';
}

/** One try. */
export interface Attempt {
  tester: string;
  level: number;
  attempt: number;
  result: Result;
  /** `time_ms` when given, else the card's mm:ss; undefined on a loss / retreat without a time. */
  timeMs: number | undefined;
  stars: number;
  firstEver: boolean | undefined;
  speed: 1 | 2;
  boosters: number;
  help: boolean;
  named: Colour | undefined;
  log: Colour | undefined;
  iv: boolean;
  note: string;
  /** 1-based line in the CSV. */
  line: number;
}

export interface Sheet {
  rows: Attempt[];
  /** Bot median per level from the CSV `bot` column, ms. */
  botMs: Map<number, number>;
}

export interface Clock {
  star3: number;
  star2: number;
  /** Pre-computed bot median (`--levels` file only), ms. */
  botMs?: number;
}

export const REQUIRED_COLUMNS = [
  'tester', 'level', 'bot', 'attempt', 'result', 'time', 'stars', 'first_ever', 'speed', 'boosters', 'help', 'named', 'log', 'iv', 'note',
] as const;
export const OPTIONAL_COLUMNS = ['time_ms'] as const;
const KNOWN = new Set<string>([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);

const RESULT: Readonly<Record<string, Result>> = { W: 'W', L: 'L', R: 'R', Q: 'W', M: 'L', G: 'R' };
const COLOUR: Readonly<Record<string, Colour>> = {
  red: 'red', green: 'green', yellow: 'yellow', nobody: 'nobody', none: 'nobody',
  'qırmızı': 'red', 'yaşıl': 'green', 'sarı': 'yellow', 'heç kim': 'nobody',
};

/** Split one CSV line; double-quoted fields may hold commas and `""`. */
export function splitCsvLine(line: string, lineNo: number): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === '') { quoted = true; cur = ''; }
    else if (ch === ',') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (quoted) throw new SheetError(`line ${lineNo}: unterminated quoted field`);
  out.push(cur.trim());
  return out;
}

/** `mm:ss` or `mm:ss.fff` → ms; NaN when malformed. */
export function parseClock(t: string): number {
  const m = /^(\d{1,3}):([0-5]\d(?:\.\d{1,3})?)$/.exec(t.trim());
  return m ? Math.round((Number(m[1]) * 60 + Number(m[2])) * 1000) : NaN;
}

const flag = (v: string, col: string, where: string): boolean => {
  if (v === '' || v === '0') return false;
  if (v === '1') return true;
  throw new SheetError(`${where}: ${col} must be 0, 1 or empty, got "${v}"`);
};

/** Parse the sheet CSV (see `scripts/playtestDecide.ts` for the columns); throws `SheetError` with the line on bad input. */
export function parseSheet(text: string, isLevel: (id: number) => boolean = (id) => id >= 1 && id <= 50): Sheet {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((l, i) => ({ l, n: i + 1 })).filter(({ l }) => l.trim() !== '' && !l.trimStart().startsWith('#'));
  const first = lines.shift();
  if (!first) throw new SheetError('empty sheet: expected a header line');
  const head = splitCsvLine(first.l, first.n).map((h) => h.toLowerCase());
  const dup = head.find((h, i) => head.indexOf(h) !== i);
  if (dup) throw new SheetError(`header (line ${first.n}): column "${dup}" appears twice`);
  const unknown = head.filter((h) => !KNOWN.has(h));
  if (unknown.length) throw new SheetError(`header (line ${first.n}): unknown column(s) ${unknown.join(', ')}; expected ${REQUIRED_COLUMNS.join(',')}[,${OPTIONAL_COLUMNS.join(',')}]`);
  const missing = REQUIRED_COLUMNS.filter((c) => !head.includes(c));
  if (missing.length) throw new SheetError(`header (line ${first.n}): missing column(s) ${missing.join(', ')}${missing.includes('bot') ? ' (bot = the reference player median in seconds, §B.1 "Bot")' : ''}`);
  if (lines.length === 0) throw new SheetError('no data rows under the header');

  const rows: Attempt[] = [];
  const botMs = new Map<number, number>();
  const seen = new Set<string>();
  for (const { l, n } of lines) {
    const f = splitCsvLine(l, n);
    if (f.length !== head.length) throw new SheetError(`line ${n}: ${f.length} field(s), the header has ${head.length} (a comma in a note? quote the note)`);
    const c = (name: string): string => f[head.indexOf(name)] ?? '';
    const where = `line ${n}`;
    const tester = c('tester');
    if (!tester) throw new SheetError(`${where}: tester is empty`);
    const level = Number(c('level'));
    if (!Number.isInteger(level) || !isLevel(level)) throw new SheetError(`${where}: level "${c('level')}" is not a level id`);
    const attempt = Number(c('attempt'));
    if (!Number.isInteger(attempt) || attempt < 1) throw new SheetError(`${where}: attempt "${c('attempt')}" must be 1, 2, …`);
    const key = `${tester}\u0000${level}\u0000${attempt}`;
    if (seen.has(key)) throw new SheetError(`${where}: tester ${tester} level ${level} attempt ${attempt} appears twice`);
    seen.add(key);
    const result = RESULT[c('result').toUpperCase()];
    if (!result) throw new SheetError(`${where}: result "${c('result')}" must be W, L or R (Q, M, G accepted)`);
    const tms = c('time_ms');
    let timeMs: number | undefined;
    if (tms !== '') {
      timeMs = Number(tms);
      if (!Number.isFinite(timeMs) || timeMs <= 0) throw new SheetError(`${where}: time_ms "${tms}" must be a positive number of milliseconds`);
    } else if (c('time') !== '') {
      timeMs = parseClock(c('time'));
      if (!Number.isFinite(timeMs)) throw new SheetError(`${where}: time "${c('time')}" must be mm:ss (the result card's "Vaxt")`);
    }
    if (result === 'W' && timeMs === undefined) throw new SheetError(`${where}: a win needs a time (mm:ss or time_ms)`);
    const starsRaw = c('stars');
    const stars = starsRaw === '' ? 0 : Number(starsRaw);
    if (!Number.isInteger(stars) || stars < 0 || stars > 3) throw new SheetError(`${where}: stars "${starsRaw}" must be 0–3`);
    if (result === 'W' && stars < 1) throw new SheetError(`${where}: a win has 1–3 stars, got ${stars}`);
    if (result !== 'W' && stars !== 0) throw new SheetError(`${where}: a ${result} row has 0 stars, got ${stars}`);
    const fe = c('first_ever');
    const firstEver = fe === '' ? undefined : flag(fe, 'first_ever', where);
    const sp = c('speed');
    if (sp !== '' && sp !== '1' && sp !== '2') throw new SheetError(`${where}: speed "${sp}" must be 1 or 2 (game speed ×1 / ×2)`);
    const bo = c('boosters');
    const boosters = bo === '' ? 0 : Number(bo);
    if (!Number.isInteger(boosters) || boosters < 0) throw new SheetError(`${where}: boosters "${bo}" must be a count`);
    const colour = (col: 'named' | 'log'): Colour | undefined => {
      const v = c(col).toLowerCase();
      if (v === '') return undefined;
      const k = COLOUR[v];
      if (!k) throw new SheetError(`${where}: ${col} "${c(col)}" must be red, green, yellow or nobody`);
      return k;
    };
    const botCell = c('bot');
    if (botCell !== '') {
      const b = Number(botCell);
      if (!Number.isFinite(b) || b <= 0) throw new SheetError(`${where}: bot "${botCell}" must be the bot median in seconds (e.g. 37.0)`);
      const ms = Math.round(b * 1000);
      const had = botMs.get(level);
      if (had !== undefined && had !== ms) throw new SheetError(`${where}: bot ${b} s for level ${level} disagrees with an earlier row (${had / 1000} s)`);
      botMs.set(level, ms);
    }
    rows.push({
      tester, level, attempt, result, timeMs, stars, firstEver,
      speed: sp === '2' ? 2 : 1,
      boosters,
      help: flag(c('help'), 'help', where),
      named: colour('named'),
      log: colour('log'),
      iv: flag(c('iv'), 'iv', where),
      note: c('note'),
      line: n,
    });
  }
  return { rows, botMs };
}

/** `--levels` file: `{ "<id>": { "s3": 25, "s2": 60, "bot"?: 27.8 } }`, seconds (the draft helper's format; `bot3` ignored). */
export function parseLevelsFile(text: string): Map<number, Clock> {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { throw new SheetError(`--levels: not JSON (${(e as Error).message})`); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SheetError('--levels: expected an object { "<id>": { s3, s2, bot? } }');
  const out = new Map<number, Clock>();
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const id = Number(k);
    const o = v as { s3?: unknown; s2?: unknown; bot?: unknown } | null;
    if (!Number.isInteger(id) || !o || typeof o.s3 !== 'number' || typeof o.s2 !== 'number') throw new SheetError(`--levels: entry "${k}" needs numeric s3 and s2 (seconds)`);
    if (o.bot !== undefined && typeof o.bot !== 'number') throw new SheetError(`--levels: entry "${k}" bot must be a number (seconds)`);
    out.set(id, { star3: Math.round(o.s3 * 1000), star2: Math.round(o.s2 * 1000), ...(typeof o.bot === 'number' ? { botMs: Math.round(o.bot * 1000) } : {}) });
  }
  return out;
}

export const median = (xs: readonly number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
};
export const bandOf = (id: number): number => BANDS.findIndex(([a, b]) => id >= a && id <= b);
export const isPinned = (id: number): boolean => PINNED[id] !== undefined;
export const isValid = (a: Attempt): boolean => a.result === 'W' && a.speed === 1 && a.boosters === 0 && !a.help;
/** "≥ 2 of 3 testers" for N testers. */
export const twoThirds = (n: number): number => Math.max(2, Math.ceil((2 * n) / 3));
export const tagFor = (n: number): Tag => (n >= DECISION_MIN_TESTERS ? 'DECISION' : 'PROVISIONAL');

export function zoneOf(r: number): Zone {
  if (r < FAST_BELOW) return 'F';
  if (r > SLOW_ABOVE) return 'S';
  return 'M';
}

/** The C.1 guard: new `star3` < S2, else S2 − 5 s. */
export const underStar2 = (next: number, star2: number): number => (next >= star2 ? star2 - RECLOCK_STEP_MS : next);

/** C.1 for one sampled level (ms). Pinned levels keep S3. */
export function nextStar3(id: number, zone: Zone, clock: Clock, hMs: number, botMs: number): number {
  if (isPinned(id)) return clock.star3;
  let next = clock.star3;
  if (zone === 'F') next = Math.min(clock.star3, roundStep((11 * hMs) / 10));
  else if (zone === 'S') next = Math.max(clock.star3, roundStep(botMs));
  return underStar2(next, clock.star2);
}

/** C.1 band move for one unsampled, non-pinned level (ms). */
export function bandStar3(zone: 'F' | 'S', clock: Clock, rBand: number, botMs: number): number {
  const next = zone === 'F' ? Math.min(clock.star3, roundStep(Math.round(FAST_FACTOR * rBand * botMs))) : Math.max(clock.star3, roundStep(botMs));
  return underStar2(next, clock.star2);
}

export interface LevelRow {
  id: number;
  band: number;
  clock: Clock;
  botMs: number;
  /** Testers' fastest valid wins, ms. */
  bests: number[];
  hMs: number | undefined;
  r: number | undefined;
  zone: Zone | undefined;
  star3: number;
  pinned: boolean;
  /** Attempts to first clear per tester (undefined = no win). */
  firstClear: Record<string, number | undefined>;
}

export interface BandMove {
  band: number;
  zone: 'F' | 'S';
  sampled: number[];
  rBand: number;
  moves: { id: number; from: number; to: number; botMs: number }[];
}

export interface TesterC3 {
  tester: string;
  i: boolean;
  ii: boolean;
  iii: boolean | undefined;
  iv: boolean;
  counts: boolean;
  h2Fails: boolean | undefined;
  finalesNeedRetry: boolean;
  lever32: boolean;
  lever41: boolean;
}

export interface Decision {
  testers: string[];
  n: number;
  tag: Tag;
  need: number;
  rows: number;
  levels: LevelRow[];
  bandMoves: BandMove[];
  h3: { threeStar: number; validFirstWins: number; holds: boolean };
  b5: {
    perTester: { tester: string; firstTry2: number[]; played: number[]; refutes: boolean }[];
    refuters: number;
    refuted: boolean;
    share: { twoStar: number; firstWins: number; triggerFires: boolean };
  };
  past16: { twoStar: number; firstWins: number; rungCandidate: boolean };
  c3: { perTester: TesterC3[]; reopen: number; h1Refuted: number; verdict: 'RE-OPEN' | 'DO NOT RE-OPEN' | 'STAY CLOSED'; lever32: number; lever41: number };
  c4: { h2Fails: number; on: boolean; reason: string };
}

export interface DecideInput {
  sheet: Sheet;
  clockOf: (id: number) => Clock | undefined;
  /** Bot median for an unsampled level a band move needs (ms); undefined = unknown. */
  botOf?: (id: number) => number | undefined;
}

const matchColour = (a: Attempt | undefined): boolean | undefined => (a && a.named && a.log ? a.named === a.log : undefined);

export function decide({ sheet, clockOf, botOf }: DecideInput): Decision {
  const { rows } = sheet;
  const testers = [...new Set(rows.map((r) => r.tester))];
  const n = testers.length;
  const tag = tagFor(n);
  const decisive = tag === 'DECISION';
  const need = twoThirds(n);
  const of = (t: string, id: number): Attempt[] => rows.filter((r) => r.tester === t && r.level === id).sort((a, b) => a.attempt - b.attempt);
  const firstWin = (t: string, id: number): Attempt | undefined => of(t, id).find((r) => r.result === 'W');
  /** Attempts to first clear; Infinity = played, never won; undefined = not played. */
  const clearAt = (t: string, id: number): number | undefined => {
    const tries = of(t, id);
    if (!tries.length) return undefined;
    return firstWin(t, id)?.attempt ?? Infinity;
  };
  const ids = [...new Set(rows.map((r) => r.level))].sort((a, b) => a - b);

  const levels: LevelRow[] = ids.map((id) => {
    const clock = clockOf(id);
    if (!clock) throw new SheetError(`level ${id}: no star3 / star2 (not in the level files or the --levels file)`);
    const botMs = sheet.botMs.get(id) ?? clock.botMs;
    if (botMs === undefined) throw new SheetError(`level ${id}: no bot median — fill the CSV "bot" column from §B.1 (or give it in --levels)`);
    if (clock.botMs !== undefined && sheet.botMs.has(id) && clock.botMs !== botMs) {
      throw new SheetError(`level ${id}: CSV bot ${botMs / 1000} s disagrees with the --levels file (${clock.botMs / 1000} s)`);
    }
    const bests = testers
      .map((t) => Math.min(...of(t, id).filter(isValid).map((r) => r.timeMs!)))
      .filter(Number.isFinite);
    const hMs = bests.length ? median(bests) : undefined;
    const r = hMs !== undefined ? hMs / botMs : undefined;
    const zone = r !== undefined ? zoneOf(r) : undefined;
    const star3 = zone && hMs !== undefined ? nextStar3(id, zone, clock, hMs, botMs) : clock.star3;
    const firstClear: Record<string, number | undefined> = {};
    for (const t of testers) firstClear[t] = clearAt(t, id);
    return { id, band: bandOf(id), clock, botMs, bests, hMs, r, zone, star3, pinned: isPinned(id), firstClear };
  });

  const zoned = new Map(levels.filter((l) => l.zone).map((l) => [l.id, l]));
  const bandMoves: BandMove[] = [];
  for (let b = 0; b < BANDS.length; b++) {
    const inBand = [...zoned.values()].filter((l) => l.band === b && !l.pinned);
    for (const z of ['F', 'S'] as const) {
      const hit = inBand.filter((l) => l.zone === z);
      if (hit.length < 2) continue;
      const rBand = median(hit.map((l) => l.r!));
      const [a, c] = BANDS[b]!;
      const moves: BandMove['moves'] = [];
      for (let id = a; id <= c; id++) {
        if (isPinned(id) || zoned.has(id)) continue;
        const clock = clockOf(id);
        if (!clock) throw new SheetError(`band ${a}–${c} moves: level ${id} has no clocks`);
        const bot = clock.botMs ?? sheet.botMs.get(id) ?? botOf?.(id);
        if (bot === undefined) throw new SheetError(`band ${a}–${c} moves: no bot median for unsampled level ${id} (give it in --levels or let the script run the reference player)`);
        const to = bandStar3(z, clock, rBand, bot);
        if (to !== clock.star3) moves.push({ id, from: clock.star3, to, botMs: bot });
      }
      bandMoves.push({ band: b, zone: z, sampled: hit.map((l) => l.id), rBand, moves });
    }
  }

  const firstWins = testers.flatMap((t) => ids.map((id) => firstWin(t, id)).filter((w): w is Attempt => w !== undefined));
  const validFirst = firstWins.filter(isValid);
  const threeStar = validFirst.filter((w) => w.stars === 3).length;
  const h3 = { threeStar, validFirstWins: validFirst.length, holds: validFirst.length === 0 || threeStar / validFirst.length <= H3_MAX_SHARE };

  // C.2 human half
  const perTester = testers.map((t) => {
    const played = FLOOR_SAMPLE.filter((id) => of(t, id).length > 0);
    const firstTry2 = played.filter((id) => { const a = of(t, id)[0]!; return a.attempt === 1 && a.result === 'W' && a.stars >= 2; });
    return { tester: t, firstTry2, played, refutes: firstTry2.length >= FLOOR_REFUTE_MIN };
  });
  const refuters = perTester.filter((p) => p.refutes).length;
  const floored = firstWins.filter((w) => GD12_FLOOR[w.level] !== undefined);
  const floored2 = floored.filter((w) => w.stars >= 2).length;
  const past = firstWins.filter((w) => w.level > 16);
  const past2 = past.filter((w) => w.stars >= 2).length;

  // C.3 / C.4
  const c3: TesterC3[] = testers.map((t) => {
    const at = (id: number): number | undefined => clearAt(t, id);
    const i = [45, 49, 50].every((id) => at(id) === 1) && [23, 27, 32].some((id) => { const x = at(id); return x !== undefined && x >= 2; });
    const w33 = firstWin(t, 33), w49 = firstWin(t, 49), w50 = firstWin(t, 50);
    const ii = (w49 !== undefined && w49.stars >= 2) || (w50 !== undefined && w50.stars >= 2)
      || (w33 !== undefined && w49 !== undefined && w50 !== undefined && w49.timeMs! < w33.timeMs! && w50.timeMs! < w33.timeMs!);
    const coded = [17, 33, 49].map((id) => matchColour(of(t, id).find((r) => r.named && r.log)));
    const matches = coded.filter((m) => m === true).length;
    const unknown = coded.filter((m) => m === undefined).length;
    const h2Fails = matches >= 2 ? false : matches + unknown <= 1 ? true : undefined;
    const iii = coded[2] === undefined ? undefined : coded[2] === false && h2Fails === true ? true : h2Fails === undefined ? undefined : false;
    const iv = rows.some((r) => r.tester === t && r.iv);
    const finalesNeedRetry = [45, 46, 47, 48, 49, 50].some((id) => { const x = at(id); return x !== undefined && x >= 2; });
    const a32 = at(32), a41 = at(41);
    return {
      tester: t, i, ii, iii, iv, counts: i && (ii || iii === true || iv), h2Fails, finalesNeedRetry,
      lever32: a32 !== undefined && a32 > 3, lever41: a41 !== undefined && a41 > 2,
    };
  });
  const reopen = c3.filter((x) => x.counts).length;
  const h1Refuted = c3.filter((x) => x.finalesNeedRetry).length;
  const verdict = h1Refuted >= 2 ? 'DO NOT RE-OPEN' : decisive && reopen >= need ? 'RE-OPEN' : 'STAY CLOSED';
  const h2Fails = c3.filter((x) => x.h2Fails === true).length;
  const on = decisive && (verdict === 'RE-OPEN' || h2Fails >= need);
  const reason = !decisive
    ? `N = ${n} < ${DECISION_MIN_TESTERS}: H2 failing is a hypothesis, the flag stays off`
    : verdict === 'RE-OPEN' ? '(a) C.3 re-opens bands 5–6' : h2Fails >= need ? `(b) H2 fails for ${h2Fails} of ${n}` : `neither (a) nor (b) (H2 fails for ${h2Fails} of ${n}, need ${need})`;

  return {
    testers, n, tag, need, rows: rows.length, levels, bandMoves, h3,
    b5: { perTester, refuters, refuted: decisive && refuters >= 2, share: { twoStar: floored2, firstWins: floored.length, triggerFires: floored.length > 0 && floored2 / floored.length < GD12_TRIGGER_SHARE } },
    past16: { twoStar: past2, firstWins: past.length, rungCandidate: past.length > 0 && past2 / past.length >= RUNG_CANDIDATE_SHARE },
    c3: { perTester: c3, reopen, h1Refuted, verdict, lever32: c3.filter((x) => x.lever32).length, lever41: c3.filter((x) => x.lever41).length },
    c4: { h2Fails, on, reason },
  };
}

const s = (ms: number): string => `${+(ms / 1000).toFixed(1)}`;
const pct = (a: number, b: number): string => (b ? `${Math.round((100 * a) / b)} %` : '—');
const yn = (b: boolean | undefined): string => (b === undefined ? 'n/a' : b ? 'yes' : 'no');

/** `HUMAN` entries (`scripts/lib/reclockPins.ts`) for every `star3` the rules move (sampled and band moves); `source` = `sheet YYYY-MM-DD`. */
export function humanTable(d: Decision, source: string): Record<string, HumanPin> {
  const out: Record<string, HumanPin> = {};
  const tagNote = d.tag === 'DECISION' ? `N = ${d.n} DECISION` : `N = ${d.n} PROVISIONAL, only with the stakeholder's sign-off on this row`;
  for (const l of d.levels) {
    if (l.star3 === l.clock.star3) continue;
    out[String(l.id)] = { star3: l.star3, source, note: `zone ${l.zone}, H ${s(l.hMs!)} s / B ${s(l.botMs)} s, r ${l.r!.toFixed(2)}; star3 ${s(l.clock.star3)} → ${s(l.star3)} s; ${tagNote}` };
  }
  for (const m of d.bandMoves) {
    const [a, b] = BANDS[m.band]!;
    for (const mv of m.moves) {
      out[String(mv.id)] = { star3: mv.to, source, note: `band ${a}–${b} move, zone ${m.zone} on ${m.sampled.join(', ')}, median r ${m.rBand.toFixed(2)}, B ${s(mv.botMs)} s; star3 ${s(mv.from)} → ${s(mv.to)} s; ${tagNote}` };
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([x], [y]) => Number(x) - Number(y)));
}

/** The markdown the Producer pastes into the playtest review (§D step 3), ending with the `HUMAN` JSON block. */
export function renderMarkdown(d: Decision, opts: { sheetName: string; clocksFrom: string; source: string }): string {
  const L: string[] = [];
  const tag = d.tag === 'DECISION' ? 'DECISION' : `PROVISIONAL (N = ${d.n} < ${DECISION_MIN_TESTERS}: proposed, nothing moves without the stakeholder's sign-off on the row)`;
  L.push(`## Playtest decisions: ${opts.sheetName}`, '');
  L.push(`Testers N = ${d.n} (${d.testers.join(', ')}) · ${d.rows} tries · **${tag}** · clocks: ${opts.clocksFrom} · bot = reference median from the sheet's \`bot\` column. "≥ 2 of 3 testers" reads as ≥ ${d.need} testers.`, '');
  L.push('### C.1 AUD-B4 / A13: `star3`', '');
  L.push('| Lvl | Band | 3★ / 2★ | Bot | H (best valid, median) | r = H / B | Zone | New `star3` | Tag |', '|---|---|---|---|---|---|---|---|---|');
  for (const l of d.levels) {
    const next = l.zone === undefined ? 'no valid win' : l.pinned ? `= (pinned: ${PINNED[l.id]})` : l.star3 === l.clock.star3 ? '=' : `${s(l.clock.star3)} → **${s(l.star3)}**`;
    L.push(`| ${l.id} | ${l.band + 1} | ${s(l.clock.star3)} / ${s(l.clock.star2)} | ${s(l.botMs)} | ${l.hMs === undefined ? '—' : s(l.hMs)} | ${l.r === undefined ? '—' : l.r.toFixed(2)} | ${l.zone ?? '—'} | ${next} | ${d.tag} |`);
  }
  L.push('');
  if (d.bandMoves.length === 0) L.push('Band moves: none (no band has ≥ 2 non-pinned sampled levels in the same zone F or S).');
  for (const m of d.bandMoves) {
    const [a, b] = BANDS[m.band]!;
    L.push(`Band ${a}–${b}: ${m.sampled.length} sampled levels in zone ${m.zone} (${m.sampled.join(', ')}; median r ${m.rBand.toFixed(2)}) → unsampled: ${m.moves.map((x) => `${x.id} ${s(x.from)} → ${s(x.to)}`).join(', ') || 'no change'} · ${d.tag}`);
  }
  L.push(`H3: 3★ on ${d.h3.threeStar} / ${d.h3.validFirstWins} valid first wins (${pct(d.h3.threeStar, d.h3.validFirstWins)}) → ${d.h3.holds ? 'holds (≤ 10 %): no new 3★-gated reward' : 'does not hold (> 10 %)'}.`);
  L.push('Then: the boundary step runs as usual in `reclock.ts` (not computed here).', '');

  L.push('### C.2 AUD-B5: the 2★ floor past 16, human half', '');
  L.push('| Tester | Floored sample played | First try won at ≥ 2★ | ≥ 4 of 5 |', '|---|---|---|---|');
  for (const p of d.b5.perTester) L.push(`| ${p.tester} | ${p.played.join(', ') || '—'} | ${p.firstTry2.join(', ') || '—'} (${p.firstTry2.length}) | ${p.refutes ? 'yes' : 'no'} |`);
  L.push('');
  L.push(`First-win 2★ share on the GD-12 floored levels: ${d.b5.share.twoStar} / ${d.b5.share.firstWins} (${pct(d.b5.share.twoStar, d.b5.share.firstWins)})${d.b5.share.triggerFires ? ' — under 30 %: the GD-12 trigger fires, it confirms the floor' : ''}.`);
  L.push(`Human half: **${d.b5.refuted ? 'REFUTED → hold the floor for the GD-12 telemetry trigger' : `not refuted (${d.b5.refuters} tester(s) at ≥ 4 of 5${d.tag === 'DECISION' ? ', need 2' : `; at N = ${d.n} the human half cannot refute`}) → adopt once the ECONOMY §6 re-run passes (±10 % day-15 / day-30 gold)`}** · ${d.tag}`, '');

  L.push('### C.3 Bands 5–6 re-open', '');
  L.push('| Tester | (i) | (ii) | (iii) | (iv) | Counts | 45–50 needed ≥ 2 tries | 32 not won in 3 | 41 not won in 2 |', '|---|---|---|---|---|---|---|---|---|');
  for (const x of d.c3.perTester) L.push(`| ${x.tester} | ${yn(x.i)} | ${yn(x.ii)} | ${yn(x.iii)} | ${yn(x.iv)} | ${x.counts ? 'yes' : '—'} | ${yn(x.finalesNeedRetry)} | ${yn(x.lever32)} | ${yn(x.lever41)} |`);
  L.push('');
  L.push(`Bands 5–6: **${d.c3.verdict}**${d.c3.verdict === 'DO NOT RE-OPEN' ? ` (H1 refuted: ${d.c3.h1Refuted} testers needed ≥ 2 tries on 45–50)` : ''} — ${d.c3.reopen} / ${d.n} testers meet (i) + one of (ii)–(iv), need ${d.need} and N ≥ ${DECISION_MIN_TESTERS} · ${d.tag}`);
  if (d.c3.lever32 >= 2 || d.c3.lever41 >= 2) L.push(`LV-1.0.1a levers: ${d.c3.lever32} tester(s) did not win 32 within 3, ${d.c3.lever41} did not win 41 within 2 → the Level Designer files a finding (nothing is reverted).`);
  L.push('');
  L.push('### C.4 AUD-A3 engagement flag', '');
  L.push(`**${d.c4.on ? 'SWITCH ON' : 'stays off'}** — ${d.c4.reason}; H2 fails for ${d.c4.h2Fails} / ${d.n}. Off as well if the AI memo's own acceptance fails · ${d.tag}`, '');

  L.push('### C.5 Side outputs', '');
  L.push(`First-win 2★ share past 16: ${d.past16.twoStar} / ${d.past16.firstWins} (${pct(d.past16.twoStar, d.past16.firstWins)})${d.past16.rungCandidate ? ' — ≥ 60 %: the 15-gold 2★ rung is the 1.1 candidate' : ''}.`, '');
  L.push(`| Lvl | ${d.testers.map((t) => `Tries to first clear: ${t}`).join(' | ')} |`, `|---|${d.testers.map(() => '---').join('|')}|`);
  for (const l of d.levels) L.push(`| ${l.id} | ${d.testers.map((t) => { const v = l.firstClear[t]; return v === undefined ? '—' : v === Infinity ? 'not won' : String(v); }).join(' | ')} |`);
  L.push('');

  L.push('### `reclock.ts` HUMAN table (`scripts/lib/reclockPins.ts`; ms, as in the level JSON)', '');
  L.push(d.tag === 'DECISION' ? 'Paste after the Level Designer writes the JSON.' : 'PROVISIONAL: paste only the rows the stakeholder signed off.', '');
  L.push('```json', JSON.stringify(humanTable(d, opts.source), null, 2), '```');
  return L.join('\n');
}
