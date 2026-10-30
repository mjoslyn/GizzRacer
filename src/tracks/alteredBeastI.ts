import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1;
/** A waypoint on the lap, in builder units. */
const wp = (x: number, z: number, h: number): Pose => ({ x: x * K, z: z * K, h });
const START: Pose = wp(60, -238, -Math.PI / 2);
const FINISH = 45;
/** The Mushroom Cloud: up to this crest, over the beast's trampled path, and flown off. */
const CLOUD = 13;
/** In My Dreams floats over the meadow on a deck this high. */
const DREAM = 9;
/** How deep the beast has trampled its path into the earth, and the walls of it. */
const DEPTH = 7;
const WALL = 6;
/** By the Tree: the hairpin round the lone tree, this tight. */
const TREE_R = 36;
/** By the Creek swings out round a bend in the creek in three arcs of this radius and turn; Take a Peek runs straight along the creek bed. */
const CREEK_R = 44;
const CREEK_TURN = 70;
/** Unsteady Gait: this many lurching steps, one way and the other. */
const STEPS = 6;
/** Alter Me: a loop this tight, round and back over itself on a deck this high. */
const LOOP_R = 40;
const LOOP_DECK = 9;

/**
 * Altered Beast I (the Altered Beast Cup's first), after the suite that
 * opens Murder of the Universe, A New World run into Altered Beast I and
 * Alter Me I: as soon as the dust settles there is a new world where the
 * old one had been, "dry crusted mud", the whistle of the wind, memories
 * blown up in a mushroom cloud; and by the meadow a brute like a bear with
 * a long dark shadow. "I think I see an altered beast", by the tree, by
 * the creek, in my dreams; "half made of man, half of bear"; with an
 * unsteady gait it tramples the earth, your feet stuck to the terrain,
 * making dust out of stone; and a part of you wants to be altered too,
 * "altered beast, alter me". Leah Senior tells it. The world is that new
 * world: cracked mud flats under a bruised dusk, pools in the mud, the
 * ruins of the old world, a meadow and a creek, one tree, the cloud still
 * standing on the horizon. The lap is the narrator's walk and the beast's
 * path: out of the ruins (two kickers), Dust Settles climbing through esses
 * onto the Mushroom Cloud, a ridge 13 m up over the trampled path, and
 * flown off; By the Meadow, I Think I See along the top, the hairpin round
 * the tree, By the Creek swinging round a bend in it; In My Dreams floating
 * on a deck back over the meadow, Unsteady Gait lurching down the far side;
 * then Tramples the Earth, the beast's path sunk 7 m between walls of mud,
 * its footfalls ringing across it, under the Mushroom Cloud; Dust out of
 * Stone, a leap over a rift; and Alter Me, a loop round and back over
 * itself, as the chant keeps coming back, and down home. Shortcut: Take a
 * Peek, straight along the creek bed, under water on the first lap and
 * there from the second.
 */
