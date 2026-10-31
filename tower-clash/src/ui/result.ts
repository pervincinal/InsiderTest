import type { GameState, LevelDef } from '../sim/types';
import { LEVEL_META, levelIndex } from '../levels/index';
import type { View } from '../render/view';
import { hudAnchors, toHudSpace } from '../render/view';
import { CONFIRM, HUD, RESULT } from '../render/layout';
import type { Rect } from '../render/widgets';
import { hitRect } from '../render/widgets';
import type { PointerPoint } from '../input/pointer';
import { drawGame } from '../render/draw';
import type { HudPlayUi, ResultExtras } from '../render/hud';
import { hudOverlaysLoaded, resultShareLayout } from '../render/hud';
import { playSfx } from '../audio/index';
import { canShowRewarded, maybeShowInterstitial, onResultShown, showRewarded } from '../economy/adsFlow';
import type { ResultEarnings } from '../economy/wallet';
import { buyLevelSkip, earnGold, skipAvailable, spendCrystals } from '../economy/wallet';
import { AD_PLACEMENTS, CRYSTAL_SERVICES } from '../economy/catalog';
import type { AchievementGrant } from '../economy/achievements';
import { evaluateAchievements } from '../economy/achievements';
import { levelLesson, loadEnglishMenus, t } from './i18n';
import type { DailyChallenge, WeeklyChallenge } from '../daily/challenge';
import type { DailyOutcome } from './daily';
import { restartLevel } from './daily';
import type { WeeklyOutcome } from './weekly';
import type { PreparedShare, ShareRecord } from './share';
import type { App, Screen } from './screens';
import { ACHIEVEMENT_TOAST_MS, Toast, achievementToastText, appVersion } from './screens';
import { loadChunk } from '../lazyChunk';
import { maybeAskForReview } from '../native/review';

/*
 * PERF-11: the result screen is a lazy chunk (src/ui/resultChunk.ts loads it). The play screen warms
 * it at level start and the title's idle preload fetches it too (offline first play), so it is
 * normally in long before the first outcome; when it is not, the play screen holds the undimmed last
 * frame (the AUD-F4 result beat) until it lands — never a blank. Nothing eager imports this file
 * (tests/repo/hygiene.test.ts).
 */

/* ---------- Result ---------- */

export interface ResultInfo {
  state: GameState;
  level: LevelDef;
  ui: HudPlayUi;
  earnings: ResultEarnings;
  /** This attempt already used the "Reinforcements" continue (offered once per attempt). */
  continued: boolean;
  /** Achievements this result unlocked (toasted on enter). */
  achievements: AchievementGrant;
  /**
   * Rewind the play screen ~20 s and resume with the reinforcements (`PlayScreen.resumeFromSnapshot`).
   * False = no usable snapshot; the result screen then restarts the level with the bonus garrison.
   */
  resume?: () => boolean;
  /** AUD-B2 / A11: the player retreated from the stalemate card — a defeat with no Continue offer (GDD §2.4). */
  retreated?: boolean;
  /** Daily Challenge match (GDD §7): NEXT returns to the map, RETRY keeps the seed and twist. */
  challenge?: DailyChallenge;
  /** What the challenge result did (reward paid once, streak, best of the day). */
  daily?: DailyOutcome;
  /** Weekly Challenge match (GDD §8): same buttons as a daily; `weeklyOutcome` is what the result did. */
  weekly?: WeeklyChallenge;
  weeklyOutcome?: WeeklyOutcome;
}

const DOUBLE_GOLD = AD_PLACEMENTS.find((p) => p.id === 'rv_double_gold')!;

/**
 * Consecutive defeats of one level in this app session (FE-4 defeat tip): the HOW TO PLAY link
 * appears from the second one. A win, or a result on another level, clears it. Never saved.
 */
let defeatStreak: { levelId: number; count: number } | null = null;

/** Book a result; returns the level's consecutive-defeat count after it (0 after a win). */
export function noteResult(levelId: number, won: boolean): number {
  if (won) {
    defeatStreak = null;
    return 0;
  }
  defeatStreak = defeatStreak?.levelId === levelId ? { levelId, count: defeatStreak.count + 1 } : { levelId, count: 1 };
  return defeatStreak.count;
}

