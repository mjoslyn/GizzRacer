import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const DEG = Math.PI / 180;
/**
 * The lap is the planet and its ring seen from above: the planet a circle
 * of this radius, the ring an ellipse round it this long and this wide,
 * crossing it four times (m).
 */
const PLANET_R = 165;
const RING_A = 330;
const RING_B = 115;
/** Where the ring crosses the planet, north-east of its middle: the angle round the planet, and round the ring. */
const MEET_Z = Math.sqrt((1 - (PLANET_R / RING_A) ** 2) / (1 / RING_B ** 2 - 1 / RING_A ** 2));
const MEET_PLANET = Math.asin(MEET_Z / PLANET_R) / DEG;
const MEET_RING = Math.asin(MEET_Z / RING_B) / DEG;
/** At the north-east crossing the lap swaps from the ring onto the planet and back, the two roads kept this far either side of it. */
const SWAP = 25;
/** A point on the planet's circle, `deg` round it anticlockwise from the east, heading round it. */
function planet(deg: number): Pose {
  const t = deg * DEG;
  return { x: PLANET_R * Math.cos(t), z: PLANET_R * Math.sin(t), h: Math.atan2(-Math.sin(t), Math.cos(t)) };
}
/** A point on the ring, at angle `deg` of its ellipse, heading round it the same way. */
function ring(deg: number): Pose {
  const t = deg * DEG;
  return { x: RING_A * Math.cos(t), z: RING_B * Math.sin(t), h: Math.atan2(-RING_A * Math.sin(t), RING_B * Math.cos(t)) };
}
/** Where the lap swaps over at the north-east crossing: outside the planet (`side` 1) or inside it (-1). */
function swap(side: number): Pose {
  const p = planet(MEET_PLANET);
  const q = ring(MEET_RING);
  const u = { x: Math.cos(MEET_PLANET * DEG), z: Math.sin(MEET_PLANET * DEG) };
  return { x: p.x + side * SWAP * u.x, z: p.z + side * SWAP * u.z, h: Math.atan2(Math.sin(p.h) + Math.sin(q.h), Math.cos(p.h) + Math.cos(q.h)) };
}
const START: Pose = ring(256);
const FINISH = 45;
/** The Habitable Zone: the road swings out round a lagoon in three arcs of this radius and turn. */
const LAGOON_R = 34;
const LAGOON_TURN = 76;
/** The Ocean Ridge's deck, over the ring road twice. */
const RIDGE = 18;
/** Where the Freefall lands, well below the ridge it left. */
const LANDING = 8;
/** The Orbital Ring's deck, over the planet road. */
const ORBIT = 10;
/** How deep the Trench sinks below the sea floor. */
const TRENCH_DEPTH = 6;
/** Gravity in the Weightless Shallows, as a share of the usual. */
export const SHALLOWS_GRAVITY = 0.45;

/**
 * Kepler-22b (the Omnium Gatherum Cup's second): an ocean world in the
 * habitable zone, after the song. The lap is a ringed planet seen from
 * above, like the one in its sky: the planet a circle and its ring a long
 * ellipse round it, tilted, so that the ring road passes over the planet
 * road on one side and under it on the other, four crossings, one of them
 * where the lap swaps from the ring onto the planet and back. From
 * Splashdown along the ring's near side into the Weightless Shallows, where
 * gravity is under half and the two kickers throw you floating over the
 * water, under the Ocean Ridge and round the ring's east end down in the
 * Trench, geysers going off; onto the planet at the swap, round its north
 * side in the Habitable Zone, swinging out round a lagoon that the
 * Membrane, a narrow causeway, cuts straight across from the second lap;
 * under the Orbital Ring and up onto the Ocean Ridge, 18 m up on a deck
 * over the ring road twice, geysers on it, and the Freefall off its end,
 * 10 m down. Back off the planet at the swap and up the Orbital Ring over
 * the planet road, round the ring's west end and over the rail-less Reef
 * Bridge, home.
 */
