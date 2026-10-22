import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: 110 * K, z: -150 * K, h: -Math.PI / 2 };
const FINISH = 45;
/** The Toe Down Bend: the road swings out round a pit in three arcs of this radius and turn. */
const BEND_R = 34;
const BEND_TURN = 70;
/** The Sweep Spiral's radius, and the top of it. */
const SPIRAL_R = 22;
const SPIRAL_TOP = 14;
/** How deep the Filter Trench is sunk. */
const TRENCH_DEPTH = 6;
/** The speaker stacks along Feedback Alley. */
const STACKS = 5;

/**
 * Wah Wah (the Nonagon Infinity Cup's finale), after the song: a
 * pedalboard the size of a city under a purple night, on a road that is a
 * fretboard. Down Pedalboard Straight (two kickers) under an arch of neon
 * that sweeps with the filter, through the Heel Down Bend and a full turn
 * up the Sweep Spiral, over its own start, and the Resonance Drop off the
 * top. Right angles through Feedback Alley between speaker stacks 5 m tall
 * and the Filter Trench sunk 6 m, giant wah pedals rocking up and stamping
 * down across both; the Octave Leap over a pit, and the Toe Down Bend round
 * another, which the Open Pedal cuts straight across: barred by a lit boom
 * until the final lap, when the pedal opens.
 */
export function buildWahWah(): TrackDef {
  const b = new TrackBuilder(START, 'Pedalboard Straight', { halfWidth: 11, surface: 'fret' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(70);

  b.section('Heel Down Bend', { halfWidth: 9.5, wallHeight: 1.2, surface: 'fret' });
  b.mark('heel');
  b.arc(40, 90).straight(10).arc(28, -60).arc(28, 60).straight(20);

  // A full turn up and over the road it started on: the sweep.
  b.section('Sweep Spiral', { halfWidth: 9.5, wallHeight: 1.2, surface: 'fret', bridge: true });
  b.mark('spiral');
  b.arc(SPIRAL_R, 360);
  b.mark('spiralTop');
  b.section('Resonance Drop', { halfWidth: 10, surface: 'fret' });
  b.mark('drop');
  b.straight(130);

  b.section('Feedback Alley', { halfWidth: 9, wallHeight: STACKS, surface: 'fret' });
  b.mark('alley');
  b.arc(16, 90).straight(30).arc(16, -90).straight(30).arc(16, 90).straight(20);
  b.section('Filter Trench', { halfWidth: 9, wallHeight: STACKS, surface: 'fret' });
  b.mark('trench');
  b.straight(140);
  b.mark('trenchEnd');
  b.straight(10);

  b.section('Octave Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'fret' });
  b.mark('leap');
  b.arc(36, 90).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30);
  b.elevate(0).straight(20);

  b.section('Toe Down Bend', { halfWidth: 9.5, surface: 'fret' });
  b.mark('bend');
  b.straight(5);
  b.mark('pedalFrom');
  b.arc(BEND_R, BEND_TURN).arc(BEND_R, -2 * BEND_TURN).arc(BEND_R, BEND_TURN);
  b.mark('pedalTo');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'fret' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the spiral and down the drop, the trench.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('heel', 75), m('spiral', -5), (u) => 2 * Math.sin(Math.PI * u) ** 2);
  b.profile(m('spiral'), m('spiralTop'), (u) => SPIRAL_TOP * u);
  b.profile(m('spiralTop'), m('drop', 30), () => SPIRAL_TOP, 10);
  plunge(b, m('drop', 30), SPIRAL_TOP, m('drop', 100), 0);
  ease(b, m('trench', 5), 0, m('trench', 40), -TRENCH_DEPTH);
  ease(b, m('trench', 100), -TRENCH_DEPTH, m('trenchEnd', 10), 0);
  b.profile(m('pedalTo', 40), m('finish', -10), (u) => 3 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const pedal = buildOpenPedal(b.marks.pedalFrom, b.marks.pedalTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'wah-wah',
    name: 'Wah Wah',
    main,
    branches: [pedal.branch],
    pits: [...b.pits, ...pedal.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('drop', 110), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leap', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['heel', 'spiral', 'drop', 'alley', 'trench', 'leap', 'bend'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'wahGate', ribbon: -1, s: 6 },
      { kind: 'wahGate', ribbon: -1, s: at('alley', -2) },
      { kind: 'wahPedal', ribbon: -1, s: at('drop', 60), lateral: -120 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('heel', 20), count: 4 },
      { s: at('drop', 115), count: 3 },
      { s: at('trench', 50), count: 3 },
      { s: at('bend', 45), count: 4 },
      { s: pedal.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'wahs', at: [at('alley', 41), at('alley', 103)], period: 4 },
      { kind: 'wahs', at: [at('trench', 30), at('trench', 95)], period: 4.4 },
    ],
    theme: 'wah',
    music: { lap: 'wah-wah', finalLap: 'wah-wah-final-lap' },
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
 * The Open Pedal: a patch cable of a road straight across the pit the Toe
 * Down Bend swings round. Barred by a lit boom on laps 1 and 2; on the
 * final lap the pedal opens and the boom swings up.
 */
function buildOpenPedal(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Open Pedal', { halfWidth: 6, surface: 'neon' });
  b.straight(30);
  b.section('Patch Cable', { halfWidth: 4.5, surface: 'neon' });
  const boom = b.s + 10;
  b.elevate(0).straight(12).elevate(1);
  const pit = chord - 2 * b.s;
  const boxes = b.s + pit / 2;
  b.bridge(pit, 7);
  b.elevate(1).straight(12).elevate(0);
  b.section('Open Pedal', { halfWidth: 6, surface: 'neon' });
  b.straight(chord - b.s);
  const branch: BranchDef = {
    name: 'Open Pedal', mainFrom: from.s, mainTo: to.s, ...b.finish(false),
    openOn: ['final'], shut: { kind: 'barrier', at: boom, look: { style: 'boom', color: 0xd83a7a, glow: true } },
  };
  return { branch, pits: b.pits, boxes };
}
