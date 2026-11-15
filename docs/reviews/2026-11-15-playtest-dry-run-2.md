# Playtest-day dry run 2 (QA-42, 2026-11-15)

Re-run of the QA-39 dry run on the current build with all four follow-ups in (QA-39-1 `speed`, QA-39-2 20 records / 400 kB, QA-39-3 CLEAR LOG + UTC in the sheet, QA-39-4 `had`). Tree `6d6898c` (= `cdbf962` + a PLAN.md docs commit; no change under `tower-clash/`). Scratch build (`vite build --outDir <scratch>/dist`), `vite preview` on port 4191, Playwright Chromium headless shell 1243 with Pixel 5 metrics, clipboard permission granted. The "tester" is the reference player at **×1** (seed 1 through `loadLevel`), `economy.autoLose` for the planned losses; Diagnostics, CLEAR LOG, the defeat card's RETRY, the pause card's SPEED toggle and COPY LOG were tapped through the real UI. Script and outputs: `/tmp/claude-0/-home-user-InsiderTest/27ff3ffe-c8bd-51f2-b6a9-550752bc37bb/scratchpad/day58/qa/` (`session.cjs`, `session.json`, `log.txt`, `2026-11-15-playtest*.csv`, `decide.md`).

## Steps and numbers

| Step | What happened | Result |
|---|---|---|
| Save | levels 1–50 at 3★ except the 15 sample levels; 27 pre-set at 2★ (a sample level cleared before the session) | 12 / 15 sample levels open at boot (17, 33, 50 open as 16, 32, 49 are won) |
| 0a | Settings → About → Diagnostics on (card: 0 rows, off → on) | on |
| 0b | 2 junk rows: level 3 loss ×20, level 1 win ×10; card shows 2 | 2 rows |
| 0c | CLEAR LOG through the card | rows 0, card 0; the stored key is `{"v":1,"n":{"1":1,"3":1},"rows":[]}` — **the attempt counters stay** (QA-42-1) |
| 0d | warm-up after the clear: level 1 win ×10 at 04:08Z (logged as attempt **2**) | 1 row, for `--since` to drop |
| Start | next UTC minute: **2026-11-15T04:09Z**, sheet note `08:09 (UTC 04:09)` | |
| 1 | 3, 5, 9, 13, 16, 17, 23, 27, 32, 33, 38, 41, 45, 49, 50 at ×1, seed 1 | 13 wins first try (1 × 3★, 12 × 2★) |
| 1 · 23 | autoLose (L, 64.45 s) → defeat card RETRY (new seed 3714644458) → reference player | W 44.30 s, 2★, attempt 2 |
| 1 · 45 | autoLose (L, 39.25 s) → RETRY → autoLose (L, 50.80 s) | never won, `had` 0 on both rows |
| 1 · 17 ×2 | "speed" retry: pause card SPEED ×1 → ×2 (`getSpeed` 1 → 2), resume | W 28.40 s (same sim time as ×1), row `speed` 2, `had` 1 |
| 1 · daily | today's daily (level 10, seed 652966, twist `reinforced`) | W 23.20 s, mode `daily` |
| — | session wall time 04:09:00 → 04:22:50 (≈ 14 min at ×1); 0 page errors | |
| 2 | COPY LOG through Settings → About → clipboard | **182 380 B, 20 rows, 20 `#replay` lines** (536 B – 25.8 kB each), column line **15 columns** (`…,textScale,speed,had`), clipboard = `diag.text()`, toast "Diagnostics log copied" (not trimmed) |
| 3 | `npm run playtest:log -- log.txt --tester dryrun --since 2026-11-15T04:09Z --out … --verify` | exit 0, 20.8 s; **20 log rows → 18 attempt rows on 15 levels**; **20/20 MATCH**, 0 rows without a record |
| 4 | hand columns filled (named / log on 17, 33, 49; iv 0 on 50; notes on 45 and the ×2 row); `npm run -s playtest:decide -- … --date 2026-11-15` | exit 0, 9.6 s; 18 tries, N = 1, all PROVISIONAL |

