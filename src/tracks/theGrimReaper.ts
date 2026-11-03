import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.0;
const deg = (d: number) => (d * Math.PI) / 180;
/** The snath: the scythe's long handle, a straight road up the map from its butt to the heel, where the blade is fixed on. */
const SNATH_HEADING = 22;
const START: Pose = { x: -195, z: -165, h: deg(SNATH_HEADING) };
const FINISH = 40;
/** Up the snath: past the chimneys, then the gate keeper's stretch, over the hellhound pit on a bridge, up to the heel. */
const CHIMNEYS = 58;
const GATE_BRIDGE = 70;
const TO_HEEL = 154;
/** The blade: its back a long sweep round to the point, a hairpin round the point, and back along its edge. */
export const BLADE_R = 110;
const BLADE_TURN = 120;
const POINT_R = 28;
const POINT_TURN = 165;
const EDGE_R = 100;
const EDGE_TURN = 50;
/** Like a Hurricane: the blade's edge comes back up onto a deck this high, straight back over the snath below the heel. */
export const DECK = 9;
const EDGE_RUN = 20;
const DECK_RUN = 100;
/** The hellhound pit: sunk this deep between its walls. */
export const DEPTH = 7;
const PIT_WALL = 6;
const PIT = 240;
const PIT_EASE = 40;
/** Down into it from the turn before it, deep by this far along it, before the snath's bridge. */
const PIT_IN = 18;
/** Existential Crisis: the road wavers out and back round the grave, on bends of this radius and turn; Time Is Priceless runs straight across. */
const CRISIS_R = 40;
const CRISIS_TURN = 68;
/** Heaven Sent the Silhouette: up onto a ridge this high, off its crest into the fortress. */
export const RIDGE = 7;
/** The stench orbits the homestead: a loop of this radius round it, up on a deck this high where it comes back over its own way in. */
const ORBIT_R = 45;
export const ORBIT_DECK = 9;
/** Body bags on the hills: two of them, this high. */
const HILL = 3;
const ORBIT_OUT = 80;
/** The reaper stands this far round the blade's back and this far inside it, in the crook of it, nearer the point. */
const REAPER_AT = 155;
const REAPER_OFF = 32;
/** The hellhounds run every this many seconds. */
export const HOUND_PERIOD = 4.4;

/**
 * The Grim Reaper (the All Stars Cup #1's third, from Omnium Gatherum,
 * 2022): Ambrose, as Shrimpomaniac, raps as the reaper himself over
 * slowed-down samples cut out of a dollar-bin record. His collection night
 * on a dusty, sun-scorched frontier: chimneys he sweeps, the gate he keeps,
 * the hellhounds' pit, the bank where he cashes the cheque, the fortress
 * of the wicked, the body bags on the hills and the homestead the stench
 * orbits. The lap is his scythe, seen from above: the snath a straight road
 * up the map from its butt, the blade a long sweeping curve round to its
 * point and back along its edge, crossing back over the snath on a deck
 * below the heel. I'm the Grim Reaper (two kickers) up the snath, Chimney
 * Sweeper past the chimneys, Gate Keeper through the gate on a bridge over
 * the hellhound pit; Faster Than a Cheetah round the blade's back,
 * Point-Blank Range round its point, Like a Hurricane back along its edge
 * and onto the deck over the snath; Scratching for Scraps' esses, Sipping on
 * Cactus, Unburied Hatchets' leap; The Hellhounds, sunk in their pit
 * between walls, under the snath, the pack bursting out of its dens across
 * the road; Existential Crisis wavering round the open grave (Time Is
 * Priceless straight across it on planks, on the final lap only); Cashes
 * the Cheque round the bank; Heaven Sent the Silhouette up onto a ridge and
 * off its crest; Whiplash in the Fortress; Body Bags on the Hills; The
 * Stench Orbits the Homestead, a loop right round it and back over its own
 * way in on a deck; and Came to Collect His Debt, home round the butt.
 */
