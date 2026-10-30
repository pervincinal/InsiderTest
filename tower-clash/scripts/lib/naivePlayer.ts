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
 * GD-6h: `NaiveOptions.follow` (`--follow`) turns it into the literal card follower of GDD §3.12 item 12 (a).
 * GD-7f: `NaiveOptions.tie` (`--tie desc`) reverses the id tie-break of `naiveTarget` (GDD §3.12 (i) (c),
 * §3.13 (f)) — the same line started from the other side of a mirror pair; `asc` (default) is the gated line.
 */
import { C, linksFrom, maxLevelOf, maxLinksOf } from '../../src/sim/index';
import type { Command, GameState, LevelDef, PlayerModifiers, Rng, Tower } from '../../src/sim/index';
import { runHeadless, starsFor } from '../../src/ai/headless';
import type { PlayerBot, RunResult } from '../../src/ai/headless';

/** Default reaction delay of the naive line, ms of sim time (`--react`). */
export const NAIVE_REACT_MS = 4000;
/** Sim time of the first action, ms. */
export const NAIVE_FIRST_MS = 3000;
/** A level "holds" for the naive line when it wins at least this share of its seeds (informational, no gate). */
export const NAIVE_WIN_RATE = 0.5;

/**
 * GD-7f — the last key of `naiveTarget` on an exact tie of (neutral-first, lane length): `asc` takes the
 * smaller id (the gated line since QA-3; `e…` / `east` / `ne` / `se` sort first, so it always starts east
 * on a mirror pair), `desc` the larger one (the west start). Nothing else of the line changes.
 */
export type NaiveTie = 'asc' | 'desc';
export const NAIVE_TIES: readonly NaiveTie[] = Object.freeze(['asc', 'desc'] as const);

/** Throw unless `tie` is `asc` or `desc`. */
export function checkNaiveTie(tie: string): NaiveTie {
  if (tie !== 'asc' && tie !== 'desc') throw new Error(`naive: bad tie order "${tie}" (asc | desc)`);
  return tie;
}

/**
 * GD-6h — the literal card follower (GDD §3.12 item 12 (a)): the naive line, except that
 * - `prio`: a tower with a free link opens it on the first tower of this list (in order) that it has a
 *   lane to, does not own and does not already stream to — the player who does what the lesson card
 *   names first; with no such tower it falls back to `naiveTarget`;
 * - `hold`: these towers open no link before L2 (the player lets them fill first) unless they were
 *   already streaming once (a captured tower, a re-link after a loss); `hold=home@3` (GD-11g) waits
 *   for L3 instead — the card's "let your home grow to level 3" (`hold=x` is `hold=x@2`);
 * - `noprioFrom`: these towers ignore `prio` and play the plain naive line;
 * - `after` (GD-7f, `after=guns:3,outpost:4`): the `prio` tower `id` is eligible only once the player owns
 *   at least `k` towers (counted at the reaction) — the card's "with five towers take the guns"; before
 *   that the source skips it and tries the next `prio` tower, then the plain naive target (which may still
 *   be that tower: `after` gates the card's instruction, not the naive line). Every `after` id must be in `prio`.
 * Tower ids are the level's; `validateFollowSpec` rejects ids the level does not have.
 */
export interface FollowSpec {
  prio: readonly string[];
  hold: readonly string[];
  /**
   * GD-11g: `hold` id → the level it waits for, only for ids held past the default (`hold=home@3`);
   * absent when every `hold` id waits for `FOLLOW_HOLD_LEVEL` (L2).
   */
  holdLevel?: Readonly<Record<string, number>>;
  noprioFrom: readonly string[];
  /** GD-7f: own-tower count from which a `prio` tower is eligible, in spec order. */
  after: readonly FollowAfter[];
}

/** GD-11g: the level a `hold` tower waits for when the spec gives no `@N` (`hold=x` = `hold=x@2`). */
export const FOLLOW_HOLD_LEVEL = 2;

