# Tower Clash — Google Play Console paste sheet (1.0.0 — the first Android build, closed test → production)

Owner: Publisher. Written 2026-10-11 (PUB-21) as the Google Play counterpart of `APP_STORE_CONNECT_SHEET.md`, for a stakeholder who has an iPhone and a computer with Claude Cowork and uses the Play Console in a **desktop browser** (play.google.com/console). Every form is listed in the order the Play Console shows it, with the final value ready to copy; English field labels as on the screen, the Azerbaijani word in parentheses is only there to match the screen (Azərbaycanca: mötərizədəki söz sahənin adıdır; mətnin özü kod blokundan olduğu kimi yapışdırılır). Sources: `STORE_LISTING.md` §1 (texts, assets), §4 (content rating facts), §6.2 (ads, advertising ID), §6.3 (Data safety), §6.5 (audience); `LAUNCH_CHECKLIST.md` §2 G1–G20; `docs/MOBILE.md` §6 (keystore, release lane, `android-release.request`); `POST_LAUNCH.md` §2 (closed test, countries); `RELEASE_NOTES.md` v1.0.0 ("What's new"). Character counts were produced by a script on 2026-10-11 and re-run on 2026-10-12 after the RU / TR listing texts were added (§9, PUB-22) — do not edit a text without re-counting.

**Build number on Play.** No Android build has been made yet (the keystore secrets G3 / G4 are missing), so the first `.aab` gets the `config.buildNumber` of `tower-clash/package.json` on the day the team makes it — **10** if it is made from build 10 (cut 2026-10-12 for TestFlight), higher if a later build comes first; Play and the App Store count separately, so the same number on both is fine. This sheet writes it as **`<N>`**; the team names the real number in the report thread with the run.

