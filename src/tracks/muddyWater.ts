import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

/** A pose in map terms: `east` and `north` metres (north is -z), facing a compass bearing in degrees (0 north, 90 east). */
const at = (east: number, north: number, bearing: number): Pose => ({ x: east, z: -north, h: Math.PI - (bearing * Math.PI) / 180 });
const START = at(10, -110, 270);
const FINISH = 45;
/** The helicopter's deck, over the esplanade and the amber coals. */
export const HELI = 10;
/** The boardwalk's two decks: over the river road, and over the river mouth. */
export const MUSCLE = 9;
export const LAGOON_DECK = 8;
/** Stop Breathing and Sink: how deep the road goes under the river mouth, and over how long. */
export const DIVE = 7;
const DIVE_LEN = 120;
const DIVE_RAMP = 25;
/** The ford through the river under the willow: this long. */
const FORD_LEN = 26;
/** The river mouth's lagoon: this far either side of the dive. */
const LAGOON = 35;
/** The Amber Coals' dune: its crest. */
const DUNE = 5;
/** The water's edge (metres north): the sea south of it, the beach north of it up to the dunes. */
export const SHORE = -195;
export const DUNES = -128;
/**
 * The river, from the hills in the north down to its mouth: under the
 * jump, south through the bush, across the road at the ford under the
 * willow, and on south-east into the lagoon at its mouth, which opens to
 * the sea. Map points (east, north).
 */
export const RIVER: [number, number][] = [
  [52, 480],
  [60, 300],
  [70, 210],
  [76, 150],
  [70, 122],
  [56, 100],
  [50, 80],
  [58, 52],
  [88, 22],
  [124, 2],
  [136, -24],
  [142, -70],
  [168, -110],
  [176, -150],
];
/** The sharks' stretch: one comes across the shallows every so often. */
const SHARK_PERIOD = 5.2;
/** Hungry Fishes: the main road swings round the billabong in three arcs of this radius and turn; the ford runs straight through it. */
const BEND_R = 32;
const BEND_TURN = 85;

/**
 * Muddy Water (the Gumboot Soup Cup's first), after Stu's song: a hot,
 * mean Australian summer at the beach, "green grass won't last", a
 * helicopter flying over, shark bait and shark bite, sunburn, leather skin
 * and heat stroke, the dash across the amber coals to meet a sea so cold it
 * freezes him, the salty spray, "I think I'll stop breathing and sink",
 * "I'm a boy, I'm not a buoy", out of his element; and the river he would
 * rather give himself over to, his place that loves him, gum leaves and tea
 * trees, the river immortal: "I prefer the muddy water". He'll jump into
 * the river when you jump into the sea, feel the hungry fishes nibbling at
 * his feet, lie on the driftwood under the willow tree and let the muscle
 * men on the beach bask in their vanity; any day, anyway.
 *
 * The world is a blazing summer coast and the bush river behind it: the
 * beach half hostile (scorching sand, freezing surf, sharks, the
 * shark-spotting helicopter, the flags), the river half the refuge (gum
 * trees, tea trees, the willow over the driftwood, brown water, fish). The
 * lap goes from one to the other and back, the song's way: along the
 * esplanade (two kickers), Green Grass Won't Last's bends round the burnt
 * foreshore lawn, Helicopter Flying Over up onto a deck sweeping round and
 * over the esplanade and the sand, plunging into the shallows; Shark Bait,
 * Shark Bite along a causeway through the surf with the sharks coming
 * across it; Heat Stroke's esses and a hairpin up the beach; the Amber
 * Coals, a dash across the scorching sand over a dune crest and back under
 * the helicopter's deck; So Cold It Freezes Me down into the surf, the
 * Salty Spray along it to the river mouth; Stop Breathing and Sink, the
 * road diving under the muddy water of the lagoon at the river's mouth;
 * I'm Not a Buoy up out of it; I Prefer the Muddy Water up the river
 * through the gums; Jump into the River, a leap across it; Hungry Fishes
 * round the billabong; Under the Willow Tree, a hairpin round the willow
 * and the driftwood; Muscle Men up onto the boardwalk over the river road,
 * down, and up again over the lagoon (and the road diving under it); and
 * Any Day, Anyway home. Shortcut: Give Me Over to the River, a ford
 * straight through the billabong, on the final lap only (the river is up
 * the rest of the race).
 */
