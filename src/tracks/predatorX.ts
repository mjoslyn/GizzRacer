import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const DEG = Math.PI / 180;
/** Each jaw's outer edge opens off the snout at this angle to the centreline (degrees). */
const JAW_ANGLE = 22;
/** How thick a jaw is, centreline to centreline: the hairpin round each tip has half this radius. */
const JAW = 68;
/** The snout's point, where the two outer edges would meet. */
const SNOUT = { x: -270, z: 0 };
/** The line is this far up the upper jaw's outer edge from the snout's point (m). */
const START_UP = 276;
const START: Pose = {
  x: SNOUT.x + START_UP * Math.cos(JAW_ANGLE * DEG),
  z: SNOUT.z + START_UP * Math.sin(JAW_ANGLE * DEG),
  h: -(90 + JAW_ANGLE) * DEG,
};
const FINISH = 45;
/** The Dorsal Fin: the upper jaw's back bulges out round a lagoon in three arcs of this radius and turn. */
const LAGOON_R = 34;
const LAGOON_TURN = 70;
/** How high the road climbs onto the Fossil Cliffs. */
const CLIFF_TOP = 15;
/** How deep the Abyssal Cut sinks below the shore. */
const CUT_DEPTH = 6;

/**
 * Predator X (the Omnium Gatherum Cup's finale): a primeval coast where the
 * pliosaur hunts, after the song. The lap is its open jaws seen from above:
 * two long jaws meeting at a pointed snout and gaping wide at the other end,
 * the road out along the outside of one and back along the inside, into
 * the throat and out along the other. Along Bone Beach and the Fossil Flats
 * on the upper jaw's back, vents going off (two kickers among them), round
 * the snout and up the lower jaw onto the Fossil Cliffs and off the top,
 * through the Cycad Woods and round the lower jaw's tip, then the Pliosaur
 * Causeway back along the inside of the jaw: a rail-less causeway over its
 * water, a fin circling off one side and then the other before the jaws
 * come up over the edge. The Abyssal Cut sunk 6 m round the throat and a
 * jump out of it along the upper jaw's inside, the Apex Bend round its tip,
 * and the Dorsal Fin, where the upper jaw's back bulges out round a lagoon
 * that the Bone Bridge, a spine of vertebrae, crosses straight over. On the
 * final lap it is gone.
 */
export function buildPredatorX(): TrackDef {
  const b = new TrackBuilder(START, 'Bone Beach', { halfWidth: 11, surface: 'sand' });
  b.scale = K;
  // The snout and the throat turn through the same angle, one each way.
  const point = 180 - 2 * JAW_ANGLE;
  b.straight(40);

  b.section('Fossil Flats', { halfWidth: 10, surface: 'sand' });
  b.mark('flats');
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(35);

  // Round the snout and up the lower jaw onto the cliffs, then off the top.
  b.section('Fossil Cliffs', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.mark('cliff');
  b.arc(36, -point).straight(150).mark('cliffTop').straight(70);
  b.section('Cycad Woods', { halfWidth: 9, surface: 'sand' });
  b.mark('woods');
  b.straight(84).arc(JAW / 2, -180);

  // Back along the inside of the lower jaw, the pliosaur's water either side.
  b.section('Pliosaur Causeway', { halfWidth: 9, surface: 'rock' });
  b.mark('causeway');
  b.elevate(0).straight(10).elevate(1.5);
  b.bridge(60, 30, 'water');
  b.elevate(1.5).straight(10).elevate(0);

  // Down into the throat, and out along the inside of the upper jaw.
  b.section('Abyssal Cut', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.mark('cut');
  b.straight(77).arc(30, point).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'water');
  b.elevate(0).straight(20);
  b.straight(128);

  // Round the upper jaw's tip and back along its top, past the fin.
  b.section('Apex Bend', { halfWidth: 9.5, surface: 'sand' });
  b.mark('bend');
  b.arc(JAW / 2, -180).straight(5);
  b.mark('boneFrom');
  b.arc(LAGOON_R, LAGOON_TURN).arc(LAGOON_R, -2 * LAGOON_TURN).arc(LAGOON_R, LAGOON_TURN);
  b.mark('boneTo');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'sand' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: dunes on the flats, the cliff and its plunge, a rise in the woods, the cut before the gap.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(10, m('flats', -5), (u) => 1.5 * Math.sin(Math.PI * u) ** 2);
  ease(b, m('cliff'), 0, m('cliffTop'), CLIFF_TOP);
  plunge(b, m('cliffTop'), CLIFF_TOP, m('cliffTop', 70), 0);
  ease(b, m('woods', 10), 0, m('woods', 35), 5);
  plunge(b, m('woods', 35), 5, m('woods', 60), 0);
  b.profile(m('woods', 70), m('woods', 160), (u) => 2.5 * Math.sin(Math.PI * u) ** 2);
  ease(b, m('cut', 10), 0, m('cut', 30), -CUT_DEPTH);
  ease(b, m('cut', 30), -CUT_DEPTH, m('ramp'), 0);
  b.profile(m('boneTo', 40), m('finish', -10), (u) => 4 * Math.sin(Math.PI * u) ** 2);

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
      { s: at('flats', 100), length: 8, lateral: 3, halfWidth: 2.5 },
      { s: at('cut', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['flats', 'cliff', 'woods', 'causeway', 'cut', 'bend'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'jawsGate', ribbon: -1, s: 6 },
      { kind: 'jawsGate', ribbon: -1, s: at('bend', 2) },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('flats', 20), count: 4 },
      { s: at('woods', 50), count: 3 },
      { s: at('cut', 50), count: 3 },
      { s: at('bend', 45), count: 4 },
      { s: bone.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'geysers', at: [at('flats', 25), at('flats', 100)], period: 4.5 },
      { kind: 'jaws', at: [at('causeway', 22), at('causeway', 50), at('causeway', 74)], period: 4 },
    ],
    theme: 'primeval',
    music: { lap: 'predator-x', finalLap: 'predator-x-final-lap' },
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
