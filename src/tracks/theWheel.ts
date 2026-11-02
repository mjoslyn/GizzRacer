import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 0.87;
const deg = (d: number) => (d * Math.PI) / 180;
/** The helm's hub: the lap is laid round it, this far off the map's middle, so the whole of it sits in the middle of the map. */
export const HUB_X = -88;
export const HUB_Z = -76;
/**
 * The helm, seen from above. Its three spokes are three roads straight
 * across the hub, sixty degrees apart; between them the road swings out
 * round the rim. Each swing leaves a spoke on a knuckle turning ALPHA, runs
 * ARC round the rim (a circle about the hub, RIM out), and turns ALPHA
 * again into the next spoke; SPOKE is how far out from the hub the swings
 * start, where the spokes meet the rim.
 */
export const RIM = 150;
const KNUCKLE = 24;
const ALPHA = (Math.acos(-KNUCKLE / (RIM - KNUCKLE)) * 180) / Math.PI;
const ARC = 240 - 2 * ALPHA;
export const SPOKE = (RIM - KNUCKLE) * Math.sin(deg(ALPHA));
/** The first spoke's heading: the lap runs in toward the hub on it, and each spoke after is 240 degrees round from the one before. */
const SPOKE1 = deg(240);
/** A pose `r` along a spoke of heading `h` past the hub (negative: before it), heading along it. */
const onSpoke = (h: number, r: number): Pose => ({ x: HUB_X + Math.sin(h) * r * K, z: HUB_Z + Math.cos(h) * r * K, h });
/** The start: on the first spoke's handle, out past the rim. */
const HANDLE = 45;
const START: Pose = onSpoke(SPOKE1, -SPOKE - HANDLE);
const FINISH = 40;
/**
 * The tiers at the hub: the first spoke on a deck at ground level, the
 * second sunk in a cut under it, the third up on the top tier over both.
 * Each holds its tier this far either side of the hub.
 */
export const DEPTH = 7;
const WALL = 6;
export const TOP = 10;
const HUB_HOLD = 55;
/** In a Stupor: the cut bows this far round (each way) across the hub, so it passes beside the others' crossing. */
const BOW = 8;
/** Without Mercy: a loop of this radius, and a deck this high back over its own way in. */
const LOOP_R = 45;
export const DECK = 8;
/** The summit, where the idealistic reaper waits. */
export const SUMMIT = 14;
/** Shivering Pilgrims: the main road climbs round the shoulder in three arcs of this radius and turn; the steeper path runs straight up the face. */
const PATH_R = 36;
const PATH_TURN = 84;
/** With Hope to Prosper: down off the summit round the reaper's feet, on turns of this radius. */
const PROSPER_R = 34;
/** What Can We Offer?: a swerve out and back, on bends of this radius and turn. */
const OFFER_R = 30;
const OFFER_TURN = 20;
const OFFER = 4 * OFFER_R * Math.sin(deg(OFFER_TURN));
const ALLEGIANCE = 30;
/** The waves of sleep: one sway every this many seconds, and their rows this far apart (about how far a fast kart goes in the lag between rows). */
export const DOZE_PERIOD = 4.2;
const ROW = 36;

