import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import type { DiagRow } from '../../src/ui/diagnostics';
import { DIAG_COLUMNS, DIAG_COLUMNS_V1_0, DIAG_COLUMNS_V1_1, diagShare } from '../../src/ui/diagnostics';
import type { LevelDef } from '../../src/sim/types';
import { serializeReplay } from '../../src/sim/replay';
import { referencePlayerCommands } from '../../src/ai/referencePlayer';
import { recordHeadless } from '../../scripts/lib/recordReplay';
import { REQUIRED_COLUMNS, decide, parseSheet } from '../../scripts/lib/playtestDecideRule';
import { LogError, MIN_BUILD, SHEET_COLUMNS, buildNumber, convertLog, formatClock, parseLog } from '../../scripts/lib/playtestLog';

/*
 * QA-39 (2026-11-12): the playtest-day dry run found that §D asked the Producer to retype the Diagnostics log into
 * decide's CSV by hand (timeMs, boosters, continued, attempts, the §B.1 bot column). scripts/playtestLog.ts does it:
 * COPY LOG text → the `npm run playtest:decide` sheet. The synthetic logs below are built with the game's own
 * `diagShare`, so a change of the COPY LOG format breaks this file, not the playtest day.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HINTS = { build: '1.0.0 (build 27)', ua: 'test', viewport: '430x932', dpr: 3, textScale: 1, language: 'az' };

const row = (o: Partial<DiagRow> & Pick<DiagRow, 'lvl' | 'attempt' | 'outcome'>): DiagRow => ({
  v: 1, t: '2026-11-12T16:10Z', build: '1.0.0 (build 27)', mode: 'campaign', timeMs: 0, stars: 0, first: false,
  continued: false, boosters: 0, textScale: 1, ...o,
});
const won = (lvl: number, attempt: number, timeMs: number, stars: number, first = true, extra: Partial<DiagRow> = {}): DiagRow =>
  row({ lvl, attempt, outcome: 'won', timeMs, stars, first, ...extra });
const lost = (lvl: number, attempt: number, timeMs: number, extra: Partial<DiagRow> = {}): DiagRow => row({ lvl, attempt, outcome: 'lost', timeMs, ...extra });

/** The session: 3 (before 3) won; 23 lost, lost, won on try 3; 17 won then the "speed" retry; a daily; a weekly. */
const SESSION: DiagRow[] = [
  won(3, 1, 24_450, 3, false),
  lost(23, 1, 64_450),
  lost(23, 2, 70_100),
  won(23, 3, 52_950, 2),
  won(17, 1, 41_234, 2),
  row({ lvl: 26, attempt: 1, outcome: 'won', timeMs: 26_800, stars: 2, first: true, mode: 'daily' }),
  row({ lvl: 40, attempt: 1, outcome: 'lost', timeMs: 90_000, mode: 'weekly' }),
  won(17, 2, 28_400, 2, false),
];
const BOT: Record<number, number> = { 3: 27_800, 17: 28_400, 23: 37_000, 32: 48_200, 5: 37_400 };
const botMs = (id: number): number | undefined => BOT[id];
const logText = (rows: DiagRow[]): string => diagShare(rows, HINTS).text;

