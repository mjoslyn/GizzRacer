import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: -70 * K, z: 165 * K, h: Math.PI / 2 };
const FINISH = 55;

/**
 * Supercell (hard): prairie roads under a storm the size of a county, in
 * rain and green-black light. Tornadoes wander the open plain flinging
 * karts aside, lightning strikes where a ring of warning closes, hail the
 * size of boulders falls on the farm, a creek has burst over the road, and
 * the bridge across it has no rails.
 */
export function buildSupercell(): TrackDef {
  const b = new TrackBuilder(START, 'County Road', { halfWidth: 11, surface: 'wet' });
  b.scale = K;
  b.straight(150).arc(48, 90);

  b.section('Tornado Alley', { halfWidth: 10, surface: 'wet' });
  b.mark('alley');
  b.straight(140);

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
  b.elevate(0).straight(25);

  b.section('Downdraft', { halfWidth: 9.5, surface: 'wet' });
  b.mark('down');
  b.arc(30, -60).arc(30, 60);
  b.turnTo(offsetPose(START, -FINISH * K), 44);
  b.section('Finish Straight', { halfWidth: 11, surface: 'wet' });
  b.straight(FINISH);

  const main = b.finish(true);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'supercell',
    name: 'Supercell',
    main,
    branches: [],
    pits: b.pits,
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
      { s: at('down', 30), count: 4 },
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
