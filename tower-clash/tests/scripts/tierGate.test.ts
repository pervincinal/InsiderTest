import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadLevel } from '../../src/levels/index';
import { DEFAULT_MODIFIERS } from '../../src/sim/index';
import { COMMANDER_UPGRADES } from '../../src/economy/catalog';
import { maxedModifiers } from '../../src/economy/maxUpgrades';
import { NAIVE_REACT_MS, runNaive } from '../../scripts/lib/naivePlayer';
import { parseArgs } from '../../scripts/lib/playtestArgs';
import {
  TIER_GATE_LINES,
  failedLevels,
  formatUpgradeTier,
  parseUpgradeTier,
  priceOnlyTracks,
  tierGateFailures,
  tierModifiers,
  tierSweep,
  worstTierFailure,
} from '../../scripts/lib/tierGate';
import type { TierGateLine, TierGateRow } from '../../scripts/lib/tierGate';
import { runTierGateJobs } from '../../scripts/lib/tierGateRun';

/*
 * AUD-B17 (2026-10-29 audit): `npm run playtest -- --naive --upgrades max` printed `upgrades=none` —
 * the naive runner ignored the flag, which is why AUD-B1 (the capacity track scaling the L1 / L2
 * thresholds: level 4 0/5, level 6 0/5 for the first-time line at one tier) was never measured.
 * AUD-B1's gate half: `--tier-gate` runs every single tier on levels 1–16 against the unmodified run of
 * the same invocation (scripts/lib/tierGate.ts). Red on the pre-fix sim (2026-10-30, K = 5): capacity:1
 * lvl 4 naive 0/5, capacity:3/4/5 lvl 4–7 naive, capacity:5 lvl 8 reference 0/5.
 */

