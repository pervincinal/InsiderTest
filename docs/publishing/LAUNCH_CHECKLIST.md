# Tower Clash — launch checklist

Status legend: **done** — exists in the repo today · **needs stakeholder** — requires a human account, payment, identity check or a secret only a human can create · **todo** — the team can do it without the stakeholder (owner in brackets).

Nothing in this list is a request; it is the full inventory of what stands between v0.1.0 and public availability on three channels. The stakeholder can pick up the "needs stakeholder" rows whenever they wish; everything else is already in the backlog.

Shared facts: app id / bundle id / package name **`com.pervincinal.towerclash`**, display name **Tower Clash**, version **0.1.0**, no ads, no purchases, no data collected, no network calls. Secret names below are the exact names the CI workflows should read from *Settings → Secrets and variables → Actions*.

---

## 1. Public web (PWA on GitHub Pages)

| # | Step | Status | Notes |
|---|---|---|---|
| W1 | Production web build (`npm run build` → `dist/`, relative base path) | done | `vite.config.ts` uses `base: './'`, so the site works under `/InsiderTest/` |
| W2 | PWA manifest, icons, service worker, offline | done | `public/manifest.webmanifest`, `public/icons/*`, `public/sw.js` |
| W3 | Enable GitHub Pages on the repository (Settings → Pages → Source: GitHub Actions) | needs stakeholder | One click by a repository admin |
| W4 | Pages deploy workflow (`.github/workflows/tower-clash-pages.yml`: build `tower-clash/`, upload `dist/`, deploy) | todo (Mobile/Dev-ops Engineer) | Publisher does not edit `.github/` |
| W5 | Host `docs/publishing/PRIVACY_POLICY.md` as a public page (copy into `dist/privacy.html` in the Pages job) | todo (same workflow) | The URL is required by both stores |
| W6 | Replace `[web link — GitHub Pages pending]` in `tower-clash/README.md` and the store listing with the real URL | todo (Publisher) | After W3–W4 |
| W7 | Custom domain (optional) | needs stakeholder | Not required for launch |

## 2. Google Play

| # | Step | Status | Notes |
|---|---|---|---|
| G1 | Google Play Console developer account (USD 25 one-time, identity verification, D-U-N-S only for organisations) | needs stakeholder | Personal accounts created after Nov 2023 must run a closed test with 12+ testers for 14 days before production access |
| G2 | Create the app record; package name `com.pervincinal.towerclash` becomes permanent on first upload | needs stakeholder | — |
| G3 | Upload keystore (`keytool -genkeypair … -validity 10000`), stored safely offline; enrol in Play App Signing | needs stakeholder | Losing it means never updating the app |
| G4 | CI secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | needs stakeholder | `base64 -w0 release.jks` for the first one |
| G5 | Release signing config in `android/app/build.gradle` reading those secrets; `bundleRelease` job producing `app-release.aab` in `tower-clash-android` | todo (Mobile Engineer) | Currently only `assembleDebug` |
| G6 | Align native version with `package.json`: `versionName "0.1.0"`, `versionCode 1` (bump `versionCode` on every upload) | todo (Mobile Engineer) | Today `versionName "1.0"` |
| G7 | Store listing texts EN + AZ (title, short, full description) | done | `STORE_LISTING.md` §1 |
| G8 | App icon 512×512 | done | `tower-clash/public/icons/icon-512.png` |
| G9 | Feature graphic 1024×500 | done | `tower-clash/store/feature-graphic.png` |
| G10 | Phone screenshots (≥ 2, 9:16) EN and AZ | done | `tower-clash/store/screenshots/{en,az}/01..06.png`, 1080×1920 |
| G11 | Tablet screenshots (7" and 10") | todo (Publisher) | Only if the listing declares tablet support; can be skipped by marking phone-only |
| G12 | Category Games › Strategy, tags | done (text) / needs stakeholder (entry) | `STORE_LISTING.md` §1 |
| G13 | Content rating questionnaire (IARC) | needs stakeholder (submission) | Answers prepared in `STORE_LISTING.md` §4; expected Everyone / PEGI 3 |
| G14 | Data safety form: no data collected, no data shared, no encryption needed | needs stakeholder (submission) | Answers in `PRIVACY_POLICY.md` |
| G15 | Ads declaration: contains no ads | needs stakeholder (submission) | — |
| G16 | Target audience & content: all ages; not "designed for children" unless the stakeholder wants the Families programme (extra policy) | needs stakeholder (decision) | Recommendation: general audience, not Families |
| G17 | Privacy policy URL | todo (W5) | — |
| G18 | Contact e-mail on the listing | needs stakeholder | `[developer e-mail]` |
| G19 | Closed testing track: upload AAB, invite 12+ testers, wait 14 days (new personal accounts only) | needs stakeholder | Testers can be the stakeholder's friends; the APK links in `docs/MOBILE.md` help recruit them |
| G20 | Production release, rollout 100 % | needs stakeholder | After G19 and review |

