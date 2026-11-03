import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import type { Rect } from '../../src/render/widgets';
import { FONT_RU, MIN_TEXT_PX, TEXT_SCALES, setTextScale, textPx } from '../../src/render/widgets';
import { LEVEL_MAP, MENU_HEADERS, SHOP } from '../../src/render/menuLayout';
import { HEADER_TITLE, headerTitle } from '../../src/render/menuWidgets';
import { C } from '../../src/sim/constants';
import { hudAnchors } from '../../src/render/view';
import type { HudAnchors } from '../../src/render/view';
import type { TranslationKey } from '../../src/ui/i18n';
import { registerDictionary, setLanguage, t } from '../../src/ui/i18n';
import type { Language } from '../../src/ui/i18n';
import { en } from '../../src/ui/locales/en';
import { az } from '../../src/ui/locales/az';
import { ru } from '../../src/ui/locales/ru';
import { tr } from '../../src/ui/locales/tr';
import { ADVANCES, ADVANCE_CHARS, ADVANCE_ERROR } from './fontAdvances';

/*
 * AUD-U13 guard: in AZ the level map's "SƏVİYYƏLƏR" ran into the gold wallet pill (360 and 430 wide).
 * Every menu header title (`MENU_HEADERS`: level map, shop, achievements, settings, how-to) × four
 * languages × the three text sizes × both phone shapes: the title's box (`headerTitle`: glyphs + the ink
 * outline + the extrusion) keeps HEADER_TITLE.pad from BACK and from the wallet / the slot's right edge,
 * is drawn at ≥ the 22 px floor and is cut with "…" only when the floor does not fit. The header band
 * moves as one with the top safe-area inset (FE-11), so the shapes shift BACK, wallet and title together.
 * Text is measured with the game's font advances (fontAdvances.ts) widened by their error; a capital
 * outside the table ("Ə", "İ", Cyrillic capitals) counts 0.8 em — wider than any Fredoka / Nunito capital.
 */

for (const [lang, dict] of [['en', en], ['az', az], ['ru', ru], ['tr', tr]] as const) registerDictionary(lang, dict);

const pxOf = (f: string): number => Number(/(\d+(?:\.\d+)?)px/.exec(f)?.[1] ?? 10);

function measuringCtx(): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = { font: '700 10px sans-serif' };
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

