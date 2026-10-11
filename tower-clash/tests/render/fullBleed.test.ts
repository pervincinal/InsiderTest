import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SafeInsets, View } from '../../src/render/view';
import { bleed, bleedRect, createView, fromHudSpace, hudAnchors, toClient, toHudSpace, toLogical } from '../../src/render/view';
import { BOOSTERS, HUD } from '../../src/render/layout';
import { hudBandRects } from '../../src/render/hud';
import { drawSea, menuSea, terrainSea } from '../../src/render/sea';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE, DEFAULT_THEME, loadThemes } from '../../src/render/palette';
import { inRect } from '../../src/render/widgets';
import { C } from '../../src/sim/constants';

/*
 * BUG-34 (TestFlight 1.0.0 (8), iPhone 17 Pro Max): the 720×1280 map is letterboxed on any screen
 * taller than 9:16, and the margins were flat dark bands with the HUD sitting on the map rect's edges.
 * Now the sea covers the whole canvas, the HUD's bands are anchored to the screen's safe-area edges
 * (glass out to the screen edge) and taps on them are mapped back onto the layout rects.
 */

const NO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
/** iPhone 17 Pro Max-class portrait viewport (CSS px) and its Dynamic Island / home indicator insets. */
const PRO_MAX = { w: 430, h: 932, insets: { top: 59, right: 0, bottom: 34, left: 0 } };

let env: SafeInsets = NO_INSETS;

function stubDom(innerWidth: number, innerHeight: number, insets: SafeInsets = NO_INSETS): void {
  env = insets;
  vi.stubGlobal('window', { innerWidth, innerHeight, devicePixelRatio: 3 });
  vi.stubGlobal('getComputedStyle', () => {
    const vars: Record<string, string> = { '--safe-top': `${env.top}px`, '--safe-right': `${env.right}px`, '--safe-bottom': `${env.bottom}px`, '--safe-left': `${env.left}px` };
    return { getPropertyValue: (name: string) => vars[name] ?? '' };
  });
}

/** The canvas fills the viewport from its top-left corner (index.html), like the game's #game. */
function fakeCanvas(): HTMLCanvasElement {
  const ctx = new Proxy({} as CanvasRenderingContext2D, { get: () => () => undefined });
  return {
    width: 0,
    height: 0,
    style: {} as CSSStyleDeclaration,
    parentElement: {} as Element,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  } as unknown as HTMLCanvasElement;
}

function viewAt(w: number, h: number, insets: SafeInsets = NO_INSETS): View {
  stubDom(w, h, insets);
  return createView(fakeCanvas());
}

const centre = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

afterEach(() => {
  env = NO_INSETS;
  vi.unstubAllGlobals();
});

