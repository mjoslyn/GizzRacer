import { PISTON_LANES } from '../items/hazards';
import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

/** Layout scale: the lap is drawn below in plain numbers and shrunk to the cup's length. */
const K = 0.85;
/** A point on the map, in layout numbers. */
const wp = (x: number, z: number, h: number): Pose => ({ x: x * K, z: z * K, h });
// Headings as the map is seen from above, x to the right and z down the page.
const DOWN = 0;
const RIGHT = Math.PI / 2;
const LEFT = -Math.PI / 2;
const UP = Math.PI;
const START: Pose = wp(100, -130, LEFT);

/** A Hunk of Grey Matter: the lap loops right round his metallic dome, this far out from its middle, and comes down out of it across its own way in. */
export const DOME_R = 55 * K;
/** Brine Fluid: the neck sunk this deep in a cut, under the start straight and the throat; its walls this high. */
export const DEPTH = 7;
const CUT_WALL = 7.5;
/** Cables in Knots: a loop of this radius round his heart, back over its own way in on a deck this high. */
const KNOT_R = 42;
export const DECK = 8;
/** Run Over the Tests: an S of bends this radius and turn, swerving off the line and back on; De-bug runs straight down the line. */
const TEST_R = 40;
const TEST_A = 80;
/** Lump in His Throat: the diagonal up the throat, crossing the neck and the start straight on a deck this high, off a crest into the Palpitations. */
const THROAT_H = Math.atan2(45, -70);
export const TOP = 9;
/** Binary Brook: the hook's bend, this radius, between the line down (Fishing for Fishies) and the barb back up (Pierced Through His Cheek). */
export const BEND_R = 40 * K;
/** The boogie's bar: one stroke of every piston, the four in a row pumping one after another on its four beats. */
export const PISTON_PERIOD = 2.0;
/** The pistons' rows are this far apart down the road. */
const PISTON_ROW = 21;

/**
 * Cyboogie (the All Stars Cup #1's second, from Fishing for Fishies): a
 * bouncy, dark synth boogie about a cyborg who has lost his humanity. The
 * lap is a ride through him, drawn as his figure seen from above: the
 * start straight runs in under his cheek and loops right round his
 * metallic dome (A Hunk of Grey Matter), threading the grey matter, and
 * drops out of it down his neck sunk in a cut of brine (Brine Fluid),
 * under the start straight and the throat; Augmented Senses swings out of
 * the neck and Bouncy Ball Thoughts bounce on to His Heart Is a Mess,
 * where Cables in Knots loop right round his heart of pistons and pumps
 * and back over their own way in on a deck; Feeling Depressed drops off
 * it, Run Over the Tests swerves through an S, and Pistons and Pumps runs
 * walled along the bottom of his chest, the pistons punching up through
 * the graphene on the boogie's beat; when he Breaks Down the road breaks
 * off, a leap; then the Lump in His Throat, a viaduct straight up the
 * diagonal of his throat over the neck and the start straight, off its
 * crest into the Palpitations; the dance floor he fears (Chorophobia),
 * pistons pumping across it too; the Terminal Error at the top; and
 * Fishing for Fishies down the line to the Binary Brook, round the bend of
 * the hook and up its barb, Pierced Through His Cheek; Han-Tyumi's last
 * words, Dance With the Devil, bring it home. Shortcut: De-bug, straight
 * down the line through the tests over a bug in the lattice, on the final
 * lap only.
 */
