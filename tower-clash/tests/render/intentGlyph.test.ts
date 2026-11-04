import { beforeAll, describe, expect, it } from 'vitest';
import { makeLevel } from '../helpers';
import { createState } from '../../src/sim/create';
import type { GameState, LevelDef } from '../../src/sim/types';
import { DEFAULT_PALETTE } from '../../src/render/palette';
import { FLAT } from '../../src/render/camera';
import { ParticleSystem, loadEconomyBursts } from '../../src/render/particles';
import type { MarksLayout } from '../../src/render/particles';
import { towerBodyRect } from '../../src/render/worldChips';
import type { BadgeSide } from '../../src/render/worldChips';
import { INTENT_FADE_MS, INTENT_GAP, INTENT_MS, INTENT_PX, intentGlyphRect, intentGlyphs, rusherAngle } from '../../src/render/intentGlyph';
import type { IntentUi } from '../../src/render/intentGlyph';
import level4 from '../../src/levels/004-build-up.json';
import level23 from '../../src/levels/023-first-blood.json';

/*
 * AUD-A10 (GDD §4 "AUD-A10 2026-11-04"): five lesson cards name a personality ("the rusher", "the
 * enemy turtles"), so each enemy's starting tower shows its intent glyph — rusher arrow, turtle shield,
 * opportunist eye — for the first INTENT_MS of sim time, owner-coloured with an ink outline, fading
 * over the last INTENT_FADE_MS (reduced motion: static); never while the lesson card holds the match,
 * never on a neutral or player tower, never over a badge (the AUD-F3 / F5b even-odd pill clip).
 */

interface Call {
  fn: string;
  args: unknown[];
  fill: unknown;
  stroke: unknown;
  alpha: number;
}

function recCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const store: Record<string | symbol, unknown> = { globalAlpha: 1 };
  const calls: Call[] = [];
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_t, key) {
      if (key in store) return store[key];
      return (...args: unknown[]) => void calls.push({ fn: String(key), args, fill: store.fillStyle, stroke: store.strokeStyle, alpha: store.globalAlpha as number });
    },
    set(_t, key, value) {
      store[key] = value;
      return true;
    },
  });
  return { ctx, calls };
}

/** Player home `p`, a neutral `n`; enemy1 (rusher) starts on `r1` (8) and `r2` (14 → its start), enemy2 (turtle) `t`, enemy3 (opportunist) `o`. */
function three(): LevelDef {
  return makeLevel({
    enemies: [
      { owner: 'enemy1', personality: 'rusher', aggression: 0.5 },
      { owner: 'enemy2', personality: 'turtle', aggression: 0.5 },
      { owner: 'enemy3', personality: 'opportunist', aggression: 0.5 },
    ],
    towers: [
      { id: 'p', x: 360, y: 1000, owner: 'player', units: 10 },
      { id: 'n', x: 360, y: 700, owner: 'neutral', units: 5 },
      { id: 'r1', x: 160, y: 300, owner: 'enemy1', units: 8 },
      { id: 'r2', x: 160, y: 500, owner: 'enemy1', units: 14 },
      { id: 't', x: 360, y: 300, owner: 'enemy2', units: 10 },
      { id: 'o', x: 560, y: 300, owner: 'enemy3', units: 10 },
    ],
  });
}

const at = (state: GameState, ms: number): GameState => ({ ...state, time: ms });

/** A badge above every tower (side `side`) and its drawn body. */
function layoutOf(state: GameState, side: BadgeSide = 'above'): MarksLayout {
  const towers = Object.values(state.towers);
  const badges = new Map(towers.map((t) => [t.id, { rect: { x: t.x - 30, y: t.y - 120, w: 60, h: 40 }, bs: 1, side }]));
  const bodies = new Map(towers.map((t) => [t.id, towerBodyRect(t.kind, t.level, { x: t.x, y: t.y, s: 1 })]));
  return { badges, chips: [], bodies };
}

