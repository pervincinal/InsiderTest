import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';

/*
 * AUD-Q12 (2026-11-02): memory over a long session. Nothing measured JS heap, DOM or canvas growth across
 * many level loads, and MM-4's canvas estimate was never re-read on an iPhone-class screen. This spec runs in
 * its own Playwright project `soak` (playwright.config.ts; chromium, one worker, 430 × 932 CSS px at DPR 3 —
 * the stakeholder's phone as gestures430.spec.ts models it; `chromium`'s testIgnore leaves it out, so the
 * shards never run it). `npm run e2e:soak`; CI job `e2e (soak)`.
 *
 * Test 1, the soak: one page, booted once to the title, then every authored level in play order (1 → 50):
 * `loadLevel(id, SEED)` + `startMatch()` (the AUD-B11 lesson card holds a match until a first input) +
 * the reference bot (`autoplay`) at ×SOAK_SPEED until the result screen, and straight on to the next level
 * from that result screen — never a reload, so whatever a level leaves behind stays in the page; then lap 2,
 * levels 1–LAP2_LEVELS once more (a rise that stops there was bounded per-level caches, one that goes on is a
 * per-match leak). Before
 * level 1 and after every SAMPLE_EVERY-th level, on the result screen, the page's garbage is collected twice
 * (CDP `HeapProfiler.collectGarbage`) and sampled: `Performance.getMetrics` (JSHeapUsedSize, JSHeapTotalSize,
 * Nodes, Documents, JSEventListeners, LayoutCount), `performance.memory` (precise: the project launches with
 * `--enable-precise-memory-info`), the live `<canvas>` elements and their backing stores, and the node count
 * attached to the document (Nodes − attached ≈ detached nodes still referenced from JS, e.g. off-screen
 * canvases such as the terrain cache). Gates (after level 10 = warm: every lazy chunk, the AI, the terrain
 * cache's four slots and the result chunk are in by then):
 *   - every level reached a result screen (won or lost; the outcome is reported, the playtest gates own wins);
 *   - post-GC heap after the last level and after lap 2 ≤ post-GC heap after level 10 × HEAP_GROWTH_RATIO +
 *     HEAP_SLACK_MB;
 *   - Nodes and Documents within ± DOM_SLACK of their level-10 value at every later sample, the same number
 *     of `<canvas>` elements in the DOM;
 *   - no uncaught page error.
 * Prints a `[soak]` table (one row per sample), a `[soak-canvas]` line and a `[soak-summary]` line (a
 * `::notice` on GitHub Actions, so the numbers are readable on the check run without the log).
 *
 * Test 2, MM-4: the same screen at the three DPR caps — `?dprcap=2` (the native shell's cap, DPR_CAP.native),
 * the default web cap (2.5) and `?dprcap=3` (uncapped) — on level 15 (docs/MOBILE.md §9.1's level): one
 * `[soak-canvas]` line each with the three layers' backing stores (canvas.width × canvas.height × 4 bytes =
 * CSS w × CSS h × 4 × dpr² at the effective dpr) against MM-4's estimate. These are the bytes the browser
 * allocates; a GPU-backed canvas on the phone may hold a second copy, so the device figure still needs
 * TF-12 / TF-13 on the stakeholder's phone (MM-4 stays open for that half).
 *
 * Budget, measured 2026-11-02 on the 4-core container: levels 1–50 + test 2 in 5.4 min (load ≈ 1–3; lap 1 293 s,
 * level 39 the slowest at 11.6 s), with lap 2 8.4 min at load 23–31 (lap 1 335 s, lap 2 87 s) — all 60 matches
 * won, heap L10 5.8–6.0 → L50 8.3 MB, lap 2 −0.26 MB (BACKLOG AUD-Q12 has the table). Per level the poll waits
 * up to LEVEL_RESULT_TIMEOUT_MS of wall clock; a match that runs to the sim's time cap ends long before that at ×10.
 */

/**
 * After the last level, the first LAP2_LEVELS levels once more on the same page (their chunks, terrain and
 * sprites are cached by then): a heap that kept rising through lap 1 and stops here was filling bounded caches
 * (one entry per level); one that keeps rising by the same step per match is a leak. Sampled and gated like lap 1.
 */
