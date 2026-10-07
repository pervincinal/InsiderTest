import type { Palette } from './palette';
import { biomeFor, shade, withAlpha } from './palette';
import { FONT, drawCard, drawExtrudedText, drawStar, fitFontPx, font, formatTime, innerHighlight, roundRect } from './widgets';
import { drawTowerShadow, drawTowerSprite } from './sprites';
import { drawBush, makeRng } from './terrain';
import { t } from '../ui/i18n';

/*
 * Share card (SHARE-1, GDD §7.6): a 1080 × 1350 (4:5) picture of one result, drawn with the game's
 * own canvas primitives on an offscreen canvas — never a DOM screenshot. Lazy: only src/ui/share.ts
 * (itself reached through `import('./share')` from the result screen) imports this module, so it
 * ships in the share chunk and the eager bundle does not grow.
 *
 * Layout (logical px of the 1080 × 1350 image):
 *   0–1350    water of the palette (sky → shallows gradient) with a few deterministic sparkles
 *   ~128      "TOWER CLASH" in gold clay lettering
 *   300–720   an island in the level's biome colours (grass, cliff, path, bushes, dots) carrying one
 *             big L3 tower — the player's colour on a win, the first enemy's on a defeat
 *   740–1240  paper card: a coloured banner with VICTORY / DEFEAT, then "Level N · name", the
 *             daily / weekly key + twist (the line that makes the card verifiable), the stars and
 *             the clock — the rows are centred in the space under the banner. A defeat shows the
 *             three star slots empty (ART-12): the same three rows as a campaign win, so the card
 *             reads as "0 of 3 — your turn" instead of two lines floating in an empty card
 *   ~1298     footer "towerclash · v<version>"
 * The palette passed in is the player's (default or colour-blind); nothing animates, so reduced
 * motion has nothing to stop.
 *
 * Fonts (ART-12): one family per line. A line with Cyrillic in it (Russian UI) is set in Nunito,
 * every other line in Fredoka (`shareFontFamily`). The bundled Nunito file is Google's Cyrillic
 * subset (U+0400–045F, U+0490–0491, U+04B0–04B1, U+0301, U+2116 + space / NBSP — checked against
 * its cmap 2026-10-07): it has **no Latin digits, no ':' and no '·'**, so those still come from
 * Fredoka 700 in a Russian line ("Уровень 3 · …", "Время 00:54"). Fallback chosen instead of a new
 * font file: the Cyrillic is drawn heavier, from the same bundled variable file (wght axis
 * 200–1000) registered once more as the share-only face `Nunito Share` at wght 900, which matches
 * Fredoka 700's stroke — at Nunito 700 the Fredoka digits looked a weight heavier than the
 * letters (QA-14). The line's font weight stays 700 (Fredoka's face for the digits); the face's
 * `weight: '900'` descriptor makes the browser clamp the variable axis to 900 (CSS Fonts 4).
 * `loadShareFonts` loads every face a card needs before it is drawn; plain Nunito follows in the
 * stack, so a share face that failed to load falls back to the game's Nunito 700, never to a
 * system face. A one-family Russian line would need a Nunito Latin subset file (≈ 20 kB, not
 * bundled; ART-12 report, 2026-10-07).
 */

export const SHARE_W = 1080;
export const SHARE_H = 1350;

/** What one share card shows. Strings are already in the UI language except the key (a date). */
export interface ShareCardSpec {
  levelId: number;
  /** Level name in the UI language. */
  levelName: string;
  won: boolean;
  /** 0–3; 0 on a defeat. */
  stars: number;
  /** Clear (or defeat) clock in ms. */
  timeMs: number;
  /** Daily / weekly challenge: the UTC day key (weekly: its Monday) and the twist's display name. */
  challenge: { kind: 'daily' | 'weekly'; key: string; twist: string } | null;
  /** App version as the settings About block shows it (`appVersion()`). */
  version: string;
}

/** Card rectangles (exported for tests and the e2e look review). */
export const SHARE_LAYOUT = Object.freeze({
  island: { x: 150, y: 300, w: 780, h: 380 },
  cliffDepth: 46,
  tower: { x: 540, y: 600, scale: 2.3 },
  card: { x: 90, y: 740, w: 900, h: 500 },
  bannerH: 124,
  footerY: 1298,
});

/** Cyrillic letters (Russian UI text). */
const CYRILLIC = /[\u0400-\u04FF]/;

