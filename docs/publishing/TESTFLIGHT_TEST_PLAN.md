# TestFlight test plan — Tower Clash 1.0.0 (15) on the stakeholder's iPhone (QA-12, updated QA-25)

Owner: QA Engineer · written 2026-10-02 against branch head `e237f06` (build 7) · **updated 2026-10-14 for build 15 (QA-25)**: the swipe-to-cut and drag line (BUG-33, BUG-35), full-bleed screens (BUG-34), HUD-press fixes (BUG-36–38), soldiers that stand out (BUG-39), supply lines (RELAY-1), walking soldiers (ART-20), title island on tall phones (FE-12), light and combat effects (ART-23) and the zoomed top-down view (ART-24). First real-device pass for **QA-2** (iOS half) and **MM-1 for iOS**, plus the on-device halves of **MM-4** (memory / DPR cap) and **M3-5** (performance), and the device confirmation of the build 9–15 changes.
Build: **1.0.0 (15) or later** from the `tower-clash-ios-release` workflow, lane **testflight**. 1.0.0 has **no in-app purchases** (they come with 1.0.1 under the next free build number), so the shop is in the store-unavailable state (LAUNCH_CHECKLIST §0b variant B, PUB-14). Ads: since build 8 the iOS lane carries the real AdMob ids — a full-screen ad between levels may be a Google "Test Ad" or a real ad; both are fine on TestFlight, **never tap the ad itself**, close it with ×.
Checks: **26** (TF-01 … TF-26; TF-20 share sheet added 2026-10-05, TF-21 rating prompt off 2026-10-08 (PUB-16), TF-22 … TF-26 added 2026-10-14 for build 15). **Which build:** TestFlight shows the number under the app name — it must be **15 or higher**. On an older build stop and write `old build N` in the chat: the zoomed view (TF-05, TF-09, TF-24) needs build 15, effects and light (TF-25) build 14, walking soldiers and the title island (TF-24, TF-26) build 13, supply lines (TF-22) build 11, the drag line (TF-23) build 10, swipe-to-cut (TF-08, TF-23) build 9.
Install path: LAUNCH_CHECKLIST.md §0b, the optional TestFlight note at its end (the team uploads the build by committing `tower-clash/release/ios-release.request`, MM-12). Severities: POST_LAUNCH.md §5.1. Day boundary: GDD §7.4 (00:00 UTC = **04:00 Baku**).

The Azerbaijani part comes first; the English mirror (same ids, same order) follows it.

---

## AZ — iPhone-da TestFlight yoxlaması (≈ 40 dəqiqə)

### 0. Başlamazdan əvvəl (2 dəq)

1. iPhone modelini və iOS versiyasını yaz: **Ayarlar → Ümumi → Haqqında** (*Model adı*, *iOS versiyası*). TestFlight-da tətbiqin adının altındakı build nömrəsini də yaz — **15 və ya daha böyük** olmalıdır (kiçikdirsə dayan və çata `köhnə build N` yaz). Hesabatın ilk sətri bu olacaq.
2. Batareya ≥ 50 %, **Aşağı enerji rejimi söndürülü** olsun (batareya ikonu sarı olmamalıdır) — bu rejim oyunu 30 kadra endirir və TF-13-ün nəticəsini korlayır.
3. Səs: yan açar (Ring/Silent) **zəng** rejimində olsun (iPhone 15 Pro və sonrakılarda Action düyməsi ilə səssiz rejim söndürülsün), səs düymələri ilə səsi ucalt. *Səssiz rejimdə oyunun səsi çıxmır — bu iOS-un normal davranışıdır, xəta deyil.*
4. İdarəetmə mərkəzi (sağ yuxarı küncdən aşağı sürüşdür) → **ekran fırlanma kilidi (kilidli dairəvi ox) SÖNDÜRÜLÜ** olsun (TF-04 üçün).
5. Başlama saatını yaz.
6. **Skrinşot:** yan düymə + səs artırma düyməsini eyni anda bas (Home düyməli iPhone-da: Home + yan düymə). Şəkil *Şəkillər* tətbiqinə düşür; çatda adi şəkil kimi əlavə et. **Ekran yazısı** (titrəmə / donma / əsgərlərin yerişi üçün): İdarəetmə mərkəzi → dairəli nöqtə düyməsi → 3 saniyə sonra yazır; dayandırmaq üçün yuxarıdakı qırmızı nişana toxun.
7. **Tətbiq çöksə** və TestFlight "Share additional information?" / "Əlavə məlumat paylaşılsın?" soruşsa: **Share** → şərhə yoxlamanın id-sini yaz (məs. `TF-12`). Sonra çatda da yaz — TestFlight rəyini yalnız sən App Store Connect-də görürsən, komanda görmür.
8. **Vaxt çatmasa**, bu ardıcıllıqla et: TF-01, 05, 23, 22, 24, 26, 25, 02, 06, 07, 03, 10, 12, 13, 15, 17, 18. (Əvvəlcə sənin öz qeydlərinin düzəlişləri — xətti kəsmək, dartma xətti, təchizat xətti, əsgərlər, başlıq adası, yeni görünüş.) Qalanları sonra.
9. **Bilinən (yazmağa ehtiyac yoxdur):** bəzi gec səviyyələrdə (27, 31, 34, 36–38, 40, 43, 44, 46, 48, 49) xəritənin ən yuxarısındakı qüllənin rəqəmi aşağıdakı qüllənin rəqəminin arxasında gizlənə bilər (BUG-42, düzəldilir). Bunu görsən yalnız `TF-24: BUG-42 gördüm, səviyyə N` yazmaq kifayətdir.

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
| TF-08 | Səviyyə 2: seçimi ləğv et, axını barmaqla kəs, zoom yoxdur | 2 | QA-2, BUG-33 | S2 |
| TF-09 | Səviyyə 3: "25-ə dolsun" ipucu, qüllə L2 olur; ən yuxarıdakı qüllənin rəqəmi altda | 2 | QA-2, ART-24 | S2 |
| TF-10 | Döyüş zamanı arxa plana çıx: səs kəsilir, oyun fasilədə qalır | 1 | MM-1 | S2 |
| TF-11 | "Axın ilişib" ipucu (səviyyə 2 təkrarı, istəyə bağlı) | 3 | QA-2 | S3 |
| TF-12 | Səviyyə 4–8 ardıcıl + iki dəfə arxa plan (yaddaş / çökmə) | 6 | QA-2, MM-4 | S1 çökmə / döyüşdə reklam · S2 özü başlığa qayıdır |
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
- **Toxun:** **OYNA** → **SƏVİYYƏLƏR** xəritəsi → **1** yazılan dairə ("İlk Toxunuş"). Yuxarıda "DƏRS" kartı görünür (8 saniyə sonra özü yox olur). Yalnız **bir barmaqla**: ipucu **"Öz qüllənə toxun"** çıxanda halqa ilə göstərilən göy qülləyə toxun → ipucu **"İndi boz qülləyə toxun — axın özü davam edir"** olur → boz qülləyə toxun. Sonra öz qülləndən qırmızı qülləyə axın aç (öz qüllən, sonra qırmızı) və qalib gəl. Bir dəfə qüllənin **damına** (ən yuxarı ucuna) toxun.
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

