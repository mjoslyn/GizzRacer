import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seededRandom } from '../core/math';
import { nearestOnSpline } from '../tracks/spline';
import { inPit, type Ribbon, type Track } from '../tracks/track';
import * as tex from './textures';
import type { DecorKind, Theme } from './themes';
import { densityScale } from './detail';

/**
 * The trackside layer: paint and rubber on the road, posts and lamps along
 * its edges, warning boards on the sharp corners, a grandstand at the start,
 * billboards and ground cover. Purely visual; nothing here collides.
 */

export const CURB_WIDTH = 1.2;

type Edge = 'pole' | 'fence' | 'torch' | 'lamp' | 'buoy' | 'star';

interface DetailStyle {
  /** What stands along open road edges, how tall, how far apart, and its colours. */
  edge: { kind: Edge; height: number; spacing: number; color: number; stripe: number };
  /** Light on top of each edge post, if any. */
  light?: number;
  /** Small scatter close to the road. */
  cover: { shape: 'tuft' | 'pebble' | 'crystal' | 'none'; colors: number[]; count: number };
  /** Billboard slogans and colours (background, rays). */
  boards: { words: string[]; bg: string[]; fg: string };
  crowd: boolean;
}

const STYLES: Record<DecorKind, DetailStyle> = {
  desert: {
    edge: { kind: 'fence', height: 1.1, spacing: 9, color: 0x7a5232, stripe: 0xe8dcc0 },
    cover: { shape: 'tuft', colors: [0xb8a060, 0x8a7a40, 0xc8b070], count: 1400 },
    boards: { words: ['RATTLE!', 'SSSSSS', 'MICROTONAL', 'MELTING'], bg: ['#1f3fbf', '#16309a', '#2a4ad0'], fg: '#ffd23a' },
    crowd: true,
  },
  meadow: {
    edge: { kind: 'pole', height: 1.2, spacing: 11, color: 0xf4f4f4, stripe: 0xd8202a },
    cover: { shape: 'tuft', colors: [0x4a9a3a, 0x6ab84a, 0x3a8a2a, 0xffe45a, 0xff8ad8, 0xffffff], count: 1800 },
    boards: { words: ['MOTOR SPIRIT', 'PETROL', 'FULL TANK', 'GO GO GO'], bg: ['#1a1a1c', '#8a1a10', '#3a6ad8'], fg: '#ffffff' },
    crowd: true,
  },
  volcanic: {
    edge: { kind: 'torch', height: 1.3, spacing: 15, color: 0x2a2224, stripe: 0x4a3a34 },
    light: 0xff7a20,
    cover: { shape: 'pebble', colors: [0x2a1a18, 0x3a2624, 0x1a1214, 0xff5a10], count: 1200 },
    boards: { words: ['MAGMA', 'ERUPT', 'BURN IT', 'HOT HOT'], bg: ['#2a0a08', '#5a1010'], fg: '#ff7a2a' },
    crowd: true,
  },
  jungle: {
    edge: { kind: 'torch', height: 1.7, spacing: 17, color: 0x6a4a2a, stripe: 0x3a2a14 },
    light: 0xffa040,
    cover: { shape: 'tuft', colors: [0x2a7a2a, 0x3a9a3a, 0x1a5a20, 0xff5a8a], count: 1800 },
    boards: { words: ['IRON LUNG', 'BREATHE', 'SPORES', 'MYCELIUM'], bg: ['#2a5a2a', '#7a4a1a'], fg: '#ffe45a' },
    crowd: true,
  },
  lagoon: {
    edge: { kind: 'buoy', height: 0.9, spacing: 12, color: 0xf4f0e8, stripe: 0xd8302a },
    // Off-road is wading water: nothing to scatter on it.
    cover: { shape: 'none', colors: [], count: 0 },
    boards: { words: ['OPEN WATER', 'SET SAIL', 'BANANA', 'DEEP BLUE'], bg: ['#1f3fbf', '#16309a'], fg: '#ffd23a' },
    crowd: true,
  },
  glacier: {
    edge: { kind: 'pole', height: 1.6, spacing: 11, color: 0xff6a1a, stripe: 0x1a1a1a },
    cover: { shape: 'crystal', colors: [0xe8f4ff, 0xbfe0ff, 0xffffff], count: 1100 },
    boards: { words: ['ICE V', 'FROSTBITE', 'BRRRR', 'SLIDE'], bg: ['#2a4a8a', '#5a8ac8'], fg: '#e8f8ff' },
    crowd: true,
  },
  city: {
    edge: { kind: 'lamp', height: 4.2, spacing: 16, color: 0x2a2438, stripe: 0x1a1428 },
    light: 0xff6ae0,
    cover: { shape: 'none', colors: [], count: 0 },
    boards: { words: ['DOOM CITY', 'NUCLEAR', 'FUSION', 'NO EXIT'], bg: ['#060c34', '#10226a'], fg: '#ffd21a' },
    crowd: true,
  },
  wasteland: {
    edge: { kind: 'torch', height: 1.5, spacing: 14, color: 0x3a2a26, stripe: 0x6a3a1a },
    light: 0xff5a1a,
    cover: { shape: 'pebble', colors: [0x1a1210, 0x2a1c18, 0x0a0606, 0x4a2a1a], count: 1300 },
    boards: { words: ['REPENT', 'DOOM', 'CRUDE', 'THE END'], bg: ['#1a0604', '#3a0a06'], fg: '#ff4a1a' },
    crowd: false,
  },
  colony: {
    edge: { kind: 'pole', height: 1.8, spacing: 13, color: 0xc8c8cc, stripe: 0xff3a1a },
    light: 0xff3a1a,
    cover: { shape: 'pebble', colors: [0x8a3218, 0x5a2414, 0xb8582c, 0x3a1810], count: 1300 },
    boards: { words: ['FLAMETHROWER', 'EVACUATE', 'BURN', 'NO RETURN'], bg: ['#5a1a10', '#2a2a30'], fg: '#ffc020' },
    crowd: false,
  },
  plains: {
    edge: { kind: 'fence', height: 1.2, spacing: 10, color: 0x5a4632, stripe: 0x8a7a5a },
    cover: { shape: 'tuft', colors: [0x4a6a3a, 0x6a8a4a, 0x3a5030, 0x8a8a5a], count: 1600 },
    boards: { words: ['TAKE COVER', 'SUPERCELL', 'TWISTER', 'NO SHELTER'], bg: ['#1a2428', '#3a2a14'], fg: '#e8f020' },
    crowd: false,
  },
  cosmos: {
    edge: { kind: 'star', height: 1.4, spacing: 13, color: 0xc89aff, stripe: 0xffffff },
    light: 0xd8a0ff,
    cover: { shape: 'none', colors: [], count: 0 },
    boards: { words: [], bg: [], fg: '#ffffff' },
    crowd: false,
  },
  isle: {
    edge: { kind: 'torch', height: 1.5, spacing: 15, color: 0x3a3a4a, stripe: 0x5a5a6a },
    // Lanterns that burn the colour of the ghost lights.
    light: 0x7affe0,
    cover: { shape: 'tuft', colors: [0x4a6a5a, 0x6a8a7a, 0x8a7aa8, 0x3a5048], count: 1300 },
    boards: { words: ['PHANTOM', 'NOT HERE', 'WHERE AM I', 'GHOST LIGHTS'], bg: ['#2e1c5a', '#1a3a4a'], fg: '#a0fff0' },
    crowd: true,
  },
  airstrip: {
    edge: { kind: 'pole', height: 1.0, spacing: 10, color: 0xffffff, stripe: 0xff6a1a },
    light: 0x40a0ff,
    cover: { shape: 'tuft', colors: [0x5a9a3a, 0x7ab84a, 0xffe45a, 0xffffff], count: 1500 },
    boards: { words: ['DEADSTICK', 'MAYDAY', 'CLEAR PROP', 'GLIDE'], bg: ['#1a5ad0', '#e04a2a', '#2a8a4a'], fg: '#ffffff' },
    crowd: true,
  },
  grove: {
    edge: { kind: 'torch', height: 1.4, spacing: 16, color: 0x5a3a20, stripe: 0x3a2a14 },
    light: 0xffd060,
    cover: { shape: 'tuft', colors: [0x3a7a2a, 0x5a9a3a, 0xc8a040, 0xff8ad8, 0x9affd0], count: 1800 },
    boards: { words: ['PANPSYCH', 'ALL AWAKE', 'HUM', 'I AM TREE'], bg: ['#2a5a2a', '#6a4a1a'], fg: '#ffe890' },
    crowd: true,
  },
  sea: {
    edge: { kind: 'buoy', height: 1.1, spacing: 12, color: 0xe8e8e0, stripe: 0xd8302a },
    light: 0xff3a2a,
    // Off the road is the sea: nothing to scatter on it.
    cover: { shape: 'none', colors: [], count: 0 },
    boards: { words: ['DOUBT', 'TURN BACK', 'NO SHORE', 'MAYBE'], bg: ['#0a1420', '#1a2a3a'], fg: '#c0f0ff' },
    crowd: false,
  },
  peaks: {
    edge: { kind: 'pole', height: 1.6, spacing: 11, color: 0xff5ad0, stripe: 0xffffff },
    light: 0xff8ae8,
    cover: { shape: 'crystal', colors: [0xff5ad8, 0xffc0f0, 0xc040ff, 0xffffff], count: 1300 },
    boards: { words: ['MAGENTA', 'WANDER', 'SUMMIT', 'GLOW'], bg: ['#8a1a8a', '#3a0a5a'], fg: '#ffd0f0' },
    crowd: true,
  },
  alienSea: {
    edge: { kind: 'buoy', height: 1.2, spacing: 13, color: 0x7affe0, stripe: 0xc06aff },
    light: 0x7affe0,
    cover: { shape: 'none', colors: [], count: 0 },
    boards: { words: ['KEPLER', '22B', 'SUPER EARTH', 'SPLASH'], bg: ['#0a3a5a', '#4a1a6a'], fg: '#9affe8' },
    crowd: true,
  },
  garden: {
    edge: { kind: 'fence', height: 1.3, spacing: 8, color: 0xf4f4ec, stripe: 0xd8302a },
    cover: { shape: 'tuft', colors: [0x3a8a2a, 0x5aa83a, 0xffe45a, 0xff6ad8, 0xffffff], count: 1800 },
    boards: { words: ['GOBLIN', 'KEEP OFF', 'GRASS', 'DIG IT'], bg: ['#2a7a2a', '#a0502a'], fg: '#fff4c0' },
    crowd: true,
  },
  shore: {
    edge: { kind: 'torch', height: 1.4, spacing: 15, color: 0x3a3030, stripe: 0x6a5a4a },
    light: 0xffa040,
    cover: { shape: 'pebble', colors: [0x2a2a2e, 0x4a4844, 0xe8dcc0, 0x3a5a30], count: 1300 },
    boards: { words: ['PREDATOR X', 'BEWARE', 'JURASSIC', 'TEETH'], bg: ['#3a2a20', '#1a2a2a'], fg: '#ffb060' },
    crowd: false,
  },
  ruins: {
    edge: { kind: 'torch', height: 1.6, spacing: 12, color: 0x3a3436, stripe: 0x6a5a50 },
    light: 0xff8a30,
    cover: { shape: 'pebble', colors: [0x4a4648, 0x6a6466, 0x2a2426, 0x8a7a70], count: 1400 },
    boards: { words: ['CRUMBLING', 'CASTLE', 'BEWARE', 'KEEP OUT'], bg: ['#2a0a0a', '#4a1a10'], fg: '#ffb060' },
    crowd: true,
  },
  clouds: {
    edge: { kind: 'pole', height: 1.6, spacing: 13, color: 0xf4ecd8, stripe: 0x4a7ad8 },
    light: 0xfff0c0,
    cover: { shape: 'none', colors: [], count: 0 },
    boards: { words: ['CASTLE', 'IN THE AIR', 'NO FLOOR', 'SOAR'], bg: ['#4a7ad8', '#d8a040'], fg: '#fff8e0' },
    crowd: false,
  },
  cytoplasm: {
    edge: { kind: 'buoy', height: 1.2, spacing: 12, color: 0xff6ab0, stripe: 0x9affd0 },
    light: 0xffa0d8,
    cover: { shape: 'pebble', colors: [0xff8ac0, 0xc05aa0, 0x9affd0, 0xffd0e8], count: 1200 },
    boards: { words: ['INNER CELL', 'MITOSIS', 'NUCLEUS', 'DIVIDE'], bg: ['#5a1a5a', '#a02a6a'], fg: '#ffd0ec' },
    crowd: true,
  },
  spectrum: {
    edge: { kind: 'lamp', height: 3, spacing: 16, color: 0x2a2a3a, stripe: 0xd040ff },
    light: 0xd8b0ff,
    cover: { shape: 'crystal', colors: [0xff3a4a, 0x3aff7a, 0x3a7aff, 0xd040ff], count: 1300 },
    boards: { words: ['TETRACHROMACY', 'FOURTH COLOUR', 'SEE IT', 'PRISM'], bg: ['#1a0a3a', '#3a0a5a'], fg: '#e0c0ff' },
    crowd: true,
  },
  foundry: {
    edge: { kind: 'lamp', height: 3.4, spacing: 15, color: 0x3a3e46, stripe: 0xe07020 },
    light: 0xffa040,
    cover: { shape: 'pebble', colors: [0x3a3e46, 0x6a6e76, 0xe07020, 0x1a1a1c], count: 1100 },
    boards: { words: ['ROBOT STOP', 'LOOSEN UP', 'TIME TO DROP', 'NONAGON'], bg: ['#1a1a1c', '#3a2a14'], fg: '#ff9020' },
    crowd: true,
  },
  theatre: {
    edge: { kind: 'pole', height: 1.6, spacing: 12, color: 0xe0e8f0, stripe: 0x40ff80 },
    light: 0xa0ffc0,
    cover: { shape: 'crystal', colors: [0x60ff90, 0x30c060, 0xb080ff, 0xe0ffe8], count: 1000 },
    boards: { words: ['GAMMA KNIFE', 'CUT IT OUT', 'PIERCED', 'MY MIND'], bg: ['#08141a', '#0a3a30'], fg: '#80ffb0' },
    crowd: true,
  },
  boneyard: {
    edge: { kind: 'fence', height: 1.1, spacing: 10, color: 0x4a3a2a, stripe: 0xe8e0d0 },
    cover: { shape: 'tuft', colors: [0xb89860, 0x8a7040, 0xe8e0d0, 0x6a4a30], count: 1500 },
    boards: { words: ['PEOPLE-VULTURES', 'CIRCLING', 'CARCASS', 'PICK IT CLEAN'], bg: ['#2a1408', '#6a3a1a'], fg: '#e8c070' },
    crowd: true,
  },
  pedalboard: {
    edge: { kind: 'lamp', height: 3, spacing: 14, color: 0x1a1416, stripe: 0xd83a7a },
    light: 0xff80d0,
    cover: { shape: 'pebble', colors: [0xd83a7a, 0x3ab0d8, 0xe0b030, 0x8a3ad8], count: 1100 },
    boards: { words: ['WAH WAH', 'HEEL DOWN', 'TOE DOWN', 'SWEEP IT'], bg: ['#1a0a2a', '#4a1a6a'], fg: '#ffd040' },
    crowd: true,
  },
  blight: {
    edge: { kind: 'lamp', height: 3.2, spacing: 16, color: 0x3a3430, stripe: 0x8a6a30 },
    light: 0xffb050,
    cover: { shape: 'pebble', colors: [0x3a3632, 0x5a524a, 0x1a1614, 0x8a3a20], count: 1200 },
    boards: { words: ['PLANET B', 'THERE IS NO', 'SMOG ALERT', 'KEEP DRIVING'], bg: ['#2a2420', '#5a3a1a'], fg: '#e8c070' },
    crowd: true,
  },
  domes: {
    edge: { kind: 'lamp', height: 3.6, spacing: 14, color: 0xf0ece4, stripe: 0xe0b040 },
    light: 0xfff0d0,
    cover: { shape: 'pebble', colors: [0xb04a22, 0x8a3218, 0xd07a4a, 0xf0e8e0], count: 1100 },
    boards: { words: ['MARS FOR THE RICH', 'MEMBERS ONLY', 'PENTHOUSE', 'NO POOR'], bg: ['#f4f0e8', '#3a2a14'], fg: '#c8901a' },
    crowd: true,
  },
  corona: {
    edge: { kind: 'pole', height: 1.6, spacing: 12, color: 0x2a2624, stripe: 0xffa020 },
    light: 0xffc060,
    cover: { shape: 'crystal', colors: [0xffa020, 0xff6010, 0xffe080, 0x3a1a10], count: 1000 },
    boards: { words: ['PERIHELION', 'TOO CLOSE', 'HEAT SHIELD', 'FALLING'], bg: ['#1a0a04', '#6a1a04'], fg: '#ffd060' },
    crowd: true,
  },
  pit: {
    edge: { kind: 'torch', height: 1.8, spacing: 14, color: 0x1a1010, stripe: 0x3a1a14 },
    light: 0xff5a10,
    cover: { shape: 'pebble', colors: [0x1a0a08, 0x3a1410, 0xff4a10, 0xd8d0c0], count: 1200 },
    boards: { words: ['HELL', 'ABANDON HOPE', 'RATS NEST', 'NO WAY OUT'], bg: ['#1a0202', '#4a0606'], fg: '#ff6a20' },
    crowd: true,
  },
  neurons: {
    edge: { kind: 'pole', height: 1.6, spacing: 12, color: 0x6a1a5a, stripe: 0x80f0ff },
    light: 0xc080ff,
    cover: { shape: 'crystal', colors: [0xff80c0, 0xc060ff, 0x80f0ff, 0xffd0e8], count: 1100 },
    boards: { words: ["I'M IN YOUR MIND", 'THIRD EYE', 'MIND READ', 'THINK FAST'], bg: ['#4a0a5a', '#c03a90'], fg: '#ffe0f4' },
    crowd: true,
  },
  opart: {
    edge: { kind: 'pole', height: 1.4, spacing: 10, color: 0x101014, stripe: 0xf4f4f0 },
    light: 0xff2a6a,
    cover: { shape: 'pebble', colors: [0x101014, 0xf4f4f0, 0x606064], count: 1000 },
    boards: { words: ["I'M NOT IN YOUR MIND", 'NOT THERE', 'NOWHERE', 'BLANK'], bg: ['#101014', '#f4f4f0'], fg: '#ff2a6a' },
    crowd: true,
  },
  panes: {
    edge: { kind: 'lamp', height: 3.2, spacing: 14, color: 0x1a1a24, stripe: 0xffd020 },
    light: 0xfff4d0,
    cover: { shape: 'crystal', colors: [0xff3a6a, 0xffd020, 0x30e080, 0x30a0ff, 0xb060ff], count: 1200 },
    boards: { words: ['CELLOPHANE', 'SEE THROUGH', 'WRAP IT UP', 'CRINKLE'], bg: ['#30a0ff', '#ff3a6a'], fg: '#fff4c0' },
    crowd: true,
  },
  static: {
    edge: { kind: 'lamp', height: 2.6, spacing: 14, color: 0x1a1420, stripe: 0x80ff90 },
    light: 0x80ff90,
    cover: { shape: 'tuft', colors: [0x6a2a9a, 0x40c060, 0xa040c0, 0x2a8a3a], count: 1500 },
    boards: { words: ['MIND FUZZ', 'TURN IT UP', 'INTO THE RED', 'FUZZ'], bg: ['#2a0a3a', '#40c060'], fg: '#ffb0f0' },
    crowd: true,
  },
  bandroom: {
    edge: { kind: 'lamp', height: 3.4, spacing: 16, color: 0x1a1418, stripe: 0xff4a8a },
    light: 0xff70b0,
    cover: { shape: 'pebble', colors: [0x2a2a30, 0x8a6a40, 0x3a5a3a, 0xd0c8b0], count: 900 },
    boards: { words: ['THE BENDED ELBOW', 'EY EY EY', 'BIG SHOT', 'LIVE TONIGHT'], bg: ['#1a0a1a', '#d0205a'], fg: '#ffe14d' },
    crowd: true,
  },
  wetland: {
    edge: { kind: 'fence', height: 1.3, spacing: 9, color: 0x6a5a40, stripe: 0xe8e0c8 },
    cover: { shape: 'tuft', colors: [0x6a7a3a, 0x8a8a4a, 0x4a5a2a, 0xa09060], count: 1600 },
    boards: { words: ['MUCKRAKER', 'RAKE THE MUCK', 'JUST MY LUCK', 'COOGOORAH RESERVE'], bg: ['#3a4a3a', '#8a6a3a'], fg: '#f0f0d8' },
    crowd: true,
  },
  party: {
    edge: { kind: 'lamp', height: 2.8, spacing: 12, color: 0x2a1a10, stripe: 0xffd040 },
    light: 0xffb060,
    cover: { shape: 'crystal', colors: [0xff3a8a, 0xffd040, 0x40e0ff, 0xa040ff], count: 1000 },
    boards: { words: ['CUT THROAT BOOGIE', 'BOOGIE', 'DUAL MONO', 'BUCKLE ME IN'], bg: ['#2a1440', '#ff6a20'], fg: '#fff0c0' },
    crowd: true,
  },
  canopy: {
    edge: { kind: 'pole', height: 1.6, spacing: 12, color: 0x4a3a24, stripe: 0xd8e8c0 },
    cover: { shape: 'tuft', colors: [0x2a6a2a, 0x4a8a34, 0x6aa040, 0x3a5a2a], count: 1700 },
    boards: { words: ['SEA OF TREES', 'UNDERWATER', 'JAM', 'UNFOLD'], bg: ['#1a3a24', '#4a8a4a'], fg: '#f0fff0' },
    crowd: true,
  },
  hadean: {
    edge: { kind: 'torch', height: 1.6, spacing: 14, color: 0x1a1618, stripe: 0xc8d0e0 },
    light: 0xe8f0ff,
    cover: { shape: 'pebble', colors: [0x1a1618, 0x2a2428, 0xff6a20, 0x3a3034], count: 1100 },
    boards: { words: ['THEIA', 'MEET OUR MAKER', 'DANCE WITH THEIA', 'THE SILVER CORD'], bg: ['#140a08', '#3a1a0a'], fg: '#ffd890' },
    crowd: true,
  },
  deshret: {
    edge: { kind: 'torch', height: 2.2, spacing: 16, color: 0xc8a070, stripe: 0x2a5aa0 },
    light: 0xffb040,
    cover: { shape: 'pebble', colors: [0xb05a30, 0xd08050, 0x8a3a20, 0xe8c080], count: 1200 },
    boards: { words: ['SLAY THE MIGHTY SET', 'RESET', 'GOD OF DUALITY', 'HIEROGLYPHIC'], bg: ['#1a2a6a', '#c05a20'], fg: '#ffe090' },
    crowd: true,
  },
  moonpalace: {
    edge: { kind: 'lamp', height: 2.6, spacing: 14, color: 0xb02020, stripe: 0xe0b040 },
    light: 0xff6a40,
    cover: { shape: 'crystal', colors: [0x40c090, 0xe0e4f0, 0xffd060, 0x80f0c0], count: 900 },
    boards: { words: ["CHANG'E", 'THE VOYAGER', 'SAILING THE MOON-SEA', 'PALACE AMONGST STARS'], bg: ['#0a0a2a', '#8a1a20'], fg: '#ffe8a0' },
    crowd: true,
  },
  uruk: {
    edge: { kind: 'torch', height: 1.8, spacing: 15, color: 0x8a6a48, stripe: 0x2a5aa0 },
    light: 0xffa040,
    cover: { shape: 'tuft', colors: [0x8a7a50, 0xa89060, 0x6a6048, 0x40c0e0], count: 1300 },
    boards: { words: ['GILGAMESH', 'HEAR MY NAME', 'HOUSE OF DUST', 'FOR IMMORTALITY'], bg: ['#1a2a5a', '#6a4a2a'], fg: '#ffd890' },
    crowd: true,
  },
  headtrip: {
    edge: { kind: 'lamp', height: 2.4, spacing: 14, color: 0x3a1048, stripe: 0xffa030 },
    light: 0xff70c8,
    cover: { shape: 'crystal', colors: [0xff5ab0, 0xffb030, 0x40e0c0, 0xa050ff], count: 1100 },
    boards: { words: ['HEAD ON', 'I ATE THE WRONG PILL', 'SCREW MY HEAD ON', 'HOLD ME UP STRAIGHT'], bg: ['#3a0a4a', '#ff6a20'], fg: '#fff0a0' },
    crowd: true,
  },
  sky: {
    edge: { kind: 'star', height: 1.4, spacing: 14, color: 0xffe8a0, stripe: 0xffffff },
    light: 0xfff0ff,
    cover: { shape: 'none', colors: [], count: 0 },
    boards: { words: [], bg: [], fg: '#ffffff' },
    crowd: false,
  },
};

