# Tower Clash — store listing (v0.1.0)

Owner: Publisher. Every claim below is true of build v0.1.0 (see `RELEASE_NOTES.md`). When a feature ships, update the text here first, then the store consoles. Character counts are verified with `node -e` (see the bottom of this file); limits are the stricter of Google Play and App Store.

What exists and may be claimed: 15 levels, one enemy per level, barracks / fortress / artillery towers, tutorial on levels 1–3, three-star timer per level, coins on first clear, level unlocking, send 100 % / 50 % toggle, pause menu with ×2 speed, colour-blind palette, WebAudio sound effects, offline PWA, Android debug APK from CI, no ads, no purchases, no network calls, no accounts. The game UI is in English only.

What must NOT be claimed yet: tank factories, mines, barriers, bridges, several enemies at once, boosters (coins cannot be spent yet), skins, leaderboards, multiplayer, cloud save, more than 15 levels.

---

## 1. Google Play

| Field | Limit | EN | AZ |
|---|---|---|---|
| App name | 30 | `Tower Clash` (11) | `Tower Clash` (11) |
| Short description | 80 | `Capture every tower. One-thumb real-time strategy, 15 levels, offline, no ads.` (78) | `Bütün qüllələri tut. Bir barmaqla real vaxt strategiya, 15 səviyyə, reklamsız.` (78) |
| Category | — | Games › Strategy | Oyunlar › Strategiya |
| Tags | — | Strategy, Casual, Single player, Offline, Stylised | — |
| Contact e-mail | — | `[developer e-mail]` | — |
| Privacy policy URL | — | `[URL of PRIVACY_POLICY.md on GitHub Pages]` | — |

### 1.1 Full description — English (≤ 4000)

```
Tower Clash is a one-thumb real-time strategy game: tap one of your towers, tap a target, and your soldiers march. Reinforce friendly towers, overwhelm hostile ones, and when a garrison hits zero the tower is yours. Capture every enemy tower to win.

HOW IT PLAYS
• Tap a blue tower, then tap any connected tower to send everyone there.
• Tap a selected tower again to upgrade it: faster production and a bigger garrison.
• Every tower produces soldiers over time — the longer you wait, the bigger the wave, but the enemy is growing too.
• A SEND 100 % / 50 % switch lets you keep a reserve at home.

15 HAND-MADE LEVELS
• Levels 1–3 teach the basics with a short built-in tutorial.
• Fortresses (from level 9) shrug off half of every attack — bring more than you think.
• Artillery (from level 12) shoots down soldiers that walk into its range — approach from the right road.
• Beat every level for three stars: the faster you win, the more stars you earn. Stars unlock the next level and pay coins.

BUILT FOR PHONES
• Portrait, one hand, every level under three minutes.
• Pause menu with a ×2 speed switch for when you are already winning.
• Colour-blind palette option.
• Works fully offline.

HONEST BY DESIGN
• No ads.
• No in-app purchases.
• No account, no sign-in, no tracking — your progress is stored only on your device.

Tower Clash is an early release (version 0.1.0) with 15 levels and one opponent per map. More levels, tower types and opponents are planned.
```

### 1.2 Full description — Azerbaijani (≤ 4000)

