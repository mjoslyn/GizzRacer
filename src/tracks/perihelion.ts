import { TrackBuilder, dubins, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
/**
 * The comet, in builder units: the head's radius and where its centre is,
 * and the tail, its two sides running straight off the head to meet at a
 * point TAIL from the head's centre.
 */
const HEAD_R = 115;
const HEAD_X = 190;
const TAIL = 490;
const TAIL_HALF = Math.asin(HEAD_R / TAIL);
/** The point of the tail, where its two sides would meet. */
const POINT_X = HEAD_X - TAIL;
/** The Heat Shield Corridor's corners, and how far in its step brings the lower side of the tail. */
const SHIELD_R = 14;
const STEP = 2 * SHIELD_R + 4;
/** Aphelion: the hairpin round the tail's point, of this radius, and how far round the point it starts. */
const POINT_R = 24;
const POINT_CUT = POINT_R / Math.tan(TAIL_HALF);
/** Where the lap starts, along the upper side of the tail from where its two sides meet (the step moves that up the tail). */
const START_ALONG = STEP / Math.sin(2 * TAIL_HALF) + POINT_CUT + 10 + 45;
const START: Pose = {
  x: (POINT_X + START_ALONG * Math.cos(TAIL_HALF)) * K,
  z: START_ALONG * Math.sin(TAIL_HALF) * K,
  h: Math.PI / 2 - TAIL_HALF,
};
const FINISH = 45;
/** The Slingshot Orbit's radius, and the top of it. */
const ORBIT_R = 26;
const ORBIT_TOP = 15;
/** How far round the head (degrees) the Gravity Well and the Freefall run; the Perihelion Bend takes the rest. */
const WELL_TURN = 10;
const FALL_TURN = 62;
/** How deep the Coronal Rift is sunk. */
const RIFT_DEPTH = 6;
/** The heat shields walling the corridor. */
const SHIELDS = 5;

/**
 * Perihelion (the Infest the Rats' Nest Cup's third), after the song: a ship
 * falling at the sun, through its corona, the flares arcing over it. The
 * lap is a comet, driven clockwise: a big round head facing the sun and a
 * long tail tapering away to a point. Up Reentry Straight (two kickers)
 * along the top of the tail under the ship's ribs, into the Gravity Well
 * round the head, a full turn inward up the Slingshot Orbit, over its own
 * start, and the Freefall off the top. The Perihelion Bend sweeps round
 * the bottom of the head, the ship's closest pass, and the Sunspot Crossing
 * cuts straight across the head inside it on lap 2. Back down the tail
 * through the Heat Shield Corridor, between shields 5 m tall, which steps
 * the tail in at two right angles, and the Coronal Rift sunk 6 m, solar
 * flares boiling across the road and arching high over it in both; the
 * Prominence Leap over plasma, and round the hairpin at the tail's point,
 * Aphelion, as far from the sun as the ship gets, to the line.
 */
export function buildPerihelion(): TrackDef {
  const b = new TrackBuilder(START, 'Reentry Straight', { halfWidth: 11, surface: 'heatshield' });
  b.scale = K;
  const tail = Math.sqrt(TAIL * TAIL - HEAD_R * HEAD_R);
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(30);
  const reentry = 100 + 14 / K;

  b.section('Gravity Well', { halfWidth: 10, wallHeight: 1.2, surface: 'heatshield' });
  b.mark('well');
  b.straight(tail - START_ALONG - reentry).arc(HEAD_R, WELL_TURN);

  // A full orbit inward round the head, up and over the road it started on.
  b.section('Slingshot Orbit', { halfWidth: 9.5, wallHeight: 1.2, surface: 'heatshield', bridge: true });
  b.mark('orbit');
  b.arc(ORBIT_R, 360);
  b.mark('orbitTop');
  b.section('Freefall', { halfWidth: 10, surface: 'heatshield' });
  b.mark('fall');
  b.arc(HEAD_R, FALL_TURN);

  // Round the bottom of the head, nearest the sun, and off down the tail.
  b.section('Perihelion Bend', { halfWidth: 9.5, surface: 'heatshield' });
  b.mark('bend');
  b.mark('spotFrom');
  b.arc(HEAD_R, 180 + (2 * TAIL_HALF * 180) / Math.PI - WELL_TURN - FALL_TURN).straight(20);
  b.mark('spotTo');
  b.straight(5);

  // Back down the tail: the shields step it in at two right angles.
  b.section('Heat Shield Corridor', { halfWidth: 9, wallHeight: SHIELDS, surface: 'heatshield' });
  b.mark('corridor');
  b.straight(10).arc(SHIELD_R, 90).straight(STEP - 2 * SHIELD_R).arc(SHIELD_R, -90).straight(30);
  b.section('Coronal Rift', { halfWidth: 9, wallHeight: SHIELDS, surface: 'heatshield' });
  b.mark('rift');
  b.straight(120);
  b.mark('riftEnd');
  b.straight(10);

  b.section('Prominence Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'heatshield' });
  b.mark('leap');
  b.straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'lava');
  b.elevate(0).straight(20);

  // Round the point of the tail: how far it is from here to where the two sides meet.
  b.section('Aphelion', { halfWidth: 9.5, surface: 'heatshield' });
  b.mark('aphelion');
  b.straight(alongTo(b.pose, START) / K - POINT_CUT).arc(POINT_R, 180 - (2 * TAIL_HALF * 180) / Math.PI);
  const line = offsetPose(START, -FINISH * K);
  b.straight(((line.x - b.pose.x) * Math.sin(b.pose.h) + (line.z - b.pose.z) * Math.cos(b.pose.h)) / K);
  b.section('Finish Straight', { halfWidth: 11, surface: 'heatshield' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the orbit and down the freefall, the rift.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('well', 100), m('orbit', -5), (u) => 2 * Math.sin(Math.PI * u) ** 2);
  b.profile(m('orbit'), m('orbitTop'), (u) => ORBIT_TOP * u);
  // Held up there until the road is clear of the orbit's foot.
  b.profile(m('orbitTop'), m('fall', 50), () => ORBIT_TOP, 10);
  plunge(b, m('fall', 50), ORBIT_TOP, m('fall', 118), 0);
  ease(b, m('rift', 5), 0, m('rift', 40), -RIFT_DEPTH);
  ease(b, m('rift', 90), -RIFT_DEPTH, m('riftEnd', 10), 0);

  const main = b.finish(true);
  const spot = buildSunspotCrossing(b.marks.spotFrom, b.marks.spotTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'perihelion',
    name: 'Perihelion',
    main,
    branches: [spot.branch],
    pits: [...b.pits, ...spot.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('corridor', 45), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('ramp', -9), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['well', 'orbit', 'fall', 'bend', 'corridor', 'rift', 'leap'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'shipGate', ribbon: -1, s: 6 },
      { kind: 'shipGate', ribbon: -1, s: at('corridor', -2) },
      { kind: 'theSun', ribbon: -1, s: at('bend', 20), lateral: 700 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('well', 20), count: 4 },
      { s: at('fall', 10), count: 3 },
      { s: at('rift', 50), count: 3 },
      { s: at('bend', 45), count: 4 },
      { s: spot.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'flares', at: [at('corridor', 20), at('corridor', 60)], period: 4.6 },
      { kind: 'flares', at: [at('rift', 30), at('rift', 95)], period: 5.2 },
    ],
    theme: 'solar',
    music: { lap: 'perihelion', finalLap: 'perihelion-final-lap' },
  };
}

/** How far along `from`'s heading the line through `to` (along its heading) is crossed. */
function alongTo(from: Pose, to: Pose): number {
  const dx = Math.sin(from.h);
  const dz = Math.cos(from.h);
  const ux = Math.sin(to.h);
  const uz = Math.cos(to.h);
  return ((to.x - from.x) * uz - (to.z - from.z) * ux) / (dx * uz - dz * ux);
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
 * The Sunspot Crossing: a span of cooled plasma straight across the
 * comet's head, over the sunspot inside the Perihelion Bend. No rails. It holds only on lap 2, the ship's closest pass; on the other laps
 * there is nothing there.
 */
function buildSunspotCrossing(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  // Turn in off the bend, straight across the head, and turn onto the tail.
  const r = 30;
  const lead = 6;
  const [first, across] = dubins(offsetPose(from.pose, lead), offsetPose(to.pose, -lead), r);
  const b = new TrackBuilder(from.pose, 'Sunspot Crossing', { halfWidth: 6, surface: 'heatshield' });
  b.straight(lead).arc(r, ((first[0] === 'L' ? 1 : -1) * first[1] * 180) / (Math.PI * r));
  const s0 = b.s;
  b.straight(8);
  b.section('The Umbra', { halfWidth: 4.5, surface: 'brimstone' });
  b.elevate(0).straight(12).elevate(1);
  const umbra = across[1] - 2 * (b.s - s0);
  const boxes = b.s + umbra / 2;
  b.bridge(umbra, 7, 'lava');
  b.elevate(1).straight(12).elevate(0);
  b.section('Sunspot Crossing', { halfWidth: 6, surface: 'heatshield' });
  b.turnTo(offsetPose(to.pose, -lead), r).straight(lead);
  const branch: BranchDef = { name: 'Sunspot Crossing', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
