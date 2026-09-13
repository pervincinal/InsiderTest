/**
 * Shop screen (ECONOMY.md §4, Phase A): Crystals (IAP packs) · Bundles (starter / remove ads /
 * premium) · Skins (crystals, equip) · Upgrades (commander tracks, gold). Purchases go through
 * `getStore()` and are granted only on `{ ok: true }`, once per transaction id (wallet.grantProduct).
 * Input produces wallet / save mutations only; the sim is never touched here.
 */
import type { View } from '../render/view';
import type { Rect } from '../render/widgets';
import { inRect, segmentAt } from '../render/widgets';
import type { ShopTab } from '../render/layout';
import { SHOP, SHOP_TABS, shopPackRect, shopRowRect, shopSkinRect } from '../render/layout';
import type { ShopBundleCard, ShopPackCard, ShopSkinCard, ShopUpgradeCard } from '../render/menus';
import { drawShop } from '../render/menus';
import { ParticleSystem } from '../render/particles';
import type { PointerPoint } from '../input/pointer';
import type { IapProductDef, SkinDef } from '../economy/catalog';
import { getStore } from '../economy/store';
import { grantProduct, restorePurchases, spendCrystals } from '../economy/wallet';
import { ownsProduct, shopSkins, spriteSkinId, visibleProducts } from '../economy/entitlements';
import { UPGRADE_DEFS, UPGRADE_GLYPH, buyUpgrade, upgradeCost, upgradeEffectText, upgradeTier } from './upgrades';
import { writeSave } from './save';
import type { App, Screen } from './screens';
import { Toast } from './screens';
import { playSfx } from '../audio/index';

interface Hit {
  rect: Rect;
  action: () => void;
}

interface Layout {
  packs: ShopPackCard[];
  bundles: ShopBundleCard[];
  skinHeaders: { label: string; y: number }[];
  skins: ShopSkinCard[];
  upgrades: ShopUpgradeCard[];
  restoreRect: Rect | null;
  hits: Hit[];
  contentHeight: number;
}

const BUNDLE_GLYPH: Record<string, ShopBundleCard['glyph']> = {
  starter_pack: 'chest',
  remove_ads: 'noads',
  premium_bundle: 'crown',
  premium_upgrade: 'crown',
};

function bundleLines(p: IapProductDef): string[] {
  const g = p.grants;
  const lines: string[] = [];
  if (g.crystals) lines.push(`${g.crystals} crystals`);
  if (g.gold) lines.push(`${g.gold} gold`);
  if (g.removeAds) lines.push('No ads between levels');
  if (g.skins?.length) lines.push(g.skins.length === 1 ? 'Exclusive Bronze helmet' : 'Gold roof + Royal helmet');
  if (g.boosterDiscount) lines.push(`−${Math.round(g.boosterDiscount * 100)} % on boosters, forever`);
  return lines;
}

function skinLabel(s: SkinDef): string {
  return s.label.replace(/ (roof|helmet)$/i, '');
}

export class ShopScreen implements Screen {
  readonly name = 'shop' as const;
  private tab: ShopTab;
  private scroll = 0;
  private downY = 0;
  private scrollAtDown = 0;
  private held = false;
  private dragging = false;
  private pressed: Rect | null = null;
  private pending: string | null = null;
  private nowMs = 0;
  private readonly toast = new Toast();
  private readonly particles = new ParticleSystem();
  private readonly prices = new Map<string, string>();
  private hits: Hit[] = [];
  private contentHeight = 0;

  constructor(
    private readonly app: App,
    tab: ShopTab = 'crystals',
    private readonly back: () => void = () => app.goTitle(),
  ) {
    this.tab = tab;
  }

  enter(): void {
    const ids = visibleProducts(this.app.save).map((p) => p.id);
    void getStore()
      .getProducts(ids)
      .then((list) => {
        for (const p of list) this.prices.set(p.id, p.priceString);
      })
      .catch(() => undefined);
  }

  get currentTab(): ShopTab {
    return this.tab;
  }

