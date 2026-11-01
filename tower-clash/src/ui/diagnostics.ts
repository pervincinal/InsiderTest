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
 */
import type { SaveData, SaveStorage } from './save';
import { saveStorage } from './save';
import type { ResultInfo } from './result';
import { appVersion } from './screens';

export const DIAG_KEY = 'towerclash.diag.v1';
/** Rows kept: the newest win, the oldest go. */
export const DIAG_CAP = 400;

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
    const rows = Array.isArray(raw.rows) ? raw.rows.filter(isRow) : [];
    return { v: 1, n, rows: rows.slice(-DIAG_CAP) };
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
  d.rows.push(row);
  if (d.rows.length > DIAG_CAP) d.rows.splice(0, d.rows.length - DIAG_CAP);
  writeStore(store, d);
  return row;
}

/**
 * The play screen's result (src/ui/play.ts `present`, after the save write): campaign, daily or
 * weekly; a Retreat is `retreat`. Yesterday's map writes nothing (it books nothing either).
 */
export function logLevelEnd(save: SaveData, info: ResultInfo, play: { readonly match: { timeMs: number }; readonly boosters: number }, nowMs = Date.now()): DiagRow | null {
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

/** COPY LOG: `# …` hints, the column line, then one CSV row per event (oldest first). */
export function diagText(rows: readonly DiagRow[], h: DiagHints): string {
  const head = `# Tower Clash diagnostics v1 | build ${oneLine(h.build)} | ua ${oneLine(h.ua)} | viewport ${h.viewport} | dpr ${h.dpr} | text ${Math.round(h.textScale * 100)}% | lang ${h.language} | events ${rows.length}`;
  const lines = [head, DIAG_COLUMNS.join(',')];
  for (const r of rows) lines.push(DIAG_COLUMNS.map((c) => csvField(r[c])).join(','));
  return lines.join('\n');
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
