# Tower Clash — store listing (native v1.0 with in-app purchases and ads)

Owner: Publisher. This is the listing for the **first store submission**, which per `docs/ECONOMY.md` §8 is the native build with RevenueCat purchases and AdMob ads (Phase B, "v1.0 native"). The web/PWA build keeps no ads and no purchases and has no store listing. Character counts are verified with `node -e` (§5); limits are the stricter of Google Play and App Store.

**Status of the claims (2026-09-17, v0.4.0 "Streams update").** Everything described below is committed: the economy and shop (v0.3.0, `docs/BACKLOG.md` "Done" Sprint 3 + Day 2/2b), the in-game languages EN/AZ/RU/TR (`9e45fc9`) and **rules v2** (`docs/GDD.md` §2.0; commits `4bb3944`, `8e53c03`, `2d8cb24`): attacks are persistent **streams** (tap your tower, tap a target, the stream keeps flowing until you stop it; a L1/L2/L3 tower runs 1/2/3 streams), towers **upgrade automatically** when the garrison fills (25 → L2, 50 → L3, 100 max), the SEND 100 % / 50 % toggle and the paid tap-to-upgrade are gone, all 40 levels retuned, levels load on demand. Also in the build since the same day: **rules v2.1 "Under fire"** (`3e4a388`, GDD §2.0): a hostile soldier landing on a tower pauses that tower's recruiting for 1.5 s, so an unanswered enemy stream eventually takes any tower; the count badge turns peach with a crossed-swords pip while it lasts — described in the long description with one line (§1.1 / §1.2 "A tower under attack…") and one clause in the "What's new" texts, nothing more (no numbers in public texts; the level 2 lesson and the star clocks have not been re-measured for it yet). **Level names and lessons are in EN/AZ/RU/TR** (`235def1`, I18N-2). The screenshot files in `tower-clash/store/screenshots/` are the v0.4.0 retake (`577b894`, §1.3). If a build is submitted *without* the economy, use the ad-free wording kept in §1.4.

What must NOT be claimed: leaderboards, multiplayer, cloud save, more than 40 levels, subscriptions, loot boxes, tablet support (phone-only listing), "no ads" / "no purchases" for the store builds, and — since rules v2 — "send half / send all", a send-ratio switch or upgrading a tower by tapping / paying soldiers.

---

## 1. Google Play

| Field | Limit | EN | AZ |
|---|---|---|---|
| App name | 30 | `Tower Clash` (11) | `Tower Clash` (11) |
| Short description | 80 | `Capture every tower. One-thumb real-time strategy, 40 levels, plays offline.` (76) | `Bütün qüllələri tut. Bir barmaqla real vaxt strategiya, 40 səviyyə, oflayn.` (75) |
| Category | — | Games › Strategy | Oyunlar › Strategiya |
| Tags | — | Strategy, Casual, Single player, Offline, Stylised | — |
| Contact e-mail | — | `[developer e-mail]` | — |
| Privacy policy URL | — | `https://pervincinal.github.io/InsiderTest/privacy.html` (policy v2.1 with the ads/purchases section; the page is `tower-clash/public/privacy.html`, published by the Pages job — resolves once GitHub Pages is enabled, checklist W3) | — |
| Website (optional) | — | `https://pervincinal.github.io/InsiderTest/` — support page `https://pervincinal.github.io/InsiderTest/support.html` | — |
| Store labels (automatic) | — | **Contains ads** (from the Ads declaration) · **In-app purchases** (from the product list) — Google adds both badges; nothing to type | — |

### 1.1 Full description — English (≤ 4000)

