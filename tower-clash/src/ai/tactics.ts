/**
 * Shared decision rules (rules v3, GDD §2.5). One `Ctx` per owner per AI tick collects the commands and
 * remembers what this tick already decided (links issued, links ended, towers that started a stream) so
 * that later rules plan on top of earlier ones. Every rule is a pure function of the visible state.
 *
 * Under v3 a stream costs nothing but the source's growth and lands its rate whatever the source holds,
 * so the decisions are:
 *   maintain — end streams that no longer earn their keep (hopeless attacks, supply the target does not
 *              need, everything from a tower shot below `RETREAT_UNITS` that is not winning its lane);
 *   defend   — a tower that falls to what is coming is reinforced by neighbours whose streams make it
 *              hold, else the attacker's *source* is besieged from other towers (its garrison is what
 *              falls, and its capture ends the stream), else the tower streams back on the same lane when
 *              its rate is at least the attacker's (the streams cancel 1:1 and nothing lands);
 *   attack   — towers with a free link stream at the hostile tower that falls soonest within the plan
 *              horizon, stacking links from several towers when one cannot break it; a tower with no
 *              takeable target stays unlinked and grows.
 */
import type { Command, GameState, Link, Owner, Tower } from '../sim/index';
import { capacityOf, isUnderFire, linksFrom, maxLinksOf } from '../sim/index';
import {
  allLinks,
  atMaxLevel,
  bySpeed,
  contestHeld,
  contestOf,
  hasLink,
  holdMs,
  isCapped,
  landsEnough,
  laneFlow,
  linkRate,
  neighbours,
  ownedTowers,
  reinforcePlan,
  rivalRate,
  roadBetween,
  siegeOf,
  siegePlan,
  type Plan,
  type PlannedLink,
  type Siege,
  type SiegeOptions,
  underSiege,
} from './common';

/**
 * A tower under fire holding fewer units than this ends every stream that is not winning its lane: it
 * cannot grow while linked, and when the fire stops it should (GDD §2.5 unlink rules).
 */
export const RETREAT_UNITS = 3;
/** An attack that is landing is kept at least this long before it is judged hopeless (no tick-by-tick ping-pong). */
export const MIN_ATTACK_MS = 5_000;
/**
 * A linked tower at capacity below its top level cannot auto-upgrade; it drops its links for one AI tick
 * to take the level (faster streams, one more link) when it survives at least this long without them.
 * The tower is marked used for the rest of the tick so no rule re-links it before the sim's next
 * `generation` sees it unlinked (AI-6: re-linking in the same tick kept it linked forever).
 */
export const UPGRADE_BREAK_SAFE_MS = 3_000;

/** Optional hook for tooling: called with the rule that produced each command. */
export type RuleTrace = (rule: string, cmd: Command) => void;

export interface Ctx {
  state: GameState;
  owner: Owner;
  cmds: Command[];
  /** Links issued this tick. */
  planned: PlannedLink[];
  /** Links ended this tick. */
  ended: Link[];
  /** Towers that started a stream this tick (one new stream per tower per tick, readable ribbons). */
  used: Set<string>;
  /** Towers whose decisions are skipped this tick (aggression gate); they neither link nor unlink. */
  skipped: Set<string>;
  rule: string;
  trace?: RuleTrace;
}

export function newCtx(state: GameState, owner: Owner, trace?: RuleTrace): Ctx {
  return { state, owner, cmds: [], planned: [], ended: [], used: new Set(), skipped: new Set(), rule: '', trace };
}

export function options(ctx: Ctx): SiegeOptions {
  return { planned: ctx.planned, exclude: ctx.ended };
}

/** `siegeOf` on top of this tick's decisions. */
export function siege(ctx: Ctx, target: Tower, extra: readonly PlannedLink[] = []): Siege {
  return siegeOf(ctx.state, target, { planned: extra.length ? [...ctx.planned, ...extra] : ctx.planned, exclude: ctx.ended });
}

/** Active links of `from` after this tick's unlinks. */
export function activeLinks(ctx: Ctx, from: string): Link[] {
  return linksFrom(ctx.state, from).filter((l) => !ctx.ended.includes(l));
}