**1.0.0 on Google Play has no in-app purchases** (the Play counterpart of the App Store's variant B). The Android build is made without `RC_ANDROID_KEY`, so the purchase SDK is never configured and the shop shows only its Skins and Upgrades tabs (PUB-14) — no price, product or Restore Purchases button is reachable. Therefore: no in-app products are created in Play Console, no payments profile / merchant account is needed for 1.0.0 (MZ1, MZ5 wait for 1.0.1), the content rating answers "digital purchases: **No**", Data safety has **no Purchase history** row, and the long descriptions are the **variant-B** texts (`STORE_LISTING.md` §2.1 substitutions applied to §1.1 / §1.2). In-app purchases arrive with **1.0.1**, which takes the next free build number when it is cut; what changes then is §8.

Ads: the closed-test build may show Google's **test** ads; the build that goes to production must carry the real Android AdMob ids (`ADMOB_ANDROID_APP_ID`, `ADMOB_ANDROID_INTERSTITIAL`, `ADMOB_ANDROID_REWARDED` — `LAUNCH_CHECKLIST.md` §0c step 6, MZ7). Create those three secrets **before** the team's first Android build so that the closed-test binary is already the production binary (§5.5, ⚠ 9).

Fields marked **stakeholder fills** are personal values the team must not invent (`[developer …]` placeholders; no e-mail address, phone number or legal name is written anywhere in the repository). ⚠ marks a value the team could not verify from its sandbox (the Play Console and Google's help pages are not reachable from it); every ⚠ is listed with its reason in §7.

---

## Qısa xülasə (Azərbaycanca) — nə vaxt nə edirsən

1. **Play Console hesabı (G1, bir dəfə):** play.google.com/console → hesab növü **Personal (Şəxsi)**, 25 USD, şəxsiyyət vəsiqəsi ilə təsdiq; yeni şəxsi hesablar üçün bir Android telefonda Play Console tətbiqinə bir dəfə daxil olmaq tələb oluna bilər — ailədən/dostdan telefon kifayətdir (§1.1, ⚠ 1).
2. **Tətbiqi yarat (G2):** *Create app* — ad `Tower Clash`, dil English (United States), Game, Free (§1.2).
3. **AdMob-da Android tətbiqi + 3 sirr** (`LAUNCH_CHECKLIST.md` §0c, 6-cı addım) — ilk Android build-dən **əvvəl**, ki test build-i elə production build-i olsun.
4. **Açar sirləri (G3/G4):** `ANDROID_KEYSTORE_PASSWORD` → "parol sirrini əlavə etdim"; artefakt gələndə `ANDROID_KEYSTORE_BASE64` → "açar sirri hazırdır". Komanda build-i yığır (versionCode = həmin günkü `config.buildNumber`, 10 və ya daha böyük; vərəqdə `<N>`).
5. **App content formaları (§2):** gizlilik səhifəsi canlı olandan sonra (BUG-26) — cavablar hazırdır, sadəcə seç.
6. **Mağaza səhifəsi (§3):** EN mətnlər, sonra AZ, RU, TR tərcümələri (*Manage translations*, §3.3, §3.5, §3.6), ikon, feature graphic, hər dil üçün 8 skrinşot.
7. **Qapalı test (§4, §5.2):** artefaktdakı `.aab`-ı *Closed testing*-ə yüklə, 12+ test edənin Gmail-ini siyahıya əlavə et (15–20 tövsiyə olunur), linki iki sətirlik mesajla göndər.
8. **14 gün gözlə** (ən azı 12 nəfər testdə qalmalıdır), sonra *Apply for production* — cavabların qaralaması §4.6-dadır.
9. **İstəyə bağlı (G4b):** Play xidmət hesabı → `PLAY_SERVICE_ACCOUNT_JSON` — sonra yükləmələri komanda edir.
10. **Production (G20):** 4 ölkə (Azərbaycan, Türkiyə, Qazaxıstan, Gürcüstan) → *Start rollout to Production* — bu düyməni **yalnız sən** basırsan.

Cowork ilə: §10-dakı mətni Cowork-a yapışdır; parolları, kodları, sirləri heç vaxt çata yazma — daxil olmağı özün edirsən.

---

## 1. Account and app (G1, G2)

### 1.1 Developer account (Tərtibatçı hesabı) — play.google.com/console/signup (G1, one-time)

| Field (AZ) | Value | Notes |
|---|---|---|
| Google account (Google hesabı) | the stakeholder's own Google account — **the same one as AdMob** (`LAUNCH_CHECKLIST.md` §0c step 1) | stakeholder signs in himself / herself |
| Account type (Hesab növü) | **Yourself** / **Personal** (Şəxsi) | not "An organisation" — that needs a D-U-N-S number |
| Developer name (Tərtibatçı adı) — shown on the store page under the app name | **stakeholder fills** — the person's name or a short brand name (no "Google", no other company's mark) | can be changed later; the App Store copyright line uses the same name (`ASC_REVIEW_*`) |
| Contact e-mail / phone (Əlaqə e-poçtu / telefon) — for Google only | **stakeholder fills**; both are verified with a code | not shown publicly; the public e-mail is the store listing's (§3.1) |
| Registration fee (Qeydiyyat haqqı) | **USD 25**, one-time, card payment | **Cowork stops here** — the stakeholder pays |
| Identity verification (Şəxsiyyətin təsdiqi) | legal name and address exactly as on the ID document; upload a government ID (passport / ID card) | the payments profile created with the fee must carry the same name and address; verification takes from minutes to a few days |
| Android device verification (Android cihaz təsdiqi) | ⚠ 1 — new personal accounts may be asked to sign in once to the **Play Console app on an Android phone** | the stakeholder has no Android phone: any family member's or friend's phone is enough for this one sign-in (sign out afterwards) |
| Closed-test rule (Qapalı test qaydası) | personal accounts created after 13 Nov 2023 must run a **closed test with at least 12 testers opted in for 14 days in a row** before the Production track opens | §4; the 14 days are the calendar (`POST_LAUNCH.md` §2.1) |

### 1.2 Create app dialog (Tətbiq yarat) — Home → **Create app**

| Field (AZ) | Value | Notes |
|---|---|---|
| App name (Tətbiqin adı) | `Tower Clash` (11 / 30) | Play names are **not** unique (unlike the App Store, where the record is `Tower Clash: Tap & Conquer`), so keep the short name; it can be changed on the store listing any time. Fallback only if Play refuses it: `Tower Clash: Tap & Conquer` (26 / 30) |
| Default language (Standart dil) | **English (United States) – en-US** | Azerbaijani is added as a translation (§3.3) |
| App or game (Tətbiq, yoxsa oyun) | **Game** (Oyun) | |
| Free or paid (Pulsuz, yoxsa ödənişli) | **Free** (Pulsuz) | a free app can never become paid; in-app purchases (1.0.1) are allowed in a free app |
| Declarations — Developer Program Policies (Proqram qaydaları) | tick — "Confirm app meets the Developer Program Policies" | **stakeholder ticks** (a legal statement) |
| Declarations — US export laws (ABŞ ixrac qanunları) | tick — the app uses only the operating system's standard HTTPS | **stakeholder ticks** |
| Play App Signing terms (if shown in the dialog) | accept | at the first release Google-generated signing key is kept (§5.2) |

**Package name** `com.pervincinal.towerclash` is not typed anywhere: it is read from the first `.aab` uploaded (§5.2) and is **permanent** from then on (G2).

---

## 2. Set up your app — App content (Tətbiq məzmunu)

Where: **Dashboard → "Set up your app" → View tasks** (each task opens its form), or left menu **Monitor and improve → Policy and programs → App content** (⚠ 2: the menu names were last re-arranged by Google in 2024; the Dashboard task list always links the forms). Forms in the order the Console lists them; each ends with **Save**.

### 2.1 Privacy policy (Məxfilik siyasəti)

| Field | Value |
|---|---|
| Privacy policy URL | `https://pervincinal.github.io/InsiderTest/privacy.html` |

**Must be live first (BUG-26).** On 2026-10-11 the page is still not served: GitHub Pages is enabled, but the protected `github-pages` environment does not yet allow the working branch (`LAUNCH_CHECKLIST.md` §0b step 0, second half). Open the URL in the browser before saving — it must show the policy v2.1, and the `[developer e-mail]` placeholder on it must already be replaced (G18 / T3). Google checks the page during review and rejects a listing whose policy is unreachable or has no contact.

### 2.2 App access (Tətbiqə giriş)

**"All functionality in my app is available without any access restrictions"** (Bütün funksiyalar məhdudiyyətsiz əlçatandır). No account, no sign-in, no demo credentials; the levels unlock by playing, which the reviewer may do.

### 2.3 Ads (Reklamlar)

"Does your app contain ads?" → **Yes, my app contains ads** (Bəli). Google AdMob — an interstitial between levels (never during play, never in the first five levels) and rewarded videos the player chooses (`STORE_LISTING.md` §6.2). The store page then shows the **Contains ads** label.

### 2.4 Content rating (Məzmun reytinqi, IARC) — Start questionnaire

| Screen / question (AZ) | Answer — 1.0.0 | Why |
|---|---|---|
| E-mail address (E-poçt) — IARC sends the certificate there | **stakeholder fills** | the same mailbox as the listing contact |
| Category (Kateqoriya) | **Game** (Oyun) ⚠ 3 | IARC asks the game question set |
| Violence (Zorakılıq) — does the game contain violence? | **Yes** → only **cartoon / fantasy** violence, **mild**; no blood, no gore, no realistic violence, no dismemberment, no violence against realistic humans; nobody is hurt in a visible way ⚠ 3 | tiny stylised clay soldiers and tanks march in straight lines and vanish in a puff of particles when they meet; no injury is shown (`STORE_LISTING.md` §4) |
| Fear / horror (Qorxu) | **No** | |
| Sexuality, nudity (Cinsi məzmun) | **No** | |
| Language — profanity, crude humour (Söyüş, kobud yumor) | **No** | UI words only (PLAY, STREAMS, MENU, VICTORY) in four languages |
| Controlled substances — alcohol, tobacco, drugs (Alkoqol, tütün, narkotik) | **No** | |
| Gambling — simulated or real (Qumar) | **No** | no betting, no casino play, no contests |
| Users interact / exchange content (İstifadəçilər ünsiyyət qurur) | **No** | no chat, no multiplayer, no user content; the SHARE button only hands an image made on the device to the phone's own share sheet |
| Shares the user's location with other users (Yeri paylaşır) | **No** | the app requests no location permission |
| Digital purchases (Rəqəmsal alışlar) | **No — for 1.0.0** | no products exist in this version (see above); **1.0.1: Yes** (§8) |
| Unrestricted internet / web browser (Məhdudiyyətsiz internet) | **No** | the app has no browser; ad click-throughs open in the ad SDK / Play |
| Any other row (e.g. promotion of age-restricted products, a web browser or search engine) | **No** | |

Then **Save → Next → Submit**. Expected result: **ESRB Everyone, PEGI 3 (⚠ 3: PEGI 7 is possible if IARC counts the soldiers as "human-like characters" — acceptable, keep it), USK 0**, no interactive elements in 1.0.0 (the "Contains ads" label comes from §2.3, not from IARC). Re-answer the questionnaire for 1.0.1 (§8): only "Digital purchases" changes.

### 2.5 Target audience and content (Hədəf auditoriya)

| Question (AZ) | Answer |
|---|---|
| Target age groups (Hədəf yaş qrupları) | tick **13–15**, **16–17**, **18 and over**; leave **5 and under**, **6–8**, **9–12** unticked |
| "Could your store listing unintentionally appeal to children?" / "Appeal to children" — if shown (Uşaqları cəlb edə bilərmi?) | **No** ⚠ 4 |
| Families / Teacher Approved | not applicable — not "designed for children" |

Why 13+ (`STORE_LISTING.md` §6.5, G16): an audience under 13 would put the app in the Families programme, which requires a Families-certified ad setup, child-directed ad requests and no personalised ads — the build does not implement that. AdMob is already set to *not child-directed*, max ad content rating **G** (§0c step 4).

### 2.6 News apps (Xəbər tətbiqləri)

"Is your app a news app?" → **No** (Xeyr).

### 2.7 Data safety (Məlumat təhlükəsizliyi)

Source `STORE_LISTING.md` §6.3, adjusted for 1.0.0 without purchases: RevenueCat is never configured in this build, so its anonymous app-user id and the Purchase history row drop out; everything else is §6.3 verbatim. All data is collected and sent by **Google's AdMob SDK**; the game itself sends nothing (no analytics, no account, the share card is drawn on the device and never uploaded — §6.3 PUB-16 note).

**Step 1 — Data collection and security (Məlumat toplanması və təhlükəsizlik):**

| Question (AZ) | Answer |
|---|---|
| Does your app collect or share any of the required user data types? (Tələb olunan məlumat növlərini toplayır və ya paylaşır?) | **Yes** |
| Is all of the user data collected by your app encrypted in transit? (Ötürülmə zamanı şifrələnir?) | **Yes** (AdMob uses HTTPS) |
| Which methods of account creation does your app support? (Hesab yaratma üsulları) | **My app does not allow users to create an account** ⚠ 5 |
| Do you provide a way for users to request that their data is deleted? (Silinmə sorğusu) | **No** ⚠ 6 — default per §6.3; switch to Yes only if the stakeholder commits to answering deletion e-mails |
| Independent security review / other badges | leave empty |

**Step 2 — Data types (Məlumat növləri): tick exactly these four groups / five types:**

| Data type (AZ) | Collected (Toplanır) | Shared (Paylaşılır) | Processed ephemerally? (Müvəqqəti?) | Required or optional? (Məcburi?) | Purposes — collected and shared (Məqsəd) |
|---|---|---|---|---|---|
| Location → **Approximate location** (Təxmini yer) | Yes | Yes ⚠ 7 | **Yes** | Required | Advertising or marketing |
| App activity → **App interactions** (Tətbiqdaxili hərəkətlər) — ad impressions / clicks only | Yes | Yes ⚠ 7 | No | Required | Advertising or marketing; Analytics |
| App info and performance → **Crash logs** (Çöküş qeydləri) | Yes | Yes ⚠ 7 | No | Required | Analytics |
| App info and performance → **Diagnostics** (Diaqnostika) | Yes | Yes ⚠ 7 | No | Required | Analytics |
| **Device or other IDs** (Cihaz və digər ID-lər) — the advertising ID | Yes | Yes ⚠ 7 | No | **Required** ⚠ 8 | Advertising or marketing; Analytics; Fraud prevention, security and compliance |

Leave **unticked** (not collected in 1.0.0): Personal info (name, e-mail, user IDs, address, phone …), **Financial info → Purchase history** (1.0.1 only, §8), Financial info → payment info / credit score / other, Location → Precise location, Health and fitness, Messages, Photos and videos, Audio, Files and docs, Calendar, Contacts, App activity → In-app search history / Installed apps / Other user-generated content / Other actions, Web browsing, App info and performance → Other app performance data.

Per ticked type the Console asks the columns above one screen at a time: *"Is this data collected, shared, or both?"* → tick both; *"Is this data processed ephemerally?"* → column 4; *"Is this data required for your app, or can users choose whether it's collected?"* → column 5; *"Why is this user data collected?"* and *"Why is this user data shared?"* → the same purposes. Nothing is "linked to identity": there is no account (the Play form has no such column; it matters only for the App Store, `APP_STORE_CONNECT_SHEET.md` §4).

**Step 3 — Preview → Save → Submit.** Expected store summary, roughly: "Data shared with third parties: Location, App activity, App info and performance, Device or other IDs" · "Data collected: the same" · "Data is encrypted in transit" · no deletion line (⚠ 6). **Before submitting**, re-check Google's page "Play data disclosure requirements for the Google Mobile Ads SDK" (§6.3 asks for it on submission day; ⚠ 7).

### 2.8 Government apps (Dövlət tətbiqləri)

"Is your app developed by or on behalf of a government?" → **No**.

### 2.9 Financial features (Maliyyə funksiyaları)

Tick **"My app doesn't provide any financial features"** (Tətbiqimdə maliyyə funksiyası yoxdur). In-app purchases of game items are not "financial features" (loans, banking, crypto, payments …), not even in 1.0.1.

### 2.10 Health (Sağlamlıq)

Tick **"My app does not have any health features"** (Sağlamlıq funksiyası yoxdur) ⚠ 2 (label wording).

### 2.11 Advertising ID (Reklam ID-si)

| Question (AZ) | Answer |
|---|---|
| Does your app use advertising ID? (Reklam ID-si istifadə olunur?) | **Yes** |
| Purposes (Məqsədlər) | tick **Advertising or marketing**, **Analytics**, **Fraud prevention, security and compliance** — nothing else |

Why: the AdMob SDK merges the `com.google.android.gms.permission.AD_ID` permission into the manifest (target SDK 36), and Play rejects an upload whose manifest carries it while this form says No (`STORE_LISTING.md` §6.2).

### 2.12 Forms that should not appear — if they do

| Form | Answer | Why |
|---|---|---|
| COVID-19 contact tracing and status apps | "My app is not a publicly available COVID-19 contact tracing or status app" | |
| Photo and video permissions, Foreground service, Full-screen intent, Exact alarms, Accessibility API, Location permissions | should not be asked — the app's own manifest declares only `INTERNET`; the AdMob SDK merges its own permissions (among them `AD_ID`, §2.11). If one of these forms is asked, stop and write its name in the report thread — the Mobile Engineer checks the merged manifest of the `.aab` | the share card writes into the app's own cache through a `FileProvider`, no storage permission |

---

## 3. Store listing (Mağaza səhifəsi)

### 3.1 Store settings (Mağaza ayarları) — Grow users → Store presence → **Store settings** (⚠ 2)

| Field (AZ) | Value | Notes |
|---|---|---|
| App or game (Tətbiq/oyun) | **Game** | |
| Category (Kateqoriya) | **Strategy** (Strategiya) | `STORE_LISTING.md` §1 "Games › Strategy" |
| Tags (Teqlər) → Manage tags, up to 5 | **Strategy**, **Casual**, **Single player**, **Offline**, **Stylized** ⚠ 10 | pick the closest names the tag picker offers (`STORE_LISTING.md` §1: "Strategy, Casual, Single player, Offline, Stylised"); never a competitor's name |
| Email address (E-poçt ünvanı) — public | `yusifli.pervin@gmail.com` (G18, sent 2026-10-11) | the same address as on the privacy and support pages; not yet sent to the team |
| Phone number (Telefon) — public | leave **empty** | optional |
| Website (Veb sayt) — public | `https://pervincinal.github.io/InsiderTest/` | not live yet (BUG-26, §2.1); support page `…/support.html` |
| External marketing (Xarici marketinq) | leave the default (on) | |

### 3.2 Main store listing — English (United States), default (Əsas mağaza səhifəsi) — Grow users → Store presence → **Store listings** → Default store listing

| Field (AZ) | Limit | Value | Count |
|---|---|---|---|
| App name (Ad) | 30 | `Tower Clash` | 11 |
| Short description (Qısa təsvir) | 80 | `Capture every tower. One-thumb real-time strategy, 50 levels, plays offline.` | 76 |
| Full description (Tam təsvir) | 4000 | the block below — `STORE_LISTING.md` §1.1 with the four §2.1 variant-B substitutions; identical to `APP_STORE_CONNECT_SHEET.md` §6.3 | 3855 |

Full description EN — variant B (no purchases in 1.0.0), 3855 characters (2026-10-12, PUB-22: the stream now stops with a swipe across it — BUG-33 — instead of "until you tap the target again"; tapping the target again still works but is no longer named; 2026-10-28, PUB-34: "a one-line lesson" → "a short lesson", 3858 → 3855):

```
Tower Clash is a one-thumb real-time strategy game: tap one of your towers, tap a target, and a stream of soldiers starts marching — and keeps marching until you stop it. Reinforce friendly towers, overwhelm hostile ones, and when a garrison hits zero the tower is yours. Capture every enemy tower to win.

HOW IT PLAYS
• Tap a blue tower, then tap any tower it can see in a straight line: a stream of soldiers starts flowing there — and keeps flowing until you swipe across it. Walls, water and rocks block the line. Drag from tower to tower works too.
• Towers upgrade themselves: let one fill to 25 soldiers and it becomes level 2, at 50 level 3 (100 max). Bigger towers recruit faster and run more streams — one at level 1, two at level 2, three at level 3.
• Sending never empties a tower — it only stops growing while it streams, and bigger towers stream faster. Close the stream to let it level up.
• A tower under attack stops recruiting — answer every enemy stream, or the tower falls.
• Enemy streams are drawn as straight ribbons in their colour, so you always see where the next attack comes from — and where to answer it.

50 HAND-MADE LEVELS
• Levels 1–4 teach the basics with a short built-in tutorial; every later level opens with a short lesson.
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

### 3.3 Azerbaijani translation (Azərbaycanca tərcümə) — Store listings → Default store listing → **Manage translations** → *Add your own translation text* → **Azerbaijani – az-AZ** → Apply; then switch the language selector at the top of the listing to Azerbaijani

| Field (AZ) | Limit | Value | Count |
|---|---|---|---|
| App name (Ad) | 30 | `Tower Clash` | 11 |
| Short description (Qısa təsvir) | 80 | `Bütün qüllələri tut. Bir barmaqla real vaxt strategiya, 50 səviyyə, oflayn.` | 75 |
| Full description (Tam təsvir) | 4000 | the block below — `STORE_LISTING.md` §1.2 with the four §2.1 variant-B substitutions | 3825 |

Full description AZ — variant B, 3825 characters (2026-10-12, PUB-22: the same swipe sentence as EN; 2026-10-28, PUB-34: "bir cümləlik dərslə" → "qısa dərslə", 3833 → 3825):

```
Tower Clash bir barmaqla oynanan real vaxt strategiya oyunudur: öz qüllənə toxun, hədəfə toxun — əsgər axını yola düşür və sən dayandırana qədər davam edir. Dost qüllələri gücləndir, düşmən qüllələrini sıxışdır; qarnizon sıfıra düşəndə qüllə sənindir. Qalib gəlmək üçün bütün düşmən qüllələrini tut.

NECƏ OYNANIR
• Mavi qülləyə toxun, sonra düz xətlə gördüyü istənilən qülləyə toxun: ora əsgər axını başlayır — və sən barmağınla onun üstündən keçənə qədər davam edir. Divar, su və qaya xətti kəsir. Qüllədən qülləyə sürükləmək də işləyir.
• Qüllələr özləri təkmilləşir: biri 25 əsgərə dolsun — 2-ci səviyyə olur, 50-də 3-cü səviyyə (maksimum 100). Böyük qüllə daha sürətli əsgər yığır və daha çox axın aparır — 1-ci səviyyədə bir, 2-cidə iki, 3-cüdə üç.
• Göndərmək qülləni boşaltmır — axın verərkən yalnız böyümür, böyük qüllə daha sürətli axın verir. Səviyyəsi qalxsın istəyirsənsə axını bağla.
• Hücum altındakı qüllə əsgər yığmır — hər düşmən axınına cavab ver, yoxsa qüllə düşər.
• Düşmən axınları düz lentlərlə öz rəngində çəkilir — növbəti hücumun haradan gəldiyini və hara cavab verəcəyini həmişə görürsən.

50 ƏL İLƏ HAZIRLANMIŞ SƏVİYYƏ
• 1–4-cü səviyyələr qısa daxili təlimatla əsasları öyrədir; sonrakı hər səviyyə qısa dərslə başlayır.
• Qalalar (9-cu səviyyədən) hər hücumun yarısını dəf edir — düşündüyündən çox əsgər apar.
• Top qüllələri (12-ci səviyyədən) mənzilinə girən əsgərləri vurur — düzgün tərəfdən yaxınlaş.
• 17-ci səviyyədən eyni anda iki, 33-cü səviyyədən üç rəqib — onlar bir-biri ilə də vuruşur.
• Hücum xəttini kəsən divarlar, çaylar və qayalar, və üstündən keçən ilk əsgərləri məhv edən minalar.
• Tank zavodları (25-ci səviyyədən): tank beş əsgər ağırlığındadır, amma yavaş gedir — əvvəl onu göndər, piyada arxadan çatsın.
• 41–50-ci səviyyələr, Böyük Kampaniya: hər xəritədə üç rəqib, divar və mina, ən çətin adalar — yeni qayda yoxdur, hamısı bir yerdə.
• Hər səviyyədə üç ulduz qazan: nə qədər tez qalib gəlsən, o qədər çox ulduz. Ulduzlar növbəti səviyyəni açır və qızıl qazandırır.
• Günlük Çağırış: hər gün hamı üçün eyni səviyyə, seed və fənd — pulsuz təkrar cəhdlər, ilk qələbəyə qızıl və kristal, 3, 7 və 30 günlük qələbə seriyasına bonus kristal.
• Həftəlik Çağırış: hər bazar ertəsi kampaniyanın son hissəsindən fəndli bir səviyyə, hamı üçün eyni — ilk qələbəyə 100 qızıl, üç ulduz vaxtını keçəndə 20 kristal.

QIZIL, KRİSTAL VƏ TƏKMİLLƏŞDİRMƏLƏR
• Qızıl oyunla qazanılır — ulduzlar, təkrar oyunlar və gündəlik mükafatlar — və Overdrive (10 saniyə ×3 istehsal), Freeze (rəqiblər 5 saniyə istehsal etmir), Airstrike (bir düşmən qülləsindən −10 əsgər) və daimi Komandir təkmilləşdirmələri (istehsal, tutum, başlanğıc qarnizon, yürüş sürəti, ucuz gücləndiricilər) üçün xərclənir.
• Kristallar mərhələlərdən, nailiyyətlərdən və gündəlik sandıqdan gəlir; qüllə, dəbilqə və ada görünüşləri və ya məğlubiyyətdən sonra ikinci şans alır.
• Hər səviyyə heç nə xərcləmədən keçilə bilər — təkmilləşdirmələr qısa yoldur, tələb deyil.

ALTI ADA
• Çəmən, payız, qum, qar, vulkan və alaqaranlıq adaları — günəşli kölgələrlə yumşaq gil üslubunda.

TELEFON ÜÇÜN HAZIRLANIB
• Şaquli ekran, bir əl, hər səviyyə üç dəqiqədən qısa.
• Pauza menyusunda ×2 sürət düyməsi.
• Parametrlər: səs, rəng korluğu palitrası, azaldılmış hərəkət, dil; səssiz düyməsi birbaşa HUD-da.
• Oflayn oynanır: kampaniya üçün internet lazım deyil (reklam üçün lazımdır).

DÜRÜST OYUN
• Hesab, giriş yoxdur — irəliləyişin yalnız öz cihazında saxlanılır.
• Bu versiyada alınası heç nə yoxdur: qızıl və kristal oyunla qazanılır. Abunəlik yoxdur, loot box yoxdur.
• Səviyyələr arasında qısa reklam ən çox hər üçüncü səviyyədə, heç vaxt döyüş zamanı və heç vaxt ilk beş səviyyədə. Mükafatlı videolar həmişə sənin seçimindir.

Qeyd: menyular, işarələr, təlimat, səviyyə adları və dərslər azərbaycanca, ingiliscə, rusca və türkcədir.
```

### 3.4 Graphics (Qrafika) — on the same listing page, per language

| Asset (AZ) | Play rule | File (from the repository) | Checked 2026-10-11 |
|---|---|---|---|
| App icon (Tətbiq ikonu) | 512×512 PNG, 32-bit, ≤ 1 MB | `tower-clash/public/icons/icon-512.png` | 512×512, RGBA (every pixel opaque), 177 KB — new icon 2026-10-11 (ART-18) |
| Feature graphic (Əsas qrafika) | 1024×500 PNG / JPEG, no alpha, ≤ 15 MB | `tower-clash/store/feature-graphic.png` — one file for every language (a translation without its own feature graphic shows this one) | 1024×500, RGB, 117 KB (the Tech Artist re-renders it on 2026-10-12, ART-19 — take the file as it is on the branch on upload day) |
| Phone screenshots — English (Telefon skrinşotları) | 2–8, PNG / JPEG ≤ 8 MB, 9:16, each side 320–3840 px | `tower-clash/store/screenshots/en/01.png` … `08.png` — upload in file order | 8 files, 1080×1920, RGB, 391–529 KB; re-cut 2026-10-15 on the build-16 look (PUB-24: zoomed flat view; ART-19 re-cut of 2026-10-13 replaced); 04 / 06 re-cut 2026-10-17 (PUB-25: ART-26 mine-glyph tags beside the mines, build 17); 02 / 07 re-cut 2026-10-19 (PUB-28, build 19: the level-1 bubble beside the home tower, the level-9 result card "2 under 01:00"); 03 re-cut 2026-10-21 (PUB-30, build 21: level 5's four grey towers at their LV-22 places), other frames unchanged |
| Phone screenshots — Azerbaijani translation | same | `tower-clash/store/screenshots/az/01.png` … `08.png` (Azerbaijani captions *and* Azerbaijani in-game UI) | 8 files, 1080×1920, RGB, 386–525 KB; PUB-24 re-cut 2026-10-15; 04 / 06 re-cut 2026-10-17 (PUB-25, ART-26 mine tags); 02 / 07 re-cut 2026-10-19 (PUB-28, build 19); 03 re-cut 2026-10-21 (PUB-30, build 21, LV-22) |
| Phone screenshots — Russian translation (§3.5) | same | `tower-clash/store/screenshots/ru/01.png` … `08.png` (Russian captions and in-game UI) | 8 files, 1080×1920, RGB, 391–528 KB; PUB-24 re-cut 2026-10-15; 04 / 06 re-cut 2026-10-17 (PUB-25, ART-26 mine tags); 02 / 07 re-cut 2026-10-19 (PUB-28, build 19); 03 re-cut 2026-10-21 (PUB-30, build 21, LV-22) |
| Phone screenshots — Turkish translation (§3.6) | same | `tower-clash/store/screenshots/tr/01.png` … `08.png` (Turkish captions and in-game UI) | 8 files, 1080×1920, RGB, 388–527 KB; PUB-24 re-cut 2026-10-15; 04 / 06 re-cut 2026-10-17 (PUB-25, ART-26 mine tags); 02 / 07 re-cut 2026-10-19 (PUB-28, build 19); 03 re-cut 2026-10-21 (PUB-30, build 21, LV-22) |
| 7-inch / 10-inch tablet, Chromebook, Android XR screenshots | optional | **none** — phone-only listing (G11) | |
| Video (YouTube URL) | optional | **none** | |

What the eight frames show (`STORE_LISTING.md` §1.3): 01 title "Capture every tower" · 02 level 1 tutorial · 03 level 5, both stream colours, soldiers walking, a capture burst · 04 level 24, mines and two rivals · 05 level 9 fortress · 06 level 45, three enemies · 07 three-star result with SHARE · 08 WEEKLY tab. If a translation is saved without its own screenshots, Play shows the English ones — upload the `az/`, `ru/` and `tr/` sets to their translations. The four sets are the 2026-10-13 render (ART-19 re-cut, after FE-11 / FE-12 / ART-20 / ART-21 / ART-22 / ART-23): walking soldiers, the perspective play camera, lit towers and capture bursts; no frame shows a stream being stopped.

### 3.5 Russian translation (Rusca tərcümə) — Store listings → Default store listing → **Manage translations** → *Add your own translation text* → **Russian – ru-RU** → Apply; then switch the language selector at the top of the listing to Russian

Written 2026-10-12 (PUB-22) from the variant-B EN text of §3.2 — the same facts, no others; not word-for-word. Game words follow the Russian in-game UI (`src/ui/locales/ru.ts`): уровень, башня, поток, Ежедневный / Недельный вызов, Ускорение / Заморозка / Авиаудар, облики, прокачка, командир.

| Field (AZ) | Limit | Value | Count |
|---|---|---|---|
| App name (Ad) | 30 | `Tower Clash` | 11 |
| Short description (Qısa təsvir) | 80 | `Захвати все башни. Стратегия в реальном времени одним пальцем: 50 уровней офлайн` | 80 |
| Full description (Tam təsvir) | 4000 | the block below | 3972 |

Full description RU — variant B (no purchases in 1.0.0), 3972 characters (2026-10-28, PUB-34: "с урока в одну строку" → "с короткого урока", 3976 → 3972):

```
Tower Clash — стратегия в реальном времени для одного пальца: нажми на свою башню, затем на цель — и туда двинется поток солдат, который не прервётся, пока ты его не остановишь. Подкрепляй свои башни, задавливай чужие: как только гарнизон падает до нуля, башня твоя. Захвати все вражеские башни, чтобы победить.

КАК ИГРАТЬ
• Нажми на синюю башню, затем на любую башню, которую она видит по прямой: туда пойдёт поток солдат — и будет идти, пока ты не проведёшь пальцем поперёк него. Стены, вода и скалы перекрывают линию. Можно и протянуть палец от башни к башне.
• Башни растут сами: наполни башню до 25 солдат — она станет второго уровня, до 50 — третьего (максимум 100). Чем выше уровень, тем быстрее башня набирает солдат и тем больше ведёт потоков: один, два или три.
• Поток никогда не опустошает башню — пока он идёт, башня просто не растёт, а большие башни шлют быстрее. Останови поток, чтобы башня смогла подняться в уровне.
• Башня под атакой не набирает солдат — отвечай на каждый вражеский поток, иначе башню захватят.
• Вражеские потоки видны как прямые ленты их цвета: всегда ясно, откуда идёт следующая атака и куда бить в ответ.

50 УРОВНЕЙ РУЧНОЙ РАБОТЫ
• Уровни 1–4 учат основам в коротком встроенном обучении; каждый следующий уровень начинается с короткого урока.
• Крепости (с 9-го уровня) отражают половину любой атаки — бери солдат с запасом.
• Артиллерия (с 12-го уровня) расстреливает солдат, вошедших в зону огня, — заходи с правильной стороны.
• С 17-го уровня против тебя сразу два соперника, с 33-го — три, и они воюют ещё и друг с другом.
• Стены, реки и скалы, закрывающие линию атаки, и мины, которые уничтожают первых прошедших по ним солдат.
• Танковые заводы (с 25-го уровня): танк весит как пять солдат, но ползёт медленно — пусти его первым, а пехота догонит.
• Уровни 41–50, Большая кампания: три противника, стены и мины на каждой карте, самые трудные острова — новых правил нет, зато все сразу.
• На каждом уровне можно взять три звезды: чем быстрее победа, тем больше звёзд. Звёзды открывают следующий уровень и приносят золото.
• Ежедневный вызов: каждый день один уровень с особым условием, одинаковый для всех, — бесплатные попытки, золото и кристаллы за первую победу, бонусные кристаллы за серию из 3, 7 и 30 дней.
• Недельный вызов: каждый понедельник уровень из поздней кампании с особым условием, общий для всех, — 100 золота за первую победу и 20 кристаллов, если уложишься во время на три звезды.

ЗОЛОТО, КРИСТАЛЛЫ И ПРОКАЧКА
• Золото зарабатывается игрой — звёзды, повторные прохождения, ежедневные награды — и тратится на Ускорение (×3 производство на 10 с), Заморозку (враги не производят 5 с), Авиаудар (−10 солдат в одной вражеской башне) и постоянную прокачку командира (производство, вместимость, стартовый гарнизон, скорость марша, скидка на усилители).
• Кристаллы дают за вехи, достижения и ежедневный сундук; на них покупают облики башен, шлемов и островов или второй шанс после поражения.
• Любой уровень можно пройти, ничего не тратя: прокачка — короткий путь, а не обязательное условие.

ШЕСТЬ ОСТРОВОВ
• Зелёный, осенний, песчаный, снежный, вулканический и сумеречный острова в мягком «пластилиновом» стиле с солнечными тенями.

СДЕЛАНО ДЛЯ ТЕЛЕФОНА
• Вертикальный экран, одна рука, каждый уровень короче трёх минут.
• В меню паузы — скорость ×2, когда победа уже в кармане.
• Настройки: звук, палитра для дальтоников, меньше анимации, язык; кнопка звука прямо на игровом экране.
• Играй без интернета: кампании сеть не нужна (рекламе — нужна).

ЧЕСТНАЯ ИГРА
• Без аккаунта и входа — прогресс хранится только на твоём устройстве.
• В этой версии ничего не продаётся: золото и кристаллы зарабатываются игрой. Без подписок и лутбоксов.
• Короткая реклама между уровнями — не чаще чем раз в три уровня, никогда во время боя и никогда в первых пяти уровнях. Видео за награду — только по твоему желанию.

Меню, подсказки, обучение, названия уровней и уроки — на русском, английском, азербайджанском и турецком.
```

### 3.6 Turkish translation (Türkcə tərcümə) — Store listings → Default store listing → **Manage translations** → *Add your own translation text* → **Turkish – tr-TR** → Apply; then switch the language selector at the top of the listing to Turkish

Written 2026-10-12 (PUB-22) from the variant-B EN text of §3.2 — the same facts, no others; not word-for-word. Game words follow the Turkish in-game UI (`src/ui/locales/tr.ts`): bölüm (a level of the campaign), seviye (a tower's level), kule, akış, Günlük / Haftalık Meydan Okuma, Hızlandırma / Dondurma / Hava Saldırısı, görünüm, Komutan.

| Field (AZ) | Limit | Value | Count |
|---|---|---|---|
| App name (Ad) | 30 | `Tower Clash` | 11 |
| Short description (Qısa təsvir) | 80 | `Tüm kuleleri fethet. Tek parmakla gerçek zamanlı strateji, 50 bölüm, çevrimdışı.` | 80 |
| Full description (Tam təsvir) | 4000 | the block below | 3951 |

Full description TR — variant B (no purchases in 1.0.0), 3951 characters (2026-10-28, PUB-34: "tek cümlelik bir dersle" → "kısa bir dersle", 3959 → 3951):

```
Tower Clash, tek parmakla oynanan gerçek zamanlı bir strateji oyunu: kulelerinden birine dokun, bir hedefe dokun — asker akışı yola çıkar ve sen durdurana kadar sürer. Dost kuleleri güçlendir, düşman kulelerini bunalt; garnizon sıfıra indiğinde kule senindir. Kazanmak için bütün düşman kulelerini ele geçir.

NASIL OYNANIR
• Mavi bir kuleye, sonra onun düz bir hatta gördüğü herhangi bir kuleye dokun: oraya asker akışı başlar — ve parmağını üzerinden geçirene kadar sürer. Duvarlar, su ve kayalar hattı keser. Kuleden kuleye parmağını sürüklemek de işe yarar.
• Kuleler kendiliğinden yükselir: 25 askere dolan kule 2. seviyeye, 50'ye dolan 3. seviyeye çıkar (en fazla 100). Büyük kule daha hızlı asker toplar ve daha çok akış yürütür: 1. seviyede bir, 2. seviyede iki, 3. seviyede üç.
• Göndermek kuleyi asla boşaltmaz — akış sürerken kule yalnızca büyümez; büyük kuleler daha hızlı akış verir. Seviye atlasın istiyorsan akışı kapat.
• Saldırı altındaki kule asker toplamaz — her düşman akışına cevap ver, yoksa kule düşer.
• Düşman akışları kendi renklerinde düz şeritler olarak çizilir: bir sonraki saldırının nereden geldiğini ve nereye karşılık vereceğini hep görürsün.

50 EL YAPIMI BÖLÜM
• 1–4. bölümler kısa bir eğitimle temelleri öğretir; sonraki her bölüm kısa bir dersle açılır.
• Kaleler (9. bölümden itibaren) her saldırının yarısını savuşturur — sandığından fazla asker götür.
• Toplar (12. bölümden itibaren) menzillerine giren askerleri vurur — doğru taraftan yaklaş.
• 17. bölümden itibaren aynı anda iki, 33. bölümden itibaren üç rakip — üstelik birbirleriyle de savaşırlar.
• Saldırı hattını kesen duvarlar, nehirler ve kayalar; üzerinden geçen ilk askerleri yok eden mayınlar.
• Tank fabrikaları (25. bölümden itibaren): bir tank beş asker ağırlığındadır ama ağır ilerler — önce onu gönder, piyade arkadan yetişsin.
• 41–50. bölümler, Büyük Sefer: her haritada üç rakip, duvar ve mayın, en zorlu adalar — yeni kural yok, hepsi bir arada.
• Her bölümde üç yıldız topla: ne kadar hızlı kazanırsan o kadar çok yıldız. Yıldızlar sonraki bölümü açar ve altın kazandırır.
• Günlük Meydan Okuma: her gün herkes için aynı bölüm ve aynı özel kural — ücretsiz tekrar denemeler, ilk zafere altın ve kristal, 3, 7 ve 30 günlük galibiyet serisine bonus kristal.
• Haftalık Meydan Okuma: her pazartesi seferin son kısmından özel kurallı bir bölüm, herkes için aynı — ilk zafere 100 altın, üç yıldız süresinin altında bitirirsen 20 kristal.

ALTIN, KRİSTAL VE YÜKSELTMELER
• Altın oynayarak kazanılır — yıldızlar, tekrar oyunlar ve günlük ödüller — ve Hızlandırma (10 sn boyunca ×3 üretim), Dondurma (rakipler 5 sn üretim yapamaz), Hava Saldırısı (bir düşman kulesinden −10 asker) ile kalıcı Komutan yükseltmelerine (üretim, kapasite, başlangıç garnizonu, yürüyüş hızı, daha ucuz güçlendiriciler) harcanır.
• Kristaller hedeflerden, başarımlardan ve günlük sandıktan gelir; onlarla kule, miğfer ve ada görünümleri ya da yenilgiden sonra ikinci bir şans alınır.
• Her bölüm hiçbir şey harcamadan geçilebilir — yükseltmeler kestirme yoldur, zorunluluk değil.

ALTI ADA
• Çimen, sonbahar, kum, kar, volkan ve alacakaranlık adaları; güneşli gölgelerle yumuşak bir kil tarzında.

TELEFON İÇİN TASARLANDI
• Dikey ekran, tek el, her bölüm üç dakikadan kısa.
• Duraklatma menüsünde ×2 hız düğmesi — zafer zaten cebindeyse.
• Ayarlar: ses, renk körlüğü paleti, azaltılmış hareket, dil; sessiz düğmesi doğrudan oyun ekranında.
• Çevrimdışı oynanır: sefer için internet gerekmez (reklamlar için gerekir).

DÜRÜST TASARIM
• Hesap yok, giriş yok — ilerlemen yalnızca kendi cihazında saklanır.
• Bu sürümde satın alınacak bir şey yok: altın ve kristal oynayarak kazanılır. Abonelik yok, ganimet kutusu yok.
• Bölümler arasında kısa bir reklam en fazla üç bölümde bir çıkar; asla savaş sırasında, asla ilk beş bölümde değil. Ödüllü videolar her zaman senin tercihin.

Menüler, ipuçları, eğitim, bölüm adları ve dersler Türkçe, İngilizce, Azerbaycanca ve Rusça.
```

Russian- and Turkish-language phones see these translations; phones in any other language see the English default. Screenshots for both are in §3.4.

---

## 4. Testing → Closed testing (Qapalı test, G19)

### 4.1 Set up the track (Treki qur) — Test and release → Testing → **Closed testing** → the track **Closed testing - Alpha** → **Manage track**

| Tab / field (AZ) | Value | Notes |
|---|---|---|
| Countries / regions (Ölkələr) → Add countries / regions | **Azerbaijan, Türkiye, Kazakhstan, Georgia** + the country of any tester who lives elsewhere | a tester outside the track's countries cannot install |
| Testers (Test edənlər) → **Email lists** → *Create email list* | list name `Tower Clash testers`; add the testers' **Google (Gmail) addresses**, comma-separated or one per line → **Save changes** → tick the list → **Save** | **stakeholder fills** the addresses (they never go into the repository); invite **15–20** people so that 12 stay opted in for 14 days |
| — alternative: **Google Groups** | create a group at groups.google.com (e.g. `tower-clash-testers@googlegroups.com`), let people join, add only the group address under *Google Groups* | easier when testers change; the people must join the group with the same Google account they use on the phone |
| Feedback URL or email address (Rəy ünvanı) | `yusifli.pervin@gmail.com` | testers see it on the opt-in page |
| How testers join your test → **Copy link** | the opt-in link `https://play.google.com/apps/testing/com.pervincinal.towerclash` (shown after the first release is saved) | the link only works for the addresses on the list |

Also add the same addresses under **Setup → License testing** only for 1.0.1 (purchases free for testers, MZ5) — not needed in 1.0.0.

### 4.2 The release on the track (Trekdə buraxılış)

The `.aab` from the team's build goes straight into this track — click path in §5.2 (by hand) or §5.3 (team, with the service account). The **first** closed-testing release is reviewed by Google before testers can install it (hours to a few days for a new account ⚠ 12).

### 4.3 What a tester does (Test edən nə edir) — on an Android phone

1. Opens the opt-in link **signed in with the Google account whose address is on the list** (Chrome on the phone, or a computer browser with the same account).
2. Presses **Become a tester** (Test edən ol).
3. Taps **download it on Google Play** → **Install**. Updates come through Play like any app.
4. Stays in the test for at least 14 days (leaving = *Leave the program* on the same page; that breaks the clock if fewer than 12 remain).

### 4.4 What to tell the testers (Test edənlərə mesaj) — two lines, Azerbaijani; replace `[opt-in link]`

```
Salam! Oyunum Tower Clash Google Play-də qapalı testdədir: Android telefonda mənə verdiyin Gmail ilə bu linki aç, "Become a tester" düyməsini bas, sonra Play-dən quraşdır: [opt-in link]
Xahiş: 14 gün testdən çıxma, oyunu bir neçə gün aç, gördüyün xətanı və fikrini mənə yaz.
```

(185 + 88 characters.) Testers' remarks go to the stakeholder; paste them into the report thread — the team turns them into backlog items and the §4.6 answers.

### 4.5 The 14-day clock (14 günlük saat)

The Dashboard shows a card for production access with the number of **opted-in** testers and the days counted. It runs while **at least 12 testers are opted in**, and needs **14 days in a row**; invited-but-not-joined people do not count. Google expects the testers to actually open the app during the test ⚠ 13. Earliest production date = first day with 12 opted in + 14 days + Google's answer to the application (§4.6) — `POST_LAUNCH.md` §1 "L+14".

### 4.6 Apply for production (Production-a müraciət) — Dashboard → **Apply for production** (after day 14)

A three-part questionnaire (⚠ 14: the question wording and limits are from Google's announcement, not seen from the sandbox; if the Console asks for more text, add detail, never invent it). **Fill every `[...]` with what really happened** — Google compares the answers with the test's statistics. Drafts:

| # | Question (AZ) | Draft answer | Count |
|---|---|---|---|
| 1 | How did you recruit users for your closed test? (Test edənləri necə topladınız?) | `Friends, family members and colleagues of the developer in Azerbaijan who use Android phones. They were invited by e-mail through a Google Play e-mail list and joined with the opt-in link; [N] testers opted in.` | 210 |
| 2 | How easy was it to recruit testers? (Nə qədər asan idi?) | **stakeholder picks** from the list (Very easy … Very difficult) — honest choice | — |
| 3 | Describe the engagement you received from testers (Test edənlərin fəallığı) | `Testers installed the game from the closed track and played the campaign, the Daily Challenge and the Weekly Challenge during the 14 days. [Fill in: about how many played on several days and how far they got, e.g. "About N of the M testers played on most days; most reached level X".]` | 284 |
| 4 | Summary of the feedback and how you collected it (Rəylərin xülasəsi) | `Feedback was collected in a private chat with the testers, by e-mail and through Google Play's private tester feedback. Main points: [fill in the two to four main points, e.g. a level that felt too hard, a text that was unclear, a device that ran slowly].` | 255 |
| 5 | Who is the intended audience of your app? (Hədəf auditoriya) | `Players aged 13 and over who like short, casual strategy games on a phone. The game and its store listing are in English, Azerbaijani, Russian and Turkish; the first release goes to Azerbaijan, Türkiye, Kazakhstan and Georgia.` | 226 |
| 6 | How does your app provide value to users? (İstifadəçiyə nə verir?) | `Tower Clash is a single-player real-time strategy game played with one thumb: 50 hand-made levels of under three minutes each, Daily and Weekly Challenges, no account, plays offline. It is free; a short ad shows at most every third level, never during a battle; rewarded videos are optional.` | 291 |
| 7 | How many installs do you expect in the first year? (İlk il üçün gözlənilən yükləmə) | **0 – 10K** | — |
| 8 | What changes did you make based on the closed test? (Testdən sonra nə dəyişdi?) | `[Fill in from the team's list of closed-test fixes in the daily report, e.g. "We fixed …, made level X easier and clarified …".] If nothing needed changing: "Testers reported no crashes or blocking problems, so the build stayed the same apart from small text fixes."` | 266 |
| 9 | How did you decide that your app is ready for production? (Hazır olduğuna necə qərar verdiniz?) | `Every build passes our automated checks (more than 1,200 unit tests, end-to-end tests and an automatic playtest that wins all 50 levels). During the closed test Android vitals showed [no / N] crashes and ANRs, and testers finished the tutorial and played the challenges without help.` | 283 |

Answer 5 names the listing languages of 1.0.0 — all four since 2026-10-12 (§3.2, §3.3, §3.5, §3.6); if a translation is not saved when the application is sent, drop that language from the sentence. Answer 9's numbers: 1286 unit tests, 50/50 playtest on 2026-10-10 (`reports/2026-10-10.md`). **Submit** is the stakeholder's click (a declaration); Google answers usually within days ⚠ 14, after which **Production** opens.

---

## 5. Release flow with the team (Komanda ilə buraxılış)

### 5.1 Who starts a build (Build-i kim başladır)

Nobody presses *Run workflow*. The team commits `tower-clash/release/android-release.request` (`track=` internal / closed / production, `status=` draft / completed, `note=`, a new `requested=` UTC time) on `claude/tower-war-game-plan-weqwpb`; the push starts `tower-clash-android-release.yml`, which builds and signs **1.0.0 (versionCode `<N>`)** from `package.json` (`docs/MOBILE.md` §6 "How to run it", MM-13). Preconditions the stakeholder provides: G1 + G2 (§1), the Android AdMob secrets (§0c step 6), `ANDROID_KEYSTORE_PASSWORD` + `ANDROID_KEYSTORE_BASE64` ("açar sirri hazırdır", G3 / G4). About 15–20 minutes later the team posts the run result in the report thread.

| `PLAY_SERVICE_ACCOUNT_JSON` (G4b) | What the team requests | What the stakeholder does |
|---|---|---|
| **absent** (today) | `track=internal`, `status=draft` → the run summary says **Play upload: SKIPPED** and names the artifact **`tower-clash-android-1.0.0-<N>-aab`** (kept 90 days). A `closed` / `production` request without the secret stops before building | uploads the `.aab` by hand — §5.2 — straight into **Closed testing** |
| **present** (only after the first manual upload — Google's API cannot create an app's first release) | `track=closed` (or `production`), `status=draft` | opens the draft → **Review release** → **Start rollout to Closed testing** (production: §5.5) |

### 5.2 Manual upload — exact clicks (Əl ilə yükləmə), computer browser

1. **Download:** github.com/pervincinal/InsiderTest → **Actions** → **tower-clash-android-release** → the run the team named → bottom of the page, **Artifacts** → **`tower-clash-android-1.0.0-<N>-aab`** → a `.zip` downloads → unzip → **`tower-clash-1.0.0-<N>.aab`**. (Not the `-apk` artifact: Play wants the `.aab`.)
2. play.google.com/console → **Tower Clash** → left menu **Test and release** → **Testing** → **Closed testing** → track **Closed testing - Alpha** → **Create new release** (Yeni buraxılış yarat).
3. **First release only — App integrity / Play App Signing:** keep **"Use Google-generated key"** (the default) → **Next / Continue**. Google keeps the app signing key; our keystore is only the upload key (`docs/MOBILE.md` §6, "Why a CI-generated key is acceptable").
4. **App bundles → Upload** → pick `tower-clash-1.0.0-<N>.aab`. Play reads the package name `com.pervincinal.towerclash` (permanent from now on), version **1.0.0**, code **`<N>`**.
5. **Release name** (Buraxılışın adı): `1.0.0 (<N>)`, e.g. `1.0.0 (10)` (Play pre-fills `<N> (1.0.0)` — either is fine; the sheet's form matches the App Store).
6. **Release notes** (Buraxılış qeydləri): paste the block of §5.4 as it is (with the language tags).
7. **Next** → the review screen lists errors (must be fixed — paste the text in the report thread) and warnings (usually fine; e.g. "no deobfuscation file" is expected) → **Save**.
8. **Publishing overview** (left menu) → **Send changes for review** (Dəyişiklikləri rəyə göndər) ⚠ 15. The closed track goes live for the testers when Google approves it.

Later builds: the same steps 1–2 and 4–8 (no step 3). For **production** the same `.aab` is not uploaded again — it is taken from the library (§5.5). Every new upload needs a higher versionCode (`config.buildNumber` + `npm run version:sync`, the Producer's call).

### 5.3 With the service account (Xidmət hesabı ilə) — after G4b

Click path for the secret: `LAUNCH_CHECKLIST.md` G4b and §0 step 4 (AZ, steps a–f), `docs/MOBILE.md` §6 "Automatic upload". Then the team requests `track=closed` / `production` itself; a `draft` waits in the Console (**Test and release** → the track → the draft release → **Review release** → **Start rollout to …**). `status=completed` is used for testing tracks only after the app's first rollout, and for production **only** after the stakeholder's written go-ahead in the chat, named in the request's `note` (G20).

### 5.4 Release name and notes (Buraxılışın adı və qeydləri)

Release name: `1.0.0 (<N>)` — `1.0.0 (10)` is 10 characters (limit 50). Release notes: `RELEASE_NOTES.md` v1.0.0 "What's new" (rewritten 2026-10-15, PUB-23, for the final 1.0.0 look), EN 472 / AZ 467 / RU 486 / TR 461 characters (limit **500 per language**). Paste this whole block into the single *Release notes* box — Play splits it by the tags:

```
<en-US>
The first release of Tower Clash. Tap one of your towers, tap a target, and soldiers march in a steady stream until you swipe across it. Capture every enemy tower; a full tower of yours that streams onward passes your soldiers on. 50 hand-made levels on six islands with fortresses, artillery, tanks, walls, mines and up to three enemies. Walking soldiers, island light and capture effects. Daily and Weekly Challenges with streaks. No account; the campaign plays offline.
</en-US>
<az-AZ>
Tower Clash-ın ilk buraxılışı. Öz qüllənə, sonra hədəfə toxun — əsgərlər fasiləsiz axınla yürüyür, sən barmağınla onun üstündən keçənə qədər. Bütün düşmən qüllələrini ələ keçir; irəli axın verən dolu qüllən əsgərlərini ötürür. Altı adada 50 əl ilə hazırlanmış səviyyə: qalalar, artilleriya, tanklar, divarlar, minalar və üçə qədər rəqib. Yeriyən əsgərlər, ada işığı və ələ keçirmə effektləri. Günlük və Həftəlik Çağırış, seriyalar. Hesabsız; kampaniya oflayn oynanır.
</az-AZ>
<ru-RU>
Первый выпуск Tower Clash. Нажми на свою башню, затем на цель — солдаты идут непрерывным потоком, пока ты не проведёшь пальцем поперёк него. Захвати все вражеские башни; твоя полная башня, которая шлёт поток дальше, передаёт солдат по цепочке. 50 уровней ручной работы на шести островах: крепости, артиллерия, танки, стены, мины и до трёх противников. Шагающие солдаты, свет на островах и эффекты захвата. Ежедневный и недельный вызовы с сериями. Без аккаунта; кампания работает офлайн.
</ru-RU>
<tr-TR>
Tower Clash'in ilk sürümü. Kulelerinden birine, sonra bir hedefe dokun — askerler kesintisiz bir akışla yürür, sen parmağını üzerinden geçirene kadar. Tüm düşman kulelerini ele geçir; ileri akış veren dolu kulen askerlerini aktarır. Altı adada 50 el yapımı bölüm: kaleler, topçu, tanklar, duvarlar, mayınlar ve en fazla üç rakip. Yürüyen askerler, ada ışığı ve ele geçirme efektleri. Günlük ve Haftalık Meydan Okuma, seriler. Hesapsız; sefer çevrimdışı oynanır.
</tr-TR>
```

All four blocks are `RELEASE_NOTES.md` v1.0.0 verbatim (RU 486 / TR 461); paste the four-language block only after the RU and TR translations of §3.5 / §3.6 are saved; if one of them is not saved yet, delete its `<ru-RU>` / `<tr-TR>` block from the box first (⚠ 11). They describe the swipe that stops a stream, the supply line through a full own tower, walking soldiers and the island light — upload a build of 1.0.0 build 16 or later (the earlier builds have none of these). Re-checked 2026-10-18 for build 18 (PUB-26): unchanged and still true (team colours and the level 2–4 tutorial are not named; counts re-run, EN 472 / AZ 467 / RU 486 / TR 461).

### 5.5 Production (G20) — only after §4.6 is approved

1. **Test and release → Production → Countries / regions** (Ölkələr / regionlar) → **Add countries / regions** → tick **Azerbaijan**, **Türkiye**, **Kazakhstan**, **Georgia** (`POST_LAUNCH.md` §2.2 soft launch; all countries is the week-4 decision, L+28) → **Add** → confirm.
2. **Production → Create new release** → **Add from library** → select **`<N>` (1.0.0)** → **Add to release**. (Only if that build carries the real Android AdMob ids — the run log of the build says `VITE_ADMOB_ANDROID_INTERSTITIAL: set`; otherwise the team makes a new build first, ⚠ 9.)
3. Release name `1.0.0 (<N>)`, release notes = §5.4 → **Next** → **Save**.
4. **Rollout:** the first production release goes to **100 %** inside the four countries (a staged-rollout percentage, if offered, = 100).
5. **Publishing overview → Send changes for review** → after approval **Start rollout to Production** (Production-a buraxılışa başla). **This click is the stakeholder's only — never Cowork's, never the team's without a written go-ahead.** Optional, like the App Store's "Manually release": turn on **Publishing overview → Managed publishing** just before step 5, so that approved changes wait for the stakeholder's **Publish changes**.

After the release: AdMob → Apps → Tower Clash (Android) → *App settings* → link the Play listing (`LAUNCH_CHECKLIST.md` §0c step 11; the name on Play is `Tower Clash`).

---

## 6. Status of the prerequisites on 2026-10-12

| Item | Status |
|---|---|
| G1 Play Console account, G2 app record | needs stakeholder |
| Android AdMob app + `ADMOB_ANDROID_*` secrets (§0c step 6) | needs stakeholder (before the first Android build) |
| G3 / G4 keystore secrets | needs stakeholder ("parol sirrini əlavə etdim", "açar sirri hazırdır") |
| G4b `PLAY_SERVICE_ACCOUNT_JSON` | optional; needs stakeholder after the first manual upload |
| Privacy URL live (BUG-26) and `[developer e-mail]` (G18) | needs stakeholder: the `github-pages` environment branch rule and the e-mail / name line |
| Texts, counts, assets (this sheet) | done (Publisher, 2026-10-11; RU / TR translations and the swipe sentence 2026-10-12, PUB-22) |
| Release lane (`android-release.request`) | done (Mobile Engineer, MM-13); first real run waits on G4 |

## 7. ⚠ Items the team could not verify (reason, and what to do)

1. **Android device verification** for new personal accounts — Google added a step that asks a new developer to sign in once to the Play Console app on an Android phone; whether it applies to this account is decided by Google at sign-up. The stakeholder has no Android phone: borrow one for that sign-in.
2. **Menu and label names** (Test and release, Monitor and improve → Policy and programs → App content, Grow users → Store presence, the Health form's label) — Google renamed the Console's menus in 2024 and may again; the Dashboard's "Set up your app" list always links each form. The answers do not depend on the labels.
3. **IARC question wording and the PEGI result** — the questionnaire's sub-questions on violence differ by category and change over time; the facts to answer with are `STORE_LISTING.md` §4 (cartoon, mild, no blood). PEGI may come out 7 instead of 3 if the soldiers count as human-like characters; both are fine for the listing.
4. **"Appeal to children"** — Google may judge the soft clay style as appealing to children even with a 13+ audience and then ask for changes; the team's answer is No (a strategy game with ads, no child-directed features). If Google disagrees, paste its message in the report thread.
5. **Account-creation question** in Data safety — newer forms ask it; older ones do not. If it is not shown, skip it.
6. **Data deletion = No** — `STORE_LISTING.md` §6.3's default. In 1.0.0 the developer holds no user data at all (no account, no RevenueCat); the advertising data sits with Google and is reset from Android's own settings (privacy policy B.2 / B.7). Switch to Yes only if the stakeholder commits to answering deletion e-mails.
7. **"Shared" and the AdMob rows** — §6.3 marks every AdMob type as shared (and location as ephemeral); Google's "Play data disclosure requirements for the Google Mobile Ads SDK" page decides whether transfers to Google count as sharing and which purposes apply. The sandbox cannot fetch it: read it on submission day and follow it where it differs.
8. **Device or other IDs = Required** — Play calls a type optional only when the user can refuse it *inside the app*; the UMP consent form switches ad personalisation, not the collection of the advertising ID, so Required is the honest answer.
9. **AdMob ids in the closed-test build** — if the first Android build is made before the `ADMOB_ANDROID_*` secrets exist, it shows Google test ads and must not be promoted to production; a new build with the ids then needs a higher versionCode. No number is reserved for that or for anything else: 1.0.1 (purchases) takes the next free build number when it is cut (`RELEASE_NOTES.md` "Build numbers"). Avoid the extra build by adding the AdMob secrets first (summary step 3); otherwise the Producer raises `config.buildNumber` for the rebuild.
10. **Tag names** — the picker's list is Google's; "Stylized" is the US spelling of the listing's "Stylised". If a tag is missing, leave it out.
11. **RU / TR translations and the release-notes box** — done 2026-10-12 (PUB-22): §3.5 / §3.6 carry the texts, §3.4 the screenshot sets, §5.4 the `<ru-RU>` / `<tr-TR>` blocks. Not verified from the sandbox: whether Play refuses or silently drops a release-notes block for a language that has no saved translation — hence the rule in §5.4 (paste the RU / TR blocks only once both translations are saved). The Russian and Turkish wording was written by the Publisher without a native-speaker review; a tester's correction is welcome and is re-counted before pasting.
12. **Review time of the first closed release** — not published by Google; new accounts often wait longer.
13. **Tester engagement** — Google says it looks at whether testers used the app; the exact measure is not public. Ask testers to open the game on several days.
14. **Production-access questionnaire** — wording, answer limits and review time are from Google's public description, not from the Console; trim or extend to what the form accepts.
15. **"Send changes for review" vs "Save and publish"** — testing-track releases on some accounts publish with **Save and publish** on the release page instead of the Publishing overview button; either is right.
16. **"Rules v3: no more roads"** in the release notes — **resolved 2026-10-15 (PUB-23):** the shared "What's new" of 1.0.0 was rewritten as a first-release text for the final look (§5.4); the number is kept so later references stay valid.

## 8. 1.0.1 (the next free build number when it is cut) — what changes on Play with in-app purchases

| Form | Change |
|---|---|
| Content rating (§2.4) | re-open the questionnaire → **Digital purchases: Yes** → "random items / loot boxes": **No** → expected interactive element **In-Game Purchases** (rating itself unchanged) |
| Data safety (§2.7) | add **Financial info → Purchase history**: collected Yes, shared Yes, ephemeral No, **Optional**, purposes App functionality; Fraud prevention, security and compliance (RevenueCat); add **App functionality** to Device or other IDs (RevenueCat's anonymous app-user id); deletion question per §6.3 (B.7 e-mail path) |
| Store listing (§3.2 / §3.3) | variant A texts — `STORE_LISTING.md` §1.1 / §1.2 verbatim (EN 3976 / AZ 3955 since 2026-10-28, PUB-34; 3979 / 3963 from 2026-10-12); Play adds the **In-app purchases** label by itself |
| Store listing RU / TR (§3.5 / §3.6) | no variant A exists yet: before 1.0.1 the Publisher writes the RU / TR wording of the four `STORE_LISTING.md` §2.1 substitutions (purchases named, "Nothing to buy in this version" removed) and re-counts — RU is at 3972 of 4000, so its purchase lines must replace, not add |
| Products, payments profile, license testers | MZ1, MZ5, MZ6, MZ13 (Android halves) — `STORE_LISTING.md` §6.1 ids, `LAUNCH_CHECKLIST.md` §6 |
| Secrets | `RC_ANDROID_KEY` |

## 9. Character counts (2026-10-12, PUB-22; first run 2026-10-11; the four full descriptions re-run 2026-10-19, PUB-27 — "Levels 1–3" → "1–4", a same-length digit swap, all four unchanged; re-run 2026-10-28, PUB-34 — "a one-line lesson" → "a short lesson" in all four (EN −3, AZ −8, RU −4, TR −8); `[...s].length` code points, script in the Publisher's scratch; texts read from this file, `APP_STORE_CONNECT_SHEET.md`, `STORE_LISTING.md`, `RELEASE_NOTES.md` and `tower-clash/fastlane/metadata/en-US/description.txt`)

```
   11 app name EN / AZ / RU / TR             (limit 30)
   26 app name fallback (not used)           (limit 30)
   76 short description EN                   (limit 80)
   75 short description AZ                   (limit 80)
   80 short description RU                   (limit 80)
   80 short description TR                   (limit 80)
 3855 full description EN (variant B)        (limit 4000; = APP_STORE_CONNECT_SHEET §6.3 and fastlane description.txt: true; 3858 before PUB-34, 3863 before the swipe sentence)
 3825 full description AZ (variant B)        (limit 4000; 3833 before PUB-34, 3825 before the swipe sentence)
 3972 full description RU (variant B)        (limit 4000; 3976 before PUB-34)
 3951 full description TR (variant B)        (limit 4000; 3959 before PUB-34)
 3976 full description EN (variant A, 1.0.1) (limit 4000; STORE_LISTING §1.1, 3979 before PUB-34, 3984 before the swipe sentence)
 3955 full description AZ (variant A, 1.0.1) (limit 4000; STORE_LISTING §1.2, 3963 before PUB-34, 3955 before the swipe sentence)
   10 release name "1.0.0 (10)"              (limit 50)
  472 release notes EN                       (limit 500; re-cut 2026-10-15, PUB-23 — 496 before)
  467 release notes AZ                       (limit 500; 489 before)
  486 release notes RU                       (limit 500; 475 before)
  461 release notes TR                       (limit 500; 474 before; all four = RELEASE_NOTES.md v1.0.0: true)
  185 tester message AZ, line 1              (—)
   88 tester message AZ, line 2              (—)
  210 production-access answer 1             (limit not verified (⚠ 14))
  284 production-access answer 3             (limit not verified (⚠ 14))
  255 production-access answer 4             (limit not verified (⚠ 14))
  226 production-access answer 5             (limit not verified (⚠ 14); 249 with "listing in English and Azerbaijani")
  291 production-access answer 6             (limit not verified (⚠ 14))
  266 production-access answer 8             (limit not verified (⚠ 14))
  283 production-access answer 9             (limit not verified (⚠ 14))
 3336 Cowork prompt                          (—)
```

## 10. Cowork prompt (paste into Claude Cowork on the computer)

```
You are helping me fill in the Google Play Console for my game "Tower Clash" in this browser. The single source for every value is this sheet:
https://github.com/pervincinal/InsiderTest/blob/claude/tower-war-game-plan-weqwpb/docs/publishing/PLAY_CONSOLE_SHEET.md
Read it fully first. Files to upload are in the same repository (branch claude/tower-war-game-plan-weqwpb); download them from https://raw.githubusercontent.com/pervincinal/InsiderTest/claude/tower-war-game-plan-weqwpb/<path> — the icon tower-clash/public/icons/icon-512.png, the feature graphic tower-clash/store/feature-graphic.png, the screenshots tower-clash/store/screenshots/en/01.png … 08.png, tower-clash/store/screenshots/az/01.png … 08.png, tower-clash/store/screenshots/ru/01.png … 08.png and tower-clash/store/screenshots/tr/01.png … 08.png (one set per listing language).

Safety rules — follow them strictly:
1. I sign in myself. Never ask me for, and never type, a password, a 2-step code, a recovery code, a card number, an ID document, a keystore, a service-account JSON or any GitHub secret. If a screen asks for one, stop and tell me which screen it is.
2. Stop before any payment (the USD 25 registration fee, payments profile) and let me do it.
3. Stop before identity verification uploads, before ticking any legal declaration or terms (Developer Program Policies, US export laws, Play App Signing terms, IARC terms) and before "Submit" on the "Apply for production" questionnaire — show me what you prepared and let me click.
4. Never press "Start rollout to Production", "Publish changes" for a production release, "Promote release" to Production, or anything that makes the app public. Testing tracks: you may prepare a release and press "Save"; ask me before "Send changes for review".
5. Never delete an app, a release, a track or a tester list, and never change the package name, the signing key setting (keep "Use Google-generated key") or the app's Free status.
6. Paste values exactly as in the sheet's code spans and code blocks — do not rewrite, translate or shorten them. Fields marked "stakeholder fills" or containing [developer e-mail] / [developer name]: ask me for the value in the chat (an e-mail address or a name is fine; secrets are not).
7. Where the sheet marks an item with ⚠, read the reason in its section 7 and ask me before choosing anything the sheet does not state.

Work order: section 1.2 (Create app, if it does not exist yet) → section 2 forms in order (2.1 only if the privacy URL opens in the browser; otherwise skip it and tell me) → section 3 (store settings 3.1; English listing 3.2 with the English graphics of 3.4; then Main store listing (Default store listing) → Manage translations → Add your own translation text → add Azerbaijani (az-AZ), Russian (ru-RU) and Turkish (tr-TR) → Apply; switch the language selector to each one in turn and paste its texts — Azerbaijani 3.3, Russian 3.5, Turkish 3.6 — and upload its own screenshot set from 3.4; save after each language) → section 4.1 (closed testing track: countries, tester e-mail list — I give you the addresses —, feedback e-mail). When a step needs the .aab file (section 5.2), stop and tell me; I download it from GitHub. At the end, give me a short list: what you filled, what you skipped and why, and every warning the Console showed, word for word.
```
