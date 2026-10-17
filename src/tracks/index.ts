import { buildPolygondwanalandJungle } from './polygondwanalandJungle';
import { buildRattlesnakeRun } from './rattlesnakeRun';
import { TEST_TRACK } from './testTrack';
import type { TrackDef } from './track';
import { buildVolcanoFortress } from './volcanoFortress';

/** Every track the picker offers, in cup order. */
export const TRACK_LIST: { id: string; name: string; build: () => TrackDef }[] = [
  { id: 'test-track', name: 'Speedway Test Loop', build: () => TEST_TRACK },
  { id: 'rattlesnake-run', name: 'Rattlesnake Run', build: buildRattlesnakeRun },
  { id: 'volcano-fortress', name: 'Volcano Fortress (draft)', build: buildVolcanoFortress },
  { id: 'polygondwanaland-jungle', name: 'Polygondwanaland Jungle (draft)', build: buildPolygondwanalandJungle },
];