describe('--upgrades <track>:<tier> (AUD-B17)', () => {
  it('parses every catalog track with a sim effect at every tier 1..maxTier', () => {
    const sweep = tierSweep();
    expect(sweep.map(formatUpgradeTier)).toEqual([
      'production:1', 'production:2', 'production:3',
      'capacity:1', 'capacity:2', 'capacity:3', 'capacity:4', 'capacity:5',
      'garrison:1', 'garrison:2',
      'march_speed:1', 'march_speed:2',
    ]);
    for (const t of sweep) expect(parseUpgradeTier(formatUpgradeTier(t))).toEqual(t);
    // the sweep is the catalog: every track but the price-only ones, at every tier
    const swept = new Set(sweep.map((t) => t.track));
    for (const d of COMMANDER_UPGRADES) {
      if (priceOnlyTracks().includes(d.id)) expect(swept.has(d.id)).toBe(false);
      else expect(sweep.filter((t) => t.track === d.id).map((t) => t.tier)).toEqual(Array.from({ length: d.maxTier }, (_, i) => i + 1));
    }
    expect(priceOnlyTracks()).toEqual(['booster_cost']);
  });

  it('rejects unknown tracks, price-only tracks, tiers out of range and malformed specs', () => {
    expect(() => parseUpgradeTier('armor:1')).toThrow(/bad --upgrades armor:1: unknown track armor \(production:1-3, capacity:1-5, garrison:1-2, march_speed:1-2\)/);
    expect(() => parseUpgradeTier('booster_cost:1')).toThrow(/booster_cost is a shop price \(boosterDiscount\), not a sim modifier/);
    expect(() => parseUpgradeTier('capacity:0')).toThrow(/capacity has tiers 1-5/);
    expect(() => parseUpgradeTier('capacity:6')).toThrow(/capacity has tiers 1-5/);
    expect(() => parseUpgradeTier('garrison:3')).toThrow(/garrison has tiers 1-2/);
    for (const bad of ['capacity', 'capacity:', 'capacity:1.5', 'Capacity:1', 'capacity:-1', ':1', 'capacity:1:2']) expect(() => parseUpgradeTier(bad)).toThrow(/^bad --upgrades /);
  });

  it('a tier is tier × perTier on its own modifier, every other modifier at its default', () => {
    expect(tierModifiers({ track: 'capacity', tier: 1 })).toEqual({ ...DEFAULT_MODIFIERS, capacityMul: 1.05 });
    expect(tierModifiers({ track: 'capacity', tier: 3 })).toEqual({ ...DEFAULT_MODIFIERS, capacityMul: 1.15 });
    expect(tierModifiers({ track: 'production', tier: 2 })).toEqual({ ...DEFAULT_MODIFIERS, productionMul: 1.04 });
    expect(tierModifiers({ track: 'garrison', tier: 2 })).toEqual({ ...DEFAULT_MODIFIERS, startGarrisonBonus: 2 });
    expect(tierModifiers({ track: 'march_speed', tier: 1 })).toEqual({ ...DEFAULT_MODIFIERS, unitSpeedMul: 1.02 });
    // each track at its cap is exactly that track's share of maxedModifiers() (the `--upgrades max` source)
    const max = maxedModifiers();
    expect(tierModifiers({ track: 'production', tier: 3 }).productionMul).toBe(max.productionMul);
    expect(tierModifiers({ track: 'capacity', tier: 5 }).capacityMul).toBe(max.capacityMul);
    expect(tierModifiers({ track: 'garrison', tier: 2 }).startGarrisonBonus).toBe(max.startGarrisonBonus);
    expect(tierModifiers({ track: 'march_speed', tier: 2 }).unitSpeedMul).toBe(max.unitSpeedMul);
    expect(() => tierModifiers({ track: 'booster_cost', tier: 1 })).toThrow(/bad tier booster_cost:1/);
    expect(() => tierModifiers({ track: 'capacity', tier: 9 })).toThrow(/bad tier capacity:9/);
  });

  it('runNaive carries the modifiers into the match (AUD-B17: it used to drop them)', async () => {
    const level = (await loadLevel(1))!;
    const plain = runNaive(level, 1, NAIVE_REACT_MS);
    expect(plain.results[0]!.modifiers).toEqual(DEFAULT_MODIFIERS);
    const tiered = runNaive(level, 1, NAIVE_REACT_MS, undefined, 'asc', tierModifiers({ track: 'capacity', tier: 1 }));
    expect(tiered.results[0]!.modifiers.capacityMul).toBe(1.05);
    expect(runNaive(level, 1, NAIVE_REACT_MS, undefined, 'asc', maxedModifiers()).results[0]!.modifiers).toEqual(maxedModifiers());
  });
});

