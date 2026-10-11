/**
 * App icon + launch screen generator (ART-18). Every icon the game ships is drawn by
 * src/render/appIcon.ts (canvas primitives, the game's own tower sprites and palette) in headless
 * Chromium and written here — no external images, no SVG, no @capacitor/assets step:
 *
 *   PWA        public/icons/icon-192.png (rounded tile), icon-512.png (full-bleed: also the Google
 *              Play 512 hi-res icon, Play applies its own mask), icon-maskable-512.png (art in the
 *              80 % safe circle), apple-touch-icon.png (180, opaque — iOS rounds it)
 *   iOS        ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png (1024, opaque)
 *              Splash.imageset/Default@{1,2,3}x~universal~anyany{,-dark}.png (2732 launch screen)
 *   Android    res/mipmap-<density>/ic_launcher.png (legacy rounded tile), ic_launcher_round.png
 *              (circle), ic_launcher_foreground.png / ic_launcher_background.png (adaptive 108 dp
 *              layers, art inside the 66 dp safe circle; mipmap-anydpi-v26/*.xml use them uninset)
 *              res/drawable*\/splash.png (pre-Android-12 launch screen, every size already shipped)
 *   Masters    resources/icon.png (1024) and resources/splash.png (2732)
 *
 * Opaque targets (everything but the rounded / circle / foreground icons) are checked to have no
 * transparent pixel and written as 8-bit RGB PNGs with no alpha channel (App Store rule for the 1024
 * icon), except icon-512.png, which Google Play wants as a 32-bit PNG (RGBA, every pixel opaque).
 * Every file carries an sRGB chunk.
 *
 *   npm run icons:render                       # write every target in place
 *   npm run icons:render -- --variant=island   # another candidate (src/render/appIcon.ts APP_ICON_VARIANTS)
 *   npm run icons:render -- --out=<dir>        # write the same tree under <dir> instead (previews)
 *   npm run icons:render -- --only=icons       # skip the launch screens (or --only=splash)
 *
 * Uses the preinstalled sandbox Chromium when /opt/pw-browsers exists (never runs
 * `playwright install`); elsewhere falls back to the browser bundled with @playwright/test.
 */
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { constants, crc32, deflateSync, inflateSync } from 'node:zlib';

const ROOT = resolve(import.meta.dirname, '..');
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
/** Fake origin the page is served from (fonts load from it; localStorage etc. work, unlike about:blank). */
const ORIGIN = 'http://tower-clash.icons';
/** The native shells' launch colour (capacitor.config.ts `backgroundColor`). */
const LAUNCH_BG = '#0f172a';

type Shape = 'square' | 'rounded' | 'circle';
type Layer = 'full' | 'background' | 'foreground';

interface IconTarget {
  kind: 'icon';
  file: string;
  size: number;
  shape?: Shape;
  layer?: Layer;
  zoom?: number;
  /** Keep an alpha channel even though every pixel is opaque (Google Play wants a 32-bit 512 icon). */
  alpha?: boolean;
}
interface SplashTarget {
  kind: 'splash';
  file: string;
  w: number;
  h: number;
}
type Target = IconTarget | SplashTarget;

/** Mirrors src/render/appIcon.ts ADAPTIVE_ZOOM / MASKABLE_ZOOM (the page bundle exports them; checked at run time). */
const ADAPTIVE_ZOOM = 72 / 108;
const MASKABLE_ZOOM = 0.88;

const DENSITIES: ReadonlyArray<readonly [string, number]> = [
  ['ldpi', 0.75],
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
];
const RES = 'android/app/src/main/res';
const IOS = 'ios/App/App/Assets.xcassets';

function iconTargets(): IconTarget[] {
  const t: IconTarget[] = [
    { kind: 'icon', file: 'resources/icon.png', size: 1024 },
    { kind: 'icon', file: `${IOS}/AppIcon.appiconset/AppIcon-512@2x.png`, size: 1024 },
    { kind: 'icon', file: 'public/icons/icon-512.png', size: 512, alpha: true },
    { kind: 'icon', file: 'public/icons/icon-192.png', size: 192, shape: 'rounded' },
    { kind: 'icon', file: 'public/icons/icon-maskable-512.png', size: 512, zoom: MASKABLE_ZOOM },
    { kind: 'icon', file: 'public/icons/apple-touch-icon.png', size: 180 },
  ];
  for (const [d, f] of DENSITIES) {
    t.push({ kind: 'icon', file: `${RES}/mipmap-${d}/ic_launcher.png`, size: Math.round(48 * f), shape: 'rounded' });
    t.push({ kind: 'icon', file: `${RES}/mipmap-${d}/ic_launcher_round.png`, size: Math.round(48 * f), shape: 'circle' });
    const layer = Math.round(108 * f);
    t.push({ kind: 'icon', file: `${RES}/mipmap-${d}/ic_launcher_foreground.png`, size: layer, layer: 'foreground', zoom: ADAPTIVE_ZOOM });
    t.push({ kind: 'icon', file: `${RES}/mipmap-${d}/ic_launcher_background.png`, size: layer, layer: 'background', zoom: ADAPTIVE_ZOOM });
  }
  return t;
}