/** GD-11g: the level `from` waits for before its first link under `spec` (0 = not held). */
export function followHoldLevel(spec: Pick<FollowSpec, 'hold' | 'holdLevel'> | undefined, id: string): number {
  if (!spec || !spec.hold.includes(id)) return 0;
  return spec.holdLevel && Object.hasOwn(spec.holdLevel, id) ? spec.holdLevel[id]! : FOLLOW_HOLD_LEVEL;
}

export interface FollowAfter {
  id: string;
  /** Fewest own towers (≥ 1) at the reaction for `id` to be a `prio` target. */
  k: number;
}

const FOLLOW_KEYS = ['prio', 'hold', 'noprioFrom', 'after'] as const;
type FollowIdKey = Exclude<(typeof FOLLOW_KEYS)[number], 'after'>;

/** The tower ids a spec key names (`after` → its ids). */
function followIds(spec: FollowSpec, key: (typeof FOLLOW_KEYS)[number]): readonly string[] {
  return key === 'after' ? spec.after.map((a) => a.id) : spec[key];
}

/**
 * Parse `prio=a,b,c;hold=home@3,x;noprioFrom=x;after=b:3` (any subset of the keys, each once, at least one id
 * each; spaces ignored). A `hold` id may carry `@N` (GD-11g, 2 ≤ N ≤ `C.MAX_LEVEL`): the level it waits for; `@2` is the default.
 */
export function parseFollowSpec(spec: string): FollowSpec {
  const out: { prio: string[]; hold: string[]; holdLevel?: Record<string, number>; noprioFrom: string[]; after: FollowAfter[] } = { prio: [], hold: [], noprioFrom: [], after: [] };
  const seen = new Set<string>();
  const parts = spec
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (parts.length === 0) throw new Error(`bad --follow "${spec}" (prio=a,b[;hold=c[@N]][;noprioFrom=d][;after=b:k])`);
  for (const part of parts) {
    const eq = part.indexOf('=');
    const key = (eq < 0 ? part : part.slice(0, eq)).trim();
    if (!(FOLLOW_KEYS as readonly string[]).includes(key)) throw new Error(`bad --follow "${spec}": unknown key "${key}" (${FOLLOW_KEYS.join(' | ')})`);
    if (seen.has(key)) throw new Error(`bad --follow "${spec}": "${key}" given twice`);
    seen.add(key);
    const items = eq < 0 ? [] : part.slice(eq + 1).split(',').map((s) => s.trim()).filter((s) => s !== '');
    if (items.length === 0) throw new Error(`bad --follow "${spec}": "${key}" needs at least one tower id`);
    if (key === 'after') {
      for (const item of items) {
        const m = /^([^:\s]+)\s*:\s*(\d+)$/.exec(item);
        if (!m || Number(m[2]) < 1) throw new Error(`bad --follow "${spec}": after "${item}" is not id:k (k >= 1 own towers)`);
        out.after.push({ id: m[1]!, k: Number(m[2]) });
      }
      if (new Set(out.after.map((a) => a.id)).size !== out.after.length) throw new Error(`bad --follow "${spec}": "after" repeats a tower id`);
      continue;
    }
    if (key === 'hold') {
      const ids: string[] = [];
      const levels: Record<string, number> = {};
      for (const item of items) {
        const m = /^([^@\s]+)(?:\s*@\s*(\d+))?$/.exec(item);
        const lvl = m?.[2] === undefined ? FOLLOW_HOLD_LEVEL : Number(m[2]);
        if (!m || lvl < FOLLOW_HOLD_LEVEL || lvl > C.MAX_LEVEL) throw new Error(`bad --follow "${spec}": hold "${item}" is not id or id@N (${FOLLOW_HOLD_LEVEL} <= N <= ${C.MAX_LEVEL}, the level it waits for)`);
        ids.push(m[1]!);
        if (lvl !== FOLLOW_HOLD_LEVEL) levels[m[1]!] = lvl;
      }
      if (new Set(ids).size !== ids.length) throw new Error(`bad --follow "${spec}": "hold" repeats a tower id`);
      out.hold = ids;
      if (Object.keys(levels).length > 0) out.holdLevel = levels;
      continue;
    }
    if (new Set(items).size !== items.length) throw new Error(`bad --follow "${spec}": "${key}" repeats a tower id`);
    out[key as FollowIdKey] = items;
  }
  for (const a of out.after) {
    if (!out.prio.includes(a.id)) throw new Error(`bad --follow "${spec}": after=${a.id}:${a.k} gates a prio target, but "${a.id}" is not in prio`);
  }
  return out;
}

