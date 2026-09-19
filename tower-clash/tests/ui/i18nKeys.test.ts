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
