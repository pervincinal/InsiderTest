# Audit 2026-10-29: enemy AI, campaign pacing 1–50, first human playtest protocol

AI Engineer · branch `claude/tower-war-game-plan-weqwpb`, working tree as of 2026-10-29 (no game file changed) · skills: `game-ai` (+ `references/behavior-trees.md`, `pathfinding.md`), `level-design` (+ `references/pacing-and-flow.md`), `gstack-playtest` (+ all four references).

**Evidence and how to reproduce.** `npm run playtest -- --seeds 20` (reference player: 1000/1000 wins, every win < 180 s, idle never wins, 0 failed gates; 3★ in 71 of 1000 runs). `npm run playtest -- --naive --seeds 20 --tie both` (the no-decision first-time line, 4 s reactions: 954/1000 asc, 930/1000 desc). `npm run check`: 127 test files / 1725 tests pass, `levels:check` 50 valid, 2 warnings (32 and 48: the neutral `crown` has 3 lanes). Scratch tools, all read-only users of `src/` (in `/tmp/claude-0/-home-user-InsiderTest/27ff3ffe-c8bd-51f2-b6a9-550752bc37bb/scratchpad/audit-ai/`): `audit.mts` traces every enemy `link` that takes effect, classified by the target's owner at that moment (player / neutral / another enemy / own), enemy stream-seconds, enemy landings, lane standoffs, captures, for four player models × 50 levels × seeds 1–10 (`ref`, `naive`, `idle`, `late20/30/45` = the reference player starting at 20 / 30 / 45 s); `cf.mts` (naive line until T, then the reference player); `churn.mts` (ribbon lifetimes, opportunist snipes, pile-ons); `steal.mts` (captures fed by a rival's stream, re-flips within 5 s); `elim.mts` (who eliminates each enemy, when); `onetap.mts` (one round of taps at 3 s, never again).
**Caveats.** The naive line is a *lower* bound on a human (never stops a stream, never re-aims); the reference player is a strong but not optimal oracle (its rescue counts in (d) are not monotonic in T). Traces use 10 seeds per level and model; the playtest columns use 20. "P" = the player.

---

## 1. Pacing 1–50

`3★` = `star3` (s). `ref` = reference player median / worst win (20 seeds). `naive W` = naive-line wins /20, asc (desc tie). `≥2★` = naive wins at ≤ `star2`. `÷ref` = naive median ÷ ref median (what a first-timer pays). `new` = piece first met here (— = combination level). Enemies: personality initial + aggression. `P:E u` = starting units, player : enemies. The last three columns are enemy pressure on a first-timer (naive line, 10 seeds): median time of the first enemy ribbon onto a player tower, the player's share of all hostile enemy ribbons opened in 0–30 s, and when an **idle** player is eliminated (median, 10 seeds; "never" = alive at 180 s).

