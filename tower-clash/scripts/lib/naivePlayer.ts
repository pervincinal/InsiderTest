/**
 * Naive human line (QA-3): a deterministic model of a first-time player, for
 * `npm run playtest -- --naive [--seeds K] [--react MS]`. The reference player is clever (stacks,
 * shields, reclaims); this bot is not. Every `reactMs` of sim time (first action at `firstMs`) it looks
 * at its towers in id order and, for each own tower with a free link, opens ONE stream to the nearest
 * connected tower it does not own — neutral before enemy, then lane length, then id. It never unlinks
 * (streams end only by the sim's `targetFull` / `sourceEmpty`), never uses boosters, never stacks on
 * purpose, and a tower that lost all its links is re-linked only after another full reaction delay
 * (the human notices, then reacts). The rng is unused, so a run is a pure function of (level, seed,
 * reactMs, firstMs). Pure and importable from tests; the table and the summary live in scripts/playtest.ts.
 */
import { C, linksFrom, maxLinksOf } from '../../src/sim/index';
import type { Command, GameState, LevelDef, Rng, Tower } from '../../src/sim/index';
import { runHeadless, starsFor } from '../../src/ai/headless';
import type { PlayerBot, RunResult } from '../../src/ai/headless';

/** Default reaction delay of the naive line, ms of sim time (`--react`). */
export const NAIVE_REACT_MS = 4000;
/** Sim time of the first action, ms. */
export const NAIVE_FIRST_MS = 3000;
/** A level "holds" for the naive line when it wins at least this share of its seeds (informational, no gate). */
export const NAIVE_WIN_RATE = 0.5;

export interface NaiveOptions {
  /** Reaction delay, ms (default `NAIVE_REACT_MS`). Must be a positive multiple of `C.TICK_MS`. */
  reactMs?: number;
  /** First action, ms (default `NAIVE_FIRST_MS`). */
  firstMs?: number;
}

interface Memory {
  levelId: number;
  seed: number;
  lastTime: number;
  /** Tower id → sim time at which the bot first saw it with no links after having had some. */
  lostAt: Map<string, number>;
  /** Towers the bot has seen linked at least once (a fresh tower links at the first reaction). */
  everLinked: Set<string>;
}

function freshMemory(state: GameState): Memory {
  return { levelId: state.levelId, seed: state.seed, lastTime: -1, lostAt: new Map(), everLinked: new Set() };
}

/** True on the AI tick that carries the k-th reaction (`firstMs + k * reactMs`, k ≥ 0) — the first AI tick at or after it. */
export function isReactionTick(timeMs: number, reactMs: number, firstMs: number): boolean {
  if (timeMs < firstMs) return false;
  const k = Math.floor((timeMs - firstMs) / reactMs);
  const due = firstMs + k * reactMs;
  return timeMs - due < C.AI_TICK_MS;
}

function dist(a: Tower, b: Tower): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * The tower a naive player would stream to from `from`: the nearest connected tower not owned by the
 * player, neutral before enemy, ties by lane length then id; `undefined` when every lane leads home or
 * every candidate is already streamed to from `from`.
 */
export function naiveTarget(state: GameState, from: Tower): Tower | undefined {
  const already = new Set(linksFrom(state, from.id).map((l) => l.to));
  let best: Tower | undefined;
  let bestKey: [number, number, string] | undefined;
  for (const id in state.roads) {
    const road = state.roads[id]!;
    const otherId = road.a === from.id ? road.b : road.b === from.id ? road.a : undefined;
    if (otherId === undefined || already.has(otherId)) continue;
    const other = state.towers[otherId];
    if (!other || other.owner === from.owner) continue;
    const key: [number, number, string] = [other.owner === 'neutral' ? 0 : 1, dist(from, other), other.id];
    if (bestKey === undefined || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) {
      best = other;
      bestKey = key;
    }
  }
  return best;
}

