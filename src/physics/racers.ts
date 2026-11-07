import { seededRandom } from '../core/math';

/** Racer stats on a 1..5 scale (spec section 5). */
export interface RacerStats {
  speed: number;
  accel: number;
  weight: number;
  handling: number;
  drift: number;
}

export interface RacerDef {
  id: string;
  name: string;
  stats: RacerStats;
  color: number;
  accent: number;
  /** One line of who they are in the Gizzverse, for the picker. */
  bio: string;
  /** A story suite's boss (its suite id): locked until beaten there (core/progress.ts bossUnlocked). */
  boss?: string;
}

/** The story suites with a boss at the end, by id: for "Beat <suite> to unlock". */
export const BOSS_SUITES: Readonly<Record<string, string>> = {
  'mind-fuzz': 'The Mind Fuzz Suite',
  'nonagon-infinity': 'Nonagon Infinity',
  'altered-beast': 'The Tale of the Altered Beast',
  'lord-of-lightning': 'The Lord of Lightning vs. Balrog',
  'han-tyumi': 'Han-Tyumi and the Murder of the Universe',
  polygondwanaland: 'Polygondwanaland',
  'infest-the-rats-nest': "Infest the Rats' Nest",
  'petrodragonic-apocalypse': 'PetroDragonic Apocalypse',
};

/** What a locked boss's tile says: "Beat <suite name> to unlock". */
export function bossLockNote(r: RacerDef): string {
  return r.boss ? `Beat ${BOSS_SUITES[r.boss] ?? r.boss} to unlock` : '';
}

