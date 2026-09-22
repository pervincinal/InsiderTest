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
A lane joins two towers when their straight segment stays farther than `width / 2` from every obstacle segment (rock:
radius `width / 2`, default 40) and farther than 48 px from every third tower's centre — a tower in the way blocks the
line. Lanes are computed by `createState`; `scripts/lib/validateLevel.ts` reuses `src/sim/geometry.ts` so the check
and the game agree. There are no bridges, barriers or waypoints; a river is a `water` polyline with gaps where the
fords are; a "pay to pass" cost is a mine. Levels 1–4 have no obstacles; obstacles from 5, mines from 17.
Coordinates: 720×1280 logical, keep towers ≥ 90 px from edges and ≥ 150 px apart. Streams under v3 never drain the source (each link emits at the tower's production rate: L1/L2/L3 = 1 / 1.43 / 2 units per s), so a level's difficulty is about *how many lanes* reach a tower and *how fast* the enemy grows — not about garrison sizes alone. Tower defaults: `level` 1, `kind` barracks, `units` 0.

Translations (`name_az/ru/tr`, `lesson_az/ru/tr`): same meaning as the English text, imperative and playful like
`src/ui/locales/*.ts`; each must be ≤ English length + 20 % (validator error) and unique per language. Names must fit
the HUD level chip (206 px at 24 px bold — about 15 Latin / 15 Cyrillic characters); the lesson banner wraps at 620 px
(3 lines at 20 px, then 5 lines at 18 px). The UI reads them through `levelName()` / `levelLesson()` in `src/ui/i18n.ts`
(English fallback); the manifest carries the translated names, so run `npm run levels:manifest` after editing them.

## Naming & order
`NNN-kebab-name.json`; `src/levels/manifest.ts` lists them in play order and is generated — after adding, renaming or re-clocking a level run `npm run levels:manifest` (`npm run levels:check` fails while it is stale). Bands (GDD §3): 1–8 barracks only, 1 enemy, first wall at 5 · 9–16 fortress/artillery · 17–24 two enemies, mines · 25–32 tank factory, rivers with fords · 33–40 three enemies · 41–50 Grand Campaign (everything mixed, no new vocabulary).

## Gates before finishing
1. `npm run levels:check` — schema, connectivity (every tower reachable through clear lanes from the player's first tower), obstacles ≥ 75 px and mines ≥ 40 px from tower centres, ids unique, features allowed in the band; `npx tsx scripts/convertLevelsV3.ts --dry` documents the 2026-09-21 road → obstacle conversion.
2. `npm run playtest` — reference player must win every level within 180 s; the "idle" player must lose or stall (never win). Fix the level, not the bot.
2b. Clocks: `npx tsx scripts/reclock.ts --seeds 20 [--only a-b] --write` derives `star3`/`star2` from the reference player (GDD §3 formula + max-upgrade boundary step; levels 1 and 33 are pinned and only reported), then `npm run levels:manifest`. Run it after any bot change too.
3. Each level's `lesson` must be new or a harder variant of a previous lesson.