export function buildCyboogie(): TrackDef {
  const b = new TrackBuilder(START, 'Cyboogie', { halfWidth: 10, surface: 'graphene' });
  b.scale = K;
  // In under his cheek: two kickers, and over the neck on a deck at ground level.
  b.straight(12).mark('kick1').kicker().straight(12).mark('kick2').kicker();
  b.straight(15);
  b.section('Cyboogie', { halfWidth: 10, surface: 'graphene', bridge: true });
  b.mark('span');
  b.straight(90);
  b.mark('spanEnd');
  // A hunk of grey matter: right round the inside of his dome, among the nodes.
  b.section('A Hunk of Grey Matter', { halfWidth: 10, wallHeight: 1.2, surface: 'graphene' });
  b.mark('dome');
  b.straight(12);
  b.mark('loop');
  b.arc(DOME_R / K, -270);
  b.mark('brine');
  // Brine fluid: down out of the dome into the neck, sunk in a cut under the start straight and the throat.
  b.section('Brine Fluid', { halfWidth: 9.5, wallHeight: CUT_WALL, surface: 'graphene' });
  b.straight(180);
  b.mark('brineEnd');
  b.section('Augmented Senses', { halfWidth: 10, surface: 'graphene' });
  b.mark('senses');
  b.arc(45, 90);
  b.section('Bouncy Ball Thoughts', { halfWidth: 10, surface: 'graphene' });
  b.mark('bouncy');
  b.straight(35);
  b.section('His Heart Is a Mess', { halfWidth: 10, surface: 'graphene' });
  b.mark('mess');
  b.straight(12);
  b.mark('knot');
  // Cables in knots: right round his heart, and back over the way in on a deck.
  b.section('Cables in Knots', { halfWidth: 9.5, wallHeight: 1.2, surface: 'graphene' });
  b.arc(KNOT_R, 200);
  b.mark('knotDeck');
  b.section('Cables in Knots', { halfWidth: 9.5, wallHeight: 1.2, surface: 'graphene', bridge: true });
  b.arc(KNOT_R, 70).straight(KNOT_R + 35);
  b.mark('knotDeckEnd');
  // Feeling depressed: down off the deck.
  b.section('Feeling Depressed', { halfWidth: 10, surface: 'graphene' });
  b.mark('depressed');
  b.straight(12).arc(50, -45);
  // Run over the tests: an S off the line and back; De-bug runs straight down it.
  b.section('Run Over the Tests', { halfWidth: 10, surface: 'graphene' });
  b.mark('tests');
  b.arc(TEST_R, -TEST_A).arc(TEST_R, 2 * TEST_A).arc(TEST_R, -TEST_A);
  b.mark('testsEnd');
  // His ticker ain't flesh: pistons and pumps, walled along the bottom of his chest.
  b.section('Pistons and Pumps', { halfWidth: 10, surface: 'graphene' });
  b.mark('pumps');
  b.arc(50, -45);
  b.section('Pistons and Pumps', { halfWidth: 10, wallHeight: 1.2, surface: 'graphene' });
  b.mark('pistons');
  b.straight(70);
  b.mark('pistonsEnd');
  // He breaks down, and the road breaks off: a leap.
  b.section('Breaks Down', { halfWidth: 10, surface: 'graphene' });
  b.mark('breaks');
  b.straight(5).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20);
  b.elevate(0).straight(8);
  b.mark('breaksEnd');
  // A lump in his throat: round and straight up the diagonal of his throat, over the neck and the start straight.
  b.section('Lump in His Throat', { halfWidth: 10, surface: 'graphene' });
  b.mark('throat');
  b.turnTo(wp(-100, 96, THROAT_H), 40);
  b.mark('throatDeck');
  b.section('Lump in His Throat', { halfWidth: 10, surface: 'graphene', bridge: true });
  b.straight(320);
  b.mark('lump');
  // Palpitations: off the crest, his heart skipping.
  b.section('Palpitations', { halfWidth: 10, surface: 'graphene' });
  b.mark('palpitations');
  b.turnTo(wp(150, -245, RIGHT), 40);
  b.mark('palpitationsEnd');
  // Chorophobia: the dance floor he fears, pistons pumping across it.
  b.section('Chorophobia', { halfWidth: 10, wallHeight: 1.2, surface: 'graphene' });
  b.mark('dance');
  b.straight(60);
  b.mark('danceEnd');
  b.section('Terminal Error', { halfWidth: 10, surface: 'graphene' });
  b.mark('error');
  b.turnTo(wp(268, -140, DOWN), 40);
  // Fishing for fishies: down the line to the binary brook, round the hook's bend and up its barb.
  b.section('Fishing for Fishies', { halfWidth: 10, surface: 'graphene' });
  b.mark('fishing');
  b.turnTo(wp(268, 140, DOWN), 80);
  b.section('Binary Brook', { halfWidth: 10, surface: 'graphene' });
  b.mark('brook');
  b.arc(BEND_R / K, -180);
  b.mark('cheek');
  b.section('Pierced Through His Cheek', { halfWidth: 10, surface: 'graphene' });
  b.turnTo(wp(188, -20, UP), 30);
  b.section('Dance With the Devil', { halfWidth: 10, surface: 'graphene' });
  b.mark('devil');
  b.turnTo(offsetPose(START, -15 * K), 50);
  b.mark('home');
  b.straight(15);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // The cut down the neck.
  ease(b, m('brine', -35), 0, m('brine', 18), -DEPTH);
  b.profile(m('brine', 18), m('brine', 125), () => -DEPTH, 10);
  ease(b, m('brine', 125), -DEPTH, m('senses', 30), 0);
  // Round the heart, up onto the deck and back over the way in, and down off it.
  ease(b, m('knot', 10), 0, m('knotDeck'), DECK);
  b.profile(m('knotDeck'), m('knotDeckEnd'), () => DECK, 10);
  ease(b, m('knotDeckEnd'), DECK, m('depressed', 40), 0);
  // Up the throat onto the viaduct, over both, and off its crest.
  ease(b, m('throat', 30), 0, m('throatDeck', 40), TOP);
  b.profile(m('throatDeck', 40), m('lump'), () => TOP, 10);
  plunge(b, m('lump'), TOP, m('lump', 40), 0);
  // Palpitations: two skips of the heart on the way down to the top of the map.
  for (const d of [62, 84]) b.profile(m('lump', d), m('lump', d + 14), (u) => 1.1 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const debug = buildDebug(b.marks.tests, b.marks.testsEnd);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  /** Rows of PISTON_LANES pistons, `n` rows down the road from `s0`. */
  const rows = (s0: number, n: number) => Array.from({ length: n }, (_, r) => Array.from({ length: PISTON_LANES }, () => s0 + r * PISTON_ROW * K)).flat();
  return {
    id: 'cyboogie',
    name: 'Cyboogie',
    main,
    branches: [debug.branch],
    pits: [...b.pits, ...debug.pits],
    boostPads: [
      { s: at('senses', 20), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('throatDeck', 10), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('fishing', 30), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['loop', 'brine', 'senses', 'knot', 'knotDeckEnd', 'tests', 'pistons', 'breaks', 'throatDeck', 'palpitations', 'error', 'fishing', 'cheek', 'devil'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 280,
    landmarks: [
      { kind: 'cyboogieGate', ribbon: -1, s: 6 },
      // His helmeted head in the middle of the dome's loop, the mic dangling.
      { kind: 'cyborgHead', ribbon: -1, s: at('loop', 0), lateral: DOME_R },
      // His heart of pistons and pumps in the knot, the cables knotted round it.
      { kind: 'cyborgHeart', ribbon: -1, s: at('knot', 0), lateral: -KNOT_R * K },
      // The hook, its bend in the brook's, the line up into the sky.
      { kind: 'fishHook', ribbon: -1, s: at('brook', 0), lateral: BEND_R },
      // The binary brook, flowing through the bend of the hook.
      { kind: 'binaryBrook', ribbon: -1, s: at('fishing', 0), to: at('cheek', 0) },
      // Han-Tyumi, reciting it backwards, between the throat and the line.
      { kind: 'hanTyumi', ribbon: -1, s: at('dance', 30), lateral: 95 },
      { kind: 'debugLane', ribbon: 0, s: debug.boxes },
    ],
    itemBoxes: [
      { s: at('dome', 4), count: 4 },
      { s: at('brine', 70), count: 3 },
      { s: at('bouncy', 10), count: 4 },
      { s: at('tests', 6), count: 3 },
      { s: at('throatDeck', 60), count: 4 },
      { s: at('palpitationsEnd', -10), count: 3 },
      { s: at('fishing', 120), count: 4 },
      { s: at('devil', 20), count: 3 },
      { s: debug.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      // Pistons punching up through the graphene along the bottom of his chest, and across the dance floor.
      { kind: 'pistons', at: rows(at('pistons', 10), 3), period: PISTON_PERIOD },
      { kind: 'pistons', at: rows(at('dance', 12), 2), period: PISTON_PERIOD },
    ],
    theme: 'cyborg',
    music: { lap: 'cyboogie', finalLap: 'cyboogie-final-lap' },
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

/** De-bug: the bug, a hole in the graphene lattice where a cell of it has burnt out, this long. */
export const BUG = 22;

/**
 * De-bug: straight down the line from the top of the tests' S to its foot,
 * where the main road swerves out and back, over the bug (a hole burnt
 * through the lattice) on a patch of fresh graphene. On the final lap only;
 * on the others the patch isn't there, only the hole.
 */
function buildDebug(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'De-bug', { halfWidth: 5, surface: 'graphene' });
  const lead = (chord - BUG) / 2;
  b.straight(lead);
  const boxes = b.s + BUG / 2;
  b.bridge(BUG, 7);
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'De-bug', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: ['final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
