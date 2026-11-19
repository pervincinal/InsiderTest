import type { Command, EnemyAiOptions, GameState, LevelDef, Outcome, PlayerModifiers } from './types';
import { C } from './constants';
import { createState } from './create';
import { applyCommand } from './commands';
import { step } from './step';
import { getOutcome } from './outcome';
import { SNAPSHOT_VERSION, applyContinue } from './snapshot';

/*
 * Replay record v1 (SIM-R1, 2026-11-09; GDD §5 "Replay record v1"). A match is a deterministic function of
 * level + seed + modifiers + the commands applied before each tick, so this record is enough to re-run one
 * headlessly — for a bug report, the QA-35 hung-match investigation or, later, a playback UI (icebox).
 *
 * Pure sim module: no DOM, no clock, no `Math.random`; `runReplay` is the headless step loop
 * (`src/ai/headless.ts` without the bots — the bots' commands are already in the record).
 *
 * AI commands — stored, not re-derived. The enemies' commands are a function of the seed and the AI
 * version; re-deriving them at playback would keep a record to the player's few dozen commands but
 * tie it to the exact `src/ai` build that produced it (an AI tuning, which happens most days, would
 * silently change the match and the record would "fail" without any sim bug). Storing every command
 * (`a: 1` marks the ones a bot produced in the loop's AI hook — enemies, autoplay, the lose bot) makes
 * the record self-contained: it verifies against any build with the same rules (`rules`), the AI
 * can be re-tuned freely, and a 60 s match costs ≈ 10–20 kB of JSON (see tests/sim/replayRecord.test.ts).
 * The `a` flag is informational: `runReplay` applies every entry alike, in record order.
 *
 * SIM-R2 (2026-11-11): a Daily / Weekly Challenge match (GDD §7 / §8) plays a shipped level with the
 * challenge's fixed seed and its twist's modifiers — all of which the record already holds — but a
 * record of one said nothing about *which* challenge it was, so a verifier could re-run it and still not
 * tell that it was that day's match. The optional `challenge` descriptor carries the generator's inputs
 * (`kind`, the day / week `key`, the twist id); `src/daily/replayLevel.ts` rebuilds the challenge from
 * the key, checks the record's level / seed / modifiers against it and hands the verifier the level.
 * The version stays 1: the field is optional, a v1 record without it is a campaign match and parses as
 * before; a record with it is accepted by every SIM-R1 reader, which ignores the field. The sim never
 * imports `src/daily`: the descriptor is data, the rebuild lives outside the sim.
 *
 * SIM-R3 (2026-11-12): a match that used the Continue rewind (GDD §2 "Continue", ECONOMY.md §3.5) records
 * the rewind as an entry of its own: `{ t: <sim time of the defeat>, r: { toMs, freezeMs, infantry } }` —
 * the restored snapshot's time and the grant `applyContinue` (sim/snapshot.ts) applied to it. A Continue is
 * not a sim rule — the sim never rewinds itself, `applyCommand` never sees one — so it is a replay-level
 * entry that `runReplay` alone interprets, in the loop's own terms: the live loop restores the ring's
 * snapshot of `toMs` (the state after the tick that reached `toMs`, before any command of that tick),
 * grants the reinforcements, and plays on. The record keeps the abandoned future's commands (they were
 * applied, in order, before the entry) and holds no snapshot: the sim is deterministic, so the state at
 * `toMs` is a function of the entries before the rewind. `runReplay` therefore first reduces the record
 * to its *live timeline* — every continue entry drops the entries after it that its rewind abandoned
 * (`t >= toMs`, except an earlier grant at exactly `toMs`: the ring re-snapshots the granted state) and
 * takes their place at `toMs` as the grant — then plays that one linear timeline from the start: O(n) in
 * the record, no re-run per continue (the plain "re-run the prefix up to `toMs`" rule would cost one
 * extra pass per continue, O(k·n)). `REPLAY_MAX_CONTINUES` mirrors the game's own limit (one Continue
 * per attempt, `PlayScreen.hasContinued`); `parseReplay` refuses a record over it. The version stays 1:
 * the entry is optional, a record without one is as before; `verifyReplay` returns `continued` only for
 * the pre-SIM-R3 records that carry the flag without the entry (their rewind is not in the record).
 *
 * REV-1 (2026-11-19): every time in a record is a finite, non-negative number — `parseReplay` refuses `1e999`
 * (Infinity after JSON.parse), a negative `t` / `outcome.timeMs`, and an entry of the live timeline after the
 * recorded end (`t > outcome.timeMs`: the re-run stops at the end, so no loop could have applied it — a malformed
 * record, not a mismatch; the abandoned future of a Continue may lie past the end, it is not live). `runReplay`
 * caps a closed record's re-run at `maxMs` too when the caller gives one, so a finite but bogus `outcome.timeMs`
 * on a level the sim never closes by itself (a stalemate) ends at the budget with `reason: 'time'` instead of
 * spinning. Valid records are untouched: same bytes, same hashes, version 1.
 */

