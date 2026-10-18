import type { GameState } from '../sim/types';
import { chunkBackoff, loadChunk } from '../lazyChunk';
import type { Camera } from './camera';
import { FLAT } from './camera';
import type { View } from './view';
import type { PlayUi } from './draw';
import type { TutorialStep } from '../ui/tutorial';

/*
 * GD-5c: the tutorial bubble's placement and painter (./tutorialBubble.ts) are a lazy chunk — only a
 * first play of levels 1–4 draws them, and the eager bundle sits at its 82 kB ratchet. The play screen
 * calls `drawTutorial` every frame a step shows; the first call starts the download (a few ms from the
 * cache / the app bundle) and nothing is drawn until it lands; a failed download is retried after the
 * src/lazyChunk.ts back-off. `loadTutorialBubble` warms it ahead (tests await it).
 */

export const TUTORIAL_BUBBLE_CHUNK = 'tutorialBubble';
type BubbleModule = typeof import('./tutorialBubble');
let bubble: BubbleModule | null = null;
let bubblePromise: Promise<BubbleModule> | null = null;

/** Load the tutorial bubble chunk (idempotent; a failed fetch is forgotten so the next call retries). */
export function loadTutorialBubble(): Promise<BubbleModule> {
  bubblePromise ??= loadChunk(TUTORIAL_BUBBLE_CHUNK, () => import('./tutorialBubble'))
    .then((m) => (bubble = m))
    .catch((err: unknown) => {
      bubblePromise = null;
      throw err;
    });
  return bubblePromise;
}

/** Levels with a first-play tutorial (src/ui/tutorial.ts `tutorialFor`). */
const TUTORIAL_LEVELS = 4;

/** Warm the chunk ahead of a first play (`stars` < 1) of a tutorial level; null when not needed or already in. Never rejects. */
export function preloadTutorialBubble(levelId: number | undefined, stars: number): Promise<void> | null {
  if (bubble || levelId === undefined || stars >= 1 || levelId < 1 || levelId > TUTORIAL_LEVELS) return null;
  return loadTutorialBubble().then(
    () => undefined,
    () => undefined,
  );
}

/** True once the chunk is in. */
export function tutorialBubbleLoaded(): boolean {
  return bubble !== null;
}

/**
 * Draw the ring, arrow and hint for `step` (after `drawGame`, with the logical-map transform active):
 * render/tutorialBubble.ts `drawTutorialBubble` once the chunk is in; before that nothing, and the load
 * starts (or waits out a failure's back-off).
 */
export function drawTutorial(ctx: CanvasRenderingContext2D, state: GameState, view: View, ui: PlayUi, step: TutorialStep, nowMs: number, cam: Camera = FLAT): void {
  if (bubble) bubble.drawTutorialBubble(ctx, state, view, ui, step, nowMs, cam);
  else if (!chunkBackoff(TUTORIAL_BUBBLE_CHUNK)) void loadTutorialBubble().catch(() => undefined);
}
