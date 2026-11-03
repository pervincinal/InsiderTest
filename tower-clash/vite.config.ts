import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/** package.json version + build number, injected as `__APP_VERSION__` / `__APP_BUILD__` (settings → About). */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string; config?: { buildNumber?: number } };

/**
 * AUD-Q18: the Playwright / debug surface (src/debug.ts, `window.__towerclash`: `economy.grant`,
 * `configureFakeStore`, `autoplay`, `autoLose`, …) is compiled out of the Capacitor store builds.
 * `npm run build:native` (scripts/buildNative.mjs) sets `VITE_DEBUG_SURFACE=0`; every other build
 * (web, Pages, e2e, dev server) keeps it. An env variable rather than `--mode native`: a custom mode
 * would stop Vite from reading the `.env.production` the release workflows write from secrets.
 */
const debugSurface = process.env.VITE_DEBUG_SURFACE !== '0';

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(String(pkg.config?.buildNumber ?? '')),
    __DEBUG_SURFACE__: JSON.stringify(debugSurface),
  },
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    /**
     * AUD-Q17: maps are generated but not referenced (no `//# sourceMappingURL`). They never ship:
     * scripts/stripSourcemaps.mjs moves them out of dist/ before `cap sync` (scripts/buildNative.mjs)
     * and before the Pages upload; CI keeps them as the `sourcemaps-<sha>` artifact (30 days).
     */
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        /**
         * PERF-9: the enemy AI (src/ai/*) is a lazy chunk (`import('../ai/index')` in src/ui/ai.ts), named
         * `ai-*.js` rather than after its entry file (`index-*.js` reads like the entry chunk). A file
         * name only: a `manualChunks` group would also pull in the sim it depends on and turn it into a
         * preloaded second eager chunk.
         */
        chunkFileNames: (chunk) => (chunk.facadeModuleId && /[\\/]src[\\/]ai[\\/]index\.ts$/.test(chunk.facadeModuleId) ? 'assets/ai-[hash].js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});
