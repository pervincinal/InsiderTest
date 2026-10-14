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

registerEnglish(enMenus);
// PERF-9: the enemy AI is a lazy chunk the game loads before a level starts (src/ui/ai.ts); tests
// build play screens directly
registerAi(ai);
