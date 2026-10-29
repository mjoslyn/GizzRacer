import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1;
/** The keep's tower, where the three wings meet: the Great Hall crosses it on the ground, the upper floor over it, the dungeon under it. */
const O = { x: 30, z: 60 };
/** How far each wing reaches out from the tower. */
const WING = 250;
/** A pose `r` out from the tower at angle `at` (degrees anticlockwise from east on the plot), heading `head` (the same way). */
const ray = (r: number, at: number, head: number): Pose => {
  const a = (at * Math.PI) / 180;
  return { x: (O.x + r * Math.cos(a)) * K, z: (O.z + r * Math.sin(a)) * K, h: Math.PI / 2 - (head * Math.PI) / 180 };
};
/** The Thwomp Hall: in at the gate round a bend of this radius and turn, then this long, straight. */
const GATE_R = 60;
const GATE_TURN = 45;
const HALL = 100;
/**
 * The Crooked Corridor's two right angles step the road this far on and
 * sideways into the Great Hall, 70 m short of the tower: so the hall's
 * straight starts here, the gate's bend before it, and the drawbridge and
 * the moat bridge before that.
 */
const HALL_START = offsetPose(offsetPose(ray(70, 300, 120), -32 * K, 57 * K), -HALL * K);
const START: Pose = (() => {
  const t = (GATE_TURN * Math.PI) / 180;
  const gate = offsetPose({ ...HALL_START, h: HALL_START.h + t }, -GATE_R * K * Math.sin(t), -GATE_R * K * (1 - Math.cos(t)));
  return offsetPose(gate, -118 * K);
})();
const FINISH = 45;
/** The Castle Garden: the path winds round a fountain in three arcs of this radius and turn. */
const GARDEN_R = 34;
const GARDEN_TURN = 70;
/** The castle's upper floor, at the top of the Grand Stair. */
const UPPER = 10;
/** The Grand Stair: once round a stairwell of this radius at the end of the north-west wing. */
const STAIR_R = 40;
/** How deep the Dungeon is sunk under the castle. */
const DUNGEON_DEPTH = 8;
/** Castle walls along the halls. */
const WALL = 6;

