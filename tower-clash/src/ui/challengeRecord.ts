/*
 * PERF-16: the Daily / Weekly Challenge result rules the play screen needs at an outcome, as one
 * lazy chunk (src/ui/challengeChunk.ts loads it). Only re-exports: the rules stay in ./daily and
 * ./weekly, which the level map (lazyScreens) and the result chunk import statically as before.
 */
export { practiceResult, recordChallengeResult, restartLevel } from './daily';
export { recordWeeklyResult } from './weekly';
