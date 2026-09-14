import type { Owner } from '../sim/types';

/*
 * Colours for everything drawn — the single source (docs/ART_DIRECTION.md §2, "Sunlit Clay
 * Islands"). Every object is moulded in three tones (lit / mid / shade) under one warm key light
 * from the upper-left; ground shadows are a translucent blue-ink multiply. Two variants: default
 * and colour-blind friendly (blue / orange / purple / teal), sharing all non-owner tokens.
 */

/** Three clay tones of one material. */
export interface Tones {
  lit: string;
  mid: string;
  shade: string;
}

/** Level bands (§3): 1–8 grass, 9–16 autumn, 17–24 sand, 25–32 snow, 33–40 volcanic. */
export type Biome = 'grass' | 'autumn' | 'sand' | 'snow' | 'volcanic';

export interface BiomeColors {
  grass: Tones;
  cliff: { lit: string; shade: string };
  path: { lit: string; shade: string };
  /** Foliage clumps (bushes / cacti / pines / rocks). */
  bush: Tones;
  /** Small scattered dots (flowers / pebbles / embers). */
  dots: readonly string[];
}

export interface Palette {
  /** Water (fills the map behind the plateau). */
  background: string;
  /** Deeper water outside the logical map (letterbox bars). */
  letterbox: string;
  /** Sandy path fill / edge. */
  road: string;
  roadDim: string;
  /** Wooden bridge planks. */
  bridge: string;
  /** Mine light / danger. */
  mine: string;
  /** Stone wall barrier. */
  barrier: string;
  /** Dark navy UI text. */
  text: string;
  textDim: string;
  /** Button / card face and its bottom edge. */
  panel: string;
  panelBorder: string;
  accent: string;
  star: string;
  starOff: string;
  /** Selection ring (gold). */
  selection: string;
  /** Owner colour (mid tone): roof, flag, soldiers, tanks. */
  owners: Record<Owner, string>;

  /* ---- terrain ---- */
  grass: string;
  grassLight: string;
  bush: string;
  bushLight: string;
  rock: string;
  rockDark: string;
  waterLight: string;
  cliff: string;
  cliffDark: string;
  wood: string;
  woodDark: string;

  /* ---- buildings & units ---- */
  stone: string;
  stoneDark: string;
  stoneLight: string;
  skin: string;
  badge: string;
  badgeEdge: string;
  badgeFull: string;
  shadow: string;

  /* ---- v2 clay tokens (ART_DIRECTION §2) ---- */
  /** Sky / far water. */
  sky: string;
  /** Map water vertical gradient, top → bottom. */
  waterTop: string;
  waterBottom: string;
  /** Drifting highlight dots on the water (already at 60 %). */
  waterSparkle: string;
  grassTones: Tones;
  cliffLit: string;
  cliffShade: string;
  pathLit: string;
  pathShade: string;
  /** All ground shadows (blue-tinted multiply feel). */
  groundShadow: string;
  /** Cast shadows of towers / props (a touch stronger than the island shadow so they read on grass). */
  objectShadow: string;
  /** Darker variant for contact shadows right under an object. */
  contactShadow: string;
  ink: string;
  paper: string;
  gold: string;
  goldShade: string;
  /** Owner clay tones. `owners[o]` === `ownerTones[o].mid`. */
  ownerTones: Record<Owner, Tones>;
  /** Warm stone of plinths and tower bodies. */
  stoneTones: Tones;
  /** Foam line where water meets the cliff. */
  foam: string;
  /** Wood tones (bridges). */
  woodTones: Tones;
  /** Warm grey clay of road barriers (darker than plinth stone so the wall reads on sand and snow). */
  barrierTones: Tones;
  /** Dust puffs behind marching columns on sand (pale, reads on the darker sand path). */
  dust: string;
  rope: string;
  /** Gun metal (artillery barrel, tank treads). */
  metal: Tones;
  biomes: Record<Biome, BiomeColors>;

  /* ---- economy (shop / currencies) ---- */
  /** Gold coin clay: `goldTones.mid` === `gold`, `goldTones.shade` === `goldShade`. */
  goldTones: Tones;
  /** Crystal (hard currency) clay: cyan lit → sky mid → violet shade, so a gem reads as one material. */
  crystal: Tones;
  /** Deep violet ink for crystal outlines / drop edge (never black). */
  crystalInk: string;
  /** Prohibition red of the no-ads badge (shared with `mine`; kept separate so it can retune). */
  forbid: string;
}

