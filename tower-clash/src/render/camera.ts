import { HUD } from './layout';

/*
 * ART-21 play camera ("Oyun helikopter view kimidir": the field read as a flat map seen straight
 * from above). v2: a real perspective view of the ground plane — the camera looks across the island
 * toward a horizon, so the far side is narrower and smaller (a trapezoid), standing things shrink with
 * distance, and straight lanes stay straight.
 *
 * The map → screen map is a plane homography (lines stay lines, so a stream ribbon, a guide line or
 * the drag band is straight between its projected end points, and a unit walking the lane stays on
 * its ribbon). With the depth scale
 *
 *   s(y) = 1 / (1 + g · (nearY − y))          (1 at the near edge, `k` at the far edge HUD.mapTop)
 *
 * a map point (x, y) is drawn at
 *
 *   X = cx + (x − cx) · s(y)                  (narrows toward the far edge, about the centre column)
 *   Y = horizon + span · s(y)                 (the vanishing line `horizon` is far above the screen)
 *
 * and the inverse is exact: s = (Y − horizon) / span, y = nearY − (1/s − 1) / g, x = cx + (X − cx)/s.
 * `horizon` is chosen so the island's far shore lands at FAR_SHORE_Y (a horizon band of sea with the
 * distant islets above it, not a void) and the near edge stays where the flat map had it. Things
 * standing on the ground (buildings, units, badges, props, mine lamps) are drawn upright at the
 * projected anchor, scaled by s; the ground image is warped once per level (terrain.ts "mode 7").
 *
 * The sim, the level files and every map coordinate are unchanged; only the play screen's world uses
 * it (HUD bands, overlays and menus are not tilted). ART-24: the default is the flat top-down map
 * (`TILT_DEFAULT` = 1, the identity); `?tilt=0.72` (`TILT_PERSPECTIVE`) or any k in TILT_MIN..1 in the
 * page URL turns the perspective camera on for on-device A/B screenshots, like `?dprcap=`; `?tilt=0`
 * is the flat map; `setTilt` does the same from code (tests / debug console).
 */

export interface Camera {
  /** Far-edge depth scale (s at HUD.mapTop): 1 = the flat top-down map. Identifies the camera in cache keys. */
  readonly k: number;
  readonly flat: boolean;
  /** Centre column the far side narrows toward. */
  readonly cx: number;
  /** Map y with s = 1, drawn at the same screen y (the bottom of the play band). */
  readonly nearY: number;
  /** Depth gradient: s(y) = 1 / (1 + g (nearY − y)). */
  readonly g: number;
  /** Screen y of the vanishing line (s = 0), far above the screen. */
  readonly horizon: number;
  /** nearY − horizon. */
  readonly span: number;
}

/** A projected point and its depth scale. */
export interface Projected {
  x: number;
  y: number;
  s: number;
}

/**
 * The perspective camera's far-edge scale (`?tilt=0.72`): the far edge of the play band drawn at 72 %
 * of its width (ART-21 v2, default in builds 13–14).
 */
export const TILT_PERSPECTIVE = 0.72;
/**
 * The default camera: 1 = the flat top-down map. ART-24 (stakeholder on build 14: "helikopter view et,
 * amma yaxınlaşdır") brought the flat view back with bigger standing things (layout.ts `WORLD_ZOOM`);
 * the perspective camera stays behind `?tilt=` / `setTilt` for A/B screenshots.
 */
export const TILT_DEFAULT = 1;
/** Strongest perspective an override may ask for. */
export const TILT_MIN = 0.6;
/** The island's far shore in map coordinates (terrain.ts plateau top: `HUD.mapTop + 12`). */
export const ISLAND_FAR_Y = HUD.mapTop + 12;
/**
 * Where the far shore is drawn (screen logical y): ≈ 70 CSS px of horizon sea under the lesson card
 * on a 430 × 932 phone (was ≈ 160 with the v1 squash), under the card on 9:16.
 */
export const FAR_SHORE_Y = 190;
/** The horizon haze over the sea clears this far (screen logical px) below the projected far shore. */
const HORIZON_PAST_SHORE = 30;
/**
 * Badges keep their numerals ≥ 24 px (ART-17; the badge font is 26 px): a far badge shrinks with
 * depth no further than this.
 */
export const BADGE_MIN_SCALE = 24 / 26;

/** The flat map (menus, the title island, `?tilt=0`): identity. */
export const FLAT: Camera = Object.freeze({ k: 1, flat: true, cx: 360, nearY: HUD.mapBottom, g: 0, horizon: 0, span: 0 });

let override: number | undefined;
let urlSearch: string | null = null;
let urlValue: number | undefined;

/** Normalise a requested tilt: 0 (or ≥ 1) = off, otherwise clamped to TILT_MIN..1; NaN = no request. */
export function normaliseTilt(v: number): number | undefined {
  if (!Number.isFinite(v)) return undefined;
  if (v <= 0 || v >= 1) return 1;
  return Math.max(TILT_MIN, v);
}

