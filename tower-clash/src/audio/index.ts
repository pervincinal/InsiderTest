import type { GameState, SimEvent } from '../sim/types';
import type { SaveData } from '../ui/save';
import { writeSave } from '../ui/save';
import type { AudioContextFactory, AudioContextLike } from './synth';
import { Synth } from './synth';
import type { HitState, SfxChunk, SfxName, SfxOptions } from './sfx';
import { SfxPlayer, loadSfxRecipes, sfxNow } from './sfx';
import type { ArrivalTracker } from './sfxRules';
import { hapticCapture } from '../native/index';
import { loadChunk } from '../lazyChunk';

export type { SfxName, SfxOptions, SfxCall, CaptureKind } from './sfx';
export { loadSfxRecipes, SfxPlayer } from './sfx';
export type { SfxRecipe, HitState, HitsFn, SfxChunk } from './sfx';
// AUD-F6: sfxForEvents, ArrivalTracker, RATE_LIMIT_S, sendPitchHz, SEND_PITCH_CAP live in ./sfxRules (the lazy recipes chunk)
export { Synth } from './synth';
export type { AudioContextLike, AudioContextFactory } from './synth';

/**
 * Module-level audio facade used by the UI. `initAudio(save)` binds the Effects flag to
 * `save.settings.sound` and the Music flag to `save.settings.music` (AUD-F6; absent = `sound`);
 * `unlockAudio()` must run inside the first user gesture and starts the music (a lazy chunk,
 * src/audio/music.ts) when it is on; everything else is safe to call at any time (silent until unlocked).
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
  /** Own-unit arrival detector, made by the recipes chunk on the first frame it is in (src/audio/sfxRules.ts). */
  arrivals: ArrivalTracker | null;
  save: SaveData | null;
  persist: (save: SaveData) => void;
  /** AUD-F1: the hit limiter's state and the light haptic it fires (src/native `hapticCapture`; a no-op on the web). */
  hits: HitState;
  haptic: () => void;
  /** The page is hidden (`setAudioBackground`): no music. */
  hidden?: boolean;
}

function createModule(factory: AudioContextFactory): AudioModule {
  const synth = new Synth(factory);
  return { synth, player: new SfxPlayer(synth), arrivals: null, save: null, persist: writeSave, hits: { at: new Map(), last: -Infinity }, haptic: hapticCapture };
}

let mod: AudioModule = createModule(browserContextFactory);

export interface InitAudioOptions {
  /** Injected context factory (tests, or a platform-specific context). Default: the browser's. */
  factory?: AudioContextFactory;
  /** How to persist the save after a mute change. Default: `writeSave`. */
  persist?: (save: SaveData) => void;
  /** AUD-F1: the haptic a hit fires (tests). Default: src/native `hapticCapture`. */
  haptic?: () => void;
}

/** Bind audio to the save (mute = `!settings.sound`). Re-initialising replaces any previous state. */
export function initAudio(save: SaveData, opts: InitAudioOptions = {}): void {
  mod = createModule(opts.factory ?? browserContextFactory);
  mod.save = save;
  if (opts.persist) mod.persist = opts.persist;
  if (opts.haptic) mod.haptic = opts.haptic;
  mod.synth.setMuted(!save.settings.sound);
  mod.synth.musicOff = !(save.settings.music ?? save.settings.sound);
  if (save.settings.sound) warmRecipes();
  syncMusic();
}

/** AUD-F6: the music chunk once loaded (it stops the loop when the conditions go away). */
let music: typeof import('./music') | null = null;
const wantMusic = (): boolean => !!mod.synth.context && !mod.synth.musicOff && !mod.hidden;

/** Start / stop the music loop to match the Music setting, the unlock and the page's visibility. */
function syncMusic(): void {
  if (music) music.syncMusic(mod.synth, wantMusic());
  else if (wantMusic())
    void loadChunk('music', () => import('./music'))
      .then((m) => (music = m).syncMusic(mod.synth, wantMusic()))
      .catch(() => undefined);
}

/** Start fetching the recipes chunk so the first tap already has its click (never awaited; failures retry on play / unlock). */
function warmRecipes(): void {
  void loadSfxRecipes().catch(() => undefined);
}

