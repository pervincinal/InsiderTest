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
- iOS: deployment target iOS 15, portrait only, status bar hidden, `contentInset: never` (the canvas draws under the notch, the web viewport uses `viewport-fit=cover`), `ITSAppUsesNonExemptEncryption = NO` in `Info.plist` (no encryption, no network).
- The native shells only load `dist/`; there is no native game code. Web changes reach the apps through `npx cap sync`.

**Native plugins** (exact pins in `package.json`, all Capacitor 8):

| Package | Version | Used for |
|---|---|---|
| `@capacitor/status-bar` | 8.0.3 | hide the status bar and let the canvas draw under it (`setOverlaysWebView`) |
| `@capacitor/screen-orientation` | 8.0.1 | lock portrait at runtime (in addition to the manifest / Info.plist locks) |
| `@capacitor/haptics` | 8.0.2 | light impact on tower capture, rate-limited to one per 150 ms |
| `@capacitor/app` | 8.1.1 | Android hardware back button: navigate back, exit only from the title screen |
| `@revenuecat/purchases-capacitor` | 13.5.1 | in-app purchases through RevenueCat (StoreKit 2 / Google Play Billing); see §8 |
| `@capacitor-community/admob` | 8.1.0 | interstitial and rewarded ads through Google AdMob + UMP consent; see §8 |

The bridge lives in `src/native/index.ts` (`initNative(hooks)`, `isNative()`, `getPlatform()`, `hapticCapture()`); the purchase and ad providers live in `src/economy/` (§8). Plugins are loaded with dynamic `import()` only inside a native shell, so the web/PWA bundle does not include them. Adding a plugin = `npm install --save-exact @capacitor/<name>@<8.x>` then `npx cap sync`; the sync rewrites `android/capacitor.settings.gradle`, `android/app/capacitor.build.gradle`, `android/app/src/main/assets/capacitor.plugins.json` and `ios/App/CapApp-SPM/Package.swift` — commit those generated files.

**Version numbers** live in `package.json` only and are copied into the native projects by a script:

```bash
# 1. edit package.json: "version": "0.2.0" and "config": { "buildNumber": 2 }
npm run version:sync    # rewrites versionName/versionCode (Android) and MARKETING_VERSION/CURRENT_PROJECT_VERSION (iOS)
npm run version:check   # exits 1 if the native files disagree with package.json (use in CI / before tagging)
```
`version` is the user-visible "0.2.0"; `buildNumber` is the integer both stores require to increase with **every** upload (Google Play `versionCode`, App Store build number). Bump `buildNumber` for every upload even when `version` stays the same. `node scripts/syncVersion.mjs --code 7` overrides the number once without editing package.json.

## 5. What a real store release needs

The game has no accounts and sends no saves anywhere. Since the monetization work (§8) the native apps **do** talk to the network: RevenueCat (purchase receipts), Google AdMob (ads, advertising id) and the stores' billing systems. The privacy policy, the Play "Data safety" form and the App Store "App Privacy" answers must say so (§8.6). The following are mandatory.

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

Suggested privacy policy text (host it as a public page, e.g. GitHub Pages) — **valid only for the web/PWA build**; the store builds need the wording in §8.6:
> Tower Clash (web version) does not collect, store or transmit any personal data. The game has no accounts and no analytics.

Versioning: edit `version` / `config.buildNumber` in `package.json` and run `npm run version:sync` (section 4) for every store upload — never edit the Gradle / Xcode numbers by hand, the script overwrites them.

## 6. CI secrets for signed builds (names only)

None of these exist yet; the current workflows build unsigned. The names below are the **authoritative** ones from `docs/publishing/LAUNCH_CHECKLIST.md` §5 — use them exactly when adding secrets under *Settings → Secrets and variables → Actions*.

**Android (release AAB/APK, Google Play):**

| Secret | What it is | How to create it |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | the upload keystore (`.jks`) as one line of base64 | `keytool -genkeypair -v -keystore release.jks -alias towerclash -keyalg RSA -keysize 2048 -validity 10000` then `base64 -w0 release.jks` (macOS: `base64 -i release.jks`). Keep `release.jks` offline in two places; losing it means the app can never be updated. |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password typed into `keytool` | — |
| `ANDROID_KEY_ALIAS` | the alias given to `keytool` (`towerclash` above) | — |
| `ANDROID_KEY_PASSWORD` | the key password (`keytool` lets it equal the keystore password) | — |

