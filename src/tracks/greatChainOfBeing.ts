import { METEOR_CRUMBLE, METEOR_MARK, METEOR_ROLL } from '../items/hazards';
import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.115;
/** A pose on the map as seen from above, u to the right and v up the page (the builder's x runs the other way). */
const at = (u: number, v: number, deg: number): Pose => ({ x: -u * K, z: v * K, h: (deg * Math.PI) / 180 });
/** The fall: straight down the ladder at this lateral, and round into the start on a turn of this radius. */
const FALL_U = 20;
const HOME_R = 34;
const FINISH = 45;
const START_V = -195;
const START: Pose = at(FALL_U + HOME_R + FINISH, START_V, -90);
/** The Rock with Eyes: the hairpin up from the start straight onto the bottom rung. */
const ROCK_R = 32;
/**
 * The rungs of the ladder: each this far over the one below (a hairpin's
 * diameter), their hairpins turning about these laterals, the fall coming
 * down between them.
 */
const RUNG_R = 28;
const LEFT = -125;
const RIGHT = 100;
/** Where each rung runs across the map (z): the minerals, the plants, the beasts, men, the angels, and the throne. */
export const RUNGS = [0, 1, 2, 3, 4, 5].map((k) => (START_V + 2 * ROCK_R + 2 * RUNG_R * k) * K);
/** The quarry: the bottom rung sunk this deep. */
export const DEPTH = 8;
/** The rungs' heights, from one end to the other: the plants, the beasts, men, the angels' stairs, the throne. */
const PLANTS = [0, 3];
const BEASTS = [6, 9];
const MEN = [12, 15];
const ANGELS = [18, 25];
const THRONE = [29, 33];
export const SUMMIT = THRONE[1];
/** The angels' stairs: this many flights, each a tread and then a riser. */
export const FLIGHTS = 6;
const RISER = 0.4;
/** The top rung swings up round the empty throne in three arcs of this radius and turn; Unlinked leaps straight across beneath it. */
const THRONE_R = 20;
const THRONE_TURN = 75;
/** Off the top: the road falls away at once (a crest to fly off) over this long, to the first of the fall's levels. */
const LIP_LEN = 20;
/**
 * Then down the ladder a rung at a time: held at these heights over the
 * angels', men's, the beasts' and the plants' rungs until it's this far past
 * each (clear of the road under it, more than 6 m over it all the while),
 * and falling away off a lip to the next level over this long.
 */
export const FALL_LEVELS = [29, 22, 15, 10];
const FALL_CLEAR = 35;
const FALL_DROP = 32;
/** The rocky meteors: three to a climb, each rolling all the way down it before it falls again. */
const METEORS = 3;
/** How far down men's rung and the angels' stairs they roll. */
const METEOR_RUN = 130;

/**
 * The Great Chain of Being (the Gumboot Soup Cup's second), after Stu's
 * slow, heavy road song: the scala naturae, the ladder of all things, God at
 * the top, the angels, men, the beasts and the plants, and at the bottom the
 * minerals. "I am a rock with eyes to the sky", dropped by a woman from a
 * pocket in her coat, waiting for its time, come to disturb the flow; it
 * usurps the precious stones and comes to take the throne, transcends the
 * natural flesh, will lay your God to rest; it sees through your world's
 * facade and decides to punish God; "rocky meteor sparks fire, burn that God
 * damn church to the ground"; "I climb stairs to push you down, I climb
 * chains to cut you down"; it disrupts the natural order and brings the
 * sulking lamb to slaughter, and the great chain of being falls to pieces,
 * unlinked, to start again. The world is the ladder at dusk, smoke and
 * firelight, from a quarry of precious stones up through woods, fields of
 * beasts, a village and its church on fire, to stone stairs in the clouds
 * and an empty throne. The lap is the ladder itself, a rung to each tier of
 * being: the rock climbs it rung by rung, hairpin by hairpin, from the
 * bottom to the top, and falls straight back down through it, a rung at a
 * time, over every one. The Great Chain of Being (two kickers) and round the
 * Rock with Eyes to the Sky onto the bottom rung, the minerals: Wait for My
 * Time, Disturb the Flow (a leap over the stream), Dropped from a Pocket into
 * the quarry, Fall to Pieces and Usurp the Precious Stones sunk 8 m; Come to
 * Take the Throne climbing out round the first hairpin onto the plants,
 * Transcend the Natural Flesh's esses through the woods; Lay Your God to
 * Rest round the next onto the beasts, See Through Your World's Facade's
 * esses through their fields; Punish God round the next onto men's rung,
 * Rocky Meteor Sparks Fire, where rocks with eyes fall onto the top of the
 * climb and roll back down it at you, and round the burning church; the
 * angels: Climb Stairs to Push You Down, flights of stone stairs on a
 * viaduct with more rocks rolling down them, and Climb Chains to Cut You
 * Down round the great chain hanging out of the sky; the top, Disrupt
 * Natural Order, swinging up round the empty throne to 33 m; and off it,
 * Bring That Sulking Lamb to Slaughter, the fall, straight down the ladder
 * on a deck, held over each rung and falling away off a lip to the next,
 * down to the ground and home. Shortcut: Unlinked, straight across beneath
 * the throne, a leap through a broken link of the chain, on the final lap
 * only.
 */
