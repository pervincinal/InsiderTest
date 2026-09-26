# Art Direction v2 — "Sunlit Clay Islands"

Stakeholder feedback (2026-09-13): the first Tower War-style pass reads as flat clip-art. Target: **premium casual** — the 2025–26 trend of "premium minimalism": simple shapes executed with real material quality, soft-3D (claymorphism) UI, strong lighting, confident typography and orchestrated motion (sources: casual game art trend reports 2025–26, UI trend guides on claymorphism/glassmorphism). Everything is still canvas 2D primitives, no images.

## 1. Mood
Sunny afternoon over toy islands. Everything looks moulded from soft clay: rounded, matte, three tones per object (lit / mid / shade) plus a thin rim light. One warm key light from the **upper-left** (about 35° elevation); every object drops a **long, soft, slightly blue shadow** to the lower-right onto the ground. Colours are saturated but harmonised; no pure black, no pure white.

## 2. Palette (`src/render/palette.ts` is the single source)
| Token | Hex | Use |
|---|---|---|
| sky / water deep | `#1f8fc2` | letterbox, far water |
| water | `#3fb6de` → `#8ee2f5` (vertical gradient) | map water |
| water sparkle | `#e8fbff` @ 60 % | drifting highlights |
| grass lit / mid / shade | `#a9e36b` / `#7cc94a` / `#5aa836` | plateau |
| cliff lit / shade | `#e9c98a` / `#b9925a` | island side |
| path lit / shade | `#f7e7bd` / `#d9c28c` | level-select path map and skin shapes (roads are gone since Rules v3) |
| wall lit / mid / shade | `#e3d9c6` / `#b9ad99` / `#7f7566` (grass biome; per-biome sets in `BIOMES[].wall`) | stone wall obstacles |
| shadow | `#1a3a5a` @ 22 % | all ground shadows (multiply feel) |
| ink | `#1e2a44` | text, outlines |
| paper | `#fffaf0` | badges, cards |
| player | `#2f6df6` (lit `#6d9bff`, shade `#1f4bc0`) | blue |
| enemy1 | `#ff5a5f` (lit `#ff8f92`, shade `#c93a3f`) | coral |
| enemy2 | `#2ec27e` (lit `#6fe0a8`, shade `#1f8f5c`) | mint |
| enemy3 | `#ffb703` (lit `#ffd35c`, shade `#d18f00`) | amber |
| neutral | `#a8a29e` (lit `#d6d3d1`, shade `#78716c`) | warm grey |
| gold | `#ffcf3f` (shade `#e0a300`) | stars, crowns, selection |
Colour-blind palette keeps the same lit/mid/shade structure with blue / orange / purple / teal.