export function buildKepler22b(): TrackDef {
  const b = new TrackBuilder(START, 'Splashdown', { halfWidth: 12, surface: 'reef' });
  b.scale = K;
  /** Follows `f` (the planet or the ring) from angle `from` to `to`, a waypoint every `step` degrees. */
  const round = (f: (deg: number) => Pose, from: number, to: number, step = 15) => {
    const n = Math.max(1, Math.round(Math.abs(to - from) / step));
    for (let k = 1; k <= n; k++) b.hermiteTo(f(from + ((to - from) * k) / n));
  };
  b.straight(15);

  // Swinging in off the ring round a lagoon in the planet's middle: the Membrane runs straight on.
  b.section('Habitable Zone', { halfWidth: 9.5, surface: 'reef' });
  b.mark('zone');
  b.straight(5);
  b.mark('memFrom');
  b.arc(LAGOON_R, -LAGOON_TURN).arc(LAGOON_R, 2 * LAGOON_TURN).arc(LAGOON_R, -LAGOON_TURN);
  b.mark('memTo');
  b.hermiteTo(ring(305));

  // Round the ring's east end, sunk in the trench.
  b.section('Trench', { halfWidth: 9, wallHeight: 1.2, surface: 'reef' });
  b.mark('trench');
  round(ring, 305, 390);
  b.mark('trenchEnd');
  round(ring, 390, 405);

  // Onto the planet at the swap, and round its north side, floating off the kickers.
  b.section('Weightless Shallows', { halfWidth: 10, surface: 'reef', gravity: SHALLOWS_GRAVITY });
  b.hermiteTo(swap(1));
  b.hermiteTo(planet(MEET_PLANET + 20));
  b.mark('shallows');
  round(planet, MEET_PLANET + 20, 70);
  b.mark('kick1').kicker();
  round(planet, 75, 88);
  b.mark('kick2').kicker();
  round(planet, 93, 125);

  // Up onto the ridge, over the ring road and over it again.
  b.section('Ocean Ridge', { halfWidth: 10, wallHeight: 1.2, surface: 'reef', bridge: true });
  b.mark('ridge');
  round(planet, 125, 345);
  b.mark('lip');
  b.straight(5);
  b.rise(18, RIDGE + 3);
  b.gap(14, 30, 'water');
  b.section('Freefall', { halfWidth: 10, surface: 'sand' });
  b.mark('landing');
  b.elevate(LANDING).straight(20);
  round(planet, 370, 360 + MEET_PLANET - 25);

  // Off the planet at the swap, and up over the planet road on the ring.
  b.section('Orbital Ring', { halfWidth: 9, wallHeight: 1.2, surface: 'boards', bridge: true });
  b.mark('ring');
  b.hermiteTo(swap(-1));
  b.hermiteTo(ring(MEET_RING + 20));
  round(ring, MEET_RING + 20, 150);
  b.mark('ringEnd');
  round(ring, 150, 210);

  b.section('Reef Bridge', { halfWidth: 8, surface: 'boards' });
  b.mark('reef');
  b.elevate(0).straight(10).elevate(1.5);
  b.bridge(45, 30, 'water');
  b.elevate(1.5).straight(10).elevate(0);
  b.section('Finish Straight', { halfWidth: 12, surface: 'reef' });
  b.mark('finish');
  b.hermiteTo(offsetPose(START, -FINISH * K));
  b.straight(FINISH);

  // Heights, over the layout: the trench, the climb onto the ridge and the freefall, the orbital ring and down off it.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  ease(b, m('trench', 30), 0, m('trench', 80), -TRENCH_DEPTH);
  ease(b, m('trenchEnd', -40), -TRENCH_DEPTH, m('trenchEnd'), 4);
  plunge(b, m('trenchEnd'), 4, m('trenchEnd', 25), 0);
  ease(b, m('ridge', 40), 0, m('ridge', 230), RIDGE);
  b.profile(m('ridge', 230), m('lip'), () => RIDGE, 10);
  ease(b, m('landing', 20), LANDING, m('ring', 30), 2);
  ease(b, m('ring', 30), 2, m('ring', 160), ORBIT);
  b.profile(m('ring', 160), m('ringEnd'), () => ORBIT, 10);
  plunge(b, m('ringEnd'), ORBIT, m('reef', -10), 0);

  const main = b.finish(true);
  const mem = buildMembrane(b.marks.memFrom, b.marks.memTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'kepler-22b',
    name: 'Kepler-22b',
    main,
    branches: [mem.branch],
    pits: [...b.pits, ...mem.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('ridge', 220), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('trench', 60), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['trench', 'shallows', 'ridge', 'landing', 'ring', 'reef'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'keplerArch', ribbon: -1, s: 6 },
      { kind: 'keplerArch', ribbon: -1, s: at('ridge', 4) },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('shallows', 20), count: 4 },
      { s: at('ridge', 240), count: 3 },
      { s: at('landing', 25), count: 3 },
      { s: at('zone', 30), count: 4 },
      { s: mem.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'geysers', at: [at('ridge', 230), at('ridge', 260)], period: 4.5 },
      { kind: 'geysers', at: [at('trench', 40), at('trench', 90), at('trench', 140)], period: 5 },
    ],
    theme: 'kepler',
    music: { lap: 'kepler-22b', finalLap: 'kepler-22b-final-lap' },
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
 * The Membrane: a narrow living causeway straight across the lagoon the
 * Habitable Zone swings round.
 */
function buildMembrane(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Membrane', { halfWidth: 6, surface: 'reef' });
  b.straight(30);
  b.section('Membrane Causeway', { halfWidth: 4, surface: 'boards' });
  b.elevate(0).straight(12).elevate(1);
  const lagoon = chord - 2 * b.s;
  const boxes = b.s + lagoon / 2;
  b.bridge(lagoon, 7, 'water');
  b.elevate(1).straight(12).elevate(0);
  b.section('Membrane', { halfWidth: 6, surface: 'reef' });
  b.straight(chord - b.s);
  const branch: BranchDef = {
    name: 'Membrane', mainFrom: from.s, mainTo: to.s, ...b.finish(false),
  };
  return { branch, pits: b.pits, boxes };
}
