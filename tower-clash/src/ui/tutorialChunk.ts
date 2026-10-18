import { loadChunk } from '../lazyChunk';
import { registerEnglish } from './i18n';
import { registerTutorialSteps } from './tutorial';

/*
 * PERF-10: the tutorial steps of levels 2–4 and their English hints (./tutorialSteps.ts) are a lazy
 * chunk. Only a first play of those levels reads them, so `main.ts startLevel` requests the chunk with
 * the level chunk and the AI (and the idle preloads warm it with the current / next level, like the
 * level chunk). Unlike the AI it is not load-bearing: the start waits for it only as long as for the
 * cosmetic chunks, and when it is late or fails the level starts without the tutorial and the play
 * screen shows it the moment the chunk arrives (`PlayScreen.update` retries under the src/lazyChunk.ts
 * back-off). Not a static import of ./tutorialSteps.ts on purpose (tests/ui/tutorialChunk.test.ts).
 */

export const TUTORIAL_CHUNK = 'tutorialSteps';
/** Levels whose steps live in the chunk (level 1's stay eager in ./tutorial.ts). */
const FIRST_LATE = 2;
const LAST_LATE = 4;

let stepsIn = false;
let stepsPromise: Promise<void> | null = null;

/** True when a play of `levelId` with `stars` would show a tutorial whose steps are in the lazy chunk. */
export function needsTutorialSteps(levelId: number, stars: number): boolean {
  return stars < 1 && levelId >= FIRST_LATE && levelId <= LAST_LATE;
}

/** Load the chunk and register its steps and English hints (idempotent; a failed fetch is forgotten so the next call retries). */
export function loadTutorialSteps(): Promise<void> {
  if (stepsIn) return Promise.resolve();
  stepsPromise ??= loadChunk(TUTORIAL_CHUNK, () => import('./tutorialSteps'))
    .then((m) => {
      registerEnglish(m.enTutorial);
      registerTutorialSteps(m.LATE_STEPS);
      stepsIn = true;
    })
    .catch((err: unknown) => {
      stepsPromise = null;
      throw err;
    });
  return stepsPromise;
}

/** True once the chunk is in (`tutorialFor` covers levels 2–4). */
export function tutorialStepsLoaded(): boolean {
  return stepsIn;
}

/** The pending load when a play of `levelId` needs the chunk and it is not in yet, else null. Never rejects. */
export function preloadTutorialSteps(levelId: number | undefined, stars: number): Promise<void> | null {
  if (stepsIn || levelId === undefined || !needsTutorialSteps(levelId, stars)) return null;
  return loadTutorialSteps().catch(() => undefined);
}