/** Share-only face: the bundled Nunito Cyrillic file at wght 900 (see the header). */
export const SHARE_CYRILLIC_FACE = Object.freeze({
  family: 'Nunito Share',
  url: './fonts/nunito-cyrillic.woff2',
  /** Same range as index.html's Nunito face. */
  unicodeRange: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116',
  weight: '900',
});

/** True when `text` contains Cyrillic. */
export function hasCyrillic(text: string): boolean {
  return CYRILLIC.test(text);
}

/**
 * Font family stack for one share-card line: a line with Cyrillic → Nunito (the share face, then
 * the game's Nunito 700 as its loading fallback, then the game stack for the digits / punctuation
 * the Cyrillic subset lacks); anything else → the game stack, i.e. Fredoka.
 */
export function shareFontFamily(text: string): string {
  return hasCyrillic(text) ? `'${SHARE_CYRILLIC_FACE.family}', 'Nunito', ${FONT}` : FONT;
}

/** The challenge line of the card and of the share text ("Daily 2026-10-05 · Lean rations"), or null. */
export function challengeLine(spec: ShareCardSpec): string | null {
  const c = spec.challenge;
  if (!c) return null;
  return t(c.kind === 'weekly' ? 'share.weekly' : 'share.daily', { key: c.key, twist: c.twist });
}

/** The rows of the info card under the banner, top to bottom. */
export type ShareRow = 'level' | 'challenge' | 'stars' | 'time';

/** Row heights (px of the 1080 × 1350 image). */
export const SHARE_ROW_H: Readonly<Record<ShareRow, number>> = Object.freeze({ level: 74, challenge: 58, stars: 140, time: 70 });

/** Rows of the info card: level, the challenge line (daily / weekly), the stars (empty on a defeat), the clock. */
export function shareInfoRows(spec: ShareCardSpec): ShareRow[] {
  return ['level', ...(spec.challenge ? (['challenge'] as const) : []), 'stars', 'time'];
}

function titleText(spec: ShareCardSpec): string {
  return spec.won ? t('result.victory') : t('result.defeat');
}
function levelLine(spec: ShareCardSpec): string {
  return t('share.level', { n: spec.levelId, name: spec.levelName });
}
function timeLine(spec: ShareCardSpec): string {
  return t('result.time', { time: formatTime(spec.timeMs) });
}
function footerText(spec: ShareCardSpec): string {
  return `towerclash · v${spec.version}`;
}

/** Every line of text the card draws, in drawing order (font loading, tests). */
export function shareCardTexts(spec: ShareCardSpec): string[] {
  const challenge = challengeLine(spec);
  return ['TOWER CLASH', titleText(spec), levelLine(spec), ...(challenge ? [challenge] : []), timeLine(spec), footerText(spec)];
}

let cyrillicFace: FontFace | null = null;

/**
 * Load every face the card for `spec` draws with (Fredoka 500 / 700 for the subsets its text uses;
 * for Cyrillic text the share face and the game's Nunito) before `drawShareCard`, so the PNG is
 * never painted in a fallback face. The boot already waits for Fredoka (and Nunito in Russian),
 * so this normally resolves at once. Bounded: a missing font never blocks the share. No-op without
 * the CSS Font Loading API (unit tests).
 */
