/**
 * QA guard: the native store / ads SDKs must never be evaluated on the web.
 *
 * `src/economy/store.ts` and `ads.ts` statically import their native providers
 * (`providers/revenueCat.ts`, `providers/admob.ts`), and those reach the plugin packages only
 * through a dynamic `import()` that runs after an `isNative()` / `getPlatform()` check. Both plugin
 * packages are mocked here with a factory that records the evaluation and then throws: on the web
 * the counter must stay at zero through module load, provider selection and `init()`; inside a
 * (mocked) native shell the import must happen and a throwing SDK must leave the provider
 * unavailable without rejecting. A source-level check completes the picture so a static import
 * added by mistake fails here before `scripts/checkBundle.mjs` sees the built bundle.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const probe = vi.hoisted(() => ({ revenueCat: 0, admob: 0 }));
const native = vi.hoisted(() => ({ isNative: false, platform: 'android' as 'android' | 'ios' }));
// RevenueCat only reaches its import() when a key is configured. `config.ts` reads `import.meta.env`
// through a cast that vitest's `vi.stubEnv` does not reach after module load, so the key lookup
// is mocked directly (the lookup itself is covered by tests/economy/store.test.ts).
const keys = vi.hoisted(() => ({ revenueCat: '' }));

vi.mock('@revenuecat/purchases-capacitor', () => {
  probe.revenueCat++;
  throw new Error('@revenuecat/purchases-capacitor was evaluated');
});
vi.mock('@capacitor-community/admob', () => {
  probe.admob++;
  throw new Error('@capacitor-community/admob was evaluated');
});
vi.mock('../../src/native/index', () => ({
  isNative: () => native.isNative,
  getPlatform: () => (native.isNative ? native.platform : 'web'),
}));
vi.mock('../../src/economy/providers/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/economy/providers/config')>()),
  revenueCatApiKey: () => keys.revenueCat,
}));

import { getStore, resetStoreForTests } from '../../src/economy/store';
import { getAds, resetAdsForTests } from '../../src/economy/ads';
import { fakeStore } from '../../src/economy/providers/fakeStore';
import { noAds } from '../../src/economy/providers/noAds';
import { revenueCatStore, resetRevenueCatForTests } from '../../src/economy/providers/revenueCat';
import { adMobAds, resetAdMobForTests } from '../../src/economy/providers/admob';

beforeEach(() => {
  native.isNative = false;
  keys.revenueCat = '';
  resetStoreForTests();
  resetAdsForTests();
  resetRevenueCatForTests();
  resetAdMobForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Order matters: the "web" block must run before anything selects a native platform, because a
// plugin factory, once evaluated, may stay cached for the rest of the file.
describe('web runtime never loads the native plugin packages', () => {
  it('importing store.ts / ads.ts does not evaluate them', () => {
    expect(probe).toEqual({ revenueCat: 0, admob: 0 });
  });

  it('selecting and initialising the web providers does not evaluate them', async () => {
    const store = getStore();
    const ads = getAds();
    expect(store).toBe(fakeStore);
    expect(ads).toBe(noAds);
    await store.init();
    await ads.init();
    expect(store.isAvailable()).toBe(true);
    expect(ads.isAvailable()).toBe(false);
    expect(probe).toEqual({ revenueCat: 0, admob: 0 });
  });

  it('calling init() directly on the native providers on the web is a no-op (platform gate)', async () => {
    await revenueCatStore.init();
    await adMobAds.init();
    expect(revenueCatStore.isAvailable()).toBe(false);
    expect(adMobAds.isAvailable()).toBe(false);
    expect(probe).toEqual({ revenueCat: 0, admob: 0 });
  });

  it('a configured RevenueCat key alone does not trigger the import on the web', async () => {
    keys.revenueCat = 'goog_test_key';
    await getStore().init();
    await revenueCatStore.init();
    expect(probe).toEqual({ revenueCat: 0, admob: 0 });
  });
});

describe('native runtime loads the plugins lazily and survives a broken SDK', () => {
  it('RevenueCat is imported only inside init() with a key, and a throwing SDK leaves the store unavailable', async () => {
    native.isNative = true;
    native.platform = 'android';
    expect(getStore()).toBe(revenueCatStore);
    expect(probe.revenueCat).toBe(0);

    // No key: init returns before touching the plugin.
    await revenueCatStore.init();
    expect(probe.revenueCat).toBe(0);
    expect(revenueCatStore.isAvailable()).toBe(false);

    resetRevenueCatForTests();
    keys.revenueCat = 'goog_test_key';
    await expect(revenueCatStore.init()).resolves.toBeUndefined();
    expect(probe.revenueCat).toBe(1);
    expect(revenueCatStore.isAvailable()).toBe(false);
    expect(await revenueCatStore.purchase('remove_ads')).toEqual({ ok: false, productId: 'remove_ads', error: 'unavailable' });
    expect(await revenueCatStore.restore()).toEqual([]);
    expect(await revenueCatStore.getProducts(['remove_ads'])).toEqual([]);
  });

  it('AdMob is imported only inside init(), and a throwing SDK leaves ads unavailable', async () => {
    native.isNative = true;
    native.platform = 'ios';
    expect(getAds()).toBe(adMobAds);
    expect(probe.admob).toBe(0);
    await expect(adMobAds.init()).resolves.toBeUndefined();
    expect(probe.admob).toBe(1);
    expect(adMobAds.isAvailable()).toBe(false);
    expect(await adMobAds.showInterstitial()).toBe(false);
    expect(await adMobAds.showRewarded('level_retry')).toEqual({ rewarded: false });
  });
});

describe('source guard: plugin packages are only ever dynamically imported', () => {
  const PLUGINS = ['@revenuecat/purchases-capacitor', '@capacitor-community/admob'];
  const SRC = join(__dirname, '..', '..', 'src');

  function tsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...tsFiles(p));
      else if (entry.isFile() && /\.ts$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) out.push(p);
    }
    return out;
  }

  it('no static `import … from` / `export … from` / require() of the plugin packages under src/', () => {
    const offenders: string[] = [];
    for (const file of tsFiles(SRC)) {
      const code = readFileSync(file, 'utf8');
      for (const pkg of PLUGINS) {
        const escaped = pkg.replace(/[/@-]/g, '\\$&');
        // `import type {…} from 'pkg'` and `typeof import('pkg')` are erased by TypeScript and allowed.
        const staticImport = new RegExp(`^\\s*(import|export)\\s+(?!type\\b)[^;]*?\\bfrom\\s+['"]${escaped}['"]`, 'm');
        const bareImport = new RegExp(`^\\s*import\\s+['"]${escaped}['"]`, 'm');
        const req = new RegExp(`require\\(\\s*['"]${escaped}['"]\\s*\\)`);
        if (staticImport.test(code) || bareImport.test(code) || req.test(code)) offenders.push(`${file}: ${pkg}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the providers reach the packages through a dynamic import()', () => {
    const rc = readFileSync(join(SRC, 'economy', 'providers', 'revenueCat.ts'), 'utf8');
    const admob = readFileSync(join(SRC, 'economy', 'providers', 'admob.ts'), 'utf8');
    expect(rc).toMatch(/await import\(\s*['"]@revenuecat\/purchases-capacitor['"]\s*\)/);
    expect(admob).toMatch(/await import\(\s*['"]@capacitor-community\/admob['"]\s*\)/);
  });
});
