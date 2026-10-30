/**
 * Command line of `npm run playtest` (scripts/playtest.ts), kept pure so the flag rules are unit-tested
 * (tests/ai/playtestArgs.test.ts): the script itself runs `main()` on import.
 *
 * Modes: campaign (default; `--level`, `--seed` / `--seeds`, `--upgrades`), `--daily D`, `--weekly M`,
 * `--twist <id>` and `--naive`. `--twist`, `--daily` and `--weekly` exclude each other; `--naive` is a
 * mode of its own on the campaign and a *line switch* on `--daily` / `--weekly` (QA-7: the naive human
 * line on each day's / week's challenge, informational, no gate) — it cannot be combined with `--twist`.
 * `--gate a-b` belongs to the campaign naive run only (the CI gate is defined per level, not per day);
 * `--react MS` to any naive run; `--pool a-b` to `--twist`; `--no-twist` to `--daily` / `--weekly`.
 * GD-6h: `--follow "prio=a,b;hold=c[@N];noprioFrom=d"` (or the shorthands `--prefer a,b` / `--hold c[@N]`) turns
 * the campaign naive run of one level (`--level N`) into the literal card follower; never with `--gate`.
 * GD-7f: `--tie asc|desc|both` picks the naive line's id order on an exact target tie (campaign `--naive`
 * only, with or without `--follow`): `asc` (default) is today's line, `desc` the reversed one, `both`
 * prints an extra `tie desc` row per level; with `--gate` only `asc` (today's CI step) or `both` (a level
 * fails when either order is under its share) — `--gate --tie desc` would drop the gated line and is refused.
 * QA-30: `--tie-exempt a[,b]` (only with `--gate … --tie both`, ids inside the gate range and in
 * `NAIVE_TIE_EXEMPT`) skips those levels' `tie desc` row in the gate — levels cured by a tutorial steer.
 * AUD-B17 (QA 2026-10-30): `--upgrades none|max|<track>:<tier>` applies to the campaign reference run and
 * to the campaign `--naive` run (before, `--naive` ignored it); `<track>:<tier>` is one catalog track at
 * one tier, the rest at 0 (`parseUpgradeTier`, scripts/lib/tierGate.ts). The challenge and twist modes
 * run without Commander upgrades by definition and refuse anything but `none`.
 * AUD-B1: `--tier-gate [--seeds K] [--jobs N]` (campaign, default K = 5) is the "no single tier hurts"
 * gate; `--jobs N` (only with it; default: the host's parallelism) sets its worker threads. It takes no other flag.
 */
import { C } from '../../src/sim/index';
import { TWISTS, isMondayKey } from '../../src/daily/challenge';
import type { Twist } from '../../src/daily/challenge';
import { DEFAULT_POOL, parsePool, twistById } from './daily';
import type { PoolRange } from './daily';
import { NAIVE_REACT_MS, parseFollowSpec, parseNaiveGate, parseTieExempt } from './naivePlayer';
import type { FollowSpec, NaiveGateRange, NaiveTie } from './naivePlayer';
import { parseUpgradeTier } from './tierGate';

export const DEFAULT_SEED = 1;

/** `--upgrades`: none, every track maxed, or one track at one tier (`capacity:1`, validated by `parseUpgradeTier`). */
export type Upgrades = 'none' | 'max' | `${string}:${number}`;

/** GD-7f `--tie`: one tie order, or `both` (the `asc` row plus an extra `tie desc` row per level). */
export type TieMode = NaiveTie | 'both';
const TIE_MODES: readonly TieMode[] = ['asc', 'desc', 'both'];

/** The tie orders a `--tie` mode runs, in print order (`asc` first). */
export function tiesOf(mode: TieMode): NaiveTie[] {
  return mode === 'both' ? ['asc', 'desc'] : [mode];
}

