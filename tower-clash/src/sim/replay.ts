import type { Command, EnemyAiOptions, GameState, LevelDef, Outcome, PlayerModifiers } from './types';
import { C } from './constants';
import { createState } from './create';
import { applyCommand } from './commands';
import { step } from './step';
import { getOutcome } from './outcome';
import { SNAPSHOT_VERSION } from './snapshot';

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
 */

export const REPLAY_VERSION = 1;

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

/** One applied command: `t` = `state.time` before the tick it was applied to; `a` = produced by a bot (AI hook). */
export interface ReplayEntry {
  t: number;
  c: Command;
  a?: 1;
}

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
   * The match used the Continue rewind (ECON-6): the record holds the abandoned future's commands and
   * not the reinforcements, so it is kept for reading but does not verify (v1 limitation).
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
 * `challenge` (SIM-R2): the Daily / Weekly descriptor of the match, `challengeDescriptor(play.challenge, play.weekly)`.
 */
export function replayOf(level: LevelDef, state: GameState, commands: readonly ReplayEntry[], continued = false, challenge?: ReplayChallenge): Replay {
  const replay = newReplay(level, state);
  replay.commands = commands.map((e) => ({ ...e }));
  if (continued) replay.continued = true;
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

/** Parse a serialized record; throws on a wrong version or a malformed shape (fields are checked, commands' bodies are the sim's to validate). */
export function parseReplay(json: string): Replay {
  const raw: unknown = JSON.parse(json);
  if (!isRecord(raw)) throw new Error('replay: not an object');
  if (raw.v !== REPLAY_VERSION) throw new Error(`replay: version ${String(raw.v)} (expected ${REPLAY_VERSION})`);
  if (!Number.isInteger(raw.levelId)) throw new Error('replay: levelId must be an integer');
  if (typeof raw.seed !== 'number' || !Number.isFinite(raw.seed)) throw new Error('replay: seed must be a number');
  if (!isRecord(raw.modifiers)) throw new Error('replay: modifiers missing');
  if (typeof raw.rules !== 'string') throw new Error('replay: rules missing');
  if (!Array.isArray(raw.commands)) throw new Error('replay: commands must be an array');
  raw.commands.forEach((e: unknown, i) => {
    if (!isRecord(e) || typeof e.t !== 'number' || !isRecord(e.c) || typeof e.c.type !== 'string') throw new Error(`replay: command ${i} malformed`);
  });
  if (raw.outcome !== undefined) {
    const o = raw.outcome;
    if (!isRecord(o) || typeof o.result !== 'string' || typeof o.timeMs !== 'number' || typeof o.hash !== 'string') throw new Error('replay: outcome malformed');
  }
  if (raw.challenge !== undefined) {
    // SIM-R2: optional; a v1 record without it is a campaign match
    const c = raw.challenge;
    if (!isRecord(c) || (c.kind !== 'daily' && c.kind !== 'weekly') || typeof c.key !== 'string' || typeof c.twist !== 'string') throw new Error('replay: challenge malformed');
  }
  return raw as unknown as Replay;
}

export interface RunReplayOptions {
  /** Sim-time budget when the record has no outcome, ms (default 180 s like the headless runner). */
  maxMs?: number;
}

/**
 * Re-run a record on `level`: the state is created from the record's seed and modifiers, every entry is
 * applied right before the tick at its `t` (in record order; an entry whose `t` already passed is applied
 * at once), and the sim steps until the recorded `outcome.timeMs` (or the match ends, or `maxMs` when the
 * record is open). Returns the final state — compare it with `hashState` / `verifyReplay`.
 */
export function runReplay(level: LevelDef, replay: Replay, options: RunReplayOptions = {}): GameState {
  if (level.id !== replay.levelId) throw new Error(`replay: level ${replay.levelId} recorded, level ${level.id} given`);
  const state = createState(level, replay.seed, replay.modifiers);
  const endMs = replay.outcome?.timeMs ?? options.maxMs ?? 180_000;
  const cmds = replay.commands;
  let i = 0;
  while (state.time < endMs) {
    while (i < cmds.length && cmds[i]!.t <= state.time) applyCommand(state, cmds[i++]!.c);
    step(state, C.TICK_MS);
    if (getOutcome(state) !== 'playing') break;
  }
  return state;
}

export interface VerifyResult {
  /** `hashState` of the re-run's final state. */
  hash: string;
  /** The recorded hash, if the record was closed. */
  expected?: string;
  /** Re-run matches the record: same hash, same outcome, same time (false for an open or a continued record). */
  matches: boolean;
  /** The record's `rules` equals this build's `rulesId()`. */
  rulesMatch: boolean;
  outcome: Outcome;
  timeMs: number;
  /** Why `matches` is false, when it is. */
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
