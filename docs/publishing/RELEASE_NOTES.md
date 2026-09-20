# Tower Clash — release notes

Semantic versioning. The version lives in `tower-clash/package.json`; native version codes (`android/app/build.gradle` `versionName`/`versionCode`, iOS `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION`) are bumped by the Mobile Engineer for every store upload. Git tags are created by the Producer; the Publisher proposes them here.

---

## v1.0.0 — release candidate (unreleased)

Proposed tag: `tower-clash-v1.0.0` (on branch `claude/tower-war-game-plan-weqwpb`), to be created by the Producer from the GitHub UI (the git proxy accepts pushes to the working branch, not tags) on the commit that carries this section **and** the version bump. Scope: everything on the branch after the v0.4.0 texts and screenshots (`52b3441`, 2026-09-17) — the former "v0.4.1 — unreleased" notes, folded in here on 2026-09-20 (M4-3) and extended with the commits up to `bcec4e7` (2026-09-19). **No version bump yet:** `package.json` is still `0.4.0` / build 4, so before tagging the Mobile Engineer sets `1.0.0` / `config.buildNumber` 5 and runs `npm run version:sync` (Android `versionName "1.0.0"` / `versionCode 5`, iOS `MARKETING_VERSION 1.0.0` / `CURRENT_PROJECT_VERSION 5`; `npm run version:check` must pass). Save schema unchanged (v3; `challenge` and its `milestones` were added without a bump, like `achievements`). The 1.0 gate — tag, Pages, TestFlight / Play testing, privacy URL live — is `LAUNCH_CHECKLIST.md` §8; the first four weeks after the tag are `POST_LAUNCH.md`.

**Which channel gets what.** The web/PWA build (GitHub Pages) can carry 1.0.0 the day it is tagged: it has no ads, no purchases and no network calls after loading. The Google Play / App Store builds are "v1.0 native" (`docs/ECONOMY.md` §8 Phase B): the same code with RevenueCat and AdMob keys injected by the release job — they cannot be uploaded before the stakeholder's accounts and secrets exist (`LAUNCH_CHECKLIST.md` §2, §3, §5, §6), but nothing in *this* section depends on them.

**Status on 2026-09-20 (Publisher check of the tree against `docs/BACKLOG.md` "Done" 2026-09-18 … 09-19 and `docs/GDD.md` §7).** `npm run check` 620 unit tests, e2e 67 + 4 WebView, `npm run playtest` 40/40 levels, daily gate 60 days 60/60 (300/300 runs at 5 seeds), twist gate: no pool level below 47/50 on any twist at 50 seeds, eager bundle 79.3 kB gzip (limit 80) — figures from `reports/2026-09-19.md`. The build has **40 levels**. Later on 2026-09-20 the Level Designer's band-5 drafts `041-twin-rivers.json` … `050-the-crown-reforged.json` appeared in `tower-clash/src/levels/` as **untracked work in progress** (LV-9): not in the generated `manifest.ts` (the game cannot load them), `npm run levels:check` still reports "40 level(s) valid", no `name_az/ru/tr` or `lesson_*` yet, star clocks at the 40 / 80 s placeholders, level 41 with two enemies against the brief's three — and GDD §3 "Band 5" defines the pack as a **post-1.0 free content update**. They are therefore **not** in this build and no public text says 50 — see "Planned for 1.0.1". GDD §8 "Weekly Challenge" exists since 2026-09-20 as a proposal (WEEKLY-1, "not implemented") and is not mentioned in any public text either.

**Store "What's new" (≤ 500 characters each, counted with `node -e` on 2026-09-20 — EN 495, AZ 494, RU 499, TR 488; use the language of the listing locale). On the very first store submission the field is optional on Google Play and free-form on the App Store; the same text serves as the update note for the web/PWA channel.**

EN (495):
```
Tower Clash 1.0. Daily Challenge: one fixed level, seed and twist per day, the same for everyone — clear level 8 to unlock. The first win of the day pays gold and crystals, retries are free, and a 3-, 7- and 30-day win streak pays bonus crystals. Four new skins: Round keep, Watchtower, Shield bearers, Clockwork robots. Level 2 teaches "under fire"; ten levels retuned; smoother drawing on phones; a level that fails to download is retried with a message. Still no account, still plays offline.
```
AZ (494):
```
Tower Clash 1.0. Günlük Çağırış: hər gün hamı üçün eyni səviyyə, seed və fənd — açmaq üçün 8-ci səviyyəni keç. Günün ilk qələbəsi qızıl və kristal verir, təkrar cəhdlər pulsuz, 3, 7 və 30 günlük qələbə seriyası bonus kristal verir. Dörd yeni görünüş: Dairəvi qala, Gözətçi qülləsi, Qalxan daşıyanlar, Mexaniki robotlar. 2-ci səviyyə "atəş altında"nı öyrədir; on səviyyə yenidən tənzimlənib; telefonda daha rəvan çəkilir; yüklənməyən səviyyə mesajla yenidən yüklənir. Yenə hesabsız, yenə oflayn.
```
RU (499):
```
Tower Clash 1.0. Ежедневный вызов: каждый день один уровень, seed и условие — одинаковые для всех; открывается после 8-го уровня. Первая победа дня даёт золото и кристаллы, повторы бесплатны, серия побед в 3, 7 и 30 дней даёт бонусные кристаллы. Четыре новых облика: Круглый донжон, Сторожевая башня, Щитоносцы, Заводные роботы. Уровень 2 учит «под огнём»; десять уровней перенастроены; плавнее отрисовка на телефонах; незагрузившийся уровень запрашивается заново. По-прежнему без аккаунта и офлайн.
```
TR (489):
```
Tower Clash 1.0. Günlük Meydan Okuma: her gün herkes için aynı seviye, seed ve kural — açmak için 8. seviyeyi geç. Günün ilk zaferi altın ve kristal verir, tekrar denemeler ücretsiz, 3, 7 ve 30 günlük zafer serisi bonus kristal verir. Dört yeni görünüm: Yuvarlak kale, Gözetleme kulesi, Kalkan taşıyıcılar, Kurmalı robotlar. 2. seviye "ateş altında"yı öğretir; on seviye yeniden ayarlandı; telefonda daha akıcı çizim; inmeyen seviye mesajla yeniden denenir. Yine hesapsız, yine çevrimdışı.
```
(Skin and twist names are the in-game labels from `src/ui/locales/{en,az,ru,tr}.ts`.)

