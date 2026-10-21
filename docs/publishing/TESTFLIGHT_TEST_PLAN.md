# TestFlight test plan — Tower Clash 1.0.0 (21) on the stakeholder's iPhone (QA-12, updated QA-25, PUB-26, PUB-27, PUB-29, PUB-30)

Owner: QA Engineer · written 2026-10-02 against branch head `e237f06` (build 7) · **updated 2026-10-14 for build 15 (QA-25)**: the swipe-to-cut and drag line (BUG-33, BUG-35), full-bleed screens (BUG-34), HUD-press fixes (BUG-36–38), soldiers that stand out (BUG-39), supply lines (RELAY-1), walking soldiers (ART-20), title island on tall phones (FE-12), light and combat effects (ART-23) and the zoomed top-down view (ART-24). **Updated 2026-10-18 for build 18 (PUB-26, Publisher, against `4b3947e`):** Settings → Team colours (FE-14, TF-27), the rebuilt tutorial of levels 2–4 and the reworded lesson cards of levels 2 and 4 (GD-5a/b/e, TF-28; TF-08 / TF-09 rewritten around it), the tighter 2★ clocks of levels 2 / 4 / 5 / 6 / 7 (GD-5g, section 0 item 10), the daily table from 2026-10-18 and the "known" list (BUG-42/43/44 fixed in build 16; GD-5c/d open). **Updated 2026-10-19 for build 19 (PUB-27, Publisher, against `e9eecff`):** tutorial bubbles kept off every tower and the select line off the selected tower (GD-5c/d), the tutorial's own selection on levels 2–4 (BUG-50/51) — TF-28's "which of these happened" notes are now "must not happen" checks; **TF-29** the How to Play card with six rules (swipe, supply line) fitting the screen in AZ, and the one-time supply-line hint (GD-5f); the reworded lesson cards of levels 6–10 and the 2★ clocks of 9 / 10 (GD-6; section 0 items 10–11, TF-12, TF-13); the daily table from 2026-10-19; the "known" list (GD-5c/d, BUG-50/51/52 fixed in build 19). **Updated 2026-10-20 for build 20 (PUB-29, Publisher, against `d4810f6` + the level designer's GD-7 card edits):** the shorter 2★ clocks of levels 11–16 (GD-6f rest; section 0 item 10) and the rewritten lesson cards of levels 5, 7, 11, 13, 14, 16 (GD-7a/b/c/d/e/g; section 0 item 11 — "follow the card literally; say whether you won and with how many stars", the GD-7 acceptance), the level 7 question now "did you start on the right as the card says?", the daily table from 2026-10-20; no new check (still 29). **Updated 2026-10-21 for build 21 (PUB-30, Publisher, against `501e8c8` + the level designer's LV-22 layout):** level 5's four grey towers moved (LV-22: the two on each side now stand on the line to the far tower, so a left start must not lose any more; section 0 item 11, TF-12), the level 3 note of section 0 item 9 (GD-7h's tutorial fallback has been in since build 20), the daily table from 2026-10-21; no new check (still 29). First real-device pass for **QA-2** (iOS half) and **MM-1 for iOS**, plus the on-device halves of **MM-4** (memory / DPR cap) and **M3-5** (performance), and the device confirmation of the build 9–21 changes.
Build: **1.0.0 (21) or later** from the `tower-clash-ios-release` workflow, lane **testflight**. 1.0.0 has **no in-app purchases** (they come with 1.0.1 under the next free build number), so the shop is in the store-unavailable state (LAUNCH_CHECKLIST §0b variant B, PUB-14). Ads: since build 8 the iOS lane carries the real AdMob ids — a full-screen ad between levels may be a Google "Test Ad" or a real ad; both are fine on TestFlight, **never tap the ad itself**, close it with ×.
Checks: **29** (TF-01 … TF-29; TF-20 share sheet added 2026-10-05, TF-21 rating prompt off 2026-10-08 (PUB-16), TF-22 … TF-26 added 2026-10-14 for build 15, TF-27 / TF-28 added 2026-10-18 for build 18 (PUB-26), TF-29 added 2026-10-19 for build 19 (PUB-27)). **Which build:** TestFlight shows the number under the app name — it must be **21 or higher**. On an older build stop and write `old build N` in the chat: level 5's new layout (section 0 item 11, TF-12) needs build 21, the lesson cards of 5, 7, 11, 13, 14, 16 and the 2★ clocks of 11–16 (section 0 items 10–11, TF-12, TF-13) need build 20, the tutorial fixes, the six-rule How to Play card, the supply-line hint and the new lesson cards of 6–10 (TF-28, TF-29, TF-16 step 4, TF-12, TF-13) need build 19, team colours and the level 2–4 tutorial (TF-27, TF-28, the TF-08 / TF-09 wording) build 18, the zoomed view (TF-05, TF-09, TF-24) needs build 15, effects and light (TF-25) build 14, walking soldiers and the title island (TF-24, TF-26) build 13, supply lines (TF-22) build 11, the drag line (TF-23) build 10, swipe-to-cut (TF-08, TF-23) build 9.
Install path: LAUNCH_CHECKLIST.md §0b, the optional TestFlight note at its end (the team uploads the build by committing `tower-clash/release/ios-release.request`, MM-12). Severities: POST_LAUNCH.md §5.1. Day boundary: GDD §7.4 (00:00 UTC = **04:00 Baku**).

The Azerbaijani part comes first; the English mirror (same ids, same order) follows it.

---

## AZ — iPhone-da TestFlight yoxlaması (≈ 60 dəqiqə)

### 0. Başlamazdan əvvəl (2 dəq)

1. iPhone modelini və iOS versiyasını yaz: **Ayarlar → Ümumi → Haqqında** (*Model adı*, *iOS versiyası*). TestFlight-da tətbiqin adının altındakı build nömrəsini də yaz — **21 və ya daha böyük** olmalıdır (kiçikdirsə dayan və çata `köhnə build N` yaz). Hesabatın ilk sətri bu olacaq.
2. Batareya ≥ 50 %, **Aşağı enerji rejimi söndürülü** olsun (batareya ikonu sarı olmamalıdır) — bu rejim oyunu 30 kadra endirir və TF-13-ün nəticəsini korlayır.
3. Səs: yan açar (Ring/Silent) **zəng** rejimində olsun (iPhone 15 Pro və sonrakılarda Action düyməsi ilə səssiz rejim söndürülsün), səs düymələri ilə səsi ucalt. *Səssiz rejimdə oyunun səsi çıxmır — bu iOS-un normal davranışıdır, xəta deyil.*
4. İdarəetmə mərkəzi (sağ yuxarı küncdən aşağı sürüşdür) → **ekran fırlanma kilidi (kilidli dairəvi ox) SÖNDÜRÜLÜ** olsun (TF-04 üçün).
5. Başlama saatını yaz.
6. **Skrinşot:** yan düymə + səs artırma düyməsini eyni anda bas (Home düyməli iPhone-da: Home + yan düymə). Şəkil *Şəkillər* tətbiqinə düşür; çatda adi şəkil kimi əlavə et. **Ekran yazısı** (titrəmə / donma / əsgərlərin yerişi üçün): İdarəetmə mərkəzi → dairəli nöqtə düyməsi → 3 saniyə sonra yazır; dayandırmaq üçün yuxarıdakı qırmızı nişana toxun.
7. **Tətbiq çöksə** və TestFlight "Share additional information?" / "Əlavə məlumat paylaşılsın?" soruşsa: **Share** → şərhə yoxlamanın id-sini yaz (məs. `TF-12`). Sonra çatda da yaz — TestFlight rəyini yalnız sən App Store Connect-də görürsən, komanda görmür.
8. **Vaxt çatmasa**, bu ardıcıllıqla et: TF-01, 28 (səviyyə 1–4; TF-05, 07, 08, 09 də onun içində yoxlanır), 12, 13 (səviyyə 5–10 və 11-ci bəndin dərs kartları), 29, 27, sonra 23, 22, 24, 26, 25, 02, 06, 03, 10, 15, 17, 18. (Əvvəlcə build 21-in, 20-nin, 19-un və 18-in yenilikləri — 5-ci səviyyənin yeni düzülüşü, 5 və 7-nin yeni dərs kartları, düzəldilmiş təlim, altı qaydalı "Necə oynanır" kartı və təchizat xətti ipucu, komanda rəngləri; sonra sənin öz qeydlərinin düzəlişləri — xətti kəsmək, dartma xətti, təchizat xətti, əsgərlər, başlıq adası, yeni görünüş.) Qalanları sonra. **TF-28 irəliləyişi sıfırlayır** (ulduzlar və qızıl silinir, ayarlar qalır) — ona görə sonrakı yoxlamalar yenidən səviyyə 1-dən gedir; bu, yalnız bu test quraşdırmasına aiddir.
9. **Bilinən (yazmağa ehtiyac yoxdur):** build 21 üçün xüsusi bilinən problem yoxdur. Build 21 yalnız 5-ci səviyyədəki dörd boz qüllənin yerini dəyişir (11-ci bənd); başqa görünən dəyişiklik yoxdur. Build 20 11–16-cı səviyyələrin 2★ saatlarını və 5, 7, 11, 13, 14, 16-cı səviyyələrin DƏRS kartlarını dəyişdi (10-cu və 11-ci bəndlər). **Build 20-də düzəldilib:** 3-cü səviyyədə əvvəl **sol** boz qülləni alsan, təlim dərhal yolu göstərir (sol qülləyə gedən axını kəs, sonra hər iki qüllədən sağdakına axıt; ≈ 10 saniyə vaxtın var) — buna əməl edib uduzsan, yaz (GD-7h). TF-28 D yenə sağdan başlayır, onu dəyişmə. **Build 19-da düzəldilib — indi görsən, adi FAIL kimi yaz:** təlim baloncuğu heç bir qüllənin rəqəmini və gövdəsini örtmür; aşağıdakı seçim yazısı ("Axın üçün qülləyə toxun · …") seçilmiş qüllənin üstünə düşmür — lazım olanda (məs. 3-cü səviyyədə) xəritənin yuxarısına, DƏRS kartının altına keçir (GD-5c, GD-5d; TF-28-də yaz). 2-ci səviyyədə "İndi yeni qülləyə, sonra qırmızıya toxun" addımında yeni qülləyə ilk toxunuş onu **seçir**, aşağıdan gələn axını kəsmir (BUG-50); 3-cü səviyyədə "İndi o biri boz qülləni də götür" addımında qüllə titrəmir, "2 axın üçün L2 lazımdır" çıxmır (BUG-51) — TF-28 C və D. BUG-52 (veb versiyanın bir açılışdan sonra internetsiz işləməsi) də düzəldilib, amma iPhone tətbiqinə aid deyil — oyunun faylları tətbiqin içindədir, TF-18 dəyişmir. Əvvəlki bilinən BUG-42 (ən yuxarıdakı qüllənin rəqəmi aşağıdakının arxasında) **build 16-da düzəldilib** — indi görsən, TF-24-də adi FAIL kimi yaz.
10. **2★ saatları (build 18–20):** 2, 4, 5, 6 və 7-ci səviyyələrdə 2 ulduz üçün vaxt 5–10 saniyə qısaldı — nəticə kartında: 2-ci "3 ulduz: 00:20-dək · 2 ulduz: 01:10-dək" (əvvəl 01:15), 4-cü 00:25 / 02:10 (02:15), 5-ci 00:30 / 01:15 (01:20), 6-cı 00:25 / 01:35 (01:40), 7-ci 00:25 / 01:05 (01:15). 3 ulduz saatları dəyişməyib. **Build 19-da** 9 və 10-cu səviyyələrdə də: 9-cu 00:25 / 01:00 (01:05), 10-cu 00:20 / 01:05 (01:10). **Build 20-də** 11–16-cı səviyyələrdə də 5–20 saniyə qısaldı — nəticə kartında "3 ulduz: …-dək · 2 ulduz: …-dək": 11-ci 00:30 / 01:00 (əvvəl 01:10), 12-ci 00:20 / 01:05 (01:10), 13-cü 00:35 / 01:20 (01:25), 14-cü 00:25 / 01:45 (01:55), 15-ci 00:35 / 01:15 (01:35), 16-cı 00:20 / 01:05 (01:15). Heç bir yoxlama müəyyən 2★ vaxtı tələb etmir; bu səviyyələrdə oynanan TF-11, TF-12, TF-13, TF-22, TF-28-də (və 11-ci bəndin 11–16 hissəsində) əvvəlki build-də 2★ verən vaxt indi 1★ ola bilər — **xəta deyil**. TF-07 (səviyyə 1) dəyişmir; TF-21 3★ istəyir, 3★ saatları dəyişməyib.
11. **Dərs kartları (build 19–21):** yuxarıdakı **DƏRS** kartı həqiqətən qazandıran gedişi deyir. **Build 19-da yeni:** 6 "Əvvəl Forpost" — əvvəl evin 25-ə çatsın, sonra hər iki yan qülləni al; 8 "İki Baza" — əvvəl hər baza yaxınındakı boz qülləni alsın, sonra hamısını eyni hədəfə axıt; 9 "Daş Divarlar" — "evin" və "daş halqalı qüllə qaladır"; 10 "Xətti Saxla" — əvvəl yan qüllələr, sonra hər ikisindən neytral qala. **Build 20-də yeni:** 5 "Divarı Dolan" — divarı dolan, **düşmənin yürüdüyü sağdan başla** və əvvəl o tərəfdən irəlilə; 7 "Uzun Yürüş" — uzaq qülləyə birbaşa yürümə, əvvəl yaxın qüllələri al, **düşmənin yürüdüyü sağdan başla** və bazaya addım-addım yaxınlaş; 11 "Qalanı Ac Qoy" — əvvəl **sağdakı**, kazarmanın altındakı boz qülləni, sonra o kazarmanı al; 13 "Çarpaz Atəş" — hər iki yaxın boz qülləni, sonra artilleriya postunu al, sonra düşmənin ön kazarmasını 2-ci səviyyəyə çatmamış vur; 14 "Top və Divar" — topları ilk iş kimi yox: yaxın boz qülləni və ortadakını al, sonra topları birdən beş qüllədən vur; 16 "Son Bastion" — evindən və qalandan yaxın boz qüllələri al, əvvəlcə **sağdakını**; beş qüllə ilə düşərgəni və topları al, sonra hamısını qəsrə yönəlt. **Build 21-də yeni:** 5 "Divarı Dolan" səviyyəsinin xəritəsi dəyişib — hər tərəfdəki iki boz qüllə indi uzaq qülləyə gedən xəttin üstündədir. Kartın dediyi kimi sağdan başla, amma soldan başlayanda da artıq uduzmamalısan — soldan başlayıb uduzsan, mütləq yaz. TF-12 (5–8) və TF-13 (9 və ya 10–12) bu səviyyələrdə oynanır; 13, 14, 16-nı görmək üçün TF-13-dən sonra **NÖVBƏTİ** ilə 16-ya qədər davam et (**×2** olar, ≈ 12 dəq; vaxt çatmasa 11–16 sonraya qala bilər). **5, 7, 11, 13, 14, 16-da kartı oxu və sözbəsöz ona əməl et; qalib gəldinmi və neçə ulduzla — yaz** (kartın dediyi ilə qazanmaq lazımdır — uduzsan, bu məlumat kart üçün vacibdir, mütləq yaz). Kart kəsilməməlidir (ən çox 3 sətir, hamısı oxunur). Kartı başa düşməsən də yaz. 5-də və 7-də əlavə yaz: kartın dediyi kimi **sağdan** başladınmı (5-də soldan başlayıb uduzmusansa, bunu da yaz). Nümunə: `TF-12: 5 — sağdan başladım, qələbə 2★ · 7 — sağdan başladım, qələbə 1★`, `TF-13: 11 — qələbə 2★ · 13 — uduzdum · 14 — qələbə 1★ · 16 — çatmadı`.

Rəng adları: **sənin qüllələrin göy**, düşmən **qırmızı** (çox düşmənli səviyyələrdə həm də **yaşıl** və **sarı**), neytral **boz**. "Çentik / Dynamic Island" = ekranın yuxarısındakı qara kəsik və ya qara "ada"; "ev xətti" = ekranın ən aşağısındakı nazik üfüqi xətt. "Axın" = qüllədən qülləyə uzanan rəngli zolaq, əsgərlər onun üstü ilə yeriyir; "rəqəm" = qüllənin üstündəki ağ lövhədə əsgər sayı.

### Xülasə