/** What the trackside layer knows about the race: the final lap lights everything up (set by trackView.update). */
export const atmosphere = { finalLap: 0 };

/** A theme's trackside style (trackLife.ts shares it). */
export function detailStyle(decor: DecorKind): { crowd: boolean; light?: number; boards: { bg: string[]; fg: string } } {
  return STYLES[decor];
}

/** The trackside layer for a track; `animated` gets the per-frame updates. */
export function trackDetail(track: Track, theme: Theme, animated: ((time: number) => void)[]): THREE.Group {
  const g = new THREE.Group();
  const style = STYLES[theme.decor];
  const abyss = !!track.def.abyss;
  const ribbons = [track.main, ...track.branches];
  // Clear of every road (by `margin` past its edge) and of every pit.
  const clear = (x: number, z: number, margin: number) =>
    ribbons.every((r) => {
      const hit = nearestOnSpline(r.spline, x, z);
      return hit.distance > r.halfWidth[hit.index] + margin;
    }) && track.def.pits.every((p) => !inPit({ ...p, halfWidth: p.halfWidth + 2, halfLength: p.halfLength + 2 }, x, z));

  // Roads that are only there on some laps carry their own paint (render/trackView.ts) and no posts or boards.
  const fixed = ribbons.filter((_, i) => i === 0 || !track.def.branches[i - 1].openOn);
  for (const r of fixed) g.add(roadPaint(r, theme.decor, theme.edgeLine, theme.edgeWidth));
  g.add(edgeProps(fixed, style, abyss, clear, animated));
  g.add(cornerBoards(fixed, abyss, clear));
  if (!abyss) {
    if (style.crowd) {
      const stand = grandstand(track, theme, clear, animated);
      if (stand) g.add(stand);
    }
    g.add(billboards(track, style, clear));
    if (style.cover.shape !== 'none') g.add(groundCover(track, style, clear));
  }
  return g;
}

