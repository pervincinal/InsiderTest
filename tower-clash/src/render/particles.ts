import type { GameState, Owner, SimEvent, Tower } from '../sim/types';
import { C } from '../sim/constants';
import { roadPointAt } from '../sim/step';
import type { Palette } from './palette';
import { DEFAULT_PALETTE, shade } from './palette';
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

export type Kind = 'confetti' | 'ring' | 'impact' | 'puff' | 'dust' | 'spark' | 'flash' | 'tracer' | 'plank' | 'glint' | 'coin' | 'gem';

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
/** Marching columns on sand: at most one dust puff per column per this many ms. */
const DUST_INTERVAL_MS = 200;
/** Under fire (rules v2.1): badge jolt per hostile landing (px, length) and the impact-ring rate cap per tower. */
const HIT_PX = 3;
const HIT_MS = 180;
const IMPACT_INTERVAL_MS = 90;

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

/** Spawner surface of `ParticleSystem` that the economy bursts use. */
export interface BurstHost {
  rnd(): number;
  make(kind: Kind, x: number, y: number, color: string, life: number, size: number): Particle;
  push(p: Particle): void;
}

/**
 * Purchase / reward bursts (`coin`, `gem`) live in src/render/particlesEconomy.ts, a lazy chunk: the
 * first frame a system draws warms it, `coinBurst` / `crystalBurst` spawn through it (on landing, in
 * the rare case it is not in yet), and `draw` paints those two kinds through it.
 */
export interface EconomyBursts {
  coin(host: BurstHost, x: number, y: number, n: number, pal: Palette): void;
  crystal(host: BurstHost, x: number, y: number, n: number, pal: Palette): void;
  /** Paint one `coin` / `gem` particle (`t` = age fraction, `fade` = 1 − t). */
  draw(ctx: CanvasRenderingContext2D, p: Particle, t: number, fade: number): void;
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
  /** Per tower: last seen `underFireUntilMs`, wall-clock of the last hostile landing and of the last impact ring. */
  private readonly fire = new Map<string, { until: number; hitAt: number; ringAt: number }>();
  private shakeAt = -Infinity;
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

  /** Short decaying screen shake after the player captures a tower (≤ SHAKE_PX, world only). */
  shake(nowMs: number): { dx: number; dy: number } {
    const t = (nowMs - this.shakeAt) / SHAKE_MS;
    if (t < 0 || t >= 1) return { dx: 0, dy: 0 };
    const a = SHAKE_PX * (1 - t) * (1 - t);
    const w = t * Math.PI * 2 * SHAKE_CYCLES;
    return { dx: Math.sin(w) * a, dy: Math.cos(w * 0.8) * a * 0.5 };
  }

  /* ----- spawners ----- */

