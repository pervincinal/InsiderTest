# Developer hesablarının açılması (Azərbaycanca)

Tower Clash-i mağazalara çıxarmaq üçün iki hesab lazımdır; pul almaq (tətbiqdaxili alışlar və reklam gəliri) üçün əlavə olaraq hər iki mağazada ödəniş/vergi məlumatı, RevenueCat və AdMob hesabları lazımdır (§5). Hər ikisi şəxsi (fərdi) və ya şirkət adına ola bilər. Fərdi hesab daha sürətlidir; şirkət hesabı üçün D-U-N-S nömrəsi (pulsuz, amma 1–4 həftə çəkir) tələb olunur.

## 1. Google Play Console (Android) — 25 USD, birdəfəlik

**Lazım olanlar:** Google hesabı (Gmail), şəxsiyyət vəsiqəsi və ya pasport, bank kartı (25 USD), telefon nömrəsi.

1. https://play.google.com/console/signup ünvanına daxil ol, Google hesabınla gir.
2. Hesab növünü seç: **Yourself (Şəxsi)** və ya **An organization (Təşkilat)**. Şəxsi seçsən 5–10 dəqiqədir.
3. Developer adı (mağazada görünəcək, məsələn "Parvin Yusifli" və ya studiya adı), ünvan, telefon, e-mail daxil et. Telefon və e-mail təsdiqlənir.
4. 25 USD ödənişi kartla et.
5. **Şəxsiyyət yoxlanışı**: vəsiqənin şəklini yüklə. Adətən 1–2 gün, bəzən 1 həftə çəkir.
6. Hesab təsdiqlənəndən sonra **Create app** → ad "Tower Clash", dil English (US), pulsuz oyun.
7. Vacib qayda (2023-cü ildən yeni şəxsi hesablar üçün): oyunu birbaşa yayımlamaq olmur. Əvvəl **Closed testing** yaradılır, ən azı **12 test edən** 14 gün ərzində oyunu quraşdırmalıdır, sonra "Apply for production access" düyməsi açılır. Komanda test link və təlimatı hazırlayacaq; sənə yalnız 12 dost/həmkarın Gmail ünvanı lazımdır.
8. Oyun pulsuz olsa da, tətbiqdaxili alışlar (kristal paketləri, Reklamları sil və s.) olduğu üçün **ödəniş profili (payments profile / merchant account) lazımdır** — bax §5.1. Bunu hesab təsdiqlənəndən sonra istənilən vaxt etmək olar; məhsullar yalnız ondan sonra aktivləşir.

Bundan sonra komandaya lazım olacaq: Play Console-a girib **Setup → API access** bölməsindən service account JSON açarı (komanda CI ilə avtomatik yükləmə üçün) — bunu edəndə hesabatda addım-addım yazacağıq. İmza açarını (keystore) komanda özü yaradır, sən heç nə etmirsən.

## 2. Apple Developer Program (iOS) — 99 USD/il

**Lazım olanlar:** Apple ID (iki mərhələli doğrulama açıq olmalıdır), iPhone və ya iPad (ən rahat yol), şəxsiyyət vəsiqəsi/pasport, bank kartı.

1. iPhone-da **App Store → "Apple Developer"** tətbiqini yüklə (Apple-ın rəsmi tətbiqi).
2. Tətbiqi aç → **Account → Enroll Now**.
3. Apple ID ilə gir, şəxsi məlumatları doldur, vəsiqənin şəklini və üz skanını (selfie) çək — tətbiq özü aparır.
4. Növü seç: **Individual** (şəxsi, ən sürətli) və ya **Organization** (D-U-N-S nömrəsi və rəsmi şirkət lazımdır).
5. 99 USD/il ödənişi et. Təsdiq adətən 24–48 saat çəkir, bəzən Apple zəng edib məlumatları dəqiqləşdirir.
6. Alternativ: kompüterdən https://developer.apple.com/programs/enroll/ — eyni addımlardır, amma şəxsiyyət yoxlanışı üçün yenə tətbiq istəyə bilər.
7. Təsdiqdən sonra https://appstoreconnect.apple.com açılır. Standart "Free Apps" müqaviləsi avtomatik qəbul olunur; oyunda tətbiqdaxili alışlar olduğu üçün **"Paid Applications" (Paid Apps) müqaviləsi də lazımdır** — bank və vergi formaları ilə, bax §5.2. Müqavilə "Active" olmayana qədər alış məhsulları təqdim edilə bilmir.

Bundan sonra komandaya lazım olacaq (hər biri üçün hesabatda təlimat verəcəyik):
- App Store Connect → **Users and Access → Integrations → App Store Connect API** → yeni açar (Key ID, Issuer ID və `.p8` fayl). Bu, CI-ın imzalayıb yükləməsi üçündür; Mac tələb olunmur.
- Sertifikat və provisioning profile — komanda CI-da yaradıla bilən yolla (API açarı ilə) edəcək. Şəxsi Mac lazım deyil.

