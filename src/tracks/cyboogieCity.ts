import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { TrackDef } from './track';

/** Layout scale: sized for about 1:45 at 150cc. */
const K = 1.5;
const START: Pose = { x: -18 * K, z: 107 * K, h: Math.PI / 2 };
const FINISH = 60;
const DECK_Y = 8;

/**
 * Cyboogie City (circuit 2, medium): Han-Tyumi's neon downtown at night.
 * A walled boulevard, a tight alley chicane, an elevated freeway, and
 * laser gates that fire on the beat.
 */
export function buildCyboogieCity(): TrackDef {
  const b = new TrackBuilder(START, 'Neon Boulevard', { halfWidth: 11, wallHeight: 1.2, surface: 'neon' });
  b.scale = K;
  b.straight(80).arc(26, 90);

  b.section('Cyboogie Alley', { halfWidth: 7.5, wallHeight: 6, surface: 'neon' });
  b.mark('alley');
  b.straight(30).arc(20, -90).straight(25).arc(20, 90).straight(25).arc(20, 90).straight(20).arc(20, -90).straight(25);
  b.section('Alley Exit', { halfWidth: 9, wallHeight: 6, surface: 'neon' });
  b.arc(28, 90);

  b.section('Freeway Ramp', { halfWidth: 10, wallHeight: 1.2 });
  b.mark('freeway');
  b.straight(10).elevate(0).straight(45).elevate(DECK_Y);
  b.section('Skyline Freeway', { halfWidth: 10, wallHeight: 1.2, bridge: true });
  b.arc(60, 40).arc(60, -40).elevate(DECK_Y);
  b.section('Freeway Exit', { halfWidth: 10, wallHeight: 1.2 });
  b.straight(45).elevate(0).straight(10);
  b.arc(30, 90);

  b.section('Laser Gates', { halfWidth: 10, wallHeight: 3, surface: 'neon' });
  b.mark('lasers');
  b.straight(60);
  b.section('Downtown Sweep', { halfWidth: 11, wallHeight: 1.2, surface: 'neon' });
  b.mark('sweep');
  b.arc(30, 60).arc(30, -60);
  b.turnTo(offsetPose(START, -FINISH * K), 35);
  b.section('Finish Straight', { halfWidth: 11, wallHeight: 1.2, surface: 'neon' });
  b.straight(FINISH);

  const main = b.finish(true);
  return {
    id: 'cyboogie-city',
    name: 'Cyboogie City',
    main,
    branches: [],
    pits: b.pits,
    boostPads: [
      { s: 40, length: 8, lateral: -4, halfWidth: 2.5 },
      { s: 40, length: 8, lateral: 4, halfWidth: 2.5 },
      { s: b.marks.freeway.s + 30, length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['alley', 'freeway', 'lasers', 'sweep'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 420,
    landmarks: [
      { kind: 'neonArch', ribbon: -1, s: 0 },
      { kind: 'neonArch', ribbon: -1, s: b.marks.alley.s + 3 },
    ],
    itemBoxes: [
      { s: 100, count: 4 },
      { s: b.marks.alley.s + 85, count: 3 },
      { s: b.marks.freeway.s + 120, count: 4 },
      { s: b.marks.sweep.s + 20, count: 4 },
    ],
    hazards: [{ kind: 'lasers', at: [b.marks.lasers.s + 15, b.marks.lasers.s + 45, b.marks.lasers.s + 75], period: 2.6 }],
    theme: 'neon',
    music: { lap: 'cyboogie-city' },
  };
}
