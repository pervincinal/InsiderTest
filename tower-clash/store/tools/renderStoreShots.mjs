#!/usr/bin/env node
/**
 * Renders the store assets from the real game with Playwright (PUB-2).
 *
 *   cd tower-clash && npm run build && node store/tools/renderStoreShots.mjs
 *
 * Output (all PNG, every file kept under 600 KB):
 *   store/screenshots/raw/NN-<name>.png   – uncaptioned 1080×1920 frames (viewport 360×640 @3x)
 *   store/screenshots/en/01..06.png       – captioned phone screenshots, English
 *   store/screenshots/az/01..06.png       – captioned phone screenshots, Azerbaijani
 *   store/feature-graphic.png             – 1024×500 Google Play feature graphic (drawn on canvas)
 *
 * The script starts `vite preview` on port 4180 itself and kills it on exit. Chromium is the
 * preinstalled headless shell under /opt/pw-browsers (never run `playwright install` here);
 * in other environments the default Playwright browser is used.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'); // tower-clash/
const STORE = join(ROOT, 'store');
const RAW = join(STORE, 'screenshots', 'raw');
const PORT = 4180;
const URL = `http://localhost:${PORT}/`;
const HEADLESS_SHELL = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const MAX_BYTES = 600 * 1024;
const OUT_W = 1080;
const OUT_H = 1920;

/** Order matters: index N becomes en/0N.png and az/0N.png. */
const SHOTS = [
  { name: 'title', en: 'Capture every tower', az: 'Bütün qüllələri tut' },
  { name: 'level-01-tutorial', en: 'One tap to attack', az: 'Bir toxunuşla hücum' },
  { name: 'level-05-battle', en: 'Upgrade to out-produce', az: 'Upgrade et, üstün gəl' },
  { name: 'level-09-fortress', en: 'Storm the fortress', az: 'Qalanı ələ keçir' },
  { name: 'level-15-citadel', en: 'Silence the guns', az: 'Topları susdur' },
  { name: 'result-win', en: 'Three-star every level', az: 'Hər səviyyədə üç ulduz' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- preview server ---------- */

async function startPreview() {
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) throw new Error('dist/ missing — run `npm run build` first');
  const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const child = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`vite preview exited early:\n${log}`);
    try {
      const res = await fetch(URL);
      if (res.ok) return child;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  child.kill('SIGKILL');
  throw new Error(`vite preview did not answer on ${URL} within 30 s:\n${log}`);
}

/* ---------- game driving ---------- */

async function openGame(browser) {
  // Fresh context = fresh localStorage, so level 1 shows its tutorial and coins start at 0.
  const context = await browser.newContext({
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(URL);
  await page.waitForFunction(() => typeof window.__towerclash?.getScreen === 'function');
  await page.waitForTimeout(600); // let the title demo animate in
  return page;
}

const screen = (page) => page.evaluate(() => window.__towerclash.getScreen());
const simTime = (page) => page.evaluate(() => window.__towerclash.getState()?.time ?? -1);

/** Start `id`, let the reference player fight at ×10 until sim time ≥ `untilMs`, then freeze at ×1. */
async function playUntil(page, id, untilMs) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate((lv) => {
      window.__towerclash.setSpeed(1);
      window.__towerclash.loadLevel(lv);
      window.__towerclash.setSpeed(10);
      window.__towerclash.autoplay();
    }, id);
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if ((await screen(page)) !== 'play') break;
      if ((await simTime(page)) >= untilMs) break;
      await sleep(100);
    }
    if ((await screen(page)) === 'play') {
      await page.evaluate(() => window.__towerclash.setSpeed(1)); // no "×10" tag in the HUD
      await page.waitForTimeout(80);
      return;
    }
    untilMs = Math.floor(untilMs / 2); // the bot already won — retry with an earlier frame
  }
  throw new Error(`level ${id}: could not capture a mid-battle frame`);
}

/**
 * Win `id` with the reference player. The result screen freezes the HUD as it was at the moment of
 * victory, so the last seconds run at ×1 (no "×10" tag) after a fast-forward to `fastUntilMs`.
 */
