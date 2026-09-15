/**
 * Lazily loaded screens (PERF-1): the level map, shop, achievements and settings screens and the
 * menu drawing they need are reached only through `import('./lazyScreens')` in src/main.ts, so
 * Vite emits them as one chunk that is not downloaded before the first frame (the app preloads it
 * once the title is painted). Nothing in the eager bundle may import these modules statically
 * (scripts/checkBundle.mjs measures the eager chunks).
 */
export { LevelSelectScreen } from './levelSelect';
export { ShopScreen } from './shop';
export { AchievementsScreen } from './achievements';
export { SettingsScreen } from './settings';