export const REPLAY_VERSION = 1;

/** SIM-R3: at most this many continue entries per record — the game offers one Continue per attempt. */
export const REPLAY_MAX_CONTINUES = 1;

/**
 * SIM-R2: the Daily / Weekly Challenge a record was played as — exactly the generator's inputs
 * (`challengeFor(key)` / `weeklyFor(key)` in src/daily/challenge.ts) plus the twist id for reading;
 * the level id, seed and modifiers the generator derives are the record's own fields.
 */
export interface ReplayChallenge {
  kind: 'daily' | 'weekly';
  /** The UTC day key (`YYYY-MM-DD`) of a daily, the Monday key of a weekly. */
  key: string;
  /** The twist's id (`Twist['id']`, e.g. `fastFeet`); informational — the modifiers are in the record. */
  twist: string;
}

/**
 * SIM-R3: what a Continue did to the match — the rewind target and the grant (`applyContinue`'s options as
 * they were at record time: `C.CONTINUE_FREEZE_MS` / `C.CONTINUE_INFANTRY`), so the re-run reproduces it
 * from the record alone.
 */
export interface ReplayContinue {
  /** `state.time` of the restored snapshot: the re-run rewinds to the state after the tick that reached it. */
  toMs: number;
  /** The free Freeze's length from `toMs`, ms (0: none). */
  freezeMs: number;
  /** Reinforcements added to the player's strongest tower (capped at its capacity). */
  infantry: number;
}

/** One applied command: `t` = `state.time` before the tick it was applied to; `a` = produced by a bot (AI hook). */
export interface ReplayCommandEntry {
  t: number;
  c: Command;
  a?: 1;
  r?: undefined;
}

/** SIM-R3: one Continue rewind: `t` = `state.time` of the defeat it was taken on; `r` = where to and what it granted. */
export interface ReplayContinueEntry {
  t: number;
  r: ReplayContinue;
  c?: undefined;
  a?: undefined;
}

export type ReplayEntry = ReplayCommandEntry | ReplayContinueEntry;

export interface ReplayOutcome {
  result: Outcome;
  /** `state.time` when the record was closed (the win / loss tick, or the capture moment of a running match). */
  timeMs: number;
  /** `hashState` of the state at `timeMs`. */
  hash: string;
}

export interface Replay {
  v: typeof REPLAY_VERSION;
  levelId: number;
  seed: number;
  modifiers: PlayerModifiers;
  /** `rulesId()` of the build that recorded it: snapshot layout version + hash of every sim constant. */
  rules: string;
  /** The level's `ai` (LV-13) at record time, carried so the enemies' commands can be re-derived by hand. */
  ai?: EnemyAiOptions;
  commands: ReplayEntry[];
  outcome?: ReplayOutcome;
  /**
   * Pre-SIM-R3 (before 2026-11-12): the match used the Continue rewind (ECON-6) but the record holds only
   * the abandoned future's commands, not the rewind — kept for reading, does not verify. A record whose
   * rewinds are entries (`r`) never carries it.
   */
  continued?: true;
  /** SIM-R2: the Daily / Weekly Challenge this match was (absent: a campaign match). */
  challenge?: ReplayChallenge;
}