// ---- Paint and rubber ---------------------------------------------------------

/**
 * Edge lines and a dashed centre line on asphalt, and the darker band the
 * racing line wears into any hard surface, swinging to the inside of each
 * corner.
 */
export function roadPaint(ribbon: Ribbon, decor: DecorKind, edgeLine?: number, edgeWidth = 0.5): THREE.Group {
  const g = new THREE.Group();
  const sp = ribbon.spline;
  const segs = sp.closed ? sp.count : sp.count - 1;
  const lines: number[] = [];
  const edges: number[] = [];
  const dashes: number[] = [];
  const rubber: number[] = [];
  const lift = 0.045;
  const y = (i: number) => ribbon.heightAt(sp.dist[i]) + lift;
  const at = (i: number, lat: number, h: number) => [sp.px[i] - sp.tz[i] * lat, h, sp.pz[i] + sp.tx[i] * lat];
  const strip = (out: number[], i: number, j: number, a: number, b: number, aj = a, bj = b) => {
    const yi = y(i);
    const yj = y(j);
    out.push(...at(i, a, yi), ...at(j, aj, yj), ...at(i, b, yi), ...at(i, b, yi), ...at(j, aj, yj), ...at(j, bj, yj));
  };
  // The racing line: toward the inside of the bend, smoothed along the road.
  const n = sp.count;
  const line = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let o = -12; o <= 12; o++) {
      const k = sp.closed ? (i + o + n) % n : Math.min(n - 1, Math.max(0, i + o));
      sum += ribbon.curvature[k];
    }
    // Curvature > 0 turns left; left is negative lateral.
    line[i] = -Math.max(-0.55, Math.min(0.55, (sum / 25) * 14));
  }
  const paintable = new Set(['asphalt']);
  const wearable = new Set(['asphalt', 'salt', 'rock', 'sand', 'boards', 'regolith', 'wet', 'paving', 'reef', 'flagstone', 'membrane', 'steel', 'scorched', 'fret', 'tar', 'gilded', 'heatshield', 'brimstone', 'neural', 'film', 'fuzz', 'carpet', 'muck', 'moss', 'hieroglyph', 'mudbrick']);
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const sMid = (sp.dist[i] + (j === 0 ? sp.length : sp.dist[j])) / 2;
    if (ribbon.inGap(sMid) || ribbon.inGap(sp.dist[i])) continue;
    const surface = ribbon.surfaceAt(i);
    const hwi = ribbon.halfWidth[i];
    const hwj = ribbon.halfWidth[j];
    // A dark world's edge lines go down every road, walled or not, whatever it's made of.
    if (edgeLine !== undefined) for (const side of [-1, 1]) strip(edges, i, j, side * (hwi - 0.3 - edgeWidth), side * (hwi - 0.3), side * (hwj - 0.3 - edgeWidth), side * (hwj - 0.3));
    if (paintable.has(surface)) {
      if (edgeLine === undefined) for (const side of [-1, 1]) strip(lines, i, j, side * (hwi - 0.55), side * (hwi - 0.3), side * (hwj - 0.55), side * (hwj - 0.3));
      // Dashes: 3 m on, 3 m off, on roads wide enough to have lanes.
      if (hwi > 5.5 && Math.floor(sp.dist[i] / 3) % 2 === 0) strip(dashes, i, j, -0.12, 0.12);
    }
    if (wearable.has(surface)) {
      const ci = line[i] * hwi;
      const cj = line[j] * hwj;
      strip(rubber, i, j, ci - 1.4, ci + 1.4, cj - 1.4, cj + 1.4);
    }
  }
  const mesh = (pos: number[], mat: THREE.Material) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 1;
    return m;
  };
  const decal = { side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  const paintColor = decor === 'desert' ? 0xfff0b0 : 0xf4f4f0;
  if (lines.length) g.add(mesh(lines, new THREE.MeshLambertMaterial({ color: paintColor, ...decal })));
  if (edges.length) g.add(mesh(edges, new THREE.MeshBasicMaterial({ color: edgeLine, ...decal })));
  if (dashes.length) g.add(mesh(dashes, new THREE.MeshLambertMaterial({ color: 0xffd23a, ...decal })));
  if (rubber.length) {
    const sandy = decor === 'desert' || decor === 'lagoon';
    g.add(mesh(rubber, new THREE.MeshBasicMaterial({ color: sandy ? 0x6a4a2a : 0x0a0a0e, transparent: true, opacity: sandy ? 0.12 : 0.15, ...decal })));
  }
  return g;
}

