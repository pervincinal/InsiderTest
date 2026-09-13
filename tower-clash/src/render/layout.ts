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
  /** Segmented SEND toggle: left half = 100 %, right half = 50 %. */
  ratio: { x: 18, y: 1196, w: 200, h: 64 } as Rect,
  /** Coin balance pill, right of the booster bar. */
  coins: { x: 474, y: 1204, w: 98, h: 46 } as Rect,
  menu: { x: 586, y: 1196, w: 116, h: 64 } as Rect,
  /** Vertical band reserved for play; input outside is treated as HUD. */
  mapTop: 96,
  mapBottom: 1180,
});

/**
 * Booster bar (M3-1): three round clay buttons in the bottom band between SEND and the coin pill.
 * Each hit rect is the disc (top-aligned, `disc` px) plus the cost chip underneath it.
 */
export const BOOSTERS = Object.freeze({
  overdrive: { x: 232, y: 1186, w: 66, h: 88 } as Rect,
  freeze: { x: 314, y: 1186, w: 66, h: 88 } as Rect,
  airstrike: { x: 396, y: 1186, w: 66, h: 88 } as Rect,
  disc: 64,
  chipH: 22,
});

/** Result card (slides up to rest at `card`); the buttons row sits inside it. */
export const RESULT = Object.freeze({
  card: { x: 60, y: 330, w: 600, h: 560 } as Rect,
  next: { x: 84, y: 780, w: 170, h: 72 } as Rect,
  retry: { x: 275, y: 780, w: 170, h: 72 } as Rect,
  menu: { x: 466, y: 780, w: 170, h: 72 } as Rect,
});

/** Pause menu (M1-11 + M3-3): resume, speed toggle ×1/×2, sound + settings, retry, menu. */
export const PAUSE = Object.freeze({
  card: { x: 100, y: 376, w: 520, h: 610 } as Rect,
  resume: { x: 210, y: 566, w: 300, h: 76 } as Rect,
  speed: { x: 210, y: 662, w: 300, h: 64 } as Rect,
  sound: { x: 180, y: 746, w: 170, h: 64 } as Rect,
  settings: { x: 370, y: 746, w: 170, h: 64 } as Rect,
  retry: { x: 180, y: 872, w: 170, h: 72 } as Rect,
  menu: { x: 370, y: 872, w: 170, h: 72 } as Rect,
});

/** Title screen buttons: big PLAY, then a settings (gear) · sound row. */
export const TITLE = Object.freeze({
  play: { x: 180, y: 640, w: 360, h: 96 } as Rect,
  settings: { x: 180, y: 780, w: 172, h: 64 } as Rect,
  sound: { x: 368, y: 780, w: 172, h: 64 } as Rect,
});

/**
 * Settings screen (M3-3): glass header with BACK, a tall clay card with one row per setting
 * (label left, control right) and a RESET PROGRESS button that opens a confirm card.
 */
export const SETTINGS = Object.freeze({
  headerH: 100,
  back: { x: 18, y: 20, w: 140, h: 60 } as Rect,
  card: { x: 50, y: 150, w: 620, h: 650 } as Rect,
  rowH: 96,
  labelX: 86,
  /** Row controls, top to bottom. */
  sound: { x: 470, y: 216, w: 160, h: 56 } as Rect,
  colorBlind: { x: 470, y: 312, w: 160, h: 56 } as Rect,
  motion: { x: 372, y: 408, w: 258, h: 56 } as Rect,
  sendRatio: { x: 420, y: 504, w: 210, h: 56 } as Rect,
  reset: { x: 160, y: 676, w: 400, h: 72 } as Rect,
  confirm: {
    card: { x: 90, y: 470, w: 540, h: 320 } as Rect,
    yes: { x: 130, y: 676, w: 210, h: 72 } as Rect,
    no: { x: 380, y: 676, w: 210, h: 72 } as Rect,
  },
});

/* ---------- level select: winding path map ---------- */

/** Level-select geometry (content space scrolls vertically under a fixed header). */
export const LEVEL_MAP = Object.freeze({
  headerH: 100,
  back: { x: 18, y: 20, w: 140, h: 60 } as Rect,
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

export const TOWER_RADIUS = 34;
export const TOWER_HIT_RADIUS = 44;
export const ROAD_HIT_RADIUS = 30;
export const UNIT_RADIUS = 6;
export const TANK_RADIUS = 11;