### English

Tower Clash 1.0 is the "Streams update" (v0.4.0) plus one week of content and hardening: a Daily Challenge with streak milestones, four silhouette skins, a level-2 lesson for "under fire", ten levels retuned so the daily pool holds under every twist, and a renderer that draws on three canvases. Nothing in the rules changed since v0.4.0.

**In this build — Daily Challenge (GDD §7)**
- One fixed match per UTC day for every player (`d54ae6e`, `01f3701`, `41c64c0`): a level from 9–40, a fixed seed and one of five twists — Classic, Lean rations (−10 % production), Fast feet (+25 % march speed), Thin walls (−20 % capacity), Reinforced (+5 soldiers on every tower at start). Card at the top of the level map with a countdown to 00:00 UTC, streak and today's best; unlocks after level 8.
- First win of the day pays 30 + 10 × stars gold and 5 crystals; retries are free and unlimited; Commander upgrades, boosters, Reinforcements, level skip and the ×2-gold ad are off in the daily so everyone plays the same match. Campaign progress is untouched (separate ledger `save.challenge`).
- **Streak milestones** (`d14e358`, DAILY-2; ECONOMY.md §6.2): the first win that brings the streak to day 3 / 7 / 30 pays +5 / +20 / +100 crystals once per streak run; the card shows the next bonus ("Streak 2 · +5 at day 3"), the result line the crystal total, a toast names the bonus.
- After the UTC rollover, RETRY and the pause menu's restart no longer replay yesterday's challenge: the level map opens with "New daily challenge is ready" (`30bab54`, BUG-9).
- Verified before it ships: `npm run playtest -- --daily <day> --days N --seeds K` and `-- --twist <id>` (`1323695`, `288618f`); CI runs the daily (30 days × 3 seeds) and twist (5 × 32 × 5) gates on every push (`1304498`).

**In this build — levels**
- **Daily-pool level pass** (`6ea495d`, `b52491d`, `c2353a1`, `d3981e6`, `dad05b8`): levels **10, 13, 15, 16, 19, 20, 27, 31, 34 and 38** retuned so every pool level holds under every twist — no level below 47/50 seeds on any twist at 50 seeds; 60-day daily sweep 60/60 days, 300/300 runs. Lessons, names, personalities and star clocks unchanged (plain-twist medians moved < 10 %).
- **Under-fire lesson** (`1750354`, LV-5): level 2 "Supply Line" now teaches that a tower under fire cannot recruit — answer every red stream (EN/AZ/RU/TR).

**In this build — skins**
- Four **silhouette skins** (`ccfa9fe`, M3-2), bought with crystals in the Skins tab and previewed in the shop: two tower silhouettes — **Round keep** (150) and **Watchtower** (200) — and two unit silhouettes — **Shield bearers** (120) and **Clockwork robots** (150). They replace the whole building / soldier while the level silhouette (L1 / L2 / L3) stays readable; team colours and readability rules are unchanged. 21 skins in total now (7 roofs, 7 helmets, 3 terrain themes, 4 silhouettes). The drawers live in a lazy chunk, so the first download did not grow.

**In this build — rendering and loading**
- **Three stacked canvases** (`03f62eb`, PERF-3): ground (drawn once per level), game (every frame), HUD (only when it changes). Measured headless at CPU 4× on level 40: frame median 133 → 67 ms, task time −37 %, pixel diff < 0.1 %.
- **DPR cap** (`ed9f8bf`, MM-4): native 2 / web 2.5 (`?dprcap=N` override); iPhone-class canvas memory 33.9 → 15.1 MB. Text at cap 2 is one device pixel softer only at 3× zoom.
- **Lazy chunk recovery** (`30bab54`, BUG-8): a level, skin or screen chunk that failed to download once is re-fetched under a fresh URL on the next tap and the screen shows "Couldn't load — check your connection"; a chunk that keeps failing reloads the page once per session from the title / map only. Same-size resize no longer leaves a stale HUD layer over pause / result / map (`f0d7903`).

**In this build — AI**
- Reference bot (`3b66c42` AI-3, `288618f` AI-4): answers a hose from a drained source (hose reserve); a capped tower keeps its attack on a burst alone while supplying sideways. The bot that verifies every level and every daily; the campaign enemy AI is unchanged.

**In this build — verification and docs**
- Tutorial e2e for levels 1–3 on a fresh save (`239cb9c`, checklist R1 done); continue e2e pinned to level 15 seed 2 (`2c2c511`); hostile-save, i18n-key and rollover unit tests, layers + lazy e2e (`f0d7903`); `maxedModifiers()` helper pinned to the catalog (`1304498`). 620 unit tests, 71 e2e.
- Store frame 06 re-rendered on the current level 9 map, showing the under-fire badge (`50041a4`, PUB-8). GDD brought in line with the shipped game — §2.7 modifiers, §3 band table from the JSON, §7 daily (`aaa48b1`, DOCS-2). The hosted `public/privacy.html` now lists "language" instead of the removed "send ratio" in both languages (checklist R4 closed; policy version stays 2.1).

