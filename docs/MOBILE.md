# Tower Clash on iOS and Android

## Qısa xülasə (Azərbaycanca)

Tower Clash artıq üç formada telefonda oynanıla bilər:

1. **PWA (ən asan, indi işləyir):** oyunun veb ünvanını Safari (iPhone) və ya Chrome (Android) ilə açın və "Ana ekrana əlavə et" / "Tətbiqi quraşdır" seçin. Heç bir mağaza, hesab və ya ödəniş lazım deyil.
2. **Android APK (test üçün):** hər push-dan sonra GitHub Actions avtomatik `app-debug.apk` faylı hazırlayır. Onu yükləyib telefona quraşdırmaq olar (aşağıda addım-addım izah var).
3. **iOS tətbiqi:** Capacitor layihəsi hazırdır (`tower-clash/ios/`), amma real iPhone-a yükləmək üçün Apple Developer hesabı (ildə 99 USD) lazımdır. Hələlik CI yalnız simulyator üçün imzasız build edir.

Mağazalara (App Store / Google Play) çıxarmaq üçün nə lazımdır: Apple Developer hesabı (99 USD/il), Google Play Console hesabı (25 USD, bir dəfə), imza açarları, skrinşotlar və məxfilik siyasəti səhifəsi (oyun heç bir məlumat toplamır, şəbəkəyə çıxmır — siyasət bir cümlədən ibarət ola bilər). Ətraflı ingiliscə izah aşağıdadır.

---

## 1. Install as a PWA (no store, works today)

The web build ships a `manifest.webmanifest`, home-screen icons (`public/icons/`), the iOS `apple-mobile-web-app-*` meta tags and a service worker, so once pinned to the home screen it opens fullscreen with the Tower Clash icon and works offline.

**iPhone / iPad (Safari only — Chrome on iOS cannot install PWAs):**
1. Open the game URL in Safari.
2. Tap **Share** (the square with the arrow).
3. Scroll and tap **Add to Home Screen**, then **Add**.
4. Launch "Tower Clash" from the home screen. It opens fullscreen without the Safari bars.

**Android (Chrome):**
1. Open the game URL in Chrome.
2. Tap the **⋮** menu → **Install app** (or **Add to Home screen**), then **Install**.
3. Launch from the app drawer.

## 2. Get the Android debug APK from GitHub Actions

Every push that touches `tower-clash/` (except iOS-only changes) runs the **tower-clash-android** workflow, which produces an unsigned debug APK.

1. Open the repository on GitHub → **Actions** → **tower-clash-android**.
2. Click the latest green run for your branch.
3. Scroll to **Artifacts** and download **tower-clash-debug-apk** (a zip containing `app-debug.apk`). Artifacts are kept for 30 days.
4. Copy `app-debug.apk` to the phone (USB, Google Drive, Telegram "send as file", etc.) and tap it.
5. Android will ask to allow installs from that source ("Install unknown apps") — allow it once for that app (Files/Chrome/Drive).
6. Tap **Install**. Play Protect may warn that the app is unverified because it is a debug build; choose **Install anyway**.

You can also trigger the workflow manually: **Actions → tower-clash-android → Run workflow**.

Alternative with a USB cable and the Android SDK installed: `adb install -r app-debug.apk`.

## 3. iOS builds

The **tower-clash-ios** workflow (manual, or automatic when `tower-clash/ios/**` changes) runs on a macOS runner and builds the app **for the iOS Simulator, unsigned**. The artifact **tower-clash-ios-simulator** contains `App.app`; it runs in Xcode's Simulator on a Mac (`xcrun simctl install booted App.app`) but **cannot be installed on a real iPhone**. Installing on a physical device requires an Apple Developer account and code signing (see section 5).

## 4. Build locally

Prerequisites: Node 22, and the repo cloned. All commands run inside `tower-clash/`.

```bash
npm ci                 # install dependencies (includes Capacitor)
npm run cap:sync       # build the web app into dist/ and copy it into android/ and ios/
```

**Android (Android Studio, or just the SDK + JDK 17):**
```bash
npm run android:build  # = cap:sync + ./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
npx cap open android   # or open the android/ folder in Android Studio and press Run
```
Android Studio installs the SDK for you. On the command line, set `ANDROID_HOME` (or `android/local.properties` with `sdk.dir=...`).

