---
name: level-authoring
description: How to author, name, validate and playtest Tower Clash levels (tower-clash/src/levels/*.json). Load when adding or editing levels or changing the level schema.
---
# Level authoring

## Schema (`LevelDef` in `src/sim/types.ts`)
```jsonc
{
  "id": 7, "name": "Two Fronts", "lesson": "Hold the middle before expanding",
  "star3": 45000, "star2": 90000,            // ms
  "enemies": [{ "owner": "enemy1", "personality": "rusher", "aggression": 0.4 }],
  "towers": [
    { "id": "a", "x": 360, "y": 1100, "owner": "player", "units": 10, "level": 1, "kind": "barracks" },
    { "id": "b", "x": 360, "y": 640,  "owner": "neutral", "units": 8 },
    { "id": "c", "x": 360, "y": 180,  "owner": "enemy1",  "units": 10, "level": 1 }
  ],
  "roads": [
    { "a": "a", "b": "b" },
    { "a": "b", "b": "c", "kind": "bridge" },
    { "a": "a", "b": "c", "mine": 5 },                 // kills first 5 weight
    { "a": "b", "b": "d", "barrier": 12 }              // 12 hp to break through
  ]
}
```
Coordinates: 720×1280 logical, keep towers ≥ 90 px from edges and ≥ 150 px apart. Tower defaults: `level` 1, `kind` barracks, `units` 0.

## Naming & order
`NNN-kebab-name.json`; `src/levels/index.ts` lists them in play order. Bands (GDD §3): 1–8 barracks only, 1 enemy · 9–16 fortress/artillery · 17–24 two enemies, mines/barriers · 25–32 tank factory, bridges · 33–40 three enemies.

## Gates before finishing
1. `npm run levels:check` — schema, connectivity (graph connected), ids unique, features allowed in the band.
2. `npm run playtest` — reference player must win every level within 180 s; the "idle" player must lose or stall (never win). Fix the level, not the bot.
3. Each level's `lesson` must be new or a harder variant of a previous lesson.
