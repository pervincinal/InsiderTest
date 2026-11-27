import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED, parseArgs } from '../../scripts/lib/playtestArgs';
import { DEFAULT_POOL } from '../../scripts/lib/daily';
import { NAIVE_REACT_MS } from '../../scripts/lib/naivePlayer';

/*
 * `npm run playtest` flag rules (scripts/lib/playtestArgs.ts). QA-7 added `--naive` as a line switch
 * on `--daily` / `--weekly`; the older rules (separate modes, `--gate` / `--react` / `--pool` scoping)
 * are pinned here too so the extraction out of scripts/playtest.ts changed nothing.
 */
describe('playtest command line', () => {
  it('defaults: campaign, seed 1, no seeds sweep, no upgrades, twist on, default pool and reaction', () => {
    expect(parseArgs([])).toEqual({
      level: undefined,
      seed: DEFAULT_SEED,
      seeds: undefined,
      upgrades: 'none',
      daily: undefined,
      days: 1,
      twist: true,
      twistId: undefined,
      pool: DEFAULT_POOL,
      weekly: undefined,
      weeks: 1,
      naive: false,
      reactMs: NAIVE_REACT_MS,
      gate: undefined,
    });
  });

  it('reads both `--flag value` and `--flag=value` forms', () => {
    const a = parseArgs(['--level', '12', '--seeds', '5', '--upgrades', 'max']);
    const b = parseArgs(['--level=12', '--seeds=5', '--upgrades=max']);
    expect(a).toEqual(b);
    expect(a.level).toBe(12);
    expect(a.seeds).toBe(5);
    expect(a.upgrades).toBe('max');
  });

  describe('QA-7: --naive on the daily and the weekly', () => {
    it('--daily D --days N --naive is the naive line on each day (react optional, defaults to 4000 ms)', () => {
      const args = parseArgs(['--daily', '2026-09-25', '--days', '14', '--naive']);
      expect(args.naive).toBe(true);
      expect(args.daily).toBe('2026-09-25');
      expect(args.days).toBe(14);
      expect(args.weekly).toBeUndefined();
      expect(args.twistId).toBeUndefined();
      expect(args.reactMs).toBe(NAIVE_REACT_MS);
      expect(args.gate).toBeUndefined();
      expect(parseArgs(['--daily=2026-09-25', '--naive', '--react', '8000', '--seeds=5']).reactMs).toBe(8000);
    });

    it('--weekly <Monday> --weeks N --naive is the naive line on each week; --no-twist stays the control', () => {
      const args = parseArgs(['--weekly', '2026-09-21', '--weeks', '8', '--naive', '--seeds', '5']);
      expect(args.naive).toBe(true);
      expect(args.weekly).toBe('2026-09-21');
      expect(args.weeks).toBe(8);
      expect(args.seeds).toBe(5);
      expect(args.twist).toBe(true);
      expect(parseArgs(['--weekly', '2026-09-21', '--naive', '--no-twist']).twist).toBe(false);
      expect(parseArgs(['--daily', '2026-09-25', '--naive', '--no-twist']).twist).toBe(false);
    });

    it('the flag order does not matter', () => {
      expect(parseArgs(['--naive', '--daily', '2026-09-25'])).toEqual(parseArgs(['--daily', '2026-09-25', '--naive']));
      expect(parseArgs(['--naive', '--weeks', '2', '--weekly', '2026-09-21'])).toEqual(parseArgs(['--weekly', '2026-09-21', '--naive', '--weeks', '2']));
    });

    it('--gate belongs to the campaign naive run only (the challenge tables are informational)', () => {
      expect(() => parseArgs(['--daily', '2026-09-25', '--naive', '--gate', '1-16'])).toThrow(/--gate only applies to the campaign naive run/);
      expect(() => parseArgs(['--weekly', '2026-09-21', '--naive', '--gate', '1-16'])).toThrow(/--gate only applies to the campaign naive run/);
      expect(parseArgs(['--naive', '--gate', '1-16']).gate).toEqual({ from: 1, to: 16 });
    });

    it('--level does not apply to a challenge naive run (the challenge picks the level)', () => {
      expect(() => parseArgs(['--daily', '2026-09-25', '--naive', '--level', '12'])).toThrow(/--level does not apply to --naive with --daily/);
      expect(() => parseArgs(['--weekly', '2026-09-21', '--naive', '--level=40'])).toThrow(/--level does not apply to --naive with --weekly/);
      expect(parseArgs(['--naive', '--level', '12']).level).toBe(12);
    });

    it('--naive with --twist is still refused; --daily / --weekly / --twist still exclude each other', () => {
      expect(() => parseArgs(['--twist', 'lean', '--naive'])).toThrow(/--twist and --naive are separate modes/);
      expect(() => parseArgs(['--daily', '2026-09-25', '--weekly', '2026-09-21'])).toThrow(/--daily and --weekly are separate modes/);
      expect(() => parseArgs(['--twist', 'lean', '--daily', '2026-09-25'])).toThrow(/--twist and --daily are separate modes/);
      expect(() => parseArgs(['--twist', 'lean', '--weekly', '2026-09-21', '--naive'])).toThrow(/separate modes/);
    });

    it('the challenge keys are still validated under --naive (YYYY-MM-DD, weekly = a real Monday)', () => {
      expect(() => parseArgs(['--daily', '25-09-2026', '--naive'])).toThrow(/bad --daily/);
      expect(() => parseArgs(['--weekly', '2026-09-25', '--naive'])).toThrow(/not a Monday/);
      expect(() => parseArgs(['--weekly', '2026-02-30', '--naive'])).toThrow(/not a Monday/);
      expect(() => parseArgs(['--daily', '2026-09-25', '--days', '0', '--naive'])).toThrow(/bad --days/);
      expect(() => parseArgs(['--weekly', '2026-09-21', '--weeks', '1.5', '--naive'])).toThrow(/bad --weeks/);
    });
  });

  describe('older scoping rules, unchanged by the extraction', () => {
    it('--react and --gate need --naive; --gate refuses a non-default reaction and a --level outside its range', () => {
      expect(() => parseArgs(['--react', '8000'])).toThrow(/--react only applies to --naive/);
      expect(() => parseArgs(['--gate', '1-8'])).toThrow(/--gate only applies to --naive/);
      expect(() => parseArgs(['--naive', '--gate', '1-8', '--react', '8000'])).toThrow(/drop --react/);
      expect(() => parseArgs(['--naive', '--gate', '1-8', '--level', '12'])).toThrow(/outside --gate/);
      expect(() => parseArgs(['--naive', '--react', '4010'])).toThrow(/bad --react/);
      expect(parseArgs(['--naive', '--react', '8000']).reactMs).toBe(8000);
    });

    it('--pool needs --twist; --twist takes a known id', () => {
      expect(() => parseArgs(['--pool', '1-50'])).toThrow(/--pool only applies to --twist/);
      expect(() => parseArgs(['--twist', 'sideways'])).toThrow(/bad --twist sideways/);
      expect(parseArgs(['--twist', 'lean', '--pool', '36-36'])).toMatchObject({ twistId: 'lean', pool: { from: 36, to: 36 } });
    });

    it('rejects malformed numbers and upgrades', () => {
      expect(() => parseArgs(['--level', 'x'])).toThrow(/bad --level/);
      expect(() => parseArgs(['--seed', '1.5'])).toThrow(/bad --seed/);
      expect(() => parseArgs(['--seeds', '0'])).toThrow(/bad --seeds/);
      expect(() => parseArgs(['--upgrades', 'some'])).toThrow(/bad --upgrades/);
    });
  });

  /*
   * REV-0k (Producer review 11, 2026-11-27): the gate tooling's command line. Every invocation CI
   * (.github/workflows/tower-clash-ci.yml), scripts/producer/chain.sh and the playtest skill run must
   * still parse — pinned in "real invocations" below.
   */
  describe('REV-0k: no flag is dropped or ignored silently', () => {
    it('REV-68: a misspelt or unknown flag, a stray word and a value on a switch throw `unknown argument`', () => {
      expect(() => parseArgs(['--tiergate'])).toThrow(/^unknown argument --tiergate \(flags: /);
      expect(() => parseArgs(['--naive', '--seeds', '5', '--gate', '1-16', '--tie', 'both', '--tie-exmpt', '3'])).toThrow(/unknown argument --tie-exmpt/);
      expect(() => parseArgs(['--seeds=5', '--levels=3'])).toThrow(/unknown argument --levels=3/);
      expect(() => parseArgs(['naive'])).toThrow(/unknown argument naive/);
      expect(() => parseArgs(['--naive=yes'])).toThrow(/--naive takes no value/);
    });

    it('REV-68: a value flag as the last argument or before another flag throws `missing value`', () => {
      expect(() => parseArgs(['--naive', '--seeds'])).toThrow('missing value for --seeds');
      expect(() => parseArgs(['--seeds', '--naive'])).toThrow('missing value for --seeds');
      expect(() => parseArgs(['--naive', '--seeds', '5', '--gate'])).toThrow('missing value for --gate');
      expect(() => parseArgs(['--level'])).toThrow('missing value for --level');
      expect(() => parseArgs(['--tier-gate', '--jobs'])).toThrow('missing value for --jobs');
    });

    it('REV-74: --seed only with the single-seed campaign run', () => {
      expect(parseArgs(['--level', '12', '--seed', '3'])).toMatchObject({ level: 12, seed: 3 });
      expect(parseArgs(['--seed=1']).seed).toBe(1);
      expect(() => parseArgs(['--seeds', '5', '--seed', '3'])).toThrow(/--seed only applies to the single-seed campaign run; --seeds K \(seeds 1\.\.K\) does not read it/);
      expect(() => parseArgs(['--naive', '--seed', '3'])).toThrow(/--naive \(seeds 1\.\.K\) does not read it/);
      expect(() => parseArgs(['--daily', '2026-09-25', '--seed', '3'])).toThrow(/--daily \(K seeds from the fixed one\) does not read it/);
      expect(() => parseArgs(['--weekly', '2026-09-21', '--naive', '--seed', '3'])).toThrow(/--seed only applies to the single-seed campaign run/);
      expect(() => parseArgs(['--twist', 'lean', '--seed', '1'])).toThrow(/--twist \(seeds 1\.\.K\) does not read it/);
      expect(() => parseArgs(['--tier-gate', '--seed', '1'])).toThrow(/drop --seed/); // the default value too: the flag was given
    });

    it('REV-74: --days / --weeks / --no-twist only with their mode', () => {
      expect(() => parseArgs(['--days', '30'])).toThrow('--days only applies to --daily');
      expect(() => parseArgs(['--weekly', '2026-09-21', '--days', '2'])).toThrow('--days only applies to --daily');
      expect(() => parseArgs(['--naive', '--weeks', '1'])).toThrow('--weeks only applies to --weekly');
      expect(() => parseArgs(['--daily', '2026-09-25', '--weeks', '4'])).toThrow('--weeks only applies to --weekly');
      expect(() => parseArgs(['--no-twist'])).toThrow(/--no-twist only applies to --daily \/ --weekly/);
      expect(() => parseArgs(['--twist', 'lean', '--no-twist'])).toThrow(/--no-twist only applies/);
      expect(parseArgs(['--daily', '2026-09-25', '--days', '30', '--no-twist'])).toMatchObject({ days: 30, twist: false });
      expect(parseArgs(['--weekly', '2026-09-21', '--weeks', '26', '--no-twist'])).toMatchObject({ weeks: 26, twist: false });
    });

    it('REV-66: --level N narrows --gate a-b to N-N (the other levels of a-b would count as "(not run)" failures)', () => {
      expect(parseArgs(['--naive', '--level', '12', '--seeds', '5', '--gate', '12-12']).gate).toEqual({ from: 12, to: 12 });
      expect(parseArgs(['--naive', '--level', '12', '--seeds', '5', '--gate', '1-16']).gate).toEqual({ from: 12, to: 12 });
      expect(parseArgs(['--naive', '--level=3', '--gate=1-8', '--tie', 'both']).gate).toEqual({ from: 3, to: 3 });
      expect(parseArgs(['--naive', '--seeds', '5', '--gate', '1-16']).gate).toEqual({ from: 1, to: 16 });
      expect(() => parseArgs(['--naive', '--level', '12', '--gate', '1-8'])).toThrow('--level 12 is outside --gate 1-8');
    });

    it('real invocations still parse: CI workflow, scripts/producer/chain.sh, package scripts, the playtest skill', () => {
      const real: string[][] = [
        [], // CI "Headless playtest", npm run playtest
        ['--daily', '2026-11-27', '--days', '90', '--seeds', '3'], // CI "Daily challenge gate"
        ['--weekly', '2026-11-23', '--weeks', '26', '--seeds', '5'], // CI "Weekly challenge gate"
        ...['plain', 'lean', 'fastFeet', 'thinWalls', 'reinforced'].map((t) => ['--twist', t, '--seeds', '5']), // CI "Twist pool gate"
        ['--naive', '--seeds', '5', '--gate', '1-16', '--tie', 'both'], // CI "Naive human gate", chain.sh
        ['--tier-gate', '--seeds', '5'], // CI "Commander tier gate", chain.sh
        ['--seeds', '3'], // chain.sh
        ['--level', '12', '--seed', '3'],
        ['--seeds', '100'],
        ['--daily', '2026-09-18', '--days', '30', '--no-twist'],
        ['--weekly', '2026-09-21', '--weeks', '26', '--no-twist'],
        ['--twist', 'lean', '--seeds', '50', '--pool', '36-36'],
        ['--naive', '--seeds', '5', '--react', '8000'],
        ['--naive', '--level', '12', '--seeds', '5', '--gate', '12-12'],
        ['--naive', '--level', '4', '--seeds', '5', '--tie', 'both', '--upgrades', 'capacity:1'],
        ['--naive', '--level', '42', '--follow', 'hold=home@3', '--seeds', '20', '--tie', 'both'],
        ['--daily', '2027-01-12', '--days', '1', '--naive'],
        ['--weekly', '2026-11-16', '--weeks', '1', '--naive', '--seeds', '20'],
        ['--upgrades', 'max', '--seeds', '20'],
        ['--level', '50', '--seed', '1'], // e2e/perf.spec.ts note
        ['--tier-gate', '--seeds', '5', '--jobs', '4'],
      ];
      for (const argv of real) expect(() => parseArgs(argv), argv.join(' ')).not.toThrow();
    });
  });

  describe('REV-0k: the runner (scripts/playtest.ts)', () => {
    const tsx = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));
    const run = (...argv: string[]) => spawnSync(process.execPath, [tsx, 'scripts/playtest.ts', ...argv], { cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8' });

    it('REV-68: a misspelt mode flag exits 1 before running anything (it used to run the default campaign and exit 0)', () => {
      const r = run('--tiergate');
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('unknown argument --tiergate');
      expect(r.stdout).toBe('');
    }, 30_000);

    it('REV-66: --naive --level 12 --gate 1-16 gates level 12 only and exits 0 when it passes', () => {
      const r = run('--naive', '--level', '12', '--seeds', '1', '--gate', '1-16');
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toContain('(gate lvl 12-12: wins/K >= 60%)');
      expect(r.stdout).toContain('naive gate lvl 12-12: 0 failed level(s)');
      expect(r.stdout).not.toContain('(not run)');
    }, 30_000);

    it('REV-70: the --gate 5-12 header labels the bands of 5-12, not 1-8 / 9-16', () => {
      const r = run('--naive', '--seeds', '1', '--gate', '5-12');
      expect(r.stdout.split('\n')[0]).toContain('(gate lvl 5-12: wins/K >= 80% (lvl 5-8) / >= 60% (lvl 9-12))');
      expect(r.stdout).toMatch(/^naive gate lvl 5-12: \d+ failed level\(s\)$/m);
    }, 60_000);
  });
});
