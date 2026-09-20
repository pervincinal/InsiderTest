# Tower Clash — post-launch plan (first four weeks after 1.0)

Owner: Publisher (this file); each row names the role that does the work. Written 2026-09-20 for backlog item M4-3 against the v1.0.0 release candidate (`RELEASE_NOTES.md`). Nothing here is a request to the stakeholder: every step that needs a human is already in `LAUNCH_CHECKLIST.md` with a status, and the team applies the defaults below when no answer arrives (`docs/PLAN.md` "Daily cadence").

**Day L** = the day the Producer creates the `tower-clash-v1.0.0` tag. Everything is dated relative to it because the calendar date depends on the stakeholder's gates (`LAUNCH_CHECKLIST.md` §8). Two channels open at different times: the **web/PWA** (GitHub Pages) can go public on L itself; the **stores** open only after the accounts, signing secrets and Phase B keys exist — so "L" for the store KPIs is the day the Play production rollout / App Store release happens, and the web channel runs ahead of it.

## Qısa xülasə (Azərbaycanca)

1.0 tag-ından sonrakı dörd həftənin planı. **Yumşaq buraxılış:** əvvəlcə veb (GitHub Pages, dünya üzrə, hesab tələb etmir), sonra Google Play qapalı test → istehsal və App Store, ilk iki həftə yalnız Azərbaycan, Türkiyə, Qazaxıstan və Gürcüstanda (oyunun dilləri AZ/RU/TR/EN-dir; bu bazarlar ucuzdur və rəy toplamaq üçün kifayətdir), 2-ci həftənin sonunda göstəricilər yerindədirsə bütün ölkələr. **Tərəf-müqabildən lazım olan** hər şey `LAUNCH_CHECKLIST.md`-dədir: hesablar (G1, A1), imza açarları (G3–G4, A3–A5), Pages (W3), ödəniş profilləri (MZ1–MZ2), AdMob/RevenueCat (MZ7, MZ13), 12 test istifadəçisi (G19), tag (V3). **İzlənən göstəricilər** (§3): D1 ≥ 25 %, D7 ≥ 8 %, D30 ≥ 2 %; ARPDAU $0.05–0.10; ödəyici 1–2 % (D7 qalanlardan); Reklamları sil 0.5–1 %; qiymət ≥ 4.3; çöküş < 1.09 %, ANR < 0.47 % (Google-un hədləri). Oyunda analitika yoxdur (məxfilik siyasəti) — rəqəmlər yalnız mağaza konsollarından, RevenueCat və AdMob-dan gəlir; günlük çağırışda iştirak 1.0-da ölçülmür. **LiveOps təqvimi** (§4): günlük çağırış avtomatik işləyir (28 günlük cədvəl aşağıda), seriya mükafatları 3/7/30-cu gün, 1.0.1-də 41–50-ci səviyyələr, 1.1-də həftəlik çağırış və yeni görünüşlər. **Növbətçilik** (§5): QA hər səhər çöküş/ANR-ə baxır, Publisher mağaza rəylərinə 48 saat içində cavab yazır, Producer gündəlik sprintdə prioritet verir. **Yol xəritəsi** (§6): 1.0.1 (L+2 həftə) — 5-ci band paketi, düzəlişlər; 1.1 (L+5–6 həftə) — həftəlik çağırış, görünüşlər, Phase C təkliflər; sonra — liderlər cədvəli (hesab lazımdır).

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
| **Daily Challenge** | every UTC day, 00:00 | New level / seed / twist for everyone (GDD §7); card, countdown, streak | Automatic. AI Engineer re-runs `npm run playtest -- --daily <L> --days 28 --seeds 5` on L−1 and on every level or AI change; the day table is §4.3 | Reset is 04:00 Baku, 03:00 Istanbul, 05:00/06:00 Almaty — the soft-launch countries see it in the morning. Any pool edit (adding 41–50) re-maps every future day (GDD §7.4): only with a build and a report note, never mid-day |
| **Streak milestones** | per player: day 3 / 7 / 30 of a win streak | +5 / +20 / +100 crystals once per streak run (GDD §7.2, ECONOMY.md §6.2); **day 30 does not repeat at 60 / 90** — decided 2026-09-20 (GDD §7.2 "Day 30", DAILY-3): distinct day-60 / day-100 tiers are the only variant, and only with streak data | Automatic. Monetization Designer watches the crystal economy through the shop's skin sales in RevenueCat (no other signal) | First players can reach day 7 on L+6 and day 30 on **L+29** — the 1.0.1 build must keep `save.challenge.milestones` across the update (schema v3 unchanged; QA adds an upgrade test, §6) |
| **Login reward** | per player, local calendar day, 7-day cycle | Gold days 1–7, crystals on days 4 and 7 (ECONOMY.md §2.1) | Automatic | Documented asymmetry: login = local day, challenge = UTC day (GDD §7.4) — reviews that complain about "streak lost" are the signal to unify (§6, 1.1) |
| **Weekly challenge** | Monday 00:00 UTC — **when it ships (1.1, GDD §8 "proposed 2026-09-20, not implemented", WEEKLY-1)** | One fixed match per ISO week keyed by the UTC Monday: a level from 33 … `POOL_TO`, always one of the four non-plain twists, fixed seed; 100 gold on the first win, 20 crystals once for beating the level's own 3★ clock, a week streak; shown as a **WEEKLY tab on the daily card** (not a second card), unlock after level 32 | Game Designer (§8 rules — written), Frontend (tab, `save.weekly`, 12 keys × 4 languages), AI Engineer (`--weekly <monday> --weeks 26 --seeds 5` gate with a 3★ column), Monetization (confirms 20 crystals against §6.1's 14–15/day band), QA (e2e), Publisher (what's new, listing line) | Not in 1.0. Monday shows a new daily and a new weekly at the same reset — accepted in §8.1. With `POOL_TO` = 40 the weekly draws from band 4 only; GDD §3 says the weekly is the first place 41–50 appear once the pool grows |
| **Skin drop** | one per release from 1.0.1 (§6) | New skin(s) visible in the Skins tab with a "New" badge (badge exists? — Frontend to confirm; otherwise the shop order puts new items first) | Tech Artist (sprites), Monetization (price), Frontend (shop), Publisher (store screenshot 08 if the shop frame changes) | Cosmetic only; never a limited-time price in 1.x (no server clock to enforce it honestly) |
| **Store reviews** | daily | Reply within 48 h (§5) | Publisher | — |
| **Ratings prompt** | none in 1.0 | The game never asks for a rating (no `SKStoreReviewController` / In-App Review call) — decision for 1.1 after the first 30 organic ratings | Producer | Do not add before the rating is known to be ≥ 4.3 |

### 4.2 Week by week

| Week | Dates | Beats | Release | Owner |
|---|---|---|---|---|
| 1 | L … L+6 | Tag, Pages live, closed testing starts; daily runs; **first hotfix window** (1.0.1-rc if S1); day-3 streak first reachable on L+2, day 7 on L+6 | none planned (1.0.x only if S1/S2) | Producer, QA |
| 2 | L+7 … L+13 | KPI sheet starts; sandbox purchases; band 5 pack final verification (`playtest --level 41..50`, 100 seeds, star clocks); daily-pool decision for 41–50 | **1.0.1 tagged on L+12**, to Play production + App Store review on L+13 so it is the build in the stores at L+14 | Level Designer, AI Engineer, Game Designer, Mobile Engineer, Publisher |
| 3 | L+14 … L+20 | Stores open in AZ/TR/KZ/GE with 1.0.1 (or 1.0.0 if 1.0.1 slipped — the country roll-out does not wait for content); first store reviews; 1.1 scope fixed from the week-2 read | 1.0.2 only if needed | Publisher (reviews), Monetization (ARPDAU read) |
| 4 | L+21 … L+27 | Weekly-challenge build in review; skin drop #1 sprites final; D7 first readable for the store cohort on L+21; retro on L+28 | **1.1 tagged on L+27** if the weekly challenge passes its gate; otherwise 1.1 = skins + fixes and the weekly moves to 1.2 | Game Designer, Frontend, AI Engineer, Tech Artist |

### 4.3 The daily challenge for the next four calendar weeks (from the shipped picker, `src/daily/challenge.ts`, run 2026-09-20)

The picker is keyed by the calendar date, not by L, so this table is valid whatever day L falls on; re-run the script for a different window. Every row below is inside the 60-day sweep that passed 60/60 days (300/300 runs) on 2026-09-19.

| Date (UTC) | Level | Twist | | Date (UTC) | Level | Twist |
|---|---|---|---|---|---|---|
| 09-21 Mon | 38 Ring of Fire | Lean rations | | 10-05 Mon | 26 Steamroller | Thin walls |
| 09-22 Tue | 13 Crossfire | Reinforced | | 10-06 Tue | 33 Three Kings | Reinforced |
| 09-23 Wed | 32 Siege Works | Thin walls | | 10-07 Wed | 20 Roadblock | Fast feet |
| 09-24 Thu | 39 The Long Night | Fast feet | | 10-08 Thu | 27 Armour Race | Lean rations |
| 09-25 Fri | 26 Steamroller | Lean rations | | 10-09 Fri | 14 Guns and Walls | Reinforced |
| 09-26 Sat | 33 Three Kings | Reinforced | | 10-10 Sat | 28 Burn the Bridge | Lean rations |
| 09-27 Sun | 20 Roadblock | Reinforced | | 10-11 Sun | 9 Stone Walls | Fast feet |
| 09-28 Mon | 27 Armour Race | Thin walls | | 10-12 Mon | 34 Weakest Link | Classic |
| 09-29 Tue | 14 Guns and Walls | Classic | | 10-13 Tue | 15 The Citadel | Reinforced |
| 09-30 Wed | 28 Burn the Bridge | Fast feet | | 10-14 Wed | 40 The Crown | Reinforced |
| 10-01 Thu | 38 Ring of Fire | Lean rations | | 10-15 Thu | 21 Behind the Wall | Fast feet |
| 10-02 Fri | 13 Crossfire | Thin walls | | 10-16 Fri | 14 Guns and Walls | Thin walls |
| 10-03 Sat | 32 Siege Works | Lean rations | | 10-17 Sat | 27 Armour Race | Fast feet |
| 10-04 Sun | 39 The Long Night | Classic | | 10-18 Sun | 20 Roadblock | Thin walls |

**Observation for the Game Designer (not a bug, a 1.0.1 candidate).** In this window the day-level repeats with a 10-day period — 38, 13, 32, 39, 26, 33, 20, 27, 14, 28, then the same ten again from 10-01 — because the FNV hash of `YYYY-MM-DD` strings that differ only in the last digit lands on the same residues mod 32 more often than a uniform draw would; 15 distinct levels in 28 days, and level 14 three times. The GDD §7.6 "twist guarantees" idea (never the same level within 14 days, a small rejection loop over the hash) is the fix; it re-maps future days, so it belongs in a numbered release with a report note, ideally 1.0.1 together with the pool decision for 41–50.

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

### 6.1 1.0.1 — "Grand Campaign" (target tag L+12, in the stores by L+14)

| Item | What | Owner | Gate |
|---|---|---|---|
| **Band 5 pack: levels 41–50** | Ten new levels after 40 "The Crown" per GDD §3 "Band 5" (LV-9, in progress 2026-09-20: draft JSON `041-twin-rivers` … `050-the-crown-reforged` in the working tree, untracked, not yet in the manifest): **no new mechanic**, exactly three enemies, all tower kinds, ≥ 1 bridge and ≥ 1 mine per level, 10–12 towers, aggression 0.6 → 0.9 non-decreasing, no mirror match, names ≤ 15 chars with AZ/RU/TR twins, volcanic palette until a sixth biome exists; unlocks when level 40 has a star; band-5 full-3★ bonus 20 crystals, `crystalsPerMilestone[50]` = 60, `stars_40` target = campaign length (id kept), new `grand_campaign` "Clear level 50" 10 crystals, one skip in the band | Level Designer (JSON, `npm run levels:manifest`), Game Designer (brief — done; §3 band table row), AI Engineer (`playtest --seeds 20` ≥ 95 %, `--upgrades max --seeds 10` median ≤ 2.5★ over 50, every twist ≥ 4/5 at K = 5 and ≥ 45/50 at K = 50 with `--pool 9-50` or a local `POOL_TO`), Monetization (confirms the crystal sizes), Frontend (`MAX_LEVEL_ID` / band hooks — partly in the tree), Tech Artist (biome, optional), QA (content e2e screenshots level 50) | 10/10 won, idle never wins, every win < 180 s; star clocks by the v2 policy (3★ 25–50 s, no placeholder 40 / 80 s left); `npm run levels:check` "50 level(s) valid"; eager bundle ≤ 80 kB (levels are lazy); `npm run check` green |
| Daily pool stays 9–40 | **Decided in GDD §3 (2026-09-20):** `POOL_TO` stays 40 when the pack ships; the pool grows to 9–50 only later, in one commit on a release day, after (1) the pack is on every store, (2) the twist-safe gates are green on the shipped JSON, (3) a daily-report note (every future day re-maps, the pinned §7.2 examples change), (4) a fresh 60-day sweep and all five twist gates over 9–50 in CI, (5) §7.5 re-read as 9–50 | Game Designer rules, AI Engineer sweeps, Frontend flips the constant | Not before 1.1; never mid-day |
| Twist / level repeat guard | GDD §7.6 "never the same level within 14 days" rejection loop (see §4.3) — same re-mapping caveat, so bundle it with the pool decision | Game Designer + Frontend (`src/daily/challenge.ts` is Frontend's) + AI Engineer | Unit test: no repeat inside 14 days over 2026-10 … 2027-09 |
| Store texts 40 → 50 | Every "40 levels" claim in `STORE_LISTING.md` (TODO line at its top lists the places), `README.md`, what's-new "10 new Grand Campaign levels" | Publisher | Only after the ten JSON files are in `src/levels/` |
| Screenshots from levels 17+ and 41+ | PUB-6: two enemies, mines, a cut bridge, three enemies, one band-5 frame; Google set stays at 8 (replace 05 and 08?) — Publisher decides the order | Tech Artist renders (`store/tools/renderStoreShots.mjs`), Publisher captions in 4 languages | Frames from the real game; no mock-ups |
| "(00:00 UTC)" on the daily card | `daily.newIn` / `daily.newInTime` now name the reset (GDD §7.4 deviation closed) — in the Frontend Engineer's working tree on 2026-09-20, uncommitted; expected in 1.0.0 itself, listed here only in case it slips | Frontend Engineer | e2e at 360 px (the countdown pill widened to 250 px; the title keeps ≥ 290 px) |
| Save upgrade test | A 1.0.0 save with an active streak and paid milestones opens in 1.0.1 unchanged | QA Engineer | unit test with a fixture |
| Hotfixes from §5 | whatever the closed test found | as assigned | — |

### 6.2 1.1 — "Weekly" (target tag L+27; slips to 1.2 if the weekly gate is red)

| Item | What | Owner | Gate |
|---|---|---|---|
| **Weekly challenge** (GDD §8, proposed 2026-09-20, WEEKLY-1 — rules, UI contract, code sizing and acceptance are written) | `weekKeyOf` = the UTC Monday; `weeklyFor(weekKey)` pure picker over 33 … `POOL_TO` with the four non-plain twists and a fixed seed; equal-for-everyone as §7.2; unlock after level 32; **100 gold** once on the first win, **20 crystals** once for a run at or under the level's `star3` (any attempt in the week); week streak, `save.weekly` keeps 12 weeks, no schema bump; WEEKLY tab on the daily card, HUD chip "Weekly · <name>", result lines, 12 new strings × 4 languages; RETRY after the Monday rollover returns to the map | Game Designer (done), Frontend (`src/daily/challenge.ts` +≈ 35 lines, `src/ui/weekly.ts`, card tab), AI Engineer (`--weekly <monday> --weeks N --seeds K` + CI 26 weeks × 3 seeds), Monetization (20 crystals vs §6.1 band; drops to 15 if it overshoots, never the gold), QA (unit + e2e at 360×640 / 390×844), Publisher (what's new, one listing bullet, privacy unchanged — no new data) | GDD §8.4: picker unit tests incl. Monday pin for 2026-09-21; 26/26 weeks pass at 5 seeds with ≥ 1 3★ run per week; save rules; card e2e; eager bundle ≤ 80 kB |
| **More skins** (skin drop #1) | Two tower roofs or one terrain theme + one helmet, priced in the 100–200 band (ECONOMY.md §3.3); sprites in the lazy skin chunk | Tech Artist, Monetization (price), Frontend (shop) | Readability rules; shop preview |
| Challenge achievements | "7-day challenge streak", "30 daily wins" (GDD §7.6) — cheap once `save.challenge` exists | Monetization (sizing), Frontend | unit tests |
| Unify the streak day | Login streak to UTC as well, or both to local (GDD §7.6) — decided by review evidence from weeks 3–4 | Game Designer | migration keeps existing streaks |
| Phase C offers | `weekend_pack`, first-purchase double (ECONOMY.md §8 Phase C) — only if payer conversion is inside the band and the stores' product lists can grow (new IAP ids → `STORE_LISTING.md` §6.1, Apple review with the version) | Monetization, Frontend, Publisher | RevenueCat products exist |
| Telemetry decision | Whether to add an opt-in, anonymous, aggregate counter for the daily / weekly participation and tutorial completion; if yes: privacy policy **v3**, Data safety / App Privacy re-answered, a Settings toggle, no third-party SDK | Publisher (policy), Game Designer (what is counted), Frontend, stakeholder decision recorded in the report | Default if no answer: **no telemetry** |
| Rating prompt | In-App Review / `SKStoreReviewController` after a 3★ win on level ≥ 10, once, only if the organic rating is ≥ 4.3 | Mobile Engineer, Producer decides | — |

### 6.3 Later (needs accounts, a server, or evidence)

- Weekly leaderboard for the daily / weekly (GDD §7.6) — accounts + server clock; out of 1.x.
- Enemy-side mutators (sim per-owner modifiers) — the weekly challenge is the first customer.
- Share card (day key + twist + stars), yesterday's map, reset notification (Capacitor local notifications, opt-in) — GDD §7.6.
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
