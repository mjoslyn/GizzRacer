import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.1;
const START: Pose = { x: -20 * K, z: 320 * K, h: Math.PI / 2 };
/** A waypoint on the journey, in builder units. */
const wp = (x: number, z: number, h: number): Pose => ({ x: x * K, z: z * K, h });
const FINISH = 45;
/** The Fiery Temper's hairpins, and the switchbacks up to the peaks. */
const TEMPER_R = 24;
const SWITCH_R = 22;
/** A Prayer from the Peaks: the climb to this height, and over the top. */
const PEAK = 13;
/** How deep the Scorpion Pass is sunk between its walls, and the walls. */
const DEPTH = 6;
const WALL = 6;
/** The Razorback: a sharp ridge this high. */
const RIDGE = 5;
/** The House of Dust: two dunes this high on the way home. */
const DUNE = 3;
/** Thirteen Winds: thirteen bends. */
const WINDS = 13;
/** Swam the Flood: the main road swings out round the floodwater in three arcs of this radius and turn; the shortcut dives straight under it. */
const FLOOD_R = 42;
const FLOOD_TURN = 80;

/**
 * Gilgamesh (the Silver Cord Cup's finale), after the song of the hero of
 * the oldest epic there is: a fiery temper, Shamash the sun-god's combat,
 * the heavens turned to darkness and five visions of biblical downpour, a
 * prayer of shelter from the peaks; the light of a glorious photon
 * travelling on; bone-dried swamplands, the scorpions guarding the pass,
 * the key to immortality; gemstone trees, beneath the razorback, flown on
 * thirteen winds; killed the bull, crossed the sea, swam the flood; "c'mon
 * snake, punish me, for immortality"; the house of dust. The world is Uruk
 * and the road out of it under a storm: mud-brick and blue glazed walls,
 * the ziggurat, dry swamp and reeds, giant scorpions, trees of gemstones.
 * The lap is the hero's journey round: out through the Walls of Uruk (two
 * kickers), the Fiery Temper's switchback, Shamash Combat, the climb to a
 * Prayer from the Peaks and the Glorious Photon flying down off it; the
 * Bone-Dried Swamplands, narrow; the Scorpion Pass sunk 6 m between walls,
 * the plant of immortality growing up through the road and the snake coming
 * across for it; the Gemstone Trees, the Razorback's sharp ridge, the
 * Thirteen Winds (thirteen bends), Killed the Bull, Crossed the Sea (a leap
 * over the water), and the flood. Shortcut: Swam the Flood, diving straight
 * under the floodwater the main road swings round, on every lap.
 */
