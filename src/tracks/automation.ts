import { ROAD_WIDTH_SCALE, TrackBuilder, dubins, type Pose, type SectionProps } from './builder';
import { BPM } from '../kits/automation';
import type { BranchDef, TrackDef } from './track';

/**
 * Automation (K.G., 2020), seen from above: a figure of eight through a
 * factory where the machines have taken the work. The lap clocks in at the
 * gate and runs up the production line under the presses, hairpins round
 * the robot arms, snakes through the empty office and round the wall of
 * screens, then climbs onto the overhead assembly deck and crosses the
 * production line high over it. Off the deck it sweeps round the east
 * side, past the pink slips and through the server farm, and the last
 * turn, the lights-out factory, brings it round into the straight home,
 * clocking out. The override, a tighter lane inside that last turn, opens
 * from the second lap.
 */

/** The overhead assembly deck: the road this high over the production line it crosses. */
export const DECK = 10;
/** The deck's ramp up, its flat run either side of the crossing, and its way down. */
const RAMP = 90;
const FLAT = 60;
const DECK_DROP = 80;
/** The deck's walls, high: nothing drops off the deck onto the line below. */
export const DECK_WALL = 3;
/** The presses: three gantries across the production line this far apart, the first this far up it. */
export const PRESS_APART = 50;
const PRESS_FROM = 140;
/** The production line's length, and how far up it the deck crosses (the desks' straight is laid to put it there). */
const LINE = 370;
const CROSS_AT = 84;
/** The server farm's straight down the east side, as long as the straight home is far from the U at its foot (the pink slips' straight is laid to fit it). */
const SERVER_RUN = 45;
/** A bar of the song: each press stamps its lanes in turn, a beat apart, a bar round. */
export const PRESS_PERIOD = (60 / BPM) * 4;
/** The override: it leaves at the top of the lights-out U, turns tighter inside it (LANE_R against the U's LAST_R), and meets the road again this far into the straight home. */
const LANE_FROM = 4;
const LANE_TO = 25;
const LANE_R = 55;
const LANE_OPEN = 1;
/** The last turn's half width, and the radius of its two corners. */
const LAST_HW = 10.5;
const LAST_R = 110;
/** The straight home, from the last turn to the line. */
const TAIL = 110;

const props = (hw: number, wall: number, extra: Partial<SectionProps> = {}): SectionProps => ({ halfWidth: hw, wallHeight: wall, surface: 'conveyor', ...extra });

const START: Pose = { x: 0, z: -170, h: 0 };
const HOME: Pose = { x: START.x, z: START.z - TAIL, h: 0 };

/** Lays the whole lap onto `b`, sections and marks too. */
function lay(b: TrackBuilder, deskRun: number, slipRun: number) {
  // Clocking in: out of the gate past the time clock.
  b.straight(110);
  // The production line: straight up the factory floor, under the deck and then the presses.
  b.section('The Production Line', props(11, 1.4));
  b.mark('line');
  b.straight(LINE);
  // The robot arms: a wide hairpin round the welding cell.
  b.section('Arms That Never Tire', props(11, 1.4));
  b.mark('arms');
  b.arc(100, -180);
  // The empty office: a chicane between the desks with nobody at them.
  b.section('Nobody at the Desk', props(10, 1.4));
  b.mark('desk');
  b.straight(deskRun).arc(65, 30).arc(65, -60).arc(65, 30);
  // The wall of screens: out west and round, the screens on both sides.
  b.section('Screens Watching Screens', props(10.5, 1.4));
  b.mark('screens');
  b.arc(50, 90).straight(20).arc(52, -180);
  // Heading east now, straight at the production line: the deck's ramp starts so it's at full height FLAT before the crossing.
  b.straight(-b.pose.x - FLAT - RAMP);
  // Onto the overhead deck, and across the line high over it.
  b.section('Machines Building Machines', props(10.5, DECK_WALL, { bridge: true }));
  b.mark('machines');
  b.straight(RAMP + FLAT);
  b.mark('cross');
  b.straight(FLAT);
  b.mark('crest');
  // Off the deck, and the long sweep round the east side.
  b.section('The Algorithm Decides', props(10.5, DECK_WALL, { bridge: true }));
  b.mark('algorithm');
  b.straight(DECK_DROP);
  b.section('The Algorithm Decides', props(11, 1.4));
  b.mark('decided');
  b.straight(35).arc(80, 90);
  b.section('Pink Slips', props(11, 1.4));
  b.mark('slips');
  b.straight(slipRun).arc(50, -35).arc(50, 70).arc(50, -35);
  // Heading south now: the server farm straight down the east side, as far as the straight home is long.
  b.section('The Server Farm', props(10.5, 1.4));
  b.mark('servers');
  b.straight(SERVER_RUN);
  // The last turn, a wide U round into the straight home: a quarter, a straight along the bottom, and a quarter.
  b.section('Lights-Out Factory', props(LAST_HW, 1.4));
  b.mark('lightsOut');
  const bottom = b.pose.x - 2 * LAST_R;
  b.arc(LAST_R, 90).straight(bottom).arc(LAST_R, 90);
  b.section('Clocking Out', props(11, 1.4));
  b.mark('home');
  b.straight(TAIL);
}

