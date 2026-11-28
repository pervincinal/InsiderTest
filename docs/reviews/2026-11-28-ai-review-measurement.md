# REV-0l — AI module review (REV-75…82): implementation, measurement, classification

Day 71, 2026-11-28 — AI Engineer. Scope: `tower-clash/src/ai/**`, `tests/ai/**`. Protocol: the sim's REV-28 protocol under the
stakeholder's standing rule (no AI / clock / level retune before the human playtest; the deterministic fixtures and the gate
results are the contract). Every finding was implemented, given a unit test that fails on the old code, and measured; only the
provably outcome-neutral fixes stay in the tree, the rest are packaged as reviewed patches under `docs/reviews/patches/` for the
Game Designer to adopt after the playtest.

## 1. Result in one table

| Finding | Verdict | Cumulative 300-run delta (vs previous step) | Isolated on the final tree (vs baseline) | Classification | Where |
|---|---|---|---|---|---|
| REV-75 landing owner by `remainingMs` tie | bug (sim probe) | 0 hash diffs (measured on top of 79 + 81, which hid the tie) | **1 hash diff**: lvl 42 seed 3 idle (hash only; 0 flips, 0 win-time, 0 clash) | NON-NEUTRAL | patch `2026-11-28-rev0l-REV-75.patch` |
| REV-76 one walker erases a column | bug (sim probe) | 96 hash diffs, 3 flips (idle playing → lost on 37/38/47 s3, undoing REV-79's), 27 win-time, +744 clash | with 75: **68 hash diffs**, 0 flips, 25 win-time (10 faster / 15 slower, −19.1 … +14.4 s), +106 clash | NON-NEUTRAL | patch `…-REV-76.patch` (needs 75) |
| REV-77 reverse stream sweeps what it cannot meet | bug (sim probe) | 19 hash diffs, 0 flips, 2 win-time (−0.8 / +1.2 s), −197 clash | with 75 + 81 + 76: **77 hash diffs**, 0 flips, 28 win-time (12 / 16, −19.1 … +14.5 s), +226 clash (= +9 diffs, +3 win-time over 75 + 81 + 76) | NON-NEUTRAL | patch `…-REV-77.patch` (needs 75, 81, 76) |
| REV-78 Freeze tears down every stream | bug (unlink during Freeze, probe) | **0 hash diffs** (no bot casts Freeze — the plain dump is blind to it) | plain dump **0**; Freeze probe (two Freezes per match): **119 hash diffs**, 0 flips, **80 win-time changes** (40 faster / 40 slower, −19.4 … +12.5 s), +199 clash | contract-neutral, player-facing NON-NEUTRAL → packaged | patch `…-REV-78.patch` |
| REV-79 `siegeOf` `linked` ignores `exclude` | bug (model vs sim probe) | **161 hash diffs, 4 flips** (idle lost → playing on 37 s3, 38 s3, 39 s2, 47 s3), 66 win-time (30 / 36, −27.1 … +16.4 s), −1000 clash; breaks 2 existing tests | same (first step) | NON-NEUTRAL | patch `…-REV-79.patch` |
| REV-80 `commit` bars any ended hold | bug per the comment | 0 hash diffs | **0 hash diffs**; every gate table identical | NEUTRAL | **in tree** (`memory.ts`, `tactics.ts`, `personalities.ts`, `tests/ai/rev80.test.ts`) |
| REV-81 mine burn uses the raw weight | partial model improvement (sim probe, §3.7) | 1 hash diff: lvl 50 seed 3 ref 61.8 → 69.8 s (on top of 79) | **0 hash diffs** on the 300-run dump, but **not table-identical on the gates**: naive lvl 45 median 75.3 → 75.9 s, weekly 2027-02-08 lvl 35 lean fixed seed 38.4 → 36.4 s, lean twist 217 264 → 217 296 ticks (all still passing) | NON-NEUTRAL (REV-28 standard: identical tables) | patch `…-REV-81.patch` |
| REV-82 duplicate constants | nit, confirmed | 0 hash diffs | 0 | NEUTRAL (by construction) | **in tree** (`referencePlayer.ts`, `tests/ai/rev82.test.ts`) |

Final tree = shipped tree + REV-82 + REV-80. Proof (§5): 300-run dump 0 hash diffs / 0 flips / 0 win-time / clash deaths
20 529 → 20 529; the three chain gates' summary lines identical to the baseline (447 614 ticks, 0 failed; naive 0 failed; tier
0/12) and every gate table identical to the baseline except the tier rows' seconds column; `npm run check` green (2881 tests).