  setTab(tab: ShopTab): void {
    this.tab = tab;
    this.scroll = 0;
    this.pressed = null;
  }

  private priceOf(p: IapProductDef): string {
    return this.prices.get(p.id) ?? `$${p.priceUsd.toFixed(2)}`;
  }

  /** Cards + hit regions of the active tab, in content space (scroll is applied at draw / hit time). */
  private layout(): Layout {
    const save = this.app.save;
    const out: Layout = { packs: [], bundles: [], skinHeaders: [], skins: [], upgrades: [], restoreRect: null, hits: [], contentHeight: 0 };
    let bottom: number = SHOP.contentTop;
    if (this.tab === 'crystals') {
      const packs = visibleProducts(save).filter((p) => p.bonusPct !== undefined);
      packs.forEach((p, i) => {
        const rect = shopPackRect(i);
        out.packs.push({ id: p.id, rect, crystals: p.grants.crystals ?? 0, bonusPct: p.bonusPct ?? 0, price: this.priceOf(p), count: Math.min(5, i + 1) });
        out.hits.push({ rect, action: () => void this.buy(p, rect) });
        bottom = Math.max(bottom, rect.y + rect.h);
      });
    } else if (this.tab === 'bundles') {
      const bundles = visibleProducts(save).filter((p) => p.bonusPct === undefined);
      bundles.forEach((p, i) => {
        const rect = shopRowRect(i);
        const owned = ownsProduct(save, p.id);
        out.bundles.push({ id: p.id, rect, title: p.title, lines: bundleLines(p), price: this.priceOf(p), owned, glyph: BUNDLE_GLYPH[p.id] ?? 'chest' });
        if (!owned) out.hits.push({ rect, action: () => void this.buy(p, rect) });
        bottom = Math.max(bottom, rect.y + rect.h);
      });
    } else if (this.tab === 'skins') {
      let top = SHOP.row.y0 - 6;
      for (const [category, label] of [
        ['towerRoof', 'Tower roofs'],
        ['unitHelmet', 'Soldier helmets'],
      ] as const) {
        const list = shopSkins().filter((s) => s.category === category);
        out.skinHeaders.push({ label, y: top });
        list.forEach((s, i) => {
          const rect = shopSkinRect(top, i);
          const owned = save.skins.owned.includes(s.id);
          const family = category === 'towerRoof' ? 'roof' : 'helmet';
          const equipped = owned && save.skins.equipped[family] === s.id;
          out.skins.push({ id: s.id, rect, label: skinLabel(s), spriteId: spriteSkinId(s.id), cost: s.costCrystals, owned, equipped, locked: !owned && s.costCrystals === 0 });
          out.hits.push({ rect, action: () => this.tapSkin(s, family, rect) });
          bottom = Math.max(bottom, rect.y + rect.h);
        });
        top = bottom + 22;
      }
    } else {
      UPGRADE_DEFS.forEach((d, i) => {
        const rect = shopRowRect(i);
        const tier = upgradeTier(save, d.id);
        const cost = upgradeCost(save, d.id);
        out.upgrades.push({
          id: d.id,
          rect,
          label: d.label,
          glyph: UPGRADE_GLYPH[d.id] ?? 'production',
          tier,
          maxTier: d.maxTier,
          cost,
          effectNow: upgradeEffectText(d, tier),
          effectNext: upgradeEffectText(d, Math.min(d.maxTier, tier + 1)),
          affordable: cost !== null && save.gold >= cost,
        });
        if (cost !== null) out.hits.push({ rect, action: () => this.tapUpgrade(d.id, rect) });
        bottom = Math.max(bottom, rect.y + rect.h);
      });
      bottom += 40;
    }
    if (this.tab === 'crystals' || this.tab === 'bundles') {
      const rect: Rect = { x: 160, y: bottom + 24, w: 400, h: SHOP.restoreH };
      out.restoreRect = rect;
      out.hits.push({ rect, action: () => void this.restore() });
      bottom = rect.y + rect.h + 44;
    }
    out.contentHeight = bottom + 20;
    return out;
  }

