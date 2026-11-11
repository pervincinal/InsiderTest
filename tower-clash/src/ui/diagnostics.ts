/**
 * AUD-B6: the opt-in diagnostics log (Settings → About → Diagnostics, off by default). No network,
 * ever: a ring of the newest `DIAG_CAP` `level_end` rows kept on the device under its own
 * localStorage key (`DIAG_KEY`, never inside the save and mirrored nowhere), which the tester copies
 * out by hand (COPY LOG: one `#` hints line, the CSV column line, one CSV row per event) and empties
 * with CLEAR LOG; RESET PROGRESS wipes it with its attempt counters.
 *
 * A row is written when the result is booked (src/ui/play.ts `present`, through the result chunk
 * that re-exports `logLevelEnd`; the level skip from src/ui/result.ts) and only while
 * `settings.diagnostics === true`. Yesterday's map (a practice run that books nothing) writes none.
 * Lazy: reached from the result, settings and debug chunks only (tests/ui/diagnostics.test.ts pins it).
 *
 * DIAG-2 (2026-11-10): a match's row also carries its SIM-R1 replay record (`replay`, src/sim/replay.ts;
 * built here, in the lazy chunk, only while the switch is on), bounded: a record over `DIAG_REPLAY_MAX`
 * is kept as `{ dropped: 'size', bytes }`, only the newest `DIAG_REPLAY_KEEP` rows that carry one keep
 * it (older rows lose the field, the row stays). COPY LOG appends one `#replay <row> <json>` line per
 * kept record, newest first while the text stays ≤ `DIAG_SHARE_MAX` (`diagShare`; the settings toast
 * says when older ones were left out). tests/ui/diagnosticsReplay.test.ts.
 */
import type { Replay, ReplayEntry } from '../sim/replay';
import { challengeDescriptor, replayOf, serializeReplay } from '../sim/replay';
import type { GameState, LevelDef } from '../sim/types';
import type { SaveData, SaveStorage } from './save';
import { saveStorage } from './save';
import type { ResultInfo } from './result';
import { appVersion } from './screens';

export const DIAG_KEY = 'towerclash.diag.v1';
/** Rows kept: the newest win, the oldest go. */
export const DIAG_CAP = 400;

/** DIAG-2: a serialized replay record longer than this (chars = bytes: the JSON is ASCII) is not kept. */
export const DIAG_REPLAY_MAX = 32 * 1024;
/** DIAG-2: rows that keep their `replay` field, newest first; older rows drop it. */
export const DIAG_REPLAY_KEEP = 5;
/** DIAG-2: COPY LOG's text stays at or under this many chars; the oldest replay lines go first. */
export const DIAG_SHARE_MAX = 100 * 1024;

/** DIAG-2: the row's replay record, or why it was not kept. */
export type DiagReplay = Replay | { dropped: 'size'; bytes: number };

export type DiagMode = 'campaign' | 'daily' | 'weekly';
export type DiagOutcome = 'won' | 'lost' | 'retreat' | 'skip';

/** One `level_end` event (schema v 1). */
export interface DiagRow {
  v: 1;
  /** UTC wall clock to the minute, no seconds: `2026-11-01T10:23Z`. */
  t: string;
  /** `appVersion()`: `1.0.0 (build 26)`. */
  build: string;
  /** Campaign level id (a challenge: the campaign level it is played on). */
  lvl: number;
  mode: DiagMode;
  /**
   * The nth finished try of this level (a challenge: of this day / week) since diagnostics went on in
   * this save. A result after a continue, and a skip, belong to the try they follow (not counted again).
   * The counters survive CLEAR LOG; RESET PROGRESS restarts them.
   */
  attempt: number;
  outcome: DiagOutcome;
  /** Star clock of the result (sim time + rewound ms); 0 for a skip. */
  timeMs: number;
  stars: number;
  /** First clear: campaign — the level had no star before; a challenge — the first win of its day / week. */
  first: boolean;
  /** The result came after this try's continue (Reinforcements). */
  continued: boolean;
  /** Boosters this try fired (charges or gold; the continue's free Freeze is not one). */
  boosters: number;
  /** `settings.textScale` (1, 1.25, 1.5). */
  textScale: number;
  /** DIAG-2: the match's replay record (a played result only, not a skip; newest `DIAG_REPLAY_KEEP` rows). */
  replay?: DiagReplay;
}

/** The stored value: attempt counters per key and the rows, oldest first. */
interface DiagStore {
  v: 1;
  n: Record<string, number>;
  rows: DiagRow[];
}

/** CSV column order (COPY LOG's second line). */
export const DIAG_COLUMNS = ['v', 't', 'build', 'lvl', 'mode', 'attempt', 'outcome', 'timeMs', 'stars', 'first', 'continued', 'boosters', 'textScale'] as const;

