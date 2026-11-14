# Flake sweep 2: replay / diagnostics / rewind e2e (QA-40, 2026-11-14, qa-engineer)

## Scope
This sweep covers the e2e surface that QA-38 left out: the replay hook in `src/ui/loop.ts` (`speedMax`, SIM-R1…R3 capture), `e2e/replay.spec.ts` (SIM-R1, SIM-R2, SIM-R3), `e2e/diagnostics.spec.ts` (AUD-B6, DIAG-2, QA-39-1, QA-39-2) and the economy.spec rewind test ("defeat → CONTINUE … rewinds").

The question it answers: does the SIM-R3 rewind-gap pin `lost.timeMs - entry.r.toMs < CONTINUE_REWIND_MS + 2000` (commit 1b304e5, widened after CI run 127 shard 2 measured 21 100 ms) hold?

**Build.** The runs used a scratch `vite build` of a `git archive` snapshot of `0491ea8`. Its `tower-clash/` is identical to `e4d8e30`, and the entry chunk is `index-C8eebeDV.js`. The specs and config came from the same snapshot, so another agent editing the working tree could not change them during a run.

**Run settings.** `CI=1`, 2 workers, `--trace off`, `PW_PORT=4191`, `PW_DIST` / `PW_OUTPUT` under the scratchpad. Two busy-loop CPU hogs ran beside every run, on a host with 4 vCPUs and another agent active.

**Browser.** This container ships Playwright build **1243**, not 1194. HEAD's config at the time still pointed at `chromium_headless_shell-1194`, which does not exist here. Runs (a) and (b) therefore went through a scratch `PLAYWRIGHT_BROWSERS_PATH` shim: `chromium-1134/chrome-linux/chrome` → `chromium_headless_shell-1243` (Chrome 153), with the repo config unchanged. The Producer's config fix (`ec7bab2`) landed afterwards. Run (d) uses that config as it is.

**Evidence folder** (outside the repo): `/tmp/claude-0/-home-user-InsiderTest/27ff3ffe-c8bd-51f2-b6a9-550752bc37bb/scratchpad/day57/qa/`
- `out-*.log`: test output for each run.
- `load-*.log`: `uptime` every 15 s during each run.
- `gap/gap.mjs`, `gap/gap-<rate>.log`: the CDP gap study.
- `gap/model.mjs`: the ring model.

## Runs