/** Link slots the tower can still fill this tick: level limit (or the bot's cap) minus active and planned links. */
export function freeSlots(ctx: Ctx, tower: Tower, cap = Infinity): number {
  const limit = Math.min(cap, maxLinksOf(tower));
  return Math.max(0, limit - activeLinks(ctx, tower.id).length - ctx.planned.filter((p) => p.from === tower.id).length);
}

export function issueLink(ctx: Ctx, from: Tower, to: string): void {
  const cmd: Command = { type: 'link', owner: ctx.owner, from: from.id, to };
  ctx.cmds.push(cmd);
  ctx.planned.push({ owner: ctx.owner, from: from.id, to });
  ctx.used.add(from.id);
  ctx.trace?.(ctx.rule, cmd);
}

export function issueUnlink(ctx: Ctx, link: Link): void {
  if (ctx.ended.includes(link)) return;
  const cmd: Command = { type: 'unlink', owner: ctx.owner, from: link.from, to: link.to };
  ctx.cmds.push(cmd);
  ctx.ended.push(link);
  ctx.trace?.(ctx.rule, cmd);
}

/** Issue every link of a plan (sources are marked used). */
export function issuePlan(ctx: Ctx, plan: Plan): void {
  for (const l of plan.links) {
    const from = ctx.state.towers[l.from];
    if (from) issueLink(ctx, from, l.to);
  }
}

/** Own towers that may still act this tick (not skipped) and hold at least one unit (a stream needs soldiers). */
export function actors(ctx: Ctx): Tower[] {
  return ownedTowers(ctx.state, ctx.owner).filter((t) => !ctx.skipped.has(t.id) && t.units >= 1);
}

/**
 * True when `link` shields its source: a hostile stream runs the other way on the same lane, so the two
 * cancel 1:1 in weight. Ours at least as fast: nothing lands on us. Ours slower (a *partial* shield):
 * only their surplus lands — still better than their whole stream, and the tower grows nothing while
 * under fire anyway, so the link costs it nothing (2026-09-22: dropping an out-rated shield the moment
 * the enemy reached L2 let its full stream land and lost level 13 under thinWalls / lean).
 */
export function isShield(ctx: Ctx, link: PlannedLink): boolean {
  const from = ctx.state.towers[link.from];
  const to = ctx.state.towers[link.to];
  if (!from || !to || to.owner === ctx.owner) return false;
  return ctx.state.links.some((l) => l.from === link.to && l.to === link.from && l.owner !== ctx.owner && !ctx.ended.includes(l));
}

/**
 * True when the supply line `link` (into an own tower) is what keeps its target standing, or the target
 * is still under siege (a hostile stream or column heads for it) — the line stays until the attack is over.
 */
export function isReinforcement(ctx: Ctx, link: Link): boolean {
  const to = ctx.state.towers[link.to];
  if (!to || to.owner !== ctx.owner) return false;
  if (siegeOf(ctx.state, to, { planned: ctx.planned, exclude: [...ctx.ended, link] }).fallsAtMs !== Infinity) return true;
  return underSiege(ctx.state, to);
}

export interface MaintainConfig {
  /** An attack whose target does not fall within this is hopeless and ends (unless it shields). */
  hopelessMs: number;
  /** Whether a supply line into an own tower that is not a reinforcement should go on. */
  keepSupply: (ctx: Ctx, source: Tower, target: Tower, link: Link) => boolean;
  /**
   * A stream into a contested neutral ends when the parity race is lost (`contestOf`): the rival lands
   * the flipping unit and we do not take the tower back within this margin (default 0: pure parity).
   */
  contestMarginMs?: number;
}

