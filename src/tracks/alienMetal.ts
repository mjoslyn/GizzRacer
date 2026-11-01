import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 0.97;
/**
 * The lap is the edge of a Möbius strip laid round the forge: the strip's
 * middle runs round at this radius, its edge this far out from it either
 * side. Round once on the outer edge, the strip twists and the edge is the
 * inner one; round again, it twists back, and it's where it began.
 */
const R = 170;
const W = 50;
/** Either side of the twist, this many radians round, the edge crosses over from one side of the strip to the other. */
const TWIST = 0.45;
/** The chant's zones: water swings out and fire swings in, this far, a hump of heat on each fire. */
const CHANT = 7;
const FIRE = 3;
/** Where round the strip (radians from the start) the chant begins and ends. */
const CHANT_FROM = 0.85;
const CHANT_TO = 1.95;
/** The deck the road runs over the twist on, and on round the inside, high over the forge. */
const TIER = 8;
/** How deep the forge is sunk, and its walls. */
const DEPTH = 6;
const WALL = 6;
/** The summer breeze and interstellar reality: swells this high, three of them out there, floating at this share of the usual gravity. */
const SWELL = 2.5;
const SWELLS = 3;
const FLOAT = 0.75;
/** Clouds and Ice swings out round the quench pool in three arcs of this radius and turn; the Slipstream runs straight across. */
const SLIP_R = 36;
const SLIP_TURN = 80;
const SLIP_FROM = 2.1;
/** Into the forge: the road turns in to run this far up from the strip's middle, round the anvil (a hairpin this tight) and back out. */
const FORGE_IN = 45;
const FINISH = 45;
const FORGE_X = 40;
const ANVIL_R = 32;
/** Keep It a Secret runs this far straight back out under the inside edge. */
const SECRET = 125;
/** The album runs at 143 beats a minute: the smith's hammers come down every two bars of it (items/hazards.ts HAMMER_PERIOD). */
const HAMMER_PERIOD = (8 * 60) / 143;

/** Which side of the strip the edge is on, +1 outside, -1 inside, at `t` round (0 to 4π: twice round, the twist at π and 3π). */
function side(t: number): number {
  const u = t % (2 * Math.PI);
  const flip = t >= 2 * Math.PI ? -1 : 1;
  const q = Math.max(-1, Math.min(1, (u - Math.PI) / TWIST));
  return -flip * Math.sin((q * Math.PI) / 2);
}
/** The chant's swing at `t` round: out for water and in for fire, a half-wave each zone; nothing outside it. */
function chant(t: number): number {
  if (t < CHANT_FROM || t > CHANT_TO) return 0;
  return CHANT * Math.sin((6 * Math.PI * (t - CHANT_FROM)) / (CHANT_TO - CHANT_FROM));
}
/** Where the edge is at `t` round. */
function edgeAt(t: number): [number, number] {
  const r = R + W * side(t) + chant(t);
  return [-r * Math.sin(t) * K, -r * Math.cos(t) * K];
}
/** The edge at `t` round, heading on round. */
function edge(t: number): Pose {
  const [x, z] = edgeAt(t);
  const [x1, z1] = edgeAt(t + 0.001);
  return { x, z, h: Math.atan2(x1 - x, z1 - z) };
}
/** How far round from `t` the edge is `len` metres away, straight across. */
function across(t: number, len: number): number {
  const [x0, z0] = edgeAt(t);
  let lo = t;
  let hi = t + 2;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    const [x, z] = edgeAt(mid);
    if (Math.hypot(x - x0, z - z0) < len) lo = mid;
    else hi = mid;
  }
  return lo;
}
/** The edge at `t`, heading straight across to where it is `len` metres on: a straight laid as a chord of the curve. */
function chord(t: number, len: number): Pose {
  const [x0, z0] = edgeAt(t);
  const [x1, z1] = edgeAt(across(t, len));
  return { x: x0, z: z0, h: Math.atan2(x1 - x0, z1 - z0) };
}
/** The start straight's length, kickers and all, and the finish straight's: the two together a chord across the bottom of the strip. */
const START_RUN = 80 * K + 14;
const START: Pose = offsetPose(chord(-0.21, START_RUN + FINISH * K), FINISH * K);

