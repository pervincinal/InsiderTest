import { describe, expect, it } from 'vitest';
import { loadAllLevels } from '../../src/levels/index';
import {
  MIN_TOWER_DISTANCE,
  MIN_TOWER_SPACING,
  TOWER_SPACING_GAP,
  TOWER_SPACING_WARN_FACTOR,
  formatReport,
  minSpacing,
  minTowerSpacing,
  spacingWarnings,
  topBadgeMinY,
  topBadgeNotes,
  validateLevel,
  validateLevels,
  validateSpacing,
  zoomedPlinth,
} from '../../scripts/lib/validateLevel';
import { HUD, WORLD_ZOOM } from '../../src/render/layout';
import { badgeY, towerFootprintRadius } from '../../src/render/sprites';
import { badgeCentre, badgeMinY, badgeScale, placeBadges } from '../../src/render/worldChips';
import type { BadgeWant } from '../../src/render/worldChips';
import { C } from '../../src/sim/constants';
import type { TowerDef, TowerKind } from '../../src/sim/types';
import { makeLevel } from '../helpers';

/*
 * LV-20 (2026-10-15): the static tower-spacing rule. After ART-24 buildings draw × 1.3 on the same map,
 * so the validator checks each pair against its drawn plinths (2 × the larger zoomed plinth + 12 px) and
 * warns about towers so near the top that their badge cannot sit above the roof (BUG-42).
 */

const LEVELS = await loadAllLevels();
const KINDS: readonly TowerKind[] = ['barracks', 'artillery', 'tankFactory', 'fortress'];

/** A two-tower level: player `p` at the bottom, enemy `e` `d` px above it, both of `kind` / `level`. */
const pair = (d: number, kind: TowerKind = 'barracks', level: 1 | 2 | 3 = 1): TowerDef[] => [
  { id: 'p', x: 360, y: 1000, owner: 'player', units: 10, kind, level },
  { id: 'e', x: 360, y: 1000 - d, owner: 'enemy1', units: 10, kind, level },
];

describe('LV-20: drawn tower spacing', () => {
  it('derives MIN_TOWER_SPACING from the zoomed plinths: 2 × r × WORLD_ZOOM.tower + 12 px', () => {
    expect(WORLD_ZOOM.tower).toBe(1.3);
    expect(TOWER_SPACING_GAP).toBe(12);
    for (const k of KINDS) {
      for (const lv of [1, 2, 3]) {
        expect(zoomedPlinth(k, lv)).toBeCloseTo(towerFootprintRadius(k, lv) * 1.3, 9);
        expect(MIN_TOWER_SPACING[k][lv - 1]).toBeCloseTo(2 * towerFootprintRadius(k, lv) * 1.3 + 12, 9);
      }
    }
    expect(MIN_TOWER_SPACING.barracks.map((v) => +v.toFixed(1))).toEqual([84.8, 95.2, 116]);
    expect(MIN_TOWER_SPACING.artillery.map((v) => +v.toFixed(1))).toEqual([105.6, 116, 131.6]);
    expect(MIN_TOWER_SPACING.tankFactory.map((v) => +v.toFixed(1))).toEqual([100.4, 110.8, 131.6]);
    expect(MIN_TOWER_SPACING.fortress.slice(0, 2).map((v) => +v.toFixed(1))).toEqual([126.4, 131.6]);
    // a pair takes the larger of its two values
    expect(minTowerSpacing({ kind: 'barracks', level: 1 }, { kind: 'fortress', level: 1 })).toBeCloseTo(126.4, 9);
    expect(minTowerSpacing({ kind: 'artillery', level: 2 }, { kind: 'barracks', level: 3 })).toBeCloseTo(116, 9);
  });

  it('the 150 px authoring floor covers every kind fully upgraded (fortress L2, the rest L3)', () => {
    const maxNeed = Math.max(...KINDS.map((k) => MIN_TOWER_SPACING[k][(k === 'fortress' ? C.FORTRESS_MAX_LEVEL : C.MAX_LEVEL) - 1]!));
    expect(maxNeed).toBeCloseTo(131.6, 9);
    expect(MIN_TOWER_DISTANCE).toBeGreaterThanOrEqual(maxNeed);
  });

  it('errors on a pair closer than its drawn spacing, on top of the 150 px floor', () => {
    // two L3 fortresses (147.2 px drawn spacing) 140 px apart: both rules fire
    const close = validateSpacing(pair(140, 'fortress', 3));
    expect(close).toHaveLength(2);
    expect(close[0]).toBe('towers p and e are 140 px apart (min 150)');
    expect(close[1]).toBe('towers p and e are 140.0 px apart, closer than their drawn spacing 147.2 px (2 × zoomed plinth + 12)');
    // two L1 barracks (84.8 px) 140 px apart: only the floor
    expect(validateSpacing(pair(140))).toEqual(['towers p and e are 140 px apart (min 150)']);
    // 80 px: both again
    expect(validateSpacing(pair(80))).toHaveLength(2);
    // a whole level carries the error through validateLevel
    expect(validateLevel(makeLevel({ towers: pair(140, 'fortress', 3) }))).toContain(close[1]);
  });

  it('skips the drawn-spacing check for a tower with an invalid kind or level (reported elsewhere)', () => {
    const [p, e] = pair(100);
    expect(validateSpacing([p!, { ...e!, kind: 'castle' as TowerKind }])).toEqual(['towers p and e are 100 px apart (min 150)']);
    expect(validateSpacing([p!, { ...e!, level: 7 as unknown as 1 }])).toEqual(['towers p and e are 100 px apart (min 150)']);
  });

  it(`warns under ${TOWER_SPACING_WARN_FACTOR} × the drawn spacing, never fails`, () => {
    // fortress L1: 126.4 px drawn, warning line 158.0 px
    const near = makeLevel({ id: 9, towers: pair(155, 'fortress', 1) });
    expect(spacingWarnings(near)).toEqual([
      'towers p and e are 155.0 px apart, under 1.25 × their drawn spacing (158.0 px): badges will have to move beside the tower',
    ]);
    expect(validateLevel(near)).toEqual([]);
    const report = validateLevels([near])[0]!;
    expect(report.errors).toEqual([]);
    expect(report.warnings).toContain(spacingWarnings(near)[0]);
    expect(spacingWarnings(makeLevel({ towers: pair(159, 'fortress', 1) }))).toEqual([]);
    // L1 barracks warn only under 106 px, far inside the 150 px floor
    expect(spacingWarnings(makeLevel({ towers: pair(150) }))).toEqual([]);
  });

  it('reports the per-level minimum spacing and prints it as a table column', () => {
    expect(minSpacing(pair(212))).toBe(212);
    expect(minSpacing(pair(212).slice(0, 1))).toBeNull();
    const out = formatReport(validateLevels([makeLevel({ id: 1, towers: pair(212) })]));
    const [header, , row] = out.split('\n');
    expect(header).toMatch(/^id\s+name\s+band\s+towers\s+lanes\s+obstacles\s+mines\s+enemies\s+spacing\s+badge\s+status\s*$/);
    expect(row).toMatch(/\s212\s+-\s+ok\b/); // ok (2 warning(s)): the synthetic level has no translations
    expect(out).toMatch(/\n1 level\(s\) valid\./);
    expect(out).not.toMatch(/badge moves off the roof/);
  });
});

