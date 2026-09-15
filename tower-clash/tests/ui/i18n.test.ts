import { beforeEach, describe, expect, it } from 'vitest';
import { en } from '../../src/ui/locales/en';
import { az } from '../../src/ui/locales/az';
import { ru } from '../../src/ui/locales/ru';
import { tr } from '../../src/ui/locales/tr';
import { LANGUAGES, LANGUAGE_CODES, currentLanguage, detectLanguage, interpolate, isLanguageLoaded, nextLanguage, setLanguage, t } from '../../src/ui/i18n';
import { defaultSave, normalizeSave } from '../../src/ui/save';
import { tutorialFor } from '../../src/ui/tutorial';
import { commanderSummary } from '../../src/ui/upgrades';
import { COMMANDER_UPGRADES } from '../../src/economy/catalog';

const DICTS = { en, az, ru, tr } as const;
const EN_KEYS = Object.keys(en).sort();

describe('dictionaries', () => {
  it('ship every language of the picker', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual([...LANGUAGE_CODES]);
    expect(Object.keys(DICTS).sort()).toEqual([...LANGUAGE_CODES].sort());
    for (const l of LANGUAGES) expect(l.label.length, l.code).toBeGreaterThan(0);
  });

  for (const code of LANGUAGE_CODES) {
    it(`${code}: has exactly the English keys, no empty strings, same placeholders`, () => {
      const dict: Record<string, string> = DICTS[code];
      expect(Object.keys(dict).sort()).toEqual(EN_KEYS);
      for (const key of EN_KEYS) {
        const value = dict[key];
        expect(typeof value, key).toBe('string');
        expect(value!.trim().length, `${code}: ${key} is empty`).toBeGreaterThan(0);
        // every {param} of the English string must survive translation (and no extra ones appear)
        const params = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
        expect(params(value!), `${code}: ${key} placeholders`).toEqual(params(en[key as keyof typeof en]));
      }
    });
  }

  it('non-English dictionaries actually differ from English', () => {
    for (const code of ['az', 'ru', 'tr'] as const) {
      const same = EN_KEYS.filter((k) => DICTS[code][k as keyof typeof en] === en[k as keyof typeof en]);
      // numerals / brand-neutral strings ("100%") may match; the bulk must not
      expect(same.length, `${code} untranslated keys: ${same.join(', ')}`).toBeLessThan(EN_KEYS.length * 0.1);
    }
  });
});

describe('t()', () => {
  beforeEach(async () => {
    await setLanguage('en');
  });

  it('interpolates params and leaves unknown placeholders alone', () => {
    expect(interpolate('Day {day}: {parts}', { day: 3, parts: '+10 gold' })).toBe('Day 3: +10 gold');
    expect(interpolate('{a} {b}', { a: 'x' })).toBe('x {b}');
    expect(interpolate('plain')).toBe('plain');
    expect(t('title.dailyReward', { day: 2, parts: '+5 gold' })).toBe('Day 2 reward: +5 gold');
    expect(t('hud.level', { n: 7 })).toBe('LEVEL 7');
  });

  it('switches language (dictionary loaded on demand) and falls back to English while loading', async () => {
    expect(currentLanguage()).toBe('en');
    const p = setLanguage('az');
    expect(currentLanguage()).toBe('az');
    if (!isLanguageLoaded('az')) expect(t('title.play')).toBe('PLAY'); // English until the chunk lands
    await p;
    expect(isLanguageLoaded('az')).toBe(true);
    expect(t('title.play')).toBe('OYNA');
    expect(t('tutorial.upgrade', { n: 10 })).toBe(az['tutorial.upgrade'].replace('{n}', '10'));
    await setLanguage('ru');
    expect(t('result.victory')).toBe('ПОБЕДА');
    await setLanguage('tr');
    expect(t('common.back')).toBe('GERİ');
  });

  it('rejects unknown codes with English', async () => {
    await setLanguage('xx' as never);
    expect(currentLanguage()).toBe('en');
  });

  it('nextLanguage cycles the picker order', () => {
    expect(nextLanguage('en')).toBe('az');
    expect(nextLanguage('tr')).toBe('en');
  });
});

describe('detection', () => {
  it('picks the first supported primary subtag, else English', () => {
    expect(detectLanguage('az-Latn-AZ')).toBe('az');
    expect(detectLanguage(['de-DE', 'ru', 'en'])).toBe('ru');
    expect(detectLanguage(['tr_TR'])).toBe('tr');
    expect(detectLanguage('en-US')).toBe('en');
    expect(detectLanguage(['fr-FR', 'de'])).toBe('en');
    expect(detectLanguage(undefined)).toBe('en');
    expect(detectLanguage(null)).toBe('en');
    expect(detectLanguage([])).toBe('en');
  });

  it('save keeps a valid language and drops garbage (absent = first run, detect later)', () => {
    expect(defaultSave().settings.language).toBeUndefined();
    expect(normalizeSave({ settings: { language: 'az' } }).settings.language).toBe('az');
    expect(normalizeSave({ settings: { language: 'klingon' } }).settings.language).toBeUndefined();
    expect(normalizeSave({ settings: { language: 7 } }).settings.language).toBeUndefined();
  });
});

describe('translated UI text', () => {
  it('tutorial hints follow the language at read time', async () => {
    await setLanguage('en');
    const tut = tutorialFor(1, 0)!;
    expect(tut.steps[0]!.text).toBe('Tap your tower');
    await setLanguage('az');
    expect(tut.steps[0]!.text).toBe(az['tutorial.tapTower']);
    await setLanguage('en');
    expect(tut.steps[0]!.text).toBe('Tap your tower');
  });

  it('commander summary uses the short effect labels of the language', async () => {
    const save = defaultSave();
    save.upgrades['production'] = 2;
    const def = COMMANDER_UPGRADES.find((u) => u.id === 'production')!;
    const v = `${Math.round(def.effect.perTier * 2 * 100)} %`;
    await setLanguage('en');
    expect(commanderSummary(save)).toBe(`+${v} prod`);
    await setLanguage('tr');
    expect(commanderSummary(save)).toBe(tr['upgrade.short.production'].replace('{v}', v));
    await setLanguage('en');
  });
});
