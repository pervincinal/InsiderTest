/**
 * MM-9: rating prompt (`src/native/review.ts`). `requestReview()` lazily imports
 * `@capacitor-community/in-app-review` inside a Capacitor shell only and never rejects;
 * `maybeAskForReview()` is the result-screen hook: flag off → 'disabled' with the save untouched;
 * flag on → the first campaign 3★ win on level ≥ 10 asks once per install (`save.reviewAsked`).
 *
 * The plugin module is mocked with a factory that counts evaluations and calls, so the tests can
 * assert the lazy import; `isNative()` is mocked per test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ctl = {
  isNative: true,
  imports: 0,
  calls: 0,
  failImport: false,
  /** `InAppReview.requestReview()` rejects with this message. */
  failRequest: null as string | null,
  /** When set, `requestReview()` waits for this promise (to test overlapping calls). */
  gate: null as Promise<void> | null,
};

vi.mock('../../src/native/index', () => ({
  isNative: () => ctl.isNative,
  getPlatform: () => (ctl.isNative ? 'ios' : 'web'),
}));

type ReviewModule = typeof import('../../src/native/review');
type SaveModule = typeof import('../../src/ui/save');
type SaveData = import('../../src/ui/save').SaveData;
type Trigger = import('../../src/native/review').ReviewTrigger;

function memStore() {
  const m = new Map<string, string>();
  const writes: string[] = [];
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      writes.push(k);
      m.set(k, v);
    },
    removeItem: (k: string) => void m.delete(k),
    dump: () => Object.fromEntries(m),
    writes,
  };
}

let store: ReturnType<typeof memStore>;

/** Fresh review + save modules (same instance graph) with the plugin mock installed. */
async function fresh(): Promise<{ review: ReviewModule; saveMod: SaveModule }> {
  vi.resetModules();
  vi.doMock('@capacitor-community/in-app-review', () => {
    ctl.imports++;
    if (ctl.failImport) throw new Error('Failed to fetch dynamically imported module: in-app-review');
    return {
      InAppReview: {
        async requestReview() {
          ctl.calls++;
          if (ctl.gate) await ctl.gate;
          if (ctl.failRequest) throw new Error(ctl.failRequest);
        },
      },
    };
  });
  const saveMod = await import('../../src/ui/save');
  saveMod.setSaveStorageForTests(store);
  const review = await import('../../src/native/review');
  return { review, saveMod };
}

/** A campaign result (no challenge / daily / weekly). */
function campaign(levelId: number, stars: number, outcome = 'won'): Trigger {
  return { level: { id: levelId }, ui: { outcome, stars } };
}

beforeEach(() => {
  Object.assign(ctl, { isNative: true, imports: 0, calls: 0, failImport: false, failRequest: null, gate: null });
  store = memStore();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.doUnmock('@capacitor-community/in-app-review');
});

describe('requestReview — web', () => {
  it('resolves "unavailable" without loading the plugin', async () => {
    ctl.isNative = false;
    const { review } = await fresh();
    await expect(review.requestReview()).resolves.toBe('unavailable');
    expect(ctl.imports).toBe(0);
    expect(ctl.calls).toBe(0);
  });
});

describe('requestReview — native', () => {
  it('does not load the plugin until requestReview() is called', async () => {
    await fresh();
    expect(ctl.imports).toBe(0);
  });

  it('calls InAppReview.requestReview() once and resolves "requested"', async () => {
    const { review } = await fresh();
    await expect(review.requestReview()).resolves.toBe('requested');
    expect(ctl.imports).toBe(1);
    expect(ctl.calls).toBe(1);
  });

  it('resolves "unavailable" (never rejects) when the plugin call throws', async () => {
    ctl.failRequest = 'Request review task Failed';
    const { review } = await fresh();
    await expect(review.requestReview()).resolves.toBe('unavailable');
    expect(ctl.calls).toBe(1);
  });

  it('resolves "unavailable" when the plugin fails to load', async () => {
    ctl.failImport = true;
    const { review } = await fresh();
    await expect(review.requestReview()).resolves.toBe('unavailable');
    expect(ctl.calls).toBe(0);
  });
});

describe('flag', () => {
  it('ships off', async () => {
    const { review } = await fresh();
    expect(review.RATING_PROMPT_ENABLED).toBe(false);
    expect(review.ratingPromptEnabled()).toBe(false);
  });

  it('flag off → "disabled" for a qualifying result, without touching the save or the plugin', async () => {
    const { review, saveMod } = await fresh();
    const save = saveMod.defaultSave();
    const before = JSON.stringify(save);
    await expect(review.maybeAskForReview(campaign(10, 3), save)).resolves.toBe('disabled');
    expect(JSON.stringify(save)).toBe(before);
    expect(store.writes).toEqual([]);
    expect(ctl.imports).toBe(0);
  });

  it('?review=on turns it on in a browser only; there the hook resolves "unavailable" and the save stays as it was', async () => {
    ctl.isNative = false;
    vi.stubGlobal('location', { search: '?lang=en&review=on' });
    const { review, saveMod } = await fresh();
    expect(review.reviewOnByUrl()).toBe(true);
    expect(review.ratingPromptEnabled()).toBe(true);
    const save = saveMod.defaultSave();
    await expect(review.maybeAskForReview(campaign(10, 3), save)).resolves.toBe('unavailable');
    expect(save.reviewAsked).toBe(false);
    expect(store.writes).toEqual([]);
    expect(ctl.imports).toBe(0);
  });

  it('?review=on is ignored inside a native shell, and other values do not match', async () => {
    vi.stubGlobal('location', { search: '?review=on' });
    const { review } = await fresh();
    expect(review.reviewOnByUrl(true)).toBe(false);
    expect(review.ratingPromptEnabled()).toBe(false); // ctl.isNative = true
    vi.stubGlobal('location', { search: '?review=onx' });
    expect(review.reviewOnByUrl(false)).toBe(false);
    vi.stubGlobal('location', { search: '?preview=on' });
    expect(review.reviewOnByUrl(false)).toBe(false);
  });
});

