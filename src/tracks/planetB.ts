import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: -110 * K, z: -150 * K, h: Math.PI / 2 };
const FINISH = 45;
/** Refinery Bend: the road swings out round a pit of burning oil in three arcs of this radius and turn. */
const BEND_R = 34;
const BEND_TURN = 70;
/** The Smokestack Spiral's radius, and the top of it. */
const SPIRAL_R = 23;
const SPIRAL_TOP = 14;
/** How deep the Sewer Cut is sunk. */
const SEWER_DEPTH = 6;
/** The tenements walling Smog Alley. */
const WALL = 6;

/**
 * Planet B (the Infest the Rats' Nest Cup's opener), after the song: Earth
 * used up and burning, and no planet B. Down Last Exit Straight (two
 * kickers) under a gate of smokestacks, through the Smokestack Esses and a
 * full turn up the Smokestack Spiral round a chimney, over its own start,
 * and the Ash Drop off the top. Right angles through Smog Alley between
 * tenements 6 m tall, the Sewer Cut sunk 6 m with an oil slick at the
 * bottom of it, smog rolling across both from the stacks at the roadside;
 * the Landfill Leap over burning oil, and Refinery Bend round a pit of it,
 * which the Last Bridge crosses straight over on laps 1 and 2 before it
 * burns away on the final lap.
 */
export function buildPlanetB(): TrackDef {
  const b = new TrackBuilder(START, 'Last Exit Straight', { halfWidth: 11, surface: 'tar' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(60);

  b.section('Smokestack Esses', { halfWidth: 10, wallHeight: 1.2, surface: 'tar' });
  b.mark('esses');
  b.arc(40, -90).straight(10).arc(28, 60).arc(28, -60).straight(20);

  // A full turn round a chimney, up and over the road it started on.
  b.section('Smokestack Spiral', { halfWidth: 9.5, wallHeight: 1.2, surface: 'tar', bridge: true });
  b.mark('spiral');
  b.arc(SPIRAL_R, -360);
  b.mark('spiralTop');
  b.section('Ash Drop', { halfWidth: 10, surface: 'tar' });
  b.mark('drop');
  b.straight(130);

  b.section('Smog Alley', { halfWidth: 9, wallHeight: WALL, surface: 'tar' });
  b.mark('alley');
  b.arc(16, -90).straight(36).arc(16, 90).straight(44).arc(16, -90).straight(20);
  b.section('Sewer Cut', { halfWidth: 9, wallHeight: WALL, surface: 'tar' });
  b.mark('sewer');
  b.straight(60);
  // Crude pooled at the bottom of the cut: it slides like ice.
  b.section('Oil Slick', { halfWidth: 9, wallHeight: WALL, surface: 'oil' });
  b.mark('slick');
  b.straight(40);
  b.section('Sewer Outfall', { halfWidth: 9, wallHeight: WALL, surface: 'tar' });
  b.straight(40);
  b.mark('sewerEnd');
  b.straight(10);

  b.section('Landfill Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'tar' });
  b.mark('leap');
  b.arc(36, -90).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'oil');
  b.elevate(0).straight(20);

  b.section('Refinery Bend', { halfWidth: 9.5, surface: 'tar' });
  b.mark('bend');
  b.straight(5);
  b.mark('bridgeFrom');
  b.arc(BEND_R, -BEND_TURN).arc(BEND_R, 2 * BEND_TURN).arc(BEND_R, -BEND_TURN);
  b.mark('bridgeTo');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'tar' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the spiral and off the top, the sewer.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('esses', 75), m('spiral', -5), (u) => 2 * Math.sin(Math.PI * u) ** 2);
  b.profile(m('spiral'), m('spiralTop'), (u) => SPIRAL_TOP * u);
  b.profile(m('spiralTop'), m('drop', 30), () => SPIRAL_TOP, 10);
  plunge(b, m('drop', 30), SPIRAL_TOP, m('drop', 100), 0);
  ease(b, m('sewer', 5), 0, m('sewer', 40), -SEWER_DEPTH);
  ease(b, m('sewer', 100), -SEWER_DEPTH, m('sewerEnd', 10), 0);
  b.profile(m('bridgeTo', 40), m('finish', -10), (u) => 3 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const bridge = buildLastBridge(b.marks.bridgeFrom, b.marks.bridgeTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'planet-b',
    name: 'Planet B',
    main,
    branches: [bridge.branch],
    pits: [...b.pits, ...bridge.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('drop', 110), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leap', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['esses', 'spiral', 'drop', 'alley', 'sewer', 'leap', 'bend'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'smogGate', ribbon: -1, s: 6 },
      { kind: 'smogGate', ribbon: -1, s: at('alley', -2) },
      { kind: 'burningEarth', ribbon: -1, s: at('drop', 60), lateral: 120 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('esses', 20), count: 4 },
      { s: at('drop', 115), count: 3 },
      { s: at('sewer', 30), count: 3 },
      { s: at('bend', 45), count: 4 },
      { s: bridge.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'smog', at: [at('alley', 45), at('alley', 120)], period: 4.6 },
      { kind: 'smog', at: [at('sewer', 20), at('sewer', 120)], period: 5 },
    ],
    theme: 'smog',
    music: { lap: 'planet-b', finalLap: 'planet-b-final-lap' },
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
 * The Last Bridge: an old road bridge straight over the burning pit that
 * Refinery Bend swings round. No rails. There on laps 1 and 2; by the
 * final lap it has burned away and there is nothing left to drive on.
 */
function buildLastBridge(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'The Last Bridge', { halfWidth: 6, surface: 'asphalt' });
  b.straight(30);
  b.section('Burning Span', { halfWidth: 4.5, surface: 'tar' });
  b.elevate(0).straight(12).elevate(1);
  const pit = chord - 2 * b.s;
  const boxes = b.s + pit / 2;
  b.bridge(pit, 7, 'oil');
  b.elevate(1).straight(12).elevate(0);
  b.section('The Last Bridge', { halfWidth: 6, surface: 'asphalt' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'The Last Bridge', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [1, 2], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
