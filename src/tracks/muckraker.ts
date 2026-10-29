import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.1;
const START: Pose = { x: -92 * K, z: -120 * K, h: Math.PI / 2 };
const FINISH = 45;
/** The rake's head: three tines the road runs out and back along, a hairpin of this radius at each tip, this long. */
const TINE_R = 15;
const TINE = 36;
/** The Fairway swings out round the pond in three arcs of this radius and turn. */
const POND_R = 36;
const POND_TURN = 70;
/** How deep the Muck Pit is sunk, and its walls. */
const DEPTH = 6;
const WALL = 6;
/** The Power Station Climb: a full turn round the chimney, and the top of it. */
const CLIMB_R = 30;
const CLIMB_TOP = 14;
/** How high the dunes on the Handle rise. */
const DUNE = 4;

/**
 * Muckraker (the 12 Bar Bruise Cup's second), after the album's second
 * song: a shit kicker's song with the cobwebs cleared off his brain, the
 * ants come and the rain on the way, raking the muck, just his luck. Its
 * video was shot on old VHS cameras at Anglesea, the band at Coogoorah
 * Reserve's wetlands and golfing by the old power station, so the world is
 * Anglesea in the rain on tape: wetlands, reeds and boardwalks, a golf
 * course gone to mud, the power station's chimney over it all. The lap is
 * a rake: from Cobweb Straight (two kickers) down the Handle, an S over two
 * dunes, then through
 * its head, out and back along three tines, hairpin after hairpin, raking
 * the muck. Into the Muck Pit, sunk 6 m between walls of mud, a rake
 * dragging one clean furrow through four lanes of muck, the road an S
 * between the banks; zigzagging across the Coogoorah Boardwalk over the
 * wetland, no rails; the River Leap over the Anglesea River; the Ant Trail,
 * narrow;
 * then the Fairway swinging out round a pond, which the Water Hazard jumps
 * straight across from lap 2; a full turn up round the chimney and over the
 * road below, and the Tempo Change, the song speeding up and slowing down,
 * home. Rakes drag through the Tines too.
 */
