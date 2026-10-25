import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const DEG = Math.PI / 180;
/** The triangle's side, vertex to vertex (m): equilateral, pointing up, its centre just under the origin. */
const SIDE = 440;
const HEIGHT = (SIDE * Math.sqrt(3)) / 2;
/** The two bottom corners' radius (unscaled): big and round. */
const CORNER_R = 40;
/** How much road a 120 degree turn of radius r (unscaled) takes off each side it joins (m). */
const trim = (r: number) => r * K * Math.tan(60 * DEG);
/** A straight of `m` real metres. */
const fill = (m: number) => m / K;
const FINISH = 45;
/** The Circling Bend: the road swings in round a gulch in three arcs of this radius and turn. */
const BEND_R = 34;
const BEND_TURN = 70;
/** The Thermal Spiral's radius, and the top of it. */
const SPIRAL_R = 26;
const SPIRAL_TOP = 15;
/** How deep Bone Gully is sunk. */
const GULLY_DEPTH = 6;
/** The ribs along Ribcage Run. */
const RIBS = 4;
/** Up the right-hand side from the bottom right corner, toward the apex: the finish straight starts just out of that corner. */
const UP_RIGHT = -30 * DEG;
/** The triangle sits a little low in its bounds, to leave the loop over the apex room. */
const DROP = 40;
const START: Pose = offsetPose({ x: SIDE / 2, z: -HEIGHT / 3 - DROP, h: UP_RIGHT }, trim(CORNER_R) + FINISH * K);

/**
 * People-Vultures (the Nonagon Infinity Cup's third), after the song: a
 * dry lake under a bruised sky, the birds circling. The layout is a big
 * triangle pointing up, the carcass at its middle: three long straight
 * sides of 440 m, the two bottom corners big and round, and at the apex the
 * road doesn't turn but runs on past it and circles back, the way a vulture
 * rides a thermal, so the top of the triangle is a sharp crossing with a
 * loop above it. Up the right-hand side: Carcass Straight (two kickers)
 * under a gate of vulture totems, the Scavenger Bend jinking out and back
 * onto the side's line, and through the apex into the Thermal Spiral, two
 * thirds of a turn round the outside, up 15 m, back over the apex on a
 * deck above the road it came in on. The Swoop falls off the top down the
 * left-hand side, then Ribcage Run between ribs 4 m tall and Bone Gully
 * sunk 6 m with vultures diving at the road. The Gizzard Leap rounds the
 * bottom left corner and jumps a gulch along the base, and the Circling
 * Bend swings in off the base round another, which the Carrion Bridge, a
 * span of bones, crosses straight over on the base's line until the birds
 * pick it clean on the final lap. The bottom right corner brings it home.
 */
export function buildPeopleVultures(): TrackDef {
  const b = new TrackBuilder(START, 'Carcass Straight', { halfWidth: 11, surface: 'scorched' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(70);
  const carcass = 140 * K + 14;

  // On up the right-hand side, a jink out and back, to the apex and past it.
  b.section('Scavenger Bend', { halfWidth: 10, wallHeight: 1.2, surface: 'scorched' });
  b.mark('scavenger');
  const jink = 4 * 40 * K * Math.sin(20 * DEG);
  const loopR = SPIRAL_R * K;
  /** How far past the apex the loop starts, and short of it that it ends: its tangents cross at the apex. */
  const overshoot = loopR * Math.tan(60 * DEG);
  const scavenger = SIDE - trim(CORNER_R) - FINISH * K - carcass + overshoot;
  b.straight(fill((scavenger - jink) / 3));
  b.arc(40, 20).arc(40, -40).arc(40, 20);
  b.straight(fill(((scavenger - jink) * 2) / 3));

  // Round the outside of the apex on the thermal, and back over it.
  b.section('Thermal Spiral', { halfWidth: 9.5, wallHeight: 1.2, surface: 'boards', bridge: true });
  b.mark('spiral');
  b.arc(SPIRAL_R, 240);
  b.mark('spiralTop');
  const deck = overshoot + 10;
  b.straight(fill(deck));
  b.section('The Swoop', { halfWidth: 10, surface: 'scorched' });
  b.mark('swoop');
  b.straight(120);

  // Down the left-hand side to the bottom left corner.
  const gully = 150 * K;
  b.section('Ribcage Run', { halfWidth: 9, wallHeight: RIBS, surface: 'scorched' });
  b.mark('ribs');
  b.straight(fill(SIDE - trim(CORNER_R) - (deck - overshoot) - 120 * K - gully));
  b.section('Bone Gully', { halfWidth: 9, wallHeight: RIBS, surface: 'sand' });
  b.mark('gully');
  b.straight(140);
  b.mark('gullyEnd');
  b.straight(10);

  // Round onto the base and over the gulch.
  b.section('Gizzard Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'scorched' });
  b.mark('leap');
  b.arc(CORNER_R, -120);
  const lead = 40;
  b.straight(fill(lead)).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30);
  b.elevate(0).straight(20);

  // The base: in off its line round the gulch, and back onto it.
  b.section('Circling Bend', { halfWidth: 9.5, surface: 'scorched' });
  b.mark('bend');
  b.straight(5);
  b.mark('boneFrom');
  b.arc(BEND_R, -BEND_TURN).arc(BEND_R, 2 * BEND_TURN).arc(BEND_R, -BEND_TURN);
  b.mark('boneTo');
  b.turnTo(offsetPose(START, -FINISH * K), CORNER_R);
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
      { s: b.marks.ramp.s - 10, length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['scavenger', 'spiral', 'swoop', 'ribs', 'gully', 'leap', 'bend'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'carrionGate', ribbon: -1, s: 6 },
      { kind: 'carrionGate', ribbon: -1, s: at('ribs', -2) },
      { kind: 'carcass', ribbon: -1, s: at('gully', 20), lateral: SIDE / (2 * Math.sqrt(3)) },
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
