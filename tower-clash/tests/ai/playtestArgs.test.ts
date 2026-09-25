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
});