#### TF-08 · Səviyyə 2: seçimi ləğv et, axını barmaqla kəs, zoom yoxdur (2 dəq)
- **Toxun:** **NÖVBƏTİ** → səviyyə 2 "Təchizat Xətti".
  1. İpucu **"Öz qüllənə, sonra boz qülləyə toxun"** (halqa ortadakı boz qüllədə) → öz qüllənə, sonra ortadakı boz qülləyə toxun.
  2. İpucu **"Axını dayandırmaq üçün barmağınla xəttin üstündən keç"** → barmağını boş yerdən başlayıb axının (xəttin) üstündən sürətlə keçir.
  3. **Seçimi ləğv et:** öz qüllənə bir dəfə toxun (işıqlanır, aşağıda **"Axın üçün qülləyə toxun · dayandırmaq üçün yenə toxun və ya xətti kəs"** yazısı çıxır) → **eyni qülləyə yenə toxun**.
  4. Bir qülləyə **cəld iki dəfə** toxun; sonra bir qülləni **1 saniyə basılı saxla**.
  5. Səviyyəni udmağa davam et.
- **Gözlənilən:** 1 — axın başlayır; 2 — axın **dərhal** dayanır, barmağın arxasında qısa ağ iz görünür, ipucu yox olur (ipucu heç nə etməsən də 20 saniyədən sonra özü itir); 3 — işıq və aşağıdakı yazı yox olur, axın açılmır; 4 — ekran **böyümür (zoom yoxdur)**, böyüdücü şüşə, "Kopyala" menyusu və ya mətn seçimi **çıxmır**, ekran barmağın altında **sürüşmür**.
- **Alınmasa yaz:** `TF-08 FAIL: addım N — <nə oldu>`.
- **Bağlayır:** QA-2, BUG-33 · **Ciddilik:** S2.

#### TF-09 · Səviyyə 3: "25-ə dolsun" ipucu, qüllə L2 olur (2 dəq)
- **Toxun:** **NÖVBƏTİ** → səviyyə 3 "Sahibsiz Torpaq". Əvvəlcə ekranın ən yuxarısındakı qırmızı qülləyə bax. İki boz qülləni al; sonra axınları dayandır ki, öz qüllən dolsun.
- **Gözlənilən:** ən yuxarıdakı qırmızı qüllənin rəqəmi qüllənin **altında**, bazasının aşağısında durur (yuxarıda yer yoxdur — build 15-dən belədir, xəta deyil), həm DƏRS kartı görünəndə, həm o yox olandan sonra; rəqəm tam oxunur. İpucu **"Qoy qüllə 25-ə dolsun və yüksəlsin — L2 iki hədəfə hücum edir"**; qüllə 25-ə çatanda böyüyür (2-ci səviyyə, qızılı fəvvarə), ipucu yox olur; səviyyə **QƏLƏBƏ** ilə bitir.
- **Alınmasa yaz:** `TF-09 FAIL: ipucu çıxmadı / qüllə 25-də böyümədi / ipucu qaldı / qırmızı qüllənin rəqəmi örtülüb`.
- **Bağlayır:** QA-2, ART-24 · **Ciddilik:** S2 (yalnız mətn səhvdirsə S3).

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

#### TF-12 · Səviyyə 4–8 ardıcıl + iki dəfə arxa plan (yaddaş / çökmə) (6 dəq)
- **Toxun:** vaxta qənaət üçün **II → SÜRƏT ×1** düyməsinə toxun ki, **×2** olsun. Hər qələbədən sonra **NÖVBƏTİ**; uduzsan **YENİDƏN**. Səviyyə 5-də: ana ekrana çıx, 10 s gözlə, qayıt, **DAVAM ET**. Səviyyə 7-də: ana ekrana çıx, **Kamera** və ya **Safari**-ni 30 s işlət, qayıt, **DAVAM ET**.
- **Gözlənilən:** çökmə yoxdur; oyun **özü başlıq ekranına qayıtmır** (bu, iPhone-un oyunu yaddaş üçün bağladığının əlamətidir); qayıdanda FASİLƏ kartı görünür. Altıncı bitmiş səviyyədən sonra (qələbə də, məğlubiyyət də sayılır) səviyyələr **arasında** tam ekran reklam çıxa bilər (Google **"Test Ad"** və ya adi reklam) — TestFlight-da normaldır, reklamın özünə toxunma, × ilə bağla. Döyüş **zamanı** reklam heç vaxt, ilk 5 bitmiş səviyyədən sonra da reklam **olmamalıdır**. Səviyyə 8-dən sonra GÜNLÜK kart açılır.
- **Alınmasa yaz:** `TF-12 FAIL: səviyyə N-də çökdü / özü başlığa qayıtdı / döyüş vaxtı reklam`.
- **Bağlayır:** QA-2, MM-4 · **Ciddilik:** S1 — çökmə, döyüş zamanı reklam və ya ilk 5 bitmiş səviyyədə reklam; S2 — özü başlığa qayıdır (irəliləyiş qalsa da).