const BIOMES: Record<Biome, BiomeColors> = Object.freeze({
  grass: {
    grass: { lit: '#a9e36b', mid: '#7cc94a', shade: '#5aa836' },
    cliff: { lit: '#e9c98a', shade: '#b9925a' },
    path: { lit: '#f7e7bd', shade: '#d9c28c' },
    bush: { lit: '#8ad95a', mid: '#5fb742', shade: '#3f8f2e' },
    dots: ['#fffaf0', '#ffd35c', '#ff8f92'],
  },
  autumn: {
    grass: { lit: '#b4dc6a', mid: '#8cc24c', shade: '#66a03a' },
    cliff: { lit: '#e9c98a', shade: '#b9925a' },
    path: { lit: '#f7e7bd', shade: '#d9c28c' },
    bush: { lit: '#ffb75c', mid: '#f08a3c', shade: '#c25a2a' },
    dots: ['#fffaf0', '#ffb703', '#ff5a5f'],
  },
  sand: {
    grass: { lit: '#fbe7ad', mid: '#ecd08a', shade: '#cdae66' },
    cliff: { lit: '#e6c08a', shade: '#b5865a' },
    path: { lit: '#d9b985', shade: '#b8955e' },
    bush: { lit: '#8fd07a', mid: '#5fa85a', shade: '#3f7f43' },
    dots: ['#fffaf0', '#e8b27c', '#c99a68'],
  },
  snow: {
    grass: { lit: '#ffffff', mid: '#e8f2fb', shade: '#c3d8ea' },
    cliff: { lit: '#c9d9e6', shade: '#8ea9c2' },
    path: { lit: '#d6e3ee', shade: '#a9c0d4' },
    bush: { lit: '#4f8d7a', mid: '#2f6b5c', shade: '#1f4d43' },
    dots: ['#fffaf0', '#dbeafe', '#bfd8f0'],
  },
  volcanic: {
    grass: { lit: '#6b6470', mid: '#4d4753', shade: '#332f3a' },
    cliff: { lit: '#5a4a4c', shade: '#3a2c30' },
    path: { lit: '#ff9a3c', shade: '#d9601e' },
    bush: { lit: '#7a6f7c', mid: '#57505c', shade: '#3a343f' },
    dots: ['#ffb703', '#ff5a1f', '#ffd35c'],
  },
});

const OWNER_TONES: Record<Owner, Tones> = Object.freeze({
  neutral: { lit: '#d6d3d1', mid: '#a8a29e', shade: '#78716c' },
  player: { lit: '#6d9bff', mid: '#2f6df6', shade: '#1f4bc0' },
  enemy1: { lit: '#ff8f92', mid: '#ff5a5f', shade: '#c93a3f' },
  enemy2: { lit: '#6fe0a8', mid: '#2ec27e', shade: '#1f8f5c' },
  enemy3: { lit: '#ffd35c', mid: '#ffb703', shade: '#d18f00' },
});

/** Blue / orange / purple / teal — distinguishable for deutan and protan vision. */
const OWNER_TONES_CB: Record<Owner, Tones> = Object.freeze({
  neutral: OWNER_TONES.neutral,
  player: OWNER_TONES.player,
  enemy1: { lit: '#ffa45c', mid: '#f97316', shade: '#c2410c' },
  enemy2: { lit: '#c58bff', mid: '#a855f7', shade: '#7e22ce' },
  enemy3: { lit: '#5eead4', mid: '#14b8a6', shade: '#0f766e' },
});

const mids = (t: Record<Owner, Tones>): Record<Owner, string> => ({
  neutral: t.neutral.mid,
  player: t.player.mid,
  enemy1: t.enemy1.mid,
  enemy2: t.enemy2.mid,
  enemy3: t.enemy3.mid,
});

