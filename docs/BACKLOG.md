# Backlog (single source of work)

Priority = order within a section. Producer moves items; anyone may add to Bugs / Icebox.

## In progress (today)
- [ ] M0-1 Scaffold `tower-clash/` (Vite + TS strict + Vitest + Playwright + ESLint) — producer
- [ ] M0-2 Sim core: types, constants, RNG, createState, step (generation, marching, arrival, capture, upgrade, unit clashes) + tests — gameplay-engineer
- [ ] M0-3 Canvas renderer + pointer input + game loop + minimal HUD (timer, win/lose overlay, restart) — frontend-engineer
- [ ] M0-4 Enemy AI v1 (rusher, turtle, opportunist) + reference player + `npm run playtest` — ai-engineer
- [ ] M0-5 Levels 1–5 (barracks only, 1 enemy) + `npm run levels:check` — level-designer
- [ ] M0-6 Playwright smoke test + screenshot — qa-engineer

## Next (M1 — vertical slice)
- [ ] M1-1 Fortress and artillery towers (GDD §2.2) + tests
- [ ] M1-2 Title screen, level select grid with stars, result screen, localStorage save
- [ ] M1-3 Stars by time, coins on first clear
- [ ] M1-4 Levels 6–15 (introduce fortress at 9, artillery at 12)
- [ ] M1-5 Send-ratio toggle (100 % / 50 %)
- [ ] M1-6 GitHub Actions CI: check + playtest + e2e on push
- [ ] M1-7 Tutorial overlay for levels 1–3 (tap-tap hint, upgrade hint)

## Later (M2 — content & feel)
- [ ] M2-1 Tank factory + tank unit (weight 5)
- [ ] M2-2 Mines and barriers on roads
- [ ] M2-3 Bridges: cut with long-press
- [ ] M2-4 Two and three simultaneous enemies; enemies fight each other
- [ ] M2-5 Levels 16–40 per bands
- [ ] M2-6 Particles (capture flash, death puff, upgrade pulse), subtle shake
- [ ] M2-7 WebAudio sfx (send, capture, upgrade, win, lose) + mute
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
(moved here with date)
