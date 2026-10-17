import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { TrackDef } from './track';

/** Layout scale: sized for about 1:45 at 150cc. */
const K = 1.19;
const START: Pose = { x: -35 * K, z: 155 * K, h: Math.PI / 2 };
const FINISH = 60;

/**
 * Ice V Glacier (circuit 2, medium): a sheet-ice shelf that slides karts
 * wide, a crevasse jump, icy hairpins between walls, and a frozen lake
 * where blocks of ice skate across the road.
 */
export function buildIceVGlacier(): TrackDef {
  const b = new TrackBuilder(START, 'Base Camp', { halfWidth: 11 });
  b.scale = K;
  b.straight(70).arc(40, 90);

  b.section('Ice Shelf', { halfWidth: 10, surface: 'ice' });
  b.mark('shelf');
  b.straight(75).arc(50, -70).arc(50, 70).straight(63);
  b.section('Shelf Bend', { halfWidth: 10, wallHeight: 1.2, surface: 'ice' });
  b.arc(38, 90);

  b.section('Icicle Chicane', { halfWidth: 8.5, wallHeight: 3, surface: 'ice' });
  b.mark('chicane');
  b.arc(22, 70).arc(22, -140).arc(22, 70);

  b.section('Crevasse Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.mark('crevasse');
  b.straight(25).elevate(0).rise(20, 3);
  b.gap(16, 40, 'water');
  b.elevate(0).straight(24);

  b.section('Seven Hairpins', { halfWidth: 8.5, wallHeight: 1.5, surface: 'ice' });
  b.mark('hairpins');
  b.straight(12).arc(22, 165).straight(18).arc(22, -165).straight(18).arc(22, 165).straight(18).arc(22, -165).straight(12);
  b.arc(40, 90);

  b.section('Frozen Lake', { halfWidth: 11, surface: 'ice' });
  b.mark('lake');
  b.arc(50, -20).arc(50, 20);
  b.section('Thaw Road', { halfWidth: 10 });
  b.mark('thaw');
  b.straight(10);
  b.turnTo(offsetPose(START, -FINISH * K), 40);
  b.section('Finish Straight', { halfWidth: 11 });
  b.straight(FINISH);

  const main = b.finish(true);
  return {
    id: 'ice-v-glacier',
    name: 'Ice V Glacier',
    main,
    branches: [],
    pits: b.pits,
    boostPads: [
      { s: 50, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: b.marks.crevasse.s + 20, length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['shelf', 'crevasse', 'hairpins', 'lake', 'thaw'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 420,
    landmarks: [
      { kind: 'iceArch', ribbon: -1, s: b.marks.shelf.s + 4 },
      { kind: 'iceArch', ribbon: -1, s: b.marks.lake.s + 70 },
      { kind: 'gantry', ribbon: -1, s: 0 },
    ],
    itemBoxes: [
      { s: 80, count: 4 },
      { s: b.marks.shelf.s + 30, count: 4 },
      { s: b.marks.hairpins.s + 60, count: 3 },
      { s: b.marks.lake.s + 10, count: 5 },
    ],
    hazards: [
      { kind: 'iceBlocks', from: b.marks.lake.s + 20, to: b.marks.lake.s + 75, count: 3, period: 5 },
      { kind: 'iceBlocks', from: b.marks.shelf.s + 140, to: b.marks.shelf.s + 175, count: 1, period: 6 },
    ],
    theme: 'glacier',
    music: { lap: 'ice-v-glacier' },
  };
}
