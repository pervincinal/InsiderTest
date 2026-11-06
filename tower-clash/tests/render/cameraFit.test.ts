import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FLAT, loadCamera, loadFit, playCamera, proj, setPlayFit, setTilt, unproj } from '../../src/render/camera';
import { FIT, fitBand, fitBox, fitCamera, fitContent, fitFor, groundRect } from '../../src/render/fit';
import { hudAnchors } from '../../src/render/view';
import type { View } from '../../src/render/view';
import { drawSea, terrainSea } from '../../src/render/sea';
import { DEFAULT_PALETTE } from '../../src/render/palette';
import { HUD, TOWER_HIT_RADIUS, WORLD_ZOOM } from '../../src/render/layout';
import { INTENT_GAP, INTENT_PX } from '../../src/render/intentGlyph';
import { towerTop } from '../../src/render/sprites';
import { hitTower } from '../../src/input/pointer';
import { createState } from '../../src/sim/index';
import type { LevelDef } from '../../src/sim/types';
import level1 from '../../src/levels/001-first-taps.json';
import level9 from '../../src/levels/009-stone-walls.json';
import level15 from '../../src/levels/015-the-citadel.json';
import level25 from '../../src/levels/025-heavy-metal.json';
import level41 from '../../src/levels/041-twin-rivers.json';
import level50 from '../../src/levels/050-the-crown-reforged.json';

/*
 * AUD-U21 (GDD §4 "AUD-U21 2026-11-05"): the play camera frames the level's content, not the whole
 * 720 × 1280 map. The content box (`fitBox`) is every tower with its tier-3 roof, badge, intent glyph,
 * chips and hit disc, plus the mines; it is zoomed up to FIT.cap (never below 1: a dense level keeps
 * the whole map, the very same FLAT camera) and centred in the band x FIT.side..704, y FIT.top..
 * FIT.bottom. The fit is in the logical frame, so it is the same on every portrait phone; the CSS scale
 * is the letterbox scale × z. `?fit=0` and the perspective camera (`?tilt=`) frame the whole map.
 */

const LEVELS = { 1: level1, 9: level9, 15: level15, 25: level25, 41: level41, 50: level50 } as unknown as Record<number, LevelDef>;
/** Portrait phones (CSS px): the letterbox fit is width-limited on all three. */
const PHONES = [
  { w: 360, h: 640 },
  { w: 430, h: 932 },
  { w: 393, h: 851 },
] as const;
const letterbox = (p: { w: number; h: number }): number => Math.min(p.w / 720, p.h / 1280);
const stateOf = (id: number) => createState(LEVELS[id]!, 1);
const fitOf = (id: number) => fitContent(fitBox(stateOf(id)));

