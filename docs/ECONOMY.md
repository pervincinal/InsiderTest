# Tower Clash — Economy & Monetization (v1 design)

Owner: Monetization & Economy Designer. Status: **design, not yet implemented** (GDD §6 still lists ads/IAP as out of scope for v0.2; this document is the plan that replaces that line when Phase A ships). Machine-readable twin: `tower-clash/src/economy/catalog.ts` — every number here must match it (`tests/economy/catalog.test.ts` guards the invariants). Market evidence: `docs/research/monetization-market.md`.

---

## Qısa xülasə (Azərbaycanca)

- **İki valyuta.** *Qızıl* (gold, oyunda qazanılır: ulduzlar, gündəlik mükafat, reklam izləmə) və *Kristal* (crystals, nadir hallarda qazanılır: 10/20/30/40-cı səviyyə mərhələləri, hər zonada bütün səviyyələri 3 ulduzla keçmək, nailiyyətlər, 7 günlük giriş seriyası; həmçinin pulla alınır). Kristal → qızıl çevrilə bilər (1 kristal = 5 qızıl), qızıl → kristal **heç vaxt**.
- **Qızıl nəyə xərclənir:** mövcud gücləndiricilər (Overdrive 30 / Freeze 40 / Airstrike 50) və daimi **Komandir təkmilləşdirmələri** — 5 xətt × 5 pillə (istehsal +4 %/pillə, tutum +5 %/pillə, başlanğıc qarnizon +1/pillə, gücləndirici qiyməti −5 %/pillə, yürüş sürəti +3 %/pillə; hər xətt cəmi 1 100 qızıl, hamısı 5 500).
- **Kristal nəyə xərclənir:** görünüş dəstləri (qüllə damları, əsgər dəbilqələri, ada mövzuları — 80–200 kristal), səviyyəni keçmək (30 kristal, yalnız 3 məğlubiyyətdən sonra), məğlubiyyətdən sonra davam etmək (10 kristal və ya pulsuz reklam), gücləndirici sandığı (60 kristal).
- **Enerji / can sistemi yoxdur** — qəsdən rədd edilib (aşağıda səbəbi).
- **Alışlar (ABŞ dolları, Apple/Google standart qiymətləri):** kristal paketləri $0.99 / 4.99 / 9.99 / 19.99 / 49.99 (100 / 550 / 1 200 / 2 600 / 7 000 kristal, bonus 0 → 40 %); **Başlanğıc paketi $2.99** (bir dəfə: 400 kristal + 400 qızıl + eksklüziv dəbilqə); **Reklamları sil $3.99** (bir dəfə: səviyyələr arası reklam yoxdur + 50 kristal hədiyyə); **Premium paket $9.99** (bir dəfə: reklamları sil + 600 kristal + 2 eksklüziv görünüş + gücləndiricilərə daimi −10 %). Abunəlik yoxdur.
- **Reklamlar:** hər 3-cü tamamlanmış səviyyədən sonra bir interstisial (ilk 5 səviyyədə heç vaxt, döyüş içində heç vaxt, ən azı 120 s fasilə). Mükafatlı videolar (oyunçu özü seçir): nəticə ekranında ×2 qızıl, məğlubiyyətdən sonra davam, +1 pulsuz gücləndirici (gündə 3), gündəlik kristal sandığı (gündə 1). "Reklamları sil" yalnız interstisialları söndürür. Veb versiyada reklam SDK-sı yoxdur.
- **Hədəflər (bazar araşdırmasına görə):** ilk alışa keçid 1–2 % (7-ci gün qalan oyunçulardan), ARPDAU $0.05–0.10, "Reklamları sil" alanlar quraşdıranların 0.5–1 %-i.
- **Mərhələlər:** A — iqtisadiyyat + mağaza + veb üçün saxta ödəniş/reklam; B — RevenueCat + AdMob (Android/iOS); C — canlı təkliflər (həftəsonu paketi, ilk alışda ikiqat kristal).

---

## 1. Principles (from `.claude/agents/monetization-designer.md`)

1. **Fair-to-play first.** Every purchasable *advantage* (commander upgrades, boosters) is earnable with gold; crystals only buy time, cosmetics and convenience. No level requires a purchase (GDD §3: every level is winnable by the reference bot with zero upgrades — that stays the acceptance test).
2. **Ads never interrupt a battle.** Interstitials fire only on the level break; rewarded ads are always player-initiated.
3. **Platform price tiers** ($0.99 / 1.99 / 2.99 / 3.99 / 4.99 / 9.99 / 19.99 / 49.99); Apple and Google auto-convert regionally.
4. **One-time purchases only in v1.** No subscriptions, no loot boxes, no paid randomness (keeps the IARC/App Store "no simulated gambling" answers true).
5. **Every number has a rationale** and is mirrored in `catalog.ts`.

