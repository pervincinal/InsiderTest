import { chunkBackoff, chunkFailures, loadChunk } from '../lazyChunk';

/*
 * PERF-16: the Daily / Weekly Challenge result rules (./daily.ts + ./weekly.ts, re-exported by
 * ./challengeRecord.ts) are not in the eager bundle. A campaign match never needs them. A challenge
 * match warms the chunk at its start; it is normally in already, since the level map that offers the
 * challenge cards imports the same modules (QA-49-1: the title's idle preload no longer requests it on
 * its own — the map's graph fetches the same URL, and a standalone request that failed pinned the
 * module map against the map itself). When it is not in at the outcome, the play screen holds the
 * result beat's frame and books the result once it lands (`PlayScreen.update` retries under the
 * src/lazyChunk.ts back-off, the existing load-failed toast once per failed download): the result is
 * never lost or booked twice. QA-49-2: the retry's `?r=` re-fetch names `recordChallengeResult` so it
 * resolves the module, not the raw chunk namespace Rollup wraps it in.
 * Not a static import of ./daily or ./weekly from anything src/main.ts reaches (tests/repo/hygiene.test.ts).
 */

export const CHALLENGE_CHUNK = 'challenge';

export type ChallengeChunk = typeof import('./challengeRecord');

let chunk: ChallengeChunk | null = null;
let chunkPromise: Promise<ChallengeChunk> | null = null;

/** Load the challenge rules chunk (idempotent; a failed download is forgotten so the next call retries). */
export function loadChallengeChunk(): Promise<ChallengeChunk> {
  if (chunk) return Promise.resolve(chunk);
  chunkPromise ??= loadChunk(CHALLENGE_CHUNK, () => import('./challengeRecord'), 'recordChallengeResult')
    .then((m) => (chunk = m))
    .catch((err: unknown) => {
      chunkPromise = null;
      throw err;
    });
  return chunkPromise;
}

/** Start the download unless the chunk is in or failed a moment ago (frame-time back-off). Never rejects. */
export function warmChallengeChunk(): void {
  if (!chunk && !chunkBackoff(CHALLENGE_CHUNK)) void loadChallengeChunk().catch(() => undefined);
}

/** The chunk's module once it is in, else null (warm it and try again next frame). */
export function challengeChunk(): ChallengeChunk | null {
  return chunk;
}

/** Consecutive failed downloads of the chunk on this page (0 once it is in). */
export function challengeChunkFailures(): number {
  return chunkFailures(CHALLENGE_CHUNK);
}

/** Test hook (tests/setup.ts): the chunk's module imported directly, or null to start from "not in". */
export function registerChallengeChunk(m: ChallengeChunk | null): void {
  chunk = m;
  chunkPromise = null;
}
