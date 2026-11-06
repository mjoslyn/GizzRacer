import { ROAD_WIDTH_SCALE, TrackBuilder, dubins, offsetPose, type Pose, type SectionProps } from './builder';
import type { BranchDef, TrackDef } from './track';

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * The tour, seen from above: a figure of eight of bitumen with a crossroad
 * in its middle ("bitumen crossroad knife"), the band going round and round
 * it, back to the bus for another round. The way out of the venue runs
 * through the crossroad on the ground; the top loop, tall and narrow, is
 * the show (the rock n roll, the headbanging, the sugarplum fairy's leap,
 * echoed feet on hallowed ground) and climbs to the energy peak, the
 * voyager's crown, on a deck `DECK` metres up, which crosses back over the
 * crossroad and drops off the far side. The bottom loop, the bigger, is the
 * rest of the odd life: the hydra's head, the living room suite, a cut sunk
 * in the boredom, the anthropoids that can't decide which way to go (the
 * road turns back on itself), the wire walked upon the knife, the motel,
 * and another carpark in the middle of nowhere, another promoter, another
 * green room, and back to the start to get in the stride.
 */
/** The crossroad's two roads cross at the origin, each this many degrees off north. */
const CROSS = 30;
/** The way out: straight from this far before the crossroad to this far past it. */
const UP_IN = 35;
const UP_OUT = 60;
/** The way back lands on its line this far before the crossroad, runs straight through it and on this far past it. */
const DOWN_IN = 197;
const DOWN_OUT = 120;
/** The deck over the crossroad: this high over the way out, from this far before it to this far past it (on pillars from `BRIDGE` before to `BRIDGE` past). */
export const DECK = 10;
const DECK_FROM = 55;
const DECK_TO = 45;
const BRIDGE = 72;
/** Off the deck: the road falls to the ground over this far, faster than a kart, for the airtime. */
const DROP = 60;
/** Riding High climbs to a crest this high. */
export const RIDE = 4;
/** The cut in the bottom loop: the road sinks this far into the boredom. */
export const DEPTH = 7;
const CUT_WALL = 2.6;
const DECK_WALL = 3;
/** The backstage doors: a row of them rises across the road every this many seconds, at four stations this far apart. */
export const DOOR_PERIOD = 4.4;
const DOOR_APART = 25;
/** Head of the Hydra swings round a wide U (`HYDRA_R`); No Concept of Geography, the shortcut, cuts across inside it on a tighter turn, leaving the road this far before the U and meeting it this far after. */
const HYDRA_R = 60;
const CUT_FROM = 10;
const CUT_TO = 10;
const CUT_R = 25;
const CUT_OPEN = 1;
/** The cut is one narrow strip of bitumen with no walls: off its edge is the dirt, and the time it saves is gone. */
export const CUT_HW = 3.2;

/** Open ground where the giant landmarks stand (found by plotting the lap): each faces the nearest road. */
const BUS_AT = { x: 170, z: 40 };
const HEADBANGER_AT = { x: 100, z: 100 };
const FAIRY_AT = { x: -68, z: 235 };
const VOYAGER_AT = { x: -155, z: 75 };
const HYDRA_AT = { x: 25, z: -245 };
const APES_AT = { x: -188, z: -300 };
const MOTEL_AT = { x: -303, z: -268 };
const TOUR_AT = { x: -285, z: -118 };

