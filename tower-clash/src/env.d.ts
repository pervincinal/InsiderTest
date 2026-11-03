/// <reference types="vite/client" />

/** Injected by vite.config.ts `define` from package.json (absent under Vitest — read through `appVersion()`). */
declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;
/** AUD-Q18: false in the Capacitor store builds (`npm run build:native`), true everywhere else. */
declare const __DEBUG_SURFACE__: boolean;

/** `VITE_*` keys read with typed access (`import.meta.env.X`); set in `.env.production` by the release workflows. */
interface ImportMetaEnv {
  /** MM-10 rating prompt: exactly `on` enables it (GitHub repository variable `RATING_PROMPT`). */
  readonly VITE_RATING_PROMPT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
