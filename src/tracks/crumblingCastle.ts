import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: -40 * K, z: -175 * K, h: 0 };
const FINISH = 45;
/** The Castle Garden: the path winds round a fountain in three arcs of this radius and turn. */
const GARDEN_R = 34;
const GARDEN_TURN = 70;
/** The castle's upper floor, at the top of the Grand Stair. */
const UPPER = 10;
/** How deep the Dungeon is sunk under the castle. */
const DUNGEON_DEPTH = 6;
/** Castle walls along the halls. */
const WALL = 6;

/**
 * Crumbling Castle (the Polygondwanaland Cup's opener), after the song,
 * laid out like the castle on the N64: over the moat and in at the gate,
 * a long hall where masonry slams down from the crumbling ceiling, a
 * crooked corridor into the Great Hall (crushers zigzagging across it),
 * the Grand Stair turning three quarters of a circle up to the upper
 * floor, and out through the Castle Garden on the battlements. Down again
 * through the Lava Galleries, where jets of fire cross the passage, under
 * the castle through the Dungeon, sunk 6 m, along the Lava Walk with no
 * rails, and a leap over the lava before the Moat Road brings you back to
 * the drawbridge. The Breach cuts across the garden once its wall has
 * crumbled: from the second lap.
 */
export function buildCrumblingCastle(): TrackDef {
  const b = new TrackBuilder(START, 'Drawbridge', { halfWidth: 11, surface: 'flagstone' });
  b.scale = K;
  b.straight(30).mark('kick1').kicker().straight(25);

  // Over the moat on the drawbridge and in at the gate.
  b.section('Moat Bridge', { halfWidth: 10, wallHeight: 1.2, surface: 'boards', bridge: true });
  b.mark('moat');
  b.elevate(0).straight(8).elevate(1.5);
  b.bridge(40, 30, 'lava');
  b.elevate(1.5).straight(8).elevate(0);
  b.section('Thwomp Hall', { halfWidth: 8.5, wallHeight: WALL, surface: 'flagstone' });
  b.mark('hall');
  b.straight(100);
  b.section('Crooked Corridor', { halfWidth: 8, wallHeight: WALL, surface: 'flagstone' });
  b.mark('corridor');
  b.arc(16, -90).straight(30).arc(16, 90);
  b.section('Great Hall', { halfWidth: 13, wallHeight: WALL, surface: 'flagstone' });
  b.mark('greatHall');
  b.straight(100);

  // Half a turn up the stair to the upper floor.
  b.section('Grand Stair', { halfWidth: 9, wallHeight: 2, surface: 'flagstone', bridge: true });
  b.mark('stair');
  b.arc(58, 180);
  b.mark('stairTop');
  b.straight(10);

  b.section('Castle Garden', { halfWidth: 9.5, surface: 'paving' });
  b.mark('garden');
  b.straight(10);
  b.mark('breachFrom');
  b.arc(GARDEN_R, -GARDEN_TURN).arc(GARDEN_R, 2 * GARDEN_TURN).arc(GARDEN_R, -GARDEN_TURN);
  b.mark('breachTo');
  b.straight(10);

  // Back inside and down: right angles through the galleries, fire across them.
  b.section('Lava Galleries', { halfWidth: 8, wallHeight: WALL, surface: 'flagstone' });
  b.mark('galleries');
  b.arc(16, -90).straight(90).arc(16, 90).straight(20);
  b.section('Dungeon', { halfWidth: 8.5, wallHeight: WALL, surface: 'rock' });
  b.mark('dungeon');
  b.straight(100);
  b.mark('dungeonEnd');
  b.straight(20);

  // No rails, lava either side.
  b.section('Lava Walk', { halfWidth: 8, surface: 'flagstone' });
  b.mark('walk');
  b.elevate(0).straight(10).elevate(1.5);
  b.bridge(55, 30, 'lava');
  b.elevate(1.5).straight(10).elevate(0);

  b.section('The Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'flagstone' });
  b.mark('leap');
  b.arc(36, 90).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'lava');
  b.elevate(0).straight(20);

  b.section('Moat Road', { halfWidth: 10, surface: 'flagstone' });
  b.mark('moatRoad');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'flagstone' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the stair, along the battlements and off them, the dungeon.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  ease(b, m('stair'), 0, m('stairTop'), UPPER);
  b.profile(m('stairTop'), m('breachTo', 10), () => UPPER, 10);
  plunge(b, m('galleries', 30), UPPER, m('galleries', 90), 0);
  ease(b, m('dungeon', 10), 0, m('dungeon', 40), -DUNGEON_DEPTH);
  ease(b, m('dungeon', 70), -DUNGEON_DEPTH, m('dungeonEnd'), 0);
  b.profile(m('moatRoad', 30), m('finish', -10), (u) => 3 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const breach = buildBreach(b.marks.breachFrom, b.marks.breachTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'crumbling-castle',
    name: 'Crumbling Castle',
    main,
    branches: [breach.branch],
    pits: [...b.pits, ...breach.pits],
    boostPads: [
      { s: at('hall', 120), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('stairTop', 5), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leap', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['moat', 'hall', 'greatHall', 'garden', 'galleries', 'dungeon', 'leap'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'castleGate', ribbon: -1, s: at('hall', 2) },
      { kind: 'castleGate', ribbon: -1, s: at('galleries', -4) },
      { kind: 'castleKeep', ribbon: -1, s: at('greatHall', 55), lateral: 90 },
    ],
    itemBoxes: [
      { s: at('kick1', 25), count: 4 },
      { s: at('hall', 30), count: 3 },
      { s: at('greatHall', 15), count: 4 },
      { s: at('garden', 5), count: 3 },
      { s: at('dungeon', 55), count: 3 },
      { s: at('moatRoad', 20), count: 4 },
      { s: breach.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'crushers', at: [at('hall', 45), at('hall', 95)], period: 3.6 },
      { kind: 'crushers', at: [at('greatHall', 20), at('greatHall', 45), at('greatHall', 70), at('greatHall', 95)], period: 4 },
      { kind: 'flameJets', at: [at('galleries', 41), at('galleries', 98)], period: 3.2 },
    ],
    theme: 'castle',
    music: { lap: 'crumbling-castle', finalLap: 'crumbling-castle-final-lap' },
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
 * The Breach: where the garden wall has fallen, a path over the rubble and
 * a plank across the fountain's moat, straight across the bends. The wall
 * is still standing on the first lap.
 */
function buildBreach(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'The Breach', { halfWidth: 6, surface: 'paving' });
  b.elevate(UPPER);
  b.straight(30);
  b.section('Rubble Plank', { halfWidth: 4, surface: 'boards' });
  b.elevate(UPPER).straight(12).elevate(UPPER + 1);
  const moat = chord - 2 * b.s;
  const boxes = b.s + moat / 2;
  b.bridge(moat, 7, 'lava');
  b.elevate(UPPER + 1).straight(12).elevate(UPPER);
  b.section('The Breach', { halfWidth: 6, surface: 'paving' });
  b.straight(chord - b.s);
  b.elevate(UPPER);
  const branch: BranchDef = {
    name: 'The Breach', mainFrom: from.s, mainTo: to.s, ...b.finish(false),
  };
  return { branch, pits: b.pits, boxes };
}