/** Where a point on the map is in a landmark's terms: the arc length of the road's nearest point and how far to its right. */
function standAt(points: readonly (readonly [number, number])[], x: number, z: number) {
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

const UP: Pose = { x: 0, z: 0, h: rad(CROSS) };
const OPENING = 60;

const props = (hw: number, wall: number, extra: Partial<SectionProps> = {}): SectionProps => ({ halfWidth: hw, wallHeight: wall, surface: 'tourRoad', ...extra });

/** Turns and straights (a Dubins path) from where `b` is to `to`, on turns of `r`. */
function toward(b: TrackBuilder, to: Pose, r: number) {
  for (const [kind, len] of dubins(b.pose, to, r)) {
    if (kind === 'S') b.straight(len);
    else if (len > 1e-6) b.arc(r, ((kind === 'L' ? 1 : -1) * len * 180) / (Math.PI * r));
  }
}

/** A turn of `deg` that a curve of radius `wide` would take, tightened to `tight` with straights either side: the road in and out where it was, the corner itself sharper. */
function corner(b: TrackBuilder, wide: number, tight: number, deg: number) {
  const x = (wide - tight) * Math.tan((Math.abs(deg) * Math.PI) / 360);
  b.straight(x).arc(tight, deg).straight(x);
}

/** Lays the whole lap onto `b`, sections and marks too. */
function lay(b: TrackBuilder) {
  // All this rock n roll: off the stage, two kickers.
  b.straight(14).mark('kick1').kicker().straight(16).mark('kick2').kicker();
  b.straight(OPENING - b.s);
  b.section('Bad for My Ears', props(10.5, 1.4));
  b.mark('ears');
  toward(b, offsetPose(UP, -UP_IN), 55);
  // It's weird: through the crossroad on the ground, under the way back.
  b.section("It's Weird", props(10.5, 1.4));
  b.mark('weird');
  b.straight(UP_IN).mark('crossUp').straight(UP_OUT);

  // The top loop, the show.
  b.section('All This Headbanging', props(10.5, 1.4));
  b.mark('headbanging');
  b.straight(10).arc(80, -30).straight(20);
  // Bad for my brain: a sharp corner to brake for.
  b.section('Bad for My Brain', props(10, 1.4));
  b.mark('brain');
  corner(b, 65, 34, -50);
  b.straight(10);
  b.section('Sugarplum Fairy', props(10, 1.4));
  b.mark('fairy');
  b.arc(110, 40).straight(15);
  // The sugarplum fairy dances: a leap.
  b.mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20);
  b.section('Echoed Feet', props(8.5, 1.4));
  b.mark('feet');
  b.elevate(0);
  b.straight(25).arc(45, -80);
  b.section('Hallowed Ground', props(10.5, 1.4));
  b.mark('hallowed');
  b.arc(45, -90);
  // Energy peaks on the voyager's crown: the climb onto the deck.
  b.section('Energy Peaks', props(10.5, 1.4));
  b.mark('peaks');
  b.straight(40).arc(190, -30);
  b.mark('line');
  b.straight(DOWN_IN - BRIDGE - 30);
  b.section("The Voyager's Crown", props(10.5, DECK_WALL, { bridge: true }));
  b.mark('crown');
  b.straight(30 + BRIDGE - DECK_FROM);
  // Back to the bus for another round: over the crossroad.
  b.section('Back to the Bus', props(10.5, DECK_WALL, { bridge: true }));
  b.mark('bus');
  b.straight(DECK_FROM - 20);
  b.section('Another Round', props(10.5, DECK_WALL, { bridge: true }));
  b.mark('round');
  b.straight(20).mark('crossDown').straight(DECK_TO - 20);
  // Managing feats by managing feet: off the deck.
  b.section('Managing Feats', props(10.5, DECK_WALL, { bridge: true }));
  b.mark('feats');
  b.straight(BRIDGE - DECK_TO);
  b.section('Managing Feats', props(10.5, 1.4));
  b.straight(DOWN_OUT - BRIDGE);

  // The bottom loop, the bigger: the rest of the odd life.
  // Head of the hydra: the road swings out east round a wide U; No Concept of Geography cuts across inside it.
  b.section('Head of the Hydra', props(10, 1.4));
  b.mark('hydra');
  b.arc(42, -90).straight(20);
  b.mark('uIn');
  b.arc(HYDRA_R, 180);
  b.mark('uOut');
  b.straight(25);
  b.section('Tastes the Breeze', props(10.5, 1.4));
  b.mark('breeze');
  b.arc(75, -60).straight(10);
  b.section('Conduit Sees', props(10, 1.4));
  b.mark('conduit');
  b.arc(70, 90);
  b.section('The Living Room Suite', props(10, 1.4));
  b.mark('suite');
  b.straight(50);
  // Boredom is what boredom breeds: sunk in a cut.
  b.section('Boredom Breeds', props(9.5, CUT_WALL));
  b.mark('boredom');
  b.straight(85);
  b.section('So Deranged', props(10, 1.4));
  b.mark('deranged');
  b.straight(5);
  corner(b, 55, 34, 90);
  b.straight(5);
  // All this indecision in anthropoids: the road can't make up its mind, and turns back.
  b.section('Indecision in Anthropoids', props(10, 1.4));
  b.mark('indecision');
  b.arc(50, -180);
  // Wire walking upon the knife: the road a thin wire, round a knife-edge corner.
  b.section('Wire Walking Upon the Knife', props(7, 1.4));
  b.mark('wire');
  b.straight(5);
  corner(b, 55, 32, 90);
  b.section('Still Fatigued', props(10, 1.4));
  b.mark('fatigued');
  b.straight(5).arc(60, 90);
  b.section('Dead Asleep', props(10, 1.4));
  b.mark('asleep');
  b.arc(80, -15).arc(80, 15);
  b.section('Riding High', props(10, 1.4));
  b.mark('riding');
  b.arc(80, 15);
  b.section('Another Carpark', props(10, 1.4));
  b.mark('carpark');
  b.arc(80, -15).straight(8);
  // Another promoter hanging in your hair, another backstage green room to prepare: the doors rise across the road.
  b.section('Another Promoter', props(10.5, 1.4));
  b.mark('promoter');
  b.straight(45);
  b.section('Another Green Room', props(10.5, 1.4));
  b.mark('greenRoom');
  b.straight(40);
  // It's an odd life 'til you get in the stride: round to the line.
  b.section('Get in the Stride', props(10.5, 1.4));
  b.mark('stride');
  b.arc(70, 90);
}