| L | 3★ | ref med / worst | naive W (desc) | ≥2★ | naive med | ÷ref | new | enemies | P:E u | 1st enemy link on P | P share 0–30 s | idle lost by |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 30 | 9.1 / 9.1 | 20 (20) | 20 | 21.6 | 2.4 | tap a line | t0.2 | 12:3 | never | – | never |
| 2 | 20 | 24.4 / 30.9 | 20 (20) | 20 | 68.0 | 2.8 | blocked line, swipe-stop, supply | r0.2 | 12:5 | never | 0 % | never |
| 3 | 25 | 29.7 / 31.2 | 20 (0) | 19 | 55.5 | 1.9 | free neutrals | r0.3 | 12:12 | 14 (1/10) | 43 % | 37 |
| 4 | 25 | 32.1 / 32.1 | 20 (20) | 20 | 108.3 | 3.4 | stop to grow (L2 at 25) | t0.3 | 15:3 | 24 | 100 % | never |
| 5 | 30 | 37.4 / 47.6 | 20 (20) | 16 | 71.3 | 1.9 | walls | r0.2 | 12:4 | 34 (9/10) | 0 % | never |
| 6 | 25 | 29.8 / 29.8 | 20 (20) | 19 | 92.1 | 3.1 | 2-tower enemy, walled keep | t0.3 | 20:9 | 33 | 0 % | never |
| 7 | 25 | 28.1 / 42.4 | 20 (20) | 15 | 63.9 | 2.3 | distance, rocks | r0.1 | 20:2 | 40 (1/10) | 0 % | 84 |
| 8 | 45 | 52.1 / 62.3 | 20 (20) | 19 | 72.5 | 1.4 | 2 start towers, L2 neutral | r0.2 | 32:16 | 24 | 55 % | 120 |
| 9 | 25 | 30.7 / 32.0 | 20 (20) | 13 | 57.8 | 1.9 | enemy fortress, L2 home | r0.3 | 30:10 | 26 | 38 % | 74 |
| 10 | 20 | 25.5 / 46.0 | 20 (20) | 12 | 63.2 | 2.5 | neutral / own fortress | r0.3 | 30:7 | 30 | 11 % | 74 |
| 11 | 30 | 36.1 / 42.3 | 20 (20) | 13 | 57.5 | 1.6 | first enemy that defends | o0.4 | 30:16 | 22 | 57 % | 51 |
| 12 | 20 | 29.1 / 31.9 | 20 (20) | 20 | 58.6 | 2.0 | artillery | r0.4 | 30:6 | 18 | 35 % | 78 |
| 13 | 35 | 47.9 / 63.0 | 20 (20) | 9 | 84.7 | 1.8 | own artillery, turtle | t0.3 | 30:7 | 28 | 21 % | never |
| 14 | 25 | 36.2 / 42.5 | 20 (20) | 18 | 100.5 | 2.8 | guns + fortress | o0.6 | 30:12 | 13 | 53 % | 48 |
| 15 | 35 | 43.7 / 50.7 | 20 (20) | 18 | 70.2 | 1.6 | own fortress start | r0.7 | 38:12 | 12 | 65 % | 62 |
| 16 | 20 | 30.5 / 37.0 | 20 (20) | 15 | 63.6 | 2.1 | — | r0.5 | 38:15 | 13 | 36 % | 58 |
| 17 | 25 | 28.4 / 32.4 | 20 (20) | 2 | 54.4 | 1.9 | 2nd enemy, mines | r0.4 o0.4 | 30:16 | 20 | 18 % | 74 |
| 18 | 30 | 37.1 / 44.5 | 20 (20) | 0 | 66.8 | 1.8 | — | r0.45 t0.45 | 30:10 | 22 | 35 % | 101 |
| 19 | 25 | 33.0 / 42.7 | 20 (20) | 8 | 51.2 | 1.6 | — | o0.5 r0.5 | 30:22 | 20 | 17 % | 75 |
| 20 | 25 | 34.1 / 41.7 | 20 (20) | 13 | 49.3 | 1.4 | — | r0.45 o0.45 | 30:16 | 35 (8/10) | 12 % | 80 |
| 21 | 25 | 29.3 / 42.0 | 20 (20) | 0 | 61.3 | 2.1 | — | t0.6 r0.6 | 30:24 | 36 | 6 % | 79 |
| 22 | 35 | 46.5 / 51.3 | 20 (20) | 18 | 63.4 | 1.4 | — | r0.7 o0.7 | 30:16 | 29 | 2 % | 85 |
| 23 | 30 | 39.0 / 43.6 | **7 (8)** | 1 | 86.8 | 2.2 | — | r0.75 t0.75 | 30:30 | **8** | 19 % | 84 |
| 24 | 30 | 40.8 / 49.0 | 20 (20) | 2 | 66.7 | 1.6 | — | o0.8 r0.8 | 30:16 | 27 | 9 % | 93 |
| 25 | 20 | 27.9 / 33.0 | 20 (20) | 0 | 48.1 | 1.7 | tank factory | r0.4 t0.4 | 40:24 | 18 | 12 % | 97 |
| 26 | 25 | 27.6 / 32.5 | 20 (20) | 12 | 49.1 | 1.8 | L1 home + L2 factory | o0.45 r0.45 | 38:24 | 20 | 36 % | 91 |
| 27 | 40 | 49.0 / 60.3 | **6 (5)** | 2 | 91.0 | 1.9 | enemy factory | r0.5 o0.5 | 28:30 | 22 | 23 % | 85 |
| 28 | 35 | 44.9 / 60.9 | 20 (20) | 2 | 76.0 | 1.7 | rivers, fords | r0.55 t0.55 | 30:22 | 29 | 22 % | 130 (9/10) |
| 29 | 25 | 31.1 / 42.8 | 20 (20) | 0 | 62.9 | 2.0 | — | o0.6 r0.6 | 30:20 | 25 | 35 % | 84 |
| 30 | 40 | 48.5 / 62.8 | 20 (20) | 13 | 71.1 | 1.5 | — | r0.7 o0.7 | 35:40 | 12 | 22 % | 128 |
| 31 | 30 | 40.0 / 54.3 | 20 (20) | 10 | 60.0 | 1.5 | — | o0.75 r0.75 | 40:46 | 16 | 11 % | 90 |
| 32 | 40 | 48.9 / 65.7 | **4 (1)** | 0 | 132.8 | 2.7 | — (band finale) | r0.8 o0.8 | 26:32 | **4** | 26 % | 104 |
| 33 | 35 | 36.3 / 52.2 | 20 (20) | 19 | 62.7 | 1.7 | 3rd enemy | r0.4 t0.4 o0.4 | 30:14 | 31 | 4 % | 76 |
| 34 | 30 | 41.4 / 59.8 | 20 (20) | 0 | 76.7 | 1.9 | — | r0.45 r0.45 t0.45 | 30:18 | 33 | 3 % | 100 |
| 35 | 25 | 31.7 / 36.8 | 20 (20) | 1 | 63.4 | 2.0 | — | o0.5 r0.5 r0.5 | 30:30 | 26 | 5 % | 85 |
| 36 | 45 | 57.0 / 65.7 | 20 (20) | 20 | 77.1 | 1.4 | — | r0.6 o0.6 t0.6 | 30:20 | 28 | 13 % | 108 |
| 37 | 55 | 66.0 / 84.5 | 20 (20) | 20 | 64.3 | 1.0 | — | r0.65 r0.65 o0.65 | 34:52 | 26 | 3 % | 112 (9/10) |
| 38 | 25 | 32.6 / 47.8 | 20 (20) | 0 | 73.9 | 2.3 | — | r0.7 o0.7 r0.7 | 30:26 | 44 | 0 % | 127 (9/10) |
| 39 | 75 | 87.7 / 102.8 | 20 (20) | 20 | 121.0 | 1.4 | — | t0.75 t0.75 r0.75 | 30:18 | 28 | 30 % | 153 (8/10) |
| 40 | 50 | 63.5 / 70.3 | 20 (20) | 20 | 74.6 | 1.2 | — (band finale) | r0.8 o0.8 t0.8 | 40:40 | 12 | 15 % | 115 |
| 41 | 70 | 77.3 / 91.8 | 17 (16) | 12 | 131.8 | 1.7 | lone L1 home | r0.6 o0.6 | 18:32 | 29 | 5 % | 79 |
| 42 | 60 | 67.0 / 76.3 | 20 (20) | 20 | 95.8 | 1.4 | — | r0.65 r0.65 t0.65 | 30:52 | 20 | 11 % | 142 (8/10) |
| 43 | 30 | 33.0 / 59.2 | 20 (20) | 0 | 67.2 | 2.0 | — | r0.7 o0.7 o0.7 | 40:45 | 27 | 5 % | 114 |
| 44 | 25 | 30.6 / 32.1 | 20 (20) | 0 | 72.5 | 2.4 | — | r0.7 t0.7 o0.7 | 38:38 | 20 | 17 % | 92 |
| 45 | 40 | 48.2 / 59.1 | 20 (20) | 17 | 71.3 | 1.5 | — | r0.75 o0.75 o0.75 | 30:20 | 24 | 5 % | 136 |
| 46 | 45 | 55.8 / 66.7 | 20 (20) | 20 | 76.8 | 1.4 | — | r0.75 o0.75 t0.75 | 30:20 | 36 | 1 % | 108 |
| 47 | 40 | 44.1 / 87.3 | 20 (20) | 20 | 73.7 | 1.7 | own gun post start | r0.8 o0.8 t0.8 | 36:32 | 28 | 7 % | 119 (9/10) |
| 48 | 45 | 54.5 / 64.2 | 20 (20) | 20 | 62.9 | 1.2 | L3 start | r0.8 o0.8 r0.8 | 50:90 | 20 | 10 % | 76 |
| 49 | 25 | 33.1 / 41.1 | 20 (20) | 0 | 70.9 | 2.1 | fortress home | r0.85 r0.85 o0.85 | 46:44 | 24 | 5 % | 101 |
| 50 | 40 | 49.6 / 88.6 | 20 (20) | 19 | 77.1 | 1.6 | — (finale) | r0.9 o0.9 t0.9 | 40:56 | 12 | 8 % | 138 |

