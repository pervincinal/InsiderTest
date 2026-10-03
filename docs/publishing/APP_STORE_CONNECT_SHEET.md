# Tower Clash — App Store Connect paste sheet (1.0.0 — build 7 for TestFlight, build 8 for App Review)

Owner: Publisher. Written 2026-09-28 (PUB-12) for the stakeholder's first App Store submission, done from a browser and an iPhone — no Mac. Every field below is in the order App Store Connect shows it, with the final text ready to copy. English is the App Store language; the Azerbaijani words in parentheses are the field labels so the screens can be matched without reading the English (Azərbaycanca: mötərizədəki söz sahənin adıdır; mətnin özü ingiliscə yapışdırılır). The click order around this sheet is `LAUNCH_CHECKLIST.md` §0b; the source texts are `STORE_LISTING.md` §2 (name, subtitle, promo, keywords, URLs), §1.1 (description), §4 / §6.4 (age rating, privacy), `RELEASE_NOTES.md` v1.0.0 ("What's New"). Character counts were produced by a script on 2026-09-28 (§9) — do not edit a text without re-counting.

**Which variant to paste — default B.** Two variants exist for the fields that mention purchases:

- **Variant A — with in-app purchases** (RevenueCat key `RC_IOS_KEY` in the GitHub secrets, the nine products of `STORE_LISTING.md` §6.1 created and attached to the version, Paid Applications agreement Active — checklist MZ2, MZ3, MZ13).
- **Variant B — without in-app purchases (default for 1.0.0).** The build is made without `RC_IOS_KEY`; the purchase SDK is never configured, so the shop hides its Crystals and Bundles tabs (PUB-14, 2026-10-03) and shows cosmetic skins and gold upgrades only — no price, product or Restore Purchases button is reachable; skins and Commander upgrades work with crystals / gold earned in play. No product is created in App Store Connect, no Paid Applications agreement is needed. IAP arrives in 1.0.1 (build 9) once MZ13 is done, with variant A texts and the products submitted with that version.

Fields marked **stakeholder fills** are personal values the team must not invent (`[developer …]` placeholders; no e-mail address or phone number is written anywhere in the repository).

Ads in both variants: the review build must carry the real AdMob iOS ids (`ADMOB_IOS_APP_ID`, `ADMOB_IOS_INTERSTITIAL`, `ADMOB_IOS_REWARDED` — checklist MZ7, §5). Without them the build serves Google's **test** ad units ("Test Ad" placeholders) — fine for TestFlight, not for a public App Store build. Nothing on this sheet changes with the AdMob ids except the build picked in §6.2 — **1.0.0 (8)**, the first build with the real ids. Build numbers (Producer, 2026-10-03): **7** = the release candidate with Google test ads, TestFlight only; **8** = 1.0.0 with the real AdMob ids, the App Review build; **9** = 1.0.1 with in-app purchases (`LAUNCH_CHECKLIST.md` §0c step 9, `RELEASE_NOTES.md` v1.0.0).

---

## 1. New App dialog — My Apps → "+" → New App (Yeni tətbiq)

| Field (AZ) | Value | Notes |
|---|---|---|
| Platforms (Platformalar) | **iOS** | tick only iOS |
| Name (Ad) | `Tower Clash` (11 / 30) | App Store names are unique world-wide. If "Tower Clash" is refused as taken, use in this order: `Tower Clash: Tap & Conquer` (26) or `Tower Clash Strategy` (20). The name can be changed later at App Information; the bundle id stays |
| Primary Language (Əsas dil) | **English (U.S.)** | Azerbaijani is not an App Store locale |
| Bundle ID (Paket ID) | `com.pervincinal.towerclash` — pick "Tower Clash - com.pervincinal.towerclash" from the list | appears only after §0b step 2 (Identifiers) |
| SKU | `towerclash` (10) | internal, never shown |
| User Access (İstifadəçi girişi) | **Full Access** | — |

## 2. App Information (Tətbiq məlumatı) — left menu, General → App Information

| Field (AZ) | Value | Notes |
|---|---|---|
| Name (Ad) | `Tower Clash` | from §1 |
| Subtitle (Alt başlıq) | `Capture every tower` (19 / 30) | — |
| Bundle ID / SKU / Apple ID | as created | read-only after the first build |
| Primary Category (Əsas kateqoriya) | **Games** → subcategories **Strategy**, **Casual** | Games asks for two subcategories |
| Secondary Category (İkinci kateqoriya) | leave empty (or **Entertainment**) | optional |
| Content Rights (Məzmun hüquqları) → "Does your app contain, show, or access third-party content?" | **No** — "This app does not contain, show, or access third-party content" | all art, sounds and text are the team's own |
| Age Rating (Yaş reytinqi) → Edit | answers in §5 | expected result **9+** |
| License Agreement (Lisenziya müqaviləsi) | Apple's Standard EULA (default) | do not upload a custom one |
| Privacy Policy URL (Məxfilik siyasəti URL) — under "Privacy Policy" for English (U.S.) | `https://pervincinal.github.io/InsiderTest/privacy.html` | live since the Pages deploy of 2026-09-28; open it once in Safari before saving (the `[developer e-mail]` placeholder on that page must be replaced first — checklist G18 / T3) |
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

