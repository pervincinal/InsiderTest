---
name: level-authoring
description: How to author, name, validate and playtest Tower Clash levels (tower-clash/src/levels/*.json). Load when adding or editing levels or changing the level schema.
---
# Level authoring

## Schema (`LevelDef` in `src/sim/types.ts`)
```jsonc
{
  "id": 7, "name": "Two Fronts", "lesson": "Hold the middle before expanding",
  "name_az": "İki Cəbhə", "name_ru": "Два фронта", "name_tr": "İki Cephe",          // I18N-2: optional, but
  "lesson_az": "…", "lesson_ru": "…", "lesson_tr": "…",                              // levels:check warns when missing
  "star3": 45000, "star2": 90000,            // ms
  "enemies": [{ "owner": "enemy1", "personality": "rusher", "aggression": 0.4 }],
  "towers": [
    { "id": "a", "x": 360, "y": 1100, "owner": "player", "units": 10, "level": 1, "kind": "barracks" },
    { "id": "b", "x": 360, "y": 640,  "owner": "neutral", "units": 8 },
    { "id": "c", "x": 360, "y": 180,  "owner": "enemy1",  "units": 10, "level": 1 }
  ],
  "obstacles": [                                                                     // rules v3 (GDD §2.0b): no roads —
    { "kind": "wall",  "points": [{ "x": 200, "y": 640 }, { "x": 520, "y": 640 }], "width": 28 }, // every clear straight line is a lane
    { "kind": "water", "points": [{ "x": 0, "y": 900 }, { "x": 300, "y": 900 }] },              // gap ≥ 60 px = a ford
    { "kind": "rock",  "points": [{ "x": 560, "y": 400 }] }                                     // 1 point = 80 px boulder
  ],
  "mines": [ { "x": 360, "y": 400, "charges": 5 } ]      // kills the first 5 weight on any lane within 30 px
}
```
`ai` (optional, LV-13 2026-11-06): `{ "opponentAwareness": true, "frontBiasS": { "rusher": 20, "opportunist": 10, "turtle": 5 } }` switches the AUD-A3 opponent-awareness prototype on for this level only (both keys optional, seconds 0..120, no other keys; the client, `playtest`, every gate and `reclock.ts` read it) — **no shipped level sets it** and `tests/ai/levelAi.test.ts` fails the day one does: set it only on the AI engineer's memo (`docs/reviews/2026-11-05-ai-engagement.md` §6), update that test and the backlog in the same change, and re-clock the level.
A lane joins two towers when their straight segment stays farther than `width / 2` from every obstacle segment (rock:
radius `width / 2`, default 40) and farther than 48 px from every third tower's centre — a tower in the way blocks the
line. Lanes are computed by `createState`; `scripts/lib/validateLevel.ts` reuses `src/sim/geometry.ts` so the check
and the game agree. There are no bridges, barriers or waypoints; a river is a `water` polyline with gaps where the
fords are; a "pay to pass" cost is a mine. Levels 1–4 have no obstacles; obstacles from 5, mines from 17.
Coordinates: 720×1280 logical, keep towers ≥ 90 px from edges and ≥ 150 px apart. **Drawn spacing (LV-20, ART-24 zoom):** every
pair must also be ≥ 2 × the larger zoomed plinth (`towerFootprintRadius × WORLD_ZOOM.tower` 1.3, authored kind/level)
+ 12 px — `MIN_TOWER_SPACING` L1/L2/L3: barracks 84.8/95.2/116, artillery 105.6/116/131.6, tank factory
100.4/110.8/131.6, fortress 126.4/131.6 px (error below it; it stays under the 150 px floor even fully upgraded, so in
practice it bites only if the zoom or the plinths grow) and the validator **warns** below 1.25 × it (fortress L1 158 px:
badges will have to move beside the tower). Campaign minimum (2026-10-15): level 3 home–west/east 152.1 px; tightest
against its footprint level 40 fort–guns 180 vs 126.4 px (× 1.42). A tower that stands so high that its badge cannot
sit above the roof (`topBadgeMinY`: barracks L1 y < 233, artillery 186, tank factory 215, fortress 225; taller roofs at
higher levels, barracks L3 306) gets its badge moved below / beside it (BUG-42) — **informational, not a warning**
(expected since ART-24; 18 shipped levels do it with their top keep): the `badge` column shows `below`, `beside?` (the
below spot is taken by a neighbour; the side depends on the badge width) or `-`, and a summary line counts the levels.
Keep a new top tower's moved badge clear of its neighbours. The `spacing` column is the per-level minimum centre distance. Streams under v3 never drain the source (each link emits at the tower's production rate: L1/L2/L3 = 1 / 1.43 / 2 units per s), so a level's difficulty is about *how many lanes* reach a tower and *how fast* the enemy grows — not about garrison sizes alone. Tower defaults: `level` 1, `kind` barracks, `units` 0.

Translations (`name_az/ru/tr`, `lesson_az/ru/tr`): same meaning as the English text, imperative and playful like
`src/ui/locales/*.ts`; each must be ≤ English length + 20 % (validator error) and unique per language. Names must fit
the HUD level chip (206 px at 24 px bold — about 15 Latin / 15 Cyrillic characters); the lesson banner wraps at 620 px
(3 lines at 20 px, then 5 lines at 18 px); the card rule is now a test — `e2e/lessonFit.spec.ts` (QA-32) lays out every
level's card in all four languages with the game's own `lessonCardLayout` and fails on the 18 px fallback, a 4th line or a
line past 620 px, and on a 20 px card that needs a 4th line when re-wrapped at 620 − 12 = 608 px with the game's `wrapText`
(`CARD_WRAP_MARGIN`, QA-33: other renderers measure a few px wider, CI's Chromium and iOS WebKit, and wrap as if narrower; the
table's `@608` column) — so a shipped lesson must fit 3 lines at 20 px, with room to spare. The UI reads them through `levelName()` / `levelLesson()` in `src/ui/i18n.ts`
(English fallback); the manifest carries the translated names, so run `npm run levels:manifest` after editing them.

## Naming & order
`NNN-kebab-name.json`; `src/levels/manifest.ts` lists them in play order and is generated — after adding, renaming or re-clocking a level run `npm run levels:manifest` (`npm run levels:check` fails while it is stale). Bands (GDD §3): 1–8 barracks only, 1 enemy, first wall at 5 · 9–16 fortress/artillery · 17–24 two enemies, mines · 25–32 tank factory, rivers with fords · 33–40 three enemies · 41–50 Grand Campaign (everything mixed, no new vocabulary).

## Gates before finishing
1. `npm run levels:check` — schema, spacing (150 px floor + drawn plinths, LV-20), connectivity (every tower reachable through clear lanes from the player's first tower), obstacles ≥ 75 px and mines ≥ 40 px from tower centres, ids unique, features allowed in the band; `npx tsx scripts/convertLevelsV3.ts --dry` documents the 2026-09-21 road → obstacle conversion.
2. `npm run playtest` — reference player must win every level within 180 s; the "idle" player must lose or stall (never win). Fix the level, not the bot.
2b. Clocks: `npx tsx scripts/reclock.ts --seeds 20 [--only a-b] --write` derives `star3`/`star2` from the reference player (GDD §3 formula + max-upgrade boundary step; levels 1 and 33 are pinned and only reported), then `npm run levels:manifest`. `star2` is floored at the slower of the naive line's two tie orders (`asc`, `tie desc`) rounded up to 5 s — 1–16 always, past 16 on daily-pool levels whose two medians differ by > 5 s (AUD-B10); the rule is defined at K = 20, so `--write` only at `--seeds 20` (a lower K warns the floors are provisional). A floor that would raise today's `star2` with an `asc` / `desc` 2★ gap under 8 of 20 is listed (`floor would be N — not applied`) and the clock held. Read the dry run before `--write`: it may list `CHANGED` rows that are reference-player drift, not a decision. Run it after any bot change too.
2c. First-time line: `npm run playtest -- --naive --seeds 5` (and `--react 8000`) — levels 1–8 ≥ 4/5 at 4 s and ≥ 3/5 at 8 s, 9–16 ≥ 3/5; before laying out any level with a rusher, apply GDD §3 "Authoring for the first-time line (rules v3)" (the rusher horizon `30 × (0.5 + 0.5 a)` s, fall time `1 + d/120 + N`, tower-in-the-way, home pocket, the contested-first-tap parity trap).
3. Each level's `lesson` must be new or a harder variant of a previous lesson.

## Difficulty-list finding (after the human playtest)
LV-12 (2026-11-18). Sheet `docs/reviews/2026-11-05-human-playtest-sheet.md` §C.1 "Sampled, no valid win" (QA-42-3,
ruled 2026-11-16): a level a tester played but never validly won is **held** (clocks stay) and comes to you. Start the
day the sheet comes back.

**Input.** The decide markdown's `Difficulty list (C.1 sampled-lost → Level Designer finding; clocks stay):` line, one
entry per tester and level — `<level> <tester> <tries> (<L>, <R>), not won` or `… won only with boosters /
REINFORCEMENTS`, ` (k of N not won)` appended at N ≥ 2 testers — and the level's C.1 row: `L` (only L / R tries; a
retreat is a loss) or `X` (won, no win valid under C.0; listed only when every win used help, a ×2-only `X` is no
signal). Read it against §B.2's naive-line columns for the level.

**Triage, in order.**
1. *Must it stay?* `docs/reviews/2026-10-29-audit-summary.md` "What must not be fixed": the lesson card's winning first
   move (literal-follower proof, `--follow`), the `star2` floor at the first-time median on 1–16, no level needs an
   upgrade, free retries; and 23 / 32 are GD-2 learning levels (GDD §3 item 9, own lever order). A fix may break none.
2. *Is the naive line already short?* `npm run playtest -- --naive --level <id> --seeds 20 --tie both` (4 s; add
   `--gate <id>-<id>` on 1–16 only, the gate refuses past 16 — read the wins column there; `--react 8000` for slower
   hands). Under 20/20 in either tie order: a known gap, the finding is a level item. 20/20 both: the replay decides.
3. *What did the tester do?* Their COPY LOG `#replay <row> {…}` line → `npx tsx scripts/replay.ts --from-log <log.txt>
   --row N --out <file.json>`, watched in the browser. **Wrong first move** (a tower the card does not name, the
   contested-first-tap parity trap): a card / readability finding, not layout. **Stalemate** (alive at 180 s, then a
   retreat): no lane reaches the enemy home fast enough or it out-grows the player — check lanes and growth.
   **Lost a tower early** (before the naive line's first enemy ribbon lands): fall time `1 + d/120 + N` too short —
   GDD §3 "Authoring for the first-time line" (rusher horizon, home pocket, tower-in-the-way).

**Responses, in order of preference.**
- **(a) Nothing.** One tester, naive 20/20 from both first taps, a designed difficulty step (band entry, new
  vocabulary). Write the finding with its evidence; post-launch GD-12 attempts-to-first-clear or item 9's completion
  drop (> 15 % against its neighbours) reopens it.
- **(b) Tower-only re-lay, as LV-1.0.1a / AUD-Q13** (13 `outpost` 3 → 6 u; 32 `factory` 10 → 14 u, `red` / `green`
  14 → 12 u): tower units / level / position only; owners, cards (`lesson*`), `star3` / `star2` unchanged; on 23 / 32
  item 9's lever (a 3–4 u pocket neutral reachable only from home, never an L2 start). Gates: naive `--seeds 20 --tie
  both` 20/20 in both orders where it applies (else ≥ before and ≥ the band's share); reference player unchanged
  (`npm run playtest -- --seeds 20`, 20/20, median ± 5 %; idle still loses or stalls); `npm run levels:check`; every
  twist `npm run playtest -- --twist <plain|lean|fastFeet|thinWalls|reinforced> --seeds 50 --pool <id>-<id>` 50/50;
  `npm run playtest -- --tier-gate --seeds 5` 0 failed; `npx tsx scripts/reclock.ts --seeds 20 --only <id>-<id>`
  dry run with no `CHANGED` row and `tests/scripts/reclock.test.ts` green; then the full `npm run playtest`. Every
  other level's rows byte-identical.
- **(c) Card or clock change.** Only with the Game Designer, after launch, on GD-12 / item 9 data — never before the
  stakeholder's playtest decisions (AUD-B4 / B5).

**Never.** No clock loosened because of a loss (QA-42-3: a looser `star3` helps only a player who already wins; who
never won never saw 1★, so the clock was not in the way). No enemy AI change for one level (`LevelDef.ai` exists, no
shipped level sets it by design; `tests/ai/levelAi.test.ts`). No level inserted, reordered or skipped.

**Output.** `docs/reviews/<YYYY-MM-DD>-difficulty-<id>.md`: the input line verbatim; triage 1–3 with commands and rows
quoted (naive `asc` / `desc` w/20 + median, reference, idle, the replay row and second of the decisive event); the
response and why the earlier ones do not fit; the gates for (b). Backlog, one line per level:
`- [x] LV-DIFF-<id> (<date>, level-designer; sheet <date>: <tester> <tries> (<L>, <R>)) <name> — done <date>: <(a) nothing | (b) <tower> <u> → <u> u | (c) to game-designer>; naive asc/desc <w>/20 → <w>/20, reference <s> → <s> s, clocks unchanged; docs/reviews/<date>-difficulty-<id>.md.`
