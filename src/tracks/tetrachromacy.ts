import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: 110 * K, z: -150 * K, h: -Math.PI / 2 };
const FINISH = 45;
/** The Ultraviolet Bend: the road swings out round a chasm in three arcs of this radius and turn. */
const BEND_R = 34;
const BEND_TURN = 70;
/** The Refraction Spiral's radius, and the top of it. */
const SPIRAL_R = 22;
const SPIRAL_TOP = 14;
/** How deep the Afterimage Trench is sunk. */
const TRENCH_DEPTH = 6;
/** The Mirror Maze's walls. */
const MIRROR = 5;

/**
 * Tetrachromacy (the Polygondwanaland Cup's finale), after the song: a
 * world seen with a fourth kind of cone in the eye, light split into four
 * colours. Down Spectrum Straight (two kickers), through the Cone Cells
 * and a full turn up the Refraction Spiral, over its own start, and the
 * Rainbow Descent off the top. Right angles through the Mirror Maze,
 * prism beams sweeping across in red, green and blue, and the fourth
 * colour, which is a boost. The Afterimage Trench sunk 6 m, a leap over a
 * chasm, and the Ultraviolet Bend round another, which a road in the
 * fourth colour crosses straight over: on the final lap only.
 */
export function buildTetrachromacy(): TrackDef {
  const b = new TrackBuilder(START, 'Spectrum Straight', { halfWidth: 11, surface: 'prism' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(70);

  b.section('Cone Cells', { halfWidth: 9.5, wallHeight: 1.2, surface: 'prism' });
  b.mark('cones');
  b.arc(40, 90).straight(10).arc(28, -60).arc(28, 60).straight(20);

  // A full turn up and over the road it started on.
  b.section('Refraction Spiral', { halfWidth: 9.5, wallHeight: 1.2, surface: 'prism', bridge: true });
  b.mark('spiral');
  b.arc(SPIRAL_R, 360);
  b.mark('spiralTop');
  b.section('Rainbow Descent', { halfWidth: 10, surface: 'prism' });
  b.mark('descent');
  b.straight(130);

  b.section('Mirror Maze', { halfWidth: 9, wallHeight: MIRROR, surface: 'prism' });
  b.mark('maze');
  b.arc(16, 90).straight(30).arc(16, -90).straight(30).arc(16, 90).straight(20);
  b.section('Afterimage Trench', { halfWidth: 9, wallHeight: MIRROR, surface: 'prism' });
  b.mark('trench');
  b.straight(140);
  b.mark('trenchEnd');
  b.straight(10);

  b.section('Prism Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'prism' });
  b.mark('leap');
  b.arc(36, 90).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30);
  b.elevate(0).straight(20);

  b.section('Ultraviolet Bend', { halfWidth: 9.5, surface: 'prism' });
  b.mark('bend');
  b.straight(5);
  b.mark('uvFrom');
  b.arc(BEND_R, BEND_TURN).arc(BEND_R, -2 * BEND_TURN).arc(BEND_R, BEND_TURN);
  b.mark('uvTo');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'prism' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the spiral and down the descent, the trench.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('cones', 75), m('spiral', -5), (u) => 2 * Math.sin(Math.PI * u) ** 2);
  b.profile(m('spiral'), m('spiralTop'), (u) => SPIRAL_TOP * u);
  b.profile(m('spiralTop'), m('descent', 30), () => SPIRAL_TOP, 10);
  plunge(b, m('descent', 30), SPIRAL_TOP, m('descent', 100), 0);
  ease(b, m('trench', 5), 0, m('trench', 40), -TRENCH_DEPTH);
  ease(b, m('trench', 100), -TRENCH_DEPTH, m('trenchEnd', 10), 0);
  b.profile(m('uvTo', 40), m('finish', -10), (u) => 3 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const uv = buildUltraviolet(b.marks.uvFrom, b.marks.uvTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'tetrachromacy',
    name: 'Tetrachromacy',
    main,
    branches: [uv.branch],
    pits: [...b.pits, ...uv.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('descent', 110), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leap', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['cones', 'spiral', 'descent', 'maze', 'trench', 'leap', 'bend'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'prismGate', ribbon: -1, s: 6 },
      { kind: 'prismGate', ribbon: -1, s: at('maze', -2) },
      { kind: 'prismEye', ribbon: -1, s: at('descent', 60), lateral: -120 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('cones', 20), count: 4 },
      { s: at('descent', 115), count: 3 },
      { s: at('trench', 50), count: 3 },
      { s: at('bend', 45), count: 4 },
      { s: uv.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'prisms', at: [at('maze', 41), at('maze', 103)], period: 4 },
      { kind: 'prisms', at: [at('trench', 30), at('trench', 95)], period: 4.4 },
    ],
    theme: 'prism',
    music: { lap: 'tetrachromacy', finalLap: 'tetrachromacy-final-lap' },
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
 * Ultraviolet: a road in the fourth colour, straight over the chasm the
 * Ultraviolet Bend swings round. No rails. Only a tetrachromat sees it,
 * and only on the final lap: the rest of the race it isn't there.
 */
function buildUltraviolet(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Ultraviolet', { halfWidth: 6, surface: 'prism' });
  b.straight(30);
  b.section('Ultraviolet Span', { halfWidth: 4.5, surface: 'prism' });
  b.elevate(0).straight(12).elevate(1);
  const chasm = chord - 2 * b.s;
  const boxes = b.s + chasm / 2;
  b.bridge(chasm, 7);
  b.elevate(1).straight(12).elevate(0);
  b.section('Ultraviolet', { halfWidth: 6, surface: 'prism' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Ultraviolet', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: ['final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
