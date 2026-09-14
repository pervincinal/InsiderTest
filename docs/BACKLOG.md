# Backlog (single source of work)

Priority = order within a section. Producer moves items; anyone may add to Bugs / Icebox.

## In progress (today)
(empty — next sprint picks from "Next")

## Next (ECON — Phase B/C after accounts exist)
- [ ] ECON-1 Phase B: real RevenueCat + AdMob keys (secrets `RC_*`, `ADMOB_*`), sandbox purchase test on a device, App Store Connect / Play products created with catalog ids — mobile-engineer + publisher (needs stakeholder accounts)
- [ ] ECON-2 Settings → "Privacy options" (UMP form) and "Support ID" (RevenueCat app user id) as promised by the privacy policy — frontend-engineer + mobile-engineer
- [ ] ECON-3 Decide ATT: recommend no tracking (remove `requestTrackingAuthorization`, non-personalised ads on iOS) — producer default: no tracking
- [ ] ECON-4 Achievements list + booster crate + crystal→gold conversion UI (catalog has them) — frontend-engineer
- [ ] ECON-5 Skins: draw dedicated sprites for Pagoda/Onion roofs and extra helmets; terrain themes hook — tech-artist
- [ ] ECON-6 Continue-after-defeat: true 20 s rewind via state snapshots instead of restart+15 — gameplay-engineer + frontend
- [ ] ECON-7 Store screenshot 07 (shop) + IAP review screenshot — publisher
- [ ] ECON-8 `app-ads.txt` hosting needs a domain root (user-site repo or custom domain) — needs stakeholder decision
- [ ] ECON-9 Web build: hide IAP cards or label the fake store as demo on the public site (privacy policy Part A) — frontend-engineer; default: keep "Test store" caption, hide on Pages via `import.meta.env.MODE`

## Next
- [ ] LV-1 Level 27 Armour Race: bot 96/100 seeds (losers 4, 33, 39, 81), median 83 s; re-tune toward ≥ 99/100 and median < 60 s — level-designer
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
- [x] BUG-1 (2026-09-13, QA) `e2e/smoke.spec.ts` fails after the save-schema v2 change — CI will go red once `src/ui/save.ts` is committed. Owner: Frontend Engineer (spec file is theirs today).
  - Repro: `cd tower-clash && npm run e2e -- smoke.spec.ts` → `smoke.spec.ts:191` `expect(saveAfterWin?.stars['1']).toBe(stars)` — Expected 3, Received undefined.
  - Cause: `src/ui/save.ts` now writes to `SAVE_KEY = 'towerclash.save.v2'` (v1 is only read for migration), but the spec mirrors `const SAVE_KEY = 'towerclash.save.v1'` (line 33), so `readSave` returns null. Verified the game is correct: after an autoplay win localStorage `towerclash.save.v2` = `{"version":2,"stars":{"1":3},"coins":30,...}` and `getResult()` = `{won, 3 stars, 30/30 coins}`; `tests/ui/save.test.ts` passes.
  - Fix: bump the mirror to `towerclash.save.v2` and also assert `localStorage.getItem('towerclash.save.v1') === null` on a fresh save (regression guard for the key move). Consider exposing `getSave()` on `window.__towerclash` so e2e stops mirroring the key.
  - 2026-09-13 (later, QA): recurs with schema v3 — `src/ui/save.ts` now writes `towerclash.save.v3` with `gold`, while `e2e/smoke.spec.ts:37` still mirrors `towerclash.save.v2` / `coins` (`readSave` will return null again, `saveAfterWin?.stars['1']` undefined). Same fix; exposing `getSave()` on the debug surface ends this class of break for good.
  - 2026-09-14 (QA): **fixed** — `smoke.spec.ts` mirrors `towerclash.save.v3`/`gold` and `window.__towerclash.economy.getSave()` exists; smoke passes on a clean HEAD worktree and in today's sweep (regression guard = the smoke spec itself).