describe('trigger rule (flag on, native)', () => {
  let review: ReviewModule;
  let saveMod: SaveModule;
  let save: SaveData;

  beforeEach(async () => {
    ({ review, saveMod } = await fresh());
    review.setRatingPromptForTests(true);
    save = saveMod.defaultSave();
  });

  afterEach(() => review.setRatingPromptForTests(undefined));

  it('level 9 with 3★ → skipped', async () => {
    await expect(review.maybeAskForReview(campaign(9, 3), save)).resolves.toBe('skipped');
    expect(ctl.calls).toBe(0);
    expect(save.reviewAsked).toBe(false);
    expect(store.writes).toEqual([]);
  });

  it('level 10 with 2★ → skipped; a defeat → skipped', async () => {
    await expect(review.maybeAskForReview(campaign(10, 2), save)).resolves.toBe('skipped');
    await expect(review.maybeAskForReview(campaign(12, 0, 'lost'), save)).resolves.toBe('skipped');
    expect(ctl.calls).toBe(0);
  });

  it('daily, Yesterday’s-map practice and weekly 3★ wins → skipped', async () => {
    const daily = { ...campaign(30, 3), challenge: {}, daily: { practice: false } };
    const practice = { ...campaign(30, 3), challenge: {}, daily: { practice: true } };
    const weekly = { ...campaign(30, 3), weekly: {}, weeklyOutcome: {} };
    for (const info of [daily, practice, weekly]) await expect(review.maybeAskForReview(info, save)).resolves.toBe('skipped');
    expect(ctl.calls).toBe(0);
    expect(save.reviewAsked).toBe(false);
  });

  it('level 10 with 3★ → requested once, persisted; the second qualifying win → skipped', async () => {
    await expect(review.maybeAskForReview(campaign(10, 3), save)).resolves.toBe('requested');
    expect(ctl.calls).toBe(1);
    expect(save.reviewAsked).toBe(true);
    expect(store.writes).toEqual([saveMod.SAVE_KEY]);
    expect((JSON.parse(store.dump()[saveMod.SAVE_KEY]!) as SaveData).reviewAsked).toBe(true);

    await expect(review.maybeAskForReview(campaign(11, 3), save)).resolves.toBe('skipped');
    // and after a restart (save reloaded from storage)
    const reloaded = saveMod.loadSaveFrom(store);
    await expect(review.maybeAskForReview(campaign(10, 3), reloaded)).resolves.toBe('skipped');
    expect(ctl.calls).toBe(1);
  });

  it('a failed plugin call → unavailable, nothing persisted, the next qualifying win asks again', async () => {
    ctl.failRequest = 'Request review task Failed';
    await expect(review.maybeAskForReview(campaign(10, 3), save)).resolves.toBe('unavailable');
    expect(save.reviewAsked).toBe(false);
    expect(store.writes).toEqual([]);
    ctl.failRequest = null;
    await expect(review.maybeAskForReview(campaign(10, 3), save)).resolves.toBe('requested');
    expect(ctl.calls).toBe(2);
  });

  it('a second result while the first request is running → skipped (no double ask)', async () => {
    let open!: () => void;
    ctl.gate = new Promise<void>((resolve) => (open = resolve));
    const first = review.maybeAskForReview(campaign(10, 3), save);
    await vi.waitFor(() => expect(ctl.calls).toBe(1));
    await expect(review.maybeAskForReview(campaign(10, 3), save)).resolves.toBe('skipped');
    open();
    await expect(first).resolves.toBe('requested');
    expect(ctl.calls).toBe(1);
  });

  it('on the web the hook resolves "unavailable" without loading the plugin', async () => {
    ctl.isNative = false;
    await expect(review.maybeAskForReview(campaign(10, 3), save)).resolves.toBe('unavailable');
    expect(ctl.imports).toBe(0);
    expect(save.reviewAsked).toBe(false);
  });
});

describe('save.reviewAsked', () => {
  it('defaults to false, keeps only a strict true, and survives a progress reset', async () => {
    const { saveMod } = await fresh();
    expect(saveMod.defaultSave().reviewAsked).toBe(false);
    expect(saveMod.normalizeSave({ version: 3 }).reviewAsked).toBe(false);
    expect(saveMod.normalizeSave({ version: 3, reviewAsked: true }).reviewAsked).toBe(true);
    expect(saveMod.normalizeSave({ version: 3, reviewAsked: 'yes' }).reviewAsked).toBe(false);
    const save = saveMod.defaultSave();
    save.reviewAsked = true;
    save.stars['10'] = 3;
    saveMod.resetProgress(save);
    expect(save.stars).toEqual({});
    expect(save.reviewAsked).toBe(true);
  });
});
