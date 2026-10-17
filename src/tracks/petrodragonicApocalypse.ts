import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { TrackDef } from './track';

/** Layout scale: sized for about 1:50 at 150cc, a little longer than cup two. */
const K = 1.15;
const START: Pose = { x: -87 * K, z: 154 * K, h: Math.PI / 2 };
const FINISH = 55;

/**
 * Petrodragonic Apocalypse (hard): a burning oil field under a black sky.
 * Narrow roads, slicks of crude that slide like ice, a walled gullet where
 * dragons breathe fire across the whole road, a jump over a moat of
 * burning oil, a coil of hairpins on the slick, a rail-less bridge over an
 * oil lake, and burning crude raining down on the straights. One clockwise
 * loop: the grid along the top, Derrick Row down the right, the slick into
 * the bottom corner, the gullet and the moat along the bottom, the coil
 * cutting into the middle on the way up the left, then the bridge home.
 */
export function buildPetrodragonicApocalypse(): TrackDef {
  const b = new TrackBuilder(START, 'Ashen Grid', { halfWidth: 10 });
  b.scale = K;
  b.straight(190).arc(45, 90);

  b.section('Derrick Row', { halfWidth: 8.5 });
  b.mark('derricks');
  b.straight(110).arc(36, -35).arc(36, 35).straight(30);

  b.section('Crude Slick', { halfWidth: 8, wallHeight: 1.2, surface: 'oil' });
  b.mark('slick');
  b.arc(30, 60).arc(28, -60).arc(34, 90);

  b.section("Dragon's Gullet", { halfWidth: 6.5, wallHeight: 5, surface: 'rock' });
  b.mark('gullet');
  b.straight(95);

  b.section('Burning Moat', { halfWidth: 8, wallHeight: 1.2, surface: 'rock' });
  b.mark('moat');
  b.straight(14).elevate(0).rise(20, 3);
  b.gap(13, 34, 'oil');
  b.elevate(0).straight(30);
  b.arc(38, 90);

  b.section('Wyrm Coil', { halfWidth: 7, wallHeight: 1.5, surface: 'oil' });
  b.mark('coil');
  b.straight(20).arc(19, 170).straight(16).arc(19, -170).straight(20);

  b.section('Skull Bridge', { halfWidth: 7 });
  b.mark('bridge');
  b.elevate(0).straight(12).elevate(2);
  b.bridge(55, 30, 'oil');
  b.elevate(2).straight(12).elevate(0);

  b.section('Apocalypse Mile', { halfWidth: 9 });
  b.mark('mile');
  b.straight(20);
  b.turnTo(offsetPose(START, -FINISH * K), 40);
  b.section('Finish Straight', { halfWidth: 10 });
  b.straight(FINISH);

  const main = b.finish(true);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'petrodragonic-apocalypse',
    name: 'Petrodragonic Apocalypse',
    main,
    branches: [],
    pits: b.pits,
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('moat', 4), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['derricks', 'slick', 'gullet', 'moat', 'coil', 'bridge', 'mile'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'dragonGate', ribbon: -1, s: 6 },
      { kind: 'dragonGate', ribbon: -1, s: at('gullet', 2) },
      { kind: 'dragonFlight', ribbon: -1, s: 0 },
    ],
    itemBoxes: [
      { s: 70, count: 4 },
      { s: at('derricks', 40), count: 3 },
      { s: at('gullet', -20), count: 3 },
      { s: at('coil', 120), count: 3 },
      { s: at('mile', 10), count: 4 },
    ],
    hazards: [
      { kind: 'oilBombs', at: [at('derricks', 20), at('derricks', 50), at('derricks', 75), at('mile', 20)], period: 5 },
      { kind: 'dragonFire', at: [at('gullet', 22), at('gullet', 50), at('gullet', 76)], period: 3 },
      { kind: 'oilBombs', at: [at('coil', 30), at('coil', 95)], period: 6 },
    ],
    theme: 'petro',
    // Stand-in until its own songs are rendered.
    music: { lap: 'volcano-fortress' },
  };
}
