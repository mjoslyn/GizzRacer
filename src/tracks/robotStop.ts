import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 0.8;
const DEG = Math.PI / 180;
const EAST = 90 * DEG;
const NORTH = 0;
const WEST = -90 * DEG;
/** A point on the factory floor, in builder units. */
const wp = (x: number, z: number, h: number): Pose => ({ x: x * K, z: z * K, h });
const FINISH = 45;
/** The line's three rows across the floor, bottom, middle and top (builder units). */
const BOTTOM = -330;
const MIDDLE = -40;
const TOP = 235;
/** The loops at the ends of the line: their radius, and how high Loosen Up climbs over the line's end. */
const LOOP_R = 42;
const LOOSEN = 7.5;
/** The top of the Conveyor Climb. */
const CLIMB_TOP = 14;
/** The Press Hall's right angles, the tightest corners on the lap. */
const HALL_R = 20;
/** How deep the Smelter Trench is sunk. */
const TRENCH_DEPTH = 6;
/** The factory's walls along the halls. */
const WALL = 6;
/** The Nonagon Door: the road swings in round a scrap pit in three arcs of this radius and turn. */
const DOOR_R = 45;
const DOOR_TURN = 70;
/** On the bottom row, heading along the line. */
const START: Pose = wp(30, BOTTOM, EAST);

/**
 * Robot Stop (the Nonagon Infinity Cup's opener), after the song: a robot
 * factory at night where the line keeps stopping dead. The lap is the
 * factory's production line, a Z laid three rows deep across the floor and
 * looping over itself at both ends, with the way back cut corner to corner
 * under it. Along the bottom row the Assembly Line (two kickers) runs to
 * the end of the line, where Loosen Up loops out and back over it, 7.5 m up;
 * the Loosen Up Esses come down the right-hand side onto the middle row,
 * where the Conveyor Climb lifts off over the Smelter Trench, runs back
 * along the row and up the left-hand side into a spiral conveyor, a loop
 * that climbs to 14 m over the road into it. Time to Drop falls off the top
 * along the top row; the Press Hall, walled 6 m in riveted steel, steps down
 * out of its corner in right angles like a robot walking, robots marching
 * across the road and stopping dead in the middle of it; and the Smelter
 * Trench, sunk 6 m with more of them, runs corner to corner down the floor
 * under the conveyor. The Scrapyard Leap jumps molten metal at the end of
 * it, and back on the bottom row the Nonagon Door swings in round a scrap
 * pit, which the Open Door cuts straight across on the row's own line.
 */
