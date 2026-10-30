import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.0;
/**
 * The lap is a running stitch mending a tear: the tear runs corner to
 * corner across the map, and the thread goes up it on one side and back
 * down it on the other, each pass weaving across the seam so the two
 * cross three times, over, under, over. The seam's half-length, its
 * direction, and the stitch's reach either side of it: widest across the
 * middle of the tear, closing to the hairpins at its ends.
 */
const SEAM = 260;
const SEAM_H = Math.PI / 4;
const REACH = 120;
const REACH_END = 50;
/** Three half-waves up the seam: the thread crosses it three times on each pass. */
const STITCHES = 3;
/** Samples along each pass, a pose every this share of a half-wave. */
const STEPS = 8;
/** The decks the thread runs over itself on, and how deep the Hall is sunk between its walls. */
const TIER = 8;
const DEPTH = 6;
const WALL = 6;
const FINISH = 45;
/** The seam is laid this far up from the map's middle, so the whole lap sits in the middle of it. */
const SHIFT = 59;
/** The tear isn't straight: it bows this far one way and the other, an S across the map. */
const BOW = 50;
/** This Will Be the Last swings out round the spilt vase in three arcs of this radius and turn; the Last Time I Ask runs straight across. */
const ASK_R = 42;
const ASK_TURN = 70;

const AX = Math.sin(SEAM_H);
const AZ = Math.cos(SEAM_H);
/** Left of the seam's direction. */
const NX = Math.cos(SEAM_H);
const NZ = -Math.sin(SEAM_H);
/** The stitch's reach at `u` along the seam. */
const reach = (u: number) => REACH_END + (REACH - REACH_END) * Math.cos((Math.PI * u) / (2 * SEAM)) ** 2;
/** A point on a pass `side` (1 up the seam, -1 back down it) at `u` along the seam: out from the bowed seam, square to it. */
function stitch(side: number, u: number): [number, number] {
  const bow = BOW * Math.sin((Math.PI * u) / SEAM);
  const slope = ((BOW * Math.PI) / SEAM) * Math.cos((Math.PI * u) / SEAM);
  const t = Math.hypot(1, slope);
  // The seam's own left, where it bows.
  const nx = (NX - AX * slope) / t;
  const nz = (NZ - AZ * slope) / t;
  const w = side * reach(u) * Math.cos((STITCHES * Math.PI * (u + SEAM)) / (2 * SEAM));
  return [(AX * (u + SHIFT) + NX * bow + nx * w) * K, (AZ * (u + SHIFT) + NZ * bow + nz * w) * K];
}
/** The pose on a pass at sample `k` (0..STITCHES * STEPS), heading the way it's driven. */
function pass(side: number, k: number): Pose {
  const n = STITCHES * STEPS;
  const u = side * SEAM * ((2 * k) / n - 1);
  const [x, z] = stitch(side, u);
  const [x1, z1] = stitch(side, u + side * 0.01);
  return { x, z, h: Math.atan2(x1 - x, z1 - z) };
}
/** The pose `d` back from where the pass up the seam begins, on its line. */
const seamEnd = (d: number): Pose => {
  const p = pass(1, 0);
  return { x: p.x - Math.sin(p.h) * d * K, z: p.z - Math.cos(p.h) * d * K, h: p.h };
};
/**
 * The hairpin at the near end of the tear turns the pass down back onto
 * the line of the pass up, as far past its end as This Will Be the Last
 * runs on (its swing out and back, and a straight either side), so the
 * start is that far back from where the pass up begins, less the finish.
 */
const BEYOND = 10 + 4 * ASK_R * Math.sin((ASK_TURN * Math.PI) / 180) + 10;
const START: Pose = seamEnd(BEYOND - FINISH);

