import { TrackBuilder, dubins, offsetPose, type Pose, type SectionProps } from './builder';
import type { BranchDef, TrackDef } from './track';

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * The echo chamber, seen from above: a double spiral, the way in and the
 * way out wound the same way round the centre, so the way out is the way in
 * run back to front. The way in (a spiral from `OUTER` down to `INNER`, one
 * full turn) winds the mind in on itself, the road narrowing with every
 * turn; at the centre an S of two half-circles `HUB` in radius, sunk in a
 * cut round two islands, turns it round, and the way out unwinds the same
 * spiral the other way, interleaved with the way in, widening again to the
 * rim. From there one long road runs straight back across the whole thing,
 * on a deck high over every turn of both spirals and over the centre, to
 * the start.
 */
export const OUTER = 186;
export const INNER = 58;
export const HUB = 32;
const K = Math.log(OUTER / INNER) / rad(360);
/** The way in's radius `d` degrees along its turn, and the way out's `d` degrees from the centre: the same spiral, the one run back. */
const inRadius = (d: number) => OUTER * Math.exp(-K * rad(d));
const outRadius = (d: number) => INNER * Math.exp(K * rad(d));
const SLICE = 10;
/** The opening straight from the bedroom to the rim, and the straight home before the line. */
const OPENING = 150;
const TAIL = 60;
/** The centre's cut: the road sinks this far; its walls (Track.cutInto) rise to the rim. */
export const DEPTH = 7;
const CUT_WALL = 2.6;
/** The spiral's walls, high enough that a kart can't hop from one turn onto the next or into the cut. */
const SPIRAL_WALL = 3;
/** Lower where Couldn't Hack It leaves the way in and crosses and joins the way out, level with them: a wall there would stand up through the lane. */
const LANE_WALL = 1.1;
/** Where the way in starts down into the cut: past the lane, once it's clear overhead. */
const DIVE_FROM = 26;
const DIVE_LEN = 60;
/** The long road back over the spiral: its deck this high over the ground it crosses. */
export const DECK = 11;
const CHORD_R = 70;
const RAMP = 80;
/** The mob: a row of them crosses the road every this many seconds, at three stations this far apart. */
export const MOB_PERIOD = 4.8;
const MOB_APART = 46;
/** Couldn't Hack It, the lane over the top of the centre: where it leaves the way in and rejoins the way out (degrees along each turn). Its saving, about 2.3 s, is set by these and by the boost pads in the centre's cut, which only the long way drives over. */
const LANE_FROM = 321;
const LANE_TO = 110;
/** The giant eye stands in the big open pocket east of the centre, where the tear can fall in peace. */
const EYE_AT = { x: 146, z: 44 };
/** Open ground round the lap's rim where a giant can stand (found by plotting the lap): the bro takes the one nearest his stretch. */
const POCKETS = [
  { x: 106, z: 214 },
  { x: 58, z: 232 },
  { x: -104, z: -146 },
  { x: 52, z: -188 },
  { x: 148, z: 184 },
];

/** Where a point on the map is in a landmark's terms: the arc length of the road's nearest point and how far to its right. */
/** Which side of the road at arc length s has more room for a landmark `away` metres off it: that lateral, signed. */
function clearSide(points: readonly (readonly [number, number])[], s: number, away: number): number {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  let k = 0;
  while (k < points.length - 2 && cum[k + 1] < s) k++;
  const a = points[k];
  const b = points[k + 1];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const tx = (b[0] - a[0]) / len;
  const tz = (b[1] - a[1]) / len;
  const room = (side: number) => {
    const x = a[0] - tz * side * away;
    const z = a[1] + tx * side * away;
    let m = Infinity;
    for (let i = 0; i < points.length; i++) if (Math.abs(cum[i] - s) > 60) m = Math.min(m, Math.hypot(points[i][0] - x, points[i][1] - z));
    return m;
  };
  return (room(1) > room(-1) ? 1 : -1) * away;
}

function stand(points: readonly (readonly [number, number])[], x: number, z: number) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  let best = 0;
  for (let i = 1; i < points.length; i++) if (Math.hypot(points[i][0] - x, points[i][1] - z) < Math.hypot(points[best][0] - x, points[best][1] - z)) best = i;
  const a = points[best];
  const b = points[Math.min(points.length - 1, best + 1)];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const tx = (b[0] - a[0]) / len;
  const tz = (b[1] - a[1]) / len;
  return { s: cum[best], lateral: (x - a[0]) * -tz + (z - a[1]) * tx };
}

const props = (hw: number, wall: number, extra: Partial<SectionProps> = {}): SectionProps => ({ halfWidth: hw, wallHeight: wall, surface: 'feed', ...extra });

/** Where the deck's parts begin along the road back, in builder metres from its start. */
interface Deck {
  from: number;
  centre: number;
  to: number;
}

