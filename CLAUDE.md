# Repository guide

Two independent projects live here:

1. **Selenium/TestNG suite** (`src/`, `pom.xml`) — the original Insider QA test project. Leave it untouched unless asked.
2. **Tower Clash** (`tower-clash/`) — a Tower War–style browser RTS built by an autonomous agent team.

## Tower Clash quick facts
- Docs: `docs/GDD.md` (rules), `docs/PLAN.md` (milestones), `docs/BACKLOG.md` (work), `docs/TEAM.md` (roles), `docs/research/`.
- Team roles: `.claude/agents/*.md` (producer, game-designer, gameplay-engineer, frontend-engineer, ai-engineer, level-designer, qa-engineer, tech-artist, mobile-engineer, publisher, monetization-designer). Procedures: `.claude/skills/{daily-sprint,daily-report,game-conventions,level-authoring,playtest}`. Third-party game-dev skills (installed 2026-10-29, sources and licenses in `.claude/skills/THIRD_PARTY.md`): engine-neutral practice `level-design`, `game-feel`, `game-ui-ux`, `game-ai`, `performance-optimization`, `audio-design`, `save-systems`, `input-systems`, `camera-systems`, `tower-defense`; review rubrics `gstack-{balance-review,player-experience,game-ux-review,feel-pass,playtest,game-qa,build-playability-review}` (write their output to `docs/reviews/`).
- Daily reports for the stakeholder (Azerbaijani): `reports/YYYY-MM-DD.md`.
- Working branch: `claude/tower-war-game-plan-weqwpb`. Never push elsewhere.
- Before committing game code: `cd tower-clash && npm run check` (and `npm run playtest` when sim/levels/AI changed).
- Commit prefix by area: `sim:`, `ai:`, `render:`, `ui:`, `levels:`, `qa:`, `docs:`, `chore:`.