export function buildMuckraker(): TrackDef {
  const b = new TrackBuilder(START, 'Cobweb Straight', { halfWidth: 11, surface: 'muck' });
  b.scale = K;
  b.straight(34).mark('kick1').kicker().straight(26).mark('kick2').kicker().straight(40);

  b.section('The Handle', { halfWidth: 10, surface: 'muck' });
  b.mark('handle');
  b.straight(30);
  // Over the dunes behind the beach: an S, rising and falling.
  b.mark('dunes');
  b.arc(30, 30).arc(30, -60).arc(30, 30);
  b.mark('dunesEnd');
  b.straight(10);

  // The rake's head: out along each tine and back, a hairpin at every tip.
  b.section('The Tines', { halfWidth: 9, wallHeight: 1.2, surface: 'muck' });
  b.mark('tines');
  // Up the rake's head, and out and back along each tine off it.
  b.arc(30, -90);
  for (let k = 0; k < 3; k++) {
    b.mark(`tine${k}`);
    b.arc(TINE_R, 90).straight(TINE).arc(TINE_R, -180).straight(TINE).arc(TINE_R, 90);
  }
  b.mark('tinesEnd');
  b.straight(10);

  // Round the power station's chimney, climbing, over the road below, and dropping off the top into the muck.
  b.section('Power Station Climb', { halfWidth: 9.5, wallHeight: 1.2, surface: 'muck', bridge: true });
  b.mark('climb');
  b.arc(CLIMB_R, -360);
  b.mark('climbTop');
  b.straight(15);
  b.section('Chimney Drop', { halfWidth: 10, wallHeight: 1.2, surface: 'muck' });
  b.mark('drop');
  b.arc(30, -90);
  b.straight(50);

  b.section('Muck Pit', { halfWidth: 9, wallHeight: WALL, surface: 'muck' });
  b.mark('pit');
  // The rake's drag through the muck: an S between the banks.
  b.straight(20).arc(70, 25).arc(70, -50).arc(70, 25);
  b.mark('pitEnd');
  b.straight(10);

  b.section('Coogoorah Boardwalk', { halfWidth: 9, surface: 'boards', bridge: true });
  b.mark('boardwalk');
  // Zigzagging over the wetland, as Coogoorah's boardwalks do.
  b.arc(22, 40).arc(22, -80).arc(22, 80).arc(22, -40);
  b.mark('boardwalkEnd');

  // Over the Anglesea River where it runs out of the wetland.
  b.section('River Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'boards' });
  b.mark('river');
  b.straight(15).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20, 'water');
  b.elevate(0).straight(15);
  b.mark('landed');

  b.section('Ant Trail', { halfWidth: 8, wallHeight: 1.2, surface: 'muck' });
  b.mark('ants');
  b.arc(26, 40).arc(26, -80).arc(26, 40);
  b.arc(45, -90);

  b.section('The Fairway', { halfWidth: 11, surface: 'muck' });
  b.mark('fairway');
  b.straight(20);
  b.mark('hazardFrom');
  b.arc(POND_R, POND_TURN).arc(POND_R, -2 * POND_TURN).arc(POND_R, POND_TURN);
  b.mark('hazardTo');
  b.straight(25);
  b.section('Eighteenth Hole', { halfWidth: 10.5, surface: 'muck' });
  b.mark('hole');
  b.arc(40, -90);

  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'muck' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // Two dunes over the S on the Handle.
  b.profile(m('dunes'), m('dunesEnd'), (u) => DUNE * Math.sin(Math.PI * 2 * u) ** 2);
  ease(b, m('pit', 100), -DEPTH, m('pitEnd', 10), 0);
  b.profile(m('climb'), m('climbTop'), (u) => CLIMB_TOP * u);
  b.profile(m('climbTop'), m('pit'), () => CLIMB_TOP, 10);
  plunge(b, m('pit'), CLIMB_TOP, m('pit', 85), -DEPTH);

  const main = b.finish(true);
  const water = buildWaterHazard(b.marks.hazardFrom, b.marks.hazardTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'muckraker',
    name: 'Muckraker',
    main,
    branches: [water.branch],
    pits: [...b.pits, ...water.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('hole', 70), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('boardwalkEnd', 10), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['handle', 'tines', 'climb', 'drop', 'pit', 'boardwalk', 'ants', 'fairway', 'hole'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'rakeGate', ribbon: -1, s: 6 },
      { kind: 'rakeGate', ribbon: -1, s: at('pit', -2) },
      { kind: 'powerStation', ribbon: -1, s: at('pit', 20), lateral: 130 },
    ],
    itemBoxes: [
      { s: 62, count: 4 },
      { s: at('drop', 20), count: 4 },
      { s: at('tinesEnd', 0), count: 3 },
      { s: at('boardwalk', 80), count: 3 },
      { s: at('fairway', 5), count: 4 },
      { s: water.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'rakes', at: [at('pit', 100), at('pit', 132)], period: 4.6 },
      { kind: 'rakes', at: [b.marks.tine0.s + 40 * K, b.marks.tine2.s + 40 * K], period: 5 },
    ],
    theme: 'muck',
    music: { lap: 'muckraker', finalLap: 'muckraker-final-lap' },
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
 * The Water Hazard: straight across the pond the Fairway swings round, off
 * a tee box and over the water. Open from lap 2; on lap 1 the groundsman
 * has it roped off and there's nothing but pond.
 */
function buildWaterHazard(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Water Hazard', { halfWidth: 6, surface: 'muck' });
  b.straight(24);
  b.section('The Tee', { halfWidth: 5, surface: 'boards' });
  b.mark('ramp');
  b.elevate(0).rise(18, 3);
  const pond = 12;
  b.gap(pond, 30, 'water');
  const boxes = b.s + 10;
  b.elevate(0);
  b.section('Water Hazard', { halfWidth: 6, surface: 'muck' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Water Hazard', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2, 3], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