| Run | What | Result | Wall | Host load (1-min, min–max) |
|---|---|---|---|---|
| (a) | `--repeat-each 5` replay.spec + diagnostics.spec + economy `-g rewind/CONTINUE` (10 tests × 5) | **50/50**, 0 retries | 230 s | 3.9–10.9 |
| (b) | chromium `--shard=2/2` (includes replay.spec) | **82/82** | 305 s | 7.2–10.7 |
| (d) | HEAD `ec7bab2` (QA-39-4 `had` column, Producer's config fix; plain repo config, no shim): `--repeat-each 5` diagnostics.spec + SIM-R3 | **20/20** | 112 s | 1.0–5.1 |

Two earlier attempts at (a) are discarded because of setup problems, not flakes:
1. The 1194 executable was missing, so 10/10 tests failed at launch.
2. The run read the specs from the live working tree while the frontend engineer's uncommitted QA-39-4 `diagnostics.spec.ts` (`had: true/false`) was already there but my dist was not. That gave 2 failures on `toMatchObject({… had })`. It is a spec/dist mismatch and is gone in (d).

## SIM-R3 gap study
Script: `gap.mjs`. It runs the spec's scenario through `window.__towerclash`:
1. Level 15 seed 1, `setSpeed(20)`, `economy.autoLose()`, wait for `result`.
2. `resultAction('continueAd')`, then `getReplay()` → the `r` entry.

It uses the headless shell 1243, Pixel 5, `Emulation.setCPUThrottlingRate`, and a rAF probe that records the sim advance per frame. There were no extra hogs. Load is the other agent's: 5.8–7.6 during the 1×–8× runs and about 1 during the 2× runs.

| CPU rate | n | min | median | max | frames | fps | max sim per frame |
|---|---|---|---|---|---|---|---|
| 1× | 12 | 20 000 | 20 500 | 21 050 | 300 / 350 / 500 ms mixed | 40–47 | 500 ms |
| 2× | 12 | 20 100 | 20 500 | 20 800 | | 20–22 | 500 ms |
| 4× | 12 | 20 100 | 20 900 | 20 900 | almost all 500 | 10–12 | 500 ms |
| 8× | 12 | 20 900 | 20 900 | 20 900 | all 500 | 5 | 500 ms |

- Every run lost at `34 400` ms of sim, so the loss time is deterministic.
- Every run had exactly 1 `r` entry and 0 page errors.
- Wall time to the loss was 2.7–2.9 s at 1×, 6.5–7.7 s at 4× and 14–15 s at 8×.

**Mechanism (`src/sim/snapshot.ts`, `src/ui/play.ts` `update`, `src/ui/loop.ts`).** `ring.record` runs once per frame that ticked. It stores a snapshot when at least 1 000 ms has passed since the last one. One frame advances at most `MAX_TICKS_PER_FRAME × TICK_MS = 500` ms of sim. That cap is already reached at ×20 when the page runs at 40 fps or less, so the 500 ms frame batch is normal at ×20 and does not need a slow runner.

Snapshots are therefore 1 000–1 450 ms apart. `rewind(20 000)` picks the newest snapshot at least 20 000 ms older than the loss. The snapshot after it is at most 19 950 ms older than the loss. So:

**gap ≤ (CONTINUE_REWIND_MS − TICK_MS) + (SNAPSHOT_INTERVAL_MS − TICK_MS + MAX_TICKS_PER_FRAME × TICK_MS) = 19 950 + 1 450 = 21 400 ms**

The loss frame's own batch adds nothing, because the gap is measured from the loss itself. `model.mjs` replays the ring's `record`/`rewind` logic against 200 000 random 1–10-tick batch sequences and gives min 20 000 / max **21 400**.

A steady 500 ms batch (4×, 8×) pins the gap at 20 900. The largest gaps come from mixed batches at 1×–2×, which is consistent with run 127's 21 100 ms.

## Verdict
- The Producer's bound `< CONTINUE_REWIND_MS + 2000` (22 000) is **confirmed**. The worst case by construction is 21 400 ms, a 600 ms margin. The measured maximum was 21 050 ms (CI run 127: 21 100 ms). The comment's reasoning in `e2e/replay.spec.ts` ("snapshots can sit up to 1.5 s apart") is right; the exact figure is 1.45 s. The bound cannot be exceeded without a change to `SNAPSHOT_INTERVAL_MS`, `MAX_TICKS_PER_FRAME`, `TICK_MS` or the ring itself. **No change to e2e/.**
- **Other timing pins** that a 500 ms batch could reach were read:
  - `lost.timeMs ≥ 22 000` (replay.spec and economy.spec): the loss time is deterministic at 34 400.
  - economy.spec `lost.timeMs − cont.timeMs ≥ 15 000`: the speed is ×1 after the tap and the frame `dt` is clamped to 250 ms. This pin would need more than 5 s of wall between the `play` poll and the read, and nothing like that was seen.
  - diagnostics `speed: 20` / `speed: 10` come from `speedMax`, the highest speed, which does not depend on batching.
  - The QA-39-2 copy time `ms` is only logged.
  - SIM-R3's second attempt may differ from run to run, because `toMs` depends on batching. The spec already accepts `won | lost`.

  None of these is batch-sensitive.
- 152 test runs: 0 failed, 0 flaky. The surface is ready for build 27.

## Filed / reported
- No new Bugs entry.
- Reported to the Producer: `scripts/renderIcons.ts`, `scripts/fontAdvances.ts` and `store/tools/renderStoreShots.mjs` still hard-code `chromium_headless_shell-1194/chrome-linux/headless_shell`, the same drift `ec7bab2` fixed in the config. They will fail in this container. Those paths are not QA's.