## 2. Baseline (untouched tree, before any edit)

Commands exactly as `scripts/producer/chain.sh` lines 20–22 and `.github/workflows/tower-clash-ci.yml` run them (from `tower-clash/`):

```
npm run playtest -- --seeds 3
npm run playtest -- --naive --seeds 5 --gate 1-16 --tie both
npm run playtest -- --tier-gate --seeds 5
npm run playtest -- --daily 2026-11-28 --days 90 --seeds 3
npm run playtest -- --weekly 2026-11-23 --weeks 26 --seeds 5
npm run playtest -- --twist {plain,lean,fastFeet,thinWalls,reinforced} --seeds 5
```

Summary lines:

```
pt      50 level(s) x 3 seed(s), 0 failed gate(s). perf: 447614 ticks
naive   naive: 50/50 levels won at >= 50 %, 32 within star2 (react 4000 ms, all seeds 249/250)
        naive tie desc: 50/50 levels won at >= 50 %, 30 within star2 (react 4000 ms, all seeds 248/250)
        naive gate lvl 1-16: 0 failed level(s) (asc 0, tie desc 0)
tier    tier gate lvl 1-16: 0/12 tier(s) failed (0 level row(s))
daily   0 failed day(s). perf: 238437 ticks
weekly  0 failed week(s). perf: 134761 ticks
twist   plain 0 failed level(s) 182758 ticks | lean 0 failed 217264 | fastFeet 0 failed 169505 | thinWalls 0 failed 182615 | reinforced 0 failed 183516
dump    300 runs (50 levels × seeds 1–3 × {reference player, idle player}): reference 150/150 won, clash deaths 20 529
```

The 300-run dump (§7, a scratchpad tsx script mirroring `runHeadless` tick for tick and reading `unitDied/clash` events after every
step) records per run the final `hashState`, outcome, end time and clash deaths. It reproduced byte-identically on a second run
before any edit. Comparison metrics: hash diffs, outcome flips (won ↔ lost ↔ playing), win-time changes > 0.5 s, clash-death delta.
The clash-death total is the same 20 529 REV-28 measured on 2026-11-23.

## 3. Per finding

Each fix was implemented one at a time in the order 82, 79, 81, 75, 76, 77, 78, 80 (cumulative tree), its test run against the
code before the fix (fails) and after (passes), then the 300-run dump re-run and compared with the previous step. After all eight
the full gate set was run once (§4). Isolated numbers were then taken on the final tree (shipped + 82 + 80) from scratch copies of
`src/` with one patch (or the minimal dependent set) applied — these are the numbers a designer adopting one patch should expect.

### 3.1 REV-75 (important) — a walking landing's owner recovered by equal `remainingMs`

