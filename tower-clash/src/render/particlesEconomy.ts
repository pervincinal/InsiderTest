/**
 * Purchase / reward bursts (gold coins, crystals) for the shop and the result screen. Lazy chunk —
 * src/render/particles.ts loads it on the first drawn frame of a particle system and spawns / paints
 * the `coin` and `gem` kinds through `ECONOMY_BURSTS`, so the eager bundle stays under its 80 kB
 * budget. Gameplay effects (capture confetti, impacts, smoke, planks) stay in particles.ts.
 */
import type { EconomyBursts } from './particles';

export const ECONOMY_BURSTS: EconomyBursts = {
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
