import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: -110 * K, z: -150 * K, h: Math.PI / 2 };
const FINISH = 45;
/** The Nonagon Door: the road swings out round a scrap pit in three arcs of this radius and turn. */
const DOOR_R = 34;
const DOOR_TURN = 70;
/** The Conveyor Climb's radius, and the top of it. */
const CLIMB_R = 22;
const CLIMB_TOP = 14;
/** How deep the Smelter Trench is sunk. */
const TRENCH_DEPTH = 6;
/** The factory's walls along the halls. */
const WALL = 6;

/**
 * Robot Stop (the Nonagon Infinity Cup's opener), after the song: a robot
 * factory at night where the line keeps stopping dead. Down the Assembly
 * Line (two kickers), through the Loosen Up Esses and a full turn up the
 * Conveyor Climb, over its own start, then Time to Drop off the top. Right
 * angles through the Press Hall, walled 6 m in riveted steel, where robots
 * march across the road and stop dead in the middle of it, the Smelter
 * Trench sunk 6 m with more of them, the Scrapyard Leap over molten metal,
 * and the Nonagon Door swinging round a scrap pit. The Open Door cuts
 * straight across it.
 */
export function buildRobotStop(): TrackDef {
  const b = new TrackBuilder(START, 'Assembly Line', { halfWidth: 11, surface: 'steel' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(60);

  b.section('Loosen Up Esses', { halfWidth: 10, wallHeight: 1.2, surface: 'steel' });
  b.mark('esses');
  b.arc(40, -90).straight(10).arc(28, 60).arc(28, -60).straight(20);

  // A full turn up and over the road it started on: the conveyor.
  b.section('Conveyor Climb', { halfWidth: 9.5, wallHeight: 1.2, surface: 'steel', bridge: true });
  b.mark('climb');
  b.arc(CLIMB_R, -360);
  b.mark('climbTop');
  b.section('Time to Drop', { halfWidth: 10, surface: 'steel' });
  b.mark('drop');
  b.straight(130);

  b.section('Press Hall', { halfWidth: 9, wallHeight: WALL, surface: 'steel' });
  b.mark('hall');
  b.arc(16, -90).straight(40).arc(16, 90).straight(40).arc(16, -90).straight(20);
  b.section('Smelter Trench', { halfWidth: 9, wallHeight: WALL, surface: 'steel' });
  b.mark('trench');
  b.straight(140);
  b.mark('trenchEnd');
  b.straight(10);

  b.section('Scrapyard Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'steel' });
  b.mark('leap');
  b.arc(36, -90).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'lava');
  b.elevate(0).straight(20);

  b.section('Nonagon Door', { halfWidth: 9.5, surface: 'steel' });
  b.mark('door');
  b.straight(5);
  b.mark('doorFrom');
  b.arc(DOOR_R, -DOOR_TURN).arc(DOOR_R, 2 * DOOR_TURN).arc(DOOR_R, -DOOR_TURN);
  b.mark('doorTo');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
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
      { s: at('leap', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['esses', 'climb', 'drop', 'hall', 'trench', 'leap', 'door'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'factoryGate', ribbon: -1, s: 6 },
      { kind: 'factoryGate', ribbon: -1, s: at('hall', -2) },
      { kind: 'robotColossus', ribbon: -1, s: at('drop', 60), lateral: 120 },
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
      { kind: 'robots', at: [at('hall', 45), at('hall', 125)], period: 5 },
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