## 2. Currencies

| | Gold (soft) | Crystals (hard) |
|---|---|---|
| Icon / colour | coin, amber | gem, cyan |
| Earned by | stars on first clear (**10 / star**, existing GDD §2.6), star improvements (10 per new star), replays (3 / star, ≤ 100 gold per day), daily reward, rewarded "×2 gold" | level milestones, full-band 3★, achievements, daily-streak days 4 and 7, daily crystal chest (rewarded ad), **IAP** |
| Spent on | boosters, commander upgrades | skins, level skip, continue, booster crate, gold conversion |
| Cap | none (integer, ≥ 0) | none |
| Save field | `coins` (existing; rename to `gold` in the UI only, keep the save key) | `crystals` (new, save schema v3) |

**Conversion rule.** Crystals → gold at **1 crystal = 5 gold**, in packs of 20 / 100 / 500 crystals (100 / 500 / 2 500 gold). Gold → crystals **never** (crystals must stay scarce so skins and skips hold their value). Rationale for the rate: the cheapest booster (30 gold) costs 6 crystals ≈ $0.06 at the $0.99 pack — cheap enough that a payer never feels blocked, expensive enough that 400 starter-pack crystals (2 000 gold) ≈ 10 days of free play rather than the whole tree.

### 2.1 Earn rules (free player)

| Source | Gold | Crystals | Notes |
|---|---|---|---|
| First clear | 10 × stars | — | existing; 40 levels × 3★ = 1 200 max |
| Star improvement on replay | 10 × new stars | — | replaying a 1★ level to 3★ pays 20 |
| Replay, no new star | 3 × stars | — | "drill pay", daily cap 100 gold — keeps 3★ hunting rewarded but not farmable |
| Rewarded ad: ×2 gold | doubles that result's gold | — | cap 5 / day |
| Daily reward (7-day streak, loops) | D1 20, D2 30, D3 40, D5 60, D6 80, D7 100 | D4 5, D7 15 | streak resets after a missed calendar day; 330 gold + 20 crystals per full week |
| Level milestones (levels cleared) | — | 10 → 20, 20 → 30, 30 → 40, 40 → 60 | 150 total |
| Full band at 3★ (1–8, 9–16, 17–24, 25–32, 33–40) | — | 20 per band | 100 total; the long-tail goal |
| Achievements (10, one-time) | — | 5–20 each, 85 total | list in `catalog.ts` `ACHIEVEMENTS` |
| Daily crystal chest (rewarded ad) | — | 5 | cap 1 / day, 20 h cooldown |

## 3. Sinks

### 3.1 Boosters (gold, existing)
Overdrive 30, Freeze 40, Airstrike 50 (GDD §2.6). Unchanged. New: **booster charges** — an inventory of pre-paid uses (from the crate, rewarded ads, offers). A charge is consumed before gold. Discounts (commander track + premium) apply to the gold price only, rounded up, combined cap −30 %.

**Booster crate (crystals):** 60 crystals → 5 Overdrive + 3 Freeze + 2 Airstrike charges (370 gold of boosters for 300 gold-equivalent, −19 %).

### 3.2 Commander upgrades (gold, permanent, 5 tracks × 5 tiers)

| Track | Effect per tier | Max (tier 5) | Where it applies in the sim |
|---|---|---|---|
| Production | +4 % | **+20 %** | player-owned generation interval ÷ 1.20 |
| Capacity | +5 % | **+25 %** | player-owned tower capacity × 1.25, floor |
| Starting garrison | +1 unit | **+5** | added to each player-owned tower at `createState` |
| Booster cost | −5 % | **−25 %** | gold price of boosters, ceil |
| March speed | +3 % | **+15 %** | player units' road speed × 1.15 |

Tier cost (every track): **60 / 120 / 200 / 300 / 420** gold → 1 100 per track, **5 500** for the full tree. Tier N+1 unlocks only after tier N.

**Advantage cap (the "GDD advantage limit").** With everything maxed the player's edge is: +20 % throughput, +25 % capacity, +5 units per tower at start, +15 % speed. On a typical opener (one L1 barracks) that is 41 units after 30 s instead of 30 — roughly *one extra L1 barracks' worth of production during the first minute*. Booster discount is economic, not tactical. Acceptance test (owned by AI engineer + QA, Phase A): `npm run playtest -- --upgrades max` must show the reference bot's **median star count ≤ 2.5 across all 40 levels** and no level whose 3★ clock the bot beats on 100/100 seeds; if either fails, the *tier effects* shrink (never the costs). The limit is encoded as `ADVANTAGE_LIMIT` in `catalog.ts` and the unit test refuses any tier table that exceeds it. Enemy AIs never receive upgrades.