/** Rule "maintain" for one tower (see file header). */
export function maintain(ctx: Ctx, tower: Tower, cfg: MaintainConfig): void {
  ctx.rule = 'maintain';
  const state = ctx.state;
  const links = activeLinks(ctx, tower.id);
  if (links.length === 0) return;
  // Upgrade break: at capacity below the top level, drop every link for a tick to take the level (the
  // sim upgrades an unlinked tower at capacity on its next tick, under fire or not); nothing re-links
  // the tower this tick (`used`), so the sim sees it unlinked.
  if (!atMaxLevel(tower) && tower.units >= capacityOf(tower, state)) {
    const without = siegeOf(state, tower, { planned: ctx.planned, exclude: [...ctx.ended, ...links] }).fallsAtMs;
    if (without > UPGRADE_BREAK_SAFE_MS) {
      ctx.rule = 'upgrade';
      for (const link of links) issueUnlink(ctx, link);
      ctx.used.add(tower.id);
      return;
    }
  }
  const retreat = isUnderFire(state, tower) && tower.units < RETREAT_UNITS;
  for (const link of links) {
    const target = state.towers[link.to];
    if (!target) continue;
    if (target.owner === ctx.owner) {
      if (isReinforcement(ctx, link)) continue;
      if (retreat || !cfg.keepSupply(ctx, tower, target, link)) issueUnlink(ctx, link);
      continue;
    }
    const shield = isShield(ctx, link);
    const flow = laneFlow(state, link, [...state.links.filter((l) => !ctx.ended.includes(l)), ...ctx.planned]);
    const landing = flow !== undefined && landsEnough(flow);
    const falls = landing ? siege(ctx, target).fallsAtMs : Infinity;
    if (target.owner === 'neutral' && landing) {
      // A contested neutral goes to whoever lands the flipping unit; feeding a rival's capture is waste —
      // unless we take it straight back from the rival's garrison of 1 (`contestMarginMs`, AI-8c).
      const contest = contestOf(state, target, options(ctx));
      if (contest.winner !== undefined && !contestHeld(contest, ctx.owner, cfg.contestMarginMs ?? 0)) {
        issueUnlink(ctx, link);
        continue;
      }
    }
    if (retreat) {
      // Keep only a stream that is winning its lane: shielding, or landing on a target that falls in time.
      if (!(shield || (landing && falls <= cfg.hopelessMs))) issueUnlink(ctx, link);
      continue;
    }
    if (shield) continue;
    if (!landing) {
      issueUnlink(ctx, link);
      continue;
    }
    if (falls > cfg.hopelessMs && state.time - link.createdMs >= MIN_ATTACK_MS) issueUnlink(ctx, link);
  }
}

export interface DefendConfig {
  /** Plan horizon for a counter-siege of the attacker's source. */
  counterMs: number;
  /** Link cap per tower (personality readability caps). */
  cap?: number;
  /** Extra sources a rule may not use (e.g. the reference player's growing keep) — defence ignores it by default. */
  mayHelp?: (tower: Tower) => boolean;
  /**
   * A shield may reclaim the tower's own reinforcement line when that makes the tower hold (its capture
   * would end the line anyway — AI-7b). Off: a reinforcement is never reclaimed (the enemies' v3 defence).
   */
  reclaimReinforcement?: boolean;
  /**
   * Finish the capture (AI-8b): an attack whose target falls within this is not reclaimed for a shield
   * unless the tower falls before the capture completes even with the shield in its place. Off (the
   * enemies): an attack is reclaimed whenever its target outlives the tower.
   */
  finishMs?: number;
}

/**
 * Links of `tower` a shield may replace: supply that is not a reinforcement, an attack whose target
 * outlives the tower, and — last, with `reclaimReinforcement` — a reinforcement: the tower's capture
 * would end it anyway (`sourceLost`), so a falling tower reclaims its own supply line to save itself
 * (AI-7b: "it loses its last tower while its only link reinforces another"). With `finishMs`, an
 * attack about to complete is kept unless the shield in its place keeps the tower standing past the
 * capture (a shield that comes too late costs the capture and saves nothing).
 */
