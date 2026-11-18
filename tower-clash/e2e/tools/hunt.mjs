#!/usr/bin/env node
/*
 * QA-35 renderer-hang hunt rig (Day 48 original lost with the scratchpad; rebuilt Day 61, QA-44).
 *
 * The bug it hunts: under CI-shaped load a play page's main thread stops for good on the first play
 * frame — `page.evaluate` never returns, `expect.poll` keeps reading its last answer, no `pageerror`,
 * the browser process is fine (CI run 118 economy "rewinds" on level 15 seed 1 at ×20; locally once on
 * 2026-11-05, content.spec level 40 idle). e2e/economy.spec.ts prints `RENDERER HUNG …` when its
 * bounded poll meets it; this rig is the thing to run to get a JS stack out of the paused page.
 *
 * Usage (from tower-clash/, after a scratch build that keeps its hidden source maps —
 * `npx vite build --outDir <scratch>/dist --emptyOutDir`; the plain build has them too):
 *
 *   node e2e/tools/hunt.mjs --dist <scratch>/dist --out <scratch>/out --port 4192 \
 *        --level 40 --seeds 1-60 --mode idle [--browser shell|full] [--cpu 4] [--hogs 2] [--pixel5] [--trace]
 *   node e2e/tools/hunt.mjs … --level 15 --seeds 1-60 --mode lose --speed 20        # run 118's test
 *   node e2e/tools/hunt.mjs … --level 1 --seeds 1-5 --mode autoplay --speed 10       # smoke-shaped
 *
 *   --dist DIR      build to serve (default dist/); its `assets/*.js.map` files map the stack
 *   --out DIR       where hang reports (`hang-<mode>-L<level>-s<seed>.json`, traces) go (default <dist>/../hunt-out)
 *   --port N        own `vite preview` port (default 4192; use 4191–4192 here) — `--no-server` to attach to one
 *   --browser X     `shell` = the headless shell under /opt/pw-browsers (what the e2e run uses),
 *                   `full` = full Chromium there with `--headless=new --mute-audio`; default shell
 *   --cpu R         `Emulation.setCPUThrottlingRate` R (default 1 = off)
 *   --hogs N        N busy-loop node children beside the browser for the run (default 0)
 *   --pixel5        Playwright's Pixel 5 device (the chromium project's metrics: 393 × 851, DPR 2.75, touch)
 *   --trace         Playwright tracing (screenshots + snapshots) on, like the e2e run's `retain-on-failure`
 *   --hang-ms MS    bounded evaluate budget (default 5000 = e2e/economy.spec.ts EVALUATE_HANG_MS)
 *   --result-s S    budget for the lose / autoplay result (default 60 s, the spec's poll)
 *   --selftest      after boot, spin the page's main thread in a JS loop (an induced hang) so the pause →
 *                   stack → source-map path proves itself; expect exit 2 with a stack ending in the spin
 *
 * Every `page.evaluate` is raced against `--hang-ms`. On a hang: `Debugger.pause`, wait ≤ 3 s for
 * `Debugger.paused`, print the call frames (function, mapped source:line:col via the dist's maps,
 * the minified position beside it), read `performance.now()` / `document.hidden` / the screen name
 * on the top frame with `Debugger.evaluateOnCallFrame`, dump scope previews, resume, close the page and
 * go on with the next seed. A pause that never answers is reported too — that means the thread is
 * inside native code (canvas / GPU / layout) or the renderer is gone, and the report says so.
 *
 * Exit 2 when a hang was caught (the report path is in the output), 1 on a boot / result failure
 * that is not a hang, 0 when every seed reached its target.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium, devices } from '@playwright/test';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const BROWSERS = '/opt/pw-browsers';

function parseArgs(argv) {
  const o = {
    dist: 'dist',
    out: '',
    port: 4192,
    server: true,
    browser: 'shell',
    cpu: 1,
    hogs: 0,
    pixel5: false,
    trace: false,
    hangMs: 5000,
    resultS: 60,
    selftest: false,
    level: 40,
    seeds: [1, 10],
    mode: 'idle',
    speed: 1,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--dist') o.dist = next();
    else if (a === '--out') o.out = next();
    else if (a === '--port') o.port = Number(next());
    else if (a === '--no-server') o.server = false;
    else if (a === '--browser') o.browser = next();
    else if (a === '--cpu') o.cpu = Number(next());
    else if (a === '--hogs') o.hogs = Number(next());
    else if (a === '--pixel5') o.pixel5 = true;
    else if (a === '--trace') o.trace = true;
    else if (a === '--hang-ms') o.hangMs = Number(next());
    else if (a === '--result-s') o.resultS = Number(next());
    else if (a === '--selftest') o.selftest = true;
    else if (a === '--level') o.level = Number(next());
    else if (a === '--seeds') {
      const m = /^(\d+)(?:-(\d+))?$/.exec(next() ?? '');
      if (!m) throw new Error('--seeds a-b');
      o.seeds = [Number(m[1]), Number(m[2] ?? m[1])];
    } else if (a === '--mode') o.mode = next();
    else if (a === '--speed') o.speed = Number(next());
    else throw new Error(`unknown argument ${a}`);
  }
  if (!['idle', 'lose', 'autoplay'].includes(o.mode)) throw new Error('--mode idle|lose|autoplay');
  if (!['shell', 'full'].includes(o.browser)) throw new Error('--browser shell|full');
  o.dist = path.resolve(ROOT, o.dist);
  o.out = path.resolve(ROOT, o.out || path.join(o.dist, '..', 'hunt-out'));
  return o;
}

/** The two Chromium builds the sandbox ships (playwright.config.ts `localHeadlessShell` finds the shell the same way). */
function findBinary(kind) {
  if (!existsSync(BROWSERS)) return undefined;
  const prefix = kind === 'shell' ? 'chromium_headless_shell-' : 'chromium-';
  const dirs = readdirSync(BROWSERS)
    .filter((d) => d.startsWith(prefix))
    .sort()
    .reverse();
  const rels = kind === 'shell' ? ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/headless_shell'] : ['chrome-linux64/chrome', 'chrome-linux/chrome'];
  for (const d of dirs) for (const rel of rels) if (existsSync(path.join(BROWSERS, d, rel))) return path.join(BROWSERS, d, rel);
  return undefined;
}
/** Source-map lookup for the served build: `http://host/assets/x-HASH.js` → `<dist>/assets/x-HASH.js.map`. */
export async function makeMapper(dist) {
  let SourceMapConsumer;
  try {
    ({ SourceMapConsumer } = await import('source-map-js')); // vite's own dependency; absent → raw positions only
  } catch {
    SourceMapConsumer = undefined;
  }
  const consumers = new Map();
  return (url, line0, col0) => {
    const m = /\/(assets\/[^/?#]+\.js)(?:[?#].*)?$/.exec(url ?? '');
    const raw = `${m ? m[1] : url}:${line0 + 1}:${col0 + 1}`;
    if (!m || !SourceMapConsumer) return { raw, mapped: null };
    const mapFile = path.join(dist, `${m[1]}.map`);
    if (!consumers.has(mapFile)) {
      try {
        consumers.set(mapFile, new SourceMapConsumer(JSON.parse(readFileSync(mapFile, 'utf8'))));
      } catch {
        consumers.set(mapFile, null);
      }
    }
    const c = consumers.get(mapFile);
    if (!c) return { raw, mapped: null };
    const pos = c.originalPositionFor({ line: line0 + 1, column: col0 });
    if (!pos.source) return { raw, mapped: null };
    const src = pos.source.replace(/^(\.\.\/)+/, '').replace(/^.*?\/src\//, 'src/');
    return { raw, mapped: `${src}:${pos.line}:${pos.column + 1}${pos.name ? ` (${pos.name})` : ''}` };
  };
}

async function waitForServer(url, ms) {
  const t0 = Date.now();
  for (;;) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() - t0 > ms) throw new Error(`preview did not answer on ${url} within ${ms} ms`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

const HUNG = Symbol('hung');

async function main() {
  const o = parseArgs(process.argv.slice(2));
  mkdirSync(o.out, { recursive: true });
  const mapPos = await makeMapper(o.dist);
  const children = [];
  const stopChildren = () => {
    for (const c of children) if (!c.killed) c.kill('SIGTERM');
  };
  process.on('exit', stopChildren);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      stopChildren();
      process.exit(sig === 'SIGINT' ? 130 : 143);
    });
  }

  const base = `http://localhost:${o.port}`;
  if (o.server) {
    if (!existsSync(path.join(o.dist, 'index.html'))) throw new Error(`no build at ${o.dist} — npx vite build --outDir ${o.dist} --emptyOutDir`);
    // vite's bin directly (no npx wrapper to outlive a kill) with every stdio ignored, so a rig that dies
    // under `timeout` leaves no child holding the caller's pipe; its own exit is reported here instead
    const srv = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--outDir', o.dist, '--port', String(o.port), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
    srv.on('exit', (code) => {
      if (code !== null && code !== 0) console.error(`hunt: vite preview exited ${code} (port ${o.port} taken? stop a stray one: ps -eo pid,args | grep "[v]ite preview")`);
    });
    children.push(srv);
    await waitForServer(base + '/', 30_000);
  }
  for (let i = 0; i < o.hogs; i++) children.push(spawn(process.execPath, ['-e', 'for(;;){}'], { stdio: 'ignore' }));

  const bin = findBinary(o.browser);
  if (!bin) throw new Error(`no ${o.browser} Chromium under ${BROWSERS}`);
  const launch = o.browser === 'full' ? { executablePath: bin, headless: false, args: ['--headless=new', '--mute-audio'] } : { executablePath: bin };
  const browser = await chromium.launch(launch);
  const version = browser.version();
  console.log(`hunt: mode=${o.mode} level=${o.level} seeds=${o.seeds[0]}-${o.seeds[1]} speed=${o.speed} browser=${o.browser} ${version} cpu=${o.cpu}x hogs=${o.hogs} pixel5=${o.pixel5} trace=${o.trace} hangMs=${o.hangMs} dist=${o.dist}`);

  let hangs = 0;
  let failures = 0;
  let reached = 0;
  let run = 0;
  for (let seed = o.seeds[0]; seed <= o.seeds[1]; seed++) {
    run++;
    const t0 = Date.now();
    const ctx = await browser.newContext({ ...(o.pixel5 ? devices['Pixel 5'] : {}), baseURL: base, serviceWorkers: 'block' });
    if (o.trace) await ctx.tracing.start({ screenshots: true, snapshots: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror ${String(e)}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console ${m.text()}`);
    });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Debugger.enable');
    await cdp.send('Debugger.setAsyncCallStackDepth', { maxDepth: 8 });
    if (o.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: o.cpu });

    const steps = [];
    let hung = null;
    /** `page.evaluate` raced against the hang budget; on a hang the paused stack is captured and `HUNG` returned. */
    const bounded = async (label, fn, arg) => {
      let timer;
      const trap = new Promise((res) => {
        timer = setTimeout(() => res(HUNG), o.hangMs);
      });
      const r = await Promise.race([page.evaluate(fn, arg).then((v) => ({ v }), (e) => ({ e: String(e) })), trap]);
      clearTimeout(timer);
      if (r !== HUNG) {
        if (r.e) throw new Error(`${label}: ${r.e}`);
        return r.v;
      }
      hung = await captureStack(cdp, label, mapPos);
      hung.seed = seed;
      hung.level = o.level;
      hung.mode = o.mode;
      hung.browser = `${o.browser} ${version}`;
      hung.cpu = o.cpu;
      hung.hogs = o.hogs;
      hung.steps = steps;
      hung.errors = errors;
      hung.wallMs = Date.now() - t0;
      return HUNG;
    };
    const mark = (s) => steps.push(`${s}@${((Date.now() - t0) / 1000).toFixed(2)}s`);
    const poll = async (label, fn, want, budgetMs) => {
      const start = Date.now();
      let last;
      for (;;) {
        last = await bounded(label, fn);
        if (last === HUNG) return HUNG;
        if (want(last)) return last;
        if (Date.now() - start > budgetMs) throw new Error(`${label}: still ${JSON.stringify(last)} after ${budgetMs} ms`);
        await new Promise((r) => setTimeout(r, 250));
      }
    };

    let line;
    try {
      await page.goto('/');
      await page.waitForFunction(() => typeof window.__towerclash?.loadLevel === 'function', undefined, { timeout: 20_000 });
      mark('boot');
      // frame counter, as e2e/economy.spec.ts installs for the RENDERER HUNG message
      await bounded('counter', () => {
        const w = window;
        w.__qa35 = { frames: 0, at: performance.now() };
        const raf = w.requestAnimationFrame.bind(window);
        w.requestAnimationFrame = (cb) =>
          raf((t) => {
            w.__qa35.frames++;
            cb(t);
          });
      });
      if (o.selftest) {
        // a JS busy loop stands in for the real hang: the trap must pause it and name this frame
        const r0 = await bounded('selftest-spin', () => {
          const t = performance.now();
          while (performance.now() - t < 120_000) {
            /* spin */
          }
        });
        if (r0 === HUNG) throw HUNG;
        throw new Error('selftest: the induced spin was not caught as a hang');
      }
      const frames = () => bounded('frames', () => window.__qa35.frames);
      const screen = () => bounded('screen', () => window.__towerclash.getScreen());
      const sim = () => bounded('sim', () => window.__towerclash.getState()?.time ?? -1);
      let r = await bounded('loadLevel', ([lvl, s]) => window.__towerclash.loadLevel(lvl, s), [o.level, seed]);
      if (r === HUNG) throw HUNG;
      if (r !== true) throw new Error(`loadLevel(${o.level}) returned ${String(r)}`);
      if (o.mode === 'lose') {
        r = await bounded('speed+autoLose', (sp) => {
          window.__towerclash.setSpeed(sp);
          window.__towerclash.economy.autoLose();
        }, o.speed);
        if (r === HUNG) throw HUNG;
      }
      r = await poll('screen→play', () => window.__towerclash.getScreen(), (v) => v === 'play', 15_000);
      if (r === HUNG) throw HUNG;
      mark('play');
      if (o.mode !== 'lose') {
        r = await bounded('startMatch', () => window.__towerclash.startMatch());
        if (r === HUNG) throw HUNG;
        r = await poll('sim>0', () => window.__towerclash.getState()?.time ?? -1, (v) => v > 0, 15_000);
        if (r === HUNG) throw HUNG;
        mark(`sim=${r}`);
        // the first play frame must finish: wait for two more painted frames (the local repro died before the first)
        const f0 = await frames();
        if (f0 === HUNG) throw HUNG;
        r = await poll('frames+2', () => window.__qa35.frames, (v) => v >= f0 + 2, 15_000);
        if (r === HUNG) throw HUNG;
        mark(`frames=${r}`);
      }
      if (o.mode === 'autoplay') {
        r = await bounded('autoplay', (sp) => {
          window.__towerclash.autoplay();
          window.__towerclash.setSpeed(sp);
        }, o.speed);
        if (r === HUNG) throw HUNG;
      }
      if (o.mode !== 'idle') {
        r = await poll('screen→result', () => window.__towerclash.getScreen(), (v) => v === 'result', o.resultS * 1000);
        if (r === HUNG) throw HUNG;
        const res = await bounded('result', () => ({ outcome: window.__towerclash.getResult()?.outcome, sim: window.__towerclash.getState()?.time ?? -1 }));
        if (res === HUNG) throw HUNG;
        mark(`result ${res.outcome} sim=${res.sim}`);
      }
      const fr = await frames();
      const sc = await screen();
      const st = await sim();
      if (fr === HUNG || sc === HUNG || st === HUNG) throw HUNG;
      reached++;
      line = `seed ${seed}: ok ${steps.join(' ')} frames=${fr} screen=${sc} sim=${st} wall=${((Date.now() - t0) / 1000).toFixed(1)}s${errors.length ? ` ERRORS ${errors.join(' | ')}` : ''}`;
    } catch (e) {
      if (e === HUNG && hung) {
        hangs++;
        const file = path.join(o.out, `hang-${o.mode}-L${o.level}-s${seed}.json`);
        writeFileSync(file, JSON.stringify(hung, null, 2));
        line = `seed ${seed}: *** RENDERER HUNG at ${hung.step} after ${steps.join(' ')} (${hung.wallMs} ms) → ${file}\n${formatStack(hung)}`;
      } else {
        failures++;
        line = `seed ${seed}: FAIL ${steps.join(' ')} ${String(e && e.message ? e.message : e)}${errors.length ? ` ERRORS ${errors.join(' | ')}` : ''}`;
      }
    }
    console.log(line);
    try {
      if (o.trace) await ctx.tracing.stop(hung ? { path: path.join(o.out, `trace-${o.mode}-L${o.level}-s${seed}.zip`) } : {});
    } catch {
      /* a hung page may not answer the tracing stop; the stack is already on disk */
    }
    await Promise.race([ctx.close(), new Promise((r) => setTimeout(r, 10_000))]);
  }
  await browser.close();
  stopChildren();
  console.log(`hunt summary: mode=${o.mode} level=${o.level} browser=${o.browser} ${version} cpu=${o.cpu}x hogs=${o.hogs} pixel5=${o.pixel5} trace=${o.trace} seeds=${run} reached=${reached} hangs=${hangs} failures=${failures}`);
  process.exit(hangs ? 2 : failures ? 1 : 0);
}

/** `Debugger.pause` the hung page and read its stack; never throws, always returns a report object. */
async function captureStack(cdp, step, mapPos) {
  const report = { step, pausedAt: null, frames: [], asyncParents: [], topFrame: null, note: '' };
  const paused = new Promise((res) => cdp.once('Debugger.paused', res));
  try {
    await Promise.race([cdp.send('Debugger.pause'), new Promise((r) => setTimeout(r, 3000))]);
  } catch (e) {
    report.note += `Debugger.pause rejected: ${String(e)}; `;
  }
  const ev = await Promise.race([paused, new Promise((r) => setTimeout(() => r(null), 3000))]);
  if (!ev) {
    report.note += 'Debugger.paused never fired within 3 s: the main thread is not in JS (native canvas / GPU / layout work, or the renderer is gone)';
    return report;
  }
  report.pausedAt = Date.now();
  report.reason = ev.reason;
  for (const f of ev.callFrames) {
    const { raw, mapped } = mapPos(f.url, f.location.lineNumber, f.location.columnNumber);
    const frame = { fn: f.functionName || '(anonymous)', raw, mapped, scopes: [] };
    for (const s of f.scopeChain.slice(0, 2)) {
      if (!s.object?.objectId || s.type === 'global') continue;
      try {
        const props = await Promise.race([cdp.send('Runtime.getProperties', { objectId: s.object.objectId, ownProperties: true }), new Promise((r) => setTimeout(() => r(null), 1500))]);
        if (props) frame.scopes.push({ type: s.type, vars: props.result.slice(0, 20).map((p) => `${p.name}=${p.value?.description ?? p.value?.value ?? p.value?.type ?? '?'}`.slice(0, 120)) });
      } catch {
        /* a scope that cannot be read is not the point */
      }
    }
    report.frames.push(frame);
  }
  let parent = ev.asyncStackTrace;
  while (parent && report.asyncParents.length < 8) {
    report.asyncParents.push({
      description: parent.description,
      frames: parent.callFrames.map((f) => {
        const { raw, mapped } = mapPos(f.url, f.lineNumber, f.columnNumber);
        return `${f.functionName || '(anonymous)'} ${mapped ?? raw}`;
      }),
    });
    parent = parent.parent;
  }
  const top = ev.callFrames[0]?.callFrameId;
  if (top) {
    const probes = ['performance.now()', 'document.hidden', 'window.__towerclash && window.__towerclash.getScreen()', 'window.__towerclash && window.__towerclash.getState() && window.__towerclash.getState().time', 'window.__qa35 && window.__qa35.frames'];
    report.topFrame = {};
    for (const expression of probes) {
      try {
        const r = await Promise.race([cdp.send('Debugger.evaluateOnCallFrame', { callFrameId: top, expression, returnByValue: true }), new Promise((res) => setTimeout(() => res(null), 1500))]);
        report.topFrame[expression] = r ? (r.exceptionDetails ? `throws ${r.exceptionDetails.text}` : r.result.value) : 'no answer';
      } catch (e) {
        report.topFrame[expression] = `error ${String(e)}`;
      }
    }
  }
  try {
    await Promise.race([cdp.send('Debugger.resume'), new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    /* leave it paused; the context is closed right after */
  }
  return report;
}

function formatStack(h) {
  const lines = [`  reason=${h.reason ?? '-'} ${h.note}`];
  h.frames.forEach((f, i) => lines.push(`  #${i} ${f.fn} ${f.mapped ?? f.raw}${f.mapped ? `  [${f.raw}]` : ''}`));
  for (const a of h.asyncParents) lines.push(`  async ${a.description ?? ''}: ${a.frames.join(' < ')}`);
  if (h.topFrame) for (const [k, v] of Object.entries(h.topFrame)) lines.push(`  top ${k} → ${JSON.stringify(v)}`);
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(`hunt: ${String(e && e.stack ? e.stack : e)}`);
    process.exit(1);
  });
}
