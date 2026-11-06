import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  PINNED,
  REQUIRED_COLUMNS,
  SheetError,
  bandStar3,
  decide,
  humanTable,
  nextStar3,
  parseSheet,
  renderMarkdown,
  zoneOf,
} from '../../scripts/lib/playtestDecideRule';
import { KEEP, validateHumanPins } from '../../scripts/lib/reclockPins';
import type { Clock, Decision } from '../../scripts/lib/playtestDecideRule';

/*
 * QA-36 (2026-11-06): the human playtest sheet's decision helper (docs/reviews/2026-11-05-human-playtest-sheet.md
 * §C) moved from the Game Designer's scratch `decide.mjs` into scripts/playtestDecide.ts (rules in
 * scripts/lib/playtestDecideRule.ts). The worked example is the scratch example.csv (N = 1, the stakeholder) with
 * the §B.1 bot medians added as the required `bot` column; its clocks are the 2026-11-05 values of the scratch
 * levels.json, pinned here so a later re-clock does not change the expected rows.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HEADER = REQUIRED_COLUMNS.join(',');

const EXAMPLE_CSV = `${HEADER}
S,3,27.8,1,W,00:24,3,0,1,0,0,,,,
S,17,28.4,1,W,00:41,2,1,1,0,0,red,green,,
S,23,37.0,1,L,01:40,0,1,1,0,0,,,,
S,23,37.0,2,W,01:10,2,1,1,0,0,,,,
S,32,48.2,1,W,01:25,1,1,1,0,0,,,,
S,33,38.5,1,W,00:52,2,1,1,0,0,none,red,,
S,38,32.6,1,W,00:58,1,1,1,0,0,,,,
S,45,48.2,1,W,01:05,2,1,1,0,0,,,,
S,49,33.1,1,W,00:45,2,1,1,0,0,none,green,,
S,50,49.6,1,W,01:00,2,1,1,0,0,,,1,
`;

/** 2026-11-05 clocks / bot medians (seconds) of the example's levels and of the bands it moves. */
const EXAMPLE_LEVELS: Record<number, { s3: number; s2: number; bot: number }> = {
  3: { s3: 25, s2: 60, bot: 27.8 }, 17: { s3: 25, s2: 50, bot: 28.4 }, 18: { s3: 30, s2: 60, bot: 37.1 },
  19: { s3: 25, s2: 50, bot: 33 }, 20: { s3: 25, s2: 50, bot: 34.1 }, 21: { s3: 25, s2: 50, bot: 29.3 },
  22: { s3: 35, s2: 70, bot: 46.5 }, 23: { s3: 30, s2: 75, bot: 37 }, 24: { s3: 30, s2: 60, bot: 40.8 },
  32: { s3: 40, s2: 80, bot: 48.2 }, 33: { s3: 35, s2: 70, bot: 38.5 }, 38: { s3: 25, s2: 50, bot: 32.6 },
  41: { s3: 70, s2: 120, bot: 72.9 }, 42: { s3: 60, s2: 120, bot: 67 }, 43: { s3: 30, s2: 60, bot: 33 },
  44: { s3: 25, s2: 50, bot: 30.6 }, 45: { s3: 40, s2: 95, bot: 48.2 }, 46: { s3: 45, s2: 90, bot: 55.8 },
  47: { s3: 40, s2: 90, bot: 44.1 }, 48: { s3: 45, s2: 90, bot: 54.5 }, 49: { s3: 25, s2: 50, bot: 33.1 },
  50: { s3: 40, s2: 90, bot: 49.6 },
};

const clockMap = (spec: Record<number, { s3: number; s2: number; bot?: number }>) => (id: number): Clock | undefined => {
  const v = spec[id];
  return v ? { star3: v.s3 * 1000, star2: v.s2 * 1000, ...(v.bot !== undefined ? { botMs: v.bot * 1000 } : {}) } : undefined;
};

const run = (csv: string, spec: Record<number, { s3: number; s2: number; bot?: number }>): Decision =>
  decide({ sheet: parseSheet(csv), clockOf: clockMap(spec) });

/** One win row: tester, level, bot (s), attempt, mm:ss, stars; `extra` overrides the trailing columns. */
const win = (t: string, level: number, bot: number, attempt: number, time: string, stars: number, tail = '0,1,0,0,,,,'): string =>
  `${t},${level},${bot},${attempt},W,${time},${stars},${tail}`;