| ID | Yoxlama | Dəq | Bağlayır | Alınmasa ciddilik |
|---|---|---|---|---|
| TF-01 | Quraşdırma, yeni ikon və ilk açılış vaxtı | 2 | QA-2 | S1 açılmır / çökür · S2 > 10 s və ya izləmə sorğusu |
| TF-02 | Başlıq ekranı çentikdən və ev xəttindən təmiz, kənarlarda zolaq yoxdur; ilk dil | 1 | MM-1, BUG-34 | S2 · S3 (yalnız dil) |
| TF-03 | Səs ilk toxunuşda başlayır | 1 | MM-1 | S2 |
| TF-04 | Ekran yalnız şaquli (portret) qalır | 0,5 | MM-1 | S2 |
| TF-05 | Səviyyə 1 bir barmaqla + təlim ipucları; böyük qüllələr | 2 | QA-2, ART-24 | S1 keçilmir · S2 |
| TF-06 | Oyun paneli (HUD), DƏRS kartı və FASİLƏ kartı çentikdən təmiz | 1 | MM-1, BUG-34 | S2 |
| TF-07 | Nəticə kartı (QƏLƏBƏ) ev xəttindən təmiz | 0,5 | MM-1 | S2 |
| TF-08 | Səviyyə 2: seçimi ləğv et, zoom yoxdur (təlim və ilk kəsmə — TF-28) | 1 | QA-2, BUG-33 | S2 |
| TF-09 | Səviyyə 3: ən yuxarıdakı qüllənin rəqəmi altda; 25-də qüllə L2 olur | 1 | QA-2, ART-24 | S2 |
| TF-10 | Döyüş zamanı arxa plana çıx: səs kəsilir, oyun fasilədə qalır | 1 | MM-1 | S2 |
| TF-11 | "Axın ilişib" ipucu (səviyyə 2 təkrarı, istəyə bağlı) | 3 | QA-2 | S3 |
| TF-12 | Səviyyə 5–8 ardıcıl + iki dəfə arxa plan (yaddaş / çökmə) | 5 | QA-2, MM-4 | S1 çökmə / döyüşdə reklam · S2 özü başlığa qayıdır |
| TF-13 | Səviyyə 9 (və ya 10–12) ×1 sürətdə: səlistlik, istilik, kəskinlik | 3 | M3-5, MM-4 | S2 daim titrəyir / qızır · S3 arabir |
| TF-14 | GÜNLÜK kart: geri sayım, bugünkü səviyyə, oyun | 2 | QA-2 | S1 açılmır · S2 səhv səviyyə / vaxt |
| TF-15 | Mağaza "mağaza əlçatan deyil" halında | 2 | MM-1, QA-2 | S1 Apple ödəniş pəncərəsi · S2 · S3 mətn |
| TF-16 | Ayarlar: AZ dili, rəng korluğu, az hərəkət, "Necə oynanır", məxfilik | 3 | QA-2 | S2 · S3 |
| TF-17 | Tətbiqi tam bağla, yenidən aç — irəliləyiş qalır | 1 | QA-2 | S1 |
| TF-18 | Təyyarə rejimi: oyun və GÜNLÜK kart işləyir | 2 | QA-2 | S1 açılmır · S2 kart |
| TF-19 | 04:00 (Bakı) günlük dəyişmə (istəyə bağlı) | 3 | QA-2 | S2 |
| TF-20 | PAYLAŞ: nəticə kartı → paylaşma pəncərəsi (WhatsApp / Telegram) | 2 | MM-8 | S2 · S3 şəkil |
| TF-21 | 10+ səviyyədə 3★ qələbədən sonra qiymət (reytinq) pəncərəsi çıxmır | 2 | MM-9 | S3 |
| TF-22 | Təchizat xətti: dolu öz qülləndən əsgərlər irəli keçir | 3 | RELAY-1 | S2 · S3 |
| TF-23 | Axını barmaqla kəsmək və dartma xətti | 2 | BUG-33, BUG-35, BUG-36 | S2 · S3 görünüş |
| TF-24 | Yeriyən əsgərlər öz axınının üstündə seçilir, ayaq tozu | 2 | ART-20, BUG-39, ART-24 | S2 əsgərlər itir · S3 |
| TF-25 | Döyüş effektləri (ələ keçirmə parıltısı, enmə halqası) və işıq | 2 | ART-23 | S2 effektdə ilişmə · S3 |
| TF-26 | Başlıq adası 17 Pro Max ekranını doldurur | 1 | FE-12 | S2 düymə gizlənir · S3 |
| TF-27 | Komanda rəngləri: 4 dəst başlıqda, xəritədə, oyunda, mağazada; yenidən açılışda qalır; rəng korluğu ilə birlikdə | 3 | FE-14 | S2 saxlanmır / ekran köhnə rəngdə · S3 |
| TF-28 | Təlim: səviyyə 1–4 yeni oyunçu kimi, irəliləyiş sıfırlanıb (orta qüllə əvvəl → təchizat xətti addımı; yan qüllə əvvəl → kəsmə) | 10 | GD-5a, GD-5b, GD-5e, GD-5c, GD-5d, BUG-50, BUG-51, QA-2 | S1 təlimə əməl edəndə keçilmir · S2 · S3 |
| TF-29 | "Necə oynanır" kartı: altı qayda (kəsmə və təchizat xətti daxil) AZ-da ekrana sığır; təchizat xəttinin bir dəfəlik ipucu | 3 | GD-5f | S2 kart açılmır / qayda kəsilir · S3 |

Ciddilik (POST_LAUNCH §5.1): **S1** — çökmə, keçilməyən / açılmayan səviyyə, irəliləyişin itməsi, döyüş zamanı və ya 1–5-ci səviyyələrdə reklam → eyni gün düzəliş. **S2** — funksiya bəzi istifadəçilərdə işləmir (dil, cihaz, mağaza) → 2 sessiya ərzində. **S3** — kosmetik, mətn, bir cihaza aid xırda şey → növbəti buraxılış.

### Yoxlamalar

#### TF-01 · Quraşdırma, yeni ikon və ilk açılış vaxtı (2 dəq)
- **Toxun:** TestFlight tətbiqi → **Tower Clash: Tap & Conquer** (App Store adı; ana ekranda ikonun altında Tower Clash yazılır) → **Install** (Quraşdır). Bitəndə **Open** (Aç) düyməsinə toxun və saniyəni saymağa başla — böyük **PLAY / OYNA** düyməli başlıq ekranı görünənə qədər.
- **Gözlənilən:** ana ekranda yeni **"Sunburst"** ikonu — qızılı-kəhrəba şüaların önündə göy damlı gil qala və çarpaz qılınclar (build 9-dan, ART-18); qısa açılış ekranı, sonra ≤ 5 saniyədə başlıq ekranı. **Heç bir sorğu çıxmır**: nə "Tower Clash-ə fəaliyyətinizi izləməyə icazə verilsin?", nə bildiriş icazəsi, nə Google reklam razılığı forması (bu forma yalnız AB / Böyük Britaniyada çıxır).
- **Alınmasa yaz:** `TF-01 FAIL: açılış N s / çökdü / "izləmə" sorğusu çıxdı / köhnə ikon`. Uğurlu olsa da saniyəni yaz: `TF-01 OK 3 s`.
- **Bağlayır:** QA-2 · **Ciddilik:** S1 — açılmır və ya çökür; S2 — 10 saniyədən uzun və ya izləmə sorğusu çıxır; S3 — köhnə ikon.

#### TF-02 · Başlıq ekranı çentikdən və ev xəttindən təmiz; ilk dil (1 dəq)
- **Toxun:** hələ heç nəyə toxunma — yalnız bax. Skrinşot çək.
- **Gözlənilən:** sağ yuxarı küncdəki dil düyməsi (EN / AZ / RU / TR) tam görünür, çentiyin / Dynamic Island-ın altında deyil; ekranın aşağısındakı qızıl / kristal zolağı ev xəttinin üstündədir, kəsilmir. Dəniz və ada ekranın **bütün kənarlarına qədər** çatır — yuxarıda və aşağıda tünd və ya boz zolaq **olmamalıdır** (build 9-dan, BUG-34). Dil: telefonun dili AZ / RU / TR / EN-dirsə, oyun da həmin dildə açılmalıdır.
- **Alınmasa yaz:** `TF-02 FAIL: <nə> çentiyin / ev xəttinin altındadır / yuxarıda-aşağıda zolaq var` və ya `TF-02 dil: oyun EN açıldı, telefon AZ-dır`.
- **Bağlayır:** MM-1, BUG-34 · **Ciddilik:** S2 — düymə / mətn çentiyin və ya ev xəttinin altındadır; S3 — yalnız ilk dil səhvdir (Ayarlardan dəyişmək olur) və ya kənarda zolaq görünür.

#### TF-03 · Səs ilk toxunuşda başlayır (1 dəq)
- **Toxun:** tətbiqdə **ilk toxunuşun** sağ yuxarıdakı dil düyməsi olsun. Mətnlər Azərbaycanca olana qədər toxunmağa davam et (düymədə **AZ**, böyük düymədə **OYNA** yazılır). Sonra **Səs açıq / Səs bağlı** düyməsinə iki dəfə toxun.
- **Gözlənilən:** **elə ilk toxunuşda** qısa "klik" səsi eşidilir, sonrakı hər toxunuşda da. "Səs bağlı" olanda klik yoxdur, "Səs açıq" olanda qayıdır. (Səs ümumiyyətlə yoxdursa, əvvəlcə 0-cı bölmənin 3-cü bəndini yoxla.)
- **Alınmasa yaz:** `TF-03 FAIL: ilk toxunuş səssiz, səs N-ci toxunuşdan` və ya `TF-03 FAIL: heç səs yoxdur (zəng rejimi açıq)`.
- **Bağlayır:** MM-1 · **Ciddilik:** S2.

#### TF-04 · Ekran yalnız şaquli qalır (0,5 dəq)
- **Toxun:** başlıq ekranında telefonu 3 saniyəlik yan çevir (üfüqi), sonra geri. Sonra TF-05-də, döyüş zamanı bir daha.
- **Gözlənilən:** oyun dönmür, şaquli qalır, heç nə dartılmır və kəsilmir.
- **Alınmasa yaz:** `TF-04 FAIL: ekran yana döndü / görüntü pozuldu`.
- **Bağlayır:** MM-1 · **Ciddilik:** S2.

#### TF-05 · Səviyyə 1 bir barmaqla + təlim ipucları; böyük qüllələr (2 dəq)
- **Toxun:** *(Təlim ipucları yalnız hələ ulduzu olmayan səviyyədə çıxır — sənin telefonunda 1-ci səviyyə build 7-dən keçilib, ona görə bu yoxlamanı **TF-28-in A hissəsi** kimi, irəliləyiş sıfırlanandan sonra et.)* **OYNA** → **SƏVİYYƏLƏR** xəritəsi → **1** yazılan dairə ("İlk Toxunuş"). Yuxarıda "DƏRS" kartı görünür (8 saniyə sonra özü yox olur). Yalnız **bir barmaqla**: ipucu **"Öz qüllənə toxun"** çıxanda halqa ilə göstərilən göy qülləyə toxun → ipucu **"İndi boz qülləyə toxun — axın özü davam edir"** olur → boz qülləyə toxun. Sonra öz qülləndən qırmızı qülləyə axın aç (öz qüllən, sonra qırmızı) və qalib gəl. Bir dəfə qüllənin **damına** (ən yuxarı ucuna) toxun.
- **Gözlənilən:** xəritə yuxarıdan, düz baxışla görünür (perspektiv yoxdur); qüllələr və əsgərlər build 14-dəkindən **xeyli böyükdür** (qüllələr 1,3×, əsgərlər 1,75×, ART-24). Toxunuş barmağın düz altındakı qülləyə düşür (sürüşmə yoxdur), dama toxunmaq da qülləni seçir; seçilən qüllə işıqlanır; əsgərlər axınla gedir; qüllə sənin olanda telefon yüngülcə titrəyir (Ayarlar → Səslər və Haptika → Sistem haptikası açıqdırsa). Səviyyə **QƏLƏBƏ** kartı ilə bitir.
- **Alınmasa yaz:** `TF-05 FAIL: toxunuş qəbul olunmur / başqa qülləyə düşür / dama toxunuş işləmir / ipucu görünmədi / qüllələr kiçik qalıb`.
- **Bağlayır:** QA-2, ART-24 · **Ciddilik:** S1 — səviyyə 1 keçilmir və ya toxunuşlar işləmir; S2 — toxunuş sürüşür, ipucu yoxdur.

#### TF-06 · Oyun paneli (HUD), DƏRS kartı və FASİLƏ kartı çentikdən təmiz (1 dəq)
- **Toxun:** səviyyə 1 və ya 2 başlayan kimi (DƏRS kartı hələ yuxarıdaykən) skrinşot çək, 10 saniyə sonra bir də. Sonra sağ yuxarıdakı **II** (fasilə) düyməsinə toxun → **FASİLƏ** kartı → skrinşot → **DAVAM ET**.
- **Gözlənilən:** yuxarı zolağın şüşəsi ekranın ən yuxarısına qədər uzanır (bu, build 9-dan normaldır), amma içindəkilər — solda "SƏVİYYƏ 1", ortada vaxt, səs düyməsi, **II** — tamamilə çentiyin / Dynamic Island-ın **altında**dır; aşağı zolaq ("AXINLAR", gücləndiricilər, sikkələr, **MENYU**) ev xəttinin üstündədir. DƏRS kartı yuxarı zolağın altındadır və heç bir qüllənin rəqəmini örtmür. FASİLƏ kartında **DAVAM ET, SÜRƏT ×1, SƏS, AYARLAR, YENİDƏN, MENYU, NECƏ OYNANIR** hamısı görünür və toxunulur.
- **Alınmasa yaz:** `TF-06 FAIL: <düymə> çentiyin / ev xəttinin altındadır / DƏRS kartı rəqəmi örtür` (+ skrinşot).
- **Bağlayır:** MM-1, BUG-34 · **Ciddilik:** S2.

#### TF-07 · Nəticə kartı ev xəttindən təmiz (0,5 dəq)
- **Toxun:** səviyyə 1-i udanda kartın skrinşotunu çək.
- **Gözlənilən:** **QƏLƏBƏ**, ulduzlar, "Vaxt …", "3 ulduz: …-dək · 2 ulduz: …-dək", **PAYLAŞ** və **NÖVBƏTİ / YENİDƏN / MENYU** düymələri tam görünür. **×2 QIZIL** düyməsi varsa (istəyə bağlı): toxun → reklam videosu açılır (Google **"Test Ad"** və ya adi reklam — TestFlight-da ikisi də **normaldır**; reklamın özünə toxunma), bitəndə bağla → qızıl ikiqat olur.
- **Alınmasa yaz:** `TF-07 FAIL: <düymə> kəsilib / ev xəttinin altındadır`.
- **Bağlayır:** MM-1 · **Ciddilik:** S2.

#### TF-08 · Səviyyə 2: seçimi ləğv et, zoom yoxdur (1 dəq)
- **Toxun:** TF-28-in **C** hissəsinin 4-cü addımında (2-ci səviyyənin təlimi artıq bitib) və ya sonra **MENYU** → xəritədə **2** ilə. *(Build 18-dən 2-ci səviyyənin təlim ipucları və ilk kəsmə TF-28-dədir; xətti kəsmək TF-23-dədir.)*
  1. **Seçimi ləğv et:** öz qüllənə bir dəfə toxun (işıqlanır, aşağıda **"Axın üçün qülləyə toxun · dayandırmaq üçün yenə toxun və ya xətti kəs"** yazısı çıxır) → **eyni qülləyə yenə toxun**.
  2. Bir qülləyə **cəld iki dəfə** toxun; sonra bir qülləni **1 saniyə basılı saxla**.
  3. Səviyyəni udmağa davam et.
- **Gözlənilən:** 1 — işıq və aşağıdakı yazı yox olur, axın açılmır; 2 — ekran **böyümür (zoom yoxdur)**, böyüdücü şüşə, "Kopyala" menyusu və ya mətn seçimi **çıxmır**, ekran barmağın altında **sürüşmür**.
- **Alınmasa yaz:** `TF-08 FAIL: addım N — <nə oldu>`.
- **Bağlayır:** QA-2, BUG-33 · **Ciddilik:** S2.

#### TF-09 · Səviyyə 3: ən yuxarıdakı qüllənin rəqəmi altda; 25-də qüllə L2 olur (1 dəq)
- **Toxun:** TF-28-in **D** hissəsində (səviyyə 3 "Sahibsiz Torpaq"): əvvəlcə ekranın ən yuxarısındakı qırmızı qülləyə bax. İki boz qülləni aldıqdan sonra qüllələrindən birinin 25-ə dolmasına bax (axın verməyən qüllə dolur).
- **Gözlənilən:** ən yuxarıdakı qırmızı qüllənin rəqəmi qüllənin **altında**, bazasının aşağısında durur (yuxarıda yer yoxdur — build 15-dən belədir, xəta deyil), həm DƏRS kartı görünəndə, həm o yox olandan sonra; rəqəm tam oxunur. Qüllə 25-ə çatanda böyüyür (2-ci səviyyə, qızılı fəvvarə); səviyyə **QƏLƏBƏ** ilə bitir. Build 18-dən 3-cü səviyyədə **"25-ə dolsun" ipucu yoxdur** — o, 4-cü səviyyəyə köçüb (TF-28 E); onun olmaması xəta deyil.
- **Alınmasa yaz:** `TF-09 FAIL: qırmızı qüllənin rəqəmi örtülüb / qüllə 25-də böyümədi`.
- **Bağlayır:** QA-2, ART-24 · **Ciddilik:** S2.

#### TF-10 · Döyüş zamanı arxa plana çıx: səs kəsilir, oyun fasilədə qalır (1 dəq)
- **Toxun:** səviyyə 3 və ya 4-də, əsgərlər hərəkətdə və səs gələrkən yuxarıdakı vaxtı yadda saxla → ekranın aşağısından yuxarı sürüşdür (ana ekrana çıx) → 10 saniyə gözlə, qulaq as → Tower Clash-i yenidən aç.
- **Gözlənilən:** ana ekranda oyun səsi **eşidilmir**; qayıdanda oyun **FASİLƏ** kartında dayanıb, vaxt irəli getməyib, səviyyə uduzulmayıb; **DAVAM ET** → oyun davam edir, səs növbəti toxunuşda qayıdır; yuxarı / aşağı zolaq yenə çentikdən təmizdir (TF-06 kimi).
- **Alınmasa yaz:** `TF-10 FAIL: səs arxa planda davam etdi / qayıdanda oyun getmişdi / səs qayıtmadı`.
- **Bağlayır:** MM-1 · **Ciddilik:** S2.

#### TF-11 · "Axın ilişib" ipucu — istəyə bağlı (3 dəq)
- **Toxun:** **MENYU** → xəritədə **2** (artıq keçilib, təlim ipucu yoxdur). Səviyyə başlayan kimi (ilk 3 saniyədə): öz aşağı qüllənə, sonra **sağdakı** boz qülləyə toxun. Ortadakı boz qülləni qırmızı alacaq. Təxminən **0:12**-də ortadakı qüllədən sənin qülləyə qırmızı axın gəlir → dərhal (2 saniyə ərzində): öz qüllənə → sağdakı qülləyə (axın dayanır) → **ortadakı** qülləyə toxun (sənin axının qırmızıya qarşı gedir).
- **Gözlənilən:** ~8–10 saniyə sonra bir dəfə qırmızı yazı: **"Axın ilişib — dayandır və başqa tərəfdən vur"**. Sonra səviyyəni adi qaydada bitir.
- **Alınmasa yaz:** vəziyyət yaranmadısa (qırmızı hücum etmədi) — `TF-11 alınmadı` (bu xəta **deyil**); addımları etdin, axınlar 15 saniyədən çox bir-birini yeyir, yazı yoxdur — `TF-11 FAIL: ipucu çıxmadı`.
- **Bağlayır:** QA-2 · **Ciddilik:** S3.

