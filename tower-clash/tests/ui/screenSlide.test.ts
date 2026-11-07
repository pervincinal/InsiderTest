import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { View } from '../../src/render/view';
import type { Screen } from '../../src/ui/screens';
import { setReducedMotionOverride } from '../../src/ui/motion';
import { SLIDE_MS, SLIDE_PX, afterDraw, keyIn, resetSlideForTests, setSlideSurfaceForTests, slideDone, slideHeld, slidePose, slides, startSlide } from '../../src/ui/screenSlide';

/*
 * FEEL-1-6: the title ↔ menu slide (src/ui/screenSlide.ts, driven by src/main.ts): which pairs slide, the
 * 120 ms ease-out pose, when it settles, reduced motion, input held back until it settles, and the pairs
 * it never touches (play ↔ result, the lesson card's play screen, the how-to card, the spinner).
 */

type Name = Screen['name'];

interface Call {
  op: string;
  args: unknown[];
  alpha: number;
}

/** A 2D context that records what is drawn (drawImage / clearRect) and at which alpha. */
function fakeCtx(log: Call[]) {
  const ctx = {
    globalAlpha: 1,
    save() {},
    restore() {},
    setTransform() {},
    clearRect(...args: unknown[]) {
      log.push({ op: 'clearRect', args, alpha: ctx.globalAlpha });
    },
    drawImage(...args: unknown[]) {
      log.push({ op: 'drawImage', args, alpha: ctx.globalAlpha });
    },
  };
  return ctx;
}

function fakeCanvas(name: string, log: Call[]) {
  return { name, width: 720, height: 1280, style: { visibility: '' }, getContext: () => fakeCtx(log) };
}

const log: Call[] = [];
const game = fakeCanvas('game', log);
const ground = fakeCanvas('ground', []);
const hudCanvas = fakeCanvas('hud', []);
const view = { canvas: game, ctx: fakeCtx(log), dpr: 2, scale: 0.5, layers: { ground: { canvas: ground }, hud: { canvas: hudCanvas } } } as unknown as View;
let surfaces: ReturnType<typeof fakeCanvas>[] = [];

/** The app shell as main.ts drives it: `go` runs `startSlide` before the switch, every frame `afterDraw`. */
function host(name: Name) {
  return { view, current: { name } as Screen };
}

function go(h: ReturnType<typeof host>, to: Name): void {
  startSlide(h, { name: to });
  h.current = { name: to } as Screen;
}

/** Frames every `step` ms from `t0` until the slide settles; the frame clocks it composited on. */
function run(h: ReturnType<typeof host>, t0: number, step = 1000 / 60): number[] {
  const composited: number[] = [];
  for (let t = t0; t < t0 + 1000; t += step) {
    const before = log.length;
    afterDraw(h, t);
    if (log.length > before) composited.push(t);
    if (slideDone()) break;
  }
  return composited;
}

beforeEach(() => {
  resetSlideForTests();
  setReducedMotionOverride(false);
  surfaces = [];
  setSlideSurfaceForTests(() => {
    const s = fakeCanvas(`surface${surfaces.length}`, []);
    surfaces.push(s);
    return s as unknown as HTMLCanvasElement;
  });
  log.length = 0;
  hudCanvas.style.visibility = '';
});
afterEach(() => {
  setSlideSurfaceForTests(null);
  setReducedMotionOverride(null);
  resetSlideForTests();
});

