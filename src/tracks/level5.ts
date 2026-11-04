import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.0;
/** The whole lap is laid this far east of the map's middle, so it sits in the middle of it. */
const SX = 15;
/** A waypoint, in builder units. */
const wp = (x: number, z: number, h: number): Pose => ({ x: (x + SX) * K, z: z * K, h });
const E = Math.PI / 2;
const W = -Math.PI / 2;
const SE = (3 * Math.PI) / 4;
/** The car park stands this far east of the lap's middle. */
export const PARK_X = 40;
/**
 * The car park's helix: two ramps this long, one each side, joined by half
 * turns of this radius, climbing all the way. Each half turn is a level, so
 * one turn up is two, and a level lies 10 m over the one two below it: more
 * than a tier's clearance, at a gentle grade (about one in twenty-four).
 */
export const PARK_LEG = 30;
export const PARK_R = 28;
export const LEVEL = 5;
/** The helix turns round its inside on this side of the road (a lateral to the right is positive). */
const PARK_INSIDE = 1;
/** Level 1 to Level 5: four half turns up, and Level 5 is the roof. */
const TURNS = 4;
export const ROOF = LEVEL * TURNS;
/** Faith Is Blind: up the far side of the crossing to this far north, round a lobe of this radius, and back down to the way in. */
const LOBE_R = 42;
const LOBE_TOP = 130;
/** Mechanic Rise sweeps round and up to the crossing on a turn of this radius. */
const RISE_R = 70;
const START: Pose = wp(-60, -PARK_R, E);
const FINISH = 45;
/** The motorway's tier: Mechanic Rise's deck over the way in. */
const TIER = 8;
/** The Incision: sunk this deep under the car park, and its walls. */
export const DEPTH = 7;
const WALL = 6;
/** The Sky Dematerialised: the climb to this crest. */
const CREST = 10;
/** Faith Is Blind: the main road swings round the dark in three arcs of this radius and turn; the shortcut runs straight through it. */
const BLIND_R = 26;
const BLIND_TURN = 85;
/** The driverless pods' lane changes: one every this many seconds. */
const PODS_PERIOD = 4.4;

/**
 * Level 5 (the Alien Metal Cup's third), after the album's first single,
 * the metal built into the machines that drive us now: "we're on level
 * five autonomy", chanted over and over, the car that drives itself and
 * the driver who has no say; the milk's gone bad, flies dropping on the
 * windscreen, "mortician, don't make me look ugly tonight", a date with
 * the end of the world and out of time; an incision through soft tissue,
 * "so precise", the sulphur risen from the fungicide, the sky
 * dematerialised and the stars fallen flat; rebellion, the machines rising,
 * "imprisoned, we shut our eyes", our faith is blind. The world is a city
 * of driverless cars at the end of the world, its motorway white and blue
 * under a sky coming apart into pixels. The lap is five levels of a
 * multi-storey car park and the motorway out of its roof: past the barrier
 * (two speed bumps for kickers), Level Five Autonomy climbs the car park's
 * helix, a level each half turn, Level 1 to Level 5, each level ten metres
 * over the one two below; The Milk's Gone Bad runs out over the roof and
 * Flies on the Windscreen drops off its edge, sweeping down to the ground;
 * the Mortician's hook, the Date with the End of the World across the top,
 * and Out of Time, where the road runs out, a leap; then the Incision, a
 * cutting sunk 7 m slicing corner to corner right under the car park, its
 * lanes full of driverless pods; Sulphur rising out of it, the Sky
 * Dematerialised climbing to a crest and the Stars Fell Flat off it;
 * Rebellion's esses, Mechanic Rise sweeping up onto a deck over the way in,
 * and Faith Is Blind round a cloverleaf's lobe and home under the deck.
 * Shortcut: Our Faith Is Blind, a lane through a dark tunnel with no
 * lights, straight across the bend the main road swings round, on the
 * final lap only.
 */
