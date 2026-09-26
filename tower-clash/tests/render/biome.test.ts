import { describe, expect, it } from 'vitest';
import type { Biome, BiomeColors } from '../../src/render/palette';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE, DEFAULT_THEME, biomeFor, loadThemes, themeFor, themedBiome } from '../../src/render/palette';

/*
 * ART-8 "twilight highlands" (band 5, levels 41–50): the sixth biome must resolve for the band and
 * keep the ART_DIRECTION §6 readability rules on its darker ground — ink numerals ≥ 4.5:1 on every
 * badge paper, the streams' 1 px ink outline ≥ 3:1 (WCAG non-text) on the moor, every owner mid
 * tone of both palettes perceptually distinct from the ground, and the moor itself distinct from
 * volcanic ash at a glance. The helpers are the WCAG relative-luminance contrast ratio and a plain
 * CIE76 ΔE (sRGB → Lab, D65) — small and dependency-free, so the thresholds are numbers, not opinions.
 */

const channel = (h: string, i: number): number => {
  const c = parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.x relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
}

/** WCAG contrast ratio, ≥ 1. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function lab(hex: string): [number, number, number] {
  const r = channel(hex, 0);
  const g = channel(hex, 1);
  const b = channel(hex, 2);
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIE76 colour difference; ≈ 2.3 is a just-noticeable difference, > 30 reads as a different colour at a glance. */
export function deltaE(a: string, b: string): number {
  const p = lab(a);
  const q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** ART_DIRECTION §6: numerals on badges. */
const NUMERAL_MIN = 4.5;
/** WCAG 1.4.11 non-text contrast: the stream ribbons' ink outline on the ground. */
const OUTLINE_MIN = 3;
/** Owner clay vs the ground mid tone it stands on (the weakest shipped pair, neutral on snow, is ΔE 29). */
const OWNER_MIN_DE = 35;
/** Same against the ground lit tone, which only shows as 16–22 % sun patches and the bevel edge: the shipped floor. */
const OWNER_MIN_DE_LIT = 29;
/** Sixth biome vs volcanic ash (band 4), ground mid tones. */
const BIOME_MIN_DE = 30;

const twilight: BiomeColors = DEFAULT_PALETTE.biomes.twilight;
const ALL_BIOMES: Biome[] = ['grass', 'autumn', 'sand', 'snow', 'volcanic', 'twilight'];

describe('ART-8 twilight highlands (band 5)', () => {
  it('helpers agree with the WCAG reference values', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(luminance('#000000')).toBe(0);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(deltaE('#ffffff', '#ffffff')).toBe(0);
    expect(deltaE('#ffffff', '#000000')).toBeCloseTo(100, 0);
  });

  it('levels 41–50 resolve to twilight; the five shipped bands are untouched', () => {
    for (let id = 41; id <= 50; id++) expect(biomeFor(id), `level ${id}`).toBe('twilight');
    expect(biomeFor(1)).toBe('grass');
    expect(biomeFor(8)).toBe('grass');
    expect(biomeFor(9)).toBe('autumn');
    expect(biomeFor(16)).toBe('autumn');
    expect(biomeFor(17)).toBe('sand');
    expect(biomeFor(24)).toBe('sand');
    expect(biomeFor(25)).toBe('snow');
    expect(biomeFor(32)).toBe('snow');
    expect(biomeFor(33)).toBe('volcanic');
    expect(biomeFor(40)).toBe('volcanic');
    expect(biomeFor(51)).toBe('twilight'); // anything past the campaign keeps the last band's look
  });

  it('is a complete biome entry shared by both palettes', () => {
    for (const b of ALL_BIOMES) expect(Object.keys(DEFAULT_PALETTE.biomes[b]).sort()).toEqual(['bush', 'cliff', 'dots', 'grass', 'path', 'wall']);
    expect(COLOR_BLIND_PALETTE.biomes.twilight).toBe(twilight);
    expect(twilight.dots.length).toBeGreaterThanOrEqual(3);
    for (const hex of [twilight.grass.lit, twilight.grass.mid, twilight.grass.shade, twilight.wall.lit, twilight.wall.mid, twilight.wall.shade, ...twilight.dots]) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('badge numerals stay ≥ 4.5:1 on every badge paper', () => {
    const pal = DEFAULT_PALETTE;
    for (const paper of [pal.badge, pal.badgeAlert, pal.badgeFull, pal.paper]) {
      expect(contrast(pal.ink, paper), paper).toBeGreaterThanOrEqual(NUMERAL_MIN);
    }
  });

  it('the streams’ ink outline reads on the moor (≥ 3:1 on the ground lit and mid tones)', () => {
    expect(contrast(DEFAULT_PALETTE.ink, twilight.grass.mid)).toBeGreaterThanOrEqual(OUTLINE_MIN);
    expect(contrast(DEFAULT_PALETTE.ink, twilight.grass.lit)).toBeGreaterThanOrEqual(OUTLINE_MIN);
    // strictly better than the band it replaces for 41–50 (volcanic ash is ≈ 1.6:1)
    expect(contrast(DEFAULT_PALETTE.ink, twilight.grass.mid)).toBeGreaterThan(contrast(DEFAULT_PALETTE.ink, DEFAULT_PALETTE.biomes.volcanic.grass.mid));
  });

  it('every owner colour of both palettes is distinct from the twilight ground', () => {
    for (const pal of [DEFAULT_PALETTE, COLOR_BLIND_PALETTE]) {
      for (const [owner, tones] of Object.entries(pal.ownerTones)) {
        expect(deltaE(tones.mid, twilight.grass.mid), `${owner} ${tones.mid} on ${twilight.grass.mid}`).toBeGreaterThanOrEqual(OWNER_MIN_DE);
        expect(deltaE(tones.mid, twilight.grass.lit), `${owner} ${tones.mid} on ${twilight.grass.lit}`).toBeGreaterThanOrEqual(OWNER_MIN_DE_LIT);
      }
    }
  });

  it('is a different colour from volcanic at a glance and its props read on the ground', () => {
    const volcanic = DEFAULT_PALETTE.biomes.volcanic;
    expect(deltaE(twilight.grass.mid, volcanic.grass.mid)).toBeGreaterThanOrEqual(BIOME_MIN_DE);
    expect(luminance(twilight.grass.mid)).toBeGreaterThan(luminance(volcanic.grass.mid) * 2);
    // walls, bushes, the amber cliff rim and the dots all separate from the moor
    for (const tone of [twilight.wall.mid, twilight.wall.shade, twilight.bush.mid, twilight.bush.shade, twilight.cliff.lit, ...twilight.dots]) {
      expect(deltaE(tone, twilight.grass.mid), tone).toBeGreaterThanOrEqual(20);
    }
  });

  it('works with the cosmetic themes: untouched by the default theme, re-lit by a lazy one', async () => {
    expect(themedBiome(twilight, DEFAULT_THEME, 'twilight')).toBe(twilight);
    await loadThemes();
    const night = themedBiome(twilight, themeFor('theme.winter_night'), 'twilight');
    expect(night).not.toBe(twilight);
    expect(Object.keys(night).sort()).toEqual(Object.keys(twilight).sort());
    expect(night.grass.mid).not.toBe(twilight.grass.mid);
    expect(night.wall.mid).not.toBe(twilight.wall.mid);
    expect(themedBiome(twilight, themeFor('theme.winter_night'), 'twilight')).toBe(night); // memoised per biome id
    // the memo is keyed by biome id: grass under the same theme is a different object
    expect(themedBiome(DEFAULT_PALETTE.biomes.grass, themeFor('theme.winter_night'), 'grass')).not.toBe(night);
  });
});
