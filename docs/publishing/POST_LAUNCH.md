# Tower Clash — post-launch plan (first four weeks after 1.0)

Owner: Publisher (this file); each row names the role that does the work. Written 2026-09-20 for backlog item M4-3 against the v1.0.0 release candidate (`RELEASE_NOTES.md`). Nothing here is a request to the stakeholder: every step that needs a human is already in `LAUNCH_CHECKLIST.md` with a status, and the team applies the defaults below when no answer arrives (`docs/PLAN.md` "Daily cadence").

**Day L** = the day the Producer creates the `tower-clash-v1.0.0` tag. Everything is dated relative to it because the calendar date depends on the stakeholder's gates (`LAUNCH_CHECKLIST.md` §8). Two channels open at different times: the **web/PWA** (GitHub Pages) can go public on L itself; the **stores** open only after the accounts, signing secrets and Phase B keys exist — so "L" for the store KPIs is the day the Play production rollout / App Store release happens, and the web channel runs ahead of it.

## Qısa xülasə (Azərbaycanca)

1.0 tag-ından sonrakı dörd həftənin planı. **Yumşaq buraxılış:** əvvəlcə veb (GitHub Pages, dünya üzrə, hesab tələb etmir), sonra Google Play qapalı test → istehsal və App Store, ilk iki həftə yalnız Azərbaycan, Türkiyə, Qazaxıstan və Gürcüstanda (oyunun dilləri AZ/RU/TR/EN-dir; bu bazarlar ucuzdur və rəy toplamaq üçün kifayətdir), 2-ci həftənin sonunda göstəricilər yerindədirsə bütün ölkələr. **Tərəf-müqabildən lazım olan** hər şey `LAUNCH_CHECKLIST.md`-dədir: hesablar (G1, A1), imza açarları (G3–G4, A3–A5), Pages (W3), ödəniş profilləri (MZ1–MZ2), AdMob/RevenueCat (MZ7, MZ13), 12 test istifadəçisi (G19), tag (V3). **İzlənən göstəricilər** (§3): D1 ≥ 25 %, D7 ≥ 8 %, D30 ≥ 2 %; ARPDAU $0.05–0.10; ödəyici 1–2 % (D7 qalanlardan); Reklamları sil 0.5–1 %; qiymət ≥ 4.3; çöküş < 1.09 %, ANR < 0.47 % (Google-un hədləri). Oyunda analitika yoxdur (məxfilik siyasəti) — rəqəmlər yalnız mağaza konsollarından, RevenueCat və AdMob-dan gəlir; günlük çağırışda iştirak 1.0-da ölçülmür. **LiveOps təqvimi** (§4): günlük çağırış avtomatik işləyir (28 günlük cədvəl aşağıda, hovuz 9–50), həftəlik çağırış hər bazar ertəsi 00:00 UTC (1.0-dadır, 33–50-ci səviyyələr), seriya mükafatları 3/7/30-cu gün; 41–50-ci səviyyələr də 1.0-dadır (Prodüser qərarı 2026-09-21). **Növbətçilik** (§5): QA hər səhər çöküş/ANR-ə baxır, Publisher mağaza rəylərinə 48 saat içində cavab yazır, Producer gündəlik sprintdə prioritet verir. **Yol xəritəsi** (§6): 1.0.1 (L+2 həftə) — cilalama və telemetriyasız tənzimləmə (düzəlişlər, rəylərə və bota əsaslanan balans, 17+ və 41+ səviyyələrdən skrinşotlar, save yeniləmə testi); 1.1 (L+5–6 həftə) — GDD §7.6 və §8-dən növbəti məzmun: yeni görünüşlər, çağırış nailiyyətləri, fənd zəmanətləri, həftə seriyası mərhələləri, dünənki xəritə, paylaşma kartı, Phase C təkliflər; sonra — liderlər cədvəli (hesab lazımdır).

---

## 1. Timeline at a glance

| When | Web (Pages) | Google Play | App Store | Team |
|---|---|---|---|---|
| L−1 | `npm run check` + `playtest` green on the tag commit; `POST_LAUNCH.md` §4 daily table re-run for L … L+27 | AAB from the release job on the **internal testing** track (`LAUNCH_CHECKLIST.md` G5, MZ15) | TestFlight build (A6) | Version 1.0.0 / build 5 synced (Mobile Engineer), "What's new" texts pasted (Publisher) |
| **L** | Tag created; Pages deploy of the tag commit; URL and privacy / support pages checked (§8 T2–T3) | Closed testing (12+ testers, ≥ 14 days for a new personal account — G19) | TestFlight external group (≤ 10 000 testers, Apple review of the build ≈ 1 day) | Daily report announces the tag; triage rota starts (§5) |
| L+1 … L+13 | Public web; first reviews arrive by support mail only (no store yet) | Closed testing runs; sandbox purchases + restore + refund verified (MZ14); Data safety / Ads declaration submitted (G13–G16) | App Privacy, age rating, IAP products submitted **with** the version (A13–A18, MZ3) | Hotfix window: 1.0.x for anything S1/S2 (§5); band 5 pack finishes (§6) |
| L+14 | — | **Production, soft-launch countries** (§2.2), 100 % rollout inside those countries | **Release in the same countries** (App Store Connect → Pricing and Availability) | Producer's go / no-go on the §3 week-2 gate |
| L+14 … L+27 | 1.0.1 to Pages as soon as it is tagged | 1.0.1 to production (staged rollout 20 % → 100 % over 48 h) | 1.0.1 phased release (7 days, can be paused) | LiveOps §4 weeks 3–4; 1.1 planning |
| L+28 | — | **All countries** if the week-4 gate holds (§3) | All territories | Retro: this file gets a "Results" section with the real numbers; 1.1 scope fixed |

