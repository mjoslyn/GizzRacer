import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.0;
const START: Pose = { x: -125 * K, z: 82 * K, h: (3 * Math.PI) / 4 };
const FINISH = 45;
/** A waypoint, in builder units. */
const wp = (x: number, z: number, h: number): Pose => ({ x: x * K, z: z * K, h });
/** Top of the Hill: up the street to a sharp crest this high, and over. */
const CREST = 7;
/** Two important people: two hairpins this tight. */
const PIN_R = 24;
/** Flunk or Fail: this many kinks, each the other way from the last. */
const KINKS = 4;
/** Something Better to Do: the main road swings out round the park in three arcs of this radius and turn; the shortcut cuts straight across through the skate park. */
const PARK_R = 42;
const PARK_TURN = 70;
/** How deep Presents and Sack is sunk between its fences. */
const DEPTH = 6;
const WALL = 6;
/** Then I Hear God Call: a turn and an eighth round a circle this wide, climbing to this height over its own road in. */
const CALL_R = 48;
const CALL_TURN = 405;
const CALL = 11;
/** All My Hate Is Gone: up into the light, this high, over rolling swells this high. */
const LIGHT = 15;
const SWELLS = 3;
const SWELL = 2.5;

/**
 * God Is Calling Me Back Home (the Float Along – Fill Your Lungs Cup's
 * second), after the album's quiet song that explodes: soft acoustics and
 * compressed vocals, then a distorted, high-flying second half. Its words
 * are morbid, murder out of boredom against biblical language: meet me at
 * the house on the top of the hill, two important people "I'm ready to
 * kill", I'll just flunk or fail so give me something better to do; Santa's
 * on the roof with his presents and sack, a blade in one hand and an axe in
 * the other; then I hear God call, and all my hate is gone, calling me back
 * home. The world is an Australian suburb on a hill at Christmas, high
 * summer at dusk: weatherboard houses, gum trees, fairy lights and
 * inflatable Santas, and the house on the top of the hill with Santa on its
 * roof. The lap is a figure of eight, quiet then loud as the song is. The
 * quiet lobe is low and narrow, the streets at the foot of the hill: Meet
 * Me at the House (two speed humps for kickers), up the street to the Top
 * of the Hill's sharp crest, Two Important People's two hairpins, Flunk or
 * Fail's kinks past the school, Something Better to Do round the park,
 * Santa's on the Roof, and Presents and Sack sunk 6 m down a lane between
 * the back fences, Santa's presents dropping off the roofs onto the road;
 * Blade and Axe, two chops. Then it explodes: Then I Hear God Call climbs a
 * turn and an eighth over its own road in, and All My Hate Is Gone flies a
 * high deck right across the lap over Meet Me at the House, up into the
 * light round the house on the top of the hill, over rolling swells; and
 * Calling Me Back Home falls away off the deck and leaps the creek, home.
 * Shortcut: Something Better to Do, straight across the park through the
 * skate park and over its empty pool, from lap 2.
 */