/** FNV-1a 32-bit of a string, as 8 lower-case hex digits. Pure and cheap; collision-safe enough for a verify. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Identity of the rules a build plays: `SNAPSHOT_VERSION:<fnv1a of the constants table>`. Changes with any constant. */
export function rulesId(): string {
  return `${SNAPSHOT_VERSION}:${fnv1a(JSON.stringify(C))}`;
}

/**
 * Hash of a sim state: its JSON without `events` — the last tick's events are transient render / audio
 * input that the game loop drains after every step (`ui/loop.ts`) while a headless loop leaves them on
 * the state, so two identical matches would hash apart on them.
 */
export function hashState(state: GameState): string {
  return fnv1a(JSON.stringify({ ...state, events: [] }));
}

/** A fresh, open record for a match created with `createState(level, state.seed, state.modifiers)`. */
export function newReplay(level: LevelDef, state: GameState): Replay {
  const replay: Replay = {
    v: REPLAY_VERSION,
    levelId: level.id,
    seed: state.seed,
    modifiers: { ...state.modifiers },
    rules: rulesId(),
    commands: [],
  };
  if (level.ai) replay.ai = cloneAi(level.ai);
  return replay;
}

function cloneAi(ai: EnemyAiOptions): EnemyAiOptions {
  return JSON.parse(JSON.stringify(ai)) as EnemyAiOptions;
}

/** Append `cmd`, about to be applied to `state` before its next tick. `ai`: a bot produced it. */
export function recordInto(replay: Replay, state: GameState, cmd: Command, ai = false): ReplayEntry {
  const entry: ReplayEntry = ai ? { t: state.time, c: cmd, a: 1 } : { t: state.time, c: cmd };
  replay.commands.push(entry);
  return entry;
}

/**
 * Build a record from a log kept elsewhere (the play screen's, `ui/play.ts`) and close it on `state`.
 * `continued`: the match used a Continue — SIM-R3: the flag is only set when the log carries no continue
 * entry (a rewind the log has is verifiable; the play screen logs every rewind, so a live record never
 * carries the flag for a rewind — a `reinforcements` restart, which rewinds nothing, still passes it).
 * `challenge` (SIM-R2): the Daily / Weekly descriptor of the match, `challengeDescriptor(play.challenge, play.weekly)`.
 */
export function replayOf(level: LevelDef, state: GameState, commands: readonly ReplayEntry[], continued = false, challenge?: ReplayChallenge): Replay {
  const replay = newReplay(level, state);
  replay.commands = commands.map((e) => (e.r ? { t: e.t, r: { ...e.r } } : { ...e }));
  if (continued && !commands.some((e) => e.r)) replay.continued = true;
  if (challenge) replay.challenge = { kind: challenge.kind, key: challenge.key, twist: challenge.twist };
  return finishReplay(replay, state);
}

/**
 * SIM-R2: the record's `challenge` descriptor from the play screen's challenge objects (`PlayScreen.challenge`,
 * a `DailyChallenge`, or `PlayScreen.weekly`, a `WeeklyChallenge` — typed structurally: the sim does not
 * import src/daily). Undefined for a campaign match. Yesterday's map (DAILY-6) is the daily of its own key.
 */
export function challengeDescriptor(daily?: { dayKey: string; twist: { id: string } } | null, weekly?: { weekKey: string; twist: { id: string } } | null): ReplayChallenge | undefined {
  if (daily) return { kind: 'daily', key: daily.dayKey, twist: daily.twist.id };
  if (weekly) return { kind: 'weekly', key: weekly.weekKey, twist: weekly.twist.id };
  return undefined;
}

/** Close the record on `state`: outcome, time and hash. Returns the same record. */
export function finishReplay(replay: Replay, state: GameState): Replay {
  replay.outcome = { result: getOutcome(state), timeMs: state.time, hash: hashState(state) };
  return replay;
}

