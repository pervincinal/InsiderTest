/**
 * One-off converter, Rules v3 (GDD §2.0b, 2026-09-21): road levels → free-lane levels.
 * `npx tsx scripts/convertLevelsV3.ts [--dry]` — rewrites every src/levels/NNN-*.json in place.
 * Kept in the repo as the record of how the 50 v2 levels were carried over; running it on a level
 * that already has no `roads` is a no-op.
 *
 * Rules (per level):
 *  1. `roads` is removed. Under v3 every pair of towers whose straight segment is clear of obstacles
 *     and of third towers is a lane, so the road list carries no information any more. Waypoints go
 *     with the roads (lanes are straight).
 *  2. A road `mine: N` becomes a point mine `{ x, y, charges: N }` at the midpoint of the straight
 *     tower-to-tower segment (the old mine sat at the road midpoint; waypoints are ignored because
 *     the v3 lane is the straight segment). Coordinates are rounded to whole pixels.
 *  3. A road `barrier: N` becomes a point mine with `charges: N` at the same midpoint: a barrier was
 *     a passable cost paid in units, which is exactly what a mine is under v3. Where a level's intent
 *     was a *permanent* block the Level Designer replaces that mine by a `wall` obstacle by hand
 *     (step 3 of the v3 level work) — the converter never decides that.
 *  4. A `kind: "bridge"` road is simply dropped: the lane between its towers stays open. The river
 *     it crossed becomes a `water` obstacle authored by hand, with a gap (≥ 60 px) where each bridge
 *     was, so the crossing points stay where the old bridges were.
 *  5. Key order of the output: id, name*, lesson*, star3, star2, enemies, towers, obstacles, mines.
 *     `obstacles` and `mines` are written only when non-empty (levels 1–4 have neither).
 *  6. Nothing else changes: towers, enemies, names, lessons and star clocks are untouched (lessons
 *     that mention roads / bridges / barriers are rewritten by hand afterwards).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { LEVELS_DIR, levelFiles } from './lib/levelManifest';

/** Inline JSON of a scalar / object / array (house style of the level files: `{"x": 1, "y": 2}`). */
function inline(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  if (v !== null && typeof v === 'object') {
    return `{${Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`)
      .join(', ')}}`;
  }
  return JSON.stringify(v);
}

/** Level JSON in the checked-in style: one top-level key per line, one array element per line. */
export function formatLevelJson(level: Record<string, unknown>): string {
  const lines = Object.entries(level).map(([k, v]) => {
    if (Array.isArray(v)) return `  ${JSON.stringify(k)}: [\n${v.map((x) => `    ${inline(x)}`).join(',\n')}\n  ]`;
    return `  ${JSON.stringify(k)}: ${inline(v)}`;
  });
  return `{\n${lines.join(',\n')}\n}\n`;
}

interface OldRoad {
  a: string;
  b: string;
  kind?: string;
  waypoints?: { x: number; y: number }[];
  mine?: number;
  barrier?: number;
}

interface Point {
  x: number;
  y: number;
}

const dry = process.argv.includes('--dry');
const TEXT_KEYS = ['id', 'name', 'name_az', 'name_ru', 'name_tr', 'lesson', 'lesson_az', 'lesson_ru', 'lesson_tr', 'star3', 'star2', 'enemies', 'towers'];

let converted = 0;
for (const file of levelFiles()) {
  const path = new URL(file, `file://${LEVELS_DIR}`);
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const roads = raw.roads as OldRoad[] | undefined;
  if (!Array.isArray(roads)) continue;

  const towers = raw.towers as ({ id: string } & Point)[];
  const at = (id: string): Point => {
    const t = towers.find((tower) => tower.id === id);
    if (!t) throw new Error(`${file}: road refers to unknown tower "${id}"`);
    return { x: t.x, y: t.y };
  };

  const mines: { x: number; y: number; charges: number }[] = Array.isArray(raw.mines) ? (raw.mines as { x: number; y: number; charges: number }[]) : [];
  const obstacles: unknown[] = Array.isArray(raw.obstacles) ? (raw.obstacles as unknown[]) : [];
  let dropped = { bridges: 0, waypoints: 0, mines: 0, barriers: 0 };
  for (const road of roads) {
    const a = at(road.a);
    const b = at(road.b);
    const mid = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
    if (road.mine !== undefined) {
      mines.push({ ...mid, charges: road.mine });
      dropped = { ...dropped, mines: dropped.mines + 1 };
    }
    if (road.barrier !== undefined) {
      mines.push({ ...mid, charges: road.barrier });
      dropped = { ...dropped, barriers: dropped.barriers + 1 };
    }
    if (road.kind === 'bridge') dropped = { ...dropped, bridges: dropped.bridges + 1 };
    if (road.waypoints !== undefined) dropped = { ...dropped, waypoints: dropped.waypoints + 1 };
  }

  const out: Record<string, unknown> = {};
  for (const key of TEXT_KEYS) if (raw[key] !== undefined) out[key] = raw[key];
  if (obstacles.length > 0) out.obstacles = obstacles;
  if (mines.length > 0) out.mines = mines;
  for (const key of Object.keys(raw)) {
    if (key === 'roads' || key in out || key === 'obstacles' || key === 'mines') continue;
    out[key] = raw[key];
  }

  console.log(
    `${file}: ${roads.length} roads removed (${dropped.bridges} bridges, ${dropped.waypoints} with waypoints), ` +
      `${dropped.mines} mines + ${dropped.barriers} barriers → ${mines.length} point mines`,
  );
  if (!dry) writeFileSync(path, formatLevelJson(out));
  converted++;
}
console.log(`${dry ? '[dry] ' : ''}${converted} level(s) converted`);
