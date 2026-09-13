import type { Owner } from '../sim/types';

/**
 * Colours for everything drawn. Two variants: default and colour-blind friendly.
 * Toy / low-poly look: bright grass plateau over pale water, sandy paths, stone towers whose
 * roof + flag + soldiers carry the owner colour (the only thing that changes between variants).
 */
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
  /** Owner colour: roof, flag, soldiers, tanks. */
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
}

export const DEFAULT_PALETTE: Palette = Object.freeze({
  background: '#5ec1e6',
  letterbox: '#4fb3da',
  road: '#e8d9a8',
  roadDim: '#cdb67c',
  bridge: '#a86f3d',
  mine: '#ef4444',
  barrier: '#c9c2b4',
  text: '#1e2a44',
  textDim: '#5b6b85',
  panel: '#ffffff',
  panelBorder: '#b8c6da',
  accent: '#2f8de4',
  star: '#f8c62c',
  starOff: '#d5dbe5',
  selection: '#ffd23f',
  owners: {
    neutral: '#8a94a6',
    player: '#3b82f6',
    enemy1: '#ef4444',
    enemy2: '#22c55e',
    enemy3: '#eab308',
  },

  grass: '#8fd16a',
  grassLight: '#a3dd7d',
  bush: '#5ea94a',
  bushLight: '#74bd5c',
  rock: '#d9dad5',
  rockDark: '#a6a89f',
  waterLight: '#8fd9f0',
  cliff: '#e0c99a',
  cliffDark: '#b89b67',
  wood: '#a86f3d',
  woodDark: '#7a4d27',

  stone: '#ece7db',
  stoneDark: '#b7ae9d',
  stoneLight: '#faf7f0',
  skin: '#f6d5ac',
  badge: '#ffffff',
  badgeEdge: '#1e2a44',
  badgeFull: '#ffe16a',
  shadow: 'rgba(25, 45, 70, 0.22)',
});

/** Blue / orange / purple / teal — distinguishable for deutan and protan vision. */
export const COLOR_BLIND_PALETTE: Palette = Object.freeze({
  ...DEFAULT_PALETTE,
  owners: {
    neutral: '#8a94a6',
    player: '#3b82f6',
    enemy1: '#f97316',
    enemy2: '#a855f7',
    enemy3: '#14b8a6',
  },
});

export function getPalette(colorBlind: boolean): Palette {
  return colorBlind ? COLOR_BLIND_PALETTE : DEFAULT_PALETTE;
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
