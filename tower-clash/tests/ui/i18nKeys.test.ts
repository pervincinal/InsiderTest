import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../../src/ui/locales/en';
import { az } from '../../src/ui/locales/az';
import { ru } from '../../src/ui/locales/ru';
import { tr } from '../../src/ui/locales/tr';
import { BOOSTER_KINDS } from '../../src/ui/boosters';
import { TWISTS } from '../../src/daily/challenge';
import { LEVEL_MANIFEST } from '../../src/levels/manifest';

/*
 * Every translation key the code asks for exists in all four dictionaries — independent of the
 * TypeScript `TranslationKey` type, so a `t(key as TranslationKey)` cast or a template key built at
 * runtime (`booster.${kind}`, `daily.twist.${id}`) can never render as a raw key in any language.
 */

const DICTS: Record<string, Record<string, string>> = { en, az, ru, tr };
const SRC = new URL('../../src/', import.meta.url).pathname;

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') && !p.includes('/locales/')) out.push(p);
  }
  return out;
}

/** Literal keys `t('a.b')` and template keys `t(\`a.${x}\`)` (returned as their prefix) used in src/. */
function usedKeys(): { literal: Set<string>; templates: Set<string> } {
  const literal = new Set<string>();
  const templates = new Set<string>();
  for (const file of walk(SRC)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([^']+)'/g)) literal.add(m[1]!);
    for (const m of src.matchAll(/\bt\(\s*`([^`$]*)\$\{[^}]+\}`/g)) templates.add(m[1]!);
    // `t(cond ? 'a.x' : 'b.y', …)`: both branches are keys (play.ts noBoosters, hud.ts chip — WEEKLY-1)
    for (const m of src.matchAll(/\bt\(\s*[^'`()]*?\?\s*'([^']+)'\s*:\s*'([^']+)'/g)) {
      literal.add(m[1]!);
      literal.add(m[2]!);
    }
    // `step('tutorial.x', …)` in tutorial.ts and `key: 'shop.tab.x'` tables pass keys around as strings
    for (const m of src.matchAll(/\bstep\(\s*'([^']+)'/g)) literal.add(m[1]!);
    for (const m of src.matchAll(/'((?:shop\.tab|daily\.twist|booster|hint|tutorial)\.[a-zA-Z0-9_.]+)'/g)) literal.add(m[1]!);
  }
  return { literal, templates };
}

/** Expansions of the runtime-built key families; a new family must be added here to be checked. */
const TEMPLATE_EXPANSIONS: Record<string, readonly string[]> = {
  'booster.': BOOSTER_KINDS.map((k) => `booster.${k}`),
  'daily.twist.': TWISTS.map((t) => `daily.twist.${t.id}`),
};

describe('translation keys used by src/', () => {
  const { literal, templates } = usedKeys();

  it('finds the keys (the scan is not silently empty)', () => {
    expect(literal.size).toBeGreaterThan(100);
    expect(templates.size).toBeGreaterThanOrEqual(2);
  });

  it('keys chosen by a ternary inside t(...) are scanned (weekly / daily chip and noBoosters)', () => {
    for (const k of ['weekly.noBoosters', 'daily.noBoosters', 'weekly.chip', 'daily.chip']) expect(literal.has(k), k).toBe(true);
  });

  it('every runtime-built key family has an expansion in this test', () => {
    for (const prefix of templates) expect(Object.keys(TEMPLATE_EXPANSIONS), `add an expansion for t(\`${prefix}\${…}\`)`).toContain(prefix);
  });

  for (const [code, dict] of Object.entries(DICTS)) {
    it(`${code}: has every literal and expanded key`, () => {
      const missing = [...literal, ...Object.values(TEMPLATE_EXPANSIONS).flat()].filter((k) => typeof dict[k] !== 'string' || dict[k]!.trim() === '');
      expect(missing).toEqual([]);
    });
  }
});

describe('level text in every language (I18N-2)', () => {
  it('all levels ship name_az / name_ru / name_tr (the map and the daily card show them)', () => {
    const missing = LEVEL_MANIFEST.filter((l) => !(l.name_az && l.name_ru && l.name_tr)).map((l) => l.id);
    expect(missing).toEqual([]);
  });
});

/* ---------- Plural forms (L10N-2) ---------- */

/** Placeholder names of a string: `{name}` and `{name|form|…}` alike (names only, not forms). */
function placeholderNames(s: string): string[] {
  return [...new Set([...s.matchAll(/\{(\w+)(?:\|[^{}]*)?\}/g)].map((m) => m[1]!))].sort();
}

/** Count-noun pairs that need forms: a bare `{n}` before (or a "noun: {n}" label) of these nouns. */
const RU_BARE_COUNT: readonly RegExp[] = [
  /\{\w+\}\s+(кристалл|достижени|бо[её]ц|бойц|уровен|уровн|поток|облик|зв[её]зд|дн[еяи]|день|недел)/i,
  /(кристаллов|достижений|бойцов|уровней|потоков|обликов|звёзд|дней|недель):\s*\{\w+\}/i,
];
const EN_BARE_COUNT: readonly RegExp[] = [/\{\w+\}\s+(crystals?|achievements?|levels?|troops?|units?|streams?|skins?|stars?|coins?|days?|weeks?)\b/i];

describe('plural forms in the dictionaries (L10N-2)', () => {
  const ruWithForms = Object.keys(ru).filter((k) => /\{\w+\|/.test(ru[k as keyof typeof ru]));

  it('RU uses forms (the scan is not silently empty)', () => {
    expect(ruWithForms).toContain('achievements.many');
    expect(ruWithForms.length).toBeGreaterThanOrEqual(15);
  });

  for (const [code, dict] of Object.entries(DICTS)) {
    it(`${code}: a key with forms in RU has the same placeholder names`, () => {
      const diff = ruWithForms.filter((k) => placeholderNames(dict[k]!).join() !== placeholderNames(ru[k as keyof typeof ru]).join());
      expect(diff).toEqual([]);
    });
  }

  it('every form choice is well formed: RU one|few|many, EN one|other, and the number is shown too', () => {
    const FORMS: Record<string, number> = { ru: 3, en: 2 };
    for (const [code, dict] of Object.entries(DICTS)) {
      for (const [key, s] of Object.entries(dict)) {
        for (const m of s.matchAll(/\{(\w+)\|([^{}]*)\}/g)) {
          if (FORMS[code]) expect(m[2]!.split('|').length, `${code} ${key}: ${FORMS[code]} forms`).toBe(FORMS[code]);
          expect(s.includes(`{${m[1]}}`), `${code} ${key}: {${m[1]}|…} without a plain {${m[1]}}`).toBe(true);
        }
      }
    }
  });

  it('RU: no bare "{n} кристаллов"-style count next to a noun', () => {
    const bad = Object.entries(ru).filter(([, s]) => RU_BARE_COUNT.some((re) => re.test(s)));
    expect(bad).toEqual([]);
  });

  it('EN: no bare "{n} crystals"-style count next to a noun', () => {
    const bad = Object.entries(en).filter(([, s]) => EN_BARE_COUNT.some((re) => re.test(s)));
    expect(bad).toEqual([]);
  });
});
