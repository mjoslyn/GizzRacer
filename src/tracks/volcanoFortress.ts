import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 0.87;
/** A point on the map, in layout units. */
const wp = (x: number, z: number, h: number): Pose => ({ x: x * K, z: z * K, h });
const START = wp(160, -120, Math.PI);
const FINISH = 60;
/** The volcano's cone stands in the middle of the map: the road winds up it from this far out to this near its crater, once round and on to its south-west side. */
const CONE = { x: 20, z: 30 };
const CONE_R0 = 85;
const CONE_R1 = 34;
const CONE_TURN = 405;
/** The rim bulges round the caldera on arcs of this radius; Hell's Itch is the chord. */
const RIM_R = 60;
/** The fortress stands this high on the volcano's shoulder (the Basalt Viaduct carries the road on at its height to the cone), and the cone's road climbs to its summit at this height. */
const FORTRESS_Y = 14;
const SUMMIT_Y = 28;
/** The Magma Bridge rises this much more to its crest. */
const CREST = 1.5;
/** How deep the Lava Tube runs under the volcano, and how high Hell's Itch flies over the caldera. */
const TUBE_Y = -7;
const ITCH_Y = 11;

/**
 * Magma (spec section 7, hard): the volcano fortress, basalt and lava. The
 * lap climbs the volcano, flies off its top and comes back under it, tied
 * in tiers where it crosses itself. Off the Ash Plain (a kicker, lava
 * bombs) and up the Lava Switchbacks, two hairpins stacked up the slope,
 * onto the volcano's shoulder; north through the walled basalt Fortress
 * Gate between its gatehouses, flame jets across the road; out of the back
 * gate onto the Basalt Viaduct, weaving west round the cone 14 m up, and
 * The Cone itself, the road spiralling up round it once and on, closing in
 * on the crater, to the summit at 28 m. The Magma Bridge leaves the summit
 * over the cone's foot, 10 m over its own way up, then tips over its crest
 * (fast karts fly) and plunges rail-less over a lava lake to the Caldera
 * Rim, which bulges round the caldera while Hell's Itch runs straight
 * across it. Home through the Lava Tube, sunk 7 m right under the volcano:
 * under the viaduct and the cone's road twice, out onto the Ash Plain and
 * the Finish Straight (a second kicker).
 */