const SHAPES = [
  { name: '360x640', cssW: 360, cssH: 640, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
  { name: '430x932', cssW: 430, cssH: 932, insets: { top: 59, right: 0, bottom: 34, left: 0 } },
] as const;

/** view.ts `resize` for a shape: the letterbox fit inside the safe area, then the HUD band anchors. */
function anchorsOf(s: (typeof SHAPES)[number]): HudAnchors {
  const usableW = s.cssW - s.insets.left - s.insets.right;
  const usableH = s.cssH - s.insets.top - s.insets.bottom;
  const scale = Math.min(usableW / C.MAP_W, usableH / C.MAP_H);
  const offsetX = s.insets.left + (usableW - C.MAP_W * scale) / 2;
  const offsetY = s.insets.top + (usableH - C.MAP_H * scale) / 2;
  return hudAnchors({ cssW: s.cssW, cssH: s.cssH, scale, offsetX, offsetY, insets: s.insets });
}
const LANGS: readonly Language[] = ['en', 'az', 'ru', 'tr'];
const TITLES: Record<keyof typeof MENU_HEADERS, TranslationKey> = {
  levels: 'levels.title',
  shop: 'shop.title',
  achievements: 'achievements.title',
  settings: 'settings.title',
  howto: 'howto.title',
};
/** What the header shows right of the title: the wallet pill, or nothing (the slot's right edge). */
const WALLETS: Partial<Record<keyof typeof MENU_HEADERS, Rect>> = { levels: LEVEL_MAP.wallet, shop: SHOP.wallet };

const gapX = (a: Rect, b: Rect): number => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
const shift = (r: Rect, dy: number): Rect => ({ ...r, y: r.y + dy });
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

afterAll(async () => {
  setTextScale(1);
  await setLanguage('en');
});

describe('menu header titles fit between BACK and the wallet (AUD-U13)', () => {
  it('the slots: BACK and the wallet as the screens draw them', () => {
    expect(MENU_HEADERS.levels).toEqual({ back: LEVEL_MAP.back, right: LEVEL_MAP.wallet.x, px: 40 });
    expect(MENU_HEADERS.shop).toEqual({ back: SHOP.back, right: SHOP.wallet.x, px: 40 });
    // settings / how-to keep the title on the screen's centre line
    for (const k of ['settings', 'howto'] as const) {
      const s = MENU_HEADERS[k];
      expect((s.back.x + s.back.w + s.right) / 2).toBe(360);
    }
  });

  it('every title × language × text size × phone shape: box clear of BACK and the wallet, ≥ the floor', async () => {
    const ctx = measuringCtx();
    const rows: string[] = [];
    let cases = 0;
    for (const lang of LANGS) {
      await setLanguage(lang);
      for (const k of TEXT_SCALES) {
        setTextScale(k);
        for (const [screen, slot] of Object.entries(MENU_HEADERS) as [keyof typeof MENU_HEADERS, (typeof MENU_HEADERS)[keyof typeof MENU_HEADERS]][]) {
          const title = t(TITLES[screen]);
          const h = headerTitle(ctx, title, slot);
          for (const shape of SHAPES) {
            const a = anchorsOf(shape);
            cases++;
            const where = `${screen} ${lang} ${k * 100}% ${shape.name} "${h.text}" ${Math.round(h.box.w)} px`;
            const box = shift(h.box, a.top);
            const back = shift(slot.back, a.top);
            expect(overlaps(box, back), `${where}: over BACK`).toBe(false);
            expect(gapX(box, back), `${where}: from BACK`).toBeGreaterThanOrEqual(HEADER_TITLE.pad - 0.01);
            const wallet = WALLETS[screen];
            if (wallet) {
              expect(overlaps(box, shift(wallet, a.top)), `${where}: over the wallet`).toBe(false);
              expect(gapX(box, shift(wallet, a.top)), `${where}: from the wallet`).toBeGreaterThanOrEqual(HEADER_TITLE.pad - 0.01);
            }
            expect(box.x + box.w, `${where}: right edge`).toBeLessThanOrEqual(slot.right - HEADER_TITLE.pad + 0.01);
            expect(box.y, `${where}: in the header band`).toBeGreaterThanOrEqual(a.top);
            expect(box.y + box.h, `${where}: in the header band`).toBeLessThanOrEqual(a.top + 100);
          }
          const drawn = textPx(h.px);
          expect(drawn, `${screen} ${lang} ${k}: size`).toBeGreaterThanOrEqual(MIN_TEXT_PX);
          // "…" only when the whole title does not fit at the floor
          if (h.text !== title) expect(drawn).toBe(MIN_TEXT_PX);
          rows.push(`${screen} ${lang} ${k * 100}%: ${h.text} at ${drawn} px, box ${Math.round(h.box.x)}..${Math.round(h.box.x + h.box.w)} (slot ${slot.back.x + slot.back.w}..${slot.right})`);
        }
      }
    }
    expect(cases).toBe(5 * LANGS.length * TEXT_SCALES.length * SHAPES.length);
    if (process.env.HEADER_TABLE) console.log(rows.join('\n'));
  });

  it('the AZ level-map title fits whole (no "…") at every text size', async () => {
    const ctx = measuringCtx();
    await setLanguage('az');
    for (const k of TEXT_SCALES) {
      setTextScale(k);
      expect(headerTitle(ctx, 'SƏVİYYƏLƏR', MENU_HEADERS.levels).text).toBe('SƏVİYYƏLƏR');
    }
  });

  it('no menu screen draws a header title past the slot (every clay title goes through drawHeaderTitle)', () => {
    const dir = new URL('../../src/render/', import.meta.url);
    for (const f of readdirSync(dir).filter((n) => /^menus[A-Z]\w*\.ts$/.test(n))) {
      const src = readFileSync(new URL(f, dir), 'utf8');
      expect(src.includes('drawExtrudedText('), `${f} draws its own extruded title`).toBe(false);
    }
  });
});