## 3. World
- **Island**: rounded organic plateau with a **3-band bevel** (lit top edge, mid cliff, dark under-cliff), a soft drop shadow onto the water, a thin foam line where water meets cliff, subtle lighter grass "sun patches", 2–3 drifting **cloud shadows** (very slow, low alpha), water sparkle dots drifting slowly. Biome per level band: 1–8 grass, 9–16 grass+autumn bushes, 17–24 sand/desert (path darker), 25–32 snow (blue-white plateau), 33–40 volcanic (dark rock, lava-orange paths), 41–50 twilight highlands (ART-8, 2026-09-26 — see the table below). Terrain cached offscreen; only sparkles/cloud shadows animate.
- **Biome table** (`BIOMES` in `palette.ts`; `biomeFor(levelId)` maps the band; every entry has ground / cliff / path / bush / wall tones and a dots set, and every cosmetic theme re-lights any entry through `themedBiome`):

  | Band | Biome | ground lit / mid / shade | cliff lit / shade | path lit / shade | bush lit / mid / shade | wall lit / mid / shade | dots | props |
  |---|---|---|---|---|---|---|---|---|
  | 1–8 | grass | `#a9e36b` / `#7cc94a` / `#5aa836` | `#e9c98a` / `#b9925a` | `#f7e7bd` / `#d9c28c` | `#8ad95a` / `#5fb742` / `#3f8f2e` | `#e3d9c6` / `#b9ad99` / `#7f7566` | paper, gold, coral | bushes, pale rocks, flowers |
  | 9–16 | autumn | `#b4dc6a` / `#8cc24c` / `#66a03a` | as grass | as grass | `#ffb75c` / `#f08a3c` / `#c25a2a` | `#e6d6bd` / `#bda98c` / `#82705a` | paper, amber, red | orange + green bushes |
  | 17–24 | sand | `#fbe7ad` / `#ecd08a` / `#cdae66` | `#e6c08a` / `#b5865a` | `#d9b985` / `#b8955e` | `#8fd07a` / `#5fa85a` / `#3f7f43` | `#f1dcb4` / `#c9a273` / `#8a6a47` | paper, tan, umber | cacti, pale rocks, dust puffs |
  | 25–32 | snow | `#ffffff` / `#e8f2fb` / `#c3d8ea` | `#c9d9e6` / `#8ea9c2` | `#d6e3ee` / `#a9c0d4` | `#4f8d7a` / `#2f6b5c` / `#1f4d43` | `#dfe6ee` / `#9fb0c2` / `#5f7185` | paper, ice blues | snow-capped pines |
  | 33–40 | volcanic | `#6b6470` / `#4d4753` / `#332f3a` | `#5a4a4c` / `#3a2c30` | `#ff9a3c` / `#d9601e` (lava) | `#7a6f7c` / `#57505c` / `#3a343f` | `#8f8391` / `#5f5565` / `#2e2833` | embers | dark boulders only |
  | 41–50 | **twilight highlands** (ART-8) | `#a898cf` / `#8a7ab5` / `#665794` (heather violet, luminance 0.23) | `#c48a5c` (warm amber rim light) / `#4b4463` (slate) | `#e9dff7` / `#c4b5df` (pale lilac) | `#cf95d6` / `#5f3f85` / `#3e2757` (heather in bloom) | `#9aa0b8` / `#626a86` / `#343a50` (slate) | amber fireflies `#ffd35c` `#ffb703`, bloom `#f6ecff` | heather bushes, tall dark standing stones (35 % of clumps), dark boulders |

  Twilight is the dusk answer to volcanic's dark-ash look without repeating it on a phone: the moor is ≈ 3.4× as luminous as ash, so the streams' 1 px ink outline reads at **3.8:1** (ash: 1.6:1), the ink numerals stay ≥ 4.5:1 on every badge paper (untouched, 10.7–13.7:1), and every owner mid tone of both palettes sits ≥ ΔE 38 from the ground (the weakest shipped pair, neutral on snow, is 29). `tests/render/biome.test.ts` asserts these with a luminance / ΔE helper. Only the ground layer changes — buildings, units, badges and the HUD are biome-independent.
