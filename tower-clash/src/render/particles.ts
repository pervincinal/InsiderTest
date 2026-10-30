import type { GameState, Mine, Owner, SimEvent, Tower } from '../sim/types';
import { C } from '../sim/constants';
import type { Palette, Tones } from './palette';
import { DEFAULT_PALETTE, shade } from './palette';
import { towerTop } from './sprites';
import type { Camera } from './camera';
import { playCamera, proj, projAngle, unproj } from './camera';
import type { PlacedChip } from './worldChips';
import { artilleryMuzzle } from './sprites';
import { reducedMotionOverride } from '../ui/motion';
import { chunkBackoff, loadChunk } from '../lazyChunk';

/*
 * Purely visual particles and per-tower motion state driven by sim events (ART_DIRECTION §5).
 * The play screen feeds `onEvents` from the game loop; `draw` steps and paints. Under
 * prefers-reduced-motion nothing is spawned and every tween reads as "finished" (the sim's own
 * colour changes — flag / roof flips — still show).
 */

export function prefersReducedMotion(): boolean {
  const override = reducedMotionOverride();
  if (override !== null) return override;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Map point → where it is drawn and its depth scale (the play camera, ART-21 camera.ts `proj`). */
export type ParticleProjection = (x: number, y: number) => { x: number; y: number; s: number };

export type Kind = 'confetti' | 'ring' | 'impact' | 'puff' | 'dust' | 'step' | 'spark' | 'flash' | 'tracer' | 'plank' | 'glint' | 'coin' | 'gem' | 'chip' | 'flashRing';

export interface Particle {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
  /** Second tone (coin edge / gem shade); equals `color` for the other kinds. */
  color2: string;
  rot: number;
  vrot: number;
  gravity: number;
  x2: number;
  y2: number;
}

const MAX_PARTICLES = 700;
const CAPTURE_MS = 520;
/** Capture shake: peak amplitude (px, world only) and length; decays quadratically over ~3 cycles. */
const SHAKE_PX = 6;
const SHAKE_MS = 320;
const SHAKE_CYCLES = 3;
/** Marching columns on sand: at most one wake puff per column per this many ms… */
const DUST_INTERVAL_MS = 200;
/** …and on every biome (ART-20) at most one footstep puff per column per this many ms (≈ 11 a second, ≈ 4 alive per column). */
const STEP_INTERVAL_MS = 90;
/** Under fire (rules v2.1): badge jolt per hostile landing (px, length) and the impact-ring rate cap per tower. */
const HIT_PX = 3;
const HIT_MS = 180;
const IMPACT_INTERVAL_MS = 90;
/**
 * ART-23 combat juice budgets. A friendly landing (reinforcement) bursts at most once per tower per
 * FRIENDLY_LAND_MS; every landing burst (hostile or friendly) also takes a token from one shared
 * bucket (LAND_TOKENS_MAX, refilled at LAND_TOKENS_PER_S), so a 400-unit late game spawns at most
 * ≈ 40 small bursts a second (≈ 250 short-lived particles alive) however many towers are hit.
 */
export const FRIENDLY_LAND_MS = 160;
export const LAND_TOKENS_MAX = 8;
export const LAND_TOKENS_PER_S = 40;
/** Capture: the badge's halo flash length (the stream-start pulse is draw.ts `STREAM_PULSE_MS`). */
export const CAPTURE_FLASH_MS = 320;
/** Capture chips (clay confetti in the new owner's tones) and upgrade fountain sparkles per event. */
export const CAPTURE_CHIPS = 12;
export const UPGRADE_SPARKLES = 14;

/**
 * Who is shooting at each tower: the owner of a hostile link into it, else the owner of a hostile
 * unit still on the road towards it (the last units of a broken stream). Pure read of the state,
 * one pass over links and units; towers not under attack are absent from the map.
 */
export function hostileAttackers(state: Pick<GameState, 'towers' | 'links' | 'units'>): Map<string, Owner> {
  const out = new Map<string, Owner>();
  for (const l of state.links) {
    const t = state.towers[l.to];
    if (t && l.owner !== t.owner && !out.has(l.to)) out.set(l.to, l.owner);
  }
  for (const u of state.units) {
    if (out.has(u.to)) continue;
    const t = state.towers[u.to];
    if (t && u.owner !== t.owner) out.set(u.to, u.owner);
  }
  return out;
}

/** Cheap hash → 0..1, so bursts look random without touching the sim RNG. */
function hash(n: number): number {
  let t = (n + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Ease-out with overshoot, t in 0..1. */
function backOut(t: number): number {
  const c1 = 1.70158;
  const u = Math.max(0, Math.min(1, t)) - 1;
  return 1 + (c1 + 1) * u * u * u + c1 * u * u;
}

/** Spawner surface of `ParticleSystem` that the lazy bursts (src/render/particlesEconomy.ts) use. */
export interface BurstHost {
  readonly reducedMotion: boolean;
  /** The world shake's start (wall clock) and peak px (`shake`). */
  shakeAt: number;
  shakeAmp: number;
  /** AUD-F2 reduced motion: wall clock of the last blast per mine (index into `state.mines`). */
  readonly marks: Map<number, number>;
  rnd(): number;
  make(kind: Kind, x: number, y: number, color: string, life: number, size: number): Particle;
  push(p: Particle): void;
  takeLandToken(nowMs: number): boolean;
  kick(x: number, y: number, colors: readonly string[], size: number, k: number): void;
  death(x: number, y: number, light?: string, dark?: string): void;
}

/**
 * Purchase / reward bursts (`coin`, `gem`) and the AUD-F2 mine blast live in src/render/particlesEconomy.ts,
 * a lazy chunk: the first frame a system draws warms it, `coinBurst` / `crystalBurst` spawn through it
 * (on landing, in the rare case it is not in yet), `draw` paints those two kinds through it, and a mine
 * kill bursts / marks through it (a grey death puff until it is in).
 */
export interface EconomyBursts {
  coin(host: BurstHost, x: number, y: number, n: number, pal: Palette): void;
  crystal(host: BurstHost, x: number, y: number, n: number, pal: Palette): void;
  /** Paint one `coin` / `gem` particle (`t` = age fraction, `fade` = 1 − t). */
  draw(ctx: CanvasRenderingContext2D, p: Particle, t: number, fade: number): void;
  /** AUD-F2: a unit (`own`: the player's) killed by a mine at (x, y) — the blast at the nearest mine of `state` (false: no mine, nothing done). */
  mine(host: BurstHost, state: GameState, x: number, y: number, own: boolean, pal: Palette, nowMs: number): boolean;
  /** AUD-F2 reduced motion: outline the chips of the mines in `host.marks` (`ParticleSystem.drawMineMarks`). */
  marks(host: BurstHost, ctx: CanvasRenderingContext2D, pal: Palette, mines: readonly Mine[], chips: readonly PlacedChip[], nowMs: number, cam: Camera): void;
}

const ECONOMY_CHUNK = 'particlesEconomy';
let economy: EconomyBursts | null = null;
let economyPromise: Promise<EconomyBursts> | null = null;

/** Load the economy bursts (idempotent; a failed download is forgotten so the next call retries). */
export function loadEconomyBursts(): Promise<EconomyBursts> {
  economyPromise ??= loadChunk(ECONOMY_CHUNK, () => import('./particlesEconomy'))
    .then((m) => (economy = m.ECONOMY_BURSTS))
    .catch((err: unknown) => {
      economyPromise = null;
      throw err;
    });
  return economyPromise;
}

/** Start the download unless one failed a moment ago (draw-time back-off). */
function warmEconomyBursts(): void {
  if (!economy && !chunkBackoff(ECONOMY_CHUNK)) void loadEconomyBursts().catch(() => undefined);
}

export class ParticleSystem implements BurstHost {
  private readonly ps: Particle[] = [];
  private readonly pulses = new Map<string, number>();
  private readonly captures = new Map<string, { at: number; from: Owner }>();
  private readonly aims = new Map<string, number>();
  private readonly dustAt = new Map<string, number>();
  private readonly stepAt = new Map<string, number>();
  /** Per tower: last seen `underFireUntilMs`, wall-clock of the last hostile landing and of the last impact ring. */
  private readonly fire = new Map<string, { until: number; hitAt: number; ringAt: number }>();
  /** ART-23: last friendly landing burst per tower; the shared landing-burst bucket (`takeLandToken`). */
  private readonly friendAt = new Map<string, number>();
  readonly marks = new Map<number, number>();
  private landAt = -Infinity;
  shakeAt = -Infinity;
  shakeAmp = SHAKE_PX;
  private lastMs = 0;
  private salt = 1;
  private warmed = false;

  constructor(readonly reducedMotion: boolean = prefersReducedMotion()) {}

  get count(): number {
    return this.ps.length;
  }

  /** Deterministic per-system noise (spawner surface, see `BurstHost`). */
  rnd(): number {
    this.salt = (this.salt + 1) | 0;
    return hash(this.salt * 2654435761);
  }

  push(p: Particle): void {
    if (this.ps.length < MAX_PARTICLES) this.ps.push(p);
  }

  make(kind: Kind, x: number, y: number, color: string, life: number, size: number): Particle {
    return { kind, x, y, vx: 0, vy: 0, age: 0, life, size, color, color2: color, rot: 0, vrot: 0, gravity: 0, x2: x, y2: y };
  }

  /* ----- per-tower tweens read by the sprites ----- */

  /** 0..1 roof pulse for an upgraded tower (1 right after the event, fading over 500 ms). */
  towerPulse(towerId: string, nowMs: number): number {
    const born = this.pulses.get(towerId);
    if (born === undefined) return 0;
    const t = (nowMs - born) / 500;
    if (t >= 1) {
      this.pulses.delete(towerId);
      return 0;
    }
    return Math.sin((1 - t) * Math.PI) * (1 - t);
  }

  /** Vertical squash for a just-captured tower: dips to 0.85 then pops back with overshoot. */
  towerSquash(towerId: string, nowMs: number): number {
    const c = this.captures.get(towerId);
    if (!c) return 1;
    const t = (nowMs - c.at) / CAPTURE_MS;
    if (t >= 1) {
      this.captures.delete(towerId);
      return 1;
    }
    if (t < 0.22) return 1 - 0.15 * (t / 0.22);
    return 0.85 + 0.15 * backOut((t - 0.22) / 0.78);
  }

  /** Radial colour wipe for a just-captured tower, or null when done. */
  towerWipe(towerId: string, nowMs: number): { from: Owner; t: number } | null {
    const c = this.captures.get(towerId);
    if (!c) return null;
    const t = (nowMs - c.at) / (CAPTURE_MS * 0.7);
    return t >= 1 ? null : { from: c.from, t };
  }

  /** ART-23: 0..1 paper-white flash of a just-captured tower's badge (1 at the capture, gone after CAPTURE_FLASH_MS). */
  captureFlash(towerId: string, nowMs: number): number {
    const c = this.captures.get(towerId);
    if (!c) return 0;
    const t = (nowMs - c.at) / CAPTURE_FLASH_MS;
    return t < 0 || t >= 1 ? 0 : (1 - t) * (1 - t);
  }

  /** One token of the shared landing-burst bucket (refilled at LAND_TOKENS_PER_S, capped at LAND_TOKENS_MAX). */
  takeLandToken(nowMs: number): boolean {
    // generic cell rate: `landAt` is when the bucket would next be empty-and-refilling, one token = 1000 / rate ms
    const gap = 1000 / LAND_TOKENS_PER_S;
    const tat = Math.max(this.landAt, nowMs);
    if (tat - nowMs > (LAND_TOKENS_MAX - 1) * gap) return false;
    this.landAt = tat + gap;
    return true;
  }

  /** Horizontal badge jolt (px) after a hostile landing on the tower; 0 at rest and under reduced motion. */
  badgeHit(towerId: string, nowMs: number): number {
    if (this.reducedMotion) return 0;
    const f = this.fire.get(towerId);
    if (!f) return 0;
    const t = (nowMs - f.hitAt) / HIT_MS;
    if (t < 0 || t >= 1) return 0;
    return HIT_PX * (1 - t) * Math.sin(t * Math.PI * 3);
  }

  /** Where an artillery tower last fired (screen-space radians); undefined until it shoots. */
  aimOf(towerId: string): number | undefined {
    return this.aims.get(towerId);
  }

  /** Short decaying screen shake after the player captures a tower (SHAKE_PX) or loses a unit to a mine (2 px, AUD-F2); world only. */
  shake(nowMs: number): { dx: number; dy: number } {
    const t = (nowMs - this.shakeAt) / SHAKE_MS;
    if (t < 0 || t >= 1) return { dx: 0, dy: 0 };
    const a = this.shakeAmp * (1 - t) * (1 - t);
    const w = t * Math.PI * 2 * SHAKE_CYCLES;
    return { dx: Math.sin(w) * a, dy: Math.cos(w * 0.8) * a * 0.5 };
  }

  /* ----- spawners ----- */

  /**
   * A tower changes hands (ART-23): squash / wipe / badge flash tweens, the owner ring, a bright flash
   * ring in the new owner's lit tone racing out from the plinth over a paper-white flash, CAPTURE_CHIPS
   * clay chips in the owner's tones tumbling out of the roof (two-sided: lit face / shade face) and
   * eight bright sparks. All in map space, drawn through the camera.
   */
  capture(x: number, y: number, color: string, towerId?: string, from: Owner = 'neutral', nowMs = 0, shake = false, tones?: Tones): void {
    if (this.reducedMotion) return;
    if (towerId) this.captures.set(towerId, { at: nowMs, from });
    if (shake) {
      this.shakeAt = nowMs;
      this.shakeAmp = SHAKE_PX;
    }
    const lit = tones?.lit ?? shade(color, 0.35);
    const dark = tones?.shade ?? shade(color, -0.25);
    this.push(this.make('ring', x, y, color, 520, 30));
    this.push(this.make('flashRing', x, y, lit, 420, 18));
    this.push(this.make('flash', x, y - 6, '#fffaf0', 180, 16));
    for (let i = 0; i < CAPTURE_CHIPS; i++) {
      // thrown out sideways from the roof eave (left / right in turn), never up through the badge
      const side = i % 2 ? 1 : -1;
      const a = -Math.PI / 2 + side * (0.7 + this.rnd() * 0.75);
      const sp = 150 + this.rnd() * 150;
      const p = this.make('chip', x + side * (8 + this.rnd() * 10), y - 34, i % 4 === 3 ? '#fffaf0' : i % 3 ? color : lit, 650 + this.rnd() * 300, 5 + this.rnd() * 3);
      p.color2 = i % 4 === 3 ? shade('#fffaf0', -0.12) : dark;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp * 0.6;
      p.gravity = 520;
      p.rot = this.rnd() * Math.PI;
      p.vrot = (this.rnd() - 0.5) * 14;
      this.push(p);
    }
    this.kick(x, y, [lit, '#fffaf0', lit, '#fffaf0', lit, '#fffaf0', lit, '#fffaf0'], 3.4, 1.2);
  }

  /**
   * Rules v2.1: the sim marks a tower under fire on every hostile landing (`underFireUntilMs`
   * moves) but emits no event for it, so the renderer watches the field. Call once per frame
   * before the towers are drawn: a changed deadline = a landing → badge jolt and a short impact
   * ring at the base in the attacker's colour (`attackers` from `hostileAttackers`).
   */
  landings(state: GameState, attackers: ReadonlyMap<string, Owner>, pal: Palette, nowMs: number): void {
    for (const id in state.towers) {
      const t = state.towers[id]!;
      const until = t.underFireUntilMs;
      const f = this.fire.get(id);
      if (f ? f.until === until : until === 0) continue;
      if (f) f.until = until;
      else this.fire.set(id, { until, hitAt: -Infinity, ringAt: -Infinity });
      if (state.time >= until) continue; // expired / cleared by a capture: not a landing
      const rec = this.fire.get(id)!;
      rec.hitAt = nowMs;
      this.hit(rec, t, attackers.get(id), pal, nowMs);
    }
  }

  /** A hostile landing burst on `t` by `by`, at most once per IMPACT_INTERVAL_MS per tower (`rec`) and one landing token. */
  private hit(rec: { ringAt: number }, t: Tower, by: Owner | undefined, pal: Palette, nowMs: number): void {
    if (nowMs - rec.ringAt < IMPACT_INTERVAL_MS || !this.takeLandToken(nowMs)) return;
    rec.ringAt = nowMs;
    this.impact(t.x, t.y, by ? pal.owners[by] : pal.ink, by ? pal.ownerTones[by].lit : undefined);
  }

  /**
   * One hostile landing ("under fire", ART-23 stronger): an impact ring in the attacker's colour, a
   * small hit flash in its lit tone and four sparks (attacker mid / lit / paper) kicked up off the plinth.
   */
  impact(x: number, y: number, color: string, lit = shade(color, 0.35)): void {
    if (this.reducedMotion) return;
    this.push(this.make('impact', x, y, color, 380, 18));
    this.push(this.make('flash', x, y - 4, lit, 140, 9));
    this.kick(x, y, [color, lit, color, '#fffaf0'], 4, 1);
  }

  /** Sparks kicked up off a plinth, one per colour in `colors`; `k` scales their size / speed / life. */
  kick(x: number, y: number, colors: readonly string[], size: number, k: number): void {
    for (const c of colors) {
      const p = this.make('spark', x + (this.rnd() - 0.5) * 16 * k, y - 3, c, (200 + this.rnd() * 100) * (0.5 + k * 0.5), size);
      p.vx = (this.rnd() - 0.5) * 170 * k;
      p.vy = (-70 - this.rnd() * 120) * k;
      p.gravity = 380;
      this.push(p);
    }
  }

  /**
   * ART-23: a unit of the tower's own side lands (reinforcement, `landed` event with `hostile` false):
   * a faint small ring and three sparks in the owner's lit tone. Once per tower per FRIENDLY_LAND_MS
   * and one token of the shared landing bucket.
   */
  reinforce(towerId: string, x: number, y: number, tones: Tones, nowMs: number): void {
    if (this.reducedMotion) return;
    const last = this.friendAt.get(towerId);
    if (last !== undefined && nowMs - last < FRIENDLY_LAND_MS) return;
    if (!this.takeLandToken(nowMs)) return;
    this.friendAt.set(towerId, nowMs);
    this.push(this.make('impact', x, y, tones.lit, 240, 9));
    this.kick(x, y, [tones.lit, '#fffaf0', tones.lit], 2.2, 0.6);
  }


  /** Three puffs where a unit died: pale grey (clash, artillery) or, for a mine, soot in `light` / `dark`. */
  death(x: number, y: number, light = '#eef1f5', dark = '#c9d1dc'): void {
    if (this.reducedMotion) return;
    for (let i = 0; i < 3; i++) {
      const p = this.make('puff', x + (this.rnd() - 0.5) * 8, y - 4, i === 1 ? light : dark, 320 + this.rnd() * 160, 4 + this.rnd() * 3);
      p.vx = (this.rnd() - 0.5) * 30;
      p.vy = -25 - this.rnd() * 25;
      this.push(p);
    }
  }

  /** AUD-F2 reduced motion: the just-blasted mines' chips outlined (lazy chunk); call after the chips are drawn (draw.ts `drawWorld`). */
  drawMineMarks(ctx: CanvasRenderingContext2D, pal: Palette, mines: readonly Mine[], chips: readonly PlacedChip[], nowMs: number, cam: Camera): void {
    if (this.marks.size) economy?.marks(this, ctx, pal, mines, chips, nowMs, cam);
  }

  /**
   * One small dust puff behind a marching column on sand, rate-limited per column (`key`) to one
   * every DUST_INTERVAL_MS so 400 units cost at most a couple of puffs per frame.
   */
  dust(key: string, x: number, y: number, color: string, nowMs: number): void {
    if (this.reducedMotion) return;
    const last = this.dustAt.get(key);
    if (last !== undefined && nowMs - last < DUST_INTERVAL_MS) return;
    this.dustAt.set(key, nowMs);
    const p = this.make('dust', x + (this.rnd() - 0.5) * 4, y, color, 420 + this.rnd() * 160, 3 + this.rnd() * 2);
    p.vx = (this.rnd() - 0.5) * 10;
    p.vy = -8 - this.rnd() * 8;
    this.push(p);
  }

  /**
   * ART-20: a small flat footstep puff where a marching soldier pushes off (or behind a tank's
   * tracks), in the biome's dust colour, rate-limited per column (`key`) to one every
   * STEP_INTERVAL_MS — whichever unit of the column steps first gets it, so the puffs walk along the
   * column instead of trailing its last soldier.
   */
  step(key: string, x: number, y: number, color: string, nowMs: number): void {
    if (this.reducedMotion) return;
    const last = this.stepAt.get(key);
    if (last !== undefined && nowMs - last < STEP_INTERVAL_MS) return;
    this.stepAt.set(key, nowMs);
    const p = this.make('step', x + (this.rnd() - 0.5) * 2, y, color, 300 + this.rnd() * 120, 1.6 + this.rnd() * 1.2);
    p.vx = (this.rnd() - 0.5) * 6;
    p.vy = -5 - this.rnd() * 5;
    this.push(p);
  }

  /**
   * Level-up: roof pulse, gold ring at the base and (ART-23) a short gold sparkle fountain out of the
   * roof top (`height` = how far the roof is above the anchor): UPGRADE_SPARKLES twinkling glints
   * shooting up and falling back in gold / pale gold / paper.
   */
  upgrade(towerId: string, x: number, y: number, color: string, nowMs: number, height = 60): void {
    if (this.reducedMotion) return;
    this.pulses.set(towerId, nowMs);
    const ring = this.make('ring', x, y - 6, color, 420, 22);
    this.push(ring);
    const pale = shade(color, 0.55);
    for (let i = 0; i < UPGRADE_SPARKLES; i++) {
      // two plumes arcing out to either side of the badge column, so the numerals stay clear
      const a = -Math.PI / 2 + (i % 2 ? 1 : -1) * (0.45 + this.rnd() * 0.5);
      const sp = 150 + this.rnd() * 140;
      const p = this.make('glint', x + (this.rnd() - 0.5) * 10, y - height, i % 3 === 0 ? '#fffaf0' : i % 3 === 1 ? color : pale, 560 + this.rnd() * 340, 3.5 + this.rnd() * 3.5);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.gravity = 420;
      p.rot = this.rnd() * Math.PI;
      p.vrot = 9;
      this.push(p);
    }
  }

  /** Muzzle flash at the barrel, tracer to the victim, hit spark on impact. */
  shot(fromX: number, fromY: number, toX: number, toY: number, color: string): void {
    if (this.reducedMotion) return;
    const flash = this.make('flash', fromX, fromY, '#fff2a8', 130, 12);
    this.push(flash);
    const tracer = this.make('tracer', fromX, fromY, '#fff6c8', 170, 3);
    tracer.x2 = toX;
    tracer.y2 = toY;
    this.push(tracer);
    const hit = this.make('flash', toX, toY, '#ffd166', 160, 7);
    this.push(hit);
    for (let i = 0; i < 5; i++) {
      const p = this.make('spark', toX, toY, i % 2 ? color : '#ffd166', 280, 2.5);
      p.vx = (this.rnd() - 0.5) * 160;
      p.vy = -this.rnd() * 140;
      p.gravity = 320;
      this.push(p);
    }
  }

  /**
   * Purchase / reward: `n` gold coins fountain up from (x, y), spin and fall (screen or logical
   * space — whatever transform is active when `draw` runs). Gold is the same in both palettes.
   */
  coinBurst(x: number, y: number, n: number, pal: Palette = DEFAULT_PALETTE): void {
    if (this.reducedMotion) return;
    this.burst((b) => b.coin(this, x, y, n, pal));
  }

  /** Purchase / reward: `n` crystals scatter from (x, y) in a slower, floatier arc with sparkles. */
  crystalBurst(x: number, y: number, n: number, pal: Palette = DEFAULT_PALETTE): void {
    if (this.reducedMotion) return;
    this.burst((b) => b.crystal(this, x, y, n, pal));
  }

  /** Spawn through the economy chunk: at once when loaded, else when it lands (skipped after a fresh failure). */
  private burst(spawn: (b: EconomyBursts) => void): void {
    if (economy) spawn(economy);
    else if (!chunkBackoff(ECONOMY_CHUNK)) void loadEconomyBursts().then(spawn).catch(() => undefined);
  }

  /**
   * Victory: confetti rains down the top of the screen in the player colours and gold. AUD-F4: the band
   * starts on screen (y 0…300) so the 600 ms result beat shows it, not 1–2 of 90 pieces.
   */
  victory(colors: readonly string[]): void {
    if (this.reducedMotion) return;
    for (let i = 0; i < 90; i++) {
      const p = this.make('confetti', this.rnd() * C.MAP_W, this.rnd() * 300, colors[i % colors.length]!, 2600 + this.rnd() * 1400, 5 + this.rnd() * 5);
      p.vx = (this.rnd() - 0.5) * 60;
      p.vy = 90 + this.rnd() * 120;
      p.gravity = 40;
      p.rot = this.rnd() * Math.PI;
      p.vrot = (this.rnd() - 0.5) * 8;
      this.push(p);
    }
  }

  /** Map one frame of sim events to effects. */
  onEvents(events: readonly SimEvent[], state: GameState, pal: Palette, nowMs: number): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'capture': {
          const t = state.towers[ev.towerId];
          if (t) this.capture(t.x, t.y, pal.owners[ev.by], t.id, ev.from, nowMs, ev.by === 'player', pal.ownerTones[ev.by]);
          break;
        }
        case 'landed': {
          // hostile landings on owned towers burst through `landings` (it also drives the badge jolt); here
          // the reinforcements and the hostile landings on neutral towers (never "under fire")
          const t = state.towers[ev.towerId];
          if (!t) break;
          if (!ev.hostile) this.reinforce(t.id, t.x, t.y, pal.ownerTones[ev.owner], nowMs);
          else if (t.owner === 'neutral') {
            let rec = this.fire.get(t.id);
            if (!rec) this.fire.set(t.id, (rec = { until: 0, hitAt: -Infinity, ringAt: -Infinity }));
            this.hit(rec, t, ev.owner, pal, nowMs);
          }
          break;
        }
        case 'unitDied': {
          // AUD-F2: a mine kill bursts at its mine (lazy chunk; the grey puff until it is in)
          if (ev.cause === 'mine' && economy?.mine(this, state, ev.x, ev.y, ev.owner === 'player', pal, nowMs)) break;
          this.death(ev.x, ev.y);
          if (ev.cause === 'artillery') {
            const gun = nearestGun(state, ev.x, ev.y, ev.owner);
            if (gun) {
              const a = Math.atan2(ev.y - 6 - (gun.y - 26), ev.x - gun.x);
              this.aims.set(gun.id, a);
              // ART-22: the shell leaves the barrel as drawn — the projected gun plus the sprite's muzzle
              // offset (at the aim draw.ts gives the barrel) × depth, in screen space, carried back to the
              // map point that projects there (so the flash and the tracer's start sit on the muzzle)
              const cam = playCamera();
              const g = proj(cam, gun.x, gun.y);
              const m = artilleryMuzzle(gun.level, projAngle(cam, gun.x, gun.y, a));
              const o = unproj(cam, g.x + m.dx * g.s, g.y + m.dy * g.s);
              this.shot(o.x, o.y, ev.x, ev.y - 6, pal.owners[gun.owner]);
            }
          }
          break;
        }
        case 'upgrade': {
          const t = state.towers[ev.towerId];
          if (t) this.upgrade(t.id, t.x, t.y, pal.gold, nowMs, towerTop(t.kind, ev.level) * 0.8);
          break;
        }
        case 'won':
          this.victory([pal.gold, pal.ownerTones.player.lit, pal.owners.player, '#fffaf0']);
          break;
        default:
          break;
      }
    }
  }

  /** Step by wall-clock time and paint. Expects the logical transform to be active. */
  draw(ctx: CanvasRenderingContext2D, nowMs: number, project?: ParticleProjection): void {
    if (!this.warmed) {
      // reduced motion too: the AUD-F2 mine marks are drawn through the chunk
      this.warmed = true;
      warmEconomyBursts();
    }
    const dt = this.lastMs ? Math.min(64, Math.max(0, nowMs - this.lastMs)) : 16;
    this.lastMs = nowMs;
    if (!this.ps.length) return;
    const s = dt / 1000;
    ctx.save();
    // ART-21 camera: world particles are drawn upright at their projected point, scaled by depth
    // (one setTransform each); confetti and purchase coins / gems live in screen space and are not
    const base = project ? (ctx.getTransform() as DOMMatrix | undefined) : undefined;
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        this.ps[i] = this.ps[this.ps.length - 1]!;
        this.ps.pop();
        continue;
      }
      p.vy += p.gravity * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.rot += p.vrot * s;
      const t = p.age / p.life;
      const fade = 1 - t;
      if (project && base) {
        if (p.kind === 'confetti' || p.kind === 'coin' || p.kind === 'gem' || p.kind === 'tracer') ctx.setTransform(base);
        else {
          const q = project(p.x, p.y);
          ctx.setTransform(base.a * q.s, 0, 0, base.d * q.s, base.e + base.a * (q.x - q.s * p.x), base.f + base.d * (q.y - q.s * p.y));
        }
      }
      switch (p.kind) {
        case 'ring':
          ctx.globalAlpha = fade;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 8 * fade + 1;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + 4, p.size + 70 * t, (p.size + 70 * t) * 0.45, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'flashRing': {
          // ART-23: a bright ring racing out from the plinth (ease-out), thick then thin, with a paper core line
          const e = 1 - (1 - t) * (1 - t);
          const rx = p.size + 64 * e;
          ctx.globalAlpha = fade;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 9 * fade + 1.5;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + 4, rx, rx * 0.42, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = '#fffaf0';
          ctx.lineWidth = 2.5 * fade + 0.5;
          ctx.stroke();
          break;
        }
        case 'impact':
          ctx.globalAlpha = fade * 0.9;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 5 * fade + 1;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + 3, p.size + 30 * t, (p.size + 30 * t) * 0.45, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'confetti':
        case 'chip':
        case 'plank': {
          // rotated rectangle from its four corners (no save/restore per particle); an ART-23 clay chip
          // is a chunkier one that shows its shade face (`color2`) while it tumbles over
          ctx.globalAlpha = Math.min(1, fade * 2);
          const chip = p.kind === 'chip';
          ctx.fillStyle = chip && Math.sin(p.rot * 1.7) < 0 ? p.color2 : p.color;
          const hw = p.kind === 'plank' ? p.size : p.size / 2;
          const hh = p.kind === 'plank' ? 2.5 : p.size / (chip ? 2.6 : 4);
          const c = Math.cos(p.rot);
          const sn = Math.sin(p.rot);
          ctx.beginPath();
          ctx.moveTo(p.x + (-hw * c - -hh * sn), p.y + (-hw * sn + -hh * c));
          ctx.lineTo(p.x + (hw * c - -hh * sn), p.y + (hw * sn + -hh * c));
          ctx.lineTo(p.x + (hw * c - hh * sn), p.y + (hw * sn + hh * c));
          ctx.lineTo(p.x + (-hw * c - hh * sn), p.y + (-hw * sn + hh * c));
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'puff':
        case 'dust':
          ctx.globalAlpha = fade * (p.kind === 'dust' ? 0.8 : 0.9);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size + (p.kind === 'dust' ? 7 : 9) * t, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'step': {
          // a flat ground puff spreading out (ellipse, like the unit shadows)
          ctx.globalAlpha = fade * 0.85;
          ctx.fillStyle = p.color;
          const r = p.size + 4.5 * t;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, r, r * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'spark':
        case 'glint': {
          ctx.globalAlpha = fade;
          ctx.fillStyle = p.color;
          const sz = p.kind === 'glint' ? p.size * (0.6 + 0.4 * Math.sin(p.rot)) : p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - sz);
          ctx.lineTo(p.x + sz * 0.45, p.y);
          ctx.lineTo(p.x, p.y + sz);
          ctx.lineTo(p.x - sz * 0.45, p.y);
          ctx.closePath();
          ctx.fill();
          if (p.kind === 'glint') {
            ctx.beginPath();
            ctx.moveTo(p.x - sz, p.y);
            ctx.lineTo(p.x, p.y + sz * 0.45);
            ctx.lineTo(p.x + sz, p.y);
            ctx.lineTo(p.x, p.y - sz * 0.45);
            ctx.closePath();
            ctx.fill();
          }
          break;
        }
        case 'flash':
          ctx.globalAlpha = fade;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.6 + t), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'tracer': {
          // both ends through the camera (a shell's flight is a straight line on the screen too)
          const a = project ? project(p.x, p.y) : p;
          const b = project ? project(p.x2, p.y2) : { x: p.x2, y: p.y2 };
          ctx.globalAlpha = fade;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = project ? p.size * project(p.x, p.y).s : p.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          break;
        }
        case 'coin':
        case 'gem':
          economy?.draw(ctx, p, t, fade);
          break;
      }
    }
    ctx.restore();
  }
}

/** The hostile artillery tower that most plausibly shelled a unit at (x, y). */
function nearestGun(state: GameState, x: number, y: number, victim: Owner): Tower | null {
  let best: Tower | null = null;
  let bestD = C.ARTILLERY_RANGE + C.UNIT_SPEED * 0.1;
  for (const id in state.towers) {
    const t = state.towers[id]!;
    if (t.kind !== 'artillery' || t.owner === 'neutral' || t.owner === victim) continue;
    const d = Math.hypot(t.x - x, t.y - y);
    if (d <= bestD) {
      bestD = d;
      best = t;
    }
  }
  return best;
}
