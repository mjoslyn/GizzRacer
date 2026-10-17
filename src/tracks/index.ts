import { buildInfiniteLoopSpeedway } from './infiniteLoopSpeedway';
import { buildPolygondwanalandJungle } from './polygondwanalandJungle';
import { buildRattlesnakeRun } from './rattlesnakeRun';
import type { TrackDef } from './track';
import { buildVolcanoFortress } from './volcanoFortress';

/** Every track the picker offers, in cup order. */
export const TRACK_LIST: { id: string; name: string; build: () => TrackDef }[] = [
  { id: 'infinite-loop-speedway', name: 'Infinite Loop Speedway', build: buildInfiniteLoopSpeedway },
  { id: 'rattlesnake-run', name: 'Rattlesnake Run', build: buildRattlesnakeRun },
  { id: 'volcano-fortress', name: 'Volcano Fortress', build: buildVolcanoFortress },
  { id: 'polygondwanaland-jungle', name: 'Polygondwanaland Jungle', build: buildPolygondwanalandJungle },
];
