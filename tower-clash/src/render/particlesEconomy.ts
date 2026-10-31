/**
 * Purchase / reward bursts (gold coins, crystals) for the shop and the result screen, and (AUD-F2) the
 * mine blast. Lazy chunk — src/render/particles.ts loads it on the first drawn frame of a particle
 * system and spawns / paints the `coin` and `gem` kinds and mine kills through `ECONOMY_BURSTS`, so the
 * eager bundle stays under its budget. The other gameplay effects (capture chips, impacts, smoke,
 * planks) stay in particles.ts. AUD-F3: the Freeze / Overdrive looks on the towers they hold are drawn
 * here too, through `ParticleSystem.drawMarks` (nothing shows until the chunk is in).
 */
import type { Booster, Link, Tower } from '../sim/types';
import { C } from '../sim/constants';
import { streamIntervalMs } from '../sim/step';
import type { BurstHost, EconomyBursts, MarksLayout, MarksState } from './particles';
import type { Camera } from './camera';
import { proj } from './camera';
import type { Palette } from './palette';
import { SOLDIER_DRAW_SCALE, TANK_DRAW_SCALE, TANK_RADIUS, WORLD_ZOOM } from './layout';
import type { Rect } from './widgets';
import { roundRect } from './widgets';

/** AUD-F2 mine blast: the world nudge (px) when the mine kills the player's unit, over the capture shake's 320 ms… */
export const MINE_SHAKE_PX = 2;
/** …and under reduced motion how long the blasted mine's chip stays outlined (ms). */
export const MINE_MARK_MS = 300;
/** The capture shake's length (particles.ts SHAKE_MS): a running shake stronger than the nudge is left alone. */
const SHAKE_MS = 320;

/** Start a `px` world shake unless the one running is still stronger (a 2 px nudge never cuts a capture's 6 px short). */
function shakeBy(host: BurstHost, px: number, nowMs: number): void {
  const t = (nowMs - host.shakeAt) / SHAKE_MS;
  if (t >= 0 && t < 1 && host.shakeAmp * (1 - t) * (1 - t) > px) return;
  host.shakeAt = nowMs;
  host.shakeAmp = px;
}

