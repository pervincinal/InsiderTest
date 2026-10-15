# Tower Clash — App Store Connect paste sheet (1.0.0 — build 8 in App Review since 2026-10-11, to be replaced by build 16: §10)

Owner: Publisher. Written 2026-09-28 (PUB-12) for the stakeholder's first App Store submission, done from a browser and an iPhone — no Mac. Every field below is in the order App Store Connect shows it, with the final text ready to copy. English is the App Store language; the Azerbaijani words in parentheses are the field labels so the screens can be matched without reading the English (Azərbaycanca: mötərizədəki söz sahənin adıdır; mətnin özü ingiliscə yapışdırılır). The stakeholder's own steps around this sheet are `LAUNCH_CHECKLIST.md` §0b — since MM-12 (2026-10-09) only §1 (New App, done 2026-10-09), §4 (App Privacy, §0b step 8) and the review contact / copyright name as `ASC_REVIEW_*` secrets (§0b step 7); everything else here is uploaded by the team from `tower-clash/fastlane/` through `tower-clash/release/ios-store.request` (`docs/MOBILE.md` §3.2), so this sheet is the source those files copy (`tests/release/storeMetadata.test.ts`) and the by-hand fallback if the API refuses a field; the source texts are `STORE_LISTING.md` §2 (name, subtitle, promo, keywords, URLs), §1.1 (description), §4 / §6.4 (age rating, privacy), `RELEASE_NOTES.md` v1.0.0 ("What's New"). Character counts were produced by a script on 2026-09-28 (§9) — do not edit a text without re-counting.

**Which variant to paste — default B.** Two variants exist for the fields that mention purchases:

- **Variant A — with in-app purchases** (RevenueCat key `RC_IOS_KEY` in the GitHub secrets, the nine products of `STORE_LISTING.md` §6.1 created and attached to the version, Paid Applications agreement Active — checklist MZ2, MZ3, MZ13).
- **Variant B — without in-app purchases (default for 1.0.0).** The build is made without `RC_IOS_KEY`; the purchase SDK is never configured, so the shop hides its Crystals and Bundles tabs (PUB-14, 2026-10-03) and shows cosmetic skins and gold upgrades only — no price, product or Restore Purchases button is reachable; skins and Commander upgrades work with crystals / gold earned in play. No product is created in App Store Connect, no Paid Applications agreement is needed. IAP arrives in 1.0.1 — it takes the next free build number when it is cut — once MZ13 is done, with variant A texts and the products submitted with that version.

Fields marked **stakeholder fills** are personal values the team must not invent (`[developer …]` placeholders; no e-mail address or phone number is written anywhere in the repository).

Ads in both variants: the review build must carry the real AdMob iOS ids (`ADMOB_IOS_APP_ID`, `ADMOB_IOS_INTERSTITIAL`, `ADMOB_IOS_REWARDED` — checklist MZ7, §5). Without them the build serves Google's **test** ad units ("Test Ad" placeholders) — fine for TestFlight, not for a public App Store build. Nothing on this sheet changes with the AdMob ids except the build picked in §6.2 — **1.0.0 (8)**, the first build with the real ids. Build numbers (Producer, 2026-10-03): **7** = the release candidate with Google test ads, TestFlight only; **8** = 1.0.0 with the real AdMob ids, the App Review build; **9** (2026-10-11) and **10** (2026-10-12) = further 1.0.0 builds with the iPhone fixes (BUG-33 / BUG-34 / BUG-35), for TestFlight and to replace 8 in App Review once the stakeholder has checked them; 1.0.1 (purchases) takes the next free build number when it is cut (`LAUNCH_CHECKLIST.md` §0c step 9, `RELEASE_NOTES.md` v1.0.0 "Build numbers"). Pick the 1.0.0 build the team names in the report thread. **2026-10-15 (PUB-23):** builds 11–16 followed on TestFlight; **build 16** (2026-10-14) is the build for the store and replaces 8 in App Review after the stakeholder's "yaxşıdır" — the swap, in both directions (8 approved or rejected first), is **§10**.

---

## 1. New App dialog — My Apps → "+" → New App (Yeni tətbiq)

| Field (AZ) | Value | Notes |
|---|---|---|
| Platforms (Platformalar) | **iOS** | tick only iOS |
| Name (Ad) | `Tower Clash: Tap & Conquer` (26 / 30) — **the accepted name** | **2026-10-09: the app record was created with this name because `Tower Clash` (11) was already taken** (App Store names are unique world-wide; next fallback would have been `Tower Clash Strategy`). The home-screen label under the icon stays `Tower Clash` (`CFBundleDisplayName`). The name can be changed later at App Information; the bundle id stays |
| Primary Language (Əsas dil) | **English (U.S.)** | Azerbaijani is not an App Store locale |
| Bundle ID (Paket ID) | `com.pervincinal.towerclash` — pick "Tower Clash - com.pervincinal.towerclash" from the list | appears only after §0b step 2 (Identifiers) |
| SKU | `towerclash` (10) | internal, never shown |
| User Access (İstifadəçi girişi) | **Full Access** | — |

## 2. App Information (Tətbiq məlumatı) — left menu, General → App Information

| Field (AZ) | Value | Notes |
|---|---|---|
| Name (Ad) | `Tower Clash: Tap & Conquer` (26 / 30) | from §1 — the accepted name of 2026-10-09 (`Tower Clash` was taken); the home-screen label stays `Tower Clash` |
| Subtitle (Alt başlıq) | `Capture every tower` (19 / 30) | — |
| Bundle ID / SKU / Apple ID | as created | read-only after the first build |
| Primary Category (Əsas kateqoriya) | **Games** → subcategories **Strategy**, **Casual** | Games asks for two subcategories |
| Secondary Category (İkinci kateqoriya) | leave empty (or **Entertainment**) | optional |
| Content Rights (Məzmun hüquqları) → "Does your app contain, show, or access third-party content?" | **No** — "This app does not contain, show, or access third-party content" | all art, sounds and text are the team's own |
| Age Rating (Yaş reytinqi) → Edit | answers in §5 | expected result **9+** |
| License Agreement (Lisenziya müqaviləsi) | Apple's Standard EULA (default) | do not upload a custom one |
| Privacy Policy URL (Məxfilik siyasəti URL) — under "Privacy Policy" for English (U.S.) | `https://pervincinal.github.io/InsiderTest/privacy.html` | **not live yet** — GitHub Pages was never enabled (BUG-26, corrected 2026-10-09; `LAUNCH_CHECKLIST.md` §0b step 0); open it once in Safari when it is, before saving (the `[developer e-mail]` placeholder on that page must be replaced first — checklist G18 / T3) |
| User Privacy Choices URL (Məxfilik seçimləri URL) | leave empty | — |
| Localizable Information — Name / Subtitle / Privacy Policy URL for other languages | none | English (U.S.) only in 1.0.0 |

