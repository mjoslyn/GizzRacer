import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: 110 * K, z: -150 * K, h: -Math.PI / 2 };
const FINISH = 45;
/** The Crater Rim: the road swings out round a crater in three arcs of this radius and turn. */
const RIM_R = 34;
const RIM_TURN = 70;
/** The Tower Spiral's radius, and the top of it. */
const SPIRAL_R = 19;
const SPIRAL_TOP = 15;
/** How deep the Undercity is sunk: the poor are kept below. */
const UNDER_DEPTH = 7;
/** The dome's glass walls along Airlock Row. */
const WALL = 6;

/**
 * Mars for the Rich (the Infest the Rats' Nest Cup's second), after the
 * song: the rich have gone to Mars, to a gleaming colony under glass, and
 * the poor are kept below to work it. Down Champagne Boulevard (two
 * kickers) under a gilded airlock gate, through the Penthouse Bend and the
 * Dome Esses, a full turn up the Tower Spiral, over its own start, and the
 * Golden Descent off the top. Right angles through Airlock Row between
 * walls of glass 6 m tall, and down into the Undercity, sunk 7 m in the red
 * dust, the colony's airlock doors sliding shut across both. The Red Dust
 * Leap, and the Crater Rim round a crater, which the Service Tube crosses
 * straight over once the night shift opens it: from lap 2.
 */
export function buildMarsForTheRich(): TrackDef {
  const b = new TrackBuilder(START, 'Champagne Boulevard', { halfWidth: 11, surface: 'gilded' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(70);

  b.section('Penthouse Bend', { halfWidth: 10, wallHeight: 1.2, surface: 'gilded' });
  b.mark('penthouse');
  b.arc(45, 80).straight(20);
  b.section('Dome Esses', { halfWidth: 9.5, wallHeight: 1.2, surface: 'gilded' });
  b.mark('esses');
  b.arc(26, -70).arc(26, 70).straight(20);

  // A full turn up a tower and over the road it started on.
  b.section('Tower Spiral', { halfWidth: 9.5, wallHeight: 1.2, surface: 'gilded', bridge: true });
  b.mark('spiral');
  b.arc(SPIRAL_R, 360);
  b.mark('spiralTop');
  b.section('Golden Descent', { halfWidth: 10, surface: 'gilded' });
  b.mark('drop');
  // A shade away from the spiral it just climbed, so the two roads keep clear of each other.
  b.arc(90, -10).straight(110);

  b.section('Airlock Row', { halfWidth: 9, wallHeight: WALL, surface: 'gilded' });
  b.mark('row');
  b.arc(18, 90).straight(50).arc(18, -90).straight(30).arc(18, 90).straight(20);
  b.section('The Undercity', { halfWidth: 9, wallHeight: WALL, surface: 'regolith' });
  b.mark('under');
  b.straight(130);
  b.mark('underEnd');
  b.straight(10);

  b.section('Red Dust Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'regolith' });
  b.mark('leap');
  b.arc(36, 90).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30);
  b.elevate(0).straight(20);

  b.section('Crater Rim', { halfWidth: 9.5, surface: 'gilded' });
  b.mark('rim');
  b.straight(5);
  b.mark('tubeFrom');
  b.arc(RIM_R, RIM_TURN).arc(RIM_R, -2 * RIM_TURN).arc(RIM_R, RIM_TURN);
  b.mark('tubeTo');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'gilded' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the tower and down the descent, the undercity.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('penthouse', 20), m('spiral', -5), (u) => 2.5 * Math.sin(Math.PI * u) ** 2);
  b.profile(m('spiral'), m('spiralTop'), (u) => SPIRAL_TOP * u);
  b.profile(m('spiralTop'), m('drop', 25), () => SPIRAL_TOP, 10);
  plunge(b, m('drop', 25), SPIRAL_TOP, m('drop', 95), 0);
  ease(b, m('under', 5), 0, m('under', 40), -UNDER_DEPTH);
  ease(b, m('under', 90), -UNDER_DEPTH, m('underEnd', 10), 0);
  b.profile(m('tubeTo', 40), m('finish', -10), (u) => 3 * Math.sin(Math.PI * u) ** 2);

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
      { s: at('drop', 100), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leap', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['penthouse', 'spiral', 'drop', 'row', 'under', 'leap', 'rim'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'domeGate', ribbon: -1, s: 6 },
      { kind: 'domeGate', ribbon: -1, s: at('row', -2) },
      { kind: 'richDome', ribbon: -1, s: at('drop', 60), lateral: -120 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('esses', 10), count: 4 },
      { s: at('drop', 105), count: 3 },
      { s: at('under', 50), count: 3 },
      { s: at('rim', 45), count: 4 },
      { s: tube.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'airlocks', at: [at('row', 50), at('row', 135)], period: 4.4 },
      { kind: 'airlocks', at: [at('under', 30), at('under', 70), at('under', 110)], period: 5 },
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
 * The Service Tube: the workers' glass tube straight over the crater the
 * Crater Rim swings round. No rails. On lap 1 it is sealed off and there is
 * nothing to drive on; from lap 2 the night shift opens it.
 */
function buildServiceTube(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Service Tube', { halfWidth: 6, surface: 'regolith' });
  b.straight(30);
  b.section('The Tube', { halfWidth: 4.5, surface: 'neon' });
  b.elevate(0).straight(12).elevate(1);
  const crater = chord - 2 * b.s;
  const boxes = b.s + crater / 2;
  b.bridge(crater, 7);
  b.elevate(1).straight(12).elevate(0);
  b.section('Service Tube', { halfWidth: 6, surface: 'regolith' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Service Tube', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2, 'final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
