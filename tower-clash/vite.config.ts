import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/** package.json version + build number, injected as `__APP_VERSION__` / `__APP_BUILD__` (settings → About). */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string; config?: { buildNumber?: number } };

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(String(pkg.config?.buildNumber ?? '')),
  },
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    sourcemap: true,
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
