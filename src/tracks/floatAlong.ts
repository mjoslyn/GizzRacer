import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

/**
 * The lap is a cinquefoil, the (5,2) torus knot: twice round the middle and
 * five times round the tube, so five lobes and five crossings. This many
 * builder units to the knot's unit, and the tube's distance from the middle.
 */
const R = 60;
const C = 2.5;
/** A point on the knot at angle `t`, heading along it. */
function knot(t: number): Pose {
  const r = C + Math.cos(5 * t);
  const dr = -5 * Math.sin(5 * t);
  const dx = dr * Math.sin(2 * t) + 2 * r * Math.cos(2 * t);
  const dz = dr * Math.cos(2 * t) - 2 * r * Math.sin(2 * t);
  return { x: r * Math.sin(2 * t) * R, z: r * Math.cos(2 * t) * R, h: Math.atan2(dx, dz) };
}
/**
 * The knot's height, its third coordinate, lifted so that its lows run on
 * the ground and its highs on decks this high: at every crossing one road
 * passes over the other, over, under, over, as the knot goes.
 */
const TIER = 8.5;
const lift = (t: number) => (TIER * (1 - Math.sin(5 * t))) / 2;
/** Waypoints this far apart on the knot: the crossings fall on the odd ones, the lobes' tips on every fourth. */
const STEP = Math.PI / 10;
/** The start line: on the knot's line through its first crossing, this far short of it, so the Old Ford runs straight under Float Along's deck. */
const START: Pose = offsetPose(knot(STEP), -40);
const FINISH = 45;
/** How far each crossing runs level either side, over or under. */
const HOLD = 28;
/** The dam: Fill Your Lungs swells out round it this far past the knot, a lung filling; Deep Breath dives straight under it, this wide. */
const LUNG = 34;
const POND = 12;
/** Fill Your Lungs: sunk this deep beneath the dam's wall, walled in by the cut, for this long, a lungful. */
const DEPTH = 7;
const LUNGFUL = 36;
/** Breathe a Deep Breath: up for air to a crest this high, held this long past A Baby's Face, then off it. */
const CREST = 11;
const CREST_HOLD = HOLD;
/** Float Along's swells, five to the bar as the song is in 5/4 (two down to the crossing under My Coffee Mug, three up from it), this high. */
const SWELL = 1.2;

/**
 * Float Along (the Float Along – Fill Your Lungs Cup's last), after the
 * album's closer: the band's first song in 5/4, droning and tranquil, the
 * rhythm of Stu's old Ford chiming at the barn with its lights left on.
 * Someone's face, seen everywhere: "in the carpet shades", like a baby's
 * face, in the paper folds and the coffee mug; and between, float along
 * and fill your lungs, breathe a deep breath. The world is the barn in the
 * country of a morning, the old Ford outside with its headlights on, golden
 * paddocks, a farm dam, gum trees and a soft blue sky, the face in the
 * clouds. The lap is a cinquefoil, five lobes and five crossings, laid out
 * from the knot's equations, the road rising and falling with the knot's
 * third coordinate in long easy swells, every under on the ground and every
 * over on a deck: the Old Ford (two kickers) under Float Along's deck,
 * Carpet Shades up on a deck, A Baby's Face under the crest and over Paper
 * Folds, Float Along over five easy swells and onto its deck over the Old
 * Ford; Fill Your Lungs down to the farm dam and round it, the lobe
 * swelling out past the knot like a lung filling, then diving 7 m into a
 * cut beneath the dam's wall, under Carpet Shades, great breaths of air
 * bubbling up through the road; Breathe a Deep Breath up for air to an 11 m
 * crest and off it; Paper Folds, a leap over a crease in the land; and My
 * Coffee Mug over Float Along and home. Shortcut: Deep Breath, straight
 * across the dam and under its water, from lap 2.
 */
