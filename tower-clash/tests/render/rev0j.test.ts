import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { GameState, Owner, SimEvent } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { DEFAULT_PALETTE } from '../../src/render/palette';
import { ParticleSystem, loadEconomyBursts } from '../../src/render/particles';
import { drawBadge } from '../../src/render/sprites';
import { setReducedMotionOverride } from '../../src/ui/motion';
import { makeLevel } from '../helpers';

/*
 * Producer review REV-0j (particles and sprites), findings REV-59 … REV-63 (REV-62: tests/render/muster.test.ts;
 * REV-64 is a comment-only change).
 */

const pal = DEFAULT_PALETTE;

function board(): GameState {
  return createState(
    makeLevel({
      towers: [
        { id: 'p', x: 360, y: 1000, owner: 'player', units: 20 },
        { id: 'n', x: 360, y: 700, owner: 'neutral', units: 10 },
        { id: 'e', x: 360, y: 300, owner: 'enemy1', units: 10 },
      ],
    }),
    1,
  );
}

const ATTACKERS: ReadonlyMap<string, Owner> = new Map([['p', 'enemy1']]);

afterEach(() => {
  setReducedMotionOverride(null);
  vi.doUnmock('../../src/lazyChunk');
  vi.resetModules();
});

describe('REV-59: the particle layer follows a Settings "Reduce motion" flip mid-match', () => {
  beforeAll(async () => {
    await loadEconomyBursts();
  });

  it('the same system spawns / stops spawning on the next call, both directions (eager spawners and the lazy tank burst)', () => {
    const state = board();
    const tank: SimEvent = { type: 'landed', towerId: 'n', owner: 'player', weight: 5, hostile: true };
    setReducedMotionOverride(false);
    const fx = new ParticleSystem();
    expect(fx.reducedMotion).toBe(false);
    fx.impact(0, 0, '#ff0000');
    expect(fx.count).toBe(6); // ring + flash + 4 sparks
    setReducedMotionOverride(true); // pause → Settings → on → back, same PlayScreen
    expect(fx.reducedMotion).toBe(true);
    fx.impact(0, 0, '#ff0000');
    fx.step('c', 0, 0, '#888888', 1000);
    fx.onEvents([tank], state, pal, 1000);
    expect(fx.count).toBe(6);
    setReducedMotionOverride(false); // and back off
    expect(fx.reducedMotion).toBe(false);
    fx.onEvents([tank], state, pal, 2000);
    expect(fx.count).toBe(6 + 9); // AUD-F10 tank: ring + pulse + flash + 6 sparks
  });

  it('the badge jolt follows too; a pinned system (constructor flag) does not', () => {
    const state = board();
    setReducedMotionOverride(false);
    const fx = new ParticleSystem();
    state.time = 1000;
    state.towers.p!.underFireUntilMs = 1500;
    fx.landings(state, ATTACKERS, pal, 1000);
    expect(fx.badgeHit('p', 1030)).not.toBe(0);
    setReducedMotionOverride(true);
    expect(fx.badgeHit('p', 1030)).toBe(0);
    setReducedMotionOverride(false);
    expect(fx.badgeHit('p', 1030)).not.toBe(0);
    expect(new ParticleSystem(true).reducedMotion).toBe(true);
    setReducedMotionOverride(true);
    expect(new ParticleSystem(false).reducedMotion).toBe(false);
  });
});

describe('REV-61: a Continue rewind does not fire a ring / jolt on every tower under fire', () => {
  it('state.time going back resyncs the deadlines silently; a real landing afterwards still bursts', () => {
    const state = board();
    const fx = new ParticleSystem(false);
    let tokens = 0;
    const take = fx.takeLandToken.bind(fx);
    fx.takeLandToken = (now) => (tokens++, take(now));
    const p = state.towers.p!;
    const e = state.towers.e!;
    // the abandoned future: both towers under fire at 30 s
    state.time = 30_000;
    p.underFireUntilMs = 30_500;
    e.underFireUntilMs = 30_400;
    fx.landings(state, new Map([...ATTACKERS, ['e', 'player']]), pal, 1000);
    expect(tokens).toBe(2);
    const before = fx.count;
    // the Continue: back 20 s, both still under fire at the restored moment (other deadlines)
    state.time = 10_000;
    p.underFireUntilMs = 10_300;
    e.underFireUntilMs = 10_200;
    fx.landings(state, ATTACKERS, pal, 5000);
    expect(fx.count).toBe(before);
    expect(tokens).toBe(2);
    expect(fx.badgeHit('p', 5030)).toBe(0);
    expect(fx.badgeHit('e', 5030)).toBe(0);
    expect(fx.fire.get('p')!.until).toBe(10_300); // resynced: the same deadline next frame is no landing either
    state.time = 10_050;
    fx.landings(state, ATTACKERS, pal, 5050);
    expect(fx.count).toBe(before);
    // a real landing after the rewind
    p.underFireUntilMs = 10_550;
    fx.landings(state, ATTACKERS, pal, 5100);
    expect(tokens).toBe(3);
    expect(fx.count).toBe(before + 6);
    expect(fx.badgeHit('p', 5130)).not.toBe(0);
    expect(fx.badgeHit('e', 5130)).toBe(0);
  });
});