/** Build the naive line as a `PlayerBot` for `runHeadless`. One instance per run keeps its memory clean; a reused one resets itself on a new match. */
export function makeNaivePlayer(options: NaiveOptions = {}): NonNullable<PlayerBot> {
  const reactMs = options.reactMs ?? NAIVE_REACT_MS;
  const firstMs = options.firstMs ?? NAIVE_FIRST_MS;
  if (!Number.isInteger(reactMs) || reactMs < C.TICK_MS || reactMs % C.TICK_MS !== 0) throw new Error(`naive: bad reactMs ${String(reactMs)} (a positive multiple of ${C.TICK_MS})`);
  if (!Number.isInteger(firstMs) || firstMs < 0) throw new Error(`naive: bad firstMs ${String(firstMs)}`);
  let mem: Memory | undefined;

  return (state: GameState, _rng: Rng): Command[] => {
    if (!mem || mem.levelId !== state.levelId || mem.seed !== state.seed || state.time <= mem.lastTime) mem = freshMemory(state);
    mem.lastTime = state.time;

    // Observe every AI tick: note when a tower that was streaming has no links any more.
    const own: Tower[] = [];
    for (const id in state.towers) {
      const t = state.towers[id]!;
      if (t.owner !== 'player') continue;
      own.push(t);
      const links = linksFrom(state, t.id).length;
      if (links > 0) {
        mem.everLinked.add(t.id);
        mem.lostAt.delete(t.id);
      } else if (mem.everLinked.has(t.id) && !mem.lostAt.has(t.id)) {
        mem.lostAt.set(t.id, state.time);
      }
    }
    if (!isReactionTick(state.time, reactMs, firstMs)) return [];

    own.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const out: Command[] = [];
    for (const t of own) {
      const links = linksFrom(state, t.id).length;
      if (links >= maxLinksOf(t)) continue;
      if (links === 0) {
        const lost = mem.lostAt.get(t.id);
        if (lost !== undefined && state.time - lost < reactMs) continue; // noticed the loss; reacts one delay later
      }
      const target = naiveTarget(state, t);
      if (target) out.push({ type: 'link', owner: 'player', from: t.id, to: target.id });
    }
    return out;
  };
}

export interface NaiveRow {
  level: LevelDef;
  reactMs: number;
  seeds: number[];
  results: RunResult[];
  wins: number;
  /** Stars per seed, `seeds` order. */
  stars: (0 | 1 | 2 | 3)[];
  /** index = stars, value = count. */
  starCounts: [number, number, number, number];
  medianMs: number | undefined;
  worstMs: number | undefined;
  losers: number[];
  /** wins/K ≥ `NAIVE_WIN_RATE`. */
  holds: boolean;
  /** `holds` and the median win time is within the level's `star2` clock. */
  withinStar2: boolean;
  ticks: number;
}

