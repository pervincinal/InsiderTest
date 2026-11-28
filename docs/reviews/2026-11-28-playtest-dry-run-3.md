# Playtest-day dry run 3 (QA-49, 2026-11-28)

Re-run of the QA-42 dry run (`2026-11-15-playtest-dry-run-2.md`) on the current build, the day after PERF-16 (5ba0958) moved the daily / weekly result booking into a lazy `'challenge'` chunk (`src/ui/challengeChunk.ts`, `challengeRecord.ts`). Tree `caa6d13` (HEAD moved to `48f1d22` during the run, a scripts-only QA-48 commit, no change under `tower-clash/src`). Scratch build `npx vite build --outDir <scratch>/qa49-dist --emptyOutDir`, `vite preview` on port 4192, Playwright Chromium headless shell (Chrome 129) with Pixel 5 metrics (393 × 727 viewport, DPR 2.75), clipboard permission granted, service workers blocked. The "tester" is the reference player at **×1**, seed 1 through `loadLevel`, with `economy.autoLose` for the planned losses. Diagnostics, CLEAR LOG, the defeat card's RETRY, the pause card's SPEED toggle, the level map's DAILY / WEEKLY cards and tabs, the result card's NEXT and COPY LOG were tapped through the real UI. Scripts and outputs are in `/tmp/claude-0/-home-user-InsiderTest/27ff3ffe-c8bd-51f2-b6a9-550752bc37bb/scratchpad/qa49/` (`common.cjs`, `session.cjs`, `blocked.cjs`, `probe-poison.cjs`, `probe-result.cjs`, `session.json`, `log.txt`, `2026-11-28-playtest*.csv`, `decide.md`, `hashes.txt`). Screenshots are in `…/scratchpad/pw-qa49/`.

`playtest:log`, `replay.ts` and `playtest:decide` ran from a clean `git archive` of `48f1d22`, whose `src/` matches the build. The shared checkout had another agent's uncommitted `src/ai/` edits in progress, and with those `playtest:log` crashed: `ReferenceError: isFrozen is not defined` at `src/ai/tactics.ts:203`. That crash belongs to the in-progress edit, not to the build.

## Steps and numbers

| Step | What happened | Result |
|---|---|---|
| Save | Levels 1–50 at 3★ except the 15 sample levels; 27 pre-set at 2★ | 12 / 15 sample levels open at boot (17, 33, 50 locked); daily and weekly locked at boot (they unlock in session after 16 and 32) |
| 0a | Settings → About → Diagnostics on (card: 0 rows, off → on) | on |
| 0b | 2 junk rows: level 3 loss ×20, level 1 win ×10; card shows 2 | 2 rows |
| 0c | CLEAR LOG through the card | rows 0, card 0; stored key `{"v":1,"n":{},"rows":[]}`. **The attempt counters are reset now** (QA-42-1 fixed; dry run 2 kept `"n":{"1":1,"3":1}`) |
| 0d | Warm-up after the clear: level 1 win ×10 at 04:18Z | logged as **attempt 1** (dry run 2: attempt 2); `--since` drops it |
| Start | Next UTC minute: **2026-11-28T04:20Z**, sheet note `08:20 (UTC 04:20)` | |
| 1 | 3, 5, 9, 13, 16, 17, 23, 27, 32, 33, 38, 41, 45, 49, 50 at ×1, seed 1 | 13 wins on the first try (level 3 at 3★, 12 at 2★); the seed-1 times are identical to dry run 2 to the millisecond |
| 1 · 23 | autoLose (L, 64.45 s) → defeat card RETRY (new seed 543536654) → reference player | W 50.40 s, 2★, attempt 2 (dry run 2: 44.30 s on another retry seed) |
| 1 · 45 | autoLose (L, 39.25 s) → RETRY (seed 543882986) → autoLose (L, 47.80 s) | never won; `had` 0 on both rows |
| 1 · 17 ×2 | Pause card SPEED ×1 → ×2 (`getSpeed` 1 → 2), resume | W 28.40 s (same sim time as ×1); row `speed` 2, `had` 1 |
| 1 · daily | Level map → DAILY card (tab `daily`) → today's daily: level 11 "Starve the Keep", seed 46982, twist `plain` (sim state matched the card's challenge) | W 30.10 s, 2★, mode `daily` |
| 1 · weekly | Level map → WEEKLY tab → card → this week's (2026-11-23) weekly: level 34 "Weakest Link", seed 4510, twist `lean` (productionMul 0.9), target 30 s | W 55.50 s, 2★, mode `weekly` |
| — | Session wall time 04:20:00 → 04:35:18 (≈ 15.3 min at ×1; dry run 2 ≈ 14 min without a weekly); **0 page errors** | |
| 2 | COPY LOG through Settings → About → clipboard | **191 493 B, 21 rows, 20 `#replay` lines** (1 340 B – 25.8 kB each; the warm-up row is the 21st and the only one without a record), **15 columns**, clipboard = `diag.text()`, toast "Diagnostics log copied", card 21 |
| 3 | `npm run playtest:log -- log.txt --tester dryrun --since 2026-11-28T04:20Z --out … --verify` | exit 0, 26.6 s (load ≈ 1.3–1.7); **21 log rows → 18 attempt rows on 15 levels**; **`--verify: 20/20 MATCH; 1 log row(s) carry no record (only the newest 20 per text do)`** |
| 4 | Hand columns filled as in dry run 2 (named / log on 17, 33, 49; iv 0 on 50; notes on 45 and the ×2 row); `npm run -s playtest:decide -- … --date 2026-11-28` | exit 0, 10.9 s; 18 tries, N = 1, all PROVISIONAL |

