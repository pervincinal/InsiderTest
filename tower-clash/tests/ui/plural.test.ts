import { afterEach, describe, expect, it } from 'vitest';
import { en } from '../../src/ui/locales/en';
import { ru } from '../../src/ui/locales/ru';
import { az } from '../../src/ui/locales/az';
import { tr } from '../../src/ui/locales/tr';
import { PLURAL_FORMS, PLURAL_RULES, interpolate, pluralForm, registerDictionary, setLanguage, t } from '../../src/ui/i18n';
import { achievementToastText } from '../../src/ui/screens';
import { ACHIEVEMENTS } from '../../src/economy/catalog';

/*
 * Plural forms in dictionary strings (L10N-2): `{n|one|other}` (EN), `{n|one|few|many}` (RU); AZ / TR
 * take the first form. Found on the RU store frame 07: "Достижение открыто: 4 достижений".
 */

const RU_CASES: readonly [number, 'one' | 'few' | 'many'][] = [
  [0, 'many'],
  [1, 'one'],
  [2, 'few'],
  [4, 'few'],
  [5, 'many'],
  [11, 'many'],
  [12, 'many'],
  [14, 'many'],
  [21, 'one'],
  [22, 'few'],
  [25, 'many'],
  [101, 'one'],
  [111, 'many'],
  [112, 'many'],
  [122, 'few'],
];

describe('plural rules', () => {
  it('RU: one (n%10=1, n%100≠11) / few (n%10 2..4, n%100 not 12..14) / many', () => {
    for (const [n, form] of RU_CASES) expect(PLURAL_FORMS.ru[PLURAL_RULES.ru(n)], String(n)).toBe(form);
  });

  it('RU: a fraction takes the "few" form (genitive singular: 1,5 кристалла)', () => {
    expect(PLURAL_RULES.ru(1.5)).toBe(1);
  });

  it('EN: one for exactly 1, other for everything else', () => {
    expect([0, 1, 2, 5, 11, 21, 101, 1.5].map((n) => PLURAL_FORMS.en[PLURAL_RULES.en(n)])).toEqual(['other', 'one', 'other', 'other', 'other', 'other', 'other', 'other']);
  });

  it('AZ / TR: no inflection — always the first form', () => {
    for (const lang of ['az', 'tr'] as const) for (const n of [0, 1, 2, 5, 21, 112]) expect(PLURAL_RULES[lang](n), `${lang} ${n}`).toBe(0);
  });

  it('pluralForm: absolute value, numeric strings, missing forms and non-numbers fall back to the last form', () => {
    expect(pluralForm('ru', -1, ['a', 'b', 'c'])).toBe('a');
    expect(pluralForm('ru', '22', ['a', 'b', 'c'])).toBe('b');
    expect(pluralForm('ru', '1 000', ['a', 'b', 'c'])).toBe('c');
    expect(pluralForm('ru', 5, ['a', 'b'])).toBe('b'); // "many" missing → last
    expect(pluralForm('ru', 2, ['a'])).toBe('a');
    expect(pluralForm('en', 'lots', ['one', 'other'])).toBe('other');
    expect(pluralForm('az', 7, ['kristal', 'ignored'])).toBe('kristal');
  });
});

