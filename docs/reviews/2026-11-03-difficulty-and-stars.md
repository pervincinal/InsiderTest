# Design memo 2026-11-03 — the difficulty curve (AUD-B18) and the weight of a star (AUD-B19)

Owner: Game Designer (with the Monetization Designer's hat for §5–§7). Audit rows: AUD-B18 and AUD-B19 in [`2026-10-29-audit-balance.md`](2026-10-29-audit-balance.md) (P3; with AUD-A7 / A8 in [`2026-10-29-audit-ai-levels.md`](2026-10-29-audit-ai-levels.md)). Nothing in this memo changes a level, a constant or the catalog: it measures, names levers and asks for two decisions.

## Decisions for the stakeholder (defaults apply if no answer)

- **Difficulty curve (AUD-B18): a numbers-only retune of three levels in 1.0.1 — 13 (enemy `outpost` 3 → 6 u), 32 (own `factory` 10 → 14 u, `red` / `green` 14 → 12 u), 41 (`home` 18 → 22 u) — and nothing on bands 5–6 before the human playtest.** *Default: the Level Designer applies the three in 1.0.1 against the acceptance numbers of §4; bands 5–6 (33–50) are not re-laid out for 1.0 (the Producer's AUD-Q1 default) and are re-opened only when the human playtest shows what §4.3 lists.*
- **Stars and gold (AUD-B19): option (a) — a 25-gold 2★ rung and a 60-gold 3★ rung — moves ECONOMY §6's steady-state gold by +22 % (130 → 159 a day), outside the ±10 % band.** *Default (the Producer's rule "(a) if §6 steady-state gold stays within ±10 %, else nothing in 1.0"): **nothing in 1.0**; option (b) (a crystal per first 3★ past 16) is not recommended either. The Monetization Designer restates §6's star income from today's rows (§5.3) and the star weight is re-opened in 1.1 with AUD-B4 / B5 and human data.*

## 1. Method (2026-11-03, K = 20, 4 s reactions)

- Tree: HEAD `8cbaf16` (Days 42–45 in: levels 3 / 4 / 23 / 27 / 32 / 33 relaid or re-garrisoned, the six AUD-B10 `star2` clocks, the AUD-A11 standoff release, the AUD-B1 capacity rule). The AI Engineer's AUD-A9 reference-player change (backlog, done 2026-11-03) entered the working tree at 04:20 UTC, after every run below, so **the bot column is the committed reference player** — and AUD-A9 reports the whole `--seeds 20` table byte-identical after it, so the column holds; the naive and idle columns do not use the reference player.
- Runs: `npm run playtest -- --seeds 20` (reference + idle player, 71 s), `npm run playtest -- --naive --seeds 20 --tie both` (first-time line, both tie orders, 78 s). The tool's multi-seed table prints only whether the idle player *won*, so its survival was read with a scratch script that calls the same `runHeadless(level, seed, undefined)` the playtest uses (seeds 1–20, 180 s cap) — all 50 levels, not only 33–50. Lever probes (§4) mutate a deep copy of the `LevelDef` in memory and run the same three lines; their unmodified rows reproduce the tool's rows exactly (e.g. 32: 14/20 99.5 s, 14/20 94.9 s). No file under `tower-clash/` was written. Scripts: `/tmp/claude-0/-home-user-InsiderTest/27ff3ffe-c8bd-51f2-b6a9-550752bc37bb/scratchpad/b18/` (`idle.mts`, `analyse.mjs`, `order.mjs`, `probe*.mts`, `floor.mts`, `stars.mjs`).
- "First-timer" = the naive line (`scripts/lib/naivePlayer.ts`: every 4 s each free link streams to the nearest non-own tower, never stops a stream). It is the model the team trusts on 1–16 and the only first-time model there is until AUD-A2's human playtest.

## 2. The measured curve per band

| Band | Levels | Enemy aggression (JSON) | Bot median: range (median of the band's medians) | Naive `asc` wins, median of medians | Naive `tie desc` wins, median of medians | ≥ 2★ runs `asc` / `desc` | Idle player: alive at 180 s; median death (median of the levels where it dies; fastest level) |
|---|---|---|---|---|---|---|---|
| 1 Tutorial | 1–8 | 0.1–0.3 | 9.1–52.1 s (28.5) | 160/160, 66.3 s | 160/160, 71.8 s | 158/160 (99 %) / 134/160 (84 %) | 106/160; 83.7 s (only 3, 7, 8 die; 35.3 s on 3) |
| 2 Walls & guns | 9–16 | 0.3–0.7 | 25.5–47.9 s (33.4) | 160/160, 63.4 s | 160/160, 68.5 s | 127/160 (79 %) / 114/160 (71 %) | 20/160 (all on 13); 62.5 s (48.3 s on 14) |
| 3 Two rivals | 17–24 | 0.4–0.8 | 28.4–46.5 s (35.5) | 159/160, 62.1 s | 159/160, 57.0 s | 47/160 (29 %) / 53/160 (33 %) | 2/160; 87.2 s (74.3 s on 17) |
| 4 Iron & water | 25–32 | 0.4–0.8 | 27.6–50.0 s (42.5) | 154/160, 64.1 s | 154/160, 65.5 s | 67/160 (42 %) / 62/160 (39 %) | 2/160; 94.8 s (84.9 s on 29) |
| 5 Three kings | 33–40 | 0.4–0.8 | 31.7–87.7 s (49.2) | 160/160, 74.3 s | 160/160, 76.0 s | 101/160 (63 %) / 99/160 (62 %) | 11/160 (8 on 39); 108.2 s (71.0 s on 33) |
| 6 Grand Campaign | 41–50 | 0.6–0.9 | 30.6–77.3 s (48.9) | 197/200, 73.1 s | 196/200, 74.6 s | 131/200 (66 %) / 117/200 (59 %) | 5/200; 111.5 s (72.9 s on 48) |

**What the table says.**
1. **The bot's curve is still flat.** 34 of the 42 bot medians on 9–50 sit between 25 and 52 s (the audit read 35/42); the band medians climb 33 → 35 → 43 → 49 → 49 s while the aggression column climbs 0.3 → 0.9. Only five levels run past 60 s (37, 39, 40, 41, 42), and 43 / 44 / 49 — three of the last eight — are among the bot's fastest fifteen of 42 (33.0 / 30.6 / 33.1 s).
2. **The first-timer's win curve is no longer inverted, its star curve and its pressure curve are.** Days 42–45 lifted bands 3–4 from the audit's 551/640 to **626/640** naive wins over both tie orders (23, 27, 32 relaid or re-garrisoned; AUD-B12), against **713/720** on 33–50 (unchanged). What is still upside down: (a) the first-clear 2★ share — 29–42 % in bands 3–4 against 59–66 % in bands 5–6, because `star2` = 2 × `star3` is wider in seconds on the long late levels; (b) the pressure on a player who does nothing — the idle player dies after a median 87 / 95 s in bands 3–4 but 108 / 112 s in bands 5–6, and is still alive at 180 s on 8 of 20 seeds of 39 and 3 of 42 (AUD-A7: waiting while the kings fight is nearly free).
3. **The time pillar is not "under a minute".** First-timer medians are 48–141 s on 9–50 (under 50 s only on 20, 25 and 26's `asc` row), the bot's 25–88 s; the hard cap is 180 s (`HEADLESS_MAX_MS`). GDD §1 / §3 now say so (AUD-B20).

Per level: appendix A.

## 3. The five levels most out of order

Ranked by how far the level's first-timer outcome (naive wins over both tie orders, then the naive median and the 2★ share, then idle pressure and the bot median) sits from its place in the order — the direction is the problem, not the size alone.

| # | Level | Where it is | Measured (K = 20) | Why it is out of order |
|---|---|---|---|---|
| 1 | **32 Siege Works** | band 4 finale, position 32 | naive **14/20 + 14/20** (12 of 40 lost — the only level under 80 % in the campaign), 99.5 / 94.9 s, 2★ 2 + 2; bot 48.7 s | The hardest level of the game for a first-timer, right before the three-kings band that loses **0 of 320** naive runs. AUD-B12's home 16 → 24 u took it from 4/20 to 14 / 14; it is still the spike. |
| 2 | **41 Twin Rivers** | band 6 opener (aggression 0.6, the band's lowest) | naive **17/20 + 16/20**, 131.8 / 140.9 s, 2★ 12 + 7; bot 77.3 s (second-longest bot level) | The band's first level is its hardest: 42–50 lose **0 of 360** naive runs. The band brief says 0.6 → 0.9 "non-decreasing, no breather"; the felt curve is the opposite — a wall at the door, then a plain. |
| 3 | **50 The Crown Reforged** | the finale, aggression 0.9 | naive **20/20 + 20/20**, 77.1 s both orders, **2★ 19 + 19** (more than 14 of the 16 levels 17–32 pay); idle dies after a median **138.4 s** (1/20 alive at 180 s) — the slowest death of band 6 | The last exam pays a first-timer more stars than the middle of the campaign and punishes inaction least of its band. AUD-A7: starting at 30 s costs the bot only 5.3 s. |
| 4 | **49 Last Light** | penultimate, aggression 0.85 | naive **20/20 + 20/20**, 70.9 s, 2★ 0 + 0; bot **33.1 s** (faster than 27 of the other 41 levels 9–50); idle dies after 104.9 s | An 0.85 three-king level the bot clears at band-2 pace (band 2's median of medians is 33.4 s) and the first-timer never loses: the L2 fortress home (40 u, every landing halved) is safe from a line that never stops a stream. |
| 5 | **13 Crossfire** | band 2, position 13 (a naive-floored level) | naive 20/20 + 20/20 but **84.7 / 80.1 s against `star2` 80**, 2★ **9 + 10** (the only level of 9–16 with both medians over its clock); idle **alive 20/20** | Longer for a first-timer than 32 of the 37 levels after it, and on the band whose clock promises an attentive first-timer 2★ (GDD §3 items 8 / 10) it pays 2★ to half of them. The turtle at 0.3 never attacks: doing nothing never loses (by design of the 13 dip — not the lever). `reclock.ts` holds `star2` at 80 by the 8-of-20 gap rule. |

Runners-up, recorded and not proposed: **48** (naive 62.9 s, 40/40 2★, the L3 start) is the easiest level after 33 — AUD-A8 asks for a breather at 48, so it is in order by intent; **14** (100.5 vs 70.2 s) is a tie-order artefact, not a difficulty one; **43 / 44** (bot 33.0 / 30.6 s at 0.7) are bot-fast but first-timer-average (67 / 72 s, 1★); **39** (idle alive 8/20) is the "wait" lesson AUD-A7 says may be intended.

## 4. 1.0.1 plan (Level Designer; JSON numbers only, no new mechanic, no card change)

### 4.1 The three levers to apply

Probed in memory at K = 20 (reference / naive `asc` / naive `tie desc` / idle). Every alternative tried is listed, so the Level Designer does not re-walk it.

| Lvl | Lever | Before → after (probe) | Rejected alternatives (probe) | Acceptance (all at K = 20 unless noted) |
|---|---|---|---|---|
| **13** | enemy `outpost` (L1 barracks) **3 → 6 u** | bot 47.9 → 48.6 s; naive 84.7 / 80.1 → **79.9 / 78.2 s**; 2★ 9 + 10 → **11 + 15**; idle alive 20/20 → 20/20 | `mid` 8 → 6 + `east2` 6 → 5: 86.8 / 86.8 s, 2★ 5 + 5; `mid` 8 → 5: 87.0 s; `guns` 4 → 2: 88.1 / 81.9 s; `west` / `east` 4 → 3: 85.5 / 80.8 s; turtle 0.3 → 0.4: naive **1/20** + 7/20 (it starts shielding, GDD §3 item 7) | both naive medians ≤ `star2` 80 s; ≥ 2★ ≥ 10/20 in each order; naive gate 9–16 at K = 5 both orders green; reference 20/20; tier gate green; five twists ≥ 45/50 at K = 50; `reclock.ts --seeds 20` dry run moves no clock |
| **32** | own `factory` **10 → 14 u**, enemy `red` / `green` **14 → 12 u** | bot 48.7 → 48.2 s; naive **14 / 14 → 18 / 18** of 20, 99.5 / 94.9 → 93.3 / 87.8 s; 2★ 2 + 2 → 5 + 4; idle death 109.7 → 101.8 s | opportunist 0.8 → 0.7: 13 / 11; `factory` 14 alone: 15 / 17; `red` / `green` 12 alone: 15 / 16; `factory` 16 or 18: 14 / 14–15 (bot 66.9 s) | naive ≥ 16/20 in each order (GDD §3.14's late 80 % share); reference ≥ 19/20, median ≤ 55 s; five twists ≥ 45/50 at K = 50; idle never wins; start garrisons < 0.8 × cap (factory L1 14 < 20 ✓); item 9's learning-level status and card stay |
| **41** | own `home` (L1) **18 → 22 u** | bot 77.3 → 72.9 s; naive **17 / 16 → 20 / 19**, 131.8 / 140.9 → **106.3 / 107.6 s**; 2★ 12 + 7 → **20 + 19**; idle death 78.7 → 80.1 s | `home` 20: 18 / 16; `mid` 8 → 6: 16 / 17; opportunist 0.6 → 0.5: 16 / 13; `red` / `green` 8 → 6: 17 / 14; `w` / `e` 4 → 3: 17 / 15; `ford` 6 → 9: 14 / 16; `nw` / `ne` 10 → 7: **7 / 8** | naive ≥ 19/20 in each order, both medians ≤ 120 s; reference 20/20; five twists ≥ 45/50 at K = 50; `star3` / `star2` only through `reclock.ts` (the bot's 72.9 s would read `star3` 65); the card's "let your home grow to 25 first" stays true (the wait shrinks from 7 s to 3 s; 24 u is the 27 / 32 / 37 precedent) |

**Curve-level acceptance after the three:** bands 3–4 ≥ 632/640 naive wins over both orders (no level under 16/20); 42–50 unchanged (0 of 360 lost); no bot median outside ± 5 s of today's except 41; `npm run playtest -- --seeds 20` and the CI gates green. Re-read the band table of §2 into GDD §3 when applied.

### 4.2 Why nothing is proposed for 49 and 50 (and 45–50)

The audit had two opposite cures — AUD-A8 "give 45–50 an exam level that loses ≥ 30 %", AUD-B18 "fix the middle, do not harden 41–50". Measured, the level levers cannot do A8's job:

| Probe | Bot | Naive `asc` / `desc` | 2★ | Idle death |
|---|---|---|---|---|
| 49 today | 33.1 s | 20 / 20, 70.9 s | 0 + 0 | 104.9 s |
| 49 kings +4 each (`red` / `green` 14, `yellow` 16) | 34.0 s | 20 / 20, 73.0 s | 0 + 0 | 109.1 s |
| 49 `e` 5 → 9 | 35.1 s | 18 / 18, 81.5 s | 0 + 0 | 106.2 s |
| 49 fortress home → L2 barracks 30 u (start-tower kind — a re-layout) | 36.5 s | 19 / 19, 71.4 s | 0 + 0 | 90.8 s |
| 50 today | 49.6 s | 20 / 20, 77.1 s | 19 + 19 | 138.4 s |
| 50 `red` 16 → 22 | 69.6 s | 20 / 20, 79.9 s | 19 + 19 | 144.8 s |
| 50 `red` + `yellow` 16 → 22 | 66.6 s | 20 / 20, 82.6 s | 15 + 15 | 115.5 s |
| 50 `yellow` 16 → 24 | 66.2 s | 19 / 19, 79.7 s | 15 + 15 | 124.8 s |
| 50 `red` 120 px closer (y 480 → 600) | 73.9 s | 20 / 20, 93.0 / 90.9 s | 7 + 9 | 130.8 s |

Every lever that touches the kings slows the **bot** by 15–25 s (past band 6's 60 s median cap) and costs the first-timer 2★, but none makes it lose more than 1–2 seeds: the kings spend their armies on each other (AUD-A3: 7 % of enemy streams aim at the player in band 5; AUD-A4 re-flips). The inversion on 45–50 is the AI's, not the layouts'. So the Producer's 1.0 default (no re-layout of bands 5–6 before the human playtest) costs nothing the level levers could buy.

### 4.3 What the human playtest must show to re-open bands 5–6

Protocol: [`2026-10-29-audit-ai-levels.md`](2026-10-29-audit-ai-levels.md) §4, session B (17, 23, 27, 32, 33, 41, 45, 49, 50; at most 3 attempts each). N = 1 (the stakeholder alone) gives hypotheses only — it re-opens nothing. With **N ≥ 3** (stakeholder + 2 fresh testers), bands 5–6 are re-opened when **(i) and one of (ii)–(iv)** hold for ≥ 2 of the 3 testers:

1. (i) **H1 confirmed:** attempts to first clear = 1 on each of 45, 49 and 50, while ≥ 2 on at least one of 23, 27, 32.
2. (ii) 49 or 50 first-cleared at ≥ 2★, or both cleared faster than the same tester's 33.
3. (iii) H2 fails on 49: the tester cannot name the colour that attacked them first (≤ 1 of 3 matches the observer log — "nobody attacked me").
4. (iv) Interview Q3 / Q8 name a finale as "easy", "nothing happened" or "luck", with no F1+ frustration code logged on 45–50.

If re-opened, the order of work is **AUD-A3 first** (the AI's front term — the AI Engineer: an enemy that keeps the player's first 30 s contested), re-measured with this memo's table, and a re-layout of 49 / 50 only if AUD-A3 leaves the naive line at ≥ 19/20 there. **Do not re-open** when ≥ 2 testers need ≥ 2 attempts on any of 45–50 (H1 refuted for the finales). For the 1.0.1 three: **drop the 32 lever** if ≥ 2 testers first-clear 32 at the first attempt, and **drop 41's** if ≥ 2 first-clear 41 within 2 attempts at ≥ 2★ (the bot-free evidence beats the probe).

## 5. The star economy today (AUD-B19)

### 5.1 What a star pays (`EARN_RULES`, `src/economy/catalog.ts`; ECONOMY §2.1)

| Rung | First clear | Improvement on replay | With the ×2 ad (5 a day) | Against the sinks |
|---|---|---|---|---|
| 1★ | 10 | — | 20 | |
| 1★ → 2★ | +10 | 10 | 20 | a third of an Overdrive (30), a quarter of a Freeze (40), 0.9 % of one commander track (1 100) |
| 2★ → 3★ | +10 | 10 | 20 | the same |
| Drill replay, no new star | 3 per star, ≤ 100 a day | | | |

Share of ECONOMY §6 income: **to day 15**, stars are 700 of 2 273 gold (**31 %**; ≈ 1 120 = 49 % with the ×2 ads that double them); **in steady state** (days 16–30, 130 a day), stars and drills are 30 (**23 %**; 50 = 38 % with their ads) and the one new star a day §6 books is **10 gold = 7.7 %** (20 = 15 % with its ad).

### 5.2 How often the first-time line reaches 2★ now (K = 20, both tie orders)

First-clear stars = the naive line's stars, mean of the two orders; a lost seed counts as a 1★ retry (§6's convention). The last column re-scores the same runs at the GD-12 / AUD-B5 `star2` floors (16 levels, `star2` +5 … +30 s, GDD §3 "Star-2 floor after launch"; measured in memory, not applied).

| Band | First-clear stars (per level) | ≥ 2★ share today | Audit 2026-10-29 | With the AUD-B5 floor |
|---|---|---|---|---|
| 1–8 | 16.3 (2.04) | 91 % | 75 % | 91 % (no floor there) |
| 9–16 | 14.0 (1.75) | 75 % | 65 % | 75 % (no floor there) |
| 17–24 | 10.5 (1.31) | **31 %** | 27 % | 64 % |
| 25–32 | 11.2 (1.40) | **40 %** | 19 % | 68 % |
| 33–40 | 13.0 (1.63) | 63 % | 62 % | 84 % |
| 41–50 | 16.2 (1.62) | 62 % | 58 % | 83 % |
| **1–50** | **81.3 (1.63★)** — §6 books 70 (1.40★, `f8c1743`, 2026-09-26); the bot's line 103.7 (2.07★) | | | ≈ 90.0 (1.80★) |

Floor rows (2★ runs `asc` / `desc` of 20, today → floored): 17 2 / 3 → 10 / 11, 18 0 / 0 → 3 / 2, 19 8 / 6 → 18 / 15, 21 0 / 0 → 6 / 12, 23 5 / 11 → 14 / 16, 24 1 / 3 → 18 / 19, 25 0 / 0 → 14 / 14, 28 2 / 0 → 16 / 18, 29 0 / 0 → 13 / 8, 32 2 / 2 → 4 / 6, 34 0 / 0 → 19 / 17, 35 1 / 0 → 13 / 13, 38 0 / 0 → 5 / 4, 43 0 / 0 → 15 / 14, 44 0 / 0 → 19 / 19, 49 0 / 0 → 9 / 9.

### 5.3 What that does to §6's "one new star a day"

- **The rungs left to hunt are fewer than §6 books.** Inside the bot's line the first-timer has 103.7 − 81.3 = **22.4** improvable stars (§6: 32); the open 2★ rungs past 16 (expected 1★ first clears) are **17.1**. One new 2★ a day from day 16 therefore lasts **≈ 17 days (to ≈ day 32)** — §6's days 16–30 window holds, just. With the AUD-B5 floor 8.7 of those rungs are paid on the first clear instead and the runway is **≈ 8 days (to ≈ day 23)**. 3★ rungs do not extend it: the bot itself reaches 3★ on 73 of 1 000 runs.
- **After the runway** the steady state loses the 10-gold rung and ≈ 4 gold of its ad (the ad moves to a drill result): **130 → ≈ 116 a day (−11 %)**.
- **The campaign rows are understated today:** 81.3 first-clear stars instead of 70 is ≈ +113 gold of first clears and ≈ +60 of the ads that double them, ≈ **+170 by day 15 (+7.5 %)** — the AUD-B10 clocks and the AUD-B12 / B9 / B16 layouts raised the first-timer's stars since §6 was measured.

## 6. Two options, with numbers

Method: `stars.mjs` (scratch, ECONOMY §6 conventions): the same day split on both sides (levels 1–16 at 4 a day — level 16 at the end of day 4, as §6 — and 17–50 at 3–4 a day to day 15), two ×2 ads a day on the day's two best results, first-clear stars from §5.2, steady state = §6's row (47 login + 26 challenge + 6 weekly + 10 one new star + 20 drill + 20 ads); the deltas are added to §6's published checkpoints.

### (a) A 25-gold 2★ rung and a 60-gold 3★ rung

Rungs **10 / 25 / 60** (a first clear pays 10 / 35 / 95; an improvement pays the rung it reaches); drill pay, the daily's 10 a star and the weekly unchanged. Code it would touch tomorrow: `EARN_RULES.goldPerStarFirstClear` / `goldPerNewStar` → a per-rung table, the result-card gold line, `tests/economy/*`, GDD §2.6.

| | §6 today | (a) | Δ |
|---|---|---|---|
| Day 15: first-clear star gold (method) | 813 | 1 316 | +503 |
| Day 15: ×2 ads (method) | 544 | 945 | +401 |
| **Day 15 total** | 2 273 | **≈ 3 178** | **+905 (+40 %)** |
| **Steady state, gold a day** | **130** | **≈ 159** | **+29 (+22 %)** — the one new 2★ a day pays 25, its ad 25 |
| Day 30 | 4 178 | ≈ 5 518 | +1 340 (+32 %) |
| Full commander tree (5 500) | ≈ day 40 | ≈ day 30 | −10 days (then the 800 → 5 trade, §3.7) |

Read as a cumulative 60 for 3★ (rung 25) instead: day 15 +835 (+37 %), steady state the same +22 % (a 3★ rung is not in the first-timer's steady state). With the AUD-B5 floor the day-15 delta grows by at least ≈ +220 (8.7 more first-clear 2★ at +25, plus ads) and the steady-state gain lasts half as long (§5.3).

**Verdict against the Producer's rule: +22 % is outside ±10 % → nothing in 1.0.** For the record (not proposed — five gold is not weight): the largest 2★ rung that keeps steady state inside ±10 % is **16** (+8.5 %); **15** gives +6.9 % a day but +268 (+11.8 %) by day 15.

### (b) One crystal for each first 3★ on levels 17–50

| | First-time line | Bot-pace (mastery) line |
|---|---|---|
| 3★ runs past 16 at K = 20 | 0 of 1 360 (both orders) | 41 of 680 |
| Crystals per pass of 17–50 | **0** | **≈ 2.05** |
| Ceiling (34 levels, one-time) | 34 crystals = 2.9 days of the 11.55-a-day steady rate, 1.4 % of the 2 430-crystal shop | |
| §6 steady-state gold / crystals | 0 % / ≈ 0 a day (one-offs) | 0 % / ≈ 0 |

**Verdict:** it fits any band because it weighs nothing; it pays nobody AUD-B19 is about (the first-timer, who never reaches 3★), and it would be a fifth 3★-gated reward (band 3★ 120 crystals, `stars_*` 40, the weekly target 20 a week, 3★ hunting) with no evidence a human reaches 3★ at all (AUD-B4). **Not recommended.**

## 7. Recommendation

1. **Producer default holds: nothing in 1.0** (option (a) breaks ±10 %; (b) is weightless). Stars stay a readable, low-stakes ladder — which is the audit's own fix for B19 ("keep the low stakes on purpose").
2. **Monetization Designer, tomorrow (docs only):** restate ECONOMY §6's star rows from these rows — first-clear 1.63★ (81 stars, not 70), the steady-state new star as a 2★ rung with a ≈ 17-day runway (≈ 8 with AUD-B5), ≈ 116 a day after it — and re-run the AUD-B5 floor's §6 delta from §5.2's last column (AUD-B5's own precondition).
3. **Re-open in 1.1 with AUD-B4 (`star3` from human timings) and AUD-B5**, on the GD-12 telemetry or the AUD-A2 playtest's H3 / H4: if human first clears past 16 reach 2★ on ≥ 60 % (the floored bands' share above), the candidate is a **15-gold 2★ rung** (+6.9 % steady state); if humans earn 3★ on < 10 % of first clears (H3), no new 3★-gated currency is added.

## Appendix A — every level, K = 20 (2026-11-03, `8cbaf16`)

Bot = reference player median; naive = first-time line (4 s); ≥ 2★ = naive runs at 2★ or better per order; idle = the do-nothing player (alive at 180 s; median time of its loss).

| Lvl | Name | Enemies (personality aggression) | Bot median | Naive asc wins, median | Naive desc wins, median | ≥ 2★ asc / desc | `star2` | Idle alive at 180 s, median death |
|---|---|---|---|---|---|---|---|---|
| 1 | First Taps | t0.2 | 9.1 s | 20/20, 21.6 s | 20/20, 21.6 s | 20 / 20 | 60 s | 20/20, — |
| 2 | Supply Line | r0.2 | 24.4 s | 20/20, 68.0 s | 20/20, 68.0 s | 20 / 20 | 70 s | 20/20, — |
| 3 | Free Real Estate | r0.3 | 27.8 s | 20/20, 52.4 s | 20/20, 57.6 s | 20 / 18 | 60 s | 6/20, 35.3 s |
| 4 | Build Up | t0.3 | 28.9 s | 20/20, 64.7 s | 20/20, 64.7 s | 20 / 20 | 65 s | 20/20, — |
| 5 | Around the Wall | r0.2 | 37.4 s | 20/20, 71.3 s | 20/20, 108.0 s | 20 / 13 | 110 s | 20/20, — |
| 6 | Outpost First | t0.3 | 29.8 s | 20/20, 92.1 s | 20/20, 94.7 s | 19 / 13 | 95 s | 20/20, — |
| 7 | Long March | r0.1 | 28.1 s | 20/20, 63.9 s | 20/20, 89.9 s | 20 / 10 | 90 s | 0/20, 83.7 s |
| 8 | Two Bases | r0.2 | 52.1 s | 20/20, 72.5 s | 20/20, 75.5 s | 19 / 20 | 90 s | 0/20, 120.1 s |
| 9 | Stone Walls | r0.3 | 30.7 s | 20/20, 57.8 s | 20/20, 57.8 s | 13 / 13 | 60 s | 0/20, 73.5 s |
| 10 | Hold the Line | r0.3 | 25.5 s | 20/20, 63.2 s | 20/20, 67.0 s | 12 / 7 | 65 s | 0/20, 73.7 s |
| 11 | Starve the Keep | o0.4 | 36.1 s | 20/20, 57.5 s | 20/20, 67.2 s | 18 / 14 | 70 s | 0/20, 52.2 s |
| 12 | Gun Post | r0.4 | 29.1 s | 20/20, 58.6 s | 20/20, 58.6 s | 20 / 20 | 65 s | 0/20, 78.3 s |
| 13 | Crossfire | t0.3 | 47.9 s | 20/20, 84.7 s | 20/20, 80.1 s | 9 / 10 | 80 s | 20/20, — |
| 14 | Guns and Walls | o0.6 | 36.2 s | 20/20, 100.5 s | 20/20, 70.2 s | 18 / 20 | 105 s | 0/20, 48.3 s |
| 15 | The Citadel | r0.7 | 43.7 s | 20/20, 70.2 s | 20/20, 69.8 s | 18 / 16 | 75 s | 0/20, 62.5 s |
| 16 | Last Bastion | r0.5 | 30.5 s | 20/20, 63.6 s | 20/20, 70.0 s | 19 / 14 | 75 s | 0/20, 59.2 s |
| 17 | Minefield | r0.4 o0.4 | 28.4 s | 20/20, 54.4 s | 20/20, 54.1 s | 2 / 3 | 50 s | 0/20, 74.3 s |
| 18 | Two Rivals | r0.45 t0.45 | 37.1 s | 20/20, 66.8 s | 20/20, 72.5 s | 0 / 0 | 60 s | 1/20, 104.2 s |
| 19 | Toll Gate | o0.5 r0.5 | 33.0 s | 20/20, 51.2 s | 20/20, 52.9 s | 8 / 6 | 50 s | 0/20, 75.1 s |
| 20 | The Boulder | r0.45 o0.45 | 34.1 s | 20/20, 49.3 s | 20/20, 49.6 s | 13 / 12 | 50 s | 0/20, 84.9 s |
| 21 | Mined Flank | t0.6 r0.6 | 29.3 s | 20/20, 61.3 s | 20/20, 53.7 s | 0 / 0 | 50 s | 0/20, 79.5 s |
| 22 | Castle in the Middle | r0.7 o0.7 | 46.5 s | 20/20, 63.4 s | 20/20, 60.0 s | 18 / 18 | 70 s | 0/20, 89.4 s |
| 23 | First Blood | r0.75 t0.75 | 37.0 s | 19/20, 81.2 s | 19/20, 74.3 s | 5 / 11 | 75 s | 1/20, 97.7 s |
| 24 | The Gauntlet | o0.8 r0.8 | 40.8 s | 20/20, 62.9 s | 20/20, 64.5 s | 1 / 3 | 60 s | 0/20, 90.3 s |
| 25 | Heavy Metal | r0.4 t0.4 | 27.9 s | 20/20, 48.1 s | 20/20, 48.3 s | 0 / 0 | 40 s | 0/20, 96.8 s |
| 26 | Steamroller | o0.45 r0.45 | 27.6 s | 20/20, 49.1 s | 20/20, 55.4 s | 20 / 19 | 60 s | 0/20, 91.3 s |
| 27 | Armour Race | r0.5 o0.5 | 50.0 s | 20/20, 65.3 s | 20/20, 65.0 s | 20 / 20 | 80 s | 0/20, 88.0 s |
| 28 | Hold the Ford | r0.55 t0.55 | 44.9 s | 20/20, 76.0 s | 20/20, 78.3 s | 2 / 0 | 70 s | 2/20, 129.3 s |
| 29 | Two Fords | o0.6 r0.6 | 31.1 s | 20/20, 62.9 s | 20/20, 66.0 s | 0 / 0 | 50 s | 0/20, 84.9 s |
| 30 | One Front | r0.7 o0.7 | 48.5 s | 20/20, 71.1 s | 20/20, 75.0 s | 13 / 11 | 80 s | 0/20, 127.9 s |
| 31 | Guns over the River | o0.75 r0.75 | 40.0 s | 20/20, 60.0 s | 20/20, 60.0 s | 10 / 10 | 60 s | 0/20, 92.7 s |
| 32 | Siege Works | r0.8 o0.8 | 48.7 s | 14/20, 99.5 s | 14/20, 94.9 s | 2 / 2 | 80 s | 0/20, 109.7 s |
| 33 | Three Kings | r0.4 t0.4 o0.4 | 38.5 s | 20/20, 57.4 s | 20/20, 56.8 s | 20 / 20 | 70 s | 0/20, 71.0 s |
| 34 | Weakest Link | r0.45 r0.45 t0.45 | 41.4 s | 20/20, 76.7 s | 20/20, 77.5 s | 0 / 0 | 60 s | 0/20, 98.0 s |
| 35 | Powder Keg | o0.5 r0.5 r0.5 | 31.7 s | 20/20, 63.4 s | 20/20, 62.5 s | 1 / 0 | 50 s | 0/20, 80.2 s |
| 36 | One Wide Ford | r0.6 o0.6 t0.6 | 57.0 s | 20/20, 77.1 s | 20/20, 78.7 s | 20 / 20 | 90 s | 0/20, 111.0 s |
| 37 | Tank Country | r0.65 r0.65 o0.65 | 65.3 s | 20/20, 64.3 s | 20/20, 78.0 s | 20 / 20 | 110 s | 1/20, 105.4 s |
| 38 | Ring of Fire | r0.7 o0.7 r0.7 | 32.6 s | 20/20, 73.9 s | 20/20, 74.6 s | 0 / 0 | 50 s | 1/20, 117.8 s |
| 39 | The Long Night | t0.75 t0.75 r0.75 | 87.7 s | 20/20, 121.0 s | 20/20, 136.9 s | 20 / 19 | 150 s | 8/20, 156.7 s |
| 40 | The Crown | r0.8 o0.8 t0.8 | 63.5 s | 20/20, 74.6 s | 20/20, 67.8 s | 20 / 20 | 100 s | 1/20, 124.5 s |
| 41 | Twin Rivers | r0.6 o0.6 | 77.3 s | 17/20, 131.8 s | 16/20, 140.9 s | 12 / 7 | 140 s | 0/20, 78.7 s |
| 42 | Siege Engine | r0.65 r0.65 t0.65 | 67.0 s | 20/20, 95.8 s | 20/20, 101.2 s | 20 / 17 | 120 s | 3/20, 133.8 s |
| 43 | Iron Convoy | r0.7 o0.7 o0.7 | 33.0 s | 20/20, 67.2 s | 20/20, 67.2 s | 0 / 0 | 60 s | 0/20, 115.9 s |
| 44 | Minefield Crossing | r0.7 t0.7 o0.7 | 30.6 s | 20/20, 72.5 s | 20/20, 72.5 s | 0 / 0 | 50 s | 0/20, 92.1 s |
| 45 | Three Fronts | r0.75 o0.75 o0.75 | 48.2 s | 20/20, 71.3 s | 20/20, 92.7 s | 20 / 14 | 95 s | 0/20, 113.7 s |
| 46 | River Gate | r0.75 o0.75 t0.75 | 55.8 s | 20/20, 76.8 s | 20/20, 75.5 s | 20 / 20 | 90 s | 0/20, 109.3 s |
| 47 | Scorched Earth | r0.8 o0.8 t0.8 | 44.1 s | 20/20, 73.7 s | 20/20, 73.7 s | 20 / 20 | 90 s | 1/20, 126.0 s |
| 48 | Kings' Council | r0.8 o0.8 r0.8 | 54.5 s | 20/20, 62.9 s | 20/20, 64.7 s | 20 / 20 | 90 s | 0/20, 72.9 s |
| 49 | Last Light | r0.85 r0.85 o0.85 | 33.1 s | 20/20, 70.9 s | 20/20, 70.9 s | 0 / 0 | 50 s | 0/20, 104.9 s |
| 50 | The Crown Reforged | r0.9 o0.9 t0.9 | 49.6 s | 20/20, 77.1 s | 20/20, 77.1 s | 19 / 19 | 90 s | 1/20, 138.4 s |

## Appendix B — reproduce

```bash
cd tower-clash
npm run playtest -- --seeds 20                       # bot + idle-won column (71 s)
npm run playtest -- --naive --seeds 20 --tie both    # first-time line, both orders (78 s)
S=/tmp/claude-0/-home-user-InsiderTest/27ff3ffe-c8bd-51f2-b6a9-550752bc37bb/scratchpad/b18
npx tsx $S/idle.mts > $S/idle20.txt                  # idle survival per level (runHeadless, no player)
node $S/analyse.mjs $S && node $S/order.mjs $S       # band table, order ranks
npx tsx $S/probe.mts 41                              # lever probes (in memory; probe2/3/4 hold the other variants)
npx tsx $S/floor.mts                                 # 2★ at the AUD-B5 floors
node $S/stars.mjs $S                                 # §5–§6 numbers
```
