import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: -110 * K, z: -150 * K, h: Math.PI / 2 };
const FINISH = 45;
/** The Circling Bend: the road swings out round a gulch in three arcs of this radius and turn. */
const BEND_R = 34;
const BEND_TURN = 70;
/** The Thermal Spiral's radius, and the top of it. */
const SPIRAL_R = 26;
const SPIRAL_TOP = 15;
/** How deep Bone Gully is sunk. */
const GULLY_DEPTH = 6;
/** The ribs along Ribcage Run. */
const RIBS = 4;

/**
 * People-Vultures (the Nonagon Infinity Cup's third), after the song: a
 * dry lake under a bruised sky, the birds circling. Down Carcass Straight
 * (two kickers) under a gate of vulture totems, through the Scavenger
 * Bend, up the Thermal Spiral the way a vulture rides a thermal, a full
 * turn to 15 m over its own start, and The Swoop off the top. Ribcage Run
 * between ribs 4 m tall, Bone Gully sunk 6 m with vultures diving at the
 * road, the Gizzard Leap over a gulch and the Circling Bend round another,
 * which the Carrion Bridge, a span of bones, crosses straight over until
 * the birds pick it clean on the final lap.
 */
export function buildPeopleVultures(): TrackDef {
  const b = new TrackBuilder(START, 'Carcass Straight', { halfWidth: 11, surface: 'scorched' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(70);

  b.section('Scavenger Bend', { halfWidth: 10, wallHeight: 1.2, surface: 'scorched' });
  b.mark('scavenger');
  b.arc(42, -90).straight(10).arc(28, 60).arc(28, -60).straight(20);

  // A full turn up on the thermal and over the road it started on.
  b.section('Thermal Spiral', { halfWidth: 9.5, wallHeight: 1.2, surface: 'boards', bridge: true });
  b.mark('spiral');
  b.arc(SPIRAL_R, -360);
  b.mark('spiralTop');
  b.section('The Swoop', { halfWidth: 10, surface: 'scorched' });
  b.mark('swoop');
  b.straight(130);

  b.section('Ribcage Run', { halfWidth: 9, wallHeight: RIBS, surface: 'scorched' });
  b.mark('ribs');
  b.arc(16, -90).straight(30).arc(16, 90).straight(30).arc(16, -90).straight(20);
  b.section('Bone Gully', { halfWidth: 9, wallHeight: RIBS, surface: 'sand' });
  b.mark('gully');
  b.straight(140);
  b.mark('gullyEnd');
  b.straight(10);

  b.section('Gizzard Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'scorched' });
  b.mark('leap');
  b.arc(36, -90).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30);
  b.elevate(0).straight(20);

  b.section('Circling Bend', { halfWidth: 9.5, surface: 'scorched' });
  b.mark('bend');
  b.straight(5);
  b.mark('boneFrom');
  b.arc(BEND_R, -BEND_TURN).arc(BEND_R, 2 * BEND_TURN).arc(BEND_R, -BEND_TURN);
  b.mark('boneTo');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'scorched' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the thermal and down the swoop, the gully.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('scavenger', 75), m('spiral', -5), (u) => 2 * Math.sin(Math.PI * u) ** 2);
  b.profile(m('spiral'), m('spiralTop'), (u) => SPIRAL_TOP * u);
  b.profile(m('spiralTop'), m('swoop', 30), () => SPIRAL_TOP, 10);
  plunge(b, m('swoop', 30), SPIRAL_TOP, m('swoop', 100), 0);
  ease(b, m('gully', 5), 0, m('gully', 40), -GULLY_DEPTH);
  ease(b, m('gully', 100), -GULLY_DEPTH, m('gullyEnd', 10), 0);
  b.profile(m('boneTo', 40), m('finish', -10), (u) => 3 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const bones = buildCarrionBridge(b.marks.boneFrom, b.marks.boneTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'people-vultures',
    name: 'People-Vultures',
    main,
    branches: [bones.branch],
    pits: [...b.pits, ...bones.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('swoop', 110), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leap', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['scavenger', 'spiral', 'swoop', 'ribs', 'gully', 'leap', 'bend'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'carrionGate', ribbon: -1, s: 6 },
      { kind: 'carrionGate', ribbon: -1, s: at('ribs', -2) },
      { kind: 'carcass', ribbon: -1, s: at('swoop', 60), lateral: 120 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('scavenger', 20), count: 4 },
      { s: at('swoop', 115), count: 3 },
      { s: at('gully', 50), count: 3 },
      { s: at('bend', 45), count: 4 },
      { s: bones.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'vultures', at: [at('kick2', 40)], period: 5.5 },
      { kind: 'tumbleweeds', from: at('scavenger', 5), to: at('scavenger', 120), count: 2 },
      { kind: 'vultures', at: [at('gully', 35), at('gully', 100)], period: 5 },
    ],
    theme: 'carrion',
    music: { lap: 'people-vultures', finalLap: 'people-vultures-final-lap' },
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
 * The Carrion Bridge: a span of bones straight over the gulch the Circling
 * Bend swings round. No rails. There on laps 1 and 2; by the final lap the
 * vultures have picked it clean and there is nothing left to drive on.
 */
function buildCarrionBridge(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Carrion Bridge', { halfWidth: 6, surface: 'sand' });
  b.straight(30);
  b.section('Span of Bones', { halfWidth: 4.5, surface: 'boards' });
  b.elevate(0).straight(12).elevate(1);
  const gulch = chord - 2 * b.s;
  const boxes = b.s + gulch / 2;
  b.bridge(gulch, 7);
  b.elevate(1).straight(12).elevate(0);
  b.section('Carrion Bridge', { halfWidth: 6, surface: 'sand' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Carrion Bridge', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [1, 2], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