export const ECONOMY_BURSTS: EconomyBursts = {
  /**
   * AUD-F2: a unit died on a mine at (x, y). The blast sits on the mine it crossed (the nearest one).
   * Gun-metal soot puffs at the victim; at the mine, for one token of the shared landing bucket, a
   * mine-red flash with a paper core, a mine-red impact ring and four sparks (mine red / metal shade /
   * paper / metal lit) — 10 particles in all, ≤ 2 fills / strokes each; a MINE_SHAKE_PX nudge when `own`.
   * Reduced motion: nothing moves — the mine is marked for `marks` instead.
   */
  mine(host, state, x, y, own, pal, nowMs) {
    let i = -1;
    let best = Infinity;
    state.mines.forEach((m, j) => {
      const d = Math.hypot(m.x - x, m.y - y);
      if (d < best) [best, i] = [d, j];
    });
    const m = state.mines[i];
    if (!m) return false;
    if (host.reducedMotion) {
      host.marks.set(i, nowMs);
      return true;
    }
    const metal = pal.metal;
    host.death(x, y, metal.lit, metal.mid);
    if (own) shakeBy(host, MINE_SHAKE_PX, nowMs);
    if (!host.takeLandToken(nowMs)) return true;
    host.push(host.make('flash', m.x, m.y - 4, pal.mine, 220, 15));
    host.push(host.make('flash', m.x, m.y - 4, '#fffaf0', 120, 7));
    host.push(host.make('impact', m.x, m.y, pal.mine, 420, 16));
    host.kick(m.x, m.y, [pal.mine, metal.shade, '#fffaf0', metal.lit], 3.6, 1.1);
    return true;
  },

  /**
   * AUD-F2 reduced motion: a static outline (4 px mine red under a 1.5 px paper line) round the chip of
   * every mine that blew up in the last MINE_MARK_MS — the same on every frame, no fade — or, once the
   * mine is spent and has no chip, round the mine itself. AUD-F3: then the booster looks (`drawBoosterFx`).
   */
  marks(host, ctx, pal, state, layout, nowMs, cam) {
    if (state.boosters.length) drawBoosterFx(host, ctx, pal, state, layout, nowMs, cam);
    if (state.links.length) drawMusters(host, ctx, pal, state, layout, cam);
    if (!host.marks.size) return;
    const { mines } = state;
    const { chips } = layout;
    ctx.save();
    for (const [i, at] of host.marks) {
      const m = mines[i];
      if (!m || nowMs - at >= MINE_MARK_MS) {
        host.marks.delete(i);
        continue;
      }
      const p = proj(cam, m.x, m.y);
      const c = chips.find((c) => c.req.mine && Math.abs(c.req.mine.x - p.x) < 1 && Math.abs(c.req.mine.y - p.y) < 1);
      if (c) roundRect(ctx, { x: c.rect.x - 4, y: c.rect.y - 4, w: c.rect.w + 8, h: c.rect.h + 8 }, c.rect.h / 2 + 4);
      else {
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 26 * p.s, 14 * p.s, 0, 0, Math.PI * 2);
      }
      ctx.lineWidth = 4;
      ctx.strokeStyle = pal.mine;
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#fffaf0';
      ctx.stroke();
    }
    ctx.restore();
  },

  coin(host, x, y, n, pal) {
    const g = pal.goldTones;
    for (let i = 0; i < n; i++) {
      const p = host.make('coin', x, y, g.mid, 850 + host.rnd() * 500, 5 + host.rnd() * 3);
      p.color2 = g.shade;
      const a = -Math.PI / 2 + (host.rnd() - 0.5) * 1.5;
      const sp = 180 + host.rnd() * 260;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.gravity = 560;
      p.rot = host.rnd() * Math.PI;
      p.vrot = 7 + host.rnd() * 9;
      host.push(p);
    }
    for (let i = 0; i < Math.min(8, n); i++) {
      const p = host.make('glint', x + (host.rnd() - 0.5) * 30, y - host.rnd() * 20, g.lit, 380 + host.rnd() * 260, 3 + host.rnd() * 3);
      p.vy = -40 - host.rnd() * 60;
      p.vrot = 6;
      host.push(p);
    }
  },

  crystal(host, x, y, n, pal) {
    const c = pal.crystal;
    for (let i = 0; i < n; i++) {
      const p = host.make('gem', x, y, c.mid, 950 + host.rnd() * 550, 5 + host.rnd() * 4);
      p.color2 = c.shade;
      const a = -Math.PI / 2 + (host.rnd() - 0.5) * 1.8;
      const sp = 150 + host.rnd() * 220;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.gravity = 380;
      p.rot = (host.rnd() - 0.5) * 0.8;
      p.vrot = (host.rnd() - 0.5) * 6;
      host.push(p);
    }
    for (let i = 0; i < Math.min(10, n + 2); i++) {
      const p = host.make('glint', x + (host.rnd() - 0.5) * 36, y - host.rnd() * 24, i % 2 ? c.lit : '#fffaf0', 420 + host.rnd() * 300, 3 + host.rnd() * 4);
      p.vy = -50 - host.rnd() * 70;
      p.vx = (host.rnd() - 0.5) * 40;
      p.vrot = 6;
      host.push(p);
    }
  },

  draw(ctx, p, t, fade) {
    ctx.globalAlpha = Math.min(1, fade * 2.5);
    if (p.kind === 'coin') {
      // spinning coin: an ellipse whose width follows cos(rot), edge tone offset below
      const rx = Math.max(p.size * 0.16, Math.abs(Math.cos(p.rot)) * p.size);
      ctx.fillStyle = p.color2;
      ctx.beginPath();
      ctx.ellipse(p.x + 1, p.y + 2, rx, p.size, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rx, p.size, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // tumbling gem: lit left half, violet right half (4 corners rotated by rot)
      const c = Math.cos(p.rot);
      const sn = Math.sin(p.rot);
      const w = p.size * 0.7;
      const h = p.size;
      const tx = p.x - sn * -h;
      const ty = p.y + c * -h;
      const bx = p.x - sn * h;
      const by = p.y + c * h;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(p.x + c * -w, p.y + sn * -w);
      ctx.lineTo(bx, by);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.color2;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(p.x + c * w, p.y + sn * w);
      ctx.lineTo(bx, by);
      ctx.closePath();
      ctx.fill();
    }
  },
};

