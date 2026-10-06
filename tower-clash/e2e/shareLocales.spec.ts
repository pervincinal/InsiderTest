import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * QA-14 (L10N, 2026-10-06): the 1080 × 1350 share card (SHARE-1, GDD §7.3) in every UI language —
 * campaign win, campaign defeat and a Daily Challenge win (the card prints the day key + twist).
 *
 * How the text is checked without touching src/: an init script wraps
 * `CanvasRenderingContext2D.prototype.fillText` / `strokeText` and records every call made on a
 * detached 1080 × 1350 canvas (the share card's offscreen canvas — the game canvas is attached and
 * has another size): the text, the exact `ctx.font` at draw time, `measureText` (advance width and
 * glyph ink box), the outline width, the optional `maxWidth` argument and `document.fonts.check`
 * at that moment. From those, per drawn line:
 *   - the ink box (all fill / stroke passes, extrusion included; x and y) stays inside its region —
 *     the card for the banner title and the rows (BUG-20: the AZ / TR defeat title's İ dot and Ğ
 *     breve reached above the card top), above the island for the header, under the card for the footer;
 *   - the advance width fits the box `fitFontPx` was asked for (card rows: card.w − 80 = 820) and a
 *     `maxWidth` passed to `fillText` is never exceeded (that would squeeze the glyphs horizontally);
 *   - the font size is at least 75 % of the row's design size (no "fit by shrinking to unreadable");
 *   - every code point was drawn in a bundled face (Fredoka latin / latin-ext, Nunito Cyrillic) of
 *     the right weight that was loaded at draw time — no system fallback face on the card.
 * A string sweep then fits every level name (50 × the locale) and every challenge line (daily +
 * weekly × 5 twists) with the same font and the same rule, so the longest string of each language
 * is covered, not just the levels the bot played.
 *
 * The PNGs (download path: no Web Share in headless Chromium; the anchor click is recorded and the
 * blob read back) are written as `share-<locale>-<won|lost|daily>.png` into the run's output dir
 * (`PW_OUTPUT`, default test-results/) for the look review. Like share.spec.ts this file imports
 * nothing from src/; the geometry mirrors src/render/shareCard.ts SHARE_LAYOUT / drawInfoCard and
 * the SHARE hit region src/render/layout.ts RESULT.shareInline.
 */

const SAVE_KEY = 'towerclash.save.v3';
const LOCALES = ['az', 'en', 'ru', 'tr'] as const;
type Locale = (typeof LOCALES)[number];
/** RESULT.shareInline: SHARE in the free ×2 gold / skip slot (no ad provider on the preview, first defeat → no skip offer). */
const RESULT_SHARE = { x: 230, y: 874, w: 260, h: 62 };
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
/** A daily key the shipped picker serves (share.spec.ts / daily.spec.ts DAY_A). */
const DAY_KEY = '2026-09-27';
const UNLOCK_AFTER_LEVEL = 8;
const TWISTS = ['plain', 'lean', 'fastFeet', 'thinWalls', 'reinforced'] as const;

/** src/render/shareCard.ts geometry (SHARE_W × SHARE_H, SHARE_LAYOUT.card, drawInfoCard maxW). */
const SHARE_W = 1080;
const SHARE_H = 1350;
const CARD = { x: 90, y: 740, w: 900, h: 500 };
const CARD_EDGE = 8; // drawCard edge: the ink must stay clear of the card's rim
const ISLAND_Y = 300; // SHARE_LAYOUT.island.y: the header stays above the island
const ROW_MAX_W = CARD.w - 80;
/** Design sizes (px at 1080 wide) of each text row; a fitted row may not drop below MIN_SCALE of it. */
const BASE_PX = { header: 118, title: 88, level: 54, challenge: 38, time: 46, footer: 30 } as const;
type Role = keyof typeof BASE_PX;
const MIN_SCALE = 0.75;

/**
 * Campaign defeat: level 3 seed 1 under `economy.autoLose()` (a v3 stream never drains its source, so
 * the "suicide" line *wins* some levels — 22, 44, 50 and the DAY_KEY daily level at seed 1; level 3
 * loses deterministically). Its names are among the longest of levels 1–8 in every language; the
 * longest names of all 50 levels are covered by the string sweep.
 */