function reclaimableFor(ctx: Ctx, tower: Tower, fallsAt: number, shield: PlannedLink, reclaimReinforcement: boolean, finishMs = 0): Link | undefined {
  let reinforcement: Link | undefined;
  for (const link of activeLinks(ctx, tower.id)) {
    const target = ctx.state.towers[link.to];
    if (!target) continue;
    if (target.owner === ctx.owner) {
      if (!isReinforcement(ctx, link)) return link;
      reinforcement ??= link;
      continue;
    }
    if (isShield(ctx, link)) continue;
    const done = siege(ctx, target).fallsAtMs;
    if (done <= fallsAt) continue; // the capture completes first: keep it
    if (done <= finishMs) {
      const shielded = siegeOf(ctx.state, tower, { planned: [...ctx.planned, shield], exclude: [...ctx.ended, link] }).fallsAtMs;
      if (shielded < done) continue; // the tower falls before the capture completes even shielded: finish it
    }
    return link;
  }
  if (!reclaimReinforcement || !reinforcement) return undefined;
  // A reinforcement is given up only when the shield in its place makes the tower hold: losing the
  // tower would end the line anyway, but trading a held neighbour for a tower that falls regardless is worse.
  const held = siegeOf(ctx.state, tower, { planned: [...ctx.planned, shield], exclude: [...ctx.ended, reinforcement] }).fallsAtMs === Infinity;
  return held ? reinforcement : undefined;
}

/**
 * Rule "defend" for one own tower: counter the attackers' sources (their capture ends the siege for
 * good) → reinforce when the tower would still fall before the counter lands → shield. Returns true
 * when the tower was falling and something was done about it.
 */
export function defend(ctx: Ctx, tower: Tower, cfg: DefendConfig): boolean {
  const state = ctx.state;
  const cap = cfg.cap ?? Infinity;
  const s0 = siege(ctx, tower);
  if (s0.fallsAtMs === Infinity) return false;
  const mayHelp = cfg.mayHelp ?? (() => true);
  const helpers = () => actors(ctx).filter((t) => t.id !== tower.id && !ctx.used.has(t.id) && mayHelp(t) && freeSlots(ctx, t, cap) > 0);

  // 1) counter: besiege the attackers' sources from other towers (a linked source does not grow: its garrison is what falls).
  ctx.rule = 'counter';
  let answered = false;
  let counterDoneMs = Infinity;
  const attackers = state.links
    .filter((l) => l.to === tower.id && l.owner !== ctx.owner && !ctx.ended.includes(l))
    .map((l) => ({ link: l, flow: laneFlow(state, l, allLinks(state, options(ctx))) }))
    .filter((a) => a.flow && a.flow.rate > 0)
    .sort((a, b) => b.flow!.rate - a.flow!.rate);
  for (const a of attackers) {
    const source = state.towers[a.link.from];
    if (!source) continue;
    const sources = helpers()
      .filter((t) => roadBetween(state, t.id, source.id) && !hasLink(state, t.id, source.id))
      .sort(bySpeed(state, source, ctx.owner));
    const plan = siegePlan(state, ctx.owner, source, sources, cfg.counterMs, options(ctx));
    if (!plan) continue;
    issuePlan(ctx, plan);
    answered = true;
    counterDoneMs = Math.min(counterDoneMs, plan.siege.fallsAtMs);
  }

  // 2) reinforce: friendly streams that make the tower hold, when it would fall before the counter frees it.
  ctx.rule = 'reinforce';
  let s = siege(ctx, tower);
  if (s.fallsAtMs !== Infinity && s.fallsAtMs <= counterDoneMs + RACE_MARGIN_MS) {
    const adjacent = helpers()
      .filter((t) => roadBetween(state, t.id, tower.id) && !hasLink(state, t.id, tower.id))
      .sort(bySpeed(state, tower, ctx.owner));
    const saved = reinforcePlan(state, ctx.owner, tower, adjacent, options(ctx));
    if (saved) {
      issuePlan(ctx, saved);
      return true;
    }
  }

  // 3) shield: stream back on the lane of the strongest attacker we can match, so nothing lands.
  ctx.rule = 'shield';
  if (!ctx.used.has(tower.id)) {
    s = siege(ctx, tower);
    for (const a of attackers) {
      if (s.fallsAtMs === Infinity || s.fallsAtMs > counterDoneMs + RACE_MARGIN_MS) break;
      const source = state.towers[a.link.from];
      if (!source || hasLink(state, tower.id, source.id)) continue;
      if (linkRate(state, tower, ctx.owner) < linkRate(state, source, a.link.owner)) continue;
      if (freeSlots(ctx, tower, cap) <= 0) {
        const reclaim = reclaimableFor(ctx, tower, s.fallsAtMs, { owner: ctx.owner, from: tower.id, to: source.id }, cfg.reclaimReinforcement === true, cfg.finishMs ?? 0);
        if (!reclaim) continue;
        issueUnlink(ctx, reclaim);
      }
      issueLink(ctx, tower, source.id);
      answered = true;
      break;
    }
  }
  return answered;
}

