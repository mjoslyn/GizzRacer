import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: -150 * K, z: -52 * K, h: -Math.PI };
const FINISH = 45;
/** The Gnome Lawn: the path winds out round a pond in three arcs of this radius and turn. */
const POND_R = 34;
const POND_TURN = 70;
/** The Trellis's radius. */
const TRELLIS_R = 26;
/** The top of the Trellis. */
const TRELLIS_TOP = 14;
/** How deep the Worm Tunnel runs under the lawn. */
const TUNNEL_DEPTH = 6;
/** Hedge walls in the maze. */
const HEDGE = 5;

/**
 * The Garden Goblin (the Omnium Gatherum Cup's third): a garden at goblin
 * size, after The Garden Goblin. Paving through the Garden Gate, goblins
 * scurrying across the Rose Beds (two kickers among them), the Trellis:
 * three quarters of a turn up a rose trellis and over the path you came in
 * on, then down into the Hedge Maze, walls of hedge taller than a house,
 * and under the lawn through the Worm Tunnel, sunk 6 m. A jump over the
 * Lily Pond, and the Gnome Lawn winding round a pond, which the Goblin Hole
 * cuts straight across, unless the goblins have hedged it up (the second
 * lap).
 */
export function buildGoblinGarden(): TrackDef {
  const b = new TrackBuilder(START, 'Garden Gate', { halfWidth: 10.5, surface: 'paving' });
  b.scale = K;
  b.straight(140).arc(50, -90);

  b.section('Rose Beds', { halfWidth: 10, surface: 'paving' });
  b.mark('roses');
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(100);

  // Up the trellis and over the path below.
  b.section('Trellis', { halfWidth: 9, wallHeight: 1.2, surface: 'boards', bridge: true });
  b.mark('trellis');
  b.arc(TRELLIS_R, 270);
  b.mark('trellisTop');
  b.straight(160);
  b.section('Hedge Maze', { halfWidth: 9.5, wallHeight: HEDGE, surface: 'paving' });
  b.mark('maze');
  b.arc(40, -90).straight(10);

  b.section('Worm Tunnel', { halfWidth: 9, wallHeight: HEDGE, surface: 'rock' });
  b.mark('tunnel');
  b.arc(32, -60).arc(32, 60).straight(15);
  b.mark('tunnelEnd');
  b.straight(5);

  b.section('Lily Pond', { halfWidth: 9, wallHeight: 1.2, surface: 'paving' });
  b.mark('pond');
  b.arc(36, 90).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'water');
  b.elevate(0).straight(20);

  b.section('Gnome Lawn', { halfWidth: 9.5, surface: 'paving' });
  b.mark('lawn');
  b.straight(5);
  b.mark('holeFrom');
  b.arc(POND_R, POND_TURN).arc(POND_R, -2 * POND_TURN).arc(POND_R, POND_TURN);
  b.mark('holeTo');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 10.5, surface: 'paving' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: bumps in the beds, up the trellis and off it, the tunnel.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(30, m('roses', -20), (u) => 2.5 * Math.sin(3 * Math.PI * u) ** 2);
  ease(b, m('trellis'), 0, m('trellisTop'), TRELLIS_TOP);
  b.profile(m('trellisTop'), m('trellisTop', 40), () => TRELLIS_TOP, 10);
  plunge(b, m('trellisTop', 40), TRELLIS_TOP, m('trellisTop', 95), 0);
  ease(b, m('tunnel', 5), 0, m('tunnel', 40), -TUNNEL_DEPTH);
  ease(b, m('tunnel', 40), -TUNNEL_DEPTH, m('tunnelEnd', 10), 0);
  b.profile(m('holeTo', 40), m('finish', -10), (u) => 3 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const hole = buildGoblinHole(b.marks.holeFrom, b.marks.holeTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'goblin-garden',
    name: 'The Garden Goblin',
    main,
    branches: [hole.branch],
    pits: [...b.pits, ...hole.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('trellisTop', 30), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('pond', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['roses', 'trellis', 'maze', 'tunnel', 'pond', 'lawn'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'goblinGate', ribbon: -1, s: 6 },
      { kind: 'goblinGate', ribbon: -1, s: at('maze', 2) },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('roses', 20), count: 4 },
      { s: at('maze', 40), count: 3 },
      { s: at('pond', 50), count: 3 },
      { s: at('lawn', 45), count: 4 },
      { s: hole.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'goblins', from: at('roses', 5), to: at('roses', 135), count: 3, period: 4 },
      { kind: 'goblins', from: at('tunnel', 10), to: at('tunnel', 70), count: 2, period: 3.5 },
    ],
    theme: 'goblin',
    music: { lap: 'goblin-garden', finalLap: 'goblin-garden-final-lap' },
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
 * The Goblin Hole: a gap in the hedge and a plank over the pond the Gnome
 * Lawn winds round. No rails.
 */
function buildGoblinHole(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Goblin Hole', { halfWidth: 6, surface: 'paving' });
  b.straight(30);
  b.section('Goblin Plank', { halfWidth: 4, surface: 'boards' });
  b.elevate(0).straight(12).elevate(1);
  const pond = chord - 2 * b.s;
  const boxes = b.s + pond / 2;
  b.bridge(pond, 7, 'water');
  b.elevate(1).straight(12).elevate(0);
  b.section('Goblin Hole', { halfWidth: 6, surface: 'paving' });
  b.straight(chord - b.s);
  const branch: BranchDef = {
    name: 'Goblin Hole', mainFrom: from.s, mainTo: to.s, ...b.finish(false),
  };
  return { branch, pits: b.pits, boxes };
}