describe('playtestLog: COPY LOG → decide sheet', () => {
  const c = convertLog(parseLog(logText(SESSION)), { tester: 'stakeholder', botMs });

  it('one row per campaign try, retries numbered 1..n per level, the columns decide reads', () => {
    expect(c.csv.split('\n')[0]).toBe([...REQUIRED_COLUMNS, 'time_ms'].join(','));
    expect(SHEET_COLUMNS).toEqual([...REQUIRED_COLUMNS, 'time_ms']);
    expect(c.rows.map((r) => [r.level, r.attempt, r.result, r.timeMs, r.stars])).toEqual([
      [3, 1, 'W', 24_450, 3],
      [23, 1, 'L', 64_450, 0],
      [23, 2, 'L', 70_100, 0],
      [23, 3, 'W', 52_950, 2],
      [17, 1, 'W', 41_234, 2],
      [17, 2, 'W', 28_400, 2],
    ]);
    expect(c.csv).toContain('\nstakeholder,23,37.0,3,W,00:52.950,2,1,,0,0,,,,,52950\n');
    expect(c.csv).toContain('\nstakeholder,23,37.0,1,L,01:04.450,0,1,,0,0,,,,,64450\n');
  });

  it('daily and weekly rows are excluded and named (the sheet samples the campaign only)', () => {
    expect(c.rows.some((r) => r.level === 26 || r.level === 40)).toBe(false);
    expect(c.excluded).toEqual([
      'line 8: daily challenge on level 26 (the sheet\'s sample is campaign only)',
      'line 9: weekly challenge on level 40 (the sheet\'s sample is campaign only)',
    ]);
  });

  it('first_ever per level from its wins: 1 on every try of a first clear, 0 when it had stars, empty when never won', () => {
    expect(Object.fromEntries(c.rows.map((r) => [`${r.level}.${r.attempt}`, r.firstEver]))).toMatchObject({ '3.1': '0', '23.1': '1', '23.3': '1', '17.2': '1' });
    const lossOnly = convertLog(parseLog(logText([lost(32, 1, 80_000)])), { tester: 'S', botMs });
    expect(lossOnly.rows[0]!.firstEver).toBe('');
    expect(lossOnly.warnings.join('\n')).toContain('first_ever left empty on level(s) 32');
  });

  it('QA-39-4: first_ever from the level\'s first row\'s `had` (also a level never won); no "left empty" warning', () => {
    const k = convertLog(parseLog(logText([
      lost(32, 1, 80_000, { had: false }), // never cleared, never won in the log: first_ever 1
      lost(32, 2, 81_000, { had: false }),
      lost(5, 1, 40_000, { had: true }), // cleared before the session, lost only: 0
      won(23, 1, 30_000, 2, true, { had: false }), // a first clear on try 1: 1
      lost(23, 2, 70_000, { had: true }), // later rows' had 1 does not change the level's value
      won(3, 1, 24_450, 3, false, { had: true }), // had stars: 0
      row({ lvl: 26, attempt: 1, outcome: 'won', timeMs: 26_800, stars: 2, first: true, mode: 'daily', had: false }), // excluded
    ])), { tester: 'S', botMs });
    expect(k.rows.map((r) => [r.level, r.attempt, r.firstEver])).toEqual([[32, 1, '1'], [32, 2, '1'], [5, 1, '0'], [23, 1, '1'], [23, 2, '1'], [3, 1, '0']]);
    expect(k.warnings.join('\n')).not.toContain('first_ever left empty');
    expect(parseSheet(k.csv).rows.map((r) => r.level)).toEqual([32, 32, 5, 23, 23, 3]);
    // the first row is the sheet's attempt 1: --since drops an older row, the renumbered first row's had decides
    const since = convertLog(parseLog(logText([
      lost(5, 3, 40_000, { t: '2026-11-01T09:00Z', had: false }),
      won(5, 4, 50_000, 1, true, { had: false }),
      lost(5, 5, 45_000, { had: true }),
    ])), { tester: 'S', botMs, since: '2026-11-12T00:00Z' });
    expect(since.rows.map((r) => [r.attempt, r.firstEver])).toEqual([[1, '1'], [2, '1']]);
    // a skip is excluded, so it is never the first row; a continued result keeps its try (the try's first row)
    const cont = convertLog(parseLog(logText([lost(5, 1, 40_000, { had: false }), won(5, 1, 61_000, 1, true, { continued: true, had: false })])), { tester: 'S', botMs });
    expect(cont.rows.map((r) => [r.attempt, r.result, r.firstEver])).toEqual([[1, 'W', '1']]);
    expect(parseLog(logText([lost(5, 1, 40_000, { had: true })])).rows[0]!.had).toBe(true);
    expect(() => parseLog(logText([lost(5, 1, 40_000, { had: true })]).replace(/,1$/m, ',x'))).toThrow(/^line 3: had "x" must be 0 or 1$/);
  });

  it('QA-39-4: a log from before `had` (14 columns, build 27; or 13 before speed) keeps the wins-only rule and its warning', () => {
    for (const cols of [DIAG_COLUMNS_V1_1, DIAG_COLUMNS_V1_0]) {
      const text = logText([won(3, 1, 24_450, 3, false, { speed: 1 }), lost(32, 1, 80_000, { speed: 1 }), lost(23, 1, 64_450, { speed: 1 }), won(23, 2, 52_950, 2, true, { speed: 1 })]).split('\n');
      text[1] = cols.join(',');
      for (let i = 2; i < text.length; i++) text[i] = text[i]!.split(',').slice(0, cols.length).join(',');
      const p = parseLog(text.join('\n'));
      expect(p.rows.every((r) => r.had === null)).toBe(true);
      const o = convertLog(p, { tester: 'S', botMs });
      expect(o.rows.map((r) => [r.level, r.firstEver])).toEqual([[3, '0'], [32, ''], [23, '1'], [23, '1']]);
      expect(o.warnings.join('\n')).toContain('first_ever left empty on level(s) 32');
    }
    // a paste of an old log then a new one: each level by its own first row (null had → the fallback)
    const old = logText([lost(32, 1, 80_000)]).split('\n');
    old[1] = DIAG_COLUMNS_V1_1.join(',');
    old[2] = old[2]!.replace(/,$/, '');
    const mixed = convertLog(parseLog(`${old.join('\n')}\n${logText([lost(5, 1, 40_000, { had: false })])}`), { tester: 'S', botMs });
    expect(mixed.rows.map((r) => [r.level, r.firstEver])).toEqual([[32, ''], [5, '1']]);
    expect(mixed.warnings.join('\n')).toContain('first_ever left empty on level(s) 32:');
  });

  it('free-text columns and speed stay empty; the bot median is printed to 0.1 s like §B.1', () => {
    const p = parseSheet(c.csv);
    expect(p.rows.every((r) => r.named === undefined && r.log === undefined && !r.iv && r.note === '')).toBe(true);
    expect(c.csv.split('\n')[1]).toBe('stakeholder,3,27.8,1,W,00:24.450,3,0,,0,0,,,,,24450');
    expect(p.botMs.get(23)).toBe(37_000);
    expect(p.rows.find((r) => r.level === 17 && r.attempt === 1)!.timeMs).toBe(41_234); // time_ms wins over the card
  });

  it('QA-39-1: speed from the log (1 → 1, ×2 / a debug ×20 → 2 = not a valid ×1 try); an old log without the column reads as empty', () => {
    const k = convertLog(parseLog(logText([
      won(3, 1, 24_450, 3, false, { speed: 1 }),
      won(17, 1, 28_400, 2, true, { speed: 2 }),
      won(23, 1, 30_000, 2, true, { speed: 20 }),
      lost(5, 1, 40_000, { speed: 2 }),
      won(5, 1, 61_000, 1, true, { continued: true, speed: 1 }), // the continue's result keeps its try's ×2
    ])), { tester: 'S', botMs });
    expect(k.rows.map((r) => [r.level, r.speed])).toEqual([[3, 1], [17, 2], [23, 20], [5, 2]]);
    const sheet = parseSheet(k.csv);
    expect(sheet.rows.map((r) => [r.level, r.speed])).toEqual([[3, 1], [17, 2], [23, 2], [5, 2]]);
    expect(k.warnings.join('\n')).toContain('level 23 ran at ×20');
    expect(k.warnings.join('\n')).not.toContain('speed left empty');
    const d = decide({ sheet, clockOf: () => ({ star3: 25_000, star2: 60_000 }) });
    expect(d.levels.find((l) => l.id === 17)!.hMs).toBeUndefined(); // a ×2 win is no valid time
    expect(d.levels.find((l) => l.id === 3)!.hMs).toBe(24_450);
    // a log from a build before the column: its own column line, rows without speed → empty, with a warning
    const old = logText([won(3, 1, 24_450, 3, false)]).split('\n');
    old[1] = DIAG_COLUMNS_V1_0.join(',');
    old[2] = old[2]!.replace(/,,$/, ''); // no speed, no had
    const o = convertLog(parseLog(old.join('\n')), { tester: 'S', botMs });
    expect(o.rows[0]!.speed).toBeNull();
    expect(o.csv.split('\n')[1]).toBe('S,3,27.8,1,W,00:24.450,3,0,,0,0,,,,,24450');
    expect(o.warnings.join('\n')).toContain('speed left empty on level(s) 3');
    expect(() => parseLog(logText([won(3, 1, 24_450, 3, false, { speed: 0 })]))).toThrow(/^line 3: speed "0" must be a number > 0/);
  });

  it('decide runs on the output (N = 1, PROVISIONAL)', () => {
    const d = decide({ sheet: parseSheet(c.csv), clockOf: () => ({ star3: 25_000, star2: 60_000 }) });
    expect(d.n).toBe(1);
    expect(d.tag).toBe('PROVISIONAL');
    expect(d.levels.map((l) => l.id).sort((a, b) => a - b)).toEqual([3, 17, 23]);
  });

  it('a REINFORCEMENTS result replaces its try (help 1), it is not a new attempt; a skip is excluded', () => {
    const k = convertLog(parseLog(logText([
      lost(5, 1, 40_000),
      won(5, 1, 61_000, 1, true, { continued: true, boosters: 1 }),
      lost(32, 1, 80_000),
      row({ lvl: 32, attempt: 1, outcome: 'skip', stars: 1, first: true }),
    ])), { tester: 'S', botMs });
    expect(k.rows.map((r) => [r.level, r.attempt, r.result, r.timeMs, r.help, r.boosters])).toEqual([
      [5, 1, 'W', 61_000, true, 1],
      [32, 1, 'L', 80_000, false, 0],
    ]);
    expect(k.excluded).toEqual(['line 6: SKIP LEVEL on level 32 (against §A rule 7; the try stays as its lost row)']);
    expect(decide({ sheet: parseSheet(k.csv), clockOf: () => ({ star3: 25_000, star2: 60_000 }) }).levels.find((l) => l.id === 5)!.hMs).toBeUndefined(); // not a valid time
  });

  it('a log that started before the session: attempts renumbered from 1, --since drops the old rows, old builds warned', () => {
    const rows = [won(3, 4, 30_000, 2, false, { t: '2026-11-01T09:00Z', build: '1.0.0 (build 26)' }), won(3, 5, 24_000, 3, false)];
    const all = convertLog(parseLog(logText(rows)), { tester: 'S', botMs });
    expect(all.rows.map((r) => r.attempt)).toEqual([1, 2]);
    expect(all.warnings.join('\n')).toContain("level 3's first try in this log is the log's attempt 4");
    expect(all.warnings.join('\n')).toContain(`build "1.0.0 (build 26)" is below build ${MIN_BUILD}`);
    expect(all.warnings.join('\n')).toContain('the log mixes 2 builds');
    const fresh = convertLog(parseLog(logText(rows)), { tester: 'S', botMs, since: '2026-11-12T00:00Z' });
    expect(fresh.rows.map((r) => [r.attempt, r.timeMs])).toEqual([[1, 24_000]]);
    expect(fresh.excluded).toEqual(['line 3: 2026-11-01T09:00Z is before --since 2026-11-12T00:00Z']);
  });

  it('malformed input is rejected with its line number', () => {
    const text = logText(SESSION).split('\n');
    const at = (i: number, line: string): string => [...text.slice(0, i), line, ...text.slice(i + 1)].join('\n');
    expect(() => parseLog(at(4, '1,2026-11-12T16:10Z,1.0.0 (build 27),23,campaign,1,lost'))).toThrow(new LogError('line 5: 7 field(s), the column line has 15 (a line cut by the paste?)'));
    expect(() => parseLog(at(4, text[4]!.replace(',lost,', ',defeat,')))).toThrow(/^line 5: outcome "defeat" must be won \/ lost \/ retreat \/ skip$/);
    expect(() => parseLog(at(2, text[2]!.replace(',3,campaign,', ',51,campaign,')))).toThrow(/^line 3: lvl "51" is not a level id$/);
    expect(() => parseLog(at(2, text[2]!.replace(',won,24450,3,', ',won,24450,0,')))).toThrow(/^line 3: stars "0" must be 1–3 on a win$/);
    expect(() => parseLog('tester,level,bot\nS,3,27.8\n')).toThrow(/^line 1: expected the Diagnostics column line/);
    expect(() => parseLog(`${text[0]}\n${text[1]}\n`)).toThrow(/no rows/);
    expect(() => convertLog(parseLog(logText([won(9, 1, 30_000, 2)])), { tester: 'S', botMs })).toThrow(/level 9: no bot median/);
    expect(() => convertLog(parseLog(logText(SESSION)), { tester: 'a,b', botMs })).toThrow(/no commas/);
    expect(() => convertLog(parseLog(logText([SESSION[5]!])), { tester: 'S', botMs })).toThrow(/no campaign rows to convert \(1 excluded\)/);
  });

  it('#replay lines are listed by row; a size marker is not a record', () => {
    const rows = [won(3, 1, 24_450, 3, false, { replay: { dropped: 'size', bytes: 40_000 } }), won(17, 1, 28_400, 2)];
    const text = `${logText(rows)}\n#replay 2 {"v":1}`;
    expect(parseLog(text).replayRows).toEqual([2]);
  });

  it('the parser reads the game\'s own column line (src/ui/diagnostics.ts DIAG_COLUMNS) and helpers', () => {
    expect(logText(SESSION).split('\n')[1]).toBe(DIAG_COLUMNS.join(','));
    expect(buildNumber('1.0.0 (build 27)')).toBe(27);
    expect(buildNumber('dev')).toBeUndefined();
    expect(formatClock(88_600)).toBe('01:28.600');
    expect(formatClock(5_000)).toBe('00:05.000');
  });
});

