import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1;
const D = Math.PI / 180;
/**
 * The mine: an open pit, and the terraces stepping down round it, three
 * benches, each a hairpin's width inside the one above: the pit's middle,
 * the hairpins' radius, and the outer bench's.
 */
const PIT_X = -50;
const PIT_Z = 34;
const HAIR = 22;
const OUTER = 170;
const MID = OUTER - 2 * HAIR;
const FLOOR = MID - 2 * HAIR;
/** Where on the rim the road starts down (degrees clockwise from north on the plot), and how far round each bench runs. */
const ENTRY = -30;
const BENCH1 = 175;
const BENCH2 = 120;
const BENCH3 = 185;
/** The ore conveyor runs out of the pit's middle this way, straight back up over the benches. */
const RAY = 80;
/** How deep each bench is sunk: the first in terraces this deep, then the middle bench, and the pit floor. */
const TERRACE = 2;
const BENCH1_DEPTH = 4;
const BENCH2_DEPTH = 6;
const DEPTH = 8;
const WALL = 6;
/** The conveyor's head, this high over the rim, where the ore is tipped off it and you fly off with it. */
const HEAD = 12;
/** How far the conveyor runs on at its head before it tips you off. */
const HEAD_RUN = 40;
/** No Ill Will swings round the open pit's edge in three arcs of this radius and turn; Ill Will dives straight across it. */
const WILL_R = 30;
const WILL_TURN = 82;
const WILL_ALONG = 4 * WILL_R * Math.sin(WILL_TURN * D);
/** Level Five: esses, this many, this tight. */
const ESSES = 5;
const ESS_R = 50;

/** A pose on a bench of radius `r` at `deg` round it, heading round clockwise (on the plot). */
const bench = (r: number, deg: number): Pose => ({ x: (PIT_X + r * Math.sin(deg * D)) * K, z: (PIT_Z + r * Math.cos(deg * D)) * K, h: (deg + 90) * D });
/** A pose `r` out from the pit's middle along the conveyor's line, heading out along it. */
const ray = (r: number): Pose => ({ x: (PIT_X + r * Math.sin(RAY * D)) * K, z: (PIT_Z + r * Math.cos(RAY * D)) * K, h: RAY * D });
const START: Pose = { x: -190 * K, z: -86 * K, h: 0 };
const FINISH = 45;

/**
 * Kill for the Steel (the Alien Metal Cup's second), after the song Joey
 * called weird IDM with heavy Miami bass in it: four lines, sung over and
 * over, "we don't wish death upon you", no bad luck, no ill will, "but we
 * will kill for the steel", and then the drop into Level 5, "we're on level
 * five". The cup's alien metal, forged, is fought over here. The world is
 * an open-cut mine on an alien moon under the cup's one night: terraces
 * stepping down into the pit, ore trains, electromagnet cranes swinging over
 * the haul roads, rival rigs' searchlights, girders stacked like trophies.
 * The lap goes down the mine and back up out of it on the ore conveyor:
 * along the rim (two kickers, esses past the girder stacks), Upon You
 * round the first terrace, stepping down; No Bad Luck, a hairpin down to
 * the bench below and back the other way, a hairpin down again and round
 * the pit floor, sunk 8 m, the cranes' magnets swinging across it; No Ill
 * Will climbing out round the edge of the open pit in the middle; then
 * Kill for the Steel, up the ore conveyor straight back over all three
 * benches, 12 m up at its head, tipped off it and a leap over the crusher;
 * and Level Five, esses round the mine home. Shortcut: Ill Will, straight
 * down the pit wall on a rail-less ore chute and up the other side, from
 * the second lap.
 */
