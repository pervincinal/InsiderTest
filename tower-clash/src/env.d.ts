/// <reference types="vite/client" />

/** Injected by vite.config.ts `define` from package.json (absent under Vitest — read through `appVersion()`). */
declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;

/** `VITE_*` keys read with typed access (`import.meta.env.X`); set in `.env.production` by the release workflows. */
interface ImportMetaEnv {
  /** MM-10 rating prompt: exactly `on` enables it (GitHub repository variable `RATING_PROMPT`). */
  readonly VITE_RATING_PROMPT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
