import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BADGE_MIN_SCALE, FLAT, ISLAND_FAR_Y, TILT_DEFAULT, TILT_MIN, TILT_PERSPECTIVE, depth, horizonY, jacY, loadCamera, normaliseTilt, playCamera, proj, projAngle, projDir, projY, setTilt, unproj, unprojY } from '../../src/render/camera';
import { FAR_SHORE_Y, makeCamera } from '../../src/render/perspective';
import { HUD, TOWER_HIT_RADIUS, WORLD_ZOOM } from '../../src/render/layout';
import { towerFootprintRadius, towerTop } from '../../src/render/sprites';
import { hitTower } from '../../src/input/pointer';
import { createState } from '../../src/sim/index';
import { makeLevel } from '../helpers';

/*
 * ART-21 play camera v2: a plane homography of the ground (lines stay lines), depth scale 1 at the
 * near edge and k at the far edge, exact inverse; ?tilt=0 is the identity. ART-24: the default is the
 * flat map again (identity) with bigger standing things (WORLD_ZOOM); the perspective camera is the
 * `?tilt=0.72` override (TILT_PERSPECTIVE), checked here through `makeCamera`.
 */
describe('play camera (ART-21)', () => {
  beforeAll(() => loadCamera()); // PERF-9: the perspective camera is a lazy chunk; until it lands a tilt draws flat
  afterEach(() => setTilt(undefined));

  it('defaults to the flat map (ART-24); setTilt(0.72) is the perspective camera, setTilt(0) flat again, other values clamp to TILT_MIN..1', () => {
    expect(TILT_DEFAULT).toBe(1);
    expect(playCamera()).toBe(FLAT);
    for (const [x, y] of [
      [0, 0],
      [360, 640],
      [700, 1250],
    ] as const) {
      expect(proj(playCamera(), x, y)).toEqual({ x, y, s: 1 });
      expect(unproj(playCamera(), x, y)).toEqual({ x, y });
    }
    expect(horizonY(playCamera())).toBeUndefined();
    setTilt(TILT_PERSPECTIVE);
    expect(playCamera().k).toBe(TILT_PERSPECTIVE);
    expect(playCamera()).toBe(playCamera()); // stable object per value
    setTilt(0);
    expect(playCamera()).toBe(FLAT);
    expect(proj(FLAT, 123, 456)).toEqual({ x: 123, y: 456, s: 1 });
    expect(unproj(FLAT, 123, 456)).toEqual({ x: 123, y: 456 });
    setTilt(0.65);
    expect(playCamera().k).toBe(0.65);
    setTilt(0.1);
    expect(playCamera().k).toBe(TILT_MIN);
    expect(normaliseTilt(1.4)).toBe(1);
    expect(normaliseTilt(Number.NaN)).toBeUndefined();
  });

  it('narrows the far edge to k, keeps the near edge, lands the far shore on FAR_SHORE_Y and inverts exactly', () => {
    const cam = makeCamera(TILT_PERSPECTIVE);
    expect(depth(cam, HUD.mapBottom)).toBeCloseTo(1, 12);
    expect(depth(cam, HUD.mapTop)).toBeCloseTo(cam.k, 12);
    expect(projY(cam, HUD.mapBottom)).toBeCloseTo(HUD.mapBottom, 9);
    expect(projY(cam, ISLAND_FAR_Y)).toBeCloseTo(FAR_SHORE_Y, 9);
    // the centre column stays put; the far edge's corners move inward by (1 − k) of their offset
    expect(proj(cam, 360, 500).x).toBeCloseTo(360, 9);
    expect(proj(cam, 0, HUD.mapTop).x).toBeCloseTo(360 * (1 - cam.k), 9);
    for (const [x, y] of [
      [0, 0],
      [720, HUD.mapTop],
      [100, 640],
      [650, HUD.mapBottom],
      [360, 1280],
    ] as const) {
      const p = proj(cam, x, y);
      const back = unproj(cam, p.x, p.y);
      expect(back.x).toBeCloseTo(x, 9);
      expect(back.y).toBeCloseTo(y, 9);
      expect(unprojY(cam, p.y)).toBeCloseTo(y, 9);
    }
    // every map point of the play band is drawn inside the band: nothing moves under the HUD
    expect(projY(cam, HUD.mapTop)).toBeGreaterThan(HUD.mapTop);
    expect(projY(cam, HUD.mapBottom)).toBeLessThanOrEqual(HUD.mapBottom + 1e-9);
    // y stays monotonic (painter's order by map y = by screen y) and the far ground is foreshortened more
    expect(jacY(cam, HUD.mapTop)).toBeLessThan(jacY(cam, HUD.mapBottom));
    expect(jacY(cam, 640)).toBeGreaterThan(0);
  });

  it('maps straight lines to straight lines (a homography): a lane midpoint lands on the projected chord', () => {
    const cam = makeCamera(TILT_PERSPECTIVE);
    const a = { x: 100, y: 1100 };
    const b = { x: 620, y: 200 };
    const pa = proj(cam, a.x, a.y);
    const pb = proj(cam, b.x, b.y);
    for (const t of [0.2, 0.5, 0.8]) {
      const p = proj(cam, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      // the cross product of (pb − pa) and (p − pa) is 0 on the chord
      const cross = (pb.x - pa.x) * (p.y - pa.y) - (pb.y - pa.y) * (p.x - pa.x);
      expect(Math.abs(cross)).toBeLessThan(1e-6);
    }
  });

  it('projects directions, keeps badges readable and puts the horizon haze just past the far shore', () => {
    const cam = makeCamera(TILT_PERSPECTIVE);
    const d = projDir(cam, 200, 600, 0, -1);
    expect(Math.hypot(d.dx, d.dy)).toBeCloseTo(1, 9);
    expect(d.dy).toBeLessThan(0); // up the screen
    expect(d.dx).toBeGreaterThan(0); // toward the centre column as it recedes
    expect(projAngle(cam, 360, 600, 0)).toBeCloseTo(0, 9);
    expect(BADGE_MIN_SCALE * 26).toBeCloseTo(24, 9); // ART-17: 24 px numerals
    expect(horizonY(FLAT)).toBeUndefined();
    expect(horizonY(cam)).toBeGreaterThan(projY(cam, ISLAND_FAR_Y));
  });

  describe('tower hit areas under the camera (QA-23)', () => {
    const cam = makeCamera(TILT_PERSPECTIVE);
    const project = (x: number, y: number) => proj(cam, x, y);
    const state = createState(
      makeLevel({
        towers: [
          { id: 'far', x: 360, y: 230, owner: 'enemy1', units: 5, level: 1, kind: 'fortress' },
          { id: 'farL', x: 300, y: 250, owner: 'neutral', units: 5 },
          { id: 'near', x: 200, y: 1100, owner: 'player', units: 5 },
        ],
      }),
      1,
    );
    /** The map point drawn at screen point (x, y). */
    const at = (x: number, y: number) => unproj(cam, x, y);

    it('never shrinks a far tower below the flat radius: a tap 50 px beside its base hits (radius × s would miss)', () => {
      const p = proj(cam, 360, 230);
      expect(p.s).toBeLessThan(0.8);
      expect(50).toBeGreaterThan(TOWER_HIT_RADIUS * p.s);
      expect(50).toBeLessThan(TOWER_HIT_RADIUS);
      const m = at(p.x + 50, p.y);
      expect(hitTower(state, m.x, m.y, TOWER_HIT_RADIUS, project)?.id).toBe('far');
      const out = at(p.x + TOWER_HIT_RADIUS + 3, p.y);
      expect(hitTower(state, out.x, out.y, TOWER_HIT_RADIUS, project)).toBeNull();
    });

    it("takes a tap on the roof of the drawn building, and misses above the roof by more than the radius", () => {
      const p = proj(cam, 360, 230);
      const roof = towerTop('fortress', 1) * WORLD_ZOOM.tower * p.s;
      const onRoof = at(p.x, p.y - roof * 0.9);
      expect(hitTower(state, onRoof.x, onRoof.y, TOWER_HIT_RADIUS, project)?.id).toBe('far');
      const justAbove = at(p.x, p.y - roof - TOWER_HIT_RADIUS * 0.9);
      expect(hitTower(state, justAbove.x, justAbove.y, TOWER_HIT_RADIUS, project)?.id).toBe('far');
      const above = at(p.x, p.y - (roof + TOWER_HIT_RADIUS) * 1.25);
      expect(hitTower(state, above.x, above.y, TOWER_HIT_RADIUS, project)).toBeNull();
      // the flat map (no projection) keeps the plain base circle: the same map point is far outside it
      expect(hitTower(state, onRoof.x, onRoof.y)).toBeNull();
    });

    it('resolves overlapping capsules of neighbouring far towers to the nearest base', () => {
      const a = proj(cam, 360, 230);
      const b = proj(cam, 300, 250);
      // a point between the two bases, nearer b's
      const mid = at(a.x + (b.x - a.x) * 0.6, a.y + (b.y - a.y) * 0.6);
      expect(hitTower(state, mid.x, mid.y, TOWER_HIT_RADIUS, project)?.id).toBe('farL');
      const nearA = at(a.x + (b.x - a.x) * 0.3, a.y + (b.y - a.y) * 0.3);
      expect(hitTower(state, nearA.x, nearA.y, TOWER_HIT_RADIUS, project)?.id).toBe('far');
      // a near tower keeps its flat target
      const n = proj(cam, 200, 1100);
      const side = at(n.x + TOWER_HIT_RADIUS - 2, n.y);
      expect(hitTower(state, side.x, side.y, TOWER_HIT_RADIUS, project)?.id).toBe('near');
    });
  });

  describe('ART-24 flat default: zoomed hit radius and roof capsule', () => {
    const project = (x: number, y: number) => proj(FLAT, x, y);
    const state = createState(
      makeLevel({
        towers: [
          { id: 'a', x: 200, y: 600, owner: 'player', units: 5, level: 1, kind: 'barracks' },
          { id: 'b', x: 520, y: 600, owner: 'neutral', units: 5 },
        ],
      }),
      1,
    );

    it('the hit radius follows the tower zoom (44 → 57) and the roof of the zoomed building takes a tap', () => {
      expect(TOWER_HIT_RADIUS).toBe(Math.round(44 * WORLD_ZOOM.tower));
      expect(TOWER_HIT_RADIUS).toBe(57);
      expect(hitTower(state, 200 + TOWER_HIT_RADIUS - 1, 600, TOWER_HIT_RADIUS, project)?.id).toBe('a');
      expect(hitTower(state, 200 + TOWER_HIT_RADIUS + 3, 600, TOWER_HIT_RADIUS, project)).toBeNull();
      const roof = towerTop('barracks', 1) * WORLD_ZOOM.tower;
      expect(roof).toBeGreaterThan(TOWER_HIT_RADIUS);
      expect(hitTower(state, 200, 600 - roof * 0.95, TOWER_HIT_RADIUS, project)?.id).toBe('a');
      expect(hitTower(state, 200, 600 - roof - TOWER_HIT_RADIUS - 3, TOWER_HIT_RADIUS, project)).toBeNull();
      // without the projection (other callers): the plain base circle
      expect(hitTower(state, 200, 600 - roof * 0.95)).toBeNull();
    });
  });

  describe('BUG-44: a base circle beats a roof capsule, a drawn body on top beats one under it', () => {
    const project = (x: number, y: number) => proj(FLAT, x, y);
    // level 48: the neutral court stands inside the keep's roof capsule; two barracks whose bodies overlap
    const state = createState(
      makeLevel({
        towers: [
          { id: 'court', x: 360, y: 930, owner: 'neutral', units: 5, kind: 'fortress' },
          { id: 'home', x: 360, y: 1150, owner: 'player', units: 5, level: 3, kind: 'barracks' },
          { id: 'p', x: 300, y: 600, owner: 'neutral', units: 5 },
          { id: 'q', x: 330, y: 650, owner: 'neutral', units: 5 },
        ],
      }),
      1,
    );
    const hit = (x: number, y: number) => hitTower(state, x, y, TOWER_HIT_RADIUS, project)?.id;

    it("a tap in the court's base circle is the court's, even on the keep's drawn body; past it the keep", () => {
      const roof = 1150 - towerTop('barracks', 3) * WORLD_ZOOM.tower;
      expect(930 - roof + TOWER_HIT_RADIUS, 'the court base lies inside the keep capsule').toBeGreaterThan(0);
      expect(hit(360, 930)).toBe('court');
      expect(hit(380, 975)).toBe('court'); // 49 px from the court base, on the keep's body
      expect(hit(360, 995)).toBe('home'); // 65 px below the court base: outside its circle, on the keep
    });

    it('two bodies under the tap: the one painted last (the lower base) takes it; the capsule margin goes to the nearest base', () => {
      const plinth = towerFootprintRadius('barracks', 1) * WORLD_ZOOM.tower;
      const roofQ = 650 - towerTop('barracks', 1) * WORLD_ZOOM.tower;
      // (330, 549): on both bodies (30 / 0 px off the columns, under both roofs, above both bases), outside
      // both base circles (59 / 101 px from the bases): q, painted over p, takes it although p's base is nearer
      expect(30).toBeLessThan(plinth);
      expect(549).toBeGreaterThan(roofQ);
      expect(Math.hypot(30, 51)).toBeGreaterThan(TOWER_HIT_RADIUS);
      expect(hit(330, 549)).toBe('q');
      // (340, 530): in both capsules but on neither body (40 px off p's column, above q's roof): nearest base
      expect(40).toBeGreaterThan(plinth);
      expect(hit(340, 530)).toBe('p');
    });
  });
});