export function buildFloatAlong(): TrackDef {
  const b = new TrackBuilder(START, 'The Old Ford', { halfWidth: 11, surface: 'gravel' });
  const to = (k: number) => b.hermiteTo(knot(k * STEP)).mark(`w${k}`);
  const deck = (name: string) => b.section(name, { halfWidth: 10, wallHeight: 1.2, surface: 'gravel', bridge: true });
  b.straight(20).mark('kick1').kicker().straight(25).mark('kick2').kicker().straight(10);
  b.mark('kicked');
  to(2);
  deck('Carpet Shades');
  to(3);
  to(4);
  to(4.5);
  deck("A Baby's Face");
  to(5);
  to(6);
  to(7);
  to(8);
  deck('Float Along');
  to(9);
  to(10);
  to(11);
  to(11.35);
  // Fill your lungs: down off the deck to the dam and round it, the lobe's tip swelling out past the knot like a lung
  // filling; then diving into a cut beneath the dam's wall, great breaths of air bubbling up through the road.
  b.section('Fill Your Lungs', { halfWidth: 9.5, surface: 'gravel' });
  to(11.5);
  b.mark('damFrom');
  for (const k of [11.75, 12, 12.25]) {
    b.hermiteTo(swollen(k * STEP));
    if (k === 12) b.mark('lung');
  }
  to(12.5);
  b.mark('damTo');
  to(13);
  to(14);
  deck('Breathe a Deep Breath');
  to(15);
  to(16);
  to(16.6);
  b.section('Paper Folds', { halfWidth: 10, wallHeight: 1.2, surface: 'gravel' });
  to(17);
  // Under A Baby's Face, then a crease in the land: a leap over it.
  b.straight(HOLD + 4).mark('ramp').elevate(0).rise(18, 3);
  b.gap(14, 20, 'water');
  b.elevate(0).straight(10);
  b.mark('foldEnd');
  b.straight(15);
  deck('My Coffee Mug');
  to(19);
  b.hermiteTo(offsetPose(START, -FINISH));
  b.section('Finish Straight', { halfWidth: 11, surface: 'gravel' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d;
  // Each waypoint at its own angle on the knot, so the road's height follows the knot's along it.
  const ends: [number, number][] = [[m('kicked'), 1.25]];
  for (const k of [2, 3, 4, 4.5, 5, 6, 7, 8, 9, 10, 11, 11.35, 11.5, 12.5, 13, 14, 15, 16, 16.6, 17, 19]) ends.push([m(`w${k}`), k]);
  ends.push([m('finish'), 20.3]);
  const tOf = (s: number) => {
    for (let k = 0; k + 1 < ends.length; k++) {
      const [s0, k0] = ends[k];
      const [s1, k1] = ends[k + 1];
      if (s <= s1) return (k0 + ((s - s0) / (s1 - s0)) * (k1 - k0)) * STEP;
    }
    return 2 * Math.PI;
  };
  /** The knot's height from `from` to `to`, its angles there stretched to run from waypoint k0 to k1 (plus `extra`). */
  const knotted = (from: number, to: number, k0: number, k1: number, extra = (_u: number) => 0) => {
    const a = tOf(from);
    const z = tOf(to);
    b.profile(from, to, (u) => lift((k0 + ((tOf(from + (to - from) * u) - a) / (z - a)) * (k1 - k0)) * STEP) + extra(u));
  };
  /** Level over each crossing, over or under. */
  const level = (k: number, y: number, before = HOLD, after = HOLD) => b.profile(m(`w${k}`, -before), m(`w${k}`, after), () => y, 10);
  const w = (k: number, d: number) => m(`w${k}`, d);
  // The Old Ford runs on the ground under Float Along's deck; from there the knot rises and falls, level over every crossing.
  knotted(m('kicked'), w(3, -HOLD), 1, 3);
  level(3, TIER);
  knotted(w(3, HOLD), w(5, -HOLD), 3, 5);
  level(5, 0);
  knotted(w(5, HOLD), w(7, -HOLD), 5, 7);
  level(7, TIER);
  // Floating along over five swells, down under My Coffee Mug and up onto the deck over the Old Ford.
  const swells = (n: number) => (u: number) => SWELL * Math.sin(Math.PI * n * u) ** 2;
  knotted(w(7, HOLD), m('w8'), 7, 8);
  knotted(m('w8'), w(9, -HOLD), 8, 9, swells(2));
  level(9, 0);
  knotted(w(9, HOLD), w(11, -HOLD), 9, 11, swells(3));
  level(11, TIER);
  // Down off the deck to the water's edge, round the dam on the ground, and into the cut beneath its wall.
  knotted(w(11, HOLD), m('damFrom'), 11, 13);
  b.profile(m('damFrom'), m('damTo', 5), () => 0, 10);
  ease(b, m('damTo', 5), 0, w(13, 10), -DEPTH);
  b.profile(w(13, 10), w(13, 10 + LUNGFUL), () => -DEPTH, 10);
  // Up for air, to the crest over A Baby's Face, and off it.
  ease(b, w(13, 10 + LUNGFUL), -DEPTH, w(15, -HOLD), CREST);
  level(15, CREST, HOLD, CREST_HOLD);
  plunge(b, w(15, CREST_HOLD), CREST, m('w16'), 0);
  b.profile(m('w16'), m('ramp'), () => 0, 10);
  // Then the knot rises to My Coffee Mug's deck over Float Along, and comes down home.
  knotted(m('foldEnd'), w(19, -HOLD), 17.5, 19);
  level(19, TIER);
  knotted(w(19, HOLD), m('finish', -5), 19, 21);
  b.profile(m('finish', -5), b.s, () => 0, 10);

  const main = b.finish(true);
  const dam = buildDeepBreath(b.marks.damFrom, b.marks.damTo);
  return {
    id: 'float-along',
    name: 'Float Along',
    main,
    branches: [dam.branch],
    pits: [...b.pits, ...dam.pits],
    boostPads: [
      { s: 36, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: w(13, 10 + LUNGFUL), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: m('ramp', -30), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['w2', 'w4', 'w6', 'w8', 'w10', 'damFrom', 'w13', 'w15', 'w17', 'w19'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 280,
    landmarks: [
      { kind: 'oldFord', ribbon: -1, s: 6 },
      { kind: 'faceCloud', ribbon: -1, s: m('w8'), lateral: 180 },
      { kind: 'faceCloud', ribbon: -1, s: m('w4'), lateral: 200 },
      { kind: 'faceCloud', ribbon: -1, s: m('w12.5'), lateral: 170 },
      { kind: 'farmDam', ribbon: 0, s: dam.boxes },
    ],
    itemBoxes: [
      { s: 80, count: 4 },
      { s: w(4, 10), count: 4 },
      { s: w(8, 10), count: 4 },
      { s: w(13, LUNGFUL + 40), count: 3 },
      { s: m('foldEnd', 30), count: 4 },
      { s: dam.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'bubbles', at: [w(13, 13), w(13, 10 + LUNGFUL / 2), w(13, 7 + LUNGFUL)], period: 4.5 },
      { kind: 'bubbles', at: [m('lung', -15), m('lung', 15)], period: 4.5 },
    ],
    theme: 'float',
    music: { lap: 'float-along', finalLap: 'float-along-final-lap' },
  };
}

/** The knot round the dam: its lobe's tip pushed out from the middle, most at the tip, none where Deep Breath leaves and rejoins. */
function swollen(t: number): Pose {
  const at = (t: number) => {
    const p = knot(t);
    const u = t / STEP - 11.5;
    const out = 1 + (LUNG * Math.sin(Math.PI * u) ** 1.5) / Math.hypot(p.x, p.z);
    return { x: p.x * out, z: p.z * out };
  };
  const p = at(t);
  const a = at(t - 0.001);
  const c = at(t + 0.001);
  return { x: p.x, z: p.z, h: Math.atan2(c.x - a.x, c.z - a.z) };
}

/** Eases the road's height from y0 at arc length s0 to y1 at s1. */
function ease(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * u * u * (3 - 2 * u));
}

/** Drops the road from y0 at s0 to y1 at s1, falling away at once over the top (a crest to fly off) and easing out at the bottom. */
function plunge(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * Math.sin((Math.PI * u) / 2));
}

/** Deep Breath turns onto the dam this far from each end. */
const LEAD = 30;

/**
 * Deep Breath: straight across the farm dam the main road swells out
 * round, a breath held and down under the water along the bottom, and up
 * the other side. There from lap 2.
 */
function buildDeepBreath(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const dx = to.pose.x - from.pose.x;
  const dz = to.pose.z - from.pose.z;
  const chord = Math.hypot(dx, dz);
  const h = Math.atan2(dx, dz);
  const along = (d: number): Pose => ({ x: from.pose.x + Math.sin(h) * d, z: from.pose.z + Math.cos(h) * d, h });
  const b = new TrackBuilder(from.pose, 'Deep Breath', { halfWidth: 6, surface: 'gravel' });
  b.straight(5).hermiteTo(along(LEAD));
  b.section('Under the Dam', { halfWidth: 6, surface: 'gravel' });
  const water = chord - 2 * LEAD;
  const boxes = b.s + water / 2;
  b.dive(water, 5, 20, POND);
  b.section('Deep Breath', { halfWidth: 6, surface: 'gravel' });
  b.hermiteTo(offsetPose(to.pose, -5)).straight(5);
  const branch: BranchDef = { name: 'Deep Breath', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2, 'final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