export function resetDefeatStreakForTests(): void {
  defeatStreak = null;
}

/** Wallet notes are plain English data (`"10 levels cleared"`, `"Band 1 at 3★"`); render them in the UI language. */
export function translateNote(note: string): string {
  const levels = /^(\d+) levels cleared$/.exec(note);
  if (levels) return t('result.note.levels', { n: levels[1]! });
  const band = /^Band (\d+) at 3★$/.exec(note);
  if (band) return t('result.note.band', { n: band[1]! });
  return note;
}
const CONTINUE_AD = AD_PLACEMENTS.find((p) => p.id === 'rv_continue')!;

/* ---------- Share card (SHARE-1): the flow and the drawing are a lazy chunk (src/ui/share.ts) ---------- */

type ShareChunk = typeof import('./share');
let shareChunk: Promise<ShareChunk> | null = null;
let lastShare: ShareRecord | null = null;

/** Load the share chunk (idempotent; a failed download is forgotten so the next tap retries). */
function loadShareChunk(): Promise<ShareChunk> {
  // with the card's English strings (PERF-8, a chunk of their own)
  shareChunk ??= Promise.all([loadChunk('share', () => import('./share')), loadEnglishMenus()]).then(([m]) => m).catch((err: unknown) => {
    shareChunk = null;
    throw err;
  });
  return shareChunk;
}

/** What the last SHARE tap did (debug surface `lastShare`, e2e), or null. */
export function lastShareRecord(): ShareRecord | null {
  return lastShare;
}

/**
 * Shows the frozen final frame under the win/lose overlay (drawn by drawGame) with the economy
 * offers: ×2 gold (rewarded), Reinforcements (crystals or rewarded), level skip (crystals) and the
 * wallet. Leaving the screen is where the level-break interstitial may fire (ECONOMY.md §5.1).
 */
export class ResultScreen implements Screen {
  readonly name = 'result' as const;
  private pressed: Rect | null = null;
  private pending = false;
  private doubled = false;
  private leaving = false;
  private nowMs = 0;
  readonly toast = new Toast();
  /** A SHARE tap is being served (card drawing / share sheet open): further taps are ignored. */
  private sharing = false;
  /** The card for this result, drawn once (started on the SHARE press). */
  private sharePrep: Promise<PreparedShare | null> | null = null;
  /** Consecutive defeats of this level in the session, this one included (0 on a win). */
  private readonly defeatCount: number;
  /** AUD-U5: the crystal spend waiting on the confirm card (`CONFIRM`), or null. */
  private ask: 'continue' | 'skip' | null = null;

  constructor(
    private readonly app: App,
    readonly info: ResultInfo,
  ) {
    this.defeatCount = noteResult(info.level.id, info.ui.outcome === 'won');
  }

  enter(): void {
    onResultShown(this.app.ads);
    const d = this.info.daily;
    const w = this.info.weeklyOutcome;
    // the daily result line (hud.ts) carries the crystal total; the milestone itself is named by a toast
    // (the weekly's week-streak bonus (WK-1) and 3★ target bonus take the same slot, GDD §8.2) —
    // priority: achievement > daily milestone > week-streak milestone > 3★ target
    const text =
      achievementToastText(this.info.achievements) ??
      (d?.milestone
        ? t('daily.milestone', { day: d.streak, crystals: d.milestone })
        : w?.milestone
          ? t('weekly.resultMilestone', { n: w.streak, crystals: w.milestone })
          : w?.targetHit
            ? t('weekly.resultTarget', { crystals: w.crystals - w.milestone })
            : null);
    if (text) this.toast.show(text, 'ok', performance.now(), ACHIEVEMENT_TOAST_MS);
    if (this.shareOffered()) void loadShareChunk().catch(() => undefined); // warm: the tap's activation must not wait on the network
    void maybeAskForReview(this.info, this.app.save); // MM-9 rating prompt: off by default, never rejects
  }