**iOS (macOS with Xcode 15+ only):**
```bash
npm run ios:open       # = cap:sync + open ios/App/App.xcodeproj in Xcode
```
Then pick a Simulator (or your iPhone) as the run destination and press Run. The first time Xcode resolves the Capacitor Swift package automatically. To run on a physical iPhone, select your Apple ID team under *Signing & Capabilities* (a free Apple ID works for 7-day personal builds).

**Icons and splash screens** are generated from `resources/icon.svg` and `resources/splash.svg`:
```bash
npm run icons:generate # renders the SVGs to PNG with headless Chromium, then runs @capacitor/assets
```

Project facts:
- App id / bundle id: `com.pervincinal.towerclash`; display name: `Tower Clash`.
- Android: minSdk 24, target/compile SDK 36, portrait only, fullscreen (no status bar), navy (#0f172a) system bars.
- iOS: deployment target iOS 15, portrait only, status bar hidden, `contentInset: never` (the canvas draws under the notch, the web viewport uses `viewport-fit=cover`).
- The native shells only load `dist/`; there is no native game code. Web changes reach the apps through `npx cap sync`.

## 5. What a real store release needs

The game stores nothing (no accounts, no saves sent anywhere) and makes **no network calls** — it is a fully offline single-player game. That keeps the store paperwork minimal, but the following are still mandatory.

| Item | Apple App Store | Google Play |
|---|---|---|
| Developer account | Apple Developer Program, **USD 99 / year** (needs an Apple ID with 2FA; DUNS number only for company accounts) | Google Play Console, **USD 25 one-time**; new personal accounts must run a 14-day closed test with 12+ testers before production access |
| Signing | Distribution certificate + App Store provisioning profile (created in Xcode or at developer.apple.com) | Upload keystore (`.jks`) that **must never be lost**; enrol in Play App Signing |
| App identifier | Bundle ID `com.pervincinal.towerclash` registered in the developer portal | Package name `com.pervincinal.towerclash` (fixed forever after first upload) |
| Build format | `.ipa` archived with Xcode (Product → Archive → Distribute) | `.aab` (`./gradlew bundleRelease`), not `.apk` |
| Store listing | Name, subtitle, description, keywords, category (Games / Strategy), age rating questionnaire, support URL | Title, short/full description, category, content rating questionnaire (IARC), Data safety form ("no data collected") |
| Screenshots | 6.7" and 6.5" iPhone (and 12.9" iPad if iPad is supported) | Phone screenshots (min 2), 512×512 icon, 1024×500 feature graphic |
| Privacy policy | Public URL required even for no-data apps | Public URL required |
| Review | Apple manual review, typically 1–3 days | Automated + policy review, hours to days |

Suggested privacy policy text (host it as a public page, e.g. GitHub Pages):
> Tower Clash does not collect, store or transmit any personal data. The game has no accounts, no analytics, no advertising and makes no network requests.

Versioning: bump `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` (iOS) and `versionName` / `versionCode` (`android/app/build.gradle`) for every store upload.

## 6. CI secrets for signed builds (names only)

None of these exist yet; the current workflows build unsigned. When the accounts exist, add them under *Settings → Secrets and variables → Actions*:

**Android (release AAB/APK):**
- `ANDROID_KEYSTORE_BASE64` — the release keystore (`.jks`) encoded with `base64 -w0`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` — only if uploads to Play Console should be automated

**iOS (device / TestFlight builds):**
- `APPLE_TEAM_ID`
- `IOS_DISTRIBUTION_CERT_P12_BASE64` and `IOS_DISTRIBUTION_CERT_PASSWORD`
- `IOS_PROVISIONING_PROFILE_BASE64`
- `KEYCHAIN_PASSWORD` — a throwaway password for the temporary CI keychain
- `APP_STORE_CONNECT_API_KEY_ID`, `APP_STORE_CONNECT_API_ISSUER_ID`, `APP_STORE_CONNECT_API_KEY_P8_BASE64` — only for automated TestFlight/App Store uploads

## 7. Open items

- Keep `public/icons/*` (PWA) and `resources/icon.svg` (native) visually in sync when the mark changes; `npm run icons:generate` only regenerates the native assets.
- The iOS workflow has not yet run on a macOS runner (no Xcode in the development sandbox); the first `workflow_dispatch` run validates the SPM project build.
- Signed builds: create the accounts and secrets above, then add release jobs to the workflows.