/** Every launch-screen bitmap the native projects reference, at the sizes they already ship. */
function splashTargets(): SplashTarget[] {
  const t: SplashTarget[] = [{ kind: 'splash', file: 'resources/splash.png', w: 2732, h: 2732 }];
  for (const scale of [1, 2, 3]) {
    for (const dark of ['', '-dark']) {
      t.push({ kind: 'splash', file: `${IOS}/Splash.imageset/Default@${scale}x~universal~anyany${dark}.png`, w: 2732, h: 2732 });
    }
  }
  const port: Record<string, readonly [number, number]> = {
    ldpi: [240, 320],
    mdpi: [320, 480],
    hdpi: [480, 800],
    xhdpi: [720, 1280],
    xxhdpi: [960, 1600],
    xxxhdpi: [1280, 1920],
  };
  for (const [d, [w, h]] of Object.entries(port)) {
    for (const night of ['', '-night']) {
      t.push({ kind: 'splash', file: `${RES}/drawable-port${night}-${d}/splash.png`, w, h });
      t.push({ kind: 'splash', file: `${RES}/drawable-land${night}-${d}/splash.png`, w: h, h: w });
    }
  }
  t.push({ kind: 'splash', file: `${RES}/drawable/splash.png`, w: 320, h: 480 });
  t.push({ kind: 'splash', file: `${RES}/drawable-night/splash.png`, w: 320, h: 240 });
  return t;
}

/** Whether a target is drawn fully opaque (full-bleed square, not the adaptive foreground). */
function opaque(t: Target): boolean {
  return t.kind === 'splash' || ((t.shape ?? 'square') === 'square' && (t.layer ?? 'full') !== 'foreground');
}

/** Whether the PNG carries an alpha channel: transparent targets, plus the opaque ones that ask for it. */
function withAlphaChannel(t: Target): boolean {
  return !opaque(t) || (t.kind === 'icon' && t.alpha === true);
}

