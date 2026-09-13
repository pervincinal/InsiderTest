# Tower Clash — release notes

Semantic versioning. The version lives in `tower-clash/package.json`; native version codes (`android/app/build.gradle` `versionName`/`versionCode`, iOS `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION`) are bumped by the Mobile Engineer for every store upload. Git tags are created by the Producer; the Publisher proposes them here.

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