Upload order = file order; drag to reorder if the browser uploads out of sequence. Every file is a Playwright capture of build 7 (`LAUNCH_CHECKLIST.md` A11); sizes are exact, all files ≤ 600 KB, PNG without alpha.

| Slot (Yer) | Device size tab in App Store Connect | File (from `tower-clash/store/screenshots/`) | What it shows |
|---|---|---|---|
| 1 | iPhone 6.9"/6.7" display (1290×2796 accepted) | `apple-6.7/en/01.png` | Title screen — "Capture every tower" |
| 2 | ″ | `apple-6.7/en/02.png` | Level 1 tutorial — "Tap, and the stream flows" |
| 3 | ″ | `apple-6.7/en/03.png` | Level 5, both stream colours — "Streams keep flowing" |
| 4 | ″ | `apple-6.7/en/04.png` | Level 24, mines and two rivals — "Mines, rocks, two rivals" |
| 5 | ″ | `apple-6.7/en/05.png` | Level 9 fortress — "Storm the fortress" |
| 6 | ″ | `apple-6.7/en/06.png` | Level 45, three enemies, wall gap — "Three enemies, one crown" |
| 7 | ″ | `apple-6.7/en/07.png` | Result, three stars — "Three-star every level" |
| 8 | ″ | `apple-6.7/en/08.png` | WEEKLY tab — "A new challenge every week" |
| 9 | ″ | `apple-6.7/en/09.png` | Level 15 citadel — "Silence the guns" |
| 10 | ″ | `apple-6.7/en/10.png` | Shop, Upgrades tab (gold prices only, no IAP visible) — "Boost your commander" |
| 1–10 | iPhone 6.5" display (1284×2778) — only if App Store Connect shows this tab as required; newer accounts see one iPhone tab and scale the rest | `apple-6.5/en/01.png` … `10.png` | same ten frames |
| — | iPad 13" (2064×2752 / 2048×2732) | **none rendered** | Required while the Xcode target has `TARGETED_DEVICE_FAMILY = "1,2"` (iPhone + iPad). Default: the Mobile Engineer sets the target to iPhone only (`TARGETED_DEVICE_FAMILY = 1`) before the review build — `STORE_LISTING.md` §2 already says "iPhone-only, recommended"; fallback: the Publisher renders an iPad set with `renderStoreShots.mjs`. Prerequisite 3 in `LAUNCH_CHECKLIST.md` §0b |

App Previews (videos): none. "Use the same screenshots for all sizes" is not needed when only the required tab is filled.

### 6.2 Text fields (Mətn sahələri), in screen order

| Field (AZ) | Limit | Value | Count |
|---|---|---|---|
| Promotional Text (Tanıtım mətni) | 170 | **Variant B (default):** `Tap, send, conquer. 50 levels of one-thumb real-time strategy: fortresses, artillery, tanks, walls, mines. Plays offline, no account.` | 133 |
| ″ | 170 | Variant A: `Tap, send, conquer. 50 levels of one-thumb real-time strategy: fortresses, artillery, tanks, walls, mines. Plays offline, no account. Ads removable.` | 148 |
| Description (Təsvir) | 4000 | **Variant B (default):** the block in §6.3 below | 3863 |
| ″ | 4000 | Variant A: `STORE_LISTING.md` §1.1 verbatim | 3984 |
| Keywords (Açar sözlər) | 100 | `tower,war,strategy,rts,capture,conquer,castle,army,offline,tap,casual,defense,attack,soldiers` — commas, no spaces | 93 |
| Support URL (Dəstək URL) | — | `https://pervincinal.github.io/InsiderTest/support.html` | live since 2026-09-28; the `[developer e-mail]` on the page must be replaced before submission (G18 / T3) |
| Marketing URL (Marketinq URL) | — | `https://pervincinal.github.io/InsiderTest/` | optional; live |
| Version (Versiya) | — | `1.0.0` | must equal `MARKETING_VERSION` of the uploaded build (it does: 1.0.0 / build 7) |
| Copyright (Müəllif hüququ) | — | `© 2026 [developer name]` — **stakeholder fills** the name (the person or company that owns the app; the same name as the developer account) | 23 with the placeholder |
| Routing App Coverage File | — | none | — |
| Game Center (Oyun mərkəzi) | — | **not enabled** | no leaderboards in 1.0 |
| App Clip, iMessage | — | none | — |
| Build (Build) → "+" | — | **1.0.0 (8)** — the first build with the real AdMob ids (`LAUNCH_CHECKLIST.md` §0c step 9); appears ≈ 15–30 min after the workflow uploads it (TestFlight → "processing" first). Build 7 serves Google test ads and stays on TestFlight | build numbers: 7 = RC with test ads (TestFlight only), 8 = 1.0.0 with real AdMob ids (this field), 9 = 1.0.1 with IAP; the Producer bumps with `npm run version:sync` |
| What's New in This Version (Bu versiyada yeniliklər) | 4000 | Not shown for the very first version. From 1.0.1 on: the EN block of the version in `RELEASE_NOTES.md` | (v1.0.0 EN block = 495 chars, ready if the field appears) |

