# Monetization market research — comparables and benchmarks

*Research date: 2026-09-13. Owner: Monetization & Economy Designer. Purpose: price points and ad/IAP norms for `docs/ECONOMY.md` and `tower-clash/src/economy/catalog.ts`.*

**How this was gathered.** The environment's egress proxy blocks direct page loads for every store and most industry sites (list in §7). All figures below were collected from web-search result snippets of the pages cited, not from the pages themselves. Store IAP lists change weekly and are region-priced, so treat comparables as "order of magnitude, verified on 2026-09-13 via snippet" and re-check in the store consoles before launch. Figures marked **(snippet)** come from a search snippet of the cited page; **(est.)** are our own estimates.

## 1. Comparable games — IAP catalogs

| Game (publisher) | Remove ads | Currency packs | Starter / entry | VIP / bundle | Notes |
|---|---|---|---|---|---|
| **Tower War – Tactical Conquest** (SayGames) — the direct reference | "No ads" ≈ **$5** (snippet, user review) | Not visible in snippets; reviews complain about $50–$100 hero/tank offers | — | **VIP is a weekly subscription**, ≈ $30/month (snippet, review) | Interstitials between levels; rewarded video for ×3 production, extra units, air support (see `tower-war-analysis.md` §4). Contains ads + IAP, 4+/Everyone. |
| **State.io** (Azur Games) | "Remove main ads" IAP exists; **rewarded ads stay after purchase** (snippet, Play listing) | Not visible | — | — | Also in Google Play Pass. Same genre, same ad pattern as Tower War: interstitial on level end, optional rewarded. |
| **Mushroom Wars 2** (Zillion Whales / Azur) | — | **500 gems = $4.99** (snippet); "$50 → 12,000 gems" (review) | "Top Sale Pack" $4.99, "Amazing Sale Pack" $9.99 | Golden pass $4.99, Season pack $11.99 | Campaign paywall ≈ $20 (review). Heavier mid-core economy than ours; used only for the gem-per-dollar anchor (≈ 100 gems / $1 at the small tier, ≈ 240 / $1 at $50 → ~2.4× per-dollar value at the top tier). |
| **Art of War: Legions** (Fastone) | Bundled into VIP | **Bunch of Gems $1.99, Sack of Gems $9.99, Chest of Gems $49.99** (snippet, App Store IAP list) | **Beginner Bundle $0.99**, Extra Bundle $4.99, "Rise of the Legend" I/II/III $1.99/$4.99/$9.99 | **VIP Membership $19.99**: daily 125 gems + coin pack + removes forced (interstitial) ads. Also weekly $6.99 / monthly $9.99 / yearly $99.99 subscriptions with 3-day trial (snippet, wiki) | Cleanest public ladder among the comparables: $0.99 → $1.99 → $4.99 → $9.99 → $19.99 → $49.99. |
| **Hero Wars** (Nexters) | No ads model (IAP-only) | Six emerald packs "at fixed prices", amount scales with VIP level, +5 % to +120 % bonus by VIP; monthly "Emerald ×4/×5" sales (snippet, wiki) | Promo starter pack (coins + emeralds + hero) | VIP levels from cumulative spend | Mid-core; useful for "bonus grows with tier" and "first-purchase multiplier" patterns only. |

Take-aways for Tower Clash:
- The two direct genre comparables (Tower War, State.io) both sell **one-time Remove-Ads ≈ $3–5** and keep **rewarded ads after purchase**. That is exactly our model.
- Both direct comparables monetise VIP as a **subscription**; reviews are hostile to it ("$30/month"). We deliberately ship a **one-time Premium bundle** instead (no subscriptions in v1).
- Currency packs at the small end cluster at **≈ 100 hard-currency units per $1** with **+20–40 % more per dollar** at the top tiers.
- Entry offers are **$0.99–$2.99**, and top-of-ladder is $49.99 for casual-strategy (Art of War, Mushroom Wars). $99.99 packs exist mainly in mid-core; we skip it in v1.

## 2. Price-point norms

