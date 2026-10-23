import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * Frame-cost guard on the headless shell. Three samples:
 *   1. the highest authored level, seed PLAY_SEED, with the reference player at x5 for 8 s (worst case: most
 *      towers/units on screen, sim stepping several ticks per frame) — every sampled frame on the play screen (QA-27);
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
 * QA-27 (2026-10-17): the level-50 sample used to start at x10 on an unseeded match, and the bot wins level 50
 * in 40–89 s sim depending on the seed (headless seeds 1–8: 88.6 / 39.6 / 71.1 / 39.55 / 39.6 / 76.35 / 70.4 /
 * 66.55 s), i.e. 4–9 s of wall clock at x10 — the "worst case" sample ended on the result screen (BUG-47
 * finding: sim 57–70 s, screen after: result). Now: a fixed seed (PLAY_SEED = 1, the longest of those: won at
 * 88.6 s, peak 37 marching units at 45 s) at PLAY_SPEED = 5, started in the same evaluate as `loadLevel`, so
 * the sample covers sim ≈ 0–40 s on an idle host (8 s × 5) and at most ≈ 60 s on a loaded one (120 frames ×
 * the MAX_TICKS_PER_FRAME = 10 tick cap = 500 ms sim per frame) — ≥ 28 s of sim before the bot can win.
 * `sampleFrames(…, { stayOn: 'play' })` checks the screen on every frame of the window and ends the sample at
 * the first frame off it, the spec asserts it never left and that the screen after sampling is still `play`
 * (tests/repo/hygiene.test.ts pins both). x5 instead of x10 costs ≈ 0.5 ms of sim per frame (≈ 0.16 ms a tick
 * with the AI, headless) — noise next to the raster.
 *
 * Budget: 33 ms (30 fps) is the target on a real device. The sandbox headless shell is software
 * rendered, so the assertion uses 50 ms of main-thread work per frame there (FRAME_WORK_BUDGET_MS); CI
 * keeps the same budget. Tighten once the render path is profiled on hardware.
 *
 * BUG-55 (2026-10-23): the thread-CPU measure is load-independent but not host-speed-independent — about
 * 90 % of a title frame is the software raster / commit, which scales with the host's raster speed. Same
 * code, title idle: CI run 101 26.0 ms, Day 32's container 27.6, Day 37's (restarted) container 47–52
 * (3 of 4 runs red alone; script 2.3 ms of it), Day 38's 39.0. So each worker first measures a fixed,
 * code-independent calibration workload with the same CDP measure (`calibrateHost`: a 1080 × 1920
 * canvas repainted every frame — sea gradient, two drawImage of a pre-painted island layer, shadowed
 * shapes, radial gradients, a little text; nothing from src/) → `calibMs` per frame. Every frame
 * sample's budget is FRAME_WORK_BUDGET_MS × factor, factor = max(1, calibMs / CALIBRATION_REF_MS):
 * a host as fast as CI (or faster) keeps the absolute 50 ms. A factor above HOST_FACTOR_CEILING (2.5)
 * is not a valid measurement: the sample is skipped with an annotation, never passed. On CI
 * (`process.env.CI`) the factor is forced to 1 — the absolute 50 ms stays authoritative there; the
 * calibration is still measured and printed so CI's own calibMs can re-derive the reference.
 * Every `[perf]` line carries the calibration, the reference and the factor. Changing the calibration
 * workload changes calibMs: re-derive CALIBRATION_REF_MS (below) in the same change.
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
/** QA-27: level-50 match the sample replays — seed 1 is won by the bot at 88.6 s sim (`npm run playtest -- --level 50 --seed 1`). */
const PLAY_SEED = 1;
/** QA-27: x5 keeps the 8 s (or 120-frame) window inside the match: ≤ 60 s sim of the 88.6 s. */
const PLAY_SPEED = 5;
const SCREEN_SAMPLE_MS = 3_000;
/**
 * BUG-55: calibration work per frame (calibrateHost) on a host whose raster speed matches CI's. Not measured
 * on CI yet: derived 2026-10-23 on the Day 38 container as REF = local calibMs × (CI title / local title)
 * = 21.6 × 26.0 / 37.3 = 15.06 → 15 (local: calib 20.8–21.8 ms over 3 workers, title idle
 * 37.0–39.0 ms over 4 runs; CI run 101 title 26.0 ms), so CI's ratio is ≈ 1.0 and this container's factor ≈ 1.44.
 * Re-derive from the first CI log's `calib` (CALIBRATION_REF_MS = CI calibMs) if it reads more than ≈ 10 % off.
 */