`playtest:log` exclusions and warnings (complete list):
- excluded line 3 (the 04:08Z warm-up) "before --since"; excluded line 22, the daily (campaign-only sample).
- WARNING line 4: "level 3's first try in this log is the log's attempt 2 (… use --since, or CLEAR LOG before the session)" — after a CLEAR LOG (QA-42-1).
- WARNING build "1.0.0 (build 26)" is below build 27 — expected: the tree's `config.buildNumber` is still 26 until the build 27 bump.
- **No** "first_ever left empty" and no "speed left empty" warning.

## What each new path did

- **`had` / first_ever (QA-39-4).** first_ever comes from each level's first row: 1 on 14 levels, 0 on 27 (the pre-cleared one, `had` 1), and **1 on 45, the level never won**, from `had` 0 — no warning. The ×2 row of 17 has `had` 1 (won earlier in the session); first_ever stays the level's value (1).
- **`speed` (QA-39-1).** All 18 session tries at ×1 log `1`; the pause-card ×2 try logs `2` and the CSV has `speed` 2. The junk ×20 / ×10 rows logged 20 / 10 (gone with the clear / `--since`).
- **20 records / 400 kB (QA-39-2).** All 20 rows carry a record, the copy is 45 % of the cap, every record re-runs to MATCH (incl. both RETRY seeds and the daily from its seed).
- **CLEAR LOG + UTC (QA-39-3).** CLEAR LOG empties the rows and the card count, but not the attempt counters: level 3, the junk level, comes back as attempt 2 (`playtest:log` renumbers it to 1 and warns). The UTC `--since` cut works unchanged and drops exactly the pre-start row.
- **×2 rejected by decide.** Decide does reject it: H for 17 stays 28.4 s. A control with the ×2 row's time set to 20.000 s keeps H 28.4 (M); the same row marked `speed` 1 gives H 20 (F, 25 → 20). **But decide's output never names the rejected try**: no "not ×1" or "speed" string anywhere in the markdown (QA-42-2).

## Decide output (pipeline check, the "human" is the bot)

C.1: M on 3, 9, 13, 17, 33 (pinned), 38; F on 5 and 27 (no move); S on 16 20 → 30, 23 30 → 35, 32 40 → 50, 41 70 → 75, 49 25 → 35, 50 40 → 50; 45 "no valid win". Band 41–50 move (median r 1.21): 42 60 → 65, 43 30 → 35, 44 25 → 30, **45 40 → 50**, 46 45 → 55, 47 40 → 45, 48 45 → 55 (QA-42-3: 45 is sampled but listed with the "unsampled" levels). H3 holds (1 / 14 valid first wins at 3★). C.2 not refuted (17, 32, 38, 49 at ≥ 2★ first try; 23 lost its first). Bands 5–6 stay closed. A3 off. Tries to first clear: 23 → 2, 45 → not won, others 1. HUMAN block 13 rows.

## Verdict

The pipeline holds end to end on the current build: tester session → COPY LOG (182 kB, 20 / 20 records) → `playtest:log --verify` (20/20 MATCH, first_ever from `had` everywhere including the never-won 45, the ×2 try as `speed` 2, the pre-start row cut by the UTC `--since`) → `playtest:decide` exit 0 with the ×2 try kept out of H. **Ready for the playtest day.** Three P3 findings, none blocks it: the sheet's CLEAR LOG promise about attempt numbers is wrong (harmless: `playtest:log` renumbers), decide keeps quiet about the tries it drops, and the band rule treats a sampled-but-never-won level as unsampled. No repo code changed.

## Filed (docs/BACKLOG.md "## Bugs")

- **QA-42-1** (P3, frontend-engineer or game-designer) CLEAR LOG keeps the attempt counters; sheet §A step 4 says it makes the session start at attempt 1.
- **QA-42-2** (P3, qa-engineer) `playtest:decide` drops ×2 / booster / REINFORCEMENTS tries from H without saying so.
- **QA-42-3** (P3, game-designer ruling) the C.1 band move moves a sampled level that has no valid win (45 here) as if unsampled.
