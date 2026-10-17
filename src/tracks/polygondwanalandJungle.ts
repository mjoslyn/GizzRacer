import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { TrackDef } from './track';

const START: Pose = { x: 0, z: -160, h: Math.PI / 2 };
const FINISH = 70;

/**
 * Polygondwanaland Jungle, first draft (spec section 7, hard): vine
 * hairpins, a jump over a river, and walled stone ruins.
 */
export function buildPolygondwanalandJungle(): TrackDef {
  const b = new TrackBuilder(START, 'Canopy Run', { halfWidth: 10 });
  b.straight(120).arc(45, 90);

  b.section('Vine Hairpins', { halfWidth: 8.5 });
  b.mark('hairpins');
  b.straight(20).arc(20, -170).straight(35).arc(20, 170).straight(20);

  b.section('River Jump', { halfWidth: 9, wallHeight: 1.2 });
  b.mark('river');
  b.straight(40).elevate(0).straight(22).elevate(3);
  b.gap(14, 40, 'water');
  b.elevate(0).straight(30);
  b.arc(45, 90);

  b.section('Polygon Ruins', { halfWidth: 8, wallHeight: 5, surface: 'rock' });
  b.mark('ruins');
  b.straight(50).arc(60, 45).arc(60, -45).straight(40);
  b.arc(45, 90);

  b.section('Waterfall Bend', { halfWidth: 10 });
  b.mark('waterfall');
  b.straight(50);
  b.hermiteTo(offsetPose(START, -FINISH), 0.9);
  b.section('Finish Straight', { halfWidth: 10 });
  b.straight(FINISH);

  const main = b.finish(true);
  return {
    id: 'polygondwanaland-jungle',
    name: 'Polygondwanaland Jungle',
    main,
    branches: [],
    pits: b.pits,
    boostPads: [{ s: 50, length: 8, lateral: 0, halfWidth: 2.5 }],
    checkpoints: ['hairpins', 'river', 'ruins', 'waterfall'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 420,
    landmarks: [
      { kind: 'templeGate', ribbon: -1, s: b.marks.ruins.s + 4 },
      { kind: 'waterfall', ribbon: -1, s: b.marks.waterfall.s + 30 },
    ],
    itemBoxes: [
      { s: 80, count: 4 },
      { s: b.marks.river.s + 15, count: 4 },
      { s: b.marks.ruins.s + 30, count: 3 },
      { s: b.marks.waterfall.s + 20, count: 4 },
    ],
    hazards: [
      { kind: 'vines', at: [b.marks.hairpins.s + 10, b.marks.hairpins.s + 96, b.marks.hairpins.s + 183], period: 3.6 },
      { kind: 'rollers', from: b.marks.ruins.s + 15, to: b.marks.ruins.s + 170, count: 3, period: 7 },
    ],
    theme: 'jungle',
    music: { lap: 'polygondwanaland-jungle' },
  };
}