export function buildGreatChainOfBeing(): TrackDef {
  const b = new TrackBuilder(START, 'The Great Chain of Being', { halfWidth: 10, surface: 'strata' });
  b.scale = K;
  /** Straight on until the road is level with lateral `u` across the map, whichever way it's going. */
  const toU = (u: number) => b.straight(Math.max(0, Math.sin(b.pose.h) > 0 ? -u * K - b.pose.x : b.pose.x + u * K) / K);
  /** An S that comes back to the line it left: out one way, back across, and straightened. */
  const esses = (r: number, deg: number) => b.arc(r, deg).arc(r, -2 * deg).arc(r, deg);
  const road = (props: { halfWidth: number; wallHeight?: number; bridge?: boolean }) => ({ surface: 'strata' as const, ...props });
  b.straight(15).mark('kick1').kicker().straight(20).mark('kick2').kicker().straight(5);

  b.section('Rock with Eyes to the Sky', road({ halfWidth: 10, wallHeight: 1.2 }));
  b.mark('rock');
  b.arc(ROCK_R, 180);

  // The bottom rung, the minerals: a leap over the stream, and down into the quarry.
  b.section('Wait for My Time', road({ halfWidth: 9, wallHeight: 1.2 }));
  b.mark('wait');
  b.straight(25);
  b.section('Disturb the Flow', road({ halfWidth: 10 }));
  b.mark('flow');
  b.straight(6).mark('ramp').elevate(0).rise(18, 3);
  b.gap(14, 20, 'water');
  b.elevate(0).straight(8);
  b.section('Dropped from a Pocket', road({ halfWidth: 10, wallHeight: 1.2 }));
  b.mark('dropped');
  b.straight(25);
  b.section('Fall to Pieces', road({ halfWidth: 9, wallHeight: 1.2 }));
  b.mark('pieces');
  esses(40, -18);
  b.section('Usurp the Precious Stones', road({ halfWidth: 9, wallHeight: 1.2 }));
  b.mark('stones');
  toU(FALL_U - 50);
  esses(45, 16);
  toU(LEFT);
  b.mark('stonesEnd');
  b.section('Come to Take the Throne', road({ halfWidth: 9, wallHeight: 1.2 }));
  b.mark('throne');
  b.arc(RUNG_R, -180);

  // The plants: esses through the woods, clear of the fall.
  b.section('Transcend the Natural Flesh', road({ halfWidth: 9, wallHeight: 1.2 }));
  b.mark('flesh');
  b.straight(8);
  b.mark('esses');
  esses(42, 24);
  esses(42, -20);
  toU(RIGHT);
  b.section('Lay Your God to Rest', road({ halfWidth: 9, wallHeight: 1.2 }));
  b.mark('rest');
  b.arc(RUNG_R, 180);

  // The beasts: esses through their fields, past the fall.
  b.section("See Through Your World's Facade", road({ halfWidth: 9, wallHeight: 1.2 }));
  b.mark('facade');
  toU(FALL_U - 40);
  esses(40, 22);
  toU(LEFT);
  b.section('Punish God', road({ halfWidth: 9, wallHeight: 1.2 }));
  b.mark('punish');
  b.arc(RUNG_R, -180);

  // Men: rocks with eyes falling on them, and their church burning.
  b.section('Rocky Meteor Sparks Fire', road({ halfWidth: 9, wallHeight: 1.2 }));
  b.mark('meteor');
  esses(45, -16);
  toU(RIGHT);
  b.section('Burn the Church', road({ halfWidth: 9, wallHeight: 1.2 }));
  b.mark('church');
  b.arc(RUNG_R, 180);

  // The angels: up the stairs on a viaduct, more rocks rolling down them, and round the chain.
  b.section('Climb Stairs to Push You Down', road({ halfWidth: 9, wallHeight: 1.2, bridge: true }));
  b.mark('stairs');
  toU(LEFT);
  b.section('Climb Chains to Cut You Down', road({ halfWidth: 9, wallHeight: 1.2, bridge: true }));
  b.mark('chains');
  b.arc(RUNG_R, -180);

  // The top: up round the empty throne, the walls open where Unlinked leaves and rejoins.
  b.section('Disrupt Natural Order', road({ halfWidth: 10, wallHeight: 1.2, bridge: true }));
  b.mark('order');
  b.straight(6);
  b.section('Disrupt Natural Order', road({ halfWidth: 10, bridge: true }));
  b.straight(2);
  b.mark('unlinkFrom');
  b.arc(THRONE_R, THRONE_TURN);
  b.section('Disrupt Natural Order', road({ halfWidth: 10, wallHeight: 1.2, bridge: true }));
  b.arc(THRONE_R, -2 * THRONE_TURN);
  b.section('Disrupt Natural Order', road({ halfWidth: 10, bridge: true }));
  b.arc(THRONE_R, THRONE_TURN);
  b.mark('unlinkTo');
  b.straight(3);
  b.section('Disrupt Natural Order', road({ halfWidth: 10, wallHeight: 1.2, bridge: true }));
  toU(FALL_U - RUNG_R);
  b.arc(RUNG_R, -90);
  b.mark('summit');

  // The fall: straight down the ladder on a deck, over every rung, and home.
  b.section('Bring That Sulking Lamb to Slaughter', road({ halfWidth: 10, wallHeight: 1.2, bridge: true }));
  b.mark('lamb');
  b.straight(Math.abs(START.z - b.pose.z) / K - HOME_R);
  b.mark('lambEnd');
  b.section('Bring That Sulking Lamb to Slaughter', road({ halfWidth: 10 }));
  // A hair tighter than the turn the fall was laid for, so the way home never comes out a whole loop.
  b.turnTo(offsetPose(START, -FINISH * K), HOME_R - 2);
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  const climb = (from: string, to: string, ys: number[], f: (u: number) => number = (u) => u) => b.profile(m(from), m(to), (u) => ys[0] + (ys[1] - ys[0]) * f(u), 4);
  // Down into the quarry and along it, sunk; out of it round the first hairpin.
  ease(b, m('dropped'), 0, m('pieces', 10), -DEPTH);
  b.profile(m('pieces', 10), m('stonesEnd'), () => -DEPTH, 10);
  ease(b, m('stonesEnd'), -DEPTH, m('flesh'), PLANTS[0]);
  // Up the ladder, a rung at a time, a hairpin up from each to the next.
  climb('flesh', 'rest', PLANTS);
  ease(b, m('rest'), PLANTS[1], m('facade'), BEASTS[0]);
  climb('facade', 'punish', BEASTS);
  ease(b, m('punish'), BEASTS[1], m('meteor'), MEN[0]);
  climb('meteor', 'church', MEN);
  ease(b, m('church'), MEN[1], m('stairs'), ANGELS[0]);
  climb('stairs', 'chains', ANGELS, stairs);
  ease(b, m('chains'), ANGELS[1], m('order'), THRONE[0]);
  ease(b, m('order'), THRONE[0], m('summit', -15), THRONE[1]);
  b.profile(m('summit', -15), m('summit'), () => SUMMIT, 5);
  // Off the top at once, then down the ladder a rung at a time, over every rung, to the ground.
  const top = m('summit');
  plunge(b, top, SUMMIT, m('summit', LIP_LEN), FALL_LEVELS[0]);
  let held = m('summit', LIP_LEN);
  FALL_LEVELS.forEach((y, k) => {
    // Clear of the rung under it: the angels' (4), men's (3), the beasts' (2), the plants' (1).
    const clear = top + (b.marks.summit.pose.z - RUNGS[4 - k]) + FALL_CLEAR * K;
    b.profile(held, clear, (u) => y - 0.5 * u, 4);
    const next = FALL_LEVELS[k + 1];
    if (next === undefined) plunge(b, clear, y - 0.5, m('lambEnd', 5), 0);
    else plunge(b, clear, y - 0.5, clear + FALL_DROP * K, next);
    held = clear + FALL_DROP * K;
  });

  const main = b.finish(true);
  const unlinked = buildUnlinked(b.marks.unlinkFrom, b.marks.unlinkTo, main);
  const meteors = (to: string) => {
    const z = m(to, -8);
    const a = z - METEOR_RUN * K;
    return { kind: 'rockyMeteors' as const, from: a, to: z, count: METEORS, period: METEOR_MARK + (z - a) / METEOR_ROLL + METEOR_CRUMBLE + 1.4 };
  };
  const mid = (a: string, z: string) => (m(a) + m(z)) / 2;
  return {
    id: 'great-chain-of-being',
    name: 'The Great Chain of Being',
    main,
    branches: [unlinked.branch],
    pits: [...b.pits, ...unlinked.pits],
    boostPads: [
      { s: m('flesh', 2), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: m('facade', 6), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: m('stairs', 6), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: m('order', 1), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['rock', 'flow', 'pieces', 'stones', 'throne', 'flesh', 'rest', 'facade', 'punish', 'meteor', 'church', 'stairs', 'chains', 'order', 'lamb'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 300,
    landmarks: [
      { kind: 'chainGate', ribbon: -1, s: 6 },
      // The rock with eyes lies outside its hairpin, looking up at the sky.
      { kind: 'rockWithEyes', ribbon: -1, s: mid('rock', 'wait'), lateral: ROCK_R + 24 },
      // The church burns outside the hairpin at the top of the climb the meteors fall on.
      { kind: 'burningChurch', ribbon: -1, s: mid('church', 'stairs'), lateral: RUNG_R + 30 },
      // The great chain hangs out of the sky into the eye of the hairpin climbing round it.
      { kind: 'greatChain', ribbon: -1, s: mid('chains', 'order'), lateral: RUNG_R },
      // The empty throne, on a cloud in the middle of the swing round it, over Unlinked.
      { kind: 'emptyThrone', ribbon: -1, s: mid('unlinkFrom', 'unlinkTo'), lateral: THRONE_R },
      { kind: 'brokenLink', ribbon: 0, s: unlinked.link },
    ],
    itemBoxes: [
      { s: m('wait', 10), count: 8 },
      { s: m('stones', 20), count: 3 },
      { s: m('esses', -4), count: 8 },
      { s: m('facade', 30), count: 3 },
      { s: m('meteor', 15), count: 3 },
      { s: m('stairs', 25), count: 3 },
      { s: m('lamb', 70), count: 8 },
      { s: unlinked.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [meteors('church'), meteors('chains')],
    theme: 'scala',
    music: { lap: 'great-chain-of-being', finalLap: 'great-chain-of-being-final-lap' },
  };
}

/** The angels' stairs, `u` of the way up: a level tread, then a riser, flight after flight. */
export function stairs(u: number): number {
  const q = Math.min(u, 1 - 1e-9) * FLIGHTS;
  const k = Math.floor(q);
  const f = Math.max(0, (q - k - (1 - RISER)) / RISER);
  return (k + f * f * (3 - 2 * f)) / FLIGHTS;
}

/** Drops the road from y0 at s0 to y1 at s1, falling away at once over the top (a crest to fly off) and easing out at the bottom. */
function plunge(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * Math.sin((Math.PI * u) / 2), 4);
}

/** Eases the road's height from y0 at arc length s0 to y1 at s1. */
function ease(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * u * u * (3 - 2 * u));
}

/** Unlinked: up a lip, over the gap in the broken link, and down onto the far side. */
const UNLINK_IN = 22;
const UNLINK_GAP = 12;
const UNLINK_LIP = 2;

/**
 * Unlinked: straight across beneath the empty throne, a lip up and a leap
 * through a broken link of the chain over nothing, and on to meet the top
 * rung again, no rails. On the final lap only; on the others there is no
 * road there, only the fall.
 */
function buildUnlinked(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }, main: ReturnType<TrackBuilder['finish']>) {
  const height = (s: number) => {
    const keys = main.elevation;
    for (let k = 1; k < keys.length; k++) if (s <= keys[k][0]) return keys[k - 1][1] + ((keys[k][1] - keys[k - 1][1]) * (s - keys[k - 1][0])) / (keys[k][0] - keys[k - 1][0]);
    return keys[keys.length - 1][1];
  };
  const y0 = height(from.s);
  const y1 = height(to.s);
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Unlinked', { halfWidth: 7, surface: 'strata', bridge: true });
  const along = (s: number) => y0 + ((y1 - y0) * s) / chord;
  b.elevate(y0).straight(UNLINK_IN).elevate(along(UNLINK_IN));
  const boxes = b.s - 10;
  b.rise(8, along(UNLINK_IN + 8) + UNLINK_LIP);
  b.section('Unlinked', { halfWidth: 7, surface: 'strata', bridge: true });
  const link = b.s + UNLINK_GAP / 2;
  b.gap(UNLINK_GAP, 7);
  b.elevate(along(b.s)).straight(chord - b.s).elevate(y1);
  const branch: BranchDef = { name: 'Unlinked', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: ['final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes, link };
}
