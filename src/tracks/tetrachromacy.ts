import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1;
const DEG = Math.PI / 180;
/**
 * The lap draws an eye: two lids meeting at its corners this far either
 * side of its middle, each bowed this far from the line between them, so
 * each is an arc of this radius turning this far either side of the middle.
 */
const EYE_Z = 90;
const CORNER_X = 240;
const LID = 120;
const LID_R = (CORNER_X ** 2 + LID ** 2) / (2 * LID);
const LID_HALF = Math.asin(CORNER_X / LID_R);
/** The middle of the circle each lid is an arc of: the upper lid's below the eye, the lower lid's above it. */
const UPPER_Z = EYE_Z + LID - LID_R;
const LOWER_Z = EYE_Z - LID + LID_R;
/** The outer corner of the eye, where the lower lid comes in: the road loops round there and back over itself onto the upper lid. */
const CORNER: Pose = { x: -CORNER_X * K, z: EYE_Z * K, h: LID_HALF - Math.PI / 2 };
const START: Pose = offsetPose({ ...CORNER, h: Math.PI / 2 - LID_HALF }, 45 * K);
const FINISH = 45;
/** The corner's loop: its radius, and how high it runs where it crosses the road onto the upper lid. */
const CORNER_R = 45;
const CORNER_Y = 9;
/**
 * The Refraction Spiral: off the upper lid this far along, curling down on
 * turns of this radius into the iris, round the middle of the eye from
 * the bottom, widening from this radius to this one, up to this height.
 */
const CURL_X = 200;
const CURL_R = 40;
const IRIS_R0 = 70;
const IRIS_R1 = 90;
const IRIS_TURN = 270;
const SPIRAL_TOP = 14;
/** Where the road back round the far corner joins the lower lid, and where the trench sinks. */
const HOOK_X = 110;
const TRENCH_X = 40;
/** The Ultraviolet Bend: the road swings out round a chasm in three arcs of this radius and turn. */
const BEND_R = 34;
const BEND_TURN = 70;
/** How deep the Afterimage Trench is sunk. */
const TRENCH_DEPTH = 6;
/** The Mirror Maze's walls. */
const MIRROR = 5;

/** The pose on the upper lid (or the lower) above (or below) x, heading round the eye clockwise on the map. */
function lid(x: number, upper: boolean): Pose {
  const cz = upper ? UPPER_Z : LOWER_Z;
  const rz = (upper ? 1 : -1) * Math.sqrt(LID_R ** 2 - x ** 2);
  return { x: x * K, z: (cz + rz) * K, h: Math.atan2(rz, -x) };
}

/**
 * Tetrachromacy (the Polygondwanaland Cup's finale), after the song: a
 * world seen with a fourth kind of cone in the eye, light split into four
 * colours. The lap draws the eye. Up Spectrum Straight (two kickers) from
 * its outer corner and along the upper lid through the Cone Cells; at the
 * far corner it curls down into the iris, the Refraction Spiral, a turn
 * and a bit round the middle of the eye, widening as it climbs to 14 m,
 * the great eye watching from the middle of it. The Rainbow Descent runs
 * off the top straight over the curl it came in on and the lower lid, and
 * down. Right angles through the Mirror Maze under the eye, prism beams
 * sweeping across in red, green and blue, and the fourth colour, which is
 * a boost; the Ultraviolet Bend round a chasm, which a road in the fourth
 * colour crosses straight over, on the final lap only. Back along the
 * lower lid: the Afterimage Trench sunk 6 m, the Prism Leap over a chasm,
 * and the Corner of the Eye, a loop up over the start and round onto the
 * upper lid.
 */
