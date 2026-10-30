import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import type { lessonCardLayout as LessonCardLayout } from '../src/render/hud';
import type { font as Font, wrapText as WrapText } from '../src/render/widgets';
import type { levelLesson as LevelLesson, setLanguage as SetLanguage } from '../src/ui/i18n';

/*
 * QA-32 (2026-10-29): every lesson card fits. The GD-5…GD-11 reviews found cards that ran to 4–5
 * lines at 18 px (37, 42 AZ / RU, 43 / 47 / 48 / 50 RU …) and nothing automated caught it; the level
 * designers measured by hand with scratch tools that re-implemented the wrap. This spec lays out every
 * authored level's card in each of the four languages (`lesson`, `lesson_az`, `lesson_ru`,
 * `lesson_tr`) with the game's own code — src/render/hud.ts `lessonCardLayout` (it picks 20 px or the
 * 18 px fallback, wraps through widgets.ts `wrapText` and sizes the card) and widgets.ts `font` (the
 * Fredoka stack, or Nunito first while the UI is Russian), bundled from src/ with esbuild like
 * scripts/renderIcons.ts and run inside the booted game page, so the measuring uses the game's own
 * @font-face files (each lesson's faces are loaded first and `document.fonts.check` must agree). Per
 * card it asserts:
 *   - the card stays at its full font size, 20 px (the 18 px / five-line fallback is for emergencies,
 *     not for shipped text), in at most 3 lines, nothing cut with "…", every word on the card;
 *   - no line is wider than the card's text width (the 620 px wrap width, and the card's own width
 *     less its 2 × 24 px padding);
 *   - QA-33: the 20 px text re-wrapped at 620 − CARD_WRAP_MARGIN (608 px) with widgets.ts `wrapText` still fits
 *     3 lines (cross-renderer drift: CI's Chromium and iOS WebKit measure a few px wider);
 *   - on a 360 × 640 phone the card (rect plus its 4 px clay edge) lies inside the play band: below the
 *     top HUD band, above the bottom one, inside the map's width.
 * One table row per level × language is printed (chars, lines, widest px, card size), like
 * shareLocales.spec.ts. One page, no level is started: the whole sweep is a few seconds.
 */

const ROOT = new URL('../', import.meta.url);
const LEVELS_DIR = new URL('src/levels/', ROOT);
const LANGS = ['en', 'az', 'ru', 'tr'] as const;
type Lang = (typeof LANGS)[number];
/** hud.ts `lessonCardLayout`: the full font size, its line budget and wrap width, the card's side padding (w = widest + 48). */
const CARD_PX = 20;
const CARD_MAX_LINES = 3;
const CARD_TEXT_W = 620;
/**
 * QA-33 (2026-10-29): text widths drift between renderers. CI's Chromium 129 measured 47 RU / 49 RU 2–4 px
 * wider than this container's build (616 / 618 px here, past 620 there: 4 lines, 18 px fallback), and iOS
 * WebKit measures differently again. A renderer that is wider by a few px wraps as if the width were narrower,
 * so every 20 px card is also re-wrapped at CARD_TEXT_W - CARD_WRAP_MARGIN with the game's `wrapText` and must
 * still fit CARD_MAX_LINES (column `@608`). A plain `widest <= 608` would fail about a third of all cards:
 * wrapping at 620 fills every line it can, and a 615 px line that moves one word down is harmless unless the
 * card grows a 4th line. The widest-line check stays at 620, and `slack` is printed against 620.
 */
const CARD_WRAP_MARGIN = 12;
/** The 18 px fallback's wrap width (failing anyway: it is not the full size). */
const CARD_FALLBACK_TEXT_W = 640;
const CARD_PAD_X = 24;
/** drawCard `edge` of the lesson card (hud.ts `drawHud`): the clay edge under its rect. */
const CARD_EDGE = 4;
/** src/render/layout.ts HUD (top band ends at mapTop, bottom band starts at mapBottom) and the logical map width. */
const HUD_MAP_TOP = 96;
const HUD_MAP_BOTTOM = 1180;
const MAP_W = 720;

interface LevelJson {
  id: number;
  name: string;
  lesson: string;
  lesson_az?: string;
  lesson_ru?: string;
  lesson_tr?: string;
}
const LEVELS: LevelJson[] = readdirSync(LEVELS_DIR)
  .filter((f) => /^\d{3}-.*\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(new URL(f, LEVELS_DIR), 'utf8')) as LevelJson)
  .sort((a, b) => a.id - b.id);