const LOSS_LEVEL = 3;
const LOSS_SEED = 1;
const LEVELS_DIR = new URL('../src/levels/', import.meta.url);
interface LevelJson {
  id: number;
  name: string;
  name_az?: string;
  name_ru?: string;
  name_tr?: string;
}
const LEVELS: LevelJson[] = readdirSync(LEVELS_DIR)
  .filter((f) => /^\d{3}-.*\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(new URL(f, LEVELS_DIR), 'utf8')) as LevelJson)
  .sort((a, b) => a.id - b.id);
function levelName(level: LevelJson, lang: Locale): string {
  const tr = lang === 'en' ? undefined : level[`name_${lang}`];
  return typeof tr === 'string' && tr.trim() !== '' ? tr : level.name;
}
const levelById = (id: number): LevelJson => LEVELS.find((l) => l.id === id)!;

interface Draw {
  op: 'fillText' | 'strokeText';
  text: string;
  font: string;
  x: number;
  y: number;
  maxWidth: number | null;
  width: number;
  left: number;
  right: number;
  ascent: number;
  descent: number;
  lineWidth: number;
  fontsReady: boolean;
}
interface Download {
  download: string;
  href: string;
  base64: string | null;
}
declare global {
  interface Window {
    __shareDraws?: Draw[];
    __shareDownloads?: Download[];
  }
}

/** No Web Share (→ the download fallback, whose blob is read back) and the share-canvas text recorder. */
function instrument(page: Page): Promise<void> {
  return page.addInitScript(
    ([w, h]) => {
      window.__shareDraws = [];
      window.__shareDownloads = [];
      delete (Navigator.prototype as { share?: unknown }).share;
      delete (Navigator.prototype as { canShare?: unknown }).canShare;
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        const rec: Download = { download: this.download, href: this.href, base64: null };
        window.__shareDownloads!.push(rec);
        void fetch(this.href)
          .then((r) => r.arrayBuffer())
          .then((buf) => {
            const bytes = new Uint8Array(buf);
            let bin = '';
            for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            rec.base64 = btoa(bin);
          });
      };
      const proto = CanvasRenderingContext2D.prototype;
      for (const op of ['fillText', 'strokeText'] as const) {
        const orig = proto[op];
        proto[op] = function (this: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth?: number) {
          const c = this.canvas;
          if (c && c.width === w && c.height === h && !c.isConnected) {
            const s = String(text);
            const m = this.measureText(s);
            window.__shareDraws!.push({
              op,
              text: s,
              font: this.font,
              x,
              y,
              maxWidth: maxWidth ?? null,
              width: m.width,
              left: m.actualBoundingBoxLeft,
              right: m.actualBoundingBoxRight,
              ascent: m.actualBoundingBoxAscent,
              descent: m.actualBoundingBoxDescent,
              lineWidth: op === 'strokeText' ? this.lineWidth : 0,
              fontsReady: document.fonts.check(this.font, s),
            });
          }
          if (maxWidth === undefined) orig.call(this, text, x, y);
          else orig.call(this, text, x, y, maxWidth);
        };
      }
    },
    [SHARE_W, SHARE_H] as const
  );
}

async function boot(page: Page, lang: Locale): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  const stars: Record<string, number> = {};
  for (let id = 1; id <= UNLOCK_AFTER_LEVEL; id++) stars[String(id)] = 1;
  const save = { version: 3, stars, settings: { language: lang } };
  await page.addInitScript(([key, data]) => localStorage.setItem(key, JSON.stringify(data)), [SAVE_KEY, save] as const);
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__towerclash?.loadLevel === 'function');
  expect(await page.evaluate(() => window.__towerclash.getLanguage())).toBe(lang);
  return errors;
}

const screen = (page: Page) => page.evaluate(() => window.__towerclash.getScreen());
const text = (page: Page, key: string) => page.evaluate((k) => window.__towerclash.getText(k), key);
function fill(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (params[k] === undefined ? m : String(params[k])));
}