- **Roads** *(v1–v2.1, superseded by Rules v3 — GDD §2.0b, 2026-09-21)*: cream path with soft darker edge and a faint lit centre line; bridges = planks with rope rails; barriers = clay wall blocks. The path tokens stay in the palette for the level-select path map and the skin shapes only; the terrain layer draws no roads.
- **Obstacles** (Rules v3, `src/render/terrain.ts`, cached with the ground; lanes are straight lines between any two towers that see each other, so obstacles are the only thing that shapes a map): every obstacle is a polyline band of its `width` (28 px default), drawn in the same clay language as the island — soft blue ground shadow to the lower-right, a 40 % ink contour so it reads on snow and sand, three tones lit from the upper-left.
  - **Wall**: stone band from the biome's `wall` tones (grass `#e3d9c6` / `#b9ad99` / `#7f7566`; each biome has its own set, volcanic is dark basalt): shaded side face extruded 4 px downward, lit top face, a darker cap line along the walkway, a lit edge and 7×6 px battlement merlons every 16 px on the light-facing side (≈ 3 px at 360 px width — still a visible crenellation). A gap in a wall is just two polylines; nothing is drawn in the gap.
  - **Water** (river): ground, under everything else — dark grass bank lip (+8 px), pale wet rim, the theme's water body lightened 18 %, a translucent lighter centre and a 2 px ripple sine line offset toward the shaded bank so the current reads. Rivers never carry a bridge: a ford is a gap in the polyline.
  - **Rock**: a single point is one boulder of radius `width / 2` (40 px default); a polyline is a chain of boulders (0.7–0.95 × radius, jittered ±17 % across the line, sorted back-to-front). Same `drawRock` as the biome props (lit top facet, shaded base, ink contour, ground shadow), so they read as scenery that happens to block.
  - **Mine**: a point on the ground (not a road midpoint any more) — dark metal disc with a lighter cap and a gold dashed ring in the cached terrain, plus the animated part in `draw.ts`: a blinking `mine` red lamp (static under reduced motion) and a red charge chip above it. Spent mine = a scorched **crater** (dark ellipse, contact-shadow bowl, paper rim highlight, five soot flecks) re-baked into the terrain cache via `TerrainSpec.variant`.
  - **Lanes**: no ground mark at all. A selected tower shows a thin dashed guide line (2 px, owner mid tone at 45 %, 10 px on / 8 px off in map units — ART-7: a solid 30 % line vanished at 360 px) to every tower it can see; an active stream is the straight owner-coloured ribbon with a 1 px ink outline on every owner so it keeps its hue over grass, sand, snow and ash (enemy mid tone at 68 %, the player's lit tone at 72 % with a heavier arrowhead stroke), paper chevrons marching to the target, arrowhead at the target end; opposite streams on one lane sit 4 px to their right. Decorations (bushes, rocks, sun patches) keep off obstacles, mines and tower footprints.
- **Towers** (taller, ~1.35× current): stone plinth → cylindrical body with 3-tone vertical shading and a rim light on the left edge → owner-coloured roof (cone/cap) with a lit facet → flag on a pole that waves → **long directional ground shadow** + contact shadow. Level = 1–3 gold gems set into the plinth front (glint animation). Kinds: barracks (tent awning at base), artillery (short bunker + barrel that tracks the last target), tankFactory (boxy with chimney puffing tiny smoke), fortress (wide with wall ring + crenellations). Selected: gold clay ring on the ground with a soft outer glow, tower lifts 4 px. Drag target: animated dashed path in gold + target ring.
- **Badge**: paper pill above the roof with 2 px owner-coloured stroke, soft shadow, ink numerals in Fredoka 700; count changes tween the number (scale pop).
- **Badge under fire** (rules v2.1, GDD §2.0): while a hostile stream is landing, the pill turns warm alert paper (`badgeAlert`, ink numerals stay ≥ 4.5:1), the stroke thickens to 3.5 px in the **attacker's** colour and a crossed-swords pip sits before the number (shape, not only colour — same in the colour-blind palette); each landing jolts the badge 3 px and drops a small impact ring + sparks in the attacker's colour at the tower base. Reduced motion: the static tint/pip only, no jolt, no ring.
- **Units**: clay soldiers — capsule body (lit/mid/shade), lighter face, helmet band in owner colour, tiny backpack; squash-and-stretch bob while marching, small dust puffs behind columns on sand; tanks = rounded box with turret and treads, slight rocking.

## 4. UI (claymorphism)
- **Typeface**: Fredoka (Google Fonts, OFL) 700 for numerals/headings, 500 for labels; files in `public/fonts/`, `@font-face` in `index.html`, canvas waits for `document.fonts.ready`. Fallback: system rounded sans.
- **Buttons/pills**: paper fill, 18 px radius, **inner highlight** top (1 px lighter), **outer soft shadow** (0 6 px, 12 % ink), 4 px coloured bottom edge for primary (player blue) / secondary (paper with ink shade). Pressed: move down 3 px, edge shrinks. Text ink or paper on colour.
- **HUD**: top-left level chip (small "LEVEL 9" over name), centre timer pill with ink numerals, right pause button; bottom: SEND ratio segmented toggle (100 % | 50 %) and MENU. HUD sits on a subtle translucent paper band with 10 % ink blur look (glass-like) so it reads over any biome.
- **Result card**: clay card slides up with a bounce; three stars pop in sequentially with a gold glow burst; "VICTORY" as extruded 3D lettering (layered offsets) in gold with ink outline; coins count up; buttons row.
- **Pause card**: same card style, smaller.
- **Title**: island vignette, logo "TOWER CLASH" as extruded 3D clay letters (paper + blue), soft floating animation, a big primary PLAY, small settings row; ambient soldiers marching between demo towers.
- **Level select**: a **winding path map** down a long island (like Royal Match/Candy Crush): round clay nodes with the level number, cleared = gold with stars beneath, current = pulsing with a flag, locked = grey with a lock; the path scrolls vertically (drag/wheel), starts scrolled to the current level. Coins pill at the top.

## 5. Motion (all respect `prefers-reduced-motion`)
- Capture: tower squashes (0.85 y) and pops back, roof colour swaps with a radial wipe, confetti burst in the new owner colour, 6 px screen nudge.
- Upgrade: gold gem glints, roof scales 1.15 → 1, sparkle ring.
- Send: source badge pops, units spawn with a small scale-in.
- Artillery: muzzle flash, tracer, hit spark.
- Victory: confetti + star sequence; defeat: desaturate world slightly, card slides in.

## 6. Performance & readability
- 400 units at 60 fps on a mid phone: per-unit drawing is ≤ 6 primitives, no per-frame gradients on units (pre-tinted), shadows are flat ellipses.
- Numerals ≥ 24 px logical, contrast ≥ 4.5:1 on badges; owner colours distinguishable in both palettes.