const START: Pose = { x: -OUTER, z: -OPENING, h: 0 };

/** Lays the whole lap onto `b`, sections and marks too. */
function lay(b: TrackBuilder, deck: Deck) {
  const inArm = (a: number, z: number) => {
    for (let d = a; d < z - 1e-9; d += SLICE) {
      const e = Math.min(z, d + SLICE);
      b.spiral(inRadius(d), inRadius(e), e - d);
    }
  };
  const outArm = (a: number, z: number) => {
    for (let d = a; d < z - 1e-9; d += SLICE) {
      const e = Math.min(z, d + SLICE);
      b.spiral(outRadius(d), outRadius(e), -(e - d));
    }
  };

  // Riddle me this: out of the bedroom, two kickers.
  b.straight(12).mark('kick1').kicker().straight(14).mark('kick2').kicker();
  b.straight(60 - b.s);
  b.section('Did You Ever Grow?', props(11, 1.4));
  b.mark('grow');
  b.straight(40);
  // Break the spider's legs: a leap over the road broken off.
  b.section("Break the Spider's Legs", props(11, 1.4));
  b.mark('legs');
  b.straight(4).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20);
  b.mark('landing');
  b.elevate(0);
  b.section('Just to Feed the Crow', props(11, 1.4));
  b.mark('crow');
  b.straight(OPENING - b.s);
  b.mark('rim');

  // The way in, tightening: the road narrows with every turn.
  b.section('Sympathetic Crowds', props(10.5, SPIRAL_WALL));
  b.mark('crowds');
  inArm(0, 60);
  b.section('Dance Like Flies', props(9.5, SPIRAL_WALL - 0.1));
  b.mark('flies');
  inArm(60, 130);
  b.section('To All of the People Who Had It Coming', props(8.5, SPIRAL_WALL - 0.2));
  b.mark('coming');
  inArm(130, 200);
  b.section('A Few Biccys Too Many', props(7.5, SPIRAL_WALL - 0.3));
  b.mark('biccys');
  inArm(200, 260);
  b.section("I'm So Lonely", props(6.5, SPIRAL_WALL - 0.4));
  b.mark('lonely');
  inArm(260, 320);
  b.section('Open Their Eyes', props(5, LANE_WALL));
  b.mark('eyes');
  inArm(320, LANE_FROM);
  b.mark('laneFrom');
  inArm(LANE_FROM, 360);

  // The centre, sunk: an S of two half-circles round two islands.
  b.section('Minimum Brain Size', props(4, LANE_WALL));
  b.mark('minimum');
  b.arc(HUB, 90);
  b.arc(HUB, 90);
  b.section('Re-Enter the Uterus', props(4, CUT_WALL));
  b.mark('uterus');
  b.mark('hubMid');
  b.arc(HUB, -90);
  b.section('Refund All Your Cells', props(4, CUT_WALL));
  b.mark('refund');
  b.arc(HUB, -90);
  b.section('Back-to-Front', props(4, CUT_WALL));
  b.mark('back');
  b.straight(6);

  // The way out, the way in run back to front, widening as the road is refunded.
  b.section('You Will Not Be Missed', props(4.5, CUT_WALL));
  b.mark('missed');
  outArm(0, 30);
  const outTo = (a: number, z: number) => {
    // The lane's end, wherever it falls.
    if (LANE_TO >= a && LANE_TO < z) {
      outArm(a, LANE_TO);
      b.mark('laneTo');
      outArm(LANE_TO, z);
    } else outArm(a, z);
  };
  b.section('Said the Tear to the Eye', props(6, LANE_WALL));
  b.mark('tear');
  outTo(30, 80);
  b.section('Pathetic, You’re Weaker Than You Know', props(7, LANE_WALL));
  b.mark('pathetic');
  outTo(80, 120);
  b.section('Parasitic Mob', props(8, LANE_WALL));
  b.mark('mob');
  outArm(120, 175);
  b.section('Faceless Undertow', props(8.5, SPIRAL_WALL - 0.2));
  b.mark('undertow');
  outArm(175, 225);
  b.section('Himpathetic Bro', props(9.5, SPIRAL_WALL - 0.1));
  b.mark('bro');
  outArm(225, 270);
  b.section("You Don't Have a Say Anymore", props(10, SPIRAL_WALL));
  b.mark('say');
  outArm(270, 325);
  b.section('Radicalise', props(10.5, SPIRAL_WALL));
  b.mark('radicalise');
  outArm(325, 360);
  b.mark('exit');

  // The road back across the whole thing, on a deck over every turn.
  b.section('Radicalise to Minimum Brain Size', props(10.5, 1.4));
  b.mark('chord');
  const names = ['Radicalise to Minimum Brain Size', 'At the Center of It All', "You Ain't Got the Gall", 'Pissing on a Flame', 'Standing on a Ball'];
  const cuts = [deck.from, deck.centre, deck.to, deck.to + 75];
  let at = 0;
  let stage = 0;
  const piece = (len: number, make: (l: number) => void) => {
    let left = len;
    while (left > 1e-6) {
      const next = stage < cuts.length ? cuts[stage] : Infinity;
      const l = Math.min(left, next - at);
      if (l > 1e-6) {
        make(l);
        at += l;
        left -= l;
      }
      if (stage < cuts.length && at >= next - 1e-6) {
        stage++;
        b.section(names[stage], props(10.5, stage < 4 ? SPIRAL_WALL : 1.4, { bridge: stage < 4 }));
        b.mark(['', 'deck', 'over', 'crest', 'ball'][stage]);
      }
    }
  };
  for (const [kind, len] of dubins(b.pose, offsetPose(START, -TAIL), CHORD_R)) {
    if (kind === 'S') piece(len, (l) => b.straight(l));
    else piece(len, (l) => b.arc(CHORD_R, ((kind === 'L' ? 1 : -1) * l * 180) / (Math.PI * CHORD_R)));
  }
  b.mark('chordEnd');
  b.straight(TAIL);
}