/** A pose on a laid ribbon `s` metres along it. */
function poseOn(points: readonly (readonly [number, number])[], s: number): Pose {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const l = Math.hypot(bx - ax, bz - az);
    if (d + l >= s) {
      const u = (s - d) / l;
      return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, h: Math.atan2(bx - ax, bz - az) };
    }
    d += l;
  }
  throw new Error('past the end');
}

/** Which side of the road at arc length s has more room for a landmark `away` metres off it: that lateral, signed. */
function clearSide(points: readonly (readonly [number, number])[], s: number, away: number): number {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const p = poseOn(points, s);
  const room = (side: number) => {
    const x = p.x - Math.cos(p.h) * side * away;
    const z = p.z + Math.sin(p.h) * side * away;
    let m = Infinity;
    for (let i = 0; i < points.length; i++) if (Math.abs(cum[i] - s) > 60) m = Math.min(m, Math.hypot(points[i][0] - x, points[i][1] - z));
    return m;
  };
  return (room(1) > room(-1) ? 1 : -1) * away;
}

/** The override: a tighter line inside the lights-out turn, out of the dark and into the straight home. */
function buildLane(b: TrackBuilder, points: readonly (readonly [number, number])[], length: number) {
  const from = b.marks.lightsOut.s + LANE_FROM;
  const to = b.marks.home.s + LANE_TO;
  const lane = new TrackBuilder(poseOn(points, from), 'The Override', { halfWidth: 5, wallHeight: 2.2, surface: 'conveyor' });
  for (const [kind, l] of dubins(lane.pose, poseOn(points, to), LANE_R)) {
    if (kind === 'S') lane.straight(l);
    else lane.arc(LANE_R, ((kind === 'L' ? 1 : -1) * l * 180) / (Math.PI * LANE_R));
  }
  const len = lane.s;
  const mid = len / 2;
  lane.profile(0, len, () => 0, 10);
  const ribbon = lane.finish(false);
  // Walled once it's off the road it leaves and until it meets it again: a wall over the road itself would catch karts going round the long way.
  const [sec] = ribbon.sections;
  const room = (q: readonly [number, number]) => Math.min(...points.map((m) => Math.hypot(m[0] - q[0], m[1] - q[1]))) - (sec.halfWidth + LAST_HW) * ROAD_WIDTH_SCALE;
  const cum = [0];
  for (let i = 1; i < ribbon.points.length; i++) cum.push(cum[i - 1] + Math.hypot(ribbon.points[i][0] - ribbon.points[i - 1][0], ribbon.points[i][1] - ribbon.points[i - 1][1]));
  const clear = ribbon.points.map((q, i) => (room(q) > LANE_OPEN ? cum[i] : NaN)).filter((d) => !Number.isNaN(d));
  const [w0, w1] = [Math.min(...clear), Math.max(...clear)];
  ribbon.sections = [
    { ...sec, to: w0, wallHeight: 0 },
    { ...sec, from: w0, to: w1 },
    { ...sec, from: w1, wallHeight: 0 },
  ];
  const branch: BranchDef = { name: 'The Override', mainFrom: from, mainTo: to, ...ribbon, openOn: [2, 'final'], shut: { kind: 'vanish' } };
  void length;
  // The road it leaves and joins is open on that side there, or its wall would stand across the lane's mouth.
  return { branch, pits: lane.pits, mid, open: [[from - 5, from + w0 + 5], [to - (len - w1) - 5, to + 5]] as [number, number][] };
}

/**
 * Automation (K.G., 2020): the machines have taken the work, and the
 * factory runs on without anyone in it. The lap is the factory, a figure
 * of eight crossed by its own overhead assembly deck.
 */
