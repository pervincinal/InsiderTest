import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * Diagnosable screen polls (QA-46). Two one-off CI stalls in three days (run 155 daily.spec.ts:99 —
 * PLAY tap → `expect.poll(screen) → 'levelSelect'` timed out at 15 s with no received value in the log;
 * run 148 share.spec.ts:126 — `winLevel1` never reached 'result' in 75 s) left nothing to read but the
 * timeout: no page error, no `RENDERER HUNG`, not reproducible. `expectScreen` is `expect.poll(screen)`
 * with the same timeout / intervals, plus a one-shot dump when the poll times out:
 *   - page side, `window.__towerclash.stallDump()` (src/debug.ts, read-only): the current screen,
 *     `chunkFailures` of the lazy chunks (lazyScreens / enMenus / ai / result / hudOverlays / level:N),
 *     whether a LoadingScreen is current and for how long, `transitionDone()`, the rAF loop's last frame
 *     time against `performance.now()`, `document.visibilityState` / `hasFocus()` / `navigator.onLine`,
 *     and the running match's tick / timeMs / held / paused / outcome — read TWICE, `SAMPLE_GAP_MS` apart
 *     in one `evaluate`, so a frame time or sim time that moved between the reads says "alive but slow"
 *     and one that did not says "stopped";
 *   - spec side: the expected screen, the poll's timeout, the wall clock, the page URL.
 * The `evaluate` is raced against `DUMP_EVALUATE_MS`: a main thread that never answers is itself the
 * finding (`hung: true`, the QA-35 signature — reopen QA-35), and the dump never eats the test budget.
 * The dump is attached to the test as `screen-stall.json` (in the HTML report / trace artefact a human
 * downloads) AND appended to the failure message, so the plain `list` reporter log carries it too.
 *
 * How to read one: `chunkFailures.lazyScreens > 0` / `toast: "Load failed"` → chunk-failed;
 * `frame.sinceLastFrameMs` growing across the two samples, or `hung: true` → the renderer's main thread
 * stopped (page-starved / hung); `match.timeMs` equal in both samples while `frame` moves → sim-stalled
 * (held / paused / resultPending tell which); screen still the one before the tap with frames and
 * `transitionDone: true` → the tap was lost (hit region / slide hold).
 */

/** Longest the dump's `page.evaluate` may take before the dump reports a hung main thread instead. */
export const DUMP_EVALUATE_MS = 5_000;
/** What `expect.poll` waits without `timeout`: playwright.config.ts `expect: { timeout: 15_000 }` (reported in the dump only; the poll itself keeps Playwright's own default). */
export const DEFAULT_EXPECT_TIMEOUT_MS = 15_000;
/** Gap between the two page-side samples (one frame at 60 Hz is 16 ms; 5 sim ticks at ×1 are 250 ms). */
export const SAMPLE_GAP_MS = 300;

export interface ExpectScreenOptions {
  /** Poll timeout in ms (Playwright's `expect.timeout`, 15 s, when omitted — exactly as `expect.poll`). */
  timeout?: number;
  /** Poll intervals in ms (`expect.poll`'s default ladder when omitted). */
  intervals?: number[];
  /** Custom failure message, as `expect.poll`'s. */
  message?: string;
}

/** Page-side sample (`StallDump` in src/debug.ts); typed loosely here — the spec files import nothing from src/. */
type PageSample = Record<string, unknown> & { nowMs?: number; screen?: string };

export interface ScreenStallDump {
  expected: string;
  timeoutMs: number;
  at: string;
  url: string;
  pageClosed: boolean;
  /** The dump's own `evaluate` did not answer within `DUMP_EVALUATE_MS`: the main thread is not running JS. */
  hung: boolean;
  /** `window.__towerclash` present with `stallDump` (false on a page that never finished booting the debug chunk). */
  surface: boolean;
  /** First page-side sample, then one `SAMPLE_GAP_MS` later (null when hung / no surface). */
  samples: [PageSample | null, PageSample | null];
  /** Spec-side verdict from the two samples (a hint for the reader, not a judgement). */
  verdict: string;
  error?: string;
}

/** The current screen's name, as every spec's `screen(page)` reads it. */
export function screenName(page: Page): Promise<string> {
  return page.evaluate(() => window.__towerclash.getScreen());
}

/**
 * `await expect.poll(() => screen(page), opts).toBe(name)` with the stall dump on timeout. Same defaults
 * as `expect.poll` (15 s, Playwright's interval ladder); pass `{ timeout, intervals }` exactly as before.
 */
export async function expectScreen(page: Page, name: string, opts: ExpectScreenOptions = {}): Promise<void> {
  try {
    await expect.poll(() => screenName(page), opts).toBe(name);
  } catch (err) {
    const dump = await collectStallDump(page, name, opts.timeout ?? DEFAULT_EXPECT_TIMEOUT_MS);
    const json = JSON.stringify(dump, null, 2);
    try {
      await test.info().attach('screen-stall.json', { body: json, contentType: 'application/json' });
    } catch {
      /* outside a test (a fixture after teardown): the message below still carries it */
    }
    const note = `\n\n[screen-stall] expected '${name}' within ${dump.timeoutMs} ms — one-shot dump (QA-46, e2e/helpers/screenPoll.ts):\n${json}\n`;
    if (err instanceof Error) {
      err.message += note;
      throw err;
    }
    throw new Error(`${String(err)}${note}`);
  }
}