  /** SHARE (SHARE-1) is on every result except Yesterday's map — a practice run has no reward and nothing to prove. */
  shareOffered(): boolean {
    return this.info.daily?.practice !== true;
  }

  private prepareShare(): Promise<PreparedShare | null> {
    if (!this.sharePrep) {
      const p = loadShareChunk().then((m) => m.prepareShare(this.info, this.app.palette(), appVersion()));
      this.sharePrep = p;
      p.catch(() => {
        if (this.sharePrep === p) this.sharePrep = null; // retried on the next tap
      });
    }
    return this.sharePrep;
  }

  /**
   * Draw the share card and hand it to the platform (native sheet → Web Share with the PNG → Web
   * Share text-only → PNG download); toast "Shared" / "Saved" / "Sharing not available".
   * Resolves the record (null when not offered or already running). Never rejects.
   */
  share(): Promise<ShareRecord | null> {
    if (!this.shareOffered() || this.sharing) return Promise.resolve(null);
    this.sharing = true;
    playSfx('button');
    return this.prepareShare()
      .then(async (prep) => {
        if (!prep) return null;
        const m = await loadShareChunk();
        const rec = await m.sendShare(prep);
        lastShare = rec;
        const text = m.shareToastText(rec.result);
        if (text) this.toast.show(text, rec.result === 'unavailable' ? 'error' : 'ok', this.nowMs);
        return rec;
      })
      .catch(() => {
        this.toast.show(t('share.unavailable'), 'error', this.nowMs);
        return null;
      })
      .finally(() => {
        this.sharing = false;
      });
  }

  private get won(): boolean {
    return this.info.ui.outcome === 'won';
  }

  /**
   * Level skip (ECONOMY.md §3.4, AUD-B3): after 3 straight defeats of an uncleared level, once per skip
   * slot — one per band, plus one of its own on each learning level (`skipAvailable`).
   */
  private skipOffered(): boolean {
    return !this.won && skipAvailable(this.app.save, this.info.level.id);
  }

  extras(): ResultExtras {
    const save = this.app.save;
    const e = this.info.earnings;
    const fixed = !!(this.info.challenge ?? this.info.weekly);
    const continueOffered = !this.won && !this.info.continued && !this.info.retreated && !fixed;
    const d = this.info.daily;
    const w = this.info.weeklyOutcome;
    return {
      daily: d ? { won: d.won, firstWin: d.firstWin, gold: d.gold, crystals: d.crystals, streak: d.streak, best: d.best, practice: d.practice } : undefined,
      weekly: w ? { firstWin: w.firstWin, gold: w.gold, streak: w.streak, best: w.best } : undefined,
      crystalsEarned: e.crystals,
      notes: e.notes.map(translateNote),
      replayCapped: e.replayCapped,
      doubleGold: this.won && e.gold > 0 && canShowRewarded(this.app.ads, save, DOUBLE_GOLD.id) ? e.gold : null,
      doubled: this.doubled,
      continueCrystals: continueOffered ? CRYSTAL_SERVICES.continue.costCrystals : null,
      continueAd: continueOffered && canShowRewarded(this.app.ads, save, CONTINUE_AD.id),
      skipCrystals: this.skipOffered() && !fixed ? CRYSTAL_SERVICES.levelSkip.costCrystals : null,
      pending: this.pending,
      tip: this.won ? null : levelLesson(this.info.level),
      howto: !this.won && this.defeatCount >= 2,
      share: this.shareOffered(),
      sharing: this.sharing,
      confirm: this.ask && { kind: this.ask, crystals: this.cost(this.ask), have: save.crystals },
    };
  }

  private cost(kind: 'continue' | 'skip'): number {
    return (kind === 'skip' ? CRYSTAL_SERVICES.levelSkip : CRYSTAL_SERVICES.continue).costCrystals;
  }

  /** AUD-U5: CONTINUE / SKIP LEVEL tapped — the confirm card, or the "not enough crystals" toast. */
  private askSpend(kind: 'continue' | 'skip'): void {
    const msg = this.app.save.crystals < this.cost(kind) ? 'result.notEnoughCrystals' : hudOverlaysLoaded() ? null : 'common.loadFailed';
    if (msg) this.toast.show(t(msg), 'error', this.nowMs);
    else {
      playSfx('button');
      this.ask = kind;
    }
  }

