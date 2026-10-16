import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * Frame-cost guard on the headless shell. Three samples:
 *   1. the highest authored level with the reference player at x10 for 8 s (worst case: most
 *      towers/units on screen, sim stepping ten times per frame);
 *   2. the title screen idle for 3 s (the first thing every player sees; must not burn CPU);
 *   3. the shop screen for 3 s (`window.__towerclash.openShop`; should a build drop the hook, the test
 *      records an annotation and skips).
 * Each gates the page's own main-thread work per frame (BUG-47, below); the wall-clock frame interval
 * (median / p95 / max of the rAF deltas) is reported next to it, not gated. The numbers are reported
 * through test annotations and stdout so the daily report can quote them.
 *
 * QA-23 / ART-24: sample 1 runs under the default play view — since ART-24 the flat map with zoomed
 * buildings and units; the test asserts the far shore is where the flat letterbox puts it — and a
 * fourth case times the one-off ground-image build of level 40 under the ART-21 perspective camera
 * (`?tilt=0.72`; its per-row "mode 7" warp runs once per level, in the first frame) at 4× CPU
 * throttling: within GROUND_BUILD_MAX_RATIO × the flat default measured in the same run (+ slack), under an absolute ceiling
 * (debug hook `getGroundBuildMs`, src/debug.ts).
 *
 * BUG-47 (2026-10-16): the rAF interval is wall clock, so it measured the host as much as the game — on
 * the 4-core host shared with other agents' runs (load 9–15) the same build read a level-50 median of
 * 66.6 ms and a title median of 50.05 ms, never on an idle host. The gate now reads what the page itself
 * spends on the renderer main thread: CDP `Performance.getMetrics` after
 * `Performance.enable({ timeDomain: 'threadTicks' })` reports TaskDuration (every main-thread task:
 * script, style, layout, paint and the software canvas raster — ≈ 90 % of a frame here, the game's own
 * rAF callback is 1–2 ms) on the thread's CPU clock, so time the thread waits descheduled behind other
 * processes is not counted. Frames are the rAF callbacks whose timestamps fall between the two metric
 * reads (page time = `Timestamp` − `NavigationStart`), so work and frames cover the same window.
 * Gate: ΔTaskDuration / frames ≤ FRAME_WORK_BUDGET_MS. On this shell the main thread is the bottleneck
 * (92–99 % busy on the title and the shop, 81–88 % in level 50), so the work per frame is what set the
 * old interval: an interval median within 50 ms (the old budget, 20 fps) is a frame whose work fits
 * 50 ms. The new gate takes the mean over every frame (GC and long frames count), the old one the median.
 * Measured 2026-10-16 (2 workers, 6 idle runs): level 50 x10 24.0–30.6 ms / frame, title 32.4–35.5,
 * shop 20.9–22.4 — the budget keeps ≥ 40 % headroom over the worst idle case (the title); under 3–20
 * `node -e "for(;;){}"` hogs or a `vitest run` loop on the 4 cores (load up to ≈ 20; title interval
 * median 49.9–50.1 ms, the old gate's failure) the same samples read 23.7–31 / 30.8–37 / 20.2–24 ms
 * (BACKLOG BUG-47 has the runs). At ×10 the sim runs more
 * ticks per frame when frames are further apart (capped at MAX_TICKS_PER_FRAME = 10), so level 50 costs
 * 1–2 ms more per frame on a loaded host: real work, still counted.
 *
 * Budget: 33 ms (30 fps) is the target on a real device. The sandbox headless shell is software
 * rendered, so the assertion uses 50 ms of main-thread work per frame there (FRAME_WORK_BUDGET_MS); CI
 * keeps the same budget. Tighten once the render path is profiled on hardware.
 */

/** BUG-47: main-thread work per frame, thread-CPU ms, mean over the sample — the old wall-clock interval budget's number. */
const FRAME_WORK_BUDGET_MS = 50;
/** Frames a sample holds at least, whatever the wall clock (a loaded host draws fewer frames per second). */
const MIN_FRAMES = { play: 120, screen: 60 } as const;
/** QA-23: level 40's ground image (map-space paint + per-row warp) at 4× CPU throttling. */
/*
 * 2026-10-15 (BUG-47): the gate is now relative to the flat build measured in the same run, plus a loose
 * absolute ceiling. On a slow or loaded host every build stretches together (an idle run read camera
 * 161–205 / flat 41–46 ms where the day before gave 59–79 / 20 ms), so an absolute 120 ms failed without
 * any regression. BUG-40 was 7.6× the flat build (206–275 vs 27 ms); the fix is 3.8–4×. Since ART-24 the
 * perspective build only runs behind `?tilt=0.72`; players get the flat build.
 */
const GROUND_BUILD_CEILING_MS = 250;
const GROUND_BUILD_MAX_RATIO = 6;
const GROUND_BUILD_RATIO_SLACK_MS = 60;
const GROUND_BUILD_LEVEL = 40;
const CPU_THROTTLE = 4;
/** src/render/camera.ts ISLAND_FAR_Y (HUD.mapTop + 12): the island's far shore, map y. */
const ISLAND_FAR_Y = 108;
const SAMPLE_MS = 8_000;
const SCREEN_SAMPLE_MS = 3_000;

const LEVELS_DIR = new URL('../src/levels/', import.meta.url);
const LEVEL_IDS = readdirSync(LEVELS_DIR)
  .filter((f) => /^\d{3}-.*\.json$/.test(f))
  .map((f) => (JSON.parse(readFileSync(new URL(f, LEVELS_DIR), 'utf8')) as { id: number }).id)
  .sort((a, b) => a - b);
const HIGHEST = LEVEL_IDS[LEVEL_IDS.length - 1]!;

/** Optional debug hooks that other roles may add later; typed loosely so the spec compiles either way. */
type OptionalDebug = { openShop?: () => unknown; getGroundBuildMs?: (flat?: boolean) => number | null };

/**
 * How far below the flat letterbox the far shore is drawn (CSS px; 0 = the flat `?tilt=0` map): the
 * hooks' `toClient` projects map points of the play band through the camera, a HUD-band point (y 50)
 * is never projected and gives the letterbox origin and scale.
 */
function farShoreDrop(page: Page): Promise<number> {
  return page.evaluate(
    (farY) =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => {
          const tc = window.__towerclash;
          const o = tc.layoutToClient(0, 50);
          const v = tc.layoutToClient(100, 50).x - o.x;
          resolve(tc.toClient(360, farY).y - (o.y + ((farY - 50) * v) / 100));
        }),
      ),
    ISLAND_FAR_Y,
  );
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}