export interface Args {
  level?: number;
  seed: number;
  seeds?: number;
  upgrades: Upgrades;
  /** `--daily D`: first day key of the daily-challenge sweep. */
  daily?: string;
  /** `--days N`: number of consecutive days from `daily`. */
  days: number;
  /** `--no-twist`: daily / weekly mode without the twist modifiers (control run). */
  twist: boolean;
  /** `--twist <id>`: pool × twist sweep under this twist. */
  twistId?: Twist['id'];
  /** `--pool a-b`: level id range for the twist sweep (default `DEFAULT_POOL`). */
  pool: Readonly<PoolRange>;
  /** `--weekly M`: first Monday key of the weekly-challenge sweep. */
  weekly?: string;
  /** `--weeks N`: number of consecutive weeks from `weekly`. */
  weeks: number;
  /** `--naive`: naive human line — over every level, or on each day's / week's challenge with `--daily` / `--weekly` (informational). */
  naive: boolean;
  /** `--react MS`: reaction delay of the naive line, ms of sim time. */
  reactMs: number;
  /** `--gate a-b`: campaign naive gate over level ids a..b (1–NAIVE_GATE_LAST); undefined = informational. */
  gate?: NaiveGateRange;
  /** `--follow SPEC` / `--prefer a,b` / `--hold c` (GD-6h): the literal card follower on `--level N`; undefined = the plain naive line. */
  follow?: FollowSpec;
  /** `--tie desc|both` (GD-7f): naive tie order(s); absent = `asc`, today's line (`--tie asc` leaves it absent too). */
  tie?: Exclude<TieMode, 'asc'>;
  /** `--tie-exempt a[,b]` (QA-30): gate levels whose `tie desc` row is not gated (`NAIVE_TIE_EXEMPT`); absent = none. */
  tieExempt?: number[];
  /** `--tier-gate` (AUD-B1): every single Commander tier on levels 1–16, naive line and reference player; absent = off. */
  tierGate?: true;
  /** `--jobs N` (only with `--tier-gate`): worker threads; absent = the host's parallelism. Never changes a row. */
  jobs?: number;
}