| Item | Market norm | Source |
|---|---|---|
| Remove ads (one-time) | $2.99–$4.99 in casual/hybrid-casual games; up to $4.99–$9.99 for utility apps; Tower War ≈ $5 | Udonis IAP guide (snippet: "typical entry IAP $1.99–$4.99"; "one-time unlocks $4.99–$9.99"), Tower War reviews |
| Starter pack | Under $5 in 59 % of developer answers, under $10 in 96 % (DoF survey); DoF's thesis: teams over-index on conversion and price too low; "3–5× value" is the standard presentation | Deconstructor of Fun, "Pricing Starter Packs" (2024) (snippet) |
| Currency pack tiers | 3–5 tiers: casual $0.99–2.99, moderate $4.99–9.99, premium $19.99–49.99, whale $99.99+; bundles carry 20–30 % perceived savings; middle tier slightly worse per-unit to push the "best value" tier; show the largest tier first | Segwise "Pricing and bundling" (snippet); Game Developer "5 premium currency pricing tricks" (snippet) |
| First purchase size | 50 % of first purchases are $1.01–$5 | Udonis IAP guide (snippet) |
| Apple price points | 900 price points; $0.99 / $1.99 / $2.99 / $3.99 / $4.99 / $9.99 / $19.99 / $49.99 / $99.99 remain the conventional "tiers" (old Tier 1/2/3/4/5/10/20/50/100); Apple auto-converts to 44 currencies with local rounding; alternate endings .00/.90/.95 allowed | MacStories "Beginner's guide to App Store pricing tiers", Mirava "Apple price tiers explained (2026)", Apple pricing PDF (snippets) |
| Google Play price points | No tier ladder; any local price accepted; Play auto-generates local prices from exchange rates (not PPP) — pricing templates were removed 2025-10-27, prices are per-product now | Play Console help "Set up your app's prices"; pricepush.app "Google Play IAP pricing by country" (snippets) |

## 3. Ad norms (hybrid-casual, level-based)

| Topic | Norm | Source |
|---|---|---|
| Interstitial trigger | Only on a level break (result screen → next), never on a timer; gate the first interstitial behind N cleared levels / sessions / minutes since install | Felix Braberg, "7 best practices for interstitial ads in level-based games" (snippet, via Gamigion/LinkedIn mirrors) |
| Interstitial caps | Cap on **two axes at once**: min seconds since last ad AND min levels since last ad; track win vs loss separately; **never stack an interstitial after a rewarded ad** (reset the timer) | same |
| Interstitial frequency | Start with 1 per session, raise to 2 after two weeks of stable retention; session cap 4–6; hyper-casual runs 3–7/day, hybrid-casual is more conservative | AdReact / Yango / Adapty interstitial guides (snippets) |
| Rewarded placements | Highest converting: continue / extra life after a loss (40–70 % opt-in); currency multiplier ("×2") often > 70 % opt-in; daily reward boost lifts DAU; show the concrete reward ("Watch for 50 gold" beats "Watch for a reward", +10–20 pts opt-in) | Unity rewarded placements, Pangle, AdReact (snippets) |
| Rewarded frequency | 6–10 views/session possible in casual, daily cap 15–20; cooldown 60–120 s between offers; cap the *prompt*, not the *opportunity* | Adjust "10 best practices for rewarded video" (snippet), Pangle |
| Rewarded value rule | A patient free player should progress at ≈ 60–70 % of a payer's pace through rewarded video | Unity (snippet) |
| eCPM (US, 2025) | Rewarded ≈ $13–20 (Android $16.49 / iOS $19.63 per Udonis), interstitial ≈ $14; completion rate 75–95 % | Udonis eCPM report, Business of Apps rewarded video (snippets) |
| Revenue mix | Casual: interstitial 44 % vs rewarded 39 % of ad revenue (TopOn H1 2025); hybrid-casual puzzle/lifestyle 59 % IAP / 41 % ads; action & strategy 82 % IAP / 18 % ads (Sensor Tower State of Gaming 2026) | cas.ai hybrid-monetisation guide, gamedevreports Sensor Tower summary (snippets) |
| Remove-Ads scope | Disables interstitials only; rewarded stays player-initiated (State.io, Art of War VIP "removes forced ads") | store listings (snippets) |