/* ---------- AUD-F3: Freeze / Overdrive in the world ---------- */

/** Both looks fade out over the booster's last BOOSTER_FADE_MS of sim time (motion only). */
export const BOOSTER_FADE_MS = 1000;
/** Freeze: FROST_CRYSTALS crystal ticks orbit a frozen tower's rim once per FROST_ORBIT_MS (wall clock). */
export const FROST_CRYSTALS = 3;
export const FROST_ORBIT_MS = 6000;
/**
 * Overdrive: one chevron rises beside the tower (alternating sides) every effective stream interval
 * (`streamIntervalMs` ÷ OVERDRIVE_MUL) and lives CHEVRON_MS — shortened so that at most CHEVRON_MAX are
 * up at once (a faster tower's chevrons climb faster rather than crowd).
 */
export const CHEVRON_MS = 900;
export const CHEVRON_MAX = 4;

/** Badge tint (multiplied into the pill, so the ink numerals stay dark): Overdrive's warm wash is paler than the "full" gold paper. */
const WARM_TINT = 0.35;

/**
 * The booster looks a tower carries now: for Freeze (it is frozen — a non-neutral owner other than a
 * freeze's caster) and Overdrive (its owner cast one), the fade factor 1 → 0 over the last
 * BOOSTER_FADE_MS of the latest such booster, or 0 when none holds it. Pure.
 */
export function boosterLook(boosters: readonly Booster[], time: number, tower: Pick<Tower, 'owner'>): { freeze: number; overdrive: number } {
  let freeze = 0;
  let overdrive = 0;
  for (const b of boosters) {
    const left = b.untilMs - time;
    if (left <= 0) continue;
    const f = Math.min(1, left / BOOSTER_FADE_MS);
    if (b.type === 'overdrive' && b.owner === tower.owner) overdrive = Math.max(overdrive, f);
    else if (b.type === 'freeze' && b.owner !== tower.owner && tower.owner !== 'neutral') freeze = Math.max(freeze, f);
  }
  return { freeze, overdrive };
}

/**
 * `over` at `alpha` on `base` (`#rrggbb`) — palette.ts `composite`, repeated here: importing it would make
 * the eager chunk keep a standalone copy of a function it otherwise inlines (+0.17 kB raw).
 */
function mix(base: string, over: string, alpha: number): string {
  const a = parseInt(base.slice(1), 16);
  const b = parseInt(over.slice(1), 16);
  const ch = (sh: number): number => Math.round(((a >> sh) & 255) * (1 - alpha) + ((b >> sh) & 255) * alpha);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/** Edge (dark) / body / lit tones of the two looks: frost = sky blue, cyan crystal, ice white; gold = the coin clay. */
function frostTones(pal: Palette): [string, string, string] {
  return [pal.sky, pal.crystal.mid, pal.crystal.lit];
}
function goldTones(pal: Palette): [string, string, string] {
  return [pal.goldShade, pal.gold, pal.goldTones.lit];
}

/** Stroke the current path twice: a dark `edge` line `w` wide, then a `lit` line 0.4 × `w` on it. */
function twoTone(ctx: CanvasRenderingContext2D, edge: string, lit: string, w: number): void {
  ctx.strokeStyle = edge;
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.strokeStyle = lit;
  ctx.lineWidth = w * 0.4;
  ctx.stroke();
}

/** A "^" chevron of half-width `w`, `h` tall, centred on (x, y), as a new path. */
function chevronPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.beginPath();
  ctx.moveTo(x - w, y + h / 2);
  ctx.lineTo(x, y - h / 2);
  ctx.lineTo(x + w, y + h / 2);
}

/** A six-point crystal (three strokes through the centre) of radius `r` at (x, y), added to the current path. */
function crystalPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  for (let k = 0; k < 3; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 3;
    ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
}

/**
 * One tower's look (`kind`), drawn at fade `f` with the world clipped clear of the badges and chips.
 * The rim: a ground ring round the zoomed plinth (back half at half strength, front half full), with
 * the shape cue that reads without colour baked in — frost: five ice ticks standing out of the front
 * rim; gold: three chevrons sitting on it. Motion adds the frost's FROST_CRYSTALS orbiting crystals or
 * Overdrive's rising chevrons. Strokes per tower: rim 4 + cue 2 + ≤ 6 (crystals) / ≤ 8 (chevrons).
 */
