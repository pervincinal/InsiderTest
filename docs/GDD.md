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

**AI.** Bots issue `link`/`unlink` instead of `sendUnits`: an attack is a link; "reserve" becomes "unlink when the source is threatened or the goal is reached"; the reference player unlinks a supply line when the target is full or when the source needs to grow to the next level.

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

### 2.5 Enemy AI (per enemy, ticks every 0.5 s)
Personalities: `rusher` (attacks weakest adjacent target when garrison ≥ target + 3), `turtle` (upgrades to L3 first, attacks when garrison ≥ target × 2), `opportunist` (targets whichever adjacent tower has the lowest units regardless of owner, keeps 5 in reserve). Difficulty scalar `aggression` 0..1 shortens reaction time and lowers thresholds. Enemies also fight each other.

### 2.6 Boosters (meta, spent coins)
- **Overdrive**: ×3 production for 10 s (cost 30 coins).
- **Freeze**: every owner except the caster stops generating for 5 s (40 coins).
- **Airstrike**: remove 10 units from one enemy tower (50 coins).
Coins: 10 per star earned, first-clear only.

## 3. Level design
- Levels are JSON in `tower-clash/src/levels/`. Schema in `tower-clash/src/sim/types.ts` (`LevelDef`).
- Progression bands: 1–8 one enemy, barracks only; 9–16 fortress + artillery; 17–24 two enemies + mines/barriers; 25–32 tank factory + bridges; 33–40 three enemies, everything. Target 40 levels for v1.0.
- Every level must be winnable by the scripted "reference player" (see `playtest` skill) in under 3 min and must not be winnable by doing nothing.

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
