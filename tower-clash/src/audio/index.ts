import type { Command, GameState, SimEvent } from '../sim/types';
import { C } from '../sim/constants';
import type { SaveData } from '../ui/save';
import { writeSave } from '../ui/save';
import type { AudioContextFactory, AudioContextLike } from './synth';
import { Synth } from './synth';
import type { SfxName, SfxOptions } from './sfx';
import { ArrivalTracker, SfxPlayer, sfxForEvents } from './sfx';

export type { SfxName, SfxOptions, SfxCall, CaptureKind } from './sfx';
export { sfxForEvents, sendPitchHz, ArrivalTracker, SfxPlayer, RATE_LIMIT_S, SEND_PITCH_CAP } from './sfx';
export { Synth } from './synth';
export type { AudioContextLike, AudioContextFactory } from './synth';

/**
 * Module-level audio facade used by the UI. `initAudio(save)` binds the mute flag to
 * `save.settings.sound`; `unlockAudio()` must run inside the first user gesture; everything
 * else is safe to call at any time (silent until unlocked).
 */

/** Real browser context; null where WebAudio is unavailable (old WebViews, SSR, tests). */
function browserContextFactory(): AudioContextLike | null {
  const g = globalThis as { AudioContext?: new () => AudioContext; webkitAudioContext?: new () => AudioContext };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

interface AudioModule {
  synth: Synth;
  player: SfxPlayer;
  arrivals: ArrivalTracker;
  save: SaveData | null;
  persist: (save: SaveData) => void;
}

function createModule(factory: AudioContextFactory): AudioModule {
  const synth = new Synth(factory);
  return { synth, player: new SfxPlayer(synth), arrivals: new ArrivalTracker('player'), save: null, persist: writeSave };
}

let mod: AudioModule = createModule(browserContextFactory);

export interface InitAudioOptions {
  /** Injected context factory (tests, or a platform-specific context). Default: the browser's. */
  factory?: AudioContextFactory;
  /** How to persist the save after a mute change. Default: `writeSave`. */
  persist?: (save: SaveData) => void;
}

/** Bind audio to the save (mute = `!settings.sound`). Re-initialising replaces any previous state. */
export function initAudio(save: SaveData, opts: InitAudioOptions = {}): void {
  mod = createModule(opts.factory ?? browserContextFactory);
  mod.save = save;
  if (opts.persist) mod.persist = opts.persist;
  mod.synth.setMuted(!save.settings.sound);
}

/** Create/resume the AudioContext. Call from a pointerdown/keydown handler. */
export function unlockAudio(): boolean {
  return mod.synth.unlock();
}

/** True once an AudioContext exists. */
export function isAudioUnlocked(): boolean {
  return mod.synth.context !== null;
}

export function playSfx(name: SfxName, opts?: SfxOptions): boolean {
  return mod.player.play(name, opts);
}

export function isMuted(): boolean {
  return mod.synth.muted;
}

export function setMuted(muted: boolean): void {
  mod.synth.setMuted(muted);
  if (mod.save && mod.save.settings.sound !== !muted) {
    mod.save.settings.sound = !muted;
    mod.persist(mod.save);
  }
}

/** Flip mute; returns the new muted state. */
export function toggleMuted(): boolean {
  setMuted(!isMuted());
  return isMuted();
}

/** Forward one batch of sim events (from `GameLoop.onEvents`). */
export function onSimEvents(events: readonly SimEvent[], state: Pick<GameState, 'towers'>): void {
  mod.arrivals.noteEvents(events);
  for (const call of sfxForEvents(events, 'player', state.towers)) mod.player.play(call.name, call.opts);
}

/** Call once per frame after the loop advanced: plays the soft arrival tap for own units. */
export function onSimFrame(state: Pick<GameState, 'units'>): void {
  if (mod.arrivals.tick(state) > 0) mod.player.play('arrive');
}

/** Units the sim will actually dispatch for a `sendUnits` command (mirrors `sim/commands.ts`). */
export function sendCount(cmd: Extract<Command, { type: 'sendUnits' }>, state: Pick<GameState, 'towers' | 'roads'>): number {
  const from = state.towers[cmd.from];
  const to = state.towers[cmd.to];
  if (!from || !to || from === to || from.owner !== cmd.owner) return 0;
  const ratio = cmd.ratio === undefined ? 1 : Math.min(1, Math.max(0, cmd.ratio));
  const weight = from.kind === 'tankFactory' ? C.TANK_WEIGHT : C.INFANTRY_WEIGHT;
  return Math.floor(Math.floor(from.units * ratio) / weight);
}

/** Feedback for a command the player just issued (only `sendUnits` has no sim event of its own). */
export function onPlayerCommand(cmd: Command, state: Pick<GameState, 'towers' | 'roads'>): void {
  if (cmd.type !== 'sendUnits') return;
  const count = sendCount(cmd, state);
  if (count > 0) mod.player.play('send', { count });
}

/** Forget per-level tracking (call when a level starts). */
export function resetAudioLevel(): void {
  mod.arrivals.reset();
}
