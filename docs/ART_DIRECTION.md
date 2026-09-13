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
| path lit / shade | `#f7e7bd` / `#d9c28c` | roads |
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
- **Island**: rounded organic plateau with a **3-band bevel** (lit top edge, mid cliff, dark under-cliff), a soft drop shadow onto the water, a thin foam line where water meets cliff, subtle lighter grass "sun patches", 2–3 drifting **cloud shadows** (very slow, low alpha), water sparkle dots drifting slowly. Biome per level band: 1–8 grass, 9–16 grass+autumn bushes, 17–24 sand/desert (path darker), 25–32 snow (blue-white plateau), 33–40 volcanic (dark rock, lava-orange paths). Terrain cached offscreen; only sparkles/cloud shadows animate.
- **Roads**: cream path with soft darker edge and a faint lit centre line; slight rounded caps; bridges = planks with rope rails; barriers = clay wall blocks with cracks proportional to remaining hp; mines = dark disc with pulsing red core and a tiny stripe ring.
- **Towers** (taller, ~1.35× current): stone plinth → cylindrical body with 3-tone vertical shading and a rim light on the left edge → owner-coloured roof (cone/cap) with a lit facet → flag on a pole that waves → **long directional ground shadow** + contact shadow. Level = 1–3 gold gems set into the plinth front (glint animation). Kinds: barracks (tent awning at base), artillery (short bunker + barrel that tracks the last target), tankFactory (boxy with chimney puffing tiny smoke), fortress (wide with wall ring + crenellations). Selected: gold clay ring on the ground with a soft outer glow, tower lifts 4 px. Drag target: animated dashed path in gold + target ring.
- **Badge**: paper pill above the roof with 2 px owner-coloured stroke, soft shadow, ink numerals in Fredoka 700; count changes tween the number (scale pop).
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
