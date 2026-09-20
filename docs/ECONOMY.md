# Tower Clash — Economy & Monetization (v1 design)

Owner: Monetization & Economy Designer. Status: **design, not yet implemented** (GDD §6 still lists ads/IAP as out of scope for v0.2; this document is the plan that replaces that line when Phase A ships). Machine-readable twin: `tower-clash/src/economy/catalog.ts` — every number here must match it (`tests/economy/catalog.test.ts` guards the invariants). Market evidence: `docs/research/monetization-market.md`.

---

## Qısa xülasə (Azərbaycanca)

- **İki valyuta.** *Qızıl* (gold, oyunda qazanılır: ulduzlar, gündəlik mükafat, reklam izləmə) və *Kristal* (crystals, nadir hallarda qazanılır: 10/20/30/40/50-ci səviyyə mərhələləri (cəmi 210), hər zonada (6 zona, 41–50 daxil) bütün səviyyələri 3 ulduzla keçmək, nailiyyətlər (11, cəmi 95), 7 günlük giriş seriyası; həmçinin pulla alınır). Kristal → qızıl çevrilə bilər (1 kristal = 5 qızıl), qızıl → kristal **heç vaxt**.
- **Qızıl nəyə xərclənir:** mövcud gücləndiricilər (Overdrive 30 / Freeze 40 / Airstrike 50) və daimi **Komandir təkmilləşdirmələri** — 5 xətt (istehsal +2 %/pillə, 3 pillə; tutum +5 %/pillə, 5 pillə; başlanğıc qarnizon +1/pillə, 2 pillə; gücləndirici qiyməti −5 %/pillə, 5 pillə; yürüş sürəti +2 %/pillə, 2 pillə; hər xətt cəmi 1 100 qızıl, hamısı 5 500 — qısa xətlərin pillələri daha bahadır, daha güclü deyil). 2026-09-13 avtomatik oyun sınağından sonra yenidən balanslaşdırılıb: köhnə hədlərlə (+20 % / +5 / +15 %) istinad botu 40 səviyyənin yarısından çoxunu 3 ulduzla keçirdi.
- **Kristal nəyə xərclənir:** görünüş dəstləri (qüllə damları, əsgər dəbilqələri, ada mövzuları — 80–200 kristal), səviyyəni keçmək (30 kristal, yalnız 3 məğlubiyyətdən sonra), məğlubiyyətdən sonra davam etmək (10 kristal və ya pulsuz reklam), gücləndirici sandığı (60 kristal).
- **Gündəlik çağırış (2026-09-18, GDD §7):** hər UTC günü üçün 9–50 hovuzundan bir səviyyə (2026-09-20-dək 9–40), sabit toxum və "bükülmə" (təkmilləşdirmələr və gücləndiricilər söndürülüb). Günün ilk qələbəsi **30 qızıl + hər ulduza 10 qızıl + 5 kristal** verir; təkrarlar heç nə vermir. Modeldə (aktiv günlərin 70 %-i oynanılır, orta 2,2 ulduz) bu gündə ≈ 36 qızıl + 3,5 kristal, 40 səviyyəlik kampaniya ərzində ≈ +364 qızıl / +35 kristal deməkdir. Qiymətlər dəyişmir (§6.1). Təklif: seriya mərhələləri (3 / 7 / 30 gün → 5 / 20 / 100 kristal) və `rv_daily_retry` reklamı (bir dəfə yenidən cəhd + pulsuz Freeze) — yalnız təklif, hələ tətbiq edilməyib.
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
| Earned by | stars on first clear (**10 / star**, existing GDD §2.6), star improvements (10 per new star), replays (3 / star, ≤ 100 gold per day), daily reward, **daily challenge first win (30 + 10 / star)**, rewarded "×2 gold" | level milestones, full-band 3★, achievements, daily-streak days 4 and 7, daily crystal chest (rewarded ad), **daily challenge first win (5)**, **IAP** |
| Spent on | boosters, commander upgrades | skins, level skip, continue, booster crate, gold conversion |
| Cap | none (integer, ≥ 0) | none |
| Save field | `coins` (existing; rename to `gold` in the UI only, keep the save key) | `crystals` (new, save schema v3) |

