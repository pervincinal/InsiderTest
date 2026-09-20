/**
 * Cosmetic terrain themes (ECON-10: dusk, winter night, neon) and the colour mixing that re-lights a
 * biome for them. Lazy chunk — src/render/palette.ts imports this module on the first `themeFor`
 * call for a cosmetic id and draws the untinted default until it lands, so the eager bundle stays
 * under its 80 kB budget. The default theme itself stays eager: a level without a theme never waits.
 */
import type { BiomeColors, Speck, TerrainTheme, ThemeId, Tones } from './palette';

const mixCache = new Map<string, string>();

/** Linear mix of two #rrggbb colours (t = 0 → a, t = 1 → b). Memoised. */
export function mix(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  const key = `${a}~${b}~${t}`;
  const hit = mixCache.get(key);
  if (hit !== undefined) return hit;
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const ch = (shift: number): number => {
    const va = (na >> shift) & 0xff;
    const vb = (nb >> shift) & 0xff;
    return Math.max(0, Math.min(255, Math.round(va + (vb - va) * t)));
  };
  const out = `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
  if (mixCache.size < 512) mixCache.set(key, out);
  return out;
}

const mixTones = (t: Tones, tint: string, k: number): Tones => (k > 0 ? { lit: mix(t.lit, tint, k), mid: mix(t.mid, tint, k), shade: mix(t.shade, tint, k) } : t);

const themedBiomeCache = new Map<string, BiomeColors>();

/** Biome colours re-lit by a theme (memoised per biome object identity and theme). */
function themedBiome(biome: BiomeColors, theme: TerrainTheme, biomeId: string): BiomeColors {
  const key = `${theme.id}|${biomeId}|${biome.grass.mid}`;
  const hit = themedBiomeCache.get(key);
  if (hit) return hit;
  const bushTint = theme.bushTint ?? theme.tint;
  const bushK = theme.bushTintAmount ?? theme.tintAmount;
  const out: BiomeColors = {
    grass: mixTones(biome.grass, theme.tint, theme.tintAmount),
    cliff: { lit: mix(biome.cliff.lit, theme.tint, theme.tintAmount), shade: mix(biome.cliff.shade, theme.tint, theme.tintAmount) },
    path: theme.path ?? { lit: mix(biome.path.lit, theme.tint, theme.pathTintAmount), shade: mix(biome.path.shade, theme.tint, theme.pathTintAmount) },
    bush: mixTones(biome.bush, bushTint, bushK),
    dots: theme.dots ?? biome.dots,
  };
  themedBiomeCache.set(key, out);
  return out;
}

type LazyThemeId = Exclude<ThemeId, 'theme.default'>;

/** Fireflies / snow motes / neon dust over the plateau: slow twinkle, a gentle drift when motion is allowed. */
function drawGlow(glow: string): NonNullable<TerrainTheme['drawGlow']> {
  return (ctx, specks, t) => {
    ctx.fillStyle = glow;
    for (let i = 0; i < specks.length; i++) {
      const s = specks[i] as Speck;
      const tw = 0.5 + 0.5 * Math.sin(t * 1.1 + s.phase);
      if (tw < 0.2) continue;
      ctx.globalAlpha = tw * 0.9;
      const y = s.y + Math.sin(t * 0.7 + s.phase) * 4;
      const x = s.x + Math.cos(t * 0.5 + s.phase * 1.3) * 5;
      ctx.beginPath();
      ctx.arc(x, y, s.len, 0, Math.PI * 2);
      ctx.fill();
    }
  };
}

/** Each cosmetic theme carries its own `relight` (and `drawGlow`) so palette.ts / terrain.ts need none of the code. */
function withRelight(theme: Omit<TerrainTheme, 'relight' | 'drawGlow'>): TerrainTheme {
  const out: TerrainTheme = { ...theme, relight: (biome, biomeId) => themedBiome(biome, out, biomeId) };
  if (theme.glow) out.drawGlow = drawGlow(theme.glow);
  return Object.freeze(out);
}

export const LAZY_THEMES: Readonly<Record<LazyThemeId, TerrainTheme>> = Object.freeze({
  'theme.dusk': withRelight({
    id: 'theme.dusk',
    waterTop: '#f2a067',
    waterBottom: '#3d4f9c',
    letterbox: '#d97a4e',
    waterSparkle: 'rgba(255, 236, 200, 0.65)',
    tint: '#ff8a4a',
    tintAmount: 0.24,
    pathTintAmount: 0.14,
    ambient: 'rgba(255, 120, 60, 0.1)',
    cloudAlpha: 0.32,
  }),
  'theme.winter_night': withRelight({
    id: 'theme.winter_night',
    waterTop: '#0a1530',
    waterBottom: '#1b3f78',
    letterbox: '#060d20',
    waterSparkle: 'rgba(214, 236, 255, 0.75)',
    tint: '#22305e',
    tintAmount: 0.48,
    pathTintAmount: 0.3,
    dots: ['#fffaf0', '#c9dcff', '#8fb4ff'],
    ambient: 'rgba(10, 20, 60, 0.14)',
    cloudAlpha: 0.22,
    glow: 'rgba(224, 240, 255, 0.85)',
  }),
  'theme.neon': withRelight({
    id: 'theme.neon',
    waterTop: '#0d0620',
    waterBottom: '#2c1264',
    letterbox: '#07031a',
    waterSparkle: 'rgba(90, 255, 240, 0.8)',
    tint: '#2b1352',
    tintAmount: 0.72,
    bushTint: '#7a3cff',
    bushTintAmount: 0.45,
    pathTintAmount: 0,
    path: { lit: '#3b2a6c', shade: '#ff4fd8' },
    dots: ['#4ffff0', '#ff4fd8', '#ffe14f'],
    ambient: 'rgba(140, 40, 220, 0.08)',
    cloudAlpha: 0.2,
    glow: 'rgba(90, 255, 240, 0.8)',
  }),
});