/**
 * The Wheel (the Gumboot Soup Cup's last, and the last song of the band's
 * five albums of 2017): the wheel that steers us into our future, and how
 * we only sleep at it, fall asleep willingly; our minds unpack, our muscles
 * relax, superfluous and in a stupor; into our future. There's help in
 * need, yet we decline, without mercy, destroying all that will keep us
 * heading for a better thesis; shivering pilgrims climb the steeper path to
 * the idealistic reaper; with hope to prosper, what can we offer, our
 * allegiance surely suffers. The world is dusk going into night, a somber
 * jazz light, the road a record's black groove, and the future glowing on
 * the horizon ahead. The lap is a ship's helm seen from above, its three
 * spokes roads across the hub in three tiers: in from the handle at the
 * wheel (two kickers), Fall Asleep Willingly across the hub on a deck,
 * Our Minds Unpack's esses out to the rim, Muscles Relax round it, In a
 * Stupor sunk 7 m in a cut under the hub, round the rim and Into Our
 * Future up the third spoke onto the top tier 10 m over both, off its crest
 * and Yet We Decline down the handle; Without Mercy loops right round and
 * back over its own way in on a deck, Destroying All leaps the broken road,
 * A Better Thesis turns for the peak, the Shivering Pilgrims climb round
 * its shoulder to the Idealistic Reaper on the summit, off its crest, With
 * Hope to Prosper sweeping down and round onto the first handle, What Can
 * We Offer? swerving, Our Allegiance Suffers, and home down the handle to
 * the wheel that steers us, the line looping on like a record's locked
 * groove. Waves of sleep roll down the first spoke and the cut: caught in
 * one as it lies thick, you nod off at the wheel; over its rumble strip as
 * it lifts, jolted awake. Shortcut: the Steeper Path, straight up the
 * peak's face over a crevasse, on the final lap only.
 */