const loss = (t: string, level: number, bot: number, attempt: number): string => `${t},${level},${bot},${attempt},L,,0,0,1,0,0,,,,`;
const sheet = (...rows: string[]): string => `${HEADER}\n${rows.join('\n')}\n`;

const star3Of = (d: Decision): Record<number, number> => Object.fromEntries(d.levels.map((l) => [l.id, l.star3 / 1000]));

describe('playtestDecide: the worked example (scratch example.csv, N = 1)', () => {
  const d = run(EXAMPLE_CSV, EXAMPLE_LEVELS);

  it('C.1: zones, proposed star3, the pin on 33', () => {
    expect(d.n).toBe(1);
    expect(d.tag).toBe('PROVISIONAL');
    expect(d.levels.map((l) => [l.id, l.zone, l.r!.toFixed(2)])).toEqual([
      [3, 'M', '0.86'], [17, 'S', '1.44'], [23, 'S', '1.89'], [32, 'S', '1.76'], [33, 'S', '1.35'],
      [38, 'S', '1.78'], [45, 'S', '1.35'], [49, 'S', '1.36'], [50, 'S', '1.21'],
    ]);
    expect(star3Of(d)).toEqual({ 3: 25, 17: 30, 23: 35, 32: 50, 33: 35, 38: 35, 45: 50, 49: 35, 50: 50 });
  });

  it('C.1 band moves: 17–24 and 41–50 (≥ 2 non-pinned levels in S), not 33–40 (33 is pinned, 38 alone)', () => {
    const moves = Object.fromEntries(d.bandMoves.map((m) => [`${m.band + 1}${m.zone}`, m.moves.map((x) => [x.id, x.to / 1000])]));
    expect(moves).toEqual({
      '3S': [[18, 35], [19, 35], [20, 35], [21, 30], [22, 45], [24, 40]],
      '6S': [[41, 75], [42, 65], [43, 35], [44, 30], [46, 55], [47, 45], [48, 55]],
    });
    expect(d.bandMoves.find((m) => m.band === 2)!.rBand.toFixed(2)).toBe('1.67');
  });

  it('H3, C.2 (first try, not first win), C.3, C.4', () => {
    expect(d.h3).toEqual({ threeStar: 1, validFirstWins: 9, holds: false });
    // 23 was lost on try 1 and won at 2★ on try 2: it is not a first-try 2★ (the draft counted it)
    expect(d.b5.perTester[0]).toMatchObject({ tester: 'S', firstTry2: [17, 49], refutes: false });
    expect(d.b5.refuted).toBe(false);
    expect(d.b5.share).toEqual({ twoStar: 3, firstWins: 5, triggerFires: false });
    expect(d.c3.perTester[0]).toMatchObject({ i: true, ii: true, iii: true, iv: true, counts: true, h2Fails: true });
    expect(d.c3.verdict).toBe('STAY CLOSED');
    expect(d.c4.on).toBe(false);
  });

  it('the markdown table and the HUMAN JSON (ms, every moved level, tagged)', () => {
    const md = renderMarkdown(d, { sheetName: 'example.csv', clocksFrom: 'test', source: 'sheet 2026-11-05' });
    expect(md).toContain('| 23 | 3 | 30 / 75 | 37 | 70 | 1.89 | S | 30 → **35** | PROVISIONAL |');
    expect(md).toContain('| 33 | 5 | 35 / 70 | 38.5 | 52 | 1.35 | S | = (pinned: weekly pin 2026-09-21) | PROVISIONAL |');
    const json = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(md)![1]!) as Record<string, { star3: number; source: string; note: string }>;
    expect(Object.keys(json).map(Number)).toEqual([17, 18, 19, 20, 21, 22, 23, 24, 32, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50]);
    expect(json['23']).toEqual({ star3: 35_000, source: 'sheet 2026-11-05', note: expect.stringContaining('zone S, H 70 s / B 37 s, r 1.89') });
    expect(json['23']!.note).toContain('PROVISIONAL');
    expect(json['33']).toBeUndefined();
    // every entry passes the pin table's own validator (5 s step, star3 < star2 when both, `sheet YYYY-MM-DD`, a note)
    expect(() => validateHumanPins(Object.fromEntries(Object.entries(json).map(([k, v]) => [Number(k), v])))).not.toThrow();
    expect(humanTable(d, 'x')).toEqual(Object.fromEntries(Object.entries(json).map(([k, v]) => [k, { ...v, source: 'x' }])));
  });
});

