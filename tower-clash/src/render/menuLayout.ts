import type { Rect } from './widgets';
import type { HudAnchors } from './view';
import { CONFIRM } from './layout';

/*
 * Geometry only the lazily loaded menu screens use (settings, level map, achievements, shop):
 * kept out of layout.ts so it stays off the eager chunk (scripts/checkBundle.mjs budget, PERF-6).
 */

/* ---------- full-bleed bands of the menus (FE-11) ---------- */

/**
 * FE-11 (from BUG-34): on a screen taller than 9:16 a menu's header band — glass *and* content — sits
 * on the top safe-area edge like the play HUD's top band (`hudAnchors(view).top`, ≤ 0), its bottom
 * chrome (the level map's commander chip, the how-to CLOSE) on the bottom one (`.bottom`, ≥ 0), and
 * the content in between takes the room this frees. The rects in this file stay the 9:16 layout; a
 * screen maps between them and the screen's logical points with its `MenuBands` split:
 *   layout y < `topEnd`                → moved with the header (+ a.top)
 *   layout y ≥ `bottomStart`           → moved with the bottom chrome (+ a.bottom)
 *   in between                         → the content, moved by `content(a)` (a scrolling list follows
 *                                        the header; the level map's path stays put)
 * On 9:16 (and on a wide screen) both anchors are 0 and every mapping is the identity.
 */
export interface MenuBands {
  /** Layout y where the top band (header + sticky rows) ends. */
  topEnd: number;
  /** Layout y where the bottom band starts (Infinity: the screen has none). */
  bottomStart: number;
  /** Offset of the content between the bands for anchors `a`. */
  content: (a: HudAnchors) => number;
}

/** Where layout point (x, y) of a screen with bands `b` is drawn (screen logical). */
export function bandToScreen(a: HudAnchors, b: MenuBands, x: number, y: number): { x: number; y: number } {
  if (y < b.topEnd) return { x, y: y + a.top };
  if (y >= b.bottomStart) return { x, y: y + a.bottom };
  return { x, y: y + b.content(a) };
}

/** Inverse of `bandToScreen`: the layout point under screen logical point (x, y) — what hit tests use. */
export function screenToBand(a: HudAnchors, b: MenuBands, x: number, y: number): { x: number; y: number } {
  if (y < b.topEnd + a.top) return { x, y: y - a.top };
  if (y >= b.bottomStart + a.bottom) return { x, y: y - a.bottom };
  return { x, y: y - b.content(a) };
}

/**
 * Which band screen logical y falls in. A screen whose content does not move with the header (the
 * level map's path, the how-to's stretched card) hit-tests each rect only in its own band: the
 * content's layout range overlaps the header's / bottom chrome's rects on a tall screen.
 */
export function bandAt(a: HudAnchors, b: MenuBands, y: number): 'top' | 'content' | 'bottom' {
  if (y < b.topEnd + a.top) return 'top';
  if (y >= b.bottomStart + a.bottom) return 'bottom';
  return 'content';
}

/** Header-only screens whose whole body follows the header (shop, settings, achievements). */
export const followHeader = (a: HudAnchors): number => a.top;
/** Content that does not move (the level map's path: its scroll range grows instead). */
export const staysPut = (): number => 0;

/* ---------- settings ---------- */

/**
 * Settings screen (M3-3): glass header with BACK, a tall clay card with one row per setting
 * (label left, control right) and a RESET PROGRESS button that opens a confirm card.
 */
