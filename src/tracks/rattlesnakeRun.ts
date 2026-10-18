import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const START: Pose = { x: 80, z: -190, h: Math.PI / 2 };
const MESA_RUN_UP = 30;
const MESA_RAMP = 40;
const MESA_GAP = 12;
const FINISH_STRAIGHT = 60;
/** Room left for the closing curve between Deserted Dunes and the Mesa straight. */
const CLOSING_SLACK = 55;
/** Up on the mesa, and the lip of the leap off it (a 14 m drop to the salt flat). */
const MESA_Y = 10;
const LIP_Y = 14;
/** The top of the Coil's helix, and the Billabong Valley floor. */
const COIL_Y = 14;
const VALLEY_Y = -6;

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
  b.elevate(MESA_Y).straight(MESA_RAMP).elevate(LIP_Y);
  b.gap(MESA_GAP, 45);
  b.elevate(0);
  b.section('Finish Straight', { halfWidth: 12 });
  b.straight(FINISH_STRAIGHT);

  // Out of Rattle Canyon's floor without a lip, straight on up the Coil's helix and round and down again.
  shape(b, [
    [b.marks.canyonOut.s, -8, 0],
    [b.marks.coilTop.s, COIL_Y, 0],
    [b.marks.wash.s, 0, 0],
  ]);
  // Sleep Drifter: after the kickers, a camelback whose kinked top throws fast karts.
  const k = b.marks.drifter.s;
  shape(b, [
    [k + 10, 0, 0],
    [k + 45, 5, 0.2, -0.04],
    [k + 80, 3.2, -0.08],
    [k + 105, 0, 0],
  ]);
  // Billabong Valley sinks round the waterhole, clear of the Snake's Mouth junctions.
  b.profile(b.marks.bumpStart.s + 45, b.marks.bumpEnd.s - 45, (u) => VALLEY_Y * Math.sin(Math.PI * u) ** 2, 6);
  // Deserted Dunes climb onto the mesa.
  shape(b, [
    [b.marks.bumpEnd.s + 25, 0, 0],
    [b.marks.mesa.s, MESA_Y, 0],
  ]);

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

  // Rattle Canyon is sunk into the desert floor: down into it, round its bends, and back up to the Coil.
  b.section('Rattle Canyon', { halfWidth: 6.5, wallHeight: 9, surface: 'rock' });
  b.mark('canyon');
  b.elevate(0).straight(35).elevate(-8);
  b.arc(90, 22).straight(30).arc(90, -22);
  b.mark('canyonOut');
  b.straight(30).elevate(0);

  // The Coil: a helix on a deck, climbing as it winds in and coming down as it winds out.
  const coil = { halfWidth: 8, wallHeight: 1.5 };
  const r = (deg: number) => 46 - (31 * deg) / 270;
  b.section('The Coil', coil);
  b.mark('coil');
  b.spiral(46, r(90), -90);
  b.section('The Coil', { ...coil, bridge: true });
  b.spiral(r(90), 15, -180).straight(5).mark('coilTop').straight(5);
  b.spiral(15, r(60), 210);
  b.section('The Coil', coil);
  b.spiral(r(60), 46, 60);

  // Sleep Drifter: the long heat-haze straight, two kickers to chain.
  b.section('Sleep Drifter', { halfWidth: 10 });
  b.mark('wash');
  b.straight(63).kicker().straight(53).kicker().mark('drifter').straight(washLength - 130);
  b.arc(45, -90).straight(5);
  // Billabong Valley: round Mad Dog Morgan's waterhole, or through the Snake's Mouth.
  b.section('Billabong Valley', { halfWidth: 10 });
  b.mark('bumpStart');
  const bumpR = 55;
  b.arc(bumpR, 60).arc(bumpR, -120).arc(bumpR, 60);
  b.mark('bumpEnd');
  // Deserted Dunes: open where Snake's Mouth rejoins, walled as it climbs to the mesa.
  b.section('Deserted Dunes', { halfWidth: 10 });
  b.straight(5).arc(45, -30);
  b.section('Deserted Dunes', { halfWidth: 10, wallHeight: 1.2 });
  b.arc(45, -60);
  b.mark('washEnd');
  return b;
}

/**
 * Shapes the road through [s, y, slope] points (a fourth value is the slope
 * leaving the point, for a kink at a crest): a smooth curve between each pair.
 */
function shape(b: TrackBuilder, pts: number[][], step = 6): void {
  for (let k = 1; k < pts.length; k++) {
    const [s0, y0, m0, out = m0] = pts[k - 1];
    const [s1, y1, m1] = pts[k];
    const len = s1 - s0;
    b.profile(s0, s1, (t) => (2 * t ** 3 - 3 * t ** 2 + 1) * y0 + (t ** 3 - 2 * t ** 2 + t) * len * out + (3 * t ** 2 - 2 * t ** 3) * y1 + (t ** 3 - t ** 2) * len * m1, step);
  }
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