```
Tower Clash is a one-thumb real-time strategy game: tap one of your towers, tap a target, and a stream of soldiers starts marching — and keeps marching until you stop it. Reinforce friendly towers, overwhelm hostile ones, and when a garrison hits zero the tower is yours. Capture every enemy tower to win.

HOW IT PLAYS
• Tap a blue tower, then tap any connected tower: a stream of soldiers starts flowing there — and keeps flowing until you tap the target again. Drag from tower to tower works too.
• Towers upgrade themselves: let one fill to 25 soldiers and it becomes level 2, at 50 level 3 (100 max). Bigger towers recruit faster and run more streams — one at level 1, two at level 2, three at level 3.
• A streaming tower sends every new recruit onward and stops growing — close the stream when you want it to level up.
• A tower under attack stops recruiting — answer every enemy stream, or the tower falls.
• Enemy streams are drawn on the road in their colour, so you always see where the next attack comes from — and where to answer it.

40 HAND-MADE LEVELS
• Levels 1–3 teach the basics with a short built-in tutorial; every later level opens with a one-line lesson.
• Fortresses (from level 9) shrug off half of every attack — bring more than you think.
• Artillery (from level 12) shoots down soldiers that walk into its range — approach from the right road.
• Two enemies at once from level 17, three from level 33 — and they fight each other too.
• Mines that take out the first soldiers to cross a road, and barriers that must be worn down or walked around.
• Tank factories (from level 25): a tank weighs five soldiers but crawls — send it first and let the infantry catch up.
• Bridges you can cut with a long press: the column on it drowns and the enemy behind it is stranded.
• Beat every level for three stars: the faster you win, the more stars you earn. Stars unlock the next level and pay gold.

GOLD, CRYSTALS AND UPGRADES
• Gold is earned by playing — stars, replays and daily rewards — and buys Overdrive (×3 production for 10 s), Freeze (enemies stop producing for 5 s), Airstrike (−10 soldiers on one enemy tower) and permanent Commander upgrades (production, capacity, starting garrison, march speed, cheaper boosters).
• Crystals come from milestones, achievements, the daily chest and optional purchases; they buy tower, helmet and island skins, a booster crate, or a second chance after a defeat.
• Every level is winnable without spending anything — upgrades are a shortcut, never a requirement.

FIVE ISLANDS
• Grass, autumn, sand, snow and volcanic islands, drawn in a soft clay style with sunlit shadows.

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
• Mavi qülləyə toxun, sonra yolla bağlı istənilən qülləyə toxun: ora əsgər axını başlayır — və sən hədəfə yenidən toxunana qədər davam edir. Qüllədən qülləyə sürükləmək də işləyir.
• Qüllələr özləri təkmilləşir: biri 25 əsgərə dolsun — 2-ci səviyyə olur, 50-də 3-cü səviyyə (maksimum 100). Böyük qüllə daha sürətli əsgər yığır və daha çox axın aparır — 1-ci səviyyədə bir, 2-cidə iki, 3-cüdə üç.
• Axın verən qüllə hər yeni əsgəri irəli göndərir və böyümür — səviyyəsi qalxsın istəyirsənsə axını bağla.
• Hücum altındakı qüllə əsgər yığmır — hər düşmən axınına cavab ver, yoxsa qüllə düşər.
• Düşmən axınları yolun üstündə öz rəngində çəkilir — növbəti hücumun haradan gəldiyini və hara cavab verəcəyini həmişə görürsən.

40 ƏL İLƏ HAZIRLANMIŞ SƏVİYYƏ
• 1–3-cü səviyyələr qısa daxili təlimatla əsasları öyrədir; sonrakı hər səviyyə bir cümləlik dərslə başlayır.
• Qalalar (9-cu səviyyədən) hər hücumun yarısını dəf edir — düşündüyündən çox əsgər apar.
• Top qüllələri (12-ci səviyyədən) mənzilinə girən əsgərləri vurur — düzgün yoldan yaxınlaş.
• 17-ci səviyyədən eyni anda iki, 33-cü səviyyədən üç rəqib — onlar bir-biri ilə də vuruşur.
• Yoldan ilk keçən əsgərləri məhv edən minalar və aşındırılmalı ya da yan keçilməli sədlər.
• Tank zavodları (25-ci səviyyədən): tank beş əsgər ağırlığındadır, amma yavaş gedir — əvvəl onu göndər, piyada arxadan çatsın.
• Uzun basışla kəsilə bilən körpülər: körpüdəki kolon batır, arxadakı düşmən ilişib qalır.
• Hər səviyyədə üç ulduz qazan: nə qədər tez qalib gəlsən, o qədər çox ulduz. Ulduzlar növbəti səviyyəni açır və qızıl qazandırır.

QIZIL, KRİSTAL VƏ TƏKMİLLƏŞDİRMƏLƏR
• Qızıl oyunla qazanılır — ulduzlar, təkrar oyunlar və gündəlik mükafatlar — və Overdrive (10 saniyə ×3 istehsal), Freeze (rəqiblər 5 saniyə istehsal etmir), Airstrike (bir düşmən qülləsindən −10 əsgər) və daimi Komandir təkmilləşdirmələri (istehsal, tutum, başlanğıc qarnizon, yürüş sürəti, ucuz gücləndiricilər) üçün xərclənir.
• Kristallar mərhələlərdən, nailiyyətlərdən, gündəlik sandıqdan və könüllü alışlardan gəlir; qüllə, dəbilqə və ada görünüşləri, gücləndirici sandığı və ya məğlubiyyətdən sonra ikinci şans alır.
• Hər səviyyə heç nə xərcləmədən keçilə bilər — təkmilləşdirmələr qısa yoldur, tələb deyil.

BEŞ ADA
• Çəmən, payız, qum, qar və vulkan adaları — günəşli kölgələrlə yumşaq gil üslubunda.

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
| Phone screenshots | 2–8, 9:16, 320–3840 px | `tower-clash/store/screenshots/en/01..08.png`, `az/`, `ru/`, `tr/` (one set per store language; caption *and* the game's own UI in that language, PUB-7), 1080×1920, each < 600 KB (v0.4.0 retake, `577b894`; AZ/RU/TR in-game sets rendered 2026-09-17) |
| IAP review screenshot (Apple only, not shown on any store page) | ≥ 640×920 | `tower-clash/store/iap-review/shop-crystals.png`, 1290×2796, uncaptioned shop Crystals tab (see §6.1) |

Screenshot order and captions (same frames in every set; the `SHOTS` table in `renderStoreShots.mjs` is the source of truth). **Status (2026-09-17, v0.4.0 retake by the Tech Artist, commit `577b894`; Publisher check of `store/screenshots/raw/*.png` and `en/`, `az/`):** all eight frames are rules-v2 renders — STREAMS pill in the HUD, no SEND toggle, the new tutorial hint on 02 — and the set is ready to upload. Google Play allows up to 8 phone screenshots, App Store up to 10 (frame 09 is App Store only).

| # | Frame (raw file name) | EN caption | AZ caption | RU caption | TR caption | Status |
|---|---|---|---|---|---|---|
| 01 | Title screen with the language chip (`01-title`) | Capture every tower | Bütün qüllələri tut | Захвати все башни | Tüm kuleleri ele geçir | done |
| 02 | Level 1 "First Taps" on a fresh save, tutorial hint "Tap your tower" and the lesson banner (`02-level-01-tutorial`) | Tap, and the stream flows | Vur — axın davam edir | Нажми — поток пошёл | Dokun, akış başlasın | done |
| 03 | Level 5 "Two Roads": a blue player stream and a red enemy stream on the roads at the same moment (`03-level-05-streams`) | Streams keep flowing | Axınlar dayanmır | Потоки не иссякают | Akışlar durmaz | done |
| 04 | Level 4 "Build-up": a player tower reaching 25 and turning into the L2 sprite (`04-level-04-upgrade`) | Fill up to level up | Doldur, səviyyə qalxsın | Наполни и прокачай | Doldur, seviye atla | done |
| 05 | Level 5: the limit hint "L2 needed for 2 streams" on an L1 tower that already runs one stream (`05-level-05-limit-hint`) | Bigger towers, more streams | Böyük qüllə, çox axın | Выше башня — больше потоков | Büyük kule, çok akış | done |
| 06 | Level 9 "Stone Walls" (first fortress), player stream into the fortress (`06-level-09-fortress`) | Storm the fortress | Qalanı ələ keçir | Штурмуй крепость | Kaleyi fethet | done |
| 07 | Result screen, 3 stars (`07-result-win`) | Three-star every level | Hər səviyyədə üç ulduz | Везде по три звезды | Her bölümde üç yıldız | done |
| 08 | Shop, **Upgrades** tab (five Commander tracks, gold prices, seeded mid-game save) (`08-shop-upgrades`) | Boost your commander | Komandirini gücləndir | Прокачай командира | Komutanını güçlendir | done |
| 09 | Level 15 (artillery citadel) — **App Store sets only** (`09-level-15-citadel`) | Silence the guns | Topları susdur | Заглуши пушки (Apple sets are EN only) | Topları sustur (Apple sets are EN only) | done (Apple 6.7" / 6.5" only; not in the Google set, which stays at 8) |

The README embeds `store/screenshots/en/02,04,06,07.png` (tutorial, upgrade, fortress, result) with matching alt texts; `LAUNCH_CHECKLIST.md` G10 / A11 list the same files. Localised AZ/RU/TR in-game sets are rendered by the same script (PUB-7 done 2026-09-17: `store/screenshots/{az,ru,tr}/01..08.png`, in-game UI in that language).

Frame 08 deliberately shows the Upgrades tab and not the Crystals tab: the crystal packs display the catalogue's fallback USD prices (the store SDK localises them only on a device) and, in the web build, a "Test store" line. Screenshots never show a price in a fixed currency (a hard-coded "$0.99" in a screenshot is a consumer-law problem in the EU), so the Crystals tab is used only for the private App Store Connect review screenshot (§6.1). Follow-up: (PUB-6) add frames from levels 17+ (two enemies, mines, a cut bridge, three enemies).

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
| Name | 30 | `Tower Clash` (11) | `Tower Clash` (11) |
| Subtitle | 30 | `Capture every tower` (19) | `Bütün qüllələri tut` (19) |
| Promotional text | 170 | `Tap, send, conquer. 40 levels of one-thumb real-time strategy: fortresses, artillery, tanks, mines, bridges. Plays offline, no account. Ads removable.` (150) | `Toxun, göndər, fəth et. Qalalar, toplar, tanklar, minalar, körpülərlə 40 səviyyəlik bir barmaq real vaxt strategiya. Oflayn, hesabsız. Reklamlar silinə bilər.` (158) |
| Keywords | 100 | `tower,war,strategy,rts,capture,conquer,castle,army,offline,tap,casual,defense,attack,soldiers` (93) | `qüllə,strategiya,qala,ordu,oflayn,müharibə,fəth,döyüş,əsgər,tower,war,rts,casual` (80) |
| Primary category | — | Games | — |
| Subcategories | — | Strategy, Casual | — |
| Support URL | — | `https://pervincinal.github.io/InsiderTest/support.html` (`tower-clash/public/support.html`: contact, restore purchases, delete data; the `[developer e-mail]` placeholder must be filled before submission) | — |
| Marketing URL | — | `https://pervincinal.github.io/InsiderTest/` (active once GitHub Pages is enabled in the repository settings) | — |
| Privacy policy URL | — | `https://pervincinal.github.io/InsiderTest/privacy.html` (policy v2.1, `tower-clash/public/privacy.html`; active once GitHub Pages is enabled) | — |
| Copyright | — | `© 2026 [developer name]` | — |
| In-App Purchases (automatic) | — | App Store shows an "In-App Purchases" line with the products from §6.1 once they are attached to the version; nothing to type in the description | — |

Description (≤ 4000): reuse §1.1 (EN) and §1.2 (AZ) verbatim — they are under the limit and contain no Google-specific wording.

What's New (≤ 4000): use the EN block of the relevant version from `RELEASE_NOTES.md`.

App Store screenshots (exact device sizes, rendered by `node store/tools/renderStoreShots.mjs --apple`):

| Device size | Requirement | File |
|---|---|---|
| iPhone 6.7" | 1290×2796 | `tower-clash/store/screenshots/apple-6.7/en/01..09.png` (v0.4.0 retake, `577b894`) |
| iPhone 6.5" | 1284×2778 | `tower-clash/store/screenshots/apple-6.5/en/01..09.png` (v0.4.0 retake, `577b894`) |

Same frames and captions as the Google set (English only — Azerbaijani is not an App Store locale), plus the App-Store-only frame 09 (level 15 artillery citadel, "Silence the guns"), rendered at the exact device sizes by `--apple`; the set is current with rules v2 and ready to upload (9 of the 10 allowed). iPad screenshots are not needed if the app is marked iPhone-only in App Store Connect (recommended; the game is portrait phone-first).

Review notes for App Review (paste into "Notes"): *Single-player offline game, no account needed. In-app purchases are one-time products handled by StoreKit through RevenueCat; "Restore Purchases" is in the shop screen. Ads are Google AdMob; the app never requests App Tracking Transparency (no `NSUserTrackingUsageDescription` in Info.plist) and always requests non-personalised ads on iOS, so the IDFA is not used — App Privacy "Tracking" is answered No (see §6.4). Sandbox tester: none required — all content is available without purchase.*

---

## 3. ASO keyword list

Primary (in title / subtitle / first lines): tower clash, capture every tower, real-time strategy.

Secondary (descriptions, keyword field): tower war, tower conquest, castle capture, army strategy, rts, one-thumb strategy, offline strategy game, casual strategy, tap to attack, fortress, artillery, tanks, mines, bridges, three stars, short levels, 40 levels, commander upgrades, skins.

Azerbaijani: qüllə oyunu, strategiya oyunu, qala tutmaq, ordu, real vaxt strategiya, oflayn oyun, bir barmaqla oyun, tank, körpü.

Removed from the list since v0.2.0: "no ads strategy", "reklamsız oyun" — no longer true for the store builds.

Do not use competitor names ("Tower War", "State.io", etc.) in the keyword field or title — both stores reject trademarked names of other apps; "Tower War–style" stays in internal docs only.

---

## 4. Content rating notes (IARC for Google Play, age-rating questionnaire for App Store)

Facts to answer with:

| Question | Answer | Why |
|---|---|---|
| Violence | Mild / cartoon, infrequent | Tiny stylised clay soldiers and tanks move along roads and disappear with a puff of particles when they meet an opposing unit, a mine or a barrier; units on a cut bridge fall into the water and vanish. No blood, no injury depiction, no realistic weapons, no human suffering. |
| Fear / horror | None | — |
| Sexual content, nudity | None | — |
| Language | None | UI text only (PLAY, STREAMS, MENU, VICTORY), in English, Azerbaijani, Russian or Turkish. |
| Controlled substances, gambling | None | No simulated gambling. |
| User interaction | None | No chat, no user-generated content, no sharing, no multiplayer. |
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
console.log("gp short EN", c("Capture every tower. One-thumb real-time strategy, 40 levels, plays offline."));
console.log("gp short AZ", c("Bütün qüllələri tut. Bir barmaqla real vaxt strategiya, 40 səviyyə, oflayn."));
console.log("promo EN", c("Tap, send, conquer. 40 levels of one-thumb real-time strategy: fortresses, artillery, tanks, mines, bridges. Plays offline, no account. Ads removable."));
console.log("promo AZ", c("Toxun, göndər, fəth et. Qalalar, toplar, tanklar, minalar, körpülərlə 40 səviyyəlik bir barmaq real vaxt strategiya. Oflayn, hesabsız. Reklamlar silinə bilər."));
console.log("subtitle AZ", c("Bütün qüllələri tut"));
console.log("keywords EN", c("tower,war,strategy,rts,capture,conquer,castle,army,offline,tap,casual,defense,attack,soldiers"));
'
```
Results on 2026-09-13: 76 / 75 / 150 / 158 / 19 / 93. IAP names and descriptions in §6.1 were counted the same way (≤ 30 / ≤ 45).

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
| `premium_bundle` | Non-Consumable | 9.99 | 10 | `Premium Bundle` (14) | `No ads, 600 crystals, 2 skins, -10% boosters` (44) | no interstitials + 600 crystals + `roof_gold` + `helmet_royal` + −10 % booster gold cost |
| `premium_upgrade` | Non-Consumable | 4.99 | 5 | `Premium Upgrade` (15) | `550 crystals, 2 skins, -10% booster cost` (40) | 550 crystals + the two Premium skins + −10 %; shown only to owners of `remove_ads` |
| `weekend_pack` | Consumable — **Phase C only**, do not create until LiveOps ships | 1.99 | 2 | `Weekend Pack` (12) | `250 crystals and 250 gold, once per weekend` (43) | 250 crystals + 250 gold |

Rules that follow from the list (Apple 3.1.1 / 3.1.2, Play Payments policy, EU consumer law): every product goes through StoreKit / Play Billing (RevenueCat wraps both; no external checkout links); a **Restore Purchases** button is mandatory in the shop for the non-consumables; the shop shows the **store-localised price string**, never a hard-coded "$"; the Starter Pack "×2 value" badge must be computed from the `crystals_100` rate; no subscriptions, so no subscription terms text is needed. Display names are the catalog `title` strings so the shop UI and the store sheets say the same thing (RevenueCat returns the store title).

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

Everything is answered "not linked to the user's identity" — there is no account. The SDK rows are what Google's and RevenueCat's SDK disclosure pages recommend as of my last knowledge; **the Mobile Engineer / stakeholder must re-check those two pages on submission day** (Google: "Play data disclosure requirements for the Google Mobile Ads SDK"; RevenueCat: "Google Play Data Safety" docs page).

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

Either way: *Contact Info, User Content, Health, Financial Info, Browsing History, Search History* → not collected. Export compliance stays "uses only standard HTTPS" (`ITSAppUsesNonExemptEncryption = NO` remains correct). Option A is the recorded decision (`LAUNCH_CHECKLIST.md` row MZ9, done 2026-09-14); the App Store Connect answers for row A14 are the option A table above plus *Tracking* = No.

### 6.5 Age rating and audience impact

- **Google Play — Target audience and content:** *13 and over* (or 18+) — **not** "designed for children / Families". Reason: AdMob would then require a Families self-certified SDK configuration, `tagForChildDirectedTreatment`, no personalised ads and a Teacher Approved review; the game does not implement that. AdMob app settings: *Not child-directed*; **Max ad content rating: G**.
- **Google Play — IARC:** interactive elements **"In-Game Purchases"**; *"Does the game include purchases of random items (loot boxes)?"* → **No**. Expected rating unchanged (Everyone / PEGI 3).
- **Apple — Age rating:** stays **9+**. Questionnaire deltas caused by monetization: *Unrestricted Web Access* **No**; *Gambling and Contests* **No**; *Loot boxes* **No**; ads and IAP are disclosed through the Ads/IAP metadata, not the rating. Apple's *"Made for Kids"* is not pursued either way (kids-category apps may not include third-party ad SDKs in their standard configuration), even though option 6.4-A means the app tracks nobody.
- **Both stores:** the privacy policy (v2.1, Part B) must be live at the URL before submission; both consoles reject a listing whose policy URL contradicts the Data safety / App Privacy answers.
