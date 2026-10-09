# Tower Clash — store listing (native v1.0 with in-app purchases and ads)

Owner: Publisher. This is the listing for the **first store submission**, which per `docs/ECONOMY.md` §8 is the native build with RevenueCat purchases and AdMob ads (Phase B, "v1.0 native"). The web/PWA build keeps no ads and no purchases and has no store listing. Character counts are verified with `node -e` (§5); limits are the stricter of Google Play and App Store.

**Status of the claims (2026-09-17, v0.4.0 "Streams update").** Everything described below is committed: the economy and shop (v0.3.0, `docs/BACKLOG.md` "Done" Sprint 3 + Day 2/2b), the in-game languages EN/AZ/RU/TR (`9e45fc9`) and **rules v2** (`docs/GDD.md` §2.0; commits `4bb3944`, `8e53c03`, `2d8cb24`): attacks are persistent **streams** (tap your tower, tap a target, the stream keeps flowing until you stop it; a L1/L2/L3 tower runs 1/2/3 streams), towers **upgrade automatically** when the garrison fills (25 → L2, 50 → L3, 100 max), the SEND 100 % / 50 % toggle and the paid tap-to-upgrade are gone, all 40 levels retuned, levels load on demand. Also in the build since the same day: **rules v2.1 "Under fire"** (`3e4a388`, GDD §2.0): a hostile soldier landing on a tower pauses that tower's recruiting for 1.5 s, so an unanswered enemy stream eventually takes any tower; the count badge turns peach with a crossed-swords pip while it lasts — described in the long description with one line (§1.1 / §1.2 "A tower under attack…") and one clause in the "What's new" texts, nothing more (no numbers in public texts; the level 2 lesson and the star clocks have not been re-measured for it yet). **Level names and lessons are in EN/AZ/RU/TR** (`235def1`, I18N-2). The screenshot files in `tower-clash/store/screenshots/` are the v0.4.0 retake (`577b894`, §1.3). If a build is submitted *without* the economy, use the ad-free wording kept in §1.4.

What must NOT be claimed: leaderboards, multiplayer, cloud save, more than 50 levels, subscriptions, loot boxes, tablet support (phone-only listing), "no ads" / "no purchases" for the store builds, and — since rules v2 — "send half / send all", a send-ratio switch or upgrading a tower by tapping / paying soldiers; and — since Rules v3 — roads, bridges, a bridge cut, barriers, or a tower being drained by sending.

**Status 2026-09-21b (Rules v3, GDD §2.0b).** The road model is gone from the 1.0.0 RC (no version bump): a tower attacks any tower it can see in a straight line, walls / water / rocks / other towers block the line, sending keeps the garrison and only pauses growth, each stream runs at the tower's level speed, bridges and barriers are removed, mines are points on the map. §1.1 / §1.2, the promotional text, keywords and §4 below were reworded the same day; every screenshot set was re-rendered the same day (`0e0ee66`: walls, fords, straight ribbons — §1.3, `LAUNCH_CHECKLIST.md` G10 / A11 / R3).

