import { clamp, seededRandom } from '../core/math';
import { launchersFor } from './enrich';
import { TrackBuilder, dubins, offsetPose, type Pose, type RoadSurface, type SectionProps, ROAD_WIDTH_SCALE } from './builder';
import { nearestOnSpline } from './spline';
import { Track, inPit, type BranchDef, type HazardDef, type ItemBoxRow, type Landmark, type TrackDef } from './track';

/**
 * Generated tracks: a seeded loop built from themed corner modules. The
 * same seed and dials always build the same track, so a saved track is
 * just its seed, dials and name.
 */

export type GenTheme = TrackDef['theme'];
export const GEN_THEMES: readonly GenTheme[] = ['desert', 'speedway', 'volcano', 'jungle', 'lagoon', 'glacier', 'neon', 'dream', 'petro', 'mars', 'storm', 'void', 'phantom', 'airfield', 'grove', 'doubt', 'magenta', 'kepler', 'goblin', 'primeval', 'castle', 'skycastle', 'cell', 'prism', 'factory', 'gamma', 'carrion', 'wah', 'smog', 'dome', 'solar', 'inferno', 'mind', 'notmind', 'cellophane', 'mindfuzz'];
export const GEN_THEME_NAMES: Record<GenTheme, string> = {
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
};
export type GenLength = 'short' | 'medium' | 'long';
export const GEN_LENGTHS: readonly GenLength[] = ['short', 'medium', 'long'];
export const GEN_COMPLEXITY_MAX = 5;

export interface GenParams {
  seed: number;
  theme: GenTheme;
  /** 1 (wide, sweeping, forgiving) .. 5 (narrow, twisty, hazards everywhere). */
  complexity: number;
  length: GenLength;
}

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
const DECK_LINE = 4;
const COASTER_DECKS = ['Skyway', 'Coaster', 'Viaduct', 'Highline', 'Big Dipper', 'Rollercoaster'];
const SHORTCUT_NAMES = ['Gamma Knife', 'Robot Stop', 'Hot Water', 'Head On', 'Cut Throat Boogie', 'Mind Fuzz', 'Planet B', 'Doom City', 'Nuclear Fusion', 'Crumbling Castle'];

type HazardKind = HazardDef['kind'];

interface Palette {
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

const PALETTES: Record<GenTheme, Palette> = {
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
    deck: 'gravel',
    alt: 'sand',
    hazards: ['sunMoon'],
    start: 'setGate',
    landmarks: ['setGate'],
    tallWalls: 6,
    places: ['Jackal', 'Snake', 'Tornado', 'Tomb', 'Duality', 'Sandstorm', 'Moonbeam', 'Hieroglyph', 'Reset'],
    music: { lap: 'float-along', finalLap: 'float-along-final-lap' },
  },
  newworld: {
    surface: 'crust',
    deck: 'crust',
    alt: 'sand',
    hazards: ['sunMoon'],
    start: 'setGate',
    landmarks: ['setGate'],
    tallWalls: 6,
    places: ['Jackal', 'Snake', 'Tornado', 'Tomb', 'Duality', 'Sandstorm', 'Moonbeam', 'Hieroglyph', 'Reset'],
    music: { lap: 'altered-beast-i', finalLap: 'altered-beast-i-final-lap' },
  },
  foe: {
    surface: 'butcher',
    deck: 'butcher',
    alt: 'sand',
    hazards: ['sunMoon'],
    start: 'setGate',
    landmarks: ['setGate'],
    tallWalls: 6,
    places: ['Jackal', 'Snake', 'Tornado', 'Tomb', 'Duality', 'Sandstorm', 'Moonbeam', 'Hieroglyph', 'Reset'],
    music: { lap: 'altered-beast-ii', finalLap: 'altered-beast-ii-final-lap' },
  },
  altered: {
    surface: 'fur',
    deck: 'fur',
    alt: 'sand',
    hazards: ['sunMoon'],
    start: 'setGate',
    landmarks: ['setGate'],
    tallWalls: 6,
    places: ['Jackal', 'Snake', 'Tornado', 'Tomb', 'Duality', 'Sandstorm', 'Moonbeam', 'Hieroglyph', 'Reset'],
    music: { lap: 'altered-beast-iii', finalLap: 'altered-beast-iii-final-lap' },
  },
  hollow: {
    surface: 'bone',
    deck: 'bone',
    alt: 'sand',
    hazards: ['sunMoon'],
    start: 'setGate',
    landmarks: ['setGate'],
    tallWalls: 6,
    places: ['Jackal', 'Snake', 'Tornado', 'Tomb', 'Duality', 'Sandstorm', 'Moonbeam', 'Hieroglyph', 'Reset'],
    music: { lap: 'altered-beast-iv', finalLap: 'altered-beast-iv-final-lap' },
  },
};