#### TF-13 · Səviyyə 9 (və ya 10–12) ×1 sürətdə: səlistlik, istilik, kəskinlik (3 dəq)
- **Toxun:** **II → SÜRƏT ×2**-yə toxun ki, yenə **×1** olsun. Səviyyə 9 "Daş Divarlar"-ı (və ya 10 "Xətti Saxla", 11 "Qalanı Ac Qoy", 12 "Top Postu") **2 dəqiqə** oyna, ən çox əsgərin toqquşduğu və qüllələrin əl dəyişdiyi anlara diqqət et (build 14-dən bu anlarda parıltı, halqa və qığılcım effektləri var — səlistliyi onlarla birlikdə qiymətləndir). Sonda telefonun arxasına toxun.
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
| 2026-10-14 | 30 | Bir Cəbhə · Güclü qarnizon | 2026-10-21 | 46 | Çay Qapısı · Az ərzaq |
| 2026-10-15 | 11 | Qalanı Ac Qoy · İti addım | 2026-10-22 | 27 | Zireh Yarışı · Güclü qarnizon |
| 2026-10-16 | 41 | Əkiz Çaylar · Nazik divarlar | 2026-10-23 | 17 | Mina Sahəsi · Nazik divarlar |
| 2026-10-17 | 42 | Mühasirə Maşını · İti addım | 2026-10-24 | 25 | Ağır Metal · İti addım |
| 2026-10-18 | 45 | Üç Cəbhə · Nazik divarlar | 2026-10-25 | 34 | Ən Zəif Halqa · Güclü qarnizon |
| 2026-10-19 | 29 | İki Keçid · Az ərzaq | 2026-10-26 | 41 | Əkiz Çaylar · Klassik |
| 2026-10-20 | 27 | Zireh Yarışı · Güclü qarnizon | 2026-10-27 | 46 | Çay Qapısı · Güclü qarnizon |

#### TF-15 · Mağaza "mağaza əlçatan deyil" halında (2 dəq)
- **Toxun:** başlıq ekranı → **MAĞAZA**. Bu build-də yalnız iki tab olmalıdır: **GÖRÜNÜŞ / TƏLİM** (PUB-14: alış olmayan build-də KRİSTAL və DƏSTLƏR tabları gizlidir).
  1. Tab sırasına bax, sonra hər iki tabda yuxarı-aşağı sürüşdür.
  2. **GÖRÜNÜŞ**: **Şifer** (80 kristal) görünüşünə toxun; "YALNIZ DƏSTDƏ" yazılan görünüş varsa, ona da toxun.
  3. **TƏLİM**: qızılın çatırsa bir təkmilləşdirmə al.
- **Gözlənilən:** 1 — mağaza yalnız **GÖRÜNÜŞ** və **TƏLİM** tabları ilə açılır; **KRİSTAL** və **DƏSTLƏR** tabları **yoxdur** (boz da deyil — ümumiyyətlə görünmür); heç yerdə $ qiyməti ($0.99 …), kristal paketi, dəst, "Mağaza bu platformada mümkün deyil" yazısı və ya **ALIŞLARI BƏRPA ET** düyməsi yoxdur; **Apple ödəniş pəncərəsi, Apple ID parolu sorğusu heç vaxt çıxmır**. 2 — 40 dəqiqəlik oyunla kristal azdır, ona görə **"Kristal çatmır"** düzgün nəticədir, kristal sayı dəyişmir (≥ 80-dirsə: "Şifer dam açıldı və taxıldı"); "YALNIZ DƏSTDƏ" → yalnız yazı ("Başlanğıc dəsti ilə gəlir" və ya "Premium dəsti ilə gəlir"), qiymət və ödəniş pəncərəsi yoxdur. 3 — "<ad> pillə 1: …" yazısı, qızıl azalır.
- **Alınmasa yaz:** `TF-15 FAIL: KRİSTAL/DƏSTLƏR tabı görünür / qiymət və ya bərpa düyməsi görünür / Apple ödəniş pəncərəsi açıldı / <tab> çökdü / mətn: …`.
- **Bağlayır:** MM-1, QA-2 · **Ciddilik:** S1 — Apple ödəniş pəncərəsi və ya pul tələbi; S2 — çökmə, KRİSTAL / DƏSTLƏR tabı (boz da olsa), qiymət və ya bərpa düyməsi görünür; S3 — mətn / tərcümə.

#### TF-16 · Ayarlar (3 dəq)
- **Toxun:** başlıq ekranı → **Ayarlar**. **İRƏLİLƏYİŞİ SIFIRLA**-ya **toxunma**.
  1. **Dil** sətrində **Azərbaycanca** seçili olsun (deyilsə seç).
  2. **Rəng korluğu** → **AÇIQ** → **GERİ** → **OYNA** → istənilən səviyyəni aç, bax → **MENYU**. Sonra yenə **Ayarlar**-da istədiyin kimi qoy.
  3. **Az hərəkət** → **AÇIQ** → **GERİ**, başlıq ekranına bax, bir səviyyəni 10 saniyə oyna → **MENYU** → **Ayarlar** → **AVTO**.
  4. **Necə oynanır** → kart → **ANLADIM**.
  5. Aşağıdakı "Haqqında" kartına bax: versiya və **MƏXFİLİK SEÇİMLƏRİ** düyməsi (varsa toxun).