// ---- Edge posts and lights ----------------------------------------------------

/** Posts, torches, lamps or floating stars along the open edges of every road. */
function edgeProps(ribbons: Ribbon[], style: DetailStyle, abyss: boolean, clear: (x: number, z: number, m: number) => boolean, animated: ((time: number) => void)[]): THREE.Group {
  const g = new THREE.Group();
  const e = style.edge;
  const spots: { x: number; y: number; z: number; heading: number }[] = [];
  for (const r of ribbons) {
    const sp = r.spline;
    let last = -Infinity;
    for (let i = 0; i < sp.count; i++) {
      if (sp.dist[i] - last < e.spacing || r.wallHeight[i] > 0 || r.inGap(sp.dist[i]) || r.inGap(sp.dist[i] + 3) || r.inGap(sp.dist[i] - 3)) continue;
      last = sp.dist[i];
      const deck = abyss || !!r.def.sections[r.sectionIndex[i]]?.bridge;
      for (const side of [-1, 1]) {
        const lat = side * (r.halfWidth[i] + (deck ? 0.35 : CURB_WIDTH + 1.0));
        const x = sp.px[i] - sp.tz[i] * lat;
        const z = sp.pz[i] + sp.tx[i] * lat;
        // Not in the middle of another stretch of road.
        if (!clear(x, z, 0.4)) continue;
        spots.push({ x, y: r.heightAt(sp.dist[i]), z, heading: Math.atan2(sp.tx[i], sp.tz[i]) });
      }
    }
  }
  if (!spots.length) return g;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, place: (k: number) => THREE.Vector3, yawed = false) => {
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    spots.forEach((s, k) => {
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yawed ? s.heading : 0);
      m4.compose(place(k), q, one);
      mesh.setMatrixAt(k, m4);
    });
    g.add(mesh);
    return mesh;
  };
  const post = new THREE.MeshLambertMaterial({ color: e.color });
  const band = new THREE.MeshLambertMaterial({ color: e.stripe });
  const tops: THREE.Vector3[] = [];
  const h = e.height;
  switch (e.kind) {
    case 'pole':
      instanced(new THREE.CylinderGeometry(0.07, 0.08, h, 6).translate(0, h / 2, 0), post, (k) => v.set(spots[k].x, spots[k].y, spots[k].z));
      instanced(new THREE.CylinderGeometry(0.085, 0.085, h * 0.22, 6).translate(0, h * 0.72, 0), band, (k) => v.set(spots[k].x, spots[k].y, spots[k].z));
      break;
    case 'fence': {
      // Weathered square posts with pale caps.
      instanced(new THREE.BoxGeometry(0.18, h, 0.18).translate(0, h / 2, 0), post, (k) => v.set(spots[k].x, spots[k].y, spots[k].z), true);
      instanced(new THREE.BoxGeometry(0.22, 0.1, 0.22).translate(0, h, 0), band, (k) => v.set(spots[k].x, spots[k].y, spots[k].z), true);
      break;
    }
    case 'torch':
      instanced(new THREE.CylinderGeometry(0.08, 0.12, h, 6).translate(0, h / 2, 0), post, (k) => v.set(spots[k].x, spots[k].y, spots[k].z));
      instanced(new THREE.CylinderGeometry(0.28, 0.14, 0.3, 8).translate(0, h + 0.1, 0), band, (k) => v.set(spots[k].x, spots[k].y, spots[k].z));
      spots.forEach((s) => tops.push(new THREE.Vector3(s.x, s.y + h + 0.45, s.z)));
      break;
    case 'lamp': {
      // A street lamp leaning its head over the road.
      instanced(new THREE.CylinderGeometry(0.1, 0.14, h, 8).translate(0, h / 2, 0), post, (k) => v.set(spots[k].x, spots[k].y, spots[k].z));
      const roadward = (k: number) => {
        const s = spots[k];
        const hit = ribbons.map((rb) => nearestOnSpline(rb.spline, s.x, s.z)).sort((a, b) => a.distance - b.distance)[0];
        // Back across toward the centreline: the right of travel is (-tz, tx).
        const l = Math.hypot(hit.tx, hit.tz) || 1;
        const toward = -Math.sign(hit.lateral);
        return [(toward * -hit.tz) / l, (toward * hit.tx) / l];
      };
      const dirs = spots.map((_, k) => roadward(k));
      const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 1.4).translate(0, 0, 0.7), post, spots.length);
      spots.forEach((s, k) => {
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(dirs[k][0], dirs[k][1]));
        m4.compose(v.set(s.x, s.y + h, s.z), q, one);
        arm.setMatrixAt(k, m4);
        tops.push(new THREE.Vector3(s.x + dirs[k][0] * 1.35, s.y + h - 0.15, s.z + dirs[k][1] * 1.35));
      });
      g.add(arm);
      break;
    }
    case 'buoy':
      instanced(new THREE.CylinderGeometry(0.12, 0.14, h, 8).translate(0, h / 2, 0), post, (k) => v.set(spots[k].x, spots[k].y, spots[k].z));
      instanced(new THREE.CylinderGeometry(0.15, 0.15, h * 0.3, 8).translate(0, h * 0.5, 0), band, (k) => v.set(spots[k].x, spots[k].y, spots[k].z));
      instanced(new THREE.SphereGeometry(0.17, 8, 6).translate(0, h + 0.05, 0), band, (k) => v.set(spots[k].x, spots[k].y, spots[k].z));
      break;
    case 'star': {
      // Little stars bobbing just off the deck edge.
      const stars = instanced(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: e.color }), (k) => v.set(spots[k].x, spots[k].y + h, spots[k].z));
      spots.forEach((s) => tops.push(new THREE.Vector3(s.x, s.y + h, s.z)));
      animated.push((time) => {
        spots.forEach((s, k) => {
          q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, time * 1.5 + k);
          m4.compose(v.set(s.x, s.y + h + Math.sin(time * 2 + k * 0.7) * 0.25, s.z), q, one);
          stars.setMatrixAt(k, m4);
        });
        stars.instanceMatrix.needsUpdate = true;
      });
      break;
    }
  }
  if (style.light !== undefined && tops.length) {
    // All the lamps in one draw: additive point sprites that flicker (torches) or breathe (lamps, stars).
    const geo = new THREE.BufferGeometry().setFromPoints(tops);
    const mat = new THREE.PointsMaterial({
      map: tex.glowTexture(),
      color: style.light,
      size: e.kind === 'lamp' ? 5 : 2.6,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    g.add(new THREE.Points(geo, mat));
    const base = mat.size;
    const flicker = e.kind === 'torch';
    animated.push((time) => {
      // The final lap: every light along the road pulses to the beat.
      const pulse = atmosphere.finalLap * (0.35 + 0.35 * Math.sin(time * 8));
      mat.size = base * ((flicker ? 0.85 + Math.sin(time * 17) * 0.08 + Math.sin(time * 29) * 0.07 : 0.95 + Math.sin(time * 1.6) * 0.05) + pulse);
    });
    if (e.kind === 'lamp') {
      // Alternate pink and cyan heads on the city lamps.
      const cyan = new THREE.Points(new THREE.BufferGeometry().setFromPoints(tops.filter((_, k) => k % 2)), mat.clone());
      (cyan.material as THREE.PointsMaterial).color.setHex(0x3adcff);
      g.add(cyan);
    }
  }
  return g;
}

// ---- Corner boards ------------------------------------------------------------

/** Red chevron boards on the outside of every tight bend, facing the oncoming karts. */
function cornerBoards(ribbons: Ribbon[], abyss: boolean, clear: (x: number, z: number, m: number) => boolean): THREE.Group {
  const g = new THREE.Group();
  const spots: { x: number; y: number; z: number; yaw: number; flip: number }[] = [];
  for (const r of ribbons) {
    const sp = r.spline;
    let last = -Infinity;
    for (let i = 0; i < sp.count; i++) {
      const k = r.curvature[i];
      if (Math.abs(k) < 0.04 || sp.dist[i] - last < 9 || r.wallHeight[i] > 0 || r.inGap(sp.dist[i])) continue;
      if (abyss || r.def.sections[r.sectionIndex[i]]?.bridge) continue;
      last = sp.dist[i];
      // Outside of the bend: right (positive lateral) for a left turn.
      const lat = Math.sign(k) * (r.halfWidth[i] + CURB_WIDTH + 2.4);
      const x = sp.px[i] - sp.tz[i] * lat;
      const z = sp.pz[i] + sp.tx[i] * lat;
      if (!clear(x, z, 1)) continue;
      // Face back down the road, leaning a little toward the karts coming at it.
      const yaw = Math.atan2(sp.tx[i], sp.tz[i]) + Math.PI + Math.sign(k) * 0.35;
      spots.push({ x, y: r.heightAt(sp.dist[i]), z, yaw, flip: k > 0 ? 1 : -1 });
    }
  }
  if (!spots.length) return g;
  const boards = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(2.2, 1.1).translate(0, 1.35, 0),
    new THREE.MeshLambertMaterial({ map: tex.chevronSignTexture(), side: THREE.DoubleSide }),
    spots.length,
  );
  const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.8, 0.08).translate(0, 0.4, -0.05), new THREE.MeshLambertMaterial({ color: 0x3a3a40 }), spots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  spots.forEach((s, k) => {
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, s.yaw);
    // Chevrons point the way the road turns: mirror the board for one direction.
    m4.compose(v.set(s.x, s.y, s.z), q, new THREE.Vector3(s.flip, 1, 1));
    boards.setMatrixAt(k, m4);
    m4.compose(v.set(s.x, s.y, s.z), q, new THREE.Vector3(1, 1, 1));
    legs.setMatrixAt(k, m4);
  });
  g.add(boards, legs);
  return g;
}

