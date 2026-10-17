import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { TrackDef } from './track';

/** Layout scale: sized for about 1:45 at 150cc. */
const K = 1.25;
const START: Pose = { x: -44 * K, z: 161 * K, h: Math.PI / 2 };
const FINISH = 60;

/**
 * Fishies Lagoon (circuit 2, easy): a sandy beach road, a plank causeway
 * low over the lagoon, fish leaping across the road, and a pier jump.
 */
export function buildFishiesLagoon(): TrackDef {
  const b = new TrackBuilder(START, 'Beach Road', { halfWidth: 11, surface: 'sand' });
  b.scale = K;
  b.straight(70).arc(40, 90);

  b.section('Coral Causeway', { halfWidth: 7, surface: 'boards' });
  b.mark('causeway');
  b.straight(8).elevate(0).straight(12).elevate(1.5);
  b.bridge(55, 30, 'water');
  b.elevate(1.5).straight(12).elevate(0);

  b.section('Fish Leap', { halfWidth: 10, surface: 'sand' });
  b.mark('leap');
  b.arc(30, -100).straight(25).arc(35, 100);

  b.section('Reef Esses', { halfWidth: 9, surface: 'sand' });
  b.mark('esses');
  b.arc(28, 60).arc(28, -120).arc(28, 60);
  b.arc(38, 90);

  b.section('Pier Jump', { halfWidth: 8.5, wallHeight: 1.2, surface: 'boards' });
  b.mark('pier');
  b.straight(40).elevate(0).rise(20, 3);
  b.gap(16, 30, 'water');
  b.elevate(0).straight(45);

  b.section('Palm Shuffle', { halfWidth: 9, surface: 'sand' });
  b.mark('palms');
  b.straight(35).arc(26, 75).arc(26, -75).straight(35);
  b.arc(40, 90);

  b.section('Lighthouse Point', { halfWidth: 10, surface: 'sand' });
  b.mark('lighthouse');
  b.arc(30, -40).arc(30, 40).straight(10).arc(30, 40).arc(30, -40).straight(10).arc(30, -40).arc(30, 40);
  b.turnTo(offsetPose(START, -FINISH * K), 40);
  b.section('Finish Straight', { halfWidth: 11, surface: 'sand' });
  b.straight(FINISH);

  const main = b.finish(true);
  return {
    id: 'fishies-lagoon',
    name: 'Fishies Lagoon',
    main,
    branches: [],
    pits: b.pits,
    boostPads: [{ s: 60, length: 8, lateral: 0, halfWidth: 2.5 }],
    checkpoints: ['causeway', 'leap', 'pier', 'palms', 'lighthouse'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 420,
    landmarks: [
      { kind: 'lighthouse', ribbon: -1, s: b.marks.lighthouse.s + 30 },
      { kind: 'gantry', ribbon: -1, s: 0 },
    ],
    itemBoxes: [
      { s: 95, count: 4 },
      { s: b.marks.leap.s + 90, count: 4 },
      { s: b.marks.palms.s + 10, count: 3 },
      { s: b.marks.lighthouse.s + 15, count: 4 },
    ],
    hazards: [
      { kind: 'fish', from: b.marks.leap.s + 75, to: b.marks.leap.s + 155, count: 3, period: 3.4 },
      { kind: 'fish', from: b.marks.causeway.s + 40, to: b.marks.causeway.s + 100, count: 2, period: 4.2 },
    ],
    theme: 'lagoon',
    music: { lap: 'fishies-lagoon' },
  };
}
