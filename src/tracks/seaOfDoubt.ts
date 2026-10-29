import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 0.9;
const START: Pose = { x: 50 * K, z: 290 * K, h: Math.PI / 2 };
const wp = (x: number, z: number, h: number): Pose => ({ x: x * K, z: z * K, h });
/**
 * The breakers: across the middle of the map the lap is a trochoid, the
 * curve the water in a deep-sea wave runs along, drawn long enough to loop,
 * so the road curls right over itself as a breaker does: this far along the
 * sea for each radian of the wave, this high and low, its middle here, the
 * road running west along it.
 */
const ROLL = 40;
const SWELL = 88;
const SEA_X = 80;
const SEA_Z = 160;
/** Where the trough between the curls is, for the road home to cross it. */
const TROUGH_X = SEA_X - ROLL * Math.PI;
/** A point on the wave at angle `t`, heading along it. */
function wave(t: number): Pose {
  const dx = -(ROLL - SWELL * Math.cos(t));
  const dz = -SWELL * Math.sin(t);
  return { x: (SEA_X - (ROLL * t - SWELL * Math.sin(t))) * K, z: (SEA_Z + SWELL * Math.cos(t)) * K, h: Math.atan2(dx, dz) };
}
const WAVE_STEP = Math.PI / 8;
/** Waypoints along each curl, trough to trough, and along the whole wave: two curls. */
const CURL_STEPS = 16;
const WAVE_STEPS = 32;
const FINISH = 45;
/** The Sea of Doubt: the breakwater swings out round a whirlpool in three arcs of this radius and turn. */
const POOL_R = 42;
const POOL_TURN = 70;
/** How high each breaker's curl climbs, the Sea Stack Trestle and then Spacesick Swells, by the time it comes back over itself. */
const TRESTLE = 18;
const CREST = 10;
/** The deck the road home takes over the trough between the curls. */
const DECK = 12;
/** The wave angle either side of a curl's middle where the road crosses itself. */
const CROSS_T = 2;
/** How deep the Undertow Cave runs under the rock. */
const CAVE_DEPTH = 6;

/**
 * Sea of Doubt (the Phantom Island Cup's finale): a causeway over a black
 * sea at night in a gale, and a lap the sea has hold of. Along the top, the
 * Breakwater and the Undertow Causeway, waves breaking right across it on a
 * rhythm (two kickers between them), then round and into the breakers:
 * across the middle of the map the road runs along a wave, a trochoid, and
 * curls right over itself twice as it goes. The Sea Stack Trestle climbs
 * round the first curl on a deck and comes back over itself 18 m up, then
 * plunges into the trough; Spacesick Swells rolls up round the second and
 * over itself at 10 m. Down the far side, a rail-less bridge out past
 * Lighthouse Rock, the Undertow Cave sunk 6 m and a jump over the
 * breakwater, the last bend round a whirlpool, which Riptide, a plank walk
 * with no rails, cuts straight across; and home Over the Breakers, a deck
 * straight up across the sea and over the trough between the curls.
 * Lightning strikes all the way round; the gate is the ribs of a wreck.
 */
