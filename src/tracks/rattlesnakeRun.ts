import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const START: Pose = { x: 80, z: -190, h: Math.PI / 2 };
const MESA_RUN_UP = 30;
const MESA_RAMP = 40;
const MESA_GAP = 12;
const FINISH_STRAIGHT = 60;
/** Room left for the closing curve between Deserted Dunes and the Mesa straight. */
const CLOSING_SLACK = 55;

/**
 * Rattlesnake Run greybox (spec section 7). Seen from above the course is a
 * coiled snake: a straight tail, serpentine S-bends, a narrow canyon, a
 * double-spiral coil, the long Sleep Drifter straight, round Billabong
 * Valley, then a leap over a dry riverbed back to the line.
 */
export function buildRattlesnakeRun(): TrackDef {
  // Lay the track out once, then stretch Sleep Drifter so the loop closes cleanly.
  const mesaLength = MESA_RUN_UP + MESA_RAMP + MESA_GAP + FINISH_STRAIGHT;
  const target = offsetPose(START, -mesaLength);
  const trial = layout(120);
  const overshoot = trial.marks.washEnd.pose.x - (target.x - CLOSING_SLACK);
  const b = layout(120 + overshoot);

  b.hermiteTo(target, 0.9);
  b.section('Mesa Leap', { halfWidth: 10, wallHeight: 1.2 });
  b.mark('mesa');
  b.straight(MESA_RUN_UP);
  b.elevate(0).straight(MESA_RAMP).elevate(5);
  b.gap(MESA_GAP, 45);
  b.elevate(0);
  b.section('Finish Straight', { halfWidth: 12 });
  b.straight(FINISH_STRAIGHT);

  const main = b.finish(true);
  const shortcut = buildShortcut(b.marks.bumpStart, b.marks.bumpEnd);

  return {
    id: 'rattlesnake-run',
    name: 'Rattlesnake Run',
    main,
    branches: [shortcut.branch],
    pits: [...b.pits, ...shortcut.pits],
    boostPads: [
      { s: 60, length: 8, lateral: -6, halfWidth: 2.5 },
      { s: 60, length: 8, lateral: 6, halfWidth: 2.5 },
      { s: 120, length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['sBends', 'canyon', 'coil', 'wash', 'mesa'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 420,
    landmarks: [
      { kind: 'skeletonArch', ribbon: -1, s: 0 },
      { kind: 'fangs', ribbon: 0, s: shortcut.caveStart },
    ],
    itemBoxes: [
      { s: 95, count: 4 },
      { s: b.marks.canyon.s - 18, count: 3 },
      { s: b.marks.wash.s + 25, count: 4 },
      { s: b.marks.mesa.s + 8, count: 4 },
      { s: shortcut.caveStart + 35, count: 2, ribbon: 0, span: 6, double: true },
    ],
    hazards: [
      { kind: 'dustDevils', from: 20, to: 165, count: 2 },
      { kind: 'snakes', from: b.marks.sBends.s + 25, to: b.marks.canyon.s - 40, count: 3, period: 8 },
      { kind: 'tumbleweeds', from: b.marks.canyon.s + 5, to: b.marks.coil.s - 5, count: 3 },
      { kind: 'boulders', at: [b.marks.canyon.s + 55, b.marks.canyon.s + 115], period: 7 },
    ],
    theme: 'desert',
    music: { lap: 'rattlesnake-run', finalLap: 'rattlesnake-run-final-lap' },
  };
}

function layout(washLength: number): TrackBuilder {
  const b = new TrackBuilder(START, 'Salt Flat Straight', { halfWidth: 13, surface: 'salt' });
  // A kicker that lands just short of the boost pads.
  b.straight(23).kicker().straight(140);

  b.section('Sidewinder S-Bends', { halfWidth: 9 });
  b.arc(40, -90);
  b.mark('sBends');
  const bend = 50;
  b.arc(32, bend).arc(32, -2 * bend).arc(32, 2 * bend).arc(32, -2 * bend).arc(32, 2 * bend).arc(32, -bend);
  b.straight(10).arc(40, -90);

  b.section('Rattle Canyon', { halfWidth: 6.5, wallHeight: 9, surface: 'rock' });
  b.mark('canyon');
  b.straight(35).arc(90, 22).straight(30).arc(90, -22).straight(30);

  b.section('The Coil', { halfWidth: 8, wallHeight: 1.5 });
  b.mark('coil');
  b.spiral(46, 15, -270).straight(10).spiral(15, 46, 270);

  // Sleep Drifter: the long heat-haze straight, two kickers to chain.
  b.section('Sleep Drifter', { halfWidth: 10 });
  b.mark('wash');
  b.straight(63).kicker().straight(53).kicker().straight(washLength - 130);
  b.arc(45, -90).straight(5);
  // Billabong Valley: round Mad Dog Morgan's waterhole, or through the Snake's Mouth.
  b.section('Billabong Valley', { halfWidth: 10 });
  b.mark('bumpStart');
  const bumpR = 55;
  b.arc(bumpR, 60).arc(bumpR, -120).arc(bumpR, 60);
  b.mark('bumpEnd');
  b.section('Deserted Dunes', { halfWidth: 10 });
  b.straight(5).arc(45, -90);
  b.mark('washEnd');
  return b;
}

/** Snake's Mouth: a straight cut across the Billabong Valley bulge with a jump into a cave: at 50cc it takes a boost. */
function buildShortcut(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, "Snake's Mouth", { halfWidth: 7 });
  b.straight(38).elevate(0).straight(16).elevate(2.2);
  b.gap(20, 14);
  b.elevate(0);
  const caveStart = b.s;
  b.section("Snake's Mouth Cave", { halfWidth: 7, wallHeight: 6, surface: 'rock' });
  b.straight(chord - b.s - 35);
  b.section("Snake's Mouth", { halfWidth: 7 });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: "Snake's Mouth Shortcut", mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
  return { branch, pits: b.pits, caveStart };
}
