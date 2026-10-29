import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.0;
/** A waypoint on the swirl, in builder units. */
const wp = (x: number, z: number, h: number): Pose => ({ x: x * K, z: z * K, h });
const START: Pose = wp(240, -110, 0);
const FINISH = 45;
/** The radius of each quarter turn of the swirl, round the outside and then the inner turn. */
const TURNS = [170, 110, 170, 100, 80];
/** The Swirl at the eye: a coil this tight, turning this far, from the bottom of the Fuzz Pit up to the top. */
const SWIRL_R = 40;
const SWIRL_TURN = 528;
const SWIRL_TOP = 14;
/** How far down the far side the Wall of Sound takes to fall from the top to the ground. */
const DROP = 80;
/** How deep the Fuzz Pit is sunk: further down than any other cut in the cup. */
const DEPTH = 8;
/** The Needle Bend: the road swings out round a great meter in three arcs of this radius and turn. */
const BEND_R = 34;
const BEND_TURN = 70;
/** The speaker stacks walling Amp Alley. */
const WALL = 6;
/** The square wave: how tall each clipped tooth stands, and how wide its top and the gap after it. */
const TOOTH_H = 30;
const TOOTH_W = 36;
/** The radius of each right-angled corner of the square wave. */
const CORNER_R = 14;

/**
 * I'm in Your Mind Fuzz (the Mind Fuzz Cup's finale), after the song the
 * suite ends on, the first one again with the fuzz turned up: a world gone
 * to static, purple and green, fuzz growing on everything, the album's
 * swirl turning in the sky. The lap is that swirl: it winds in round the
 * outside, sinks into the Fuzz Pit on its inner turn, coils up out of the
 * pit at the eye and flies straight out over its own turns. Up Overdrive
 * Straight (two kickers) under a gate of amp stacks and round Feedback
 * Bend; across the top, Amp Alley is a square wave, the fuzz clipping a
 * wave flat: two teeth, each straight up, across and straight down,
 * between speaker stacks 6 m tall. Fuzz Wire round the far side, the
 * Distortion Leap, and the Needle Bend swinging out round a meter along
 * the bottom, which Into the Red cuts straight across on the final lap
 * only. Then Static, and the inner turn sunk 8 m in the Fuzz Pit, patches
 * of fuzz pulsing on the road in both walled stretches and the eye from
 * the start of the suite opening over the pit again. At the eye the Swirl
 * coils up out of the pit, a turn and a half to 14 m, over itself; the
 * Wall of Sound flies off the top straight out over the pit and Overdrive
 * Straight, and drops away down the far side into the Feedback Loop, round
 * and back onto the straight.
 */