function drawTowerLook(ctx: CanvasRenderingContext2D, pal: Palette, state: MarksState, t: Tower, body: Rect, kind: 'freeze' | 'overdrive', f: number, motion: boolean, nowMs: number, cam: Camera): void {
  const p = proj(cam, t.x, t.y);
  const z = WORLD_ZOOM.tower * p.s;
  const rx = body.w / 2 + 7 * z;
  const ry = rx * 0.42;
  const cy = p.y + 2 * z;
  const [edge, mid, lit] = kind === 'freeze' ? frostTones(pal) : goldTones(pal);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // the rim: the back half behind the building reads as a glow, the front half as the ring
  for (const [a0, a1, k] of [
    [Math.PI, Math.PI * 2, 0.5],
    [0, Math.PI, 1],
  ] as const) {
    ctx.globalAlpha = f * k;
    ctx.beginPath();
    ctx.ellipse(p.x, cy, rx, ry, 0, a0, a1);
    twoTone(ctx, edge, mid, 6 * z);
  }
  ctx.globalAlpha = f;
  ctx.beginPath();
  if (kind === 'freeze') {
    // ice ticks: short spikes out of the front rim along its normal
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.1 + 0.2 * i);
      const nx = Math.cos(a) / rx;
      const ny = Math.sin(a) / ry;
      const n = Math.hypot(nx, ny);
      const x = p.x + Math.cos(a) * rx;
      const y = cy + Math.sin(a) * ry;
      ctx.moveTo(x - (nx / n) * 3 * z, y - (ny / n) * 3 * z);
      ctx.lineTo(x + (nx / n) * 7 * z, y + (ny / n) * 7 * z);
    }
  } else {
    for (const a of [0.3, 0.5, 0.7]) {
      const x = p.x + Math.cos(Math.PI * a) * rx;
      const y = cy + Math.sin(Math.PI * a) * ry;
      ctx.moveTo(x - 5 * z, y + 2 * z);
      ctx.lineTo(x, y - 3 * z);
      ctx.lineTo(x + 5 * z, y + 2 * z);
    }
  }
  twoTone(ctx, edge, lit, 4 * z);
  if (!motion) return;
  if (kind === 'freeze') {
    // slow crystals riding just outside the rim, lifted a little; dimmer while behind the building
    for (let i = 0; i < FROST_CRYSTALS; i++) {
      const a = (2 * Math.PI * nowMs) / FROST_ORBIT_MS + (i * 2 * Math.PI) / FROST_CRYSTALS;
      const sn = Math.sin(a);
      ctx.globalAlpha = f * (sn < 0 ? 0.55 : 1);
      ctx.beginPath();
      crystalPath(ctx, p.x + Math.cos(a) * (rx + 4 * z), cy + sn * (ry + 2 * z) - 10 * z, 5.5 * z);
      twoTone(ctx, edge, lit, 3.5 * z);
    }
    return;
  }
  // chevrons at the stream rate, up the sides of the building from its foot to near the roof
  const every = streamIntervalMs(t, state) / C.OVERDRIVE_MUL;
  const life = Math.min(CHEVRON_MS, CHEVRON_MAX * every);
  const top = p.y - body.y;
  const n = Math.floor(nowMs / every);
  for (let j = 0; j < CHEVRON_MAX; j++) {
    const u = (nowMs - (n - j) * every) / life;
    if (u >= 1) break;
    const side = (n - j) & 1 ? 1 : -1;
    ctx.globalAlpha = f * Math.min(1, u * 6, (1 - u) * 3);
    chevronPath(ctx, p.x + side * rx * 0.85, p.y - top * (0.1 + 0.75 * u), 8 * z, 6 * z);
    twoTone(ctx, edge, lit, 4.5 * z);
  }
}