const LAP2_LEVELS = 10;
/** The match seed every level is played with (the playtest's seed 1; the browser's outcome is reported, not gated). */
const SEED = 1;
/** Sim speed of the soak (app.setSpeed clamps to 0.1..20). */
const SOAK_SPEED = 10;
/** Sample after every this many levels (and once on the title before level 1). */
const SAMPLE_EVERY = 10;
/** The warm sample the gates compare against (after this level). */
const WARM_LEVEL = 10;
/** AUD-Q12 gate: post-GC heap after the last level ≤ warm heap × this + HEAP_SLACK_MB. */
const HEAP_GROWTH_RATIO = 1.25;
const HEAP_SLACK_MB = 4;
/** AUD-Q12 gate: Nodes / Documents stay within ± this of the warm sample. */
const DOM_SLACK = 20;
/** Wall clock one level may take to reach its result screen at ×SOAK_SPEED. */
const LEVEL_RESULT_TIMEOUT_MS = 120_000;
/** The phone (gestures430.spec.ts PHONE, playwright.config.ts `soak`). */
const PHONE = { width: 430, height: 932, dpr: 3 } as const;
/** src/render/view.ts DPR_CAP. */
const DPR_CAP = { native: 2, web: 2.5, max: 3 } as const;
/** docs/MOBILE.md §9.1 measured level 15 for the canvas table. */
const CANVAS_LEVEL = 15;
const MB = 1024 * 1024;

const LEVELS_DIR = new URL('../src/levels/', import.meta.url);
const LEVEL_IDS = readdirSync(LEVELS_DIR)
  .filter((f) => /^\d{3}-.*\.json$/.test(f))
  .map((f) => (JSON.parse(readFileSync(new URL(f, LEVELS_DIR), 'utf8')) as { id: number }).id)
  .sort((a, b) => a - b);
/** Lap 1 = every authored level in play order, lap 2 = the first LAP2_LEVELS again. */
const PLAY_ORDER = [...LEVEL_IDS, ...LEVEL_IDS.slice(0, LAP2_LEVELS)];
const LAST = LEVEL_IDS.length;
/** Table label of the sample taken after `played` matches. */
const sampleLabel = (played: number): string => (played <= LAST ? `L${played}` : `L${LAST}+${LEVEL_IDS[0]}–${LEVEL_IDS[played - LAST - 1]}`);

interface CanvasInfo {
  id: string;
  width: number;
  height: number;
  cssWidth: number;
  cssHeight: number;
}
interface Sample {
  /** Matches played before the sample (0 = the title, before level 1; > LAST = lap 2). */
  level: number;
  label: string;
  heapUsed: number;
  heapTotal: number;
  /** performance.memory.usedJSHeapSize, or null where the browser has none. */
  memUsed: number | null;
  nodes: number;
  /** Nodes reachable from the document (TreeWalker SHOW_ALL + the document itself). */
  attached: number;
  documents: number;
  listeners: number;
  layouts: number;
  canvases: CanvasInfo[];
  screen: string;
  /** Wall clock since the soak's first level started, s. */
  wallS: number;
}
interface LevelRun {
  id: number;
  outcome: string;
  simS: number;
  wallS: number;
}

const mb = (bytes: number): string => (bytes / MB).toFixed(2);
const canvasBytes = (c: CanvasInfo): number => c.width * c.height * 4;
const screenOf = (page: Page): Promise<string> => page.evaluate(() => window.__towerclash.getScreen());

async function boot(page: Page, query = ''): Promise<string[]> {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  await page.goto(query ? `/?${query}` : '/');
  await page.waitForFunction(() => typeof window.__towerclash?.loadLevel === 'function');
  await expect.poll(() => screenOf(page)).toBe('title');
  return pageErrors;
}

async function readCanvases(page: Page): Promise<CanvasInfo[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('canvas')].map((c) => ({ id: c.id, width: c.width, height: c.height, cssWidth: c.clientWidth, cssHeight: c.clientHeight })),
  );
}

/** Two full GCs (the second collects what the first's finalizers released), then every counter. */
async function sample(page: Page, cdp: CDPSession, level: number, t0: number): Promise<Sample> {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  const page_ = await page.evaluate(() => {
    const walker = document.createTreeWalker(document, NodeFilter.SHOW_ALL);
    let attached = 1; // the document itself
    while (walker.nextNode()) attached++;
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return { attached, memUsed: mem ? mem.usedJSHeapSize : null, screen: window.__towerclash.getScreen() };
  });
  return {
    level,
    label: sampleLabel(level),
    heapUsed: m.JSHeapUsedSize ?? NaN,
    heapTotal: m.JSHeapTotalSize ?? NaN,
    memUsed: page_.memUsed,
    nodes: m.Nodes ?? NaN,
    attached: page_.attached,
    documents: m.Documents ?? NaN,
    listeners: m.JSEventListeners ?? NaN,
    layouts: m.LayoutCount ?? NaN,
    canvases: await readCanvases(page),
    screen: page_.screen,
    wallS: (Date.now() - t0) / 1000,
  };
}