## 4. KPI benchmarks (for targets, not promises)

| KPI | Benchmark | Source |
|---|---|---|
| D1 / D7 / D30 retention, all genres median 2025 | 22 % / < 4 % / 0.7–0.8 %; top 1 %: 64–68 % D1, 13–15 % D30 | GameAnalytics 2025 Mobile Gaming Benchmarks (snippet) |
| D1 retention, strategy genre | 25.4 % (match-3 leads at 32.7 %) | GameAnalytics 2025 (snippet) |
| Payer conversion | RPG/strategy ≈ 1.5 %; casual 0.5–1 % acceptable; "most games 0.5–5 %"; top titles 5–8 % first-purchase with strong starter packs | Sensor Tower / juegostudio (snippet), Udonis, Solar Engine first-purchase guide (snippets) |
| ARPDAU | Hyper-casual $0.03–0.08; ads-only casual $0.01–0.05; **hybrid-casual $0.15–0.50** (top publishers); hybrid ≈ 5× hyper-casual; hybrid adds ≈ 28 % ARPU over ad-only | Playio ARPDAU benchmarks, cas.ai guide (snippets) |
| LTV rule of thumb | LTV ≈ ARPDAU × expected active days (area under retention curve); a median game at $0.10 ARPDAU ≈ $0.20–0.30 LTV | GameAnalytics 2025 (snippet) |
| Willingness to pay for no ads | 90 % of freemium users say they would pay to remove ads (survey figure, optimistic); ~42 % of players filter for "no ads" before installing | Udonis mobile gaming statistics (snippet) |

## 5. Compliance references

- Apple App Review Guideline **3.1.1**: unlocking features, in-game currency, levels, premium content or an ad-free version must use In-App Purchase (US storefront may additionally link out since May 2025; other storefronts may not). Source: developer.apple.com/app-store/review/guidelines (snippet), BuddyBoss / PTKD 3.1.1 explainers.
- Google Play **Payments policy**: virtual currency, extra lives, ad-free versions and new features must use Google Play's billing system. Source: support.google.com/googleplay/android-developer/answer/10281818 (snippet).
- Google Play Console requires an **Ads declaration** ("contains ads": banners, interstitials, native, in-house) before the target-audience section; Android 13+ needs the **advertising ID permission declaration**; users are always told an app has in-app purchases. Source: Play Console help "Ads", "Advertising ID", "Manage target audience" (snippets).
- iOS 14.5+: IDFA access requires **App Tracking Transparency**; AdMob can serve non-personalised ads without it; AdMob's UMP SDK shows GDPR + IDFA explainer messages. Source: AdMob help "About IDFA explainer messages", capacitor-community/admob README (snippets).
- Capacitor plugins available: `@capacitor-community/admob` (interstitial, rewarded, UMP consent), RevenueCat `@revenuecat/purchases-capacitor` (StoreKit 2 + Play Billing wrapper) — engineering choice for Phase B.

## 6. Decisions taken from this research (summary; details in `docs/ECONOMY.md`)