/**
 * Let Me Mend the Past (the Float Along – Fill Your Lungs Cup's third),
 * after Ambrose's song, the album's one with his name on it, written at
 * about twenty: a doo-wop ballad about his mum and her sisters, who all
 * hate each other, and living at his nan's for a bit, where an auntie put
 * cameras up in the hallway; "let me mend the past", see behind your mask,
 * she stares at the ground, locks on the door, surveillance when you
 * enter in, her cups on my wall, make ends meet at last, and this will be
 * the last time I ask. The world is nan's house, the karts tiny in it: a
 * floral carpet runner over the floorboards, wallpaper over the dado rail,
 * teacups and doilies, armchairs and standard lamps, the family's photos,
 * the sewing basket spilt. The lap is the mending, a running stitch up a
 * tear across the floor and back down it, each pass weaving over and under
 * the other: out through nan's front door (two kickers), Behind Your Mask
 * on a deck over the way back, a crest off it where She Stares at the
 * Ground, Locks on the Door, then Surveillance and the Hall, sunk 6 m
 * between papered walls, the cameras up on them sweeping the road, under
 * the way back; climbing out past Her Cups on My Wall onto the deck at
 * Hard to Be Ignored, over it again; Make Ends Meet, a leap and the
 * hairpin at the far end of the tear, and back down it: Before They Bleed,
 * Come Across Too Weak (narrow, high over the Hall), This Will Be the Last,
 * under the first deck, swinging out round the vase spilt on the floor,
 * and the hairpin home. Shortcut: the Last Time I Ask, a thread pulled
 * straight across the spilt water, on the final lap only.
 */
