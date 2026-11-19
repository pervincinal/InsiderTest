/**
 * `scripts/playtestLog.ts`'s rules, pure and importable from tests (QA-39): a tester's Diagnostics COPY LOG text
 * (src/ui/diagnostics.ts `diagShare`: `#` hint line, the `DIAG_COLUMNS` line, one CSV row per level end, `#replay N
 * {…}` lines) → the human playtest sheet CSV that `scripts/playtestDecide.ts` reads (one row per try,
 * `REQUIRED_COLUMNS` + `time_ms`; docs/reviews/2026-11-05-human-playtest-sheet.md §D 2a).
 *
 * Mapping, per included log row (campaign only, in log order):
 * - `tester` = `--tester`; `level` = `lvl`; `attempt` = 1, 2, … per level in log order (the log's own counter
 *   starts when Diagnostics went on, so a level tried before the session would start past 1).
 * - `result` W / L / R from `outcome` won / lost / retreat; `time` = `timeMs` as mm:ss.fff and `time_ms` = `timeMs`
 *   (decide uses `time_ms`); `stars` = `stars`; `boosters` = `boosters`; `help` = `continued`.
 * - A row with `continued` = 1 is the result after that try's REINFORCEMENTS: it replaces the try's earlier row of
 *   the same log attempt (`help` 1, boosters the larger of the two) instead of becoming a new attempt.
 * - `first_ever` per level (QA-39-4): from the log's `had` (the level had a clear before that attempt, on every row)
 *   of the level's first row in the sheet (its attempt 1): `had` 0 → 1, `had` 1 → 0 — also for a level never won.
 *   Fallback for a log from before the column (build 27 without `had`, or before `speed`): 1 when a win of the level
 *   has `first` = 1 (no star before), 0 when it was won only with `first` = 0, empty with a warning when it was
 *   never won (a loss row's `first` is always 0: unknown).
 * - `speed` (QA-39-1) from the log's `speed` (the match's highest game speed): 1 → 1; anything else (the pause
 *   card's ×2, a debug ×20, a slowed ×0.5) → 2, i.e. "not ×1" (decide only knows 1 / 2), with a warning for a
 *   value other than 1 / 2; a continued result keeps the larger of its try's two. Empty with a warning in a log
 *   from before the column (decide reads empty as ×1).
 * - `bot` = the caller's bot median (s, one decimal like §B.1 and the `npm run playtest` table).
 * - `named`, `log`, `iv`, `note` are left empty for the Producer (the chat lines, the recordings).
 * Excluded with a note: daily / weekly rows (the sheet's sample is campaign only), `skip` rows (SKIP LEVEL is
 * against §A rule 7; the try stays as its lost row), rows before `since`.
 */
import { spawnSync } from 'node:child_process';
import { DIAG_COLUMNS, DIAG_COLUMNS_V1_0, DIAG_COLUMNS_V1_1 } from '../../src/ui/diagnostics';
import { REQUIRED_COLUMNS, SheetError, parseSheet } from './playtestDecideRule';

/** §A step 1: times from builds below this are not comparable with the bot's (the lesson card ran the clock). */
export const MIN_BUILD = 27;

export class LogError extends Error {
  override name = 'LogError';
}

export type LogMode = 'campaign' | 'daily' | 'weekly';
export type LogOutcome = 'won' | 'lost' | 'retreat' | 'skip';

/** One CSV row of the COPY LOG text, checked. */
export interface LogRow {
  t: string;
  build: string;
  lvl: number;
  mode: LogMode;
  attempt: number;
  outcome: LogOutcome;
  timeMs: number;
  stars: number;
  first: boolean;
  continued: boolean;
  boosters: number;
  textScale: number;
  /** QA-39-1: the match's highest game speed; null on a skip row and in a log from before the column. */
  speed: number | null;
  /** QA-39-4: the level / day / week had a clear before this attempt; null in a log from before the column. */
  had: boolean | null;
  /** 1-based line in the log text. */
  line: number;
  /** REV-2: 1-based number of the pasted COPY LOG text this row is in (the T-th column line starts text T). */
  text: number;
  /** 1-based CSV row number within its text (the `N` of that text's `#replay N`; restarts in each pasted text). */
  row: number;
}

