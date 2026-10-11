import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ADAPTIVE_ZOOM, ART_RADIUS } from '../../src/render/appIcon';

/*
 * ART-18: the shipped app icons (written by scripts/renderIcons.ts from src/render/appIcon.ts).
 * Reads the committed PNGs themselves: sizes, colour type (the App Store 1024 icon must have no
 * alpha channel, Google Play wants a 32-bit 512), sRGB tagging, full opacity where a platform fills
 * transparency with black, and the Android adaptive foreground inside the 66 dp safe circle.
 */

const ROOT = join(import.meta.dirname, '..', '..');
const RES = join(ROOT, 'android/app/src/main/res');
const IOS = join(ROOT, 'ios/App/App/Assets.xcassets');

interface Png {
  width: number;
  height: number;
  colourType: number;
  chunks: string[];
  /** RGBA rows (RGB files get alpha 255). */
  rgba: Buffer;
}

function readPng(path: string): Png {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString('latin1'), path).toBe('PNG');
  let off = 8;
  const chunks: string[] = [];
  const idat: Buffer[] = [];
  let width = 0;
  let height = 0;
  let colourType = -1;
  let bitDepth = 0;
  let interlace = 0;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    chunks.push(type);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colourType = data[9]!;
      interlace = data[12]!;
    } else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  expect(bitDepth, `${path} bit depth`).toBe(8);
  expect(interlace, `${path} interlace`).toBe(0);
  const bpp = colourType === 6 ? 4 : 3;
  expect([2, 6], `${path} colour type`).toContain(colourType);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = Buffer.alloc(stride * height);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const f = raw[src++]!;
    for (let x = 0; x < stride; x++) {
      const i = y * stride + x;
      const a = x >= bpp ? px[i - bpp]! : 0;
      const b = y > 0 ? px[i - stride]! : 0;
      const c = x >= bpp && y > 0 ? px[i - stride - bpp]! : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]!;
      px[i] = (raw[src++]! + pred) & 0xff;
    }
  }
  let rgba = px;
  if (bpp === 3) {
    rgba = Buffer.alloc(width * height * 4, 255);
    for (let i = 0, j = 0; i < px.length; i += 3, j += 4) px.copy(rgba, j, i, i + 3);
  }
  return { width, height, colourType, chunks, rgba };
}

const minAlpha = (p: Png): number => {
  let m = 255;
  for (let i = 3; i < p.rgba.length; i += 4) m = Math.min(m, p.rgba[i]!);
  return m;
};

