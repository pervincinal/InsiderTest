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

## Daily Challenge and twist gates (CI)
```bash
npm run playtest -- --daily 2026-09-18 --days 30 --seeds 3   # each day's challenge (level 9–40, fixed seed, twist), K seeds from the fixed one
npm run playtest -- --daily 2026-09-18 --days 30 --no-twist  # control: same days without the twist (blame the level, not the twist)
npm run playtest -- --twist lean --seeds 5                   # every pool level under one twist: plain | lean | fastFeet | thinWalls | reinforced
```
Gates (exit 1 on failure): daily — every day's fixed seed won and wins/K ≥ 90 %; twist — every pool level wins ≥ 80 % of its seeds (4/5 at K = 5, GDD §7.5 item 3). `.github/workflows/tower-clash-ci.yml` runs both after the headless playtest: "Daily challenge gate" (`--daily $(date -u +%F) --days 30 --seeds 3`, 2.4 s) and "Twist pool gate" (all five twists at `--seeds 5`, ≈ 2.6 s each). Use K = 5 for the twist gate: at K = 3 the 80 % rule demands 3/3, which is stricter than the spec and fails on a single robust-but-not-perfect level. When a twist row fails, rerun it at `--seeds 50` before touching the level — a level under 80 % at K = 50 is a balance bug for the Level Designer (file it under "Bugs" in `docs/BACKLOG.md`); a single lost seed at K = 5 is not.

## Browser smoke (Playwright, Chromium preinstalled)
```bash
cd tower-clash && npm run build && npm run e2e
```
Covers: title renders → level select shows locked/unlocked → level 1 loads → reference player drives to win via `window.__towerclash.autoplay()` → result screen with stars → screenshots in `e2e/__screenshots__/`. Do not run `playwright install`; use `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` (already set).

## Manual feel check (for the report)
Run `npm run dev`, play levels 1–3 with mouse; note anything that reads badly at 360 px width. Log findings under "Bugs" in `docs/BACKLOG.md`.
