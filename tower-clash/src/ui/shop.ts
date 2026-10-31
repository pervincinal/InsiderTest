/**
 * Shop screen (ECONOMY.md §4, Phase A): Crystals (IAP packs) · Bundles (starter / remove ads /
 * premium) · Skins (crystals, equip) · Upgrades (commander tracks, gold). Purchases go through
 * `getStore()` and are granted only on `{ ok: true }`, once per transaction id (wallet.grantProduct).
 * Without an available store the Crystals and Bundles tabs are hidden (PUB-14, `shopTabsFor`) and
 * pack-only skins the player does not own are not listed (FE-6, `skinListed`).
 * Input produces wallet / save mutations only; the sim is never touched here.
 */
import type { View } from '../render/view';
import { hudAnchors } from '../render/view';
import type { Rect } from '../render/widgets';
import { hitRect } from '../render/widgets';
import { segmentAt } from '../render/menuWidgets';
import { dragThreshold } from '../input/pointer';
import type { ShopTab } from '../render/menuLayout';
import { SHOP, SHOP_BANDS, bandToScreen, bandedContentBottom, screenToBand, shopBuyRect, shopConvertSegRect, shopPackRect, shopRowRect, shopSkinRect, shopTabsFor } from '../render/menuLayout';
import type { ShopBundleCard, ShopConvertCard, ShopCrateCard, ShopPackCard, ShopSkinCard, ShopUpgradeCard } from '../render/menusShop';
import { drawShop } from '../render/menusShop';
import { ParticleSystem } from '../render/particles';
import type { PointerPoint } from '../input/pointer';
import type { IapProductDef, SkinDef } from '../economy/catalog';
import { getStore } from '../economy/store';
import { spendCrystals } from '../economy/wallet';
import { CONVERSION_PACKS, buyBoosterCrate, conversionGold, convertCrystals, grantProduct, restorePurchases } from '../economy/purchases';
import { CONVERSION, CRYSTAL_SERVICES } from '../economy/catalog';
import { ownsProduct, shopSkins, skinFamily, spriteSkinId, visibleProducts } from '../economy/entitlements';
import { UPGRADE_DEFS, upgradeTier } from './upgrades';
import { UPGRADE_GLYPH, buyUpgrade, upgradeCost, upgradeEffectText } from './shopUpgrades';
import type { SkinFamily } from './save';
import { writeSave } from './save';
import type { App, Screen } from './screens';
import { Toast } from './screens';
import { playSfx } from '../audio/index';
import { t } from './i18n';
import { skinName, skinShortName, upgradeName } from './catalogTextShop';

interface Hit {
  rect: Rect;
  /** `p` is the pointer in content space (scroll already applied). */
  action: (p: PointerPoint) => void;
}

/**
 * A crystal spend waiting on the confirm card: a conversion (`gold` it buys) or — AUD-U5 — a skin or
 * the booster crate (`line`: what the crystals buy). `run` pays and grants once YES is tapped.
 */
interface SpendAsk {
  crystals: number;
  gold?: number;
  line?: string;
  run: () => boolean;
}

interface Layout {
  packs: ShopPackCard[];
  convert: ShopConvertCard | null;
  crate: ShopCrateCard | null;
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
  if (g.crystals) lines.push(t('shop.line.crystals', { n: g.crystals }));
  if (g.gold) lines.push(t('shop.line.gold', { n: g.gold }));
  if (g.removeAds) lines.push(t('shop.line.noAds'));
  if (g.skins?.length) lines.push(g.skins.length === 1 ? t('shop.line.bronze') : t('shop.line.royal'));
  if (g.boosterDiscount) lines.push(t('shop.line.discount', { n: Math.round(g.boosterDiscount * 100) }));
  return lines;
}

/**
 * Whether a skin card is listed on the Skins tab (FE-6). Without an available store a skin that
 * only comes with a pack (`source: 'starter' | 'premium'`) is left out — no "PACK ONLY" card that
 * points at a product the player cannot buy — unless it is owned (a restored owner still equips it).
 */
