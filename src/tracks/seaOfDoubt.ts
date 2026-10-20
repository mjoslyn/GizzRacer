import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: -70 * K, z: -165 * K, h: Math.PI / 2 };
const FINISH = 45;
/** The Sea of Doubt: the breakwater swings out round a whirlpool in three arcs of this radius and turn. */
const POOL_R = 34;
const POOL_TURN = 70;
/** The top of the trestle out over the sea stacks. */
const TRESTLE = 18;
/** How deep the Undertow Cave runs under the rock. */
const CAVE_DEPTH = 6;

/**
 * Sea of Doubt (the Phantom Island Cup's finale): a causeway over a black
 * sea at night in a gale. Waves break right across the Undertow Causeway
 * on a rhythm (two kickers between them), a wooden trestle climbs 18 m out
 * round the sea stacks and plunges back down, Spacesick Swells rolls like
 * the sea under it, a rail-less bridge runs out past Lighthouse Rock, the
 * road ducks 6 m down through the Undertow Cave and jumps the breakwater,
 * and the last bend swings round a whirlpool, which Riptide, a plank walk
 * with no rails, cuts straight across. Lightning strikes all the way round;
 * the gate is the ribs of a wreck.
 */
export function buildSeaOfDoubt(): TrackDef {
  const b = new TrackBuilder(START, 'Breakwater', { halfWidth: 11, surface: 'wet' });
  b.scale = K;
  b.straight(140).arc(50, -90);

  // Waves break across the causeway between two kickers.
  b.section('Undertow Causeway', { halfWidth: 10, surface: 'wet' });
  b.mark('causeway');
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(30);

  // A trestle out round the sea stacks, climbing, then the plunge.
  b.section('Sea Stack Trestle', { halfWidth: 9, wallHeight: 1.2, surface: 'boards', bridge: true });
  b.mark('trestle');
  b.arc(30, -90).straight(20).spiral(44, 26, 200).mark('stacks').spiral(26, 44, -200).mark('trestleTop').straight(50);
  b.section('Spacesick Swells', { halfWidth: 9.5, surface: 'wet' });
  b.mark('swells');
  b.arc(40, -90).straight(10).arc(32, -60).arc(32, 60);

  // Out past the lighthouse on a bridge with no rails.
  b.section('Lighthouse Rock', { halfWidth: 8, surface: 'boards' });
  b.mark('rock');
  b.elevate(0).straight(10).elevate(1.5);
  b.bridge(60, 30, 'water');
  b.elevate(1.5).straight(10).elevate(0);

  // Down through the cave and over the breakwater.
  b.section('Undertow Cave', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.mark('cave');
  b.arc(36, 90).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'water');
  b.elevate(0).straight(20);

  b.section('Sea of Doubt', { halfWidth: 9.5, surface: 'wet' });
  b.mark('doubt');
  b.straight(5);
  b.mark('ripFrom');
  b.arc(POOL_R, POOL_TURN).arc(POOL_R, -2 * POOL_TURN).arc(POOL_R, POOL_TURN);
  b.mark('ripTo');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'wet' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: the trestle and its plunge, the swells, the cave.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(30, m('causeway', -20), (u) => 2 * Math.sin(2 * Math.PI * u) ** 2);
  ease(b, m('trestle'), 0, m('trestleTop'), TRESTLE);
  plunge(b, m('trestleTop'), TRESTLE, m('trestleTop', 75), 0);
  ease(b, m('swells', 10), 0, m('swells', 35), 5);
  plunge(b, m('swells', 35), 5, m('swells', 60), 0);
  b.profile(m('swells', 70), m('rock', -10), (u) => 3 * Math.sin(Math.PI * u) ** 2);
  ease(b, m('cave', 10), 0, m('cave', 30), -CAVE_DEPTH);
  ease(b, m('cave', 30), -CAVE_DEPTH, m('ramp'), 0);
  b.profile(m('ripTo', 40), m('finish', -10), (u) => 4 * Math.sin(Math.PI * u) ** 2);

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
      { s: at('trestleTop', 4), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('cave', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['causeway', 'trestle', 'swells', 'rock', 'cave', 'doubt'].map((k) => b.marks[k].s / main.length),
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
      { kind: 'lightning', at: [100, 130, at('swells', 20), at('swells', 90), at('doubt', 15)], period: 4.5 },
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
  const branch: BranchDef = { name: 'Riptide', mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
  return { branch, pits: b.pits, boxes };
}