  capture(x: number, y: number, color: string, towerId?: string, from: Owner = 'neutral', nowMs = 0, shake = false): void {
    if (this.reducedMotion) return;
    if (towerId) this.captures.set(towerId, { at: nowMs, from });
    if (shake) this.shakeAt = nowMs;
    const ring = this.make('ring', x, y, color, 520, 30);
    this.push(ring);
    for (let i = 0; i < 28; i++) {
      const a = this.rnd() * Math.PI * 2;
      const sp = 90 + this.rnd() * 220;
      const p = this.make('confetti', x, y - 40, i % 3 === 0 ? '#fffaf0' : i % 3 === 1 ? color : shade(color, 0.35), 750 + this.rnd() * 450, 4 + this.rnd() * 4);
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - 140;
      p.gravity = 400;
      p.rot = this.rnd() * Math.PI;
      p.vrot = (this.rnd() - 0.5) * 12;
      this.push(p);
    }
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
      if (nowMs - rec.ringAt < IMPACT_INTERVAL_MS) continue;
      rec.ringAt = nowMs;
      const by = attackers.get(id);
      this.impact(t.x, t.y, by ? pal.owners[by] : pal.ink);
    }
  }

  /** One hostile landing: a small ring at the tower base plus a few sparks in the attacker's colour. */
  impact(x: number, y: number, color: string): void {
    if (this.reducedMotion) return;
    this.push(this.make('impact', x, y, color, 300, 12));
    for (let i = 0; i < 3; i++) {
      const p = this.make('spark', x + (this.rnd() - 0.5) * 12, y - 2, i === 1 ? '#fffaf0' : color, 220 + this.rnd() * 80, 2.2);
      p.vx = (this.rnd() - 0.5) * 120;
      p.vy = -40 - this.rnd() * 90;
      p.gravity = 360;
      this.push(p);
    }
  }

  death(x: number, y: number): void {
    if (this.reducedMotion) return;
    for (let i = 0; i < 3; i++) {
      const p = this.make('puff', x + (this.rnd() - 0.5) * 8, y - 4, i === 1 ? '#eef1f5' : '#c9d1dc', 320 + this.rnd() * 160, 4 + this.rnd() * 3);
      p.vx = (this.rnd() - 0.5) * 30;
      p.vy = -25 - this.rnd() * 25;
      this.push(p);
    }
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

  /** Gold gem glints, roof pulse and a rising sparkle ring. */
  upgrade(towerId: string, x: number, y: number, color: string, nowMs: number): void {
    if (this.reducedMotion) return;
    this.pulses.set(towerId, nowMs);
    const ring = this.make('ring', x, y - 6, color, 420, 22);
    this.push(ring);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = 26 + this.rnd() * 10;
      const p = this.make('glint', x + Math.cos(a) * r, y - 40 + Math.sin(a) * r * 0.6, i % 2 ? color : '#fffaf0', 480 + this.rnd() * 320, 3 + this.rnd() * 4);
      p.vy = -50 - this.rnd() * 50;
      p.vx = Math.cos(a) * 20;
      p.vrot = 5;
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

  /** Bridge collapsing: plank pieces tumble into the gap. */
  bridgeCut(points: { x: number; y: number }[], wood: string, woodDark: string): void {
    if (this.reducedMotion || points.length < 2) return;
    const a = points[0]!;
    const b = points[points.length - 1]!;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    for (let i = 0; i < 9; i++) {
      const p = this.make('plank', mx + (this.rnd() - 0.5) * 60, my + (this.rnd() - 0.5) * 20, i % 2 ? wood : woodDark, 900 + this.rnd() * 400, 6 + this.rnd() * 8);
      p.vx = (this.rnd() - 0.5) * 120;
      p.vy = -80 - this.rnd() * 120;
      p.gravity = 520;
      p.rot = this.rnd() * Math.PI;
      p.vrot = (this.rnd() - 0.5) * 10;
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

  /** Victory: confetti rains from the top of the map in the player colours and gold. */
  victory(colors: readonly string[]): void {
    if (this.reducedMotion) return;
    for (let i = 0; i < 90; i++) {
      const p = this.make('confetti', this.rnd() * C.MAP_W, -20 - this.rnd() * 300, colors[i % colors.length]!, 2600 + this.rnd() * 1400, 5 + this.rnd() * 5);
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
          if (t) this.capture(t.x, t.y, pal.owners[ev.by], t.id, ev.from, nowMs, ev.by === 'player');
          break;
        }
        case 'unitDied': {
          this.death(ev.x, ev.y);
          if (ev.cause === 'artillery') {
            const gun = nearestGun(state, ev.x, ev.y, ev.owner);
            if (gun) {
              const a = Math.atan2(ev.y - 6 - (gun.y - 26), ev.x - gun.x);
              this.aims.set(gun.id, a);
              this.shot(gun.x + Math.cos(a) * 30, gun.y - 26 + Math.sin(a) * 22, ev.x, ev.y - 6, pal.owners[gun.owner]);
            }
          }
          break;
        }
        case 'upgrade': {
          const t = state.towers[ev.towerId];
          if (t) this.upgrade(t.id, t.x, t.y, pal.gold, nowMs);
          break;
        }
        case 'bridgeCut': {
          const road = state.roads[ev.roadId];
          if (road) this.bridgeCut([roadPointAt(road, 0.4), roadPointAt(road, 0.6)], pal.wood, pal.woodDark);
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
  draw(ctx: CanvasRenderingContext2D, nowMs: number): void {
    if (!this.warmed && !this.reducedMotion) {
      this.warmed = true;
      warmEconomyBursts();
    }
    const dt = this.lastMs ? Math.min(64, Math.max(0, nowMs - this.lastMs)) : 16;
    this.lastMs = nowMs;
    if (!this.ps.length) return;
    const s = dt / 1000;
    ctx.save();
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
      switch (p.kind) {
        case 'ring':
          ctx.globalAlpha = fade;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 8 * fade + 1;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + 4, p.size + 70 * t, (p.size + 70 * t) * 0.45, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'impact':
          ctx.globalAlpha = fade * 0.9;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 3.5 * fade + 1;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + 3, p.size + 24 * t, (p.size + 24 * t) * 0.45, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'confetti':
        case 'plank': {
          // rotated rectangle from its four corners (no save/restore per particle)
          ctx.globalAlpha = Math.min(1, fade * 2);
          ctx.fillStyle = p.color;
          const hw = p.kind === 'plank' ? p.size : p.size / 2;
          const hh = p.kind === 'plank' ? 2.5 : p.size / 4;
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
        case 'tracer':
          ctx.globalAlpha = fade;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x2, p.y2);
          ctx.stroke();
          break;
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