### 6.3 Description — variant B (without in-app purchases), 3863 characters

Identical to `STORE_LISTING.md` §1.1 except four purchase phrases (listed in `STORE_LISTING.md` §2.1). Paste as is:

```
Tower Clash is a one-thumb real-time strategy game: tap one of your towers, tap a target, and a stream of soldiers starts marching — and keeps marching until you stop it. Reinforce friendly towers, overwhelm hostile ones, and when a garrison hits zero the tower is yours. Capture every enemy tower to win.

HOW IT PLAYS
• Tap a blue tower, then tap any tower it can see in a straight line: a stream of soldiers starts flowing there — and keeps flowing until you tap the target again. Walls, water and rocks block the line. Drag from tower to tower works too.
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
| Notes (Qeydlər) | **Variant B (default), 943 chars (rewritten 2026-10-03, PUB-14):** the block below. Variant A (with IAP), 878 chars: the second block |
| Attachment (Əlavə fayl) | none |

Notes — variant B (default, no purchases in this version):

```
Single-player offline game, no account or sign-in needed, so no demo account is required — all content is reachable without paying. This version contains NO in-app purchases: no products are attached to it and the purchase SDK is never configured. The shop (title screen → SHOP) shows cosmetic skins and gold upgrades only; no purchase UI is reachable — no prices, no product list, no buy or Restore Purchases button. Skins are paid with crystals and Commander upgrades with gold, both earned by playing. Ads are Google AdMob: an interstitial after some result screens (never during play, never in the first five levels) and rewarded videos only on the player's request. The app never requests App Tracking Transparency (there is no NSUserTrackingUsageDescription in Info.plist) and always requests non-personalised ads on iOS, so the IDFA is not used — App Privacy "Tracking" is answered No. The game runs offline; only ads need a connection.
```

Notes — variant A (with in-app purchases; use only when the nine products are attached to the version):

```
Single-player offline game, no account or sign-in needed, so no demo account is required — all content is reachable without paying. In-app purchases are one-time products (consumable crystal packs and non-consumable Starter Pack / Remove Ads / Premium Bundle / Premium Upgrade) handled by StoreKit through the RevenueCat SDK; "Restore Purchases" is at the bottom of the shop's Crystals and Bundles tabs (title screen → SHOP). Ads are Google AdMob: an interstitial after some result screens (never during play, never in the first five levels) and rewarded videos only on the player's request. The app never requests App Tracking Transparency (there is no NSUserTrackingUsageDescription in Info.plist) and always requests non-personalised ads on iOS, so the IDFA is not used — App Privacy "Tracking" is answered No. The game runs offline; only ads and purchases need a connection.
```

### 6.5 Version Release (Versiyanın buraxılması)

**"Manually release this version"** (Bu versiyanı əl ilə burax) — after approval the version waits at "Pending Developer Release" until the stakeholder presses *Release This Version* (`LAUNCH_CHECKLIST.md` §0b step 8; `POST_LAUNCH.md` §1 day L+14). Not "Automatically", not "Automatically after a date".

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

App Store → 1.0.0 shows **Pending Developer Release** → *Release This Version*. The store page appears within a few hours in the four countries of §3. Widening the country list (Pricing and Availability) needs no new review; a new build does (1.0.1 / build 9).

## 9. Character counts (2026-09-28; description B, review notes B and the `premium_bundle` texts re-run 2026-10-03; `[...s].length` code points; script in the Publisher's scratch, texts taken from this sheet / `STORE_LISTING.md`)

```
   11 name                              (limit 30)
   26 name fallback 1                   (limit 30)
   20 name fallback 2                   (limit 30)
   19 subtitle                          (limit 30)
  148 promo A                           (limit 170)
  133 promo B                           (limit 170)
   93 keywords                          (limit 100; no space after a comma)
 3984 description A (EN, §1.1 verbatim) (limit 4000)
 3863 description B (EN)                (limit 4000)
 3955 description A (AZ, §1.2 verbatim) (limit 4000 — Play only)
 3825 description B (AZ)                (limit 4000 — Play only)
   23 copyright (with the placeholder)
   10 SKU
  878 review notes A                    (limit 4000)
  943 review notes B                    (limit 4000)
  495 what's new EN (RELEASE_NOTES v1.0.0) (limit 4000)
   45 premium_bundle description EN      (limit 45; 1.0.1)
   45 premium_bundle description AZ      (limit 45; Play translation only)
```