export const SETTINGS = Object.freeze({
  headerH: 100,
  back: { x: 18, y: 20, w: 140, h: 60 } as Rect,
  card: { x: 50, y: 150, w: 620, h: 934 } as Rect,
  rowH: 96,
  labelX: 86,
  /** Row controls, top to bottom. */
  sound: { x: 470, y: 216, w: 160, h: 56 } as Rect,
  colorBlind: { x: 470, y: 312, w: 160, h: 56 } as Rect,
  /** Three segments ≥ 88 wide each (AUD-U1: 44 pt at 360 wide). */
  motion: { x: 356, y: 408, w: 274, h: 56 } as Rect,
  /**
   * "How to play" row (FE-3): the whole row is the tap target (label left, chevron disc right). It
   * takes the slot the rules-v2 removal of the send ratio freed (y ≈ 504), so the language picker /
   * reset rects (mirrored by the e2e specs) keep their positions.
   */
  howto: { x: 86, y: 500, w: 548, h: 64 } as Rect,
  /** Language row: label line at `languageLabelY`, then a full-width picker (one segment per language, I18N). */
  languageLabelY: 600,
  language: { x: 86, y: 664, w: 548, h: 56 } as Rect,
  /**
   * "Team colours" row (FE-14): a title line at `tonesLabelY` (with a swatch strip of the live set on
   * the right), then a full-width four-way picker (classic / vivid / royal / pastel, `TONE_SETS`). It
   * goes under the language picker, so every rect above keeps its place; the progress summary, RESET
   * and the About card moved down (worst case, About with support id + privacy options, ends at 1260
   * of 1280).
   */
  tonesLabelY: 736,
  tones: { x: 86, y: 786, w: 548, h: 56 } as Rect,
  /**
   * "Text size" row (AUD-U2): label left, a 100 / 125 / 150 % segmented control right (three segments
   * ≥ 88 wide, AUD-U1), under a hairline at `textSizeSepY`. It goes under the team colours, so every
   * rect above keeps its place; the summary, RESET and the About card moved down 90 (worst case, About
   * with support id + privacy options, ends at 1350: the screen scrolls when it is taller than the
   * screen, settings.ts).
   */
  textSizeSepY: 856,
  textSize: { x: 356, y: 874, w: 274, h: 56 } as Rect,
  /** Centre line of the stars / coins summary above RESET. */
  summaryY: 966,
  reset: { x: 160, y: 996, w: 400, h: 64 } as Rect,
  confirm: {
    card: { x: 90, y: 470, w: 540, h: 320 } as Rect,
    yes: { x: 130, y: 676, w: 210, h: 72 } as Rect,
    no: { x: 380, y: 676, w: 210, h: 72 } as Rect,
  },
  /** About card under the settings card: version, support id (copy), privacy options (native). */
  about: { x: 50, y: 1102, w: 620 },
  aboutRowH: 62,
});

/** Settings bands (FE-11): the cards follow the header up; no bottom chrome. The confirm card stays centred (not banded). */
export const SETTINGS_BANDS: MenuBands = Object.freeze({ topEnd: SETTINGS.headerH, bottomStart: Infinity, content: followHeader });

/* ---------- level select: winding path map ---------- */

/** Level-select geometry (content space scrolls vertically under a fixed header). */
export const LEVEL_MAP = Object.freeze({
  headerH: 100,
  /** 100 wide here (140 on the other menus): the DAILY tab's tap area reaches up beside it (AUD-U1). */
  back: { x: 18, y: 20, w: 100, h: 60 } as Rect,
  /** Gold + crystal pills in the header (tap → shop). */
  wallet: { x: 402, y: 24, w: 300, h: 52 } as Rect,
  /** Commander summary chip at the bottom (tap → shop, upgrades tab). */
  commander: { x: 60, y: 1206, w: 600, h: 54 } as Rect,
  /** Daily Challenge card (GDD §7): sticky under the header, over the scrolling map (tap → start). */
  daily: { x: 30, y: 112, w: 660, h: 104 } as Rect,
  /** DAILY / WEEKLY tabs in the card's title row (GDD §8.2): drawn as a 36 px segmented pill. */
  dailyTabDaily: { x: 126, y: 118, w: 118, h: 44 } as Rect,
  dailyTabWeekly: { x: 244, y: 118, w: 118, h: 44 } as Rect,
  /**
   * The tabs' tap areas (AUD-U1): 88 tall, ending at the tabs' bottom — the card's level · twist line
   * runs right under them and a tap there starts the challenge — and reaching up into the gap under
   * the header, clear of BACK (100 wide here) and the wallet.
   */
  dailyTabDailyHit: { x: 126, y: 74, w: 118, h: 88 } as Rect,
  dailyTabWeeklyHit: { x: 244, y: 74, w: 118, h: 88 } as Rect,
  /**
   * "Yesterday's map" row (DAILY-6, GDD §7.3): a slimmer secondary card docked under the daily card,
   * sticky like it, on the DAILY tab only while yesterday's challenge is unwon. ≥ 44 px tap target.
   */
  yesterday: { x: 54, y: 222, w: 612, h: 56 } as Rect,
  /**
   * The row's tap area (AUD-U1): 88 tall, reaching down from the row (the challenge card sits right
   * above it); the sticky block and its band end at its bottom.
   */
  yesterdayHit: { x: 54, y: 222, w: 612, h: 88 } as Rect,
  /** Node radius (hit rect is the 2r square). */
  nodeR: 46,
  /** Content-space y of the first node and the vertical step between nodes. */
  top: 260,
  step: 150,
  /** Horizontal swing of the winding path around the centre. */
  amp: 185,
  /** Nodes per full left-right cycle. */
  period: 5,
  /** Extra content below the last node. */
  tail: 220,
});