export const DEFAULT_PALETTE: Palette = Object.freeze({
  background: '#3fb6de',
  letterbox: '#1f8fc2',
  road: '#f7e7bd',
  roadDim: '#d9c28c',
  bridge: '#b07a45',
  mine: '#ff5a5f',
  barrier: '#d8cdb8',
  text: '#1e2a44',
  textDim: '#5b6b85',
  panel: '#fffaf0',
  panelBorder: '#cfc6b4',
  accent: '#2f6df6',
  star: '#ffcf3f',
  starOff: '#d5dbe5',
  selection: '#ffcf3f',
  owners: mids(OWNER_TONES),

  grass: '#7cc94a',
  grassLight: '#a9e36b',
  bush: '#5fb742',
  bushLight: '#8ad95a',
  rock: '#d9d4c8',
  rockDark: '#a39c8c',
  waterLight: '#8ee2f5',
  cliff: '#e9c98a',
  cliffDark: '#b9925a',
  wood: '#b07a45',
  woodDark: '#7a4d27',

  stone: '#efe6d2',
  stoneDark: '#bfae90',
  stoneLight: '#fff8e8',
  skin: '#f8d9b4',
  badge: '#fffaf0',
  badgeEdge: '#1e2a44',
  badgeFull: '#ffe38a',
  shadow: 'rgba(26, 58, 90, 0.22)',

  sky: '#1f8fc2',
  waterTop: '#3fb6de',
  waterBottom: '#8ee2f5',
  waterSparkle: 'rgba(232, 251, 255, 0.6)',
  grassTones: BIOMES.grass.grass,
  cliffLit: '#e9c98a',
  cliffShade: '#b9925a',
  pathLit: '#f7e7bd',
  pathShade: '#d9c28c',
  groundShadow: 'rgba(26, 58, 90, 0.22)',
  objectShadow: 'rgba(26, 58, 90, 0.3)',
  contactShadow: 'rgba(26, 58, 90, 0.36)',
  ink: '#1e2a44',
  paper: '#fffaf0',
  gold: '#ffcf3f',
  goldShade: '#e0a300',
  ownerTones: OWNER_TONES,
  stoneTones: { lit: '#fff8e8', mid: '#efe6d2', shade: '#bfae90' },
  foam: 'rgba(255, 250, 240, 0.55)',
  woodTones: { lit: '#d29a5e', mid: '#b07a45', shade: '#7a4d27' },
  barrierTones: { lit: '#e3d9c6', mid: '#b9ad99', shade: '#7f7566' },
  dust: '#fff6e0',
  rope: '#e8d3a2',
  metal: { lit: '#8b94a3', mid: '#4b5361', shade: '#2d3340' },
  biomes: BIOMES,

  goldTones: { lit: '#ffe98a', mid: '#ffcf3f', shade: '#e0a300' },
  crystal: { lit: '#c9f7ff', mid: '#4fd1f0', shade: '#7b5cf0' },
  crystalInk: '#4a2fb0',
  forbid: '#ff5a5f',
});

export const COLOR_BLIND_PALETTE: Palette = Object.freeze({
  ...DEFAULT_PALETTE,
  owners: mids(OWNER_TONES_CB),
  ownerTones: OWNER_TONES_CB,
});

export function getPalette(colorBlind: boolean): Palette {
  return colorBlind ? COLOR_BLIND_PALETTE : DEFAULT_PALETTE;
}

/** Biome for a level id (§3 level bands). */
export function biomeFor(levelId: number): Biome {
  if (levelId <= 8) return 'grass';
  if (levelId <= 16) return 'autumn';
  if (levelId <= 24) return 'sand';
  if (levelId <= 32) return 'snow';
  return 'volcanic';
}

const shadeCache = new Map<string, string>();

/* ---------- terrain themes (shop cosmetics, ECON-5) ---------- */

/**
 * Sprite ids of the terrain themes (`SKINS` category `terrainTheme`): `theme_dusk` → `theme.dusk`,
 * `theme_winter_night` → `theme.winter_night`, `theme_neon` → `theme.neon`. A theme re-lights the
 * cached ground of every biome (tint mixed into grass / cliff / bushes, water gradient, path) and
 * adds an ambient wash + glow specks in the animated overlay. Buildings, units and badges are never
 * tinted so owner colours and numerals keep their contrast in both palettes.
 */