describe('LV-20: badges near the top of the map', () => {
  it('topBadgeMinY is where the renderer stops flipping the badge (worldChips badgeCentre, flat map, no card)', () => {
    const bs = badgeScale(1);
    const minY = badgeMinY(null, bs);
    expect(minY).toBe(HUD.mapTop + 26);
    for (const k of KINDS) {
      for (const lv of [1, 2, 3]) {
        const y0 = topBadgeMinY(k, lv);
        const lift = (badgeY(k, lv) + 18) * WORLD_ZOOM.tower - 18 * WORLD_ZOOM.badge;
        const flips = (y: number) => badgeCentre(y + lift, minY, y, zoomedPlinth(k, lv), bs).below;
        expect(flips(y0 + 0.01), `${k} L${lv} at ${y0}`).toBe(false);
        expect(flips(y0 - 0.01), `${k} L${lv} at ${y0}`).toBe(true);
      }
    }
    expect(+topBadgeMinY('barracks', 1).toFixed(1)).toBe(232.9);
    expect(+topBadgeMinY('artillery', 1).toFixed(1)).toBe(186.1);
    expect(+topBadgeMinY('tankFactory', 1).toFixed(1)).toBe(214.7);
    expect(+topBadgeMinY('fortress', 1).toFixed(1)).toBe(225.1);
  });

  it('notes (never warns about) a tower whose badge cannot sit above its roof, with the side the renderer picks', () => {
    const at = (y: number, kind: TowerKind = 'barracks'): TowerDef[] => [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
      { id: 'e', x: 360, y, owner: 'enemy1', units: 10, kind },
    ];
    const high = makeLevel({ id: 1, towers: at(200) });
    expect(topBadgeNotes(high).map((n) => n.text)).toEqual([
      'tower e (y 200): a barracks L1 needs y ≥ 233 for its badge to sit above the roof — it moves below the tower',
    ]);
    expect(spacingWarnings(high)).toEqual([]);
    const report = validateLevels([high])[0]!;
    expect(report.topBadges.map((n) => n.side)).toEqual(['below']);
    expect(report.warnings.some((w) => w.includes('roof'))).toBe(false);
    const out = formatReport([report]);
    expect(out.split('\n')[2]).toMatch(/\sbelow\s+ok\b/);
    expect(out.endsWith('1 level(s) have a tower whose badge moves off the roof (expected since ART-24).')).toBe(true);
    // a neighbour right under the base takes the below spot: the badge goes beside
    const crowded = makeLevel({ id: 1, towers: [...at(200), { id: 'n', x: 360, y: 360, owner: 'neutral', units: 5 }] });
    expect(topBadgeNotes(crowded).map((n) => n.side)).toEqual(['beside']);
    expect(formatReport(validateLevels([crowded])).split('\n')[2]).toMatch(/\sbeside\?\s+ok\b/);
    expect(topBadgeNotes(makeLevel({ towers: at(240) }))).toEqual([]);
    // a low artillery roof leaves room higher up
    expect(topBadgeNotes(makeLevel({ towers: at(200, 'artillery') }))).toEqual([]);
  });
});