/** REV-2: one `#replay N {…}` line, addressed by its pasted text and row (N restarts at 1 in each text). */
export interface LogReplay {
  text: number;
  row: number;
  /** 1-based line in the log file. */
  line: number;
  /** The record JSON (or the `{"dropped":…}` size marker). */
  json: string;
  /** The size marker: the game did not keep the record. */
  dropped: boolean;
}

export interface ParsedLog {
  rows: LogRow[];
  /** Row numbers that carry a `#replay` line (a size marker excluded); see `replays` for the text of each. */
  replayRows: number[];
  /** REV-2: the `#replay` lines that carry a record (size markers excluded), in file order. */
  replays: LogReplay[];
  /** REV-2: how many COPY LOG texts were pasted into the file (column lines). */
  texts: number;
}

/** QA-39-1 / QA-39-4: every column line the game has written (logs from before `speed` / `had` are read too). */
const HEADERS = new Map<string, readonly string[]>([DIAG_COLUMNS, DIAG_COLUMNS_V1_1, DIAG_COLUMNS_V1_0].map((h) => [h.join(','), h]));
const REPLAY_LINE = /^#replay (\d+) (\{.*)$/;
/** The first line of every COPY LOG text (src/ui/diagnostics.ts `diagShare`). */
const HINT_START = '# Tower Clash diagnostics v1';
/**
 * REV-2: COPY LOG's text ends without a line break, so two texts pasted back to back glue the second's hint line
 * onto the first's last line (a `#replay` record or a CSV row) — say so, naming the line, instead of a JSON error.
 */
function gluedError(l: string, n: number): LogError | undefined {
  return l.indexOf(HINT_START) > 0 ? new LogError(`line ${n}: two COPY LOG texts pasted without a line break between them (the next text's "${HINT_START}" line starts mid-line) — put a line break before it`) : undefined;
}

/**
 * REV-2: the `#replay` lines of a log file, each with its pasted text (a `#replay` line before any column line
 * counts as text 1) — the one rule `parseLog` and `scripts/replay.ts --from-log` share.
 */
export function logReplays(text: string): { texts: number; replays: LogReplay[] } {
  let texts = 0;
  const replays: LogReplay[] = [];
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((raw, i) => {
    const l = raw.trim();
    if (HEADERS.has(l)) texts++;
    const m = REPLAY_LINE.exec(l);
    if (m) replays.push({ text: Math.max(1, texts), row: Number(m[1]), line: i + 1, json: m[2]!, dropped: m[2]!.includes('"dropped"') });
  });
  return { texts, replays };
}

/**
 * REV-2: the record JSON `scripts/replay.ts --from-log` verifies — text `text`'s row `row` (each optional: the
 * last match in file order). A file with several pasted texts needs `text` (row numbers restart in each text, so
 * "the last `#replay N`" would silently pick the wrong tester session). Throws `LogError`.
 */
export function pickReplay(log: string, o: { text?: number; row?: number } = {}): string {
  const { texts, replays } = logReplays(log);
  if (o.text !== undefined && (o.text < 1 || o.text > Math.max(1, texts))) throw new LogError(`--text ${o.text}: the log holds ${texts} pasted text(s)`);
  if (o.text === undefined && texts > 1) throw new LogError(`the log holds ${texts} pasted COPY LOG texts and #replay numbers restart in each: pass --text 1..${texts}`);
  const hit = replays.filter((r) => (o.text === undefined || r.text === o.text) && (o.row === undefined || r.row === o.row));
  const where = `${o.text !== undefined && texts > 1 ? ` in text ${o.text}` : ''}`;
  if (hit.length === 0) throw new LogError(`no #replay line${o.row !== undefined ? ` for row ${o.row}` : ''}${where} in the log`);
  const r = hit.at(-1)!;
  const glued = gluedError(r.json, r.line);
  if (glued) throw glued;
  if (r.dropped) throw new LogError(`the record was not kept (${r.json})`);
  return r.json;
}