export function buildTheWheel(): TrackDef {
  const b = new TrackBuilder(START, 'At the Wheel', { halfWidth: 10, surface: 'groove' });
  b.scale = K;
  /** Out along a spoke to the rim, round it and in along the next. */
  const swing = () => b.arc(KNUCKLE, ALPHA).arc(RIM, ARC).arc(KNUCKLE, ALPHA);

  // At the wheel: in from the first spoke's handle, two kickers, to the rim.
  b.straight(10).mark('kick1').kicker().straight(14).mark('kick2').kicker();
  b.straight(HANDLE - b.s / K);
  b.mark('rim1');
  // Falling asleep across the hub, on a deck over the cut.
  b.section('Fall Asleep Willingly', { halfWidth: 10, wallHeight: 1.2, surface: 'groove' });
  b.mark('asleep');
  b.straight(SPOKE - HUB_HOLD);
  b.mark('deck1');
  b.section('Fall Asleep Willingly', { halfWidth: 10, wallHeight: 1.2, surface: 'groove', bridge: true });
  b.straight(2 * HUB_HOLD);
  b.mark('deck1End');
  // Our minds unpack: an S out along the spoke, back on it at the rim.
  b.section('Our Minds Unpack', { halfWidth: 9.5, wallHeight: 1.2, surface: 'groove' });
  b.mark('unpack');
  const S_R = 22;
  const S_A = 32;
  const rest = SPOKE - HUB_HOLD - 6 * S_R * Math.sin(deg(S_A));
  b.straight(rest / 2).arc(S_R, S_A).arc(S_R, -2 * S_A).arc(S_R, 2 * S_A).arc(S_R, -S_A).straight(rest / 2);
  b.mark('unpackEnd');

  b.section('Muscles Relax', { halfWidth: 10, wallHeight: 1.2, surface: 'groove' });
  b.mark('relax');
  swing();
  b.mark('relaxEnd');

  // In a stupor: the second spoke sunk in a cut, bowing gently under the hub.
  b.section('In a Stupor', { halfWidth: 9.5, wallHeight: WALL, surface: 'groove' });
  b.mark('stupor');
  const bowR = (2 * SPOKE) / (4 * Math.sin(deg(BOW)));
  b.arc(bowR, BOW).arc(bowR, -2 * BOW).arc(bowR, BOW);
  b.mark('stuporEnd');

  // Round the rim and up the third spoke, onto the top tier over the hub, toward the future.
  b.section('Into Our Future', { halfWidth: 10, wallHeight: 1.2, surface: 'groove' });
  b.mark('future');
  swing();
  b.mark('spoke3');
  b.straight(SPOKE - HUB_HOLD - 30);
  b.mark('viaduct');
  b.section('Into Our Future', { halfWidth: 10, wallHeight: 1.2, surface: 'groove', bridge: true });
  b.straight(2 * HUB_HOLD + 30 - 15);
  b.mark('crest');
  b.section('Yet We Decline', { halfWidth: 10, wallHeight: 1.2, surface: 'groove', bridge: true });
  b.mark('decline');
  b.straight(40);
  b.mark('viaductEnd');
  b.section('Yet We Decline', { halfWidth: 10, wallHeight: 1.2, surface: 'groove' });
  b.straight(SPOKE - HUB_HOLD + 15 - 40 + 70);
  b.mark('declineEnd');

  // Without mercy: right round a loop off the handle, and back over its own way in on a deck.
  b.section('Without Mercy', { halfWidth: 9.5, wallHeight: 1.2, surface: 'groove' });
  b.mark('mercy');
  b.arc(LOOP_R, -200);
  b.mark('deck2');
  b.section('Without Mercy', { halfWidth: 9.5, wallHeight: 1.2, surface: 'groove', bridge: true });
  b.arc(LOOP_R, -70);
  b.straight(LOOP_R + 35);
  b.mark('deck2End');

  // Destroying all: down off the deck, and the road broken off: a leap.
  b.section('Destroying All', { halfWidth: 9.5, wallHeight: 1.2, surface: 'groove' });
  b.mark('destroy');
  b.straight(45).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20);
  b.elevate(0).straight(15);
  b.mark('destroyEnd');

  // Heading for a better thesis: turning for the peak.
  b.section('A Better Thesis', { halfWidth: 10, wallHeight: 1.2, surface: 'groove' });
  b.mark('thesis');
  b.arc(50, -45).straight(10);
  b.mark('thesisEnd');

  // The shivering pilgrims' way, climbing round the shoulder of the peak; the steeper path runs straight up its face.
  b.section('Shivering Pilgrims', { halfWidth: 8, surface: 'groove' });
  b.mark('pilgrims');
  b.straight(5);
  b.mark('pathFrom');
  b.arc(PATH_R, -PATH_TURN);
  // Walled round the shoulder, where the crevasse is on the inside of it.
  b.section('Shivering Pilgrims', { halfWidth: 8, wallHeight: 1.2, surface: 'groove' });
  b.arc(PATH_R, 2 * PATH_TURN);
  b.section('Shivering Pilgrims', { halfWidth: 8, surface: 'groove' });
  b.arc(PATH_R, -PATH_TURN);
  b.mark('pathTo');
  b.section('The Idealistic Reaper', { halfWidth: 10, wallHeight: 1.2, surface: 'groove' });
  b.mark('reaper');
  b.straight(20);
  b.mark('summit');
  b.straight(15);
  b.mark('reaperEnd');

  // With hope to prosper: down off the summit and round onto the first spoke's handle.
  b.section('With Hope to Prosper', { halfWidth: 10, wallHeight: 1.2, surface: 'groove' });
  b.mark('prosper');
  b.turnTo(offsetPose(START, -(FINISH + ALLEGIANCE + OFFER) * K), PROSPER_R);
  b.mark('prosperEnd');
  b.section('What Can We Offer?', { halfWidth: 10, wallHeight: 1.2, surface: 'groove' });
  b.mark('offer');
  b.arc(OFFER_R, OFFER_TURN).arc(OFFER_R, -2 * OFFER_TURN).arc(OFFER_R, OFFER_TURN);
  b.mark('allegiance');
  b.section('Our Allegiance Suffers', { halfWidth: 10, wallHeight: 1.2, surface: 'groove' });
  b.straight(ALLEGIANCE);
  b.mark('home');
  b.section('The Wheel That Steers Us', { halfWidth: 10, surface: 'groove' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  const hub2 = m('stupor', SPOKE);
  const hub3 = m('spoke3', SPOKE);
  // The cut under the hub.
  ease(b, hub2 - 2 * HUB_HOLD * K, 0, hub2 - HUB_HOLD * K, -DEPTH);
  b.profile(hub2 - HUB_HOLD * K, hub2 + HUB_HOLD * K, () => -DEPTH, 10);
  ease(b, hub2 + HUB_HOLD * K, -DEPTH, hub2 + 2 * HUB_HOLD * K, 0);
  // Into our future: up the third spoke onto the top tier, and off its crest.
  ease(b, m('spoke3'), 0, hub3 - HUB_HOLD * K, TOP);
  b.profile(hub3 - HUB_HOLD * K, m('crest'), () => TOP, 10);
  plunge(b, m('crest'), TOP, m('declineEnd', -70), 0);
  // Without mercy: up onto the deck round the loop, and down off it to the leap.
  ease(b, m('mercy', 20), 0, m('deck2'), DECK);
  b.profile(m('deck2'), m('deck2End'), () => DECK, 10);
  ease(b, m('deck2End'), DECK, m('ramp', -5), 0);
  // The pilgrims' climb to the summit, and off its crest.
  ease(b, m('pathFrom'), 0, m('pathTo'), SUMMIT);
  b.profile(m('pathTo'), m('summit'), () => SUMMIT, 10);
  plunge(b, m('summit'), SUMMIT, m('prosper', 60), 0);

  const main = b.finish(true);
  const path = buildSteeperPath(b.marks.pathFrom, b.marks.pathTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  const rows = (s0: number, n: number) => Array.from({ length: n }, (_, k) => s0 + k * ROW * K);
  return {
    id: 'the-wheel',
    name: 'The Wheel',
    main,
    branches: [path.branch],
    pits: [...b.pits, ...path.pits],
    boostPads: [
      { s: at('spoke3', 8), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('destroy', 25), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('reaper', 4), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['asleep', 'unpack', 'relax', 'stupor', 'future', 'crest', 'mercy', 'destroy', 'thesis', 'pilgrims', 'reaper', 'prosper', 'offer'].map((k) => b.marks[k].s / main.length),
    laps: 2,
    bounds: 250,
    landmarks: [
      { kind: 'wheelGate', ribbon: -1, s: 6 },
      // The helm's handles, out past the rim where the road swings off a spoke or onto one.
      ...['unpackEnd', 'stupor', 'stuporEnd', 'spoke3'].map((k) => ({ kind: 'helmHandle' as const, ribbon: -1, s: at(k, 0) })),
      { kind: 'greatWheel', ribbon: -1, s: at('spoke3', 0) },
      { kind: 'pilgrims', ribbon: -1, s: at('pathFrom', 0), to: at('pathTo', 0) },
      // The reaper stands where the road turns round its feet, off the summit, its scythe out over the summit's road.
      { kind: 'reaper', ribbon: -1, s: at('reaperEnd', 0), lateral: -PROSPER_R * K },
      { kind: 'steeperPath', ribbon: 0, s: path.boxes },
    ],
    itemBoxes: [
      { s: at('unpack', 6), count: 4 },
      { s: at('relax', 110), count: 3 },
      { s: at('future', 100), count: 4 },
      { s: at('declineEnd', -25), count: 3 },
      { s: at('thesis', 30), count: 4 },
      { s: at('reaper', 10), count: 3 },
      { s: at('allegiance', 12), count: 4 },
      { s: path.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      // Waves of sleep rolling down the first spoke to the hub, and down the cut under it.
      { kind: 'dozes', at: rows(at('asleep', 10), 3), period: DOZE_PERIOD },
      { kind: 'dozes', at: rows(hub2 - 53 * K, 4), period: DOZE_PERIOD },
    ],
    theme: 'wheel',
    music: { lap: 'the-wheel', finalLap: 'the-wheel-final-lap' },
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

/** The steeper path: the lane in from the foot of the peak before it runs out over the crevasse, and the crevasse. */
const PATH_IN = 40;
export const CREVASSE = 26;

/**
 * The Steeper Path: straight up the peak's face from the foot of the
 * pilgrims' way to the summit, over a crevasse on planks and then up, far
 * steeper than the way round. On the final lap only; on the others the
 * planks are gone, and there's only the crevasse.
 */
function buildSteeperPath(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'The Steeper Path', { halfWidth: 5, surface: 'groove' });
  b.straight(PATH_IN);
  const boxes = b.s + CREVASSE / 2;
  b.bridge(CREVASSE, 7);
  b.straight(chord - b.s);
  ease(b, PATH_IN + CREVASSE, 0, b.s, SUMMIT);
  const branch: BranchDef = { name: 'The Steeper Path', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: ['final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