### 3.3 Skins (crystals, cosmetic only)

| Category | Skin | Crystals | Source |
|---|---|---|---|
| Tower roof | Slate | 80 | shop |
| Tower roof | Pagoda | 120 | shop |
| Tower roof | Onion dome | 150 | shop |
| Tower roof | Gold | — | Premium exclusive |
| Unit helmet | Bronze | — | Starter Pack exclusive |
| Unit helmet | Viking | 100 | shop |
| Unit helmet | Knight | 120 | shop |
| Unit helmet | Samurai | 150 | shop |
| Unit helmet | Royal | — | Premium exclusive |
| Terrain theme | Dusk | 150 | shop |
| Terrain theme | Winter night | 200 | shop |
| Terrain theme | Neon | 200 | shop |

Skins never change hitboxes, colours that encode ownership (blue/red/green/yellow/grey stay), or readability (pillar 1). Colour-blind palette wins over any theme. Backlog M3-2 (two roofs + two unit shapes for coins) is superseded: the first two of each become the 80/100-crystal entries; nothing is sold for gold.

### 3.4 Level skip (crystals)
30 crystals. Offered only after **3 consecutive defeats** on the same level; grants 1★ and unlocks the next level; pays no gold, counts toward milestones but not toward "full band at 3★". At most one skip per band (5 per campaign). Rationale: a frustration valve, not a progression product.

### 3.5 Continue after defeat — "Reinforcements" (rewarded ad or 10 crystals)
On the defeat screen: *Watch a video* (cap 3 / day) or *10 crystals*. Effect: the sim rewinds to the snapshot **20 s before the defeat** (the game loop keeps a ring buffer of state snapshots every 5 s — cheap because the state is plain data and deterministic), then grants a free Freeze (5 s) and +15 infantry to the player's highest-garrison tower. Once per attempt. Result stars are computed from the original start time (continuing never improves the star clock).

### 3.6 Energy / lives — **none, rejected**
- Levels are 1–3 minutes; energy would gate the exact behaviour (retrying for 3★) the design wants.
- Both direct comparables (Tower War, State.io) have no energy; adding it would make us the least generous game in the niche.
- Energy is the single most reviewed-against mechanic in casual strategy reviews and would cost the "honest by design" store positioning that the listing already leans on.
- Our sinks (upgrades, skins, skips) already give crystals a purpose without throttling play.

## 4. IAP catalog (USD; Apple auto-converts by tier, Google by exchange rate)

| Product id | Kind | USD | Apple tier (legacy name) | Grants | Rationale |
|---|---|---|---|---|---|
| `crystals_100` | consumable | **$0.99** | Tier 1 | 100 crystals (+0 %) | anchor: ≈ 100 crystals / $ like Mushroom Wars 2 / Art of War |
| `crystals_550` | consumable | **$4.99** | Tier 5 | 550 (+10 %) | most-bought tier in casual |
| `crystals_1200` | consumable | **$9.99** | Tier 10 | 1 200 (+20 %) | "best value" badge |
| `crystals_2600` | consumable | **$19.99** | Tier 20 | 2 600 (+30 %) | |
| `crystals_7000` | consumable | **$49.99** | Tier 50 | 7 000 (+40 %) | top of ladder for casual-strategy; no $99.99 in v1 |
| `starter_pack` | one-time | **$2.99** | Tier 3 | 400 crystals + 400 gold + Bronze helmet | ≈ 2× face value; shown after level 5 (first interstitial moment), once |
| `remove_ads` | one-time | **$3.99** | Tier 4 | no interstitials forever + 50 crystals | between the $2.99 casual norm and Tower War's ≈ $5 |
| `premium_bundle` | one-time | **$9.99** | Tier 10 | remove ads + 600 crystals + Gold roof + Royal helmet + −10 % booster gold cost | replaces the subscription-VIP the comparables are criticised for |
| `premium_upgrade` | one-time | **$4.99** | Tier 5 | 550 crystals + the two Premium skins + −10 % booster cost | shown *instead of* `premium_bundle` to owners of `remove_ads`, so nobody pays for no-ads twice |
| `weekend_pack` | consumable, LiveOps (Phase C) | **$1.99** | Tier 2 | 250 crystals + 250 gold | Fri–Sun, once per weekend |

