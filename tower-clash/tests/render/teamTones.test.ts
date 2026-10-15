import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Biome, Palette, ToneSet } from '../../src/render/palette';
import { BADGE_LIP, BIOME_LIGHT, COLOR_BLIND_PALETTE, DEFAULT_PALETTE, getPalette, litGround, loadToneSets, rimOf, shade, urlToneSet } from '../../src/render/palette';
import { TEAM_TONES, TONE_PALETTES } from '../../src/render/teamTones';
import { ENAMEL, GLASS, HOPLITE, STRAW } from '../../src/render/skinShapes';
import type { Owner } from '../../src/sim/types';

/*
 * ART-25 team-colour A/B: the three alternative owner clay sets (`?tones=vivid|royal|pastel`) and the
 * shipped "classic" one, each in the default and the colour-blind palette, held to every readability
 * floor the shipped colours answer to — biome.test (twilight ΔE 35 / 29, badge numerals 4.5:1),
 * light.test (the baked light's extremes, rims, badge lip, pairwise owner ΔE > 30), the skin tests'
 * materials (ΔE 30) and tone steps (ΔE 15), the stream ribbon (ink outline ≥ 3:1 against the body,
 * paper chevrons ≥ 1.5:1 on it) — plus ΔE 38 between every team colour and every biome ground, and a
 * simulated dichromat check (Machado et al. 2009, severity 1): team pairs ≥ ΔE 15 and teams vs the
 * neutral grey ≥ ΔE 12 under deuteranopia and protanopia.
 * Grandfathered shipped values (classic only, the reason the alternatives exist): the default green on
 * the grass / autumn ground is ΔE 32.1 / 33.6, and the colour-blind purple collapses onto the player
 * blue for a protanope (ΔE 2.1; teal vs grey 4.1).
 */

/* WCAG contrast and CIE76 ΔE, as in biome.test.ts (copied: importing a test file would re-register its tests). */
const lin = (h: string, i: number): number => {
  const c = parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string): number => 0.2126 * lin(hex, 0) + 0.7152 * lin(hex, 1) + 0.0722 * lin(hex, 2);
