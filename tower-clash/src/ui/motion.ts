/**
 * Reduced-motion override (M3-3). `null` = follow the OS `prefers-reduced-motion` media query;
 * `true`/`false` force it. Set from the settings screen (save.settings.reducedMotion) and read by
 * `prefersReducedMotion()` in src/render/particles.ts so every animated helper honours it.
 */
import type { MotionPref } from './save';

let override: boolean | null = null;

export function setReducedMotionOverride(v: boolean | null): void {
  override = v;
}

export function reducedMotionOverride(): boolean | null {
  return override;
}

/** Map the persisted preference onto the override. */
export function applyMotionPref(pref: MotionPref): void {
  setReducedMotionOverride(pref === 'auto' ? null : pref === 'on');
}
