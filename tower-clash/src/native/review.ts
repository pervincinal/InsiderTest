import { isNative } from './index';
import type { SaveData } from '../ui/save';
import { writeSave } from '../ui/save';

/**
 * Rating prompt (MM-9, POST_LAUNCH.md §6 roadmap, docs/MOBILE.md §8.8).
 *
 * Asks the OS for its own review sheet — Google Play In-App Review on Android,
 * `AppStore.requestReview` / `SKStoreReviewController` on iOS — through
 * `@capacitor-community/in-app-review`. The OS decides whether the sheet actually appears (Apple: at
 * most 3 times in 365 days per app; Google: an undisclosed quota) and never tells the app whether the
 * player rated, so the result only says whether we *asked*.
 *
 * Shipped OFF (Producer, 2026-10-07). Switched on WITHOUT a code edit (MM-10): the release
 * workflows bake the GitHub Actions repository variable `RATING_PROMPT` into the build as
 * `VITE_RATING_PROMPT`; exactly `on` turns the prompt on for that build (planned: 1.0.1, once the
 * organic store rating is ≥ 4.3). Unset or any other value → off. Debug/CI builds never set it.
 *
 * Owned by the Mobile Engineer. The plugin is loaded with dynamic `import()` only inside a native
 * shell, so the web/PWA bundle never contains it. No network call of our own.
 */

/**
 * Build-time switch for the rating prompt: `VITE_RATING_PROMPT === 'on'` (exact, case-sensitive),
 * replaced by Vite at `vite build` time. `false` = `maybeAskForReview` returns `'disabled'` at once
 * and never touches the save or the plugin.
 */
export const RATING_PROMPT_ENABLED: boolean = import.meta.env.VITE_RATING_PROMPT === 'on';

/** Campaign level from which a 3★ win may ask for a rating (POST_LAUNCH.md §6: "level ≥ 10"). */
export const RATING_PROMPT_MIN_LEVEL = 10;

/** `'requested'` — the OS review API was called; `'unavailable'` — not native, or the plugin failed. */
export type ReviewResult = 'requested' | 'unavailable' | 'disabled';

/** What the result-screen hook did: a `ReviewResult`, or `'skipped'` when this result does not qualify. */
export type ReviewHookResult = ReviewResult | 'skipped';

/**
 * `?review=on` in the page URL (web only, same style as `?store=off`): turns the prompt on so the
 * call path can be exercised in a browser, where `requestReview()` resolves `'unavailable'`.
 * Ignored inside a native shell — a store build follows `RATING_PROMPT_ENABLED` (`VITE_RATING_PROMPT`) only.
 */
export function reviewOnByUrl(native: boolean = isNative()): boolean {
  return !native && typeof location !== 'undefined' && /[?&]review=on(&|$)/.test(location.search);
}

/** Test hook: `true` / `false` overrides the flag and the URL switch; `undefined` restores them. */
let enabledOverride: boolean | undefined;
export function setRatingPromptForTests(on: boolean | undefined): void {
  enabledOverride = on;
}

/** The flag, or the web debug switch. */
export function ratingPromptEnabled(): boolean {
  return enabledOverride ?? (RATING_PROMPT_ENABLED || reviewOnByUrl());
}

/**
 * Ask the OS for its review sheet. Web / PWA / tests outside a shell → `'unavailable'` without
 * loading the plugin. Never rejects (a missing plugin or a native error → `'unavailable'`).
 * Does not look at the flag — callers go through `maybeAskForReview`.
 */
export async function requestReview(): Promise<'requested' | 'unavailable'> {
  if (!isNative()) return 'unavailable';
  try {
    const { InAppReview } = await import('@capacitor-community/in-app-review');
    await InAppReview.requestReview();
    return 'requested';
  } catch (err) {
    console.warn('[native] in-app review failed:', err);
    return 'unavailable';
  }
}

/** The slice of the result screen's `ResultInfo` the trigger rule reads. */
export interface ReviewTrigger {
  level: { id: number };
  ui: { outcome: string; stars: number };
  /** Set on Daily Challenge (and Yesterday's-map practice) results. */
  challenge?: unknown;
  daily?: unknown;
  /** Set on Weekly Challenge results. */
  weekly?: unknown;
}

/** True for a campaign win with 3★ on level ≥ `RATING_PROMPT_MIN_LEVEL`. */
export function qualifiesForReview(info: ReviewTrigger): boolean {
  const campaign = info.challenge === undefined && info.daily === undefined && info.weekly === undefined;
  return campaign && info.ui.outcome === 'won' && info.ui.stars >= 3 && info.level.id >= RATING_PROMPT_MIN_LEVEL;
}

/** True while a request is running: a second result screen must not ask again before the save says so. */
let inFlight = false;

/**
 * Result-screen hook (called once from `ResultScreen.enter`). Flag off → `'disabled'` (save
 * untouched). Otherwise, the first qualifying result of the install asks the OS; when the call went
 * through (`'requested'`) `save.reviewAsked` is set and written, so it never asks again. A result
 * that does not qualify, or any result after the one that asked, → `'skipped'`. `'unavailable'`
 * (web, plugin missing) leaves the save as it was, so a later build/device can still ask once.
 * Never rejects.
 */
let lastHook: ReviewHookResult | null = null;

/** What the last `maybeAskForReview` call returned (QA surface `window.__towerclash.lastReview`). */
export function lastReviewResult(): ReviewHookResult | null {
  return lastHook;
}

export async function maybeAskForReview(info: ReviewTrigger, save: SaveData): Promise<ReviewHookResult> {
  const result = await maybeAskForReviewInner(info, save);
  lastHook = result;
  return result;
}

async function maybeAskForReviewInner(info: ReviewTrigger, save: SaveData): Promise<ReviewHookResult> {
  if (!ratingPromptEnabled()) return 'disabled';
  if (save.reviewAsked || inFlight || !qualifiesForReview(info)) return 'skipped';
  inFlight = true;
  try {
    const result = await requestReview();
    if (result === 'requested') {
      save.reviewAsked = true;
      writeSave(save);
    }
    return result;
  } finally {
    inFlight = false;
  }
}
