import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { TrackDef } from './track';

/** Layout scale: sized for about 1:45 at 150cc. */
const K = 1.165;
const START: Pose = { x: 47 * K, z: 180 * K, h: Math.PI / 2 };
const FINISH = 60;

/**
 * Butterfly 3000 Skyway (circuit 2, hard): a rainbow road in the sky,
 * the cup's finale. No ground below: leave the road and it's a long drop.
 * Butterfly swarms buffet karts toward the open edges.
 */
export function buildButterflySkyway(): TrackDef {
  // Open edges (no walls) where a mistake costs a fall: the straights, the leap and the S-bends home.
  const b = new TrackBuilder(START, 'Cloud Nine', { halfWidth: 11, surface: 'rainbow' });
  b.scale = K;
  b.straight(70);
  b.section('Cloud Nine Bend', { halfWidth: 11, wallHeight: 1.2, surface: 'rainbow' });
  b.arc(40, 120);

  b.section('Butterfly Garden', { halfWidth: 9.5, wallHeight: 1.2, surface: 'rainbow' });
  b.mark('garden');
  b.straight(65).arc(55, -40).arc(55, 80).arc(55, -40).straight(30).arc(35, 50).arc(35, -50).straight(50);
  b.section('Garden Bend', { halfWidth: 10, wallHeight: 1.2, surface: 'rainbow' });
  b.arc(38, 120);

  b.section('Star Leap', { halfWidth: 9, surface: 'rainbow' });
  b.mark('leap');
  b.straight(20).elevate(0).rise(20, 3);
  b.gap(18, 30);
  b.elevate(0).straight(25);

  b.section('Chrysalis Hairpins', { halfWidth: 8.5, wallHeight: 1.2, surface: 'rainbow' });
  b.mark('hairpins');
  b.straight(12).arc(22, 170).straight(16).arc(22, -170).straight(16).arc(22, 170).straight(16).arc(22, -170).straight(12);

  b.section('Metamorphosis Mile', { halfWidth: 9, surface: 'rainbow' });
  b.mark('mile');
  b.arc(45, 30).arc(45, -30).straight(30);
  b.section('Final Glide', { halfWidth: 11, wallHeight: 1.2, surface: 'rainbow' });
  b.mark('glide');
  b.turnTo(offsetPose(START, -FINISH * K), 40);
  b.section('Finish Straight', { halfWidth: 11, surface: 'rainbow' });
  b.straight(FINISH);

  const main = b.finish(true);
  return {
    id: 'butterfly-skyway',
    name: 'Butterfly 3000 Skyway',
    main,
    branches: [],
    pits: b.pits,
    boostPads: [
      { s: 50, length: 8, lateral: 0, halfWidth: 2.5 },
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
    ],
    hazards: [{ kind: 'butterflies', from: b.marks.garden.s + 20, to: b.marks.garden.s + 160, count: 2 }],
    theme: 'dream',
    music: { lap: 'butterfly-skyway', finalLap: 'butterfly-skyway-final-lap' },
  };
}