const CALIBRATION_REF_MS = 15;
/** BUG-55: a host slower than this × the reference is not a valid perf measurement (skip, never pass). */
const HOST_FACTOR_CEILING = 2.5;
const CALIBRATION_SAMPLE_MS = 2_000;

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
  /** QA-27: the screen the window first saw that was not `stayOn` (the sample ends there), or null. */
  left: string | null;
  /** QA-27: marching units on the map while sampling a play screen (min / max over the window's frames), or null. */
  units: { min: number; max: number } | null;
}
type FrameClockWindow = Window & { __qaFrames?: number[] | null };
interface SampleOptions {
  /** QA-27: every frame of the window must be on this screen; the sample ends at the first frame that is not. */
  stayOn?: string;
}

/**
 * BUG-47: samples for at least `ms` wall clock and at least `minFrames` frames. A free-running rAF loop
 * records every frame's timestamp; CDP `Performance.getMetrics` (thread-CPU time domain) is read right
 * before and right after, and only the frames whose timestamps fall between the two reads
 * (`Timestamp` − `NavigationStart` = page time) are counted, so the work and the frames cover the same
 * window however long a CDP round trip takes on a loaded host.
 */
async function sampleFrames(page: Page, ms: number, minFrames: number, opts: SampleOptions = {}): Promise<FrameSample> {
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
  const probe = await page.evaluate(
    ([sampleMs, n, stayOn]) =>
      new Promise<{ left: string | null; units: { min: number; max: number } | null }>((resolve) => {
        const w = window as FrameClockWindow;
        const tc = window.__towerclash;
        const start = performance.now();
        const n0 = w.__qaFrames!.length;
        let units: { min: number; max: number } | null = null;
        const wait = (): void => {
          const screen = tc.getScreen();
          if (stayOn && screen !== stayOn) return resolve({ left: screen, units });
          const u = screen === 'play' ? tc.getState()?.units.length : undefined;
          if (u !== undefined) units = units ? { min: Math.min(units.min, u), max: Math.max(units.max, u) } : { min: u, max: u };
          if (performance.now() - start >= sampleMs && w.__qaFrames!.length - n0 >= n) resolve({ left: null, units });
          else requestAnimationFrame(wait);
        };
        requestAnimationFrame(wait);
      }),
    [ms, minFrames, opts.stayOn ?? ''] as const,
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
    left: probe.left,
    units: probe.units,
  };
}

/**
 * BUG-55: the fixed calibration workload — a 1080 × 1920 canvas shown full-viewport and repainted on
 * every frame, close to a title frame's raster (sea, ground layer, shadowed shapes, gradients, text).
 * Nothing here comes from src/, so a game change never moves it; `window.__towerclash` is a stub so
 * `sampleFrames` can guard the "screen".
 */