/** Create/resume the AudioContext. Call from a pointerdown/keydown handler. */
export function unlockAudio(): boolean {
  const ok = mod.synth.unlock();
  if (ok && !mod.synth.muted) warmRecipes();
  syncMusic();
  return ok;
}

/** Page visibility hook: suspend the AudioContext while hidden, resume when visible again (MM-7). */
export function setAudioBackground(hidden: boolean): void {
  mod.hidden = hidden;
  mod.synth.setBackground(hidden);
  syncMusic();
}

/** True once an AudioContext exists. */
export function isAudioUnlocked(): boolean {
  return mod.synth.context !== null;
}

export function playSfx(name: SfxName, opts?: SfxOptions): boolean {
  return mod.player.play(name, opts);
}

/**
 * UI click for any tapped button / level node / HUD control. Call from the pointer-up handler that
 * confirms the tap (after `unlockAudio()` ran on pointer-down). Returns false when muted/locked.
 */
export function playButtonSfx(): boolean {
  return mod.player.play('button');
}

/** Everything silent: Effects and Music both off (the title / HUD speaker's state). */
export function isMuted(): boolean {
  return mod.synth.muted && mod.synth.musicOff;
}

/** Settings → Effects on (the SFX + UI buses). */
export function effectsOn(): boolean {
  return !mod.synth.muted;
}

/** Settings → Music on. */
export function musicOn(): boolean {
  return !mod.synth.musicOff;
}

/** Effects off / on (persists `settings.sound`). */
export function setMuted(muted: boolean): void {
  mod.synth.setMuted(muted);
  persistAudio();
}

/** Music off / on (persists `settings.music`; starts or stops the loop). */
export function setMusicOn(on: boolean): void {
  mod.synth.musicOff = !on;
  mod.synth.mix?.apply();
  persistAudio();
  syncMusic();
}

/** Write both flags when either differs from the save (so an absent `music` is pinned on the first change). */
function persistAudio(): void {
  const st = mod.save?.settings;
  const fx = !mod.synth.muted;
  const mu = !mod.synth.musicOff;
  if (st && (st.sound !== fx || st.music !== mu)) {
    st.sound = fx;
    st.music = mu;
    mod.persist(mod.save!);
  }
}

/** The title / HUD / pause speaker: anything audible → both off, else both on. Returns the new muted state. */
export function toggleMuted(): boolean {
  const on = isMuted();
  mod.synth.musicOff = !on;
  setMuted(!on);
  syncMusic();
  return isMuted();
}

/** Debug surface (src/debug.ts): the synth, for the mixer's bus levels. */
export function audioSynth(): Synth {
  return mod.synth;
}

/** Forward one batch of sim events (from `GameLoop.onEvents`). */
export function onSimEvents(events: readonly SimEvent[], state: Pick<GameState, 'towers'>): void {
  const c = fx();
  if (!c) return;
  (mod.arrivals ??= new c.ArrivalTracker('player')).noteEvents(events);
  for (const call of c.sfxForEvents(events, 'player', state.towers)) mod.player.play(call.name, call.opts);
  // AUD-F1: being attacked knocks (and taps the phone) at most every 250 ms per tower and 6 times a
  // second overall; there is no vibration setting, so the haptic follows the Effects setting
  c.playHits(events, 'player', state.towers, mod.hits, performance.now(), (weight) => {
    mod.player.play('hit', { weight });
    mod.haptic();
  });
}

/** The recipes chunk while Effects are on (starting its load; the AUD-F1 haptic does not wait for the unlock), else null. */
function fx(): SfxChunk | null {
  return mod.synth.muted ? null : sfxNow();
}

/** Call once per frame after the loop advanced: plays the soft arrival tap for own units. */
export function onSimFrame(state: Pick<GameState, 'units'>): void {
  mod.synth.playAt = mod.synth.now(); // AUD-F6: the music's pulse layer plays while frames come
  const c = fx();
  if (c && (mod.arrivals ??= new c.ArrivalTracker('player')).tick(state) > 0) mod.player.play('arrive');
}

/** Forget per-level tracking (call when a level starts). */
export function resetAudioLevel(): void {
  mod.arrivals?.reset();
  mod.hits.at.clear();
}
