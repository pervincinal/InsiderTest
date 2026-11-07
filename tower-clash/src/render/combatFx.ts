/**
 * Combat feedback of the lazy particle chunk (ART_DIRECTION §5): AUD-F11 the artillery shot's anticipation
 * and weight, AUD-F13 the reduced-motion capture halo, AUD-F15 the player's lost tower and FEEL-1-2 the
 * airstrike. Imported only by src/render/particlesEconomy.ts, so it rides in that lazy chunk: src/render/particles.ts
 * reaches it through `ECONOMY_BURSTS.shell` / `.captured` (from `onEvents`), `.strike` / `.shown` (the airstrike
 * and its badge count-down) and `.marks` (once a frame, after the badges).
 * Before the chunk is in an artillery kill is the grey death puff and the barrel holds its default aim.
 */
import type { GameState, Owner, SimEvent, Tower } from '../sim/types';
import { C } from '../sim/constants';
import { unitPosition } from '../sim/step';
import type { BurstHost, MarksLayout, MarksState } from './particles';
import type { Camera } from './camera';
import { playCamera, proj, projAngle, unproj } from './camera';
import type { Palette } from './palette';
import { artilleryMuzzle } from './sprites';
import { boosterColor } from './hud';
import type { Rect } from './widgets';
import { roundRect } from './widgets';

/** AUD-F11: the barrel turns onto its next target over AIM_MS (ease-out) before the shot… */
export const AIM_MS = 120;
/** …then kicks back RECOIL_PX along the barrel (and the tower RECOIL_NUDGE_PX the other way), settling over RECOIL_MS. */
export const RECOIL_MS = 60;
export const RECOIL_PX = 3;
export const RECOIL_NUDGE_PX = 1;
/** The shell's tracer lives TRACER_MS: its head reaches the victim at 40 %, the fading trail follows it in. */
export const TRACER_MS = 90;
/** Tracer core width (logical px: 2 CSS px on a 360 px wide phone), over an ink edge 1.8 × as wide. */
export const TRACER_PX = 4;
/** A shot whose barrel was more than this off the victim (no anticipation: the target walked in on the firing tick) turns first. */
export const LATE_RAD = 0.35;
/** The barrel's resting aim before a gun has aimed (sprites.ts `drawArtillery`'s default, screen ≈ map on the flat map). */
const REST_AIM = -0.6;
/** AUD-F13: under reduced motion the captured badge's halo fades (opacity only) over HALO_RM_MS. */
export const HALO_RM_MS = 400;
/** AUD-F15: the player's lost tower flashes a red rim and a crack over LOST_MS, and the world jolts LOST_SHAKE_PX toward the attacker. */
export const LOST_MS = 250;
export const LOST_SHAKE_PX = 2;
/** The capture shake's length (particles.ts SHAKE_MS): a running shake stronger than a nudge is left alone. */
const SHAKE_MS = 320;

/**
 * Start a `px` world shake (along `dir`, AUD-F15; the capture's loop when null) unless the one running is
 * still stronger — a 2 px nudge never cuts a capture's 6 px short.
 */
export function shakeBy(host: BurstHost, px: number, nowMs: number, dir: { x: number; y: number } | null = null): void {
  const t = (nowMs - host.shakeAt) / SHAKE_MS;
  if (t >= 0 && t < 1 && host.shakeAmp * (1 - t) * (1 - t) > px) return;
  host.shakeAt = nowMs;
  host.shakeAmp = px;
  host.shakeDir = dir;
}

/** One gun's barrel: easing from `from` to `to` (map radians) since `at`; its recoil starts at `fireAt`. */
interface Gun {
  from: number;
  to: number;
  at: number;
  fireAt: number;
}

/** Per particle system: the guns, the pending late shots, the reduced-motion halos / one-frame flashes and the lost towers. */
interface CombatState {
  guns: Map<string, Gun>;
  pending: { at: number; fire: () => void }[];
  halos: Map<string, number>;
  flashes: { x: number; y: number; r: number; color: string }[];
  lost: Map<string, number>;
  /** FEEL-1-2: the airstrikes of the last STRIKE_RM_MS, by tower. */
  strikes: Map<string, Strike>;
}
const states = new WeakMap<BurstHost, CombatState>();
function stateOf(host: BurstHost): CombatState {
  let s = states.get(host);
  if (!s) states.set(host, (s = { guns: new Map(), pending: [], halos: new Map(), flashes: [], lost: new Map(), strikes: new Map() }));
  return s;
}