export function parseArgs(argv: readonly string[]): Args {
  let level: number | undefined;
  let seed = DEFAULT_SEED;
  let seeds: number | undefined;
  let upgrades = 'none';
  let daily: string | undefined;
  let days = 1;
  let twist = true;
  let twistId: string | undefined;
  let poolSpec: string | undefined;
  let weekly: string | undefined;
  let weeks = 1;
  let naive = false;
  let reactMs = NAIVE_REACT_MS;
  let gateSpec: string | undefined;
  let followSpec: string | undefined;
  let prefer: string | undefined;
  let holdIds: string | undefined;
  let tieSpec: string | undefined;
  let tieExemptSpec: string | undefined;
  let tierGate = false;
  let jobs: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    if (arg === '--level' && next !== undefined) level = Number(next);
    else if (arg.startsWith('--level=')) level = Number(arg.slice('--level='.length));
    else if (arg === '--seeds' && next !== undefined) seeds = Number(next);
    else if (arg.startsWith('--seeds=')) seeds = Number(arg.slice('--seeds='.length));
    else if (arg === '--seed' && next !== undefined) seed = Number(next);
    else if (arg.startsWith('--seed=')) seed = Number(arg.slice('--seed='.length));
    else if (arg === '--upgrades' && next !== undefined) upgrades = next;
    else if (arg.startsWith('--upgrades=')) upgrades = arg.slice('--upgrades='.length);
    else if (arg === '--daily' && next !== undefined) daily = next;
    else if (arg.startsWith('--daily=')) daily = arg.slice('--daily='.length);
    else if (arg === '--days' && next !== undefined) days = Number(next);
    else if (arg.startsWith('--days=')) days = Number(arg.slice('--days='.length));
    else if (arg === '--no-twist') twist = false;
    else if (arg === '--twist' && next !== undefined) twistId = next;
    else if (arg.startsWith('--twist=')) twistId = arg.slice('--twist='.length);
    else if (arg === '--pool' && next !== undefined) poolSpec = next;
    else if (arg.startsWith('--pool=')) poolSpec = arg.slice('--pool='.length);
    else if (arg === '--weekly' && next !== undefined) weekly = next;
    else if (arg.startsWith('--weekly=')) weekly = arg.slice('--weekly='.length);
    else if (arg === '--weeks' && next !== undefined) weeks = Number(next);
    else if (arg.startsWith('--weeks=')) weeks = Number(arg.slice('--weeks='.length));
    else if (arg === '--naive') naive = true;
    else if (arg === '--react' && next !== undefined) reactMs = Number(next);
    else if (arg.startsWith('--react=')) reactMs = Number(arg.slice('--react='.length));
    else if (arg === '--gate' && next !== undefined) gateSpec = next;
    else if (arg.startsWith('--gate=')) gateSpec = arg.slice('--gate='.length);
    else if (arg === '--follow' && next !== undefined) followSpec = next;
    else if (arg.startsWith('--follow=')) followSpec = arg.slice('--follow='.length);
    else if (arg === '--prefer' && next !== undefined) prefer = next;
    else if (arg.startsWith('--prefer=')) prefer = arg.slice('--prefer='.length);
    else if (arg === '--hold' && next !== undefined) holdIds = next;
    else if (arg.startsWith('--hold=')) holdIds = arg.slice('--hold='.length);
    else if (arg === '--tie' && next !== undefined) tieSpec = next;
    else if (arg.startsWith('--tie=')) tieSpec = arg.slice('--tie='.length);
    else if (arg === '--tie-exempt' && next !== undefined) tieExemptSpec = next;
    else if (arg.startsWith('--tie-exempt=')) tieExemptSpec = arg.slice('--tie-exempt='.length);
    else if (arg === '--tier-gate') tierGate = true;
    else if (arg === '--jobs' && next !== undefined) jobs = Number(next);
    else if (arg.startsWith('--jobs=')) jobs = Number(arg.slice('--jobs='.length));
  }
  if (level !== undefined && !Number.isInteger(level)) throw new Error(`bad --level ${String(level)}`);
  if (!Number.isInteger(seed)) throw new Error(`bad --seed ${String(seed)}`);
  if (seeds !== undefined && (!Number.isInteger(seeds) || seeds < 1)) throw new Error(`bad --seeds ${String(seeds)}`);
  if (upgrades !== 'none' && upgrades !== 'max') parseUpgradeTier(upgrades); // throws `bad --upgrades …` with the valid tracks and tiers
  if (daily !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(daily)) throw new Error(`bad --daily ${daily} (YYYY-MM-DD)`);
  if (!Number.isInteger(days) || days < 1) throw new Error(`bad --days ${String(days)}`);
  if (weekly !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(weekly)) throw new Error(`bad --weekly ${weekly} (YYYY-MM-DD, a Monday)`);
  if (weekly !== undefined && !isMondayKey(weekly)) {
    throw new Error(`bad --weekly ${weekly}: not a Monday (UTC). The weekly key is the week's Monday, e.g. 2026-09-21 (\`date -u -d "-$(( $(date -u +%u) - 1 )) days" +%F\`).`);
  }
  if (!Number.isInteger(weeks) || weeks < 1) throw new Error(`bad --weeks ${String(weeks)}`);
  const twistDef = twistId === undefined ? undefined : twistById(twistId);
  if (twistId !== undefined && !twistDef) throw new Error(`bad --twist ${twistId} (${TWISTS.map((t) => t.id).join('|')})`);
  const modes = [twistDef ? '--twist' : undefined, daily !== undefined ? '--daily' : undefined, weekly !== undefined ? '--weekly' : undefined].filter((m) => m !== undefined);
  if (modes.length > 1) throw new Error(`${modes.join(' and ')} are separate modes`);
  // QA-7: --naive rides on --daily / --weekly (the naive line on each challenge); the twist sweep stays the reference player's
  if (naive && twistDef) throw new Error('--twist and --naive are separate modes');
  // AUD-B17: a flag that changes nothing must not be accepted silently — the challenges and the twist sweep have no upgrades
  const noUpgradeMode = modes[0];
  if (upgrades !== 'none' && noUpgradeMode !== undefined) throw new Error(`--upgrades does not apply to ${noUpgradeMode} (it runs without Commander upgrades); use the campaign run or --naive`);
  // AUD-B1: the tier gate is a campaign mode of its own with a fixed scope (every tier, levels 1–16, both naive tie orders + the reference player)
  if (tierGate) {
    const other = [
      naive ? '--naive' : undefined,
      ...modes,
      level !== undefined ? '--level' : undefined,
      upgrades !== 'none' ? '--upgrades' : undefined,
      seed !== DEFAULT_SEED ? '--seed' : undefined,
    ].filter((m) => m !== undefined);
    if (other.length) throw new Error(`--tier-gate takes only --seeds K and --jobs N (it runs every tier of every track on levels 1-16); drop ${other.join(', ')}`);
  }
  if (jobs !== undefined && (!Number.isInteger(jobs) || jobs < 1)) throw new Error(`bad --jobs ${String(jobs)}`);
  if (jobs !== undefined && !tierGate) throw new Error('--jobs only applies to --tier-gate');
  const challengeNaive = naive && (daily !== undefined || weekly !== undefined);
  if (challengeNaive && level !== undefined) throw new Error(`--level does not apply to --naive with ${daily !== undefined ? '--daily' : '--weekly'} (the challenge picks the level)`);
  const pool = poolSpec === undefined ? DEFAULT_POOL : parsePool(poolSpec);
  if (poolSpec !== undefined && !twistDef) throw new Error('--pool only applies to --twist');
  if (!Number.isInteger(reactMs) || reactMs < C.TICK_MS || reactMs % C.TICK_MS !== 0) throw new Error(`bad --react ${String(reactMs)} (ms, a positive multiple of ${C.TICK_MS})`);
  if (reactMs !== NAIVE_REACT_MS && !naive) throw new Error('--react only applies to --naive');
  const gate = gateSpec === undefined ? undefined : parseNaiveGate(gateSpec);
  if (gate && !naive) throw new Error('--gate only applies to --naive');
  if (gate && challengeNaive) throw new Error(`--gate only applies to the campaign naive run, not to --naive with ${daily !== undefined ? '--daily' : '--weekly'} (informational, no gate)`);
  if (gate && reactMs !== NAIVE_REACT_MS) throw new Error(`--gate is defined at the default reaction (${NAIVE_REACT_MS} ms); drop --react`);
  if (gate && level !== undefined && (level < gate.from || level > gate.to)) throw new Error(`--level ${level} is outside --gate ${gate.from}-${gate.to}`);
  // GD-6h: the card follower — `--follow` or its shorthands, the naive campaign run of one level, informational
  if (followSpec !== undefined && (prefer !== undefined || holdIds !== undefined)) throw new Error('--follow and --prefer / --hold are two spellings of one spec; use one');
  const shorthand = [prefer !== undefined ? `prio=${prefer}` : '', holdIds !== undefined ? `hold=${holdIds}` : ''].filter((p) => p !== '').join(';');
  const followText = followSpec ?? (shorthand === '' ? undefined : shorthand);
  const follow = followText === undefined ? undefined : parseFollowSpec(followText);
  if (follow) {
    const flag = followSpec !== undefined ? '--follow' : '--prefer / --hold';
    if (!naive) throw new Error(`${flag} only applies to --naive`);
    if (challengeNaive) throw new Error(`${flag} does not apply to --naive with ${daily !== undefined ? '--daily' : '--weekly'} (tower ids are per level)`);
    if (gate) throw new Error(`${flag} is informational and does not combine with --gate (the gate is the plain naive line's)`);
    if (level === undefined) throw new Error(`${flag} needs --level N (tower ids are per level)`);
  }
  // GD-7f: the reversed tie order — a campaign naive switch; the gate keeps the asc line and may add desc
  if (tieSpec !== undefined && !(TIE_MODES as readonly string[]).includes(tieSpec)) throw new Error(`bad --tie ${tieSpec} (${TIE_MODES.join('|')})`);
  const tie = (tieSpec ?? 'asc') as TieMode;
  if (tieSpec !== undefined && !naive) throw new Error('--tie only applies to --naive');
  if (tieSpec !== undefined && challengeNaive) throw new Error(`--tie only applies to the campaign naive run, not to --naive with ${daily !== undefined ? '--daily' : '--weekly'}`);
  if (gate && tie === 'desc') throw new Error('--gate --tie desc would not gate the asc line; use --tie both (a level fails when either order is under its share)');
  // QA-30: a tutorial-cured level's reversed-tie row leaves the gate; its asc row stays gated
  const tieExempt = tieExemptSpec === undefined ? undefined : parseTieExempt(tieExemptSpec);
  if (tieExempt && !(gate && tie === 'both')) throw new Error('--tie-exempt only applies to --naive --gate a-b --tie both (it exempts a level\'s tie desc row from the gate)');
  const outside = tieExempt && gate ? tieExempt.filter((id) => id < gate.from || id > gate.to) : [];
  if (gate && outside.length) throw new Error(`--tie-exempt ${outside.join(',')} is outside --gate ${gate.from}-${gate.to}`);
  return {
    level,
    seed,
    seeds,
    upgrades: upgrades as Upgrades,
    daily,
    days,
    twist,
    twistId: twistDef?.id,
    pool,
    weekly,
    weeks,
    naive,
    reactMs,
    gate,
    ...(follow ? { follow } : {}),
    ...(tie !== 'asc' ? { tie } : {}),
    ...(tieExempt ? { tieExempt } : {}),
    ...(tierGate ? { tierGate: true as const } : {}),
    ...(jobs !== undefined ? { jobs } : {}),
  };
}