**Planned for 1.0.1 (not in this build — do not list in "What's new")**
- **10 new Grand Campaign levels (41–50, band 5)** — GDD §3 "Band 5" (LV-9): no new mechanic, three enemies, ≥ 1 bridge and ≥ 1 mine per level, 10–12 towers, aggression 0.6 → 0.9, 3★ clocks 25–50 s, a free update that unlocks when level 40 has a star; band-5 full-3★ bonus 20 crystals, 50-level milestone 60 crystals, new achievement "Clear level 50" 10 crystals; **not** in the daily pool (`POOL_TO` stays 40; the pool grows only in a later release-day commit with the GDD §3 five-step acceptance). Draft JSON in the working tree on 2026-09-20 (status paragraph above). When the pack is committed, in the manifest and through its gates (`--seeds 20` ≥ 95 % with the idle player never winning, every twist ≥ 4/5, `--upgrades max` median ≤ 2.5★, names and lessons in all four languages): `STORE_LISTING.md` bumps every "40 levels" claim to 50 (TODO line at its top), the README follows, and the 1.0.1 what's-new leads with "10 new Grand Campaign levels".
- **Weekly challenge** (GDD §8, proposed 2026-09-20, WEEKLY-1, not implemented): one fixed match per ISO week keyed by the UTC Monday, pool 33 … `POOL_TO`, always one of the four non-plain twists, 100 gold on the first win and 20 crystals once for beating the level's 3★ clock, a week streak, a WEEKLY tab on the daily card, unlock after level 32 — 1.1 candidate, `POST_LAUNCH.md` §6.2.
- "(00:00 UTC)" in the daily card's countdown (`daily.newIn` / `daily.newInTime`, GDD §7.4) — in the Frontend Engineer's working tree on 2026-09-20, uncommitted; moves to "In this build" the day it is committed. The day-30 question is closed: the milestone pays once per streak run, no repeat at 60 / 90 (GDD §7.2 "Day 30", DAILY-3, 2026-09-20) — nothing to ship.

**Not in this build (needs the stakeholder)**
- Real RevenueCat / AdMob keys, store products, sandbox purchases (ECON-1, Phase B); real-device pass (QA-2, MM-1); signed release builds (MM-3); `app-ads.txt` at a site root (ECON-8).
- Localised AZ/RU/TR App Store screenshot sets (Apple sets are EN only, by design); frames from levels 17+ (PUB-6).

Still true on every build: no accounts, no analytics. The web/PWA build makes no network calls after loading and never asks for payment — its shop runs on the demo "Test store". `README.md`, `package.json` and the native projects say 0.4.0 / build 4 until the bump above.

### Azərbaycanca

Tower Clash 1.0 = "Axınlar yeniləməsi" (v0.4.0) + bir həftəlik məzmun və möhkəmləndirmə: seriya mükafatlı Günlük Çağırış, dörd siluet görünüşü, 2-ci səviyyədə "atəş altında" dərsi, günlük hovuz hər fənd altında dayanıqlı olsun deyə on səviyyənin yenidən tənzimlənməsi və üç kanvasda çəkən renderer. v0.4.0-dan bəri qaydalarda heç nə dəyişməyib.

**Bu build-də — Günlük Çağırış (GDD §7)**
- Hər UTC günü üçün bütün oyunçulara eyni bir döyüş (`d54ae6e`, `01f3701`, `41c64c0`): 9–40 arası bir səviyyə, sabit seed və beş fənddən biri — Klassik, Az ərzaq (−10 % istehsal), Sürətli addım (+25 % yürüş sürəti), Nazik divarlar (−20 % tutum), Möhkəmləndirilmiş (başlanğıcda hər qüllədə +5 əsgər). Səviyyə xəritəsinin başında kart: 00:00 UTC-yə geri sayım, seriya və bugünkü ən yaxşı nəticə; 8-ci səviyyədən sonra açılır.
- Günün ilk qələbəsi 30 + 10 × ulduz qızıl və 5 kristal verir; təkrar cəhdlər pulsuz və limitsiz; hamı eyni döyüşü oynasın deyə gündəlikdə Komandir təkmilləşdirmələri, gücləndiricilər, Əlavə qüvvə, səviyyə keçmə və ×2 qızıl reklamı söndürülür. Kampaniya irəliləyişinə toxunulmur (ayrıca `save.challenge` dəftəri).
- **Seriya mükafatları** (`d14e358`, DAILY-2; ECONOMY.md §6.2): seriyanı 3 / 7 / 30-cu günə çatdıran ilk qələbə hər seriya üçün bir dəfə +5 / +20 / +100 kristal verir; kart növbəti bonusu göstərir ("Seriya 2 · 3-cü gündə +5"), nəticə sətri kristal cəmini, bildiriş bonusun adını.
- UTC gecə yarısından sonra RETRY və pauza menyusundakı yenidən başlatma dünənki çağırışı təkrarlamır: səviyyə xəritəsi "Yeni günlük çağırış hazırdır" bildirişi ilə açılır (`30bab54`, BUG-9).
- Çıxmazdan əvvəl yoxlanılır: `npm run playtest -- --daily <gün> --days N --seeds K` və `-- --twist <id>` (`1323695`, `288618f`); CI hər push-da gündəlik (30 gün × 3 seed) və fənd (5 × 32 × 5) qapılarını işlədir (`1304498`).

