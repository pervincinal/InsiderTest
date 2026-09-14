# Tower Clash — launch checklist

Status legend: **done** — exists in the repo today · **needs stakeholder** — requires a human account, payment, identity check or a secret only a human can create · **todo** — the team can do it without the stakeholder (owner in brackets).

Nothing in this list is a request; it is the full inventory of what stands between the current build and public availability on three channels. The stakeholder can pick up the "needs stakeholder" rows whenever they wish; everything else is already in the backlog.

Shared facts: app id / bundle id / package name **`com.pervincinal.towerclash`**, display name **Tower Clash**, version **0.2.0** (build number 2) in the tree; the next store build is **v1.0 native** with in-app purchases (RevenueCat) and ads (AdMob) per `docs/ECONOMY.md` §8, preceded by **v0.3.0** (economy + shop, web-safe). The web/PWA build has no ads, no purchases and no network calls; the store builds talk to Google AdMob, RevenueCat and the store billing systems (privacy policy v2.1 Part B; no tracking on iOS). Secret names below are the exact names the CI workflows should read from *Settings → Secrets and variables → Actions*.

---

## 1. Public web (PWA on GitHub Pages)

| # | Step | Status | Notes |
|---|---|---|---|
| W1 | Production web build (`npm run build` → `dist/`, relative base path) | done | `vite.config.ts` uses `base: './'`, so the site works under `/InsiderTest/` |
| W2 | PWA manifest, icons, service worker, offline | done | `public/manifest.webmanifest`, `public/icons/*`, `public/sw.js` |
| W3 | Enable GitHub Pages on the repository (Settings → Pages → Source: GitHub Actions) | needs stakeholder | One click by a repository admin; the site then appears at `https://pervincinal.github.io/InsiderTest/` (see `docs/DEPLOY.md`) |
| W4 | Pages deploy workflow (`.github/workflows/tower-clash-pages.yml`: build `tower-clash/`, upload `dist/`, deploy) | done (QA Engineer) | Runs on every push touching `tower-clash/**`; the deploy job is non-fatal until W3 is done |
| W5 | Host `docs/publishing/PRIVACY_POLICY.md` (**v2.1**, with Part B, no-ATT wording of 2026-09-14) as a public page | done (Publisher) — live once W3 is done | `tower-clash/public/privacy.html` (self-contained HTML, EN + AZ, same text as the policy v2.1) is copied by Vite into `dist/privacy.html`, so the existing Pages job (W4) publishes it at `https://pervincinal.github.io/InsiderTest/privacy.html` with no workflow change; `public/support.html` (contact, restore purchases, delete data) goes to `…/support.html` the same way. Both pages must be reachable *before* the Data safety / App Privacy forms are submitted; the `[developer e-mail]` / `[developer name / address]` placeholders in both pages need the stakeholder's values (G18) |
| W6 | Pages URL in `tower-clash/README.md` and the store listing | done (Publisher) | `https://pervincinal.github.io/InsiderTest/`, marked "active once GitHub Pages is enabled"; drop the note after W3 |
| W7 | Custom domain, or a root user site `pervincinal.github.io` | needs stakeholder (decision) | Was optional; now the cheapest way to satisfy `app-ads.txt` (MZ12), which must sit at the **root** of the developer website — a `/InsiderTest/` sub-path is not crawled |
| W8 | Web build stays ad-free and purchase-free; the fake store must not be reachable by the public web build (or must be clearly a demo that grants nothing paid) | todo (Frontend Engineer, decision by Producer) | Privacy policy Part A promises "nothing in the web version asks for payment"; `docs/MOBILE.md` §8.1 says the fake store is used on web/PWA — confirm whether the public site shows a shop at all |

## 2. Google Play

