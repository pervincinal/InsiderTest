---
name: playtest
description: Automated playtesting for Tower Clash — headless reference-player runs across all levels, Playwright smoke test with screenshots, and how to read the results. Use when verifying balance, level winnability, or UI after changes.
---
# Playtest

## Headless balance run
```bash
cd tower-clash && npm run playtest           # all levels
npm run playtest -- --level 12 --seed 3      # one level
npm run playtest -- --seeds 100              # robustness sweep: gate 100 % wins for levels 1–8, ≥ 95 % after
# seeds reproduce the browser exactly: window.__towerclash.loadLevel(id, seed)
```
Prints a table: level, result for reference player (win/lose + time), result for idle player (must not be win), enemy-vs-enemy stalemate flag. Exit code 1 if any level fails a gate. Paste the table into the daily report when levels changed.

## Daily Challenge, Weekly Challenge and twist gates (CI)
```bash
npm run playtest -- --daily 2026-09-18 --days 30 --seeds 3   # each day's challenge (level 9–50, fixed seed, twist), K seeds from the fixed one
npm run playtest -- --daily 2026-09-18 --days 30 --no-twist  # control: same days without the twist (blame the level, not the twist)
npm run playtest -- --weekly 2026-09-21 --weeks 26 --seeds 5 # each week's challenge (Monday key; level 33–50, fixed seed, non-plain twist, 3★ target = star3)
npm run playtest -- --weekly 2026-09-21 --weeks 26 --no-twist # control for the weekly, as for the daily
npm run playtest -- --twist lean --seeds 5                   # every pool level under one twist: plain | lean | fastFeet | thinWalls | reinforced
npm run playtest -- --twist lean --seeds 50 --pool 36-36     # --pool a-b (inclusive, default POOL_FROM–POOL_TO = 9–50): one level, a band, or 1–50
```
Gates (exit 1 on failure): daily — every day's fixed seed won and wins/K ≥ 90 %; weekly — every week's fixed seed won and wins/K ≥ 80 % (the 3★ target is informational: the row's "best / target" and "3* by" columns show the fastest seed and which seed reached `star3` — `fixed`, `seed N` or `NONE`; star3 sits at 0.9 × the bot's median by design, so most weeks show `NONE`); twist — every pool level wins ≥ 80 % of its seeds (4/5 at K = 5, GDD §7.5 item 3). `--weekly` takes only a Monday (UTC) key and errors on anything else; the current week's Monday in bash is `date -u -d "-$(( $(date -u +%u) - 1 )) days" +%F` (GNU `'monday this week'` gives the *next* Monday on Tue–Sun). `--weekly`, `--daily` and `--twist` are separate modes; `--pool` only applies to `--twist`.

Reading a weekly failure: (1) `4/5 < 90%` or a lost fixed seed → run the same weeks with `--no-twist`: passes without the twist → a level fix under that twist (GDD §3), fails both → plain level bug; then `--twist <id> --seeds 50 --pool <lvl>-<lvl>` — under 45/50 is a balance bug, one lost seed near the fixed one is not. (2) `no seed <= 3* target` → check the plain campaign row (`npm run playtest -- --seeds 5`, column 3*/2*/1*/0*): 0/5 3★ there too means the `star3` clock is out of the reference player's reach on that level regardless of twist — a clock item for the Level Designer (or a bot-speed item for the AI Engineer), not a twist item.

`.github/workflows/tower-clash-ci.yml` runs all three after the headless playtest: "Daily challenge gate" (`--daily $(date -u +%F) --days 30 --seeds 3`, 2.4 s), "Weekly challenge gate" (`--weekly <this week's Monday> --weeks 26 --seeds 3`, 2.1 s; `continue-on-error` until the 3★ clock items are closed — flip it to blocking then) and "Twist pool gate" (all five twists at `--seeds 5`, ≈ 2.6 s each). Use K = 5 for the twist gate: at K = 3 the 80 % rule demands 3/3, which is stricter than the spec and fails on a single robust-but-not-perfect level. When a twist row fails, rerun it at `--seeds 50` before touching the level — a level under 80 % at K = 50 is a balance bug for the Level Designer (file it under "Bugs" in `docs/BACKLOG.md`); a single lost seed at K = 5 is not.

