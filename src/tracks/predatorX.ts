import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.1;
const DEG = Math.PI / 180;
/** The root of the tail, where the two flanks cross in an X: the beast's body lies east of it, its tail west. */
const X = { x: -215, z: 0 };
/** The finish line is this far up the north flank past the X (m). */
const START_UP = 40;
const START: Pose = { x: X.x + START_UP * Math.sin(45 * DEG), z: X.z + START_UP * Math.cos(45 * DEG), h: 45 * DEG };
const FINISH = 45;
/** A flipper: the road swings out this far, loops round it at this radius and comes back over the road it went out on. */
const FLIP_SWING = 40;
const FLIP_R = 34;
/** The Apex Bend swings out round a lagoon in three arcs of this radius and turn. */
const LAGOON_R = 34;
const LAGOON_TURN = 70;
/** A waypoint on the beast's outline, in metres, heading in degrees. */
const wp = (x: number, z: number, h: number): Pose => ({ x, z, h: h * DEG });
/** How high the road climbs round the fore flipper onto the Fossil Cliffs. */
const CLIFF_TOP = 15;
/** How high the Ammonite Coil climbs round the hind flipper, over its own road. */
const COIL_TOP = 10;
/** The deck over the X. */
const TAIL_DECK = 9;
/** How deep the Abyssal Cut sinks below the shore. */
const CUT_DEPTH = 6;

/**
 * Predator X (the Omnium Gatherum Cup's finale): a primeval coast where the
 * pliosaur hunts, after the song. The lap is the beast itself seen from
 * above, swimming east: its long body, a flipper sticking out of each side,
 * the snout, and the tail, where the two flanks cross in an X. From Bone
 * Beach up the north flank over the Fossil Flats, vents going off (two
 * kickers among them), then out round the fore flipper and up the Fossil
 * Cliffs, the road looping back over itself 15 m up and plunging off the
 * top; the Cycad Woods along its back, then the Pliosaur Causeway round the
 * snout: a rail-less causeway over its water, a fin circling off one side
 * and then the other before the jaws come up over the edge. Back along the
 * belly down the Abyssal Cut, sunk 6 m, and a jump out of it, round the hind
 * flipper on the Ammonite Coil, climbing over its own road, the Apex Bend
 * swinging out round a lagoon that the Bone Bridge, a spine of vertebrae,
 * crosses straight over (on the final lap it is gone), then up onto the
 * Tail, over the X, round the fluke and back under it to the line.
 */
