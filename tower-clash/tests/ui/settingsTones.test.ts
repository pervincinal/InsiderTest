import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Palette, ToneSet } from '../../src/render/palette';
import {
  COLOR_BLIND_PALETTE,
  DEFAULT_PALETTE,
  TONE_SETS,
  activeToneSet,
  getPalette,
  isToneSet,
  loadToneSets,
  settingsPalette,
  toneSetsLoaded,
  urlToneOverride,
  urlToneSet,
} from '../../src/render/palette';
import { TEAM_TONES, TONE_PALETTES } from '../../src/render/teamTones';
import { SETTINGS, settingsAboutLayout } from '../../src/render/menuLayout';
import { TONE_SEGMENTS } from '../../src/render/menusSettings';
import { en } from '../../src/ui/locales/en';
import { az } from '../../src/ui/locales/az';
import { ru } from '../../src/ui/locales/ru';
import { tr } from '../../src/ui/locales/tr';
import type { SaveStorage } from '../../src/ui/save';
import { SAVE_KEY, SAVE_VERSION, defaultSave, loadSaveFrom, normalizeSave, resetProgress, setSaveStorageForTests, writeSave } from '../../src/ui/save';

/*
 * FE-14 (2026-10-17): the ART-25 team-colour set is a player setting (`save.settings.tones`, Settings →
 * "Team colours"). The palette resolves per set × colour-blind, the alternatives' lazy chunk is fetched
 * only for a non-classic set, the page's `?tones=` override wins for its page load, and the field is
 * optional in the v3 save (no schema bump). Module state matters here: the first test runs before
 * anything loads the chunk.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  setSaveStorageForTests(undefined);
});

const memory = (): SaveStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

describe('lazy chunk on demand', () => {
  it('classic never fetches the alternatives; a set starts the download and shows the shipped palette until it lands', async () => {
    expect(toneSetsLoaded()).toBe(false);
    expect(settingsPalette({ colorBlind: false })).toBe(DEFAULT_PALETTE);
    expect(settingsPalette({ colorBlind: true, tones: 'classic' })).toBe(COLOR_BLIND_PALETTE);
    await new Promise((r) => setTimeout(r, 20));
    expect(toneSetsLoaded()).toBe(false);
    // a non-classic set: the shipped palette this frame, the set once the chunk is in
    expect(settingsPalette({ colorBlind: false, tones: 'vivid' })).toBe(DEFAULT_PALETTE);
    await loadToneSets();
    expect(toneSetsLoaded()).toBe(true);
    expect(settingsPalette({ colorBlind: false, tones: 'vivid' })).toBe(TONE_PALETTES.vivid[0]);
  });
});

describe('palette per set × colour-blind', () => {
  it('each set answers its own stable palette pair; colour-blind composes with every set', async () => {
    await loadToneSets();
    const seen = new Set<Palette>();
    for (const tones of TONE_SETS) {
      for (const colorBlind of [false, true]) {
        const pal = settingsPalette({ colorBlind, tones });
        expect(settingsPalette({ colorBlind, tones }), `${tones} cb=${colorBlind}`).toBe(pal); // stable identity (caches key on it)
        seen.add(pal);
        if (tones === 'classic') {
          expect(pal).toBe(colorBlind ? COLOR_BLIND_PALETTE : DEFAULT_PALETTE);
          continue;
        }
        expect(pal).toBe(TONE_PALETTES[tones][colorBlind ? 1 : 0]);
        const def = TEAM_TONES[tones].def;
        expect(pal.owners.player).toBe(def.player.mid); // the colour-blind player = the set's default player
        expect(pal.ownerTones.enemy1).toEqual(colorBlind ? TEAM_TONES[tones].cb.enemy1 : def.enemy1);
        expect(pal.ownerTones.enemy3).toEqual(colorBlind ? TEAM_TONES[tones].cb.enemy3 : def.enemy3);
      }
    }
    expect(seen.size).toBe(8);
    // the ground / HUD layer keys tell palettes apart by the enemy1 mid (layers.ts groundKey, hud.ts hudKey)
    expect(new Set([...seen].map((p) => p.owners.enemy1)).size).toBe(8);
  });

  it('the picker lists every set once, in TONE_SETS order', () => {
    expect(TONE_SEGMENTS.map((s) => s.value)).toEqual([...TONE_SETS]);
    expect(TONE_SETS).toEqual(['classic', 'vivid', 'royal', 'pastel']);
    expect(TONE_SETS.every(isToneSet)).toBe(true);
    expect([undefined, null, '', 'neon', 'Vivid', 3].some(isToneSet)).toBe(false);
  });
});

describe('?tones= override precedence', () => {
  it('the URL wins over the setting for the page load; no (known) parameter = the setting', async () => {
    await loadToneSets();
    const cases: [string, ToneSet | undefined, ToneSet][] = [
      ['', undefined, 'classic'],
      ['', 'royal', 'royal'],
      ['?tones=pastel', undefined, 'pastel'],
      ['?tones=pastel', 'royal', 'pastel'],
      ['?tones=classic', 'vivid', 'classic'], // an explicit classic beats a saved set (A/B against the shipped look)
      ['?tones=neon', 'vivid', 'vivid'], // unknown name: no override
      ['?tones=', 'pastel', 'pastel'],
      ['?dprcap=3&tones=vivid', 'classic', 'vivid'],
    ];
    for (const [search, setting, active] of cases) {
      vi.stubGlobal('location', { search });
      expect(activeToneSet(setting), `${search} / ${setting}`).toBe(active);
      expect(settingsPalette({ colorBlind: false, tones: setting }), `${search} / ${setting}`).toBe(getPalette(false, active));
      expect(urlToneSet()).toBe(urlToneOverride() ?? 'classic');
    }
  });
});

describe('save field settings.tones (optional, schema stays v3)', () => {
  it('absent on a fresh save and on older saves (= classic); a valid set is kept, anything else dropped', () => {
    expect(defaultSave().settings.tones).toBeUndefined();
    expect(normalizeSave({ version: 3, settings: { colorBlind: true } }).settings.tones).toBeUndefined();
    expect(normalizeSave({ version: 2, coins: 5 }).settings.tones).toBeUndefined();
    for (const tones of TONE_SETS) expect(normalizeSave({ version: 3, settings: { tones } }).settings.tones).toBe(tones);
    for (const tones of ['neon', '', 7, null, { set: 'vivid' }]) expect(normalizeSave({ version: 3, settings: { tones } }).settings.tones, String(tones)).toBeUndefined();
    expect(SAVE_VERSION).toBe(3);
  });

  it('persists through write → load, survives a progress reset, and composes with the colour-blind flag', () => {
    const store = memory();
    setSaveStorageForTests(store);
    const save = defaultSave();
    save.settings.tones = 'vivid';
    save.settings.colorBlind = true;
    save.gold = 120;
    writeSave(save);
    expect(JSON.parse(store.data.get(SAVE_KEY)!).settings).toMatchObject({ tones: 'vivid', colorBlind: true });
    const loaded = loadSaveFrom(store);
    expect(loaded.version).toBe(3);
    expect(loaded.settings.tones).toBe('vivid');
    resetProgress(loaded);
    expect(loaded.gold).toBe(0);
    expect(loaded.settings.tones).toBe('vivid');
    expect(loadSaveFrom(store).settings).toMatchObject({ tones: 'vivid', colorBlind: true });
  });
});

describe('settings layout (SETTINGS.tones)', () => {
  it('the row sits under the language picker and above the summary / RESET, inside the card; About fits 9:16 on the web, scrolls into view with both native rows', () => {
    const r = SETTINGS.tones;
    const card = SETTINGS.card;
    expect(r.x).toBe(SETTINGS.language.x);
    expect(r.w).toBe(SETTINGS.language.w);
    expect(r.h).toBeGreaterThanOrEqual(44);
    expect(SETTINGS.tonesLabelY).toBeGreaterThanOrEqual(SETTINGS.language.y + SETTINGS.language.h);
    expect(r.y).toBeGreaterThanOrEqual(SETTINGS.tonesLabelY + 40);
    // AUD-U2: the "Text size" row sits between the team colours and the summary
    expect(SETTINGS.textSizeSepY).toBeGreaterThanOrEqual(r.y + r.h + 12);
    expect(SETTINGS.textSize.y).toBeGreaterThanOrEqual(SETTINGS.textSizeSepY + 16);
    expect(SETTINGS.summaryY - 12).toBeGreaterThanOrEqual(SETTINGS.textSize.y + SETTINGS.textSize.h + 12);
    expect(SETTINGS.reset.y).toBeGreaterThanOrEqual(SETTINGS.summaryY + 12);
    expect(SETTINGS.reset.y + SETTINGS.reset.h).toBeLessThanOrEqual(card.y + card.h - 16);
    expect(r.y + r.h).toBeLessThanOrEqual(card.y + card.h);
    // each segment is a ≥ 44 px wide target
    expect((r.w - 8) / TONE_SEGMENTS.length).toBeGreaterThanOrEqual(44);
    for (const [support, privacy] of [
      [false, false],
      [true, false],
      [true, true],
    ] as const) {
      const about = settingsAboutLayout(support, privacy);
      expect(about.card.y).toBeGreaterThanOrEqual(card.y + card.h + 8);
      // the web About (version only) fits a 9:16 screen without scrolling; the native rows scroll into view (settings.ts maxScroll)
      if (!support) expect(about.card.y + about.card.h, `about support=${support} privacy=${privacy}`).toBeLessThanOrEqual(1280 - 16);
      else expect(about.card.y + about.card.h, `about support=${support} privacy=${privacy}`).toBeLessThanOrEqual(1280 + 120);
    }
  });
});

describe('locale keys (en / az / ru / tr)', () => {
  it('the row title and the four set names, as agreed for FE-14', () => {
    const keys = ['settings.tones', ...TONE_SEGMENTS.map((s) => s.key)] as const;
    const want: Record<string, string[]> = {
      en: ['Team colours', 'Classic', 'Vivid', 'Royal', 'Pastel'],
      az: ['Komanda rəngləri', 'Klassik', 'Canlı', 'Kral', 'Pastel'],
      ru: ['Цвета команд', 'Классика', 'Яркие', 'Царские', 'Пастель'], // AUD-U2: "Королевские" did not fit its segment at 22 px
      tr: ['Takım renkleri', 'Klasik', 'Canlı', 'Kraliyet', 'Pastel'],
    };
    for (const [code, dict] of Object.entries({ en, az, ru, tr })) expect(keys.map((k) => dict[k]), code).toEqual(want[code]);
  });
});