**Conversion rule.** Crystals → gold at **1 crystal = 5 gold**, in packs of 20 / 100 / 500 crystals (100 / 500 / 2 500 gold). Gold → crystals **never** (crystals must stay scarce so skins and skips hold their value). Rationale for the rate: the cheapest booster (30 gold) costs 6 crystals ≈ $0.06 at the $0.99 pack — cheap enough that a payer never feels blocked, expensive enough that 400 starter-pack crystals (2 000 gold) ≈ 10 days of free play rather than the whole tree.

### 2.1 Earn rules (free player)

| Source | Gold | Crystals | Notes |
|---|---|---|---|
| First clear | 10 × stars | — | existing; 50 levels × 3★ = 1 500 max (band 5 added 2026-09-20) |
| Star improvement on replay | 10 × new stars | — | replaying a 1★ level to 3★ pays 20 |
| Replay, no new star | 3 × stars | — | "drill pay", daily cap 100 gold — keeps 3★ hunting rewarded but not farmable |
| Rewarded ad: ×2 gold | doubles that result's gold | — | cap 5 / day |
| Daily reward (7-day streak, loops) | D1 20, D2 30, D3 40, D5 60, D6 80, D7 100 | D4 5, D7 15 | streak resets after a missed calendar day; 330 gold + 20 crystals per full week |
| Level milestones (levels cleared) | — | 10 → 20, 20 → 30, 30 → 40, 40 → 60, 50 → 60 | 210 total; 50 pays the same as 40 — a second finale, not a bigger one (GDD §3 band 5) |
| Full band at 3★ (1–8, 9–16, 17–24, 25–32, 33–40, 41–50) | — | 20 per band | 120 total; the long-tail goal. Band 5 is 10 levels for the same 20: the per-level dilution is deliberate — the band bonus is the long-tail goal, not pay per level |
| Achievements (11, one-time) | — | 5–20 each, 95 total | list in `catalog.ts` `ACHIEVEMENTS`; `grand_campaign` "Clear level 50" = 10 (a *won* match on level 50 — a skip does not count); `stars_40` keeps its id and 20 crystals, its target is the campaign length (50) |
| Daily crystal chest (rewarded ad) | — | 5 | cap 1 / day, 20 h cooldown |
| **Daily challenge, first win of the UTC day** (GDD §7, `src/daily/challenge.ts` `REWARD`) | 30 + 10 × stars (40 / 50 / 60) | 5 | unlocks after level 8; one deterministic level from the 9–50 pool (9–40 until 2026-09-20, DAILY-4) with a twist, upgrades and boosters off; **replays pay nothing**, a loss pays nothing; the run never writes campaign stars or first-clear gold; `rv_double_gold` is **not** offered on the daily result (see §6.1) |

## 3. Sinks

### 3.1 Boosters (gold, existing)
Overdrive 30, Freeze 40, Airstrike 50 (GDD §2.6). Unchanged. New: **booster charges** — an inventory of pre-paid uses (from the crate, rewarded ads, offers). A charge is consumed before gold. Discounts (commander track + premium) apply to the gold price only, rounded up, combined cap −30 %.

**Booster crate (crystals):** 60 crystals → 5 Overdrive + 3 Freeze + 2 Airstrike charges (370 gold of boosters for 300 gold-equivalent, −19 %).

### 3.2 Commander upgrades (gold, permanent, 5 tracks, 2–5 tiers each)

| Track | Tiers | Effect per tier | Max | Tier costs (gold) | Where it applies in the sim |
|---|---|---|---|---|---|
| Production | 3 | +2 % | **+6 %** | 200 / 350 / 550 | player-owned generation interval ÷ 1.06 |
| Capacity | 5 | +5 % | **+25 %** | 60 / 120 / 200 / 300 / 420 | player-owned tower capacity × 1.25, floor |
| Starting garrison | 2 | +1 unit | **+2** | 400 / 700 | added to each player-owned tower at `createState` |
| Booster cost | 5 | −5 % | **−25 %** | 60 / 120 / 200 / 300 / 420 | gold price of boosters, ceil |
| March speed | 2 | +2 % | **+4 %** | 400 / 700 | player units' road speed × 1.04 |

