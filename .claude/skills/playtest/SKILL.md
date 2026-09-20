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

## Browser smoke (Playwright, Chromium preinstalled)
```bash
cd tower-clash && npm run build && npm run e2e
```
Covers: title renders → level select shows locked/unlocked → level 1 loads → reference player drives to win via `window.__towerclash.autoplay()` → result screen with stars → screenshots in `e2e/__screenshots__/`. Do not run `playwright install`; use `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` (already set).

## Manual feel check (for the report)
Run `npm run dev`, play levels 1–3 with mouse; note anything that reads badly at 360 px width. Log findings under "Bugs" in `docs/BACKLOG.md`.
