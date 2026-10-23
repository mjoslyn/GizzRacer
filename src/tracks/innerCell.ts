import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: -125 * K, z: -40 * K, h: Math.PI };
const FINISH = 45;
/** The Nuclear Rim: the road swings round the nucleus in three arcs of this radius and turn. */
const RIM_R = 34;
const RIM_TURN = 70;
/** The Endoplasmic Loop's radius, and how high it climbs. */
const LOOP_R = 21;
const LOOP_TOP = 13;
/** How deep the Lysosome Sink runs. */
const SINK_DEPTH = 6;
/** The Golgi's stacked membranes either side. */
const GOLGI_WALL = 4;

/**
 * Inner Cell (the Polygondwanaland Cup's third), after the song: a road
 * through a living cell, seen from the size of a ribosome. Through the
 * Membrane Pass (two kickers), down the Cytoplasm Stream, where vesicles
 * drift across, round the Mitochondria Esses and up the Endoplasmic Loop,
 * three quarters of a turn and over the road it came in on. Hairpins
 * through the stacked membranes of the Golgi, the Lysosome Sink 6 m down,
 * a jump over a pool of cytoplasm, and the Nuclear Rim winding round the
 * nucleus, which the Nuclear Pore cuts straight through.
 */
export function buildInnerCell(): TrackDef {
  const b = new TrackBuilder(START, 'Membrane Pass', { halfWidth: 11, surface: 'membrane' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(50);

  b.section('Cytoplasm Stream', { halfWidth: 10, surface: 'membrane' });
  b.mark('stream');
  b.arc(50, -90).straight(110);
  b.mark('streamEnd');
  b.section('Mitochondria Esses', { halfWidth: 9.5, wallHeight: 1.2, surface: 'membrane' });
  b.mark('esses');
  b.arc(30, -60).arc(30, 120).arc(30, -60).straight(20);

  // Three quarters of a turn up the reticulum and over the road below.
  b.section('Endoplasmic Loop', { halfWidth: 9, wallHeight: 1.2, surface: 'membrane', bridge: true });
  b.mark('loop');
  b.arc(LOOP_R, 270);
  b.mark('loopTop');
  b.straight(150);

  b.section('Golgi Switchbacks', { halfWidth: 8.5, wallHeight: GOLGI_WALL, surface: 'membrane' });
  b.mark('golgi');
  b.arc(20, -170).straight(16).arc(20, 170).straight(16);
  b.section('Lysosome Sink', { halfWidth: 9, wallHeight: GOLGI_WALL, surface: 'membrane' });
  b.mark('sink');
  b.arc(36, -80).straight(30);
  b.mark('sinkEnd');
  b.straight(10);

  b.section('Ribosome Jump', { halfWidth: 9, wallHeight: 1.2, surface: 'membrane' });
  b.mark('jump');
  b.arc(36, 90).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'water');
  b.elevate(0).straight(20);

  b.section('Nuclear Rim', { halfWidth: 9.5, surface: 'membrane' });
  b.mark('rim');
  b.straight(5);
  b.mark('poreFrom');
  b.arc(RIM_R, RIM_TURN).arc(RIM_R, -2 * RIM_TURN).arc(RIM_R, RIM_TURN);
  b.mark('poreTo');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'membrane' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: swells in the stream, up the loop and off it, the sink.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('stream', 60), m('streamEnd', -5), (u) => 2.5 * Math.sin(2 * Math.PI * u) ** 2);
  ease(b, m('loop'), 0, m('loopTop'), LOOP_TOP);
  b.profile(m('loopTop'), m('loopTop', 40), () => LOOP_TOP, 10);
  plunge(b, m('loopTop', 40), LOOP_TOP, m('loopTop', 95), 0);
  ease(b, m('sink', 10), 0, m('sink', 50), -SINK_DEPTH);
  ease(b, m('sink', 50), -SINK_DEPTH, m('sinkEnd', 10), 0);
  b.profile(m('poreTo', 40), m('finish', -10), (u) => 3 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const pore = buildNuclearPore(b.marks.poreFrom, b.marks.poreTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'inner-cell',
    name: 'Inner Cell',
    main,
    branches: [pore.branch],
    pits: [...b.pits, ...pore.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('loopTop', 30), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('jump', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['stream', 'esses', 'loop', 'golgi', 'sink', 'jump', 'rim'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'cellGate', ribbon: -1, s: 6 },
      { kind: 'cellGate', ribbon: -1, s: at('golgi', -2) },
      { kind: 'nucleus', ribbon: 0, s: pore.boxes },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('stream', 20), count: 4 },
      { s: at('esses', 60), count: 3 },
      { s: at('jump', 50), count: 3 },
      { s: at('rim', 45), count: 4 },
      { s: pore.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'vesicles', from: at('stream', 60), to: at('streamEnd', -10), count: 3, period: 5 },
      { kind: 'vesicles', from: at('sink', 20), to: at('sinkEnd', 5), count: 2, period: 4.5 },
    ],
    theme: 'cell',
    music: { lap: 'inner-cell', finalLap: 'inner-cell-final-lap' },
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
 * The Nuclear Pore: straight through the nucleus the rim winds round, over
 * the nucleoplasm on a strand of membrane. No rails.
 */
function buildNuclearPore(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Nuclear Pore', { halfWidth: 6, surface: 'membrane' });
  b.straight(30);
  b.section('Nucleoplasm Strand', { halfWidth: 4, surface: 'membrane' });
  b.elevate(0).straight(12).elevate(1);
  const pool = chord - 2 * b.s;
  const boxes = b.s + pool / 2;
  b.bridge(pool, 7, 'water');
  b.elevate(1).straight(12).elevate(0);
  b.section('Nuclear Pore', { halfWidth: 6, surface: 'membrane' });
  b.straight(chord - b.s);
  const branch: BranchDef = {
    name: 'Nuclear Pore', mainFrom: from.s, mainTo: to.s, ...b.finish(false),
  };
  return { branch, pits: b.pits, boxes };
}