/** Force a camera (0 = flat, undefined = back to the URL / default). */
export function setTilt(v: number | undefined): void {
  override = v === undefined ? undefined : normaliseTilt(v);
}

/** `?tilt=N` from the page URL (parsed once per distinct search string). */
function urlTilt(): number | undefined {
  if (typeof location === 'undefined') return undefined;
  const search = location.search ?? '';
  if (search !== urlSearch) {
    urlSearch = search;
    const raw = search ? new URLSearchParams(search).get('tilt') : null;
    urlValue = raw === null || raw === '' ? undefined : normaliseTilt(parseFloat(raw));
  }
  return urlValue;
}

/** The camera with far-edge scale `k` (0 < k < 1). */
export function makeCamera(k: number): Camera {
  const nearY = HUD.mapBottom;
  const g = (1 / k - 1) / (nearY - HUD.mapTop);
  const sShore = 1 / (1 + g * (nearY - ISLAND_FAR_Y));
  const horizon = (FAR_SHORE_Y - nearY * sShore) / (1 - sShore);
  return Object.freeze({ k, flat: false, cx: 360, nearY, g, horizon, span: nearY - horizon });
}

const cams = new Map<number, Camera>();

/** The play world's camera right now (stable object per value, cheap to call every frame). */
export function playCamera(): Camera {
  const k = override ?? urlTilt() ?? TILT_DEFAULT;
  if (k === 1) return FLAT;
  let cam = cams.get(k);
  if (!cam) {
    cam = makeCamera(k);
    cams.set(k, cam);
  }
  return cam;
}

/** Depth scale at map y (1 on the flat map). */
export function depth(cam: Camera, y: number): number {
  return cam.flat ? 1 : 1 / (1 + cam.g * (cam.nearY - y));
}

/** Map y → screen logical y. */
export function projY(cam: Camera, y: number): number {
  return cam.flat ? y : cam.horizon + cam.span * depth(cam, y);
}

/** Map point → where it is drawn, with its depth scale. */
export function proj(cam: Camera, x: number, y: number): Projected {
  if (cam.flat) return { x, y, s: 1 };
  const s = depth(cam, y);
  return { x: cam.cx + (x - cam.cx) * s, y: cam.horizon + cam.span * s, s };
}

/** Screen logical y → map y (inverse of `projY`). */
export function unprojY(cam: Camera, y: number): number {
  if (cam.flat) return y;
  const s = (y - cam.horizon) / cam.span;
  return cam.nearY - (1 / s - 1) / cam.g;
}

/** Screen logical point → map point (exact inverse of `proj`). */
export function unproj(cam: Camera, x: number, y: number): { x: number; y: number } {
  if (cam.flat) return { x, y };
  const s = (y - cam.horizon) / cam.span;
  return { x: cam.cx + (x - cam.cx) / s, y: cam.nearY - (1 / s - 1) / cam.g };
}

/** dY/dy at map y: screen px per map px down the ground (1 on the flat map). */
export function jacY(cam: Camera, y: number): number {
  if (cam.flat) return 1;
  const s = depth(cam, y);
  return cam.span * cam.g * s * s;
}

/** Unit screen direction of the map direction (dx, dy) at map point (x, y). */
export function projDir(cam: Camera, x: number, y: number, dx: number, dy: number): { dx: number; dy: number } {
  if (cam.flat) return { dx, dy };
  const a = proj(cam, x, y);
  const b = proj(cam, x + dx, y + dy);
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const len = Math.hypot(ex, ey) || 1;
  return { dx: ex / len, dy: ey / len };
}

/** A map-space direction angle at (x, y) as it appears on the screen (e.g. an artillery barrel's aim). */
export function projAngle(cam: Camera, x: number, y: number, a: number): number {
  if (cam.flat) return a;
  const d = projDir(cam, x, y, Math.cos(a), Math.sin(a));
  return Math.atan2(d.dy, d.dx);
}

/** Screen logical y where the far-sea haze clears (sea.ts `paintHaze`), or undefined for the flat map. */
export function horizonY(cam: Camera): number | undefined {
  return cam.flat ? undefined : projY(cam, ISLAND_FAR_Y) + HORIZON_PAST_SHORE;
}

/**
 * Run `draw` (which draws something standing at map point (x, y) in map units around it) upright at
 * the projected anchor, scaled by the depth there times `zoom` (ART-24 `WORLD_ZOOM`). Call in the
 * logical frame. On the flat map at zoom 1 it just runs `draw`.
 */
export function standingAt(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number, draw: () => void, zoom = 1, minScale = 0): void {
  if (cam.flat && zoom === 1) {
    draw();
    return;
  }
  const p = proj(cam, x, y);
  const s = Math.max(minScale, p.s) * zoom;
  ctx.save();
  ctx.translate(p.x - x * s, p.y - y * s);
  ctx.scale(s, s);
  draw();
  ctx.restore();
}
