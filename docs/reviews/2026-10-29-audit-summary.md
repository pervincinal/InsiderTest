# Skills audit 2026-10-29 — consolidated findings

Five role agents audited the whole game with the third-party skills installed the same day (`.claude/skills/THIRD_PARTY.md`): balance / player experience (`gstack-balance-review`, `tower-defense`, `gstack-player-experience`), UI / UX / input (`gstack-game-ux-review`, `game-ui-ux`, `input-systems`, `camera-systems`), feel / audio (`gstack-feel-pass`, `game-feel`, `audio-design`), QA / saves / performance (`gstack-game-qa`, `gstack-build-playability-review`, `performance-optimization`, `save-systems`), AI / level pacing / playtest protocol (`game-ai`, `level-design`, `gstack-playtest`). The five reports are next to this file; every finding carries an id (`AUD-B/U/F/Q/A<n>`), evidence and an owner. This page is the Producer's merge: scores, the P0 / P1 list, the proposed order, and the decisions that need the stakeholder.

## Scores

| Area | Score | Verdict |
|---|---|---|
| Balance / economy / progression (`gstack-balance-review`) | 5.6 / 10 | difficulty 5, economy 4, progression 6, monetization 8; 5 cross-section conflicts |
| Player experience (two personas) | casual 4.9 / veteran 6.6 | onboarding and return are the casual newcomer's weak phases |
| UI / UX (`gstack-game-ux-review`, mobile) | 7.0 / 10 "solid" | accessibility 3.8, HUD 6, input 6 |
| Feel (`gstack-feel-pass`) | 8 / 14 "flat" | capture and under-fire strong; hits, mines, boosters, win moment, audio behind |
| QA health (`gstack-game-qa`) | 77 / 100 | functional 63, performance 66, compatibility 59; iOS submission **blocked** on the device pass |
| Playability (`gstack-build-playability-review`) | 9 / 12 "almost" | loop closes; onboarding, retention and peak moment at 1 / 2 |

Totals: 2 P0, 29 P1, 44 P2, 21 P3 across 96 findings (the five tables; duplicates merged below).

## P0 — blocks launch

| Id | Finding | Fix | Owner |
|---|---|---|---|
| **AUD-B1** | The capacity commander track (60 gold, affordable after level 2) breaks the tutorial for a first-time player: `capacityMul` scales the L1 / L2 upgrade thresholds, so an upgraded tower levels at 26–31 instead of 25 and the first-time line never fills it. **Re-measured by the Producer:** level 4 at +5 % 20/20 → 4/20 (16 matches never end), level 6 at +20 % 20/20 → 0/20; the reference player loses level 8 at +25 %. The `--upgrades max` gate checks only stars from above and `--naive` ignores `--upgrades`. | Apply `capacityMul` to the L3 cap only (never to the L1 / L2 thresholds or `targetFull`), or retire the track; add a gate "no single tier hurts the naive line or the reference player" to `playtest` and CI; fix the level 4 bubble's hard-coded "At 25". | gameplay-engineer + game-designer (rule), monetization-designer (track), qa-engineer (gate) |
| **AUD-Q1 / A2** | No human has ever completed the device pass or a campaign playtest: TF-01…TF-29 have zero recorded results, no WebKit has run the game. | The stakeholder runs the 20-minute severe-failure subset of the TestFlight plan on build 25 and the one-page playtest protocol in the AI / levels report §4; the team cannot do this. | stakeholder (producer prepares the subset) |

## P1 — before 1.0, grouped

**Touch and text (UX + QA agree; root cause: the 720 × 1280 layout is drawn at 0.50 CSS px per layout px on a 360-wide phone, so "44 pt" in the code is 22–26 pt on screen)**
- AUD-U1 / Q6 — almost every button is under 44 pt and hit areas equal the drawn shapes: pad every tap area to ≥ 44 pt (`44 / view.scale` layout px), enlarge pause, mute, boosters, MENU, BACK, daily tabs, language chip, result links, settings toggles; guard test. — frontend
- AUD-U2 / Q7 — text 5.5–13 CSS px at 360 (badges 13, STREAMS 7, booster cost 8, "FREE" 5.5, lesson card 10, select hint 9.5): 22 layout-px minimum, text-size setting 100 / 125 / 150 %, guard test. — frontend + tech-artist
- AUD-U3 — `DRAG_THRESHOLD` 14 layout px = 7 CSS px: a shaky tap becomes a drag (own tower: nothing; target: a cut). Threshold ≥ 10 pt in CSS px; a drag released on its start tower is a tap. — frontend
- AUD-U4 — accidental exits: in-play MENU leaves the match instantly (under the thumb); pause RETRY / MENU and Esc / R act without asking. MENU opens the pause card, Esc pauses. — frontend
- AUD-U5 — crystals spent in one tap with no confirmation (skins, crate, Continue, skip): reuse the Convert confirm card or an undo toast. — frontend + monetization