/** Where the road back crosses the spiral, measured off a first laying: the deck's start, the part over the centre, and its end. */
function measureDeck(): Deck {
  const b = new TrackBuilder(START, 'Riddle Me This', props(11, 1.4));
  lay(b, { from: 1e9, centre: 1e9, to: 1e9 });
  const pts = b.finish(true).points;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const c0 = b.marks.chord.s;
  const c1 = b.marks.chordEnd.s;
  const hub = b.marks.hubMid.pose;
  let first = Infinity;
  let last = -Infinity;
  let centre = 0;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    if (cum[i] < c0 || cum[i] > c1) continue;
    const d = cum[i] - c0;
    const near = pts.some((q, j) => (cum[j] < c0 - 150 || cum[j] > c1 + 150) && cum[j] < c0 && Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]) < 44);
    if (near) {
      first = Math.min(first, d);
      last = Math.max(last, d);
    }
    const h = Math.hypot(pts[i][0] - hub.x, pts[i][1] - hub.z);
    if (h < best) {
      best = h;
      centre = d;
    }
  }
  return { from: first - 8, centre, to: last + 8 };
}

/** The lane: a sweeping curve from the way in's `LANE_FROM`th degree, over the top of the centre, to the way out's `LANE_TO`th. */
function buildLane(b: TrackBuilder) {
  const a = b.marks.laneFrom;
  const z = b.marks.laneTo;
  const lane = new TrackBuilder(a.pose, "Couldn't Hack It", { halfWidth: 8, wallHeight: 0, surface: 'feed' });
  lane.hermiteTo(z.pose, 4.6);
  const mid = lane.s / 2;
  const branch: BranchDef = { name: "Couldn't Hack It", mainFrom: a.s, mainTo: z.s, ...lane.finish(false), openOn: [2, 'final'], shut: { kind: 'vanish' } };
  return { branch, pits: lane.pits, mid };
}

/**
 * Minimum Brain Size (K.G., 2020): a scornful riddle at the echo chambers
 * that shrink a lonely mind. The lap is the chamber, a double spiral wound
 * in to the centre and back out the same way round, back to front, then
 * one long deck over the lot.
 */
