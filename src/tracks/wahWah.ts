import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.0;
const DEG = Math.PI / 180;
/**
 * The lap is a guitar string ringing in its third harmonic, laid out along
 * the string (u, running north-east across the board) and across it (v, to
 * the north-west): the road runs out along one extreme of the string's
 * swing and back along the other, so it crosses itself at the nodes. Half a
 * wave is this long, and the string swings this far either way.
 */
const HALF_WAVE = 250;
const SWING = 120;
/** The string's swing at `u` along it, on the way out: an antinode at the nut end (u = 0), nodes at a half and one and a half half-waves, and the bridge (a node too) at two and a half. */
const swing = (u: number) => SWING * Math.cos((Math.PI * u) / HALF_WAVE);
const slope = (u: number) => -SWING * (Math.PI / HALF_WAVE) * Math.sin((Math.PI * u) / HALF_WAVE);
/** The road out, and the road back, are laid through the string's swing every twelfth of a wave. */
const STEP = HALF_WAVE / 6;
const BRIDGE = 15;
const FINISH = 45;
/** The nut end: the road back runs on past the antinode and round two right angles, across the end and back onto the road out. */
const NUT_RUN = 20;
const CORNER_R = 40;
/** The Toe Down Bend: the road swings out round a pit in three arcs of this radius and turn. */
const BEND_R = 38;
const BEND_TURN = 70;
/** How far past the antinode the nut end lies. */
const NUT = -(NUT_RUN + 4 * BEND_R * Math.sin(BEND_TURN * DEG) + CORNER_R + 5);
/** The middle of the board, halfway from the nut end to the bridge. */
const MID = (NUT + BRIDGE * STEP) / 2;
/** A pose on the board from a point along and across the string and a direction along and across it. */
function board(u: number, v: number, du: number, dv: number): Pose {
  const a = (u - MID) / Math.SQRT2;
  const c = v / Math.SQRT2;
  return { x: (a - c) * K, z: (a + c) * K, h: Math.atan2(du - dv, du + dv) };
}
const out = (j: number) => board(j * STEP, swing(j * STEP), 1, slope(j * STEP));
const back = (j: number) => board(j * STEP, -swing(j * STEP), -1, slope(j * STEP));
/** The top of the Sweep, over the road back at the second node, and the Fuzz Bridge's deck, over the road out at the first. */
const SWEEP_TOP = 14;
const FUZZ = 8;
/** How deep the Filter Trench is sunk. */
const TRENCH_DEPTH = 6;
/** The speaker stacks along Feedback Alley. */
const STACKS = 5;
/** Up the nut end, toward the road out. */
const START: Pose = board(NUT, -SWING + CORNER_R + 10 + FINISH, 0, 1);

/**
 * Wah Wah (the Nonagon Infinity Cup's finale), after the song: a
 * pedalboard the size of a city under a purple night, on a road that is a
 * fretboard. The lap is a guitar string ringing in its third harmonic,
 * strung corner to corner across the board: the road runs out along one
 * extreme of its swing, from the nut end to the bridge, and back along the
 * other, so it crosses itself at the string's two nodes, a chain of three
 * loops like a wah's sweep drawn on a scope. Pedalboard Straight (two
 * kickers) runs up the nut end under an arch of neon that sweeps with the
 * filter and onto the string; the Heel Down Bend swings down through the
 * first node under the Fuzz Bridge, and the Sweep climbs the middle loop
 * to 14 m and over the second node. The Resonance Drop falls off it; round
 * the bridge Feedback Alley runs between speaker stacks 5 m tall, and the
 * Filter Trench, sunk 6 m, comes back under the second node, giant wah
 * pedals rocking up and stamping down across both. The Octave Leap jumps a
 * pit on the way back across the middle loop, the Fuzz Bridge carries the
 * road 8 m over the first node, and back at the nut end the Toe Down Bend
 * swings out round another pit, which the Open Pedal cuts straight across.
 */