export function buildPredatorX(): TrackDef {
  const b = new TrackBuilder(START, 'Bone Beach', { halfWidth: 11, surface: 'sand' });
  b.scale = K;
  b.straight(20);
  b.hermiteTo(wp(-110, 150, 90));

  b.section('Fossil Flats', { halfWidth: 10, surface: 'sand' });
  b.mark('flats');
  b.straight(30).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(30);

  // Out round the fore flipper and up the cliffs, back over the road it went out on, and off the top.
  b.section('Fossil Cliffs', { halfWidth: 9, wallHeight: 1.2, surface: 'rock', bridge: true });
  b.mark('cliff');
  flipper(b, 'cliff');
  b.section('Cycad Woods', { halfWidth: 9, surface: 'sand' });
  b.mark('woods');
  b.straight(20).arc(150, 20).arc(150, -20);
  b.hermiteTo(wp(320, 70, 165));

  // Round the snout, the pliosaur's water either side.
  b.section('Pliosaur Causeway', { halfWidth: 9, surface: 'rock' });
  b.mark('causeway');
  b.elevate(0).straight(10).elevate(1.5);
  b.bridge(60, 30, 'water');
  b.elevate(1.5).straight(10).elevate(0);
  b.hermiteTo(wp(210, -150, -90));

  // Back along the belly, down into it, and a jump out.
  b.section('Abyssal Cut', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.mark('cut');
  b.straight(70).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'water');
  b.elevate(0).straight(20);
  b.mark('cutEnd');
  b.straight(15);

  // Round the hind flipper, coiling up over its own road.
  b.section('Ammonite Coil', { halfWidth: 9, wallHeight: 1.2, surface: 'rock', bridge: true });
  b.mark('coil');
  flipper(b, 'coil');
  b.straight(40);

  b.section('Apex Bend', { halfWidth: 9.5, surface: 'sand' });
  b.mark('bend');
  b.straight(5);
  b.mark('boneFrom');
  b.arc(LAGOON_R, -LAGOON_TURN).arc(LAGOON_R, 2 * LAGOON_TURN).arc(LAGOON_R, -LAGOON_TURN);
  b.mark('boneTo');
  b.straight(5);

  // Up over the X, round the fluke and back under it.
  b.section('The Tail', { halfWidth: 9.5, wallHeight: 1.2, surface: 'rock', bridge: true });
  b.mark('tail');
  b.arc(60, 45).straight(90);
  b.mark('tailX');
  b.straight(20);
  b.mark('fluke');
  b.arc(40, -135).straight(10).arc(40, -135);
  b.section('Finish Straight', { halfWidth: 11, surface: 'sand' });
  b.mark('finish');
  b.turnTo(offsetPose(START, -FINISH * K), 50);
  b.straight(FINISH);

  // Heights, over the layout: dunes on the flats, the cliff and its plunge, a rise in the woods, the cut before the gap, the coil, the tail deck.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(10, m('flats', -5), (u) => 1.5 * Math.sin(Math.PI * u) ** 2);
  ease(b, m('cliffLoop'), 0, m('cliffTop'), CLIFF_TOP - 3);
  ease(b, m('cliffTop'), CLIFF_TOP - 3, m('cliffEnd', 10), CLIFF_TOP);
  plunge(b, m('cliffEnd', 10), CLIFF_TOP, m('woods', 85), 0);
  b.profile(m('woods', 95), m('causeway', -10), (u) => 3 * Math.sin(Math.PI * u) ** 2);
  ease(b, m('cut', 10), 0, m('cut', 30), -CUT_DEPTH);
  ease(b, m('cut', 30), -CUT_DEPTH, m('ramp'), 0);
  ease(b, m('coilLoop'), 0, m('coilTop'), COIL_TOP);
  b.profile(m('coilTop'), m('coilEnd', 5), () => COIL_TOP, 10);
  ease(b, m('coilEnd', 5), COIL_TOP, m('bend'), 0);
  ease(b, m('tail', 5), 0, m('tailX', -60), TAIL_DECK);
  b.profile(m('tailX', -60), m('tailX', 60), () => TAIL_DECK, 10);
  ease(b, m('tailX', 60), TAIL_DECK, m('finish'), 0);

  const main = b.finish(true);
  const bone = buildBoneBridge(b.marks.boneFrom, b.marks.boneTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'predator-x',
    name: 'Predator X',
    main,
    branches: [bone.branch],
    pits: [...b.pits, ...bone.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('cliffEnd', 5), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('cut', 50), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['flats', 'cliff', 'woods', 'causeway', 'cut', 'coil', 'bend', 'tail'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'jawsGate', ribbon: -1, s: 6 },
      { kind: 'jawsGate', ribbon: -1, s: at('bend', 2) },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('flats', 20), count: 4 },
      { s: at('woods', 40), count: 3 },
      { s: at('cut', 50), count: 3 },
      { s: at('bend', 45), count: 4 },
      { s: bone.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'geysers', at: [at('flats', 20), at('flats', 90)], period: 4.5 },
      { kind: 'jaws', at: [at('causeway', 22), at('causeway', 50), at('causeway', 74)], period: 4 },
    ],
    theme: 'primeval',
    music: { lap: 'predator-x', finalLap: 'predator-x-final-lap' },
  };
}

/** A flipper: out to one side, round in a loop and back over the road it went out on, marking `name`Loop, `name`Top and `name`End. */
function flipper(b: TrackBuilder, name: string): void {
  b.arc(FLIP_SWING * 2, -FLIP_SWING);
  b.mark(`${name}Loop`);
  b.arc(FLIP_R, -(360 - 2 * FLIP_SWING));
  b.mark(`${name}Top`);
  b.arc(FLIP_SWING * 2, -FLIP_SWING);
  b.mark(`${name}End`);
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
 * The Bone Bridge: the spine of something enormous, straight across the
 * lagoon the Apex Bend swings round. No rails.
 */
function buildBoneBridge(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Bone Bridge', { halfWidth: 6, surface: 'sand' });
  b.straight(30);
  b.section('Bone Bridge Spine', { halfWidth: 4, surface: 'boards' });
  b.elevate(0).straight(12).elevate(1);
  const lagoon = chord - 2 * b.s;
  const boxes = b.s + lagoon / 2;
  b.bridge(lagoon, 7, 'water');
  b.elevate(1).straight(12).elevate(0);
  b.section('Bone Bridge', { halfWidth: 6, surface: 'sand' });
  b.straight(chord - b.s);
  // Something takes it on the final lap.
  const branch: BranchDef = { name: 'Bone Bridge', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [1, 2], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
