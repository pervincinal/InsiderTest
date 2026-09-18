import type { Rect } from './widgets';
import { SETTINGS } from './layout';

/*
 * Geometry only the lazily loaded menu screens use (settings About card, achievements, shop):
 * kept out of layout.ts so it stays off the eager chunk (scripts/checkBundle.mjs budget).
 */

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
