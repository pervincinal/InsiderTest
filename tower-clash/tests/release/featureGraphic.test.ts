import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_FEATURE, FEATURE_H, FEATURE_TEXT_FREE, FEATURE_TITLE, FEATURE_VARIANTS, FEATURE_W, WORDMARK_SPILL } from '../../src/render/featureGraphic';

/*
 * ART-19: the Google Play feature graphic (store/feature-graphic.png, written by
 * `node store/tools/renderStoreShots.mjs --feature-only` from src/render/featureGraphic.ts).
 * Play wants 1024 × 500, JPEG or 24-bit PNG with no alpha, at most 1 MB; our store budget is 600 KB.
 */

const ROOT = join(import.meta.dirname, '..', '..');
const FILE = join(ROOT, 'store/feature-graphic.png');

describe('store/feature-graphic.png', () => {
  it('is a 1024 × 500 8-bit RGB PNG (no alpha channel) under the size budget', () => {
    const b = readFileSync(FILE);
    expect(b.subarray(1, 4).toString('latin1')).toBe('PNG');
    expect(b.subarray(12, 16).toString('latin1')).toBe('IHDR');
    expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([1024, 500]);
    expect(b.readUInt8(24)).toBe(8); // bit depth
    expect(b.readUInt8(25)).toBe(2); // colour type 2 = RGB (no alpha, no palette)
    expect(b.readUInt8(28)).toBe(0); // not interlaced
    expect(b.includes(Buffer.from('tRNS', 'latin1'))).toBe(false);
    expect(statSync(FILE).size).toBeLessThanOrEqual(600 * 1024);
  });

  it('matches the drawing module and the render script', () => {
    expect([FEATURE_W, FEATURE_H]).toEqual([1024, 500]);
    expect(FEATURE_VARIANTS).toContain(DEFAULT_FEATURE);
    const script = readFileSync(join(ROOT, 'store/tools/renderStoreShots.mjs'), 'utf8');
    expect(script).toContain("flag('feature-only')");
    expect(script).toContain('src/render/featureGraphic.ts');
  });

  it('keeps every wordmark out of the centre third (Play play-button overlay) and off the edges', () => {
    const [free0, free1] = FEATURE_TEXT_FREE;
    for (const v of FEATURE_VARIANTS) {
      const t = FEATURE_TITLE[v];
      const x0 = t.cx - t.maxW / 2;
      const x1 = t.cx + t.maxW / 2 + WORDMARK_SPILL;
      expect(x1 <= free0 || x0 >= free1, `${v}: ${x0}..${x1}`).toBe(true);
      expect(x0, v).toBeGreaterThanOrEqual(32);
      expect(x1, v).toBeLessThanOrEqual(FEATURE_W - 32);
      // two lines at ≤ 1.02 em pitch, each ≤ 1 em tall, plus the spill
      expect(t.top, v).toBeGreaterThanOrEqual(32);
      expect(t.top + t.px * 2.02 + WORDMARK_SPILL, v).toBeLessThanOrEqual(FEATURE_H - 32);
    }
  });
});
