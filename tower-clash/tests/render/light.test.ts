import { describe, expect, it } from 'vitest';
import type { Biome } from '../../src/render/palette';
import { BADGE_LIP, BIOME_LIGHT, COLOR_BLIND_PALETTE, DEFAULT_PALETTE, composite, litGround, rimOf, shade } from '../../src/render/palette';
import {
  CAPTURE_CHIPS,
  CAPTURE_FLASH_MS,
  FRIENDLY_LAND_MS,
  LAND_TOKENS_MAX,
  LAND_TOKENS_PER_S,
  ParticleSystem,
  UPGRADE_SPARKLES,
} from '../../src/render/particles';
import { LINK_GLOW_ALPHA, LINK_GLOW_PX, STREAM_PULSE_MS, linkPulse } from '../../src/render/draw';
import { createState } from '../../src/sim/create';
import { makeLevel } from '../helpers';

/*
 * ART-23 colour and effects pass. (A) the baked key light (`BIOME_LIGHT`): the ground's extremes under
 * it (`litGround`: the warm lit pool, the cool near / lower-right rim) must keep the readability rules
 * of biome.test.ts — every owner mid tone of both palettes stays a different colour from the ground
 * (never more than 8 ΔE closer than on the unlit mid tone, never under ΔE 21), the twilight streams' ink
 * outline keeps ≥ 3:1 — and the clay rim / badge lip helpers keep their contrast. (B) the combat juice
 * is rate-limited and silent under reduced motion.
 */

/* WCAG contrast and CIE76 ΔE, as in biome.test.ts (copied: importing a test file would re-register its tests). */
const channel = (h: string, i: number): number => {
  const c = parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string): number => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
