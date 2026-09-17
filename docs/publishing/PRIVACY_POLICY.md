# Tower Clash — Privacy Policy / Məxfilik Siyasəti

**Version 2.1 · Last updated: 2026-09-14** · **Versiya 2.1 · Son yenilənmə: 14.09.2026**

Tower Clash exists in two forms, and they handle data differently. Please read the section for the version you use:

- **Part A — Web / PWA version** (played in a browser or installed from the browser to the home screen): stores progress on your device only; no ads, no purchases, no network calls after loading.
- **Part B — Mobile app versions** (installed from Google Play or the Apple App Store, package `com.pervincinal.towerclash`): the same game, plus optional in-app purchases and advertising, which involve two service providers (Google AdMob and RevenueCat).

This page is hosted publicly (planned address: `https://pervincinal.github.io/InsiderTest/privacy.html`) and linked from both store listings. Version history: 1.0 (2026-09-13, web-only wording); 2.0 (2026-09-13, adds Part B for the store apps); 2.1 (2026-09-14, iOS: no tracking prompt, non-personalised ads only).

---

## English

### Part A — Web / PWA version

**The short version.** The web version of Tower Clash does not collect, store or transmit any personal data. There are no accounts, no analytics, no advertising, no purchases and no network requests after the game has loaded. Your progress lives only on your own device.

**What the game stores, and where.** The game remembers your progress (stars per level, gold and crystals earned in play, upgrades, skins, daily-reward streak, and your settings: language, colour-blind palette, sound, reduced motion). This is saved in the browser's local storage on your device. It never leaves the device. Clearing the browser's site data or removing the installed web app deletes it completely.

**What the web version does not do.**
- It does not connect to the internet after the first page load; it works fully offline.
- It does not ask for or use any device permission (no camera, microphone, contacts, location, storage, notifications).
- It does not show advertising and contains no advertising SDK.
- It does not use analytics, crash reporting or any third-party SDK.
- It has no accounts, sign-in, chat, friends lists or leaderboards.
- It has no real-money purchases. Nothing in the web version asks for payment.
- It does not use cookies or tracking identifiers.

### Part B — Mobile app versions (Google Play, App Store)

**The short version.** The mobile apps store your progress on your device, exactly like the web version. In addition they can show advertisements (Google AdMob) and sell optional in-app purchases (processed by Google Play or the App Store, with RevenueCat keeping track of what you own). For this, two things leave your device: an **advertising identifier** for ads, and **purchase receipts** for purchases. The game itself never asks for your name, e-mail, phone number or any account.

#### B.1 Progress on your device

Stars, gold, crystals, upgrades, skins, purchase entitlements (for example "Remove Ads") and settings are saved in the app's private storage on your phone. Uninstalling the app deletes this data. Purchases you have paid for can be restored afterwards through the store (see B.5).

#### B.2 Advertising — Google AdMob (Google LLC)

The apps show two kinds of ads: a short full-screen ad between levels (never during a battle, never in the first five levels, at most one every three completed levels and never more than four per session), and "rewarded" videos that you choose to watch for an in-game bonus. Rewarded ads are only ever started by you.

To show ads, the Google Mobile Ads SDK inside the app sends the following to Google:

