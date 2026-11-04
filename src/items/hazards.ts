import { KART_RADIUS, TRICK_WINDOW, spinOut, wobble, type KartState } from '../physics/kart';
import { pointAt } from '../tracks/spline';
import type { HazardDef, Track } from '../tracks/track';

export type HazardKind = HazardDef['kind'];

/** Where one hazard is at a moment of race time. Recomputed every tick. */
export interface HazardPose {
  kind: HazardKind;
  x: number;
  y: number;
  z: number;
  /** Facing (physics convention) for snakes and tumbleweeds; road heading otherwise. */
  heading: number;
  radius: number;
  /** Road height under the hazard. */
  ground: number;
  /** Road centerline point it sits across from (vine anchors). */
  ax: number;
  az: number;
  /** Velocity over the last update, m/s. */
  vx: number;
  vz: number;
  /** Can hit karts right now. */
  active: boolean;
  /** Which way across the road it goes, 1 (to the right) or -1: a gust's direction; a crane's magnet, the edge it switches on at; a rocky meteor, its lane (-1 left, 0 the middle, 1 right). 0 when it doesn't matter. */
  side: number;
  /**
   * An airlock's opening: half the width between its two doors, centred on
   * the pose. Cellophane: how far each sheet is from the pose, signed (the
   * first sheet is at -gap, the second at +gap). The sun: its lateral (the
   * moon is at -gap). The plant of immortality: its lateral. Santa's
   * presents: the lateral of the roof's edge he throws them from. The
   * beast's knife and fork: the fork's lateral (the knife is the pose). A
   * beast's footfall: how far its shockwave's ring has run out from the foot.
   * The astral blacksmith's hammer: how far its sparks fly, while they do.
   * A crane's magnet: the road's half-width under its gantry. A row of
   * sleep: how thick its haze lies, 0 to 1. 0 for the rest.
   */
  gap: number;
  /** A row of arrows: the lane with no arrow in it, 0 (leftmost) to 3. The plant of immortality: 1 while it's growing there to be had, else 0. A present: 1 once it has landed open, a gift. A rocky meteor: its stage (METEOR_STAGE). -1 for the rest. A row of sleep: 1 while its rumble strip rattles, else 0. -1 for the rest. */
  lane: number;
  /**
   * Kind-specific: boulder cycle stage (0..1), tumbleweed bounce height,
   * snake slither phase, dust devil spin.
   */
  phase: number;
}

export const SNAKE_SPIN = 0.9;
export const BOULDER_SPIN = 1.1;
export const JET_SPIN = 1.0;
export const VINE_SPIN = 1.0;
export const ROLLER_SPIN = 1.0;
export const FISH_SPIN = 0.9;
export const ICE_BLOCK_SPIN = 1.0;
export const LASER_SPIN = 1.0;
/** Share of a fish's period spent in the air, crossing the road. */
export const FISH_AIR = 0.42;
const FISH_RADIUS = 1.0;
/** How high a fish arcs over the road's middle. */
const FISH_HEIGHT = 2.4;
const ICE_BLOCK_RADIUS = 1.6;
const BUTTERFLY_RADIUS = 5;
/** Sideways shove inside a butterfly swarm, m/s^2: gentler than a dust devil, but there's no ground to land on. */
export const BUTTERFLY_PUSH = 12;
/** Flame jet cycle: quiet, then sputtering (harmless), then full fire. */
export const JET_STAGES = { sputter: 0.45, fire: 0.62 } as const;
const VINE_RADIUS = 1.3;
const ROLLER_RADIUS = 1.5;
/** How far along the road a flame jet's sheet of fire reaches. */
const JET_DEPTH = 1.3;
export const TUMBLEWEED_SLOW = 0.55;
/** Sideways acceleration inside a dust devil, m/s^2. */
export const DEVIL_PUSH = 34;
const SNAKE_RADIUS = 0.7;
const SNAKE_LENGTH = 3.2;
const DEVIL_RADIUS = 4;
const TUMBLEWEED_RADIUS = 0.9;
const TUMBLEWEED_SPEED = 7;
const BOULDER_RADIUS = 1.7;
const BOULDER_DROP = 24;
const HIT_COOLDOWN = 1;
/** Sideways acceleration inside a tornado, m/s^2: a dust devil grown up. */
export const TORNADO_PUSH = 40;
const TORNADO_RADIUS = 6;
/** Pull round and into a black hole, m/s^2. */
export const HOLE_PUSH = 30;
const HOLE_RADIUS = 7;
/** Touch a black hole's core and it spins you out. */
export const HOLE_CORE = 1.6;
export const HOLE_SPIN = 1.1;
const LIGHTNING_RADIUS = 2.6;
/** Sideways shove inside a cluster of ghost lights, m/s^2: a cold draught, gentler than a dust devil. */
export const WISP_PUSH = 18;
const WISP_RADIUS = 4.5;
const STONE_RADIUS = 1.5;
export const STONE_SPIN = 1.0;
export const GLIDER_SPIN = 1.1;
export const WAVE_SPIN = 1.0;
/*
 * Hazards that help when used well (a 'good' hit, the race's 'bonus' event):
 * - a ghost light's core carries you on a boost
 * - something that has come down (a crashed plane, a lava bomb, a meteor) is a ramp, hopped onto
 * - rammed on a boost, a stone, boulder, ice block, hailstone, tumbleweed or
 *   glob of burning oil gives way and the boost runs on
 * - hopped, a snake is cleared, a leaping fish caught and a wave surfed, each for a boost
 * - a laser gate or flame jet slipped through while it's warming up is a boost
 * - hop in a dust devil or a tornado and it throws you up for a trick
 * - drifting through a butterfly swarm charges the sparks faster
 * - skimming a black hole's pull on a boost is a gravity assist
 * - a geyser erupting under a kart that hopped onto it is ridden up high, with a boost
 * - hop as Predator X snaps and you're over its jaws, on a boost
 * - a crusher slamming down just behind you throws you on in its shockwave, a boost
 * - hop as a gust blows and you catch the wind, a boost instead of a shove
 * - hop onto a vesicle and it bounces you up high, for a trick
 * - a prism beam in the fourth colour is a boost to drive through
 * - a robot stopped dead in the road is a ramp, hopped onto
 * - the gamma knife's crosshair, slipped through as it closes, is a boost
 * - hop as a vulture swoops and it carries you: up, and on with a boost
 * - a wah pedal stamped flat is a springboard, hopped onto: up high, with a boost
 * - hop into a bank of smog and its heat carries you up; blast through it on a boost and the boost runs on
 * - an airlock's slit, slipped through while the doors are shut to it, is a boost
 * - drive under a solar flare while it arches high over the road and its wind is a boost
 * - hopped, a swarm of rats is cleared for a boost; rammed on a boost they scatter and the boost runs on
 * - the half of the road an eye's arrow points to, as it reads your mind, is a boost
 * - the lane of a row of arrows that has no arrow in it, while the rest are lit, is a boost
 * - where two sheets of cellophane line up as they slide past each other, a boost
 * - a patch of fuzz driven through while its needle is in the gold is a boost
 * - the half of the road an elbow isn't thrown across, as it's thrown, is a boost
 * - the furrow a rake drags clean through the muck is a boost
 * - a close shave past a swinging razor, inches from it, is a boost
 * - hopped, a fallen tree is cleared for a boost; rammed on a boost it gives way and the boost runs on
 * - a silver cord stretched taut across the road slings you on, a boost
 * - the moon rolling across the road is a moonbeam to drive through, a boost
 * - a lightning string still humming after it's plucked is a boost
 * - the plant of immortality, reached before the snake eats it, is a long boost; the snake hopped, a boost
 * - slipped through the gap between two surveillance cameras' beams, unseen, a boost
 * - a present that lands open is a gift: a boost, and an item if your hands are empty; a shut one rammed on a boost bursts and the boost runs on
 * - the right pill tumbling across the road (its colour shows which) is a boost to drive through
 * - threaded through between the beast's knife and fork as they pull apart, a boost
 * - a breath of air caught as it rises up through the road floats you up, and you come down on a boost
 * - a jaw of nine pearl fangs driven through as it opens again after a bite is a boost
 * - hopped as it passes, the ring of a beast's footfall running across the road is a boost
 * - skirting the rim of a hollow in the road as it closes, it slings you on, a boost
 * - under a crane's magnet as it switches off, it flings you on, a boost
 * - driven through the shower of sparks off the astral blacksmith's hammer, just after it strikes, a fix: a boost
 * - tucked in behind a driverless pod, in its slipstream, it tows you on, a boost
 * - through the static wave crackling across the road in a burst of alphas' wake, a jumpstart: a boost
 * - tucked into the clean wake just behind a street sweeper as it crosses, the road it has this moment swept, a boost
 * - slipped past just behind a shark as it cuts across the shallows, through its wake, a boost
 * - hopped as it rolls down at you, a rocky meteor is cleared and you come down on a boost; rammed on a boost it bursts and the boost runs on
 * - over a rumble strip as the haze of sleep lifts off it, jolted awake: a boost
 * - under a mortal traffic light while it shows green, on the one of the waltz: go, a boost
 * - slipped through the gap just behind a pack of hellhounds as the last of them crosses, faster than a cheetah: a boost
 * - hopped onto a piston at the top of its stroke (or as it punches up), ridden: up, and on with a boost
 * - over one of Gaia's ribs as it rises with her breath, thrown on: up, and a boost
 * - through the one wanderer who isn't empty, the one you're with, drifting across the road with the empty ones: a boost
 */
/** A reward can't pay out again to the same kart for this long. */
export const REWARD_COOLDOWN = 1.5;
/** Touch a ghost light's core and it carries you: a boost this long. */
export const WISP_CORE = 1.4;
export const WISP_BOOST = 0.9;
/** What has come down is a ramp, hopped onto: it throws you up at this speed (m/s), with a trick window. */
export const RAMP_LAUNCH = 9;
/** Rammed on a boost, the boost runs on this much longer. */
export const RAM_BOOST = 0.6;
/** A hop this recent (or being in the air) counts as hopping a hazard. */
export const HOP_WINDOW = 0.35;
/** Hopped: a snake cleared or a fish caught is a boost this long; a wave surfed, longer. */
export const HOP_BOOST = 0.7;
export const WAVE_SURF = 1.1;
/** A gate slipped through as it warms up: a boost this long. */
export const GATE_BOOST = 0.7;
/** A hop this recent in a dust devil or tornado gets you thrown up, this fast (m/s). */
export const UPDRAFT_HOP = 0.3;
export const DEVIL_LIFT = 9;
export const TORNADO_LIFT = 12;
/** Drift charge gained per second in a butterfly swarm, on top of the drift's own. */
export const WING_CHARGE = 1;
/** Boost seconds gained per second skimming a black hole's pull on a boost. */
export const GRAVITY_ASSIST = 0.8;
const RAMPS = new Set<HazardKind>(['gliders', 'lavaBombs', 'meteors']);
const RAMMABLE = new Set<HazardKind>(['stones', 'rollers', 'iceBlocks', 'hail', 'oilBombs', 'boulders', 'tumbleweeds', 'crystals', 'rats', 'timber']);
const HOPPABLE = new Set<HazardKind>(['waves', 'snakes', 'fish', 'goblins', 'jaws', 'rats', 'timber']);
/** A geyser erupts for this share of its cycle, after its warning. */
export const GEYSER_ERUPT = 0.18;
const GEYSER_RADIUS = 2.8;
/** An eruption throws a kart up this fast (m/s), and slows it; hopped onto, it's ridden higher, with a boost. */
export const GEYSER_THROW = 9;
export const GEYSER_RIDE = 14;
export const GEYSER_SLOW = 0.5;
const GOBLIN_RADIUS = 0.9;
/** Predator X lunges over this share of its cycle, and its jaws reach this far. */
export const JAWS_LUNGE = 0.08;
const JAWS_RADIUS = 3.2;
const CRYSTAL_RADIUS = 1.4;
/**
 * Crusher cycle: hanging high (shaking loose from the warning on), the
 * slam, sitting on the road as a block, and hauling back up.
 */
export const CRUSHER_STAGES = { shake: 0.3, slam: 0.46, landed: 0.52, rise: 0.78 } as const;
export const CRUSHER_RADIUS = 2.4;
/** How high a crusher hangs over the road. */
export const CRUSHER_HANG = 7;
/** Caught under it: spun out and this much of your speed kept. */
export const CRUSHER_SLOW = 0.4;
export const CRUSHER_SPIN = 1.2;
/** Its shockwave reaches this far past the block, and throws a kart ahead of it on for a boost this long. */
export const SHOCKWAVE_REACH = 3.5;
export const SHOCKWAVE_BOOST = 0.8;
/** A gust gathers (a warning) and then blows over these shares of its cycle. */
export const GUST_STAGES = { gather: 0.5, blow: 0.68 } as const;
/** How hard a gust shoves a kart across the road, m/s (it dies away like a bump). */
export const GUST_SHOVE = 15;
/** Hop as it blows and you catch the wind: a boost this long. */
export const GUST_BOOST = 0.8;
const VESICLE_RADIUS = 1.7;
/** Driven into, a vesicle bounces you back, keeping this much of your speed; hopped onto, it bounces you this high (m/s). */
export const VESICLE_SLOW = 0.55;
export const VESICLE_BOUNCE = 11;
/** A prism beam's four colours each get a quarter of its cycle, lit over this stretch of the quarter. */
export const PRISM_LIT = [0.35, 0.7] as const;
/** The fourth colour is the last quarter's: drive through it lit for a boost this long. */
export const PRISM_BOOST = 0.9;
export const PRISM_SPIN = 1.0;
const WARMING = new Set<HazardKind>(['lasers', 'flameJets']);
/**
 * Robot cycle: marching in from one edge, stopped dead in the middle of the
 * road (a block, and a ramp if you hop onto it), marching off the other side.
 */
export const ROBOT_STAGES = { stop: 0.38, go: 0.72 } as const;
export const ROBOT_RADIUS = 1.5;
export const ROBOT_SPIN = 1.0;
/** Gamma knife cycle: the beams converge (a crosshair closing, the warning) and then the burst at the focus. */
export const GAMMA_STAGES = { aim: 0.12, fire: 0.6, done: 0.74 } as const;
/** The crosshair is nearly closed from here: slip through it then and the knife misses, a boost. */
export const GAMMA_EDGE = 0.46;
export const GAMMA_RADIUS = 2.4;
export const GAMMA_BOOST = 0.8;
export const GAMMA_SPIN = 1.1;
/** Vulture cycle: circling high (its shadow on the road), the dive, the swoop low along the road, the climb away. */
export const VULTURE_STAGES = { dive: 0.55, swoop: 0.68, climb: 0.82 } as const;
export const VULTURE_RADIUS = 1.8;
/** How high it circles, and how far along the road its swoop runs. */
export const VULTURE_HEIGHT = 16;
export const VULTURE_RUN = 14;
export const VULTURE_SPIN = 1.0;
/** Hop as it swoops and it carries you: thrown up this fast (m/s), with a boost this long. */
export const VULTURE_LIFT = 10;
export const VULTURE_BOOST = 0.8;
/** Wah pedal cycle: toe up (harmless), the stamp, sitting stamped flat (a springboard, hopped onto), rocking back up. */
export const WAH_STAGES = { stamp: 0.5, down: 0.58, rise: 0.85 } as const;
export const WAH_RADIUS = 2.6;
/** How high the toe of the pedal rocks up. */
export const WAH_LIFT = 3.2;
/** Caught under the stamp: spun out and this much of your speed kept. */
export const WAH_SLOW = 0.5;
export const WAH_SPIN = 1.1;
/** Hopped onto stamped flat: a springboard, this fast up (m/s), and a boost this long. */
export const WAH_SPRING = 12;
export const WAH_BOOST = 0.7;
/** Smog cycle: gathering at the stack on one edge (the warning), rolling across the road, thinning away. */
export const SMOG_STAGES = { roll: 0.4, clear: 0.75 } as const;
export const SMOG_RADIUS = 4;
/** Choked in it: this much of your speed kept. */
export const SMOG_SLOW = 0.55;
/** Hop into it and its heat throws you up this fast (m/s), with a trick window. */
export const SMOG_LIFT = 9;
/** Airlock cycle: open, the doors sliding in from both edges, shut to a slit, sliding back open. */
export const AIRLOCK_STAGES = { close: 0.35, shut: 0.55, open: 0.75 } as const;
/** Half the width of the slit left between the doors when they are shut, and how thick the doors are along the road. */
export const AIRLOCK_SLIT = 2.8;
export const AIRLOCK_DEPTH = 0.8;
/** Slipped through the slit while it's shut: a boost this long. Caught by a door: spun out, this much of your speed kept. */
export const AIRLOCK_BOOST = 0.8;
export const AIRLOCK_SPIN = 1.0;
export const AIRLOCK_SLOW = 0.6;
/**
 * Solar flare cycle: quiet, the footpoints glowing at both edges (the
 * warning), a low loop of plasma boiling across the road (it burns), lifting
 * into an arch high over it (drive under for a boost), then crashing back
 * down and splashing across the road (it burns again).
 */
export const FLARE_STAGES = { glow: 0.25, erupt: 0.4, lift: 0.55, arch: 0.6, fall: 0.8, land: 0.86, done: 0.92 } as const;
/** How high the flare arches, how low it boils across the road, and the height under which it burns. */
export const FLARE_HEIGHT = 8;
export const FLARE_LOW = 1.5;
export const FLARE_CLEAR = 3;
export const FLARE_BOOST = 0.9;
export const FLARE_SPIN = 1.1;
/** Rat swarm cycle: eyes in the hole at one edge (the warning), the swarm pouring across, gone. */
export const RAT_STAGES = { pour: 0.4, gone: 0.8 } as const;
/** The swarm is a stream this long across the road, this thick along it. */
export const RAT_LENGTH = 7;
export const RAT_RADIUS = 1.1;
export const RAT_SPIN = 1.0;
/**
 * Eye cycle: shut, opening over the road, an arrow flashing in it (the
 * warning: it points to the half of the road that's safe), then it reads
 * your mind and blasts the other half.
 */
export const EYE_STAGES = { open: 0.22, show: 0.34, read: 0.62, done: 0.76 } as const;
/** How far along the road the blast reaches either side of the eye, and how high the eye floats. */
export const EYE_DEPTH = 1.6;
export const EYE_HEIGHT = 4.6;
/** On the half the arrow points to as it reads: a boost this long. On the other half: spun out. */
export const EYE_BOOST = 0.8;
export const EYE_SPIN = 1.0;
/** Arrow row cycle: dark, three of the four arrows flickering on (the warning), lit (they zap), dark again. */
export const ARROW_STAGES = { show: 0.3, lit: 0.48, off: 0.76 } as const;
/** The row has four lanes across the road; it's this thick along it. */
export const ARROW_LANES = 4;
export const ARROW_DEPTH = 1;
/** Through the lane with no arrow while the rest are lit: a boost this long. Zapped: spun out, this much of your speed kept. */
export const ARROW_BOOST = 0.8;
export const ARROW_SPIN = 1.0;
export const ARROW_SLOW = 0.7;
/** Cellophane cycle: rolled at both edges (the warning), the two sheets sliding past each other right across the road, gone. */
export const SHEET_STAGES = { slide: 0.2, gone: 0.85 } as const;
/** Each sheet is this wide across the road (half of it), this thick along it. */
export const SHEET_HALF = 3;
export const SHEET_DEPTH = 0.7;
/** Wrapped in one sheet: this much of your speed kept. Through where they overlap: a boost this long. */
export const SHEET_SLOW = 0.5;
export const SHEET_BOOST = 0.9;
/**
 * Fuzz patch cycle: the needle rising (harmless), in the gold (a boost to
 * drive through), into the red (it clips: you're spun out), dying away.
 */
export const FUZZ_STAGES = { gold: 0.34, red: 0.54, fade: 0.74 } as const;
export const FUZZ_RADIUS = 3.2;
export const FUZZ_GOLD_BOOST = 0.9;
export const FUZZ_SPIN = 1.1;
export const FUZZ_SLOW = 0.7;

/**
 * Elbow cycle: the arm out of the wall at rest, cocking back (the warning:
 * it shows the half of the road it'll come across), the elbow thrown across
 * that half, and drawn back. "You know me better than to bend my elbow back."
 */
export const ELBOW_STAGES = { cock: 0.3, throw: 0.5, back: 0.7 } as const;
/** How far along the road the arm reaches, either side of where it's thrown. */
export const ELBOW_DEPTH = 1.5;
/** Past it on the other half as it's thrown: a boost this long. Elbowed: spun out, and shoved across the road this hard (m/s). */
export const ELBOW_BOOST = 0.8;
export const ELBOW_SPIN = 1.0;
export const ELBOW_SHOVE = 7;
/**
 * Muck cycle: wet road, a rake dragging along one lane (the warning: that's
 * the furrow), the other lanes heaped with muck, drying away.
 */
export const RAKE_STAGES = { drag: 0.25, muck: 0.45, dry: 0.8 } as const;
/** Four lanes across the road; the heaps are this long along it, either side. */
export const RAKE_LANES = 4;
export const RAKE_DEPTH = 1.8;
/** Down the raked furrow: a boost this long. In the muck: this much of your speed kept, no spin. */
export const RAKE_BOOST = 0.8;
export const RAKE_SLOW = 0.55;
/** A razor's blade, swinging across the road on its arm: its reach, and how close a shave counts (past the blade, inches from it). */
export const RAZOR_RADIUS = 1.3;
export const RAZOR_SHAVE = 1.4;
/** A shave counts only at speed: a kart sat beside it isn't shaving past. */
export const RAZOR_SHAVE_SPEED = 8;
export const RAZOR_BOOST = 0.8;
export const RAZOR_SPIN = 1.1;
/** Timber cycle: a tree leaning out over the road (the warning), toppling, its trunk lying across the road, gone. */
export const TIMBER_STAGES = { lean: 0.3, fall: 0.42, gone: 0.82 } as const;
export const TIMBER_SPIN = 1.0;

/**
 * Silver cord cycle: stretched taut across the road and glowing (drive
 * through and it slings you on), fraying (the warning), snapping, its two
 * ends lashing back across the road to the walls, then spun anew. "And when
 * Theia it did impact, the silver cord did snap as well."
 */