const contrast = (a: string, b: string): number => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
function lab(hex: string): [number, number, number] {
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [r, g, b] = [channel(hex, 0), channel(hex, 1), channel(hex, 2)];
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const deltaE = (a: string, b: string): number => {
  const p = lab(a);
  const q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

const BIOMES: Biome[] = ['grass', 'autumn', 'sand', 'snow', 'volcanic', 'twilight'];
const INK = DEFAULT_PALETTE.ink;
/** How much closer (ΔE) the light may bring an owner colour to the ground, and the absolute floor. */
const LIGHT_MAX_DE_LOSS = 8;
const LIGHT_MIN_DE = 21;

describe('ART-23 baked ground light', () => {
  it('composite / litGround mix like a translucent wash', () => {
    expect(composite('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(composite('#123456', '#abcdef', 0)).toBe('#123456');
    expect(composite('#123456', '#abcdef', 1)).toBe('#abcdef');
    const g = DEFAULT_PALETTE.biomes.grass.grass.mid;
    const e = litGround(g, BIOME_LIGHT.grass);
    expect(luminance(e.lit)).toBeGreaterThan(luminance(g)); // the light side is lighter …
    expect(luminance(e.shade)).toBeLessThan(luminance(g)); // … the near rim darker
  });

  it('every biome has a light: warm toward the light, darker toward the near rim, all alphas modest', () => {
    for (const b of BIOMES) {
      const L = BIOME_LIGHT[b];
      for (const hex of [L.warm, L.cool]) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      for (const a of [L.warmAlpha, L.coolAlpha, L.vignette]) {
        expect(a).toBeGreaterThan(0);
        expect(a).toBeLessThanOrEqual(0.4);
      }
      const g = DEFAULT_PALETTE.biomes[b].grass.mid;
      const e = litGround(g, L);
      expect(luminance(e.shade), b).toBeLessThan(luminance(g));
      // visible: the two extremes differ by more than a just-noticeable difference
      expect(deltaE(e.lit, e.shade), b).toBeGreaterThan(8);
    }
  });

  it('owner colours of both palettes stay distinct from the lit and shaded ground', () => {
    for (const b of BIOMES) {
      const g = DEFAULT_PALETTE.biomes[b].grass.mid;
      const e = litGround(g, BIOME_LIGHT[b]);
      for (const pal of [DEFAULT_PALETTE, COLOR_BLIND_PALETTE]) {
        for (const [owner, tones] of Object.entries(pal.ownerTones)) {
          const base = deltaE(tones.mid, g);
          for (const [side, ground] of Object.entries(e)) {
            const de = deltaE(tones.mid, ground);
            expect(de, `${b} ${side} ${owner} ${tones.mid} on ${ground} (unlit ${base.toFixed(1)})`).toBeGreaterThanOrEqual(Math.min(base, 40) - LIGHT_MAX_DE_LOSS);
            expect(de, `${b} ${side} ${owner}`).toBeGreaterThanOrEqual(LIGHT_MIN_DE);
          }
        }
      }
    }
  });

  it('the twilight streams’ ink outline keeps ≥ 3:1 on both extremes of the light', () => {
    const tw = DEFAULT_PALETTE.biomes.twilight.grass;
    const e = litGround(tw.mid, BIOME_LIGHT.twilight);
    expect(contrast(INK, e.lit)).toBeGreaterThanOrEqual(3);
    expect(contrast(INK, e.shade)).toBeGreaterThanOrEqual(3);
  });
});

describe('ART-23 clay rims and badge lip', () => {
  it('rimOf is lighter than every owner lit tone in both palettes', () => {
    for (const pal of [DEFAULT_PALETTE, COLOR_BLIND_PALETTE]) {
      for (const tones of Object.values(pal.ownerTones)) {
        const rim = rimOf(tones);
        expect(rim).toMatch(/^#[0-9a-f]{6}$/);
        expect(luminance(rim)).toBeGreaterThan(luminance(tones.lit));
      }
    }
  });

  it('the colour-blind palette keeps distinct owner hues on the stronger roof split (lit, mid, shade, rim)', () => {
    const t = COLOR_BLIND_PALETTE.ownerTones;
    const owners = ['player', 'enemy1', 'enemy2', 'enemy3'] as const;
    for (const a of owners) for (const b of owners) if (a < b) for (const k of ['lit', 'mid', 'shade'] as const) expect(deltaE(t[a][k], t[b][k]), `${a}/${b} ${k}`).toBeGreaterThan(30);
  });

  it('ink numerals stay ≥ 4.5:1 on the badge lip of every badge paper', () => {
    const pal = DEFAULT_PALETTE;
    for (const paper of [pal.paper, pal.badgeAlert, pal.badgeFull]) expect(contrast(INK, shade(paper, -BADGE_LIP)), paper).toBeGreaterThanOrEqual(4.5);
  });
});

describe('ART-23 combat juice', () => {
  const tones = DEFAULT_PALETTE.ownerTones.player;

  it('a capture spawns the flash ring, the paper flash and CAPTURE_CHIPS chips thrown sideways; the badge flash fades', () => {
    const fx = new ParticleSystem(false);
    fx.capture(100, 500, tones.mid, 't', 'neutral', 1000, false, tones);
    expect(CAPTURE_CHIPS).toBeGreaterThanOrEqual(8);
    expect(CAPTURE_CHIPS).toBeLessThanOrEqual(12);
    expect(fx.count).toBe(3 + CAPTURE_CHIPS + 8);
    expect(fx.captureFlash('t', 1000)).toBe(1);
    expect(fx.captureFlash('t', 1000 + CAPTURE_FLASH_MS / 2)).toBeGreaterThan(0);
    expect(fx.captureFlash('t', 1000 + CAPTURE_FLASH_MS)).toBe(0);
    expect(fx.captureFlash('other', 1000)).toBe(0);
  });

  it('reinforcement bursts are rate-limited per tower and by the shared landing bucket', () => {
    const fx = new ParticleSystem(false);
    fx.reinforce('a', 0, 0, tones, 1000);
    const one = fx.count;
    expect(one).toBe(4); // a faint ring + three sparks
    fx.reinforce('a', 0, 0, tones, 1000 + FRIENDLY_LAND_MS - 1);
    expect(fx.count).toBe(one);
    fx.reinforce('a', 0, 0, tones, 1000 + FRIENDLY_LAND_MS);
    expect(fx.count).toBe(2 * one);
    // many towers in one instant: the bucket lets LAND_TOKENS_MAX through (two already spent), then nothing
    const burst = new ParticleSystem(false);
    for (let i = 0; i < 40; i++) burst.reinforce(`t${i}`, 0, 0, tones, 5000);
    expect(burst.count).toBe(LAND_TOKENS_MAX * one);
    // a second later the bucket has refilled at LAND_TOKENS_PER_S (capped)
    for (let i = 0; i < 40; i++) burst.reinforce(`u${i}`, 0, 0, tones, 6000);
    expect(burst.count).toBe(LAND_TOKENS_MAX * one + Math.min(LAND_TOKENS_MAX, LAND_TOKENS_PER_S) * one);
  });

  it('a stream pulses once, STREAM_PULSE_MS from the first frame it is drawn; its glow is one faint wide stroke', () => {
    const link = { owner: 'player', from: 'a', to: 'b' };
    expect(linkPulse(link, 1000)).toBe(0);
    expect(linkPulse(link, 1000 + STREAM_PULSE_MS / 2)).toBeCloseTo(0.5, 5);
    expect(linkPulse(link, 1000 + STREAM_PULSE_MS)).toBe(1); // done: drawLinks draws no pulse at ≥ 1
    expect(linkPulse({ ...link }, 5000)).toBe(0); // another link object starts its own
    expect(STREAM_PULSE_MS).toBeLessThanOrEqual(400);
    expect(LINK_GLOW_ALPHA).toBeLessThanOrEqual(0.25);
    expect(LINK_GLOW_PX).toBeGreaterThan(0);
  });

  it('the upgrade fountain throws UPGRADE_SPARKLES sparkles out to both sides of the badge column', () => {
    const fx = new ParticleSystem(false);
    const spawned: { vx: number; vy: number }[] = [];
    const push = fx.push.bind(fx);
    fx.push = (p) => {
      if (p.kind === 'glint') spawned.push({ vx: p.vx, vy: p.vy });
      push(p);
    };
    fx.upgrade('t', 0, 0, DEFAULT_PALETTE.gold, 0, 60);
    expect(spawned).toHaveLength(UPGRADE_SPARKLES);
    for (const s of spawned) {
      expect(s.vy).toBeLessThan(0); // upward
      expect(Math.abs(s.vx)).toBeGreaterThan(Math.abs(s.vy) * 0.4); // at least ~25° off vertical
    }
    expect(spawned.some((s) => s.vx < 0) && spawned.some((s) => s.vx > 0)).toBe(true);
  });

  it('sim events drive the juice: a hostile landing on a neutral bursts (rate-limited), a reinforcement too', () => {
    const state = createState(
      makeLevel({
        towers: [
          { id: 'p', x: 360, y: 1000, owner: 'player', units: 20 },
          { id: 'n', x: 360, y: 700, owner: 'neutral', units: 10 },
        ],
      }),
      1,
    );
    const fx = new ParticleSystem(false);
    const pal = DEFAULT_PALETTE;
    fx.onEvents([{ type: 'landed', towerId: 'n', owner: 'player', weight: 1, hostile: true }], state, pal, 1000);
    const hit = fx.count;
    expect(hit).toBe(2 + 4); // impact ring + hit flash + four sparks
    fx.onEvents([{ type: 'landed', towerId: 'n', owner: 'player', weight: 1, hostile: true }], state, pal, 1050);
    expect(fx.count).toBe(hit); // inside the per-tower interval
    fx.onEvents([{ type: 'landed', towerId: 'p', owner: 'player', weight: 1, hostile: false }], state, pal, 1060);
    expect(fx.count).toBe(hit + 4);
  });

  it('nothing new spawns and the badge never flashes under prefers-reduced-motion', () => {
    const fx = new ParticleSystem(true);
    fx.capture(0, 0, tones.mid, 't', 'neutral', 0, true, tones);
    fx.reinforce('t', 0, 0, tones, 0);
    fx.impact(0, 0, tones.mid);
    fx.upgrade('t', 0, 0, DEFAULT_PALETTE.gold, 0, 60);
    expect(fx.count).toBe(0);
    expect(fx.captureFlash('t', 10)).toBe(0);
  });
});
