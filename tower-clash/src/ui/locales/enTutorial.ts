/**
 * English, tutorial part (PERF-10): the hints of the level 2–4 tutorial steps. They are drawn only by
 * ../tutorialSteps.ts, a lazy chunk the level start loads with levels 2–4 (../tutorialChunk.ts), so
 * they ship inside that chunk and `loadTutorialSteps()` adds them to `t()`'s English table. Level 1's
 * two hints stay in ./enCore.ts (the first launch never waits for a second fetch). Never imported
 * statically by eager code (tests/ui/tutorialChunk.test.ts); ./en.ts joins it with the other parts.
 * The other locales keep these keys in their own (already lazy) dictionaries.
 */
export const enTutorial = {
  'tutorial.tapThenGrey': 'Tap your tower, then the grey tower',
  'tutorial.stopStream': 'Swipe across the stream so your tower grows',
  'tutorial.fillToUpgrade': 'At {n} it levels up — L2 runs 2 streams',
  'tutorial.goAround': 'Now tap the new tower, then the red one',
  'tutorial.supplyLine': 'A full tower passes soldiers on: stream into it',
  'tutorial.grabOther': 'Now take the other grey tower too',
  'tutorial.stopToGrow': "Stop this tower's stream so it can grow",
} as const;
