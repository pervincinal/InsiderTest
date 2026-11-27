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
 * REV-0k (2026-11-27): an unknown argument or a value flag without its value throws (REV-68); `--seed` only
 * with the single-seed campaign run, `--days` / `--weeks` / `--no-twist` only with their mode (REV-74);
 * `--gate` refuses `--upgrades` (REV-67) and narrows to `N-N` under `--level N` (REV-66).
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

/** REV-68: every flag that takes a value (`--x v` or `--x=v`); anything not here or in `SWITCH_FLAGS` is an error. */
export const VALUE_FLAGS = Object.freeze([
  '--level', '--seed', '--seeds', '--upgrades', '--daily', '--days', '--weekly', '--weeks', '--twist', '--pool',
  '--react', '--gate', '--follow', '--prefer', '--hold', '--tie', '--tie-exempt', '--jobs',
] as const);
/** REV-68: the flags without a value. */
export const SWITCH_FLAGS = Object.freeze(['--naive', '--no-twist', '--tier-gate'] as const);

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
  // REV-68 / REV-74: which flags were given at all (a flag that changes nothing in the chosen mode is refused, not ignored)
  const given = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const eq = arg.indexOf('=');
    const name = arg.startsWith('--') && eq > 0 ? arg.slice(0, eq) : arg;
    // REV-68: a misspelt flag (`--tiergate`) or a stray word used to run the default campaign and exit 0
    if (!(VALUE_FLAGS as readonly string[]).includes(name) && !(SWITCH_FLAGS as readonly string[]).includes(name)) {
      throw new Error(`unknown argument ${arg} (flags: ${[...VALUE_FLAGS, ...SWITCH_FLAGS].join(' ')})`);
    }
    if ((SWITCH_FLAGS as readonly string[]).includes(name)) {
      if (name !== arg) throw new Error(`${name} takes no value (got ${arg})`);
      given.add(name);
      if (name === '--no-twist') twist = false;
      else if (name === '--naive') naive = true;
      else tierGate = true; // --tier-gate
      continue;
    }
    let value: string;
    if (name !== arg) value = arg.slice(eq + 1);
    else {
      const next = argv[i + 1];
      // REV-68: a value flag as the last argument (or followed by another flag) used to be dropped silently
      if (next === undefined || next.startsWith('--')) throw new Error(`missing value for ${name}`);
      value = next;
      i++;
    }
    given.add(name);
    switch (name) {
      case '--level': level = Number(value); break;
      case '--seeds': seeds = Number(value); break;
      case '--seed': seed = Number(value); break;
      case '--upgrades': upgrades = value; break;
      case '--daily': daily = value; break;
      case '--days': days = Number(value); break;
      case '--twist': twistId = value; break;
      case '--pool': poolSpec = value; break;
      case '--weekly': weekly = value; break;
      case '--weeks': weeks = Number(value); break;
      case '--react': reactMs = Number(value); break;
      case '--gate': gateSpec = value; break;
      case '--follow': followSpec = value; break;
      case '--prefer': prefer = value; break;
      case '--hold': holdIds = value; break;
      case '--tie': tieSpec = value; break;
      case '--tie-exempt': tieExemptSpec = value; break;
      default: jobs = Number(value); // --jobs
    }
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
      given.has('--seed') ? '--seed' : undefined,
    ].filter((m) => m !== undefined);
    if (other.length) throw new Error(`--tier-gate takes only --seeds K and --jobs N (it runs every tier of every track on levels 1-16); drop ${other.join(', ')}`);
  }
  if (jobs !== undefined && (!Number.isInteger(jobs) || jobs < 1)) throw new Error(`bad --jobs ${String(jobs)}`);
  if (jobs !== undefined && !tierGate) throw new Error('--jobs only applies to --tier-gate');
  // REV-74 (the AUD-B17 rule): `--seed S` is read by the single-seed campaign run only; every other run takes its seeds elsewhere
  if (given.has('--seed')) {
    const seedless = seeds !== undefined ? '--seeds K (seeds 1..K)' : naive ? '--naive (seeds 1..K)' : modes[0] !== undefined ? `${modes[0]} (${modes[0] === '--twist' ? 'seeds 1..K' : 'K seeds from the fixed one'})` : undefined;
    if (seedless) throw new Error(`--seed only applies to the single-seed campaign run; ${seedless} does not read it — drop --seed`);
  }
  if (given.has('--days') && daily === undefined) throw new Error('--days only applies to --daily');
  if (given.has('--weeks') && weekly === undefined) throw new Error('--weeks only applies to --weekly');
  if (!twist && daily === undefined && weekly === undefined) throw new Error('--no-twist only applies to --daily / --weekly (the control run without the twist)');
  const challengeNaive = naive && (daily !== undefined || weekly !== undefined);
  if (challengeNaive && level !== undefined) throw new Error(`--level does not apply to --naive with ${daily !== undefined ? '--daily' : '--weekly'} (the challenge picks the level)`);
  const pool = poolSpec === undefined ? DEFAULT_POOL : parsePool(poolSpec);
  if (poolSpec !== undefined && !twistDef) throw new Error('--pool only applies to --twist');
  if (!Number.isInteger(reactMs) || reactMs < C.TICK_MS || reactMs % C.TICK_MS !== 0) throw new Error(`bad --react ${String(reactMs)} (ms, a positive multiple of ${C.TICK_MS})`);
  if (reactMs !== NAIVE_REACT_MS && !naive) throw new Error('--react only applies to --naive');
  const gateRange = gateSpec === undefined ? undefined : parseNaiveGate(gateSpec);
  if (gateRange && !naive) throw new Error('--gate only applies to --naive');
  if (gateRange && challengeNaive) throw new Error(`--gate only applies to the campaign naive run, not to --naive with ${daily !== undefined ? '--daily' : '--weekly'} (informational, no gate)`);
  if (gateRange && reactMs !== NAIVE_REACT_MS) throw new Error(`--gate is defined at the default reaction (${NAIVE_REACT_MS} ms); drop --react`);
  // REV-67: the gate shares are the unmodified player's, like the reaction — a Commander-upgraded run must not report a pass CI would not
  if (gateRange && upgrades !== 'none') throw new Error(`--gate is defined for the unmodified player; drop --upgrades ${upgrades} (the per-tier check is --tier-gate)`);
  if (gateRange && level !== undefined && (level < gateRange.from || level > gateRange.to)) throw new Error(`--level ${level} is outside --gate ${gateRange.from}-${gateRange.to}`);
  // REV-66: `--level N` runs one level, so the gate is that level's — the rest of a-b would count as "(not run)" failures
  const gate = gateRange && level !== undefined ? { from: level, to: level } : gateRange;
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
