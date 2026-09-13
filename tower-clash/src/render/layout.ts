import type { Rect } from './widgets';

/** Fixed HUD hit regions in logical units (720×1280). Shared by draw.ts and the play screen. */
export const HUD = Object.freeze({
  topBar: { x: 0, y: 0, w: 720, h: 96 } as Rect,
  pause: { x: 636, y: 18, w: 66, h: 60 } as Rect,
  ratio: { x: 18, y: 1196, w: 184, h: 64 } as Rect,
  menu: { x: 552, y: 1196, w: 150, h: 64 } as Rect,
  /** Vertical band reserved for play; input outside is treated as HUD. */
  mapTop: 96,
  mapBottom: 1180,
});

export const RESULT = Object.freeze({
  next: { x: 84, y: 780, w: 170, h: 72 } as Rect,
  retry: { x: 275, y: 780, w: 170, h: 72 } as Rect,
  menu: { x: 466, y: 780, w: 170, h: 72 } as Rect,
});

/** Pause menu (M1-11): resume, speed toggle ×1/×2, retry, menu. */
export const PAUSE = Object.freeze({
  resume: { x: 210, y: 620, w: 300, h: 76 } as Rect,
  speed: { x: 210, y: 716, w: 300, h: 64 } as Rect,
  retry: { x: 180, y: 820, w: 170, h: 72 } as Rect,
  menu: { x: 370, y: 820, w: 170, h: 72 } as Rect,
});

export const TOWER_RADIUS = 34;
export const TOWER_HIT_RADIUS = 44;
export const ROAD_HIT_RADIUS = 30;
export const UNIT_RADIUS = 6;
export const TANK_RADIUS = 11;
