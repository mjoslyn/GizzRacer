import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

/** Scales the whole lap. */
const K = 0.9;
const deg = (d: number) => (d * Math.PI) / 180;
/** A pose on the plan: x east, y north (the builder's z and x), heading in degrees counterclockwise from east. */
const P = (x: number, y: number, h: number): Pose => ({ x: y * K, z: x * K, h: deg(h) });
/** Where the figure of eight crosses itself: the sky road over Hell's Kitchen. */
export const CROSS_X = -35;
export const CROSS_Y = 35;
const START: Pose = P(20, -190, 0);
const FINISH = 40;
/** The tornado: the road spirals up round its funnel, widening as it climbs, TURNS degrees from R0 out to R1. */
const R0 = 36;
const R1 = 80;
const TURNS = 400;
/** How far round the funnel the road is still on the ground, before it's on stilts. */
const GROUND_TURN = 40;
/** The sky road: the top of the funnel and the road it lifts into the sky. */
export const SKY = 15;
/** Hell's Kitchen, sunk this deep, walled. */
export const DEPTH = 7;
const WALL = 6;
/** A Bad Omen Hanging: a loop of this radius climbing to the pier, a deck this high back over the kitchen. */
const OMEN_R = 42;
export const PIER = 8;
/** The sky road holds its height this far past the crossing, then plunges. */
const CREST = 45;
/** The mortal traffic lights: a bar of the waltz every this many seconds, the gantries this far apart (about how far a fast kart goes in the lag between them). */
export const LIGHT_PERIOD = 2.4;
export const LIGHT_ROW = 19;
/** How far before the crossing the kitchen's line starts. */
const LINE_IN = 50;