/** `a` wrapped into (−π, π]. */
function wrap(a: number): number {
  return a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
}

/** The barrel's aim at `nowMs` (ease-out cubic from `from` to `to` over AIM_MS, the short way round). */
export function gunAim(g: Gun, nowMs: number): number {
  const k = Math.max(0, Math.min(1, (nowMs - g.at) / AIM_MS));
  return g.from + wrap(g.to - g.from) * (1 - (1 - k) ** 3);
}

/** Map angle from the gun's pivot (26 px over its anchor) to a target 6 px over (x, y) — the shell's line (ART-22). */
export function aimAngle(gun: Pick<Tower, 'x' | 'y'>, x: number, y: number): number {
  return Math.atan2(y - 6 - (gun.y - 26), x - gun.x);
}

/** Turn `id`'s barrel toward `a` (from where it points now); reduced motion: it is simply there. */
function turn(host: BurstHost, cs: CombatState, id: string, a: number, nowMs: number): Gun {
  let g = cs.guns.get(id);
  if (!g) cs.guns.set(id, (g = { from: host.aims.get(id) ?? REST_AIM, to: a, at: nowMs, fireAt: -Infinity }));
  else if (Math.abs(wrap(a - g.to)) > 0.01) {
    g.from = gunAim(g, nowMs);
    g.to = a;
    g.at = nowMs;
  }
  if (host.reducedMotion) g.from = g.to = a;
  return g;
}

/**
 * The unit `gun` will most likely shoot next: the sim's rule (step.ts `artillery`: the nearest foe within
 * ARTILLERY_RANGE) widened by what a unit walks in AIM_MS, so a column about to enter the range is
 * already tracked. Null when nothing is near. Read only.
 */
