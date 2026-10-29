import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

/** The windpipe's two lanes, down and up, run this far either side of the middle. */
const LANE = 35;
const START: Pose = { x: -LANE, z: 140, h: Math.PI };
const FINISH = 70;
/** The bronchus runs east under the windpipe's down lane, then under its up lane, the road coming back up it heading north. */
const BRONCHUS: Pose = { x: -LANE, z: 0, h: Math.PI / 2 };
const UP: Pose = { x: LANE, z: 0, h: 0 };
/** How far Hell's Itch runs up the riverbank before it bends over the top of the left lung. */
const RIVERBANK = 155;
/** Half the river's length, across the road: it runs wide enough for Root Network to leap it too. */
const RIVER_REACH = 60;
/** Canopy height for the vine bridges, the river ravine's floor and the rise the ruins stand on. */
const CANOPY_Y = 14;
const RAVINE_Y = -6;
const RUINS_Y = 9;

/**
 * Iron Lung, once Polygondwanaland (hard): the jungle, the planet's lungs,
 * overgrown with mushrooms, in the Ice, Death, Planets, Lungs, Mushrooms and
 * Lava Cup. The lap is a pair of lungs. Down the windpipe from the line,
 * Canopy Run climbing onto a vine bridge, over the bronchus and into the
 * left lung: the Vine Hairpins wind down from the canopy, a jump over a
 * river, the ravine, and Hell's Itch up the riverbank and over the top of
 * the lung. Then the bronchus, under both lanes of the windpipe, into the
 * right lung: walled stone ruins up on a rise, Mushroom Hollow down its far
 * side, and Hyphae Hall climbing back onto a deck over the bronchus and up
 * the windpipe to the waterfall. Root Network, a secret line beyond sight,
 * cuts the river corner with a longer leap off a crumbling ramp.
 */
