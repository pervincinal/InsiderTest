import type { Owner } from '../sim/types';

/** Colours for everything drawn. Two variants: default and colour-blind friendly. */
export interface Palette {
  background: string;
  letterbox: string;
  road: string;
  roadDim: string;
  bridge: string;
  mine: string;
  barrier: string;
  text: string;
  textDim: string;
  panel: string;
  panelBorder: string;
  accent: string;
  star: string;
  starOff: string;
  selection: string;
  owners: Record<Owner, string>;
}

export const DEFAULT_PALETTE: Palette = Object.freeze({
  background: '#0f172a',
  letterbox: '#020617',
  road: '#334155',
  roadDim: '#1e293b',
  bridge: '#475569',
  mine: '#ef4444',
  barrier: '#f59e0b',
  text: '#f8fafc',
  textDim: '#94a3b8',
  panel: '#1e293b',
  panelBorder: '#334155',
  accent: '#38bdf8',
  star: '#facc15',
  starOff: '#334155',
  selection: '#ffffff',
  owners: {
    neutral: '#64748b',
    player: '#3b82f6',
    enemy1: '#ef4444',
    enemy2: '#22c55e',
    enemy3: '#eab308',
  },
});

/** Blue / orange / purple / teal — distinguishable for deutan and protan vision. */
export const COLOR_BLIND_PALETTE: Palette = Object.freeze({
  ...DEFAULT_PALETTE,
  owners: {
    neutral: '#64748b',
    player: '#3b82f6',
    enemy1: '#f97316',
    enemy2: '#a855f7',
    enemy3: '#14b8a6',
  },
});

export function getPalette(colorBlind: boolean): Palette {
  return colorBlind ? COLOR_BLIND_PALETTE : DEFAULT_PALETTE;
}

/** Lighten (amount > 0) or darken (amount < 0) a #rrggbb colour. amount in -1..1. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number): number => {
    const v = (n >> shift) & 0xff;
    const out = amount >= 0 ? v + (255 - v) * amount : v * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(out)));
  };
  const r = ch(16);
  const g = ch(8);
  const b = ch(0);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
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
