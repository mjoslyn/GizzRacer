import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1;
/** A waypoint on the lap, in builder units. */
const wp = (x: number, z: number, h: number): Pose => ({ x: x * K, z: z * K, h });
/** The lap is a figure of eight on the map's diagonal: Just Yesterday runs north through the middle, and the Cup to My Lips east over it. */
const START: Pose = wp(0, -110, 0);
const FINISH = 45;
/** Hold Me Up Straight climbs onto a deck this high; Screw My Head On winds up round itself to the top. */
const HELD = 5;
const TOP = 16;
/** The Cup to My Lips crosses over Just Yesterday this high, then pours down into the Black Enemy, sunk this deep between its walls. */
const LIPS = 9;
const DEPTH = 7;
const WALL = 6;
/** Eyes Weren't in Me: three hairpins, back and forth like eyes that can't see, this tight. */
const EYE_R = 30;
/** The Wrong Pill swings out round a giant capsule in three arcs of this radius and turn; the shortcut runs straight through it. */
const PILL_R = 40;
const PILL_TURN = 70;
/** The capsule's round end. */
const END_R = 96.7;
/** Pill: the same bend over and over, krautrock, rolling over a swell at each. */
const KRAUT_R = 45;
const KRAUT_TURN = 80;
const SWELL = 1.6;

/**
 * Head On/Pill (the Float Along – Fill Your Lungs Cup's first), after the
 * album's opener, the band's first jam: "Head On", a droning, sitar-tinged
 * trip whose narrator is trying to hold it together ("just yesterday I sat
 * across from my legs", his eyes not in him, "hold me up straight while I
 * screw my head on", the cup to his lips pouring deep like a black enemy),
 * then "Pill", a fast, driving krautrock ending about eating the wrong pill,
 * that kept growing until it was most of the song. The world is a mind
 * coming apart in a sixties room: paisley, swirling dye, a sitar's long neck
 * and strings, everything a little too big, the narrator's own legs lying
 * across the land. The lap is a figure of eight on the map's diagonal, one
 * loop for each half of the song. Head On, slow and winding, round the
 * north-west: Just Yesterday (two kickers), Across from My Legs droning out
 * along the diagonal and leaping where the road isn't connected, Eyes
 * Weren't in Me (three hairpins, back and forth), Hold Me Up Straight
 * climbing onto a deck, Screw My Head On winding round itself to 16 m over
 * the road it came up, and the Cup to My Lips flying off the top and back
 * over Just Yesterday on the deck. Then it pours down into the Black Enemy,
 * sunk 7 m between walls, giant capsules tumbling across it. Pill, fast and
 * driving, round the south-east in a capsule's shape: the Wrong Pill swings
 * round a giant capsule at its end, and the Pill is the same bend over and
 * over, home. Shortcut: the Wrong Pill itself, straight through the capsule,
 * every lap.
 */