**Bu build-də — səviyyələr**
- **Günlük hovuz üçün səviyyə keçidi** (`6ea495d`, `b52491d`, `c2353a1`, `d3981e6`, `dad05b8`): **10, 13, 15, 16, 19, 20, 27, 31, 34 və 38**-ci səviyyələr hər fənd altında dayanıqlı olsun deyə yenidən tənzimlənib — 50 seed-də heç bir hovuz səviyyəsi heç bir fənddə 47/50-dən aşağı deyil; 60 günlük gündəlik yoxlama 60/60 gün, 300/300 oyun. Dərslər, adlar, xarakterlər və ulduz vaxtları dəyişməyib (adi fənddə median vaxtlar < 10 % dəyişib).
- **"Atəş altında" dərsi** (`1750354`, LV-5): 2-ci səviyyə "Supply Line" indi atəş altındakı qüllənin əsgər yığa bilmədiyini öyrədir — hər qırmızı axına cavab ver (EN/AZ/RU/TR).

**Bu build-də — görünüşlər**
- Dörd **siluet görünüşü** (`ccfa9fe`, M3-2), Görünüşlər tabında kristalla alınır və mağazada önizlənir: iki qüllə silueti — **Dairəvi qala** (150) və **Gözətçi qülləsi** (200) — və iki əsgər silueti — **Qalxan daşıyanlar** (120) və **Mexaniki robotlar** (150). Bütün binanı / əsgəri əvəz edir, amma səviyyə silueti (L1 / L2 / L3) oxunaqlı qalır; komanda rəngləri və oxunaqlılıq qaydaları dəyişməyib. İndi cəmi 21 görünüş (7 dam, 7 dəbilqə, 3 relyef mövzusu, 4 siluet). Çəkən kod gecikmə ilə yüklənən hissədədir, ona görə ilk yükləmə böyüməyib.

**Bu build-də — çəkilmə və yüklənmə**
- **Üç üst-üstə kanvas** (`03f62eb`, PERF-3): torpaq (hər səviyyədə bir dəfə), oyun (hər kadrda), HUD (yalnız dəyişəndə). Headless ölçmə, CPU 4×, 40-cı səviyyə: kadr medianı 133 → 67 ms, tapşırıq vaxtı −37 %, piksel fərqi < 0.1 %.
- **DPR limiti** (`ed9f8bf`, MM-4): native 2 / veb 2.5 (`?dprcap=N` ilə dəyişdirilir); iPhone sinfi kanvas yaddaşı 33.9 → 15.1 MB. Limit 2-də mətn yalnız 3× böyütmədə bir cihaz pikseli yumşaqdır.
- **Gecikmə ilə yüklənən hissələrin bərpası** (`30bab54`, BUG-8): bir dəfə yüklənməyən səviyyə, görünüş və ya ekran hissəsi növbəti toxunuşda təzə ünvanla yenidən istənilir və ekran "Yüklənmədi — bağlantını yoxla" göstərir; davamlı yüklənməyən hissə sessiyada bir dəfə, yalnız baş ekrandan / xəritədən səhifəni yeniləyir. Eyni ölçülü resize artıq pauza / nəticə / xəritə üstündə köhnə HUD qatı qoymur (`f0d7903`).

**Bu build-də — süni intellekt**
- İstinad botu (`3b66c42` AI-3, `288618f` AI-4): boşalmış mənbədən gələn axına cavab verir (axın ehtiyatı); dolu qüllə tək partlayışda hücumunu saxlayıb yana təchizat verir. Hər səviyyəni və hər gündəliyi yoxlayan bot; kampaniyanın düşmən süni intellekti dəyişməyib.

**Bu build-də — yoxlama və sənədlər**
- Təzə save ilə 1–3-cü səviyyələrin təlimat e2e-si (`239cb9c`, siyahı R1 bitib); davam e2e-si 15-ci səviyyə seed 2-yə bağlanıb (`2c2c511`); zərərli save, tərcümə açarı və gün keçidi unit testləri, qat + gecikmə e2e-ləri (`f0d7903`); `maxedModifiers()` köməkçisi kataloqa bağlanıb (`1304498`). 620 unit test, 71 e2e.
- Mağaza kadrı 06 cari 9-cu səviyyə xəritəsində yenidən çəkilib, "atəş altında" nişanı görünür (`50041a4`, PUB-8). GDD çıxan oyunla uyğunlaşdırılıb — §2.7 modifikatorlar, §3 band cədvəli JSON-dan, §7 gündəlik (`aaa48b1`, DOCS-2). Yerləşdirilən `public/privacy.html` hər iki dildə silinmiş "göndərmə nisbəti" əvəzinə "dil" göstərir (siyahı R4 bağlanıb; siyasət versiyası 2.1 qalır).