describe('playtestDecide: C.1 zones (S3 30 s, S2 80 s, B 40 s)', () => {
  const clock: Clock = { star3: 30_000, star2: 80_000 };
  const at = (hS: number): [string, number] => {
    const z = zoneOf((hS * 1000) / 40_000);
    return [z, nextStar3(9, z, clock, hS * 1000, 40_000) / 1000];
  };

  it('F below 0.85 tightens to round5(1.1 × H), never loosens', () => {
    expect(at(20)).toEqual(['F', 20]); // r 0.50, 1.1 × 20 = 22 → 20
    expect(at(24)).toEqual(['F', 25]); // 26.4 → 25
    expect(at(33.9)).toEqual(['F', 30]); // 1.1 × 33.9 = 37.3 → 35, min with 30
    expect(nextStar3(9, 'F', { star3: 40_000, star2: 80_000 }, 25_000, 40_000)).toBe(30_000); // 27.5 rounds up
  });

  it('M from 0.85 to 1.10 inclusive keeps S3', () => {
    expect(at(34)).toEqual(['M', 30]);
    expect(at(40)).toEqual(['M', 30]);
    expect(at(44)).toEqual(['M', 30]);
  });

  it('S above 1.10 loosens to round5(B), never tightens; the guard keeps it under S2', () => {
    expect(at(44.1)).toEqual(['S', 40]);
    expect(nextStar3(9, 'S', { star3: 45_000, star2: 80_000 }, 60_000, 40_000)).toBe(45_000);
    expect(nextStar3(9, 'S', { star3: 30_000, star2: 40_000 }, 60_000, 48_000)).toBe(35_000); // 50 ≥ S2 40 → 35
    expect(nextStar3(9, 'S', { star3: 30_000, star2: 50_000 }, 60_000, 48_000)).toBe(45_000); // 50 = S2 → 45
  });
});

describe('playtestDecide: band move and pins', () => {
  // band 9–16: 9 and 10 sampled, 11–16 unsampled (bot 40 s, S3 30, S2 80)
  const band2 = Object.fromEntries([9, 10, 11, 12, 13, 14, 15, 16].map((id) => [id, { s3: 30, s2: 80, bot: 40 }]));

  it('two non-pinned sampled levels in F move the rest of the band with the median r', () => {
    const d = run(sheet(win('A', 9, 40, 1, '00:20', 3), win('A', 10, 40, 1, '00:28', 3)), band2); // r 0.5, 0.7
    expect(d.bandMoves).toHaveLength(1);
    const m = d.bandMoves[0]!;
    expect([m.band, m.zone, m.sampled, m.rBand]).toEqual([1, 'F', [9, 10], 0.6]);
    expect(m.moves.map((x) => [x.id, x.to / 1000])).toEqual([11, 12, 13, 14, 15, 16].map((id) => [id, 25])); // 1.1 × 0.6 × 40 = 26.4
    expect(bandStar3('F', { star3: 30_000, star2: 80_000 }, 0.6, 40_000)).toBe(25_000);
    expect(bandStar3('S', { star3: 30_000, star2: 80_000 }, 1.5, 40_000)).toBe(40_000);
  });

  it('one sampled level per zone, or one F and one S, moves nothing else', () => {
    expect(run(sheet(win('A', 9, 40, 1, '00:20', 3)), band2).bandMoves).toEqual([]);
    expect(run(sheet(win('A', 9, 40, 1, '00:20', 3), win('A', 10, 40, 1, '01:00', 2)), band2).bandMoves).toEqual([]);
    expect(run(sheet(win('A', 9, 40, 1, '00:20', 3), win('A', 10, 40, 1, '00:40', 3)), band2).bandMoves).toEqual([]); // F + M
  });

  it('levels 1 and 33 never move, do not count toward a band move and are not moved by one', () => {
    const spec = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 33, 34, 35, 36, 37, 38, 39, 40].map((id) => [id, { s3: 30, s2: 80, bot: 40 }]));
    // 1 (F) + 2 (F) → only one non-pinned F in band 1: no move; 33 (S) stays
    const d = run(sheet(win('A', 1, 40, 1, '00:10', 3), win('A', 2, 40, 1, '00:20', 3), win('A', 33, 40, 1, '01:30', 1)), spec);
    expect(star3Of(d)).toEqual({ 1: 30, 2: 20, 33: 30 });
    expect(d.levels.find((l) => l.id === 1)!.zone).toBe('F');
    expect(d.bandMoves).toEqual([]);
    // 34 + 35 in S move band 5's unsampled levels — never 33
    const e = run(sheet(win('A', 34, 40, 1, '01:30', 1), win('A', 35, 40, 1, '01:20', 1)), spec);
    expect(e.bandMoves[0]!.moves.map((x) => x.id)).toEqual([36, 37, 38, 39, 40]);
    expect(Object.keys(humanTable(e, 's'))).not.toContain('33');
  });

  it('the pins are reclock.ts KEEP (1 and 33)', () => {
    expect(PINNED).toBe(KEEP);
    expect(Object.keys(PINNED).map(Number)).toEqual([1, 33]);
  });
});

