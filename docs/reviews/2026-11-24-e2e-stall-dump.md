# e2e stall dump: making the next one-off `screen()` stall diagnosable (QA-46, 2026-11-24, qa-engineer)

## Facts

Two CI stalls in three days, neither reproduced, both of the same shape — a tap or an autoplay followed by an `expect.poll(() => screen(page)).toBe(…)` that never flipped, no page error, no `RENDERER HUNG`:

| Run | Commit | Shard | Where | What the log said |
|---|---|---|---|---|
| 155 | `a994fce` | chromium 1/2 (6.2 min; camera.spec 3.1 min beside it) | `e2e/daily.spec.ts:99` AUD-U23, after `tapRect(page, TITLE_PLAY)` | `expect.poll(screen) → 'levelSelect'` timed out at 15 s **with no received value**; 1.9 s on run 151, 1.6 s locally |
| 148 | `f81eef5` | chromium 2/2 (7.0 min) | `e2e/share.spec.ts:126` `winLevel1` (autoplay at ×10, fresh save) | did not reach `'result'` in 75 s (QA-45) |

Not reproduced before today: daily.spec ×7 beside a full shard-1 run (42/42), shard-1 114/114 (`CI=1`, 2 workers), the CI re-run of the failed shard 114/114. The chromium project blocks service workers, so the BUG-16 worker path is off the table. The CI traces exist in the run artefacts but this environment cannot download GitHub artifact blobs (proxy 403).

**What "no received value" means.** Checked today with a throwaway spec (deleted): Playwright 1.47's `expect.poll` prints `Expected: "levelSelect" / Received: "title"` when the poll function answered at least once with the wrong value, and only `Error: Timeout 15000ms exceeded while waiting on the predicate` — no Expected / Received lines — when the poll function **never resolved**. Run 155's log is the second form, so the page did not answer `page.evaluate(() => window.__towerclash.getScreen())` for 15 s after the PLAY tap. That is a page that stopped running JS (the QA-35 signature) or a main thread starved for 15 s, not a lost tap (a lost tap prints `Received: "title"`). Run 148's log form was not recorded in QA-45.

## What changed (no timeout and no retry setting changed)

- `tower-clash/src/debug.ts`: `QaDebugExtras.stallDump(): StallDump` — a read-only one-shot read on the lazy Playwright surface (`window.__towerclash`, compiled out of store builds). Reads `TowerClashApp.lastFrame`, `LoadingScreen.shownAt` and `PlayScreen.pendingResult` structurally (TypeScript `private` is compile-time only; nothing under `src/` beyond debug.ts was touched).
- `tower-clash/e2e/helpers/screenPoll.ts` (new): `expectScreen(page, name, opts?)` = `expect.poll(() => screen(page), opts).toBe(name)` plus, on timeout only, the dump: two page-side `stallDump()` samples 300 ms apart in one `evaluate` (raced against 5 s — a main thread that never answers is reported as `hung: true`), attached to the test as `screen-stall.json` and appended to the failure message so the plain `list` log carries it. `collectStallDump` / `verdictOf` / `screenName` are exported too.
- Converted to the helper (every timeout and interval kept exactly): `e2e/daily.spec.ts` (22 sites), `e2e/share.spec.ts` (2), `e2e/weekly.spec.ts` (11), `e2e/smoke.spec.ts` (23), `e2e/economy.spec.ts` (25). Direct `expect(await screen(page)).toBe(…)` reads are unchanged (they are not polls).
- Still on the raw poll: none as of 2026-11-25 (QA-47 converted the remaining 127 `expect.poll(() => screen(page)…).toBe(<name>)` sites in 26 specs to `expectScreen`, options passed through unchanged); what remains by design are `saveFailing.spec.ts:56` (`.not.toBe('result')`, a negated poll) and the inline `page.evaluate(() => window.__towerclash.getScreen())` polls in perf / tapSync / stalemate, which are not the `screen(page)` shape.

## What the dump contains

Spec side: `expected`, `timeoutMs`, `at` (wall clock), `url`, `pageClosed`, `hung`, `surface` (the debug chunk installed), `verdict`, `error?`. Page side, twice (`samples[0]`, `samples[1]`, 300 ms apart):

| Field | Tells |
|---|---|
| `screen`, `transitionDone`, `lazyScreensIn`, `pendingStart` | where the app is; whether a FEEL-1-6 slide still holds input; whether the menu chunk is in / a level start is in flight |
| `chunkFailures` (`lazyScreens`, `enMenus`, `ai`, `result`, `hudOverlays`, `level:N` when > 0), `chunksIn`, `toast` | chunk-failed (a "Load failed" toast confirms it) |
| `loading` (`from`, `shownForMs`) | a spinner is current and for how long |
| `frame.lastFrameMs` vs `nowMs`, `sinceLastFrameMs` | the rAF loop: unchanged between the samples = no frame ran = page-starved / hidden / dead |
| `page.visibilityState`, `hidden`, `hasFocus`, `onLine` | a backgrounded or offline page |
| `match` (`current`, `levelId`, `tick`, `timeMs`, `elapsedMs`, `speed`, `paused`, `held`, `stalemateCardUp`, `over`, `outcome`, `resultPending`) | sim-stalled: `timeMs` equal in both samples while frames run (`held` = lesson card, `paused`, `over` + `resultPending` = the result beat / result chunk) |

The `verdict` line is a hint computed from the two samples: `chunk-failed: …`, `page-starved: no frame between the samples`, `sim-stalled: timeMs N in both samples (lesson card holds it)`, `tap-lost? screen stayed 'title' with frames running …`, or `page.evaluate did not answer within 5000 ms … reopen QA-35`.

