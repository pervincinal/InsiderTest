import type { Rect } from './widgets';

/** Fixed HUD hit regions in logical units (720×1280). Shared by hud.ts and the play screen. */
export const HUD = Object.freeze({
  topBar: { x: 0, y: 0, w: 720, h: 96 } as Rect,
  levelChip: { x: 18, y: 18, w: 250, h: 60 } as Rect,
  timer: { x: 290, y: 22, w: 140, h: 52 } as Rect,
  /** Speed tag (only when speed ≠ 1) sits between the timer and the mute button. */
  speedTag: { x: 444, y: 30, w: 82, h: 36 } as Rect,
  /**
   * Mute toggle (M1-8b / ART-3), left of pause. AUD-U1: every button's tap area is padded to 88 × 88
   * (`hitRect`, 44 pt at 360 wide), so the two sit 88 px apart centre to centre (579 / 669).
   */
  mute: { x: 548, y: 18, w: 62, h: 60 } as Rect,
  pause: { x: 636, y: 18, w: 66, h: 60 } as Rect,
  bottomBar: { x: 0, y: 1180, w: 720, h: 100 } as Rect,
  /** Active-streams pill (rules v2, replaces the SEND toggle): "STREAMS ⇢ n" for the player's links. A label: no tap area. */
  streams: { x: 18, y: 1196, w: 180, h: 64 } as Rect,
  /** Coin balance pill, right of the booster bar. */
  coins: { x: 474, y: 1204, w: 98, h: 46 } as Rect,
  /** Gold + crystal wallet drawn over the booster bar once the level is over (tap → shop). */
  wallet: { x: 232, y: 1200, w: 340, h: 54 } as Rect,
  menu: { x: 586, y: 1196, w: 116, h: 64 } as Rect,
  /** Vertical band reserved for play; input outside is treated as HUD. */
  mapTop: 96,
  mapBottom: 1180,
});

/**
 * Booster bar (M3-1): three round clay buttons in the bottom band between the streams pill and the coin pill.
 * Each rect is the disc (top-aligned, `disc` px) plus the cost chip underneath it; the tap areas are
 * 88 wide (AUD-U1), so the discs sit 88 px apart (centres 250 / 338 / 426: tap areas 206 … 470).
 */
export const BOOSTERS = Object.freeze({
  overdrive: { x: 217, y: 1186, w: 66, h: 88 } as Rect,
  freeze: { x: 305, y: 1186, w: 66, h: 88 } as Rect,
  airstrike: { x: 393, y: 1186, w: 66, h: 88 } as Rect,
  disc: 64,
  chipH: 22,
});

/**
 * Result card (slides up to rest at `card`); the buttons row sits inside it. Economy rows
 * (ECONOMY.md §3.4, §3.5, §5.2): defeat → CONTINUE (crystals) · WATCH → CONTINUE (rewarded) above
 * the buttons; win → WATCH → ×2 GOLD below them; SKIP LEVEL (crystals) in the same slot on defeat.
 */
export const RESULT = Object.freeze({
  card: { x: 60, y: 330, w: 600, h: 640 } as Rect,
  /**
   * SHARE (SHARE-1, every result but a Yesterday's-map practice run): in the ×2 gold / skip slot
   * when that slot is free (`shareInline`, the card keeps its height), else on a row of its own under
   * it (`share`) inside the 80 px taller `cardShare` — `resultShareLayout` in hud.ts picks.
   */
  shareInline: { x: 230, y: 874, w: 260, h: 62 } as Rect,
  share: { x: 230, y: 962, w: 260, h: 62 } as Rect,
  cardShare: { x: 60, y: 330, w: 600, h: 720 } as Rect,
  /** AUD-U1: the rows' 88-tall tap areas stack without overlap (continue 683–771, buttons 772–860, extra 861–949, share 949–1037). */
  next: { x: 84, y: 780, w: 170, h: 72 } as Rect,
  retry: { x: 275, y: 780, w: 170, h: 72 } as Rect,
  menu: { x: 466, y: 780, w: 170, h: 72 } as Rect,
  continueCrystals: { x: 84, y: 696, w: 268, h: 62 } as Rect,
  continueAd: { x: 368, y: 696, w: 268, h: 62 } as Rect,
  /** Single centred continue button when only the crystal offer exists. */
  continueSolo: { x: 180, y: 696, w: 360, h: 62 } as Rect,
  /** ×2 gold (win) or skip level (defeat). */
  extra: { x: 150, y: 874, w: 420, h: 62 } as Rect,
  /**
   * Defeat tip (FE-4): lightbulb caption + the level's lesson (≤ 3 lines) under the time line, in
   * place of the hollow stars; ends above the Reinforcements label (continueSolo.y − 18 − 8 px).
   */
  tip: { x: 90, y: 540, w: 540, h: 130 } as Rect,
  /**
   * "HOW TO PLAY" link-button (second consecutive defeat of the same level): right of the time line,
   * under the banner — at the tip's foot its 88-tall tap area ran into CONTINUE's (AUD-U1).
   */
  howto: { x: 466, y: 494, w: 170, h: 44 } as Rect,
});

/**
 * Crystal-spend confirm card (AUD-U5), the Convert card's geometry (SHOP.convertConfirm): skins,
 * booster crate, Continue and level skip ask "Spend N crystals?" here before anything is paid.
 */
