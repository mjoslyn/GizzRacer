import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: 110 * K, z: -150 * K, h: -Math.PI / 2 };
const FINISH = 45;
/** The Focal Bend: the road swings out round a chasm in three arcs of this radius and turn. */
const BEND_R = 34;
const BEND_TURN = 70;
/** The Collimator Spiral's radius, and the top of it. */
const SPIRAL_R = 24;
const SPIRAL_TOP = 15;
/** How deep the Lesion Trench is sunk. */
const TRENCH_DEPTH = 6;
/** The theatre's walls along the alley. */
const WALL = 5;

/**
 * Gamma Knife (the Nonagon Infinity Cup's second), after the song: a black
 * operating theatre where two hundred beams meet on one point, and the
 * point moves. Down Operating Straight (two kickers), through the Cranial
 * Bend and the Cortex Esses, a full turn up the Collimator Spiral, over its
 * own start, and the Synapse Drop off the top. Right angles through Scalpel
 * Alley between tiled walls 5 m tall and the Lesion Trench sunk 6 m, both
 * under the knife: crosshairs closing on the road, then the burst. The
 * Isotope Leap over a pool, and the Focal Bend round a chasm, which Pierced
 * Through, a bridge of light, crosses straight over once the beam is
 * focused: from lap 2.
 */
export function buildGammaKnife(): TrackDef {
  const b = new TrackBuilder(START, 'Operating Straight', { halfWidth: 11, surface: 'chrome' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(70);

  b.section('Cranial Bend', { halfWidth: 10, wallHeight: 1.2, surface: 'chrome' });
  b.mark('cranial');
  b.arc(45, 80).straight(20);
  b.section('Cortex Esses', { halfWidth: 9.5, wallHeight: 1.2, surface: 'chrome' });
  b.mark('cortex');
  b.arc(26, -70).arc(26, 70).straight(20);

  // A full turn up and over the road it started on.
  b.section('Collimator Spiral', { halfWidth: 9.5, wallHeight: 1.2, surface: 'chrome', bridge: true });
  b.mark('spiral');
  b.arc(SPIRAL_R, 360);
  b.mark('spiralTop');
  b.section('Synapse Drop', { halfWidth: 10, surface: 'chrome' });
  b.mark('drop');
  b.straight(120);

  b.section('Scalpel Alley', { halfWidth: 9, wallHeight: WALL, surface: 'chrome' });
  b.mark('alley');
  b.arc(18, 90).straight(50).arc(18, -90).straight(30).arc(18, 90).straight(20);
  b.section('Lesion Trench', { halfWidth: 9, wallHeight: WALL, surface: 'chrome' });
  b.mark('trench');
  b.straight(130);
  b.mark('trenchEnd');
  b.straight(10);

  b.section('Isotope Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'chrome' });
  b.mark('leap');
  b.arc(36, 90).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'water');
  b.elevate(0).straight(20);

  b.section('Focal Bend', { halfWidth: 9.5, surface: 'chrome' });
  b.mark('bend');
  b.straight(5);
  b.mark('beamFrom');
  b.arc(BEND_R, BEND_TURN).arc(BEND_R, -2 * BEND_TURN).arc(BEND_R, BEND_TURN);
  b.mark('beamTo');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'chrome' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the spiral and down the drop, the trench.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('cranial', 20), m('spiral', -5), (u) => 2.5 * Math.sin(Math.PI * u) ** 2);
  b.profile(m('spiral'), m('spiralTop'), (u) => SPIRAL_TOP * u);
  b.profile(m('spiralTop'), m('drop', 25), () => SPIRAL_TOP, 10);
  plunge(b, m('drop', 25), SPIRAL_TOP, m('drop', 95), 0);
  ease(b, m('trench', 5), 0, m('trench', 40), -TRENCH_DEPTH);
  ease(b, m('trench', 90), -TRENCH_DEPTH, m('trenchEnd', 10), 0);
  b.profile(m('beamTo', 40), m('finish', -10), (u) => 3 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const beam = buildPiercedThrough(b.marks.beamFrom, b.marks.beamTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'gamma-knife',
    name: 'Gamma Knife',
    main,
    branches: [beam.branch],
    pits: [...b.pits, ...beam.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('drop', 100), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leap', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['cranial', 'spiral', 'drop', 'alley', 'trench', 'leap', 'bend'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'gammaGate', ribbon: -1, s: 6 },
      { kind: 'gammaGate', ribbon: -1, s: at('alley', -2) },
      { kind: 'gammaRing', ribbon: -1, s: at('drop', 60), lateral: -120 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('cortex', 10), count: 4 },
      { s: at('drop', 105), count: 3 },
      { s: at('trench', 50), count: 3 },
      { s: at('bend', 45), count: 4 },
      { s: beam.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'gammaRays', at: [at('alley', 50), at('alley', 135)], period: 4.2 },
      { kind: 'gammaRays', at: [at('trench', 30), at('trench', 65), at('trench', 100)], period: 4.8 },
    ],
    theme: 'gamma',
    music: { lap: 'gamma-knife', finalLap: 'gamma-knife-final-lap' },
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
 * Pierced Through: a bridge of focused light straight over the chasm the
 * Focal Bend swings round. No rails. On lap 1 the beam is still being
 * aimed and there is nothing there; from lap 2 it holds.
 */
function buildPiercedThrough(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Pierced Through', { halfWidth: 6, surface: 'chrome' });
  b.straight(30);
  b.section('The Beam', { halfWidth: 4.5, surface: 'neon' });
  b.elevate(0).straight(12).elevate(1);
  const chasm = chord - 2 * b.s;
  const boxes = b.s + chasm / 2;
  b.bridge(chasm, 7);
  b.elevate(1).straight(12).elevate(0);
  b.section('Pierced Through', { halfWidth: 6, surface: 'chrome' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Pierced Through', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2, 'final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
