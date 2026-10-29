import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const DEG = Math.PI / 180;
/** A point in the cell, in builder units, the cell's middle at (CX, CZ). */
const CX = -60;
const CZ = -50;
const wp = (x: number, z: number, h: number): Pose => ({ x: (x - CX) * K, z: (z - CZ) * K, h });
const START: Pose = wp(170, -200, 0);
const FINISH = 45;
/**
 * The mitochondrion's folds (its cristae): three legs back and forth
 * across the middle of the cell at these heights on the map, from this far
 * east, with hairpins of this radius between them.
 */
const FOLD_Z = [90, 26, -38];
const FOLD_EAST = 40;
const FOLD_R = 32;
/** The Endoplasmic Loop's turns, where it starts back north over the folds, and how high it runs. */
const LOOP_R = 45;
const LOOP_X = -20;
const LOOP_Z = -170;
const LOOP_TOP = 13;
/** The north side of the cell, the west and the south. */
const TOP_Z = 220;
const RIM_X = -300;
const SOUTH_Z = -368;
/** How deep the Lysosome Sink runs. */
const SINK_DEPTH = 6;
/** The Golgi's stacked membranes either side. */
const GOLGI_WALL = 4;
/**
 * The Nuclear Rim: the membrane pinched in round the nucleus, a broad bowl of
 * this radius between two tighter shoulders of the next; each shoulder turns
 * this far, the bowl twice as far back.
 */
const RIM_R = 131;
const RIM_SHOULDER = 45;
const RIM_TURN = 50;

/**
 * Inner Cell (the Polygondwanaland Cup's third), after the song: a road
 * through a living cell, seen from the size of a ribosome. The lap goes
 * round the inside of the cell's membrane and through its organelles. Up
 * the Membrane Pass (two kickers) along the cell's east side and on up the
 * Cytoplasm Stream, where vesicles drift across; then into the
 * mitochondrion, the Mitochondria Esses folding back and forth across the
 * middle of the cell like its cristae, three folds and two hairpins, an S
 * down each. The Endoplasmic Loop turns a full circle up the reticulum to
 * 13 m, round under the folds and back north over all three of them, and
 * flies off the top. Along the north through the Golgi Switchbacks between
 * stacked membranes, round onto the Nuclear Rim down the west side, curving
 * in round the nucleus, which the Nuclear Pore cuts straight across; the
 * Lysosome Sink 6 m down, and back east along the south over the Ribosome
 * Jump, a pool of cytoplasm, home. The lap is long, so a race is two of
 * them.
 */
export function buildInnerCell(): TrackDef {
  const b = new TrackBuilder(START, 'Membrane Pass', { halfWidth: 11, surface: 'membrane' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(30);

  // Up the east side of the cell on the stream.
  b.section('Cytoplasm Stream', { halfWidth: 10, surface: 'membrane' });
  b.mark('stream');
  b.arc(120, 20).arc(120, -40).arc(120, 20);
  b.mark('streamEnd');
  b.turnTo(wp(FOLD_EAST, FOLD_Z[0], -90 * DEG), 40);

  // The mitochondrion's folds: back and forth across the middle of the cell, an S down each.
  b.section('Mitochondria Esses', { halfWidth: 9.5, wallHeight: 1.2, surface: 'membrane' });
  b.mark('esses');
  fold(b);
  b.arc(FOLD_R, -180);
  fold(b);
  b.arc(FOLD_R, 180);
  fold(b);
  b.mark('essesEnd');

  // A full turn up the reticulum and back north over every fold, and off the top.
  b.section('Endoplasmic Loop', { halfWidth: 9, wallHeight: 1.2, surface: 'membrane', bridge: true });
  b.mark('loop');
  b.turnTo(wp(LOOP_X, LOOP_Z, 0), LOOP_R);
  b.mark('loopUp');
  b.arc(200, 15).arc(200, -30).arc(200, 15);
  b.mark('loopTop');
  b.turnTo(wp(LOOP_X - LOOP_R, TOP_Z, -90 * DEG), LOOP_R);
  b.mark('loopEnd');

  // Along the north of the cell between the stacked membranes.
  b.section('Golgi Switchbacks', { halfWidth: 8.5, wallHeight: GOLGI_WALL, surface: 'membrane' });
  b.mark('golgi');
  b.straight(10).arc(25, 35).arc(25, -70).arc(25, 35).straight(10);

  // Round and down the west side, curving in round the nucleus.
  b.section('Nuclear Rim', { halfWidth: 9.5, surface: 'membrane' });
  b.mark('rim');
  b.turnTo(wp(RIM_X, TOP_Z - 100, 180 * DEG), 90);
  b.straight(5);
  b.mark('poreFrom');
  b.arc(RIM_SHOULDER, -RIM_TURN).arc(RIM_R, 2 * RIM_TURN).arc(RIM_SHOULDER, -RIM_TURN);
  b.mark('poreTo');
  b.straight(10);
  b.section('Lysosome Sink', { halfWidth: 9, wallHeight: GOLGI_WALL, surface: 'membrane' });
  b.mark('sink');
  b.arc(200, -15).arc(200, 15);
  b.mark('sinkEnd');
  b.straight(10);

  // Back east along the south of the cell.
  b.section('Ribosome Jump', { halfWidth: 9, wallHeight: 1.2, surface: 'membrane' });
  b.mark('jump');
  b.arc(90, -90);
  b.straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'water');
  b.elevate(0).straight(20);
  b.mark('jumpEnd');
  b.arc(80, -25).arc(80, 50).arc(80, -25);
  b.turnTo(wp(80, SOUTH_Z, 90 * DEG), 90);
  b.turnTo(offsetPose(START, -FINISH * K), 90);
  b.section('Finish Straight', { halfWidth: 11, surface: 'membrane' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: swells in the stream, up the loop and over the folds, off the top, the sink.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('stream', 60), m('streamEnd', -5), (u) => 2.5 * Math.sin(2 * Math.PI * u) ** 2);
  ease(b, m('loop', 20), 0, m('loopUp'), LOOP_TOP);
  b.profile(m('loopUp'), m('loopTop', 85), () => LOOP_TOP, 10);
  plunge(b, m('loopTop', 85), LOOP_TOP, m('loopTop', 165), 0);
  ease(b, m('sink', 10), 0, m('sink', 50), -SINK_DEPTH);
  ease(b, m('sink', 50), -SINK_DEPTH, m('sinkEnd', 10), 0);
  b.profile(m('jumpEnd', 10), m('finish', -10), (u) => 3 * Math.sin(Math.PI * u) ** 2);

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
      { s: at('loopUp', 30), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('jump', 40), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['stream', 'esses', 'loop', 'golgi', 'rim', 'sink', 'jump'].map((k) => b.marks[k].s / main.length),
    // A long way round the cell: two laps of it are a race.
    laps: 2,
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
      { s: at('loopTop', 20), count: 3 },
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

/** One of the mitochondrion's folds: across the cell from one hairpin to the next, with an S in the middle. */
function fold(b: TrackBuilder): void {
  b.straight(12).arc(90, 18).arc(90, -36).arc(90, 18).straight(12);
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