async function toResult(page: Page, outcome: 'won' | 'lost'): Promise<void> {
  await expect.poll(() => screen(page), { timeout: 50_000, intervals: [100] }).toBe('result');
  expect((await page.evaluate(() => window.__towerclash.getResult()))?.outcome).toBe(outcome);
  // no wait for the card's slide-up: ResultScreen hit-tests the static RESULT rects, not the animated card
}

/** Tap SHARE on the result card; returns the recorded card text draws and the PNG bytes. */
async function shareCard(page: Page, expectName: string): Promise<{ draws: Draw[]; png: Buffer }> {
  await page.evaluate(() => {
    window.__shareDraws = [];
    window.__shareDownloads = [];
  });
  const c = await page.evaluate(([x, y]) => window.__towerclash.toClient(x, y), [RESULT_SHARE.x + RESULT_SHARE.w / 2, RESULT_SHARE.y + RESULT_SHARE.h / 2] as const);
  await page.mouse.click(c.x, c.y);
  await expect.poll(() => page.evaluate(() => window.__shareDownloads?.[0]?.base64 ?? null), { timeout: 15_000, intervals: [50] }).not.toBeNull();
  const downloads = (await page.evaluate(() => window.__shareDownloads))!;
  expect(downloads).toHaveLength(1);
  expect(downloads[0]!.download).toBe(expectName);
  const last = await page.evaluate(() => window.__towerclash.lastShare);
  expect(last).toMatchObject({ result: 'saved', name: expectName, type: 'image/png', width: SHARE_W, height: SHARE_H });
  const png = Buffer.from(downloads[0]!.base64!, 'base64');
  expect(Array.from(png.subarray(0, 8))).toEqual(PNG_SIGNATURE);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([SHARE_W, SHARE_H]); // IHDR width × height
  return { draws: (await page.evaluate(() => window.__shareDraws))!, png };
}

interface Line {
  role: Role;
  text: string;
  px: number;
  weight: number;
  width: number;
  inkL: number;
  inkR: number;
  inkT: number;
  inkB: number;
  fontsReady: boolean;
  squeezed: boolean;
}

const pxOf = (font: string) => Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? NaN);
/** `ctx.font` serialises weight 700 as "bold" in Chromium, 500 stays numeric. */
const weightOf = (font: string) => {
  const w = /(?:^|\s)(bold|[1-9]00)\s.*?px/.exec(font)?.[1];
  return w === 'bold' ? 700 : w ? Number(w) : 400;
};

/** Collapse the draw calls into lines (one per distinct text) with the union ink box of all passes. */
function linesOf(draws: Draw[], roleOf: (text: string) => Role | null): Line[] {
  const byText = new Map<string, Line>();
  for (const d of draws) {
    const role = roleOf(d.text);
    expect(role, `unexpected text on the share card: "${d.text}"`).not.toBeNull();
    const half = d.lineWidth / 2;
    const inkL = d.x - d.left - half;
    const inkR = d.x + d.right + half;
    const inkT = d.y - d.ascent - half;
    const inkB = d.y + d.descent + half;
    const prev = byText.get(d.text);
    const squeezed = d.maxWidth !== null && d.width > d.maxWidth + 0.5;
    if (!prev) byText.set(d.text, { role: role!, text: d.text, px: pxOf(d.font), weight: weightOf(d.font), width: d.width, inkL, inkR, inkT, inkB, fontsReady: d.fontsReady, squeezed });
    else {
      prev.inkL = Math.min(prev.inkL, inkL);
      prev.inkR = Math.max(prev.inkR, inkR);
      prev.inkT = Math.min(prev.inkT, inkT);
      prev.inkB = Math.max(prev.inkB, inkB);
      prev.fontsReady &&= d.fontsReady;
      prev.squeezed ||= squeezed;
      expect(pxOf(d.font), `"${d.text}" drawn at two sizes`).toBe(prev.px);
    }
  }
  return [...byText.values()];
}