export function buildSeaOfDoubt(): TrackDef {
  const b = new TrackBuilder(START, 'Breakwater', { halfWidth: 11, surface: 'wet' });
  b.scale = K;
  b.straight(105);

  // Waves break across the causeway between two kickers.
  b.section('Undertow Causeway', { halfWidth: 10, surface: 'wet' });
  b.mark('causeway');
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(48);
  b.mark('causewayEnd');
  b.turnTo(wave(-Math.PI), 90);

  // The breakers: the road rolls along the sea as a wave does, and curls right over itself, twice.
  b.section('Sea Stack Trestle', { halfWidth: 9, wallHeight: 1.2, surface: 'boards', bridge: true });
  b.mark('trestle').mark('w0');
  for (let k = 1; k <= CURL_STEPS; k++) b.hermiteTo(wave(-Math.PI + k * WAVE_STEP)).mark(`w${k}`);
  b.section('Spacesick Swells', { halfWidth: 9.5, wallHeight: 1.2, surface: 'wet', bridge: true });
  b.mark('swells');
  for (let k = CURL_STEPS + 1; k <= WAVE_STEPS; k++) b.hermiteTo(wave(-Math.PI + k * WAVE_STEP)).mark(`w${k}`);
  b.mark('swellsEnd');
  b.arc(50, -90);

  // Out past the lighthouse on a bridge with no rails.
  b.section('Lighthouse Rock', { halfWidth: 8, surface: 'boards' });
  b.mark('rock');
  b.elevate(0).straight(10).elevate(1.5);
  b.bridge(60, 30, 'water');
  b.elevate(1.5).straight(10).elevate(0);

  // Down through the cave and over the breakwater.
  b.section('Undertow Cave', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.mark('cave');
  b.straight(70).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'water');
  b.elevate(0).straight(20);
  b.arc(50, -90);

  b.section('Sea of Doubt', { halfWidth: 9.5, surface: 'wet' });
  b.mark('doubt');
  b.straight(5);
  b.mark('ripFrom');
  b.arc(POOL_R, POOL_TURN).arc(POOL_R, -2 * POOL_TURN).arc(POOL_R, POOL_TURN);
  b.mark('ripTo');
  b.straight(5);
  // Home over the breakers: up across the sea on a deck, over the trough between the curls.
  b.turnTo(wp(TROUGH_X, -100, 0), 50);
  b.section('Over the Breakers', { halfWidth: 10, wallHeight: 1.2, surface: 'boards', bridge: true });
  b.mark('over');
  b.straight(300);
  b.mark('overEnd');
  b.turnTo(offsetPose(START, -FINISH * K), 50);
  b.section('Finish Straight', { halfWidth: 11, surface: 'wet' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: swells on the causeway, each breaker climbing round its curl and over itself and plunging off, the cave.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(30, m('causeway', -20), (u) => 2 * Math.sin(2 * Math.PI * u) ** 2);
  /** Arc length at wave angle `t`, between the waypoints laid every WAVE_STEP. */
  const sOf = (t: number) => {
    const at = Math.min(WAVE_STEPS, Math.max(0, (t + Math.PI) / WAVE_STEP));
    const k = Math.min(WAVE_STEPS - 1, Math.floor(at));
    const f = at - k;
    return m(`w${k}`) + (m(`w${k + 1}`) - m(`w${k}`)) * f;
  };
  for (const [mid, top] of [[0, TRESTLE], [2 * Math.PI, CREST]]) {
    ease(b, sOf(mid - CROSS_T - 0.2), 0, sOf(mid + CROSS_T), top);
    b.profile(sOf(mid + CROSS_T), sOf(mid + CROSS_T + 0.3), () => top, 10);
    plunge(b, sOf(mid + CROSS_T + 0.3), top, sOf(mid + Math.PI - 0.15), 0);
  }
  ease(b, m('over', 10), 0, m('over', 100), DECK);
  b.profile(m('over', 100), m('over', 200), () => DECK, 10);
  plunge(b, m('over', 200), DECK, m('overEnd'), 0);
  ease(b, m('cave', 5), 0, m('cave', 30), -CAVE_DEPTH);
  ease(b, m('cave', 30), -CAVE_DEPTH, m('ramp'), 0);
  b.profile(m('ripTo', 15), m('over'), (u) => 3 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const rip = buildRiptide(b.marks.ripFrom, b.marks.ripTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'sea-of-doubt',
    name: 'Sea of Doubt',
    main,
    branches: [rip.branch],
    pits: [...b.pits, ...rip.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('w14', 0), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('cave', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['causeway', 'trestle', 'w8', 'swells', 'w24', 'rock', 'cave', 'doubt', 'over'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'wreckGate', ribbon: -1, s: 6 },
      { kind: 'lighthouse', ribbon: -1, s: at('rock', 30) },
      { kind: 'wreckGate', ribbon: -1, s: at('doubt', 2) },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('causeway', 20), count: 4 },
      { s: at('swells', 40), count: 3 },
      { s: at('cave', 50), count: 3 },
      { s: at('doubt', 45), count: 4 },
      { s: rip.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'waves', at: [at('causeway', 25), at('causeway', 60), at('causeway', 118)], period: 3.4 },
      { kind: 'lightning', at: [at('causeway', -70), at('causeway', -35), at('swells', 20), at('swells', 90), at('doubt', 15)], period: 4.5 },
    ],
    theme: 'doubt',
    music: { lap: 'sea-of-doubt', finalLap: 'sea-of-doubt-final-lap' },
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
 * Riptide: a plank walk with no rails, straight across the whirlpool the
 * last bend swings round. Slip off it and the sea has you.
 */
function buildRiptide(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Riptide', { halfWidth: 6, surface: 'wet' });
  b.straight(30);
  b.section('Riptide Planks', { halfWidth: 4, surface: 'boards' });
  b.elevate(0).straight(12).elevate(1);
  const pool = chord - 2 * b.s;
  const boxes = b.s + pool / 2;
  b.bridge(pool, 7, 'water');
  b.elevate(1).straight(12).elevate(0);
  b.section('Riptide', { halfWidth: 6, surface: 'wet' });
  b.straight(chord - b.s);
  // The tide comes in over the last lap: the planks are under water.
  const branch: BranchDef = { name: 'Riptide', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [1, 2], shut: { kind: 'flood' } };
  return { branch, pits: b.pits, boxes };
}
