import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: -110 * K, z: -150 * K, h: Math.PI / 2 };
const FINISH = 45;
/** The Perihelion Bend: the road swings out round a sunspot in three arcs of this radius and turn. */
const BEND_R = 34;
const BEND_TURN = 70;
/** The Slingshot Orbit's radius, and the top of it. */
const ORBIT_R = 26;
const ORBIT_TOP = 15;
/** How deep the Coronal Rift is sunk. */
const RIFT_DEPTH = 6;
/** The heat shields walling the corridor. */
const SHIELDS = 5;

/**
 * Perihelion (the Infest the Rats' Nest Cup's third), after the song: a ship
 * falling at the sun, through its corona, the flares arcing over it. Down
 * Reentry Straight (two kickers) under the ship's ribs, through the Gravity
 * Well, a full turn up the Slingshot Orbit, over its own start, and the
 * Freefall off the top. Right angles through the Heat Shield Corridor
 * between shields 5 m tall, the Coronal Rift sunk 6 m, solar flares
 * boiling across the road and arching high over it in both; the
 * Prominence Leap over plasma, and the Perihelion Bend round a sunspot,
 * which the Sunspot Crossing cuts straight across on lap 2, the ship's
 * closest pass.
 */
export function buildPerihelion(): TrackDef {
  const b = new TrackBuilder(START, 'Reentry Straight', { halfWidth: 11, surface: 'heatshield' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(70);

  b.section('Gravity Well', { halfWidth: 10, wallHeight: 1.2, surface: 'heatshield' });
  b.mark('well');
  b.arc(42, -90).straight(10).arc(28, 60).arc(28, -60).straight(20);

  // A full orbit up and over the road it started on.
  b.section('Slingshot Orbit', { halfWidth: 9.5, wallHeight: 1.2, surface: 'heatshield', bridge: true });
  b.mark('orbit');
  b.arc(ORBIT_R, -360);
  b.mark('orbitTop');
  b.section('Freefall', { halfWidth: 10, surface: 'heatshield' });
  b.mark('fall');
  b.straight(130);

  b.section('Heat Shield Corridor', { halfWidth: 9, wallHeight: SHIELDS, surface: 'heatshield' });
  b.mark('corridor');
  b.arc(16, -90).straight(30).arc(16, 90).straight(30).arc(16, -90).straight(20);
  b.section('Coronal Rift', { halfWidth: 9, wallHeight: SHIELDS, surface: 'heatshield' });
  b.mark('rift');
  b.straight(140);
  b.mark('riftEnd');
  b.straight(10);

  b.section('Prominence Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'heatshield' });
  b.mark('leap');
  b.arc(36, -90).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'lava');
  b.elevate(0).straight(20);

  b.section('Perihelion Bend', { halfWidth: 9.5, surface: 'heatshield' });
  b.mark('bend');
  b.straight(5);
  b.mark('spotFrom');
  b.arc(BEND_R, -BEND_TURN).arc(BEND_R, 2 * BEND_TURN).arc(BEND_R, -BEND_TURN);
  b.mark('spotTo');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'heatshield' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the orbit and down the freefall, the rift.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('well', 75), m('orbit', -5), (u) => 2 * Math.sin(Math.PI * u) ** 2);
  b.profile(m('orbit'), m('orbitTop'), (u) => ORBIT_TOP * u);
  b.profile(m('orbitTop'), m('fall', 30), () => ORBIT_TOP, 10);
  plunge(b, m('fall', 30), ORBIT_TOP, m('fall', 100), 0);
  ease(b, m('rift', 5), 0, m('rift', 40), -RIFT_DEPTH);
  ease(b, m('rift', 100), -RIFT_DEPTH, m('riftEnd', 10), 0);
  b.profile(m('spotTo', 40), m('finish', -10), (u) => 3 * Math.sin(Math.PI * u) ** 2);

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
      { s: at('fall', 110), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leap', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['well', 'orbit', 'fall', 'corridor', 'rift', 'leap', 'bend'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'shipGate', ribbon: -1, s: 6 },
      { kind: 'shipGate', ribbon: -1, s: at('corridor', -2) },
      { kind: 'theSun', ribbon: -1, s: at('fall', 60), lateral: 700 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('well', 20), count: 4 },
      { s: at('fall', 115), count: 3 },
      { s: at('rift', 50), count: 3 },
      { s: at('bend', 45), count: 4 },
      { s: spot.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'flares', at: [at('corridor', 40), at('corridor', 105)], period: 4.6 },
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
 * The Sunspot Crossing: a span of cooled plasma straight over the sunspot
 * the Perihelion Bend swings round. No rails. It holds only on lap 2, the
 * ship's closest pass; on the other laps there is nothing there.
 */
function buildSunspotCrossing(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Sunspot Crossing', { halfWidth: 6, surface: 'heatshield' });
  b.straight(30);
  b.section('The Umbra', { halfWidth: 4.5, surface: 'brimstone' });
  b.elevate(0).straight(12).elevate(1);
  const umbra = chord - 2 * b.s;
  const boxes = b.s + umbra / 2;
  b.bridge(umbra, 7, 'lava');
  b.elevate(1).straight(12).elevate(0);
  b.section('Sunspot Crossing', { halfWidth: 6, surface: 'heatshield' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Sunspot Crossing', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