describe('LV-20: the shipped campaign', () => {
  const reports = validateLevels(LEVELS);

  it('every level passes the spacing rule and no pair is under the warning line', () => {
    expect(LEVELS.length).toBe(50);
    for (const level of LEVELS) {
      expect(validateSpacing(level.towers), `level ${level.id}`).toEqual([]);
      expect(
        spacingWarnings(level).filter((w) => w.includes('badges will have to move')),
        `level ${level.id}`,
      ).toEqual([]);
    }
  });

  it('pins the measured minimums (2026-10-15): level 3 is the closest pair, level 40 the tightest against its footprint', () => {
    const spacings = reports.map((r) => r.minSpacing!);
    expect(Math.min(...spacings)).toBeCloseTo(Math.hypot(105, 110), 6); // level 3 home – west / east, 152.1 px
    expect(reports.find((r) => r.id === 3)!.minSpacing).toBeCloseTo(152.1, 1);
    let tight = { ratio: Infinity, level: 0, pair: '' };
    for (const level of LEVELS) {
      const ts = level.towers;
      for (let i = 0; i < ts.length; i++) {
        for (let j = i + 1; j < ts.length; j++) {
          const a = ts[i]!;
          const b = ts[j]!;
          const need = minTowerSpacing({ kind: a.kind ?? 'barracks', level: a.level ?? 1 }, { kind: b.kind ?? 'barracks', level: b.level ?? 1 });
          const ratio = Math.hypot(a.x - b.x, a.y - b.y) / need;
          if (ratio < tight.ratio) tight = { ratio, level: level.id, pair: `${a.id}-${b.id}` };
        }
      }
    }
    expect(tight.level).toBe(40);
    expect(tight.pair).toBe('fort-guns');
    expect(tight.ratio).toBeCloseTo(180 / 126.4, 6);
    expect(tight.ratio).toBeGreaterThan(TOWER_SPACING_WARN_FACTOR);
  });

  it('the top-of-map notes name exactly the towers the renderer moves off the roof, and are not warnings', () => {
    const bs = badgeScale(1);
    for (const level of LEVELS) {
      const wants: BadgeWant[] = level.towers.map((t) => {
        const kind = t.kind ?? 'barracks';
        const lv = t.level ?? 1;
        const lift = (badgeY(kind, lv) + 18) * WORLD_ZOOM.tower - 18 * WORLD_ZOOM.badge;
        return { id: t.id, x: t.x, y: t.y, bs, w: 60, h: 36 * bs, naturalY: t.y + lift, plinth: zoomedPlinth(kind, lv) };
      });
      const moved = [...placeBadges(wants, null)].filter(([, p]) => p.side !== 'above').map(([id, p]) => `${id}:${p.side === 'below' ? 'below' : 'beside'}`);
      const noted = topBadgeNotes(level).map((n) => `${n.tower}:${n.side}`);
      expect(noted.sort(), `level ${level.id}`).toEqual(moved.sort());
      expect(spacingWarnings(level), `level ${level.id}`).toEqual([]);
    }
    const reports = validateLevels(LEVELS);
    expect(reports.filter((r) => r.topBadges.length > 0).map((r) => r.id)).toEqual([3, 5, 7, 8, 12, 13, 19, 23, 34, 36, 37, 38, 40, 45, 46, 48, 50]);
    // the warning count is back to the two pre-existing lane warnings (levels 32 and 48)
    expect(reports.filter((r) => r.warnings.length > 0).map((r) => r.id)).toEqual([32, 48]);
    const out = formatReport(reports);
    expect(out).toMatch(/\n50 level\(s\) valid\. 2 with warnings\.\n17 level\(s\) have a tower whose badge moves off the roof \(expected since ART-24\)\.$/);
  });
});