`playtest:log` exclusions and warnings (complete list):
- Excluded line 3 (the 04:18Z warm-up): "before --since". Excluded line 22, the daily (level 11), and line 23, the weekly (level 34): "the sheet's sample is campaign only". Both records still verify (rows 20 and 21: MATCH).
- WARNING build "1.0.0 (build 26)" is below build 27. This is expected: `config.buildNumber` is still 26.
- **Gone since dry run 2:** the "first try in this log is the log's attempt 2" warning (QA-42-1). As before, there is no "first_ever left empty" or "speed left empty" warning.

## Focus 1: daily and weekly booked exactly once through the lazy chunk

| | Daily (level 11, card) | Weekly (level 34, WEEKLY tab + card) |
|---|---|---|
| Wallet Δ at booking | gold +50 (30 + 10 × 2★), crystals +5 (REWARD) | gold +100 (WEEKLY_REWARD), crystals +0 (55.5 s > 30 s target) |
| Result card | coinsEarned 50, crystalsEarned 5, no achievements | coinsEarned 100, crystalsEarned 0 |
| Save after | `challenge` = lastWinDay 2026-11-28, streak 1, best {2026-11-28: 2★ 30 100 ms}, milestones [] | `weekly` = lastWinWeek 2026-11-23, streak 1, best {2026-11-23: 2★ 55 500 ms, target false}; `challenge` untouched |
| Map card after NEXT | `done` true, streak 1, best 2★ 30.1 s, DONE badge | `done` true, `target` false, week streak 1, "Best 2★ · 00:55 · 3★ in 00:30", DONE badge (screenshot `qa49-weekly-card-done.png`) |
| Diagnostics | exactly 1 new row: `11,daily,1,won,30100,2,first 1,speed 1,had 0`, with a record | exactly 1 new row: `34,weekly,1,won,55500,2,first 1,speed 1,had 0`, with a record |
| 5 s on the result card | wallet / save / rows unchanged (no second booking) | unchanged |
| Outcome → result screen | 578 ms (last sim tick → `result`) | 653 ms |
| Chunk | `challengeRecord-*.js` was fetched once, 1.6 s after page load (a static dependency of the level map chunk, see below) | same |

Neither challenge touched the campaign ledger (no level stars for 11 or 34). Every expectation from QA-42 holds. The 600 ms beat is unchanged on screen, because the chunk was already loaded when each match started.

**How the chunk actually loads (read from the built graph).** `lazyScreens-*.js` (the level map) and `debug-*.js` (the `window.__towerclash` surface) both **statically** import `./challengeRecord-*.js`, and the entry's `import("./challengeRecord-*.js")` lists it in `lazyScreens`' preload deps. Rollup put `ui/weekly.ts` into that chunk. Through the real UI, a challenge card cannot be tapped before the chunk is in, because the map that shows the card needed it to open. PERF-16's hold-the-beat path is therefore defensive code that the real UI cannot reach on one page. The module's own comment says the same ("normally in already, since the level map … imports the same modules").

## Focus 2: daily with the chunk download blocked

The brief asked for a Playwright `route` → abort on the `challengeRecord-*.js` / `daily-*.js` chunk URLs. Given the graph above, I ran four cases. In each, the debug surface's static import was re-pointed at an aliased URL (`?harness=debug`) so the hooks could still install. The harness is the hooks, not the thing under test.

**(a) Real URL aborted from boot (`blocked.cjs plain daily`).** The title idle warm's request for `challengeRecord-*.js` is aborted. Title PLAY then shows "Couldn't load — check your connection" and **the level map never opens**. After the route is released, every further PLAY tap (4 taps over 35 s, past the 3 s back-off each time) re-fetches `lazyScreens-*.js?r=<t>`, fails again, and toasts again. `challengeRecord-*.js` is never requested again. The page's module map keeps the failed static dependency, and the `?r=` re-fetch only renews the top chunk. One aborted request (route `once`, `probe-poison.cjs`) is enough. Control: aborting `lazyScreens-*.js` itself once recovers on the next tap. Blocking `daily-*.js` from boot also kills the debug surface (debug → result → daily), so that variant could not be driven through hooks. → **QA-49-1**.