export function nextTarget(state: Pick<GameState, 'units' | 'roads'>, gun: Tower): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = C.ARTILLERY_RANGE + (C.UNIT_SPEED * AIM_MS) / 1000;
  for (const u of state.units) {
    if (u.owner === gun.owner) continue;
    const p = unitPosition(state as GameState, u);
    const d = Math.hypot(p.x - gun.x, p.y - gun.y);
    if (d <= bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
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

/** The recoil of `gun` at `nowMs` (barrel px back, the tower's nudge against the barrel's screen direction), or null at rest. */
function recoilAt(g: Gun, gun: Tower, nowMs: number, cam: Camera): { r: number; dx: number; dy: number } | null {
  const k = (nowMs - g.fireAt) / RECOIL_MS;
  if (k < 0 || k >= 1) return null;
  const r = RECOIL_PX * (1 - k);
  const sa = projAngle(cam, gun.x, gun.y, gunAim(g, nowMs));
  const n = (RECOIL_NUDGE_PX * r) / RECOIL_PX;
  return { r, dx: -Math.cos(sa) * n, dy: -Math.sin(sa) * n * 0.5 };
}

/**
 * AUD-F11: an artillery kill (`unitDied`, cause artillery). The gun's barrel was already turning onto it
 * (`combatFrame`, from the sim's cooldown); if it was not (the victim walked in on the firing tick), it
 * turns now and the shot follows AIM_MS later. The shot: a muzzle flash, a TRACER_MS owner-lit tracer
 * with an ink edge and a fading trail, then at the victim an impact ring in the gun owner's colour, a
 * lit flash and four sparks (no grey puff) — 8 particles, one landing token; the barrel recoils RECOIL_PX.
 * Reduced motion: the barrel is on the victim at once, and the muzzle and the victim flash for one frame.
 */
export function shellShot(host: BurstHost, state: GameState, ev: Extract<SimEvent, { type: 'unitDied' }>, pal: Palette, nowMs: number): boolean {
  const gun = nearestGun(state, ev.x, ev.y, ev.owner);
  if (!gun) return false;
  const cs = stateOf(host);
  const a = aimAngle(gun, ev.x, ev.y);
  const was = cs.guns.get(gun.id);
  const late = !was || Math.abs(wrap(a - gunAim(was, nowMs))) > LATE_RAD;
  const g = turn(host, cs, gun.id, a, nowMs);
  host.aims.set(gun.id, gunAim(g, nowMs));
  // ART-22: the shell leaves the barrel as drawn (its aim now; a late shot's once it has turned) — the
  // projected gun plus the sprite's muzzle offset × depth, in screen space (the tracer is drawn untransformed)
  const cam = playCamera();
  const p = proj(cam, gun.x, gun.y);
  const m = artilleryMuzzle(gun.level, projAngle(cam, gun.x, gun.y, late ? a : gunAim(g, nowMs)));
  const mx = p.x + m.dx * p.s;
  const my = p.y + m.dy * p.s;
  const v = proj(cam, ev.x, ev.y - 6);
  const color = pal.owners[gun.owner];
  const lit = pal.ownerTones[gun.owner].lit;
  if (host.reducedMotion) {
    cs.flashes.push({ x: mx, y: my, r: 9 * p.s, color: '#fff2a8' }, { x: v.x, y: v.y, r: 9 * v.s, color: lit });
    return true;
  }
  const fire = (): void => {
    g.fireAt = nowMs + (late ? AIM_MS : 0);
    const r = recoilAt(g, gun, g.fireAt, cam);
    if (r) host.recoil.set(gun.id, r);
    const o = unproj(cam, mx, my);
    host.push(host.make('flash', o.x, o.y, '#fff2a8', 110, 11));
    const tr = host.make('tracer', mx, my, lit, TRACER_MS, TRACER_PX * p.s);
    tr.color2 = pal.ink;
    tr.x2 = v.x;
    tr.y2 = v.y;
    host.push(tr);
    host.push(host.make('impact', ev.x, ev.y, color, 300, 10));
    host.push(host.make('flash', ev.x, ev.y - 6, lit, 130, 8));
    host.kick(ev.x, ev.y, [color, lit, color, '#fffaf0'], 3, 0.8);
  };
  if (late) cs.pending.push({ at: nowMs + AIM_MS, fire });
  else fire();
  return true;
}

/**
 * FEEL-1-2 airstrike chain, from the targeting tap (wall clock; the sim applied −AIRSTRIKE_DAMAGE on the
 * next tick): the shell whistles in and its shadow falls on the target for STRIKE_FALL_MS (draw-only
 * anticipation), then the impact; the badge counts the loss down from STRIKE_FALL_MS to STRIKE_COUNT_MS and
 * shows the sim's number from then on (`strikeShown`). The impact: the world slams STRIKE_SHAKE_PX down, the
 * phone buzzes (medium), a paper core + gold flash, a 1.5 × landing ring (STRIKE_RING_PX) in the booster
 * colour, 6 sparks and 6 soot puffs. Reduced motion: a static flash + ring for STRIKE_RM_MS from the tap,
 * the badge at its number at once, no shadow, no shake.
 */
export const STRIKE_FALL_MS = 150;
export const STRIKE_COUNT_MS = 250;
export const STRIKE_SHAKE_PX = 3;
export const STRIKE_RING_PX = 27;
export const STRIKE_RM_MS = 300;
/** Where the shell starts its dive, relative to its landing point on the plinth (logical px × depth). */
const STRIKE_DIVE = { x: 120, y: -220 };

/** One airstrike on a tower: when it was cast, the units and owner the tower had then. */
interface Strike {
  at: number;
  from: number;
  owner: Owner;
  x: number;
  y: number;
}

/** FEEL-1-2: an airstrike on `t` (play.ts `airstrike`, at the tap; `buzz`: the medium haptic, Settings → Vibration already applied). */
export function airstrikeFx(host: BurstHost, t: Tower, pal: Palette, nowMs: number, buzz: () => void): void {
  const cs = stateOf(host);
  cs.strikes.set(t.id, { at: nowMs, from: t.units, owner: t.owner, x: t.x, y: t.y });
  if (host.reducedMotion) return buzz();
  const color = boosterColor(pal, 'airstrike');
  const hitAt = nowMs + STRIKE_FALL_MS;
  cs.pending.push({
    at: hitAt,
    fire: () => {
      buzz();
      shakeBy(host, STRIKE_SHAKE_PX, hitAt, { x: 0, y: 1 });
      host.push(host.make('flash', t.x, t.y - 14, pal.gold, 170, 20));
      host.push(host.make('flash', t.x, t.y - 14, '#fffaf0', 140, 12));
      host.push(host.make('impact', t.x, t.y, color, 420, STRIKE_RING_PX));
      host.kick(t.x, t.y, [color, pal.gold, '#fffaf0', color, pal.gold, '#fffaf0'], 4.5, 1.4);
      for (const dx of [-16, 16]) host.death(t.x + dx, t.y - 2, '#d9dde3', pal.metal.lit); // soot: grey smoke either side
    },
  });
}

/**
 * FEEL-1-2: the units `t`'s badge shows — while an airstrike on it counts down, the sim's number plus what is
 * left of the loss (at most AIRSTRIKE_DAMAGE; the cast count until the impact, then linear to 0 by
 * STRIKE_COUNT_MS), so it is never below the sim's number nor more than STRIKE_COUNT_MS late; the sim's number
 * at once under reduced motion, after STRIKE_COUNT_MS and when the tower changed hands.
 */
export function strikeShown(host: BurstHost, t: Tower, nowMs: number): number {
  const s = stateOf(host).strikes.get(t.id);
  const k = s ? Math.max(0, (nowMs - s.at - STRIKE_FALL_MS) / (STRIKE_COUNT_MS - STRIKE_FALL_MS)) : 1;
  if (!s || k >= 1 || host.reducedMotion || t.owner !== s.owner) return t.units;
  return t.units + Math.round(Math.max(0, Math.min(C.AIRSTRIKE_DAMAGE, s.from - t.units)) * (1 - k));
}

/**
 * FEEL-1-2, `combatFrame`: each strike's anticipation — a falling shell (ink-edged metal, booster-colour fins,
 * a pale streak) dropping onto the roof, ease-in, and its shadow darkening and tightening round the plinth —
 * or under reduced motion the static flash + ring; strikes are forgotten after STRIKE_RM_MS.
 */
function drawStrikes(ctx: CanvasRenderingContext2D, pal: Palette, strikes: Map<string, Strike>, nowMs: number, cam: Camera, motion: boolean): void {
  const color = boosterColor(pal, 'airstrike');
  for (const [id, s] of strikes) {
    const e = nowMs - s.at;
    if (e >= STRIKE_RM_MS || e < 0) {
      if (e >= STRIKE_RM_MS) strikes.delete(id);
      continue;
    }
    const p = proj(cam, s.x, s.y);
    const z = p.s;
    ctx.globalAlpha = 1;
    if (!motion) {
      ctx.fillStyle = pal.gold;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(p.x, p.y - 14 * z, 26 * z, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 3 * z, 44 * z, 20 * z, 0, 0, Math.PI * 2);
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 7 * z;
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = 4 * z;
      ctx.stroke();
      continue;
    }
    if (e >= STRIKE_FALL_MS) continue;
    const k = e / STRIKE_FALL_MS;
    // the shadow: wide and faint when the shell is high, tight and dark as it lands
    ctx.fillStyle = pal.ink;
    ctx.globalAlpha = 0.1 + 0.3 * k;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 3 * z, (56 - 24 * k) * z, (25 - 11 * k) * z, 0, 0, Math.PI * 2);
    ctx.fill();
    // the shell: diving in from the upper right (beside the badge, so a tower at the map's top edge shows it
    // too) onto the plinth, accelerating (ease-in), nose first, a pale streak behind it
    const f = 1 - k * k;
    ctx.save();
    ctx.translate(p.x + STRIKE_DIVE.x * f * z, p.y + (STRIKE_DIVE.y * f - 30) * z);
    ctx.rotate(Math.atan2(-STRIKE_DIVE.y, -STRIKE_DIVE.x) - Math.PI / 2);
    ctx.scale(z, z);
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = '#fffaf0';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, -64);
    ctx.lineTo(0, -16);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-10, -20);
    ctx.lineTo(10, -20);
    ctx.lineTo(0, -4);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.metal.mid;
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * The shell tracer (`tracer` particle, screen space: x / y the muzzle, x2 / y2 the victim): the head runs
 * muzzle → victim over the first 40 % of its life, the tail follows from 20 % on, the whole fading out (ease-in:
 * near full strength while it flies) — an ink edge under an owner-lit core, the trail drawn in three steps of
 * rising opacity toward the head.
 */
export function drawTracer(ctx: CanvasRenderingContext2D, p: { x: number; y: number; x2: number; y2: number; size: number; color: string; color2: string }, t: number): void {
  const fade = 1 - t * t;
  const head = Math.min(1, t / 0.4);
  const tail = Math.max(0, (t - 0.2) / 0.8);
  if (head <= tail) return;
  const at = (k: number): [number, number] => [p.x + (p.x2 - p.x) * k, p.y + (p.y2 - p.y) * k];
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const [ax, ay] = at(tail + ((head - tail) * i) / 3);
    const [bx, by] = at(tail + ((head - tail) * (i + 1)) / 3);
    ctx.globalAlpha = fade * (0.5 + 0.25 * i);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.strokeStyle = p.color2;
    ctx.lineWidth = p.size * 1.8;
    ctx.stroke();
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.size;
    ctx.stroke();
  }
}

