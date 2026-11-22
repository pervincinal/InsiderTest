import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { Rect } from '../../src/render/widgets';
import { createAdSession } from '../../src/economy/adsFlow';
import { IAP_PRODUCTS } from '../../src/economy/catalog';
import type { IapProductDef } from '../../src/economy/catalog';
import { getStore } from '../../src/economy/store';
import type { PurchaseResult } from '../../src/economy/store';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App } from '../../src/ui/screens';
import { ShopScreen } from '../../src/ui/shop';
import { t } from '../../src/ui/i18n';

/*
 * REV-20 / REV-27: what the shop says (and grants) when the store confirms a purchase the wallet
 * will not pay out again. A crystal pack delivered once and confirmed again — a retry with the same
 * transaction id, or RevenueCat's "already purchased" without an id — adds no crystals and gets
 * the neutral "already delivered" toast; a non-consumable the save owns keeps "already owned".
 */

vi.mock('../../src/render/menusShop', () => ({ drawShop: () => undefined }));

const RECT: Rect = { x: 0, y: 0, w: 100, h: 50 };
const product = (id: string): IapProductDef => (IAP_PRODUCTS as readonly IapProductDef[]).find((p) => p.id === id)!;

function fakeApp(save: SaveData): App {
  return {
    view: {} as View,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {},
    goShop() {},
    goAchievements() {},
    startLevel: () => Promise.resolve(true),
    go() {},
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-11-22',
    weekKey: () => '2026-11-16',
  };
}

let save: SaveData;
let screen: ShopScreen;
let toasts: string[];

function storeAnswers(results: PurchaseResult[]): void {
  const queue = [...results];
  vi.spyOn(getStore(), 'isAvailable').mockImplementation(() => true);
  vi.spyOn(getStore(), 'purchase').mockImplementation((id) => Promise.resolve(queue.shift() ?? { ok: false, productId: id, error: 'failed' }));
}

beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  screen = new ShopScreen(fakeApp(save), 'crystals');
  toasts = [];
  vi.spyOn(screen.toast, 'show').mockImplementation((text) => void toasts.push(text));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shop.buy toasts for a confirmed-but-not-granted purchase', () => {
  it('a crystal pack confirmed again with the same transaction id: no second grant, "already delivered"', async () => {
    storeAnswers([
      { ok: true, productId: 'crystals_100', transactionId: 'GPA.1' },
      { ok: true, productId: 'crystals_100', transactionId: 'GPA.1' },
    ]);
    expect(await screen.buy(product('crystals_100'), RECT)).toBe(true);
    expect(save.crystals).toBe(100);
    expect(await screen.buy(product('crystals_100'), RECT)).toBe(false);
    expect(save.crystals).toBe(100);
    expect(toasts.at(-1)).toBe(t('shop.toast.alreadyDelivered'));
    expect(toasts.at(-1)).not.toBe(t('shop.toast.alreadyOwned'));
  });

  it('REV-20: a crystal pack the store reports "already purchased" (ok, no id) is not granted again', async () => {
    storeAnswers([{ ok: true, productId: 'crystals_100', transactionId: 'GPA.1' }, { ok: true, productId: 'crystals_100' }]);
    expect(await screen.buy(product('crystals_100'), RECT)).toBe(true);
    expect(await screen.buy(product('crystals_100'), RECT)).toBe(false);
    expect(save.crystals).toBe(100);
    expect(save.purchases).toEqual(['GPA.1']);
    expect(toasts.at(-1)).toBe(t('shop.toast.alreadyDelivered'));
  });

  it('a non-consumable the save already owns keeps the "already owned" toast', async () => {
    storeAnswers([{ ok: true, productId: 'remove_ads', transactionId: 'GPA.2' }, { ok: true, productId: 'remove_ads' }]);
    expect(await screen.buy(product('remove_ads'), RECT)).toBe(true);
    expect(save.entitlements.noAds).toBe(true);
    expect(await screen.buy(product('remove_ads'), RECT)).toBe(false);
    expect(toasts.at(-1)).toBe(t('shop.toast.alreadyOwned'));
  });
});