Verdict: bug. Probe (`tests/ai/rev75.test.ts`): p (player) and e (enemy1) each 300 px from a neutral n at 1 unit, both link on the
same tick; at 1.5 s the two columns tie exactly. The sim lands them in unit order — the player's unit empties the garrison and the
enemy's flips it (`n` → enemy1) — while the old `contestOf` named the player (both landings were credited to the first unit found
with that `remainingMs`); the mirror case (enemy links first) fails the same way.
Fix: `walkingLandings` returns `owner` and `id` with every landing (`WalkingLanding`); `landingReplay` uses them and orders equal
times by unit id — spawn order, which is the sim's landing order. Tests: `REV-75: walking landings carry their owner; exact ties
replay in spawn order` (3 cases; 3 fail on the old code).
Numbers: cumulative 0 hash diffs — on top of REV-79/81 the tie never formed; isolated on the final tree **1 hash diff**: level 42
seed 3 with the idle player (two enemies' columns tie on that symmetric map), hash only — no outcome, win-time or clash change.
Recommendation: adopt after the playtest. It changes nothing a human would notice today except on exact symmetric ties
between two rivals (where the old model backed the wrong side); the one moved run is an idle-player match that ends
`playing` either way. Independent of the other patches (applies alone).

### 3.2 REV-76 (important) — one opposing walker cancelled a whole column

Verdict: bug. Probe (`tests/ai/rev76.test.ts`): p streams at e for 3 s (three units walking), e sends exactly one unit back and both
lanes go quiet. Sim: one clash kills one unit and the walker, 2 of 3 land. Old model: 0 landings (each inbound unit was charged the
full opposing weight). Fix: per lane the opposing walkers carry a remaining weight that the inbound units consume 1:1 nearest to
the target first (a heavier unit walks on with the difference — the sim's clash). Tests: `REV-76: opposing walkers are consumed one
for one, not charged against every inbound unit` (2; both fail on the old code).
Numbers: cumulative 96 hash diffs / 3 flips (idle playing → lost on 37 s3, 38 s3, 47 s3 — reverting REV-79's flips) / 27 win-time /
+744 clash deaths; isolated with REV-75 (its `owner`/`id` fields are required to typecheck): 68 hash diffs, 0 flips, 25 win-time
changes (10 faster, 15 slower, −19.1 … +14.4 s), +106 clash deaths.
Recommendation: a real accuracy fix — the bots (reference player and enemies alike) stop reading a hostile column as erased by
one unit, so they reinforce / shield more and pour fewer units into lanes already lost; no level flips, but 25 of 150 reference
win times move in both directions, so expect star-clock medians to shift on the levels listed in the dump diff (mainly 17–50).
Adopt with REV-75 after the playtest and re-run `reclock` before touching any clock.

### 3.3 REV-77 (important) — a reverse link swept walkers it could never meet

Verdict: bug. Probe (`tests/ai/rev77.test.ts`): five units 0.45 / 1.45 / 2.45 / 3.45 / 4.45 s from landing; a fresh shield's first
unit leaves at 1.0 s. Sim: one lands, four clash. Old model: all five swept — also when the reverse source held 0.5 units
(emits nothing) or was frozen. Fix: the reverse stream's units are counted as they leave (emit phase, then one per interval —
`emitPhaseMs`, shared with `laneFlow`) and consumed 1:1 by the walkers they can still meet, nearest first; nothing is swept by a
stream whose first unit leaves after the walker lands or that emits nothing. Tests: `REV-77: a stream back sweeps only the walkers
its units can still meet` (4; 3 fail on the old code).
Numbers: cumulative 19 hash diffs / 0 flips / 2 win-time (31 s3 −0.8 s, 38 s2 +1.2 s) / −197 clash; isolated on top of
75 + 81 + 76: 77 hash diffs, 0 flips, 28 win-time (12 / 16, −19.1 … +14.5 s) — i.e. +9 hash diffs and +3 win-time changes over
75 + 81 + 76 alone. Needs REV-75, REV-81 and REV-76 (textual and semantic dependency: it replaces the sweep inside REV-76's
consumption loop and refactors the phase line REV-81 touched).
Recommendation: adopt together with 76 (same function, same model); its own footprint is small (9 runs). A planner's anticipated
shield (`onAdd` reactions) no longer erases a column that lands before the shield's first unit leaves, so the reference player
commits to a few more captures that it used to read as hopeless.

### 3.4 REV-78 (important) — Freeze ended every enemy stream instead of pausing it

Verdict: bug. Probe (`tests/ai/rev78.test.ts`): a rusher's attack stream at 4.5 s, player Freeze; on the 5.0 s tick the old
`maintain` issues `unlink` (flow undefined → "not landing"); through a whole Freeze the rusher issued an unlink on the first tick
and re-planned afterwards. Fix: `maintain` skips the landing / contest / retreat / hopeless judgements of attack streams while
`isFrozen(state, ctx.owner)` (supply lines and the upgrade break are judged as before); the tick after the freeze lifts the normal
rule resumes (the test shows the hopeless attack then ends). Tests: `REV-78: maintain keeps a frozen owner's streams (Freeze pauses
them, it does not end them)` (2; both fail on the old code).
Numbers: plain 300-run dump **0 hash diffs** — by construction: neither the reference player nor the idle player casts a
booster, so the contract gates cannot see this fix. Freeze probe (the dump with the reference player casting Freeze at 15 s and
45 s; final tree vs final tree + 78): **119 hash diffs, 0 outcome flips, 80 win-time changes** (40 faster, 40 slower, −19.4 …
+12.5 s), +199 clash deaths. Slower by more than 5 s: level 5 (seed 1 +8.0 s, seed 2 +12.5 s), 31 (+7.3), 36 (+5.8, +9.2),
37 (+9.3), 39 (+5.5), 41 (+8.5), 42 (+9.2), 43 (+9.6), 45 (+7.6). Faster by more than 5 s: 27 (−5.6, −7.6), 30 (−5.5), 32 (−19.4),
37 (−13.2), 40 (−6.3), 41 (−10.1), 45 (−13.6), 50 (−13.9, −13.3). 15 of the 80 moves are on levels 1–16.
Classification: by the letter of the protocol (300-run dump identical, tests pass) this is neutral; by what the fix is about it is
not — every human who buys Freeze or takes a Continue (which grants a 5 s Freeze) meets a different enemy. Under the standing rule
it is packaged, not adopted: `2026-11-28-rev0l-REV-78.patch`, applies alone, gate-neutral (the cumulative gate run in §4 includes it).
Recommendation: this is the GDD's Freeze ("pauses the streams") — today's Freeze is stronger than designed, because the enemy
also loses its plan and 6–8 s of re-planning. Adopting it makes Freeze and Continue weaker: levels whose clocks were tuned with
the stronger Freeze get harder for a human leaning on it (level 5 is the one in the tutorial band that moved: +8 / +12.5 s with
two Freezes), while on the hard levels the enemy's uninterrupted streams sometimes end the match sooner for the player too
(32, 50, 45). Decide after the human playtest shows how often Freeze is used; if adopted, re-measure the human-clock sheet
(§C) rows that used a Continue.

### 3.5 REV-79 (pre-existing) — `siegeOf` read "linked" from the map, ignoring `exclude`

Verdict: bug. Probe (`tests/ai/rev79.test.ts`): e streams elsewhere (grows nothing); `siegeOf(e, { planned: p→e, exclude: [e→x] })`
read 16 000 ms (as if still linked) where the model without the link gives 22 000 ms and the sim flips e at 20 950 ms (one landing
off — the known tick-early arrival / recruit precision). Fix: `linked = all.some((l) => l.from === target.id)` on the model's own
link set (`allLinks(state, options)`); the now-unused `planned` local and `isLinked` import go. Tests: `REV-79: siegeOf honours
exclude when it decides whether the target regenerates` (2; both fail on the old code).
Numbers (first step, so cumulative = isolated): **161 hash diffs, 4 outcome flips — idle player lost → playing on levels 37 s3,
38 s3, 39 s2, 47 s3 (the enemies no longer take the idle home within 180 s), 66 win-time changes (30 faster / 36 slower, −27.1 …
+16.4 s), clash deaths 20 529 → 19 529.** It also breaks two existing tests in `tests/ai/standoffRelease.test.ts`: "on release the
tower resumes its normal attack choice on another lane" and the AUD-A12 engagement regression ("level 37 with the idle player, 5
seeds — the enemies take the home on every seed, median before 120 s").
Recommendation: the fix is right — "what if this link were gone" must see the target regenerating — but it removes a bias toward
"falls" that today makes the enemies more decisive: with it they judge more attacks hopeless, reclaim fewer links for attacks and
break for upgrades less, and the idle player survives on four runs that today end `lost`. That is AUD-A12's engagement question
reopened, so adopt only together with a look at the enemies' horizons (or the front bias of AUD-A3) and update the two tests
with the new measurements. Applies alone.

### 3.6 REV-80 (nit) — `commit` barred any ended hold at the limit

Verdict: bug per the documented intent (the comment says a hold ended by the upgrade break or a retreat is not barred). Probe
(`tests/ai/rev80.test.ts`): a 20 s standoff whose source is at capacity below L3 — `maintain` ends the hold under the upgrade
break (`ctx.used` has the tower) and the old `commit` barred the lane anyway. Fix: `Ctx.released` records the holds the release rule
ended (`maintain`), `commit(memory, state, ended, released)` bars only those; a hold ended otherwise just loses its timer. Tests:
`REV-80: only a link the release rule ended bars its lane` (3; all fail on the old code).
Numbers: cumulative 0 hash diffs; isolated 0 hash diffs; every gate table identical (§5). NEUTRAL — in the tree.
Why neutral: on the shipped levels a hold at the 20 s limit is ended by the release rule itself; the upgrade-break case needs a
tower at capacity holding a silent standoff for 20 s, which no shipped seed produces. The fix matters when it happens (a lane barred
for nothing until a landing).

### 3.7 REV-81 (nit) — mine burn time from the raw weight

Verdict: partial model improvement, not a clear-cut bug. Sim probe (p vs e over a 4-charge mine, both streaming): with the mine on
the attacker's half (near source or mid-lane) the surplus rule predicts the first landing far better — L3 vs L1 mid-lane: sim
11.95 s, raw rule 7.5 s, surplus rule 9.5 s; L2 vs L1: sim 16.85 s, raw 8.5 s, surplus 15.0 s; L1 vs L1: sim never lands, raw rule
10.0 s with rate 0, surplus rule `undefined`. With the mine on the defender's half the *reverse* stream's units burn it first and
the sim lands at the plain travel time (5.95 s) — neither rule is right and the raw rule is closer (7.5 vs 9.5 s). Fix as reviewed:
burn time = charges ÷ surplus weight; `undefined` when the surplus is 0 and the lane is mined. Tests: `REV-81: the mine burn time
counts the surplus after the lane clash, not the raw stream` (3; 2 fail on the old code).
Numbers: cumulative (on top of REV-79) 1 hash diff — level 50 seed 3 reference 61.8 → 69.8 s; isolated on the final tree **0 hash
diffs** on the 300-run dump, but the full gate set on final + 81 is not table-identical: naive level 45 median 75.3 → 75.9 s, weekly
2027-02-08 level 35 (lean) fixed seed 38.4 → 36.4 s, lean twist 217 264 → 217 296 ticks (summary lines unchanged, every gate green).
Classification: NON-NEUTRAL by the REV-28 standard (identical tables), packaged. Applies alone.
Recommendation: adopt together with 76/77 when the threat model is next retuned — alone it moves one naive median and one weekly
fixed seed by ~2 s; its value is on mined lanes with a stream back (levels 17, 20, 35, 45), where today's model under-estimates the
mine delay by up to 6 s and makes the bot commit to captures that land late.

### 3.8 REV-82 (nit) — `HOPELESS_MS` / `COUNTER_PLAN_MS` declared twice

Verdict: confirmed. Fix: `referencePlayer.ts` imports both from `./personalities` and re-exports them (its callers and
`tests/ai/referencePlayer.test.ts` keep importing from it). Test: `REV-82: the reference player shares HOPELESS_MS /
COUNTER_PLAN_MS with the personalities` (source-text check; fails on the old code). Numbers: 0 hash diffs. NEUTRAL — in the tree.

## 4. Full gate set with all eight fixes (cumulative tree, before classification)

Every gate stayed green, with different ticks and medians:

```
pt      50 level(s) x 3 seed(s), 0 failed gate(s). perf: 447320 ticks            (baseline 447614; 26 level rows changed)
naive   naive: 50/50 levels won at >= 50 %, 31 within star2 (react 4000 ms, all seeds 249/250)      (baseline 32 within star2)
        naive tie desc: 50/50 levels won at >= 50 %, 30 within star2 (react 4000 ms, all seeds 247/250)   (baseline 248/250)
        naive gate lvl 1-16: 0 failed level(s) (asc 0, tie desc 0)
