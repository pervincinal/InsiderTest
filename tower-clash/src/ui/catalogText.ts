/**
 * Translated catalog labels (I18N-2). The economy catalog (src/economy/catalog.ts) keeps its
 * English `label`s as the documentation twin and the fallback; the locale dictionaries carry the
 * same texts under `skin.<id>`, `skin.<id>.short`, `achievement.<id>` and `upgrade.name.<id>`
 * (tests/ui/i18n.test.ts checks every catalog id has its keys). Unknown ids fall back to the
 * catalog label so a new catalog entry never renders as a raw key.
 */
import type { AchievementDef, CommanderUpgradeDef, SkinDef } from '../economy/catalog';
import { t } from './i18n';
import type { TranslationKey } from './i18n';
import { en } from './locales/en';

function labelOf(key: string, fallback: string): string {
  return key in en ? t(key as TranslationKey) : fallback;
}

/** Full skin name, e.g. "Slate roof" (toasts, bundle lines). */
export function skinName(skin: Pick<SkinDef, 'id' | 'label'>): string {
  return labelOf(`skin.${skin.id}`, skin.label);
}

/** Short skin name for the shop card under its family header, e.g. "Slate". */
export function skinShortName(skin: Pick<SkinDef, 'id' | 'label'>): string {
  return labelOf(`skin.${skin.id}.short`, skin.label.replace(/ (roof|helmet)$/i, ''));
}

export function achievementName(a: Pick<AchievementDef, 'id' | 'label'>): string {
  return labelOf(`achievement.${a.id}`, a.label);
}

export function upgradeName(u: Pick<CommanderUpgradeDef, 'id' | 'label'>): string {
  return labelOf(`upgrade.name.${u.id}`, u.label);
}
