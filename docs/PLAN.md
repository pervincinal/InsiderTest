# Tower Clash — Production Plan

Owner: the autonomous team (see `docs/TEAM.md`). The human stakeholder reads `reports/` daily and does not need to take any action. Branch: `claude/tower-war-game-plan-weqwpb`.

## Milestones

| # | Milestone | Target | Definition of done | Status (2026-10-07, day 22) |
|---|---|---|---|---|
| M0 | Foundations | Day 1 (2026-09-13) | Project scaffolded, deterministic sim with generation/send/capture/upgrade, canvas renderer, 5 levels, unit tests green, playable in browser | **Done** 2026-09-13 |
| M1 | Vertical slice | Day 5 | Enemy AI with 3 personalities, fortress + artillery, win/lose/stars, level select + save, 15 levels, Playwright smoke test, CI workflow | **Done** 2026-09-13 (day 1) |
| M2 | Content & feel | Day 12 | Tank factory, mines, barriers, bridges, 2–3 enemies, 40 levels, tutorial overlays, juice (particles, WebAudio sfx), balance pass with the reference player bot | **Done** 2026-09-13 (day 1); re-balanced for rules v2 (09-17) and v2.1 (09-17); bot 40/40 at 20 seeds |
| M-rules | Rules v2 / v2.1 (added 2026-09-15, stakeholder request) | Day 3–5 | Persistent streams + auto-upgrade (GDD §2.0), "under fire" (v2.1), AI on the link model, levels and star clocks re-fitted | **Done** 2026-09-17 (4bb3944, 3e4a388, 3f48a1d); AI-3/AI-4 follow-ups 09-18; **Rules v3 "free lanes"** (stakeholder request 2026-09-21) shipped in the 1.0.0 RC the same day and all 50 levels / AI / clocks re-fitted (BACKLOG "RULES-3") |
| M3 | Meta & polish | Day 19 | Coins, boosters, skins, settings, PWA manifest + offline, performance budget met, accessibility (colour-blind palette, reduced motion) | **Done** 2026-09-26: economy, shop, commander tracks, IAP catalog with demo store, PWA offline (BUG-18/19 fixed 09-26/27, pwa e2e), sprite cache + lazy chunks (eager 73.9 kB ≤ 80 on 09-27; 75.0 kB on 10-03, 75.7 kB on 10-05 with the share card lazy), colour-blind palette, reduced motion, how-to card; only on-device perf/memory confirmation (M3-5, MM-4) waits for a phone |
| M-mobile | iOS/Android app | Day 2 → ongoing | PWA installable; Capacitor Android + iOS projects; CI builds a debug APK on every push and an unsigned iOS simulator app; `docs/MOBILE.md` explains signing and store submission | **Done** for the definition (09-13/14). **Blocked on the stakeholder:** real-device pass (MM-1, QA-2: a phone), secrets for the signed release lanes (MM-3 iOS `726b348`, MM-6 Android `5ce0eac`: written, unrun — App Store Connect API key, Android keystore), real RevenueCat + AdMob keys and store products (ECON-1: Google Play + App Store accounts), `app-ads.txt` hosting (ECON-8: a domain root) |
| M4 | Release 1.0 | Day 26 | GitHub Pages deploy, README with play link, release notes, post-launch backlog | **Ready to tag, not tagged** (build 7 RC, tag target `85154af` of 2026-09-27): Pages live since 2026-09-28 with the play link in the README, store listings EN/AZ/RU/TR with screenshot sets (re-cut on levels 24 / 45 and the WEEKLY tab, PUB-6), privacy policy live, release notes v1.0.0 (build 7 + planned build 8), post-launch plan; iOS / Android release lanes in CI (MM-3, MM-6); publish pack written — App Store §0b, AdMob §0c, RevenueCat / IAP §0d (LAUNCH_CHECKLIST.md), TestFlight test plan (QA-12); waiting for the stakeholder's Apple (App Store Connect API key) and AdMob secrets — build 8, the App Review build, is cut when the AdMob ids exist; the tag, store accounts and the device pass are the stakeholder's (LAUNCH_CHECKLIST.md §0) |

Version: 1.0.0 (build 7, 2026-09-27) on Android/iOS/web; build 8 (still 1.0.0, the App Review build with the real AdMob ids, no code change) is planned for when the ids exist, and 1.0.1 with in-app purchases will be build 9; the v1.0.0 section of `docs/publishing/RELEASE_NOTES.md` is the release text, `POST_LAUNCH.md` §6 the 1.0.1 / 1.1 roadmap.

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