#### TF-12 · Səviyyə 5–8 ardıcıl + iki dəfə arxa plan (yaddaş / çökmə) (5 dəq)
- **Toxun:** TF-28-in sonunda 4-cü səviyyə keçilib — **NÖVBƏTİ** ilə 5-dən başla. Vaxta qənaət üçün **II → SÜRƏT ×1** düyməsinə toxun ki, **×2** olsun. Hər qələbədən sonra **NÖVBƏTİ**; uduzsan **YENİDƏN**. Səviyyə 5-də: ana ekrana çıx, 10 s gözlə, qayıt, **DAVAM ET**. Səviyyə 7-də: ana ekrana çıx, **Kamera** və ya **Safari**-ni 30 s işlət, qayıt, **DAVAM ET**. Hər səviyyənin **DƏRS** kartını oxu və dediyini et (0-cı bölmə, 11-ci bənd).
- **Gözlənilən:** çökmə yoxdur; oyun **özü başlıq ekranına qayıtmır** (bu, iPhone-un oyunu yaddaş üçün bağladığının əlamətidir); qayıdanda FASİLƏ kartı görünür. Altıncı bitmiş səviyyədən sonra (qələbə də, məğlubiyyət də sayılır) səviyyələr **arasında** tam ekran reklam çıxa bilər (Google **"Test Ad"** və ya adi reklam) — TestFlight-da normaldır, reklamın özünə toxunma, × ilə bağla. Döyüş **zamanı** reklam heç vaxt, ilk 5 bitmiş səviyyədən sonra da reklam **olmamalıdır**. Səviyyə 8-dən sonra GÜNLÜK kart açılır. 5, 6, 7-ci səviyyələrin 2★ saatı build 18-də qısalıb (01:15 / 01:35 / 01:05; 0-cı bölmə, 10-cu bənd) — 1★ qələbə xəta deyil. 6 və 8-in DƏRS kartı build 19-da, 5 və 7-ninki build 20-də yenidir (5 və 7 "sağdan başla" deyir): tam oxunur, kəsilmir; seçim yazısı burada da seçilmiş qüllənin üstünə düşmür (GD-6g).
- **Alınmasa yaz:** `TF-12 FAIL: səviyyə N-də çökdü / özü başlığa qayıtdı / döyüş vaxtı reklam`.
- **Bağlayır:** QA-2, MM-4 · **Ciddilik:** S1 — çökmə, döyüş zamanı reklam və ya ilk 5 bitmiş səviyyədə reklam; S2 — özü başlığa qayıdır (irəliləyiş qalsa da).

#### TF-13 · Səviyyə 9 (və ya 10–12) ×1 sürətdə: səlistlik, istilik, kəskinlik (3 dəq)
- **Toxun:** **II → SÜRƏT ×2**-yə toxun ki, yenə **×1** olsun. Səviyyə 9 "Daş Divarlar"-ı (və ya 10 "Xətti Saxla", 11 "Qalanı Ac Qoy", 12 "Top Postu") **2 dəqiqə** oyna (9 və 10-un DƏRS kartı build 19-da, 11-inki build 20-də yenidir — oxu və dediyini et, 0-cı bölmə, 11-ci bənd; sonra 13, 14, 16-nın kartları üçün 16-ya qədər davam et), ən çox əsgərin toqquşduğu və qüllələrin əl dəyişdiyi anlara diqqət et (build 14-dən bu anlarda parıltı, halqa və qığılcım effektləri var — səlistliyi onlarla birlikdə qiymətləndir). Sonda telefonun arxasına toxun.
- **Gözlənilən — həmişə cavab yaz:** (a) səlistlik **1–5** (5 = video kimi axıcı, 1 = qırıq-qırıq); (b) telefon **soyuq / ilıq / isti**; (c) qüllə rəqəmləri və yazılar adi məsafədən **aydın**dır, yoxsa bulanıq? Gözlənilən: 4–5, ən çox ilıq, aydın. *İstəyə bağlı müqayisə:* Safari-də `https://pervincinal.github.io/InsiderTest/?dprcap=3` aç (veb versiya, ayrıca irəliləyiş) — başlıq yazıları tətbiqdəkindən yalnız "burnunu ekrana dirəyəndə" fərqlənməlidir.
- **Cavab nümunəsi:** `TF-13: səlistlik 4/5, ilıq, mətn aydın`; problem varsa ekran yazısı əlavə et.
- **Bağlayır:** M3-5, MM-4 · **Ciddilik:** S2 — daim titrəyir (≤ 2/5) və ya telefon isti olur; S3 — arabir ilişmə (3/5) və ya mətn yaxından bir az yumşaq.

#### TF-14 · GÜNLÜK kart: geri sayım, bugünkü səviyyə, oyun (2 dəq)
- **Toxun:** **MENYU** → **SƏVİYYƏLƏR** xəritəsi; yuxarıdakı **GÜNLÜK** karta bax. Səviyyə 8 keçilibsə karta toxun və oyna.
- **Gözlənilən:** səviyyə 8-dən əvvəl kartda qıfıl, **"Səviyyə 8 keçiləndə açılır"** və **"Yenisi N saata (00:00 UTC)"**. N = Bakı vaxtı ilə 04:00-a qalan saat, yuxarı yuvarlaqlaşdırılmış (məs. 21:15-də → 7); son saatda "Yenisi 12:34 sonra (00:00 UTC)". Açıldıqdan sonra 2-ci sətir: **səviyyə adı · çətinlik** aşağıdakı cədvəldəki kimi. Qələbə → **"Günlük çağırış keçildi · +… qızıl +5 kristal · seriya 1"**; kart **TAMAM** və "Rekord …★ · vaxt" göstərir. Kartın altında **"Dünənki xəritə"** sətri görünə bilər — istəyə bağlı.
- **Alınmasa yaz:** `TF-14 FAIL: kartda X yazılıb, cədvəldə Y / geri sayım N saat, gözlənilən M / açılmadı`.
- **Bağlayır:** QA-2 · **Ciddilik:** S1 — günlük səviyyə açılmır və ya çökür; S2 — səhv səviyyə və ya səhv geri sayım.

Günlük cədvəl (tarix UTC-dir: Bakıda həmin gün **04:00**-dan növbəti gün **03:59**-a qədər):

| Tarix (UTC) | Səviyyə | Kartda | Tarix (UTC) | Səviyyə | Kartda |
|---|---|---|---|---|---|
| 2026-10-21 | 46 | Çay Qapısı · Az ərzaq | 2026-10-28 | 14 | Top və Divar · İti addım |
| 2026-10-22 | 27 | Zireh Yarışı · Güclü qarnizon | 2026-10-29 | 40 | Tac · Nazik divarlar |
| 2026-10-23 | 17 | Mina Sahəsi · Nazik divarlar | 2026-10-30 | 23 | İlk Qan · Az ərzaq |
| 2026-10-24 | 25 | Ağır Metal · İti addım | 2026-10-31 | 15 | Sitadel · Güclü qarnizon |
| 2026-10-25 | 34 | Ən Zəif Halqa · Güclü qarnizon | 2026-11-01 | 30 | Bir Cəbhə · Nazik divarlar |
| 2026-10-26 | 41 | Əkiz Çaylar · Klassik | 2026-11-02 | 43 | Dəmir Karvan · İti addım |
| 2026-10-27 | 46 | Çay Qapısı · Güclü qarnizon | 2026-11-03 | 28 | Keçidi Tut · Az ərzaq |

#### TF-15 · Mağaza "mağaza əlçatan deyil" halında (2 dəq)
- **Toxun:** başlıq ekranı → **MAĞAZA**. Bu build-də yalnız iki tab olmalıdır: **GÖRÜNÜŞ / TƏLİM** (PUB-14: alış olmayan build-də KRİSTAL və DƏSTLƏR tabları gizlidir).
  1. Tab sırasına bax, sonra hər iki tabda yuxarı-aşağı sürüşdür.
  2. **GÖRÜNÜŞ**: **Şifer** (80 kristal) görünüşünə toxun; "YALNIZ DƏSTDƏ" yazılan görünüş varsa, ona da toxun.
  3. **TƏLİM**: qızılın çatırsa bir təkmilləşdirmə al.
- **Gözlənilən:** 1 — mağaza yalnız **GÖRÜNÜŞ** və **TƏLİM** tabları ilə açılır; **KRİSTAL** və **DƏSTLƏR** tabları **yoxdur** (boz da deyil — ümumiyyətlə görünmür); heç yerdə $ qiyməti ($0.99 …), kristal paketi, dəst, "Mağaza bu platformada mümkün deyil" yazısı və ya **ALIŞLARI BƏRPA ET** düyməsi yoxdur; **Apple ödəniş pəncərəsi, Apple ID parolu sorğusu heç vaxt çıxmır**. 2 — 40 dəqiqəlik oyunla kristal azdır, ona görə **"Kristal çatmır"** düzgün nəticədir, kristal sayı dəyişmir (≥ 80-dirsə: "Şifer dam açıldı və taxıldı"); "YALNIZ DƏSTDƏ" → yalnız yazı ("Başlanğıc dəsti ilə gəlir" və ya "Premium dəsti ilə gəlir"), qiymət və ödəniş pəncərəsi yoxdur. 3 — "<ad> pillə 1: …" yazısı, qızıl azalır.
- **Alınmasa yaz:** `TF-15 FAIL: KRİSTAL/DƏSTLƏR tabı görünür / qiymət və ya bərpa düyməsi görünür / Apple ödəniş pəncərəsi açıldı / <tab> çökdü / mətn: …`.
- **Bağlayır:** MM-1, QA-2 · **Ciddilik:** S1 — Apple ödəniş pəncərəsi və ya pul tələbi; S2 — çökmə, KRİSTAL / DƏSTLƏR tabı (boz da olsa), qiymət və ya bərpa düyməsi görünür; S3 — mətn / tərcümə.

#### TF-16 · Ayarlar (3 dəq)
- **Toxun:** başlıq ekranı → **Ayarlar**. **İRƏLİLƏYİŞİ SIFIRLA**-ya burada **toxunma** (yalnız TF-28-in əvvəlində). **Komanda rəngləri** sətri TF-27-dədir.
  1. **Dil** sətrində **Azərbaycanca** seçili olsun (deyilsə seç).
  2. **Rəng korluğu** → **AÇIQ** → **GERİ** → **OYNA** → istənilən səviyyəni aç, bax → **MENYU**. Sonra yenə **Ayarlar**-da istədiyin kimi qoy.
  3. **Az hərəkət** → **AÇIQ** → **GERİ**, başlıq ekranına bax, bir səviyyəni 10 saniyə oyna → **MENYU** → **Ayarlar** → **AVTO**.
  4. **Necə oynanır** → kart → **ANLADIM** (kartın özü TF-29-dadır).
  5. Aşağıdakı "Haqqında" kartına bax: versiya və **MƏXFİLİK SEÇİMLƏRİ** düyməsi (varsa toxun).
- **Gözlənilən:** 1 — bütün menyular Azərbaycanca. 2 — düşmən qüllələri **qırmızıdan narıncıya** keçir, səninkilər göy qalır. 3 — başlıq ekranında yeriyən əsgərlər dayanır; döyüşdə əsgərlər addım atmadan sürüşür, ayaq tozu və ələ keçirmə parıltısı yoxdur, effektlər azalır; AVTO iPhone-un *Hərəkəti azalt* ayarına uyğundur. 4 — **NECƏ OYNANIR** kartında **6** qayda (build 18-də 5 idi), hamısı ekrana sığır, **ANLADIM** Ayarlara qaytarır. 5 — **"Versiya 1.0.0 (build 20)"** (və ya TestFlight-dakı daha böyük nömrə) və "İrəliləyiş bu cihazda saxlanılır". Azərbaycanda **MƏXFİLİK SEÇİMLƏRİ** düyməsinin **olmaması normaldır** (Google onu yalnız AB / Böyük Britaniyada göstərir); varsa, toxunanda Google forması açılıb oyuna qayıtmalıdır. "Dəstək ID" sətri bu buildda **yoxdur** — normaldır.
- **Alınmasa yaz:** `TF-16 FAIL: addım N — <nə oldu>`.
- **Bağlayır:** QA-2 · **Ciddilik:** S2 — ayar tətbiq olunmur, versiya fərqlidir, məxfilik düyməsi xəta verir; S3 — görünüş / mətn.

#### TF-17 · Tətbiqi tam bağla, yenidən aç — irəliləyiş qalır (1 dəq)
- **Toxun:** ekranın aşağısından yuxarı sürüşdür və ortada saxla (tətbiq dəyişdirici) → Tower Clash kartını yuxarı at. İkonla yenidən aç → **OYNA**.
- **Gözlənilən:** dil yenə **Azərbaycanca**; aşağıdakı qızıl / kristal əvvəlki kimi; xəritədə keçdiyin səviyyələrin ulduzları yerində (TF-28-dəki sıfırlamadan sonra keçdiklərin); Rəng korluğu və **Komanda rəngləri** ayarı necə qoymusansa elədir.
- **Alınmasa yaz:** `TF-17 FAIL: ulduzlar / qızıl / dil itdi`.
- **Bağlayır:** QA-2 · **Ciddilik:** S1 (məlumat itkisi).

#### TF-18 · Təyyarə rejimi: oyun və GÜNLÜK kart işləyir (2 dəq)
- **Toxun:** İdarəetmə mərkəzi → **Təyyarə rejimi AÇIQ**, Wi-Fi ikonu da sönük olsun. Tətbiqi TF-17 kimi tam bağla və yenidən aç → **OYNA** → istənilən səviyyəni sona qədər oyna → xəritədə GÜNLÜK karta bax (açıqdırsa toxun, bir az oyna). Sonda Təyyarə rejimini **söndür**.
- **Gözlənilən:** başlıq ekranı adi vaxtda açılır; səviyyə yüklənir, **"Yüklənmədi — bağlantını yoxla"** yazısı çıxmır; GÜNLÜK kart geri sayımı göstərir və səviyyəni açır. Nəticə kartında **×2 QIZIL** olmaya bilər və ya "Hazırda video yoxdur" yaza bilər — internetsiz normaldır.
- **Alınmasa yaz:** `TF-18 FAIL: internetsiz açılmadı / səviyyə yüklənmədi / günlük kart: …`.
- **Bağlayır:** QA-2 · **Ciddilik:** S1 — tətbiq və ya səviyyə internetsiz açılmır; S2 — yalnız GÜNLÜK kart işləmir.

#### TF-19 · 04:00 (Bakı) günlük dəyişmə — istəyə bağlı (3 dəq)
- **Toxun (A, təbii):** Bakı vaxtı ilə 03:57-də oyunu aç, **SƏVİYYƏLƏR** xəritəsində GÜNLÜK karta bax və 04:01-ə qədər gözlə.
- **Toxun (B, saatı dəyiş — bütün başqa yoxlamalardan sonra):** iPhone **Ayarlar → Ümumi → Tarix və Vaxt** → **Avtomatik təyin et SÖNDÜR** → vaxtı **03:58** et (sabahın tarixi də olar) → oyunu aç → xəritə → 2–3 dəqiqə gözlə → sonra **Avtomatik təyin et-i yenə AÇ**. Saatı dəyişmək bu test qurğusunda seriyanı / gündəlik mükafatı qarışdıra bilər — bu xəta **deyil**.
- **Gözlənilən:** 04:00-a az qalanda kartda "Yenisi 01:59 sonra (00:00 UTC)" kimi geri sayım; tam 04:00-da kart **növbəti günün** səviyyəsinə keçir (cədvəl), əgər bugünkü keçilmişdisə **TAMAM** yox olur. Kart qıfıllıdırsa, yalnız geri sayımın sıfırlanıb ~24 saata qayıtmasına bax.
- **Alınmasa yaz:** `TF-19 FAIL: 04:00-da kart dəyişmədi / başqa saatda dəyişdi (HH:MM)`.
- **Bağlayır:** QA-2 · **Ciddilik:** S2.

#### TF-20 · PAYLAŞ — nəticə kartından paylaşma pəncərəsi (2 dəq)
- **Toxun:** istənilən səviyyəni bitir (qalib və ya məğlub) → nəticə kartında **PAYLAŞ** → iPhone-un paylaşma pəncərəsi açılır → **WhatsApp** və ya **Telegram** seç → özünə göndər. Sonra bir də **PAYLAŞ** → **Şəkli saxla** (Save Image) seç → Foto-lara icazə sorğusuna **İcazə ver** → şəkil Foto-larda görünür. Üçüncü dəfə **PAYLAŞ** → pəncərəni yuxarıdan aşağı çəkib **bağla**.
- **Gözlənilən:** pəncərə dərhal açılır (≤ 2 s); göndərilən şəkil dik kartdır (1080×1350): biomun adası, qala, "QƏLƏBƏ"/"MƏĞLUBİYYƏT", səviyyənin adı və nömrəsi, ulduzlar, vaxt, aşağıda versiya; mətn sətri oyunun linki ilə gəlir. Bağlayanda oyun nəticə kartında qalır, heç bir xəta yazısı yoxdur. **GÜNLÜK** və **HƏFTƏLİK** nəticəsində kartda gün/həftə açarı və fənd də görünür; dünənki xəritənin (məşq) kartında **PAYLAŞ yoxdur** — bu xəta deyil.
- **Alınmasa yaz:** `TF-20 FAIL: pəncərə açılmadı / şəkil boş-qara / mətn yanlış / Şəkli saxla-da tətbiq bağlandı [skrinşot]`.
- **Bağlayır:** MM-8 (cihaz təsdiqi) · **Ciddilik:** S2 — pəncərə açılmır və ya şəkil gəlmir; S3 — şəkildə kəsik mətn.

#### TF-21 · 10+ səviyyədə 3★ qələbədən sonra qiymət pəncərəsi çıxmır (2 dəq)
- **Toxun:** TF-13-dən sonra **10, 11 və ya 12-ci** səviyyəni **3 ulduzla** keç (TF-28-dəki sıfırlamadan sonra 10 yalnız 9 keçiləndən sonra açılır) (gücləndiricilərdən istifadə etmək olar). Nəticə kartında 5 saniyə gözlə, sonra xəritəyə qayıt və başqa bir səviyyə aç. Sonra brauzerdə (1 dəq): github.com/pervincinal/InsiderTest → *Settings* → *Secrets and variables* → *Actions* → **Variables** tabı — `RATING_PROMPT` adlı dəyişənə bax.
- **Gözlənilən:** heç bir "Enjoying Tower Clash?" / ulduzlu qiymət pəncərəsi çıxmır — nə nəticə kartında, nə xəritədə; nəticə kartı adi qaydada işləyir (düymələr, PAYLAŞ), çökmə və donma yoxdur. GitHub-da `RATING_PROMPT` dəyişəni **yoxdur** (və ya dəyəri `on` deyil). *Qeyd: TestFlight build-lərində Apple bu pəncərəni ümumiyyətlə göstərmir, ona görə əsas sübut dəyişənin olmamasıdır; telefondakı hissə 3★ qələbədən sonra heç nəyin pozulmadığını yoxlayır.* İki cəhddə 3★ alınmasa, `TF-21 çatmadı` yaz — xəta deyil.
- **Alınmasa yaz:** `TF-21 FAIL: 3★-dan sonra qiymət pəncərəsi çıxdı / nəticə kartı dondu / RATING_PROMPT = on [skrinşot]`.
- **Bağlayır:** MM-9 (cihaz təsdiqi; MM-10 build dəyişəni) · **Ciddilik:** S3 — App Store-a göndəriləcək build yığılmazdan əvvəl dəyişən silinir, çünki rəy qeydi (APP_STORE_CONNECT_SHEET §6.4) "bu versiya qiymət istəmir" deyir.

