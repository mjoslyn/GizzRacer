import { ROAD_WIDTH_SCALE, TrackBuilder, dubins, type Pose, type SectionProps } from './builder';
import { NEEDLE_BPM } from '../kits/intrasport';
import type { BranchDef, TrackDef } from './track';

/**
 * The stadium inside the head, seen from above: the lap is a run through
 * the song, line by line in its order, round a night stadium turned rave.
 * It slides inward first, down a players' tunnel sunk under the road it
 * will come back along; winds clockwise through the static to the rhythm
 * and the collision; takes off on a long climb onto a deck that floats
 * round the top of the map and comes back down across the middle, high
 * over two of its own roads, a bird's eye view of them; sheds its skin on
 * the way down; the hand on the gun, then off a ramp past the face
 * splashing in the sky; runs up through the dreams and the needle to the
 * schism in the rhythm, where the road splits (the long way round a
 * hairpin, or Now I'm Running, a tighter one inside it); and comes down
 * the far side, liquifying and igniting, evolving along the bottom, the
 * feeling's on the floor, to the line: don't do it.
 */
const SCALE = 0.92;
/** Slide Inward: the start straight sinks this far into a tunnel under My Hands Are Disappearing. */
export const TUNNEL = 6;
/** My Hands Are Disappearing crosses the tunnel on a low deck this high. */
export const LOW_DECK = 4;
/** I Think I'm Taking Off climbs to the floating deck this high, and I've Got a Bird's Eye View holds it over Find the Rhythm and My Hands Are Disappearing. */
export const HIGH_DECK = 11;
/** The deck's walls, high enough that nothing hops off it onto the roads under it. */
const DECK_WALL = 2.6;
/** The needle gantries along Sleeping with a Needle, this far apart. */
const NEEDLE_APART = 24;
/** Now I'm Running: it leaves the road at the end of Sleeping with a Needle and turns inside the hairpin on this radius. */
const LANE_R = 36;
/** The lane is walled from where it's this clear of the road it leaves to where it's that clear of the road it joins. */
const LANE_OPEN = 1;

const props = (hw: number, wall: number, extra: Partial<SectionProps> = {}): SectionProps => ({ halfWidth: hw, wallHeight: wall, surface: 'tartan', ...extra });

const START: Pose = { x: 0, z: -200, h: 0 };

