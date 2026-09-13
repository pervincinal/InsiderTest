---
name: playtest
description: Automated playtesting for Tower Clash — headless reference-player runs across all levels, Playwright smoke test with screenshots, and how to read the results. Use when verifying balance, level winnability, or UI after changes.
---
# Playtest

## Headless balance run
```bash
cd tower-clash && npm run playtest           # all levels
npm run playtest -- --level 12 --seed 3      # one level
```
Prints a table: level, result for reference player (win/lose + time), result for idle player (must not be win), enemy-vs-enemy stalemate flag. Exit code 1 if any level fails a gate. Paste the table into the daily report when levels changed.

## Browser smoke (Playwright, Chromium preinstalled)
```bash
cd tower-clash && npm run build && npm run e2e
```
Covers: title renders → level select shows locked/unlocked → level 1 loads → reference player drives to win via `window.__towerclash.autoplay()` → result screen with stars → screenshots in `e2e/__screenshots__/`. Do not run `playwright install`; use `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` (already set).

## Manual feel check (for the report)
Run `npm run dev`, play levels 1–3 with mouse; note anything that reads badly at 360 px width. Log findings under "Bugs" in `docs/BACKLOG.md`.