**1.0.1 üçün planlaşdırılır (bu build-də yoxdur — "Yeniliklər" mətninə yazma)**
- **10 yeni Böyük Kampaniya səviyyəsi (41–50, 5-ci band)** — GDD §3 "Band 5" (LV-9): yeni mexanika yoxdur, üç rəqib, hər səviyyədə ≥ 1 körpü və ≥ 1 mina, 10–12 qüllə, aqressiya 0.6 → 0.9, 3★ vaxtları 25–50 s, 40-cı səviyyədə ulduz olanda açılan pulsuz yeniləmə; 5-ci bandın tam 3★ bonusu 20 kristal, 50 səviyyə mərhələsi 60 kristal, yeni nailiyyət "50-ci səviyyəni keç" 10 kristal; günlük hovuzda **deyil** (`POOL_TO` 40 qalır; hovuz yalnız sonrakı buraxılış günündə, GDD §3-ün beş addımlıq qəbulu ilə böyüyür). 2026-09-20-də qaralama JSON-lar işçi ağacdadır: `manifest.ts`-də yoxdur (oyun onları yükləyə bilmir), `npm run levels:check` hələ "40 valid" deyir, AZ/RU/TR adlar yoxdur, ulduz vaxtları 40 / 80 s yer tutucudur. Paket commit olunub, manifestə düşüb, qapılardan keçəndə (`--seeds 20` ≥ 95 %, hər fənddə ≥ 4/5, `--upgrades max` median ≤ 2.5★, dörd dildə ad və dərs): `STORE_LISTING.md`-də hər "40 səviyyə" iddiası 50-yə qaldırılır (faylın başındakı TODO sətri), README ardınca, 1.0.1 "Yeniliklər" mətni "10 yeni Böyük Kampaniya səviyyəsi" ilə başlayır.
- **Həftəlik çağırış** (GDD §8, 2026-09-20 təklifi, WEEKLY-1, hələ yazılmayıb): UTC bazar ertəsi ilə açarlanan həftədə bir sabit döyüş, hovuz 33 … `POOL_TO`, həmişə dörd qeyri-adi fənddən biri, ilk qələbəyə 100 qızıl və səviyyənin 3★ vaxtını keçəndə bir dəfə 20 kristal, həftə seriyası, günlük kartda WEEKLY tabı, 32-ci səviyyədən sonra açılır — 1.1 namizədi, `POST_LAUNCH.md` §6.2.
- Günlük kartın geri sayımında "(00:00 UTC)" (`daily.newIn` / `daily.newInTime`, GDD §7.4) — 2026-09-20-də Frontend mühəndisinin işçi ağacında, commit olunmayıb; commit olunan gün "Bu build-də"yə keçir. 30-cu gün sualı bağlanıb: mükafat hər seriyada bir dəfə verilir, 60 / 90-da təkrar yoxdur (GDD §7.2 "Day 30", DAILY-3, 2026-09-20) — çıxarılacaq bir şey yoxdur.

**Bu build-də yoxdur (tərəf-müqabil lazımdır)**
- Real RevenueCat / AdMob açarları, mağaza məhsulları, sandbox alışları (ECON-1, B mərhələsi); real telefonda yoxlama (QA-2, MM-1); imzalanmış release build-lər (MM-3); sayt kökündə `app-ads.txt` (ECON-8).
- App Store üçün AZ/RU/TR skrinşot dəstləri (Apple dəstləri qəsdən yalnız EN-dir); 17+ səviyyələrdən kadrlar (PUB-6).

Hər build-də dəyişməyən: hesab və analitika yoxdur. Veb/PWA build yükləndikdən sonra şəbəkə sorğusu göndərmir və heç vaxt ödəniş istəmir — mağazası demo "Test store" üzərində işləyir. Yuxarıdakı bump-a qədər `README.md`, `package.json` və native layihələr 0.4.0 / build 4 göstərir.

---

## v0.4.0 — 2026-09-17 "Streams update" (ready to tag)

Proposed tag: `tower-clash-v0.4.0` (on branch `claude/tower-war-game-plan-weqwpb`), to be created by the Producer (from the GitHub UI — the git proxy accepts pushes to the working branch, not tags) on the commit that carries this section and the version bump. Native versions at this tag: Android `versionName "0.4.0"` / `versionCode 4`, iOS `MARKETING_VERSION 0.4.0` / `CURRENT_PROJECT_VERSION 4` — written by `npm run version:sync` on 2026-09-17 from `package.json` (`0.4.0`, `config.buildNumber` 4); `npm run version:check` passes. The web build is still the only public channel (GitHub Pages, checklist W3, remains a stakeholder switch); the store builds stay "v1.0 native".

**Status on 2026-09-17 (Publisher check of the tree against `docs/BACKLOG.md` "Done" and `docs/GDD.md` §2.0).** The rules change is in three commits: `4bb3944` (sim + AI + UI + render: auto-upgrade, persistent streams, per-level stream limits, tutorial rewritten), `8e53c03` (all 40 levels retuned for rules v2; the commit reports `npm run playtest` at 40/40 levels won on 20/20 seeds, median 2★, max-upgrades gate median 2.0★) and `2d8cb24` (levels lazy-load). Also in the tree since v0.3.0: `9e45fc9` (in-game languages EN/AZ/RU/TR, lazy-loaded menu screens, bridge-aware reference AI). Landed later the same day and part of this build: `3e4a388` — **rules v2.1 "Under fire"** (sim + AI + render; 28 new unit tests), `235def1` — **level names and lessons in AZ/RU/TR** (I18N-2) and `577b894` — the **store screenshots retaken** under rules v2. Not in this build: the level 2 lesson line and re-measured star clocks that GDD §2.0 asks for after v2.1 (`3e4a388` touches no level file). A save from v0.3.0 keeps working (schema stays v3; the old `sendRatio` field is ignored).

**Store "What's new" (≤ 500 characters each, counted with `node -e` on 2026-09-17; use the language that matches the listing locale — Google Play has EN + AZ listings, RU/TR are ready for the day a listing in those locales exists).**

