# Tower Clash — Production Plan

Owner: the autonomous team (see `docs/TEAM.md`). The human stakeholder reads `reports/` daily and does not need to take any action. Branch: `claude/tower-war-game-plan-weqwpb`.

## Milestones

| # | Milestone | Target | Definition of done | Status (2026-11-10, day 53) |
|---|---|---|---|---|
| M0 | Foundations | Day 1 (2026-09-13) | Project scaffolded, deterministic sim with generation/send/capture/upgrade, canvas renderer, 5 levels, unit tests green, playable in browser | **Done** 2026-09-13 |
| M1 | Vertical slice | Day 5 | Enemy AI with 3 personalities, fortress + artillery, win/lose/stars, level select + save, 15 levels, Playwright smoke test, CI workflow | **Done** 2026-09-13 (day 1) |
| M2 | Content & feel | Day 12 | Tank factory, mines, barriers, bridges, 2–3 enemies, 40 levels, tutorial overlays, juice (particles, WebAudio sfx), balance pass with the reference player bot | **Done** 2026-09-13 (day 1); re-balanced for rules v2 (09-17) and v2.1 (09-17); bot 40/40 at 20 seeds |
| M-rules | Rules v2 / v2.1 (added 2026-09-15, stakeholder request) | Day 3–5 | Persistent streams + auto-upgrade (GDD §2.0), "under fire" (v2.1), AI on the link model, levels and star clocks re-fitted | **Done** 2026-09-17 (4bb3944, 3e4a388, 3f48a1d); AI-3/AI-4 follow-ups 09-18; **Rules v3 "free lanes"** (stakeholder request 2026-09-21) shipped in the 1.0.0 RC the same day and all 50 levels / AI / clocks re-fitted (BACKLOG "RULES-3") |
| M3 | Meta & polish | Day 19 | Coins, boosters, skins, settings, PWA manifest + offline, performance budget met, accessibility (colour-blind palette, reduced motion) | **Done** 2026-09-26: economy, shop, commander tracks, IAP catalog with demo store, PWA offline (BUG-18/19 fixed 09-26/27, pwa e2e), sprite cache + lazy chunks (eager 73.9 kB ≤ 80 on 09-27; 75.0 kB on 10-03, 75.7 kB on 10-05 with the share card lazy), colour-blind palette, reduced motion, how-to card; only on-device perf/memory confirmation (M3-5, MM-4) waits for a phone |
| M-mobile | iOS/Android app | Day 2 → ongoing | PWA installable; Capacitor Android + iOS projects; CI builds a debug APK on every push and an unsigned iOS simulator app; `docs/MOBILE.md` explains signing and store submission | **Done** for the definition (09-13/14). **Blocked on the stakeholder:** real-device pass (MM-1, QA-2: a phone), secrets for the signed release lanes (MM-3 iOS `726b348`, MM-6 Android `5ce0eac`: written, unrun — App Store Connect API key, Android keystore), real RevenueCat + AdMob keys and store products (ECON-1: Google Play + App Store accounts), `app-ads.txt` hosting (ECON-8: a domain root) |
| M4 | Release 1.0 | Day 26 | GitHub Pages deploy, README with play link, release notes, post-launch backlog | **Ready to tag, not tagged** (build 7 RC, tag target `85154af` of 2026-09-27): Pages live since 2026-09-28 with the play link in the README, store listings EN/AZ/RU/TR with screenshot sets (re-cut on levels 24 / 45 and the WEEKLY tab, PUB-6), privacy policy live, release notes v1.0.0 (build 7 + planned build 8), post-launch plan; iOS / Android release lanes in CI (MM-3, MM-6); publish pack written — App Store §0b, AdMob §0c, RevenueCat / IAP §0d (LAUNCH_CHECKLIST.md), TestFlight test plan (QA-12); waiting for the stakeholder's Apple (App Store Connect API key) and AdMob secrets — build 8, the App Review build, is cut when the AdMob ids exist; the tag, store accounts and the device pass are the stakeholder's (LAUNCH_CHECKLIST.md §0); superseded by the "1.0 release" row below (build 27) |
| M-onboarding | Lesson-card cycle (added 2026-10-17 after TestFlight builds 14–16: the cards must say the move that wins) | Day 32 → 40 | Every level's lesson card reviewed by the game designer (GDD §3.9–§3.17) and, where its literal reading does not win, rewritten in EN / AZ / RU / TR and verified with the literal card follower (`--follow`, rule (a)); every card ≤ 3 lines at 20 px | **Done** 2026-10-28 (day 40): 50 cards reviewed, 41 rewritten (levels 2–50), each verified 20 seeds × both tie orders; 23 and 32 stay over their 2★ clocks as learning levels; the star-2 floor is a post-launch decision on telemetry (GDD proposal, GD-12) |
| 1.0 | 1.0 release (builds 25 → 27) | open, gated | Build 27 cut and on TestFlight; the stakeholder's device pass and the human playtest recorded | **Build 27 waits on the Apple PLA agreement (MM-15)**, then the stakeholder's device pass + human playtest (AUD-Q1 / A2, `docs/reviews/2026-11-05-human-playtest-sheet.md`). Code side ready: native lane checked 2026-11-09, request steps in `docs/MOBILE.md` §4.2; release text in `docs/publishing/RELEASE_NOTES.md` (build 27 block, days 42–50). Build 8 is in App Review, build 25 on TestFlight (source: BACKLOG MM-15, AUD-Q1; reports/2026-11-09.md) |
| 1.0.1 | Playtest-gated decisions | after the playtest | Each decision taken by the sheet's mechanical rules, not by taste | Star clocks B4 / B5 (rules in the sheet §C.1 / §C.2, `npm run playtest:decide`); AI engagement per level (LV-13 per-level switch, memo `docs/reviews/2026-11-05-ai-engagement.md` §6); bands 5–6 only on the memo §4.3 signal (sheet §C.3). Rules run at N ≥ 3 testers; at N = 1 they only "propose" and nothing changes in JSON without the stakeholder's sign-off (sheet §C.0) |
| 1.1 | Replay playback, then local 2-player | after 1.0 ships | Order R then P; nothing starts before 1.0 ships | Replay playback ≈ 31 h, then local 2-player ≈ 57 h (source: `docs/reviews/2026-11-09-icebox-1.1.md`; BACKLOG "1.1 candidates"). The replay record (SIM-R1) is already in the tree, eager +60 B |

