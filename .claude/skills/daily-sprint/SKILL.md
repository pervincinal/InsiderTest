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
4. Never end with uncommitted work or a red check.