const CALIBRATION_PAGE = `<!doctype html><html><head><style>html,body{margin:0;height:100%;overflow:hidden;background:#000}
canvas{display:block;width:100vw;height:100vh}</style></head><body><canvas id="c" width="1080" height="1920"></canvas><script>
window.__towerclash = { getScreen: () => 'calibration', getState: () => null };
const W = 1080, H = 1920, ctx = document.getElementById('c').getContext('2d');
const layer = document.createElement('canvas');
layer.width = W; layer.height = H;
const l = layer.getContext('2d');
const isle = l.createRadialGradient(540, 980, 60, 540, 980, 560);
isle.addColorStop(0, '#9bd36a'); isle.addColorStop(0.7, '#6fb24a'); isle.addColorStop(1, '#e8d49a');
l.fillStyle = isle;
l.beginPath(); l.ellipse(540, 980, 500, 760, 0, 0, Math.PI * 2); l.fill();
for (let i = 0; i < 60; i++) {
  l.fillStyle = 'hsl(' + ((i * 37) % 360) + ',45%,' + (30 + (i % 5) * 8) + '%)';
  l.beginPath(); l.ellipse(160 + ((i * 97) % 760), 360 + ((i * 151) % 1200), 30 + (i % 7) * 6, 18 + (i % 5) * 5, i, 0, Math.PI * 2); l.fill();
}
const sea = ctx.createLinearGradient(0, 0, 0, H);
sea.addColorStop(0, '#2a8fd8'); sea.addColorStop(1, '#0d4f8f');
const draw = (t) => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = sea; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.35; ctx.drawImage(layer, 8 * Math.sin(t / 700), 14); ctx.globalAlpha = 1;
  ctx.drawImage(layer, 0, 0);
  for (let i = 0; i < 16; i++) {
    const x = 140 + ((i * 211) % 800), y = 420 + ((i * 173) % 1100) + 6 * Math.sin(t / 500 + i);
    const g = ctx.createRadialGradient(x - 10, y - 12, 4, x, y, 46);
    g.addColorStop(0, '#fff'); g.addColorStop(1, i % 2 ? '#d94a3a' : '#3a6fd9');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 46, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 10;
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? '#ffd23f' : '#fff7e6';
    ctx.beginPath(); ctx.roundRect(150 + (i % 2) * 400, 1300 + Math.floor(i / 2) * 150, 380, 120, 36); ctx.fill();
  }
  ctx.fillStyle = '#fff7e6'; ctx.font = 'bold 150px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('TOWER', 540, 560 + 8 * Math.sin(t / 900)); ctx.fillText('CLASH', 540, 720 + 8 * Math.sin(t / 900 + 0.8));
  ctx.restore();
  ctx.fillStyle = '#1b2a3a'; ctx.font = '48px sans-serif'; ctx.textAlign = 'center';
  for (let i = 0; i < 6; i++) ctx.fillText('BUTTON ' + i, 340 + (i % 2) * 400, 1372 + Math.floor(i / 2) * 150);
  requestAnimationFrame(draw);
};
requestAnimationFrame(draw);
</script></body></html>`;

/** BUG-55: this worker's host calibration (measured once, by the first test that needs it). */
interface HostCalibration {
  /** Main-thread work per frame of CALIBRATION_PAGE, ms (thread CPU, same measure as the gates). */
  calibMs: number;
  frames: number;
  /** calibMs / CALIBRATION_REF_MS, before the CI rule and the floor of 1. */
  ratio: number;
  /** The budget multiplier: 1 on CI, else max(1, ratio). */
  factor: number;
  ci: boolean;
}
let hostCalibration: HostCalibration | null = null;

/** BUG-55: the budget factor for a measured ratio; CI keeps the absolute budget (factor 1). */
function hostFactor(ratio: number, ci: boolean): number {
  return ci ? 1 : Math.max(1, ratio);
}

/** BUG-55: measures CALIBRATION_PAGE on `page` (before it navigates to the game) once per worker. */
async function calibrateHost(page: Page): Promise<HostCalibration> {
  if (hostCalibration) return hostCalibration;
  await page.setContent(CALIBRATION_PAGE);
  // warm-up: the layer paint and the first frames' allocation are not part of the per-frame cost
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let n = 0;
        const f = (): void => void (++n >= 10 ? resolve() : requestAnimationFrame(f));
        requestAnimationFrame(f);
      }),
  );
  const s = await sampleFrames(page, CALIBRATION_SAMPLE_MS, MIN_FRAMES.screen, { stayOn: 'calibration' });
  expect(s.frames, 'the calibration sample must hold a meaningful number of frames').toBeGreaterThanOrEqual(MIN_FRAMES.screen);
  expect(s.work, 'the calibration page must have done measurable work').toBeGreaterThan(0);
  const ci = !!process.env.CI;
  const ratio = s.work / CALIBRATION_REF_MS;
  hostCalibration = { calibMs: s.work, frames: s.frames, ratio, factor: hostFactor(ratio, ci), ci };
  return hostCalibration;
}

function describeHost(h: HostCalibration): string {
  return (
    `host calib ${h.calibMs.toFixed(1)} ms / frame over ${h.frames} frames, ref ${CALIBRATION_REF_MS} → ratio ${h.ratio.toFixed(2)}, ` +
    `factor ${h.factor.toFixed(2)}${h.ci ? ' (CI: forced to 1)' : ''}, ceiling ${HOST_FACTOR_CEILING}`
  );
}
function frameBudget(h: HostCalibration): number {
  return FRAME_WORK_BUDGET_MS * h.factor;
}
/** BUG-55: a host slower than HOST_FACTOR_CEILING × the reference is not a valid measurement — skip with the numbers, never pass. */
function skipIfHostTooSlow(h: HostCalibration): void {
  if (h.factor <= HOST_FACTOR_CEILING) return;
  const why = `host too slow for a perf measurement (factor ${h.factor.toFixed(2)} > ${HOST_FACTOR_CEILING}) — ${describeHost(h)}`;
  test.info().annotations.push({ type: 'skipped-reason', description: why });
  console.log(`[perf] ${why}`);
  test.skip(true, why);
}