**Every track costs 1 100 gold** from tier 0 to its cap, so the full tree is still **5 500** and the earn/sink model in §6 is unchanged. Short tracks are *pricier per tier, not stronger*: the three tactical tracks that the playtest showed to be the dangerous ones (production, garrison, speed) got fewer tiers and the same gold folded into them, while the two tracks that cannot trivialise a level (capacity — inert for the bot; booster discount — economic) keep the cheap 5-step ladder that gives a new player something to buy after level 3. Tier N+1 unlocks only after tier N. Ladders live in `catalog.ts` as `TIER_COSTS_5 / _3 / _2`; `UPGRADE_TRACK_COST_GOLD` (1 100) is asserted per track by the catalog test.

**Retune history (2026-09-13).** The v1 draft was 5 × 5 tiers with +4 % / +5 % / +1 / −5 % / +3 % per tier (caps +20 % / +25 % / +5 / −25 % / +15 %). The first `npm run playtest -- --upgrades max --seeds 20` measured a **median of 3.0★** (565 / 235 / 0 / 0 over 40 levels × 20 seeds; baseline without upgrades 2.0★, 176 / 594 / 28 / 2) — the gate below failed, and 18 levels went from a sub-80 % 3★ rate to 85–100 % purely from upgrades. Findings that drove the new caps (same harness, 20 seeds, 3★ runs out of 800; baseline 176):

| Modifiers (everything else off) | 3★ runs | Median | Levels pushed above 80 % 3★ |
|---|---|---|---|
| capacity +25 % | 173 | 2.0 | none — the bot never fills a tower before attacking |
| production +5 % | 239 | 2.0 | 2, 28 |
| production +10 % | 299 | 2.0 | 2, 28, 29, 37, 40 |
| garrison +3 | 270 | 2.0 | 2 |
| speed +10 % | 280 | 2.0 | 2, 14, 28 |
| prod +10 % · cap +25 % · garrison +3 · speed 0 | 353 | 2.0 | 5 levels |
| prod +10 % · cap +25 % · garrison +3 · **speed +5 %** | 399 | 2.0 (400 = 2.5) | 10 levels |
| prod +10 % · cap +25 % · garrison +3 · speed +10 % (the proposed "+2 %/tier" retune) | 420 | **3.0** | 11 levels |
| **prod +6 % · cap +25 % · garrison +2 · speed +4 % (shipped)** | **332** | **2.0** | 6 levels (2, 14, 28, 29, 37, 40) |
| shipped, 40 seeds (1 600 runs, baseline 3★ 22 %) | 673 (42 %) | 2.0 | 5 levels (2, 12, 14, 28, 40) |

Two lessons. (1) The tactical tracks are **super-additive**: production +10 % and speed +5 % each pass comfortably on their own and together sit exactly on the gate, because a faster march *and* a bigger stream of units both shorten the same 3★ clock. (2) A handful of levels sit right on their star clock — **2 Supply Line** (baseline 3★ 22–40 %), **12 Gun Post** (50–55 %), **28 Burn the Bridge** (60–70 %), **40 The Crown** (45 %) — and flip to 90–100 % with *any* upgrade (even production +5 % alone flips 2 and 28). No cap that leaves upgrades meaningful can keep those under 80 %; that is a star-clock question for the Level Designer (hand-off below), not an economy knob. The shipped caps leave a margin of ≈ 8 % of runs below the gate at 40 seeds (673 of 1 600; the gate fails above 800).

**Advantage cap (the "GDD advantage limit").** With everything maxed the player's edge is: +6 % throughput, +25 % capacity, +2 units per tower at start, +4 % speed. On a typical opener (one L1 barracks) that is 34 units after 30 s instead of 30 — *a few seconds of head start, not an extra barracks* — and a 10 s march arrives 0.4 s earlier. Booster discount is economic, not tactical. Acceptance test (owned by AI engineer + QA, Phase A): `npm run playtest -- --upgrades max --seeds 20` must show the reference bot's **median star count ≤ 2.5 across all 40 levels** (target band 2.0–2.5 with margin), and no level should move from a sub-80 % 3★ rate to above 80 % purely from upgrades except the star-clock boundary levels listed above; if the median fails, the *tier effects* shrink (never the costs). The limit is encoded as `ADVANTAGE_LIMIT` in `catalog.ts`; the catalog test refuses any tier table that exceeds it, requires each track to land exactly on it (so the doc, the limit and the playtest headline always describe the same game), and pins the ceilings the playtest established (production ≤ +6 %, garrison ≤ +2, speed ≤ +4 %, capacity ≤ +25 %). Enemy AIs never receive upgrades. Current result: **median 2.0★**, 673 / 916 / 11 / 0 over 40 levels × 40 seeds.

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
| Tower shape | Round keep | 150 | shop |
| Tower shape | Watchtower | 200 | shop |
| Unit shape | Shield bearers | 120 | shop |
| Unit shape | Clockwork robots | 150 | shop |