  /** The confirm card's YES (`yes`) or CANCEL. */
  answer(yes: boolean): void {
    const kind = this.ask;
    this.ask = null;
    if (yes && kind === 'skip') this.skipLevel();
    else if (yes && kind) this.continueWithCrystals();
  }

  draw(view: View, nowMs: number): void {
    this.nowMs = nowMs;
    const ui = this.info.ui;
    const hud = ui.hud;
    if (hud) {
      hud.result = this.extras();
      hud.wallet = { gold: this.app.save.gold, crystals: this.app.save.crystals };
      hud.pressed = this.pressed;
      hud.toast = this.toast.opts(nowMs);
    }
    drawGame(view.ctx, this.info.state, view, ui, nowMs);
  }

  private rects(): Rect[] {
    if (this.ask) return [CONFIRM.yes, CONFIRM.no];
    const ex = this.extras();
    const list: Rect[] = [RESULT.retry, RESULT.menu, HUD.wallet, HUD.menu];
    if (this.won && this.info.ui.hasNext) list.push(RESULT.next);
    if (ex.doubleGold !== null && !ex.doubled) list.push(RESULT.extra);
    if (ex.skipCrystals !== null) list.push(RESULT.extra);
    const both = ex.continueCrystals !== null && ex.continueAd;
    if (ex.continueCrystals !== null) list.push(both ? RESULT.continueCrystals : RESULT.continueSolo);
    if (ex.continueAd) list.push(both ? RESULT.continueAd : RESULT.continueSolo);
    if (ex.howto) list.push(RESULT.howto);
    const share = resultShareLayout(ex, this.won).share;
    if (share) list.push(share);
    return list;
  }

  /** `r` holds the point: the bottom band's rects (wallet, MENU) through `toHudSpace` — the band is anchored to the screen edge (BUG-34) — the card's as they are. */
  private hits(r: Rect, p: PointerPoint): boolean {
    const h = r === HUD.wallet || r === HUD.menu ? toHudSpace(hudAnchors(this.app.view), p.x, p.y) : p;
    return hitRect(this.app.view, r, h.x, h.y);
  }

  down(p: PointerPoint): void {
    this.pressed = this.rects().find((r) => this.hits(r, p)) ?? null;
    // draw the card while the finger is down, so the share sheet opens inside the tap's user activation
    if (this.pressed !== null && this.pressed === resultShareLayout(this.extras(), this.won).share && !this.sharing) void this.prepareShare().catch(() => undefined);
  }

  move(p: PointerPoint): void {
    if (this.pressed && !this.hits(this.pressed, p)) this.pressed = null;
  }

  cancel(): void {
    this.pressed = null;
  }

  /** Run the level-break interstitial policy, then navigate. Double taps are ignored. */
  private leave(go: () => void): void {
    if (this.leaving) return;
    this.leaving = true;
    void maybeShowInterstitial(this.app.ads, this.app.save, Date.now()).then(go, go);
  }

  private nextLevel(): void {
    const next = LEVEL_META[levelIndex(this.info.level.id) + 1];
    if (next && !this.info.challenge && !this.info.weekly) void this.app.startLevel(next.id);
    else this.app.goLevels();
  }

  /** Same level again; a challenge keeps its seed and twist (unless its UTC day / week has passed — `restartLevel`). */
  private retry(): void {
    restartLevel(this.app, this.info.level.id, this.info.challenge, this.info.weekly, this.info.daily?.practice);
  }

