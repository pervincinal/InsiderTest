import type { LevelDef } from '../sim/types';
import level001 from './001-first-taps.json';
import level002 from './002-supply-line.json';
import level003 from './003-free-real-estate.json';
import level004 from './004-build-up.json';
import level005 from './005-two-roads.json';

/** Levels in play order. JSON string fields are widened by TS; the validator (`npm run levels:check`) guards the enums. */
export const LEVELS: LevelDef[] = [
  level001 as LevelDef,
  level002 as LevelDef,
  level003 as LevelDef,
  level004 as LevelDef,
  level005 as LevelDef,
];

export function getLevel(id: number): LevelDef | undefined {
  return LEVELS.find((level) => level.id === id);
}