| # | Step | Status | Notes |
|---|---|---|---|
| G1 | Google Play Console developer account (USD 25 one-time, identity verification, D-U-N-S only for organisations) | needs stakeholder | Personal accounts created after Nov 2023 must run a closed test with 12+ testers for 14 days before production access |
| G2 | Create the app record; package name `com.pervincinal.towerclash` becomes permanent on first upload | needs stakeholder | — |
| G3 | Upload keystore (`keytool -genkeypair … -validity 10000`), stored safely offline; enrol in Play App Signing | needs stakeholder | Losing it means never updating the app |
| G4 | CI secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | needs stakeholder | `base64 -w0 release.jks` for the first one |
| G5 | Release signing config in `android/app/build.gradle` reading those secrets; `bundleRelease` job producing `app-release.aab` in `tower-clash-android` | signing config done / job todo (Mobile Engineer) | Currently only `assembleDebug` runs in CI |
| G6 | Align native version with `package.json` (`versionName` / `versionCode`, bump on every upload) | done (Mobile Engineer) | `npm run version:sync`; bump to 1.0.0 / build 3+ for the store build |
| G7 | Store listing texts EN + AZ (title, short, full description) — monetization wording | done (text, `STORE_LISTING.md` §1) / re-verify **[v0.3+]** lines before pasting | §1.4 holds the ad-free wording if the economy is cut |
| G8 | App icon 512×512 | done | `tower-clash/public/icons/icon-512.png` |
| G9 | Feature graphic 1024×500 | done | `tower-clash/store/feature-graphic.png` |
| G10 | Phone screenshots (≥ 2, 9:16) EN and AZ | done | `tower-clash/store/screenshots/{en,az}/01..07.png`, 1080×1920 (07 = shop, Commander upgrades tab, ECON-7) |
| G11 | Tablet screenshots (7" and 10") | todo (Publisher) | Only if the listing declares tablet support; can be skipped by marking phone-only |
| G12 | Category Games › Strategy, tags | done (text) / needs stakeholder (entry) | `STORE_LISTING.md` §1 |
| G13 | Content rating questionnaire (IARC): purchases of digital goods **Yes**, random items **No**, ads **Yes** | needs stakeholder (submission) | Answers in `STORE_LISTING.md` §4 and §6.5; expected Everyone / PEGI 3 + "In-Game Purchases" element |
| G14 | Data safety form: Device or other IDs, Purchase history, approximate location (IP), diagnostics, ad interactions — collected and shared with Google AdMob / RevenueCat; not linked to identity; encrypted in transit | needs stakeholder (submission) | Answers in `STORE_LISTING.md` §6.3; re-check Google's and RevenueCat's SDK disclosure pages on submission day (the sandbox could not fetch them) |
| G15 | Ads declaration: **contains ads — Yes** (interstitial, rewarded); Advertising ID declaration **Yes** | needs stakeholder (submission) | `STORE_LISTING.md` §6.2 |
| G16 | Target audience & content: **13+**, not "designed for children" (no Families programme) | needs stakeholder (decision + entry) | AdMob app set to *not child-directed*, max ad content rating **G** (MZ7); Families would require a different ad SDK setup |
| G17 | Privacy policy URL (policy v2.1) | done (page, W5) / needs stakeholder (entry, after W3) | `https://pervincinal.github.io/InsiderTest/privacy.html` — resolves once GitHub Pages is enabled (W3) |
| G18 | Contact e-mail on the listing | needs stakeholder | `[developer e-mail]` — also the address in the privacy policy "Contact" line |
| G19 | Closed testing track: upload AAB, invite 12+ testers, wait 14 days (new personal accounts only) | needs stakeholder | Testers can be the stakeholder's friends; the APK links in `docs/MOBILE.md` help recruit them. Also add the testers under *Setup → License testing* so their purchases are free (MZ5) |
| G20 | Production release, rollout 100 % | needs stakeholder | After G19 and review |

## 3. Apple App Store

