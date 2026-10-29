import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.0;
/** The storm's rotation: the road winds into it clockwise from this far out to this far in, through this many degrees, round this centre. */
const C = { x: 80, z: 40 };
const R0 = 220;
const R1 = 55;
const TURN = 450;
const START: Pose = { x: (C.x - R0) * K, z: (C.z - 225) * K, h: 0 };
const FINISH = 45;
/** Downdraft: the road blows out round a flooded field in three arcs of this radius and turn. */
const LEVEE_R = 38;
const LEVEE_TURN = 70;
/** The top of the trestle up round the silos. */
const SILO_TOP = 16;
/** How deep the Washout's gully runs below the creek. */
const WASHOUT_DEPTH = 6;

/** How far out the road winds round the storm, `f` degrees in. */
const radius = (f: number) => R0 - ((R0 - R1) * f) / TURN;
/** The pose `f` degrees into the storm's rotation (from due west, clockwise), heading on round it. */
function vortex(f: number): Pose {
  const phi = ((f - 90) * Math.PI) / 180;
  const r = radius(f);
  const dr = -((R0 - R1) * 180) / (TURN * Math.PI);
  return {
    x: (C.x + r * Math.sin(phi)) * K,
    z: (C.z + r * Math.cos(phi)) * K,
    h: Math.atan2(dr * Math.sin(phi) + r * Math.cos(phi), dr * Math.cos(phi) - r * Math.sin(phi)),
  };
}

/**
 * Supercell (hard): prairie roads under a storm the size of a county, in
 * rain and green-black light. Tornadoes wander the open plain flinging
 * karts aside (and karts off the kickers there), lightning strikes where a
 * ring of warning closes, hail the size of boulders falls on the farm, a
 * creek has burst over the road, the bridge across it has no rails, and a
 * narrow levee (Converge) cuts straight across the flooded Downdraft.
 * The lap is the storm as the radar draws it, a hook echo: up the County
 * Road and Tornado Alley (two kickers) into the storm, then round it
 * clockwise and tightening, a turn and a quarter, through Hailstone Farm,
 * over the Flooded Creek, down the Washout's gully (cut 6 m into the
 * ground) and over its jump, round the Downdraft and in under the Wall
 * Cloud to the eye. There the Silo Trestle climbs a loop round the silos
 * to 16 m and runs straight out of the storm on its pillars, over the Wall
 * Cloud and over Tornado Alley, and plunges; the Rear Flank swings back
 * down the west side to the grid.
 */
