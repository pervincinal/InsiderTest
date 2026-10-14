import { chunkBackoff, loadChunk } from '../lazyChunk';
import { HUD } from './layout';
import type { TiltPainters } from './perspective';

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
 *
 * PERF-9: the perspective camera itself — the homography, the tilted ground warp, the horizon haze and
 * islets, the tutorial's side bubble — is the lazy chunk `perspective.ts`. This module keeps the
 * `Camera` interface, its flat implementation (the identity) and the override plumbing: while a
 * requested tilt's chunk is still on its way `playCamera()` answers the flat map (and starts the load),
 * so the first tilted frame may draw flat; `main.ts` preloads it before a level starts (`preloadCamera`).
 */

export interface Camera {
  /** Far-edge depth scale (s at HUD.mapTop): 1 = the flat top-down map. Identifies the camera in cache keys. */
  readonly k: number;
  readonly flat: boolean;
  /** Depth scale at map y (1 on the flat map). */
  depth(y: number): number;
  /** Map y → screen logical y. */
  projY(y: number): number;
  /** Map point → where it is drawn, with its depth scale. */
  proj(x: number, y: number): Projected;
  /** Screen logical y → map y (inverse of `projY`). */
  unprojY(y: number): number;
  /** Screen logical point → map point (exact inverse of `proj`). */
  unproj(x: number, y: number): { x: number; y: number };
  /** dY/dy at map y: screen px per map px down the ground (1 on the flat map). */
  jacY(y: number): number;
  /** Unit screen direction of the map direction (dx, dy) at map point (x, y). */
  projDir(x: number, y: number, dx: number, dy: number): { dx: number; dy: number };
  /** Screen logical y where the far-sea haze clears, or undefined for the flat map. */
  horizonY(): number | undefined;
  /** The perspective painters (lazy chunk `perspective.ts`); undefined on the flat map. */
  readonly tilt?: TiltPainters;
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
 * Badges keep their numerals ≥ 24 px (ART-17; the badge font is 26 px): a far badge shrinks with
 * depth no further than this.
 */
export const BADGE_MIN_SCALE = 24 / 26;

/** The flat map (menus, the title island, `?tilt=0`): identity. */
export const FLAT: Camera = Object.freeze({
  k: 1,
  flat: true,
  depth: () => 1,
  projY: (y: number) => y,
  proj: (x: number, y: number) => ({ x, y, s: 1 }),
  unprojY: (y: number) => y,
  unproj: (x: number, y: number) => ({ x, y }),
  jacY: () => 1,
  projDir: (_x: number, _y: number, dx: number, dy: number) => ({ dx, dy }),
  horizonY: () => undefined,
});

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

/** The requested far-edge scale: 1 = the flat map. */
function requestedTilt(): number {
  return override ?? urlTilt() ?? TILT_DEFAULT;
}

const CAMERA_CHUNK = 'perspective';
let makeTilted: ((k: number) => Camera) | null = null;
let cameraPromise: Promise<void> | null = null;

/** Load the perspective camera chunk (idempotent; a failed fetch is forgotten so the next call retries). */
export function loadCamera(): Promise<void> {
  cameraPromise ??= loadChunk(CAMERA_CHUNK, () => import('./perspective'))
    .then((m) => {
      makeTilted = m.makeCamera;
    })
    .catch((err: unknown) => {
      cameraPromise = null;
      throw err;
    });
  return cameraPromise;
}

/** The chunk load a requested tilt still waits for, or null (flat map, or already in). Never rejects. */
export function preloadCamera(): Promise<void> | null {
  if (makeTilted || requestedTilt() === 1) return null;
  return loadCamera().catch(() => undefined);
}

const cams = new Map<number, Camera>();

/**
 * The play world's camera right now (stable object per value, cheap to call every frame). A tilt whose
 * chunk is not in yet answers the flat map and starts the load (backing off after a failure).
 */
export function playCamera(): Camera {
  const k = requestedTilt();
  if (k === 1) return FLAT;
  if (!makeTilted) {
    if (!chunkBackoff(CAMERA_CHUNK)) void loadCamera().catch(() => undefined);
    return FLAT;
  }
  let cam = cams.get(k);
  if (!cam) {
    cam = makeTilted(k);
    cams.set(k, cam);
  }
  return cam;
}

/** Depth scale at map y (1 on the flat map). */
export const depth = (cam: Camera, y: number): number => cam.depth(y);
/** Map y → screen logical y. */
export const projY = (cam: Camera, y: number): number => cam.projY(y);
/** Map point → where it is drawn, with its depth scale. */
export const proj = (cam: Camera, x: number, y: number): Projected => cam.proj(x, y);
/** Screen logical y → map y (inverse of `projY`). */
export const unprojY = (cam: Camera, y: number): number => cam.unprojY(y);
/** Screen logical point → map point (exact inverse of `proj`). */
export const unproj = (cam: Camera, x: number, y: number): { x: number; y: number } => cam.unproj(x, y);
/** dY/dy at map y: screen px per map px down the ground (1 on the flat map). */
export const jacY = (cam: Camera, y: number): number => cam.jacY(y);
/** Unit screen direction of the map direction (dx, dy) at map point (x, y). */
export const projDir = (cam: Camera, x: number, y: number, dx: number, dy: number): { dx: number; dy: number } => cam.projDir(x, y, dx, dy);

/** A map-space direction angle at (x, y) as it appears on the screen (e.g. an artillery barrel's aim). */
export function projAngle(cam: Camera, x: number, y: number, a: number): number {
  if (cam.flat) return a;
  const d = cam.projDir(x, y, Math.cos(a), Math.sin(a));
  return Math.atan2(d.dy, d.dx);
}

/** Screen logical y where the far-sea haze clears (perspective.ts `paintHaze`), or undefined for the flat map. */
export const horizonY = (cam: Camera): number | undefined => cam.horizonY();

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
  const p = cam.proj(x, y);
  const s = Math.max(minScale, p.s) * zoom;
  ctx.save();
  ctx.translate(p.x - x * s, p.y - y * s);
  ctx.scale(s, s);
  draw();
  ctx.restore();
}
