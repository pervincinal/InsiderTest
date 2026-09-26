import type { Rect } from './widgets';

/** Fixed HUD hit regions in logical units (720×1280). Shared by hud.ts and the play screen. */
export const HUD = Object.freeze({
  topBar: { x: 0, y: 0, w: 720, h: 96 } as Rect,
  levelChip: { x: 18, y: 18, w: 250, h: 60 } as Rect,
  timer: { x: 290, y: 22, w: 140, h: 52 } as Rect,
  /** Speed tag (only when speed ≠ 1) sits between the timer and the mute button. */
  speedTag: { x: 444, y: 30, w: 82, h: 36 } as Rect,
  /** Mute toggle (M1-8b / ART-3), left of pause. */
  mute: { x: 560, y: 18, w: 62, h: 60 } as Rect,
  pause: { x: 636, y: 18, w: 66, h: 60 } as Rect,
  bottomBar: { x: 0, y: 1180, w: 720, h: 100 } as Rect,
  /** Active-streams pill (rules v2, replaces the SEND toggle): "STREAMS ⇢ n" for the player's links. */
  streams: { x: 18, y: 1196, w: 200, h: 64 } as Rect,
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
 * Each hit rect is the disc (top-aligned, `disc` px) plus the cost chip underneath it.
 */
export const BOOSTERS = Object.freeze({
  overdrive: { x: 232, y: 1186, w: 66, h: 88 } as Rect,
  freeze: { x: 314, y: 1186, w: 66, h: 88 } as Rect,
  airstrike: { x: 396, y: 1186, w: 66, h: 88 } as Rect,
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
  next: { x: 84, y: 780, w: 170, h: 72 } as Rect,
  retry: { x: 275, y: 780, w: 170, h: 72 } as Rect,
  menu: { x: 466, y: 780, w: 170, h: 72 } as Rect,
  continueCrystals: { x: 84, y: 700, w: 268, h: 62 } as Rect,
  continueAd: { x: 368, y: 700, w: 268, h: 62 } as Rect,
  /** Single centred continue button when only the crystal offer exists. */
  continueSolo: { x: 180, y: 700, w: 360, h: 62 } as Rect,
  /** ×2 gold (win) or skip level (defeat). */
  extra: { x: 150, y: 874, w: 420, h: 62 } as Rect,
  /**
   * Defeat tip (FE-4): lightbulb caption + the level's lesson (≤ 3 lines) under the time line, in
   * place of the hollow stars; ends above the Reinforcements label (continueSolo.y − 18 − 8 px).
   */
  tip: { x: 90, y: 540, w: 540, h: 132 } as Rect,
  /** "HOW TO PLAY" link-button at the foot of the tip (second consecutive defeat of the same level). */
  howto: { x: 250, y: 638, w: 220, h: 34 } as Rect,
});

/** Pause menu (M1-11 + M3-3 + FE-3): resume, speed toggle ×1/×2, sound + settings, retry, menu, how to play. */
export const PAUSE = Object.freeze({
  card: { x: 100, y: 376, w: 520, h: 690 } as Rect,
  resume: { x: 210, y: 566, w: 300, h: 76 } as Rect,
  speed: { x: 210, y: 662, w: 300, h: 64 } as Rect,
  sound: { x: 180, y: 746, w: 170, h: 64 } as Rect,
  settings: { x: 370, y: 746, w: 170, h: 64 } as Rect,
  retry: { x: 180, y: 872, w: 170, h: 72 } as Rect,
  menu: { x: 370, y: 872, w: 170, h: 72 } as Rect,
  /** "How to play" card (FE-3), under RETRY / MENU; the card returns here. */
  howto: { x: 180, y: 960, w: 360, h: 64 } as Rect,
});

/**
 * Title screen buttons: big PLAY, a settings (gear) · sound row, SHOP, the daily-reward chest
 * (bottom-right) and the wallet footer (stars · gold · crystals; tap → shop).
 */
export const TITLE = Object.freeze({
  play: { x: 180, y: 640, w: 360, h: 96 } as Rect,
  settings: { x: 180, y: 780, w: 172, h: 64 } as Rect,
  sound: { x: 368, y: 780, w: 172, h: 64 } as Rect,
  shop: { x: 180, y: 864, w: 360, h: 64 } as Rect,
  /** Daily chest sits bottom-right, clear of the demo towers' unit badges. */
  daily: { x: 574, y: 990, w: 128, h: 132 } as Rect,
  /** Trophy button (achievements) mirrors the chest, bottom-left. */
  achievements: { x: 18, y: 990, w: 128, h: 132 } as Rect,
  wallet: { x: 120, y: 1172, w: 480, h: 52 } as Rect,
  /** Language chip (top-right): shows the current code, tap → next language. */
  lang: { x: 630, y: 18, w: 72, h: 44 } as Rect,
});

export const TOWER_RADIUS = 34;
export const TOWER_HIT_RADIUS = 44;
export const UNIT_RADIUS = 6;
export const TANK_RADIUS = 11;