**(b) In flight at the outcome, not failed (`blocked.cjs hold daily`).** Only the play screen's own `import()` is rewritten to `?harness=app`, and that request is held, not aborted. The level map opens normally from the plain URL. Today's daily is played through the card at ×1. Outcome at 30.1 s; for the next 10 s:
- the screen stays `play` on the beat frame;
- `getResult()` null, the wallet at 0 / 0, `challenge` untouched, 0 diag rows, `done` false;
- platform back returns `true` (swallowed) and stays on play;
- **no toast** (nothing failed).

Released → result screen 236 ms later: booked once (gold +50, crystals +5, plus a `stars_10` achievement +10 from the pre-starred save), 1 diag row `11,daily,1,won,30100,2`, unchanged after 6 s more. Card DONE, streak 1. The row's record → `replay.ts --from-log`: MATCH (hash 75d2bb70, the same as the session's daily). This is PERF-16's unit test 1, reproduced in a real browser: **pass**.

**(c) Failed at the outcome, then released (`blocked.cjs app daily` / `app weekly`).** The `?harness=app` request and every `?r=` retry are aborted. Outcome at 30.1 s (weekly 55.5 s). While blocked, the beat frame holds, nothing is booked, back is swallowed, and **one load-failed toast per failed download** appears (4 in 10 s, one retry every ≈ 3.1 s). This part is as designed. After the release, the next `?r=` request succeeds, and then the page throws **`TypeError: s.recordChallengeResult is not a function`** (weekly: `s.recordWeeklyResult is not a function`). The result is never booked and never shown, and no diag row is written. After 25 s on the frozen beat frame, platform back goes to the map with `done` false and the reward lost (weekly screenshot `qa49-blocked-app-weekly-stuck.png`). → **QA-49-2**.

**(d) The same with the result chunk, campaign level 1 (`probe-result.cjs`).** `result-*.js` aborted at the outcome: stars and gold are booked, the beat holds, 3 toasts. After the release: **`TypeError: Ge.ResultScreen is not a constructor`**, no result screen, no diag row. The same happens on the pre-PERF-16 tree `c9dacf1`, so it predates PERF-16. → part of **QA-49-2**.

## Focus 3: verify, decide, hashes