const MODES: readonly string[] = ['campaign', 'daily', 'weekly'];
const OUTCOMES: readonly string[] = ['won', 'lost', 'retreat', 'skip'];

/** RFC 4180 split (the log quotes a field with a comma, e.g. never today, but a build string could). */
function splitCsv(line: string, lineNo: number): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  if (quoted) throw new LogError(`line ${lineNo}: unterminated quoted field`);
  out.push(cur);
  return out;
}

const int = (s: string): number => (/^\d+$/.test(s) ? Number(s) : NaN);

/** Parse a COPY LOG text strictly: every non-`#`, non-blank line after the column line must be a valid row. */
export function parseLog(text: string, isLevel: (id: number) => boolean = (id) => id >= 1 && id <= 50): ParsedLog {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = DIAG_COLUMNS.join(',');
  /** QA-39-1 / QA-39-4: logs from before the `speed` / `had` columns are read too (their rows have none). */
  const headers = HEADERS;
  let cols: readonly string[] = DIAG_COLUMNS;
  let seenHeader = false;
  const rows: LogRow[] = [];
  /** REV-2: the pasted text being read (the T-th column line starts text T) and its row count. */
  let textNo = 0;
  let textRows = 0;
  lines.forEach((raw, i) => {
    const n = i + 1;
    const l = raw.trim();
    if (l === '') return;
    const glued = gluedError(l, n);
    if (glued) throw glued;
    if (l.startsWith('#')) return; // hints, size notes; #replay lines: logReplays below
    const h = headers.get(l);
    if (h) {
      cols = h; // also two logs pasted into one file: each column line starts a text, its rows count from 1
      seenHeader = true;
      textNo++;
      textRows = 0;
      return;
    }
    if (!seenHeader) throw new LogError(`line ${n}: expected the Diagnostics column line "${header}" (is this a COPY LOG text?), got "${l.slice(0, 60)}"`);
    const f = splitCsv(l, n);
    if (f.length !== cols.length) throw new LogError(`line ${n}: ${f.length} field(s), the column line has ${cols.length} (a line cut by the paste?)`);
    const c = (k: (typeof DIAG_COLUMNS)[number]): string => {
      const i = cols.indexOf(k);
      return i < 0 ? '' : f[i]!;
    };
    const bad = (k: string, want: string): never => {
      throw new LogError(`line ${n}: ${k} "${c(k as (typeof DIAG_COLUMNS)[number])}" ${want}`);
    };
    if (c('v') !== '1') bad('v', 'must be 1 (Diagnostics schema v1)');
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\dZ$/.test(c('t'))) bad('t', 'must be YYYY-MM-DDTHH:MMZ');
    if (c('build') === '') bad('build', 'is empty');
    const lvl = int(c('lvl'));
    if (!Number.isInteger(lvl) || !isLevel(lvl)) bad('lvl', 'is not a level id');
    if (!MODES.includes(c('mode'))) bad('mode', `must be ${MODES.join(' / ')}`);
    const attempt = int(c('attempt'));
    if (!(attempt >= 1)) bad('attempt', 'must be 1, 2, …');
    if (!OUTCOMES.includes(c('outcome'))) bad('outcome', `must be ${OUTCOMES.join(' / ')}`);
    const timeMs = int(c('timeMs'));
    if (!Number.isInteger(timeMs)) bad('timeMs', 'must be a whole number of ms');
    const stars = int(c('stars'));
    if (!(stars >= 0 && stars <= 3)) bad('stars', 'must be 0–3');
    for (const k of ['first', 'continued'] as const) if (c(k) !== '0' && c(k) !== '1') bad(k, 'must be 0 or 1');
    const boosters = int(c('boosters'));
    if (!Number.isInteger(boosters)) bad('boosters', 'must be a count');
    const textScale = Number(c('textScale'));
    if (c('textScale') === '' || !Number.isFinite(textScale)) bad('textScale', 'must be a number');
    const sp = c('speed');
    const speed = sp === '' ? null : Number(sp);
    if (speed !== null && !(speed > 0)) bad('speed', 'must be a number > 0 (the game speed)');
    const hd = c('had');
    if (hd !== '' && hd !== '0' && hd !== '1') bad('had', 'must be 0 or 1');
    const outcome = c('outcome') as LogOutcome;
    if (outcome === 'won' && stars < 1) bad('stars', 'must be 1–3 on a win');
    // REV-2 (c): the mirror rule, so the error names the log line (not the converted CSV's). A skip row keeps the
    // star the skip bought (src/ui/diagnostics.ts logSkip: the level's stars after buyLevelSkip, ≥ 1), so not it.
    if ((outcome === 'lost' || outcome === 'retreat') && stars !== 0) bad('stars', 'must be 0 on a loss / retreat');
    textRows++;
    rows.push({
      t: c('t'), build: c('build'), lvl, mode: c('mode') as LogMode, attempt, outcome, timeMs, stars,
      first: c('first') === '1', continued: c('continued') === '1', boosters, textScale, speed,
      had: hd === '' ? null : hd === '1', line: n, text: textNo, row: textRows,
    });
  });
  if (!seenHeader) throw new LogError('no Diagnostics column line: is this a COPY LOG text?');
  if (rows.length === 0) throw new LogError('the log has no rows (was Diagnostics on during the session?)');
  const { replays: all } = logReplays(text);
  const replays = all.filter((r) => !r.dropped);
  return { rows, replayRows: replays.map((r) => r.row), replays, texts: textNo };
}

