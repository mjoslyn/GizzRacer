import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: -93 * K, z: -158 * K, h: -Math.PI / 2 };
const FINISH = 45;
/** The Needle Bend: the road swings out round a great meter in three arcs of this radius and turn. */
const BEND_R = 34;
const BEND_TURN = 70;
/** The Swirl's radius, and the top of it. */
const SWIRL_R = 22;
const SWIRL_TOP = 14;
/** How deep the Fuzz Pit is sunk: further down than any other cut in the cup. */
const DEPTH = 8;
/** The speaker stacks walling Amp Alley. */
const WALL = 6;
/** The square wave along the top: how tall each clipped tooth stands, and how wide its top and the gap after it. */
const TOOTH_H = 40;
const TOOTH_W = 45;
/** The radius of each right-angled corner of the square wave. */
const CORNER_R = 14;

/**
 * I'm in Your Mind Fuzz (the Mind Fuzz Cup's finale), after the song the
 * suite ends on, the first one again with the fuzz turned up: a world gone
 * to static, purple and green, fuzz growing on everything, the album's
 * swirl turning in the sky. The lap is a long loop whose top run is a
 * square wave, the fuzz clipping a wave flat: three teeth, each straight
 * up, across and straight down. Down Overdrive Straight (two kickers) along
 * the bottom under a gate of amp stacks, round Feedback Bend and up the
 * left side, a full turn up the Swirl, over its own start, and the Wall of
 * Sound off the top. Then the square wave itself, Amp Alley, right angle
 * after right angle between speaker stacks 6 m tall, and down the right
 * side into the Fuzz Pit, sunk 8 m, patches of fuzz pulsing on the road in
 * both and the eye from the start of the suite opening over the pit again.
 * Round the last corner the Distortion Leap, and the Needle Bend swinging
 * out round a meter along the bottom, which Into the Red cuts straight
 * across on the final lap only.
 */
export function buildImInYourMindFuzz(): TrackDef {
  const b = new TrackBuilder(START, 'Overdrive Straight', { halfWidth: 11, surface: 'fuzz' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(50);

  b.section('Feedback Bend', { halfWidth: 9.5, wallHeight: 1.2, surface: 'fuzz' });
  b.mark('feedback');
  b.arc(40, 90).straight(10);

  // A full turn up the album's swirl and over the road it started on.
  b.section('The Swirl', { halfWidth: 9.5, wallHeight: 1.2, surface: 'fuzz', bridge: true });
  b.mark('swirl');
  b.arc(SWIRL_R, -360);
  b.mark('swirlTop');
  b.section('Wall of Sound', { halfWidth: 10, surface: 'fuzz' });
  b.mark('wall');
  // A shade away from the swirl it just climbed, so the two roads keep clear of each other.
  b.arc(90, 10).straight(110).arc(90, -10);
  b.arc(40, 90).straight(10);

  // The square wave: up, across, down, across, three times over, between speaker stacks.
  b.section('Amp Alley', { halfWidth: 9, wallHeight: WALL, surface: 'fuzz' });
  b.mark('amps');
  for (let tooth = 0; tooth < 3; tooth++) {
    if (tooth) b.straight(TOOTH_W);
    b.arc(CORNER_R, -90).straight(TOOTH_H).arc(CORNER_R, 90).straight(TOOTH_W).arc(CORNER_R, 90).straight(TOOTH_H).arc(CORNER_R, -90);
  }
  b.mark('ampsEnd');
  b.straight(10);

  b.section('Fuzz Wire', { halfWidth: 9.5, wallHeight: 1.2, surface: 'fuzz' });
  b.arc(40, 90).straight(10);
  b.section('The Fuzz Pit', { halfWidth: 9, wallHeight: WALL, surface: 'fuzz' });
  b.mark('pit');
  b.straight(134);
  b.mark('pitEnd');
  b.straight(10);

  b.section('Distortion Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'fuzz' });
  b.mark('leap');
  b.arc(36, 90).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30);
  b.elevate(0).straight(20);

  b.section('Needle Bend', { halfWidth: 9.5, surface: 'fuzz' });
  b.mark('bend');
  b.straight(5);
  b.mark('redFrom');
  b.arc(BEND_R, -BEND_TURN).arc(BEND_R, 2 * BEND_TURN).arc(BEND_R, -BEND_TURN);
  b.mark('redTo');
  b.straight(5);
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'fuzz' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the swirl and off the top, down into the pit.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('swirl'), m('swirlTop'), (u) => SWIRL_TOP * u);
  b.profile(m('swirlTop'), m('wall', 30), () => SWIRL_TOP, 10);
  plunge(b, m('wall', 30), SWIRL_TOP, m('wall', 100), 0);
  ease(b, m('pit', 5), 0, m('pit', 45), -DEPTH);
  ease(b, m('pit', 95), -DEPTH, m('pitEnd', 10), 0);
  b.profile(m('redTo', 10), m('finish', -5), (u) => 3 * Math.sin(Math.PI * u) ** 2);

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
    checkpoints: ['feedback', 'swirl', 'wall', 'amps', 'pit', 'leap', 'bend'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'fuzzGate', ribbon: -1, s: 6 },
      { kind: 'fuzzGate', ribbon: -1, s: at('amps', -2) },
      { kind: 'fuzzMeter', ribbon: -1, s: at('wall', 60), lateral: -120 },
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
      { kind: 'fuzz', at: [at('amps', 41), at('amps', 360), at('amps', 680)], period: 4.2 },
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
