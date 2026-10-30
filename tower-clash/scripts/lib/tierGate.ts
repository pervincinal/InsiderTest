/**
 * Commander tier gate (AUD-B1 gate half, AUD-B17): `npm run playtest -- --tier-gate [--seeds K]` and the
 * single-tier `--upgrades <track>:<tier>` spelling of `--upgrades`.
 *
 * AUD-B1 (2026-10-29): the capacity track scaled the L1 / L2 auto-upgrade thresholds, so one 60-gold
 * tier made level 4 endless and level 6 unwinnable for the first-time line — and no gate caught it,
 * because `--upgrades max` only bounds stars from above and `--naive` ignored `--upgrades` (AUD-B17).
 * The gate runs, in one invocation, the unmodified run and then every tier 1..maxTier of every track
 * with a sim effect *alone* (production, capacity, garrison, march speed; `booster_cost` is a shop
 * price, not a sim modifier, and is not swept): the naive line on levels 1–16 in both tie orders at
 * the default 4 s reaction (the CI naive step's lines) and the reference player on levels 1–16, K seeds
 * each. A tier fails a level when (a) a naive row is under its naive gate share (`naiveGateRate`) *and*
 * under the unmodified row's wins — a level already under its share without upgrades (level 3's
 * `tie desc` row, `NAIVE_TIE_EXEMPT`) is the naive gate's business, not the tier's, unless the tier
 * makes it worse; or (b) the reference player loses a seed the unmodified run won.
 *
 * Pure: the decision (`tierGateFailures`, `worstTierFailure`) is a function of rows, unit-tested with
 * synthetic rows in tests/scripts/tierGate.test.ts; the runner and the table live in scripts/playtest.ts.
 */
import { DEFAULT_MODIFIERS } from '../../src/sim/types';
import type { PlayerModifiers } from '../../src/sim/types';
import { COMMANDER_UPGRADES } from '../../src/economy/catalog';
import type { UpgradeEffectKind } from '../../src/economy/catalog';
import { NAIVE_GATE_LAST, naiveGateMinWins, naiveGateRate } from './naivePlayer';

/** Levels the tier gate covers: the naive gate's bands (1–16). */
export const TIER_GATE_FROM = 1;
export const TIER_GATE_TO = NAIVE_GATE_LAST;
/** Default K of `--tier-gate` (the naive gate's K: 4/5 and 3/5 shares). */
export const TIER_GATE_SEEDS = 5;

/** One Commander tier on its own: `capacity:1` = the capacity track bought once. */
export interface UpgradeTier {
  track: string;
  tier: number;
}

/** Effect kinds the sim reads (`PlayerModifiers`); `boosterDiscount` is a shop price. */
const SIM_EFFECTS: Readonly<Record<UpgradeEffectKind, keyof PlayerModifiers | undefined>> = {
  productionMul: 'productionMul',
  capacityMul: 'capacityMul',
  startingGarrison: 'startGarrisonBonus',
  marchSpeedMul: 'unitSpeedMul',
  boosterDiscount: undefined,
};

/** Catalog tracks with a sim effect, catalog order. */
export function simTracks(): (typeof COMMANDER_UPGRADES)[number][] {
  return COMMANDER_UPGRADES.filter((d) => SIM_EFFECTS[d.effect.kind] !== undefined);
}

/** Catalog tracks without a sim effect (not swept by the gate; refused by `--upgrades <track>:<tier>`). */
export function priceOnlyTracks(): string[] {
  return COMMANDER_UPGRADES.filter((d) => SIM_EFFECTS[d.effect.kind] === undefined).map((d) => d.id);
}

/** `track:tier` → its label (`capacity:1`). */
export function formatUpgradeTier(t: UpgradeTier): string {
  return `${t.track}:${t.tier}`;
}

/**
 * Parse `<track>:<tier>` for `--upgrades`: a catalog track id with a sim effect and 1 ≤ tier ≤ its
 * `maxTier`. Errors start with `bad --upgrades` and list the valid ids and ranges.
 */
export function parseUpgradeTier(spec: string): UpgradeTier {
  const valid = simTracks().map((d) => `${d.id}:1-${d.maxTier}`).join(', ');
  const m = /^([a-z_]+):(\d+)$/.exec(spec);
  if (!m) throw new Error(`bad --upgrades ${spec} (none|max|<track>:<tier>: ${valid})`);
  const track = m[1]!;
  const tier = Number(m[2]);
  const def = COMMANDER_UPGRADES.find((d) => d.id === track);
  if (!def) throw new Error(`bad --upgrades ${spec}: unknown track ${track} (${valid})`);
  if (SIM_EFFECTS[def.effect.kind] === undefined) throw new Error(`bad --upgrades ${spec}: ${track} is a shop price (${def.effect.kind}), not a sim modifier (${valid})`);
  if (tier < 1 || tier > def.maxTier) throw new Error(`bad --upgrades ${spec}: ${track} has tiers 1-${def.maxTier}`);
  return { track, tier };
}

/**
 * The sim modifiers of one track at one tier, every other track at 0: tier × perTier on the track's
 * modifier, rounded as `maxedModifiers` / `modifiersFromSave` round (1e-4; whole units for garrison).
 */
export function tierModifiers(t: UpgradeTier): PlayerModifiers {
  const def = COMMANDER_UPGRADES.find((d) => d.id === t.track);
  const key = def ? SIM_EFFECTS[def.effect.kind] : undefined;
  if (!def || !key || !Number.isInteger(t.tier) || t.tier < 1 || t.tier > def.maxTier) throw new Error(`tier gate: bad tier ${formatUpgradeTier(t)}`);
  const m: PlayerModifiers = { ...DEFAULT_MODIFIERS };
  const v = def.effect.perTier * t.tier;
  if (key === 'startGarrisonBonus') m.startGarrisonBonus += Math.round(v);
  else m[key] = Math.round((m[key] + v) * 1e4) / 1e4;
  return m;
}