describe('playtestLog CLI', () => {
  const tsx = join(ROOT, 'node_modules/tsx/dist/cli.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'qa-plog-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const cli = (...args: string[]) => spawnSync(process.execPath, [tsx, 'scripts/playtestLog.ts', ...args], { cwd: ROOT, encoding: 'utf8' });
  const file = (name: string, text: string): string => {
    const p = join(dir, name);
    writeFileSync(p, text);
    return p;
  };
  const levels = file('levels.json', JSON.stringify({ 3: { s3: 25, s2: 60, bot: 27.8 }, 17: { s3: 25, s2: 50, bot: 28.4 }, 23: { s3: 30, s2: 75, bot: 37 }, 26: { s3: 30, s2: 60, bot: 30 }, 40: { s3: 30, s2: 60, bot: 30 } }));

  it('--levels: writes the sheet (--out) that playtest:decide accepts, exit 0', () => {
    const out = join(dir, '2026-11-12-playtest.csv');
    const r = cli(file('log.txt', logText(SESSION)), '--tester', 'stakeholder', '--levels', levels, '--out', out);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain('6 attempt row(s) on 3 level(s) for tester stakeholder (bot from --levels');
    expect(r.stderr).toContain('excluded line 8: daily challenge on level 26');
    const csv = readFileSync(out, 'utf8');
    expect(csv.split('\n')).toHaveLength(8); // header + 6 + the final newline
    const d = spawnSync(process.execPath, [tsx, 'scripts/playtestDecide.ts', out, '--levels', levels], { cwd: ROOT, encoding: 'utf8' });
    expect(d.status, d.stderr).toBe(0);
    expect(d.stdout).toContain('Testers N = 1 (stakeholder) · 6 tries');
  });

  it('without --levels the bot is the reference player median on src/levels (seeds 1..K), as decide measures it', () => {
    const r = cli(file('one.txt', logText([won(1, 1, 20_000, 3)])), '--tester', 'S', '--seeds', '2');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toContain('bot = reference player median, seeds 1..2, src/levels');
    expect(r.stdout.split('\n')[1]).toMatch(/^S,1,\d+\.\d,1,W,00:20\.000,3,1,,0,0,,,,,20000$/);
  });

  it('--verify runs scripts/replay.ts on every #replay line: MATCH exit 0, a tampered record exit 1', () => {
    const level = readdirSync(join(ROOT, 'src/levels')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(ROOT, 'src/levels', f), 'utf8')) as LevelDef).find((l) => l.id === 3)!;
    const { replay } = recordHeadless(level, 1, referencePlayerCommands, 180_000);
    const rows = [won(3, 1, replay.outcome!.timeMs, 3, false, { replay })];
    const good = cli(file('rep.txt', logText(rows)), '--tester', 'S', '--levels', levels, '--verify');
    expect(good.status, good.stderr).toBe(0);
    expect(good.stderr).toContain('--verify row 1: MATCH — level 3');
    expect(good.stderr).toContain('--verify: 1/1 MATCH; 0 log row(s) carry no record');
    const json = serializeReplay(replay);
    const bad = cli(file('tampered.txt', logText(rows).replace(json, json.replace(replay.outcome!.hash, '00000000'))), '--tester', 'S', '--levels', levels, '--verify');
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('--verify row 1: NOT MATCHED (exit 1)');
  }, 30_000);

  it('a malformed log exits 1 naming the line; a bad command line exits 2', () => {
    const text = logText(SESSION).replace(',campaign,1,won,24450,', ',campaign,x,won,24450,');
    const r = cli(file('bad.txt', text), '--tester', 'S', '--levels', levels);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/bad\.txt: line 3: attempt "x" must be 1, 2, …/);
    expect(cli(file('nobot.txt', logText([won(9, 1, 30_000, 2)])), '--tester', 'S', '--levels', levels).status).toBe(1);
    expect(cli().status).toBe(2);
    expect(cli(join(dir, 'log.txt')).stderr).toContain('missing --tester');
    expect(cli(join(dir, 'log.txt'), '--tester', 'S', '--bogus').status).toBe(2);
    expect(cli(join(dir, 'log.txt'), '--tester', 'S', '--since', '2026-11-12').status).toBe(2);
    expect(cli(join(dir, 'log.txt'), '--tester').stderr).toContain('--tester needs a value');
  });

  it('npm alias playtest:log (beside playtest:decide)', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['playtest:log']).toBe('tsx scripts/playtestLog.ts');
    expect(pkg.scripts['playtest:decide']).toBe('tsx scripts/playtestDecide.ts');
  });
});
