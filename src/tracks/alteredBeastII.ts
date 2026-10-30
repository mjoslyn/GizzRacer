import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.0;
/** The whole lap sits this far north of the map's middle. */
const LIFT = 35;
const D = Math.PI / 180;
/** A waypoint, in builder units, its heading in degrees. */
const wp = (x: number, z: number, h: number): Pose => ({ x: x * K, z: (z + LIFT) * K, h: h * D });
/** Cross to the Foe starts down here, heading north-east, the fork's handle, through the middle of the map. */
const START = wp(-80, -80, 45);
const FINISH = 45;
/** The fork's tines: two hairpins of this radius, up one tine, down the next and up the last. */
const TINE_R = 24;
/** Weapons and Heavy Cargo: the climb up the tines with the cargo, this high. */
const CARGO = 5;
/** The Top of the Food Chain: the knife's handle, a deck this high laid across the fork's. */
const TOP = 11;
/** Malevolence: four bends in the song's nine, two, two, two and three, this tight and this far round. */
const MAL_R = 30;
const MAL_TURN = 18;
/** Caribou swings out round the herd in three arcs of this radius and turn; the Caribou Run goes straight through. */
const SWING_R = 42;
const SWING_TURN = 70;
/** How deep Knife and Fork is sunk between its walls, and the walls. */
const DEPTH = 6;
const WALL = 6;
/** The monster's plate: the road round it, this far out from its middle, comes up to it here heading north, and climbs round onto a deck this high over the way in. */
const PLATE_R = 55;
const PLATE_IN = { x: -200, z: -125 };
/** Knife and Fork runs on this far round the plate, climbing out of its cut, before the plate's own deck. */
const PLATE_IN_TURN = 50;
const TIER = 8;
/** Crusty Bread: two crusts this high to bump over. */
const CRUST = 1.2;

/**
 * Altered Beast II (the Altered Beast Cup's second), after the song and
 * Alter Me II run into it: "now dear listener we cross to the foe", and the
 * beast speaks, in 9/8: the foe with the weapons and heavy cargo, the
 * sabre, the catapult and bat, the top of the food chain in its habitat;
 * "break your head, crusty bread"; drink malevolence from my teat; "I am
 * the golden wolf and you are caribou"; "my left hand is a knife and my
 * right is a fork, I will pull you apart like a butcher pulls pork"; and
 * Alter Me II's "now we cross to our friend on the monster's plate, in time
 * he will turn and reincarnate". The world is the beast's den, its table
 * laid and the karts the size of a meal on it: a butcher's block for a
 * road, a tablecloth in meat and wine, crusty bread, bones, goblets and
 * candles, its weapons stuck in the table. The lap is the beast's knife and
 * fork crossed, a figure of eight, and its plate: Cross to the Foe up the
 * fork's handle (two kickers), Weapons and Heavy Cargo up and down its
 * tines (two hairpins, climbing), the Sabre's curved blade round the top,
 * the Catapult flinging you over a gap and the Bat swinging you round, the
 * Top of the Food Chain on a deck 11 m up across the fork's handle, the
 * knife's, off its crest into Crusty Bread; Malevolence's bends in the
 * song's two, two, two and three; the Golden Wolf, Caribou swinging out
 * round the herd, Knife and Fork sunk 6 m between the larder's walls with
 * the beast's cutlery coming down into the road, and round the Monster's
 * Plate, climbing onto a deck over the way in, to Reincarnate and the
 * catapult again. Shortcut: the Caribou Run, straight through the herd, on
 * the final lap only.
 */