/**
 * Level map bands (FE-11): header + challenge card (+ the "Yesterday's map" row) go up with the
 * header, the commander chip (and the 10 px dead zone around it) down to the bottom safe edge; the
 * path stays where it is and the scroll range follows the chip (`levelMapMaxScroll(count, MAP_H + a.bottom)`).
 */
export function levelMapBands(yesterdayRow: boolean): MenuBands {
  const sticky = yesterdayRow ? LEVEL_MAP.yesterdayHit : LEVEL_MAP.daily;
  // AUD-U1: the chip's band starts where its 88-tall tap area does (1206 + 27 − 44)
  return { topEnd: sticky.y + sticky.h, bottomStart: LEVEL_MAP.commander.y - 17, content: staysPut };
}

/** Content-space centre of level node `index`. */
export function levelNodeCentre(index: number): { x: number; y: number } {
  return {
    x: 360 + LEVEL_MAP.amp * Math.sin((index * Math.PI * 2) / LEVEL_MAP.period),
    y: LEVEL_MAP.top + index * LEVEL_MAP.step,
  };
}

/** Screen-space hit rect of level node `index` when the map is scrolled by `scroll` px. */
export function levelNodeRect(index: number, scroll: number): Rect {
  const c = levelNodeCentre(index);
  const r = LEVEL_MAP.nodeR;
  return { x: c.x - r, y: c.y - scroll - r, w: r * 2, h: r * 2 };
}

/** Largest scroll offset for `count` levels (0 when everything fits). */
export function levelMapMaxScroll(count: number, viewH = 1280): number {
  const contentBottom = LEVEL_MAP.top + Math.max(0, count - 1) * LEVEL_MAP.step + LEVEL_MAP.tail;
  return Math.max(0, contentBottom - viewH);
}

/**
 * Smallest scroll offset: 0, or negative while the "Yesterday's map" row is up, so the map can be
 * pulled down by the row's height and level 1 clears the taller sticky block (DAILY-6).
 */
export function levelMapMinScroll(yesterdayRow: boolean): number {
  const d = LEVEL_MAP.daily;
  const y = LEVEL_MAP.yesterdayHit;
  return yesterdayRow ? d.y + d.h - (y.y + y.h) : 0;
}

/* ---------- shop tabs ---------- */

export const SHOP_TABS = ['crystals', 'bundles', 'skins', 'upgrades'] as const;
export type ShopTab = (typeof SHOP_TABS)[number];

/** Tabs that sell store products (IAP packs, bundles) — with their converter / crate and RESTORE. */
const STORE_TABS: readonly ShopTab[] = ['crystals', 'bundles'];

/**
 * Tabs shown in the shop's segmented row (PUB-14): all four when the store is available (web fake
 * store, configured RevenueCat); without a store the Crystals and Bundles tabs are not drawn and
 * not hit-tested — no greyed fallback prices for App Review to read as an unfinished feature —
 * and Skins / Upgrades re-flow over the full row.
 */
export function shopTabsFor(storeAvailable: boolean): readonly ShopTab[] {
  return storeAvailable ? SHOP_TABS : SHOP_TABS.filter((tab) => !STORE_TABS.includes(tab));
}

/* ---------- settings: About card ---------- */

export interface SettingsAboutLayout {
  card: Rect;
  /** Baseline y of the version row. */
  versionY: number;
  /** Baseline y of the support-id row, or null when there is no id. */
  supportY: number | null;
  /** COPY button beside the support id. */
  copy: Rect | null;
  /** PRIVACY OPTIONS button (only when the ads SDK requires a privacy options entry). */
  privacy: Rect | null;
}

