/**
 * PERF-11: the result screen is a lazy chunk (src/ui/resultChunk.ts) the play screen warms at level
 * start and opens once it is in. Tests that run a PlayScreen to its result and expect the result
 * screen synchronously after the beat import this module for its side effect: the chunk counts as in.
 * Not in tests/setup.ts — the chunk's graph reaches src/native/index.ts, which the provider tests mock.
 */
import * as result from '../src/ui/result';
import { registerResultChunk } from '../src/ui/resultChunk';

registerResultChunk(result);