/**
 * Canonical text of a spec (keys in `prio; hold; noprioFrom; after` order, empty keys left out) for headers;
 * a `hold` id carries `@N` only past the default L2 (`hold=home@3,x`), so a spec without `@` prints as before GD-11g.
 */
export function formatFollowSpec(spec: FollowSpec): string {
  const holdText = (id: string): string => {
    const lvl = followHoldLevel(spec, id);
    return lvl === FOLLOW_HOLD_LEVEL ? id : `${id}@${lvl}`;
  };
  return FOLLOW_KEYS.filter((k) => followIds(spec, k).length > 0)
    .map((k) => `${k}=${k === 'after' ? spec.after.map((a) => `${a.id}:${a.k}`).join(',') : k === 'hold' ? spec.hold.map(holdText).join(',') : spec[k].join(',')}`)
    .join(';');
}

/**
 * Throw when the spec names a tower id the level does not have (a typo would silently play the naive line),
 * or holds a tower for a level its kind never reaches (GD-11g: `fortress@3` would never link).
 */
export function validateFollowSpec(spec: FollowSpec, level: Pick<LevelDef, 'id' | 'towers'>): void {
  const ids = new Set(level.towers.map((t) => t.id));
  for (const k of FOLLOW_KEYS) {
    for (const id of followIds(spec, k)) {
      if (!ids.has(id)) throw new Error(`--follow ${k}=${id}: level ${level.id} has no tower "${id}" (towers: ${[...ids].join(', ')})`);
    }
  }
  for (const t of level.towers) {
    const lvl = followHoldLevel(spec, t.id);
    const max = maxLevelOf({ kind: t.kind ?? 'barracks' });
    if (lvl > max) throw new Error(`--follow hold=${t.id}@${lvl}: level ${level.id}'s "${t.id}" is a ${t.kind ?? 'barracks'} (max L${max}); it would never link`);
  }
}

/**
 * The follower's target from `from`: the first `prio` tower it has a lane to, does not own, does not
 * stream to yet and — when `after` names it with k — only while `from`'s owner holds at least k towers.
 */
export function followTarget(state: GameState, from: Tower, prio: readonly string[], after: readonly FollowAfter[] = []): Tower | undefined {
  const already = new Set(linksFrom(state, from.id).map((l) => l.to));
  const lanes = new Set<string>();
  for (const id in state.roads) {
    const road = state.roads[id]!;
    if (road.a === from.id) lanes.add(road.b);
    else if (road.b === from.id) lanes.add(road.a);
  }
  let owned = 0;
  if (after.length > 0) for (const id in state.towers) if (state.towers[id]!.owner === from.owner) owned++;
  for (const id of prio) {
    const t = state.towers[id];
    const minOwn = after.find((a) => a.id === id)?.k;
    if (minOwn !== undefined && owned < minOwn) continue;
    if (t && lanes.has(id) && !already.has(id) && t.owner !== from.owner) return t;
  }
  return undefined;
}

