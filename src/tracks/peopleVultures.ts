import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 0.95;
const DEG = Math.PI / 180;
const NORTH_EAST = 45 * DEG;
const SOUTH_WEST = 225 * DEG;
const NORTH_WEST = -45 * DEG;
/** A point on the dry lake, in builder units. */
const wp = (x: number, z: number, h: number): Pose => ({ x: x * K, z: z * K, h });
const FINISH = 45;
/**
 * The lap is a figure of eight standing on the lake, its rising stroke
 * running up through the middle heading north-east and its falling stroke
 * back down through it heading south-east. The Thermal Spiral rides up the
 * rising stroke in two loops of this radius, each turning three quarters
 * round and climbing over the road into it, to this height.
 */
const LOOP_R = 40;
const SPIRAL_TOP = 15;
/** The veers into and out of the thermal, and the legs out of each loop and on into the next: Bone Gully runs under the bend between them. */
const VEER_R = 40;
const INTO = 10;
const OUT_OF = 110;
const ACROSS = OUT_OF + 40;
const ON = ACROSS + INTO - OUT_OF;
/** The thermal starts this far short of the middle on the rising stroke, and ends as far past it. */
const CHAIN = 60;
/** The top lobe: a circle off the end of the thermal round to the falling stroke, the carcass at its middle. */
const LOBE_R = (CHAIN + 40) * Math.SQRT2;
/** The bottom lobe is a diamond, its side corners this far out from the middle; its corners' radius. */
const DIAMOND = 200;
const CORNER_R = 40;
/** The Circling Bend: the road swings in round a gulch in three arcs of this radius and turn. */
const BEND_R = 42;
const BEND_TURN = 70;
/** How deep Bone Gully is sunk. */
const GULLY_DEPTH = 6;
/** The ribs along Ribcage Run. */
const RIBS = 4;
/** On the diamond's bottom left side, this far up it from the bottom corner, heading for the rising stroke. */
const UP_SIDE = 90 / Math.SQRT2;
const START: Pose = wp(-UP_SIDE, -2 * DIAMOND + UP_SIDE, NORTH_WEST);

/**
 * People-Vultures (the Nonagon Infinity Cup's third), after the song: a dry
 * lake under a bruised sky, the birds circling. The lap is a vulture's
 * flight over the carcass, a figure of eight standing on the lake: up its
 * rising stroke on a thermal, two loops one over the other, round the top
 * lobe over the carcass that lies at its middle, and back down its falling
 * stroke under the thermal. Carcass Straight (two kickers) under a gate of
 * vulture totems starts up the diamond at the foot of the eight; the
 * Scavenger Bend, with tumbleweeds, jinks round onto the rising stroke and
 * the Thermal Spiral rides it up in two loops, each three quarters of a turn
 * climbing over the road into it, 7.5 m and then 15 m. The Swoop falls off
 * the top into the top lobe and Ribcage Run rounds it between ribs 4 m tall;
 * Bone Gully, sunk 6 m with vultures diving at the road, runs back down
 * through the middle under the bend between the two loops. The Gizzard Leap
 * jumps a gulch at the end of it, and round the diamond's corner the
 * Circling Bend swings out off its side round another, which the Carrion
 * Bridge, a span of bones, crosses straight over on the side's line until
 * the birds pick it clean on the final lap.
 */