/**
 * Crumbling Castle (the Polygondwanaland Cup's opener), after the song,
 * laid out like the castle on the N64 and built up in tiers: three wings
 * round the keep's tower, the lap running out along each and crossing
 * itself in the tower on three floors. Over the moat on the drawbridge and
 * in at the gate, down the Thwomp Hall where masonry slams down from the
 * crumbling ceiling, the Crooked Corridor's two right angles and into the
 * Great Hall on the ground, crushers zigzagging across it, straight through
 * the tower and out along the north-west wing. The Grand Stair climbs to the
 * wing's end and turns once round the stairwell, its top turn over its
 * bottom one, up to the upper floor 10 m up, which comes back on a deck
 * over the Great Hall in the tower and out along the north-east wing into
 * the Castle Garden on the battlements. Off the battlements (a crest to fly
 * off) through the Lava Galleries, where jets of fire cross the passage,
 * round the end of the wing and down into the Dungeon, sunk 8 m, back under
 * both floors in the tower; up again onto the Lava Walk with no rails, a
 * leap over the lava and the Moat Road round the south wing to the
 * drawbridge. The Breach cuts across the garden once its wall has crumbled:
 * from the second lap.
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
  // Round from the gate and down the hall, the corridor's right angles, and the Great Hall right through the tower.
  b.section('Thwomp Hall', { halfWidth: 8.5, wallHeight: WALL, surface: 'flagstone' });
  b.mark('hall');
  b.arc(GATE_R, -GATE_TURN);
  b.mark('hallStraight');
  b.straight(HALL);
  b.section('Crooked Corridor', { halfWidth: 8, wallHeight: WALL, surface: 'flagstone' });
  b.mark('corridor');
  b.arc(16, 90).straight(25).arc(16, -90);
  b.section('Great Hall', { halfWidth: 13, wallHeight: WALL, surface: 'flagstone', bridge: true });
  b.mark('greatHall');
  b.straight(170);

  // Out along the north-west wing, once round the stairwell, and back up on the upper floor over the Great Hall.
  b.section('Grand Stair', { halfWidth: 9, wallHeight: 2, surface: 'flagstone', bridge: true });
  b.mark('stair');
  b.hermiteTo(ray(WING, 150, 240));
  b.mark('stairwell');
  b.arc(STAIR_R, 360);
  b.mark('stairTop');
  b.section('Upper Floor', { halfWidth: 9, wallHeight: 2, surface: 'flagstone', bridge: true });
  b.mark('upper');
  b.hermiteTo(ray(80, 180, 0));
  b.straight(140);
  b.mark('upperEnd');

  b.section('Castle Garden', { halfWidth: 9.5, surface: 'paving' });
  b.mark('garden');
  b.straight(10);
  b.mark('breachFrom');
  b.arc(GARDEN_R, -GARDEN_TURN).arc(GARDEN_R, 2 * GARDEN_TURN).arc(GARDEN_R, -GARDEN_TURN);
  b.mark('breachTo');
  b.straight(10);

  // Off the battlements and round the end of the north-east wing, down into the dungeon and back under the tower.
  b.section('Lava Galleries', { halfWidth: 8, wallHeight: WALL, surface: 'flagstone' });
  b.mark('galleries');
  b.hermiteTo(ray(WING, 30, 120));
  b.section('Dungeon', { halfWidth: 8.5, wallHeight: WALL, surface: 'rock' });
  b.mark('dungeon');
  b.hermiteTo(ray(90, 60, 240));
  b.straight(140);
  b.mark('dungeonEnd');
  b.arc(50, 40).straight(15);

  // No rails, lava either side, and the leap; round the south wing home.
  b.section('Lava Walk', { halfWidth: 8, surface: 'flagstone' });
  b.mark('walk');
  b.elevate(0).straight(10).elevate(1.5);
  b.bridge(55, 30, 'lava');
  b.elevate(1.5).straight(10).elevate(0);
  b.arc(50, -70);

  b.section('The Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'flagstone' });
  b.mark('leap');
  b.straight(55).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'lava');
  b.elevate(0).straight(20);

  b.section('Moat Road', { halfWidth: 10, surface: 'flagstone' });
  b.mark('moatRoad');
  b.hermiteTo(offsetPose(START, -FINISH * K));
  b.section('Finish Straight', { halfWidth: 11, surface: 'flagstone' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // Heights, over the layout. Up the stair, mostly round the stairwell, so the top turn runs clear over the bottom one;
  // the upper floor and the battlements 10 m up; off them, and down into the dungeon, sunk past the tower.
  ease(b, m('stair', 40), 0, m('stairwell'), 2);
  ease(b, m('stairwell'), 2, m('stairTop'), UPPER);
  b.profile(m('stairTop'), m('galleries', 20), () => UPPER, 10);
  plunge(b, m('galleries', 20), UPPER, m('galleries', 110), 0);
  ease(b, m('galleries', 110), 0, m('dungeon', 60), -DUNGEON_DEPTH);
  b.profile(m('dungeon', 60), m('dungeonEnd', -10), () => -DUNGEON_DEPTH, 10);
  ease(b, m('dungeonEnd', -10), -DUNGEON_DEPTH, m('dungeonEnd', 45), 0);
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
      { s: at('greatHall', 2), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('stairTop', 5), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leap', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['moat', 'hall', 'greatHall', 'stair', 'stairTop', 'upper', 'garden', 'galleries', 'dungeon', 'walk', 'leap'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'castleGate', ribbon: -1, s: at('hall', 2) },
      { kind: 'castleGate', ribbon: -1, s: at('galleries', -4) },
      { kind: 'castleKeep', ribbon: -1, s: at('hallStraight', 0), lateral: 150 },
    ],
    itemBoxes: [
      { s: at('kick1', 25), count: 4 },
      { s: at('hall', 30), count: 3 },
      { s: at('greatHall', 30), count: 4 },
      { s: at('upper', 60), count: 3 },
      { s: at('garden', 5), count: 3 },
      { s: at('dungeon', 55), count: 3 },
      { s: at('moatRoad', 20), count: 4 },
      { s: breach.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'crushers', at: [at('hallStraight', 25), at('hallStraight', 75)], period: 3.6 },
      // Clear of the upper floor's deck over the hall at the tower.
      { kind: 'crushers', at: [at('greatHall', 18), at('greatHall', 44), at('greatHall', 98), at('greatHall', 124)], period: 4 },
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
