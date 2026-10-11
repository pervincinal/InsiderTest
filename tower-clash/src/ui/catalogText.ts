/**
 * Translated catalog labels (I18N-2). The economy catalog (src/economy/catalog.ts) keeps its
 * English `label`s as the documentation twin and the fallback; the locale dictionaries carry the
 * same texts under `skin.<id>`, `skin.<id>.short`, `achievement.<id>` and `upgrade.name.<id>`
 * (tests/ui/i18n.test.ts checks every catalog id has its keys). Unknown ids fall back to the
 * catalog label so a new catalog entry never renders as a raw key.
 *
 * Achievement names are eager (the result / title toasts name them); the skin and upgrade-track
 * names only the shop draws, so they live in ./catalogTextShop.ts, a lazy module (PERF-8) — with
 * their English texts in ./locales/enMenus.ts.
 */
import type { AchievementDef } from '../economy/catalog';
import { hasEnglish, t } from './i18n';

/** `t(key)` when English knows `key` (as loaded so far), else the catalog's own `fallback` text. */
export function labelOf(key: string, fallback: string): string {
  return hasEnglish(key) ? t(key) : fallback;
}

export function achievementName(a: Pick<AchievementDef, 'id' | 'label'>): string {
  return labelOf(`achievement.${a.id}`, a.label);
}