export function buildTetrachromacy(): TrackDef {
  const b = new TrackBuilder(START, 'Spectrum Straight', { halfWidth: 11, surface: 'prism' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(30);

  // Over the top of the eye along the upper lid, a row of cones jinking across it.
  b.section('Cone Cells', { halfWidth: 9.5, wallHeight: 1.2, surface: 'prism' });
  b.mark('cones');
  b.hermiteTo(lid(-90, true));
  b.arc(45, 30).arc(45, -60).arc(45, 30);
  b.hermiteTo(lid(CURL_X, true));
  b.mark('conesEnd');

  // At the far corner of the eye, curl down into the iris and round it, widening as it climbs.
  b.section('Refraction Spiral', { halfWidth: 9.5, wallHeight: 1.2, surface: 'prism', bridge: true });
  b.mark('spiral');
  b.turnTo({ x: 0, z: (EYE_Z - IRIS_R0) * K, h: -90 * DEG }, CURL_R);
  b.mark('iris');
  b.spiral(IRIS_R0, IRIS_R1, IRIS_TURN);
  b.mark('spiralTop');
  b.section('Rainbow Descent', { halfWidth: 10, wallHeight: 1.2, surface: 'prism', bridge: true });
  b.mark('descent');
  // Straight down the map, over the curl and the lower lid.
  b.straight(220);

  b.section('Mirror Maze', { halfWidth: 9, wallHeight: MIRROR, surface: 'prism' });
  b.mark('maze');
  b.arc(16, -90).straight(30).arc(16, 90).straight(30).arc(16, -90).straight(20);
  b.section('Ultraviolet Bend', { halfWidth: 9.5, surface: 'prism' });
  b.mark('bend');
  b.arc(50, -90);
  b.straight(5);
  b.mark('uvFrom');
  b.arc(BEND_R, BEND_TURN).arc(BEND_R, -2 * BEND_TURN).arc(BEND_R, BEND_TURN);
  b.mark('uvTo');
  b.straight(5);

  // Round the far corner and back along the lower lid, under the descent.
  b.section('Afterimage Trench', { halfWidth: 9, wallHeight: MIRROR, surface: 'prism' });
  b.turnTo(lid(HOOK_X, false), 40);
  b.arc(LID_R, ((lid(TRENCH_X, false).h - lid(HOOK_X, false).h) * 180) / Math.PI);
  b.mark('trench');
  b.arc(LID_R, ((lid(-120, false).h - lid(TRENCH_X, false).h) * 180) / Math.PI);
  b.mark('trenchEnd');
  b.straight(10);

  b.section('Prism Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'prism' });
  b.mark('leap');
  b.straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30);
  b.elevate(0).straight(20);
  b.mark('leapEnd');
  b.hermiteTo(CORNER);

  // The corner of the eye: on round a loop, up over the road onto the upper lid, and down onto it.
  b.section('Corner of the Eye', { halfWidth: 9.5, wallHeight: 1.2, surface: 'prism', bridge: true });
  b.mark('corner');
  const leg = CORNER_R / Math.tan(LID_HALF);
  b.straight(leg).arc(CORNER_R, -(180 + (2 * LID_HALF) / DEG)).straight(leg);
  b.section('Finish Straight', { halfWidth: 11, surface: 'prism' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the iris and down off the top, the trench, up round the corner.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('cones', 40), m('conesEnd', -5), (u) => 2 * Math.sin(Math.PI * u) ** 2);
  b.profile(m('iris'), m('spiralTop'), (u) => SPIRAL_TOP * u);
  b.profile(m('spiralTop'), m('descent', 140), () => SPIRAL_TOP, 10);
  plunge(b, m('descent', 140), SPIRAL_TOP, m('descent', 215), 0);
  ease(b, m('trench', 5), 0, m('trench', 40), -TRENCH_DEPTH);
  ease(b, m('trenchEnd', -40), -TRENCH_DEPTH, m('trenchEnd', 5), 0);
  ease(b, m('leapEnd', 5), 0, m('corner', -35), CORNER_Y);
  b.profile(m('corner', -35), m('corner', 35), () => CORNER_Y, 10);
  ease(b, m('corner', 35), CORNER_Y, m('finish', -60), 0);

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
      { s: at('descent', 205), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leap', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['cones', 'spiral', 'descent', 'maze', 'bend', 'trench', 'leap', 'corner'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'prismGate', ribbon: -1, s: 6 },
      { kind: 'prismGate', ribbon: -1, s: at('maze', -2) },
      // In the middle of the iris.
      { kind: 'prismEye', ribbon: -1, s: at('iris', 1), lateral: -IRIS_R0 * K },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('cones', 20), count: 4 },
      { s: at('descent', 20), count: 3 },
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