describe('full-bleed geometry (BUG-34)', () => {
  it('9:16 without insets: no margins, the HUD stays where the layout puts it', () => {
    const view = viewAt(360, 640);
    expect(bleed(view)).toEqual({ left: 0, top: 0, right: C.MAP_W, bottom: C.MAP_H });
    expect(hudAnchors(view)).toEqual({ top: 0, bottom: 0 });
    const bands = hudBandRects(view);
    expect(bands.top).toEqual(HUD.topBar);
    expect(bands.bottom).toEqual(HUD.bottomBar);
    for (const r of [HUD.pause, HUD.mute, HUD.menu, HUD.streams, BOOSTERS.overdrive]) {
      const c = centre(r);
      expect(toHudSpace(hudAnchors(view), c.x, c.y)).toEqual(c);
      expect(toClient(view, c.x, c.y)).toEqual({ x: c.x * view.scale, y: c.y * view.scale });
    }
  });

  it('19.5:9 with Dynamic Island / home indicator: the map keeps its fit, the canvas reaches past it on both ends', () => {
    const view = viewAt(PRO_MAX.w, PRO_MAX.h, PRO_MAX.insets);
    // the island is unscaled and centred as before: full width, centred in the safe box
    expect(view.scale).toBeCloseTo(PRO_MAX.w / C.MAP_W, 9);
    const b = bleed(view);
    expect(b.left).toBe(0);
    expect(b.right).toBeCloseTo(C.MAP_W, 9);
    expect(b.top).toBeCloseTo(-view.offsetY / view.scale, 9);
    expect(b.top).toBeLessThan(-150); // ≈ 96 CSS px of margin = 161 logical px
    expect(b.bottom).toBeGreaterThan(C.MAP_H + 100);
    expect(b.bottom).toBeCloseTo((PRO_MAX.h - view.offsetY) / view.scale, 9);
    // the margins are what the safe box leaves, split evenly around the map, plus the insets
    const topGap = view.offsetY - PRO_MAX.insets.top;
    const bottomGap = PRO_MAX.h - PRO_MAX.insets.bottom - (view.offsetY + C.MAP_H * view.scale);
    expect(topGap).toBeGreaterThan(30);
    expect(topGap).toBeCloseTo(bottomGap, 9);
    // the dim / sea rect covers the canvas plus one CSS px
    const r = bleedRect(view);
    expect(r.x).toBe(b.left);
    expect(r.y).toBe(b.top);
    expect(r.w * view.scale).toBeCloseTo(PRO_MAX.w + 1, 9);
    expect(r.h * view.scale).toBeCloseTo(PRO_MAX.h + 1, 9);
  });

  it('anchors the top band to the top safe-area edge and the bottom band to the bottom one', () => {
    const view = viewAt(PRO_MAX.w, PRO_MAX.h, PRO_MAX.insets);
    const a = hudAnchors(view);
    const topGap = (view.offsetY - PRO_MAX.insets.top) / view.scale;
    expect(a.top).toBeCloseTo(-topGap, 9);
    expect(a.bottom).toBeCloseTo(topGap, 9); // symmetric safe box
    // the band's layout top edge (y 0) lands on the safe-area edge, its bottom edge (y 1280) on the bottom one
    expect(toClient(view, 0, fromHudSpace(a, 0, HUD.topBar.y).y).y).toBeCloseTo(PRO_MAX.insets.top, 9);
    const bottomEdge = fromHudSpace(a, 0, HUD.bottomBar.y + HUD.bottomBar.h - 1e-9).y;
    expect(toClient(view, 0, bottomEdge).y).toBeCloseTo(PRO_MAX.h - PRO_MAX.insets.bottom, 6);
    // pause / mute sit right under the island: 18 layout px under the safe edge, not 18 under the map rect
    const pause = fromHudSpace(a, HUD.pause.x, HUD.pause.y);
    expect(toClient(view, pause.x, pause.y).y).toBeCloseTo(PRO_MAX.insets.top + HUD.pause.y * view.scale, 9);
    expect(pause.y).toBeLessThan(0); // above the map rect: logical y < 0
    const menu = fromHudSpace(a, HUD.menu.x, HUD.menu.y + HUD.menu.h);
    expect(menu.y).toBeGreaterThan(C.MAP_H); // below the map rect: logical y > 1280
    // glass: from the screen's top edge to the anchored band edge, and from the anchored edge past the bottom
    const bands = hudBandRects(view, a);
    expect(bands.top.y).toBeCloseTo(bleed(view).top, 9);
    expect(bands.top.y + bands.top.h).toBeCloseTo(HUD.topBar.h + a.top, 9);
    expect(bands.bottom.y).toBeCloseTo(HUD.bottomBar.y + a.bottom, 9);
    expect(bands.bottom.y + bands.bottom.h).toBeGreaterThanOrEqual(bleed(view).bottom);
    expect(bands.top.x).toBe(0);
    expect(bands.top.w).toBeCloseTo(C.MAP_W, 9);
  });

  it('toLogical is linear outside the map, and toHudSpace maps taps on the moved bands back onto the HUD rects', () => {
    const view = viewAt(PRO_MAX.w, PRO_MAX.h, PRO_MAX.insets);
    const a = hudAnchors(view);
    for (const r of [HUD.pause, HUD.mute, HUD.levelChip, HUD.menu, HUD.streams, HUD.coins, HUD.wallet, BOOSTERS.overdrive, BOOSTERS.freeze, BOOSTERS.airstrike]) {
      const c = centre(r);
      const onScreen = toClient(view, fromHudSpace(a, c.x, c.y).x, fromHudSpace(a, c.x, c.y).y);
      const l = toLogical(view, onScreen.x, onScreen.y);
      const h = toHudSpace(a, l.x, l.y);
      expect(inRect(r, h.x, h.y), `tap on the drawn ${JSON.stringify(r)} hits it`).toBe(true);
      expect(h.x).toBeCloseTo(c.x, 6);
      expect(h.y).toBeCloseTo(c.y, 6);
      // …and the same tap read as a plain logical point misses the layout rect (it moved)
      expect(inRect(r, l.x, l.y)).toBe(false);
    }
    // a tap under the Dynamic Island (top margin, above the map) is a negative logical y, not clamped
    const notch = toLogical(view, 200, 10);
    expect(notch.y).toBeLessThan(0);
    expect(notch.y).toBeCloseTo((10 - view.offsetY) / view.scale, 9);
    const homeBar = toLogical(view, 200, PRO_MAX.h - 5);
    expect(homeBar.y).toBeGreaterThan(C.MAP_H);
    // the world between the bands is untouched (towers hit-test the plain logical point)
    for (const y of [HUD.mapTop + a.top, 400, 640, HUD.mapBottom, HUD.mapBottom + a.bottom - 0.5]) expect(toHudSpace(a, 300, y)).toEqual({ x: 300, y });
  });

  it('a wide screen gets side margins and keeps the bands at the map rect edges (they span the screen width)', () => {
    const view = viewAt(1280, 720);
    const b = bleed(view);
    expect(b.top).toBe(0);
    expect(b.bottom).toBeCloseTo(C.MAP_H, 9);
    expect(b.left).toBeLessThan(-500);
    expect(b.right - C.MAP_W).toBeCloseTo(-b.left, 9);
    expect(hudAnchors(view)).toEqual({ top: 0, bottom: 0 });
    const bands = hudBandRects(view);
    expect(bands.top.x).toBeCloseTo(b.left, 9);
    expect(bands.top.w).toBeGreaterThan(b.right - b.left);
    expect(bands.top.y).toBe(0);
    expect(bands.top.h).toBe(HUD.topBar.h);
  });

  it('a stub view (no layout yet) has no anchors rather than NaN', () => {
    expect(hudAnchors({} as View)).toEqual({ top: 0, bottom: 0 });
  });
});