Forced-stall proof (throwaway spec, 4 tests, deleted afterwards; `CI=1`, scratch dist, `--reporter=list,json`): all four shapes produced the dump in the console log and as a `screen-stall.json` attachment in the JSON report — wrong screen name → `tap-lost? …`; `loadLevel(1, 1)` without `startMatch` → `sim-stalled: timeMs 0 in both samples (lesson card holds it)`; a page whose main thread spins → `hung: true` after 5 s with the QA-35 note. The sim-stalled sample, verbatim (second sample identical but 300 ms later):

```json
{
  "nowMs": 4497.699999999953,
  "screen": "play",
  "transitionDone": true,
  "lazyScreensIn": true,
  "pendingStart": false,
  "chunkFailures": { "lazyScreens": 0, "enMenus": 0, "ai": 0, "result": 0, "hudOverlays": 0 },
  "chunksIn": { "ai": true, "result": true },
  "loading": null,
  "frame": { "lastFrameMs": 4491, "sinceLastFrameMs": 7 },
  "page": { "visibilityState": "visible", "hidden": false, "hasFocus": true, "onLine": true },
  "match": { "current": true, "levelId": 1, "tick": 0, "timeMs": 0, "elapsedMs": 0, "speed": 1, "paused": false, "held": true, "stalemateCardUp": false, "over": false, "outcome": "playing", "resultPending": false },
  "toast": null,
  "speed": 1
}
```

## CI-shaped repro attempt

Host: 4 vCPUs, this container's Chromium headless shell 1243, scratch `vite build` of the working tree (`<scratchpad>/qa-dist`), `CI=1`, 2 workers, `--trace off`, two `node -e 'for(;;){}'` hogs for the whole session (started and killed by one script under a trap; `/proc/loadavg` every 30 s). Evidence: `<scratchpad>/qa46/repro.log`, `pass1.json`, `pass2.json`.

| Pass | What | Result | Wall | 1-min load (start → end, peak) |
|---|---|---|---|---|
| 1 | `e2e/daily.spec.ts` + `e2e/share.spec.ts`, `--repeat-each 10`, 2 workers (100 tests) | **100 passed**, 0 flaky, 0 failed | 434 s (7.2 min) | 2.23 → 5.81, peak 6.69 |
| 2 | `--shard=1/2` of the chromium project (114 tests: audio, camera, daily, diagnostics, dragBand, economy, fullBleed, gestures430, howto, integrity/content), 2 workers | **114 passed**, 0 flaky, 0 failed | 306 s (5.1 min) | 5.81 → 5.30, peak 7.42 |

The two hogs sat at 86–88 % CPU each for the whole 12.3 min (4 vCPUs: the browser and the two workers shared the remaining ≈ 2.3 cores); 5-min load reached 5.67, 15-min 3.51.

Slowest durations of the two tests that stalled on CI (pass 1, n = 10 each; pass 2 ran each once):
- `daily.spec.ts:100` AUD-U23 (run 155's test): **1.7 s, 1.4 s, 1.3 s**, median 1.1 s (pass 2: 1.1 s) — against the 15 s poll that run 155 exhausted.
- `share.spec.ts:127` "win level 1 → SHARE …" (run 148's test): **7.8 s, 7.3 s, 7.2 s**, median 7.2 s — against the 75 s poll that run 148 exhausted.
- Slowest tests overall under the hogs: `daily.spec.ts:232` streak milestone 23.9 / 22.0 / 21.2 s (pass 1); `gestures430.spec.ts:569` 32.4 s, `camera.spec.ts:316` 25.8 / 24.4 / 21.1 s (pass 2). Nothing came within an order of magnitude of its poll budget.

**Reading.** 214/214 under CI-shaped load, both stalling tests ≥ 9× inside their budgets even at their slowest, so neither CI stall is a load-proportional slowdown of the kind two hogs model; whatever hit runs 148 and 155 is a discrete event (a page that stopped answering `evaluate`, see "no received value" above) that ≈ 1 in several hundred shard runs sees. No trace was taken (`--trace off` as planned; nothing failed to retain one). The finding of this item is therefore the instrumentation, not a root cause: the next occurrence will carry the dump.

## Gates

`npm run check` green (225 test files, 2793 tests, 50 levels valid; 1 min 20 s). `npx eslint e2e` clean. The five converted specs once more on the scratch dist without hogs: **26/26 passed** in 1.8 min (`CI=1`, 2 workers, load 2.4). Nothing committed; no timeout, retry or workflow setting changed.

## On the next CI occurrence

1. Open the failing test in the `list` log: the `[screen-stall]` block is under the assertion. Read `verdict` first, then compare `samples[0]` and `samples[1]`:
   - `hung: true` → the renderer's main thread stopped running JS (QA-35 shape). Reopen QA-35; the hunt rig `e2e/tools/hunt.mjs` is the tool to get a stack.
   - `frame.lastFrameMs` equal in both samples, `match.timeMs` equal → no frame ran in 300 ms while `evaluate` still answers: page-starved (look at the shard's other worker and the runner's load) or hidden (`page.hidden`).
   - frames move, `match.timeMs` does not → sim-stalled: `held` (nobody called `startMatch` / the bot never attached), `paused`, or `over` with `resultPending` (the result beat / `chunkFailures.result`).
   - `chunkFailures.* > 0` or `toast: "Load failed"` → chunk-failed; the shard's preview server or the dist snapshot (QA-6 / QA-20).
   - frames move, screen unchanged, `transitionDone: true`, `lazyScreensIn: true` → the tap did not land (hit region / FEEL-1-6 hold); `transitionDone: false` → the slide held input for the whole poll.
2. The same JSON is `screen-stall.json` in the Playwright HTML report / trace artefact of the shard (`playwright-report-e2e-shard-N`), for anyone who can download it.
3. Only then decide whether a timeout is the right fix; this item changed none.
