import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: 60 * K, z: 170 * K, h: Math.PI / 2 };
const FINISH = 50;
/** The Courtyard: the road swings round a well in three arcs of this radius and turn, open where the Cloud Bridge forks off and back. */
const COURT_R = 34;
const COURT_TURN = 70;
const COURT_OPEN = 56;
/** Heights: the battlements, the top of the Tower Spiral, the leap and the courtyard. */
const RAMPART_Y = 6;
const TOWER_TOP = 20;
const LEAP_Y = 15;
const COURT_Y = 5;
/** The Tower Spiral's radius. */
const TOWER_R = 24;

/**
 * The Castle in the Air (the Polygondwanaland Cup's second), after the
 * song: a castle on the clouds, with nothing below it. A cloud road with
 * two kickers, round the ramparts and along the Battlements, where gusts
 * blow across, a full turn up the Tower Spiral and over its own start,
 * down the Sky Bridge and off the Drawbridge Leap. The Courtyard swings
 * round its well, and on the second lap only, a bridge of cloud is there
 * straight across it. The Wind Gallery brings you home.
 */
export function buildCastleInTheAir(): TrackDef {
  const b = new TrackBuilder(START, 'Cloud Road', { halfWidth: 11, surface: 'cloud' });
  b.scale = K;
  b.straight(30).mark('kick1').kicker().straight(26).kicker().straight(40);

  b.section('Rampart Bend', { halfWidth: 10, wallHeight: 1.2, surface: 'flagstone' });
  b.mark('ramparts');
  b.arc(40, 110);
  b.section('Battlements', { halfWidth: 9.5, wallHeight: 1.2, surface: 'flagstone' });
  b.mark('battlements');
  b.straight(110);

  // A full turn round the tower, climbing over the road it started on.
  b.section('Tower Spiral', { halfWidth: 9.5, wallHeight: 1.2, surface: 'flagstone', bridge: true });
  b.mark('tower');
  b.arc(TOWER_R, -360);
  b.mark('towerTop');
  b.section('Sky Bridge', { halfWidth: 9, wallHeight: 1.2, surface: 'cloud' });
  b.mark('skyBridge');
  b.straight(40);
  // Switchbacks down the keep's walls.
  b.section('Keep Switchbacks', { halfWidth: 8.5, wallHeight: 1.2, surface: 'flagstone' });
  b.mark('switchbacks');
  b.arc(22, 170).straight(16).arc(22, -170).straight(16).arc(22, 40);

  b.section('Drawbridge Leap', { halfWidth: 9, surface: 'flagstone' });
  b.mark('leap');
  b.straight(20).elevate(LEAP_Y).rise(20, LEAP_Y + 3);
  b.gap(16, 30);
  b.elevate(LEAP_Y).straight(25);
  b.mark('landed');

  b.section('Courtyard', { halfWidth: 9.5, wallHeight: 1.2, surface: 'flagstone' });
  b.mark('court');
  b.arc(40, 70).straight(10);
  // Open edges only while the two roads still touch, so a kart sliding wide lands on one or the other.
  b.section('Courtyard', { halfWidth: 9.5, surface: 'flagstone' });
  b.straight(5);
  b.mark('cloudFrom');
  b.arc(COURT_R, -COURT_OPEN);
  b.section('Courtyard', { halfWidth: 9.5, wallHeight: 1.2, surface: 'flagstone' });
  b.arc(COURT_R, COURT_OPEN - COURT_TURN).arc(COURT_R, 2 * COURT_TURN).arc(COURT_R, COURT_OPEN - COURT_TURN);
  b.section('Courtyard', { halfWidth: 9.5, surface: 'flagstone' });
  b.arc(COURT_R, -COURT_OPEN);
  b.mark('cloudTo');
  b.straight(5);

  b.section('Wind Gallery', { halfWidth: 10, wallHeight: 1.2, surface: 'flagstone' });
  b.mark('gallery');
  b.turnTo(offsetPose(START, -FINISH * K), 40);
  b.section('Finish Straight', { halfWidth: 11, surface: 'cloud' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, all in the air: up the ramparts, round and up the tower, down to the leap, the courtyard, and a plunge home.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  ease(b, m('ramparts', 5), m('battlements'), 0, RAMPART_Y);
  b.profile(m('battlements'), m('tower'), () => RAMPART_Y, 10);
  b.profile(m('tower'), m('towerTop'), (u) => RAMPART_Y + (TOWER_TOP - RAMPART_Y) * u);
  ease(b, m('towerTop'), m('skyBridge', 20), TOWER_TOP, TOWER_TOP + 1);
  ease(b, m('skyBridge', 20), m('leap', 18), TOWER_TOP + 1, LEAP_Y);
  ease(b, m('landed'), m('cloudFrom', -4), LEAP_Y, COURT_Y);
  // The courtyard swing rises between the forks, the Cloud Bridge staying level.
  ease(b, m('cloudFrom', 40), (m('cloudFrom') + m('cloudTo')) / 2, COURT_Y, COURT_Y + 4);
  ease(b, (m('cloudFrom') + m('cloudTo')) / 2, m('cloudTo', -40), COURT_Y + 4, COURT_Y);
  // A crest out of the gallery, and down to the line.
  ease(b, m('gallery', 10), m('gallery', 50), COURT_Y, COURT_Y + 4);
  line(b, m('gallery', 50), m('gallery', 80), COURT_Y + 4, 1);
  ease(b, m('gallery', 80), m('finish', -10), 1, 0);

  const main = b.finish(true);
  const cloud = buildCloudBridge(b.marks.cloudFrom, b.marks.cloudTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'castle-in-the-air',
    name: 'The Castle in the Air',
    main,
    branches: [cloud.branch],
    pits: b.pits,
    boostPads: [
      { s: at('battlements', 70), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: b.marks.leap.s + 20, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('gallery', 30), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['ramparts', 'battlements', 'tower', 'skyBridge', 'court', 'gallery'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 420,
    abyss: true,
    landmarks: [
      { kind: 'cloudGate', ribbon: -1, s: 0 },
      { kind: 'cloudGate', ribbon: -1, s: at('court', 2) },
      { kind: 'skyTower', ribbon: -1, s: b.marks.tower.s, lateral: TOWER_R * K },
      { kind: 'airCastle', ribbon: -1, s: at('battlements', 60), lateral: -140 },
    ],
    itemBoxes: [
      { s: at('kick1', 45), count: 4 },
      { s: at('battlements', 10), count: 3 },
      { s: at('skyBridge', 30), count: 3 },
      { s: at('court', 40), count: 4 },
      { s: at('gallery', 60), count: 4 },
      { s: cloud.boxes, count: 2, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'gusts', at: [at('battlements', 25), at('battlements', 60)], period: 3.4 },
      { kind: 'gusts', at: [at('gallery', 15)], period: 3 },
    ],
    theme: 'skycastle',
    music: { lap: 'castle-in-the-air', finalLap: 'castle-in-the-air-final-lap' },
  };
}

/** Eases the road from height y0 to y1 between arc lengths s0 and s1, level at both ends. */
function ease(b: TrackBuilder, s0: number, s1: number, y0: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + ((y1 - y0) * (1 - Math.cos(Math.PI * u))) / 2);
}

/** A straight slope from y0 to y1: a plunge, with a crest at its top. */
function line(b: TrackBuilder, s0: number, s1: number, y0: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * u);
}

/** The Cloud Bridge: a narrow, rail-less road of cloud straight across the courtyard, there on the second lap only. */
function buildCloudBridge(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Cloud Bridge', { halfWidth: 6, surface: 'cloud' });
  b.elevate(COURT_Y).straight(30);
  b.section('Cloud Bridge', { halfWidth: 4.5, surface: 'cloud' });
  b.straight(chord - 60);
  b.section('Cloud Bridge', { halfWidth: 6, surface: 'cloud' });
  b.straight(30).elevate(COURT_Y);
  const branch: BranchDef = { name: 'Cloud Bridge', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2], shut: { kind: 'vanish' } };
  return { branch, boxes: chord / 2 };
}
