import type {
  AudioBufferLike,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  BiquadFilterNodeLike,
  BufferSourceNodeLike,
  GainNodeLike,
  OscillatorNodeLike,
} from '../../src/audio/synth';

/** Records automation so tests can read the scheduled values. */
export class FakeParam implements AudioParamLike {
  value = 0;
  readonly events: { kind: 'set' | 'linear' | 'exp'; value: number; time: number }[] = [];
  setValueAtTime(value: number, time: number): void {
    this.events.push({ kind: 'set', value, time });
  }
  linearRampToValueAtTime(value: number, time: number): void {
    this.events.push({ kind: 'linear', value, time });
  }
  exponentialRampToValueAtTime(value: number, time: number): void {
    this.events.push({ kind: 'exp', value, time });
  }
}

class FakeNode implements AudioNodeLike {
  readonly connections: AudioNodeLike[] = [];
  connect(destination: AudioNodeLike): AudioNodeLike {
    this.connections.push(destination);
    return destination;
  }
  disconnect(): void {
    this.connections.length = 0;
  }
}

export class FakeGain extends FakeNode implements GainNodeLike {
  gain = new FakeParam();
}

/** Anything that is started/stopped: oscillators and buffer sources. */
export interface Voice {
  startAt: number | null;
  stopAt: number | null;
}

export class FakeOscillator extends FakeNode implements OscillatorNodeLike, Voice {
  type: OscillatorType = 'sine';
  frequency = new FakeParam();
  startAt: number | null = null;
  stopAt: number | null = null;
  start(when = 0): void {
    this.startAt = when;
  }
  stop(when = 0): void {
    this.stopAt = when;
  }
}

export class FakeFilter extends FakeNode implements BiquadFilterNodeLike {
  type: BiquadFilterType = 'lowpass';
  frequency = new FakeParam();
  Q = new FakeParam();
}

export class FakeBuffer implements AudioBufferLike {
  private readonly data: Float32Array;
  constructor(length: number) {
    this.data = new Float32Array(length);
  }
  getChannelData(): Float32Array {
    return this.data;
  }
}

export class FakeBufferSource extends FakeNode implements BufferSourceNodeLike, Voice {
  buffer: AudioBufferLike | null = null;
  loop = false;
  startAt: number | null = null;
  stopAt: number | null = null;
  start(when = 0): void {
    this.startAt = when;
  }
  stop(when = 0): void {
    this.stopAt = when;
  }
}

export class FakeAudioContext implements AudioContextLike {
  currentTime = 0;
  readonly sampleRate = 8000;
  state: AudioContextLike['state'] = 'suspended';
  readonly destination = new FakeNode();
  resumeCalls = 0;
  readonly oscillators: FakeOscillator[] = [];
  readonly sources: FakeBufferSource[] = [];
  readonly gains: FakeGain[] = [];
  readonly filters: FakeFilter[] = [];

  resume(): Promise<void> {
    this.resumeCalls++;
    this.state = 'running';
    return Promise.resolve();
  }
  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createOscillator(): FakeOscillator {
    const o = new FakeOscillator();
    this.oscillators.push(o);
    return o;
  }
  createBiquadFilter(): FakeFilter {
    const f = new FakeFilter();
    this.filters.push(f);
    return f;
  }
  createBuffer(_channels: number, length: number): FakeBuffer {
    return new FakeBuffer(length);
  }
  createBufferSource(): FakeBufferSource {
    const s = new FakeBufferSource();
    this.sources.push(s);
    return s;
  }

  /** Every started voice except the 1-sample unlock buffer. */
  voices(): Voice[] {
    const real = this.sources.filter((s) => s.buffer !== null && s.buffer.getChannelData(0).length > 1);
    return [...this.oscillators, ...real].filter((v) => v.startAt !== null);
  }

  /** Clear the recorded voices (keeps the graph and time). */
  clear(): void {
    this.oscillators.length = 0;
    this.sources.length = 0;
    this.gains.length = 0;
    this.filters.length = 0;
  }
}