export const CORD_STAGES = { fray: 0.5, snap: 0.66, lash: 0.74, spun: 0.9 } as const;
/** How far along the road the cord's touch reaches either side of it. */
export const CORD_DEPTH = 1.6;
/** Through it while it's taut: a boost this long. Lashed: spun out. */
export const CORD_BOOST = 0.9;
export const CORD_SPIN = 1.0;
/** The sun and the moon, Set's two eyes, rolling across the road past each other: their size. */
export const SUN_RADIUS = 2.2;
/** Through the moon: a moonbeam boost this long. Touch the sun: scorched, spun and slowed. */
export const MOON_BOOST = 0.8;
export const SUN_SPIN = 1.0;
export const SUN_SLOW = 0.7;
/**
 * Lightning string cycle, each string of Chang'e's lyre in turn: dark, a
 * tremble (the warning), the pluck (a bolt right across the road, 2500
 * volts), then humming, glowing, before it fades.
 */
export const STRING_STAGES = { tremble: 0.16, pluck: 0.26, hum: 0.33, fade: 0.62 } as const;
/** The strings are plucked one after another along the road, each this share of the period after the one before: an arpeggio to ride. */
export const STRING_LAG = 0.08;
export const STRING_DEPTH = 1.2;
export const STRING_BOOST = 0.7;
export const STRING_SPIN = 1.0;
export const STRING_SLOW = 0.75;
/**
 * The plant of immortality and the snake, Gilgamesh's: the plant grows up
 * through the road, the snake slides out from one edge and across toward
 * it, eats it, and goes on over the far edge.
 */
export const SERPENT_STAGES = { sprout: 0.12, slither: 0.24, gone: 0.86 } as const;
export const PLANT_RADIUS = 1.4;
/** Reached before the snake gets it: immortality, of a sort, a long boost. Bitten: spun out. */
export const PLANT_BOOST = 1.3;
export const SERPENT_SPIN = 1.0;
export const SERPENT_RADIUS = 0.8;
export const SERPENT_LENGTH = 4.5;
/**
 * Surveillance cameras up on the hall's walls, Let Me Mend the Past's: one
 * on each wall, panning their beams across the road together and back, a
 * gap kept between the two. Caught in a beam, a flash, you're seen and
 * slowed; slipped through the gap between them, unseen, a boost.
 */
export const CAMERA_RADIUS = 2.2;
/** How far apart the two beams fall, centre to centre: the gap between them is this less a beam. */
export const CAMERA_GAP = 9;
/** How far along the road the gap counts, either side of the beams' line. */
export const CAMERA_DEPTH = 1.2;
export const CAMERA_BOOST = 0.8;
export const CAMERA_SLOW = 0.6;
/** How high up the walls the cameras are mounted, over the road. */
export const CAMERA_HEIGHT = 5.5;

/** Where the gap between the beams is across the road at cycle stage `u`, from -1 (as far left as it pans) to 1: slowest at the ends of the pan, as a camera turns. */
export function cameraPan(u: number): number {
  return Math.sin(u * Math.PI * 2);
}

/**
 * Santa's presents, God Is Calling Me Back Home's: Santa up at the edge of
 * the road with a present (the warning, its shadow on the road where it'll
 * land), the toss, bouncing across the road, sitting where it came to rest,
 * gone. Some land open, the lid off: a gift.
 */
export const PRESENT_STAGES = { toss: 0.28, land: 0.4, rest: 0.6, gone: 0.88 } as const;
export const PRESENT_RADIUS = 1.2;
/** Santa throws from this high over the ground beside the road (higher over a road sunk in a cut), at this far past its edge; a present bounces this high off its first landing, and lower off the next. */
export const PRESENT_ROOF = 7;
export const PRESENT_EDGE = 2;
export const PRESENT_BOUNCE = 2.4;
/** One present in this many lands open. */
export const PRESENT_OPEN = 3;
/** Lower than this over the road, it hits. */
export const PRESENT_REACH = 1.4;
/** An open present: a boost this long (and an item, Race gives it). A shut one: spun out. */
export const PRESENT_BOOST = 0.9;
export const PRESENT_SPIN = 1.0;

/**
 * Where a present is at cycle stage `u`: how far across the road from the
 * edge it's thrown from to where it comes to rest (0 to 1), and how high
 * over the road, thrown from `roof` over it; null before the toss and once
 * it's gone.
 */
export function presentFlight(u: number, roof = PRESENT_ROOF): { across: number; lift: number } | null {
  const P = PRESENT_STAGES;
  if (u < P.toss || u >= P.gone) return null;
  // The toss: from the roof's edge to its first landing, a fall.
  if (u < P.land) {
    const k = (u - P.toss) / (P.land - P.toss);
    return { across: 0.55 * k, lift: roof * (1 - k * k) + 2 * k * (1 - k) };
  }
  // Two bounces, each lower, on across the road to where it rests.
  if (u < P.rest) {
    const k = (u - P.land) / (P.rest - P.land);
    const first = k < 0.6;
    const b = first ? k / 0.6 : (k - 0.6) / 0.4;
    return { across: 0.55 + 0.45 * k, lift: (first ? PRESENT_BOUNCE : PRESENT_BOUNCE * 0.35) * 4 * b * (1 - b) };
  }
  return { across: 1, lift: 0 };
}

/**
 * Head On/Pill's capsules, giant and two-tone, tumbling end over end across
 * the road on a rhythm, one edge to the other and back the next time. Each
 * crossing is either the right pill or the wrong one, and its colours show
 * which: through the right one, a boost; "I ate the wrong pill": spun out,
 * and for a while after the steering (and the screen) swims.
 */
export const PILL_STAGES = { across: 0.78 } as const;
export const PILL_RADIUS = 2.1;
/** How far each capsule's crossing is behind the one before it along the road, as a share of the period: a rhythm. */
export const PILL_LAG = 0.21;
export const PILL_BOOST = 0.9;
export const PILL_SPIN = 1.0;
/** After the wrong pill: this long of the steering swimming. */
export const PILL_SWIM = 3;

/** Whether the capsule crossing at slot `i` on cycle `cycle` is the right pill: about half of them are. */
export function rightPill(cycle: number, i: number): boolean {
  return (((Math.sin(cycle * 12.9898 + i * 78.233) * 43758.5453) % 1) + 1) % 1 < 0.5;
}

/** Where a capsule is across the road at cycle stage `u`, from -1 (the edge it comes from) to 1 (the far edge); outside that it's off the road. */
export function pillAcross(u: number): number {
  return -1.25 + (2.5 * u) / PILL_STAGES.across;
}

/**
 * Altered Beast II's knife and fork, the beast's two hands ("my left hand
 * is a knife and my right is a fork"): they hang over the road, come down
 * into it together (the fork's stab, the knife's blade beside it), and
 * pull apart to the edges as a butcher pulls pork, the knife slicing
 * across one way and the fork dragging the other; up again, and the next
 * time they come down somewhere else, the hands swapped. Caught by either,
 * you spin; threaded through between them as they part, a boost.
 */
export const CUTLERY_STAGES = { stab: 0.22, pull: 0.34, lift: 0.7, gone: 0.8 } as const;
/** The knife's blade lies along the road, this long, this thick either side of its edge. */
export const KNIFE_LENGTH = 4.4;
export const KNIFE_RADIUS = 0.5;
/** The fork's tines, stabbed into the road. */
export const FORK_RADIUS = 1.3;
/** How far apart the two come down, centre to centre. */
export const CUTLERY_CLOSE = 3.6;
/** Threaded between them while they're no further apart than this, centre to centre, and within this far of their line along the road: a boost. */
export const CUTLERY_THREAD = 12;
export const CUTLERY_DEPTH = 1.6;
export const CUTLERY_BOOST = 0.8;
export const CUTLERY_SPIN = 1.0;
/** How high over the road they hang, raised. */
export const CUTLERY_HEIGHT = 7;

/** How far the knife and fork have pulled apart at cycle stage `u`: 0 together where they came down, 1 out at the road's edges (and lifted away from there). */
export function cutleryApart(u: number): number {
  const C = CUTLERY_STAGES;
  if (u < C.pull) return 0;
  const w = Math.min(1, (u - C.pull) / (C.lift - C.pull - 0.1));
  return w * w * (3 - 2 * w);
}

/** Where the knife and fork are across the road (laterals, right of the centre) at race time `t` for a station `i` on a road `hw` wide each side, with a cycle `period` long. */
export function cutleryAcross(t: number, period: number, i: number, hw: number): { knife: number; fork: number; side: number; u: number } {
  const tt = (t + 10) / period + i * 0.37;
  const cycle = Math.floor(tt);
  const u = tt - cycle;
  // Where they come down, and which side the knife pulls to: the hands swap each time.
  const down = (c: number) => ({ mid: (hw - CUTLERY_CLOSE - 2) * 0.6 * Math.sin(c * 2.39 + i * 1.3), side: (c + i) % 2 === 0 ? 1 : -1 });
  const { mid, side } = down(cycle);
  if (u >= CUTLERY_STAGES.gone) {
    // Up in the air, swinging back over the road to where they come down next, passing each other.
    const next = down(cycle + 1);
    const w = (u - CUTLERY_STAGES.gone) / (1 - CUTLERY_STAGES.gone);
    const e = w * w * (3 - 2 * w);
    return {
      knife: side * (hw + 1) + (next.mid + (next.side * CUTLERY_CLOSE) / 2 - side * (hw + 1)) * e,
      fork: -side * (hw + 1) + (next.mid - (next.side * CUTLERY_CLOSE) / 2 + side * (hw + 1)) * e,
      side,
      u,
    };
  }
  // From the middle where they come down to just past the edges.
  const apart = cutleryApart(u);
  return {
    knife: mid + side * (CUTLERY_CLOSE / 2 + (hw + 1 - side * mid - CUTLERY_CLOSE / 2) * apart),
    fork: mid - side * (CUTLERY_CLOSE / 2 + (hw + 1 + side * mid - CUTLERY_CLOSE / 2) * apart),
    side,
    u,
  };
}

/** How high the knife and fork are over the road at cycle stage `u`: hanging, coming down, in the road, and lifted away. */
export function cutleryLift(u: number): number {
  const C = CUTLERY_STAGES;
  if (u < C.stab - 0.08) return CUTLERY_HEIGHT;
  if (u < C.stab) return CUTLERY_HEIGHT * ((C.stab - u) / 0.08) ** 2;
  if (u < C.lift) return 0;
  if (u < C.gone) return CUTLERY_HEIGHT * Math.sin(((u - C.lift) / (C.gone - C.lift)) * (Math.PI / 2));
  return CUTLERY_HEIGHT;
}

/**
 * Altered Beast III's jaws, nine pearl fangs each, five hung from the
 * upper jaw over the road and four up out of the road between them: wide
 * open, baring (the warning, the fangs creeping toward each other), the
 * snap (shut right across the road: it bites), then opening again (drive
 * through the gap as it opens, a boost) and wide. Down the gullet each jaw
 * snaps this share of the period after the one before: a rhythm to ride.
 */
export const FANG_STAGES = { bare: 0.42, snap: 0.58, open: 0.72, wide: 0.86 } as const;
export const FANG_LAG = 0.12;
/** How far along the road the jaw's bite reaches either side of its line. */
export const FANG_DEPTH = 1.4;
export const FANG_BOOST = 0.8;
export const FANG_SPIN = 1.1;
/** How shut the jaw is while it bares its fangs, before the snap. */
export const FANG_CREEP = 0.35;
/** How high the upper jaw hangs over the road, wide open. */
export const FANG_HEIGHT = 7;

/** How shut a jaw is at cycle stage `u`: 0 wide open, 1 shut (the fangs meeting). */
export function fangBite(u: number): number {
  const F = FANG_STAGES;
  if (u < F.bare || u >= F.wide) return 0;
  if (u < F.snap) {
    const k = (u - F.bare) / (F.snap - F.bare);
    // Creeping, and the last instant the snap.
    return k < 0.85 ? FANG_CREEP * (k / 0.85) ** 2 : FANG_CREEP + (1 - FANG_CREEP) * ((k - 0.85) / 0.15);
  }
  if (u < F.open) return 1;
  return 1 - (u - F.open) / (F.wide - F.open);
}

/** Where the snake's head is across the road at cycle stage `u`, from -1 (the edge it comes from) to 1 (the far edge); outside that it's off the road. */
export function serpentAcross(u: number): number {
  const S = SERPENT_STAGES;
  return -1.3 + (2.6 * (u - S.slither)) / (S.gone - S.slither);
}

/**
 * Float Along's great breaths of air, on a five-beat bar as the song is in
 * 5/4: the road froths where one is coming up (beats one and two), it
 * swells up out of the road and rises (three and four), and bursts on the
 * fifth. "Float along and fill your lungs."
 */
export const BUBBLE_STAGES = { rise: 0.4, burst: 0.8, gone: 0.9 } as const;
export const BUBBLE_RADIUS = 2.6;
/** How high it rises off the road before it bursts. */
export const BUBBLE_HEIGHT = 3.2;
/** Caught as it rises, it floats you up this fast, a trick to come down on (a boost). Driven into as it bursts, it knocks you aside this hard, and slows you. */
export const BUBBLE_LIFT = 12;
export const BUBBLE_SHOVE = 14;
export const BUBBLE_SLOW = 0.8;
/** A burst reaches this much past the bubble. */
export const BUBBLE_BURST = 1.6;

/** How far a bubble has risen off the road at cycle stage `u`: on the road while it froths, up as it swells, gone once it has burst. */
export function bubbleRise(u: number): number {
  const B = BUBBLE_STAGES;
  if (u < B.rise || u >= B.gone) return 0;
  return BUBBLE_HEIGHT * Math.min(1, (u - B.rise) / (B.burst - B.rise));
}

/**
 * The altered beast's footfalls, Altered Beast I's: a foot raised high
 * over the road (its shadow on it the warning: there it'll come down), the
 * stamp, and from where it lands a shockwave ringing out across the road
 * while it stands there; then it lifts away. "You feel his rhythm as he
 * tramples the earth": the footfalls down a stretch land one after another,
 * left foot and right, the far ones first, coming closer.
 */
export const STOMP_STAGES = { fall: 0.3, land: 0.36, gone: 0.62, lift: 0.8 } as const;
/** The foot: how big it is, and how high it's raised. */
export const STOMP_FOOT = 3.2;
export const STOMP_HANG = 14;
/** Each footfall down a stretch comes down this share of the period after the one beyond it. */
export const STOMP_LAG = 0.18;
/** How deep the shockwave's ring is, along the ground. */
export const STOMP_BAND = 1.4;
/** Caught by the ring your feet are stuck to the terrain: this much of your speed kept. Hopped as it passes: a boost this long. Under the foot as it lands: trampled, spun out. */
export const STOMP_SLOW = 0.55;
export const STOMP_BOOST = 0.8;
export const STOMP_SPIN = 1.1;
/** Either side of the stamp, this share of the period: what's under the foot is trampled. */
export const STOMP_CRUSH = 0.03;

/** How high the foot is over the road at cycle stage `u`: raised, coming down, planted, lifting away. */
export function stompLift(u: number): number {
  const S = STOMP_STAGES;
  if (u < S.fall) return STOMP_HANG;
  if (u < S.land) return STOMP_HANG * (1 - ((u - S.fall) / (S.land - S.fall)) ** 2);
  if (u < S.lift) return 0;
  return STOMP_HANG * Math.min(1, ((u - S.lift) / (1 - S.lift)) * 1.4);
}

/** How far the shockwave's ring has run out from the foot at cycle stage `u`, `reach` when it's gone; 0 when there's none. */
export function stompRing(u: number, reach: number): number {
  const S = STOMP_STAGES;
  if (u < S.land || u >= S.gone) return 0;
  return STOMP_FOOT + (reach - STOMP_FOOT) * Math.sqrt((u - S.land) / (S.gone - S.land));
}

/**
 * Altered Beast IV's hollows, the void the beast feels within: a crack in
 * the road, yawning open into a dark hollow, open a while, closing again.
 * They go in a row on the song's eleven-beat bar (eleven sixteenths, three
 * and three and three and two): each opens three sixteenths after the one
 * before, the last two after that. Over one while it's open, it drags you
 * down, slowed; skirting its rim as it closes, it slings you on.
 */
export const VOID_STAGES = { yawn: 0.3, open: 0.42, close: 0.7, shut: 0.86 } as const;
export const VOID_RADIUS = 3.4;
/** The rim, either side of the hollow's edge as it closes: skirt it and it slings you on. */
export const VOID_RIM = 1.2;
/** Dragged down: you keep this share of your speed; slung on the rim, a boost this long. */
export const VOID_SLOW = 0.55;
export const VOID_SLING = 0.9;
/** Where each of a row's hollows opens in the bar, in sixteenths of it: on three and three and three and two. */
export const VOID_BEATS = [0, 3, 6, 9] as const;

/** How wide a hollow is open at cycle stage `u`: shut (a crack) at first, yawning open, open, then closing again to nothing. */
export function voidRadius(u: number): number {
  const V = VOID_STAGES;
  if (u < V.yawn || u >= V.shut) return 0;
  if (u < V.open) return (VOID_RADIUS * (u - V.yawn)) / (V.open - V.yawn);
  if (u < V.close) return VOID_RADIUS;
  return VOID_RADIUS * (1 - (u - V.close) / (V.shut - V.close));
}

/**
 * Kill for the Steel's electromagnet cranes: a magnet hung from a gantry
 * over the road, swinging across it from one edge to the other and back.
 * Dark as it swings back; charging at the edge (the warning: it hums and
 * sparks); switched on as it sweeps across the road, its field dragging any
 * kart under it, steel and all, along with it and off its line; switched
 * off at the far edge, flinging what it held. Down a row, each crane sweeps
 * the other way from the one before, a beat behind it.
 */
export const MAGNET_STAGES = { charge: 0.15, on: 0.3, off: 0.78, flung: 0.86 } as const;
/** How far either side of the road's middle the magnet swings, as a share of the road's half-width; how high it hangs. */
export const MAGNET_SWING = 0.8;
export const MAGNET_HANG = 5;
/** The field's reach round the magnet, along the ground. */
export const MAGNET_FIELD = 6;
/** Held in the field: pulled toward the magnet this hard (m/s^2), and this share of your speed kept a second. */
export const MAGNET_PULL = 40;
export const MAGNET_GRIP = 0.45;
/** Under it as it switches off: flung on, a boost this long. */
export const MAGNET_FLING = 1.0;
/** Each crane down a row swings this share of the period behind the one before. */
export const MAGNET_LAG = 0.27;

/** Where a crane's magnet is across the road at cycle stage `u`, as a share of its swing: 1 at the edge it switches on at, sweeping across to -1 as it switches off, and swinging back dark. */
export function magnetSwing(u: number): number {
  const M = MAGNET_STAGES;
  const span = M.off - M.on;
  const v = (((u - M.on) % 1) + 1) % 1;
  return v < span ? Math.cos((Math.PI * v) / span) : -Math.cos((Math.PI * (v - span)) / (1 - span));
}

/**
 * The astral blacksmith's hammer, Alien Metal's: raised high over the
 * road (its shadow there, the warning), it comes down on the beat with a
 * clang, rests a beat on the road where it struck, and lifts away; a
 * shower of sparks flies off the strike. The album runs at 143 beats a
 * minute, a cycle is two bars of it, and the hammers down a stretch
 * strike a beat apart, as a smith's do. Under it as it lands: flattened.
 * Through the sparks just after: "astral blacksmith, won't you gimme a
 * fix", a boost.
 */
export const HAMMER_BEAT = 60 / 143;
export const HAMMER_BEATS = 8;
export const HAMMER_PERIOD = HAMMER_BEATS * HAMMER_BEAT;
/** Stages of a cycle: coming down from `fall`, striking at `land` (beat four), resting there until `lift`, the sparks flying until `sparks`. */
export const HAMMER_STAGES = { fall: 0.42, land: 0.5, lift: 0.625, sparks: 0.8 } as const;
/** The hammer's face, and how high it's raised over the road. */
export const HAMMER_FACE = 3.4;
export const HAMMER_HANG = 13;
/** The sparks fly out this far from the middle of the strike. */
export const HAMMER_SPARKS = 8;
/** Either side of the strike, this share of the period: what's under the face is flattened. */
export const HAMMER_CRUSH = 0.025;
export const HAMMER_SPIN = 1.2;
/** Through the sparks: a fix, a boost this long. */
export const HAMMER_FIX = 1.0;

/** How high the hammer's face is over the road at cycle stage `u`: raised, coming down (faster and faster), resting where it struck, lifting away. */
export function hammerLift(u: number): number {
  const H = HAMMER_STAGES;
  if (u < H.fall) return HAMMER_HANG * Math.min(1, 0.55 + u / H.fall);
  if (u < H.land) return HAMMER_HANG * (1 - ((u - H.fall) / (H.land - H.fall)) ** 2);
  if (u < H.lift) return 0;
  return HAMMER_HANG * Math.min(0.55, ((u - H.lift) / (1 - H.lift)) * 1.2);
}

/** Whether the sparks are flying off the strike at cycle stage `u`. */
export function hammerSparking(u: number): boolean {
  return u >= HAMMER_STAGES.land && u < HAMMER_STAGES.sparks;
}

/**
 * Level 5's driverless pods, level five autonomy: white pods cruising the
 * lanes at one steady speed, nose to tail in platoons of three. Each keeps
 * to its lane until the rhythm says change: the lead pod blinks, moves over
 * a lane, and the others follow it one after another. They materialise out
 * of pixels where their stretch begins and dematerialise where it ends.
 * Hit one, spun; tuck in behind one, in its slipstream, and it tows you on.
 */
export const AUTOPILOT_SPEED = 15;
export const AUTOPILOT_PLATOON = 3;
/** Nose to tail: a platoon's pods this far apart, centre to centre. */
export const AUTOPILOT_GAP = 7;
/** A pod's body: half its length and half its width. */
export const AUTOPILOT_HALF_LENGTH = 2.2;
export const AUTOPILOT_HALF_WIDTH = 1.1;
/** The road is painted in four lanes; a pod keeps to one. */
export const AUTOPILOT_LANES = 4;
/** Each lane change: moving over in the first part of a period, the blinker from late in the one before. */
export const AUTOPILOT_STAGES = { shift: 0.22, blink: 0.7 } as const;
/** Each pod in a platoon changes lane this share of a period after the one ahead of it. */
export const AUTOPILOT_FOLLOW = 0.08;
/** The lanes a platoon keeps to, a period each: across the road and back. */
export const AUTOPILOT_ROUTE = [1, 2, 3, 2, 1, 0] as const;
/** This close to either end of their stretch they're still pixels, harmless. */
export const AUTOPILOT_FADE = 8;
/** The slipstream: behind a pod's tail, back this far, and this far either side of its middle. */
export const AUTOPILOT_DRAFT = 10;
export const AUTOPILOT_DRAFT_WIDTH = 1.4;
/** Hit, spun; towed on in the slipstream, a boost this long. */
export const AUTOPILOT_SPIN = 1.0;
export const AUTOPILOT_TOW = 0.9;