#### TF-22 · Təchizat xətti: dolu öz qülləndən əsgərlər irəli keçir (3 dəq)
- **Toxun:** **MENYU** → xəritədə **2** "Təchizat Xətti" (artıq keçilib, ipucu yoxdur). Səviyyə 1-dəki kimi **II → SÜRƏT** ilə ×1 olsun.
  1. Aşağıdakı öz qüllənə, sonra **ortadakı** boz qülləyə toxun — orta qüllə sənin olsun (axın davam edir).
  2. Ortadakı qüllən göy olan kimi: ortadakı qüllənə, sonra ən yuxarıdakı **qırmızı** qülləyə toxun (orta → qırmızı axını).
  3. Gözlə: aşağıdan gələn axın ortadakı qülləni doldurur. Ortadakı qüllənin rəqəmi **25** olanda onun lövhəsi **qızılı** olur və aşağıdan gələn axın **özü dayanır** (bu, adi "dolana qədər gücləndir" davranışıdır).
  4. İndi yenə: aşağıdakı qüllənə, sonra **dolu** ortadakı qüllənə toxun (və ya barmağınla aşağıdakı qüllədən ortadakına dart). 20 saniyə bax.
- **Gözlənilən:** 4-cü addımda axın açılır və **dayanmır**; "Doludur" yazısı **çıxmır**, qüllə titrəmir; aşağıdan gələn göy əsgərlər ortadakı qülləyə girib dərhal onun qırmızıya gedən axını ilə **irəli** çıxır — orta → qırmızı axınında əsgərlər əvvəlkindən sıx gedir; ortadakı qüllə 25-də (qızılı) qalır. Build 19-dan axın açılan an qüllənin üstündə bir dəfə qısa **"Təchizat xətti: dolu qüllə əsgərləri irəli ötürür"** yazısı çıxır — bu, xəbərdarlıq deyil (TF-29). Ortadakı qüllənin qırmızıya axınını dayandırsan (xətti barmaqla kəs), aşağıdan gələn axın da bir an sonra özü dayanır. Səviyyəni adi qaydada bitir.
- **Alınmasa yaz:** `TF-22 FAIL: addım 4 — "Doludur" çıxdı / axın açılmadı / axın özü dayandı / əsgərlər ortada itdi` (+ ekran yazısı). Qırmızı ortadakı qülləni vurub 25-dən aşağı salırsa, bir az gözlə və 4-cü addımı təkrarla — bu xəta deyil.
- **Bağlayır:** RELAY-1 (cihaz təsdiqi; GDD §2.0b qayda 13) · **Ciddilik:** S2 — təchizat xətti alınmır (rədd, "Doludur" və ya özü dayanır); S3 — işləyir, amma görünüşü qarışıqdır.

#### TF-23 · Axını barmaqla kəsmək və dartma xətti (2 dəq)
- **Toxun:** istənilən açıq səviyyədə (məs. 4):
  1. **Dartma:** öz qüllənə barmağını bas və **buraxmadan** başqa qülləyə doğru dart, qüllənin üstündə burax.
  2. Yenə dart, amma bu dəfə barmağı **boş yerdə** burax.
  3. **Kəsmək:** barmağını boş yerdən başlayıb öz axınlarından birinin üstündən sürətlə keçir. Sonra bir xətti **iki** axının üstündən birdən keçir.
  4. Öz qülləndən dartmağa başla və barmağı aşağıdakı **MENYU** düyməsinin üstündə burax; sonra boş yerdən sürüşdürüb **⚡ (OVERDRIVE)** düyməsinin üstündə burax.
- **Gözlənilən:** 1 — barmaq tərpənən kimi qüllədən barmağa **qızılı qırıq-qırıq xətt** uzanır və barmağın arxasınca gedir; çatıla bilən qüllənin üstündə xətt bərkiyib (bütöv) ona "yapışır"; buraxanda axın başlayır; ekran barmağın altında sürüşmür. 2 — xətt yox olur, heç nə olmur. Yolu divarla bağlı qüllənin üstündə buraxsan: **"Yol bağlıdır — açıq düz xətt yoxdur"**. 3 — kəsilən axın(lar) **dərhal** dayanır, barmağın arxasında qısa ağ iz qalır; düşmən axınları kəsilmir. 4 — **heç bir düymə basılmır**: səviyyədən çıxılmır, qızıl azalmır, OVERDRIVE işə düşmür (build 10-dan, BUG-36).
- **Alınmasa yaz:** `TF-23 FAIL: addım N — <nə oldu>` (+ ekran yazısı).
- **Bağlayır:** BUG-33, BUG-35, BUG-36 (cihaz təsdiqi) · **Ciddilik:** S2 — xətt çıxmır, axın kəsilmir, ekran sürüşür və ya düymə basılır; S3 — xəttin / izin görünüşü.

#### TF-24 · Yeriyən əsgərlər öz axınının üstündə seçilir, ayaq tozu (2 dəq)
- **Toxun:** səviyyə 4–6-dan birində iki-üç axın aç. Telefonu adi məsafədə tut (qol uzunluğu) və 30 saniyə əsgərlərə bax; bir axının 10 saniyəlik ekran yazısını çək. Tank fabriki olan səviyyədə (məs. 25 "Ağır Metal", GÜNLÜK kartda da çıxa bilər) tanklara da bax.
- **Gözlənilən:** əsgərlər **öz rəngli axınlarının üstündə aydın seçilir** — hər birinin tünd kontur xətti var, sütun axının içində "əriyib itmir" (stakeholderin build 11 qeydi, BUG-39); əsgərlər build 14-dəkindən böyükdür (1,75×). Əsgərlər həqiqətən **yeriyir**: iki ayaq addım atır, bir az qabağa əyilir, nizə və iki göz görünür; ayaqlarının altından xırda **toz** qalxır (hər torpaqda: ot, qum, qar…); tankların tırtılları fırlanır. Xəritənin ən yuxarısındakı qüllənin rəqəmi lazım gələndə qüllənin **altında** və ya yanında durur və heç bir başqa rəqəmlə üst-üstə düşmür (BUG-42 build 16-da düzəldilib).
- **Cavab yaz:** `TF-24: əsgərlər seçilir hə/yox, yeriyir hə/yox, toz görünür hə/yox` (+ ekran yazısı).
- **Bağlayır:** ART-20, BUG-39, ART-24, BUG-42 · **Ciddilik:** S2 — əsgərlər axında görünmür və ya rəqəmlər üst-üstə düşür; S3 — yeriş / toz görünmür və ya qəribə görünür.

#### TF-25 · Döyüş effektləri və işıq (2 dəq)
- **Toxun:** TF-24-dəki səviyyədə bir boz və ya qırmızı qülləni al; sonra bir qüllənə öz axınınla əsgər göndər; yeni axın aç; bir qülləni 25-ə qədər doldur ki, L2 olsun. Adaya və dənizə də bax.
- **Gözlənilən:** qüllə əl dəyişəndə **parıltı halqası** və gil qırıntıları, rəqəm lövhəsi bir anlıq ağ yanır; əsgər qülləyə enəndə **halqa və qığılcım** (neytral qüllədə də); yeni axın boyunca bir **nəbz** qaçır, hər axının altında yumşaq işıq; L2-yə yüksələndə **qızılı fəvvarə**. İşıq: adanın bir tərəfində isti günəş ləkəsi, o biri tərəfində sərin kölgə, qayaların işıqlı kənarı, dənizdə günəş parıltısı, qüllə damlarında parıltı. Effektlər oyunu ləngitmir (TF-13 ilə müqayisə et).
- **Alınmasa yaz:** `TF-25 FAIL: <effekt> görünmür / effekt zamanı ilişmə / işıq çox tünd-açıq` (+ skrinşot).
- **Bağlayır:** ART-23 · **Ciddilik:** S2 — effektlər zamanı aydın ilişmə və ya effekt rəqəmi oxunmaz edir; S3 — effekt görünmür və ya xoşa gəlmir.

#### TF-26 · Başlıq adası 17 Pro Max ekranını doldurur (1 dəq)
- **Toxun:** MENYU-dan başlıq ekranına qayıt, heç nəyə toxunmadan bax, skrinşot çək. Sonra **ANLADIM**-sız hər düyməyə bir dəfə toxun və geri qayıt: dil düyməsi, ayarlar (dişli), səs, **MAĞAZA**, sağ aşağıdakı gündəlik sandıq, sol aşağıdakı kubok, aşağıdakı qızıl / kristal zolağı.
- **Gözlənilən:** ada ekranı **yuxarıdan aşağıya doldurur** — böyük dəniz boşluğunda "üzən" kiçik ada deyil (build 12-yə qeydin "başlıqda çox dəniz var", FE-12); adada qüllələr və yeriyən əsgərlər var; heç bir düymə Dynamic Island-ın və ya ev xəttinin altında deyil, hamısı ilk toxunuşda açılır.
- **Alınmasa yaz:** `TF-26 FAIL: ada kiçikdir, yuxarıda/aşağıda çox dəniz / <düymə> açılmır və ya çentiyin altındadır` (+ skrinşot).
- **Bağlayır:** FE-12 · **Ciddilik:** S2 — düymə gizlənir və ya işləmir; S3 — ada ekranı doldurmur.

#### TF-27 · Komanda rəngləri: dörd dəst hər ekranda, yenidən açılışdan sonra qalır, rəng korluğu ilə birlikdə (3 dəq)
- **Toxun:** başlıq ekranı → **Ayarlar** (dişli). Dil seçiminin altında **"Komanda rəngləri"** sətri: adın yanında 4 rəngli nöqtə, altında 4 düymə — **Klassik / Canlı / Kral / Pastel**.
  1. **Canlı**-ya toxun → **GERİ** → başlıq ekranına bax (adadakı qüllələrin damları, yeriyən əsgərlər), skrinşot → **OYNA** → **SƏVİYYƏLƏR** xəritəsinə bax (açıq səviyyənin dairəsi) → istənilən açıq səviyyəni 10 s oyna (öz və düşmən qüllələri, axınlar, əsgərlər, rəqəm lövhələri), skrinşot → **II** (FASİLƏ kartı) → **MENYU** → **MAĞAZA** → **GÖRÜNÜŞ** tabında dam / dəbilqə nümunələrinə bax.
  2. Eyni yolu **Kral** ilə, sonra **Pastel** ilə təkrarla (hər birində ən azı başlıq və oyun, skrinşot ilə).
  3. Bir dəst seçili ikən (məs. Kral) **Rəng korluğu → AÇIQ** → bir səviyyəni 10 s oyna → **MENYU** → **Ayarlar** → Rəng korluğu-nu əvvəlki halına qaytar.
  4. Ən çox bəyəndiyin dəsti seç (bilmirsənsə **Klassik**). Tətbiqi TF-17 kimi tam bağla və ikonla yenidən aç → **Ayarlar**.
- **Gözlənilən:** 1–2 — seçilən düymə işıqlanır, sətrin yanındakı 4 nöqtə həmin dəstin rənglərini göstərir; dəyişiklik **dərhal** görünür (yenidən açmaq lazım deyil). Başlıq adasında, xəritədəki açıq səviyyə dairəsində, oyunda (qüllələr, axınlar, əsgərlər), FASİLƏ kartının **DAVAM ET** düyməsində və mağazanın görünüş nümunələrində rəng ailəsi eyni qalır — **sənin göy, düşmən qırmızı** (çox düşmənli səviyyədə yaşıl, sarı), neytral **boz** — yalnız çalar dəyişir: **Canlı** — daha parlaq, doymuş (elektrik göyü, siqnal qırmızısı); **Kral** — daha tünd, dərin (tünd göy, al-qırmızı, zümrüd, köhnə qızıl); **Pastel** — açıq, təbaşir kimi yumşaq. Hər dəstdə rəqəmlər aydın oxunur. **İRƏLİLƏYİŞİ SIFIRLA** düyməsi hər dəstdə eyni qırmızıdır; mağazada alış düymələri dəyişmir — normaldır. 3 — rəng korluğu ilə əsas düşmən **narıncı** olur (başqa düşmənlər bənövşəyi / firuzəyi), sənin qüllələrin seçdiyin dəstin göyündə qalır; söndürəndə dəstin adi rəngləri qayıdır. 4 — yenidən açılanda başlıq ekranı birbaşa seçdiyin dəstlə açılır, Ayarlarda həmin düymə seçilidir.
- **Cavab yaz:** `TF-27: Canlı / Kral / Pastel OK, rəng korluğu ilə OK, yenidən açılışda qaldı; bəyəndiyim: <dəst>` və ya `TF-27 FAIL: <dəst> — <ekran> köhnə rəngdə qaldı / seçim itdi / rəqəm oxunmur` (+ skrinşot). **Bəyəndiyin dəsti mütləq yaz** — mağaza şəkilləri onunla çəkiləcək (cavab olmasa **Klassik** qalır).
- **Bağlayır:** FE-14 (cihaz təsdiqi), ART-25 qərarı · **Ciddilik:** S2 — seçim yenidən açılışda itir, bir ekran köhnə rəngdə qalır, rəqəm oxunmur və ya çökmə; S3 — çalar xoşa gəlmir.

#### TF-28 · Təlim: səviyyə 1–4 yeni oyunçu kimi, irəliləyiş sıfırlanıb (10 dəq)
- **Hazırlıq:** təlim baloncuğu (sarı çərçivəli yazı + ox + yanıb-sönən halqa) yalnız hələ ulduzu olmayan səviyyədə çıxır; sənin telefonunda 1–4 artıq keçilib. Ona görə: **Ayarlar → İRƏLİLƏYİŞİ SIFIRLA → SIFIRLA**. Ulduzlar və qızıl silinir, **ayarlar qalır** (dil, rəng korluğu, komanda rəngləri) — yalnız bu test quraşdırmasında. Sürət **×1** olsun. Hər səviyyənin əvvəlində yuxarıdakı **DƏRS** kartını oxu. Baloncuq nə deyirsə, yeni oyunçu kimi elə et (B hissəsindən başqa).
- **A. Səviyyə 1 "İlk Toxunuş"** — TF-05-dəki kimi: **"Öz qüllənə toxun"** → **"İndi boz qülləyə toxun — axın özü davam edir"**. Qalib gəl (TF-07-nin skrinşotu da burada) → **NÖVBƏTİ**.
- **B. Səviyyə 2 "Təchizat Xətti" — əvvəlcə ortadakı qüllə (təchizat xətti qolu).** Bunu 2-ci səviyyəni udmazdan **əvvəl** et — udandan sonra onun təlimi bir daha çıxmır.
  1. Baloncuq **"Öz qüllənə, sonra boz qülləyə toxun"** — halqa **sağdakı** (yan) boz qüllədə. Bu dəfə ona əməl **etmə**: səviyyə başlayandan təxminən **3 saniyə** sonra (DƏRS kartı hələ yuxarıda ola bilər) öz aşağı qüllənə, sonra **ortadakı** boz qülləyə toxun.
  2. Ortadakı qüllə göy olanda: ortadakı qüllənə, sonra ən yuxarıdakı **qırmızı** qülləyə toxun.
  3. Gözlə (səviyyənin ≈ 30–35-ci saniyəsinədək): ortadakı qüllə **25**-ə dolur, lövhəsi **qızılı** olur, aşağıdan gələn axın özü dayanır.
  4. Yeni baloncuq çıxanda ona əməl et: öz aşağı qüllənə, sonra ortadakı **dolu** qülləyə toxun. 10 saniyə bax.
  5. **II → YENİDƏN** (səviyyəni hələ udma).
- **Gözlənilən B:** 1 — ortadakı qülləyə axın açılır, baloncuq **dəyişmir** (yan qüllədə qalır, ən gec 20 s sonra özü itir); ortadakı qüllə hələ boz ikən **"kəs" baloncuğu çıxmır** (build 17-də məhz bu anda "axını dayandır" deyirdi və onu edən oyunçu uduzurdu). 3 — ortadakı qüllə 25-də (qızılı) olub qırmızıya axın verəndə baloncuq: **"Dolu qüllə əsgərləri irəli ötürür: ona axıt"**, halqa **ortadakı** qüllədə. Ondan əvvəl başqa baloncuq bir anlıq görünə bilər — normaldır. 4 — axın açılır, **"Doludur" yazısı çıxmır**, aşağıdan gələn göy əsgərlər ortadakı qüllədən keçib qırmızıya gedir (TF-22 kimi), baloncuq yox olur və başqa baloncuq gəlmir; "Təchizat xətti: …" ipucu da burada **çıxmır** (bu addımın özü dərsdir; ipucu TF-29-dadır). Qırmızı ortadakı qülləni əvvəl alarsa və ya onu 25-ə çatmağa qoymursa: **II → YENİDƏN** və bir də cəhd et; iki cəhddə alınmasa `TF-28 B alınmadı` yaz — xəta deyil.
- **C. Səviyyə 2 — əvvəlcə yan qüllə (əsas yol), qalib gəl.**
  1. Baloncuq **"Öz qüllənə, sonra boz qülləyə toxun"** (halqa sağdakı boz qüllədə) → öz qüllənə, sonra **sağdakı** boz qülləyə toxun.
  2. Sağdakı qüllə göy olanda baloncuq: **"İndi yeni qülləyə, sonra qırmızıya toxun"** (halqa qırmızı qüllədə) → baloncuq necə deyirsə: yeni qüllənə, sonra qırmızıya toxun (arada boş yerə toxunmadan).
  3. Baloncuq **"Axını barmağınla kəs ki, qüllən böyüsün"** — halqa aşağı qüllədən yan qülləyə gedən göy axının **ortasında** (qüllədə yox) → barmağını boş yerdən başlayıb həmin axının üstündən keçir.
  4. Səviyyəni udmağa davam et (TF-08-i burada et).