async function playToResult(page, id, fastUntilMs) {
  await page.evaluate((lv) => {
    window.__towerclash.setSpeed(1);
    window.__towerclash.loadLevel(lv);
    window.__towerclash.setSpeed(10);
    window.__towerclash.autoplay();
  }, id);
  let deadline = Date.now() + 60_000;
  while (Date.now() < deadline && (await screen(page)) === 'play' && (await simTime(page)) < fastUntilMs) await sleep(100);
  await page.evaluate(() => window.__towerclash.setSpeed(1));
  deadline = Date.now() + 90_000;
  while (Date.now() < deadline && (await screen(page)) !== 'result') await sleep(150);
  const result = await page.evaluate(() => window.__towerclash.getResult());
  if (result?.outcome !== 'won') throw new Error(`level ${id}: expected a win, got ${JSON.stringify(result)}`);
  await page.waitForTimeout(1800); // stars pop in one by one; capture particles fade
  return result;
}

async function captureRaw(browser) {
  mkdirSync(RAW, { recursive: true });
  const page = await openGame(browser);
  const out = (i) => join(RAW, `${String(i + 1).padStart(2, '0')}-${SHOTS[i].name}.png`);

  await page.screenshot({ path: out(0) });

  await page.evaluate(() => window.__towerclash.loadLevel(1));
  await page.waitForTimeout(700); // tutorial ring + hint bubble
  const hint = await page.evaluate(() => window.__towerclash.getTutorialHint());
  if (!hint) throw new Error('level 1: tutorial hint not visible on a fresh save');
  await page.screenshot({ path: out(1) });

  await playUntil(page, 5, 28_000);
  await page.screenshot({ path: out(2) });
  await playUntil(page, 9, 22_000);
  await page.screenshot({ path: out(3) });
  await playUntil(page, 15, 30_000);
  await page.screenshot({ path: out(4) });

  const result = await playToResult(page, 1, 12_000);
  await page.screenshot({ path: out(5) });
  console.log(`raw frames written (level 1 result: ${result.stars} stars, ${result.coinsEarned} coins)`);
  await page.context().close();
}

/* ---------- caption pass (canvas) ---------- */

const CANVAS_PAGE = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><canvas id="c"></canvas>`;

/** Draws `pngBase64` under a caption band and returns the composed PNG as base64. */
const composeInPage = async ({ png, caption, w, h, scale }) => {
  const c = document.getElementById('c');
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

  // water backdrop (game palette) with soft wave lines
  ctx.fillStyle = '#5ec1e6';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 6;
  for (let y = 40; y < h; y += 120) {
    ctx.beginPath();
    for (let x = -40; x <= w + 40; x += 20) ctx.lineTo(x, y + Math.sin((x + y) / 60) * 10);
    ctx.stroke();
  }

  // caption band
  const bandH = 300;
  const bandY = 40;
  let px = 84;
  ctx.font = `900 ${px}px ${FONT}`;
  while (ctx.measureText(caption).width > w - 120 && px > 40) ctx.font = `900 ${(px -= 2)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = px * 0.22;
  ctx.strokeStyle = '#1e2a44';
  ctx.strokeText(caption, w / 2, bandY + bandH / 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(caption, w / 2, bandY + bandH / 2);

  // the frame, scaled to fit below the band with a rounded mask and a shadow
  const img = new Image();
  img.src = `data:image/png;base64,${png}`;
  await img.decode();
  const top = bandY + bandH + 10;
  const availH = h - top - 30;
  const s = Math.min(availH / img.height, (w - 80) / img.width);
  const dw = img.width * s;
  const dh = img.height * s;
  const dx = (w - dw) / 2;
  const dy = top;
  const r = 40;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(dx + r, dy);
    ctx.arcTo(dx + dw, dy, dx + dw, dy + dh, r);
    ctx.arcTo(dx + dw, dy + dh, dx, dy + dh, r);
    ctx.arcTo(dx, dy + dh, dx, dy, r);
    ctx.arcTo(dx, dy, dx + dw, dy, r);
    ctx.closePath();
  };
  ctx.save();
  ctx.shadowColor = 'rgba(20,40,70,0.35)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = '#1e2a44';
  path();
  ctx.fill();
  ctx.restore();
  ctx.save();
  path();
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ffffff';
  path();
  ctx.stroke();

  return c.toDataURL('image/png').split(',')[1];
};