// ---- Grandstand ---------------------------------------------------------------

/** A covered grandstand beside the start straight, packed with a crowd under waving flags. */
function grandstand(track: Track, theme: Theme, clear: (x: number, z: number, m: number) => boolean, animated: ((time: number) => void)[]): THREE.Group | null {
  const r = track.main;
  const sp = r.spline;
  const len = 28;
  const depth = 9;
  // Try a few spots back from the line, either side, until one is clear of every road.
  for (const sBack of [40, 70, 20, 100]) {
    for (const side of [1, -1]) {
      const s = (sp.length - sBack + sp.length) % sp.length;
      const i = Math.round((s / sp.length) * (sp.closed ? sp.count : sp.count - 1)) % sp.count;
      const hw = r.halfWidth[i];
      const off = hw + CURB_WIDTH + 6 + depth / 2;
      const fx = sp.tx[i];
      const fz = sp.tz[i];
      const cx = sp.px[i] - fz * side * off;
      const cz = sp.pz[i] + fx * side * off;
      let ok = true;
      for (const a of [-1, 0, 1]) for (const b of [-1, 1]) ok &&= clear(cx + fx * a * (len / 2) - fz * side * b * (depth / 2), cz + fz * a * (len / 2) + fx * side * b * (depth / 2), 3);
      if (!ok || r.heightAt(sp.dist[i]) > 0.5) continue;
      return buildStand(cx, cz, Math.atan2(fx, fz) + (side > 0 ? -Math.PI / 2 : Math.PI / 2), len, depth, theme, animated);
    }
  }
  return null;
}