/**
 * The badge of a tower under a booster: its pill multiplied with a cold (crystal lit) or warm (paper /
 * gold) wash — paper tints, the ink numerals stay dark (≥ 11:1 on the frost paper, 4.5:1 floor kept) —
 * and (`drawBadgeHalo`) a thin two-tone halo (edge + lit tone) BADGE_HALO_GAP px off the pill. The wash stops 1.5 px inside
 * the pill and the halo leaves a gap, so the owner-coloured stroke between them keeps its hue (a frozen
 * enemy's badge must not read as the player's blue). Follows the under-fire jolt; a send pop (≤ 200 ms)
 * is not followed.
 */
function drawBadgeLook(ctx: CanvasRenderingContext2D, pal: Palette, r: Rect, kind: 'freeze' | 'overdrive', f: number): void {
  ctx.globalAlpha = f;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = kind === 'freeze' ? pal.crystal.lit : mix(pal.paper, pal.gold, WARM_TINT);
  roundRect(ctx, { x: r.x + 1.5, y: r.y + 1.5, w: r.w - 3, h: r.h - 3 }, r.h / 2 - 1.5);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

/** The badge halo (`drawBadgeLook`), drawn inside the badge / chip clip so it never runs over a neighbouring chip. */
function drawBadgeHalo(ctx: CanvasRenderingContext2D, pal: Palette, r: Rect, kind: 'freeze' | 'overdrive', f: number): void {
  const [edge, , lit] = kind === 'freeze' ? frostTones(pal) : goldTones(pal);
  ctx.globalAlpha = f;
  const g = BADGE_HALO_GAP;
  roundRect(ctx, { x: r.x - g, y: r.y - g, w: r.w + 2 * g, h: r.h + 2 * g }, r.h / 2 + g);
  twoTone(ctx, edge, lit, 3.5);
}

/** The badge halo's offset from the pill (px): its 3.5 px line clears the owner stroke by ≈ 3 px. */
export const BADGE_HALO_GAP = 6;

/** A pill (round ends) `pad` px round `r`, added to the current path as a closed subpath (the clip's badge cut-outs). */
function pillPath(ctx: CanvasRenderingContext2D, r: Rect, pad: number): void {
  const x = r.x - pad;
  const y = r.y - pad;
  const w = r.w + 2 * pad;
  const h = r.h + 2 * pad;
  const rad = Math.min(w, h) / 2;
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/**
 * AUD-F3 (GDD §2.6): every tower a Freeze or an Overdrive holds shows it — the rim and its cue, the
 * motion extras and the badge tint (`drawTowerLook`, `drawBadgeLook`), fading over the last
 * BOOSTER_FADE_MS. Reduced motion: the static rims, cues and tint at full strength until the booster
 * ends (no orbit, no chevrons, no fade). Nothing is spawned: the looks are drawn from the clock, so the
 * particle cap and the landing bucket are untouched. The rims stay clear of every badge and chip
 * (an even-odd clip), so no numeral is crossed.
 */
export function drawBoosterFx(host: BurstHost, ctx: CanvasRenderingContext2D, pal: Palette, state: MarksState, layout: MarksLayout, nowMs: number, cam: Camera): void {
  const motion = !host.reducedMotion;
  const held: [Tower, 'freeze' | 'overdrive', number][] = [];
  for (const id in state.towers) {
    const t = state.towers[id]!;
    const look = boosterLook(state.boosters, state.time, t);
    if (look.freeze) held.push([t, 'freeze', motion ? look.freeze : 1]);
    if (look.overdrive) held.push([t, 'overdrive', motion ? look.overdrive : 1]);
  }
  if (!held.length) return;
  // the badge tints first (inside the pills), then everything else clipped clear of every badge and chip
  ctx.save();
  for (const [t, kind, f] of held) {
    const b = layout.badges.get(t.id);
    if (b) drawBadgeLook(ctx, pal, { ...b.rect, x: b.rect.x + host.badgeHit(t.id, nowMs) }, kind, f);
  }
  ctx.beginPath();
  ctx.rect(-1e4, -1e4, 2e4, 2e4);
  // badges as pills (a square cut-out would nick the halo's round ends), chips as rects
  for (const { rect: r } of layout.badges.values()) pillPath(ctx, r, 3);
  for (const { rect: r } of layout.chips) ctx.rect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
  ctx.clip('evenodd');
  for (const [t, kind, f] of held) {
    const body = layout.bodies.get(t.id);
    if (body) drawTowerLook(ctx, pal, state, t, body, kind, f, motion, nowMs, cam);
    const b = layout.badges.get(t.id);
    if (b) drawBadgeHalo(ctx, pal, { ...b.rect, x: b.rect.x + host.badgeHit(t.id, nowMs) }, kind, f);
  }
  ctx.restore();
}

/* ---------- AUD-F5b: the muster (the first soldier of a new stream forming at the gate) ---------- */

/** Reduced motion: the muster is a static dot of this opacity until the first soldier is out. */
export const MUSTER_DOT_ALPHA = 0.6;
/** The plinth's depth on the screen (sprites.ts `plinth`: an ellipse 0.42 × r deep) — the gate sits on it. */
const PLINTH_RY = 0.42;
/** The wall above the plinth, as a share of the drawn body's half-width (the plinth): a unit beyond it shows beside the tower. */
const WALL_HALF = 0.6;

/**
 * Per link (render-only, no sim field): the `emitAccMs` seen on the last frame, and the first soldier —
 * WAITING until the link's first emission (a drop of `emitAccMs` between two frames), then that unit's id
 * until it has walked out past the plinth rim (the gate), then DONE: one muster per link, never again.
 */
interface Muster {
  last: number;
  unit: number;
}
const WAITING = -1;
const DONE = -2;
const musters = new WeakMap<Link, Muster>();

/** Distance from the tower's anchor to the plinth rim (ellipse rx `half`, ry 0.42 × `half`) along the screen direction (dx, dy). */
function rimScale(dx: number, dy: number, half: number): number {
  return 1 / Math.hypot(dx / half, dy / (PLINTH_RY * half));
}

/**
 * The muster's state for `link` this frame: its growth 0…1 (`emitAccMs` / `streamIntervalMs(from)`, so
 * Overdrive's ×3 and Freeze's pause come for free; 1 from the first emission until that soldier can be
 * seen) or null when nothing is drawn — a link not yet through its first tick (one that dies on it,
 * `sourceEmpty` / `targetFull`, is never drawn), or one whose first soldier is visible. Units spawn at the
 * tower's centre, so the first one is hidden by the building while it is within the wall's width
 * (WALL_HALF of the drawn body's half-width, layout `bodies`), below the roof apex and no more than 4 map px
 * in front of the anchor (draw.ts paints those before the tower) — on a lane leaving behind the tower that
 * lasts until it clears the wall's side or the roof. Called once per
 * link per frame (it advances the link's memory).
 */
export function musterGrowth(state: MarksState, link: Link, body: Rect, cam: Camera): number | null {
  if (state.time <= link.createdMs) return null;
  const from = state.towers[link.from];
  if (!from) return null;
  const every = streamIntervalMs(from, state);
  let m = musters.get(link);
  if (!m) {
    // first seen; a frame long enough (×20 speed) may already have run past the first emission
    const mul = state.boosters.some((b) => b.type === 'overdrive' && b.owner === link.owner) ? C.OVERDRIVE_MUL : 1;
    musters.set(link, (m = { last: (state.time - link.createdMs) * mul >= every ? Infinity : link.emitAccMs, unit: WAITING }));
  }
  if (m.unit === WAITING && link.emitAccMs < m.last) {
    // the first emission: the newest unit of this stream is the one the muster hands over to
    m.unit = DONE;
    for (const u of state.units) if (u.from === link.from && u.to === link.to && u.id > m.unit) m.unit = u.id;
  }
  m.last = link.emitAccMs;
  if (m.unit === WAITING) return Math.max(0, Math.min(1, link.emitAccMs / every));
  const u = m.unit === DONE ? undefined : state.units.find((v) => v.id === m!.unit);
  const road = state.roads[link.roadId];
  if (u && road) {
    // still hidden by the building: keep the muster up, so there is never a frame with neither
    const [a, b] = link.from === road.a ? [road.points[0]!, road.points[road.points.length - 1]!] : [road.points[road.points.length - 1]!, road.points[0]!];
    const y = a.y + (b.y - a.y) * u.progress;
    const at = proj(cam, a.x + (b.x - a.x) * u.progress, y);
    const p = proj(cam, from.x, from.y);
    if (y <= from.y + 4 && Math.abs(at.x - p.x) <= WALL_HALF * (body.w / 2) && at.y >= body.y) return 1;
  }
  m.unit = DONE;
  return null;
}

/**
 * AUD-F5b (GDD §2.3 "AUD-F5 2026-10-31"): the first soldier of a new stream leaves one interval after the
 * tap (1 000 ms at L1) — the sim is not changed; instead, from the frame a link has come through its first
 * tick, a soldier forms at the source's gate (the plinth rim toward the target, where the stream leaves
 * the tower's foot): a ground ring that closes with the growth (track + progress arc, 2 strokes) and an
 * owner-coloured soldier (or, from a tank factory holding ≥ TANK_WEIGHT, a tank) whose size and alpha
 * follow it — 2 fills and an ink outline. It stands at full size from the first emission until that soldier
 * can be seen (`musterGrowth`; so the hand-over has no empty frame), then is gone for good. Reduced motion: a static
 * MUSTER_DOT_ALPHA dot (owner lit, ink edge) for the same span. One per link; 0 particles; no sound
 * (the `linked` pulse stays). Clipped clear of the badges.
 */
export function drawMusters(host: BurstHost, ctx: CanvasRenderingContext2D, pal: Palette, state: MarksState, layout: MarksLayout, cam: Camera): void {
  let clipped = false;
  for (const link of state.links) {
    const from = state.towers[link.from];
    const to = state.towers[link.to];
    const body = layout.bodies.get(link.from);
    if (!from || !to || !body) continue;
    const p = proj(cam, from.x, from.y);
    const q = proj(cam, to.x, to.y);
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const dx = (q.x - p.x) / len;
    const dy = (q.y - p.y) / len;
    const half = body.w / 2;
    const k = musterGrowth(state, link, body, cam);
    if (k === null) continue;
    if (!clipped) {
      clipped = true;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-1e4, -1e4, 2e4, 2e4);
      for (const { rect: r } of layout.badges.values()) pillPath(ctx, r, 3);
      ctx.clip('evenodd');
      ctx.lineCap = 'round';
    }
    const r = rimScale(dx, dy, half);
    const x = p.x + dx * r;
    const y = p.y + 2 * WORLD_ZOOM.tower * p.s + dy * r;
    const tones = pal.ownerTones[link.owner];
    if (host.reducedMotion) {
      ctx.globalAlpha = MUSTER_DOT_ALPHA;
      ctx.beginPath();
      ctx.arc(x, y - 6 * p.s, 6 * p.s, 0, Math.PI * 2);
      ctx.fillStyle = tones.lit;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = pal.ink;
      ctx.stroke();
      continue;
    }
    // the ring on the ground: a faint paper track, the owner's lit arc closing clockwise from the top
    const rx = 13 * p.s;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3 * p.s;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * PLINTH_RY, 0, 0, Math.PI * 2);
    ctx.strokeStyle = pal.paper;
    ctx.stroke();
    if (k > 0) {
      ctx.beginPath();
      ctx.ellipse(x, y, rx, rx * PLINTH_RY, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
      ctx.strokeStyle = tones.shade;
      ctx.stroke();
    }
    if (k <= 0) continue;
    // the forming soldier (sprites.ts proportions at the units' draw scale): body + head, or hull + turret
    ctx.globalAlpha = k;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = pal.ink;
    const tank = from.kind === 'tankFactory' && from.units >= C.TANK_WEIGHT;
    const s = (tank ? TANK_RADIUS * TANK_DRAW_SCALE : SOLDIER_DRAW_SCALE) * p.s * k;
    if (tank) roundRect(ctx, { x: x - s, y: y - 0.85 * s, w: 2 * s, h: 1.25 * s }, 3 * k);
    else roundRect(ctx, { x: x - 3.6 * s, y: y - 12 * s, w: 7.2 * s, h: 11 * s }, 3.6 * s);
    ctx.fillStyle = tones.mid;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    if (tank) ctx.arc(x, y - 0.45 * s, 0.5 * s, 0, Math.PI * 2);
    else ctx.arc(x + dx * 1.2 * s, y - 15.4 * s, 4.2 * s, 0, Math.PI * 2);
    ctx.fillStyle = tones.lit;
    ctx.fill();
    ctx.stroke();
  }
  if (clipped) ctx.restore();
}