export const RACERS: readonly RacerDef[] = [
  { id: 'lizard-warlock', name: 'Lizard Wizard', stats: { speed: 3, accel: 3, weight: 3, handling: 3, drift: 4 }, color: 0x3fa34d, accent: 0x7a3fbf, bio: 'Robed reptile mage from the castle on the misty mountain, hot rod and all' },
  { id: 'cyborg-gourmand', name: 'Han-Tyumi', stats: { speed: 4, accel: 2, weight: 4, handling: 2, drift: 3 }, color: 0x9aa4b1, accent: 0xd1342f, bio: 'The confused cyborg, last of the naturally born, gone fishing for fishies in a leaky dinghy on wheels' },
  { id: 'gila-rider', name: 'Gila Rider', stats: { speed: 3, accel: 5, weight: 2, handling: 3, drift: 3 }, color: 0xe0702a, accent: 0x222222, bio: 'Keeper of the Gila Monster, running it flat out before the candle falls' },
  { id: 'swamp-witch', name: 'Beowulf\'s Witch', stats: { speed: 3, accel: 2, weight: 3, handling: 5, drift: 4 }, color: 0x2f6f5e, accent: 0xb7d14a, bio: 'Survivor of the Witchcraft ritual, with Beowulf the black cat on the dash: the one who knocked the candle over' },
  { id: 'microtonal-monk', name: 'Microtonal Monk', stats: { speed: 3, accel: 3, weight: 2, handling: 4, drift: 3 }, color: 0xe3a72f, accent: 0x7b2230, bio: 'One of the seven robed, floating on the lotus a quarter tone above the road' },
  { id: 'fuzz-golem', name: 'Fuzz Golem', stats: { speed: 5, accel: 1, weight: 5, handling: 1, drift: 3 }, color: 0xc23b8c, accent: 0xffcc33, bio: 'A lump of pure Mind Fuzz, slow to get going and impossible to stop' },
  { id: 'neon-moth', name: 'Blue Morpho', stats: { speed: 2, accel: 5, weight: 2, handling: 4, drift: 5 }, color: 0x3ad8ff, accent: 0xff5ad0, bio: 'Fresh out of the Butterfly 3000 chrysalis, falling upwards through clouds of glue' },
  { id: 'cosmic-coyote', name: 'Mad Dog Morgan', stats: { speed: 4, accel: 2, weight: 3, handling: 2, drift: 3 }, color: 0x2a2a6a, accent: 0xff9a1f, bio: 'The bushranger of Billabong Valley, gone to space in a rocket roadster' },
  { id: 'mantis-shredder', name: 'Mantis Shredder', stats: { speed: 3, accel: 4, weight: 2, handling: 3, drift: 4 }, color: 0x9ad83a, accent: 0xff3a6a, bio: 'A fret-board mantis from the Polygondwanaland canopy, shredding on one wheel' },
  { id: 'gator-drummer', name: 'Gator', stats: { speed: 4, accel: 2, weight: 4, handling: 2, drift: 3 }, color: 0xb8202a, accent: 0xf2e6c8, bio: 'The croc from the Invisible Face voyage, master of the Evil Death Roll' },
  { id: 'mushroom-sage', name: 'Mushroom Sage', stats: { speed: 3, accel: 3, weight: 2, handling: 4, drift: 4 }, color: 0x7a5adf, accent: 0xf4e8d0, bio: 'Mycelium mystic who knows the secret of the Fourth Colour' },
  { id: 'arlo', name: 'Arlo', stats: { speed: 3, accel: 4, weight: 2, handling: 4, drift: 3 }, color: 0xd09a62, accent: 0x3a4250, bio: 'An apricot standard poodle, booked on Flight b741 for when pigs fly' },
  { id: 'flying-pig', name: 'Flying Pig', stats: { speed: 3, accel: 4, weight: 3, handling: 3, drift: 3 }, color: 0xf49ab0, accent: 0x2a6ad0, bio: 'Captain of Flight b741, goggles up, scarf out: the day pigs fly is today, and every hog for miles answers the call' },
  { id: 'skeleton-dragon', name: 'Skeleton Dragon', stats: { speed: 4, accel: 3, weight: 2, handling: 3, drift: 4 }, color: 0xece2c8, accent: 0xff6a1a, bio: 'The dragon of the PetroDragonic Apocalypse, picked clean and flying on regardless: horns, bones and a furnace for a heart' },
  { id: 'lord-of-lightning', name: 'Lord of Lightning', stats: { speed: 5, accel: 2, weight: 3, handling: 2, drift: 4 }, color: 0x2e2a7a, accent: 0xfff27a, bio: 'The storm wizard of Murder of the Universe, who sways the lightning and rides it: staff up, beard out, down the road on a bolt' },
  { id: 'rattlesnake', name: 'Rattlesnake', stats: { speed: 3, accel: 4, weight: 2, handling: 4, drift: 4 }, color: 0x9a6a38, accent: 0xe8d4a0, bio: 'Off Flying Microtonal Banana: a diamondback slithering down the road, rattling in a quarter tone' },
  { id: 'octo-organist', name: 'Kraken', stats: { speed: 4, accel: 2, weight: 3, handling: 2, drift: 3 }, color: 0xff7aa8, accent: 0x2ad8b0, bio: 'Up from Open Water at the keys of a steam pipe-organ, dragging sailors under' },
  // The band.
  { id: 'ambrose-kenny-smith', name: 'Amby', stats: { speed: 3, accel: 5, weight: 2, handling: 3, drift: 3 }, color: 0x2a8ad8, accent: 0xff5a3a, bio: 'Harmonica raised, boogie in the blood: Boogieman Sam\'s own' },
  { id: 'michael-cavanagh', name: 'Cavs', stats: { speed: 4, accel: 2, weight: 3, handling: 2, drift: 3 }, color: 0x1a3a6a, accent: 0xffd23a, bio: 'Rolling on two bass drums, sticks up, a Road Train with no brakes' },
  { id: 'cook-craig', name: 'Cookie', stats: { speed: 3, accel: 2, weight: 3, handling: 5, drift: 4 }, color: 0x3aa04a, accent: 0xffe14d, bio: 'Keytar, guitar and keyboard in one deck, with a Gamma Knife on the neck' },
  { id: 'jason-galea', name: 'Jason', stats: { speed: 3, accel: 4, weight: 2, handling: 3, drift: 4 }, color: 0x1a1a22, accent: 0x3adcff, bio: 'The band\'s visual artist on a rolling lighting rig, painting the Gizzverse as it goes' },
  { id: 'joey-walker', name: 'Joey', stats: { speed: 3, accel: 3, weight: 2, handling: 4, drift: 3 }, color: 0xe85a9a, accent: 0x3adcff, bio: 'A modular-synth buggy patched up with the Silver Cord, signed Yikes' },
  { id: 'lucas-harwood', name: 'Lukey', stats: { speed: 4, accel: 2, weight: 4, handling: 2, drift: 3 }, color: 0x8a5a3a, accent: 0xd84a2a, bio: 'An 8x10 bass cab on wheels: superheavy, supercritical low end' },
  { id: 'stu-mackenzie', name: 'Stu', stats: { speed: 3, accel: 3, weight: 3, handling: 3, drift: 4 }, color: 0xf4d23a, accent: 0x7a2a8a, bio: 'On the Flying Microtonal Banana, a flute on his back for the Sleep Drifter' },
  // The story suites' bosses, each locked until beaten. Bigger and stranger than the rest, but no faster on paper: a duel's edge is the story's CPU pace.
  { id: 'mind-voice', name: 'The Voice in Your Mind', boss: 'mind-fuzz', stats: { speed: 3, accel: 3, weight: 2, handling: 5, drift: 3 }, color: 0xd83ab0, accent: 0x7aff5a, bio: 'A brain under glass with one great eye, riding a spinning spiral of fuzz: when I\'m in your mind, then I\'m in your mind' },
  { id: 'people-vulture', name: 'The People-Vulture', boss: 'nonagon-infinity', stats: { speed: 4, accel: 3, weight: 2, handling: 3, drift: 4 }, color: 0x2a2230, accent: 0xe8a0a0, bio: 'A vulture with a man\'s bald head, flying low over the road on its great black wings: waiting by your stage, crowding at your door' },
  { id: 'altered-beast', name: 'The Altered Beast', boss: 'altered-beast', stats: { speed: 4, accel: 2, weight: 5, handling: 2, drift: 3 }, color: 0x6a3a8a, accent: 0xc8ff3a, bio: 'Half made of man, half of bear: nine white teeth, a knife for a left hand and a fork for the right, trampling the earth on all fours' },
  { id: 'balrog', name: 'The Balrog', boss: 'lord-of-lightning', stats: { speed: 5, accel: 2, weight: 4, handling: 1, drift: 4 }, color: 0xc8260e, accent: 0x3a6aff, bio: 'Glowing red and lapis hot, screaming through the rift the split atom tore: it fears not the lightning lord' },
  { id: 'munt-machine', name: 'The Soy-Protein Munt Machine', boss: 'han-tyumi', stats: { speed: 3, accel: 2, weight: 5, handling: 3, drift: 3 }, color: 0xd8c08a, accent: 0x7ad83a, bio: 'Han-Tyumi\'s human machine, made with steel and soy-protein: born from a test tube and into a vat, to live and to heave' },
  { id: 'castle-king', name: 'The King of the Castle in the Air', boss: 'polygondwanaland', stats: { speed: 4, accel: 2, weight: 4, handling: 3, drift: 3 }, color: 0x5a4ac8, accent: 0xffd84a, bio: 'His head grows beneath his shoulders: smooth sailing through the castle in the air, over the monopods and the one-eyed people' },
  { id: 'the-devil', name: 'The Devil', boss: 'infest-the-rats-nest', stats: { speed: 4, accel: 4, weight: 3, handling: 2, drift: 3 }, color: 0xb0141e, accent: 0xffa81a, bio: 'Pretty hot down here undersurface: up through the amber door to hell on wings and tail and spines, a thousand flies behind him' },
  { id: 'coven-mother', name: 'The Mother of the Coven', boss: 'petrodragonic-apocalypse', stats: { speed: 3, accel: 3, weight: 2, handling: 4, drift: 4 }, color: 0x2a1a3a, accent: 0xff3a3a, bio: 'Antlers draped in ribbons, the blood-moon at her hand and her charged crystals swinging from the broom: witchcraft' },
];