export function buildImInYourMindFuzz(): TrackDef {
  const b = new TrackBuilder(START, 'Overdrive Straight', { halfWidth: 11, surface: 'fuzz' });
  b.scale = K;
  b.straight(25).mark('kick1').kicker().straight(25).mark('kick2').kicker().straight(70);

  // Round the outside of the swirl, winding in.
  b.section('Feedback Bend', { halfWidth: 9.5, wallHeight: 1.2, surface: 'fuzz' });
  b.mark('feedback');
  b.arc(TURNS[0], -90);
  // The square wave, clipped teeth standing out of the swirl, between speaker stacks.
  b.section('Amp Alley', { halfWidth: 9, wallHeight: WALL, surface: 'fuzz' });
  b.mark('amps');
  b.straight(15);
  for (let tooth = 0; tooth < 2; tooth++) {
    if (tooth) b.straight(TOOTH_W);
    b.arc(CORNER_R, 90).straight(TOOTH_H).arc(CORNER_R, -90).straight(TOOTH_W).arc(CORNER_R, -90).straight(TOOTH_H).arc(CORNER_R, 90);
  }
  b.straight(15);
  b.mark('ampsEnd');
  b.section('Fuzz Wire', { halfWidth: 9.5, wallHeight: 1.2, surface: 'fuzz' });
  b.mark('wire');
  b.arc(TURNS[1], -90);
  b.straight(15);

  b.section('Distortion Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'fuzz' });
  b.mark('leap');
  b.straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30);
  b.elevate(0).straight(20);
  b.mark('leapEnd');
  b.arc(TURNS[2], -90);

  b.section('Needle Bend', { halfWidth: 9.5, surface: 'fuzz' });
  b.mark('bend');
  b.straight(5);
  b.mark('redFrom');
  b.arc(BEND_R, BEND_TURN).arc(BEND_R, -2 * BEND_TURN).arc(BEND_R, BEND_TURN);
  b.mark('redTo');
  b.straight(5);

  // The inner turn, down into the Fuzz Pit.
  b.section('Static', { halfWidth: 9.5, wallHeight: 1.2, surface: 'fuzz' });
  b.mark('static');
  b.arc(TURNS[3], -45);
  b.section('The Fuzz Pit', { halfWidth: 9, wallHeight: WALL, surface: 'fuzz' });
  b.mark('pit');
  b.arc(TURNS[3], -45);
  b.straight(80);
  b.arc(TURNS[4], -90);
  b.mark('pitEnd');

  // The Swirl: a coil at the eye, up out of the pit to the top.
  b.section('The Swirl', { halfWidth: 9.5, wallHeight: 1.2, surface: 'fuzz', bridge: true });
  b.mark('swirl');
  b.arc(SWIRL_R, -SWIRL_TURN);
  b.mark('swirlTop');
  // The Wall of Sound: off the top of the swirl and out over its turns, and down.
  b.section('Wall of Sound', { halfWidth: 10, wallHeight: 1.2, surface: 'fuzz', bridge: true });
  b.mark('wall');
  b.turnTo(wp(305, -30, Math.PI), 35);
  b.mark('wallEnd');
  b.straight(DROP);
  // Feedback Loop: round on itself and back onto the straight.
  b.section('Feedback Loop', { halfWidth: 10.5, wallHeight: 1.2, surface: 'fuzz' });
  b.mark('loop');
  b.turnTo(offsetPose(START, -FINISH * K), 33);
  b.section('Finish Straight', { halfWidth: 11, surface: 'fuzz' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: down into the pit, up the swirl out of it, along the top and off the far side.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  ease(b, m('pit', 5), 0, m('pit', 45), -DEPTH);
  b.profile(m('pit', 45), m('pitEnd'), () => -DEPTH, 10);
  b.profile(m('swirl'), m('swirlTop'), (u) => -DEPTH + (SWIRL_TOP + DEPTH) * u);
  b.profile(m('swirlTop'), m('wallEnd'), () => SWIRL_TOP, 10);
  plunge(b, m('wallEnd'), SWIRL_TOP, m('loop'), 0);

  const main = b.finish(true);
  const red = buildIntoTheRed(b.marks.redFrom, b.marks.redTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'im-in-your-mind-fuzz',
    name: "I'm in Your Mind Fuzz",
    main,
    branches: [red.branch],
    pits: [...b.pits, ...red.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('wall', 110), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leap', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['feedback', 'amps', 'wire', 'leap', 'bend', 'pit', 'swirl', 'wall'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'fuzzGate', ribbon: -1, s: 6 },
      { kind: 'fuzzGate', ribbon: -1, s: at('amps', -2) },
      { kind: 'fuzzMeter', ribbon: -1, s: at('leap', -20), lateral: 150 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('feedback', 20), count: 4 },
      { s: at('wall', 115), count: 3 },
      { s: at('pit', 50), count: 3 },
      { s: at('bend', 45), count: 4 },
      { s: red.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'fuzz', at: [at('amps', 40), at('amps', 200), at('amps', 380)], period: 4.2 },
      { kind: 'fuzz', at: [at('pit', 25), at('pit', 105)], period: 4.6 },
      { kind: 'eyes', at: [at('pit', 70)], period: 5 },
    ],
    theme: 'mindfuzz',
    music: { lap: 'im-in-your-mind-fuzz', finalLap: 'im-in-your-mind-fuzz-final-lap' },
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
 * Into the Red: a span of fuzz straight across the meter the Needle Bend
 * swings round. No rails. On laps 1 and 2 there is nothing there; on the
 * final lap the needle goes into the red and the road is there.
 */
function buildIntoTheRed(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Into the Red', { halfWidth: 6, surface: 'fuzz' });
  b.straight(30);
  b.section('The Red', { halfWidth: 4.5, surface: 'neon' });
  b.elevate(0).straight(12).elevate(1);
  const meter = chord - 2 * b.s;
  const boxes = b.s + meter / 2;
  b.bridge(meter, 7);
  b.elevate(1).straight(12).elevate(0);
  b.section('Into the Red', { halfWidth: 6, surface: 'fuzz' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Into the Red', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: ['final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