/** Rows of the About card, top to bottom: version · support id (optional) · privacy (optional). */
export function settingsAboutLayout(hasSupportId: boolean, hasPrivacy: boolean): SettingsAboutLayout {
  const a = SETTINGS.about;
  const rowH = SETTINGS.aboutRowH;
  let y = a.y + 22;
  const versionY = y + rowH / 2;
  y += rowH;
  let supportY: number | null = null;
  let copy: Rect | null = null;
  if (hasSupportId) {
    supportY = y + rowH / 2;
    copy = { x: a.x + a.w - 148, y: y + rowH / 2 - 24, w: 118, h: 48 };
    y += rowH;
  }
  let privacy: Rect | null = null;
  if (hasPrivacy) {
    // AUD-U1: 320 wide (centred) so its tap area stays left of COPY's (522–640), whose 88-tall area reaches down to here
    privacy = { x: 200, y: y + 10, w: 320, h: 60 };
    y += 80;
  }
  return { card: { x: a.x, y: a.y, w: a.w, h: y + 22 - a.y }, versionY, supportY, copy, privacy };
}

/* ---------- "How to play" card (FE-3) ---------- */

/**
 * One card, no scrolling: glass header (BACK · title), six rule rows (icon box left, one wrapped
 * sentence right; GD-5f added the supply line) and a CLOSE button. Everything fits 720×1280, so it
 * fits 360×640 at DPR 1 too.
 */
export const HOWTO = Object.freeze({
  headerH: 100,
  back: { x: 18, y: 20, w: 140, h: 60 } as Rect,
  card: { x: 40, y: 124, w: 640, h: 1032 } as Rect,
  rows: 6,
  row: { x: 60, y0: 150, w: 600, h: 148 },
  /** Icon box inside a row (left) and the text column (right). */
  icon: { x: 68, w: 120, h: 120 },
  text: { x: 204, w: 448 },
  textPx: 22,
  lineH: 30,
  maxLines: 3,
  close: { x: 180, y: 1054, w: 360, h: 72 } as Rect,
});

/**
 * How-to bands (FE-11): header up, CLOSE (with the card's bottom edge) down to the bottom safe edge;
 * the card stretches between them and its rows spread evenly over the extra height (`howtoRowShift`).
 */
export const HOWTO_BANDS: MenuBands = Object.freeze({ topEnd: HOWTO.headerH, bottomStart: HOWTO.close.y - 14, content: followHeader });

/** Vertical shift of how-to row `i` on a tall screen: from the header's (a.top) towards CLOSE's (a.bottom), evenly. */
export function howtoRowShift(a: HudAnchors, i: number): number {
  return a.top + ((a.bottom - a.top) * (i + 0.5)) / HOWTO.rows;
}

/** Row `i` (0-based) of the card. */
export function howtoRowRect(i: number): Rect {
  const r = HOWTO.row;
  return { x: r.x, y: r.y0 + i * r.h, w: r.w, h: r.h };
}

/** Icon box of row `i`, vertically centred in the row. */
export function howtoIconRect(i: number): Rect {
  const row = howtoRowRect(i);
  return { x: HOWTO.icon.x, y: row.y + (row.h - HOWTO.icon.h) / 2, w: HOWTO.icon.w, h: HOWTO.icon.h };
}

/* ---------- achievements (ECONOMY.md §2.1) ---------- */

/**
 * Achievements screen: glass header (BACK · title), a summary pill and one row per catalog
 * achievement (medal · label + progress bar · crystal reward). Rows scroll when they overflow.
 */
export const ACHIEVEMENTS_LAYOUT = Object.freeze({
  headerH: 100,
  back: { x: 18, y: 20, w: 140, h: 60 } as Rect,
  summary: { x: 110, y: 112, w: 500, h: 44 } as Rect,
  row: { x: 34, w: 652, h: 96, gap: 10, y0: 176 },
  contentTop: 168,
  contentBottom: 1262,
});

/** Achievements bands (FE-11): summary pill and rows follow the header; the rows' viewport reaches `contentBottom + a.bottom − a.top`. */
export const ACHIEVEMENTS_BANDS: MenuBands = Object.freeze({ topEnd: ACHIEVEMENTS_LAYOUT.contentTop, bottomStart: Infinity, content: followHeader });

/** Content-space rect of achievement row `i`. */
export function achievementRowRect(i: number): Rect {
  const r = ACHIEVEMENTS_LAYOUT.row;
  return { x: r.x, y: r.y0 + i * (r.h + r.gap), w: r.w, h: r.h };
}