/** The `(build N)` number of a log `build` string (`1.0.0 (build 26)`), or undefined. */
export function buildNumber(build: string): number | undefined {
  const m = /\(build (\d+)\)/.exec(build);
  return m ? Number(m[1]) : undefined;
}

/** ms → `mm:ss.fff` (decide's `time`; the card shows the mm:ss part rounded down). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const m = Math.floor(total / 60_000);
  const s = (total % 60_000) / 1000;
  return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
}

/** One sheet row before it is written. */
export interface SheetRow {
  tester: string;
  level: number;
  bot: string;
  attempt: number;
  result: 'W' | 'L' | 'R';
  timeMs: number;
  stars: number;
  firstEver: '' | '0' | '1';
  boosters: number;
  help: boolean;
  /** QA-39-1: the try's highest game speed (null: the log has none). */
  speed: number | null;
  /** Log lines this attempt came from. */
  lines: number[];
}

export interface Converted {
  csv: string;
  rows: SheetRow[];
  /** Why a log row is not in the CSV (`line N: …`). */
  excluded: string[];
  warnings: string[];
}

export interface ConvertOptions {
  tester: string;
  /** Bot median of a level in ms (undefined: the level has no win → error). */
  botMs: (id: number) => number | undefined;
  /** Drop rows with `t` before this (`YYYY-MM-DDTHH:MMZ`, compared as text). */
  since?: string;
}

export const SHEET_COLUMNS: readonly string[] = [...REQUIRED_COLUMNS, 'time_ms'];

const RESULT = { won: 'W', lost: 'L', retreat: 'R' } as const;

