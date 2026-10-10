/**
 * UI strings (I18N). `t(key, params)` reads the current language's dictionary and falls back to
 * English for any key the dictionary lacks or while its chunk is still loading. English is bundled
 * eagerly (it is the fallback); az / ru / tr are dynamic imports so the eager bundle carries one
 * dictionary only. The chosen language persists in `save.settings.language` (src/ui/save.ts); the
 * app detects it from `navigator.language` on the first run (`detectLanguage`).
 *
 * No DOM access except the optional `<html lang>` update, so the sim and tests stay clean.
 */
import type { Dictionary, TranslationKey } from './locales/en';
import { en } from './locales/en';

export type { Dictionary, TranslationKey } from './locales/en';

export const LANGUAGE_CODES = ['en', 'az', 'ru', 'tr'] as const;
export type Language = (typeof LANGUAGE_CODES)[number];

/** Picker entries: the language's own name (no flags). */
export const LANGUAGES: readonly { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'az', label: 'Azərbaycanca' },
  { code: 'ru', label: 'Русский' },
  { code: 'tr', label: 'Türkçe' },
];

export const DEFAULT_LANGUAGE: Language = 'en';

export function isLanguage(v: unknown): v is Language {
  return typeof v === 'string' && (LANGUAGE_CODES as readonly string[]).includes(v);
}

const loaders: Record<Language, () => Promise<Dictionary>> = {
  en: () => Promise.resolve(en),
  az: () => import('./locales/az').then((m) => m.az),
  ru: () => import('./locales/ru').then((m) => m.ru),
  tr: () => import('./locales/tr').then((m) => m.tr),
};

const loaded: Partial<Record<Language, Dictionary>> = { en };
const pending: Partial<Record<Language, Promise<void>>> = {};
let current: Language = DEFAULT_LANGUAGE;
const listeners = new Set<(code: Language) => void>();

export function currentLanguage(): Language {
  return current;
}

/** True once the dictionary of `code` is in memory (`t()` no longer falls back to English). */
export function isLanguageLoaded(code: Language): boolean {
  return loaded[code] !== undefined;
}

/** Tests / preloading: put a dictionary in memory without a dynamic import. */
export function registerDictionary(code: Language, dict: Dictionary): void {
  loaded[code] = dict;
}

/** Fetch a dictionary (no-op when present). Never rejects: a failed chunk leaves English in place. */
export function loadLanguage(code: Language): Promise<void> {
  if (loaded[code]) return Promise.resolve();
  let p = pending[code];
  if (!p) {
    p = loaders[code]()
      .then((dict) => {
        loaded[code] = dict;
      })
      .catch(() => undefined)
      .finally(() => {
        delete pending[code];
      });
    pending[code] = p;
  }
  return p;
}

/**
 * Switch the UI language. Takes effect at once (English strings until the dictionary arrives, if
 * it is not loaded yet); the promise resolves when the dictionary is in. Unknown codes → English.
 */
export function setLanguage(code: Language): Promise<void> {
  const next = isLanguage(code) ? code : DEFAULT_LANGUAGE;
  const changed = next !== current;
  current = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  if (changed) for (const fn of listeners) fn(next);
  return loadLanguage(next);
}

