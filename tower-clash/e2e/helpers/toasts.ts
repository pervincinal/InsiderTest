import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * In-page toast recorder (BUG-25, QA-20). A toast lives a fixed span of page wall clock (`Toast.show`,
 * src/ui/screens.ts: 2.4 s, 3.5 s on the result screen), so a one-shot
 * `await page.evaluate(() => window.__towerclash.getToast())` read a few protocol round-trips after the
 * action that raised it races the expiry under load (2026-10-09, load 9.7: `getToast()` → null
 * 1.5–2.5 s after "Shared" went up). Instead the page polls `getToast()` from its own 16 ms timer,
 * installed before boot, and keeps every toast it saw together with the screen that showed it; specs
 * poll that list. A toast would have to come and go inside a single 16 ms tick of a running page to
 * be missed. Toast TEXT comes from the debug surface — never from canvas `fillText` calls, which split
 * numerals into separate runs since ART-16 (e2e/weeklyMilestones.spec.ts `compact` handles those).
 *
 * The only one-shot `getToast()` read left in e2e/ is the recorder below; tests/repo/hygiene.test.ts
 * fails on any other.
 */

/** One toast as the page saw it go up: its text and the screen that showed it. */
export interface SeenToast {
  t: string;
  s: string;
}

declare global {
  interface Window {
    __toastsSeen?: SeenToast[];
  }
}

/**
 * Start recording before `page.goto` (an init script: it runs again on every navigation and starts
 * empty). A toast is recorded once per appearance: when the text changes, or the same text comes back
 * after the pill was gone.
 */
export function recordToasts(page: Page): Promise<void> {
  return page.addInitScript(() => {
    window.__toastsSeen = [];
    let prev: string | null = null;
    setInterval(() => {
      const debug = window.__towerclash;
      const t = debug?.getToast?.() ?? null;
      if (t !== null && t !== prev) window.__toastsSeen!.push({ t, s: debug?.getScreen?.() ?? '?' });
      prev = t;
    }, 16);
  });
}

export interface ToastFilter {
  /** Only toasts recorded after this mark (`toastMark`). */
  since?: number;
  /** Only toasts shown while this screen was current. */
  screen?: string;
}

/** Texts of the toasts seen so far, oldest first. Throws when the recorder was not installed before boot. */
export async function toastsSeen(page: Page, filter: ToastFilter = {}): Promise<string[]> {
  const seen = await page.evaluate(
    ([since, screen]) =>
      window.__toastsSeen
        ? window.__toastsSeen
            .slice(since)
            .filter((x) => screen === null || x.s === screen)
            .map((x) => x.t)
        : null,
    [filter.since ?? 0, filter.screen ?? null] as const,
  );
  if (!seen) throw new Error('toastsSeen: recordToasts(page) was not installed before page.goto');
  return seen;
}

/** A mark for `toastsSeen(page, { since })`: toasts after it were raised by what the spec did next. */
export async function toastMark(page: Page): Promise<number> {
  const n = await page.evaluate(() => window.__toastsSeen?.length ?? null);
  if (n === null) throw new Error('toastMark: recordToasts(page) was not installed before page.goto');
  return n;
}

/** The toast `text` went up (after `filter.since` / on `filter.screen` when given). */
export async function expectToast(page: Page, text: string, filter: ToastFilter & { message?: string } = {}): Promise<void> {
  const message = filter.message ?? `toast "${text}" went up`;
  await expect.poll(() => toastsSeen(page, filter), { message }).toContain(text);
}