/** Two page-side samples `SAMPLE_GAP_MS` apart, bounded by `DUMP_EVALUATE_MS`; never throws. */
export async function collectStallDump(page: Page, expected: string, timeoutMs: number): Promise<ScreenStallDump> {
  const dump: ScreenStallDump = {
    expected,
    timeoutMs,
    at: new Date().toISOString(),
    url: page.url(),
    pageClosed: page.isClosed(),
    hung: false,
    surface: false,
    samples: [null, null],
    verdict: '',
  };
  if (dump.pageClosed) {
    dump.verdict = 'page closed before the dump';
    return dump;
  }
  try {
    const result = await Promise.race([
      page.evaluate(async (gapMs) => {
        const w = window as unknown as { __towerclash?: { stallDump?: () => Record<string, unknown> } };
        const read = w.__towerclash?.stallDump;
        if (typeof read !== 'function') return { surface: false, samples: [null, null] as [null, null] };
        const a = read();
        await new Promise<void>((resolve) => setTimeout(resolve, gapMs));
        const b = read();
        return { surface: true, samples: [a, b] as [Record<string, unknown>, Record<string, unknown>] };
      }, SAMPLE_GAP_MS),
      new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), DUMP_EVALUATE_MS)),
    ]);
    if (result === 'hung') {
      dump.hung = true;
      dump.verdict = `page.evaluate did not answer within ${DUMP_EVALUATE_MS} ms: the main thread is not running JS (QA-35 signature — reopen QA-35)`;
      return dump;
    }
    dump.surface = result.surface;
    dump.samples = result.samples;
    dump.verdict = result.surface ? verdictOf(result.samples[0], result.samples[1], expected) : 'window.__towerclash.stallDump missing: the debug chunk never installed (boot did not reach idle?)';
  } catch (e) {
    dump.error = String(e);
    dump.verdict = 'the dump evaluate threw (see error)';
  }
  return dump;
}

interface SampleView {
  screen?: string;
  transitionDone?: boolean;
  lazyScreensIn?: boolean;
  pendingStart?: boolean;
  chunkFailures?: Record<string, number>;
  loading?: { from: string; shownForMs: number | null } | null;
  frame?: { lastFrameMs: number | null; sinceLastFrameMs: number | null };
  page?: { visibilityState: string; hidden: boolean; hasFocus: boolean; onLine: boolean };
  match?: { current: boolean; timeMs: number; held: boolean; paused: boolean; over: boolean; outcome: string; resultPending: boolean } | null;
  toast?: string | null;
}

/** A one-line reading of the two samples (sim-stalled / page-starved / chunk-failed / tap-lost / …). */
export function verdictOf(a: Record<string, unknown> | null, b: Record<string, unknown> | null, expected: string): string {
  const s0 = (a ?? {}) as SampleView;
  const s1 = (b ?? {}) as SampleView;
  const notes: string[] = [];
  const failed = Object.entries(s1.chunkFailures ?? {}).filter(([, n]) => n > 0);
  if (failed.length) notes.push(`chunk-failed: ${failed.map(([k, n]) => `${k}×${n}`).join(', ')}`);
  if (s1.toast) notes.push(`toast "${s1.toast}"`);
  const f0 = s0.frame?.lastFrameMs ?? null;
  const f1 = s1.frame?.lastFrameMs ?? null;
  if (f0 !== null && f1 !== null && f1 === f0) notes.push(`page-starved: no frame between the samples (last frame ${s1.frame?.sinceLastFrameMs} ms ago)`);
  else if (f1 === null) notes.push('no frame yet (lastFrameMs null)');
  if (s1.page && (s1.page.hidden || !s1.page.onLine)) notes.push(`page hidden=${s1.page.hidden} onLine=${s1.page.onLine}`);
  if (s1.loading) notes.push(`spinner up for ${s1.loading.shownForMs ?? '<1 frame'} ms (from ${s1.loading.from})${s1.pendingStart ? ', level start pending' : ''}`);
  if (s0.match && s1.match) {
    if (s1.match.timeMs === s0.match.timeMs && f1 !== f0) {
      const why = s1.match.held ? 'lesson card holds it' : s1.match.paused ? 'paused' : s1.match.over ? `over (${s1.match.outcome})${s1.match.resultPending ? ', result pending' : ''}` : 'no tick ran';
      notes.push(`sim-stalled: timeMs ${s1.match.timeMs} in both samples (${why})`);
    } else if (s1.match.timeMs !== s0.match.timeMs) notes.push(`sim alive: +${s1.match.timeMs - s0.match.timeMs} ms sim in the gap`);
  }
  if (!notes.length && s1.screen && s1.screen !== expected) notes.push(`tap-lost? screen stayed '${s1.screen}' with frames running, transitionDone=${String(s1.transitionDone)}, lazyScreensIn=${String(s1.lazyScreensIn)}`);
  if (s1.screen === expected) notes.push(`screen is '${expected}' now: it flipped after the poll gave up (slow, not stuck)`);
  return notes.join('; ') || 'no reading';
}
