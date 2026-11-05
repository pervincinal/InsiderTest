import { afterEach, describe, expect, it, vi } from 'vitest';
import { HUD } from '../../src/render/layout';

/*
 * AUD-U22 (docs/reviews/2026-10-29-audit-ux.md, P3, pinned 2026-11-05): the `?tilt=0.72` perspective
 * camera stays an A/B switch and never becomes the default — least of all on a 360-wide phone, where it
 * shrinks far towers and narrows the far edge to 72 %. What is pinned is the selection, not any scale
 * value (AUD-U21's content fit may change what the flat camera draws):
 *
 * - `TILT_DEFAULT` is the flat map (1) and a page without `?tilt=` answers `FLAT` whatever the viewport
 *   (the camera reads only the URL / `setTilt`; 360 × 640 and 430 × 932 are exercised in
 *   e2e/lazy.spec.ts "AUD-U22 flat default", which also watches the network);
 * - the perspective chunk (PERF-9) is not imported without the flag — `preloadCamera()` has nothing to
 *   load and `playCamera()` starts no download;
 * - only the URL flag (`?tilt=0.72`, or any k in TILT_MIN..1) or `setTilt` turns it on; `?tilt=0`, an
 *   empty or unparsable value and `?tilt=1` are the flat map.
 */

const CAMERA = '../../src/render/camera';
const PERSPECTIVE = '../../src/render/perspective';

type CameraModule = typeof import('../../src/render/camera');

/** Fresh camera module under a page URL `search` (e.g. '?tilt=0.72'); counts imports of the perspective chunk. */
async function cameraAt(search: string): Promise<{ camera: CameraModule; loads: () => number }> {
  vi.resetModules();
  let loads = 0;
  vi.doMock(PERSPECTIVE, async () => {
    loads += 1;
    return vi.importActual(PERSPECTIVE);
  });
  vi.stubGlobal('location', { search });
  const camera = (await import(CAMERA)) as CameraModule;
  return { camera, loads: () => loads };
}

afterEach(() => {
  vi.doUnmock(PERSPECTIVE);
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('AUD-U22: the perspective camera is an A/B switch, never the default', () => {
  it('TILT_DEFAULT is the flat map and TILT_PERSPECTIVE is the A/B value, not the default', async () => {
    const { camera } = await cameraAt('');
    expect(camera.TILT_DEFAULT).toBe(1);
    expect(camera.FLAT.flat).toBe(true);
    expect(camera.FLAT.k).toBe(1);
    expect(camera.TILT_PERSPECTIVE).toBeLessThan(1);
    expect(camera.TILT_PERSPECTIVE).toBeGreaterThanOrEqual(camera.TILT_MIN);
  });

  for (const search of ['', '?dprcap=2', '?tilt=', '?tilt=0', '?tilt=1', '?tilt=abc', '?tones=vivid&tilt=0']) {
    it(`a page at '${search || '(no query)'}' plays on the flat map and never imports the perspective chunk`, async () => {
      const { camera, loads } = await cameraAt(search);
      // the level start's preload: whatever the flat map needs (AUD-U21's content-fit chunk, or nothing), never the perspective
      await camera.preloadCamera();
      // a frame's camera, several times (the play loop calls it every frame): no tilt, no horizon, no download
      for (let i = 0; i < 3; i++) {
        const cam = camera.playCamera();
        expect(cam.tilt, 'no perspective painters').toBeUndefined();
        expect(cam.horizonY(), 'no horizon').toBeUndefined();
      }
      // no foreshortening down the play band: the far and the near edge stand at the same scale and the
      // centre column stays a column (a content fit may zoom and move the map uniformly, a tilt may not)
      const cam = camera.playCamera();
      const far = cam.proj(360, HUD.mapTop);
      const near = cam.proj(360, HUD.mapBottom);
      expect(far.s, 'far-edge scale = near-edge scale').toBeCloseTo(near.s, 9);
      expect(cam.depth(HUD.mapTop)).toBeCloseTo(cam.depth(HUD.mapBottom), 9);
      expect(far.x, 'centre column').toBeCloseTo(near.x, 9);
      expect(near.y, 'the near edge is drawn below the far edge').toBeGreaterThan(far.y);
      expect(loads(), 'perspective chunk imports').toBe(0);
    });
  }

  it('?tilt=0.72 (and only a URL flag or setTilt) asks for the perspective chunk', async () => {
    const { camera, loads } = await cameraAt('?tilt=0.72');
    expect(camera.playCamera(), 'flat until the chunk is in').toBe(camera.FLAT);
    const pending = camera.preloadCamera();
    expect(pending, 'the flag has a chunk to preload').not.toBeNull();
    await pending;
    expect(loads()).toBe(1);
    const cam = camera.playCamera();
    expect(cam.flat).toBe(false);
    expect(cam.k).toBe(camera.TILT_PERSPECTIVE);
    expect(cam.proj(360, HUD.mapTop).s, 'the far edge is foreshortened under the flag').toBeLessThan(1);
    // the switch is reversible from code and `undefined` goes back to the URL, never to a tilted default
    camera.setTilt(0);
    expect(camera.playCamera()).toBe(camera.FLAT);
    camera.setTilt(undefined);
    expect(camera.playCamera()).toBe(cam);
  });

  it('setTilt from code is the other switch; cleared, a flag-less page is flat again', async () => {
    const { camera, loads } = await cameraAt('');
    camera.setTilt(camera.TILT_PERSPECTIVE);
    expect(camera.preloadCamera()).not.toBeNull();
    await camera.loadCamera();
    expect(loads()).toBe(1);
    expect(camera.playCamera().flat).toBe(false);
    camera.setTilt(undefined);
    expect(camera.playCamera(), 'no URL flag: the default is the flat map').toBe(camera.FLAT);
  });
});