/** The log rows → the decide CSV. Throws `LogError` (a level without a bot median, a tester name with a comma …). */
export function convertLog(log: ParsedLog, o: ConvertOptions): Converted {
  const tester = o.tester.trim();
  if (!tester) throw new LogError('--tester is empty');
  if (/[",\r\n]/.test(tester)) throw new LogError(`--tester "${tester}": no commas, quotes or line breaks`);
  const excluded: string[] = [];
  const warnings: string[] = [];
  const out: SheetRow[] = [];
  const builds = new Set<string>();
  const next = new Map<number, number>();
  /** level → its last emitted row and that row's log attempt (for a continued result). */
  const last = new Map<number, { row: SheetRow; logAttempt: number }>();
  /** QA-39-4: level → `had` of its first row in the sheet (null: a log row from before the column). */
  const hadFirst = new Map<number, boolean | null>();
  for (const r of log.rows) {
    if (o.since !== undefined && r.t < o.since) { excluded.push(`line ${r.line}: ${r.t} is before --since ${o.since}`); continue; }
    if (r.mode !== 'campaign') { excluded.push(`line ${r.line}: ${r.mode} challenge on level ${r.lvl} (the sheet's sample is campaign only)`); continue; }
    if (r.outcome === 'skip') { excluded.push(`line ${r.line}: SKIP LEVEL on level ${r.lvl} (against §A rule 7; the try stays as its lost row)`); continue; }
    builds.add(r.build);
    const prev = last.get(r.lvl);
    if (r.continued && prev && prev.logAttempt === r.attempt) {
      const speed = prev.row.speed === null || r.speed === null ? (prev.row.speed ?? r.speed) : Math.max(prev.row.speed, r.speed);
      Object.assign(prev.row, { result: RESULT[r.outcome], timeMs: r.timeMs, stars: r.stars, help: true, boosters: Math.max(prev.row.boosters, r.boosters), speed });
      prev.row.lines.push(r.line);
      continue;
    }
    const attempt = (next.get(r.lvl) ?? 0) + 1;
    next.set(r.lvl, attempt);
    if (attempt === 1) hadFirst.set(r.lvl, r.had);
    if (attempt === 1 && r.attempt > 1) warnings.push(`line ${r.line}: level ${r.lvl}'s first try in this log is the log's attempt ${r.attempt} (tried before with Diagnostics on: use --since, or CLEAR LOG before the session)`);
    const row: SheetRow = {
      tester, level: r.lvl, bot: '', attempt, result: RESULT[r.outcome], timeMs: r.timeMs, stars: r.stars,
      firstEver: '', boosters: r.boosters, help: r.continued, speed: r.speed, lines: [r.line],
    };
    out.push(row);
    last.set(r.lvl, { row, logAttempt: r.attempt });
  }
  if (out.length === 0) throw new LogError(`no campaign rows to convert (${excluded.length} excluded)`);
  // first_ever per level: QA-39-4 from its first row's `had`; a log without the column: from its wins' `first`
  const firstOf = new Map<number, '' | '0' | '1'>();
  for (const r of log.rows) {
    if (r.mode !== 'campaign' || r.outcome !== 'won' || (o.since !== undefined && r.t < o.since)) continue;
    firstOf.set(r.lvl, r.first || firstOf.get(r.lvl) === '1' ? '1' : '0');
  }
  for (const row of out) {
    const had = hadFirst.get(row.level);
    row.firstEver = had === true ? '0' : had === false ? '1' : (firstOf.get(row.level) ?? '');
  }
  const unknownFirst = [...new Set(out.filter((r) => r.firstEver === '').map((r) => r.level))];
  if (unknownFirst.length) warnings.push(`first_ever left empty on level(s) ${unknownFirst.join(', ')}: never won in a log without the had column (a build before QA-39-4), so "before" is unknown — fill it from the tester's line`);
  for (const b of builds) {
    const n = buildNumber(b);
    if (n === undefined || n < MIN_BUILD) warnings.push(`build "${b}" is below build ${MIN_BUILD}: §A step 1 says its times are not comparable with the bot's`);
  }
  const noSpeed = out.filter((r) => r.speed === null).map((r) => r.level);
  if (noSpeed.length) warnings.push(`speed left empty on level(s) ${[...new Set(noSpeed)].join(', ')}: the log has no speed column (a build before QA-39-1) — decide reads empty as ×1`);
  const odd = out.filter((r) => r.speed !== null && r.speed !== 1 && r.speed !== 2);
  for (const r of odd) warnings.push(`line ${r.lines[r.lines.length - 1]}: level ${r.level} ran at ×${r.speed} (not ×1 / ×2: a debug speed) — written as speed 2, not a valid ×1 try`);
  if (builds.size > 1) warnings.push(`the log mixes ${builds.size} builds (${[...builds].join(' / ')})`);
  for (const id of [...new Set(out.map((r) => r.level))]) {
    const ms = o.botMs(id);
    if (ms === undefined) throw new LogError(`level ${id}: no bot median (the reference player won no seed)`);
    const s = (ms / 1000).toFixed(1);
    for (const row of out) if (row.level === id) row.bot = s;
  }
  const lines = [SHEET_COLUMNS.join(',')];
  for (const r of out) {
    const cells: Record<string, string> = {
      tester: r.tester, level: String(r.level), bot: r.bot, attempt: String(r.attempt), result: r.result,
      time: r.timeMs > 0 ? formatClock(r.timeMs) : '', stars: String(r.stars), first_ever: r.firstEver,
      speed: r.speed === null ? '' : r.speed === 1 ? '1' : '2',
      boosters: String(r.boosters), help: r.help ? '1' : '0', named: '', log: '', iv: '', note: '',
      time_ms: r.timeMs > 0 ? String(r.timeMs) : '',
    };
    lines.push(SHEET_COLUMNS.map((c) => cells[c] ?? '').join(','));
  }
  const csv = `${lines.join('\n')}\n`;
  // the output must be what decide accepts
  try {
    parseSheet(csv);
  } catch (e) {
    if (e instanceof SheetError) throw new LogError(`internal: the converted sheet does not parse (${e.message})`);
    throw e;
  }
  return { csv, rows: out, excluded, warnings };
}

/* ---------- REV-2: --verify, one record per (text, row), each re-run under a time limit ---------- */

/** `--verify`'s default limit per record (a level is at most a few minutes of sim; the re-run takes seconds). */
export const VERIFY_TIMEOUT_S = 120;

/** One record's re-run, as `--verify` reads it. */
export interface VerifyRun {
  status: number | null;
  stdout: string;
  stderr: string;
  /** Killed at the time limit (SIGKILL: a stalled sim does not get to ignore it). */
  timedOut: boolean;
}

/** Run `cmd args` like `spawnSync`, killed with SIGKILL after `timeoutMs`. */
export function spawnVerify(cmd: string, args: readonly string[], cwd: string, timeoutMs: number): VerifyRun {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL' });
  const code = (r.error as NodeJS.ErrnoException | undefined)?.code;
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', timedOut: code === 'ETIMEDOUT' };
}

export interface VerifySummary {
  /** One line per record (`text T row N: MATCH — …`; `row N` alone when the file holds one text). */
  lines: string[];
  match: number;
  notMatched: number;
  timedOut: number;
  /** The closing line (counts, unverified rows). */
  summary: string;
  ok: boolean;
}

/**
 * Re-run every record of `log` exactly once, addressed as (text, row) — `run` is `scripts/replay.ts --from-log
 * <log> --text T --row N` in the CLI, a stub in the tests. A record killed at the limit is TIMEOUT, not MATCH.
 */
export function verifyReplays(log: ParsedLog, run: (r: LogReplay) => VerifyRun, o: { timeoutS: number; keep: number }): VerifySummary {
  const lines: string[] = [];
  let match = 0;
  let notMatched = 0;
  let timedOut = 0;
  for (const rep of log.replays) {
    const r = run(rep);
    const label = log.texts > 1 ? `text ${rep.text} row ${rep.row}` : `row ${rep.row}`;
    const head = (/^replay: level .*$/m.exec(r.stdout)?.[0] ?? r.stderr.trim().split('\n').at(-1) ?? '').replace(/^replay: /, '');
    if (r.timedOut) {
      timedOut++;
      lines.push(`${label}: TIMEOUT (killed after ${o.timeoutS} s; log line ${rep.line})${head ? ` — ${head}` : ''}`);
    } else if (r.status === 0 && /^replay: MATCH/m.test(r.stdout)) {
      match++;
      lines.push(`${label}: MATCH — ${head}`);
    } else {
      notMatched++;
      lines.push(`${label}: NOT MATCHED (exit ${r.status}) — ${head}`);
    }
  }
  const k = log.replays.length;
  const fails = [notMatched ? `${notMatched} NOT MATCHED` : '', timedOut ? `${timedOut} TIMEOUT (limit ${o.timeoutS} s per record)` : ''].filter(Boolean);
  const texts = log.texts > 1 ? ` across ${log.texts} pasted texts` : '';
  const summary = `${match}/${k} MATCH${fails.length ? `, ${fails.join(', ')}` : ''}${texts}; ${log.rows.length - k} log row(s) carry no record (only the newest ${o.keep} per text do)`;
  return { lines, match, notMatched, timedOut, summary, ok: notMatched === 0 && timedOut === 0 };
}