/** Where the lap ends, and so starts: the lap from the line to the bottom loop is laid from the crossroad, so its end doesn't depend on where it starts. */
function measureStart(): Pose {
  const b = new TrackBuilder({ x: -250, z: 0, h: rad(90) }, 'All This Rock n Roll', props(10.5, 1.4));
  lay(b);
  return { ...b.pose };
}

/** A pose on a laid ribbon `s` metres along it. */
function poseOn(points: readonly (readonly [number, number])[], s: number): Pose {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const l = Math.hypot(bx - ax, bz - az);
    if (d + l >= s) {
      const u = (s - d) / l;
      return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, h: Math.atan2(bx - ax, bz - az) };
    }
    d += l;
  }
  throw new Error('past the end');
}

/** No Concept of Geography: straight across the hydra's U, as if the map didn't matter. */
function buildCut(b: TrackBuilder, points: readonly (readonly [number, number])[]) {
  const from = b.marks.uIn.s - CUT_FROM;
  const to = b.marks.uOut.s + CUT_TO;
  const lane = new TrackBuilder(poseOn(points, from), 'No Concept of Geography', { halfWidth: CUT_HW, wallHeight: 0, surface: 'tourRoad' });
  // Straight off the road and straight onto it, turning between.
  lane.straight(8);
  toward(lane, poseOn(points, to - 8), CUT_R);
  lane.straight(8);
  const len = lane.s;
  lane.profile(0, len, () => 0, 10);
  const ribbon = lane.finish(false);
  // Where it's off the road it leaves and until it meets it again (the cut has no walls; the road's own are opened at its mouths).
  const [sec] = ribbon.sections;
  const room = (q: readonly [number, number]) => Math.min(...points.map((m) => Math.hypot(m[0] - q[0], m[1] - q[1]))) - (sec.halfWidth + 10 * ROAD_WIDTH_SCALE);
  const cum = [0];
  for (let i = 1; i < ribbon.points.length; i++) cum.push(cum[i - 1] + Math.hypot(ribbon.points[i][0] - ribbon.points[i - 1][0], ribbon.points[i][1] - ribbon.points[i - 1][1]));
  const clear = ribbon.points.map((q, i) => (room(q) > CUT_OPEN ? cum[i] : NaN)).filter((d) => !Number.isNaN(d));
  const [w0, w1] = [Math.min(...clear), Math.max(...clear)];
  ribbon.sections = [
    { ...sec, to: w0, wallHeight: 0 },
    { ...sec, from: w0, to: w1 },
    { ...sec, from: w1, wallHeight: 0 },
  ];
  const branch: BranchDef = { name: 'No Concept of Geography', mainFrom: from, mainTo: to, ...ribbon, openOn: [2, 'final'], shut: { kind: 'vanish' } };
  return { branch, pits: lane.pits, mid: len / 2, open: [[from - 5, from + w0 + 5], [to - (len - w1) - 5, to + 5]] as [number, number][] };
}

/**
 * Oddlife (K.G., 2020): the band's life on tour, bad for the ears and the
 * brain, weird and strange and odd, and a gift. The lap is a figure of
 * eight of bitumen through a crossroad, round and round like a tour: the
 * show in the top loop, the rest of the odd life in the bottom one.
 */