/** Every tier of every sim track, catalog order, tier ascending (12 with the shipped catalog). */
export function tierSweep(): UpgradeTier[] {
  return simTracks().flatMap((d) => Array.from({ length: d.maxTier }, (_, i) => ({ track: d.id, tier: i + 1 })));
}

/** The three lines the gate runs per level. */
export type TierGateLine = 'naive' | 'naive tie desc' | 'reference';
export const TIER_GATE_LINES: readonly TierGateLine[] = Object.freeze(['naive', 'naive tie desc', 'reference'] as const);

/** One (level, line) result of a gate run (unmodified or one tier). */
export interface TierGateRow {
  levelId: number;
  name: string;
  line: TierGateLine;
  /** Seeds run (1..K). */
  k: number;
  wins: number;
  /** Seeds not won (lost or still playing at the time cap). */
  losers: number[];
  medianMs?: number;
}

export interface TierGateFailure {
  levelId: number;
  name: string;
  line: TierGateLine;
  wins: number;
  k: number;
  baseWins: number;
  /** Naive lines: the wins the level's share needs; reference: K (every seed the unmodified run won). */
  minWins: number;
  /** Seeds the tier lost that the unmodified run won (reference), or every seed the tier lost (naive). */
  lost: number[];
  /** Human-readable reason, without the `FAIL <tier> lvl N name [line]: ` prefix. */
  why: string;
}

/**
 * The decision: compare one tier's rows with the unmodified rows of the same invocation over levels
 * `from`..`to` (default 1–16) and the three lines. A (level, line) fails when
 *   naive / naive tie desc: wins < the level's naive gate share at that K and wins < the unmodified wins;
 *   reference: the tier lost a seed the unmodified run won.
 * A (level, line) missing from either side is a failure (a partial run cannot pass). One failure per
 * (level, line), level ascending, then `TIER_GATE_LINES` order.
 */
export function tierGateFailures(base: readonly TierGateRow[], tier: readonly TierGateRow[], from = TIER_GATE_FROM, to = TIER_GATE_TO): TierGateFailure[] {
  if (from < 1 || to < from || to > NAIVE_GATE_LAST) throw new Error(`tier gate: bad range ${from}-${to} (1 <= a <= b <= ${NAIVE_GATE_LAST})`);
  const key = (r: Pick<TierGateRow, 'levelId' | 'line'>): string => `${r.levelId}:${r.line}`;
  const index = (rows: readonly TierGateRow[]): Map<string, TierGateRow> => {
    const m = new Map<string, TierGateRow>();
    for (const r of rows) {
      if (m.has(key(r))) throw new Error(`tier gate: duplicate row lvl ${r.levelId} [${r.line}]`);
      m.set(key(r), r);
    }
    return m;
  };
  const b = index(base);
  const t = index(tier);
  const out: TierGateFailure[] = [];
  for (let id = from; id <= to; id++) {
    for (const line of TIER_GATE_LINES) {
      const br = b.get(key({ levelId: id, line }));
      const tr = t.get(key({ levelId: id, line }));
      const name = tr?.name ?? br?.name ?? '(not run)';
      if (!br || !tr) {
        out.push({ levelId: id, name, line, wins: tr?.wins ?? 0, k: tr?.k ?? 0, baseWins: br?.wins ?? 0, minWins: 1, lost: [], why: `not run (${!br ? 'unmodified' : 'tier'} row missing)` });
        continue;
      }
      if (br.k !== tr.k) throw new Error(`tier gate: lvl ${id} [${line}] ran K = ${tr.k} vs unmodified K = ${br.k}`);
      if (line === 'reference') {
        const lost = tr.losers.filter((s) => !br.losers.includes(s));
        if (lost.length) out.push({ levelId: id, name, line, wins: tr.wins, k: tr.k, baseWins: br.wins, minWins: tr.k - br.losers.length, lost, why: `lost seed(s) ${lost.join(',')} the unmodified run won (${tr.wins}/${tr.k} vs ${br.wins}/${br.k})` });
        continue;
      }
      const rate = naiveGateRate(id)!;
      const minWins = naiveGateMinWins(rate, tr.k);
      if (tr.wins < minWins && tr.wins < br.wins) {
        out.push({
          levelId: id,
          name,
          line,
          wins: tr.wins,
          k: tr.k,
          baseWins: br.wins,
          minWins,
          lost: [...tr.losers],
          why: `${tr.wins}/${tr.k} < ${Math.round(rate * 100)}% (need ${minWins}/${tr.k}; unmodified ${br.wins}/${br.k}${tr.losers.length ? `, lost ${tr.losers.join(',')}` : ''})`,
        });
      }
    }
  }
  return out;
}

/** The failure with the largest win drop (unmodified − tier), lowest level first on a tie; undefined for none. */
export function worstTierFailure(failures: readonly TierGateFailure[]): TierGateFailure | undefined {
  let worst: TierGateFailure | undefined;
  for (const f of failures) if (!worst || f.baseWins - f.wins > worst.baseWins - worst.wins) worst = f;
  return worst;
}

/** Distinct level ids among the failures, ascending. */
export function failedLevels(failures: readonly TierGateFailure[]): number[] {
  return [...new Set(failures.map((f) => f.levelId))].sort((a, b) => a - b);
}
