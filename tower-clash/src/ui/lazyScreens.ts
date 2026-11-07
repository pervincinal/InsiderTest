/**
 * Lazily loaded screens (PERF-1): the level map, shop, achievements, settings and "How to play" screens and the
 * menu drawing they need are reached only through `import('./lazyScreens')` in src/main.ts, so
 * Vite emits them as one chunk that is not downloaded before the first frame (the app preloads it
 * once the title is painted). Nothing in the eager bundle may import these modules statically
 * (scripts/checkBundle.mjs measures the eager chunks).
 */
export { LevelSelectScreen } from './levelSelect';
export { ShopScreen } from './shop';
export { AchievementsScreen } from './achievements';
export { SettingsScreen } from './settings';
export { HowToScreen } from './howto';
/** AUD-Q2 / AUD-Q3 / AUD-Q10 save notices over the title and the result footer (src/main.ts calls them once this chunk is in). */
export { drawSaveNotice, lastSaveNotice } from '../render/saveNotice';
export { noticeUnreadableSave } from './saveRecovery';
/** AUD-Q11: the layered idle title (src/ui/screens.ts TitleScreen paints through it once this chunk is in). */
export { paintTitle } from '../render/titleIdle';
/** AUD-U27: the menus' keyboard focus ring (src/main.ts keydown / pointerdown / frame call it once this chunk is in). */
export { drawFocus, focusKey, focusState, hideFocus } from './focus';
/** FEEL-1-6: the title ↔ menu slide (src/main.ts `go` / frame / input call it once this chunk is in); `afterDraw` also draws the focus ring, `keyIn` wraps `focusKey`. */
export { afterDraw, keyIn, slideDone, slideHeld, startSlide } from './screenSlide';
