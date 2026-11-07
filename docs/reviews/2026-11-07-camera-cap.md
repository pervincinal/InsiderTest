# GD-13 (2026-11-07, Game Designer): the content-fit camera's zoom cap — keep 1.35

> **AZ xülasə (stakeholder üçün).** 1-ci səviyyədə kamera qüllələrə yaxınlaşır, amma 1,35 dəfədən çox yox. Hündür telefonda (iPhone 17 Pro Max) 1,78-ə qədər böyütmək mümkün idi — ölçdük.
> 1,35-də qüllənin toxunma dairəsi artıq 77–92 CSS px-dir (norma 44), rəqəmlər 20–24 px (norma 11): böyütmək oxunaqlığa heç nə qatmır.
> 1,78-də isə ada itir (dəniz və sahil ekrandan çıxır) və 2-ci səviyyəyə keçəndə qüllələr birdən 44 % kiçilir (1,35-də 26 %).
> Tövsiyə: **1,35 sabit qalsın**, xərci sıfır. Səviyyələr arası kamera animasiyasına ehtiyac yoxdur.
> Qərar Prodüserindir; default — 1,35 saxlanır.

**Question (frontend engineer, after AUD-U21b):** keep `FIT.cap = 1.35` (src/render/fit.ts) fixed, or tie the cap to the real play band so level 1 draws bigger on tall phones (430 × 932 with insets 59 / 34 would allow z 1.784 on level 1)?

**Recommendation (default): keep 1.35 fixed on every phone.** No code change. A band-tied rule such as `min(1.35 × bandHeight / 924, 1.6)` was measured and is not recommended (reasons in §3).

## 1. Method

- Build: a scratch copy of `tower-clash/` (this tree, 2026-11-07) with two scratch-only patches, built with `npx vite build` into the scratch dir and served by `vite preview` on :4195 — **no file in `tower-clash/src` changed**.
  - `fit.ts` exposes no cap parameter (only `?fit=0`), so the scratch `fitContent` reads `?fitcap=<z>` in place of `FIT.cap`; everything else is the shipped rule (box, `min` 1.04 decided on the 9:16 band, `fitBand` with the real anchors).
  - A probe stores the frame's fit (`z`, box, band) and the tutorial layout (`tutorialLayout`'s placed bubble, target, the lesson card rect, the view's letterbox scale) on `globalThis`; tower centres and the 57 map px hit radius come from `window.__towerclash.layoutToClient`.
