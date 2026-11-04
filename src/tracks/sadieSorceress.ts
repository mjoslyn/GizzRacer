import { TrackBuilder, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const deg = (d: number) => (d * Math.PI) / 180;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The pentagram Sadie has scorched across the town from her broomstick,
 * seen from above: five points, each this far out from her lair at its
 * heart and on this bearing round it (degrees, 0 toward +z, 90 toward +x).
 * The lap reaches them in this order, drawing the star in one stroke: the
 * circus (the start and the finish, the long point), the bottle shop, the
 * scrap metal, the parmesan-sharp point up on her flight path, and
 * Millicent's cottage.
 */
const POINTS: { r: number; bearing: number }[] = [
  { r: 400, bearing: 180 },
  { r: 330, bearing: 252 },
  { r: 330, bearing: 324 },
  { r: 330, bearing: 36 },
  { r: 345, bearing: 108 },
];
/** The star is drawn two points at a time: 0, 2, 4, 1, 3 and home to 0. */
const ORDER = [0, 2, 4, 1, 3];
/** The hairpin round each point. */
export const POINT_R = 38;
/** Round Millicent's cottage the road swings out this far either way, on bends this wide, and round her garden on this. */
const COTTAGE_SWING = 15;
const COTTAGE_BEND = 36;
const COTTAGE_R = 50;
/** Her flight path: up over the town on decks this high where it crosses the roads below. */
export const DECK = 9;
/** Masquerading: the cut, this deep, walled this high. */
export const DEPTH = 7;
const CUT_WALL = 6;
/** See if she floats: the road dives this deep under the ducking pond, over this long, on ramps this long; the pond this far either side. */
export const DIVE = 7;
const DIVE_LEN = 110;
const DIVE_RAMP = 25;
const POND = 30;
/** The start line: this far along the first edge from the circus point. */
const START_ALONG = 232;
/** Sadie swoops across the road every this many seconds, at each of three stations this far apart. */
export const BROOM_PERIOD = 4.6;
const BROOM_APART = 46;
/** The first of them this far past where the buttercups' lane comes back. */
const BROOM_IN = 22;
/** Poisonous Like Buttercups: the lane inside Millicent's point, on bends this wide either side of a pool of poison this long. */
const BUTTERCUP_R = 50;
export const POOL = 16;

/** The pentagram: its points, its five edges in lap order (start point, heading, length), the turn onto each edge at its start, and how far along each edge the two roads that cross it do. */
export function pentagram() {
  const pts = POINTS.map(({ r, bearing }) => ({ x: r * Math.sin(deg(bearing)), z: r * Math.cos(deg(bearing)) }));
  const edges = ORDER.map((k, i) => {
    const a = pts[k];
    const b = pts[ORDER[(i + 1) % 5]];
    return { from: a, h: Math.atan2(b.x - a.x, b.z - a.z), length: Math.hypot(b.x - a.x, b.z - a.z) };
  });
  const turns = edges.map((e, i) => wrap(e.h - edges[(i + 4) % 5].h));
  /** How far along edge i (from its start point) edge j crosses it. */
  const cross = (i: number, j: number) => {
    const p = edges[i];
    const q = edges[j];
    const [dx, dz, ex, ez] = [Math.sin(p.h), Math.cos(p.h), Math.sin(q.h), Math.cos(q.h)];
    const wx = q.from.x - p.from.x;
    const wz = q.from.z - p.from.z;
    return (wx * ez - wz * ex) / (dx * ez - dz * ex);
  };
  // Each edge crosses the edge two after it first, then the one three after.
  const crossings = edges.map((_, i) => [cross(i, (i + 2) % 5), cross(i, (i + 3) % 5)] as [number, number]);
  return { pts, edges, turns, crossings };
}

/**
 * Sadie Sorceress (the All Stars Cup #2's second, from Omnium Gatherum,
 * 2022): the band's first full rap song, Stu and Ambrose rapping over
 * chopped samples about an 80s lady named Sadie, a witch on rollerblades,
 * with Ambrose's grandmother Millicent saying hello. Sadie's night out on
 * the town, roller disco and witchcraft, and the town's night out after
 * her with pitchforks. The lap is the pentagram she has scorched across the
 * town from her broomstick, drawn in one stroke from point to point, and it
 * crosses itself five times round her lair in its heart, in tiers: her
 * flight path on decks over the roads below, the roads over the
 * masquerade's cut. The sections run through the song in order, from
 * "who's this Sadie Sorceress?" round the circus to "the most dangerous,
 * debaucherous".
 */
export function buildSadieSorceress(): TrackDef {
  const { edges, turns, crossings } = pentagram();
  /** How far from point i the hairpin round it starts and ends. */
  const tangent = (i: number) => (i === 4 ? cottage.reach : POINT_R * Math.tan(Math.abs(turns[i]) / 2));
  const hairpin = (i: number) => (i === 4 ? cottage.lay(b) : b.arc(POINT_R, (turns[i] * 180) / Math.PI));
  const pose = (i: number, d: number): Pose => ({ x: edges[i].from.x + Math.sin(edges[i].h) * d, z: edges[i].from.z + Math.cos(edges[i].h) * d, h: edges[i].h });
  const START = pose(0, START_ALONG);
  const b = new TrackBuilder(START, "Who's This Sadie Sorceress?", { halfWidth: 10, wallHeight: 1.2, surface: 'rink' });
  /** How far along edge i the road has come. */
  const along = (i: number) => (b.pose.x - edges[i].from.x) * Math.sin(edges[i].h) + (b.pose.z - edges[i].from.z) * Math.cos(edges[i].h);
  /** On along edge i to `d` from its start point. */
  const to = (i: number, d: number) => {
    const left = d - along(i);
    if (left > 0.01) b.straight(left);
    return b;
  };
  /** A swerve off the star's line and back onto it: one way x degrees, back 2x, and straight again, on bends of radius r. */
  const swerve = (r: number, x: number) => b.arc(r, x).arc(r, -2 * x).arc(r, x);
  const props = (extra: Partial<{ wallHeight: number; bridge: boolean }> = {}) => ({ halfWidth: 10, wallHeight: 1.2, surface: 'rink' as const, ...extra });
  const buttercups = buttercupBend(edges[3].h, turns[4]);
  const cottage = cottageLoop(edges[3].h, turns[4]);
  // Where the road down off the flight path passes closest to the star's heart, and how far off to the side the heart is from there.
  const lairFoot = -(edges[3].from.x * Math.sin(edges[3].h) + edges[3].from.z * Math.cos(edges[3].h));
  const foot = pose(3, lairFoot);
  const lairLateral = foot.x * Math.cos(foot.h) - foot.z * Math.sin(foot.h);

  // Who's this Sadie Sorceress? Out of the roller rink past the circus, two kickers.
  b.straight(12).mark('kick1').kicker().straight(14).mark('kick2').kicker();
  to(0, crossings[0][0] - 28);
  // Wild like a witch: under her flight path twice, swerving between.
  b.section('Wild Like a Witch', props());
  b.mark('witch');
  to(0, (crossings[0][0] + crossings[0][1]) / 2 - 35);
  swerve(55, 18);
  to(0, crossings[0][1] + 40);
  // More fly than Quidditch: a leap through the hoops.
  b.section('More Fly Than Quidditch', props());
  b.mark('quidditch');
  b.straight(4).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20);
  b.mark('hoops');
  b.elevate(0);
  to(0, edges[0].length - tangent(1));
  // Smoking winnies, drinking tinnies and Glenfiddich: round the bottle shop.
  b.section('Winnies, Tinnies and Glenfiddich', props());
  b.mark('winnies');
  hairpin(1);

  // She's a roller blader skating, down into the masquerade.
  b.section('Roller Blader Skating', props());
  b.mark('skating');
  to(1, crossings[1][0] - 90);
  b.section('Masquerading', props({ wallHeight: CUT_WALL }));
  b.mark('masq');
  to(1, (crossings[1][0] + crossings[1][1]) / 2 - 33);
  swerve(60, -16);
  to(1, crossings[1][1] + 90);
  b.mark('masqEnd');
  b.section('Eats Blood and Trouble', props());
  b.mark('blood');
  to(1, edges[1].length - tangent(2));
  // Meddles in the metal: round the scrap heap.
  b.section('Meddles in the Metal', props());
  b.mark('metal');
  hairpin(2);

  // Up onto her flight path, high over the roads.
  b.section('Handbag Freak Flag', props());
  b.mark('handbag');
  to(2, crossings[2][0] - 50);
  b.mark('deck');
  b.section('Dragon Scale Knapsack', props({ bridge: true }));
  b.mark('knapsack');
  to(2, (crossings[2][0] + crossings[2][1]) / 2 - 33);
  swerve(60, 16);
  to(2, crossings[2][1] + 30);
  b.section('Leviathan Cardigan', props({ bridge: true }));
  b.mark('cardigan');
  to(2, edges[2].length - tangent(3));
  // Sharp like parmesan: the point of the star, up on the deck.
  b.section('Sharp Like Parmesan', props({ bridge: true }));
  b.mark('parmesan');
  hairpin(3);
  b.section('Concealing Her Identity', props({ bridge: true }));
  b.mark('identity');
  to(3, crossings[3][0] + 34);
  b.mark('crest');
  // Nightshade bringing death commander: off the crest of the flight path, down over the masquerade.
  b.section('Nightshade', props({ bridge: true }));
  b.mark('nightshade');
  // Abreast of her lair, the star's heart.
  to(3, lairFoot);
  b.mark('lair');
  to(3, crossings[3][1] + 25);
  b.mark('deckEnd');
  // Have a gander, oleander: through the poison garden.
  // Open to the garden, where the buttercups' lane leaves it.
  b.section('Have a Gander, Oleander', props({ wallHeight: 0 }));
  b.mark('oleander');
  to(3, edges[3].length - buttercups.lead);
  b.mark('buttercupsFrom');
  to(3, edges[3].length - tangent(4));
  // Hello love, how are ya? Round Millicent's cottage.
  b.section('Hello Love, How Are Ya?', props({ wallHeight: 0 }));
  b.mark('hello');
  hairpin(4);

  // Snapping necks with her broomstick: Sadie swooping across the road, over the masquerade.
  b.section('Snapping Necks with Her Broomstick', props({ wallHeight: 0 }));
  b.mark('necks');
  to(4, buttercups.lead);
  b.mark('buttercupsTo');
  to(4, buttercups.lead + 12);
  b.mark('brooms');
  b.section('Snapping Necks with Her Broomstick', props());
  to(4, crossings[4][0] - 25);
  b.section('Snapping Necks with Her Broomstick', props({ bridge: true }));
  b.mark('necksBridge');
  to(4, crossings[4][0] + 25);
  b.section('Snapping Necks with Her Broomstick', props());
  to(4, buttercups.lead + BROOM_IN + 2 * BROOM_APART + 12);
  // Pitchforks banging on her door: the village, under her flight path.
  b.section('Pitchforks Banging on Her Door', props());
  b.mark('pitchforks');
  to(4, crossings[4][1] + 25);
  // To see if she floats or sinks: down under the ducking pond and back up.
  b.section('See If She Floats', { halfWidth: 10, surface: 'rink' });
  b.mark('floats');
  b.dive(DIVE_LEN, DIVE, DIVE_RAMP, POND);
  b.mark('floatsEnd');
  b.section('See If She Floats', props());
  to(4, edges[4].length - tangent(0));
  // Sell her to the circus: round the big top.
  b.section('Sell Her to the Circus', props());
  b.mark('circus');
  hairpin(0);
  // The most dangerous, debaucherous Sadie Sorceress: home.
  b.section('The Most Dangerous, Debaucherous', props());
  b.mark('debaucherous');
  to(0, START_ALONG);

  const m = (name: string, d = 0) => b.marks[name].s + d;
  // Down into the masquerade's cut and back up.
  // Full depth well before the first road over it and until well after the second, where their wide decks pass over.
  ease(b, m('masq', 5), 0, m('masq', 50), -DEPTH);
  b.profile(m('masq', 50), m('masqEnd', -50), () => -DEPTH, 10);
  ease(b, m('masqEnd', -50), -DEPTH, m('masqEnd', -5), 0);
  // Up onto the flight path, along it round the sharp point, and off its crest.
  ease(b, m('handbag', 8), 0, m('deck', 32), DECK);
  b.profile(m('deck', 32), m('crest'), () => DECK, 10);
  plunge(b, m('crest'), DECK, m('crest', 85), 0);

  const main = b.finish(true);
  const lane = buildButtercups(b.marks.buttercupsFrom, b.marks.buttercupsTo, buttercups);
  const at = (mark: string, d: number) => b.marks[mark].s + d;
  // The broomstick's stations: across the bridge over the masquerade and on, each a beat after the one before.
  const brooms = [0, 1, 2].map((k) => at('buttercupsTo', BROOM_IN + k * BROOM_APART));
  return {
    id: 'sadie-sorceress',
    name: 'Sadie Sorceress',
    main,
    branches: [lane.branch],
    pits: [...b.pits, ...lane.pits],
    boostPads: [
      { s: at('skating', 18), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('masqEnd', -30), length: 8, lateral: -3, halfWidth: 2.5 },
      { s: at('floatsEnd', 6), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['witch', 'winnies', 'masq', 'metal', 'knapsack', 'parmesan', 'nightshade', 'hello', 'pitchforks', 'circus'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'rinkGate', ribbon: -1, s: 6 },
      // Sadie herself in her lair at the heart of the pentagram, skating on the spot over her cauldron.
      { kind: 'sadieColossus', ribbon: -1, s: at('lair', 0), lateral: lairLateral },
      { kind: 'quidditchHoops', ribbon: -1, s: at('hoops', 0) },
      { kind: 'masquerade', ribbon: -1, s: at('masq', 50), to: at('masqEnd', -50) },
      { kind: 'flightPath', ribbon: -1, s: at('deck', 0), to: at('deckEnd', 0) },
      { kind: 'poisonGarden', ribbon: -1, s: at('oleander', 0), to: at('buttercupsFrom', 0) },
      { kind: 'grannyCottage', ribbon: -1, s: at('hello', 0), to: at('necks', 0) },
      { kind: 'pitchforkMob', ribbon: -1, s: at('pitchforks', -40), to: at('floats', -10) },
      { kind: 'duckingStool', ribbon: -1, s: at('floats', DIVE_LEN / 2) },
      { kind: 'bigTop', ribbon: -1, s: at('circus', 0), to: at('debaucherous', 0) },
      { kind: 'poisonPool', ribbon: 0, s: lane.pool },
    ],
    itemBoxes: [
      { s: at('witch', 60), count: 4 },
      { s: at('winnies', 20), count: 3 },
      { s: at('masq', 120), count: 4 },
      // Under the bridge out of the masquerade, where the road over it crosses.
      { s: at('masqEnd', -88), count: 3 },
      { s: at('handbag', 40), count: 3 },
      { s: at('identity', 50), count: 4 },
      { s: at('oleander', 25), count: 3 },
      { s: at('pitchforks', 30), count: 4 },
      { s: at('floatsEnd', 30), count: 3 },
      { s: at('debaucherous', 40), count: 4 },
      { s: lane.pool, count: 1, ribbon: 0, double: true },
    ],
    hazards: [{ kind: 'brooms', at: brooms, period: BROOM_PERIOD }],
    theme: 'sorceress',
    music: { lap: 'sadie-sorceress', finalLap: 'sadie-sorceress-final-lap' },
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
 * How far from a point a bend round it carries, symmetric about the point's
 * bisector, coming in on heading `h` and turning `turn`: lays it from
 * nowhere and measures. From the point, back along the way in and out
 * along the way out, it carries (u + w) times its reach.
 */
function reachOf(h: number, turn: number, lay: (b: TrackBuilder) => unknown): number {
  const probe = new TrackBuilder({ x: 0, z: 0, h }, 'probe', { halfWidth: 5 });
  lay(probe);
  const sx = Math.sin(h) + Math.sin(h + turn);
  const sz = Math.cos(h) + Math.cos(h + turn);
  return Math.hypot(probe.pose.x, probe.pose.z) / Math.hypot(sx, sz);
}

/** Round Millicent's cottage: the road swings out away from the point's inside, round her garden at the tip, and back in onto the way out. */
function cottageLoop(h: number, turn: number) {
  const dir = Math.sign(turn);
  const lay = (b: TrackBuilder) => b.arc(COTTAGE_BEND, -dir * COTTAGE_SWING).arc(COTTAGE_R, (turn * 180) / Math.PI + 2 * dir * COTTAGE_SWING).arc(COTTAGE_BEND, -dir * COTTAGE_SWING);
  return { lay, reach: reachOf(h, turn, lay) };
}

/**
 * The buttercups' bend inside Millicent's point: a bend half way round, the
 * pool's planks straight across, and the other half, leaving the road
 * coming in to the point and meeting the road going out of it, the same
 * distance (`lead`) from the point on each.
 */
function buttercupBend(h: number, turn: number) {
  const half = (turn * 90) / Math.PI;
  const reach = reachOf(h, turn, (b) => b.arc(BUTTERCUP_R, half).straight(POOL).arc(BUTTERCUP_R, half));
  return { half, lead: reach };
}

/**
 * Poisonous Like Buttercups: a lane cutting inside Millicent's point
 * through the buttercups, over a pool of poison on planks; from the second
 * lap on, once you've had a gander. On the first the planks aren't down,
 * and there's only the poison.
 */
function buildButtercups(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }, bend: { half: number }) {
  const b = new TrackBuilder(from.pose, 'Poisonous Like Buttercups', { halfWidth: 5, surface: 'rink' });
  b.arc(BUTTERCUP_R, bend.half);
  const pool = b.s + POOL / 2;
  b.bridge(POOL, 6);
  b.arc(BUTTERCUP_R, bend.half);
  // Straight on to where it meets the road again.
  const left = (b.pose.x - to.pose.x) * -Math.sin(to.pose.h) + (b.pose.z - to.pose.z) * -Math.cos(to.pose.h);
  b.straight(Math.max(0, left));
  const branch: BranchDef = { name: 'Poisonous Like Buttercups', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2, 'final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, pool };
}
