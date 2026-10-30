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
import { buildImInYourMind } from './imInYourMind';
import { buildImNotInYourMind } from './imNotInYourMind';
import { buildCellophane } from './cellophane';
import { buildImInYourMindFuzz } from './imInYourMindFuzz';
import { buildElbow } from './elbow';
import { buildMuckraker } from './muckraker';
import { buildHeadOnPill } from './headOnPill';
import { buildGodIsCalling } from './godIsCalling';
import { buildMendThePast } from './mendThePast';
import { buildFloatAlong } from './floatAlong';
import { buildCutThroatBoogie } from './cutThroatBoogie';
import { buildSeaOfTrees } from './seaOfTrees';
import { buildTheia } from './theia';
import { buildSet } from './set';
import { buildChangE } from './changE';
import { buildGilgamesh } from './gilgamesh';

/** Every track the picker offers, in cup order, each with its layout extras laid in (enrich.ts). */
/** The tracks as drawn, before enrich.ts (tests and tools). */
export const RAW_TRACK_LIST: { id: string; name: string; build: () => TrackDef }[] = [
  { id: 'elbow', name: 'Elbow', build: buildElbow },
  { id: 'muckraker', name: 'Muckraker', build: buildMuckraker },
  { id: 'cut-throat-boogie', name: 'Cut Throat Boogie', build: buildCutThroatBoogie },
  { id: 'sea-of-trees', name: 'Sea of Trees', build: buildSeaOfTrees },
  { id: 'head-on-pill', name: 'Head On/Pill', build: buildHeadOnPill },
  { id: 'god-is-calling', name: 'God Is Calling Me Back Home', build: buildGodIsCalling },
  { id: 'mend-the-past', name: 'Let Me Mend the Past', build: buildMendThePast },
  { id: 'float-along', name: 'Float Along', build: buildFloatAlong },
  { id: 'im-in-your-mind', name: "I'm in Your Mind", build: buildImInYourMind },
  { id: 'im-not-in-your-mind', name: "I'm Not in Your Mind", build: buildImNotInYourMind },
  { id: 'cellophane', name: 'Cellophane', build: buildCellophane },
  { id: 'im-in-your-mind-fuzz', name: "I'm in Your Mind Fuzz", build: buildImInYourMindFuzz },
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
  { id: 'ice-v-glacier', name: 'Ice V', build: buildIceVGlacier },
  { id: 'volcano-fortress', name: 'Magma', build: buildVolcanoFortress },
  { id: 'polygondwanaland-jungle', name: 'Iron Lung', build: buildPolygondwanalandJungle },
  { id: 'murder-of-the-universe', name: 'Gliese 710', build: buildMurderOfTheUniverse },
  { id: 'infinite-loop-speedway', name: 'Motor Spirit', build: buildInfiniteLoopSpeedway },
  { id: 'supercell', name: 'Supercell', build: buildSupercell },
  { id: 'petrodragonic-apocalypse', name: 'Dragon', build: buildPetrodragonicApocalypse },
  { id: 'hell-on-mars', name: 'Flamethrower', build: buildHellOnMars },
  { id: 'theia', name: 'Theia', build: buildTheia },
  { id: 'set', name: 'Set', build: buildSet },
  { id: 'chang-e', name: "Chang'e", build: buildChangE },
  { id: 'gilgamesh', name: 'Gilgamesh', build: buildGilgamesh },
  { id: 'phantom-island', name: 'Phantom Island', build: buildPhantomIsland },
  { id: 'deadstick-drop', name: 'Deadstick', build: buildDeadstickDrop },
  { id: 'panpsych-grove', name: 'Panpsych', build: buildPanpsychGrove },
  { id: 'sea-of-doubt', name: 'Sea of Doubt', build: buildSeaOfDoubt },
];

export const TRACK_LIST: { id: string; name: string; build: () => TrackDef }[] = RAW_TRACK_LIST.map((t) => ({ ...t, build: () => enrichTrack(t.build()) }));

/** Grand Prix cups, one an album, in the order the albums came out: four tracks each, in race order (indexes into TRACK_LIST). */
export const CUPS: { id: string; name: string; tracks: number[] }[] = [
  // 12 Bar Bruise (September 2012), the band's first album, in album order: the band room, the muck, the party, and the forest.
  { id: 'twelve-bar-bruise', name: '12 Bar Bruise Cup', tracks: [0, 1, 2, 3] },
  // Float Along – Fill Your Lungs (September 2013), in album order: the mind coming apart, the house on the top of the hill, nan's house, and the barn in the country.
  { id: 'float-along-fill-your-lungs', name: 'Float Along – Fill Your Lungs Cup', tracks: [4, 5, 6, 7] },
  // I'm in Your Mind Fuzz (November 2014): the suite the album opens with, four songs run into one, in order. Into the mind, out of it, the cellophane, and the fuzz.
  { id: 'mind-fuzz', name: 'Mind Fuzz Cup', tracks: [8, 9, 10, 11] },
  // Nonagon Infinity (2016), in album order: the robot factory, the gamma knife, the vultures' dry lake and the pedalboard. The album never ends, so Wah Wah's finish is Robot Stop's start.
  { id: 'nonagon-infinity', name: 'Nonagon Infinity Cup', tracks: [12, 13, 14, 15] },
  // Flying Microtonal Banana (February 2017), in album order, all in the cover's blue and yellow: the desert, the lagoon, the road through the sky, and the city at night.
  { id: 'flying-microtonal-banana', name: 'Flying Microtonal Banana Cup', tracks: [16, 17, 18, 19] },
  // Polygondwanaland (November 2017), in album order: the castle falling down, the castle on the clouds, the inside of a cell, and the fourth colour.
  { id: 'polygondwanaland', name: 'Polygondwanaland Cup', tracks: [20, 21, 22, 23] },
  // Infest the Rats' Nest (2019), in album order: the burning Earth, the rich's colony on Mars, the ship falling at the sun, and down into Hell.
  { id: 'infest-the-rats-nest', name: "Infest the Rats' Nest Cup", tracks: [24, 25, 26, 27] },
  // Omnium Gatherum (April 2022): the pink mountain, the ocean planet, the goblin's garden, and the pliosaur.
  { id: 'omnium-gatherum', name: 'Omnium Gatherum Cup', tracks: [28, 29, 30, 31] },
  // Ice, Death, Planets, Lungs, Mushrooms and Lava (October 2022), in album order: the glacier, the volcano, the jungle (the planet's lungs) overgrown with mushrooms, and the road of starlight.
  { id: 'ice-death-planets', name: 'Ice, Death, Planets, Lungs, Mushrooms and Lava Cup', tracks: [32, 33, 34, 35] },
  // PetroDragonic Apocalypse (2023), in album order: the speedway, the storm, the oil-field dragons, and Mars on fire.
  { id: 'petrodragonic-apocalypse', name: 'PetroDragonic Apocalypse Cup', tracks: [36, 37, 38, 39] },
  // The Silver Cord (October 2023), in album order: the young Earth and the planet that hits it, the god in the red land, the goddess on the Moon, and the hero's road out of Uruk.
  { id: 'silver-cord', name: 'Silver Cord Cup', tracks: [40, 41, 42, 43] },
  // Phantom Island (2025): the island in the mist, the plane with no engine, the forest that's awake, and the sea at night.
  { id: 'phantom-island', name: 'Phantom Island Cup', tracks: [44, 45, 46, 47] },
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