- **Gözlənilən C:** DƏRS kartı: "Yolda duran qüllə arxasındakı düşməni gizlədir: yan qüllədən dolan. Göndərmək qülləni boşaltmır, yalnız böyüməsini dayandırır" (sonunda "ona görə axınlarını dayandırma" **yoxdur**). 1 — axın başlayır, baloncuq gizlənir; yan qüllə hələ boz ikən heç bir baloncuq yoxdur. 2 — baloncuq çıxanda heç bir qüllə seçili deyil; yeni qülləyə ilk toxunuş onu **seçir** (işıqlanır), aşağıdan ona gedən axın **dayanmır**; ikinci toxunuş (qırmızıya) yan → qırmızı axınını açır, "kəs" baloncuğu çıxır. **Olmamalıdır:** ilk toxunuşun aşağıdan gələn axını kəsməsi və "kəs" baloncuğunun heç çıxmaması (build 18-də belə idi — BUG-50, build 19-da düzəldilib). 3 — baloncuq yan qüllənin rəqəmini örtmür; axın **dərhal** dayanır, qısa ağ iz, baloncuq yox olur; aşağı qüllənin rəqəmi yenə artmağa başlayır. Bu yolda təchizat xətti baloncuğu **çıxmır**. Səviyyə **QƏLƏBƏ** ilə bitir; kartda "3 ulduz: 00:20-dək · 2 ulduz: 01:10-dək".
- **D. Səviyyə 3 "Sahibsiz Torpaq".** Baloncuq **"Öz qüllənə, sonra boz qülləyə toxun"** (halqa **sağdakı** boz qüllədə) → öz qüllənə, sonra sağdakı boz qülləyə toxun. O qüllə göy olanda baloncuq **"İndi o biri boz qülləni də götür"** (halqa **soldakı** boz qüllədə) → yalnız soldakı boz qülləyə **bir dəfə** toxun. Qalib gəl (TF-09-u burada et).
- **Gözlənilən D:** ikinci baloncuq yalnız birinci boz qüllə sənin olandan sonra çıxır; o çıxanda **yeni (sağdakı) qüllən artıq seçilidir** (ətrafında seçim halqası), ona görə soldakına bir toxunuş ondan axın açır; baloncuq yox olur, səviyyədə başqa baloncuq yoxdur. **Olmamalıdır:** qüllənin titrəməsi və **"2 axın üçün L2 lazımdır"** yazısı (build 18-də seçim ev qülləsində qalırdı — BUG-51, build 19-da düzəldilib). "25-ə dolsun" baloncuğu bu səviyyədə **yoxdur**.
- **E. Səviyyə 4 "Güc Topla".** DƏRS kartı: "Qüllənin axınını dayandır, qoy dolsun: 25 əsgərdə özü yüksəlir…". Əvvəlcə baloncuq **yoxdur** — normaldır. Öz qüllənə, sonra **soldakı** boz qülləyə toxun. O qüllə göy olanda baloncuq **"Bu qüllənin axınını dayandır ki, böyüsün"** (halqa sənin aşağı qüllənin üstündə; o qüllə artıq seçilidir) → axını dayandır (barmağınla xəttin üstündən keç və ya hədəf qülləyə yenə toxun). Sonra baloncuq **"25-ə çatanda yüksəlir — L2 iki axın aparır"** → gözlə. Qüllən böyüyəndə ondan iki ayrı qülləyə axın aç. Qalib gəl.
- **Gözlənilən E:** dayandırandan ≈ 10 s sonra aşağı qüllə 25-ə çatır, böyüyür (2-ci səviyyə, qızılı fəvvarə), baloncuq yox olur; L2 qüllə iki axını birdən aparır, "L2 lazımdır" yazısı çıxmır. **QƏLƏBƏ**; kartda "3 ulduz: 00:25-dək · 2 ulduz: 02:10-dək". Sonra TF-12 (səviyyə 5-dən) ilə davam et.
- **Cavab yaz:** `TF-28: A OK · B OK (təchizat baloncuğu ~0:34-də) · C OK · D OK · E OK; baloncuq və seçim yazısı heç bir rəqəmi örtmədi` və hər uğursuz hissə üçün `TF-28 FAIL: <hissə> addım N — <nə oldu>` (+ skrinşot və ya ekran yazısı).
- **Bağlayır:** GD-5a, GD-5b, GD-5e, GD-5c, GD-5d, BUG-50, BUG-51 (cihaz təsdiqi), QA-2 · **Ciddilik:** S1 — baloncuğa əməl edəndə səviyyə keçilmir; S2 — baloncuq çıxmır, səhv qüllədə və ya səhv vaxtda çıxır (məs. B-1-də "kəs"), 20 s-dən çox qalır, təchizat xətti alınmır, C-2-də ilk toxunuş axını kəsir və ya D-də "L2 lazımdır" çıxır; S3 — mətn, baloncuq və ya seçim yazısı bir rəqəmi / seçilmiş qülləni örtür.

#### TF-29 · "Necə oynanır" kartı (altı qayda) və təchizat xəttinin bir dəfəlik ipucu (3 dəq)
- **Toxun:**
  1. Dil **Azərbaycanca** olsun. Başlıq ekranı → **Ayarlar** → **Necə oynanır** sətri (altında "Altı qayda bir kartda") → kart açılır → skrinşot → **ANLADIM**. Sonra istənilən səviyyədə **II** → **NECƏ OYNANIR** → eyni kart → **ANLADIM** → **DAVAM ET**.
  2. **İpucu:** TF-28-dən sonra (2-ci səviyyə keçilib, təlim yoxdur) TF-22-ni et (artıq etmisənsə, təkrarla): 4-cü addımda aşağı qüllədən **dolu** ortadakı qülləyə axın aç. Sonra həmin axını barmaqla kəs və yenidən aç.
- **Gözlənilən:** 1 — başlıq **NECƏ OYNANIR**, **altı** qayda, hər birinin yanında kiçik şəkil: (1) "Öz qüllənə, sonra düz xətdəki qülləyə toxun. Divar, su, daş və qüllələr xətti bağlayır." (2) "Axın qülləni heç vaxt boşaltmır — yalnız böyüməsini dayandırır. Dayandırmaq üçün barmağınla axını kəs." (3) "Qüllə dolsun ki, səviyyə artsın: …" (4) "Bir yolda bərabər axınlar bir-birini yox edir: …" (5) "Atəş altındakı qüllə əsgər toplamır — hər qırmızı axına cavab ver." (6) "Öz dolu qüllənə axıt — o, əsgərlərini irəli ötürəcək: bu, təchizat xəttidir." Altı qayda və **ANLADIM** düyməsi ekrana **sığır**: heç bir sətir kəsilmir və "…" ilə bitmir, mətn şəkillərin və ya düymənin üstünə düşmür, sürüşdürmək lazım deyil; **ANLADIM** ilk toxunuşda kartı bağlayır və gəldiyin ekrana (Ayarlar / FASİLƏ kartı) qaytarır. 2 — dolu qülləyə axın açılan an onun üstündə ≈ 2–3 saniyəlik yazı: **"Təchizat xətti: dolu qüllə əsgərləri irəli ötürür"**; qüllə titrəmir (bu, "Doludur" xəbərdarlığı deyil). Axını kəsib yenidən açanda yazı **bir daha çıxmır** — hər oyunda bir dəfə (**II → YENİDƏN**-dən sonra yenə bir dəfə çıxa bilər, normaldır).
- **Alınmasa yaz:** `TF-29 FAIL: kartda N qayda / <qayda N> kəsilib / ANLADIM görünmür / ipucu çıxmadı / ipucu hər dəfə çıxır` (+ skrinşot).
- **Bağlayır:** GD-5f (cihaz təsdiqi) · **Ciddilik:** S2 — kart açılmır, qayda kəsilir və ya ANLADIM ekrandan kənardadır; S3 — ipucu çıxmır, təkrarlanır, ya da mətn / şəkil yöndəmsizdir.

### Necə hesabat vermək

1. Bütün nəticələri **bir mesajla** çata yaz. Hər uğursuz yoxlama üçün **bir sətir**: yoxlamanın id-si + nə oldu, altında skrinşot (və ya ekran yazısı). Uğurlu yoxlamaları sadəcə siyahı ilə yaz — sətirlərin bağlanması üçün bu da lazımdır.
2. Nümunə:
   ```
   Cihaz: iPhone 17 Pro Max, iOS 26.0, build 1.0.0 (21), başlama 21:10
   OK: TF-01 (3 s), TF-03, TF-04, TF-05, TF-07, TF-09, TF-10, TF-14, TF-16, TF-17, TF-18, TF-22, TF-23, TF-26, TF-29
   TF-27: Canlı / Kral / Pastel OK, rəng korluğu ilə OK, yenidən açılışda qaldı; bəyəndiyim: Kral
   TF-28: A OK · B OK (~0:34) · C OK · D OK · E OK
   TF-12: 5 — sağdan başladım, qələbə 2★ · 7 — sağdan başladım, qələbə 1★
   TF-13: 11 — qələbə 2★ · 13 — qələbə 2★ · 14 — qələbə 1★ · 16 — çatmadı
   TF-02 dil: oyun EN açıldı, telefon AZ-dır
   TF-06 FAIL: II düyməsi Dynamic Island-a toxunur [skrinşot]
   TF-13: səlistlik 4/5, ilıq, mətn aydın
   TF-24: əsgərlər seçilir hə, yeriyir hə, toz görünür hə
   TF-11 alınmadı · TF-19 edilmədi
   ```
3. Hər **FAIL** sətrini Producer **BUG** kimi qeydə alır (təkrar addımları, cihaz, iOS, ciddilik ilə), QA reqressiya testi əlavə edir. Sənin əlavə heç nə etməyinə ehtiyac yoxdur; sual olsa çatda soruşacağıq.

---

## EN — TestFlight check on the iPhone (≈ 60 minutes)

### 0. Before you start (2 min)

1. Note the iPhone model and iOS version: **Settings → General → About** (*Model Name*, *iOS Version*). Also note the build number TestFlight shows under the app name — it must be **21 or higher** (lower: stop and write `old build N` in the chat). This is the first line of the report.
2. Battery ≥ 50 %, **Low Power Mode off** (battery icon not yellow) — it caps the game at 30 frames per second and spoils TF-13.
3. Sound: Ring/Silent switch on **ring** (iPhone 15 Pro and later: Silent mode off via the Action button), volume up. *In Silent mode the game is silent — that is normal iOS behaviour, not a bug.*
4. Control Center (swipe down from the top-right corner) → **Portrait Orientation Lock off** (for TF-04).
5. Note the start time.
6. **Screenshot:** side button + volume up together (Home-button iPhones: Home + side). It lands in *Photos*; attach it in the chat like any picture. **Screen recording** (for stutter / freezes / how the soldiers walk): Control Center → the dot-in-a-circle button → records after 3 s; tap the red pill at the top to stop.
7. **If the app crashes** and TestFlight asks "Share additional information?": **Share** → put the check id in the comment (e.g. `TF-12`). Also write it in the chat — TestFlight feedback is visible only to you in App Store Connect, not to the team.
8. **Short on time:** do TF-01, 28 (levels 1–4; TF-05, 07, 08, 09 are checked inside it), 12, 13 (levels 5–10 and the lesson cards of item 11), 29, 27, then 23, 22, 24, 26, 25, 02, 06, 03, 10, 15, 17, 18 first (the news of builds 21, 20, 19 and 18 come first — level 5's new layout, the new lesson cards of 5 and 7, the fixed tutorial, the six-rule How to Play card and the supply-line hint, team colours; then the fixes for your own reports — cutting a stream, the drag line, supply lines, the soldiers, the title island, the new look), the rest later. **TF-28 resets the progress** (stars and gold are wiped, settings are kept), so the later checks run from level 1 again; this concerns only this test install.
9. **Known (no need to report):** nothing specific to build 21. Build 21 changes only where level 5's four grey towers stand (item 11); nothing else you can see. Build 20 changed the 2★ clocks of levels 11–16 and the DƏRS cards of levels 5, 7, 11, 13, 14, 16 (items 10 and 11). **Fixed in build 20:** on level 3, if you take the **left** grey tower first, the tutorial now shows the way at once (cut the stream into the left tower, then stream both towers into the right one; you have ≈ 10 s) — if you follow it and still lose, report it (GD-7h). TF-28 D still starts on the right, keep it that way. **Fixed in build 19 — if you see it now, report it as a normal FAIL:** the tutorial bubble covers no tower's number or body; the select line at the bottom ("Axın üçün qülləyə toxun · …" / Tap a tower to start a stream · …) never sits on the selected tower — when it would (e.g. on level 3) it moves to the top of the map, under the DƏRS card (GD-5c, GD-5d; report in TF-28). On level 2's "İndi yeni qülləyə, sonra qırmızıya toxun" (Now tap the new tower, then the red one) step the first tap on the new tower **selects** it and does not cut the stream from below (BUG-50); on level 3's "İndi o biri boz qülləni də götür" (Now take the other grey tower too) step nothing shakes and no "2 axın üçün L2 lazımdır" (L2 needed for 2 streams) shows (BUG-51) — TF-28 C and D. BUG-52 (the web version working offline after a single launch) is fixed too, but it does not concern the iPhone app — the game's files are inside the app; TF-18 is unchanged. The earlier known BUG-42 (the top tower's number behind the one below it) is **fixed since build 16** — if you see it now, report it in TF-24 as a normal FAIL.
10. **2★ clocks (builds 18–20):** on levels 2, 4, 5, 6 and 7 the time for 2 stars is 5–10 s shorter — on the result card: level 2 "3 ulduz: 00:20-dək · 2 ulduz: 01:10-dək" (3 stars by 00:20 · 2 stars by 01:10; was 01:15), level 4 00:25 / 02:10 (02:15), level 5 00:30 / 01:15 (01:20), level 6 00:25 / 01:35 (01:40), level 7 00:25 / 01:05 (01:15). The 3-star clocks are unchanged. **Build 19** also shortens levels 9 and 10: level 9 00:25 / 01:00 (01:05), level 10 00:20 / 01:05 (01:10). **Build 20** shortens levels 11–16 by 5–20 s — on the result card "3 ulduz: …-dək · 2 ulduz: …-dək" (EN "3 stars under … · 2 under …"): level 11 00:30 / 01:00 (was 01:10), 12 00:20 / 01:05 (01:10), 13 00:35 / 01:20 (01:25), 14 00:25 / 01:45 (01:55), 15 00:35 / 01:15 (01:35), 16 00:20 / 01:05 (01:15). No check asks for a particular 2★ time; in TF-11, TF-12, TF-13, TF-22 and TF-28, which play these levels (and in the 11–16 part of item 11), a time that gave 2★ on an earlier build may now give 1★ — **not a bug**. TF-07 (level 1) is unaffected; TF-21 asks for 3★, and the 3★ clocks did not change.
11. **Lesson cards (builds 19–21):** the **DƏRS** (lesson) card at the top of the level names the move that actually wins. **New in build 19:** 6 "Əvvəl Forpost" (Outpost First) — let your home fill to 25 first, then take both side towers; 8 "İki Baza" (Two Bases) — each base takes its near grey tower first, then stream them all into one target; 9 "Daş Divarlar" (Stone Walls) — names "evin" (your home) and "daş halqalı qüllə qaladır" (the tower in a stone ring is a fortress); 10 "Xətti Saxla" (Hold the Line) — side towers first, then the neutral fortress from both. **New in build 20:** 5 "Divarı Dolan" (Around the Wall) — go around the wall, **start on the right, where the enemy marches**, and push up that side first; 7 "Uzun Yürüş" (Long March) — never march straight at a far tower, take the near towers first, **starting on the right where the enemy marches**, and step up to the base; 11 "Qalanı Ac Qoy" (Starve the Keep) — first the grey tower **on the right**, under the barracks that feeds the fortress, then that barracks; 13 "Çarpaz Atəş" (Crossfire) — both near grey towers, then the artillery post, then hit the enemy's front barracks before it grows to level 2; 14 "Top və Divar" (Guns and Walls) — silence the guns, but not first: a near grey tower and the middle one, then the guns from five towers at once; 16 "Son Bastion" (Last Bastion) — the near grey towers from your home and fortress, **the right one first**; with five towers the camp and the guns, then everything onto the keep. **New in build 21:** level 5 "Divarı Dolan" (Around the Wall) has a new layout — the two grey towers on each side now stand on the line to the far tower. Start on the right as the card says, but a left start must not lose any more — if you started on the left and lost, say so. TF-12 (5–8) and TF-13 (9 or 10–12) play these levels; for the cards of 13, 14 and 16 carry on after TF-13 with **NÖVBƏTİ** up to level 16 (**×2** is fine, ≈ 12 min; if time is short, 11–16 can wait). **On 5, 7, 11, 13, 14 and 16 read the card and follow it literally; say whether you won and with how many stars** (following the card must win — a loss is exactly what the team needs to hear, always write it). The card must not be clipped (3 lines at most, all readable). If the card is unclear, write that too. On 5 and 7 also write: did you start on the right as the card says? (On 5, if you started on the left and lost, say so.) Example: `TF-12: 5 — started on the right, won 2★ · 7 — started on the right, won 1★`, `TF-13: 11 — won 2★ · 13 — lost · 14 — won 1★ · 16 — not reached`.

Colours: **your towers are blue**, the enemy's **red** (on levels with several enemies also **green** and **yellow**), neutral **grey**. "Notch / Dynamic Island" = the black cut-out or black "island" at the top of the screen; "home indicator" = the thin horizontal bar at the very bottom. "Stream" = the coloured band from tower to tower that soldiers walk along; "number" = the soldier count on the white badge over a tower.

### Summary

| ID | Check | Min | Closes | Severity if it fails |
|---|---|---|---|---|
| TF-01 | Install, new icon and first launch time | 2 | QA-2 | S1 no start / crash · S2 > 10 s or tracking prompt |
| TF-02 | Title screen clear of notch and home indicator, no bands at the edges; first language | 1 | MM-1, BUG-34 | S2 · S3 (language only) |
| TF-03 | Sound starts on the first tap | 1 | MM-1 | S2 |
| TF-04 | Screen stays portrait | 0.5 | MM-1 | S2 |
| TF-05 | Level 1 with one finger + tutorial hints; bigger towers | 2 | QA-2, ART-24 | S1 not winnable · S2 |
| TF-06 | HUD, LESSON card and PAUSED card clear of the notch | 1 | MM-1, BUG-34 | S2 |
| TF-07 | Result card (VICTORY) clear of the home indicator | 0.5 | MM-1 | S2 |
| TF-08 | Level 2: cancel a selection, no zoom (tutorial and the first cut — TF-28) | 1 | QA-2, BUG-33 | S2 |
| TF-09 | Level 3: top tower's number below it; a tower becomes L2 at 25 | 1 | QA-2, ART-24 | S2 |
| TF-10 | Background during a battle: sound stops, game stays paused | 1 | MM-1 | S2 |
| TF-11 | Stalemate hint (level 2 replay, optional) | 3 | QA-2 | S3 |
| TF-12 | Levels 5–8 in a row + background twice (memory / crash) | 5 | QA-2, MM-4 | S1 crash / ad in battle · S2 jumps back to title |
| TF-13 | Level 9 (or 10–12) at ×1: smoothness, warmth, sharpness | 3 | M3-5, MM-4 | S2 constant stutter / hot · S3 occasional |
| TF-14 | DAILY card: countdown, today's level, play | 2 | QA-2 | S1 does not open · S2 wrong level / time |
| TF-15 | Shop with the store unavailable | 2 | MM-1, QA-2 | S1 Apple payment sheet · S2 · S3 wording |
| TF-16 | Settings: AZ, colour-blind, reduced motion, How to play, privacy | 3 | QA-2 | S2 · S3 |
| TF-17 | Kill and relaunch — progress kept | 1 | QA-2 | S1 |
| TF-18 | Airplane mode: game and DAILY card work | 2 | QA-2 | S1 no start · S2 card |
| TF-19 | 04:00 Baku daily rollover (optional) | 3 | QA-2 | S2 |
| TF-20 | PAYLAŞ: result card → share sheet (WhatsApp / Telegram) | 2 | MM-8 | S2 · S3 image |
| TF-21 | No rating sheet after a 3★ win on level 10+ | 2 | MM-9 | S3 |
| TF-22 | Supply line: soldiers pass on through your own full tower | 3 | RELAY-1 | S2 · S3 |
| TF-23 | Swipe to cut a stream and the drag line | 2 | BUG-33, BUG-35, BUG-36 | S2 · S3 looks |
| TF-24 | Walking soldiers readable on their own stream, footstep dust | 2 | ART-20, BUG-39, ART-24 | S2 soldiers vanish · S3 |
| TF-25 | Combat effects (capture flash, landing ring) and light | 2 | ART-23 | S2 hitch on effects · S3 |
| TF-26 | Title island fills the 17 Pro Max screen | 1 | FE-12 | S2 a button hidden · S3 |
| TF-27 | Team colours: 4 sets on the title, map, play and shop; kept after a relaunch; combined with colour-blind | 3 | FE-14 | S2 not kept / a screen in the old colours · S3 |
| TF-28 | Tutorial: levels 1–4 as a first-timer, progress reset (middle tower first → supply-line step; side tower first → the cut) | 10 | GD-5a, GD-5b, GD-5e, GD-5c, GD-5d, BUG-50, BUG-51, QA-2 | S1 not winnable by following it · S2 · S3 |
| TF-29 | How to Play card: six rules (incl. the swipe and the supply line) fit the screen in AZ; the one-time supply-line hint | 3 | GD-5f | S2 card does not open / a rule clipped · S3 |

