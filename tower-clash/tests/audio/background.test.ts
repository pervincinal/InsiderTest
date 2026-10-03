import { beforeEach, describe, expect, it } from 'vitest';
import { initAudio, setAudioBackground, unlockAudio } from '../../src/audio/index';
import { defaultSave } from '../../src/ui/save';
import { FakeAudioContext } from './fakeAudio';

/*
 * MM-7: the page going to the background (iOS app switcher, Android home, tab switch) suspends the
 * AudioContext instead of relying on the WebView to mute a hidden page; coming back resumes it.
 */

let ctx: FakeAudioContext;

beforeEach(() => {
  ctx = new FakeAudioContext();
  initAudio(defaultSave(), { factory: () => ctx, persist: () => undefined });
});

describe('setAudioBackground', () => {
  it('is a no-op before the first gesture created a context', () => {
    setAudioBackground(true);
    setAudioBackground(false);
    expect(ctx.suspendCalls).toBe(0);
    expect(ctx.resumeCalls).toBe(0);
  });

  it('suspends a running context when hidden and resumes it when visible', () => {
    unlockAudio();
    expect(ctx.state).toBe('running');
    const resumesAfterUnlock = ctx.resumeCalls;

    setAudioBackground(true);
    expect(ctx.suspendCalls).toBe(1);
    expect(ctx.state).toBe('suspended');

    setAudioBackground(false);
    expect(ctx.resumeCalls).toBe(resumesAfterUnlock + 1);
    expect(ctx.state).toBe('running');
  });

  it('does not resume a context it did not suspend, and tolerates repeated events', () => {
    unlockAudio();
    const resumes = ctx.resumeCalls;
    setAudioBackground(false); // visible without a prior hide
    expect(ctx.resumeCalls).toBe(resumes);

    setAudioBackground(true);
    setAudioBackground(true); // already suspended: no second suspend
    expect(ctx.suspendCalls).toBe(1);
    setAudioBackground(false);
    setAudioBackground(false);
    expect(ctx.resumeCalls).toBe(resumes + 1);
  });

  it('leaves the next gesture to resume when the WebView refused the resume (iOS)', () => {
    unlockAudio();
    setAudioBackground(true);
    // iOS may reject resume() outside a user gesture: the context stays suspended
    ctx.resume = () => {
      ctx.resumeCalls++;
      return Promise.reject(new Error('NotAllowedError'));
    };
    setAudioBackground(false);
    expect(ctx.state).toBe('suspended');
    const resumes = ctx.resumeCalls;
    unlockAudio(); // next pointerdown / keydown
    expect(ctx.resumeCalls).toBe(resumes + 1);
  });

  it('survives a context without suspend() (older WebViews)', () => {
    const bare = new FakeAudioContext();
    initAudio(defaultSave(), { factory: () => bare, persist: () => undefined });
    unlockAudio();
    (bare as { suspend?: unknown }).suspend = undefined;
    expect(() => setAudioBackground(true)).not.toThrow();
    expect(bare.state).toBe('running');
  });
});