export function buildPolygondwanalandJungle(): TrackDef {
  const vines = { halfWidth: 8.5, wallHeight: 1.2, bridge: true };
  const b = new TrackBuilder(START, 'Canopy Run', { halfWidth: 10 });
  b.straight(20);
  b.section('Canopy Run', { halfWidth: 10, wallHeight: 1.2, bridge: true });
  // Down the windpipe on the vine bridge, over the bronchus, and into the left lung.
  b.straight(120);
  b.mark('downCross');
  b.straight(30).arc(30, 90);

  b.section('Vine Hairpins', vines);
  b.mark('hairpins');
  b.straight(40).arc(22, -180).straight(40).arc(22, 180).straight(40);
  // Down on the forest floor again where Root Network peels away.
  b.section('Vine Hairpins', { halfWidth: 8.5 });
  b.arc(40, -60).arc(40, 60);
  b.mark('colourFrom');
  b.straight(20);

  b.section('River Jump', { halfWidth: 9 });
  b.mark('river');
  b.straight(40);
  b.section('River Jump', { halfWidth: 9, wallHeight: 1.2 });
  b.elevate(0).straight(22).elevate(3);
  b.gap(14, RIVER_REACH, 'water', 12, 3);
  b.elevate(0).straight(20);
  b.section('River Jump', { halfWidth: 9 });
  b.mark('ravine');
  b.arc(45, 90);

  // Hell's Itch: up the riverbank under a rising thick green tide, where Root Network comes back, over the top of the lung and down the bronchus.
  b.section("Hell's Itch", { halfWidth: 9 });
  b.straight(68).mark('colourTo').straight(RIVERBANK - 68).arc(50, 90);
  b.hermiteTo(offsetPose(BRONCHUS, -40));
  b.straight(40);
  b.mark('bronchus');
  b.straight(2 * LANE + 40);

  // The right lung: the ruins out along its top, the hollow down its far side, and Hyphae Hall back up the middle on a deck.
  b.section('Spore Ruins', { halfWidth: 8, wallHeight: 5, surface: 'rock' });
  b.mark('ruins');
  b.straight(50).arc(60, -40).straight(40);
  b.section('Mushroom Hollow', { halfWidth: 8, wallHeight: 5, surface: 'rock' });
  b.mark('hollow');
  b.arc(60, 130).arc(90, -25).arc(90, 25).arc(50, 90).straight(20);
  b.section('Hyphae Hall', { halfWidth: 8, wallHeight: 5, surface: 'rock', bridge: true });
  b.mark('hyphae');
  b.arc(70, 25).arc(70, -25);
  b.turnTo(offsetPose(UP, -60), 45);
  b.straight(60);
  b.mark('upCross');
  b.straight(90);

  b.section('Waterfall Bend', { halfWidth: 10 });
  b.mark('waterfall');
  b.straight(28).kicker();
  b.turnTo(offsetPose(START, -FINISH), 35);
  b.section('Finish Straight', { halfWidth: 10 });
  // A kicker before the line.
  b.straight(18).kicker().straight(FINISH - 25);

  const m = (name: string, d = 0) => b.marks[name].s + d;
  // Canopy Run climbs off the line onto a vine bridge, over the bronchus, up into the canopy; the hairpins wind back down on it.
  shape(b, [
    [6, 0, 0],
    [m('downCross', -35), CANOPY_Y - 4, 0.05],
    [m('hairpins', 20), CANOPY_Y, 0],
    [m('colourFrom'), 0, 0],
  ]);
  // Past the river the road turns down its ravine, sunk into the forest floor, and climbs back out to the bank.
  shape(b, [
    [m('ravine'), 0, 0],
    [m('ravine', 40), RAVINE_Y, 0],
    [m('ravine', 85), 0, 0],
  ], 2);
  // The ruins stand on a rise: up the steps (a kinked top that throws fast karts), down into Mushroom Hollow,
  // and up again onto Hyphae Hall, over the bronchus, and down the windpipe to the waterfall.
  shape(b, [
    [m('ruins'), 0, 0],
    [m('ruins', 50), RUINS_Y, 0.22, 0],
    [m('hollow', 60), RUINS_Y, 0],
    [m('hollow', 200), 1, 0],
    [m('hyphae'), 4, 0.04],
    [m('upCross', -45), RUINS_Y, 0],
    [m('upCross', 45), RUINS_Y, 0],
    [m('waterfall', 15), 0, 0],
  ]);

  const main = b.finish(true);
  const colour = buildRootNetwork(b.marks.colourFrom, b.marks.colourTo, b.marks.river.pose);
  return {
    id: 'polygondwanaland-jungle',
    name: 'Iron Lung',
    main,
    branches: [colour.branch],
    pits: b.pits,
    boostPads: [{ s: 20, length: 8, lateral: 0, halfWidth: 2.5 }],
    checkpoints: ['hairpins', 'river', 'ruins', 'waterfall'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 420,
    landmarks: [
      { kind: 'mushroomArch', ribbon: -1, s: 0 },
      { kind: 'templeGate', ribbon: -1, s: b.marks.ruins.s + 4 },
      { kind: 'waterfall', ribbon: -1, s: b.marks.waterfall.s + 30 },
    ],
    itemBoxes: [
      { s: 42, count: 4 },
      { s: b.marks.river.s + 15, count: 4 },
      { s: b.marks.ruins.s + 30, count: 3 },
      { s: b.marks.waterfall.s + 72, count: 4 },
      { s: colour.landing + 12, count: 2, ribbon: 0, span: 5, double: true },
    ],
    hazards: [
      { kind: 'vines', at: [b.marks.hairpins.s + 10, b.marks.hairpins.s + 96, b.marks.hairpins.s + 183], period: 3.6 },
      { kind: 'rollers', from: b.marks.ruins.s + 15, to: b.marks.ruins.s + 170, count: 3, period: 7 },
    ],
    theme: 'jungle',
    music: { lap: 'polygondwanaland-jungle' },
  };
}

/**
 * Root Network: from the last hairpin, a narrow line veers off right,
 * leaps the river where it runs wide (the Spore Leap), and swings
 * back onto the bank. At 150cc full speed makes the leap; at 100cc it
 * takes an orange mini-turbo or a boost.
 */
function buildRootNetwork(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }, river: Pose) {
  // Distances along the River Jump's heading, and across it toward the bank.
  const along = (p: Pose) => (p.x - river.x) * Math.sin(river.h) + (p.z - river.z) * Math.cos(river.h);
  const across = (p: Pose) => (p.x - river.x) * Math.cos(river.h) - (p.z - river.z) * Math.sin(river.h);
  const b = new TrackBuilder(from.pose, 'Root Network', { halfWidth: 5 });
  const veer = 30;
  b.straight(6).arc(50, veer);
  // The river runs across the main road from 59 to 79 m past the River
  // Jump mark; leap it on the slant, from a metre short of the near bank
  // to the far one.
  const slant = Math.cos((veer * Math.PI) / 180);
  const ramp = 18;
  b.straight((58 - along(b.pose)) / slant - ramp);
  b.section('Spore Leap', { halfWidth: 5 });
  b.elevate(0).straight(ramp).elevate(2.5);
  // The main road's river is the water below: no pit of its own (overlapping pits don't draw).
  b.gap(21 / slant, 0);
  b.elevate(0);
  const landing = b.s;
  // Then a straight and one more right turn onto the bank's line.
  b.section('Root Network', { halfWidth: 5 });
  const r = 40;
  b.straight((along(to.pose) - along(b.pose) - r * (1 - Math.sin((veer * Math.PI) / 180))) / slant);
  b.arc(r, 90 - veer);
  b.straight(across(to.pose) - across(b.pose));
  // The spore leap crumbles away on the final lap.
  const branch: BranchDef = { name: 'Root Network', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [1, 2], shut: { kind: 'vanish' } };
  return { branch, landing };
}

/**
 * Shapes the road through [s, y, slope] points (a fourth value is the slope
 * leaving the point, for a kink at a crest): a smooth curve between each pair.
 */
function shape(b: TrackBuilder, pts: number[][], step = 6): void {
  for (let k = 1; k < pts.length; k++) {
    const [s0, y0, m0, out = m0] = pts[k - 1];
    const [s1, y1, m1] = pts[k];
    const len = s1 - s0;
    b.profile(s0, s1, (t) => (2 * t ** 3 - 3 * t ** 2 + 1) * y0 + (t ** 3 - 2 * t ** 2 + t) * len * out + (3 * t ** 2 - 2 * t ** 3) * y1 + (t ** 3 - t ** 2) * len * m1, step);
  }
}