/**
 * Alien Metal (the Alien Metal Cup's first), after the album's title
 * track, 143 beats a minute on modular synths and a vocoder: fall asleep
 * under the stars, a summer breeze laced with PCP, and the chant over and
 * over, "water, fire" three times and "clouds and ice"; "transforming
 * through the slipstream", rebirth, reborn, interstellar reality; "astral
 * blacksmith, won't you gimme a fix", I promise I can keep it a secret.
 * Someone forged anew out of the elements into the alien metal. The world
 * is the astral blacksmith's forge floating among the stars: an iron floor
 * scattered with anvils and ingots, furnaces for the fire, quench tanks
 * steaming for the water, cloud and ice, the strip itself turning over the
 * forge and the blacksmith huge in the stars, hammering. The lap is the
 * edge of a Möbius strip: round the outside, the twist, round the inside,
 * the twist again, and it's where it started, one edge that's both. Out of
 * sleep under the stars (two kickers), the Summer Breeze's swells, then
 * the chant: Water, Fire, Water, Fire, Water, Fire, swinging out and in,
 * a hump of heat on each fire; Clouds and Ice swings out round the quench
 * pool; Transforming climbs onto a deck and over the twist, crossing the
 * road it'll come back on, and on round the inside high over the forge;
 * Rebirth flies off the end of it and leaps the quench water; Interstellar
 * Reality floats over swells under lighter gravity, back under the twist;
 * out on the outside edge again the Astral Blacksmith turns in to the
 * forge, sunk 6 m between iron walls under the deck, his hammers coming
 * down on the beat; Gimme a Fix, a hairpin round the anvil under the
 * turning strip; Keep It a Secret sneaks back out under the deck; and, as
 * the song ends where it began, home Under the Stars. 2.5 km, three laps,
 * three crossings, the first time round over the second each time.
 * Shortcut: the Slipstream, a straight tube of wind across the quench
 * pool, on every lap.
 */
