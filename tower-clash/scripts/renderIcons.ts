/**
 * Renders resources/icon.svg and resources/splash.svg to PNG with headless Chromium.
 * Output: resources/icon.png (1024x1024) and resources/splash.png (2732x2732),
 * which `@capacitor/assets generate` then turns into every platform-specific size.
 *
 * Uses the preinstalled sandbox Chromium when /opt/pw-browsers exists (never runs
 * `playwright install`); elsewhere falls back to the browser bundled with @playwright/test.
 */
import { chromium } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const RESOURCES = resolve(ROOT, 'resources');
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

const TARGETS: ReadonlyArray<{ svg: string; png: string; size: number }> = [
  { svg: 'icon.svg', png: 'icon.png', size: 1024 },
  { svg: 'splash.svg', png: 'splash.png', size: 2732 },
];

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined,
  });
  try {
    for (const t of TARGETS) {
      const svg = readFileSync(resolve(RESOURCES, t.svg), 'utf8');
      const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
      await page.setContent(
        `<!doctype html><html><head><style>html,body{margin:0;background:#0f172a;overflow:hidden}svg{display:block;width:${t.size}px;height:${t.size}px}</style></head><body>${svg}</body></html>`,
      );
      const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: t.size, height: t.size } });
      writeFileSync(resolve(RESOURCES, t.png), png);
      await page.close();
      console.log(`rendered resources/${t.png} (${t.size}x${t.size}, ${png.byteLength} bytes)`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