/** The lateral of lane `lane` (0 to 3, across the road) on a road of half width `hw`. */
export function autopilotLane(lane: number, hw: number): number {
  return (lane - (AUTOPILOT_LANES - 1) / 2) * ((2 * hw) / AUTOPILOT_LANES);
}

/**
 * Where pod `i` of `count` is at race time `t` on a stretch `length`
 * long: how far along it, the lane it's leaving, the one it's in or moving
 * into and the one after, how far over it has moved (0 to 1), and its
 * stage of the period.
 */
export function autopilotPod(t: number, period: number, i: number, count: number, length: number): { along: number; from: number; lane: number; next: number; shift: number; u: number } {
  const mod = (a: number, n: number) => ((a % n) + n) % n;
  const platoon = Math.floor(i / AUTOPILOT_PLATOON);
  const j = i % AUTOPILOT_PLATOON;
  const platoons = Math.ceil(count / AUTOPILOT_PLATOON);
  const along = mod((t + 10) * AUTOPILOT_SPEED + (platoon * length) / platoons - j * AUTOPILOT_GAP, length);
  const tt = (t + 10) / period - j * AUTOPILOT_FOLLOW + platoon * 0.5;
  const cycle = Math.floor(tt);
  const u = tt - cycle;
  const route = (c: number) => AUTOPILOT_ROUTE[mod(c + platoon * 3, AUTOPILOT_ROUTE.length)];
  const x = Math.min(1, u / AUTOPILOT_STAGES.shift);
  return { along, from: route(cycle - 1), lane: route(cycle), next: route(cycle + 1), shift: x * x * (3 - 2 * x), u };
}

/**
 * Rapid Alpha Decay's alpha particles, two protons and two neutrons each,
 * fired out of the nucleus as it decays: a glow at the edge of the road
 * they'll come from (the warning), then the burst, three of them streaking
 * right across the road one behind another, and in their wake the static
 * wave, crackling across the whole road a moment before it fades. Hit by
 * an alpha, you spin, and your screen crackles with static; through the
 * static wave behind a burst, a jumpstart, a boost.
 */
export const ALPHA_STAGES = { fire: 0.28, wake: 0.55, gone: 0.72 } as const;
export const ALPHA_COUNT = 3;
export const ALPHA_RADIUS = 1.3;
/** How far apart a burst's alphas fly, one behind another across the road. */
export const ALPHA_GAP = 5;
/** How high over the road they fly. */
export const ALPHA_LIFT = 1.2;
/** How far along the road the static wave reaches either side of the alphas' line. */
export const ALPHA_DEPTH = 1.6;
export const ALPHA_BOOST = 1.0;
export const ALPHA_SPIN = 1.0;
/** Hit: this long of static crackling on the screen. */
export const ALPHA_STATIC = 1.5;

/**
 * All Is Known's street sweepers, sweeping the streets for the machine:
 * each parked off one edge of the road with its beacon turning; then (the
 * warning) its brushes spin up and its scanner lights; then it drives
 * right across the road at a steady pace and parks off the other edge, and
 * the next time it comes back. Down the street they go one after another.
 * Caught in its brushes, you're swept aside, spun, and digitised (the
 * screen breaks up into pixels, game.ts); through the clean wake just
 * behind it, the road it has this moment swept, a boost.
 */
export const SWEEP_STAGES = { warn: 0.3, go: 0.42, done: 0.86 } as const;
/** The machine: half its depth along the road, and half its length across it, the way it drives. */
export const SWEEP_DEPTH = 1.7;
export const SWEEP_HALF = 2.5;
/** It parks this far off the road's edge, its middle. */
export const SWEEP_PARK = 3.5;
/** The clean wake: this far behind it across the road, the road it has just swept. */
export const SWEEP_WAKE = 6;
export const SWEEP_BOOST = 0.9;
export const SWEEP_SPIN = 1.0;
/** Swept aside: shoved the way it's going this hard (m/s). */
export const SWEEP_SHOVE = 8;
/** Swept: this long of the screen digitised. */
export const SWEEP_DIGITISE = 1.4;

/**
 * Where a sweeper is across the road at cycle stage `u`, as a lateral
 * measured toward the edge it's heading for, on a road it parks `reach` off
 * the middle of: parked at -reach, across, parked at +reach.
 */
export function sweeperAcross(u: number, reach: number): number {
  const S = SWEEP_STAGES;
  if (u < S.go) return -reach;
  if (u >= S.done) return reach;
  return -reach + (2 * reach * (u - S.go)) / (S.done - S.go);
}

/**
 * Where a burst's alpha `k` (0 leads) is across the road at cycle stage
 * `u`, as a lateral from the road's centre measured toward the edge they're
 * fired from, for a road `reach` wide either side: from beyond that edge,
 * right across, to beyond the other; null outside the burst.
 */
export function alphaAcross(u: number, k: number, reach: number): number | null {
  const A = ALPHA_STAGES;
  if (u < A.fire || u >= A.wake) return null;
  const f = (u - A.fire) / (A.wake - A.fire);
  const from = reach + ALPHA_RADIUS * 2;
  return from - (2 * from + (ALPHA_COUNT - 1) * ALPHA_GAP) * f + k * ALPHA_GAP;
}

/**
 * Muddy Water's sharks, shark bait and shark bite: a fin circling in the
 * shallows off one edge of the causeway (the warning: that's the side it
 * comes from), then the run, the shark cutting right across the road on a
 * slant, its jaws up out of the water as it crosses the middle, and on into
 * the water the other side, its wake trailing over the road behind it; then
 * it goes under, and comes back circling on the side it went to. Driven
 * into, it bites: spun. Slipped past just behind it, through its wake, a
 * boost.
 */
export const SHARK_STAGES = { run: 0.56, ashore: 0.8, calm: 0.94 } as const;
/** It circles this far out, off the road's edge, and starts its run this far off it. */
export const SHARK_CIRCLE = 5;
export const SHARK_OUT = 4;
/** How far along the road its run slants, from one side to the other. */
export const SHARK_SLANT = 9;
/** Its body, from the fin: the head this far ahead, the tail this far behind, this thick either side. */
export const SHARK_HEAD = 2;
export const SHARK_TAIL = 2.6;
export const SHARK_RADIUS = 0.9;
/** Its wake: this far back behind its tail, this wide either side of its line. */
export const SHARK_WAKE = 9;
export const SHARK_WAKE_WIDTH = 2.4;
export const SHARK_SPIN = 1.1;
export const SHARK_BOOST = 1.0;

/**
 * Where a shark is at cycle stage `u` of its period, in the road's frame at
 * its station: `along` the road (metres ahead), `lateral` (to the right)
 * and the way it's swimming (`da`, `dl`, a unit vector in that frame);
 * whether it's running (on its line across, or swimming on beyond) and how
 * far along that line it is (`f`, 0 where it sets off, 1 off the far side);
 * `side` is the way across it goes (1 to the right), `drift` the way along.
 * The road is `reach` wide either side of its centre.
 */
export function sharkCourse(u: number, cycle: number, i: number, reach: number): { along: number; lateral: number; da: number; dl: number; running: boolean; f: number; side: number; drift: number; under: boolean } {
  const S = SHARK_STAGES;
  const side = (cycle + i) % 2 === 0 ? 1 : -1;
  const drift = (Math.floor(cycle / 2) + i) % 2 === 0 ? 1 : -1;
  const R = reach + SHARK_OUT;
  const a0 = -drift * SHARK_SLANT * 0.5;
  // Across: 2R; along: the slant. Its heading along that line.
  const len = Math.hypot(2 * R, SHARK_SLANT);
  const da = (drift * SHARK_SLANT) / len;
  const dl = (side * 2 * R) / len;
  if (u >= S.run) {
    const f = (u - S.run) / (S.ashore - S.run);
    return { along: a0 + drift * SHARK_SLANT * f, lateral: side * (-R + 2 * R * f), da, dl, running: u < S.calm, f, side, drift, under: u >= S.calm };
  }
  // Circling off the edge it will come from, twice round, ending where its run starts.
  const psi = 4 * Math.PI * (u / S.run);
  const c = SHARK_CIRCLE;
  return {
    along: a0 + drift * c * Math.sin(psi),
    lateral: side * (-(R + c) + c * Math.cos(psi)),
    da: drift * Math.cos(psi),
    dl: -side * Math.sin(psi),
    running: false,
    f: 0,
    side,
    drift,
    under: false,
  };
}

/**
 * The Great Chain of Being's rocky meteors: a rock with eyes to the sky
 * falls out of it onto the top of a climb, its mark burning on the road
 * where it will land first; it lands in a burst of sparks and fire, then
 * rolls back down the climb at the karts coming up it, in its lane, until
 * it crumbles at the foot. Each fall picks one of three lanes. Under it as
 * it lands, blasted; in its way as it rolls, pushed down; both spin you.
 * Hopped as it rolls at you, it's cleared and you come down on a boost;
 * rammed on a boost, it bursts and the boost runs on.
 */
/** Its mark burns on the road this long (s) before it lands, and the last of that it's seen coming down. */
export const METEOR_MARK = 1.8;
export const METEOR_FALL = 0.8;
/** How high it is when it's first seen, over where it will land. */
export const METEOR_HEIGHT = 48;
/** Rolling down the climb, m/s. */
export const METEOR_ROLL = 13;
export const METEOR_RADIUS = 1.5;
/** The burst as it lands: this far, for this long (s). */
export const METEOR_BLAST = 3.8;
export const METEOR_BLAST_TIME = 0.2;
/** At the foot of its climb it crumbles, over this long (s). */
export const METEOR_CRUMBLE = 0.6;
/** Its lanes, as shares of the road's half width (a lateral to the right is positive). */
export const METEOR_LANES = [-0.55, 0, 0.55] as const;
export const METEOR_SPIN = 1.2;
/** Hopped as it rolls at you: a boost this long. */
export const METEOR_CLEAR = 0.9;
/** Its stages, as `HazardPose.lane` gives them. */
export const METEOR_STAGE = { gone: -1, mark: 0, blast: 1, roll: 2, crumble: 3 } as const;

/**
 * Where rocky meteor `i` of `count` is at race time `t`, on a climb `length`
 * long: its stage, how far through it (0 to 1; rolling, the seconds since it
 * landed), how far back down the climb from the top it has rolled, and its
 * lane (an index into METEOR_LANES), which each fall picks afresh.
 */
export function rockyMeteor(t: number, period: number, i: number, count: number, length: number): { stage: number; u: number; along: number; lane: number; cycle: number } {
  const tt = t + 10 + (i * period) / count;
  const cycle = Math.floor(tt / period);
  const age = tt - cycle * period;
  const hash = Math.abs(Math.sin(cycle * 12.9898 + i * 78.233) * 43758.5453) % 1;
  const lane = Math.min(METEOR_LANES.length - 1, Math.floor(hash * METEOR_LANES.length));
  const S = METEOR_STAGE;
  if (age < METEOR_MARK) return { stage: S.mark, u: age / METEOR_MARK, along: 0, lane, cycle };
  const rolled = age - METEOR_MARK;
  const along = rolled * METEOR_ROLL;
  if (along < length) return { stage: rolled < METEOR_BLAST_TIME ? S.blast : S.roll, u: rolled, along, lane, cycle };
  const after = rolled - length / METEOR_ROLL;
  if (after < METEOR_CRUMBLE) return { stage: S.crumble, u: after / METEOR_CRUMBLE, along: length, lane, cycle };
  return { stage: S.gone, u: 0, along: length, lane, cycle };
}

/** How high a rocky meteor is over where it will land, at stage `u` of its mark: out of sight, then falling the last of the way. */
export function meteorHeight(u: number): number {
  const f = 1 - METEOR_FALL / METEOR_MARK;
  if (u < f) return METEOR_HEIGHT;
  const x = (u - f) / (1 - f);
  return METEOR_HEIGHT * (1 - x * x);
}

/**
 * The Wheel's waves of sleep: "we only fall asleep willingly at the wheel
 * that steers us into our future". A row across the road where sleep
 * settles on the song's slow sway: a haze of dream gathers over it (the
 * warning, harmless), lies thick right across the road a while, and lifts,
 * and as it lifts the rumble strip under it rattles, the wake-up line.
 * Down a stretch each row settles a beat after the one before, so the wave
 * of sleep rolls down the road at about a fast kart's pace, and the moment
 * to be awake rolls with it. Caught in the haze while it lies thick, you
 * nod off at the wheel: your eyelids droop, your speed bleeds away, the
 * wheel wobbles in your hands and you drift toward the edge. Over the
 * strip while it rattles, jolted awake: a boost, into our future.
 */
export const DOZE_STAGES = { thick: 0.24, lift: 0.62, clear: 0.84 } as const;
/** How far along the road a row's haze and its rumble strip reach either side of the row. */
export const DOZE_DEPTH = 3.2;
/** Each row down a stretch settles this share of a period after the one before. */
export const DOZE_LAG = 0.2;
/** Nodded off: you keep this share of your speed, the wheel wobbles this long, and you drift this fast toward the edge you're nearer. */
export const DOZE_SLOW = 0.6;
export const DOZE_NOD = 1.2;
export const DOZE_DRIFT = 7;
/** Nodded off: this long with your eyelids drooping on the screen. */
export const DOZE_SLEEP = 1.8;
/** Jolted awake on the rumble strip: a boost this long. */
export const DOZE_WAKE = 1.0;

/** Where row `i` of a stretch of sleep is in its sway at race time `t`, 0 to 1. */
export function dozePhase(t: number, period: number, i: number): number {
  const tt = (t + 10) / period - i * DOZE_LAG;
  return tt - Math.floor(tt);
}

/** How thick a row's haze lies at cycle stage `u`: gathering to 1 when it's thick, thinning away as it lifts, 0 when clear. */
export function dozeHaze(u: number): number {
  const D = DOZE_STAGES;
  if (u < D.thick) return 0.15 + 0.85 * (u / D.thick) ** 2;
  if (u < D.lift) return 1;
  if (u < D.clear) return 1 - (u - D.lift) / (D.clear - D.lift);
  return 0.15 * ((u - D.clear) / (1 - D.clear));
}

/**
 * The Grim Reaper's hellhounds, "sniffing out stitches for the snitches": a
 * pack of three bursting out of a den in one wall of their pit and running
 * right across the road into the den in the other, nose to tail, noses down
 * on the scent. Their scent line is stitched across the road first, a seam
 * of red stitches glowing brighter and brighter from the side they'll come
 * from (the warning), while their eyes burn in the dark of the den and the
 * lead hound's nose pokes out sniffing; then the run, each hound weaving a
 * little along the road as it sniffs, and the next time round they come
 * back the other way. Caught by one, bitten and spun. Slipped through the
 * gap just behind the last of the pack as it crosses, a boost.
 */
export const HOUND_STAGES = { run: 0.42, gone: 0.82 } as const;
export const HOUND_COUNT = 3;
/** Nose to nose along their line, and each one's body: the head this far ahead of its middle, the tail this far behind, this thick. */
export const HOUND_SPACING = 3.6;
export const HOUND_HEAD = 1.3;
export const HOUND_TAIL = 1.3;
export const HOUND_RADIUS = 0.75;
/** The dens are this far out past the road's edge: where the pack waits and where it runs to. */
export const HOUND_OUT = 2;
/** How far each hound weaves along the road as it sniffs, either way. */
export const HOUND_SNIFF = 0.6;
/** The gap behind the pack: this far back behind the last one's tail, this far either side of its line. */
export const HOUND_GAP = 7;
export const HOUND_GAP_DEPTH = 2.6;
export const HOUND_SPIN = 1.1;
export const HOUND_BOOST = 1.0;
/** Each pack down the pit runs this share of a period after the one before, so a fast kart through the gap behind one meets the next as it opens. */
export const HOUND_LAG = 0.3;

/** Where pack `i` of a stretch is in its cycle at race time `t` (0 to 1), and which way it runs this time (1 to the right). */
export function houndPhase(t: number, period: number, i: number): { u: number; side: number } {
  const tt = (t + 10) / period - i * HOUND_LAG;
  const cycle = Math.floor(tt);
  return { u: tt - cycle, side: (cycle + i) % 2 === 0 ? 1 : -1 };
}

/**
 * Where each hound of a pack is at cycle stage `u`, in the road's frame at
 * its station: `lateral` (to the right), `along` the road, and whether it's
 * out of its den (`out`). `side` is the way they run; the road is `reach`
 * wide either side of its centre. The lead is first.
 */
export function houndPack(u: number, side: number, reach: number): { lateral: number; along: number; out: boolean }[] {
  const H = HOUND_STAGES;
  const den = reach + HOUND_OUT;
  const back = (HOUND_COUNT - 1) * HOUND_SPACING;
  // The lead runs from its den until the last of them is in the far one.
  const f = u < H.run ? 0 : u >= H.gone ? 1 : (u - H.run) / (H.gone - H.run);
  const lead = -den + (2 * den + back) * f;
  return Array.from({ length: HOUND_COUNT }, (_, k) => {
    const l = lead - k * HOUND_SPACING;
    const out = u >= H.run && u < H.gone && l > -den && l < den;
    const lateral = side * Math.max(-den, Math.min(den, l));
    return { lateral, along: out ? HOUND_SNIFF * Math.sin(f * Math.PI * 7 + k * 1.9) : 0, out };
  });
}

/**
 * Cyboogie's pistons: "pistons and pumps under graphene lattice". Rows of
 * PISTON_LANES pistons across the road, flush in the graphene, that punch up
 * through it one after another on the four beats of the boogie's bar, left to
 * right down one row and right to left down the next, like the song's
 * arpeggio, each row a beat behind the one before. Each piston hisses and its
 * ring glows red (the warning, harmless), punches up (caught over it, you're
 * thrown and spun), stands at the top of its stroke a while (a chrome column:
 * driven into, you're spun; hopped onto, you ride it, up and on with a
 * boost), and drops back flush.
 */
/** Pistons to a row, across the road. */
export const PISTON_LANES = 4;
export const PISTON_STAGES = { top: 0.07, drop: 0.42, down: 0.52, warn: 0.8 } as const;
export const PISTON_RADIUS = 2.6;
/** How high a piston stands at the top of its stroke. */
export const PISTON_LIFT = 1.6;
/** Caught as it punches up: thrown up this fast (m/s), spun this long, and this much of your speed kept. */
export const PISTON_THROW = 8;
export const PISTON_SPIN = 1.0;
export const PISTON_SLOW = 0.55;
/** Driven into one standing at the top of its stroke: spun this long, this much of your speed kept. */
export const PISTON_BUMP = 0.8;
export const PISTON_BUMP_SLOW = 0.6;
/** Hopped onto at the top of its stroke: ridden up this fast (m/s), and a boost this long. */
export const PISTON_RIDE = 11;
export const PISTON_BOOST = 0.9;

/** The beat of the bar (0 to PISTON_LANES - 1) the piston in lane `lane` of row `row` punches up on: an arpeggio up one row and down the next, each row a beat behind. */
export function pistonBeat(row: number, lane: number, lanes: number): number {
  const step = row % 2 ? lanes - 1 - lane : lane;
  return (step + row) % lanes;
}

/** Where a piston is in its stroke at race time `t`, 0 to 1: 0 as it punches up. */
export function pistonPhase(t: number, period: number, beat: number, lanes: number): number {
  const tt = (t + 10) / period - beat / lanes;
  return tt - Math.floor(tt);
}

/** How far up a piston stands at stroke stage `u`, 0 (flush) to 1 (the top of its stroke). */
export function pistonLift(u: number): number {
  const P = PISTON_STAGES;
  if (u < P.top) return Math.sin(((u / P.top) * Math.PI) / 2);
  if (u < P.drop) return 1;
  if (u < P.down) return 1 - (u - P.drop) / (P.down - P.drop);
  return 0;
}

/**
 * Gaia breathes: her ribs, under the skin of the road, heave across it all
 * in one breath on the riff. Each breath she draws in (her ribs swell up
 * into a ridge right across the road, the cracks in it glowing as she
 * starts), holds it, and lets it out: the ridge sinks back down through
 * the road into a trough, her breath blowing dust out of the cracks, and
 * fills again. Over a rib as it rises or while it's held, it throws you
 * on: up, with a boost. Caught as it falls, you sink with it: your speed
 * bleeds into the earth and the wheel wobbles. The ribs are a fast kart's
 * breath apart, so one that meets the first as it rises meets them all so.
 */
export const BREATH_STAGES = { inhale: 0.18, full: 0.5, exhale: 0.6, empty: 0.8 } as const;
/** How high a rib swells over the road, and how deep the trough it sinks to. */
export const BREATH_RISE = 2;
export const BREATH_SINK = 1.2;
/** How far along the road a rib reaches either side of its crest. */
export const BREATH_DEPTH = 4;
/** Thrown on by a rib as it rises: up this fast (m/s), and a boost this long. */
export const BREATH_THROW = 10;
export const BREATH_BOOST = 0.7;
/** Caught as it falls: you keep this share of your speed, and the wheel wobbles this long. */
export const BREATH_SLOW = 0.55;
export const BREATH_WOBBLE = 0.8;

/** Where Gaia's breath is at race time `t`, 0 to 1: every rib breathes together. */
export function breathPhase(t: number, period: number): number {
  const tt = (t + 10) / period;
  return tt - Math.floor(tt);
}

/** How high a rib stands over the road at stage `u` (negative: a trough): flat at rest, swelling as she breathes in, held, sinking right through as she breathes out, and filling again. */
export function breathLift(u: number): number {
  const B = BREATH_STAGES;
  if (u < B.inhale) return 0;
  if (u < B.full) {
    const k = (u - B.inhale) / (B.full - B.inhale);
    return BREATH_RISE * k * k * (3 - 2 * k);
  }
  if (u < B.exhale) return BREATH_RISE;
  if (u < B.empty) {
    const k = (u - B.exhale) / (B.empty - B.exhale);
    return BREATH_RISE - (BREATH_RISE + BREATH_SINK) * Math.sin((Math.PI * k) / 2);
  }
  const k = (u - B.empty) / (1 - B.empty);
  return -BREATH_SINK * (1 - k * k * (3 - 2 * k));
}

