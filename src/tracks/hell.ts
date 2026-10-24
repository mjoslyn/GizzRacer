import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: 110 * K, z: -150 * K, h: -Math.PI / 2 };
const FINISH = 45;
/** The Lake of Fire: the road swings out round it in three arcs of this radius and turn. */
const LAKE_R = 34;
const LAKE_TURN = 70;
/** The Spire of Babel's radius, and the top of it. */
const SPIRE_R = 22;
const SPIRE_TOP = 14;
/** How deep the Pit is sunk: further down than any other cut in the cup. */
const PIT_DEPTH = 8;
/** The walls of Rat Run. */
const WALL = 6;

/**
 * Hell (the Infest the Rats' Nest Cup's finale), after the album's last
 * song: down through the pit into Hell. Down the Road to Ruin (two
 * kickers) under a gate of horns, through Brimstone Bend and a full turn up
 * the Spire of Babel, over its own start, and the Fall off the top. Right
 * angles through Rat Run between walls of black rock 6 m tall, then down
 * into the Pit, sunk 8 m, rats pouring across the road in both and fire
 * jetting across the Pit; the Sulphur Leap over a lake of lava, and the
 * road round the Lake of Fire, which the Devil's Bridge crosses straight
 * over on the final lap, when the gates open.
 */
export function buildHell(): TrackDef {
  const b = new TrackBuilder(START, 'Road to Ruin', { halfWidth: 11, surface: 'brimstone' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(70);

  b.section('Brimstone Bend', { halfWidth: 9.5, wallHeight: 1.2, surface: 'brimstone' });
  b.mark('bend');
  b.arc(40, 90).straight(10).arc(28, -60).arc(28, 60).straight(20);

  // A full turn up a spire of black rock and over the road it started on.
  b.section('Spire of Babel', { halfWidth: 9.5, wallHeight: 1.2, surface: 'brimstone', bridge: true });
  b.mark('spire');
  b.arc(SPIRE_R, 360);
  b.mark('spireTop');
  b.section('The Fall', { halfWidth: 10, surface: 'brimstone' });
  b.mark('fall');
  b.straight(130);

  b.section('Rat Run', { halfWidth: 9, wallHeight: WALL, surface: 'brimstone' });
  b.mark('run');
  b.arc(16, 90).straight(30).arc(16, -90).straight(30).arc(16, 90).straight(20);
  b.section('The Pit', { halfWidth: 9, wallHeight: WALL, surface: 'rock' });
  b.mark('pit');
  b.straight(140);
  b.mark('pitEnd');
  b.straight(10);

  b.section('Sulphur Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'brimstone' });
  b.mark('leap');
  b.arc(36, 90).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'lava');
  b.elevate(0).straight(20);

  b.section('Lake of Fire', { halfWidth: 9.5, surface: 'brimstone' });
  b.mark('lake');
  b.straight(5);
  b.mark('bridgeFrom');
  b.arc(LAKE_R, LAKE_TURN).arc(LAKE_R, -2 * LAKE_TURN).arc(LAKE_R, LAKE_TURN);
  b.mark('bridgeTo');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'brimstone' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the spire and off the top, down into the pit.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('bend', 75), m('spire', -5), (u) => 2 * Math.sin(Math.PI * u) ** 2);
  b.profile(m('spire'), m('spireTop'), (u) => SPIRE_TOP * u);
  b.profile(m('spireTop'), m('fall', 30), () => SPIRE_TOP, 10);
  plunge(b, m('fall', 30), SPIRE_TOP, m('fall', 100), 0);
  ease(b, m('pit', 5), 0, m('pit', 45), -PIT_DEPTH);
  ease(b, m('pit', 95), -PIT_DEPTH, m('pitEnd', 10), 0);
  b.profile(m('bridgeTo', 40), m('finish', -10), (u) => 3 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const bridge = buildDevilsBridge(b.marks.bridgeFrom, b.marks.bridgeTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'hell',
    name: 'Hell',
    main,
    branches: [bridge.branch],
    pits: [...b.pits, ...bridge.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('fall', 110), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leap', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['bend', 'spire', 'fall', 'run', 'pit', 'leap', 'lake'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'hellGate', ribbon: -1, s: 6 },
      { kind: 'hellGate', ribbon: -1, s: at('run', -2) },
      { kind: 'ratsNest', ribbon: -1, s: at('fall', 60), lateral: -120 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('bend', 20), count: 4 },
      { s: at('fall', 115), count: 3 },
      { s: at('pit', 50), count: 3 },
      { s: at('lake', 45), count: 4 },
      { s: bridge.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'rats', at: [at('run', 41), at('run', 103)], period: 4.2 },
      { kind: 'rats', at: [at('pit', 25), at('pit', 105)], period: 4.6 },
      { kind: 'flameJets', at: [at('pit', 70)], period: 3.4 },
    ],
    theme: 'inferno',
    music: { lap: 'hell', finalLap: 'hell-final-lap' },
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
 * The Devil's Bridge: a span of black iron straight over the Lake of Fire.
 * No rails. On laps 1 and 2 there is nothing there; on the final lap the
 * gates of Hell open and the bridge rises out of the lava.
 */
function buildDevilsBridge(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, "Devil's Bridge", { halfWidth: 6, surface: 'rock' });
  b.straight(30);
  b.section('Iron Span', { halfWidth: 4.5, surface: 'steel' });
  b.elevate(0).straight(12).elevate(1);
  const lake = chord - 2 * b.s;
  const boxes = b.s + lake / 2;
  b.bridge(lake, 7, 'lava');
  b.elevate(1).straight(12).elevate(0);
  b.section("Devil's Bridge", { halfWidth: 6, surface: 'rock' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: "Devil's Bridge", mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: ['final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