Skins never change hitboxes, colours that encode ownership (blue/red/green/yellow/grey stay), or readability (pillar 1). Colour-blind palette wins over any theme. Backlog M3-2 (two tower shapes + two unit shapes, originally "for coins") ships as the four **shape** rows above, priced in crystals like every other skin — nothing is sold for gold. A shape replaces the whole building / soldier, so it equips into the same slot as a roof / helmet (one tower look and one unit look at a time); shape drawers live in a lazy chunk (`src/render/skinShapes.ts`) to keep the eager bundle under budget.

### 3.4 Level skip (crystals)
30 crystals. Offered only after **3 consecutive defeats** on the same level; grants 1★ and unlocks the next level; pays no gold, counts toward milestones but not toward "full band at 3★". At most one skip per band (6 per campaign with band 5; `skips` band index 5). Rationale: a frustration valve, not a progression product.

### 3.5 Continue after defeat — "Reinforcements" (rewarded ad or 10 crystals)
On the defeat screen: *Watch a video* (cap 3 / day) or *10 crystals*. Effect: the sim rewinds to the snapshot **20 s before the defeat** (the game loop keeps a ring buffer of state snapshots every 1 s (20 s history) — cheap because the state is plain data and deterministic), then grants a free Freeze (5 s) and +15 infantry to the player's highest-garrison tower. Once per attempt. Result stars are computed from the original start time (continuing never improves the star clock).

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
| `rv_daily_retry` — **proposal, not implemented** (§6.2) | daily-challenge defeat screen | one more attempt at today's challenge, starting with 1 free Freeze charge | 1 | — (one per UTC day by construction) |

Buttons always name the reward ("Watch → +20 gold"). If no ad is loaded the button is hidden, never shown disabled. AdMob mediation with the UMP consent form (GDPR / ATT) in Phase B; non-personalised ads when consent is refused.

### 5.3 Web build
No ad SDK. The `AdProvider` interface has a `NoAdsProvider` (all placements unavailable → buttons hidden, interstitial no-op) used by the Pages/PWA build, and a `FakeAdProvider` (dev only, resolves after 1 s, toggled by `?fakeads=1`) so the UI can be tested in Playwright.

## 6. Earn / sink model

Assumptions: ~4 levels per day (≈ 6 attempts), 2.2★ average on first clear, two ×2-gold ads per day, daily chest every day, 40 levels in ≈ 12 days and **50 levels in ≈ 15 days** (band 5 is the hardest band: the last 10 levels are modelled at ≈ 3–4 a day, still 2.2★ and 10 gold per star on first clear — updated 2026-09-20). **Daily challenge (added 2026-09-18):** available from day 3 (level 8 is cleared at the end of day 2 at 4 levels/day), played *and won* on **70 % of active days**, **2.2★ average** → 52 gold + 5 crystals per win, **36.4 gold + 3.5 crystals per active day**; 1 / 4 / 13 eligible days at the 10 / 20 / 50-level checkpoints. Daily reward, chest and ad figures are unchanged.

| Free player | Gold earned (cum.) | Crystals earned (cum.) | Can afford (cumulative) |
|---|---|---|---|
| After 10 levels (~day 3) | ≈ 486 (220 stars, 130 ×2 ads, 90 daily, 10 replays, **36 challenge**) | ≈ 54 (20 milestone, 15 chest, 15 achievements, **3.5 challenge**) | 6 boosters + capacity or booster-discount tiers 1–2 (180), or production tier 1 (200); 1 continue + 1 skip in reserve |
| After 20 levels (~day 6) | ≈ 1 116 (970 + **146 challenge**) | ≈ 149 (50 milestones, 20 band 1, 30 chest, 5 daily, 30 achievements, **14 challenge**) | 8 boosters + production tiers 1–2 (550) + garrison / speed tier 1 (400), or one cheap 5-step track to tier 4 (680) + production tier 1; 1 skin (100–120) + 1 continue |
| After 50 levels (~day 15) | ≈ 3 063 (1 100 stars, 660 ads, 680 daily, 150 replays, **473 challenge**) — band 5 adds ≈ 700 (220 stars + 480 per-day) over the 40-level figure of 2 364 | ≈ 481 (210 milestones, 40 bands, 75 chest, 40 daily, 70 achievements, **46 challenge**) — band 5 adds ≈ 110 (60 milestone + 10 achievement + 40 per-day) over 370 | 15 boosters (≈ 600) + two tracks maxed (2 200) + a 5-step track to tier 2 (180); 3 skins (≈ 350) + 4 continues and a skip in reserve |
| Steady state per day (3★ hunting) | ≈ 186–206 (150–170 + **36 challenge**) | ≈ 12–14 (8–10 + **3.5 challenge**) | full tree (5 500) ≈ 16 more days (was ≈ 22); a 100–120 skin every ≈ 9 days (was ≈ 12); all 9 shop skins (1 270) ≈ 10 weeks after the campaign |