/**
 * After `capture`: AUD-F13 — under reduced motion the badge halo is kept (`combatFrame`: an opacity fade
 * over HALO_RM_MS, no scale, no particles); AUD-F15 — when the tower was the player's, its crack flash for
 * LOST_MS and (motion) a LOST_SHAKE_PX world jolt along the line to the attacker's tower (the link it
 * attacked along, else its nearest tower), never cutting a stronger shake short.
 */
export function towerCaptured(host: BurstHost, state: GameState, t: Tower, ev: Extract<SimEvent, { type: 'capture' }>, nowMs: number): void {
  const cs = stateOf(host);
  if (host.reducedMotion) cs.halos.set(t.id, nowMs);
  if (ev.from !== 'player' || ev.by === 'player') return;
  cs.lost.set(t.id, nowMs);
  if (host.reducedMotion) return;
  const src = attackerTower(state, t, ev.by);
  if (!src) return;
  const cam = playCamera();
  const a = proj(cam, t.x, t.y);
  const b = proj(cam, src.x, src.y);
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  if (l > 0) shakeBy(host, LOST_SHAKE_PX, nowMs, { x: (b.x - a.x) / l, y: (b.y - a.y) / l });
}

/** Where `by` attacked `t` from: the source of its link into `t`, else its nearest other tower. */
export function attackerTower(state: Pick<GameState, 'towers' | 'links'>, t: Tower, by: Owner): Tower | null {
  for (const l of state.links) if (l.to === t.id && l.owner === by && state.towers[l.from]) return state.towers[l.from]!;
  let best: Tower | null = null;
  let bestD = Infinity;
  for (const id in state.towers) {
    const o = state.towers[id]!;
    const d = Math.hypot(o.x - t.x, o.y - t.y);
    if (o.owner === by && o.id !== t.id && d < bestD) [best, bestD] = [o, d];
  }
  return best;
}

