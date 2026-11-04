import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayUi } from '../../src/render/draw';
import { drawGame } from '../../src/render/draw';
import { DEFAULT_PALETTE } from '../../src/render/palette';
import { ParticleSystem } from '../../src/render/particles';
import type { View } from '../../src/render/view';
import { createState } from '../../src/sim/create';
import { setReducedMotionOverride } from '../../src/ui/motion';
import { defaultSave, normalizeSave } from '../../src/ui/save';
import { makeLevel } from '../helpers';

/*
 * AUD-F18: Settings → Screen shake (`settings.shake`, absent = on) switches the capture shake of the world
 * off on its own; reduced motion still turns it off whatever the setting says. The shake is the world's
 * translate before the terrain (draw.ts `drawGame`); the HUD never shook.
 */

interface Recorded {
  /** Every method called, in order (`translate` with its arguments). */
  calls: string[];
}

/** A canvas context that accepts every call and records them. */
function recordingCtx(rec: Recorded): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = {};
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key === 'measureText') return (s: string) => ({ width: s.length * 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 });
      if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (key === 'createLinearGradient' || key === 'createRadialGradient' || key === 'createPattern') return () => ({ addColorStop: () => undefined });
      if (key in store) return store[key];
      return (...args: unknown[]) => {
        rec.calls.push(key === 'translate' ? `translate ${args.join(',')}` : String(key));
      };
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
}

// the terrain cache and the sprite caches draw into offscreen canvases: give them recording ones
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => recordingCtx({ calls: [] }) }) });
const level = makeLevel();
let clock = 0;
vi.spyOn(performance, 'now').mockImplementation(() => clock);
const NOW = 10_000;

/** One frame 60 ms into a capture shake (`ParticleSystem.shake` at its full SHAKE_PX), the shake setting as given. */
function frame(shake: boolean | undefined): string[] {
  clock += 1000; // draw.ts re-reads the motion preference at most every 500 ms
  const rec: Recorded = { calls: [] };
  const ctx = recordingCtx(rec);
  const view = { canvas: { width: 360, height: 640 }, ctx, dpr: 1, cssW: 360, cssH: 640, scale: 0.5, offsetX: 0, offsetY: 0, insets: { top: 0, right: 0, bottom: 0, left: 0 } } as unknown as View;
  const particles = new ParticleSystem();
  particles.shakeAt = NOW - 60;
  const ui: PlayUi = {
    level,
    palette: DEFAULT_PALETTE,
    alpha: 0,
    selectedTowerId: null,
    paused: false,
    outcome: 'playing',
    stars: 0,
    hasNext: true,
    speed: 1,
    coinsEarned: 0,
    coinsTotal: 0,
    particles,
    shake,
  } as PlayUi;
  drawGame(ctx, createState(level, 1), view, ui, NOW);
  return rec.calls;
}

/**
 * The world shake (draw.ts `drawGame`): the world is clipped to the map's rows (`clip`), a `save`, then the
 * shake's `translate` when there is one — before anything of the world is drawn. Returns that offset or null.
 */
function worldShake(calls: string[]): [number, number] | null {
  const at = calls.indexOf('clip');
  expect(at, 'the world clip is in the frame').toBeGreaterThanOrEqual(0);
  expect(calls[at + 1]).toBe('save');
  const next = calls[at + 2] ?? '';
  if (!next.startsWith('translate ')) return null;
  const [x, y] = next.slice(10).split(',').map(Number);
  return [x!, y!];
}
const shook = (calls: string[]) => worldShake(calls) !== null;

afterEach(() => {
  setReducedMotionOverride(null);
});

describe('AUD-F18 Screen shake setting', () => {
  it('the probe works: the shake is in the frame by default (absent = on) and with the setting on', () => {
    const p = new ParticleSystem();
    p.shakeAt = NOW - 60;
    const s = p.shake(NOW);
    expect(Math.hypot(s.dx, s.dy)).toBeGreaterThan(0.5);
    const on = worldShake(frame(undefined));
    expect(on, 'absent = on').not.toBeNull();
    expect(Math.hypot(...on!)).toBeGreaterThan(0.5);
    expect(shook(frame(true)), 'on').toBe(true);
  });

  it('setting off: no world shake, while reduced motion is off', () => {
    setReducedMotionOverride(false);
    expect(shook(frame(false))).toBe(false);
  });

  it('reduced motion still forces it off with the setting on', () => {
    setReducedMotionOverride(true);
    expect(shook(frame(true))).toBe(false);
  });

  it('the save keeps the boolean (absent = on), drops anything else; the default save has none', () => {
    expect(defaultSave().settings.shake).toBeUndefined();
    const base = defaultSave();
    expect(normalizeSave({ ...base, settings: { ...base.settings, shake: false } }).settings.shake).toBe(false);
    expect(normalizeSave({ ...base, settings: { ...base.settings, shake: true } }).settings.shake).toBe(true);
    expect(normalizeSave({ ...base, settings: { ...base.settings, shake: 'no' } }).settings.shake).toBeUndefined();
  });
});
