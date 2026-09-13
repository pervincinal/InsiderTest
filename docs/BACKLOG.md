# Backlog (single source of work)

Priority = order within a section. Producer moves items; anyone may add to Bugs / Icebox.

## In progress (today)
(empty — next sprint picks from "Next")

## Next
- [ ] LV-1 Levels 27 and 31 are seed-sensitive for the bot (up to 127 s / 112 s); re-tune so the bot median < 80 s — level-designer
- [ ] LV-2 Now that the bot handles tank factories, re-open 27/31/37 so enemy tanks march (currently leaf factories) — level-designer + ai-engineer
- [ ] M3-2 Skins (2 tower roof shapes, 2 unit shapes) bought with coins — frontend-engineer + tech-artist
- [ ] M3-5 Perf on a real mid phone: measure, then object pooling if needed — qa-engineer
- [ ] M4-3 Tag `tower-clash-v0.2.0` after the stakeholder enables GitHub Pages and the first Pages deploy is green — producer
- [ ] PUB-6 Privacy policy hosted on the Pages site (`/privacy.html`) — publisher + frontend-engineer
- [ ] QA-1 Hardware-level run on a real Android phone (APK from CI): safe areas, audio unlock, back button, haptics — needs stakeholder's phone; until then a WebView-profile Playwright run — qa-engineer

## Next (M-mobile — iOS/Android)
- [ ] MM-1 Verify the Android debug APK from CI on a real phone; fix any WebView issue (safe areas, audio unlock, back button = pause) — mobile-engineer + qa
- [ ] MM-3 Signed release builds once keystore / Apple signing secrets exist (see docs/MOBILE.md) — mobile-engineer


## Later (M2 — content & feel)

## Later (M3 — meta & polish)
- [ ] M3-2 Skins (2 tower shapes, 2 unit shapes) bought with coins
- [ ] M3-5 Performance: 400 units at 60 fps on mid phone (object pooling, dirty rects if needed)

## Later (M4 — release)
- [ ] M4-3 Release notes 1.0, post-launch backlog

## Bugs
- [ ] BUG-1 (2026-09-13, QA) `e2e/smoke.spec.ts` fails after the save-schema v2 change — CI will go red once `src/ui/save.ts` is committed. Owner: Frontend Engineer (spec file is theirs today).
  - Repro: `cd tower-clash && npm run e2e -- smoke.spec.ts` → `smoke.spec.ts:191` `expect(saveAfterWin?.stars['1']).toBe(stars)` — Expected 3, Received undefined.
  - Cause: `src/ui/save.ts` now writes to `SAVE_KEY = 'towerclash.save.v2'` (v1 is only read for migration), but the spec mirrors `const SAVE_KEY = 'towerclash.save.v1'` (line 33), so `readSave` returns null. Verified the game is correct: after an autoplay win localStorage `towerclash.save.v2` = `{"version":2,"stars":{"1":3},"coins":30,...}` and `getResult()` = `{won, 3 stars, 30/30 coins}`; `tests/ui/save.test.ts` passes.
  - Fix: bump the mirror to `towerclash.save.v2` and also assert `localStorage.getItem('towerclash.save.v1') === null` on a fresh save (regression guard for the key move). Consider exposing `getSave()` on `window.__towerclash` so e2e stops mirroring the key.

## Icebox
- Daily challenge map with seed
- Replays (command log is already deterministic)
- Local 2-player on one screen

## Done
- 2026-09-13 Sprint 2: levels 16–40 with all mechanics + star tuning (M2-1..5, M2-8, M1-10); boosters UI (M3-1); settings (M3-3); mute (M1-8b/ART-3); Capacitor plugins + version sync + release signing path (MM-2, PUB-5); GitHub Pages workflow + DEPLOY.md (MM-5/M4-1); content/perf e2e + replay tests; cheap shadows (ART-1), dust/biomes (ART-2), shake + button sfx (M2-7); App Store screenshots; release notes v0.2.0; reference-bot tank-factory loop fix
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
- 2026-09-13 ART-v2 "Sunlit Clay Islands": trend research, art direction doc, lit/shade palette, long shadows, biomes, Fredoka type, claymorphic HUD/cards, winding level map, store shots regenerated
- 2026-09-13 M1-9/M2-6 Tower War-style visual overhaul: terrain, 3D towers, soldiers, particles, toy HUD (stakeholder request)
- 2026-09-13 M1-8 WebAudio sfx (M key mutes)
- 2026-09-13 PUB-1..4 Store listing EN/AZ, privacy policy, launch checklist, release notes v0.1.0, captioned store screenshots + feature graphic, public README
- 2026-09-13 MM-0 Capacitor Android + iOS projects, icons/splash, APK + iOS simulator CI, docs/MOBILE.md