/**
 * Straws in the Wind's mortal traffic lights: "mortal traffic lights
 * signalling when to stay or go". A gantry of lights over the road, swaying
 * in the gale, changing on the waltz's three beats: green on the one (go),
 * amber on the two, red on the three (stay). Down a stretch each gantry
 * changes a little after the one before, so a green wave rolls down the
 * road at about a fast kart's pace. Under one while it shows green, a
 * boost; caught under one on red, you're stopped dead: spun round, most of
 * your speed gone. Amber does nothing but warn.
 */
export const LIGHT_STAGES = { amber: 1 / 3, red: 2 / 3 } as const;
/** How far along the road a gantry's stop line reaches either side of it. */
export const LIGHT_DEPTH = 2.4;
/** Each gantry down a stretch changes this share of a bar after the one before. */
export const LIGHT_LAG = 0.21;
/** Through on green: a boost this long. */
export const LIGHT_GO = 0.9;
/** Caught on red: spun this long, keeping this share of your speed. */
export const LIGHT_SPIN = 0.8;
export const LIGHT_SLOW = 0.3;

/** Where gantry `i` of a stretch of traffic lights is in its bar at race time `t`, 0 to 1. */
export function lightPhase(t: number, period: number, i: number): number {
  const tt = (t + 10) / period - i * LIGHT_LAG;
  return tt - Math.floor(tt);
}

/** Which light a gantry shows at bar stage `u`: 0 green, 1 amber, 2 red. */
export function lightColour(u: number): 0 | 1 | 2 {
  return u < LIGHT_STAGES.amber ? 0 : u < LIGHT_STAGES.red ? 1 : 2;
}

/**
 * Empty's wanderers: "I'm wandering around so lazily". Rows of figures
 * drifting across the road in three-four, WANDER_COUNT to a row, spread
 * evenly across it: on the one of each bar they take a step, on the two
 * and three they sway where they stand, and they come out of nothing at
 * one edge and fade to nothing at the other, the next wandering on behind
 * them. All of them empty but one: coats and hats with nobody in them,
 * pale as the morning, and in each row one who isn't, the one you're
 * with, warm. Driven into an empty one you go right through it and it
 * empties you: the colour drains out of everything, your speed bleeds
 * away and the wheel wobbles. Through the one you're with, you don't feel
 * empty: a boost.
 */
export const WANDER_COUNT = 3;
/** Bars of the waltz a wanderer takes to cross: a step on the one of each. */
export const WANDER_BARS = 8;
/** How far past each edge of the road a wanderer comes out of nothing and fades back into it. */
export const WANDER_OUT = 3;
export const WANDER_RADIUS = 1.3;
/** Each row down a stretch is this share of a crossing behind the one before. */
export const WANDER_LAG = 0.29;
/** Emptied: you keep this share of your speed, and the wheel wobbles this long. */
export const WANDER_SLOW = 0.55;
export const WANDER_WOBBLE = 0.9;
/** Through the one you're with: a boost this long. */
export const WANDER_WARM = 1.0;

/** Where wanderer `k` of row `row` is in its crossing at race time `t`, 0 to 1. */
export function wanderPhase(t: number, period: number, row: number, k: number): number {
  const tt = (t + 10) / period + k / WANDER_COUNT - row * WANDER_LAG;
  return tt - Math.floor(tt);
}

/** How far across a wanderer has come at crossing stage `u`, 0 to 1: a step on the one of each bar, standing on the two and three. */
export function wanderStep(u: number): number {
  const q = u * WANDER_BARS;
  const bar = Math.floor(q);
  const f = Math.min(1, (q - bar) * 3);
  return (bar + f * f * (3 - 2 * f)) / WANDER_BARS;
}

/** Whether wanderer `k` of row `row` is the one you're with. */
export function wanderYou(row: number, k: number): boolean {
  return k === row % WANDER_COUNT;
}

/** How far a tree has toppled at cycle stage `u`: 0 upright, a lean while it creaks, 1 lying across the road. */
export function timberFall(u: number): number {
  const T = TIMBER_STAGES;
  if (u < T.lean) return 0;
  if (u < T.fall) return 0.12 * Math.sin(((u - T.lean) / (T.fall - T.lean)) * Math.PI * 6) ** 2;
  if (u < T.fall + 0.04) return ((u - T.fall) / 0.04) ** 2;
  return u < T.gone ? 1 : 0;
}

/** Where a patch of fuzz's needle stands at cycle stage `u`: 0 at rest, the gold band from 0.55 to 0.8, the red above. */
export function fuzzLevel(u: number): number {
  const F = FUZZ_STAGES;
  if (u < F.gold) return 0.55 * (u / F.gold);
  if (u < F.red) return 0.55 + (0.25 * (u - F.gold)) / (F.red - F.gold);
  if (u < F.fade) return 0.8 + 0.2 * Math.sin((Math.PI * (u - F.red)) / (F.fade - F.red));
  return 0.8 * (1 - (u - F.fade) / (1 - F.fade));
}

/** How high a solar flare's arch stands over the road at cycle stage `u`. */
export function flareHeight(u: number): number {
  const F = FLARE_STAGES;
  if (u < F.erupt || u >= F.done) return 0;
  if (u < F.lift) return FLARE_LOW;
  if (u < F.arch) return FLARE_LOW + ((FLARE_HEIGHT - FLARE_LOW) * (u - F.lift)) / (F.arch - F.lift);
  if (u < F.fall) return FLARE_HEIGHT;
  if (u < F.land) return FLARE_HEIGHT * (1 - ((u - F.fall) / (F.land - F.fall)) ** 2);
  return 0;
}

/** Throws a grounded kart up at `vy` with a trick window. */
function launch(s: KartState, vy: number): void {
  s.grounded = false;
  s.vy = Math.max(s.vy, vy);
  s.trickWindow = TRICK_WINDOW;
}
const SWIRL_PUSH: Partial<Record<HazardKind, number>> = { dustDevils: DEVIL_PUSH, butterflies: BUTTERFLY_PUSH, tornadoes: TORNADO_PUSH, blackHoles: HOLE_PUSH, wisps: WISP_PUSH };
/** A bolt strikes for this share of the cycle after its warning ring closes. */
export const LIGHTNING_STRIKE = 0.12;
const SPIN: Record<Exclude<HazardKind, 'dustDevils' | 'tumbleweeds' | 'butterflies' | 'tornadoes' | 'wisps'>, number> = {
  snakes: SNAKE_SPIN,
  fish: FISH_SPIN,
  iceBlocks: ICE_BLOCK_SPIN,
  lasers: LASER_SPIN,
  boulders: BOULDER_SPIN,
  lavaBombs: BOULDER_SPIN,
  flameJets: JET_SPIN,
  dragonFire: JET_SPIN,
  oilBombs: BOULDER_SPIN,
  meteors: BOULDER_SPIN,
  hail: BOULDER_SPIN,
  lightning: JET_SPIN,
  blackHoles: HOLE_SPIN,
  vines: VINE_SPIN,
  rollers: ROLLER_SPIN,
  stones: STONE_SPIN,
  gliders: GLIDER_SPIN,
  waves: WAVE_SPIN,
  crystals: ROLLER_SPIN,
  goblins: SNAKE_SPIN,
  jaws: SNAKE_SPIN,
  geysers: JET_SPIN,
  crushers: CRUSHER_SPIN,
  vesicles: ROLLER_SPIN,
  prisms: PRISM_SPIN,
  gusts: 0,
  robots: ROBOT_SPIN,
  gammaRays: GAMMA_SPIN,
  vultures: VULTURE_SPIN,
  wahs: WAH_SPIN,
  smog: 0,
  airlocks: AIRLOCK_SPIN,
  flares: FLARE_SPIN,
  rats: RAT_SPIN,
  eyes: EYE_SPIN,
  arrows: ARROW_SPIN,
  sheets: 0,
  fuzz: FUZZ_SPIN,
  elbows: ELBOW_SPIN,
  rakes: 0,
  razors: RAZOR_SPIN,
  timber: TIMBER_SPIN,
  cords: CORD_SPIN,
  sunMoon: SUN_SPIN,
  strings: STRING_SPIN,
  serpents: SERPENT_SPIN,
  cameras: 0,
  presents: PRESENT_SPIN,
  pills: PILL_SPIN,
  cutlery: CUTLERY_SPIN,
  bubbles: 0,
  fangs: FANG_SPIN,
  stomps: STOMP_SPIN,
  void: 0,
  magnets: 0,
  hammer: HAMMER_SPIN,
  autopilot: AUTOPILOT_SPIN,
  alphas: ALPHA_SPIN,
  sweepers: SWEEP_SPIN,
  sharks: SHARK_SPIN,
  rockyMeteors: METEOR_SPIN,
  dozes: 0,
  hellhounds: HOUND_SPIN,
  pistons: PISTON_SPIN,
  breaths: 0,
  trafficLights: LIGHT_SPIN,
  wanderers: 0,
};

/** Kinds that fill the whole road across, on a rhythm: nothing to steer round, only to time. */
export function isSheet(kind: HazardKind): boolean {
  return kind === 'flameJets' || kind === 'dragonFire' || kind === 'lasers' || kind === 'waves' || kind === 'gusts' || kind === 'prisms' || kind === 'flares' || kind === 'timber' || kind === 'cords' || kind === 'strings' || kind === 'fangs' || kind === 'dozes' || kind === 'breaths' || kind === 'trafficLights';
}

/** Which of a prism beam's four colours it is showing at cycle stage `u` (3 is the fourth colour), and whether it is lit. */
export function prismColour(u: number): { colour: number; lit: boolean } {
  const q = u * 4;
  const colour = Math.min(3, Math.floor(q));
  const w = q - colour;
  return { colour, lit: w >= PRISM_LIT[0] && w < PRISM_LIT[1] };
}

/** Kinds that swirl a kart round rather than hitting it. */
function isSwirl(kind: HazardKind): kind is 'dustDevils' | 'butterflies' | 'tornadoes' | 'wisps' {
  return kind === 'dustDevils' || kind === 'butterflies' || kind === 'tornadoes' || kind === 'wisps';
}

/** Kinds that drop from the sky and sit where they land, solid. */
export function isFalling(kind: HazardKind): boolean {
  return kind === 'boulders' || kind === 'lavaBombs' || kind === 'oilBombs' || kind === 'meteors' || kind === 'hail' || kind === 'gliders';
}

/** Boulder cycle stages, as fractions of the period. */
export const BOULDER_STAGES = { fall: 0.3, land: 0.4, crumble: 0.85 } as const;

/**
 * Track hazards (spec section 7). Every hazard's position is a pure
 * function of race time so they replay identically and can be synced over
 * the network by time alone; only per-kart hit cooldowns are state.
 */
export class HazardSystem {
  readonly poses: HazardPose[] = [];
  private readonly slots: { def: HazardDef; index: number }[] = [];
  private readonly cooldown = new Map<KartState, number>();
  /** Per kart: a hazard used well can't pay out again for this long. */
  private readonly rewarded = new Map<KartState, number>();
  private lastT = 0;

  constructor(private readonly track: Track) {
    for (const def of track.def.hazards) {
      const n = 'at' in def ? def.at.length : def.count;
      for (let i = 0; i < n; i++) {
        this.slots.push({ def, index: i });
        this.poses.push({ kind: def.kind, x: 0, y: 0, z: 0, heading: 0, radius: 0, ground: 0, ax: 0, az: 0, vx: 0, vz: 0, active: false, phase: 0, side: 0, gap: 0, lane: -1 });
      }
    }
    this.update(0);
  }

