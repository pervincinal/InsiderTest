# Tower War – Tactical Conquest: Reference Analysis

*Research date: 2026-09-13. Sources: public store listings, guides and reviews (Level Winner, All Tech Magazine, Game Solver, WriterParty, App Store / Google Play listings). Several guide sites are blocked from this environment, so figures below marked "est." are estimates reconstructed from gameplay descriptions and are to be tuned by playtesting, not treated as facts.*

## 1. What the game is

- Developer/publisher: SayGames LTD (Android package `games.vaveda.militaryoverturn`). Released August 2021. Casual real-time strategy, "capture the nodes" genre (same family as Galcon, Mushroom Wars, State.io, Phage Wars).
- Sessions are short (30 s – 3 min), one-thumb control, portrait orientation, low-poly 3D art with strong colour coding: **player = blue**, enemies = red / green / yellow, **neutral = grey**.
- Hundreds of hand-made levels; difficulty rises by adding enemies (up to 3 simultaneous AIs), map obstacles and new building types.

## 2. Core loop (verified from multiple sources)

1. Each level starts with the player owning 1–2 towers. Every tower shows a **number = units garrisoned**.
2. **Owned towers generate units over time** (neutral towers do not). Upgraded towers generate faster and hold more.
3. **Tap/drag from your tower to another tower** to send troops. Troops march in a line across the map along the ground (roads/bridges where present).
   - Arriving at a **friendly** tower: each unit adds +1 (reinforce).
   - Arriving at an **enemy or neutral** tower: each unit subtracts 1. When the count hits 0 the next arriving unit **captures** the tower for the attacker.
   - Opposing columns that meet on the field fight 1:1 and annihilate each other.
4. **Upgrade** an owned tower by tapping it (spend garrisoned units). Upgrade raises generation speed, capacity and the defensive value. Tower level is shown as a number / star badge.
5. **Win** when every enemy tower is captured (neutrals may be left). **Lose** when you have no towers and no units in transit.
6. Result screen gives stars/coins; coins buy cosmetic skins and one-off boosters.

## 3. Buildings and map features introduced over progression

| Feature | Behaviour (as described in guides) | Design note for our clone |
|---|---|---|
| Barracks (basic tower) | Generates infantry, upgradable 3 levels | Core tower; levels 1–3 |
| Artillery post | Shoots at passing enemy units in radius; doesn't produce units fast | Area-denial, makes routing matter |
| Tank factory | Produces tanks: slow, one tank ≈ several infantry | Adds unit type with weight 5 |
| Fortress / fortified tower | Higher defence; attackers need more units | Defence multiplier ×1.5 |
| Barrier / blockade | Blocks a path until destroyed by sending units into it | Edge with HP |
| Mine | Kills the first N units that step on it | Edge hazard, one-shot |
| Bridge | Path over water; can be cut to stop enemy reinforcements | Destructible edge, owner action |
| Multiple enemies | Up to 3 AIs with different colours fighting each other too | AI personalities: rusher, turtle, opportunist |

## 4. Meta and monetisation

- Free-to-play. Interstitial ads between levels; rewarded ads for ×3 production booster, extra units, or "air support"; IAP removes ads / gives VIP.
- Coins and gems: skins for towers/units, boosters.
- Retention: level chain with occasional "boss" maps, daily rewards.
- Our clone is a portfolio/learning project: **no ads, no real-money IAP**. Coins earned in-game buy boosters and skins.

## 5. Why it works (design pillars to preserve)

1. **Readable numbers**: every decision is arithmetic the player can do in their head (my 12 vs their 8).
2. **Tension of emptying a tower**: sending everything leaves you exposed; the AI punishes it.
3. **Tempo**: upgrade early vs expand early is the central trade-off.
4. **Escalating vocabulary**: a new building type every ~10 levels keeps the same verbs fresh.
5. **Short, replayable levels** with a 3-star clock.

## 6. Estimated numeric baseline (to be tuned)

| Parameter | est. value |
|---|---|
| Unit generation, L1 / L2 / L3 | 1 unit per 1.0 s / 0.7 s / 0.5 s |
| Capacity, L1 / L2 / L3 | 30 / 50 / 80 |
| Upgrade cost L1→L2 / L2→L3 | 10 / 20 units |
| Unit speed | ~120 px/s on a 720×1280 map |
| Column spacing | 0.12 s between units |
| Artillery | 1 shot / 0.8 s, range 140 px, kills 1 infantry |
| Tank | weight 5, speed 0.7×, produced 1 / 4 s |
| 3-star clock | ≤ 45 s / ≤ 90 s / any |

## Sources

- https://apps.apple.com/us/app/tower-war-tactical-conquest/id1579356887
- https://play.google.com/store/apps/details?id=games.vaveda.militaryoverturn
- https://www.levelwinner.com/tower-war-tactical-conquest-beginners-guide-tips-tricks-strategies/
- https://alltechmagazine.com/article/tower-war-tactical-conquest-game/
- https://game-solver.com/tower-war-tactical-conquest/
- https://writerparty.com/party/tower-war-tactical-conquest-walkthrough-tips-cheats-and-strategy-guide/
- https://viugame.com/detail/casual/tower_war_-_tactical_conquest
