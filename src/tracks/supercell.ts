import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: -70 * K, z: 165 * K, h: Math.PI / 2 };
const FINISH = 45;
/** Downdraft: the road blows out round a flooded field in three arcs of this radius and turn. */
const LEVEE_R = 34;
const LEVEE_TURN = 70;

/**
 * Supercell (hard): prairie roads under a storm the size of a county, in
 * rain and green-black light. Tornadoes wander the open plain flinging
 * karts aside (and karts off the kickers there), lightning strikes where a
 * ring of warning closes, hail the size of boulders falls on the farm, a
 * creek has burst over the road, the bridge across it has no rails, and a
 * narrow levee (Converge) cuts straight across the flooded Downdraft.
 */
export function buildSupercell(): TrackDef {
  const b = new TrackBuilder(START, 'County Road', { halfWidth: 11, surface: 'wet' });
  b.scale = K;
  b.straight(150).arc(48, 90);

  // Flying cows: two kickers down the alley, among the tornadoes.
  b.section('Tornado Alley', { halfWidth: 10, surface: 'wet' });
  b.mark('alley');
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(57.5);

  b.section('Silo Hairpins', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.mark('silo');
  b.arc(26, -180).straight(40).arc(26, 180).straight(80).arc(42, 90);

  b.section('Hailstone Farm', { halfWidth: 9, surface: 'wet' });
  b.mark('farm');
  b.straight(80).arc(32, -70).arc(32, 70).straight(85);

  b.section('Flooded Creek', { halfWidth: 8, surface: 'boards' });
  b.mark('creek');
  b.elevate(0).straight(10).elevate(1.5);
  b.bridge(60, 30, 'water');
  b.elevate(1.5).straight(10).elevate(0);

  b.section('Washout', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.mark('washout');
  b.arc(36, 90).straight(10).rise(18, 3);
  b.gap(13, 30, 'water');
  b.elevate(0).straight(20);

  b.section('Downdraft', { halfWidth: 9.5, surface: 'wet' });
  b.mark('down');
  b.straight(5);
  b.mark('leveeFrom');
  b.arc(LEVEE_R, -LEVEE_TURN).arc(LEVEE_R, 2 * LEVEE_TURN).arc(LEVEE_R, -LEVEE_TURN);
  b.mark('leveeTo');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'wet' });
  b.straight(FINISH);

  const main = b.finish(true);
  const levee = buildLevee(b.marks.leveeFrom, b.marks.leveeTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'supercell',
    name: 'Supercell',
    main,
    branches: [levee.branch],
    pits: [...b.pits, ...levee.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('alley', 100), length: 8, lateral: 3, halfWidth: 2.5 },
      { s: at('washout', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['alley', 'silo', 'farm', 'creek', 'washout', 'down'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'rodGate', ribbon: -1, s: 6 },
      { kind: 'rodGate', ribbon: -1, s: at('farm', 2) },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('alley', 20), count: 4 },
      { s: at('farm', 50), count: 3 },
      { s: at('washout', 15), count: 3 },
      { s: at('down', 45), count: 4 },
      { s: levee.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'tornadoes', from: at('alley', 10), to: at('alley', 150), count: 2 },
      { kind: 'lightning', at: [100, 130, at('down', 10), at('creek', 30)], period: 4.5 },
      { kind: 'hail', at: [at('farm', 20), at('farm', 60), at('farm', 100)], period: 5 },
    ],
    theme: 'storm',
    music: { lap: 'supercell', finalLap: 'supercell-final-lap' },
  };
}

/**
 * Converge: a narrow levee with no rails, straight across the flooded
 * field the Downdraft blows round. Slip off it and you're in the water.
 */
function buildLevee(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Converge', { halfWidth: 6, surface: 'wet' });
  b.straight(30);
  b.section('Converge Levee', { halfWidth: 4, surface: 'boards' });
  b.elevate(0).straight(12).elevate(1);
  const flood = chord - 2 * b.s;
  const boxes = b.s + flood / 2;
  b.bridge(flood, 7, 'water');
  b.elevate(1).straight(12).elevate(0);
  b.section('Converge', { halfWidth: 6, surface: 'wet' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Converge', mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
  return { branch, pits: b.pits, boxes };
}