**Addendum 2026-09-20 (v1.0.0 release candidate, `RELEASE_NOTES.md`).** Also in the tree and claimable: the **Daily Challenge** with streak milestones (GDD §7; one bullet added below in §1.1 / §1.2), four **silhouette skins** (Round keep, Watchtower, Shield bearers, Clockwork robots — 21 skins in total; the "tower, helmet and island skins" wording stays true; *2026-10-08: the 21 counted the renderer's looks, the shop catalog had 16 — it has **20** since skin drop #2, see Status 2026-10-08*), level 2's under-fire lesson, ten pool levels retuned, three-canvas rendering. Not claimable on 2026-09-20: a weekly challenge, levels beyond 40 — both lifted on 2026-09-21 (next paragraph).

**Status 2026-09-21 (PUB-10, done — v1.0.0 release candidate carries 50 levels and the Weekly Challenge).** Band 5 "Grand Campaign", levels 41–50 (`bb5c147`, LV-9), is in `src/levels/manifest.ts` with names and lessons in EN/AZ/RU/TR and final star clocks; `npm run levels:check` reports "50 level(s) valid", the reference bot wins 500/500 plain runs and ≥ 47/50 under every twist (`docs/BACKLOG.md` "Done" 2026-09-20). The **Weekly Challenge** shipped in `3f46f16` (WEEKLY-1, GDD §8): one fixed match per week from Monday 00:00 UTC, a level from 33–50, always one of the four non-plain twists, 100 gold for the first win and 20 crystals once for a run at or under the level's 3★ clock, a week streak, a WEEKLY tab on the daily card, unlocked after level 32. Every "40 levels" claim below therefore says **50** (this status, the "more than 50 levels" clause above, §1 short descriptions, §1.1 / §1.2 headings, §2 promotional texts, §3 keywords, §5 script) and §1.1 / §1.2 gained one bullet for levels 41–50 and one for the weekly; counts re-run in §5 (3981 / 3947 of 4000). Still not claimable: a sixth biome ("FIVE ISLANDS" stays — GDD §3 says 41–50 use the volcanic palette), leaderboards, cloud save, tablets. Version in the tree: 1.0.0 / build 5 (`RELEASE_NOTES.md`) — build 6 since 2026-09-24 (next paragraph).

**Status 2026-09-25 (release-readiness pass, HEAD `4b7738f`, 1.0.0 / build 6).** Build 6 (`ac41e5d`, 2026-09-24) changed no claim: the tutorial band (levels 1–8) was rebuilt for first-time players, a stalemate hint was added, guide lines and enemy ribbons were restyled, star clocks re-derived — every text below is unchanged and still true (no road / bridge / barrier wording anywhere in §1–§3; 50 levels; four languages). The screenshot sets on disk are the Rules v3 render of 2026-09-21 (`0e0ee66`); the maps of levels 1 / 4 / 8 and the ribbon styling changed after that render, so the sets are **re-rendered on build 6 before upload** (G10 / A11) — same frames, same captions, nothing to re-approve.

**Status 2026-09-27 (build 7, PUB-11).** One claim changed: levels 41–50 got their own biome, the twilight highlands (`e52186a`, ART-8), so "FIVE ISLANDS" became **"SIX ISLANDS"** in §1.1 / §1.2 (EN 3984 / AZ 3955 characters, limit 4000); nothing else in the build-7 changes — the "How to play" card (FE-3), the defeat tip (FE-4), the refuse / stalemate sounds (ART-9), the PWA offline fix (BUG-18), the faster first load (PERF-4 / PERF-6), the level 36 retune (LV-17), the Azerbaijani text pass (L10N-1) — contradicts a listing text; the "What's new" block for build 7 is in `RELEASE_NOTES.md`. Screenshots: the sets were re-rendered on build 6 (`e3117c7`, 2026-09-25); on build 7 the **AZ Google set** (`raw-az/`, `az/`) was re-rendered because L10N-1 changed the tutorial hint, lesson banners and the shop tab that are on those frames, and frame 02's AZ caption follows the new glossary ("Toxun — axın davam edir"); EN / RU / TR and both Apple sets are unchanged. No frame shows a level ≥ 41, so the sixth biome is in no screenshot — a 41+ frame stays PUB-6 (1.0.1).

**Status 2026-09-28 (PUB-12, App Store publish pack — the Apple Developer account is verified).** No claim changed in the build (still 1.0.0 / build 7). Two things changed around the listing: (1) GitHub Pages is on — the `tower-clash-pages` deploy succeeds on every push since 2026-09-28 — so the marketing / support / privacy URLs below are live (confirm once in Safari; the sandbox cannot reach github.io); the "active once Pages is enabled" notes are gone (W3 / W6). (2) **Default for the first App Store submission: 1.0.0 without in-app purchases** (`LAUNCH_CHECKLIST.md` A18, §0b): the build is made without `RC_IOS_KEY`, the purchase SDK is never configured, the shop's Crystals / Bundles tabs show the packs greyed out with "Store unavailable on this platform" (nothing can be bought, Restore Purchases disabled; skins, booster crate and Commander upgrades keep working with earned gold / crystals — `src/ui/shop.ts`, `src/render/menusShop.ts`, `src/economy/store.ts`). The App Store texts that mention purchases therefore have a **variant B** (§2.1) with the purchase phrases removed, and the review notes exist in two variants (§2). Variant A (the texts as written, with IAP) returns in 1.0.1 with the products (MZ3, MZ13). The click order and the paste-ready fields are `LAUNCH_CHECKLIST.md` §0b and `APP_STORE_CONNECT_SHEET.md`.

**Status 2026-10-03 (ECON-12 / PUB-14, Producer decisions; the Frontend implements the code the same day).** (1) The `premium_bundle` store description is now `No interstitials, 600 crystals, 2 skins, -10%` (45; §6.1) — "No ads" overclaimed, because the bundle removes the between-level ads only and rewarded videos stay (`docs/ECONOMY.md` §5.2). (2) A non-consumable's crystals / gold are granted once per purchase on a device: repeated restores, purchase retries or a progress reset add nothing more; a restore on a fresh install grants them once (§6.1 rules). (3) The Starter Pack is offered only after level 5, as `docs/ECONOMY.md` §4 says; no listing text names a level, nothing to change. (4) PUB-14: in the no-IAP 1.0.0 build the shop's Crystals and Bundles tabs are **hidden**, not greyed — the shop shows cosmetic skins and gold upgrades only; §2.1, variant-B substitution 1 (the booster crate is on the hidden Bundles tab, so variant B no longer names it) and the variant-B review notes are rewritten; counts re-run: description B EN **3863** / AZ **3825**, review notes B **943**. (5) Build numbers: 7 = the release candidate with Google test ads (TestFlight only), **8 = 1.0.0 with the real AdMob ids, the App Review build**, 9 = 1.0.1 with in-app purchases (`RELEASE_NOTES.md` v1.0.0, "Build numbers").

**Status 2026-10-08 (PUB-16 — four things shipped since the texts of 2026-10-04 that a reviewer or a store form can see).** (1) **Share card** (`2eb5cfc` SHARE-1, `1f83ef3` MM-8, 2026-10-05): SHARE on the result card (PAYLAŞ in Azerbaijani; not on yesterday's-map practice) draws a 1080×1350 PNG on the device and opens the system share sheet (`@capacitor/share` + `@capacitor/filesystem`, the file sits in the app's private cache); nothing is uploaded and the app makes no network call. (2) **Week-streak milestones** (`2abba7c` WK-1, 2026-10-06): 4 / 8 / 12 weeks won in a row pay 15 / 30 / 60 crystals once per streak run. (3) **Skin drop #2** (`50d48ae` ART-11, 2026-10-06): Crusader helmet (120) and Spartan helmet (150) — the catalog now has **20** skins (6 roofs incl. the Gold roof, 7 helmets incl. the Bronze and Royal helmets, 3 terrain themes, 4 silhouettes; `SKINS` in `src/economy/catalog.ts`), 17 sold for crystals in the shop and 3 pack exclusives. (4) **In-App Review plugin** (`9ea6d55` MM-9, 2026-10-07): `@capacitor-community/in-app-review` is in the binary but disabled — since MM-10 (2026-10-08) it is switched on only by the repository variable `RATING_PROMPT` = `on`, which stays unset for 1.0.0 (`LAUNCH_CHECKLIST.md` §5, `RATING_PROMPT` row — nothing to set; TestFlight check TF-21). What changed in this file: the review notes A / B (§2) gained the share-sheet sentence and B the rating sentence (A **1025**, B **1202** of 4000, code points); §4's "User interaction" row names the share sheet; §6.3 and §6.4 record that neither feature adds a data type. What did **not** change: the long descriptions. "Share your result card" was measured as one sentence at the end of the three-star bullet — EN §1.1 would be 3984 + 24 = **4008** (over 4000), variant B EN 3887 and AZ §1.2 3955 + 23 = 3978 would fit — and was left out of all of them so the variant-B and AZ texts stay the variant-A text with the four §2.1 substitutions; the listing has no RU or TR long description (Play shows EN or AZ there), so there is nothing to add in those two. No listing text states a skin count ("tower, helmet and island skins" stays true), and the week-streak bonus is not named in the weekly bullet (the daily bullet names its streak bonus; a weekly one would also push EN §1.1 past 4000). Short descriptions, promotional texts, keywords and screenshots are unchanged — the share card and the new helmets are in no frame (the sets are the build-7 render of 2026-09-27, so frame 07's result card predated the SHARE button: a button missing from a picture, not a claim). **Frame 07 re-cut 2026-10-09 on `d208419`+ (PUB-17): SHARE button** — in every set (EN / AZ / RU / TR Google, Apple 6.7" / 6.5"), PAYLAŞ in AZ and TR, ПОДЕЛИТЬСЯ in RU; frames 01–06 / 08–10 are unchanged. **RU set re-cut 2026-10-09 (PUB-19, ART-13 font)** — all eight `ru/` frames on `b6cbe5a`, Cyrillic and digits in one Nunito family (§1.3).

---

## 1. Google Play

| Field | Limit | EN | AZ |
|---|---|---|---|
| App name | 30 | `Tower Clash` (11) | `Tower Clash` (11) |
| Short description | 80 | `Capture every tower. One-thumb real-time strategy, 50 levels, plays offline.` (76) | `Bütün qüllələri tut. Bir barmaqla real vaxt strategiya, 50 səviyyə, oflayn.` (75) |
| Category | — | Games › Strategy | Oyunlar › Strategiya |
| Tags | — | Strategy, Casual, Single player, Offline, Stylised | — |
| Contact e-mail | — | `[developer e-mail]` | — |
| Privacy policy URL | — | `https://pervincinal.github.io/InsiderTest/privacy.html` (policy v2.1 with the ads/purchases section; the page is `tower-clash/public/privacy.html`, published by the Pages job — not live yet: GitHub Pages was never enabled, BUG-26, checklist W3) | — |
| Website (optional) | — | `https://pervincinal.github.io/InsiderTest/` — support page `https://pervincinal.github.io/InsiderTest/support.html` | — |
| Store labels (automatic) | — | **Contains ads** (from the Ads declaration) · **In-app purchases** (from the product list) — Google adds both badges; nothing to type | — |

### 1.1 Full description — English (≤ 4000)

```
Tower Clash is a one-thumb real-time strategy game: tap one of your towers, tap a target, and a stream of soldiers starts marching — and keeps marching until you stop it. Reinforce friendly towers, overwhelm hostile ones, and when a garrison hits zero the tower is yours. Capture every enemy tower to win.

HOW IT PLAYS
• Tap a blue tower, then tap any tower it can see in a straight line: a stream of soldiers starts flowing there — and keeps flowing until you tap the target again. Walls, water and rocks block the line. Drag from tower to tower works too.
• Towers upgrade themselves: let one fill to 25 soldiers and it becomes level 2, at 50 level 3 (100 max). Bigger towers recruit faster and run more streams — one at level 1, two at level 2, three at level 3.
• Sending never empties a tower — it only stops growing while it streams, and bigger towers stream faster. Close the stream to let it level up.
• A tower under attack stops recruiting — answer every enemy stream, or the tower falls.
• Enemy streams are drawn as straight ribbons in their colour, so you always see where the next attack comes from — and where to answer it.

50 HAND-MADE LEVELS
• Levels 1–3 teach the basics with a short built-in tutorial; every later level opens with a one-line lesson.
• Fortresses (from level 9) shrug off half of every attack — bring more than you think.
• Artillery (from level 12) shoots down soldiers that walk into its range — approach from the right side.
• Two enemies at once from level 17, three from level 33 — and they fight each other too.
• Walls, rivers and rocks that block the line of attack, and mines that take out the first soldiers to pass over them.
• Tank factories (from level 25): a tank weighs five soldiers but crawls — send it first and let the infantry catch up.
• Levels 41–50, the Grand Campaign: three enemies, walls and mines on every map, the toughest islands — no new rules, all of them at once.
• Beat every level for three stars: the faster you win, the more stars you earn. Stars unlock the next level and pay gold.
• Daily Challenge: one fixed level, seed and twist per day, the same for everyone — free retries, gold and crystals for the first win, bonus crystals for a 3-, 7- and 30-day win streak.
• Weekly Challenge: every Monday one twisted level from the late campaign, the same for everyone — 100 gold for the first win, 20 crystals for beating its three-star clock.

GOLD, CRYSTALS AND UPGRADES
• Gold is earned by playing — stars, replays and daily rewards — and buys Overdrive (×3 production for 10 s), Freeze (enemies stop producing for 5 s), Airstrike (−10 soldiers on one enemy tower) and permanent Commander upgrades (production, capacity, starting garrison, march speed, cheaper boosters).
• Crystals come from milestones, achievements, the daily chest and optional purchases; they buy tower, helmet and island skins, a booster crate, or a second chance after a defeat.
• Every level is winnable without spending anything — upgrades are a shortcut, never a requirement.

SIX ISLANDS
• Grass, autumn, sand, snow, volcanic and twilight islands, drawn in a soft clay style with sunlit shadows.

BUILT FOR PHONES
• Portrait, one hand, every level under three minutes.
• Pause menu with a ×2 speed switch for when you are already winning.
• Settings: sound, colour-blind palette, reduced motion, language; mute button right in the HUD.
• Plays offline: the campaign needs no connection (ads and purchases do).

HONEST BY DESIGN
• No account, no sign-in — your progress is stored only on your device.
• Optional purchases only: crystal packs, a Starter Pack, Remove Ads and a Premium Bundle. No subscriptions, no loot boxes.
• A short ad between levels at most every third level, never during a battle, and never in the first five levels. Rewarded videos are always your choice. One purchase removes the between-level ads for good.

Menus, hints, the tutorial, level names and lessons are in English, Azerbaijani, Russian and Turkish.
```

### 1.2 Full description — Azerbaijani (≤ 4000)

```
Tower Clash bir barmaqla oynanan real vaxt strategiya oyunudur: öz qüllənə toxun, hədəfə toxun — əsgər axını yola düşür və sən dayandırana qədər davam edir. Dost qüllələri gücləndir, düşmən qüllələrini sıxışdır; qarnizon sıfıra düşəndə qüllə sənindir. Qalib gəlmək üçün bütün düşmən qüllələrini tut.

NECƏ OYNANIR
• Mavi qülləyə toxun, sonra düz xətlə gördüyü istənilən qülləyə toxun: ora əsgər axını başlayır — və sən hədəfə yenidən toxunana qədər davam edir. Divar, su və qaya xətti kəsir. Qüllədən qülləyə sürükləmək də işləyir.
• Qüllələr özləri təkmilləşir: biri 25 əsgərə dolsun — 2-ci səviyyə olur, 50-də 3-cü səviyyə (maksimum 100). Böyük qüllə daha sürətli əsgər yığır və daha çox axın aparır — 1-ci səviyyədə bir, 2-cidə iki, 3-cüdə üç.
• Göndərmək qülləni boşaltmır — axın verərkən yalnız böyümür, böyük qüllə daha sürətli axın verir. Səviyyəsi qalxsın istəyirsənsə axını bağla.
• Hücum altındakı qüllə əsgər yığmır — hər düşmən axınına cavab ver, yoxsa qüllə düşər.
• Düşmən axınları düz lentlərlə öz rəngində çəkilir — növbəti hücumun haradan gəldiyini və hara cavab verəcəyini həmişə görürsən.

50 ƏL İLƏ HAZIRLANMIŞ SƏVİYYƏ
• 1–3-cü səviyyələr qısa daxili təlimatla əsasları öyrədir; sonrakı hər səviyyə bir cümləlik dərslə başlayır.
• Qalalar (9-cu səviyyədən) hər hücumun yarısını dəf edir — düşündüyündən çox əsgər apar.
• Top qüllələri (12-ci səviyyədən) mənzilinə girən əsgərləri vurur — düzgün tərəfdən yaxınlaş.
• 17-ci səviyyədən eyni anda iki, 33-cü səviyyədən üç rəqib — onlar bir-biri ilə də vuruşur.
• Hücum xəttini kəsən divarlar, çaylar və qayalar, və üstündən keçən ilk əsgərləri məhv edən minalar.
• Tank zavodları (25-ci səviyyədən): tank beş əsgər ağırlığındadır, amma yavaş gedir — əvvəl onu göndər, piyada arxadan çatsın.
• 41–50-ci səviyyələr, Böyük Kampaniya: hər xəritədə üç rəqib, divar və mina, ən çətin adalar — yeni qayda yoxdur, hamısı bir yerdə.
• Hər səviyyədə üç ulduz qazan: nə qədər tez qalib gəlsən, o qədər çox ulduz. Ulduzlar növbəti səviyyəni açır və qızıl qazandırır.
• Günlük Çağırış: hər gün hamı üçün eyni səviyyə, seed və fənd — pulsuz təkrar cəhdlər, ilk qələbəyə qızıl və kristal, 3, 7 və 30 günlük qələbə seriyasına bonus kristal.
• Həftəlik Çağırış: hər bazar ertəsi kampaniyanın son hissəsindən fəndli bir səviyyə, hamı üçün eyni — ilk qələbəyə 100 qızıl, üç ulduz vaxtını keçəndə 20 kristal.

QIZIL, KRİSTAL VƏ TƏKMİLLƏŞDİRMƏLƏR
• Qızıl oyunla qazanılır — ulduzlar, təkrar oyunlar və gündəlik mükafatlar — və Overdrive (10 saniyə ×3 istehsal), Freeze (rəqiblər 5 saniyə istehsal etmir), Airstrike (bir düşmən qülləsindən −10 əsgər) və daimi Komandir təkmilləşdirmələri (istehsal, tutum, başlanğıc qarnizon, yürüş sürəti, ucuz gücləndiricilər) üçün xərclənir.
• Kristallar mərhələlərdən, nailiyyətlərdən, gündəlik sandıqdan və könüllü alışlardan gəlir; qüllə, dəbilqə və ada görünüşləri, gücləndirici sandığı və ya məğlubiyyətdən sonra ikinci şans alır.
• Hər səviyyə heç nə xərcləmədən keçilə bilər — təkmilləşdirmələr qısa yoldur, tələb deyil.

ALTI ADA
• Çəmən, payız, qum, qar, vulkan və alaqaranlıq adaları — günəşli kölgələrlə yumşaq gil üslubunda.

TELEFON ÜÇÜN HAZIRLANIB
• Şaquli ekran, bir əl, hər səviyyə üç dəqiqədən qısa.
• Pauza menyusunda ×2 sürət düyməsi.
• Parametrlər: səs, rəng korluğu palitrası, azaldılmış hərəkət, dil; səssiz düyməsi birbaşa HUD-da.
• Oflayn oynanır: kampaniya üçün internet lazım deyil (reklam və alışlar üçün lazımdır).

DÜRÜST OYUN
• Hesab, giriş yoxdur — irəliləyişin yalnız öz cihazında saxlanılır.
• Yalnız könüllü alışlar: kristal paketləri, Başlanğıc paketi, Reklamları sil və Premium paket. Abunəlik yoxdur, loot box yoxdur.
• Səviyyələr arasında qısa reklam ən çox hər üçüncü səviyyədə, heç vaxt döyüş zamanı və heç vaxt ilk beş səviyyədə. Mükafatlı videolar həmişə sənin seçimindir. Bir alış səviyyələr arası reklamları həmişəlik silir.

Qeyd: menyular, işarələr, təlimat, səviyyə adları və dərslər azərbaycanca, ingiliscə, rusca və türkcədir.
```

### 1.3 Graphic assets (all rendered from the game by `tower-clash/store/tools/renderStoreShots.mjs`)

| Asset | Requirement | File |
|---|---|---|
| App icon | 512×512 PNG, 32-bit | `tower-clash/public/icons/icon-512.png` (same mark as `resources/icon.svg`) |
| Feature graphic | 1024×500 PNG/JPG | `tower-clash/store/feature-graphic.png` (144 KB) |
| Phone screenshots | 2–8, 9:16, 320–3840 px | `tower-clash/store/screenshots/en/01..08.png`, `az/`, `ru/`, `tr/` (one set per store language; caption *and* the game's own UI in that language, PUB-7), 1080×1920, each < 600 KB (Rules v3 render, `0e0ee66`, 2026-09-21, all four languages; re-rendered on build 6, `e3117c7`, 2026-09-25; AZ set re-rendered on build 7, 2026-09-27, after L10N-1; **PUB-6 re-cut, all four sets re-rendered on build 7, 2026-09-27**: frames 04 / 06 / 08 are level 24, level 45 and the WEEKLY tab — `LAUNCH_CHECKLIST.md` G10; frame 07 re-cut 2026-10-09 on `d208419`+ (PUB-17): SHARE button, other frames unchanged; **RU set re-cut 2026-10-09 (PUB-19, ART-13 font)** on `b6cbe5a`: all eight `ru/` frames, Cyrillic and digits in one Nunito family) |
| IAP review screenshot (Apple only, not shown on any store page) | ≥ 640×920 | `tower-clash/store/iap-review/shop-crystals.png`, 1290×2796, uncaptioned shop Crystals tab (see §6.1; re-rendered in the PUB-6 run, same content) |

Screenshot order and captions (same frames in every set; the `SHOTS` table in `renderStoreShots.mjs` is the source of truth). **Status (2026-09-17, v0.4.0 retake by the Tech Artist, commit `577b894`; Publisher check of `store/screenshots/raw/*.png` and `en/`, `az/`):** all eight frames are rules-v2 renders — STREAMS pill in the HUD, no SEND toggle, the new tutorial hint on 02 — and the set is ready to upload. **2026-09-21, Rules v3 (`0e0ee66`):** the whole set (Google, Apple, AZ/RU/TR) was re-rendered under v3 — frame 03 shows straight lanes and the wall of level 5 "Around the Wall", rivers are water with fords, ribbons are straight; "done" below means "rendered under Rules v3 on 2026-09-21". **2026-09-25:** re-rendered on build 6 (`e3117c7` — the level 1 / 4 / 8 maps and the ART-7 ribbon styling had changed after the 09-21 render; the frame list and captions stayed, the result frame moved to level 9). **2026-09-27 (build 7):** the AZ Google set re-rendered after the L10N-1 Azerbaijani pass (tutorial hint "Öz qüllənə toxun", lesson banners of levels 1 / 4 / 9, shop tab "TƏLİM"); frame 02's AZ caption is now "Toxun — axın davam edir" (glossary: toxun, not vur); EN / RU / TR and the Apple sets are unchanged, and no frame shows a level ≥ 41, so the sixth biome is not in any set. **2026-09-27, PUB-6 (pulled forward from 1.0.1 by the Producer; Publisher decision, all sets re-rendered on build 7):** three frames come from the mid and late campaign — 04 level 24 "The Gauntlet" (two enemy colours, mines, boulders, sand island), 06 level 45 "Three Fronts" (band 5, twilight highlands, three enemies, the wall gap, a mine) and 08 the WEEKLY tab of the challenge card; the former 04 "Fill up to level up" and 05 "L2 needed for 2 streams" frames were retired and the shop frame moved to the App Store extras (10). Google Play allows up to 8 phone screenshots, App Store up to 10 (frames 09 and 10 are App Store only). **2026-10-09, PUB-17:** frame 07 re-cut 2026-10-09 on `d208419`+ (PUB-17): SHARE button — the result card now shows SHARE (PAYLAŞ in AZ / TR, ПОДЕЛИТЬСЯ in RU, SHARE-1 2026-10-05) under NEXT / RETRY / MENU; same level 9, seeds 4 / 5 / 14, three stars, 00:24, same captions; re-rendered in all six sets (Google EN / AZ / RU / TR, Apple 6.7" / 6.5"), every other frame byte-identical. **2026-10-09, PUB-19 — RU set re-cut 2026-10-09 (PUB-19, ART-13 font):** all eight `ru/` frames re-rendered on `b6cbe5a` (clean build of HEAD in a scratch directory, `renderStoreShots.mjs --google` with `PW_DIST` / `PW_OUTPUT` / `PW_PORT=4186`; only `ru/` and the git-ignored `raw-ru/` copied back). Frames 01–06 and 08 were build-7 renders from before ART-13 (`a5c9b8c`, 2026-10-08), so their digits and Latin letters (HUD numbers, tower counts, the RU chip, the timer) fell back to Fredoka next to Nunito Cyrillic; now every in-game line is one Nunito family (the TOWER CLASH wordmark stays Fredoka, as in every language). Same levels, seeds, captions and layout; frame 01's achievement counter now reads 0/14 (14 achievements since FE-5; the old frame said 0/11); 1080×1920, 364–534 KB each. EN / AZ / TR, both Apple sets, the feature graphic and the IAP review frame are byte-identical. The decision, old frame → new frame:

| Old frame (build-7 set before PUB-6) | New frame (PUB-6) | Why |
|---|---|---|
| 04 Level 4 "Build Up": home filling to 25 → L2 ("Fill up to level up") | 04 Level 24 "The Gauntlet" (`04-level-24-gauntlet`): red and green enemy ribbons colliding, four of five mines live with their charge chips, two boulders, the artillery post and the fortress, three blue streams, sand island — "Mines, rocks, two rivals" | The upgrade frame was the emptiest picture of the set (one tower on a bare island) and frame 02's lesson banner already carries "fill up". Level 24 is the first mid-campaign frame and shows the mines and the two rivals the description promises; it reads at phone size (mine chips 4 / 4 / 8 / 8 legible in the 1080-wide raw) |
| 05 Level 5 limit hint "L2 needed for 2 streams" ("Bigger towers, more streams") | 05 ← former 06, level 9 fortress (same frame, one slot up) | The limit hint is a restriction, not a selling point, and the most text-heavy frame; frame 03 already shows level 5's wall and both stream colours |
| 06 Level 9 fortress | 06 Level 45 "Three Fronts" (`06-level-45-three-fronts`): three enemies (red / yellow / green), the two angled wall segments with the gap in front of the fortress, the live mine between the guns and the yellow keep, artillery firing, twilight highlands — "Three enemies, one crown" | The band-5 frame: the sixth biome ("SIX ISLANDS" in §1.1 / §1.2), three enemies at once and the Rules-v3 wall gap in one picture |
| 07 Result, 3 stars | 07 unchanged | Sells the star / gold loop; captured before the seeded reload so it still shows the fresh-save achievement toast |
| 08 Shop, Upgrades tab ("Boost your commander") | 08 Challenge card, WEEKLY tab on the level map (`08-weekly-challenge`): "River Gate · Thin walls", "+100 gold · +20 crystals at 3★", "New in Nh (Mon 00:00 UTC)", "Week streak 2", 32 starred nodes behind — "A new challenge every week" | The Producer's suggestion: the shop was the weakest sell of the eight and the weekly is the retention feature the description promises. The shop frame stays in the App Store sets as frame 10 |
| — | Apple 09 level 15 citadel (unchanged), Apple 10 shop Upgrades (was Google 08) | App Store allows 10; both sets now use 10 of 10 |

Not captured as asked: no level in 17–40 has two enemies **and** mines **and** a wall (walls in that band are only on 27, which has no mines, and on 33 / 37 / 39, which have three enemies), so the "wall gap" of item (a) is on the band-5 frame 06 (level 45) and on the App-Store-only frame 09 (level 15); frame 04 carries the two enemies and the mines. The weekly frame pins the week key to Monday 2026-09-28 (`WEEK_KEY` in the script, `__towerclash.setWeekKey`) so the card's level and twist are reproducible; its countdown pill reads the real clock at render time.

| # | Frame (raw file name) | EN caption | AZ caption | RU caption | TR caption | Status |
|---|---|---|---|---|---|---|
| 01 | Title screen with the language chip (`01-title`) | Capture every tower | Bütün qüllələri tut | Захвати все башни | Tüm kuleleri ele geçir | done |
| 02 | Level 1 "First Taps" on a fresh save, tutorial hint "Tap your tower" and the lesson banner (`02-level-01-tutorial`) | Tap, and the stream flows | Toxun — axın davam edir | Нажми — поток пошёл | Dokun, akış başlasın | done |
| 03 | Level 5 "Around the Wall": a blue player stream and a red enemy stream on straight lanes either side of the wall (`03-level-05-streams`) | Streams keep flowing | Axınlar dayanmır | Потоки не иссякают | Akışlar durmaz | done |
| 04 | Level 24 "The Gauntlet" (band-3 finale, sand island): two enemy colours streaming at each other, four live mines with charge chips, boulders, artillery, fortress, three player streams, ≥ 12 s in (`04-level-24-gauntlet`) | Mines, rocks, two rivals | Minalar, qayalar, iki rəqib | Мины, валуны, два соперника | Mayınlar, kayalar, iki rakip | done (PUB-6, 2026-09-27) |
| 05 | Level 9 "Stone Walls" (first fortress), player stream into the fortress (`05-level-09-fortress`) | Storm the fortress | Qalanı ələ keçir | Штурмуй крепость | Kaleyi fethet | done |
| 06 | Level 45 "Three Fronts" (band 5, twilight highlands): three enemies, the wall gap in front of the fortress, a live mine, artillery firing, ≥ 12 s in (`06-level-45-three-fronts`) | Three enemies, one crown | Üç düşmən, bir tac | Три врага, одна корона | Üç düşman, tek taç | done (PUB-6, 2026-09-27) |
| 07 | Result screen, 3 stars — a level 9 "Stone Walls" win (levels 1–8 cannot be 3-starred by the reference line since the build-6 re-lay; level 8 was used until 2026-09-25) (`07-result-win`) | Three-star every level | Hər səviyyədə üç ulduz | Везде по три звезды | Her bölümde üç yıldız | done; re-cut 2026-10-09 on `d208419`+ (PUB-17): SHARE button (PAYLAŞ / ПОДЕЛИТЬСЯ in AZ / TR / RU) |
| 08 | Challenge card on the level map, **WEEKLY** tab (seeded save: levels 1–32 cleared, week streak 2; week pinned to 2026-09-28 → "River Gate · Thin walls") (`08-weekly-challenge`) | A new challenge every week | Hər həftə yeni çağırış | Новый вызов каждую неделю | Her hafta yeni bir meydan okuma | done (PUB-6, 2026-09-27) |
| 09 | Level 15 (artillery citadel) — **App Store sets only** (`09-level-15-citadel`) | Silence the guns | Topları susdur | Заглуши пушки (Apple sets are EN only) | Topları sustur (Apple sets are EN only) | done (Apple 6.7" / 6.5" only; not in the Google set, which stays at 8) |
| 10 | Shop, **Upgrades** tab (five Commander tracks, gold prices, seeded save) — **App Store sets only** since PUB-6 (`10-shop-upgrades`) | Boost your commander | Komandirini gücləndir | Прокачай командира | Komutanını güçlendir | done (Apple 6.7" / 6.5" only; was Google 08 until 2026-09-27) |
| retired | Level 4 "Build Up" upgrade frame ("Fill up to level up") and level 5 limit-hint frame ("Bigger towers, more streams") — in no set since PUB-6; the `upgrade` / `limitHint` routines were removed from the script with them | | | | | retired 2026-09-27 |

The README embeds `store/screenshots/en/02,04,06,07.png` (tutorial, level 24, level 45, result — 07 re-cut 2026-10-09 on `d208419`+ (PUB-17): SHARE button) with matching alt texts; `LAUNCH_CHECKLIST.md` G10 / A11 list the same files. Localised AZ/RU/TR in-game sets are rendered by the same script (PUB-7 done 2026-09-17: `store/screenshots/{az,ru,tr}/01..08.png`, in-game UI in that language).

Frame 10 (App Store only) deliberately shows the Upgrades tab and not the Crystals tab: the crystal packs display the catalogue's fallback USD prices (the store SDK localises them only on a device) and, in the web build, a "Test store" line. Screenshots never show a price in a fixed currency (a hard-coded "$0.99" in a screenshot is a consumer-law problem in the EU), so the Crystals tab is used only for the private App Store Connect review screenshot (§6.1). PUB-6 (frames from levels 17+ / 41+ and the WEEKLY tab) is done as of 2026-09-27, see the decision table above.

### 1.4 Alternative wording for an ad-free / purchase-free build

If the Producer decides to submit a build **without** the economy (the v0.2.0 state), replace the "GOLD, CRYSTALS AND UPGRADES" block with the v0.2.0 "BOOSTERS" block, the "Plays offline" line with "Works fully offline.", and the "HONEST BY DESIGN" block with:

```
HONEST BY DESIGN
• No ads.
• No in-app purchases.
• No account, no sign-in, no tracking — your progress is stored only on your device.
```
(AZ: "Reklam yoxdur. / Tətbiqdaxili alış yoxdur. / Hesab, giriş və izləmə yoxdur — irəliləyişin yalnız öz cihazında saxlanılır.") and answer the declarations in §6 as "no ads / no purchases / no data collected" (the v1.0 answers in the git history of this file). The privacy policy v2.1 Part A already covers that case.

---

## 2. Apple App Store

| Field | Limit | EN | AZ (Azerbaijani is not an App Store localisation; use it in the description only if a supported locale such as Turkish is not preferred) |
|---|---|---|---|
| Name | 30 | `Tower Clash: Tap & Conquer` (26) — the accepted name: the app record was created with it on 2026-10-09 because `Tower Clash` (11) was taken (App Store names are unique; `APP_STORE_CONNECT_SHEET.md` §1). The home-screen label stays `Tower Clash`; the Google Play title (§1) stays `Tower Clash` | `Tower Clash: Tap & Conquer` (26; the same name — Azerbaijani is not an App Store locale) |
| Subtitle | 30 | `Capture every tower` (19) | `Bütün qüllələri tut` (19) |
| Promotional text | 170 | Variant A: `Tap, send, conquer. 50 levels of one-thumb real-time strategy: fortresses, artillery, tanks, walls, mines. Plays offline, no account. Ads removable.` (148) · **Variant B (1.0.0 default):** `Tap, send, conquer. 50 levels of one-thumb real-time strategy: fortresses, artillery, tanks, walls, mines. Plays offline, no account.` (133) | `Toxun, göndər, fəth et. Qalalar, toplar, tanklar, divarlar, minalarla 50 səviyyəlik bir barmaq real vaxt strategiya. Oflayn, hesabsız. Reklamlar silinə bilər.` (158) · B: the same without "Reklamlar silinə bilər." (134) |
| Keywords | 100 | `war,strategy,rts,capture,castle,army,offline,casual,defense,attack,soldiers,siege,kingdom,battle` (96; App Store keywords re-cut 2026-10-09 for the accepted name, see APP_STORE_CONNECT_SHEET §6.2) | `qüllə,strategiya,qala,ordu,oflayn,müharibə,fəth,döyüş,əsgər,tower,war,rts,casual` (80) |
| Primary category | — | Games | — |
| Subcategories | — | Strategy, Casual | — |
| Support URL | — | `https://pervincinal.github.io/InsiderTest/support.html` (`tower-clash/public/support.html`: contact, restore purchases, delete data; the `[developer e-mail]` placeholder must be filled before submission) | — |
| Marketing URL | — | `https://pervincinal.github.io/InsiderTest/` (not live yet — GitHub Pages was never enabled, BUG-26; `LAUNCH_CHECKLIST.md` §0b step 0) | — |
| Privacy policy URL | — | `https://pervincinal.github.io/InsiderTest/privacy.html` (policy v2.1, `tower-clash/public/privacy.html`; not live yet, BUG-26 — the `[developer e-mail]` placeholder on the page must be replaced before review, G18 / T3) | — |
| Copyright | — | `© 2026 [developer name]` (stakeholder fills the name) | — |
| In-App Purchases (automatic) | — | App Store shows an "In-App Purchases" line with the products from §6.1 once they are attached to the version; nothing to type in the description. **1.0.0 default: no products attached (variant B)** | — |

Description (≤ 4000): variant A reuses §1.1 (EN) and §1.2 (AZ) verbatim — they are under the limit and contain no Google-specific wording. **Variant B (1.0.0 default, no in-app purchases)** applies the four substitutions of §2.1 (EN 3863 / AZ 3825 since 2026-10-03; the full EN block is pasted in `APP_STORE_CONNECT_SHEET.md` §6.3).

### 2.1 Variant B — the same texts without purchase claims (for a build made without `RC_IOS_KEY`)

What the native build shows without a RevenueCat key (`src/economy/store.ts` → `isAvailable()` false; PUB-14, Producer decision 2026-10-03, implemented by the Frontend in `src/ui/shop.ts` / `src/render/menusShop.ts`): the shop's **Crystals and Bundles tabs are not shown at all** — the shop has the Skins tab (paid with crystals) and the Upgrades tab (paid with gold) only, so no price, product, buy button or Restore Purchases button is reachable. The crystals → gold converter and the booster crate live on the two hidden tabs, so they are out of reach in this build too; Reinforcements and Level skip (crystals) and the in-battle boosters (gold) are unchanged. So a variant-B listing may not promise purchases, "Remove Ads" or the booster crate, and must keep the ads sentences. (Until 2026-10-02 the two tabs were shown greyed out with "Store unavailable on this platform"; QA-12 / PUB-14 judged that an App Review 2.1 risk.) Substitutions in §1.1 / §1.2 (everything else verbatim):

| # | §1.1 EN (variant A) → variant B | §1.2 AZ (variant A) → variant B |
|---|---|---|
| 1 | `• Crystals come from milestones, achievements, the daily chest and optional purchases; they buy tower, helmet and island skins, a booster crate, or a second chance after a defeat.` → `• Crystals come from milestones, achievements and the daily chest; they buy tower, helmet and island skins or a second chance after a defeat.` (2026-10-03: "a booster crate" dropped — it sits on the hidden Bundles tab) | `• Kristallar mərhələlərdən, nailiyyətlərdən, gündəlik sandıqdan və könüllü alışlardan gəlir; qüllə, dəbilqə və ada görünüşləri, gücləndirici sandığı və ya məğlubiyyətdən sonra ikinci şans alır.` → `• Kristallar mərhələlərdən, nailiyyətlərdən və gündəlik sandıqdan gəlir; qüllə, dəbilqə və ada görünüşləri və ya məğlubiyyətdən sonra ikinci şans alır.` |
| 2 | `• Plays offline: the campaign needs no connection (ads and purchases do).` → `• Plays offline: the campaign needs no connection (ads do).` | `• Oflayn oynanır: kampaniya üçün internet lazım deyil (reklam və alışlar üçün lazımdır).` → `• Oflayn oynanır: kampaniya üçün internet lazım deyil (reklam üçün lazımdır).` |
| 3 | `• Optional purchases only: crystal packs, a Starter Pack, Remove Ads and a Premium Bundle. No subscriptions, no loot boxes.` → `• Nothing to buy in this version: gold and crystals are earned by playing. No subscriptions, no loot boxes.` | `• Yalnız könüllü alışlar: kristal paketləri, Başlanğıc paketi, Reklamları sil və Premium paket. Abunəlik yoxdur, loot box yoxdur.` → `• Bu versiyada alınası heç nə yoxdur: qızıl və kristal oyunla qazanılır. Abunəlik yoxdur, loot box yoxdur.` |
| 4 | `… Rewarded videos are always your choice. One purchase removes the between-level ads for good.` → `… Rewarded videos are always your choice.` | `… Mükafatlı videolar həmişə sənin seçimindir. Bir alış səviyyələr arası reklamları həmişəlik silir.` → `… Mükafatlı videolar həmişə sənin seçimindir.` |

Counts after the substitutions (re-run 2026-10-03, code points): EN **3863**, AZ **3825** (2026-09-28, with the booster crate: 3881 / 3847); promotional text B EN 133 / AZ 134. Keywords, subtitle, name and the screenshot set are unchanged (frame 10 shows the Upgrades tab with gold prices, no IAP). Ads stay in the texts because the build serves ads either way — with the real AdMob iOS ids from MZ7 in the review build (without them it would show Google "Test Ad" placeholders, acceptable on TestFlight only). Google Play: the same substitutions apply if the first Play release is also made without `RC_ANDROID_KEY`; §1.4 remains the wording for a build without ads *and* purchases.

What's New (≤ 4000): use the EN block of the relevant version from `RELEASE_NOTES.md`.

App Store screenshots (exact device sizes, rendered by `node store/tools/renderStoreShots.mjs --apple`):

| Device size | Requirement | File |
|---|---|---|
| iPhone 6.7" | 1290×2796 | `tower-clash/store/screenshots/apple-6.7/en/01..10.png` (Rules v3 render, `0e0ee66`, 2026-09-21; re-rendered on build 6, `e3117c7`, 2026-09-25; PUB-6 re-cut re-rendered on build 7, 2026-09-27, ten frames; frame 07 re-cut 2026-10-09 on `d208419`+ (PUB-17): SHARE button — `LAUNCH_CHECKLIST.md` A11) |
| iPhone 6.5" | 1284×2778 | `tower-clash/store/screenshots/apple-6.5/en/01..10.png` (Rules v3 render, `0e0ee66`, 2026-09-21; re-rendered on build 6, `e3117c7`, 2026-09-25; PUB-6 re-cut re-rendered on build 7, 2026-09-27, ten frames; frame 07 re-cut 2026-10-09 on `d208419`+ (PUB-17): SHARE button — `LAUNCH_CHECKLIST.md` A11) |

Same frames and captions as the Google set (English only — Azerbaijani is not an App Store locale), plus the App-Store-only frames 09 (level 15 artillery citadel, "Silence the guns") and 10 (shop, Upgrades tab, "Boost your commander" — the Google set's former 08), rendered at the exact device sizes by `--apple`; the set was re-rendered for Rules v3 on 2026-09-21 (walls, fords, straight ribbons), on build 6 and with the PUB-6 re-cut on 2026-09-27, and is ready to upload (10 of the 10 allowed). iPad screenshots are not needed: the Xcode target is iPhone-only (`TARGETED_DEVICE_FAMILY = 1` since 2026-09-28), so App Store Connect asks for iPhone screenshots only.

Review notes for App Review (paste into "Notes"; both variants are in `APP_STORE_CONNECT_SHEET.md` §6.4 as fenced blocks, counted 2026-09-28, re-counted 2026-10-08 after PUB-16 added the share-sheet sentence to both and the rating sentence to B):

**Variant A — with in-app purchases (1025 chars; only when the nine products of §6.1 are attached to the version):** *Single-player offline game, no account or sign-in needed, so no demo account is required — all content is reachable without paying. In-app purchases are one-time products (consumable crystal packs and non-consumable Starter Pack / Remove Ads / Premium Bundle / Premium Upgrade) handled by StoreKit through the RevenueCat SDK; "Restore Purchases" is at the bottom of the shop's Crystals and Bundles tabs (title screen → SHOP). The SHARE button on the result card (PAYLAŞ in Azerbaijani) opens the system share sheet with an image created on the device; nothing is uploaded. Ads are Google AdMob: an interstitial after some result screens (never during play, never in the first five levels) and rewarded videos only on the player's request. The app never requests App Tracking Transparency (there is no NSUserTrackingUsageDescription in Info.plist) and always requests non-personalised ads on iOS, so the IDFA is not used — App Privacy "Tracking" is answered No. The game runs offline; only ads and purchases need a connection.*

**Variant B — without in-app purchases (1202 chars; rewritten 2026-10-03 for PUB-14, two sentences added 2026-10-08 for PUB-16; the 1.0.0 default, `LAUNCH_CHECKLIST.md` A18):** *Single-player offline game, no account or sign-in needed, so no demo account is required — all content is reachable without paying. This version contains NO in-app purchases: no products are attached to it and the purchase SDK is never configured. The shop (title screen → SHOP) shows cosmetic skins and gold upgrades only; no purchase UI is reachable — no prices, no product list, no buy or Restore Purchases button. Skins are paid with crystals and Commander upgrades with gold, both earned by playing. The SHARE button on the result card (PAYLAŞ in Azerbaijani) opens the system share sheet with an image created on the device; nothing is uploaded. The app never requests a rating in this version: the StoreKit review API is present in the binary but disabled. Ads are Google AdMob: an interstitial after some result screens (never during play, never in the first five levels) and rewarded videos only on the player's request. The app never requests App Tracking Transparency (there is no NSUserTrackingUsageDescription in Info.plist) and always requests non-personalised ads on iOS, so the IDFA is not used — App Privacy "Tracking" is answered No. The game runs offline; only ads need a connection.*

Sandbox tester: none required in either variant — all content is available without purchase; "Sign-in required" is No.

---

## 3. ASO keyword list

Primary (in title / subtitle / first lines): tower clash, capture every tower, real-time strategy.

Secondary (descriptions, keyword field): tower war, tower conquest, castle capture, army strategy, rts, one-thumb strategy, offline strategy game, casual strategy, tap to attack, fortress, artillery, tanks, walls, mines, three stars, short levels, 50 levels, daily challenge, weekly challenge, commander upgrades, skins.

Azerbaijani: qüllə oyunu, strategiya oyunu, qala tutmaq, ordu, real vaxt strategiya, oflayn oyun, bir barmaqla oyun, tank, divar.

Removed from the list since v0.2.0: "no ads strategy", "reklamsız oyun" — no longer true for the store builds.

Do not use competitor names ("Tower War", "State.io", etc.) in the keyword field or title — both stores reject trademarked names of other apps; "Tower War–style" stays in internal docs only.

---

## 4. Content rating notes (IARC for Google Play, age-rating questionnaire for App Store)

Facts to answer with:

| Question | Answer | Why |
|---|---|---|
| Violence | Mild / cartoon, infrequent | Tiny stylised clay soldiers and tanks move in straight lines between towers and disappear with a puff of particles when they meet an opposing unit or a mine. No blood, no injury depiction, no realistic weapons, no human suffering. |
| Fear / horror | None | — |
| Sexual content, nudity | None | — |
| Language | None | UI text only (PLAY, STREAMS, MENU, VICTORY), in English, Azerbaijani, Russian or Turkish. |
| Controlled substances, gambling | None | No simulated gambling. |
| User interaction | None | No chat, no user-generated content, no multiplayer, no in-game sharing between players. The result card's SHARE button (PAYLAŞ) only hands an image made on the device to the phone's own share sheet — the player picks the app it goes to; the game uploads nothing and shows nothing from other users (IARC "Users Interact" stays No). |
| Shares location | No | The app requests no location permission (Google may derive a coarse location from the IP address for ad delivery; IARC's "shares location" question is about the app sharing the user's location with other users / third parties as a feature — answer No). |
| Purchases of digital goods | **Yes** | Crystal packs, Starter Pack, Remove Ads, Premium Bundle / Upgrade via Play Billing / StoreKit. |
| … includes random items (loot boxes)? | **No** | Every product grants a fixed, listed content; no paid randomness (`docs/ECONOMY.md` §1.4). |
| Contains ads | **Yes** (Play Ads declaration, separate from IARC) | AdMob interstitial + rewarded, see §6.2. |
| Personal information | Not collected by the app | Advertising id / purchase receipts go to Google / RevenueCat, declared in §6.3 / §6.4; no name, e-mail or account. |

Expected results: Google Play / IARC **Everyone (ESRB E), PEGI 3, USK 0** with the interactive elements **"In-Game Purchases"** (and no "Users Interact" / "Shares Location") — ads and purchases do not change the age rating, only the interactive-element labels. App Store **9+** with "Infrequent/Mild Cartoon or Fantasy Violence"; in Apple's 2025 age-rating questionnaire answer **"Unrestricted Web Access": No** (the app has no browser; ad click-throughs open in the ad SDK's own overlay / App Store, not a general web view), **"Gambling and Contests": No / None** (no contests, sweepstakes or simulated gambling), **"Loot boxes": No**, "Advertising"/"In-app purchases" are informational and do not raise the rating. Keep 9+.

---

## 5. Verifying the limits

```bash
node -e '
const c = (s) => [...s].length;
console.log("gp short EN", c("Capture every tower. One-thumb real-time strategy, 50 levels, plays offline."));
console.log("gp short AZ", c("Bütün qüllələri tut. Bir barmaqla real vaxt strategiya, 50 səviyyə, oflayn."));
console.log("promo EN", c("Tap, send, conquer. 50 levels of one-thumb real-time strategy: fortresses, artillery, tanks, walls, mines. Plays offline, no account. Ads removable."));
console.log("promo AZ", c("Toxun, göndər, fəth et. Qalalar, toplar, tanklar, divarlar, minalarla 50 səviyyəlik bir barmaq real vaxt strategiya. Oflayn, hesabsız. Reklamlar silinə bilər."));
console.log("subtitle AZ", c("Bütün qüllələri tut"));
console.log("keywords EN", c("tower,war,strategy,rts,capture,conquer,castle,army,offline,tap,casual,defense,attack,soldiers"));
'
```
Results on 2026-09-21 (after 40 → 50; the digit swap keeps every length): 76 / 75 / 150 / 158 / 19 / 93. IAP names and descriptions in §6.1 were counted the same way (≤ 30 / ≤ 45). Full descriptions §1.1 / §1.2 on 2026-09-21, after the Grand Campaign and Weekly Challenge bullets: **3981 / 3947** (limit 4000; 2026-09-20 they were 3665 / 3650); on 2026-09-27, after "SIX ISLANDS": **3984 / 3955** (code points, `node -e "[...s].length"`).

---

## 6. Monetization disclosures (in-app purchases, ads, data)

Source of truth for prices and grants: `tower-clash/src/economy/catalog.ts` (`IAP_PRODUCTS`, `AD_PLACEMENTS`, `INTERSTITIAL_RULES`); rationale in `docs/ECONOMY.md` §4–5; console setup steps in `docs/MOBILE.md` §8.2. Product ids are typed **identically** in App Store Connect, Google Play Console and RevenueCat.

### 6.1 In-app purchase list (both stores)

USD is the base price; Apple converts by price tier, Google by exchange rate (review IN/BR/TR prices by hand, `docs/ECONOMY.md` §4). Apple: *Reference Name* is internal (≤ 64 chars, use the product id); *Display Name* ≤ 30; *Description* ≤ 45 — both counted below. Google: *Product ID* = catalog id, *Name* ≤ 55, *Description* ≤ 200 — reuse the Apple strings.

| Product id (Apple + Google) | Type (Apple / Google) | USD | Apple tier | Display name (≤ 30) | Description (≤ 45) | Grants (from `catalog.ts`) |
|---|---|---|---|---|---|---|
| `crystals_100` | Consumable / one-time (consumed by RevenueCat) | 0.99 | 1 | `Handful of crystals` (19) | `100 crystals` (12) | 100 crystals |
| `crystals_550` | Consumable | 4.99 | 5 | `Pouch of crystals` (17) | `550 crystals (10% bonus)` (24) | 550 crystals |
| `crystals_1200` | Consumable | 9.99 | 10 | `Chest of crystals` (17) | `1,200 crystals (20% bonus)` (26) | 1 200 crystals |
| `crystals_2600` | Consumable | 19.99 | 20 | `Crate of crystals` (17) | `2,600 crystals (30% bonus)` (26) | 2 600 crystals |
| `crystals_7000` | Consumable | 49.99 | 50 | `Vault of crystals` (17) | `7,000 crystals (40% bonus)` (26) | 7 000 crystals |
| `starter_pack` | Non-Consumable | 2.99 | 3 | `Starter Pack` (12) | `400 crystals, 400 gold and the Bronze helmet` (44) | 400 crystals + 400 gold + `helmet_bronze`; offered once |
| `remove_ads` | Non-Consumable | 3.99 | 4 | `Remove Ads` (10) | `No more interstitial ads, plus 50 crystals` (42) | no interstitials + 50 crystals |
| `premium_bundle` | Non-Consumable | 9.99 | 10 | `Premium Bundle` (14) | `No interstitials, 600 crystals, 2 skins, -10%` (45; until 2026-10-02 "No ads, …", ECON-12 — rewarded videos stay) | no interstitials + 600 crystals + `roof_gold` + `helmet_royal` + −10 % booster gold cost |
| `premium_upgrade` | Non-Consumable | 4.99 | 5 | `Premium Upgrade` (15) | `550 crystals, 2 skins, -10% booster cost` (40) | 550 crystals + the two Premium skins + −10 %; shown only to owners of `remove_ads` |
| `weekend_pack` | Consumable — **Phase C only**, do not create until LiveOps ships | 1.99 | 2 | `Weekend Pack` (12) | `250 crystals and 250 gold, once per weekend` (43) | 250 crystals + 250 gold |

Rules that follow from the list (Apple 3.1.1 / 3.1.2, Play Payments policy, EU consumer law): every product goes through StoreKit / Play Billing (RevenueCat wraps both; no external checkout links); a **Restore Purchases** button is mandatory in the shop for the non-consumables; the shop shows the **store-localised price string**, never a hard-coded "$"; the Starter Pack "×2 value" badge must be computed from the `crystals_100` rate; no subscriptions, so no subscription terms text is needed. **Restore Purchases** brings back what each non-consumable unlocks (no interstitials, skins, −10 %) and grants its crystals and gold once per purchase: tapping Restore again, a purchase retry or a progress reset adds nothing more, while a restore on a fresh install (reinstall, second device — the on-device progress that held them is gone) grants them once (ECON-12, 2026-10-03; `grantProduct` in `src/economy/wallet.ts`).

Azerbaijani product text (Google Play in-app product translation, optional; the App Store has no Azerbaijani locale): `premium_bundle` → `Ara reklamı yox, 600 kristal, 2 görünüş, -10%` (45). The game's own line is "Səviyyələr arasında reklam yoxdur" (`shop.line.noAds`, `src/ui/locales/az.ts`), which does not fit 45 characters; "aralıq reklam" does not fit either (46–47 in every natural form), "ara reklamı" is the short form of the same meaning. The listing keeps no RU / TR product texts. Display names are the catalog `title` strings so the shop UI and the store sheets say the same thing (RevenueCat returns the store title).

Apple additionally needs, per product: a **review screenshot** (any shop screenshot ≥ 640×920 showing the product — one image can be reused for all): `tower-clash/store/iap-review/shop-crystals.png` (1290×2796, the shop's Crystals tab with the five crystal packs and the Restore Purchases button; rendered from the web build, so it shows the catalogue's USD fallback prices and the "Test store" line — acceptable for review, which only checks that the product is visible in-app, but re-render from a native build with RevenueCat keys if store-localised prices are wanted). The first products must be submitted **with the app version** (they appear in the version's "In-App Purchases and Subscriptions" section). Google needs the AAB uploaded to a testing track before products can be created.

### 6.2 Google Play — Ads declaration and ad policy facts

| Play Console question | Answer | Notes |
|---|---|---|
| Does your app contain ads? | **Yes** | Google AdMob (Google Mobile Ads SDK via `@capacitor-community/admob`) |
| Ad formats (for the reviewer / policy record) | **Interstitial** (full-screen, between levels) and **Rewarded video** (user-initiated) | No banners, no app-open ads, no native ads, no notification ads |
| Ads SDK is Families self-certified? | Not applicable | Target audience 13+ (§6.5); if the listing ever targets children this becomes mandatory |
| Advertising ID declaration (App content → Advertising ID) | **Yes, the app uses advertising ID** — purposes: *Advertising or marketing*, *Analytics* (ad measurement), *Fraud prevention, security and compliance* | AdMob declares the `com.google.android.gms.permission.AD_ID` permission (Android 13+) |
| Better Ads / interstitial policy | compliant by design | Interstitials only after the result screen (a natural break), never at app start, never during play, never in the first 5 levels, ≥ 120 s apart, ≤ 4 per session, always dismissible (`INTERSTITIAL_RULES`) |
| Rewarded ads | compliant | Buttons name the reward ("Watch → +20 gold"), hidden when no ad is loaded, never shown disabled |

### 6.3 Google Play — Data safety form answers

Answer "Yes" to *Does your app collect or share any of the required user data types?* Encryption in transit: **Yes** (HTTPS for AdMob and RevenueCat). Deletion mechanism: **No in-app account deletion** — data is tied to an anonymous id; deletion is by uninstalling plus the e-mail request described in the privacy policy B.7 (answer "Yes, users can request deletion" only if the stakeholder commits to honouring the e-mail requests; otherwise "No"). Independent security review: No.

| Data type | Collected | Shared | Ephemeral | Required / optional | Purpose | Who / why |
|---|---|---|---|---|---|---|
| Device or other IDs (advertising ID; RevenueCat anonymous app user id) | Yes | Yes | No | Required (ads); the anonymous id is required for purchases to restore | Advertising or marketing; Analytics; Fraud prevention, security and compliance; App functionality (RevenueCat) | Google AdMob, RevenueCat |
| Purchase history (in-app purchases: product ids, transaction ids, dates) | Yes | Yes | No | Optional (only if the user buys) | App functionality (entitlements, restore), Fraud prevention | RevenueCat (receipt validation), Google Play Billing itself is exempt but RevenueCat is a third party |
| Location → Approximate location (derived from IP by Google's ad SDK) | Yes | Yes | Yes | Required (ads) | Advertising or marketing | Google AdMob — declare it: Google's own SDK data-disclosure guidance lists coarse location from IP (**verify against Google's current "Google Mobile Ads SDK data disclosure" page before submitting; the sandbox could not fetch it**) |
| App info and performance → Crash logs, Diagnostics | Yes | Yes | No | Required | Analytics | AdMob SDK reports its own diagnostics to Google (per Google's SDK disclosure page — verify as above) |
| App activity → App interactions (ad impressions/clicks) | Yes | Yes | No | Required | Advertising or marketing; Analytics | Google AdMob (ad interaction only; the game sends no gameplay analytics) |
| Personal info, financial info (card), precise location, contacts, photos, messages, health, files, audio, calendar | **No** | — | — | — | — | Payment cards are handled by Google Play, never seen by the app |

**Share card and In-App Review (PUB-16, 2026-10-08): no new data type, no new row.** The share image is drawn on the device and handed to Android's share sheet through the app's own `FileProvider` (the cache file `tower-clash-share.png`); the game transmits nothing, and data the user sends with another app of their choice is not collected by this app (Play's definition of "collected" is data transmitted off the device by the app). The Play In-App Review API is in the binary but disabled in 1.0.0 (`RATING_PROMPT` unset); even when enabled, Google shows its own review card and returns no rating or review content to the app — nothing to declare. Everything is answered "not linked to the user's identity" — there is no account. The SDK rows are what Google's and RevenueCat's SDK disclosure pages recommend as of my last knowledge; **the Mobile Engineer / stakeholder must re-check those two pages on submission day** (Google: "Play data disclosure requirements for the Google Mobile Ads SDK"; RevenueCat: "Google Play Data Safety" docs page).

### 6.4 Apple — App Privacy ("nutrition labels") and App Tracking Transparency

Decision taken: **option A** (checklist MZ9, Producer default, implemented by the Mobile Engineer on 2026-09-14 — `docs/MOBILE.md` §8.7). What the tree does: `runConsentFlow` in `tower-clash/src/economy/providers/admob.ts` never calls `AdMob.requestTrackingAuthorization()`; every iOS ad request carries `npa: 1` (non-personalised ads), while on Android personalisation follows the UMP consent answer; `ios/App/App/Info.plist` has **no** `NSUserTrackingUsageDescription`, so iOS cannot even show the prompt; the unit test `tests/economy/ads.test.ts` ("no tracking") fails the build if the call comes back. Privacy policy v2.1 B.2 says the same in user language. Option B below is kept only as the documented alternative — it is **not** what the tree does.

**Option A — adopted: no tracking, no ATT prompt.** No `requestTrackingAuthorization` call (the UMP consent form stays for EEA/UK/Swiss users), no `NSUserTrackingUsageDescription` in `Info.plist`, non-personalised ads on every iOS request. Why: (1) ATT opt-in rates for casual games are typically 20–35 %, so personalised-ad revenue on iOS is small while the prompt costs first-session goodwill; (2) "Data Used to Track You" on the store page is the single most negative privacy label for a family-friendly casual game; (3) with no ATT the review question *"Does this app use the Advertising Identifier (IDFA)?"* is answered honestly with **Yes, to serve advertisements within the app** only (no attribution, no tracking), which Apple accepts without the prompt when the SDK respects the ATT status (Google's SDK does); (4) no SKAdNetwork-attribution campaigns are planned. Labels for option A:

| App Privacy section | Data type | Purposes | Linked to user | Used for tracking |
|---|---|---|---|---|
| Identifiers | Device ID (IDFV / SDK-generated ids; IDFA is all zeros without ATT) | Third-Party Advertising, App Functionality | No | **No** |
| Purchases | Purchase History | App Functionality | No | No |
| Usage Data | Advertising Data (ad impressions/interactions), Product Interaction (ad SDK only) | Third-Party Advertising, Analytics | No | No |
| Diagnostics | Crash Data, Performance Data (AdMob SDK) | App Functionality, Analytics | No | No |
| Location | Coarse Location (from IP, by Google) | Third-Party Advertising | No | No |

Summary shown on the store: **"Data Not Linked to You"** only; "Data Used to Track You" absent. App Store Connect → App Privacy → *Tracking*: "No, we do not use data for tracking purposes".

**Option B — rejected alternative, not in the tree: ATT prompt shown, IDFA used for personalised ads when granted.** Same rows, but *Identifiers → Device ID* and *Usage Data → Advertising Data* get **Used for tracking: Yes**, the store page shows "Data Used to Track You", and the *Tracking* question is answered "Yes". Switching to it is a package deal (`docs/MOBILE.md` §8.7): the ATT call back in `admob.ts`, `npa` off on iOS, `NSUserTrackingUsageDescription` with a purpose string back in `Info.plist`, the "no tracking" unit test removed, App Privacy *Tracking* = Yes and a privacy policy 2.x re-wording. Do not do it piecemeal.

Either way: *Contact Info, User Content, Health, Financial Info, Browsing History, Search History* → not collected. **Share card and StoreKit review API (PUB-16, 2026-10-08):** neither adds a data type — the share image is created on the device and leaves it only through the iOS share sheet to an app the player picks (the game uploads nothing; *Photos or Videos* and *Other User Content* stay not collected), and the StoreKit review API (`SKStoreReviewController` via `@capacitor-community/in-app-review`) is disabled in 1.0.0 and, when enabled, gives the app no rating data (`APP_STORE_CONNECT_SHEET.md` §4). Export compliance stays "uses only standard HTTPS" (`ITSAppUsesNonExemptEncryption = NO` remains correct). Option A is the recorded decision (`LAUNCH_CHECKLIST.md` row MZ9, done 2026-09-14); the App Store Connect answers for row A14 are the option A table above plus *Tracking* = No.

### 6.5 Age rating and audience impact

- **Google Play — Target audience and content:** *13 and over* (or 18+) — **not** "designed for children / Families". Reason: AdMob would then require a Families self-certified SDK configuration, `tagForChildDirectedTreatment`, no personalised ads and a Teacher Approved review; the game does not implement that. AdMob app settings: *Not child-directed*; **Max ad content rating: G**.
- **Google Play — IARC:** interactive elements **"In-Game Purchases"**; *"Does the game include purchases of random items (loot boxes)?"* → **No**. Expected rating unchanged (Everyone / PEGI 3).
- **Apple — Age rating:** stays **9+**. Questionnaire deltas caused by monetization: *Unrestricted Web Access* **No**; *Gambling and Contests* **No**; *Loot boxes* **No**; ads and IAP are disclosed through the Ads/IAP metadata, not the rating. Apple's *"Made for Kids"* is not pursued either way (kids-category apps may not include third-party ad SDKs in their standard configuration), even though option 6.4-A means the app tracks nobody.
- **Both stores:** the privacy policy (v2.1, Part B) must be live at the URL before submission; both consoles reject a listing whose policy URL contradicts the Data safety / App Privacy answers.