**Saves (QA)**
- AUD-Q2 — a corrupt save silently becomes a fresh one and the language setup writes the default back at boot, so the original is destroyed before the first tap (probe: 50 stars → 0): keep the raw copy under a backup key, fall back to it, toast. — frontend; QA test
- AUD-Q3 — a save from a newer version is accepted and rewritten as v3, dropping unknown fields: read-only mode + "update the game" notice (must ship in 1.0, the first client that meets a v4 save). — frontend
- AUD-Q4 — WebView localStorage is the only copy of progress; update / reinstall / backup restore / kill-after-win untested; TF-28 wipes progress before anyone checks an old save survives an update: mirror every write to the native Preferences plugin; add TF-00 and TF-17b. — mobile-engineer

**Rules and progression (balance + AI audits)**
- AUD-B2 / A11 — a stalemate never ends for a human and restart records nothing (32: 8/20 still running at 180 s; idle players alive at 180 s on 28, 37, 38, 39, 42, 47 behind enemy shield standoffs): after 45 s without a capture escalate the stalemate hint to a "Restart / keep playing" card, a retreat that counts as a defeat once the hint fired (GDD §2.4 first), enemy standoff shields drop after 20 s. — game-designer, frontend, ai-engineer
- AUD-B3 — one skip per band, but learning levels 27 and 32 share band 25–32 (first-time line 6/20 and 4/20): one skip per learning level or two in that band. — monetization
- AUD-B11 — the lesson card is up for 8 s of live play while enemies open at 0.0 s; reading costs the opening (23's card asks for a move that is already late): hold the sim at t = 0 until the first tap or dismissal (GDD §4 first). — game-designer, frontend
- AUD-B7 — the interstitial counter counts defeats, so ads, the continue offer and the skip offer pile up on 23 / 27 / 32: do not count defeats; no interstitial in a defeat streak. — monetization, frontend
- AUD-B9 — level 3: taking the other grey first loses 0/20 at 4 s and 8 s; the CI exemption relies on the tutorial steer being answered within ~1 s: re-lay level 3 (as LV-22 did for 5) and drop the exemption. — level-designer
- AUD-B12 — learning levels 23 / 27 / 32 got card-only fixes (first-time line 7 / 6 / 4 of 20): apply the recorded layout levers, measure at 100 seeds and all twists. — level-designer
- AUD-A1 — level 33 introduces the third enemy and it is dead at 9–10 s in 9/10 seeds, before the player meets it: garrison / position that survives 30 s, re-clock, re-run its twist and weekly gates. — level-designer
- AUD-B4 / A13 — `star3` sits below the reference bot's own median on all 50 levels (bot 3★ in 71/1000 runs, 0/20 on 31 levels) and gates 180 crystals: set `star3` from human timings (the playtest) or reword the ladder. — game-designer, level-designer (after the playtest)
- AUD-B5 — the 2★ cliff past 16: first-time 2★ share 27 % / 19 % in bands 17–24 / 25–32; GD-12's own trigger for the card-reader floor is already met by the simulation: adopt the floor in 1.0 after re-running ECONOMY §6 (stakeholder decision — see below). — game-designer, level-designer, monetization
- AUD-B6 — no telemetry at all while ≥ 9 balance decisions wait "until telemetry": an opt-in on-device `level_end` event, or a dated TestFlight measurement per clause. — producer, publisher, frontend

**Feel and audio (tech artist)**
- AUD-F1 — being attacked plays no sound and no haptic: rate-limited hit sound + light haptic. — tech-artist (+ mobile)
- AUD-F2 — a mine blast is identical to a clash death: mine flash / ring / sparks, 2 px shake, `mine` sound; static chip highlight under reduced motion. — tech-artist
- AUD-F3 — Freeze and Overdrive (paid boosters) show nothing in the world and reuse the upgrade sound: frost / gold rims, chevron changes, lazy chunk. — tech-artist + frontend
- AUD-F4 — win and loss hide their own last capture (dim at +34 ms, card at +120 ms, confetti after ~1 s behind the card): 600 ms beat before the dim and card, confetti on screen; reduced motion keeps the instant card. — frontend + tech-artist
- AUD-F5 — every new stream waits 1 035 ms before its first soldier leaves (`commands.ts:50` starts the emission timer at 0): emit the first unit immediately (sim change, re-playtest, designer sign-off) or a render-only muster animation. — gameplay-engineer + game-designer
- AUD-F6 — no music and no mixing (one master gain, no buses / limiter / ducking; 11 voices at once on a win): SFX / UI / Music channels with a limiter, a lazy synthesised 100 BPM three-layer loop (≤ 2 kB gzip, 0 eager), separate Music / Effects settings. — tech-artist (+ frontend)

**Test infrastructure (QA)**
- AUD-Q5 — zero WebKit in automation; the simulator app is built but never launched: a CI-only WebKit Playwright project, then boot the simulator app. — qa-engineer + mobile-engineer
- AUD-Q8 — performance never measured on hardware; the CI gate (50 ms) is ~3× CI's own samples: a relative regression gate + an on-screen frame-time overlay for TF-13. — qa-engineer + mobile-engineer
- AUD-Q9 — QA-33 (lesson-card wrap margin, six tight cards) stays open. — qa-engineer + level-designer

Budget warning for every P1 above: the eager bundle is at 81.2–81.4 kB of 82 kB; the feel and UI additions must go into lazy chunks or the budget must be re-argued (Producer).

## P2 / P3 (in the five reports; not scheduled yet)

UX: double-tap toggles a stream off (U6), pause card fires on lift not press (U7), swipe vs drag by start point only (U8), level 1 shows greyed boosters and a 0-coin pill (U9), dead-looking pills (U10), stalemate toast on the selected home (U11), RU select hint squeezed (U12), AZ map title collides with the wallet (U13), defeat card layout (U14), unaffordable price contrast (U15), "every red stream" wording (U16), owner by colour only (U17), no fling scroll (U18), tower under the bottom band (U19), settings rows (U20), camera framing per level (U21); P3 U22–U27. Balance: B8 gold has no late sink, B10 first-tap side decides 2★ on 5 / 7 / 11 / 16 / 26 / 45, B13 weekly picker never draws 46, B14 starter pack after level 5, B15 daily pool vs unlock, B16 level 4 `star2`, B17 `--naive --upgrades` silently ignored; P3 B18–B20. Feel: F7–F15; P3 F16–F19. QA: Q10 silent failed saves, Q11 idle title is the most expensive frame, Q12 no soak test, Q13 naive line stuck on 23 / 27 / 32, Q14 app origin unpinned, Q15 specs write into tracked screenshots regardless of `PW_OUTPUT`; P3 Q16–Q19. AI / levels: A3 enemies rarely attack the player (0–8 % of early streams on 15 levels; 40 % in band 2 → 7 % in band 5), A4 enemies feed each other's captures (53–69 % re-flips), A5 ribbon flicker, A6 the opportunist is everyone's victim, A7 waiting is free on 37 / 39 / 40 / 42 / 50, A8 difficulty inverted (naive line 197/200 on 41–50 vs 130/160 on 25–32), A9 the reference player deadlocks against non-shielding enemies, A10 personalities invisible, A12 no engagement regression test; P3 A14–A15.

## What must not be "fixed" (all five reports agree)

No energy, unlimited free retries, no level needs an upgrade; "equal for everyone" daily / weekly with the bot proof; streams carry production, under fire, a stream never empties a tower; the lesson cards' winning first move with the literal-follower proof; the `star2` floor at the first-time median on 1–16; the capture effect and the under-fire badge; budgeted effects and one reduced-motion switch; lazy audio that unlocks on the first tap; the e2e guards (badge, hint, bubble, card fit, share, shop).

## Proposed order (one sprint = one day)

1. **Day 42:** AUD-B1 (P0) with its gate; saves Q2 / Q3 / Q4; touch U1 / U3 / U4 / U5; level 33 (A1); interstitial B7. Build 26.
2. **Day 43:** text sizes U2; feel F1 / F2 / F4; card hold B11; stalemate exit B2 / A11; level 3 and 23 / 27 / 32 layouts (B9, B12). Build 27.
3. **Day 44:** music + mixer F6, booster visuals F3, first-unit delay F5 (sim); WebKit project Q5 and the perf overlay Q8; telemetry B6 (opt-in).
4. **After the human playtest:** `star3` (B4 / A13), the 2★ floor (B5), the AI engagement changes (A3 – A6, A9) — each means re-clocking 34+ levels and re-running every twist gate, so they are decided on human data, not on the bot.

## Decisions for the stakeholder (defaults apply if no answer)

- **2★ floor past 16 (AUD-B5 vs GD-12's "after launch" default):** two audits say the simulation already meets the trigger. *Default: adopt it in 1.0 (day 44), after ECONOMY §6 is re-run.*
- **Capacity track (AUD-B1):** fix the rule, or retire the track and refund its gold at 1.0.1? *Default: fix the rule (L3 cap only) and keep the track.*
- **Music (AUD-F6):** a synthesised loop at 0 eager bytes, or ship 1.0 without music? *Default: build it, behind a Music setting defaulting to on.*
- **The device pass and the playtest (AUD-Q1 / A2):** only you can do these; the 20-minute subset and the protocol are in the plan and the AI report. *Default: builds keep going to TestFlight; nothing is submitted for release until a pass is recorded.*
