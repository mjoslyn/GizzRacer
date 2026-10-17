import { buildButterflySkyway } from './butterflySkyway';
import { buildCyboogieCity } from './cyboogieCity';
import { buildFishiesLagoon } from './fishiesLagoon';
import { buildIceVGlacier } from './iceVGlacier';
import { buildInfiniteLoopSpeedway } from './infiniteLoopSpeedway';
import { buildPetrodragonicApocalypse } from './petrodragonicApocalypse';
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
  { id: 'fishies-lagoon', name: 'Fishies Lagoon', build: buildFishiesLagoon },
  { id: 'ice-v-glacier', name: 'Ice V Glacier', build: buildIceVGlacier },
  { id: 'cyboogie-city', name: 'Cyboogie City', build: buildCyboogieCity },
  { id: 'butterfly-skyway', name: 'Butterfly 3000 Skyway', build: buildButterflySkyway },
  { id: 'petrodragonic-apocalypse', name: 'Petrodragonic Apocalypse', build: buildPetrodragonicApocalypse },
];

/** Grand Prix cups: four tracks each, in race order (indexes into TRACK_LIST). */
export const CUPS: { name: string; tracks: number[] }[] = [
  { name: 'Nonagon Cup', tracks: [0, 1, 2, 3] },
  { name: 'Microtonal Cup', tracks: [4, 5, 6, 7] },
  // The hardest three, ending in the apocalypse.
  { name: 'Apocalypse Cup', tracks: [2, 6, 7, 8] },
];
