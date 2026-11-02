/**
 * AUD-F9: the result card's animation timeline — one source for the card (src/render/hudOverlays.ts) and for
 * the sounds that follow it (src/audio/resultCues.ts). Milliseconds from the card's first frame (`since`
 * in hud.ts: the result screen's first frame, after the 600 ms result beat; 10 000 under reduced motion,
 * everything settled). Pure: no DOM, no imports. Lazy: only the two lazy chunks above import it.
 */
export const RESULT_TIMELINE = Object.freeze({
  /** The card slides up with `easeOutBack` over this. */
  slideMs: 460,
  /** Star `i` starts popping at `starMs + i × starGapMs` and scales in with `easeOutBack` over `starPopMs`. */
  starMs: 420,
  starGapMs: 260,
  starPopMs: 380,
  /** The gold counts up with `easeOutCubic` from `goldMs` over `goldCountMs`; the label pops round `goldPopMs`. */
  goldMs: 900,
  goldCountMs: 800,
  goldPopMs: 1700,
});

/** `easeOutBack`'s overshoot constant (hudOverlays.ts) and where the curve first reaches 1: 1 − c1 / (c1 + 1) ≈ 0.370. */
const BACK_C1 = 1.70158;
export const BACK_REACH = 1 - BACK_C1 / (BACK_C1 + 1);

/** Ease-out with overshoot, for pop-in animations. t in 0..1. */
export function easeOutBack(t: number): number {
  const c3 = BACK_C1 + 1;
  const u = Math.max(0, Math.min(1, t)) - 1;
  return 1 + c3 * u * u * u + BACK_C1 * u * u;
}

/** Smooth ease-out (cubic). t in 0..1. */
export function easeOutCubic(t: number): number {
  const u = 1 - Math.max(0, Math.min(1, t));
  return 1 - u * u * u;
}

/** Star `i`'s pop progress at `since` (0 = not started, ≥ 1 = settled; `drawStarPop`'s `t`). */
export function starPopT(since: number, i: number): number {
  const T = RESULT_TIMELINE;
  return (since - T.starMs - i * T.starGapMs) / T.starPopMs;
}

/** When star `i` first reaches full size — its impact, where its chord lands (≈ 561 / 821 / 1 081 ms). */
export function starLandMs(i: number): number {
  const T = RESULT_TIMELINE;
  return T.starMs + i * T.starGapMs + BACK_REACH * T.starPopMs;
}

/** When the sliding card first reaches its resting place (≈ 170 ms) — the defeat chord. */
export const CARD_LAND_MS = BACK_REACH * RESULT_TIMELINE.slideMs;

/** The count-up's progress at `since` (0..1). */
export function goldCountT(since: number): number {
  return easeOutCubic((since - RESULT_TIMELINE.goldMs) / RESULT_TIMELINE.goldCountMs);
}

/** The gold the label shows at `since` for `coins` earned. */
export function goldShown(since: number, coins: number): number {
  return Math.round(coins * goldCountT(since));
}

/** When the label first shows `n` (1 ≤ n ≤ coins): the inverse of `goldShown` (it rounds, so n − ½ of the way). */
export function goldStepMs(n: number, coins: number): number {
  const T = RESULT_TIMELINE;
  return T.goldMs + T.goldCountMs * (1 - Math.cbrt(1 - Math.min(1, (n - 0.5) / coins)));
}