Bonus % is strictly increasing with price (tested). Google Play has no tier ladder any more (templates were removed 2025-10-27): enter the same USD prices per product and let the console generate local prices; review India/Brazil/Türkiye manually because Google converts by exchange rate, not purchasing power (Apple already does PPP-ish rounding). Do not hand-set Azerbaijan: both stores price AZ storefronts in USD.

**Not in v1:** subscriptions, $99.99 pack, gold-for-money (gold is only ever a by-product of crystals), paid random boxes.

## 5. Ads

### 5.1 Interstitial — `int_level_break`
- Fires only when the player leaves the **result screen** (win or loss) — never before or during a battle, never on the map or in menus.
- Gate: not until **5 levels have been completed** (first possible after the 6th result); then **every 3rd completed level**.
- Two-axis cap (Braberg): also **≥ 120 s since the last ad of any kind**, and **never if a rewarded ad was watched on that result screen** (rewarded resets the counter).
- Session cap 4. Skipped entirely when `remove_ads` or `premium_bundle` is owned, and on the web build.

### 5.2 Rewarded video (player-initiated, stays after Remove Ads)

| Placement id | Where | Reward | Daily cap | Cooldown |
|---|---|---|---|---|
| `rv_double_gold` | result screen | ×2 the gold of that result | 5 | 60 s |
| `rv_continue` | defeat screen | Reinforcements (§3.5) | 3 | 60 s |
| `rv_free_booster` | booster bar / shop | +1 charge of the chosen booster | 3 | 120 s |
| `rv_daily_chest` | map screen | 5 crystals | 1 | 20 h |

Buttons always name the reward ("Watch → +20 gold"). If no ad is loaded the button is hidden, never shown disabled. AdMob mediation with the UMP consent form (GDPR / ATT) in Phase B; non-personalised ads when consent is refused.

### 5.3 Web build
No ad SDK. The `AdProvider` interface has a `NoAdsProvider` (all placements unavailable → buttons hidden, interstitial no-op) used by the Pages/PWA build, and a `FakeAdProvider` (dev only, resolves after 1 s, toggled by `?fakeads=1`) so the UI can be tested in Playwright.

## 6. Earn / sink model

Assumptions: ~4 levels per day (≈ 6 attempts), 2.2★ average on first clear, two ×2-gold ads per day, daily chest every day, 40 levels in ≈ 12 days.

| Free player | Gold earned (cum.) | Crystals earned (cum.) | Can afford (cumulative) |
|---|---|---|---|
| After 10 levels (~day 3) | ≈ 450 (220 stars, 130 ×2 ads, 90 daily, 10 replays) | ≈ 50 (20 milestone, 15 chest, 15 achievements) | 6 boosters + tiers 1–2 of one track; 1 continue + 1 skip in reserve |
| After 20 levels (~day 6) | ≈ 970 | ≈ 135 (50 milestones, 20 band 1, 30 chest, 5 daily, 30 achievements) | 8 boosters + one track to tier 4; 1 skin (100–120) |
| After 40 levels (~day 12) | ≈ 2 000 (880 stars, 530 ads, 480 daily, 120 replays) | ≈ 335 (150 milestones, 40 bands, 60 chest, 25 daily, 60 achievements) | 15 boosters + one track maxed + another at tier 2; 2 skins + spare continues |
| Steady state per day (3★ hunting) | ≈ 150–170 | ≈ 8–10 | full tree (5 500) ≈ 3 more weeks; every shop skin ≈ 6 weeks |

| Spender | Gets | What it buys |
|---|---|---|
| **$2.99** Starter Pack | 400 crystals + 400 gold + Bronze helmet | 4 shop skins, **or** 2 000 gold (≈ 2 full tracks), **or** 40 continues; ≈ 10 days of free earnings |
| **$3.99** Remove Ads | no interstitials + 50 crystals | ~1 continue/skip; the purchase is the comfort, not the crystals |
| **$9.99** Premium | no interstitials + 600 crystals + 2 exclusive skins + −10 % boosters | 3 000 gold-equivalent (55 % of the tree) or 5 skins; free + premium after the campaign ≈ 2 000 gold and 935 crystals |
| $4.99 crystal pack | 550 crystals | 2 750 gold ≈ half the tree |

**Targets** (research §4 of `monetization-market.md`; v1 is an indie title without paid UA, so aim for the low end of the bands): payer conversion **1–2 % of D7-retained players** (casual 0.5–1 %, strategy ≈ 1.5 %); ARPDAU **$0.05–0.10** (ads-only casual $0.01–0.05, hybrid-casual publishers $0.15–0.50); Remove Ads **0.5–1 % of installs**; D1 retention ≥ 25 % (strategy median 25.4 %). Intended monthly spend curve: median payer $3–4 (Starter or Remove Ads), ~20 % of payers reach $10–15 (Premium + one pack), < 5 % above $50; ARPPU ≈ $8 / month. Revenue mix goal: ≈ 60 % IAP / 40 % ads (Sensor Tower hybrid-casual split), so neither can be cut without a rethink.

