import { buildButterflySkyway } from './butterflySkyway';
import { buildCyboogieCity } from './cyboogieCity';
import { buildDeadstickDrop } from './deadstickDrop';
import { buildFishiesLagoon } from './fishiesLagoon';
import { buildHellOnMars } from './hellOnMars';
import { buildMurderOfTheUniverse } from './murderOfTheUniverse';
import { buildSupercell } from './supercell';
import { buildIceVGlacier } from './iceVGlacier';
import { buildInfiniteLoopSpeedway } from './infiniteLoopSpeedway';
import { buildPetrodragonicApocalypse } from './petrodragonicApocalypse';
import { buildPanpsychGrove } from './panpsychGrove';
import { buildPhantomIsland } from './phantomIsland';
import { buildPolygondwanalandJungle } from './polygondwanalandJungle';
import { buildRattlesnakeRun } from './rattlesnakeRun';
import { buildSeaOfDoubt } from './seaOfDoubt';
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
  { id: 'hell-on-mars', name: 'Hell on Mars', build: buildHellOnMars },
  { id: 'supercell', name: 'Supercell', build: buildSupercell },
  { id: 'murder-of-the-universe', name: 'Murder of the Universe', build: buildMurderOfTheUniverse },
  { id: 'phantom-island', name: 'Phantom Island', build: buildPhantomIsland },
  { id: 'deadstick-drop', name: 'Deadstick Drop', build: buildDeadstickDrop },
  { id: 'panpsych-grove', name: 'Panpsych Grove', build: buildPanpsychGrove },
  { id: 'sea-of-doubt', name: 'Sea of Doubt', build: buildSeaOfDoubt },
];

/** Grand Prix cups: four tracks each, in race order (indexes into TRACK_LIST). */
export const CUPS: { name: string; tracks: number[] }[] = [
  { name: 'Nonagon Cup', tracks: [0, 1, 2, 3] },
  { name: 'Microtonal Cup', tracks: [4, 5, 6, 7] },
  // Four ends of the world, the oil-field dragons last.
  { name: 'Apocalypse Cup', tracks: [9, 10, 11, 8] },
  // Phantom Island (2025): the island in the mist, the plane with no engine, the forest that's awake, and the sea at night.
  { name: 'Phantom Island Cup', tracks: [12, 13, 14, 15] },
];