export function buildVolcanoFortress(): TrackDef {
  const b = new TrackBuilder(START, 'Ash Plain', { halfWidth: 11 });
  b.scale = K;
  b.straight(13).kicker().straight(50).arc(50, -90).straight(30).arc(40, -90);

  b.section('Lava Switchbacks', { halfWidth: 9, wallHeight: 1.2 });
  b.mark('switchbacks');
  b.arc(26, 90).straight(20).arc(26, -180).straight(40).arc(26, 180).straight(40).arc(26, -90);

  b.section('Fortress Gate', { halfWidth: 7.5, wallHeight: 8, surface: 'rock' });
  b.mark('fortress');
  b.straight(60).arc(70, -30).straight(40).arc(70, 30).straight(20).arc(60, -90);
  b.mark('fortressEnd');

  // Out of the back gate and across to the cone on pillars, over the Lava Tube.
  b.section('Basalt Viaduct', { halfWidth: 9, wallHeight: 1.2, bridge: true });
  b.mark('viaduct');
  b.arc(60, -25).arc(60, 50).arc(60, -25).arc(160, 20).arc(160, -20);
  b.turnTo(wp(CONE.x - CONE_R0, CONE.z, Math.PI), 60);

  // Round the cone and up it, each ring inside the last, to the summit.
  b.section('The Cone', { halfWidth: 9, wallHeight: 1.2, bridge: true });
  b.mark('cone');
  coil(b, Math.PI, CONE_R0, CONE_R1, CONE_TURN);
  b.mark('summit');

  // Magma Bridge: rail-less, off the summit over the cone's foot, kinked at its crest so fast karts fly, and down over the lava lake.
  b.section('Magma Bridge', { halfWidth: 7, bridge: true });
  b.mark('bridge');
  b.arc(30, 90);
  b.straight(55);
  b.mark('crest');
  b.straight(45);
  b.bridge(70, 26, 'lava');
  b.straight(14);

  b.section('Caldera Rim', { halfWidth: 10, wallHeight: 1.2 });
  b.mark('caldera');
  b.turnTo(wp(-250, -110, 0), 45);
  // Satan Speeds Up: a boost pad lined up with the causeway.
  b.section('Satan Speeds Up', { halfWidth: 10 });
  b.straight(30);
  b.section('Caldera Rim', { halfWidth: 10 });
  b.mark('rimStart');
  b.arc(RIM_R, -60).arc(RIM_R, 120).arc(RIM_R, -60);
  b.mark('rimEnd');
  b.straight(20);

  // The Lava Tube: sunk under the volcano, under the viaduct and twice under the cone's road.
  b.section('Lava Tube', { halfWidth: 9, wallHeight: 1.2 });
  b.mark('tube');
  b.arc(45, 90);
  b.hermiteTo(wp(-110, 120, (140 * Math.PI) / 180));
  b.hermiteTo(wp(CONE.x, CONE.z, (110 * Math.PI) / 180));
  b.arc(90, 15).arc(90, -15);
  b.mark('tubeEnd');

  b.section('Ash Plain', { halfWidth: 11 });
  b.hermiteTo(offsetPose(START, -FINISH * K));
  b.section('Finish Straight', { halfWidth: 11 });
  b.straight(13).kicker().straight(FINISH - 20);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // Up the switchbacks onto the volcano's shoulder, through the fortress and
  // over the viaduct, round the cone to its summit, out over the cone's foot
  // on the Magma Bridge, off its crest and down over the lava lake.
  ease(b, m('switchbacks'), 0, m('fortress'), FORTRESS_Y);
  b.profile(m('fortress'), m('cone'), () => FORTRESS_Y, 10);
  ease(b, m('cone'), FORTRESS_Y, m('summit'), SUMMIT_Y);
  shape(b, [
    [m('summit'), SUMMIT_Y, 0],
    [m('crest'), SUMMIT_Y + CREST, 0.08, -0.15],
    [m('caldera', 10), 0, 0],
  ]);
  // Down into the Lava Tube past the caldera, and up again onto the plain.
  ease(b, m('tube', 60), 0, m('tube', 150), TUBE_Y);
  b.profile(m('tube', 150), m('tubeEnd', -30), () => TUBE_Y, 10);
  ease(b, m('tubeEnd', -30), TUBE_Y, m('tubeEnd', 40), 0);

  const main = b.finish(true);
  const itch = buildHellsItch(b.marks.rimStart, b.marks.rimEnd);
  return {
    id: 'volcano-fortress',
    name: 'Magma',
    main,
    branches: [itch.branch],
    pits: [...b.pits, ...itch.pits],
    boostPads: [
      { s: 60, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: b.marks.rimStart.s - 14, length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['switchbacks', 'fortress', 'viaduct', 'cone', 'bridge', 'caldera', 'tube'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 340,
    landmarks: [
      { kind: 'fortressGate', ribbon: -1, s: b.marks.fortress.s + 6 },
      { kind: 'fortressGate', ribbon: -1, s: b.marks.fortressEnd.s - 8 },
    ],
    itemBoxes: [
      { s: 95, count: 4 },
      { s: b.marks.fortress.s + 30, count: 3 },
      { s: m('cone', 200), count: 3 },
      { s: b.marks.caldera.s + 25, count: 4 },
      { s: m('tube', 200), count: 3 },
      { s: itch.branch.length / 2, count: 2, ribbon: 0, span: 4, double: true },
    ],
    hazards: [
      { kind: 'lavaBombs', at: [55, 115, b.marks.caldera.s + 45], period: 6 },
      { kind: 'flameJets', at: [b.marks.fortress.s + 50, b.marks.fortress.s + 159, b.marks.fortress.s + 243], period: 3.2 },
    ],
    theme: 'volcano',
    music: { lap: 'volcano-fortress' },
  };
}

/**
 * Hell's Itch: a narrow, rail-less causeway straight across the caldera,
 * over a river of lava. Fall off and you're in it.
 */
function buildHellsItch(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, "Hell's Itch", { halfWidth: 4 });
  // Up on a deck once clear of the rim, so the lava keeps off the main road, and high over the caldera.
  const run = 46;
  const ramp = 14;
  b.straight(run);
  b.section("Hell's Itch", { halfWidth: 4, bridge: true });
  b.straight(ramp);
  b.bridge(chord - 2 * (run + ramp), 14, 'lava');
  b.straight(ramp);
  b.section("Hell's Itch", { halfWidth: 4 });
  b.straight(chord - b.s);
  shape(b, [
    [run, 0, 0],
    [chord / 2, ITCH_Y, 0],
    [chord - run, 0, 0],
  ]);
  // The magma rises over it on the final lap.
  const branch: BranchDef = { name: "Hell's Itch", mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [1, 2], shut: { kind: 'flood' } };
  return { branch, pits: b.pits };
}

/** Eases the road's height from y0 at arc length s0 to y1 at s1. */
function ease(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * u * u * (3 - 2 * u));
}

/**
 * Winds the road round the cone, anticlockwise on the map from the side at
 * angle `from` (radians from east, anticlockwise), closing in from radius r0
 * to r1 over `turn` degrees: an Archimedean spiral about the crater, so each
 * ring runs evenly inside the last.
 */
function coil(b: TrackBuilder, from: number, r0: number, r1: number, turn: number, stepDeg = 15): void {
  const n = Math.ceil(turn / stepDeg);
  const total = (turn * Math.PI) / 180;
  const dr = (r1 - r0) / total;
  for (let k = 1; k <= n; k++) {
    const a = from + (total * k) / n;
    const r = r0 + dr * (a - from);
    const dx = dr * Math.cos(a) - r * Math.sin(a);
    const dz = dr * Math.sin(a) + r * Math.cos(a);
    b.hermiteTo(wp(CONE.x + r * Math.cos(a), CONE.z + r * Math.sin(a), Math.atan2(dx, dz)));
  }
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
