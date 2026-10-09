---
name: daily-sprint
description: Run one autonomous working day for the Tower Clash game team — sync branch, pick backlog items, spawn role agents, integrate, verify, update backlog, write the daily report, commit and push. Use when a scheduled Routine or the user says to run the daily sprint / komanda işləsin.
---
# Daily sprint (Producer procedure)

Branch: `claude/tower-war-game-plan-weqwpb`. Game: `tower-clash/`. Reports: `reports/`.

## 0. Sync
```bash
git fetch origin claude/tower-war-game-plan-weqwpb
git checkout claude/tower-war-game-plan-weqwpb
git pull --ff-only origin claude/tower-war-game-plan-weqwpb
cd tower-clash && npm ci && npm run check
```
If `npm run check` is red at the start of the day, fixing it is the first backlog item.

## 1. Plan the day
- Read `docs/BACKLOG.md` (top of "Next" is highest priority) and the latest file in `reports/`.
- Choose 3–6 items that fit one day and can be verified. Prefer finishing the current milestone over starting the next.
- For each item write: owner role, files, acceptance test.

## 2. Execute with the team
- Spawn agents in one message when independent (different directories). Use `subagent_type` = role file name (`gameplay-engineer`, `frontend-engineer`, `ai-engineer`, `level-designer`, `qa-engineer`, `tech-artist`, `game-designer`). If that type is not available, use `general-purpose` and paste `.claude/agents/<role>.md` at the top of the prompt.
- Each prompt must include: the backlog item verbatim, the GDD section, owned paths, "run `npm run check` in tower-clash before finishing and report the output".
- Playwright in parallel agents: each agent must run with its own port and output directory — `PW_PORT=<free port> PW_OUTPUT=<scratchpad>/pw-<role> npx playwright test --project=chromium …` (`playwright.config.ts` honours both; defaults 4173 / `test-results`) — so concurrent runs neither fight over one `vite preview` nor delete each other's `test-results/`; only the Producer runs the final `npm run e2e`.
- Sequence dependencies: sim types before renderer/AI work that needs them; levels after mechanics they use.

## 3. Integrate and verify
```bash
cd tower-clash && npm run check && npm run playtest
```
Fix regressions (or revert the offending change). QA runs `npm run e2e` when UI changed.

## 4. Close the day
1. Update `docs/BACKLOG.md`: move done items to "Done (with date)", add bugs and icebox ideas.
2. Write `reports/YYYY-MM-DD.md` using the `daily-report` skill.
3. `git add -A && git commit -m "<area>: <summary of the day>"` then `git push -u origin claude/tower-war-game-plan-weqwpb` (retry with backoff on network errors).
4. **Mandatory — read CI per job, never per workflow** (BUG-26: the Pages deploy failed on every push for 11 days behind a green workflow conclusion). After the push:
   ```bash
   cd tower-clash && node scripts/ciStatus.mjs --wait 900 --allow 'signed archive|signed AAB|App Store Connect metadata|generate upload keystore'
   ```
   The `--allow` regex lists the release lanes that are expected red while their secrets do not exist; drop a lane from it as soon as its secrets are set. Paste the script's last line into the report's **Yoxlamalar** line as `CI: <n> job(s) green, expected-red: …` (plus `RED: …` / `still running: …` when present). Exit 1 = a job that is not expected is red: the report is blocked until it is fixed, or filed in `docs/BACKLOG.md` "Bugs" with the job name and the annotation the script printed, and the report names it (e.g. `RED: deploy to GitHub Pages (BUG-26)`). Exit 2 after 900 s = still running: write `still running: <jobs>` and re-run the script at the start of the next sprint. Exit 3 = `gh` missing or API error: fix that, don't skip the step. A docs-only push triggers fewer workflows (path filters); report the jobs that did run.
5. Never end with uncommitted work or a red check.