- **Verify:** `--verify: 20/20 MATCH` (the 15 levels' 18 tries, the ×2 retry, the daily and the weekly; both RETRY seeds included).
- **Replay hashes:** `replay.ts --from-log --row N` gives identical hashes on every seed-1 campaign row of both dry-run logs: 3 cdccb1d7, 5 996c2250, 9 fef3b21f, 13 612d5f36, 16 5942d196, 17 8520027e (×1 and ×2), 23 43abf3d9, 27 925e8187, 32 fbc6ce8d, 33 4c24bbde, 38 2bc0df82, 41 1fbafb70, 45 a6cb4d04, 49 6d6dc9a0, 50 43d95c72. All 20 of dry run 2's records (2026-11-15, incl. its level 10 daily) still MATCH on today's build. Rules id `3:79e900d4`.
- **Decide** (`decide.md`), C.1:
  - M on 3, 9, 13, 17, 33 (pinned), 38;
  - F on 5 and 27 (no move);
  - S on 16 20 → 30, 23 30 → 35, 32 40 → 50, 41 70 → 75, 49 25 → 35, 50 40 → 50;
  - **45: `L` "= (sampled, no valid win: L, 2 tries — 2 L, 0 R)"**;
  - **"Not valid (C.0): 17 #2 W 00:28.400 — not ×1"**;
  - band 41–50 move (median r 1.21): 42 → 65, 43 → 35, 44 → 30, 46 → 55, 47 → 45, 48 → 55, **"held (sampled, no valid win): 45"**;
  - **"Difficulty list … 45 dryrun 2 tries (2 L, 0 R), not won"**.

  The bot medians decide measured for 42–48 (67.0 / 33.0 / 30.6 / 55.8 / 44.1 / 54.5 s) give the same proposals as dry run 2. H3 holds (1 / 14 valid first wins at 3★). C.2 is not refuted (17, 32, 38, 49 at ≥ 2★ on the first try; 23 lost its first). Bands 5–6 stay closed. A3 off. Tries to first clear: 23 → 2, 45 → not won, all others 1. The HUMAN block has **12 rows** (dry run 2: 13; 45 is no longer in it). The output is sane, and all three QA-42 findings show as fixed in it.

## What differs from dry run 2

- QA-42-1, -2 and -3 are fixed and visible: counters reset by CLEAR LOG, the "Not valid (C.0)" line, and 45 held / on the difficulty list.
- The daily and the weekly were started from the level-map cards (dry run 2 used `daily.start()`), and the weekly was played for the first time. The session has 21 rows: the 21st row (the pre-start warm-up) carries no record, and `playtest:log` says so.
- The log grew 182 380 → 191 493 B (48 % of the 400 kB cap).
- The RETRY seeds differ (23 W 50.40 s vs 44.30 s; 45 L 47.80 s vs 50.80 s). That is expected: RETRY draws a fresh seed.
- Timings: session 15.3 min, `playtest:log --verify` 26.6 s (dry run 2: 20.8 s, now with a 55 s weekly record and other agents on the host), decide 10.9 s (9.6 s).

## Verdict

The playtest pipeline holds end to end on the PERF-16 build: real-UI session → COPY LOG (191 kB, 20 / 20 records) → `playtest:log --verify` 20/20 MATCH → `playtest:decide` exit 0 with sane, unchanged proposals. The daily and weekly results are booked exactly once, with the expected ledger, streak, DONE badge and one Diagnostics row each. **Ready for the playtest day.**

The blocked-chunk case found two lazy-loading defects. Neither affects the playtest: the iPhone build loads its chunks from the app bundle, and the session showed no failed request. Both do affect the web / PWA build.

## Findings (proposed for "## Bugs"; not filed in BACKLOG.md by this run)

- **QA-49-1** (P3, frontend-engineer) **One failed fetch of a static dependency of the level-map chunk makes the level map unreachable until reload.** Repro: scratch build, Chromium; route-abort `/assets/challengeRecord-*.js` once at boot (it is the title idle warm's request, before `lazyScreens`), then release. Title PLAY → "Couldn't load" toast on every tap; each tap fetches `lazyScreens-*.js?r=…`, never the dependency. Expected: the map opens on the next tap after the back-off, as it does when `lazyScreens-*.js` itself failed. Cause: `loadChunk`'s `?r=` re-fetch renews only the top module, and the module map keeps the failed shared dependency. This mechanism predates PERF-16 (any of `lazyScreens`' shared dependencies, e.g. `daily-*`, `diagnostics-*`, `store-*`), but PERF-16 added an early standalone request for one of them at title idle (`warmChallengeChunk`), which a flaky first launch can fail. Fix options: `reloadOnce` when a chunk fails again right after a `?r=` re-fetch; or re-fetch the failed dependency URL named in the error.
- **QA-49-2** (P2, frontend-engineer) **`loadChunk`'s `?r=` retry resolves the raw chunk exports where Rollup wraps the dynamic import, so the result and challenge chunks never recover from a failed download.** The built entry has `import("./challengeRecord-*.js").then(e=>e.c)`, `import("./result-*.js").then(e=>e.r)` and `import("./store-*.js").then(a=>a.s)`. The retry path `import(url + '?r=…')` skips that `.then`, and only `levels/index.ts` passes an `unwrap`. Repro:
  - route-abort `result-*.js` (and its `?r=` retries) at a campaign outcome, release after 5 s → `TypeError: Ge.ResultScreen is not a constructor`, stuck on the beat frame, no diag row (reproduced on `c9dacf1` too);
  - the same for the challenge chunk (harness: the entry's import aliased `?harness=app` so the level map loads) → `TypeError: s.recordChallengeResult is not a function` / `s.recordWeeklyResult is not a function`; the daily / weekly is never booked, and back leaves with the win lost.

  Expected (PERF-11 / PERF-16 docs, unit tests 2 of `tests/ui/challengeChunk.test.ts`): book once and open the result after the retry. The unit tests mock `loadChunk`, so the `?r=` path is never run with a real chunk shape, and no e2e covers a result / challenge chunk failure. Regression test to add with the fix: an e2e in `lazy.spec.ts` that aborts `result-*.js` at the outcome, releases, and expects the result screen and one diag row. A second test for the challenge chunk needs the entry-import alias above, or a unit test of `loadChunk` with a `{ c: namespace }` shaped re-fetch.
- **Not bugs:** the challenge chunk cannot be "late" through the real UI (the level map statically needs it), so PERF-16's eager saving is real but its hold path is unreachable on one page. 21 log rows with 20 records is the documented cap. The `stars_10` achievement on the hold-case daily comes from that harness save's pre-set 3★ levels.

## Not done

- `npm run check` / `npm run e2e` were not run (out of scope for this item; the shared tree had another agent's uncommitted `src/ai/` edits).
- Blocking `daily-*.js` could not be driven through the hooks (the debug surface imports it through `result-*.js` as well).
- No repo test or `src/` change was made.
