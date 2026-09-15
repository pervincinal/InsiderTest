# Tower Clash — release notes

Semantic versioning. The version lives in `tower-clash/package.json`; native version codes (`android/app/build.gradle` `versionName`/`versionCode`, iOS `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION`) are bumped by the Mobile Engineer for every store upload. Git tags are created by the Producer; the Publisher proposes them here.

---

## v0.3.0 — 2026-09-15 (ready to tag)

Proposed tag: `tower-clash-v0.3.0` (on branch `claude/tower-war-game-plan-weqwpb`), to be created by the Producer on the commit that carries this section and the version bump. Scope per `docs/ECONOMY.md` §8 Phase A: the economy and shop on all builds, web-safe (no store/ad SDK on the web). Native versions at this tag: Android `versionName "0.3.0"` / `versionCode 3`, iOS `MARKETING_VERSION 0.3.0` / `CURRENT_PROJECT_VERSION 3` — written by `npm run version:sync` on 2026-09-15 from `package.json` (`0.3.0`, `config.buildNumber` 3); `npm run version:check` passes. GitHub Pages (checklist W3) remains a stakeholder switch and does not block the tag: the web URL goes live when it is flipped.

**Status on 2026-09-15 (Publisher check of the tree against `docs/BACKLOG.md` "Done", Sprint 3 + Day 2 + Day 2b).** Everything under "In this build" is committed (last game commit `888d186`, 2026-09-14: rewind continue, terrain theme equip, level 30 retune) and covered by `npm run check` (379 unit tests, re-run 2026-09-15), `npm run playtest` (40/40 levels, level 30 now 100/100 seeds, max-upgrade median 2.0★) and the e2e suites (54 + 4 WebView). The last block, "Not in this build", lists what is *not* in the tree and must not appear in the store "What's new" text.

### English

Tower Clash gets its economy: gold and crystals, a shop with skins and Commander upgrades, achievements, a 7-day daily reward and a real 20-second rewind after a defeat — on the web still with no ads and nothing to pay for.

**In this build — gold and crystals**
- Coins become **gold** (same save value; save schema v3 migrates old progress); a second currency, **crystals**, is earned from level milestones (10 / 20 / 30 / 40 levels cleared), a full band at three stars, achievements and days 4 and 7 of the daily streak.
- Gold from replays (3 per star, 100 per day) and star improvements, plus a **7-day daily reward** on the title screen (a rewarded ×2 chest in the native apps).
- **Achievements screen** (trophy button): ten achievements with progress bars — first victory, first level-3 tower, first fortress, first bridge cut, first tank factory, ten / twenty / forty 3★ levels, flawless win, win under 30 s — paying 5 to 20 crystals each.
- **Crystal → gold conversion** card in the shop (1 : 5; packs of 20 / 100 / 500 crystals); gold never converts to crystals.

**In this build — Commander upgrades**
- Five permanent tracks bought with gold, five tiers each: production +4 %/tier, capacity +5 %, starting garrison +1, booster cost −5 %, march speed +3 %. Costs 60 / 120 / 200 / 300 / 420 gold per tier.
- Capped so the reference bot still wins every level with zero upgrades and averages ≤ 2.5 stars with everything maxed (`npm run playtest -- --upgrades max`, measured median 2.0★).

**In this build — shop, skins, crystal services**
- Shop tabs: crystals (packs + converter), bundles (**booster crate**: 60 crystals → 5 Overdrive + 3 Freeze + 2 Airstrike charges; Starter Pack, Remove Ads, Premium Bundle, Premium Upgrade), skins, upgrades; a **Restore Purchases** button; store price strings come from the store provider (fallback USD on the web).
- **Skins** with dedicated sprites: 7 tower roofs (default, gold, iron, slate, tent, pagoda, onion) and 7 unit helmets (default, plume, bronze, viking, knight, samurai, royal); Slate / Pagoda / Onion-dome roofs and Viking / Knight / Samurai helmets are sold for crystals, Gold roof + Royal helmet come with Premium, the Bronze helmet with the Starter Pack. Three **terrain themes** — Dusk (150 crystals), Winter night (200) and Neon (200) — are bought and equipped in the "Terrain themes" section of the Skins tab and re-light both the battlefield and the title island. Skins never change readability or team colours.
- **Level skip** (30 crystals, offered after three defeats on an uncleared level, one per band, grants 1★) and **Reinforcements** after a defeat (10 crystals, or a rewarded video in the native apps): a true **20 s rewind** — the game jumps back to the state it had 20 s before the defeat, grants a free Freeze and +15 infantry on your strongest tower, and resumes; once per attempt. The clock and the stars keep the original start time, so continuing never improves the star result. Only if no snapshot can be served (a defeat within the first seconds) does the level restart with the +15 infantry bonus on every tower instead.

