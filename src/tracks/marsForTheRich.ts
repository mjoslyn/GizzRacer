import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.0;
/**
 * The colony's streets wind in a spiral, clockwise and inward, round the
 * tower at its heart: the centre, and the spiral's radius from its start
 * (bearing FROM, degrees clockwise from north) to its inner end TURN
 * degrees further round.
 */
const C = { x: 20, z: 60 };
const R0 = 250;
const R1 = 95;
const FROM = 180;
const TURN = 450;
/** A point on the spiral at bearing `deg` (FROM to FROM + TURN), heading along it. */
function wind(deg: number): Pose {
  const a = (deg * Math.PI) / 180;
  const r = R0 - ((R0 - R1) * (deg - FROM)) / TURN;
  const dr = -((R0 - R1) * 180) / (TURN * Math.PI);
  const dx = dr * Math.sin(a) + r * Math.cos(a);
  const dz = dr * Math.cos(a) - r * Math.sin(a);
  return { x: (C.x + r * Math.sin(a)) * K, z: (C.z + r * Math.cos(a)) * K, h: Math.atan2(dx, dz) };
}
/** The Golden Descent flies straight out from the tower on this bearing, over the streets. */
const OUT = (225 * Math.PI) / 180;
const START: Pose = wind(FROM);
const FINISH = 45;
/** The Crater Rim swings out round a crater in three arcs of this radius and turn; the Service Tube runs straight across. */
const RIM_R = 45;
const RIM_TURN = 70;
/** The Tower Spiral's radius, and the top of it. */
const SPIRAL_R = 19;
const SPIRAL_TOP = 15;
/** How high the sky bridge carries the Golden Descent over the streets. */
const SKY = 12;
/** How deep the Undercity is sunk: the poor are kept below. */
const UNDER_DEPTH = 7;
/** The dome's glass walls along Airlock Row, and its corners. */
const WALL = 6;
const ROW_R = 20;

/**
 * Mars for the Rich (the Infest the Rats' Nest Cup's second), after the
 * song: the rich have gone to Mars, to a gleaming colony under glass, and
 * the poor are kept below to work it. The lap is the colony, its streets
 * winding in a spiral, clockwise and inward, one and a quarter times round
 * the tower at its heart, and the rich's own road flying straight back out
 * over them all. Along Champagne Boulevard (two kickers) under a gilded
 * airlock gate, a right angle in and out through Airlock Row between walls
 * of glass 6 m tall, and down into the Undercity, sunk 7 m in the red dust
 * where the poor are kept, the colony's airlock doors sliding shut across
 * both; up the Dome Esses past the great dome, and the Crater Rim swinging
 * out round a crater, which the Service Tube cuts straight across once the
 * night shift opens it, from lap 2. The Penthouse Bend round the inner
 * street and into the middle, a full turn up the Tower Spiral to 15 m, over
 * its own foot, and the Golden Descent off the top: a sky bridge straight
 * out over the Penthouse Bend and over the Undercity, the rich driving 19 m
 * over the poor, and a plunge off its end onto the dust. The Red Dust Leap,
 * and round past the Landing Pads to the line.
 */
