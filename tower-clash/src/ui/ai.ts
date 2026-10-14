import { loadChunk } from '../lazyChunk';

/*
 * PERF-9: the enemy AI (src/ai/*, ≈ 6 kB gzip) is a lazy chunk. Nothing before the first PLAY needs
 * it, and a level start already waits for its level chunk: `main.ts startLevel` awaits `loadAi()`
 * alongside it (and the idle preload after the first frame warms it with the current level), so a
 * `PlayScreen` is only ever built once the AI is in. Unlike a cosmetic chunk it is load-bearing — the
 * match is a deterministic function of the AI's commands — so there is no fallback: a failed download
 * fails the level start like a failed level chunk (toast, retry on the next tap, src/lazyChunk.ts).
 * Only types cross this boundary statically — the debug surface too (`aiModule().referencePlayerCommands`):
 * a static import there would split src/ai into two chunks, and Vite then injects `<link rel=modulepreload>`
 * tags for them at runtime (e2e/pwa.spec.ts reads the page's modulepreloads as the shell).
 */

/** What the game uses of the AI (the debug surface's autoplay takes the reference player). */
export type AiModule = Pick<typeof import('../ai/index'), 'enemyCommands' | 'isAiTick' | 'rngsFor' | 'referencePlayerCommands'>;

export const AI_CHUNK = 'ai';
let ai: AiModule | null = null;
let aiPromise: Promise<AiModule> | null = null;

/** Load the AI chunk (idempotent; a failed fetch is forgotten so the next call retries). */
export function loadAi(): Promise<AiModule> {
  aiPromise ??= loadChunk(AI_CHUNK, () => import('../ai/index'))
    .then((m) => (ai = m))
    .catch((err: unknown) => {
      aiPromise = null;
      throw err;
    });
  return aiPromise;
}

/** True once the AI chunk is in (a level can start synchronously). */
export function aiLoaded(): boolean {
  return ai !== null;
}

/** Install the AI without the chunk loader (tests/setup.ts: unit tests build play screens directly). */
export function registerAi(m: AiModule): void {
  ai = m;
}

/** The loaded AI. Throws when called before `loadAi()` resolved: a play screen is never built earlier. */
export function aiModule(): AiModule {
  if (!ai) throw new Error('the AI chunk is not loaded (startLevel awaits loadAi)');
  return ai;
}