const MODES: readonly string[] = ['campaign', 'daily', 'weekly'];
const OUTCOMES: readonly string[] = ['won', 'lost', 'retreat', 'skip'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonNegInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function isRow(r: unknown): r is DiagRow {
  if (!isRecord(r)) return false;
  return (
    r.v === 1 &&
    typeof r.t === 'string' &&
    typeof r.build === 'string' &&
    nonNegInt(r.lvl) &&
    MODES.includes(r.mode as string) &&
    nonNegInt(r.attempt) &&
    OUTCOMES.includes(r.outcome as string) &&
    nonNegInt(r.timeMs) &&
    nonNegInt(r.stars) &&
    typeof r.first === 'boolean' &&
    typeof r.continued === 'boolean' &&
    nonNegInt(r.boosters) &&
    typeof r.textScale === 'number'
  );
}

/** DIAG-2: a stored `replay` field worth keeping (a v1 record's shape, or the size marker). */
function isDiagReplay(r: unknown): r is DiagReplay {
  if (!isRecord(r)) return false;
  if (r.dropped === 'size') return nonNegInt(r.bytes);
  return r.v === 1 && Number.isInteger(r.levelId) && typeof r.seed === 'number' && isRecord(r.modifiers) && typeof r.rules === 'string' && Array.isArray(r.commands);
}

/** DIAG-2: only the newest `DIAG_REPLAY_KEEP` rows that carry a `replay` keep it (the rows themselves stay). */
function trimReplays(rows: DiagRow[]): void {
  let kept = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]!;
    if (r.replay === undefined) continue;
    if (kept < DIAG_REPLAY_KEEP && isDiagReplay(r.replay)) kept++;
    else delete r.replay;
  }
}

function emptyStore(): DiagStore {
  return { v: 1, n: {}, rows: [] };
}

/** The stored log, read defensively (an unreadable value is an empty log; a bad row is dropped). */
function readStore(store: SaveStorage | null): DiagStore {
  if (!store) return emptyStore();
  try {
    const raw: unknown = JSON.parse(store.getItem(DIAG_KEY) ?? 'null');
    if (!isRecord(raw) || raw.v !== 1) return emptyStore();
    const n: Record<string, number> = {};
    if (isRecord(raw.n)) for (const [k, c] of Object.entries(raw.n)) if (nonNegInt(c)) n[k] = c;
    const rows = Array.isArray(raw.rows) ? raw.rows.filter(isRow).slice(-DIAG_CAP) : [];
    trimReplays(rows);
    return { v: 1, n, rows };
  } catch {
    return emptyStore();
  }
}

