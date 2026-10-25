import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: 40 * K, z: 98 * K, h: Math.PI / 2 };
const FINISH = 45;
/** The Kaleidoscope Bend: the road swings out round a pool of light in three arcs of this radius and turn. */
const BEND_R = 34;
const BEND_TURN = 70;
/** The radius of the sweet's rounded shoulders either side of the twist: half the body's height. */
const SHOULDER_R = 98;
/** The Roll's radius, and the top of it. */
const ROLL_R = 34;
const ROLL_TOP = 14;
/** How deep the Fold is sunk. */
const DEPTH = 6;
/** The panes of cellophane walling Stained Glass Alley. */
const WALL = 6;

/**
 * Cellophane (the Mind Fuzz Cup's third), after the song in the middle of
 * the suite: a world wrapped in coloured cellophane, sheets of it hung on
 * frames, the light coming through it red, green, blue and gold. The lap is
 * a sweet in its wrapper: a long oval body, the cellophane twisted off at
 * each end. Down Wrapper Straight (two kickers) along the top of the body
 * under a gate hung with sheets, round its rounded right end to the twist,
 * and the Roll: a full turn out round a great roll of cellophane, climbing,
 * and over the road it came in on. The Unrolling off the top along the
 * bottom of the body, out round the Kaleidoscope Bend and a pool of light,
 * which the See-Through Bridge crosses straight over on lap 2 only, and the
 * Fold, sunk 6 m. In through the Crinkle Esses to the waist where the
 * wrapper is pinched at the left end, and round the square fan of
 * cellophane past it: right angles through Stained Glass Alley between
 * panes 6 m tall, sheets sliding across the road there and in the Fold.
 * Back out through the waist and the Static Cling Leap home along the top.
 */
export function buildCellophane(): TrackDef {
  const b = new TrackBuilder(START, 'Wrapper Straight', { halfWidth: 11, surface: 'film' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(40);
  b.arc(SHOULDER_R, 90);

  // The twist at the right end: a full turn out round a roll of cellophane, climbing, and over the road it came in on.
  b.section('The Roll', { halfWidth: 9.5, wallHeight: 1.2, surface: 'film', bridge: true });
  b.mark('roll');
  b.arc(ROLL_R, -360);
  b.mark('rollTop');
  b.section('The Unrolling', { halfWidth: 10, surface: 'film' });
  b.mark('drop');
  b.arc(SHOULDER_R, 90);
  b.mark('unrolled');
  b.straight(80);

  b.section('Kaleidoscope Bend', { halfWidth: 9.5, surface: 'film' });
  b.mark('bend');
  b.straight(5);
  b.mark('bridgeFrom');
  b.arc(BEND_R, -BEND_TURN).arc(BEND_R, 2 * BEND_TURN).arc(BEND_R, -BEND_TURN);
  b.mark('bridgeTo');
  b.straight(5);

  b.section('The Fold', { halfWidth: 9, wallHeight: WALL, surface: 'film' });
  b.mark('fold');
  b.straight(100);
  b.mark('foldEnd');
  b.straight(10);

  // In to the waist where the wrapper is pinched...
  b.section('Crinkle Esses', { halfWidth: 10, wallHeight: 1.2, surface: 'film' });
  b.mark('esses');
  b.arc(80, 77.6).arc(18, -77.6);
  // ...round the square fan of cellophane past it...
  b.section('Stained Glass Alley', { halfWidth: 9, wallHeight: WALL, surface: 'film' });
  b.mark('alley');
  b.arc(16, -90).straight(20).arc(16, 90).straight(32).arc(16, 90).straight(114);
  b.arc(16, 90).straight(32).arc(16, 90).straight(20).arc(16, -90);
  // ...and back out through the waist.
  b.section('The Waist', { halfWidth: 10, wallHeight: 1.2, surface: 'film' });
  b.mark('waist');
  b.arc(18, -77.6).arc(80, 77.6);

  b.section('Static Cling Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'film' });
  b.mark('leap');
  b.straight(30).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'water');
  b.elevate(0).straight(20);
  b.mark('landed');

  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'film' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the roll and off the top, the fold.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('roll'), m('rollTop'), (u) => ROLL_TOP * u);
  b.profile(m('rollTop'), m('unrolled', 10), () => ROLL_TOP, 10);
  plunge(b, m('unrolled', 10), ROLL_TOP, m('unrolled', 80), 0);
  ease(b, m('fold', 5), 0, m('fold', 40), -DEPTH);
  ease(b, m('fold', 70), -DEPTH, m('foldEnd', 10), 0);
  b.profile(m('landed', 5), m('finish', -5), (u) => 3 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const bridge = buildSeeThroughBridge(b.marks.bridgeFrom, b.marks.bridgeTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'cellophane',
    name: 'Cellophane',
    main,
    branches: [bridge.branch],
    pits: [...b.pits, ...bridge.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('unrolled', 82), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leap', 10), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['roll', 'drop', 'bend', 'fold', 'esses', 'alley', 'leap'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'filmGate', ribbon: -1, s: 6 },
      { kind: 'filmGate', ribbon: -1, s: at('alley', -2) },
      { kind: 'cellophaneBloom', ribbon: -1, s: at('unrolled', 40), lateral: 130 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('esses', 20), count: 4 },
      { s: at('unrolled', 88), count: 3 },
      { s: at('fold', 50), count: 3 },
      { s: at('bend', 45), count: 4 },
      { s: bridge.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'sheets', at: [at('alley', 45), at('alley', 120)], period: 4.6 },
      { kind: 'sheets', at: [at('fold', 30), at('fold', 95)], period: 5 },
    ],
    theme: 'cellophane',
    music: { lap: 'cellophane', finalLap: 'cellophane-final-lap' },
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
 * The See-Through Bridge: a span of clear cellophane stretched straight
 * over the pool of light the Kaleidoscope Bend swings round. No rails. It
 * holds only on lap 2; on the other laps it's torn away and there is
 * nothing to drive on.
 */
function buildSeeThroughBridge(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'See-Through Bridge', { halfWidth: 6, surface: 'film' });
  b.straight(30);
  b.section('Clear Span', { halfWidth: 4.5, surface: 'prism' });
  b.elevate(0).straight(12).elevate(1);
  const pool = chord - 2 * b.s;
  const boxes = b.s + pool / 2;
  b.bridge(pool, 7, 'water');
  b.elevate(1).straight(12).elevate(0);
  b.section('See-Through Bridge', { halfWidth: 6, surface: 'film' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'See-Through Bridge', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
