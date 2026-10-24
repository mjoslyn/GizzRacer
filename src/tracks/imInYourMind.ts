import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: 110 * K, z: -150 * K, h: -Math.PI / 2 };
const FINISH = 45;
/** The Mind's Eye Bend: the road swings out round a great pupil in three arcs of this radius and turn. */
const EYE_R = 34;
const EYE_TURN = 70;
/** The Thought Spiral's radius, and the top of it. */
const SPIRAL_R = 20;
const SPIRAL_TOP = 15;
/** How deep the Subconscious is sunk. */
const DEPTH = 7;
/** The folds of brain walling the Cortex Folds. */
const WALL = 6;

/**
 * I'm in Your Mind (the Mind Fuzz Cup's opener), after the song the suite
 * starts with: inside a mind, pink folds of brain lit by nerves firing, and
 * eyes everywhere. Down Third Eye Straight (two kickers) under a gate with
 * an eye in it, through Synapse Bend and the Neuron Esses, a full turn up
 * the Thought Spiral round a stalk with an eye on top, over its own start,
 * and the Brainwave Drop off the top. Right angles through the Cortex Folds
 * between walls of brain 6 m tall, then down into the Subconscious, sunk
 * 7 m, eyes opening over the road in both to read your mind. The Dream Leap
 * over nothing, and the Mind's Eye Bend round a pupil, which the Open Mind
 * cuts straight across from lap 2, once it's in your mind.
 */
export function buildImInYourMind(): TrackDef {
  const b = new TrackBuilder(START, 'Third Eye Straight', { halfWidth: 11, surface: 'neural' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(70);

  b.section('Synapse Bend', { halfWidth: 10, wallHeight: 1.2, surface: 'neural' });
  b.mark('synapse');
  b.arc(45, 80).straight(20);
  b.section('Neuron Esses', { halfWidth: 9.5, wallHeight: 1.2, surface: 'neural' });
  b.mark('esses');
  b.arc(26, -70).arc(26, 70).straight(20);

  // A full turn up round a stalk with an eye on top, and over the road it started on.
  b.section('Thought Spiral', { halfWidth: 9.5, wallHeight: 1.2, surface: 'neural', bridge: true });
  b.mark('spiral');
  b.arc(SPIRAL_R, 360);
  b.mark('spiralTop');
  b.section('Brainwave Drop', { halfWidth: 10, surface: 'neural' });
  b.mark('drop');
  // A shade away from the spiral it just climbed, so the two roads keep clear of each other.
  b.arc(90, -10).straight(110);

  b.section('Cortex Folds', { halfWidth: 9, wallHeight: WALL, surface: 'neural' });
  b.mark('folds');
  b.arc(18, 90).straight(50).arc(18, -90).straight(30).arc(18, 90).straight(20);
  b.section('The Subconscious', { halfWidth: 9, wallHeight: WALL, surface: 'neural' });
  b.mark('deep');
  b.straight(130);
  b.mark('deepEnd');
  b.straight(10);

  b.section('Dream Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'neural' });
  b.mark('leap');
  b.arc(36, 90).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30);
  b.elevate(0).straight(20);

  b.section("Mind's Eye Bend", { halfWidth: 9.5, surface: 'neural' });
  b.mark('bend');
  b.straight(5);
  b.mark('mindFrom');
  b.arc(EYE_R, EYE_TURN).arc(EYE_R, -2 * EYE_TURN).arc(EYE_R, EYE_TURN);
  b.mark('mindTo');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'neural' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the spiral and down the drop, the subconscious.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('synapse', 20), m('spiral', -5), (u) => 2.5 * Math.sin(Math.PI * u) ** 2);
  b.profile(m('spiral'), m('spiralTop'), (u) => SPIRAL_TOP * u);
  b.profile(m('spiralTop'), m('drop', 25), () => SPIRAL_TOP, 10);
  plunge(b, m('drop', 25), SPIRAL_TOP, m('drop', 95), 0);
  ease(b, m('deep', 5), 0, m('deep', 40), -DEPTH);
  ease(b, m('deep', 90), -DEPTH, m('deepEnd', 10), 0);
  b.profile(m('mindTo', 40), m('finish', -10), (u) => 3 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const open = buildOpenMind(b.marks.mindFrom, b.marks.mindTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'im-in-your-mind',
    name: "I'm in Your Mind",
    main,
    branches: [open.branch],
    pits: [...b.pits, ...open.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('drop', 100), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leap', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['synapse', 'spiral', 'drop', 'folds', 'deep', 'leap', 'bend'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'eyeGate', ribbon: -1, s: 6 },
      { kind: 'eyeGate', ribbon: -1, s: at('folds', -2) },
      { kind: 'mindFace', ribbon: -1, s: at('drop', 60), lateral: -130 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('esses', 10), count: 4 },
      { s: at('drop', 105), count: 3 },
      { s: at('deep', 50), count: 3 },
      { s: at('bend', 45), count: 4 },
      { s: open.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'eyes', at: [at('folds', 50), at('folds', 135)], period: 4.6 },
      { kind: 'eyes', at: [at('deep', 30), at('deep', 75), at('deep', 115)], period: 5 },
    ],
    theme: 'mind',
    music: { lap: 'im-in-your-mind', finalLap: 'im-in-your-mind-final-lap' },
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
 * The Open Mind: a nerve straight across the pupil the Mind's Eye Bend
 * swings round. No rails. On lap 1 there is nothing there; from lap 2,
 * once it's in your mind, the nerve has grown across.
 */
function buildOpenMind(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Open Mind', { halfWidth: 6, surface: 'neural' });
  b.straight(30);
  b.section('The Pupil', { halfWidth: 4.5, surface: 'neon' });
  b.elevate(0).straight(12).elevate(1);
  const pupil = chord - 2 * b.s;
  const boxes = b.s + pupil / 2;
  b.bridge(pupil, 7);
  b.elevate(1).straight(12).elevate(0);
  b.section('Open Mind', { halfWidth: 6, surface: 'neural' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Open Mind', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2, 'final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