**Arithmetic check (daily challenge only, 70 % × 2.2★).**

| Checkpoint | Eligible days | Expected wins (× 0.7) | Gold (× 52) | Crystals (× 5) | Gold total before → after | Crystals before → after |
|---|---|---|---|---|---|---|
| Per win | — | 1 | 30 + 10 × 2.2 = **52** | **5** | — | — |
| Per active day | 1 | 0.7 | **36.4** | **3.5** | — | — |
| After 10 levels (day 3) | 1 | 0.7 | 36 | 3.5 | 450 → **486** (+8 %) | 50 → **54** (+7 %) |
| After 20 levels (day 6) | 4 | 2.8 | 146 | 14 | 970 → **1 116** (+15 %) | 135 → **149** (+10 %) |
| After 50 levels (day 15) | 13 | 9.1 | **473** | **46** | 2 590 → **3 063** (+18 %) | 435 → **481** (+11 %) |
| Steady state / day | 1 | 0.7 | 36 | 3.5 | 150–170 → **186–206** (+23 %) | 8–10 → **12–14** (+39 %) |
| Perfect month (30 wins, 2.2★) | 30 | 30 | 1 560 | 150 | — | — |

For scale: one 2.2★ daily win is worth 77 gold-equivalent (52 gold + 5 crystals × 5), i.e. ≈ 0.9 of a normal day's first-clear stars (4 × 2.2 × 10 = 88) — and it is comparable to, not larger than, the login reward (330 gold + 20 crystals a week = 47 gold + 2.9 crystals a day), which is the intended relationship: the login reward pays for showing up, the challenge pays about the same again for *playing*.

### 6.1 Sink check after the daily challenge — **no price change recommended**

- **Band 5 sinks check (2026-09-20) — no price change.** The 10 extra levels add ≈ 700 gold and ≈ 110 crystals over ≈ 3 days at the same per-day rates (≈ 204 gold and ≈ 32 crystals a day over the 15-day campaign, vs 197 / 31 over 12 days): the tree still costs 5 500 (two tracks maxed at day 15 instead of one, full tree ≈ day 27 instead of ≈ 28), the 3 new-band crystals per day are already inside the 12–14 steady-state band, the skin shop (1 270) still takes ≈ 10 weeks after the campaign, and the Starter Pack claim (2 000 gold ≈ 10 days) holds. **Keep 1 100 per track, boosters 30 / 40 / 50, skins 80–200, continue 10, skip 30, chest 60.**
- **Gold (+18 % over the campaign, +23 % in steady state).** The sinks are the 5 500-gold commander tree (five 1 100-gold tracks) and the repeatable boosters (30 / 40 / 50). The day-12 free player moves from "one track maxed + another to tier 1–2" to "one track maxed + production tier 2 + a cheap track to tier 2" with ≈ 500 gold left for ≈ 12 boosters; the full tree lands at ≈ day 28 instead of ≈ day 34. That is still a month of play for the last tier, and the advantage cap (§3.2) — not the price — is what keeps the tree from trivialising levels, so faster completion is not a balance problem. Boosters are the elastic sink: 3★ hunting at 4–6 attempts a day burns 100–250 gold a day whenever the player chooses to, so the extra 36 gold has somewhere to go on the same day it is earned. **Keep 1 100 per track and the booster prices.**
- **Crystals (+10 % over the campaign, +39 % in steady state, from a low base).** Continues (10) and skips (30) are frustration valves, not a progression product; two daily wins ≈ one continue, six ≈ one skip — a fair rate for a player who is *winning* daily challenges. Skins at 100–120 move from one per ≈ 12 days to one per ≈ 9 days in steady state; the full shop (1 270) still takes ≈ 10 weeks after the campaign, so cosmetics keep their long-tail role. The Starter Pack claim "400 crystals ≈ 10 days of free earnings" stays true in gold terms (3 063 / 15 ≈ 204 gold a day → 2 000 gold ≈ 10 days). **Keep skins at 80–200, continue at 10, skip at 30, chest at 60.**
- **What would change the answer.** (a) If Phase B telemetry shows the daily first-win rate above ≈ 85 % on active days (the pool is levels the player has already cleared; two of the five twists are nerfs, one is a buff), steady-state crystals reach 14–15 a day: then raise the two cheapest skins (Slate 80 → 100, Viking 100 → 120) *before* touching the 5-crystal reward, because the reward is the retention hook. (b) `rv_double_gold` must **not** be offered on the daily result screen — doubling would make the challenge worth 104 gold in one match, more than a full day of first clears, and the ad cap of 5 already covers the campaign results. (c) Replays and losses pay nothing (already in code: `goldReward` is only called on the first win), so there is no farm; keep it that way when the streak milestones land.
- **Balance hand-off.** The twists (`lean` −15 % production, `thinWalls` −20 % capacity, `fastFeet` +25 % speed, `reinforced` +5 start garrison, `plain`) are player-side `PlayerModifiers`, the same object the commander tree feeds. `fastFeet` at +25 % is six times the +4 % speed cap the playtest found dangerous on the star clock (§3.2), so the Game Designer should expect near-certain 3★ on `fastFeet` days for the star-clock boundary levels that are in the pool (12, 14, 28, 40; level 2 is below `POOL_FROM`); the economy tolerates a 3★ day (62 gold vs 52) — it is a star-clock question, not a price one.