export function buildLevel5(): TrackDef {
  const b = new TrackBuilder(START, 'Level Five Autonomy', { halfWidth: 10, surface: 'lane' });
  b.scale = K;
  b.straight(20).mark('kick1').kicker().straight(25).mark('kick2').kicker();
  b.straight(PARK_X + SX - PARK_LEG / 2 - b.pose.x / K);

  // Up the car park's helix: each half turn a level, its ramp and its turn.
  b.section('Level Five Autonomy', { halfWidth: 8, wallHeight: 1.2, surface: 'lane', bridge: true });
  b.mark('helix');
  for (let k = 0; k < TURNS; k++) b.straight(PARK_LEG).arc(PARK_R, -180).mark(`level${k + 2}`);
  b.mark('roof');

  // Out over the roof, and off its edge, down to the ground.
  b.section("The Milk's Gone Bad", { halfWidth: 9, wallHeight: 1.2, surface: 'lane', bridge: true });
  b.mark('milk');
  b.straight(PARK_LEG + 65);
  b.mark('milkEnd');
  b.section('Flies on the Windscreen', { halfWidth: 9.5, wallHeight: 1.2, surface: 'lane', bridge: true });
  b.mark('flies');
  b.arc(50, -90);
  b.mark('fliesEnd');

  b.section('Mortician', { halfWidth: 9, wallHeight: 1.2, surface: 'lane' });
  b.mark('mortician');
  b.straight(10).arc(28, 50).arc(28, -140);
  b.mark('morticianEnd');

  b.section('Date with the End of the World', { halfWidth: 10, wallHeight: 1.2, surface: 'lane' });
  b.mark('date');
  b.hermiteTo(wp(20, 165, W));

  // Out of time: the road runs out, a leap, and round into the incision.
  b.section('Out of Time', { halfWidth: 9.5, wallHeight: 1.2, surface: 'lane' });
  b.mark('time');
  b.straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20);
  b.elevate(0).straight(15);
  b.arc(35, -135);
  b.mark('timeEnd');

  // The incision, so precise: a cutting corner to corner, right under the car park.
  b.section('Incision', { halfWidth: 9, wallHeight: WALL, surface: 'lane' });
  b.mark('incision');
  b.arc(260, -10).arc(260, 20).arc(260, -10);
  b.hermiteTo(wp(PARK_X + 100, -100, SE));
  b.mark('incisionEnd');

  b.section('Sulphur', { halfWidth: 9.5, wallHeight: 1.2, surface: 'lane' });
  b.mark('sulphur');
  b.straight(10).arc(45, 135);
  b.mark('sulphurEnd');

  b.section('The Sky Dematerialised', { halfWidth: 10, wallHeight: 1.2, surface: 'lane' });
  b.mark('sky');
  b.hermiteTo(wp(75, -175, W));
  b.mark('summit');
  b.section('Stars Fell Flat', { halfWidth: 10, wallHeight: 1.2, surface: 'lane' });
  b.mark('stars');
  b.straight(35);
  b.mark('starsEnd');

  b.section('Rebellion', { halfWidth: 9.5, wallHeight: 1.2, surface: 'lane' });
  b.mark('rebellion');
  b.arc(24, -35).arc(24, 70).arc(24, -70).arc(24, 35);
  b.mark('rebellionEnd');

  // The machines rise: sweeping round and up onto a deck over the way in.
  b.section('Mechanic Rise', { halfWidth: 9.5, wallHeight: 1.2, surface: 'lane' });
  b.mark('rise');
  b.arc(RISE_R, 70);
  b.straight((-PARK_R - 34 - b.pose.z / K) / Math.cos(b.pose.h));
  b.mark('deck');
  b.section('Mechanic Rise', { halfWidth: 9.5, wallHeight: 1.2, surface: 'lane', bridge: true });
  b.arc(180, 20);
  b.mark('deckEnd');
  b.section('Mechanic Rise', { halfWidth: 9.5, wallHeight: 1.2, surface: 'lane' });
  b.straight(LOBE_TOP - b.pose.z / K);

  // Round a cloverleaf's lobe, swinging round the dark, and home under the deck.
  b.section('Faith Is Blind', { halfWidth: 10, wallHeight: 1.2, surface: 'lane' });
  b.mark('blind');
  b.arc(LOBE_R, -90).arc(LOBE_R, -90);
  b.section('Faith Is Blind', { halfWidth: 9, surface: 'lane' });
  b.straight(5);
  b.mark('blindFrom');
  b.arc(BLIND_R, -BLIND_TURN);
  // Walled round the bend, where the dark is on the inside of it.
  b.section('Faith Is Blind', { halfWidth: 9, wallHeight: 1.2, surface: 'lane' });
  b.arc(BLIND_R, 2 * BLIND_TURN);
  b.section('Faith Is Blind', { halfWidth: 9, surface: 'lane' });
  b.arc(BLIND_R, -BLIND_TURN);
  b.mark('blindTo');
  b.section('Finish Straight', { halfWidth: 10, surface: 'lane' });
  b.mark('home');
  b.turnTo(offsetPose(START, -FINISH * K), LOBE_R);
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // Up the helix at one steady grade, a level each half turn; along the roof and off its edge.
  b.profile(m('helix'), m('roof'), (u) => ROOF * u, 8);
  b.profile(m('roof'), m('milkEnd'), () => ROOF, 10);
  plunge(b, m('milkEnd'), ROOF, m('fliesEnd', 10), 0);
  ease(b, m('incision', 10), 0, m('incision', 60), -DEPTH);
  b.profile(m('incision', 60), m('incisionEnd', -40), () => -DEPTH, 10);
  ease(b, m('incisionEnd', -40), -DEPTH, m('sulphur', 20), 0);
  ease(b, m('sky'), 0, m('summit'), CREST);
  plunge(b, m('summit'), CREST, m('rebellion', 20), 0);
  ease(b, m('rise'), 0, m('deck'), TIER);
  b.profile(m('deck'), m('deckEnd'), () => TIER, 10);
  ease(b, m('deckEnd'), TIER, m('blind'), 0);

  const main = b.finish(true);
  const blind = buildBlind(b.marks.blindFrom, b.marks.blindTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'level-5',
    name: 'Level 5',
    main,
    branches: [blind.branch],
    pits: [...b.pits, ...blind.pits],
    boostPads: [
      { s: 34, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('roof', 5), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('rebellionEnd', 3), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['helix', 'level3', 'level5', 'milk', 'mortician', 'date', 'time', 'incision', 'sulphur', 'sky', 'rebellion', 'rise', 'blind'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 240,
    landmarks: [
      { kind: 'carParkGate', ribbon: -1, s: 6 },
      { kind: 'carParkGate', ribbon: -1, s: at('helix', -6) },
      // The car park's frame, from the helix's foot over its roof's first ramp; each level's sign on its inside.
      { kind: 'carPark', ribbon: -1, s: at('helix', 0), to: at('roof', PARK_LEG) },
      ...[1, 2, 3, 4, 5].map((n) => ({ kind: 'levelSign' as const, ribbon: -1, s: n === 1 ? at('helix', 12) : at(`level${n}`, 12), lateral: PARK_INSIDE })),
      { kind: 'milkCarton', ribbon: -1, s: at('milk', 40), lateral: -45 },
      { kind: 'deadSky', ribbon: -1, s: at('sky', 0), lateral: 0 },
      { kind: 'blindTunnel', ribbon: 0, s: blind.boxes },
    ],
    itemBoxes: [
      { s: 72, count: 8 },
      { s: at('level3', 15), count: 3 },
      { s: at('milk', 30), count: 3 },
      { s: at('date', 40), count: 8 },
      { s: at('sulphur', 30), count: 8 },
      { s: at('rise', 40), count: 8 },
      { s: blind.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      // Driverless pods, nose to tail, down the incision's lanes and along the date with the end of the world.
      { kind: 'autopilot', from: at('incision', 70), to: at('incisionEnd', -30), count: 3, period: PODS_PERIOD },
      { kind: 'autopilot', from: at('date', 15), to: at('time', -10), count: 3, period: PODS_PERIOD },
    ],
    theme: 'autonomy',
    music: { lap: 'level-5', finalLap: 'level-5-final-lap' },
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

/** Our Faith Is Blind: the lane in to the dark, before it runs over nothing (where the main road has swung well clear). */
const BLIND_IN = 38;

/**
 * Our Faith Is Blind: a lane straight through a dark tunnel with no lights,
 * across the bend the main road swings round, no rails. On the final lap
 * only; on the others there's no road in the tunnel, only the drop.
 */
function buildBlind(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Our Faith Is Blind', { halfWidth: 6, surface: 'lane' });
  b.straight(BLIND_IN);
  b.section('Imprisoned', { halfWidth: 4, surface: 'lane' });
  const dark = chord - 2 * BLIND_IN;
  const boxes = b.s + dark / 2;
  b.bridge(dark, 7);
  b.section('Our Faith Is Blind', { halfWidth: 6, surface: 'lane' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Our Faith Is Blind', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: ['final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
