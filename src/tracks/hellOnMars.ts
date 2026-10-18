import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.1;
const START: Pose = { x: -90 * K, z: 160 * K, h: Math.PI / 2 };
const FINISH = 55;
/** Perihelion Crater: the rim bulges out round the crater in three arcs of this radius and turn. */
const RIM_R = 45;
const RIM_TURN = 65;
/** Mars for the Rich: the leap over the crater's molten floor. */
const CRATER_GAP = 23;
/** The top of the Olympus Climb, where the Valles Rift leaps off; and how high the far side is. */
const PEAK = 23;
const RIFT_LAND = 18;
/** How deep the Rats' Nest is dug into the ground. */
const NEST_DEPTH = 8;

/**
 * Hell on Mars (hard): a colony on the red planet, overrun and burning.
 * A landing strip for a grid, a chicane between the habs, a climb up the
 * flank of Olympus and a leap over a rift of lava, the rim of a crater
 * where dust devils roam (Mars for the Rich, a toll lane, leaps straight
 * across it), a twisting run through the Rats' Nest, and meteors
 * streaking down onto the straights. The climb runs 23 m up the
 * mountain, the rift leaps off the top and the road plunges down the far
 * side; the Rats' Nest is a trench dug 8 m into the red dirt.
 */
export function buildHellOnMars(): TrackDef {
  const b = new TrackBuilder(START, 'Landing Strip', { halfWidth: 11, surface: 'regolith' });
  b.scale = K;
  // Venusian 1 and 2: two kickers off the junk on the strip.
  b.straight(84).mark('kick1').kicker().straight(30).mark('kick2').kicker().mark('strip').straight(53).arc(50, 90);

  b.section('Superbug Chicane', { halfWidth: 9, wallHeight: 1.2, surface: 'regolith' });
  b.mark('habs');
  b.straight(40).arc(28, -55).arc(28, 55).straight(40);

  // Up the flank of the mountain.
  b.section('Olympus Climb', { halfWidth: 9.5, surface: 'rock' });
  b.mark('climb');
  b.straight(130).arc(42, 90);

  // Off the top over a rift of lava, onto the lower far side, then a plunge down it.
  b.section('Valles Rift', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.mark('rift');
  b.straight(20).elevate(PEAK).rise(18, PEAK + 3);
  b.gap(16, 36, 'lava');
  b.elevate(RIFT_LAND).mark('landed').straight(92);

  // The rim swings out round the crater; the toll lane takes the chord.
  b.section('Perihelion Crater', { halfWidth: 9.5, surface: 'regolith' });
  b.mark('crater');
  b.straight(4);
  b.mark('rimFrom');
  b.arc(RIM_R, -RIM_TURN).arc(RIM_R, 2 * RIM_TURN).arc(RIM_R, -RIM_TURN);
  b.mark('rimTo');
  b.straight(3).arc(60, 90);

  b.section("Rats' Nest", { halfWidth: 8, wallHeight: 1.5, surface: 'regolith' });
  b.mark('nest');
  b.straight(10).arc(20, -70).arc(22, 140).arc(20, -140).arc(22, 140).arc(20, -70).straight(10);

  b.section('Meteor Mile', { halfWidth: 10, surface: 'regolith' });
  b.mark('mile');
  b.straight(20);
  b.turnTo(offsetPose(START, -FINISH * K), 42);
  b.section('Finish Straight', { halfWidth: 11, surface: 'regolith' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: a roll down the strip, the long climb, the plunge, the trench.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('strip', 8), m('habs', -10), (u) => 4 * Math.sin(Math.PI * u) ** 2);
  ease(b, m('habs'), 0, m('climb'), 3);
  ease(b, m('climb'), 3, m('rift'), PEAK);
  plunge(b, m('landed', 30), RIFT_LAND, m('crater'), 0);
  b.profile(m('rimFrom', 45), m('rimTo', -45), (u) => 4 * Math.sin(Math.PI * u) ** 2);
  ease(b, m('nest', -40), 0, m('nest', 25), -NEST_DEPTH);
  b.profile(m('nest', 25), m('mile', -25), () => -NEST_DEPTH, 20);
  ease(b, m('mile', -25), -NEST_DEPTH, m('mile', 30), 5);
  plunge(b, m('mile', 30), 5, m('mile', 75), 0);

  const main = b.finish(true);
  const toll = buildTollLane(b.marks.rimFrom, b.marks.rimTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'hell-on-mars',
    name: 'Hell on Mars',
    main,
    branches: [toll.branch],
    pits: [...b.pits, ...toll.pits],
    boostPads: [
      { s: 45, length: 8, lateral: 0, halfWidth: 2.5 },
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
      { s: 80, count: 4 },
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
 * Mars for the Rich: a narrow toll lane straight across Perihelion Crater,
 * leaping its molten floor. From 150cc a kart at full speed clears it; at
 * 100cc it takes a boost or a mini-turbo.
 */
function buildTollLane(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Mars for the Rich', { halfWidth: 6, surface: 'regolith' });
  b.straight(50).elevate(0).straight(18).elevate(2.4);
  b.gap(CRATER_GAP, 16, 'lava');
  b.elevate(0).straight(20);
  // The toll: a pair of double boxes for those who made it over.
  const boxes = b.s;
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Mars for the Rich', mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
  return { branch, pits: b.pits, boxes };
}
