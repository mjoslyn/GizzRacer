import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { TrackDef } from './track';

const K = 1.1;
const START: Pose = { x: -90 * K, z: 160 * K, h: Math.PI / 2 };
const FINISH = 55;

/**
 * Hell on Mars (hard): a colony on the red planet, overrun and burning.
 * A landing strip for a grid, a chicane between the habs, a climb up the
 * flank of Olympus and a leap over a rift of lava, the rim of a crater
 * where dust devils roam, a twisting run through the Rats' Nest, and
 * meteors streaking down onto the straights.
 */
export function buildHellOnMars(): TrackDef {
  const b = new TrackBuilder(START, 'Landing Strip', { halfWidth: 11, surface: 'regolith' });
  b.scale = K;
  b.straight(180).arc(50, 90);

  b.section('Hab Chicane', { halfWidth: 9, wallHeight: 1.2, surface: 'regolith' });
  b.mark('habs');
  b.straight(40).arc(28, -55).arc(28, 55).straight(40);

  b.section('Olympus Climb', { halfWidth: 9.5, surface: 'rock' });
  b.mark('climb');
  b.elevate(0).straight(130).elevate(6).arc(42, 90).elevate(6);

  b.section('Valles Rift', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.mark('rift');
  b.straight(20).elevate(6).rise(18, 9);
  b.gap(16, 36, 'lava');
  b.elevate(1).straight(30).elevate(0).straight(170);

  b.section('Crater Rim', { halfWidth: 9.5, surface: 'regolith' });
  b.mark('crater');
  b.arc(60, 90);

  b.section("Rats' Nest", { halfWidth: 8, wallHeight: 1.5, surface: 'regolith' });
  b.mark('nest');
  b.straight(10).arc(20, -70).arc(22, 140).arc(20, -140).arc(22, 140).arc(20, -70).straight(10);

  b.section('Meteor Mile', { halfWidth: 10, surface: 'regolith' });
  b.mark('mile');
  b.straight(20);
  b.turnTo(offsetPose(START, -FINISH * K), 42);
  b.section('Finish Straight', { halfWidth: 11, surface: 'regolith' });
  b.straight(FINISH);

  const main = b.finish(true);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'hell-on-mars',
    name: 'Hell on Mars',
    main,
    branches: [],
    pits: b.pits,
    boostPads: [
      { s: 45, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('rift', 4), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['habs', 'climb', 'rift', 'crater', 'nest', 'mile'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'colonyGate', ribbon: -1, s: 6 },
      { kind: 'colonyGate', ribbon: -1, s: at('habs', 2) },
    ],
    itemBoxes: [
      { s: 80, count: 4 },
      { s: at('climb', 30), count: 3 },
      { s: at('crater', 40), count: 4 },
      { s: at('nest', 60), count: 3 },
      { s: at('mile', 10), count: 4 },
    ],
    hazards: [
      { kind: 'meteors', at: [110, 150, at('climb', 25), at('mile', 15)], period: 5.5 },
      { kind: 'dustDevils', from: at('crater', 15), to: at('crater', 100), count: 2 },
    ],
    theme: 'mars',
    music: { lap: 'hell-on-mars', finalLap: 'hell-on-mars-final-lap' },
  };
}
