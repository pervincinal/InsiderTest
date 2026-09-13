import type { LevelDef } from '../sim/types';
import level001 from './001-first-taps.json';
import level002 from './002-supply-line.json';
import level003 from './003-free-real-estate.json';
import level004 from './004-build-up.json';
import level005 from './005-two-roads.json';
import level006 from './006-outpost-first.json';
import level007 from './007-long-march.json';
import level008 from './008-two-bases.json';
import level009 from './009-stone-walls.json';
import level010 from './010-hold-the-line.json';
import level011 from './011-starve-the-keep.json';
import level012 from './012-gun-post.json';
import level013 from './013-crossfire.json';
import level014 from './014-guns-and-walls.json';
import level015 from './015-the-citadel.json';

/** Levels in play order. JSON string fields are widened by TS; the validator (`npm run levels:check`) guards the enums. */
export const LEVELS: LevelDef[] = [
  level001 as LevelDef,
  level002 as LevelDef,
  level003 as LevelDef,
  level004 as LevelDef,
  level005 as LevelDef,
  level006 as LevelDef,
  level007 as LevelDef,
  level008 as LevelDef,
  level009 as LevelDef,
  level010 as LevelDef,
  level011 as LevelDef,
  level012 as LevelDef,
  level013 as LevelDef,
  level014 as LevelDef,
  level015 as LevelDef,
];

export function getLevel(id: number): LevelDef | undefined {
  return LEVELS.find((level) => level.id === id);
}