export function buildPeopleVultures(): TrackDef {
  const b = new TrackBuilder(START, 'Carcass Straight', { halfWidth: 11, surface: 'scorched' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(10);

  b.section('Scavenger Bend', { halfWidth: 10, wallHeight: 1.2, surface: 'scorched' });
  b.mark('scavenger');
  b.turnTo(wp(-DIAMOND + 40, -DIAMOND + 40, NORTH_EAST), CORNER_R);
  b.arc(40, 20).arc(40, -40).arc(40, 20);
  b.turnTo(wp(-CHAIN, -CHAIN, NORTH_EAST), CORNER_R);

  // Up the thermal: two loops, each one climbing over the road into it, and the bend between them.
  b.section('Thermal Spiral', { halfWidth: 9.5, wallHeight: 1.2, surface: 'boards', bridge: true });
  b.mark('spiral');
  b.arc(VEER_R, 45).straight(INTO);
  b.mark('loop1');
  b.arc(LOOP_R, 270);
  b.mark('loop1End');
  b.straight(OUT_OF).arc(VEER_R, 90).straight(ACROSS);
  b.mark('loop2');
  b.arc(LOOP_R, 270);
  b.mark('loop2End');
  b.straight(ON).arc(VEER_R, 45);
  b.mark('spiralTop');
  // Round the top of the eight: off the thermal and down.
  b.section('The Swoop', { halfWidth: 10, surface: 'scorched' });
  b.mark('swoop');
  b.arc(LOBE_R, -120);
  b.section('Ribcage Run', { halfWidth: 9, wallHeight: RIBS, surface: 'scorched' });
  b.mark('ribs');
  b.arc(LOBE_R, -150);
  // Back down through the middle, under the thermal.
  b.section('Bone Gully', { halfWidth: 9, wallHeight: RIBS, surface: 'sand' });
  b.mark('gully');
  b.arc(450, 6).arc(450, -12).arc(450, 6).straight(15);
  b.mark('gullyEnd');
  b.straight(10);

  b.section('Gizzard Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'scorched' });
  b.mark('leap');
  b.straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30);
  b.elevate(0).straight(20);

  // Round the diamond's right-hand corner and in off its side round the gulch.
  b.section('Circling Bend', { halfWidth: 9.5, surface: 'scorched' });
  b.mark('bend');
  b.turnTo(wp(DIAMOND - 40, -DIAMOND - 40, SOUTH_WEST), CORNER_R);
  b.mark('boneFrom');
  b.arc(BEND_R, -BEND_TURN).arc(BEND_R, 2 * BEND_TURN).arc(BEND_R, -BEND_TURN);
  b.mark('boneTo');
  b.turnTo(offsetPose(START, -FINISH * K), CORNER_R);
  b.section('Finish Straight', { halfWidth: 11, surface: 'scorched' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the thermal, over itself loop by loop, and down the swoop; the gully
  // sunk under the thermal.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  ease(b, m('loop1'), 0, m('loop1End'), SPIRAL_TOP / 2);
  b.profile(m('loop1End'), m('loop2'), () => SPIRAL_TOP / 2, 10);
  ease(b, m('loop2'), SPIRAL_TOP / 2, m('loop2End'), SPIRAL_TOP);
  b.profile(m('loop2End'), m('swoop', 30), () => SPIRAL_TOP, 10);
  plunge(b, m('swoop', 30), SPIRAL_TOP, m('swoop', 110), 0);
  ease(b, m('gully', -40), 0, m('gully', 10), -GULLY_DEPTH);
  ease(b, m('gullyEnd', -40), -GULLY_DEPTH, m('gullyEnd', 10), 0);

  const main = b.finish(true);
  const bones = buildCarrionBridge(b.marks.boneFrom, b.marks.boneTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'people-vultures',
    name: 'People-Vultures',
    main,
    branches: [bones.branch],
    pits: [...b.pits, ...bones.pits],
    boostPads: [
      { s: 50, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('swoop', 125), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: b.marks.ramp.s - 10, length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['scavenger', 'spiral', 'loop2', 'swoop', 'ribs', 'gully', 'leap', 'bend'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'carrionGate', ribbon: -1, s: 6 },
      { kind: 'carrionGate', ribbon: -1, s: at('ribs', -2) },
      { kind: 'carcass', ribbon: -1, s: at('gully', 0), lateral: LOBE_R * K },
    ],
    itemBoxes: [
      { s: 64, count: 4 },
      { s: at('scavenger', 20), count: 4 },
      { s: at('swoop', 130), count: 3 },
      { s: at('gully', 50), count: 3 },
      { s: at('bend', 45), count: 4 },
      { s: bones.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'vultures', at: [at('kick2', 40)], period: 5.5 },
      { kind: 'tumbleweeds', from: at('scavenger', 5), to: at('scavenger', 120), count: 2 },
      { kind: 'vultures', at: [at('gully', 35), at('gully', 100)], period: 5 },
    ],
    theme: 'carrion',
    music: { lap: 'people-vultures', finalLap: 'people-vultures-final-lap' },
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

/**
 * The Carrion Bridge: a span of bones straight over the gulch the Circling
 * Bend swings round. No rails. There on laps 1 and 2; by the final lap the
 * vultures have picked it clean and there is nothing left to drive on.
 */
function buildCarrionBridge(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Carrion Bridge', { halfWidth: 6, surface: 'sand' });
  b.straight(30);
  b.section('Span of Bones', { halfWidth: 4.5, surface: 'boards' });
  b.elevate(0).straight(12).elevate(1);
  const gulch = chord - 2 * b.s;
  const boxes = b.s + gulch / 2;
  b.bridge(gulch, 7);
  b.elevate(1).straight(12).elevate(0);
  b.section('Carrion Bridge', { halfWidth: 6, surface: 'sand' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Carrion Bridge', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [1, 2], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
