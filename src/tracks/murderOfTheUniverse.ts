import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.25;
const deg = (d: number) => (d * Math.PI) / 180;
/** A waypoint, in builder units. */
const wp = (x: number, z: number, h: number): Pose => ({ x: x * K, z: z * K, h: deg(h) });
const START = wp(-40, -230, 90);
const FINISH = 55;
/** Heights of the coaster: the top of the first lift, the kicker straight, Red Dwarf Bend and the top of the spiral. */
const LIFT = 20;
const KICK = 6;
const BALROG = 14;
const TOP = 26;
/** The Dead Star Spiral: a helix this tight, round this far, climbing over itself. */
const SPIRAL_R = 34;
const SPIRAL_TURN = 450;
/**
 * Collision Course swings round the star in the middle of the map on an
 * inner orbit this big, crossing its own path at CROSS: in heading
 * south-east, out heading south-west.
 */
const SWING_R = 60;
const CROSS = wp(-90, -30, 135);
/** Rogue Orbit swings out through here, wide of the spiral. */
const ORBIT = wp(-150, 250, 270);

/**
 * Gliese 710, once The Lord of Lightning (hard): a road of starlight over
 * nothing, out where the star of that name will pass through the Oort
 * cloud, the Ice, Death, Planets, Lungs, Mushrooms and Lava Cup's finale.
 * Leave it and you fall forever. Black holes drift across the road
 * dragging karts round and in, static lightning strikes on the straights,
 * the star itself hangs over the line, and Rogue Orbit, a thread of road
 * with no rails, swings wide out over the void round the spiral. The lap
 * goes round the star twice, an orbit knocked out of true: the outer orbit
 * round the edge of the void, a lift up the Event Horizon, a plunge onto
 * Static Electricity, the leap from Red Dwarf Bend and the Dead Star
 * Spiral, a helix that climbs a turn and a quarter over itself; then the
 * Planets Straight high above it all and the Collision Course, an inner
 * orbit swung round the middle that dives on the far side and passes back
 * under its own way in, and a second drop to the line.
 */