describe('playtest flags: --upgrades on --naive, --tier-gate, --jobs (AUD-B1, AUD-B17)', () => {
  it('reads <track>:<tier> in both spellings; none and max are unchanged', () => {
    expect(parseArgs(['--upgrades', 'capacity:1']).upgrades).toBe('capacity:1');
    expect(parseArgs(['--upgrades=production:2', '--seeds', '5'])).toEqual(parseArgs(['--upgrades', 'production:2', '--seeds=5']));
    expect(parseArgs(['--upgrades', 'max']).upgrades).toBe('max');
    expect(parseArgs([]).upgrades).toBe('none');
    expect(() => parseArgs(['--upgrades', 'some'])).toThrow(/bad --upgrades some \(none\|max\|<track>:<tier>/);
    expect(() => parseArgs(['--upgrades', 'capacity:6'])).toThrow(/bad --upgrades capacity:6: capacity has tiers 1-5/);
  });

  it('--naive takes --upgrades (with --gate, --tie, --follow); the challenge and twist modes refuse it', () => {
    expect(parseArgs(['--naive', '--upgrades', 'max'])).toMatchObject({ naive: true, upgrades: 'max' });
    expect(parseArgs(['--naive', '--seeds', '5', '--gate', '1-16', '--tie', 'both', '--upgrades', 'capacity:1'])).toMatchObject({ upgrades: 'capacity:1', tie: 'both' });
    expect(parseArgs(['--naive', '--level', '10', '--follow', 'prio=fort', '--upgrades', 'garrison:2']).upgrades).toBe('garrison:2');
    expect(() => parseArgs(['--daily', '2026-10-30', '--upgrades', 'max'])).toThrow(/--upgrades does not apply to --daily/);
    expect(() => parseArgs(['--daily', '2026-10-30', '--naive', '--upgrades', 'capacity:1'])).toThrow(/--upgrades does not apply to --daily/);
    expect(() => parseArgs(['--weekly', '2026-10-26', '--upgrades', 'max'])).toThrow(/--upgrades does not apply to --weekly/);
    expect(() => parseArgs(['--twist', 'lean', '--upgrades', 'capacity:1'])).toThrow(/--upgrades does not apply to --twist/);
    expect(parseArgs(['--daily', '2026-10-30', '--upgrades', 'none']).upgrades).toBe('none');
  });

  it('--tier-gate takes only --seeds and --jobs; absent, Args has neither key', () => {
    expect(parseArgs(['--tier-gate'])).toMatchObject({ tierGate: true, seeds: undefined, upgrades: 'none', naive: false });
    expect(parseArgs(['--tier-gate', '--seeds', '3', '--jobs', '2'])).toMatchObject({ tierGate: true, seeds: 3, jobs: 2 });
    expect(parseArgs(['--tier-gate', '--jobs=1']).jobs).toBe(1);
    expect(Object.keys(parseArgs(['--seeds', '5']))).not.toContain('tierGate');
    expect(Object.keys(parseArgs(['--seeds', '5']))).not.toContain('jobs');
    expect(() => parseArgs(['--tier-gate', '--naive'])).toThrow(/--tier-gate takes only --seeds K and --jobs N .*drop --naive/);
    expect(() => parseArgs(['--tier-gate', '--level', '4'])).toThrow(/drop --level/);
    expect(() => parseArgs(['--tier-gate', '--upgrades', 'capacity:1'])).toThrow(/drop --upgrades/);
    expect(() => parseArgs(['--tier-gate', '--seed', '7'])).toThrow(/drop --seed/);
    expect(() => parseArgs(['--tier-gate', '--twist', 'lean'])).toThrow(/drop --twist/);
    expect(() => parseArgs(['--tier-gate', '--daily', '2026-10-30'])).toThrow(/drop --daily/);
    expect(() => parseArgs(['--tier-gate', '--gate', '1-16'])).toThrow(/--gate only applies to --naive/);
    expect(() => parseArgs(['--tier-gate', '--tie', 'both'])).toThrow(/--tie only applies to --naive/);
    expect(() => parseArgs(['--jobs', '2'])).toThrow(/--jobs only applies to --tier-gate/);
    expect(() => parseArgs(['--tier-gate', '--jobs', '0'])).toThrow(/bad --jobs 0/);
    expect(() => parseArgs(['--tier-gate', '--jobs', 'x'])).toThrow(/bad --jobs/);
  });

  it('the runner prints the naive header with the tier (upgrades=none unchanged)', () => {
    const tsx = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));
    const run = (...extra: string[]) =>
      spawnSync(process.execPath, [tsx, 'scripts/playtest.ts', '--naive', '--level', '1', '--seeds', '1', ...extra], { cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8' });
    const tiered = run('--upgrades', 'capacity:1');
    expect(tiered.status, tiered.stderr).toBe(0);
    expect(tiered.stdout).toContain('seeds=1..1  upgrades=capacity:1 (prod x1 cap x1.05 garrison +0 speed x1)  max=180.0s');
    const plain = run();
    expect(plain.status, plain.stderr).toBe(0);
    expect(plain.stdout).toContain('seeds=1..1  upgrades=none  max=180.0s');
  }, 30_000);
});

describe('runTierGateJobs: worker threads do not change a row', () => {
  it('the unmodified run and capacity:1 at K = 1 give the same rows in this thread and on two workers', async () => {
    const jobs = [{ tier: null, k: 1 }, { tier: { track: 'capacity', tier: 1 }, k: 1 }];
    const strip = (rs: Awaited<ReturnType<typeof runTierGateJobs>>) => rs.map(({ rows: r, ticks }) => ({ rows: r, ticks }));
    const local = await runTierGateJobs(jobs, 1);
    const done: number[] = [];
    const workers = await runTierGateJobs(jobs, 2, (i) => done.push(i));
    expect(strip(workers)).toEqual(strip(local));
    expect(done.sort()).toEqual([0, 1]);
    expect(local[0]!.rows.map((r) => `${r.levelId} ${r.line}`)).toEqual(Array.from({ length: 16 }, (_, i) => TIER_GATE_LINES.map((l) => `${i + 1} ${l}`)).flat());
  }, 60_000);
});

/** Synthetic gate rows: every level of `from..to` × the three lines, all seeds won unless overridden. */
function rows(k: number, overrides: Partial<Record<string, { wins: number; losers?: number[] }>> = {}, from = 1, to = 16): TierGateRow[] {
  const out: TierGateRow[] = [];
  for (let id = from; id <= to; id++) {
    for (const line of TIER_GATE_LINES) {
      const o = overrides[`${id}:${line}`];
      const wins = o?.wins ?? k;
      const losers = o?.losers ?? Array.from({ length: k - wins }, (_, i) => k - i).reverse();
      out.push({ levelId: id, name: `L${id}`, line, k, wins, losers });
    }
  }
  return out;
}

describe('tierGateFailures: the "no single tier hurts" decision (AUD-B1)', () => {
  it('identical rows pass', () => {
    expect(tierGateFailures(rows(5), rows(5))).toEqual([]);
  });

  it('a naive row under its share and under the unmodified row fails — the level-4 capacity:1 case', () => {
    const f = tierGateFailures(rows(5), rows(5, { '4:naive': { wins: 0 }, '4:naive tie desc': { wins: 0 } }));
    expect(f.map((x) => `${x.levelId} ${x.line}`)).toEqual(['4 naive', '4 naive tie desc']);
    expect(f[0]).toMatchObject({ wins: 0, k: 5, baseWins: 5, minWins: 4, lost: [1, 2, 3, 4, 5] });
    expect(f[0]!.why).toBe('0/5 < 80% (need 4/5; unmodified 5/5, lost 1,2,3,4,5)');
    expect(failedLevels(f)).toEqual([4]);
  });

  it('a drop that stays at the share passes (4/5 on 1–8, 3/5 on 9–16); one more lost seed fails', () => {
    expect(tierGateFailures(rows(5), rows(5, { '6:naive': { wins: 4 }, '12:naive tie desc': { wins: 3 } }))).toEqual([]);
    const f = tierGateFailures(rows(5), rows(5, { '6:naive': { wins: 3 }, '12:naive tie desc': { wins: 2 } }));
    expect(f.map((x) => `${x.levelId} ${x.line} ${x.minWins}`)).toEqual(['6 naive 4', '12 naive tie desc 3']);
    expect(f[1]!.why).toMatch(/^2\/5 < 60% \(need 3\/5; unmodified 5\/5/);
  });

  it('a row already under its share without upgrades fails only when the tier does worse (level 3 tie desc)', () => {
    const base = rows(5, { '3:naive tie desc': { wins: 0 }, '9:naive': { wins: 2 } });
    expect(tierGateFailures(base, rows(5, { '3:naive tie desc': { wins: 0 }, '9:naive': { wins: 2, losers: [1, 2, 3] } }))).toEqual([]);
    expect(tierGateFailures(base, rows(5, { '3:naive tie desc': { wins: 0 }, '9:naive': { wins: 4 } }))).toEqual([]); // better is fine
    const f = tierGateFailures(base, rows(5, { '3:naive tie desc': { wins: 0 }, '9:naive': { wins: 1 } }));
    expect(f.map((x) => `${x.levelId} ${x.line} ${x.baseWins}->${x.wins}`)).toEqual(['9 naive 2->1']);
  });

  it('the reference player fails on any seed the unmodified run won, not on a seed it already lost', () => {
    const f = tierGateFailures(rows(5), rows(5, { '8:reference': { wins: 0 } }));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ levelId: 8, line: 'reference', wins: 0, baseWins: 5, lost: [1, 2, 3, 4, 5] });
    expect(f[0]!.why).toBe('lost seed(s) 1,2,3,4,5 the unmodified run won (0/5 vs 5/5)');
    // one lost seed is enough on the reference line (no share)
    expect(tierGateFailures(rows(5), rows(5, { '14:reference': { wins: 4, losers: [2] } })).map((x) => x.lost)).toEqual([[2]]);
    // a seed the unmodified run lost too is not the tier's
    const base = rows(5, { '14:reference': { wins: 4, losers: [2] } });
    expect(tierGateFailures(base, rows(5, { '14:reference': { wins: 4, losers: [2] } }))).toEqual([]);
    expect(tierGateFailures(base, rows(5, { '14:reference': { wins: 3, losers: [2, 5] } })).map((x) => x.lost)).toEqual([[5]]);
  });

  it('a level or line missing from either side fails (a partial run cannot pass)', () => {
    const tier = rows(5).filter((r) => !(r.levelId === 16 && r.line === 'reference'));
    const f = tierGateFailures(rows(5), tier);
    expect(f.map((x) => `${x.levelId} ${x.line} ${x.why}`)).toEqual(['16 reference not run (tier row missing)']);
    expect(tierGateFailures(rows(5, {}, 1, 15), rows(5)).map((x) => `${x.levelId} ${x.line}`)).toEqual(['16 naive', '16 naive tie desc', '16 reference']);
  });

  it('refuses a K mismatch, duplicate rows and a range past 16', () => {
    expect(() => tierGateFailures(rows(5), rows(3))).toThrow(/ran K = 3 vs unmodified K = 5/);
    expect(() => tierGateFailures(rows(5), [...rows(5), rows(5)[0]!])).toThrow(/duplicate row lvl 1 \[naive\]/);
    expect(() => tierGateFailures(rows(5), rows(5), 1, 17)).toThrow(/bad range 1-17/);
  });

  it('failures come in level order, then naive / naive tie desc / reference; worst = the largest win drop', () => {
    const f = tierGateFailures(
      rows(5),
      rows(5, { '7:naive tie desc': { wins: 2 }, '4:naive': { wins: 0 }, '4:reference': { wins: 4, losers: [3] }, '6:naive': { wins: 0 } }),
    );
    expect(f.map((x) => `${x.levelId} ${x.line}`)).toEqual(['4 naive', '4 reference', '6 naive', '7 naive tie desc']);
    expect(worstTierFailure(f)).toMatchObject({ levelId: 4, line: 'naive' as TierGateLine }); // 5 → 0, ties with level 6: lowest level
    expect(failedLevels(f)).toEqual([4, 6, 7]);
    expect(worstTierFailure([])).toBeUndefined();
  });

  it('works at other K (the share scales: 8/10 and 6/10)', () => {
    expect(tierGateFailures(rows(10), rows(10, { '2:naive': { wins: 8 }, '10:naive': { wins: 6 } }))).toEqual([]);
    expect(tierGateFailures(rows(10), rows(10, { '2:naive': { wins: 7 }, '10:naive': { wins: 5 } })).map((x) => x.minWins)).toEqual([8, 6]);
  });
});