EN (489):
```
Streams update. Attacks are now streams: tap your tower, tap a target, and soldiers keep flowing until you tap the target again. Towers upgrade by themselves when they fill (25 → L2, 50 → L3, 100 max); a L1/L2/L3 tower runs 1/2/3 streams. A tower under attack stops recruiting — answer every enemy stream, drawn in its colour. All 40 levels retuned, new tutorial, menus and level names in English, Azerbaijani, Russian and Turkish, faster first load. Still no account, still plays offline.
```
AZ (485):
```
Axınlar yeniləməsi. Hücumlar indi axındır: öz qüllənə vur, hədəfə vur — əsgərlər sən hədəfə yenidən vurana qədər axır. Qüllələr dolanda özləri təkmilləşir (25 → L2, 50 → L3, maksimum 100); L1/L2/L3 qüllə 1/2/3 axın aparır. Hücum altındakı qüllə əsgər yığmır — öz rəngində çəkilən hər düşmən axınına cavab ver. Bütün 40 səviyyə yenidən tənzimlənib, yeni təlimat, menyular və səviyyə adları azərbaycanca, ingiliscə, rusca və türkcə, daha sürətli ilk yüklənmə. Yenə hesabsız, yenə oflayn.
```
RU (497):
```
Обновление «Потоки». Атаки стали потоками: нажми на свою башню, затем на цель — солдаты идут, пока ты не нажмёшь на цель ещё раз. Башни улучшаются сами, когда наполняются (25 → L2, 50 → L3, максимум 100); башня L1/L2/L3 ведёт 1/2/3 потока. Башня под ударом не набирает солдат — отвечай на каждый вражеский поток, он нарисован цветом врага. 40 уровней перенастроены, новое обучение, меню и названия уровней на русском, английском, азербайджанском и турецком, быстрее загрузка. Без аккаунта, офлайн.
```
TR (493):
```
Akışlar güncellemesi. Saldırılar artık akış: kulene dokun, hedefe dokun — askerler sen hedefe tekrar dokunana kadar akar. Kuleler dolunca kendiliğinden yükselir (25 → L2, 50 → L3, en fazla 100); L1/L2/L3 kule 1/2/3 akış yürütür. Saldırı altındaki kule asker toplamaz — kendi renginde çizilen her düşman akışına cevap ver. 40 seviyenin tamamı yeniden ayarlandı, yeni öğretici, menüler ve seviye adları Türkçe, İngilizce, Azerbaycanca ve Rusça, daha hızlı ilk yükleme. Yine hesapsız, çevrimdışı.
```

### English

Tower Clash changes how you fight. Sending is no longer a one-off wave: you open a **stream** between two towers and it keeps flowing until you close it. Towers no longer cost soldiers to upgrade: they **upgrade themselves** when they fill up. Every one of the 40 levels was retuned around these two rules.

**In this build — streams (persistent attacks)**
- Tap your tower, tap a road-connected tower: a stream opens and one soldier leaves every 0.12 s, for as long as the stream stands (newly recruited and newly arrived soldiers leave the same way, so a streaming tower does not grow). Drag from tower to tower does the same.
- Tap the target again to stop the stream; tap the selected tower again to deselect it.
- A **level-1 tower runs 1 stream, level 2 runs 2, level 3 runs 3** (a fortress, max level 2, runs 2). With two or three streams the soldiers are shared round-robin. At the limit the tap is refused with a short shake and the hint "L2 needed for 2 streams".
- A stream ends by itself when its source is lost, when the road is cut, or when it feeds one of your own towers that is already full. It does **not** end on capture: it keeps supplying the tower it just took until you stop it or the tower fills.
- Every active stream is drawn on the road as a ribbon in its owner's colour (blue for you, red / green / yellow for the enemies) with chevrons moving toward the target, so an incoming attack can be read at a glance. HUD: a **STREAMS** pill in the bottom bar and a per-tower stream chip; the SEND 100 % / 50 % toggle and the "send ratio" setting are gone.

**In this build — auto-upgrade**
- Capacity ladder **25 / 50 / 100** for L1 / L2 / L3 (fortress 37 / 75, max L2). When a tower's garrison reaches its capacity it upgrades instantly and keeps its garrison; L3 is the top and stops adding at 100. Artillery and tank factories use the same ladder.
- Tapping a tower to upgrade it is gone — nothing costs soldiers any more. A tower that is streaming does not upgrade: stop the stream, let it fill.
- Production per level unchanged (one soldier every 1.0 / 0.7 / 0.5 s); the Commander "capacity" upgrade still multiplies the ladder.
- Tower sprites now show the level: a small tower at L1, a taller two-storey tower with a banner at L2, a keep with double roof and battlements at L3.

**In this build — under fire (rules v2.1)**
- A tower that is being hit stops recruiting: every hostile soldier that lands pauses the target's production for 1.5 s, so a sustained enemy stream now takes any tower unless you answer it (reinforce it, or hit the attacker's emptied source) — no more all-level-3 stalemates. While it lasts the count badge turns peach with a crossed-swords pip and each landing draws a small impact ring. The enemy AI and the reference bot plan around it (`3e4a388`).

**In this build — levels and tutorial**
- All 40 levels retuned for the new rules (`8e53c03`): decisive openings instead of knife-edge symmetry (keeps start at L2 on 23 / 30 / 34 / 35 / 36; bigger neutrals on 11 / 29 / 33; smaller enemy garrisons or aggression on 5 / 12 / 15 / 20 / 31; two extra roads on 40 "The Crown"). Star clocks refit on 31 levels; every lesson line rewritten for streams and fill-to-upgrade.
- Tutorial on levels 1–3 rewritten: level 1 "Tap your tower" → "Now tap the grey tower — the stream keeps flowing"; level 2 "Tap your tower, then the grey tower" → "Tap the target again to stop the stream"; level 3 "Let a tower fill to 25 to upgrade it — L2 can attack 2 targets". Level 1 is "First Taps", level 2 "Supply Line", level 3 "Free Real Estate".
- Enemy AI (rusher, turtle, opportunist) and the reference bot play the stream model with a threat model (pending streams, inflow, landings); the reference bot also cuts bridges when that strands an enemy column.