export function buildAutomation(): TrackDef {
  // A first laying finds how far the west side drops, and the desks' straight takes up the rest so the deck crosses CROSS_AT up the line.
  const probe = new TrackBuilder(START, 'Clocking In', props(11, 1.4));
  lay(probe, 0, 0);
  const deskRun = probe.marks.machines.pose.z - (probe.marks.line.pose.z + CROSS_AT);
  if (deskRun < 0) throw new Error(`Automation: the west side drops ${-deskRun.toFixed(0)} m too far`);
  // And a second, how far the east side drops: the pink slips' straight takes up the rest down to the U.
  const east = new TrackBuilder(START, 'Clocking In', props(11, 1.4));
  lay(east, deskRun, 0);
  const slipRun = east.marks.servers.pose.z - SERVER_RUN - HOME.z;
  if (slipRun < 0) throw new Error(`Automation: the east side drops ${-slipRun.toFixed(0)} m too far`);
  const b = new TrackBuilder(START, 'Clocking In', props(11, 1.4));
  lay(b, deskRun, slipRun);
  const m = (name: string, d = 0) => b.marks[name].s + d;
  const ease = (s0: number, y0: number, s1: number, y1: number) => b.profile(s0, s1, (u) => y0 + (y1 - y0) * u * u * (3 - 2 * u));
  // Up the ramp onto the deck, across, and off its crest: the way down falls away fast at first, for some air.
  ease(m('machines'), 0, m('machines', RAMP), DECK);
  b.profile(m('machines', RAMP), m('crest'), () => DECK, 10);
  b.profile(m('crest'), m('decided'), (u) => DECK * (1 - Math.sin((Math.PI * u) / 2)), 4);

  const main = b.finish(true);
  const lane = buildLane(b, main.points, main.length);
  for (const [o0, o1] of lane.open) {
    main.sections = main.sections.flatMap((q) => {
      if (q.to <= o0 || q.from >= o1) return [q];
      return [
        ...(q.from < o0 ? [{ ...q, to: o0 }] : []),
        { ...q, from: Math.max(q.from, o0), to: Math.min(q.to, o1), wallHeight: 0 },
        ...(q.to > o1 ? [{ ...q, from: o1 }] : []),
      ];
    });
  }
  const at = (mark: string, d = 0) => b.marks[mark].s + d;
  const stations = [0, 1, 2].map((k) => at('line', PRESS_FROM + k * PRESS_APART));
  return {
    id: 'automation',
    name: 'Automation',
    main,
    branches: [lane.branch],
    pits: [...b.pits, ...lane.pits],
    boostPads: [
      { s: at('arms', 150), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('screens', 200), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('slips', 90), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('home', 50), length: 8, lateral: 0, halfWidth: 3 },
    ],
    checkpoints: ['line', 'arms', 'desk', 'screens', 'machines', 'cross', 'algorithm', 'decided', 'slips', 'servers', 'lightsOut', 'home'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'timeClock', ribbon: -1, s: 6 },
      // The welding cell in the middle of the hairpin it's named for.
      { kind: 'robotArms', ribbon: -1, s: at('arms', 157), lateral: 100 },
      { kind: 'emptyOffice', ribbon: -1, s: at('desk', 50), lateral: clearSide(main.points, at('desk', 50), 34) },
      { kind: 'screenWall', ribbon: -1, s: at('screens', 40), to: at('screens', 260) },
      { kind: 'assemblyDeck', ribbon: -1, s: at('machines', 30), to: at('algorithm', 40) },
      { kind: 'algorithm', ribbon: -1, s: at('decided', 60), lateral: clearSide(main.points, at('decided', 60), 40) },
      { kind: 'pinkSlips', ribbon: -1, s: at('slips', 100), lateral: clearSide(main.points, at('slips', 100), 36) },
      { kind: 'serverFarm', ribbon: -1, s: at('servers', 70), lateral: clearSide(main.points, at('servers', 70), 40) },
      // The dark hall outside the U's first corner (the override runs inside it).
      { kind: 'lightsOut', ribbon: -1, s: at('lightsOut', 90), lateral: 54 },
      // The lap dressed stretch by stretch (render/automation.ts, `FIELDS`), each from the section it starts in, and the skyline round the lot.
      { kind: 'factoryField', ribbon: -1, s: 24, to: at('line', 0) },
      { kind: 'factoryField', ribbon: -1, s: at('line', 2), to: at('arms', 0) },
      { kind: 'factoryField', ribbon: -1, s: at('arms', 2), to: at('desk', 0) },
      { kind: 'factoryField', ribbon: -1, s: at('desk', 2), to: at('screens', 0) },
      { kind: 'factoryField', ribbon: -1, s: at('screens', 2), to: at('machines', 0) },
      { kind: 'factoryField', ribbon: -1, s: at('machines', 2), to: at('decided', 0) },
      { kind: 'factoryField', ribbon: -1, s: at('decided', 2), to: at('slips', 0) },
      { kind: 'factoryField', ribbon: -1, s: at('slips', 2), to: at('servers', 0) },
      { kind: 'factoryField', ribbon: -1, s: at('servers', 2), to: at('lightsOut', 0) },
      { kind: 'factoryField', ribbon: -1, s: at('lightsOut', 2), to: at('home', 0) },
      { kind: 'factoryField', ribbon: -1, s: at('home', 2), to: main.length - 10 },
      { kind: 'factorySkyline', ribbon: -1, s: 22 },
    ],
    itemBoxes: [
      { s: at('line', 40), count: 8 },
      { s: at('arms', 60), count: 3 },
      { s: at('desk', 60), count: 3 },
      { s: at('screens', 230), count: 8 },
      // On the ramp, leaving the deck's flat clear for the launcher the game lays there (tracks/enrich.ts).
      { s: at('machines', 40), count: 3 },
      { s: at('decided', 60), count: 8 },
      { s: at('slips', 140), count: 3 },
      { s: at('servers', 40), count: 8 },
      { s: lane.mid, count: 1, ribbon: 0, double: true },
    ],
    hazards: [{ kind: 'presses', at: stations, period: PRESS_PERIOD }],
    theme: 'automated',
    music: { lap: 'automation', finalLap: 'automation-final-lap' },
  };
}