## 3. Hesablar açılandan sonra komandaya nə verməlisən

Heç bir parol vermə. Yalnız bunlar (GitHub → Settings → Secrets and variables → Actions bölməsində "New repository secret" kimi əlavə olunur; adları `docs/publishing/LAUNCH_CHECKLIST.md`-də):
- Android: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` (keystore-u komanda yaradıb sənə göndərəcək, sən yalnız secret kimi əlavə edəcəksən) və Play Console service account JSON-u (`PLAY_SERVICE_ACCOUNT_JSON`).
- iOS: `APP_STORE_CONNECT_API_KEY_ID`, `APP_STORE_CONNECT_API_ISSUER_ID`, `APP_STORE_CONNECT_API_KEY_P8`, `APPLE_TEAM_ID`.

Secret-lər əlavə olunan gün komanda release build-ləri və mağazaya yükləməni avtomatik quracaq.

## 4. Vaxt və xərc xülasəsi

| | Google Play | Apple |
|---|---|---|
| Qiymət | 25 USD (bir dəfə) | 99 USD / il |
| Təsdiq müddəti | 1–7 gün | 1–2 gün |
| Əlavə şərt | 12 test edən × 14 gün (şəxsi hesab) | İki mərhələli doğrulamalı Apple ID |
| Mac lazımdır? | Yox | Yox (CI ilə), Xcode-la əl ilə yükləmək istəsən — bəli |

## 5. Pul almaq üçün əlavə quraşdırma (alışlar və reklam)

Oyunun mağaza versiyalarında könüllü alışlar (kristal paketləri 0.99–49.99 USD, Başlanğıc paketi 2.99, Reklamları sil 3.99, Premium paket 9.99) və Google AdMob reklamları var (`docs/ECONOMY.md`). Pulun sənə çatması üçün dörd yerdə quraşdırma lazımdır. Hamısı pulsuzdur; yalnız vaxt aparır (cəmi ~2 saat + təsdiq gözləmələri). Heç bir parolu komandaya vermə — yalnız aşağıda adı çəkilən açıq açarları (`docs/publishing/LAUNCH_CHECKLIST.md` §5).

**Əvvəlcə yoxla (komanda bunu sandbox-dan yoxlaya bilmədi):** Google Play merchant qeydiyyatının və Apple-ın bank ödənişlərinin sənin ölkən üçün dəstəklənib-dəstəklənmədiyi. Google: "Supported locations for developer & merchant registration" səhifəsi (Play Console yardım mərkəzi); Apple: Agreements, Tax, and Banking bölməsində bank ölkəsi siyahısı. Dəstəklənmirsə, alışlar həmin mağazada satıla bilmir (reklam gəliri isə AdMob-dan ayrıca gəlir) — bu halda komandaya de, mağaza mətnini alışsız variantla (`STORE_LISTING.md` §1.4) hazırlayaq.

### 5.1 Google Play — ödəniş profili (payments profile)

**Lazım olanlar:** Play Console hesabı (§1), bank hesabı (IBAN, SWIFT), vergi məlumatı (fərdi: VÖEN və ya şəxsiyyət vəsiqəsi; ABŞ vətəndaşı deyilsənsə ABŞ vergi forması "Non-US" seçilir).

1. Play Console → **Setup → Payments profile** (köhnə adı "Merchant account") → **Create payments profile**.
2. Hüquqi ad, ünvan, telefon — Play Console hesabındakı ilə eyni olmalıdır.
3. **Payment method** → bank hesabı əlavə et (IBAN + SWIFT; USD və ya yerli valyuta hesabı). Google 1–2 iş günü ərzində kiçik test köçürməsi edib təsdiq istəyə bilər.
4. **Tax info** → formanı doldur (fərdi şəxs / şirkət; ABŞ mənbəli gəlir olmadığı üçün adətən "not a US person" bəyanı kifayətdir; Google sənə hansı formanın lazım olduğunu göstərir).
5. Bundan sonra Play Console → Tower Clash → **Monetize → Products → In-app products** bölməsi açılır. Məhsulları komandanın verdiyi id-lərlə (`crystals_100` … `premium_upgrade`, `STORE_LISTING.md` §6.1) və USD qiymətlərlə yarat; Google yerli qiymətləri özü hesablayır. Bu addım üçün əvvəlcə bir AAB internal testing kanalına yüklənmiş olmalıdır (komanda CI ilə yükləyəcək).
6. **Setup → License testing** → 12 test edənin Gmail ünvanlarını əlavə et: onlar alışları pulsuz ("test card") edə bilər.
7. Ödənişlər: Google ayda bir dəfə bank hesabına köçürür (tarix və minimum məbləğ Payments profile-da göstərilir); komissiya ilk 1 mln USD illik gəlir üçün 15 %, ondan yuxarı 30 %.

Komandaya lazım olacaq (şifrə yox): Play Console → **Setup → API access** → Google Cloud service account (rolları: *View financial data*, *Manage orders*) JSON açarı — bunu RevenueCat-ə (§5.3) yükləyəcəksən, GitHub-a yox.

### 5.2 Apple — "Paid Applications" müqaviləsi + bank + vergi

**Lazım olanlar:** Apple Developer hesabı (§2), bank hesabı (IBAN, SWIFT, bankın ünvanı), pasport/VÖEN məlumatı.

1. https://appstoreconnect.apple.com → **Business** (köhnə ad: Agreements, Tax, and Banking) → **Paid Apps** sətirində **Request / View and Agree to Terms** → müqaviləni oxuyub qəbul et. Yalnız **Account Holder** rolu edə bilər.
2. **Banking** → **Add Bank Account** → bankın ölkəsi, IBAN, SWIFT/BIC, hesab sahibi adı (Apple hesabındakı adla eyni). Apple bəzi ölkələr üçün hesab nömrəsi formatını ayrıca soruşur.
3. **Tax Forms** → ABŞ vergi forması: fərdi şəxs və ABŞ vətəndaşı deyilsənsə **W-8BEN** (şirkət: **W-8BEN-E**). Formada ad, ünvan, vətəndaşlıq, xarici vergi nömrəsi (VÖEN / FİN) yazılır. "Treaty benefits" (ikiqat vergitutma müqaviləsi) hissəsini yalnız ölkənlə ABŞ arasında belə müqavilə varsa doldur — komanda bunu yoxlaya bilmədi; Apple formada ölkəni seçəndə tutulma dərəcəsini özü göstərir. Apple ayrıca bəzi ölkələr üçün yerli vergi formaları da göstərə bilər — ekranda nə çıxsa onu doldur.
4. Müqavilənin statusu **Active** olana qədər (adətən 1–3 gün, bəzən Apple əlavə sənəd istəyir) App Store Connect-də alış məhsulları "Missing Metadata" qalır və versiya ilə göndərilə bilmir.
5. Sonra **My Apps → Tower Clash → In-App Purchases** → hər məhsulu komandanın verdiyi id, adı, təsviri və qiymət pilləsi ilə yarat (`STORE_LISTING.md` §6.1; 5 Consumable + 4 Non-Consumable). Hər məhsul üçün bir mağaza ekranı skrinşotu lazımdır — komanda verəcək.
6. **Users and Access → Integrations → In-App Purchase** → yeni açar (`.p8`) və **App Information → App-Specific Shared Secret** — bunlar RevenueCat-ə yüklənir (§5.3).
7. **Users and Access → Sandbox → Testers** → bir test Apple ID yarat (pulsuz alış testləri üçün).
8. Ödənişlər: Apple ayda bir dəfə, satış ayı bitdikdən ~30–45 gün sonra, minimum məbləğ (ölkəyə görə, adətən 10 USD) yığılanda köçürür; komissiya 15 % (Small Business Program-a yazılsan, ilk 1 mln USD üçün; yazılmasan 30 %). **Small Business Program**-a https://developer.apple.com/app-store/small-business-program/ ünvanından ayrıca müraciət et — pulsuzdur, komissiyanı yarıya endirir.

### 5.3 RevenueCat (alışların uçotu; pulsuz)

RevenueCat alışları özü satmır — Apple/Google satır. O yalnız qəbzləri yoxlayır və kimin nəyi aldığını yadda saxlayır (məsələn, "Reklamları sil" telefon dəyişəndə bərpa olunsun). Aylıq gəlir 2 500 USD-yə qədər pulsuzdur.

1. https://app.revenuecat.com → Google hesabı ilə qeydiyyat → **New project** → ad "Tower Clash".
2. **Apps** → **+ New** → *Apple App Store*: Bundle ID `com.pervincinal.towerclash`; §5.2 addım 6-dakı In-App Purchase açarını (`.p8`, Key ID, Issuer ID) və Shared Secret-i yüklə.
3. **Apps** → **+ New** → *Google Play Store*: paket adı `com.pervincinal.towerclash`; §5.1-dəki service account JSON faylını yüklə.
4. **Products** → **Import** (hər iki mağazadan id-ləri çəkir). **Entitlements**: `no_ads` (məhsullar: `remove_ads`, `premium_bundle`), `premium` (`premium_bundle`, `premium_upgrade`), `starter` (`starter_pack`). Kristal paketlərini heç bir entitlement-ə bağlama. **Offerings**: `default` adlı bir offering, hər məhsul üçün bir paket.
5. **Project → API keys** → iki açıq açar: `appl_…` (iOS) və `goog_…` (Android). Bunları GitHub secret kimi əlavə et: `RC_IOS_KEY`, `RC_ANDROID_KEY`. Bunlar şifrə deyil (tətbiqin içində gedir), sadəcə test build-lərə real mağaza düşməsin deyə secret saxlanılır.

### 5.4 Google AdMob (reklam gəliri)

**Lazım olanlar:** Google hesabı (Play Console ilə eyni ola bilər), ünvan (Google poçtla PIN göndərib təsdiqləyir), bank hesabı (ödəniş həddi 100 USD).

1. https://admob.google.com → **Sign up** → ölkə, saat qurşağı, valyuta seç; AdSense şərtlərini qəbul et. Hesab bir neçə gün "yoxlanılır" statusunda qala bilər.
2. **Apps → Add app** → *Android* → "Is the app listed on a supported app store?" — mağazada hələ yoxdursa **No** seç, adı "Tower Clash" yaz (sonra listinq çıxanda əlaqələndirilir). Eyni şəkildə *iOS* üçün ikinci tətbiq.
3. Hər tətbiqdə **Ad units → Add ad unit** → **Interstitial** ("level break") və **Rewarded** ("rewarded video"). Hər tətbiq üçün **App ID** (`ca-app-pub-…~…`) və iki **Ad unit ID** (`ca-app-pub-…/…`) alırsan — GitHub secret adları: `ADMOB_ANDROID_APP_ID`, `ADMOB_IOS_APP_ID`, `ADMOB_ANDROID_INTERSTITIAL`, `ADMOB_ANDROID_REWARDED`, `ADMOB_IOS_INTERSTITIAL`, `ADMOB_IOS_REWARDED`. "~" App ID-dir, "/" ad unit-dir — qarışdırsan tətbiq açılmır.
4. Hər tətbiqdə **App settings**: *Child-directed* — **No**; **Max ad content rating — G**.
5. **Privacy & messaging** → *European regulations* → mesaj yarat və **Publish** (hər iki tətbiq üçün); *US state regulations* üçün də eyni. Bunsuz Avropada razılıq forması çıxmır və yalnız fərdiləşdirilməmiş reklam gedir.
6. **Settings → Test devices** → öz telefonunu əlavə et: real reklam vahidləri ilə test edərkən öz kliklərin "etibarsız trafik" sayılmasın (AdMob buna görə hesab bağlayır).
7. **Payments** → ünvan təsdiqi (poçtla PIN, ~2–4 həftə) və bank hesabı; Google hər ayın 21-i civarı köçürür (≥ 100 USD olanda).
8. **app-ads.txt**: AdMob → **Settings → Account information → Publisher ID** (`pub-…`). Komandanın hazırladığı `docs/publishing/app-ads.txt.example` faylını bu id ilə saytın **kök** ünvanına (`https://<domen>/app-ads.txt`) qoymaq lazımdır — GitHub Pages-də bunun üçün `pervincinal.github.io` adlı ayrıca repo və ya öz domen lazımdır (`LAUNCH_CHECKLIST.md` W7 / MZ12). Onsuz da reklam gedir, amma bəzi alıcılar keçir və gəlir aşağı olur.

