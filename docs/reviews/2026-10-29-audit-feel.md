# Audit 2026-10-29: game feel, visual feedback and audio (Tech Artist)

Skills applied: `gstack-feel-pass` (full pass, `references/scoring.md` rubric), `game-feel` (recipe check per event, `references/feedback-recipes.md` tiers), `audio-design` (buses, ducking, variation, adaptive music). Build: branch `claude/tower-war-game-plan-weqwpb`, scratch `vite build` served on :4191, headless Chromium 360 × 640 (DPR 2), EN.

**Evidence folder** (outside the repo): `/tmp/claude-0/-home-user-InsiderTest/27ff3ffe-c8bd-51f2-b6a9-550752bc37bb/scratchpad/audit-feel/`. It holds:
- `<burst>-fNN_<±ms>.png`: frames composited from `#ground` + `#game` + `#hud` every 100 ms, from −300 to +1200 ms around the trigger;
- `<burst>-sheet.png`: a 4 × 4 contact sheet per burst;
- `zoom-*.png`: close crops;
- `<burst>.json` and `summary.json`: the sim events, every WebAudio voice the synth started and the rAF intervals, all on `performance.now()`.

Script: `/tmp/claude-0/-home-user-InsiderTest/27ff3ffe-c8bd-51f2-b6a9-550752bc37bb/scratchpad/audit-feel-frames.cjs`. It is adapted from bug57: debug hooks, CDP touch, an event tap on `state.events`, and an `AudioContext` wrapper that logs voices without needing to hear them.

