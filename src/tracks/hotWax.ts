import { TrackBuilder, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const deg = (d: number) => (d * Math.PI) / 180;

/**
 * The lap is a burning candle laid corner to corner across the floor, drawn
 * in one line of hot wax: the pool of wax at its foot, the candle's two
 * sides, and the flame. The plan is three blobs of circles joined by
 * tangents, worked out once and kept here as turns and runs (before it is
 * stretched by K): the pool round two circles of radius 110, 80 apart along
 * the bottom; the candle's ends round circles of radius 65; the flame round
 * one of radius 60. The line crosses itself twice, in tiers: where the
 * candle stands in its pool (the floor sunk under, the lord's way over it
 * at ground level on a deck) and across the wick (the sill up over, the
 * seat's way under it).
 */
const K = 1.18;
/** The finish: the last of the run across the pool's foot, before the line. */
const FINISH = 40;
const START: Pose = { x: 250 - FINISH * K, z: -355, h: deg(-90) };
/** The pool: its radius, the run across its foot, its east side up to the candle and its west side back round to the start. */
export const POOL_R = 110;
const POOL_RUN = 80;
const POOL_EAST = 97.77;
const POOL_WEST = 175.18;
/** Across the candle's foot, out of the pool and back into it. */
const BASE_ACROSS = 172.92;
const BASE_BACK = 245.56;
/** The candle: the turns round its foot and its top, and its sides. */
export const CANDLE_R = 65;
const FOOT_WEST = 52.77;
const FOOT_EAST = 40.18;
const TOP = 47.44;
export const SIDE = 162.63;
/** Across the wick, between the candle's top and the flame, both ways. */
export const WICK = 114.78;
/** The flame, all the way round it. */
export const FLAME_R = 60;
const FLAME = 274.88;
/** Heights: the floor sunk under the candle's foot, the sill up across the wick, the hill on the candle's side, the rise to the leaves, and the leg. */
export const FLOOR = 7;
export const SILL = 12;
export const HILL = 4;
export const LEAVES = 6;
const LEG = 2.5;
/** The maze: four bends out round its walls and back in, this radius and turn; Everybody's Learning How runs straight through. */
const MAZE_R = 35;
const MAZE_TURN = 60;
const MAZE_RUN = 4 * MAZE_R * Math.sin(deg(MAZE_TURN));
/** The lord's deck at ground level, back over the floor sunk under the candle's foot. */
const LORD_DECK = 80;
/** The glass head the road runs into, this long. */
export const BRAIN = 40;
/** Hot wax creeping across the sink's run every this many seconds. */
export const WAX_PERIOD = 4.4;
/** Where the tongues of wax come out from under the cupboards, along the sink's run. */
export const TONGUES = [16, 54, 92];

/**
 * Hot Wax (the All Stars Cup #2's first, from Oddments, 2014): a home
 * recording of Stu's and Ambrose's, psychedelic garage with a spring reverb
 * pedal punched for the clang, the chorus lifted from the Beach Boys'
 * "Surfin' Safari". Hot wax comes in under everything: under the door, the
 * floor, the hill and the sill; under the seat and the feet, the sink and
 * the drink; under the lord, into the brain and the maze; rising from
 * beneath and from the leaves; under my bed and up my leg. The karts are
 * tiny in a house the wax is flooding, and the lap is the candle it runs
 * from: Comin' Under the Door across the pool at its foot (two kickers),
 * Comin' Under the Floor up the pool's side and sunk under the candle's foot
 * between the joists, Creepin' Under the Hill round the foot and up the
 * candle's side over a rucked rug, Creepin' Under the Sill on up and across
 * the wick on the sill, Hot Wax off it into the flame, C'mon Get Around
 * round the flame's tip, Come On a Safari With Me down its far side through
 * a jungle of drips, Slippin' Under the Seat back across the wick under the
 * sill and an armchair, Drippin' Under the Feet round the candle's top
 * between a sitter's feet, Leakin' Under the Sink down the candle's other
 * side past the kitchen cupboards (the hot wax creeping out across it),
 * Leakin' Under the Drink, a leap over a spilt drink, Comin' Under the Lord
 * round the foot and over the floor at the lord's shrine, Comin' Into the
 * Brain through a glass head, Comin' Into the Maze out round its walls and
 * back (Everybody's Learning How straight through it, from lap 2), Risin'
 * From Beneath and Risin' From the Leaves up round the pool through a pot
 * plant, Runnin' Under My Bed, and Runnin' Up My Leg home.
 */
export function buildHotWax(): TrackDef {
  const b = new TrackBuilder(START, "Comin' Under the Door", { halfWidth: 10, surface: 'wax' });
  b.scale = K;
  // Comin' under the door: across the foot of the pool, two kickers.
  b.straight(10).mark('kick1').kicker().straight(14).mark('kick2').kicker();
  b.straight(POOL_RUN - FINISH - 24 - 14 / K);
  // Comin' under the floor: up the pool's east side and down between the joists, under the candle's foot.
  b.section("Comin' Under the Floor", { halfWidth: 10, wallHeight: 1.2, surface: 'wax' });
  b.mark('floor');
  b.arc(POOL_R, POOL_EAST);
  b.mark('floorCut');
  b.straight(BASE_ACROSS);
  b.mark('floorEnd');
  // Creepin' under the hill: round the candle's foot and up its west side, over the rucked rug.
  b.section("Creepin' Under the Hill", { halfWidth: 10, wallHeight: 1.2, surface: 'wax' });
  b.mark('hill');
  b.arc(CANDLE_R, -FOOT_WEST);
  b.mark('side');
  b.straight(SIDE * 0.5);
  // Creepin' under the sill: on up the candle's side and across the wick, up on the windowsill.
  b.section("Creepin' Under the Sill", { halfWidth: 10, wallHeight: 1.2, surface: 'wax' });
  b.mark('sill');
  b.straight(SIDE * 0.5);
  b.arc(CANDLE_R, -TOP);
  b.mark('sillDeck');
  b.section("Creepin' Under the Sill", { halfWidth: 10, wallHeight: 1.2, surface: 'wax', bridge: true });
  b.straight(WICK);
  b.mark('sillEnd');
  // Hot wax! Off the sill and down into the flame.
  b.section('Hot Wax', { halfWidth: 10, wallHeight: 1.2, surface: 'wax' });
  b.mark('hotwax');
  b.arc(FLAME_R, FLAME * 0.3);
  // C'mon get around: round the flame's tip.
  b.section("C'mon Get Around", { halfWidth: 10, wallHeight: 1.2, surface: 'wax' });
  b.mark('around');
  b.arc(FLAME_R, FLAME * 0.4);
  // Come on a safari with me: down the flame's far side through the jungle of drips.
  b.section('Come On a Safari With Me', { halfWidth: 10, wallHeight: 1.2, surface: 'wax' });
  b.mark('safari');
  b.arc(FLAME_R, FLAME * 0.3);
  // Slippin' under the seat: back across the wick, under the sill and the armchair.
  b.section("Slippin' Under the Seat", { halfWidth: 10, wallHeight: 1.2, surface: 'wax' });
  b.mark('seat');
  b.straight(WICK);
  // Drippin' under the feet: round the candle's top, between the sitter's feet.
  b.section("Drippin' Under the Feet", { halfWidth: 10, wallHeight: 1.2, surface: 'wax' });
  b.mark('feet');
  b.arc(CANDLE_R, -TOP);
  b.straight(SIDE * 0.1);
  // Leakin' under the sink: down the candle's east side past the kitchen cupboards, the wax creeping out from under them.
  b.section("Leakin' Under the Sink", { halfWidth: 10, wallHeight: 1.2, surface: 'wax' });
  b.mark('sink');
  b.straight(SIDE * 0.6);
  // Leakin' under the drink: a leap over the drink spilt across the floor.
  b.section("Leakin' Under the Drink", { halfWidth: 10, wallHeight: 1.2, surface: 'wax' });
  b.mark('drink');
  const jumpRun = SIDE * 0.3 - 30 / K;
  b.straight(jumpRun * 0.4).mark('ramp').elevate(0).rise(18, 3);
  b.mark('gap');
  b.gap(12, 20, 'water');
  b.elevate(0).straight(jumpRun * 0.6);
  // Comin' under the lord: round the candle's foot and back across it over the floor, at the lord's shrine.
  b.section("Comin' Under the Lord", { halfWidth: 10, wallHeight: 1.2, surface: 'wax' });
  b.mark('lord');
  b.arc(CANDLE_R, -FOOT_EAST);
  b.mark('lordDeck');
  b.section("Comin' Under the Lord", { halfWidth: 10, wallHeight: 1.2, surface: 'wax', bridge: true });
  b.straight(LORD_DECK);
  b.mark('lordDeckEnd');
  b.section("Comin' Under the Lord", { halfWidth: 10, wallHeight: 1.2, surface: 'wax' });
  b.straight(BASE_BACK - MAZE_RUN - BRAIN - LORD_DECK);
  // Comin' into the brain: through the glass head.
  b.section("Comin' Into the Brain", { halfWidth: 10, wallHeight: 1.2, surface: 'wax' });
  b.mark('brain');
  b.straight(BRAIN);
  // Comin' into the maze: out round its walls and back; open where Everybody's Learning How leaves and rejoins.
  b.section("Comin' Into the Maze", { halfWidth: 10, surface: 'wax' });
  b.mark('maze');
  b.arc(MAZE_R, -MAZE_TURN);
  b.section("Comin' Into the Maze", { halfWidth: 10, wallHeight: 3.5, surface: 'wax' });
  b.arc(MAZE_R, MAZE_TURN).arc(MAZE_R, MAZE_TURN);
  b.section("Comin' Into the Maze", { halfWidth: 10, surface: 'wax' });
  b.arc(MAZE_R, -MAZE_TURN);
  b.mark('mazeEnd');
  // Risin' from beneath, risin' from the leaves: up round the pool's west side through the pot plant.
  b.section("Risin' From Beneath", { halfWidth: 10, wallHeight: 1.2, surface: 'wax' });
  b.mark('beneath');
  b.arc(POOL_R, POOL_WEST * 0.28);
  b.section("Risin' From the Leaves", { halfWidth: 10, wallHeight: 1.2, surface: 'wax' });
  b.mark('leaves');
  b.arc(POOL_R, POOL_WEST * 0.24);
  b.mark('crest');
  // Runnin' under my bed, runnin' up my leg: round the bottom of the pool, home.
  b.section("Runnin' Under My Bed", { halfWidth: 10, wallHeight: 1.2, surface: 'wax' });
  b.mark('bed');
  b.arc(POOL_R, POOL_WEST * 0.26);
  b.section("Runnin' Up My Leg", { halfWidth: 10, wallHeight: 1.2, surface: 'wax' });
  b.mark('leg');
  b.arc(POOL_R, POOL_WEST * 0.22);
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // Under the floor: down between the joists, under the candle's foot, and up again round it.
  ease(b, m('floorCut', -30), 0, m('floorCut', 15), -FLOOR);
  b.profile(m('floorCut', 15), m('floorEnd', -25), () => -FLOOR, 10);
  ease(b, m('floorEnd', -25), -FLOOR, m('hill', 25), 0);
  // Over the rucked rug, and on up onto the sill.
  b.profile(m('side', -5), m('side', 70), (u) => HILL * Math.sin(Math.PI * u) ** 2, 3);
  ease(b, m('sill', -6), 0, m('sillDeck'), SILL);
  b.profile(m('sillDeck'), m('sillEnd'), () => SILL, 10);
  // Hot wax: off the sill's end, a crest to fly off, down into the flame.
  plunge(b, m('sillEnd'), SILL, m('around', -8), 0);
  // Risin' from beneath and from the leaves, and off the top under the bed.
  ease(b, m('beneath', 5), 0, m('crest'), LEAVES);
  plunge(b, m('crest'), LEAVES, m('bed', 55), 0);
  // Up my leg.
  b.profile(m('leg', 8), m('finish', -6), (u) => LEG * Math.sin(Math.PI * u) ** 2, 3);

  const main = b.finish(true);
  const learning = buildLearningHow(b.marks.maze, b.marks.mazeEnd);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'hot-wax',
    name: 'Hot Wax',
    main,
    branches: [learning.branch],
    pits: [...b.pits, ...learning.pits],
    boostPads: [
      { s: at('floor', 20), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('safari', 30), length: 8, lateral: -3, halfWidth: 2.5 },
      { s: at('lordDeckEnd', 10), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['floor', 'hill', 'sill', 'hotwax', 'around', 'safari', 'seat', 'feet', 'sink', 'lord', 'maze', 'leaves', 'bed', 'leg'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'waxDoor', ribbon: -1, s: 6 },
      { kind: 'floorJoists', ribbon: -1, s: at('floorCut', -10), to: at('floorEnd', -15) },
      { kind: 'rugHill', ribbon: -1, s: at('side', 32) },
      { kind: 'windowSill', ribbon: -1, s: at('sillDeck', 0), to: at('sillEnd', 0) },
      // The candle itself, standing in the middle of the candle the lap draws, burning down.
      { kind: 'giantCandle', ribbon: -1, s: at('sill', 0), lateral: CANDLE_R * K },
      // The lava lamp in the heart of the flame.
      { kind: 'lavaLamp', ribbon: -1, s: at('around', deg(FLAME * 0.2) * FLAME_R), lateral: -FLAME_R * K },
      { kind: 'waxJungle', ribbon: -1, s: at('safari', 0), to: at('seat', 0) },
      { kind: 'armchair', ribbon: -1, s: at('seat', WICK - 22) },
      { kind: 'giantFeet', ribbon: -1, s: at('feet', 30) },
      { kind: 'kitchenSink', ribbon: -1, s: at('sink', 0), to: at('drink', 0) },
      { kind: 'spiltDrink', ribbon: -1, s: b.marks.gap.s + 6 },
      { kind: 'lordShrine', ribbon: -1, s: at('lordDeck', LORD_DECK / 2), lateral: -38 },
      { kind: 'glassHead', ribbon: -1, s: at('brain', BRAIN / 2) },
      { kind: 'waxMaze', ribbon: -1, s: at('maze', 0), to: at('mazeEnd', 0) },
      { kind: 'giantLeaves', ribbon: -1, s: at('leaves', 10), to: at('crest', 10) },
      { kind: 'giantBed', ribbon: -1, s: at('bed', 30) },
      { kind: 'giantLeg', ribbon: -1, s: at('leg', 30), lateral: -24 },
      // The spring reverb pedal, punched for the clang, in the middle of the pool.
      { kind: 'springKing', ribbon: -1, s: at('leaves', 0), lateral: -POOL_R * K },
      { kind: 'learningHow', ribbon: 0, s: learning.boxes },
    ],
    itemBoxes: [
      { s: at('floor', 60), count: 8 },
      { s: at('floorCut', 90), count: 3 },
      { s: at('sill', 30), count: 8 },
      { s: at('around', 40), count: 8 },
      { s: at('seat', 30), count: 3 },
      { s: at('lordDeckEnd', 30), count: 8 },
      { s: at('beneath', 20), count: 8 },
      { s: at('bed', 20), count: 3 },
      { s: learning.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      // Tongues of hot wax creeping out across the sink's run from under the cupboards, one after another down it.
      { kind: 'waxFlows', at: TONGUES.map((d) => at('sink', d)), period: WAX_PERIOD },
    ],
    theme: 'hotwax',
    music: { lap: 'hot-wax', finalLap: 'hot-wax-final-lap' },
  };
}

/** Eases the road's height from y0 at arc length s0 to y1 at s1. */
function ease(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * u * u * (3 - 2 * u));
}

/** Drops the road from y0 at s0 to y1 at s1, falling away at once over the top (a crest to fly off) and easing out at the bottom. */
function plunge(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * Math.sin((Math.PI * u) / 2));
}

/** Everybody's Learning How: the channel of molten wax in the middle of the maze, this long. */
export const CHANNEL = 22;

/**
 * Everybody's Learning How: straight through the middle of the maze, a
 * narrow lane over a channel of molten wax. From lap 2, once everybody's
 * learned how, the wax in it has set hard enough to drive on; on the
 * first lap it's still molten, and there's only the channel.
 */
function buildLearningHow(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, "Everybody's Learning How", { halfWidth: 5, surface: 'wax' });
  b.straight((chord - CHANNEL) / 2);
  const boxes = b.s + CHANNEL / 2;
  b.bridge(CHANNEL, 7, 'lava');
  b.straight(chord - b.s);
  const branch: BranchDef = { name: "Everybody's Learning How", mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2, 'final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
