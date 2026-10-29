# Audit 2026-10-29: balance, progression, economy, first-time experience

Owner: Game Designer. Scope: the stakeholder's full-game audit, my part. Read-only: no game file, level, constant, BACKLOG or GDD line was changed. Skills applied: `gstack-balance-review` (all six sections, `references/scoring.md` rubrics used literally), `tower-defense` (`references/balancing.md`, used only where it transfers to a capture-the-towers RTS), `gstack-player-experience` (two personas, every phase scored with `references/scoring.md`).

**How the skills' interactive steps were run.** Both gstack skills want an AskUserQuestion after every section and phase. I am a subagent and have no user channel, so I ran them in the skills' own fast-forward mode: AUTO items flagged without asking, every ASK or ESCALATE item listed as a finding for the Producer. Mode is locked to **A: F2P Mobile**, because the build ships `src/economy/catalog.ts`, a shop, IAP products and ad placements, even though the ECONOMY.md header still says "design, not yet implemented" (AUD-B20). Data level is **B: simulation output**. There is no human playtest data and no telemetry in the code (AUD-B6). All benchmarks are industry heuristics. Section 5 is N/A: the game has no character selection and no PvP.

## 0. Evidence (all run today from `tower-clash/` on the working tree)

| Instrument | Command | Headline |
|---|---|---|
| Reference player | `npm run playtest -- --seeds 5` | 250/250 wins, 0 failed gates; stars 3★/2★/1★ = **17/233/0**; **0 of 5 seeds reach 3★ on 40 of 50 levels** |
| Naive first-time line, 4 s | `npm run playtest -- --naive --seeds 20 --tie both` | asc: 47/50 levels held (954/1000 runs), 31 within `star2`; tie desc: 46/50 (930/1000), 22 within `star2`. Not held: 23 (7/20), 27 (6/20), 32 (4/20), plus level 3 tie desc 0/20 |
| Distracted line, 8 s | `--naive --level N --seeds 20 --react 8000 --tie both` on 1–5, 9, 17, 25, 33, 41, 50 | 4: 18/20, 150.1 s, **2 never end**; 41: **11/20**; 3 tie desc 0/20; 2★ on these levels only at 2, 3, 4, 5, 9, 33, 41, 50 and only on some seeds |
| Re-clock dry run | `npx tsx scripts/reclock.ts --seeds 20` | only 23 would change (30/75 → 30/60, still unapplied per item 9) and 33 (pinned). The boundary step fired on 31 levels, so `star3` = round5(0.9 × median) − 5 s there |
| Daily, 30 days | `--daily 2026-10-29 --days 30 --seeds 3` (+ `--naive`) | bot 30/30 days, 90/90 seeds; naive 28/30 days (lost: 10-30 level 23 lean, 11-18 level 32 plain) |
| Weekly, 26 weeks | `--weekly 2026-10-26 --weeks 26 --seeds 5` (+ `--naive`) | bot 26/26, 129/130; **3★ target: fixed seed 1/26, any seed 8/26, runs 12/130, lean 0/40**; naive 25/26 (38 lean 2/5); **14 distinct levels in 26 weeks** |
| Scratch probes (scratchpad only, not in repo) | `outcomes.mts`, `naiveMod.mts`, `capOut.mts`, `refCap.mts`, `weeks.mts` | splits outcomes into lost vs still `playing` at 180 s; runs the naive and reference lines under single commander tiers; replays the weekly picker over 52 weeks |

Card-follower rows: GD-5 … GD-12 done notes in `docs/BACKLOG.md` and GDD §3 items 11–17. I did not re-run them.

## 1. Rubric scores

### 1.1 Balance review (`gstack-balance-review/references/scoring.md`)

**Section 1, Difficulty curve: 5/10**
- **Flow channel 1/3, flat/escalating.** The planned sawtooth exists only in the aggression column of the band table. The measured outcome is flat. The reference player's medians are 25–52 s on 35 of 42 levels from 9 to 50, while aggression rises 0.3 → 0.9.
- The first-timer's curve has a valley in the middle. By band, ≥ 2★ share (naive 4 s, both tie orders, 320 or 400 runs per band) is 75 / 65 / **27 / 19** / 62 / 58 %. Wins by band are 300/320, 320/320, **295/320, 256/320**, 320/320, 393/400. So the "final exam" bands are easier for a first-timer than bands 3–4.
- **Spike frequency 0/2, more than 3 spikes.** The metric is the naive loss rate, with the naive median time as a cross-check:
  - 22 → 23: 0 % → 65 %
  - 26 → 27: 0 % → 70 %
  - 31 → 32: 0 % → 80 %, of which 8/20 are still `playing` at 180 s
  - 40 → 41: 0 % → 15 %, with time 74.6 → 131.8 s
  - At 8 s, 3 → 4 also spikes: 61.3 → 150.1 s, 2.45 ×.
  - No death zone, since no two spikes fall within 3 consecutive levels.
  - Not premature: the core verbs (link, cut, grow, surround) are all taught by level 10.
