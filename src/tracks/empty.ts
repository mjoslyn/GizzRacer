import { TrackBuilder, offsetPose, type Pose, type RibbonDef, type SectionProps } from './builder';
import type { BranchDef, TrackDef } from './track';

const deg = (d: number) => (d * Math.PI) / 180;
/** A pose given in map coordinates as seen from above (X east, Y north), heading in degrees counterclockwise from north. */
const at = (X: number, Y: number, hd: number): Pose => ({ x: -X, z: Y, h: deg(hd) });
/** Where the figure of eight crosses itself, the road over and the cut under, at right angles. */
const CROSS_X = 60;
const CROSS_Y = 10;
/** The start: along the top of the north lobe, heading west. */
const START = at(10, 200, 90);
const FINISH = 40;
/** The waltz's two turns, one in each lobe: loops of this radius, each climbing onto a deck this high back over its own way in. */
export const LOOP_R = 44;
export const RISE = 8.5;
/** There Is Nothing Deep Inside of Me: sunk this deep, under the crossing. */
export const DEPTH = 7;
const WALL = 6;
/** Each deck (and the cut) held level this far either side of where the roads cross. */
const HOLD = 26;
/** The cut is held at the bottom further, the level road crossing it at a slant. */
const CUT_HOLD = 40;
const SAG = 1.2;
/** Never Set It in Stone: the road swings out round the works on bends of this radius and turn; Set in Stone runs straight through them. */
const WORKS_R = 50;
const WORKS_TURN = 64;
/** The wanderers: one lazy crossing every this many seconds, three to a row, rows this far apart. */
export const WANDER_PERIOD = 12;
const WANDER_ROW = 46;

const ROAD: SectionProps = { halfWidth: 9.5, wallHeight: 1.2, surface: 'pale' };
const OPEN: SectionProps = { halfWidth: 9.5, surface: 'pale' };

/** Where two lines (a pose each) cross: how far along each. */
function cross(a: Pose, b: Pose): [number, number] {
  const [ux, uz, vx, vz] = [Math.sin(a.h), Math.cos(a.h), Math.sin(b.h), Math.cos(b.h)];
  const den = ux * vz - uz * vx;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return [(dx * vz - dz * vx) / den, (dx * uz - dz * ux) / den];
}

/**
 * Empty (the All Stars Cup #2's third, from I'm in Your Mind Fuzz): the
 * quiet, lo-fi waltz in three-four that cleans the slate after the Mind
 * Fuzz suite, its working title "3/4", mechanical clicks all the way
 * through it. Life is nothing like it used to be, people used to be so
 * nice to me, feeling so empty; there is nothing deep inside of me, love
 * is nothing like it used to be; life is death, because I shot it through
 * its head; I'm wandering around so lazily; and now I know it's because I
 * never set it in stone. But I don't feel empty when I'm with you, I feel
 * like you level me too. Who? Empty; what I got myself into.
 *
 * The world is an empty town on a pale plain at dawn, nobody about. The
 * lap is a waltz across it, a figure of eight with a turn in each lobe:
 * a natural turn (a loop to the right, round an empty stage) in the north
 * lobe and a reverse turn (a loop to the left, round the one you're with)
 * in the south, each loop rising onto a deck back over its own way in and
 * falling away again, the waltz's rise and fall; the lobes cross in the
 * middle, There Is Nothing Deep Inside of Me sunk in a cut under the
 * level road home. Life is death at the clock tower, the road shot
 * through and a leap over the hole; the wanderers drifting lazily across
 * the road in three-four; the road works where it was never set in stone,
 * and Set in Stone, the new road poured straight through them, set hard
 * from lap 2.
 */
