import { C } from '../sim/constants';
import type { Camera, CameraFit, Fit, FitContent } from './camera';
import { FLAT } from './camera';
import { WORLD_ZOOM } from './layout';
import { themeFor } from './palette';
import { towerTop } from './sprites';
import { render } from './terrain';
import type { HudAnchors, View } from './view';

/*
 * AUD-U21 (GDD §4 "AUD-U21 2026-11-05"): the play camera frames the level's content, not the whole
 * 720 × 1280 map (camera-systems "group framing"). A lazy chunk (loaded with camera.ts `preloadCamera`
 * before a level starts, like the perspective camera); camera.ts keeps the hook (`setPlayFit`,
 * `playCamera`) and the eager renderer only reads `Camera.fit`.
 *
 * The rule, in the logical frame (720 wide on every portrait phone, so one fit per level whatever the
 * phone; the CSS scale is the letterbox scale × z):
 *   1. the content box (`fitBox`, map px): every tower with its tier-3 roof (× WORLD_ZOOM.tower) plus
 *      `head` above it (the badge's lift and height, the AUD-A10 intent glyph over it), `half` beside
 *      it (the badge with its fire pip and a stream chip, the 57 px hit disc), `foot` under it (the
 *      selection ring, the disc); every mine ± `mine`. Tier 3 whatever the tower starts at: the framing
 *      is fixed for the level and an upgraded roof must not push its badge under the top band;
 *   2. zoom z = min(`cap`, band width / box width, band height / box height); under `min` (a dense
 *      level, the box already fills the band) the whole map stays — the very same FLAT camera;
 *   3. the box, zoomed, is centred in the band x `side`..720 − `side`, y `top`..`bottom`: `top` keeps
 *      the first-tap lesson card (y 108, caption + three lines at 100 %, its clay edge) and the tutorial
 *      bubble's room clear, `bottom` is HUD.mapBottom − 16 (the select hint's low spot sits over it);
 *   4. so nothing drawn leaves the band and the AUD-U19 band reach never meets a fitted tower.
 * Today (2026-11-05) only level 1 is sparse enough (z = 1.35); every other level spans the band.
 *
 * AUD-U21b (GDD §4 "AUD-U21b 2026-11-06"): the band is the real play band between the HUD bands as
 * they sit on this screen (view.ts `hudAnchors`: the top band's bottom edge HUD.mapTop + a.top, the
 * bottom band's top edge HUD.mapBottom + a.bottom), with the same margins: y FIT.top + a.top ..
 * FIT.bottom + a.bottom (`fitBand`). On 9:16 (a = 0) nothing changes; on a tall phone (430 × 932,
 * insets 59 / 34: a = ∓62.4) a height-limited sparse level zooms further, up to the same cap, centred
 * in that band (the letterbox centres the map in the safe area, so the bands move out evenly and the
 * centre stays). Whether a level is fitted at all is decided on the 9:16 band: a dense level keeps the
 * whole map (FLAT) on every phone. Across, the band stays 720 wide (the letterbox is width-limited on a
 * portrait phone; a wide screen's anchors are 0).
 */
export const FIT = Object.freeze({ cap: 1.35, min: 1.04, side: 16, top: 240, bottom: 1164, half: 72, foot: 60, head: 81, mine: 30 });

/** The level's content box in map px (rule 1). */
export function fitBox(c: FitContent): { x0: number; y0: number; x1: number; y1: number } {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const add = (x: number, y: number, l: number, u: number, d: number): void => {
    b.x0 = Math.min(b.x0, x - l);
    b.x1 = Math.max(b.x1, x + l);
    b.y0 = Math.min(b.y0, y - u);
    b.y1 = Math.max(b.y1, y + d);
  };
  for (const t of Object.values(c.towers)) add(t.x, t.y, FIT.half, towerTop(t.kind, 3) * WORLD_ZOOM.tower + FIT.head, FIT.foot);
  for (const m of c.mines) add(m.x, m.y, FIT.mine, FIT.mine, FIT.mine);
  return b;
}

/** The fit band (rule 3, AUD-U21b) for HUD anchors `a`: the 9:16 band moved out with the HUD bands. */
export function fitBand(a: HudAnchors = { top: 0, bottom: 0 }): { top: number; bottom: number } {
  return { top: FIT.top + a.top, bottom: FIT.bottom + a.bottom };
}