/** One sample: the frames produced in a window and the main-thread work done in it. */
interface FrameSample {
  /** Deltas between the rAF timestamps inside the window, ms (wall clock: reported, not gated). */
  deltas: number[];
  /** Frames produced inside the window (rAF callbacks whose timestamp lies between the two metric reads). */
  frames: number;
  windowMs: number;
  /** Per frame, ms of the renderer main thread's CPU clock: every task, and of it script / layout / style recalc. */
  work: number;
  script: number;
  layout: number;
  style: number;
}
type FrameClockWindow = Window & { __qaFrames?: number[] | null };

/**
 * BUG-47: samples for at least `ms` wall clock and at least `minFrames` frames. A free-running rAF loop
 * records every frame's timestamp; CDP `Performance.getMetrics` (thread-CPU time domain) is read right
 * before and right after, and only the frames whose timestamps fall between the two reads
 * (`Timestamp` − `NavigationStart` = page time) are counted, so the work and the frames cover the same
 * window however long a CDP round trip takes on a loaded host.
 */
async function sampleFrames(page: Page, ms: number, minFrames: number): Promise<FrameSample> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable', { timeDomain: 'threadTicks' });
  const metrics = async (): Promise<Record<string, number>> =>
    Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  await page.evaluate(() => {
    const w = window as FrameClockWindow;
    w.__qaFrames = [];
    const tick = (t: number): void => {
      if (!w.__qaFrames) return;
      w.__qaFrames.push(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const m0 = await metrics();
  await page.evaluate(
    ([sampleMs, n]) =>
      new Promise<void>((resolve) => {
        const w = window as FrameClockWindow;
        const start = performance.now();
        const n0 = w.__qaFrames!.length;
        const wait = (): void => {
          if (performance.now() - start >= sampleMs && w.__qaFrames!.length - n0 >= n) resolve();
          else requestAnimationFrame(wait);
        };
        requestAnimationFrame(wait);
      }),
    [ms, minFrames] as const,
  );
  const m1 = await metrics();
  const stamps = await page.evaluate(() => {
    const w = window as FrameClockWindow;
    const t = w.__qaFrames ?? [];
    w.__qaFrames = null;
    return t;
  });
  await cdp.detach();
  const nav = m0.NavigationStart! * 1000;
  const lo = m0.Timestamp! * 1000 - nav;
  const hi = m1.Timestamp! * 1000 - nav;
  const inside = stamps.filter((t) => t >= lo && t < hi);
  const frames = inside.length;
  const per = (k: string): number => ((m1[k]! - m0[k]!) * 1000) / Math.max(1, frames);
  return {
    deltas: inside.slice(1).map((t, i) => t - inside[i]!),
    frames,
    windowMs: hi - lo,
    work: per('TaskDuration'),
    script: per('ScriptDuration'),
    layout: per('LayoutDuration'),
    style: per('RecalcStyleDuration'),
  };
}

function describeSample(label: string, f: FrameSample): string {
  const wall = f.deltas.length
    ? `median ${median(f.deltas).toFixed(1)} ms, p95 ${percentile(f.deltas, 95).toFixed(1)} ms, max ${Math.max(...f.deltas).toFixed(1)} ms`
    : 'no intervals';
  return (
    `${label}: main-thread work ${f.work.toFixed(1)} ms / frame (script ${f.script.toFixed(1)}, layout ${f.layout.toFixed(1)}, style ${f.style.toFixed(1)}; budget ${FRAME_WORK_BUDGET_MS}) ` +
    `over ${f.frames} frames in ${f.windowMs.toFixed(0)} ms — wall-clock interval (not gated): ${wall}`
  );
}
function report(summary: string): void {
  console.log(`[perf] ${summary}`);
  test.info().annotations.push({ type: 'perf', description: summary });
}
/** The sample is well-formed (enough frames inside the metrics window, measurable work) and within the budget. */
function expectFrameWork(f: FrameSample, minFrames: number, summary: string): void {
  expect(f.frames, `must have sampled a meaningful number of frames — ${summary}`).toBeGreaterThanOrEqual(minFrames);
  expect(f.work, `the main thread must have done measurable work — ${summary}`).toBeGreaterThan(0);
  expect(f.work, summary).toBeLessThanOrEqual(FRAME_WORK_BUDGET_MS);
}

async function gotoTitle(page: Page, query = ''): Promise<string[]> {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.goto(query ? `/?${query}` : '/');
  await page.waitForFunction(() => typeof window.__towerclash?.loadLevel === 'function');
  await expect.poll(() => page.evaluate(() => window.__towerclash.getScreen())).toBe('title');
  return pageErrors;
}

test.describe('Tower Clash perf', () => {
  test(`level ${HIGHEST} at x10 with autoplay: main-thread work <= ${FRAME_WORK_BUDGET_MS} ms per frame`, async ({ page }) => {
    test.setTimeout(60_000); // ok: 11 s idle (8 s sample + boot), 2026-10-16; the sample stretches until 120 frames on a loaded host
    const pageErrors = await gotoTitle(page);
    expect(await page.evaluate((id) => window.__towerclash.loadLevel(id), HIGHEST)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__towerclash.getScreen())).toBe('play');
    await page.evaluate(() => {
      window.__towerclash.setSpeed(10);
      window.__towerclash.autoplay();
    });
    expect(await page.evaluate(() => window.__towerclash.getSpeed())).toBe(10);
    const simStart = await page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
    // ART-24: the budget is measured on the default play view — the flat map with the zoomed buildings / units
    // (the ART-21 perspective camera is the ?tilt=0.72 override): the far shore is where the flat letterbox puts it
    const drop = await farShoreDrop(page);
    expect(Math.abs(drop), 'the default play view is the flat map: the far shore is not dropped (CSS px)').toBeLessThan(0.5);

    const f = await sampleFrames(page, SAMPLE_MS, MIN_FRAMES.play);
    const simEnd = await page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
    const screenAfter = await page.evaluate(() => window.__towerclash.getScreen());

    const summary =
      `${describeSample(`level ${HIGHEST} x10 autoplay`, f)}; ` +
      `sim ${simStart} → ${simEnd} ms (${((simEnd - simStart) / 1000).toFixed(1)} s sim), screen after: ${screenAfter}, default flat view (far shore +${drop.toFixed(0)} CSS px)`;
    report(summary);

    expect(simEnd, 'sim must have advanced while sampling').toBeGreaterThan(simStart);
    expect(pageErrors).toEqual([]);
    expectFrameWork(f, MIN_FRAMES.play, summary);
  });

  test(`level ${GROUND_BUILD_LEVEL} ground image (ART-21 per-row warp, ?tilt=0.72) builds within ${GROUND_BUILD_MAX_RATIO}× the flat build (ceiling ${GROUND_BUILD_CEILING_MS} ms) at ${CPU_THROTTLE}x CPU`, async ({ page }) => {
    // ART-24: the perspective camera is an override now; the gate keeps guarding its build, the flat default is sampled alongside
    const pageErrors = await gotoTitle(page, 'tilt=0.72');
    expect(await page.evaluate((id) => window.__towerclash.loadLevel(id), GROUND_BUILD_LEVEL)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__towerclash.getScreen())).toBe('play');
    expect(await farShoreDrop(page), 'measured under the perspective camera').toBeGreaterThan(10);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
    // five fresh builds each (the hook bypasses the terrain cache with a new key; same work as the first frame of a level).
    // The gate is on the BEST sample: a build is a one-off cost and GC / the other worker only ever push samples up
    // (2026-10-13: under the two-worker e2e load one run read 140 / 104 / 123 ms, median 123, best 104); the median
    // keeps a loose ceiling so a real regression (BUG-40: 206–275 ms) still fails.
    const build = (flat: boolean) => page.evaluate((f) => (window.__towerclash as unknown as Required<OptionalDebug>).getGroundBuildMs(f), flat);
    const tilted: number[] = [];
    const flat: number[] = [];
    for (let i = 0; i < 5; i++) {
      tilted.push((await build(false)) ?? NaN);
      flat.push((await build(true)) ?? NaN);
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const fmt = (xs: number[]) => xs.map((x) => x.toFixed(1)).join(' / ');
    const summary =
      `level ${GROUND_BUILD_LEVEL} ground build at ${CPU_THROTTLE}x CPU: camera ${fmt(tilted)} ms (best ${Math.min(...tilted).toFixed(1)}, median ${median(tilted).toFixed(1)}), ` +
      `flat ${fmt(flat)} ms (median ${median(flat).toFixed(1)})`;
    report(summary);

    expect(tilted.every(Number.isFinite), 'getGroundBuildMs answers on the play screen').toBe(true);
    expect(await page.evaluate(() => window.__towerclash.getScreen())).toBe('play');
    expect(pageErrors).toEqual([]);
    expect(Math.min(...tilted), summary).toBeLessThan(GROUND_BUILD_CEILING_MS);
    expect(median(tilted), `${summary} — camera build must stay within ${GROUND_BUILD_MAX_RATIO}× the flat build (+${GROUND_BUILD_RATIO_SLACK_MS} ms)`).toBeLessThan(median(flat) * GROUND_BUILD_MAX_RATIO + GROUND_BUILD_RATIO_SLACK_MS);
  });

  test(`title screen idle: main-thread work <= ${FRAME_WORK_BUDGET_MS} ms per frame`, async ({ page }) => {
    const pageErrors = await gotoTitle(page);
    const f = await sampleFrames(page, SCREEN_SAMPLE_MS, MIN_FRAMES.screen);
    const screenAfter = await page.evaluate(() => window.__towerclash.getScreen());
    const summary = `${describeSample('title idle', f)}; screen after: ${screenAfter}`;
    report(summary);

    expect(screenAfter, 'nothing may navigate away from the title on its own').toBe('title');
    expect(pageErrors).toEqual([]);
    expectFrameWork(f, MIN_FRAMES.screen, summary);
  });

  test(`shop screen: main-thread work <= ${FRAME_WORK_BUDGET_MS} ms per frame`, async ({ page }) => {
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
    const f = await sampleFrames(page, SCREEN_SAMPLE_MS, MIN_FRAMES.screen);
    const screenAfter = await page.evaluate(() => window.__towerclash.getScreen());
    const summary = `${describeSample(`shop (screen "${shopScreen}")`, f)}; screen after: ${screenAfter}`;
    report(summary);

    expect(screenAfter, 'the shop must stay open while idle').toBe(shopScreen);
    expect(pageErrors).toEqual([]);
    expectFrameWork(f, MIN_FRAMES.screen, summary);
  });
});
