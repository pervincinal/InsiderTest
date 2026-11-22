import { beforeEach, describe, expect, it } from 'vitest';
import type { SaveData } from '../../src/ui/save';
import { defaultSave, setSaveStorageForTests } from '../../src/ui/save';
import type { AdSession } from '../../src/economy/adsFlow';
import { createAdSession, rewardedCooldownLeft, rewardedUsedToday, showRewarded } from '../../src/economy/adsFlow';
import type { AdsProvider } from '../../src/economy/ads';
import { createFakeAds } from '../../src/economy/fakeAds';
import { dayKey } from '../../src/economy/wallet';

/*
 * REV-25: a rewarded video takes time. The cap / cooldown gate is checked when the player taps,
 * but the booking — cooldown start, per-day counter — is the moment the video finished: the clock
 * is re-sampled after the provider resolves. Local-time dates, so the midnight case holds in any
 * runner zone.
 */

const VIDEO_MS = 30_000;
let save: SaveData;
let session: AdSession;

beforeEach(() => {
  setSaveStorageForTests(null);
  save = defaultSave();
  session = createAdSession();
});

/** A fake provider whose rewarded video advances the injected clock by `VIDEO_MS` before it rewards. */
function slowAds(clock: { now: number }): AdsProvider {
  const fake = createFakeAds();
  return {
    ...fake,
    async showRewarded(placementId: string) {
      clock.now += VIDEO_MS;
      return fake.showRewarded(placementId);
    },
  };
}

describe('showRewarded books the post-ad time (REV-25)', () => {
  it('cooldown and last-ad time are the moment the video finished, not the tap', async () => {
    const clock = { now: new Date(2026, 8, 13, 12, 0, 0).getTime() };
    const tapMs = clock.now;
    const ads = slowAds(clock);
    expect(await showRewarded(session, save, 'rv_double_gold', undefined, ads, () => clock.now)).toBe(true);
    expect(clock.now).toBe(tapMs + VIDEO_MS);
    expect(session.lastRewardedAtMs['rv_double_gold']).toBe(tapMs + VIDEO_MS);
    expect(session.lastAdAtMs).toBe(tapMs + VIDEO_MS);
    // the cooldown runs from the end of the video: VIDEO_MS longer than a booking at the tap would give
    const def = (await import('../../src/economy/catalog')).AD_PLACEMENTS.find((p) => p.id === 'rv_double_gold')!;
    expect(rewardedCooldownLeft(session, 'rv_double_gold', tapMs + VIDEO_MS)).toBe(def.cooldownMs);
    expect(rewardedCooldownLeft(session, 'rv_double_gold', tapMs + def.cooldownMs)).toBe(VIDEO_MS);
  });

  it('a video that spans local midnight counts on the new day', async () => {
    const clock = { now: new Date(2026, 8, 13, 23, 59, 45).getTime() };
    const tapDay = dayKey(clock.now);
    expect(tapDay).toBe('2026-09-13');
    // an earlier video today on another placement, so the roll-over is visible
    save.adCounters = { ...save.adCounters, day: tapDay, rewardedByPlacement: { rv_continue: 1 } };
    const ads = slowAds(clock);
    expect(await showRewarded(session, save, 'rv_double_gold', undefined, ads, () => clock.now)).toBe(true);
    const doneDay = dayKey(clock.now);
    expect(doneDay).toBe('2026-09-14');
    expect(save.adCounters.day).toBe(doneDay);
    expect(save.adCounters.rewardedByPlacement).toEqual({ rv_double_gold: 1 });
    expect(rewardedUsedToday(save, 'rv_continue', clock.now)).toBe(0);
    expect(session.lastRewardedAtMs['rv_double_gold']).toBe(clock.now);
  });

  it('a fixed nowMs without a clock (the unit-test style) is booked as is', async () => {
    const t0 = new Date(2026, 8, 13, 12, 0, 0).getTime();
    const ads = createFakeAds();
    expect(await showRewarded(session, save, 'rv_double_gold', t0, ads)).toBe(true);
    expect(session.lastRewardedAtMs['rv_double_gold']).toBe(t0);
    expect(session.lastAdAtMs).toBe(t0);
  });

  it('with no arguments the real clock is sampled after the ad: never booked before the tap', async () => {
    const before = Date.now();
    const fake = createFakeAds();
    const ads: AdsProvider = {
      ...fake,
      async showRewarded(placementId: string) {
        await new Promise((r) => setTimeout(r, 5));
        return fake.showRewarded(placementId);
      },
    };
    expect(await showRewarded(session, save, 'rv_double_gold', undefined, ads)).toBe(true);
    expect(session.lastAdAtMs).toBeGreaterThanOrEqual(before);
    expect(session.lastAdAtMs).toBeLessThanOrEqual(Date.now());
    expect(save.adCounters.day).toBe(dayKey(session.lastAdAtMs));
  });
});