export interface AttackConfig {
  /** Rule name for the trace (default 'attack'). */
  rule?: string;
  /** Plan horizon: a target must fall within this to be worth a link. */
  planMs: number;
  /** Link cap per tower. */
  cap?: number;
  /** Which hostile towers are targets (default: every non-own tower). */
  targets?: (tower: Tower) => boolean;
  /** Which own towers may open an attack (default: all). */
  sources?: (tower: Tower) => boolean;
  /** Sources tried last (used only when the others cannot break the target). */
  lastResort?: (tower: Tower) => boolean;
  /** Score of a feasible plan (lower is better; default: when the target falls). */
  score?: (target: Tower, plan: Plan) => number;
  /**
   * A source without a free slot may end the returned link to attack (default: none). Called once
   * without a plan to ask whether the source could open at all, then with the chosen plan to pick the
   * link (undefined then rejects the plan for that target).
   */
  reclaim?: (ctx: Ctx, source: Tower, plan?: Plan) => Link | undefined;
  /**
   * Plan against the defender's shields: the target is assumed to stream back on the lane of every
   * source it can match (its free links, strongest source first). Off: plan against what is on the map
   * now. (Until 2026-09-22 every friendly neighbour with a free link was also assumed to reinforce the
   * target; with the corrected artillery model that made the bot too timid — under lean it never opened
   * on level 13 and lost 5/5 — and the enemies' own defence counters our sources before it reinforces.)
   */
  anticipate?: boolean;
  /**
   * A neutral is taken only when it can be held: the strongest rival neighbour with a free link streams
   * no faster than what our adjacent towers could pour into it after the capture.
   */
  holdCheck?: boolean;
  /**
   * A contested neutral is taken when the parity race (`contestOf`) is ours, or we take it back from the
   * rival's capture within this margin (default 0: pure parity). Until 2026-09-23 a contested neutral
   * also scored a flat 10 s worse, which ceded every cheap contested neutral to an uncontested one (AI-8c).
   */
  contestMarginMs?: number;
  /**
   * A contested neutral we win is scored with its *hold cost* (`holdMs`, AI-9): what the rival's streams
   * and columns still land on it after our acquisition keeps it under fire, its garrison at 1 and the
   * source that took it frozen on it as its reinforcement — so the capture is ranked as if acquired that
   * much later (the rival's landings before the flip still count for us: they bring the garrison down).
   * Reference player only, like the flat penalty it replaces; the enemies never paid either. (Rejecting
   * the capture when the rival streams already on it out-rate what our adjacent towers could pour in
   * after it was measured 2026-09-24 and dropped: lean 14 50 → 47/50, its median 36.9 → 70.5 s — the
   * guns' neutral is the level's stepping stone, and `defend` reinforces a retaken tower anyway.)
   */
  holdCost?: boolean;
}

/**
 * Hypothetical reinforcement links into `target` from its owner's neighbours that have a free link.
 * Not used by `attack` since 2026-09-22 (see `AttackConfig.anticipate`); kept for tooling and tests.
 */
export function anticipatedReinforcements(state: GameState, target: Tower): PlannedLink[] {
  if (target.owner === 'neutral') return [];
  const out: PlannedLink[] = [];
  for (const n of neighbours(state, target.id)) {
    const f = n.tower;
    if (f.owner !== target.owner || f.units < 1 || hasLink(state, f.id, target.id)) continue;
    if (linksFrom(state, f.id).length >= maxLinksOf(f)) continue;
    out.push({ owner: f.owner, from: f.id, to: target.id });
  }
  return out;
}

