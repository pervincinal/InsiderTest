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
  build: { target: 'es2022', sourcemap: true },
});