/** The region a line's ink must stay inside, and the width `fitFontPx` was given for it. */
function boxOf(role: Role): { l: number; r: number; t: number; b: number; fitW: number } {
  // header: above the island (SHARE_LAYOUT.island.y = 300); footer: under the card
  if (role === 'header') return { l: 40, r: SHARE_W - 40, t: 0, b: ISLAND_Y, fitW: 940 };
  if (role === 'footer') return { l: 60, r: SHARE_W - 60, t: CARD.y + CARD.h, b: SHARE_H, fitW: SHARE_W - 120 };
  return { l: CARD.x + CARD_EDGE, r: CARD.x + CARD.w - CARD_EDGE, t: CARD.y, b: CARD.y + CARD.h - CARD_EDGE, fitW: ROW_MAX_W };
}

function checkLines(lines: Line[], label: string): string[] {
  const report: string[] = [];
  for (const ln of lines) {
    const box = boxOf(ln.role);
    const min = Math.ceil(BASE_PX[ln.role] * MIN_SCALE);
    const tag = `${label} ${ln.role} "${ln.text}"`;
    expect(ln.inkL, `${tag}: ink starts at x=${ln.inkL.toFixed(1)}, left of its box ${box.l}`).toBeGreaterThanOrEqual(box.l);
    expect(ln.inkR, `${tag}: ink ends at x=${ln.inkR.toFixed(1)}, right of its box ${box.r}`).toBeLessThanOrEqual(box.r);
    expect(ln.inkT, `${tag}: ink starts at y=${ln.inkT.toFixed(1)}, above its box ${box.t}`).toBeGreaterThanOrEqual(box.t);
    expect(ln.inkB, `${tag}: ink ends at y=${ln.inkB.toFixed(1)}, below its box ${box.b}`).toBeLessThanOrEqual(box.b);
    expect(ln.width, `${tag}: advance ${ln.width.toFixed(1)} > fit width ${box.fitW}`).toBeLessThanOrEqual(box.fitW + 0.5);
    expect(ln.squeezed, `${tag}: wider than the fillText maxWidth (glyphs squeezed)`).toBe(false);
    expect(ln.px, `${tag}: fitted to ${ln.px}px, below ${MIN_SCALE * 100}% of the ${BASE_PX[ln.role]}px design size`).toBeGreaterThanOrEqual(min);
    expect(ln.fontsReady, `${tag}: a bundled face was still loading when the card was drawn (fallback face painted)`).toBe(true);
    const slack = box.fitW - ln.width;
    const vMargin = Math.min(ln.inkT - box.t, box.b - ln.inkB); // the closest the ink comes to its box's top / bottom
    report.push(
      `${label.padEnd(12)} ${ln.role.padEnd(9)} ${String(ln.px).padStart(3)}/${BASE_PX[ln.role]}px  w=${ln.width.toFixed(0).padStart(4)}/${box.fitW}  slack=${slack.toFixed(0).padStart(4)}  v=${vMargin
        .toFixed(1)
        .padStart(5)}  "${ln.text}"`
    );
  }
  return report;
}

