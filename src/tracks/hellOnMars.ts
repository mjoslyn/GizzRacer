import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 0.95;
/** A waypoint on the lap, in builder units. */
const wp = (x: number, z: number, h: number): Pose => ({ x: x * K, z: z * K, h });
const START: Pose = wp(-60, -300, -Math.PI / 2);
const FINISH = 55;
/**
 * The Olympus Climb loops up the mountain like flame curling off a
 * flamethrower's nozzle: a trochoid, rolling this far a radian, its loops
 * this big, this many of them, sampled this many times a loop, its axis
 * running up the map this way (north-east) with the middle of its top over
 * the middle of the map, where the Dragon's Nest runs under it.
 */
const ROLL = 21;
const LOOP = 60;
const LOOPS = 2;
const COIL_STEPS = 8;
const AXIS = Math.PI / 4;
/** The coil at angle `t` (it starts at π, along its top, heading up the axis), heading along it. */
function coil(t: number): Pose {
  const u = { x: Math.sin(AXIS), z: Math.cos(AXIS) };
  const n = { x: -Math.cos(AXIS), z: Math.sin(AXIS) };
  // Along the axis and across it (to its left), from the middle of its top.
  const along = ROLL * (t - 3 * Math.PI) - LOOP * Math.sin(t);
  const across = -LOOP * Math.cos(t) - LOOP;
  const da = ROLL - LOOP * Math.cos(t);
  const dc = LOOP * Math.sin(t);
  return wp(along * u.x + across * n.x, along * u.z + across * n.z, Math.atan2(da * u.x + dc * n.x, da * u.z + dc * n.z));
}
/** The Dragon's Nest heads in from here to run under the coil, across its axis. */
const NEST_FROM = wp(-120, 120, (3 * Math.PI) / 4);
/** Fire Crater: the rim bulges out round the crater in three arcs of this radius and turn. */
const RIM_R = 52;
const RIM_TURN = 65;
/** Fire Escape: the leap over the crater's molten floor. */
const CRATER_GAP = 23;
/** The top of the Olympus Climb, where the Valles Rift leaps off; and how high the far side is. */
const PEAK = 23;
const RIFT_LAND = 18;
/** How deep the Dragon's Nest is dug into the ground. */
const NEST_DEPTH = 8;

/**
 * Flamethrower, once Mars for the Rich (hard): a colony on the red planet,
 * overrun and burning, the PetroDragonic Apocalypse Cup's finale.
 * A landing strip for a grid, a chicane between the habs, a climb up the
 * flank of Olympus and a leap over a rift of lava, the rim of a crater
 * where dust devils roam (Fire Escape, a toll lane, leaps straight
 * across it), a twisting run through the Dragon's Nest, and meteors
 * streaking down onto the straights. The lap is a figure of eight with a
 * flame through its middle: the Landing Strip (two kickers) and the
 * Witchcraft Chicane round the south loop, then the Olympus Climb rolls up
 * the middle of the map in two loops, like fire curling off the nozzle,
 * each loop climbing on its pillars over the one before, to 23 m. The
 * Valles Rift leaps off the top and the road plunges down the far side
 * into the north loop round the Fire Crater; the Dragon's Nest twists
 * down into a trench dug 8 m into the red dirt and runs straight through
 * the middle, under the top of the climb between its loops, and the
 * Meteor Mile sweeps round the south loop home.
 */
