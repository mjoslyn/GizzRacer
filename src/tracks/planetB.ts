import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
/**
 * The plus sign, in builder units: each arm is ARM wide (ARM / 2 either
 * side of the centre line), the up and down arms reach REACH_V from the
 * centre and the side arms REACH_H.
 */
const ARM = 80;
const A = ARM / 2;
const REACH_V = 220;
const REACH_H = 170;
/** The block corners: outer (round the arm ends) and inner (where two arms meet). */
const OUTER_R = 30;
const INNER_R = 25;
const START: Pose = { x: -A * K, z: (-REACH_V + OUTER_R + 45) * K, h: 0 };
const FINISH = 45;
/** Refinery Bend cuts the inner corner this far (builder units) either side of where the two roads would meet. */
const BEND_D = 95;
const BEND_R = 20;
/** The Smokestack Spiral's radius, and the top of it. */
const SPIRAL_R = 23;
const SPIRAL_TOP = 14;
/** How deep the Sewer Cut is sunk. */
const SEWER_DEPTH = 6;
/** The tenements walling Smog Alley. */
const WALL = 6;
/** The alley's corners. */
const ALLEY_R = 16;

/**
 * Planet B (the Infest the Rats' Nest Cup's opener), after the song: Earth
 * used up and burning, and no planet B. The lap is a plus sign, four arms
 * of city blocks round a centre, driven clockwise. Up Last Exit Straight
 * (two kickers) on the bottom arm under a gate of smokestacks, then the
 * Smokestack Esses: left at the first inner corner and right round the end
 * of the left arm, where the road loops a full turn outward up the
 * Smokestack Spiral round a chimney, over its own start, and the Ash Drop
 * falls away along the top of the left arm. Up the top arm into Smog
 * Alley, right angles between tenements 6 m tall round the top of it, and
 * straight down its far side in the Sewer Cut, sunk 6 m with an oil slick
 * at the bottom, smog rolling across both from the stacks at the roadside.
 * Out along the right arm over the Landfill Leap and its burning oil, round
 * the arm's end, and Refinery Bend round the last inner corner, which the
 * Last Bridge cuts straight across on laps 1 and 2 before it burns away on
 * the final lap; down the bottom arm and round its end to the line.
 */
