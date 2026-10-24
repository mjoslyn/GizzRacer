import { TrackBuilder, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

/** Loop radius, and half the angle the two straights cross at. */
const R = 80;
const HALF_CROSS = (22 * Math.PI) / 180;
/** Tangent point to crossing, along each straight: the figure-8 closes exactly. */
const L = R / Math.tan(HALF_CROSS);
const LOOP_DEG = 180 + (2 * HALF_CROSS * 180) / Math.PI;
/** Start line distance into the underpass straight. */
const START_IN = 120;
/** The coaster over the crossing: its crest, right above the underpass, and the embankment either end of the deck. */
const CREST_Y = 18;
const BANK = 60;
/** Witchcraft rolls over two hills this high; Merciless Damnation dips into a cutting this deep. */
const ROLL_Y = 6;
const DIP_Y = 4;
/** Gila Trail: degrees into the Merciless Damnation loop where it leaves, and before the end where it rejoins. */
const FACE_IN = 25;
const FACE_OUT = 25;
/** Its turns, much tighter than the loop. */
const FACE_R = 35;
/** Open loop either side of each junction, so the loop's barrier never stands across the cut. */
const FACE_OPEN = 75;

/**
 * Motor Spirit, once Infinite Loop Speedway and then Mr. Beat (spec section 7,
 * easy): a figure-8 on green hills, the PetroDragonic Apocalypse Cup's opener.
 * Two wide loops joined by long straights that cross in the middle, one
 * flying over the other on an overpass. Seen from above it is an infinity
 * sign. Sections are named for PetroDragonic Apocalypse in album order, and
 * its full title (Dawn of Eternal Night: An Annihilation of Planet Earth and
 * the Beginning of Merciless Damnation).
 */
export function buildInfiniteLoopSpeedway(): TrackDef {
  // Start a little way down the underpass straight, heading for the crossing.
  const start: Pose = { x: -78, z: 0, h: Math.PI / 2 };
  const b = new TrackBuilder(start, 'Motor Spirit', { halfWidth: 12 });
  b.straight(L - START_IN - 25);
  b.section('Underpass', { halfWidth: 12 });
  b.mark('underpass');
  b.straight(50);

  // Converge: two kickers a second and a half apart, then a clear run into the loop.
  b.section('Converge', { halfWidth: 12 });
  b.straight(40).kicker().mark('kicker1');
  b.straight(48).kicker().mark('kicker2');
  b.straight(L - 25 - 102);

  b.section('Witchcraft', { halfWidth: 11, wallHeight: 1.2 });
  b.mark('mobius');
  b.arc(R, LOOP_DEG);

  // The overpass straight is a coaster: up onto a deck, over a crest right
  // above the crossing (fast karts fly it), and a plunge back down.
  b.section('Gila Monster', { halfWidth: 11 });
  b.mark('overpass');
  b.straight(BANK);
  b.section('Overpass', { halfWidth: 11, wallHeight: 1.2, bridge: true });
  b.straight(L - BANK);
  b.section('Dawn of Eternal Night', { halfWidth: 11, wallHeight: 1.2, bridge: true });
  b.straight(L - BANK);
  b.section('Dawn of Eternal Night', { halfWidth: 11, wallHeight: 1.2 });
  b.straight(BANK);

  // Merciless Damnation: open where Gila Trail leaves and rejoins, walled between.
  const wallDeg = LOOP_DEG - FACE_IN - FACE_OUT - (2 * FACE_OPEN * 180) / (Math.PI * R);
  b.section('Merciless Damnation', { halfWidth: 11 });
  b.mark('endless');
  b.arc(R, -FACE_IN).mark('faceFrom');
  b.arc(R, (-FACE_OPEN * 180) / (Math.PI * R));
  b.section('Merciless Damnation', { halfWidth: 11, wallHeight: 1.2 });
  b.arc(R, -wallDeg);
  b.section('Merciless Damnation', { halfWidth: 11 });
  b.arc(R, (-FACE_OPEN * 180) / (Math.PI * R)).mark('faceTo');
  b.arc(R, -FACE_OUT);

  b.section('Annihilation', { halfWidth: 12 });
  b.straight(40).kicker().mark('kicker3');
  b.straight(START_IN - 47);

  // Witchcraft rolls over two hills.
  b.profile(b.marks.mobius.s, b.marks.overpass.s, (u) => (ROLL_Y / 2) * (1 - Math.cos(4 * Math.PI * u)), 6);
  // The climb steepens all the way to the crest, which kinks over into a
  // gentle run where flyers land, then the plunge.
  const o = b.marks.overpass.s;
  shape(b, [
    [o, 0, 0],
    [o + L, CREST_Y, 0.2, -0.05],
    [o + L + 40, CREST_Y - 2, -0.06],
    [o + 2 * L, 0, 0],
  ]);
  // Merciless Damnation dips into a cutting between its barriers, clear of Gila Trail.
  const dipFrom = b.marks.faceFrom.s + FACE_OPEN - 10;
  const dipTo = b.marks.faceTo.s - FACE_OPEN + 10;
  b.profile(dipFrom, dipTo, (u) => -DIP_Y * Math.sin(Math.PI * u) ** 2, 6);

  const main = b.finish(true);
  const face = buildGilaTrail(b.marks.faceFrom, b.marks.faceTo);
  return {
    id: 'infinite-loop-speedway',
    name: 'Motor Spirit',
    main,
    branches: [face],
    pits: [],
    boostPads: [
      { s: 30, length: 8, lateral: -5, halfWidth: 2.5 },
      { s: 30, length: 8, lateral: 5, halfWidth: 2.5 },
      { s: b.marks.overpass.s + BANK - 30, length: 8, lateral: 0, halfWidth: 2.5 },
      // On the inside line, pointing into Gila Trail.
      { s: b.marks.faceFrom.s - 12, length: 8, lateral: 6, halfWidth: 2.5 },
    ],
    checkpoints: ['underpass', 'mobius', 'overpass', 'endless'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 420,
    landmarks: [{ kind: 'gantry', ribbon: -1, s: 0 }],
    itemBoxes: [
      { s: 50, count: 4 },
      { s: b.marks.overpass.s + 40, count: 4 },
      { s: b.marks.endless.s + 60, count: 4 },
      { s: face.length / 2, count: 2, ribbon: 0, span: 5, double: true },
    ],
    hazards: [],
    theme: 'speedway',
    music: { lap: 'infinite-loop-speedway' },
  };
}

/**
 * Shapes the road through [s, y, slope] points (a fourth value is the slope
 * leaving the point, for a kink at a crest): a smooth curve between each pair.
 */
function shape(b: TrackBuilder, pts: number[][], step = 6): void {
  for (let k = 1; k < pts.length; k++) {
    const [s0, y0, m0, out = m0] = pts[k - 1];
    const [s1, y1, m1] = pts[k];
    const len = s1 - s0;
    b.profile(s0, s1, (t) => (2 * t ** 3 - 3 * t ** 2 + 1) * y0 + (t ** 3 - 2 * t ** 2 + t) * len * out + (3 * t ** 2 - 2 * t ** 3) * y1 + (t ** 3 - t ** 2) * len * m1, step);
  }
}

/** Gila Trail: a narrow dirt cut across the infield of Merciless Damnation. Forgiving: miss it and you're on the grass. */
function buildGilaTrail(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }): BranchDef {
  const b = new TrackBuilder(from.pose, 'Gila Trail', { halfWidth: 5, surface: 'sand' });
  b.turnTo(to.pose, FACE_R);
  // Hidden on the first lap: it opens from the second.
  return { name: 'Gila Trail', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2, 'final'], shut: { kind: 'vanish' } };
}
