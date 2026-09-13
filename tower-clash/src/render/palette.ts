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