export function buildMuddyWater(): TrackDef {
  const b = new TrackBuilder(START, "It's Hot, It's Mean", { halfWidth: 10, surface: 'clay' });
  b.straight(15).mark('kick1').kicker().straight(25).mark('kick2').kicker().straight(20);

  b.section("Green Grass Won't Last", { halfWidth: 9.5, surface: 'clay' });
  b.mark('grass');
  b.arc(30, 15).arc(30, -30).arc(30, 15);
  b.turnTo(at(-100, -5, 90), 45);

  // Up onto the deck, round, and over the esplanade and the sand; off its end, down into the shallows.
  b.section('Helicopter Flying Over', { halfWidth: 9, wallHeight: 1.2, surface: 'clay', bridge: true });
  b.mark('heli');
  b.straight(50).arc(40, -90);
  b.mark('heliDeck');
  b.straight(135);
  b.mark('heliPlunge');
  b.straight(40);
  b.mark('heliEnd');

  b.section('Shark Bait, Shark Bite', { halfWidth: 9, surface: 'clay' });
  b.mark('shark');
  b.arc(25, -90);
  b.mark('sharks');
  b.straight(65);
  b.mark('sharksEnd');

  b.section('Heat Stroke', { halfWidth: 9, surface: 'clay' });
  b.mark('heat');
  b.arc(25, -30).arc(25, 60).arc(25, -30);
  b.turnTo(at(-150, -150, 90), 36);

  b.section('The Amber Coals', { halfWidth: 9.5, surface: 'clay' });
  b.mark('coals');
  b.straight(60 - -150);
  b.mark('coalsEnd');

  b.section('So Cold It Freezes Me', { halfWidth: 9, surface: 'clay' });
  b.mark('cold');
  b.arc(25, -90).straight(45).arc(25, 90);

  b.section('The Salty Spray', { halfWidth: 9, surface: 'clay' });
  b.mark('spray');
  b.straight(35).arc(30, 90);

  // Down under the muddy water of the river mouth, along its bed, and back up.
  b.section('Stop Breathing and Sink', { halfWidth: 8, surface: 'clay' });
  b.mark('sink');
  b.dive(DIVE_LEN, DIVE, DIVE_RAMP, LAGOON);
  b.mark('sinkEnd');

  b.section("I'm Not a Buoy", { halfWidth: 9, surface: 'clay' });
  b.mark('buoy');
  b.straight(25);

  b.section('I Prefer the Muddy Water', { halfWidth: 9.5, surface: 'clay' });
  b.mark('muddy');
  b.arc(40, 20).arc(40, -20);
  b.turnTo(at(110, 150, 270), 45);

  // Over the river, a leap.
  b.section('Jump into the River', { halfWidth: 9.5, surface: 'clay' });
  b.mark('jump');
  b.straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20, 'water');
  b.elevate(0).straight(15);

  // Round the billabong, where the fishes nibble.
  b.section('Hungry Fishes', { halfWidth: 9, surface: 'clay' });
  b.mark('fishes');
  b.straight(5);
  b.mark('fordFrom');
  b.arc(BEND_R, -BEND_TURN);
  // Walled round the top of the bend, where the billabong is on the inside of it.
  b.section('Hungry Fishes', { halfWidth: 9, wallHeight: 1.2, surface: 'clay' });
  b.arc(BEND_R, 2 * BEND_TURN);
  b.section('Hungry Fishes', { halfWidth: 9, surface: 'clay' });
  b.arc(BEND_R, -BEND_TURN);
  b.mark('fordTo');
  b.straight(15);

  b.section('Under the Willow Tree', { halfWidth: 9, surface: 'clay' });
  b.mark('willow');
  b.turnTo(at(-40, 80, 90), 34);
  b.mark('willowLeg');
  b.straight(77);
  // Through the river itself, by the willow: a ford, the brown water running across the road and either side of it.
  b.mark('ford');
  b.bridge(FORD_LEN, 24, 'water', 5);
  b.mark('fordEnd');
  b.straight(7);

  // Up onto the boardwalk over the river road, down, and up again over the river mouth.
  b.section('Muscle Men', { halfWidth: 9.5, wallHeight: 1.2, surface: 'clay', bridge: true });
  b.mark('muscle');
  b.arc(40, -41);
  b.mark('boardwalk');
  b.straight(152.4).arc(40, -49);
  b.mark('east');
  b.section('Muscle Men', { halfWidth: 9.5, surface: 'clay' });
  b.straight(5);
  b.section('Muscle Men', { halfWidth: 9.5, wallHeight: 1.2, surface: 'clay', bridge: true });
  b.mark('pier');
  b.straight(25).arc(40, -90).straight(55);
  b.mark('pierEnd');

  b.section('Any Day, Anyway', { halfWidth: 10, surface: 'clay' });
  b.mark('home');
  b.turnTo(offsetPose(START, -FINISH), 40);
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d;
  // The helicopter's deck: up, along over the esplanade and the sand, and off its end into the shallows.
  ease(b, m('heli'), 0, m('heliDeck'), HELI);
  b.profile(m('heliDeck'), m('heliPlunge'), () => HELI, 10);
  plunge(b, m('heliPlunge'), HELI, m('heliEnd'), 0);
  // The dune in the amber coals: up its face and flying off its crest.
  ease(b, m('coals', 25), 0, m('coals', 75), DUNE);
  plunge(b, m('coals', 75), DUNE, m('coals', 115), 0);
  // The boardwalk: over the river road, down to the bank, and up again over the river mouth.
  ease(b, m('muscle', 10), 0, m('boardwalk', 75), MUSCLE);
  b.profile(m('boardwalk', 75), m('boardwalk', 130), () => MUSCLE, 10);
  ease(b, m('boardwalk', 130), MUSCLE, m('east'), 0);
  ease(b, m('pier'), 0, m('pier', 70), LAGOON_DECK);
  b.profile(m('pier', 70), m('pierEnd'), () => LAGOON_DECK, 10);
  plunge(b, m('pierEnd'), LAGOON_DECK, m('home', 35), 0);

  const main = b.finish(true);
  const ford = buildFord(b.marks.fordFrom, b.marks.fordTo);
  const sharks = [10, 32, 54].map((d) => m('sharks', d));
  return {
    id: 'muddy-water',
    name: 'Muddy Water',
    main,
    branches: [ford.branch],
    pits: [...b.pits, ...ford.pits],
    boostPads: [
      { s: m('coals', 2), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: m('buoy', 4), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: m('willowLeg', 4), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['grass', 'heli', 'heliDeck', 'shark', 'heat', 'coals', 'cold', 'spray', 'sink', 'muddy', 'jump', 'fishes', 'willow', 'muscle', 'east', 'home'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    // Wide, so the map's edge walls are far off across the sea and the bush, lost in the haze.
    bounds: 440,
    landmarks: [
      // Between the flags at the start; the coast itself (the sea, the beach, the river) laid round the lap.
      { kind: 'flagsGate', ribbon: -1, s: 6 },
      { kind: 'coast', ribbon: -1, s: 0 },
      // The shark-spotting helicopter, circling over the shallows.
      { kind: 'sharkCopter', ribbon: -1, s: m('sharks', 40), lateral: 0 },
      // The willow over the driftwood, on the river bank.
      { kind: 'willowTree', ribbon: -1, s: m('ford', -18), lateral: -24 },
      { kind: 'billabong', ribbon: 0, s: ford.boxes },
    ],
    itemBoxes: [
      { s: 75, count: 8 },
      { s: m('heliDeck', 50), count: 3 },
      { s: m('coals', 150), count: 8 },
      { s: m('spray', 12), count: 3 },
      { s: m('muddy', 70), count: 8 },
      { s: m('willowLeg', 30), count: 8 },
      { s: m('pier', 15), count: 3 },
      { s: ford.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [{ kind: 'sharks', at: sharks, period: SHARK_PERIOD }],
    theme: 'muddy',
    music: { lap: 'muddy-water', finalLap: 'muddy-water-final-lap' },
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

/** Give Me Over to the River: the ford's way in, on the bank, before it runs into the water. */
const FORD_IN = 44;

/**
 * Give Me Over to the River: a ford straight through the billabong the
 * main road swings round, water either side, no rails. On the final lap
 * only; on the others the river is up and the ford is under it.
 */
function buildFord(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Give Me Over to the River', { halfWidth: 6, surface: 'clay' });
  b.straight(FORD_IN);
  b.section('My Place That Loves Me', { halfWidth: 4.5, surface: 'clay' });
  const water = chord - 2 * FORD_IN;
  const boxes = b.s + water / 2;
  b.bridge(water, 7, 'water', 6);
  b.section('Give Me Over to the River', { halfWidth: 6, surface: 'clay' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Give Me Over to the River', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: ['final'], shut: { kind: 'flood' } };
  return { branch, pits: b.pits, boxes };
}