`android/app/build.gradle` already contains the release signing config. It reads **environment variables**, so a CI job only has to do this before `./gradlew bundleRelease`:

```yaml
- name: Decode keystore
  run: echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$RUNNER_TEMP/release.jks"
  env:
    ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
- name: Build signed AAB
  working-directory: tower-clash/android
  run: ./gradlew bundleRelease
  env:
    ANDROID_KEYSTORE_FILE: ${{ runner.temp }}/release.jks
    ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
    ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
    ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
```
When any of the four variables is missing (local builds, forks, pull requests from outside) the release build type silently falls back to the **debug** key, prints `Tower Clash: ANDROID_KEYSTORE_* not set …` in the Gradle log, and still produces an installable but not store-uploadable `app-release.aab` / `app-release.apk`. Output: `android/app/build/outputs/bundle/release/app-release.aab`.

**iOS (device / TestFlight / App Store builds):**

| Secret | What it is | How to create it |
|---|---|---|
| `APPLE_CERTIFICATE_P12_BASE64` | Apple Distribution certificate + private key exported as `.p12`, base64 | Xcode → Settings → Accounts → Manage Certificates → "+" → Apple Distribution; then in Keychain Access right-click the certificate → Export → `.p12` with a password; `base64 -i cert.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | the password chosen while exporting the `.p12` | — |
| `APPLE_PROVISIONING_PROFILE_BASE64` | App Store provisioning profile for `com.pervincinal.towerclash`, base64 | developer.apple.com → Profiles → "+" → App Store → select the bundle id and the certificate → download `.mobileprovision`; `base64 -i profile.mobileprovision` |
| `APP_STORE_CONNECT_API_KEY_ID` | Key ID of an App Store Connect API key (role: App Manager) | App Store Connect → Users and Access → Integrations → App Store Connect API → "+" |
| `APP_STORE_CONNECT_API_ISSUER_ID` | Issuer ID shown on the same page | — |
| `APP_STORE_CONNECT_API_KEY_P8` | contents of the downloaded `AuthKey_<ID>.p8` (can be downloaded only once) | — |

The iOS release job (not written yet) will import the certificate and profile into a temporary keychain, run `xcodebuild archive` + `-exportArchive`, and upload with `xcrun altool` / `notarytool` using the API key. The Xcode project itself needs no changes for that: signing is chosen at archive time with `-allowProvisioningUpdates` or an `ExportOptions.plist`.

## 8. In-app purchases and ads (RevenueCat + AdMob)

### 8.1 What is built

The game never talks to a store SDK directly. Two small interfaces in `tower-clash/src/economy/` hide the platform:

| File | Role |
|---|---|
| `src/economy/store.ts` | `StoreProvider` interface + `getStore()` — RevenueCat inside the native apps, an in-memory fake on the web/PWA and in tests |
| `src/economy/ads.ts` | `AdsProvider` interface + `getAds()` — AdMob inside the native apps, a no-op on the web (`isAvailable() === false`, so the UI hides ad buttons) |
| `src/economy/providers/fakeStore.ts` | fake store: every purchase succeeds after 300 ms; `configureFakeStore({ failNext: 'cancelled' \| 'unavailable' \| 'failed' })` forces the next one to fail (for e2e and manual QA); prices come from `src/economy/catalog.ts` (`priceUsd`) |
| `src/economy/providers/revenueCat.ts` | RevenueCat: offerings/packages → products, purchase, restore, error mapping (user cancel → `cancelled`) |
| `src/economy/providers/noAds.ts` | web no-op |
| `src/economy/providers/admob.ts` | AdMob: initialize → UMP consent form (EEA/UK) → iOS tracking prompt → preload interstitial + rewarded; `showRewarded()` reports `rewarded: true` only on the SDK's reward event |
| `src/economy/providers/config.ts` | where the keys/ids are read from (below) |

The plugin packages are loaded with dynamic `import()` only inside a native shell; the web bundle does not contain them. Product ids are opaque strings defined by `docs/ECONOMY.md` / `src/economy/catalog.ts` (e.g. `crystals_100`, `remove_ads`, `premium_bundle`) and **must be typed identically** in App Store Connect, Google Play Console and RevenueCat.

Without any keys the apps still run: the store reports "unavailable" (buy buttons can be hidden) and AdMob serves **Google's test ads** (never real ads, never revenue). Nothing in this section is a secret in the cryptographic sense — API keys and ad ids are "public" keys that ship inside every app binary — but keep the real ones out of the repository anyway so test builds never show real ads (AdMob bans accounts for that).

### 8.2 Accounts and ids you need (one-time, ~1 hour, all free)

| # | Where | What to create | What you get (paste it in §8.3) |
|---|---|---|---|
| 1 | **App Store Connect** (needs the Apple Developer account, §5) → My Apps → Tower Clash → *In-App Purchases* | one product per catalog row: type **Consumable** for `crystals_*` / `weekend_pack`, **Non-Consumable** for `starter_pack`, `remove_ads`, `premium_bundle`, `premium_upgrade`. Product ID = the catalog id exactly. Fill the price tier, a display name and a review screenshot (any screenshot of the shop) | nothing to paste; the ids must match |
| 2 | **App Store Connect** → Users and Access → Integrations → *In-App Purchase* → "+" | an In-App Purchase key (StoreKit 2 / App Store Server API); also note the **Shared Secret** (My Apps → Tower Clash → App Information → App-Specific Shared Secret) | the `.p8` file, Key ID, Issuer ID, shared secret → uploaded to RevenueCat in step 5, not to us |
| 3 | **Google Play Console** (§5) → Tower Clash → Monetize → *Products → In-app products* | the same products (Play has no consumable/non-consumable flag; RevenueCat consumes `crystals_*` automatically). Requires an app bundle uploaded to at least the *internal testing* track first | ids must match |
| 4 | **Google Cloud Console** (linked from Play Console → Setup → API access) | a service account with *View financial data* + *Manage orders* on the Play Console; download its JSON key | JSON key → RevenueCat step 5 |
| 5 | **RevenueCat** (app.revenuecat.com, free up to USD 2.5k/month revenue) → New project "Tower Clash" | add two apps: *Apple App Store* (bundle id `com.pervincinal.towerclash`, upload the key from step 2) and *Google Play Store* (package name, upload the JSON from step 4). Then **Products**: import the ids. **Entitlements**: create `no_ads` and attach `remove_ads` + `premium_bundle`; create `premium` and attach `premium_bundle` + `premium_upgrade`; create `starter` and attach `starter_pack`. Do **not** attach `crystals_*` to any entitlement (consumables). **Offerings**: one offering `default` with one package per product (package identifier = anything, e.g. the product id) | **Public API keys**: Project → API keys → `appl_…` (iOS) and `goog_…` (Android) |
| 6 | **AdMob** (admob.google.com, needs a Google account with AdSense/payment details) → Apps → Add app | two apps: *Android* and *iOS* (link them to the store listings when those exist). In each app → *Ad units* create **Interstitial** and **Rewarded** | per platform: **App ID** `ca-app-pub-…~…` and two **Ad unit IDs** `ca-app-pub-…/…` |
| 7 | **AdMob** → Privacy & messaging → *European regulations* (and *US state regulations*) | create and publish a consent message for both apps; this is what the in-game consent form shows in the EEA/UK (Google UMP). Without a published message the form is skipped and the SDK serves non-personalized ads | nothing to paste |

Do **not** attach `remove_ads` to a package that also grants crystals in RevenueCat — the crystal grant is done by the game on `purchase()` success, RevenueCat only tracks ownership.

### 8.3 Where to paste the ids

Placeholders in the repository (safe to commit; all empty/test by default):

| Value | File | Field | Default when empty |
|---|---|---|---|
| RevenueCat iOS key `appl_…` | `tower-clash/capacitor.config.ts` | `towerClashPluginConfig.revenueCat.ios` | store unavailable |
| RevenueCat Android key `goog_…` | same | `towerClashPluginConfig.revenueCat.android` | store unavailable |
| AdMob iOS **ad units** | same | `towerClashPluginConfig.adMob.ios.interstitial` / `.rewarded` | Google test units |
| AdMob Android **ad units** | same | `towerClashPluginConfig.adMob.android.interstitial` / `.rewarded` | Google test units |
| AdMob Android **App ID** | `tower-clash/android/app/src/main/res/values/strings.xml` | `<string name="admob_app_id">` | Google test app id `ca-app-pub-3940256099942544~3347511713` |
| AdMob iOS **App ID** | `tower-clash/ios/App/App/Info.plist` | `GADApplicationIdentifier` | Google test app id `ca-app-pub-3940256099942544~1458002511` |

The App ID must never be an ad unit id (`~` vs `/`): a wrong app id crashes the app at startup on both platforms.

For CI and local release builds, **environment variables override the config file** at `npm run build` time (Vite bakes them in), so the real values never need to be committed:

| GitHub secret / env var | Overrides |
|---|---|
| `RC_IOS_KEY` → export as `VITE_RC_IOS_KEY` | `revenueCat.ios` |
| `RC_ANDROID_KEY` → export as `VITE_RC_ANDROID_KEY` | `revenueCat.android` |
| `ADMOB_IOS_INTERSTITIAL`, `ADMOB_IOS_REWARDED` → `VITE_ADMOB_IOS_INTERSTITIAL`, `VITE_ADMOB_IOS_REWARDED` | iOS ad units |
| `ADMOB_ANDROID_INTERSTITIAL`, `ADMOB_ANDROID_REWARDED` → `VITE_ADMOB_ANDROID_INTERSTITIAL`, `VITE_ADMOB_ANDROID_REWARDED` | Android ad units |
| `ADMOB_ANDROID_APP_ID` | `strings.xml` (`sed` step below) |
| `ADMOB_IOS_APP_ID` | `Info.plist` (`plutil` step below) |

Snippet for the (future) release jobs — add before "Build web app":

```yaml
- name: Build web app with store keys
  run: npm run build
  env:
    VITE_RC_IOS_KEY: ${{ secrets.RC_IOS_KEY }}
    VITE_RC_ANDROID_KEY: ${{ secrets.RC_ANDROID_KEY }}
    VITE_ADMOB_ANDROID_INTERSTITIAL: ${{ secrets.ADMOB_ANDROID_INTERSTITIAL }}
    VITE_ADMOB_ANDROID_REWARDED: ${{ secrets.ADMOB_ANDROID_REWARDED }}
    VITE_ADMOB_IOS_INTERSTITIAL: ${{ secrets.ADMOB_IOS_INTERSTITIAL }}
    VITE_ADMOB_IOS_REWARDED: ${{ secrets.ADMOB_IOS_REWARDED }}