### 6.2 Daily challenge LiveOps (streak milestones **implemented 2026-09-18** — `STREAK_MILESTONES` in `src/daily/challenge.ts`, paid by `recordChallengeResult`; day 30 does not repeat at 60 / 90 in v1; `rv_daily_retry` remains a proposal)

**Streak milestones (consecutive UTC days with a first win; a missed day resets to 0).** Proposal: **day 3 → +5 crystals, day 7 → +20 crystals, day 30 → +100 crystals**, paid once each time a streak passes the milestone (a rebuilt streak earns day 3 / 7 again; day 30 repeats at 60, 90 …). Sizing: day 3 / 7 mirror the login streak's day 4 / 7 crystals (5 / 15) with a small premium for needing a *win*, so the two streaks feel like one system; day 30 equals the `crystals_100` pack — a visible "you earned the $0.99 pack" moment for the player who stayed a month, which is the group whose LTV is highest and who we least want to lose to a lapsed streak. Expected cost under the 70 % model (probability of being on exactly day *k* of a streak = 0.3 × 0.7^k): day 3 hit 10.3 % of days ≈ 3.1 a month ≈ 15 crystals; day 7 hit 2.5 % ≈ 0.74 a month ≈ 15 crystals; day 30 ≈ 0 — **≈ 30 crystals a month per active player (≈ 1 a day)**, 125 for a perfect month on top of the 150 base. That keeps steady-state crystals at ≈ 13–15 a day, inside the "no price change" band above. Rules: milestones are not purchasable and there is no "restore streak" product in v1 (a 20-crystal *streak shield*, usable once per 30 days, is a Phase C candidate — it is a comfort item like continues, not an advantage, but it needs the Publisher's read on "loss-aversion" wording in the stores). UI: the milestone chips sit on the daily card with the concrete number ("3-day streak → +5 crystals"), same rule as ad buttons.

**Weekly Challenge (GDD §8, proposal — Monetization confirms the sizes, 2026-09-20).** **100 gold** per first win and **20 crystals** per 3★ target reached, once per week key, are confirmed: the 20 equals the day-7 daily-streak milestone and pays for the hardest routine thing in the game (a 3★ on a band-4/5 level under a twist); the ceiling is +2.9 crystals and +14 gold a day for a player who hits every target (1 040 crystals + 5 200 gold a year, ≈ 6 % of the yearly daily-challenge ceiling in gold), the modelled player (70 % active, ≈ 60 % target rate over a week of free retries) lands at ≈ +1.7 crystals a day → steady state ≈ 14–16 with the streak milestones, i.e. at the top of the §6.1 band, so the pre-agreed lever applies unchanged: if telemetry shows a month above 15 a day, raise Slate 80 → 100 and Viking 100 → 120 first, and only then drop the target part to 15 — never the 100 gold, and never a `rv_double_gold` on the weekly result.

