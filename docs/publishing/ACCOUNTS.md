# Developer hesablarının açılması (Azərbaycanca)

Tower Clash-i mağazalara çıxarmaq üçün iki hesab lazımdır. Hər ikisi şəxsi (fərdi) və ya şirkət adına ola bilər. Fərdi hesab daha sürətlidir; şirkət hesabı üçün D-U-N-S nömrəsi (pulsuz, amma 1–4 həftə çəkir) tələb olunur.

## 1. Google Play Console (Android) — 25 USD, birdəfəlik

**Lazım olanlar:** Google hesabı (Gmail), şəxsiyyət vəsiqəsi və ya pasport, bank kartı (25 USD), telefon nömrəsi.

1. https://play.google.com/console/signup ünvanına daxil ol, Google hesabınla gir.
2. Hesab növünü seç: **Yourself (Şəxsi)** və ya **An organization (Təşkilat)**. Şəxsi seçsən 5–10 dəqiqədir.
3. Developer adı (mağazada görünəcək, məsələn "Parvin Yusifli" və ya studiya adı), ünvan, telefon, e-mail daxil et. Telefon və e-mail təsdiqlənir.
4. 25 USD ödənişi kartla et.
5. **Şəxsiyyət yoxlanışı**: vəsiqənin şəklini yüklə. Adətən 1–2 gün, bəzən 1 həftə çəkir.
6. Hesab təsdiqlənəndən sonra **Create app** → ad "Tower Clash", dil English (US), pulsuz oyun.
7. Vacib qayda (2023-cü ildən yeni şəxsi hesablar üçün): oyunu birbaşa yayımlamaq olmur. Əvvəl **Closed testing** yaradılır, ən azı **12 test edən** 14 gün ərzində oyunu quraşdırmalıdır, sonra "Apply for production access" düyməsi açılır. Komanda test link və təlimatı hazırlayacaq; sənə yalnız 12 dost/həmkarın Gmail ünvanı lazımdır.
8. Oyun pulsuz olduğu üçün ödəniş profili (merchant account) lazım deyil.

Bundan sonra komandaya lazım olacaq: Play Console-a girib **Setup → API access** bölməsindən service account JSON açarı (komanda CI ilə avtomatik yükləmə üçün) — bunu edəndə hesabatda addım-addım yazacağıq. İmza açarını (keystore) komanda özü yaradır, sən heç nə etmirsən.

## 2. Apple Developer Program (iOS) — 99 USD/il

**Lazım olanlar:** Apple ID (iki mərhələli doğrulama açıq olmalıdır), iPhone və ya iPad (ən rahat yol), şəxsiyyət vəsiqəsi/pasport, bank kartı.

1. iPhone-da **App Store → "Apple Developer"** tətbiqini yüklə (Apple-ın rəsmi tətbiqi).
2. Tətbiqi aç → **Account → Enroll Now**.
3. Apple ID ilə gir, şəxsi məlumatları doldur, vəsiqənin şəklini və üz skanını (selfie) çək — tətbiq özü aparır.
4. Növü seç: **Individual** (şəxsi, ən sürətli) və ya **Organization** (D-U-N-S nömrəsi və rəsmi şirkət lazımdır).
5. 99 USD/il ödənişi et. Təsdiq adətən 24–48 saat çəkir, bəzən Apple zəng edib məlumatları dəqiqləşdirir.
6. Alternativ: kompüterdən https://developer.apple.com/programs/enroll/ — eyni addımlardır, amma şəxsiyyət yoxlanışı üçün yenə tətbiq istəyə bilər.
7. Təsdiqdən sonra https://appstoreconnect.apple.com açılır. Oyun pulsuz olduğu üçün "Paid Apps" müqaviləsi lazım deyil; yalnız standart "Free Apps" müqaviləsini qəbul et (Agreements bölməsi).

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