export function buildStand(x: number, z: number, yaw: number, len: number, depth: number, theme: Theme, animated: ((time: number) => void)[], tiers = 5): THREE.Group {
  const g = new THREE.Group();
  const concrete = new THREE.MeshLambertMaterial({ map: theme.cliff() });
  const steel = new THREE.MeshPhongMaterial({ color: 0xd8dde8, shininess: 80, specular: 0xffffff });
  const rise = 0.9;
  const tread = depth / tiers;
  // The stand faces local +z (toward the road); tiers step up toward the back.
  for (let k = 0; k < tiers; k++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(len, rise * (k + 1), tread), concrete);
    step.position.set(0, (rise * (k + 1)) / 2, depth / 2 - tread * (k + 0.5));
    g.add(step);
  }
  // A roof on posts, with a striped fascia.
  const top = rise * tiers + 4.5;
  for (const px of [-len / 2 + 0.5, 0, len / 2 - 0.5]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.35, top, 0.35), steel);
    p.position.set(px, top / 2, -depth / 2 + 0.3);
    g.add(p);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 1, 0.3, depth + 1.5), steel);
  roof.position.set(0, top, 0.4);
  roof.rotation.x = -0.12;
  g.add(roof);
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(len + 1, 0.9, 0.2), new THREE.MeshLambertMaterial({ map: tex.curbTexture() }));
  (fascia.material as THREE.MeshLambertMaterial).map!.repeat.set(len / 2, 1);
  fascia.position.set(0, top - 0.6, depth / 2 + 1.1);
  g.add(fascia);

  // The crowd: a body and a head per seat, every one a different shirt.
  const perRow = Math.floor(len / 0.9);
  const count = perRow * tiers;
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.7, 0.4), new THREE.MeshLambertMaterial(), count);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshLambertMaterial(), count);
  const rand = seededRandom(91);
  const shirts = [0xff5a7a, 0xffa64a, 0xffe45a, 0x6aef7a, 0x4ad0ff, 0x7a7aff, 0xc86aff, 0xffffff, 0x2a2a2a];
  const skins = [0xf0c8a0, 0xd8a070, 0xa06a40, 0x6a4028, 0x8fbf5a, 0xb89aff];
  const seats: { x: number; y: number; z: number; ph: number }[] = [];
  const c = new THREE.Color();
  for (let k = 0; k < tiers; k++) {
    for (let p = 0; p < perRow; p++) {
      if (rand() < 0.08) continue;
      const n = seats.length;
      seats.push({ x: -len / 2 + 0.6 + p * 0.9 + (rand() - 0.5) * 0.2, y: rise * (k + 1) + 0.35, z: depth / 2 - tread * (k + 0.5), ph: rand() * Math.PI * 2 });
      bodies.setColorAt(n, c.setHex(shirts[Math.floor(rand() * shirts.length)]));
      heads.setColorAt(n, c.setHex(skins[Math.floor(rand() * skins.length)]));
    }
  }
  bodies.count = heads.count = seats.length;
  const m4 = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const place = (time: number) => {
    seats.forEach((s, k) => {
      // Everyone bounces a little, on their own beat.
      const hop = Math.max(0, Math.sin(time * 5 + s.ph)) * 0.12;
      bodies.setMatrixAt(k, m4.makeTranslation(v.set(s.x, s.y + hop, s.z)));
      heads.setMatrixAt(k, m4.makeTranslation(v.set(s.x, s.y + 0.55 + hop, s.z)));
    });
    bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  };
  place(0);
  g.add(bodies, heads);
  animated.push(place);

  // Flags along the roof line.
  const flags: THREE.Mesh[] = [];
  const flagColors = [0xff3a6a, 0xffd23a, 0x3adcff, 0x7aff9a];
  const nFlags = Math.max(2, Math.round(len / 5.6));
  for (let k = 0; k < nFlags; k++) {
    const fx = -len / 2 + (k + 0.5) * (len / nFlags);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), steel);
    pole.position.set(fx, top + 1.5, depth / 2 + 0.4);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8, 6, 1).translate(0.7, 0, 0), new THREE.MeshLambertMaterial({ color: flagColors[k % flagColors.length], side: THREE.DoubleSide }));
    flag.position.set(fx + 0.05, top + 2.6, depth / 2 + 0.4);
    flags.push(flag);
    g.add(pole, flag);
  }
  const base = (flags[0].geometry.getAttribute('position') as THREE.BufferAttribute).array.slice();
  animated.push((time) => {
    // On the final lap the flags go wild.
    const wave = 6 + atmosphere.finalLap * 6;
    flags.forEach((f, k) => {
      const pos = f.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const fx = base[i * 3];
        pos.setZ(i, Math.sin(fx * 3 - time * wave + k) * (0.18 + atmosphere.finalLap * 0.08) * fx);
      }
      pos.needsUpdate = true;
    });
  });

  g.position.set(x, 0, z);
  g.rotation.y = yaw;
  return g;
}

