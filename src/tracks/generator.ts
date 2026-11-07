import { clamp, seededRandom } from '../core/math';
import { launchersFor } from './enrich';
import { METEOR_CRUMBLE, METEOR_MARK, METEOR_ROLL } from '../items/hazards';
import { KIT_HAZARDS, KIT_THEMES } from '../kits/index';
import { TrackBuilder, dubins, offsetPose, type Pose, type RoadSurface, type SectionProps, ROAD_WIDTH_SCALE } from './builder';
import { nearestOnSpline } from './spline';
import { Track, inPit, type BranchDef, type CoreTheme, type HazardDef, type ItemBoxRow, type Landmark, type TrackDef } from './track';
import type { KitTheme } from '../kits/kit';

/**
 * Generated tracks: a seeded loop built from themed corner modules. The
 * same seed and dials always build the same track, so a saved track is
 * just its seed, dials and name.
 */

export type GenTheme = TrackDef['theme'];
export const GEN_THEMES: readonly GenTheme[] = ['desert', 'speedway', 'volcano', 'jungle', 'lagoon', 'glacier', 'neon', 'dream', 'petro', 'mars', 'storm', 'void', 'phantom', 'airfield', 'grove', 'doubt', 'magenta', 'kepler', 'goblin', 'primeval', 'castle', 'skycastle', 'cell', 'prism', 'factory', 'gamma', 'carrion', 'wah', 'smog', 'dome', 'solar', 'inferno', 'mind', 'notmind', 'cellophane', 'mindfuzz'];
/** Every theme's name in the generator: the game's own, then the kits'. */
export const GEN_THEME_NAMES: Record<GenTheme, string> = withKits((k) => k.name, {
  desert: 'Desert',
  speedway: 'Speedway',
  volcano: 'Volcano',
  jungle: 'Jungle',
  lagoon: 'Lagoon',
  glacier: 'Glacier',
  neon: 'Neon City',
  dream: 'Sky',
  petro: 'Petrodragonic',
  mars: 'Mars',
  storm: 'Supercell',
  void: 'Void',
  phantom: 'Phantom Island',
  airfield: 'Airfield',
  grove: 'Grove',
  doubt: 'Sea of Doubt',
  magenta: 'Magenta Mountain',
  kepler: 'Kepler-22b',
  goblin: 'Goblin Garden',
  primeval: 'Predator X',
  castle: 'Crumbling Castle',
  skycastle: 'Castle in the Air',
  cell: 'Inner Cell',
  prism: 'Tetrachromacy',
  factory: 'Robot Stop',
  gamma: 'Gamma Knife',
  carrion: 'People-Vultures',
  wah: 'Wah Wah',
  smog: 'Planet B',
  dome: 'Mars for the Rich',
  solar: 'Perihelion',
  inferno: 'Hell',
  mind: "I'm in Your Mind",
  notmind: "I'm Not in Your Mind",
  cellophane: 'Cellophane',
  mindfuzz: "I'm in Your Mind Fuzz",
  elbow: 'Elbow',
  muck: 'Muckraker',
  boogie: 'Cut Throat Boogie',
  treesea: 'Sea of Trees',
  theia: 'Theia',
  set: 'Set',
  change: "Chang'e",
  uruk: 'Gilgamesh',
  headon: 'Head On/Pill',
  godcall: 'God Is Calling Me Back Home',
  nan: 'Let Me Mend the Past',
  float: 'Float Along',
  newworld: 'Altered Beast I',
  foe: 'Altered Beast II',
  altered: 'Altered Beast III',
  hollow: 'Altered Beast IV',
  forge: 'Alien Metal',
  steelwar: 'Kill for the Steel',
  autonomy: 'Level 5',
  reactor: 'Rapid Alpha Decay',
  muddy: 'Muddy Water',
  scala: 'The Great Chain of Being',
  network: 'All Is Known',
  wheel: 'The Wheel',
});
export type GenLength = 'short' | 'medium' | 'long';
export const GEN_LENGTHS: readonly GenLength[] = ['short', 'medium', 'long'];
export const GEN_COMPLEXITY_MAX = 5;

export interface GenParams {
  seed: number;
  theme: GenTheme;
  /** 1 (wide, sweeping, forgiving) .. 5 (narrow, twisty, hazards everywhere). */
  complexity: number;
  length: GenLength;
  /**
   * A given name for the track (Story mode's suite stages, from the song's
   * lyrics) in place of the one drawn from its seed; and the places its
   * sections are named after, in place of its world's. Neither changes what
   * gets built: the draws are the same.
   */
  name?: string;
  places?: readonly string[];
  /**
   * How the layout's skeleton is drawn. Absent (or 1): the first
   * generator's rectangle, kept exactly so players' saved tracks, past
   * dailies and their boards still build what they did. GEN_LAYOUT (2): a
   * shape drawn from the seed (an L, a U, a T, a zigzag, stairs, a
   * triangle, a kite, a figure of eight over a flyover, a lollipop; now and
   * then at low twists still a rectangle). New tracks carry it.
   */
  layout?: number;
}

/** The layout new tracks are built with (see GenParams.layout). */
export const GEN_LAYOUT = 2;

/** Rough lap lengths, metres. */
const LENGTH_M: Record<GenLength, number> = { short: 950, medium: 1350, long: 1800 };
const FINISH = 50;
const MAX_ATTEMPTS = 60;
/** Trick kickers: run-up to the first, lip to the next ramp of a pair, and the clear landing after the last. */
const KICKER_LEAD = 12;
const KICKER_PAIR: [number, number] = [36, 50];
const KICKER_LANDING = 45;
/** Shortcut jump: ramp length and lip height; the gap grows with twists. */
const SHORTCUT_RAMP = 12;
const SHORTCUT_LIP = 2.5;
/** How far from either end a shortcut may still share road with the sweep it cuts across (longer the wider the roads: it peels off at the same angle). */
export const SHORTCUT_JUNCTION = 65 * ROAD_WIDTH_SCALE;
/**
 * Elevation. Rolling hills bend no sharper than this (1/m), so karts stay
 * planted over their tops; humps on straights are sharp-topped, for airtime.
 */
const HILL_BEND = 0.012;
const HUMP_RAMP = 20;
const HUMP_SLOPE = 0.15;
/** Clear straight a hump needs: its two ramps and somewhere to land. */
const HUMP_ROOM = 2 * HUMP_RAMP + 30;
/** Raised past this, a section gets barriers so nobody drops off the embankment. */
const RAISED = 2;
/** Room kept flat around kickers, jumps, bridges and junctions. */
const FLAT_MARGIN = 10;
/** And either side of a shortcut's sweep, so it meets the main road on the level. */
const JUNCTION_FLAT = 25;
/** Coaster: flat run-in, the lead up to the crest and the runout, metres; deck from this height up. */
const COASTER_IN = 8;
const COASTER_LEAD = 30;
const COASTER_OUT = 25;
const COASTER_LIFT = 2.5;
const COASTER_DROP_SLOPE = 0.45;
const COASTER_MIN = 8;
/** Leg a shaped layout keeps clear for its coaster (it needs about 152 m to reach COASTER_MIN). */
const COASTER_ROOM = 156;
const COASTER_ROOM_ABYSS = 240;
const DECK_LINE = 4;
/** A flyover, where a figure of eight crosses itself: its deck's height, the ramps up to it and down, and the flat road either end, metres. */
const FLY_HEIGHT = 8.5;
const FLY_RAMP = 60;
const FLY_IN = 6;
/** How far a deck must be above another stretch of road to pass over it (the deck is 1.3 m deep). */
export const OVERPASS = 7;
const COASTER_DECKS = ['Skyway', 'Coaster', 'Viaduct', 'Highline', 'Big Dipper', 'Rollercoaster'];
const SHORTCUT_NAMES = ['Gamma Knife', 'Robot Stop', 'Hot Water', 'Head On', 'Cut Throat Boogie', 'Mind Fuzz', 'Planet B', 'Doom City', 'Nuclear Fusion', 'Crumbling Castle'];

type HazardKind = HazardDef['kind'];

/** A table over every theme: the game's own entries, and each kit theme's from `pick`. */
function withKits<T>(pick: (k: KitTheme) => T, core: Record<CoreTheme, T>): Record<GenTheme, T> {
  const all: Record<string, T> = { ...core };
  for (const [theme, kit] of KIT_THEMES) all[theme] = pick(kit);
  return all as Record<GenTheme, T>;
}

/** How the generator builds a track in a theme (a kit gives one for each of its themes). */
export interface Palette {
  surface: RoadSurface;
  /** Bridges and jump approaches. */
  deck: RoadSurface;
  /** Other surfaces some sections take instead (ice on the glacier). */
  alt?: RoadSurface;
  liquid?: 'water' | 'lava' | 'oil';
  hazards: HazardKind[];
  start: Landmark['kind'];
  landmarks: Landmark['kind'][];
  /** Walls on enclosed sections (the city's alleys are tall). */
  tallWalls: number;
  /** Words for section names. */
  places: string[];
  music: { lap: string; finalLap?: string };
}

