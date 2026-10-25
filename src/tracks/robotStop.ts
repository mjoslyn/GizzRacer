import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
/** The nut's side, vertex to vertex (m): six of them round a hexagon with flat top and bottom. */
const SIDE = 230;
/** Each of the nut's corners turns this far. */
const CORNER = 60;
/** How much road a corner of radius r (unscaled) takes off each side it joins (m). */
const trim = (r: number) => r * K * Math.tan(((CORNER / 2) * Math.PI) / 180);
/** A straight of `m` real metres. */
const fill = (m: number) => m / K;
/** The tight corners' radius, and the Press Hall's tighter one. */
const CORNER_R = 20;
const HALL_R = 16;
const FINISH = 45;
/** The Nonagon Door: the road swings in round a scrap pit in three arcs of this radius and turn. */
const DOOR_R = 34;
const DOOR_TURN = 70;
/** The Conveyor Climb's radius, and the top of it. */
const CLIMB_R = 22;
const CLIMB_TOP = 14;
/** How deep the Smelter Trench is sunk. */
const TRENCH_DEPTH = 6;
/** The factory's walls along the halls. */
const WALL = 6;
/** The bottom side runs left to right; the finish straight starts this far after its left corner. */
const START: Pose = { x: -SIDE / 2 + trim(CORNER_R) + FINISH * K, z: -SIDE * Math.cos(Math.PI / 6), h: Math.PI / 2 };

/**
 * Robot Stop (the Nonagon Infinity Cup's opener), after the song: a robot
 * factory at night where the line keeps stopping dead. The layout is a
 * machined nut: a regular hexagon, flat top and bottom, six long straight
 * sides of 230 m and six tight 60 degree corners, all taken the same way
 * round, with the factory worked into the sides. Down the Assembly Line
 * along the bottom (two kickers); the Loosen Up Esses jink up the next side
 * and come back onto its line; the Conveyor Climb is the third corner, a
 * full turn and a sixth on the inside of the nut, up to 14 m and over the
 * road it came in on; Time to Drop falls off the top down the third side.
 * The Press Hall, walled 6 m in riveted steel, turns the tightest corner onto
 * the top side, where robots march across the road and stop dead in the
 * middle of it, and the Smelter Trench runs on along the top sunk 6 m with
 * more of them. The Scrapyard Leap turns down the fifth side and jumps
 * molten metal halfway along it, and on the last side the Nonagon Door
 * swings in round a scrap pit, which the Open Door cuts straight across on
 * the side's own line.
 */
export function buildRobotStop(): TrackDef {
  const b = new TrackBuilder(START, 'Assembly Line', { halfWidth: 11, surface: 'steel' });
  b.scale = K;
  // The bottom side: finish, start and the line, to the first corner.
  const lineRest = SIDE - 2 * trim(CORNER_R) - FINISH * K - 70 * K - 14;
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(fill(lineRest));

  b.section('Loosen Up Esses', { halfWidth: 10, wallHeight: 1.2, surface: 'steel' });
  b.mark('esses');
  b.arc(CORNER_R, -CORNER).straight(10);
  // A jink out and back that leaves the road on the side's line.
  const jink = 2 * 40 * K * (Math.sin((20 * Math.PI) / 180) * 2);
  b.arc(40, -20).arc(40, 40).arc(40, -20);
  b.straight(fill(SIDE - trim(CORNER_R) - trim(CLIMB_R) - 10 * K - jink));

  // The third corner, taken as a turn and a sixth up and over itself: the conveyor.
  b.section('Conveyor Climb', { halfWidth: 9.5, wallHeight: 1.2, surface: 'steel', bridge: true });
  b.mark('climb');
  b.arc(CLIMB_R, -(360 + CORNER));
  b.mark('climbTop');
  // Still on its deck, clear of the road below it.
  b.straight(25);
  b.section('Time to Drop', { halfWidth: 10, surface: 'steel' });
  b.mark('drop');
  b.straight(fill(SIDE - trim(CLIMB_R) - trim(HALL_R)) - 25);

  b.section('Press Hall', { halfWidth: 9, wallHeight: WALL, surface: 'steel' });
  b.mark('hall');
  b.arc(HALL_R, -CORNER);
  const trench = 150 * K;
  b.straight(fill(SIDE - trim(HALL_R) - trim(CORNER_R) - trench));
  b.section('Smelter Trench', { halfWidth: 9, wallHeight: WALL, surface: 'steel' });
  b.mark('trench');
  b.straight(140);
  b.mark('trenchEnd');
  b.straight(10);

  // The fifth side, with the leap halfway down it.
  b.section('Scrapyard Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'steel' });
  b.mark('leap');
  b.arc(CORNER_R, -CORNER);
  const leapSide = SIDE - 2 * trim(CORNER_R);
  const run = (leapSide - 18 - 13) / 2;
  b.straight(fill(run)).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'lava');
  b.elevate(0).straight(fill(run));

  // The last side: the door swings in off its line and back onto it.
  b.section('Nonagon Door', { halfWidth: 9.5, surface: 'steel' });
  b.mark('door');
  b.arc(CORNER_R, -CORNER);
  const deg = Math.PI / 180;
  const doorChord = DOOR_R * K * 4 * Math.sin(DOOR_TURN * deg);
  b.straight(fill((SIDE - 2 * trim(CORNER_R) - doorChord) / 2));
  b.mark('doorFrom');
  b.arc(DOOR_R, -DOOR_TURN).arc(DOOR_R, 2 * DOOR_TURN).arc(DOOR_R, -DOOR_TURN);
  b.mark('doorTo');
  b.turnTo(offsetPose(START, -FINISH * K), CORNER_R);
  b.section('Finish Straight', { halfWidth: 11, surface: 'steel' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the conveyor and off the top, the trench.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('esses', 75), m('climb', -5), (u) => 2 * Math.sin(Math.PI * u) ** 2);
  b.profile(m('climb'), m('climbTop'), (u) => CLIMB_TOP * u);
  b.profile(m('climbTop'), m('drop', 30), () => CLIMB_TOP, 10);
  plunge(b, m('drop', 30), CLIMB_TOP, m('drop', 100), 0);
  ease(b, m('trench', 5), 0, m('trench', 40), -TRENCH_DEPTH);
  ease(b, m('trench', 100), -TRENCH_DEPTH, m('trenchEnd', 10), 0);
  b.profile(m('doorTo', 40), m('finish', -10), (u) => 3 * Math.sin(Math.PI * u) ** 2);

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
      { s: at('drop', 110), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: b.marks.ramp.s - 10, length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['esses', 'climb', 'drop', 'hall', 'trench', 'leap', 'door'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'factoryGate', ribbon: -1, s: 6 },
      { kind: 'factoryGate', ribbon: -1, s: at('hall', -2) },
      { kind: 'robotColossus', ribbon: -1, s: at('drop', 60), lateral: -120 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('esses', 20), count: 4 },
      { s: at('drop', 115), count: 3 },
      { s: at('trench', 50), count: 3 },
      { s: at('door', 45), count: 4 },
      { s: door.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'robots', at: [at('hall', 20), at('hall', 45)], period: 5 },
      { kind: 'robots', at: [at('trench', 30), at('trench', 95)], period: 5.6 },
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