export function buildPlanetB(): TrackDef {
  const b = new TrackBuilder(START, 'Last Exit Straight', { halfWidth: 11, surface: 'tar' });
  b.scale = K;
  // Up the bottom arm's left side to the first inner corner.
  const run = -A - INNER_R - START.z / K;
  b.straight(40).mark('kick1').kicker().straight(25).mark('kick2').kicker();
  b.straight(run - 65 - 14 / K);

  b.section('Smokestack Esses', { halfWidth: 10, wallHeight: 1.2, surface: 'tar' });
  b.mark('esses');
  b.arc(INNER_R, -90).straight(REACH_H - A - INNER_R - OUTER_R).arc(OUTER_R, 90).straight(8);

  // A full turn outward round a chimney at the end of the left arm, up and over the road it started on.
  b.section('Smokestack Spiral', { halfWidth: 9.5, wallHeight: 1.2, surface: 'tar', bridge: true });
  b.mark('spiral');
  b.arc(SPIRAL_R, -360);
  b.mark('spiralTop');
  b.section('Ash Drop', { halfWidth: 10, surface: 'tar' });
  b.mark('drop');
  b.straight(ARM - 2 * OUTER_R - 8).arc(OUTER_R, 90).straight(REACH_H - A - INNER_R - OUTER_R).arc(INNER_R, -90).straight(50);

  // Round the top of the top arm: right angles between the tenements.
  b.section('Smog Alley', { halfWidth: 9, wallHeight: WALL, surface: 'tar' });
  b.mark('alley');
  b.straight(REACH_V - A - INNER_R - 50 - ALLEY_R).arc(ALLEY_R, 90).straight(ARM - 2 * ALLEY_R).arc(ALLEY_R, 90);
  b.section('Sewer Cut', { halfWidth: 9, wallHeight: WALL, surface: 'tar' });
  b.mark('sewer');
  const sewer = REACH_V - ALLEY_R - A - INNER_R;
  b.straight(sewer - 89);
  // Crude pooled at the bottom of the cut: it slides like ice.
  b.section('Oil Slick', { halfWidth: 9, wallHeight: WALL, surface: 'oil' });
  b.mark('slick');
  b.straight(40);
  b.section('Sewer Outfall', { halfWidth: 9, wallHeight: WALL, surface: 'tar' });
  b.straight(40);
  b.mark('sewerEnd');
  b.straight(9);

  // Out along the right arm and over the burning oil.
  b.section('Landfill Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'tar' });
  b.mark('leap');
  b.arc(INNER_R, -90).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'oil');
  b.elevate(0).straight(20);
  const leapRun = A + INNER_R + 10 + 20 + 31 / K;

  b.section('Refinery Bend', { halfWidth: 9.5, surface: 'tar' });
  b.mark('bend');
  b.straight(REACH_H - OUTER_R - leapRun).arc(OUTER_R, 90).straight(ARM - 2 * OUTER_R).arc(OUTER_R, 90);
  b.straight(REACH_H - OUTER_R - A - BEND_D);
  b.mark('bridgeFrom');
  b.straight(BEND_D - BEND_R).arc(BEND_R, -90).straight(BEND_D - BEND_R);
  b.mark('bridgeTo');
  // Down the bottom arm and round its end to the line.
  b.straight(REACH_V - A - BEND_D - OUTER_R).arc(OUTER_R, 90).straight(ARM - 2 * OUTER_R);
  // A shade tighter than the corner it finishes, so the turn always lands with a straight to spare.
  b.turnTo(offsetPose(START, -FINISH * K), OUTER_R - 1.5);
  b.section('Finish Straight', { halfWidth: 11, surface: 'tar' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the spiral and off the top, the sewer.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('esses', 75), m('spiral', -5), (u) => 2 * Math.sin(Math.PI * u) ** 2);
  b.profile(m('spiral'), m('spiralTop'), (u) => SPIRAL_TOP * u);
  b.profile(m('spiralTop'), m('drop', 72), () => SPIRAL_TOP, 10);
  plunge(b, m('drop', 72), SPIRAL_TOP, m('drop', 135), 0);
  ease(b, m('sewer', 5), 0, m('sewer', 40), -SEWER_DEPTH);
  ease(b, m('sewer', 95), -SEWER_DEPTH, m('sewerEnd', 9), 0);
  b.profile(m('bridgeTo', 30), m('finish', -10), (u) => 3 * Math.sin(Math.PI * u) ** 2);

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
      { s: at('drop', 145), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leap', 40), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['esses', 'spiral', 'drop', 'alley', 'sewer', 'leap', 'bend'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'smogGate', ribbon: -1, s: 6 },
      { kind: 'smogGate', ribbon: -1, s: at('alley', -2) },
      { kind: 'burningEarth', ribbon: -1, s: at('drop', 15), lateral: 150 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('esses', 70), count: 4 },
      { s: at('drop', 105), count: 3 },
      { s: at('sewer', 30), count: 3 },
      { s: at('bend', 70), count: 4 },
      { s: bridge.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'smog', at: [at('alley', 45), at('alley', 140)], period: 4.6 },
      { kind: 'smog', at: [at('sewer', 20), at('sewer', 110)], period: 5 },
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
 * The Last Bridge: an old road bridge straight across the inner corner
 * Refinery Bend swings round, over a pit of burning oil. No rails. There
 * on laps 1 and 2; by the final lap it has burned away and there is
 * nothing left to drive on.
 */
function buildLastBridge(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  // Half the turn off the main road, straight across, and the other half back on.
  const r = 34;
  const lead = 6;
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z) - Math.SQRT2 * (r + lead);
  const b = new TrackBuilder(from.pose, 'The Last Bridge', { halfWidth: 6, surface: 'asphalt' });
  b.straight(lead).arc(r, -45);
  const s0 = b.s;
  b.straight(8);
  b.section('Burning Span', { halfWidth: 4.5, surface: 'tar' });
  b.elevate(0).straight(12).elevate(1);
  const pit = chord - 2 * (b.s - s0);
  const boxes = b.s + pit / 2;
  b.bridge(pit, 7, 'oil');
  b.elevate(1).straight(12).elevate(0);
  b.section('The Last Bridge', { halfWidth: 6, surface: 'asphalt' });
  b.turnTo(offsetPose(to.pose, -lead), r).straight(lead);
  const branch: BranchDef = { name: 'The Last Bridge', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [1, 2], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