describe('app icons (ART-18)', () => {
  it('iOS AppIcon: 1024 × 1024, RGB with no alpha channel, sRGB, referenced by the asset catalog', () => {
    const contents = JSON.parse(readFileSync(join(IOS, 'AppIcon.appiconset/Contents.json'), 'utf8')) as { images: { size: string; filename: string }[] };
    expect(contents.images).toEqual([expect.objectContaining({ size: '1024x1024', filename: 'AppIcon-512@2x.png' })]);
    for (const file of [join(IOS, 'AppIcon.appiconset/AppIcon-512@2x.png'), join(ROOT, 'resources/icon.png')]) {
      const p = readPng(file);
      expect([p.width, p.height], file).toEqual([1024, 1024]);
      expect(p.colourType, `${file}: RGB, no alpha`).toBe(2);
      expect(p.chunks, file).toContain('sRGB');
      expect(p.chunks, file).not.toContain('tRNS');
    }
  });

  it('PWA manifest icons exist at their stated sizes; the "any" 512 is the opaque 32-bit Google Play icon', () => {
    const manifest = JSON.parse(readFileSync(join(ROOT, 'public/manifest.webmanifest'), 'utf8')) as { icons: { src: string; sizes: string; purpose: string }[] };
    expect(manifest.icons.map((i) => i.purpose).sort()).toEqual(['any', 'any', 'maskable']);
    for (const icon of manifest.icons) {
      const file = join(ROOT, 'public', icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      const p = readPng(file);
      expect(`${p.width}x${p.height}`, icon.src).toBe(icon.sizes);
      if (icon.purpose === 'maskable') expect(minAlpha(p), `${icon.src} is full-bleed`).toBe(255);
    }
    const play = readPng(join(ROOT, 'public/icons/icon-512.png'));
    expect(play.colourType, 'Play hi-res icon is a 32-bit PNG').toBe(6);
    expect(minAlpha(play), 'Play hi-res icon is full-bleed (Play applies its own mask)').toBe(255);
  });

  it('apple-touch-icon: 180 × 180 and opaque (iOS paints transparency black)', () => {
    const p = readPng(join(ROOT, 'public/icons/apple-touch-icon.png'));
    expect([p.width, p.height]).toEqual([180, 180]);
    expect(minAlpha(p)).toBe(255);
  });

  const DENSITIES: ReadonlyArray<readonly [string, number]> = [
    ['ldpi', 0.75],
    ['mdpi', 1],
    ['hdpi', 1.5],
    ['xhdpi', 2],
    ['xxhdpi', 3],
    ['xxxhdpi', 4],
  ];

  it('Android: legacy 48 dp and adaptive 108 dp layers at every density, opaque background layer', () => {
    for (const [d, f] of DENSITIES) {
      const legacy = Math.round(48 * f);
      const layer = Math.round(108 * f);
      for (const name of ['ic_launcher', 'ic_launcher_round']) {
        const p = readPng(join(RES, `mipmap-${d}/${name}.png`));
        expect([p.width, p.height], `${d}/${name}`).toEqual([legacy, legacy]);
      }
      const fg = readPng(join(RES, `mipmap-${d}/ic_launcher_foreground.png`));
      expect([fg.width, fg.height], `${d} foreground`).toEqual([layer, layer]);
      expect(fg.colourType, `${d} foreground has alpha`).toBe(6);
      const bg = readPng(join(RES, `mipmap-${d}/ic_launcher_background.png`));
      expect([bg.width, bg.height], `${d} background`).toEqual([layer, layer]);
      expect(minAlpha(bg), `${d} background is opaque`).toBe(255);
    }
  });

  it('Android adaptive foreground: the art stays inside the 66 dp safe circle', () => {
    const p = readPng(join(RES, 'mipmap-xxxhdpi/ic_launcher_foreground.png'));
    const c = p.width / 2;
    const safe = (p.width * 33) / 108;
    // the art bound of src/render/appIcon.ts, as laid out on the 108 dp layer (tile = 72 dp), must itself be inside the safe circle
    const bound = (ART_RADIUS / 1024) * p.width * ADAPTIVE_ZOOM;
    expect(bound).toBeLessThan(safe);
    let far = 0;
    for (let y = 0; y < p.height; y++) {
      for (let x = 0; x < p.width; x++) {
        if (p.rgba[(y * p.width + x) * 4 + 3]! > 128) far = Math.max(far, Math.hypot(x + 0.5 - c, y + 0.5 - c));
      }
    }
    expect(far).toBeGreaterThan(safe * 0.6); // not empty
    expect(far).toBeLessThanOrEqual(bound + 1);
  });

  it('Android adaptive XML uses the 108 dp layers uninset', () => {
    for (const name of ['ic_launcher', 'ic_launcher_round']) {
      const xml = readFileSync(join(RES, `mipmap-anydpi-v26/${name}.xml`), 'utf8');
      expect(xml).toContain('<background android:drawable="@mipmap/ic_launcher_background" />');
      expect(xml).toContain('<foreground android:drawable="@mipmap/ic_launcher_foreground" />');
      expect(xml).not.toContain('<inset');
    }
  });

  it('launch screens: iOS 2732 squares and Android drawables are opaque RGB', () => {
    for (const scale of [1, 2, 3]) {
      for (const dark of ['', '-dark']) {
        const p = readPng(join(IOS, `Splash.imageset/Default@${scale}x~universal~anyany${dark}.png`));
        expect([p.width, p.height, p.colourType]).toEqual([2732, 2732, 2]);
      }
    }
    const port = readPng(join(RES, 'drawable-port-xxxhdpi/splash.png'));
    expect([port.width, port.height, port.colourType]).toEqual([1280, 1920, 2]);
  });
});