- **Recovery 2/3, basic.** What exists:
  - Continue: 20 s rewind, Freeze and +15 infantry, for an ad or 10 crystals.
  - Skip: 30 crystals after 3 defeats.
  - The defeat tip shows the lesson.
  - The stalemate hint.
  - What is missing: no adaptive help, and a stalemate has no exit that counts (AUD-B2).
- **Variety 2/2.** Lanes, walls and rocks, fortress, artillery, mines, tanks, rivers and 1–3 enemies.

**Section 2, Economy model: 4/10**
- **Sink/faucet 1/3, outside range once you project over time.**
  - Gold, days 1–40: the faucet is about 130–155/day (ECONOMY §6 steady state). The 5,500-gold tree drains about 137/day until it is complete at about day 40, so the ratio is about 1.0, but only because of how the model is built.
  - Gold after day 40: the faucet stays at 130/day. The only remaining sink is boosters, which cannot be used in the daily or weekly. Ratio > 2 → ESCALATE by the rubric (AUD-B8).
  - Crystals: about 11.5/day against 2,430 of shop skins, which runs out about 25 weeks after the campaign. After that only the crate (60) and continues remain.
- **Inflation 1/2, mild.** Gold stockpile on the first-timer line: about 0 at day 40 (spent on the tree), about +6,500 idle by day 90, and it passes 2 × the dearest gold item (700) at about day 51.
- **Currency clarity 2/2.** Gold and crystals.
- **Wealth distribution 0/3.** No data, and no collection in the build: `grep` finds no analytics in `src/` (AUD-B6).

**Section 3, Progression pacing: 6/10**
- **Milestones 1/3, three off.** Mobile casual, so targets compressed 10 ×. Times below are cumulative first-timer win time on the naive medians (losses and menus excluded).

| Milestone | Target | Actual | Verdict |
|---|---|---|---|
| First action | — | 3 s | OK |
| First "I understand" | — | about 22 s (level 1 won) | OK |
| First meaningful choice | — | level 2 swipe or level 4 stop, 1.5–4.2 min | OK |
| First wow | — | first fortress, level 9 at 9.2 min | OK |
| First build choice | 6–36 min | a commander tier is affordable after level 2 (70 gold ≥ 60) at **1.5 min** | FAST |
| Mid-game identity | 1–4 h | campaign through 32 at 36.7 min | FAST |
| Endgame entry | 2–10 h | all 50 levels at **60.2 min** (the reference player: 33.7 min) | FAST |

- **Grind ratio 2/2.** Every campaign level is new. Post-campaign play is short (daily 2–3 min).
- **Content runway 1/2, short but acknowledged.** About 60 min of unique first-time play, under the F2P red-flag line of 2 h. ECONOMY §6 spreads it over 15 days at 4 levels a day, which is about 5 min of play a day.
- **Reward schedule 2/3.** Fixed ratio (stars) and fixed interval (login, daily, weekly, chest), documented, no variable-ratio paid rewards. The star ladder that carries the fixed-ratio part is miscalibrated (AUD-B4, AUD-B5).

**Section 4, Monetization pressure: 8/10**
- **Free viability 3/3.** Every level is won by the reference player with zero upgrades (250/250), skins are cosmetic, there is no energy and retries are unlimited.
- **Paywall timing 1/2, mixed.**
  - The Starter Pack is shown after level 5, at about 5 min of play and before a second session (AUD-B14).
  - At the spikes (23 / 27 / 32), the defeat screen offers continue and skip, and the interstitial counter counts defeats (AUD-B7).
- **P2W 2/3, convenience.** PvE only. The daily and weekly are equal for everyone. Crystals convert to gold, so the tree costs about $9.99.
- **Spending tiers 2/2.** Everything purchasable is finite: about 1,100 crystals of tree plus 2,430 of skins. Returns diminish to zero.

**Section 5, Character/unit balance: N/A.** No character selection and no PvP. Its 10 % is redistributed: the four active sections weigh 27.5 / 27.5 / 22.5 / 22.5 %. The unit-level finding the section would have caught, a commander track that is strictly worse than nothing, is AUD-B1.