function describeSample(label: string, f: FrameSample, h: HostCalibration): string {
  const wall = f.deltas.length
    ? `median ${median(f.deltas).toFixed(1)} ms, p95 ${percentile(f.deltas, 95).toFixed(1)} ms, max ${Math.max(...f.deltas).toFixed(1)} ms`
    : 'no intervals';
  return (
    `${label}: main-thread work ${f.work.toFixed(1)} ms / frame (script ${f.script.toFixed(1)}, layout ${f.layout.toFixed(1)}, style ${f.style.toFixed(1)}; budget ${frameBudget(h).toFixed(1)} = ${FRAME_WORK_BUDGET_MS} × ${h.factor.toFixed(2)}) ` +
    `over ${f.frames} frames in ${f.windowMs.toFixed(0)} ms — wall-clock interval (not gated): ${wall}` +
    (f.units ? `; units on the map ${f.units.min}–${f.units.max}` : '') +
    (f.left ? `; LEFT the sampled screen for "${f.left}" (sample cut short)` : '')
  );
}
/** Every `[perf]` line ends with the host calibration (BUG-55). */
function report(summary: string, h: HostCalibration): string {
  const line = `${summary}; ${describeHost(h)}`;
  console.log(`[perf] ${line}`);
  test.info().annotations.push({ type: 'perf', description: line });
  return line;
}
/** The sample is well-formed (enough frames inside the metrics window, measurable work) and within the host-scaled budget. */
function expectFrameWork(f: FrameSample, minFrames: number, summary: string, h: HostCalibration): void {
  expect(f.frames, `must have sampled a meaningful number of frames — ${summary}`).toBeGreaterThanOrEqual(minFrames);
  expect(f.work, `the main thread must have done measurable work — ${summary}`).toBeGreaterThan(0);
  const budget = frameBudget(h);
  expect(budget, `BUG-55: the budget is ${FRAME_WORK_BUDGET_MS} ms × a factor in [1, ${HOST_FACTOR_CEILING}]`).toBeLessThanOrEqual(FRAME_WORK_BUDGET_MS * HOST_FACTOR_CEILING);
  expect(f.work, summary).toBeLessThanOrEqual(budget);
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
  test(`level ${HIGHEST} seed ${PLAY_SEED} at x${PLAY_SPEED} with autoplay, play frames only: main-thread work <= ${FRAME_WORK_BUDGET_MS} ms per frame`, async ({ page }) => {
    test.setTimeout(60_000); // ok: 13 s idle (2 s calibration + 8 s sample + boot), 2026-10-23; the sample stretches until 120 frames on a loaded host
    const host = await calibrateHost(page);
    skipIfHostTooSlow(host);
    const pageErrors = await gotoTitle(page);
    // QA-27: speed, seed and the bot are set in the same task as the start, so the match is the headless seed's from tick 0
    expect(
      await page.evaluate(
        ([id, seed, speed]) => {
          const tc = window.__towerclash;
          tc.setSpeed(speed);
          const started = tc.loadLevel(id, seed);
          tc.autoplay();
          return started;
        },
        [HIGHEST, PLAY_SEED, PLAY_SPEED] as const,
      ),
    ).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__towerclash.getScreen())).toBe('play');
    expect(await page.evaluate(() => window.__towerclash.getSpeed())).toBe(PLAY_SPEED);
    const simStart = await page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
    // ART-24: the budget is measured on the default play view — the flat map with the zoomed buildings / units
    // (the ART-21 perspective camera is the ?tilt=0.72 override): the far shore is where the flat letterbox puts it
    const drop = await farShoreDrop(page);
    expect(Math.abs(drop), 'the default play view is the flat map: the far shore is not dropped (CSS px)').toBeLessThan(0.5);

    const f = await sampleFrames(page, SAMPLE_MS, MIN_FRAMES.play, { stayOn: 'play' });
    const simEnd = await page.evaluate(() => window.__towerclash.getState()?.time ?? -1);
    const screenAfter = await page.evaluate(() => window.__towerclash.getScreen());

    const summary =
      `${describeSample(`level ${HIGHEST} seed ${PLAY_SEED} x${PLAY_SPEED} autoplay`, f, host)}; ` +
      `sim ${simStart} → ${simEnd} ms (${((simEnd - simStart) / 1000).toFixed(1)} s sim), screen after: ${screenAfter}, default flat view (far shore +${drop.toFixed(0)} CSS px)`;
    report(summary, host);

    expect(simEnd, 'sim must have advanced while sampling').toBeGreaterThan(simStart);
    // QA-27: the worst case is measured on play frames only — the match may not end inside the window
    expect(f.left, `every sampled frame is on the play screen — ${summary}`).toBeNull();
    expect(screenAfter, `the match is still running after the sample — ${summary}`).toBe('play');
    expect(pageErrors).toEqual([]);
    expectFrameWork(f, MIN_FRAMES.play, summary, host);
  });

  test(`level ${GROUND_BUILD_LEVEL} ground image (ART-21 per-row warp, ?tilt=0.72) builds within ${GROUND_BUILD_MAX_RATIO}× the flat build (ceiling ${GROUND_BUILD_CEILING_MS} ms) at ${CPU_THROTTLE}x CPU`, async ({ page }) => {
    // ART-24: the perspective camera is an override now; the gate keeps guarding its build, the flat default is sampled alongside
    const host = await calibrateHost(page); // printed only: this gate is relative to the flat build of the same run
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
    report(summary, host);

    expect(tilted.every(Number.isFinite), 'getGroundBuildMs answers on the play screen').toBe(true);
    expect(await page.evaluate(() => window.__towerclash.getScreen())).toBe('play');
    expect(pageErrors).toEqual([]);
    expect(Math.min(...tilted), summary).toBeLessThan(GROUND_BUILD_CEILING_MS);
    expect(median(tilted), `${summary} — camera build must stay within ${GROUND_BUILD_MAX_RATIO}× the flat build (+${GROUND_BUILD_RATIO_SLACK_MS} ms)`).toBeLessThan(median(flat) * GROUND_BUILD_MAX_RATIO + GROUND_BUILD_RATIO_SLACK_MS);
  });

  test(`title screen idle: main-thread work <= ${FRAME_WORK_BUDGET_MS} ms per frame`, async ({ page }) => {
    const host = await calibrateHost(page);
    skipIfHostTooSlow(host);
    const pageErrors = await gotoTitle(page);
    const f = await sampleFrames(page, SCREEN_SAMPLE_MS, MIN_FRAMES.screen, { stayOn: 'title' });
    const screenAfter = await page.evaluate(() => window.__towerclash.getScreen());
    const summary = `${describeSample('title idle', f, host)}; screen after: ${screenAfter}`;
    report(summary, host);

    expect(screenAfter, 'nothing may navigate away from the title on its own').toBe('title');
    expect(pageErrors).toEqual([]);
    expectFrameWork(f, MIN_FRAMES.screen, summary, host);
  });

  test(`shop screen: main-thread work <= ${FRAME_WORK_BUDGET_MS} ms per frame`, async ({ page }) => {
    const host = await calibrateHost(page);
    skipIfHostTooSlow(host);
    const pageErrors = await gotoTitle(page);
    const hasOpenShop = await page.evaluate(() => typeof (window.__towerclash as OptionalDebug).openShop === 'function');
    if (!hasOpenShop) {
      const why = `window.__towerclash.openShop is not exposed yet (economy UI in progress) — shop perf not measured; ${describeHost(host)}`;
      test.info().annotations.push({ type: 'skipped-reason', description: why });
      console.log(`[perf] ${why}`);
      test.skip(true, why);
    }

    await page.evaluate(() => (window.__towerclash as OptionalDebug).openShop!());
    await expect.poll(() => page.evaluate(() => window.__towerclash.getScreen())).not.toBe('title');
    const shopScreen = await page.evaluate(() => window.__towerclash.getScreen());
    const f = await sampleFrames(page, SCREEN_SAMPLE_MS, MIN_FRAMES.screen, { stayOn: shopScreen });
    const screenAfter = await page.evaluate(() => window.__towerclash.getScreen());
    const summary = `${describeSample(`shop (screen "${shopScreen}")`, f, host)}; screen after: ${screenAfter}`;
    report(summary, host);

    expect(screenAfter, 'the shop must stay open while idle').toBe(shopScreen);
    expect(pageErrors).toEqual([]);
    expectFrameWork(f, MIN_FRAMES.screen, summary, host);
  });
});