export interface NaiveOptions {
  /** Reaction delay, ms (default `NAIVE_REACT_MS`). Must be a positive multiple of `C.TICK_MS`. */
  reactMs?: number;
  /** First action, ms (default `NAIVE_FIRST_MS`). */
  firstMs?: number;
  /** GD-6h: play the literal card follower instead of the plain naive line. */
  follow?: FollowSpec;
  /** GD-7f: id order on an exact tie of `naiveTarget`'s key (default `asc`, the gated line). */
  tie?: NaiveTie;
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
 * player, neutral before enemy, ties by lane length then id (smaller first; `tie = 'desc'`, GD-7f: larger
 * first); `undefined` when every lane leads home or every candidate is already streamed to from `from`.
 */
export function naiveTarget(state: GameState, from: Tower, tie: NaiveTie = 'asc'): Tower | undefined {
  const desc = tie === 'desc';
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
    if (bestKey === undefined || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && (desc ? key[2] > bestKey[2] : key[2] < bestKey[2]))))) {
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
  const tie = checkNaiveTie(options.tie ?? 'asc');
  const prio = options.follow?.prio ?? [];
  const after = options.follow?.after ?? [];
  const hold = new Map((options.follow?.hold ?? []).map((id) => [id, followHoldLevel(options.follow, id)]));
  const noprio = new Set(options.follow?.noprioFrom ?? []);
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
      if (t.level < (hold.get(t.id) ?? 0) && !mem.everLinked.has(t.id)) continue; // follower: let it fill to L2 (or its @N) first
      const links = linksFrom(state, t.id).length;
      if (links >= maxLinksOf(t)) continue;
      if (links === 0) {
        const lost = mem.lostAt.get(t.id);
        if (lost !== undefined && state.time - lost < reactMs) continue; // noticed the loss; reacts one delay later
      }
      const target = (prio.length > 0 && !noprio.has(t.id) ? followTarget(state, t, prio, after) : undefined) ?? naiveTarget(state, t, tie);
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
  /** GD-6h: the card follower's spec when the row is a follower run (never gated). */
  follow?: FollowSpec;
  /** GD-7f: `desc` when the row ran the reversed tie order; absent on the default `asc` line. */
  tie?: NaiveTie;
}

