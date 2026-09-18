# Tower Clash — Game Design Document

Working title: **Tower Clash** (a Tower War–style capture-the-towers RTS). Platform: browser (mobile-first, portrait, touch + mouse). Engine: none — TypeScript + HTML5 Canvas 2D. Source lives in `tower-clash/`.

## 1. Vision

A one-thumb real-time strategy game where every decision is simple arithmetic and every level is under three minutes. The player captures every enemy tower on a map by sending garrisoned units along roads, choosing between upgrading, expanding, and defending.

Design pillars:
1. **Readable** — numbers on towers, colour = owner, nothing hidden.
2. **Tense** — sending units empties the tower; the AI punishes greed.
3. **Escalating vocabulary** — a new building or hazard roughly every 8–10 levels.
4. **Short & replayable** — 3-star clock per level.

## 2. Core rules (authoritative — engineers implement exactly this)

## 2.0 Rules v2 (2026-09-15, stakeholder request) — supersede §2.2 "Upgrade" and §2.3 "Sending units"

**Auto-upgrade.** Towers no longer upgrade by spending units. Capacity ladder is **25 / 50 / 100** for L1 / L2 / L3. When a L1 or L2 tower's garrison reaches its capacity it upgrades instantly (level +1, garrison kept, `upgrade` event). L3 is the maximum: the garrison caps at 100 and production stops adding. Fortress: capacity ×1.5 (37 / 75), max L2. Artillery and tank factory use the same ladder (weight for tanks). Commander "capacity" upgrades multiply the ladder; the `upgrade` command is ignored (kept for save/replay compatibility). Production intervals per level stay 1.0 / 0.7 / 0.5 s.

**Attack streams (links).** Sending is a persistent **link** from an owned tower to a road-connected tower:
- `link { owner, from, to }` — valid when `owner` owns `from`, an uncut road connects them, `to ≠ from`, and `from` has fewer than `maxLinks(level) = level` active links (L1 = 1 target, L2 = 2, L3 = 3). `unlink { owner, from, to? }` removes one or all links of `from`.
- While a tower has ≥ 1 link it **drains**: every `LEAVE_INTERVAL_MS` (120 ms) one unit (infantry, or a whole tank when ≥ 5 weight) leaves into the next link round-robin, as long as garrison ≥ 1. Newly produced and newly arrived units are drained the same way, so a linked tower does not grow and cannot auto-upgrade ("inkişafı dayanır").
- A link ends automatically when: the source changes owner; the road is cut; or the target is owned by the link owner **and** its garrison is at capacity (nothing to reinforce). A link does **not** end on capture — it keeps flowing as a supply line until the player stops it or the target fills up.
- Units on a road still clash as before; arrivals reinforce (friendly) or damage/capture (hostile) exactly as in §2.3.
- Boosters, mines, barriers, bridges, artillery are unchanged. Continue/rewind snapshots include links.

**Interaction.** Tap own tower = select. Tap a connected tower = create link (or remove it if that link exists). At the link limit the tap is refused with a short shake and hint "L2 needed for 2 streams". Drag from tower to tower = link. Tap the selected tower again = deselect. The send-ratio toggle is removed.

**Presentation.** Every active link is drawn as a road-following ribbon in the **owner's colour** (player blue, enemies red/green/yellow), ~10 px wide, 55 % alpha, with chevrons animating toward the target and an arrowhead at the target; the player's own links are brighter with a thin ink outline; enemy links are visible too so incoming attacks can be read at a glance. Tower sprites change with level: L1 small tower, L2 taller with a second storey and banner, L3 large keep with double roof and battlements (all kinds), plus the existing gems.

**AI.** Bots issue `link`/`unlink` instead of `sendUnits`: an attack is a link; "reserve" becomes "unlink when the source is threatened or the goal is reached"; the reference player unlinks a supply line when the target is full or when the source needs to grow to the next level. Exact rules, constants and the threat model: §2.5.