describe('playtestDecide: tester count tags DECISION at N ≥ 3', () => {
  const spec = Object.fromEntries([17, 23, 32, 38, 49].map((id) => [id, { s3: 25, s2: 90, bot: 40 }]));
  /** First try won at 2★ on all five floored sample levels. */
  const strong = (t: string): string[] => [17, 23, 32, 38, 49].map((id) => win(t, id, 40, 1, '00:40', 2));

  it('1 tester: PROVISIONAL, and the human half of B5 cannot refute', () => {
    const d = run(sheet(...strong('S')), spec);
    expect([d.n, d.tag]).toEqual([1, 'PROVISIONAL']);
    expect(d.b5.refuters).toBe(1);
    expect(d.b5.refuted).toBe(false);
    expect(renderMarkdown(d, { sheetName: 's', clocksFrom: 't', source: 's' })).toContain('**PROVISIONAL (N = 1 < 3');
  });

  it('2 testers are still PROVISIONAL', () => {
    expect(run(sheet(...strong('S'), ...strong('F1')), spec).tag).toBe('PROVISIONAL');
  });

  it('3 testers: DECISION; 2 of them at ≥ 4 of 5 first-try 2★ refute the cliff; H is the median of the bests', () => {
    const d = run(sheet(...strong('S'), ...strong('F1'), loss('F2', 17, 40, 1), win('F2', 17, 40, 2, '01:20', 1)), spec);
    expect([d.n, d.tag, d.need]).toEqual([3, 'DECISION', 2]);
    expect(d.b5.refuters).toBe(2);
    expect(d.b5.refuted).toBe(true);
    expect(d.levels.find((l) => l.id === 17)!.hMs).toBe(40_000); // median of 40, 40, 80
    const md = renderMarkdown(d, { sheetName: 's', clocksFrom: 't', source: 's' });
    expect(md).toContain('**DECISION**');
    expect(md).toContain('REFUTED');
  });

  it('×2 speed, a booster or REINFORCEMENTS make a win invalid for H', () => {
    const d = run(sheet(
      win('S', 17, 40, 1, '00:10', 3, '0,2,0,0,,,,'),
      win('S', 17, 40, 2, '00:12', 3, '0,1,1,0,,,,'),
      win('S', 17, 40, 3, '00:14', 3, '0,1,0,1,,,,'),
      win('S', 17, 40, 4, '00:50', 1),
    ), spec);
    expect(d.levels[0]!.hMs).toBe(50_000);
  });
});