**In this build — languages, loading**
- In-game **languages: English, Azerbaijani, Russian, Turkish** — menus, hints, tutorial and messages; picker in Settings ("Language") and a language chip on the title screen. Level names and lesson lines are translated too (`235def1`, I18N-2): every one of the 40 levels carries `name_az/ru/tr` and `lesson_az/ru/tr`, used by the HUD, the level map, the shop, achievements and toasts, with English as the fallback; skin, achievement and upgrade labels are localised in the same commit.
- Levels load on demand (`2d8cb24`) and the shop / achievements / settings / level-map screens load lazily: the first download is smaller (eager bundle 80.5 → 73.7 kB gzip) and a level shows the existing loading spinner for the instant it needs; the current and next levels are preloaded.

**In this build — publishing**
- Version 0.4.0 / build 4 in `package.json`, Android and iOS (`npm run version:sync`). Store listing and README rewritten for streams and auto-upgrade, with one line for "under fire". Store screenshots retaken under rules v2 (`577b894`, Tech Artist): 8 frames EN + AZ for Google Play (title, tutorial, streams in both colours, a tower upgrading, the limit hint, fortress, result, shop Upgrades), 9 for the App Store 6.7" / 6.5" sets (level 15 extra), feature graphic and IAP review frame re-rendered — `STORE_LISTING.md` §1.3. Privacy policy unchanged (v2.1): the game stores the same things in the same place; its Part A list of saved settings now says "language" instead of the removed "send ratio" (wording only, no version bump; the hosted `public/privacy.html` still needs the same one-word edit).

**Not in this build (do not list in "What's new")**
- The level 2 lesson line "a tower under fire cannot recruit" and the re-measured star clocks that GDD §2.0 asks for after v2.1 (Level Designer; `3e4a388` changes no level file).
- Real RevenueCat / AdMob keys, store products, sandbox purchases (ECON-1, Phase B); real-device pass (QA-2, MM-1); signed release builds (MM-3).
- Localised AZ/RU/TR store screenshot sets with the game's UI in those languages (PUB-7); frames from levels 17+ (PUB-6).

Still true on every build: no accounts, no analytics. The web/PWA build makes no network calls after loading and never asks for payment — its shop runs on the demo "Test store". `README.md`, `package.json` and the native projects all say 0.4.0 / build 4.

### Azərbaycanca

Tower Clash-də döyüş üsulu dəyişir. Göndərmə artıq birdəfəlik dalğa deyil: iki qüllə arasında **axın** açırsan və sən bağlayana qədər axır. Qüllələr təkmilləşmək üçün əsgər xərcləmir: dolanda **özləri təkmilləşir**. 40 səviyyənin hamısı bu iki qaydaya görə yenidən tənzimlənib.

**Bu build-də — axınlar (davamlı hücumlar)**
- Öz qüllənə vur, yolla bağlı qülləyə vur: axın açılır və axın durduqca hər 0.12 saniyədə bir əsgər yola düşür (yeni istehsal olunan və yeni gələn əsgərlər də eyni cür gedir, ona görə axın verən qüllə böyümür). Qüllədən qülləyə sürükləmək də eyni işi görür.
- Axını dayandırmaq üçün hədəfə yenidən vur; seçimi ləğv etmək üçün seçilmiş qülləyə yenidən vur.
- **1-ci səviyyə qüllə 1 axın, 2-ci səviyyə 2, 3-cü səviyyə 3 axın aparır** (qala, maksimum L2, 2 axın). İki-üç axında əsgərlər növbə ilə bölünür. Limitdə toxunuş qısa silkələnmə və "2 axın üçün L2 lazımdır" işarəsi ilə rədd edilir.
- Axın mənbə itəndə, yol kəsiləndə və ya artıq dolu olan öz qüllənə gedəndə özü bitir. Tutmada **bitmir**: sən dayandırana və ya qüllə dolana qədər yeni tutduğu qülləni təchiz etməyə davam edir.
- Hər aktiv axın yolun üstündə sahibinin rəngində lent kimi çəkilir (sən mavi, rəqiblər qırmızı / yaşıl / sarı), hədəfə doğru hərəkət edən oxlarla — gələn hücum bir baxışda oxunur. HUD: aşağı zolaqda **AXINLAR** nişanı və hər qüllədə axın çipi; SEND 100 % / 50 % düyməsi və "göndərmə nisbəti" parametri silinib.

**Bu build-də — avtomatik təkmilləşdirmə**
- Tutum pilləsi L1 / L2 / L3 üçün **25 / 50 / 100** (qala 37 / 75, maksimum L2). Qarnizon tutuma çatanda qüllə dərhal təkmilləşir və qarnizonunu saxlayır; L3 sondur və 100-də dayanır. Toplar və tank zavodları eyni pillədən istifadə edir.
- Təkmilləşdirmək üçün qülləyə toxunmaq yoxdur — artıq heç nə əsgər tələb etmir. Axın verən qüllə təkmilləşmir: axını dayandır, dolmasına imkan ver.
- Səviyyəyə görə istehsal dəyişməyib (hər 1.0 / 0.7 / 0.5 saniyədə bir əsgər); Komandirin "tutum" təkmilləşdirməsi pilləni yenə də çoxaldır.
- Qüllə spraytları indi səviyyəni göstərir: L1-də kiçik qüllə, L2-də bayraqlı ikimərtəbəli hündür qüllə, L3-də ikiqat damlı və dişli divarlı qala.