| # | Step | Status | Notes |
|---|---|---|---|
| A1 | Apple Developer Program membership (USD 99 / year, Apple ID with 2FA) | needs stakeholder | Organisation accounts need a D-U-N-S number |
| A2 | Register bundle id `com.pervincinal.towerclash` in Certificates, Identifiers & Profiles, with the **In-App Purchase** capability | needs stakeholder | Matches `capacitor.config.ts` and the Xcode project; the capability must also be added in Xcode → Signing & Capabilities once (`docs/MOBILE.md` §8.4) |
| A3 | Apple Distribution certificate (`.p12`) and App Store provisioning profile | needs stakeholder | Created in Xcode → Settings → Accounts or at developer.apple.com |
| A4 | CI secrets: `APPLE_CERTIFICATE_P12_BASE64`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_PROVISIONING_PROFILE_BASE64` | needs stakeholder | Base64 of the `.p12` and `.mobileprovision` |
| A5 | App Store Connect API key with App Manager role; CI secrets `APP_STORE_CONNECT_API_KEY_ID`, `APP_STORE_CONNECT_API_ISSUER_ID`, `APP_STORE_CONNECT_API_KEY_P8` | needs stakeholder | The `.p8` contents (or base64 of it) go in `…_KEY_P8` |
| A6 | Signed archive + TestFlight upload job in `tower-clash-ios` | todo (Mobile Engineer) | Today the workflow builds unsigned for the simulator |
| A7 | Align `MARKETING_VERSION`, `CURRENT_PROJECT_VERSION` in `ios/App/App.xcodeproj` | done (Mobile Engineer) | Written by `npm run version:sync` |
| A8 | Verify the iOS workflow actually builds on a macOS runner (never run yet; now also resolves the AdMob + RevenueCat Swift packages) | todo (Mobile Engineer) | `docs/MOBILE.md` §7 |
| A9 | App record in App Store Connect (name, primary language English, bundle id, SKU `towerclash`) | needs stakeholder | — |
| A10 | Name, subtitle, promotional text, description, keywords — monetization wording | done | `STORE_LISTING.md` §2 |
| A11 | Screenshots 6.7" 1290×2796 and 6.5" 1284×2778 | done | `tower-clash/store/screenshots/apple-6.7/en/01..07.png` and `apple-6.5/en/01..07.png` (07 = shop, Commander upgrades tab) |
| A12 | App icon 1024×1024 (no alpha) | done | `tower-clash/resources/icon.png`, in the Xcode asset catalog via `npm run icons:generate` |
| A13 | Age rating questionnaire: 9+, Unrestricted Web Access **No**, Gambling & Contests **No**, Loot boxes **No** | needs stakeholder (submission) | Answers in `STORE_LISTING.md` §4 / §6.5 |
| A14 | App Privacy labels: Identifiers (Device ID), Purchases, Usage Data (advertising data), Diagnostics, Coarse Location — *not linked*; **Tracking: No** (MZ9 option A is implemented; the app never shows the ATT prompt and requests non-personalised ads on iOS) | needs stakeholder (submission) | Answers: `STORE_LISTING.md` §6.4 option A table; App Privacy → *Tracking* → "No, we do not use data for tracking purposes"; "Does this app use the IDFA?" → Yes → "Serve advertisements within the app" only; "respects Limit Ad Tracking" → Yes |
| A15 | Export compliance: only standard HTTPS/TLS from the OS → exempt | done (`ITSAppUsesNonExemptEncryption = false` in `ios/App/App/Info.plist`) / needs stakeholder (answer in App Store Connect) | Unchanged by the network calls to AdMob / RevenueCat (standard TLS is exempt) |
| A16 | Support URL, marketing URL, privacy policy URL (policy v2.1), copyright line | marketing, support and privacy URLs done (Pages, pending W3) / needs stakeholder (contact e-mail in the support page, copyright name) | Support `https://pervincinal.github.io/InsiderTest/support.html`, privacy `…/privacy.html`, marketing `…/` |
| A17 | Review notes (offline single-player, IAP via StoreKit/RevenueCat, Restore Purchases location, no ATT prompt / non-personalised ads on iOS) | done (text in `STORE_LISTING.md` §2, updated 2026-09-14 for no-ATT) | — |
| A18 | Submit for review, release manually or automatically; first IAP products are submitted **with** the version | needs stakeholder | Typically 1–3 days; Apple reviews the non-consumables against 3.1.1 / 3.1.2 (restore button) |

## 4. Version and tag

| # | Step | Status | Notes |
|---|---|---|---|
| V1 | `tower-clash/package.json` version `0.2.0`, `config.buildNumber` 2 | done | Next: `0.3.0` / 3 when the economy ships on web; `1.0.0` / 4+ for the first store upload with IAP + ads |
| V2 | Release notes v0.2.0 EN + AZ; v0.3.0 section "(in progress)" | done / in progress | `RELEASE_NOTES.md`; v0.3.0 lines are marked planned until the Producer confirms |
| V3 | Git tag `tower-clash-v0.2.0` | todo (Producer) | Proposed in `RELEASE_NOTES.md`; `tower-clash-v0.1.0` was never created and can be skipped |
| V4 | Native versions aligned (see G6, A7) | done | `npm run version:check` can guard CI |

## 5. Secrets summary (names only, none exist yet)

