import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/*
 * Frame-time guard on the headless shell: load the highest authored level, run the reference
 * player at x10 for 8 s wall-clock and sample requestAnimationFrame deltas. The median frame must
 * stay under the budget below. The number is reported through test annotations and stdout so the
 * daily report can quote it.
 *
 * Budget: 33 ms (30 fps) is the target on a real device. The sandbox headless shell is software
 * rendered and shares CPU with the preview server, so the assertion uses 50 ms there (see
 * PERF_BUDGET_MS); CI keeps the same budget for determinism. Tighten once the render path is
 * profiled on hardware.
 */

const PERF_BUDGET_MS = 50;
const SAMPLE_MS = 8_000;

const LEVELS_DIR = new URL('../src/levels/', import.meta.url);
const LEVEL_IDS = readdirSync(LEVELS_DIR)
  .filter((f) => /^\d{3}-.*\.json$/.test(f))
  .map((f) => (JSON.parse(readFileSync(new URL(f, LEVELS_DIR), 'utf8')) as { id: number }).id)
  .sort((a, b) => a - b);
const HIGHEST = LEVEL_IDS[LEVEL_IDS.length - 1]!;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}

test.describe('Tower Clash perf', () => {
  test(`level ${HIGHEST} at x10 with autoplay: median frame <= ${PERF_BUDGET_MS} ms`, async ({ page }) => {
    test.setTimeout(60_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto('/');
    await page.waitForFunction(() => typeof window.__towerclash?.loadLevel === 'function');
    expect(await page.evaluate((id) => window.__towerclash.loadLevel(id), HIGHEST)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__towerclash.getScreen())).toBe('play');
    await page.evaluate(() => {
      window.__towerclash.setSpeed(10);
      window.__towerclash.autoplay();
    });
    expect(await page.evaluate(() => window.__towerclash.getSpeed())).toBe(10);
    const simStart = await page.evaluate(() => window.__towerclash.getState()?.time ?? -1);

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
      SAMPLE_MS,
    );
    const simEnd = await page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
    const screenAfter = await page.evaluate(() => window.__towerclash.getScreen());

    // drop the first frame (includes evaluate() dispatch latency)
    const samples = deltas.slice(1);
    const med = median(samples);
    const p95 = percentile(samples, 95);
    const max = Math.max(...samples);
    const summary =
      `level ${HIGHEST} x10 autoplay: ${samples.length} frames in ${SAMPLE_MS} ms — ` +
      `median ${med.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, max ${max.toFixed(1)} ms; ` +
      `sim ${simStart} → ${simEnd} ms (${((simEnd - simStart) / 1000).toFixed(1)} s sim), screen after: ${screenAfter}`;
    console.log(`[perf] ${summary}`);
    test.info().annotations.push({ type: 'perf', description: summary });

    expect(samples.length, 'must have sampled a meaningful number of frames').toBeGreaterThan(60);
    expect(simEnd, 'sim must have advanced while sampling').toBeGreaterThan(simStart);
    expect(pageErrors).toEqual([]);
    expect(med, summary).toBeLessThanOrEqual(PERF_BUDGET_MS);
  });
});
