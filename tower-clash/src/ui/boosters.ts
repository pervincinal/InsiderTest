import type { GameState } from '../sim/types';
import { C } from '../sim/constants';

/*
 * Booster bar model (M3-1, GDD §2.6; ECONOMY.md §3.1). Pure helpers over the sim state and the
 * wallet; the HUD draws from `BoosterStatus`, the play screen decides with `canUseBooster`.
 * Boosters are bought per use with gold (discounted by the commander track / premium) or paid with
 * a pre-paid charge (crate, rewarded video) which is consumed first. At most one of each timed
 * type may be active at a time.
 */

export const BOOSTER_KINDS = ['overdrive', 'freeze', 'airstrike'] as const;
export type BoosterKind = (typeof BOOSTER_KINDS)[number];

export const BOOSTER_INFO: Record<BoosterKind, { label: string; hint: string; durationMs: number }> = {
  overdrive: { label: 'OVERDRIVE', hint: `×${C.OVERDRIVE_MUL} production for ${C.OVERDRIVE_MS / 1000} s`, durationMs: C.OVERDRIVE_MS },
  freeze: { label: 'FREEZE', hint: `Enemies stop producing for ${C.FREEZE_MS / 1000} s`, durationMs: C.FREEZE_MS },
  airstrike: { label: 'AIRSTRIKE', hint: `−${C.AIRSTRIKE_DAMAGE} units on one enemy tower`, durationMs: 0 },
};

/** What the player can pay with: gold balance, discounted prices, pre-paid charges, rewarded offer. */
export interface BoosterWallet {
  gold: number;
  prices?: Partial<Record<BoosterKind, number>>;
  charges?: Partial<Record<BoosterKind, number>>;
  /** A rewarded video for a free charge is available (shown only on unaffordable boosters). */
  adOffer?: boolean;
}

export interface BoosterStatus {
  kind: BoosterKind;
  /** Gold price after discounts. */
  cost: number;
  /** Pre-paid charges (consumed before gold). */
  charges: number;
  /** Payable: a charge or enough gold. */
  affordable: boolean;
  /** Unaffordable and a rewarded video would give a free charge. */
  adOffer: boolean;
  /** Timed booster still running for the player. */
  active: boolean;
  /** Sim ms left (0 when inactive) and the full duration, for the cooldown ring. */
  remainingMs: number;
  durationMs: number;
}

/**
 * Normalise the wallet argument. A missing wallet (a plumbing mistake upstream — BUG-3) reads as
 * "no gold, no charges" instead of throwing inside the draw loop and freezing the game.
 */
function walletOf(w: number | BoosterWallet | undefined): BoosterWallet {
  return typeof w === 'number' ? { gold: w } : (w ?? { gold: 0 });
}

export function boosterStatus(state: Pick<GameState, 'boosters' | 'time'>, kind: BoosterKind, wallet: number | BoosterWallet): BoosterStatus {
  const w = walletOf(wallet);
  const cost = w.prices?.[kind] ?? C.BOOSTER_COST[kind];
  const charges = Math.max(0, w.charges?.[kind] ?? 0);
  const durationMs = BOOSTER_INFO[kind].durationMs;
  let remainingMs = 0;
  if (kind !== 'airstrike') {
    for (const b of state.boosters) {
      if (b.type === kind && b.owner === 'player') remainingMs = Math.max(remainingMs, b.untilMs - state.time);
    }
  }
  const affordable = charges > 0 || w.gold >= cost;
  return { kind, cost, charges, affordable, adOffer: !affordable && w.adOffer === true, active: remainingMs > 0, remainingMs, durationMs };
}

export function allBoosterStatus(state: Pick<GameState, 'boosters' | 'time'>, wallet: number | BoosterWallet): BoosterStatus[] {
  return BOOSTER_KINDS.map((k) => boosterStatus(state, k, wallet));
}

/** A booster may be bought when affordable and no instance of it is still running. */
export function canUseBooster(state: Pick<GameState, 'boosters' | 'time'>, kind: BoosterKind, wallet: number | BoosterWallet): boolean {
  const s = boosterStatus(state, kind, wallet);
  return s.affordable && !s.active;
}