- **Gözlənilən:** 1 — bütün menyular Azərbaycanca. 2 — düşmən qüllələri **qırmızıdan narıncıya** keçir, səninkilər göy qalır. 3 — başlıq ekranında yeriyən əsgərlər dayanır; döyüşdə əsgərlər addım atmadan sürüşür, ayaq tozu və ələ keçirmə parıltısı yoxdur, effektlər azalır; AVTO iPhone-un *Hərəkəti azalt* ayarına uyğundur. 4 — **NECƏ OYNANIR** kartında 5 qayda, hamısı ekrana sığır, **ANLADIM** Ayarlara qaytarır. 5 — **"Versiya 1.0.0 (build 15)"** (və ya TestFlight-dakı daha böyük nömrə) və "İrəliləyiş bu cihazda saxlanılır". Azərbaycanda **MƏXFİLİK SEÇİMLƏRİ** düyməsinin **olmaması normaldır** (Google onu yalnız AB / Böyük Britaniyada göstərir); varsa, toxunanda Google forması açılıb oyuna qayıtmalıdır. "Dəstək ID" sətri bu buildda **yoxdur** — normaldır.
- **Alınmasa yaz:** `TF-16 FAIL: addım N — <nə oldu>`.
- **Bağlayır:** QA-2 · **Ciddilik:** S2 — ayar tətbiq olunmur, versiya fərqlidir, məxfilik düyməsi xəta verir; S3 — görünüş / mətn.

#### TF-17 · Tətbiqi tam bağla, yenidən aç — irəliləyiş qalır (1 dəq)
- **Toxun:** ekranın aşağısından yuxarı sürüşdür və ortada saxla (tətbiq dəyişdirici) → Tower Clash kartını yuxarı at. İkonla yenidən aç → **OYNA**.
- **Gözlənilən:** dil yenə **Azərbaycanca**; aşağıdakı qızıl / kristal əvvəlki kimi; xəritədə keçdiyin səviyyələrin ulduzları yerində; Rəng korluğu ayarı necə qoymusansa elədir.
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
- **Toxun:** TF-13-dən sonra **10, 11 və ya 12-ci** səviyyəni **3 ulduzla** keç (gücləndiricilərdən istifadə etmək olar). Nəticə kartında 5 saniyə gözlə, sonra xəritəyə qayıt və başqa bir səviyyə aç. Sonra brauzerdə (1 dəq): github.com/pervincinal/InsiderTest → *Settings* → *Secrets and variables* → *Actions* → **Variables** tabı — `RATING_PROMPT` adlı dəyişənə bax.
- **Gözlənilən:** heç bir "Enjoying Tower Clash?" / ulduzlu qiymət pəncərəsi çıxmır — nə nəticə kartında, nə xəritədə; nəticə kartı adi qaydada işləyir (düymələr, PAYLAŞ), çökmə və donma yoxdur. GitHub-da `RATING_PROMPT` dəyişəni **yoxdur** (və ya dəyəri `on` deyil). *Qeyd: TestFlight build-lərində Apple bu pəncərəni ümumiyyətlə göstərmir, ona görə əsas sübut dəyişənin olmamasıdır; telefondakı hissə 3★ qələbədən sonra heç nəyin pozulmadığını yoxlayır.* İki cəhddə 3★ alınmasa, `TF-21 çatmadı` yaz — xəta deyil.
- **Alınmasa yaz:** `TF-21 FAIL: 3★-dan sonra qiymət pəncərəsi çıxdı / nəticə kartı dondu / RATING_PROMPT = on [skrinşot]`.
- **Bağlayır:** MM-9 (cihaz təsdiqi; MM-10 build dəyişəni) · **Ciddilik:** S3 — App Store-a göndəriləcək build yığılmazdan əvvəl dəyişən silinir, çünki rəy qeydi (APP_STORE_CONNECT_SHEET §6.4) "bu versiya qiymət istəmir" deyir.

#### TF-22 · Təchizat xətti: dolu öz qülləndən əsgərlər irəli keçir (3 dəq)
- **Toxun:** **MENYU** → xəritədə **2** "Təchizat Xətti" (artıq keçilib, ipucu yoxdur). Səviyyə 1-dəki kimi **II → SÜRƏT** ilə ×1 olsun.
  1. Aşağıdakı öz qüllənə, sonra **ortadakı** boz qülləyə toxun — orta qüllə sənin olsun (axın davam edir).
  2. Ortadakı qüllən göy olan kimi: ortadakı qüllənə, sonra ən yuxarıdakı **qırmızı** qülləyə toxun (orta → qırmızı axını).
  3. Gözlə: aşağıdan gələn axın ortadakı qülləni doldurur. Ortadakı qüllənin rəqəmi **25** olanda onun lövhəsi **qızılı** olur və aşağıdan gələn axın **özü dayanır** (bu, adi "dolana qədər gücləndir" davranışıdır).
  4. İndi yenə: aşağıdakı qüllənə, sonra **dolu** ortadakı qüllənə toxun (və ya barmağınla aşağıdakı qüllədən ortadakına dart). 20 saniyə bax.