```
Difficulty Curve:      5/10 (27.5%)
Economy Model:         4/10 (27.5%)
Progression Pacing:    6/10 (22.5%)
Monetization Pressure: 8/10 (22.5%)
Character Balance:     N/A
WEIGHTED TOTAL:        5.6/10   (1.375 + 1.100 + 1.350 + 1.800 = 5.625)
Cross-section conflicts: 5    Escalated: 3 (frustration monetization at spikes, gold faucet/sink > 2 after day 40, stuck-with-no-path stalemates)
```

**Cross-section conflicts.**
1. **Difficulty × Monetization.** The 23/27/32 spikes coincide with the continue prompt (ad or 10 crystals), the 3-defeat skip prompt (30 crystals) and an interstitial cadence that counts defeats.
2. **Difficulty × Economy.** One skip per band, and band 25–32 holds two learning levels (27, 32).
3. **Progression × Economy.** About 60 min of content against a tree that completes around day 40. The tree is bought after the levels it could help, and for the first-timer it does not help (AUD-B1, AUD-B8).
4. **Balance × Economy.** The cheapest track (capacity, 60 gold) is harmful.
5. **Difficulty × Progression.** Bands 5–6 are easier for the first-timer than bands 3–4.

**Forcing questions, answered from the data.**
- **Q1, Day-30 stockpile.** The §6 model has the free player spend everything: about 4,230 gold earned buys three tracks plus about 20 boosters, so the stockpile is about 0. From day 40 nothing absorbs the 130/day, about 6,500 gold by day 90.
- **Q2, failure cascade on 32 for a first-timer.** The home links at 3 s and freezes at L1, and both ford towers are the enemies' by 9.7 s.
  - 8 of 20 runs lose at 90–148 s. A "Reinforcements" continue rewinds 20 s but keeps the clock, so the result is 1★ at best.
  - 8 of 20 runs never end: there is no defeat, so the skip is never offered, and a restart records nothing (`recordResult` runs only on won/lost, `src/ui/play.ts:522`).
  - A player who skipped 27 has no skip left for 32 (AUD-B3).

### 1.2 Player experience (`gstack-player-experience/references/scoring.md`; full phase weights 20/20/25/20/15, because the brief extends both personas to levels 17–50)

**Persona A, Casual Newcomer** (phone, never reads cards, taps what is pointed at; modelled by the naive line at 4 s and 8 s, either tie order).

| Phase | Score | Deductions |
|---|---|---|
| First contact (0–30 s) | 9 | −1 blind spot: title, load time and first frame not observed (no Playwright in this audit) |
| Onboarding (levels 2–4) | 2.0 | −1.5 ASK: level 3 west-first 0/20 unless the steer is answered within about 1 s · −1.5 ASK: level 4 at 8 s is 150 s and 2/20 never end · −3 ESCALATE: capacity tier 1 → level 4 4/20 won, 16/20 never end · −2 death spiral on level 4 (Curious → Confused → Frustrated → quit) |
| Core session (levels 5–13) | 6.5 | −1 AUTO: Starter Pack after level 5, before session 2 · −1.5 ASK: level 5 left start 0 × 2★ vs right 16 × 2★ · −1 AUTO: daily unlocks at 8 and today's is level 40, with pieces the player has never seen |
| Return & depth (17–32) | 2.0 | −2 unhealthy pattern (Proud → Frustrated): ≥ 2★ share 65 % → 27 % / 19 % · −3 ESCALATE: 32 has 8/20 never-ending matches, no defeat, no skip · −1.5 ASK: one skip for 27 and 32 · −1.5 ASK: interstitial + skip + continue on the spikes |
| Long-term (33–50, day 7/30) | 4.5 | −1.5 ASK: 41 at 8 s 9/20 not won, 5 never end · −2 content wall (Engaged → Bored) after a 60-min campaign · −1 AUTO: weekly repeats (AUD-B13) · −1 blind spot: day-30 not measurable, no telemetry |
| **Weighted** | **4.9** | 1.80 + 0.40 + 1.63 + 0.40 + 0.68 |

**Persona B, Strategy veteran** (Hardcore Optimizer / Genre Critic: reads every card, knows Tower War / State.io, chases 3★, buys every upgrade; modelled by the reference player, the card-follower rows, the clocks and the commander tiers).

