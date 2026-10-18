import { TrackBuilder, dubins, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

/** Layout scale: sized for about 1:45 at 150cc. */
const K = 1.25;
const START: Pose = { x: -44 * K, z: 161 * K, h: Math.PI / 2 };
const FINISH = 60;
/** Height of Boogieman Sam's Pier: a boardwalk high over the lagoon. */
const PIER_Y = 12;

/**
 * Fishies Lagoon (circuit 2, easy): a sandy beach road over the dunes, a
 * causeway that dives under the lagoon, fish leaping across the road, and a
 * high pier with a jump and a plunge back down to the beach.
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

  // The pier climbs out of the reef onto a boardwalk on stilts, jumps a gap and plunges back to the beach.
  b.section("Boogieman Sam's Pier", { halfWidth: 8.5, wallHeight: 1.2, surface: 'boards', bridge: true });
  b.mark('boardwalk');
  b.arc(38, 90);
  b.mark('pier');
  b.straight(40).elevate(PIER_Y).rise(20, PIER_Y + 3);
  b.gap(14, 30, 'water');
  b.elevate(PIER_Y).straight(45);
  b.mark('plunge');
  b.straight(35);

  b.section('Palm Shuffle', { halfWidth: 9, surface: 'sand' });
  b.mark('palms');
  b.arc(26, 75).arc(26, -75).straight(35);
  b.mark('slipFace');
  b.arc(40, 90);

  b.section('Lighthouse Point', { halfWidth: 10, surface: 'sand' });
  b.mark('lighthouse');
  b.arc(30, -40).arc(30, 40).straight(10).arc(30, 40).arc(30, -40).straight(10).arc(30, -40).arc(30, 40);
  b.turnTo(offsetPose(START, -FINISH * K), 40);
  b.section('Finish Straight', { halfWidth: 11, surface: 'sand' });
  b.straight(FINISH);
  shapeDunes(b);

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
      { s: b.marks.palms.s + 6, count: 3 },
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

/**
 * The lie of the land, laid over the layout: dunes on the beach and round
 * the Fish Leap (a steep slip face for airtime), a swell over the reef,
 * the climb onto the pier and its plunge, and the headland under the
 * lighthouse. The causeway's dive and the Open Water junctions stay at sea level.
 */
function shapeDunes(b: TrackBuilder): void {
  const m = (k: string) => b.marks[k].s;
  // A dune into the bend, level again well before the causeway.
  ease(b, 90, 118, 0, 3.5);
  ease(b, 118, 146, 3.5, 0);
  // Fish Leap: level where Open Water forks off, up a dune through the first bend, off its slip face, then a swell through the second.
  const leap = m('leap');
  ease(b, leap + 20, leap + 80, 0, 4.5);
  line(b, leap + 80, leap + 92, 4.5, 0.5);
  ease(b, leap + 92, leap + 103, 0.5, 0);
  ease(b, leap + 110, leap + 140, 0, 2);
  ease(b, leap + 140, leap + 170, 2, 0);
  // A swell over the reef, back at sea level where Open Water rejoins.
  ease(b, m('esses') + 12, m('esses') + 42, 0, 1.5);
  ease(b, m('esses') + 42, m('reefApex'), 1.5, 0);
  // Up a climbing bend onto the pier.
  ease(b, m('boardwalk'), m('pier') + 50, 0, PIER_Y);
  // Off the end of the pier: a crest, a plunge too steep to touch at speed, and the beach.
  const plunge = m('plunge') + 5;
  line(b, plunge, plunge + 19, PIER_Y, 0.8);
  ease(b, plunge + 19, m('palms'), 0.8, 0);
  // Palm Shuffle: a roll through the S, then a dune whose slip face throws karts into the air.
  ease(b, m('palms') + 8, m('palms') + 42, 0, 2.5);
  ease(b, m('palms') + 42, m('palms') + 74, 2.5, 0.5);
  ease(b, m('palms') + 74, m('slipFace') - 22, 0.5, 4.5);
  line(b, m('slipFace') - 22, m('slipFace') - 10, 4.5, 0.5);
  ease(b, m('slipFace') - 10, m('slipFace') + 5, 0.5, 0);
  // Lighthouse Point stands on a headland: up to the light, then a long run down to the finish.
  ease(b, m('lighthouse') - 8, m('lighthouse') + 30, 0, 6);
  ease(b, m('lighthouse') + 72, m('lighthouse') + 162, 6, 0);
  ease(b, m('lighthouse') + 220, m('lighthouse') + 265, 0, 2);
  ease(b, m('lighthouse') + 265, m('lighthouse') + 310, 2, 0);
}

/** Eases the road from height y0 to y1 between arc lengths s0 and s1, level at both ends. */
function ease(b: TrackBuilder, s0: number, s1: number, y0: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + ((y1 - y0) * (1 - Math.cos(Math.PI * u))) / 2);
}

/** A straight slope from y0 to y1: a slip face or a plunge, with a crest at its top. */
function line(b: TrackBuilder, s0: number, s1: number, y0: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * u);
}