const NAME_ADJECTIVES = ['Microtonal', 'Polygon', 'Infinite', 'Nonagon', 'Fuzz', 'Quarter-Tone', 'Psychedelic', 'Altered', 'Cosmic', 'Crumbling', 'Sleepy', 'Plastic', 'Gumboot', 'Robot', 'Hypertension'];
const NAME_KINDS = ['Run', 'Loop', 'Circuit', 'Raceway', 'Speedway', 'Rally', 'Ring', 'Gauntlet', 'Drift', 'Dash', 'Boogie'];

/** A name for a generated track, from its seed and theme. */
export function trackName(p: Pick<GenParams, 'seed' | 'theme'>): string {
  const rand = seededRandom(p.seed * 31 + 7);
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  return `${pick(NAME_ADJECTIVES)} ${pick(PALETTES[p.theme].places)} ${pick(NAME_KINDS)}`;
}

export function trackId(p: GenParams): string {
  return `gen-${p.theme}-${p.complexity}-${p.length}-${p.seed}`;
}

/** How the last generation went (tests and tuning). */
export const generatorStats = { attempts: 0, fallbacks: 0, rejects: { closure: 0, overlap: 0, coaster: 0 } };

/** Builds the track for these dials; a layout that fails its checks is re-rolled from the same seed. */
export function generateTrack(p: GenParams): TrackDef {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const def = attemptTrack(p, attempt);
    generatorStats.attempts = attempt + 1;
    if (def && isPlayable(def)) return def;
    if (def) generatorStats.rejects.overlap++;
  }
  generatorStats.fallbacks++;
  // Every attempt failed (it shouldn't): the plainest loop for these dials.
  return attemptTrack({ ...p, complexity: 1 }, 0, true)!;
}

/** Road that doesn't cross itself (overpasses aside), shortcuts clear of the rest of the road, and checkpoints on solid road. */
export function isPlayable(def: TrackDef): boolean {
  const track = new Track(def);
  if (selfGap(track) < 5) return false;
  if (track.branches.some((_, k) => branchGap(track, k) < 5)) return false;
  return def.checkpoints.every((cp) => {
    const pose = track.respawnPose(cp * track.length + 2);
    return track.locate(pose.x, pose.z, pose.y).onRoad;
  });
}