**Implementation notes (verified 2026-09-15 against commit 4bb3944, `src/sim/step.ts`).** These are the precise readings of the paragraphs above; where they add a number, that number is the rule.
- Tick order (50 ms): boosters expire → generation (+ auto-upgrade) → `pruneLinks` → `drain` → legacy queues → movement → hazards → clashes → artillery → arrivals (+ auto-upgrade on reinforcement) → `pruneLinks` again → outcome. The second prune means a target filled by this tick's arrivals releases its supply lines on the same tick.
- **Drain.** A tower with ≥ 1 link accumulates `drainAccMs`; every 120 ms one unit leaves into `links[linkCursor]` and the cursor advances (round-robin in link creation order). A tank factory sends a whole tank (weight 5) while it holds ≥ 5, otherwise one infantry. If the garrison is smaller than the next unit, the timer stays armed at exactly one interval, so a unit that is produced or arrives later leaves on the tick it appears. With 0 links the timer resets to 0. Consequence: a burst of `S` units takes `S × 0.12 s` to leave whatever the level; two links share it 1:1, three links 1:1:1.
- **Production does not stop while linked — growth does.** A linked tower keeps producing at its level's rate (L1/L2/L3 barracks = 1.0 / 1.43 / 2.0 units/s) and every new unit is drained on the same tick, so after the burst a stream delivers exactly the source's production plus whatever friendly streams pour into the source (streams chain through a linked tower). `tryAutoUpgrade` returns false for a linked tower: a linked L1 at 25 stays L1 until it is unlinked and its garrison reaches 25 again unlinked. At max level (L3, fortress L2) an unlinked garrison caps at capacity and production stops adding.
- **Auto-unlink** emits `unlinked { owner, from, to, reason }`, `reason ∈ { manual, sourceLost, roadCut, targetFull }`: `sourceLost` when the source changed owner (a capture removes the old owner's outgoing links inside the arrival, before the new owner can act); `roadCut` when the road is cut or gone (the `cutBridge` command removes links on that road at once, walking units on it die); `targetFull` when the target is the link owner's and `units ≥ capacity` (modified capacity for the player). A link into a neutral or hostile tower never ends by itself.
- **Link limit** is `LINKS_PER_LEVEL[level] = level` for every kind; a fortress (max L2) therefore runs at most 2 streams. The `link` command is ignored (no event) when the limit is reached, the road is cut/missing, the owner is wrong, or the identical link already exists.
- **Level 1 lesson** ("Tap your tower, then tap a target: the stream keeps flowing until you stop it") matches the code: a link into a neutral flows through the capture and keeps supplying the captured tower until the player unlinks it or the target fills (`targetFull`).

### Rules v2.1 (proposed 2026-09-15, sim implemented 2026-09-17) — "Under fire"

**Problem (headless evidence).** All-L3 endgames stalemate with every tower at 100 and nobody attacking; level 40 seed 1 times out at 180 s with the player at 8 towers vs 4 (`npm run playtest -- --level 40 --seeds 5` → 4/5). The arithmetic under v2 (measured headless, 240 px road): a capture needs damage **strictly greater** than the garrison; a linked source drains at 8.33/s while still producing, so a 100-unit L3 empties in 15.6 s and lands ≈ 130 units, during which the target regenerates ≈ 30 — it bottoms out at exactly 0 and is not flipped; from then on the trickle (the source's production) equals the target's production. Even a 99-unit L3 holds; an unanswered L1 25-stream only dents an L3 keep to 78. So one stream can never flip an equal tower, and the AI (which computes exactly this) correctly never attacks.

**Candidates evaluated.**
| Candidate | Readability on a phone | Tower War feel | AI can exploit it | Star clock | Verdict |
|---|---|---|---|---|---|
| Overflow decay: max-level tower at capacity loses 1 unit / 3 s above 90 % | Invisible: an L3 refills the lost unit in 0.5 s, the number flickers 100/99 | None | No capture threshold changes; making it bite needs production to stay paused, which only moves the stalemate from 100 to 90 | None | Rejected |
| Sudden death: after 4 min production stops everywhere, garrisons −1 / 2 s | Good (HUD countdown) | Weak — a timer, not a tactic | Yes, but only after 4 min: outside every star clock and the 180 s playtest budget; a human waits minutes doing nothing; a mirror match still ends 0 vs 0 | None | Rejected as main rule |
| Stream bonus: a stream running ≥ 10 s gets +1 unit per 3 arrivals | Breaks pillar 1: the number you sent is not the number that lands | None | Yes (keep streams running) | Small | Rejected |
| Enemy link limit = level (like the player) | n/a (AI only) | n/a | Lets an enemy split streams; does nothing for the 100-vs-100 arithmetic and nothing for the player's side | None | Folded into the AI acceptance criteria below |
| **Under fire**: a tower that is being hit does not recruit | The tower's number stops climbing and drops with every hit while a hostile ribbon points at it; no new UI | Strong: Tower War is "answer every incoming stream or lose the tower" | Yes: any sustained stream now wins in finite time, so the attack test becomes `burst + trickle × wait > garrison` | Levels resolve faster (re-measure) | **Chosen** |

**Rule.**
- New per-tower field `underFireUntilMs` (in `GameState`, included in continue/rewind snapshots). When a hostile unit **lands** on an owned tower (arrival with `unit.owner ≠ tower.owner`, whether or not it flips the tower), set `underFireUntilMs = time + UNDER_FIRE_MS`, **`UNDER_FIRE_MS = 1500`**.
- While `time < underFireUntilMs` the tower **generates nothing**: its `genAccMs` does not accumulate (the same mechanism as Freeze; Overdrive multiplies a paused rate, still 0). Everything else is unchanged: it drains its own links, accepts friendly reinforcements (each landing friendly unit is +1 and still counts toward the auto-upgrade), fires artillery, uses the fortress accumulator, can be linked/unlinked.
- A capture clears `underFireUntilMs` (the new owner starts fresh); the old owner's units still landing are hostile to the new owner and re-arm it.
- Not landings: units that die on the road (clash, mine, barrier, artillery, bridge cut). Artillery therefore counters a trickle it can kill. Neutral towers are unaffected (they never generate).
- Why 1500 ms: any barracks trickle keeps a tower under fire (landings ≤ 1.0 s apart at L1), while a tank factory alone (one landing / 4 s) or an L1 artillery post (2.0 s) does not.
- Resulting arithmetic: from the first landing the target regenerates nothing, so a stream flips a garrison `G` when its `G + 1`-th unit lands — units sent = source garrison + its production × time, one every 120 ms while the garrison lasts. 100 vs 100 (240 px road): the 101st unit leaves at 12.1 s and lands at ≈ 14 s (v2: never). An unanswered L1 25-stream (burst 25, then 1/s) kills an L3 keep at ≈ 78 s (v2: dents it to 78). A defender answers a hostile ribbon by (in this order) reinforcing from a neighbour (a supply stream out-delivers any trickle from a lower level), counter-streaming from **another** tower at the attacker's drained source (it is at 0 and under no fire), or counter-streaming from the sieged tower itself only when its garrison exceeds what is still coming (`linkPending` + weight on the road) — units meet on the road 1:1 and the remainder flips the empty source.
- Mirror-match caveat: two equal towers streaming at each other annihilate on the road and both sit at 0 for ever — under v2, v2.1 and every candidate above (the fixed point is symmetric). v2.1 makes the first mover win a mirror match when the other side does not counter-stream within the travel time. Shipped levels are never mirror matches (§3).
- Presentation (Tech Artist): while under fire the garrison number is drawn in the attacker's colour with a small crossed-swords pip; the production pip is hidden. Tutorial (Level Designer): level 2's lesson gains "a tower under fire cannot recruit — answer every red stream".
- AI (AI Engineer): `walkLandings` uses production 0 from the first hostile landing while landings are < `UNDER_FIRE_MS` apart (so `holdReserve`/`fallsAtMs` see the siege); personalities link when `spendable + genPerSecond(source) × SIEGE_PLAN_S ≥ costToTake + margin`, **`SIEGE_PLAN_S = 10`** (the trickle they are willing to wait for); the reference player's attack rule adds the same term; a sieged tower's response follows the order above (never counter-stream from the sieged tower without a surplus — that is the deadlock).

**Acceptance (before the marker above is removed).**
1. Sim test: L3 100 links into an enemy L3 100 over a 240 px road, no other towers, no AI: the target flips between 13 s and 16 s (v2: never, min garrison 0).
2. Sim test: enemy L1 25 links into a player L3 100 over a 240 px road (a) unanswered: the player tower falls between 70 s and 90 s (v2: never, min 78); (b) a player L3 100 neighbour links into it at t = 5 s: it is back at 100 by t = 25 s and that supply line ends with `targetFull`.
3. Sim test: a tank factory trickle alone (one tank / 4 s) leaves the target regenerating between landings (`underFireUntilMs` expires); snapshots restore the field.
4. AI test: rusher L3 at 100 across from a player L3 at 100 (no other towers) links within 2 s of both reaching 100 (v2: never).
5. `npm run playtest -- --seeds 5`: no level × seed ends with outcome `playing` at 180 s (every run is a win or a real loss); level 40 seed 1 wins ≤ 120 s; levels 1–8 stay 100 %; the idle player still never wins.
6. Star clocks: the Level Designer re-measures medians after the change (expect −10…30 % on levels 9+) and re-derives `star3`/`star2` per the level-authoring skill.

### 2.1 Map
- A level is a graph: **towers** (nodes) with `x,y` in a 720×1280 logical space, and **roads** (edges). Units only travel along roads. Roads are straight segments unless `waypoints` are given.
- Owners: `neutral`, `player`, `enemy1`, `enemy2`, `enemy3`. Colours: grey, blue, red, green, yellow.

### 2.2 Towers
| Field | Meaning |
|---|---|
| `kind` | `barracks` (default), `artillery`, `tankFactory`, `fortress` |
| `owner` | see above |
| `units` | integer garrison, ≥ 0 |
| `level` | 1..3 |

- Generation (owned, non-neutral): barracks L1/L2/L3 produce 1 unit every **1.0 / 0.7 / 0.5 s** up to capacity **30 / 50 / 80**. Neutral towers never generate.
- Upgrade: player taps an already-selected own tower (or the UI "▲" button). Cost **10** (L1→2), **20** (L2→3) units, paid from the garrison; refused if garrison < cost. Upgrading is instant.
- Capture keeps the tower's level.
- `fortress`: capacity ×1.5, and hostile weight is halved through a defence accumulator (**2 attackers remove 1 defender**; a 5-weight tank removes 2.5, the half carries over). Cannot be upgraded past L2.
- `artillery`: generates at half rate; every **0.8 s** kills 1 hostile unit within **140 px**. Capacity 40.
- `tankFactory`: produces a **tank** (weight 5, speed ×0.7) every 4 s instead of infantry; capacity counted in weight (max 40).

### 2.3 Sending units
- Interaction: tap own tower (select, highlight), tap a road-connected tower (target). Sends **all** garrisoned units (Tower War feel). A UI toggle can switch to 50 %. Tapping the same tower again upgrades it.
- Units leave the tower one every **0.12 s**, walk at **120 px/s** along the road. Each unit has `weight` (infantry 1, tank 5).
- Arrival at friendly tower: `units += weight` (capped at capacity; overflow lost).
- Arrival at hostile tower: `units -= weight` (fortress: `weight/2` via the accumulator). If damage exceeds the garrison (strictly greater) the tower flips: `owner = attacker`, `units = remaining weight` (fortress remainder = `weight − 2×defenders`). Equal damage leaves the tower at 0 under the old owner.
- Two units of different owners on the same road: when they cross, the lighter dies and the heavier loses that weight (equal weights: both die).
- Mine on a road (at its midpoint) kills the first `mine.charges` weight passing, then disappears; a unit heavier than the remaining charges survives and spends the mine.
- Barrier on a road (at its midpoint): `hp` must be reduced to 0 by units walking into it (each unit spends its weight and dies); a unit heavier than the remaining hp breaks through and continues with `weight − hp`.
- Bridge road: an owner of an endpoint tower may **cut** it (long-press road). Units in transit on it die. Cannot be rebuilt.

### 2.4 Win / lose
- Win: no tower is owned by any enemy and no enemy units are in transit.
- Lose: player owns no tower and has no units in transit.
- Stars: 3 if time ≤ `level.star3`, 2 if ≤ `level.star2`, else 1.

### 2.5 AI (rules v2 link model; `src/ai/`; every bot ticks every `AI_TICK_MS` = 0.5 s)
Everything below reads only what a human sees on screen: garrisons, levels, owners, ribbons (links) and units on roads. No bot issues `sendUnits` or `upgrade`. Enemies also fight each other.

**Shared gates (all enemies).**
- Aggression `a` (0..1, per enemy in the level JSON): each own tower's decision is skipped this tick with probability `(1 − a) × 0.5`; margins shrink with `a` (below). One decision per own tower per tick.
- Thresholds are in attacker weight, fortress-aware: `costToTake(n)` = effective defenders (fortress ×2) + barrier hp + mine charges on the road + hostile weight already walking that road toward the source. `spendable` = garrison − `threatReserve`, rounded down to whole units of the tower's kind (whole tanks). `threatReserve` = ⌈hostile weight heading for the tower ÷ defence multiplier⌉ + 2, 0 when nothing is coming.
- Rules v2.1 siege force (`siegeForce`, 2026-09-17): every attack test below compares `siegeForce` instead of `spendable`. `siegeForce` = `spendable` + `siegeCredit` **only when `spendable` ≥ the target's effective defenders** (a siege is opened by a wave that matches the garrison and finished by the trickle; a burst short of that counts alone), where `siegeCredit` = the source's production over **`SIEGE_PLAN_S` = 10 s** in whole units of its kind, minus what the target still recruits between landings that far apart (0 against any barracks trickle, whose landings are < `UNDER_FIRE_MS` apart; a lone tank factory's 4 s gaps leave the target 2.5 s of every 4). Measured over levels 1–40 × seeds 1–5: crediting the trickle to any tower with one unit to send (the plain reading of the v2.1 proposal) makes every freshly captured 1-unit tower stream onward at once, so a rusher becomes a chain of drained towers pouring 3/s at the front — 19 failed gates and tutorial levels 5 and 8 lost 4/5, against 11 with the wave gate.
- Stream maintenance, run before any new link: (i) a hostile column is heading for the source **and** its garrison is below its reserve (opportunists: at least `OPPORTUNIST_RESERVE` = 5) → unlink everything, link nothing this tick; (ii) a supply line into a tower the enemy captured ends once the target holds ≥ `SUPPLY_FULL_UNITS` = **5** (or its capacity, which the sim releases by itself) — a captured tower only needs to stand on its own, the source then regrows; (iii) never link a target already streamed to.
- Link caps: `ENEMY_MAX_LINKS` = **1** stream per tower for rusher and turtle whatever the level allows; `OPPORTUNIST_MAX_LINKS` = **2** (the second from L2 up). Slots = min(cap, `maxLinks(level)`) − active links after this tick's unlinks. Rationale: one thick ribbon per enemy tower is readable at a glance; the opportunist is the "spread" personality.

**Personalities.**
- `rusher`: links the weakest open target (lowest `costToTake`, neutral or rival) when `siegeForce ≥ costToTake + rusherMargin`, `rusherMargin = max(defenceMultiplier(target), 3 × (1 − a))` (= +3 at a = 0, +1 at a = 1): 9 v 10 waits, 10 v 10 links (the trickle finishes it; v2: 11 v 10), 19 v a fortress 10 waits, 20 links. Keeps the stream until the target is captured and full (rule ii) or the source is threatened below its reserve (rule i). An L3 at 100 across from a player L3 at 100 links on its first tick (v2.1 acceptance 4).
- `turtle`: links nothing until the tower is at its top level (L3; fortress L2) — under v2 that means an unlinked garrison grown to 100 (75); then links the weakest target when `siegeForce ≥ costToTake × (2 − a) + defenceMultiplier(target)` (×2 at a = 0, ×1 at a = 1): at a = 0.5 an L3 at 9 v 10 waits, 10 v 10 links. The only enemy that cuts a bridge: under a column that would take one of its finished keeps (or, v2.1, a stream that bleeds it and that it cannot counter), never under its own stream, never its last route to an opponent.
- `opportunist`: ranks open targets by raw units (ties: `costToTake`) regardless of owner; links the first when `siegeForce(garrison − reserve) ≥ costToTake + max(defenceMultiplier(target), 2 × (1 − a))`, reserve = max(5, `threatReserve`) (7 v 3 waits, 8 v 3 links); at L2+ it adds a second stream when half the burst with half the trickle (gated the same way) covers **both** targets (the drain is shared round-robin): 10 at L2 runs one stream at 3-unit targets, 12 runs two.
- Sieged-tower response (v2.1, every bot): a stream at a tower is answered by (1) supply from a neighbour when it out-delivers the trickle or absorbs the burst, (2) a counter-stream from **another** tower at the attacker's drained source, (3) a counter-stream from the sieged tower itself only with a surplus over what is still coming (its burst and the units on the road), or a parry (below). Personalities get (2) and (3) for free: a drained source at 0 is the weakest target on the map, and `spendable` already nets out what is coming; rule (i) (unlink under a column below the reserve) keeps them from the deadlock.

**Reference player** (`src/ai/referencePlayer.ts`; the bot `npm run playtest` uses — every level must be winnable by it, §3). Rules run in priority order each tick, each tower starts at most one stream per tick: **maintain → reinforce → counter → parry → capture → supply → attack → cutBridge** (v2.1 added counter and parry, 2026-09-17).
0. maintain — end streams that have done their job or turned bad: (a) an attack whose sources can no longer flip the target with what is on the road, what they hold and what they trickle within `MAX_STREAM_MS` = 20 s (a hopeless stream feeds the enemy's production) — a parry (rule 2b) is exempt while the enemy's ribbon is up; (b) a supply line into an own tower that is safe and holds ≥ `wantAt` — 0 when no enemy borders it and nothing is coming, otherwise its hold reserve clamped to [`SUPPLY_MIN` = 10, `SUPPLY_MAX` = 25 (a full L1: it upgrades there)] — unless it relays into an attacking tower or comes from a finished rear keep; (b′, v2.1) a supply line whose source is drained (≤ `DRAINED_UNITS` = **1**) into a tower a hostile stream still bleeds (`siegeNetRate` ≤ 0) — it only feeds a tower it cannot save; (c) a stream into a neutral once enough weight is walking to take it (metered capture); (d) any stream whose source has drained to the reserve it must hold (`HOLD_MARGIN` = 1 above the strongest column an enemy neighbour could throw, hostile columns already walking included) — a wave, not a leak; the source regrows unlinked.
1. reinforce — link friendly neighbours to a tower whose `holdReserve` exceeds its garrison, only helpers whose column lands before `fallsAtMs`, only when together they save it (an all-in is answered, not raced): their bursts and trickle cover the deficit within the horizon **and** (v2.1) either their bursts alone absorb what is coming (burst + units on the road) or their trickle turns the siege (`siegeNetRate` > 0 with them) — a trickle-only helper against a siege it cannot turn is a leak and never links; a helper's reserve is judged without the tower it saves; a tower that is itself streaming is never reinforced. Ended by rule 0 once it is safe.
2a. counter (v2.1) — stream at the source of a hostile stream into an own tower (a drained source at 0 is the weakest target there is, and its capture ends the stream). Towers other than the sieged one go first; the sieged tower joins only when its spare above every *other* threat beats what is still coming down that road (the source's burst counted as garrison, the units on the road as losses). Holding the capture is not required — killing the stream is the point. **Hose reserve (AI-3, 2026-09-18):** "every other threat" is the strict reserve (`reserveToHold`: the strongest column any enemy neighbour *could* throw, plus what is visibly coming) — except when the ribbon is a *hose*: its source is drained (holds ≤ `DRAINED_UNITS` whole units, so only its production and what chains through it come down the road) **and** the tower bleeds under it (`siegeNetRate` ≤ 0 with this tick's reinforcements). Such a tower falls for certain if it sits on its garrison, so a reserve against columns that might come is worth nothing to it: its spare for the counter is judged against `hoseReserve` = `holdReserve` without the besieger's road (only the landings visibly coming from its other roads, + `HOLD_MARGIN`), and rule 0d meters the counter against the same reserve while the hose is up. A source with a burst still pending is not a hose (a rusher re-aims it in one tick), and the strict reserve stays. The moment the hose ends — its source captured (`sourceLost`) or unlinked (the rusher's rule i drops a stream whose source a column heads for) — the strict reserve is back and rule 0d ends the stream once the tower is at it. The plan itself is unchanged: `needed` = the source's garrison as it grows over the travel time (its production is the hose) + its friendly supply + the units on the road, × `ATTACK_FACTOR` + `ATTACK_SLACK`, so the sieged tower still needs ≈ 2 × trickle × travel time + 1 to land the first unit. Measured (old level 37 seed 1, `home` 20 under a 2/s hose from a 1-unit `e` 2.85 s away with a 12-unit relay column booked through the falling `w`): v2.1 alone never answered and `home` bled to 0 at 22.6 s; with the hose reserve `home` counters at 11.0 s, the rusher drops the stream at 11.5 s, the level is won at 74 s (5/5 seeds). Old level 9 seeds 2/3 stay lost: the hose there is a 2/s chain (keep 0 → flank 0 → east) over a 4 s road against a player holding 7 units in total — ≈ 16 needed — and the loss is decided by the opening tie-break (east vs west), not by the answer.
2b. parry (v2.1) — last resort for a sieged tower (rule 1 did not reinforce it, rule 2a could not answer): stream back at the strongest hostile source whose trickle its own production matches, when its garrison plus production meets every hostile landing on the way (`parryHolds`). The two trickles annihilate on the road, nothing lands on either side, and the rest of the economy outgrows the enemy. Measured: without the parry 17 failed gates over levels 1–40 × seeds 1–5, with it 12 (level 3 is lost 3/5 without it).
3. capture — link a neighbouring neutral the garrison can flip and hold (contested neutrals need more). A tower below `OPENING_GROW_LEVEL` = **1** would let its garrison grow toward the auto-upgrade instead of taking a *contested* neutral; at the shipped value 1 no tower waits. Measured over levels 1–40 × seeds 1–4: value 1 wins 148/160, value 2 (grow to L2 first) 127/160, because enemy streams claim the neutrals meanwhile (re-measured under v2.1 over seeds 1–5: values 2 and 3 win no more levels). Free neutrals (no enemy borders them) are always taken.
4. supply — a finished rear keep (max level, ≥ `SUPPLY_FILL` = 60 % full, farther from the enemy than the target) streams to the emptiest friendly tower toward the front; chained streams relay through.
5. attack — the weakest adjacent enemy tower, with every free adjacent own tower up to its link limit plus rear relays chained into them, when what lands ≥ defenders × `ATTACK_FACTOR` **1.2** + `ATTACK_SLACK` **2** (fortress-aware; counts the target's growth before the first landing, the sources' production while the stream runs, and what holding the capture needs). v2.1: the plan runs the burst plus **`SIEGE_PLAN_MS` = 10 s** of trickle (within `MAX_STREAM_MS`) when the burst alone matches the target's defenders at landing and the trickle gains on the target (its friendly supply, what it still recruits between landings — nothing under a barracks trickle — and what it streams down our roads); the target recruits nothing from the first landing on. A source whose column would die on its own road (hostile units walking it outnumber it) is left out. Bridge-aware: a route over a bridge the far side could cut is planned as losing everything that lands later than `CUT_REACTION_MS` = 500 ms (one enemy AI tick) after the first unit steps on; a plan without exposed routes is preferred when it delivers `needed` within `SAFE_PLAN_SLOWDOWN` = 1.3× of the exposed plan's time; a running stream is never joined over an exposed route.
6. cutBridge — cut an owned bridge when the column/stream on it (or the garrison about to come over it) would take the tower and the reinforcements above cannot save it, or (v2.1) when a hostile stream over it bleeds the tower (`siegeNetRate` ≤ 0), the tower cannot counter it (its garrison does not outweigh the column on the bridge plus the far garrison) and it falls within the horizon or holds less than **`BLEED_PATIENCE_MS` = 10 s** of that trickle; provided no own units or streams use it and every enemy tower stays reachable.

**Threat model** (`src/ai/common.ts`, shared by enemies and the reference player; pure functions of the visible state).
| Field | Meaning | Numbers |
|---|---|---|
| `linkPending(link)` | weight the source still holds for that stream (its burst) | ⌊source garrison ÷ source's link count⌋ |
| `linkRate(link)` | units/s the stream delivers once its source is drained | source production (+ the source's own friendly supply streams, chained ≤ `CHAIN_DEPTH` = 4 hops) ÷ its link count |
| `inflowRate(tower, hostile)` | units/s all hostile (or all friendly) streams pour into the tower after their bursts | Σ `linkRate` |
| `landings(tower)` | every landing within `STREAM_HORIZON_MS` = **10 s**: units on roads at their remaining walk; each stream's pending burst from its travel time on, one unit per 120 ms × link count; then its trickle, one unit every 1000 ÷ `linkRate` ms | unsorted list of `{ etaMs, weight, hostile }` |
| `walkLandings(tower, start, list)` | replays the landings in time order from `start`, adding the tower's own production between landings (fortress: hostile weight ÷ 2), capped at capacity; v2.1: production 0 for the rest of the tower's current under-fire window and for `UNDER_FIRE_MS` after every hostile landing | → lowest garrison on the way, `fallsAtMs` = first landing that flips it (∞ if it holds) |
| `holdReserve(tower, margin = 1)` | units the tower must hold **now** to survive the horizon | max(0, ⌈−lowest garrison⌉) + margin; 0 when nothing hostile is coming |
| `fallsAtMs(tower)` | when the tower falls to what is visibly coming | from `walkLandings` with `start` = its garrison |
| `threatFrom(self, neighbour)` | the column a hostile neighbour could throw right now: its projected garrison (what it still holds for its own streams included — a link is re-aimed in one tick) + its reinforcements − hostile weight inbound to it, minus the road's barrier/mine; or a rival column about to flip it and carry on; v2.1: a **neutral** neighbour relays what a hostile tower behind it could throw through it (that column − what flipping the neutral costs) × **`TWO_HOP_DISCOUNT` = 0.5**, and an **own** neighbour that falls within the horizon relays the surplus of the attack that takes it | `{ from, attackers, etaMs }`, undefined when nothing could come |
| `incomingThreat(tower)` | hostile weight heading for the tower: on the roads plus every hostile stream's `linkPending` | used by `threatReserve` |
| `producedIn(tower, ms)` / `projectedUnits` | v2.1: what the tower recruits within `ms` — its rate over the part of the window not under fire | fractional / capped whole units |
| `siegeRegenPerSecond(tower, gapMs)` | v2.1: production that survives a stream landing one unit every `gapMs`: 0 when `gapMs` ≤ `UNDER_FIRE_MS`, else rate × (gap − 1500) ÷ gap | units/s |
| `siegeCredit(source, target, planMs)` | v2.1: whole units the source lands over `planMs` of trickle minus what the target recruits between those landings | weight |
| `siegeNetRate(tower, extraFriendly)` | v2.1 steady state once every burst has landed: friendly trickle + what the tower still recruits between hostile landings − hostile trickle (fortress ÷ 2) | units/s; ≤ 0 = the tower bleeds, supply only delays it |

Bots are pure functions of the visible state; "how long a source has been at 0" is therefore read as "the source is drained (≤ `DRAINED_UNITS`) and the target still bleeds", not remembered.

### 2.6 Boosters (meta, spent coins)
- **Overdrive**: ×3 production for 10 s (cost 30 coins).
- **Freeze**: every owner except the caster stops generating for 5 s (40 coins).
- **Airstrike**: remove 10 units from one enemy tower (50 coins).
Coins: 10 per star earned, first-clear only.

## 3. Level design
- Levels are JSON in `tower-clash/src/levels/`. Schema in `tower-clash/src/sim/types.ts` (`LevelDef`).
- Progression bands: 1–8 one enemy, barracks only; 9–16 fortress + artillery; 17–24 two enemies + mines/barriers; 25–32 tank factory + bridges; 33–40 three enemies, everything. Target 40 levels for v1.0.
- Every level must be winnable by the scripted "reference player" (see `playtest` skill) in under 3 min and must not be winnable by doing nothing.
- No level is a mirror match: the player must be able to reach a production edge before any enemy can (a neutral closer to the player than to every enemy, or more starting towers/units). Two equal towers streaming at each other annihilate on the road and never resolve (§2.0 v2.1 caveat).

## 4. Presentation
- Flat vector look: rounded towers with crown pips for level, unit dots with owner colour, roads as light grey lines, water/void as dark blue. Font: system sans, bold numerals.
- Juice: capture flash, unit death puff, upgrade pulse, screen-shake on capture (subtle). Sound synthesised with WebAudio (no assets).
- Screens: Title → Level select (grid with stars) → Play (HUD: level, timer, pause, booster bar) → Result (stars, coins, next/retry).
- Save: `localStorage` key `towerclash.save.v2` (v1 migrated on first load) — stars per level, coins, settings.

## 5. Technical
- `sim/` is pure, deterministic, frame-rate independent (fixed 50 ms step, seeded RNG), no DOM. `render/` draws state, `input/` maps pointer events to sim commands, `ai/` produces commands. Tests: Vitest for sim/ai, Playwright (Chromium preinstalled) for smoke + screenshots.
- Performance budget: 60 fps with 400 units in transit on a mid-range phone.

## 6. Out of scope for v1.0
Multiplayer, ads, real-money purchases, 3D, account systems.