/** Lays the whole lap onto `b`, sections and marks too. */
function lay(b: TrackBuilder) {
  b.scale = SCALE;
  b.mark('line');
  b.straight(40);
  // Don't take it personally. Verse one: slide inward, shatter the static silencing my mind, find the rhythm and set course to collide.
  b.section('Slide Inward', props(9.5, 1.4));
  b.mark('sliding');
  b.straight(130);
  b.section('Shatter the Static', props(9.5, 1.4));
  b.mark('static');
  b.arc(50, 90);
  b.section('Find the Rhythm', props(9.5, 1.4));
  b.mark('collision');
  b.straight(45);
  b.section('Set Course to Collide', props(9.5, 1.4));
  b.mark('noise');
  b.arc(55, 180);
  // My hands are disappearing, dissolving in a tear.
  b.section('My Hands Are Disappearing', props(9.5, DECK_WALL, { bridge: true }));
  b.mark('hands');
  b.straight(150);
  b.section('Dissolving in a Tear', props(9.5, 1.4));
  b.mark('tear');
  b.straight(10).arc(60, 90);
  // Starting to feel something: taking off, will I evaporate, a bird's eye view, I have shed my skin.
  b.section("I Think I'm Taking Off", props(9, 1.4));
  b.mark('lift');
  b.straight(130);
  b.section('Will I Evaporate?', props(9, DECK_WALL, { bridge: true }));
  b.mark('evaporating');
  b.arc(85, 180);
  b.section("I've Got a Bird's Eye View", props(9, DECK_WALL, { bridge: true }));
  b.mark('down');
  b.straight(200);
  b.section('I Have Shed My Skin', props(9, DECK_WALL, { bridge: true }));
  b.mark('skin');
  b.straight(50);
  // Intra intrasport: perish to my thoughts, my hand is on the gun, my face splashes in the sky.
  b.section('Perish to My Thoughts', props(9.5, 1.4));
  b.mark('gun');
  b.arc(80, -90);
  b.section('My Hand Is on the Gun', props(9.5, 1.4));
  b.mark('dying');
  b.arc(80, -90);
  b.straight(10);
  b.section('My Face Splashes in the Sky', props(9.5, 1.4));
  b.mark('face');
  b.straight(8).mark('ramp').elevate(0).rise(18, 3);
  b.gap(14, 20);
  b.mark('landing');
  b.elevate(0);
  b.straight(26);
  b.section('I Used to Dream', props(10, 1.4));
  b.mark('floor');
  b.straight(60);
  // I used to dream; dreams that sew me up like sleeping with a needle; a schism in the rhythm, now I'm running.
  b.section('Dreams That Sew Me Up', props(10, 1.4));
  b.mark('violence');
  b.straight(50);
  b.section('Sleeping with a Needle', props(10, 1.4));
  b.mark('needles');
  b.straight(80);
  b.mark('split');
  b.section('A Schism in the Rhythm', props(9.5, 1.4));
  b.mark('schism');
  b.straight(30).arc(42.5, 180).straight(30);
  b.mark('join');
  // My hair is liquifying, my tastebuds are igniting, it's true I am evolving.
  b.section('My Hair Is Liquifying', props(9.5, 1.4));
  b.mark('hair');
  b.straight(20).arc(150, -22).arc(150, 44).arc(150, -22).straight(70);
  b.section('My Tastebuds Are Igniting', props(9.5, 1.4));
  b.mark('taste');
  b.straight(60).arc(50, 90);
  b.section("It's True I Am Evolving", props(9.5, 1.4));
  b.mark('evolution');
  b.straight(60);
  // The last chorus's floor, and the last word.
  b.section("The Feeling's on the Floor", props(9.5, 1.4));
  b.mark('floor2');
  b.straight(60);
  // Don't do it.
  b.section("Don't Do It", props(9.5, 1.4));
  b.mark('stop');
  for (const [kind, len] of dubins(b.pose, START, 50 * SCALE)) {
    if (kind === 'S') b.straight(len / SCALE);
    else b.arc(50, ((kind === 'L' ? 1 : -1) * len * 180) / (Math.PI * 50 * SCALE));
  }
}

/** Cumulative arc length along a laid ribbon's points. */
function cumulate(points: readonly (readonly [number, number])[]): number[] {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  return cum;
}

/** Where the stretch `a0`..`a1` of a laid lap passes closest over or under the stretch `b0`..`b1`: the arc length on each. */
function crossing(points: readonly (readonly [number, number])[], a0: number, a1: number, b0: number, b1: number): { a: number; b: number } {
  const cum = cumulate(points);
  let best = { a: a0, b: b0, d: Infinity };
  for (let i = 0; i < points.length; i++) {
    if (cum[i] < a0 || cum[i] > a1) continue;
    for (let j = 0; j < points.length; j++) {
      if (cum[j] < b0 || cum[j] > b1) continue;
      const d = Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]);
      if (d < best.d) best = { a: cum[i], b: cum[j], d };
    }
  }
  return best;
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

/** Now I'm Running: a tighter hairpin inside A Schism in the Rhythm's, from the end of the needle round onto My Hair Is Liquifying. */
function buildLane(points: readonly (readonly [number, number])[], from: number, to: number, roadHalfWidth: number) {
  const lane = new TrackBuilder(poseOn(points, from), "Now I'm Running", { halfWidth: 5.5, wallHeight: 2, surface: 'tartan' });
  for (const [kind, l] of dubins(lane.pose, poseOn(points, to), LANE_R)) {
    if (kind === 'S') lane.straight(l);
    else lane.arc(LANE_R, ((kind === 'L' ? 1 : -1) * l * 180) / (Math.PI * LANE_R));
  }
  const len = lane.s;
  lane.profile(0, len, () => 0, 10);
  const ribbon = lane.finish(false);
  // Walled once it's clear of the road it leaves and until it meets it again, so neither wall stands across the other road.
  const [sec] = ribbon.sections;
  const room = (q: readonly [number, number]) => Math.min(...points.map((m) => Math.hypot(m[0] - q[0], m[1] - q[1]))) - (sec.halfWidth + roadHalfWidth) * ROAD_WIDTH_SCALE;
  const cum = cumulate(ribbon.points);
  const clear = ribbon.points.map((q, i) => (room(q) > LANE_OPEN ? cum[i] : NaN)).filter((d) => !Number.isNaN(d));
  const [w0, w1] = [Math.min(...clear), Math.max(...clear)];
  ribbon.sections = [
    { ...sec, to: w0, wallHeight: 0 },
    { ...sec, from: w0, to: w1 },
    { ...sec, from: w1, wallHeight: 0 },
  ];
  const branch: BranchDef = { name: "Now I'm Running", mainFrom: from, mainTo: to, ...ribbon, openOn: [2, 'final'], shut: { kind: 'vanish' } };
  return { branch, pits: lane.pits, mid: len / 2, open: [[from - 5, from + w0 + 5], [to - (len - w1) - 5, to + 5]] as [number, number][] };
}

