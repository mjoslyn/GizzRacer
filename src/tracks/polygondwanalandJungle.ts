import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const START: Pose = { x: 0, z: -160, h: Math.PI / 2 };
const FINISH = 70;
/** Short enough that the ruins end well clear of the line, so Waterfall Bend is one clean corner. */
const CANOPY = 94;
const RIVERBANK = 75;
/** Half the river's length, across the road: it runs wide enough for The Fourth Colour to leap it too. */
const RIVER_REACH = 60;
/** Canopy height for the vine bridges, the river ravine's floor and the rise the ruins stand on. */
const CANOPY_Y = 14;
const RAVINE_Y = -6;
const RUINS_Y = 8;

/**
 * Polygondwanaland Jungle (spec section 7, hard): vine hairpins, a jump
 * over a river, and walled stone ruins with a clockwork chicane. The
 * Fourth Colour, a secret line beyond sight, cuts the river corner with a
 * longer leap off a crumbling ramp.
 */
export function buildPolygondwanalandJungle(): TrackDef {
  // Canopy Run climbs off the line onto a vine bridge up in the canopy, and the hairpins wind back down on it.
  const vines = { halfWidth: 8.5, wallHeight: 1.2, bridge: true };
  const b = new TrackBuilder(START, 'Canopy Run', { halfWidth: 10 });
  b.straight(20);
  b.section('Canopy Run', { halfWidth: 10, wallHeight: 1.2, bridge: true });
  b.straight(CANOPY - 20).arc(45, 90);

  b.section('Vine Hairpins', vines);
  b.mark('hairpins');
  b.straight(20).arc(20, -170).straight(35).arc(20, 120);
  // Down on the forest floor again where The Fourth Colour peels away.
  b.section('Vine Hairpins', { halfWidth: 8.5 });
  b.arc(20, 50);
  b.mark('colourFrom');
  b.straight(20);

  // Open up to the ramp, so The Fourth Colour can peel away.
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

  // Crumbling Castle: the riverbank under a rising thick green tide, where The Fourth Colour comes back.
  b.section('Crumbling Castle', { halfWidth: 9 });
  b.straight(68).mark('colourTo').straight(RIVERBANK - 68);

  b.section('Polygon Ruins', { halfWidth: 8, wallHeight: 5, surface: 'rock' });
  b.mark('ruins');
  b.straight(50);
  b.section('Horology', { halfWidth: 8, wallHeight: 5, surface: 'rock' });
  b.arc(60, 45).arc(60, -45);
  b.section('Inner Cell', { halfWidth: 8, wallHeight: 5, surface: 'rock' });
  b.straight(40).arc(45, 90);

  b.section('Waterfall Bend', { halfWidth: 10 });
  b.mark('waterfall');
  b.straight(28).kicker();
  b.turnTo(offsetPose(START, -FINISH), 45);
  b.section('Finish Straight', { halfWidth: 10 });
  // A kicker before the line.
  b.straight(18).kicker().straight(FINISH - 25);

  shape(b, [
    [6, 0, 0],
    [CANOPY + 6, CANOPY_Y - 1, 0.03],
    [b.marks.hairpins.s + 20, CANOPY_Y, 0],
    [b.marks.colourFrom.s, 0, 0],
  ]);
  // Past the river the road turns down its ravine, sunk into the forest floor, and climbs back out to the bank.
  shape(b, [
    [b.marks.ravine.s, 0, 0],
    [b.marks.ravine.s + 40, RAVINE_Y, 0],
    [b.marks.ravine.s + 85, 0, 0],
  ], 2);
  // The ruins stand on a rise: up the steps (a kinked top that throws fast karts) and down again round the Inner Cell.
  const ruins = b.marks.ruins.s;
  shape(b, [
    [ruins, 0, 0],
    [ruins + 50, RUINS_Y, 0.22, 0],
    [ruins + 150, RUINS_Y, 0],
    [b.marks.waterfall.s, 0, 0],
  ]);

  const main = b.finish(true);
  const colour = buildFourthColour(b.marks.colourFrom, b.marks.colourTo, b.marks.river.pose);
  return {
    id: 'polygondwanaland-jungle',
    name: 'Polygondwanaland Jungle',
    main,
    branches: [colour.branch],
    pits: b.pits,
    boostPads: [{ s: 20, length: 8, lateral: 0, halfWidth: 2.5 }],
    checkpoints: ['hairpins', 'river', 'ruins', 'waterfall'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 420,
    landmarks: [
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
 * The Fourth Colour: from the last hairpin, a narrow line veers off left,
 * leaps the river where it runs wide (The Castle in the Air), and swings
 * back onto the bank. At 150cc full speed makes the leap; at 100cc it
 * takes an orange mini-turbo or a boost.
 */
function buildFourthColour(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }, river: Pose) {
  const b = new TrackBuilder(from.pose, 'The Fourth Colour', { halfWidth: 5 });
  const veer = 30;
  b.straight(6).arc(50, veer);
  // The river runs across the main road (heading -z) from 59 to 79 m past
  // the River Jump mark; leap it on the slant, from a metre short of the
  // near bank to the far one.
  const slant = Math.cos((veer * Math.PI) / 180);
  const ramp = 18;
  b.straight((b.pose.z - (river.z - 58)) / slant - ramp);
  b.section('The Castle in the Air', { halfWidth: 5 });
  b.elevate(0).straight(ramp).elevate(2.5);
  // The main road's river is the water below: no pit of its own (overlapping pits don't draw).
  b.gap(21 / slant, 0);
  b.elevate(0);
  const landing = b.s;
  // Then a straight and one more left turn onto the bank's line (heading -x).
  b.section('The Fourth Colour', { halfWidth: 5 });
  const r = 40;
  b.straight((b.pose.z - to.pose.z - r * (1 - Math.sin((veer * Math.PI) / 180))) / slant);
  b.arc(r, 90 - veer);
  b.straight(b.pose.x - to.pose.x);
  const branch: BranchDef = { name: 'The Fourth Colour', mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
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
