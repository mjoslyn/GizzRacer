import { TrackBuilder, type Pose } from './builder';
import type { TrackDef } from './track';

/** Loop radius, and half the angle the two straights cross at. */
const R = 80;
const HALF_CROSS = (22 * Math.PI) / 180;
/** Tangent point to crossing, along each straight: the figure-8 closes exactly. */
const L = R / Math.tan(HALF_CROSS);
const LOOP_DEG = 180 + (2 * HALF_CROSS * 180) / Math.PI;
/** Start line distance into the underpass straight. */
const START_IN = 120;
const BRIDGE_Y = 9;
const RAMP = 95;
const DECK = 90;

/**
 * Infinite Loop Speedway (spec section 7, easy): a figure-8 on green
 * hills. Two wide loops joined by long straights that cross in the middle,
 * one flying over the other on an overpass. Seen from above it is an
 * infinity sign.
 */
export function buildInfiniteLoopSpeedway(): TrackDef {
  // Start a little way down the underpass straight, heading for the crossing.
  const start: Pose = { x: -78, z: 0, h: Math.PI / 2 };
  const b = new TrackBuilder(start, 'Start Straight', { halfWidth: 12 });
  b.straight(L - START_IN - 25);
  b.section('Underpass', { halfWidth: 12 });
  b.mark('underpass');
  b.straight(50);
  b.section('Long Way Round', { halfWidth: 12 });
  b.straight(L - 25);

  b.section('Mobius Loop', { halfWidth: 11, wallHeight: 1.2 });
  b.mark('mobius');
  b.arc(R, LOOP_DEG);

  // The overpass straight: climb, fly over the crossing, come back down.
  const climbAt = L - DECK / 2 - RAMP;
  b.section('Overpass Climb', { halfWidth: 11 });
  b.mark('overpass');
  b.straight(climbAt).elevate(0).straight(RAMP).elevate(BRIDGE_Y);
  b.section('The Overpass', { halfWidth: 11, wallHeight: 1.2, bridge: true });
  b.straight(DECK).elevate(BRIDGE_Y);
  b.section('Overpass Descent', { halfWidth: 11 });
  b.straight(RAMP).elevate(0).straight(climbAt);

  b.section('Endless Bend', { halfWidth: 11, wallHeight: 1.2 });
  b.mark('endless');
  b.arc(R, -LOOP_DEG);
  b.section('Start Straight', { halfWidth: 12 });
  b.straight(START_IN);

  const main = b.finish(true);
  return {
    id: 'infinite-loop-speedway',
    name: 'Infinite Loop Speedway',
    main,
    branches: [],
    pits: [],
    boostPads: [
      { s: 30, length: 8, lateral: -5, halfWidth: 2.5 },
      { s: 30, length: 8, lateral: 5, halfWidth: 2.5 },
      { s: b.marks.overpass.s + climbAt - 30, length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['underpass', 'mobius', 'overpass', 'endless'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 420,
    landmarks: [{ kind: 'gantry', ribbon: -1, s: 0 }],
    itemBoxes: [
      { s: 50, count: 4 },
      { s: b.marks.overpass.s + 40, count: 4 },
      { s: b.marks.endless.s + 60, count: 4 },
    ],
    hazards: [],
    theme: 'speedway',
    music: { lap: 'infinite-loop-speedway' },
  };
}