| Phase | Score | Deductions |
|---|---|---|
| First contact | 9 | −1 blind spot, as above (also: can tutorial steps 1–4 be skipped?) |
| Onboarding (1–4) | 7.5 | −1.5 ASK: 3★ is under the bot's own median on 2 / 3 / 4 (20 vs 24.4, 25 vs 29.7, 25 vs 32.1 s); is it humanly reachable? · −1 AUTO false choice: on 4 the 2★ band spans 25–130 s (5.2 ×), so stopping the stream or not earns the same star |
| Core session (5–16) | 4.0 | −3 ESCALATE: maxed upgrades take the reference player on 6 from 29.8 to 98.7 s (1★ on 4/5), and capacity +25 % alone makes 8 0/5 · −2 Empowered → Cheated · −1 AUTO: the 3-line card is up for 8 s of live sim while the enemy opens at 0.0 s |
| Return & depth (17–32 + daily) | 8.5 | −1.5 ASK: 3★ is beyond the bot on 40/50 levels, so the 120 band crystals and `stars_10/20/40` are aspirational with no human evidence |
| Long-term | 4.0 | −1.5 ASK: weekly 3★ target 12/130 bot runs, lean 0/40 · −1 AUTO: weekly repeats · −2 plateau (Engaged → Neutral): the content is 34 min at bot pace, then only 3★ hunting · −1.5 ASK: the hand-built equal-lane stalemate (GDD §2.0b designer's read, weakness 1; `SHIELD_MS` lever not scheduled) |
| **Weighted** | **6.6** | 1.80 + 1.50 + 1.00 + 1.70 + 0.60 |

## 2. Findings

Severity: **P0** blocks launch · **P1** fix before 1.0 · **P2** 1.0.1 · **P3** later. Where a skill rule says "escalate, do not suggest a fix", the brief's one-sentence fix overrides it; the escalation is noted.

| Id | Sev | What is wrong | Evidence | Proposed fix (one sentence) | Owner |
|---|---|---|---|---|---|
| AUD-B1 | **P0** | The cheapest commander track (capacity, 60 gold, affordable after level 2) makes the tutorial unwinnable or endless for the first-timer and slows even the reference player. ECONOMY §3.2 calls it "inert for the bot"; that was measured under rules v2 on 2026-09-13 and is false under v3. The level-4 bubble still says "At 25 it levels up" (`tutorialSteps.ts:187` uses `C.CAPACITY[1]`), while the tower upgrades at 26–31. The `--upgrades max` gate only bounds stars from above (median ≤ 2.5★), so nothing catches an upgrade that hurts. | Naive 4 s, level 4: 20/20 won at no upgrade → **4/20 at +5 %** (16 still `playing` at 180 s) → 9/20 at +25 %. Level 6: 20/20 → **0/20 at +20 %** (19 lost). Level 5 at +5 %: 2★ 16/20 → 3/20. Reference, +25 % capacity: **8 0/5 won**, 6 29.8 → 78.4 s, 41 75.5 → 90.0 s (1 not won). Reference, all tracks maxed: 6 **29.8 → 98.7 s, 1★ on 4/5** (`--level 6 --seeds 5 --upgrades max`). Naive with all tracks maxed is slower on 7 of 9 levels sampled (9, 13, 25, 34, 38, 44, 49). | Apply `capacityMul` only to the top-level cap, never to the L1/L2 auto-upgrade thresholds or `targetFull` (or retire the track and fold its 1,100 gold into another), and add a gate that no single tier makes any level slower or lose seeds on the reference or naive line. | Game Designer + Gameplay Engineer (sim), Monetization (catalog), QA (gate) |
| AUD-B2 | P1 | A stalemate has no end for a human. There is no match clock or concession; a defeat needs the loss of every tower; restart and level-select record nothing. So the skip valve (3 defeats) is unreachable exactly where the player is stuck. Rubric: "stuck with no path forward" → ESCALATE. | Naive matches still `playing` at 180 s: 32 **8/20** (4 s) and 6/20 (8 s), 41 5/20 (8 s), 27 1/20, **4 2/20 (8 s, tutorial band)**. `recordResult` only on won/lost (`src/ui/play.ts:522`). | Add a "retreat" choice that appears once the stalemate hint has fired and counts as a defeat (opening the tip, continue and skip paths), specified in GDD §2.4 before any code. | Game Designer (GDD), Frontend |
| AUD-B3 | P1 | One skip per band, but band 25–32 contains both recorded learning levels. | `CRYSTAL_SERVICES.levelSkip.maxPerBand` 1; `bandOf` [25, 32]; naive 27 **6/20** (8 s 1/20), 32 **4/20** (8 s 5/20). | Allow one skip per learning level (23, 27, 32) on top of the per-band one, or two in band 25–32. | Monetization Designer |
| AUD-B4 | P1 | The star ladder does not mean what the GDD says. Item 8 states "3★ = the reference player's pace", but `star3` = round5(0.9 × median), stepped −5 s on 31 levels. 3★ is therefore under the bot's own median on all 50 levels, and every 3★-dependent reward has no evidence a human can reach it. | Reference 3★ in **17/250 runs**, 0/5 on **40 of 50** levels. Examples: 25 is 20 s against a 27.9 s median, 4 is 25 against 32.1. Weekly target reached on 12/130 runs, 0/40 under lean. 3★-gated: 120 band crystals, 40 achievement crystals, 20 crystals/week. | Before 1.0, time 3–5 strategy-literate TestFlight players on 10 levels and set `star3` at a measured human percentile, or re-word the ladder to "3★ = beat the bot" in the GDD, How to Play and the store text. | Game Designer, Level Designer, QA/Publisher (TestFlight) |
| AUD-B5 | P1 | The no-floor past 16 creates a 2★ cliff in the retention window. GD-12's own adopt trigger (first-clear 2★ < 30 %) already fires on the line the team trusts for 1–16. | First-timer ≥ 2★ share by band: 75 / 65 / **27 / 19** / 62 / 58 %. Naive within `star2` on 16 of 34 levels past 16 (asc), 22/50 overall on tie desc. Stars per win: 1.29 (17–24) and 1.24 (25–32), against 1.94 / 1.65 in bands 1–2. | Adopt GD-12's card-reader floor for 17–50 in the 1.0 build (16 levels, `star2` +5 … +30 s, `reclock.ts` carries each card spec), after Monetization re-runs ECONOMY §6. | Game Designer, Level Designer, Monetization |
| AUD-B6 | P1 | Every balance deferral waits on telemetry the build cannot collect. The listing promises "no tracking". At least 9 open decisions are "re-open on telemetry": GD-2, GD-4, item 8, item 10, GD-12, LV-11, the day-30 streak, the ECONOMY §6.1 triggers and the 41/42 length. | `grep -ril 'analytics\|telemetry\|level_end' src` finds only `economy/store.ts` and `economy/ads.ts` (purchase and ad SDK wrappers); GD-12's `level_end` event is not implemented. | Either ship an opt-in, on-device-aggregated `level_end` (level, result, time, stars, attempt index) with the matching privacy-label change, or replace each telemetry clause with a dated TestFlight measurement. | Producer, Publisher, Frontend |
| AUD-B7 | P1 | Frustration monetization at the difficulty spikes (rubric ESCALATE): the interstitial cadence counts defeats, and the 3rd defeat also raises the skip offer, beside the continue offer. | `recordResult` does `adCounters.levelsCompleted += 1` before the outcome check (`src/economy/wallet.ts:259`). Naive losses: 23 13/20, 27 13/20, 32 8/20 (+8 endless). | Do not count defeats toward the interstitial cadence and never show an interstitial on a defeat streak of ≥ 2. | Monetization Designer, Frontend |
| AUD-B8 | P2 | Gold loses its job after the tree. The faucet keeps running with only campaign boosters as a sink (rubric: faucet/sink > 2 → ESCALATE). Separately, the maxed tree does not help the first-time line it is sold to. | ECONOMY §6: about 130 gold/day steady, tree complete about day 40, about 6,500 idle gold by day 90; boosters are off in the daily and weekly. Naive + max tree: 7 of 9 sampled levels slower; only 17 gained 2★ (2 → 10 of 20). | Re-run the §6 model for a day-90 player and a 3-day binger and decide in the doc whether gold gets a late sink or its faucets taper after the tree. | Monetization Designer |
| AUD-B9 | P1 | Level 3 (tutorial band): taking the other grey first loses every seed. CI exempts it because the tutorial steer cures it, but the steer only works if the player answers within about 1 s. | Naive tie desc **0/20 at 4 s and at 8 s**. GD-7h: steer answered by 8 s 20/20, by 9 s 5/20. `NAIVE_TIE_EXEMPT` 3. | Re-lay level 3 so either first grey wins ≥ 4/5 at 4 s and 8 s (as LV-22 did for 5), then drop the exemption. | Level Designer |
| AUD-B10 | P2 | On mirror pairs, which side the player taps first decides 2★ versus 1★, and a casual's first tap is not id-ordered. | tie desc vs asc 2★ counts: 5 0 vs 16, 7 0 vs 15, 11 0 vs 13, 16 3 vs 15, 26 0 vs 12, 45 1 vs 17 (of 20). | On the floored levels 1–16 floor `star2` at the slower of the two tie orders' medians, and on 26 and 45 apply the item-12 (i) card or layout rule. | Level Designer |
| AUD-B11 | P1 | The lesson card is the only teaching on 5–50, yet it is shown during 8 s of live sim while enemies act from 0.0 s. Reading it costs the opening it describes. | `LESSON_CARD_MS` 8000 is gated on `state.time` (`src/render/hud.ts:340`); cards are 120–200 characters. GD-8: first tap at 8 s costs +6–7 s on 19 and 24. 23's card says "before its stream lands", which happens at about 3 s. | Hold the sim at t = 0 with the card up until the first tap or a dismiss tap (presentation only, no rule change, clocks are sim time); write it into GDD §4 first. | Game Designer, Frontend |
| AUD-B12 | P1 | Learning levels 23 / 27 / 32 were fixed only through their cards. The player who does not read loses two thirds of runs at three points on days 5–8, and the layout levers were deferred to telemetry that does not exist (AUD-B6). | Naive 4 s: 7/20, 6/20, 4/20. 8 s: 2/20, 1/20, 5/20. Daily naive loses 23 (10-30, lean) and 32 (11-18). | Apply the recorded levers now (23: a 3–4 u pocket neutral reachable only from home; 27: home 18 → 22–25 u; 32: the layout equivalent of GD-9f's hold) and measure at 100 seeds, the five twists and the 180-day daily. | Level Designer |
| AUD-B13 | P2 | The weekly picker repeats and starves levels. The daily got a cycle permutation (DAILY-4); the weekly did not. | 52 weeks from 2026-10-26: 17 of 18 levels, **46 never drawn**, 39 six times, **4 back-to-back repeats**. 48 is drawn three weeks running (2027-02-15 / 22 / 03-01), two of them thinWalls. | Give `weeklyFor` the daily's 18-week cycle permutation before launch, while no player has a weekly history to re-map. | Game Designer, Frontend |
| AUD-B14 | P2 | The Starter Pack is offered before the player is hooked. | ECONOMY §4: "shown after level 5" is about 5 min of first-time play, inside session 1. Rubric: "first IAP offer before hooked = premature". | Show it after level 8 (the daily unlock) or on session 2's first result, whichever comes later. | Monetization Designer |
| AUD-B15 | P2 | The daily unlocks at level 8, but the pool is 9–50. A day-3 player meets fortresses, tanks, rivers and three enemies untaught, which contradicts the weekly's own rule ("every vocabulary item has been taught by 32"). | Today's daily is level 40 (thinWalls). 25 of the next 30 days are levels ≥ 17 (second enemy, mines). Naive still wins 28/30. | Show a one-line "new here" chip naming untaught pieces on daily levels above the player's campaign level (presentation only), or move the daily unlock to 16. | Game Designer, Frontend |
| AUD-B16 | P2 | Level 4, the tutorial level for the core verb, is the slowest tutorial level, and its 2★ does not reward the verb it teaches. | Naive 108.3 s (3.4 × the bot's 32.1 s, the highest ratio in the campaign), 8 s 150.1 s; `star2` 130. A player who never stops the stream still gets 2★ (20/20). | Set level 4's `star2` from the tutorial-step follower (GD-5's stop-then-grow trace, 58–73 s) instead of the naive median, so stopping the stream is the 2★ move. | Game Designer, Level Designer |
| AUD-B17 | P2 | Tooling: `--naive --upgrades max` silently ignores the flag (the header prints `upgrades=none`). That is why AUD-B1 was never measured. | `npm run playtest -- --naive --level 17 --upgrades max` → `upgrades=none`. | Make the naive runner honour `--upgrades` and add `--tier track:n` for single tiers, or reject the combination. | QA / AI Engineer |
| AUD-B18 | P3 | The measured difficulty curve is flat and the last bands are easier for a first-timer than the middle ones. The band table's aggression ramp is not what players feel. | Bot medians 25–52 s on 35/42 levels 9–50. First-timer wins: bands 3–4 551/640, bands 5–6 713/720. | Record the measured curve in GDD §3 beside the aggression column and fix the middle (AUD-B12) rather than hardening 41–50. | Game Designer |
| AUD-B19 | P3 | Stars carry almost no economic weight: 1★ → 2★ is worth 10 gold, a third of the cheapest booster. §6's steady-state "one new star a day" assumes 2★ rungs the first-timer does not reach past 16. | §6 to day 15: stars 700 of 2,325 gold (30 %). Item AUD-B5 shares. | Keep the low stakes on purpose, but re-state §6's steady-state star income from the naive or card-reader rows instead of the bot's line. | Monetization Designer |
| AUD-B20 | P3 | Stale claims in the docs. | ECONOMY header "design, not yet implemented" (the shop, catalog and ad code exist); §3.2 "capacity inert for the bot" (AUD-B1); GDD §3 item 8 "3★ = the reference player's pace" (AUD-B4); GDD §1 "every level under a minute in the pillar sense" (naive median > 60 s on 39 of 50). | Correct the four sentences when their findings are decided. | Game Designer, Monetization Designer |

## 3. Persona walkthroughs (friction points only)

### A. Casual Newcomer: phone, portrait, does not read cards, taps what the bubble points at

| Time / level | What I do | Emotion | Flag | Note |
|---|---|---|---|---|
| 0:03 L1 | Tap my tower, tap the grey one | Curious → Engaged | OK | Won at 21.6 s, 3★ (8 s: 28.6 s, 3★). The aha moment is here. |
| 1:30 L2 | Bubble: tower, then grey; swipe to stop | Focused | OK | 68.0 s, 2★ on 20/20. At 8 s: 73.0 s, 1★ on 17/20. |
| 2:30 L3 | I tap the left grey first (it is nearer my thumb) | Confused → Frustrated | XX | West-first loses 20/20 unless I answer the steer within about 1 s (AUD-B9). East-first: 55.5 s, 2★. |
| 3:30 L4 | I keep streaming. The bubble says stop. | Bored | !! | 108 s, the longest tutorial level. At 8 s: 150 s, and 2/20 of my matches never end. |
| 3:30 L4, after buying "Capacity I" for 60 gold | Same play | Frustrated → quit | XX | 4/20 won, 16/20 never end. The bubble says 25; my tower upgrades at 26 (AUD-B1). |
| 5:00 after L5 | Starter Pack $2.99 | Neutral | !! | Session 1, before I am hooked (AUD-B14). L5: left start 1★, right start 2★ (AUD-B10). |
| 9:00 L9 / daily unlocks | Daily card "up to +60 gold" | Curious → Confused | !! | Today's daily is level 40: five fortresses, a factory, a river; nothing tells me what they are (AUD-B15). Naive still wins it. |
| 19:00 L17 | Two colours, a mine chip "6" | Proud → Frustrated | !! | 54.4 s and 1★ (2/20 2★), after mostly 2★ until here (AUD-B5). |
| about 22:00 L23 | Same play | Frustrated | XX | 13/20 lost at 54–91 s. Continue offer, then an interstitial, then the skip offer at the 3rd defeat (AUD-B7). |
| about 29:00 L25 | Tanks | Neutral | !! | 48.1 s, 1★ on 20/20 (`star2` 40). |
| about 32–37:00 L27 / L32 | Same play | Frustrated → stuck | XX | 27: 6/20 won. 32: 4/20 won and 8/20 never end; no defeat, so no skip. If I skipped 27 I have no skip left (AUD-B2, AUD-B3, AUD-B12). |
| about 38:00 L33 | Three colours | Engaged | OK | 62.7 s, 2★ on 19/20. Stars come back. |
| about 48:00 L41 | Same play | Frustrated | !! | 131.8 s, 17/20 won. At 8 s: 11/20 won, 5 never end. |
| about 60:00 L50 | Finale | Proud | OK | 77.1 s, 2★ on 19/20. |
| Weekly tab (opens at 32) | "+100 gold · +20 crystals at 3★" | Neutral → Bored | !! | 3★ target: 0 for my line. The same level can come three weeks running (AUD-B13). |

Summary:
- **Aha moment:** 0:20 on level 1.
- **First churn risk:** level 3 west start, or level 4 for anyone who bought a capacity tier.
- **Hardest stretch:** levels 17–32, at 19–27 % 2★ with three loss spikes.
- **Missing:** a way out of a stalemate, a second skip in band 4, a match that waits for me to read.
- **Repeat play:** session 1 yes; sessions 3–5 (levels 17–32) are where this persona quits.

### B. Strategy veteran: reads every card, optimises, buys every upgrade, chases 3★

| Level | What I do | Emotion | Flag | Note |
|---|---|---|---|---|
| L1–L2 | 3★ on 1 easily | Neutral | OK | Level 2's 3★ (20 s) is under the bot's 24.4 s median; the bot gets 0/5 there (AUD-B4). |
| L4 | Stop, fill, two streams | Contemplative | !! | 3★ 25 s against the bot's 32.1 s. My 40 s run earns the same 2★ as a 130 s non-stopper (AUD-B16). |
| L5–L16, upgrades bought | Max out every track by about day 40 | Empowered → Cheated | XX | Maxed: level 6 goes 29.8 → 98.7 s for the bot, 1★. Capacity +25 % makes level 8 unwinnable for the bot. I post "never buy Capacity" and the community repeats it (AUD-B1). |
| Every card, 5–50 | Read 3 lines, then tap | Focused → Frustrated | !! | The enemy has been streaming since 0.0 s while I read; the card asks for a move that is already late (23) (AUD-B11). |
| L17–L32 | Card reader wins every learning level | Engaged | OK | GD-8 / GD-9 readers: 23 18/20, 27 20/20, 32 50/50. The cards work for me. |
| 3★ hunting | Replays | Focused → Neutral | !! | 3★ is beyond the bot on 40/50 levels. 120 band crystals and 40 achievement crystals hang on it with no evidence it is human-reachable. |
| Daily | Equal for everyone, 3★ = 60 gold | Engaged | OK | 30/30 days winnable; never the same twist on two consecutive days. |
| Weekly | 3★ target | Frustrated | !! | The bot hits it on 12/130 runs, 0/40 under lean. 46 never appears in 52 weeks; 39 appears six times. |
| Day 30 | Content done at about 34 min of bot-pace play | Neutral | !! | Plateau. The known hand-built equal-lane stalemate is still in the rules (GDD §2.0b weakness 1, `SHIELD_MS` unscheduled). |

## 4. Tower-defense lens (`tower-defense/references/balancing.md`, what transfers)

- **"Income vs HP: almost afford each wave."** The analogue is production rate against enemy garrison and aggression. The player's L2 home from level 9 and the 2.0 links/s it buys outpace the 0.3 → 0.9 aggression ramp: the bot's medians stay flat and the first-timer wins bands 5–6 more often than 3–4 (AUD-B18). The curve is set by layout and parity races, not by an escalating number.
- **"Spike → breather → spike, not monotonic."** The band breathers are real in aggression. The measured spikes (23, 27, 32) come without a breather after them: 24, 28 and 33 are not easier for the first-timer than 22, 26 and 31 were.
- **"Diminishing upgrade returns; no dominant build."** The inverse failure applies: one track is strictly worse than not buying it (AUD-B1).
- **"Telegraph specials one wave ahead; give a prep phase."** The lesson card is the telegraph, but there is no prep phase. The sim runs while it is up (AUD-B11).
- **Not transferable** (no analogue in a capture-the-towers game): leaks and lives, sell refunds, "start the next wave early" bonuses, per-wave HP growth curves.

## 5. Good, and must not be "fixed"

1. **No energy or lives, unlimited free retries in the campaign and the daily, nothing pay-gated.** 250/250 reference wins at zero upgrades; Section 4 free viability 3/3. Any "one attempt" or energy proposal undoes the best-scoring section of this audit.
2. **"Equal for everyone" challenges plus the daily cycle picker.** Upgrades and boosters are off; each pool level appears once per 42-day cycle and never the same twist on two consecutive days. Today's sweep: bot 30/30 days and 90/90 seeds, naive 28/30. Keep the reference-bot proof before every day ships.
3. **Streams carry production, under fire, and "sending never empties a tower".** The core loop tolerates bad play: the naive line wins 954/1000 runs and holds 47/50 levels, and every number on screen is the number that lands. Do not add hidden bonuses (the v2.1 table already rejected the stream bonus for this).
4. **Cards that state the winning first move, checked by the literal follower (rule (a)) with both tie orders.** 41 of 50 cards are verified; it is why the veteran wins every learning level. Do not replace them with generic tips or shorten them back to slogans; fix *when* they are shown (AUD-B11), not *what* they say.
5. **The naive-median `star2` floor on 1–16.** The first-timer gets ≥ 2★ on 75 % and 65 % of runs in bands 1–2. It is the model to extend past 16 (AUD-B5), not a special case to remove.

## 6. Data gaps

- No human data: 3★ feasibility, attempts per level, quit points, first-clear 2★ share.
- The continue's rescue rate on 23 / 27 / 32 was not measured; the headless runner has no continue.
- Single commander tiers were sampled on 1–16 (capacity +5 %) and 15 other levels, not swept on all 50; that waits on AUD-B17's runner fix.
- Title, load and first-frame behaviour were not observed (no Playwright, by the brief).

AI confidence: 70 %. Every number above is from today's headless runs and the scratch probes; calibrate with human data (AUD-B4, AUD-B6).