// ---- Billboards ---------------------------------------------------------------

/** Big slogan boards back from the road, angled toward the karts coming at them. */
function billboards(track: Track, style: DetailStyle, clear: (x: number, z: number, m: number) => boolean): THREE.Group {
  const g = new THREE.Group();
  const words = style.boards.words;
  if (!words.length) return g;
  const r = track.main;
  const sp = r.spline;
  const rand = seededRandom(sp.count + 3);
  const want = Math.max(4, Math.round(sp.length / 260));
  const legMat = new THREE.MeshLambertMaterial({ color: 0x3a3a40 });
  const backMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  let placed = 0;
  for (let k = 0; k < want * 3 && placed < want; k++) {
    const i = Math.floor(((k + rand() * 0.5) / (want * 3)) * sp.count) % sp.count;
    // Only on the straighter bits, where there's time to read it.
    if (Math.abs(r.curvature[i]) > 0.02 || r.inGap(sp.dist[i])) continue;
    const side = rand() < 0.5 ? -1 : 1;
    const lat = side * (r.halfWidth[i] + CURB_WIDTH + 10 + rand() * 6);
    const x = sp.px[i] - sp.tz[i] * lat;
    const z = sp.pz[i] + sp.tx[i] * lat;
    if (!clear(x, z, 7)) continue;
    const word = words[placed % words.length];
    const map = tex.billboardTexture(word, style.boards.bg[placed % style.boards.bg.length], style.boards.fg);
    const b = new THREE.Group();
    const face = new THREE.Mesh(new THREE.BoxGeometry(9, 3.4, 0.25), [backMat, backMat, backMat, backMat, new THREE.MeshBasicMaterial({ map }), backMat]);
    face.position.y = 4.6;
    b.add(face);
    for (const lx of [-3, 3]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 0.3), legMat);
      leg.position.set(lx, 1.5, -0.2);
      b.add(leg);
    }
    // A row of spotlights along the top.
    for (let s = -1; s <= 1; s++) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.3, 8), legMat);
      lamp.position.set(s * 3, 6.5, 0.4);
      lamp.rotation.x = 0.8;
      b.add(lamp);
    }
    b.position.set(x, 0, z);
    // Face the oncoming traffic, turned in toward the road.
    b.rotation.y = Math.atan2(sp.tx[i], sp.tz[i]) + Math.PI - side * 0.5;
    g.add(b);
    placed++;
  }
  return g;
}