export function buildGodIsCalling(): TrackDef {
  const b = new TrackBuilder(START, 'Meet Me at the House', { halfWidth: 10, surface: 'bitumen' });
  b.scale = K;
  // Under the deck where the road comes back over, and two speed humps, for kickers.
  b.straight(95).mark('kick1').kicker().straight(25).mark('kick2').kicker().straight(20);

  // Up the street to the top of the hill, a sharp crest, and down the other side.
  b.section('Top of the Hill', { halfWidth: 9, surface: 'bitumen' });
  b.mark('hill');
  b.straight(30).arc(100, -45).straight(40);
  b.mark('hillEnd');

  // Two important people: two hairpins, down and back.
  b.section('Two Important People', { halfWidth: 8, wallHeight: 1.2, surface: 'bitumen' });
  b.mark('two');
  b.arc(PIN_R, 180).straight(60).arc(PIN_R, -180);
  b.mark('twoEnd');
  b.straight(20);

  // Flunk or fail: kinks past the school, and round the corner.
  b.section('Flunk or Fail', { halfWidth: 7.5, wallHeight: 1.2, surface: 'bitumen' });
  b.mark('flunk');
  b.arc(30, 35);
  for (let k = 0; k < KINKS - 2; k++) b.arc(30, k % 2 ? 70 : -70);
  b.arc(30, KINKS % 2 ? 35 : -35);
  b.mark('flunkEnd');
  b.arc(45, 180);

  // Something better to do: round the park; the shortcut cuts straight across it.
  b.section('Something Better to Do', { halfWidth: 10, surface: 'bitumen' });
  b.mark('better');
  b.straight(10);
  b.mark('cutFrom');
  b.arc(PARK_R, PARK_TURN).arc(PARK_R, -2 * PARK_TURN).arc(PARK_R, PARK_TURN);
  b.mark('cutTo');
  b.straight(10);

  b.section("Santa's on the Roof", { halfWidth: 9, surface: 'bitumen' });
  b.mark('santa');
  b.straight(70);
  b.mark('santaEnd');

  // Presents and sack: down a lane between the back fences, sunk, the presents dropping off the roofs.
  b.section('Presents and Sack', { halfWidth: 9, wallHeight: WALL, surface: 'bitumen' });
  b.mark('sack');
  b.straight(30).arc(70, 90).straight(30);
  b.mark('sackEnd');
  b.straight(10);

  // One hand with a blade and the other an axe: two chops.
  b.section('Blade and Axe', { halfWidth: 8.5, wallHeight: 1.2, surface: 'bitumen' });
  b.mark('blade');
  b.arc(22, -60).arc(22, 120).arc(22, -60);
  b.mark('bladeEnd');
  b.straight(10);

  // Then I hear God call: the song explodes, and the road climbs round a loop and back across its own road in, and round again.
  b.section('Then I Hear God Call', { halfWidth: 9.5, wallHeight: 1.2, surface: 'bitumen', bridge: true });
  b.mark('call');
  b.arc(CALL_R, CALL_TURN);
  b.mark('callEnd');

  // All my hate is gone: a high deck right across the lap, over Meet Me at the House, up into the light.
  b.section('All My Hate Is Gone', { halfWidth: 10.5, wallHeight: 1.2, surface: 'bitumen', bridge: true });
  b.mark('hate');
  b.arc(160, -18).arc(160, 36).arc(160, -18);
  b.turnTo(wp(80, 160, Math.PI / 4), 60);
  b.mark('light');
  b.arc(75, -135);
  b.mark('swells');
  b.straight(165);
  b.mark('hateEnd');

  // Calling me back home: off the deck, round and down, and a leap over the creek.
  b.section('Calling Me Back Home', { halfWidth: 10.5, surface: 'bitumen' });
  b.mark('home');
  b.arc(80, -135);
  b.mark('creek');
  b.straight(5).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20, 'water');
  b.elevate(0).straight(8);
  b.mark('creekEnd');
  b.turnTo(offsetPose(START, -FINISH * K), 60);
  b.section('Finish Straight', { halfWidth: 10, surface: 'bitumen' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // Quiet: the streets at the foot of the hill, over its shoulder and down a lane sunk between the fences.
  const crest = (m('hill', 10) + m('hillEnd', -10)) / 2;
  b.profile(m('hill', 10), crest, (u) => CREST * u ** 1.5);
  b.profile(crest, m('hillEnd', -10), (u) => CREST * (1 - u) ** 1.5);
  ease(b, m('sack', 5), 0, m('sack', 40), -DEPTH);
  b.profile(m('sack', 40), m('sackEnd', -30), () => -DEPTH, 10);
  ease(b, m('sackEnd', -30), -DEPTH, m('sackEnd', 10), 0);
  // Loud: up the call's spiral onto the deck, up into the light, rolling over the swells, and off it, home.
  ease(b, m('call', 10), 0, m('callEnd'), CALL);
  b.profile(m('callEnd'), m('hate', 200), () => CALL, 10);
  ease(b, m('hate', 200), CALL, m('light', 60), LIGHT);
  b.profile(m('light', 60), m('swells'), () => LIGHT, 10);
  b.profile(m('swells'), m('hateEnd'), (u) => LIGHT + SWELL * Math.sin(Math.PI * SWELLS * u) ** 2);
  plunge(b, m('hateEnd'), LIGHT, m('creek', -15), 0);

  const main = b.finish(true);
  const park = buildSkatePark(b.marks.cutFrom, b.marks.cutTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'god-is-calling',
    name: 'God Is Calling Me Back Home',
    main,
    branches: [park.branch],
    pits: [...b.pits, ...park.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('twoEnd', 5), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('bladeEnd', 2), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['hill', 'two', 'flunk', 'better', 'santa', 'sack', 'blade', 'call', 'hate', 'light', 'home'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 340,
    landmarks: [
      { kind: 'heavenGate', ribbon: -1, s: 6 },
      { kind: 'heavenGate', ribbon: -1, s: at('light', 20) },
      { kind: 'hillHouse', ribbon: -1, s: at('swells', 67), lateral: 108 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('two', 90), count: 3 },
      { s: at('santa', 10), count: 4 },
      { s: at('call', 20), count: 3 },
      { s: at('swells', 20), count: 4 },
      { s: park.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'presents', at: [at('sack', 55), at('sack', 95), at('sack', 140)], period: 4.8 },
      { kind: 'presents', at: [at('santa', 45)], period: 5.2 },
    ],
    theme: 'godcall',
    music: { lap: 'god-is-calling', finalLap: 'god-is-calling-final-lap' },
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
 * Something Better to Do: straight across the park the main road swings
 * round, through the skate park, off a ramp and over its empty pool. From
 * lap 2; on lap 1 it isn't there, and there's nothing but the pool.
 */
function buildSkatePark(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Something Better to Do', { halfWidth: 6, surface: 'bitumen' });
  b.straight(40);
  b.section('The Skate Park', { halfWidth: 5, surface: 'bitumen' });
  b.elevate(0).rise(18, 3);
  const pool = 12;
  b.gap(pool, 14);
  const boxes = b.s + 12;
  b.elevate(0);
  b.section('Something Better to Do', { halfWidth: 6, surface: 'bitumen' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Something Better to Do', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2, 'final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