describe('content fit (AUD-U21)', () => {
  beforeAll(() => loadFit()); // the rule and the camera are the lazy chunk render/fit.ts
  afterEach(() => {
    setPlayFit(null);
    setTilt(undefined);
    vi.unstubAllGlobals();
  });

  it('level 1 (three towers in the lower half) is zoomed to the cap and centred in the band', () => {
    const f = fitOf(1)!;
    expect(f).not.toBeNull();
    expect(f.z).toBe(FIT.cap);
    expect(FIT.cap).toBe(1.35);
    const b = fitBox(createState(LEVELS[1]!, 1));
    // centred: the box's zoomed centre is the band's centre
    expect(f.tx + (f.z * (b.x0 + b.x1)) / 2).toBeCloseTo(360, 6);
    expect(f.ty + (f.z * (b.y0 + b.y1)) / 2).toBeCloseTo((FIT.top + FIT.bottom) / 2, 6);
    for (const p of PHONES) {
      const before = letterbox(p);
      expect(before * f.z, `${p.w}x${p.h}`).toBeCloseTo(before * 1.35, 9);
    }
    // 360 wide: 0.5 → 0.675 CSS px per map px; 430 wide: 0.597 → 0.806
    expect(letterbox(PHONES[0]) * f.z).toBeCloseTo(0.675, 3);
    expect(letterbox(PHONES[1]) * f.z).toBeCloseTo(0.806, 3);
  });

  it('dense levels (15, 25, 50) keep the whole-map scale exactly: no fit, the FLAT camera', () => {
    for (const id of [15, 25, 50]) {
      expect(fitOf(id), `level ${id}`).toBeNull();
      setPlayFit(stateOf(id));
      expect(playCamera(), `level ${id}`).toBe(FLAT);
      for (const p of PHONES) expect(letterbox(p) * playCamera().proj(1, 0).s).toBe(letterbox(p));
    }
  });

  it('respects the margins: every tower with its tallest roof, badge, glyph, chips and disc stays in the band', () => {
    const f = fitOf(1)!;
    const cam = fitCamera(f);
    for (const t of Object.values(createState(LEVELS[1]!, 1).towers)) {
      const p = proj(cam, t.x, t.y);
      expect(p.s).toBe(f.z);
      const up = (towerTop(t.kind, 3) * WORLD_ZOOM.tower + FIT.head) * f.z;
      expect(p.x - FIT.half * f.z, t.id).toBeGreaterThanOrEqual(FIT.side - 1e-9);
      expect(p.x + FIT.half * f.z, t.id).toBeLessThanOrEqual(720 - FIT.side + 1e-9);
      expect(p.y - up, t.id).toBeGreaterThanOrEqual(FIT.top - 1e-9);
      expect(p.y + FIT.foot * f.z, t.id).toBeLessThanOrEqual(FIT.bottom + 1e-9);
    }
    // the margins cover what they stand for (map px, drawn × z): the badge's lift and height over the
    // roof plus the intent glyph above it; the hit disc beside and under the base; the band's foot
    const badgeH = (10 + 26) * WORLD_ZOOM.badge;
    expect(FIT.head).toBeGreaterThanOrEqual(18 * WORLD_ZOOM.badge + badgeH / 2 + (INTENT_PX + INTENT_GAP) * WORLD_ZOOM.badge);
    expect(FIT.half).toBeGreaterThanOrEqual(TOWER_HIT_RADIUS);
    expect(FIT.foot).toBeGreaterThanOrEqual(TOWER_HIT_RADIUS);
    expect(FIT.bottom).toBeLessThanOrEqual(HUD.mapBottom - 16);
    // the lesson card (hud.ts lessonCardLayout: y 108, caption + three 20 px lines) ends above FIT.top
    expect(FIT.top).toBeGreaterThanOrEqual(108 + (22 + 4) + 3 * 26 + 18);
  });

  it('never zooms past the cap nor below 1, for any content', () => {
    expect(fitContent({ x0: 340, y0: 600, x1: 380, y1: 640 })!.z).toBe(FIT.cap);
    expect(fitContent({ x0: 0, y0: 0, x1: 720, y1: 1280 })).toBeNull();
    // just under the minimum gain: the map stays as it is (no 2 % zoom)
    const h = (FIT.bottom - FIT.top) / (FIT.min - 0.01);
    expect(fitContent({ x0: 300, y0: 100, x1: 400, y1: 100 + h })).toBeNull();
    const ok = fitContent({ x0: 300, y0: 100, x1: 400, y1: 100 + (FIT.bottom - FIT.top) / 1.2 })!;
    expect(ok.z).toBeCloseTo(1.2, 9); // height-limited
  });

  it('the fit camera is exact both ways, and input goes through it (hit test, toWorld)', () => {
    const f = fitOf(1)!;
    setPlayFit(stateOf(1));
    const cam = playCamera();
    expect(cam).toBe(playCamera()); // one object per level
    expect(cam.fit).toMatchObject(f);
    expect(cam.flat).toBe(false);
    expect(cam.k).toBe(1);
    for (const [x, y] of [
      [0, 0],
      [200, 1100],
      [719, 1279],
    ] as const) {
      const p = proj(cam, x, y);
      expect(p).toEqual({ x: f.tx + f.z * x, y: f.ty + f.z * y, s: f.z });
      const back = unproj(cam, p.x, p.y);
      expect(back.x).toBeCloseTo(x, 9);
      expect(back.y).toBeCloseTo(y, 9);
      expect(cam.projY(y)).toBeCloseTo(p.y, 9);
      expect(cam.unprojY(p.y)).toBeCloseTo(y, 9);
    }
    expect(cam.projDir(10, 10, 0.6, 0.8)).toEqual({ dx: 0.6, dy: 0.8 });
    // a tap TOWER_HIT_RADIUS × z − 2 screen px beside the home tower takes it, + 3 does not
    const st = createState(LEVELS[1]!, 1);
    const home = st.towers.home!;
    const at = proj(cam, home.x, home.y);
    const hit = (dx: number) => {
      const w = unproj(cam, at.x + dx, at.y);
      return hitTower(st, w.x, w.y, TOWER_HIT_RADIUS, (x, y) => proj(cam, x, y))?.id ?? null;
    };
    expect(hit(TOWER_HIT_RADIUS * f.z - 2)).toBe('home');
    expect(hit(TOWER_HIT_RADIUS * f.z + 3)).toBeNull();
  });

  it('?fit=0 frames the whole map exactly as before (FLAT), and so does the perspective camera', async () => {
    const f = fitOf(1)!;
    vi.stubGlobal('location', { search: '?fit=0' });
    setPlayFit(stateOf(1));
    expect(playCamera()).toBe(FLAT);
    vi.stubGlobal('location', { search: '?lang=en&fit=0' });
    setPlayFit(stateOf(1));
    expect(playCamera()).toBe(FLAT);
    vi.stubGlobal('location', { search: '?fit=1' });
    setPlayFit(stateOf(1));
    expect(playCamera().fit).toMatchObject(f);
    vi.unstubAllGlobals();
    await loadCamera();
    setTilt(0.72);
    expect(playCamera().fit).toBeUndefined();
    expect(playCamera().k).toBe(0.72);
    setTilt(0);
    expect(playCamera().fit).toMatchObject(f);
    setPlayFit(null); // off the play screen: the whole map
    expect(playCamera()).toBe(FLAT);
  });

  it('the ground image covers only the map the screen shows, at the zoomed resolution (about the screen pixel count, not the whole map × z²)', () => {
    const f = fitOf(1)!;
    const cam = fitCamera(f);
    for (const p of PHONES) {
      const scale = letterbox(p);
      const view = { scale, offsetX: 0, offsetY: (p.h - 1280 * scale) / 2, cssW: p.w, cssH: p.h };
      const r = groundRect(f, view);
      // the screen's corners, unprojected, lie inside the rect (or past the map's edge)
      const tl = unproj(cam, -view.offsetX / scale, -view.offsetY / scale);
      const br = unproj(cam, (p.w - view.offsetX) / scale, (p.h - view.offsetY) / scale);
      expect(r.x).toBeLessThanOrEqual(Math.max(0, tl.x));
      expect(r.y).toBeLessThanOrEqual(Math.max(0, tl.y));
      expect(r.x + r.w).toBeGreaterThanOrEqual(Math.min(720, br.x));
      expect(r.y + r.h).toBeGreaterThanOrEqual(Math.min(1280, br.y));
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y + r.h).toBeLessThanOrEqual(1280);
      // about the screen's own pixel count (one map px of slack per edge), not the whole map × z²
      expect((r.w - 2) * (r.h - 2) * f.z * f.z, `${p.w}x${p.h}`).toBeLessThanOrEqual((p.w / scale) * (p.h / scale));
    }
  });

  describe('AUD-U21b: the real play band between the HUD bands', () => {
    /** The letterbox of view.ts `resize` for a w × h CSS px screen with top / bottom safe-area insets. */
    const screen = (w: number, h: number, top = 0, bottom = 0) => {
      const usableH = Math.max(h / 2, h - top - bottom);
      const scale = Math.min(w / 720, usableH / 1280);
      return { cssW: w, cssH: h, scale, offsetX: (w - 720 * scale) / 2, offsetY: Math.min(top, h - usableH) + (usableH - 1280 * scale) / 2, insets: { top, right: 0, bottom, left: 0 } };
    };
    const IPHONE = screen(430, 932, 59, 34); // the stakeholder's iPhone 17 Pro Max
    /** Yesterday's (AUD-U21) level 1 fit on the 9:16 band: pinned numbers. */
    const L1 = { z: 1.35, tx: -4.5, ty: -467.235 };

    it('the band is the 9:16 band moved out with the HUD anchors (top band bottom edge … bottom band top edge, same margins)', () => {
      expect(fitBand()).toEqual({ top: FIT.top, bottom: FIT.bottom });
      const a = hudAnchors(IPHONE);
      expect(a.top).toBeCloseTo(-62.419, 3);
      expect(a.bottom).toBeCloseTo(62.419, 3);
      const band = fitBand(a);
      // the margins from the HUD bands as they sit on the screen are the 9:16 ones
      expect(band.top - (HUD.mapTop + a.top)).toBeCloseTo(FIT.top - HUD.mapTop, 9);
      expect(HUD.mapBottom + a.bottom - band.bottom).toBeCloseTo(HUD.mapBottom - FIT.bottom, 9);
      expect(band.top).toBeCloseTo(177.581, 3);
      expect(band.bottom).toBeCloseTo(1226.419, 3);
      // 9:16: no anchors, the very same band
      expect(fitBand(hudAnchors(screen(360, 640)))).toEqual(fitBand());
      expect(fitBand(hudAnchors(screen(720, 1280)))).toEqual(fitBand());
    });

    it('430 × 932 (insets 59 / 34): level 1 stays at the cap, centred in the real band (its centre is the 9:16 one: the bands move out evenly)', () => {
      const b = fitBox(stateOf(1));
      const a = hudAnchors(IPHONE);
      const f = fitContent(b, a)!;
      expect(f.z).toBe(FIT.cap); // the tall band alone would allow min(2.42, 1048.8 / 587.8) = 1.78: the cap holds
      expect(f.tx).toBeCloseTo(L1.tx, 9);
      expect(f.ty).toBeCloseTo(L1.ty, 6);
      const band = fitBand(a);
      expect(f.ty + (f.z * (b.y0 + b.y1)) / 2).toBeCloseTo((band.top + band.bottom) / 2, 6);
      expect(IPHONE.scale * f.z).toBeCloseTo(0.806, 3); // CSS px per map px
    });

    it('a height-limited sparse box zooms further on the tall phone (same cap) and fills its band; a desktop is unchanged', () => {
      const b = { x0: 300, y0: 300, x1: 420, y1: 300 + (FIT.bottom - FIT.top) / 1.1 }; // z 1.1 on 9:16
      expect(fitContent(b)!.z).toBeCloseTo(1.1, 9);
      const a = hudAnchors(IPHONE);
      const f = fitContent(b, a)!;
      const band = fitBand(a);
      expect(f.z).toBeCloseTo((1.1 * (band.bottom - band.top)) / (FIT.bottom - FIT.top), 9); // ≈ 1.249
      expect(f.z).toBeGreaterThan(1.24);
      expect(f.ty + f.z * b.y0).toBeCloseTo(band.top, 6);
      expect(f.ty + f.z * b.y1).toBeCloseTo(band.bottom, 6);
      // uneven anchors: centred in the band, not on the map
      const g = fitContent(b, { top: -100, bottom: 0 })!;
      expect(g.ty + (g.z * (b.y0 + b.y1)) / 2).toBeCloseTo((FIT.top - 100 + FIT.bottom) / 2, 6);
      expect(fitContent({ x0: 340, y0: 600, x1: 380, y1: 640 }, a)!.z).toBe(FIT.cap);
      // a desktop (1280 × 800, height-limited letterbox): anchors 0, yesterday's fit
      expect(hudAnchors(screen(1280, 800))).toEqual({ top: 0, bottom: 0 });
      expect(fitContent(b, hudAnchors(screen(1280, 800)))).toEqual(fitContent(b));
    });

    it("regression pin: 360 × 640 and 393 × 851 give yesterday's level 1 numbers exactly", () => {
      for (const p of [screen(360, 640), screen(393, 851), IPHONE]) {
        const f = fitContent(fitBox(stateOf(1)), hudAnchors(p))!;
        expect(f.z, `${p.cssW}x${p.cssH}`).toBe(L1.z);
        expect(f.tx, `${p.cssW}x${p.cssH}`).toBeCloseTo(L1.tx, 9);
        expect(f.ty, `${p.cssW}x${p.cssH}`).toBeCloseTo(L1.ty, 6);
      }
      // 9:16 is yesterday's rule to the bit
      expect(fitContent(fitBox(stateOf(1)), hudAnchors(screen(360, 640)))).toEqual(fitContent(fitBox(stateOf(1))));
    });

    it('dense levels keep the whole map on the tall phones too (decided on the 9:16 band: no new zoom, never below 1)', () => {
      const tall = screen(393, 851); // the tallest band here (anchors ∓139.5): level 41's box alone would reach 1.13 there
      for (const id of [9, 15, 25, 41, 50]) {
        for (const p of [IPHONE, tall]) {
          expect(fitContent(fitBox(stateOf(id)), hudAnchors(p)), `level ${id} ${p.cssW}x${p.cssH}`).toBeNull();
          setPlayFit(stateOf(id), () => hudAnchors(p));
          expect(playCamera(), `level ${id}`).toBe(FLAT);
        }
      }
    });

    it('the play camera follows the anchors: one object while they stay, a new fit when they move; ?fit=0 and ?tilt= frame the whole map', async () => {
      let a = hudAnchors(IPHONE);
      setPlayFit(stateOf(1), () => a);
      const cam = playCamera();
      expect(cam).toBe(playCamera());
      expect(cam.fit).toMatchObject(fitContent(fitBox(stateOf(1)), a)!);
      a = { top: -100, bottom: 0 };
      const moved = playCamera();
      expect(moved).not.toBe(cam);
      expect(moved.fit).toMatchObject(fitContent(fitBox(stateOf(1)), a)!);
      // input goes through the same camera: a point projected and unprojected lands back
      const at = proj(moved, 300, 900);
      const back = unproj(moved, at.x, at.y);
      expect(back.x).toBeCloseTo(300, 9);
      expect(back.y).toBeCloseTo(900, 9);
      expect(fitFor(stateOf(1))(a)).not.toBeNull();
      vi.stubGlobal('location', { search: '?fit=0' });
      expect(fitFor(stateOf(1))(a)).toBeNull();
      setPlayFit(stateOf(1), () => a);
      expect(playCamera()).toBe(FLAT);
      vi.unstubAllGlobals();
      await loadCamera();
      setPlayFit(stateOf(1), () => a);
      setTilt(0.72);
      expect(playCamera().fit).toBeUndefined();
    });

    it('FE-A: on a wide screen the margin sea takes its gradient over the rows the fitted ground spans (no tint step at the ground image edge)', () => {
      const grads: number[][] = [];
      const ctx = new Proxy({} as Record<string, unknown>, {
        get: (t, k: string) => (k === 'createLinearGradient' ? (...a: number[]) => (grads.push(a), { addColorStop: () => undefined }) : k in t ? t[k] : () => undefined),
        set: (t, k: string, v: unknown) => ((t[k] = v), true),
      }) as unknown as CanvasRenderingContext2D;
      const desktop = { ...screen(1280, 800), dpr: 1 } as unknown as View;
      const f = fitOf(1)!;
      drawSea(ctx, desktop, terrainSea(DEFAULT_PALETTE, undefined), fitCamera(f));
      expect(grads[0]).toEqual([0, f.ty, 0, f.ty + f.z * 1280]); // terrain.ts drawWater's 0..MAP_H, through the fit
      drawSea(ctx, desktop, terrainSea(DEFAULT_PALETTE, undefined), FLAT);
      drawSea(ctx, desktop, terrainSea(DEFAULT_PALETTE, undefined));
      expect(grads.slice(1)).toEqual([
        [0, 0, 0, 1280],
        [0, 0, 0, 1280],
      ]);
    });
  });
});
