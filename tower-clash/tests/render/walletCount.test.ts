import { describe, expect, it } from 'vitest';
import type { GameState } from '../../src/sim/types';
import { createState } from '../../src/sim/create';
import { DEFAULT_PALETTE } from '../../src/render/palette';
import type { HudPlayUi } from '../../src/render/hud';
import { HUD } from '../../src/render/layout';
import { HUD_OVERLAYS } from '../../src/render/hudOverlays';
import { RESULT_TIMELINE as TL, WALLET_COINS, goldShown, walletCoinT, walletShown } from '../../src/render/resultTimeline';
import { makeLevel } from '../helpers';

/*
 * AUD-F14: the result wallet no longer gives the reward away before the count-up — it holds the pre-match
 * balance until the card's gold starts counting (900 ms), then counts in step with the card's "+n" and shows
 * the new total from the count's end (1700 ms); WALLET_COINS coins fly from the card's gold line to the
 * wallet during the count (motion only). The star / gold timings are unchanged.
 */

interface Op {
  fn: string;
  args: number[];
}

function recCtx(): { ctx: CanvasRenderingContext2D; ops: Op[] } {
  const store: Record<string | symbol, unknown> = {};
  const ops: Op[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key === 'measureText') return (s: string) => ({ width: s.length * 10 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop: () => undefined });
      if (key in store) return store[key];
      return (...args: unknown[]) => void ops.push({ fn: String(key), args: args.filter((a): a is number => typeof a === 'number') });
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
  return { ctx, ops };
}

function ui(state: GameState, wallet = true): HudPlayUi {
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
    coinsTotal: 230,
    clockMs: state.time,
    hud: {
      boosters: [],
      targeting: false,
      muted: false,
      result: { crystalsEarned: 0, notes: [], replayCapped: false, doubleGold: null, doubled: false, continueCrystals: null, continueAd: false, skipCrystals: null, pending: false, tip: null, howto: false },
      wallet: wallet ? { gold: 200, crystals: 5, bottom: 40 } : undefined,
    },
  };
}

describe('the wallet over the result timeline', () => {
  it('holds the pre-match balance until the count-up starts, counts in step with the card, ends on the total', () => {
    const total = 230;
    const earned = 30;
    for (const t of [0, 34, 500, 800, TL.goldMs]) expect(walletShown(t, total, earned), `${t} ms`).toBe(200);
    for (let t = TL.goldMs; t <= TL.goldMs + TL.goldCountMs; t += 20) expect(walletShown(t, total, earned)).toBe(200 + goldShown(t, earned));
    expect(walletShown(1300, total, earned)).toBeGreaterThan(200);
    expect(walletShown(1300, total, earned)).toBeLessThan(230);
    expect(walletShown(TL.goldMs + TL.goldCountMs, total, earned)).toBe(230);
    expect(walletShown(10_000, total, earned)).toBe(230);
    // reduced motion (the card settled at once): the total straight away
    expect(walletShown(Infinity, total, earned)).toBe(230);
    // nothing earned (a defeat, a replay at the cap): the balance as it is
    expect(walletShown(0, 230, 0)).toBe(230);
  });

  it('the star and gold timings are unchanged', () => {
    expect(TL).toMatchObject({ slideMs: 460, starMs: 420, starGapMs: 260, starPopMs: 380, goldMs: 900, goldCountMs: 800, goldPopMs: 1700 });
  });

  it(`${WALLET_COINS} coins fly ${TL.coinFlyMs} ms each, staggered, the last landing as the count ends`, () => {
    expect(WALLET_COINS).toBe(3);
    expect(TL.coinFlyMs).toBe(300);
    const inAir = (t: number) => [0, 1, 2].filter((i) => walletCoinT(t, i) !== null);
    expect(inAir(800)).toEqual([]);
    expect(inAir(TL.goldMs)).toEqual([0]);
    expect(inAir(1300)).toEqual([1]);
    expect(walletCoinT(1300, 1)).toBeCloseTo(0.5, 9);
    expect(inAir(1450)).toEqual([2]);
    expect(TL.goldMs + (WALLET_COINS - 1) * TL.coinGapMs + TL.coinFlyMs).toBe(TL.goldMs + TL.goldCountMs);
    expect(inAir(TL.goldMs + TL.goldCountMs)).toEqual([]);
    expect(inAir(10_000)).toEqual([]);
  });
});

describe('the coins on the result card (lazy hudOverlays chunk)', () => {
  const state = createState(makeLevel(), 1);
  const draw = (since: number, wallet = true) => {
    const { ctx, ops } = recCtx();
    HUD_OVERLAYS.result(ctx, state, ui(state, wallet), since);
    return ops;
  };

  it('in flight during the count: extra coin drawing between the card and the wallet, landing on its coin', () => {
    const extra = draw(1300).length - draw(1300, false).length;
    expect(extra).toBeGreaterThan(0);
    // at 1450 the last coin has just left; at 1699 it is on the wallet's coin (bottom band anchor 40)
    const near = (ops: Op[], x: number, y: number) => ops.some((o) => (o.fn === 'arc' || o.fn === 'ellipse') && Math.hypot(o.args[0]! - x, o.args[1]! - y) < 4);
    expect(near(draw(1699), HUD.wallet.x + HUD.wallet.h / 2 + 2, HUD.wallet.y + HUD.wallet.h / 2 + 40)).toBe(true);
  });

  it('none before the count, after it, or under reduced motion (the settled card: since 10 000)', () => {
    for (const since of [800, 1700, 10_000]) expect(draw(since).length, `${since} ms`).toBe(draw(since, false).length);
  });
});
