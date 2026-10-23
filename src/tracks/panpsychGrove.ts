import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: 150 * K, z: -52 * K, h: Math.PI };
const FINISH = 45;
/** Silent Spirit: the path winds out round a still pond in three arcs of this radius and turn. */
const POND_R = 34;
const POND_TURN = 70;
/** The Root Knot's radius, round the World Tree. */
const KNOT_R = 26;
/** The top of the Root Knot, high in the canopy. */
const CANOPY = 14;
/** How deep Lichen Hollow sinks below the forest floor. */
const HOLLOW_DEPTH = 6;

/**
 * Panpsych (the Phantom Island Cup's third): a forest older than
 * anyone where everything is awake, after the song that says so. A dirt
 * path through the Heartwood, standing stones shuffling across the road
 * at Humming Stones (two kickers among them), the Root Knot: three
 * quarters of a turn round the trunk of the World Tree on a deck of living
 * roots, climbing into the canopy and crossing over the road it came in
 * on, then a plunge off
 * its end, logs swinging on vines down in Lichen Hollow, sunk 6 m into the
 * floor, a jump over Mossy Ford, and the path winding round a still pond
 * at Silent Spirit, which the Hollow Log, a fallen trunk with nothing either
 * side, crosses straight over. The trees are watching.
 */
export function buildPanpsychGrove(): TrackDef {
  const b = new TrackBuilder(START, 'Heartwood Path', { halfWidth: 10.5, surface: 'rock' });
  b.scale = K;
  b.straight(140).arc(50, 90);

  // Stones awake and wandering, between two kickers.
  b.section('Humming Stones', { halfWidth: 10, surface: 'rock' });
  b.mark('stones');
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(100);

  // Round the World Tree on a deck of roots, up into the canopy and over the road you came in on.
  b.section('Root Knot', { halfWidth: 9, wallHeight: 1.2, surface: 'boards', bridge: true });
  b.mark('roots');
  b.arc(KNOT_R, -270);
  b.mark('rootTop');
  b.straight(160);
  b.section('Canopy Drop', { halfWidth: 9.5, surface: 'rock' });
  b.mark('drop');
  b.arc(40, 90).straight(10);

  // Down in the hollow, logs swinging across on vines.
  b.section('Lichen Hollow', { halfWidth: 9, surface: 'rock' });
  b.mark('hollow');
  b.arc(32, 60).arc(32, -60).straight(15);
  b.mark('hollowEnd');
  b.straight(5);

  b.section('Mossy Ford', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.mark('ford');
  b.arc(36, -90).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'water');
  b.elevate(0).straight(20);

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

  // Heights, over the layout: roots underfoot, the climb into the canopy and the drop, the hollow.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(30, m('stones', -20), (u) => 2.5 * Math.sin(3 * Math.PI * u) ** 2);
  ease(b, m('roots'), 0, m('rootTop'), CANOPY);
  // Level over the road below, then off the end of the roots.
  b.profile(m('rootTop'), m('rootTop', 40), () => CANOPY, 10);
  plunge(b, m('rootTop', 40), CANOPY, m('rootTop', 95), 0);
  ease(b, m('hollow', 5), 0, m('hollow', 40), -HOLLOW_DEPTH);
  ease(b, m('hollow', 40), -HOLLOW_DEPTH, m('hollowEnd', 10), 0);
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
    checkpoints: ['stones', 'roots', 'drop', 'hollow', 'ford', 'spirit'].map((k) => b.marks[k].s / main.length),
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