describe('interpolate with forms', () => {
  const RU = '{n} {n|достижение|достижения|достижений}';

  it('RU: 1 достижение, 4 достижения, 5 достижений, 21 достижение, 11 достижений', () => {
    expect([1, 4, 5, 21, 11, 22, 112].map((n) => interpolate(RU, { n }, 'ru'))).toEqual([
      '1 достижение',
      '4 достижения',
      '5 достижений',
      '21 достижение',
      '11 достижений',
      '22 достижения',
      '112 достижений',
    ]);
  });

  it('EN: 1 achievement, 2 achievements', () => {
    const s = '{n} {n|achievement|achievements}';
    expect(interpolate(s, { n: 1 }, 'en')).toBe('1 achievement');
    expect(interpolate(s, { n: 2 }, 'en')).toBe('2 achievements');
    expect(interpolate(s, { n: 0 }, 'en')).toBe('0 achievements');
  });

  it('any placeholder name, several choices and plain placeholders in one string', () => {
    const s = '{crystals|Получен|Получено|Получено} {crystals} {crystals|кристалл|кристалла|кристаллов} · {gold} золота';
    expect(interpolate(s, { crystals: 21, gold: 100 }, 'ru')).toBe('Получен 21 кристалл · 100 золота');
    expect(interpolate(s, { crystals: 3, gold: 7 }, 'ru')).toBe('Получено 3 кристалла · 7 золота');
  });

  it('an empty form is a form (EN suffix style), a missing form falls back to the last one', () => {
    expect(interpolate('{n} level{n||s}', { n: 1 }, 'en')).toBe('1 level');
    expect(interpolate('{n} level{n||s}', { n: 3 }, 'en')).toBe('3 levels');
    expect(interpolate('{n} {n|кристалл|кристаллов}', { n: 3 }, 'ru')).toBe('3 кристаллов'); // "few" missing → last
  });

  it('AZ / TR take the first form', () => {
    expect(interpolate('+{n} {n|kristal|kristallar}', { n: 5 }, 'az')).toBe('+5 kristal');
    expect(interpolate('+{n} {n|kristal|kristaller}', { n: 1 }, 'tr')).toBe('+1 kristal');
  });

  it('without forms: plain placeholders, unknown names and missing params are left alone', () => {
    expect(interpolate('Day {day}: {parts}', { day: 3, parts: '+10 gold' }, 'ru')).toBe('Day 3: +10 gold');
    expect(interpolate('{a} {b|x|y}', { a: 'x' }, 'en')).toBe('x {b|x|y}');
    expect(interpolate('{n|a|b}')).toBe('{n|a|b}');
    expect(interpolate('no placeholders | at all', { n: 1 })).toBe('no placeholders | at all');
  });
});

describe('t() with forms', () => {
  afterEach(async () => {
    await setLanguage('en');
  });

  it('RU toast for 4 achievements reads "4 достижения" (the store frame 07 bug)', async () => {
    registerDictionary('ru', ru);
    await setLanguage('ru');
    const unlocked = ACHIEVEMENTS.slice(0, 4);
    expect(achievementToastText({ unlocked, crystals: 21 })).toBe('Достижение открыто: 4 достижения · +21 кристалл');
    expect(t('achievements.many', { n: 5 })).toBe('5 достижений');
    expect(t('amount.crystals', { n: 2 })).toBe('+2 кристалла');
    expect(t('shop.toast.needCrystals', { n: 1 })).toMatch(/^Нужен 1 кристалл ·/);
    expect(t('result.note.levels', { n: '10' })).toBe('Пройдено 10 уровней');
    expect(t('hint.linkLimit', { n: 2 })).toBe('Для 2 потоков нужен L2');
  });

  it('EN: singular and plural', async () => {
    await setLanguage('en');
    expect(t('achievements.many', { n: 1 })).toBe('1 achievement');
    expect(t('amount.crystals', { n: 1 })).toBe('+1 crystal');
    expect(t('amount.crystals', { n: 21 })).toBe('+21 crystals');
  });

  it('an English fallback string keeps the English rule (21 crystals, not "21 crystal")', async () => {
    const partial = { ...ru } as Record<string, string>;
    delete partial['amount.crystals'];
    registerDictionary('ru', partial as typeof ru);
    await setLanguage('ru');
    expect(t('amount.crystals', { n: 21 })).toBe('+21 crystals');
    registerDictionary('ru', ru);
  });

  it('AZ / TR dictionaries need no forms', () => {
    for (const dict of [az, tr] as Record<string, string>[]) expect(Object.values(dict).filter((s) => /\{\w+\|/.test(s))).toEqual([]);
    expect(Object.values(en as Record<string, string>).some((s) => /\{\w+\|/.test(s))).toBe(true);
  });
});