/**
 * Hypothetical shields: the target streams back at `link`'s source when it still has a link to spare (in
 * `planned` count the shields already assumed) and its rate matches the source's.
 */
export function anticipatedShield(state: GameState, target: Tower, link: PlannedLink, planned: readonly PlannedLink[]): PlannedLink[] {
  if (target.owner === 'neutral' || target.units < 1) return [];
  const source = state.towers[link.from];
  if (!source) return [];
  const used = linksFrom(state, target.id).length + planned.filter((p) => p.from === target.id).length;
  if (used >= maxLinksOf(target)) return [];
  if (hasLink(state, target.id, source.id) || planned.some((p) => p.from === target.id && p.to === source.id)) return [];
  if (linkRate(state, target) < linkRate(state, source, link.owner)) return [];
  return [{ owner: target.owner, from: target.id, to: source.id }];
}

/** Strongest stream a rival neighbour with a free link could put on `tower` right now (weight/s). */
export function strongestRivalRate(state: GameState, tower: Tower, owner: Owner): number {
  let best = 0;
  for (const n of neighbours(state, tower.id)) {
    const r = n.tower;
    if (r.owner === owner || r.owner === 'neutral' || r.units < 1) continue;
    if (linksFrom(state, r.id).length >= maxLinksOf(r)) continue;
    best = Math.max(best, linkRate(state, r));
  }
  return best;
}

/**
 * Rule "attack": repeatedly pick the hostile target with the best-scoring feasible plan (the minimal set
 * of adjacent sources whose stacked streams break it within `planMs`) and issue it, until nothing is
 * takeable. A target already falling within the horizon to our own streams is left alone (no piling).
 */
export function attack(ctx: Ctx, cfg: AttackConfig): void {
  ctx.rule = cfg.rule ?? 'attack';
  const state = ctx.state;
  const cap = cfg.cap ?? Infinity;
  const isTarget = cfg.targets ?? ((t: Tower) => t.owner !== ctx.owner);
  const maySource = cfg.sources ?? (() => true);
  const lastResort = cfg.lastResort ?? (() => false);
  const score = cfg.score ?? ((_t: Tower, p: Plan) => p.siege.fallsAtMs);
  const canOpen = (t: Tower): boolean => freeSlots(ctx, t, cap) > 0 || (cfg.reclaim !== undefined && cfg.reclaim(ctx, t) !== undefined);
  const rejected = new Set<string>();

  for (;;) {
    const sources = actors(ctx).filter((t) => !ctx.used.has(t.id) && maySource(t) && canOpen(t));
    if (sources.length === 0) return;
    const targetIds = new Set<string>();
    for (const s of sources) for (const n of neighbours(state, s.id)) if (n.tower.owner !== ctx.owner && isTarget(n.tower)) targetIds.add(n.tower.id);
    let best: { target: Tower; plan: Plan; score: number } | undefined;
    for (const id of [...targetIds].sort()) {
      if (rejected.has(id)) continue;
      const target = state.towers[id]!;
      const already = siege(ctx, target);
      const mine = state.links.some((l) => l.to === id && l.owner === ctx.owner && !ctx.ended.includes(l)) || ctx.planned.some((p) => p.to === id);
      if (mine && already.fallsAtMs <= cfg.planMs) continue;
      const adjacent = sources.filter((s) => roadBetween(state, s.id, id) && !hasLink(state, s.id, id)).sort(bySpeed(state, target, ctx.owner));
      const ordered = [...adjacent.filter((s) => !lastResort(s)), ...adjacent.filter((s) => lastResort(s))];
      const opts: SiegeOptions = { planned: ctx.planned, exclude: ctx.ended };
      const onAdd = cfg.anticipate ? (link: PlannedLink, planned: readonly PlannedLink[]) => anticipatedShield(state, target, link, planned) : undefined;
      const plan = siegePlan(state, ctx.owner, target, ordered, cfg.planMs, opts, onAdd);
      if (!plan) continue;
      // A contested neutral goes to whoever lands the flipping unit: only plans that win the race count,
      // and they are scored by when *we* get the tower (our flip, or our retake) — the rival's stream
      // brings the garrison down too, but that fall is theirs, not ours.
      let acquiredShift = 0;
      if (target.owner === 'neutral') {
        const others = rivalRate(plan.siege, ctx.owner);
        let acquiredAt = plan.siege.fallsAtMs;
        if (others > 0) {
          const contest = contestOf(state, target, { planned: [...ctx.planned, ...plan.links], exclude: ctx.ended });
          if (!contestHeld(contest, ctx.owner, cfg.contestMarginMs ?? 0)) continue;
          acquiredAt = contest.winner === ctx.owner ? contest.flipAtMs : contest.retake!.atMs;
          if (acquiredAt > cfg.planMs) continue;
          acquiredShift = acquiredAt - plan.siege.fallsAtMs;
        }
        if (cfg.holdCheck) {
          let ours = 0;
          for (const n of neighbours(state, id)) {
            const t = n.tower;
            if (t.owner !== ctx.owner || t.units < 1) continue;
            const inPlan = plan.links.some((l) => l.from === t.id);
            if (inPlan || freeSlots(ctx, t) > 0) ours += linkRate(state, t, ctx.owner);
          }
          if (strongestRivalRate(state, target, ctx.owner) > ours) continue;
        }
        if (cfg.holdCost && others > 0) acquiredShift += holdMs(state, target, ctx.owner, acquiredAt, allLinks(state, { planned: [...ctx.planned, ...plan.links], exclude: ctx.ended }));
      }
      const sc = score(target, plan) + acquiredShift;
      if (!best || sc < best.score) best = { target, plan, score: sc };
    }
    if (!best) return;
    // Sources without a free slot must give up a link for the plan; if one cannot, the target is dropped.
    const reclaims: Link[] = [];
    let feasible = true;
    for (const l of best.plan.links) {
      const from = state.towers[l.from]!;
      if (freeSlots(ctx, from, cap) > 0) continue;
      const link = cfg.reclaim?.(ctx, from, best.plan);
      if (!link) {
        feasible = false;
        break;
      }
      reclaims.push(link);
    }
    if (!feasible) {
      rejected.add(best.target.id);
      continue;
    }
    for (const link of reclaims) issueUnlink(ctx, link);
    issuePlan(ctx, best.plan);
  }
}