- **Gözlənilən:** 4-cü addımda axın açılır və **dayanmır**; "Doludur" yazısı **çıxmır**, qüllə titrəmir; aşağıdan gələn göy əsgərlər ortadakı qülləyə girib dərhal onun qırmızıya gedən axını ilə **irəli** çıxır — orta → qırmızı axınında əsgərlər əvvəlkindən sıx gedir; ortadakı qüllə 25-də (qızılı) qalır. Ortadakı qüllənin qırmızıya axınını dayandırsan (xətti barmaqla kəs), aşağıdan gələn axın da bir an sonra özü dayanır. Səviyyəni adi qaydada bitir.
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
- **Gözlənilən:** əsgərlər **öz rəngli axınlarının üstündə aydın seçilir** — hər birinin tünd kontur xətti var, sütun axının içində "əriyib itmir" (stakeholderin build 11 qeydi, BUG-39); əsgərlər build 14-dəkindən böyükdür (1,75×). Əsgərlər həqiqətən **yeriyir**: iki ayaq addım atır, bir az qabağa əyilir, nizə və iki göz görünür; ayaqlarının altından xırda **toz** qalxır (hər torpaqda: ot, qum, qar…); tankların tırtılları fırlanır. Xəritənin ən yuxarısındakı qüllənin rəqəmi lazım gələndə qüllənin **altında** durur və heç bir başqa rəqəmlə üst-üstə düşmür (bilinən istisna: 0-cı bölmə, 9-cu bənd).
- **Cavab yaz:** `TF-24: əsgərlər seçilir hə/yox, yeriyir hə/yox, toz görünür hə/yox` (+ ekran yazısı).
- **Bağlayır:** ART-20, BUG-39, ART-24 · **Ciddilik:** S2 — əsgərlər axında görünmür və ya rəqəmlər üst-üstə düşür (BUG-42-dən başqa); S3 — yeriş / toz görünmür və ya qəribə görünür.

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

### Necə hesabat vermək

1. Bütün nəticələri **bir mesajla** çata yaz. Hər uğursuz yoxlama üçün **bir sətir**: yoxlamanın id-si + nə oldu, altında skrinşot (və ya ekran yazısı). Uğurlu yoxlamaları sadəcə siyahı ilə yaz — sətirlərin bağlanması üçün bu da lazımdır.
2. Nümunə:
   ```
   Cihaz: iPhone 17 Pro Max, iOS 26.0, build 1.0.0 (15), başlama 21:10
   OK: TF-01 (3 s), TF-03, TF-04, TF-05, TF-07, TF-09, TF-10, TF-14, TF-16, TF-17, TF-18, TF-22, TF-23, TF-26
   TF-02 dil: oyun EN açıldı, telefon AZ-dır
   TF-06 FAIL: II düyməsi Dynamic Island-a toxunur [skrinşot]
   TF-13: səlistlik 4/5, ilıq, mətn aydın
   TF-24: əsgərlər seçilir hə, yeriyir hə, toz görünür hə
   TF-11 alınmadı · TF-19 edilmədi
   ```
3. Hər **FAIL** sətrini Producer **BUG** kimi qeydə alır (təkrar addımları, cihaz, iOS, ciddilik ilə), QA reqressiya testi əlavə edir. Sənin əlavə heç nə etməyinə ehtiyac yoxdur; sual olsa çatda soruşacağıq.

---

## EN — TestFlight check on the iPhone (≈ 40 minutes)

### 0. Before you start (2 min)

1. Note the iPhone model and iOS version: **Settings → General → About** (*Model Name*, *iOS Version*). Also note the build number TestFlight shows under the app name — it must be **15 or higher** (lower: stop and write `old build N` in the chat). This is the first line of the report.
2. Battery ≥ 50 %, **Low Power Mode off** (battery icon not yellow) — it caps the game at 30 frames per second and spoils TF-13.
3. Sound: Ring/Silent switch on **ring** (iPhone 15 Pro and later: Silent mode off via the Action button), volume up. *In Silent mode the game is silent — that is normal iOS behaviour, not a bug.*
4. Control Center (swipe down from the top-right corner) → **Portrait Orientation Lock off** (for TF-04).
5. Note the start time.
6. **Screenshot:** side button + volume up together (Home-button iPhones: Home + side). It lands in *Photos*; attach it in the chat like any picture. **Screen recording** (for stutter / freezes / how the soldiers walk): Control Center → the dot-in-a-circle button → records after 3 s; tap the red pill at the top to stop.
7. **If the app crashes** and TestFlight asks "Share additional information?": **Share** → put the check id in the comment (e.g. `TF-12`). Also write it in the chat — TestFlight feedback is visible only to you in App Store Connect, not to the team.
8. **Short on time:** do TF-01, 05, 23, 22, 24, 26, 25, 02, 06, 07, 03, 10, 12, 13, 15, 17, 18 first (the fixes for your own reports come first — cutting a stream, the drag line, supply lines, the soldiers, the title island, the new look), the rest later.
9. **Known (no need to report):** on some late levels (27, 31, 34, 36–38, 40, 43, 44, 46, 48, 49) the number of the tower at the very top of the map can hide behind the number of the tower below it (BUG-42, being fixed). If you see it, `TF-24: saw BUG-42, level N` is enough.

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
| TF-08 | Level 2: cancel a selection, swipe a stream to stop it, no zoom | 2 | QA-2, BUG-33 | S2 |
| TF-09 | Level 3: "fill to 25" hint, tower becomes L2; top tower's number below it | 2 | QA-2, ART-24 | S2 |
| TF-10 | Background during a battle: sound stops, game stays paused | 1 | MM-1 | S2 |
| TF-11 | Stalemate hint (level 2 replay, optional) | 3 | QA-2 | S3 |
| TF-12 | Levels 4–8 in a row + background twice (memory / crash) | 6 | QA-2, MM-4 | S1 crash / ad in battle · S2 jumps back to title |
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
- **Tap:** **OYNA** → the **SƏVİYYƏLƏR** (levels) map → the circle **1** ("İlk Toxunuş" / First Taps). A "DƏRS" (lesson) card shows at the top (it goes away by itself after 8 s). **One finger only**: when the hint **"Öz qüllənə toxun"** (Tap your tower) appears, tap the blue tower with the ring → the hint becomes **"İndi boz qülləyə toxun — axın özü davam edir"** (Now tap the grey tower — the stream keeps flowing) → tap the grey tower. Then stream from your tower to the red tower (your tower, then the red one) and win. Once, tap a tower on its **roof** (the very tip).
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

