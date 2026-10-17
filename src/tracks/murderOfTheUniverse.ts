import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { TrackDef } from './track';

const K = 1.25;
const START: Pose = { x: -60 * K, z: 170 * K, h: Math.PI / 2 };
const FINISH = 55;

/**
 * Murder of the Universe (hard): a road of starlight over nothing. Leave
 * it and you fall forever. Black holes drift across the road dragging
 * karts round and in, the Lord of Lightning strikes on the straights,
 * there's a leap across the void, a spiral of hairpins round a dead star,
 * and the cyborg's great eye watches the line.
 */
export function buildMurderOfTheUniverse(): TrackDef {
  const b = new TrackBuilder(START, 'Event Horizon', { halfWidth: 10.5, surface: 'cosmic' });
  b.scale = K;
  b.straight(150);
  b.section('Altered Bend', { halfWidth: 10, wallHeight: 1.2, surface: 'cosmic' });
  b.arc(42, 100);

  b.section('Lord of Lightning', { halfWidth: 9, surface: 'neon' });
  b.mark('lightning');
  b.straight(120).arc(55, -35).arc(55, 35);

  b.section('Balrog Bend', { halfWidth: 9.5, wallHeight: 1.2, surface: 'cosmic' });
  b.mark('balrog');
  b.arc(36, 80);

  b.section('Void Leap', { halfWidth: 9, surface: 'cosmic' });
  b.mark('leap');
  b.straight(15).elevate(0).rise(20, 3);
  b.gap(18, 30);
  b.elevate(0).straight(25);

  b.section('Dead Star Spiral', { halfWidth: 8, wallHeight: 1.2, surface: 'cosmic' });
  b.mark('spiral');
  b.arc(24, 100).straight(12).arc(22, -160).straight(12).arc(24, 120);

  b.section('Han-Tyumi Straight', { halfWidth: 9, surface: 'neon' });
  b.mark('han');
  b.straight(40);
  b.section('Oblivion', { halfWidth: 10, wallHeight: 1.2, surface: 'cosmic' });
  b.mark('oblivion');
  b.turnTo(offsetPose(START, -FINISH * K), 40);
  b.section('Finish Straight', { halfWidth: 10.5, surface: 'cosmic' });
  b.straight(FINISH);

  const main = b.finish(true);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'murder-of-the-universe',
    name: 'Murder of the Universe',
    main,
    branches: [],
    pits: b.pits,
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leap', 16), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['lightning', 'balrog', 'leap', 'spiral', 'han', 'oblivion'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 440,
    abyss: true,
    landmarks: [
      { kind: 'voidEye', ribbon: -1, s: 6 },
      { kind: 'voidEye', ribbon: -1, s: at('han', 4) },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('lightning', 20), count: 3 },
      { s: at('leap', 50), count: 3 },
      { s: at('han', 20), count: 3 },
      { s: at('oblivion', 20), count: 4 },
    ],
    hazards: [
      { kind: 'blackHoles', from: at('lightning', 10), to: at('lightning', 120), count: 2 },
      { kind: 'lightning', at: [100, 130, at('lightning', 40), at('lightning', 90), at('han', 20)], period: 4 },
      { kind: 'blackHoles', from: 60, to: 140, count: 1 },
    ],
    theme: 'void',
    music: { lap: 'murder-of-the-universe', finalLap: 'murder-of-the-universe-final-lap' },
  };
}