```
Tower Clash bir barmaqla oynanan real vaxt strategiya oyunudur: öz qüllənə toxun, hədəfə toxun — əsgərlərin yola düşür. Dost qüllələri gücləndir, düşmən qüllələrini sıxışdır; qarnizon sıfıra düşəndə qüllə sənindir. Qalib gəlmək üçün bütün düşmən qüllələrini tut.

NECƏ OYNANIR
• Mavi qülləyə toxun, sonra yolla bağlı istənilən qülləyə toxun — hamı ora gedir.
• Seçilmiş qülləyə bir daha toxun: təkmilləşdirmə (upgrade) istehsalı sürətləndirir, qarnizonu böyüdür.
• Hər qüllə zamanla əsgər istehsal edir — nə qədər gözləsən, dalğa bir o qədər böyük olur, amma düşmən də böyüyür.
• SEND 100 % / 50 % düyməsi ilə evdə ehtiyat saxlaya bilərsən.

15 ƏL İLƏ HAZIRLANMIŞ SƏVİYYƏ
• 1–3-cü səviyyələr qısa daxili təlimatla əsasları öyrədir.
• Qalalar (9-cu səviyyədən) hər hücumun yarısını dəf edir — düşündüyündən çox əsgər apar.
• Top qüllələri (12-ci səviyyədən) mənzilinə girən əsgərləri vurur — düzgün yoldan yaxınlaş.
• Hər səviyyədə üç ulduz qazan: nə qədər tez qalib gəlsən, o qədər çox ulduz. Ulduzlar növbəti səviyyəni açır və sikkə qazandırır.

TELEFON ÜÇÜN HAZIRLANIB
• Şaquli ekran, bir əl, hər səviyyə üç dəqiqədən qısa.
• Pauza menyusunda ×2 sürət düyməsi.
• Rəng korluğu üçün ayrıca palitra.
• Tam oflayn işləyir.

DÜRÜST OYUN
• Reklam yoxdur.
• Tətbiqdaxili alış yoxdur.
• Hesab, giriş və izləmə yoxdur — irəliləyişin yalnız öz cihazında saxlanılır.

Qeyd: oyunun interfeysi ingilis dilindədir (menyular: PLAY, SEND, MENU, VICTORY).

Tower Clash erkən buraxılışdır (versiya 0.1.0): 15 səviyyə, hər xəritədə bir rəqib. Yeni səviyyələr, qüllə növləri və rəqiblər planlaşdırılır.
```

### 1.3 Graphic assets (all rendered from the game by `tower-clash/store/tools/renderStoreShots.mjs`)

| Asset | Requirement | File |
|---|---|---|
| App icon | 512×512 PNG, 32-bit | `tower-clash/public/icons/icon-512.png` (same mark as `resources/icon.svg`) |
| Feature graphic | 1024×500 PNG/JPG | `tower-clash/store/feature-graphic.png` (144 KB) |
| Phone screenshots | 2–8, 9:16, 320–3840 px | `tower-clash/store/screenshots/en/01..06.png` and `az/01..06.png`, 1080×1920, each < 600 KB |

Screenshot order and captions:

| # | Frame | EN caption | AZ caption |
|---|---|---|---|
| 01 | Title screen | Capture every tower | Bütün qüllələri tut |
| 02 | Level 1 with tutorial hint | One tap to attack | Bir toxunuşla hücum |
| 03 | Level 5 mid-battle | Upgrade to out-produce | Upgrade et, üstün gəl |
| 04 | Level 9 (first fortress) | Storm the fortress | Qalanı ələ keçir |
| 05 | Level 15 (artillery citadel) | Silence the guns | Topları susdur |
| 06 | Result screen, 3 stars | Three-star every level | Hər səviyyədə üç ulduz |

---

## 2. Apple App Store

| Field | Limit | EN | AZ (Azerbaijani is not an App Store localisation; use it in the description only if a supported locale such as Turkish is not preferred) |
|---|---|---|---|
| Name | 30 | `Tower Clash` (11) | `Tower Clash` (11) |
| Subtitle | 30 | `Capture every tower` (19) | `Bütün qüllələri tut` (19) |
| Promotional text | 170 | `Tap, send, conquer. 15 levels of one-thumb real-time strategy with fortresses and artillery. Fully offline — no ads, no purchases, no account.` (142) | `Toxun, göndər, fəth et. Qalalar və toplarla 15 səviyyəlik bir barmaq real vaxt strategiya. Tam oflayn — reklamsız, alışsız, hesabsız.` (133) |
| Keywords | 100 | `tower,war,strategy,rts,capture,conquer,castle,army,offline,tap,casual,defense,attack,soldiers` (93) | `qüllə,strategiya,qala,ordu,oflayn,müharibə,fəth,döyüş,əsgər,tower,war,rts,casual` (80) |
| Primary category | — | Games | — |
| Subcategories | — | Strategy, Casual | — |
| Support URL | — | `[repository URL]` | — |
| Marketing URL | — | `[web link — GitHub Pages pending]` | — |
| Privacy policy URL | — | `[URL of PRIVACY_POLICY.md on GitHub Pages]` | — |
| Copyright | — | `© 2026 [developer name]` | — |