- [x] BUG-2 (2026-09-13, QA, hygiene) `tower-clash/.gitignore` ignores only `.env*.local`; the Android/iOS workflows now write `tower-clash/.env.production` from repository secrets (`VITE_RC_*_KEY`, `VITE_ADMOB_*`). A developer who creates the same file locally (docs/MOBILE.md §8.3 suggests `.env.local`, but Vite also reads `.env.production`) would commit store keys. Owner: Mobile Engineer (`.gitignore`/MOBILE.md are theirs).
  - Repro: `cd tower-clash && echo 'VITE_RC_ANDROID_KEY=goog_x' > .env.production && git status --short` → `?? .env.production` (not ignored).
  - Fix: add `.env.production` (or `.env*` minus `.env.example`) to `tower-clash/.gitignore`; mention in MOBILE.md §8.3 that CI writes it.
  - 2026-09-14 (QA): **fixed** — `.env.production` is in `tower-clash/.gitignore`. Regression test: `tests/repo/hygiene.test.ts` (fails if the ignore lines for `.env.production` / `.env*.local` disappear).
- [x] BUG-3 (2026-09-13, QA) Working tree (uncommitted, Frontend Engineer's save-v3 / economy work in flight): `SaveData.coins` was renamed to `gold` in `src/ui/save.ts` and `src/ui/boosters.ts` but the callers were not updated, so `npm run check` and `npm run e2e` fail and **every level is unplayable in the browser** (sim never ticks). Must be fixed in the same commit; CI (`tower-clash-ci.yml`) goes red otherwise. Owner: Frontend Engineer.
  - `npm run typecheck`: 19 errors — `src/main.ts:194`, `src/ui/play.ts:152,171,214,232`, `src/ui/screens.ts:86,152,275` (`Property 'coins' does not exist on type 'SaveData'`; `TitleOpts`/`LevelSelectOpts` have no `coins`), `tests/ui/save.test.ts:34–114` (9×).
  - `npm run test`: `tests/ui/save.test.ts` 5 failed — `recordWin … pays 10 per new star` (`save.test.ts:34` expected undefined to be 20), `normalizeSave clamps hostile input` (`:52`), `reads a v1 save … writes the v2 copy` (`:79` expected 3 to be 2 — version is now 3), `prefers the v2 entry …` (expected undefined to be 99), `spendCoins only deducts what is affordable`.
  - Runtime (vite build without tsc, then Playwright): `loadLevel(1)`/`loadLevel(40)` → screen `play` but `getState().time` stays 0; `pageerror: TypeError: Cannot read properties of undefined (reading 'prices')` at `boosterStatus` (`src/ui/boosters.ts:53`) ← `PlayScreen.buildUi` (`src/ui/play.ts:152` passes `this.app.save.coins`, now `undefined`, so `walletOf(undefined)` returns undefined) ← `draw` ← `frame`; the exception aborts every frame. `e2e/perf.spec.ts` "level 40 … median frame" fails with `sim must have advanced while sampling` (Expected > 0, Received 0).
  - Fix: pass `this.app.save.gold` (or a `BoosterWallet` with `charges`/`prices`) from `play.ts`, update `main.ts`/`screens.ts` and `tests/ui/save.test.ts` to `gold`, and make `walletOf` tolerate `undefined` (`?? { gold: 0 }`) so a wallet plumbing mistake can never freeze the game loop again. Regression test to add once fixed: `tests/ui/boosters.test.ts` — `boosterStatus(state, kind, undefined as never)` does not throw; e2e content spec already asserts `time > 0` per level.
  - 2026-09-14 (QA): **fixed** in 5dc94e9 — `npm run check` green (327 tests), `content.spec.ts` asserts `time > 0` on all 40 levels. Residual (low, still open): `walletOf` (`src/ui/boosters.ts:47`) still returns `undefined` for an undefined wallet, so `boosterStatus(state, kind, undefined as never)` throws `reading 'prices'`; the regression test from this entry is held back until the `?? { gold: 0 }` guard lands (QA adds the `tests/ui/boosters.test.ts` case the same day).
- [ ] BUG-4 (2026-09-14, QA) `e2e/economy.spec.ts` "commander upgrade bought in the shop changes state.modifiers of the next level" **fails at HEAD (ac35c5f)** — the `tower-clash-ci.yml` e2e step is red on the branch. Owner: Frontend Engineer (a fix is already in their uncommitted `economy.spec.ts`, +163/−13 — commit it).
  - Repro: `cd tower-clash && npm run e2e -- economy.spec.ts` → `economy.spec.ts:76` `expect.poll(async () => (await save(page)).upgrades.production).toBe(1)` — Expected 1, Received undefined (10 s poll). Verified on a clean HEAD worktree: economy+smoke = 1 failed / 4 passed.
  - Cause: aec604e retuned the ladder (`src/economy/catalog.ts`: production maxTier 3, `TIER_COSTS_3 = [200, 350, 550]`, perTier 0.02) and updated the unit tests, but the spec still mirrors `TIER1_COST = 60`, `PRODUCTION_PER_TIER = 0.04` and seeds `gold: 100`. The tap on row 0 does reach `tapUpgrade` → `buyUpgrade` returns false (unaffordable, toast "Need 200 gold"); row 1 (Capacity, 60) buys fine — verified with a direct probe on the isolated build.
  - Fix: mirror the new ladder (seed ≥ 200 gold, or buy Capacity tier 1 → `capacityMul: 1.05`). To survive the next retune, stop mirroring: expose `economy.upgradeCost(id)` on the debug surface and read it in the spec.
- [ ] BUG-5 (2026-09-14, QA) Working tree (uncommitted achievements work in `src/main.ts` / `src/economy/achievements.ts`): `e2e/smoke.spec.ts:280` `expect(result).toEqual({ outcome, stars, coinsEarned, coinsTotal, crystalsEarned })` will fail once `main.ts` is committed — `getResult()` now also returns `achievements: ['first_win', 'flawless', 'speedrunner']` (`+ Received + 5`). Retried after 5 min on a fresh isolated build: still failing. Owner: Frontend Engineer (both files theirs — same commit).
  - Repro: `cd tower-clash && npm run e2e -- smoke.spec.ts` on the current tree.
  - Fix: pin the new key in the spec (`achievements: ['first_win', 'flawless', 'speedrunner']` for the 3★ first clear on seed 1 — it is content, so assert it rather than `expect.any(Array)`), and keep `crystalsEarned` consistent with whatever the unlocks pay.
- [ ] BUG-6 (2026-09-14, QA, hygiene) Untracked `tower-clash/e2e/look2.tmp.spec.ts` (Tech Artist screenshot scratch: 3 tests, no assertions, absolute `SHOTS` path) lives in Playwright's `testDir` and matches the `chromium` project, so `npm run e2e` and CI would execute it the moment it is committed (`git add -A`). Owner: Tech Artist — delete it before committing, or keep scratch specs outside `e2e/` (e.g. the session scratchpad); files that must stay should not end in `.spec.ts`.

## Icebox
- Daily challenge map with seed
- Replays (command log is already deterministic)
- Local 2-player on one screen

## Done
- 2026-09-13 Sprint 3 (monetization): market research + ECONOMY.md + catalog; gold/crystal wallet, save v3; shop (crystal packs, starter pack, remove ads, premium bundle, skins, 5 commander upgrade tracks); daily reward; rewarded/interstitial ads flow with caps; sim player modifiers; store/ads providers (RevenueCat, AdMob, fakes) + native config; modifier-aware AI + `--upgrades` playtest; privacy policy v2, IAP/ads store disclosures, accounts guide; bundle-size and secrets-aware CI
- 2026-09-13 Sprint 2b: threat-aware reference bot (levels 1–8 100/100 seeds, `--seeds` sweep, client-identical RNG), levels 10/11/20/35 retuned to 100/100, smoke test pinned to seed 1, Pages deploy non-fatal until enabled
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
