import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { DEFAULT_PALETTE } from '../../src/render/palette';
import type { View } from '../../src/render/view';
import type { HudPlayUi } from '../../src/render/hud';
import { resetChunkFailuresForTests } from '../../src/lazyChunk';
import { t } from '../../src/ui/i18n';
import { makeLevel } from '../helpers';

/*
 * PERF-6: the pause menu and the result card live in a lazy chunk (`import('./hudOverlays')`).
 * Like the silhouette skins (tests/render/skinChunk.test.ts) a failed download must leave the game
 * drawable — a plain card with the same buttons, never a throw — and be retried later; once the
 * chunk is in, `drawOverlays` draws through it on every frame.
 */

const CHUNK = '../../src/render/hudOverlays';
type Chunk = typeof import('../../src/render/hudOverlays');

interface RecordingCtx extends CanvasRenderingContext2D {
  texts: string[];
}

function fakeCtx(): RecordingCtx {
  const store: Record<string | symbol, unknown> = {};
  const texts: string[] = [];
  return new Proxy({} as RecordingCtx, {
    get(_t, key) {
      if (key === 'texts') return texts;
      if (key === 'measureText') return (s: string) => ({ width: s.length * 10 });
      if (key === 'fillText') return (s: string) => void texts.push(s);
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
      if (key in store) return store[key];
      return () => undefined;
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
}

function ui(state: GameState, over: Partial<HudPlayUi> = {}): HudPlayUi {
  return {
    level: makeLevel(),
    palette: DEFAULT_PALETTE,
    alpha: 0,
    selectedTowerId: null,
    hoverTowerId: null,
    paused: false,
    outcome: 'won',
    stars: 2,
    hasNext: true,
    speed: 1,
    coinsEarned: 30,
    coinsTotal: 130,
    clockMs: state.time,
    hud: {
      boosters: [],
      targeting: false,
      muted: false,
      result: { crystalsEarned: 0, notes: [], replayCapped: false, doubleGold: 30, doubled: false, continueCrystals: null, continueAd: false, skipCrystals: null, pending: false, tip: null, howto: false },
    },
    ...over,
  };
}

afterEach(() => {
  vi.doUnmock(CHUNK);
  vi.resetModules();
  resetChunkFailuresForTests();
});

describe('hudOverlays lazy chunk (PERF-6)', () => {
  it('a failed chunk download draws the plain result / pause cards without throwing; the chunk is retried and then draws every frame', async () => {
    vi.resetModules();
    let attempts = 0;
    const result = vi.fn();
    const pause = vi.fn();
    vi.doMock(CHUNK, async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      const actual = await vi.importActual<Chunk>(CHUNK);
      result.mockImplementation(actual.HUD_OVERLAYS.result);
      pause.mockImplementation(actual.HUD_OVERLAYS.pause);
      return { ...actual, HUD_OVERLAYS: { result, pause } };
    });
    const hud = await import('../../src/render/hud');
    await expect(hud.loadHudOverlays()).rejects.toThrow();
    expect(hud.hudOverlaysLoaded()).toBe(false);
    expect(attempts).toBe(1);

    const state = createState(makeLevel(), 1);
    const view = {} as View;
    // plain result card while the chunk is missing: outcome, time, the three buttons and the visible offer — no throw, no await
    const won = fakeCtx();
    expect(() => hud.drawOverlays(won, state, view, ui(state), 1000)).not.toThrow();
    expect(won.texts).toContain(t('result.victory'));
    expect(won.texts).toContain(t('result.time', { time: '00:00' }));
    for (const key of ['common.next', 'common.retry', 'common.menu'] as const) expect(won.texts).toContain(t(key));
    expect(won.texts.some((s) => s.startsWith(t('result.doubleGold', { n: 30 })))).toBe(true);
    const lost = fakeCtx();
    expect(() => hud.drawOverlays(lost, state, view, ui(state, { outcome: 'lost', stars: 0 }), 1000)).not.toThrow();
    expect(lost.texts).toContain(t('result.defeat'));
    const paused = fakeCtx();
    expect(() => hud.drawOverlays(paused, state, view, ui(state, { paused: true, outcome: 'playing' }), 1000)).not.toThrow();
    expect(paused.texts).toContain(t('pause.title'));
    expect(paused.texts).toContain(t('pause.resume'));
    expect(result).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
    // draw time backs off after the failure instead of re-fetching every frame
    expect(attempts).toBe(1);
    hud.warmHudOverlays();
    expect(attempts).toBe(1);

    // an explicit load (the play screen's next warm after the back-off) resolves with the real drawers
    const drawers = await hud.loadHudOverlays();
    expect(attempts).toBe(2);
    expect(hud.hudOverlaysLoaded()).toBe(true);
    expect(await hud.loadHudOverlays()).toBe(drawers); // cached
    expect(attempts).toBe(2);

    // from now on every overlay frame goes through the chunk, with the frame's arguments
    const real = fakeCtx();
    const wonUi = ui(state);
    hud.drawOverlays(real, state, view, wonUi, 2000);
    expect(result).toHaveBeenCalledTimes(1);
    const [ctxArg, stateArg, uiArg, since] = result.mock.calls[0] ?? [];
    expect(ctxArg).toBe(real);
    expect(stateArg).toBe(state);
    expect(uiArg).toBe(wonUi);
    expect(typeof since).toBe('number');
    expect(real.texts).toContain(t('result.victory'));
    hud.drawOverlays(real, state, view, ui(state, { paused: true, outcome: 'playing' }), 2000);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('warmHudOverlays starts the download once and never rejects; the first overlay frame after it lands is the real card', async () => {
    vi.resetModules();
    let attempts = 0;
    const result = vi.fn();
    vi.doMock(CHUNK, async () => {
      attempts += 1;
      const actual = await vi.importActual<Chunk>(CHUNK);
      result.mockImplementation(actual.HUD_OVERLAYS.result);
      return { ...actual, HUD_OVERLAYS: { result, pause: actual.HUD_OVERLAYS.pause } };
    });
    const hud = await import('../../src/render/hud');
    hud.warmHudOverlays();
    hud.warmHudOverlays();
    await hud.loadHudOverlays();
    expect(attempts).toBe(1);
    const state = createState(makeLevel(), 1);
    hud.drawOverlays(fakeCtx(), state, {} as View, ui(state, { outcome: 'lost', stars: 0 }), 500);
    expect(result).toHaveBeenCalledTimes(1);
  });
});
