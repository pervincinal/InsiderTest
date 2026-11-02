import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Layer } from '../../src/render/layers';
import { blankLayer } from '../../src/render/layers';
import type { TitleOpts } from '../../src/render/menus';
import { drawTitle } from '../../src/render/menus';
import { TITLE_IDLE_FRAME_MS, drawWord, paintTitle, wordBob } from '../../src/render/titleIdle';
import type { View } from '../../src/render/view';
import { TITLE } from '../../src/render/layout';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE } from '../../src/render/palette';
import { setTextScale } from '../../src/render/widgets';
import { setReducedMotionOverride } from '../../src/ui/motion';

// the painter's decisions are under test: which part of `drawTitle` goes to which canvas, and when
vi.mock('../../src/render/menus', async (actual) => ({ ...(await actual<typeof import('../../src/render/menus')>()), drawTitle: vi.fn() }));
// the call-for-call check of the split draws for real, minus the island image (needs a DOM canvas)
vi.mock('../../src/render/terrain', async (actual) => ({ ...(await actual<typeof import('../../src/render/terrain')>()), drawTerrain: vi.fn(), getTerrain: vi.fn() }));

/*
 * AUD-Q11 (audit P2, Performance): the idle title was the most expensive frame of the game — its whole
 * frame (sea, island, demo battle, the extruded wordmark, every label) repainted on every frame of the
 * screen players idle on. `paintTitle` (src/render/titleIdle.ts) keeps the static ground on the ground
 * layer and the static UI on the HUD layer, painted once per change, and the moving part on the game
 * canvas at ≥ 30 fps; reduced motion paints the single-canvas frame once per change.
 */

const draw = vi.mocked(drawTitle);

/** A context that records its clears (enough for the painter; `drawTitle` itself is mocked). */
function fakeCtx(name: string, w = 720, h = 1280): CanvasRenderingContext2D {
  return { name, canvas: { width: w, height: h }, setTransform: () => undefined, clearRect: () => undefined } as unknown as CanvasRenderingContext2D;
}
function layer(name: string): Layer {
  const ctx = fakeCtx(name);
  return { canvas: ctx.canvas, ctx, key: '' };
}

function makeView(): View {
  const ctx = fakeCtx('game');
  return {
    canvas: ctx.canvas,
    ctx,
    dpr: 2,
    cssW: 360,
    cssH: 640,
    scale: 0.5,
    offsetX: 0,
    offsetY: 0,
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    layers: { ground: layer('ground'), hud: layer('hud') },
  };
}

function opts(nowMs: number, over: Partial<TitleOpts> = {}): TitleOpts {
  return {
    playRect: TITLE.play,
    settingsRect: TITLE.settings,
    soundRect: TITLE.sound,
    shopRect: TITLE.shop,
    dailyRect: TITLE.daily,
    achievementsRect: TITLE.achievements,
    achievements: { unlocked: 1, total: 20 },
    walletRect: TITLE.wallet,
    langRect: TITLE.lang,
    language: 'en',
    soundOn: true,
    totalStars: 3,
    gold: 100,
    crystals: 5,
    daily: { claimable: true, day: 1, gold: 50, crystals: 0, adChest: false },
    nowMs,
    pressed: null,
    toast: null,
    ...over,
  };
}

/**
 * `drawTitle` calls so far as `parts@canvas` (`all` = the whole frame; 10 = the moving part with the
 * wordmark drawn, as without a DOM to bake it in — the painter's fallback, what runs here).
 */
function calls(): string[] {
  return draw.mock.calls.map(([, , , parts, ctx]) => `${parts ?? 'all'}@${(ctx as unknown as { name: string } | undefined)?.name ?? 'game'}`);
}
const count = (what: string): number => calls().filter((c) => c === what).length;

/** Run the title at `hz` for `ms` from `t0` (one `paintTitle` per frame); returns the next frame's time. */
function run(view: View, hz: number, ms: number, t0 = 1000, o: Partial<TitleOpts> = {}, pal = DEFAULT_PALETTE): number {
  let t = t0;
  for (; t < t0 + ms - 1e-6; t += 1000 / hz) paintTitle(view, pal, opts(t, o));
  return t;
}