async function composeAll(browser) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.setContent(CANVAS_PAGE);
  const sizes = [];
  for (const lang of ['en', 'az']) mkdirSync(join(STORE, 'screenshots', lang), { recursive: true });

  for (let scale = 1; scale >= 0.5; scale -= 0.125) {
    sizes.length = 0;
    for (let i = 0; i < SHOTS.length; i++) {
      const raw = readFileSync(join(RAW, `${String(i + 1).padStart(2, '0')}-${SHOTS[i].name}.png`)).toString('base64');
      for (const lang of ['en', 'az']) {
        const b64 = await page.evaluate(composeInPage, { png: raw, caption: SHOTS[i][lang], w: OUT_W, h: OUT_H, scale });
        const file = join(STORE, 'screenshots', lang, `${String(i + 1).padStart(2, '0')}.png`);
        writeFileSync(file, Buffer.from(b64, 'base64'));
        sizes.push([file, statSync(file).size]);
      }
    }
    const largest = Math.max(...sizes.map(([, s]) => s));
    if (largest <= MAX_BYTES) {
      console.log(`captioned shots at ${OUT_W * scale}×${OUT_H * scale}, largest ${(largest / 1024).toFixed(0)} KB`);
      await page.close();
      return;
    }
    console.log(`scale ${scale}: largest ${(largest / 1024).toFixed(0)} KB > 600 KB, shrinking`);
  }
  throw new Error('could not get captioned screenshots under 600 KB');
}

/* ---------- feature graphic 1024×500 ---------- */

