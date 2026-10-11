/**
 * Vitest setup (PERF-8). In the game, the English menu strings (src/ui/locales/enMenus.ts) arrive
 * through `loadEnglishMenus()` together with the lazy chunks that draw them; tests import those
 * screens and drawers directly, so register the strings here once. tests/ui/i18nSplit.test.ts checks
 * the runtime side (no eager module needs them, nothing imports them statically).
 */
import { registerEnglish } from '../src/ui/i18n';
import { enMenus } from '../src/ui/locales/enMenus';

registerEnglish(enMenus);