Description (≤ 4000): reuse §1.1 (EN) and §1.2 (AZ) verbatim — they are under the limit and contain no Google-specific wording.

What's New (v0.1.0, ≤ 4000): use the EN block from `RELEASE_NOTES.md`.

App Store screenshots must be exact device sizes: **6.7" 1290×2796** and **6.5" 1284×2778**. The 1080×1920 set is not accepted there; render an iPhone set by running the same script with viewport 430×932 @3x (6.7") and 428×926 @3x (6.5") — a follow-up item in `LAUNCH_CHECKLIST.md`.

---

## 3. ASO keyword list

Primary (in title / subtitle / first lines): tower clash, capture every tower, real-time strategy.

Secondary (descriptions, keyword field): tower war, tower conquest, castle capture, army strategy, rts, one-thumb strategy, offline strategy game, no ads strategy, casual strategy, tap to attack, fortress, artillery, three stars, short levels.

Azerbaijani: qüllə oyunu, strategiya oyunu, qala tutmaq, ordu, real vaxt strategiya, oflayn oyun, reklamsız oyun, bir barmaqla oyun.

Do not use competitor names ("Tower War", "State.io", etc.) in the keyword field or title — both stores reject trademarked names of other apps; "Tower War–style" stays in internal docs only.

---

## 4. Content rating notes (IARC for Google Play, age-rating questionnaire for App Store)

Facts to answer with:

| Question | Answer | Why |
|---|---|---|
| Violence | Mild / cartoon, infrequent | Tiny stylised soldiers walk along roads and disappear with a puff of particles when they meet an opposing soldier. No blood, no injury depiction, no realistic weapons, no human suffering. |
| Fear / horror | None | — |
| Sexual content, nudity | None | — |
| Language | None | UI text only (PLAY, SEND, MENU, VICTORY). |
| Controlled substances, gambling | None | No simulated gambling, no loot boxes, no randomness the player pays for. |
| User interaction | None | No chat, no user-generated content, no sharing, no multiplayer. |
| Shares location | No | — |
| Purchases of digital goods | No | No in-app purchases, no ads, no external store links. |
| Personal information | Not collected | Progress in local storage only. |

Expected results: Google Play / IARC **Everyone (ESRB E), PEGI 3, USK 0**; App Store **9+** if "Infrequent/Mild Cartoon or Fantasy Violence" is declared (recommended, it is the honest answer), **4+** if "None" is chosen. Google Play "Ads" declaration: **No, this app does not contain ads**. Google Play Data safety: **No data collected, no data shared** (see `PRIVACY_POLICY.md`). Apple App Privacy: **Data Not Collected**; App Tracking Transparency not used.

---

## 5. Verifying the limits

```bash
node -e '
const c = (s) => [...s].length;
console.log("gp short EN", c("Capture every tower. One-thumb real-time strategy, 15 levels, offline, no ads."));
console.log("gp short AZ", c("Bütün qüllələri tut. Bir barmaqla real vaxt strategiya, 15 səviyyə, reklamsız."));
console.log("subtitle AZ", c("Bütün qüllələri tut"));
console.log("keywords EN", c("tower,war,strategy,rts,capture,conquer,castle,army,offline,tap,casual,defense,attack,soldiers"));
'
```