- name: Set AdMob app id (Android)
  if: ${{ secrets.ADMOB_ANDROID_APP_ID != '' }}
  run: sed -i "s#ca-app-pub-3940256099942544~3347511713#${{ secrets.ADMOB_ANDROID_APP_ID }}#" android/app/src/main/res/values/strings.xml
# iOS (macOS runner):
# plutil -replace GADApplicationIdentifier -string "$ADMOB_IOS_APP_ID" ios/App/App/Info.plist
```

Locally: create `tower-clash/.env.local` with the same `VITE_*` lines (`VITE_RC_ANDROID_KEY=goog_…`, one per line), then `npm run cap:sync`. **`.env.local` is not git-ignored in this repository yet** — never `git add` it (or add a `.env*.local` line to `tower-clash/.gitignore` first).

### 8.4 Native project changes already in place

- **Android** `AndroidManifest.xml`: `com.google.android.gms.ads.APPLICATION_ID` meta-data → `@string/admob_app_id`. The `com.android.vending.BILLING` (Play Billing) and `com.google.android.gms.permission.AD_ID` (Android 13+) permissions are merged in automatically from the RevenueCat / AdMob libraries. The AdMob plugin is Kotlin and targets Java 21, so builds need **JDK 21** (the workflow already uses it).
- **iOS** `Info.plist`: `GADApplicationIdentifier`, `NSUserTrackingUsageDescription` (the text of the iOS "Allow tracking?" prompt), and `SKAdNetworkItems` with Google's published list (100 entries, `cstr6suwn9.skadnetwork` first). Refresh the list from <https://developers.google.com/admob/ios/ios14> when the AdMob SDK is bumped.
- **iOS capability (manual, in Xcode):** open `ios/App/App.xcodeproj` → target *App* → *Signing & Capabilities* → "+ Capability" → **In-App Purchase**. This only needs to be done once and requires the Apple Developer account; without it StoreKit returns no products.
- **Xcode SPM**: `npx cap sync` added `CapacitorCommunityAdmob` (pulls Google Mobile Ads 13.6.0 + UMP) and `RevenuecatPurchasesCapacitor` (purchases-hybrid-common 18.36.1) to `ios/App/CapApp-SPM/Package.swift`; the first macOS build resolves them from GitHub.

### 8.5 How test purchases and test ads work

**Purchases (nothing is charged):**
- *iOS — sandbox:* in App Store Connect → Users and Access → *Sandbox Testers* create a tester Apple ID. On the iPhone: Settings → App Store → Sandbox Account → sign in with it. Install the app from Xcode or TestFlight; purchases show "[Environment: Sandbox]" in the sheet and cost nothing. Consumables can be bought repeatedly; to re-test a non-consumable, use Settings → App Store → Sandbox Account → *Manage* → clear purchase history. Xcode's *StoreKit Configuration* file is not used (RevenueCat needs the real sandbox to validate receipts).
- *Android — license testers:* Play Console → Setup → *License testing* → add the Gmail addresses of testers; install a build from the **internal testing** track (or the same signed APK) and purchases go through with "Test card, always approves". Debug-signed APKs cannot make purchases — the package must be signed with the upload key registered in Play. To re-test non-consumables, refund/cancel the order in Play Console → Order management.
- RevenueCat shows every sandbox transaction under *Customers* with a "Sandbox" badge; the app's `restore()` returns the product ids of active entitlements, which is how "remove ads" survives a reinstall.
- *Web / PWA / e2e:* the fake store; `configureFakeStore({ failNext: 'cancelled' })` (exposed by the frontend on its debug hook) simulates a cancelled purchase.

**Ads:**
- With empty ad-unit placeholders the app uses Google's official **test ad units** (`ca-app-pub-3940256099942544/…`), which always fill with "Test Ad" creatives and are safe to click. The app also passes `initializeForTesting: true` in that case.
- With real ad units, register the phone as a *test device* (AdMob → Settings → Test devices, or copy the device id printed in logcat/Xcode console at first ad request) **before** testing, otherwise your clicks count as invalid traffic and the AdMob account can be suspended.
- Consent: the UMP form appears only in the EEA/UK (or when a debug geography is forced). Ads are shown only when `canRequestAds` is true after the consent step.
- On iOS 14+ the tracking prompt (`NSUserTrackingUsageDescription`) appears once after the consent form; declining still allows non-personalized ads.

### 8.6 Store paperwork changes caused by monetization

- **Privacy policy** must now mention: in-app purchases processed by Apple/Google, RevenueCat receiving purchase receipts and an anonymous app user id, Google AdMob showing ads and using the advertising identifier (IDFA/AAID) with consent, and no other personal data.
- **Google Play Data safety:** declare "Device or other IDs" (advertising id) and "Purchase history" as collected/shared with third parties (Google AdMob, RevenueCat). **Ads declaration:** "Contains ads" = yes.
- **App Store App Privacy:** "Purchases" (linked to identity: no), "Identifiers → Device ID" (used for third-party advertising), "Usage data → Advertising data". Answer "Yes" to *Does this app use the Advertising Identifier (IDFA)?* when submitting.
- **Age rating:** the consent flow and AdMob's `tagForUnderAgeOfConsent` are not enabled; if the store listing targets children (Play "Families"), that changes — ask before enabling.

## 7. Open items

- Keep `public/icons/*` (PWA) and `resources/icon.svg` (native) visually in sync when the mark changes; `npm run icons:generate` only regenerates the native assets.
- The iOS workflow has not yet run on a macOS runner (no Xcode in the development sandbox); the first `workflow_dispatch` run validates the SPM project build.
- Signed builds: create the accounts and secrets above, then add the `bundleRelease` job (snippet in section 6) and the iOS archive job to the workflows. The Gradle side is already in place.
- `npm run version:check` should run in the CI workflow so a forgotten `version:sync` fails the build.
- Monetization (§8): create the RevenueCat / AdMob accounts and the products; add the In-App Purchase capability in Xcode; rewrite the privacy policy; the Android workflow has not yet been run with the AdMob (Kotlin) and RevenueCat modules — the next push validates the Gradle build on CI (no Android SDK in the development sandbox).