export function buildStrawsInTheWind(): TrackDef {
  const b = new TrackBuilder(START, 'Galvanising Uncertainty', { halfWidth: 10, surface: 'farmtrack' });
  b.scale = K;
  // Galvanising uncertainty: out across the flower field from the windmills, two kickers.
  b.straight(10).mark('kick1').kicker().straight(14).mark('kick2').kicker();
  b.straight(170 - b.s / K);
  b.section('The Weary Inkling', { halfWidth: 10, surface: 'farmtrack' });
  b.mark('inkling');
  b.arc(60, 90);
  // The hierarchy cracking: a zigzag like a crack, and round this black heart into the funnel.
  b.section('Hierarchy Cracking', { halfWidth: 9.5, surface: 'farmtrack' });
  b.mark('hierarchy');
  b.arc(45, -15).arc(45, 30).arc(45, -15);
  b.section('This Black Heart', { halfWidth: 9.5, surface: 'farmtrack' });
  b.mark('heart');
  b.arc(54, 30).arc(54, -60).arc(54, 30);
  // Straws in the wind: up round the tornado's funnel, widening as it climbs, back over the way in.
  b.section('Straws in the Wind', { halfWidth: 9.5, surface: 'farmtrack' });
  b.mark('straws');
  const rm = R0 + ((R1 - R0) * GROUND_TURN) / TURNS;
  b.spiral(R0 * K, rm * K, GROUND_TURN);
  b.mark('funnel');
  b.section('Straws in the Wind', { halfWidth: 9.5, wallHeight: 1.2, surface: 'farmtrack', bridge: true });
  b.spiral(rm * K, R1 * K, TURNS - GROUND_TURN);
  b.mark('top');
  // Is it all ending?: the road blown off the top of the funnel into the sky, over the middle of everything, and set down again.
  b.section('Is It All Ending?', { halfWidth: 9.5, wallHeight: 1.2, surface: 'farmtrack', bridge: true });
  b.mark('ending');
  b.turnTo(P(CROSS_X + 100, CROSS_Y + 100, 225), 85);
  b.mark('sky');
  b.straight(100 * Math.SQRT2 + CREST);
  b.straight(95);
  b.mark('skyEnd');
  b.section('Is It All Ending?', { halfWidth: 9.5, surface: 'farmtrack' });
  b.straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20);
  b.elevate(0).straight(12);
  b.mark('endingEnd');
  b.section('Full to the Brim', { halfWidth: 10, surface: 'farmtrack' });
  b.mark('brim');
  b.arc(60, -45);
  // The Beelzebub Cheshire grin: the road a smile under the grin in the sky.
  b.section('The Beelzebub Cheshire Grin', { halfWidth: 10, surface: 'farmtrack' });
  b.mark('grin');
  b.arc(90, 10).arc(90, -20).arc(90, 10);
  b.section('Cooking Something Big', { halfWidth: 10, surface: 'farmtrack' });
  b.mark('cooking');
  b.arc(55, -90);
  b.mark('strawFrom');
  // Pandemonium: swerving out round the farmyard, selfish pigs and headless chickens everywhere.
  b.section('Pandemonium', { halfWidth: 9.5, surface: 'farmtrack' });
  b.mark('pandemonium');
  b.arc(40, -75).arc(40, 75);
  b.section('Headless Chickens', { halfWidth: 9, surface: 'farmtrack' });
  b.mark('chickens');
  b.arc(28, -40).arc(28, 80).arc(28, -40);
  b.section('Pandemonium', { halfWidth: 9.5, surface: 'farmtrack' });
  b.arc(40, 75).arc(40, -75);
  b.mark('strawTo');
  b.section('The Media Will Never Quit', { halfWidth: 10, surface: 'farmtrack' });
  b.mark('media');
  b.arc(50, -90).arc(60, -45);
  // Allegro: esses in three-four, a long bend on the one and two short ones, twice.
  b.section('Allegro', { halfWidth: 9.5, surface: 'farmtrack' });
  b.mark('allegro');
  b.arc(36, 28).arc(18, -28).arc(18, 28).arc(36, -28).arc(18, 28).arc(18, -28);
  b.section('Mortal Traffic Lights', { halfWidth: 10, surface: 'farmtrack' });
  b.mark('lights');
  b.straight(70);
  b.section('Condescending Expendables', { halfWidth: 9.5, surface: 'farmtrack' });
  b.mark('expendables');
  b.turnTo(P(CROSS_X - LINE_IN / Math.SQRT2, CROSS_Y + LINE_IN / Math.SQRT2, -45), 50);
  b.mark('line');
  // Hell's Kitchen: sunk under the sky road, singing hymns.
  b.section("Hell's Kitchen", { halfWidth: 9.5, wallHeight: WALL, surface: 'farmtrack' });
  b.mark('kitchen');
  b.straight(Math.hypot(b.pose.z - (CROSS_X + 85) * K, b.pose.x - (CROSS_Y - 85) * K) / K);
  // A bad omen hanging: climbing out round a loop, and the pillars of a forgotten pier back over the kitchen.
  b.section('A Bad Omen Hanging', { halfWidth: 9.5, wallHeight: 1.2, surface: 'farmtrack' });
  b.mark('omen');
  b.arc(OMEN_R, 70);
  b.mark('hanging');
  b.section('A Bad Omen Hanging', { halfWidth: 9.5, wallHeight: 1.2, surface: 'farmtrack', bridge: true });
  b.arc(OMEN_R, 200);
  b.section('Pillars of a Forgotten Pier', { halfWidth: 9.5, wallHeight: 1.2, surface: 'farmtrack', bridge: true });
  b.mark('pier');
  b.straight(90);
  b.mark('pierEnd');
  b.section("We've All Just Awoken", { halfWidth: 10, surface: 'farmtrack' });
  b.mark('awoken');
  b.turnTo(offsetPose(START, -FINISH * K), 50);
  b.mark('home');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // Where the sky road crosses Hell's Kitchen, and where the pier crosses it.
  const [skyX, kitchenX] = meet(b.marks.sky, b.marks.line);
  const [pierQ, kitchenQ] = meet(b.marks.pier, b.marks.line);
  b.marks.cross = { s: skyX, pose: { ...b.marks.sky.pose } };
  b.marks.crossK = { s: kitchenX, pose: { ...b.marks.line.pose } };
  b.marks.pierQ = { s: pierQ, pose: { ...b.marks.pier.pose } };
  b.marks.kitchenQ = { s: kitchenQ, pose: { ...b.marks.line.pose } };
  // Up the funnel, held up in the sky over the middle, and set down again.
  ease(b, m('straws', 10), 0, m('top'), SKY);
  b.profile(m('top'), skyX + CREST * K, () => SKY, 10);
  b.marks.crest = { s: skyX + CREST * K, pose: { ...b.marks.sky.pose } };
  plunge(b, skyX + CREST * K, SKY, m('skyEnd'), 0);
  // Down into Hell's Kitchen before the crossing, and out after the pier passes over it.
  ease(b, m('line'), 0, kitchenX - 15 * K, -DEPTH);
  b.profile(kitchenX - 15 * K, kitchenQ + 15 * K, () => -DEPTH, 10);
  ease(b, kitchenQ + 15 * K, -DEPTH, m('omen'), 0);
  // Round the omen's loop up onto the pier, and down off it.
  ease(b, m('omen'), 0, m('pier'), PIER);
  b.profile(m('pier'), m('pierEnd', -20), () => PIER, 10);
  ease(b, m('pierEnd', -20), PIER, m('awoken', 50), 0);

  const main = b.finish(true);
  const straw = buildShortStraw(b.marks.strawFrom, b.marks.strawTo);
  return {
    id: 'straws-in-the-wind',
    name: 'Straws in the Wind',
    main,
    branches: [straw.branch],
    pits: [...b.pits, ...straw.pits],
    boostPads: [
      { s: m('straws', 4), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: m('endingEnd', 2), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: m('omen', 6), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['inkling', 'heart', 'straws', 'ending', 'grin', 'cooking', 'allegro', 'lights', 'kitchen', 'pier'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 420,
    landmarks: [
      { kind: 'strawsGate', ribbon: -1, s: 6 },
      // The trash tornado in the funnel's eye, the road spiralling up round it.
      { kind: 'trashTornado', ribbon: -1, s: m('straws'), lateral: -R0 * K },
      { kind: 'cheshireGrin', ribbon: -1, s: m('grin') },
      { kind: 'hellsKitchen', ribbon: -1, s: m('kitchen'), to: m('omen') },
      { kind: 'forgottenPier', ribbon: -1, s: m('pier'), to: m('pierEnd') },
      { kind: 'shortStraw', ribbon: 0, s: 6 },
    ],
    itemBoxes: [
      { s: m('inkling', 20), count: 4 },
      { s: m('heart', 8), count: 3 },
      { s: m('funnel', 130), count: 4 },
      { s: skyX - 70 * K, count: 3 },
      { s: m('grin', 25), count: 4 },
      { s: m('chickens', 30), count: 3 },
      { s: m('allegro', 4), count: 4 },
      { s: kitchenX + 30 * K, count: 4 },
      { s: m('awoken', 70), count: 4 },
      { s: straw.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      // The mortal traffic lights down their stretch, a green wave rolling down it at a fast kart's pace.
      { kind: 'trafficLights', at: [0, 1, 2].map((k) => m('lights', 8) + k * LIGHT_ROW), period: LIGHT_PERIOD },
    ],
    theme: 'windmill',
    music: { lap: 'straws-in-the-wind', finalLap: 'straws-in-the-wind-final-lap' },
  };
}

/** Where two straight stretches of road (from marks, heading on) meet: the arc length along each to the crossing. */
function meet(a: { s: number; pose: Pose }, b: { s: number; pose: Pose }): [number, number] {
  const ax = Math.sin(a.pose.h);
  const az = Math.cos(a.pose.h);
  const bx = Math.sin(b.pose.h);
  const bz = Math.cos(b.pose.h);
  const dx = b.pose.x - a.pose.x;
  const dz = b.pose.z - a.pose.z;
  const den = ax * bz - az * bx;
  const ta = (dx * bz - dz * bx) / den;
  const tb = (dx * az - dz * ax) / den;
  return [a.s + ta, b.s + tb];
}

/** Eases the road's height from y0 at arc length s0 to y1 at s1. */
function ease(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * u * u * (3 - 2 * u));
}

/** Drops the road from y0 at s0 to y1 at s1, falling away at once over the top (a crest to fly off) and easing out at the bottom. */
function plunge(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * Math.sin((Math.PI * u) / 2));
}

/** The ditch the Short Straw crosses on planks. */
export const DITCH = 18;

/**
 * The Short Straw: a narrow lane straight up through the wheat where the
 * main road swerves out round the farmyard's pandemonium, over a ditch on
 * planks halfway. From lap 2; on the first the planks aren't down yet, and
 * there's only the ditch.
 */
function buildShortStraw(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'The Short Straw', { halfWidth: 5, surface: 'farmtrack' });
  b.straight((chord - DITCH) / 2);
  const boxes = b.s + DITCH / 2;
  b.bridge(DITCH, 8, 'water', 6);
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'The Short Straw', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2, 'final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