/* ---------------------------------------------------------------- PNG codec (8-bit RGB / RGBA) */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(data, crc32(Buffer.from(type, 'latin1'))) >>> 0, 8 + data.length);
  return out;
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Decodes the non-interlaced 8-bit RGBA PNG Chromium's `toDataURL` writes into raw RGBA rows. */
function decodeRgba(buf: Buffer): { width: number; height: number; rgba: Buffer } {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9]!;
      if (data[8] !== 8 || data[12] !== 0) throw new Error('unsupported PNG (bit depth / interlace)');
    } else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!bpp) throw new Error(`unsupported PNG colour type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = Buffer.alloc(stride * height);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const f = raw[src++]!;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[row + x - bpp]! : 0;
      const b = y > 0 ? px[row - stride + x]! : 0;
      const c = x >= bpp && y > 0 ? px[row - stride + x - bpp]! : 0;
      const v = raw[src++]!;
      px[row + x] = (f === 0 ? v : f === 1 ? v + a : f === 2 ? v + b : f === 3 ? v + ((a + b) >> 1) : v + paeth(a, b, c)) & 0xff;
    }
  }
  if (bpp === 4) return { width, height, rgba: px };
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < px.length; i += 3, j += 4) {
    rgba[j] = px[i]!;
    rgba[j + 1] = px[i + 1]!;
    rgba[j + 2] = px[i + 2]!;
    rgba[j + 3] = 255;
  }
  return { width, height, rgba };
}

/**
 * Encodes RGBA rows as RGB (alpha dropped) or RGBA, sRGB tagged. `opaqueOnly` throws if any pixel
 * is not fully opaque (App Store icon, Play icon, launch screens).
 */
function encodePng(width: number, height: number, rgba: Buffer, alpha: boolean, opaqueOnly: boolean): Buffer {
  if (opaqueOnly) {
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) throw new Error('opaque target has a transparent pixel');
  }
  const bpp = alpha ? 4 : 3;
  let px = rgba;
  if (!alpha) {
    px = Buffer.alloc(width * height * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      px[j] = rgba[i]!;
      px[j + 1] = rgba[i + 1]!;
      px[j + 2] = rgba[i + 2]!;
    }
  }
  const stride = width * bpp;
  const out = Buffer.alloc((stride + 1) * height);
  const cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  let dst = 0;
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const sums = [0, 0, 0, 0, 0];
    for (let x = 0; x < stride; x++) {
      const v = px[row + x]!;
      const a = x >= bpp ? px[row + x - bpp]! : 0;
      const b = y > 0 ? px[row - stride + x]! : 0;
      const c = x >= bpp && y > 0 ? px[row - stride + x - bpp]! : 0;
      const r = [v, (v - a) & 0xff, (v - b) & 0xff, (v - ((a + b) >> 1)) & 0xff, (v - paeth(a, b, c)) & 0xff];
      for (let f = 0; f < 5; f++) {
        cand[f]![x] = r[f]!;
        sums[f]! += r[f]! < 128 ? r[f]! : 256 - r[f]!;
      }
    }
    let best = 0;
    for (let f = 1; f < 5; f++) if (sums[f]! < sums[best]!) best = f;
    out[dst++] = best;
    cand[best]!.copy(out, dst);
    dst += stride;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  const idat = deflateSync(out, { level: 9, memLevel: 9, strategy: constants.Z_FILTERED });
  // sRGB chunk, rendering intent 0 (perceptual)
  return Buffer.concat([SIGNATURE, pngChunk('IHDR', ihdr), pngChunk('sRGB', Buffer.from([0])), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

/* ---------------------------------------------------------------- render */

const PAGE_HELPERS = `
window.__render = async (t, variant) => {
  const c = document.createElement('canvas');
  const w = t.kind === 'icon' ? t.size : t.w;
  const h = t.kind === 'icon' ? t.size : t.h;
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (t.kind === 'icon') {
    TCIcon.drawAppIcon(ctx, w, { variant, shape: t.shape, layer: t.layer, zoom: t.zoom });
  } else {
    await document.fonts.load('700 100px Fredoka');
    TCIcon.drawSplash(ctx, w, h, { variant, background: '${LAUNCH_BG}', title: 'TOWER CLASH', font: 'Fredoka, sans-serif' });
  }
  return c.toDataURL('image/png');
};`;

const PAGE_HTML = `<!doctype html><html><head><style>
@font-face { font-family: 'Fredoka'; font-weight: 700; src: url('/fonts/fredoka-700-latin.woff2') format('woff2'); }
</style></head><body></body></html>`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const arg = (name: string): string | undefined => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const outDir = arg('out') ? resolve(arg('out')!) : ROOT;
  const only = arg('only');
  const bundle = await build({
    entryPoints: [join(ROOT, 'src/render/appIcon.ts')],
    bundle: true,
    format: 'iife',
    globalName: 'TCIcon',
    target: 'es2022',
    write: false,
    logLevel: 'error',
  });
  const browser = await chromium.launch({ executablePath: existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined });
  try {
    const page = await browser.newPage();
    await page.route(`${ORIGIN}/**`, (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.startsWith('/fonts/')) return route.fulfill({ contentType: 'font/woff2', body: readFileSync(join(ROOT, 'public', path)) });
      return route.fulfill({ contentType: 'text/html', body: PAGE_HTML });
    });
    await page.goto(`${ORIGIN}/`);
    await page.addScriptTag({ content: bundle.outputFiles[0]!.text + PAGE_HELPERS });
    const consts = (await page.evaluate('[TCIcon.ADAPTIVE_ZOOM, TCIcon.MASKABLE_ZOOM, TCIcon.DEFAULT_APP_ICON, TCIcon.APP_ICON_VARIANTS]')) as [number, number, string, string[]];
    if (consts[0] !== ADAPTIVE_ZOOM || consts[1] !== MASKABLE_ZOOM) throw new Error('zoom constants out of sync with src/render/appIcon.ts');
    const variant = arg('variant') ?? consts[2];
    if (!consts[3].includes(variant)) throw new Error(`unknown variant ${variant} (${consts[3].join(', ')})`);
    const targets: Target[] = [...(only === 'splash' ? [] : iconTargets()), ...(only === 'icons' ? [] : splashTargets())];
    for (const t of targets) {
      const url = (await page.evaluate(([tt, v]) => (window as unknown as { __render: (a: unknown, b: string) => Promise<string> }).__render(tt, v), [t, variant] as const)) as string;
      const { width, height, rgba } = decodeRgba(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
      const png = encodePng(width, height, rgba, withAlphaChannel(t), opaque(t));
      const file = join(outDir, t.file);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, png);
      console.log(`${t.file}  ${width}x${height}  ${withAlphaChannel(t) ? 'RGBA' : 'RGB'}${opaque(t) ? ' opaque' : ''}  ${(png.byteLength / 1024).toFixed(1)} KB`);
    }
    console.log(`variant: ${variant}`);
  } finally {
    await browser.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