**`rv_daily_retry` (rewarded ad, proposal).** On the daily-challenge defeat screen: *Watch a video → try again with a free Freeze*. One per UTC day; grants a second attempt at the same seed and twist, starting with one Freeze charge (40-gold value) — the only booster ever allowed in the daily, so the twist stays honest while the player gets the "one more go" that the research (`monetization-market.md` §3) shows is the highest-converting rewarded placement (continue / retry, 40–70 % opt-in). The retry pays the normal first-win reward if it wins (it is still the day's first win); if GDD §7 adds a verified leaderboard, the retry result is flagged *assisted* rather than rejected. Crystal twin, as for §3.5: **10 crystals** for the same retry when no ad is loaded or on the web build (`NoAdsProvider` hides the ad button; the crystal button stays), so no platform is locked out and Remove Ads owners keep the ad option like every other rewarded placement. Cost model: at a 30 % daily loss rate and 50 % opt-in, ≈ 0.15 extra wins a day ≈ +8 gold + 0.75 crystals a day — included in the "no price change" margin above. Not implemented; needs `AD_PLACEMENTS` and `catalog.test.ts` entries, a `daily` save field for the retry flag, and the Game Designer's sign-off on the Freeze exception in GDD §7.

**Tower War comparison.** `docs/research/tower-war-analysis.md` §4 records Tower War's retention as "level chain with occasional boss maps, daily rewards" — no seeded daily *challenge* is documented in our research. The current Play listing does advertise "rewards for completing daily and weekly goals" and a "Challenges" mode alongside PvP / Arena, i.e. goal-based dailies rather than a shared deterministic map. Our design — every player worldwide plays the same seed and twist, verifiable by the reference bot — is therefore a differentiator rather than parity, and the reward is deliberately tuned to the login reward rather than to Tower War's (undocumented) figures.

| Spender | Gets | What it buys |
|---|---|---|
| **$2.99** Starter Pack | 400 crystals + 400 gold + Bronze helmet | 4 shop skins, **or** 2 000 gold (≈ 2 full tracks), **or** 40 continues; ≈ 10 days of free earnings (still true with the daily challenge and band 5: ≈ 204 gold a day over the 15-day campaign) |
| **$3.99** Remove Ads | no interstitials + 50 crystals | ~1 continue/skip; the purchase is the comfort, not the crystals |
| **$9.99** Premium | no interstitials + 600 crystals + 2 exclusive skins + −10 % boosters | 3 000 gold-equivalent (55 % of the tree) or 5 skins; free + premium after the 50-level campaign ≈ 3 063 gold and 1 081 crystals |
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
**Phase C — LiveOps.** `weekend_pack` (Fri–Sun), *first-purchase double* (first crystal pack grants 2×, flagged in `OFFERS`), seasonal skin drops, band-completion "3★ challenge" bonuses, daily-challenge streak milestones and `rv_daily_retry` (§6.2). Remote-configurable ad caps (server- or JSON-driven) so frequencies change without a build.

Handoffs: Game Designer — add §2.7 "Commander modifiers" and the advantage limit to the GDD, and in §7 confirm one attempt per day, no `rv_double_gold` on the daily result, and the Freeze exception for `rv_daily_retry`; Frontend — daily card shows the reward as a number ("30 + 10 / star + 5 crystals"), streak chips per §6.2; Publisher — the streak milestones and retry ad add no new IAP or data category, but the *streak shield* (if it ever ships) needs a look at loss-aversion wording; Level Designer — levels 2, 12, 28 and 40 sit on their 3★ clock (baseline 3★ rate 22–70 %, 90–100 % with any upgrade), so review those clocks rather than asking the economy to shrink further; AI Engineer — the `--upgrades max` run shows 11 / 1 600 1★ results that the no-upgrade run never produces (faster units change the bot's timing on a few seeds), worth a look; Gameplay Engineer — `PlayerModifiers` + snapshot ring buffer; Frontend — shop/result/defeat screens; AI Engineer + QA — playtest flag; Mobile Engineer — Phase B plugins; Publisher — §7.
