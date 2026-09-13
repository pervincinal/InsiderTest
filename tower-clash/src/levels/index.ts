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
import level016 from './016-last-bastion.json';
import level017 from './017-minefield.json';
import level018 from './018-two-rivals.json';
import level019 from './019-toll-road.json';
import level020 from './020-roadblock.json';
import level021 from './021-behind-the-wall.json';
import level022 from './022-castle-in-the-middle.json';
import level023 from './023-first-blood.json';
import level024 from './024-the-gauntlet.json';
import level025 from './025-heavy-metal.json';
import level026 from './026-steamroller.json';
import level027 from './027-armour-race.json';
import level028 from './028-burn-the-bridge.json';
import level029 from './029-island-hopping.json';
import level030 from './030-drawbridge.json';
import level031 from './031-guns-over-the-river.json';
import level032 from './032-siege-works.json';
import level033 from './033-three-kings.json';
import level034 from './034-weakest-link.json';
import level035 from './035-powder-keg.json';
import level036 from './036-three-bridges.json';
import level037 from './037-tank-country.json';
import level038 from './038-ring-of-fire.json';
import level039 from './039-the-long-night.json';
import level040 from './040-the-crown.json';

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
  level016 as LevelDef,
  level017 as LevelDef,
  level018 as LevelDef,
  level019 as LevelDef,
  level020 as LevelDef,
  level021 as LevelDef,
  level022 as LevelDef,
  level023 as LevelDef,
  level024 as LevelDef,
  level025 as LevelDef,
  level026 as LevelDef,
  level027 as LevelDef,
  level028 as LevelDef,
  level029 as LevelDef,
  level030 as LevelDef,
  level031 as LevelDef,
  level032 as LevelDef,
  level033 as LevelDef,
  level034 as LevelDef,
  level035 as LevelDef,
  level036 as LevelDef,
  level037 as LevelDef,
  level038 as LevelDef,
  level039 as LevelDef,
  level040 as LevelDef,
];

export function getLevel(id: number): LevelDef | undefined {
  return LEVELS.find((level) => level.id === id);
}
