# Tower Clash — Production Plan

Owner: the autonomous team (see `docs/TEAM.md`). The human stakeholder reads `reports/` daily and does not need to take any action. Branch: `claude/tower-war-game-plan-weqwpb`.

## Milestones

| # | Milestone | Target | Definition of done |
|---|---|---|---|
| M0 | Foundations | Day 1 (2026-09-13) | Project scaffolded, deterministic sim with generation/send/capture/upgrade, canvas renderer, 5 levels, unit tests green, playable in browser |
| M1 | Vertical slice | Day 5 | Enemy AI with 3 personalities, fortress + artillery, win/lose/stars, level select + save, 15 levels, Playwright smoke test, CI workflow |
| M2 | Content & feel | Day 12 | Tank factory, mines, barriers, bridges, 2–3 enemies, 40 levels, tutorial overlays, juice (particles, WebAudio sfx), balance pass with the reference player bot |
| M3 | Meta & polish | Day 19 | Coins, boosters, skins, settings, PWA manifest + offline, performance budget met, accessibility (colour-blind palette, reduced motion) |
| M4 | Release 1.0 | Day 26 | GitHub Pages deploy, README with play link, release notes, post-launch backlog |

## Daily cadence (fully autonomous)

Every day at 04:00 UTC (08:00 Baku) a scheduled Routine starts a fresh session that acts as **Producer** and runs the `daily-sprint` skill:
1. Sync branch, read `docs/BACKLOG.md` and yesterday's report.
2. Pick the highest-priority items that fit one day, assign them to team agents (parallel where independent).
3. Integrate, run all checks (`npm run check` in `tower-clash/`), fix regressions.
4. Update `docs/BACKLOG.md`, write `reports/YYYY-MM-DD.md` (Azerbaijani, template in the `daily-report` skill), commit, push.

Rules: never leave the branch red; a failing check is fixed before the report is written; scope is cut, not quality.

## Risks & mitigations
- **Balance drift** → reference-player bot must clear every level; results logged per day.
- **Scope creep** → backlog is the only source of work; new ideas go to "Icebox".
- **Sim/render coupling** → sim is DOM-free and covered by tests; renderer only reads state.
- **Mobile input** → Playwright runs with a touch device profile weekly.

## Required skills (project-local, in `.claude/skills/`)
`daily-sprint`, `daily-report`, `game-conventions`, `level-authoring`, `playtest`. Role definitions live in `.claude/agents/`.