export function buildRobotStop(): TrackDef {
  const b = new TrackBuilder(START, 'Assembly Line', { halfWidth: 11, surface: 'steel' });
  b.scale = K;
  b.straight(30).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(136);

  // The end of the line: a loop out and back over it, and up the right-hand side.
  b.section('Loosen Up', { halfWidth: 10, wallHeight: 1.2, surface: 'steel', bridge: true });
  b.mark('loosen');
  b.arc(LOOP_R, 270);
  b.straight(50);
  b.section('Loosen Up Esses', { halfWidth: 10, wallHeight: 1.2, surface: 'steel' });
  b.mark('esses');
  b.arc(60, -25).arc(60, 50).arc(60, -25);
  b.turnTo(wp(80, MIDDLE, WEST), 80);

  // Back along the middle row on the conveyor, over the trench, and up the spiral at the end of it.
  b.section('Conveyor Climb', { halfWidth: 9.5, wallHeight: 1.2, surface: 'steel', bridge: true });
  b.mark('climb');
  b.arc(90, 12).arc(90, -12);
  b.turnTo(wp(-250, MIDDLE + 70, NORTH), 60);
  b.arc(150, 10).arc(150, -20).arc(150, 10);
  b.turnTo(wp(-250, 270, NORTH), 60);
  b.mark('loop');
  b.arc(LOOP_R, -270);
  // Still on its deck, clear of the road below it.
  b.straight(45);
  b.mark('climbTop');
  b.section('Time to Drop', { halfWidth: 10, surface: 'steel' });
  b.mark('drop');
  b.straight(90).arc(120, 15).arc(120, -30).arc(120, 15);
  b.arc(120, -15).arc(120, 15);
  b.turnTo(wp(200, TOP, EAST), 60);

  // Stop, start, stop: right angles down out of the corner, like a robot walking.
  b.section('Press Hall', { halfWidth: 9, wallHeight: WALL, surface: 'steel' });
  b.mark('hall');
  b.arc(HALL_R, 90).straight(40).arc(HALL_R, 90).straight(40).arc(HALL_R, -90).straight(30).arc(HALL_R, 45);
  b.straight(60);
  // Corner to corner down the floor, under the conveyor.
  b.section('Smelter Trench', { halfWidth: 9, wallHeight: WALL, surface: 'steel' });
  b.mark('trench');
  b.arc(500, -6).arc(500, 12).arc(500, -6).straight(30);
  b.mark('trenchEnd');
  b.straight(10);

  b.section('Scrapyard Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'steel' });
  b.mark('leap');
  b.straight(20).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'lava');
  b.elevate(0).straight(20);

  // Round onto the bottom row: the door swings in off its line and back onto it.
  b.section('Nonagon Door', { halfWidth: 9.5, surface: 'steel' });
  b.mark('door');
  b.turnTo(wp(-270, BOTTOM, EAST), 50);
  b.mark('doorFrom');
  b.arc(DOOR_R, -DOOR_TURN).arc(DOOR_R, 2 * DOOR_TURN).arc(DOOR_R, -DOOR_TURN);
  b.mark('doorTo');
  b.turnTo(offsetPose(START, -FINISH * K), 40);
  b.section('Finish Straight', { halfWidth: 11, surface: 'steel' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: the line runs in tiers where it crosses itself, Loosen Up over the end
  // of the line, the conveyor over the trench and its spiral over the road into it.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('loosen'), m('esses', -50), (u) => LOOSEN * u);
  b.profile(m('esses', -50), m('esses', 40), () => LOOSEN, 10);
  ease(b, m('esses', 40), LOOSEN, m('esses', 160), 0);
  ease(b, m('climb', -80), 0, m('climb'), 3);
  b.profile(m('climb'), m('climb', 120), () => 3, 10);
  b.profile(m('climb', 120), m('loop'), (u) => 3 + 2 * u);
  b.profile(m('loop'), m('climbTop', -45), (u) => 5 + (CLIMB_TOP - 5) * u);
  b.profile(m('climbTop', -45), m('drop', 40), () => CLIMB_TOP, 10);
  plunge(b, m('drop', 40), CLIMB_TOP, m('drop', 120), 0);
  ease(b, m('trench', 20), 0, m('trench', 70), -TRENCH_DEPTH);
  ease(b, m('trenchEnd', -40), -TRENCH_DEPTH, m('trenchEnd', 10), 0);

  const main = b.finish(true);
  const door = buildOpenDoor(b.marks.doorFrom, b.marks.doorTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'robot-stop',
    name: 'Robot Stop',
    main,
    branches: [door.branch],
    pits: [...b.pits, ...door.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('drop', 130), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: b.marks.ramp.s - 10, length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['loosen', 'esses', 'climb', 'loop', 'drop', 'hall', 'trench', 'leap', 'door'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'factoryGate', ribbon: -1, s: 6 },
      { kind: 'factoryGate', ribbon: -1, s: at('hall', -2) },
      { kind: 'robotColossus', ribbon: -1, s: at('drop', 140), lateral: -100 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('esses', 20), count: 4 },
      { s: at('drop', 140), count: 3 },
      { s: at('trench', 50), count: 3 },
      { s: at('door', 45), count: 4 },
      { s: door.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'robots', at: [at('hall', 20), at('hall', 45)], period: 5 },
      { kind: 'robots', at: [at('trench', 70), at('trench', 170)], period: 5.6 },
    ],
    theme: 'factory',
    music: { lap: 'robot-stop', finalLap: 'robot-stop-final-lap' },
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
 * The Open Door: a service road straight across the scrap pit the Nonagon
 * Door swings round, over a plank of steel.
 */
function buildOpenDoor(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'The Open Door', { halfWidth: 6, surface: 'asphalt' });
  b.straight(30);
  b.section('Scrap Plank', { halfWidth: 4.5, surface: 'steel' });
  b.elevate(0).straight(12).elevate(1);
  const pit = chord - 2 * b.s;
  const boxes = b.s + pit / 2;
  b.bridge(pit, 7, 'lava');
  b.elevate(1).straight(12).elevate(0);
  b.section('The Open Door', { halfWidth: 6, surface: 'asphalt' });
  b.straight(chord - b.s);
  const branch: BranchDef = {
    name: 'The Open Door', mainFrom: from.s, mainTo: to.s, ...b.finish(false),
  };
  return { branch, pits: b.pits, boxes };
}
