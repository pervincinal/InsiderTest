import type { Rect } from './widgets';

/*
 * Geometry only the lazily loaded menu screens use (settings, level map, achievements, shop):
 * kept out of layout.ts so it stays off the eager chunk (scripts/checkBundle.mjs budget, PERF-6).
 */

/* ---------- settings ---------- */

/**
 * Settings screen (M3-3): glass header with BACK, a tall clay card with one row per setting
 * (label left, control right) and a RESET PROGRESS button that opens a confirm card.
 */
export const SETTINGS = Object.freeze({
  headerH: 100,
  back: { x: 18, y: 20, w: 140, h: 60 } as Rect,
  card: { x: 50, y: 150, w: 620, h: 750 } as Rect,
  rowH: 96,
  labelX: 86,
  /** Row controls, top to bottom. */
  sound: { x: 470, y: 216, w: 160, h: 56 } as Rect,
  colorBlind: { x: 470, y: 312, w: 160, h: 56 } as Rect,
  motion: { x: 372, y: 408, w: 258, h: 56 } as Rect,
  /**
   * "How to play" row (FE-3): the whole row is the tap target (label left, chevron disc right). It
   * takes the slot the rules-v2 removal of the send ratio freed (y ≈ 504), so the language picker /
   * reset rects (mirrored by the e2e specs) keep their positions.
   */
  howto: { x: 86, y: 500, w: 548, h: 64 } as Rect,
  /** Language row: label line at `languageLabelY`, then a full-width picker (one segment per language, I18N). */
  languageLabelY: 600,
  language: { x: 86, y: 664, w: 548, h: 56 } as Rect,
  reset: { x: 160, y: 800, w: 400, h: 72 } as Rect,
  confirm: {
    card: { x: 90, y: 470, w: 540, h: 320 } as Rect,
    yes: { x: 130, y: 676, w: 210, h: 72 } as Rect,
    no: { x: 380, y: 676, w: 210, h: 72 } as Rect,
  },
  /** About card under the settings card: version, support id (copy), privacy options (native). */
  about: { x: 50, y: 920, w: 620 },
  aboutRowH: 62,
});

/* ---------- level select: winding path map ---------- */

/** Level-select geometry (content space scrolls vertically under a fixed header). */
export const LEVEL_MAP = Object.freeze({
  headerH: 100,
  back: { x: 18, y: 20, w: 140, h: 60 } as Rect,
  /** Gold + crystal pills in the header (tap → shop). */
  wallet: { x: 402, y: 24, w: 300, h: 52 } as Rect,
  /** Commander summary chip at the bottom (tap → shop, upgrades tab). */
  commander: { x: 60, y: 1206, w: 600, h: 54 } as Rect,
  /** Daily Challenge card (GDD §7): sticky under the header, over the scrolling map (tap → start). */
  daily: { x: 30, y: 112, w: 660, h: 104 } as Rect,
  /** DAILY / WEEKLY tabs in the card's title row (GDD §8.2): 44 px tap targets over a 36 px segmented pill. */
  dailyTabDaily: { x: 126, y: 118, w: 118, h: 44 } as Rect,
  dailyTabWeekly: { x: 244, y: 118, w: 118, h: 44 } as Rect,
  /**
   * "Yesterday's map" row (DAILY-6, GDD §7.3): a slimmer secondary card docked under the daily card,
   * sticky like it, on the DAILY tab only while yesterday's challenge is unwon. ≥ 44 px tap target.
   */
  yesterday: { x: 54, y: 222, w: 612, h: 56 } as Rect,
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
  const y = LEVEL_MAP.yesterday;
  return yesterdayRow ? d.y + d.h - (y.y + y.h) : 0;
}

/* ---------- shop tabs ---------- */

export const SHOP_TABS = ['crystals', 'bundles', 'skins', 'upgrades'] as const;
export type ShopTab = (typeof SHOP_TABS)[number];

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
    privacy = { x: 160, y: y + 10, w: 400, h: 60 };
    y += 80;
  }
  return { card: { x: a.x, y: a.y, w: a.w, h: y + 22 - a.y }, versionY, supportY, copy, privacy };
}

/* ---------- "How to play" card (FE-3) ---------- */

/**
 * One card, no scrolling: glass header (BACK · title), five rule rows (icon box left, one wrapped
 * sentence right) and a CLOSE button. Everything fits 720×1280, so it fits 360×640 at DPR 1 too.
 */
export const HOWTO = Object.freeze({
  headerH: 100,
  back: { x: 18, y: 20, w: 140, h: 60 } as Rect,
  card: { x: 40, y: 124, w: 640, h: 1032 } as Rect,
  rows: 5,
  row: { x: 60, y0: 150, w: 600, h: 176 },
  /** Icon box inside a row (left) and the text column (right). */
  icon: { x: 68, w: 120, h: 120 },
  text: { x: 204, w: 448 },
  textPx: 22,
  lineH: 30,
  maxLines: 3,
  close: { x: 180, y: 1054, w: 360, h: 72 } as Rect,
});

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

/** Content-space rect of achievement row `i`. */
export function achievementRowRect(i: number): Rect {
  const r = ACHIEVEMENTS_LAYOUT.row;
  return { x: r.x, y: r.y0 + i * (r.h + r.gap), w: r.w, h: r.h };
}

/** Largest scroll for `count` rows (0 when everything fits). */
export function achievementsMaxScroll(count: number): number {
  const bottom = ACHIEVEMENTS_LAYOUT.row.y0 + count * (ACHIEVEMENTS_LAYOUT.row.h + ACHIEVEMENTS_LAYOUT.row.gap) + 10;
  return Math.max(0, bottom - ACHIEVEMENTS_LAYOUT.contentBottom);
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
  /** Crystals → gold confirm card (screen space, over the crystals tab). */
  convertConfirm: {
    card: { x: 90, y: 470, w: 540, h: 320 } as Rect,
    yes: { x: 130, y: 676, w: 210, h: 72 } as Rect,
    no: { x: 380, y: 676, w: 210, h: 72 } as Rect,
  },
});

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
  return { x: card.x + 24, y: card.y + 96, w: card.w - 48, h: 52 };
}

/** Buy button docked at the right of a full-width row. */
export function shopRowBuyRect(row: Rect): Rect {
  return { x: row.x + row.w - SHOP.buyW - 18, y: row.y + row.h / 2 - SHOP.buyH / 2, w: SHOP.buyW, h: SHOP.buyH };
}
