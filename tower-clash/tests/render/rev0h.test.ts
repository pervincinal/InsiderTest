import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameState, Link, Outcome } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { DEFAULT_PALETTE, getPalette } from '../../src/render/palette';
import { FLAT } from '../../src/render/camera';
import type { View } from '../../src/render/view';
import { STREAM_PULSE_MS, drawLinks, linkClockAt, linkPulse } from '../../src/render/draw';
import type { HudPlayUi } from '../../src/render/hud';
import { drawHud, lessonCardLayout } from '../../src/render/hud';
import { MOTION_POLL_MS, motionAllowed } from '../../src/render/particles';
import { motion as menusMotion } from '../../src/render/menus';
import { fitTextLines, withShadow, wrapLines, wrapText } from '../../src/render/widgets';
import { setReducedMotionOverride } from '../../src/ui/motion';
import { validateFields } from '../../scripts/lib/validateLevel';
import { loadAllLevels } from '../../src/levels/index';
import { makeLevel } from '../helpers';

/*
 * Producer review REV-0h (renderer), findings REV-45 … REV-52 (REV-47 and REV-51: hintFontSwap.test.ts,
 * pressRing.test.ts).
 */

/** Canvas stand-in: save / restore with a depth counter, text 12 px per character, every fillText / set recorded. */
function stubCtx(): { ctx: CanvasRenderingContext2D; depth: () => number; texts: { text: string; alpha: number }[]; sets: [string, unknown][] } {
  let store: Record<string | symbol, unknown> = { font: '500 20px sans-serif', globalAlpha: 1 };
  const stack: Record<string | symbol, unknown>[] = [];
  const texts: { text: string; alpha: number }[] = [];
  const sets: [string, unknown][] = [];
  const grad = { addColorStop: () => undefined };
  const fns: Record<string, (...a: unknown[]) => unknown> = {
    save: () => void stack.push({ ...store }),
    restore: () => void (store = stack.pop() ?? store),
    measureText: (s: unknown) => ({ width: String(s).length * 12 }),
    fillText: (s: unknown) => void texts.push({ text: String(s), alpha: store.globalAlpha as number }),
  };
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (typeof key === 'string' && key in fns) return fns[key];
      if (key in store) return store[key];
      return () => grad;
    },
    set(_t, key, value) {
      store[key] = value;
      sets.push([String(key), value]);
      return true;
    },
  });
  return { ctx, depth: () => stack.length, texts, sets };
}

const VIEW = { cssW: 360, cssH: 640, scale: 0.5, offsetX: 0, offsetY: 0, dpr: 1, insets: { top: 0, right: 0, bottom: 0, left: 0 } } as unknown as View;

function hudUi(outcome: Outcome, hud: HudPlayUi['hud'], lesson = 'test'): HudPlayUi {
  return {
    level: makeLevel({ id: 5, lesson }),
    palette: getPalette(false),
    alpha: 0,
    selectedTowerId: null,
    hoverTowerId: null,
    paused: false,
    outcome,
    stars: 0,
    hasNext: true,
    speed: 1,
    coinsEarned: 0,
    coinsTotal: 4321,
    hud,
  };
}