export function serializeReplay(replay: Replay): string {
  return JSON.stringify(replay);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Parse a serialized record; throws on a wrong version or a malformed shape (fields are checked, commands' bodies
 * are the sim's to validate). Times (`t`, `r.toMs`, `outcome.timeMs`) must be finite and ≥ 0; with an outcome,
 * no entry of the live timeline may stand after `outcome.timeMs` (REV-1).
 */
export function parseReplay(json: string): Replay {
  const raw: unknown = JSON.parse(json);
  if (!isRecord(raw)) throw new Error('replay: not an object');
  if (raw.v !== REPLAY_VERSION) throw new Error(`replay: version ${String(raw.v)} (expected ${REPLAY_VERSION})`);
  if (!Number.isInteger(raw.levelId)) throw new Error('replay: levelId must be an integer');
  if (typeof raw.seed !== 'number' || !Number.isFinite(raw.seed)) throw new Error('replay: seed must be a number');
  if (!isRecord(raw.modifiers)) throw new Error('replay: modifiers missing');
  if (typeof raw.rules !== 'string') throw new Error('replay: rules missing');
  if (!Array.isArray(raw.commands)) throw new Error('replay: commands must be an array');
  let continues = 0;
  raw.commands.forEach((e: unknown, i) => {
    if (!isRecord(e) || !isNum(e.t) || e.t < 0) throw new Error(`replay: command ${i} malformed`);
    if (e.r !== undefined) {
      // SIM-R3: a continue entry — the rewind target precedes (or is) the defeat it was taken on
      const r = e.r;
      if (e.c !== undefined || !isRecord(r) || !isNum(r.toMs) || !isNum(r.freezeMs) || !isNum(r.infantry) || r.toMs < 0 || r.toMs > e.t) throw new Error(`replay: continue ${i} malformed`);
      if (++continues > REPLAY_MAX_CONTINUES) throw new Error(`replay: ${continues} continues (max ${REPLAY_MAX_CONTINUES})`);
    } else if (!isRecord(e.c) || typeof e.c.type !== 'string') throw new Error(`replay: command ${i} malformed`);
  });
  if (raw.outcome !== undefined) {
    const o = raw.outcome;
    if (!isRecord(o) || typeof o.result !== 'string' || !isNum(o.timeMs) || o.timeMs < 0 || typeof o.hash !== 'string') throw new Error('replay: outcome malformed');
    // REV-1: an entry the re-run would reach after the end can never apply (`runReplay` stops at `timeMs`), so the
    // record contradicts itself — refused here like a continue before its `toMs`, not reported as a mismatch.
    // Checked on the live timeline: the future a Continue abandoned may lie past the end and is not replayed.
    const endMs = o.timeMs;
    const entries = raw.commands as ReplayEntry[];
    const late = liveTimeline(entries).find((e) => e.t > endMs);
    if (late) {
      const i = entries.findIndex((e) => e === late || (e.r !== undefined && e.r === late.r));
      throw new Error(`replay: command ${i} after the outcome (${late.t} > ${endMs} ms)`);
    }
  }
  if (raw.challenge !== undefined) {
    // SIM-R2: optional; a v1 record without it is a campaign match
    const c = raw.challenge;
    if (!isRecord(c) || (c.kind !== 'daily' && c.kind !== 'weekly') || typeof c.key !== 'string' || typeof c.twist !== 'string') throw new Error('replay: challenge malformed');
  }
  return raw as unknown as Replay;
}

export interface RunReplayOptions {
  /**
   * Sim-time budget, ms: the end of an open record (default 180 s like the headless runner); for a closed one,
   * REV-1: a cap on its `outcome.timeMs` (the re-run then ends early and `verifyReplay` reads `'time'`).
   * Absent on a closed record: the re-run goes to `outcome.timeMs`.
   */
  maxMs?: number;
}

/**
 * SIM-R3: the entries that shaped the final state, as one linear timeline. A continue entry drops the
 * entries its rewind abandoned — those after it with `t >= toMs` (the snapshot of `toMs` precedes the
 * commands of that tick), except an earlier grant standing at exactly `toMs` (the loop re-snapshots the
 * granted state, so a later rewind to the same tick restores it granted) — and stands at `toMs` itself as
 * the grant. The log's order is the loop's, so the live timeline's `t` never decreases.
 */
export function liveTimeline(entries: readonly ReplayEntry[]): ReplayEntry[] {
  const live: ReplayEntry[] = [];
  for (const e of entries) {
    if (e.r) {
      const toMs = e.r.toMs;
      let last: ReplayEntry | undefined;
      while ((last = live[live.length - 1]) && (last.t > toMs || (last.t === toMs && !last.r))) live.pop();
      live.push({ t: toMs, r: e.r });
    } else live.push(e);
  }
  return live;
}

/**
 * Re-run a record on `level`: the state is created from the record's seed and modifiers, every entry of
 * the live timeline (`liveTimeline`: the record itself without continues) is applied right before the tick
 * at its `t` (in record order; an entry whose `t` already passed is applied at once; a continue entry is
 * its grant, `applyContinue`, on the state of `toMs`), and the sim steps until the recorded
 * `outcome.timeMs` (or the match ends, or `maxMs` — the end of an open record, a cap on a closed one). Returns the final state —
 * compare it with `hashState` / `verifyReplay`. Cost: one pass over the record, continues or not.
 */
export function runReplay(level: LevelDef, replay: Replay, options: RunReplayOptions = {}): GameState {
  if (level.id !== replay.levelId) throw new Error(`replay: level ${replay.levelId} recorded, level ${level.id} given`);
  const state = createState(level, replay.seed, replay.modifiers);
  const rec = replay.outcome;
  const endMs = rec ? (options.maxMs === undefined ? rec.timeMs : Math.min(rec.timeMs, options.maxMs)) : (options.maxMs ?? 180_000);
  const live = liveTimeline(replay.commands);
  let i = 0;
  for (;;) {
    while (i < live.length && live[i]!.t <= state.time) {
      const e = live[i++]!;
      if (e.r) applyContinue(state, e.r); // null (no player tower) leaves the state as is: the loop would not have continued either
      else applyCommand(state, e.c);
    }
    if (state.time >= endMs || getOutcome(state) !== 'playing') break;
    step(state, C.TICK_MS);
  }
  return state;
}

export interface VerifyResult {
  /** `hashState` of the re-run's final state. */
  hash: string;
  /** The recorded hash, if the record was closed. */
  expected?: string;
  /** Re-run matches the record: same hash, same outcome, same time (false for an open record, or a pre-SIM-R3 `continued` one). */
  matches: boolean;
  /** The record's `rules` equals this build's `rulesId()`. */
  rulesMatch: boolean;
  outcome: Outcome;
  timeMs: number;
  /** Why `matches` is false, when it is (`continued`: the flag without continue entries — a rewind the record does not hold). */
  reason?: 'open' | 'continued' | 'hash' | 'outcome' | 'time';
  state: GameState;
}

/** Re-run a record and compare it with its recorded outcome. Never throws for a mismatch (only for a wrong level). */
export function verifyReplay(level: LevelDef, replay: Replay, options: RunReplayOptions = {}): VerifyResult {
  const state = runReplay(level, replay, options);
  const hash = hashState(state);
  const outcome = getOutcome(state);
  const rec = replay.outcome;
  const out: VerifyResult = { hash, matches: false, rulesMatch: replay.rules === rulesId(), outcome, timeMs: state.time, state };
  if (rec) out.expected = rec.hash;
  if (!rec) out.reason = 'open';
  else if (replay.continued) out.reason = 'continued';
  else if (state.time !== rec.timeMs) out.reason = 'time';
  else if (outcome !== rec.result) out.reason = 'outcome';
  else if (hash !== rec.hash) out.reason = 'hash';
  else out.matches = true;
  return out;
}
