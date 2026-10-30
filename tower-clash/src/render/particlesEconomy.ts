/**
 * Purchase / reward bursts (gold coins, crystals) for the shop and the result screen, and (AUD-F2) the
 * mine blast. Lazy chunk — src/render/particles.ts loads it on the first drawn frame of a particle
 * system and spawns / paints the `coin` and `gem` kinds and mine kills through `ECONOMY_BURSTS`, so the
 * eager bundle stays under its budget. The other gameplay effects (capture chips, impacts, smoke,
 * planks) stay in particles.ts.
 */
import type { BurstHost, EconomyBursts } from './particles';
import { proj } from './camera';
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
   * mine is spent and has no chip, round the mine itself.
   */
  marks(host, ctx, pal, mines, chips, nowMs, cam) {
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