/** Every call and property write on a fake context, numbers rounded (the transform calls aside). */
function recorder(): { ctx: CanvasRenderingContext2D; log: string[] } {
  const log: string[] = [];
  const store: Record<string | symbol, unknown> = { canvas: { width: 1440, height: 2560 } };
  const arg = (x: unknown): string => (typeof x === 'number' ? String(Math.round(x * 100) / 100) : typeof x === 'string' ? x : typeof x);
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, k) {
      if (k in store) return store[k];
      if (k === 'measureText') return (s: string) => ({ width: String(s).length * 12 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
      if (k === 'getTransform') return () => undefined; // the sprite cache draws direct (spriteCache.ts: test stubs)
      return (...a: unknown[]) => void log.push(`${String(k)}(${a.map(arg).join(',')})`);
    },
    set(_t, k, v) {
      store[k] = v;
      log.push(`${String(k)}=${arg(v)}`);
      return true;
    },
  });
  return { ctx, log };
}

beforeEach(() => {
  draw.mockClear();
  setReducedMotionOverride(false);
  setTextScale(1);
});
afterEach(() => {
  setReducedMotionOverride(null);
  setTextScale(1);
});

describe('idle title (AUD-Q11)', () => {
  it('paints the static ground and UI once on their layers and the moving part on the game canvas at 30 fps on a 60 Hz display', () => {
    const view = makeView();
    run(view, 60, 1000);
    expect(count('1@ground')).toBe(1);
    expect(count('4@hud')).toBe(1);
    expect(count('all@game'), 'never the whole frame while idle').toBe(0);
    expect(count('10@game')).toBe(30); // 60 frames, every other one
    expect(calls().slice(0, 3), 'the first frame paints all three').toEqual(['1@ground', '4@hud', '10@game']);
    expect(view.layers!.ground.key).not.toBe('');
    expect(view.layers!.hud.key).toBe(view.layers!.ground.key);
  });

  it('paints the moving part 30 times a second at any display rate from 30 Hz up, evenly — never fewer, never more', () => {
    expect(TITLE_IDLE_FRAME_MS).toBeCloseTo(1000 / 30, 6);
    for (const hz of [30, 40, 45, 60, 90, 120, 144]) {
      draw.mockClear();
      const view = makeView();
      const at: number[] = [];
      for (let t = 1000; t < 3000 - 1e-6; t += 1000 / hz) {
        const before = count('10@game');
        paintTitle(view, DEFAULT_PALETTE, opts(t));
        if (count('10@game') > before) at.push(t);
      }
      expect(at.length, `${hz} Hz: paints in 2 s`).toBeGreaterThanOrEqual(59);
      expect(at.length, `${hz} Hz: paints in 2 s`).toBeLessThanOrEqual(61);
      const gaps = at.slice(1).map((t, i) => t - at[i]!);
      expect(Math.max(...gaps), `${hz} Hz: longest gap`).toBeLessThanOrEqual(1000 / 30 + 1000 / hz + 1e-6);
    }
    // a slow host (or a stalled tab) under 30 Hz paints every frame it gets, and catches up without a burst
    draw.mockClear();
    const view = makeView();
    for (const t of [1000, 1050, 1100, 1400, 1417, 1433, 1450]) paintTitle(view, DEFAULT_PALETTE, opts(t));
    expect(count('10@game')).toBe(5); // 1000, 1050, 1100, 1400, 1433: after the stall back on the 30 Hz beat
  });

  it('repaints the static layers once per entry, resize, language, theme, tones, text size or wallet change — not as time passes', () => {
    const view = makeView();
    let t = run(view, 60, 500);
    expect(count('4@hud')).toBe(1);
    t = run(view, 60, 2000, t);
    expect(count('4@hud'), 'time alone repaints nothing static').toBe(1);
    const changes: [string, () => void][] = [
      ['another screen blanked the layers (re-entry)', () => (blankLayer(view.layers!.ground), blankLayer(view.layers!.hud))],
      ['resize', () => ((view.cssW = 390), (view.cssH = 844), (view.layers!.ground.key = view.layers!.hud.key = ''))],
      ['safe-area insets changed without a resize', () => (view.insets = { top: 47, right: 0, bottom: 34, left: 0 })],
      ['text size', () => setTextScale(1.5)],
    ];
    let expected = 1;
    for (const [why, change] of changes) {
      change();
      t = run(view, 60, 100, t);
      expected++;
      expect([count('1@ground'), count('4@hud')], why).toEqual([expected, expected]);
    }
    for (const [why, o, pal] of [
      ['language', { language: 'az' }, DEFAULT_PALETTE],
      ['theme', { language: 'az', theme: 'theme.dusk' }, DEFAULT_PALETTE],
      ['colour-blind tones', { language: 'az', theme: 'theme.dusk' }, COLOR_BLIND_PALETTE],
      ['gold earned', { language: 'az', theme: 'theme.dusk', gold: 160 }, COLOR_BLIND_PALETTE],
    ] as const) {
      t = run(view, 60, 100, t, o, pal);
      expected++;
      expect([count('1@ground'), count('4@hud')], why).toEqual([expected, expected]);
    }
  });

  it('after a repaint of the static layers the moving part is drawn in the same frame (a resize clears the game canvas)', () => {
    const view = makeView();
    paintTitle(view, DEFAULT_PALETTE, opts(1000));
    paintTitle(view, DEFAULT_PALETTE, opts(1005)); // inside the beat: skipped
    expect(count('10@game')).toBe(1);
    view.layers!.ground.key = view.layers!.hud.key = '';
    paintTitle(view, DEFAULT_PALETTE, opts(1010));
    expect(calls().slice(-3)).toEqual(['1@ground', '4@hud', '10@game']);
  });

  it('a held button, a toast or an overlay drawn by the app: the whole frame every frame, both layers blank; back to layered on release', () => {
    const view = makeView();
    let t = run(view, 60, 200);
    for (const [why, o, over] of [
      ['PLAY held', { pressed: TITLE.play }, false],
      ['a toast', { toast: { text: 'Daily reward', kind: 'ok', t: 0.2 } }, false],
      ['the frame-time overlay', {}, true],
    ] as const) {
      draw.mockClear();
      for (let i = 0; i < 10; i++, t += 1000 / 60) paintTitle(view, DEFAULT_PALETTE, opts(t, { ...o, over }));
      expect(calls(), why).toEqual(Array(10).fill('all@game'));
      expect([view.layers!.ground.key, view.layers!.hud.key], why).toEqual(['', '']);
      draw.mockClear();
      paintTitle(view, DEFAULT_PALETTE, opts(t));
      t += 1000 / 60;
      expect(calls(), `${why} ended`).toEqual(['1@ground', '4@hud', '10@game']);
    }
  });

  it('reduced motion: the single-canvas frame once per change, every other frame skipped, the layers blank', () => {
    setReducedMotionOverride(true);
    const view = makeView();
    let t = run(view, 60, 2000);
    expect(calls()).toEqual(['all@game']);
    expect(view.layers!.ground.key, 'ground layer blank').toBe('');
    t = run(view, 60, 100, t, { soundOn: false });
    expect(calls()).toEqual(['all@game', 'all@game']);
    // another screen's frame or a resize resets the keys (main.ts blankLayer / layers.ts resizeLayers): painted again
    blankLayer(view.layers!.hud);
    run(view, 60, 100, t, { soundOn: false });
    expect(calls()).toEqual(['all@game', 'all@game', 'all@game']);
  });

  it('bakes the two words once per repaint of the static layers and blits them each paint, lifted by whole device pixels', () => {
    const baked: { width: number; height: number }[] = [];
    vi.stubGlobal('document', {
      createElement: () => {
        const c = { width: 0, height: 0, getContext: () => recorder().ctx };
        baked.push(c);
        return c;
      },
    });
    try {
      const view = makeView();
      const blits: [number, number][] = [];
      (view.ctx as unknown as { drawImage: (...a: unknown[]) => void }).drawImage = (_img, x, y) => void blits.push([x as number, y as number]);
      run(view, 60, 1000);
      expect(calls().filter((c) => c.endsWith('@game'))).toEqual(Array(30).fill('2@game')); // the wordmark is not drawn, it is blitted
      expect(baked.length, 'TOWER and CLASH, baked once').toBe(2);
      expect(baked.every((c) => c.width === view.canvas.width && c.height > 0 && c.height < view.canvas.height / 2)).toBe(true);
      expect(blits.length).toBe(60);
      const s = view.dpr * view.scale;
      for (const [k, [x, y]] of blits.entries()) {
        expect(x).toBe(0);
        expect(Number.isInteger(y), 'never resampled').toBe(true);
        const paintAt = 1000 + Math.floor(k / 2) * (1000 / 30); // 30 Hz beat on a 60 Hz display
        expect(y - blits[k % 2]![1]!).toBe(Math.round(wordBob(paintAt, k % 2) * s) - Math.round(wordBob(1000, k % 2) * s));
      }
      setTextScale(1.5); // a static repaint bakes again
      run(view, 60, 100, 3000);
      expect(baked.length).toBe(4);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('without layers (tests, a host that lost them) the whole frame every frame', () => {
    const view = makeView();
    delete view.layers;
    run(view, 60, 100);
    expect(calls()).toEqual(Array(6).fill('all@game'));
  });
});

describe('drawTitle parts (AUD-Q11)', () => {
  it('parts 1 | 2 | 4 | 8 paint, between them, exactly the calls of the whole frame — each part in the whole frame’s order, the ground first', async () => {
    const real = (await vi.importActual<typeof import('../../src/render/menus')>('../../src/render/menus')).drawTitle;
    for (const motion of [true, false]) {
      setReducedMotionOverride(!motion);
      const view = makeView();
      const o = opts(4321);
      const frame = (parts?: number): string[] => {
        const r = recorder();
        real(view, DEFAULT_PALETTE, o, parts, r.ctx);
        // each call opens with save + the logical transform and closes with restore: the frame's bracket
        return r.log.slice(2, -1);
      };
      const whole = frame();
      const parts = [frame(1), frame(2), frame(4), frame(8)];
      expect(parts.every((p) => p.length > 2)).toBe(true);
      // the text alignment the wordmark and the labels share is set by every part: 2 writes × 3 extra parts
      expect(parts.reduce((n, p) => n + p.length, 0), `motion ${motion}: nothing dropped, nothing added`).toBe(whole.length + 6);
      // each part is the whole frame's calls in order (a subsequence), and the ground part is its head
      for (const p of parts) {
        let i = 0;
        for (const call of whole) if (call === p[i]) i++;
        expect(i, `motion ${motion}: part in order`).toBe(p.length);
      }
      expect(parts[0]!.slice(-2)).toEqual(['textAlign=center', 'textBaseline=middle']);
      expect(whole.slice(0, parts[0]!.length - 2)).toEqual(parts[0]!.slice(0, -2));
    }
  });

  /** A word's glyph runs in `log`, each with the fill / stroke style in force (the wordmark's look, shadow copies included). */
  function glyphRuns(log: readonly string[], word: string): string[] {
    let fill = '';
    let stroke = '';
    const out: string[] = [];
    for (const l of log) {
      if (l.startsWith('fillStyle=')) fill = l;
      else if (l.startsWith('strokeStyle=')) stroke = l;
      else if (l.startsWith(`fillText(${word},`) || l.startsWith(`strokeText(${word},`)) out.push(`${l} ${l.startsWith('fill') ? fill : stroke}`);
    }
    return out;
  }

  it('the baked words are the wordmark of part 8 at rest, word by word, and lift by the same bob', async () => {
    const real = (await vi.importActual<typeof import('../../src/render/menus')>('../../src/render/menus')).drawTitle;
    const view = makeView();
    setReducedMotionOverride(true); // at rest: bob 0
    const part8 = recorder();
    real(view, COLOR_BLIND_PALETTE, opts(0), 8, part8.ctx);
    for (const [i, word] of ['TOWER', 'CLASH'].entries()) {
      const baked = recorder();
      drawWord(baked.ctx, COLOR_BLIND_PALETTE, i);
      const runs = glyphRuns(baked.log, word);
      expect(runs.length, `${word}: 3 shadow copies + the word, 9 strokes + 9 fills each`).toBe(4 * 18);
      expect(runs).toEqual(glyphRuns(part8.log, word));
      expect(glyphRuns(baked.log, i ? 'TOWER' : 'CLASH')).toEqual([]);
    }
    // in motion the words of part 8 sit `wordBob` lower than at rest, every glyph run alike
    setReducedMotionOverride(false);
    for (const t of [0, 777, 2500, 6100]) {
      const moving = recorder();
      real(view, COLOR_BLIND_PALETTE, opts(t), 8, moving.ctx);
      for (const [i, word] of ['TOWER', 'CLASH'].entries()) {
        const y = (runs: string[]): number[] => runs.map((r) => Number(/,([-\d.]+)\) /.exec(r)![1]));
        const atRest = y(glyphRuns(part8.log, word));
        const lifted = y(glyphRuns(moving.log, word));
        lifted.forEach((v, k) => expect(v - atRest[k]!, `${word} at ${t} ms`).toBeCloseTo(wordBob(t, i), 1));
      }
    }
  });
});
