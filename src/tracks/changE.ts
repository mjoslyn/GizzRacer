import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.1;
/**
 * The lap is a trefoil knot, three lobes and three crossings, the road
 * rising and falling with it so that at every crossing one road passes over
 * the other: this many builder units to the knot's unit, and its height,
 * up and down.
 */
const R = 88;
const H = 9;
/** A point on the knot at angle `t`, heading along it. */
function knot(t: number): Pose {
  const dx = Math.cos(t) + 4 * Math.cos(2 * t);
  const dz = -Math.sin(t) + 4 * Math.sin(2 * t);
  return { x: (Math.sin(t) + 2 * Math.sin(2 * t)) * R * K, z: (Math.cos(t) - 2 * Math.cos(2 * t)) * R * K, h: Math.atan2(dx, dz) };
}
/** The knot's height at angle `t`: over, under, over, as a knot goes. */
const lift = (t: number) => -H * Math.sin(3 * t);
const STEP = Math.PI / 6;
const START: Pose = knot(0);
const FINISH = 45;
/** Sailing the Moon-Sea swings out round the Sea of Tears in three arcs of this radius and turn; Riding on Moonbeams runs straight across. */
const SEA_R = 40;
const SEA_TURN = 65;
/** Float in the Bright Night: the Moon's gravity, as a share of the usual. */
const MOON_G = 0.6;
/** The Lyre of Lightning's walls. */
const WALL = 6;
/** How far past the leap the road runs level before it dips, so no cut opens beside the gap. */
const AFTER_LEAP = 25;
/** How far the Palace Amongst Stars runs level at the top, over the road below. */
const PALACE_HOLD = 120;
/** The White Rabbit: this many hops, this high, on top of the knot's rise. */
const HOPS = 4;
const HOP = 1.4;

/**
 * Chang'e (the Silver Cord Cup's third), after the song about the goddess
 * of the Moon: ten suns explode in the sky and the sea boils; ride
 * cerebral asteroids, cross the scorching sands, find the portal glowing
 * jade, "in you go, be not afraid"; she sits upon the Moon, her lyre of
 * flesh and bone strung with lightning bolts, 2500 volts; sailing the
 * moon-sea, the sea of tears beneath her feet; on the astral planes they
 * dance; her palace amongst the stars, the white rabbit beside her; float in
 * the bright night; eclipse sun and moon; lonely moon. The world is the
 * Moon: grey dust and craters, her palace on a hill, osmanthus trees in
 * gold flower, red lanterns floating up into a black sky full of stars. The
 * lap is a trefoil knot, the voyage tying itself round the Moon: three
 * lobes, three crossings, and the road rising onto decks and sinking into
 * cuts as it goes, so it passes over and under itself, over, under, over.
 * Ten Suns (two kickers), the Cerebral Asteroids, the Scorching Sands up on
 * a deck, the Jade Portal, Float in the Bright Night (the Moon's gravity, a
 * leap), the Lyre of Lightning sunk between marble walls with its strings
 * across the road, plucked one after another; Sailing the Moon-Sea, up to
 * the Palace Amongst Stars, the Astral Planes, the Eclipse in a cut, the
 * White Rabbit's hops on the high deck, and the Lonely Moon home. Shortcut:
 * Riding on Moonbeams, straight across the Sea of Tears, on the final lap.
 */