  /** Moves every hazard to where it is at race time `t`. */
  update(t: number): void {
    const dt = t - this.lastT;
    this.lastT = t;
    this.slots.forEach(({ def, index: i }, k) => {
      const p = this.poses[k];
      const x0 = p.x;
      const z0 = p.z;
      switch (def.kind) {
        case 'snakes':
        case 'rollers':
        case 'iceBlocks':
        case 'stones':
        case 'crystals':
        case 'goblins':
        case 'vesicles': {
          const s = def.from + ((def.to - def.from) * (i + 0.5)) / def.count;
          const roller = def.kind !== 'snakes';
          const size = def.kind === 'iceBlocks' ? ICE_BLOCK_RADIUS : def.kind === 'stones' ? STONE_RADIUS : def.kind === 'goblins' ? GOBLIN_RADIUS : def.kind === 'crystals' ? CRYSTAL_RADIUS : def.kind === 'vesicles' ? VESICLE_RADIUS : ROLLER_RADIUS;
          const hw = this.halfWidth(s) + (roller ? 1 : 2.5);
          const u = (((t + 10) / def.period + i * 0.37) % 1 + 1) % 1;
          // Triangle wave: edge to edge at a steady pace, then back.
          const lat = hw * (1 - 4 * Math.abs(u - 0.5));
          this.place(p, s, lat, roller ? size : 0);
          const dir = u < 0.5 ? -1 : 1; // lateral direction of travel
          p.heading = p.heading + (dir * Math.PI) / 2;
          p.radius = roller ? size : SNAKE_RADIUS;
          p.active = true;
          // Snakes: slither phase. Rollers: roll angle (distance over radius). Ice slides.
          p.phase = roller ? (lat + hw) / size : t * 9 + i;
          break;
        }
        case 'fish': {
          // Out of the water on one side, over the road, back in on the other; the next leap comes back.
          const tt = (t + 10) / def.period + i * 0.29;
          const cycle = Math.floor(tt);
          const jump = (tt - cycle) / FISH_AIR;
          const s = def.from + ((def.to - def.from) * (i + 0.5)) / def.count + Math.sin(cycle * 1.7 + i) * 6;
          const hw = this.halfWidth(s) + 3;
          const dir = cycle % 2 === 0 ? 1 : -1;
          const air = jump < 1;
          const lat = dir * hw * (air ? 2 * jump - 1 : 1);
          this.place(p, s, lat, air ? 0.5 + FISH_HEIGHT * 4 * jump * (1 - jump) : -2);
          p.heading -= (dir * Math.PI) / 2;
          p.radius = FISH_RADIUS;
          p.active = air;
          p.phase = air ? jump : -1;
          break;
        }
        case 'vines': {
          const at = def.at[i];
          const hw = this.halfWidth(at);
          const swing = Math.sin(((t + 10) / def.period) * Math.PI * 2 + i * 1.9);
          this.place(p, at, hw * 0.85 * swing, 1.1);
          p.radius = VINE_RADIUS;
          p.active = true;
          p.phase = swing;
          break;
        }
        case 'flameJets':
        case 'dragonFire':
        case 'lasers':
        case 'waves': {
          const at = def.at[i];
          this.place(p, at, 0, 0);
          const u = (((t + 10) / def.period + i * 0.31) % 1 + 1) % 1;
          p.radius = this.halfWidth(at) + 1;
          p.active = u >= JET_STAGES.fire;
          p.phase = u;
          break;
        }
        case 'gusts': {
          // Gathering at one edge (the warning), then blowing right across to the other; the next blows back.
          const at = def.at[i];
          this.place(p, at, 0, 0);
          const tt = (t + 10) / def.period + i * 0.31;
          const cycle = Math.floor(tt);
          const u = tt - cycle;
          p.radius = this.halfWidth(at) + 1;
          p.active = u >= GUST_STAGES.blow;
          p.phase = u;
          p.side = cycle % 2 === 0 ? 1 : -1;
          break;
        }
        case 'prisms': {
          const at = def.at[i];
          this.place(p, at, 0, 0);
          const u = (((t + 10) / def.period + i * 0.37) % 1 + 1) % 1;
          const { colour, lit } = prismColour(u);
          p.radius = this.halfWidth(at) + 1;
          // Red, green and blue hurt; the fourth colour is a boost (collide pays it out).
          p.active = lit;
          p.side = colour === 3 ? 1 : 0;
          p.phase = u;
          break;
        }
        case 'crushers': {
          // Masonry hanging over the road, alternating sides, shaking loose, then slamming down and hauling back up.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const lat = this.halfWidth(at) * 0.42 * ((cycle + i) % 2 === 0 ? 1 : -1);
          const C = CRUSHER_STAGES;
          let lift = CRUSHER_HANG;
          if (u >= C.slam && u < C.landed) lift = CRUSHER_HANG * (1 - ((u - C.slam) / (C.landed - C.slam)) ** 2);
          else if (u >= C.landed && u < C.rise) lift = 0;
          else if (u >= C.rise) lift = CRUSHER_HANG * Math.min(1, (u - C.rise) / (1 - C.rise) * 1.5);
          this.place(p, at, lat, lift);
          p.radius = CRUSHER_RADIUS;
          p.active = u >= C.slam && u < C.rise;
          p.phase = u;
          break;
        }
        case 'robots': {
          // Marching in from one edge, stopping dead in the middle of the road, marching off the other side; the next crossing comes back.
          const at = def.at[i];
          const tt = (t + 10) / def.period + i * 0.31;
          const cycle = Math.floor(tt);
          const u = tt - cycle;
          const side = cycle % 2 === 0 ? 1 : -1;
          const hw = this.halfWidth(at) + 1;
          const R = ROBOT_STAGES;
          const stopped = u >= R.stop && u < R.go;
          const walk = u < R.stop ? u / R.stop : u >= R.go ? (u - R.go) / (1 - R.go) : 0;
          // Halfway across while stopped (a little off centre, by the crossing); the rest of the way after.
          const pause = 0.15 * Math.sin(cycle * 1.9 + i);
          const lat = u < R.stop ? side * (hw - (hw + pause * hw) * walk) : stopped ? -side * pause * hw : -side * (pause * hw + (hw - pause * hw) * walk);
          this.place(p, at, lat, 0);
          p.heading = stopped ? p.heading : p.heading + (side * Math.PI) / 2;
          p.radius = ROBOT_RADIUS;
          p.active = true;
          p.side = side;
          p.phase = u;
          break;
        }
        case 'gammaRays': {
          // The beams converge on a point (the crosshair closing: the warning), then the burst at the focus.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const lat = this.halfWidth(at) * 0.55 * Math.sin(cycle * 2.39 + i * 1.3);
          this.place(p, at, lat, 0);
          p.radius = GAMMA_RADIUS;
          p.active = u >= GAMMA_STAGES.fire && u < GAMMA_STAGES.done;
          p.phase = u;
          break;
        }
        case 'vultures': {
          // Circling high over one spot (its shadow on the road), the dive, a swoop low along the road, and the climb away.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const lat = this.halfWidth(at) * 0.5 * Math.sin(cycle * 1.97 + i * 2.1);
          const V = VULTURE_STAGES;
          let along = -VULTURE_RUN / 2;
          let lift = VULTURE_HEIGHT;
          if (u >= V.dive && u < V.swoop) {
            const d = (u - V.dive) / (V.swoop - V.dive);
            along = -VULTURE_RUN / 2 - 10 * (1 - d);
            lift = 1.2 + (VULTURE_HEIGHT - 1.2) * (1 - d) ** 2;
          } else if (u >= V.swoop && u < V.climb) {
            along = -VULTURE_RUN / 2 + (VULTURE_RUN * (u - V.swoop)) / (V.climb - V.swoop);
            lift = 1.2;
          } else if (u >= V.climb) {
            const c = (u - V.climb) / (1 - V.climb);
            along = VULTURE_RUN / 2 + 10 * c;
            lift = 1.2 + (VULTURE_HEIGHT - 1.2) * c * c;
          }
          this.place(p, at + along, lat, lift);
          p.radius = VULTURE_RADIUS;
          p.active = u >= V.swoop && u < V.climb;
          p.phase = u;
          break;
        }
        case 'wahs': {
          // A pedal on the road, alternating sides: toe up, the stamp, stamped flat, and rocking back up.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const lat = this.halfWidth(at) * 0.4 * ((cycle + i) % 2 === 0 ? 1 : -1);
          this.place(p, at, lat, 0);
          p.radius = WAH_RADIUS;
          const W = WAH_STAGES;
          p.active = u >= W.stamp && u < W.rise;
          p.phase = u;
          break;
        }
        case 'smog': {
          // Belched out at one edge (gathering there: the warning), rolling across the road, thinning away; the next comes from the other side.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const side = (cycle + i) % 2 === 0 ? 1 : -1;
          // Just inside the edge, so it can be seen gathering between walls.
          const hw = this.halfWidth(at) - 1;
          const S = SMOG_STAGES;
          const k = u < S.roll ? 0 : u < S.clear ? (u - S.roll) / (S.clear - S.roll) : 1;
          this.place(p, at, side * hw * (1 - 2 * k), 1);
          p.radius = SMOG_RADIUS;
          p.active = u >= S.roll && u < S.clear;
          p.side = side;
          p.phase = u;
          break;
        }
        case 'airlocks': {
          // Two doors sliding in from the edges to a slit, holding it, and sliding back; where they meet moves from one closing to the next.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const hw = this.halfWidth(at);
          const A = AIRLOCK_STAGES;
          const c = hw * 0.45 * Math.sin(cycle * 2.13 + i * 1.7);
          let k = 0;
          if (u >= A.close && u < A.shut) k = (u - A.close) / (A.shut - A.close);
          else if (u >= A.shut && u < A.open) k = 1;
          else if (u >= A.open) k = Math.max(0, 1 - ((u - A.open) / (1 - A.open)) * 1.6);
          // Open, both doors stand back past the road's edges.
          const full = hw + 1 + Math.abs(c);
          this.place(p, at, c, 0);
          p.gap = full + (AIRLOCK_SLIT - full) * k * k * (3 - 2 * k);
          p.radius = hw + 1;
          p.active = k > 0;
          p.phase = u;
          break;
        }
        case 'flares': {
          // The whole road across: a loop of plasma boiling across it, lifting into an arch, crashing down.
          const at = def.at[i];
          this.place(p, at, 0, 0);
          const u = (((t + 10) / def.period + i * 0.37) % 1 + 1) % 1;
          const up = u >= FLARE_STAGES.erupt && u < FLARE_STAGES.done;
          const h = flareHeight(u);
          p.radius = this.halfWidth(at) + 1;
          // Low, it burns; arched high, it's a boost to drive under (collide pays it out).
          p.active = up && h < FLARE_CLEAR;
          p.side = up && h >= FLARE_CLEAR ? 1 : 0;
          p.phase = u;
          break;
        }
        case 'rats': {
          // Eyes in a hole at one edge (the warning), then the swarm pours out and streams right across and off the other side.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const side = (cycle + i) % 2 === 0 ? 1 : -1;
          const hw = this.halfWidth(at) + 2;
          const R = RAT_STAGES;
          const k = u < R.pour ? 0 : u < R.gone ? (u - R.pour) / (R.gone - R.pour) : 1;
          this.place(p, at, side * (hw - k * (2 * hw + RAT_LENGTH)), 0);
          // Heading the way the swarm runs; the stream trails behind the lead rat.
          p.heading += (side * Math.PI) / 2;
          p.radius = RAT_RADIUS;
          p.active = u >= R.pour && u < R.gone;
          p.side = side;
          p.phase = u;
          break;
        }
        case 'eyes': {
          // An eye opening over the road, an arrow in it pointing to one half; then it reads your mind and blasts the other half.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          this.place(p, at, 0, 0);
          p.radius = this.halfWidth(at) + 1;
          // Which half is safe changes from one reading to the next, but not so you can learn it.
          p.side = Math.sin(cycle * 2.71 + i * 1.3) >= 0 ? 1 : -1;
          p.active = u >= EYE_STAGES.read && u < EYE_STAGES.done;
          p.phase = u;
          break;
        }
        case 'arrows': {
          // Four arrows across the road: three flicker on and blaze, one isn't there, a different one each time.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          this.place(p, at, 0, 0);
          p.radius = this.halfWidth(at);
          p.lane = Math.floor((Math.sin(cycle * 12.9898 + i * 78.233) * 43758.5453 % 1 + 1) % 1 * ARROW_LANES);
          p.active = u >= ARROW_STAGES.lit && u < ARROW_STAGES.off;
          p.phase = u;
          break;
        }
        case 'sheets': {
          // Two sheets of cellophane sliding in from opposite edges, past each other, and off; where they cross moves each time.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const hw = this.halfWidth(at);
          const c = hw * 0.4 * Math.sin(cycle * 1.93 + i * 2.3);
          const S = SHEET_STAGES;
          const k = u < S.slide ? 0 : u < S.gone ? (u - S.slide) / (S.gone - S.slide) : 1;
          // Rolled up just past both edges, and off past them again.
          const full = hw + SHEET_HALF + 1 + Math.abs(c);
          this.place(p, at, c, 0);
          p.gap = full * (1 - 2 * k);
          p.radius = hw + 1;
          p.active = u >= S.slide && u < S.gone;
          p.phase = u;
          break;
        }
        case 'fuzz': {
          // A patch of fuzz on the road, alternating sides, its needle rising into the gold and on into the red.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const lat = this.halfWidth(at) * 0.4 * ((cycle + i) % 2 === 0 ? 1 : -1);
          this.place(p, at, lat, 0);
          p.radius = FUZZ_RADIUS;
          p.active = u >= FUZZ_STAGES.red && u < FUZZ_STAGES.fade;
          p.phase = u;
          break;
        }
        case 'elbows': {
          // An arm out of one wall: it cocks back, then throws its elbow across that half of the road. Which wall changes, but not so you can learn it.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          this.place(p, at, 0, 0);
          p.radius = this.halfWidth(at) + 1;
          p.side = Math.sin(cycle * 3.17 + i * 2.1) >= 0 ? 1 : -1;
          p.active = u >= ELBOW_STAGES.throw && u < ELBOW_STAGES.back;
          p.phase = u;
          break;
        }
        case 'rakes': {
          // Four lanes of muck: a rake drags one of them clean, a different one each time, and the rest heap up.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          this.place(p, at, 0, 0);
          p.radius = this.halfWidth(at);
          p.lane = Math.floor((((Math.sin(cycle * 19.19 + i * 47.11) * 24634.6345) % 1) + 1) % 1 * RAKE_LANES);
          p.active = u >= RAKE_STAGES.muck && u < RAKE_STAGES.dry;
          p.phase = u;
          break;
        }
        case 'razors': {
          // A cut-throat razor hung over the road, swinging edge to edge like a pendulum, slowest at the ends of its swing.
          const at = def.at[i];
          const u = ((((t + 10) / def.period + i * 0.31) % 1) + 1) % 1;
          const reach = this.halfWidth(at) - 0.5;
          const swing = Math.sin(u * Math.PI * 2);
          this.place(p, at, reach * swing, 0);
          p.radius = RAZOR_RADIUS;
          // Which way it's swinging: toward the right (1) or the left.
          p.side = Math.cos(u * Math.PI * 2) >= 0 ? 1 : -1;
          p.gap = reach;
          p.active = true;
          p.phase = u;
          break;
        }
        case 'timber': {
          // A tree at one edge leans out over the road, creaks, and comes down right across it; the trunk lies there, then it's cleared.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          this.place(p, at, 0, 0);
          p.radius = this.halfWidth(at) + 1;
          p.side = (cycle + i) % 2 === 0 ? 1 : -1;
          p.active = u >= TIMBER_STAGES.fall + 0.03 && u < TIMBER_STAGES.gone;
          p.phase = u;
          break;
        }
        case 'cords': {
          // A silver cord across the road: taut, fraying, snapping and lashing back to the walls, spun anew.
          const at = def.at[i];
          const u = ((((t + 10) / def.period + i * 0.37) % 1) + 1) % 1;
          this.place(p, at, 0, 0);
          p.radius = this.halfWidth(at) + 0.5;
          p.active = u >= CORD_STAGES.snap && u < CORD_STAGES.lash;
          p.phase = u;
          break;
        }
        case 'sunMoon': {
          // The sun and the moon rolling across the road, one each way, passing in the middle: an eclipse.
          const at = def.at[i];
          const u = ((((t + 10) / def.period + i * 0.29) % 1) + 1) % 1;
          const reach = this.halfWidth(at) + 1;
          const dir = i % 2 === 0 ? 1 : -1;
          const lat = dir * reach * Math.sin(u * Math.PI * 2);
          this.place(p, at, lat, 0);
          p.radius = SUN_RADIUS;
          p.gap = lat;
          p.side = dir * (Math.cos(u * Math.PI * 2) >= 0 ? 1 : -1);
          p.active = true;
          p.phase = u;
          break;
        }
        case 'strings': {
          // One string of the lyre: plucked in turn after the one before it, a bolt across the road, then humming.
          const at = def.at[i];
          const u = ((((t + 10) / def.period - i * STRING_LAG) % 1) + 1) % 1;
          this.place(p, at, 0, 0);
          p.radius = this.halfWidth(at) + 0.5;
          p.active = u >= STRING_STAGES.pluck && u < STRING_STAGES.hum;
          p.phase = u;
          break;
        }
        case 'fangs': {
          // A jaw across the road, snapping shut in turn after the one before it down the gullet, then opening.
          const at = def.at[i];
          const u = ((((t + 10) / def.period - i * FANG_LAG) % 1) + 1) % 1;
          this.place(p, at, 0, 0);
          p.radius = this.halfWidth(at) + 0.5;
          p.active = u >= FANG_STAGES.snap && u < FANG_STAGES.open;
          p.phase = u;
          break;
        }
        case 'serpents': {
          // The plant of immortality grows up through the road; the snake comes for it from one edge, eats it, and goes on over the other.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const hw = this.halfWidth(at);
          const dir = (cycle + i) % 2 === 0 ? 1 : -1;
          // Where the plant grows: somewhere across the road, not at the very edge.
          const plant = (hw - 2.5) * Math.sin(cycle * 2.39 + i * 1.3);
          const across = serpentAcross(u);
          const head = dir * across * (hw + 1);
          this.place(p, at, head, 0);
          // Facing across the road the way it slithers (a lateral to the right is -x in the road's frame).
          p.heading -= (dir * Math.PI) / 2;
          p.radius = SERPENT_RADIUS;
          p.side = dir;
          p.gap = plant;
          // The plant is there from when it sprouts until the snake's head reaches it.
          p.lane = u >= SERPENT_STAGES.sprout && dir * head < dir * plant ? 1 : 0;
          p.active = u >= SERPENT_STAGES.slither && u < SERPENT_STAGES.gone;
          p.phase = u;
          break;
        }
        case 'cameras': {
          // Two cameras up on the walls panning their beams across the road together, a gap between them. The pose is the left beam's spot; `gap` the gap's lateral.
          const at = def.at[i];
          const u = ((((t + 10) / def.period + i * 0.37) % 1) + 1) % 1;
          const hw = this.halfWidth(at);
          const mid = (hw - CAMERA_GAP / 2 - CAMERA_RADIUS) * cameraPan(u);
          this.place(p, at, mid - CAMERA_GAP / 2, 0);
          p.radius = hw;
          p.gap = mid;
          p.side = Math.cos(u * Math.PI * 2) >= 0 ? 1 : -1;
          p.active = true;
          p.phase = u;
          break;
        }
        case 'presents': {
          // Santa at one edge of the road tosses a present across it; it bounces, comes to rest, and is gone. Which edge, where it rests and whether it lands open change, but not so you can learn them.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const hw = this.halfWidth(at);
          const side = (cycle + i) % 2 === 0 ? 1 : -1;
          const from = side * (hw + PRESENT_EDGE);
          const rest = (hw - 2.5) * Math.sin(cycle * 2.39 + i * 1.3);
          // Santa's roof stands on the ground beside the road: over a road sunk in a cut, that much higher.
          this.place(p, at, from, 0);
          const roof = PRESENT_ROOF + Math.max(0, -p.ground);
          const f = presentFlight(u, roof);
          // Before the toss it's up in Santa's hands at the edge; after, gone.
          this.place(p, at, f ? from + (rest - from) * f.across : from, f ? f.lift : roof);
          p.radius = PRESENT_RADIUS;
          p.side = side;
          p.gap = from;
          p.lane = u >= PRESENT_STAGES.land && u < PRESENT_STAGES.gone && Math.floor(Math.abs(Math.sin(cycle * 12.9898 + i * 78.233) * 43758.5453)) % PRESENT_OPEN === 0 ? 1 : 0;
          p.active = !!f && f.lift < PRESENT_REACH;
          p.phase = u;
          break;
        }
        case 'pills': {
          // A capsule tumbling across the road, the right pill or the wrong one, the next crossing coming back.
          const at = def.at[i];
          const tt = (t + 10) / def.period - i * PILL_LAG;
          const cycle = Math.floor(tt);
          const u = tt - cycle;
          const hw = this.halfWidth(at);
          const dir = (cycle + i) % 2 === 0 ? 1 : -1;
          const across = u < PILL_STAGES.across ? pillAcross(u) : 1.25;
          this.place(p, at, dir * across * (hw + 3), PILL_RADIUS * 0.75);
          p.radius = PILL_RADIUS;
          p.side = dir;
          p.lane = rightPill(cycle, i) ? 1 : 0;
          p.active = u < PILL_STAGES.across && Math.abs(across) < 1.1;
          p.phase = u;
          break;
        }
        case 'cutlery': {
          // The beast's knife and fork: down into the road together somewhere across it, pulled apart to the edges, lifted; the hands swap each time. The pose is the knife; `gap` the fork's lateral, `side` the side the knife pulls to.
          const at = def.at[i];
          const { knife, fork, side, u } = cutleryAcross(t, def.period, i, this.halfWidth(at));
          this.place(p, at, knife, cutleryLift(u));
          p.radius = KNIFE_RADIUS;
          p.gap = fork;
          p.side = side;
          p.active = u >= CUTLERY_STAGES.stab && u < CUTLERY_STAGES.lift;
          p.phase = u;
          break;
        }
        case 'bubbles': {
          // A breath of air coming up through the road, somewhere across it, each a beat after the one before.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / 5;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const lat = this.halfWidth(at) * 0.55 * Math.sin(cycle * 2.39 + i * 1.7);
          this.place(p, at, lat, bubbleRise(u));
          p.radius = BUBBLE_RADIUS;
          // Harm only as it bursts; rising, it's there to be caught.
          p.active = u >= BUBBLE_STAGES.burst && u < BUBBLE_STAGES.gone;
          p.phase = u;
          break;
        }
        case 'stomps': {
          // A footfall: the foot comes down on one side of the road or the other, left foot and right, and its ring runs out across it.
          const at = def.at[i];
          const tt = (t + 10) / def.period + i * STOMP_LAG;
          const cycle = Math.floor(tt);
          const u = tt - cycle;
          const hw = this.halfWidth(at);
          const side = (cycle + i) % 2 === 0 ? 1 : -1;
          const lat = side * hw * 0.45;
          this.place(p, at, lat, stompLift(u));
          p.radius = STOMP_FOOT;
          p.side = side;
          // The ring runs out until it's past the far edge of the road.
          p.gap = stompRing(u, hw + Math.abs(lat) + 3);
          p.active = p.gap > 0;
          p.phase = u;
          break;
        }
        case 'void': {
          // A hollow in the road, somewhere across it, each in the row opening on its beat of the eleven.
          const at = def.at[i];
          const tt = (t + 10) / def.period - VOID_BEATS[i % VOID_BEATS.length] / 11;
          const cycle = Math.floor(tt);
          const u = tt - cycle;
          const lat = this.halfWidth(at) * 0.5 * Math.sin(cycle * 2.39 + i * 1.9);
          this.place(p, at, lat, 0);
          p.radius = VOID_RADIUS;
          // Dragging from when it yawns open until it starts to close; closing, its rim slings.
          p.active = u >= VOID_STAGES.yawn && u < VOID_STAGES.close;
          p.phase = u;
          break;
        }
        case 'magnets': {
          // A crane's magnet swinging across the road on its gantry, each down the row the other way from the one before.
          const at = def.at[i];
          const u = ((((t + 10) / def.period - i * MAGNET_LAG) % 1) + 1) % 1;
          const side = i % 2 ? -1 : 1;
          const hw = this.halfWidth(at);
          this.place(p, at, side * hw * MAGNET_SWING * magnetSwing(u), MAGNET_HANG);
          p.radius = MAGNET_FIELD;
          p.gap = hw;
          p.side = side;
          p.active = u >= MAGNET_STAGES.on && u < MAGNET_STAGES.off;
          p.phase = u;
          break;
        }
        case 'hammer': {
          // A hammer coming down a beat after the one before it down the stretch, on one side of the road and then the other.
          const at = def.at[i];
          const tt = (t + 10) / def.period - i / HAMMER_BEATS;
          const cycle = Math.floor(tt);
          const u = tt - cycle;
          const side = (cycle + i) % 2 === 0 ? 1 : -1;
          this.place(p, at, side * this.halfWidth(at) * 0.4, hammerLift(u));
          p.radius = HAMMER_FACE;
          p.side = side;
          p.gap = hammerSparking(u) ? HAMMER_SPARKS : 0;
          // From the instant it strikes until it lifts: there to be flattened by, and then to drive round.
          p.active = u >= HAMMER_STAGES.land - HAMMER_CRUSH && u < HAMMER_STAGES.lift;
          p.phase = u;
          break;
        }
        case 'autopilot': {
          // A driverless pod cruising its stretch, in its lane, nose to tail with the rest of its platoon.
          const length = def.to - def.from;
          const pod = autopilotPod(t, def.period, i, def.count, length);
          const s = def.from + pod.along;
          const hw = this.halfWidth(s);
          const a = autopilotLane(pod.from, hw);
          const b = autopilotLane(pod.lane, hw);
          this.place(p, s, a + (b - a) * pod.shift, 0);
          // Nosing over into the lane as it moves (a lateral to the right is a turn to the right, -h).
          if (pod.u < AUTOPILOT_STAGES.shift) {
            const x = pod.u / AUTOPILOT_STAGES.shift;
            p.heading -= Math.atan(((b - a) * 6 * x * (1 - x)) / (AUTOPILOT_STAGES.shift * def.period * AUTOPILOT_SPEED));
          }
          p.radius = AUTOPILOT_HALF_WIDTH;
          p.lane = pod.lane;
          // The blinker: toward the lane it's moving into, and late in the period toward the next.
          p.side = pod.u < AUTOPILOT_STAGES.shift ? Math.sign(pod.lane - pod.from) : pod.u >= AUTOPILOT_STAGES.blink ? Math.sign(pod.next - pod.lane) : 0;
          // Materialised: 0 (pixels) at either end of the stretch, 1 a little way in.
          p.gap = Math.max(0, Math.min(1, pod.along / AUTOPILOT_FADE, (length - pod.along) / AUTOPILOT_FADE));
          p.active = p.gap >= 1;
          p.phase = pod.u;
          break;
        }
        case 'alphas': {
          // A burst out of the nucleus, from the edge of the road nearer it, right across; the static wave in its wake.
          const at = def.at[i];
          const tt = (t + 10) / def.period + i * 0.29;
          const cycle = Math.floor(tt);
          const u = tt - cycle;
          const reach = this.halfWidth(at) + 1;
          this.place(p, at, 0, 0);
          let side = (cycle + i) % 2 === 0 ? 1 : -1;
          if (def.from) {
            // The nucleus's side of the road: a lateral to the right is (-cos h, sin h).
            const right = (def.from.x - p.ax) * -Math.cos(p.heading) + (def.from.z - p.az) * Math.sin(p.heading);
            side = right >= 0 ? 1 : -1;
          }
          const lead = alphaAcross(u, 0, reach);
          if (lead !== null) this.place(p, at, side * lead, ALPHA_LIFT);
          else this.place(p, at, side * reach, ALPHA_LIFT);
          p.radius = reach;
          p.side = side;
          p.gap = side * (lead ?? reach);
          // On the road while any of the three is still crossing it.
          const last = alphaAcross(u, ALPHA_COUNT - 1, reach);
          p.active = lead !== null && last !== null && lead < reach + ALPHA_RADIUS && last > -reach - ALPHA_RADIUS;
          p.lane = u >= ALPHA_STAGES.wake && u < ALPHA_STAGES.gone ? 1 : 0;
          p.phase = u;
          break;
        }
        case 'sweepers': {
          // A street sweeper parked off one edge, then right across the road to the other; one after another down the street, each coming back the next time.
          const at = def.at[i];
          const tt = (t + 10) / def.period + i * 0.25;
          const cycle = Math.floor(tt);
          const u = tt - cycle;
          const reach = this.halfWidth(at) + SWEEP_PARK;
          // The way it's heading this time: toward the right (1) or the left.
          const side = (cycle + i) % 2 === 0 ? 1 : -1;
          const lat = side * sweeperAcross(u, reach);
          this.place(p, at, lat, 0);
          p.radius = reach;
          p.side = side;
          p.gap = lat;
          p.active = u >= SWEEP_STAGES.go && u < SWEEP_STAGES.done;
          p.phase = u;
          break;
        }
        case 'sharks': {
          // A fin circling off one edge, then the shark cutting right across the road on a slant, and on.
          const at = def.at[i];
          const tt = (t + 10) / def.period + i * 0.37;
          const cycle = Math.floor(tt);
          const u = tt - cycle;
          const reach = this.halfWidth(at);
          const c = sharkCourse(u, cycle, i, reach);
          this.place(p, at + c.along, c.lateral, c.under ? -1.5 : 0);
          // Its heading: the road's, turned toward the way it's swimming (a lateral to the right is a turn to the right, -h).
          p.heading -= Math.atan2(c.dl, c.da);
          p.radius = SHARK_RADIUS;
          p.side = c.side;
          p.gap = c.lateral;
          // On the road while any of it is: biting distance.
          p.active = c.running && c.f <= 1 && Math.abs(c.lateral) <= reach + SHARK_HEAD + SHARK_RADIUS;
          // Its wake, trailing over the road behind it, while it runs.
          p.lane = c.running ? 1 : 0;
          p.phase = u;
          break;
        }
        case 'rockyMeteors': {
          // A rock with eyes falling onto the top of the climb, in a lane it picked, and rolling back down it.
          const length = def.to - def.from;
          const m = rockyMeteor(t, def.period, i, def.count, length);
          const s = def.to - m.along;
          const S = METEOR_STAGE;
          const lat = METEOR_LANES[m.lane] * (this.halfWidth(s) - METEOR_RADIUS);
          // Rolling, it bounces a little on the road; crumbling, it sinks into it.
          let lift = METEOR_RADIUS;
          if (m.stage === S.mark) lift += meteorHeight(m.u);
          else if (m.stage === S.roll) lift += 0.35 * Math.abs(Math.sin(m.along * 0.4));
          else if (m.stage === S.crumble) lift *= 1 - m.u;
          this.place(p, s, lat, lift);
          p.lane = m.stage;
          p.side = m.lane - 1;
          p.radius = m.stage === S.blast || m.stage === S.mark ? METEOR_BLAST : METEOR_RADIUS;
          p.active = m.stage === S.blast || m.stage === S.roll;
          // The mark: how near it is to landing. Rolling: how far it has turned over, rolling back down the road.
          p.phase = m.stage === S.mark || m.stage === S.crumble ? m.u : m.along / METEOR_RADIUS;
          break;
        }
        case 'dozes': {
          // A row of sleep right across the road, settling a beat after the row before it; its rumble strip rattles as it lifts.
          const at = def.at[i];
          const u = dozePhase(t, def.period, i);
          this.place(p, at, 0, 0);
          p.radius = this.halfWidth(at);
          // Nodded off with nothing to go by, you drift the way the row leans: alternate rows, alternate edges.
          p.side = i % 2 ? -1 : 1;
          p.active = u >= DOZE_STAGES.thick && u < DOZE_STAGES.lift;
          p.lane = u >= DOZE_STAGES.lift && u < DOZE_STAGES.clear ? 1 : 0;
          p.gap = dozeHaze(u);
          p.phase = u;
          break;
        }
        case 'hellhounds': {
          // A pack of hellhounds waiting in the den in one wall, then running right across the road into the other's, the scent stitched across first.
          const at = def.at[i];
          const { u, side } = houndPhase(t, def.period, i);
          const reach = this.halfWidth(at);
          const pack = houndPack(u, side, reach);
          // The pose is the lead hound's, the pack following it along its line; ax, az is the road's centre at the station, its frame.
          this.place(p, at, 0, 0);
          const fx = Math.sin(p.heading);
          const fz = Math.cos(p.heading);
          p.x = p.ax - fz * pack[0].lateral + fx * pack[0].along;
          p.z = p.az + fx * pack[0].lateral + fz * pack[0].along;
          p.radius = HOUND_RADIUS;
          p.side = side;
          p.gap = reach;
          p.active = pack.some((h) => h.out);
          // Running: the gap behind the pack is open.
          p.lane = u >= HOUND_STAGES.run && u < HOUND_STAGES.gone ? 1 : 0;
          p.phase = u;
          break;
        }
        case 'pistons': {
          // A piston in its row across the road, punching up on its beat of the bar.
          const at = def.at[i];
          const lane = i % PISTON_LANES;
          const row = Math.floor(i / PISTON_LANES);
          const hw = this.halfWidth(at);
          const u = pistonPhase(t, def.period, pistonBeat(row, lane, PISTON_LANES), PISTON_LANES);
          const lift = pistonLift(u);
          this.place(p, at, -hw + ((lane + 0.5) * 2 * hw) / PISTON_LANES, lift * PISTON_LIFT);
          p.radius = PISTON_RADIUS;
          p.lane = lane;
          p.gap = lift;
          p.active = u < PISTON_STAGES.drop;
          p.phase = u;
          break;
        }
        case 'breaths': {
          // One of Gaia's ribs across the road, heaving with all the others in one breath.
          const at = def.at[i];
          const u = breathPhase(t, def.period);
          this.place(p, at, 0, 0);
          p.radius = this.halfWidth(at);
          p.side = i % 2 ? -1 : 1;
          p.active = u >= BREATH_STAGES.exhale && u < BREATH_STAGES.empty;
          p.lane = u >= BREATH_STAGES.inhale && u < BREATH_STAGES.exhale ? 1 : 0;
          p.gap = breathLift(u);
          p.phase = u;
          break;
        }
        case 'wanderers': {
          // A wanderer drifting across the road in three-four with the rest of its row, out of nothing at one edge and into nothing at the other; alternate rows the other way.
          const at = def.at[i];
          const row = Math.floor(i / WANDER_COUNT);
          const k = i % WANDER_COUNT;
          const u = wanderPhase(t, def.period, row, k);
          const reach = this.halfWidth(at) + WANDER_OUT;
          const dir = row % 2 ? -1 : 1;
          const lat = dir * (-reach + 2 * reach * wanderStep(u));
          this.place(p, at, lat, 0);
          p.radius = WANDER_RADIUS;
          p.side = dir;
          p.lane = wanderYou(row, k) ? 1 : 0;
          p.gap = Math.min(1, Math.max(0, (reach - Math.abs(lat)) / WANDER_OUT));
          p.active = p.gap > 0.5;
          p.phase = u;
          break;
        }
        case 'trafficLights': {
          // A gantry of lights over the road, changing on the waltz's beats a little after the one before it.
          const at = def.at[i];
          const u = lightPhase(t, def.period, i);
          this.place(p, at, 0, 0);
          p.radius = this.halfWidth(at);
          p.lane = lightColour(u);
          p.active = p.lane === 2;
          // How far through its beat the light is, 0 to 1.
          p.gap = (u * 3) % 1;
          // The gale rocks each gantry its own way.
          p.side = i % 2 ? -1 : 1;
          p.phase = u;
          break;
        }
        case 'dustDevils':
        case 'butterflies':
        case 'tornadoes':
        case 'blackHoles':
        case 'wisps': {
          const s = def.from + (def.to - def.from) * (0.5 + 0.45 * Math.sin(t * 0.11 * (1 + i * 0.4) + i * 2.1));
          const lat = this.halfWidth(s) * 0.7 * Math.sin(t * 0.33 + i * 1.7);
          this.place(p, s, lat, def.kind === 'blackHoles' ? 1.2 : def.kind === 'wisps' ? 1 : 0);
          p.radius = { dustDevils: DEVIL_RADIUS, butterflies: BUTTERFLY_RADIUS, tornadoes: TORNADO_RADIUS, blackHoles: HOLE_RADIUS, wisps: WISP_RADIUS }[def.kind];
          p.active = true;
          p.phase = t * 7;
          break;
        }
        case 'tumbleweeds': {
          const len = def.to - def.from;
          const s = def.to - ((t * TUMBLEWEED_SPEED + (i * len) / def.count) % len);
          const lat = this.halfWidth(s) * 0.6 * Math.sin(t * 0.8 + i * 2.3);
          const bounce = Math.abs(Math.sin(t * 3.4 + i)) * 1.6;
          this.place(p, s, lat, TUMBLEWEED_RADIUS + bounce);
          p.heading += Math.PI; // rolling against the traffic
          p.radius = TUMBLEWEED_RADIUS;
          p.active = true;
          p.phase = bounce;
          break;
        }
        case 'jaws': {
          // A fin circles off one edge of the road (the warning), then the pliosaur lunges over that edge and snaps.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const side = cycle % 2 === 0 ? 1 : -1;
          const hw = this.halfWidth(at);
          const lunge = u >= BOULDER_STAGES.land ? Math.min(1, (u - BOULDER_STAGES.land) / JAWS_LUNGE) : 0;
          // Out in the water while it circles; across the road's edge as it lunges.
          this.place(p, at, side * (hw + 6 - lunge * (6 + hw * 0.45)), 0);
          p.heading -= (side * Math.PI) / 2;
          p.radius = JAWS_RADIUS;
          // Biting once it's halfway over the edge.
          p.active = u >= BOULDER_STAGES.land + JAWS_LUNGE * 0.5 && u < BOULDER_STAGES.land + JAWS_LUNGE * 1.4;
          p.phase = u;
          break;
        }
        case 'geysers': {
          // Bubbling over the warning, then a column of water for a moment.
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const lat = this.halfWidth(at) * 0.5 * Math.sin(cycle * 1.97 + i * 2.1);
          this.place(p, at, lat, 0);
          p.radius = GEYSER_RADIUS;
          p.active = u >= BOULDER_STAGES.land && u < BOULDER_STAGES.land + GEYSER_ERUPT;
          p.phase = u;
          break;
        }
        case 'lightning': {
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const lat = this.halfWidth(at) * 0.6 * Math.sin(cycle * 2.39 + i * 1.3);
          this.place(p, at, lat, 0);
          p.radius = LIGHTNING_RADIUS;
          // The warning ring closes over the fall; the bolt hits as it lands.
          p.active = u >= BOULDER_STAGES.land && u < BOULDER_STAGES.land + LIGHTNING_STRIKE;
          p.phase = u;
          break;
        }
        case 'boulders':
        case 'lavaBombs':
        case 'oilBombs':
        case 'meteors':
        case 'hail':
        case 'gliders': {
          const at = def.at[i];
          const tt = t + 10 + (i * def.period) / def.at.length;
          const cycle = Math.floor(tt / def.period);
          const u = tt / def.period - cycle;
          const lat = this.halfWidth(at) * 0.55 * Math.sin(cycle * 2.39 + i * 1.3);
          let lift = 0;
          if (u < BOULDER_STAGES.fall) lift = BOULDER_DROP;
          else if (u < BOULDER_STAGES.land) lift = BOULDER_DROP * (1 - ((u - BOULDER_STAGES.fall) / (BOULDER_STAGES.land - BOULDER_STAGES.fall)) ** 2);
          else if (u > BOULDER_STAGES.crumble) lift = -BOULDER_RADIUS * 2 * ((u - BOULDER_STAGES.crumble) / (1 - BOULDER_STAGES.crumble));
          this.place(p, at, lat, BOULDER_RADIUS + lift);
          p.radius = BOULDER_RADIUS;
          // Dangerous from just before it lands until it starts to crumble.
          p.active = u > BOULDER_STAGES.land - 0.02 && u < BOULDER_STAGES.crumble;
          p.phase = u;
          break;
        }
      }
      const fresh = dt > 0 && dt < 0.5;
      p.vx = fresh ? (p.x - x0) / dt : 0;
      p.vz = fresh ? (p.z - z0) / dt : 0;
    });
  }

