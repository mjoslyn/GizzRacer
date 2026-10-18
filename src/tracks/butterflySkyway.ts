import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

/** Layout scale: sized for about 1:45 at 150cc. */
const K = 1.165;
const START: Pose = { x: 47 * K, z: 180 * K, h: Math.PI / 2 };
const FINISH = 60;
/** Degrees of the garden's first and last arcs left open, where Catching Smoke forks off and back. */
const SMOKE_OPEN = 43;

/**
 * Butterfly 3000 Skyway (circuit 2, hard): a rainbow road in the sky,
 * the cup's finale. No ground below: leave the road and it's a long drop.
 * Butterfly swarms buffet karts toward the open edges.
 */
export function buildButterflySkyway(): TrackDef {
  // Open edges (no walls) where a mistake costs a fall: the straights, the leap and the S-bends home.
  const b = new TrackBuilder(START, 'Cloud Nine', { halfWidth: 11, surface: 'rainbow' });
  b.scale = K;
  // Two trick kickers, then the boost pad into the bend.
  b.straight(6).kicker().straight(26).kicker().straight(70 - 32 - 14 / K);
  b.section('Cloud Nine Bend', { halfWidth: 11, wallHeight: 1.2, surface: 'rainbow' });
  b.arc(40, 120);

  b.section('Butterfly Garden', { halfWidth: 9.5, wallHeight: 1.2, surface: 'rainbow' });
  b.mark('garden');
  b.straight(48);
  // The garden swings out wide; Catching Smoke cuts straight across. Open edges only
  // while the two roads still touch, so a kart sliding wide lands on one or the other.
  b.section('Butterfly Garden', { halfWidth: 9.5, surface: 'rainbow' });
  b.straight(8);
  b.mark('smoke');
  b.arc(40, -SMOKE_OPEN);
  b.section('Butterfly Garden', { halfWidth: 9.5, wallHeight: 1.2, surface: 'rainbow' });
  b.arc(40, SMOKE_OPEN - 70).arc(40, 140).arc(40, SMOKE_OPEN - 70);
  b.section('Butterfly Garden', { halfWidth: 9.5, surface: 'rainbow' });
  b.arc(40, -SMOKE_OPEN);
  b.mark('smokeEnd');
  b.section('Butterfly Garden', { halfWidth: 9.5, wallHeight: 1.2, surface: 'rainbow' });
  b.straight(30).arc(35, 50).arc(35, -50).straight(50);
  b.section('Garden Bend', { halfWidth: 10, wallHeight: 1.2, surface: 'rainbow' });
  b.arc(38, 120);

  b.section('Star Leap', { halfWidth: 9, surface: 'rainbow' });
  b.mark('leap');
  b.straight(20).elevate(0).rise(20, 3);
  b.gap(18, 30);
  b.elevate(0).straight(25);

  b.section('Shanghai Chrysalis', { halfWidth: 8.5, wallHeight: 1.2, surface: 'rainbow' });
  b.mark('hairpins');
  b.straight(12).arc(22, 170).straight(16).arc(22, -170).straight(16).arc(22, 170).straight(16).arc(22, -170).straight(12);

  b.section('Metamorphosis Mile', { halfWidth: 9, surface: 'rainbow' });
  b.mark('mile');
  b.arc(45, 30).arc(45, -30).straight(30);
  b.section('Falling Upwards', { halfWidth: 11, wallHeight: 1.2, surface: 'rainbow' });
  b.mark('glide');
  b.turnTo(offsetPose(START, -FINISH * K), 40);
  b.section('Finish Straight', { halfWidth: 11, surface: 'rainbow' });
  b.straight(FINISH);

  const main = b.finish(true);
  const smoke = buildCatchingSmoke(b.marks.smoke, b.marks.smokeEnd);
  return {
    id: 'butterfly-skyway',
    name: 'Butterfly 3000 Skyway',
    main,
    branches: [smoke.branch],
    pits: b.pits,
    boostPads: [
      { s: 72, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: b.marks.leap.s + 20, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: b.marks.mile.s + 25, length: 8, lateral: -4, halfWidth: 2.5 },
      { s: b.marks.mile.s + 25, length: 8, lateral: 4, halfWidth: 2.5 },
    ],
    checkpoints: ['garden', 'leap', 'hairpins', 'mile', 'glide'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 420,
    abyss: true,
    landmarks: [
      { kind: 'rainbowArch', ribbon: -1, s: 0 },
      { kind: 'rainbowArch', ribbon: -1, s: b.marks.leap.s + 70 },
    ],
    itemBoxes: [
      { s: 90, count: 4 },
      { s: b.marks.garden.s + 15, count: 4 },
      { s: b.marks.hairpins.s + 55, count: 3 },
      { s: b.marks.mile.s + 45, count: 4 },
      { s: smoke.boxes, count: 2, ribbon: 0, double: true },
    ],
    hazards: [{ kind: 'butterflies', from: b.marks.garden.s + 20, to: b.marks.garden.s + 160, count: 2 }],
    theme: 'dream',
    music: { lap: 'butterfly-skyway', finalLap: 'butterfly-skyway-final-lap' },
  };
}

/** Catching Smoke: a narrow, rail-less ribbon straight across the garden's swing, over nothing. */
function buildCatchingSmoke(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Catching Smoke', { halfWidth: 6, surface: 'rainbow' });
  b.straight(chord);
  const branch: BranchDef = { name: 'Catching Smoke', mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
  return { branch, boxes: chord / 2 };
}