**Bu build-də — atəş altında (qaydalar v2.1)**
- Vurulan qüllə əsgər yığmır: hər enən düşmən əsgəri hədəfin istehsalını 1.5 saniyə dayandırır, ona görə davamlı düşmən axını cavab verməsən istənilən qülləni gec-tez alır (qülləni gücləndir və ya hücumçunun boşalmış mənbəyini vur) — hamı-L3 durğunluğu bitir. Bu müddətdə say nişanı şaftalı rəngə keçir və üstündə çarpaz qılınc işarəsi görünür, hər enmə kiçik zərbə halqası çəkir. Düşmən süni intellekti və istinad botu bunu nəzərə alaraq plan qurur (`3e4a388`).

**Bu build-də — səviyyələr və təlimat**
- 40 səviyyənin hamısı yeni qaydalara görə tənzimlənib (`8e53c03`): bıçaq kəsiyi simmetriya əvəzinə qəti açılışlar (23 / 30 / 34 / 35 / 36-da qalalar L2-dən başlayır; 11 / 29 / 33-də daha böyük neytrallar; 5 / 12 / 15 / 20 / 31-də daha kiçik düşmən qarnizonu və ya aqressiyası; 40 "The Crown"-da iki əlavə yol). 31 səviyyədə ulduz vaxtları yenidən hesablanıb; hər dərs cümləsi axınlar və dolub-təkmilləşmə üçün yenidən yazılıb.
- 1–3-cü səviyyələrin təlimatı yenidən yazılıb: 1-ci səviyyə "Öz qüllənə vur" → "İndi boz qülləyə vur — axın davam edir"; 2-ci səviyyə "Öz qüllənə, sonra boz qülləyə vur" → "Axını dayandırmaq üçün hədəfə yenidən vur"; 3-cü səviyyə "Qüllə 25-ə dolsun ki, təkmilləşsin — L2 2 hədəfə hücum edə bilər". 1-ci səviyyə "First Taps", 2-ci "Supply Line", 3-cü "Free Real Estate".
- Düşmən süni intellekti (hücumçu, tısbağa, fürsətçi) və istinad botu axın modeli ilə oynayır (gözləyən axınlar, daxil olan axın, enmələr); istinad botu düşmən kolonunu ilişdirmək üçün körpü də kəsir.

**Bu build-də — dillər, yüklənmə**
- Oyundaxili **dillər: ingiliscə, azərbaycanca, rusca, türkcə** — menyular, işarələr, təlimat və mesajlar; seçim Parametrlər → "Dil"-də və baş ekrandakı dil çipində. Səviyyə adları və dərs cümlələri də tərcümə olunub (`235def1`, I18N-2): 40 səviyyənin hər birində `name_az/ru/tr` və `lesson_az/ru/tr` var; HUD, səviyyə xəritəsi, mağaza, nailiyyətlər və bildirişlər onları istifadə edir, ingiliscə ehtiyat kimi qalır; görünüş, nailiyyət və təkmilləşdirmə adları da eyni commit-də lokallaşdırılıb.
- Səviyyələr lazım olanda yüklənir (`2d8cb24`), mağaza / nailiyyətlər / parametrlər / səviyyə xəritəsi ekranları gecikmə ilə yüklənir: ilk yükləmə kiçikdir (əsas paket 80.5 → 73.7 kB gzip), səviyyə açılanda mövcud yüklənmə göstəricisi bir anlıq görünür; cari və növbəti səviyyə əvvəlcədən yüklənir.

**Bu build-də — nəşr**
- `package.json`, Android və iOS-da versiya 0.4.0 / build 4 (`npm run version:sync`). Mağaza mətni və README axınlar və avtomatik təkmilləşdirmə üçün yenidən yazılıb, "atəş altında" üçün bir cümlə əlavə olunub. Mağaza skrinşotları v2 qaydaları ilə yenidən çəkilib (`577b894`, Texniki rəssam): Google Play üçün 8 kadr EN + AZ (baş ekran, təlimat, iki rəngdə axınlar, təkmilləşən qüllə, limit işarəsi, qala, nəticə, mağaza Təkmilləşdirmələr), App Store 6.7" / 6.5" dəstləri üçün 9 (əlavə 15-ci səviyyə), feature graphic və IAP baxış kadrı da yenidən render olunub — `STORE_LISTING.md` §1.3. Məxfilik siyasəti dəyişməyib (v2.1): oyun eyni şeyləri eyni yerdə saxlayır; A hissəsindəki saxlanan parametrlər siyahısında silinmiş "göndərmə nisbəti" əvəzinə indi "dil" yazılıb (yalnız ifadə, versiya dəyişmir; yerləşdirilən `public/privacy.html`-də eyni bir sözlük düzəliş hələ gözləyir).

**Bu build-də yoxdur ("Yeniliklər" mətninə yazma)**
- GDD §2.0-ın v2.1-dən sonra istədiyi 2-ci səviyyə dərs cümləsi "atəş altındakı qüllə əsgər yığa bilməz" və yenidən ölçülmüş ulduz vaxtları (Səviyyə dizayneri; `3e4a388` heç bir səviyyə faylını dəyişmir).
- Real RevenueCat / AdMob açarları, mağaza məhsulları, sandbox alışları (ECON-1, B mərhələsi); real telefonda yoxlama (QA-2, MM-1); imzalanmış release build-lər (MM-3).
- Oyun interfeysi azərbaycanca/rusca/türkcə olan mağaza skrinşot dəstləri (PUB-7); 17+ səviyyələrdən kadrlar (PUB-6).

Hər build-də dəyişməyən: hesab və analitika yoxdur. Veb/PWA build yükləndikdən sonra şəbəkə sorğusu göndərmir və heç vaxt ödəniş istəmir — mağazası demo "Test store" üzərində işləyir. `README.md`, `package.json` və native layihələr 0.4.0 / build 4 göstərir.

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