  private maxScroll(): number {
    return Math.max(0, this.contentHeight - SHOP.contentBottom);
  }

  setScroll(y: number): void {
    this.scroll = Math.max(0, Math.min(this.maxScroll(), y));
  }

  draw(view: View, nowMs: number): void {
    this.nowMs = nowMs;
    const lay = this.layout();
    this.hits = lay.hits;
    this.contentHeight = lay.contentHeight;
    this.setScroll(this.scroll);
    drawShop(view, this.app.palette(), {
      tab: this.tab,
      tabsRect: SHOP.tabs,
      backRect: SHOP.back,
      walletRect: SHOP.wallet,
      scroll: this.scroll,
      gold: this.app.save.gold,
      crystals: this.app.save.crystals,
      packs: lay.packs,
      bundles: lay.bundles,
      skinHeaders: lay.skinHeaders,
      skins: lay.skins,
      upgrades: lay.upgrades,
      restoreRect: lay.restoreRect,
      storeAvailable: getStore().isAvailable(),
      pending: this.pending,
      pressed: this.pressed,
      nowMs,
      toast: this.toast.opts(nowMs),
      particles: this.particles,
    });
  }

  /* ----- input ----- */

  private contentHit(p: PointerPoint): Hit | null {
    if (p.y < SHOP.contentTop || p.y > SHOP.contentBottom) return null;
    const y = p.y + this.scroll;
    return this.hits.find((h) => inRect(h.rect, p.x, y)) ?? null;
  }

  down(p: PointerPoint): void {
    this.held = true;
    this.downY = p.y;
    this.scrollAtDown = this.scroll;
    this.dragging = false;
    if (inRect(SHOP.back, p.x, p.y)) this.pressed = SHOP.back;
    else this.pressed = this.contentHit(p)?.rect ?? null;
  }

  move(p: PointerPoint): void {
    if (!this.held) return;
    if (Math.abs(p.y - this.downY) > 14) {
      this.dragging = true;
      this.pressed = null;
    }
    if (this.dragging) this.setScroll(this.scrollAtDown - (p.y - this.downY));
  }

  up(p: PointerPoint): void {
    const hit = this.pressed;
    this.pressed = null;
    const wasDrag = this.dragging;
    this.held = false;
    this.dragging = false;
    if (wasDrag) return;
    if (inRect(SHOP.back, p.x, p.y)) {
      this.back();
      return;
    }
    if (inRect(SHOP.wallet, p.x, p.y)) {
      this.setTab('crystals');
      return;
    }
    if (inRect(SHOP.tabs, p.x, p.y)) {
      const tab = SHOP_TABS[segmentAt(SHOP.tabs, SHOP_TABS.length, p.x, p.y)];
      if (tab && tab !== this.tab) {
        playSfx('button');
        this.setTab(tab);
      }
      return;
    }
    const target = this.contentHit(p);
    if (target && hit && inRect(hit, p.x, p.y + this.scroll)) target.action();
  }

  wheel(dy: number): void {
    this.setScroll(this.scroll + dy);
  }

  cancel(): void {
    this.held = false;
    this.dragging = false;
    this.pressed = null;
  }