## 3. Pricing and Availability (Qiymət və əlçatanlıq)

| Field (AZ) | Value | Notes |
|---|---|---|
| Price Schedule (Qiymət) → Add Pricing | **Free** (USD 0.00, "Free" tier) for all countries | never a price — the listing texts say "free" |
| Availability (Əlçatanlıq) → Countries or Regions | **Default: Azerbaijan, Türkiye, Kazakhstan, Georgia** only (`POST_LAUNCH.md` §2.2 soft launch); "all countries" is the week-4 decision | untick "All countries or regions", tick the four; the list can be widened any day without a new review |
| Pre-Orders (Ön sifariş) | **No** | — |
| Tax Category (Vergi kateqoriyası) | default "App Store software" | shown only after the Paid Applications agreement (variant A); free apps are not asked |
| App Distribution (Paylanma) — "Available for all users" vs Apple Business/School only | **Public** (default) | — |

## 4. App Privacy (Tətbiq məxfiliyi) — left menu → App Privacy → Get Started

First question, "Do you or your third-party partners collect data from this app?" (Bu tətbiqdən məlumat toplanır?) → **Yes** (Google AdMob collects). Then tick the data types and answer three questions per type:

| Data type (Məlumat növü) | Tick? | Purposes (Məqsəd) | "Linked to the user's identity?" (İstifadəçi ilə əlaqəli?) | "Used for tracking?" (İzləmə üçün?) |
|---|---|---|---|---|
| Identifiers → **Device ID** | Yes | Third-Party Advertising, App Functionality | **No** | **No** |
| Purchases → **Purchase History** | **Variant A: Yes** · **Variant B: No (not collected)** | (A) App Functionality | (A) No | (A) No |
| Usage Data → **Advertising Data** | Yes | Third-Party Advertising, Analytics | No | No |
| Usage Data → **Product Interaction** | Yes (ad SDK interactions only) | Third-Party Advertising, Analytics | No | No |
| Diagnostics → **Crash Data** | Yes (AdMob SDK) | App Functionality, Analytics | No | No |
| Diagnostics → **Performance Data** | Yes (AdMob SDK) | App Functionality, Analytics | No | No |
| Location → **Coarse Location** | Yes (derived from IP by Google's ad SDK) | Third-Party Advertising | No | No |
| Contact Info, Health & Fitness, Financial Info, Sensitive Info, Contacts, User Content, Browsing History, Search History, Precise Location, Name, Email, Phone, Other Data | **No** | — | — | — |

Last screen, "Tracking" (İzləmə): **"No, we do not use data for tracking purposes."** Reason: the app never shows the App Tracking Transparency prompt and requests non-personalised ads on iOS (`STORE_LISTING.md` §6.4 option A, checklist MZ9). Result shown on the store page: "Data Not Linked to You" only. Press **Publish** on the App Privacy page — it is separate from the version submission.

**Share card and rating API — nothing new to tick (PUB-16, 2026-10-08).** The result card's SHARE button (PAYLAŞ) draws the image on the device, writes it to the app's private cache folder and hands it to the iOS share sheet; the app itself transmits nothing and receives nothing back, and Apple counts a data type as "collected" only when it leaves the device to the developer or a partner — so no row changes (`docs/MOBILE.md` §8.4, `PRIVACY_POLICY.md` Part A). The StoreKit review API (MM-9) is disabled in build 8 (the `RATING_PROMPT` variable is unset); when it is switched on in a later version, the rating still goes from Apple's own sheet to Apple and the app learns nothing — no data type either way. (Bu iki funksiya heç bir yeni məlumat növü əlavə etmir; yuxarıdakı cavablar dəyişmir.)

## 5. Age Rating (Yaş reytinqi) — App Information → Age Rating → Edit

Answer row by row; if the questionnaire shows a row that is not listed here, answer **None / No** unless it names advertising or in-app purchases (answer honestly: ads Yes, purchases — A: Yes, B: No). Expected result **9+**.

| Question (AZ) | Answer |
|---|---|
| Cartoon or Fantasy Violence (Cizgi / fantaziya zorakılığı) | **Infrequent/Mild** — clay soldiers vanish in a puff when they meet; no blood |
| Realistic Violence (Realistik zorakılıq) | None |
| Prolonged Graphic or Sadistic Realistic Violence | None |
| Profanity or Crude Humor (Söyüş / kobud yumor) | None |
| Mature/Suggestive Themes (Yetkin mövzular) | None |
| Horror/Fear Themes (Qorxu) | None |
| Medical/Treatment Information (Tibbi məlumat) | None |
| Alcohol, Tobacco, or Drug Use or References (Alkoqol, tütün, narkotik) | None |
| Sexual Content or Nudity (Cinsi məzmun) | None |
| Simulated Gambling (Simulyasiya qumar) | None |
| Gambling and Contests (Qumar və müsabiqələr) | **No** |
| Unrestricted Web Access (Məhdudiyyətsiz veb girişi) | **No** — the app has no browser |
| Loot Boxes / paid random items (Loot box) | **No** — every product grants fixed, listed content |
| Messaging and Chat / User-Generated Content (Mesajlaşma, istifadəçi məzmunu) | **No** |
| Parental Controls / In-App Controls (Valideyn nəzarəti) | **No** |
| Age Assurance (Yaş yoxlaması) | **No** |
| Made for Kids (Uşaqlar üçün) | **No** — do not enter the Kids category (third-party ad SDK) |
| Advertising (Reklam) — if asked | **Yes** (Google AdMob interstitial + rewarded) |
| In-App Purchases (Tətbiqdaxili alışlar) — if asked | Variant A **Yes** · Variant B **No** |

## 6. Version page — left menu "iOS App" → 1.0.0 Prepare for Submission (Versiya səhifəsi)

### 6.1 Screenshots (Skrinşotlar) — App Previews and Screenshots, "iPhone" tab

Upload order = file order; drag to reorder if the browser uploads out of sequence. Every file is a Playwright capture of the game (`LAUNCH_CHECKLIST.md` A11; re-cut 2026-10-15, PUB-24, on the build-16 look: the ART-24 zoomed flat view (no perspective camera, no horizon islets), walking soldiers, ART-23 light and capture effects, title island and menu headers at the safe edges of the tall screen; the ART-19 frames of 2026-10-13 showed the perspective camera of build 14 and were replaced); sizes are exact, all files ≤ 600 KB (largest 578 KB on 6.7", 588 KB on 6.5"), PNG without alpha.

| Slot (Yer) | Device size tab in App Store Connect | File (from `tower-clash/store/screenshots/`) | What it shows |
|---|---|---|---|
| 1 | iPhone 6.9"/6.7" display (1290×2796 accepted) | `apple-6.7/en/01.png` | Title screen — "Capture every tower" |
| 2 | ″ | `apple-6.7/en/02.png` | Level 1 tutorial — "Tap, and the stream flows" |
| 3 | ″ | `apple-6.7/en/03.png` | Level 5, both stream colours, soldiers walking, a capture burst — "Streams keep flowing" |
| 4 | ″ | `apple-6.7/en/04.png` | Level 24, mines and two rivals — "Mines, rocks, two rivals" |
| 5 | ″ | `apple-6.7/en/05.png` | Level 9 fortress — "Storm the fortress" |
| 6 | ″ | `apple-6.7/en/06.png` | Level 45, three enemies, wall gap — "Three enemies, one crown" |
| 7 | ″ | `apple-6.7/en/07.png` | Result, three stars — "Three-star every level" |
| 8 | ″ | `apple-6.7/en/08.png` | WEEKLY tab — "A new challenge every week" |
| 9 | ″ | `apple-6.7/en/09.png` | Level 15 citadel — "Silence the guns" |
| 10 | ″ | `apple-6.7/en/10.png` | Shop, Upgrades tab (gold prices only, no IAP visible) — "Boost your commander" |
| 1–10 | iPhone 6.5" display (1284×2778) — only if App Store Connect shows this tab as required; newer accounts see one iPhone tab and scale the rest | `apple-6.5/en/01.png` … `10.png` | same ten frames |
| — | iPad 13" (2064×2752 / 2048×2732) | **none rendered** | Required while the Xcode target has `TARGETED_DEVICE_FAMILY = "1,2"` (iPhone + iPad). Default: the Mobile Engineer sets the target to iPhone only (`TARGETED_DEVICE_FAMILY = 1`) before the review build — `STORE_LISTING.md` §2 already says "iPhone-only, recommended"; fallback: the Publisher renders an iPad set with `renderStoreShots.mjs`. **Done 2026-09-28 (Producer): `TARGETED_DEVICE_FAMILY = 1` in both build configurations**, so App Store Connect shows no iPad slot (this was "prerequisite 3" of `LAUNCH_CHECKLIST.md` §0b before MM-12) |

App Previews (videos): none. "Use the same screenshots for all sizes" is not needed when only the required tab is filled.

### 6.2 Text fields (Mətn sahələri), in screen order

| Field (AZ) | Limit | Value | Count |
|---|---|---|---|
| Promotional Text (Tanıtım mətni) | 170 | **Variant B (default):** `Tap, send, conquer. 50 levels of one-thumb real-time strategy: fortresses, artillery, tanks, walls, mines. Plays offline, no account.` | 133 |
| ″ | 170 | Variant A: `Tap, send, conquer. 50 levels of one-thumb real-time strategy: fortresses, artillery, tanks, walls, mines. Plays offline, no account. Ads removable.` | 148 |
| Description (Təsvir) | 4000 | **Variant B (default):** the block in §6.3 below | 3858 |
| ″ | 4000 | Variant A: `STORE_LISTING.md` §1.1 verbatim | 3979 |
| Keywords (Açar sözlər) | 100 | `war,strategy,rts,capture,castle,army,offline,casual,defense,attack,soldiers,siege,kingdom,battle` — commas, no spaces; 2026-10-09: `tower`, `tap`, `conquer` dropped because the accepted name "Tower Clash: Tap & Conquer" already indexes them, replaced by `siege`, `kingdom`, `battle` | 96 |
| Support URL (Dəstək URL) | — | `https://pervincinal.github.io/InsiderTest/support.html` | not live yet (BUG-26 — `LAUNCH_CHECKLIST.md` §0b step 0); the `[developer e-mail]` on the page must be replaced before submission (G18 / T3, §0b step 9) |
| Marketing URL (Marketinq URL) | — | `https://pervincinal.github.io/InsiderTest/` | optional; not live yet (BUG-26) |
| Version (Versiya) | — | `1.0.0` | must equal `MARKETING_VERSION` of the uploaded build (it does: 1.0.0 / build 7) |
| Copyright (Müəllif hüququ) | — | `© 2026 [developer name]` — **stakeholder fills** the name (the person or company that owns the app; the same name as the developer account) | 23 with the placeholder |
| Routing App Coverage File | — | none | — |
| Game Center (Oyun mərkəzi) | — | **not enabled** | no leaderboards in 1.0 |
| App Clip, iMessage | — | none | — |
| Build (Build) → "+" | — | **1.0.0 (16)** from the swap on (§10 — the stakeholder removes 8 from review, the team's `ios-store.request` `action=submit` `build=16` attaches and submits 16); before it **1.0.0 (8)** — the first build with the real AdMob ids (`LAUNCH_CHECKLIST.md` §0c step 9); appears ≈ 15–30 min after the workflow uploads it (TestFlight → "processing" first). Build 7 serves Google test ads and stays on TestFlight | build numbers: 7 = RC with test ads (TestFlight only), 8 = 1.0.0 with real AdMob ids (this field, until a later 1.0.0 build replaces it), 9 / 10 = 1.0.0 with the iPhone fixes, 11–16 = 1.0.0 TestFlight builds, **16 = the store build** (§10), 1.0.1 with IAP = the next free number when it is cut (1.0.2 if 1.0.0 (8) was approved before the swap, §10.3); the Producer bumps with `npm run version:sync` |
| What's New in This Version (Bu versiyada yeniliklər) | 4000 | Not shown for the very first version. From 1.0.1 on: the EN block of the version in `RELEASE_NOTES.md` | (v1.0.0 EN block = 496 chars since 2026-10-06, re-counted 2026-10-08; ready if the field appears) |

### 6.3 Description — variant B (without in-app purchases), 3858 characters

Identical to `STORE_LISTING.md` §1.1 except four purchase phrases (listed in `STORE_LISTING.md` §2.1). 2026-10-12 (PUB-22): "keeps flowing until you tap the target again" became "keeps flowing until you swipe across it" (BUG-33, builds 9+; 3863 → 3858); `tower-clash/fastlane/metadata/en-US/description.txt` changed with it, so the store lane uploads the new text with the next submission — the sentence is not true of build 8, so it goes out only with build 9 or later. Paste as is:

```
Tower Clash is a one-thumb real-time strategy game: tap one of your towers, tap a target, and a stream of soldiers starts marching — and keeps marching until you stop it. Reinforce friendly towers, overwhelm hostile ones, and when a garrison hits zero the tower is yours. Capture every enemy tower to win.

HOW IT PLAYS
• Tap a blue tower, then tap any tower it can see in a straight line: a stream of soldiers starts flowing there — and keeps flowing until you swipe across it. Walls, water and rocks block the line. Drag from tower to tower works too.
• Towers upgrade themselves: let one fill to 25 soldiers and it becomes level 2, at 50 level 3 (100 max). Bigger towers recruit faster and run more streams — one at level 1, two at level 2, three at level 3.
• Sending never empties a tower — it only stops growing while it streams, and bigger towers stream faster. Close the stream to let it level up.
• A tower under attack stops recruiting — answer every enemy stream, or the tower falls.
• Enemy streams are drawn as straight ribbons in their colour, so you always see where the next attack comes from — and where to answer it.

50 HAND-MADE LEVELS
• Levels 1–3 teach the basics with a short built-in tutorial; every later level opens with a one-line lesson.
• Fortresses (from level 9) shrug off half of every attack — bring more than you think.
• Artillery (from level 12) shoots down soldiers that walk into its range — approach from the right side.
• Two enemies at once from level 17, three from level 33 — and they fight each other too.
• Walls, rivers and rocks that block the line of attack, and mines that take out the first soldiers to pass over them.
• Tank factories (from level 25): a tank weighs five soldiers but crawls — send it first and let the infantry catch up.
• Levels 41–50, the Grand Campaign: three enemies, walls and mines on every map, the toughest islands — no new rules, all of them at once.
• Beat every level for three stars: the faster you win, the more stars you earn. Stars unlock the next level and pay gold.
• Daily Challenge: one fixed level, seed and twist per day, the same for everyone — free retries, gold and crystals for the first win, bonus crystals for a 3-, 7- and 30-day win streak.
• Weekly Challenge: every Monday one twisted level from the late campaign, the same for everyone — 100 gold for the first win, 20 crystals for beating its three-star clock.

GOLD, CRYSTALS AND UPGRADES
• Gold is earned by playing — stars, replays and daily rewards — and buys Overdrive (×3 production for 10 s), Freeze (enemies stop producing for 5 s), Airstrike (−10 soldiers on one enemy tower) and permanent Commander upgrades (production, capacity, starting garrison, march speed, cheaper boosters).
• Crystals come from milestones, achievements and the daily chest; they buy tower, helmet and island skins or a second chance after a defeat.
• Every level is winnable without spending anything — upgrades are a shortcut, never a requirement.

SIX ISLANDS
• Grass, autumn, sand, snow, volcanic and twilight islands, drawn in a soft clay style with sunlit shadows.

BUILT FOR PHONES
• Portrait, one hand, every level under three minutes.
• Pause menu with a ×2 speed switch for when you are already winning.
• Settings: sound, colour-blind palette, reduced motion, language; mute button right in the HUD.
• Plays offline: the campaign needs no connection (ads do).

HONEST BY DESIGN
• No account, no sign-in — your progress is stored only on your device.
• Nothing to buy in this version: gold and crystals are earned by playing. No subscriptions, no loot boxes.
• A short ad between levels at most every third level, never during a battle, and never in the first five levels. Rewarded videos are always your choice.

Menus, hints, the tutorial, level names and lessons are in English, Azerbaijani, Russian and Turkish.
```

### 6.4 App Review Information (Rəy üçün məlumat)

| Field (AZ) | Value |
|---|---|
| Sign-In Required (Giriş tələb olunur?) | **No** — untick; the game has no account |
| Demo account (Demo hesab) | **not needed** — leave user name / password empty |
| Contact Information → First Name (Ad) | **stakeholder fills** |
| Contact Information → Last Name (Soyad) | **stakeholder fills** |
| Contact Information → Phone Number (Telefon) | **stakeholder fills** — with the country code, e.g. +994 … |
| Contact Information → Email (E-poçt) | **stakeholder fills** — a mailbox that is read daily during review (Apple writes there when something is rejected) |
| Notes (Qeydlər) | **Variant B (default), 1202 chars (2026-10-08, PUB-16: the share-sheet and rating sentences added; rewritten 2026-10-03, PUB-14):** the block below. Variant A (with IAP), 1025 chars: the second block (share-sheet sentence added 2026-10-08; whether 1.0.1 asks for a rating is decided with the `RATING_PROMPT` variable — if it stays unset, add variant B's rating sentence to A as well) |
| Attachment (Əlavə fayl) | none |

Notes — variant B (default, no purchases in this version):

```
Single-player offline game, no account or sign-in needed, so no demo account is required — all content is reachable without paying. This version contains NO in-app purchases: no products are attached to it and the purchase SDK is never configured. The shop (title screen → SHOP) shows cosmetic skins and gold upgrades only; no purchase UI is reachable — no prices, no product list, no buy or Restore Purchases button. Skins are paid with crystals and Commander upgrades with gold, both earned by playing. The SHARE button on the result card (PAYLAŞ in Azerbaijani) opens the system share sheet with an image created on the device; nothing is uploaded. The app never requests a rating in this version: the StoreKit review API is present in the binary but disabled. Ads are Google AdMob: an interstitial after some result screens (never during play, never in the first five levels) and rewarded videos only on the player's request. The app never requests App Tracking Transparency (there is no NSUserTrackingUsageDescription in Info.plist) and always requests non-personalised ads on iOS, so the IDFA is not used — App Privacy "Tracking" is answered No. The game runs offline; only ads need a connection.
```

Notes — variant A (with in-app purchases; use only when the nine products are attached to the version):

```
Single-player offline game, no account or sign-in needed, so no demo account is required — all content is reachable without paying. In-app purchases are one-time products (consumable crystal packs and non-consumable Starter Pack / Remove Ads / Premium Bundle / Premium Upgrade) handled by StoreKit through the RevenueCat SDK; "Restore Purchases" is at the bottom of the shop's Crystals and Bundles tabs (title screen → SHOP). The SHARE button on the result card (PAYLAŞ in Azerbaijani) opens the system share sheet with an image created on the device; nothing is uploaded. Ads are Google AdMob: an interstitial after some result screens (never during play, never in the first five levels) and rewarded videos only on the player's request. The app never requests App Tracking Transparency (there is no NSUserTrackingUsageDescription in Info.plist) and always requests non-personalised ads on iOS, so the IDFA is not used — App Privacy "Tracking" is answered No. The game runs offline; only ads and purchases need a connection.
```

### 6.5 Version Release (Versiyanın buraxılması)

**"Manually release this version"** (Bu versiyanı əl ilə burax) — after approval the version waits at "Pending Developer Release" until the stakeholder presses *Release This Version* (`LAUNCH_CHECKLIST.md` §0b step 10; `POST_LAUNCH.md` §1 day L+14). Not "Automatically", not "Automatically after a date".

### 6.6 Export compliance (İxrac uyğunluğu) — asked at build selection or in TestFlight "Manage" next to the build

`ios/App/App/Info.plist` carries `ITSAppUsesNonExemptEncryption = false`, so App Store Connect normally does **not** ask. If it does: "Is your app designed to use cryptography or does it contain or incorporate cryptography?" → **No** (only the operating system's standard HTTPS/TLS; exempt). Nothing to upload.

### 6.7 Advertising Identifier (IDFA) — only if the legacy question appears

"Does this app use the Advertising Identifier (IDFA)?" → **Yes** → tick only **"Serve advertisements within the app"**; "attribute this app installation" → No; "attribute an action" → No; confirm "the app honours the Limit Ad Tracking / ATT setting" → **Yes**. (Current App Store Connect replaced this with the App Privacy answers of §4; both say the same.)

## 7. TestFlight page (TestFlight səhifəsi) — only what an internal test needs

| Field (AZ) | Value |
|---|---|
| Internal Testing → "+" → group name (Qrup adı) | `Team` — tick "Enable automatic distribution" so every new build reaches the group |
| Testers (Test edənlər) | the stakeholder's own App Store Connect user (Account Holder) — Users and Access lists it already; up to 100 internal testers, no review needed |
| Test Information → Beta App Description (Beta təsviri) | `Tower Clash 1.0.0 (build 7): 50 levels, Daily and Weekly Challenge, offline. This build has no in-app purchases; ads are Google test ads until the AdMob ids are set.` |
| Test Information → Feedback Email (Rəy e-poçtu) | **stakeholder fills** |
| Test Information → Privacy Policy URL | `https://pervincinal.github.io/InsiderTest/privacy.html` |
| Beta App Review Information | needed only for **External** testing (public link / outside testers): same contact as §6.4; the build then passes a short TestFlight review (usually < 1 day) |
| What to Test (Nəyi test etməli) — per build | `Fresh install: tutorial levels 1–3, one Daily Challenge, Settings → About shows 1.0.0 (7). Shop: only the Skins and Upgrades tabs, no Crystals / Bundles tabs and no prices (expected in this build).` |

## 8. After approval (Təsdiqdən sonra)

App Store → 1.0.0 shows **Pending Developer Release** → *Release This Version*. The store page appears within a few hours in the four countries of §3. Widening the country list (Pricing and Availability) needs no new review; a new build does (e.g. 1.0.1, on the next free build number).

## 9. Character counts (2026-09-28; descriptions A / B re-run 2026-10-12, PUB-22; description B, review notes B and the `premium_bundle` texts re-run 2026-10-03; review notes A / B re-run 2026-10-08, PUB-16; name and keywords re-run 2026-10-09, PUB-18; `[...s].length` code points; script in the Publisher's scratch, texts taken from this sheet / `STORE_LISTING.md`)

```
   26 name (accepted 2026-10-09)        (limit 30)
   11 name "Tower Clash" (taken)        (limit 30)
   20 name fallback 2 (not used)        (limit 30)
   19 subtitle                          (limit 30)
  148 promo A                           (limit 170)
  133 promo B                           (limit 170)
   96 keywords                          (limit 100; no space after a comma; re-cut 2026-10-09)
 3979 description A (EN, §1.1 verbatim) (limit 4000; 3984 before 2026-10-12)
 3858 description B (EN)                (limit 4000; 3863 before 2026-10-12 — swipe sentence, PUB-22)
 3963 description A (AZ, §1.2 verbatim) (limit 4000 — Play only; 3955 before 2026-10-12)
 3833 description B (AZ)                (limit 4000 — Play only; 3825 before 2026-10-12)
   23 copyright (with the placeholder)
   10 SKU
 1025 review notes A                    (limit 4000; 878 before PUB-16)
 1202 review notes B                    (limit 4000; 943 before PUB-16)
  496 what's new EN (RELEASE_NOTES v1.0.0) (limit 4000; "eight new skins", 2026-10-06)
   45 premium_bundle description EN      (limit 45; 1.0.1)
   45 premium_bundle description AZ      (limit 45; Play translation only)
 2518 Cowork prompt §10.5 (AZ)          (—; 2026-10-15, PUB-23)
```

## 10. Rəy build-inin əvəzlənməsi (build 8 → 16) — Replacing the review build (build 8 → 16)

Written 2026-10-15 (PUB-23). **1.0.0 (8)** has been in App Review since 2026-10-11 with the old look (flat soldiers, no swipe-to-cut, no supply lines, the old icon); builds 9–16 went to TestFlight only. **1.0.0 (16)** (2026-10-14: walking soldiers, the zoomed flat view, lighting and effects, every fix through BUG-45) is the build meant for the store. The submission of build 8 used **"Manually release this version"** (§6.5; `tower-clash/fastlane/Fastfile` `automatic_release: false`), so even an approval never makes it public by itself — it waits at *Pending Developer Release* until someone presses *Release This Version*. Azerbaijani first (the stakeholder's steps), English mirror in §10.6.

### 10.0 Nə vaxt və hansı yol (When, and which branch)

**Yalnız sən build 16-nı iPhone-da yoxlayıb söhbətdə "yaxşıdır" yazandan sonra.** Əvvəlcə App Store Connect → Tower Clash: Tap & Conquer → **App Store** tabı → sol menyuda **iOS App** altında **1.0.0** — statusa bax və yolu seç:

| Status (ekranda) | Mənası | Yol |
|---|---|---|
| **Waiting for Review** / **In Review** | 8 hələ rəydədir | **Əsas yol** — §10.1 (sən), §10.2 (komanda) |
| **Developer Rejected** | 8 artıq rəydən çıxarılıb | §10.1-in **b** hissəsindən davam et |
| **Pending Developer Release** | Apple 8-i təsdiqləyib; heç nə hamıya görünmür | §10.3 — **Release This Version-a basma** |
| **Rejected** / **Metadata Rejected** | Apple 8-i rədd edib | §10.4 |

### 10.1 Əsas yol — sənin addımların (a: rəydən çıxar, b: build 16-nı seç)

Cowork ilə: §10.5-dəki mətni Cowork-a yapışdır. Daxil olmağı özün edirsən; parolu, kodları heç vaxt çata yazma.

**a) Rəydən çıxar (Remove from Review)**
1. https://appstoreconnect.apple.com → **Apps** → **Tower Clash: Tap & Conquer**.
2. Yuxarıda **App Store** tabı → sol menyuda **iOS App** altında **1.0.0** (yanında sarı nöqtə və "Waiting for Review" / "In Review").
3. Versiya səhifəsinin başında statusun çipinə ("Waiting for Review" / "In Review") klik et. Çip klik olunmursa: sol menyuda **General** → **App Review** → *Submissions* siyahısında **iOS App 1.0.0** olan göndərişi aç.
4. Göndərişin səhifəsində sağ yuxarı küncdə **Remove from Review** (bəzi hesablarda **Cancel Submission**) → təsdiq pəncərəsində **Remove**.
5. Səhifəni yenilə: 1.0.0-ın statusu **Developer Rejected** olur (bir neçə dəqiqə çəkə bilər). Bu, sənin özünün geri çəkdiyin deməkdir — Apple-ın rəddi deyil, hesabına heç bir qeyd düşmür. Növbədəki yer itir: build 16 üçün rəy yenidən 1–3 gün çəkəcək.

**b) Build 16-nı seç**
6. Elə 1.0.0 səhifəsində aşağı, **Build** bölməsinə get. Orada **1.0.0 (8)** sətri var → siçanı sətrin üstünə gətir → sağda qırmızı **⊖** (Remove) → klik.
7. Bölmədə **Add Build** (və ya "+") → açılan siyahıda **1.0.0 (16)** → seç → **Done**. Siyahıda 16 yoxdursa, başqa build seçmə — söhbətdə yaz.
8. Sağ yuxarıda **Save**. (Bu addım məcburi deyil — komandanın göndərişi build 16-nı özü də seçir —, amma ekranda nəyin gedəcəyini görmək üçün yaxşıdır.)

**c) Export compliance (İxrac uyğunluğu) — yalnız soruşulsa**
9. Build 16-da `ITSAppUsesNonExemptEncryption = false` var, ona görə adətən soruşulmur (§6.6). Soruşulsa: köhnə formada *"Does your app use encryption?"* → **No**; yeni formada *"What type of encryption algorithms does your app implement?"* → **None of the algorithms mentioned above** → **Save**. Başqa sual çıxsa — dayan, sözbəsöz söhbətə yaz.

**d) Nə ETMƏMƏLİ**
- **Add for Review**, **Submit for Review**, **Resubmit to App Review** düymələrinə **basma** — Save-dən sonra "Add for Review" görünəcək, bu normaldır. Rəyə göndərməni komandanın `ios-store.request` faylı edir (`action=submit`, `build=16`, §10.2). Əl ilə "Add for Review" basılsa, App Store Connect qaralama göndəriş yaradır və komandanın işi onu götürə bilmir (fastlane: *"A review submission already exists with items not managed by fastlane"*).
- **Release This Version**-a basma, mətnləri / skrinşotları / qiyməti / ölkələri / App Privacy-ni dəyişmə, heç nəyi silmə (versiyanı, build-i, tətbiqi), heç nə yükləmə.

10. Söhbətdə yaz: **"8-i rəydən çıxardım, 16 seçildi"** (və ya Cowork-un hesabatını yapışdır). Qalanı komandanındır; nəticə gündəlik hesabatdadır.

### 10.2 Komandanın addımları — əsas yol (Team steps — main branch)

1. **Before the submit commit: the store screenshots must show build 16's look (PUB-24 — done 2026-10-15: every set re-cut on the build-16 tree, zoomed flat view; the text below is kept as the reason).** The store lane uploads `store/screenshots/apple-6.7/en/01…10.png` with every `ios-store.request` (`overwrite_screenshots: true`), and the current set was cut on 2026-10-13 on the build-14 tree (ART-19) — the perspective play camera with horizon islets, which since ART-24 (build 15) is only the `?tilt=0.72` override, not what a player of build 16 sees. Re-cut every set (Apple 6.7" / 6.5", Google en/az/ru/tr, IAP review frame) on the build-16 tree with `renderStoreShots.mjs` before step 2; until then the submit would put screenshots of a view that build 16 does not show on the store page.
2. `tower-clash/release/ios-store.request`: `action=submit`, `build=16`, `iphone65=no`, a `note` (e.g. `submit 1.0.0 (16) after the stakeholder removed build 8 from review; release stays manual`), a new `requested=$(date -u +%Y-%m-%dT%H:%M:%SZ)`. Check: `node scripts/releaseRequest.mjs ios-store release/ios-store.request` and `npx vitest run tests/release` — the test pins 1 ≤ `build` ≤ `config.buildNumber` (16 today), so `build=16` passes; the workflow refuses a build above `config.buildNumber` too. Commit (`chore:`), push, read the result with `node scripts/ciStatus.mjs <sha> --annotations` (job *App Store Connect metadata / review submission*).
3. **Only after** the stakeholder wrote that build 8 is out of review (status *Developer Rejected*). While 1.0.0 is *Waiting for Review* / *In Review* the run cannot edit the version or open a second submission and fails — the Fastfile does not cancel a submission itself (no `reject_if_possible`), by design: the removal stays a human click.
4. Failure messages and their meaning: *"A review submission already exists with items not managed by fastlane"* → a draft submission exists (someone pressed *Add for Review*, or the removed one left a draft): the team names the click in the report — App Review → that draft → remove the *iOS App 1.0.0* item — and requests again; *"Build number 16 does not exist"* → Apple has not finished processing, repeat later; an error that the version cannot be edited in its state → step **a** of §10.1 is not done yet.
5. On success the run summary shows *submitted for App Review (submission state …)*; App Review takes 1–3 days; the release stays the stakeholder's *Release This Version* (§8, `LAUNCH_CHECKLIST.md` §0b step 10).

### 10.3 Qol B — Apple build 8-i artıq təsdiqləyib (Pending Developer Release)

**Sən:** **Release This Version**-a **basma** — o zaman köhnə görünüşlü build 8 hamıya çıxar. Heç nəyi silmə, heç nəyə basma. Söhbətdə yaz: **"8 təsdiqləndi, buraxmadım"**. Təsdiqlənmiş versiya sənin klikin olmadan heç vaxt mağazaya çıxmır.

**Why 1.0.1.** Once 1.0.0 is approved, its build is fixed: build 16 cannot be attached to 1.0.0 any more, and a new submission needs a new App Store version. **Team default: the swap goes out as 1.0.1 on the next free build number (17)**, with build 16's code unchanged; 1.0.0 (8) is simply never released. What the team changes (Producer cuts, Mobile Engineer / Publisher prepare; one commit `chore:` + the request commits):
1. `tower-clash/package.json`: `"version": "1.0.1"`, `config.buildNumber` **17** (16 stays a 1.0.0 build — App Store Connect accepts each build number once per version, and the binary carries its version). `npm run version:sync` (Android `versionName` / `versionCode`, iOS `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`), then `npm run version:check`. No code change.
2. `docs/publishing/RELEASE_NOTES.md`: a **v1.0.1** section ("1.0.0 build 16 as 1.0.1", the EN / AZ / RU / TR "What's new" of v1.0.0 can be reused — they describe build 16). `tower-clash/fastlane/metadata/en-US/release_notes.txt` = the EN block, because App Store Connect asks for *What's New* on every version after the first (deliver skips the field on a first version); `tests/release/storeMetadata.test.ts` lists the en-US files exactly, so the test gains `release_notes.txt` in the same commit. This sheet: §6.2 *Version* `1.0.1`, *Build* `1.0.1 (17)`.
3. `tower-clash/release/ios-release.request` (new `note`, `requested`) → **1.0.1 (17)** in TestFlight; a short stakeholder check (Settings → About shows 1.0.1 (17)) — the code is build 16's, already accepted with "yaxşıdır".
4. `tower-clash/release/ios-store.request`: `action=submit`, `build=17`. The lane reads `"version"` from `package.json`, so deliver creates version 1.0.1 in App Store Connect, attaches build 17 and submits it, release still manual. If Apple refuses to create 1.0.1 while 1.0.0 waits at *Pending Developer Release*, the run fails with Apple's message; the team quotes it in the report and names the one click needed — never *Release This Version*.
5. Purchases move one version on: the IAP version planned as 1.0.1 becomes **1.0.2** (`LAUNCH_CHECKLIST.md` §0d steps 7–9, this sheet's variant A notes, `PLAY_CONSOLE_SHEET.md` §8 read "1.0.2" from then on). Google Play has no release yet, so it simply starts at 1.0.1 (17).

### 10.4 Qol C — Apple build 8-i rədd edib (Rejected / Metadata Rejected)

**Sən:** Apple-ın məktubu §0b 7-ci addımdakı e-poçta gəlir; mətn həm də App Store Connect → sol menyu **General** → **App Review** → rədd edilmiş göndəriş → mesaj hissəsindədir. Mesajın **mətnini** (Guideline nömrəsi ilə) söhbətə yapışdır — sirr deyil — və yaz **"8 rədd edildi"**. Özün cavab yazma, **Resubmit to App Review** / **Add for Review** basma, build dəyişmə. "Remove from Review" lazım deyil — rədd edilmiş versiya artıq rəydə deyil.

**Team (resolution flow):**
1. Read the guideline and the reviewer's text; answer in the report in Azerbaijani: what Apple found, whether it applies to build 16 too, what changes.
2. **Metadata only** (texts, screenshots, privacy URL, age rating): fix the sheet + `tower-clash/fastlane/` in one commit (tests in `tests/release` follow the sheet). **Code**: fix, then a new **1.0.0** build 17 (`config.buildNumber` 17 + `npm run version:sync` + `ios-release.request`) — the version stays 1.0.0 because nothing was approved; the stakeholder checks it like build 16.
3. Commit `ios-store.request` `action=submit` with `build=16` (or 17). The rejected version is editable; the lane attaches the build and submits a new submission.
4. **A question, not a defect** (e.g. "how does the shop work?"): the team writes the reply (EN, with an AZ translation for the stakeholder) in the report; the stakeholder pastes it under the reviewer's message → **Reply**. Resubmission is still the team's commit.
5. If the run fails because the rejected submission is still open (*Unresolved Issues*), the team names the click in the report (in that submission, remove the *iOS App 1.0.0* item or cancel it) and requests again. Repeated rejections of the same guideline → the Producer decides about an appeal (App Review Board) — not for 1.0.0 by default.

### 10.5 Cowork mətni — a + b (Cowork-a yapışdır)

```
Sən mənə "Tower Clash: Tap & Conquer" oyunumun App Store Connect səhifəsində bu brauzerdə kömək edirsən. Tək mənbə bu vərəqdir — əvvəlcə onun §10 bölməsini tam oxu:
https://github.com/pervincinal/InsiderTest/blob/claude/tower-war-game-plan-weqwpb/docs/publishing/APP_STORE_CONNECT_SHEET.md

Məqsəd: App Review-da gözləyən 1.0.0 (8) build-ini rəydən çıxarmaq və 1.0.0 versiyasında build 16-nı seçmək. Rəyə yenidən göndərməni sən etmirsən — onu komanda avtomatik edir.

Təhlükəsizlik qaydaları — dəqiq əməl et:
1. Daxil olmağı mən özüm edirəm. Heç vaxt parol, iki addımlı kod, bərpa kodu, API açarı və ya hər hansı sirr soruşma və yazma. Ekran bunlardan birini istəsə, dayan və hansı ekran olduğunu mənə de.
2. Bu düymələrə HEÇ VAXT basma: "Add for Review", "Submit for Review", "Resubmit to App Review", "Release This Version", "Remove from Sale", heç bir "Delete". Mətnləri, skrinşotları, qiyməti, ölkələri və App Privacy-ni dəyişmə; heç nə yükləmə.
3. Əvvəlcə statusu oxu: yuxarıda App Store tabı → sol menyuda iOS App → 1.0.0. Statusu mənə sözbəsöz yaz.
   - "Waiting for Review" və ya "In Review" → 4-cü addım.
   - "Developer Rejected" → 5-ci addım.
   - "Pending Developer Release", "Rejected", "Metadata Rejected" və ya başqa söz → heç nəyə basma, dayan və statusu mənə yaz (bu hallar vərəqin §10.3 / §10.4 bölmələridir, onları komanda aparır).
4. Statusun çipinə klik et (olmasa: sol menyu General → App Review → Submissions → "iOS App 1.0.0" olan göndəriş). Sağ yuxarı küncdə "Remove from Review" düyməsini tap (bəzi hesablarda "Cancel Submission"). Basmazdan ƏVVƏL mənə yaz: "Remove from Review düyməsini tapdım, basım?" və mənim "bəli" cavabımı gözlə. Sonra bas, təsdiq pəncərəsində "Remove" seç. Səhifəni yenilə: status "Developer Rejected" olmalıdır (bir neçə dəqiqə çəkə bilər).
5. 1.0.0 səhifəsində aşağıdakı Build bölməsi: 1.0.0 (8) sətirinin üstünə gəl → sağdakı qırmızı ⊖ (Remove) → sonra "Add Build" və ya "+" → siyahıdan YALNIZ "1.0.0 (16)" seç → Done → sağ yuxarıda Save. Siyahıda 16 yoxdursa, başqa build seçmə — dayan və mənə yaz.
6. Export compliance soruşulsa: köhnə formada "Does your app use encryption?" → No; yeni formada "What type of encryption algorithms does your app implement?" → "None of the algorithms mentioned above" → Save. Başqa sual çıxsa, dayan və onu mənə sözbəsöz yaz.
7. Sonda qısa hesabat ver: əvvəlki status, indiki status, Build bölməsində hansı build görünür və ekranda çıxan hər xəbərdarlıq sözbəsöz. Sonra "Add for Review" düyməsi görünəcək — bu normaldır, ona basma.
```

### 10.6 English mirror (for the team and for Cowork's reference)

- **When:** only after the stakeholder's "yaxşıdır" on build 16. First read 1.0.0's status (App Store tab → iOS App → 1.0.0): *Waiting for Review* / *In Review* → main branch; *Developer Rejected* → continue at step b; *Pending Developer Release* → §10.3; *Rejected* / *Metadata Rejected* → §10.4.
- **a) Remove from Review:** App Store Connect → Apps → Tower Clash: Tap & Conquer → **App Store** tab → **iOS App 1.0.0** → click the status chip at the top (or sidebar **General → App Review → Submissions →** the *iOS App 1.0.0* submission) → top right **Remove from Review** (on some accounts **Cancel Submission**) → **Remove**. The status becomes **Developer Rejected** (the developer's own withdrawal, no mark against the account; the place in the queue is lost).
- **b) Build 16:** the same version page → **Build** section → hover the 1.0.0 (8) row → red **⊖** → **Add Build** / "+" → **1.0.0 (16)** → **Done** → **Save**. Optional (the team's submit attaches build 16 anyway) but makes the state visible.
- **c) Export compliance**, only if asked (build 16 carries `ITSAppUsesNonExemptEncryption = false`): old form "Does your app use encryption?" → **No**; new form "What type of encryption algorithms does your app implement?" → **None of the algorithms mentioned above**.
- **d) Not to do:** no *Add for Review* / *Submit for Review* / *Resubmit to App Review* (a hand-made draft submission blocks the team's fastlane run), no *Release This Version*, no edits to texts, screenshots, price, countries or App Privacy, no deletions, no uploads. The stakeholder writes "8-i rəydən çıxardım, 16 seçildi"; the team then commits `ios-store.request` `action=submit build=16` (§10.2, after the PUB-24 screenshot re-cut).
- **e) Branches:** approved first → do not release; the team ships the swap as **1.0.1 (17)** — `package.json` version + `config.buildNumber`, `npm run version:sync`, RELEASE_NOTES v1.0.1, `fastlane/metadata/en-US/release_notes.txt` + the test's file list, `ios-release.request`, then `ios-store.request` `build=17`; purchases move to 1.0.2 (§10.3). Rejected first → the stakeholder pastes Apple's message; the team fixes metadata or code (a new 1.0.0 build 17 if code), answers questions with a reply text for the stakeholder, and resubmits with `ios-store.request` (§10.4).
- **Cowork prompt:** §10.5 is in Azerbaijani on purpose (the stakeholder reads it before pasting); it covers a + b + c only and stops on any other status.
