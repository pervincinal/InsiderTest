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
- **Model per task (stakeholder rule, 2026-10-30: the Producer picks the model for every agent, whatever model the session itself runs on; pass it as the Agent tool's `model`).** `fable` for work where one wrong assumption costs a day: sim rules and determinism (`src/sim`), enemy AI and the reference player, balance / clock decisions, root-causing a CI red, security- or save-data-sensitive code. `opus` (the default) for engineering and design work with a clear spec: renderer / UI / input features, level layouts and cards, test suites, mobile wrappers, audits with a rubric. `sonnet` for mechanical and document work: translations, release notes and test plans from a given list, backlog grooming, metadata counts, screenshot re-cuts, frame captures, applying texts the designer already wrote. `haiku` for lookups and one-file checks (find a constant, list files, confirm a count). When unsure between two, take the stronger one; never let a cheaper model touch `src/sim`, `src/ai` or `src/ui/save.ts`. Record the model next to each agent in the report's "Bu gün nə edildi" line only when it differs from `opus`.
- Playwright in parallel agents: each agent must run with its own port and output directory — `PW_PORT=<free port> PW_OUTPUT=<scratchpad>/pw-<role> npx playwright test --project=chromium …` (`playwright.config.ts` honours both; defaults 4173 / `test-results`) — so concurrent runs neither fight over one `vite preview` nor delete each other's `test-results/`; only the Producer runs the final `npm run e2e`.
- Sequence dependencies: sim types before renderer/AI work that needs them; levels after mechanics they use.

## 3. Integrate and verify
```bash
cd tower-clash && npm run check && npm run playtest
```
Fix regressions (or revert the offending change). QA runs `npm run e2e` when UI changed.
Playwright runs in this step (chromium, WebView, PWA): every Playwright invocation gets its own `PW_PORT` and `PW_OUTPUT`, parallel ones included — e.g. `PW_PORT=4195 PW_OUTPUT=<scratchpad>/pw-pwa npx playwright test --project=pwa`; a second run on an output directory another live run holds fails fast naming `PW_OUTPUT` (QA-28 run lock). To test a build without rewriting the shared `dist/`, build into the scratchpad (`npx vite build --outDir <scratchpad>/dist --emptyOutDir`) and pass `PW_DIST=<scratchpad>/dist`.

## 4. Close the day
1. Update `docs/BACKLOG.md`: move done items to "Done (with date)", add bugs and icebox ideas.
2. Write `reports/YYYY-MM-DD.md` using the `daily-report` skill.
3. `git add -A && git commit -m "<area>: <summary of the day>"` then `git push -u origin claude/tower-war-game-plan-weqwpb` (retry with backoff on network errors).
4. **Mandatory — read CI per job, never per workflow** (BUG-26: the Pages deploy failed on every push for 11 days behind a green workflow conclusion). After the push:
   ```bash
   cd tower-clash && node scripts/ciStatus.mjs --wait 900 --allow 'signed archive|signed AAB|App Store Connect metadata|generate upload keystore'
   ```
   The `--allow` regex lists the release lanes that are expected red while their secrets do not exist; drop a lane from it as soon as its secrets are set. Paste the script's last line into the report's **Yoxlamalar** line as `CI: <n> job(s) green, expected-red: …` (plus `RED: …` / `still running: …` when present). Exit 1 = a job that is not expected is red: the report is blocked until it is fixed, or filed in `docs/BACKLOG.md` "Bugs" with the job name and the annotation the script printed, and the report names it (e.g. `RED: deploy to GitHub Pages (BUG-26)`). Exit 2 after 900 s = still running: write `still running: <jobs>` and re-run the script at the start of the next sprint. Exit 3 = `gh` missing or API error: fix that, don't skip the step. A docs-only push triggers fewer workflows (path filters); report the jobs that did run. Since QA-26 (2026-10-15) `tower-clash-ci.yml` reports three jobs — `check + playtest + build + e2e` (check, playtest gates, build, bundle, WebView + PWA e2e) and the chromium e2e matrix `e2e (shard 1/2)`, `e2e (shard 2/2)` — and the script requires all three once any of them reports: a shard with no check run or concluding `skipped` prints `missing` / `skipped — required job did not run` and counts as RED.
5. **Office page (stakeholder rule, 2026-10-30: refresh it at the end of every sprint).** The stakeholder watches the team on the "Tower Clash Ofisi" artifact — https://claude.ai/artifact/EyscHjSMPLm1J2R94ozuV8 — rendered from `docs/office/office.json` through `docs/office/template.html` by `node docs/office/build.mjs`. After the report is written: edit `office.json` — `board` (date / day line, five stats: build and its state, playtest, unit + e2e counts, audit P1 closed / open or the day's headline, days without a reply), every agent's `recent` (three newest items, today's first, in Azerbaijani, with numbers) and `status` / `tag` / `cls` (`''` = worked today, `wait` = waiting, `you` = on the stakeholder), the stakeholder desk's `recent` (what is on them now), and `backlog` (the open groups: on the stakeholder, the next two sprint days, after the playtest, before release, when accounts exist, after launch — every open `- [ ]` of `docs/BACKLOG.md` that matters to the stakeholder, one Azerbaijani line each, `own` = the owning role ids, `day` = the planned day); then `node docs/office/build.mjs`, commit the three files with the docs commit, and publish `docs/office/tower-clash-ofisi.html` with the Artifact tool **with `url` set to that artifact** (a bare file path would create a second artifact), label `gün N`. The page is static: nothing on it updates by itself.
6. Never end with uncommitted work or a red check.