export function buildKillForTheSteel(): TrackDef {
  const b = new TrackBuilder(START, "We Don't Wish Death", { halfWidth: 11, surface: 'ore' });
  b.scale = K;
  b.straight(30).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(20);
  // Along the rim, weaving between the girder stacks.
  b.mark('girders');
  b.arc(45, -35).arc(45, 70).arc(45, -35);
  b.hermiteTo(bench(OUTER, ENTRY));

  // Down the mine: round the first terrace, a hairpin down to the bench below and back, a hairpin down again to the floor.
  b.section('Upon You', { halfWidth: 9.5, wallHeight: 1.2, surface: 'ore' });
  b.mark('upon');
  b.arc(OUTER, BENCH1);
  b.mark('uponEnd');
  b.section('No Bad Luck', { halfWidth: 9.5, wallHeight: WALL, surface: 'ore' });
  b.mark('luck');
  b.arc(HAIR, 180);
  b.mark('mid');
  b.arc(MID, -BENCH2);
  b.mark('midEnd');
  b.arc(HAIR, -180);
  b.mark('floor');
  b.arc(FLOOR, BENCH3);
  b.mark('floorEnd');

  // Up out of the floor and round the edge of the open pit.
  b.section('No Ill Will', { halfWidth: 10, surface: 'ore' });
  b.mark('will');
  b.hermiteTo(ray(-WILL_ALONG / 2 - 20));
  b.straight(10);
  b.mark('willFrom');
  b.arc(WILL_R, -WILL_TURN).arc(WILL_R, 2 * WILL_TURN).arc(WILL_R, -WILL_TURN);
  b.mark('willTo');

  // Up the ore conveyor, straight back over the benches, and tipped off its head over the crusher.
  b.section('Kill for the Steel', { halfWidth: 10, wallHeight: 1.2, surface: 'ore', bridge: true });
  b.mark('kill');
  b.straight(OUTER - WILL_ALONG / 2 + 30);
  b.mark('head');
  b.straight(HEAD_RUN);
  b.arc(45, 90);
  b.straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20);
  b.elevate(0).straight(15);
  b.mark('leapEnd');

  b.section('Level Five', { halfWidth: 10.5, wallHeight: 1.2, surface: 'ore' });
  b.mark('five');
  b.arc(50, 25).arc(50, -25);
  b.arc(50, 95);
  b.mark('esses');
  for (let k = 0; k < ESSES; k++) b.arc(ESS_R, k % 2 ? 50 : -50);
  b.mark('essesEnd');
  b.turnTo(offsetPose(START, -FINISH * K), 45);
  b.section('Finish Straight', { halfWidth: 11, surface: 'ore' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // Terraces stepping down: the first bench in two steps, the hairpins down to the next, and the floor.
  steps(b, m('upon', 15), 0, m('uponEnd'), -BENCH1_DEPTH, BENCH1_DEPTH / TERRACE);
  ease(b, m('luck'), -BENCH1_DEPTH, m('mid'), -BENCH2_DEPTH);
  b.profile(m('mid'), m('midEnd'), () => -BENCH2_DEPTH, 10);
  ease(b, m('midEnd'), -BENCH2_DEPTH, m('floor'), -DEPTH);
  b.profile(m('floor'), m('floorEnd'), () => -DEPTH, 10);
  ease(b, m('floorEnd'), -DEPTH, m('willFrom', -5), 0);
  // The conveyor: up from the open pit's edge over the three benches to its head, and over the top.
  ease(b, m('kill', 10), 0, m('head'), HEAD);
  b.profile(m('head'), m('head', 15), () => HEAD, 5);
  plunge(b, m('head', 15), HEAD, m('ramp'), 0);

  const main = b.finish(true);
  const chute = buildIllWill(b.marks.willFrom, b.marks.willTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'kill-for-the-steel',
    name: 'Kill for the Steel',
    main,
    branches: [chute.branch],
    pits: [...b.pits, ...chute.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('will', 30), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('esses', 5), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['girders', 'upon', 'uponEnd', 'mid', 'floor', 'will', 'kill', 'five', 'esses'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 270,
    landmarks: [
      { kind: 'steelGate', ribbon: -1, s: 6 },
      { kind: 'steelGate', ribbon: -1, s: at('floor', -2) },
      // The mining rig on the rim outside the top terrace, over the whole mine.
      { kind: 'mineRig', ribbon: -1, s: at('upon', 240), lateral: 120 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('upon', 60), count: 4 },
      { s: at('mid', 80), count: 3 },
      { s: at('floor', 90), count: 3 },
      { s: at('five', 30), count: 4 },
      { s: chute.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      // The cranes over the pit floor, swinging their magnets across it, each the other way from the one before.
      { kind: 'magnets', at: [at('floor', 50), at('floor', 120), at('floor', 190)], period: 4.6 },
      { kind: 'magnets', at: [at('mid', 150)], period: 5 },
    ],
    theme: 'steelwar',
    music: { lap: 'kill-for-the-steel', finalLap: 'kill-for-the-steel-final-lap' },
  };
}

/** Eases the road's height from y0 at arc length s0 to y1 at s1. */
function ease(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * u * u * (3 - 2 * u));
}

/** Steps the road's height from y0 at s0 to y1 at s1 in `n` terraces: each level a while, then eased down to the next. */
function steps(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number, n: number): void {
  b.profile(s0, s1, (u) => {
    const k = Math.min(n - 1, Math.floor(u * n));
    const f = Math.max(0, Math.min(1, (u * n - k - 0.6) / 0.4));
    return y0 + ((y1 - y0) * (k + f * f * (3 - 2 * f))) / n;
  });
}

/** Drops the road from y0 at s0 to y1 at s1, falling away at once over the top (a crest to fly off) and easing out at the bottom. */
function plunge(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * Math.sin((Math.PI * u) / 2));
}

/** Ill Will's chute: how deep it dives down the open pit's wall, over how long it goes down and comes up; how long the pit is, and how deep. */
const CHUTE_DEPTH = 5;
const CHUTE_RAMP = 18;
const PIT_MOUTH = 46;
const PIT_DEEP = 24;

/**
 * Ill Will: an ore chute straight down the wall of the open pit No Ill
 * Will swings round, along its bottom and up the other side, no rails.
 * It's opened from the second lap; on the first there's nothing over the
 * pit.
 */
function buildIllWill(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Ill Will', { halfWidth: 6, surface: 'ore' });
  b.straight((chord - PIT_MOUTH) / 2);
  b.section('Down the Pit Wall', { halfWidth: 5, surface: 'ore' });
  const s0 = b.s;
  const boxes = s0 + PIT_MOUTH / 2;
  b.bridge(PIT_MOUTH, 0, undefined, PIT_DEEP);
  b.section('Ill Will', { halfWidth: 6, surface: 'ore' });
  b.straight(chord - b.s);
  b.profile(s0, s0 + CHUTE_RAMP, (u) => -CHUTE_DEPTH * u * u * (3 - 2 * u));
  b.profile(s0 + CHUTE_RAMP, s0 + PIT_MOUTH - CHUTE_RAMP, () => -CHUTE_DEPTH, 10);
  b.profile(s0 + PIT_MOUTH - CHUTE_RAMP, s0 + PIT_MOUTH, (u) => -CHUTE_DEPTH * (1 - u * u * (3 - 2 * u)));
  const branch: BranchDef = { name: 'Ill Will', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2, 'final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
