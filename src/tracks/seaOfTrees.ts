import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: -190 * K, z: -290 * K, h: Math.PI / 2 };
const FINISH = 45;
/** The Canopy: the road on the treetops, swelling and sinking like a sea, this many swells this high. */
const SWELLS = 6;
const SWELL = 5;
const CANOPY = 9;
/** How deep Underwater is sunk: the deepest cut in the cup. */
const DEPTH = 8;
const WALL = 6;
/** The Jam swings out round a hollow in three arcs of this radius and turn. */
const JAM_R = 38;
const JAM_TURN = 70;
/** How high the roots heave the road on the way home. */
const ROOTS = 5;

/**
 * Sea of Trees (the 12 Bar Bruise Cup's finale), after the album's
 * penultimate song, the name the band nearly went by: a forest so wide and
 * even it's called a sea, at the foot of a snow-capped mountain, the trees
 * growing out of old lava, moss over everything and caves under it. The
 * song feels underwater, its head sinking like a stone; it was first
 * called "Jam", and it ends suddenly because the band ran out of tape. The
 * lap: down the Tree Line (two kickers) and the Forest Path's esses between
 * the trunks, and up onto the Canopy, the road
 * laid over the treetops, rolling over six swells like a sea; Unfold, a
 * bend that opens out as it goes; then Sinking Like a Stone, a plunge down
 * through the leaves, and Underwater, sunk 8 m in the green dark between
 * walls of lava rock, swaying round the roots, trees toppling across the
 * road. Up the Lava Tube, round the Jam, swinging out round a hollow (the
 * Rope Bridge strings straight across it, no rails, on the final lap only),
 * the Tape Hiss wavering like a tape running slow, the Root Gully leap, and
 * Out of Tape, home over the roots. Trees come down on the Canopy too.
 */