export function buildMendThePast(): TrackDef {
  const b = new TrackBuilder(START, 'Let Me Mend the Past', { halfWidth: 11, surface: 'florals' });
  b.scale = K;
  const up = (k: number) => b.hermiteTo(pass(1, k)).mark(`o${k}`);
  const down = (k: number) => b.hermiteTo(pass(-1, k)).mark(`r${k}`);
  b.straight(30).mark('kick1').kicker().straight(25).mark('kick2').kicker().straight(10);
  b.hermiteTo(pass(1, 0)).mark('o0');
  for (let k = 1; k <= 2; k++) up(k);
  b.section('Behind Your Mask', { halfWidth: 10, wallHeight: 1.2, surface: 'florals', bridge: true });
  for (let k = 3; k <= 6; k++) up(k);
  b.section('She Stares at the Ground', { halfWidth: 10, wallHeight: 1.2, surface: 'florals' });
  for (let k = 7; k <= 8; k++) up(k);
  b.section('Locks on the Door', { halfWidth: 10, wallHeight: 1.2, surface: 'florals' });
  up(9);
  b.section('Surveillance', { halfWidth: 9.5, wallHeight: WALL, surface: 'florals' });
  for (let k = 10; k <= 11; k++) up(k);
  b.section('The Hall', { halfWidth: 9.5, wallHeight: WALL, surface: 'florals' });
  for (let k = 12; k <= 14; k++) up(k);
  b.section('Her Cups on My Wall', { halfWidth: 10, wallHeight: 1.2, surface: 'florals' });
  for (let k = 15; k <= 17; k++) up(k);
  b.section('Hard to Be Ignored', { halfWidth: 10, wallHeight: 1.2, surface: 'florals', bridge: true });
  for (let k = 18; k <= 23; k++) up(k);

  // Make ends meet: a leap across a gap in the floorboards, and the far end of the tear, the thread turned back round it.
  b.section('Make Ends Meet', { halfWidth: 10, wallHeight: 1.2, surface: 'florals' });
  b.mark('ends');
  up(24);
  b.straight(15).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20);
  b.elevate(0).straight(15);
  b.mark('leapEnd');
  b.arc(REACH_END, 180);
  b.hermiteTo(pass(-1, 0)).mark('r0');
  b.section('Before They Bleed', { halfWidth: 10, wallHeight: 1.2, surface: 'florals' });
  for (let k = 1; k <= 8; k++) down(k);
  b.section('Come Across Too Weak', { halfWidth: 8.5, wallHeight: 1.2, surface: 'florals', bridge: true });
  for (let k = 9; k <= 16; k++) down(k);
  b.section('This Will Be the Last', { halfWidth: 10.5, surface: 'florals' });
  for (let k = 17; k <= 24; k++) down(k);
  b.straight(10);
  b.mark('askFrom');
  b.arc(ASK_R, ASK_TURN).arc(ASK_R, -2 * ASK_TURN).arc(ASK_R, ASK_TURN);
  b.mark('askTo');
  b.straight(10);
  b.arc(REACH_END, -180);
  b.hermiteTo(offsetPose(START, -FINISH * K));
  b.section('Finish Straight', { halfWidth: 11, surface: 'florals' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // Over, under, over: up the seam, the thread rides a deck over the way back at the first crossing, is sunk
  // in the Hall under it at the second, and rides a deck over it again at the third; back down the seam, the
  // other way round.
  ease(b, m('kick2', 12), 0, m('o3'), TIER);
  b.profile(m('o3'), m('o6'), () => TIER, 10);
  plunge(b, m('o6'), TIER, m('o8'), 0);
  ease(b, m('o9', -20), 0, m('o10', 10), -DEPTH);
  b.profile(m('o10', 10), m('o14'), () => -DEPTH, 10);
  ease(b, m('o14'), -DEPTH, m('o18'), TIER);
  b.profile(m('o18'), m('o22'), () => TIER, 10);
  plunge(b, m('o22'), TIER, m('o24'), 0);
  ease(b, m('r6'), 0, m('r10'), TIER);
  b.profile(m('r10'), m('r14'), () => TIER, 10);
  plunge(b, m('r14'), TIER, m('r17'), 0);

  const main = b.finish(true);
  const ask = buildLastTime(b.marks.askFrom, b.marks.askTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'mend-the-past',
    name: 'Let Me Mend the Past',
    main,
    branches: [ask.branch],
    pits: [...b.pits, ...ask.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('o14', 10), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('r8', 10), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['o2', 'o6', 'o9', 'o12', 'o16', 'o22', 'ends', 'r4', 'r10', 'r16', 'askFrom'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 390,
    landmarks: [
      { kind: 'lockedDoor', ribbon: -1, s: 6 },
      { kind: 'lockedDoor', ribbon: -1, s: at('o9', -3) },
      { kind: 'teacups', ribbon: -1, s: at('o15', 10), lateral: -120 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('o7', 10), count: 4 },
      { s: at('o16', 10), count: 3 },
      { s: at('r2', 10), count: 4 },
      { s: at('r18', 10), count: 3 },
      { s: ask.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [{ kind: 'cameras', at: [at('o10', 20), at('o12', -20), at('o12', 25)], period: 4.8 }],
    theme: 'nan',
    music: { lap: 'mend-the-past', finalLap: 'mend-the-past-final-lap' },
  };
}

/** Eases the road's height from y0 at arc length s0 to y1 at s1. */
function ease(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * u * u * (3 - 2 * u));
}

/** Drops the road from y0 at s0 to y1 at s1, falling away at once over the top (a crest to fly off) and easing out at the bottom. */
function plunge(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * Math.sin((Math.PI * u) / 2));
}

/**
 * The Last Time I Ask: a thread pulled straight across the water spilt
 * from nan's vase, which This Will Be the Last swings round, no rails.
 * It's there only on the final lap.
 */
function buildLastTime(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'The Last Time I Ask', { halfWidth: 6, surface: 'florals' });
  b.straight(30);
  b.section('Spilt Vase', { halfWidth: 4.5, surface: 'florals' });
  b.elevate(0).straight(12).elevate(1);
  const water = chord - 2 * b.s;
  const boxes = b.s + water / 2;
  b.bridge(water, 7, 'water');
  b.elevate(1).straight(12).elevate(0);
  b.section('The Last Time I Ask', { halfWidth: 6, surface: 'florals' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'The Last Time I Ask', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: ['final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
