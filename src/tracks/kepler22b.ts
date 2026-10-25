import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
/** The ring's sweep: the lap is one great near-circle, every bend of it outside its features an arc of this radius. */
const RING_R = 180;
const START: Pose = { x: -50 * K, z: 180 * K, h: Math.PI / 2 };
const FINISH = 45;
/** The last bend home, closing the ring. */
const CLOSE_R = 145;
/** The Habitable Zone: the ring bulges out round a lagoon in three arcs of this radius and turn. */
const LAGOON_R = 34;
const LAGOON_TURN = 70;
/**
 * The Orbital Ring climbs round a loop of this radius tucked inside the big
 * ring, this many degrees short of a full circle, so it leaves across the
 * road it came in on (and over it).
 */
const LOOP_R = 28;
const LOOP_SHORT = 30;
/** The Orbital Ring's deck climbs from this height to the ridge's. */
const RING_FROM = 2;
const RIDGE = 18;
/** Where the Freefall lands, well below the ridge it left. */
const LANDING = 8;
/** How deep the Trench sinks below the sea floor. */
const TRENCH_DEPTH = 6;
/** Gravity in the Weightless Shallows, as a share of the usual. */
export const SHALLOWS_GRAVITY = 0.45;

/**
 * Kepler-22b (the Omnium Gatherum Cup's second): an ocean world in the
 * habitable zone, after the song. The whole lap is one great ring round the
 * ocean, the roundest road in the game. From Splashdown round into the
 * Weightless Shallows, where gravity is under half and the two kickers throw
 * you floating over the islands, then the Orbital Ring: a little orbit
 * tucked inside the big one, most of a circle on a deck, climbing to cross
 * back over the road it came in on. Along the Ocean Ridge with geysers going
 * off, then the Freefall off the end of it, 10 m down, swinging back onto
 * the ring. A rail-less reef bridge, the road down in the Trench, and the
 * Habitable Zone, where the ring bulges out round a lagoon, which the
 * Membrane, a narrow causeway, cuts straight across from the second lap.
 */
export function buildKepler22b(): TrackDef {
  const b = new TrackBuilder(START, 'Splashdown', { halfWidth: 12, surface: 'reef' });
  b.scale = K;
  b.straight(20).arc(RING_R, 26);

  // Low gravity: float off the kickers.
  b.section('Weightless Shallows', { halfWidth: 10, surface: 'reef', gravity: SHALLOWS_GRAVITY });
  b.mark('shallows');
  b.arc(RING_R, 12).mark('kick1').kicker().arc(RING_R, 10).mark('kick2').kicker().arc(RING_R, 22);

  b.section('Orbital Ring', { halfWidth: 9, wallHeight: 1.2, surface: 'boards', bridge: true });
  b.mark('ring');
  b.arc(RING_R, 30).arc(LOOP_R, 360 - LOOP_SHORT);
  b.mark('ringTop');
  b.section('Ocean Ridge', { halfWidth: 10, surface: 'reef', bridge: true });
  b.mark('ridge');
  b.arc(RING_R, 20);
  b.mark('lip');
  b.rise(18, RIDGE + 3);
  b.gap(14, 30, 'water');
  b.section('Freefall', { halfWidth: 10, surface: 'sand' });
  b.mark('landing');
  b.elevate(LANDING).straight(20);
  b.arc(RING_R / 2, LOOP_SHORT + 25);

  b.section('Reef Bridge', { halfWidth: 8, surface: 'boards' });
  b.mark('reef');
  b.elevate(0).straight(10).elevate(1.5);
  b.bridge(45, 30, 'water');
  b.elevate(1.5).straight(10).elevate(0);
  b.arc(RING_R, 22);

  b.section('Trench', { halfWidth: 9, wallHeight: 1.2, surface: 'reef' });
  b.mark('trench');
  b.arc(RING_R, 40);
  b.mark('trenchEnd');
  b.arc(RING_R, 22);

  b.section('Habitable Zone', { halfWidth: 9.5, surface: 'reef' });
  b.mark('zone');
  b.arc(RING_R, 24).straight(5);
  b.mark('memFrom');
  b.arc(LAGOON_R, -LAGOON_TURN).arc(LAGOON_R, 2 * LAGOON_TURN).arc(LAGOON_R, -LAGOON_TURN);
  b.mark('memTo');
  b.turnTo(offsetPose(START, -FINISH * K), CLOSE_R);
  b.section('Finish Straight', { halfWidth: 12, surface: 'reef' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: swells before the shallows, the climb round the ring, the freefall, the trench.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(30, m('shallows', -20), (u) => 3 * Math.sin(2 * Math.PI * u) ** 2);
  ease(b, m('ring', 5), 0, m('ring', 50), RING_FROM);
  ease(b, m('ring', 50), RING_FROM, m('ringTop'), RIDGE);
  b.profile(m('ringTop'), m('lip'), () => RIDGE, 20);
  ease(b, m('landing', 24), LANDING, m('reef', -4), 0);
  ease(b, m('trench', 8), 0, m('trench', 40), -TRENCH_DEPTH);
  ease(b, m('trench', 40), -TRENCH_DEPTH, m('trenchEnd'), 4);
  plunge(b, m('trenchEnd'), 4, m('trenchEnd', 25), 0);
  b.profile(m('memTo', 40), m('finish', -10), (u) => 4 * Math.sin(Math.PI * u) ** 2);

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
      { s: at('ridge', 20), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('trench', 60), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['shallows', 'ring', 'ridge', 'landing', 'reef', 'trench', 'zone'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'keplerArch', ribbon: -1, s: 6 },
      { kind: 'keplerArch', ribbon: -1, s: at('ridge', 4) },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('shallows', 20), count: 4 },
      { s: at('ridge', 40), count: 3 },
      { s: at('landing', 25), count: 3 },
      { s: at('zone', 45), count: 4 },
      { s: mem.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'geysers', at: [at('ridge', 30), at('ridge', 50)], period: 4.5 },
      { kind: 'geysers', at: [at('trench', 20), at('trench', 55), at('zone', 25)], period: 5 },
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
 * Habitable Zone swings round. It grows shut over the first lap.
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
