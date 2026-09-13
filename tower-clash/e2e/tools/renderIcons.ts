import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

/*
 * Renders the PWA icons with the game's own canvas look (dark navy rounded square, blue tower
 * with a white "1", yellow crown) and writes them to public/icons/. No external tools: the same
 * Chromium the smoke test uses draws the PNGs.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node --experimental-strip-types e2e/tools/renderIcons.ts
 *
 * (Run with node's native type stripping, not tsx: esbuild's keepNames injects a `__name` helper
 * into `drawIcon`, which then fails inside page.evaluate.)
 */

const LOCAL_HEADLESS_SHELL = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const OUT_DIR = fileURLToPath(new URL('../../public/icons/', import.meta.url));

interface IconSpec {
  file: string;
  size: number;
  /** Maskable icons are full-bleed squares with content inside the inner 80% safe zone. */
  maskable: boolean;
}

const ICONS: IconSpec[] = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
];

/** Runs inside the browser. Mirrors src/render/palette.ts colours. */
function drawIcon(spec: { size: number; maskable: boolean }): string {
  const { size, maskable } = spec;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  const navy = '#0f172a';
  const navyDark = '#020617';
  const blue = '#3b82f6';
  const blueDark = '#1d4ed8';
  const yellow = '#facc15';
  const white = '#f8fafc';

  const rounded = (x: number, y: number, w: number, h: number, r: number): void => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  // Background: full-bleed for maskable, rounded square with a dark rim otherwise.
  if (maskable) {
    ctx.fillStyle = navy;
    ctx.fillRect(0, 0, size, size);
  } else {
    ctx.fillStyle = navyDark;
    rounded(0, 0, size, size, size * 0.22);
    ctx.fill();
    ctx.fillStyle = navy;
    rounded(size * 0.04, size * 0.04, size * 0.92, size * 0.92, size * 0.19);
    ctx.fill();
  }

  // Faint roads behind the tower so it reads as "the map".
  const cx = size / 2;
  const cy = size * (maskable ? 0.56 : 0.585);
  const scale = maskable ? 0.78 : 1;
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = size * 0.05 * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(size * 0.16, size * 0.84);
  ctx.lineTo(cx, cy);
  ctx.lineTo(size * 0.84, size * 0.84);
  ctx.moveTo(cx, cy);
  ctx.lineTo(size * 0.8, size * 0.2);
  ctx.stroke();
  ctx.fillStyle = '#475569';
  for (const [px, py] of [
    [0.16, 0.84],
    [0.84, 0.84],
    [0.8, 0.2],
  ] as const) {
    ctx.beginPath();
    ctx.arc(size * px, size * py, size * 0.07 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tower body.
  const r = size * 0.27 * scale;
  ctx.fillStyle = blue;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = blueDark;
  ctx.lineWidth = size * 0.02;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.35, r * 0.62, 0, Math.PI * 2);
  ctx.fill();

  // Garrison number.
  ctx.font = `900 ${Math.round(r * 1.35)}px system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = r * 0.22;
  ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)';
  ctx.strokeText('1', cx, cy + r * 0.06);
  ctx.fillStyle = white;
  ctx.fillText('1', cx, cy + r * 0.06);

  // Crown above the tower (same silhouette as the level pips in draw.ts, scaled up).
  const pw = r * 0.56;
  const py = cy - r - r * 0.36;
  ctx.fillStyle = yellow;
  ctx.beginPath();
  ctx.moveTo(cx - pw, py + pw * 0.8);
  ctx.lineTo(cx - pw, py - pw * 0.5);
  ctx.lineTo(cx - pw * 0.33, py + pw * 0.15);
  ctx.lineTo(cx, py - pw);
  ctx.lineTo(cx + pw * 0.33, py + pw * 0.15);
  ctx.lineTo(cx + pw, py - pw * 0.5);
  ctx.lineTo(cx + pw, py + pw * 0.8);
  ctx.closePath();
  ctx.fill();

  return canvas.toDataURL('image/png');
}

async function main(): Promise<void> {
  const launchOptions = existsSync(LOCAL_HEADLESS_SHELL) ? { executablePath: LOCAL_HEADLESS_SHELL } : {};
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    mkdirSync(OUT_DIR, { recursive: true });
    for (const icon of ICONS) {
      const dataUrl = await page.evaluate(drawIcon, { size: icon.size, maskable: icon.maskable });
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      writeFileSync(`${OUT_DIR}${icon.file}`, Buffer.from(base64, 'base64'));
      console.log(`wrote ${icon.file} (${icon.size}×${icon.size}${icon.maskable ? ', maskable' : ''})`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