1. Remove Ads at **$3.99** one-time (between the $2.99 entry norm and Tower War's ≈ $5), with a small crystal gift so it also reads as a value pack.
2. Starter Pack at **$2.99** one-time (upper end of DoF's "don't price too low" advice, still inside the $1–5 first-purchase band), ≈ 2.5× face value.
3. Crystal ladder $0.99 / $4.99 / $9.99 / $19.99 / $49.99 with **+0 / +10 / +20 / +30 / +40 %** bonus (monotonic, matches the 20–40 % market spread; no $99.99 tier in v1).
4. Premium bundle **$9.99 one-time** instead of a VIP subscription (both direct comparables are criticised for subscription VIP).
5. Interstitial: level-break only, first after level 5, every 3rd completed level, ≥ 120 s cooldown, never after a rewarded ad — Braberg's two-axis cap.
6. Rewarded placements: ×2 gold, continue, free booster charge, daily crystal chest — the four highest-converting placements in the guides; daily caps per placement.
7. KPI targets for v1 (indie, no paid UA): ARPDAU $0.05–0.10, payer conversion 1–2 % of D7-retained, Remove-Ads 0.5–1 % of installs, D1 ≥ 25 %.

## 7. Blocked sources

`WebFetch` was refused by the egress proxy (`EGRESS_BLOCKED`) for every one of these; only search snippets were available:
apps.apple.com, play.google.com, deconstructoroffun.com, gameanalytics.com, cas.ai, blog.playio.co, blog.udonis.co, felixbraberg.substack.com, gamedevreports.substack.com, businessofapps.com, admob.google.com, adjust.com, gamigion.com. Not attempted (paywalled): sensortower.com reports, statista.com "time to first purchase" (Mistplay/AppsFlyer 2025).

## Sources (as surfaced by search)

- https://apps.apple.com/us/app/tower-war-tactical-conquest/id1579356887 and reviews page
- https://play.google.com/store/apps/details?id=games.vaveda.militaryoverturn
- https://play.google.com/store/apps/details?id=io.state.fight
- https://apps.apple.com/us/app/mushroom-wars-2-rts-strategy/id1141358828 ; https://appgrooves.com/app/mushroom-wars-2-by-zillion-whales-ltd/negative
- https://apps.apple.com/us/app/art-of-war-legions/id1484362191 ; https://artofwar.fandom.com/wiki/Recruit_Camp
- https://hero-wars.fandom.com/wiki/Emeralds ; https://support-hwa.nexters.com/hc/en-us/articles/24328206817298-Emerald-Shop-and-Regular-Gifts
- https://www.deconstructoroffun.com/blog/2024/4/8/free-to-play-starter-pack-pricing-when-conversion-is-king-we-may-price-too-low
- https://www.blog.udonis.co/mobile-marketing/mobile-games/in-app-purchases ; https://www.blog.udonis.co/mobile-marketing/mobile-apps/ecpms ; https://www.blog.udonis.co/mobile-marketing/mobile-games/mobile-gaming-statistics
- https://www.gameanalytics.com/blog/how-to-price-your-in-app-purchase-items ; https://www.gameanalytics.com/reports/2025-mobile-gaming-benchmarks
- https://segwise.ai/blog/best-practices-for-pricing-and-bundling-in-mobile-games-clxo9g5vs001cagmd5b99bm71
- https://www.gamedeveloper.com/business/5-premium-currency-pricing-trends-and-tricks-used-by-mobile-free-to-play-games
- https://cas.ai/blog/hybrid-monetization-in-mobile-games-a-practical-guide/ ; https://blog.playio.co/arpdau-benchmarks-mobile-games
- https://gamedevreports.substack.com/p/sensor-tower-the-state-of-the-mobile ; https://www.juegostudio.com/blog/arpdau-benchmarks-by-game-genre
- https://felixbraberg.substack.com/p/7-best-practices-for-interstitial ; https://www.gamigion.com/7-best-practices-for-interstitial-ads-in-level-based-games/
- https://unity.com/blog/the-fundamentals-of-rewarded-video-ad-placements ; https://www.adjust.com/blog/understanding-rewarded-video-ads/ ; https://www.pangleglobal.com/resource/5e958976678921000f41e70a ; https://adreact.com/blog/interstitial-ad-best-practices-mobile-games/
- https://www.businessofapps.com/ads/rewarded-video/
- https://www.macstories.net/stories/a-beginners-guide-to-app-store-pricing-tiers/ ; https://www.mirava.io/blog/apple-app-store-price-tiers-explained ; https://www.apple.com/newsroom/pdfs/App-Store-Pricing-Update.pdf
- https://support.google.com/googleplay/android-developer/answer/6334373 ; https://pricepush.app/blog/google-play-iap-pricing-by-country ; https://pricepush.app/blog/google-play-pricing-templates-removed
- https://developer.apple.com/app-store/review/guidelines/ ; https://support.google.com/googleplay/android-developer/answer/10281818 ; https://support.google.com/googleplay/android-developer/answer/9857753 ; https://support.google.com/googleplay/android-developer/answer/6048248
- https://support.google.com/admob/answer/10115027 ; https://github.com/capacitor-community/admob