/** How each theme's tracks are built: the game's own, then the kits'. */
const PALETTES: Record<GenTheme, Palette> = withKits((k) => k.palette, {
  desert: {
    surface: 'sand',
    deck: 'rock',
    alt: 'salt',
    hazards: ['snakes', 'tumbleweeds', 'dustDevils', 'boulders'],
    start: 'skeletonArch',
    landmarks: [],
    tallWalls: 6,
    places: ['Salt', 'Mesa', 'Gila', 'Sidewinder', 'Canyon', 'Dune', 'Rattle', 'Coyote', 'Arroyo'],
    music: { lap: 'rattlesnake-run', finalLap: 'rattlesnake-run-final-lap' },
  },
  speedway: {
    surface: 'asphalt',
    deck: 'asphalt',
    hazards: ['tumbleweeds'],
    start: 'gantry',
    landmarks: [],
    tallWalls: 1.2,
    places: ['Mobius', 'Meadow', 'Loop', 'Infinity', 'Clover', 'Hilltop', 'Paddock'],
    music: { lap: 'infinite-loop-speedway' },
  },
  volcano: {
    surface: 'asphalt',
    deck: 'rock',
    alt: 'rock',
    liquid: 'lava',
    hazards: ['lavaBombs', 'flameJets'],
    start: 'gantry',
    landmarks: ['fortressGate'],
    tallWalls: 7,
    places: ['Ash', 'Magma', 'Caldera', 'Basalt', 'Cinder', 'Obsidian', 'Ember'],
    music: { lap: 'volcano-fortress' },
  },
  jungle: {
    surface: 'sand',
    deck: 'rock',
    alt: 'rock',
    liquid: 'water',
    hazards: ['vines', 'rollers'],
    start: 'gantry',
    landmarks: ['templeGate', 'waterfall'],
    tallWalls: 5,
    places: ['Canopy', 'Vine', 'Polygon', 'Fern', 'Temple', 'Mossy', 'Liana'],
    music: { lap: 'polygondwanaland-jungle' },
  },
  lagoon: {
    surface: 'sand',
    deck: 'boards',
    liquid: 'water',
    hazards: ['fish'],
    start: 'gantry',
    landmarks: ['lighthouse'],
    tallWalls: 1.2,
    places: ['Reef', 'Coral', 'Palm', 'Shoal', 'Fishies', 'Lagoon', 'Driftwood'],
    music: { lap: 'fishies-lagoon' },
  },
  glacier: {
    surface: 'asphalt',
    deck: 'rock',
    alt: 'ice',
    liquid: 'water',
    hazards: ['iceBlocks'],
    start: 'iceArch',
    landmarks: ['iceArch'],
    tallWalls: 3,
    places: ['Ice V', 'Frost', 'Crevasse', 'Icicle', 'Glacier', 'Permafrost', 'Snowdrift'],
    music: { lap: 'ice-v-glacier' },
  },
  neon: {
    surface: 'neon',
    deck: 'neon',
    hazards: ['lasers'],
    start: 'neonArch',
    landmarks: ['neonArch'],
    tallWalls: 6,
    places: ['Cyboogie', 'Han-Tyumi', 'Neon', 'Chrome', 'Synth', 'Circuit', 'Midnight'],
    music: { lap: 'cyboogie-city' },
  },
  dream: {
    surface: 'rainbow',
    deck: 'rainbow',
    hazards: ['butterflies'],
    start: 'rainbowArch',
    landmarks: ['rainbowArch'],
    tallWalls: 1.2,
    places: ['Butterfly', 'Cloud', 'Chrysalis', 'Starlight', 'Pastel', 'Daydream', 'Halo'],
    music: { lap: 'butterfly-skyway', finalLap: 'butterfly-skyway-final-lap' },
  },
  petro: {
    surface: 'rock',
    deck: 'rock',
    alt: 'oil',
    liquid: 'oil',
    hazards: ['oilBombs', 'dragonFire'],
    start: 'dragonGate',
    landmarks: ['dragonFlight'],
    tallWalls: 5,
    places: ['Wyrm', 'Derrick', 'Ashen', 'Scorch', 'Brimstone', 'Crude', 'Cinder', 'Talon', 'Doom'],
    music: { lap: 'petrodragonic-apocalypse', finalLap: 'petrodragonic-apocalypse-final-lap' },
  },
  mars: {
    surface: 'regolith',
    deck: 'regolith',
    alt: 'rock',
    liquid: 'lava',
    hazards: ['meteors', 'dustDevils'],
    start: 'colonyGate',
    landmarks: ['colonyGate'],
    tallWalls: 4,
    places: ['Olympus', 'Tharsis', 'Phobos', 'Deimos', 'Crater', 'Colony', 'Red', 'Airlock', 'Rover'],
    music: { lap: 'hell-on-mars', finalLap: 'hell-on-mars-final-lap' },
  },
  storm: {
    surface: 'wet',
    deck: 'boards',
    alt: 'rock',
    liquid: 'water',
    hazards: ['tornadoes', 'lightning', 'hail'],
    start: 'rodGate',
    landmarks: ['rodGate'],
    tallWalls: 3,
    places: ['Supercell', 'Twister', 'Prairie', 'Silo', 'Thunder', 'Anvil', 'Gust', 'Downdraft', 'Hailstone'],
    music: { lap: 'supercell', finalLap: 'supercell-final-lap' },
  },
  void: {
    surface: 'cosmic',
    deck: 'cosmic',
    alt: 'neon',
    hazards: ['blackHoles', 'lightning'],
    start: 'voidEye',
    landmarks: ['voidEye'],
    tallWalls: 1.2,
    places: ['Han-Tyumi', 'Altered Beast', 'Balrog', 'Nebula', 'Event Horizon', 'Murder', 'Cyborg', 'Quasar', 'Oblivion'],
    music: { lap: 'murder-of-the-universe', finalLap: 'murder-of-the-universe-final-lap' },
  },
  phantom: {
    surface: 'sand',
    deck: 'boards',
    alt: 'rock',
    liquid: 'water',
    hazards: ['wisps', 'vines'],
    start: 'phantomArch',
    landmarks: ['phantomArch', 'lighthouse'],
    tallWalls: 1.5,
    places: ['Phantom', 'Mist', 'Wraith', 'Ghost Light', 'Vanishing', 'Spectre', 'Isle', 'Tideline', 'Eternal Return'],
    music: { lap: 'phantom-island', finalLap: 'phantom-island-final-lap' },
  },
  airfield: {
    surface: 'asphalt',
    deck: 'boards',
    alt: 'rock',
    liquid: 'water',
    hazards: ['gliders', 'dustDevils'],
    start: 'runwayGate',
    landmarks: ['runwayGate'],
    tallWalls: 1.2,
    places: ['Deadstick', 'Runway', 'Aerodynamic', 'Propeller', 'Hangar', 'Mayday', 'Tailwind', 'Glide', 'Grow Wings'],
    music: { lap: 'deadstick-drop', finalLap: 'deadstick-drop-final-lap' },
  },
  grove: {
    surface: 'rock',
    deck: 'boards',
    alt: 'sand',
    liquid: 'water',
    hazards: ['stones', 'vines'],
    start: 'treeGate',
    landmarks: ['treeGate'],
    tallWalls: 1.5,
    places: ['Panpsych', 'Root', 'Mossy', 'Humming', 'Heartwood', 'Silent Spirit', 'Canopy', 'Lichen', 'Awake'],
    music: { lap: 'panpsych-grove', finalLap: 'panpsych-grove-final-lap' },
  },
  doubt: {
    surface: 'wet',
    deck: 'boards',
    alt: 'rock',
    liquid: 'water',
    hazards: ['waves', 'lightning'],
    start: 'wreckGate',
    landmarks: ['wreckGate', 'lighthouse'],
    tallWalls: 1.5,
    places: ['Doubt', 'Undertow', 'Breaker', 'Spacesick', 'Lonely', 'Riptide', 'Squall', 'Fathom', 'Wreck'],
    music: { lap: 'sea-of-doubt', finalLap: 'sea-of-doubt-final-lap' },
  },
  magenta: {
    surface: 'crystal',
    deck: 'rock',
    alt: 'ice',
    hazards: ['crystals', 'hail'],
    start: 'crystalGate',
    landmarks: ['crystalGate'],
    tallWalls: 2,
    places: ['Magenta', 'Summit', 'Crystal', 'Avalanche', 'Switchback', 'Pink Peak', 'Rosy', 'Altitude', 'Omnium'],
    music: { lap: 'magenta-mountain', finalLap: 'magenta-mountain-final-lap' },
  },
  kepler: {
    surface: 'reef',
    deck: 'boards',
    alt: 'sand',
    liquid: 'water',
    hazards: ['geysers', 'wisps'],
    start: 'keplerArch',
    landmarks: ['keplerArch'],
    tallWalls: 1.5,
    places: ['Kepler', 'Habitable', 'Ocean World', 'Weightless', 'Exoplanet', 'Shallows', 'Red Dwarf', 'Light Year', 'Goldilocks'],
    music: { lap: 'kepler-22b', finalLap: 'kepler-22b-final-lap' },
  },
  goblin: {
    surface: 'paving',
    deck: 'boards',
    alt: 'rock',
    liquid: 'water',
    hazards: ['goblins', 'vines'],
    start: 'goblinGate',
    landmarks: ['goblinGate'],
    tallWalls: 5,
    places: ['Goblin', 'Hedge', 'Topiary', 'Gnome', 'Rose Bed', 'Compost', 'Worm', 'Greenhouse', 'Mischief'],
    music: { lap: 'goblin-garden', finalLap: 'goblin-garden-final-lap' },
  },
  primeval: {
    surface: 'rock',
    deck: 'boards',
    alt: 'sand',
    liquid: 'water',
    hazards: ['jaws', 'geysers'],
    start: 'jawsGate',
    landmarks: ['jawsGate'],
    tallWalls: 1.5,
    places: ['Predator', 'Pliosaur', 'Jurassic', 'Apex', 'Bone', 'Abyssal', 'Fossil', 'Tidal', 'Primeval'],
    music: { lap: 'predator-x', finalLap: 'predator-x-final-lap' },
  },
  castle: {
    surface: 'flagstone',
    deck: 'boards',
    alt: 'rock',
    liquid: 'lava',
    hazards: ['crushers', 'flameJets'],
    start: 'castleGate',
    landmarks: ['castleGate'],
    tallWalls: 6,
    places: ['Crumbling', 'Thwomp', 'Keep', 'Dungeon', 'Rampart', 'Moat', 'Gallery', 'Portcullis', 'Battlement'],
    music: { lap: 'crumbling-castle', finalLap: 'crumbling-castle-final-lap' },
  },
  skycastle: {
    surface: 'cloud',
    deck: 'flagstone',
    alt: 'flagstone',
    hazards: ['gusts'],
    start: 'cloudGate',
    landmarks: ['cloudGate'],
    tallWalls: 1.2,
    places: ['Cloud', 'Turret', 'Skyward', 'Drawbridge', 'Pennant', 'Zephyr', 'Lofty', 'Spire', 'Daydream'],
    music: { lap: 'castle-in-the-air', finalLap: 'castle-in-the-air-final-lap' },
  },
  cell: {
    surface: 'membrane',
    deck: 'membrane',
    alt: 'membrane',
    liquid: 'water',
    hazards: ['vesicles'],
    start: 'cellGate',
    landmarks: ['cellGate'],
    tallWalls: 4,
    places: ['Mitochondria', 'Golgi', 'Ribosome', 'Lysosome', 'Cytoplasm', 'Membrane', 'Vesicle', 'Nucleolus', 'Organelle'],
    music: { lap: 'inner-cell', finalLap: 'inner-cell-final-lap' },
  },
  prism: {
    surface: 'prism',
    deck: 'prism',
    alt: 'prism',
    hazards: ['prisms'],
    start: 'prismGate',
    landmarks: ['prismGate'],
    tallWalls: 5,
    places: ['Spectrum', 'Prism', 'Cone Cell', 'Ultraviolet', 'Refraction', 'Mirror', 'Afterimage', 'Iris', 'Fourth Colour'],
    music: { lap: 'tetrachromacy', finalLap: 'tetrachromacy-final-lap' },
  },
  factory: {
    surface: 'steel',
    deck: 'steel',
    alt: 'asphalt',
    liquid: 'lava',
    hazards: ['robots'],
    start: 'factoryGate',
    landmarks: ['factoryGate'],
    tallWalls: 6,
    places: ['Assembly', 'Conveyor', 'Press', 'Smelter', 'Scrapyard', 'Robot', 'Piston', 'Foundry', 'Loading Bay'],
    music: { lap: 'robot-stop', finalLap: 'robot-stop-final-lap' },
  },
  gamma: {
    surface: 'chrome',
    deck: 'chrome',
    alt: 'chrome',
    liquid: 'water',
    hazards: ['gammaRays'],
    start: 'gammaGate',
    landmarks: ['gammaGate'],
    tallWalls: 5,
    places: ['Collimator', 'Cortex', 'Scalpel', 'Isotope', 'Synapse', 'Lesion', 'Cranial', 'Focal', 'Theatre'],
    music: { lap: 'gamma-knife', finalLap: 'gamma-knife-final-lap' },
  },
  carrion: {
    surface: 'scorched',
    deck: 'boards',
    alt: 'sand',
    hazards: ['vultures', 'tumbleweeds'],
    start: 'carrionGate',
    landmarks: ['carrionGate'],
    tallWalls: 4,
    places: ['Carcass', 'Scavenger', 'Ribcage', 'Thermal', 'Bone', 'Gizzard', 'Circling', 'Talon', 'Dry Lake'],
    music: { lap: 'people-vultures', finalLap: 'people-vultures-final-lap' },
  },
  wah: {
    surface: 'fret',
    deck: 'fret',
    alt: 'neon',
    hazards: ['wahs'],
    start: 'wahGate',
    landmarks: ['wahGate'],
    tallWalls: 5,
    places: ['Pedalboard', 'Heel Down', 'Toe Down', 'Sweep', 'Resonance', 'Feedback', 'Filter', 'Octave', 'Fuzz'],
    music: { lap: 'wah-wah', finalLap: 'wah-wah-final-lap' },
  },
  smog: {
    surface: 'tar',
    deck: 'tar',
    alt: 'oil',
    liquid: 'oil',
    hazards: ['smog'],
    start: 'smogGate',
    landmarks: ['smogGate'],
    tallWalls: 6,
    places: ['Smokestack', 'Smog', 'Refinery', 'Landfill', 'Sewer', 'Ash', 'Overpass', 'Slag', 'Planet B'],
    music: { lap: 'planet-b', finalLap: 'planet-b-final-lap' },
  },
  dome: {
    surface: 'gilded',
    deck: 'gilded',
    alt: 'regolith',
    hazards: ['airlocks', 'dustDevils'],
    start: 'domeGate',
    landmarks: ['domeGate'],
    tallWalls: 6,
    places: ['Penthouse', 'Dome', 'Airlock', 'Undercity', 'Champagne', 'Gilded', 'Red Dust', 'Terrace', 'Tharsis'],
    music: { lap: 'mars-for-the-rich', finalLap: 'mars-for-the-rich-final-lap' },
  },
  solar: {
    surface: 'heatshield',
    deck: 'heatshield',
    alt: 'heatshield',
    liquid: 'lava',
    hazards: ['flares'],
    start: 'shipGate',
    landmarks: ['shipGate'],
    tallWalls: 5,
    places: ['Corona', 'Sunspot', 'Prominence', 'Slingshot', 'Heat Shield', 'Photon', 'Flare', 'Orbit', 'Perihelion'],
    music: { lap: 'perihelion', finalLap: 'perihelion-final-lap' },
  },
  inferno: {
    surface: 'brimstone',
    deck: 'brimstone',
    alt: 'rock',
    liquid: 'lava',
    hazards: ['rats', 'flameJets'],
    start: 'hellGate',
    landmarks: ['hellGate'],
    tallWalls: 6,
    places: ['Brimstone', 'Pit', 'Rat', 'Circle', 'Sulphur', 'Damnation', 'Nest', 'Cinder', 'Abyss'],
    music: { lap: 'hell', finalLap: 'hell-final-lap' },
  },
  mind: {
    surface: 'neural',
    deck: 'neural',
    alt: 'neon',
    hazards: ['eyes'],
    start: 'eyeGate',
    landmarks: ['eyeGate'],
    tallWalls: 6,
    places: ['Cortex', 'Synapse', 'Third Eye', 'Neuron', 'Dream', 'Subconscious', 'Thought', 'Mind', 'Pineal'],
    music: { lap: 'im-in-your-mind', finalLap: 'im-in-your-mind-final-lap' },
  },
  notmind: {
    surface: 'opart',
    deck: 'opart',
    alt: 'neon',
    hazards: ['arrows'],
    start: 'arrowGate',
    landmarks: ['arrowGate'],
    tallWalls: 5,
    places: ['Nowhere', 'Blind Spot', 'Vacant', 'Mirror', 'Empty Head', 'Void', 'Missing', 'Not There', 'Blank'],
    music: { lap: 'im-not-in-your-mind', finalLap: 'im-not-in-your-mind-final-lap' },
  },
  cellophane: {
    surface: 'film',
    deck: 'film',
    alt: 'prism',
    liquid: 'water',
    hazards: ['sheets'],
    start: 'filmGate',
    landmarks: ['filmGate'],
    tallWalls: 6,
    places: ['Wrapper', 'Crinkle', 'Fold', 'Kaleidoscope', 'Stained Glass', 'Roll', 'Cling', 'Sheen', 'Cellophane'],
    music: { lap: 'cellophane', finalLap: 'cellophane-final-lap' },
  },
  mindfuzz: {
    surface: 'fuzz',
    deck: 'fuzz',
    alt: 'neon',
    hazards: ['fuzz', 'eyes'],
    start: 'fuzzGate',
    landmarks: ['fuzzGate'],
    tallWalls: 6,
    places: ['Overdrive', 'Feedback', 'Swirl', 'Amp', 'Distortion', 'Needle', 'Static', 'Wall of Sound', 'Fuzz'],
    music: { lap: 'im-in-your-mind-fuzz', finalLap: 'im-in-your-mind-fuzz-final-lap' },
  },
  elbow: {
    surface: 'carpet',
    deck: 'carpet',
    alt: 'boards',
    hazards: ['elbows'],
    start: 'elbowGate',
    landmarks: ['elbowGate'],
    tallWalls: 6,
    places: ['Big Shot', 'Elbow', 'Backstab', 'Band Room', 'Mosh', 'Hey Hey', 'Flange', 'Knuckle', 'Front Bar'],
    music: { lap: 'elbow', finalLap: 'elbow-final-lap' },
  },
  muck: {
    surface: 'muck',
    deck: 'boards',
    liquid: 'water',
    hazards: ['rakes'],
    start: 'rakeGate',
    landmarks: ['rakeGate'],
    tallWalls: 6,
    places: ['Cobweb', 'Muck', 'Rake', 'Ant', 'Wetland', 'Fairway', 'Chimney', 'Boardwalk', 'Bog'],
    music: { lap: 'muckraker', finalLap: 'muckraker-final-lap' },
  },
  boogie: {
    surface: 'dancefloor',
    deck: 'dancefloor',
    alt: 'neon',
    liquid: 'water',
    hazards: ['razors'],
    start: 'harmonicaGate',
    landmarks: ['harmonicaGate'],
    tallWalls: 6,
    places: ['Boogie', 'Mono', 'Razor', 'Stitch', 'Party', 'Mirror Ball', 'Harmonica', 'Inches', 'Pool'],
    music: { lap: 'cut-throat-boogie', finalLap: 'cut-throat-boogie-final-lap' },
  },
  treesea: {
    surface: 'moss',
    deck: 'boards',
    hazards: ['timber'],
    start: 'trunkGate',
    landmarks: ['trunkGate'],
    tallWalls: 6,
    places: ['Canopy', 'Moss', 'Lava Tube', 'Swell', 'Root', 'Hollow', 'Jam', 'Tree Line', 'Underwater'],
    music: { lap: 'sea-of-trees', finalLap: 'sea-of-trees-final-lap' },
  },
  theia: {
    surface: 'silver',
    deck: 'silver',
    alt: 'brimstone',
    liquid: 'lava',
    hazards: ['cords'],
    start: 'cordGate',
    landmarks: ['cordGate'],
    tallWalls: 6,
    places: ['Theia', 'Silver Cord', 'Impact', 'Snap', 'Maker', 'Mortal Coil', 'Honeyed Sky', 'Astral Beach', 'Cosmic Foam'],
    music: { lap: 'theia', finalLap: 'theia-final-lap' },
  },
  set: {
    surface: 'hieroglyph',
    deck: 'hieroglyph',
    alt: 'sand',
    hazards: ['sunMoon'],
    start: 'setGate',
    landmarks: ['setGate'],
    tallWalls: 6,
    places: ['Jackal', 'Snake', 'Tornado', 'Tomb', 'Duality', 'Sandstorm', 'Moonbeam', 'Hieroglyph', 'Reset'],
    music: { lap: 'set', finalLap: 'set-final-lap' },
  },
  change: {
    surface: 'jade',
    deck: 'jade',
    alt: 'regolith',
    hazards: ['strings'],
    start: 'jadePortal',
    landmarks: ['jadePortal'],
    tallWalls: 6,
    places: ['Jade', 'Moon-Sea', 'Lyre', 'White Rabbit', 'Elixir', 'Moonbeam', 'Palace', 'Bright Night', 'Ten Suns'],
    music: { lap: 'change', finalLap: 'change-final-lap' },
  },
  uruk: {
    surface: 'mudbrick',
    deck: 'mudbrick',
    alt: 'sand',
    liquid: 'water',
    hazards: ['serpents'],
    start: 'urukGate',
    landmarks: ['urukGate'],
    tallWalls: 6,
    places: ['Uruk', 'Shamash', 'Scorpion', 'Cedar', 'Flood', 'Razorback', 'Bull', 'Thirteen Winds', 'House of Dust'],
    music: { lap: 'gilgamesh', finalLap: 'gilgamesh-final-lap' },
  },
  headon: {
    surface: 'paisley',
    deck: 'paisley',
    liquid: 'oil',
    hazards: ['pills'],
    start: 'sitarGate',
    landmarks: ['sitarGate'],
    tallWalls: 6,
    places: ['Just Yesterday', 'Legs', 'Eyes', 'Head On', 'Screw', 'Black Cup', 'Black Enemy', 'Wrong Pill', 'Pond Scum'],
    music: { lap: 'head-on-pill', finalLap: 'head-on-pill-final-lap' },
  },
  godcall: {
    surface: 'bitumen',
    deck: 'bitumen',
    alt: 'asphalt',
    liquid: 'water',
    hazards: ['presents'],
    start: 'heavenGate',
    landmarks: ['heavenGate'],
    tallWalls: 6,
    places: ['Hilltop', 'Santa', 'Sack', 'Blade', 'Axe', 'Flunk', 'Tinsel', 'Weatherboard', 'Back Home'],
    music: { lap: 'god-is-calling', finalLap: 'god-is-calling-final-lap' },
  },
  nan: {
    surface: 'florals',
    deck: 'florals',
    alt: 'boards',
    liquid: 'water',
    hazards: ['cameras'],
    start: 'lockedDoor',
    landmarks: ['lockedDoor'],
    tallWalls: 6,
    places: ['Mask', 'Locks', 'Hallway', 'Teacup', 'Nan', 'Doily', 'Surveillance', 'Ends Meet', 'Last Time'],
    music: { lap: 'mend-the-past', finalLap: 'mend-the-past-final-lap' },
  },
  float: {
    surface: 'gravel',
    deck: 'boards',
    alt: 'rock',
    liquid: 'water',
    hazards: ['bubbles'],
    start: 'oldFord',
    landmarks: ['oldFord'],
    tallWalls: 6,
    places: ['Old Ford', 'Barn', 'Carpet Shades', 'Paper Folds', 'Coffee Mug', 'Deep Breath', 'Dam', 'Paddock', 'Lungs'],
    music: { lap: 'float-along', finalLap: 'float-along-final-lap' },
  },
  newworld: {
    surface: 'crust',
    deck: 'crust',
    alt: 'rock',
    liquid: 'water',
    hazards: ['stomps'],
    start: 'newWorldGate',
    landmarks: ['newWorldGate'],
    tallWalls: 6,
    places: ['New World', 'Dust', 'Mushroom Cloud', 'Meadow', 'Lone Tree', 'Creek', 'Dreams', 'Unsteady Gait', 'Stone'],
    music: { lap: 'altered-beast-i', finalLap: 'altered-beast-i-final-lap' },
  },
  foe: {
    surface: 'butcher',
    deck: 'butcher',
    alt: 'boards',
    hazards: ['cutlery'],
    start: 'catapultGate',
    landmarks: ['catapultGate'],
    tallWalls: 6,
    places: ['Foe', 'Sabre', 'Catapult', 'Food Chain', 'Crusty Bread', 'Malevolence', 'Golden Wolf', 'Caribou', 'Butcher'],
    music: { lap: 'altered-beast-ii', finalLap: 'altered-beast-ii-final-lap' },
  },
  altered: {
    surface: 'fur',
    deck: 'fur',
    hazards: ['fangs'],
    start: 'fangGate',
    landmarks: ['fangGate'],
    tallWalls: 6,
    places: ['Hiding Place', 'Peep', 'Angels', 'Altered World', 'White Teeth', 'Beastly', 'Pearl Fangs', 'Reborn', 'Nucleus'],
    music: { lap: 'altered-beast-iii', finalLap: 'altered-beast-iii-final-lap' },
  },
  hollow: {
    surface: 'bone',
    deck: 'bone',
    alt: 'rock',
    hazards: ['void'],
    start: 'culDeSac',
    landmarks: ['culDeSac', 'ribcage'],
    tallWalls: 6,
    places: ['Hollow', 'Void', 'Canyon', 'Cul-de-Sac', 'Ribcage', 'Sport', 'Savage', 'Never', 'Hell and Back'],
    music: { lap: 'altered-beast-iv', finalLap: 'altered-beast-iv-final-lap' },
  },
  forge: {
    surface: 'anvil',
    deck: 'anvil',
    alt: 'steel',
    liquid: 'water',
    hazards: ['hammer'],
    start: 'anvilGate',
    landmarks: ['anvilGate'],
    tallWalls: 6,
    places: ['Water', 'Fire', 'Clouds', 'Ice', 'Slipstream', 'Summer Breeze', 'Rebirth', 'Blacksmith', 'Secret', 'Stars'],
    music: { lap: 'alien-metal', finalLap: 'alien-metal-final-lap' },
  },
  steelwar: {
    surface: 'ore',
    deck: 'ore',
    alt: 'rock',
    hazards: ['magnets'],
    start: 'steelGate',
    landmarks: ['steelGate'],
    tallWalls: 6,
    places: ['Death', 'Upon You', 'Bad Luck', 'Ill Will', 'Steel', 'Level Five', 'Terrace', 'Conveyor', 'Pit'],
    music: { lap: 'kill-for-the-steel', finalLap: 'kill-for-the-steel-final-lap' },
  },
  autonomy: {
    surface: 'lane',
    deck: 'lane',
    alt: 'steel',
    hazards: ['autopilot'],
    start: 'carParkGate',
    landmarks: ['carParkGate', 'deadSky'],
    tallWalls: 6,
    places: ['Level Five', 'Autonomy', 'Expiry', 'Windscreen', 'Mortician', 'Incision', 'Sulphur', 'Rebellion', 'Blind Faith'],
    music: { lap: 'level-5', finalLap: 'level-5-final-lap' },
  },
  reactor: {
    surface: 'lead',
    deck: 'lead',
    alt: 'steel',
    liquid: 'water',
    hazards: ['alphas'],
    start: 'reactorGate',
    landmarks: ['reactorGate', 'atomNucleus'],
    tallWalls: 6,
    places: ['Walls', 'Rapid Flame', 'Alpha', 'Lead', 'Metallic', 'Jumpstart', 'Static', 'Transcend', 'Keeper', 'Energy and Heat'],
    music: { lap: 'rapid-alpha-decay', finalLap: 'rapid-alpha-decay-final-lap' },
  },
  muddy: {
    surface: 'clay',
    deck: 'clay',
    alt: 'sand',
    liquid: 'water',
    hazards: ['sharks'],
    start: 'flagsGate',
    landmarks: ['flagsGate', 'sharkCopter'],
    tallWalls: 6,
    places: ['Shark Bait', 'Heat Stroke', 'Amber Coals', 'Salty Spray', 'Buoy', 'Muddy Water', 'Hungry Fishes', 'Willow', 'Driftwood', 'Muscle Men'],
    music: { lap: 'muddy-water', finalLap: 'muddy-water-final-lap' },
  },
  scala: {
    surface: 'strata',
    deck: 'strata',
    alt: 'rock',
    hazards: ['rockyMeteors'],
    start: 'chainGate',
    landmarks: ['chainGate', 'emptyThrone'],
    tallWalls: 6,
    places: ['Great Chain', 'Rock with Eyes', 'Pocket', 'Precious Stones', 'Throne', 'Natural Flesh', 'Meteor', 'Church', 'Stairs', 'Chains', 'Natural Order', 'Sulking Lamb'],
    music: { lap: 'great-chain-of-being', finalLap: 'great-chain-of-being-final-lap' },
  },
  network: {
    surface: 'circuit',
    deck: 'circuit',
    alt: 'steel',
    hazards: ['sweepers'],
    start: 'knownGate',
    landmarks: ['knownGate', 'kingsEye'],
    tallWalls: 6,
    places: ['Human', 'Vermin', 'Weed', 'Acetone', 'Synapse', 'Network', 'Steel Bone', 'Fourth Cone', 'Mainframe'],
    music: { lap: 'all-is-known', finalLap: 'all-is-known-final-lap' },
  },
  wheel: {
    surface: 'groove',
    deck: 'groove',
    alt: 'boards',
    hazards: ['dozes'],
    start: 'wheelGate',
    landmarks: ['wheelGate', 'greatWheel', 'reaper'],
    tallWalls: 6,
    places: ['Stupor', 'Into Our Future', 'Without Mercy', 'Better Thesis', 'Pilgrim', 'Steeper Path', 'Reaper', 'Allegiance', 'Locked Groove'],
    music: { lap: 'the-wheel', finalLap: 'the-wheel-final-lap' },
  },
});

