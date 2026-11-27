/**
 * PERF-16: the Daily / Weekly result rules are a lazy chunk (src/ui/challengeChunk.ts) the play screen warms at a
 * challenge's start and awaits at its outcome. Tests that run a challenge PlayScreen to its result and expect it
 * booked synchronously import this module for its side effect: the chunk counts as in. Not in tests/setup.ts — a
 * setup-file import would bind src/ui/challengeChunk.ts to the real src/lazyChunk.ts before
 * tests/ui/challengeChunk.test.ts can mock it.
 */
import * as challengeRecord from '../src/ui/challengeRecord';
import { registerChallengeChunk } from '../src/ui/challengeChunk';

registerChallengeChunk(challengeRecord);
