import { buildButterflySkyway } from './butterflySkyway';
import { buildCastleInTheAir } from './castleInTheAir';
import { buildCrumblingCastle } from './crumblingCastle';
import { buildCyboogieCity } from './cyboogieCity';
import { buildDeadstickDrop } from './deadstickDrop';
import { buildFishiesLagoon } from './fishiesLagoon';
import { buildGoblinGarden } from './goblinGarden';
import { buildHellOnMars } from './hellOnMars';
import { buildMurderOfTheUniverse } from './murderOfTheUniverse';
import { buildSupercell } from './supercell';
import { buildIceVGlacier } from './iceVGlacier';
import { buildInnerCell } from './innerCell';
import { buildInfiniteLoopSpeedway } from './infiniteLoopSpeedway';
import { buildKepler22b } from './kepler22b';
import { buildMagentaMountain } from './magentaMountain';
import { buildPetrodragonicApocalypse } from './petrodragonicApocalypse';
import { buildPanpsychGrove } from './panpsychGrove';
import { buildPhantomIsland } from './phantomIsland';
import { buildPolygondwanalandJungle } from './polygondwanalandJungle';
import { buildPredatorX } from './predatorX';
import { buildRattlesnakeRun } from './rattlesnakeRun';
import { buildSeaOfDoubt } from './seaOfDoubt';
import { buildTetrachromacy } from './tetrachromacy';
import type { TrackDef } from './track';
import { enrichTrack } from './enrich';
import { buildVolcanoFortress } from './volcanoFortress';
import { buildRobotStop } from './robotStop';
import { buildGammaKnife } from './gammaKnife';
import { buildPeopleVultures } from './peopleVultures';
import { buildWahWah } from './wahWah';

/** Every track the picker offers, in cup order, each with its layout extras laid in (enrich.ts). */
/** The tracks as drawn, before enrich.ts (tests and tools). */
export const RAW_TRACK_LIST: { id: string; name: string; build: () => TrackDef }[] = [
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
  { id: 'magenta-mountain', name: 'Magenta Mountain', build: buildMagentaMountain },
  { id: 'kepler-22b', name: 'Kepler-22b', build: buildKepler22b },
  { id: 'goblin-garden', name: 'Goblin Garden', build: buildGoblinGarden },
  { id: 'predator-x', name: 'Predator X', build: buildPredatorX },
  { id: 'crumbling-castle', name: 'Crumbling Castle', build: buildCrumblingCastle },
  { id: 'castle-in-the-air', name: 'The Castle in the Air', build: buildCastleInTheAir },
  { id: 'inner-cell', name: 'Inner Cell', build: buildInnerCell },
  { id: 'tetrachromacy', name: 'Tetrachromacy', build: buildTetrachromacy },
  { id: 'robot-stop', name: 'Robot Stop', build: buildRobotStop },
  { id: 'gamma-knife', name: 'Gamma Knife', build: buildGammaKnife },
  { id: 'people-vultures', name: 'People-Vultures', build: buildPeopleVultures },
  { id: 'wah-wah', name: 'Wah Wah', build: buildWahWah },
];

export const TRACK_LIST: { id: string; name: string; build: () => TrackDef }[] = RAW_TRACK_LIST.map((t) => ({ ...t, build: () => enrichTrack(t.build()) }));

/** Grand Prix cups: four tracks each, in race order (indexes into TRACK_LIST). */
export const CUPS: { id: string; name: string; tracks: number[] }[] = [
  { id: 'nonagon', name: 'Nonagon Cup', tracks: [0, 1, 2, 3] },
  { id: 'microtonal', name: 'Microtonal Cup', tracks: [4, 5, 6, 7] },
  // Four ends of the world, the oil-field dragons last.
  { id: 'apocalypse', name: 'Apocalypse Cup', tracks: [9, 10, 11, 8] },
  // Phantom Island (2025): the island in the mist, the plane with no engine, the forest that's awake, and the sea at night.
  { id: 'phantom-island', name: 'Phantom Island Cup', tracks: [12, 13, 14, 15] },
  // Omnium Gatherum (2022): the pink mountain, the ocean planet, the goblin's garden, and the pliosaur.
  { id: 'omnium-gatherum', name: 'Omnium Gatherum Cup', tracks: [16, 17, 18, 19] },
  // Polygondwanaland (2017), in album order: the castle falling down, the castle on the clouds, the inside of a cell, and the fourth colour.
  { id: 'polygondwanaland', name: 'Polygondwanaland Cup', tracks: [20, 21, 22, 23] },
  // Nonagon Infinity (2016), in album order: the robot factory, the gamma knife, the vultures' dry lake and the pedalboard. The album never ends, so Wah Wah's finish is Robot Stop's start.
  { id: 'nonagon-infinity', name: 'Nonagon Infinity Cup', tracks: [24, 25, 26, 27] },
];

/** The Random Cup, after the others in the picker: four of the premade tracks drawn at random. */
export const RANDOM_CUP_NAME = 'Random Cup';
export const RANDOM_CUP_ID = 'random';

/** Draws a Random Cup: four different tracks from TRACK_LIST, in a random order. */
export function randomCupTracks(rand: () => number = Math.random): number[] {
  const all = TRACK_LIST.map((_, i) => i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, 4);
}