export function buildTheGrimReaper(): TrackDef {
  const b = new TrackBuilder(START, "I'm the Grim Reaper", { halfWidth: 10, surface: 'cinder' });
  b.scale = K;

  // I'm the grim reaper: up the snath from its butt, two kickers.
  b.straight(10).mark('kick1').kicker().straight(14).mark('kick2').kicker();
  b.straight(25);
  // Chimney sweeper: past the chimney stacks.
  b.section('Chimney Sweeper', { halfWidth: 10, wallHeight: 1.2, surface: 'cinder' });
  b.mark('chimney');
  b.straight(CHIMNEYS);
  // Gate keeper: through his gate, on a bridge over the hellhound pit, and on up to the heel.
  b.mark('gate');
  b.section('Gate Keeper', { halfWidth: 10, wallHeight: 1.2, surface: 'cinder', bridge: true });
  b.straight(GATE_BRIDGE);
  b.mark('gateBridgeEnd');
  b.section('Gate Keeper', { halfWidth: 10, wallHeight: 1.2, surface: 'cinder' });
  b.straight(TO_HEEL);
  b.mark('heel');

  // The blade: round its back, faster than a cheetah, to the point.
  b.section('Faster Than a Cheetah', { halfWidth: 10, wallHeight: 1.2, surface: 'cinder' });
  b.mark('cheetah');
  b.arc(BLADE_R, BLADE_TURN);
  b.section('Point-Blank Range', { halfWidth: 9.5, wallHeight: 1.2, surface: 'cinder' });
  b.mark('point');
  b.arc(POINT_R, POINT_TURN);
  // Back along the edge, coming at ya like a hurricane, and up onto the deck back over the snath.
  b.section('Like a Hurricane', { halfWidth: 10, wallHeight: 1.2, surface: 'cinder' });
  b.mark('hurricane');
  b.arc(EDGE_R, -EDGE_TURN);
  b.straight(EDGE_RUN);
  b.mark('deck1');
  b.section('Like a Hurricane', { halfWidth: 10, wallHeight: 1.2, surface: 'cinder', bridge: true });
  b.straight(DECK_RUN);
  b.mark('deck1End');

  // Scratching around for scraps: back and forth like a record scratched, down off the deck.
  b.section('Scratching for Scraps', { halfWidth: 9.5, wallHeight: 1.2, surface: 'cinder' });
  b.mark('scraps');
  b.arc(30, -35).arc(30, 70).arc(30, -70).arc(30, 35);
  b.section('Sipping on Cactus', { halfWidth: 10, wallHeight: 1.2, surface: 'cinder' });
  b.mark('cactus');
  b.arc(32, -90);
  // Unburied hatchets: a leap over the ditch they were dug up from.
  b.section('Unburied Hatchets', { halfWidth: 10, wallHeight: 1.2, surface: 'cinder' });
  b.mark('hatchets');
  b.straight(15).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20);
  b.elevate(0).straight(15);

  // The hellhounds: round and down into their pit, under the snath.
  b.section('The Hellhounds', { halfWidth: 10, wallHeight: PIT_WALL, surface: 'cinder' });
  b.mark('pitIn');
  b.arc(30, -80);
  b.mark('hounds');
  b.straight(PIT);
  b.mark('houndsEnd');

  // An existential crisis: the road wavers out round the open grave and back; time is priceless, straight across it.
  // Open where the lane leaves and rejoins it, walled round the far side.
  b.section('Existential Crisis', { halfWidth: 10, surface: 'cinder' });
  b.mark('crisis');
  b.straight(5);
  b.mark('graveFrom');
  b.arc(CRISIS_R, -CRISIS_TURN);
  b.section('Existential Crisis', { halfWidth: 10, wallHeight: 1.2, surface: 'cinder' });
  b.arc(CRISIS_R, 2 * CRISIS_TURN);
  b.section('Existential Crisis', { halfWidth: 10, surface: 'cinder' });
  b.arc(CRISIS_R, -CRISIS_TURN);
  b.mark('graveTo');
  b.straight(5);
  b.section('Cashes the Cheque', { halfWidth: 10, wallHeight: 1.2, surface: 'cinder' });
  b.mark('cheque');
  b.arc(40, 80);
  b.section('Heaven Sent the Silhouette', { halfWidth: 10, wallHeight: 1.2, surface: 'cinder' });
  b.mark('silhouette');
  b.straight(30);
  b.mark('crest');
  b.section('Whiplash in the Fortress', { halfWidth: 9.5, wallHeight: 1.2, surface: 'cinder' });
  b.mark('fortress');
  b.arc(30, 60).arc(25, -60).arc(30, 60);
  b.mark('fortressEnd');
  b.section('Body Bags on the Hills', { halfWidth: 10, wallHeight: 1.2, surface: 'cinder' });
  b.mark('hills');
  b.arc(80, 43);
  b.straight(120);
  b.mark('hillsEnd');
  b.section('The Stench Orbits the Homestead', { halfWidth: 10, wallHeight: 1.2, surface: 'cinder' });
  b.mark('homestead');
  b.arc(ORBIT_R, 100);
  b.mark('orbitDeck');
  b.section('The Stench Orbits the Homestead', { halfWidth: 10, wallHeight: 1.2, surface: 'cinder', bridge: true });
  b.arc(ORBIT_R, 170);
  b.mark('orbitOut');
  b.straight(ORBIT_OUT - 10);
  b.mark('orbitDeckEnd');
  b.section('The Stench Orbits the Homestead', { halfWidth: 10, wallHeight: 1.2, surface: 'cinder' });
  b.straight(10);
  b.arc(30, 90);
  b.mark('debt');
  b.section('Came to Collect His Debt', { halfWidth: 10, wallHeight: 1.2, surface: 'cinder' });
  b.arc(70, -25).arc(70, 50).arc(70, -25);
  b.turnTo(offsetPose(START, -FINISH * K), 35);
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // Like a hurricane: up the blade's edge onto the deck, back over the snath, and down off it through the scraps.
  ease(b, m('hurricane', 10), 0, m('deck1'), DECK);
  b.profile(m('deck1'), m('deck1End'), () => DECK, 10);
  ease(b, m('deck1End'), DECK, m('cactus', -5), 0);
  // The hellhound pit.
  ease(b, m('pitIn', 5), 0, m('hounds', PIT_IN), -DEPTH);
  b.profile(m('hounds', PIT_EASE), m('houndsEnd', -PIT_EASE), () => -DEPTH, 10);
  ease(b, m('houndsEnd', -PIT_EASE), -DEPTH, m('houndsEnd'), 0);
  // Heaven sent the silhouette: up onto the ridge against the sky, and off its crest into the fortress.
  ease(b, m('cheque', 10), 0, m('crest'), RIDGE);
  plunge(b, m('crest'), RIDGE, m('fortress', 75), 0);
  // Body bags on the hills: over two of them.
  b.profile(m('hills', 15), m('hillsEnd', -75), (u) => HILL * Math.sin(2 * Math.PI * u) ** 2, 3);
  // The stench orbits the homestead: up round it onto the deck, back over its own way in, and down.
  ease(b, m('homestead', 15), 0, m('orbitDeck', 40), ORBIT_DECK);
  b.profile(m('orbitDeck', 40), m('orbitDeckEnd'), () => ORBIT_DECK, 10);
  ease(b, m('orbitDeckEnd'), ORBIT_DECK, m('debt', 40), 0);

  const main = b.finish(true);
  const grave = buildTimeIsPriceless(b.marks.graveFrom, b.marks.graveTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'the-grim-reaper',
    name: 'The Grim Reaper',
    main,
    branches: [grave.branch],
    pits: [...b.pits, ...grave.pits],
    boostPads: [
      { s: at('gateBridgeEnd', 30), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('cheetah', 150), length: 8, lateral: 3, halfWidth: 2.5 },
      { s: at('houndsEnd', -20), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['chimney', 'gate', 'cheetah', 'point', 'hurricane', 'scraps', 'cactus', 'hatchets', 'hounds', 'crisis', 'cheque', 'fortress', 'homestead', 'debt'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 300,
    landmarks: [
      { kind: 'scytheGate', ribbon: -1, s: 6 },
      { kind: 'chimneys', ribbon: -1, s: at('chimney', 4), to: at('gate', -6) },
      // The keeper's gate stands on the bridge, the hellhound pit under it.
      { kind: 'keeperGate', ribbon: -1, s: at('gate', GATE_BRIDGE / 2) },
      // The reaper himself, in the crook of his blade, rapping over his turntables.
      { kind: 'reaperMC', ribbon: -1, s: at('cheetah', REAPER_AT), lateral: -REAPER_OFF },
      // The sun going down behind the wicked men, straight ahead up the ridge.
      { kind: 'wickedSun', ribbon: -1, s: at('silhouette', 0) },
      { kind: 'chequeBank', ribbon: -1, s: at('cheque', 28), lateral: -(40 * K) },
      { kind: 'fortress', ribbon: -1, s: at('fortress', 0), to: at('fortressEnd', 0) },
      { kind: 'bodyBags', ribbon: -1, s: at('hills', 10), to: at('hillsEnd', -70) },
      // The homestead in the middle of the loop that orbits it.
      { kind: 'homestead', ribbon: -1, s: at('homestead', 0), lateral: -ORBIT_R * K },
      { kind: 'openGrave', ribbon: 0, s: grave.boxes },
    ],
    itemBoxes: [
      { s: at('chimney', 30), count: 4 },
      { s: at('cheetah', 110), count: 3 },
      { s: at('hurricane', 30), count: 4 },
      { s: at('cactus', 10), count: 3 },
      { s: at('hounds', 55), count: 4 },
      { s: at('graveTo', -15), count: 3 },
      { s: at('fortressEnd', 15), count: 4 },
      { s: at('debt', 60), count: 4 },
      { s: grave.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      // Packs of hellhounds crossing their pit, one after another down it, past the gate keeper's bridge.
      { kind: 'hellhounds', at: [95, 135, 175].map((d) => at('hounds', d)), period: HOUND_PERIOD },
    ],
    theme: 'grimreaper',
    music: { lap: 'the-grim-reaper', finalLap: 'the-grim-reaper-final-lap' },
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

/** Time Is Priceless: the lane in from the foot of the crisis before it runs out over the open grave, and the grave. */
const GRAVE_IN = 50;
export const GRAVE = 24;

/**
 * Time Is Priceless: straight across the middle of the existential
 * crisis, a narrow lane over the open grave on planks. On the final lap
 * only, when time is priceless; on the others the planks are gone, and
 * there's only the grave.
 */
function buildTimeIsPriceless(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Time Is Priceless', { halfWidth: 5, surface: 'cinder' });
  b.straight(GRAVE_IN);
  const boxes = b.s + GRAVE / 2;
  b.bridge(GRAVE, 7);
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Time Is Priceless', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: ['final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