describe('playtestDecide: malformed sheets are rejected with the line', () => {
  const bad = (csv: string): string => {
    try {
      parseSheet(csv);
    } catch (e) {
      expect(e).toBeInstanceOf(SheetError);
      return (e as Error).message;
    }
    throw new Error('accepted');
  };
  const draftHeader = 'tester,level,attempt,result,time,stars,first_ever,speed,boosters,help,named,log,iv,note';

  it('the draft header without the bot column', () => {
    expect(bad(`${draftHeader}\nS,3,1,W,00:24,3,0,1,0,0,,,,\n`)).toMatch(/missing column\(s\) bot .*reference player median/);
  });

  it('header and row problems', () => {
    expect(bad('')).toMatch(/empty sheet/);
    expect(bad(`${HEADER}\n`)).toMatch(/no data rows/);
    expect(bad(`${HEADER},extra\n`)).toMatch(/unknown column\(s\) extra/);
    expect(bad(sheet('S,3,27.8,1,W,00:24,3,0,1,0,0,,,,,oops'))).toMatch(/^line 2: 16 field\(s\), the header has 15/);
    expect(bad(sheet(win('S', 3, 27.8, 1, '00:24', 3), win('S', 3, 27.8, 1, '00:30', 3)))).toMatch(/^line 3: .*attempt 1 appears twice/);
    expect(bad(sheet('S,3,27.8,1,X,00:24,3,0,1,0,0,,,,'))).toMatch(/^line 2: result "X"/);
    expect(bad(sheet('S,3,27.8,1,W,24s,3,0,1,0,0,,,,'))).toMatch(/^line 2: time "24s" must be mm:ss/);
    expect(bad(sheet('S,3,27.8,1,W,,3,0,1,0,0,,,,'))).toMatch(/^line 2: a win needs a time/);
    expect(bad(sheet('S,3,27.8,1,W,00:24,0,0,1,0,0,,,,'))).toMatch(/^line 2: a win has 1–3 stars/);
    expect(bad(sheet('S,51,27.8,1,W,00:24,3,0,1,0,0,,,,'))).toMatch(/^line 2: level "51"/);
    expect(bad(sheet('S,3,fast,1,W,00:24,3,0,1,0,0,,,,'))).toMatch(/^line 2: bot "fast"/);
    expect(bad(sheet(win('S', 3, 27.8, 1, '00:24', 3), win('T', 3, 30, 1, '00:24', 3)))).toMatch(/^line 3: bot 30 s for level 3 disagrees/);
    expect(bad(sheet('S,17,28.4,1,W,00:41,2,1,1,0,0,blue,green,,'))).toMatch(/^line 2: named "blue"/);
    expect(bad(sheet('S,3,27.8,1,W,00:24,3,0,3,0,0,,,,'))).toMatch(/^line 2: speed "3"/);
  });

  it('a level without any bot cell is rejected by the rules, not guessed', () => {
    expect(() => run(sheet('S,3,,1,W,00:24,3,0,1,0,0,,,,'), { 3: { s3: 25, s2: 60 } })).toThrow(/level 3: no bot median/);
  });

  it('quoted notes, AZ results and colours, time_ms over the card time', () => {
    const p = parseSheet(`${HEADER},time_ms\nS,17,28.4,1,Q,00:41,2,1,1,0,0,qırmızı,yaşıl,,"fast, then lost",41234\n`);
    expect(p.rows[0]).toMatchObject({ result: 'W', named: 'red', log: 'green', note: 'fast, then lost', timeMs: 41_234 });
  });
});

describe('playtestDecide CLI', () => {
  const tsx = join(ROOT, 'node_modules/tsx/dist/cli.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'qa-decide-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const cli = (...args: string[]) => spawnSync(process.execPath, [tsx, 'scripts/playtestDecide.ts', ...args], { cwd: ROOT, encoding: 'utf8' });
  const file = (name: string, text: string): string => {
    const p = join(dir, name);
    writeFileSync(p, text);
    return p;
  };

  it('the worked example with --levels prints the C.1 table and the HUMAN block, exit 0', () => {
    const r = cli(file('2026-11-05-example.csv', EXAMPLE_CSV), '--levels', file('levels.json', JSON.stringify(EXAMPLE_LEVELS)));
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('| 17 | 3 | 25 / 50 | 28.4 | 41 | 1.44 | S | 25 → **30** | PROVISIONAL |');
    expect(r.stdout).toContain('Band 41–50: 3 sampled levels in zone S (45, 49, 50; median r 1.35)');
    expect(r.stdout).toContain('"source": "sheet 2026-11-05"'); // the play date from the file name
    expect(r.stderr).not.toContain('measured'); // --levels supplies the unsampled bots
  });

  it('by default the clocks come from src/levels/*.json', () => {
    const json = readdirSync(join(ROOT, 'src/levels')).find((f) => f.startsWith('003-'))!;
    const lv = JSON.parse(readFileSync(join(ROOT, 'src/levels', json), 'utf8')) as { star3: number; star2: number };
    const r = cli(file('one.csv', sheet(win('S', 3, 27.8, 1, '00:27', 2))));
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(`| 3 | 1 | ${lv.star3 / 1000} / ${lv.star2 / 1000} | 27.8 | 27 |`);
    expect(r.stderr).toContain('no play date');
    const dated = cli(join(dir, 'one.csv'), '--date', '2026-11-07');
    expect(dated.stderr).not.toContain('no play date');
  });

  it('a malformed sheet exits 1 with the line; a bad command line exits 2', () => {
    const r = cli(file('bad.csv', 'tester,level\nS,3\n'));
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/bad\.csv: header \(line 1\): missing column\(s\) bot, attempt/);
    expect(cli().status).toBe(2);
    expect(cli('a.csv', '--bogus').status).toBe(2);
    expect(cli('a.csv', '--levels').stderr).toContain('--levels needs a value');
    expect(cli('a.csv', '--date', '7 Nov').status).toBe(2);
  });
});