export function buildMurderOfTheUniverse(): TrackDef {
  const b = new TrackBuilder(START, 'Event Horizon', { halfWidth: 10.5, surface: 'cosmic' });
  b.scale = K;
  b.straight(150);
  b.section('Gliese 710', { halfWidth: 10, wallHeight: 1.2, surface: 'cosmic' });
  b.arc(50, -90);

  // Two kickers down the straight, under the lightning.
  b.section('Static Electricity', { halfWidth: 9, surface: 'neon' });
  b.mark('lightning');
  b.straight(48).elevate(KICK).mark('kick1').kicker().straight(24).mark('kick2').kicker().mark('kicked');
  b.straight(36.8).arc(55, -35).arc(55, 35);
  b.section('Static Electricity', { halfWidth: 9, wallHeight: 1.2, surface: 'neon' });
  b.arc(55, 35).arc(55, -35).straight(20).arc(55, -35).arc(55, 35);

  b.section('Red Dwarf Bend', { halfWidth: 9.5, wallHeight: 1.2, surface: 'cosmic' });
  b.mark('balrog');
  b.arc(36, -90).hermiteTo(wp(30, 180, 270));

  b.section('Oort Cloud Leap', { halfWidth: 9, surface: 'cosmic' });
  b.mark('leap');
  b.straight(15).elevate(BALROG).rise(20, BALROG + 3);
  b.gap(18, 30);
  b.elevate(BALROG).straight(6);
  b.mark('blackFrom');
  // The spiral's first bend is open until Rogue Orbit is well clear of it.
  b.straight(69).arc(SPIRAL_R, -35);

  b.section('Dead Star Spiral', { halfWidth: 8, wallHeight: 1.2, surface: 'cosmic' });
  b.mark('spiral');
  // Round and up, over its own first bend.
  b.arc(SPIRAL_R, 35 - SPIRAL_TURN);
  b.mark('spiralEnd');

  b.section('Planets Straight', { halfWidth: 9, surface: 'neon' });
  b.mark('han');
  b.straight(70);
  b.mark('blackTo');
  b.straight(20);
  b.section('Collision Course', { halfWidth: 10, wallHeight: 1.2, surface: 'cosmic' });
  b.mark('oblivion');
  b.turnTo(offsetPose(CROSS, -40 * K), 40);
  b.straight(40);
  b.mark('cross');
  // The inner orbit: round the star in the middle, and back across under its own way in.
  b.straight(SWING_R).arc(SWING_R, -270).straight(SWING_R);
  b.mark('crossAgain');
  b.turnTo(offsetPose(START, -FINISH * K), 50);
  b.section('Finish Straight', { halfWidth: 10.5, surface: 'cosmic' });
  b.straight(FINISH);

  // Heights, over the layout.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  ease(b, 40, 0, 210, LIFT);
  b.profile(210, m('lightning'), () => LIFT, 20);
  plunge(b, m('lightning'), LIFT, m('kick1', -5), KICK);
  ease(b, m('kicked', 4), KICK, m('balrog'), BALROG);
  // Up the spiral, a turn above itself, and on high along the Planets Straight into the inner orbit.
  ease(b, m('spiral', 4), BALROG, m('han', -8), TOP);
  b.profile(m('han', -8), m('cross', 36), () => TOP, 20);
  // Two drops down the Collision Course: off the top on the far side of the star, and off again once the inner orbit has passed under itself.
  plunge(b, m('cross', 36), TOP, m('cross', 100), 10);
  ease(b, m('cross', 100), 10, m('cross', 130), 14);
  b.profile(m('cross', 130), m('crossAgain', 36), () => 14, 20);
  plunge(b, m('crossAgain', 36), 14, m('crossAgain', 76), 0);

  const main = b.finish(true);
  const black = buildRogueOrbit(b.marks.blackFrom, b.marks.blackTo, BALROG, TOP);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'murder-of-the-universe',
    name: 'Gliese 710',
    main,
    branches: [black.branch],
    pits: b.pits,
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leap', 16), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['lightning', 'balrog', 'leap', 'spiral', 'han', 'oblivion'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 440,
    abyss: true,
    landmarks: [
      { kind: 'starGate', ribbon: -1, s: 6 },
      { kind: 'starGate', ribbon: -1, s: at('blackTo', 4) },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('lightning', 20), count: 3 },
      { s: at('leap', 50), count: 3 },
      { s: at('han', 20), count: 3 },
      { s: at('oblivion', 20), count: 4 },
      { s: black.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'blackHoles', from: at('lightning', 10), to: at('lightning', 120), count: 2 },
      { kind: 'lightning', at: [100, 130, at('lightning', 40), at('lightning', 90), at('han', 20)], period: 4 },
      { kind: 'blackHoles', from: 60, to: 140, count: 1 },
    ],
    theme: 'void',
    music: { lap: 'murder-of-the-universe', finalLap: 'murder-of-the-universe-final-lap' },
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
 * Rogue Orbit: a thread of road with no rails that swings out over the
 * void, round the outside of the spiral, and drops onto the Planets
 * Straight. Narrow enough that a nudge sends you off it.
 */
function buildRogueOrbit(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }, y0: number, y1: number) {
  const b = new TrackBuilder(from.pose, 'Rogue Orbit', { halfWidth: 4.5, surface: 'neon' });
  // Out over the void, wide round the outside of the spiral, and in from the outside of the straight.
  const approach = offsetPose(to.pose, -50, -24);
  b.straight(3).arc(30, 50).turnTo(ORBIT, 45).turnTo(approach, 40).hermiteTo(offsetPose(to.pose, -6)).straight(6);
  // Climbing from the leap's height to the straight's, level where it runs beside the main road.
  b.elevate(y1);
  b.profile(0, 45, () => y0, 45);
  ease(b, 45, y0, b.s - 45, y1);
  // Knocked out of its orbit by the final lap: Rogue Orbit is gone.
  const branch: BranchDef = { name: 'Rogue Orbit', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [1, 2], shut: { kind: 'vanish' } };
  return { branch, boxes: branch.length / 2 };
}