export function buildAlteredBeastII(): TrackDef {
  const b = new TrackBuilder(START, 'Cross to the Foe', { halfWidth: 11, surface: 'butcher' });
  b.scale = K;
  b.straight(25).mark('kick1').kicker().straight(25).mark('kick2').kicker().straight(20);
  b.arc(160, 14).arc(160, -14);
  b.straight(30);

  // The fork's tines: up one, back down the next, and up the last, climbing with the heavy cargo.
  b.section('Weapons and Heavy Cargo', { halfWidth: 9.5, wallHeight: 1.2, surface: 'butcher' });
  b.mark('weapons');
  b.arc(40, -45);
  b.straight(50);
  b.mark('tine1');
  b.arc(TINE_R, 180);
  b.straight(50);
  b.mark('tine2');
  b.arc(TINE_R, -180);
  b.straight(50);
  b.mark('weaponsEnd');

  // "I am the sabre!": a long curved blade round the top of the map.
  b.section('The Sabre', { halfWidth: 10, wallHeight: 1.2, surface: 'butcher' });
  b.mark('sabre');
  b.arc(110, -120);
  b.mark('sabreEnd');

  // The catapult flings you over a gap; the bat swings you round.
  b.section('Catapult and Bat', { halfWidth: 9.5, wallHeight: 1.2, surface: 'butcher' });
  b.mark('catapult');
  b.straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(14, 20);
  b.elevate(0).straight(20);
  b.mark('bat');
  b.arc(35, -105);

  // The top of the food chain: the knife's handle, up on a deck across the fork's.
  b.section('Top of the Food Chain', { halfWidth: 10, wallHeight: 1.2, surface: 'butcher', bridge: true });
  b.mark('chain');
  b.arc(150, 20).arc(150, -20);
  b.turnTo(wp(110, -110, 135), 60);
  b.mark('chainEnd');

  b.section('Crusty Bread', { halfWidth: 10, wallHeight: 1.2, surface: 'butcher' });
  b.mark('bread');
  b.straight(40);
  b.arc(50, 45);
  b.mark('breadEnd');

  // Malevolence in nine: two, two, two and three.
  b.section('Malevolence', { halfWidth: 9.5, wallHeight: 1.2, surface: 'butcher' });
  b.mark('malevolence');
  b.arc(MAL_R, 2 * MAL_TURN).arc(MAL_R, -2 * MAL_TURN).arc(MAL_R, 2 * MAL_TURN).arc(MAL_R, -3 * MAL_TURN);
  b.mark('malevolenceEnd');

  // The golden wolf runs the caribou round.
  b.section('Golden Wolf', { halfWidth: 10, wallHeight: 1.2, surface: 'butcher' });
  b.mark('wolf');
  b.arc(60, 108);
  b.straight(20);
  b.section('Caribou', { halfWidth: 10.5, surface: 'butcher' });
  b.mark('caribou');
  b.straight(10);
  b.mark('runFrom');
  b.arc(SWING_R, SWING_TURN).arc(SWING_R, -2 * SWING_TURN).arc(SWING_R, SWING_TURN);
  b.mark('runTo');
  b.straight(10);

  // Knife and Fork, sunk between the larder's walls, the beast's cutlery coming down into it.
  b.section('Knife and Fork', { halfWidth: 9, wallHeight: WALL, surface: 'butcher' });
  b.mark('cutlery');
  b.hermiteTo(wp(PLATE_IN.x, PLATE_IN.z, 0));
  b.mark('cutleryEnd');
  b.arc(PLATE_R, -PLATE_IN_TURN);

  // Round the monster's plate, climbing onto a deck over the way in.
  b.section("The Monster's Plate", { halfWidth: 10, wallHeight: 1.2, surface: 'butcher', bridge: true });
  b.mark('plate');
  b.arc(PLATE_R, -(270 - PLATE_IN_TURN));
  b.mark('plateEnd');
  b.straight(80);
  b.section('Reincarnate', { halfWidth: 10.5, surface: 'butcher' });
  b.mark('reincarnate');
  b.turnTo(offsetPose(START, -FINISH * K), 40);
  b.section('Finish Straight', { halfWidth: 11, surface: 'butcher' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // Heavy cargo: up the fork's tines, and down the sabre's blade to the catapult.
  ease(b, m('weapons', 20), 0, m('weaponsEnd', -20), CARGO);
  ease(b, m('weaponsEnd', -20), CARGO, m('sabreEnd', -30), 0);
  // Up to the top of the food chain, over the fork's handle, and off its crest into Crusty Bread.
  ease(b, m('chain', 10), 0, m('chain', 130), TOP);
  b.profile(m('chain', 130), m('chainEnd', -60), () => TOP, 10);
  plunge(b, m('chainEnd', -60), TOP, m('bread', 25), 0);
  b.profile(m('bread', 25), m('breadEnd'), (u) => CRUST * Math.sin(Math.PI * 2 * u) ** 2);
  // Knife and Fork sunk between its walls; the plate climbing round onto its deck over the way in, and down to Reincarnate.
  ease(b, m('cutlery', 20), 0, m('cutlery', 80), -DEPTH);
  b.profile(m('cutlery', 80), m('cutleryEnd', -25), () => -DEPTH, 10);
  ease(b, m('cutleryEnd', -25), -DEPTH, m('plate'), 0);
  ease(b, m('plate', 10), 0, m('plate', 170), TIER);
  b.profile(m('plate', 200), m('plateEnd', 70), () => TIER, 10);
  ease(b, m('plateEnd', 70), TIER, m('finish', -10), 0);

  const main = b.finish(true);
  const run = buildCaribouRun(b.marks.runFrom, b.marks.runTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'altered-beast-ii',
    name: 'Altered Beast II',
    main,
    branches: [run.branch],
    pits: [...b.pits, ...run.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('tine2', -20), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('malevolenceEnd', 2), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['weapons', 'sabre', 'catapult', 'chain', 'bread', 'malevolence', 'wolf', 'caribou', 'cutlery', 'plate', 'reincarnate'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 340,
    landmarks: [
      { kind: 'catapultGate', ribbon: -1, s: 6 },
      { kind: 'catapultGate', ribbon: -1, s: at('catapult', 2) },
      // In the middle of the road's loop round the plate, to its right.
      { kind: 'monsterPlate', ribbon: -1, s: at('plate', 60), lateral: PLATE_R },
    ],
    itemBoxes: [
      { s: 80, count: 4 },
      { s: at('sabre', 40), count: 4 },
      { s: at('chain', 160), count: 3 },
      { s: at('wolf', 30), count: 4 },
      { s: at('plate', 60), count: 3 },
      { s: run.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'cutlery', at: [at('cutleryEnd', -110), at('cutleryEnd', -75), at('cutleryEnd', -40)], period: 4.6 },
      { kind: 'cutlery', at: [at('plate', 110)], period: 5 },
    ],
    theme: 'foe',
    music: { lap: 'altered-beast-ii', finalLap: 'altered-beast-ii-final-lap' },
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
 * The Caribou Run: the herd's own way, straight through where Caribou
 * swings out round it, over a gully on a log of a bridge, no rails. The
 * wolf only learns it on the final lap.
 */
function buildCaribouRun(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Caribou Run', { halfWidth: 6, surface: 'butcher' });
  b.straight(30);
  b.section('The Herd', { halfWidth: 4.5, surface: 'butcher' });
  b.elevate(0).straight(12).elevate(1);
  const gully = chord - 2 * b.s;
  const boxes = b.s + gully / 2;
  b.bridge(gully, 7);
  b.elevate(1).straight(12).elevate(0);
  b.section('Caribou Run', { halfWidth: 6, surface: 'butcher' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Caribou Run', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: ['final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