  key(e: KeyboardEvent): void {
    if (e.key === 'Escape') this.back();
    else if (e.key === 'ArrowDown') this.setScroll(this.scroll + 120);
    else if (e.key === 'ArrowUp') this.setScroll(this.scroll - 120);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const i = SHOP_TABS.indexOf(this.tab) + (e.key === 'ArrowRight' ? 1 : -1);
      const tab = SHOP_TABS[(i + SHOP_TABS.length) % SHOP_TABS.length];
      if (tab) this.setTab(tab);
    }
  }

  /* ----- actions ----- */

  private burst(kind: 'gold' | 'crystal', rect: Rect): void {
    const x = rect.x + rect.w / 2;
    const y = rect.y + rect.h * 0.4;
    if (kind === 'gold') this.particles.coinBurst(x, y, 16, this.app.palette());
    else this.particles.crystalBurst(x, y, 12, this.app.palette());
  }

  /** Store purchase: pressed → spinner → grant on ok; cancelled = nothing; failures toast. */
  async buy(product: IapProductDef, rect: Rect): Promise<boolean> {
    if (this.pending) return false;
    const store = getStore();
    if (!store.isAvailable()) {
      this.toast.show('Store unavailable on this platform', 'error', this.nowMs);
      return false;
    }
    this.pending = product.id;
    playSfx('button');
    const res = await store.purchase(product.id);
    this.pending = null;
    if (!res.ok) {
      if (res.error === 'unavailable') this.toast.show('Store unavailable right now', 'error', this.nowMs);
      else if (res.error === 'failed') this.toast.show('Purchase failed · nothing was charged', 'error', this.nowMs);
      return false; // cancelled: nothing to say
    }
    const granted = grantProduct(this.app.save, product.id, res.transactionId);
    if (!granted) {
      this.toast.show('Already owned', 'ok', this.nowMs);
      return false;
    }
    this.burst(granted.crystals > 0 ? 'crystal' : 'gold', rect);
    playSfx('upgrade');
    const parts = [
      granted.crystals > 0 ? `+${granted.crystals} crystals` : '',
      granted.gold > 0 ? `+${granted.gold} gold` : '',
      granted.noAds ? 'ads removed' : '',
      granted.skins.length ? `${granted.skins.length} skin${granted.skins.length > 1 ? 's' : ''}` : '',
    ].filter(Boolean);
    this.toast.show(`${product.title}: ${parts.join(' · ')}`, 'ok', this.nowMs);
    return true;
  }

  async restore(): Promise<string[]> {
    if (this.pending) return [];
    if (!getStore().isAvailable()) {
      this.toast.show('Store unavailable on this platform', 'error', this.nowMs);
      return [];
    }
    this.pending = 'restore';
    const granted = await restorePurchases(this.app.save);
    this.pending = null;
    this.toast.show(granted.length ? `Restored: ${granted.join(', ')}` : 'Nothing new to restore', 'ok', this.nowMs);
    return granted;
  }

  private tapSkin(skin: SkinDef, family: 'roof' | 'helmet', rect: Rect): void {
    const save = this.app.save;
    if (save.skins.owned.includes(skin.id)) {
      this.equipSkin(skin.id, family);
      return;
    }
    if (skin.costCrystals === 0) {
      this.toast.show(skin.source === 'starter' ? 'Comes with the Starter Pack' : 'Comes with the Premium bundle', 'ok', this.nowMs);
      return;
    }
    if (!spendCrystals(save, skin.costCrystals)) {
      this.toast.show('Not enough crystals', 'error', this.nowMs);
      return;
    }
    save.skins.owned.push(skin.id);
    save.skins.equipped[family] = skin.id;
    writeSave(save);
    this.burst('crystal', rect);
    playSfx('upgrade');
    this.toast.show(`${skin.label} unlocked and equipped`, 'ok', this.nowMs);
  }

  /** Equip an owned skin; tapping the equipped one reverts to the default look. */
  equipSkin(id: string, family: 'roof' | 'helmet'): void {
    const save = this.app.save;
    if (!save.skins.owned.includes(id)) return;
    save.skins.equipped[family] = save.skins.equipped[family] === id ? null : id;
    writeSave(save);
    playSfx('button');
  }

  private tapUpgrade(id: string, rect: Rect): void {
    const cost = upgradeCost(this.app.save, id);
    if (cost === null) return;
    if (!buyUpgrade(this.app.save, id)) {
      this.toast.show(`Need ${cost} gold · earn stars or watch ×2 gold after a win`, 'error', this.nowMs);
      return;
    }
    this.burst('gold', rect);
    playSfx('upgrade');
    const def = UPGRADE_DEFS.find((d) => d.id === id)!;
    this.toast.show(`${def.label} tier ${upgradeTier(this.app.save, id)}: ${upgradeEffectText(def, upgradeTier(this.app.save, id))}`, 'ok', this.nowMs);
  }
}