- Playwright headless Chromium shell, DPR 2, touch / mobile viewport, fresh save (first play: tutorial on), EN, seed 1. Phones: **360 × 640** (no insets, 9:16), **393 × 851** (no insets: an Android with a full-bleed web view; its band is the tallest of the three, a = ∓139.5 logical px), **430 × 932** with `--safe-top 59 / --safe-bottom 34` (the stakeholder's iPhone 17 Pro Max; a = ∓62.4). Caps 1.35 / 1.5 / 1.78. Levels 1–4.
- Two frames per cell: `-card` (900 ms after `loadLevel`: the lesson card's hold, match not started) and `-play` (700 ms after `startMatch`: card gone, tutorial bubble up).
- Screenshots (72): `/tmp/claude-0/-home-user-InsiderTest/27ff3ffe-c8bd-51f2-b6a9-550752bc37bb/scratchpad/camcap/shots/<phone>-cap<cap>-L<level>-{card,play}.png`, e.g. `/tmp/claude-0/-home-user-InsiderTest/27ff3ffe-c8bd-51f2-b6a9-550752bc37bb/scratchpad/camcap/shots/430x932-cap1.78-L1-play.png`. Raw numbers: `/tmp/claude-0/-home-user-InsiderTest/27ff3ffe-c8bd-51f2-b6a9-550752bc37bb/scratchpad/camcap/probe.json`; script `/tmp/claude-0/-home-user-InsiderTest/27ff3ffe-c8bd-51f2-b6a9-550752bc37bb/scratchpad/camcap/probe.mjs` (scratch, not kept in the repo).

**Levels 2–4 do not depend on the cap.** Their 9:16 zoom is under `FIT.min` (1.04), so they keep the whole map (FLAT, z = 1) at every cap and on every phone: tower client coordinates identical across the three caps in every cell (the PNGs differ only by ambient animation). Level 1's content box is 284 × 588 map px (x 128..412, y 572..1160), height-limited everywhere: uncapped z = 1.572 at 360 × 640, 1.784 at 430 × 932, 2.047 at 393 × 851. So "cap 1.78" binds at 1.572 on 360 × 640.

## 2. Measurements — level 1 (CSS px; level 2 / FLAT reference in the last rows)

Disc = tower tap disc diameter (`TOWER_HIT_RADIUS` 57 map px × z × letterbox scale; floor 44 pt). Badge = badge font size (26 × `WORLD_ZOOM.badge` 1.15 × z × scale) / numeral height (Fredoka 900 digits measured at 0.74 em). Gap = home → camp centre distance (the first drag). Bubble = the "Tap your tower" bubble, CSS y range, and its placement. Window = the part of the map the play band shows (map px); the island's plateau spans ≈ x 40..700, y 108..≈ 1212 (cliff under it), so "W" / "S" = the west shore / south cliff with sea is inside the band. Jump = level 1 disc ÷ level 2 disc on the same phone.

| phone | cap | z | disc | badge font / numerals | gap | bubble (y, side) | window x / y | shore in band | jump L1→L2 |
|---|---|---|---|---|---|---|---|---|---|
| 360 × 640 | 1.35 | 1.350 | 77 | 20.2 / 14.9 | 116 | 352–380, above | 3–537 / 524–1208 | W + S (S at band edge) | × 1.35 |
| 360 × 640 | 1.5 | 1.500 | 86 | 22.4 / 16.6 | 129 | 358–386, above | 30–510 / 558–1174 | W sliver only | × 1.50 |
| 360 × 640 | 1.78 | **1.572** (box) | 90 | 23.5 / 17.4 | 135 | 362–390, above | 41–499 / 572–1160 | none | × 1.57 |
| 393 × 851 | 1.35 | 1.350 | 84 | 22.0 / 16.3 | 127 | 460–491, above | 3–537 / 421–1312 | W + S | × 1.35 |
| 393 × 851 | 1.5 | 1.500 | 93 | 24.5 / 18.1 | 141 | 467–498, above | 30–510 / 465–1267 | W sliver + S | × 1.50 |
| 393 × 851 | 1.78 | 1.780 | 111 | 29.1 / 21.5 | 167 | 481–511, above | 68–472 / 528–1204 | none (S at edge) | × 1.78 |
| 430 × 932 | 1.35 | 1.350 | 92 | 24.1 / 17.8 | 139 | 516–550, above | 3–537 / 478–1255 | W + S | × 1.35 |
| 430 × 932 | 1.5 | 1.500 | 102 | 26.8 / 19.8 | 154 | 524–558, above | 30–510 / 516–1216 | W sliver + S edge | × 1.50 |
| 430 × 932 | 1.78 | 1.780 | 121 | 31.8 / 23.5 | 183 | 539–573, above | 68–472 / 571–1161 | **none** | × 1.78 |
| level 2–4, FLAT | any | 1 | 57 / 62 / 68 (360 / 393 / 430) | 14.9 / 16.3 / 17.9 font | — | L2 / L3 above, one line | whole map | all | — |

Lesson card and bubble (all cells): the bubble is drawn only once the card's hold ends (no bubble in any `-card` frame), so they never overlap. The card (y 108 + a.top, ≤ 3 lines + caption + 4 px clay edge, bottom ≤ 234 + a.top) always lies above the fit band's top (240 + a.top), and the box is centred inside that band, so no tower, badge or AUD-A10 glyph touches the card at any cap. Margin between band top and the box top (glyph headroom included): 1.35 → 33 / 112 / 77 CSS px (360 / 393 / 430), 1.5 → 11 / 88 / 50, 1.78 → 0 / 43 / 1 — at the full band zoom the turtle shield sits flush under the band edge, still inside it. The bubble stays `above` (one line, 209 × 56 logical, nothing covered) in every cell; level 4's first step had not shown 700 ms in (its steps are condition-driven), it does not depend on the cap.

## 3. Judgement

**Readability floors (ART_DIRECTION §3–4).** At 1.35 every level-1 number is already far over its floor: tap disc 77–92 CSS px = 1.75–2.1 × the 44 pt rule (`TOWER_HIT_RADIUS`), badge font 20–24 CSS px against the 11 CSS px AUD-U2 floor and the 15 px FLAT badge, glyph and badge clear of the card. A higher cap moves numbers that have no problem; it does not fix anything. Nothing gets *worse* on the floors either (zoom only grows them; `WORLD_TEXT_MAX`'s neighbour-cover reason does not apply, the spacing grows with z).

**Teaching (GDD §3 tutorial band 1–4).** Level 1's job is the first tap; at 1.35 the home disc is 92 CSS px on the stakeholder's phone, the bubble points at it from directly above, and the camp is a 139 px drag away — a bigger target buys a fraction of a Fitts step on a target that is already the largest tap area in the game. The cost lands on level 2: its four towers draw FLAT (68 px discs at 430), so the first thing level 2 teaches — "your second tower, the grey one at the side" — appears at **74 %** of the size the player just learned at 1.35, **67 %** at 1.5 and **56 %** at 1.78. At 1.78 the level-2 map reads as a different game scale (a tower almost half as big), right when the tutorial asks for a new tap on a new tower. Levels 2–4 cannot follow upward: they are FLAT because they span the band (AUD-U21 rule 2), whatever the cap.

**The island.** At 1.35 the west shore and the south cliff stay in the band on every phone — level 1 looks like the island every later level is. At 1.5 the west shore is a sliver; at the 430 × 932 band's full zoom (1.78) no sea or shore is left in the band at all (`430x932-cap1.78-L1-card.png`): level 1 becomes a green field with three towers, and level 2 is the first time the player sees an island.

**Per-phone framing.** With a fixed 1.35, level 1 is the same picture (same map window) on every portrait phone; a band-tied cap makes the first screen differ per device (393 × 851 Android would get 1.6–1.78 while the 9:16 phone stays at 1.35–1.57), which also makes screenshots, the store captures and QA baselines device-specific for no player gain.

**Options measured:**

| option | 360 × 640 | 393 × 851 | 430 × 932 | cost (frontend) |
|---|---|---|---|---|
| **A. keep 1.35 (default, recommended)** | 1.35 | 1.35 | 1.35 | none |
| B. fixed 1.5 | 1.5 | 1.5 | 1.5 | one constant (`FIT.cap`), `tests/render/cameraFit.test.ts` pins, GDD §4 AUD-U21 text, screenshot baselines of level 1 |
| C. `min(1.35 × bandHeight / 924, 1.6)` | 1.35 | 1.6 (rule 1.76) | 1.53 | one line in `fitContent` (the cap from `fitBand(a)`), the same test / GDD / baseline updates, plus per-phone pins |
| D. band only (no cap past the box) | 1.57 | 2.05 | 1.78 | the cap removed; same updates |

B–D each raise the level-1 → level-2 jump (× 1.5 … × 2.05) and push the shore out of the band, for floors that are already met. **Recommendation: A.** If the Producer wants level 1 bigger on the iPhone anyway, the least harmful is C with its 1.6 ceiling — not a free band zoom.

## 4. Does the scale jump need a transition?

**No camera zoom tween between levels.** Level 1 → level 2 is never a continuous camera: the result beat (600 ms) and the result card cover the end of level 1, and NEXT opens level 2 as a new play screen (`src/ui/result.ts` `nextLevel`) with a new lesson card. A zoom from 1.35 to 1 at level-2 start would be motion that means nothing in the world (the map did not grow), it would hold the first tap of level 2 for its duration, and it contradicts the AUD-U21 rule "the framing is fixed for the level (no motion)". FEEL-1-6's 120 ms screen transition (menus) is the right kind of cover and is enough; nothing is needed for the play camera. At 1.35 the jump (× 1.35) is the size the team shipped on 2026-11-05 with no feedback against it; it is the reason not to raise the cap, not a reason to animate.

## 5. Follow-ups

- None in code. BACKLOG: `GD-13` closed as "keep 1.35" (the Producer may reopen with option C).
- If a later level is sparse enough to fit (z ≥ 1.04 on 9:16) inside the tutorial band, re-measure its jump to its neighbours with the same probe (`?fitcap=` scratch patch).