/** Every code point of every line is covered by a *loaded* bundled face (Fredoka / Nunito) of the line's weight. */
async function checkFaces(page: Page, lines: Line[], label: string): Promise<void> {
  const uncovered = await page.evaluate((ls) => {
    const parseRange = (r: string): [number, number][] =>
      r.split(',').map((part) => {
        const [a, b] = part.trim().replace(/^U\+/i, '').split('-');
        const lo = parseInt(a!, 16);
        return [lo, b === undefined ? lo : parseInt(b, 16)];
      });
    const faces = [...document.fonts]
      .filter((f) => f.status === 'loaded' && /^['"]?(Fredoka|Nunito)['"]?$/.test(f.family))
      .map((f) => {
        const [wLo, wHi] = f.weight.split(/\s+/).map(Number);
        return { family: f.family, wLo: wLo!, wHi: wHi ?? wLo!, ranges: parseRange(f.unicodeRange) };
      });
    const out: string[] = [];
    for (const ln of ls) {
      for (const ch of new Set(Array.from(ln.text))) {
        const cp = ch.codePointAt(0)!;
        const ok = faces.some((f) => ln.weight >= f.wLo && ln.weight <= f.wHi && f.ranges.some(([lo, hi]) => cp >= lo && cp <= hi));
        if (!ok) out.push(`"${ch}" U+${cp.toString(16).toUpperCase().padStart(4, '0')} (weight ${ln.weight}) in "${ln.text}"`);
      }
    }
    return out;
  }, lines);
  expect(uncovered, `${label}: characters drawn without a loaded bundled face (system fallback)`).toEqual([]);
}

/**
 * Fit every string the card can show in this language with the card's own rule (fitFontPx: measure at
 * the design size, scale linearly, floor) and font, after loading the faces it needs. Returns the
 * smallest size per row kind with its string.
 */
async function sweep(page: Page, fontFamily: string, strings: { role: 'level' | 'challenge' | 'title'; text: string }[]) {
  return page.evaluate(
    async ([fam, list, base, maxW]) => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      const out: { role: string; text: string; px: number; width: number }[] = [];
      for (const s of list) {
        const px0 = base[s.role]!;
        const f = `700 ${px0}px ${fam}`;
        await document.fonts.load(f, s.text);
        ctx.font = f;
        const w = ctx.measureText(s.text).width;
        const px = w <= maxW ? px0 : Math.max(8, Math.floor((px0 * maxW) / w));
        out.push({ role: s.role, text: s.text, px, width: (w * px) / px0 });
      }
      return out;
    },
    [fontFamily, strings, BASE_PX as Record<string, number>, ROW_MAX_W] as const
  );
}

test.describe('share card in every language (QA-14)', () => {
  for (const lang of LOCALES) {
    test(`${lang}: campaign win, campaign defeat and daily cards fit their boxes in bundled faces`, async ({ page }, info) => {
      test.setTimeout(60_000);
      await instrument(page);
      const errors = await boot(page, lang);
      const S = {
        victory: await text(page, 'result.victory'),
        defeat: await text(page, 'result.defeat'),
        level: await text(page, 'share.level'),
        daily: await text(page, 'share.daily'),
        weekly: await text(page, 'share.weekly'),
        time: await text(page, 'result.time'),
      };
      const timePrefix = S.time.split('{time}')[0]!;
      const out = info.project.outputDir;
      mkdirSync(out, { recursive: true });
      const report: string[] = [];
      let fontFamily = '';

      const runCard = async (kind: 'won' | 'lost' | 'daily', levelText: string, challenge: string | null, fileName: string) => {
        const card = await shareCard(page, fileName);
        writeFileSync(path.join(out, `share-${lang}-${kind}.png`), card.png);
        const roleOf = (s: string): Role | null => {
          if (s === 'TOWER CLASH') return 'header';
          if (s.startsWith('towerclash · v')) return 'footer';
          if (s === S.victory || s === S.defeat) return 'title';
          if (s === levelText) return 'level';
          if (challenge !== null && s === challenge) return 'challenge';
          if (s.startsWith(timePrefix) && /\d\d:\d\d$/.test(s)) return 'time';
          return null;
        };
        const lines = linesOf(card.draws, roleOf);
        // the card shows exactly these rows, in this language
        const expected: Role[] = ['header', 'title', 'level', ...(challenge ? (['challenge'] as const) : []), 'time', 'footer'];
        expect(lines.map((l) => l.role).sort(), `${lang}-${kind}: rows drawn`).toEqual([...expected].sort());
        expect(lines.find((l) => l.role === 'title')!.text).toBe(kind === 'lost' ? S.defeat : S.victory);
        report.push(...checkLines(lines, `${lang}-${kind}`));
        await checkFaces(page, lines, `${lang}-${kind}`);
        fontFamily ||= card.draws[0]!.font.replace(/^.*?\d+(?:\.\d+)?px\s+/, '');
      };

      // 1. campaign win: level 1, seed 1, reference player at ×10
      await page.evaluate(() => {
        void window.__towerclash.loadLevel(1, 1);
        window.__towerclash.setSpeed(20);
        window.__towerclash.autoplay();
      });
      await toResult(page, 'won');
      await runCard('won', fill(S.level, { n: 1, name: levelName(levelById(1), lang) }), null, 'towerclash-level-01.png');

      // 2. campaign defeat (first defeat of the level: no skip offer, SHARE stays inline)
      const lost = levelById(LOSS_LEVEL);
      // awaited: the previous result screen stays up until the level chunk is in and play starts
      expect(
        await page.evaluate(
          ([id, seed]) => {
            const started = window.__towerclash.loadLevel(id, seed);
            window.__towerclash.setSpeed(20);
            window.__towerclash.economy.autoLose();
            return started;
          },
          [lost.id, LOSS_SEED] as const
        )
      ).toBe(true);
      await toResult(page, 'lost');
      await runCard('lost', fill(S.level, { n: lost.id, name: levelName(lost, lang) }), null, `towerclash-level-${String(lost.id).padStart(2, '0')}.png`);

      // 3. daily challenge won by the reference player (share.spec.ts: DAY_KEY's level is a bot win) — the
      //    tallest card: level, day key + twist, stars and time
      await page.evaluate((key) => window.__towerclash.setDayKey(key), DAY_KEY);
      const ch = await page.evaluate(() => JSON.parse(JSON.stringify(window.__towerclash.daily.get().challenge)) as { dayKey: string; levelId: number; twist: { id: string } });
      expect(ch.dayKey).toBe(DAY_KEY);
      const twist = await text(page, `daily.twist.${ch.twist.id}`);
      expect(
        await page.evaluate(() => {
          const started = window.__towerclash.daily.start();
          window.__towerclash.setSpeed(20);
          window.__towerclash.autoplay();
          return started;
        })
      ).toBe(true);
      await toResult(page, 'won');
      const dailyLine = fill(S.daily, { key: DAY_KEY, twist });
      expect(dailyLine).toContain(DAY_KEY);
      await runCard('daily', fill(S.level, { n: ch.levelId, name: levelName(levelById(ch.levelId), lang) }), dailyLine, `towerclash-daily-${DAY_KEY}.png`);

      // 4. string sweep: every level name, every daily / weekly twist line, both titles
      expect(fontFamily).toMatch(/Fredoka/);
      const twists = await Promise.all(TWISTS.map((id) => text(page, `daily.twist.${id}`)));
      const strings = [
        ...LEVELS.map((l) => ({ role: 'level' as const, text: fill(S.level, { n: l.id, name: levelName(l, lang) }) })),
        ...twists.flatMap((tw) => [S.daily, S.weekly].map((tpl) => ({ role: 'challenge' as const, text: fill(tpl, { key: DAY_KEY, twist: tw }) }))),
        { role: 'title' as const, text: S.victory },
        { role: 'title' as const, text: S.defeat },
      ];
      const fitted = await sweep(page, fontFamily, strings);
      for (const role of ['title', 'level', 'challenge'] as const) {
        // the tightest string: the smallest fitted size, then the widest at that size
        const worst = fitted.filter((f) => f.role === role).reduce((a, b) => (b.px < a.px || (b.px === a.px && b.width > a.width) ? b : a));
        report.push(
          `${`${lang}-sweep`.padEnd(12)} ${role.padEnd(9)} ${String(worst.px).padStart(3)}/${BASE_PX[role]}px  w=${worst.width.toFixed(0).padStart(4)}/${ROW_MAX_W}  tightest of ${
            fitted.filter((f) => f.role === role).length
          }: "${worst.text}"`
        );
        expect(worst.px, `${lang}: "${worst.text}" would be fitted to ${worst.px}px (< ${MIN_SCALE * 100}% of ${BASE_PX[role]}px)`).toBeGreaterThanOrEqual(Math.ceil(BASE_PX[role] * MIN_SCALE));
      }

      await info.attach(`share-${lang}-fit.txt`, { body: report.join('\n'), contentType: 'text/plain' });
      console.log(report.join('\n'));
      expect(errors).toEqual([]);
    });
  }
});