tier    tier gate lvl 1-16: 0/12 tier(s) failed (0 level row(s))
daily   0 failed day(s). perf: 240423 ticks                                         (baseline 238437)
weekly  0 failed week(s). perf: 131643 ticks                                        (baseline 134761)
twist   plain 0 failed 183231 ticks | lean 0 failed 213761 | fastFeet 0 failed 167850 | thinWalls 0 failed 183172 | reinforced 0 failed 182810
dump    300 runs: reference 150/150 won, clash deaths 20136 (baseline 20529)
check   tsc + lint green; tests/ai 233 passed, 2 failed (the two standoffRelease tests REV-79 breaks)
```

## 5. Final tree and its proof

Tree: shipped `src/ai/**` + REV-82 (`referencePlayer.ts`) + REV-80 (`tactics.ts`, `memory.ts`, `personalities.ts`) +
`tests/ai/rev80.test.ts`, `tests/ai/rev82.test.ts`. `common.ts`, `headless.ts`, `index.ts`, `playerMemory.ts` byte-identical to
the shipped files.

```
dump    300 runs: 0 hash diffs, 0 outcome flips, 0 win-time changes > 0.5 s, clash deaths 20529 -> 20529 (run twice, identical)
pt      50 level(s) x 3 seed(s), 0 failed gate(s). perf: 447614 ticks          table identical to baseline
naive   naive: 50/50 levels won at >= 50 %, 32 within star2 (react 4000 ms, all seeds 249/250)
        naive tie desc: 50/50 levels won at >= 50 %, 30 within star2 (react 4000 ms, all seeds 248/250)
        naive gate lvl 1-16: 0 failed level(s) (asc 0, tie desc 0)            table identical to baseline
tier    tier gate lvl 1-16: 0/12 tier(s) failed (0 level row(s))              table identical except the per-row seconds column
daily   0 failed day(s). perf: 238437 ticks                                     identical
weekly  0 failed week(s). perf: 134761 ticks                                    identical
twist   plain 182758 | lean 217264 | fastFeet 169505 | thinWalls 182615 | reinforced 183516 ticks, 0 failed each   identical
check   npm run check: Test Files 236 passed, Tests 2881 passed, 50 level(s) valid, exit 0
```

(With REV-81 added the three chain summary lines are still identical and check is green — 2884 tests — but the naive, weekly and
lean tables move as described in §3.7; that is why it is a patch and not in the tree.)

## 6. Patches for the Game Designer

`docs/reviews/patches/2026-11-28-rev0l-REV-<id>.patch`, git-style (`a/` `b/` paths from the repository root, new test files as
`/dev/null` creations). Generated against the final tree in the order below; applying the whole series in order reproduces the
cumulative tree of §4 byte-for-byte (verified with `git apply` in a scratch repository).

| Order | Patch | Applies alone on the final tree | Needs |
|---|---|---|---|
| 1 | `2026-11-28-rev0l-REV-75.patch` | yes | — |
| 2 | `2026-11-28-rev0l-REV-79.patch` | yes | — (update the two `standoffRelease.test.ts` expectations) |
| 3 | `2026-11-28-rev0l-REV-81.patch` | yes | — |
| 4 | `2026-11-28-rev0l-REV-76.patch` | textually yes, but needs REV-75's `owner` / `id` fields to typecheck | 75 |
| 5 | `2026-11-28-rev0l-REV-77.patch` | no | 75, 81, 76 |
| 6 | `2026-11-28-rev0l-REV-78.patch` | yes | — |

Apply from the repository root: `git apply docs/reviews/patches/2026-11-28-rev0l-REV-75.patch` (etc., in order); then
`cd tower-clash && npm run check && npm run playtest` and the 300-run dump (§7) against a baseline taken before applying.

## 7. Re-running the measurement

From `tower-clash/`: the six gate commands of §2, and the 300-run dump — a tsx script (ESM, `.mts`) that mirrors `runHeadless`
and counts clash deaths; `FREEZE_AT=15000,45000` adds the Freeze probe (the reference player casts Freeze at those AI ticks):

```ts
// dump.mts — npx tsx dump.mts out.txt ; compare two outputs line by line (hash, outcome, timeMs, clash deaths)
import { writeFileSync } from 'node:fs';
import { loadAllLevels } from '<repo>/tower-clash/src/levels/index';
import { C, DEFAULT_MODIFIERS, applyCommand, createState, getOutcome, step } from '<repo>/tower-clash/src/sim/index';
import { hashState } from '<repo>/tower-clash/src/sim/replay';
import { referencePlayerCommands, rngsFor, runAiTick, isAiTick } from '<repo>/tower-clash/src/ai/index';
import { HEADLESS_MAX_MS } from '<repo>/tower-clash/src/ai/headless';
const FREEZE_AT = (process.env.FREEZE_AT ?? '').split(',').filter(Boolean).map(Number);
function run(level, seed: number, withPlayer: boolean) {
  const state = createState(level, seed, DEFAULT_MODIFIERS);
  const rngs = rngsFor(seed, level.enemies);
  let outcome = getOutcome(state), clash = 0;
  while (outcome === 'playing' && state.time < HEADLESS_MAX_MS) {
    if (isAiTick(state)) {
      const playerCmds = withPlayer ? referencePlayerCommands(state, rngs.player) : [];
      if (withPlayer && FREEZE_AT.includes(state.time)) playerCmds.push({ type: 'booster', owner: 'player', booster: 'freeze' });
      const enemyCmds = runAiTick(state, rngs.enemies, undefined, level.ai);
      for (const cmd of playerCmds) applyCommand(state, cmd);
      for (const cmd of enemyCmds) applyCommand(state, cmd);
    }
    step(state, C.TICK_MS);
    for (const ev of state.events) if (ev.type === 'unitDied' && ev.cause === 'clash') clash++;
    outcome = getOutcome(state);
  }
  return { outcome, timeMs: state.time, hash: hashState(state), clash };
}
const lines: string[] = [];
for (const level of (await loadAllLevels()).sort((a, b) => a.id - b.id))
  for (const seed of [1, 2, 3]) for (const bot of ['ref', 'idle'] as const) {
    const r = run(level, seed, bot === 'ref');
    lines.push(`${level.id} ${seed} ${bot} ${r.outcome} ${r.timeMs} ${r.hash} ${r.clash}`);
  }
writeFileSync(process.argv[2]!, lines.join('\n') + '\n');
```

A copy of the script, the comparison script, every dump (`00-baseline` … `12-final`, `iso-*`, `F-freeze`, `F78-freeze`), every
gate output (`baseline/`, `cumulative/`, `final-gates/`, `final2-gates/`) and the per-step source snapshots are in this session's
scratchpad under `rev0l/` (ephemeral).

## 8. Notes

- Cumulative vs isolated: REV-75 read neutral on top of REV-79/81 and non-neutral alone; REV-81 the other way round. The
  final-tree dump is the proof that counts; the per-patch isolated numbers above are the ones to expect when adopting one patch.
- The working tree carried other agents' uncommitted changes outside `src/ai` during this work (audio, render, ui,
  `levels/index.ts`, several tests); they were not touched and did not influence the measurements (the final dump equals the
  baseline hash for hash).
- Nothing was committed.