export function buildWahWah(): TrackDef {
  const b = new TrackBuilder(START, 'Pedalboard Straight', { halfWidth: 11, surface: 'fret' });
  b.scale = K;
  const along = (pose: (j: number) => Pose, from: number, to: number) => {
    for (let j = from; from < to ? j <= to : j >= to; j += from < to ? 1 : -1) {
      b.hermiteTo(pose(j));
      b.mark(`${pose === out ? 'o' : 'b'}${j}`);
    }
  };
  b.straight(30).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(10);
  // Round onto the string at its antinode.
  b.turnTo(out(0), CORNER_R);
  b.mark('o0');

  b.section('Heel Down Bend', { halfWidth: 9.5, wallHeight: 1.2, surface: 'fret' });
  b.mark('heel');
  along(out, 1, 4);
  b.section('The Sweep', { halfWidth: 9.5, wallHeight: 1.2, surface: 'fret', bridge: true });
  b.mark('sweep');
  along(out, 5, 10);
  b.section('Resonance Drop', { halfWidth: 10, surface: 'fret' });
  b.mark('drop');
  along(out, 11, 12);
  // Round the bridge between the speaker stacks, and back along the string's other swing.
  b.section('Feedback Alley', { halfWidth: 9, wallHeight: STACKS, surface: 'fret' });
  b.mark('alley');
  along(out, 13, BRIDGE - 1);
  along(back, BRIDGE - 1, 13);
  b.section('Filter Trench', { halfWidth: 9, wallHeight: STACKS, surface: 'fret' });
  b.mark('trench');
  along(back, 12, 8);
  b.mark('trenchEnd');
  b.section('Octave Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'fret' });
  b.mark('leap');
  b.straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 24);
  b.elevate(0).straight(15);
  along(back, 6, 6);
  b.section('Fuzz Bridge', { halfWidth: 9.5, wallHeight: 1.2, surface: 'fret', bridge: true });
  b.mark('fuzz');
  along(back, 5, 1);
  // On past the antinode, out round the pit, and across the nut end.
  b.section('Toe Down Bend', { halfWidth: 9.5, surface: 'fret' });
  b.mark('bend');
  along(back, 0, 0);
  b.straight(NUT_RUN);
  b.mark('pedalFrom');
  b.arc(BEND_R, -BEND_TURN).arc(BEND_R, 2 * BEND_TURN).arc(BEND_R, -BEND_TURN);
  b.mark('pedalTo');
  b.turnTo(offsetPose(START, -FINISH * K), CORNER_R);
  b.section('Finish Straight', { halfWidth: 11, surface: 'fret' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: the string's nodes are crossings, the road out on the ground under the
  // Fuzz Bridge at the first and up on the Sweep over the Filter Trench at the second.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  ease(b, m('o3', 40), 0, m('o9', -40), SWEEP_TOP);
  b.profile(m('o9', -40), m('o9', 40), () => SWEEP_TOP, 10);
  plunge(b, m('o9', 40), SWEEP_TOP, m('o9', 120), 0);
  ease(b, m('b13'), 0, m('b9', -40), -TRENCH_DEPTH);
  b.profile(m('b9', -40), m('b9', 40), () => -TRENCH_DEPTH, 10);
  ease(b, m('b9', 40), -TRENCH_DEPTH, m('trenchEnd'), 0);
  ease(b, m('fuzz', 5), 0, m('b3', -40), FUZZ);
  b.profile(m('b3', -40), m('b3', 40), () => FUZZ, 10);
  ease(b, m('b3', 40), FUZZ, m('b3', 130), 0);

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
      { s: b.marks.ramp.s - 10, length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['heel', 'sweep', 'drop', 'alley', 'trench', 'leap', 'fuzz', 'bend'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'wahGate', ribbon: -1, s: 6 },
      { kind: 'wahGate', ribbon: -1, s: at('alley', -2) },
      { kind: 'wahPedal', ribbon: -1, s: at('o6', 0), lateral: SWING * K },
    ],
    itemBoxes: [
      { s: 50, count: 4 },
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
 * Down Bend swings round.
 */
function buildOpenPedal(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Open Pedal', { halfWidth: 6, surface: 'neon' });
  b.straight(30);
  b.section('Patch Cable', { halfWidth: 4.5, surface: 'neon' });
  b.elevate(0).straight(12).elevate(1);
  const pit = chord - 2 * b.s;
  const boxes = b.s + pit / 2;
  b.bridge(pit, 7);
  b.elevate(1).straight(12).elevate(0);
  b.section('Open Pedal', { halfWidth: 6, surface: 'neon' });
  b.straight(chord - b.s);
  const branch: BranchDef = {
    name: 'Open Pedal', mainFrom: from.s, mainTo: to.s, ...b.finish(false),
  };
  return { branch, pits: b.pits, boxes };
}