/**
 * Once a frame, after the badges and chips (`ECONOMY_BURSTS.marks`): AUD-F11 the barrels — turned onto the
 * unit each gun will shoot once its cooldown is within AIM_MS, and the recoil of a recent shot — and the late
 * shots that are due; under reduced motion the one-frame shot flashes; AUD-F13 the reduced-motion capture
 * halos; AUD-F15 the lost towers' rims and cracks and FEEL-1-2 the airstrikes' falling shells and shadows (or
 * the reduced-motion flash + ring), clear of every badge and chip; a strike's impact is one of the due shots.
 */
export function combatFrame(host: BurstHost, ctx: CanvasRenderingContext2D, pal: Palette, state: MarksState, layout: MarksLayout, nowMs: number, cam: Camera): void {
  const cs = stateOf(host);
  const motion = !host.reducedMotion;
  for (const id in state.towers) {
    const t = state.towers[id]!;
    if (t.kind !== 'artillery' || t.owner === 'neutral') continue;
    if (motion && t.artilleryCooldownMs <= AIM_MS) {
      const u = nextTarget(state, t);
      if (u) turn(host, cs, id, aimAngle(t, u.x, u.y), nowMs);
    }
    const g = cs.guns.get(id);
    if (!g) continue;
    host.aims.set(id, gunAim(g, nowMs));
    const r = motion ? recoilAt(g, t, nowMs, cam) : null;
    if (r) host.recoil.set(id, r);
    else host.recoil.delete(id);
  }
  if (cs.pending.length) {
    const due = cs.pending.filter((s) => s.at <= nowMs);
    cs.pending = cs.pending.filter((s) => s.at > nowMs);
    for (const s of due) s.fire();
  }
  if (!cs.flashes.length && !cs.halos.size && !cs.lost.size && !cs.strikes.size) return;
  ctx.save();
  // reduced motion: each shot flash shows for exactly one frame
  for (const f of cs.flashes) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  }
  cs.flashes.length = 0;
  for (const [id, at] of cs.halos) {
    const k = (nowMs - at) / HALO_RM_MS;
    const t = state.towers[id];
    const b = layout.badges.get(id);
    if (k >= 1 || !t) cs.halos.delete(id);
    else if (b && k >= 0) {
      // the motion halo's look (sprites.ts `drawBadge` `flash`) at its middle width, fading only
      const r = b.rect;
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = pal.ownerTones[t.owner].lit;
      ctx.lineWidth = 5;
      roundRect(ctx, { x: r.x - 3, y: r.y - 3, w: r.w + 6, h: r.h + 6 }, r.h / 2 + 3);
      ctx.stroke();
    }
  }
  if (cs.lost.size || cs.strikes.size) {
    ctx.beginPath();
    ctx.rect(-1e4, -1e4, 2e4, 2e4);
    for (const { rect: r } of layout.badges.values()) ctx.rect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
    for (const { rect: r } of layout.chips) ctx.rect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
    ctx.clip('evenodd');
    for (const [id, at] of cs.lost) {
      const k = (nowMs - at) / LOST_MS;
      const body = layout.bodies.get(id);
      if (k >= 1) cs.lost.delete(id);
      else if (body && k >= 0) drawLost(ctx, pal, body, motion ? 1 - k * k : 1, motion);
    }
    drawStrikes(ctx, pal, cs.strikes, nowMs, cam, motion);
  }
  ctx.restore();
}