## 3. Apple App Store

| # | Step | Status | Notes |
|---|---|---|---|
| A1 | Apple Developer Program membership (USD 99 / year, Apple ID with 2FA) | needs stakeholder | Organisation accounts need a D-U-N-S number |
| A2 | Register bundle id `com.pervincinal.towerclash` in Certificates, Identifiers & Profiles | needs stakeholder | Matches `capacitor.config.ts` and the Xcode project |
| A3 | Apple Distribution certificate (`.p12`) and App Store provisioning profile | needs stakeholder | Created in Xcode → Settings → Accounts or at developer.apple.com |
| A4 | CI secrets: `APPLE_CERTIFICATE_P12_BASE64`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_PROVISIONING_PROFILE_BASE64` | needs stakeholder | Base64 of the `.p12` and `.mobileprovision` |
| A5 | App Store Connect API key with App Manager role; CI secrets `APP_STORE_CONNECT_API_KEY_ID`, `APP_STORE_CONNECT_API_ISSUER_ID`, `APP_STORE_CONNECT_API_KEY_P8` | needs stakeholder | The `.p8` contents (or base64 of it) go in `…_KEY_P8` |
| A6 | Signed archive + TestFlight upload job in `tower-clash-ios` (import cert into a temporary keychain, `xcodebuild archive` + `-exportArchive`, upload with `xcrun altool`/`notarytool` or fastlane) | todo (Mobile Engineer) | Today the workflow builds unsigned for the simulator |
| A7 | Align `MARKETING_VERSION 0.1.0`, `CURRENT_PROJECT_VERSION 1` in `ios/App/App.xcodeproj` | todo (Mobile Engineer) | Today `1.0` / `1` |
| A8 | Verify the iOS workflow actually builds on a macOS runner (never run yet) | todo (Mobile Engineer) | `docs/MOBILE.md` §7 |
| A9 | App record in App Store Connect (name, primary language English, bundle id, SKU `towerclash`) | needs stakeholder | — |
| A10 | Name, subtitle, promotional text, description, keywords | done | `STORE_LISTING.md` §2 |
| A11 | Screenshots 6.7" 1290×2796 and 6.5" 1284×2778 | todo (Publisher) | Re-run `store/tools/renderStoreShots.mjs` with iPhone viewports; the current 1080×1920 set is Google-only |
| A12 | App icon 1024×1024 (no alpha) | done | `tower-clash/resources/icon.png`, already in the Xcode asset catalog via `npm run icons:generate` |
| A13 | Age rating questionnaire | needs stakeholder (submission) | Answers in `STORE_LISTING.md` §4; expected 9+ (mild cartoon violence) or 4+ if declared none |
| A14 | App Privacy: "Data Not Collected"; no tracking | needs stakeholder (submission) | — |
| A15 | Export compliance: the app uses no encryption of its own and makes no network calls → not subject to export regulations (`ITSAppUsesNonExemptEncryption = NO` can be added to Info.plist) | todo (Mobile Engineer) / needs stakeholder (answer) | — |
| A16 | Support URL, marketing URL, privacy policy URL, copyright line | todo (W5, W6) / needs stakeholder (support address) | — |
| A17 | Review notes: "single-player offline game, no account needed" | done (text in `STORE_LISTING.md`) | — |
| A18 | Submit for review, release manually or automatically | needs stakeholder | Typically 1–3 days |

## 4. Version and tag

| # | Step | Status | Notes |
|---|---|---|---|
| V1 | `tower-clash/package.json` version `0.1.0` | done | — |
| V2 | Release notes v0.1.0 EN + AZ | done | `RELEASE_NOTES.md` |
| V3 | Git tag `tower-clash-v0.1.0` | todo (Producer) | Proposed in the daily report |
| V4 | Native versions aligned (see G6, A7) | todo (Mobile Engineer) | — |

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

`docs/MOBILE.md` §6 lists an older, longer naming scheme; this table is the authoritative one and MOBILE.md should be aligned to it when the release jobs are written.