  up(p: PointerPoint): void {
    const hit = this.pressed;
    this.pressed = null;
    if (!hit || !this.hits(hit, p) || this.pending || this.leaving) return;
    const { ui } = this.info;
    if (this.ask) this.answer(hit === CONFIRM.yes);
    else if (hit === RESULT.retry) this.leave(() => this.retry());
    else if (hit === RESULT.menu || hit === HUD.menu) this.leave(() => this.app.goLevels());
    else if (hit === RESULT.next && ui.outcome === 'won' && ui.hasNext) this.leave(() => this.nextLevel());
    else if (hit === HUD.wallet) this.app.goShop('crystals', () => this.app.go(this));
    else if (hit === RESULT.share || hit === RESULT.shareInline) void this.share();
    else if (hit === RESULT.howto) {
      playSfx('button');
      this.app.openHowTo(this); // the card's CLOSE / BACK / ESC return to this result screen
    }
    else if (hit === RESULT.extra) {
      if (this.won) this.doubleGold();
      else this.askSpend('skip');
    } else if (hit === RESULT.continueCrystals || (hit === RESULT.continueSolo && !this.extras().continueAd)) this.askSpend('continue');
    else if (hit === RESULT.continueAd || hit === RESULT.continueSolo) this.continueWithAd();
  }

  /** Rewarded ×2 gold: pays the result's gold once more (ECONOMY.md §5.2). */
  doubleGold(): void {
    const ex = this.extras();
    if (ex.doubleGold === null || ex.doubled || this.pending) return;
    this.pending = true;
    void showRewarded(this.app.ads, this.app.save, DOUBLE_GOLD.id).then((ok) => {
      this.pending = false;
      if (!ok) {
        this.toast.show(t('result.noVideo'), 'error', this.nowMs);
        return;
      }
      const gained = ex.doubleGold ?? 0;
      earnGold(this.app.save, gained);
      this.doubled = true;
      this.info.ui.coinsEarned += gained;
      this.info.ui.coinsTotal = this.app.save.gold;
      this.info.ui.particles?.coinBurst(360, RESULT.extra.y, 14, this.app.palette());
      playSfx('upgrade');
      this.toast.show(t('amount.gold', { n: gained }), 'ok', this.nowMs);
    });
  }

  /** Paid continue: rewind and resume; if the snapshot ring cannot serve one, restart with the bonus garrison. */
  private reinforce(): void {
    if (this.info.resume?.()) return;
    playSfx('upgrade');
    void this.app.startLevel(this.info.level.id, undefined, { reinforcements: true });
  }

  continueWithCrystals(): void {
    if (this.won || this.info.continued || this.info.retreated || this.pending) return;
    if (!spendCrystals(this.app.save, CRYSTAL_SERVICES.continue.costCrystals)) {
      this.toast.show(t('result.notEnoughCrystals'), 'error', this.nowMs);
      return;
    }
    this.reinforce();
  }

  continueWithAd(): void {
    if (this.won || this.info.continued || this.info.retreated || this.pending) return;
    if (!canShowRewarded(this.app.ads, this.app.save, CONTINUE_AD.id)) return;
    this.pending = true;
    void showRewarded(this.app.ads, this.app.save, CONTINUE_AD.id).then((ok) => {
      this.pending = false;
      if (ok) this.reinforce();
      else this.toast.show(t('result.noVideo'), 'error', this.nowMs);
    });
  }

  /** Level skip: 1★, next level unlocked, no gold, counts toward milestones; once per skip slot (`buyLevelSkip`). */
  skipLevel(): void {
    if (!this.skipOffered() || this.pending) return;
    const save = this.app.save;
    if (!buyLevelSkip(save, this.info.level.id)) {
      this.toast.show(t('result.notEnoughCrystals'), 'error', this.nowMs);
      return;
    }
    evaluateAchievements(save); // a skip changes the star table (never to 3★, but the rule is "after each result")
    playSfx('upgrade');
    this.leave(() => this.nextLevel());
  }

  key(e: KeyboardEvent): void {
    if (this.pending || this.leaving) return;
    if (this.ask) {
      if (e.key === 'Escape' || e.key === 'Enter') this.answer(e.key === 'Enter');
    } else if (e.key === 'Escape') this.leave(() => this.app.goLevels());
    else if (e.key === 'Enter') {
      const { ui } = this.info;
      if (ui.outcome === 'won' && ui.hasNext) this.leave(() => this.nextLevel());
      else this.leave(() => this.retry());
    }
  }
}