/**
 * AUD-F15: a lost tower's damage flash over its drawn `body` at opacity `f` — a red rim (mine red over an
 * ink edge: shape, not hue alone, so it reads in the colour-blind palette too), and with motion a faint red
 * wash and a jagged ink crack with a paper edge down the wall. Reduced motion: the rim only (static).
 */
export function drawLost(ctx: CanvasRenderingContext2D, pal: Palette, body: Rect, f: number, motion: boolean): void {
  const z = body.w / 76;
  const rim: Rect = { x: body.x - 4 * z, y: body.y - 4 * z, w: body.w + 8 * z, h: body.h + 8 * z };
  ctx.globalAlpha = f;
  roundRect(ctx, rim, 16 * z);
  if (motion) {
    ctx.globalAlpha = f * 0.22;
    ctx.fillStyle = pal.mine;
    ctx.fill();
    ctx.globalAlpha = f;
  }
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 7 * z;
  ctx.stroke();
  ctx.strokeStyle = pal.mine;
  ctx.lineWidth = 4 * z;
  ctx.stroke();
  if (!motion) return;
  const cx = body.x + body.w / 2;
  const y0 = body.y + body.h * 0.3;
  const h = body.h * 0.5;
  ctx.beginPath();
  ctx.moveTo(cx + 2 * z, y0);
  ctx.lineTo(cx - 6 * z, y0 + h * 0.3);
  ctx.lineTo(cx + 5 * z, y0 + h * 0.55);
  ctx.lineTo(cx - 3 * z, y0 + h);
  ctx.moveTo(cx + 5 * z, y0 + h * 0.55);
  ctx.lineTo(cx + 12 * z, y0 + h * 0.7);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 4 * z;
  ctx.stroke();
  ctx.strokeStyle = '#fffaf0';
  ctx.lineWidth = 1.5 * z;
  ctx.stroke();
}