const NAME_ADJECTIVES = ['Microtonal', 'Polygon', 'Infinite', 'Nonagon', 'Fuzz', 'Quarter-Tone', 'Psychedelic', 'Altered', 'Cosmic', 'Crumbling', 'Sleepy', 'Plastic', 'Gumboot', 'Robot', 'Hypertension'];
const NAME_KINDS = ['Run', 'Loop', 'Circuit', 'Raceway', 'Speedway', 'Rally', 'Ring', 'Gauntlet', 'Drift', 'Dash', 'Boogie'];

/** A name for a generated track, from its seed and theme. */
export function trackName(p: Pick<GenParams, 'seed' | 'theme'>): string {
  const rand = seededRandom(p.seed * 31 + 7);
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  return `${pick(NAME_ADJECTIVES)} ${pick(PALETTES[p.theme].places)} ${pick(NAME_KINDS)}`;
}

/** A generated track's id, for its records: a layout past the first has its own (`-l2`), so old boards stay with old tracks. */
export function trackId(p: GenParams): string {
  const layout = p.layout ?? 1;
  return `gen-${p.theme}-${p.complexity}-${p.length}-${p.seed}${layout > 1 ? `-l${layout}` : ''}`;
}

/** How the last generation went (tests and tuning): attempts, rejects, and the shape the track was laid round. */
export const generatorStats = { attempts: 0, fallbacks: 0, rejects: { closure: 0, overlap: 0, coaster: 0, flyover: 0, kicker: 0 }, shape: 'rectangle' as GenShape };