describe('REV-60: a failed economy-chunk download is retried by later draws, after the back-off', () => {
  it('fails once → no retry inside the back-off window → the first draw after it loads the chunk, then no more loads', async () => {
    let now = 0;
    let failedAt = -Infinity;
    let fail = true;
    const calls: number[] = [];
    vi.resetModules();
    vi.doMock('../../src/lazyChunk', async (importOriginal) => {
      const real = await importOriginal<typeof import('../../src/lazyChunk')>();
      return {
        ...real,
        loadChunk: <T extends object>(key: string, load: () => Promise<T>, expect: keyof T & string): Promise<T> => {
          if (key !== 'particlesEconomy') return real.loadChunk(key, load, expect);
          calls.push(now);
          if (fail) {
            fail = false;
            failedAt = now;
            return Promise.reject(new Error('Failed to fetch dynamically imported module'));
          }
          return load();
        },
        chunkBackoff: (key: string) => (key === 'particlesEconomy' ? now - failedAt < real.RETRY_AFTER_MS : real.chunkBackoff(key)),
      };
    });
    const { ParticleSystem: PS, loadEconomyBursts: load } = await import('../../src/render/particles');
    const { RETRY_AFTER_MS } = await import('../../src/lazyChunk');
    const fx = new PS(false);
    const ctx = {} as CanvasRenderingContext2D; // no particles: `draw` only warms the chunk
    const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
    fx.draw(ctx, 0); // the first frame warms it: the download fails
    await settle();
    expect(calls).toEqual([0]);
    for (let t = 16; t < RETRY_AFTER_MS; t += 16) {
      now = t;
      fx.draw(ctx, t);
    }
    await settle();
    expect(calls).toHaveLength(1); // no tight retry loop inside the back-off window
    now = RETRY_AFTER_MS;
    fx.draw(ctx, now); // the first frame after it retries (it used to be never)
    expect(calls).toEqual([0, RETRY_AFTER_MS]);
    await load();
    for (let t = now; t < now + 3 * RETRY_AFTER_MS; t += 500) fx.draw(ctx, t);
    expect(calls).toHaveLength(2); // loaded: never fetched again
    // and it is really in: a tank landing bursts through the chunk (9 particles, a soldier's would be 6)
    const state = board();
    fx.onEvents([{ type: 'landed', towerId: 'n', owner: 'player', weight: 5, hostile: true }], state, pal, now);
    expect(fx.count).toBe(9);
  });
});

describe('REV-63: drawBadge restores the caller\'s alpha after the capture-flash halo', () => {
  function ctxAt(alpha: number): { ctx: CanvasRenderingContext2D; strokes: number[] } {
    const store: Record<string | symbol, unknown> = { globalAlpha: alpha, font: '' };
    const strokes: number[] = [];
    const ctx = new Proxy({} as CanvasRenderingContext2D, {
      get(_t, key) {
        if (key in store) return store[key];
        if (key === 'measureText') return (s: string) => ({ width: s.length * 14 });
        if (key === 'stroke') return () => void strokes.push(store.globalAlpha as number);
        return () => undefined;
      },
      set(_t, key, value) {
        store[key] = value;
        return true;
      },
    });
    return { ctx, strokes };
  }

  it('a badge drawn at 0.5 alpha: the halo at 0.5 × flash, the alpha back at 0.5 after', () => {
    const { ctx, strokes } = ctxAt(0.5);
    drawBadge(ctx, pal, 100, 100, '12', false, { flash: 0.8 });
    expect(strokes).toContain(0.5 * 0.8);
    expect(ctx.globalAlpha).toBe(0.5);
    const full = ctxAt(1);
    drawBadge(full.ctx, pal, 100, 100, '12', false, { flash: 0.8 });
    expect(full.ctx.globalAlpha).toBe(1);
    expect(full.strokes).toContain(0.8);
  });
});