Version: 1.0.0 — build 8 (2026-10-09, real AdMob ids) submitted to App Review on 2026-10-11; builds 9 (2026-10-11: swipe-to-cut, iPhone drag, full screen, new icon) and 10 (2026-10-12) are TestFlight hotfix builds of the same 1.0.0 after the stakeholder's first device session, and the review build is swapped to the newest verified one; 1.0.1 with in-app purchases takes the next free build number when it is cut; the v1.0.0 section of `docs/publishing/RELEASE_NOTES.md` is the release text, `POST_LAUNCH.md` §6 the 1.0.1 / 1.1 roadmap. **Update 2026-11-10:** build 8 is still the one in App Review; build 25 (2026-10-29) is the newest on TestFlight; build 26 was requested 2026-10-30 but Apple blocks signing until the PLA agreement is accepted (MM-15), so the next upload will be **build 27** (release notes block covers days 42 evening to 50) via the four steps in docs/MOBILE.md §4.2.

## State on 2026-11-10

- **Content and gates:** 50 levels, reference bot 50/50; 2 584 unit tests; e2e 191 + WebView 4 + PWA 4, plus WebKit and soak jobs; CI run 124 on `510d530` was 9 jobs green on the first try (source: reports/2026-11-09.md).
- **Size:** eager bundle 80.7 kB of the 82 kB budget gzip; native package 1.32 MB (source: reports/2026-11-09.md; docs/MOBILE.md §4.2).
- **Audit 2026-10-29** (2 P0, 29 P1, 44 P2, 21 P3; source: docs/reviews/2026-10-29-audit-summary.md): P0 AUD-B1 closed, AUD-Q1 / A2 open (the stakeholder's pass); P1 28 of 29 closed, the open one is B4 / A13 + B5 (playtest-gated); P2 / P3 closed except the playtest-gated ones (AUD-A12, the AI-engagement changes A3–A6 / A9) (source: BACKLOG "Audit 2026-10-29").
- **Feel pass:** 11/14 BREATHING, up from 8/14; FEEL-1 9/9 closed (source: BACKLOG "Feel pass 2026-11-06").
- **Blocked on the stakeholder:** MM-15 (accept the Apple Program License Agreement, then build 27 is requested in 4 steps, docs/MOBILE.md §4.2) and AUD-Q1 / A2 (device pass + human playtest on build 27).
- **One open bug:** QA-35 — a rare e2e / renderer hang under CI load (about 1 red test per 100; not reproduced in 40 + 15 seeds, no device impact seen) (source: BACKLOG "Bugs"; reports/2026-11-09.md).

## Daily cadence (fully autonomous)

Every day at 04:00 UTC (08:00 Baku) a scheduled Routine starts a fresh session that acts as **Producer** and runs the `daily-sprint` skill:
1. Sync branch, read `docs/BACKLOG.md` and yesterday's report.
2. Pick the highest-priority items that fit one day, assign them to team agents (parallel where independent).
3. Integrate, run all checks (`npm run check` in `tower-clash/`), fix regressions.
4. Update `docs/BACKLOG.md`, write `reports/YYYY-MM-DD.md` (Azerbaijani, template in the `daily-report` skill), commit, push.

Rules: never leave the branch red; a failing check is fixed before the report is written; scope is cut, not quality. Items that need the stakeholder (accounts, devices, repository settings, tags) go into the report's "Qərar lazımdır" section with the default the team applies if no answer arrives; they are not blockers for the rest of the plan.

**Quiet-day mode** (since Day 51, 2026-11-08, until build 27 moves): the sprint shrinks to CI watch, hygiene (budgets, flake sweeps, doc staleness) and preparation for 1.0.1 and 1.1 (decision scripts, the replay record, design notes). No new features, no rule changes; the Producer still writes the report.

## After M3 (content and LiveOps track, from 2026-09-18)

With "Next" nearly empty, the team moved to content that the reference bot can verify: the Daily Challenge (GDD §7, shipped 09-18 with streak milestones) came first because it reuses the campaign and the sim's player modifiers; candidates after it (stakeholder default: in this order) — daily-pool robustness at 50 seeds (LV-8), an arcade "quick battle" mode, levels 41–50, then the §7.6 v2 ideas that need no server. Everything that needs accounts or a server (leaderboards, cloud save, real IAP) waits for M-mobile's blockers.

## Risks & mitigations
- **Apple PLA agreement delay (MM-15)** → build 27 cannot be cut or reach TestFlight until the Account Holder accepts; the code side is verified and the request is 4 steps, so it ships the day the agreement clears.
- **No human data yet** → no device pass and no human playtest has ever been recorded (AUD-Q1 / A2); star clocks, AI engagement and bands 5–6 are decided only by the sheet's mechanical rules, and at N = 1 only as proposals.
- **Eager budget headroom 1.3 kB** (80.7 of 82 kB) → new work goes into lazy chunks; the budget is raised only by argued exception.
- **QA-35 rare CI hang** → about 1 red test per 100 under load; a rerun clears it, notes in BACKLOG "Bugs"; the replay record (SIM-R1) can catch a stack.
- **Balance drift** → reference-player bot must clear every level; results logged per day. Since 09-18 CI also runs the daily (30 days × 3 seeds) and twist (5 × 32 × 5) gates.
- **Scope creep** → backlog is the only source of work; new ideas go to "Icebox".
- **Stakeholder-gated steps** (Pages, tags, store accounts, phone) → the team ships everything up to the gate and keeps the default in the report; nothing else waits on them.

## Required skills (project-local, in `.claude/skills/`)
`daily-sprint`, `daily-report`, `game-conventions`, `level-authoring`, `playtest`. Role definitions live in `.claude/agents/`.