#### TF-08 · Level 2: cancel a selection, swipe a stream to stop it, no zoom (2 min)
- **Tap:** **NÖVBƏTİ** → level 2 "Təchizat Xətti" (Supply Line).
  1. Hint **"Öz qüllənə, sonra boz qülləyə toxun"** (Tap your tower, then the grey tower; ring on the middle grey tower) → tap your tower, then the middle grey tower.
  2. Hint **"Axını dayandırmaq üçün barmağınla xəttin üstündən keç"** (Swipe across the stream to stop it) → start on empty ground and swipe quickly across the stream line.
  3. **Cancel a selection:** tap your tower once (it lights up, the line **"Axın üçün qülləyə toxun · dayandırmaq üçün yenə toxun və ya xətti kəs"** (Tap a tower to start a stream · tap again or swipe across it to stop) appears at the bottom) → **tap the same tower again**.
  4. **Double-tap** a tower quickly; then **press and hold** a tower for 1 s.
  5. Go on and win the level.
- **Expected:** 1 — a stream starts; 2 — the stream stops **at once**, a short white trail follows the finger, the hint goes away (it also hides by itself after 20 s if you do nothing); 3 — the highlight and the bottom line disappear, no stream starts; 4 — the screen does **not zoom**, no magnifier, no "Copy" menu, no text selection, the screen does **not scroll** under the finger.
- **If it fails, write:** `TF-08 FAIL: step N — <what happened>`.
- **Closes:** QA-2, BUG-33 · **Severity:** S2.

#### TF-09 · Level 3: "fill to 25" hint, tower becomes L2 (2 min)
- **Tap:** **NÖVBƏTİ** → level 3 "Sahibsiz Torpaq" (Free Real Estate). First look at the red tower at the very top of the screen. Take both grey towers; then stop your streams so your tower can fill.
- **Expected:** the number of the red tower at the very top sits **under** the tower, below its base (there is no room above it — so since build 15, not a bug), both while the DƏRS card is up and after it has gone; the number is fully readable. The hint **"Qoy qüllə 25-ə dolsun və yüksəlsin — L2 iki hədəfə hücum edir"** (Let a tower fill to 25 to upgrade it — L2 can attack 2 targets); when the tower reaches 25 it grows (level 2, a gold fountain) and the hint disappears; the level ends with **QƏLƏBƏ**.
- **If it fails, write:** `TF-09 FAIL: hint missing / tower did not grow at 25 / hint stayed / the red tower's number is covered`.
- **Closes:** QA-2, ART-24 · **Severity:** S2 (S3 if only the wording is off).

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

#### TF-12 · Levels 4–8 in a row + background twice (memory / crash) (6 min)
- **Tap:** to save time tap **II → SÜRƏT ×1** so it reads **×2**. After each win **NÖVBƏTİ**; after a loss **YENİDƏN**. In level 5: go to the home screen, wait 10 s, come back, **DAVAM ET**. In level 7: go to the home screen, use **Camera** or **Safari** for 30 s, come back, **DAVAM ET**.
- **Expected:** no crash; the game does **not jump back to the title screen by itself** (that is the sign iOS closed the game for memory); on return the PAUSED card shows. From the sixth finished level on (wins and losses both count) a full-screen ad may appear **between** levels (a Google **"Test Ad"** or a regular ad) — normal on TestFlight, do not tap the ad itself, close it with ×. There must **never** be an ad **during** a battle, and none after the first 5 finished levels. After level 8 the DAILY card unlocks.
- **If it fails, write:** `TF-12 FAIL: crashed in level N / jumped back to title / ad during a battle`.
- **Closes:** QA-2, MM-4 · **Severity:** S1 — crash, an ad during a battle or within the first 5 finished levels; S2 — jumps back to the title by itself (even if progress is kept).

#### TF-13 · Level 9 (or 10–12) at ×1: smoothness, warmth, sharpness (3 min)
- **Tap:** **II → SÜRƏT ×2** so it reads **×1** again. Play level 9 "Daş Divarlar" (Stone Walls) — or 10 "Xətti Saxla", 11 "Qalanı Ac Qoy", 12 "Top Postu" — for **2 minutes**, watching the moments when most soldiers clash and towers change hands (since build 14 those moments have flash, ring and spark effects — rate smoothness with them on). At the end touch the back of the phone.
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
| 2026-10-14 | 30 | Bir Cəbhə · Güclü qarnizon (One Front · Reinforced) | 2026-10-21 | 46 | Çay Qapısı · Az ərzaq (River Gate · Lean rations) |
| 2026-10-15 | 11 | Qalanı Ac Qoy · İti addım (Starve the Keep · Fast feet) | 2026-10-22 | 27 | Zireh Yarışı · Güclü qarnizon (Armour Race · Reinforced) |
| 2026-10-16 | 41 | Əkiz Çaylar · Nazik divarlar (Twin Rivers · Thin walls) | 2026-10-23 | 17 | Mina Sahəsi · Nazik divarlar (Minefield · Thin walls) |
| 2026-10-17 | 42 | Mühasirə Maşını · İti addım (Siege Engine · Fast feet) | 2026-10-24 | 25 | Ağır Metal · İti addım (Heavy Metal · Fast feet) |
| 2026-10-18 | 45 | Üç Cəbhə · Nazik divarlar (Three Fronts · Thin walls) | 2026-10-25 | 34 | Ən Zəif Halqa · Güclü qarnizon (Weakest Link · Reinforced) |
| 2026-10-19 | 29 | İki Keçid · Az ərzaq (Two Fords · Lean rations) | 2026-10-26 | 41 | Əkiz Çaylar · Klassik (Twin Rivers · Classic) |
| 2026-10-20 | 27 | Zireh Yarışı · Güclü qarnizon (Armour Race · Reinforced) | 2026-10-27 | 46 | Çay Qapısı · Güclü qarnizon (River Gate · Reinforced) |

