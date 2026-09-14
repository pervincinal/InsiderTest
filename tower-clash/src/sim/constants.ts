/** Every tunable number. Keep in sync with docs/GDD.md §2. */
export const C = Object.freeze({
  TICK_MS: 50,
  MAP_W: 720,
  MAP_H: 1280,

  /** ms per produced infantry by barracks level (index = level). */
  GEN_MS: [0, 1000, 700, 500] as const,
  CAPACITY: [0, 30, 50, 80] as const,
  UPGRADE_COST: [0, 10, 20] as const, // cost to go from level index → index+1
  MAX_LEVEL: 3,

  UNIT_SPEED: 120, // px/s
  LEAVE_INTERVAL_MS: 120,
  INFANTRY_WEIGHT: 1,

  TANK_WEIGHT: 5,
  TANK_SPEED_MUL: 0.7,
  TANK_GEN_MS: 4000,
  TANK_FACTORY_CAPACITY: 40,

  ARTILLERY_GEN_MUL: 2, // generation interval multiplier (half rate)
  ARTILLERY_COOLDOWN_MS: 800,
  ARTILLERY_RANGE: 140,
  ARTILLERY_CAPACITY: 40,

  FORTRESS_CAPACITY_MUL: 1.5,
  FORTRESS_DEFENCE: 2, // attackers needed per defender
  FORTRESS_MAX_LEVEL: 2,

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