## 2. Soft-launch checklist

### 2.1 Channel order and why

1. **Web/PWA first** (GitHub Pages). It needs no store review, no signing and no money: one repository setting (W3). It has no ads and no purchases, so nothing in ECONOMY.md is tested here — it tests the game, the tutorial, the daily challenge and the four languages with real people, and it is the URL the store listings point to (marketing, privacy, support). Worldwide from day one; there is no country switch on Pages.
2. **Google Play second.** A new personal developer account must run a closed test with 12+ testers for 14 days before it may publish to production (G1, G19) — so the 14 days are not a choice, they are the calendar. Play's soft-launch tooling is the best of the three: country-restricted production, staged rollouts, Android vitals (crash / ANR without any SDK), and the closed-test testers double as the first payers (license testers pay nothing, MZ5).
3. **App Store last.** TestFlight needs the signed archive job (A6) and the paid-apps agreement for IAP (MZ2); Apple review takes 1–3 days per build. Release in the same countries as Play so both stores are read against the same week.

### 2.2 Countries

| Phase | Countries | Reason |
|---|---|---|
| Soft launch (L+14 … L+27) | **Azerbaijan, Türkiye, Kazakhstan, Georgia** | The game's four UI languages cover them (AZ, TR, RU, EN — Georgian is not shipped, but RU/EN are common there and the tutorial is pictorial); the stakeholder and the first testers are in Baku, so support mail and reviews come in languages the team writes; low eCPMs and no paid UA mean the revenue read is a floor, not a forecast; Play dominates all four, which matches where the tooling is best |
| Not before week 4 | US, UK, DE, FR, CA, AU | The high-eCPM markets that make ARPDAU look good; opening them early wastes the first-impression rating window on a build that may still get a 1.0.1 |
| Excluded until a decision | Countries where Google Play merchant registration or Apple payouts are unavailable to the stakeholder's bank country (MZ1 / MZ2 notes) — the app can still be *free* there, but IAP must be off (RevenueCat "unavailable" path is already handled) | Legal / payments, not product |
| Never in 1.x | China (no Google Play; App Store needs an ICP filing), Russia for paid features (Apple / Google payments suspended — the game works, IAP does not) | Payments |

Default if no answer: the team prepares the four soft-launch countries in the listing texts (`STORE_LISTING.md` already has EN + AZ, with RU/TR sets for the day those locales exist) and the stakeholder ticks the countries in the console — the team cannot.

### 2.3 What the stakeholder must do (all already in `LAUNCH_CHECKLIST.md`; status as of 2026-09-20)