/** Karts in one race: the player (or the room's players) and CPUs drawn from the roster. */
export const FIELD_SIZE = 12;

/**
 * `count` racers not in `taken`, drawn and ordered by `seed`: a seed always
 * draws the same rivals. Bosses only where `boss` lets them in (the ones
 * this player has beaten: core/progress.ts bossUnlocked); none by default,
 * so a room's server never puts one on anyone's grid.
 */
export function pickRivals(taken: ReadonlySet<string>, count: number, seed: number, boss: (r: RacerDef) => boolean = () => false): RacerDef[] {
  const pool = RACERS.filter((r) => !taken.has(r.id) && (!r.boss || boss(r)));
  const rand = seededRandom(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, count));
}

export type EngineClass = '50cc' | '100cc' | '150cc' | '200cc';
/** Every class; 200cc is unlocked by a gold at 150cc (core/progress.ts). */
export const ENGINE_CLASSES: readonly EngineClass[] = ['50cc', '100cc', '150cc', '200cc'];
const CLASS_SPEED: Record<EngineClass, number> = { '50cc': 0.8, '100cc': 1, '150cc': 1.15, '200cc': 1.3 };

/** Derived physical tuning for one kart. */
export interface KartParams {
  topSpeed: number; // m/s
  accel: number; // m/s^2 from standstill
  turnRate: number; // rad/s at full steer
  driftTurnRate: number; // rad/s baseline while drifting
  driftChargeRate: number; // charge seconds per real second at neutral steer bias
  mass: number; // relative, for bump knockback
  /** How far the kart skids wide of its nose through a turn or a drift, as a share of the surface's own slide: handling 3 is 1, handling 1 a fifth more, handling 5 a fifth less. */
  slide: number;
}

export function kartParams(stats: RacerStats, engine: EngineClass): KartParams {
  const m = CLASS_SPEED[engine];
  return {
    // Each stat point is worth about the same lap time, so no stat dominates.
    topSpeed: (30.9 + 0.9 * stats.speed) * m,
    accel: (6 + 3.6 * stats.accel) * m,
    turnRate: 1.45 + 0.34 * stats.handling,
    driftTurnRate: 1.35 + 0.22 * stats.handling,
    driftChargeRate: 0.75 + 0.09 * stats.drift,
    mass: 0.9 + 0.06 * stats.weight,
    slide: 1.3 - 0.1 * stats.handling,
  };
}