/** Write the log; false when storage refused it (quota, private mode) — the game plays on. */
function writeStore(store: SaveStorage | null, d: DiagStore): boolean {
  if (!store) return false;
  try {
    store.setItem(DIAG_KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

/** The rows, oldest first (a copy). */
export function diagRows(): DiagRow[] {
  return readStore(saveStorage()).rows;
}

export function diagCount(): number {
  return diagRows().length;
}

/** CLEAR LOG: no rows; the attempt counters stay (the next try of a level keeps its number). */
export function clearDiag(): void {
  const store = saveStorage();
  const d = readStore(store);
  if (d.rows.length === 0 && store?.getItem(DIAG_KEY) === null) return;
  writeStore(store, { v: 1, n: d.n, rows: [] });
}

/** RESET PROGRESS (TF-28): the log and its counters are gone with the progress. */
export function resetDiag(): void {
  try {
    saveStorage()?.removeItem(DIAG_KEY);
  } catch {
    /* storage blocked: nothing was kept either */
  }
}

/** What the game knows about one level end; `key` scopes the attempt counter (level / day / week). */
export interface DiagEvent {
  lvl: number;
  mode: DiagMode;
  key: string;
  outcome: DiagOutcome;
  timeMs: number;
  stars: number;
  first: boolean;
  continued: boolean;
  boosters: number;
  /** DIAG-2: the match's replay record (absent: a skip, or a caller without a match). */
  replay?: DiagReplay;
}

/** `2026-11-01T10:23Z`: the wall clock to the minute (no seconds). */
export function isoMinute(nowMs: number): string {
  return `${new Date(nowMs).toISOString().slice(0, 16)}Z`;
}

/**
 * Append one row when `settings.diagnostics` is on (else nothing, null). Returns the row written —
 * also when storage refused it (it is then simply not kept).
 */
export function recordDiag(save: SaveData, ev: DiagEvent, nowMs = Date.now(), build = appVersion()): DiagRow | null {
  if (save.settings.diagnostics !== true) return null;
  const store = saveStorage();
  const d = readStore(store);
  // a result after this try's continue and a skip belong to the try they follow
  const sameTry = ev.continued || ev.outcome === 'skip';
  const attempt = sameTry ? Math.max(1, d.n[ev.key] ?? 0) : (d.n[ev.key] ?? 0) + 1;
  d.n[ev.key] = attempt;
  const row: DiagRow = {
    v: 1,
    t: isoMinute(nowMs),
    build,
    lvl: ev.lvl,
    mode: ev.mode,
    attempt,
    outcome: ev.outcome,
    timeMs: Math.max(0, Math.round(ev.timeMs)),
    stars: ev.stars,
    first: ev.first,
    continued: ev.continued,
    boosters: ev.boosters,
    textScale: save.settings.textScale ?? 1,
  };
  if (ev.replay) row.replay = ev.replay;
  d.rows.push(row);
  if (d.rows.length > DIAG_CAP) d.rows.splice(0, d.rows.length - DIAG_CAP);
  trimReplays(d.rows);
  // DIAG-2: storage refused the log with its records (quota) — keep the rows without them
  if (!writeStore(store, d) && d.rows.some((r) => r.replay)) {
    for (const r of d.rows) delete r.replay;
    writeStore(store, d);
  }
  return row;
}

/** DIAG-2: what the row needs of the play screen to close its replay record (`PlayScreen` has it all). */
export interface DiagMatch {
  readonly match: { timeMs: number };
  readonly boosters: number;
  readonly level?: LevelDef;
  readonly state?: GameState;
  readonly replayLog?: readonly ReplayEntry[];
  readonly hasContinued?: boolean;
  /** SIM-R2: the Daily / Weekly the match is (`PlayScreen.challenge` / `.weekly`), for the record's descriptor. */
  readonly challenge?: { dayKey: string; twist: { id: string } } | null;
  readonly weekly?: { weekKey: string; twist: { id: string } } | null;
}

/**
 * DIAG-2: the match's record (`replayOf`, closed on the final state), or the size marker when its JSON is
 * over `DIAG_REPLAY_MAX`; undefined without a match.
 */
export function diagReplayOf(play: DiagMatch, max = DIAG_REPLAY_MAX): DiagReplay | undefined {
  if (!play.level || !play.state || !play.replayLog) return undefined;
  const replay = replayOf(play.level, play.state, play.replayLog, play.hasContinued === true, challengeDescriptor(play.challenge, play.weekly));
  const bytes = serializeReplay(replay).length;
  return bytes <= max ? replay : { dropped: 'size', bytes };
}

/**
 * The play screen's result (src/ui/play.ts `present`, after the save write): campaign, daily or
 * weekly; a Retreat is `retreat`. Yesterday's map writes nothing (it books nothing either).
 * DIAG-2: the row carries the match's replay record (`diagReplayOf`) — built only past the switch check.
 */
export function logLevelEnd(save: SaveData, info: ResultInfo, play: DiagMatch, nowMs = Date.now()): DiagRow | null {
  if (save.settings.diagnostics !== true || info.daily?.practice) return null;
  const won = info.ui.outcome === 'won';
  const mode: DiagMode = info.challenge ? 'daily' : info.weekly ? 'weekly' : 'campaign';
  const key = info.challenge ? `d:${info.challenge.dayKey}` : info.weekly ? `w:${info.weekly.weekKey}` : String(info.level.id);
  const first = won && (info.daily ? info.daily.firstWin : info.weeklyOutcome ? info.weeklyOutcome.firstWin : info.first === true);
  return recordDiag(
    save,
    {
      lvl: info.level.id,
      mode,
      key,
      outcome: info.retreated ? 'retreat' : won ? 'won' : 'lost',
      timeMs: play.match.timeMs,
      stars: won ? info.earnings.stars : 0,
      first,
      continued: info.continued,
      boosters: play.boosters,
      replay: diagReplayOf(play),
    },
    nowMs,
  );
}

/** The level skip bought on a defeat's result (src/ui/result.ts): 1★, booked to the try it ends. */
export function logSkip(save: SaveData, info: ResultInfo, stars: number, first: boolean, nowMs = Date.now()): DiagRow | null {
  return recordDiag(save, { lvl: info.level.id, mode: 'campaign', key: String(info.level.id), outcome: 'skip', timeMs: 0, stars, first, continued: info.continued, boosters: 0 }, nowMs);
}

/* ---------- COPY LOG text ---------- */

/** Device hints the game already knows (no fingerprinting beyond what the tester can read on screen). */
export interface DiagHints {
  build: string;
  ua: string;
  viewport: string;
  dpr: number;
  textScale: number;
  language: string;
}

/** The hints of this page: user agent, CSS viewport, device pixel ratio, text size, UI language. */
export function currentHints(save: SaveData, language: string): DiagHints {
  const w = typeof window !== 'undefined' ? window : undefined;
  return {
    build: appVersion(),
    ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    viewport: w ? `${w.innerWidth}x${w.innerHeight}` : '',
    dpr: w?.devicePixelRatio ?? 1,
    textScale: save.settings.textScale ?? 1,
    language,
  };
}

/** One CSV field (RFC 4180: quoted when it holds a comma, a quote or a line break). */
function csvField(v: string | number | boolean): string {
  const s = typeof v === 'boolean' ? (v ? '1' : '0') : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const oneLine = (s: string): string => s.replace(/[\r\n|]+/g, ' ').trim();

/** DIAG-2: COPY LOG's text and how many replay records it carries / had to leave out for size. */
export interface DiagShare {
  text: string;
  replays: number;
  omitted: number;
}

/** DIAG-2: one replay line of COPY LOG: `#replay <row> <json>` (`row` = the CSV row's 1-based number). */
const REPLAY_LINE = /^#replay (\d+) (\{.*\})$/;

/**
 * COPY LOG: `# …` hints, the column line, one CSV row per event (oldest first), then (DIAG-2) one
 * `#replay <row> <json>` line per kept record, in row order — the newest records that fit in `max` chars;
 * a `# replays omitted <n> (size)` line when older ones did not. CSV readers skip `#` lines.
 */
export function diagShare(rows: readonly DiagRow[], h: DiagHints, max = DIAG_SHARE_MAX): DiagShare {
  const head = `# Tower Clash diagnostics v1 | build ${oneLine(h.build)} | ua ${oneLine(h.ua)} | viewport ${h.viewport} | dpr ${h.dpr} | text ${Math.round(h.textScale * 100)}% | lang ${h.language} | events ${rows.length}`;
  const lines = [head, DIAG_COLUMNS.join(',')];
  for (const r of rows) lines.push(DIAG_COLUMNS.map((c) => csvField(r[c])).join(','));
  const omitNote = 40; // room for the "# replays omitted n (size)" line
  let size = lines.join('\n').length;
  const picked: string[] = [];
  let omitted = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const rep = rows[i]!.replay;
    if (rep === undefined) continue;
    const line = `#replay ${i + 1} ${JSON.stringify(rep)}`;
    if (omitted === 0 && size + 1 + line.length + omitNote <= max) {
      picked.unshift(line);
      size += 1 + line.length;
    } else omitted++;
  }
  lines.push(...picked);
  if (omitted > 0) lines.push(`# replays omitted ${omitted} (size)`);
  return { text: lines.join('\n'), replays: picked.length, omitted };
}

/** COPY LOG's text (`diagShare(…).text`). */
export function diagText(rows: readonly DiagRow[], h: DiagHints): string {
  return diagShare(rows, h).text;
}

/** DIAG-2: the replay lines of a COPY LOG text (row number and record / size marker), in text order. */
export function parseDiagReplays(text: string): { row: number; replay: DiagReplay }[] {
  const out: { row: number; replay: DiagReplay }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = REPLAY_LINE.exec(line);
    if (!m) continue;
    try {
      const replay: unknown = JSON.parse(m[2]!);
      if (isDiagReplay(replay)) out.push({ row: Number(m[1]), replay });
    } catch {
      /* a line cut by the paste: skipped */
    }
  }
  return out;
}

/** Split one CSV line (RFC 4180 quoting). */
function csvSplit(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** COPY LOG text back to rows (tests, and whoever reads a tester's paste); lines that are not rows are skipped. */
export function parseDiagText(text: string): DiagRow[] {
  const rows: DiagRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line === '' || line.startsWith('#') || line === DIAG_COLUMNS.join(',')) continue;
    const f = csvSplit(line);
    if (f.length !== DIAG_COLUMNS.length) continue;
    const get = (c: (typeof DIAG_COLUMNS)[number]): string => f[DIAG_COLUMNS.indexOf(c)]!;
    const row = {
      v: Number(get('v')),
      t: get('t'),
      build: get('build'),
      lvl: Number(get('lvl')),
      mode: get('mode'),
      attempt: Number(get('attempt')),
      outcome: get('outcome'),
      timeMs: Number(get('timeMs')),
      stars: Number(get('stars')),
      first: get('first') === '1',
      continued: get('continued') === '1',
      boosters: Number(get('boosters')),
      textScale: Number(get('textScale')),
    };
    if (isRow(row)) rows.push(row);
  }
  return rows;
}