export function buildOddlife(): TrackDef {
  const b = new TrackBuilder(measureStart(), 'All This Rock n Roll', props(10.5, 1.4));
  lay(b);
  const m = (name: string, d = 0) => b.marks[name].s + d;
  const ease = (s0: number, y0: number, s1: number, y1: number) => b.profile(s0, s1, (u) => y0 + (y1 - y0) * u * u * (3 - 2 * u));
  // The way back: up to the energy peak on the deck, over the crossroad, and off it.
  const cross = m('crossDown');
  ease(m('line'), 0, cross - DECK_FROM, DECK);
  b.profile(cross - DECK_FROM, cross + DECK_TO, () => DECK, 10);
  b.profile(cross + DECK_TO, cross + DECK_TO + DROP, (u) => DECK * (1 - Math.sin((Math.PI * u) / 2)), 4);
  // Echoed feet on the hallowed ground: the road bouncing like the floor of a full house.
  b.profile(m('hallowed'), m('peaks', 30), (u) => 2.2 * Math.sin(u * Math.PI * 3) ** 2, 4);
  // Boredom breeds: the cut, down in the living room's stretch, held, and up as it goes deranged.
  ease(m('suite', 10), 0, m('boredom', 10), -DEPTH);
  b.profile(m('boredom', 10), m('deranged', -10), () => -DEPTH, 10);
  ease(m('deranged', -10), -DEPTH, m('deranged', 40), 0);
  // Riding high 'til I'm back home: a climb through the dead-asleep esses to a crest, and off it airborne into the carpark.
  ease(m('asleep', 0), 0, m('riding', 14), RIDE);
  b.profile(m('riding', 14), m('carpark', 8), (u) => RIDE * (1 - Math.sin((Math.PI * u) / 2)), 3);

  const main = b.finish(true);
  const cut = buildCut(b, main.points);
  for (const [o0, o1] of cut.open) {
    main.sections = main.sections.flatMap((q) => {
      if (q.to <= o0 || q.from >= o1) return [q];
      return [
        ...(q.from < o0 ? [{ ...q, to: o0 }] : []),
        { ...q, from: Math.max(q.from, o0), to: Math.min(q.to, o1), wallHeight: 0 },
        ...(q.to > o1 ? [{ ...q, from: o1 }] : []),
      ];
    });
  }
  const at = m;
  // The lap dressed stretch by stretch (render/oddlife.ts, `FIELDS`), one field a section, from where it starts to where the next one does.
  const named = main.sections.filter((q, k, all) => k === 0 || q.name !== all[k - 1].name);
  const fields = named.map((q, k) => ({ kind: 'tourField' as const, ribbon: -1, s: q.from + 2, to: k + 1 < named.length ? named[k + 1].from : main.length - 4 }));
  const stand = (p: { x: number; z: number }) => standAt(main.points, p.x, p.z);
  const stations = [0, 1, 2, 3].map((k) => at('promoter', 8 + k * DOOR_APART));
  return {
    id: 'oddlife',
    name: 'Oddlife',
    main,
    branches: [cut.branch],
    pits: [...b.pits, ...cut.pits],
    boostPads: [
      { s: at('feet', 40), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('wire', 30), length: 8, lateral: 0, halfWidth: 3 },
      { s: at('riding', 30), length: 8, lateral: 0, halfWidth: 3 },
    ],
    checkpoints: ['ears', 'headbanging', 'fairy', 'hallowed', 'crown', 'round', 'hydra', 'conduit', 'boredom', 'indecision', 'fatigued', 'riding', 'promoter'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 420,
    landmarks: [
      { kind: 'stageGate', ribbon: -1, s: 6 },
      { kind: 'tourBus', ribbon: -1, ...stand(BUS_AT) },
      { kind: 'headbanger', ribbon: -1, ...stand(HEADBANGER_AT) },
      { kind: 'sugarplumFairy', ribbon: -1, ...stand(FAIRY_AT) },
      { kind: 'deckLights', ribbon: -1, s: at('crown', 0), to: at('feats', 0) },
      { kind: 'voyager', ribbon: -1, ...stand(VOYAGER_AT) },
      { kind: 'hydra', ribbon: -1, ...stand(HYDRA_AT) },
      { kind: 'anthropoids', ribbon: -1, ...stand(APES_AT) },
      { kind: 'motel', ribbon: -1, ...stand(MOTEL_AT) },
      { kind: 'tourPoster', ribbon: -1, ...stand(TOUR_AT) },
      ...fields,
      { kind: 'outbackSkyline', ribbon: -1, s: 22 },
    ],
    itemBoxes: [
      { s: at('ears', 20), count: 8 },
      { s: at('brain', 30), count: 3 },
      { s: at('hallowed', 30), count: 8 },
      { s: at('bus', 10), count: 3 },
      { s: at('breeze', 60), count: 8 },
      { s: at('boredom', 50), count: 3 },
      { s: at('fatigued', 30), count: 8 },
      { s: at('carpark', 10), count: 3 },
      { s: cut.mid, count: 1, ribbon: 0, double: true },
    ],
    hazards: [{ kind: 'backstageDoors', at: stations, period: DOOR_PERIOD }],
    theme: 'oddlife',
    music: { lap: 'oddlife', finalLap: 'oddlife-final-lap' },
  };
}
