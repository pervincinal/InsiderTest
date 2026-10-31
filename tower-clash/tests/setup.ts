/**
 * Vitest setup (PERF-8, PERF-9). In the game, the English menu strings (src/ui/locales/enMenus.ts) arrive
 * through `loadEnglishMenus()` together with the lazy chunks that draw them; tests import those
 * screens and drawers directly, so register the strings here once. tests/ui/i18nSplit.test.ts checks
 * the runtime side (no eager module needs them, nothing imports them statically).
 */
import * as ai from '../src/ai/index';
import { registerAi } from '../src/ui/ai';
import { registerEnglish } from '../src/ui/i18n';
import { enMenus } from '../src/ui/locales/enMenus';
import { registerTutorialSteps } from '../src/ui/tutorial';
import { LATE_STEPS, enTutorial } from '../src/ui/tutorialSteps';

registerEnglish(enMenus);
// PERF-9: the enemy AI is a lazy chunk the game loads before a level starts (src/ui/ai.ts); tests
// build play screens directly
registerAi(ai);
// PERF-10: the level 2–4 tutorial steps and their English hints are a lazy chunk the level start loads
// (src/ui/tutorialChunk.ts); tests build tutorials and play screens directly
registerEnglish(enTutorial);
registerTutorialSteps(LATE_STEPS);
// PERF-11: not the result chunk (src/ui/result.ts): its graph reaches src/native/index.ts, which the provider tests
// mock — a play-to-result test imports tests/registerResult.ts instead