/** Builds the track for these dials; a layout that fails its checks is re-rolled from the same seed. */
export function generateTrack(p: GenParams): TrackDef {
  const overpasses = (p.layout ?? 1) > 1;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const def = attemptTrack(p, attempt);
    generatorStats.attempts = attempt + 1;
    if (def && isPlayable(def, overpasses)) return def;
    if (def) generatorStats.rejects.overlap++;
  }
  generatorStats.fallbacks++;
  // Every attempt failed (it shouldn't): the plainest loop for these dials.
  return attemptTrack({ ...p, complexity: 1 }, 0, true)!;
}

/**
 * Road that doesn't cross itself, shortcuts clear of the rest of the road,
 * and checkpoints on solid road. With `overpasses` (the shaped layouts) the
 * road may cross itself where one stretch is a deck high over the other.
 */
export function isPlayable(def: TrackDef, overpasses = false): boolean {
  const track = new Track(def);
  if (selfGap(track, overpasses) < 5) return false;
  if (track.branches.some((_, k) => branchGap(track, k) < 5)) return false;
  return def.checkpoints.every((cp) => {
    const pose = track.respawnPose(cp * track.length + 2);
    return track.locate(pose.x, pose.z, pose.y).onRoad;
  });
}

/**
 * Closest the road comes to itself, edge to edge, away from where it's the
 * same stretch. Flat on the map: a deck high over another stretch of road
 * still counts as a crossing, unless `overpasses` lets a deck pass over road
 * at least OVERPASS below it (a flyover).
 */
export function selfGap(track: Track, overpasses = false): number {
  const sp = track.spline;
  const main = track.main;
  const deck = (i: number) => !!main.def.sections[main.sectionIndex[i]]?.bridge;
  let min = Infinity;
  for (let i = 0; i < sp.count; i += 2) {
    for (let j = i + 2; j < sp.count; j += 2) {
      const along = Math.abs(sp.dist[i] - sp.dist[j]);
      if (Math.min(along, sp.length - along) < 120) continue;
      if (overpasses && (deck(i) || deck(j)) && Math.abs(main.heightAt(sp.dist[i]) - main.heightAt(sp.dist[j])) >= OVERPASS) continue;
      const gap = Math.hypot(sp.px[i] - sp.px[j], sp.pz[i] - sp.pz[j]) - track.main.halfWidth[i] - track.main.halfWidth[j];
      if (gap < min) min = gap;
    }
  }
  return min;
}

/**
 * Closest a branch comes to the main road, edge to edge, away from its
 * junctions: near either end (SHORTCUT_JUNCTION) the road it cuts across,
 * and 60 m either side of it, doesn't count; the rest of the lap does.
 * Its pits must stay off the main road too.
 */
export function branchGap(track: Track, k: number): number {
  const br = track.branches[k];
  const def = track.def.branches[k];
  const main = track.main;
  const sp = main.spline;
  const from = track.mainS(def.mainFrom);
  const to = track.mainS(def.mainTo);
  const L = br.spline.length;
  let min = Infinity;
  for (let i = 0; i < br.spline.count; i++) {
    const s = br.spline.dist[i];
    const nearEnd = s < SHORTCUT_JUNCTION || s > L - SHORTCUT_JUNCTION;
    for (let j = 0; j < sp.count; j += 2) {
      const m = sp.dist[j];
      const cut = m > from - 60 && m < to + 60;
      if (cut && nearEnd) continue;
      const gap = Math.hypot(br.spline.px[i] - sp.px[j], br.spline.pz[i] - sp.pz[j]) - br.halfWidth[i] - main.halfWidth[j];
      if (gap < min) min = gap;
    }
  }
  for (const pit of track.def.pits) {
    // The branch's own pits sit on its centerline.
    if (nearestOnSpline(br.spline, pit.x, pit.z).distance > 1) continue;
    for (let j = 0; j < sp.count; j++) {
      const hw = main.halfWidth[j];
      if (inPit({ ...pit, halfLength: pit.halfLength + hw, halfWidth: pit.halfWidth + hw }, sp.px[j], sp.pz[j])) return 0;
    }
  }
  return min;
}

/** Lays straights (curvature 0) and arcs (signed curvature, 1/m) end to end, starting a new section at each split (metres along). */
function lay(b: TrackBuilder, pieces: [number, number][], splits: [number, string, SectionProps][]): void {
  let at = 0;
  let next = 0;
  for (const [len, k] of pieces) {
    let left = len;
    while (left > 1e-9) {
      const split = splits[next];
      const run = split && split[0] < at + left ? Math.max(0, split[0] - at) : left;
      if (run > 0) {
        if (k === 0) b.straight(run);
        else b.arc(1 / Math.abs(k), (Math.sign(k) * run * Math.abs(k) * 180) / Math.PI);
      }
      at += run;
      left -= run;
      if (split && split[0] <= at + 1e-9) {
        b.section(split[1], split[2]);
        next++;
      }
    }
  }
}

interface Module {
  name: string;
  /** Hazards that fit it: crossing kinds need a straight-ish run. */
  open: boolean;
  props: Partial<SectionProps>;
  build: (b: TrackBuilder, side: number) => void;
  /** Kicker lips, metres into the module. */
  kickers?: number[];
  /** A bulge a shortcut can cut straight across. */
  bulge?: boolean;
  /** Its heights are its own (kickers, jumps, bridges, coasters): no hills over it. */
  fixed?: boolean;
  /** A walled stretch that can be sunk into a cut. */
  walled?: boolean;
  /** Its own road heights, [from, to, height, step] in metres into the module, shaped after the layout. */
  shapes?: Shape[];
}

/** A stretch of road's height: from, to, height at s, sample step. */
type Shape = [number, number, (s: number) => number, number];

/** A spot on a risky line for the double item box row; the highest rank gets it. */
interface RiskySpot extends ItemBoxRow {
  rank: number;
}

/**
 * The shapes a layout's skeleton is drawn round (GEN_LAYOUT): not the old
 * box (four sides round the edge of the map, the middle empty) but a shape
 * with corners turning both ways, legs across the middle, or a crossing on
 * a flyover. Each leg is filled with modules as the rectangle's sides were.
 */
export type GenShape = 'rectangle' | 'L' | 'U' | 'T' | 'zigzag' | 'stairs' | 'triangle' | 'kite' | 'eight' | 'lollipop';
export const GEN_SHAPES: readonly GenShape[] = ['rectangle', 'L', 'U', 'T', 'zigzag', 'stairs', 'triangle', 'kite', 'eight', 'lollipop'];

/** How likely each shape is at a twists setting (relative odds): the rectangle rare and only at low twists, the busier shapes likelier as twists rise. */
export function shapeOdds(c: number): Record<GenShape, number> {
  return {
    rectangle: c <= 2 ? 0.4 : c === 3 ? 0.15 : 0,
    L: 1,
    triangle: 1,
    kite: 1,
    lollipop: 1,
    U: 0.6 + 0.15 * c,
    T: 0.6 + 0.15 * c,
    stairs: 0.4 + 0.2 * c,
    zigzag: 0.4 + 0.2 * c,
    eight: 0.4 + 0.25 * c,
  };
}

type UV = [number, number];

/** A shape's outline, unscaled, as (u, v) corners with v to the left of u, run anticlockwise (left turns); its proportions from `r`. */
function outline(kind: GenShape, r: (a: number, b: number) => number): UV[] {
  switch (kind) {
    case 'rectangle': {
      const a = r(1, 1.6);
      return [[0, 0], [a, 0], [a, 1], [0, 1]];
    }
    case 'L': {
      // A notch out of one corner.
      const a = r(1.5, 2.1);
      const b = r(1.3, 1.8);
      const x = a * r(0.42, 0.6);
      const y = b * r(0.4, 0.6);
      return [[0, 0], [a, 0], [a, y], [x, y], [x, b], [0, b]];
    }
    case 'U': {
      // A horseshoe: two arms and the bay between them.
      const a = r(1.7, 2.3);
      const b = r(1.1, 1.5);
      const arm = a * r(0.28, 0.36);
      const d = b * r(0.35, 0.55);
      return [[0, 0], [a, 0], [a, b], [a - arm, b], [a - arm, d], [arm, d], [arm, b], [0, b]];
    }
    case 'T': {
      // A bar across the top on a stem.
      const a = r(1.9, 2.5);
      const b = r(1.4, 1.8);
      const stem = a * r(0.34, 0.46);
      const y = b * r(0.45, 0.6);
      const s0 = (a - stem) / 2 + a * r(-0.08, 0.08);
      return [[s0, 0], [s0 + stem, 0], [s0 + stem, y], [a, y], [a, b], [0, b], [0, y], [s0, y]];
    }
    case 'stairs': {
      // Three steps up a diagonal.
      const x1 = r(0.8, 1.2);
      const x2 = x1 + r(0.8, 1.2);
      const x3 = x2 + r(0.8, 1.2);
      const y1 = r(0.6, 0.9);
      const y2 = y1 + r(0.6, 0.9);
      const y3 = y2 + r(0.6, 0.9);
      return [[0, 0], [x3, 0], [x3, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y3], [0, y3]];
    }
    case 'zigzag': {
      // A saw-toothed side: in, out, in again across the top.
      const a = r(2.4, 3);
      const b = r(1.1, 1.4);
      const d = b * r(0.4, 0.55);
      return [[0, 0], [a, 0], [a, b], [0.75 * a, b - d], [0.5 * a, b], [0.25 * a, b - d], [0, b]];
    }
    case 'triangle': {
      const x = r(0.2, 0.8);
      return [[0, 0], [1, 0], [x, r(0.75, 1)]];
    }
    case 'kite': {
      // Long below its crossbar, short above, a little lopsided.
      return [[0, 0], [r(0.26, 0.34), r(0.6, 0.72)], [r(-0.05, 0.05), 1], [-r(0.26, 0.34), r(0.6, 0.72)]];
    }
    case 'eight': {
      // Two loops, the road crossing itself between them: one diagonal over the other on a flyover.
      const h = r(0.65, 0.85);
      const w = r(0.26, 0.34);
      return [[0, 0], [1, h], [1 + w, h], [1 + w, 0], [1, 0], [0, h], [-w, h], [-w, 0]];
    }
    case 'lollipop': {
      // A loop on the end of a stem, out on one lane and back on the other.
      const L = r(1, 1.4);
      const S = r(0.55, 0.75);
      const D = r(1, 1.3);
      const e = r(0.6, 0.8);
      return [[0, 0], [L, 0], [L, -e], [L + D, -e], [L + D, S + e], [L, S + e], [L, S], [0, S]];
    }
  }
}

/** A skeleton fitted to a lap: its corners (metres), the turn and cut-back at each, and how each leg is to be filled. */
interface Skeleton {
  shape: GenShape;
  /** Corner k starts leg k. */
  pts: UV[];
  dirs: UV[];
  len: number[];
  /** The turn at corner k (radians, left positive), and how far its bend reaches back along each leg. */
  turns: number[];
  tan: number[];
  /** Legs near another leg: nothing that shifts the road sideways (S-bends, hairpins, swings). */
  calm: boolean[];
  /** Which way a swing goes out of the shape: 1 right, -1 left, 0 none. */
  out: number[];
  /** The quarter of the lap each leg starts in. */
  phase: number[];
  /** The leg the coaster goes on (from twists 3): the longest past the first quarter of the lap (first thing on it), else the first (at its end). */
  coaster: number;
  /** A figure of eight: the leg laid first, kept level and straight where it's crossed, and the leg that flies over it. */
  cross: { lower: number; upper: number; at: UV; sin: number } | null;
  /** Centre of its bounds, put at the middle of the map. */
  centre: UV;
}

const sub = (a: UV, b: UV): UV => [a[0] - b[0], a[1] - b[1]];
const crossUV = (a: UV, b: UV) => a[0] * b[1] - a[1] * b[0];
const dotUV = (a: UV, b: UV) => a[0] * b[0] + a[1] * b[1];
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function pointSeg(p: UV, a: UV, b: UV): number {
  const ab = sub(b, a);
  const t = clamp(dotUV(sub(p, a), ab) / dotUV(ab, ab), 0, 1);
  return Math.hypot(p[0] - a[0] - t * ab[0], p[1] - a[1] - t * ab[1]);
}