export const CONFIRM = Object.freeze({
  card: { x: 90, y: 470, w: 540, h: 320 } as Rect,
  yes: { x: 130, y: 676, w: 210, h: 72 } as Rect,
  no: { x: 380, y: 676, w: 210, h: 72 } as Rect,
});

/**
 * Pause menu (M1-11 + M3-3 + FE-3): resume, speed toggle ×1/×2, sound + settings, retry, menu, how to play.
 * AUD-U1: row centres ≥ 88 apart (600 / 692 / 780 / 896 / 992), so the 88-tall tap areas never overlap;
 * RETRY / MENU, the two that end the match, keep a wider gap from the rows above.
 */
export const PAUSE = Object.freeze({
  card: { x: 100, y: 376, w: 520, h: 690 } as Rect,
  resume: { x: 210, y: 560, w: 300, h: 80 } as Rect,
  speed: { x: 210, y: 660, w: 300, h: 64 } as Rect,
  /** AUD-U2: 200 wide (were 170), so a 22 px label beside the glyph fits ("НАСТРОЙКИ", "БЕЗ ЗВУКА"). */
  sound: { x: 150, y: 748, w: 200, h: 64 } as Rect,
  settings: { x: 370, y: 748, w: 200, h: 64 } as Rect,
  retry: { x: 180, y: 860, w: 170, h: 72 } as Rect,
  menu: { x: 370, y: 860, w: 170, h: 72 } as Rect,
  /** "How to play" card (FE-3), under RETRY / MENU; the card returns here. */
  howto: { x: 180, y: 960, w: 360, h: 64 } as Rect,
});

/**
 * Title screen buttons: big PLAY, a settings (gear) · sound row, SHOP, the daily-reward chest
 * (bottom-right) and the wallet footer (stars · gold · crystals; tap → shop).
 */
export const TITLE = Object.freeze({
  play: { x: 180, y: 640, w: 360, h: 96 } as Rect,
  /** AUD-U1: settings · sound and SHOP 88 apart (tap areas 764–852 / 852–940). */
  settings: { x: 180, y: 776, w: 172, h: 64 } as Rect,
  sound: { x: 368, y: 776, w: 172, h: 64 } as Rect,
  shop: { x: 180, y: 864, w: 360, h: 64 } as Rect,
  /** Daily chest sits bottom-right, clear of the demo towers' unit badges. */
  daily: { x: 574, y: 990, w: 128, h: 132 } as Rect,
  /** Trophy button (achievements) mirrors the chest, bottom-left. */
  achievements: { x: 18, y: 990, w: 128, h: 132 } as Rect,
  wallet: { x: 120, y: 1172, w: 480, h: 52 } as Rect,
  /** Language chip (top-right): shows the current code, tap → next language. AUD-U1: 88 × 56, tap area 0–88 under the safe edge. */
  lang: { x: 614, y: 16, w: 88, h: 56 } as Rect,
});

/**
 * ART-24 (2026-10-13, stakeholder on build 14: "Görünüşü helikopter view et, amma yaxınlaşdır və
 * qalalar, oyunçular daha böyük olsun" — top-down again, but zoomed in, towers and soldiers bigger;
 * towers looking closer together is fine). The map, the levels and the sim are untouched: the play
 * renderer draws everything standing on the 720 × 1280 map larger than its design size, about its own
 * ground anchor. Title island demo towers and shop previews keep their own scales.
 *   tower  buildings with their shadows, plinth / selection / streaming rings, badge offsets, airstrike rings
 *   prop   bushes, pines, cacti, decor rocks, flower dots, mine bodies and lamps
 *   wall   the drawn thickness of walls and the size of boulder obstacles (not their collision)
 *   badge  unit-count badges and their stream / mine chips (numerals stay ≥ 24 px)
 *   link   stream ribbon width (10 → 13) with its chevrons and arrowhead
 *   guide  the selected tower's dashed guide lines (2 → 2.5 px)
 */
export const WORLD_ZOOM = Object.freeze({ tower: 1.3, prop: 1.25, wall: 1.2, badge: 1.15, link: 1.3, guide: 1.25 });

export const TOWER_RADIUS = 34;
/** Tap target around a tower's base: 44 pt at design size, × the tower zoom (ART-24: 57). Extends up to the roof (pointer.ts `hitTower`). */
export const TOWER_HIT_RADIUS = Math.round(44 * WORLD_ZOOM.tower);
/** Lifetime of one point of the swipe-to-cut slash trail (BUG-33): the input layer drops it then, the renderer fades it over it. */
export const SWIPE_TRAIL_MS = 220;
export const UNIT_RADIUS = 6;
export const TANK_RADIUS = 11;
/**
 * BUG-39 (2026-10-12, iPhone 17 Pro Max): at 430 px the 9 × 21 unit soldier was ≈ 5 × 12 CSS px and its
 * owner mid tone sat on the owner-coloured stream ribbon, so columns vanished into the line. The play
 * renderer draws soldiers / tanks this much larger than the sprite's design size (shop previews and the
 * title keep their own scales) and every soldier gets an ink sticker outline (`UNIT_OUTLINE_PX`).
 * ART-24 zoom: 1.45 → 1.75 and 1.2 → 1.5.
 */
export const SOLDIER_DRAW_SCALE = 1.75;
export const TANK_DRAW_SCALE = 1.5;
/** Width of the ink outline around a soldier's head + body silhouette, in design px (scaled with the unit). */
export const UNIT_OUTLINE_PX = 1.4;