  /**
   * Hits karts touching an active hazard. Returns the karts that got hit
   * (spun or slowed) and by what; `good` marks a hazard used well, which
   * helps rather than hurts (see the reward rules above).
   */
  collide(karts: readonly KartState[], dt: number): { kart: KartState; by: HazardKind; good?: boolean; gift?: boolean }[] {
    const hit: { kart: KartState; by: HazardKind; good?: boolean; gift?: boolean }[] = [];
    for (const map of [this.cooldown, this.rewarded]) {
      for (const [k, v] of map) {
        if (v - dt <= 0) map.delete(k);
        else map.set(k, v - dt);
      }
    }
    for (const s of karts) {
      for (const p of this.poses) {
        if (Math.abs(s.y - p.ground) > 2.2) continue;
        // A gate warming up is a gap to slip through, and a boost for making it.
        if (WARMING.has(p.kind) && !p.active) {
          if (p.phase >= JET_STAGES.sputter && this.distance(p, s) <= p.radius + KART_RADIUS) this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, GATE_BOOST)));
          continue;
        }
        if (p.kind === 'crushers') {
          this.crush(hit, p, s);
          continue;
        }
        if (p.kind === 'airlocks') {
          this.airlock(hit, p, s);
          continue;
        }
        if (p.kind === 'eyes') {
          this.eye(hit, p, s);
          continue;
        }
        if (p.kind === 'arrows') {
          this.arrowRow(hit, p, s);
          continue;
        }
        if (p.kind === 'sheets') {
          this.cellophane(hit, p, s);
          continue;
        }
        if (p.kind === 'elbows') {
          this.elbow(hit, p, s);
          continue;
        }
        if (p.kind === 'rakes') {
          this.muck(hit, p, s);
          continue;
        }
        if (p.kind === 'razors') {
          this.razor(hit, p, s);
          continue;
        }
        if (p.kind === 'cords') {
          this.cord(hit, p, s);
          continue;
        }
        if (p.kind === 'sunMoon') {
          this.sunAndMoon(hit, p, s);
          continue;
        }
        if (p.kind === 'strings') {
          this.lyreString(hit, p, s);
          continue;
        }
        if (p.kind === 'serpents') {
          this.serpent(hit, p, s);
          continue;
        }
        if (p.kind === 'fangs') {
          this.fang(hit, p, s);
          continue;
        }
        if (p.kind === 'cameras') {
          this.camera(hit, p, s);
          continue;
        }
        if (p.kind === 'presents') {
          this.present(hit, p, s);
          continue;
        }
        if (p.kind === 'pills') {
          this.pill(hit, p, s);
          continue;
        }
        if (p.kind === 'cutlery') {
          this.cutlery(hit, p, s);
          continue;
        }
        if (p.kind === 'bubbles') {
          this.bubble(hit, p, s);
          continue;
        }
        if (p.kind === 'stomps') {
          this.stomp(hit, p, s);
          continue;
        }
        if (p.kind === 'void') {
          this.hollow(hit, p, s);
          continue;
        }
        if (p.kind === 'magnets') {
          this.magnet(hit, p, s, dt);
          continue;
        }
        if (p.kind === 'hammer') {
          this.hammer(hit, p, s);
          continue;
        }
        if (p.kind === 'autopilot') {
          this.pod(hit, p, s);
          continue;
        }
        if (p.kind === 'sharks') {
          this.shark(hit, p, s);
          continue;
        }
        if (p.kind === 'alphas') {
          this.alpha(hit, p, s);
          continue;
        }
        if (p.kind === 'sweepers') {
          this.sweeper(hit, p, s);
          continue;
        }
        if (p.kind === 'rockyMeteors') {
          this.meteor(hit, p, s);
          continue;
        }
        if (p.kind === 'dozes') {
          this.doze(hit, p, s);
          continue;
        }
        if (p.kind === 'hellhounds') {
          this.hound(hit, p, s);
          continue;
        }
        if (p.kind === 'pistons') {
          this.piston(hit, p, s);
          continue;
        }
        if (p.kind === 'breaths') {
          this.breath(hit, p, s);
          continue;
        }
        if (p.kind === 'trafficLights') {
          this.trafficLight(hit, p, s);
          continue;
        }
        if (p.kind === 'wanderers') {
          this.wanderer(hit, p, s);
          continue;
        }
        if (p.kind === 'fuzz' && p.phase >= FUZZ_STAGES.gold && p.phase < FUZZ_STAGES.red) {
          // The needle in the gold: ride the fuzz, a boost.
          if (this.distance(p, s) <= p.radius + KART_RADIUS) this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, FUZZ_GOLD_BOOST)));
          continue;
        }
        if (p.kind === 'gammaRays' && !p.active) {
          // The crosshair nearly closed: slip through it and the knife misses, a boost.
          if (p.phase >= GAMMA_EDGE && p.phase < GAMMA_STAGES.fire && this.distance(p, s) <= p.radius + KART_RADIUS) this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, GAMMA_BOOST)));
          continue;
        }
        if (p.kind === 'flares' && p.side === 1) {
          // Arched high overhead: under it, the solar wind is a boost.
          if (this.distance(p, s) <= p.radius + KART_RADIUS) this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, FLARE_BOOST)));
          continue;
        }
        if (!p.active) continue;
        const d = this.distance(p, s);
        if (d > p.radius + KART_RADIUS) continue;
        if (p.kind === 'robots') {
          // Stopped dead, it is a block to drive round and a ramp to hop onto; marching, it walks straight into you.
          if (p.phase >= ROBOT_STAGES.stop && p.phase < ROBOT_STAGES.go) {
            if (s.hopAge < HOP_WINDOW || !s.grounded) this.reward(hit, s, p.kind, () => launch(s, RAMP_LAUNCH));
            else this.pushOut(p, s);
            continue;
          }
        }
        if (p.kind === 'vultures') {
          // Hop as it swoops and it carries you: up, and on with a boost. Caught flat, it knocks you flying.
          if (s.hopAge < HOP_WINDOW || !s.grounded) {
            this.reward(hit, s, p.kind, () => {
              launch(s, VULTURE_LIFT);
              s.boostTime = Math.max(s.boostTime, VULTURE_BOOST);
            });
            continue;
          }
        }
        if (p.kind === 'wahs') {
          const W = WAH_STAGES;
          if (p.phase >= W.down) {
            // Stamped flat: a springboard, hopped onto; otherwise a pedal to drive round, or up and over as it rocks back.
            if (s.hopAge < HOP_WINDOW || !s.grounded) {
              this.reward(hit, s, p.kind, () => {
                launch(s, WAH_SPRING);
                s.boostTime = Math.max(s.boostTime, WAH_BOOST);
              });
            } else if (p.phase < W.rise) this.pushOut(p, s);
            continue;
          }
          // The stamp: squashed.
          if (this.cooldown.has(s)) continue;
          this.cooldown.set(s, HIT_COOLDOWN);
          if (spinOut(s, WAH_SPIN)) {
            s.speed *= WAH_SLOW;
            hit.push({ kart: s, by: p.kind });
          }
          continue;
        }
        if (p.kind === 'smog') {
          // Hop into it and its heat carries you up; blast through it on a boost and the boost runs on; otherwise it chokes you.
          if (s.hopAge < HOP_WINDOW || !s.grounded) {
            this.reward(hit, s, p.kind, () => launch(s, SMOG_LIFT));
            continue;
          }
          if (s.boostTime > 0) {
            this.reward(hit, s, p.kind, () => (s.boostTime += RAM_BOOST));
            continue;
          }
          if (this.cooldown.has(s)) continue;
          this.cooldown.set(s, HIT_COOLDOWN);
          s.speed *= SMOG_SLOW;
          hit.push({ kart: s, by: p.kind });
          continue;
        }
        if (p.kind === 'fuzz') {
          // Into the red: it clips, and you're spun out.
          if (this.cooldown.has(s)) continue;
          this.cooldown.set(s, HIT_COOLDOWN);
          if (spinOut(s, FUZZ_SPIN)) {
            s.speed *= FUZZ_SLOW;
            hit.push({ kart: s, by: p.kind });
          }
          continue;
        }
        if (isSwirl(p.kind)) {
          this.swirl(p, s, dt);
          if (p.kind === 'wisps' && d < WISP_CORE + KART_RADIUS) {
            // Right through the middle of the ghost lights: they carry you.
            this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, WISP_BOOST)));
          } else if ((p.kind === 'dustDevils' || p.kind === 'tornadoes') && s.hopAge < UPDRAFT_HOP) {
            // Hop in the wind and it throws you up: airtime and a trick.
            this.reward(hit, s, p.kind, () => launch(s, p.kind === 'tornadoes' ? TORNADO_LIFT : DEVIL_LIFT));
          } else if (p.kind === 'butterflies' && s.driftDir !== 0) {
            // Drifting on the wings of the swarm charges the sparks faster.
            s.driftCharge += dt * WING_CHARGE;
            this.reward(hit, s, p.kind, () => {});
          }
          continue;
        }
        // Something that has come down is a ramp to fly off, hopped onto; driven into, it's as solid as a boulder.
        if (RAMPS.has(p.kind) && p.phase >= BOULDER_STAGES.land && s.hopAge < HOP_WINDOW) {
          this.reward(hit, s, p.kind, () => launch(s, RAMP_LAUNCH));
          continue;
        }
        if (p.kind === 'blackHoles') {
          this.swirl(p, s, dt);
          // Skim the edge on a boost: a gravity assist, the boost running on.
          if (s.boostTime > 0 && d > HOLE_CORE + KART_RADIUS) {
            s.boostTime += dt * GRAVITY_ASSIST;
            this.reward(hit, s, p.kind, () => {});
          }
          if (d > HOLE_CORE + KART_RADIUS) continue;
        }
        if (p.kind === 'gusts') {
          // Hop as it blows and you catch the wind; otherwise it shoves you across the road, once a gust.
          if (s.hopAge < HOP_WINDOW || !s.grounded) this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, GUST_BOOST)));
          else if (!this.cooldown.has(s)) {
            this.cooldown.set(s, HIT_COOLDOWN);
            const rx = -Math.cos(p.heading);
            const rz = Math.sin(p.heading);
            s.extX += rx * p.side * GUST_SHOVE;
            s.extZ += rz * p.side * GUST_SHOVE;
            hit.push({ kart: s, by: p.kind });
          }
          continue;
        }
        if (p.kind === 'prisms' && p.side === 1) {
          // The fourth colour: a boost.
          this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, PRISM_BOOST)));
          continue;
        }
        if (p.kind === 'vesicles') {
          // Hopped onto, it bounces you up high; driven into, it bounces you back.
          if (s.hopAge < HOP_WINDOW || !s.grounded) {
            this.reward(hit, s, p.kind, () => launch(s, VESICLE_BOUNCE));
            continue;
          }
          this.pushOut(p, s);
          if (this.cooldown.has(s)) continue;
          this.cooldown.set(s, HIT_COOLDOWN);
          s.speed *= VESICLE_SLOW;
          s.vy = Math.max(s.vy, 3);
          hit.push({ kart: s, by: p.kind });
          continue;
        }
        if (p.kind === 'geysers') {
          // An eruption throws you up whatever you do: hopped onto, you ride it high on a boost; caught, it costs you speed.
          // (Not one it has just thrown: that kart is in the air too.)
          if ((s.hopAge < HOP_WINDOW || !s.grounded) && !this.cooldown.has(s)) {
            this.reward(hit, s, p.kind, () => {
              launch(s, GEYSER_RIDE);
              s.boostTime = Math.max(s.boostTime, HOP_BOOST);
            });
          } else if (!this.cooldown.has(s)) {
            this.cooldown.set(s, HIT_COOLDOWN);
            launch(s, GEYSER_THROW);
            s.speed *= GEYSER_SLOW;
            hit.push({ kart: s, by: p.kind });
          }
          continue;
        }
        // Rammed on a boost it gives way and the boost runs on; hopped as it comes, it's ridden.
        const rammed = RAMMABLE.has(p.kind) && s.boostTime > 0;
        const hopped = HOPPABLE.has(p.kind) && (!s.grounded || s.hopAge < HOP_WINDOW);
        if (rammed || hopped) {
          this.reward(hit, s, p.kind, () => (rammed ? (s.boostTime += RAM_BOOST) : (s.boostTime = Math.max(s.boostTime, p.kind === 'waves' ? WAVE_SURF : HOP_BOOST))));
          continue;
        }
        if (isFalling(p.kind)) this.pushOut(p, s);
        if (this.cooldown.has(s)) continue;
        this.cooldown.set(s, HIT_COOLDOWN);
        if (p.kind === 'tumbleweeds') {
          s.speed *= TUMBLEWEED_SLOW;
          s.vy = Math.max(s.vy, 2.5);
          hit.push({ kart: s, by: p.kind });
        } else if (spinOut(s, SPIN[p.kind])) {
          hit.push({ kart: s, by: p.kind });
        }
      }
    }
    return hit;
  }

  /** Circles for CPU avoidance, including boulders about to land. */
  obstacles(out: { x: number; z: number; r: number; vx: number; vz: number }[]): void {
    for (const [k, p] of this.poses.entries()) {
      if (isSheet(p.kind)) continue; // the whole road: nothing to steer around
      if (p.kind === 'airlocks') {
        // From just before they close until they open: the doors where they will be when shut, so the slit is lined up early.
        if (p.phase < AIRLOCK_STAGES.close - 0.1 || p.phase > AIRLOCK_STAGES.open) continue;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const c = (p.x - p.ax) * -fz + (p.z - p.az) * fx;
        for (const side of [-1, 1]) {
          for (let l = c + side * (AIRLOCK_SLIT + 1.2); Math.abs(l) < p.radius + 1; l += side * 2.4) out.push({ x: p.ax - fz * l, z: p.az + fx * l, r: 1.5, vx: 0, vz: 0 });
        }
        continue;
      }
      if (p.kind === 'eyes') {
        // From the arrow on, the half it doesn't point to.
        if (p.phase < EYE_STAGES.show || p.phase >= EYE_STAGES.done) continue;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        for (let l = 1.2; l < p.radius; l += 2.4) {
          const lat = -p.side * l;
          out.push({ x: p.ax - fz * lat, z: p.az + fx * lat, r: 1.5, vx: 0, vz: 0 });
        }
        continue;
      }
      if (p.kind === 'arrows') {
        // From when they flicker on: the three lanes with arrows in them.
        if (p.phase < ARROW_STAGES.show || p.phase >= ARROW_STAGES.off) continue;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const w = (2 * p.radius) / ARROW_LANES;
        for (let k = 0; k < ARROW_LANES; k++) {
          if (k === p.lane) continue;
          const lat = -p.radius + w * (k + 0.5);
          out.push({ x: p.ax - fz * lat, z: p.az + fx * lat, r: w / 2, vx: 0, vz: 0 });
        }
        continue;
      }
      if (p.kind === 'elbows') {
        // From when it cocks back, the half it'll come across.
        if (p.phase < ELBOW_STAGES.cock || p.phase >= ELBOW_STAGES.back) continue;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        for (let l = 1.2; l < p.radius; l += 2.4) {
          const lat = p.side * l;
          out.push({ x: p.ax - fz * lat, z: p.az + fx * lat, r: 1.5, vx: 0, vz: 0 });
        }
        continue;
      }
      if (p.kind === 'rakes') {
        // From when the rake drags: the three lanes it leaves to the muck.
        if (p.phase < RAKE_STAGES.drag || p.phase >= RAKE_STAGES.dry) continue;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const w = (2 * p.radius) / RAKE_LANES;
        for (let k = 0; k < RAKE_LANES; k++) {
          if (k === p.lane) continue;
          const lat = -p.radius + w * (k + 0.5);
          out.push({ x: p.ax - fz * lat, z: p.az + fx * lat, r: w / 2, vx: 0, vz: 0 });
        }
        continue;
      }
      if (p.kind === 'sunMoon') {
        // The sun, rolling across: the moon is there to drive into.
        out.push({ x: p.x, z: p.z, r: p.radius, vx: p.vx, vz: p.vz });
        continue;
      }
      if (p.kind === 'cameras') {
        // The two beams' spots, panning across.
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        for (const side of [-1, 1]) {
          const lat = p.gap + (side * CAMERA_GAP) / 2;
          out.push({ x: p.ax - fz * lat, z: p.az + fx * lat, r: CAMERA_RADIUS, vx: p.vx, vz: p.vz });
        }
        continue;
      }
      if (p.kind === 'serpents') {
        // The snake and the body trailing it, while it's on the road.
        if (!p.active) continue;
        const bx = -Math.sin(p.heading) * SERPENT_LENGTH * 0.5;
        const bz = -Math.cos(p.heading) * SERPENT_LENGTH * 0.5;
        out.push({ x: p.x + bx, z: p.z + bz, r: SERPENT_LENGTH * 0.5 + p.radius, vx: p.vx, vz: p.vz });
        continue;
      }
      if (p.kind === 'presents') {
        // A shut present on the road, or about to come down on it; an open one is there to drive into.
        if (p.lane === 1 || !p.active) continue;
        out.push({ x: p.x, z: p.z, r: p.radius, vx: p.vx, vz: p.vz });
        continue;
      }
      if (p.kind === 'cutlery') {
        // From just before they come down until they're lifted: the fork, and the knife's blade along the road.
        if (p.phase < CUTLERY_STAGES.stab - 0.08 || p.phase >= CUTLERY_STAGES.lift) continue;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        out.push({ x: p.ax - fz * p.gap, z: p.az + fx * p.gap, r: FORK_RADIUS, vx: 0, vz: 0 });
        for (const d of [-1, 0, 1]) out.push({ x: p.x + fx * d * (KNIFE_LENGTH / 3), z: p.z + fz * d * (KNIFE_LENGTH / 3), r: KNIFE_LENGTH / 4, vx: p.vx, vz: p.vz });
        continue;
      }
      if (p.kind === 'stomps') {
        // The foot, from just before it comes down until it lifts away; the ring runs right across the road, nothing to steer round.
        if (p.phase < STOMP_STAGES.fall - 0.12 || p.phase >= STOMP_STAGES.lift) continue;
        out.push({ x: p.x, z: p.z, r: p.radius, vx: 0, vz: 0 });
        continue;
      }
      if (p.kind === 'bubbles') {
        // From just before it bursts: as far as the burst reaches.
        if (p.phase < BUBBLE_STAGES.burst - 0.1 || p.phase >= BUBBLE_STAGES.gone) continue;
        out.push({ x: p.x, z: p.z, r: p.radius * BUBBLE_BURST, vx: 0, vz: 0 });
        continue;
      }
      if (p.kind === 'alphas') {
        // From just before the burst until the last of it is across: each alpha, streaking over the road.
        if (p.phase < ALPHA_STAGES.fire - 0.06 || p.phase >= ALPHA_STAGES.wake) continue;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const { def } = this.slots[k];
        const speed = (2 * (p.radius + 2 * ALPHA_RADIUS) + (ALPHA_COUNT - 1) * ALPHA_GAP) / ((ALPHA_STAGES.wake - ALPHA_STAGES.fire) * ('period' in def ? def.period : 5));
        for (let n = 0; n < ALPHA_COUNT; n++) {
          const lat = p.side * (alphaAcross(Math.max(p.phase, ALPHA_STAGES.fire), n, p.radius) ?? 0);
          out.push({ x: p.ax - fz * lat, z: p.az + fx * lat, r: ALPHA_RADIUS, vx: fz * p.side * speed, vz: -fx * p.side * speed });
        }
        continue;
      }
      if (p.kind === 'sweepers') {
        // From its warning until it's across: the machine and its brushes, moving across the road.
        if (p.phase < SWEEP_STAGES.warn || p.phase >= SWEEP_STAGES.done) continue;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const { def } = this.slots[k];
        const speed = (2 * p.radius) / ((SWEEP_STAGES.done - SWEEP_STAGES.go) * ('period' in def ? def.period : 5));
        for (const d of [-1.4, 1.4]) {
          const lat = p.gap + p.side * d;
          out.push({ x: p.ax - fz * lat, z: p.az + fx * lat, r: 2, vx: -fz * p.side * speed, vz: fx * p.side * speed });
        }
        continue;
      }
      if (p.kind === 'rockyMeteors') {
        // Its mark, from when it's seen coming down, the burst, and the rock rolling down its lane at you.
        const S = METEOR_STAGE;
        if (p.lane === S.mark && p.phase < 1 - METEOR_FALL / METEOR_MARK) continue;
        if (p.lane === S.gone || p.lane === S.crumble) continue;
        out.push({ x: p.x, z: p.z, r: p.radius, vx: p.vx, vz: p.vz });
        continue;
      }
      if (p.kind === 'magnets') {
        // From when it starts to charge until it switches off: its field, sweeping across the road.
        if (p.phase < MAGNET_STAGES.charge || p.phase >= MAGNET_STAGES.off) continue;
        out.push({ x: p.x, z: p.z, r: p.radius, vx: p.vx, vz: p.vz });
        continue;
      }
      if (p.kind === 'void') {
        // From just before it yawns open until it closes: the whole hollow.
        if (p.phase < VOID_STAGES.yawn - 0.1 || p.phase >= VOID_STAGES.close) continue;
        out.push({ x: p.x, z: p.z, r: p.radius, vx: 0, vz: 0 });
        continue;
      }
      if (p.kind === 'hammer') {
        // The face, from a little before it comes down until it lifts; the sparks after are there to be driven through.
        if (p.phase < HAMMER_STAGES.fall - 0.1 || p.phase >= HAMMER_STAGES.lift) continue;
        out.push({ x: p.x, z: p.z, r: p.radius, vx: 0, vz: 0 });
        continue;
      }
      if (p.kind === 'hellhounds') {
        // From just before they burst out until they're in the far den: each hound out of its den, head to tail, and where the next will be.
        if (p.phase < HOUND_STAGES.run - 0.06 || p.phase >= HOUND_STAGES.gone) continue;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const { def } = this.slots[k];
        const speed = (2 * (p.gap + HOUND_OUT) + (HOUND_COUNT - 1) * HOUND_SPACING) / ((HOUND_STAGES.gone - HOUND_STAGES.run) * ('period' in def ? def.period : 5));
        for (const h of houndPack(Math.max(p.phase, HOUND_STAGES.run), p.side, p.gap)) {
          if (!h.out && p.phase >= HOUND_STAGES.run) continue;
          out.push({ x: p.ax - fz * h.lateral + fx * h.along, z: p.az + fx * h.lateral + fz * h.along, r: 1.6, vx: -fz * p.side * speed, vz: fx * p.side * speed });
        }
        continue;
      }
      if (p.kind === 'sharks') {
        // A shark on its run, head to tail, crossing the road.
        if (!p.active) continue;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        for (const d of [SHARK_HEAD, 0, -SHARK_TAIL]) out.push({ x: p.x + fx * d, z: p.z + fz * d, r: 1.4, vx: p.vx, vz: p.vz });
        continue;
      }
      if (p.kind === 'autopilot') {
        // A pod, nose and tail, moving on down its lane.
        if (!p.active) continue;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        for (const d of [-1.1, 1.1]) out.push({ x: p.x + fx * d, z: p.z + fz * d, r: 1.5, vx: p.vx, vz: p.vz });
        continue;
      }
      if (p.kind === 'sheets') {
        // Each sheet where it is, moving across the road.
        if (!p.active) continue;
        const fx = Math.sin(p.heading);
        const fz = Math.cos(p.heading);
        const { def } = this.slots[k];
        const speed = (2 * (p.radius + SHEET_HALF)) / ((SHEET_STAGES.gone - SHEET_STAGES.slide) * ('period' in def ? def.period : 5));
        for (const side of [-1, 1]) {
          const x = p.x - fz * side * p.gap;
          const z = p.z + fx * side * p.gap;
          // The first sheet runs to the right, the second to the left.
          out.push({ x, z, r: SHEET_HALF, vx: -fz * -side * speed, vz: fx * -side * speed });
        }
        continue;
      }
      if (p.kind === 'wanderers') {
        // An empty one, drifting across: steer round it (the one you're with is there to drive through).
        if (!p.active || p.lane === 1) continue;
        out.push({ x: p.x, z: p.z, r: p.radius + 0.4, vx: p.vx, vz: p.vz });
        continue;
      }
      if (p.kind === 'pistons') {
        // From its hiss until it drops back flush: the piston, punching up or standing.
        if (p.phase >= PISTON_STAGES.drop && p.phase < PISTON_STAGES.warn) continue;
        out.push({ x: p.x, z: p.z, r: p.radius + 0.5, vx: 0, vz: 0 });
        continue;
      }
      const falling = isFalling(p.kind);
      if (p.kind === 'lightning' || p.kind === 'geysers' || p.kind === 'jaws') {
        if (p.phase < BOULDER_STAGES.fall * 0.5 || p.phase > BOULDER_STAGES.land + LIGHTNING_STRIKE) continue;
      } else if (p.kind === 'crushers') {
        // From when it starts shaking loose until it is hauled back up out of the way.
        if (p.phase < CRUSHER_STAGES.shake || p.phase > CRUSHER_STAGES.rise + 0.05) continue;
      } else if (p.kind === 'gammaRays') {
        if (p.phase < GAMMA_STAGES.aim || p.phase > GAMMA_STAGES.done) continue;
      } else if (p.kind === 'wahs') {
        // From just before the stamp until the pedal is back up.
        if (p.phase < WAH_STAGES.stamp - 0.08 || p.phase > WAH_STAGES.rise) continue;
      } else if (falling ? p.phase > BOULDER_STAGES.crumble || p.phase < BOULDER_STAGES.fall * 0.5 : !p.active) continue;
      if (p.kind === 'snakes' || p.kind === 'rats') {
        // The body (or the stream of rats) trails the head: aim to miss its middle.
        const len = p.kind === 'rats' ? RAT_LENGTH : SNAKE_LENGTH;
        const bx = -Math.sin(p.heading) * len * 0.5;
        const bz = -Math.cos(p.heading) * len * 0.5;
        out.push({ x: p.x + bx, z: p.z + bz, r: len * 0.5 + p.radius, vx: p.vx, vz: p.vz });
      } else {
        out.push({ x: p.x, z: p.z, r: p.radius, vx: p.vx, vz: p.vz });
      }
    }
  }

  /**
   * A crusher: caught under it as it slams, you're squashed; just ahead of
   * it, its shockwave throws you on; once it's down it's a block to drive round.
   */
  private crush(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active) return;
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    const C = CRUSHER_STAGES;
    const slamming = p.phase >= C.slam && p.phase < C.landed + 0.02;
    if (d <= p.radius + KART_RADIUS) {
      if (!slamming) {
        this.pushOut(p, s);
        return;
      }
      if (this.cooldown.has(s)) return;
      this.cooldown.set(s, HIT_COOLDOWN);
      if (spinOut(s, CRUSHER_SPIN)) {
        s.speed *= CRUSHER_SLOW;
        hit.push({ kart: s, by: p.kind });
      }
      return;
    }
    // The shockwave, as it lands: only for a kart past it, going away.
    const ahead = (s.x - p.x) * Math.sin(p.heading) + (s.z - p.z) * Math.cos(p.heading) > 0;
    if (p.phase >= C.landed - 0.01 && p.phase < C.landed + 0.03 && ahead && d <= p.radius + KART_RADIUS + SHOCKWAVE_REACH) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, SHOCKWAVE_BOOST)));
    }
  }

  /**
   * An airlock: caught by either door as it closes (or once it's shut),
   * you're spun out; through the slit while it's shut to one, a boost.
   */
  private airlock(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active) return;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    if (Math.abs((s.x - p.x) * fx + (s.z - p.z) * fz) > AIRLOCK_DEPTH + KART_RADIUS) return;
    const across = Math.abs((s.x - p.x) * -fz + (s.z - p.z) * fx);
    if (across + KART_RADIUS <= p.gap) {
      if (p.phase >= AIRLOCK_STAGES.shut && p.phase < AIRLOCK_STAGES.open) this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, AIRLOCK_BOOST)));
      return;
    }
    // Past the frame at the road's edge there's no door.
    if (Math.abs((s.x - p.ax) * -fz + (s.z - p.az) * fx) > p.radius + KART_RADIUS) return;
    if (this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (spinOut(s, AIRLOCK_SPIN)) {
      s.speed *= AIRLOCK_SLOW;
      hit.push({ kart: s, by: p.kind });
    }
  }

  /**
   * An eye reading your mind: on the half of the road its arrow points to,
   * a boost; on the other half, it blasts you.
   */
  private eye(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active) return;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    if (Math.abs((s.x - p.x) * fx + (s.z - p.z) * fz) > EYE_DEPTH + KART_RADIUS) return;
    const lat = (s.x - p.x) * -fz + (s.z - p.z) * fx;
    if (Math.abs(lat) > p.radius + KART_RADIUS) return;
    if (lat * p.side > 0) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, EYE_BOOST)));
      return;
    }
    if (this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (spinOut(s, EYE_SPIN)) hit.push({ kart: s, by: p.kind });
  }

  /**
   * A row of four arrows across the road: while they're lit, the three
   * arrows zap you; the lane with no arrow in it is a boost.
   */
  private arrowRow(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active) return;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    if (Math.abs((s.x - p.x) * fx + (s.z - p.z) * fz) > ARROW_DEPTH + KART_RADIUS) return;
    const lat = (s.x - p.x) * -fz + (s.z - p.z) * fx;
    if (Math.abs(lat) > p.radius + KART_RADIUS) return;
    const w = (2 * p.radius) / ARROW_LANES;
    const lane = Math.max(0, Math.min(ARROW_LANES - 1, Math.floor((lat + p.radius) / w)));
    if (lane === p.lane) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, ARROW_BOOST)));
      return;
    }
    if (this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (spinOut(s, ARROW_SPIN)) {
      s.speed *= ARROW_SLOW;
      hit.push({ kart: s, by: p.kind });
    }
  }

  /**
   * Two sheets of cellophane: caught in one you're wrapped up and slowed;
   * through where they overlap, lined up, a boost.
   */
  private cellophane(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active) return;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    if (Math.abs((s.x - p.x) * fx + (s.z - p.z) * fz) > SHEET_DEPTH + KART_RADIUS) return;
    const x = (s.x - p.x) * -fz + (s.z - p.z) * fx;
    const g = Math.abs(p.gap);
    if (g < SHEET_HALF && Math.abs(x) <= SHEET_HALF - g) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, SHEET_BOOST)));
      return;
    }
    if (Math.abs(x - g) > SHEET_HALF + KART_RADIUS && Math.abs(x + g) > SHEET_HALF + KART_RADIUS) return;
    if (this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    s.speed *= SHEET_SLOW;
    hit.push({ kart: s, by: p.kind });
  }

  /**
   * An elbow thrown across half the road: in that half, elbowed, spun and
   * shoved across; past it on the other half as it's thrown, a boost.
   */
  private elbow(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active) return;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    if (Math.abs((s.x - p.x) * fx + (s.z - p.z) * fz) > ELBOW_DEPTH + KART_RADIUS) return;
    const lat = (s.x - p.x) * -fz + (s.z - p.z) * fx;
    if (Math.abs(lat) > p.radius + KART_RADIUS) return;
    if (lat * p.side < 0) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, ELBOW_BOOST)));
      return;
    }
    if (this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (spinOut(s, ELBOW_SPIN)) {
      // Knocked away from the wall it came out of.
      s.extX += fz * p.side * ELBOW_SHOVE;
      s.extZ -= fx * p.side * ELBOW_SHOVE;
      hit.push({ kart: s, by: p.kind });
    }
  }

  /**
   * Four lanes of muck: down the furrow the rake dragged clean, a boost;
   * through the heaps either side, bogged down and slowed.
   */
  private muck(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active) return;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    if (Math.abs((s.x - p.x) * fx + (s.z - p.z) * fz) > RAKE_DEPTH + KART_RADIUS) return;
    const lat = (s.x - p.x) * -fz + (s.z - p.z) * fx;
    if (Math.abs(lat) > p.radius + KART_RADIUS) return;
    const w = (2 * p.radius) / RAKE_LANES;
    const lane = Math.max(0, Math.min(RAKE_LANES - 1, Math.floor((lat + p.radius) / w)));
    if (lane === p.lane) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, RAKE_BOOST)));
      return;
    }
    if (this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    s.speed *= RAKE_SLOW;
    hit.push({ kart: s, by: p.kind });
  }

  /**
   * A swinging razor: touched, it cuts you and you spin; past it at speed,
   * inches from the blade, a close shave and a boost.
   */
  private razor(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    const d = this.distance(p, s);
    if (d <= p.radius + KART_RADIUS) {
      if (this.cooldown.has(s)) return;
      this.cooldown.set(s, HIT_COOLDOWN);
      if (spinOut(s, RAZOR_SPIN)) hit.push({ kart: s, by: p.kind });
      return;
    }
    if (d <= p.radius + KART_RADIUS + RAZOR_SHAVE && Math.abs(s.speed) >= RAZOR_SHAVE_SPEED && !this.cooldown.has(s)) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, RAZOR_BOOST)));
    }
  }

  /**
   * A silver cord across the road: through it while it's taut, it slings
   * you on; caught as it snaps and lashes back, you spin.
   */
  private cord(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    if (Math.abs((s.x - p.x) * fx + (s.z - p.z) * fz) > CORD_DEPTH + KART_RADIUS) return;
    if (Math.abs((s.x - p.x) * -fz + (s.z - p.z) * fx) > p.radius + KART_RADIUS) return;
    if (p.phase < CORD_STAGES.fray) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, CORD_BOOST)));
      return;
    }
    if (!p.active || this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (spinOut(s, CORD_SPIN)) hit.push({ kart: s, by: p.kind });
  }

  /**
   * The sun and the moon rolling across the road: touch the sun and you're
   * scorched and spun; through the moon, a moonbeam boost. Where they pass,
   * the moon covers the sun.
   */
  private sunAndMoon(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    const mx = p.ax - fz * -p.gap;
    const mz = p.az + fx * -p.gap;
    const r = p.radius + KART_RADIUS;
    if (Math.hypot(s.x - mx, s.z - mz) <= r) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, MOON_BOOST)));
      return;
    }
    if (this.distance(p, s) > r || this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (spinOut(s, SUN_SPIN)) {
      s.speed *= SUN_SLOW;
      hit.push({ kart: s, by: p.kind });
    }
  }

  /** A lightning string: plucked as you cross it, a bolt that spins you; still humming after, a boost. */
  private lyreString(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    if (Math.abs((s.x - p.x) * fx + (s.z - p.z) * fz) > STRING_DEPTH + KART_RADIUS) return;
    if (Math.abs((s.x - p.x) * -fz + (s.z - p.z) * fx) > p.radius + KART_RADIUS) return;
    if (p.phase >= STRING_STAGES.hum && p.phase < STRING_STAGES.fade) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, STRING_BOOST)));
      return;
    }
    if (!p.active || this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (spinOut(s, STRING_SPIN)) {
      s.speed *= STRING_SLOW;
      hit.push({ kart: s, by: p.kind });
    }
  }

  /**
   * A jaw of nine pearl fangs: shut, it bites (spun out); driven through
   * as it opens again, through the gap between its fangs, a boost.
   */
  private fang(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    if (Math.abs((s.x - p.x) * fx + (s.z - p.z) * fz) > FANG_DEPTH + KART_RADIUS) return;
    if (Math.abs((s.x - p.x) * -fz + (s.z - p.z) * fx) > p.radius + KART_RADIUS) return;
    if (p.phase >= FANG_STAGES.open && p.phase < FANG_STAGES.wide) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, FANG_BOOST)));
      return;
    }
    if (!p.active || this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (spinOut(s, FANG_SPIN)) hit.push({ kart: s, by: p.kind });
  }

  /**
   * The plant of immortality and the snake: reach the plant before the
   * snake eats it, a long boost; the snake bites what it touches, unless
   * it's hopped.
   */
  private serpent(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (p.lane === 1) {
      // The plant, `gap` to the right of the road's centre (the snake faces across the road, so the road's heading is a quarter turn from its own).
      const road = p.heading + (p.side * Math.PI) / 2;
      const px = p.ax - Math.cos(road) * p.gap;
      const pz = p.az + Math.sin(road) * p.gap;
      if (Math.hypot(s.x - px, s.z - pz) <= PLANT_RADIUS + KART_RADIUS) {
        this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, PLANT_BOOST)));
        return;
      }
    }
    if (!p.active || this.distance(p, s) > p.radius + KART_RADIUS) return;
    if (!s.grounded || s.hopAge < HOP_WINDOW) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, HOP_BOOST)));
      return;
    }
    if (this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (spinOut(s, SERPENT_SPIN)) hit.push({ kart: s, by: p.kind });
  }

  /**
   * Two surveillance cameras' beams: caught in either, seen and slowed;
   * through the gap between them as they pan, clear of both, a boost.
   */
  private camera(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    const along = (s.x - p.ax) * fx + (s.z - p.az) * fz;
    if (Math.abs(along) > CAMERA_RADIUS + KART_RADIUS) return;
    const lat = (s.x - p.ax) * -fz + (s.z - p.az) * fx;
    for (const side of [-1, 1]) {
      if (Math.hypot(along, lat - p.gap - (side * CAMERA_GAP) / 2) > CAMERA_RADIUS + KART_RADIUS) continue;
      if (this.cooldown.has(s)) return;
      this.cooldown.set(s, HIT_COOLDOWN);
      s.speed *= CAMERA_SLOW;
      hit.push({ kart: s, by: p.kind });
      return;
    }
    if (Math.abs(along) <= CAMERA_DEPTH && Math.abs(lat - p.gap) <= CAMERA_GAP / 2 - CAMERA_RADIUS - KART_RADIUS) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, CAMERA_BOOST)));
    }
  }

  /**
   * Santa's present: landed open, a gift (a boost here, and an item from the
   * race); shut, it spins you, unless you ram it on a boost and it bursts.
   */
  private present(hit: { kart: KartState; by: HazardKind; good?: boolean; gift?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active || this.distance(p, s) > p.radius + KART_RADIUS) return;
    if (p.lane === 1) {
      const before = hit.length;
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, PRESENT_BOOST)));
      if (hit.length > before) hit[before].gift = true;
      return;
    }
    if (s.boostTime > 0) {
      this.reward(hit, s, p.kind, () => (s.boostTime += RAM_BOOST));
      return;
    }
    if (this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (spinOut(s, PRESENT_SPIN)) hit.push({ kart: s, by: p.kind });
  }

  /**
   * A capsule tumbling across the road: through the right pill, a boost;
   * the wrong one spins you out, and the steering swims for a while after.
   */
  private pill(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active || Math.hypot(s.x - p.x, s.z - p.z) > p.radius + KART_RADIUS) return;
    if (p.lane === 1) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, PILL_BOOST)));
      return;
    }
    if (this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (spinOut(s, PILL_SPIN)) {
      s.wobbleTime = PILL_SWIM;
      hit.push({ kart: s, by: p.kind });
    }
  }

  /**
   * The beast's knife and fork, down in the road: the knife's blade along
   * it or the fork's tines, and you spin; threaded through between them as
   * they pull apart, while they're still close, a boost.
   */
  private cutlery(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active) return;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    const along = (s.x - p.ax) * fx + (s.z - p.az) * fz;
    const lat = (s.x - p.ax) * -fz + (s.z - p.az) * fx;
    const knife = (p.x - p.ax) * -fz + (p.z - p.az) * fx;
    const blade = Math.hypot(Math.max(0, Math.abs(along) - KNIFE_LENGTH / 2), lat - knife) <= KNIFE_RADIUS + KART_RADIUS;
    const tines = Math.hypot(along, lat - p.gap) <= FORK_RADIUS + KART_RADIUS;
    if (blade || tines) {
      if (this.cooldown.has(s)) return;
      this.cooldown.set(s, HIT_COOLDOWN);
      if (spinOut(s, CUTLERY_SPIN)) hit.push({ kart: s, by: p.kind });
      return;
    }
    if (p.phase < CUTLERY_STAGES.pull || Math.abs(knife - p.gap) > CUTLERY_THREAD || Math.abs(along) > CUTLERY_DEPTH) return;
    const lo = Math.min(knife, p.gap);
    const hi = Math.max(knife, p.gap);
    if (lat > lo && lat < hi) this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, CUTLERY_BOOST)));
  }

  /**
   * A breath of air: caught as it rises, it floats you up and you come down
   * on a boost; driven into as it bursts, it knocks you aside.
   */
  private bubble(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    if (p.phase >= BUBBLE_STAGES.rise && p.phase < BUBBLE_STAGES.burst) {
      if (d > p.radius + KART_RADIUS) return;
      this.reward(hit, s, p.kind, () => {
        launch(s, BUBBLE_LIFT);
        s.trick = true;
      });
      return;
    }
    if (!p.active || d > p.radius * BUBBLE_BURST + KART_RADIUS || this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    // Away from where it burst, across the road.
    const rx = -Math.cos(p.heading);
    const rz = Math.sin(p.heading);
    const side = (s.x - p.x) * rx + (s.z - p.z) * rz >= 0 ? 1 : -1;
    s.extX += rx * side * BUBBLE_SHOVE;
    s.extZ += rz * side * BUBBLE_SHOVE;
    s.speed *= BUBBLE_SLOW;
    hit.push({ kart: s, by: p.kind });
  }

  /**
   * A beast's footfall: under the foot as it stamps, trampled; planted, a
   * foot to drive round. Its ring running out across the road: caught on
   * the ground, your feet stick to the terrain and you're slowed; hopped as
   * it passes, a boost.
   */
  private stomp(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    const S = STOMP_STAGES;
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    if (d <= p.radius + KART_RADIUS && p.phase >= S.land - STOMP_CRUSH && p.phase < S.lift) {
      if (p.phase >= S.land + STOMP_CRUSH) {
        this.pushOut(p, s);
        return;
      }
      if (this.cooldown.has(s)) return;
      this.cooldown.set(s, HIT_COOLDOWN);
      if (spinOut(s, STOMP_SPIN)) hit.push({ kart: s, by: p.kind });
      return;
    }
    if (!p.active || Math.abs(d - p.gap) > STOMP_BAND / 2 + KART_RADIUS) return;
    if (!s.grounded || s.hopAge < HOP_WINDOW) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, STOMP_BOOST)));
      return;
    }
    if (this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    s.speed *= STOMP_SLOW;
    hit.push({ kart: s, by: p.kind });
  }

  /**
   * A hollow in the road: over it while it's open, it drags you down,
   * slowed; on its rim as it closes, it slings you on, a boost.
   */
  private hollow(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    const r = voidRadius(p.phase);
    if (r <= 0) return;
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    if (p.phase >= VOID_STAGES.close) {
      if (Math.abs(d - r) <= VOID_RIM + KART_RADIUS) this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, VOID_SLING)));
      return;
    }
    if (d > r || this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    s.speed *= VOID_SLOW;
    hit.push({ kart: s, by: p.kind });
  }

  /**
   * A crane's magnet: switched on, its field drags a kart under it toward
   * it, steel and all, and holds it back; under it as it switches off, the
   * kart is flung on, a boost.
   */
  private magnet(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState, dt: number): void {
    const dx = p.x - s.x;
    const dz = p.z - s.z;
    const d = Math.hypot(dx, dz);
    if (d > p.radius + KART_RADIUS) return;
    if (p.phase >= MAGNET_STAGES.off && p.phase < MAGNET_STAGES.flung) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, MAGNET_FLING)));
      return;
    }
    if (!p.active) return;
    if (d > 0.5) {
      s.extX += (dx / d) * MAGNET_PULL * dt;
      s.extZ += (dz / d) * MAGNET_PULL * dt;
    }
    s.speed *= MAGNET_GRIP ** dt;
    if (this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    hit.push({ kart: s, by: p.kind });
  }

  /**
   * The astral blacksmith's hammer: under its face as it strikes,
   * flattened, spun out; resting on the road, a block to drive round.
   * Through the shower of sparks off the strike, a fix: a boost.
   */
  private hammer(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    const H = HAMMER_STAGES;
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    if (p.active && d <= p.radius + KART_RADIUS) {
      if (p.phase >= H.land + HAMMER_CRUSH) {
        this.pushOut(p, s);
        return;
      }
      if (this.cooldown.has(s)) return;
      this.cooldown.set(s, HIT_COOLDOWN);
      if (spinOut(s, HAMMER_SPIN)) hit.push({ kart: s, by: p.kind });
      return;
    }
    if (p.gap > 0 && d <= p.gap + KART_RADIUS) this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, HAMMER_FIX)));
  }

  /**
   * A driverless pod: driven into, it spins you out; tucked in behind it,
   * in its lane and going its way faster than it does, its slipstream tows
   * you on, a boost.
   */
  private pod(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active) return;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    const dx = s.x - p.x;
    const dz = s.z - p.z;
    const along = dx * fx + dz * fz;
    const across = dx * -fz + dz * fx;
    if (Math.abs(along) <= AUTOPILOT_HALF_LENGTH + KART_RADIUS && Math.abs(across) <= AUTOPILOT_HALF_WIDTH + KART_RADIUS) {
      if (this.cooldown.has(s)) return;
      this.cooldown.set(s, HIT_COOLDOWN);
      if (spinOut(s, AUTOPILOT_SPIN)) hit.push({ kart: s, by: p.kind });
      return;
    }
    const behind = -along - AUTOPILOT_HALF_LENGTH;
    if (behind <= 0 || behind > AUTOPILOT_DRAFT || Math.abs(across) > AUTOPILOT_DRAFT_WIDTH) return;
    if (s.speed <= AUTOPILOT_SPEED || Math.cos(s.heading - p.heading) < 0.9 || this.cooldown.has(s)) return;
    this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, AUTOPILOT_TOW)));
  }

  /**
   * A shark cutting across the shallows: driven into, head to tail, it
   * bites, spun; slipped past just behind it, through its wake, a boost.
   */
  private shark(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (p.lane !== 1) return;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    const along = (s.x - p.x) * fx + (s.z - p.z) * fz;
    const across = Math.abs((s.x - p.x) * -fz + (s.z - p.z) * fx);
    // Its body: a segment from tail to head.
    if (p.active && along >= -SHARK_TAIL - SHARK_RADIUS - KART_RADIUS && along <= SHARK_HEAD + SHARK_RADIUS + KART_RADIUS) {
      const d = Math.hypot(Math.max(0, Math.abs(along - (SHARK_HEAD - SHARK_TAIL) / 2) - (SHARK_HEAD + SHARK_TAIL) / 2), across);
      if (d <= SHARK_RADIUS + KART_RADIUS) {
        if (this.cooldown.has(s)) return;
        this.cooldown.set(s, HIT_COOLDOWN);
        if (spinOut(s, SHARK_SPIN)) hit.push({ kart: s, by: p.kind });
        return;
      }
    }
    // Its wake: behind the tail, along its line.
    const behind = -along - SHARK_TAIL - SHARK_RADIUS;
    if (behind < 0 || behind > SHARK_WAKE || across > SHARK_WAKE_WIDTH || s.speed < 8 || this.cooldown.has(s)) return;
    this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, SHARK_BOOST)));
  }

  /**
   * A burst of alphas across the road: hit by one, spun, the screen full of
   * static (game.ts); through the static wave in their wake, a jumpstart.
   */
  private alpha(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    const along = (s.x - p.ax) * fx + (s.z - p.az) * fz;
    const lat = (s.x - p.ax) * -fz + (s.z - p.az) * fx;
    if (p.lane === 1) {
      if (Math.abs(along) <= ALPHA_DEPTH + KART_RADIUS && Math.abs(lat) <= p.radius) this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, ALPHA_BOOST)));
      return;
    }
    if (!p.active || Math.abs(along) > ALPHA_RADIUS + KART_RADIUS) return;
    for (let n = 0; n < ALPHA_COUNT; n++) {
      const a = alphaAcross(p.phase, n, p.radius);
      if (a === null || Math.hypot(along, lat - p.side * a) > ALPHA_RADIUS + KART_RADIUS) continue;
      if (this.cooldown.has(s)) return;
      this.cooldown.set(s, HIT_COOLDOWN);
      if (spinOut(s, ALPHA_SPIN)) hit.push({ kart: s, by: p.kind });
      return;
    }
  }

  /**
   * A street sweeper crossing the road: caught in it or its brushes, swept
   * aside the way it's going, spun, and digitised (game.ts); through the
   * clean wake just behind it, on the road it has this moment swept, a boost.
   */
  private sweeper(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active) return;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    if (Math.abs((s.x - p.ax) * fx + (s.z - p.az) * fz) > SWEEP_DEPTH + KART_RADIUS) return;
    const lat = (s.x - p.ax) * -fz + (s.z - p.az) * fx;
    // How far ahead of it, the way it's going (behind it is negative).
    const ahead = (lat - p.gap) * p.side;
    if (Math.abs(ahead) <= SWEEP_HALF + KART_RADIUS) {
      if (this.cooldown.has(s)) return;
      this.cooldown.set(s, HIT_COOLDOWN);
      if (spinOut(s, SWEEP_SPIN)) {
        s.extX -= fz * p.side * SWEEP_SHOVE;
        s.extZ += fx * p.side * SWEEP_SHOVE;
        hit.push({ kart: s, by: p.kind });
      }
      return;
    }
    if (ahead < 0 && ahead >= -SWEEP_HALF - SWEEP_WAKE && Math.abs(lat) <= p.radius - SWEEP_PARK + KART_RADIUS && !this.cooldown.has(s)) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, SWEEP_BOOST)));
    }
  }

  /**
   * A rocky meteor: under it as it lands, blasted and spun; in its way as it
   * rolls down at you, pushed down and spun, unless you hop it (cleared, a
   * boost) or ram it on a boost (it bursts, and the boost runs on).
   */
  private meteor(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active || Math.hypot(s.x - p.x, s.z - p.z) > p.radius + KART_RADIUS) return;
    if (p.lane === METEOR_STAGE.roll) {
      if (!s.grounded || s.hopAge < HOP_WINDOW) {
        this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, METEOR_CLEAR)));
        return;
      }
      if (s.boostTime > 0) {
        this.reward(hit, s, p.kind, () => (s.boostTime += RAM_BOOST));
        return;
      }
      this.pushOut(p, s);
    }
    if (this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (spinOut(s, METEOR_SPIN)) hit.push({ kart: s, by: p.kind });
  }

  /**
   * A row of sleep: in its haze while it lies thick, you nod off at the
   * wheel (your speed bleeds away, the wheel wobbles and you drift toward
   * the edge you're nearer); over its rumble strip while it rattles, as the
   * haze lifts, you're jolted awake, a boost.
   */
  private doze(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    const along = (s.x - p.x) * fx + (s.z - p.z) * fz;
    // A lateral to the right is (-cos h, sin h).
    const lat = (s.x - p.x) * -fz + (s.z - p.z) * fx;
    if (Math.abs(along) > DOZE_DEPTH + KART_RADIUS || Math.abs(lat) > p.radius + KART_RADIUS) return;
    if (p.lane === 1) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, DOZE_WAKE)));
      return;
    }
    if (!p.active || this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (!wobble(s, DOZE_NOD)) return;
    s.speed *= DOZE_SLOW;
    const side = Math.abs(lat) > 0.5 ? Math.sign(lat) : p.side;
    s.extX += -fz * side * DOZE_DRIFT;
    s.extZ += fx * side * DOZE_DRIFT;
    hit.push({ kart: s, by: p.kind });
  }

  /**
   * A pack of hellhounds crossing their pit: caught by one, head to tail,
   * bitten and spun; slipped through the gap just behind the last of them as
   * it crosses, a boost.
   */
  private hound(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (p.lane !== 1) return;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    // In the road's frame at the station: a lateral to the right is (-cos h, sin h).
    const along = (s.x - p.ax) * fx + (s.z - p.az) * fz;
    const lat = (s.x - p.ax) * -fz + (s.z - p.az) * fx;
    const pack = houndPack(p.phase, p.side, p.gap);
    for (const h of pack) {
      if (!h.out) continue;
      // Its body: a segment across the road, tail to head the way the pack runs.
      const mid = h.lateral + p.side * ((HOUND_HEAD - HOUND_TAIL) / 2);
      const d = Math.hypot(Math.max(0, Math.abs(lat - mid) - (HOUND_HEAD + HOUND_TAIL) / 2), along - h.along);
      if (d > HOUND_RADIUS + KART_RADIUS) continue;
      if (this.cooldown.has(s)) return;
      this.cooldown.set(s, HIT_COOLDOWN);
      if (spinOut(s, HOUND_SPIN)) hit.push({ kart: s, by: p.kind });
      return;
    }
    // The gap behind the last of them: the road it has this moment crossed.
    const last = pack[pack.length - 1];
    if (!last.out) return;
    const behind = p.side * (last.lateral - lat) - HOUND_TAIL - HOUND_RADIUS;
    if (behind < 0 || behind > HOUND_GAP || Math.abs(along - last.along) > HOUND_GAP_DEPTH || Math.abs(lat) > p.gap + 1 || s.speed < 8 || this.cooldown.has(s)) return;
    this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, HOUND_BOOST)));
  }

  /**
   * A piston: over it as it punches up, you're thrown and spun; driven into
   * it at the top of its stroke, spun; hopped onto it there (or as it
   * punches up), you ride it: up, and on with a boost.
   */
  private piston(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active || Math.hypot(s.x - p.x, s.z - p.z) > p.radius + KART_RADIUS) return;
    if ((s.hopAge < HOP_WINDOW || !s.grounded) && !this.cooldown.has(s)) {
      this.reward(hit, s, p.kind, () => {
        launch(s, PISTON_RIDE);
        s.boostTime = Math.max(s.boostTime, PISTON_BOOST);
      });
      return;
    }
    const pumping = p.phase < PISTON_STAGES.top;
    if (!pumping) this.pushOut(p, s);
    if (this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (!spinOut(s, pumping ? PISTON_SPIN : PISTON_BUMP)) return;
    if (pumping) launch(s, PISTON_THROW);
    s.speed *= pumping ? PISTON_SLOW : PISTON_BUMP_SLOW;
    hit.push({ kart: s, by: p.kind });
  }

  /**
   * One of Gaia's ribs: over it as it rises or while it's held, it throws
   * you on, up and with a boost; caught as it falls, you sink with it,
   * slowed, the wheel wobbling.
   */
  private breath(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    const along = (s.x - p.x) * fx + (s.z - p.z) * fz;
    const lat = (s.x - p.x) * -fz + (s.z - p.z) * fx;
    if (Math.abs(along) > BREATH_DEPTH + KART_RADIUS || Math.abs(lat) > p.radius + KART_RADIUS) return;
    if (p.lane === 1) {
      // The rib lifts whoever is on it; the boost is paid once in a while.
      if (s.grounded) launch(s, BREATH_THROW * Math.min(1, 0.5 + p.gap / BREATH_RISE));
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, BREATH_BOOST)));
      return;
    }
    if (!p.active || this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (!wobble(s, BREATH_WOBBLE)) return;
    s.speed *= BREATH_SLOW;
    hit.push({ kart: s, by: p.kind });
  }

  /**
   * A mortal traffic light: under it on green, go, a boost; caught under it
   * on red, stay: stopped dead, spun round, most of your speed gone. Amber
   * only warns.
   */
  private trafficLight(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    const along = (s.x - p.x) * fx + (s.z - p.z) * fz;
    const lat = (s.x - p.x) * -fz + (s.z - p.z) * fx;
    if (Math.abs(along) > LIGHT_DEPTH + KART_RADIUS || Math.abs(lat) > p.radius + KART_RADIUS) return;
    if (p.lane === 0) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, LIGHT_GO)));
      return;
    }
    if (!p.active || this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (!spinOut(s, LIGHT_SPIN)) return;
    s.speed *= LIGHT_SLOW;
    hit.push({ kart: s, by: p.kind });
  }

  /**
   * A wanderer: driven into an empty one, you go right through it and it
   * empties you, slowed, the wheel wobbling; through the one you're with,
   * you don't feel empty, a boost.
   */
  private wanderer(hit: { kart: KartState; by: HazardKind; good?: boolean }[], p: HazardPose, s: KartState): void {
    if (!p.active || Math.hypot(s.x - p.x, s.z - p.z) > p.radius + KART_RADIUS || Math.abs(s.y - p.ground) > 2.5) return;
    if (p.lane === 1) {
      this.reward(hit, s, p.kind, () => (s.boostTime = Math.max(s.boostTime, WANDER_WARM)));
      return;
    }
    if (this.cooldown.has(s)) return;
    this.cooldown.set(s, HIT_COOLDOWN);
    if (!wobble(s, WANDER_WOBBLE)) return;
    s.speed *= WANDER_SLOW;
    hit.push({ kart: s, by: p.kind });
  }

  /** Pays a kart for using a hazard well, once in a while. */
  private reward(hit: { kart: KartState; by: HazardKind; good?: boolean }[], s: KartState, by: HazardKind, pay: () => void): void {
    if (this.rewarded.has(s)) return;
    this.rewarded.set(s, REWARD_COOLDOWN);
    pay();
    hit.push({ kart: s, by, good: true });
  }

  private place(p: HazardPose, builderS: number, lateral: number, lift: number): void {
    const s = this.track.mainS(builderS);
    const a = pointAt(this.track.spline, s);
    const tl = Math.hypot(a.tx, a.tz) || 1;
    p.x = a.x - (a.tz / tl) * lateral;
    p.z = a.z + (a.tx / tl) * lateral;
    const L = this.track.length;
    p.ground = this.track.main.heightAt(((s % L) + L) % L);
    p.ax = a.x;
    p.az = a.z;
    p.y = p.ground + lift;
    p.heading = Math.atan2(a.tx, a.tz);
  }

  private halfWidth(builderS: number): number {
    return this.track.main.halfWidthAtS(this.track.mainS(builderS));
  }

  /**
   * Snakes are a short segment trailing behind the head; a flame jet is a
   * thin sheet across the road; everything else is a circle.
   */
  private distance(p: HazardPose, s: KartState): number {
    if (isSheet(p.kind)) {
      const fx = Math.sin(p.heading);
      const fz = Math.cos(p.heading);
      const along = Math.abs((s.x - p.x) * fx + (s.z - p.z) * fz);
      const across = Math.abs((s.x - p.x) * -fz + (s.z - p.z) * fx);
      // Inside the sheet counts as touching; the radius is the half-width.
      return along < JET_DEPTH + KART_RADIUS ? across - KART_RADIUS : Infinity;
    }
    if (p.kind !== 'snakes' && p.kind !== 'rats' && p.kind !== 'serpents') return Math.hypot(s.x - p.x, s.z - p.z);
    const bx = -Math.sin(p.heading);
    const bz = -Math.cos(p.heading);
    const dx = s.x - p.x;
    const dz = s.z - p.z;
    const along = Math.max(0, Math.min(p.kind === 'rats' ? RAT_LENGTH : p.kind === 'serpents' ? SERPENT_LENGTH : SNAKE_LENGTH, dx * bx + dz * bz));
    return Math.hypot(dx - bx * along, dz - bz * along);
  }

  private swirl(p: HazardPose, s: KartState, dt: number): void {
    const dx = s.x - p.x;
    const dz = s.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    // Mostly around (counterclockwise from above), a little outward; a black hole pulls in instead.
    const push = (SWIRL_PUSH[p.kind] ?? DEVIL_PUSH) * dt;
    const out = p.kind === 'blackHoles' ? -0.45 : 0.5;
    s.extX += ((-dz / d) * 0.85 + (dx / d) * out) * push;
    s.extZ += ((dx / d) * 0.85 + (dz / d) * out) * push;
  }

  private pushOut(p: HazardPose, s: KartState): void {
    const dx = s.x - p.x;
    const dz = s.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const r = p.radius + KART_RADIUS;
    if (d >= r) return;
    s.x = p.x + (dx / d) * r;
    s.z = p.z + (dz / d) * r;
  }
}