export function buildGilgamesh(): TrackDef {
  const b = new TrackBuilder(START, 'Walls of Uruk', { halfWidth: 11, surface: 'mudbrick' });
  b.scale = K;
  b.straight(30).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(30);

  // A fiery temper: a Z of two hairpins, back on itself and back again.
  b.section('Fiery Temper', { halfWidth: 9, wallHeight: 1.2, surface: 'mudbrick' });
  b.mark('temper');
  b.arc(TEMPER_R, 180);
  b.straight(50);
  b.arc(TEMPER_R, -180);
  b.mark('temperEnd');
  b.straight(20);

  b.section('Shamash Combat', { halfWidth: 10.5, surface: 'mudbrick' });
  b.mark('shamash');
  b.arc(60, 90);
  b.straight(10);

  // A prayer of shelter from the peaks: switchbacks up the mountainside, climbing leg by leg.
  b.section('A Prayer from the Peaks', { halfWidth: 8.5, wallHeight: 1.2, surface: 'mudbrick' });
  b.mark('peaks');
  b.arc(30, -90);
  b.straight(30);
  b.arc(SWITCH_R, 180);
  b.straight(45);
  b.arc(SWITCH_R, -180);
  b.straight(30);
  b.mark('summit');
  // The light of a glorious photon: round off the top and flying down a viaduct right across the land.
  b.section('Glorious Photon', { halfWidth: 10.5, wallHeight: 1.2, surface: 'mudbrick', bridge: true });
  b.mark('photon');
  b.arc(40, 130);
  b.turnTo(wp(-230, -170, Math.PI), 60);
  b.mark('photonEnd');

  b.section('Bone-Dried Swamplands', { halfWidth: 8.5, wallHeight: 1.2, surface: 'mudbrick' });
  b.mark('swamp');
  b.arc(30, 35).arc(30, -70).arc(30, 35);
  b.mark('swampEnd');

  // The scorpions guarding the pass, sunk between its walls; the plant of immortality and the snake.
  b.section('The Scorpion Pass', { halfWidth: 9, wallHeight: WALL, surface: 'mudbrick' });
  b.mark('pass');
  b.turnTo(wp(-90, -340, Math.PI / 2), 50);
  b.straight(30).arc(70, 20).arc(70, -20);
  b.mark('passEnd');
  b.straight(10);

  b.section('Gemstone Trees', { halfWidth: 10, wallHeight: 1.2, surface: 'mudbrick' });
  b.mark('gems');
  b.arc(36, -45).arc(36, 90).arc(36, -45);
  b.section('The Razorback', { halfWidth: 8.5, surface: 'mudbrick' });
  b.mark('ridge');
  b.turnTo(wp(260, -200, 0), 50);
  b.straight(30);
  b.mark('ridgeEnd');

  // Thirteen winds, and back across the land beneath the photon's viaduct.
  b.arc(40, -60);
  b.section('Thirteen Winds', { halfWidth: 9.5, wallHeight: 1.2, surface: 'mudbrick' });
  b.mark('winds');
  b.arc(28, 30);
  for (let k = 0; k < WINDS - 2; k++) b.arc(28, k % 2 ? 60 : -60);
  b.arc(28, 30);
  b.mark('windsEnd');

  // Killed the bull: grappling with it, an S, and on round onto the west side.
  b.section('Killed the Bull', { halfWidth: 9.5, wallHeight: 1.2, surface: 'mudbrick' });
  b.mark('bull');
  b.arc(36, 50).arc(36, -100).arc(36, 50);
  b.turnTo(wp(-300, -60, 0), 40);
  b.mark('bullEnd');

  // Crossed the sea: a leap over the water.
  b.section('Crossed the Sea', { halfWidth: 9, wallHeight: 1.2, surface: 'mudbrick' });
  b.mark('sea');
  b.straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20, 'water');
  b.elevate(0).straight(10);
  b.mark('seaEnd');

  b.section('The Flood', { halfWidth: 10.5, surface: 'mudbrick' });
  b.mark('flood');
  b.straight(10);
  b.mark('floodFrom');
  b.arc(FLOOD_R, -FLOOD_TURN).arc(FLOOD_R, 2 * FLOOD_TURN).arc(FLOOD_R, -FLOOD_TURN);
  b.mark('floodTo');
  b.straight(10);

  // Land of bone, house of dust: an S over the dunes, home.
  b.section('Land of Bone', { halfWidth: 10, wallHeight: 1.2, surface: 'mudbrick' });
  b.mark('bone');
  b.arc(45, 60).arc(45, -80).arc(45, 60);
  b.mark('boneEnd');
  b.section('House of Dust', { halfWidth: 11, surface: 'mudbrick' });
  b.mark('dust');
  b.turnTo(offsetPose(START, -FINISH * K), 50);
  b.section('Finish Straight', { halfWidth: 11, surface: 'mudbrick' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // Up to the peaks, and the photon flying down off the top.
  ease(b, m('peaks'), 0, m('summit'), PEAK);
  b.profile(m('summit'), m('photon', 220), () => PEAK, 10);
  plunge(b, m('photon', 220), PEAK, m('photonEnd'), 0);
  ease(b, m('pass', 5), 0, m('pass', 40), -DEPTH);
  b.profile(m('pass', 40), m('passEnd', -30), () => -DEPTH, 10);
  ease(b, m('passEnd', -30), -DEPTH, m('passEnd', 10), 0);
  // The razorback: up to a sharp ridge and down.
  b.profile(m('ridgeEnd', -60), m('ridgeEnd'), (u) => RIDGE * (1 - Math.abs(2 * u - 1)) ** 1.5);
  // Dunes of dust on the way home.
  b.profile(m('dust'), m('finish', -10), (u) => DUNE * Math.sin(Math.PI * 2 * u) ** 2);

  const main = b.finish(true);
  const flood = buildFlood(b.marks.floodFrom, b.marks.floodTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'gilgamesh',
    name: 'Gilgamesh',
    main,
    branches: [flood.branch],
    pits: [...b.pits, ...flood.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('temperEnd', 5), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('windsEnd', 2), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['temper', 'shamash', 'peaks', 'photon', 'swamp', 'pass', 'gems', 'winds', 'bull', 'flood', 'bone'].map((k) => b.marks[k].s / main.length),
    // A long journey: two laps of it are a race.
    laps: 2,
    bounds: 440,
    landmarks: [
      { kind: 'urukGate', ribbon: -1, s: 6 },
      { kind: 'urukGate', ribbon: -1, s: at('pass', -2) },
      { kind: 'ziggurat', ribbon: -1, s: at('bone', 20), lateral: 170 },
    ],
    itemBoxes: [
      { s: 80, count: 4 },
      { s: at('shamash', 30), count: 4 },
      { s: at('photon', 40), count: 3 },
      { s: at('pass', 110), count: 3 },
      { s: at('ridge', 10), count: 4 },
      { s: flood.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'serpents', at: [at('pass', 50), at('pass', 100)], period: 5 },
      { kind: 'serpents', at: [at('gems', 40)], period: 5.4 },
    ],
    theme: 'uruk',
    music: { lap: 'gilgamesh', finalLap: 'gilgamesh-final-lap' },
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
 * Swam the Flood: straight across the floodwater the main road swings
 * round, diving under it along the bottom and up the other side. There
 * every lap.
 */
function buildFlood(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Swam the Flood', { halfWidth: 6, surface: 'mudbrick' });
  b.straight(45);
  b.section('Under the Flood', { halfWidth: 6, surface: 'mudbrick' });
  const water = chord - 2 * b.s;
  const boxes = b.s + water / 2;
  b.dive(water, 5, 26, 8);
  b.section('Swam the Flood', { halfWidth: 6, surface: 'mudbrick' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Swam the Flood', mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
  return { branch, pits: b.pits, boxes };
}