function medianOf(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * The naive line (or, with `follow`, the literal card follower) on one level over seeds 1..k with the
 * given reaction delay; `tie` (GD-7f) picks the id order on an exact target tie. `modifiers` (AUD-B17:
 * `--naive --upgrades max|<track>:<tier>`) are the player's Commander upgrades; default none.
 */
export function runNaive(
  level: LevelDef,
  k: number,
  reactMs: number = NAIVE_REACT_MS,
  follow?: FollowSpec,
  tie: NaiveTie = 'asc',
  modifiers?: Readonly<PlayerModifiers>,
): NaiveRow {
  if (!Number.isInteger(k) || k < 1) throw new Error(`naive: bad seed count ${String(k)}`);
  checkNaiveTie(tie);
  if (follow) validateFollowSpec(follow, level);
  const seeds = Array.from({ length: k }, (_, i) => i + 1);
  const results: RunResult[] = [];
  const stars: (0 | 1 | 2 | 3)[] = [];
  const starCounts: [number, number, number, number] = [0, 0, 0, 0];
  const winTimes: number[] = [];
  const losers: number[] = [];
  let ticks = 0;
  for (const seed of seeds) {
    const r = runHeadless(level, seed, makeNaivePlayer({ reactMs, follow, tie }), modifiers ? { modifiers } : {});
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
    ...(follow ? { follow } : {}),
    ...(tie === 'desc' ? { tie } : {}),
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

/**
 * QA-30: levels whose reversed-tie start (`tie desc`) is cured by the tutorial, not by the layout —
 * the naive model never reads a tutorial step, so its `desc` row keeps losing there by construction.
 * `--tie-exempt` may name only these ids (each with the backlog item that decided the cure); the gate
 * still checks their `asc` row. A future level cured by a tutorial steer goes here with its item id.
 */
export const NAIVE_TIE_EXEMPT: Readonly<Record<number, string>> = Object.freeze({});

/** Parse `--tie-exempt a[,b…]`: unique ids from `NAIVE_TIE_EXEMPT`, ascending. */
export function parseTieExempt(spec: string): number[] {
  const parts = spec.split(',').map((p) => p.trim());
  const ids = parts.map(Number);
  if (parts.some((p) => !/^\d+$/.test(p)) || new Set(ids).size !== ids.length) throw new Error(`bad --tie-exempt ${spec} (unique level ids, e.g. 3)`);
  const unknown = ids.filter((id) => NAIVE_TIE_EXEMPT[id] === undefined);
  if (unknown.length) {
    throw new Error(`--tie-exempt ${unknown.join(',')}: not in NAIVE_TIE_EXEMPT (scripts/lib/naivePlayer.ts: ${Object.keys(NAIVE_TIE_EXEMPT).join(', ')}) — add the level there with the item that cures it by tutorial`);
  }
  return [...ids].sort((a, b) => a - b);
}

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
  /** GD-7f: `desc` when the failing row is the reversed-tie line; absent for the default `asc` line. */
  tie?: NaiveTie;
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
 * GD-7f: `ties` names the tie orders the run gates (default `['asc']`, today's CI line; `--tie both` →
 * `['asc', 'desc']`): a level fails when **either** order's row is under its share or missing, one
 * failure per (level, order) in id order, `asc` first. Rows of an order outside `ties` are ignored.
 * QA-30: `descExempt` (ids of `NAIVE_TIE_EXEMPT`, needs `desc` in `ties`) skips those levels' `desc`
 * row only; their `asc` row is gated as any other.
 */
export function naiveGate(
  rows: readonly Pick<NaiveRow, 'level' | 'reactMs' | 'wins' | 'seeds' | 'losers' | 'follow' | 'tie'>[],
  range: NaiveGateRange,
  ties: readonly NaiveTie[] = ['asc'],
  descExempt: readonly number[] = [],
): NaiveGateFailure[] {
  if (range.from < 1 || range.to < range.from || range.to > NAIVE_GATE_LAST) throw new Error(`naive gate: bad range ${range.from}-${range.to} (1 <= a <= b <= ${NAIVE_GATE_LAST})`);
  if (ties.length === 0 || new Set(ties).size !== ties.length) throw new Error(`naive gate: bad tie orders [${ties.join(', ')}]`);
  for (const t of ties) checkNaiveTie(t);
  if (descExempt.length && !ties.includes('desc')) throw new Error('naive gate: a tie desc exemption needs the desc order in the gate');
  for (const id of descExempt) if (NAIVE_TIE_EXEMPT[id] === undefined) throw new Error(`naive gate: level ${id} is not in NAIVE_TIE_EXEMPT`);
  const byKey = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (r.reactMs !== NAIVE_REACT_MS) throw new Error(`naive gate: level ${r.level.id} ran at react ${r.reactMs} ms; the gate is defined at ${NAIVE_REACT_MS} ms`);
    if (r.follow) throw new Error(`naive gate: level ${r.level.id} ran the card follower; the gate is the plain naive line's`);
    byKey.set(`${r.level.id}:${r.tie ?? 'asc'}`, r);
  }
  const failures: NaiveGateFailure[] = [];
  for (let id = range.from; id <= range.to; id++) {
    const rate = naiveGateRate(id)!;
    for (const tie of ties) {
      if (tie === 'desc' && descExempt.includes(id)) continue;
      const row = byKey.get(`${id}:${tie}`);
      const k = row?.seeds.length ?? 0;
      const minWins = row ? naiveGateMinWins(rate, k) : 1;
      const wins = row?.wins ?? 0;
      if (wins < minWins) failures.push({ levelId: id, name: row?.level.name ?? '(not run)', wins, k, minWins, rate, losers: row?.losers ?? [], ...(tie === 'desc' ? { tie } : {}) });
    }
  }
  return failures;
}

/** GD-8f (GDD §3.14 (a)): the clock half's slack over the naive line on 17–50 — one clock step. */
export const RULE_A_CLOCK_STEP_MS = 5000;
/** GD-8f (GDD §3.14 (a)): the win half on 17–50 (no naive gate there) — ≥ 80 % of the seeds, both tie orders. */
export const RULE_A_LATE_WIN_RATE = 0.8;

export interface RuleAVerdict {
  ok: boolean;
  /** Fewest wins of the row's K seeds the win half needs. */
  minWins: number;
  /** `star2` (1–16, or 17–50 when the naive line does not hold), `naive` (17–50: max(star2, naive median + 5 s)), `none` (17–50 `tie desc`: wins only). */
  bar: 'star2' | 'naive' | 'none';
  /** The clock bar in ms (undefined when `bar` is `none`). */
  barMs: number | undefined;
  /** The verdict text between `lvl N name: ` and ` -> ok|NO`. */
  text: string;
}

function secs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * The `--follow` rule (a) verdict for one follower row (GD-6h; GD-8f).
 * Levels 1–`NAIVE_GATE_LAST` (GDD §3.12 item 12 (a)), unchanged: wins ≥ the level's naive gate share and
 * median ≤ `star2`, on every tie order. Levels past it (GDD §3.14 (a), no `star2` floor): wins ≥ 80 % of
 * the seeds on every tie order; the clock half only on the `asc` row: median ≤ bar = max(`star2`, the
 * plain naive `asc` median at the same K and reaction + 5 s) when that naive row holds (≥ 50 %), else
 * `star2`. `naive` must be that plain naive `asc` row of the same level, K and reaction — required for
 * an `asc` follower row past `NAIVE_GATE_LAST`, ignored otherwise.
 */
export function ruleA(
  follower: Pick<NaiveRow, 'level' | 'reactMs' | 'wins' | 'seeds' | 'medianMs' | 'tie'>,
  naive?: Pick<NaiveRow, 'level' | 'reactMs' | 'wins' | 'seeds' | 'medianMs' | 'holds' | 'follow' | 'tie'>,
): RuleAVerdict {
  const { level, wins } = follower;
  const k = follower.seeds.length;
  const gateRate = naiveGateRate(level.id);
  if (gateRate !== undefined) {
    const minWins = naiveGateMinWins(gateRate, k);
    const share = `${wins}/${k} ${wins >= minWins ? '>=' : '<'} ${minWins}/${k} (${Math.round(gateRate * 100)}%)`;
    const med = follower.medianMs === undefined ? 'no win' : `${secs(follower.medianMs)} ${follower.medianMs <= level.star2 ? '<=' : '>'} star2 ${secs(level.star2)}`;
    const ok = wins >= minWins && follower.medianMs !== undefined && follower.medianMs <= level.star2;
    return { ok, minWins, bar: 'star2', barMs: level.star2, text: `gate share ${share}, median ${med}` };
  }
  const minWins = naiveGateMinWins(RULE_A_LATE_WIN_RATE, k);
  const winsOk = wins >= minWins;
  const share = `wins ${wins}/${k} ${winsOk ? '>=' : '<'} ${minWins}/${k} (${Math.round(RULE_A_LATE_WIN_RATE * 100)}%)`;
  if (follower.tie === 'desc') {
    return { ok: winsOk, minWins, bar: 'none', barMs: undefined, text: `${share}, clock not judged on tie desc (GDD §3.14: the bar reads asc)` };
  }
  if (!naive) throw new Error(`rule (a): level ${level.id} is past ${NAIVE_GATE_LAST}; its clock bar needs the plain naive asc row`);
  if (naive.level.id !== level.id || naive.follow || (naive.tie ?? 'asc') !== 'asc' || naive.reactMs !== follower.reactMs || naive.seeds.length !== k) {
    throw new Error(`rule (a): level ${level.id} needs the plain naive asc row of the same level, K = ${k} and react ${follower.reactMs} ms`);
  }
  const naiveWins = `naive ${naive.wins}/${k}`;
  let barMs: number;
  let barText: string;
  let bar: RuleAVerdict['bar'];
  if (naive.holds && naive.medianMs !== undefined) {
    barMs = Math.max(level.star2, naive.medianMs + RULE_A_CLOCK_STEP_MS);
    bar = 'naive';
    barText = `bar ${secs(barMs)} = max(star2 ${secs(level.star2)}, naive ${secs(naive.medianMs)} + ${RULE_A_CLOCK_STEP_MS / 1000}s)`;
  } else {
    barMs = level.star2;
    bar = 'star2';
    barText = `bar ${secs(barMs)} = star2 (${naiveWins} < ${Math.round(NAIVE_WIN_RATE * 100)}%: the naive line does not hold)`;
  }
  const med = follower.medianMs === undefined ? 'no win' : `${secs(follower.medianMs)} ${follower.medianMs <= barMs ? '<=' : '>'} ${barText}`;
  const ok = winsOk && follower.medianMs !== undefined && follower.medianMs <= barMs;
  return { ok, minWins, bar, barMs, text: `${share}, median ${med === 'no win' ? `no win (${barText})` : med} (GDD §3.14)` };
}