export function buildMarsForTheRich(): TrackDef {
  const b = new TrackBuilder(START, 'Champagne Boulevard', { halfWidth: 11, surface: 'gilded' });
  b.scale = K;
  const to = (deg: number) => b.hermiteTo(wind(deg));
  b.straight(40).mark('kick1').kicker().straight(25).mark('kick2').kicker().straight(10);

  b.section('Airlock Row', { halfWidth: 9, wallHeight: WALL, surface: 'gilded' });
  b.mark('row');
  // Spiralling in, clockwise: a right angle in and out between the glass, and down into the Undercity.
  b.arc(ROW_R, 90).straight(40).arc(ROW_R, -90);
  b.section('The Undercity', { halfWidth: 9, wallHeight: WALL, surface: 'regolith' });
  b.mark('under');
  to(215);
  to(240);
  to(270);
  b.mark('underEnd');
  b.section('Dome Esses', { halfWidth: 9.5, wallHeight: 1.2, surface: 'gilded' });
  b.mark('esses');
  to(290);
  b.arc(30, -25).arc(30, 50).arc(30, -25);
  to(330);
  b.arc(30, -25).arc(30, 50).arc(30, -25);
  to(370);
  b.section('Crater Rim', { halfWidth: 10, surface: 'gilded' });
  b.mark('rim');
  to(390);
  b.mark('tubeFrom');
  b.arc(RIM_R, -RIM_TURN).arc(RIM_R, 2 * RIM_TURN).arc(RIM_R, -RIM_TURN);
  b.mark('tubeTo');
  to(470);
  b.section('Penthouse Bend', { halfWidth: 10, wallHeight: 1.2, surface: 'gilded' });
  b.mark('penthouse');
  to(500);
  to(530);
  to(560);
  to(590);
  to(610);
  // Round into the middle, to the foot of the tower.
  b.turnTo({ x: C.x * K, z: C.z * K, h: OUT }, 35);
  b.section('Tower Spiral', { halfWidth: 9.5, wallHeight: 1.2, surface: 'gilded', bridge: true });
  b.mark('spiral');
  b.arc(SPIRAL_R, 360);
  b.mark('spiralTop');
  // Off the top on a sky bridge straight out over the streets, the Penthouse Bend and the Undercity, and down onto the dust.
  b.section('Golden Descent', { halfWidth: 10, wallHeight: 1.2, surface: 'gilded', bridge: true });
  b.mark('drop');
  b.straight(310);
  b.mark('skyEnd');
  b.section('Red Dust Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'regolith' });
  b.mark('leap');
  b.arc(60, -135).straight(40);
  b.straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30);
  b.elevate(0).straight(20);
  // Round past the landing pads and back in under the gate.
  b.section('Landing Pads', { halfWidth: 10, wallHeight: 1.2, surface: 'gilded' });
  b.mark('pads');
  b.turnTo(offsetPose(START, -FINISH * K), 40);
  b.section('Finish Straight', { halfWidth: 11, surface: 'gilded' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: the Undercity sunk, up the tower and held up there across the sky bridge, and the plunge off its end.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  ease(b, m('under', 5), 0, m('under', 40), -UNDER_DEPTH);
  b.profile(m('under', 40), m('underEnd', -40), () => -UNDER_DEPTH, 10);
  ease(b, m('underEnd', -40), -UNDER_DEPTH, m('underEnd'), 0);
  ease(b, m('spiral', -40), 0, m('spiral'), 2);
  b.profile(m('spiral'), m('spiralTop'), (u) => 2 + (SPIRAL_TOP - 2) * u);
  b.profile(m('spiralTop'), m('drop', 130), () => SPIRAL_TOP, 10);
  ease(b, m('drop', 130), SPIRAL_TOP, m('drop', 220), SKY);
  b.profile(m('drop', 220), m('drop', 290), () => SKY, 10);
  plunge(b, m('drop', 290), SKY, m('skyEnd', 30), 0);

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
      { s: at('skyEnd', 5), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('ramp', -9), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['row', 'under', 'esses', 'rim', 'penthouse', 'spiral', 'drop', 'leap', 'pads'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'domeGate', ribbon: -1, s: 6 },
      { kind: 'domeGate', ribbon: -1, s: at('row', -2) },
      { kind: 'richDome', ribbon: -1, s: at('esses', 60), lateral: 150 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('esses', 10), count: 4 },
      { s: at('drop', 60), count: 3 },
      { s: at('under', 120), count: 3 },
      { s: at('rim', 5), count: 4 },
      { s: tube.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'airlocks', at: [at('row', 15), at('row', 80)], period: 4.4 },
      { kind: 'airlocks', at: [at('under', 60), at('under', 100), at('under', 140)], period: 5 },
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
 * The Service Tube: the workers' glass tube straight across the crater the
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