describe('intentGlyphs (which, where, when)', () => {
  const level = three();
  const ui: IntentUi = { level, cardUp: false };
  const state = createState(level, 1);

  it('one glyph per enemy, its personality from the level, on the tower it starts with the most units on', () => {
    expect(intentGlyphs(ui, state, false).map((g) => [g.towerId, g.owner, g.personality, g.alpha])).toEqual([
      ['r2', 'enemy1', 'rusher', 1],
      ['t', 'enemy2', 'turtle', 1],
      ['o', 'enemy3', 'opportunist', 1],
    ]);
  });

  it('only in the first 5 s of sim time, fading over the last second; reduced motion: static, then gone', () => {
    const alpha = (ms: number, reduced = false) => intentGlyphs(ui, at(state, ms), reduced)[0]?.alpha ?? null;
    expect(INTENT_MS).toBe(5000);
    expect(INTENT_FADE_MS).toBe(1000);
    expect(alpha(1000)).toBe(1);
    expect(alpha(4000)).toBe(1);
    expect(alpha(4500)).toBeCloseTo(0.5, 9);
    expect(alpha(4950)).toBeCloseTo(0.05, 9);
    expect(alpha(5000)).toBeNull();
    expect(alpha(60_000)).toBeNull();
    expect(alpha(4950, true)).toBe(1);
    expect(alpha(5000, true)).toBeNull();
  });

  it('hidden while the lesson card holds the match (AUD-B11), shown from the first frame after', () => {
    expect(intentGlyphs({ level, cardUp: true }, state, false)).toEqual([]);
    expect(intentGlyphs({ level, cardUp: true }, state, true)).toEqual([]);
    expect(intentGlyphs({ level }, state, false)).toHaveLength(3); // a frame that does not say (tools)
  });

  it('never on a neutral or player tower: a starting tower that changed hands loses its glyph', () => {
    const s = createState(level, 1);
    s.towers.t!.owner = 'player';
    s.towers.o!.owner = 'neutral';
    s.towers.r2!.owner = 'enemy2'; // even to another enemy: not that enemy's start
    expect(intentGlyphs(ui, s, false)).toEqual([]);
    expect(intentGlyphs(ui, state, false).some((g) => g.towerId === 'p' || g.towerId === 'n')).toBe(false);
  });

  it('the shipped cards that name a personality: 23 (rusher red, turtle green) and 4 (the turtle)', () => {
    const g23 = intentGlyphs({ level: level23 as LevelDef }, createState(level23 as LevelDef, 1), false);
    expect(g23.map((g) => [g.owner, g.personality])).toEqual([
      ['enemy1', 'rusher'],
      ['enemy2', 'turtle'],
    ]);
    for (const g of g23) expect(level23.towers.find((t) => t.id === g.towerId)?.owner).toBe(g.owner);
    const g4 = intentGlyphs({ level: level4 as LevelDef }, createState(level4 as LevelDef, 1), false);
    expect(g4.map((g) => [g.towerId, g.personality])).toEqual([['foe', 'turtle']]);
  });
});

describe('intentGlyphRect (off the badge)', () => {
  const badge = { x: 300, y: 200, w: 60, h: 40 };
  it.each<BadgeSide>(['above', 'below', 'right', 'left'])('%s: on the badge’s far side, INTENT_GAP (8 px) clear of it — over the owner emblem on its rim — scaled with the badge', (side) => {
    for (const bs of [1, 0.8]) {
      const g = intentGlyphRect({ rect: badge, bs, side });
      expect(g.w).toBeCloseTo(INTENT_PX * bs, 9);
      const gapX = Math.max(badge.x - (g.x + g.w), g.x - (badge.x + badge.w));
      const gapY = Math.max(badge.y - (g.y + g.h), g.y - (badge.y + badge.h));
      expect(INTENT_GAP).toBe(8);
      expect(Math.max(gapX, gapY)).toBeCloseTo(INTENT_GAP * bs, 9);
    }
    if (side === 'above') expect(intentGlyphRect({ rect: badge, bs: 1, side }).y + INTENT_PX).toBe(192);
  });
});