#### TF-15 · Shop with the store unavailable (2 min)
- **Tap:** title screen → **MAĞAZA** (SHOP). This build must show two tabs only: **GÖRÜNÜŞ / TƏLİM** (SKINS / UPGRADES) — PUB-14: without in-app purchases the KRİSTAL and DƏSTLƏR (CRYSTALS / BUNDLES) tabs are hidden.
  1. Look at the tab row, then scroll up and down on both tabs.
  2. **GÖRÜNÜŞ**: tap **Şifer** (Slate, 80 crystals); if a skin is marked "YALNIZ DƏSTDƏ" (PACK ONLY), tap it too.
  3. **TƏLİM**: buy one upgrade if you have enough gold.
- **Expected:** 1 — the shop opens with **GÖRÜNÜŞ** and **TƏLİM** only; the **KRİSTAL** and **DƏSTLƏR** tabs are **absent** (not greyed — not shown at all); nowhere a $ price ($0.99 …), a crystal pack, a bundle, the line "Mağaza bu platformada mümkün deyil" (Store unavailable on this platform) or the **ALIŞLARI BƏRPA ET** (RESTORE PURCHASES) button; **no Apple payment sheet, no Apple ID password prompt, ever**. 2 — after 40 minutes of play there are few crystals, so **"Kristal çatmır"** (Not enough crystals) is the correct result and the crystal count does not change (with ≥ 80: "Şifer dam açıldı və taxıldı"); PACK ONLY → a text line only ("Başlanğıc dəsti ilə gəlir" or "Premium dəsti ilə gəlir"), no price, no payment sheet. 3 — a "<name> pillə 1: …" line (tier 1), the gold goes down.
- **If it fails, write:** `TF-15 FAIL: CRYSTALS/BUNDLES tab shown / a price or the restore button shown / Apple payment sheet opened / <tab> crashed / wording: …`.
- **Closes:** MM-1, QA-2 · **Severity:** S1 — an Apple payment sheet or any request for money; S2 — crash, a CRYSTALS / BUNDLES tab (even greyed), a price or the restore button is shown; S3 — wording / translation.

#### TF-16 · Settings (3 min)
- **Tap:** title screen → **Ayarlar** (Settings). Do **not** tap **İRƏLİLƏYİŞİ SIFIRLA** (RESET PROGRESS).
  1. In the **Dil** (Language) row make sure **Azərbaycanca** is selected (select it if not).
  2. **Rəng korluğu** (Colour-blind) → **AÇIQ** (ON) → **GERİ** → **OYNA** → open any level and look → **MENYU**. Afterwards set it the way you like in Settings.
  3. **Az hərəkət** (Reduced motion) → **AÇIQ** → **GERİ**, look at the title screen, play a level for 10 s → **MENYU** → **Ayarlar** → **AVTO**.
  4. **Necə oynanır** (How to play) → the card → **ANLADIM** (GOT IT).
  5. Look at the "About" card at the bottom: the version and the **MƏXFİLİK SEÇİMLƏRİ** (PRIVACY OPTIONS) button (tap it if it is there).
- **Expected:** 1 — all menus in Azerbaijani. 2 — enemy towers change from **red to orange**, yours stay blue. 3 — the marching soldiers on the title stop; in battle soldiers glide without stepping, no footstep dust and no capture flash, effects are reduced; AVTO follows the iPhone's *Reduce Motion* setting. 4 — the **NECƏ OYNANIR** card with 5 rules, all on screen, **ANLADIM** returns to Settings. 5 — **"Versiya 1.0.0 (build 15)"** (or the higher number TestFlight shows) and "İrəliləyiş bu cihazda saxlanılır" (Progress is stored on this device). In Azerbaijan **no PRIVACY OPTIONS button is normal** (Google shows it only in the EU / UK); if it is there, a tap opens a Google form that returns to the game. No "Dəstək ID" (Support ID) row in this build — normal.
- **If it fails, write:** `TF-16 FAIL: step N — <what happened>`.
- **Closes:** QA-2 · **Severity:** S2 — a setting does not apply, a different version, the privacy button errors; S3 — looks / wording.

#### TF-17 · Kill and relaunch — progress kept (1 min)
- **Tap:** swipe up from the bottom and hold in the middle (app switcher) → flick the Tower Clash card up. Open it again from the icon → **OYNA**.
- **Expected:** still **Azerbaijani**; gold / crystals at the bottom as before; the stars of the cleared levels on the map; the colour-blind setting as you left it.
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
- **Tap:** after TF-13, win level **10, 11 or 12** with **3 stars** (boosters are fine). Wait 5 seconds on the result card, then go back to the map and open another level. Then in a browser (1 min): github.com/pervincinal/InsiderTest → *Settings* → *Secrets and variables* → *Actions* → **Variables** tab — look for a variable named `RATING_PROMPT`.
- **Expected:** no "Enjoying Tower Clash?" / star-rating sheet appears — neither on the result card nor on the map; the result card works as usual (buttons, PAYLAŞ), no crash, no freeze. GitHub has **no** `RATING_PROMPT` variable (or its value is not `on`). *Note: Apple never shows this sheet in TestFlight builds, so the real proof is the missing variable; the phone half checks that nothing breaks after a 3★ win.* If two tries give no 3★, write `TF-21 not reached` — not a bug.
- **If it fails, write:** `TF-21 FAIL: rating sheet after 3★ / result card froze / RATING_PROMPT = on [screenshot]`.
- **Closes:** MM-9 (device confirmation; MM-10 build variable) · **Severity:** S3 — the variable is removed before the App Store build is made, because the review notes (APP_STORE_CONNECT_SHEET §6.4) say this version never asks for a rating.

