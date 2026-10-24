import { TrackBuilder, dubins, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
/**
 * The dome, in builder units: the flat along the bottom at FLAT, and the
 * dome's radius. The road climbs DOME_LEG up the right-hand side before the
 * dome's sweep begins, and the dome's centre is level with that.
 */
const FLAT = -135;
const DOME_R = 220;
const DOME_LEG = 50;
/** The Crater Rim: the corner off the flat round a crater, of this radius, which the Service Tube cuts from this far back along the flat. */
const RIM_R = 30;
const RIM_D = 130;
/** The right-hand corner off the flat, under the start of the dome. */
const CORNER_X = DOME_R;
const START: Pose = { x: (CORNER_X - RIM_D - 79) * K, z: FLAT * K, h: Math.PI / 2 };
const FINISH = 45;
/** The Tower Spiral's radius, and the top of it. */
const SPIRAL_R = 19;
const SPIRAL_TOP = 15;
/** How deep the Undercity is sunk: the poor are kept below. */
const UNDER_DEPTH = 7;
/** The dome's glass walls along Airlock Row, and its corner. */
const WALL = 6;
const ROW_R = 18;

/**
 * Mars for the Rich (the Infest the Rats' Nest Cup's second), after the
 * song: the rich have gone to Mars, to a gleaming colony under glass, and
 * the poor are kept below to work it. The lap is a D lying on its flat
 * side, driven anticlockwise: one long flat along the bottom and the
 * colony's dome sweeping over the top. Along Champagne Boulevard (two
 * kickers) on the flat under a gilded airlock gate, then the Crater Rim,
 * the corner up off the flat round a crater, which the Service Tube cuts
 * straight across once the night shift opens it: from lap 2. Up into the
 * dome through the Penthouse Bend and the Dome Esses, a full turn inward up
 * the Tower Spiral, over its own start, and the Golden Descent off the top
 * and round the rest of the dome. Down through Airlock Row between walls
 * of glass 6 m tall and its right angle back onto the flat, into the
 * Undercity, sunk 7 m in the red dust, the colony's airlock doors sliding
 * shut across both; and the Red Dust Leap at the end of the flat before
 * the line.
 */
export function buildMarsForTheRich(): TrackDef {
  const b = new TrackBuilder(START, 'Champagne Boulevard', { halfWidth: 11, surface: 'gilded' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(25).mark('kick2').kicker().straight(79 - 65 - 14 / K);

  // Off the flat and up round the crater, into the foot of the dome.
  b.section('Crater Rim', { halfWidth: 9.5, surface: 'gilded' });
  b.mark('rim');
  b.mark('tubeFrom');
  b.straight(RIM_D - RIM_R).arc(RIM_R, -90).straight(DOME_LEG - RIM_R).arc(DOME_R, -12);
  b.mark('tubeTo');
  b.arc(DOME_R, -6);

  b.section('Penthouse Bend', { halfWidth: 10, wallHeight: 1.2, surface: 'gilded' });
  b.mark('penthouse');
  b.arc(DOME_R, -14);
  b.section('Dome Esses', { halfWidth: 9.5, wallHeight: 1.2, surface: 'gilded' });
  b.mark('esses');
  // A wiggle that turns, all told, as far as the dome would have.
  b.arc(30, 18).arc(30, -48).arc(30, 18).arc(DOME_R, -6);

  // A full turn inward up a tower and over the road it started on.
  b.section('Tower Spiral', { halfWidth: 9.5, wallHeight: 1.2, surface: 'gilded', bridge: true });
  b.mark('spiral');
  b.arc(SPIRAL_R, -360);
  b.mark('spiralTop');
  b.section('Golden Descent', { halfWidth: 10, surface: 'gilded' });
  b.mark('drop');
  b.arc(DOME_R, -130);

  // Down the left side of the dome and round the right angle back onto the flat.
  b.section('Airlock Row', { halfWidth: 9, wallHeight: WALL, surface: 'gilded' });
  b.mark('row');
  const legDown = b.pose.z / K - FLAT - ROW_R;
  b.straight(legDown).arc(ROW_R, -90).straight(12);
  b.section('The Undercity', { halfWidth: 9, wallHeight: WALL, surface: 'regolith' });
  b.mark('under');
  const leap = 10 + 20 + 31 / K;
  const under = (START.x - FINISH * K - b.pose.x) / K - leap;
  b.straight(under - 6);
  b.mark('underEnd');
  b.straight(6);

  b.section('Red Dust Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'regolith' });
  b.mark('leap');
  b.straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30);
  b.elevate(0).straight(20);
  b.section('Finish Straight', { halfWidth: 11, surface: 'gilded' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the tower and down the descent, the undercity.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('penthouse', 4), m('spiral', -5), (u) => 2.5 * Math.sin(Math.PI * u) ** 2);
  b.profile(m('spiral'), m('spiralTop'), (u) => SPIRAL_TOP * u);
  // Held up there until the road is clear of the tower's foot.
  b.profile(m('spiralTop'), m('drop', 50), () => SPIRAL_TOP, 10);
  plunge(b, m('drop', 50), SPIRAL_TOP, m('drop', 120), 0);
  ease(b, m('under', 5), 0, m('under', 40), -UNDER_DEPTH);
  ease(b, m('underEnd', -40), -UNDER_DEPTH, m('underEnd'), 0);

  const main = b.finish(true);
  const tube = buildServiceTube(b.marks.tubeFrom, b.marks.tubeTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'mars-for-the-rich',
    name: 'Mars for the Rich',
    main,
    branches: [tube.branch],
    pits: [...b.pits, ...tube.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('drop', 125), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('ramp', -9), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['rim', 'penthouse', 'spiral', 'drop', 'row', 'under', 'leap'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'domeGate', ribbon: -1, s: 6 },
      { kind: 'domeGate', ribbon: -1, s: at('row', -2) },
      { kind: 'richDome', ribbon: -1, s: at('drop', 70), lateral: 150 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('esses', 10), count: 4 },
      { s: at('drop', 135), count: 3 },
      { s: at('under', 50), count: 3 },
      { s: at('rim', 45), count: 4 },
      { s: tube.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'airlocks', at: [at('row', 15), at('row', legDown + 30)], period: 4.4 },
      { kind: 'airlocks', at: [at('under', 25), at('under', 55), at('under', 85)], period: 5 },
    ],
    theme: 'dome',
    music: { lap: 'mars-for-the-rich', finalLap: 'mars-for-the-rich-final-lap' },
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
 * The Service Tube: the workers' glass tube straight across the corner the
 * Crater Rim swings round, over the crater. No rails. On lap 1 it is sealed
 * off and there is nothing to drive on; from lap 2 the night shift opens it.
 */
function buildServiceTube(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  // Turn off the flat, straight across the crater, and turn onto the dome.
  const r = 22;
  const lead = 6;
  const [first, across] = dubins(offsetPose(from.pose, lead), offsetPose(to.pose, -lead), r);
  const b = new TrackBuilder(from.pose, 'Service Tube', { halfWidth: 6, surface: 'regolith' });
  b.straight(lead).arc(r, ((first[0] === 'L' ? 1 : -1) * first[1] * 180) / (Math.PI * r));
  const s0 = b.s;
  b.straight(8);
  b.section('The Tube', { halfWidth: 4.5, surface: 'neon' });
  b.elevate(0).straight(12).elevate(1);
  const crater = across[1] - 2 * (b.s - s0);
  const boxes = b.s + crater / 2;
  b.bridge(crater, 7);
  b.elevate(1).straight(12).elevate(0);
  b.section('Service Tube', { halfWidth: 6, surface: 'regolith' });
  b.turnTo(offsetPose(to.pose, -lead), r).straight(lead);
  const branch: BranchDef = { name: 'Service Tube', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2, 'final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