/**
 * Intrasport (K.G., 2020): the K.G. Cup's last, a microtonal house track
 * sung from somewhere outside the body, a night in the stadium of the head.
 * The lap runs the song in order: slide inward, shatter the static, find
 * the rhythm and collide, the hands disappearing in a tear, taking off to a
 * bird's eye view, the thoughts and the gun and the face in the sky, the
 * dreams that sew me up like sleeping with a needle, the schism in the
 * rhythm, liquifying and igniting and evolving, the feeling on the floor,
 * and the last words: don't do it.
 */
export function buildIntrasport(): TrackDef {
  const first = new TrackBuilder(START, "Don't Take It Personally", props(10, 1.4));
  lay(first);
  const pts = first.finish(true).points;
  const mk = first.marks;
  // Where My Hands Are Disappearing crosses the tunnel, and where the bird's eye deck crosses it (its last crossing).
  const tunnel = crossing(pts, mk.hands.s, mk.tear.s + 40, mk.sliding.s, mk.static.s + 20);
  const overHands = crossing(pts, mk.down.s, mk.gun.s, mk.hands.s, mk.tear.s);

  const b = new TrackBuilder(START, "Don't Take It Personally", props(10, 1.4));
  lay(b);
  const m = (name: string, d = 0) => b.marks[name].s + d;
  const ease = (s0: number, y0: number, s1: number, y1: number) => b.profile(s0, s1, (u) => y0 + (y1 - y0) * u * u * (3 - 2 * u));
  // Slide Inward: down into the tunnel under My Hands Are Disappearing, and up out of it.
  ease(tunnel.b - 60, 0, tunnel.b - 26, -TUNNEL);
  b.profile(tunnel.b - 26, tunnel.b + 22, () => -TUNNEL, 8);
  ease(tunnel.b + 22, -TUNNEL, tunnel.b + 54, 0);
  // My Hands Are Disappearing on its low deck over the tunnel.
  ease(m('noise', 60), 0, m('hands', 10), LOW_DECK);
  b.profile(m('hands', 10), tunnel.a + 22, () => LOW_DECK, 8);
  ease(tunnel.a + 22, LOW_DECK, tunnel.a + 50, 0);
  // Taking off up onto the floating deck, round the top, across the middle over two roads, and down out of the skin.
  ease(m('lift', 5), 0, m('evaporating', 10), HIGH_DECK);
  b.profile(m('evaporating', 10), overHands.a + 32, () => HIGH_DECK, 10);
  ease(overHands.a + 32, HIGH_DECK, m('gun', 80), 0);

  const main = b.finish(true);
  const lane = buildLane(main.points, m('split'), m('join', 6), 9.5);
  for (const [o0, o1] of lane.open) {
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
  const stations = [0, 1, 2].map((k) => at('needles', 18 + k * NEEDLE_APART));
  return {
    id: 'intrasport',
    name: 'Intrasport',
    main,
    branches: [lane.branch],
    pits: [...b.pits, ...lane.pits],
    boostPads: [
      { s: at('sliding', 30), length: 8, lateral: 0, halfWidth: 3 },
      { s: at('lift', 40), length: 8, lateral: 0, halfWidth: 3 },
      { s: at('floor', 30), length: 8, lateral: 0, halfWidth: 3 },
      { s: at('schism', 60), length: 8, lateral: 4, halfWidth: 2.5 },
      { s: at('evolution', 40), length: 8, lateral: 0, halfWidth: 3 },
    ],
    checkpoints: ['sliding', 'static', 'noise', 'hands', 'tear', 'lift', 'evaporating', 'down', 'skin', 'gun', 'face', 'floor', 'needles', 'schism', 'hair', 'taste', 'evolution', 'floor2', 'stop'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 340,
    landmarks: [
      { kind: 'stadiumGate', ribbon: -1, s: 6 },
      { kind: 'staticWall', ribbon: -1, s: at('static', 10), lateral: 34 },
      { kind: 'speakerStack', ribbon: -1, s: at('collision', 20), lateral: 36 },
      { kind: 'ballCollision', ribbon: -1, s: at('noise', 80), lateral: -48 },
      { kind: 'raveHands', ribbon: -1, s: at('hands', 130), lateral: 40 },
      { kind: 'tearDrop', ribbon: -1, s: at('tear', 50), lateral: 36 },
      { kind: 'skyFace', ribbon: -1, s: at('face', 36), lateral: 0 },
      { kind: 'starterPistol', ribbon: -1, s: at('dying', 40), lateral: 30 },
      { kind: 'boxingRing', ribbon: -1, s: at('floor', 30), lateral: -40 },
      { kind: 'mirrorFloor', ribbon: -1, s: at('floor2', 20), lateral: 40 },
      { kind: 'spoolTower', ribbon: -1, s: at('needles', 50), lateral: 34 },
      { kind: 'meltingHead', ribbon: -1, s: at('hair', 80), lateral: 38 },
      { kind: 'evolutionMarch', ribbon: -1, s: at('evolution', 30), lateral: -34 },
      { kind: 'stopHand', ribbon: -1, s: at('stop', 20), lateral: -34 },
      { kind: 'floatDeck', ribbon: -1, s: at('evaporating', 0), to: at('skin', 0) },
      // The lap dressed stretch by stretch (render/intrasport.ts, `FIELDS`), each from the section it starts in, and the stadium round the lot.
      { kind: 'raveField', ribbon: -1, s: 24, to: at('static', 0) },
      { kind: 'raveField', ribbon: -1, s: at('static', 2), to: at('noise', 0) },
      { kind: 'raveField', ribbon: -1, s: at('noise', 2), to: at('hands', 0) },
      { kind: 'raveField', ribbon: -1, s: at('hands', 2), to: at('lift', 0) },
      { kind: 'raveField', ribbon: -1, s: at('lift', 2), to: at('evaporating', 0) },
      { kind: 'raveField', ribbon: -1, s: at('evaporating', 2), to: at('down', 0) },
      { kind: 'raveField', ribbon: -1, s: at('down', 2), to: at('gun', 0) },
      { kind: 'raveField', ribbon: -1, s: at('gun', 2), to: at('face', 0) },
      { kind: 'raveField', ribbon: -1, s: at('face', 2), to: at('violence', 0) },
      { kind: 'raveField', ribbon: -1, s: at('violence', 2), to: at('schism', 0) },
      { kind: 'raveField', ribbon: -1, s: at('schism', 2), to: at('hair', 0) },
      { kind: 'raveField', ribbon: -1, s: at('hair', 2), to: at('evolution', 0) },
      { kind: 'raveField', ribbon: -1, s: at('evolution', 2), to: main.length - 10 },
      { kind: 'stadiumSkyline', ribbon: -1, s: 22 },
    ],
    itemBoxes: [
      { s: at('sliding', 70), count: 8 },
      { s: at('collision', 20), count: 3 },
      { s: at('tear', 50), count: 8 },
      { s: at('down', 60), count: 3 },
      { s: at('dying', 40), count: 8 },
      { s: at('floor', 60), count: 8 },
      { s: at('hair', 60), count: 3 },
      { s: at('evolution', 80), count: 8 },
      { s: lane.mid, count: 1, ribbon: 0, double: true },
    ],
    hazards: [{ kind: 'needles', at: stations, bpm: NEEDLE_BPM }],
    theme: 'stadiumrave',
    music: { lap: 'intrasport', finalLap: 'intrasport-final-lap' },
  };
}