export function buildAlteredBeastI(): TrackDef {
  const b = new TrackBuilder(START, 'A New World', { halfWidth: 11, surface: 'crust' });
  b.scale = K;
  b.straight(30).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(60);

  // As soon as the dust settles: esses out of the ruins, climbing.
  b.section('Dust Settles', { halfWidth: 10.5, surface: 'crust' });
  b.mark('dust');
  b.arc(60, 90);
  b.arc(40, -30).arc(40, 60).arc(40, -30);
  // Memories blown up in a mushroom cloud: a ridge high over the beast's path, and flown off.
  b.section('Mushroom Cloud', { halfWidth: 10, wallHeight: 1.2, surface: 'crust', bridge: true });
  b.mark('cloud');
  b.arc(260, -12).arc(260, 24).arc(260, -12);

  b.section('By the Meadow', { halfWidth: 10.5, surface: 'crust' });
  b.mark('meadow');
  b.arc(80, 90);
  b.arc(200, -15).arc(200, 15);
  b.section('I Think I See', { halfWidth: 10, surface: 'crust' });
  b.mark('see');
  b.straight(150);
  // By the tree: a hairpin round it, the beast's shadow beside it.
  b.section('By the Tree', { halfWidth: 9.5, wallHeight: 1.2, surface: 'crust' });
  b.mark('tree');
  b.arc(TREE_R, 180);
  b.mark('treeEnd');
  // By the creek: swinging out round a bend in it.
  b.section('By the Creek', { halfWidth: 10.5, surface: 'crust' });
  b.mark('creek');
  b.straight(20);
  b.mark('peekFrom');
  b.arc(CREEK_R, -CREEK_TURN).arc(CREEK_R, 2 * CREEK_TURN).arc(CREEK_R, -CREEK_TURN);
  b.mark('peekTo');
  b.straight(35);
  // In my dreams: floating on a deck back over the meadow.
  b.section('In My Dreams', { halfWidth: 10, wallHeight: 1.2, surface: 'crust', bridge: true });
  b.mark('dreams');
  b.arc(250, -12).arc(250, 24).arc(250, -12);
  b.mark('dreamsEnd');
  // With an unsteady gait the critter moves forth: lurching, one way and the other.
  b.section('Unsteady Gait', { halfWidth: 9.5, wallHeight: 1.2, surface: 'crust' });
  b.mark('gait');
  b.arc(45, -90);
  for (let k = 0; k < STEPS; k++) b.arc(30, k % 2 ? 20 : -20).straight(6);
  b.arc(45, -90);
  b.mark('gaitEnd');

  // The beast's path, trampled into the earth between walls of mud, under the Mushroom Cloud.
  b.section('Tramples the Earth', { halfWidth: 9, wallHeight: WALL, surface: 'crust' });
  b.mark('trample');
  b.arc(370, 10).arc(370, -20).arc(370, 10);
  b.mark('trampleEnd');
  // Making dust out of stone: a leap over a rift.
  b.section('Dust out of Stone', { halfWidth: 9.5, wallHeight: 1.2, surface: 'crust' });
  b.mark('stone');
  b.straight(15).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20);
  b.elevate(0).straight(25);
  b.mark('stoneEnd');
  // Altered beast, alter me: round a loop and back over itself, and down off it home.
  b.section('Alter Me', { halfWidth: 10, wallHeight: 1.2, surface: 'crust', bridge: true });
  b.mark('alter');
  b.straight(62);
  b.arc(LOOP_R, -270);
  b.mark('alterEnd');
  b.straight(30);
  b.turnTo(offsetPose(START, -FINISH * K), 45);
  b.section('Finish Straight', { halfWidth: 11, surface: 'crust' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // The road runs in tiers where it crosses itself: the Mushroom Cloud's ridge over the trampled path,
  // In My Dreams over the meadow where the cloud comes down into it, and Alter Me over its own way in.
  ease(b, m('dust', 40), 0, m('cloud', -10), CLOUD);
  b.profile(m('cloud', -10), m('cloud', 100), () => CLOUD, 10);
  plunge(b, m('cloud', 100), CLOUD, m('cloud', 190), 0);
  ease(b, m('dreams', -10), 0, m('dreams', 60), DREAM);
  b.profile(m('dreams', 60), m('dreams', 150), () => DREAM, 10);
  plunge(b, m('dreams', 150), DREAM, m('dreamsEnd'), 0);
  ease(b, m('trample', 5), 0, m('trample', 40), -DEPTH);
  b.profile(m('trample', 40), m('trampleEnd', -35), () => -DEPTH, 10);
  ease(b, m('trampleEnd', -35), -DEPTH, m('trampleEnd'), 0);
  ease(b, m('alter', 70), 0, m('alterEnd'), LOOP_DECK);
  b.profile(m('alterEnd'), m('alterEnd', 75), () => LOOP_DECK, 10);
  plunge(b, m('alterEnd', 75), LOOP_DECK, m('alterEnd', 150), 0);

  const main = b.finish(true);
  const peek = buildTakeAPeek(b.marks.peekFrom, b.marks.peekTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'altered-beast-i',
    name: 'Altered Beast I',
    main,
    branches: [peek.branch],
    pits: [...b.pits, ...peek.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('meadow', 130), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('alter', 5), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['dust', 'cloud', 'meadow', 'see', 'tree', 'creek', 'dreams', 'gait', 'trample', 'stone', 'alter'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 320,
    landmarks: [
      { kind: 'newWorldGate', ribbon: -1, s: 6 },
      { kind: 'newWorldGate', ribbon: -1, s: at('trample', -2) },
      // The tree in the hairpin, at its middle.
      { kind: 'beastTree', ribbon: -1, s: at('tree', (Math.PI * TREE_R) / 2), lateral: -TREE_R * K },
      // The cloud still standing far off over the meadow, where you think you see.
      { kind: 'mushroomCloud', ribbon: -1, s: at('see', 50), lateral: 420 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('meadow', 60), count: 4 },
      { s: at('see', 60), count: 3 },
      { s: at('dreams', 80), count: 3 },
      { s: at('trample', 120), count: 3 },
      { s: peek.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      // The beast's footfalls down its path, coming closer.
      { kind: 'stomps', at: [at('trample', 60), at('trample', 105), at('trample', 150), at('trample', 195)], period: 4.4 },
      { kind: 'stomps', at: [at('gait', 110), at('gait', 150)], period: 4.8 },
    ],
    theme: 'newworld',
    music: { lap: 'altered-beast-i', finalLap: 'altered-beast-i-final-lap' },
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

/** Take a Peek runs this far along the bank at each end, either side of the creek bed. */
const SHORE = 55;

/**
 * Take a Peek: straight along the bed of the creek that By the Creek
 * swings round, no rails, the water either side. On the first lap the
 * creek is up and the bed under it; from the second it has gone down.
 */
function buildTakeAPeek(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Take a Peek', { halfWidth: 6, surface: 'crust' });
  b.straight(SHORE);
  b.section('Creek Bed', { halfWidth: 5, surface: 'crust' });
  const bed = chord - 2 * SHORE;
  const boxes = b.s + bed / 2;
  b.bridge(bed, 7, 'water');
  b.section('Take a Peek', { halfWidth: 6, surface: 'crust' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Take a Peek', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2, 'final'], shut: { kind: 'flood' } };
  return { branch, pits: b.pits, boxes };
}
