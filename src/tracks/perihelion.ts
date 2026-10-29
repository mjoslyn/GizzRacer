import { TrackBuilder, dubins, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.0;
/**
 * The comet, from a curve that crosses itself twice (x = sin t, z = cos 3t:
 * three lobes in a row, each turned the other way round from the last),
 * stretched along its length by `along` and widened by `wide` so the right
 * lobe is the head, round, and the left one the tail, narrow, and laid
 * across the map tilted by TILT. The lap runs t from 0 to 2 pi: along the
 * top of the comet's middle toward the head, in through the neck (t = pi/6),
 * round the head, back out through the neck (5 pi/6) and along the bottom of
 * the middle on the Solar Wind, through the twist in the tail (7 pi/6), round
 * the tail and back through the twist (11 pi/6).
 */
const along = (x: number) => 340 * x + 40 * x * x * x - 50 * x * x + 12.5;
const dAlong = (x: number) => 340 + 120 * x * x - 100 * x;
const wide = (x: number) => 85 + 35 * x;
const dWide = 35;
const TILT = (-25 * Math.PI) / 180;
/** Lays a pose on the comet (x along it toward the head) onto the map. */
function tilt(px: number, pz: number, h: number): Pose {
  const c = Math.cos(TILT);
  const s = Math.sin(TILT);
  return { x: (px * c + pz * s) * K, z: (-px * s + pz * c) * K, h: h + TILT };
}
/** The comet at `t`, heading along the lap. */
function comet(t: number): Pose {
  const x = Math.sin(t);
  const z = Math.cos(3 * t);
  const dx = dAlong(x) * Math.cos(t);
  const dz = -3 * Math.sin(3 * t) * wide(x) + z * dWide * Math.cos(t);
  return tilt(along(x), z * wide(x), Math.atan2(dx, dz));
}
/** The head is round instead: a circle of this radius this far past the neck, the lap running anticlockwise round it. */
const HEAD_R = 105;
const HEAD_D = 160;
/** The head at bearing `b` (degrees clockwise from the comet's north) from its centre. */
function head(b: number): Pose {
  const a = (b * Math.PI) / 180;
  return tilt(along(0.5) + HEAD_D + HEAD_R * Math.sin(a), HEAD_R * Math.cos(a), a - Math.PI / 2);
}
const STEP = Math.PI / 12;
/** The neck of the head and the twist in the tail, where the road crosses itself. */
const NECK = 2;
const TWIST = 14;
const START: Pose = comet(0);
const FINISH = 45;
/** The Slingshot Orbit's radius, and the top of it. */
const ORBIT_R = 24;
const ORBIT_TOP = 15;
/** The Solar Wind: the viaduct from the neck to the twist, this high over it. */
const WIND = 10;
/** How deep the Coronal Rift is sunk. */
const RIFT_DEPTH = 6;
/** The heat shields walling the corridor, and its corners. */
const SHIELDS = 5;
const SHIELD_R = 14;

/**
 * Perihelion (the Infest the Rats' Nest Cup's third), after the song: a ship
 * falling at the sun, through its corona, the flares arcing over it. The lap
 * is a comet, laid across the map with its round head at the top right,
 * toward the sun past the edge of the world, and its tail streaming away to
 * the bottom left: the orbit falls in, whips round the sun and is flung back
 * out, crossing itself at the head's neck, and the tail is twisted once by
 * the solar wind, crossing itself again. Down Reentry Straight (two
 * kickers) under the ship's ribs, into the Gravity Well and in through the
 * neck, round the head on the Perihelion Bend, the ship's closest pass (the
 * Sunspot Crossing cuts straight across the head inside it on lap 2), the
 * Slingshot Orbit, a full turn out round the top of the head to 15 m and
 * over its own start, and back out through the neck over the Gravity Well
 * on the Solar Wind, a viaduct 10 m up all the way to the twist in the
 * tail; the Freefall off its end. Out along the tail through the Heat
 * Shield Corridor between shields 5 m tall, which steps out at two right
 * angles, the Prominence Leap over plasma and round the tail's tip,
 * Aphelion, as far from the sun as the ship gets; then the Coronal Rift
 * sunk 6 m, back under the Solar Wind at the twist, solar flares boiling
 * across the road and arching high over it in both the corridor and the
 * rift, and up out of it to the line.
 */
export function buildPerihelion(): TrackDef {
  const b = new TrackBuilder(START, 'Reentry Straight', { halfWidth: 11, surface: 'heatshield' });
  b.scale = K;
  const to = (k: number) => b.hermiteTo(comet(k * STEP));
  b.straight(30).mark('kick1').kicker().straight(20).mark('kick2').kicker().straight(5);

  // In through the neck and round the head, the sun inside it.
  b.section('Gravity Well', { halfWidth: 10, wallHeight: 1.2, surface: 'heatshield' });
  b.mark('well');
  to(NECK).mark('neck');
  b.hermiteTo(head(225));
  b.section('Perihelion Bend', { halfWidth: 9.5, surface: 'heatshield' });
  b.mark('bend');
  b.arc(HEAD_R, -15);
  b.mark('spotFrom');
  b.arc(HEAD_R, -115);
  b.mark('closest');
  b.arc(HEAD_R, -55);
  b.mark('spotTo');
  b.arc(HEAD_R, -40);
  // A full orbit out round the top of the head, up and over the road it started on.
  b.section('Slingshot Orbit', { halfWidth: 9.5, wallHeight: 1.2, surface: 'heatshield', bridge: true });
  b.mark('orbit');
  b.arc(ORBIT_R, 360);
  b.mark('orbitTop');
  b.arc(HEAD_R, -45);
  b.section('Solar Wind', { halfWidth: 10, wallHeight: 1.2, surface: 'heatshield', bridge: true });
  b.mark('wind');
  to(10).mark('neck2');
  to(11);
  to(12);
  to(13);
  to(TWIST).mark('twist');
  b.mark('windEnd');

  // Off the end of the viaduct and out along the tail.
  b.section('Freefall', { halfWidth: 10, surface: 'heatshield' });
  b.mark('fall');
  to(15);
  b.section('Heat Shield Corridor', { halfWidth: 9, wallHeight: SHIELDS, surface: 'heatshield' });
  b.mark('corridor');
  b.straight(10).arc(SHIELD_R, 90).straight(20).arc(SHIELD_R, -90).straight(20);
  b.mark('corridorEnd');
  to(16);
  b.section('Prominence Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'heatshield' });
  b.mark('leap');
  b.straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'lava');
  b.elevate(0).straight(20);
  b.section('Aphelion', { halfWidth: 9.5, surface: 'heatshield' });
  b.mark('aphelion');
  to(18);
  to(19);
  to(20);
  // Back in through the twist, sunk under the Solar Wind.
  b.section('Coronal Rift', { halfWidth: 9, wallHeight: SHIELDS, surface: 'heatshield' });
  b.mark('rift');
  to(21);
  to(22);
  b.straight(40);
  b.mark('riftEnd');
  b.section('Finish Straight', { halfWidth: 11, surface: 'heatshield' });
  b.hermiteTo(offsetPose(START, -FINISH * K));
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the orbit, along the viaduct and down the freefall, the rift.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  ease(b, m('orbit', -40), 0, m('orbit'), 2);
  b.profile(m('orbit'), m('orbitTop'), (u) => 2 + (ORBIT_TOP - 2) * u);
  b.profile(m('orbitTop'), m('neck2', 30), () => ORBIT_TOP, 10);
  ease(b, m('neck2', 30), ORBIT_TOP, m('neck2', 120), WIND);
  b.profile(m('neck2', 120), m('windEnd', 20), () => WIND, 10);
  plunge(b, m('windEnd', 20), WIND, m('fall', 80), 0);
  ease(b, m('rift', 5), 0, m('rift', 35), -RIFT_DEPTH);
  ease(b, m('riftEnd', -25), -RIFT_DEPTH, m('riftEnd'), 0);

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
      { s: at('corridorEnd', 5), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('ramp', -9), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['well', 'bend', 'orbit', 'wind', 'fall', 'corridor', 'leap', 'aphelion', 'rift'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'shipGate', ribbon: -1, s: 6 },
      { kind: 'shipGate', ribbon: -1, s: at('corridor', -2) },
      { kind: 'theSun', ribbon: -1, s: at('closest', 0), lateral: -700 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('neck', 40), count: 4 },
      { s: at('wind', 60), count: 3 },
      { s: at('rift', 50), count: 3 },
      { s: at('aphelion', 30), count: 4 },
      { s: spot.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'flares', at: [at('corridor', 15), at('corridor', 60)], period: 4.6 },
      { kind: 'flares', at: [at('rift', 30), at('rift', 95)], period: 5.2 },
    ],
    theme: 'solar',
    music: { lap: 'perihelion', finalLap: 'perihelion-final-lap' },
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
 * The Sunspot Crossing: a span of cooled plasma straight across the
 * comet's head, over the sunspot inside the Perihelion Bend. No rails. It
 * holds only on lap 2, the ship's closest pass; on the other laps there is
 * nothing there.
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