/** Where two segments cross, or null. */
function segCross(a: UV, b: UV, c: UV, d: UV): UV | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const den = crossUV(r, s);
  if (Math.abs(den) < 1e-9) return null;
  const t = crossUV(sub(c, a), s) / den;
  const u = crossUV(sub(c, a), r) / den;
  return t > 0 && t < 1 && u > 0 && u < 1 ? [a[0] + t * r[0], a[1] + t * r[1]] : null;
}

function segDist(a: UV, b: UV, c: UV, d: UV): number {
  if (segCross(a, b, c, d)) return 0;
  return Math.min(pointSeg(a, c, d), pointSeg(b, c, d), pointSeg(c, a, b), pointSeg(d, a, b));
}

/**
 * How far either side of the crossing, along either road, the other road is
 * near enough to count (roads this wide, half width in metres, crossing at
 * this angle): the flyover stays high and the road under it level that far.
 */
const clearOf = (hw: number, sin: number) => (2 * hw + 5) / sin + 8;
const underHalf = (hw: number, sin: number) => clearOf(hw, sin) + 12;

/** A flyover's heights: its length, how far in it crosses the road below, its height profile and where its deck (on pillars) starts and ends. */
interface FlyoverPlan {
  len: number;
  at: number;
  shapes: Shape[];
  deckFrom: number;
  deckTo: number;
}

/**
 * The road over the crossing: a ramp up onto a deck high over the other
 * road and down again; or, with a `top` (from twists 3), a coaster that
 * crosses it: a climb to `top`, level over the crossing, the lead up to the
 * crest and the plunge.
 */
function flyoverPlan(clear: number, top: number | null): FlyoverPlan {
  const high = OVERPASS + 0.5;
  if (top === null) {
    const rampTop = FLY_IN + FLY_RAMP;
    const len = 2 * (rampTop + clear);
    const ramp = (x: number) => (FLY_HEIGHT * (1 - Math.cos((Math.PI * x) / FLY_RAMP))) / 2;
    const deckFrom = FLY_IN + (FLY_RAMP * Math.acos(1 - (2 * DECK_LINE) / FLY_HEIGHT)) / Math.PI;
    return {
      len,
      at: len / 2,
      shapes: [
        [FLY_IN, rampTop, (x) => ramp(x - FLY_IN), 4],
        [rampTop, len - rampTop, () => FLY_HEIGHT, 4],
        [len - rampTop, len - FLY_IN, (x) => ramp(len - FLY_IN - x), 4],
      ],
      deckFrom,
      deckTo: len - deckFrom,
    };
  }
  const climb = top * 5;
  const peak = top + COASTER_LIFT;
  const drop = (2 * peak) / COASTER_DROP_SLOPE;
  // High enough over the road below from the top of the climb until the plunge has dropped this far.
  const tail = COASTER_LEAD + drop * (1 - Math.sqrt(high / peak));
  const level = Math.max(0, 2 * clear - tail);
  const lead = COASTER_IN + climb + level;
  const crest = lead + COASTER_LEAD;
  return {
    len: crest + drop + COASTER_OUT,
    at: COASTER_IN + climb + (level + tail) / 2,
    shapes: [
      [COASTER_IN, COASTER_IN + climb, (x) => (top * (1 - Math.cos((Math.PI * (x - COASTER_IN)) / climb))) / 2, 4],
      [COASTER_IN + climb, lead, () => top, 4],
      [lead, crest, (x) => top + (COASTER_LIFT * (x - lead)) / COASTER_LEAD, 4],
      [crest, crest + drop, (x) => peak * (1 - (x - crest) / drop) ** 2, 2],
    ],
    deckFrom: COASTER_IN + (climb * Math.acos(1 - (2 * DECK_LINE) / top)) / Math.PI,
    deckTo: crest + drop * (1 - Math.sqrt(DECK_LINE / peak)),
  };
}

/**
 * Scales an outline to the lap, picks the leg the finish line goes on and
 * checks it can be built: every turn a real corner and none too sharp, room
 * on every leg between its bends, legs that don't meet kept well apart, at
 * most one crossing, steep enough and with room for the flyover.
 */
function fitSkeleton(shape: GenShape, raw: UV[], per: number, R: number, hw: number, coasterRoom: number, rand: () => number): Skeleton | null {
  // From twists 3 a figure of eight's flyover is its coaster.
  const flyTop = coasterRoom > 0 ? COASTER_MIN : null;
  let n = raw.length;
  let total = 0;
  for (let k = 0; k < n; k++) total += Math.hypot(...sub(raw[(k + 1) % n], raw[k]));
  let pts = raw.map(([u, v]): UV => [(u * per) / total, (v * per) / total]);
  // Mirrored half the time (and run backwards, so it still turns left).
  if (rand() < 0.5) pts = pts.map(([u, v]): UV => [-u, v]).reverse();
  n = pts.length;
  const geometry = (q: UV[]) => {
    const len = q.map((p, k) => Math.hypot(...sub(q[(k + 1) % n], p)));
    const dirs = q.map((p, k): UV => {
      const d = sub(q[(k + 1) % n], p);
      return [d[0] / len[k], d[1] / len[k]];
    });
    const turns = dirs.map((d, k) => wrapPi(Math.atan2(d[1], d[0]) - Math.atan2(dirs[(k + n - 1) % n][1], dirs[(k + n - 1) % n][0])));
    const tan = turns.map((t) => R * Math.tan(Math.abs(t) / 2));
    return { len, dirs, turns, tan };
  };
  const g = geometry(pts);
  if (g.turns.some((t) => Math.abs(t) < (8 * Math.PI) / 180 || Math.abs(t) > (140 * Math.PI) / 180)) return null;
  const free = (k: number) => g.len[k] - g.tan[k] - g.tan[(k + 1) % n];
  if (g.len.some((_, k) => free(k) < 20)) return null;
  // Legs that don't meet: well apart, or crossing (once, steeply).
  let crossing: { i: number; j: number; at: UV; sin: number } | null = null;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const at = segCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]);
      if (at) {
        const sin = Math.abs(crossUV(g.dirs[i], g.dirs[j]));
        if (crossing || sin < Math.sin((50 * Math.PI) / 180)) return null;
        crossing = { i, j, at, sin };
      } else if (segDist(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]) < 2 * hw + 40) return null;
    }
  }
  // The finish line goes on a leg with room for the grid, not one that's crossed.
  const starts = g.len.map((_, k) => k).filter((k) => free(k) >= FINISH + 30 && (!crossing || (k !== crossing.i && k !== crossing.j)));
  if (!starts.length) return null;
  let pickAt = rand() * starts.reduce((t, k) => t + free(k), 0);
  const first = starts.find((k) => (pickAt -= free(k)) <= 0) ?? starts[starts.length - 1];
  pts = [...pts.slice(first), ...pts.slice(0, first)];
  const { len, dirs, turns, tan } = geometry(pts);
  let cross: Skeleton['cross'] = null;
  if (crossing) {
    const c0 = crossing;
    const [lower, upper] = [(c0.i - first + n) % n, (c0.j - first + n) % n].sort((a, b) => a - b);
    // Room on the upper leg for the whole flyover (at its lowest), and on the lower for the level stretch under it.
    const room = (k: number, before: number, after: number) => {
      const into = dotUV(sub(c0.at, pts[k]), dirs[k]);
      return into - tan[k] >= before + 5 && len[k] - tan[(k + 1) % n] - into >= after + 5;
    };
    const fly = flyoverPlan(clearOf(hw, c0.sin), flyTop);
    const under = underHalf(hw, c0.sin);
    if (!room(upper, fly.at, fly.len - fly.at) || !room(lower, under, under)) return null;
    cross = { lower, upper, at: c0.at, sin: c0.sin };
  }
  const calm = pts.map((_, k) => {
    if (cross && (k === cross.lower || k === cross.upper)) return true;
    for (let j = 0; j < n; j++) {
      if (j === k || j === (k + 1) % n || j === (k + n - 1) % n) continue;
      if (segDist(pts[k], pts[(k + 1) % n], pts[j], pts[(j + 1) % n]) < 2 * hw + 100) return true;
    }
    return false;
  });
  const out = turns.map((t, k) => {
    const next = turns[(k + 1) % n];
    return t >= 0 && next >= 0 ? 1 : t <= 0 && next <= 0 ? -1 : 0;
  });
  let along = 0;
  const phase = len.map((l) => {
    const q = Math.min(3, Math.floor((4 * along) / per));
    along += l;
    return q;
  });
  // A leg long enough for the coaster, off the crossing: past the first quarter if one is, else the first
  // (after the grid).
  const roomy = len.map((_, k) => k).filter((k) => !cross || (k !== cross.lower && k !== cross.upper));
  const free2 = (k: number) => len[k] - tan[k] - tan[(k + 1) % n] - (k === 0 ? FINISH : 0);
  const later = roomy.filter((k) => phase[k] >= 1 && free2(k) >= coasterRoom);
  const coaster = later.length ? later.reduce((a, k) => (free2(k) > free2(a) ? k : a)) : free2(0) >= coasterRoom ? 0 : -1;
  if (coasterRoom > 0 && !cross && coaster < 0) return null;
  const us = pts.map(([u]) => u);
  const vs = pts.map(([, v]) => v);
  const centre: UV = [(Math.min(...us) + Math.max(...us)) / 2, (Math.min(...vs) + Math.max(...vs)) / 2];
  return { shape, pts, dirs, len, turns, tan, calm, out, phase, coaster, cross, centre };
}

/**
 * The skeleton for these dials: its shape drawn from the seed alone (so it
 * stays the same whatever attempt the layout is on), its proportions from
 * the attempt's rolls. A shape that can't be built at this size gives way to
 * the next in a seeded order.
 */
function skeleton(p: GenParams, c: number, coasterRooms: number[], rand: () => number, per: number, R: number, hw: number): Skeleton | null {
  const sr = seededRandom(p.seed * 6151 + 17);
  const odds = shapeOdds(c);
  // A weighted shuffle: each shape's key an exponential draw over its odds, the smallest first.
  const order = GEN_SHAPES.filter((s) => odds[s] > 0)
    .map((s) => [s, -Math.log(1 - sr()) / odds[s]] as const)
    .sort((a, b) => a[1] - b[1])
    .map(([s]) => s);
  const between = (a: number, b: number) => a + rand() * (b - a);
  // The rectangle only when it's drawn first (rarely), or when nothing else fits.
  const tryOrder = [order[0], ...order.slice(1).filter((s) => s !== 'rectangle'), 'rectangle' as const];
  // The coaster's leg as long as it would like, else as long as it needs.
  for (const coasterRoom of coasterRooms) {
    for (const shape of tryOrder) {
      for (let tries = 0; tries < 10; tries++) {
        const sk = fitSkeleton(shape, outline(shape, between), per, R, hw, coasterRoom, rand);
        if (sk) return sk;
      }
    }
  }
  return null;
}

/** How far along a pose's heading its line meets the segment a-b, or null if it doesn't. */
function rayHit(p: Pose, a: Pose, b: Pose): number | null {
  const f: UV = [Math.sin(p.h), Math.cos(p.h)];
  const s: UV = [b.x - a.x, b.z - a.z];
  const den = crossUV(f, s);
  if (Math.abs(den) < 1e-9) return null;
  const ap: UV = [a.x - p.x, a.z - p.z];
  const t = crossUV(ap, s) / den;
  const u = crossUV(ap, f) / den;
  return t > 0 && u >= 0 && u <= 1 ? t : null;
}

/**
 * How far along its heading from `p` the last corner must start, so that a
 * single bend of radius R lands it on the finish line's line (`home`'s): the
 * last leg is laid to there, so the loop closes on a plain corner whatever
 * the legs before have drifted sideways. Null if the two lines are parallel.
 */
function closingAlong(p: Pose, home: Pose, R: number): number | null {
  const th = wrapPi(home.h - p.h);
  const f: UV = [Math.sin(p.h), Math.cos(p.h)];
  const l: UV = [Math.cos(p.h), -Math.sin(p.h)];
  const side = th < 0 ? -1 : 1;
  const ahead = R * Math.sin(Math.abs(th));
  const across = side * R * (1 - Math.cos(Math.abs(th)));
  const n0: UV = [Math.cos(home.h), -Math.sin(home.h)];
  const dn = dotUV(f, n0);
  if (Math.abs(dn) < 1e-6) return null;
  const off = (p.x - home.x) * n0[0] + (p.z - home.z) * n0[1] + (ahead * f[0] + across * l[0]) * n0[0] + (ahead * f[1] + across * l[1]) * n0[1];
  return -off / dn;
}

/** From the skeleton's (u, v) to the map: u along x, v to the left (-z), centred. */
const toMap = (sk: Skeleton, [u, v]: UV) => ({ x: u - sk.centre[0], z: -(v - sk.centre[1]) });
const mapHeading = ([du, dv]: UV) => Math.atan2(du, -dv);

