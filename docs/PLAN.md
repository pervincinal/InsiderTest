# Tower Clash — Production Plan

Owner: the autonomous team (see `docs/TEAM.md`). The human stakeholder reads `reports/` daily and does not need to take any action. Branch: `claude/tower-war-game-plan-weqwpb`.

## Milestones

| # | Milestone | Target | Definition of done | Status (2026-09-19, day 7) |
|---|---|---|---|---|
| M0 | Foundations | Day 1 (2026-09-13) | Project scaffolded, deterministic sim with generation/send/capture/upgrade, canvas renderer, 5 levels, unit tests green, playable in browser | **Done** 2026-09-13 |
| M1 | Vertical slice | Day 5 | Enemy AI with 3 personalities, fortress + artillery, win/lose/stars, level select + save, 15 levels, Playwright smoke test, CI workflow | **Done** 2026-09-13 (day 1) |
| M2 | Content & feel | Day 12 | Tank factory, mines, barriers, bridges, 2–3 enemies, 40 levels, tutorial overlays, juice (particles, WebAudio sfx), balance pass with the reference player bot | **Done** 2026-09-13 (day 1); re-balanced for rules v2 (09-17) and v2.1 (09-17); bot 40/40 at 20 seeds |
| M-rules | Rules v2 / v2.1 (added 2026-09-15, stakeholder request) | Day 3–5 | Persistent streams + auto-upgrade (GDD §2.0), "under fire" (v2.1), AI on the link model, levels and star clocks re-fitted | **Done** 2026-09-17 (4bb3944, 3e4a388, 3f48a1d); AI-3/AI-4 follow-ups 09-18 |
| M3 | Meta & polish | Day 19 | Coins, boosters, skins, settings, PWA manifest + offline, performance budget met, accessibility (colour-blind palette, reduced motion) | **95 %**: economy (gold + crystals, shop, 5 commander tracks, IAP catalog with demo store, ads flow with caps), boosters, 21 skins, achievements, daily reward, Daily Challenge with streak milestones, settings, PWA, EN/AZ/RU/TR, colour-blind + reduced motion — all shipped 09-13…09-18. **Open:** performance budget verified only headless (PERF-2/3 done; CPU 4× level 40 median 67 ms) — the on-device half (M3-5 / MM-4) needs the stakeholder's phone |
| M-mobile | iOS/Android app | Day 2 → ongoing | PWA installable; Capacitor Android + iOS projects; CI builds a debug APK on every push and an unsigned iOS simulator app; `docs/MOBILE.md` explains signing and store submission | **Done** for the definition (09-13/14). **Blocked on the stakeholder:** real-device pass (MM-1, QA-2: a phone), signed release builds (MM-3: keystore / Apple signing secrets), real RevenueCat + AdMob keys and store products (ECON-1: Google Play + App Store accounts), `app-ads.txt` hosting (ECON-8: a domain root) |
| M4 | Release 1.0 | Day 26 | GitHub Pages deploy, README with play link, release notes, post-launch backlog | **In progress**: Pages workflow, README with the play link (`https://pervincinal.github.io/InsiderTest/`), store listings EN/AZ/RU/TR, privacy policy, launch checklist and release notes up to v0.4.0 (+ v0.4.1 unreleased) exist. **Blocked on the stakeholder:** enable GitHub Pages (Settings → Pages → Source = GitHub Actions, `docs/DEPLOY.md`) — the deploy job currently 404s; create the release tags (`tower-clash-v0.3.0`, `v0.4.0`) from the GitHub UI (PUB-9: this environment cannot push tags). **Team side:** M4-3 release notes 1.0 + post-launch backlog |

Version: 0.4.0 (build 4) on Android/iOS/web; v0.4.1 notes accumulate in `docs/publishing/RELEASE_NOTES.md`.

## Daily cadence (fully autonomous)

Every day at 04:00 UTC (08:00 Baku) a scheduled Routine starts a fresh session that acts as **Producer** and runs the `daily-sprint` skill:
1. Sync branch, read `docs/BACKLOG.md` and yesterday's report.
2. Pick the highest-priority items that fit one day, assign them to team agents (parallel where independent).
3. Integrate, run all checks (`npm run check` in `tower-clash/`), fix regressions.
4. Update `docs/BACKLOG.md`, write `reports/YYYY-MM-DD.md` (Azerbaijani, template in the `daily-report` skill), commit, push.

Rules: never leave the branch red; a failing check is fixed before the report is written; scope is cut, not quality. Items that need the stakeholder (accounts, devices, repository settings, tags) go into the report's "Qərar lazımdır" section with the default the team applies if no answer arrives; they are not blockers for the rest of the plan.

## After M3 (content and LiveOps track, from 2026-09-18)

With "Next" nearly empty, the team moved to content that the reference bot can verify: the Daily Challenge (GDD §7, shipped 09-18 with streak milestones) came first because it reuses the campaign and the sim's player modifiers; candidates after it (stakeholder default: in this order) — daily-pool robustness at 50 seeds (LV-8), an arcade "quick battle" mode, levels 41–50, then the §7.6 v2 ideas that need no server. Everything that needs accounts or a server (leaderboards, cloud save, real IAP) waits for M-mobile's blockers.

## Risks & mitigations
- **Balance drift** → reference-player bot must clear every level; results logged per day. Since 09-18 CI also runs the daily (30 days × 3 seeds) and twist (5 × 32 × 5) gates.
- **Scope creep** → backlog is the only source of work; new ideas go to "Icebox".
- **Sim/render coupling** → sim is DOM-free and covered by tests; renderer only reads state.
- **Mobile input** → Playwright runs with a touch device profile weekly; an Android WebView e2e project exists, a real device does not (see M-mobile).
- **Stakeholder-gated steps** (Pages, tags, store accounts, phone) → the team ships everything up to the gate and keeps the default in the report; nothing else waits on them.

## Required skills (project-local, in `.claude/skills/`)
`daily-sprint`, `daily-report`, `game-conventions`, `level-authoring`, `playtest`. Role definitions live in `.claude/agents/`.
