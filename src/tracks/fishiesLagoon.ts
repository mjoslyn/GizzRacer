import { TrackBuilder, dubins, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

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
  // Two trick kickers on the beach, a little over a second apart.
  b.straight(6).kicker().straight(44).kicker().straight(70 - 50 - 14 / K);
  b.arc(40, 90);

  // The causeway dives: down a slipway into the lagoon, along the sea floor under the surface, and back up.
  b.section('Coral Causeway', { halfWidth: 7, surface: 'sand' });
  b.mark('causeway');
  b.straight(16);
  b.dive(84, 8, 22, 30);
  b.straight(10);

  b.section('Fish Leap', { halfWidth: 10, surface: 'sand' });
  b.mark('leap');
  b.arc(30, -100).straight(25).arc(35, 100);

  b.section('Plastic Boogie Reef', { halfWidth: 9, surface: 'sand' });
  b.mark('esses');
  b.arc(28, 60).arc(28, -60);
  b.mark('reefApex');
  b.arc(28, -60).arc(28, 60);
  b.arc(38, 90);

  b.section("Boogieman Sam's Pier", { halfWidth: 8.5, wallHeight: 1.2, surface: 'boards' });
  b.mark('pier');
  b.straight(40).elevate(0).rise(20, 3);
  b.gap(14, 30, 'water');
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
  const open = buildOpenWater(b.marks.leap, b.marks.reefApex);
  return {
    id: 'fishies-lagoon',
    name: 'Fishies Lagoon',
    main,
    branches: [open.branch],
    pits: [...b.pits, ...open.pits],
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
      { s: open.boardsFrom + 20, count: 2, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'fish', from: b.marks.leap.s + 75, to: b.marks.leap.s + 155, count: 3, period: 3.4 },
      { kind: 'fish', from: b.marks.causeway.s + 40, to: b.marks.causeway.s + 100, count: 2, period: 4.2 },
    ],
    theme: 'lagoon',
    music: { lap: 'fishies-lagoon' },
  };
}

/**
 * Open Water: a rail-less plank boardwalk straight across the deep lagoon,
 * from the Fish Leap to the apex of the reef. Off the planks is deep water.
 */
function buildOpenWater(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const R = 32;
  const b = new TrackBuilder(from.pose, 'Open Water', { halfWidth: 7, surface: 'sand' });
  // Straight on while the Fish Leap turns away, then an S onto the planks and down to the reef.
  b.straight(45);
  const [first, straight, last] = dubins(b.pose, to.pose, R);
  const turn = (step: typeof first) => b.arc(R, ((step[0] === 'L' ? 1 : -1) * step[1] * 180) / (Math.PI * R));
  turn(first);
  b.section('Open Water Boardwalk', { halfWidth: 4.5, surface: 'boards' });
  const boardsFrom = b.s;
  b.bridge(straight[1], 12, 'water');
  b.section('Open Water', { halfWidth: 7, surface: 'sand' });
  turn(last);
  const branch: BranchDef = { name: 'Open Water', mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
  return { branch, pits: b.pits, boardsFrom };
}