export function buildSeaOfTrees(): TrackDef {
  const b = new TrackBuilder(START, 'The Tree Line', { halfWidth: 11, surface: 'moss' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(34).mark('kick2').kicker().straight(40);
  // The Forest Path: esses between the trunks.
  b.section('Forest Path', { halfWidth: 9.5, wallHeight: 1.2, surface: 'moss' });
  b.mark('path');
  b.arc(32, 40).arc(32, -80).arc(32, 80).arc(32, -40);
  b.section('Edge of the Trees', { halfWidth: 10.5, surface: 'moss' });
  b.straight(10);
  b.arc(50, -90);

  // Up on the treetops, rolling over the swells.
  b.section('The Canopy', { halfWidth: 10, wallHeight: 1.2, surface: 'moss', bridge: true });
  b.mark('canopy');
  b.straight(20);
  for (let k = 0; k < SWELLS; k++) b.arc(70, k % 2 ? 30 : -30).arc(70, k % 2 ? -30 : 30);
  b.mark('canopyEnd');
  b.straight(20);

  // Unfold: a bend that opens out as it goes.
  b.section('Unfold', { halfWidth: 10, wallHeight: 1.2, surface: 'moss', bridge: true });
  b.mark('unfold');
  b.spiral(22, 70, -90);
  b.mark('unfoldEnd');

  b.section('Sinking Like a Stone', { halfWidth: 10, surface: 'moss' });
  b.mark('sink');
  b.straight(70);
  b.section('Underwater', { halfWidth: 9, wallHeight: WALL, surface: 'moss' });
  b.mark('under');
  // Swaying round the roots in the green dark.
  b.straight(30).arc(60, 35).arc(60, -70).arc(60, 35).straight(40);
  b.mark('underEnd');
  b.section('Lava Tube', { halfWidth: 9.5, wallHeight: WALL, surface: 'moss' });
  b.mark('tube');
  b.arc(45, -90);
  b.mark('tubeEnd');
  b.straight(20);

  b.section('The Jam', { halfWidth: 10.5, surface: 'moss' });
  b.mark('jam');
  b.straight(10);
  b.mark('bridgeFrom');
  b.arc(JAM_R, JAM_TURN).arc(JAM_R, -2 * JAM_TURN).arc(JAM_R, JAM_TURN);
  b.mark('bridgeTo');
  b.straight(15);
  // Tape Hiss: the road wavering like a tape running slow.
  b.section('Tape Hiss', { halfWidth: 10, surface: 'moss' });
  b.mark('hiss');
  b.arc(40, 30).arc(40, -60).arc(40, 60).arc(40, -30);
  b.mark('hissEnd');

  // The Root Gully: a leap over a cleft in the old lava, roots hanging into it.
  b.section('Root Gully', { halfWidth: 9, wallHeight: 1.2, surface: 'moss' });
  b.mark('gully');
  b.straight(15).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20);
  b.elevate(0).straight(15);
  b.mark('gullyEnd');

  b.section('Out of Tape', { halfWidth: 11, surface: 'moss' });
  b.mark('tape');
  b.turnTo(offsetPose(START, -FINISH * K), 45);
  b.section('Finish Straight', { halfWidth: 11, surface: 'moss' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // Up onto the treetops and over the swells; the bend that unfolds stays up; then the plunge, and down in the green dark.
  ease(b, m('canopy', -40), 0, m('canopy', 10), CANOPY);
  const c0 = m('canopy', 10);
  const c1 = m('canopyEnd');
  b.profile(c0, c1, (u) => CANOPY + SWELL * Math.sin(Math.PI * SWELLS * u) ** 2);
  b.profile(c1, m('sink'), () => CANOPY, 10);
  plunge(b, m('sink'), CANOPY, m('under', 30), -DEPTH);
  b.profile(m('under', 30), m('underEnd'), () => -DEPTH, 10);
  ease(b, m('underEnd'), -DEPTH, m('tubeEnd', 20), 0);

  // Out of Tape rolls over the roots, two humps and a crest to fly off.
  b.profile(m('gullyEnd', 20), m('finish', -30), (u) => ROOTS * Math.sin(Math.PI * 2 * u) ** 2);

  const main = b.finish(true);
  const rope = buildRopeBridge(b.marks.bridgeFrom, b.marks.bridgeTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'sea-of-trees',
    name: 'Sea of Trees',
    main,
    branches: [rope.branch],
    pits: [...b.pits, ...rope.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('unfoldEnd', 5), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('tape', 10), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['canopy', 'unfold', 'sink', 'under', 'tube', 'jam', 'tape'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'trunkGate', ribbon: -1, s: 6 },
      { kind: 'trunkGate', ribbon: -1, s: at('under', -2) },
      { kind: 'snowPeak', ribbon: -1, s: at('under', 90), lateral: -220 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('canopy', 60), count: 4 },
      { s: at('sink', 30), count: 3 },
      { s: at('under', 120), count: 3 },
      { s: at('jam', 5), count: 4 },
      { s: rope.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'timber', at: [at('under', 60), at('under', 125), at('under', 180)], period: 4.8 },
      { kind: 'timber', at: [at('tube', 30)], period: 5.2 },
      { kind: 'timber', at: [at('canopy', 150)], period: 5.6 },
    ],
    theme: 'treesea',
    music: { lap: 'sea-of-trees', finalLap: 'sea-of-trees-final-lap' },
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
 * The Rope Bridge: planks strung straight across the hollow the Jam swings
 * round, no rails, the forest floor far below. Strung up for the final lap
 * only.
 */
function buildRopeBridge(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Rope Bridge', { halfWidth: 6, surface: 'moss' });
  b.straight(30);
  b.section('The Planks', { halfWidth: 4.5, surface: 'boards' });
  b.elevate(0).straight(12).elevate(1);
  const hollow = chord - 2 * b.s;
  const boxes = b.s + hollow / 2;
  b.bridge(hollow, 7);
  b.elevate(1).straight(12).elevate(0);
  b.section('Rope Bridge', { halfWidth: 6, surface: 'moss' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Rope Bridge', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: ['final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
