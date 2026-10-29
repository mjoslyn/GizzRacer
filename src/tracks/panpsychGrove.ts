import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1;
const START: Pose = { x: -60 * K, z: -255 * K, h: 0 };
const FINISH = 45;
/** Silent Spirit: the path winds out round a still pond in three arcs of this radius and turn. */
const POND_R = 40;
const POND_TURN = 70;
/** The Root Knot's radius, round the World Tree. */
const KNOT_R = 29;
/** The top of the Root Knot, high in the canopy, and the root it runs out along. */
const CANOPY = 14;
/** How deep Lichen Hollow sinks below the forest floor. */
const HOLLOW_DEPTH = 6;

/**
 * Panpsych (the Phantom Island Cup's third): a forest older than anyone
 * where everything is awake, after the song that says so. The lap is a
 * tree, drawn on the forest floor: up the trunk, round the crown, down the
 * trunk again and out along its roots. A dirt path up the Heartwood, out
 * into the crown and up one side of it past the Humming Stones, standing
 * stones shuffling across the road (two kickers among them); over the top
 * through Lichen Hollow, sunk 6 m, logs swinging on vines; a jump over
 * Mossy Ford coming down the other side, and back into the trunk through
 * the Old Growth. At the foot of the trunk the Root Knot winds three
 * quarters of a turn round the World Tree on a deck of living roots,
 * climbing into the canopy and over the road it came in on, and runs on
 * out along a root 14 m up, back over the Heartwood Path, to the Canopy
 * Drop off its end. Last, the path winds round a still pond at Silent
 * Spirit, which the Hollow Log, a fallen trunk with nothing either side,
 * crosses straight over. The trees are watching.
 */
export function buildPanpsychGrove(): TrackDef {
  const b = new TrackBuilder(START, 'Heartwood Path', { halfWidth: 10.5, surface: 'rock' });
  b.scale = K;
  b.straight(190);

  // Out into the crown, and up one side of it: stones awake and wandering, between two kickers.
  b.arc(60, -45).straight(80).arc(60, 45);
  b.section('Humming Stones', { halfWidth: 10, surface: 'rock' });
  b.mark('stones');
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(100);
  b.arc(100, 90);

  // Over the top of the crown, down in the hollow, logs swinging across on vines.
  b.section('Lichen Hollow', { halfWidth: 9, surface: 'rock' });
  b.mark('hollow');
  b.straight(70);
  b.mark('hollowEnd');
  b.arc(100, 90);

  b.section('Mossy Ford', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.mark('ford');
  b.straight(20).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'water');
  b.elevate(0).straight(20);

  // Back into the trunk, gnarled, and down it.
  b.section('Old Growth', { halfWidth: 9.5, surface: 'rock' });
  b.mark('growth');
  b.arc(60, 45).straight(80).arc(60, -45);
  b.straight(60).arc(80, -15).arc(80, 30).arc(80, -15).straight(110);

  // Round the World Tree on a deck of roots, up into the canopy and over the road you came in on.
  b.section('Root Knot', { halfWidth: 9, wallHeight: 1.2, surface: 'boards', bridge: true });
  b.mark('roots');
  b.arc(KNOT_R, -270);
  b.mark('rootTop');
  // Out along a root, high over the Heartwood Path.
  b.straight(150).arc(100, 15).arc(100, -30).arc(100, 15).straight(85);
  b.section('Canopy Drop', { halfWidth: 9.5, surface: 'rock' });
  b.mark('drop');
  b.straight(50).arc(40, -90).straight(100).arc(40, -90);

  b.section('Silent Spirit', { halfWidth: 9.5, surface: 'rock' });
  b.mark('spirit');
  b.straight(5);
  b.mark('logFrom');
  b.arc(POND_R, -POND_TURN).arc(POND_R, 2 * POND_TURN).arc(POND_R, -POND_TURN);
  b.mark('logTo');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 10.5, surface: 'rock' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: roots underfoot, the hollow, the climb into the canopy and the drop.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(120 * K, 185 * K, (u) => 2.5 * Math.sin(2 * Math.PI * u) ** 2);
  ease(b, m('hollow', 5), 0, m('hollow', 30), -HOLLOW_DEPTH);
  b.profile(m('hollow', 30), m('hollowEnd', -10), () => -HOLLOW_DEPTH, 10);
  ease(b, m('hollowEnd', -10), -HOLLOW_DEPTH, m('hollowEnd', 40), 0);
  ease(b, m('roots'), 0, m('rootTop'), CANOPY);
  // Level over the road below and the Heartwood Path, then off the end of the roots.
  b.profile(m('rootTop'), m('drop', -20), () => CANOPY, 10);
  plunge(b, m('drop', -20), CANOPY, m('drop', 55), 0);
  b.profile(m('logTo', 40), m('finish', -10), (u) => 3 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const log = buildHollowLog(b.marks.logFrom, b.marks.logTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'panpsych-grove',
    name: 'Panpsych',
    main,
    branches: [log.branch],
    pits: [...b.pits, ...log.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('rootTop', 30), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('ford', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['stones', 'hollow', 'ford', 'growth', 'roots', 'drop', 'spirit'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'treeGate', ribbon: -1, s: 6 },
      // In the middle of the knot.
      { kind: 'worldTree', ribbon: -1, s: b.marks.roots.s, lateral: KNOT_R * K },
      { kind: 'treeGate', ribbon: -1, s: at('hollow', 2) },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('stones', 20), count: 4 },
      { s: at('drop', 40), count: 3 },
      { s: at('ford', 50), count: 3 },
      { s: at('spirit', 45), count: 4 },
      { s: log.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'stones', from: at('stones', 5), to: at('stones', 135), count: 3, period: 6 },
      { kind: 'vines', at: [at('hollow', 25), at('hollow', 55), at('hollow', 80)], period: 3.6 },
    ],
    theme: 'grove',
    music: { lap: 'panpsych-grove', finalLap: 'panpsych-grove-final-lap' },
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
 * The Hollow Log: a fallen trunk laid straight across the still pond that
 * Silent Spirit winds round. No rails; slip off and you're in the pond.
 */
function buildHollowLog(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Hollow Log', { halfWidth: 6, surface: 'rock' });
  b.straight(30);
  b.section('Hollow Log', { halfWidth: 4, surface: 'boards' });
  b.elevate(0).straight(12).elevate(1);
  const pond = chord - 2 * b.s;
  const boxes = b.s + pond / 2;
  b.bridge(pond, 7, 'water');
  b.elevate(1).straight(12).elevate(0);
  b.section('Hollow Log Bank', { halfWidth: 6, surface: 'rock' });
  b.straight(chord - b.s);
  // The log is awake too: on the second lap it has wandered off, and the pond is open.
  const branch: BranchDef = { name: 'Hollow Log', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [1, 'final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