function describeCanvases(cs: CanvasInfo[]): string {
  const total = cs.reduce((n, c) => n + canvasBytes(c), 0);
  return `${cs.map((c) => `#${c.id || '?'} ${c.width}×${c.height} (css ${c.cssWidth}×${c.cssHeight}) ${mb(canvasBytes(c))} MB`).join(', ')} = ${mb(total)} MB`;
}

/** MM-4's estimate for one full-viewport layer at `dpr`: CSS w × CSS h × 4 × dpr². */
const layerEstimate = (dpr: number): number => PHONE.width * PHONE.height * 4 * dpr * dpr;

function notice(title: string, line: string): void {
  if (process.env.GITHUB_ACTIONS) console.log(`::notice title=${title}::${line}`);
}

test.describe('Tower Clash soak (AUD-Q12)', () => {
  test(`levels ${LEVEL_IDS[0]}–${LEVEL_IDS[LEVEL_IDS.length - 1]} back to back at x${SOAK_SPEED} without a reload, then ${LEVEL_IDS[0]}–${LEVEL_IDS[LAP2_LEVELS - 1]} again: heap, DOM and canvases stay flat`, async ({ page }) => {
    test.setTimeout(1_200_000); // 20 min: one long session by design (measured runtime in the [soak-summary] line and BACKLOG AUD-Q12)
    const pageErrors = await boot(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const t0 = Date.now();
    await page.evaluate((speed) => window.__towerclash.setSpeed(speed), SOAK_SPEED);
    const samples: Sample[] = [await sample(page, cdp, 0, t0)];
    const runs: LevelRun[] = [];
    for (const [i, id] of PLAY_ORDER.entries()) {
      const started = Date.now();
      expect(
        await page.evaluate(
          ([lid, seed]) => {
            const tc = window.__towerclash;
            const p = tc.loadLevel(lid, seed);
            tc.startMatch(); // AUD-B11: the lesson card holds the match until a first input
            tc.autoplay();
            return p;
          },
          [id, SEED] as const,
        ),
        `loadLevel(${id}) from the ${i === 0 ? 'title' : 'previous result screen'}`,
      ).toBe(true);
      expect(await page.evaluate(() => window.__towerclash.getState()?.levelId), `level ${id} is the one on screen`).toBe(id);
      await expect
        .poll(() => screenOf(page), { timeout: LEVEL_RESULT_TIMEOUT_MS, intervals: [250], message: `level ${id} reaches its result screen at x${SOAK_SPEED}` })
        .toBe('result');
      const res = await page.evaluate(() => ({ outcome: window.__towerclash.getResult()?.outcome ?? 'none', simMs: window.__towerclash.getState()?.time ?? -1 }));
      runs.push({ id, outcome: res.outcome, simS: res.simMs / 1000, wallS: (Date.now() - started) / 1000 });
      expect(['won', 'lost'], `level ${id}: the result screen reports an outcome`).toContain(res.outcome);
      if ((i + 1) % SAMPLE_EVERY === 0 || i + 1 === LAST || i === PLAY_ORDER.length - 1) samples.push(await sample(page, cdp, i + 1, t0));
    }
    const totalS = (Date.now() - t0) / 1000;
    await cdp.detach();

    // the table
    console.log(`[soak] seed ${SEED}, x${SOAK_SPEED}, ${PHONE.width}×${PHONE.height} DPR ${PHONE.dpr}, post-GC samples on the result screen (L0 = title before level 1; L${LAST}+… = lap 2)`);
    console.log('[soak] after    | heap used MB | heap total MB | perf.memory MB | nodes | attached | detached≈ | docs | listeners | layouts | canvases (MB) | wall s');
    for (const s of samples) {
      const cv = s.canvases.reduce((n, c) => n + canvasBytes(c), 0);
      console.log(
        `[soak] ${s.label.padEnd(8)} | ${mb(s.heapUsed).padStart(12)} | ${mb(s.heapTotal).padStart(13)} | ${(s.memUsed === null ? 'n/a' : mb(s.memUsed)).padStart(14)} | ` +
          `${String(s.nodes).padStart(5)} | ${String(s.attached).padStart(8)} | ${String(s.nodes - s.attached).padStart(9)} | ${String(s.documents).padStart(4)} | ` +
          `${String(s.listeners).padStart(9)} | ${String(s.layouts).padStart(7)} | ${s.canvases.length} (${mb(cv)}) | ${s.wallS.toFixed(0)}`,
      );
    }
    const lost = runs.filter((r) => r.outcome !== 'won');
    const slowest = [...runs].sort((a, b) => b.wallS - a.wallS).slice(0, 3);
    console.log(
      `[soak] levels: ${runs.length}, won ${runs.length - lost.length}${lost.length ? ` (not won: ${lost.map((r) => `${r.id} ${r.outcome}`).join(', ')})` : ''}; ` +
        `sim ${runs.reduce((n, r) => n + r.simS, 0).toFixed(0)} s total; slowest wall: ${slowest.map((r) => `${r.id} ${r.wallS.toFixed(1)} s (sim ${r.simS.toFixed(1)} s)`).join(', ')}`,
    );
    const last = samples.find((s) => s.level === LAST)!;
    const lap2 = samples[samples.length - 1]!;
    const canvasLine = `${PHONE.width}×${PHONE.height} DPR ${PHONE.dpr}, web cap ${DPR_CAP.web}, after ${last.label}: ${describeCanvases(last.canvases)}; MM-4 estimate ${mb(layerEstimate(DPR_CAP.web))} MB / layer at ${DPR_CAP.web} (uncapped ${mb(layerEstimate(PHONE.dpr))}); the device figure needs TF-12 / TF-13 on the phone`;
    console.log(`[soak-canvas] ${canvasLine}`);

    // the gates
    const warm = samples.find((s) => s.level === WARM_LEVEL);
    expect(warm, `a sample after level ${WARM_LEVEL}`).toBeDefined();
    expect(runs.map((r) => r.id), 'every authored level was played, then lap 2').toEqual(PLAY_ORDER);
    expect(last, `a sample after level ${LAST}`).toBeDefined();
    expect(lap2.level, 'the lap-2 sample is the last one').toBe(PLAY_ORDER.length);
    const heapLimit = warm!.heapUsed * HEAP_GROWTH_RATIO + HEAP_SLACK_MB * MB;
    const later = samples.filter((s) => s.level > WARM_LEVEL);
    const heaps = samples.filter((s) => s.level >= WARM_LEVEL && s.level <= LAST).map((s) => s.heapUsed);
    const monotonic = heaps.every((h, k) => k === 0 || h > heaps[k - 1]!);
    const nodeDrift = Math.max(...later.map((s) => Math.abs(s.nodes - warm!.nodes)));
    const docDrift = Math.max(...later.map((s) => Math.abs(s.documents - warm!.documents)));
    const summary =
      `${runs.length} matches (levels 1–${LAST} + lap 2 ${lap2.label.slice(lap2.label.indexOf('+') + 1)}) at x${SOAK_SPEED} in ${(totalS / 60).toFixed(1)} min (won ${runs.length - lost.length}); ` +
      `post-GC heap L${WARM_LEVEL} ${mb(warm!.heapUsed)} → L${LAST} ${mb(last.heapUsed)} MB (limit ${mb(heapLimit)} = ×${HEAP_GROWTH_RATIO} + ${HEAP_SLACK_MB}; ` +
      `${monotonic ? 'monotonic rise' : 'not monotonic'} over lap 1's ${heaps.length} samples) → lap 2 ${mb(lap2.heapUsed)} MB (${lap2.heapUsed >= last.heapUsed ? '+' : '−'}${mb(Math.abs(lap2.heapUsed - last.heapUsed))} vs L${LAST}); ` +
      `nodes ${warm!.nodes} → ${last.nodes} (max drift ${nodeDrift}, ± ${DOM_SLACK}), documents ${warm!.documents} → ${last.documents} (max drift ${docDrift}), ` +
      `canvases ${warm!.canvases.length} → ${last.canvases.length}, page errors ${pageErrors.length}`;
    console.log(`[soak-summary] ${summary}`);
    test.info().annotations.push({ type: 'soak', description: summary }, { type: 'soak-canvas', description: canvasLine });
    notice('soak (AUD-Q12)', summary);
    notice('soak canvas (AUD-Q12 / MM-4)', canvasLine);

    expect(pageErrors, 'no uncaught page error over the whole session').toEqual([]);
    for (const s of [last, lap2]) expect(s.heapUsed, `AUD-Q12: post-GC heap after ${s.label} ≤ L${WARM_LEVEL} × ${HEAP_GROWTH_RATIO} + ${HEAP_SLACK_MB} MB — ${summary}`).toBeLessThanOrEqual(heapLimit);
    for (const s of later) {
      expect(Math.abs(s.nodes - warm!.nodes), `AUD-Q12: Nodes after ${s.label} (${s.nodes}) within ± ${DOM_SLACK} of level ${WARM_LEVEL} (${warm!.nodes})`).toBeLessThanOrEqual(DOM_SLACK);
      expect(Math.abs(s.documents - warm!.documents), `AUD-Q12: Documents after ${s.label} (${s.documents}) within ± ${DOM_SLACK} of level ${WARM_LEVEL} (${warm!.documents})`).toBeLessThanOrEqual(DOM_SLACK);
      expect(s.canvases.length, `AUD-Q12: <canvas> elements after ${s.label}`).toBe(warm!.canvases.length);
      expect(s.screen, `sample after ${s.label} taken on the result screen`).toBe('result');
    }
  });

  test(`MM-4: the three layers' backing stores at ${PHONE.width}×${PHONE.height} DPR ${PHONE.dpr} under the native, web and no cap`, async ({ page }) => {
    test.setTimeout(90_000); // ok: three boots + a level load each, ≈ 15 s idle
    const caps = [
      { label: `native cap ${DPR_CAP.native} (?dprcap=${DPR_CAP.native})`, query: `dprcap=${DPR_CAP.native}`, dpr: DPR_CAP.native },
      { label: `web cap ${DPR_CAP.web} (default)`, query: '', dpr: DPR_CAP.web },
      { label: `uncapped ${DPR_CAP.max} (?dprcap=${DPR_CAP.max})`, query: `dprcap=${DPR_CAP.max}`, dpr: DPR_CAP.max },
    ];
    for (const cap of caps) {
      const pageErrors = await boot(page, cap.query);
      expect(await page.evaluate(([lid, seed]) => window.__towerclash.loadLevel(lid, seed), [CANVAS_LEVEL, SEED] as const)).toBe(true);
      await page.evaluate(() => window.__towerclash.startMatch()); // AUD-B11: the lesson card holds the match until a first input
      await expect.poll(() => page.evaluate(() => window.__towerclash.getState()?.time ?? -1)).toBeGreaterThan(0);
      const cs = await readCanvases(page);
      const total = cs.reduce((n, c) => n + canvasBytes(c), 0);
      const estimate = 3 * layerEstimate(cap.dpr);
      const line = `${PHONE.width}×${PHONE.height} DPR ${PHONE.dpr}, ${cap.label}, level ${CANVAS_LEVEL}: ${describeCanvases(cs)}; MM-4 estimate 3 × ${mb(layerEstimate(cap.dpr))} = ${mb(estimate)} MB (CSS w × h × 4 × ${cap.dpr}²); browser allocation, the device figure needs TF-12 / TF-13 on the phone`;
      console.log(`[soak-canvas] ${line}`);
      test.info().annotations.push({ type: 'soak-canvas', description: line });
      notice('soak canvas (MM-4)', line);
      // the three layers, each full-viewport at the effective dpr (backing = CSS × dpr, rounded by view.ts)
      expect(cs.map((c) => c.id), 'the three PERF-3 layers').toEqual(['ground', 'game', 'hud']);
      for (const c of cs) {
        expect(c.width / c.cssWidth, `#${c.id} backing / CSS width = the effective dpr`).toBeCloseTo(cap.dpr, 1);
        expect(c.height / c.cssHeight, `#${c.id} backing / CSS height = the effective dpr`).toBeCloseTo(cap.dpr, 1);
      }
      expect(Math.abs(total - estimate) / estimate, `${cap.label}: the backing stores match MM-4's CSS × 4 × dpr² estimate within 2 %`).toBeLessThan(0.02);
      expect(pageErrors).toEqual([]);
    }
  });
});
