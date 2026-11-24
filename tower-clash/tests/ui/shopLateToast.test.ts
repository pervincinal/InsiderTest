import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from '../../src/render/view';
import { getPalette } from '../../src/render/palette';
import type { Rect } from '../../src/render/widgets';
import { SHOP } from '../../src/render/menuLayout';
import { createAdSession } from '../../src/economy/adsFlow';
import { IAP_PRODUCTS } from '../../src/economy/catalog';
import type { IapProductDef } from '../../src/economy/catalog';
import { getStore } from '../../src/economy/store';
import type { PurchaseResult } from '../../src/economy/store';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { App, QueuedToast, Screen } from '../../src/ui/screens';
import { TitleScreen, handOverToasts } from '../../src/ui/screens';
import { ShopScreen } from '../../src/ui/shop';
import { t } from '../../src/ui/i18n';

/*
 * REV-41: a store purchase (or a restore) settles seconds after the tap, and BACK stays live
 * meanwhile — a store sheet that never answers must not trap the player in the shop. When the player
 * has left by the time the store answers, the result toast goes to the screen that is current now
 * (FE-9 carry, `App.carryToasts`, the REV-37 pattern) instead of being shown on the abandoned shop.
 */

vi.mock('../../src/render/menusShop', () => ({ drawShop: () => undefined }));

const RECT: Rect = { x: 0, y: 0, w: 100, h: 50 };
const product = (id: string): IapProductDef => (IAP_PRODUCTS as readonly IapProductDef[]).find((p) => p.id === id)!;
const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, id: 1, type: 'touch' as const, timeMs: 0 });

interface TestApp extends App {
  current: Screen;
}

function makeApp(save: SaveData, carry: boolean): TestApp {
  let carried: QueuedToast[] = [];
  const app: TestApp = {
    view: {} as View,
    save,
    ads: createAdSession(),
    palette: () => getPalette(false),
    goTitle() {},
    goLevels() {},
    goShop() {},
    goAchievements() {},
    startLevel: () => Promise.resolve(true),
    go(s: Screen) {
      app.current = s;
    },
    openSettings() {},
    openHowTo() {},
    setSpeed() {},
    setLanguage() {},
    dayKey: () => '2026-11-24',
    weekKey: () => '2026-11-23',
    current: undefined as unknown as Screen,
    ...(carry
      ? {
          carryToasts(queued: readonly QueuedToast[]) {
            carried = handOverToasts([...carried, ...queued], app.current);
          },
        }
      : {}),
  };
  return app;
}

let save: SaveData;
let app: TestApp;
let shop: ShopScreen;
let title: TitleScreen;
let backs: number;
let answer: (r: PurchaseResult) => void;
let restoreAnswer: (ids: string[]) => void;

function setUp(carry = true): void {
  app = makeApp(save, carry);
  backs = 0;
  // BACK in the real app: `app.goTitle()` → `go(new TitleScreen)`; here the title becomes current
  shop = new ShopScreen(app, 'crystals', () => {
    backs += 1;
    app.go(title);
  });
  title = new TitleScreen(app);
  app.go(shop);
  shop.enter();
  vi.spyOn(getStore(), 'isAvailable').mockImplementation(() => true);
  vi.spyOn(getStore(), 'purchase').mockImplementation(
    () =>
      new Promise<PurchaseResult>((res) => {
        answer = res;
      }),
  );
  vi.spyOn(getStore(), 'restore').mockImplementation(
    () =>
      new Promise<string[]>((res) => {
        restoreAnswer = res;
      }),
  );
}

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const toastOn = (s: { toast: { opts(now: number): { text: string } | null } }): string | undefined => s.toast.opts(performance.now())?.text;

beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  setUp();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a purchase that settles after the player left the shop (REV-41)', () => {
  it('BACK stays live while the purchase is pending', async () => {
    const buying = shop.buy(product('crystals_100'), RECT);
    shop.down(centre(SHOP.back));
    shop.up(centre(SHOP.back));
    expect(backs).toBe(1);
    expect(app.current).toBe(title);
    answer({ ok: false, productId: 'crystals_100', error: 'cancelled' });
    expect(await buying).toBe(false);
  });

  it('the granted pack is still granted, and its toast shows on the screen that is current now, not on the dead shop', async () => {
    const buying = shop.buy(product('crystals_100'), RECT);
    shop.down(centre(SHOP.back));
    shop.up(centre(SHOP.back));
    answer({ ok: true, productId: 'crystals_100', transactionId: 'GPA.1' });
    expect(await buying).toBe(true);
    await flush();
    expect(save.crystals).toBe(100);
    expect(toastOn(shop)).toBeUndefined();
    expect(toastOn(title)).toBe(`${product('crystals_100').title}: ${t('amount.crystals', { n: 100 })}`);
  });

  it('a failure after leaving is told on the current screen too', async () => {
    const buying = shop.buy(product('remove_ads'), RECT);
    shop.down(centre(SHOP.back));
    shop.up(centre(SHOP.back));
    answer({ ok: false, productId: 'remove_ads', error: 'failed' });
    expect(await buying).toBe(false);
    expect(toastOn(shop)).toBeUndefined();
    expect(toastOn(title)).toBe(t('shop.toast.purchaseFailed'));
  });

  it('a restore that settles after BACK: its toast follows the player', async () => {
    const restoring = shop.restore();
    shop.down(centre(SHOP.back));
    shop.up(centre(SHOP.back));
    restoreAnswer([]);
    expect(await restoring).toEqual([]);
    expect(toastOn(shop)).toBeUndefined();
    expect(toastOn(title)).toBe(t('shop.toast.nothingToRestore'));
  });

  it('while the shop is still current the toast shows on the shop, as before', async () => {
    const buying = shop.buy(product('crystals_100'), RECT);
    answer({ ok: true, productId: 'crystals_100', transactionId: 'GPA.2' });
    expect(await buying).toBe(true);
    expect(toastOn(shop)).toBe(`${product('crystals_100').title}: ${t('amount.crystals', { n: 100 })}`);
    expect(toastOn(title)).toBeUndefined();
  });

  it('an app without the carry (test shells) keeps the toast on the shop', async () => {
    setUp(false);
    const buying = shop.buy(product('crystals_100'), RECT);
    shop.down(centre(SHOP.back));
    shop.up(centre(SHOP.back));
    answer({ ok: true, productId: 'crystals_100', transactionId: 'GPA.3' });
    expect(await buying).toBe(true);
    expect(toastOn(shop)).toBe(`${product('crystals_100').title}: ${t('amount.crystals', { n: 100 })}`);
  });
});
