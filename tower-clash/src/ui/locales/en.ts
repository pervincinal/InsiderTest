/**
 * English — the reference dictionary. Every other locale must provide every key listed here
 * (enforced by the `Dictionary` type and tests/ui/i18n.test.ts). Keys are `area.name`; `{param}`
 * placeholders are filled by `t()`. Level names and lessons live in the level JSON (`name_az`,
 * `lesson_ru`, … — see `levelName` / `levelLesson` in ../i18n.ts); catalog labels (skins,
 * achievements, upgrade tracks) are the `skin.*` / `achievement.*` / `upgrade.name.*` keys,
 * keyed by catalog id. IAP product titles stay English (the stores show their own).
 *
 * The texts live in three files (PERF-8, PERF-10): ./enCore.ts — the strings the eager bundle draws —,
 * ./enMenus.ts — the strings only the lazy screens / cards draw, shipped in a lazy chunk — and
 * ./enTutorial.ts — the level 2–4 tutorial hints, shipped inside the lazy tutorial-steps chunk. Add a
 * key to enCore.ts when eagerly loaded code uses it, otherwise to enMenus.ts (tests/ui/i18nSplit.test.ts
 * tells which). Only types may be imported from this module by src/ — the value pulls in every part.
 */
import { enCore } from './enCore';
import { enMenus } from './enMenus';
import { enTutorial } from './enTutorial';

export const en = { ...enCore, ...enMenus, ...enTutorial } as const;

export type TranslationKey = keyof typeof enCore | keyof typeof enMenus | keyof typeof enTutorial;
/** A complete translation: every English key, no more, no less. */
export type Dictionary = Readonly<Record<TranslationKey, string>>;