| Order | Step | Checklist row | Status | Unblocks |
|---|---|---|---|---|
| 1 | Enable GitHub Pages (Settings → Pages → Source: GitHub Actions) | W3 | needs stakeholder | Web channel, privacy URL (G17 / A16), support URL, marketing URL |
| 2 | Create the release tag `tower-clash-v1.0.0` from the GitHub UI (after the version bump commit) | V3, §8 T1 | needs stakeholder / producer | Day L |
| 3 | Google Play developer account, app record, upload keystore + Play App Signing, CI secrets `ANDROID_*` | G1–G4 | needs stakeholder | Release AAB (G5 job is the Mobile Engineer's once secrets exist) |
| 4 | Apple Developer Program, bundle id with IAP capability, distribution certificate + profile, App Store Connect API key, CI secrets `APPLE_*` / `APP_STORE_CONNECT_*` | A1–A5 | needs stakeholder | TestFlight (A6) |
| 5 | Payments: Play payments profile, Apple Paid Applications agreement + tax forms | MZ1, MZ2 | needs stakeholder | IAP products (MZ3, MZ5) |
| 6 | AdMob account, two apps, interstitial + rewarded units, privacy messages; RevenueCat project, keys | MZ7, MZ8, MZ13, MZ6 | needs stakeholder | `RC_*`, `ADMOB_*` secrets → Phase B build (ECON-1) |
| 7 | 12+ closed testers (Gmail addresses) and the same addresses under License testing; a phone for the real-device pass | G19, MM-1, QA-2 | needs stakeholder | The 14-day clock; sandbox purchases (MZ14) |
| 8 | Fill `[developer e-mail]` / `[developer name]` in the listing, privacy and support pages | G18, W5, A16 | needs stakeholder | Store forms |
| 9 | Submit the forms: content rating, Data safety, Ads declaration, target audience, App Privacy, age rating, export compliance | G13–G16, A13–A15 | needs stakeholder (answers are written in `STORE_LISTING.md` §4 / §6) | Store review |
| 10 | Tick the soft-launch countries; press "release" | G20, A18 | needs stakeholder | L+14 |

Team-side items that must be done *before* the stakeholder reaches step 3: G5 `bundleRelease` job, A6 signed archive job, A8 macOS runner check, MZ11 restore / price strings, MZ15 key injection — all Mobile / Frontend Engineer, tracked in the backlog "Next (M-mobile)" and ECON-1.

## 3. KPIs to watch and target numbers

**Where the numbers come from — and what cannot be measured.** The game ships **no analytics SDK and no telemetry of its own**; the privacy policy (v2.1, Part A and B) promises that, and the listing says "no account, no sign-in". Every figure below therefore comes from the store consoles and the two SDKs that the native builds already carry: **Google Play Console** (installs, uninstalls, retained installers in the acquisition report, ratings, Android vitals: crash and ANR rates — collected by Play services, no SDK), **App Store Connect** (units, App Analytics retention and sessions — opt-in users only, typically 20–30 % of the base, so treat as a sample; crashes via Xcode Organizer), **RevenueCat** (new customers, transactions, revenue, refunds, Remove Ads / Premium conversion — customers are anonymous ids), **AdMob** (ad requests, impressions, eCPM, estimated earnings; the requests curve is the DAU proxy for players who have not bought Remove Ads). The **web channel has no numbers at all** by design (Pages serves static files; no analytics is injected) — its signal is support mail and what the stakeholder hears from testers.

Anything that needs an in-app counter — daily-challenge participation, streak distribution, tutorial completion, level funnel — **is not measurable in 1.0**. It becomes measurable only if the team ships an opt-in, anonymous, aggregate counter (a 1.1 decision: privacy policy v3, Data safety and App Privacy re-answered, Publisher + Game Designer + stakeholder; see §6). Until then those KPIs carry the *model* value from `docs/ECONOMY.md` §6 and are read indirectly (reviews, support mail, the AdMob request curve around 00:00 UTC).

| KPI | Source | Target (week 2 gate → week 4 gate) | Floor (stop the country roll-out, fix first) | Model / benchmark | Watcher |
|---|---|---|---|---|---|
| **D1 retention** | Play acquisition report (retained installers, day 1); App Store Analytics → Retention | **≥ 25 %** both gates | < 18 % | Strategy genre median 25.4 % (GameAnalytics 2025, `docs/research/monetization-market.md` §4); ECONOMY.md §6 target "D1 ≥ 25 %" | QA Engineer (reads), Game Designer (acts) |
| **D7 retention** | same | **≥ 8 %** (week 4 gate; week 2 is too early for a stable D7) | < 5 % | All-genre median < 4 %; the daily challenge and the 7-day login reward exist exactly for this curve, so the target sits at 2× median | Game Designer |
| **D30 retention** | same, first readable at L+44 | **≥ 2 %** | < 1 % | Median 0.7–0.8 %; top 1 % 13–15 %; the 30-day streak milestone (100 crystals) is the hook | Game Designer / Monetization Designer |
| **Daily-challenge participation** | *not measurable in 1.0* — model only; proxy: AdMob request curve has a visible step after 00:00 UTC and reviews mention it | Model: **70 % of active days** played and won by eligible players (ECONOMY.md §6, "available from day 3"); if a counter ever ships: ≥ 40 % of DAU on day 3+ tap the card, ≥ 60 % of those win | — | ECONOMY.md §6 model; GDD §7.1 | Monetization Designer |
| **Streak milestones reached** | *not measurable*; model | Day 3 hit on ≈ 10 % of player-days, day 7 ≈ 2.5 %, day 30 ≈ 0 in the first month (ECONOMY.md §6.2) | — | ECONOMY.md §6.2 cost model ≈ 30 crystals / month / active player | Monetization Designer |
| **ARPDAU** | (RevenueCat revenue + AdMob earnings) ÷ DAU, DAU = AdMob daily unique requests + RevenueCat active Remove-Ads / Premium owners (approximation, documented in the weekly sheet) | **$0.05–0.10** (ECONOMY.md §6 "Targets"); in the soft-launch countries expect the **low end or below** — eCPMs there are a fraction of US/UK — so the week-2 read is "≥ $0.03 and rising", the week-4 read "≥ $0.05" | < $0.02 at week 4 with ≥ 1 000 DAU | Ads-only casual $0.01–0.05, hybrid-casual publishers $0.15–0.50 | Monetization Designer |
| **Payer conversion** | RevenueCat customers with ≥ 1 purchase ÷ D7-retained (approximated by customers seen ≥ 7 days after first seen) | **1–2 % of D7-retained** | < 0.5 % | Casual 0.5–1 %, strategy ≈ 1.5 % | Monetization Designer |
| **Remove Ads** | RevenueCat entitlement `no_ads` ÷ installs | **0.5–1 % of installs** | — | ECONOMY.md §6 | Monetization Designer |
| **Revenue mix** | RevenueCat vs AdMob | ≈ **60 % IAP / 40 % ads** | either side < 20 % → re-read the offer / caps | ECONOMY.md §6 | Monetization Designer |
| **Interstitial pressure** | AdMob impressions per DAU per day; reviews mentioning ads | ≤ **2 interstitials per DAU per day** at the shipped caps (never in a battle, ≥ 120 s apart, ≤ 4 per session, not in levels 1–5) | reviews with "ads" as the main complaint > 10 % of reviews | `INTERSTITIAL_RULES`, `STORE_LISTING.md` §6.2 | Monetization Designer |
| **Rating** | Play Console, App Store Connect | **≥ 4.3** after 30 ratings | < 4.0 | Genre expectation for a polished indie | Publisher |
| **Crash rate (user-perceived)** | Android vitals; Xcode Organizer | **< 1.09 %** of daily users (Google's core-vitals bad-behaviour threshold; being above it lowers store visibility) | ≥ 1.09 % on any day → hotfix | — | QA Engineer → Mobile / Frontend Engineer |
| **ANR rate (user-perceived)** | Android vitals | **< 0.47 %** (Google's threshold) | ≥ 0.47 % | The game is a WebView: an ANR is most likely a long JS task on the main thread at level start or a service-worker update — PERF-3 / PERF-2 are the levers | QA Engineer → Frontend Engineer |
| **Uninstall rate D7** | Play Console | < 40 % of installs by day 7 | > 60 % | Casual norm 40–60 % | Game Designer |
| **Support mail response** | stakeholder's inbox (forwarded to the daily report) | first reply ≤ 48 h, EN/AZ/RU/TR | > 5 unanswered | Privacy policy B.7 promises deletion requests are honoured | Publisher (drafts), stakeholder (sends) |
| **Web channel** | none (by design) | — | — | Read reviews / mail only | Publisher |

**Gates.** *Week-2 gate (L+14, before the stores open in the soft-launch countries):* crash < 1.09 % and ANR < 0.47 % on the closed-test track, no open S1/S2 (§5), TestFlight external build accepted, sandbox purchase + restore + refund verified (MZ14), D1 on the closed testers ≥ 25 % (small sample; treat < 18 % as a real problem). *Week-4 gate (L+28, before all countries):* D1 ≥ 25 %, D7 ≥ 8 %, rating ≥ 4.3 (or < 30 ratings), ARPDAU ≥ $0.05 or clearly rising, no ad-complaint cluster, 1.0.1 shipped. If a gate fails, the country list stays as it is and the fix goes into the next 1.0.x — the default is "hold", never "roll back a store release" (users keep the build they have).

**Weekly KPI sheet.** From L+7 the Producer's daily report gets a "KPI" table on Mondays (Monetization Designer fills it from the consoles' CSV exports that the stakeholder pastes into the report thread, or leaves "n/a — console access pending"; the team never asks for console access, it lists what it would read).

## 4. LiveOps calendar (L … L+27)

Everything here runs **without a server**: the daily challenge is a pure function of the UTC date, milestones live in the save, and every "drop" is a build. There is no remote config in 1.0 (ECONOMY.md §8 Phase C lists it as a want), so a LiveOps event = a tagged release on the calendar below; the stores' review time (Play hours, Apple 1–3 days) is part of the schedule.

### 4.1 Recurring

| Beat | Cadence | What happens | Owner | Notes |
|---|---|---|---|---|
| **Daily Challenge** | every UTC day, 00:00 | New level / seed / twist for everyone (GDD §7); card, countdown, streak | Automatic. AI Engineer re-runs `npm run playtest -- --daily <L> --days 28 --seeds 5` on L−1 and on every level or AI change; the day table is §4.3 | Reset is 04:00 Baku, 03:00 Istanbul, 05:00/06:00 Almaty — the soft-launch countries see it in the morning. Pool 9–50 with a per-cycle shuffle since DAILY-4 (`6399883`, in 1.0: no level repeats inside a 42-day cycle); any pool edit re-maps every future day (GDD §7.4): only with a build and a report note, never mid-day |
| **Streak milestones** | per player: day 3 / 7 / 30 of a win streak | +5 / +20 / +100 crystals once per streak run (GDD §7.2, ECONOMY.md §6.2); **day 30 does not repeat at 60 / 90** — decided 2026-09-20 (GDD §7.2 "Day 30", DAILY-3): distinct day-60 / day-100 tiers are the only variant, and only with streak data | Automatic. Monetization Designer watches the crystal economy through the shop's skin sales in RevenueCat (no other signal) | First players can reach day 7 on L+6 and day 30 on **L+29** — the 1.0.1 build must keep `save.challenge.milestones` across the update (schema v3 unchanged; QA adds an upgrade test, §6) |
| **Login reward** | per player, local calendar day, 7-day cycle | Gold days 1–7, crystals on days 4 and 7 (ECONOMY.md §2.1) | Automatic | Documented asymmetry: login = local day, challenge = UTC day (GDD §7.4) — reviews that complain about "streak lost" are the signal to unify (§6, 1.1) |
| **Weekly Challenge** | Monday 00:00 UTC (**in 1.0** — `3f46f16`, WEEKLY-1, GDD §8) | One fixed match per ISO week keyed by the UTC Monday: a level from 33–50, always one of the four non-plain twists, fixed seed; 100 gold on the first win, 20 crystals once for a run at or under the level's own 3★ clock, a week streak (no week milestones in 1.0); shown as a **WEEKLY tab on the daily card**, unlock after level 32 | Automatic. AI Engineer re-runs `npm run playtest -- --weekly <monday> --weeks 26 --seeds 5` on every level or AI change (CI gate 26 weeks × 5 seeds, `b6b77ad`); Monetization watches the 20-crystal target against §6.1's band | Monday shows a new daily and a new weekly at the same reset (GDD §8.1). The 3★ target is for players faster than the bot (the bot reaches it on ~10 of 26 weeks, GDD §8.4). First four weeks in §4.3 |
| **Skin drop** | one per release from 1.0.1 (§6) | New skin(s) visible in the Skins tab with a "New" badge (badge exists? — Frontend to confirm; otherwise the shop order puts new items first) | Tech Artist (sprites), Monetization (price), Frontend (shop), Publisher (store screenshot 08 if the shop frame changes) | Cosmetic only; never a limited-time price in 1.x (no server clock to enforce it honestly) |
| **Store reviews** | daily | Reply within 48 h (§5) | Publisher | — |
| **Ratings prompt** | none in 1.0 | The game never asks for a rating (no `SKStoreReviewController` / In-App Review call) — decision for 1.1 after the first 30 organic ratings | Producer | Do not add before the rating is known to be ≥ 4.3 |

### 4.2 Week by week

| Week | Dates | Beats | Release | Owner |
|---|---|---|---|---|
| 1 | L … L+6 | Tag, Pages live, closed testing starts; daily runs; **first hotfix window** (1.0.1-rc if S1); day-3 streak first reachable on L+2, day 7 on L+6 | none planned (1.0.x only if S1/S2) | Producer, QA |
| 2 | L+7 … L+13 | KPI sheet starts; sandbox purchases; first store reviews on the Grand Campaign (41–50) and the weekly read for tuning (§6.1); save upgrade test; second weekly on L+7 if L is a Monday | **1.0.1 tagged on L+12** (polish / tuning, §6.1 — only if there is something to ship), to Play production + App Store review on L+13 so it is the build in the stores at L+14 | QA, AI Engineer, Game Designer, Mobile Engineer, Publisher |
| 3 | L+14 … L+20 | Stores open in AZ/TR/KZ/GE with 1.0.1 (or 1.0.0 if 1.0.1 slipped — the country roll-out does not wait for content); first store reviews; 1.1 scope fixed from the week-2 read | 1.0.2 only if needed | Publisher (reviews), Monetization (ARPDAU read) |
| 4 | L+21 … L+27 | 1.1 content in review (§6.2: skin drop #1, challenge achievements, twist guarantees); D7 first readable for the store cohort on L+21; retro on L+28 | **1.1 tagged on L+27** with whatever passed its gate; anything red slips to 1.2 | Game Designer, Frontend, AI Engineer, Tech Artist |

### 4.3 The daily and weekly challenges for the next four calendar weeks (from the shipped pickers, `src/daily/challenge.ts`, run 2026-09-21 after DAILY-4 / WEEKLY-1)

The pickers are keyed by the calendar date, not by L, so this table is valid whatever day L falls on; re-run for a different window. Every row below is inside the 60-day sweep that passed 60/60 days over the 9–50 pool on 2026-09-20 (`docs/BACKLOG.md` WEEKLY-1 / DAILY-4; level 46 hardened in `a34522c`). The first row is the pin in GDD §7.2 (2026-09-21 → 44 / lean).

| Date (UTC) | Level | Twist | | Date (UTC) | Level | Twist |
|---|---|---|---|---|---|---|
| 09-21 Mon | 44 Minefield Crossing | Lean rations | | 10-05 Mon | 25 Heavy Metal | Thin walls |
| 09-22 Tue | 31 Guns over the River | Reinforced | | 10-06 Tue | 23 First Blood | Reinforced |
| 09-23 Wed | 21 Behind the Wall | Thin walls | | 10-07 Wed | 17 Minefield | Fast feet |
| 09-24 Thu | 36 Three Bridges | Fast feet | | 10-08 Thu | 39 The Long Night | Lean rations |
| 09-25 Fri | 22 Castle in the Middle | Lean rations | | 10-09 Fri | 47 Scorched Earth | Reinforced |
| 09-26 Sat | 50 The Crown Reforged | Reinforced | | 10-10 Sat | 38 Ring of Fire | Lean rations |
| 09-27 Sun | 49 Last Light | Reinforced | | 10-11 Sun | 14 Guns and Walls | Fast feet |
| 09-28 Mon | 16 Last Bastion | Thin walls | | 10-12 Mon | 33 Three Kings | Classic |
| 09-29 Tue | 9 Stone Walls | Classic | | 10-13 Tue | 15 The Citadel | Reinforced |
| 09-30 Wed | 20 Roadblock | Fast feet | | 10-14 Wed | 30 Drawbridge | Reinforced |
| 10-01 Thu | 32 Siege Works | Lean rations | | 10-15 Thu | 11 Starve the Keep | Fast feet |
| 10-02 Fri | 13 Crossfire | Thin walls | | 10-16 Fri | 41 Twin Rivers | Thin walls |
| 10-03 Sat | 10 Hold the Line | Lean rations | | 10-17 Sat | 42 Siege Engine | Fast feet |
| 10-04 Sun | 24 The Gauntlet | Classic | | 10-18 Sun | 45 Three Fronts | Thin walls |

28 distinct levels in 28 days (the per-cycle shuffle of DAILY-4 — the 10-day repeat pattern noted here on 2026-09-20 is gone). Levels 41–50 appear as dailies from day one (09-21 is level 44): a player who has not reached them yet can still play them as the daily without touching campaign progress (GDD §7.2 "Locked levels").

Weekly Challenge, same window (`weeklyFor`, always a non-plain twist; the first row is the GDD §8.4 pin):

| Week from (UTC Monday) | Level | Twist | 3★ target |
|---|---|---|---|
| 2026-09-21 | 33 Three Kings | Fast feet | 40 s |
| 2026-09-28 | 46 The Long Bridge | Thin walls | 35 s |
| 2026-10-05 | 37 Tank Country | Fast feet | 25 s |
| 2026-10-12 | 39 The Long Night | Fast feet | 35 s |

## 5. Triage rota — crashes, ANRs, store reviews, support mail

The team is autonomous and runs once a day (04:00 UTC, `docs/PLAN.md`); there is no on-call human. The rota therefore says *what the daily session reads first* and *who fixes what*, with response times that fit a one-session-a-day cadence. The stakeholder's only involvement is that console screenshots / CSV exports and support mail reach the team through the daily report thread.

### 5.1 Severity

| Level | Definition | Response | Path |
|---|---|---|---|
| **S1** | Crash or ANR ≥ 1.09 % / 0.47 % of daily users, a level that cannot be won or loaded, purchases charged but not granted, ads shown during a battle or in levels 1–5, the daily challenge unwinnable for the fixed seed, data loss on update | Fix in the same session; **1.0.x hotfix tagged the same day**; Play staged rollout 100 % immediately; Apple expedited review requested (Publisher writes the request text) | QA reproduces → owner fixes → QA regression test → Producer tags → Publisher what's-new line ("Fixes …", ≤ 100 chars per language) |
| **S2** | Reproducible bug that blocks a feature for some users (a language, a device class, a skin, the shop), rating-driving complaint cluster (≥ 3 reviews with the same cause in a week) | Fix within 2 sessions; ships in the next planned 1.0.x / 1.1 | same, no expedited review |
| **S3** | Cosmetic, wording, a translation, a single-device quirk | Backlog "Bugs", next release | Producer prioritises |

### 5.2 Daily rota (inside the 04:00 UTC session; the order is the order of reading)

| # | Read | Who | Then |
|---|---|---|---|
| 1 | Android vitals (crash rate, ANR rate, top stack traces) and App Store crashes — from the stakeholder's paste in the report thread, or "n/a" | **QA Engineer** | S1/S2 → "Bugs" with repro; a WebView crash → Mobile Engineer, a JS `pageerror` → Frontend Engineer, a sim invariant → Gameplay Engineer, a level never won → Level Designer + AI Engineer |
| 2 | Store reviews (Play, App Store), new since yesterday | **Publisher** | Reply within 48 h in the reviewer's language (templates §5.3); a bug in a review → row 1; a feature request → "Icebox" |
| 3 | Support mail (privacy B.7: deletion / restore requests) | **Publisher** drafts, stakeholder sends | Restore: point to the shop's Restore Purchases; deletion: the Support ID from Settings → About → RevenueCat customer delete (stakeholder does it in the RevenueCat dashboard; the game holds no server data) |
| 4 | RevenueCat: refunds, failed transactions | **Monetization Designer** | A product that fails everywhere → S1; a refund spike on one product → re-read its description |
| 5 | AdMob: policy centre warnings, fill rate | **Monetization Designer** | A policy warning is S1 for the ads layer (the ad caps or a placement) — Mobile Engineer + Publisher |
| 6 | CI on the branch; the daily / twist gates | **QA Engineer** | Red → fixed before anything else ships (`docs/PLAN.md` rule) |
| 7 | Prioritise, assign, ship, report | **Producer** | The report's "Rəqəmlər" table gains crash %, ANR %, rating, open S1/S2 |

### 5.3 Review replies (Publisher; one reply per review, never a template pasted verbatim, no promises of dates)

- EN — bug: "Thanks for the report. Which level and phone was it on? We fix these fast — the next update carries the fix, and you can write to [developer e-mail] if it blocks you." / praise: "Thank you! The daily challenge changes every day at 00:00 UTC — see you there." / ads: "Ads only appear between levels, never during a battle and never in the first five levels; Remove Ads in the shop switches them off for good."
- AZ — bug: "Bildiriş üçün təşəkkür. Hansı səviyyə və telefon idi? Növbəti yeniləmədə düzəldəcəyik; blok edirsə [developer e-mail]-ə yazın." / praise: "Təşəkkür! Günlük çağırış hər gün 00:00 UTC-də (Bakı 04:00) dəyişir — görüşərik." / ads: "Reklam yalnız səviyyələr arasında çıxır, döyüşdə və ilk beş səviyyədə heç vaxt; mağazadakı 'Reklamları sil' onları həmişəlik söndürür."
- RU — bug: "Спасибо за сообщение. На каком уровне и телефоне это было? Исправим в следующем обновлении; если мешает играть — напишите на [developer e-mail]." / praise: "Спасибо! Ежедневный вызов меняется каждый день в 00:00 UTC — до встречи." / ads: "Реклама показывается только между уровнями, никогда во время боя и никогда на первых пяти уровнях; «Убрать рекламу» в магазине отключает её навсегда."
- TR — bug: "Bildirim için teşekkürler. Hangi seviye ve telefondu? Sonraki güncellemede düzelteceğiz; oyunu engelliyorsa [developer e-mail] adresine yazın." / praise: "Teşekkürler! Günlük meydan okuma her gün 00:00 UTC'de değişir — görüşmek üzere." / ads: "Reklamlar yalnızca seviyeler arasında çıkar, savaş sırasında ve ilk beş seviyede asla; mağazadaki 'Reklamları kaldır' onları kalıcı olarak kapatır."

The `[developer e-mail]` placeholder is the same one as in the privacy and support pages (checklist G18).

### 5.4 Hotfix mechanics (1.0.x)

`package.json` patch version + `config.buildNumber` +1 → `npm run version:sync` → `npm run check` + `npm run playtest` (+ `--daily` / `--twist` if levels or AI changed) → `RELEASE_NOTES.md` gets a short "v1.0.x — fixes" section (EN + AZ, one line per fix, what's-new ≤ 100 chars × 4 languages) → Producer tags from the GitHub UI → release jobs → Play staged rollout (S1: 100 % at once; else 20 % → 100 % over 48 h) / App Store (S1: expedited review) → Pages deploys automatically. A save written by 1.0.x must open in 1.0.0 too (schema v3, additive fields only) so a staged rollout that is halted never strands anyone.

## 6. Content roadmap — 1.0.1, 1.1 and later (owner per item)

Everything on this list is verifiable by the reference bot or by a test; everything that needs an account or a server stays in "Later" (`docs/PLAN.md` "After M3").

### 6.1 1.0.1 — polish and telemetry-free tuning (target tag L+12, in the stores by L+14; skipped if nothing below is ready or needed)

The Grand Campaign (levels 41–50) and the Weekly Challenge that were planned here shipped in 1.0.0 itself (Producer decision 2026-09-21; `RELEASE_NOTES.md` "In this build"), as did the daily pool 9–50, the 42-day no-repeat picker (DAILY-4) and the "(00:00 UTC)" countdown label. 1.0.1 is therefore a polish release: no new content, no schema change, nothing that needs a store product.

| Item | What | Owner | Gate |
|---|---|---|---|
| Hotfixes from §5 | Whatever the closed test and the first reviews find (S1/S2 go out as 1.0.x hotfixes on their own schedule, §5.4) | as assigned | `npm run check`, e2e, the failing case pinned by a test |
| Tuning without telemetry | The game reports nothing (privacy policy), so the only signals are store reviews (§5.3), the bot and the team's own play. Any level named in ≥ 3 reviews as "impossible" / "too easy" is re-run with `npm run playtest -- --level N --seeds 100` and `--twist <id>` over the pool; a change stays inside GDD §3's star-clock policy (3★ = 0.9 × bot median) and the twist gates (≥ 47/50). Daily / weekly picks are never edited mid-cycle — a pool or clock change ships with a report note (GDD §7.4, §8.1) | Game Designer (call), Level Designer (JSON), AI Engineer (gates) | 100-seed run before and after; 60-day daily sweep and 26-week weekly sweep green in CI |
| Save upgrade test | A 1.0.0 save with an active daily streak, paid milestones, a weekly best and 41–50 stars opens in 1.0.1 unchanged (schema v3 unchanged) | QA Engineer | unit test with a fixture |
| Screenshots from levels 17+ and 41+ | PUB-6: two enemies, mines, a wall gap (Rules v3), three enemies, one band-5 frame, the WEEKLY tab; Google set stays at 8 (replace 05 and 08?) — Publisher decides the order | Tech Artist renders (`store/tools/renderStoreShots.mjs`), Publisher captions in 4 languages | Frames from the real game; no mock-ups |
| Store texts | What's-new for 1.0.1 (bug-fix wording, ≤ 500 chars × 4), listing unchanged unless a claim changed; localised AZ/RU/TR App Store screenshot sets only if a listing in one of those locales exists | Publisher | Counts in `STORE_LISTING.md` §5 |
| Version | `package.json` 1.0.1 / `config.buildNumber` 6, `npm run version:sync`, tag `tower-clash-v1.0.1` | Publisher (bump), Producer (tag) | `npm run version:check` |

### 6.2 1.1 — next content (target tag L+27; anything whose gate is red slips to 1.2)

Candidates from GDD §7.6 (daily "v2 ideas") and §8.1 (weekly "revisit" notes); all playable offline, none needs an account or a server. The Producer picks the set from the week-2 read (§4.2).

| Item | What | Owner | Gate |
|---|---|---|---|
| **More skins** (skin drop #1) | Two tower roofs or one terrain theme + one helmet, priced in the 100–200 band (ECONOMY.md §3.3); sprites in the lazy skin chunk | Tech Artist, Monetization (price), Frontend (shop) | Readability rules; shop preview; eager bundle ≤ 80 kB |
| Challenge achievements | "7-day challenge streak", "30 daily wins", "4-week weekly streak" (GDD §7.6) — cheap now that `save.challenge` and `save.weekly` exist | Monetization (sizing), Frontend | unit tests; crystal totals inside ECONOMY.md §6.1's band |
| Twist guarantees | Never the same twist on consecutive days (GDD §7.6, still open after DAILY-4): a rejection loop over the twist hash; re-maps future days, so it ships on a release day with a report note and new GDD §7.2 pins | Game Designer, Frontend, AI Engineer (fresh 60-day sweep) | Unit test over 2026-10 … 2027-09; sweep green |
| Week-streak milestones | GDD §8.1 defers them "with the day-30 data"; decide from reviews and the weekly participation the team can see (none — so only if reviews ask) | Game Designer, Monetization | ECONOMY.md §6.1 band |
| Yesterday's map | A second entry on the daily card, no reward, for players who missed the day (GDD §7.6) | Game Designer, Frontend | card fits 360 px; e2e |
| Share card | A screenshot with day / week key, twist and stars, verifiable by anyone with the game (GDD §7.6); Web Share API on the web, Capacitor Share natively — no upload, no network call of our own | Frontend, Tech Artist (layout), Publisher (privacy: nothing leaves the device unless the player shares) | e2e renders the card |
| Unify the streak day | Login streak to UTC as well, or both to local (GDD §7.6) — decided by review evidence from weeks 3–4 | Game Designer | migration keeps existing streaks |
| Phase C offers | `weekend_pack`, first-purchase double (ECONOMY.md §8 Phase C) — only if payer conversion is inside the band and the stores' product lists can grow (new IAP ids → `STORE_LISTING.md` §6.1, Apple review with the version) | Monetization, Frontend, Publisher | RevenueCat products exist |
| Telemetry decision | Whether to add an opt-in, anonymous, aggregate counter for the daily / weekly participation and tutorial completion; if yes: privacy policy **v3**, Data safety / App Privacy re-answered, a Settings toggle, no third-party SDK | Publisher (policy), Game Designer (what is counted), Frontend, stakeholder decision recorded in the report | Default if no answer: **no telemetry** |
| Rating prompt | In-App Review / `SKStoreReviewController` after a 3★ win on level ≥ 10, once, only if the organic rating is ≥ 4.3 | Mobile Engineer, Producer decides | — |
| Sixth biome | Own palette for levels 41–50 (they inherit the volcanic one, GDD §3) — then "FIVE ISLANDS" in the listing becomes six | Tech Artist, Publisher | pixel-readability checks as for the themes |

### 6.3 Later (needs accounts, a server, or evidence)

- Weekly leaderboard for the daily / weekly (GDD §7.6) — accounts + server clock; out of 1.x.
- Enemy-side mutators (sim per-owner modifiers) — the weekly challenge is the first customer.
- Reset notification at 00:00 UTC / Monday 00:00 UTC (Capacitor local notifications, opt-in in Settings) — GDD §7.6; native only, and a permission the privacy policy would have to mention.
- Streak shield (20 crystals, once per 30 days) — only with the Publisher's read on loss-aversion wording in the stores (ECONOMY.md §6.2).
- Remote-configurable ad caps (ECONOMY.md §8 Phase C) — needs a config endpoint, so a network call the privacy policy would have to list.
- Replays, local 2-player — backlog "Icebox".

## 7. Results (filled at L+28 by the Producer with the Monetization Designer)

| KPI | Target | Week 2 | Week 4 | Decision |
|---|---|---|---|---|
| D1 | ≥ 25 % | | | |
| D7 | ≥ 8 % | | | |
| ARPDAU | $0.05–0.10 | | | |
| Payer conversion | 1–2 % of D7 | | | |
| Remove Ads | 0.5–1 % | | | |
| Rating | ≥ 4.3 | | | |
| Crash / ANR | < 1.09 % / < 0.47 % | | | |
| Countries | AZ TR KZ GE → all | | | |
