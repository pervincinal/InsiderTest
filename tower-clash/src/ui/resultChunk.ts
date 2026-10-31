import { chunkBackoff, chunkFailures, loadChunk } from '../lazyChunk';
import type { ResultInfo, ResultScreen } from './result';
import type { App } from './screens';

/*
 * PERF-11: the result screen (./result.ts — the offers, the share / review hooks, the defeat tip
 * bookkeeping) is a lazy chunk. It is reached only after an outcome, so the title's idle preload
 * (src/main.ts `preloadLazy`, which also makes the worker cache it for an offline first play) and the
 * play screen's start warm it; the AUD-F4 result beat (`RESULT_BEAT_MS`) then covers any download
 * still in flight. When the beat is over and the chunk is not in, the play screen keeps the undimmed
 * last frame until it lands (`PlayScreen.update` retries under the src/lazyChunk.ts back-off) — the
 * result is already booked, the card only waits. Not a static import of ./result.ts on purpose
 * (tests/repo/hygiene.test.ts).
 */

export const RESULT_CHUNK = 'result';

type ResultChunk = typeof import('./result');

let chunk: ResultChunk | null = null;
let chunkPromise: Promise<ResultChunk> | null = null;

/** Load the result screen chunk (idempotent; a failed download is forgotten so the next call retries). */
export function loadResultChunk(): Promise<ResultChunk> {
  if (chunk) return Promise.resolve(chunk);
  chunkPromise ??= loadChunk(RESULT_CHUNK, () => import('./result'))
    .then((m) => (chunk = m))
    .catch((err: unknown) => {
      chunkPromise = null;
      throw err;
    });
  return chunkPromise;
}

/** Start the download unless the chunk is in or failed a moment ago (frame-time back-off). Never rejects. */
export function warmResultChunk(): void {
  if (!chunk && !chunkBackoff(RESULT_CHUNK)) void loadResultChunk().catch(() => undefined);
}

/** True once the chunk is in. */
export function resultChunkLoaded(): boolean {
  return chunk !== null;
}

/** Consecutive failed downloads of the chunk on this page (0 once it is in). */
export function resultChunkFailures(): number {
  return chunkFailures(RESULT_CHUNK);
}

/** The result screen for `info`, or null while the chunk is not in (warm it and try again next frame). */
export function makeResultScreen(app: App, info: ResultInfo): ResultScreen | null {
  return chunk ? new chunk.ResultScreen(app, info) : null;
}

/** Test hook (tests/setup.ts): the chunk's module, imported directly — tests build result screens synchronously. */
export function registerResultChunk(m: ResultChunk): void {
  chunk = m;
}