function attemptTrack(p: GenParams, attempt: number, plain = false): TrackDef | null {
  const rand = seededRandom(p.seed * 7919 + attempt * 104729 + 1);
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  const between = (a: number, b: number) => a + rand() * (b - a);
  const c = plain ? 1 : clamp(Math.round(p.complexity), 1, GEN_COMPLEXITY_MAX);
  const pal = PALETTES[p.theme];
  const abyss = p.theme === 'dream' || p.theme === 'void' || p.theme === 'skycastle';
  const halfWidth = 12.6 - c * 0.8;
  const R = 52 - c * 5;
  const wall = abyss || c <= 3 ? 1.2 : 0;
  // Modules wind more at higher complexity, so the skeleton shrinks to keep the lap near its length.
  const per = LENGTH_M[p.length] / (1.02 + 0.033 * c);
  // The skeleton: the first generator's rectangle (layout 1, kept as it was), or a shape drawn from the seed.
  const legacy = (p.layout ?? 1) <= 1;
  // From twists 3 a leg kept for the coaster: longer over an abyss, where it climbs higher.
  const coasterRooms = c < 3 || plain ? [0] : abyss ? [COASTER_ROOM_ABYSS, COASTER_ROOM] : [COASTER_ROOM];
  const sk = legacy ? null : skeleton(p, c, coasterRooms, rand, per, R, halfWidth * ROAD_WIDTH_SCALE);
  if (!legacy && !sk) return null;
  generatorStats.shape = sk?.shape ?? 'rectangle';
  const aspect = legacy ? 1 + rand() * 0.6 : 1;
  const H = per / (2 * (1 + aspect));
  const W = H * aspect;
  const start: Pose = sk
    ? { ...toMap(sk, [sk.pts[0][0] + (sk.tan[0] + FINISH) * sk.dirs[0][0], sk.pts[0][1] + (sk.tan[0] + FINISH) * sk.dirs[0][1]]), h: mapHeading(sk.dirs[0]) }
    : { x: -W / 2 + R + FINISH, z: H / 2, h: Math.PI / 2 };
  const place = () => pick(p.places?.length ? p.places : pal.places);
  const surface = () => (pal.alt && rand() < (pal.alt === 'ice' ? 0.6 : 0.3) ? pal.alt : pal.surface);

  const b = new TrackBuilder(start, `${place()} Straight`, { halfWidth, wallHeight: abyss ? 1.2 : 0, surface: pal.surface });
  const marks: string[] = [];
  const hazards: HazardDef[] = [];
  const itemBoxes: TrackDef['itemBoxes'] = [];
  const boostPads: TrackDef['boostPads'] = [];
  const landmarks: Landmark[] = [{ kind: pal.start, ribbon: -1, s: 0 }];
  let jumps = 0;
  let bridges = 0;
  let lateral = 0;
  let kickers = 0;
  let coasters = 0;
  /** Stretches whose heights are fixed, straights a hump could go on, walled stretches a cut could sink, and module ends (for keeping cuts off pits). */
  const fixed: [number, number][] = [];
  const straights: [number, number][] = [];
  const walled: [number, number][] = [];
  const shapes: Shape[] = [];
  const ends: { s: number; pose: Pose }[] = [];
  /** Notes a straight, joined onto the one before when they run on end to end. */
  const noteStraight = (s0: number, s1: number) => {
    const last = straights[straights.length - 1];
    if (last && Math.abs(last[1] - s0) < 0.01) last[1] = s1;
    else straights.push([s0, s1]);
  };
  /** The last module was a kicker run: no gap or tight turn straight after its landing. */
  let landing = false;
  /** The last module was walled: no rail-less bridge straight out of it, where a fast kart still running wide would go in. */
  let walledLast = false;
  // (Set as the legs are filled: typed wide, so the checks after them don't take it for still null.)
  let bulge = null as { from: { s: number; pose: Pose }; to: { s: number; pose: Pose } } | null;
  const risky: RiskySpot[] = [];
  const edge = () => (rand() < 0.5 ? 1 : -1);
  /** The leg being filled is near another (no sideways shifts), and which way out of the shape a swing goes (0: none). */
  let calm = false;
  let out = 1;
  let coasterHere = false;

  // Modules: each leaves the road heading the way it came in.
  const straight = (len: number): Module => ({ name: pick(['Straight', 'Run', 'Dash']), open: true, props: {}, build: (bb) => bb.straight(len) });
  const sBend = (): Module => {
    const a = between(25, 50);
    const r = between(40, 70) - c * 4;
    const dir = lateral > 0 ? -1 : 1;
    return {
      name: 'S-Bends',
      open: true,
      props: {},
      build: (bb) => bb.arc(r, dir * a).arc(r, -dir * a),
    };
  };
  const esses = (tight: boolean): Module => {
    const a = tight ? between(50, 80) : between(35, 60);
    const r = tight ? between(19, 24) : between(26, 40) - c;
    const dir = rand() < 0.5 ? 1 : -1;
    return {
      name: tight ? 'Chicane' : 'Esses',
      open: false,
      walled: true,
      props: { wallHeight: tight ? pal.tallWalls : wall, halfWidth: halfWidth - (tight ? 1 : 0) },
      build: (bb) => bb.arc(r, dir * a).arc(r, -2 * dir * a).arc(r, dir * a),
    };
  };
  const hairpins = (): Module => {
    const r = between(20, 25);
    const s = between(12, 24);
    // A switchback: back the way it came, then on again, a few lanes over (toward the skeleton's line).
    const dir = lateral > 0 ? -1 : 1;
    return {
      name: 'Hairpins',
      open: false,
      walled: true,
      props: { wallHeight: 1.5, halfWidth: halfWidth - 1 },
      build: (bb) => bb.straight(10).arc(r, dir * 165).straight(s).arc(r, -dir * 165).straight(10),
    };
  };
  const jump = (): Module => ({
    name: pick(['Leap', 'Jump']),
    open: false,
    fixed: true,
    props: { wallHeight: 1.2, surface: pal.deck },
    build: (bb) => {
      bb.straight(30).elevate(0).rise(20, 3);
      bb.gap(13 + c, 34, pal.liquid);
      bb.elevate(0).straight(25);
    },
  });
  const bridge = (): Module => ({
    name: pick(['Bridge', 'Causeway', 'Crossing']),
    open: true,
    fixed: true,
    props: { surface: pal.deck, halfWidth: halfWidth - 2, wallHeight: 0 },
    build: (bb) => {
      bb.straight(8).elevate(0).rise(12, 1.5);
      bb.bridge(between(40, 70), 30, pal.liquid);
      bb.elevate(1.5).rise(12, 0);
    },
  });
  // A trick kicker, or a pair a second or so apart so tricks chain, with a clear straight to land on.
  const kickerRun = (pair: boolean, room: number): Module => {
    // Clear of the boxes at the start of the side.
    const row = itemBoxes.length ? itemBoxes[itemBoxes.length - 1].s + 10 - b.s : 0;
    const lead = Math.max(row, Math.min(between(KICKER_LEAD, KICKER_LEAD + 12), room - 7 - KICKER_LANDING));
    const apart = between(...KICKER_PAIR);
    return {
      name: pair ? 'Kickers' : 'Kicker',
      open: false,
      fixed: true,
      props: { wallHeight: abyss ? 1.2 : 0, surface: pal.surface },
      kickers: pair ? [lead + 7, lead + 14 + apart] : [lead + 7],
      build: (bb) => {
        bb.straight(lead).kicker();
        if (pair) bb.straight(apart).kicker();
        bb.straight(KICKER_LANDING);
      },
    };
  };
  // Where a figure of eight crosses itself: the road underneath, level and straight, nothing on it.
  const underpass = (len: number): Module => ({ name: 'Underpass', open: false, fixed: true, props: {}, build: (bb) => bb.straight(len) });
  // And the road over it (see flyoverPlan): from twists 3 the track's coaster, crossing it.
  const flyover = (plan: FlyoverPlan, coasterToo: boolean): Module => {
    const deck = `${place()} ${pick(coasterToo ? COASTER_DECKS : ['Overpass', 'Flyover', 'Viaduct'])}`;
    const down = `${place()} ${pick(coasterToo ? ['Drop', 'Plunge', 'Dipper'] : ['Ramp', 'Descent', 'Slope'])}`;
    return {
      name: coasterToo ? 'Climb' : 'Flyover',
      open: false,
      fixed: true,
      props: { wallHeight: 1.2, surface: pal.surface },
      shapes: plan.shapes,
      build: (bb) =>
        lay(bb, [[plan.len, 0]], [
          [plan.deckFrom, deck, { halfWidth, wallHeight: 1.2, surface: pal.deck, bridge: true }],
          [plan.deckTo, down, { halfWidth, wallHeight: 1.2, surface: pal.surface }],
        ]),
    };
  };
  // A wide swing out of the rectangle (or the shape) and back onto the side's line, open-edged so a shortcut can cut straight across.
  const sweep = (): Module => {
    const o = out;
    const r = between(42, 52);
    const a = between(60, 68);
    return {
      name: pick(['Swing', 'Detour', 'Long Way Round']),
      open: false,
      props: { wallHeight: 0, surface: pal.surface },
      bulge: true,
      fixed: true,
      build: (bb) => bb.straight(6).arc(r, -o * a).arc(r, 2 * o * a).arc(r, -o * a).straight(6),
    };
  };

  /**
   * A roller coaster: up through an S onto a deck on pillars, a lead up to a
   * crest that drops away fast enough to leave the road, and a plunge back to
   * earth on the straight. Over an abyss it climbs higher.
   */
  const coaster = (room: number): Module | null => {
    const want = abyss ? between(20, 26) : between(8 + c, 12 + c);
    const top = Math.min(want, (room - 76) / 9.45);
    if (top < COASTER_MIN) return null;
    const climb = top * 5;
    const drop = (2 * (top + COASTER_LIFT)) / COASTER_DROP_SLOPE;
    // The S it climbs through: no tighter than this.
    const a = Math.min(climb / (4 * between(40, 60)), (32 * Math.PI) / 180);
    const r = climb / (4 * a);
    const dir = rand() < 0.5 ? 1 : -1;
    const deck = `${place()} ${pick(COASTER_DECKS)}`;
    const plunge = `${place()} ${pick(['Drop', 'Plunge', 'Dipper'])}`;
    const crest = COASTER_IN + climb + COASTER_LEAD;
    const deckFrom = COASTER_IN + (climb * Math.acos(1 - (2 * DECK_LINE) / top)) / Math.PI;
    const deckTo = crest + drop * (1 - Math.sqrt(DECK_LINE / (top + COASTER_LIFT)));
    const peak = top + COASTER_LIFT;
    return {
      name: 'Climb',
      open: false,
      fixed: true,
      props: { wallHeight: 1.2, surface: pal.surface },
      shapes: [
        [COASTER_IN, COASTER_IN + climb, (x) => (top * (1 - Math.cos((Math.PI * (x - COASTER_IN)) / climb))) / 2, 4],
        [COASTER_IN + climb, crest, (x) => top + (COASTER_LIFT * (x - COASTER_IN - climb)) / COASTER_LEAD, 4],
        [crest, crest + drop, (x) => peak * (1 - (x - crest) / drop) ** 2, 2],
      ],
      build: (bb) => {
        const pieces: [number, number][] = [
          [COASTER_IN, 0],
          [r * a, dir / r],
          [2 * r * a, -dir / r],
          [r * a, dir / r],
          [COASTER_LEAD + drop + COASTER_OUT, 0],
        ];
        lay(bb, pieces, [
          [deckFrom, deck, { halfWidth, wallHeight: 1.2, surface: pal.deck, bridge: true }],
          [deckTo, plunge, { halfWidth, wallHeight: 1.2, surface: pal.surface }],
        ]);
      },
    };
  };

  /** How far along its heading a module would take the road. */
  const measure = (m: Module): number => {
    const scratch = new TrackBuilder(b.pose, 'scratch', { halfWidth });
    m.build(scratch, 0);
    return (scratch.pose.x - b.pose.x) * Math.sin(b.pose.h) + (scratch.pose.z - b.pose.z) * Math.cos(b.pose.h);
  };

  const chooseModule = (room: number, side: number): Module => {
    const options: [number, () => Module][] = [
      [3 - c * 0.4, () => straight(Math.min(room, between(15, 60 - c * 7)))],
      ...(calm ? [] : [[1.5, sBend] as [number, () => Module]]),
      [c * 0.5, () => esses(false)],
    ];
    if (c >= 2 && !landing) options.push([c * 0.4, () => esses(true)]);
    if (c >= 3 && room > 90 && !landing && !calm) options.push([(c - 2) * 0.6, hairpins]);
    if (c >= 2 && jumps < 2 && room > 110 && !landing) options.push([0.5 + c * 0.15, jump]);
    if (pal.liquid && bridges < 1 && room > 110 && !walledLast) options.push([0.6, bridge]);
    // Kickers: more at higher twists, and every track gets one once it's past the first side;
    // none where the grid and the first boxes are.
    const single = KICKER_LEAD + 7 + KICKER_LANDING;
    // (A shape has more legs to put them on: at most `c` there, so one at the gentlest.)
    const most = sk ? c : 1 + c;
    if (kickers < most && room > single && b.s > FINISH) {
      const pair = kickers + 2 <= most && room > single + KICKER_PAIR[1] + 7 && rand() < 0.15 + c * 0.12;
      const make = () => kickerRun(pair, pair ? room - KICKER_PAIR[1] - 7 : room);
      // None yet by the second half of the lap: this is it.
      if (kickers === 0 && side >= 2 && !plain) return make();
      // (A shape's legs are shorter than the rectangle's sides: likelier per leg, to keep up the count at high twists.)
      options.push([kickers === 0 && side > 0 ? 12 : 0.2 + c * 0.25 + (sk ? 0.6 * (c - 1) : 0), make]);
    }
    // A coaster from twists 3: likely once past the first side, and by the third side this is it.
    if (c >= 3 && !plain && coasters === 0 && side >= 1) {
      const m = coaster(room);
      if (m && side >= 2) return m;
      if (m) options.push([4, () => m]);
    }
    // Not over an abyss: the open bends where it meets the shortcut would be a long way down.
    if (c >= 3 && !abyss && !bulge && room > 160 && !calm && out !== 0) options.push([1.5 + (c - 3) * 0.5, sweep]);
    if (plain) options.splice(1);
    const total = options.reduce((t, [w]) => t + Math.max(0, w), 0);
    let r = rand() * total;
    for (const [w, make] of options) {
      r -= Math.max(0, w);
      if (r <= 0) return make();
    }
    return options[0][1]();
  };

  // The skeleton's legs, each filled with modules, corners between them: the rectangle's four sides, or a shape's.
  const sides = [W - 2 * R - FINISH, H - 2 * R, W - 2 * R, H - 2 * R];
  const legs = sk ? sk.pts.length : 4;
  const hwMap = halfWidth * ROAD_WIDTH_SCALE;
  /** The figure of eight's level stretch, as laid, for the flyover to cross. */
  let under: { a: Pose; b: Pose } | null = null;
  for (let side = 0; side < legs; side++) {
    const from = { ...b.pose };
    const fx = Math.sin(from.h);
    const fz = Math.cos(from.h);
    const along = () => (b.pose.x - from.x) * fx + (b.pose.z - from.z) * fz;
    const last = side === legs - 1;
    const phase = sk ? sk.phase[side] : side;
    lateral = 0;
    calm = !!sk?.calm[side];
    out = sk ? sk.out[side] : 1;
    coasterHere = !!sk && sk.coaster === side;
    if (side > 0) {
      const mark = `side${side}`;
      b.mark(mark);
      marks.push(mark);
      // A row of boxes on each side of the rectangle; on a shape, at the first leg of each quarter of the lap.
      if (!sk || sk.phase[side] > sk.phase[side - 1]) itemBoxes.push({ s: b.s + 15, count: halfWidth > 10 ? 8 : 3 });
    }
    // The last two sides aim for where the final corner must start, so the loop closes on a plain corner;
    // the others run their length.
    const home = offsetPose(start, -FINISH);
    // The last corner turns from the last side's heading onto the finish line: it starts R back and R across.
    const lastH = home.h - Math.PI / 2;
    const corner = { x: home.x - R * Math.sin(home.h) - R * Math.sin(lastH), z: home.z - R * Math.cos(home.h) - R * Math.cos(lastH) };
    const toCorner = () => (corner.x - b.pose.x) * fx + (corner.z - b.pose.z) * fz;
    // A shape's legs each run to where the bend at their far corner starts.
    const next = (side + 1) % legs;
    const end = sk ? toMap(sk, [sk.pts[next][0] - sk.tan[next] * sk.dirs[side][0], sk.pts[next][1] - sk.tan[next] * sk.dirs[side][1]]) : corner;
    const toEnd = () => (end.x - b.pose.x) * fx + (end.z - b.pose.z) * fz;
    // A shape's last leg runs to where one bend puts it on the finish line's line.
    const closeAt = sk && last ? closingAlong(from, home, R) : null;
    const goal = sk ? (closeAt !== null ? () => closeAt - along() : toEnd) : () => (side === 3 ? toCorner() : side === 2 ? toCorner() - R : sides[side] - along());
    const span = sk ? toEnd() : sides[side];
    // Where a figure of eight crosses this leg (metres along it), and the stretch either side that's
    // the level road under the flyover, or the flyover itself.
    let crossAt = -1;
    /** How far before the crossing the stretch starts, and the module that crosses (or passes under). */
    let crossIn = 0;
    let crossing: Module | null = null;
    if (sk?.cross && side === sk.cross.lower) {
      const X = toMap(sk, sk.cross.at);
      crossAt = (X.x - from.x) * fx + (X.z - from.z) * fz;
      crossIn = underHalf(hwMap, sk.cross.sin);
      crossing = underpass(2 * crossIn);
    } else if (sk?.cross && side === sk.cross.upper) {
      // Where this leg's line meets the level stretch as it was laid (nothing on these legs shifts the road sideways).
      const hit = under ? rayHit(from, under.a, under.b) : null;
      const clear = clearOf(hwMap, sk.cross.sin);
      const fits = (plan: FlyoverPlan) => hit !== null && hit - plan.at >= 0 && hit - plan.at + plan.len <= toEnd();
      // From twists 3 the flyover is the coaster: as high as it wants to go, or as fits.
      let plan: FlyoverPlan | null = null;
      const coasterToo = c >= 3 && !plain && coasters === 0;
      if (coasterToo) {
        for (let top = abyss ? between(20, 26) : between(8 + c, 12 + c); top >= COASTER_MIN && !plan; top -= 0.5) {
          const q = flyoverPlan(clear, top);
          if (fits(q)) plan = q;
        }
      } else if (fits(flyoverPlan(clear, null))) plan = flyoverPlan(clear, null);
      if (hit === null || !plan) {
        generatorStats.rejects.flyover++;
        return null;
      }
      crossAt = hit;
      crossIn = plan.at;
      crossing = flyover(plan, coasterToo);
    }

    const put = (m: Module) => {
      if (m.name === 'Climb') coasters++;
      const s0 = b.s;
      b.section(`${place()} ${m.name}`, { halfWidth, wallHeight: abyss ? 1.2 : 0, surface: surface(), ...m.props });
      const before = { ...b.pose };
      m.build(b, side);
      // Sideways drift, measured: positive is to the left of the side's heading.
      lateral += (b.pose.x - before.x) * Math.cos(from.h) - (b.pose.z - before.z) * Math.sin(from.h);
      const s1 = b.s;
      const hw = m.props.halfWidth ?? halfWidth;
      ends.push({ s: s0, pose: before }, { s: s1, pose: { ...b.pose } });
      if (m.fixed) {
        const margin = m.bulge ? JUNCTION_FLAT : FLAT_MARGIN;
        fixed.push([s0 - margin, s1 + margin]);
      }
      // A shape keeps its chicanes level (no hill, no cut's ramp through them), and over an abyss all its tight
      // walled bends: a crest or a dip in one can throw a fast kart over the wall.
      const level = !!sk && (m.name === 'Chicane' || (abyss && !!m.walled));
      if (m.walled && !level) walled.push([s0, s1]);
      if (level) fixed.push([s0, s1]);
      if (m.name === 'Straight' || m.name === 'Run' || m.name === 'Dash') noteStraight(s0, s1);
      for (const [from, to, f, step] of m.shapes ?? []) shapes.push([s0 + from, s0 + to, (x) => f(x - s0), step]);
      if (m.open && s1 - s0 > 35 && addHazard(s0, s1)) risky.push({ rank: 2, s: (s0 + s1) / 2, count: 1, lateral: edge() * (hw - 2) });
      landing = !!m.kickers;
      walledLast = !!m.walled;
      for (const at of m.kickers ?? []) {
        kickers++;
        // Up on the lip, out by the edge.
        risky.push({ rank: 1, s: s0 + at - 1.5, count: 1, lateral: edge() * (hw - 2) });
      }
      if (m.bulge && !bulge) bulge = { from: { s: s0, pose: before }, to: { s: s1, pose: { ...b.pose } } };
      if (m.name === 'Straight' && s1 - s0 > 40 && boostPads.length < 3 && rand() < 0.5) boostPads.push({ s: s0 + 10, length: 8, lateral: 0, halfWidth: 2.5 });
      if (side === 0 && marks.length === 0 && along() > span / 2) {
        b.mark('mid');
        marks.push('mid');
      }
      if (m.name === 'Leap' || m.name === 'Jump') {
        jumps++;
        // Just past the landing, by the wall.
        risky.push({ rank: 2, s: s1 - 19, count: 2, span: 3, lateral: edge() * (hw - 3) });
      }
      if (m.name === 'Bridge' || m.name === 'Causeway' || m.name === 'Crossing') {
        bridges++;
        // Out on the rail-less edge, over the drop.
        risky.push({ rank: 3, s: (s0 + s1) / 2, count: 1, lateral: edge() * (hw - 2) });
      }
      if (pal.landmarks.length && landmarks.length < 3 && m.open && rand() < 0.35) landmarks.push({ kind: pick(pal.landmarks), ribbon: -1, s: s0 + 4 });
    };

    let guard = 0;
    while (goal() > 25 && guard++ < 20) {
      let room = goal();
      // A shape's coaster goes first thing on the leg kept for it, as high as it likes; on the first leg
      // (the grid's), at its end: modules up to there, then the coaster in what's left.
      if (coasterHere && c >= 3 && !plain && coasters === 0) {
        const spare = side === 0 ? room - COASTER_ROOM : 0;
        if (spare <= 25) {
          const m = coaster(room);
          coasterHere = false;
          if (m) {
            put(m);
            continue;
          }
        } else room = spare;
      }
      if (crossAt >= 0) {
        const toCross = crossAt - crossIn - along();
        if (toCross <= 25) {
          // Straight on to the crossing, then across it: under the flyover, or over the road below.
          if (toCross > 0.5) {
            noteStraight(b.s, b.s + toCross);
            b.straight(toCross);
          }
          const a = { ...b.pose };
          put(crossing!);
          if (crossing!.name === 'Underpass') under = { a, b: { ...b.pose } };
          crossAt = -1;
          continue;
        }
        room = Math.min(room, toCross);
      }
      // Try a few modules for one that fits what's left of the side; otherwise run straight to the end.
      let m: Module | null = null;
      for (let tries = 0; tries < 6 && !m; tries++) {
        const cand = chooseModule(room, phase);
        if (measure(cand) <= room + 4) m = cand;
      }
      m ??= straight(room);
      // The last side keeps to its line: nothing that shifts the road sideways.
      if (last && (m.name === 'S-Bends' || m.name === 'Hairpins')) m = straight(Math.min(room, 40));
      put(m);
    }
    // The crossing never came: re-rolled.
    if (crossAt >= 0) {
      generatorStats.rejects.flyover++;
      return null;
    }
    // Whatever's left of the side, straight.
    if (goal() > 0.5) {
      noteStraight(b.s, b.s + goal());
      b.straight(goal());
    }
    if (!last) {
      const turn = sk ? (sk.turns[next] * 180) / Math.PI : 90;
      b.section(`${place()} ${pick(['Bend', 'Turn', 'Corner', 'Sweeper'])}`, { halfWidth, wallHeight: wall, surface: surface() });
      // Tight on the apex: the fallback spot for the double boxes.
      risky.push(
        sk
          ? { rank: 0, s: b.s + (R * Math.abs(sk.turns[next])) / 2, count: 1, lateral: -Math.sign(turn) * (halfWidth - 1.5) }
          : { rank: 0, s: b.s + (R * Math.PI) / 4, count: 1, lateral: -(halfWidth - 1.5) },
      );
      b.arc(R, turn);
    }
  }
  // From twists 3 every track has its coaster: one with no room for it is re-rolled.
  if (c >= 3 && !plain && coasters === 0) {
    generatorStats.rejects.coaster++;
    return null;
  }
  // And every shaped track a kicker (the rectangle's sides always had room for one).
  if (sk && !plain && kickers === 0) {
    generatorStats.rejects.kicker++;
    return null;
  }
  if (!marks.includes('mid')) {
    // A short first side: the checkpoint goes on the first corner's exit instead.
    marks.unshift('side1');
  }
  // Home: the last corner, closed exactly onto the line. A layout that needs a loop to get there is re-rolled.
  const target = offsetPose(start, -FINISH);
  let close = dubins(b.pose, target, R);
  // A shape's last leg lands right on the corner, where rounding can read a turn of nothing as a whole circle.
  if (sk) close = close.map(([k, len]) => [k, k !== 'S' && len > 2 * Math.PI * R - 1e-3 ? len - 2 * Math.PI * R : len]);
  const turned = close.filter(([k]) => k !== 'S').reduce((t, [, len]) => t + len / R, 0);
  if (!plain && turned > (sk ? Math.abs(sk.turns[0]) + 0.65 * Math.PI : Math.PI * 1.15)) {
    generatorStats.rejects.closure++;
    return null;
  }
  b.section(`${place()} ${pick(['Bend', 'Hook', 'Sweeper'])}`, { halfWidth, wallHeight: wall, surface: pal.surface });
  b.mark('home');
  marks.push('home');
  if (sk) {
    for (const [k, len] of close) {
      if (k === 'S') b.straight(len);
      else if (len > 1e-6) b.arc(R, ((k === 'L' ? 1 : -1) * len * 180) / (Math.PI * R));
    }
  } else b.turnTo(target, R);
  b.section('Finish Straight', { halfWidth, wallHeight: abyss ? 1.2 : 0, surface: pal.surface });
  b.straight(FINISH);
  itemBoxes.unshift({ s: 30, count: halfWidth > 10 ? 4 : 3 });

  // Heights, laid over the finished layout from their own rolls, so they never change its shape.
  const lift = elevation(seededRandom(p.seed * 4241 + attempt * 613 + 9));
  const main = b.finish(true);
  // Up on an embankment, low barriers: a kart off its edge would be stuck below the road.
  for (const sec of main.sections) {
    let high = 0;
    for (let s = sec.from; s <= sec.to; s += 2) high = Math.max(high, lift(s));
    if (high > RAISED) sec.wallHeight = Math.max(sec.wallHeight ?? 0, 1.2);
  }
  const branches: BranchDef[] = [];
  const pits = b.pits.slice();
  if (bulge) {
    const cut = shortcut(bulge.from, bulge.to);
    branches.push(cut.branch);
    pits.push(...cut.pits);
    risky.push(cut.spot);
  }
  // One row of double boxes, on the riskiest line there is.
  const best = risky.reduce((a, r) => (r.rank > a.rank ? r : a));
  const { rank: _rank, ...row } = best;
  itemBoxes.push({ ...row, double: true });
  let extent = 0;
  for (const ribbon of [main, ...branches]) for (const [x, z] of ribbon.points) extent = Math.max(extent, Math.abs(x), Math.abs(z));
  const uniqueMarks = [...new Set(marks)];
  const def: TrackDef = {
    id: trackId(p),
    name: p.name ?? trackName(p),
    main,
    branches,
    pits,
    boostPads,
    checkpoints: uniqueMarks.map((m) => b.marks[m].s / main.length).sort((a, b2) => a - b2),
    laps: 3,
    bounds: Math.max(420, Math.ceil(extent + 60)),
    landmarks,
    itemBoxes,
    hazards,
    theme: p.theme,
    abyss: abyss || undefined,
    music: pal.music,
  };
  // A launcher on the lip of the jump, or on a straight when there's none.
  def.launchers = launchersFor(def);
  return def;

  /**
   * A straight chord across a sweep, narrow and rail-less, with a jump over a
   * pit in the middle: a slow kart at 100cc needs a mini-turbo to clear it,
   * and at 50cc it takes a boost.
   */
  function shortcut(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
    const name = pick(SHORTCUT_NAMES);
    const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
    const hw = Math.max(6, halfWidth - 3);
    const gapLen = 17 + c;
    const sb = new TrackBuilder(from.pose, `${name} Cut`, { halfWidth: hw, wallHeight: 0, surface: pal.surface });
    sb.straight((chord - gapLen) / 2 - SHORTCUT_RAMP - 6);
    sb.section(`${name} Leap`, { halfWidth: hw, wallHeight: 0, surface: pal.deck });
    sb.straight(6).elevate(0).rise(SHORTCUT_RAMP, SHORTCUT_LIP);
    sb.gap(gapLen, hw + 6, pal.liquid);
    sb.elevate(0);
    const landed = sb.s;
    sb.section(`${name} Cut`, { halfWidth: hw, wallHeight: 0, surface: pal.surface });
    sb.straight(chord - sb.s);
    const branch: BranchDef = { name: `${name} Shortcut`, mainFrom: from.s, mainTo: to.s, ...sb.finish(false) };
    const spot: RiskySpot = { rank: 4, ribbon: 0, s: landed + 8, count: rand() < 0.5 ? 1 : 2, span: 4 };
    return { branch, pits: sb.pits, spot };
  }

  /**
   * Shapes the road's heights once the layout is down: the modules' own
   * (coasters), then now and then a walled stretch sunk into a cut, sharp
   * humps on straights for airtime, and rolling hills everywhere else that's
   * free, all scaled by the twists. Kickers, jumps, bridges, the shortcut's
   * junctions and the grid stay level. Returns the height it gave each spot.
   */
  function elevation(er: () => number): (s: number) => number {
    const L = b.s;
    const span = (lo: number, hi: number) => lo + er() * (hi - lo);
    const shuffle = <T>(list: T[]) => list.map((v) => [er(), v] as const).sort((x, y) => x[0] - y[0]).map(([, v]) => v);
    const blocked: [number, number][] = [[-Infinity, 45], [L - FINISH - FLAT_MARGIN, Infinity], ...fixed, ...shapes.map(([a, z]) => [a, z] as [number, number])];
    const rows = itemBoxes.map((r): [number, number] => [r.s - 8, r.s + 8]);
    const free = (a: number, z: number, also: [number, number][] = []) => ![...blocked, ...also].some(([x, y]) => a < y && z > x);
    const nearPit = (a: number, z: number) =>
      ends.some(({ s, pose }) => s >= a && s <= z && b.pits.some((pit) => inPit({ ...pit, halfLength: pit.halfLength + 25, halfWidth: pit.halfWidth + 25 }, pose.x, pose.z)));

    // Cuts: a walled stretch sunk into the ground, ramps in and out on the road either side. Not over an abyss.
    let cuts = abyss || plain || er() > 0.15 + 0.12 * c ? 0 : c >= 4 && er() < 0.4 ? 2 : 1;
    for (const [s0, s1] of shuffle(walled)) {
      if (cuts <= 0) break;
      if (!free(s0, s1)) continue;
      const depth = span(5, 7) + c * 0.6;
      const ramp = Math.max(50, 7 * depth);
      let a = s0;
      let z = s1;
      while (a > s0 - ramp && free(a - 2, a)) a -= 2;
      while (z < s1 + ramp && free(z, z + 2)) z += 2;
      if (z - a < 2 * ramp + 20 || nearPit(a, z)) continue;
      const ease = (u: number) => (1 - Math.cos(Math.PI * clamp(u, 0, 1))) / 2;
      shapes.push([a, z, (x) => -depth * Math.min(ease((x - a) / ramp), ease((z - x) / ramp)), 4]);
      blocked.push([a, z]);
      cuts--;
    }

    // Humps: a sharp top a fast kart leaves the road from, with a straight to land on.
    let humps = plain ? 0 : c >= 4 ? 2 : c >= 2 ? 1 : 0;
    const hump = (HUMP_SLOPE * HUMP_RAMP) / 2;
    for (const [s0, s1] of shuffle(straights)) {
      if (humps <= 0) break;
      if (s1 - s0 < HUMP_ROOM + 6) continue;
      const a = s0 + 3 + er() * (s1 - s0 - HUMP_ROOM - 6);
      if (!free(a, a + HUMP_ROOM, rows)) continue;
      const top = a + HUMP_RAMP;
      shapes.push([a, top, (x) => hump * ((x - a) / HUMP_RAMP) ** 2, 2]);
      shapes.push([top, top + HUMP_RAMP, (x) => hump * (1 - (x - top) / HUMP_RAMP) ** 2, 2]);
      blocked.push([a, a + HUMP_ROOM]);
      humps--;
    }

    // Rolling hills in what's left, bending no sharper than HILL_BEND; over an abyss some dip instead.
    const taken = blocked.map(([x, y]) => [Math.max(0, x), Math.min(L, y)] as [number, number]).filter(([x, y]) => y > x).sort((x, y) => x[0] - y[0]);
    let at = 0;
    for (const [x, y] of [...taken, [L, L] as [number, number]]) {
      const len = x - at;
      if (len >= 40) {
        const n = Math.max(1, Math.round(len / span(80, 140)));
        const w = len / n;
        const cap = (HILL_BEND * w * w) / (2 * Math.PI ** 2);
        for (let k = 0; k < n; k++) {
          let A = Math.min(cap, (abyss ? 1.4 : 1) * (1.5 + 1.1 * c) * span(0.4, 1));
          if (er() < 0.2) continue;
          if (abyss && er() < 0.4) A = -A;
          const h0 = at + k * w;
          shapes.push([h0, h0 + w, (s) => (A * (1 - Math.cos((2 * Math.PI * (s - h0)) / w))) / 2, 4]);
        }
      }
      at = Math.max(at, y);
    }

    shapes.sort((x, y) => x[0] - y[0]);
    for (const [from, to, f, step] of shapes) b.profile(from, to, (u) => f(from + (to - from) * u), step);
    return (s) => {
      for (const [from, to, f] of shapes) if (s >= from && s <= to) return f(s);
      return 0;
    };
  }

  function addHazard(s0: number, s1: number): boolean {
    if (!pal.hazards.length || hazards.length >= 1 + c || rand() > 0.2 + c * 0.12) return false;
    const kind = pick(pal.hazards);
    const from = s0 + 8;
    const to = s1 - 8;
    const at = (n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 0.5)) / n);
    const count = (to - from) > 80 ? 3 : 2;
    switch (kind) {
      case 'snakes':
      case 'goblins':
        hazards.push({ kind, from, to, count, period: 3.5 });
        break;
      case 'rollers':
      case 'crystals':
      case 'vesicles':
        hazards.push({ kind, from, to, count: count - 1, period: 7 });
        break;
      case 'fish':
        hazards.push({ kind, from, to, count, period: 3.4 });
        break;
      case 'iceBlocks':
      case 'stones':
        hazards.push({ kind, from, to, count: count - 1, period: 5 });
        break;
      case 'tumbleweeds':
        hazards.push({ kind, from, to, count });
        break;
      case 'dustDevils':
      case 'butterflies':
      case 'tornadoes':
      case 'blackHoles':
      case 'wisps':
        hazards.push({ kind, from, to, count: 1 });
        break;
      case 'boulders':
        hazards.push({ kind, at: at(count - 1), period: 5 });
        break;
      case 'lavaBombs':
      case 'oilBombs':
      case 'meteors':
      case 'hail':
      case 'gliders':
        hazards.push({ kind, at: at(count - 1), period: 6 });
        break;
      case 'flameJets':
      case 'dragonFire':
      case 'waves':
        hazards.push({ kind, at: at(count), period: 3.2 });
        break;
      case 'lasers':
        hazards.push({ kind, at: at(count), period: 2.6 });
        break;
      case 'lightning':
      case 'geysers':
        hazards.push({ kind, at: at(count), period: 4.5 });
        break;
      case 'jaws':
      case 'crushers':
        hazards.push({ kind, at: at(count - 1), period: 4 });
        break;
      case 'gusts':
      case 'prisms':
      case 'robots':
      case 'wahs':
        hazards.push({ kind, at: at(count - 1), period: 4 });
        break;
      case 'gammaRays':
      case 'vultures':
      case 'smog':
      case 'airlocks':
      case 'rats':
        hazards.push({ kind, at: at(count - 1), period: 4.5 });
        break;
      case 'flares':
      case 'eyes':
      case 'sheets':
        hazards.push({ kind, at: at(count - 1), period: 5 });
        break;
      case 'arrows':
      case 'fuzz':
      case 'elbows':
      case 'rakes':
        hazards.push({ kind, at: at(count - 1), period: 4.5 });
        break;
      case 'razors':
        hazards.push({ kind, at: at(count - 1), period: 3.8 });
        break;
      case 'timber':
        hazards.push({ kind, at: at(count - 1), period: 5 });
        break;
      case 'cords':
      case 'sunMoon':
      case 'serpents':
      case 'pills':
        hazards.push({ kind, at: at(count - 1), period: 4.4 });
        break;
      case 'cameras':
        hazards.push({ kind, at: at(count - 1), period: 4.8 });
        break;
      case 'presents':
        hazards.push({ kind, at: at(count - 1), period: 4.8 });
        break;
      case 'cutlery':
        hazards.push({ kind, at: at(count - 1), period: 4.6 });
        break;
      case 'stomps':
        // A run of the beast's footfalls, coming closer.
        hazards.push({ kind, at: at(count), period: 4.4 });
        break;
      case 'bubbles':
        // A run of breaths of air up through the road, each a beat after the one before.
        hazards.push({ kind, at: at(count + 1), period: 4.5 });
        break;
      case 'void':
        // A row of hollows in the road, opening one after another on the eleven-beat bar.
        hazards.push({ kind, at: at(count + 1), period: 4.4 });
        break;
      case 'magnets':
        // A row of cranes swinging their magnets across the road, each the other way from the one before.
        hazards.push({ kind, at: at(count), period: 4.6 });
        break;
      case 'hammer':
        // A row of the astral blacksmith's hammers, striking a beat apart: two bars at the album's 143 beats a minute.
        hazards.push({ kind, at: at(count), period: (8 * 60) / 143 });
        break;
      case 'autopilot':
        // A platoon of driverless pods down the stretch's lanes.
        hazards.push({ kind, from, to, count: 3, period: 4.4 });
        break;
      case 'strings':
        // A run of strings down the stretch, plucked one after another.
        hazards.push({ kind, at: at(count + 2), period: 4.4 });
        break;
      case 'vines':
        hazards.push({ kind, at: at(count), period: 3.6 });
        break;
      case 'fangs':
        // A run of jaws down the stretch, each snapping shut a beat after the one before.
        hazards.push({ kind, at: at(count + 1), period: 4.6 });
        break;
      case 'alphas':
        hazards.push({ kind, at: at(count - 1), period: 4.6 });
        break;
      case 'sweepers':
        // Street sweepers down the stretch, crossing one after another.
        hazards.push({ kind, at: at(count - 1), period: 4.8 });
        break;
      case 'sharks':
        // Sharks coming across the stretch one after another, each from the edge it circled off.
        hazards.push({ kind, at: at(count), period: 5.2 });
        break;
      case 'rockyMeteors':
        // Rocks with eyes falling onto the far end of the stretch and rolling back down it, one after another: long enough a cycle for each to roll the whole way.
        hazards.push({ kind, from, to, count: 2, period: METEOR_MARK + (to - from) / METEOR_ROLL + METEOR_CRUMBLE + 1.5 });
        break;
      case 'dozes':
        // Rows of sleep across the stretch, settling one after another down it.
        hazards.push({ kind, at: at(count + 1), period: 4.2 });
        break;
      default: {
        // A kit's hazard lays itself.
        const kit = KIT_HAZARDS.get(kind);
        if (kit) hazards.push(kit.generate({ from, to, count, at }));
      }
    }
    return true;
  }
}
