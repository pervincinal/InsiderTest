import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * Frame-time guard on the headless shell. Three samples of requestAnimationFrame deltas:
 *   1. the highest authored level with the reference player at x10 for 8 s (worst case: most
 *      towers/units on screen, sim stepping ten times per frame);
 *   2. the title screen idle for 3 s (the first thing every player sees; must not burn CPU);
 *   3. the shop screen for 3 s — only once the frontend exposes `window.__towerclash.openShop`;
 *      until then the test records an annotation and skips (see BACKLOG: economy UI in progress).
 * The median frame must stay under the budget below; the numbers are reported through test
 * annotations and stdout so the daily report can quote them.
 *
 * Budget: 33 ms (30 fps) is the target on a real device. The sandbox headless shell is software
 * rendered and shares CPU with the preview server, so the assertion uses 50 ms there (see
 * PERF_BUDGET_MS); CI keeps the same budget for determinism. Tighten once the render path is
 * profiled on hardware.
 */

const PERF_BUDGET_MS = 50;
const SAMPLE_MS = 8_000;
const SCREEN_SAMPLE_MS = 3_000;

const LEVELS_DIR = new URL('../src/levels/', import.meta.url);
const LEVEL_IDS = readdirSync(LEVELS_DIR)
  .filter((f) => /^\d{3}-.*\.json$/.test(f))
  .map((f) => (JSON.parse(readFileSync(new URL(f, LEVELS_DIR), 'utf8')) as { id: number }).id)
  .sort((a, b) => a - b);
const HIGHEST = LEVEL_IDS[LEVEL_IDS.length - 1]!;

/** Optional debug hooks that other roles may add later; typed loosely so the spec compiles either way. */
type OptionalDebug = { openShop?: () => unknown };

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}

/** Sample rAF deltas for `ms` wall-clock; the first frame (evaluate() dispatch latency) is dropped. */
async function sampleFrames(page: Page, ms: number): Promise<number[]> {
  const deltas = await page.evaluate(
    (sampleMs) =>
      new Promise<number[]>((resolve) => {
        const out: number[] = [];
        let last = performance.now();
        const start = last;
        const tick = (t: number): void => {
          out.push(t - last);
          last = t;
          if (t - start < sampleMs) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
  return deltas.slice(1);
}

interface FrameStats {
  med: number;
  p95: number;
  max: number;
  n: number;
}
function stats(samples: number[]): FrameStats {
  return { med: median(samples), p95: percentile(samples, 95), max: Math.max(...samples), n: samples.length };
}
function describeStats(label: string, s: FrameStats, ms: number): string {
  return `${label}: ${s.n} frames in ${ms} ms — median ${s.med.toFixed(1)} ms, p95 ${s.p95.toFixed(1)} ms, max ${s.max.toFixed(1)} ms`;
}
function report(summary: string): void {
  console.log(`[perf] ${summary}`);
  test.info().annotations.push({ type: 'perf', description: summary });
}

async function gotoTitle(page: Page): Promise<string[]> {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.goto('/');
  await page.waitForFunction(() => typeof window.__towerclash?.loadLevel === 'function');
  await expect.poll(() => page.evaluate(() => window.__towerclash.getScreen())).toBe('title');
  return pageErrors;
}

test.describe('Tower Clash perf', () => {
  test(`level ${HIGHEST} at x10 with autoplay: median frame <= ${PERF_BUDGET_MS} ms`, async ({ page }) => {
    test.setTimeout(60_000);
    const pageErrors = await gotoTitle(page);
    expect(await page.evaluate((id) => window.__towerclash.loadLevel(id), HIGHEST)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__towerclash.getScreen())).toBe('play');
    await page.evaluate(() => {
      window.__towerclash.setSpeed(10);
      window.__towerclash.autoplay();
    });
    expect(await page.evaluate(() => window.__towerclash.getSpeed())).toBe(10);
    const simStart = await page.evaluate(() => window.__towerclash.getState()?.time ?? -1);

    const samples = await sampleFrames(page, SAMPLE_MS);
    const simEnd = await page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
    const screenAfter = await page.evaluate(() => window.__towerclash.getScreen());

    const s = stats(samples);
    const summary =
      `${describeStats(`level ${HIGHEST} x10 autoplay`, s, SAMPLE_MS)}; ` +
      `sim ${simStart} → ${simEnd} ms (${((simEnd - simStart) / 1000).toFixed(1)} s sim), screen after: ${screenAfter}`;
    report(summary);

    expect(samples.length, 'must have sampled a meaningful number of frames').toBeGreaterThan(60);
    expect(simEnd, 'sim must have advanced while sampling').toBeGreaterThan(simStart);
    expect(pageErrors).toEqual([]);
    expect(s.med, summary).toBeLessThanOrEqual(PERF_BUDGET_MS);
  });

  test(`title screen idle: median frame <= ${PERF_BUDGET_MS} ms`, async ({ page }) => {
    const pageErrors = await gotoTitle(page);
    const samples = await sampleFrames(page, SCREEN_SAMPLE_MS);
    const screenAfter = await page.evaluate(() => window.__towerclash.getScreen());
    const s = stats(samples);
    const summary = `${describeStats('title idle', s, SCREEN_SAMPLE_MS)}; screen after: ${screenAfter}`;
    report(summary);

    expect(screenAfter, 'nothing may navigate away from the title on its own').toBe('title');
    expect(samples.length, 'must have sampled a meaningful number of frames').toBeGreaterThan(30);
    expect(pageErrors).toEqual([]);
    expect(s.med, summary).toBeLessThanOrEqual(PERF_BUDGET_MS);
  });

  test(`shop screen: median frame <= ${PERF_BUDGET_MS} ms`, async ({ page }) => {
    const pageErrors = await gotoTitle(page);
    const hasOpenShop = await page.evaluate(() => typeof (window.__towerclash as OptionalDebug).openShop === 'function');
    if (!hasOpenShop) {
      const why = 'window.__towerclash.openShop is not exposed yet (economy UI in progress) — shop perf not measured';
      test.info().annotations.push({ type: 'skipped-reason', description: why });
      console.log(`[perf] ${why}`);
      test.skip(true, why);
    }

    await page.evaluate(() => (window.__towerclash as OptionalDebug).openShop!());
    await expect.poll(() => page.evaluate(() => window.__towerclash.getScreen())).not.toBe('title');
    const shopScreen = await page.evaluate(() => window.__towerclash.getScreen());
    const samples = await sampleFrames(page, SCREEN_SAMPLE_MS);
    const screenAfter = await page.evaluate(() => window.__towerclash.getScreen());
    const s = stats(samples);
    const summary = `${describeStats(`shop (screen "${shopScreen}")`, s, SCREEN_SAMPLE_MS)}; screen after: ${screenAfter}`;
    report(summary);

    expect(screenAfter, 'the shop must stay open while idle').toBe(shopScreen);
    expect(samples.length, 'must have sampled a meaningful number of frames').toBeGreaterThan(30);
    expect(pageErrors).toEqual([]);
    expect(s.med, summary).toBeLessThanOrEqual(PERF_BUDGET_MS);
  });
});
