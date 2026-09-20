/**
 * Tiny WebAudio synth. Everything is generated from oscillators and a noise buffer — no audio
 * files. The module never touches `window`/`AudioContext` itself: the context is injected through
 * a factory so the synth is DOM-free and testable with a fake. The factory runs lazily on the
 * first user gesture (`unlock`) because iOS/Android WebViews refuse to start audio otherwise.
 */

/* ---------- structural subset of the WebAudio API (real nodes satisfy these) ---------- */

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
  disconnect(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface OscillatorNodeLike extends AudioNodeLike {
  type: OscillatorType;
  frequency: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: BiquadFilterType;
  frequency: AudioParamLike;
  Q: AudioParamLike;
}

export interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
}

export interface BufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
}

export interface AudioContextLike {
  readonly currentTime: number; // seconds
  readonly sampleRate: number;
  readonly state: 'suspended' | 'running' | 'closed' | 'interrupted';
  readonly destination: AudioNodeLike;
  resume(): Promise<void>;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource(): BufferSourceNodeLike;
}

export type AudioContextFactory = () => AudioContextLike | null;

/** A live context and its master gain (`Synth.live`). */
export interface Voice {
  ctx: AudioContextLike;
  master: GainNodeLike;
}

const MASTER_GAIN = 0.5;

export interface BlipOptions {
  /** Peak gain 0..1 relative to master (default 0.3). */
  gain?: number;
  /** Seconds after `now` to start (default 0). */
  delayS?: number;
}

export interface NoiseOptions extends BlipOptions {
  /** Biquad type (default 'lowpass'). */
  filter?: BiquadFilterType;
}

/**
 * Owns the lazily created context, the master gain and the mute flag. The voices (`blip`, `sweep`,
 * `noiseBurst`) are free functions in src/audio/recipes.ts, a lazy chunk; they are no-ops until
 * `unlock()` has produced a context, so the game can call them freely from frame one.
 */
export class Synth {
  private ctx: AudioContextLike | null = null;
  private master: GainNodeLike | null = null;
  /** One second of white noise, made by the recipes chunk on its first noise burst. */
  noise: AudioBufferLike | null = null;
  private mutedFlag = false;

  constructor(private readonly factory: AudioContextFactory) {}

  /** The context, once unlocked (null before the first user gesture or where WebAudio is missing). */
  get context(): AudioContextLike | null {
    return this.ctx;
  }

  get muted(): boolean {
    return this.mutedFlag;
  }

  setMuted(muted: boolean): void {
    this.mutedFlag = muted;
    if (this.master && this.ctx) this.master.gain.setValueAtTime(muted ? 0 : MASTER_GAIN, this.ctx.currentTime);
  }

  /** Current time of the context in seconds (0 before unlock). Used for rate limiting. */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /**
   * Create the context on first call and resume it if the browser started it suspended.
   * Must be called from a user gesture handler (pointerdown/keydown). Safe to call repeatedly.
   * Returns true once a context exists.
   */
  unlock(): boolean {
    if (!this.ctx) {
      let ctx: AudioContextLike | null = null;
      try {
        ctx = this.factory();
      } catch {
        ctx = null;
      }
      if (!ctx) return false;
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.mutedFlag ? 0 : MASTER_GAIN;
      this.master.connect(ctx.destination);
      // A started silent buffer is the classic iOS unlock: it flips the context to running.
      try {
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        src.connect(this.master);
        src.start(0);
      } catch {
        /* best effort */
      }
    }
    if (this.ctx.state !== 'running') {
      this.ctx.resume().catch(() => {
        /* will retry on the next gesture */
      });
    }
    return true;
  }

  /** Context + master when a sound would actually be produced right now, else null (the voices in src/audio/recipes.ts). */
  live(): Voice | null {
    if (!this.ctx || !this.master || this.mutedFlag) return null;
    return { ctx: this.ctx, master: this.master };
  }
}