function medianOf(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The naive line on one level over seeds 1..k with the given reaction delay, no Commander upgrades. */
export function runNaive(level: LevelDef, k: number, reactMs: number = NAIVE_REACT_MS): NaiveRow {
  if (!Number.isInteger(k) || k < 1) throw new Error(`naive: bad seed count ${String(k)}`);
  const seeds = Array.from({ length: k }, (_, i) => i + 1);
  const results: RunResult[] = [];
  const stars: (0 | 1 | 2 | 3)[] = [];
  const starCounts: [number, number, number, number] = [0, 0, 0, 0];
  const winTimes: number[] = [];
  const losers: number[] = [];
  let ticks = 0;
  for (const seed of seeds) {
    const r = runHeadless(level, seed, makeNaivePlayer({ reactMs }));
    results.push(r);
    ticks += r.ticks;
    const s = starsFor(level, r);
    stars.push(s);
    starCounts[s]++;
    if (r.outcome === 'won') winTimes.push(r.timeMs);
    else losers.push(seed);
  }
  const medianMs = medianOf(winTimes);
  const holds = winTimes.length / k >= NAIVE_WIN_RATE;
  return {
    level,
    reactMs,
    seeds,
    results,
    wins: winTimes.length,
    stars,
    starCounts,
    medianMs,
    worstMs: winTimes.length ? Math.max(...winTimes) : undefined,
    losers,
    holds,
    withinStar2: holds && medianMs !== undefined && medianMs <= level.star2,
    ticks,
  };
}

/**
 * `--gate a-b` (CI naive gate): per-level minimum win share of the naive line at the default reaction
 * (`NAIVE_REACT_MS`). The tutorial band 1–8 must win ≥ 80 % (4/5 at K = 5), the second band 9–16
 * ≥ 60 % (3/5). Levels past `NAIVE_GATE_LAST` have no threshold: the line stays informational there.
 */
export const NAIVE_GATE_BANDS: readonly Readonly<{ from: number; to: number; rate: number }>[] = Object.freeze([
  Object.freeze({ from: 1, to: 8, rate: 0.8 }),
  Object.freeze({ from: 9, to: 16, rate: 0.6 }),
]);
/** Last level id with a naive gate threshold. */
export const NAIVE_GATE_LAST = 16;

/** The naive gate's minimum win share for a level, or undefined past `NAIVE_GATE_LAST`. */
export function naiveGateRate(levelId: number): number | undefined {
  return NAIVE_GATE_BANDS.find((b) => levelId >= b.from && levelId <= b.to)?.rate;
}

/** Fewest wins out of `k` seeds that satisfy `rate` (4 of 5 at 0.8; 3 of 5 at 0.6; 8 of 10 at 0.8). */
export function naiveGateMinWins(rate: number, k: number): number {
  return Math.ceil(rate * k - 1e-9);
}

export interface NaiveGateRange {
  from: number;
  to: number;
}

export interface NaiveGateFailure {
  levelId: number;
  name: string;
  wins: number;
  k: number;
  /** Wins the level needed. */
  minWins: number;
  rate: number;
  losers: number[];
}

/** Parse `a-b` (1 ≤ a ≤ b ≤ `NAIVE_GATE_LAST`) for `--gate`. */
export function parseNaiveGate(spec: string): NaiveGateRange {
  const m = /^(\d+)-(\d+)$/.exec(spec.trim());
  if (!m) throw new Error(`bad --gate ${spec} (a-b, e.g. 1-${NAIVE_GATE_LAST})`);
  const from = Number(m[1]);
  const to = Number(m[2]);
  if (from < 1 || to < from) throw new Error(`bad --gate ${spec} (need 1 <= a <= b)`);
  if (to > NAIVE_GATE_LAST) throw new Error(`bad --gate ${spec}: the naive gate covers levels 1-${NAIVE_GATE_LAST} only (later levels are informational)`);
  return { from, to };
}

/**
 * Apply the naive gate to the rows of a `--naive` run: every level in `range` must be present and
 * win at least `naiveGateRate(id)` of its seeds. Returns one failure per level under its threshold;
 * a level of the range missing from `rows` is a failure too (0 wins of 0) so a partial run cannot pass.
 * Throws when a row's reaction is not the default: the thresholds are calibrated for `NAIVE_REACT_MS`.
 */
export function naiveGate(rows: readonly Pick<NaiveRow, 'level' | 'reactMs' | 'wins' | 'seeds' | 'losers'>[], range: NaiveGateRange): NaiveGateFailure[] {
  if (range.from < 1 || range.to < range.from || range.to > NAIVE_GATE_LAST) throw new Error(`naive gate: bad range ${range.from}-${range.to} (1 <= a <= b <= ${NAIVE_GATE_LAST})`);
  const byId = new Map<number, (typeof rows)[number]>();
  for (const r of rows) {
    if (r.reactMs !== NAIVE_REACT_MS) throw new Error(`naive gate: level ${r.level.id} ran at react ${r.reactMs} ms; the gate is defined at ${NAIVE_REACT_MS} ms`);
    byId.set(r.level.id, r);
  }
  const failures: NaiveGateFailure[] = [];
  for (let id = range.from; id <= range.to; id++) {
    const rate = naiveGateRate(id)!;
    const row = byId.get(id);
    const k = row?.seeds.length ?? 0;
    const minWins = row ? naiveGateMinWins(rate, k) : 1;
    const wins = row?.wins ?? 0;
    if (wins < minWins) failures.push({ levelId: id, name: row?.level.name ?? '(not run)', wins, k, minWins, rate, losers: row?.losers ?? [] });
  }
  return failures;
}
