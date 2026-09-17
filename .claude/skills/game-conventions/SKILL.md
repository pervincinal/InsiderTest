---
name: game-conventions
description: Code conventions and architecture rules for the Tower Clash codebase (tower-clash/). Load before writing or reviewing any game code — sim purity, command pattern, constants, testing, file ownership.
---
# Tower Clash code conventions

## Architecture
```
tower-clash/src/
  sim/        pure deterministic rules. No DOM, Date, Math.random, imports from other layers.
    types.ts        LevelDef, GameState, Tower, Road, Unit, Command, Owner
    constants.ts    every tunable number, exported as a frozen object
    rng.ts          mulberry32 seeded RNG
    create.ts       createState(level, seed)
    step.ts         step(state, dtMs) — fixed 50 ms ticks, applies commands then simulates
    commands.ts     applyCommand(state, cmd) — sendUnits | upgrade | cutBridge | booster
    outcome.ts      getOutcome(state) → 'playing' | 'won' | 'lost'
  ai/         (state, owner, rng) => Command[]; personalities + referencePlayer
  render/     draw(state, ctx, view) — reads only
  input/      pointer events → commands
  ui/         screens (title, levelSelect, play, result), HUD, save
  audio/      WebAudio synth
  levels/     one JSON per level: 001-first-steps.json … ; manifest.ts (generated: npm run levels:manifest) = eager
              metadata + one import() per level; index.ts exports LEVEL_META, loadLevel(id), loadAllLevels()
```
Sim time is milliseconds. `state.time` advances by exactly 50 per tick; the loop accumulates real dt and runs whole ticks. Rendering interpolates unit positions from `unit.progress` (0..1 along road).

## Rules
- Owner enum: `'neutral' | 'player' | 'enemy1' | 'enemy2' | 'enemy3'`.
- Commands are plain objects `{ type, owner, ... }` and are the only way to mutate state from outside `sim/`.
- Validate commands inside the sim (wrong owner, no road, not enough units → ignored, never thrown).
- Constants in `constants.ts` only; GDD §2 table must match.
- TypeScript strict, ESM, no `any`. Prettier default style. Named exports.
- Tests: Vitest in `tests/<layer>/*.test.ts`; helper `makeLevel()` in `tests/helpers.ts`. A rule test asserts numbers, not "it doesn't crash".
- Scripts (all must pass before commit): `npm run check` = typecheck + lint + unit tests + levels:check; `npm run playtest` = reference player on all levels; `npm run e2e` = Playwright smoke.
- Commit message prefix: `sim:`, `ai:`, `render:`, `ui:`, `levels:`, `qa:`, `docs:`, `chore:`.
