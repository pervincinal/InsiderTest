import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { FONT_RU, MIN_TEXT_PX, TEXT_SCALES, setTextScale, textPx } from '../../src/render/widgets';
import { SELECT_HINT, selectHintBox, selectHintText } from '../../src/render/hud';
import { setLanguage, t } from '../../src/ui/i18n';
import type { Language } from '../../src/ui/i18n';
import { ADVANCES, ADVANCE_CHARS, ADVANCE_ERROR } from './fontAdvances';

/*
 * AUD-U12 guard: glyph compression, which the BUG-57 placement guard (selectHint.test.ts) does not see.
 * The RU hint "Нажми на башню, чтобы начать поток · ещё раз или проведи поперёк — стоп" used to be one
 * `fillText(text, …, w − 20)` squeezed into a full-width pill at 360 wide. Now (AUD-U2) the hint says the
 * half the player can act on and wraps between words, never squeezed — here for 4 languages × the 3 text
 * sizes × both halves: ≤ 2 lines (each of them ≤ the 660 px text width at the drawn size, which is ≥ the
 * 22 px floor), nothing cut, the pill ≤ 700 wide, and the drawn lines pass no maxWidth to fillText.
 * Measured with the game's font advances (fontAdvances.ts) widened by their error; a glyph outside the
 * table counts 0.8 em (wider than any lower-case Fredoka / Nunito glyph).
 */

const pxOf = (f: string): number => Number(/(\d+(?:\.\d+)?)px/.exec(f)?.[1] ?? 10);

function measuringCtx(): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = { font: '500 10px sans-serif' };
  const measure = (text: string): number => {
    const f = String(store.font);
    const table = ADVANCES[`${f.includes(FONT_RU) ? 'ru' : 'latin'}${/^700/.test(f) ? 700 : 500}` as keyof typeof ADVANCES];
    let em = 0;
    for (const c of text) {
      const i = ADVANCE_CHARS.indexOf(c);
      em += i < 0 ? 0.8 : table[i]!;
    }
    return em * pxOf(f) * (1 + ADVANCE_ERROR);
  };
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key === 'measureText') return (s: string) => ({ width: measure(String(s)) });
      if (key in store) return store[key];
      return () => undefined;
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
}

const LANGS: readonly Language[] = ['en', 'az', 'ru', 'tr'];
const TEXT_W = SELECT_HINT.maxW - 2 * SELECT_HINT.padX;

afterAll(async () => {
  setTextScale(1);
  await setLanguage('en');
});

describe('select hint is wrapped, never squeezed (AUD-U12)', () => {
  it('the whole RU sentence would not fit one 22 px line: the hint shows a half', async () => {
    const ctx = measuringCtx();
    await setLanguage('ru');
    setTextScale(1);
    selectHintBox(ctx, 0); // sets the hint font
    expect(ctx.measureText(t('hud.selectHint')).width).toBeGreaterThan(TEXT_W);
    expect(selectHintText(0)).toBe('Нажми на башню, чтобы начать поток');
    expect(selectHintText(1)).toBe('Ещё раз или проведи поперёк — стоп');
  });

  it('every language × text size × half: ≤ 2 lines inside the text width at ≥ the floor, nothing cut', async () => {
    const ctx = measuringCtx();
    const rows: string[] = [];
    for (const lang of LANGS) {
      await setLanguage(lang);
      for (const k of TEXT_SCALES) {
        setTextScale(k);
        for (const part of [0, 1] as const) {
          const box = selectHintBox(ctx, part);
          const where = `${lang} ${k * 100}% part ${part}`;
          const drawn = pxOf(String(ctx.font));
          expect(drawn, where).toBe(textPx(SELECT_HINT.px, SELECT_HINT.maxPx));
          expect(drawn, where).toBeGreaterThanOrEqual(MIN_TEXT_PX);
          expect(box.lines.length, where).toBeLessThanOrEqual(2);
          expect(box.lines.join(' '), `${where}: cut`).toBe(selectHintText(part));
          const widths = box.lines.map((l) => ctx.measureText(l).width);
          for (const w of widths) expect(w, where).toBeLessThanOrEqual(TEXT_W);
          expect(box.w, where).toBeLessThanOrEqual(SELECT_HINT.maxW);
          expect(box.h, where).toBe(box.lines.length * box.lineH + SELECT_HINT.padY);
          rows.push(`${where}: ${box.lines.length} line(s) at ${drawn} px, widest ${Math.round(Math.max(...widths))} / ${TEXT_W}`);
        }
      }
    }
    if (process.env.HINT_TABLE) console.log(rows.join('\n'));
  });

  it('drawHud draws the hint lines without fillText maxWidth', () => {
    const src = readFileSync(new URL('../../src/render/hud.ts', import.meta.url), 'utf8');
    const call = /box\.lines\.forEach\(\(l, i\) => ctx\.fillText\(([^;]*)\)\);/.exec(src);
    expect(call, 'the hint line loop').not.toBeNull();
    // three arguments: text, x, y (a maxWidth would be a fourth)
    const args = call![1]!.split(',').length;
    expect(args).toBe(3);
  });
});