export async function loadShareFonts(spec: ShareCardSpec, timeoutMs = 2000): Promise<void> {
  const fonts = typeof document === 'undefined' ? undefined : (document as { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.load !== 'function') return;
  const loads: Promise<unknown>[] = [];
  const texts = shareCardTexts(spec);
  if (texts.some(hasCyrillic) && typeof FontFace === 'function') {
    if (!cyrillicFace) {
      const f = SHARE_CYRILLIC_FACE;
      const url = typeof document.baseURI === 'string' ? new URL(f.url, document.baseURI).href : f.url;
      cyrillicFace = new FontFace(f.family, `url('${url}') format('woff2')`, { weight: f.weight, unicodeRange: f.unicodeRange, display: 'block' });
      fonts.add(cyrillicFace);
    }
    loads.push(cyrillicFace.load());
  }
  for (const text of texts) {
    const family = shareFontFamily(text);
    loads.push(fonts.load(font(32, '700', family), text));
    if (text.startsWith('towerclash')) loads.push(fonts.load(font(32, '500', family), text));
  }
  const all = Promise.all(loads).then(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => (timer = setTimeout(resolve, timeoutMs)));
  await Promise.race([all, timeout]).catch(() => undefined);
  if (timer !== undefined) clearTimeout(timer);
}

/** Draw the whole card into `ctx`, whose user space is the 1080 × 1350 image. */
export function drawShareCard(ctx: CanvasRenderingContext2D, pal: Palette, spec: ShareCardSpec): void {
  ctx.save();
  ctx.lineCap = 'round';
  drawWater(ctx, pal, spec.levelId);
  drawExtrudedText(ctx, 'TOWER CLASH', SHARE_W / 2, 128, fitFontPx(ctx, 'TOWER CLASH', 118, 940), { face: pal.gold, side: pal.goldShade, outline: pal.ink, depth: 9 });
  drawIsland(ctx, pal, spec);
  drawInfoCard(ctx, pal, spec);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const footer = footerText(spec);
  ctx.font = font(30, '500', shareFontFamily(footer));
  ctx.fillStyle = withAlpha(pal.ink, 0.72);
  ctx.fillText(footer, SHARE_W / 2, SHARE_LAYOUT.footerY, SHARE_W - 120);
  ctx.restore();
}

function drawWater(ctx: CanvasRenderingContext2D, pal: Palette, seed: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, SHARE_H);
  g.addColorStop(0, pal.sky);
  g.addColorStop(0.45, pal.waterTop);
  g.addColorStop(1, pal.waterBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SHARE_W, SHARE_H);
  // sparkles: deterministic per level, so the same result always gives the same picture
  const rng = makeRng(seed * 7919 + 17);
  ctx.fillStyle = pal.waterSparkle;
  for (let i = 0; i < 22; i++) {
    const x = rng() * SHARE_W;
    const y = 220 + rng() * (SHARE_H - 260);
    const w = 10 + rng() * 26;
    ctx.beginPath();
    ctx.ellipse(x, y, w, w * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawIsland(ctx: CanvasRenderingContext2D, pal: Palette, spec: ShareCardSpec): void {
  const b = pal.biomes[biomeFor(spec.levelId)];
  const r = SHARE_LAYOUT.island;
  const radius = 150;
  const depth = SHARE_LAYOUT.cliffDepth;
  // ground shadow on the water, then the cliff (lit → shade), then the grass top
  ctx.fillStyle = pal.groundShadow;
  roundRect(ctx, { x: r.x + 18, y: r.y + depth + 22, w: r.w, h: r.h }, radius);
  ctx.fill();
  const cliff = ctx.createLinearGradient(0, r.y + r.h - 40, 0, r.y + r.h + depth);
  cliff.addColorStop(0, b.cliff.lit);
  cliff.addColorStop(1, b.cliff.shade);
  ctx.fillStyle = cliff;
  roundRect(ctx, { x: r.x, y: r.y + depth, w: r.w, h: r.h }, radius);
  ctx.fill();
  const top = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
  top.addColorStop(0, b.grass.lit);
  top.addColorStop(0.6, b.grass.mid);
  top.addColorStop(1, b.grass.shade);
  ctx.fillStyle = top;
  roundRect(ctx, r, radius);
  ctx.fill();
  innerHighlight(ctx, r, radius, 0.5, 4);
  // a lane winding in from the left to the tower's door
  const tw = SHARE_LAYOUT.tower;
  ctx.lineCap = 'round';
  for (const [color, width, dy] of [
    [b.path.shade, 46, 6],
    [b.path.lit, 40, 0],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(r.x + 60, r.y + r.h - 70 + dy);
    ctx.quadraticCurveTo(r.x + 230, r.y + 150 + dy, tw.x - 40, tw.y + 10 + dy);
    ctx.stroke();
  }
  // scatter: dots, then bushes (deterministic per level), then the tower
  const rng = makeRng(spec.levelId * 104_729 + 3);
  for (let i = 0; i < 26; i++) {
    const x = r.x + 70 + rng() * (r.w - 140);
    const y = r.y + 50 + rng() * (r.h - 100);
    ctx.fillStyle = b.dots[i % b.dots.length]!;
    ctx.beginPath();
    ctx.arc(x, y, 4 + rng() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const bushes: readonly (readonly [number, number, number])[] = [
    [r.x + 120, r.y + 120, 30],
    [r.x + r.w - 130, r.y + 110, 34],
    [r.x + r.w - 110, r.y + r.h - 90, 28],
    [r.x + 330, r.y + r.h - 60, 22],
  ];
  for (const [x, y, s] of bushes) drawBush(ctx, pal, b.bush, x, y, s);
  const owner = spec.won ? 'player' : 'enemy1';
  ctx.save();
  roundRect(ctx, r, radius); // the cast shadow stays on the grass
  ctx.clip();
  ctx.translate(tw.x, tw.y);
  ctx.scale(tw.scale, tw.scale);
  ctx.fillStyle = pal.objectShadow;
  drawTowerShadow(ctx, pal, 0, 0, 'barracks', 3);
  ctx.restore();
  ctx.save();
  ctx.translate(tw.x, tw.y);
  ctx.scale(tw.scale, tw.scale);
  drawTowerSprite(ctx, pal, { x: 0, y: 0, owner, kind: 'barracks', level: 3 }, { nowMs: 0, motion: false, direct: true });
  ctx.restore();
}

function drawInfoCard(ctx: CanvasRenderingContext2D, pal: Palette, spec: ShareCardSpec): void {
  const card = SHARE_LAYOUT.card;
  const radius = 40;
  drawCard(ctx, pal, card, { radius, edge: 8 });
  // banner: the outcome colour across the top of the card (owner colours follow the palette, incl. colour-blind)
  const bannerColor = spec.won ? pal.owners.player : pal.owners.enemy1;
  const bannerH = SHARE_LAYOUT.bannerH;
  ctx.save();
  roundRect(ctx, { x: card.x, y: card.y, w: card.w, h: card.h - 8 }, radius);
  ctx.clip();
  const g = ctx.createLinearGradient(0, card.y, 0, card.y + bannerH);
  g.addColorStop(0, shade(bannerColor, 0.18));
  g.addColorStop(1, bannerColor);
  ctx.fillStyle = g;
  ctx.fillRect(card.x, card.y, card.w, bannerH);
  ctx.fillStyle = shade(bannerColor, -0.3);
  ctx.fillRect(card.x, card.y + bannerH - 6, card.w, 6);
  ctx.restore();
  const title = titleText(spec);
  const titleFamily = shareFontFamily(title);
  const titlePx = fitFontPx(ctx, title, 88, card.w - 80, '700', titleFamily);
  // BUG-20: the title's centre stays at card.y + 66 (AZ / TR dotted capitals clear the card top)
  if (spec.won) drawExtrudedText(ctx, title, SHARE_W / 2, card.y + 66, titlePx, { face: pal.gold, side: pal.goldShade, outline: pal.ink, depth: 8, family: titleFamily });
  else drawExtrudedText(ctx, title, SHARE_W / 2, card.y + 66, titlePx, { face: pal.paper, side: shade(pal.owners.enemy1, -0.45), outline: pal.ink, depth: 8, family: titleFamily });

  // rows under the banner, centred in the remaining space (heights: SHARE_ROW_H)
  const challenge = challengeLine(spec);
  const maxW = card.w - 80;
  const levelText = levelLine(spec);
  const timeText = timeLine(spec);
  const textRow = (text: string, px: number, color: string) => (cy: number) => {
    const family = shareFontFamily(text);
    ctx.fillStyle = color;
    ctx.font = font(fitFontPx(ctx, text, px, maxW, '700', family), '700', family);
    ctx.fillText(text, SHARE_W / 2, cy);
  };
  const draws: Record<ShareRow, (cy: number) => void> = {
    level: textRow(levelText, 54, pal.ink),
    challenge: challenge ? textRow(challenge, 38, pal.accent) : () => undefined,
    // a defeat keeps the three slots, all empty: the same rhythm as a win, and the stake is visible
    stars: (cy) => {
      for (let i = 0; i < 3; i++) drawStar(ctx, pal, SHARE_W / 2 + (i - 1) * 160, cy, 58, spec.won && i < spec.stars);
    },
    time: textRow(timeText, 46, spec.won ? pal.ink : pal.textDim),
  };
  const rows = shareInfoRows(spec);
  const top = card.y + bannerH;
  const space = card.h - 8 - bannerH;
  const total = rows.reduce((a, r) => a + SHARE_ROW_H[r], 0);
  let y = top + (space - total) / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const row of rows) {
    draws[row](y + SHARE_ROW_H[row] / 2);
    y += SHARE_ROW_H[row];
  }
}