Severity (POST_LAUNCH §5.1): **S1** — crash, a level that cannot be won or loaded, progress lost, an ad during a battle or in levels 1–5 → fixed the same day. **S2** — a feature blocked for some users (a language, a device, the shop) → within 2 sessions. **S3** — cosmetic, wording, a single-device quirk → next release.

### Checks

#### TF-01 · Install, new icon and first launch time (2 min)
- **Tap:** TestFlight app → **Tower Clash: Tap & Conquer** (the App Store name; the home-screen icon says Tower Clash) → **Install**. When done, tap **Open** and start counting seconds until the title screen with the big **PLAY / OYNA** button is visible.
- **Expected:** the new **"Sunburst"** icon on the home screen — the blue-roofed clay tower with crossed swords in front of gold-amber rays (since build 9, ART-18); a short launch screen, then the title in ≤ 5 s. **No prompt at all**: no "Allow Tower Clash to track your activity…", no notification permission, no Google ad-consent form (that form appears only in the EU / UK).
- **If it fails, write:** `TF-01 FAIL: launch N s / crashed / tracking prompt shown / old icon`. Write the seconds on success too: `TF-01 OK 3 s`.
- **Closes:** QA-2 · **Severity:** S1 — does not start or crashes; S2 — longer than 10 s or a tracking prompt; S3 — old icon.

#### TF-02 · Title screen clear of the notch and home indicator; first language (1 min)
- **Tap:** nothing yet — just look. Take a screenshot.
- **Expected:** the language chip in the top-right corner (EN / AZ / RU / TR) is fully visible, not under the notch / Dynamic Island; the gold / crystal strip at the bottom sits above the home indicator, not cut. The sea and the island reach **all screen edges** — there must be **no** dark or grey band at the top or bottom (since build 9, BUG-34). Language: if the phone is set to AZ / RU / TR / EN, the game opens in that language.
- **If it fails, write:** `TF-02 FAIL: <what> under the notch / home indicator / band at the top-bottom` or `TF-02 language: game opened in EN, phone is AZ`.
- **Closes:** MM-1, BUG-34 · **Severity:** S2 — a button / text under the notch or home indicator; S3 — only the first language is wrong (it can be changed in Settings) or a band shows at an edge.

#### TF-03 · Sound starts on the first tap (1 min)
- **Tap:** make the language chip (top right) your **first tap** in the app. Keep tapping until the texts are Azerbaijani (chip **AZ**, big button **OYNA**). Then tap **Səs açıq / Səs bağlı** (Sound on / off) twice.
- **Expected:** a short "click" on **the very first tap**, and on every tap after it. With "Səs bağlı" no click; with "Səs açıq" it is back. (No sound at all: re-check item 3 of section 0 first.)
- **If it fails, write:** `TF-03 FAIL: first tap silent, sound from tap N` or `TF-03 FAIL: no sound at all (ring mode on)`.
- **Closes:** MM-1 · **Severity:** S2.

#### TF-04 · Screen stays portrait (0.5 min)
- **Tap:** on the title screen turn the phone sideways (landscape) for 3 s, then back. Repeat once during a battle in TF-05.
- **Expected:** the game does not rotate, stays upright; nothing stretched or cut.
- **If it fails, write:** `TF-04 FAIL: screen rotated / picture broken`.
- **Closes:** MM-1 · **Severity:** S2.

#### TF-05 · Level 1 with one finger + tutorial hints; bigger towers (2 min)
- **Tap:** *(Tutorial hints show only on a level without a star yet — level 1 has been cleared on your phone since build 7, so run this check as **part A of TF-28**, after the progress reset.)* **OYNA** → the **SƏVİYYƏLƏR** (levels) map → the circle **1** ("İlk Toxunuş" / First Taps). A "DƏRS" (lesson) card shows at the top (it goes away by itself after 8 s). **One finger only**: when the hint **"Öz qüllənə toxun"** (Tap your tower) appears, tap the blue tower with the ring → the hint becomes **"İndi boz qülləyə toxun — axın özü davam edir"** (Now tap the grey tower — the stream keeps flowing) → tap the grey tower. Then stream from your tower to the red tower (your tower, then the red one) and win. Once, tap a tower on its **roof** (the very tip).
- **Expected:** the map is seen straight from above (no perspective); towers and soldiers are **clearly bigger** than in build 14 (towers 1.3×, soldiers 1.75×, ART-24). The tap lands on the tower right under the finger (no offset), a tap on the roof selects the tower too; the selected tower lights up; soldiers flow along the stream; a light vibration when a tower becomes yours (if Settings → Sounds & Haptics → System Haptics is on). The level ends with the **QƏLƏBƏ** (VICTORY) card.
- **If it fails, write:** `TF-05 FAIL: tap not registered / lands on another tower / roof tap does nothing / hint missing / towers still small`.
- **Closes:** QA-2, ART-24 · **Severity:** S1 — level 1 cannot be won or taps do not work; S2 — offset taps, missing hint.

#### TF-06 · HUD, LESSON card and PAUSED card clear of the notch (1 min)
- **Tap:** as soon as level 1 or 2 starts (the DƏRS card still up) take a screenshot, and another one 10 s later. Then tap **II** (pause, top right) → the **FASİLƏ** (PAUSED) card → screenshot → **DAVAM ET** (RESUME).
- **Expected:** the top bar's glass reaches the very top of the screen (normal since build 9), but its contents — "SƏVİYYƏ 1" on the left, the timer, the speaker button, **II** — sit entirely **below** the notch / Dynamic Island; the bottom bar ("AXINLAR" streams pill, boosters, coins, **MENYU**) sits above the home indicator. The DƏRS card sits under the top bar and covers no tower's number. On the PAUSED card **DAVAM ET, SÜRƏT ×1, SƏS, AYARLAR, YENİDƏN, MENYU, NECƏ OYNANIR** are all visible and tappable.
- **If it fails, write:** `TF-06 FAIL: <button> under the notch / home indicator / the DƏRS card covers a number` (+ screenshot).
- **Closes:** MM-1, BUG-34 · **Severity:** S2.

#### TF-07 · Result card clear of the home indicator (0.5 min)
- **Tap:** when you win level 1, screenshot the card.
- **Expected:** **QƏLƏBƏ**, the stars, "Vaxt …" (Time), "3 ulduz: …-dək · 2 ulduz: …-dək", **PAYLAŞ** (SHARE) and the **NÖVBƏTİ / YENİDƏN / MENYU** (NEXT / RETRY / MENU) buttons are fully visible. If a **×2 QIZIL** (×2 GOLD) button is shown (optional): tap → an ad video plays (a Google **"Test Ad"** or a regular ad — both are **normal** on TestFlight; do not tap the ad itself); close it when it ends → the gold doubles.
- **If it fails, write:** `TF-07 FAIL: <button> cut / under the home indicator`.
- **Closes:** MM-1 · **Severity:** S2.

#### TF-08 · Level 2: cancel a selection, no zoom (1 min)
- **Tap:** in step 4 of **part C of TF-28** (level 2's tutorial is over by then) or later via **MENYU** → map → **2**. *(Since build 18 level 2's tutorial hints and the first cut are in TF-28; swiping across a stream is TF-23.)*
  1. **Cancel a selection:** tap your tower once (it lights up, the line **"Axın üçün qülləyə toxun · dayandırmaq üçün yenə toxun və ya xətti kəs"** (Tap a tower to start a stream · tap again or swipe across it to stop) appears at the bottom) → **tap the same tower again**.
  2. **Double-tap** a tower quickly; then **press and hold** a tower for 1 s.
  3. Go on and win the level.
- **Expected:** 1 — the highlight and the bottom line disappear, no stream starts; 2 — the screen does **not zoom**, no magnifier, no "Copy" menu, no text selection, the screen does **not scroll** under the finger.
- **If it fails, write:** `TF-08 FAIL: step N — <what happened>`.
- **Closes:** QA-2, BUG-33 · **Severity:** S2.

#### TF-09 · Level 3: top tower's number below it; a tower becomes L2 at 25 (1 min)
- **Tap:** in **part D of TF-28** (level 3 "Sahibsiz Torpaq" / Free Real Estate): first look at the red tower at the very top of the screen. After taking both grey towers watch one of your towers fill to 25 (a tower that sends no stream fills).
- **Expected:** the number of the red tower at the very top sits **under** the tower, below its base (there is no room above it — so since build 15, not a bug), both while the DƏRS card is up and after it has gone; the number is fully readable. When a tower reaches 25 it grows (level 2, a gold fountain); the level ends with **QƏLƏBƏ**. Since build 18 level 3 has **no "fill to 25" hint** — it moved to level 4 (TF-28 E); its absence is not a bug.
- **If it fails, write:** `TF-09 FAIL: the red tower's number is covered / tower did not grow at 25`.
- **Closes:** QA-2, ART-24 · **Severity:** S2.

#### TF-10 · Background during a battle: sound stops, game stays paused (1 min)
- **Tap:** in level 3 or 4, while soldiers move and sounds play, remember the timer at the top → swipe up from the bottom edge (go to the home screen) → wait 10 s and listen → open Tower Clash again.
- **Expected:** **no** game sound on the home screen; back in the game it waits on the **FASİLƏ** card, the timer has not moved on, the level is not lost; **DAVAM ET** → the game continues, sound comes back on the next tap; the top / bottom bars are still clear of the notch (as in TF-06).
- **If it fails, write:** `TF-10 FAIL: sound kept playing in background / game had moved on / sound did not come back`.
- **Closes:** MM-1 · **Severity:** S2.

#### TF-11 · Stalemate hint — optional (3 min)
- **Tap:** **MENYU** → map → **2** (already cleared, no tutorial hints). As soon as it starts (first 3 s): tap your bottom tower, then the grey tower on the **right**. The red will take the middle grey tower. At about **0:12** a red stream comes from the middle tower to your tower → at once (within 2 s): your tower → the right tower (that stream stops) → the **middle** tower (your stream now runs against the red one).
- **Expected:** after ~8–10 s, once, a red line: **"Axın ilişib — dayandır və başqa tərəfdən vur"** (Stalemate — stop the stream and hit from another side). Then finish the level normally.
- **If it fails, write:** situation never came up (the red did not attack) — `TF-11 not reached` (this is **not** a bug); you did the steps, the streams cancel for more than 15 s and no line appears — `TF-11 FAIL: hint did not show`.
- **Closes:** QA-2 · **Severity:** S3.

#### TF-12 · Levels 5–8 in a row + background twice (memory / crash) (5 min)
- **Tap:** level 4 is cleared at the end of TF-28 — start at 5 with **NÖVBƏTİ**. To save time tap **II → SÜRƏT ×1** so it reads **×2**. After each win **NÖVBƏTİ**; after a loss **YENİDƏN**. In level 5: go to the home screen, wait 10 s, come back, **DAVAM ET**. In level 7: go to the home screen, use **Camera** or **Safari** for 30 s, come back, **DAVAM ET**. Read each level's **DƏRS** card and do what it says (section 0, item 11).
- **Expected:** no crash; the game does **not jump back to the title screen by itself** (that is the sign iOS closed the game for memory); on return the PAUSED card shows. From the sixth finished level on (wins and losses both count) a full-screen ad may appear **between** levels (a Google **"Test Ad"** or a regular ad) — normal on TestFlight, do not tap the ad itself, close it with ×. There must **never** be an ad **during** a battle, and none after the first 5 finished levels. After level 8 the DAILY card unlocks. The 2★ clocks of levels 5, 6, 7 are shorter in build 18 (01:15 / 01:35 / 01:05; section 0, item 10) — a 1★ win is not a bug. The DƏRS cards of 6 and 8 are new in build 19, those of 5 and 7 in build 20 (5 and 7 say "start on the right"): fully readable, not clipped; the select line does not sit on your selected tower here either (GD-6g).
- **If it fails, write:** `TF-12 FAIL: crashed in level N / jumped back to title / ad during a battle`.
- **Closes:** QA-2, MM-4 · **Severity:** S1 — crash, an ad during a battle or within the first 5 finished levels; S2 — jumps back to the title by itself (even if progress is kept).

#### TF-13 · Level 9 (or 10–12) at ×1: smoothness, warmth, sharpness (3 min)
- **Tap:** **II → SÜRƏT ×2** so it reads **×1** again. Play level 9 "Daş Divarlar" (Stone Walls) — or 10 "Xətti Saxla", 11 "Qalanı Ac Qoy", 12 "Top Postu" — for **2 minutes** (the DƏRS cards of 9 and 10 are new in build 19, that of 11 in build 20 — read and follow them, section 0, item 11; then carry on up to 16 for the cards of 13, 14 and 16), watching the moments when most soldiers clash and towers change hands (since build 14 those moments have flash, ring and spark effects — rate smoothness with them on). At the end touch the back of the phone.
- **Expected — always answer:** (a) smoothness **1–5** (5 = smooth like a video, 1 = choppy); (b) the phone is **cool / warm / hot**; (c) tower numbers and texts are **crisp** at normal distance, or blurry? Expected: 4–5, warm at most, crisp. *Optional comparison:* open `https://pervincinal.github.io/InsiderTest/?dprcap=3` in Safari (the web version, separate progress) — the title texts should differ from the app's only "with the nose on the glass".
- **Answer example:** `TF-13: smoothness 4/5, warm, text crisp`; attach a screen recording if something is off.
- **Closes:** M3-5, MM-4 · **Severity:** S2 — constant stutter (≤ 2/5) or the phone gets hot; S3 — an occasional hitch (3/5) or text slightly soft up close.

