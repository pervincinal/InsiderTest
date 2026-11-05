import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FLAT, loadCamera, loadFit, playCamera, proj, setPlayFit, setTilt, unproj } from '../../src/render/camera';
import { FIT, fitBox, fitCamera, fitContent, groundRect } from '../../src/render/fit';
import { HUD, TOWER_HIT_RADIUS, WORLD_ZOOM } from '../../src/render/layout';
import { INTENT_GAP, INTENT_PX } from '../../src/render/intentGlyph';
import { towerTop } from '../../src/render/sprites';
import { hitTower } from '../../src/input/pointer';
import { createState } from '../../src/sim/index';
import type { LevelDef } from '../../src/sim/types';
import level1 from '../../src/levels/001-first-taps.json';
import level15 from '../../src/levels/015-the-citadel.json';
import level25 from '../../src/levels/025-heavy-metal.json';
import level50 from '../../src/levels/050-the-crown-reforged.json';

/*
 * AUD-U21 (GDD §4 "AUD-U21 2026-11-05"): the play camera frames the level's content, not the whole
 * 720 × 1280 map. The content box (`fitBox`) is every tower with its tier-3 roof, badge, intent glyph,
 * chips and hit disc, plus the mines; it is zoomed up to FIT.cap (never below 1: a dense level keeps
 * the whole map, the very same FLAT camera) and centred in the band x FIT.side..704, y FIT.top..
 * FIT.bottom. The fit is in the logical frame, so it is the same on every portrait phone; the CSS scale
 * is the letterbox scale × z. `?fit=0` and the perspective camera (`?tilt=`) frame the whole map.
 */

const LEVELS = { 1: level1, 15: level15, 25: level25, 50: level50 } as unknown as Record<number, LevelDef>;
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
});