export function buildAlienMetal(): TrackDef {
  const b = new TrackBuilder(START, 'Fall Asleep Under the Stars', { halfWidth: 11, surface: 'anvil' });
  b.scale = K;
  const to = (t: number) => b.hermiteTo(edge(t));
  b.straight(30).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(20);

  // Round the outside edge.
  b.section('Summer Breeze', { halfWidth: 10.5, surface: 'anvil' });
  b.mark('breeze');
  to(0.55);
  to(CHANT_FROM);

  // The chant: water, fire, water, fire, water, fire, swinging out and in.
  const zone = (CHANT_TO - CHANT_FROM) / 6;
  ['Water', 'Fire', 'Water', 'Fire', 'Water', 'Fire'].forEach((name, k) => {
    b.section(name, { halfWidth: 10, wallHeight: 1.2, surface: 'anvil' });
    b.mark(`chant${k}`);
    for (let j = 1; j <= 4; j++) to(CHANT_FROM + zone * (k + j / 4));
  });
  b.mark('chantEnd');

  // Clouds and ice: swinging out round the quench pool; the Slipstream runs straight across it.
  b.section('Clouds and Ice', { halfWidth: 10.5, surface: 'anvil' });
  b.mark('clouds');
  const pool = 4 * SLIP_R * Math.sin((SLIP_TURN * Math.PI) / 180) * K;
  b.hermiteTo(offsetPose(chord(SLIP_FROM, pool), -10 * K));
  b.straight(10);
  b.mark('slipFrom');
  b.arc(SLIP_R, -SLIP_TURN).arc(SLIP_R, 2 * SLIP_TURN).arc(SLIP_R, -SLIP_TURN);
  b.mark('slipTo');
  b.straight(10);

  // The twist: up onto a deck, over the road coming back round the inside, and on round the inside, high over the forge.
  b.section('Transforming', { halfWidth: 10, wallHeight: 1.2, surface: 'anvil', bridge: true });
  b.mark('twist');
  for (let t = across(SLIP_FROM, pool) + 0.3; t < 5.4; t += 0.2) to(t);
  b.mark('twistEnd');

  // Reborn: off the end of the deck, a crest, and a leap over the quench water.
  b.section('Rebirth', { halfWidth: 10, wallHeight: 1.2, surface: 'anvil' });
  b.mark('rebirth');
  to(5.65);
  const leap = 20 * K + 30;
  b.hermiteTo(chord(5.95, leap));
  b.straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20, 'water');
  b.elevate(0).straight(10);
  b.mark('rebirthEnd');

  // Round the inside edge, floating, and back under the twist.
  b.section('Interstellar Reality', { halfWidth: 10, wallHeight: 1.2, surface: 'anvil', gravity: FLOAT });
  b.mark('reality');
  for (let t = across(5.95, leap) + 0.3; t < 3 * Math.PI - 0.5; t += 0.25) to(t);
  b.mark('realityEnd');
  for (let t = 3 * Math.PI - 0.3; t < 3 * Math.PI + 0.7; t += 0.25) to(t);

  // Out on the outside edge again, the road turns in to the forge, sunk, under the deck, round the anvil.
  b.section('Astral Blacksmith', { halfWidth: 9, wallHeight: WALL, surface: 'anvil' });
  b.mark('smith');
  to(3 * Math.PI + 1.0);
  b.mark('forge');
  b.turnTo({ x: FORGE_X * K, z: FORGE_IN * K, h: -Math.PI / 2 }, 40);
  // Gimme a fix: round the anvil, the hammer's sparks flying.
  b.section('Gimme a Fix', { halfWidth: 9, wallHeight: WALL, surface: 'anvil' });
  b.mark('anvil');
  b.arc(ANVIL_R, -180);
  b.mark('anvilEnd');
  // Keep it a secret: back out under the deck, unseen.
  b.section('Keep It a Secret', { halfWidth: 9, wallHeight: WALL, surface: 'anvil' });
  b.mark('secret');
  b.straight(SECRET);
  b.mark('secretEnd');

  // And as the song ends where it began, under the stars again, home.
  b.section('Under the Stars', { halfWidth: 11, surface: 'anvil' });
  b.mark('home');
  b.turnTo(edge(3 * Math.PI + 2.0), 40);
  to(3 * Math.PI + 2.6);
  b.hermiteTo(offsetPose(START, -FINISH * K));
  b.section('Finish Straight', { halfWidth: 11, surface: 'anvil' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // A summer breeze over two swells; the chant's fire zones each a hump of heat, its water level between them.
  b.profile(m('breeze', 10), m('chant0'), (u) => SWELL * Math.sin(Math.PI * 2 * u) ** 2);
  for (const k of [1, 3, 5]) b.profile(m(`chant${k}`), m(k === 5 ? 'chantEnd' : `chant${k + 1}`), (u) => FIRE * Math.sin(Math.PI * u) ** 2);
  // The strip's edge over itself: up onto the deck over the twist, and on round the inside over the forge; then off the end of it.
  ease(b, m('slipTo'), 0, m('slipTo', 60), TIER);
  b.profile(m('slipTo', 60), m('twistEnd'), () => TIER, 10);
  plunge(b, m('twistEnd'), TIER, m('rebirth', 80), 0);
  // Interstellar reality: swells, floating, and level again to pass under the twist.
  b.profile(m('reality', 30), m('realityEnd'), (u) => SWELL * Math.sin(Math.PI * SWELLS * u) ** 2);
  // Down into the forge, sunk between its walls, under the deck twice, and up out of it.
  ease(b, m('smith', 10), 0, m('smith', 50), -DEPTH);
  b.profile(m('smith', 50), m('secretEnd', -5), () => -DEPTH, 10);
  ease(b, m('secretEnd', -5), -DEPTH, m('secretEnd', 35), 0);

  const main = b.finish(true);
  const slip = buildSlipstream(b.marks.slipFrom, b.marks.slipTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'alien-metal',
    name: 'Alien Metal',
    main,
    branches: [slip.branch],
    pits: [...b.pits, ...slip.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('rebirth', 95), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('home', 40), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['breeze', 'chant0', 'chant3', 'clouds', 'twist', 'rebirth', 'reality', 'realityEnd', 'smith', 'anvil', 'secret', 'home'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 260,
    landmarks: [
      { kind: 'anvilGate', ribbon: -1, s: 6 },
      { kind: 'anvilGate', ribbon: -1, s: at('forge', -2) },
      // The strip itself, turning over the forge in the middle of it all.
      { kind: 'mobiusStrip', ribbon: -1, s: at('anvil', 0), lateral: ANVIL_R },
      // The blacksmith in the stars beyond the twist, at his anvil.
      { kind: 'astralBlacksmith', ribbon: -1, s: at('twist', 20), lateral: 240 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('chant2', 10), count: 3 },
      { s: at('twist', 150), count: 4 },
      { s: at('reality', 120), count: 4 },
      { s: at('anvilEnd', 10), count: 3 },
      { s: slip.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      // The smith strikes a beat apart down the forge's way in, and once more on the way out.
      { kind: 'hammer', at: [at('forge', 60), at('forge', 95), at('forge', 130)], period: HAMMER_PERIOD },
      { kind: 'hammer', at: [at('anvil', 25), at('secret', 45)], period: HAMMER_PERIOD },
    ],
    theme: 'forge',
    music: { lap: 'alien-metal', finalLap: 'alien-metal-final-lap' },
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
 * The Slipstream: "transforming through the slipstream", a straight tube
 * of wind across the quench pool that Clouds and Ice swings round, no
 * rails. There every lap.
 */
function buildSlipstream(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'The Slipstream', { halfWidth: 6, surface: 'anvil' });
  b.straight(30);
  b.section('Quench Pool', { halfWidth: 4.5, surface: 'anvil' });
  b.elevate(0).straight(12).elevate(1);
  const pool = chord - 2 * b.s;
  const boxes = b.s + pool / 2;
  b.bridge(pool, 7, 'water');
  b.elevate(1).straight(12).elevate(0);
  b.section('The Slipstream', { halfWidth: 6, surface: 'anvil' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'The Slipstream', mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
  return { branch, pits: b.pits, boxes };
}
