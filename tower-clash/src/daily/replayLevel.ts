import type { LevelDef, PlayerModifiers } from '../sim/types';
import type { Replay, ReplayChallenge } from '../sim/replay';
import { loadLevel } from '../levels/index';
import { challengeFor, weeklyFor } from './challenge';
import type { Twist } from './challenge';

/*
 * SIM-R2 (2026-11-11): the level a replay record re-runs on. A campaign record names a shipped level by id;
 * a Daily / Weekly record (`replay.challenge`, src/sim/replay.ts `ReplayChallenge`) names the challenge by
 * its generator inputs (kind + day / week key), so the record is rebuilt here through the generator itself
 * (`challengeFor` / `weeklyFor`, src/daily/challenge.ts) and the record's own level id, seed, twist id and
 * modifiers are checked against the rebuilt challenge before the sim re-runs it — a record whose descriptor
 * does not describe its match (a tampered key, another twist, a hand-edited seed) is refused.
 *
 * Outside src/sim on purpose (the sim never imports src/daily; the record carries data only) and lazy
 * like the generator: reached by the debug `verifyReplay` hook (src/debug.ts), `scripts/replay.ts` and the
 * tests. The level loader is injectable so the node script can hand in its synchronous JSON reader.
 */

/** The challenge a descriptor names, as the generator makes it (`challengeFor` / `weeklyFor`). */
export interface RebuiltChallenge {
  kind: ReplayChallenge['kind'];
  key: string;
  levelId: number;
  seed: number;
  twist: Twist;
}

/** Rebuild the challenge from its descriptor; throws on a malformed day key or a non-Monday week key (the generator's own errors). */
export function rebuildChallenge(c: ReplayChallenge): RebuiltChallenge {
  if (c.kind === 'daily') {
    const d = challengeFor(c.key);
    return { kind: 'daily', key: c.key, levelId: d.levelId, seed: d.seed, twist: d.twist };
  }
  const w = weeklyFor(c.key);
  return { kind: 'weekly', key: c.key, levelId: w.levelId, seed: w.seed, twist: w.twist };
}

/** Fixed field order, so two modifier sets compare by value whatever their key order. */
function modifiersKey(m: Readonly<PlayerModifiers>): string {
  return `${m.productionMul}|${m.capacityMul}|${m.startGarrisonBonus}|${m.unitSpeedMul}`;
}

/**
 * Why the record's descriptor does not describe the record, or null when it does (or when the record is a
 * campaign one). A generator error (bad key) is reported as the mismatch, never thrown.
 */
export function challengeMismatch(replay: Replay): string | null {
  const c = replay.challenge;
  if (!c) return null;
  let built: RebuiltChallenge;
  try {
    built = rebuildChallenge(c);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  const what = `${c.kind} ${c.key}`;
  if (built.levelId !== replay.levelId) return `${what} plays level ${built.levelId}, the record says level ${replay.levelId}`;
  if (built.seed !== replay.seed) return `${what} plays seed ${built.seed}, the record says seed ${replay.seed}`;
  if (built.twist.id !== c.twist) return `${what} plays twist ${built.twist.id}, the record says ${c.twist}`;
  if (modifiersKey(built.twist.modifiers) !== modifiersKey(replay.modifiers)) return `${what} twist ${built.twist.id} has modifiers ${JSON.stringify(built.twist.modifiers)}, the record ${JSON.stringify(replay.modifiers)}`;
  return null;
}

export type LevelLoader = (id: number) => LevelDef | undefined | Promise<LevelDef | undefined>;

/**
 * The level to re-run `replay` on: a challenge record is rebuilt and checked first (`challengeMismatch`), then —
 * like a campaign record — its shipped level is loaded (`loadLevel` of src/levels by default; the node script
 * passes its synchronous reader). Throws on a mismatch or an unknown level.
 */
export async function levelForReplay(replay: Replay, load: LevelLoader = loadLevel): Promise<LevelDef> {
  const why = challengeMismatch(replay);
  if (why) throw new Error(`replay: challenge descriptor does not match the record — ${why}`);
  const level = await load(replay.levelId);
  if (!level) throw new Error(`replay: level ${replay.levelId} is not a shipped level`);
  return level;
}