export interface StackConfig {
  /** Link cap per tower (personality readability caps). */
  cap?: number;
  /** Which own towers may join (default: all); called with the target so a rule can keep a tower out of some sieges. */
  sources?: (tower: Tower, target: Tower) => boolean;
  /** Judge the join against the target's anticipated shield on the new lane. */
  anticipate?: boolean;
  /** A contested neutral is joined when the race stays ours within this margin (`contestHeld`; default 0). */
  contestMarginMs?: number;
}

/** A join must bring the fall forward by at least this much (ms) to be worth the source's growth. */
export const STACK_MIN_GAIN_MS = 500;

/**
 * Rule "stack": an idle own tower — a free link and nothing else to do this tick — joins a siege we
 * already run (a hostile tower with our stream into it, existing or issued this tick) when its stream
 * lands and brings the fall forward by `STACK_MIN_GAIN_MS`. Under v3 a stream costs nothing but the
 * source's growth, so a source left idle beside a siege only delays it (2026-09-22: the minimal
 * fastest-first plan on level 1 left the camp idle while the home alone took 3 s longer). A contested
 * neutral is joined only when the flip stays ours.
 */
export function stack(ctx: Ctx, cfg: StackConfig = {}): void {
  ctx.rule = 'stack';
  const state = ctx.state;
  const cap = cfg.cap ?? Infinity;
  const maySource = cfg.sources ?? (() => true);
  const targets = new Set<string>();
  for (const l of state.links) if (l.owner === ctx.owner && !ctx.ended.includes(l) && state.towers[l.to] && state.towers[l.to]!.owner !== ctx.owner) targets.add(l.to);
  for (const p of ctx.planned) if (state.towers[p.to] && state.towers[p.to]!.owner !== ctx.owner) targets.add(p.to);
  if (targets.size === 0) return;
  for (const source of actors(ctx)) {
    if (ctx.used.has(source.id) || freeSlots(ctx, source, cap) <= 0) continue;
    let best: { id: string; falls: number } | undefined;
    for (const id of [...targets].sort()) {
      const target = state.towers[id]!;
      if (!maySource(source, target) || !roadBetween(state, source.id, id) || hasLink(state, source.id, id) || ctx.planned.some((p) => p.from === source.id && p.to === id)) continue;
      const link: PlannedLink = { owner: ctx.owner, from: source.id, to: id };
      const flow = laneFlow(state, link, [...allLinks(state, options(ctx)), link]);
      if (!flow || !landsEnough(flow)) continue;
      const before = siege(ctx, target).fallsAtMs;
      const after = siege(ctx, target, [link]).fallsAtMs;
      if (!(after < before - STACK_MIN_GAIN_MS)) continue;
      // The defender can move a shield onto the new lane — but it has only so many: joining must never
      // make the siege slower under that shield (it then cancels this stream and frees another lane).
      const reactions = cfg.anticipate ? anticipatedShield(state, target, link, ctx.planned) : [];
      if (reactions.length && siege(ctx, target, [...reactions, link]).fallsAtMs > before) continue;
      if (target.owner === 'neutral' && !contestHeld(contestOf(state, target, { planned: [...ctx.planned, link], exclude: ctx.ended }), ctx.owner, cfg.contestMarginMs ?? 0)) continue;
      if (!best || after < best.falls) best = { id, falls: after };
    }
    if (best) issueLink(ctx, source, best.id);
  }
}

