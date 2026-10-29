import { TrackBuilder, dubins, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

/** Layout scale. */
const K = 1.0;
const DEG = Math.PI / 180;
/** A point on the lagoon, in builder units. */
const wp = (x: number, z: number, h: number): Pose => ({ x: x * K, z: z * K, h });
/**
 * The lap is a whirlpool: a spiral round this centre, starting this far out
 * at this angle (degrees clockwise from north) and drawing in this much
 * with every degree, nearly twice round to its eye.
 */
const WHIRL_X = 30;
const WHIRL_Z = -50;
const WHIRL_R = 240;
const WHIRL_FROM = -20;
const WHIRL_IN = 0.3;
const WHIRL_TO = 620;
/** A point on the whirlpool's spiral, `deg` round it, heading round it clockwise. */
function whirl(deg: number): Pose {
  const t = deg * DEG;
  const r = WHIRL_R - WHIRL_IN * (deg - WHIRL_FROM);
  const dr = -WHIRL_IN / DEG;
  return wp(WHIRL_X + r * Math.sin(t), WHIRL_Z + r * Math.cos(t), Math.atan2(r * Math.cos(t) + dr * Math.sin(t), -r * Math.sin(t) + dr * Math.cos(t)));
}
const START: Pose = whirl(WHIRL_FROM);
const FINISH = 60;
/** Height of Microtonal Pier: a boardwalk high over the lagoon. */
const PIER_Y = 12;

/**
 * Open Water, once Fishing for Fishies (easy): a sandy beach road round the
 * lagoon in the Flying Microtonal Banana's cobalt and yellow, the open water
 * the Kraken drags sailors down into. The lap is a whirlpool seen from
 * above, a spiral drawn nearly twice round to its eye: along the Beach Road
 * (two kickers), the Fish Leap swinging out over the dunes with fish
 * leaping across, the Anoxia Reef's esses, the Palm Shuffle's dunes, and
 * the Coral Causeway diving under the lagoon to the sea floor; then round
 * the Whirlpool, drawing in, and out of its eye up Microtonal Pier, a
 * boardwalk on stilts climbing over the whirlpool's own road, jumping a gap
 * of open water and running 12 m over the Beach Road before it plunges back
 * to the sand. Round Lighthouse Point, a hairpin on a headland under the
 * light, and home. Shortcut: the Shallows, a plank boardwalk across the
 * deep water inside the Fish Leap, under the tide on the first lap.
 */
export function buildFishiesLagoon(): TrackDef {
  const b = new TrackBuilder(START, 'Beach Road', { halfWidth: 11, surface: 'sand' });
  b.scale = K;
  /** Follows the spiral from angle `from` to `to`, a waypoint every `step` degrees. */
  const round = (from: number, to: number, step = 20) => {
    const n = Math.max(1, Math.round(Math.abs(to - from) / step));
    for (let k = 1; k <= n; k++) b.hermiteTo(whirl(from + ((to - from) * k) / n));
  };
  // Two trick kickers on the beach, a little over a second apart.
  b.straight(70).kicker().straight(44).kicker();
  b.hermiteTo(whirl(30));

  // The Fish Leap swings out over the dunes; the Shallows run straight on round the spiral.
  b.section('Fish Leap', { halfWidth: 10, surface: 'sand' });
  b.mark('leap');
  b.arc(30, -60);
  b.hermiteTo(wp(250, 110, 2.6));
  b.hermiteTo(whirl(85));

  b.section('Anoxia Reef', { halfWidth: 9, surface: 'sand' });
  b.mark('esses');
  b.arc(35, 60).arc(35, -60);
  b.mark('reefApex');
  b.arc(35, -60).arc(35, 60);
  b.hermiteTo(whirl(150));

  b.section('Palm Shuffle', { halfWidth: 9, surface: 'sand' });
  b.mark('palms');
  b.arc(26, 75).arc(26, -75).straight(35);
  b.mark('slipFace');
  b.hermiteTo(whirl(235));

  // The causeway dives: down a slipway into the lagoon, along the sea floor under the surface, and back up.
  b.section('Coral Causeway', { halfWidth: 7, surface: 'sand' });
  b.mark('causeway');
  b.straight(16);
  b.dive(84, 8, 22, 30);
  b.straight(10);
  b.hermiteTo(whirl(300));

  // Round the whirlpool, drawing in to its eye.
  b.section('The Whirlpool', { halfWidth: 9.5, surface: 'sand' });
  b.mark('whirl');
  round(300, WHIRL_TO);
  b.mark('eye');

  // The pier climbs out of the eye on stilts, over the whirlpool and a gap, high over the beach, and plunges back down.
  b.section('Microtonal Pier', { halfWidth: 8.5, wallHeight: 1.2, surface: 'boards', bridge: true });
  b.mark('boardwalk');
  b.hermiteTo(wp(-15, 95, -0.1));
  b.mark('pier');
  b.elevate(PIER_Y).rise(20, PIER_Y + 3);
  b.gap(14, 30, 'water');
  b.elevate(PIER_Y).straight(10);
  b.hermiteTo(wp(10, 205, 0.3));
  b.mark('plunge');
  b.straight(40);

  // Lighthouse Point: round the headland under the light, a hairpin, and home.
  b.section('Lighthouse Point', { halfWidth: 10, surface: 'sand' });
  b.mark('lighthouse');
  b.arc(30, -110);
  b.straight(130);
  b.mark('hairpin');
  b.arc(50, -170);
  b.hermiteTo(offsetPose(START, -FINISH * K));
  b.section('Finish Straight', { halfWidth: 11, surface: 'sand' });
  b.mark('finish');
  b.straight(FINISH);
  shapeDunes(b);

  const main = b.finish(true);
  const open = buildOpenWater(b.marks.leap, b.marks.reefApex);
  return {
    id: 'fishies-lagoon',
    name: 'Open Water',
    main,
    branches: [open.branch],
    pits: [...b.pits, ...open.pits],
    boostPads: [{ s: 60, length: 8, lateral: 0, halfWidth: 2.5 }],
    checkpoints: ['leap', 'esses', 'palms', 'causeway', 'whirl', 'pier', 'lighthouse'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 420,
    landmarks: [
      // On the headland inside the hairpin.
      { kind: 'lighthouse', ribbon: -1, s: b.marks.hairpin.s + 75 },
      { kind: 'gantry', ribbon: -1, s: 0 },
    ],
    itemBoxes: [
      { s: 95, count: 4 },
      { s: b.marks.leap.s + 90, count: 4 },
      { s: b.marks.palms.s + 6, count: 3 },
      { s: b.marks.whirl.s + 150, count: 4 },
      { s: b.marks.lighthouse.s + 40, count: 4 },
      { s: open.boardsFrom + 20, count: 2, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'fish', from: b.marks.leap.s + 75, to: b.marks.leap.s + 155, count: 3, period: 3.4 },
      { kind: 'fish', from: b.marks.causeway.s + 40, to: b.marks.causeway.s + 100, count: 2, period: 4.2 },
    ],
    theme: 'lagoon',
    music: { lap: 'fishies-lagoon' },
  };
}

/**
 * The Shallows: a rail-less plank boardwalk straight across the deep lagoon,
 * from the Fish Leap to the apex of the reef. Off the planks is deep water.
 */
function buildOpenWater(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const R = 32;
  const SHORE = 40;
  const LAND = 8;
  const b = new TrackBuilder(from.pose, 'The Shallows', { halfWidth: 7, surface: 'sand' });
  // Straight on while the Fish Leap turns away, then an S onto the planks and down to the reef.
  b.straight(45);
  // The S ends a few metres short of the reef, to come in straight along the main road there.
  const [first, straight, last] = dubins(b.pose, offsetPose(to.pose, -LAND), R);
  const turn = (step: typeof first) => b.arc(R, ((step[0] === 'L' ? 1 : -1) * step[1] * 180) / (Math.PI * R));
  turn(first);
  b.section('Shallows Boardwalk', { halfWidth: 4.5, surface: 'boards' });
  const boardsFrom = b.s;
  b.bridge(straight[1] - SHORE, 12, 'water');
  // Back onto the sand short of the reef, so the deep water stays clear of the main road.
  b.section('The Shallows', { halfWidth: 7, surface: 'sand' });
  b.straight(SHORE);
  turn(last);
  b.straight(LAND);
  // High tide on the first lap: the boardwalk is under water until it goes out.
  const branch: BranchDef = { name: 'The Shallows', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2, 'final'], shut: { kind: 'flood' } };
  return { branch, pits: b.pits, boardsFrom };
}

/**
 * The lie of the land, laid over the layout: dunes on the beach and round
 * the Fish Leap (a steep slip face for airtime), a swell over the reef,
 * the climb onto the pier and its plunge, and the headland under the
 * lighthouse. The causeway's dive and the Shallows' junctions stay at sea level.
 */
function shapeDunes(b: TrackBuilder): void {
  const m = (k: string, d = 0) => b.marks[k].s + d * K;
  // A dune past the kickers, level again well before the Fish Leap.
  ease(b, m('leap', -90), m('leap', -60), 0, 3.5);
  ease(b, m('leap', -60), m('leap', -20), 3.5, 0);
  // Fish Leap: level where the Shallows fork off, up a dune through the first bend, off its slip face, then a swell through the second.
  ease(b, m('leap', 20), m('leap', 80), 0, 4.5);
  line(b, m('leap', 80), m('leap', 92), 4.5, 0.5);
  ease(b, m('leap', 92), m('leap', 103), 0.5, 0);
  ease(b, m('leap', 110), m('leap', 140), 0, 2);
  ease(b, m('leap', 140), m('leap', 170), 2, 0);
  // A swell over the reef, back at sea level where the Shallows rejoin.
  ease(b, m('esses', 12), m('esses', 42), 0, 1.5);
  ease(b, m('esses', 42), m('reefApex'), 1.5, 0);
  // Palm Shuffle: a roll through the S, then a dune whose slip face throws karts into the air.
  ease(b, m('palms', 8), m('palms', 42), 0, 2.5);
  ease(b, m('palms', 42), m('palms', 74), 2.5, 0.5);
  ease(b, m('palms', 74), m('slipFace', -22), 0.5, 4.5);
  line(b, m('slipFace', -22), m('slipFace', -10), 4.5, 0.5);
  ease(b, m('slipFace', -10), m('slipFace', 5), 0.5, 0);
  // Out of the eye up onto the pier, over the whirlpool on the way up.
  ease(b, m('boardwalk', 10), m('pier'), 0, PIER_Y);
  // Off the end of the pier once it is past the beach: a crest, and a plunge to the sand.
  b.profile(m('pier', 34), m('plunge', 20), () => PIER_Y, 10);
  plunge(b, m('plunge', 20), m('plunge', 68), PIER_Y, 0);
  // Lighthouse Point stands on a headland: up round the hairpin under the light, and down to the finish.
  ease(b, m('lighthouse', 30), m('hairpin'), 0, 6);
  ease(b, m('hairpin', 80), m('finish', -10), 6, 0);
}

/** Eases the road from height y0 to y1 between arc lengths s0 and s1, level at both ends. */
function ease(b: TrackBuilder, s0: number, s1: number, y0: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + ((y1 - y0) * (1 - Math.cos(Math.PI * u))) / 2);
}

/** Drops the road from y0 at s0 to y1 at s1, falling away at once over the top (a crest to fly off) and easing out at the bottom. */
function plunge(b: TrackBuilder, s0: number, s1: number, y0: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * Math.sin((Math.PI * u) / 2));
}

/** A straight slope from y0 to y1: a slip face, with a crest at its top. */
function line(b: TrackBuilder, s0: number, s1: number, y0: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * u);
}