#### TF-22 · Supply line: soldiers pass on through your own full tower (3 min)
- **Tap:** **MENYU** → map → **2** "Təchizat Xətti" (Supply Line; already cleared, no hints). Make sure the speed is ×1 (**II → SÜRƏT**).
  1. Tap your bottom tower, then the **middle** grey tower — the middle tower becomes yours (the stream keeps going).
  2. As soon as the middle tower is blue: tap the middle tower, then the **red** tower at the very top (middle → red stream).
  3. Wait: the stream from below fills the middle tower. When the middle tower's number reaches **25** its badge turns **gold** and the stream from below **stops by itself** (the usual "reinforce until full" behaviour).
  4. Now again: tap your bottom tower, then the **full** middle tower (or drag with your finger from the bottom tower onto the middle one). Watch for 20 s.
- **Expected:** in step 4 the stream opens and **does not stop**; **no** "Doludur" (Full) line, the tower does not shake; blue soldiers from below walk into the middle tower and leave it at once **onward** on its stream to the red — the middle → red stream carries visibly more soldiers than before; the middle tower stays at 25 (gold). If you stop the middle tower's stream to the red (swipe across it), the stream from below stops by itself a moment later. Finish the level normally.
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
- **Expected:** soldiers **stand out on their own coloured stream** — each has a dark outline, a column does not "melt" into the band (your build-11 report, BUG-39); soldiers are bigger than in build 14 (1.75×). Soldiers really **walk**: two legs step, a slight forward lean, a spear and two eyes; small **dust puffs** rise under their feet (on every ground: grass, sand, snow…); tank treads turn. The number of the tower at the very top of the map sits **under** the tower when needed and never overlaps another number (known exception: section 0, item 9).
- **Answer:** `TF-24: soldiers stand out yes/no, walk yes/no, dust visible yes/no` (+ screen recording).
- **Closes:** ART-20, BUG-39, ART-24 · **Severity:** S2 — soldiers vanish on the stream or numbers overlap (other than BUG-42); S3 — no visible stride / dust, or it looks odd.

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

### How to report

1. Send all results **in one message** in the chat. For each failed check **one line**: the check id + what happened, with the screenshot (or screen recording) under it. List the passed checks as well — the backlog rows can only be closed with them.
2. Example:
   ```
   Device: iPhone 17 Pro Max, iOS 26.0, build 1.0.0 (15), start 21:10
   OK: TF-01 (3 s), TF-03, TF-04, TF-05, TF-07, TF-09, TF-10, TF-14, TF-16, TF-17, TF-18, TF-22, TF-23, TF-26
   TF-02 language: game opened in EN, phone is AZ
   TF-06 FAIL: the II button touches the Dynamic Island [screenshot]
   TF-13: smoothness 4/5, warm, text crisp
   TF-24: soldiers stand out yes, walk yes, dust visible yes
   TF-11 not reached · TF-19 not done
   ```
3. The Producer files every **FAIL** line as a **BUG** in `docs/BACKLOG.md` (repro steps, device, iOS version, severity); QA adds a regression test for each fix. Nothing else is needed from you; questions come back in the chat.

### For the team: what each row needs from this pass

- **MM-1 (iOS half):** TF-02, 03, 04, 06, 07, 10, 15 pass → the WebView items of MM-1 (safe areas, audio unlock, background pause, portrait, store-unavailable state) are confirmed on iOS; the Android back-button half stays with the APK pass.
- **QA-2 (iOS half):** TF-01, 05, 08, 09, 12, 14, 16, 17, 18 pass (TF-11, TF-19 optional).
- **MM-8 (share card on device):** TF-20 pass → the native share branch (`@capacitor/share` + `@capacitor/filesystem`) is confirmed; a sheet that never opens → the Web Share fallback path in `src/native/share.ts`.
- **MM-9 / MM-10 (rating prompt off):** TF-21 pass and no `RATING_PROMPT` variable → the review-notes sentence "never requests a rating in this version" holds for the App Store build; the variable set to `on` → delete it before that build is made (or rewrite the review notes).
- **MM-4:** TF-12 without a reload to the title + TF-13 sharpness answer "crisp" → the DPR cap (`DPR_CAP.native` 2, `src/render/view.ts`) is confirmed; a reload or stutter → the two-layer fallback of docs/MOBILE.md §9.3 step 4.
- **M3-5:** TF-13 smoothness ≥ 4/5 at ×1 on the stakeholder's phone, now with the ART-23 effects and the ART-24 zoom on; ≤ 3/5 → a screen recording, then the levers listed under M3-5 in the backlog (TF-25 "hitch during effects" points at the effects first).
- **Build 9–15 device confirmations:** TF-08 + TF-23 → BUG-33 (swipe-to-cut, iPhone drag), BUG-35 (drag line), BUG-36 (no HUD press at the end of a drag); TF-02 + TF-06 → BUG-34 (full bleed, safe-edge HUD); TF-22 → RELAY-1; TF-24 → BUG-39 + ART-20 (+ the ART-24 soldier zoom); TF-25 → ART-23; TF-26 → FE-12; TF-05 + TF-09 + TF-24 → ART-24 (zoomed flat view, roof taps, badge below the base at the top edge). Each passed check lets the Producer mark that row "confirmed on device"; a FAIL reopens it as a BUG.
- **Known in build 15 (QA-24, 2026-10-14):** BUG-42 (a top-edge tower's badge flipped onto the next tower's badge, 12 late levels), BUG-43 (9:16 only — not the stakeholder's phone), BUG-44 (level 48 roof-tip tap). A TF-24 note about BUG-42 is expected and needs no new bug.
