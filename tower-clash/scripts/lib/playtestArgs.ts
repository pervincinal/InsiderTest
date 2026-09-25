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
 */
import { C } from '../../src/sim/index';
import { TWISTS, isMondayKey } from '../../src/daily/challenge';
import type { Twist } from '../../src/daily/challenge';
import { DEFAULT_POOL, parsePool, twistById } from './daily';
import type { PoolRange } from './daily';
import { NAIVE_REACT_MS, parseNaiveGate } from './naivePlayer';
import type { NaiveGateRange } from './naivePlayer';

export const DEFAULT_SEED = 1;

export type Upgrades = 'none' | 'max';

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
  }
  if (level !== undefined && !Number.isInteger(level)) throw new Error(`bad --level ${String(level)}`);
  if (!Number.isInteger(seed)) throw new Error(`bad --seed ${String(seed)}`);
  if (seeds !== undefined && (!Number.isInteger(seeds) || seeds < 1)) throw new Error(`bad --seeds ${String(seeds)}`);
  if (upgrades !== 'none' && upgrades !== 'max') throw new Error(`bad --upgrades ${upgrades} (none|max)`);
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
  return { level, seed, seeds, upgrades, daily, days, twist, twistId: twistDef?.id, pool, weekly, weeks, naive, reactMs, gate };
}