describe('drawn through the lazy marks hook', () => {
  beforeAll(async () => {
    await loadEconomyBursts();
  });
  const level = three();

  function frame(ui: IntentUi | undefined, ms: number, reduced = false) {
    const state = at(createState(level, 1), ms);
    const layout = layoutOf(state);
    const { ctx, calls } = recCtx();
    new ParticleSystem(reduced).drawMarks(ctx, DEFAULT_PALETTE, state, layout, 0, FLAT, ui);
    return { calls, layout, state };
  }

  it('each glyph is filled in its owner’s colour and outlined in ink, after an even-odd clip that cuts out every badge', () => {
    const { calls, layout } = frame({ level, cardUp: false }, 1000);
    const clip = calls.findIndex((c) => c.fn === 'clip');
    expect(calls[clip]!.args).toEqual(['evenodd']);
    // the world rect, then one pill (4 arcs) per badge — all six, the player's and the neutral's too
    expect(calls.slice(0, clip).filter((c) => c.fn === 'arcTo')).toHaveLength(6 * 4);
    // the glyphs' block: from that clip to its restore (three nested save / restore pairs inside)
    const end = calls.findIndex((c, i) => i > clip && c.fn === 'restore' && calls.slice(clip, i).filter((d) => d.fn === 'restore').length === 3);
    const block = calls.slice(clip, end + 1);
    expect(calls.slice(0, clip).some((c) => c.fn === 'fill' || c.fn === 'stroke')).toBe(false);
    expect(block.filter((c) => c.fn === 'fill').map((c) => c.fill)).toEqual([DEFAULT_PALETTE.owners.enemy1, DEFAULT_PALETTE.owners.enemy2, DEFAULT_PALETTE.owners.enemy3, DEFAULT_PALETTE.ink]);
    expect(block.filter((c) => c.fn === 'stroke').map((c) => c.stroke)).toEqual([DEFAULT_PALETTE.ink, DEFAULT_PALETTE.ink, DEFAULT_PALETTE.ink]);
    // placed above their own badges: the translate is the glyph's centre, INTENT_PX / 2 + INTENT_GAP over the badge top
    const moves = calls.filter((c) => c.fn === 'translate').map((c) => c.args);
    expect(moves).toEqual(['r2', 't', 'o'].map((id) => [layout.badges.get(id)!.rect.x + 30, layout.badges.get(id)!.rect.y - INTENT_GAP - INTENT_PX / 2]));
  });

  it('the rusher’s arrow points at the nearest player tower; turtle and opportunist are not rotated', () => {
    const { calls, layout, state } = frame({ level, cardUp: false }, 1000);
    const rot = calls.filter((c) => c.fn === 'rotate');
    expect(rot).toHaveLength(1);
    const a = rusherAngle(state, layout, 'r2');
    expect(rot[0]!.args[0]).toBe(a);
    expect(Math.cos(a)).toBeGreaterThan(0); // p (360, 1000) is right of and below r2 (160, 500)
    expect(Math.sin(a)).toBeGreaterThan(0.8);
  });

  it('nothing while the card holds, after 5 s, or for a frame without the play UI', () => {
    for (const [ui, ms] of [[{ level, cardUp: true }, 0], [{ level, cardUp: false }, 5000], [undefined, 1000]] as const) {
      expect(frame(ui, ms).calls.filter((c) => c.fn === 'translate')).toEqual([]);
    }
  });

  it('fades over the last second; reduced motion holds full opacity until 5 s', () => {
    const alphaOf = (ms: number, reduced: boolean) => frame({ level, cardUp: false }, ms, reduced).calls.find((c) => c.fn === 'fill')!.alpha;
    expect(alphaOf(4250, false)).toBeCloseTo(0.75, 9);
    expect(alphaOf(4250, true)).toBe(1);
  });
});