export function buildSupercell(): TrackDef {
  const b = new TrackBuilder(START, 'County Road', { halfWidth: 11, surface: 'wet' });
  b.scale = K;
  /** On round the storm to `f` degrees in. */
  const to = (f: number) => b.hermiteTo(vortex(f));
  b.straight(85);

  // Flying cows: two kickers down the alley, among the tornadoes.
  b.section('Tornado Alley', { halfWidth: 10, surface: 'wet' });
  b.mark('alley');
  b.straight(25).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(15);
  // Into the storm, winding round it clockwise and in.
  to(0);
  to(45);
  to(90);

  b.section('Hailstone Farm', { halfWidth: 9, surface: 'wet' });
  b.mark('farm');
  to(100);
  b.arc(45, -30).arc(45, 60).arc(45, -30);
  to(155);

  b.section('Flooded Creek', { halfWidth: 8, surface: 'boards' });
  b.mark('creek');
  b.elevate(0).straight(10).elevate(1.5);
  b.bridge(50, 30, 'water');
  b.elevate(1.5).straight(10).elevate(0);
  to(210);

  b.section('Washout', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.mark('washout');
  b.arc(radius(215), 30).straight(20).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'water');
  b.elevate(0).straight(25);
  to(295);

  b.section('Downdraft', { halfWidth: 9.5, surface: 'wet' });
  b.mark('down');
  b.straight(5);
  b.mark('leveeFrom');
  b.arc(LEVEE_R, -LEVEE_TURN).arc(LEVEE_R, 2 * LEVEE_TURN).arc(LEVEE_R, -LEVEE_TURN);
  b.mark('leveeTo');
  to(360);

  b.section('Wall Cloud', { halfWidth: 9.5, surface: 'wet' });
  b.mark('wall');
  to(405);
  to(TURN);

  // In the eye: a trestle climbing round the silos, then straight out of the storm over the road that wound in, and the plunge.
  b.section('Silo Trestle', { halfWidth: 9, wallHeight: 1.2, surface: 'boards', bridge: true });
  b.mark('silo');
  b.arc(30, 210);
  b.mark('siloTop');
  b.straight(230);
  b.mark('siloEnd');

  b.section('Rear Flank', { halfWidth: 10, surface: 'wet' });
  b.mark('flank');
  b.turnTo({ x: (C.x - R0 - 90) * K, z: (C.z + 40) * K, h: Math.PI }, 45);
  b.arc(40, -40).arc(40, 80).arc(40, -40);
  b.turnTo(offsetPose(START, -FINISH * K), 45);
  b.section('Finish Straight', { halfWidth: 11, surface: 'wet' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: a hill on the farm, the gully, the trestle over the storm, a swell on the way home.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  ease(b, m('silo'), 0, m('siloTop'), SILO_TOP);
  b.profile(m('siloTop'), m('siloEnd'), () => SILO_TOP, 10);
  plunge(b, m('siloEnd'), SILO_TOP, m('siloEnd', 70), 0);
  ease(b, m('washout', 5), 0, m('washout', 30), -WASHOUT_DEPTH);
  ease(b, m('washout', 30), -WASHOUT_DEPTH, m('ramp'), 0);
  ease(b, m('farm', 5), 0, m('farm', 30), 5);
  plunge(b, m('farm', 30), 5, m('farm', 60), 0);
  b.profile(m('siloEnd', 90), m('finish', -60), (u) => 4 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const levee = buildLevee(b.marks.leveeFrom, b.marks.leveeTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'supercell',
    name: 'Supercell',
    main,
    branches: [levee.branch],
    pits: [...b.pits, ...levee.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('alley', 100), length: 8, lateral: 3, halfWidth: 2.5 },
      { s: at('ramp', 2), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['alley', 'farm', 'creek', 'washout', 'down', 'wall', 'silo', 'flank'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'rodGate', ribbon: -1, s: 6 },
      { kind: 'rodGate', ribbon: -1, s: at('farm', 2) },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('alley', 90), count: 4 },
      { s: at('farm', 50), count: 3 },
      { s: at('washout', 15), count: 3 },
      { s: at('down', 45), count: 4 },
      { s: levee.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'tornadoes', from: at('alley', 10), to: at('alley', 150), count: 2 },
      { kind: 'lightning', at: [100, 130, at('down', 10), at('creek', 30)], period: 4.5 },
      { kind: 'hail', at: [at('farm', 20), at('farm', 60), at('farm', 100)], period: 5 },
    ],
    theme: 'storm',
    music: { lap: 'supercell', finalLap: 'supercell-final-lap' },
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
 * Converge: a narrow levee with no rails, straight across the flooded
 * field the Downdraft blows round. Slip off it and you're in the water.
 */
function buildLevee(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Converge', { halfWidth: 6, surface: 'wet' });
  b.straight(30);
  b.section('Converge Levee', { halfWidth: 4, surface: 'boards' });
  b.elevate(0).straight(12).elevate(1);
  const flood = chord - 2 * b.s;
  const boxes = b.s + flood / 2;
  b.bridge(flood, 7, 'water');
  b.elevate(1).straight(12).elevate(0);
  b.section('Converge', { halfWidth: 6, surface: 'wet' });
  b.straight(chord - b.s);
  // The storm surge floods the levee on the second lap, and it drains for the last.
  const branch: BranchDef = { name: 'Converge', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [1, 'final'], shut: { kind: 'flood' } };
  return { branch, pits: b.pits, boxes };
}
