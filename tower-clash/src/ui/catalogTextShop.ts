/**
 * Translated skin and upgrade-track names (I18N-2) — the shop's half of ./catalogText.ts, kept out
 * of the eager bundle (PERF-8): only the shop (lazy chunk, ./lazyScreens.ts) draws them, and their
 * English texts are in ./locales/enMenus.ts, which that chunk registers before any screen runs.
 */
import type { CommanderUpgradeDef, SkinDef } from '../economy/catalog';
import { labelOf } from './catalogText';

/** Full skin name, e.g. "Slate roof" (toasts, bundle lines). */
export function skinName(skin: Pick<SkinDef, 'id' | 'label'>): string {
  return labelOf(`skin.${skin.id}`, skin.label);
}

/** Short skin name for the shop card under its family header, e.g. "Slate". */
export function skinShortName(skin: Pick<SkinDef, 'id' | 'label'>): string {
  return labelOf(`skin.${skin.id}.short`, skin.label.replace(/ (roof|helmet)$/i, ''));
}

export function upgradeName(u: Pick<CommanderUpgradeDef, 'id' | 'label'>): string {
  return labelOf(`upgrade.name.${u.id}`, u.label);
}