export const THEME_IDS = ['theme.default', 'theme.dusk', 'theme.winter_night', 'theme.neon'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface TerrainTheme {
  id: ThemeId;
  /** Map water gradient (top → bottom), letterbox water and sparkle colour. */
  waterTop: string;
  waterBottom: string;
  letterbox: string;
  waterSparkle: string;
  /** Colour mixed into the biome's grass / cliff tones and how much (0 = untouched). */
  tint: string;
  tintAmount: number;
  /** Bushes / pines / cacti take this mix instead (default: same as `tint`). */
  bushTint?: string;
  bushTintAmount?: number;
  /** Path tint strength (roads stay lighter than the ground so columns read on them). */
  pathTintAmount: number;
  /** Explicit road colours (skips the tint). */
  path?: { lit: string; shade: string };
  /** Scatter dot colours (flowers / pebbles) override. */
  dots?: readonly string[];
  /** Full-map wash over the ground every frame (rgba); undefined = none. */
  ambient?: string;
  /** Cloud-shadow alpha (0.5 by default). */
  cloudAlpha: number;
  /** Twinkling specks over the plateau (fireflies / snow / neon motes); undefined = none. */
  glow?: string;
}

const THEMES: Record<ThemeId, TerrainTheme> = Object.freeze({
  'theme.default': {
    id: 'theme.default',
    waterTop: '#3fb6de',
    waterBottom: '#8ee2f5',
    letterbox: '#1f8fc2',
    waterSparkle: 'rgba(232, 251, 255, 0.6)',
    tint: '#ffffff',
    tintAmount: 0,
    pathTintAmount: 0,
    cloudAlpha: 0.5,
  },
  'theme.dusk': {
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
  },
  'theme.winter_night': {
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
  },
  'theme.neon': {
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
  },
});

/** Theme for a sprite id; unknown / undefined ids give the untinted default. */
export function themeFor(id: string | undefined): TerrainTheme {
  return (id && (THEMES as Record<string, TerrainTheme>)[id]) || THEMES['theme.default'];
}

/** Linear mix of two #rrggbb colours (t = 0 → a, t = 1 → b). Memoised. */
export function mix(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  const key = `${a}~${b}~${t}`;
  const hit = shadeCache.get(key);
  if (hit !== undefined) return hit;
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const ch = (shift: number): number => {
    const va = (na >> shift) & 0xff;
    const vb = (nb >> shift) & 0xff;
    return Math.max(0, Math.min(255, Math.round(va + (vb - va) * t)));
  };
  const out = `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
  if (shadeCache.size < 512) shadeCache.set(key, out);
  return out;
}

const mixTones = (t: Tones, tint: string, k: number): Tones => (k > 0 ? { lit: mix(t.lit, tint, k), mid: mix(t.mid, tint, k), shade: mix(t.shade, tint, k) } : t);

const themedBiomeCache = new Map<string, BiomeColors>();

/** Biome colours re-lit by a theme (memoised per biome object identity and theme). */
export function themedBiome(biome: BiomeColors, theme: TerrainTheme, biomeId = ''): BiomeColors {
  if (theme.tintAmount === 0 && !theme.path && !theme.dots) return biome;
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

/** Lighten (amount > 0) or darken (amount < 0) a #rrggbb colour. amount in -1..1. Memoised. */
export function shade(hex: string, amount: number): string {
  const key = `${hex}${amount}`;
  const hit = shadeCache.get(key);
  if (hit !== undefined) return hit;
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number): number => {
    const v = (n >> shift) & 0xff;
    const out = amount >= 0 ? v + (255 - v) * amount : v * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(out)));
  };
  const r = ch(16);
  const g = ch(8);
  const b = ch(0);
  const out = `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  if (shadeCache.size < 512) shadeCache.set(key, out);
  return out;
}

/** `#rrggbb` → `rgba(r, g, b, a)`. Memoised through `shade`'s cache namespace. */
export function withAlpha(hex: string, alpha: number): string {
  const key = `${hex}@${alpha}`;
  const hit = shadeCache.get(key);
  if (hit !== undefined) return hit;
  const n = parseInt(hex.slice(1), 16);
  const out = `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`;
  if (shadeCache.size < 512) shadeCache.set(key, out);
  return out;
}

/** Human-readable owner label for the HUD / result screen. */
export function ownerLabel(owner: Owner): string {
  switch (owner) {
    case 'neutral':
      return 'Neutral';
    case 'player':
      return 'You';
    case 'enemy1':
      return 'Red';
    case 'enemy2':
      return 'Green';
    case 'enemy3':
      return 'Yellow';
  }
}