| Secret | Used by | Provided by |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | Android release signing | stakeholder |
| `ANDROID_KEYSTORE_PASSWORD` | Android release signing | stakeholder |
| `ANDROID_KEY_ALIAS` | Android release signing | stakeholder |
| `ANDROID_KEY_PASSWORD` | Android release signing | stakeholder |
| `APPLE_CERTIFICATE_P12_BASE64` | iOS code signing | stakeholder |
| `APPLE_CERTIFICATE_PASSWORD` | iOS code signing | stakeholder |
| `APPLE_PROVISIONING_PROFILE_BASE64` | iOS code signing | stakeholder |
| `APP_STORE_CONNECT_API_KEY_ID` | TestFlight / App Store upload | stakeholder |
| `APP_STORE_CONNECT_API_ISSUER_ID` | TestFlight / App Store upload | stakeholder |
| `APP_STORE_CONNECT_API_KEY_P8` | TestFlight / App Store upload | stakeholder |
| `RC_IOS_KEY` (`appl_…`) | RevenueCat public key, baked into the iOS build as `VITE_RC_IOS_KEY` | stakeholder (RevenueCat → Project → API keys) |
| `RC_ANDROID_KEY` (`goog_…`) | RevenueCat public key, `VITE_RC_ANDROID_KEY` | stakeholder |
| `ADMOB_ANDROID_APP_ID` (`ca-app-pub-…~…`) | `strings.xml` `admob_app_id` (sed step in the release job) | stakeholder (AdMob → Apps) |
| `ADMOB_IOS_APP_ID` (`ca-app-pub-…~…`) | `Info.plist` `GADApplicationIdentifier` (plutil step) | stakeholder |
| `ADMOB_ANDROID_INTERSTITIAL`, `ADMOB_ANDROID_REWARDED` (`ca-app-pub-…/…`) | Android ad units, `VITE_ADMOB_ANDROID_*` | stakeholder (AdMob → Apps → Ad units) |
| `ADMOB_IOS_INTERSTITIAL`, `ADMOB_IOS_REWARDED` | iOS ad units, `VITE_ADMOB_IOS_*` | stakeholder |

The RevenueCat and AdMob values are *public* identifiers that ship inside the binary (`docs/MOBILE.md` §8.1); they are kept as secrets only so that test builds never serve real ads or real products. Without them the apps still run: store "unavailable", Google test ads. `docs/MOBILE.md` §6 and §8.3 use the same names.

## 6. Monetization (RevenueCat + AdMob) — new for v1.0 native

Steps in the order they can actually be done (RevenueCat needs the store products, the store products need the app records, AdMob ad units need nothing). Console click-paths are in `docs/MOBILE.md` §8.2; the money-side setup in `ACCOUNTS.md` §5 (AZ).