const drawFeatureInPage = () => {
  const W = 1024;
  const H = 500;
  const c = document.getElementById('c');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const P = {
    water: '#5ec1e6', waterLight: '#8fd9f0', grass: '#8fd16a', grassLight: '#a3dd7d', bush: '#5ea94a',
    cliff: '#e0c99a', cliffDark: '#b89b67', road: '#e8d9a8', text: '#1e2a44', selection: '#ffd23f',
    player: '#3b82f6', playerDark: '#1d4ed8', enemy: '#ef4444', enemyDark: '#b91c1c', neutral: '#8a94a6', neutralDark: '#5b6b85',
    crown: '#facc15', crownEdge: '#ca8a04', crownDot: '#fde68a',
  };

  // water + waves
  ctx.fillStyle = P.water;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = P.waterLight;
  ctx.lineWidth = 4;
  for (let y = 30; y < H; y += 70) {
    ctx.beginPath();
    for (let x = -30; x <= W + 30; x += 12) ctx.lineTo(x, y + Math.sin((x + y) / 45) * 6);
    ctx.stroke();
  }

  // island: cliff edge then grass plateau
  const island = (dy, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(60, 150 + dy);
    ctx.bezierCurveTo(140, 60 + dy, 420, 40 + dy, 620, 70 + dy);
    ctx.bezierCurveTo(820, 90 + dy, 1000, 140 + dy, 980, 270 + dy);
    ctx.bezierCurveTo(960, 400 + dy, 760, 470 + dy, 520, 450 + dy);
    ctx.bezierCurveTo(300, 435 + dy, 100, 420 + dy, 50, 320 + dy);
    ctx.bezierCurveTo(20, 250 + dy, 30, 190 + dy, 60, 150 + dy);
    ctx.closePath();
    ctx.fill();
  };
  island(18, P.cliffDark);
  island(10, P.cliff);
  island(0, P.grass);
  ctx.fillStyle = P.grassLight;
  for (const [x, y, r] of [[300, 330, 70], [700, 150, 55], [880, 400, 45]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = P.bush;
  for (const [x, y] of [[130, 250], [180, 380], [900, 230], [820, 400], [560, 420], [660, 60], [420, 90]]) {
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.arc(x + 14, y + 4, 10, 0, Math.PI * 2);
    ctx.arc(x - 12, y + 5, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  // roads between the three towers
  const T = [
    { x: 150, y: 160, n: 24, fill: P.player, edge: P.playerDark, crown: true },
    { x: 890, y: 130, n: 18, fill: P.enemy, edge: P.enemyDark, flag: true },
    { x: 800, y: 320, n: 7, fill: P.neutral, edge: P.neutralDark },
  ];
  ctx.strokeStyle = P.road;
  ctx.lineWidth = 22;
  ctx.lineCap = 'round';
  for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) {
    ctx.beginPath();
    ctx.moveTo(T[a].x, T[a].y);
    ctx.lineTo(T[b].x, T[b].y);
    ctx.stroke();
  }
  // marching dots (player blue heading to the neutral tower)
  for (let i = 1; i <= 6; i++) {
    const t = 0.25 + i * 0.07;
    const x = T[0].x + (T[2].x - T[0].x) * t;
    const y = T[0].y + (T[2].y - T[0].y) * t;
    ctx.fillStyle = P.player;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = P.playerDark;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // towers in the app-icon look: filled disc, darker ring, bold count, crown for the player
  const crown = (x, y, s) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(-120, 60); ctx.lineTo(-90, -30); ctx.lineTo(-36, 30); ctx.lineTo(0, -60);
    ctx.lineTo(36, 30); ctx.lineTo(90, -30); ctx.lineTo(120, 60); ctx.closePath();
    ctx.fillStyle = P.crown; ctx.strokeStyle = P.crownEdge; ctx.lineWidth = 10; ctx.lineJoin = 'round';
    ctx.fill(); ctx.stroke();
    ctx.fillRect(-120, 60, 240, 40); ctx.strokeRect(-120, 60, 240, 40);
    ctx.fillStyle = P.crownDot;
    for (const [cx, cy, r] of [[-90, -30, 16], [0, -60, 18], [90, -30, 16]]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  };
  for (const t of T) {
    const R = 54;
    ctx.fillStyle = 'rgba(25,45,70,0.22)';
    ctx.beginPath(); ctx.ellipse(t.x, t.y + R * 0.9, R * 1.1, R * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(59,130,246,0.12)';
    ctx.beginPath(); ctx.arc(t.x, t.y, R * 1.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.fill;
    ctx.beginPath(); ctx.arc(t.x, t.y, R, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = t.edge; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `900 ${R * 1.15}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(t.n), t.x, t.y + 4);
    if (t.crown) crown(t.x, t.y - R - 22, 0.22);
    if (t.flag) {
      ctx.strokeStyle = P.text; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(t.x + R - 6, t.y - R + 4); ctx.lineTo(t.x + R - 6, t.y - R - 40); ctx.stroke();
      ctx.fillStyle = P.enemy;
      ctx.beginPath(); ctx.moveTo(t.x + R - 6, t.y - R - 40); ctx.lineTo(t.x + R + 30, t.y - R - 30); ctx.lineTo(t.x + R - 6, t.y - R - 18); ctx.closePath(); ctx.fill();
    }
  }

  // title in the game's outlined style
  const outlined = (text, x, y, fill, px) => {
    ctx.font = `900 ${px}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = px * 0.2; ctx.strokeStyle = P.text; ctx.strokeText(text, x, y);
    ctx.fillStyle = fill; ctx.fillText(text, x, y);
  };
  outlined('TOWER', 512, 150, '#ffffff', 118);
  outlined('CLASH', 512, 262, P.selection, 118);
  // tagline pill
  ctx.font = `bold 30px ${FONT}`;
  const tag = 'Capture every tower';
  const tw = ctx.measureText(tag).width + 56;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.roundRect(512 - tw / 2, 372, tw, 56, 28); ctx.fill();
  ctx.strokeStyle = '#b8c6da'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = P.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(tag, 512, 401);

  return c.toDataURL('image/png').split(',')[1];
};

async function featureGraphic(browser) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await page.setContent(CANVAS_PAGE);
  const b64 = await page.evaluate(drawFeatureInPage);
  const file = join(STORE, 'feature-graphic.png');
  writeFileSync(file, Buffer.from(b64, 'base64'));
  await page.close();
  const size = statSync(file).size;
  if (size > MAX_BYTES) throw new Error(`feature graphic is ${size} bytes (> 600 KB)`);
  console.log(`feature graphic written (${(size / 1024).toFixed(0)} KB)`);
}

/* ---------- main ---------- */

const server = await startPreview();
const cleanup = () => {
  if (server.exitCode === null) server.kill('SIGTERM');
};
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

try {
  const browser = await chromium.launch(existsSync(HEADLESS_SHELL) ? { executablePath: HEADLESS_SHELL } : {});
  try {
    await captureRaw(browser);
    await composeAll(browser);
    await featureGraphic(browser);
  } finally {
    await browser.close();
  }
} finally {
  cleanup();
}