export function buildHellOnMars(): TrackDef {
  const b = new TrackBuilder(START, 'Landing Strip', { halfWidth: 11, surface: 'regolith' });
  b.scale = K;
  // Two kickers off the junk on the strip.
  b.straight(50).mark('kick1').kicker().straight(30).mark('kick2').kicker().mark('strip').straight(30);

  b.section('Witchcraft Chicane', { halfWidth: 9, wallHeight: 1.2, surface: 'regolith' });
  b.mark('habs');
  b.arc(45, 90).arc(28, -40).arc(28, 40);
  b.turnTo(coil(Math.PI), 40);

  // Up the flank of the mountain in loops, each one over the last.
  b.section('Olympus Climb', { halfWidth: 9.5, wallHeight: 1.2, surface: 'rock', bridge: true });
  b.mark('climb');
  const loopS = [b.s];
  for (let k = 1; k <= LOOPS * COIL_STEPS; k++) loopS.push(b.hermiteTo(coil(Math.PI + (2 * Math.PI * k) / COIL_STEPS)).s);
  b.mark('summit');

  // Off the top over a rift of lava, onto the lower far side, then a plunge down it.
  b.section('Valles Rift', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.mark('rift');
  b.straight(20).elevate(PEAK).rise(18, PEAK + 3);
  b.gap(16, 36, 'lava');
  b.elevate(RIFT_LAND).mark('landed').straight(40);
  b.turnTo(wp(130, 330, -Math.PI / 2), 50);

  // The rim swings out round the crater; the toll lane takes the chord.
  b.section('Fire Crater', { halfWidth: 9.5, surface: 'regolith' });
  b.mark('crater');
  b.straight(4);
  b.mark('rimFrom');
  b.arc(RIM_R, -RIM_TURN).arc(RIM_R, 2 * RIM_TURN).arc(RIM_R, -RIM_TURN);
  b.mark('rimTo');
  b.straight(3);
  b.turnTo(NEST_FROM, 45);

  // A twisting run down into a trench dug through the middle, under the loops.
  b.section("Dragon's Nest", { halfWidth: 8, wallHeight: 1.5, surface: 'regolith' });
  b.mark('nest');
  b.arc(20, -60).arc(20, 120).arc(20, -60).arc(20, 60).arc(20, -120).arc(20, 60);
  b.straight(Math.hypot(b.pose.x, b.pose.z) / K + 150);
  b.mark('nestEnd');

  b.section('Meteor Mile', { halfWidth: 10, surface: 'regolith' });
  b.mark('mile');
  b.turnTo(offsetPose(START, -FINISH * K), 45);
  b.section('Finish Straight', { halfWidth: 11, surface: 'regolith' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: the long climb round the loops, the plunge, the trench.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // Round the loops by angle on the coil, so each loop passes well over the one before.
  const sOf = (t: number) => {
    const k = ((t - Math.PI) / (2 * Math.PI)) * COIL_STEPS;
    const i = Math.min(Math.floor(k), loopS.length - 2);
    return loopS[i] + (loopS[i + 1] - loopS[i]) * (k - i);
  };
  const climb: [number, number][] = [[Math.PI, 0], [4.4, 1], [8.2, 12], [10.6, 13], [14.4, PEAK], [5 * Math.PI, PEAK]];
  for (let k = 0; k + 1 < climb.length; k++) ease(b, sOf(climb[k][0]), climb[k][1], sOf(climb[k + 1][0]), climb[k + 1][1]);
  b.profile(m('summit'), m('rift', 20), () => PEAK, 10);
  plunge(b, m('landed', 30), RIFT_LAND, m('crater'), 0);
  b.profile(m('rimFrom', 45), m('rimTo', -45), (u) => 4 * Math.sin(Math.PI * u) ** 2);
  ease(b, m('nest', 10), 0, m('nest', 60), -NEST_DEPTH);
  b.profile(m('nest', 60), m('nestEnd', -30), () => -NEST_DEPTH, 20);
  ease(b, m('nestEnd', -30), -NEST_DEPTH, m('mile', 30), 5);
  plunge(b, m('mile', 30), 5, m('mile', 75), 0);

  const main = b.finish(true);
  const toll = buildTollLane(b.marks.rimFrom, b.marks.rimTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'hell-on-mars',
    name: 'Flamethrower',
    main,
    branches: [toll.branch],
    pits: [...b.pits, ...toll.pits],
    boostPads: [
      { s: 110, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('rift', 4), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['habs', 'climb', 'rift', 'crater', 'nest', 'mile'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'colonyGate', ribbon: -1, s: 6 },
      { kind: 'colonyGate', ribbon: -1, s: at('habs', 2) },
    ],
    itemBoxes: [
      { s: 98, count: 4 },
      { s: at('climb', 30), count: 3 },
      { s: at('crater', 55), count: 4 },
      { s: at('nest', 60), count: 3 },
      { s: at('mile', 10), count: 4 },
      { s: toll.boxes, count: 2, ribbon: 0, span: 5, double: true },
    ],
    hazards: [
      { kind: 'meteors', at: [110, 150, at('climb', 25), at('mile', 15)], period: 5.5 },
      { kind: 'dustDevils', from: at('crater', 15), to: at('crater', 150), count: 2 },
    ],
    theme: 'mars',
    music: { lap: 'hell-on-mars', finalLap: 'hell-on-mars-final-lap' },
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
 * Fire Escape: a narrow toll lane straight across the Fire Crater,
 * leaping its molten floor. From 150cc a kart at full speed clears it; at
 * 100cc it takes a boost or a mini-turbo.
 */
function buildTollLane(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Fire Escape', { halfWidth: 6, surface: 'regolith' });
  b.straight(50).elevate(0).straight(18).elevate(2.4);
  b.gap(CRATER_GAP, 16, 'lava');
  b.elevate(0).straight(20);
  // The toll: a pair of double boxes for those who made it over.
  const boxes = b.s;
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Fire Escape', mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
  return { branch, pits: b.pits, boxes };
}
