# Backlog (single source of work)

Priority = order within a section. Producer moves items; anyone may add to Bugs / Icebox.

## In progress (today)
(empty — next sprint picks from "Next")

## Next (M1 — vertical slice)
- [ ] M1-8b Mute button glyph in the HUD/pause menu (audio exists, toggled with M key) — frontend-engineer
- [ ] M1-10 Balance review of levels 1–15 with the reference bot on 5 seeds; adjust star times so the bot gets 2★, a good human 3★ — game-designer

## Next (M-mobile — iOS/Android)
- [ ] MM-1 Verify the Android debug APK from CI on a real phone; fix any WebView issue (safe areas, audio unlock, back button = pause) — mobile-engineer + qa
- [ ] MM-2 Capacitor plugins: StatusBar (hidden), ScreenOrientation lock portrait, Haptics on capture, App back-button handler — mobile-engineer
- [ ] MM-3 Signed release builds once keystore / Apple signing secrets exist (see docs/MOBILE.md) — mobile-engineer

- [ ] PUB-5 App Store exact-size screenshots (1290×2796, 1284×2778) and native version codes aligned to 0.1.0 (with mobile-engineer) — publisher
- [ ] MM-5 GitHub Pages deploy of the web build so the PWA has a public install URL — qa-engineer

## Later (M2 — content & feel)
- [ ] M2-1 Tank factory + tank unit (weight 5)
- [ ] M2-2 Mines and barriers on roads
- [ ] M2-3 Bridges: cut with long-press
- [ ] M2-4 Two and three simultaneous enemies; enemies fight each other
- [ ] M2-5 Levels 16–40 per bands
- [ ] M2-7 Subtle screen shake on capture; button click sfx wired in screens — tech-artist
- [ ] M2-8 Balance pass with playtest table in report

## Later (M3 — meta & polish)
- [ ] M3-1 Boosters: overdrive, freeze, airstrike (coins)
- [ ] M3-2 Skins (2 tower shapes, 2 unit shapes) bought with coins
- [ ] M3-3 Settings: sound, colour-blind palette, reduced motion, send ratio
- [ ] M3-4 PWA manifest + service worker (offline)
- [ ] M3-5 Performance: 400 units at 60 fps on mid phone (object pooling, dirty rects if needed)
- [ ] M3-6 Pause menu, speed ×2 option

## Later (M4 — release)
- [ ] M4-1 GitHub Pages deploy workflow
- [ ] M4-2 README (EN + AZ) with play link and GIF
- [ ] M4-3 Release notes 1.0, post-launch backlog

## Bugs
(none yet)

## Icebox
- Daily challenge map with seed
- Replays (command log is already deterministic)
- Local 2-player on one screen

## Done
- 2026-09-13 M0-1 Scaffold `tower-clash/` (Vite + TS strict + Vitest + Playwright + ESLint)
- 2026-09-13 M0-2 Sim core with 60 unit tests (all GDD §2 mechanics incl. fortress, artillery, tanks, mines, barriers, bridges, boosters)
- 2026-09-13 M0-3 Canvas renderer, pointer input, game loop, HUD, win/lose overlay
- 2026-09-13 M0-4 Enemy AI v1 (rusher, turtle, opportunist), reference player, `npm run playtest`
- 2026-09-13 M0-5 Levels 1–5 + `npm run levels:check`
- 2026-09-13 M0-6 Playwright smoke test + screenshots
- 2026-09-13 M1-1 Fortress and artillery towers (sim + tests; no level uses them yet — see M1-4)
- 2026-09-13 M1-2 Title screen, level select grid with stars, result screen, localStorage save
- 2026-09-13 M1-3 Stars by time, coins on first clear (save logic; result-screen display pending M1-3b)
- 2026-09-13 M1-5 Send-ratio toggle (100 % / 50 %)
- 2026-09-13 M1-6 GitHub Actions CI: check + playtest + build + e2e
- 2026-09-13 M1-4 Levels 6–15 (fortress at 9, artillery at 12), all seeds green
- 2026-09-13 M1-7 Tutorial overlay levels 1–3
- 2026-09-13 M1-3b Coins on result screen, level locking
- 2026-09-13 M1-11 Pause menu + speed ×2
- 2026-09-13 M3-4 PWA manifest + service worker + icons (pulled forward)
- 2026-09-13 M1-9/M2-6 Tower War-style visual overhaul: terrain, 3D towers, soldiers, particles, toy HUD (stakeholder request)
- 2026-09-13 M1-8 WebAudio sfx (M key mutes)
- 2026-09-13 PUB-1..4 Store listing EN/AZ, privacy policy, launch checklist, release notes v0.1.0, captioned store screenshots + feature graphic, public README
- 2026-09-13 MM-0 Capacitor Android + iOS projects, icons/splash, APK + iOS simulator CI, docs/MOBILE.md