| Burst | Trigger | How it was staged |
|---|---|---|
| `L02-capture-360x640-en` (+ `-rm`) | the player's capture of `mid` | a real CDP drag from home to mid |
| `L05-underfire-360x640-en` | the first hostile landing on a player tower (`east1`) | autoplay at ×3 until an enemy stream targeted the player, then ×1 |
| `L17-mine-360x640-en` | the first `unitDied` with cause `mine` | autoplay |
| `L12-artillery-360x640-en` | the first `unitDied` with cause `artillery` | the gun post was handed to enemy1 (scratch mutation); solo re-run |
| `L25-tank-360x640-en` | a hostile landing with weight 5 (a tank on `depot`) | autoplay |
| `L01-win-360x640-en` (+ `-rm`) | `won` | autoplay |
| `L05-loss-360x640-en` | `lost` | staged: the debug `autoLose` bot **won** level 5 (probe: every tower was the player's at sim 52 s), so the foe garrison was set to 90 and home to 1 |

How far to trust the timings: headless shell renders in software. In solo runs the frame interval averaged 17.2–17.4 ms with a 33 ms maximum (L12, L05-loss, and six select/deselect taps on L5). The 300 ms gaps in the first parallel run came from CPU contention, not the game, so I report no perf finding.

## 1. Feel-pass rubric

**Target feel.** No hand-off exists, so I took it from ART_DIRECTION §1/§5 and GDD: *"Taps are snappy, captures are crunchy but light, losses are readable, the win is released. A toy-clay strategy game you can read at a glance on a 360 px phone."*

**Measured inputs** (L2, 360 × 640):

| Moment | Measurement | Vocabulary |
|---|---|---|
| Tap on own tower → first change | Nothing changes while the finger is down (0–115 ms after touchStart, only flag-animation noise in the tower box). Selection ring and lift appear 3–17 ms after release. The tap was held 131 ms, so the first change came about 134–148 ms after finger-down. | snappy from release, **sluggish** from touch-down |
| Drag release → link | `linked` arrives 69 ms after release (commands wait for the next 50 ms sim tick). Ribbon on the next frame, 84 ms after release. `send` blip at 71 ms. | responsive / sluggish boundary |
| Drag release → first soldier leaves | **1035 ms** (`commands.ts:50` sets `emitAccMs: 0`, so the first unit waits one full emission interval). Only the 380 ms pulse covers the gap. | **dead time** (> 0.5 s, auto-flag) |
| Capture event → feedback | First drawn frame at +14…16 ms: badge halo, roof wipe, flash ring. Chime voices at +1 ms (2 triangles, +0 / +110 ms). Squash, ring and chips are done by about +530 ms. | crunchy (light tier) |
| Hostile landing on own tower → feedback | Badge alert, swords pip and attacker stroke at +33 ms (`zoom-L05-underfire.png`). Impact ring at the plinth. **0 audio voices.** No haptic. | readable, **hollow** |
| Mine kill → feedback | Unit vanishes into 3 grey puffs and the chip ticks 6 → 5. Audio is the same 70 ms noise as any clash death (`zoom-L17-mine.png`). | **numb / cryptic** |
| Artillery kill → feedback | The barrel snaps to the new aim in one frame. The tracer is about 1.5 CSS px and visible for about 1 frame. The victim gets the grey puff. Audio: sweep + noise at +1 ms (`zoom-L12-artillery.png`). | light / hollow |
| Tank (weight 5) lands → feedback | The same 18 px impact ring as one soldier. Badge 8 → 3 pops at +110 ms. Audio: only the 28 ms `arrive` tick (`zoom-L25-tank.png`). | **hollow** |
| Last capture → result | Veil at +34 ms. Card sliding at +120 ms, settled at about +460 ms. Stars at about 510 / 810 / 1070 ms. Gold counts from 900 to 1700 ms. Fanfare voices all start at +1 ms. | the decisive moment is cut off; payoff miscalibrated |

```
Feel Pass: Tower Clash core loop (select → link → march → capture → win/loss)
═══════════════════════════════════════════
Target feel: snappy taps, crunchy-but-light captures, readable losses, a released win

  Responsiveness:     1/2  — selection 3–17 ms after release but no press state (≈ 134–148 ms from touch-down on a 131 ms tap); link ribbon 84 ms
  Clarity:            1/2  — counts, under-fire pip and capture read at 360 px; mine kills, artillery shots and tank weight do not
  Impact:             1/2  — capture fires visual + audio + haptic + camera together; under fire has no audio; mine, tank and artillery chains are hollow
  Rhythm:             1/2  — streams flow, but every stream opens with ~1 s of dead lane; the audio bed is silent apart from identical ticks (no music)
  Payoff:             1/2  — capture is proportional; the win cuts off its own capture, confetti is mostly hidden, the wallet shows the total before the count-up; paid Freeze / Overdrive show nothing in the world
  Dead Time:          1/2  — 1035 ms from release to first soldier on every new stream (flag > 0.5 s); otherwise none
  Overload:           2/2  — combat VFX are capped (token bucket 8 burst / 40 s⁻¹, ≤ 700 particles) and serve communication; dense boards (L17) are busy from streams, not effects
  ─────────────────────────
  TOTAL:              8/14  — FLAT

Top 3 Feel Blockers:
  1. Audio channel missing on damage taken: a hostile landing on an own tower produces 0 voices (L05-underfire.json), and a mine blast sounds exactly like a clash death (L17-mine.json): hollow / cryptic.
  2. Visual dead time at stream start: 1035 ms from release to the first soldier, ≈ 650 ms of it with nothing moving after the 380 ms pulse.
  3. Win payoff cut off: the veil at +34 ms covers the final capture's ~500 ms chain, confetti enters at about +1 s behind the card, and the fanfare (0–450 ms) has finished before the first star lands (≈ 510 ms).
═══════════════════════════════════════════
```

Verdict **FLAT (8/14)**: it works but it does not yet engage. ART-1…ART-26 delivered a strong *capture* chain and readable *state*. The *event* chains around it (being hit, mines, guns, tanks, boosters, the win beat) and the whole audio layer were never brought to the same tier. This is the first run, so there is no baseline delta.

**Forcing questions**
- **Q1, sound only.** Eyes closed, you hear: a blip per stream start; a 760 Hz tick on own arrivals (up to 10/s, always the same pitch); identical noise crackles for every death; a two-note chime for my captures; a thud for my losses; sweep + noise for artillery. You **cannot** tell: that you are under attack (silent); that a tank arrived (same tick as a soldier); a mine blast from a clash (same noise); a Freeze from an Overdrive from an upgrade from a shop purchase (one shared arpeggio). Between events there is silence: no music, no ambience. **Fail.**
- **Q2, first action.** About 134–148 ms from finger-down on a normal 131 ms tap. The selection itself lands 3–17 ms after release, so the delay is entirely the missing press state. Drag: 84 ms to the ribbon, 1035 ms to the first soldier.
- **Q3, 20th repetition.** The capture chain holds up (it is short, about 530 ms, and capped). What wears out by around the 10th repetition is the audio: one fixed `arrive` sine and one fixed death noise, rate-limited to 10 and 12.5 per second, with no variation.
- **Q4, no VFX.** With effects removed, the badges and roof colours still carry capture and under-fire (good: that is how reduced motion looks). A mine kill becomes a unit disappearing and a chip number changing. An artillery kill and a tank landing become a number changing. The effects are not doing the mechanics' job here. They are simply missing.

### Recipe check per event (`game-feel` menu)

V = visual, A = audio, H = haptic, C = camera. Tier as defined in `feedback-recipes.md` §4.

| Event | V | A | H | C (shake) | Hit-stop | Easing / squash | Tier today → should be | Reduced motion |
|---|---|---|---|---|---|---|---|---|
| Tap / select | ring + 4 px lift on **release** | none (only HUD `button`) | – | – | – | snap, no press squash | – → small | static ring (ok) |
| Link start | 380 ms pulse, brighter source ring | `send` triangle blip (pitch by count) | – | – | – | ease-out pulse | small (ok) | static ribbon |
| Capture (mine) | halo, wipe, squash 0.85 + backOut, flash ring, 12 chips, 8 sparks | 2-note chime | light | 6 px, 320 ms, sin-decay | – (right for an RTS) | yes | medium (ok) | **no substitute** (F13) |
| Own tower lost | the same chips / ring in enemy colours | low thud | **none** | **none** | – | squash | small → medium (F16) | colour swap only |
| Tower under fire | badge alert + pip, jolt 3 px, impact ring, flash, 4 sparks | **none** | **none** | – | – | jolt sin-decay | small, missing A (F1) | static tint / pip (ok) |
| Upgrade (auto) | roof pulse, gold ring, 14-glint fountain | arpeggio (own only) | – | – | – | pulse | medium (ok) | none |
| Mine blast | 3 grey puffs (= clash death) | 70 ms noise (= clash death) | – | – | – | – | numb → medium (F2) | chip number only |
| Artillery shot | 130 ms flash, 3 px tracer, 5 sparks, barrel snaps | sweep + noise | – | – | – | **no aim ease, no recoil** | light → medium (F11) | barrel aim only |
| Tank landing | the same ring as one soldier | `arrive` tick | – | – | – | badge pop | small → medium (F10) | badge only |
| Win | veil + card slide (easeOutBack), title pop, star pops, count-up, 90 confetti | fanfare at t = 0 over the capture chime | – | – | – | yes | large, but cut off (F4, F9) | card at +40 ms (ok) |
| Loss | 28 % grey veil, card slide | thud + descending sawtooth | – | – | – | slide | medium (ok, F16) | card instantly |
| Booster: Freeze / Overdrive | **nothing in the world** (HUD cooldown ring only) | `upgrade` arpeggio | – | – | – | – | – → medium (F3) | – |
| Booster: Airstrike | 2 tracers from off-screen, 4 puffs | `artillery` | – | – | – | – | light | none |
| Shop purchase | coin / crystal burst (lazy chunk) | `upgrade` arpeggio | – | – | – | fountain arc | medium (ok, A shared, F8) | none |

Hit-stop: deliberately none, and it should stay that way globally. A world freeze in a real-time game with dozens of simultaneous landings would stall input and read as lag. The only place a "freeze" fits is the authored win beat (F4).

## 2. Findings

Budgets every fix must respect:
- **Eager bundle:** at most 82 KiB gzip. Today Vite reports 83.39 kB, which is 81.4 KiB, leaving **≈ 0.6 KiB headroom**. So anything larger than a few hundred bytes goes into a lazy chunk (`recipes.ts`, `hudOverlays.ts`, `particlesEconomy.ts`-style).
- **Frame time:** at most 50 ms (ART-23 limits: ≤ 2 fills / strokes per particle, the shared landing bucket).
- **Reduced motion:** honoured, with a *static* substitute rather than nothing.

| ID | Sev | What is wrong / missing | Evidence | Proposed fix (one sentence; budget) | Owner |
|---|---|---|---|---|---|
| AUD-F1 | **P1** | Being attacked is silent and has no haptic. `sfxForEvents` ignores `landed`, so a hostile landing on your own tower starts 0 voices, and only the capture-loss thud plays once the tower is already gone. | `L05-underfire.json` (voices at dt 0: none; the next ones at 244 / 427 ms are unrelated); `src/audio/sfx.ts` `sfxForEvents`; `zoom-L05-underfire.png` | Add a rate-limited "hit" recipe (short low knock, ≤ 6/s, pitch nudged by the attacker's weight) for hostile landings on player towers, plus a light haptic at most once per 400 ms per tower. Recipe in the lazy `recipes.ts` (0 eager); mapping ≈ 60 B eager. | Tech Artist (+ Mobile Engineer, haptic) |
| AUD-F2 | **P1** | A mine blast looks and sounds exactly like a clash death: 3 grey puffs and the same 70 ms noise. Players on levels 17–24 cannot see why their column vanishes, only the chip number changes. | `zoom-L17-mine.png` f03 +15 ms / f10 +716 ms; `L17-mine.json` voices `0: noise`; `particles.ts` `onEvents` → `death()` for every cause | On `unitDied` with cause `mine`, burst a mine-red flash + impact ring + 4 soot sparks at the mine (existing kinds, shared landing bucket), add a 2 px shake when it is the player's unit, and play a `mine` recipe (low sweep + noise). ≈ 0.2 kB eager in particles.ts, recipe lazy; reduced motion: a 300 ms static chip highlight. | Tech Artist |
| AUD-F3 | **P1** | Freeze and Overdrive, paid boosters (30 / 40 gold or a rewarded video), show nothing in the world. Nothing in `src/render` reads `state.boosters`, and the cast sound is the same arpeggio as an upgrade or a shop purchase. | `grep state.boosters src/render` → only `hud.ts` (cooldown ring); `play.ts:650` `playSfx('upgrade')` | Draw Freeze as a frost rim + snow pip on frozen owners' badges with their chevrons stopped, and Overdrive as a gold rim on player ribbons with faster chevrons, plus a one-shot cast burst at the HUD button. Draw code in a lazy `boosterFx` chunk warmed with the booster bar (≤ 0.15 kB eager); reduced motion: static rims. | Tech Artist (+ Frontend Engineer, trigger) |
| AUD-F4 | **P1** | The win (and loss) cuts off its own decisive moment. The veil lands +34 ms after the last capture and the card is sliding by +120 ms, so the ~530 ms capture chain plays under a 28 % veil and behind the card. Confetti spawns 20–320 px above the map at 90–210 px/s, enters at about +1 s and is mostly behind the card. | `L01-win-360x640-en-sheet.png` (f03 +34 ms veil, f04 +120 ms card, f14 +1133 ms first confetti); `play.ts` `update()` → `finish()` in the same frame; `particles.ts` `victory()` | Hold an authored 600 ms beat after `won` / `lost` (world un-veiled, input blocked, final capture chain and a 1.1× badge pop playing), then veil + card, and spawn confetti inside the top of the screen. Change ≈ 50 B in play.ts / ResultScreen, rest in the lazy hudOverlays chunk; reduced motion keeps the instant card. | Frontend Engineer + Tech Artist |
| AUD-F5 | **P1** | Dead time at every stream start: 69 ms to `linked`, 84 ms to the ribbon, **1035 ms to the first soldier**, because a new link starts with `emitAccMs: 0`. After the 380 ms pulse, the lane is empty for about 650 ms. | `summary.json` → `latency.link`; `src/sim/commands.ts:50` | Emit the first unit at link creation (`emitAccMs = interval`), or, if design rejects the balance shift, a render-only "muster" (a soldier steps out of the gate and waits) during the first interval. Sim change: needs `npm run playtest` + designer sign-off; the render variant is ≤ 0.1 kB. | Gameplay Engineer + Game Designer (Tech Artist for the muster variant) |
| AUD-F6 | **P1** | No music and no mix. Every voice goes into one `master` gain (0.5) and straight to the output. There are no buses, no limiter, no ducking, and only a single sound on/off setting. On a win, 11 voices start in the same millisecond (capture chime + fanfare + arrive). | `src/audio/synth.ts` (`MASTER_GAIN`, `unlock`); `L01-win.json` voices (11 at dt 1); `grep -ri volume\|music src` → nothing | Add Master ← {SFX, UI, Music → MusicDuck} gains with a `DynamicsCompressor` safety limiter on Master, plus the lazy synthesised adaptive music of §3, and split Settings into Music / Effects. Graph wiring ≈ 0.25 kB eager (fits the 0.6 KiB headroom) or built inside the lazy recipes chunk on first play; music is a lazy chunk. | Tech Artist (+ Frontend Engineer, settings) |
| AUD-F7 | P2 | No SFX variation. Every recipe plays at a fixed pitch and gain: `arrive` is 760 Hz sine up to 10/s, `unitDied` is the same noise up to 12.5/s, so the loop sounds like a machine gun by around the 10th repeat. | `src/audio/recipes.ts`; `RATE_LIMIT_S` in `sfx.ts`; Q3 above | Apply ±40 cents detune and ±2 dB per play from a counter hash, rotate `arrive` round-robin over 3 pentatonic pitches, and step the pitch up for consecutive arrivals on one tower within 400 ms. Lazy recipes chunk, 0 eager. | Tech Artist |
| AUD-F8 | P2 | The `upgrade` arpeggio means too many things. It is the sound for a tower level-up, a booster cast, a rewarded charge, a continue, every shop purchase, achievements and level unlocks (20+ call sites). | `grep playSfx('upgrade')` in `play.ts` (299, 650, 666), `shop.ts` (474, 535, 549, 571, 592), `screens.ts`, `achievements.ts` | Add `purchase` (coin clink), `reward` (sparkle) and `booster` (per kind: freeze shimmer, overdrive rising sweep) recipes, and keep `upgrade` for towers. Recipes lazy; call sites ≈ 40 B eager. | Tech Artist + Frontend Engineer |
| AUD-F9 | P2 | Win audio ignores the visual sequence. The fanfare (0 / 150 / 300 / 450 ms) and the capture chime (0 / 110 ms) all start on the `won` tick, while the stars pop at about 510 / 810 / 1070 ms and the gold counts from 900 to 1700 ms in silence. | `L01-win.json` voices; `hudOverlays.ts` star timings (`since − 420 − i·260`) | Drop the capture chime when `won` is in the same batch, start the fanfare when the card settles (≈ 460 ms), play one rising ding per earned star and soft rate-limited coin ticks during the count-up. Recipes lazy; triggers in the lazy hudOverlays chunk. | Tech Artist |
| AUD-F10 | P2 | A tank landing reads like one soldier. The weight-5 tank takes `depot` from 8 to 3 with the same 18 px ring and the 28 ms `arrive` tick; `landed.weight` is ignored by the renderer and the audio. Tanks are also silent while moving. | `zoom-L25-tank.png` f03 / f04; `L25-tank.json` (`landed/w5` → one `sine`); `particles.ts` `hit()` / `reinforce()` | Scale the impact ring and spark count with weight (capped at 2×), add a heavy thud and a 3 px shake for weight ≥ 5 on a player-owned or player-attacked tower, and a low track rumble at most once per tank per second. ≈ 0.1 kB eager, recipe lazy, reduced motion: the badge pop only. | Tech Artist |
| AUD-F11 | P2 | An artillery shot has no anticipation or weight. The barrel snaps to the new aim in one frame with no recoil; the 3-map-px pale tracer is about 1.5 CSS px on grass for about 1 frame; the victim gets the generic grey puff; the kill resolves on the firing tick. | `zoom-L12-artillery.png` f02 → f03; `particles.ts` `shot()`; `sprites.ts` barrel `aimOf` | Ease the barrel to the target over 80–120 ms with a 2 px recoil kick, double the tracer width with an ink edge, and use an impact flash in the gun owner's lit tone. Render-only, ≤ 0.1 kB eager; reduced motion: a static aim. | Tech Artist |
| AUD-F12 | P2 | No press state on a tower tap. Nothing changes while the finger is down (selection fires on `up`, `pointer.ts:430`), so a normal 131 ms tap first changes the screen about 134–148 ms after touch-down. | `summary.json` → `latency.tap` (0 changed px in the tower box before release; 955 px at +3 ms after release); `tap-L02-*.png` | On `pointerdown` over your own tower, show a pressed state (plinth 0.95 squash + faint ring, visual only, from `gestures.downTowerId`) and confirm selection on release. ≈ 80 B eager; reduced motion: static ring. | Frontend Engineer (pointer) + Tech Artist (draw) |
| AUD-F13 | P2 | Reduced motion drops the capture feedback entirely. `ParticleSystem.capture()` returns before recording the capture, so the badge halo, a pure opacity fade, is lost too; the reduced-motion player gets only the colour swap. | `zoom-L02-capture-rm.png`; `particles.ts` `capture()` first line | Under reduced motion, still record the capture and draw the `captureFlash` halo as a static 300 ms highlight (no scale, no movement). 0 B net. | Tech Artist |
| AUD-F14 | P2 | The result wallet gives the reward away before the count-up. The wallet shows the new total (230) at +34 ms while the card still reads "+0", until it counts to +30 between 900 and 1700 ms; no coin travels to the wallet, so the pickup tween (the "soul" of a collect chain) is missing. | `L01-win-360x640-en-sheet.png` f03–f13 (wallet 230 vs "+0") | Show the wallet at its pre-match value and tick it in step with the card's counter, or fly 5 coins to it via the existing lazy `coinBurst`. Lazy hudOverlays / economy chunk. | Frontend Engineer |
| AUD-F15 | P2 | Losing your own tower has no damage-taken visual: the same chips and ring as any capture, but in enemy colours. The shake is limited to `ev.by === 'player'` and nothing marks the direction. | `particles.ts` `onEvents` → `capture(…, ev.by === 'player')`; `play.ts:338` (haptic only for gains) | Add a 250 ms ink-red edge pulse on the side of the screen nearest the lost tower, a medium haptic, and the badge flash in the attacker's colour. ≈ 0.1 kB eager; reduced motion: a static 300 ms edge tint. | Tech Artist (+ Mobile Engineer) |
| AUD-F16 | P3 | The achievement toast competes with the result sequence: it appears at +220 ms, before the first star, and in celebratory blue on a DEFEAT card. | `L01-win-360x640-en-sheet.png` f05; `L05-loss-360x640-en-sheet.png` f05 | Queue result toasts until the count-up ends (≈ 1.7 s) and give achievements on a defeat a neutral style. | Frontend Engineer |
| AUD-F17 | P3 | Capture chips read as specks at 360 px: 5–8 map px, about 2.5–4 CSS px. | `zoom-L02-capture.png` f06 +339 ms | Use 8 chips at 1.4× size instead of 12 (fewer fills, the same budget). | Tech Artist |
| AUD-F18 | P3 | Screen shake has no own setting; it is only removed together with every motion by reduced motion. | `draw.ts` `drawGame` (`motion ? shake : 0`) | Optional "Screen shake" on/off in Settings, defaulting to on (`feedback-recipes.md` §5). ≈ 60 B eager. | Frontend Engineer |
| AUD-F19 | P3 | Tooling: the debug `autoLose` bot wins level 5, so loss-path tests cannot rely on it. | probe in this audit: every tower was the player's at sim 52 s → result screen "won" | Make `suicideCommands` stop sending into neutrals, or assert the outcome in its spec. | QA Engineer |

## 3. Audio

**What exists** (`src/audio/`, ART-9, MM-7):
- One `Synth` with lazy context creation on the first gesture, an iOS silent-buffer unlock, page-hidden suspend and a master gain of 0.5 with mute.
- Three voices (`blip`, `sweep`, `noiseBurst`) and 11 recipes in a **lazy chunk** (`recipes.ts`, 0 eager), warmed at init.
- Per-sound rate limits (arrive 100 ms, unitDied 80 ms, artillery 100 ms, send 50 ms, refuse 120 ms).
- A pure event-to-sound map, and an arrival tracker that diffs units.
- Capture has three moods: gain (rising fifth), loss (thud), other (quiet blip).
- `refuse` is designed for phone speakers: triangle harmonics above about 200 Hz.

**What is missing:**
1. **Music.** There is none: no menu loop, no match bed, no stingers apart from the won / lost jingles. The match is silent between ticks, which is why the Rhythm score is 1 and why the eyes-closed test (Q1) fails.
2. **Mix.** No buses, no limiter, no ducking, a single on/off setting (AUD-F6). Concurrent stingers simply add up: 11 voices at the win.
3. **Variation.** None (AUD-F7). Identical ticks up to 10/s.
4. **Coverage gaps.** Hostile landing (F1), mine (F2), tank landing and movement (F10), boosters (F3, F8), result stars and coins (F9).
5. **Haptics.** Only a light tick on the player's own captures.

**Proposal, sized for WebAudio synthesis** (the "Clay Band" lazy chunk `src/audio/music.ts`, target ≤ 2 kB gzip, 0 eager):
- **Graph:** `Master(limiter: DynamicsCompressor −6 dB / ratio 12 / attack 3 ms / release 250 ms) ← {SFX gain, UI gain, Music gain ← MusicDuck gain}`.
  - The player's Music / Effects settings set the plain gains, using a squared slider value (`audio-design` pattern 1).
  - Ducking automates only `MusicDuck`: −8 dB with a 20 ms attack and 400 ms release on `capture: loss`, `won`, `lost` and the stalemate toast, so it never fights the slider.
- **Scheduler:** a 25 ms `setInterval` lookahead that schedules 120 ms ahead on `ctx.currentTime` (sample-accurate, the audio clock, never frame time). 100 BPM, 4-bar loop in a major pentatonic key that matches the existing C-based stingers.
- **Vertical layers**, all running all the time; only their gains move, with 0.8 s fades:
  - **L0, bed:** a triangle root / fifth bass on beats 1 and 3 plus a soft sine pad (2 voices per beat). Plays in menus and the match.
  - **L1, march:** a sine pluck arpeggio on eighths (1 voice per eighth). Enters when the player has ≥ 1 active stream.
  - **L2, tension:** noise hats on the off-beats plus a low sine "kick" (≤ 2 voices per beat). Enters when intensity ≥ 0.6 and leaves below 0.4 (hysteresis).
- **Intensity** = smoothed (`1 − e^(−3·dt)`) mix of:
  - the share of player towers under fire (`hostileAttackers`, already computed for the badges);
  - hostile streams into player towers;
  - 1 − the player's share of all garrison units.
- **Stingers** (`won`, `lost`, capture gain) are quantised to the next beat (≤ 600 ms at 100 BPM). The win fanfare starts when the card settles (F9) while the bed ducks.
- **Costs:**
  - CPU: about 6–10 oscillator starts per beat, each ≤ 400 ms, well under 1 % on a mid phone.
  - Memory: the existing 1 s noise buffer is reused.
  - Bundle: the chunk is fetched on the first unlock with music on (`loadChunk`, retried with back-off like `recipes.ts`); eager change ≈ 0.25 kB for the bus graph and the setting, inside the 0.6 KiB headroom.
- **Rules it must keep:**
  - The page-hidden suspend covers music too.
  - Mute and Music off stop the scheduler, not just the gain.
  - Reduced motion is unaffected (audio).
  - Loudness is checked on the phone speaker and headphones against −18 LUFS ±2 (`audio-design` step 3), with true peaks at or below −1 dBTP via the limiter.

## 4. Five things that are good

1. **The capture chain is a textbook light-tier bundle, synced within one frame.**
   - Badge halo, roof wipe and flash ring on the first frame (+14…16 ms).
   - Chime at +1 ms.
   - 0.85 squash with backOut overshoot, 12 two-sided chips and 8 sparks.
   - A 6 px shake that decays quadratically on sines (not per-frame random), a light haptic, all back at rest by about 530 ms (`zoom-L02-capture.png`).
2. **The under-fire badge is readable by shape, not only colour.** Alert paper, attacker-coloured 3.5 px stroke and a crossed-swords pip appear 33 ms after the landing. It is legible at 360 px and holds in the colour-blind palette (`zoom-L05-underfire.png`).
3. **Effects are budgeted like an engine.** A shared landing token bucket (8 burst, 40 s⁻¹), a cap of 700 particles and ≤ 2 fills per particle. Solo bursts held a 17.2–17.4 ms mean and a 33 ms maximum frame interval in software-rendered headless at 360 × 640, even on the dense L17 board.
4. **Reduced motion is one switch, honoured everywhere.** The `prefersReducedMotion()` override is in the save, and nothing spawns under it. The result card appears at +40 ms with no slide or confetti; under-fire stays as a static tint and pip; marching holds a mid-stride pose (`L01-win-360x640-en-rm-sheet.png`).
5. **The audio plumbing is mobile-correct and costs nothing eager.**
   - The recipes are a lazy chunk warmed at init.
   - Unlock happens on the first gesture with the iOS silent-buffer trick, and the context is suspended when the page is hidden (MM-7).
   - Rate limits are set per sound.
   - The `send` pitch rises with the unit count.
   - `refuse` is built from harmonics a phone speaker can actually reproduce.

   Every fix in §2 / §3 fits into this structure without touching the eager budget.