export function buildHeadOnPill(): TrackDef {
  const b = new TrackBuilder(START, 'Just Yesterday', { halfWidth: 11, surface: 'paisley' });
  b.scale = K;
  b.straight(25).mark('kick1').kicker().straight(25).mark('kick2').kicker().straight(46);
  // The middle of the eight: the Cup to My Lips crosses over here.
  b.mark('x1');
  b.straight(30);

  // Across from my legs: droning out along the diagonal, and they weren't connected to me: a leap.
  b.section('Across from My Legs', { halfWidth: 10.5, surface: 'paisley' });
  b.mark('legs');
  b.arc(74, -45);
  b.straight(30);
  b.mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20);
  b.elevate(0).straight(20);
  b.mark('legsGap');
  b.arc(150, 15).arc(150, -30).arc(150, 15);
  b.straight(40);

  b.section("Eyes Weren't in Me", { halfWidth: 9.5, wallHeight: 1.2, surface: 'paisley' });
  b.mark('eyes');
  b.arc(EYE_R, -180).straight(25).arc(EYE_R, 180).straight(25).arc(EYE_R, -180);
  b.mark('eyesEnd');
  b.straight(10);

  // Held up straight on a deck, swaying, and the head screwed on: winding round itself, up over the road it came.
  b.section('Hold Me Up Straight', { halfWidth: 10, wallHeight: 1.2, surface: 'paisley', bridge: true });
  b.mark('upright');
  b.arc(200, 12).arc(200, -24).arc(200, 12);
  b.straight(20);
  b.mark('screw');
  b.section('Screw My Head On', { halfWidth: 9.5, wallHeight: 1.2, surface: 'paisley', bridge: true });
  b.spiral(44, 36, 270);
  b.straight(60);
  b.mark('screwEnd');

  // The cup to my lips: off the top, past the black cup and back across the middle over Just Yesterday.
  b.section('The Cup to My Lips', { halfWidth: 10, wallHeight: 1.2, surface: 'paisley', bridge: true });
  b.mark('cup');
  b.arc(60, 45);
  b.turnTo(wp(-60, 0, Math.PI / 2), 60);
  b.straight(60);
  b.mark('x2');
  b.straight(63);
  b.mark('cupEnd');

  // Pouring it deep in my throat, filling up me like a black enemy: sunk between walls.
  b.section('Black Enemy', { halfWidth: 9, wallHeight: WALL, surface: 'paisley' });
  b.mark('enemy');
  b.arc(74, 45);
  b.arc(150, -12).arc(150, 24).arc(150, -12);
  b.mark('enemyEnd');

  // I ate the wrong pill: round a giant capsule lying at the end of the loop.
  b.section('The Wrong Pill', { halfWidth: 10.5, surface: 'paisley' });
  b.mark('wrong');
  b.straight(7);
  b.mark('pillFrom');
  b.arc(PILL_R, -PILL_TURN).arc(PILL_R, 2 * PILL_TURN).arc(PILL_R, -PILL_TURN);
  b.mark('pillTo');
  b.straight(10);

  // Pill: round the capsule's end, then the same bend over and over.
  b.section('Pill', { halfWidth: 10, wallHeight: 1.2, surface: 'paisley' });
  b.mark('pill');
  b.arc(END_R, 180);
  b.mark('kraut');
  b.arc(KRAUT_R, -KRAUT_TURN / 2);
  for (let k = 0; k < 3; k++) b.arc(KRAUT_R, k % 2 ? -KRAUT_TURN : KRAUT_TURN);
  b.arc(KRAUT_R, -KRAUT_TURN / 2);
  b.mark('krautEnd');
  b.turnTo(offsetPose(START, -FINISH * K), 60);
  b.section('Finish Straight', { halfWidth: 11, surface: 'paisley' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // Held up onto the deck, and the head screwed on, up round itself; the top flies off into the Cup to My
  // Lips, which comes down to cross the middle over Just Yesterday, and pours down into the Black Enemy.
  ease(b, m('upright', 20), 0, m('screw'), HELD);
  ease(b, m('screw'), HELD, m('screwEnd', -20), TOP);
  b.profile(m('screwEnd', -20), m('cup', 25), () => TOP, 10);
  plunge(b, m('cup', 25), TOP, m('x2', -70), LIPS);
  b.profile(m('x2', -70), m('x2', 38), () => LIPS, 10);
  plunge(b, m('x2', 38), LIPS, m('x2', 105), -DEPTH);
  b.profile(m('x2', 105), m('enemyEnd', -40), () => -DEPTH, 10);
  ease(b, m('enemyEnd', -40), -DEPTH, m('enemyEnd'), 0);
  // The Pill drives on over a swell at every bend.
  b.profile(m('kraut'), m('krautEnd'), (u) => SWELL * Math.sin(Math.PI * 5 * u) ** 2);

  const main = b.finish(true);
  const tube = buildWrongPill(b.marks.pillFrom, b.marks.pillTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'head-on-pill',
    name: 'Head On/Pill',
    main,
    branches: [tube.branch],
    pits: [...b.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('eyesEnd', 2), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('kraut', 5), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['legs', 'eyes', 'upright', 'screw', 'cup', 'enemy', 'wrong', 'pill', 'kraut'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'sitarGate', ribbon: -1, s: 6 },
      { kind: 'sitarGate', ribbon: -1, s: at('enemy', -2) },
      { kind: 'blackCup', ribbon: -1, s: at('cup', 145), lateral: -190 },
      { kind: 'lostLegs', ribbon: -1, s: at('legs', 110), lateral: -190 },
      { kind: 'pillTube', ribbon: 0, s: TUBE_IN },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('legsGap', 30), count: 4 },
      { s: at('upright', 40), count: 3 },
      { s: at('enemy', 40), count: 3 },
      { s: at('pill', 20), count: 4 },
      { s: tube.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'pills', at: [at('enemy', 75), at('enemy', 110), at('enemy', 145)], period: 3.2 },
      { kind: 'pills', at: [at('kraut', 60), at('kraut', 160)], period: 3.6 },
    ],
    theme: 'headon',
    music: { lap: 'head-on-pill', finalLap: 'head-on-pill-final-lap' },
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

/** How far into the shortcut the capsule's shell begins, and ends before its far end. */
export const TUBE_IN = 30;

/**
 * The Wrong Pill: straight across the loop the main road swings round,
 * through the giant capsule lying in it, in one end and out the other. There
 * every lap.
 */
function buildWrongPill(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'The Wrong Pill', { halfWidth: 6, surface: 'paisley' });
  b.straight(TUBE_IN);
  b.section('Swallowed', { halfWidth: 5.5, wallHeight: 1.2, surface: 'paisley' });
  const inside = chord - 2 * b.s;
  const boxes = b.s + inside / 2;
  b.straight(inside);
  b.section('The Wrong Pill', { halfWidth: 6, surface: 'paisley' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'The Wrong Pill', mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
  return { branch, boxes };
}