/* ---------- the sea painter ---------- */

interface Op {
  op: string;
  args: number[];
  style?: unknown;
}

function recorder(): { ctx: CanvasRenderingContext2D; ops: Op[]; gradients: [number, string][][] } {
  const ops: Op[] = [];
  const gradients: [number, string][][] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, key: string) {
      if (key === 'createLinearGradient') {
        return (...args: number[]) => {
          const stops: [number, string][] = [];
          gradients.push(stops);
          ops.push({ op: 'gradient', args });
          return { addColorStop: (o: number, c: string) => stops.push([o, c]) };
        };
      }
      if (key in target) return target[key];
      return (...args: number[]) => void ops.push({ op: key, args, style: key === 'fillRect' ? target.fillStyle : key === 'stroke' ? target.strokeStyle : undefined });
    },
    set(target, key: string, value: unknown) {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, ops, gradients };
}

describe('drawSea (BUG-34)', () => {
  it('paints the map water gradient over the whole canvas, clamped past the map (no seam at its edges)', () => {
    const view = viewAt(PRO_MAX.w, PRO_MAX.h, PRO_MAX.insets);
    const { ctx, ops, gradients } = recorder();
    drawSea(ctx, view, terrainSea(DEFAULT_PALETTE, undefined));
    const grad = ops.find((o) => o.op === 'gradient')!;
    expect(grad.args).toEqual([0, 0, 0, C.MAP_H]); // the same span as terrain.ts drawWater
    expect(gradients[0]).toEqual([
      [0, DEFAULT_THEME.waterTop],
      [1, DEFAULT_THEME.waterBottom],
    ]);
    const fill = ops.find((o) => o.op === 'fillRect')!;
    const r = bleedRect(view);
    expect(fill.args).toEqual([r.x, r.y, r.w, r.h]);
    // never the old flat letterbox colour (palette `letterbox`, removed with BUG-34)
    expect(ops.some((o) => o.style === '#1f8fc2')).toBe(false);
  });

  it('draws wave bands only in the margins, none on a 9:16 screen', () => {
    const tall = viewAt(PRO_MAX.w, PRO_MAX.h, PRO_MAX.insets);
    const t = recorder();
    drawSea(t.ctx, tall, menuSea(DEFAULT_PALETTE));
    const ys = t.ops.filter((o) => o.op === 'lineTo' || o.op === 'moveTo').map((o) => o.args[1]!);
    expect(ys.length).toBeGreaterThan(20);
    for (const y of ys) expect(y < -30 || y > C.MAP_H + 30, `wave point at y ${y} stays in a margin`).toBe(true);
    expect(ys.some((y) => y < 0)).toBe(true);
    expect(ys.some((y) => y > C.MAP_H)).toBe(true);
    expect(t.ops.filter((o) => o.op === 'stroke').every((o) => o.style === DEFAULT_PALETTE.waterLight)).toBe(true);

    const exact = viewAt(360, 640);
    const e = recorder();
    drawSea(e.ctx, exact, menuSea(DEFAULT_PALETTE));
    expect(e.ops.filter((o) => o.op === 'stroke')).toEqual([]);
    expect(e.ops.filter((o) => o.op === 'fillRect').length).toBe(1);
  });

  it('wide screens: bands in the side margins only', () => {
    const view = viewAt(1280, 720);
    const { ctx, ops } = recorder();
    drawSea(ctx, view, menuSea(DEFAULT_PALETTE));
    const xs = ops.filter((o) => o.op === 'lineTo' || o.op === 'moveTo').map((o) => o.args[0]!);
    expect(xs.length).toBeGreaterThan(20);
    for (const x of xs) expect(x <= -12 || x >= C.MAP_W + 12).toBe(true);
  });

  it('follows the palette (colour-blind) and the equipped theme, and bakes the theme wash into the margins only on request', async () => {
    expect(menuSea(COLOR_BLIND_PALETTE)).toEqual({ top: COLOR_BLIND_PALETTE.waterTop, bottom: COLOR_BLIND_PALETTE.waterBottom, wave: COLOR_BLIND_PALETTE.waterLight });
    expect(terrainSea(COLOR_BLIND_PALETTE, undefined).wave).toBe(COLOR_BLIND_PALETTE.waterLight);
    await loadThemes();
    const neon = terrainSea(DEFAULT_PALETTE, 'theme.neon', true);
    expect(neon.top).toBe('#0d0620');
    expect(neon.bottom).toBe('#2c1264');
    expect(neon.ambient).toMatch(/^rgba\(/);
    expect(terrainSea(DEFAULT_PALETTE, 'theme.neon').ambient).toBeUndefined();
    const view = viewAt(PRO_MAX.w, PRO_MAX.h, PRO_MAX.insets);
    const { ctx, ops } = recorder();
    drawSea(ctx, view, neon);
    const fills = ops.filter((o) => o.op === 'fillRect');
    expect(fills.length).toBe(2);
    expect(fills[1]!.style).toBe(neon.ambient);
  });

  it('a flat sea (loading screen) needs no gradient', () => {
    const view = viewAt(PRO_MAX.w, PRO_MAX.h, PRO_MAX.insets);
    const { ctx, ops } = recorder();
    drawSea(ctx, view, { top: DEFAULT_PALETTE.background, bottom: DEFAULT_PALETTE.background });
    expect(ops.some((o) => o.op === 'gradient')).toBe(false);
    expect(ops.filter((o) => o.op === 'fillRect').map((o) => o.style)).toEqual([DEFAULT_PALETTE.background]);
  });
});