**In this build — web build**
- No ads, no real purchases: the ad layer is a no-op and the store is a demo ("Test store") provider. Nothing in the web version asks for payment; the web/PWA build still makes no network calls after loading.

**In this build — native apps (groundwork, inactive without keys)**
- RevenueCat and AdMob providers behind the `StoreProvider` / `AdsProvider` interfaces; with no keys configured the store reports "unavailable" and AdMob serves Google test ads only. Interstitial gate (never in a battle, never in levels 1–5, at most one per three completed levels, four per session) and rewarded placements with daily caps (×2 gold, daily chest, continue).
- **No tracking on iOS:** the app never shows Apple's App Tracking Transparency prompt (`Info.plist` has no `NSUserTrackingUsageDescription`), every iOS ad request asks for non-personalised ads, and a unit test fails the build if the tracking call comes back. On Android the UMP consent form decides personalisation (EEA/UK/Switzerland).
- Settings → **"Privacy options"** (re-opens the consent form; shown only when the ads SDK reports it is required) and Settings → About → **Support ID** (RevenueCat anonymous app user id, copy-to-clipboard) for deletion requests, as promised in the privacy policy.
- Real purchases and ads are **v1.0 native** (Phase B), not v0.3.0.

**In this build — levels, sim, QA**
- Levels **27 "Armour Race"**, **31 "Guns over the River"** and **37 "Tank Country"** rebuilt so the enemy tank factories stand at the front and their tanks actually march (100/100 seeds each; median clear 53 / 51 / 71 s). Level **30 "Drawbridge"** retuned to 100/100 seeds (the seed-33 loss is gone); star times recomputed for levels 6 / 9 / 10 / 11 / 27 / 31 / 37.
- Sim: `SnapshotRing` (one snapshot per second, 20 s of history; the rng streams rewind with the state) and `applyContinue` power the Reinforcements rewind above.
- **Android WebView e2e** project (Playwright, WebView user agent + viewport): safe-area title, touch play flow, back button = pause, background pause; 3 bugs found and fixed in the sweep.

**In this build — publishing**
- Privacy policy **v2.1** (web part + mobile-app part: AdMob, RevenueCat, consent, children, rights; 2.1 = no tracking on iOS) published as `public/privacy.html` together with `public/support.html` (contact, restore purchases, delete data) — live on GitHub Pages once it is enabled; store listing with the in-app purchase list, Play Ads / Data safety answers, Apple privacy labels (option A, Tracking = No) and App Review note; launch checklist §6 (payments profile, Paid Applications agreement, RevenueCat, AdMob, `app-ads.txt`); `ACCOUNTS.md` §5 on receiving money; store screenshot 07 (Upgrades tab) and the App Store IAP review frame.