## 7. Store compliance (hand to Publisher — `docs/publishing/STORE_LISTING.md` must change before Phase B ships)

- **Listing claims.** "No ads / no in-app purchases / no network calls / no tracking" lines in both descriptions, the promo text and §4 of the store listing become false in Phase B; replace with "Optional purchases; ads can be removed with a one-time purchase" and keep "no account, progress on device". The Apple "In-App Purchases" list and the Play "Contains ads · In-app purchases" labels are automatic once products / the Ads declaration exist.
- **Google Play:** Ads declaration = *Yes*; Advertising ID declaration = *Yes* (AdMob uses it; Android 13 needs the `AD_ID` permission, added by the SDK); Data safety: *Device or other IDs* collected/shared for advertising, *Purchase history* handled by Google Play Billing; IARC "Purchases of digital goods" = *Yes*, "Ads" = *Yes*. Rating stays Everyone / PEGI 3 (ads are not rated; content unchanged) unless ad creatives are mis-targeted — set AdMob max ad content rating to **G** and mark the app as not child-directed (target audience 13+, so no Families-policy SDK certification is needed; if the stakeholder wants "for all ages" we must adopt Families Self-Certified Ads SDK rules).
- **Apple:** App Privacy label changes from "Data Not Collected" to *Identifiers (Device ID) — Third-party advertising*, *Purchases — App functionality*; **App Tracking Transparency** prompt via UMP before any IDFA use (or serve non-personalised only); age rating 9+ unchanged; all digital goods through StoreKit (**Guideline 3.1.1** — RevenueCat wraps StoreKit 2; no external checkout, no promo links outside the US storefront). Restore Purchases button is mandatory for non-consumables (3.1.1 / 3.1.2).
- **Google Play Billing** for every product (Payments policy: virtual currency, ad-free versions and features must use Play Billing); Play Billing Library ≥ 7 — RevenueCat's Capacitor SDK tracks this.
- **Privacy policy** (`PRIVACY_POLICY.md`, `/privacy.html`): add AdMob (Google LLC) and RevenueCat as processors, advertising identifiers, purchase receipts, consent withdrawal, and the children's clause; link Google's and RevenueCat's policies.
- **Consumer law:** show the local price from the store SDK, never a hard-coded "$0.99"; one-time products must be restorable; the "value ×2" badge on the Starter Pack must be computed from the $0.99 crystal rate (true claim).

## 8. Rollout

**Phase A — economy + shop, web-safe (no SDKs).** Save schema v3 (`crystals`, `upgrades`, `skins`, `charges`, `entitlements`, `daily`, `adCounters`); `economy/` module with `catalog.ts`, `wallet.ts` (earn/spend, conversion), `entitlements.ts`; commander upgrades applied in `createState` via a `PlayerModifiers` object (sim stays pure: modifiers are input, not global state); shop screen (crystals, gold, upgrades, skins, IAP cards); `StoreProvider` interface with `FakeStoreProvider` (dev: succeeds after 1 s, remembers entitlements in localStorage) and `AdProvider` with `NoAdsProvider` / `FakeAdProvider`; `playtest --upgrades max` acceptance; `STORE_LISTING.md` still claims "no purchases" because nothing is purchasable on web. Ship as v0.3.
**Phase B — real money on native.** RevenueCat (`@revenuecat/purchases-capacitor`) + AdMob (`@capacitor-community/admob`, UMP consent) behind the same interfaces; products created in App Store Connect / Play Console with the ids above; sandbox testers; Publisher updates listing, privacy policy, declarations; Remove Ads / Premium reviewed with Apple's non-consumable guidelines. Ship as v1.0 native; web stays ad-free and purchase-free.
**Phase C — LiveOps.** `weekend_pack` (Fri–Sun), *first-purchase double* (first crystal pack grants 2×, flagged in `OFFERS`), seasonal skin drops, band-completion "3★ challenge" bonuses. Remote-configurable ad caps (server- or JSON-driven) so frequencies change without a build.

Handoffs: Game Designer — add §2.7 "Commander modifiers" and the advantage limit to the GDD, and retune star clocks only if `--upgrades max` fails; Gameplay Engineer — `PlayerModifiers` + snapshot ring buffer; Frontend — shop/result/defeat screens; AI Engineer + QA — playtest flag; Mobile Engineer — Phase B plugins; Publisher — §7.
