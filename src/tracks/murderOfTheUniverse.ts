import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.25;
const START: Pose = { x: -60 * K, z: 170 * K, h: Math.PI / 2 };
const FINISH = 55;

/**
 * Murder of the Universe (hard): a road of starlight over nothing. Leave
 * it and you fall forever. Its sections run in the album's chapter order:
 * the Altered Beast, then the Lord of Lightning against the Balrog (a
 * leap across the void, a spiral round the acrid corpse of a dead star),
 * then Han-Tyumi and the end of everything. Black holes drift across the
 * road dragging karts round and in, lightning strikes on the straights,
 * the cyborg's great eye watches the line, and Digital Black, a thread of
 * road with no rails, cuts out over the void past the spiral.
 */
export function buildMurderOfTheUniverse(): TrackDef {
  const b = new TrackBuilder(START, 'Event Horizon', { halfWidth: 10.5, surface: 'cosmic' });
  b.scale = K;
  b.straight(150);
  b.section('Altered Beast', { halfWidth: 10, wallHeight: 1.2, surface: 'cosmic' });
  b.arc(42, 100);

  // Two kickers down the straight, under the lightning.
  b.section('Lord of Lightning', { halfWidth: 9, surface: 'neon' });
  b.mark('lightning');
  b.straight(48).mark('kick1').kicker().straight(24).mark('kick2').kicker().straight(36.8).arc(55, -35).arc(55, 35);

  b.section('Balrog Bend', { halfWidth: 9.5, wallHeight: 1.2, surface: 'cosmic' });
  b.mark('balrog');
  b.arc(36, 80);

  b.section('Floating Fire Leap', { halfWidth: 9, surface: 'cosmic' });
  b.mark('leap');
  b.straight(15).elevate(0).rise(20, 3);
  b.gap(18, 30);
  b.elevate(0).straight(6);
  b.mark('blackFrom');
  // The spiral's first bend is open until Digital Black is well clear of it.
  b.straight(19).arc(24, 35);

  b.section('Acrid Corpse Spiral', { halfWidth: 8, wallHeight: 1.2, surface: 'cosmic' });
  b.mark('spiral');
  b.arc(24, 65).straight(12).arc(22, -160).straight(12).arc(24, 120);

  b.section('Han-Tyumi Straight', { halfWidth: 9, surface: 'neon' });
  b.mark('han');
  b.straight(30);
  b.mark('blackTo');
  b.straight(20);
  b.section('Vomit Coffin', { halfWidth: 10, wallHeight: 1.2, surface: 'cosmic' });
  b.mark('oblivion');
  b.turnTo(offsetPose(START, -FINISH * K), 40);
  b.section('Finish Straight', { halfWidth: 10.5, surface: 'cosmic' });
  b.straight(FINISH);

  const main = b.finish(true);
  const black = buildDigitalBlack(b.marks.blackFrom, b.marks.blackTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'murder-of-the-universe',
    name: 'Murder of the Universe',
    main,
    branches: [black.branch],
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
      { kind: 'voidEye', ribbon: -1, s: at('blackTo', 4) },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('lightning', 20), count: 3 },
      { s: at('leap', 50), count: 3 },
      { s: at('han', 20), count: 3 },
      { s: at('oblivion', 20), count: 4 },
      { s: black.boxes, count: 1, ribbon: 0, double: true },
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

/**
 * Digital Black: a thread of road with no rails that swings out over the
 * void, round the outside of the spiral, and drops onto the Han-Tyumi
 * Straight. Narrow enough that a nudge sends you off it.
 */
function buildDigitalBlack(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const b = new TrackBuilder(from.pose, 'Digital Black', { halfWidth: 4.5, surface: 'neon' });
  // Out over the void, then in from the outside of the straight, clear of the spiral.
  const approach = offsetPose(to.pose, -42, 22);
  b.straight(3).arc(22, -50).turnTo(approach, 28).hermiteTo(offsetPose(to.pose, -6)).straight(6);
  const branch: BranchDef = { name: 'Digital Black', mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
  return { branch, boxes: branch.length / 2 };
}