/** Largest scroll for `count` rows (0 when everything fits); `extra` = the room a tall screen adds to the viewport (FE-11). */
export function achievementsMaxScroll(count: number, extra = 0): number {
  const bottom = ACHIEVEMENTS_LAYOUT.row.y0 + count * (ACHIEVEMENTS_LAYOUT.row.h + ACHIEVEMENTS_LAYOUT.row.gap) + 10;
  return Math.max(0, bottom - ACHIEVEMENTS_LAYOUT.contentBottom - Math.max(0, extra));
}

/* ---------- shop (ECONOMY.md §4, Phase A) ---------- */

/**
 * Shop: glass header (BACK · SHOP · wallet), a segmented tab row and a scrollable content area
 * whose cards are laid out by the helpers below (content space; the screen subtracts its scroll).
 */
export const SHOP = Object.freeze({
  headerH: 100,
  back: { x: 18, y: 20, w: 140, h: 60 } as Rect,
  wallet: { x: 402, y: 24, w: 300, h: 52 } as Rect,
  tabs: { x: 30, y: 112, w: 660, h: 60 } as Rect,
  /** Content viewport (below the tabs, above the bottom margin). */
  contentTop: 192,
  contentBottom: 1262,
  /** Crystal packs: two columns. */
  pack: { w: 316, h: 262, gapX: 20, gapY: 18, x0: 34, y0: 200 },
  /** Bundles, upgrades: full-width rows. */
  row: { x: 34, w: 652, h: 168, gap: 16, y0: 200 },
  /** Skins: three columns under a category header. */
  skin: { w: 208, h: 236, gapX: 14, gapY: 16, x0: 34, headerH: 46 },
  restoreH: 60,
  /** Buy button inside a card (relative to the card's bottom-right). */
  buyW: 150,
  buyH: 54,
  /** Crystals → gold confirm card (screen space, over the tab); AUD-U5: every crystal spend asks on it (`CONFIRM`). */
  convertConfirm: CONFIRM,
});

/**
 * Shop bands (FE-11): header, tabs and the scrolling cards all follow the header up; the cards'
 * viewport (layout `contentTop` … `contentBottom + a.bottom − a.top`) takes the freed room. The
 * crystals → gold confirm card stays centred on the screen (not banded).
 */
export const SHOP_BANDS: MenuBands = Object.freeze({ topEnd: SHOP.contentTop, bottomStart: Infinity, content: followHeader });

/** Layout bottom of the shop's / achievements' scrolling viewport on a screen with anchors `a`. */
export function bandedContentBottom(contentBottom: number, a: HudAnchors): number {
  return contentBottom + a.bottom - a.top;
}

export function shopPackRect(i: number): Rect {
  const p = SHOP.pack;
  const col = i % 2;
  const row = Math.floor(i / 2);
  return { x: p.x0 + col * (p.w + p.gapX), y: p.y0 + row * (p.h + p.gapY), w: p.w, h: p.h };
}

export function shopRowRect(i: number, h: number = SHOP.row.h): Rect {
  return { x: SHOP.row.x, y: SHOP.row.y0 + i * (h + SHOP.row.gap), w: SHOP.row.w, h };
}

/** Skin card `i` of a category whose header starts at content-space `top`. */
export function shopSkinRect(top: number, i: number): Rect {
  const s = SHOP.skin;
  const col = i % 3;
  const row = Math.floor(i / 3);
  return { x: s.x0 + col * (s.w + s.gapX), y: top + s.headerH + row * (s.h + s.gapY), w: s.w, h: s.h };
}

/** Buy / equip button docked bottom-centre inside a card. */
export function shopBuyRect(card: Rect, w: number = SHOP.buyW, h: number = SHOP.buyH): Rect {
  return { x: card.x + card.w / 2 - w / 2, y: card.y + card.h - h - 16, w, h };
}

/** Pack-size segmented control inside the crystals → gold convert card. */
export function shopConvertSegRect(card: Rect): Rect {
  // AUD-U1: three segments ≥ 88 wide (44 pt at 360 wide)
  return { x: card.x + 16, y: card.y + 96, w: card.w - 32, h: 52 };
}

/** Buy button docked at the right of a full-width row. */
export function shopRowBuyRect(row: Rect): Rect {
  return { x: row.x + row.w - SHOP.buyW - 18, y: row.y + row.h / 2 - SHOP.buyH / 2, w: SHOP.buyW, h: SHOP.buyH };
}