export function buildChangE(): TrackDef {
  const b = new TrackBuilder(START, 'Ten Suns', { halfWidth: 11, surface: 'jade' });
  b.scale = K;
  const to = (k: number) => b.hermiteTo(knot(k * STEP));
  const deck = (name: string, o: { halfWidth: number; wallHeight?: number; gravity?: number } = { halfWidth: 10, wallHeight: 1.2 }) =>
    b.section(name, { surface: 'jade', bridge: true, ...o });
  b.straight(25).mark('kick1').kicker().straight(25).mark('kick2').kicker().straight(10);
  b.mark('w0');
  to(1).mark('w1');
  b.section('Cerebral Asteroids', { halfWidth: 10, wallHeight: 1.2, surface: 'jade' });
  to(2).mark('w2');
  deck('Scorching Sands');
  to(3).mark('w3');
  deck('The Jade Portal');
  to(4).mark('w4');
  // Through the portal: the Moon's gravity, and a leap.
  b.section('Float in the Bright Night', { halfWidth: 10, wallHeight: 1.2, surface: 'jade', gravity: MOON_G });
  b.straight(5).mark('ramp').elevate(0).rise(18, 3);
  b.gap(14, 20);
  b.elevate(0).straight(10);
  b.mark('floatEnd');
  to(5).mark('w5');
  // Sunk between marble walls: the strings of the lyre, made of lightning, across the road.
  b.section('Lyre of Lightning', { halfWidth: 9, wallHeight: WALL, surface: 'jade' });
  b.mark('lyre');
  to(6).mark('w6');
  b.section('Sailing the Moon-Sea', { halfWidth: 10.5, surface: 'jade' });
  b.straight(5);
  b.mark('beamFrom');
  b.arc(SEA_R, SEA_TURN).arc(SEA_R, -2 * SEA_TURN).arc(SEA_R, SEA_TURN);
  b.mark('beamTo');
  b.straight(5);
  b.mark('seaEnd');
  to(7).mark('w7');
  deck('Palace Amongst Stars');
  to(8).mark('w8');
  b.section('Astral Planes', { halfWidth: 9.5, wallHeight: 1.2, surface: 'jade' });
  to(9).mark('w9');
  b.section('Eclipse', { halfWidth: 10, wallHeight: 1.2, surface: 'jade' });
  to(10).mark('w10');
  deck('White Rabbit');
  to(11).mark('w11');
  b.section('Lonely Moon', { halfWidth: 11, surface: 'jade' });
  b.hermiteTo(offsetPose(START, -FINISH * K));
  b.section('Finish Straight', { halfWidth: 11, surface: 'jade' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // The knot's rise and fall, each point at its own angle on the knot; the kickers, the leap and the moon-sea's swing level.
  const ends = [m('w0'), m('w1'), m('w2'), m('w3'), m('w4'), m('w5'), m('w6'), m('w7'), m('w8'), m('w9'), m('w10'), m('w11'), m('finish')];
  const tOf = (s: number) => {
    for (let k = 0; k + 1 < ends.length; k++) if (s <= ends[k + 1]) return (k + (s - ends[k]) / (ends[k + 1] - ends[k])) * STEP;
    return 2 * Math.PI;
  };
  /** The knot's height from `from` to `to`, its angles there stretched to run from t0 to t1. */
  const knotted = (from: number, to: number, t0: number, t1: number) => {
    const a = tOf(from);
    const z = tOf(to);
    b.profile(from, to, (u) => lift(t0 + ((tOf(from + (to - from) * u) - a) / (z - a)) * (t1 - t0)));
  };
  knotted(m('kick2', 12), m('w4'), 0, 4 * STEP);
  b.profile(m('floatEnd'), m('floatEnd', AFTER_LEAP), () => 0, 10);
  knotted(m('floatEnd', AFTER_LEAP), m('w6'), 4 * STEP, 6 * STEP);
  knotted(m('seaEnd'), m('w7'), 6 * STEP, 7 * STEP);
  knotted(m('w7'), m('finish'), 7 * STEP, 12 * STEP);
  // The Palace stays up among the stars until it has passed over Ten Suns, then comes down.
  b.profile(m('w7'), m('w7', PALACE_HOLD), () => H, 10);
  b.profile(m('w7', PALACE_HOLD), m('w8'), (u) => H * (1 - u * u * (3 - 2 * u)));
  // The rabbit's hops, on the high deck.
  b.profile(m('w10', 20), m('w11', -20), (u) => lift(tOf(m('w10', 20) + (m('w11', -20) - m('w10', 20)) * u)) + HOP * Math.sin(Math.PI * HOPS * u) ** 2);

  const main = b.finish(true);
  const beam = buildMoonbeams(b.marks.beamFrom, b.marks.beamTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  const strings = Array.from({ length: STRINGS }, (_, k) => at('lyre', STRINGS_FROM + k * STRING_GAP));
  return {
    id: 'chang-e',
    name: "Chang'e",
    main,
    branches: [beam.branch],
    pits: [...b.pits, ...beam.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('w4', -20), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('w9', 20), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10', 'w11'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'jadePortal', ribbon: -1, s: 6 },
      { kind: 'jadePortal', ribbon: -1, s: at('w4', -3) },
      { kind: 'moonPalace', ribbon: -1, s: at('w7', 30), lateral: -330 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('w2', 30), count: 4 },
      { s: at('lyre', 20), count: 3 },
      { s: at('w7', 40), count: 3 },
      { s: at('w9', 40), count: 4 },
      { s: beam.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [{ kind: 'strings', at: strings, period: 4.4 }],
    theme: 'change',
    music: { lap: 'chang-e', finalLap: 'chang-e-final-lap' },
  };
}

/** The Lyre of Lightning's strings: this many, this far apart along the road, from this far in. */
const STRINGS = 5;
const STRING_GAP = 14;
const STRINGS_FROM = 45;

/**
 * Riding on Moonbeams: a beam of moonlight laid straight across the Sea of
 * Tears that Sailing the Moon-Sea swings round, no rails. It shines only on
 * the final lap.
 */
function buildMoonbeams(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Riding on Moonbeams', { halfWidth: 6, surface: 'jade' });
  b.straight(30);
  b.section('Sea of Tears', { halfWidth: 4.5, surface: 'jade' });
  b.elevate(0).straight(12).elevate(1);
  const sea = chord - 2 * b.s;
  const boxes = b.s + sea / 2;
  b.bridge(sea, 7, 'water');
  b.elevate(1).straight(12).elevate(0);
  b.section('Riding on Moonbeams', { halfWidth: 6, surface: 'jade' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Riding on Moonbeams', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: ['final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