export function buildMinimumBrainSize(): TrackDef {
  const deck = measureDeck();
  const b = new TrackBuilder(START, 'Riddle Me This', props(11, 1.4));
  lay(b, deck);
  const m = (name: string, d = 0) => b.marks[name].s + d;
  const ease = (s0: number, y0: number, s1: number, y1: number) => b.profile(s0, s1, (u) => y0 + (y1 - y0) * u * u * (3 - 2 * u));
  // The centre's cut: down once the lane is clear of the way in, held through the S, and up out of it.
  ease(m('minimum', DIVE_FROM), 0, m('minimum', DIVE_FROM + DIVE_LEN), -DEPTH);
  b.profile(m('minimum', DIVE_FROM + DIVE_LEN), m('tear', -30), () => -DEPTH, 10);
  ease(m('tear', -30), -DEPTH, m('tear', 5), 0);
  // The deck over the spiral, and off its crest.
  ease(m('chord', deck.from - RAMP), 0, m('chord', deck.from + 10), DECK);
  b.profile(m('chord', deck.from + 10), m('crest'), () => DECK, 10);
  b.profile(m('crest'), m('crest', 75), (u) => DECK * (1 - Math.sin((Math.PI * u) / 2)), 4);

  const main = b.finish(true);
  const lane = buildLane(b);
  const at = (mark: string, d = 0) => b.marks[mark].s + d;
  const stations = [0, 1, 2].map((k) => at('mob', 25 + k * MOB_APART));
  const broAt = at('bro', 60);
  const bro = (() => {
    let d = 0;
    let at = main.points[0];
    for (let i = 1; i < main.points.length && d < broAt; i++) {
      d += Math.hypot(main.points[i][0] - main.points[i - 1][0], main.points[i][1] - main.points[i - 1][1]);
      at = main.points[i];
    }
    return POCKETS.reduce((best, q) => (Math.hypot(q.x - at[0], q.z - at[1]) < Math.hypot(best.x - at[0], best.z - at[1]) ? q : best));
  })();
  return {
    id: 'minimum-brain-size',
    name: 'Minimum Brain Size',
    main,
    branches: [lane.branch],
    pits: [...b.pits, ...lane.pits],
    boostPads: [
      { s: at('crowds', 60), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('uterus', 12), length: 8, lateral: 0, halfWidth: 3 },
      { s: at('refund', 12), length: 8, lateral: 0, halfWidth: 3 },
      { s: at('back', 12), length: 8, lateral: 0, halfWidth: 3 },
      { s: at('tear', 20), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('deck', 40), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['crowds', 'flies', 'coming', 'biccys', 'lonely', 'minimum', 'refund', 'tear', 'pathetic', 'mob', 'bro', 'say', 'radicalise', 'deck', 'over', 'crest'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 340,
    landmarks: [
      { kind: 'echoGate', ribbon: -1, s: 6 },
      { kind: 'bedroom', ribbon: -1, s: at('grow', 8), lateral: -38 },
      { kind: 'spiderCrow', ribbon: -1, s: at('legs', 20), lateral: 30 },
      { kind: 'commentWall', ribbon: -1, s: at('crowds', 20), to: at('flies', 0) },
      { kind: 'flyCloud', ribbon: -1, s: at('flies', 40), lateral: 0 },
      { kind: 'biccyHeap', ribbon: -1, s: at('biccys', 40), lateral: clearSide(main.points, at('biccys', 40), 24) },
      // The tiny brain on its ball on the island the road circles, and the giant eye and its tear on the other island.
      { kind: 'brainBall', ribbon: -1, s: at('minimum', 0), lateral: -HUB },
      { kind: 'tearEye', ribbon: -1, ...stand(main.points, EYE_AT.x, EYE_AT.z) },
      { kind: 'broAvatar', ribbon: -1, ...stand(main.points, bro.x, bro.z) },
      { kind: 'deckFeed', ribbon: -1, s: at('deck', 0), to: at('crest', 0) },
      // The lap dressed stretch by stretch (render/minimumBrainSize.ts, `FIELDS`), each from the section it starts in, and the skyline round the lot.
      { kind: 'feedField', ribbon: -1, s: 24, to: at('grow', 40) },
      { kind: 'feedField', ribbon: -1, s: at('legs', 2), to: at('rim', 0) },
      { kind: 'feedField', ribbon: -1, s: at('crowds', 2), to: at('coming', 0) },
      { kind: 'feedField', ribbon: -1, s: at('coming', 2), to: at('eyes', 0) },
      { kind: 'feedField', ribbon: -1, s: at('eyes', 2), to: at('minimum', 0) },
      { kind: 'feedField', ribbon: -1, s: at('minimum', 2), to: at('missed', 0) },
      { kind: 'feedField', ribbon: -1, s: at('missed', 2), to: at('pathetic', 0) },
      { kind: 'feedField', ribbon: -1, s: at('pathetic', 2), to: at('bro', 0) },
      { kind: 'feedField', ribbon: -1, s: at('bro', 2), to: at('say', 0) },
      { kind: 'feedField', ribbon: -1, s: at('say', 2), to: at('exit', 0) },
      { kind: 'feedField', ribbon: -1, s: at('chord', 2), to: at('ball', 0) },
      { kind: 'feedField', ribbon: -1, s: at('ball', 2), to: main.length - 10 },
      { kind: 'echoSkyline', ribbon: -1, s: 22 },
    ],
    itemBoxes: [
      { s: at('grow', 10), count: 8 },
      { s: at('crowds', 90), count: 3 },
      { s: at('coming', 60), count: 8 },
      { s: at('lonely', 40), count: 3 },
      { s: at('tear', 40), count: 3 },
      { s: at('pathetic', 20), count: 8 },
      { s: at('bro', 30), count: 3 },
      { s: at('deck', 80), count: 8 },
      { s: at('ball', 20), count: 3 },
      { s: lane.mid, count: 1, ribbon: 0, double: true },
    ],
    hazards: [{ kind: 'mobs', at: stations, period: MOB_PERIOD }],
    theme: 'echochamber',
    music: { lap: 'minimum-brain-size', finalLap: 'minimum-brain-size-final-lap' },
  };
}