/** Closest the road comes to itself, edge to edge, away from where it's the same stretch. */
export function selfGap(track: Track): number {
  const sp = track.spline;
  let min = Infinity;
  for (let i = 0; i < sp.count; i += 2) {
    for (let j = i + 2; j < sp.count; j += 2) {
      const along = Math.abs(sp.dist[i] - sp.dist[j]);
      // Flat on the map: a deck high over another stretch of road would still be a crossing.
      if (Math.min(along, sp.length - along) < 120) continue;
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
  const aspect = 1 + rand() * 0.6;
  const H = per / (2 * (1 + aspect));
  const W = H * aspect;
  const start: Pose = { x: -W / 2 + R + FINISH, z: H / 2, h: Math.PI / 2 };
  const place = () => pick(pal.places);
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
  let bulge: { from: { s: number; pose: Pose }; to: { s: number; pose: Pose } } | null = null;
  const risky: RiskySpot[] = [];
  const edge = () => (rand() < 0.5 ? 1 : -1);

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
  // A wide swing out of the rectangle and back onto the side's line, open-edged so a shortcut can cut straight across.
  const sweep = (): Module => {
    const r = between(42, 52);
    const a = between(60, 68);
    return {
      name: pick(['Swing', 'Detour', 'Long Way Round']),
      open: false,
      props: { wallHeight: 0, surface: pal.surface },
      bulge: true,
      fixed: true,
      build: (bb) => bb.straight(6).arc(r, -a).arc(r, 2 * a).arc(r, -a).straight(6),
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
      [1.5, sBend],
      [c * 0.5, () => esses(false)],
    ];
    if (c >= 2 && !landing) options.push([c * 0.4, () => esses(true)]);
    if (c >= 3 && room > 90 && !landing) options.push([(c - 2) * 0.6, hairpins]);
    if (c >= 2 && jumps < 2 && room > 110 && !landing) options.push([0.5 + c * 0.15, jump]);
    if (pal.liquid && bridges < 1 && room > 110 && !walledLast) options.push([0.6, bridge]);
    // Kickers: more at higher twists, and every track gets one once it's past the first side;
    // none where the grid and the first boxes are.
    const single = KICKER_LEAD + 7 + KICKER_LANDING;
    if (kickers < 1 + c && room > single && b.s > FINISH) {
      const pair = kickers + 2 <= 1 + c && room > single + KICKER_PAIR[1] + 7 && rand() < 0.15 + c * 0.12;
      const make = () => kickerRun(pair, pair ? room - KICKER_PAIR[1] - 7 : room);
      // None yet by the second half of the lap: this is it.
      if (kickers === 0 && side >= 2 && !plain) return make();
      options.push([kickers === 0 && side > 0 ? 12 : 0.2 + c * 0.25, make]);
    }
    // A coaster from twists 3: likely once past the first side, and by the third side this is it.
    if (c >= 3 && !plain && coasters === 0 && side >= 1) {
      const m = coaster(room);
      if (m && side >= 2) return m;
      if (m) options.push([4, () => m]);
    }
    // Not over an abyss: the open bends where it meets the shortcut would be a long way down.
    if (c >= 3 && !abyss && !bulge && room > 160) options.push([1.5 + (c - 3) * 0.5, sweep]);
    if (plain) options.splice(1);
    const total = options.reduce((t, [w]) => t + Math.max(0, w), 0);
    let r = rand() * total;
    for (const [w, make] of options) {
      r -= Math.max(0, w);
      if (r <= 0) return make();
    }
    return options[0][1]();
  };

  // A rectangle of four sides, each filled with modules, corners between them.
  const sides = [W - 2 * R - FINISH, H - 2 * R, W - 2 * R, H - 2 * R];
  for (let side = 0; side < 4; side++) {
    const from = { ...b.pose };
    const fx = Math.sin(from.h);
    const fz = Math.cos(from.h);
    const along = () => (b.pose.x - from.x) * fx + (b.pose.z - from.z) * fz;
    lateral = 0;
    if (side > 0) {
      const mark = `side${side}`;
      b.mark(mark);
      marks.push(mark);
      itemBoxes.push({ s: b.s + 15, count: halfWidth > 10 ? 4 : 3 });
    }
    // The last two sides aim for where the final corner must start, so the loop closes on a plain corner;
    // the others run their length.
    const home = offsetPose(start, -FINISH);
    // The last corner turns from the last side's heading onto the finish line: it starts R back and R across.
    const lastH = home.h - Math.PI / 2;
    const corner = { x: home.x - R * Math.sin(home.h) - R * Math.sin(lastH), z: home.z - R * Math.cos(home.h) - R * Math.cos(lastH) };
    const toCorner = () => (corner.x - b.pose.x) * fx + (corner.z - b.pose.z) * fz;
    const goal = () => (side === 3 ? toCorner() : side === 2 ? toCorner() - R : sides[side] - along());
    let guard = 0;
    while (goal() > 25 && guard++ < 20) {
      const room = goal();
      // Try a few modules for one that fits what's left of the side; otherwise run straight to the end.
      let m: Module | null = null;
      for (let tries = 0; tries < 6 && !m; tries++) {
        const cand = chooseModule(room, side);
        if (measure(cand) <= room + 4) m = cand;
      }
      m ??= straight(room);
      // The last side keeps to its line: nothing that shifts the road sideways.
      if (side === 3 && (m.name === 'S-Bends' || m.name === 'Hairpins')) m = straight(Math.min(room, 40));
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
      if (m.walled) walled.push([s0, s1]);
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
      if (side === 0 && marks.length === 0 && along() > sides[0] / 2) {
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
    }
    // Whatever's left of the side, straight.
    if (goal() > 0.5) {
      noteStraight(b.s, b.s + goal());
      b.straight(goal());
    }
    if (side < 3) {
      b.section(`${place()} ${pick(['Bend', 'Turn', 'Corner', 'Sweeper'])}`, { halfWidth, wallHeight: wall, surface: surface() });
      // Tight on the apex: the fallback spot for the double boxes.
      risky.push({ rank: 0, s: b.s + (R * Math.PI) / 4, count: 1, lateral: -(halfWidth - 1.5) });
      b.arc(R, 90);
    }
  }
  // From twists 3 every track has its coaster: one with no room for it is re-rolled.
  if (c >= 3 && !plain && coasters === 0) {
    generatorStats.rejects.coaster++;
    return null;
  }
  if (!marks.includes('mid')) {
    // A short first side: the checkpoint goes on the first corner's exit instead.
    marks.unshift('side1');
  }
  // Home: the last corner, closed exactly onto the line. A layout that needs a loop to get there is re-rolled.
  const target = offsetPose(start, -FINISH);
  const close = dubins(b.pose, target, R);
  const turned = close.filter(([k]) => k !== 'S').reduce((t, [, len]) => t + len / R, 0);
  if (!plain && turned > Math.PI * 1.15) {
    generatorStats.rejects.closure++;
    return null;
  }
  b.section(`${place()} ${pick(['Bend', 'Hook', 'Sweeper'])}`, { halfWidth, wallHeight: wall, surface: pal.surface });
  b.mark('home');
  marks.push('home');
  b.turnTo(target, R);
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
    name: trackName(p),
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
      case 'strings':
        // A run of strings down the stretch, plucked one after another.
        hazards.push({ kind, at: at(count + 2), period: 4.4 });
        break;
      case 'vines':
        hazards.push({ kind, at: at(count), period: 3.6 });
        break;
    }
    return true;
  }
}