/** Subscribe to language switches (font warm-up, redraws). Returns the unsubscribe function. */
export function onLanguageChange(fn: (code: Language) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export type Params = Readonly<Record<string, string | number>>;

/* ---------- Plural forms (L10N-2) ---------- */

/**
 * Plural rule of each language: the count → the index of the form to use in `{n|form0|form1|…}`.
 * EN one / other; RU one / few / many (fractions take the "few" form — CLDR "other", the genitive
 * singular: "1,5 кристалла"); AZ and TR do not inflect a noun after a numeral, so every count takes
 * the first form. Negative counts follow their absolute value.
 */
export const PLURAL_RULES: Readonly<Record<Language, (n: number) => number>> = {
  en: (n) => (n === 1 ? 0 : 1),
  ru: (n) => {
    if (!Number.isInteger(n)) return 1;
    const d = n % 10;
    const dd = n % 100;
    if (d === 1 && dd !== 11) return 0;
    if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 1;
    return 2;
  },
  az: () => 0,
  tr: () => 0,
};

/** Form names in index order, per language (docs and tests; the dictionaries list forms in this order). */
export const PLURAL_FORMS: Readonly<Record<Language, readonly string[]>> = {
  en: ['one', 'other'],
  ru: ['one', 'few', 'many'],
  az: ['other'],
  tr: ['other'],
};

/** A numeric parameter as a count: numbers as they are, strings stripped of separators ("1 000"). */
function countOf(v: string | number): number {
  return Math.abs(typeof v === 'number' ? v : Number(v.replace(/[^\d.-]/g, '')));
}

/** Pick `forms[rule(n)]` for `lang`; a missing form (or a non-numeric `n`) falls back to the last one. */
export function pluralForm(lang: Language, n: string | number, forms: readonly string[]): string {
  const last = forms[forms.length - 1] ?? '';
  const c = countOf(n);
  if (!Number.isFinite(c)) return last;
  return forms[(PLURAL_RULES[lang] ?? PLURAL_RULES.en)(c)] ?? last;
}

const PLACEHOLDER = /\{(\w+)\}/g;
const PLACEHOLDER_OR_FORMS = /\{(\w+)((?:\|[^{}|]*)+)?\}/g;

/**
 * Replace `{name}` placeholders and plural choices `{name|one|few|many}` (RU) / `{name|one|other}`
 * (EN): the forms are picked by `lang`'s plural rule from the number in `params[name]` (write
 * `'{n} {n|достижение|достижения|достижений}'` to show the number too). Unknown placeholders are
 * left as they are. Strings without `|` take the plain single-pass path.
 */
export function interpolate(template: string, params?: Params, lang: Language = current): string {
  if (!params || template.indexOf('{') === -1) return template;
  if (template.indexOf('|') === -1) {
    return template.replace(PLACEHOLDER, (m, name: string) => {
      const v = params[name];
      return v === undefined ? m : String(v);
    });
  }
  return template.replace(PLACEHOLDER_OR_FORMS, (m, name: string, forms: string | undefined) => {
    const v = params[name];
    if (v === undefined) return m;
    return forms === undefined ? String(v) : pluralForm(lang, v, forms.slice(1).split('|'));
  });
}

/**
 * Translate `key` in the current language (English fallback, then the key itself). Plural forms
 * follow the language the string came from, so an English fallback keeps English forms.
 */
export function t(key: TranslationKey, params?: Params): string {
  const own = loaded[current]?.[key];
  if (own !== undefined) return interpolate(own, params, current);
  return interpolate(en[key] ?? key, params, 'en');
}

/**
 * Pick the game language from the browser's preferences (`navigator.languages`, then
 * `navigator.language`): the first entry whose primary subtag we ship, else English.
 * Accepts a single tag, a list, or nothing.
 */
export function detectLanguage(preferred?: string | readonly string[] | null): Language {
  const list = preferred === undefined || preferred === null ? [] : typeof preferred === 'string' ? [preferred] : preferred;
  for (const tag of list) {
    if (typeof tag !== 'string') continue;
    const primary = tag.toLowerCase().split(/[-_]/)[0] ?? '';
    if (isLanguage(primary)) return primary;
  }
  return DEFAULT_LANGUAGE;
}

/** The browser's preference list (empty outside a browser). */
export function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  const list = navigator.languages;
  if (Array.isArray(list) && list.length) return list;
  return navigator.language ? [navigator.language] : [];
}

/* ---------- Level text (I18N-2) ---------- */

/**
 * Optional translated `name` / `lesson` of a level (level JSON fields `name_az`, `lesson_ru`, …).
 * English lives in `name` / `lesson`; a missing or empty translation falls back to it.
 */
export interface LevelTextTranslations {
  readonly name_az?: string;
  readonly name_ru?: string;
  readonly name_tr?: string;
  readonly lesson_az?: string;
  readonly lesson_ru?: string;
  readonly lesson_tr?: string;
}

export type LevelTextField = 'name' | 'lesson';

/** `name_ru`, `lesson_az`, … — the JSON key of a translated level field (none for English). */
export function levelTextKey(field: LevelTextField, lang: Language): keyof LevelTextTranslations | undefined {
  return lang === 'en' ? undefined : (`${field}_${lang}` as keyof LevelTextTranslations);
}

function levelText(level: Readonly<Partial<Record<LevelTextField, string>> & LevelTextTranslations>, field: LevelTextField, lang: Language): string {
  const key = levelTextKey(field, lang);
  const translated = key ? level[key] : undefined;
  if (typeof translated === 'string' && translated.trim() !== '') return translated;
  return level[field] ?? '';
}

/** A level's name in `lang` (default: the current UI language); English when untranslated. */
export function levelName(level: Readonly<{ name: string } & LevelTextTranslations>, lang: Language = current): string {
  return levelText(level, 'name', lang);
}

/** A level's lesson in `lang` (default: the current UI language); English when untranslated. */
export function levelLesson(level: Readonly<{ lesson: string } & LevelTextTranslations>, lang: Language = current): string {
  return levelText(level, 'lesson', lang);
}

/** Next language in picker order (title chip tap). */
export function nextLanguage(code: Language): Language {
  const i = LANGUAGE_CODES.indexOf(code);
  return LANGUAGE_CODES[(i + 1) % LANGUAGE_CODES.length] ?? DEFAULT_LANGUAGE;
}