#### TF-14 · DAILY card: countdown, today's level, play (2 min)
- **Tap:** **MENYU** → the **SƏVİYYƏLƏR** map; look at the **GÜNLÜK** (DAILY) card at the top. If level 8 is cleared, tap the card and play.
- **Expected:** before level 8 the card shows a lock, **"Səviyyə 8 keçiləndə açılır"** (Clear level 8 to unlock) and **"Yenisi N saata (00:00 UTC)"** (New in N h). N = hours left until 04:00 Baku, rounded up (e.g. at 21:15 → 7); in the last hour "Yenisi 12:34 sonra (00:00 UTC)". Once unlocked, line 2 shows **level name · twist** as in the table below. A win → **"Günlük çağırış keçildi · +… qızıl +5 kristal · seriya 1"**; the card then shows **TAMAM** (DONE) and "Rekord …★ · time". A **"Dünənki xəritə"** (Yesterday's map) row may show under the card — optional.
- **If it fails, write:** `TF-14 FAIL: card says X, table says Y / countdown N h, expected M / did not open`.
- **Closes:** QA-2 · **Severity:** S1 — the daily level does not open or crashes; S2 — wrong level or wrong countdown.

Daily table (the date is UTC: in Baku from **04:00** that day to **03:59** the next day):

| Date (UTC) | Level | On the card | Date (UTC) | Level | On the card |
|---|---|---|---|---|---|
| 2026-10-21 | 46 | Çay Qapısı · Az ərzaq (River Gate · Lean rations) | 2026-10-28 | 14 | Top və Divar · İti addım (Guns and Walls · Fast feet) |
| 2026-10-22 | 27 | Zireh Yarışı · Güclü qarnizon (Armour Race · Reinforced) | 2026-10-29 | 40 | Tac · Nazik divarlar (The Crown · Thin walls) |
| 2026-10-23 | 17 | Mina Sahəsi · Nazik divarlar (Minefield · Thin walls) | 2026-10-30 | 23 | İlk Qan · Az ərzaq (First Blood · Lean rations) |
| 2026-10-24 | 25 | Ağır Metal · İti addım (Heavy Metal · Fast feet) | 2026-10-31 | 15 | Sitadel · Güclü qarnizon (The Citadel · Reinforced) |
| 2026-10-25 | 34 | Ən Zəif Halqa · Güclü qarnizon (Weakest Link · Reinforced) | 2026-11-01 | 30 | Bir Cəbhə · Nazik divarlar (One Front · Thin walls) |
| 2026-10-26 | 41 | Əkiz Çaylar · Klassik (Twin Rivers · Classic) | 2026-11-02 | 43 | Dəmir Karvan · İti addım (Iron Convoy · Fast feet) |
| 2026-10-27 | 46 | Çay Qapısı · Güclü qarnizon (River Gate · Reinforced) | 2026-11-03 | 28 | Keçidi Tut · Az ərzaq (Hold the Ford · Lean rations) |

#### TF-15 · Shop with the store unavailable (2 min)
- **Tap:** title screen → **MAĞAZA** (SHOP). This build must show two tabs only: **GÖRÜNÜŞ / TƏLİM** (SKINS / UPGRADES) — PUB-14: without in-app purchases the KRİSTAL and DƏSTLƏR (CRYSTALS / BUNDLES) tabs are hidden.
  1. Look at the tab row, then scroll up and down on both tabs.
  2. **GÖRÜNÜŞ**: tap **Şifer** (Slate, 80 crystals); if a skin is marked "YALNIZ DƏSTDƏ" (PACK ONLY), tap it too.
  3. **TƏLİM**: buy one upgrade if you have enough gold.
- **Expected:** 1 — the shop opens with **GÖRÜNÜŞ** and **TƏLİM** only; the **KRİSTAL** and **DƏSTLƏR** tabs are **absent** (not greyed — not shown at all); nowhere a $ price ($0.99 …), a crystal pack, a bundle, the line "Mağaza bu platformada mümkün deyil" (Store unavailable on this platform) or the **ALIŞLARI BƏRPA ET** (RESTORE PURCHASES) button; **no Apple payment sheet, no Apple ID password prompt, ever**. 2 — after 40 minutes of play there are few crystals, so **"Kristal çatmır"** (Not enough crystals) is the correct result and the crystal count does not change (with ≥ 80: "Şifer dam açıldı və taxıldı"); PACK ONLY → a text line only ("Başlanğıc dəsti ilə gəlir" or "Premium dəsti ilə gəlir"), no price, no payment sheet. 3 — a "<name> pillə 1: …" line (tier 1), the gold goes down.
- **If it fails, write:** `TF-15 FAIL: CRYSTALS/BUNDLES tab shown / a price or the restore button shown / Apple payment sheet opened / <tab> crashed / wording: …`.
- **Closes:** MM-1, QA-2 · **Severity:** S1 — an Apple payment sheet or any request for money; S2 — crash, a CRYSTALS / BUNDLES tab (even greyed), a price or the restore button is shown; S3 — wording / translation.

#### TF-16 · Settings (3 min)
- **Tap:** title screen → **Ayarlar** (Settings). Do **not** tap **İRƏLİLƏYİŞİ SIFIRLA** (RESET PROGRESS) here (only at the start of TF-28). The **Komanda rəngləri** (Team colours) row is TF-27.
  1. In the **Dil** (Language) row make sure **Azərbaycanca** is selected (select it if not).
  2. **Rəng korluğu** (Colour-blind) → **AÇIQ** (ON) → **GERİ** → **OYNA** → open any level and look → **MENYU**. Afterwards set it the way you like in Settings.
  3. **Az hərəkət** (Reduced motion) → **AÇIQ** → **GERİ**, look at the title screen, play a level for 10 s → **MENYU** → **Ayarlar** → **AVTO**.
  4. **Necə oynanır** (How to play) → the card → **ANLADIM** (GOT IT) (the card itself is TF-29).
  5. Look at the "About" card at the bottom: the version and the **MƏXFİLİK SEÇİMLƏRİ** (PRIVACY OPTIONS) button (tap it if it is there).
- **Expected:** 1 — all menus in Azerbaijani. 2 — enemy towers change from **red to orange**, yours stay blue. 3 — the marching soldiers on the title stop; in battle soldiers glide without stepping, no footstep dust and no capture flash, effects are reduced; AVTO follows the iPhone's *Reduce Motion* setting. 4 — the **NECƏ OYNANIR** card with **6** rules (5 in build 18), all on screen, **ANLADIM** returns to Settings. 5 — **"Versiya 1.0.0 (build 20)"** (or the higher number TestFlight shows) and "İrəliləyiş bu cihazda saxlanılır" (Progress is stored on this device). In Azerbaijan **no PRIVACY OPTIONS button is normal** (Google shows it only in the EU / UK); if it is there, a tap opens a Google form that returns to the game. No "Dəstək ID" (Support ID) row in this build — normal.
- **If it fails, write:** `TF-16 FAIL: step N — <what happened>`.
- **Closes:** QA-2 · **Severity:** S2 — a setting does not apply, a different version, the privacy button errors; S3 — looks / wording.

#### TF-17 · Kill and relaunch — progress kept (1 min)
- **Tap:** swipe up from the bottom and hold in the middle (app switcher) → flick the Tower Clash card up. Open it again from the icon → **OYNA**.
- **Expected:** still **Azerbaijani**; gold / crystals at the bottom as before; the stars of the cleared levels on the map (those cleared after the TF-28 reset); the colour-blind and **Team colours** settings as you left them.
- **If it fails, write:** `TF-17 FAIL: stars / gold / language lost`.
- **Closes:** QA-2 · **Severity:** S1 (data loss).

#### TF-18 · Airplane mode: game and DAILY card work (2 min)
- **Tap:** Control Center → **Airplane Mode on**, Wi-Fi icon off as well. Kill the app as in TF-17 and open it again → **OYNA** → play any level to the end → look at the DAILY card on the map (tap it and play a little if unlocked). Afterwards **turn Airplane Mode off**.
- **Expected:** the title opens in the usual time; the level loads, **"Yüklənmədi — bağlantını yoxla"** (Couldn't load — check your connection) does not appear; the DAILY card shows its countdown and opens its level. On the result card **×2 QIZIL** may be missing or say "Hazırda video yoxdur" (No video available right now) — normal offline.
- **If it fails, write:** `TF-18 FAIL: did not start offline / level did not load / daily card: …`.
- **Closes:** QA-2 · **Severity:** S1 — the app or a level does not open offline; S2 — only the DAILY card fails.

#### TF-19 · 04:00 Baku daily rollover — optional (3 min)
- **Tap (A, natural):** at 03:57 Baku time open the game, look at the DAILY card on the **SƏVİYYƏLƏR** map and wait until 04:01.
- **Tap (B, change the clock — after every other check):** iPhone **Settings → General → Date & Time** → **Set Automatically off** → set the time to **03:58** (tomorrow's date is fine) → open the game → map → wait 2–3 min → then **turn Set Automatically back on**. Changing the clock may confuse the streak / daily reward on this test install — that is **not** a bug.
- **Expected:** shortly before 04:00 the card counts down like "Yenisi 01:59 sonra (00:00 UTC)"; at exactly 04:00 the card switches to the **next day's** level (table), and **TAMAM** disappears if today's was done. If the card is locked, check only that the countdown runs out and starts again at ~24 h.
- **If it fails, write:** `TF-19 FAIL: card did not change at 04:00 / changed at another time (HH:MM)`.
- **Closes:** QA-2 · **Severity:** S2.

#### TF-20 · PAYLAŞ — share sheet from the result card (2 min)
- **Tap:** finish any level (win or loss) → **PAYLAŞ** on the result card → the iPhone share sheet opens → pick **WhatsApp** or **Telegram** → send it to yourself. Then **PAYLAŞ** once more → pick **Save Image** → **Allow** the Photos permission prompt → the card appears in Photos. A third **PAYLAŞ** → swipe the sheet down to **dismiss** it.
- **Expected:** the sheet opens at once (≤ 2 s); the sent image is a portrait card (1080×1350): the biome's island, the tower, "QƏLƏBƏ"/"MƏĞLUBİYYƏT", level name and number, stars, time, the version at the bottom; a text line with the game link comes along. After dismissing, the game stays on the result card with no error text. A **DAILY** / **WEEKLY** result also shows the day/week key and the twist on the card; yesterday's map (practice) has **no PAYLAŞ** — that is not a bug.
- **If it fails, write:** `TF-20 FAIL: sheet did not open / image blank or black / wrong text / app closed on Save Image [screenshot]`.
- **Closes:** MM-8 (device confirmation) · **Severity:** S2 — the sheet does not open or no image arrives; S3 — clipped text on the image.

#### TF-21 · No rating sheet after a 3★ win on level 10+ (2 min)
- **Tap:** after TF-13, win level **10, 11 or 12** with **3 stars** (after the TF-28 reset, 10 opens only once 9 is cleared) (boosters are fine). Wait 5 seconds on the result card, then go back to the map and open another level. Then in a browser (1 min): github.com/pervincinal/InsiderTest → *Settings* → *Secrets and variables* → *Actions* → **Variables** tab — look for a variable named `RATING_PROMPT`.
- **Expected:** no "Enjoying Tower Clash?" / star-rating sheet appears — neither on the result card nor on the map; the result card works as usual (buttons, PAYLAŞ), no crash, no freeze. GitHub has **no** `RATING_PROMPT` variable (or its value is not `on`). *Note: Apple never shows this sheet in TestFlight builds, so the real proof is the missing variable; the phone half checks that nothing breaks after a 3★ win.* If two tries give no 3★, write `TF-21 not reached` — not a bug.
- **If it fails, write:** `TF-21 FAIL: rating sheet after 3★ / result card froze / RATING_PROMPT = on [screenshot]`.
- **Closes:** MM-9 (device confirmation; MM-10 build variable) · **Severity:** S3 — the variable is removed before the App Store build is made, because the review notes (APP_STORE_CONNECT_SHEET §6.4) say this version never asks for a rating.

#### TF-22 · Supply line: soldiers pass on through your own full tower (3 min)
- **Tap:** **MENYU** → map → **2** "Təchizat Xətti" (Supply Line; already cleared, no hints). Make sure the speed is ×1 (**II → SÜRƏT**).
  1. Tap your bottom tower, then the **middle** grey tower — the middle tower becomes yours (the stream keeps going).
  2. As soon as the middle tower is blue: tap the middle tower, then the **red** tower at the very top (middle → red stream).
  3. Wait: the stream from below fills the middle tower. When the middle tower's number reaches **25** its badge turns **gold** and the stream from below **stops by itself** (the usual "reinforce until full" behaviour).
  4. Now again: tap your bottom tower, then the **full** middle tower (or drag with your finger from the bottom tower onto the middle one). Watch for 20 s.
- **Expected:** in step 4 the stream opens and **does not stop**; **no** "Doludur" (Full) line, the tower does not shake; blue soldiers from below walk into the middle tower and leave it at once **onward** on its stream to the red — the middle → red stream carries visibly more soldiers than before; the middle tower stays at 25 (gold). Since build 19 a short **"Təchizat xətti: dolu qüllə əsgərləri irəli ötürür"** (Supply line: your full tower passes soldiers on) line shows once over the tower the moment the stream opens — not a warning (TF-29). If you stop the middle tower's stream to the red (swipe across it), the stream from below stops by itself a moment later. Finish the level normally.
- **If it fails, write:** `TF-22 FAIL: step 4 — "Doludur" shown / stream did not open / stream stopped by itself / soldiers vanished in the middle` (+ screen recording). If the red keeps hitting the middle tower below 25, wait a little and repeat step 4 — that is not a bug.
- **Closes:** RELAY-1 (device confirmation; GDD §2.0b rule 13) · **Severity:** S2 — no supply line (refused, "Full" or it stops by itself); S3 — it works but reads confusingly.

#### TF-23 · Swipe to cut a stream and the drag line (2 min)
- **Tap:** in any open level (e.g. 4):
  1. **Drag:** press your tower and, **without lifting**, drag toward another tower; lift over that tower.
  2. Drag again, but this time lift the finger over **empty ground**.
  3. **Cut:** start on empty ground and swipe quickly across one of your streams. Then swipe one line across **two** streams at once.
  4. Start a drag from your tower and lift the finger over the **MENYU** button at the bottom; then swipe from empty ground and lift over the **⚡ (OVERDRIVE)** button.
- **Expected:** 1 — as soon as the finger moves a **gold dashed line** runs from the tower to the finger and follows it; over a tower it can reach the line turns solid and "snaps" onto it; lifting starts the stream; the screen does not scroll under the finger. 2 — the line disappears, nothing happens. Lifting over a tower whose lane is walled off: **"Yol bağlıdır — açıq düz xətt yoxdur"** (Blocked — no clear line). 3 — the cut stream(s) stop **at once**, a short white trail stays behind the finger; enemy streams are not cut. 4 — **no button is pressed**: the level is not left, no gold is spent, OVERDRIVE does not fire (since build 10, BUG-36).
- **If it fails, write:** `TF-23 FAIL: step N — <what happened>` (+ screen recording).
- **Closes:** BUG-33, BUG-35, BUG-36 (device confirmation) · **Severity:** S2 — no line, the stream is not cut, the screen scrolls or a button is pressed; S3 — how the line / trail looks.

#### TF-24 · Walking soldiers readable on their own stream, footstep dust (2 min)
- **Tap:** in one of levels 4–6 open two or three streams. Hold the phone at a normal distance (arm's length) and watch the soldiers for 30 s; take a 10 s screen recording of one stream. On a level with a tank factory (e.g. 25 "Ağır Metal" / Heavy Metal, which can also come up on the DAILY card) look at the tanks too.
- **Expected:** soldiers **stand out on their own coloured stream** — each has a dark outline, a column does not "melt" into the band (your build-11 report, BUG-39); soldiers are bigger than in build 14 (1.75×). Soldiers really **walk**: two legs step, a slight forward lean, a spear and two eyes; small **dust puffs** rise under their feet (on every ground: grass, sand, snow…); tank treads turn. The number of the tower at the very top of the map sits **under** or beside the tower when needed and never overlaps another number (BUG-42 fixed in build 16).
- **Answer:** `TF-24: soldiers stand out yes/no, walk yes/no, dust visible yes/no` (+ screen recording).
- **Closes:** ART-20, BUG-39, ART-24, BUG-42 · **Severity:** S2 — soldiers vanish on the stream or numbers overlap; S3 — no visible stride / dust, or it looks odd.

#### TF-25 · Combat effects and light (2 min)
- **Tap:** on the TF-24 level take a grey or red tower; then send soldiers into one of your own towers; open a new stream; fill a tower to 25 so it becomes L2. Look at the island and the sea as well.
- **Expected:** when a tower changes hands a **flash ring** and clay chips, the number badge glows white for a moment; when soldiers land on a tower **rings and sparks** (on neutral towers too); a **pulse** runs along a new stream, a soft glow under every stream; a **gold fountain** on the upgrade to L2. Light: a warm pool of sunlight on one side of the island and a cool shade on the other, lit cliff edges, sun glitter on the sea, highlights on the tower roofs. The effects do not slow the game down (compare with TF-13).
- **If it fails, write:** `TF-25 FAIL: <effect> not visible / hitch during effects / light too dark-bright` (+ screenshot).
- **Closes:** ART-23 · **Severity:** S2 — a clear hitch during effects or an effect makes a number unreadable; S3 — an effect missing or not liked.

#### TF-26 · Title island fills the 17 Pro Max screen (1 min)
- **Tap:** go back to the title screen from MENYU, look without tapping, take a screenshot. Then tap each button once and come back: the language chip, settings (gear), sound, **MAĞAZA** (SHOP), the daily chest bottom right, the trophy bottom left, the gold / crystal strip at the bottom.
- **Expected:** the island **fills the screen from top to bottom** — not a small island "floating" in a big sea (your build-12 note "too much sea on the title", FE-12); towers and walking soldiers on the island; no button under the Dynamic Island or the home indicator, each opens on the first tap.
- **If it fails, write:** `TF-26 FAIL: island small, lots of sea at the top/bottom / <button> does not open or sits under the notch` (+ screenshot).
- **Closes:** FE-12 · **Severity:** S2 — a button hidden or not working; S3 — the island does not fill the screen.

#### TF-27 · Team colours: four sets on every screen, kept after a relaunch, combined with colour-blind (3 min)
- **Tap:** title screen → **Ayarlar** (Settings, gear). Under the language picker the **"Komanda rəngləri"** (Team colours) row: four coloured dots next to its name, below it four buttons — **Klassik / Canlı / Kral / Pastel** (Classic / Vivid / Royal / Pastel).
  1. Tap **Canlı** → **GERİ** → look at the title screen (the roofs of the island's towers, the marching soldiers), screenshot → **OYNA** → look at the **SƏVİYYƏLƏR** map (the open level's circle) → play any open level for 10 s (your and enemy towers, streams, soldiers, number badges), screenshot → **II** (the PAUSED card) → **MENYU** → **MAĞAZA** → look at the roof / helmet previews on the **GÖRÜNÜŞ** tab.
  2. Repeat the same with **Kral**, then with **Pastel** (each at least the title and a battle, with screenshots).
  3. With a set selected (e.g. Kral) turn **Rəng korluğu → AÇIQ** (Colour-blind ON) → play a level for 10 s → **MENYU** → **Ayarlar** → set Colour-blind back as it was.
  4. Pick the set you like best (**Klassik** if undecided). Kill the app as in TF-17 and open it again from the icon → **Ayarlar**.
- **Expected:** 1–2 — the chosen button lights up, the four dots next to the row show that set's colours; the change shows **at once** (no relaunch needed). On the title island, the open level's circle on the map, in battle (towers, streams, soldiers), on the PAUSED card's **DAVAM ET** button and in the shop's skin previews the colour families stay — **yours blue, the enemy red** (green and yellow on levels with more enemies), neutral **grey** — only the shade changes: **Canlı** (Vivid) — brighter, saturated (electric blue, signal red); **Kral** (Royal) — darker, deeper (navy, crimson, emerald, old gold); **Pastel** — light, chalky and soft. The numbers stay crisp in every set. The **İRƏLİLƏYİŞİ SIFIRLA** (RESET PROGRESS) button is the same red in every set; the buy buttons in the shop do not change — normal. 3 — with colour-blind on, the main enemy turns **orange** (other enemies purple / teal), your towers keep the chosen set's blue; switching it off brings the set's usual colours back. 4 — after the relaunch the title opens straight in the chosen set and that button is selected in Settings.
- **Answer:** `TF-27: Canlı / Kral / Pastel OK, with colour-blind OK, kept after relaunch; my pick: <set>` or `TF-27 FAIL: <set> — <screen> kept the old colours / choice lost / number unreadable` (+ screenshot). **Always name the set you like** — the store pictures will be made with it (no answer = **Klassik** stays).
- **Closes:** FE-14 (device confirmation), the ART-25 decision · **Severity:** S2 — the choice is lost on relaunch, a screen keeps the old colours, a number is unreadable, or a crash; S3 — a shade not liked.

#### TF-28 · Tutorial: levels 1–4 as a first-timer, progress reset (10 min)
- **Preparation:** the tutorial bubble (text in a gold frame + arrow + pulsing ring) shows only on a level without a star yet; on your phone 1–4 are cleared. So: **Ayarlar → İRƏLİLƏYİŞİ SIFIRLA → SIFIRLA** (Settings → Reset progress → Reset). Stars and gold are wiped, **settings are kept** (language, colour-blind, team colours) — on this test install only. Speed **×1**. Read the **DƏRS** (lesson) card at the top of every level. Do what the bubble says, as a new player would (except in part B).
- **A. Level 1 "İlk Toxunuş" (First Taps)** — as in TF-05: **"Öz qüllənə toxun"** (Tap your tower) → **"İndi boz qülləyə toxun — axın özü davam edir"** (Now tap the grey tower — the stream keeps flowing). Win (TF-07's screenshot goes here too) → **NÖVBƏTİ**.
- **B. Level 2 "Təchizat Xətti" (Supply Line) — middle tower first (the supply-line branch).** Do this **before** you win level 2 — once it is won, its tutorial never shows again.
  1. Bubble **"Öz qüllənə, sonra boz qülləyə toxun"** (Tap your tower, then the grey tower) — ring on the **right-hand** (side) grey tower. This time do **not** follow it: about **3 s** after the level starts (the DƏRS card may still be up) tap your bottom tower, then the **middle** grey tower.
  2. When the middle tower is blue: tap the middle tower, then the **red** tower at the very top.
  3. Wait (until ≈ 30–35 s into the level): the middle tower fills to **25**, its badge turns **gold**, the stream from below stops by itself.
  4. When a new bubble shows, follow it: tap your bottom tower, then the **full** middle tower. Watch for 10 s.
  5. **II → YENİDƏN** (Retry; do not win the level yet).
- **Expected B:** 1 — a stream opens into the middle tower and the bubble does **not change** (it stays on the side tower and hides by itself after 20 s at most); while the middle tower is still grey **no "cut" bubble** shows (in build 17 this exact moment said "stop the stream", and a player who did lost the level). 3 — once the middle tower is at 25 (gold) and streams to the red, the bubble reads **"Dolu qüllə əsgərləri irəli ötürür: ona axıt"** (A full tower passes soldiers on: stream into it), ring on the **middle** tower. Another bubble may flash up before it — normal. 4 — the stream opens, **no "Doludur" (Full) line**, blue soldiers from below walk through the middle tower on to the red (as in TF-22), the bubble goes away and no other bubble follows; the "Təchizat xətti: …" (Supply line) hint does **not** show here either (this step is the lesson; the hint is TF-29). If the red takes the middle tower first or keeps it below 25: **II → YENİDƏN** and try again; after two tries write `TF-28 B not reached` — not a bug.
- **C. Level 2 — side tower first (the main line), win.**
  1. Bubble **"Öz qüllənə, sonra boz qülləyə toxun"** (ring on the right-hand grey tower) → tap your tower, then the **right-hand** grey tower.
  2. When the right-hand tower is blue the bubble reads **"İndi yeni qülləyə, sonra qırmızıya toxun"** (Now tap the new tower, then the red one; ring on the red tower) → do what it says: tap your new tower, then the red one (no tap on empty ground in between).
  3. Bubble **"Axını barmağınla kəs ki, qüllən böyüsün"** (Swipe across the stream so your tower grows) — the ring sits **in the middle of the blue stream** from your bottom tower to the side tower (not on a tower) → start on empty ground and swipe across that stream.
  4. Go on and win the level (do TF-08 here).
- **Expected C:** the DƏRS card reads "Yolda duran qüllə arxasındakı düşməni gizlədir: yan qüllədən dolan. Göndərmək qülləni boşaltmır, yalnız böyüməsini dayandırır" (A tower in the way hides the enemy behind it: go around it by the side tower. Sending never empties your tower, it only stops it growing) — the old ending "ona görə axınlarını dayandırma" (so keep your streams running) is **gone**. 1 — a stream starts, the bubble hides; no bubble while the side tower is still grey. 2 — when the bubble shows no tower is selected; the first tap on the new tower **selects** it (it lights up) and the stream from below into it **keeps running**; the second tap (on the red) opens the side → red stream and the "cut" bubble shows. **Must not happen:** the first tap cutting the stream from below and the "cut" bubble never showing (that was build 18 — BUG-50, fixed in build 19). 3 — the bubble does not cover the side tower's number; the stream stops **at once**, a short white trail, the bubble goes away; your bottom tower's number starts rising again. On this line the supply-line bubble **does not show**. The level ends with **QƏLƏBƏ**; the card says "3 ulduz: 00:20-dək · 2 ulduz: 01:10-dək".
- **D. Level 3 "Sahibsiz Torpaq" (Free Real Estate).** Bubble **"Öz qüllənə, sonra boz qülləyə toxun"** (ring on the **right-hand** grey tower) → tap your tower, then the right-hand grey tower. When it is blue the bubble reads **"İndi o biri boz qülləni də götür"** (Now take the other grey tower too; ring on the **left-hand** grey tower) → tap only the left-hand grey tower, **once**. Win (do TF-09 here).
- **Expected D:** the second bubble shows only after the first grey tower is yours; when it shows, **your new (right-hand) tower is already selected** (selection ring around it), so one tap on the left-hand tower opens a stream from it; the bubble goes away and no other bubble follows on this level. **Must not happen:** a shake and **"2 axın üçün L2 lazımdır"** (L2 needed for 2 streams) (in build 18 the selection stayed on your home tower — BUG-51, fixed in build 19). There is **no** "fill to 25" bubble on this level any more.
- **E. Level 4 "Güc Topla" (Build Up).** The DƏRS card reads "Qüllənin axınını dayandır, qoy dolsun: 25 əsgərdə özü yüksəlir…" (Stop your tower's stream and let it fill up: at 25 units it upgrades itself…). At first there is **no** bubble — normal. Tap your tower, then the **left-hand** grey tower. When it is blue the bubble reads **"Bu qüllənin axınını dayandır ki, böyüsün"** (Stop this tower's stream so it can grow; ring on your bottom tower, which is already selected) → stop the stream (swipe across the line or tap the target again). Then the bubble **"25-ə çatanda yüksəlir — L2 iki axın aparır"** (At 25 it levels up — L2 runs 2 streams) → wait. When your tower has grown, open streams from it to two different towers. Win.
- **Expected E:** ≈ 10 s after the stop your bottom tower reaches 25 and grows (level 2, a gold fountain), the bubble goes away; the L2 tower runs two streams at once with no "L2 needed" line. **QƏLƏBƏ**; the card says "3 ulduz: 00:25-dək · 2 ulduz: 02:10-dək". Then go on with TF-12 (from level 5).
- **Answer:** `TF-28: A OK · B OK (supply-line bubble at ~0:34) · C OK · D OK · E OK; no bubble or select line covered a number`, and for every failed part `TF-28 FAIL: <part> step N — <what happened>` (+ screenshot or screen recording).
- **Closes:** GD-5a, GD-5b, GD-5e, GD-5c, GD-5d, BUG-50, BUG-51 (device confirmation), QA-2 · **Severity:** S1 — following the bubble the level cannot be won; S2 — a bubble missing, on the wrong tower or at the wrong moment (e.g. "cut" in B-1), staying longer than 20 s, no supply line, the first tap in C-2 cutting the stream, or "L2 needed" in D; S3 — wording, a bubble or the select line covering a number / the selected tower.

#### TF-29 · How to Play card (six rules) and the one-time supply-line hint (3 min)
- **Tap:**
  1. Language **Azərbaycanca**. Title screen → **Ayarlar** (Settings) → the **Necə oynanır** (How to play) row (subtitle "Altı qayda bir kartda" — The six rules on one card) → the card opens → screenshot → **ANLADIM** (GOT IT). Then in any level **II** → **NECƏ OYNANIR** → the same card → **ANLADIM** → **DAVAM ET**.
  2. **The hint:** after TF-28 (level 2 cleared, no tutorial) do TF-22 (repeat it if already done): in step 4 open the stream from your bottom tower into the **full** middle tower. Then cut that stream with a swipe and open it again.
- **Expected:** 1 — title **NECƏ OYNANIR**, **six** rules, each with a small picture: (1) "Öz qüllənə, sonra düz xətdəki qülləyə toxun. Divar, su, daş və qüllələr xətti bağlayır." (Tap your tower, then a tower in a straight line. Walls, water, rocks and towers block it.) (2) "Axın qülləni heç vaxt boşaltmır — yalnız böyüməsini dayandırır. Dayandırmaq üçün barmağınla axını kəs." (A stream never empties your tower — it only stops it growing. Swipe across a stream to stop it.) (3) "Qüllə dolsun ki, səviyyə artsın: …" (Let a tower fill to level up: …) (4) "Bir yolda bərabər axınlar bir-birini yox edir: …" (Equal streams on one lane cancel …) (5) "Atəş altındakı qüllə əsgər toplamır — hər qırmızı axına cavab ver." (A tower under fire cannot recruit — answer every red stream.) (6) "Öz dolu qüllənə axıt — o, əsgərlərini irəli ötürəcək: bu, təchizat xəttidir." (Stream into your own full tower and it passes your soldiers on — a supply line.) All six rules and the **ANLADIM** button **fit the screen**: no line clipped or ending in "…", no text over the pictures or the button, no scrolling; **ANLADIM** closes the card on the first tap and returns to where you came from (Settings / the PAUSED card). 2 — the moment the stream into the full tower opens, a ≈ 2–3 s line over it: **"Təchizat xətti: dolu qüllə əsgərləri irəli ötürür"** (Supply line: your full tower passes soldiers on); the tower does not shake (this is not the "Doludur" / Full warning). After the cut and the new stream the line does **not** show again — once per match (after **II → YENİDƏN** it may show once more, normal).
- **If it fails, write:** `TF-29 FAIL: card shows N rules / rule N clipped / ANLADIM not visible / no hint / hint every time` (+ screenshot).
- **Closes:** GD-5f (device confirmation) · **Severity:** S2 — the card does not open, a rule is clipped or ANLADIM is off screen; S3 — no hint, a repeated hint, or awkward wording / pictures.

### How to report

1. Send all results **in one message** in the chat. For each failed check **one line**: the check id + what happened, with the screenshot (or screen recording) under it. List the passed checks as well — the backlog rows can only be closed with them.
2. Example:
   ```
   Device: iPhone 17 Pro Max, iOS 26.0, build 1.0.0 (21), start 21:10
   OK: TF-01 (3 s), TF-03, TF-04, TF-05, TF-07, TF-09, TF-10, TF-14, TF-16, TF-17, TF-18, TF-22, TF-23, TF-26, TF-29
   TF-27: Canlı / Kral / Pastel OK, with colour-blind OK, kept after relaunch; my pick: Kral
   TF-28: A OK · B OK (~0:34) · C OK · D OK · E OK
   TF-12: 5 — started on the right, won 2★ · 7 — started on the right, won 1★
   TF-13: 11 — won 2★ · 13 — won 2★ · 14 — won 1★ · 16 — not reached
   TF-02 language: game opened in EN, phone is AZ
   TF-06 FAIL: the II button touches the Dynamic Island [screenshot]
   TF-13: smoothness 4/5, warm, text crisp
   TF-24: soldiers stand out yes, walk yes, dust visible yes
   TF-11 not reached · TF-19 not done
   ```
3. The Producer files every **FAIL** line as a **BUG** in `docs/BACKLOG.md` (repro steps, device, iOS version, severity); QA adds a regression test for each fix. Nothing else is needed from you; questions come back in the chat.

### For the team: what each row needs from this pass

- **MM-1 (iOS half):** TF-02, 03, 04, 06, 07, 10, 15 pass → the WebView items of MM-1 (safe areas, audio unlock, background pause, portrait, store-unavailable state) are confirmed on iOS; the Android back-button half stays with the APK pass.
- **QA-2 (iOS half):** TF-01, 05, 08, 09, 12, 14, 16, 17, 18, 28 pass (TF-11, TF-19 optional; TF-29 closes GD-5f, not QA-2). Note: TF-05's hints (and every tutorial check) need a level without a star — the stakeholder's install has kept its save since build 7, so before build 18 the level-1 hints most likely never showed on the phone; TF-28's reset is the first real first-timer pass on the device.
- **FE-14 (team colours on device):** TF-27 pass → the setting is confirmed (title island, level-map node, play world, pause / result buttons, shop previews; saved across a kill; colour-blind × set). The set the stakeholder names is the ART-25 decision; anything but Classic → the Publisher re-cuts every store set with that set (the frames are Classic today, PUB-25) and the default palette question goes to the Tech Artist. A screen that keeps classic tones → a BUG for the frontend (FE-14 follow-up list: how-to CLOSE fill, achievements pill, header extrusion, level-map badges).
- **GD-5a / GD-5b / GD-5e / GD-5g (tutorial of levels 2–4, lesson cards, 2★ clocks):** TF-28 pass → confirmed on device; B is the mid-first line of `e2e/tutorial.spec.ts` (supply-line step), C the side-first line (cut on the ribbon), D level 3, E level 4. Since build 19 C step 2 and D are pass / fail, no longer data questions (PUB-26 asked them on build 18): level 2 `goAround` and `stopStream` clear the selection and level 4 `stopToGrow` selects `home` (BUG-50), level 3 `grabOther` selects the grey just taken (BUG-51) — `TutorialStep.select`, `tests/ui/tutorialSelect.test.ts`, the side-first and level-3 cases of `e2e/tutorial.spec.ts`. A C-2 "stopped the stream" or a D shake on build 19 is a regression → reopen BUG-50 / BUG-51.
- **GD-5c / GD-5d / GD-5f / GD-6 (build 19):** TF-28 with no bubble or select line on a number / the selected tower → GD-5c / GD-5d confirmed on device (the 17 Pro Max is 440 × 956; the guards' worst cases are 360 × 640); TF-29 → GD-5f (six-row card in AZ at the device's fonts — `e2e/howto.spec.ts` measures 360 × 640 with the game's fonts; the one-time hint, not raised by the level 2 tutorial step, TF-28 B-4). TF-12 / TF-13 lesson-card notes (section 0, item 11) are data for the Level / Game Designer: a "did what the card said and lost" reopens that GD-6a…e row; the level 7 "left / right first" answer feeds LV-21 (the `sw` / `se` tie). GD-6g (the select line on levels 6–10) is covered by GD-5d's rule in build 19 (closed 2026-10-19 without a code change, 176-case guard in `tests/render/tutorialBubble.test.ts`) — TF-12 / TF-13 see it like TF-28.
- **MM-8 (share card on device):** TF-20 pass → the native share branch (`@capacitor/share` + `@capacitor/filesystem`) is confirmed; a sheet that never opens → the Web Share fallback path in `src/native/share.ts`.
- **MM-9 / MM-10 (rating prompt off):** TF-21 pass and no `RATING_PROMPT` variable → the review-notes sentence "never requests a rating in this version" holds for the App Store build; the variable set to `on` → delete it before that build is made (or rewrite the review notes).
- **MM-4:** TF-12 without a reload to the title + TF-13 sharpness answer "crisp" → the DPR cap (`DPR_CAP.native` 2, `src/render/view.ts`) is confirmed; a reload or stutter → the two-layer fallback of docs/MOBILE.md §9.3 step 4.
- **M3-5:** TF-13 smoothness ≥ 4/5 at ×1 on the stakeholder's phone, now with the ART-23 effects and the ART-24 zoom on; ≤ 3/5 → a screen recording, then the levers listed under M3-5 in the backlog (TF-25 "hitch during effects" points at the effects first).
- **Build 16–18 device confirmations (PUB-26):** TF-24 → BUG-42 (no overlapping top-edge badges); TF-16 step 2 + TF-27 step 3 → BUG-46 (colour-blind enemies orange / magenta / amber); TF-27 → FE-14; TF-28 → GD-5a/b/e (+ GD-5g by the result-card lines of section 0, item 10).
- **Build 19 device confirmations (PUB-27):** TF-28 → GD-5c, GD-5d, BUG-50, BUG-51; TF-16 step 4 + TF-29 → GD-5f; TF-12 / TF-13 → GD-6a…e (cards) and GD-6f (the level 9 / 10 result-card lines of section 0, item 10). BUG-52 is web-only (`src/main.ts` registers no service worker inside Capacitor) — covered by the PWA e2e, not by this pass; PERF-10 (lazy tutorial chunk) is covered by TF-28's bubbles showing on levels 2–4.
- **Build 20 device confirmations (PUB-29):** TF-12 / TF-13 + section 0 item 11 → GD-7a (7), GD-7g (5), GD-7b (11), GD-7c (13), GD-7d (14), GD-7e (16): the acceptance is a win when the card is followed literally (the followers of each GD-7 row: 20/20 at 4 s); a "followed the card and lost" reopens that row for the Game Designer, a "did not start on the right" on 5 / 7 says the card was not read as meant (wording, not layout). Section 0 item 10 → GD-6f (rest) (result-card lines of 11–16; 2★ is informational — no check asks for it). On level 7 the old "left or right first" question is gone — LV-21 was decided 2026-10-19 (the card names the side).
- **Build 21 device confirmations (PUB-30):** TF-12 + section 0 item 11 → LV-22 (level 5 layout): a win on 5 from the start the stakeholder chose; a "started on the left and lost" reopens LV-22 for the Level Designer (LV-22 screened the left start with `--follow "prio=west1"`). A right start must still win as the GD-7g card says.
- **Build 9–15 device confirmations:** TF-08 + TF-23 → BUG-33 (swipe-to-cut, iPhone drag), BUG-35 (drag line), BUG-36 (no HUD press at the end of a drag); TF-02 + TF-06 → BUG-34 (full bleed, safe-edge HUD); TF-22 → RELAY-1; TF-24 → BUG-39 + ART-20 (+ the ART-24 soldier zoom); TF-25 → ART-23; TF-26 → FE-12; TF-05 + TF-09 + TF-24 → ART-24 (zoomed flat view, roof taps, badge below the base at the top edge). Each passed check lets the Producer mark that row "confirmed on device"; a FAIL reopens it as a BUG.
- **Known in build 21 (PUB-30, 2026-10-21):** nothing device-specific; build 21 = build 20 + the LV-22 level-5 layout, nothing else player-visible (store frame 03 re-cut for it, PUB-30). GD-7h's tutorial fallback (`a00f32d`) is in since build 20 — section 0 item 9 asks for a report if it is followed and still loses; GD-7f's CI switch landed (QA-30, both tie orders gated).
- **Known in build 20 (PUB-29, 2026-10-20):** nothing device-specific; build 20 = build 19 + the 11–16 clocks (GD-6f rest) + the cards of 5 / 7 / 11 / 13 / 14 / 16 (GD-7a/b/c/d/e/g), nothing else player-visible. Still open: GD-7h (level 3 west first tap; TF-28 D plays the east line), GD-7f (reversed-tie naive row, a measurement). LV-21 closed by GD-7a.
- **Known in build 19 (PUB-27, 2026-10-19):** nothing device-specific. Fixed in build 19 and checked as normal FAILs: GD-5c (bubble placement, `render/tutorialBubble.ts`, 544-case guard), GD-5d (`hud.selectHint` moves off the selected tower), BUG-50 / BUG-51 (tutorial selection), BUG-52 (web only); GD-6g (the same select-line rule on 6–10, closed 2026-10-19). Still open: LV-21 (level 7 `sw` / `se` tie — TF-12 asks which side the stakeholder took).
- **Known in build 18 (PUB-26, 2026-10-18):** GD-5c — the tutorial bubble may cover a neighbour: at 360 × 640 level 2 step 3's bubble (on the home → side ribbon) covers `side`'s badge and level 4 step 1's covers the outpost's body; GD-5d — `hud.selectHint` sits on the selected home tower's body at 360 × 640 on levels 1–5. Both are being fixed today — **fixed in build 19 if it ships**; the 17 Pro Max (440 × 956) is unlikely to show either, and a `TF-28: saw GD-5c` note needs no new bug. GD-5f (How to Play lines for the swipe and the supply line, one-time supply-line hint) is not in build 18 — TF-16 step 4 still expects 5 rules.
- **Known in build 15 (QA-24, 2026-10-14) — all fixed in build 16:** BUG-42 (a top-edge tower's badge flipped onto the next tower's badge, 12 late levels), BUG-43 (9:16 only — not the stakeholder's phone), BUG-44 (level 48 roof-tip tap). A TF-24 overlap on build 16+ is a new bug.