**By band** (same sources):

| Band | ref median (mean) | naive wins | naive ≥2★ | naive ÷ ref | P share of enemy ribbons 0–30 s | idle player lost by (median) | enemy-vs-enemy standoff lane-s per match (median) |
|---|---|---|---|---|---|---|---|
| 1–8 | 30.3 s | 160/160 | 148/160 (93 %) | 2.4 | 28 % | 84 s; never on 5 of 8 levels | 0 |
| 9–16 | 35.0 s | 160/160 | 118/160 (74 %) | 2.0 | **40 %** | **62 s** | 0 |
| 17–24 | 36.0 s | 147/160 | 44/160 (28 %) | 1.75 | 15 % | 82 s | 14.0 |
| 25–32 | 39.7 s | **130/160** | 39/160 (24 %) | 1.85 | 23 % | 98 s | 7.0 |
| 33–40 | 52.0 s | 160/160 | 100/160 (62 %) | 1.6 | 9 % | 106 s | 15.8 |
| 41–50 | 49.3 s | 197/200 | 128/200 (64 %) | 1.7 | **7 %** | **106 s** | 16.7 |

**Reading the tension / rest curve (`level-design`: "overall rise with local dips … rest before climax … introduce → develop → twist → test").**
1. **The measured tension curve peaks at the end of band 3–4 (23, 27, 32) and never comes back.** The only levels where a no-decision first-timer loses are 23 (7/20), 27 (6/20), 32 (4/20) and, softly, 41 (17/20). Bands 33–40 and 42–50 — the "everything mixed" band and the "final exam" — are 357/360 for the naive line. The sawtooth exists in the *authored* aggression (each band restarts at 0.4 and climbs), but not in what the player meets: the climax of the campaign is level 32, eighteen levels before the finale.
2. **Enemy pressure falls as the enemy count and aggression rise.** An idle player dies at 62 s in band 2 and at 106 s in bands 5–6; the player's share of enemy ribbons in the first 30 s falls 40 % → 7 %. The reason is in §3: from the second enemy on, 65–99 % of the enemies' first-30-s ribbons go to greys and to each other (to each other alone up to 73 % on 37 and 71 % on 43). The intended "kings bleed each other" lesson (cards of 33, 37, 40, 49) is in fact the default dynamic of every multi-enemy level.
3. **Rest before climax: absent at both ends.** Band 5 has no breather by design (0.6 → 0.9), but 49 → 50 measure as rests (naive 20/20; an idle player lasts 101 / 138 s). The real spike (32) follows 30 and 31, both 20/20 — a rest — so band 4's end is the one well-shaped beat in the campaign.
4. **Teach vs test.** Teaching cadence is good and clean on 1–17: one new piece per level, introduced where a mistake is cheap (enemies < 0.35 never defend on 1–10; idle survives on 1, 2, 4, 5, 6). The "test" after each teach is weak: 9–16 (fortress, artillery) are 160/160 for the naive line; tanks (25) 20/20 at 1.7×; rivers (28) 20/20. The 2★ ladder, not the win, is where the tests bite (band 3–4: 24–28 % of naive wins reach 2★ — GD-12's star-2 floor proposal is the open answer).
5. **Gating and critical path.** Linear, ≥ 1★ opens the next level, level skip after defeats; no soft-lock is possible, and the reference player proves every level from t = 0. The gate rarely binds: the naive line wins 954/1000, and its median win is within `star2` on 31 of 50 levels. **Every level is also winnable by doing nothing for 20 s first** (reference player from 20 s: 479/500, 10/10 on 45 levels; 0/10 on level 4 is a bot bug, AUD-A9).
6. **Length.** The reference player stays under the 60 s pillar on 45 levels (over: 37, 39, 40, 41, 42); the naive line is over 60 s on 39 levels. 3★ is set at 0.9 × the bot's median, so the bot itself earns 3★ in 71/1000 runs and 0/20 on 31 levels — 3★ asks a human to beat the bot by 10 % (AUD-A13).

---

## 2. Findings

| ID | Sev | What is wrong | Evidence | Proposed fix (one sentence) | Owner |
|---|---|---|---|---|---|
| AUD-A1 | **P1** | Level 33 *Three Kings* introduces the third enemy, and the third enemy is dead before the player can meet it. | `yellow` (enemy3, opportunist 0.4, 6 u) sits 233 px from both `red` and `green`; it loses its last tower to `red` at **9–10 s in 9/10 seeds** under the naive line and under the reference player (the 10th at 22–30 s); the naive first ribbon reaches a player tower at 31 s. The card ("three enemies fight each other where they touch") is true for 9 s. `src/levels/033-three-kings.json`; `elim.mts`. | Give `yellow` a garrison / position that survives both neighbours for ≥ 30 s (e.g. 14 u, or pull it back so `red`–`yellow` and `green`–`yellow` are > 450 px), then re-clock 33 and re-run its twist and weekly gates. | level-designer |
| AUD-A2 | **P1** | No human has played the campaign under a protocol; every pacing, star and AI judgement (here, GD-5…GD-12) rests on bots. | The stakeholder has not completed `docs/publishing/TESTFLIGHT_TEST_PLAN.md`, which is a device/feature checklist (TF-01…TF-29) with no pacing, difficulty or enemy-readability measure; `SaveData` keeps only stars, consecutive defeats and a results counter (`src/ui/save.ts`), no telemetry. | Run the protocol of §4 on build 25 with the stakeholder plus two fresh testers before the 1.0 submission, and gate AUD-A3/A4/A8/A13 on its result. | producer, qa-engineer |
| AUD-A3 | P2 (P1 if §4 H2 confirms) | Enemies do not fight the player; they fight each other and the greys. Target choice has no notion of "the opponent". | Share of hostile enemy ribbons aimed at the player in 0–30 s (naive line): 0–8 % on 21, 22, 24, 33, 34, 35, 37, 38, 41, 43, 45, 46, 47, 49, 50; band average 40 % (9–16) → 7 % (41–50); idle player survives 62 s (band 2) → 106 s (bands 5–6). Against the *reference* player the share on 41–50 is 19–50 % — enemies mostly answer an attacker (`defend` → counter) rather than open one. Code: `tactics.ts attack()` scores every hostile tower by `fallsAtMs` (`score` default), neutrals and wounded rivals always fall sooner than an L2 home at 30 u; `personalities.ts` never refers to the player. | Add a visible-information "front" term to the attack score (rusher strongest, turtle weakest): prefer the owner with the most towers / production, or the player's towers at equal fall time within `FRONT_BIAS_MS`, measured so that 17–50 keep ≥ 95 % for the reference player, then re-clock. | ai-engineer, level-designer |
| AUD-A4 | P2 | Enemies feed each other's captures and ping-pong towers. For an owned target the threat model counts *every* hostile stream as help, whoever owns it; the parity race (`contestOf`) and maintain rule (c) exist only for neutrals. | Enemy captures made on a tower another enemy was also streaming into: 79 % on 42, 75 % on 26, 72 % on 35, 69 % on 39, 68 % on 49, 67 % on 17; captures re-flipped within 5 s: 69 % (26), 66 % (17), 60 % (35), 56 % (39), 53 % (42, 49). `common.ts siegeOf` (`hostileRate += f.rate` for any `f.hostile`), `tactics.ts attack()` (contest check only `if (target.owner === 'neutral')`), `maintain` (c). `steal.mts`. | Generalise the parity race to owned targets: a plan counts only its own owner's streams toward the flip (rivals' streams lower the garrison but `contestOf` must give *us* the flip), and maintain (c) ends a stream into any tower whose race is lost. | ai-engineer |
| AUD-A5 | P2 | Ribbon churn: enemy intent is unreadable because ribbons appear and vanish within seconds. `MIN_ATTACK_MS` (5 s commitment) guards only the hopeless rule. | Enemy ribbons per minute on 41–50: 24–47; ribbons ended by the enemy within 5 s: 21.7/min (42), 21.4 (50), 19.9 (31), 17.0 (49), 15.7 (48); median enemy ribbon life ≤ 6 s on 24 of the 34 levels from 17 on (0.25 s on 26). `tactics.ts maintain` (rules c, d, retreat and the upgrade break bypass `MIN_ATTACK_MS`), `reclaimForAttack`. `churn.mts`. | Hold every non-defensive enemy unlink to `MIN_ATTACK_MS` and add a per-tower 2 s re-link cooldown for the enemies (not the reference player), measured against the twist gates. | ai-engineer |
| AUD-A6 | P2 | The opportunist is the campaign's designated victim: its −60 s score bonus for targets "under fire by someone else" sends its towers into contested fights, and the rivals finish it. | Opportunist eliminated by a rival (naive line, 10 seeds): 33 10/10 at 9 s, 37 10/10 at 22 s, 43 10/10 at 22 s, 44 9/10 at 27 s, 49 7/10 at 21 s. It also snipes the player's captures: 26/242 opportunist ribbons on 48, 22/325 on 32, 17/178 on 43 go into a neutral the player is streaming into. `personalities.ts opportunistCommands` (`HOPELESS_MS` reused as the bonus), `underFireByOther`. | Replace the flat 60 s bonus with a bounded one (≈ 10 s) that applies only when the opportunist wins the flip (AUD-A4 parity), and keep its home tower out of attacks while it is under siege. | ai-engineer |
| AUD-A7 | P2 | The band finales and the long levels reward doing nothing: waiting while the kings fight costs almost no time. | Reference player starting at 30 s vs at 0 s: +2.6 s on 37, +5.3 on 50, +10.4 on 40, +13.4 on 42, +15.0 on 39 (on 1–16: +25 … +92 s); starting at 20 s on 37 is **2.3 s faster** than playing from 0. 40's card asks for it ("once the three kings have exhausted each other"); 50's ("choose the one fight you can win") does not. `tr-late*.jsonl`. | Decide per level whether "wait" is the lesson (40, 37) or an exploit (50, 42, 39); where it is an exploit, AUD-A3's front term or a closer enemy keeps the player's first 30 s contested. | game-designer, level-designer |
| AUD-A8 | P2 | Inverted difficulty: the final band is the easiest band for a player who makes no decisions. | Naive line: 41–50 197/200 and 33–40 160/160 vs 25–32 130/160; the last level a no-decision player can lose (other than 41's 3/20) is 32; 49 and 50 are 20/20 with idle survival 101 / 138 s. Pacing table above. | Give 45–50 one "exam" level each whose naive line loses ≥ 30 % (contested first tap, or a king that attacks the home from t = 0), and keep a breather at 48 before 49–50. | level-designer, game-designer |
| AUD-A9 | P2 | The reference player deadlocks against an enemy that never shields: it plans against shields (`anticipate`) that an enemy below `DEFENCE_MIN_AGGRESSION` never raises, so a full map freezes. | Level 4 with the bot starting at 20 s: 10/10 seeds end at 180 s with all four towers at L3/100 and no ribbon from 120 s; `siegePlan` on `foe` falls in 29.8 s without anticipation, never with it; two plain streams from 120 s win at 150 s. Starting at 45 s the same freeze (all 10 seeds `playing` at 180 s) hits 1, 2, 4, 5, 6, 8 and 13 — exactly the levels whose enemy is below 0.35 (3, 11, 14 at 45 s are real losses). The `playtest` gate only starts at t = 0, so "winnable" is proven for a prompt player only. `tactics.ts anticipatedShield`, `referencePlayer.ts attack(... anticipate: true)`. | Anticipate a shield only from an owner that has been seen streaming back on a lane this match (visible history), else fall back to the plain plan when every own tower is idle and capped. | ai-engineer |
| AUD-A10 | P2 | Personalities are invisible, yet five cards name them. | No UI shows a personality (`grep` over `src/ui`, `src/render`: only a comment in `tutorialSteps.ts`); cards of 4 ("the enemy turtles"), 21 ("the rusher behind them"), 23 ("Kill the rusher first"), 34 ("Two rushers"), 39 ("against turtles") never say which colour is which. `src/levels/*.json` `lesson`. | Show a small intent glyph on each enemy's starting tower for the first 5 s (rusher arrow, turtle shield, opportunist eye) and name the colour in the five cards. | frontend-engineer, game-designer |
| AUD-A11 | P2 | Matches can last forever: there is no match clock in the game, and both player–enemy and enemy–enemy shield standoffs freeze. | Naive line on 32: 4/10 seeds still "playing" at 180 s (player–enemy standoff 73–264 lane-s, 25–81 s without any capture); idle player alive at 180 s while enemies hold enemy–enemy shields: 28, 37, 38, 47 (1/10), 39, 42 (2/10), enemy–enemy standoff 133–358 lane-s; `levels:check` warns that 32's and 48's `crown` has 3 lanes. `src/ui/play.ts` has only the `StalemateWatch` hint (8 s, once per link). | After 45 s without any capture on the map, escalate the stalemate hint to a "Restart / keep playing" card, and let enemy shields that have cancelled for 20 s drop (`maintain`). | game-designer, frontend-engineer, ai-engineer |
| AUD-A12 | P2 | No regression test pins enemy *engagement*; every degenerate pattern above passed 1725 green tests. | `tests/ai/personalities.test.ts` covers each personality's decision rule on hand-built states (good), none covers a shipped level's dynamics. | Add `tests/ai/engagement.test.ts`: per level, naive line, K = 5 — every enemy links a player tower before it dies or by 60 s (explicit exempt list), no enemy loses its last tower to a rival before 15 s, re-flips ≤ 5 s under 30 %. | ai-engineer, qa-engineer |
| AUD-A13 | P3 | 3★ sits above the reference bot's pace. | Bot 3★ in 71/1000 runs; 0/20 on 31 levels (`star3` = 0.9 × bot median, `scripts/reclock.ts`). A human 3★ rate is unknown. | Measure the human 3★ share (§4, H3) before any re-clock; if < 5 % of first clears, set `star3` at the bot median. | level-designer |
| AUD-A14 | P3 | On 23 a quarter of first-timer matches are lost by the 10th second. | Naive losses 13/20; with the reference player taking over at 5 s 13/13 are saved, at 10 s only 8/13 (5 of 20 seeds = 25 % lost by 10 s); first enemy ribbon onto the player at 8 s. GD-2 (GDD §3 item 9) accepted 23 as a learning level. `cf.mts`. | Keep as accepted; if §4 shows a human restarting 23 three or more times, move `w` / `e` out of the rushers' first-tap reach. | level-designer |
| AUD-A15 | P3 | Tutorial and band-2 enemies exert no loss pressure on a passive player. | Idle player alive at 180 s on 1, 2, 4, 5, 6 and **13** (band 2, turtle 0.3, never links the idle home); on 1 and 2 the enemy never opens a ribbon on the player at all. | Accept for 1–8 (design: < 0.35 never defends); on 13 raise the turtle to 0.35 or start it nearer the home so that waiting loses by 120 s. | level-designer |

---

## 3. AI readability, exploits and the degenerate-AI checks

**Architecture against `game-ai`.** The enemies are a flat priority list (`maintain → defend → attack → stack → supply`) run every 0.5 s with no memory between ticks: in `game-ai` terms a priority selector that re-evaluates from the root each tick with no RUNNING state. That is why it is reactive and deterministic (good), and also why it churns: nothing holds an intent across ticks except the 5 s `MIN_ATTACK_MS` on one rule ("behaviour tree leaves that never return RUNNING … restart the action every tick"). The three personalities are parameter sets on one utility score (`fallsAtMs`), not distinct behaviours. In `game-ai`'s terms that is utility AI with one consideration, and a player cannot tell them apart.

**Readability (what a player sees).**
- R1. Who is who: personalities have no on-screen tell; cards name "the rusher" without a colour (AUD-A10).
- R2. Flicker: 15–22 enemy ribbons per minute live under 5 s on 31, 42, 48, 49 and 50 (AUD-A5); towers re-flip within 5 s in 53–69 % of captures on 17, 26, 35, 39, 42 and 49 (AUD-A4). The map changes colour faster than intent can be read.
- R3. Reactive, not aggressive: against the passive naive line, 1–8 % of enemy ribbons in 41–50's first 30 s target the player, but 19–50 % do against the attacking reference player. "Rusher" reads as "retaliator" (AUD-A3).
- R4. Disappearing kings: in 10 seeds a king is eliminated by a rival in ≥ 5 of 10 runs on 27 enemy slots across 17–50: 33's third king at 9 s, 37's and 43's opportunist at 22 s, 39's rusher at 43.5 s, 50's rusher at 41.5 s (8/10) (AUD-A1, A6).
- R5. Fair: no bot reads hidden state. The threat model uses only garrisons, levels, ribbons, units on lanes and boosters, and the 2026-09-22 sim check holds it within 20 %.

**Exploits (each measured).**
- X1. *Wait and let them fight*: on 37, 39, 40, 42 and 50, playing from 30 s costs only 2.6–15 s (AUD-A7).
- X2. *Passive survival*: from band 5 on, an idle player survives 106 s median, and on 1, 2, 4, 5, 6 and 13 it is never eliminated (AUD-A3, A15).
- X3. *Bait the vulture*: a stream into a neutral marks it "under fire by someone else" for the opportunist (score −60 s). The player can steer it into its own guns or a rival (AUD-A6).
- X4. *Snipe the garrison of 1*: a rival's flip leaves 1 unit, and enemies pay no hold cost and plan on rivals' streams. The reference player already lives on this (`CONTEST_MARGIN_MS`), and so can a human (AUD-A4).
- X5. *One stream beats any tutorial keep*: enemies below 0.35 never shield. This is intended, and it is also the cause of the bot deadlock (AUD-A9).
- X6. Known and documented, not re-opened: an L3 keep with ≤ 3 lanes is untakeable at equal levels and under `lean` (GDD §2.5 AI-7d). 32 and 48 carry the `crown` 3-lane warning.

**Degenerate-AI checks requested.**
- (a) *An enemy that never attacks the player.* Over a whole match (naive line, 10 seeds), the single enemy of levels 1 and 2 never opens a ribbon on the player. So do 20's `enemy1` (eliminated by `enemy2` at 12–15 s in 4/10), 33's `enemy3` (dead at 9 s) and 37's `enemy3` (dead at 22 s). In the first 30 s, enemies with zero ribbons on the player: 1, 2, 5, 6, 7 (tutorial, intended) and, per enemy slot, 20, 21, 24, 33, 34 (2 of 3), 35, 37 (2 of 3), 38 (2 of 3), 39 (2 of 3), 40, 41, 46 (2 of 3), 47, 50. The split of first-30-s ribbons (player / greys / other enemies), naive line: 49 5 / 30 / 65 %, 43 5 / 23 / 71 %, 37 3 / 23 / 73 %, 21 6 / 30 / 65 % (the GD-11 pattern on 49 is campaign-wide from 17 on).
- (b) *Enemy-vs-enemy stalemates.* Enemy–enemy cancelling lanes, median per naive match: ≥ 20 lane-s on 20, 23, 24, 32, 33, 37 (46.6), 38, 42, 45, 47, 48 and 49. They decide a match only with a passive player: alive at 180 s on 28, 37, 38, 47 (1/10) and 39, 42 (2/10). The playtest idle column reads "ok" because idle never *wins*, so these never surface. With a playing player, the 180 s non-results are player–enemy (32: 4/10).
- (c) *Won with no decision.* None. One round of taps at 3 s wins 0 of 500 runs. The reference player needs ≥ 3 ribbons over ≥ 2 decision ticks (level 1) and ≥ 11 ribbons from level 9. The weaker form holds, though: the naive line, which never stops a stream, wins 954/1000 with its median win inside `star2` on 31 levels (AUD-A8).
- (d) *First 10 s decide the match.* Only on 23: 5 of 13 naive losses cannot be saved by the reference player from 10 s (all 13 from 5 s). 27: 14/14 saved at 10 s. 32: 14/16. 41: 3/3. 3 under the reversed tie (0/20, tutorial-steered, `NAIVE_TIE_EXEMPT`): 19/20. Rescue is not monotonic in T (27: 5/14 at 20 s, 12/14 at 30 s), so these are upper bounds on "decided".

---

## 4. First human playtest protocol: TestFlight build 25, 1 or 3 testers, no telemetry

**Mode:** Quick Protocol (internal, N < 5, beta build). **Primary hypothesis (H1):** *A first-time player's felt difficulty peaks at 23 / 27 / 32 and not at 41–50.* Confirmed if attempts-to-first-clear median ≥ 2 on {23, 27, 32} **and** = 1 on {45, 49, 50}. Refuted if 45–50 need ≥ 2 attempts. **Secondary:** **H2** (readability): after 17, 33 and 49 the tester names which colour attacked *them* first, matching the observer log on ≥ 2 of 3. The sim predicts failure ("they fight each other"). **H3** (stars): ≤ 10 % of first clears earn 3★ (bot: 7 %). **H4** (onboarding): ≥ 6 of 8 levels 1–8 cleared at ≥ 2★ on the first clear (naive line: 148/160). Confidence of every threshold: LOW. These are bot-derived until humans calibrate them.

**Sample size.** N = 1 (stakeholder) gives *hypotheses only*. N = 3 (stakeholder + 2 people who have never seen the game) gives *directional patterns* (2/3 = pattern, 3/3 = systemic). Both are below the N = 5 FTUE minimum in `metrics-and-benchmarks.md` §C, so no balance number moves on this test alone. The stakeholder is not a first-timer: they play only session B. Fresh testers play A, then B on another day.

**Sessions** (same build, same phone model where possible; note the device; airplane mode on, so no ads or notifications).
- **A — first hour (fresh testers, 45 min):** Settings → reset progress. Play from level 1 for 35 min, then a 10 min interview. Unguided: the observer helps only after > 2 min stuck.
- **B — late campaign (all testers, 40 min):** from current progress, play 17, 23, 27, 32, 33, 41, 45, 49, 50 in that order where unlocked (a locked level is replaced by the next playable one, and the swap is noted). At most 3 attempts per level, then move on. Ten-minute interview.
- **Remote, one tester (the stakeholder alone):** iOS Screen Recording **with microphone** (Control Centre, long-press) for each level, think aloud. Fill the sheet below after each level; screenshot every result card. The recording replaces the observer: someone else codes it later at 2× speed. Video only of the screen, never the face. Delete it after analysis; that is consent enough for an internal tester. Budget 3× the play time to code it.

**Observation sheet** (one row per attempt, plus event rows). Columns: `time · level/attempt · event · tester's words/reaction · severity · flag`. Severity codes per `metrics-and-benchmarks.md`: confusion C1/C2/C3 (pause > 3 s / "huh?", re-reads / random taps, asks for help), frustration F1/F2/F3 (sigh / same failed tap ≥ 3× / "this is broken", quits), delight D1/D2/D3 (smile / "nice" / "one more"). **Log on every attempt:**
1. Seconds from the card closing to the first tap.
2. First stream stopped (time).
3. Stalemate hint shown (time) and seconds until re-aim.
4. Result, stars and time from the result card.
5. Restart before the end (yes/no).
6. "Who attacked me first?" Ask once at the end of 17, 33 and 49: "Which colour came for you first?" Do not mention the other enemies.
7. On 33, 37 and 49, the time a king's colour vanished from the map.

**Metrics → hypothesis** (cut anything not on this list):

| Metric | Hyp. | Healthy / warning / critical |
|---|---|---|
| attempts to first clear | H1 | 1–2 / 3 / ≥ 4 |
| first tap after card | H4 | < 15 s / 15–30 / > 30 |
| stars on first clear | H3, H4 | — |
| re-aim after stalemate hint | H2 | < 15 s / 15–30 / never |
| quit / restart mid-match | H1 | 0 / 1 per level / ≥ 2 |
| "who attacked me" match | H2 | 3/3 / 2/3 / ≤ 1/3 |

**Interview** (open, plain words, exact quotes, ladder each answer: "tell me more about that moment" → "why did that matter?" → "what did you expect instead?").
1. What was happening in the game?
2. What were you trying to do?
3. Was there a moment you wanted to stop? What was happening?
4. What would you do differently next time?
5. Would you play again tomorrow? What would you hope is different?
6. Tell me about the other colours. What were they doing?
7. Did anything feel unfair?
8. Did you feel you could get better, or was it luck?

*Forbidden:* "Did you like…", "Did you notice the enemies fighting each other?", double questions, explaining the design, and words like "rusher", "AI", "pacing" or "stream".

**Analysis.**
- (1) **Triangulate:** a finding needs 2 of {sheet/recording, metric, quote}. Single-source findings are hypotheses.
- (2) **Classify:** systemic (3/3), segment (fresh vs stakeholder), individual (1/3). Name the immediate / progressive / threshold type.
- (3) **Prioritise** by the severity × frequency matrix in `analysis-framework.md` §C. Critical × ≥ 2/3 → fix before 1.0.
- (4) **Compare** each human row with the bot rows of §1 (naive wins, naive ≥2★, ref median) per level. A human slower than the naive line on a level is a readability problem, not a balance one.
- (5) **Report** with the findings template of `analysis-framework.md` §D into `docs/reviews/<date>-playtest.md`, with the regression delta against the TestFlight checklist results.
- Guard against designer bias: the reviewer of the recording is not the author of the level.

**Covers / misses.** Covers first-hour onboarding, late-campaign difficulty shape, enemy readability, stars and stalemates. Misses: retention (needs ≥ 30 players and telemetry), the economy and shop (1.0 has no IAP), daily and weekly, twists, and device performance (TF-13 covers that). There is no event injection: this is a first test of natural play. Session C can add "wait 30 s on 50" and "airplane notification mid-battle". **Protocol completeness score:** hypothesis 2, metrics mapped 2, sample size 1 (justified as directional, below the benchmark minimum), questions 2, analysis 2 = **9/10**.

---

## 5. Five things that are good
1. **Determinism end to end.** `rngsFor` derives the player's stream and one stream per enemy exactly as the client does. Every number in this audit replays in the browser from its seed, the reference player draws no randomness, and ties break by tower id.
2. **A non-cheating, documented threat model.** `common.ts` reads only what a human sees. Each formula (`siegeOf`, `contestOf`, `artilleryLossOn`) is written down in GDD §2.5 with a sim check, and the AI-7c shared-gun-budget correction is a model of how to fix a model.
3. **Each personality's decision rule is pinned by tests** (`tests/ai/personalities.test.ts`): rusher horizon and aggression scaling, the turtle's L2 gate and anticipation, the opportunist's preference and link cap, shared defence, the `DEFENCE_MIN_AGGRESSION` gate, maintain and the upgrade break. They are joined by `ai8` / `ai9` / `upgradeBreak` / `threatModel`, all green (1725 tests).
4. **Three player models, not one.** The reference player (1000/1000, every win < 180 s), the naive first-time line with its mirrored tie, and the literal card follower measure the campaign from the expert, the novice and the reader. The twist, daily and weekly gates keep the pool honest. No other team artefact made this audit as cheap.
5. **The tutorial band is well built.** One new piece per level on 1–17, enemies below 0.35 that never shield, mistakes that are cheap (idle survives 180 s on 1, 2, 4, 5, 6), and naive ≥ 2★ on 148 of 160 runs. The teach half of the teach → test loop is done right. The test half (§1 item 4, AUD-A8) is what needs work.
