/** Every tunable number. Keep in sync with docs/GDD.md §2. */
export const C = Object.freeze({
  TICK_MS: 50,
  MAP_W: 720,
  MAP_H: 1280,

  /** ms per produced infantry by barracks level (index = level). */
  GEN_MS: [0, 1000, 700, 500] as const,
  /**
   * Garrison capacity (weight) by level (index = level) — GDD §2.0 ladder 25 / 50 / 100. Every tower
   * kind uses this ladder (fortress × FORTRESS_CAPACITY_MUL); the player's `capacityMul` multiplies it.
   */
  CAPACITY: [0, 25, 50, 100] as const,
  /**
   * @deprecated Rules v2 (GDD §2.0): upgrades are automatic and free; the `upgrade` command is ignored.
   * Kept only so older layers still compile — do not read it for gameplay.
   */
  UPGRADE_COST: [0, 10, 20] as const,
  MAX_LEVEL: 3,
  /** Rules v2: a tower upgrades by itself when its garrison reaches its capacity (L1 → L2 → L3). */
  AUTO_UPGRADE: true,
  /** Maximum simultaneous attack streams (links) a tower may have, by level (index = level). */
  LINKS_PER_LEVEL: [0, 1, 2, 3] as const,

  UNIT_SPEED: 120, // px/s
  INFANTRY_WEIGHT: 1,

  TANK_WEIGHT: 5,
  TANK_SPEED_MUL: 0.7,
  /** ms per produced tank by tank-factory level (index = level); the same interval paces its streams (rules v3). */
  TANK_GEN_MS: [0, 4000, 2800, 2000] as const,

  /**
   * Rules v3 "free lanes" (GDD §2.0b). A lane joins two towers when the straight segment between their
   * centres passes no third tower closer than TOWER_BLOCK_RADIUS (strictly) and comes no closer than
   * width / 2 to any obstacle. Mines within MINE_RADIUS of a lane are crossed by units on it.
   */
  TOWER_BLOCK_RADIUS: 48,
  OBSTACLE_WIDTH: 28, // default thickness of a wall / water polyline
  ROCK_RADIUS: 40, // default radius of a single-point rock (width = 2 × radius)
  MINE_RADIUS: 30,

  ARTILLERY_GEN_MUL: 2, // generation interval multiplier (half rate)
  ARTILLERY_COOLDOWN_MS: 800,
  ARTILLERY_RANGE: 140,

  FORTRESS_CAPACITY_MUL: 1.5,
  FORTRESS_DEFENCE: 2, // attackers needed per defender
  FORTRESS_MAX_LEVEL: 2,

  /**
   * Rules v2.1 "Under fire" (GDD §2.0): a hostile landing on an owned tower pauses its production for
   * this long; any barracks trickle (landings ≤ 1 s apart) keeps it paused, a lone tank factory
   * (one landing / 4 s) or an L1 artillery post (2 s) lets it expire.
   */
  UNDER_FIRE_MS: 1500,

  AI_TICK_MS: 500,

  OVERDRIVE_MUL: 3,
  OVERDRIVE_MS: 10_000,
  FREEZE_MS: 5_000,
  AIRSTRIKE_DAMAGE: 10,
  BOOSTER_COST: { overdrive: 30, freeze: 40, airstrike: 50 } as const,
  COINS_PER_STAR: 10,

  /** Continue after defeat (ECONOMY.md §3.5): rewind, then a free freeze and reinforcements. */
  CONTINUE_REWIND_MS: 20_000,
  CONTINUE_FREEZE_MS: 5_000,
  CONTINUE_INFANTRY: 15,
  /** Snapshot ring for the rewind: one snapshot per interval, kept for at least the rewind window. */
  SNAPSHOT_INTERVAL_MS: 1_000,
  SNAPSHOT_CAPACITY_MS: 20_000,
});