describe('FEEL-1-6 title ↔ menu slide', () => {
  it('slides between the title and each menu, both ways — never play ↔ result, the how-to card, the spinner or play', () => {
    for (const menu of ['levelSelect', 'shop', 'settings', 'achievements'] as const) {
      expect(slides('title', menu)).toBe(true);
      expect(slides(menu, 'title')).toBe(true);
    }
    const never: [Name, Name][] = [
      ['play', 'result'],
      ['result', 'play'],
      ['title', 'play'],
      ['levelSelect', 'play'],
      ['play', 'levelSelect'],
      ['settings', 'howto'],
      ['howto', 'settings'],
      ['result', 'shop'],
      ['shop', 'result'],
      ['title', 'loading'],
      ['loading', 'shop'],
      ['shop', 'settings'],
      ['title', 'title'],
    ];
    for (const [a, b] of never) expect(slides(a, b), `${a} → ${b}`).toBe(false);
  });

  it('eases out over 120 ms: the incoming screen fades in from 40 logical px below (into a menu) or above (back to the title)', () => {
    expect(SLIDE_MS).toBe(120);
    expect(SLIDE_PX).toBe(40);
    expect(slidePose(0, 1)).toEqual({ alpha: 0, dy: 40 });
    expect(slidePose(SLIDE_MS, 1)).toEqual({ alpha: 1, dy: 0 });
    expect(slidePose(SLIDE_MS * 2, -1)).toEqual({ alpha: 1, dy: -0 });
    const mid = slidePose(SLIDE_MS / 2, -1);
    expect(mid.alpha).toBeCloseTo(0.875, 3); // ease-out cubic: 7/8 of the way at half time
    expect(mid.dy).toBeCloseTo(-5, 3);
    // monotonic, decelerating
    const a = [0, 20, 40, 60, 80, 100, 120].map((ms) => slidePose(ms, 1).alpha);
    for (let i = 1; i < a.length; i++) expect(a[i]!).toBeGreaterThan(a[i - 1]!);
    expect(a[1]! - a[0]!).toBeGreaterThan(a[6]! - a[5]!);
  });

  it('composites 7 frames at 60 Hz and settles on the 8th; the HUD layer is hidden meanwhile and the canvases are freed after', () => {
    const h = host('title');
    go(h, 'shop');
    expect(slideDone()).toBe(false);
    expect(hudCanvas.style.visibility).toBe('hidden');
    // the outgoing frame: ground + game + HUD, bottom to top, into the first offscreen canvas
    expect(surfaces).toHaveLength(2);
    const composited = run(h, 1000);
    expect(composited).toHaveLength(7);
    expect(slideDone()).toBe(true);
    // settled one nominal frame + SLIDE_MS after the outgoing frame: the 8th frame
    expect(hudCanvas.style.visibility).toBe('');
    for (const s of surfaces) expect([s.width, s.height]).toEqual([0, 0]);
    // each composite: the outgoing frame at full alpha, then the incoming one over it at the pose's alpha / offset
    const draws = log.filter((c) => c.op === 'drawImage');
    expect(draws).toHaveLength(14);
    expect(draws[0]!.alpha).toBe(1);
    expect(draws[1]!.alpha).toBeCloseTo(slidePose(1000 / 60, 1).alpha, 6);
    expect(draws[1]!.args[2]).toBe(Math.round(slidePose(1000 / 60, 1).dy * 0.5 * 2));
    expect(draws[13]!.alpha).toBeGreaterThan(0.99);
  });

  it('a slow first frame shortens the slide instead of stretching it (time-based)', () => {
    const h = host('shop');
    go(h, 'title');
    afterDraw(h, 0); // the first frame: one nominal frame after the outgoing one
    afterDraw(h, 130); // a 130 ms frame: past SLIDE_MS — settled, drawn as is
    expect(slideDone()).toBe(true);
  });

  it('reduced motion: a cut, as before (no slide, nothing drawn over the screen)', () => {
    setReducedMotionOverride(true);
    const h = host('title');
    go(h, 'settings');
    expect(slideDone()).toBe(true);
    expect(hudCanvas.style.visibility).toBe('');
    afterDraw(h, 0);
    expect(log).toHaveLength(0);
    expect(surfaces).toHaveLength(0);
  });

  it('play ↔ result, the lesson card (play) and the how-to card never slide; a navigation off a running slide ends it', () => {
    for (const [a, b] of [
      ['play', 'result'],
      ['result', 'play'],
      ['levelSelect', 'play'],
      ['settings', 'howto'],
    ] as [Name, Name][]) {
      const h = host(a);
      go(h, b);
      expect(slideDone(), `${a} → ${b}`).toBe(true);
    }
    const h = host('title');
    go(h, 'levelSelect');
    afterDraw(h, 0);
    expect(slideDone()).toBe(false);
    go(h, 'play'); // e.g. a level started meanwhile
    expect(slideDone()).toBe(true);
    expect(hudCanvas.style.visibility).toBe('');
  });

  it('input reaches the incoming screen only once it has settled', () => {
    const h = host('title');
    go(h, 'shop');
    afterDraw(h, 0);
    // a press that starts during the slide is held back with its moves and release, even after the settle
    expect(slideHeld('down')).toBe(true);
    expect(slideHeld('move')).toBe(true);
    expect(slideHeld('wheel')).toBe(true);
    expect(keyIn(h, { key: 'Escape' } as KeyboardEvent)).toBe(true); // swallowed
    run(h, 0);
    expect(slideDone()).toBe(true);
    expect(slideHeld('move')).toBe(true);
    expect(slideHeld('up')).toBe(true);
    // the next press is delivered whole
    expect(slideHeld('down')).toBe(false);
    expect(slideHeld('move')).toBe(false);
    expect(slideHeld('up')).toBe(false);
    expect(slideHeld('wheel')).toBe(false);
    // a press already down when the slide starts keeps going to the screen (cancel included)
    go(h, 'title');
    expect(slideHeld('cancel')).toBe(false);
  });
});