| # | Step | Status | Notes |
|---|---|---|---|
| MZ1 | **Google Play payments profile / merchant account** (Play Console → Setup → Payments profile: legal name, address, bank account, tax info) | needs stakeholder | Mandatory before any in-app product can be *activated*, even though the app is free. **Verify that the stakeholder's country is in Google's "supported locations for merchant registration" list before relying on Play IAP** (not verifiable from the sandbox) |
| MZ2 | **Apple "Paid Applications" agreement** (App Store Connect → Business / Agreements, Tax, and Banking): accept the agreement, add banking details, fill the tax forms (W-8BEN for a non-US individual; W-8BEN-E for a non-US company) | needs stakeholder | Required to *sell* IAP in a free app; products stay "Missing Metadata / cannot be submitted" until the agreement is Active. Apple pays by bank transfer in the account holder's country; **verify Apple supports payouts to the stakeholder's bank country** |
| MZ3 | **App Store Connect in-app purchases** created with the exact ids from `STORE_LISTING.md` §6.1: 5 Consumables (`crystals_100/550/1200/2600/7000`), 4 Non-Consumables (`starter_pack`, `remove_ads`, `premium_bundle`, `premium_upgrade`); `weekend_pack` **not yet** (Phase C) | needs stakeholder (after A9 + MZ2) | Display names / descriptions ≤ 30 / ≤ 45 verified in §6.1; price tiers 1 / 5 / 10 / 20 / 50 / 3 / 4 / 10 / 5 |
| MZ4 | **IAP review screenshot** (≥ 640×920, shows the shop with the product) uploaded per product in App Store Connect | done (Publisher, ECON-7) / needs stakeholder (upload) | `tower-clash/store/iap-review/shop-crystals.png` (1290×2796, shop Crystals tab with the five crystal packs and the Restore Purchases button), rendered by `store/tools/renderStoreShots.mjs`; one frame reused for all nine products is accepted. It is a web-build frame, so it carries the fallback USD prices and the "Test store" line — re-render from a native build with RevenueCat keys before upload if the reviewer should see store-localised prices (Apple only requires the product to be visible in-app). The public store screenshot 07 is the Upgrades tab instead (no fixed-currency prices) |
| MZ5 | **Google Play in-app products** with the same ids, same USD prices (no subscriptions — none exist) | needs stakeholder (after G2 + a first AAB on a testing track + MZ1) | Play has no consumable flag; RevenueCat consumes the crystal packs. Add tester Gmail addresses under *License testing* |
| MZ6 | **Google Cloud service account** with *View financial data* + *Manage orders* on the Play Console, JSON key uploaded to RevenueCat | needs stakeholder | Play Console → Setup → API access |
| MZ7 | **AdMob account** (Google account with AdSense payment details, address verification by postcard PIN once revenue reaches the threshold), two apps (Android, iOS, linked to the store listings when they exist), **Interstitial + Rewarded ad units per platform**; app settings: *not child-directed*, **max ad content rating G** | needs stakeholder | Yields `ADMOB_*` secrets (§5). AdMob may hold the account in "getting ready" review until the store listings are live |
| MZ8 | **AdMob Privacy & messaging**: publish a GDPR (EEA/UK/Swiss) message and a US-state message for both apps | needs stakeholder | Without a published message the UMP form is skipped and only non-personalised ads are served (the code tolerates this) |
| MZ9 | **Decision: App Tracking Transparency on iOS → option A (no tracking).** `requestTrackingAuthorization()` removed from `src/economy/providers/admob.ts`, `npa: 1` on every iOS ad request, no `NSUserTrackingUsageDescription` in `Info.plist`, unit test guards it (`tests/economy/ads.test.ts` "no tracking") | done (option A — Producer default, Mobile Engineer 2026-09-14; `docs/MOBILE.md` §8.7) | A14 → Tracking: No; privacy policy v2.1 and `STORE_LISTING.md` §6.4 / App Review note aligned (DOC-1, 2026-09-14). Reverting to option B is a package deal — see §6.4 |
| MZ10 | **Privacy-options entry point in Settings** (`AdMob.showPrivacyOptionsForm()` when UMP reports it is required) and a **Support ID** (RevenueCat app user id) in Settings → About, as promised in privacy policy B.2 / B.7 | done (Frontend + Mobile Engineer, 2026-09-14): Settings shows "Privacy options" only when the ads provider reports it is required, and About shows the Support ID with copy-to-clipboard; real values need a native build with keys (ECON-1) | Google requires an in-app way to re-open the consent form for EEA users who consented; the Support ID makes deletion requests possible |
| MZ11 | **Restore Purchases** button in the shop; store-localised price strings; Starter Pack "×2" badge computed from `crystals_100` | todo (Frontend Engineer) | Apple 3.1.1 / 3.1.2, EU consumer law (`docs/ECONOMY.md` §7) |
| MZ12 | **`app-ads.txt`** at the root of the developer website with the AdMob publisher id | needs stakeholder (publisher id + W7 root site) / done (template `docs/publishing/app-ads.txt.example`) | Copy the template to the web root as `app-ads.txt`; the `public/` folder belongs to the Frontend Engineer and the `/InsiderTest/` sub-path would not be crawled anyway |
| MZ13 | **RevenueCat project** (free tier; 1 % of revenue above USD 2.5k/month): two apps (App Store + Play), In-App Purchase key + shared secret from App Store Connect, Play service-account JSON, products imported, entitlements `no_ads` / `premium` / `starter`, offering `default` with one package per product | needs stakeholder | Yields `RC_IOS_KEY`, `RC_ANDROID_KEY` (§5); click-path in `docs/MOBILE.md` §8.2 rows 5 |
| MZ14 | **Sandbox testing**: Apple sandbox tester Apple ID, Play license testers; one purchase + one restore + one refund of each non-consumable verified on real devices; test ads shown (Google test units) and real units verified only on registered test devices | needs stakeholder (accounts + phones) / todo (QA Engineer, script) | `docs/MOBILE.md` §8.5 |
| MZ15 | Release job injects the RevenueCat / AdMob values (`VITE_*` env, `sed` for `strings.xml`, `plutil` for `Info.plist`) | todo (Mobile Engineer) | Snippet in `docs/MOBILE.md` §8.3 |
| MZ16 | Play *Data safety* (G14), *Ads declaration* (G15), Apple *App Privacy* (A14) re-answered for the monetization build; privacy policy v2.1 live (W5) | needs stakeholder (submission) | Texts ready in `STORE_LISTING.md` §6 |
| MZ17 | Subscriptions | not applicable | None planned in v1 (`docs/ECONOMY.md` §1.4); no Play "Subscriptions" or Apple "Auto-Renewable" products |

Nothing in §6 can be started by the team without the store accounts (G1, A1); MZ10–MZ11 and MZ15 are code tasks already in the economy handoff.
