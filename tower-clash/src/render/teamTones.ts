/**
 * ART-25 team-colour A/B (2026-10-15). The stakeholder's "rəng effektləri o deyil" (2026-10-12) may have
 * meant the team colours themselves; instead of a question the build carries three alternative owner
 * clay sets next to the shipped "classic" one, reachable only through the page URL
 * (`?tones=vivid|royal|pastel`, like `?tilt=` / `?dprcap=`; palette.ts `getPalette`). Lazy chunk: the
 * eager bundle carries only the override plumbing, and players without the parameter never fetch this.
 *
 *   vivid  — punchier: purer, higher-chroma mids with a bright lit and a deep shade tone on every team
 *            (electric blue, signal red, bright mint, saffron; colour-blind: orange / orchid / aqua).
 *   royal  — deeper: navy, crimson, emerald and old-gold mids with warm, light highlights and very dark
 *            shade tones (colour-blind: burnt orange / royal purple / deep teal).
 *   pastel — "pastel clay": chalky, very pale lit tones and softer shade tones around clear mids
 *            (cornflower, salmon, mint, marigold; colour-blind: apricot / orchid pink / sea green).
 *
 * Every set keeps the families of the shipped palette (blue / red / green / yellow — `ownerLabel` names
 * them; colour-blind blue / orange / purple / teal, the shipped set's before BUG-46 moved it to
 * magenta / amber), the shared neutral grey and the colour-blind
 * palette's player = the default player. Only the match is recoloured (`ownerTones` / `owners`): the
 * UI pairs (`shopBuy`, `shopOwned`, `toastError`, `gainText`) keep their classic values and contrast.
 * `tests/render/teamTones.test.ts` holds every set to the readability floors of biome / light /
 * contrast / skin tests plus a simulated deutan / protan check.
 */
import type { Owner } from '../sim/types';
import type { Palette, ToneSet, Tones } from './palette';
import { COLOR_BLIND_PALETTE, DEFAULT_PALETTE } from './palette';

/** The alternative sets (`classic` is the shipped palette itself). */
export type AltToneSet = Exclude<ToneSet, 'classic'>;
type Team = Exclude<Owner, 'neutral'>;

/** "lit mid shade" → Tones. */
const clay = (s: string): Tones => {
  const [lit, mid, shade] = s.split(' ') as [string, string, string];
  return { lit, mid, shade };
};

/** Default palette (player / enemy1–3) and colour-blind enemies (the colour-blind player is the default player). */
interface SetDef {
  def: Record<Team, Tones>;
  cb: Record<Exclude<Team, 'player'>, Tones>;
}

export const TEAM_TONES: Readonly<Record<AltToneSet, SetDef>> = Object.freeze({
  vivid: {
    def: { player: clay('#4d8bff #0a50ff #0030a8'), enemy1: clay('#ff6b6b #ff1f3a #b8001e'), enemy2: clay('#7dffcf #00e0a0 #009a6a'), enemy3: clay('#ffd84d #ffaa00 #cc7a00') },
    cb: { enemy1: clay('#ff9a3d #ff6200 #b83a00'), enemy2: clay('#dca0ff #c06bff #9a30d8'), enemy3: clay('#8ff7ee #18d8cc #00908a') },
  },
  royal: {
    def: { player: clay('#8aa0f0 #1e3aa8 #0f1f66'), enemy1: clay('#ff9a85 #e0304a #7a0c22'), enemy2: clay('#7adbb2 #08916a #04482f'), enemy3: clay('#ffdc80 #f0a20a #8f5800') },
    cb: { enemy1: clay('#ffb07a #e8650c #8a3300'), enemy2: clay('#ffb0f4 #c060e0 #6e1c94'), enemy3: clay('#7ce6d4 #0b8475 #043d36') },
  },
  pastel: {
    def: { player: clay('#b3cbff #4d82ff #3358cc'), enemy1: clay('#ffc0b5 #ff7f73 #cc4c45'), enemy2: clay('#bdfbe2 #4ae2ac #27a57a'), enemy3: clay('#ffe7a8 #ffb81a #d99520') },
    cb: { enemy1: clay('#ffc49a #ff8a3d #d0662a'), enemy2: clay('#ffb3ee #e070e0 #a844b0'), enemy3: clay('#9ef0e2 #12897b #0b5e54') },
  },
});

/** `base` with its owner clay replaced (neutral kept; `owners` = the mids); every other token untouched. */
function toned(base: Palette, teams: Record<Team, Tones>): Palette {
  const ownerTones: Record<Owner, Tones> = { neutral: base.ownerTones.neutral, ...teams };
  const owners = { neutral: ownerTones.neutral.mid, player: teams.player.mid, enemy1: teams.enemy1.mid, enemy2: teams.enemy2.mid, enemy3: teams.enemy3.mid };
  return Object.freeze({ ...base, ownerTones, owners });
}

/** [default, colour-blind] palette per alternative set: stable objects (the sprite / unit caches key on palette identity). */
export const TONE_PALETTES: Readonly<Record<AltToneSet, readonly [Palette, Palette]>> = Object.freeze(
  Object.fromEntries(
    (Object.keys(TEAM_TONES) as AltToneSet[]).map((k) => {
      const s = TEAM_TONES[k];
      return [k, [toned(DEFAULT_PALETTE, s.def), toned(COLOR_BLIND_PALETTE, { player: s.def.player, ...s.cb })] as const];
    }),
  ) as Record<AltToneSet, readonly [Palette, Palette]>,
);