## Naive human line (QA-3) and the CI naive gate
```bash
npm run playtest -- --naive --seeds 5                 # first-time human model on every level, react 4000 ms (informational)
npm run playtest -- --naive --seeds 5 --react 8000    # slower hands
npm run playtest -- --naive --seeds 5 --gate 1-16     # CI gate: exit 1 when a level of 1–8 wins < 4/5 or a level of 9–16 wins < 3/5
npm run playtest -- --naive --level 12 --seeds 5 --gate 12-12   # one gated level (a-b must contain --level)
```
`scripts/lib/naivePlayer.ts`: every `--react` ms (first action at 3 s) each own tower with a free link streams to its nearest non-own tower (neutral before enemy); it never unlinks, never boosts, and re-links a tower that lost its streams only after another reaction delay. One row per level (wins/K, stars, median, `holds` = ≥ 50 % wins, `star2?` = holds and median ≤ star2, `gate` = ok / FAIL / `-` outside the gated range) and the summary line `naive: N/50 levels won at >= 50 %, M within star2`. Without `--gate` the mode is informational (exit 0): levels 1–8 are expected to hold — a `NO` there is a level/design item for the Level Designer / Game Designer, traced with the losing seed before filing.

`--gate a-b` (`naiveGate` / `NAIVE_GATE_BANDS` in `scripts/lib/naivePlayer.ts`, unit-tested in `tests/ai/naive.test.ts`): every level id in a..b must win ≥ 80 % of its seeds for levels 1–8 (4/5 at K = 5) and ≥ 60 % for 9–16 (3/5); the range may not go past 16 (later levels have no threshold and stay informational), the thresholds are defined at the default 4000 ms reaction (`--gate` with `--react` is refused), and a level of the range that was not run counts as failed (a partial `--level` run cannot pass). Failed rows print `FAIL lvl N name: w/K < 80% (need 4/5, lost s1,s2)`; exit 1 when any. CI runs it as "Naive human gate (levels 1-16 x 5 seeds)" right after the twist gates (≈ 13 s: all 50 levels are simulated, the gate reads rows 1–16). Reading a failure: rerun `--naive --level N --seeds 5 --gate N-N` to confirm, then replay the losing seed in the browser (`window.__towerclash.loadLevel(N, seed)` without autoplay, tapping what the bot would: every 4 s each own tower streams to its nearest non-own tower); a level under its share is a level/design item for the Level Designer (file it under "Bugs" in `docs/BACKLOG.md` with the losing seed), not a bot item — the bot is fixed by design.

## Browser smoke (Playwright, Chromium preinstalled)
```bash
cd tower-clash && npm run build && npm run e2e
```
Covers: title renders → level select shows locked/unlocked → level 1 loads → reference player drives to win via `window.__towerclash.autoplay()` → result screen with stars → screenshots in `e2e/__screenshots__/`. Do not run `playwright install`; use `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` (already set).

Parallel runs (QA-4): `playwright.config.ts` reads two environment variables so agents sharing the checkout never need a scratch config. `PW_PORT` (default 4173) sets both `baseURL` and the preview server's `--port --strictPort`, so two agents on different ports get their own `vite preview`; `PW_OUTPUT` (default `test-results`) sets `outputDir` (traces, failure screenshots), so one run's cleanup does not delete another's artefacts. Example: `PW_PORT=4192 PW_OUTPUT=<scratchpad>/pw-qa npx playwright test --project=chromium e2e/smoke.spec.ts` (after `npm run build`). Only the Producer runs the plain `npm run e2e` on the default port.

## Manual feel check (for the report)
Run `npm run dev`, play levels 1–3 with mouse; note anything that reads badly at 360 px width. Log findings under "Bugs" in `docs/BACKLOG.md`.