### 5.5 Xülasə — nə vaxt nə lazımdır

| Addım | Kim | Nə vaxt | Nəticə |
|---|---|---|---|
| Play ödəniş profili + vergi | sən | Play hesabı təsdiqlənən kimi | In-app products bölməsi açılır |
| Apple Paid Apps müqaviləsi + bank + W-8BEN | sən (Account Holder) | Apple hesabı təsdiqlənən kimi | IAP məhsulları göndərilə bilir |
| Məhsulların yaradılması (hər iki mağaza) | sən, komandanın id/qiymət cədvəli ilə | ilk AAB/IPA yüklənəndən sonra | id-lər RevenueCat-ə import olunur |
| RevenueCat layihəsi + açarlar | sən | məhsullardan sonra | `RC_IOS_KEY`, `RC_ANDROID_KEY` |
| AdMob hesabı + ad unit-lər + razılıq mesajı | sən | istənilən vaxt (mağazadan asılı deyil) | `ADMOB_*` secret-ləri |
| app-ads.txt kök saytda | sən (domen) + komanda (fayl) | AdMob publisher id-dən sonra | AdMob-da "authorized" statusu |
| Sandbox / license test alışları | sən + 1–2 test edən | secret-lər CI-a əlavə olunandan sonra | "restore purchases" real telefonda yoxlanılır |

