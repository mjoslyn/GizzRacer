import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: -93 * K, z: 87 * K, h: Math.PI / 2 };
const FINISH = 45;
/** The Vanishing Bend: the road swings in round a hole in the arrow's nock in three arcs of this radius and turn. */
const BEND_R = 34;
const BEND_TURN = 70;
/** The Op-Art Orbit's radius, and the top of it. */
const ORBIT_R = 24;
const ORBIT_TOP = 15;
/** How deep the Blind Spot is sunk. */
const DEPTH = 6;
/** The op-art walls of the Hall of Mirrors. */
const WALL = 5;
/** How far each barb of the arrowhead stands out past the shaft. */
const BARB = 66;
/** The length of each edge of the arrowhead, barb to point. */
const EDGE = 220;

/**
 * I'm Not in Your Mind (the Mind Fuzz Cup's second), after the song the
 * suite runs into: out of the mind and into nothing, a black and white
 * op-art world of checks and spirals that won't keep still, with arrows
 * where there should be things and nothing where there should be arrows.
 * The lap is itself an arrow pointing right: a long shaft of two parallel
 * straights and a great triangular head, far wider than the shaft. Along
 * the top of the shaft down Empty Head Straight (two kickers) under a gate
 * of arrows, a right angle up into the Hall of Mirrors between op-art walls
 * 5 m tall up the back of the top barb, and down the head's top edge
 * through the Blind Spot, sunk 6 m, rows of arrows across the road in
 * both. Round the point, the Missing Leap over nothing down the bottom
 * edge, back in round the Vacant Bend under the bottom barb and along the
 * bottom of the shaft. At the tail, the Vanishing Bend swings in round a
 * hole in the arrow's nock, which Not There cuts straight across on laps 1
 * and 3, and on lap 2, true to its name, isn't. Then a full turn up the
 * Op-Art Orbit out round the top of the tail, over the road it came up,
 * and the Drop into Nothing off the top, back along the shaft.
 */
export function buildImNotInYourMind(): TrackDef {
  const b = new TrackBuilder(START, 'Empty Head Straight', { halfWidth: 11, surface: 'opart' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(100);

  // A right angle up the back of the top barb, and round its point.
  b.section('Hall of Mirrors', { halfWidth: 9, wallHeight: WALL, surface: 'opart' });
  b.mark('hall');
  b.arc(16, -90).straight(BARB).arc(16, 135);
  // Down the head's top edge to its point, sunk.
  b.section('The Blind Spot', { halfWidth: 9, wallHeight: WALL, surface: 'opart' });
  b.mark('blind');
  b.straight(EDGE - 10);
  b.mark('blindEnd');
  b.straight(10);

  // Round the point and down the bottom edge, over nothing.
  b.section('Missing Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'opart' });
  b.mark('leap');
  b.arc(36, 90).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30);
  b.elevate(0).straight(EDGE - 10 - 31 / K);

  // Under the bottom barb and back in along the bottom of the shaft.
  b.section('Vacant Bend', { halfWidth: 10, wallHeight: 1.2, surface: 'opart' });
  b.mark('vacant');
  b.arc(16, 135).straight(BARB).arc(16, -90).straight(289);

  // The arrow's nock: the road swings in round a hole at the tail.
  b.section('Vanishing Bend', { halfWidth: 9.5, surface: 'opart' });
  b.mark('bend');
  b.arc(25, 90).straight(5);
  b.mark('notFrom');
  b.arc(BEND_R, BEND_TURN).arc(BEND_R, -2 * BEND_TURN).arc(BEND_R, BEND_TURN);
  b.mark('notTo');
  b.straight(1);

  // A full turn out round the top of the tail, climbing, and over the road it came up.
  b.section('Op-Art Orbit', { halfWidth: 9.5, wallHeight: 1.2, surface: 'opart', bridge: true });
  b.mark('orbit');
  b.arc(ORBIT_R, -360);
  b.mark('orbitTop');
  b.section('Drop into Nothing', { halfWidth: 10, surface: 'opart' });
  b.mark('drop');
  b.arc(16, 90).straight(60);
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'opart' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the orbit and off the top, the blind spot.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('vacant', 150), m('bend', -10), (u) => 2.5 * Math.sin(Math.PI * u) ** 2);
  b.profile(m('orbit'), m('orbitTop'), (u) => ORBIT_TOP * u);
  b.profile(m('orbitTop'), m('drop', 30), () => ORBIT_TOP, 10);
  plunge(b, m('drop', 30), ORBIT_TOP, m('drop', 100), 0);
  ease(b, m('blind', 5), 0, m('blind', 40), -DEPTH);
  ease(b, m('blind', 150), -DEPTH, m('blindEnd', 10), 0);

  const main = b.finish(true);
  const not = buildNotThere(b.marks.notFrom, b.marks.notTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'im-not-in-your-mind',
    name: "I'm Not in Your Mind",
    main,
    branches: [not.branch],
    pits: [...b.pits, ...not.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('drop', 105), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leap', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['hall', 'blind', 'leap', 'vacant', 'bend', 'orbit', 'drop'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'arrowGate', ribbon: -1, s: 6 },
      { kind: 'arrowGate', ribbon: -1, s: at('hall', -2) },
      { kind: 'emptyHead', ribbon: -1, s: at('drop', 60), lateral: 130 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('vacant', 20), count: 4 },
      { s: at('drop', 112), count: 3 },
      { s: at('blind', 50), count: 3 },
      { s: at('bend', 45), count: 4 },
      { s: not.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'arrows', at: [at('hall', 40), at('hall', 105)], period: 4.4 },
      { kind: 'arrows', at: [at('blind', 30), at('blind', 110), at('blind', 175)], period: 4.8 },
    ],
    theme: 'notmind',
    music: { lap: 'im-not-in-your-mind', finalLap: 'im-not-in-your-mind-final-lap' },
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
 * Not There: a road of black and white checks straight over the hole the
 * Vanishing Bend swings round. No rails. It's there on laps 1 and 3; on
 * lap 2 it isn't, and there is nothing to drive on.
 */
function buildNotThere(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Not There', { halfWidth: 6, surface: 'opart' });
  b.straight(30);
  b.section('Nowhere', { halfWidth: 4.5, surface: 'neon' });
  b.elevate(0).straight(12).elevate(1);
  const hole = chord - 2 * b.s;
  const boxes = b.s + hole / 2;
  b.bridge(hole, 7);
  b.elevate(1).straight(12).elevate(0);
  b.section('Not There', { halfWidth: 6, surface: 'opart' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Not There', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [1, 'final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
