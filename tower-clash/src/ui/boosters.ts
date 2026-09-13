import type { GameState } from '../sim/types';
import { C } from '../sim/constants';

/*
 * Booster bar model (M3-1, GDD §2.6). Pure helpers over the sim state and the coin balance; the
 * HUD draws from `BoosterStatus`, the play screen decides with `canUseBooster`. Boosters are bought
 * per use with save coins; at most one of each timed type may be active at a time.
 */

export const BOOSTER_KINDS = ['overdrive', 'freeze', 'airstrike'] as const;
export type BoosterKind = (typeof BOOSTER_KINDS)[number];

export const BOOSTER_INFO: Record<BoosterKind, { label: string; hint: string; durationMs: number }> = {
  overdrive: { label: 'OVERDRIVE', hint: `×${C.OVERDRIVE_MUL} production for ${C.OVERDRIVE_MS / 1000} s`, durationMs: C.OVERDRIVE_MS },
  freeze: { label: 'FREEZE', hint: `Enemies stop producing for ${C.FREEZE_MS / 1000} s`, durationMs: C.FREEZE_MS },
  airstrike: { label: 'AIRSTRIKE', hint: `−${C.AIRSTRIKE_DAMAGE} units on one enemy tower`, durationMs: 0 },
};

export interface BoosterStatus {
  kind: BoosterKind;
  cost: number;
  affordable: boolean;
  /** Timed booster still running for the player. */
  active: boolean;
  /** Sim ms left (0 when inactive) and the full duration, for the cooldown ring. */
  remainingMs: number;
  durationMs: number;
}

export function boosterStatus(state: Pick<GameState, 'boosters' | 'time'>, kind: BoosterKind, coins: number): BoosterStatus {
  const cost = C.BOOSTER_COST[kind];
  const durationMs = BOOSTER_INFO[kind].durationMs;
  let remainingMs = 0;
  if (kind !== 'airstrike') {
    for (const b of state.boosters) {
      if (b.type === kind && b.owner === 'player') remainingMs = Math.max(remainingMs, b.untilMs - state.time);
    }
  }
  return { kind, cost, affordable: coins >= cost, active: remainingMs > 0, remainingMs, durationMs };
}

export function allBoosterStatus(state: Pick<GameState, 'boosters' | 'time'>, coins: number): BoosterStatus[] {
  return BOOSTER_KINDS.map((k) => boosterStatus(state, k, coins));
}

/** A booster may be bought when affordable and no instance of it is still running. */
export function canUseBooster(state: Pick<GameState, 'boosters' | 'time'>, kind: BoosterKind, coins: number): boolean {
  const s = boosterStatus(state, kind, coins);
  return s.affordable && !s.active;
}