/** The fit for content box `b` in the band of HUD anchors `a` (rules 2–3), or null when the whole map stays (decided on the 9:16 band). */
export function fitContent(b: { x0: number; y0: number; x1: number; y1: number }, a?: HudAnchors): Fit | null {
  const zoom = (h: number): number => Math.min(FIT.cap, (C.MAP_W - 2 * FIT.side) / (b.x1 - b.x0), h / (b.y1 - b.y0));
  if (!(zoom(FIT.bottom - FIT.top) >= FIT.min)) return null;
  const { top, bottom } = fitBand(a);
  const z = zoom(bottom - top);
  return { z, tx: (C.MAP_W - z * (b.x0 + b.x1)) / 2, ty: (top + bottom - z * (b.y0 + b.y1)) / 2 };
}

/** The part of the map (whole map px, clamped to it) the screen shows through fit `f`: all the ground image needs. */
export function groundRect(f: Fit, view: Pick<View, 'scale' | 'offsetX' | 'offsetY' | 'cssW' | 'cssH'>): { x: number; y: number; w: number; h: number } {
  const u = (v: number, t: number, max: number): number => Math.min(max, Math.max(0, (v / view.scale - t) / f.z));
  const x = Math.floor(u(-view.offsetX, f.tx, C.MAP_W));
  const y = Math.floor(u(-view.offsetY, f.ty, C.MAP_H));
  return { x, y, w: Math.max(1, Math.ceil(u(view.cssW - view.offsetX, f.tx, C.MAP_W)) - x), h: Math.max(1, Math.ceil(u(view.cssH - view.offsetY, f.ty, C.MAP_H)) - y) };
}

/** The fitted ground image (one level at a time): the flat map's ground (terrain.ts `render`) for `groundRect` only, at the zoomed resolution — about the screen's pixel count, not the whole map × z². */
let ground: { key: string; canvas: HTMLCanvasElement } | null = null;

/** The flat map seen through fit `f` (k 1 like the flat map; not `flat`, which means the identity). */
export function fitCamera(f: Fit): Camera {
  const { z, tx, ty } = f;
  const fit: CameraFit = {
    z,
    tx,
    ty,
    ground(ctx, view, pal, spec) {
      const r = groundRect(f, view);
      const s = view.dpr * view.scale * z;
      const pxW = Math.max(1, Math.ceil(r.w * s));
      const pxH = Math.max(1, Math.ceil(r.h * s));
      const key = `${spec.key}|${spec.variant ?? ''}|${spec.biome ?? ''}|${themeFor(spec.theme).id}|${pal.owners.enemy1}|${spec.zoom === true}|${pxW}x${pxH}|${r.x},${r.y}`;
      if (ground?.key !== key) {
        const canvas = document.createElement('canvas');
        canvas.width = pxW;
        canvas.height = pxH;
        const c = canvas.getContext('2d');
        if (c) {
          c.setTransform(pxW / r.w, 0, 0, pxH / r.h, (-r.x * pxW) / r.w, (-r.y * pxH) / r.h);
          render(c, pal, spec);
        }
        ground = { key, canvas };
      }
      ctx.drawImage(ground.canvas, tx + z * r.x, ty + z * r.y, z * r.w, z * r.h);
    },
    on: (ctx) => ctx.transform(z, 0, 0, z, tx, ty),
  };
  return Object.freeze({
    k: 1,
    flat: false,
    fit,
    depth: () => z,
    projY: (y: number) => ty + z * y,
    proj: (x: number, y: number) => ({ x: tx + z * x, y: ty + z * y, s: z }),
    unprojY: (y: number) => (y - ty) / z,
    unproj: (x: number, y: number) => ({ x: (x - tx) / z, y: (y - ty) / z }),
    jacY: () => z,
    projDir: FLAT.projDir,
    horizonY: () => undefined,
  });
}

/** `?fit=0` in the page URL: the whole-map framing of before AUD-U21 (A/B screenshots). */
export const fitOff = (): boolean => typeof location !== 'undefined' && /[?&]fit=0(&|$)/.test(location.search);

/**
 * The play camera for a level's content, per HUD anchors: its fit camera, or null (the whole map, FLAT;
 * always under `?fit=0`). The box is taken once (the level as it starts); the camera is one object
 * while the anchors stay (a resize or late safe-area insets move them: a new fit for the new band).
 */
export function fitFor(c: FitContent): (a?: HudAnchors) => Camera | null {
  const b = fitBox(c);
  if (fitOff() || !fitContent(b)) return () => null;
  let at: HudAnchors = { top: NaN, bottom: NaN };
  let cam: Camera | null = null;
  return (a = { top: 0, bottom: 0 }) => {
    if (!cam || a.top !== at.top || a.bottom !== at.bottom) {
      at = a;
      cam = fitCamera(fitContent(b, a)!);
    }
    return cam;
  };
}