export function skinListed(skin: Pick<SkinDef, 'id' | 'source'>, owned: readonly string[], storeAvailable: boolean): boolean {
  return storeAvailable || skin.source === 'shop' || owned.includes(skin.id);
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
  /** Selected conversion pack (index into CONVERSION_PACKS) and the pending confirmation. */
  private convertIdx = 0;
  private confirmConvert: SpendAsk | null = null;
  private nowMs = 0;
  readonly toast = new Toast();
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

  /**
   * Tabs in the segmented row right now (PUB-14): Crystals and Bundles only while the store is
   * available. Re-read on every frame / tap — a native store finishes `init()` asynchronously.
   */
  get tabs(): readonly ShopTab[] {
    return shopTabsFor(getStore().isAvailable());
  }

  /** The active tab, moved to the first visible one when its tab is hidden (store unavailable). */
  private activeTab(): ShopTab {
    const tabs = this.tabs;
    if (!tabs.includes(this.tab) && tabs[0]) {
      this.tab = tabs[0];
      this.scroll = 0;
      this.pressed = null;
      this.confirmConvert = null;
    }
    return this.tab;
  }

  enter(): void {
    // PERF-11: the boot initialises the store at idle; a shop opened before that does it here (idempotent —
    // the web fake is available at once, a native store as its init lands: `tabs` is re-read every frame)
    void getStore().init();
    this.activeTab();
    this.relayout(); // FE-10: hit regions before the first painted frame
    const ids = visibleProducts(this.app.save).map((p) => p.id);
    void getStore()
      .getProducts(ids)
      .then((list) => {
        for (const p of list) this.prices.set(p.id, p.priceString);
      })
      .catch(() => undefined);
  }

  get currentTab(): ShopTab {
    return this.activeTab();
  }

  /** Switch tabs; a hidden tab (store unavailable) is ignored. */
  setTab(tab: ShopTab): void {
    if (!this.tabs.includes(tab)) return;
    this.tab = tab;
    this.scroll = 0;
    this.pressed = null;
    this.confirmConvert = null;
    this.relayout(); // FE-10: a tap right after the switch hits the new tab's cards, painted or not
  }

  /** Conversion awaiting confirmation, if any (e2e). */
  get pendingConversion(): { crystals: number; gold: number } | null {
    const q = this.confirmConvert;
    return q?.gold !== undefined ? { crystals: q.crystals, gold: q.gold } : null;
  }

  /** Any crystal spend awaiting the confirm card (AUD-U5): its price and what it buys (tests). */
  get pendingSpend(): { crystals: number; gold?: number; line?: string } | null {
    const q = this.confirmConvert;
    return q && { crystals: q.crystals, gold: q.gold, line: q.line };
  }

  private priceOf(p: IapProductDef): string {
    return this.prices.get(p.id) ?? `$${p.priceUsd.toFixed(2)}`;
  }

  /** Cards + hit regions of the active tab, in content space (scroll is applied at draw / hit time). */
  private layout(): Layout {
    const save = this.app.save;
    this.activeTab();
    const out: Layout = { packs: [], convert: null, crate: null, bundles: [], skinHeaders: [], skins: [], upgrades: [], restoreRect: null, hits: [], contentHeight: 0 };
    let bottom: number = SHOP.contentTop;
    if (this.tab === 'crystals') {
      const packs = visibleProducts(save).filter((p) => p.bonusPct !== undefined);
      packs.forEach((p, i) => {
        const rect = shopPackRect(i);
        out.packs.push({ id: p.id, rect, crystals: p.grants.crystals ?? 0, bonusPct: p.bonusPct ?? 0, price: this.priceOf(p), count: Math.min(5, i + 1) });
        out.hits.push({ rect, action: () => void this.buy(p, rect) });
        bottom = Math.max(bottom, rect.y + rect.h);
      });
      // crystals → gold converter takes the next grid slot (ECONOMY.md §2)
      const rect = shopPackRect(packs.length);
      const segRect = shopConvertSegRect(rect);
      const buyRect = shopBuyRect(rect, rect.w - 48);
      const crystals = CONVERSION_PACKS[this.convertIdx] ?? CONVERSION_PACKS[0] ?? 0;
      out.convert = {
        rect,
        packs: CONVERSION_PACKS,
        selected: this.convertIdx,
        segRect,
        buyRect,
        crystals,
        gold: conversionGold(crystals),
        goldPerCrystal: CONVERSION.goldPerCrystal,
        affordable: save.crystals >= crystals,
      };
      // the segment by x: the tap area reaches above / below the drawn control (AUD-U1)
      out.hits.push({ rect: segRect, action: (p) => this.pickConversion(segmentAt(segRect, CONVERSION_PACKS.length, p.x, segRect.y + 1)) });
      out.hits.push({ rect: buyRect, action: () => this.askConversion() });
      bottom = Math.max(bottom, rect.y + rect.h);
    } else if (this.tab === 'bundles') {
      // booster crate first (crystals, ECONOMY.md §3.1), then the store bundles
      const crate = CRYSTAL_SERVICES.boosterCrate;
      const crateRect = shopRowRect(0);
      out.crate = { rect: crateRect, cost: crate.costCrystals, charges: { ...crate.charges }, owned: { ...save.charges }, affordable: save.crystals >= crate.costCrystals };
      out.hits.push({ rect: crateRect, action: () => this.tapCrate(crateRect) });
      bottom = Math.max(bottom, crateRect.y + crateRect.h);
      const bundles = visibleProducts(save).filter((p) => p.bonusPct === undefined);
      bundles.forEach((p, idx) => {
        const i = idx + 1;
        const rect = shopRowRect(i);
        const owned = ownsProduct(save, p.id);
        out.bundles.push({ id: p.id, rect, title: p.title, lines: bundleLines(p), price: this.priceOf(p), owned, glyph: BUNDLE_GLYPH[p.id] ?? 'chest' });
        if (!owned) out.hits.push({ rect, action: () => void this.buy(p, rect) });
        bottom = Math.max(bottom, rect.y + rect.h);
      });
    } else if (this.tab === 'skins') {
      let top = SHOP.row.y0 - 6;
      const storeOn = getStore().isAvailable();
      for (const [category, key] of [
        ['towerRoof', 'shop.roofs'],
        ['unitHelmet', 'shop.helmets'],
        ['terrainTheme', 'shop.themes'],
        ['towerShape', 'shop.towers'],
        ['unitShape', 'shop.units'],
      ] as const) {
        const list = shopSkins().filter((s) => s.category === category && skinListed(s, save.skins.owned, storeOn));
        out.skinHeaders.push({ label: t(key), y: top });
        list.forEach((s, i) => {
          const rect = shopSkinRect(top, i);
          const owned = save.skins.owned.includes(s.id);
          const family = skinFamily(s);
          const equipped = owned && save.skins.equipped[family] === s.id;
          out.skins.push({ id: s.id, rect, label: skinShortName(s), spriteId: spriteSkinId(s.id), cost: s.costCrystals, owned, equipped, locked: !owned && s.costCrystals === 0 });
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
          label: upgradeName(d),
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

  /**
   * Rebuild the active tab's hit regions and content height from the current save (FE-10). `draw()`
   * does it every frame; `enter()`, `setTab()` and every content hit test do it too, so a tap that
   * lands before the shop's first painted frame (or after a purchase changed the cards) is not dropped.
   */
  private relayout(): Layout {
    const lay = this.layout();
    this.hits = lay.hits;
    this.contentHeight = lay.contentHeight;
    return lay;
  }

  /** Layout bottom of the cards' viewport: `SHOP.contentBottom`, plus the room a tall screen adds (FE-11). */
  private contentBottom(): number {
    return bandedContentBottom(SHOP.contentBottom, hudAnchors(this.app.view));
  }

  private maxScroll(): number {
    return Math.max(0, this.contentHeight - this.contentBottom());
  }

  /**
   * FE-11: screen logical point → layout point. The header, the tabs and the cards follow the header
   * up to the top safe edge of a tall screen; the confirm card is centred on the screen (identity).
   */
  toLayout(x: number, y: number): { x: number; y: number } {
    return this.confirmConvert ? { x, y } : screenToBand(hudAnchors(this.app.view), SHOP_BANDS, x, y);
  }

  /** Where layout point (x, y) is drawn (e2e: `layoutToClient`). */
  fromLayout(x: number, y: number): { x: number; y: number } {
    return this.confirmConvert ? { x, y } : bandToScreen(hudAnchors(this.app.view), SHOP_BANDS, x, y);
  }

  setScroll(y: number): void {
    this.scroll = Math.max(0, Math.min(this.maxScroll(), y));
  }

  /** Current content scroll in logical px (debug / e2e). */
  get scrollY(): number {
    return this.scroll;
  }

  draw(view: View, nowMs: number): void {
    this.nowMs = nowMs;
    const lay = this.relayout();
    this.setScroll(this.scroll);
    drawShop(view, this.app.palette(), {
      tab: this.tab,
      tabs: this.tabs,
      tabsRect: SHOP.tabs,
      backRect: SHOP.back,
      walletRect: SHOP.wallet,
      scroll: this.scroll,
      gold: this.app.save.gold,
      crystals: this.app.save.crystals,
      packs: lay.packs,
      convert: lay.convert,
      crate: lay.crate,
      bundles: lay.bundles,
      confirmConvert: this.confirmConvert,
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

  /** The card / button under layout point `l` (scroll applied here); the regions are rebuilt first (FE-10). */
  private contentHit(l: { x: number; y: number }): Hit | null {
    if (l.y < SHOP.contentTop || l.y > this.contentBottom()) return null;
    this.relayout();
    const y = l.y + this.scroll;
    return this.hits.find((h) => hitRect(this.app.view, h.rect, l.x, y)) ?? null;
  }

  /** `r` holds layout point `l` (its AUD-U1 tap area). */
  private on(r: Rect, l: { x: number; y: number }): boolean {
    return hitRect(this.app.view, r, l.x, l.y);
  }

  down(p: PointerPoint): void {
    if (this.confirmConvert) {
      const c = SHOP.convertConfirm;
      this.pressed = [c.yes, c.no].find((r) => this.on(r, p)) ?? null;
      return;
    }
    this.held = true;
    this.downY = p.y;
    this.scrollAtDown = this.scroll;
    this.dragging = false;
    const l = this.toLayout(p.x, p.y);
    if (this.on(SHOP.back, l)) this.pressed = SHOP.back;
    else this.pressed = this.contentHit(l)?.rect ?? null;
  }

  move(p: PointerPoint): void {
    if (this.confirmConvert) {
      if (this.pressed && !this.on(this.pressed, p)) this.pressed = null;
      return;
    }
    if (!this.held) return;
    if (Math.abs(p.y - this.downY) > dragThreshold(this.app.view.scale)) {
      this.dragging = true;
      this.pressed = null;
    }
    if (this.dragging) this.setScroll(this.scrollAtDown - (p.y - this.downY));
  }

  up(p: PointerPoint): void {
    const hit = this.pressed;
    this.pressed = null;
    if (this.confirmConvert) {
      const c = SHOP.convertConfirm;
      if (hit === c.yes && this.on(c.yes, p)) this.confirmConversion();
      else if (hit === c.no && this.on(c.no, p)) this.cancelConversion();
      return;
    }
    const wasDrag = this.dragging;
    this.held = false;
    this.dragging = false;
    if (wasDrag) return;
    const l = this.toLayout(p.x, p.y);
    if (this.on(SHOP.back, l)) {
      this.back();
      return;
    }
    if (this.on(SHOP.wallet, l)) {
      this.setTab('crystals');
      return;
    }
    if (this.on(SHOP.tabs, l)) {
      const tabs = this.tabs;
      const tab = tabs[segmentAt(SHOP.tabs, tabs.length, l.x, SHOP.tabs.y + 1)];
      if (tab && tab !== this.activeTab()) {
        playSfx('button');
        this.setTab(tab);
      }
      return;
    }
    const target = this.contentHit(l);
    if (target && hit && this.on(hit, { x: l.x, y: l.y + this.scroll })) target.action({ ...p, x: l.x, y: l.y + this.scroll });
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
    if (this.confirmConvert) {
      if (e.key === 'Escape') this.cancelConversion();
      else if (e.key === 'Enter') this.confirmConversion();
      return;
    }
    if (e.key === 'Escape') this.back();
    else if (e.key === 'ArrowDown') this.setScroll(this.scroll + 120);
    else if (e.key === 'ArrowUp') this.setScroll(this.scroll - 120);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const tabs = this.tabs;
      const i = tabs.indexOf(this.activeTab()) + (e.key === 'ArrowRight' ? 1 : -1);
      const tab = tabs[(i + tabs.length) % tabs.length];
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
      this.toast.show(t('shop.toast.storeUnavailablePlatform'), 'error', this.nowMs);
      return false;
    }
    this.pending = product.id;
    playSfx('button');
    const res = await store.purchase(product.id);
    this.pending = null;
    if (!res.ok) {
      if (res.error === 'unavailable') this.toast.show(t('shop.toast.storeUnavailableNow'), 'error', this.nowMs);
      else if (res.error === 'failed') this.toast.show(t('shop.toast.purchaseFailed'), 'error', this.nowMs);
      return false; // cancelled: nothing to say
    }
    const granted = grantProduct(this.app.save, product.id, res.transactionId);
    if (!granted) {
      this.toast.show(t('shop.toast.alreadyOwned'), 'ok', this.nowMs);
      return false;
    }
    this.burst(granted.crystals > 0 ? 'crystal' : 'gold', rect);
    playSfx('upgrade');
    const parts = [
      granted.crystals > 0 ? t('amount.crystals', { n: granted.crystals }) : '',
      granted.gold > 0 ? t('amount.gold', { n: granted.gold }) : '',
      granted.noAds ? t('shop.toast.adsRemoved') : '',
      granted.skins.length ? (granted.skins.length > 1 ? t('shop.toast.skins', { n: granted.skins.length }) : t('shop.toast.skin')) : '',
    ].filter(Boolean);
    this.toast.show(`${product.title}: ${parts.join(' · ')}`, 'ok', this.nowMs);
    return true;
  }

  async restore(): Promise<string[]> {
    if (this.pending) return [];
    if (!getStore().isAvailable()) {
      this.toast.show(t('shop.toast.storeUnavailablePlatform'), 'error', this.nowMs);
      return [];
    }
    this.pending = 'restore';
    const granted = await restorePurchases(this.app.save);
    this.pending = null;
    this.toast.show(granted.length ? t('shop.toast.restored', { list: granted.join(', ') }) : t('shop.toast.nothingToRestore'), 'ok', this.nowMs);
    return granted;
  }

  /* ----- crystals → gold (ECONOMY.md §2) ----- */

  pickConversion(index: number): void {
    if (index < 0 || index >= CONVERSION_PACKS.length || index === this.convertIdx) return;
    this.convertIdx = index;
    playSfx('button');
  }

  /** CONVERT tapped: open the confirm card (unaffordable packs just toast). */
  askConversion(): void {
    const crystals = CONVERSION_PACKS[this.convertIdx];
    if (crystals === undefined) return;
    if (this.app.save.crystals < crystals) {
      this.toast.show(t('shop.toast.needCrystals', { n: crystals }), 'error', this.nowMs);
      return;
    }
    playSfx('button');
    this.confirmConvert = { crystals, gold: conversionGold(crystals), run: () => this.convert(crystals) };
  }

  /** CANCEL on the confirm card: nothing is spent. */
  cancelConversion(): void {
    this.confirmConvert = null;
    playSfx('button');
  }

  /** YES on the confirm card (CONVERT / SPEND): pay and grant what it asked about. */
  confirmConversion(): boolean {
    const q = this.confirmConvert;
    this.confirmConvert = null;
    return q ? q.run() : false;
  }

  /** Spend the crystals, add the gold, burst coins on the card. */
  private convert(crystals: number): boolean {
    const gold = convertCrystals(this.app.save, crystals);
    if (gold === null) {
      this.toast.show(t('shop.toast.notEnoughCrystals'), 'error', this.nowMs);
      return false;
    }
    const card = this.layout().convert?.rect;
    if (card) this.burst('gold', card);
    playSfx('upgrade');
    this.toast.show(t('shop.toast.converted', { crystals, gold }), 'ok', this.nowMs);
    return true;
  }

  /* ----- booster crate (ECONOMY.md §3.1) ----- */

  /** Crate tapped: the confirm card (AUD-U5), or the "need N crystals" toast when unaffordable. */
  private tapCrate(rect: Rect): void {
    const crate = CRYSTAL_SERVICES.boosterCrate;
    if (this.app.save.crystals < crate.costCrystals) {
      this.toast.show(t('shop.toast.needCrate', { n: crate.costCrystals }), 'error', this.nowMs);
      return;
    }
    playSfx('button');
    const c = crate.charges;
    this.confirmConvert = { crystals: crate.costCrystals, line: t('shop.toast.crateAdded', { o: c.overdrive, f: c.freeze, a: c.airstrike }), run: () => this.buyCrate(rect) };
  }

  private buyCrate(rect: Rect): boolean {
    const added = buyBoosterCrate(this.app.save);
    if (!added) {
      this.toast.show(t('shop.toast.needCrate', { n: CRYSTAL_SERVICES.boosterCrate.costCrystals }), 'error', this.nowMs);
      return false;
    }
    this.burst('crystal', rect);
    playSfx('upgrade');
    this.toast.show(t('shop.toast.crateAdded', { o: added.overdrive, f: added.freeze, a: added.airstrike }), 'ok', this.nowMs);
    return true;
  }

  private tapSkin(skin: SkinDef, family: SkinFamily, rect: Rect): void {
    const save = this.app.save;
    if (save.skins.owned.includes(skin.id)) {
      this.equipSkin(skin.id, family);
      return;
    }
    if (skin.costCrystals === 0) {
      this.toast.show(skin.source === 'starter' ? t('shop.toast.starterOnly') : t('shop.toast.premiumOnly'), 'ok', this.nowMs);
      return;
    }
    if (save.crystals < skin.costCrystals) {
      this.toast.show(t('shop.toast.notEnoughCrystals'), 'error', this.nowMs);
      return;
    }
    // AUD-U5: crystals are bought with money — the confirm card first
    playSfx('button');
    this.confirmConvert = { crystals: skin.costCrystals, line: skinName(skin), run: () => this.buySkin(skin, family, rect) };
  }

  private buySkin(skin: SkinDef, family: SkinFamily, rect: Rect): boolean {
    const save = this.app.save;
    if (!spendCrystals(save, skin.costCrystals)) {
      this.toast.show(t('shop.toast.notEnoughCrystals'), 'error', this.nowMs);
      return false;
    }
    save.skins.owned.push(skin.id);
    save.skins.equipped[family] = skin.id;
    writeSave(save);
    this.burst('crystal', rect);
    playSfx('upgrade');
    this.toast.show(t('shop.toast.skinUnlocked', { name: skinName(skin) }), 'ok', this.nowMs);
    return true;
  }

  /** Equip an owned skin; tapping the equipped one reverts to the default look. */
  equipSkin(id: string, family: SkinFamily): void {
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
      this.toast.show(t('shop.toast.needGold', { n: cost }), 'error', this.nowMs);
      return;
    }
    this.burst('gold', rect);
    playSfx('upgrade');
    const def = UPGRADE_DEFS.find((d) => d.id === id)!;
    const tier = upgradeTier(this.app.save, id);
    this.toast.show(t('shop.toast.upgraded', { name: upgradeName(def), tier, effect: upgradeEffectText(def, tier) }), 'ok', this.nowMs);
  }
}