**Not in this build (do not list in "What's new")**
- Real RevenueCat / AdMob keys, store products, sandbox purchase test (ECON-1, Phase B — needs the stakeholder's accounts). Real purchases and ads arrive with v1.0 native.
- Real-device pass on a phone (QA-2, MM-1); signed release builds (MM-3).

Still true on every build: no accounts, no analytics. The web/PWA build makes no network calls after loading and never asks for payment — its shop runs on the demo "Test store", so a tapped product completes locally without money changing hands. English UI only. `README.md`, `package.json` and the native projects all say 0.3.0 / build 3.

### Azərbaycanca

Tower Clash öz iqtisadiyyatını alır: qızıl və kristallar, görünüşlər və Komandir təkmilləşdirmələri olan mağaza, nailiyyətlər, 7 günlük gündəlik mükafat və məğlubiyyətdən sonra əsl 20 saniyəlik geri sarma — vebdə yenə reklamsız və ödənişsiz.

**Bu build-də — qızıl və kristallar**
- Sikkələr **qızıl** olur (eyni yaddaş dəyəri; yaddaş sxemi v3 köhnə irəliləyişi köçürür); ikinci valyuta **kristallar** səviyyə mərhələlərindən (10 / 20 / 30 / 40 səviyyə), bir zonanın hamısını üç ulduzla keçməkdən, nailiyyətlərdən və gündəlik seriyanın 4 və 7-ci günlərindən qazanılır.
- Təkrar oyunlardan (hər ulduza 3, gündə 100) və ulduz yaxşılaşdırmalarından qızıl, üstəgəl baş ekranda **7 günlük gündəlik mükafat** (native tətbiqlərdə mükafatlı ×2 sandıq).
- **Nailiyyətlər ekranı** (kubok düyməsi): tərəqqi zolaqlı on nailiyyət — ilk qələbə, ilk 3-cü səviyyə qüllə, ilk qala, ilk körpü kəsmə, ilk tank fabriki, on / iyirmi / qırx 3★ səviyyə, qüllə itirmədən qələbə, 30 saniyədən tez qələbə — hər biri 5–20 kristal verir.
- Mağazada **kristal → qızıl çevirmə** kartı (1 : 5; 20 / 100 / 500 kristal paketləri); qızıl heç vaxt kristala çevrilmir.

**Bu build-də — Komandir təkmilləşdirmələri**
- Qızılla alınan beş daimi xətt, hər biri beş pillə: istehsal +4 %/pillə, tutum +5 %, başlanğıc qarnizon +1, gücləndirici qiyməti −5 %, yürüş sürəti +3 %. Pillə qiymətləri 60 / 120 / 200 / 300 / 420 qızıl.
- Məhdudlaşdırılıb ki, istinad botu təkmilləşdirməsiz hər səviyyəni keçsin və hər şey maksimumda olanda orta ≤ 2.5 ulduz alsın (`npm run playtest -- --upgrades max`, ölçülən median 2.0★).

**Bu build-də — mağaza, görünüşlər, kristal xidmətləri**
- Mağaza tabları: kristallar (paketlər + çevirici), paketlər (**gücləndirici sandığı**: 60 kristal → 5 Overdrive + 3 Freeze + 2 Airstrike; Başlanğıc paketi, Reklamları sil, Premium paket, Premium təkmilləşdirmə), görünüşlər, təkmilləşdirmələr; **Alışları bərpa et** düyməsi; qiymət mətnləri mağaza təminatçısından gəlir (vebdə USD ehtiyat qiymətlər).
- Ayrıca sprite-lı **görünüşlər**: 7 qüllə damı (standart, qızıl, dəmir, slate, çadır, paqoda, soğan günbəz) və 7 əsgər dəbilqəsi (standart, lələkli, bürünc, vikinq, cəngavər, samuray, kral); Slate / Paqoda / Soğan günbəz damları və Vikinq / Cəngavər / Samuray dəbilqələri kristalla satılır, Qızıl dam + Kral dəbilqəsi Premium ilə, Bürünc dəbilqə Başlanğıc paketi ilə gəlir. Üç **relyef mövzusu** — Alaqaranlıq (150 kristal), Qış gecəsi (200) və Neon (200) — Görünüşlər tabının "Relyef mövzuları" bölməsində alınır və geyilir; həm döyüş meydanını, həm də baş ekrandakı adanı yenidən işıqlandırır. Görünüşlər oxunaqlılığı və komanda rənglərini dəyişmir.
- **Səviyyəni keçmək** (30 kristal, keçilməmiş səviyyədə üç məğlubiyyətdən sonra təklif olunur, hər zonada bir dəfə, 1★ verir) və məğlubiyyətdən sonra **Əlavə qüvvə** (10 kristal və ya native tətbiqlərdə mükafatlı video): əsl **20 s geri sarma** — oyun məğlubiyyətdən 20 saniyə əvvəlki vəziyyətə qayıdır, pulsuz Freeze və ən güclü qüllənə +15 piyada verir və davam edir; hər cəhddə bir dəfə. Saat və ulduzlar orijinal başlanğıc vaxtını saxlayır, yəni davam etmək ulduz nəticəsini yaxşılaşdırmır. Yalnız snapshot yoxdursa (ilk saniyələrdə məğlubiyyət) səviyyə əvəzinə hər qüllədə +15 piyada bonusu ilə yenidən başlayır.

**Bu build-də — veb build**
- Reklam və real alış yoxdur: reklam qatı boşdur, mağaza demo ("Test store") təminatçısıdır. Veb versiyada heç nə ödəniş istəmir; veb/PWA build yükləndikdən sonra yenə heç bir şəbəkə sorğusu göndərmir.

**Bu build-də — native tətbiqlər (hazırlıq, açarsız qeyri-aktiv)**
- `StoreProvider` / `AdsProvider` interfeyslərinin arxasında RevenueCat və AdMob təminatçıları; açar konfiqurasiya olunmayanda mağaza "əlçatmaz" deyir, AdMob yalnız Google test reklamları göstərir. Aralıq reklam qapısı (heç vaxt döyüşdə, heç vaxt 1–5-ci səviyyələrdə, hər üç tamamlanmış səviyyədə ən çox bir, sessiyada dörd) və gündəlik limitli mükafatlı yerləşdirmələr (×2 qızıl, gündəlik sandıq, davam).
- **iOS-da izləmə yoxdur:** tətbiq Apple-ın App Tracking Transparency sorğusunu heç vaxt göstərmir (`Info.plist`-də `NSUserTrackingUsageDescription` yoxdur), iOS-da hər reklam sorğusu fərdiləşdirilməmiş reklam istəyir, izləmə çağırışı geri qayıtsa unit test build-i dayandırır. Android-də fərdiləşdirməni UMP razılıq forması müəyyən edir (AİZ/BB/İsveçrə).
- Parametrlər → **"Məxfilik seçimləri"** (razılıq formasını yenidən açır; yalnız reklam SDK-sı tələb olunduğunu bildirəndə görünür) və Parametrlər → Haqqında → **Dəstək ID** (RevenueCat anonim istifadəçi id-si, kopyalama düyməsi ilə) — məxfilik siyasətində vəd edildiyi kimi silinmə sorğuları üçün.
- Real alış və reklam **v1.0 native** (B mərhələsi) üçündür, v0.3.0 üçün yox.

**Bu build-də — səviyyələr, sim, QA**
- **27 "Armour Race"**, **31 "Guns over the River"** və **37 "Tank Country"** səviyyələri yenidən qurulub: düşmən tank fabrikləri cəbhədədir və tanklar həqiqətən yeriyir (hər biri 100/100 seed; median keçmə vaxtı 53 / 51 / 71 s). **30 "Drawbridge"** səviyyəsi 100/100 seed-ə tənzimlənib (seed 33 məğlubiyyəti aradan qalxıb); 6 / 9 / 10 / 11 / 27 / 31 / 37-ci səviyyələrin ulduz vaxtları yenidən hesablanıb.
- Sim: `SnapshotRing` (saniyədə bir snapshot, 20 s tarixçə; rng axınları vəziyyətlə birlikdə geri sarılır) və `applyContinue` yuxarıdakı Əlavə qüvvə geri sarmasını işlədir.
- **Android WebView e2e** layihəsi (Playwright, WebView user agent + viewport): safe-area baş ekran, toxunma ilə oyun axını, geri düyməsi = pauza, arxa fon pauzası; süpürgədə 3 bug tapılıb və düzəldilib.

**Bu build-də — nəşr**
- Məxfilik siyasəti **v2.1** (veb hissəsi + mobil tətbiq hissəsi: AdMob, RevenueCat, razılıq, uşaqlar, hüquqlar; 2.1 = iOS-da izləmə yoxdur) `public/privacy.html` kimi, `public/support.html` ilə birlikdə (əlaqə, alışların bərpası, məlumatın silinməsi) — GitHub Pages aktivləşəndə canlı olacaq; tətbiqdaxili alış siyahısı, Play reklam / məlumat təhlükəsizliyi cavabları, Apple məxfilik etiketləri (A variantı, İzləmə = Yox) və App Review qeydi ilə mağaza mətni; buraxılış siyahısı §6 (ödəniş profili, Paid Applications müqaviləsi, RevenueCat, AdMob, `app-ads.txt`); pul almaq haqqında `ACCOUNTS.md` §5; mağaza skrinşotu 07 (Təkmilləşdirmələr tabı) və App Store IAP baxış kadrı.

**Bu build-də yoxdur ("Yeniliklər" mətninə yazma)**
- Real RevenueCat / AdMob açarları, mağaza məhsulları, sandbox alış testi (ECON-1, B mərhələsi — tərəf-müqabilin hesabları lazımdır). Real alış və reklam v1.0 native ilə gəlir.
- Real telefonda yoxlama (QA-2, MM-1); imzalanmış release build-lər (MM-3).

Hər build-də dəyişməyən: hesab və analitika yoxdur. Veb/PWA build yükləndikdən sonra şəbəkə sorğusu göndərmir və heç vaxt ödəniş istəmir — mağazası demo "Test store" üzərində işləyir, toxunulan məhsul pul dəyişmədən yerli olaraq tamamlanır. İnterfeys yalnız ingiliscədir. `README.md`, `package.json` və native layihələr 0.3.0 / build 3 göstərir.

---

## v0.2.0 — 2026-09-13

Proposed tag: `tower-clash-v0.2.0` (on branch `claude/tower-war-game-plan-weqwpb`).
Native versions at this tag: Android `versionName "0.2.0"` / `versionCode 2`, iOS `MARKETING_VERSION 0.2.0` / `CURRENT_PROJECT_VERSION 2` (`npm run version:sync` copies them from `package.json`). Web: `https://pervincinal.github.io/InsiderTest/` once GitHub Pages is enabled by a repository admin (Settings → Pages → Source: GitHub Actions).

**For the Producer before tagging.** Sprint 2 shipped in parallel; every line below was checked against the working tree at 16:22 on 2026-09-13, when the store screenshots were captured (`npm run build` green, `npm run levels:check` reporting 40 valid levels, the booster bar / mute button / settings screen / native bridge wired in `src/`). Nothing is marked "(planned for this release)" any more; items that still need a human are listed under "Not in the tag" at the end of the English section. The v0.2.0 store screenshots show levels 1, 5, 9 and 15; levels 16–40 were still being tuned by the Level Designer at capture time, so their star times may change before the tag.

### English

Tower Clash grows from a vertical slice into the full 40-level campaign, with a new look and the first use for your coins.

**New look — "Sunlit Clay Islands"**
- Everything re-drawn as soft clay: three-tone shading, one warm key light, long soft shadows on the ground, rim lights on towers.
- Taller towers with a stone plinth, gold gems for the upgrade level, a waving flag and a paper count badge; clay soldiers that bob as they march; tanks that rock.
- Biomes by level band: grass (1–8), autumn (9–16), sand (17–24), snow (25–32), volcanic (33–40).
- Claymorphic UI with the Fredoka typeface (bundled, OFL): glass HUD band, clay buttons and cards, extruded 3D "VICTORY" lettering, stars that pop in with a gold burst, a winding level map that scrolls to your current level.

**25 new levels (16–40) — the campaign is complete at 40**
- 16: a two-front siege of a keep, the last one-enemy level.
- 17–24: **two enemies** at once (they also fight each other), **mines** that kill the first units to cross a road, **barriers** with hit points that must be worn down or walked around.
- 25–32: **tank factories** (a tank weighs five soldiers and is slow) and **bridges** you can cut with a long press — units on the bridge drown and the column behind it is stranded.
- 33–40: **three enemies**, all mechanics together, ending on level 40 "The Crown".
- Every level carries a one-line lesson and is validated by the reference bot (`npm run playtest`).

**Boosters — the first use for coins**
- Three round buttons in the bottom bar: **Overdrive** (×3 production for 10 s, 30 coins), **Freeze** (enemies stop producing for 5 s, 40 coins), **Airstrike** (−10 units on one enemy tower, 50 coins). Coins still come only from first clears (10 per star), never from purchases.

**Settings and sound**
- Sound toggle on the title screen; the M key still mutes on desktop.
- Mute button in the play HUD and a Sound / Settings pair in the pause menu.
- Settings screen (gear on the title screen and in the pause menu): sound, colour-blind palette, reduced motion (auto / on / off), send ratio, reset progress with confirmation.
- Reduced-motion preference respected by every animation (follows the OS setting by default); saved data migrates from v0.1.0 automatically.

**Phone shell**
- Native shell integration (Capacitor plugins, loaded only inside the Android/iOS app): hidden status bar, portrait lock, a light haptic tap when you capture a tower, Android back button = pause / back.
- Native version numbers aligned with the web build (0.2.0 / build 2) by `npm run version:sync`; the iOS project declares that it uses no non-exempt encryption.

**Publishing**
- GitHub Pages deploy workflow for the web build (`docs/DEPLOY.md`); the public URL goes live once Pages is switched on in the repository settings.
- App Store screenshots in the exact 6.7" (1290×2796) and 6.5" (1284×2778) sizes; Google Play set regenerated with the new look.
- CI now runs three browser suites: smoke, every-level content check and a frame-time budget on the top level; a replay test locks the simulation's determinism.

Still true: no ads, no in-app purchases, no accounts, no analytics, no network calls. English UI only.

Known limitations: iOS device builds still need an Apple Developer account; skins are not in yet; coins are earned only from first clears, so booster use is deliberately scarce.

Not in the tag (needs a human, see `LAUNCH_CHECKLIST.md`): enabling GitHub Pages (W3), hosting the privacy policy page (W5), store accounts and signing secrets. Native behaviour (status bar, haptics, back button) has been verified only in CI builds, not on a physical phone (MM-1).

### Azərbaycanca

Tower Clash şaquli kəsikdən 40 səviyyəlik tam kampaniyaya çevrilir — yeni görünüş və sikkələrin ilk istifadəsi ilə.

**Yeni görünüş — "Günəşli Gil Adalar"**
- Hər şey yumşaq gildən düzəldilmiş kimi yenidən çəkilib: üç tonlu kölgələmə, bir isti işıq mənbəyi, yerə düşən uzun yumşaq kölgələr, qüllələrdə kənar işığı.
- Daş özüllü daha hündür qüllələr, təkmilləşdirmə səviyyəsini göstərən qızıl daşlar, dalğalanan bayraq və kağız say nişanı; yeriyərkən yırğalanan gil əsgərlər; yırğalanan tanklar.
- Səviyyə qruplarına görə biomlar: çəmən (1–8), payız (9–16), qum (17–24), qar (25–32), vulkan (33–40).
- Fredoka şrifti ilə (paketə daxildir, OFL) gil üslublu interfeys: şüşə HUD zolağı, gil düymələr və kartlar, həcmli 3D "VICTORY" yazısı, qızıl parıltı ilə çıxan ulduzlar, cari səviyyəyə sürüşən dolanbac səviyyə xəritəsi.

**25 yeni səviyyə (16–40) — kampaniya 40-da tamamlanır**
- 16: qalanın iki cəbhədən mühasirəsi, bir rəqibli son səviyyə.
- 17–24: eyni anda **iki rəqib** (bir-biri ilə də vuruşurlar), yoldan ilk keçən əsgərləri məhv edən **minalar**, aşınmalı və ya yan keçilməli **sədlər**.
- 25–32: **tank zavodları** (tank beş əsgər ağırlığındadır, amma yavaşdır) və uzun basışla kəsilə bilən **körpülər** — körpüdəki əsgərlər batır, arxadakı kolon ilişib qalır.
- 33–40: **üç rəqib**, bütün mexanikalar birlikdə, sonda 40-cı səviyyə "The Crown".
- Hər səviyyənin bir cümləlik dərsi var və istinad botu ilə yoxlanılıb (`npm run playtest`).

**Gücləndiricilər — sikkələrin ilk istifadəsi**
- Aşağı zolaqda üç dairəvi düymə: **Overdrive** (10 saniyə ×3 istehsal, 30 sikkə), **Freeze** (rəqiblər 5 saniyə istehsal etmir, 40 sikkə), **Airstrike** (bir düşmən qülləsindən −10 əsgər, 50 sikkə). Sikkələr yalnız ilk keçidlərdən gəlir (hər ulduza 10), heç vaxt alışdan yox.

**Parametrlər və səs**
- Başlıq ekranında səs düyməsi; masaüstündə M düyməsi hələ də səsi söndürür.
- Oyun HUD-unda səssiz düyməsi və pauza menyusunda Sound / Settings cütü.
- Parametrlər ekranı (başlıq ekranında və pauza menyusunda dişli düyməsi): səs, rəng korluğu palitrası, azaldılmış hərəkət (auto / on / off), göndərmə nisbəti, təsdiqlə irəliləyişi sıfırlama.
- Azaldılmış hərəkət seçimi bütün animasiyalarda nəzərə alınır (standart olaraq OS parametrinə uyğun); v0.1.0 yaddaşı avtomatik köçürülür.

**Telefon qabığı**
- Native inteqrasiya (Capacitor plaginləri, yalnız Android/iOS tətbiqində yüklənir): gizli status zolağı, şaquli kilid, qüllə tutanda yüngül vibrasiya, Android geri düyməsi = pauza / geri.
- Native versiya nömrələri veb build ilə uyğunlaşdırılıb (0.2.0 / build 2) — `npm run version:sync`; iOS layihəsi qeyri-istisna şifrələmə istifadə etmədiyini bəyan edir.

**Nəşr**
- Veb build üçün GitHub Pages yerləşdirmə workflow-u (`docs/DEPLOY.md`); Pages repo parametrlərində aktivləşdirilən kimi ünvan işə düşür.
- App Store üçün dəqiq 6.7" (1290×2796) və 6.5" (1284×2778) ölçülü ekran görüntüləri; Google Play dəsti yeni görünüşlə yenidən çəkilib.
- CI indi üç brauzer dəstini işlədir: smoke, hər səviyyənin yüklənmə yoxlaması və ən yuxarı səviyyədə kadr vaxtı büdcəsi; təkrar oynatma testi simulyasiyanın determinizmini qoruyur.

Dəyişməyən: reklam, tətbiqdaxili alış, hesab, analitika və şəbəkə sorğusu yoxdur. İnterfeys yalnız ingiliscədir.

Məlum məhdudiyyətlər: real iPhone build-i üçün hələ də Apple Developer hesabı lazımdır; skinlər hələ yoxdur; sikkələr yalnız ilk keçidlərdən qazanılır, ona görə gücləndiricilər qəsdən məhduddur; native davranış (status zolağı, vibrasiya, geri düyməsi) hələ real telefonda yoxlanılmayıb.

---

## v0.1.0 — 2026-09-13

Proposed tag: `tower-clash-v0.1.0` (on branch `claude/tower-war-game-plan-weqwpb`).
Native versions at this tag: Android `versionName "1.0"` / `versionCode 1`, iOS `MARKETING_VERSION 1.0` / build `1` — to be aligned to `0.1.0` / `1` before the first store upload (see `LAUNCH_CHECKLIST.md`).

### English

First playable release of Tower Clash, a one-thumb capture-the-towers real-time strategy game.

- 15 hand-made levels, each against one AI opponent (rusher, turtle or opportunist personality).
- Three tower types: barracks, fortress (from level 9 — halves incoming damage) and artillery (from level 12 — shoots soldiers in range).
- Tap a tower, tap a target: send everyone; tap the selected tower again to upgrade it (levels 1–3, faster production, bigger garrison).
- SEND 100 % / 50 % toggle.
- Built-in tutorial on levels 1–3.
- Stars by clear time (3 / 2 / 1), coins on the first clear of each level, level unlocking; progress saved on the device.
- Title screen, level-select grid with stars, result screen (Victory / Defeat, time, stars, coins, Next / Retry / Menu).
- Pause menu with Resume, ×2 speed, Retry, Menu (P or Space on a keyboard; Escape returns to the level list).
- Colour-blind palette toggle on the title screen.
- Toy-style visuals: island terrain, 3D-look towers with crowns per level, marching soldiers, capture and upgrade particles.
- Sound effects synthesised with WebAudio (no audio files); the M key mutes on desktop.
- Installable PWA with offline service worker and home-screen icons.
- Android app (Capacitor) built as a debug APK by GitHub Actions on every push; iOS app project with an unsigned simulator build on CI.
- No ads, no in-app purchases, no accounts, no analytics, no network calls.

Known limitations: English UI only; coins have no use yet (boosters are planned); no mute button on touch devices (use the device volume); one opponent per level; no tank factories, mines, barriers or bridges yet; iOS device builds need an Apple Developer account.

### Azərbaycanca

Tower Clash-in ilk oynanıla bilən buraxılışı — bir barmaqla qüllə tutma real vaxt strategiya oyunu.

- 15 əl ilə hazırlanmış səviyyə, hər birində bir süni intellekt rəqibi (hücumçu, tısbağa və ya fürsətçi xarakter).
- Üç qüllə növü: kazarma, qala (9-cu səviyyədən — gələn zərəri yarıya endirir) və top (12-ci səviyyədən — mənzilindəki əsgərləri vurur).
- Qülləyə toxun, hədəfə toxun: hamı gedir; seçilmiş qülləyə bir daha toxunanda təkmilləşir (1–3 səviyyə, daha sürətli istehsal, daha böyük qarnizon).
- SEND 100 % / 50 % düyməsi.
- 1–3-cü səviyyələrdə daxili təlimat.
- Vaxta görə ulduzlar (3 / 2 / 1), hər səviyyənin ilk keçilməsində sikkə, səviyyələrin açılması; irəliləyiş cihazda saxlanılır.
- Başlıq ekranı, ulduzlu səviyyə seçimi, nəticə ekranı (Victory / Defeat, vaxt, ulduzlar, sikkələr, Next / Retry / Menu).
- Pauza menyusu: Resume, ×2 sürət, Retry, Menu (klaviaturada P və ya Space; Escape səviyyə siyahısına qaytarır).
- Başlıq ekranında rəng korluğu palitrası düyməsi.
- Oyuncaq üslublu görünüş: ada relyefi, səviyyəyə görə taclı 3D görünüşlü qüllələr, yeriyən əsgərlər, tutma və təkmilləşdirmə effektləri.
- WebAudio ilə sintez olunan səs effektləri (səs faylı yoxdur); masaüstündə M düyməsi səsi söndürür.
- Oflayn işləyən, ana ekrana quraşdırıla bilən PWA.
- Hər push-da GitHub Actions ilə hazırlanan Android debug APK (Capacitor); CI-da imzasız iOS simulyator build-i.
- Reklam, tətbiqdaxili alış, hesab, analitika və şəbəkə sorğusu yoxdur.

Məlum məhdudiyyətlər: interfeys yalnız ingiliscədir; sikkələrin hələ istifadəsi yoxdur (gücləndiricilər planlaşdırılır); toxunma cihazlarında səs söndürmə düyməsi yoxdur (cihazın səsini azaldın); hər səviyyədə bir rəqib; tank zavodu, mina, sədd və körpü hələ yoxdur; real iPhone-a yükləmək üçün Apple Developer hesabı lazımdır.