afterEach(() => {
  setReducedMotionOverride(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('REV-45: a blank lesson has no card, never -Infinity geometry', () => {
  const state = createState(makeLevel(), 1); // time 0: the card is up

  it('lessonCardLayout returns null for an empty / whitespace lesson, a finite rect for a real one', () => {
    const { ctx } = stubCtx();
    expect(lessonCardLayout(ctx, state, hudUi('playing', undefined, ''))).toBeNull();
    expect(lessonCardLayout(ctx, state, hudUi('playing', undefined, ' \n\t '))).toBeNull();
    const card = lessonCardLayout(ctx, state, hudUi('playing', undefined, 'Tap a tower'));
    expect(card?.lines).toEqual(['Tap a tower']);
    expect(card?.rect).toEqual({ x: 360 - (11 * 12 + 48) / 2, y: 108, w: 11 * 12 + 48, h: card!.rect.h });
    expect(Number.isFinite(card!.rect.h)).toBe(true);
  });

  it('drawHud with a blank lesson draws no lesson card and no NaN / infinite numbers', () => {
    const { ctx, sets } = stubCtx();
    drawHud(ctx, state, VIEW, hudUi('playing', undefined, ''), 0);
    expect(sets.filter(([, v]) => typeof v === 'number' && !Number.isFinite(v))).toEqual([]);
  });

  it('levels:check rejects a blank lesson, and every shipped level has one', async () => {
    expect(validateFields(makeLevel({ lesson: '  ' }))).toContain('lesson must be a non-empty string');
    expect(validateFields(makeLevel({ lesson: 'Hold the bridge' }))).toEqual([]);
    const levels = await loadAllLevels();
    expect(levels.length).toBe(50);
    expect(levels.filter((l) => l.lesson.trim() === '').map((l) => l.id)).toEqual([]);
  });
});

describe('REV-46: one reduced-motion answer for the world, the HUD and the menus', () => {
  it('the OS answer is re-read every MOTION_POLL_MS (an OS toggle mid-session lands within the cadence)', () => {
    let reduce = false;
    vi.stubGlobal('window', { matchMedia: () => ({ matches: reduce }) });
    const t0 = 1e7;
    expect(motionAllowed(t0)).toBe(true);
    reduce = true;
    expect(motionAllowed(t0 + MOTION_POLL_MS - 1)).toBe(true); // within the cadence: the last answer
    expect(motionAllowed(t0 + MOTION_POLL_MS + 1)).toBe(false); // the flip lands
    reduce = false;
    expect(motionAllowed(t0 + 2 * MOTION_POLL_MS + 2)).toBe(true); // and flips back
    expect(MOTION_POLL_MS).toBe(500);
  });

  it('the settings override applies at once, OS or not', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    setReducedMotionOverride(true);
    expect(motionAllowed(2e7)).toBe(false);
    setReducedMotionOverride(false);
    expect(motionAllowed(2e7 + 1)).toBe(true);
  });

  it("the HUD's targeting rings (and the menus) follow the OS flip on the shared cadence", () => {
    let reduce = false;
    vi.stubGlobal('window', { matchMedia: () => ({ matches: reduce }) });
    const now = vi.spyOn(performance, 'now');
    const state = { ...createState(makeLevel(), 1), time: 10_000 };
    const ui = hudUi('playing', { boosters: [], targeting: true, muted: false });
    const dashOffset = (): number[] => {
      const { ctx, sets } = stubCtx();
      drawHud(ctx, state, VIEW, ui, 3000);
      return sets.filter(([k]) => k === 'lineDashOffset').map(([, v]) => v as number);
    };
    now.mockReturnValue(3e7);
    expect(dashOffset()[0]).toBe(-(3000 / 30) % 24); // moving dashes
    expect(menusMotion()).toBe(true);
    reduce = true;
    now.mockReturnValue(3e7 + MOTION_POLL_MS + 1);
    expect(dashOffset()[0]).toBe(0); // frozen: the HUD no longer keeps a session-long answer
    expect(menusMotion()).toBe(false);
  });
});

describe('REV-48: the stream start pulse keys on the link, not the object', () => {
  const level = makeLevel();
  const link = (createdMs: number): Link => ({ owner: 'player', from: 'p', to: 'e', roadId: Object.keys(createState(level, 1).roads)[0]!, createdMs, emitAccMs: 0, relay: false });
  const drawAt = (links: Link[], time: number, nowMs: number, motion: boolean): void => {
    const s: GameState = { ...createState(level, 1), links, time };
    drawLinks(stubCtx().ctx, DEFAULT_PALETTE, s, nowMs, motion, FLAT);
  };

  it('a link first drawn under reduced motion does not pulse when motion comes back', () => {
    linkClockAt(0);
    drawAt([link(1000)], 1000, 50_000, false);
    expect(linkPulse(link(1000), 50_000 + 100)).toBeGreaterThanOrEqual(100 / STREAM_PULSE_MS);
    expect(linkPulse(link(1000), 50_000 + STREAM_PULSE_MS)).toBeGreaterThanOrEqual(1); // done by the time motion is on
  });

  it('a rewind (cloned links, sim time back) keeps the surviving links done and forgets the ones it undid', () => {
    linkClockAt(0);
    drawAt([link(2000)], 2000, 60_000, true);
    drawAt([link(2000), link(9000)], 9000, 67_000, true);
    expect(linkPulse({ ...link(2000) }, 70_000)).toBeGreaterThan(1); // a clone of a seen link: no second pulse
    drawAt([link(2000)], 4000, 80_000, true); // rewound to 4 s: link(9000) never happened
    expect(linkPulse(link(2000), 80_000)).toBeGreaterThan(1);
    expect(linkPulse(link(9000), 81_000)).toBe(0); // made again after the rewind: a fresh stream pulses
  });

  it('a restart (sim time 0) forgets every link, so the new match pulses its own', () => {
    linkClockAt(0);
    drawAt([link(500)], 500, 90_000, true);
    drawAt([], 0, 95_000, true); // the restarted match's first frame
    expect(linkPulse(link(500), 96_000)).toBe(0);
  });
});

describe('REV-49: withShadow keeps the context balanced when paint throws', () => {
  it('save / restore depth back to 0 and no shadow-ink setter left on the instance', () => {
    const { ctx, depth } = stubCtx();
    expect(() =>
      withShadow(ctx, () => {
        throw new Error('paint');
      }),
    ).toThrow('paint');
    expect(depth()).toBe(0);
    expect(Object.getOwnPropertyDescriptor(ctx, 'fillStyle')).toBeUndefined();
  });

  it('a paint that throws on the second shadow copy also unwinds', () => {
    const { ctx, depth } = stubCtx();
    let n = 0;
    expect(() =>
      withShadow(ctx, () => {
        if (++n === 2) throw new Error('second');
      }),
    ).toThrow('second');
    expect(depth()).toBe(0);
  });
});

describe('REV-50: once over, the bottom band is drawn disabled with or without a wallet', () => {
  const state = { ...createState(makeLevel(), 1), time: 10_000 };
  const coinAlpha = (outcome: Outcome, hud: HudPlayUi['hud']): number[] => {
    const { ctx, texts } = stubCtx();
    drawHud(ctx, state, VIEW, hudUi(outcome, hud), 0);
    return texts.filter((x) => x.text === '4321').map((x) => x.alpha);
  };

  it('playing: the coin pill is live (alpha 1); lost without a wallet: the same pill at the disabled 0.45', () => {
    expect(coinAlpha('playing', { boosters: [], targeting: false, muted: false })).toEqual([1]);
    expect(coinAlpha('lost', { boosters: [], targeting: false, muted: false })).toEqual([0.45]);
    expect(coinAlpha('won', undefined)).toEqual([0.45]);
  });
});

describe('REV-52: a cut is reported, not read off a trailing "…"', () => {
  it('wrapLines: a short text ending in "…" is not cut; an overflowing one is', () => {
    const { ctx } = stubCtx();
    expect(wrapLines(ctx, 'Wait for it…', 600, 1)).toEqual({ lines: ['Wait for it…'], cut: false });
    const long = wrapLines(ctx, 'one two three four five six', 90, 2);
    expect(long).toEqual({ lines: ['one two', 'three…'], cut: true });
    expect(wrapText(ctx, 'one two three four five six', 90, 2)).toEqual(long.lines);
  });

  it('fitTextLines keeps the full size for a text that ends with "…" and fits; shrinks a real cut', () => {
    const { ctx } = stubCtx();
    const f = fitTextLines(ctx, 'Almost there…', 30, 400, 1);
    expect([f.px, f.cut]).toEqual([30, false]);
    expect(fitTextLines(ctx, 'a b c d e f g h i j k l m n o p q r s t u v w x y z '.repeat(4), 30, 200, 1).cut).toBe(true);
  });

  it('a lesson ending in "…" that fits stays on the 20 px step', () => {
    const { ctx } = stubCtx();
    const card = lessonCardLayout(ctx, createState(makeLevel(), 1), hudUi('playing', undefined, 'And then…'));
    expect(card?.px).toBe(20);
    expect(card?.lines).toEqual(['And then…']);
  });
});