export function buildEmpty(): TrackDef {
  const pass1 = at(CROSS_X, CROSS_Y, -135);
  const pass2 = at(CROSS_X, CROSS_Y, -45);
  const b = new TrackBuilder(START, 'Empty', ROAD);
  // Empty: west along the top of the north lobe from under the metronome, two kickers.
  b.straight(18).mark('kick1').kicker().straight(14).mark('kick2').kicker();
  b.straight(90 - b.s);
  // Life is nothing like it used to be: a sway through the empty town.
  b.section('Life Is Nothing Like It Used to Be', ROAD);
  b.mark('life');
  b.arc(90, 16).arc(90, -32).arc(90, 16);
  b.section('People Used to Be So Nice to Me', ROAD);
  b.mark('people');
  const stemA = { ...b.pose };
  b.straight(60);
  // Feeling so empty: the natural turn, a loop to the right round the empty stage, rising back over its own way in.
  b.section('Feeling So Empty', ROAD);
  b.mark('empty');
  b.arc(LOOP_R, -270);
  b.mark('emptyOut');
  const exitA = { ...b.pose };
  b.straight(95);
  b.arc(70, 90);
  // There is nothing deep inside of me: down into a cut, across the middle under the level road.
  b.section('There Is Nothing Deep Inside of Me', { ...ROAD, wallHeight: WALL });
  b.mark('deep');
  b.hermiteTo(offsetPose(pass1, -60));
  b.mark('deep1');
  b.straight(60 + 85);
  // Love is nothing like it used to be: out of the cut and round toward the clock.
  b.section('Love Is Nothing Like It Used to Be', ROAD);
  b.mark('love');
  b.arc(90, 45);
  b.section('Life Is Death', ROAD);
  b.mark('death');
  b.straight(20);
  // Because I shot it through its head: the road shot through, a leap over the hole.
  b.section('Shot It Through Its Head', ROAD);
  b.mark('shot');
  b.straight(18).mark('ramp').elevate(0).rise(18, 3);
  b.gap(14, 18);
  b.elevate(0).straight(12);
  b.mark('shotEnd');
  // I'm wandering around so lazily: round the corner of the south lobe and along its foot, the wanderers drifting across.
  b.section('Wandering Around So Lazily', ROAD);
  b.mark('wander');
  b.arc(60, -90).straight(30).arc(60, -90);
  b.arc(100, 12).arc(100, -24).arc(100, 12);
  b.section('And Now I Know', ROAD);
  b.mark('know');
  b.straight(30);
  // Never set it in stone: round the road works, where Set in Stone runs straight through; then on toward the loop.
  b.section('Never Set It in Stone', OPEN);
  b.mark('stone');
  b.straight(2);
  b.mark('worksFrom');
  b.arc(WORKS_R, -WORKS_TURN);
  b.section('Never Set It in Stone', ROAD);
  b.arc(WORKS_R, 2 * WORKS_TURN);
  b.section('Never Set It in Stone', OPEN);
  b.arc(WORKS_R, -WORKS_TURN);
  b.mark('worksTo');
  b.straight(2);
  b.section('Never Set It in Stone', ROAD);
  b.mark('stem');
  const stemB = { ...b.pose };
  b.straight(88);
  // But I don't feel empty when I'm with you: the reverse turn, a loop to the left round you, rising back over the way in.
  b.section("I Don't Feel Empty When I'm With You", ROAD);
  b.mark('you');
  b.arc(LOOP_R, 270);
  b.mark('youOut');
  const exitB = { ...b.pose };
  b.straight(60);
  // I feel like you level me too: down off the deck, and level all the way home across the middle, over the cut.
  b.section('You Level Me Too', ROAD);
  b.mark('level');
  b.hermiteTo(offsetPose(pass2, -60));
  b.mark('level2');
  b.straight(60 + 30);
  b.section('Who? Empty', ROAD);
  b.mark('who');
  b.straight(45);
  // What I got myself into: round the top of the north lobe and home.
  b.section('What I Got Myself Into', ROAD);
  b.mark('got');
  b.turnTo(offsetPose(START, -FINISH), 80);
  b.section('What I Got Myself Into', OPEN);
  b.mark('home');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d;
  // Where the roads cross: each loop's way out over its way in, and the level road over the cut.
  const [overA, underA] = cross(exitA, stemA);
  const loopA = m('emptyOut') + overA;
  const [overB] = cross(exitB, stemB);
  const loopB = m('youOut') + overB;
  const deepS = m('deep1') + 60;
  const levelS = m('level2') + 60;
  void underA;

  // The rise and fall of the waltz: up round each loop onto its deck, and off its crest down again.
  ease(b, m('empty', 20), 0, loopA - HOLD, RISE);
  b.profile(loopA - HOLD, loopA + HOLD, () => RISE, 10);
  plunge(b, loopA + HOLD, RISE, loopA + HOLD + 70, 0);
  ease(b, m('you', 20), 0, loopB - HOLD, RISE);
  b.profile(loopB - HOLD, loopB + HOLD, () => RISE, 10);
  plunge(b, loopB + HOLD, RISE, loopB + HOLD + 70, 0);
  // Nothing deep inside: down into the cut, under the level road, and up out of it.
  ease(b, m('deep', 30), 0, deepS - CUT_HOLD, -DEPTH);
  // Sagging a little deeper still in the middle, under the level road: nothing deep inside, and deeper.
  b.profile(deepS - CUT_HOLD, deepS + CUT_HOLD, (u) => -DEPTH - SAG * Math.sin(Math.PI * u), 8);
  ease(b, deepS + CUT_HOLD, -DEPTH, m('love', -4), 0);

  const main = b.finish(true);
  deck(main, loopA - HOLD - 6, loopA + HOLD + 6);
  deck(main, loopB - HOLD - 6, loopB + HOLD + 6);
  deck(main, levelS - HOLD - 4, levelS + HOLD + 4);

  const works = buildSetInStone(b.marks.worksFrom, b.marks.worksTo);
  const rows = (s0: number, n: number) => Array.from({ length: n }, (_, k) => s0 + k * WANDER_ROW);
  const wander = [...rows(m('wander', 96), 2), ...rows(m('wander', 222), 2)];
  return {
    id: 'empty',
    name: 'Empty',
    main,
    branches: [works.branch],
    pits: [...b.pits, ...works.pits],
    boostPads: [
      { s: m('life', 40), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: m('love', 30), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: m('level', 40), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['life', 'people', 'empty', 'deep', 'love', 'death', 'wander', 'know', 'stone', 'you', 'level', 'who'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 400,
    landmarks: [
      { kind: 'metronome', ribbon: -1, s: 6 },
      // The empty stage in the middle of the north loop (a right turn: its middle is to the right), the one you're with in the middle of the south (a left turn).
      { kind: 'emptyStage', ribbon: -1, s: m('empty', (LOOP_R * Math.PI) / 2), lateral: LOOP_R },
      { kind: 'shotClock', ribbon: -1, s: m('ramp', 18) },
      { kind: 'companion', ribbon: -1, s: m('you', (LOOP_R * Math.PI) / 2), lateral: -LOOP_R },
      { kind: 'setInStone', ribbon: 0, s: works.boxes },
    ],
    itemBoxes: [
      { s: m('life', 20), count: 8 },
      { s: m('emptyOut', 120), count: 3 },
      { s: m('deep', 40), count: 8 },
      { s: m('death', 5), count: 3 },
      { s: m('know', 10), count: 8 },
      { s: m('you', 10), count: 3 },
      { s: m('level', 120), count: 8 },
      { s: m('got', 20), count: 3 },
      { s: works.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [{ kind: 'wanderers', at: wander.flatMap((s) => [s, s, s]), period: WANDER_PERIOD }],
    theme: 'emptiness',
    music: { lap: 'empty', finalLap: 'empty-final-lap' },
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

/** Makes [from, to] (builder arc lengths) of a finished ribbon a deck on pillars, at whatever height the road is there. */
function deck(r: RibbonDef, from: number, to: number): void {
  const out = [];
  for (const s of r.sections) {
    if (s.to <= from || s.from >= to) {
      out.push(s);
      continue;
    }
    if (s.from < from) out.push({ ...s, to: from });
    out.push({ ...s, from: Math.max(s.from, from), to: Math.min(s.to, to), bridge: true });
    if (s.to > to) out.push({ ...s, from: to });
  }
  r.sections.splice(0, r.sections.length, ...out);
}

/** Set in Stone: the new road in from the works' edge before it runs out over the wet concrete, and the pour. */
const WORKS_IN = 56;

/**
 * Set in Stone: the new road through the works, poured straight across
 * where the old road swings out round them, over a pit of wet concrete in
 * its formwork. It takes a lap to set: on lap 1 it's still wet, sunk in
 * the pour, and you sink with it; from lap 2 it's set hard.
 */
function buildSetInStone(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Set in Stone', { halfWidth: 5, surface: 'pale' });
  b.straight(WORKS_IN);
  const span = chord - 2 * WORKS_IN;
  const boxes = b.s + span / 2;
  b.bridge(span, 8, 'water', 4);
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Set in Stone', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2, 'final'], shut: { kind: 'flood' } };
  return { branch, pits: b.pits, boxes };
}