interface Row {
  id: number;
  lang: Lang;
  text: string;
  font: string;
  fontsReady: boolean;
  px: number;
  lines: string[];
  widths: number[];
  rect: { x: number; y: number; w: number; h: number };
  /** QA-33: the card's line count when the same text, in the same font, wraps at CARD_TEXT_W - CARD_WRAP_MARGIN. */
  marginLines: number;
}
interface LessonFitBundle {
  lessonCardLayout: typeof LessonCardLayout;
  font: typeof Font;
  setLanguage: typeof SetLanguage;
  levelLesson: typeof LevelLesson;
  wrapText: typeof WrapText;
}

/** The game's own card layout code, bundled from src/ for the page (`window.__lessonFit`). */
async function layoutBundle(): Promise<string> {
  const out = await build({
    stdin: {
      contents: [`export { lessonCardLayout } from './src/render/hud';`, `export { font, wrapText } from './src/render/widgets';`, `export { levelLesson, setLanguage } from './src/ui/i18n';`].join('\n'),
      resolveDir: fileURLToPath(ROOT),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
    globalName: '__lessonFit',
    target: 'es2022',
    logLevel: 'silent',
  });
  return out.outputFiles[0]!.text;
}

test.use({ viewport: { width: 360, height: 640 } });

test('QA-32: every lesson card fits — <= 3 lines at 20 px, no line past the text width, inside the play band on 360 x 640', async ({ page }) => {
  // every authored level, ids 1..N without a gap
  expect(LEVELS.length).toBeGreaterThanOrEqual(50);
  expect(LEVELS.map((l) => l.id)).toEqual(LEVELS.map((_, i) => i + 1));

  const t0 = Date.now();
  const bundle = await layoutBundle();
  const tBundle = Date.now();
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__towerclash?.loadLevel === 'function', undefined, { timeout: 20_000 });
  const anchors = await page.evaluate(() => window.__towerclash.getAnchors());
  await page.addScriptTag({ content: bundle });
  const tBoot = Date.now();

  const rows = await page.evaluate(
    async ({ levels, langs, marginW }) => {
      const L = (window as unknown as { __lessonFit: LessonFitBundle }).__lessonFit;
      const ctx = document.createElement('canvas').getContext('2d')!;
      const state = { time: 0 } as unknown as Parameters<typeof L.lessonCardLayout>[1];
      const out: Row[] = [];
      for (const lang of langs) {
        await L.setLanguage(lang);
        // the faces this language's lessons need, at both card sizes, loaded before anything is measured: one load and one
        // check per size over the language's character set (`document.fonts.check` costs time per character of its text:
        // per lesson or over the joined lessons it took 18–34 s here)
        const fonts = [L.font(20, '500'), L.font(18, '500')];
        const chars = [...new Set(levels.map((level) => L.levelLesson(level, lang)).join(''))].join('');
        for (const f of fonts) await document.fonts.load(f, chars);
        const fontsReady = fonts.every((f) => document.fonts.check(f, chars));
        for (const level of levels) {
          const ui = { outcome: 'playing', level } as unknown as Parameters<typeof L.lessonCardLayout>[2];
          const text = L.levelLesson(level, lang); // what the card shows (English when untranslated)
          const card = L.lessonCardLayout(ctx, state, ui);
          if (!card) throw new Error(`lessonCardLayout returned null for level ${level.id} (${lang})`);
          // lessonCardLayout leaves the card's lesson font set on ctx; QA-33 re-wraps the same text in that font at the
          // margin width with the game's own wrapText (no line cap, so the count is real)
          const marginLines = L.wrapText(ctx, text, marginW, Number.MAX_SAFE_INTEGER).length;
          out.push({ id: level.id, lang, text, font: ctx.font, fontsReady, px: card.px, lines: card.lines, widths: card.lines.map((l) => ctx.measureText(l).width), rect: card.rect, marginLines });
        }
      }
      return out;
    },
    { levels: LEVELS, langs: [...LANGS], marginW: CARD_TEXT_W - CARD_WRAP_MARGIN },
  );
  const tLayout = Date.now();
  expect(rows).toHaveLength(LEVELS.length * LANGS.length);

  const words = (s: string): string => s.split(/\s+/).filter(Boolean).join(' ');
  const top = HUD_MAP_TOP + anchors.top;
  const bottom = HUD_MAP_BOTTOM + anchors.bottom;
  const failures: string[] = [];
  const table: string[] = [`[lesson-fit] 360x640 anchors top ${anchors.top} bottom ${anchors.bottom}; play band ${top}..${bottom}; rule: ${CARD_MAX_LINES} lines at ${CARD_PX} px, widest <= ${CARD_TEXT_W} px, still <= ${CARD_MAX_LINES} lines re-wrapped at ${CARD_TEXT_W} - ${CARD_WRAP_MARGIN} = ${CARD_TEXT_W - CARD_WRAP_MARGIN} px (column @${CARD_TEXT_W - CARD_WRAP_MARGIN}); bundle ${tBundle - t0} ms, boot ${tBoot - tBundle} ms, layout ${tLayout - tBoot} ms`];
  table.push(`${'lvl'.padStart(3)} ${'lang'.padEnd(4)} ${'chars'.padStart(5)} ${'px'.padStart(2)} lines ${'widest'.padStart(6)} ${'slack'.padStart(5)} ${`@${CARD_TEXT_W - CARD_WRAP_MARGIN}`.padStart(4)}  card w x h, bottom`);
  for (const r of rows) {
    const widest = Math.max(...r.widths);
    const cardTop = r.rect.y + anchors.top;
    const cardBottom = r.rect.y + r.rect.h + CARD_EDGE + anchors.top;
    table.push(
      `${String(r.id).padStart(3)} ${r.lang.padEnd(4)} ${String(r.text.length).padStart(5)} ${String(r.px).padStart(2)} ${String(r.lines.length).padStart(5)} ${widest.toFixed(0).padStart(6)} ${(CARD_TEXT_W - widest).toFixed(0).padStart(5)} ${String(r.marginLines).padStart(4)}  ${r.rect.w.toFixed(0)} x ${r.rect.h}, ${cardBottom.toFixed(0)}`,
    );
    const at = `level ${r.id} ${r.lang}`;
    const shown = r.lines.map((l, i) => `${r.widths[i]!.toFixed(0)}:"${l}"`).join(' | ');
    if (!r.fontsReady) failures.push(`${at}: the card's faces were not loaded when measured (${r.font})`);
    if (r.px !== CARD_PX) failures.push(`${at}: card dropped to ${r.px} px (${r.lines.length} lines; more than ${CARD_MAX_LINES} lines at ${CARD_PX} px): ${shown}`);
    if (r.lines.length > CARD_MAX_LINES) failures.push(`${at}: ${r.lines.length} lines > ${CARD_MAX_LINES}: ${shown}`);
    if (r.lines.some((l) => l.endsWith('…')) || words(r.lines.join(' ')) !== words(r.text)) failures.push(`${at}: the card does not carry the whole lesson: ${shown}`);
    // the text width of the card as laid out: its wrap width (620 px at 20 px, 640 at the 18 px fallback) and its own width less the padding
    const textW = Math.min(r.px === CARD_PX ? CARD_TEXT_W : CARD_FALLBACK_TEXT_W, r.rect.w - 2 * CARD_PAD_X);
    if (widest > textW) failures.push(`${at}: widest line ${widest.toFixed(1)} px > text width ${textW.toFixed(1)} px: ${shown}`);
    // QA-33: a renderer that measures text a little wider wraps this card as if at a narrower width; it must still fit
    if (r.px === CARD_PX && r.marginLines > CARD_MAX_LINES)
      failures.push(
        `${at}: re-wrapped at ${CARD_TEXT_W} - ${CARD_WRAP_MARGIN} px wrap margin = ${CARD_TEXT_W - CARD_WRAP_MARGIN} px the card needs ${r.marginLines} lines > ${CARD_MAX_LINES} (fits here, but other renderers measure text a few px wider: CI's Chromium 129 put 47 / 49 RU 2–4 px past this build, iOS WebKit differs again, and there it wraps to a 4th line and the 18 px fallback): ${shown}`,
      );
    if (cardTop < top || cardBottom > bottom || r.rect.x < 0 || r.rect.x + r.rect.w > MAP_W) failures.push(`${at}: card ${JSON.stringify(r.rect)} (bottom ${cardBottom}) leaves the play band ${top}..${bottom} x 0..${MAP_W}`);
  }
  const widestOf = (r: Row): number => Math.max(...r.widths);
  const full = rows.filter((r) => r.lines.length === CARD_MAX_LINES);
  const tightest = [...(full.length > 0 ? full : rows)].sort((a, b) => widestOf(b) - widestOf(a))[0]!;
  table.push(`[lesson-fit] ${rows.length} cards (${LEVELS.length} levels x ${LANGS.length} languages), ${full.length} at ${CARD_MAX_LINES} lines; tightest: level ${tightest.id} ${tightest.lang} ${tightest.lines.length} lines widest ${widestOf(tightest).toFixed(0)} px; ${failures.length} failing`);
  console.log(table.join('\n'));
  expect(failures, 'lesson cards that do not fit (shorten the text in the level JSON; GD / LV item)').toEqual([]);
});