/**
 * A shield dropped for an attack must win the race: the attack's target falls at least `RACE_MARGIN_MS`
 * before the shielding tower would once the hostile stream lands on it again.
 */
export const RACE_MARGIN_MS = 1_000;

/**
 * Link a source may give up for an attack plan: a supply line that is no reinforcement (always), or —
 * with `races` and once the plan is known — a shield whose tower outlives the plan's target by
 * `RACE_MARGIN_MS` (the enemy cannot shield a lane while its links are busy, so the race is worth it).
 */
export function reclaimForAttack(ctx: Ctx, source: Tower, plan: Plan | undefined, races: boolean): Link | undefined {
  let shield: Link | undefined;
  for (const link of activeLinks(ctx, source.id)) {
    const target = ctx.state.towers[link.to];
    if (!target) continue;
    if (target.owner === ctx.owner) {
      if (!isReinforcement(ctx, link)) return link;
      continue;
    }
    if (races && !shield && isShield(ctx, link)) shield = link;
  }
  if (!shield) return undefined;
  if (!plan) return shield; // "could open" probe: judged with the plan below
  const without = siegeOf(ctx.state, source, { planned: ctx.planned, exclude: [...ctx.ended, shield] }).fallsAtMs;
  return without > plan.siege.fallsAtMs + RACE_MARGIN_MS ? shield : undefined;
}

/**
 * Rule "supply": a capped keep (top level, at capacity — it makes nothing and streaming costs it
 * nothing) with a free link pours into the friendly neighbour that needs it most: fewest hops to the
 * opponent first (`hops`), then the emptiest. The sim ends the line when the target is full.
 */
export function supply(ctx: Ctx, hops: ReadonlyMap<string, number>, cap = Infinity): void {
  ctx.rule = 'supply';
  const state = ctx.state;
  for (const keep of actors(ctx)) {
    if (ctx.used.has(keep.id) || !isCapped(state, keep) || freeSlots(ctx, keep, cap) <= 0) continue;
    let best: Tower | undefined;
    let bestKey = [Infinity, Infinity] as const;
    for (const n of neighbours(state, keep.id)) {
      const t = n.tower;
      if (t.owner !== ctx.owner || hasLink(state, keep.id, t.id) || ctx.planned.some((p) => p.from === keep.id && p.to === t.id)) continue;
      if (t.units >= capacityOf(t, state)) continue;
      const key = [hops.get(t.id) ?? Infinity, t.units] as const;
      if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
        best = t;
        bestKey = key;
      }
    }
    if (best) issueLink(ctx, keep, best.id);
  }
}
