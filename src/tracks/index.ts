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
import { buildPlanetB } from './planetB';
import { buildMarsForTheRich } from './marsForTheRich';
import { buildPerihelion } from './perihelion';
import { buildHell } from './hell';

/** Every track the picker offers, in cup order, each with its layout extras laid in (enrich.ts). */
/** The tracks as drawn, before enrich.ts (tests and tools). */
export const RAW_TRACK_LIST: { id: string; name: string; build: () => TrackDef }[] = [
  { id: 'robot-stop', name: 'Robot Stop', build: buildRobotStop },
  { id: 'gamma-knife', name: 'Gamma Knife', build: buildGammaKnife },
  { id: 'people-vultures', name: 'People-Vultures', build: buildPeopleVultures },
  { id: 'wah-wah', name: 'Wah Wah', build: buildWahWah },
  { id: 'rattlesnake-run', name: 'Rattlesnake', build: buildRattlesnakeRun },
  { id: 'fishies-lagoon', name: 'Open Water', build: buildFishiesLagoon },
  { id: 'butterfly-skyway', name: 'Sleep Drifter', build: buildButterflySkyway },
  { id: 'cyboogie-city', name: 'Doom City', build: buildCyboogieCity },
  { id: 'crumbling-castle', name: 'Crumbling Castle', build: buildCrumblingCastle },
  { id: 'castle-in-the-air', name: 'The Castle in the Air', build: buildCastleInTheAir },
  { id: 'inner-cell', name: 'Inner Cell', build: buildInnerCell },
  { id: 'tetrachromacy', name: 'Tetrachromacy', build: buildTetrachromacy },
  { id: 'planet-b', name: 'Planet B', build: buildPlanetB },
  { id: 'mars-for-the-rich', name: 'Mars for the Rich', build: buildMarsForTheRich },
  { id: 'perihelion', name: 'Perihelion', build: buildPerihelion },
  { id: 'hell', name: 'Hell', build: buildHell },
  { id: 'magenta-mountain', name: 'Magenta Mountain', build: buildMagentaMountain },
  { id: 'kepler-22b', name: 'Kepler-22b', build: buildKepler22b },
  { id: 'goblin-garden', name: 'The Garden Goblin', build: buildGoblinGarden },
  { id: 'predator-x', name: 'Predator X', build: buildPredatorX },
  { id: 'polygondwanaland-jungle', name: 'Mycelium', build: buildPolygondwanalandJungle },
  { id: 'ice-v-glacier', name: 'Ice V', build: buildIceVGlacier },
  { id: 'volcano-fortress', name: 'Magma', build: buildVolcanoFortress },
  { id: 'murder-of-the-universe', name: 'Gliese 710', build: buildMurderOfTheUniverse },
  { id: 'infinite-loop-speedway', name: 'Motor Spirit', build: buildInfiniteLoopSpeedway },
  { id: 'supercell', name: 'Supercell', build: buildSupercell },
  { id: 'petrodragonic-apocalypse', name: 'Dragon', build: buildPetrodragonicApocalypse },
  { id: 'hell-on-mars', name: 'Flamethrower', build: buildHellOnMars },
  { id: 'phantom-island', name: 'Phantom Island', build: buildPhantomIsland },
  { id: 'deadstick-drop', name: 'Deadstick', build: buildDeadstickDrop },
  { id: 'panpsych-grove', name: 'Panpsych', build: buildPanpsychGrove },
  { id: 'sea-of-doubt', name: 'Sea of Doubt', build: buildSeaOfDoubt },
];

export const TRACK_LIST: { id: string; name: string; build: () => TrackDef }[] = RAW_TRACK_LIST.map((t) => ({ ...t, build: () => enrichTrack(t.build()) }));

/** Grand Prix cups, one an album, in the order the albums came out: four tracks each, in race order (indexes into TRACK_LIST). */
export const CUPS: { id: string; name: string; tracks: number[] }[] = [
  // Nonagon Infinity (2016), in album order: the robot factory, the gamma knife, the vultures' dry lake and the pedalboard. The album never ends, so Wah Wah's finish is Robot Stop's start.
  { id: 'nonagon-infinity', name: 'Nonagon Infinity Cup', tracks: [0, 1, 2, 3] },
  // Flying Microtonal Banana (February 2017), in album order, all in the cover's blue and yellow: the desert, the lagoon, the road through the sky, and the city at night.
  { id: 'flying-microtonal-banana', name: 'Flying Microtonal Banana Cup', tracks: [4, 5, 6, 7] },
  // Polygondwanaland (November 2017), in album order: the castle falling down, the castle on the clouds, the inside of a cell, and the fourth colour.
  { id: 'polygondwanaland', name: 'Polygondwanaland Cup', tracks: [8, 9, 10, 11] },
  // Infest the Rats' Nest (2019), in album order: the burning Earth, the rich's colony on Mars, the ship falling at the sun, and down into Hell.
  { id: 'infest-the-rats-nest', name: "Infest the Rats' Nest Cup", tracks: [12, 13, 14, 15] },
  // Omnium Gatherum (April 2022): the pink mountain, the ocean planet, the goblin's garden, and the pliosaur.
  { id: 'omnium-gatherum', name: 'Omnium Gatherum Cup', tracks: [16, 17, 18, 19] },
  // Ice, Death, Planets, Lungs, Mushrooms and Lava (October 2022), in album order: the jungle, the glacier, the volcano, and the road of starlight.
  { id: 'ice-death-planets', name: 'Ice, Death, Planets, Lungs, Mushrooms and Lava Cup', tracks: [20, 21, 22, 23] },
  // PetroDragonic Apocalypse (2023), in album order: the speedway, the storm, the oil-field dragons, and Mars on fire.
  { id: 'petrodragonic-apocalypse', name: 'PetroDragonic Apocalypse Cup', tracks: [24, 25, 26, 27] },
  // Phantom Island (2025): the island in the mist, the plane with no engine, the forest that's awake, and the sea at night.
  { id: 'phantom-island', name: 'Phantom Island Cup', tracks: [28, 29, 30, 31] },
];

/** Cups that were retired when every cup became an album's, and the album cup that took most of each one's tracks: progress.ts carries their trophies over. */
export const RETIRED_CUPS: Record<string, string> = {
  nonagon: 'ice-death-planets',
  microtonal: 'flying-microtonal-banana',
  apocalypse: 'petrodragonic-apocalypse',
};

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