const contrast = (a: string, b: string): number => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
function labOf(r: number, g: number, b: number): [number, number, number] {
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
  const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
  const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const dist = (p: number[], q: number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const deltaE = (a: string, b: string): number => dist(labOf(lin(a, 0), lin(a, 1), lin(a, 2)), labOf(lin(b, 0), lin(b, 1), lin(b, 2)));

/** Machado, Oliveira & Fernandes 2009, severity 1.0 (dichromacy), on linear RGB. */
const CVD = {
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
} as const;
function cvdLab(hex: string, m: (typeof CVD)[keyof typeof CVD]): [number, number, number] {
  const v = [lin(hex, 0), lin(hex, 1), lin(hex, 2)];
  const [r, g, b] = m.map((row) => Math.min(1, Math.max(0, row[0] * v[0]! + row[1] * v[1]! + row[2] * v[2]!))) as [number, number, number];
  return labOf(r, g, b);
}
const deltaECvd = (a: string, b: string, k: keyof typeof CVD): number => dist(cvdLab(a, CVD[k]), cvdLab(b, CVD[k]));

const BIOMES: Biome[] = ['grass', 'autumn', 'sand', 'snow', 'volcanic', 'twilight'];
const OWNERS: Owner[] = ['neutral', 'player', 'enemy1', 'enemy2', 'enemy3'];
const TEAMS = ['player', 'enemy1', 'enemy2', 'enemy3'] as const;
const SETS: ToneSet[] = ['classic', 'vivid', 'royal', 'pastel'];

/** Team mid vs every biome ground mid; the shipped green is grandfathered at its own value. */
const TEAM_GROUND_DE = 38;
const groundFloor = (set: ToneSet, cb: boolean, owner: Owner, biome: Biome): number =>
  set === 'classic' && !cb && owner === 'enemy2' && (biome === 'grass' || biome === 'autumn') ? 32 : TEAM_GROUND_DE;
const CVD_PAIR_DE = 15;
const CVD_NEUTRAL_DE = 12;

const paletteOf = (set: ToneSet, cb: boolean): Palette => (set === 'classic' ? (cb ? COLOR_BLIND_PALETTE : DEFAULT_PALETTE) : TONE_PALETTES[set][cb ? 1 : 0]);
const CASES = SETS.flatMap((set) => [false, true].map((cb) => ({ set, cb, name: `${set} ${cb ? 'colour-blind' : 'default'}`, pal: paletteOf(set, cb) })));

describe('ART-25 team-colour sets: readability floors', () => {
  for (const { set, cb, name, pal } of CASES) {
    describe(name, () => {
      const T = pal.ownerTones;

      it('is a full owner set: hex tones, owners = mids, the shared neutral, the colour-blind player = the default one', () => {
        for (const o of OWNERS) {
          for (const hex of [T[o].lit, T[o].mid, T[o].shade]) expect(hex, `${o}`).toMatch(/^#[0-9a-f]{6}$/);
          expect(pal.owners[o]).toBe(T[o].mid);
        }
        expect(T.neutral).toEqual(DEFAULT_PALETTE.ownerTones.neutral);
        expect(T.player).toEqual(paletteOf(set, false).ownerTones.player);
        // only the match is recoloured: the UI pairs, the paper / ink and the biomes are the shipped ones
        const base = cb ? COLOR_BLIND_PALETTE : DEFAULT_PALETTE;
        for (const k of ['shopBuy', 'shopOwned', 'toastError', 'gainText', 'ink', 'paper', 'badge', 'badgeAlert', 'badgeFull', 'biomes'] as const) expect(pal[k], k).toBe(base[k]);
      });

      it('badge numerals: ink ≥ 4.5:1 on every badge paper and its clay lip', () => {
        for (const paper of [pal.badge, pal.badgeAlert, pal.badgeFull, pal.paper]) {
          expect(contrast(pal.ink, paper), paper).toBeGreaterThanOrEqual(4.5);
          expect(contrast(pal.ink, shade(paper, -BADGE_LIP)), `${paper} lip`).toBeGreaterThanOrEqual(4.5);
        }
      });

      it(`every team mid is ≥ ΔE ${TEAM_GROUND_DE} from every biome ground (≥ 29 from its lit tone); the twilight floors hold for all owners`, () => {
        for (const b of BIOMES) {
          const g = pal.biomes[b].grass;
          for (const o of TEAMS) {
            expect(deltaE(T[o].mid, g.mid), `${o} ${T[o].mid} on ${b} ${g.mid}`).toBeGreaterThanOrEqual(groundFloor(set, cb, o, b));
            expect(deltaE(T[o].mid, g.lit), `${o} on ${b} lit`).toBeGreaterThanOrEqual(29);
          }
        }
        const tw = pal.biomes.twilight.grass;
        for (const o of OWNERS) {
          expect(deltaE(T[o].mid, tw.mid), `${o} on twilight`).toBeGreaterThanOrEqual(35);
          expect(deltaE(T[o].mid, tw.lit), `${o} on twilight lit`).toBeGreaterThanOrEqual(29);
        }
      });

      it('the baked light never brings an owner more than 8 ΔE closer to the ground, nor under ΔE 21', () => {
        for (const b of BIOMES) {
          const g = pal.biomes[b].grass.mid;
          const e = litGround(g, BIOME_LIGHT[b]);
          for (const o of OWNERS) {
            const base = deltaE(T[o].mid, g);
            for (const [side, ground] of Object.entries(e)) {
              const de = deltaE(T[o].mid, ground);
              expect(de, `${b} ${side} ${o}`).toBeGreaterThanOrEqual(Math.min(base, 40) - 8);
              expect(de, `${b} ${side} ${o}`).toBeGreaterThanOrEqual(21);
            }
          }
        }
      });

      it('stream ribbons: the ink outline ≥ 3:1 against the body, paper chevrons ≥ 1.5:1 on it', () => {
        for (const o of OWNERS) {
          const body = o === 'player' ? T[o].lit : T[o].mid; // draw.ts drawLinks
          expect(contrast(pal.ink, body), `${o} outline`).toBeGreaterThanOrEqual(3);
          expect(contrast(pal.paper, body), `${o} chevrons`).toBeGreaterThanOrEqual(1.5);
        }
      });

      it('clay tones: rim lighter than lit, lit / mid / shade ≥ ΔE 15 apart, and clear of the skin materials (ΔE 30)', () => {
        for (const o of OWNERS) {
          expect(luminance(rimOf(T[o])), `${o} rim`).toBeGreaterThan(luminance(T[o].lit));
          expect(deltaE(T[o].lit, T[o].mid), `${o} lit/mid`).toBeGreaterThanOrEqual(15);
          expect(deltaE(T[o].mid, T[o].shade), `${o} mid/shade`).toBeGreaterThanOrEqual(15);
          for (const [m, tones] of Object.entries({ STRAW, GLASS, ENAMEL, HOPLITE })) expect(deltaE(tones.mid, T[o].mid), `${m} vs ${o}`).toBeGreaterThanOrEqual(30);
        }
      });

      it('teams are pairwise distinct on the roof split (lit, mid, shade > ΔE 30)', () => {
        for (const a of TEAMS) for (const b of TEAMS) if (a < b) for (const k of ['lit', 'mid', 'shade'] as const) expect(deltaE(T[a][k], T[b][k]), `${a}/${b} ${k}`).toBeGreaterThan(30);
      });

      const shippedCbGap = set === 'classic' && cb; // see the header: the colour-blind classic set fails this for a protanope
      it.skipIf(shippedCbGap)(`simulated deutan / protan: team pairs ≥ ΔE ${CVD_PAIR_DE}, teams vs neutral ≥ ΔE ${CVD_NEUTRAL_DE}`, () => {
        for (const k of ['deutan', 'protan'] as const) {
          for (const a of TEAMS) {
            expect(deltaECvd(T[a].mid, T.neutral.mid, k), `${k} ${a}/neutral`).toBeGreaterThanOrEqual(CVD_NEUTRAL_DE);
            for (const b of TEAMS) if (a < b) expect(deltaECvd(T[a].mid, T[b].mid, k), `${k} ${a}/${b}`).toBeGreaterThanOrEqual(CVD_PAIR_DE);
          }
        }
      });
    });
  }

  it('the simulator agrees with the shipped colour-blind gap it was added for', () => {
    expect(deltaECvd('#2f6df6', '#a855f7', 'protan')).toBeLessThan(5); // classic blue vs colour-blind purple
    expect(deltaECvd('#2f6df6', '#a855f7', 'deutan')).toBeLessThan(CVD_PAIR_DE);
    expect(deltaECvd('#ffffff', '#ffffff', 'deutan')).toBeCloseTo(0, 5);
    expect(deltaECvd('#ff0000', '#00ff00', 'deutan')).toBeLessThan(deltaE('#ff0000', '#00ff00') / 3); // red / green collapse
  });

  it('every alternative changes every team colour of both palettes (they are real alternatives)', () => {
    for (const set of ['vivid', 'royal', 'pastel'] as const) {
      for (const cb of [false, true]) {
        for (const o of TEAMS) {
          if (cb && o === 'player') continue;
          expect(paletteOf(set, cb).ownerTones[o].mid, `${set} ${cb} ${o}`).not.toBe(paletteOf('classic', cb).ownerTones[o].mid);
        }
      }
      expect(Object.keys(TEAM_TONES[set].def).sort()).toEqual([...TEAMS].sort());
    }
  });
});

describe('ART-25 ?tones= override', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to the shipped palette: no parameter, classic or an unknown name', () => {
    expect(urlToneSet()).toBe('classic'); // no location under node
    expect(getPalette(false)).toBe(DEFAULT_PALETTE);
    expect(getPalette(true)).toBe(COLOR_BLIND_PALETTE);
    for (const search of ['', '?tones=classic', '?tones=neon', '?tones=', '?tilt=0.72']) {
      vi.stubGlobal('location', { search });
      expect(urlToneSet(), search).toBe('classic');
      expect(getPalette(false), search).toBe(DEFAULT_PALETTE);
    }
  });

  it('reads the set from the URL; answers the shipped palette until the lazy chunk lands, then the set (stable objects)', async () => {
    vi.stubGlobal('location', { search: '?dprcap=3&tones=royal' });
    expect(urlToneSet()).toBe('royal');
    expect(getPalette(false)).toBe(DEFAULT_PALETTE); // starts the download
    await loadToneSets();
    expect(await loadToneSets()).toBe(await loadToneSets()); // idempotent
    expect(getPalette(false)).toBe(TONE_PALETTES.royal[0]);
    expect(getPalette(true)).toBe(TONE_PALETTES.royal[1]);
    expect(getPalette(false).owners.player).toBe(TEAM_TONES.royal.def.player.mid);
    expect(getPalette(true).ownerTones.enemy2).toEqual(TEAM_TONES.royal.cb.enemy2);
    expect(getPalette(false, 'vivid')).toBe(TONE_PALETTES.vivid[0]);
    expect(getPalette(false, 'classic')).toBe(DEFAULT_PALETTE);
    vi.stubGlobal('location', { search: '?tones=pastel' });
    expect(getPalette(true)).toBe(TONE_PALETTES.pastel[1]);
  });
});