// ---- Ground cover -------------------------------------------------------------

/** A clump of five thin blades splayed out from one root. */
function tuftGeometry(): THREE.BufferGeometry {
  const blades = Array.from({ length: 5 }, (_, k) => {
    const a = (k / 5) * Math.PI * 2;
    const h = 0.55 + (k % 3) * 0.15;
    return new THREE.ConeGeometry(0.06, h, 3)
      .translate(0, h / 2, 0)
      .rotateX(Math.cos(a) * 0.45)
      .rotateZ(Math.sin(a) * 0.45)
      .translate(Math.sin(a) * 0.08, 0, Math.cos(a) * 0.08);
  });
  return mergeGeometries(blades)!;
}

/** Tufts, pebbles or ice crystals thick near the road and thinning out, for a sense of speed. */
function groundCover(track: Track, style: DetailStyle, clear: (x: number, z: number, m: number) => boolean): THREE.InstancedMesh {
  const c = style.cover;
  const geo =
    c.shape === 'tuft'
      ? tuftGeometry()
      : c.shape === 'crystal'
        ? new THREE.OctahedronGeometry(0.3, 0).scale(1, 2, 1).translate(0, 0.3, 0)
        : new THREE.DodecahedronGeometry(0.28, 0).scale(1, 0.6, 1);
  const mat = new THREE.MeshLambertMaterial({ flatShading: true, ...(c.shape === 'crystal' ? { emissive: 0x203040 } : {}) });
  const count = Math.round(c.count * densityScale());
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const rand = seededRandom(17);
  const r = track.main;
  const sp = r.spline;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  let n = 0;
  for (let tries = 0; tries < count * 3 && n < count; tries++) {
    const i = Math.floor(rand() * sp.count);
    const side = rand() < 0.5 ? -1 : 1;
    const lat = side * (r.halfWidth[i] + CURB_WIDTH + 0.6 + rand() * rand() * 30);
    const x = sp.px[i] - sp.tz[i] * lat + (rand() - 0.5) * 2;
    const z = sp.pz[i] + sp.tx[i] * lat + (rand() - 0.5) * 2;
    if (r.heightAt(sp.dist[i]) > 0.3 || !clear(x, z, CURB_WIDTH + 0.3)) continue;
    // Tufts come in clumps of blades; everything gets a random turn and size.
    const k = 0.6 + rand() * 0.9;
    e.set(c.shape === 'tuft' ? (rand() - 0.5) * 0.5 : rand() * 3, rand() * 6, c.shape === 'tuft' ? (rand() - 0.5) * 0.5 : 0);
    q.setFromEuler(e);
    m4.compose(v.set(x, 0, z), q, s.set(k, k * (0.7 + rand() * 0.6), k));
    mesh.setMatrixAt(n, m4);
    mesh.setColorAt(n, col.setHex(c.colors[Math.floor(rand() * c.colors.length)]));
    n++;
  }
  mesh.count = n;
  return mesh;
}