- **Advertising identifier** of your device (Google Advertising ID on Android; on iOS none — the app never asks for tracking permission, so Apple's advertising identifier (IDFA) is not available to the ad SDK, see below), used to serve, cap and measure ads, and to detect fraud.
- **Device and app information**: device model, operating system version, language, screen size, app version, IP address, and how you interact with an ad (view, click, close). Google may derive a **coarse (approximate) location** from your IP address for ad delivery and legal compliance; the app itself never requests location permission.

**Personalised vs. non-personalised ads.** In the European Economic Area, the United Kingdom and Switzerland the app shows Google's consent form (User Messaging Platform, GDPR) before any ad is requested; if you refuse, you still get ads, but only non-personalised ones, and the advertising identifier is not used for profiling. On iOS the app never asks for tracking permission (there is no "Allow tracking?" prompt) and always requests non-personalised ads; Google receives no IDFA. On Android, personalisation follows your answer in the consent form where that form applies. You can change your choice at any time:

- Android: Settings → Google → Ads → *Delete advertising ID* or *Opt out of Ads Personalisation* (wording varies by Android version).
- iOS: nothing to change — ads in the iOS app are always non-personalised. (The system setting Settings → Privacy & Security → Tracking is not used by the app.)
- EEA/UK/Switzerland: the in-game Settings screen has a "Privacy options" entry that reopens the consent form (mobile apps only; shown when the consent framework requires it).
- Google's ad settings: https://adssettings.google.com

Google's own description of how it uses ad data: https://policies.google.com/technologies/partner-sites and https://policies.google.com/privacy. The ads themselves may include a link to Google's "Why this ad?" information.

The **"Remove Ads"** and **"Premium Bundle"** purchases switch off the between-level ads permanently. Rewarded videos remain available (you can still choose to watch them) and the ad SDK stays in the app; if you never tap a rewarded button after buying Remove Ads, the app still loads a rewarded ad in the background, which sends the identifiers described above. If you want no ad traffic at all, use the web version.

#### B.3 In-app purchases — Apple, Google and RevenueCat (RevenueCat, Inc.)

All purchases (crystal packs, Starter Pack, Remove Ads, Premium Bundle, Premium Upgrade) are one-time purchases made through the App Store or Google Play using the payment method on your store account. **We never see your card number, billing address, name or e-mail** — the store handles payment and shows the price in your local currency before you confirm.

After a purchase, the app hands the store's **purchase receipt / transaction token** to RevenueCat, a service that validates receipts and remembers which non-consumable products (Remove Ads, Premium, Starter Pack) belong to your installation so they can be restored. RevenueCat stores:

- an **anonymous app user ID** generated on your device by the RevenueCat SDK (a random string, not linked to your name or store account by us);
- the **purchase history**: product ids, prices and currency, purchase and refund dates, and the store's transaction identifiers;
- basic **device information** (platform, OS version, app version, locale, and a per-install identifier used to keep the anonymous id stable).

RevenueCat acts on our behalf as a data processor; its privacy policy is at https://www.revenuecat.com/privacy and its terms at https://www.revenuecat.com/terms. Apple's and Google's handling of your payment is covered by their own policies: https://www.apple.com/legal/privacy/ and https://policies.google.com/privacy.

There are no subscriptions and no random paid items (no loot boxes).

#### B.4 Data we do not collect

- No account, sign-in, name, e-mail, phone number, contacts or photos.
- No precise location (no location permission is requested).
- No analytics or behavioural tracking beyond what the ad and purchase SDKs above need to work.
- No data is sold. The only recipients are Google (ads, Play Billing), Apple (App Store payments) and RevenueCat (receipt validation), each for the purpose described.

#### B.5 Retention

- **On your device:** progress and entitlements stay until you uninstall the app or use *Settings → Reset progress*.
- **RevenueCat:** purchase records are kept for as long as the app is offered, so your purchases can be restored on a new phone. We can ask RevenueCat to delete the record for an anonymous app user ID on request (see B.7).
- **Google AdMob:** Google retains ad-serving logs according to its own policy (https://policies.google.com/technologies/retention); we do not receive per-user ad data from Google, only aggregated statistics.
- **Apple / Google Play:** your purchase history is part of your store account and is governed by Apple's / Google's terms.

#### B.6 Children

Tower Clash is not directed at children under 13 (or the higher age of digital consent in your country) and is listed for a general audience. The app is registered with Google AdMob as **not child-directed**, with the maximum ad content rating set to "G" (general audiences). If you are under the age of digital consent in your country, the app does not serve personalised ads to you when you decline the consent form (and never on iOS, where ads are always non-personalised), and we ask that you do not make purchases without a parent's or guardian's permission — store parental controls (Apple "Ask to Buy", Google Play purchase authentication) apply to every purchase in the app.

#### B.7 Your rights and choices

- **Delete everything on the device:** uninstall the app (or reset progress in Settings).
- **Ad personalisation:** opt out with the system settings or the in-game "Privacy options" listed in B.2. Resetting the advertising ID on your device disconnects future ad data from past data.
- **Purchase records:** to have RevenueCat's record of your anonymous app user ID deleted, e-mail us (below) with the "Support ID" shown in the game's Settings → About screen (mobile apps only). Note that deleting it also removes the ability to restore purchases from that installation; the store's own purchase history is unaffected and can be managed with Apple or Google.
- **EU/EEA, UK, Swiss, Brazilian, Californian and similar rights** (access, correction, deletion, objection, portability, complaint to a supervisory authority) apply to the data above. Because we hold no identifying information, we may need the Support ID to locate a record. The legal basis for processing is your consent (personalised ads on Android, where the consent form applies), the performance of a contract (purchases) and our legitimate interest in showing non-personalised ads and preventing fraud.
- **Do Not Sell / Share (US state laws):** we do not sell personal data. Where the use of an advertising identifier for personalised ads counts as "sharing", the AdMob consent form (US state regulations message) and the system opt-outs above are the way to refuse.

#### B.8 Security

Data in transit between the app and Google / RevenueCat uses HTTPS (TLS). The app stores no payment details. Anonymous identifiers are only ever generated on the device.

### Changes to this policy

If a future version changes what is collected (for example online leaderboards), this page is updated before that version ships and the version number and "last updated" date change. Material changes for the mobile apps are also summarised in the store "What's new" text.

Changelog: 2.1 (2026-09-14) — the iOS app never asks for tracking permission (Apple's App Tracking Transparency prompt was removed) and always requests non-personalised ads; B.2, B.6 and B.7 re-worded accordingly. 2.0 (2026-09-13) — Part B (mobile apps: ads, purchases, RevenueCat) added. 1.0 (2026-09-13) — first version, web only.

### Contact

Questions about this policy or a deletion request: `[developer e-mail]`
Data controller: `[developer name / address]` (the person or company that publishes the app on the stores).

---

## Azərbaycanca

Tower Clash iki formada mövcuddur və onlar məlumatla fərqli davranır. İstifadə etdiyiniz versiyaya aid hissəni oxuyun:

- **A hissəsi — Veb / PWA versiyası** (brauzerdə oynanır və ya brauzerdən ana ekrana quraşdırılır): irəliləyiş yalnız cihazınızda saxlanılır; reklam, alış və yükləndikdən sonra şəbəkə sorğusu yoxdur.
- **B hissəsi — Mobil tətbiq versiyaları** (Google Play və ya Apple App Store-dan quraşdırılır, paket `com.pervincinal.towerclash`): eyni oyun, üstəgəl könüllü tətbiqdaxili alışlar və reklamlar; bunlar iki xidmət təminatçısını (Google AdMob və RevenueCat) əhatə edir.

Bu səhifə açıq şəkildə yerləşdirilir (planlaşdırılan ünvan: `https://pervincinal.github.io/InsiderTest/privacy.html`) və hər iki mağaza səhifəsindən link verilir. Versiya tarixçəsi: 1.0 (13.09.2026, yalnız veb); 2.0 (13.09.2026, mağaza tətbiqləri üçün B hissəsi əlavə olunub); 2.1 (14.09.2026, iOS: izləmə sorğusu yoxdur, yalnız fərdiləşdirilməmiş reklam).

### A hissəsi — Veb / PWA versiyası

**Qısa versiya.** Tower Clash-in veb versiyası heç bir şəxsi məlumat toplamır, saxlamır və ötürmür. Hesab, analitika, reklam, alış yoxdur; oyun yükləndikdən sonra heç bir şəbəkə sorğusu göndərilmir. İrəliləyişiniz yalnız öz cihazınızda saxlanılır.

**Oyun nəyi və harada saxlayır.** Oyun irəliləyişinizi yadda saxlayır: hər səviyyə üzrə ulduzlar, oyunda qazanılan qızıl və kristallar, təkmilləşdirmələr, görünüşlər (skinlər), gündəlik mükafat seriyası və parametrləriniz (dil, rəng korluğu palitrası, səs, azaldılmış hərəkət). Bu məlumat brauzerin yerli yaddaşında, cihazınızda saxlanılır. Cihazdan kənara çıxmır. Brauzerin sayt məlumatlarını təmizləmək və ya quraşdırılmış veb tətbiqi silmək bu məlumatı tamamilə silir.

**Veb versiyası nə etmir.**
- İlk yüklənmədən sonra internetə qoşulmur; tam oflayn işləyir.
- Heç bir cihaz icazəsi istəmir və istifadə etmir (kamera, mikrofon, kontaktlar, məkan, yaddaş, bildirişlər yoxdur).
- Reklam göstərmir və heç bir reklam SDK-sı yoxdur.
- Analitika, xəta hesabatı və ya üçüncü tərəf SDK-sı istifadə etmir.
- Hesab, giriş, çat, dost siyahısı və ya liderlər cədvəli yoxdur.
- Real pulla alış yoxdur. Veb versiyasında heç nə ödəniş istəmir.
- Kuki və ya izləmə identifikatorları istifadə etmir.

### B hissəsi — Mobil tətbiq versiyaları (Google Play, App Store)

**Qısa versiya.** Mobil tətbiqlər irəliləyişinizi veb versiyası kimi cihazınızda saxlayır. Əlavə olaraq reklam göstərə bilər (Google AdMob) və könüllü tətbiqdaxili alışlar təklif edir (ödənişi Google Play və ya App Store aparır, RevenueCat isə nəyə sahib olduğunuzu yadda saxlayır). Bunun üçün cihazınızdan iki şey çıxır: reklamlar üçün **reklam identifikatoru** və alışlar üçün **alış qəbzləri**. Oyun özü heç vaxt adınızı, e-poçtunuzu, telefon nömrənizi və ya hesab istəmir.

#### B.1 Cihazınızdakı irəliləyiş

Ulduzlar, qızıl, kristallar, təkmilləşdirmələr, görünüşlər, alış hüquqları (məsələn "Reklamları sil") və parametrlər telefonunuzda tətbiqin şəxsi yaddaşında saxlanılır. Tətbiqi silmək bu məlumatı silir. Pul ödədiyiniz alışlar sonradan mağaza vasitəsilə bərpa edilə bilər (bax B.5).

#### B.2 Reklam — Google AdMob (Google LLC)

Tətbiqlər iki növ reklam göstərir: səviyyələr arasında qısa tam ekran reklam (heç vaxt döyüş zamanı, heç vaxt ilk beş səviyyədə, ən çox hər üç tamamlanmış səviyyədə bir dəfə və bir sessiyada dörddən çox olmayaraq) və oyundaxili bonus üçün özünüzün seçdiyiniz "mükafatlı" videolar. Mükafatlı reklamları yalnız siz başladırsınız.

Reklam göstərmək üçün tətbiqdəki Google Mobile Ads SDK Google-a bunları göndərir:

- Cihazınızın **reklam identifikatoru** (Android-də Google Advertising ID; iOS-da yoxdur — tətbiq heç vaxt izləmə icazəsi istəmir, ona görə Apple-ın reklam identifikatoru (IDFA) reklam SDK-sı üçün əlçatan deyil, aşağıya bax) — reklamları göstərmək, sayını məhdudlaşdırmaq, ölçmək və saxtakarlığı aşkarlamaq üçün.
- **Cihaz və tətbiq məlumatı**: cihaz modeli, əməliyyat sistemi versiyası, dil, ekran ölçüsü, tətbiq versiyası, IP ünvanı və reklamla necə davrandığınız (baxış, klik, bağlama). Google reklam çatdırılması və qanuni tələblər üçün IP ünvanınızdan **təxmini (kobud) məkan** çıxara bilər; tətbiq özü heç vaxt məkan icazəsi istəmir.

**Fərdiləşdirilmiş və fərdiləşdirilməmiş reklamlar.** Avropa İqtisadi Zonası, Böyük Britaniya və İsveçrədə tətbiq hər hansı reklam istəməzdən əvvəl Google-un razılıq formasını (User Messaging Platform, GDPR) göstərir; rədd etsəniz yenə reklam görürsünüz, amma yalnız fərdiləşdirilməmiş, və reklam identifikatoru profil üçün istifadə olunmur. iOS-da tətbiq heç vaxt izləmə icazəsi istəmir ("İzləməyə icazə verilsin?" sorğusu yoxdur) və həmişə fərdiləşdirilməmiş reklam sorğusu göndərir; Google IDFA almır. Android-də fərdiləşdirmə, razılıq formasının tətbiq olunduğu yerlərdə, oradakı cavabınıza uyğundur. Seçiminizi istənilən vaxt dəyişə bilərsiniz:

- Android: Parametrlər → Google → Reklamlar → *Reklam ID-sini sil* və ya *Reklam fərdiləşdirməsindən imtina et* (Android versiyasına görə adlar fərqlənir).
- iOS: dəyişməyə ehtiyac yoxdur — iOS tətbiqində reklamlar həmişə fərdiləşdirilməmişdir. (Parametrlər → Məxfilik və Təhlükəsizlik → İzləmə sistem parametrini tətbiq istifadə etmir.)
- AİZ/BB/İsveçrə: oyundaxili Parametrlər ekranındakı "Məxfilik seçimləri" razılıq formasını yenidən açır (yalnız mobil tətbiqlərdə; razılıq çərçivəsi tələb edəndə göstərilir).
- Google reklam parametrləri: https://adssettings.google.com

Google-un reklam məlumatını necə istifadə etdiyi: https://policies.google.com/technologies/partner-sites və https://policies.google.com/privacy.

**"Reklamları sil"** və **"Premium paket"** alışları səviyyələr arasındakı reklamları həmişəlik söndürür. Mükafatlı videolar qalır (istəsəniz yenə baxa bilərsiniz) və reklam SDK-sı tətbiqdə qalır; Reklamları sil aldıqdan sonra heç vaxt mükafatlı düyməyə toxunmasanız belə, tətbiq arxa planda mükafatlı reklam yükləyir və bu, yuxarıdakı identifikatorları göndərir. Heç bir reklam trafiki istəmirsinizsə, veb versiyasından istifadə edin.

#### B.3 Tətbiqdaxili alışlar — Apple, Google və RevenueCat (RevenueCat, Inc.)

Bütün alışlar (kristal paketləri, Başlanğıc paketi, Reklamları sil, Premium paket, Premium təkmilləşdirmə) App Store və ya Google Play vasitəsilə, mağaza hesabınızdakı ödəniş üsulu ilə edilən birdəfəlik alışlardır. **Biz kart nömrənizi, ünvanınızı, adınızı və ya e-poçtunuzu heç vaxt görmürük** — ödənişi mağaza aparır və təsdiqdən əvvəl qiyməti yerli valyutada göstərir.

Alışdan sonra tətbiq mağazanın **alış qəbzini / əməliyyat tokenini** RevenueCat-ə ötürür — bu xidmət qəbzləri yoxlayır və hansı daimi məhsulların (Reklamları sil, Premium, Başlanğıc paketi) sizin quraşdırmanıza aid olduğunu yadda saxlayır ki, bərpa edilə bilsin. RevenueCat bunları saxlayır:

- RevenueCat SDK-nın cihazınızda yaratdığı **anonim tətbiq istifadəçi ID-si** (təsadüfi sətir; biz onu adınızla və ya mağaza hesabınızla əlaqələndirmirik);
- **alış tarixçəsi**: məhsul id-ləri, qiymət və valyuta, alış və geri qaytarma tarixləri, mağazanın əməliyyat identifikatorları;
- əsas **cihaz məlumatı** (platforma, OS versiyası, tətbiq versiyası, dil; anonim id-ni sabit saxlamaq üçün quraşdırma identifikatoru).

RevenueCat bizim adımızdan məlumat emalçısı kimi çıxış edir; məxfilik siyasəti: https://www.revenuecat.com/privacy, şərtləri: https://www.revenuecat.com/terms. Apple və Google-un ödənişinizi necə emal etdiyi onların öz siyasətlərində: https://www.apple.com/legal/privacy/ və https://policies.google.com/privacy.

Abunəlik yoxdur, pullu təsadüfi əşyalar (loot box) yoxdur.

#### B.4 Toplamadığımız məlumatlar

- Hesab, giriş, ad, e-poçt, telefon nömrəsi, kontaktlar və ya fotolar yoxdur.
- Dəqiq məkan yoxdur (məkan icazəsi istənilmir).
- Yuxarıdakı reklam və alış SDK-larının işləməsi üçün lazım olandan başqa analitika və ya davranış izləməsi yoxdur.
- Heç bir məlumat satılmır. Yeganə alıcılar Google (reklam, Play Billing), Apple (App Store ödənişləri) və RevenueCat-dir (qəbz yoxlaması), hər biri təsvir olunan məqsəd üçün.

#### B.5 Saxlama müddəti

- **Cihazınızda:** irəliləyiş və alış hüquqları tətbiqi silənə və ya *Parametrlər → İrəliləyişi sıfırla* edənə qədər qalır.
- **RevenueCat:** alış qeydləri tətbiq təklif olunduğu müddətdə saxlanılır ki, alışlarınızı yeni telefonda bərpa edə biləsiniz. Sorğunuzla anonim tətbiq istifadəçi ID-sinə aid qeydin silinməsini RevenueCat-dən istəyə bilərik (bax B.7).
- **Google AdMob:** Google reklam qeydlərini öz siyasətinə görə saxlayır (https://policies.google.com/technologies/retention); biz Google-dan istifadəçi üzrə reklam məlumatı almırıq, yalnız ümumi statistika.
- **Apple / Google Play:** alış tarixçəniz mağaza hesabınızın hissəsidir və Apple / Google şərtlərinə tabedir.

#### B.6 Uşaqlar

Tower Clash 13 yaşdan kiçik uşaqlara (və ya ölkənizdəki daha yüksək rəqəmsal razılıq yaşına) yönəlməyib və ümumi auditoriya üçün siyahıya alınıb. Tətbiq Google AdMob-da **uşaqlara yönəlməmiş** kimi qeydiyyatdadır, maksimum reklam məzmun reytinqi "G" (ümumi auditoriya) olaraq təyin edilib. Ölkənizdəki rəqəmsal razılıq yaşından kiçiksinizsə, razılıq formasını rədd etdikdə tətbiq sizə fərdiləşdirilmiş reklam göstərmir (iOS-da isə heç vaxt, çünki orada reklamlar həmişə fərdiləşdirilməmişdir); valideyn və ya qəyyumun icazəsi olmadan alış etməməyinizi xahiş edirik — mağazaların valideyn nəzarəti (Apple "Ask to Buy", Google Play alış təsdiqi) tətbiqdəki hər alışa şamil olunur.

#### B.7 Hüquqlarınız və seçimləriniz

- **Cihazdakı hər şeyi silmək:** tətbiqi silin (və ya Parametrlərdə irəliləyişi sıfırlayın).
- **Reklam fərdiləşdirməsi:** B.2-də göstərilən sistem parametrləri və ya oyundaxili "Məxfilik seçimləri" ilə imtina edin. Cihazda reklam ID-sini sıfırlamaq gələcək reklam məlumatını keçmişdən ayırır.
- **Alış qeydləri:** RevenueCat-dəki anonim tətbiq istifadəçi ID-nizin qeydinin silinməsi üçün oyunun Parametrlər → Haqqında ekranındakı "Dəstək ID"-si ilə bizə e-poçt yazın (yalnız mobil tətbiqlərdə). Nəzərə alın: silinmə həmin quraşdırmadan alışları bərpa etmək imkanını da aradan qaldırır; mağazanın öz alış tarixçəsi dəyişmir və Apple / Google ilə idarə oluna bilər.
- **Aİ/AİZ, BB, İsveçrə, Braziliya, Kaliforniya və oxşar hüquqlar** (əlçatanlıq, düzəliş, silinmə, etiraz, daşınma, nəzarət orqanına şikayət) yuxarıdakı məlumata şamil olunur. Şəxsiyyəti müəyyən edən məlumat saxlamadığımız üçün qeydi tapmaq üçün Dəstək ID-si lazım ola bilər. Emalın hüquqi əsası: razılığınız (razılıq formasının tətbiq olunduğu yerlərdə Android-də fərdiləşdirilmiş reklam), müqavilənin icrası (alışlar) və fərdiləşdirilməmiş reklam göstərmək və saxtakarlığın qarşısını almaq üzrə qanuni marağımız.
- **Satma / Paylaşma (ABŞ ştat qanunları):** şəxsi məlumat satmırıq. Reklam identifikatorunun fərdiləşdirilmiş reklam üçün istifadəsi "paylaşma" sayıldıqda, AdMob razılıq forması (ABŞ ştat mesajı) və yuxarıdakı sistem imtinaları rədd etmə yoludur.

#### B.8 Təhlükəsizlik

Tətbiq ilə Google / RevenueCat arasındakı məlumat HTTPS (TLS) ilə ötürülür. Tətbiq ödəniş məlumatı saxlamır. Anonim identifikatorlar yalnız cihazda yaradılır.

### Bu siyasətdə dəyişikliklər

Gələcək versiya toplananları dəyişsə (məsələn, onlayn liderlər cədvəli), həmin versiya çıxmazdan əvvəl bu səhifə yenilənir, versiya nömrəsi və "son yenilənmə" tarixi dəyişir. Mobil tətbiqlər üçün əhəmiyyətli dəyişikliklər mağazanın "Yeniliklər" mətnində də qeyd olunur.

Dəyişikliklər tarixçəsi: 2.1 (14.09.2026) — iOS tətbiqi heç vaxt izləmə icazəsi istəmir (Apple-ın App Tracking Transparency sorğusu çıxarılıb) və həmişə fərdiləşdirilməmiş reklam sorğusu göndərir; B.2, B.6 və B.7 buna uyğun yenidən yazılıb. 2.0 (13.09.2026) — B hissəsi (mobil tətbiqlər: reklam, alışlar, RevenueCat) əlavə olunub. 1.0 (13.09.2026) — ilk versiya, yalnız veb.

### Əlaqə

Bu siyasətlə bağlı suallar və ya silinmə sorğusu: `[developer e-mail]`
Məlumat nəzarətçisi: `[developer name / address]` (tətbiqi mağazalarda nəşr edən şəxs və ya şirkət).
