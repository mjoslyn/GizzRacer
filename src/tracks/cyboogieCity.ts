import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

/** Layout scale. */
const K = 1.15;
/** A point in town, in builder units. */
const wp = (x: number, z: number, h: number): Pose => ({ x: x * K, z: z * K, h });
const N = 0;
const E = Math.PI / 2;
const W = -Math.PI / 2;
const START: Pose = wp(-50, 220, E);
const FINISH = 60;
/** The Level 5 Freeway's deck, high between the towers. */
const SKY_Y = 20;
/** Where the ramp has climbed to when the cloverleaf sets off round its loop. */
const RAMP_Y = 6;
/** The Downtown bulge: three arcs out and back, 27 m across each, sized to the reactor leap across it. */
const BUMP_R = 27 / K;
const BUMP_DEG = 80;
/** Doom Alley's steps: this many pairs of right angles, each bend this radius, each leg this long. */
const ALLEY_STEPS = 5;
const ALLEY_R = 16;
const ALLEY_LEG = 12;
/** The cloverleaf loop's radius. */
const CLOVER_R = 40;
/** The exit helix's radius, and how far down it has come when it passes under the freeway. */
const HELIX_R = 32;
const HELIX_Y = 11;

/**
 * Doom City, once Cyboogie (medium): Han-Tyumi's neon downtown at night, lit
 * cobalt and banana yellow. The lap is the city's knot of streets and
 * freeway, tied in tiers like a motorway interchange: Downtown and the Neon
 * Boulevard along the top of town, then Doom Alley, a walled staircase of
 * right angles down through the middle; the Freeway Ramp along the south,
 * and the Cloverleaf, a loop three quarters round that climbs back over the
 * ramp it came up; the Level 5 Freeway, 20 m up, back across the middle of
 * town high over the alley; the Freeway Exit, a helix down round under the
 * deck it left and over the top to the street; the laser gates firing on
 * the beat in a sunken underpass, and the Nuclear Fusion Sweep home.
 * Shortcut: the Fusion Reactor, straight across the Downtown bulge with a
 * leap over the core.
 */
export function buildCyboogieCity(): TrackDef {
  const b = new TrackBuilder(START, 'Neon Boulevard', { halfWidth: 11, wallHeight: 1.2, surface: 'neon' });
  b.scale = K;
  // Downtown: the boulevard swings out round the fusion reactor. Open edges where its shortcut forks off and back.
  b.section('Downtown', { halfWidth: 10, surface: 'neon' });
  b.straight(3);
  b.mark('downtown');
  b.arc(BUMP_R, -BUMP_DEG).arc(BUMP_R, 20);
  b.section('Downtown', { halfWidth: 10, wallHeight: 1.2, surface: 'neon' });
  b.arc(BUMP_R, 2 * BUMP_DEG - 40);
  b.section('Downtown', { halfWidth: 10, surface: 'neon' });
  b.arc(BUMP_R, 20).arc(BUMP_R, -BUMP_DEG);
  b.mark('downtownEnd');
  b.straight(3);
  b.section('Neon Boulevard', { halfWidth: 11, wallHeight: 1.2, surface: 'neon' });
  b.turnTo(wp(130, 220, E), 50);
  b.arc(50, 90);

  // Doom Alley: a staircase of right angles down through the middle of town, west and south by turns.
  b.section('Doom Alley', { halfWidth: 7.5, wallHeight: 6, surface: 'neon' });
  b.mark('alley');
  b.straight(10);
  for (let k = 0; k < ALLEY_STEPS; k++) b.arc(ALLEY_R, 90).straight(ALLEY_LEG).arc(ALLEY_R, -90).straight(ALLEY_LEG);
  b.mark('alleyEnd');
  b.section('Alley Exit', { halfWidth: 9, wallHeight: 6, surface: 'neon' });
  b.straight(20).arc(30, -90);

  // Up a ramp onto the freeway along the south of town, and the cloverleaf: a loop three quarters round, climbing back over the ramp.
  b.section('Freeway Ramp', { halfWidth: 10, wallHeight: 1.2 });
  b.mark('freeway');
  b.straight(10);
  b.section('Freeway Ramp', { halfWidth: 10, wallHeight: 1.2, bridge: true });
  b.turnTo(wp(170, -170, E), 40);
  b.section('Cloverleaf', { halfWidth: 9.5, wallHeight: 1.2, bridge: true });
  b.mark('clover');
  b.arc(CLOVER_R, 270);
  b.mark('cloverEnd');
  b.straight(45);
  // Back across the middle of town, high over the alley.
  b.section('Level 5 Freeway', { halfWidth: 10, wallHeight: 1.2, bridge: true });
  b.mark('sky');
  b.hermiteTo(wp(140, -40, -0.35));
  b.hermiteTo(wp(10, 35, -1.2));
  b.hermiteTo(wp(-105, 45, W));
  // The exit: a helix down, round under the freeway it left, and over the top to the street.
  b.section('Freeway Exit', { halfWidth: 10, wallHeight: 1.2, bridge: true });
  b.mark('helix');
  b.arc(HELIX_R, -360);
  b.mark('plunge');
  b.section('Freeway Exit', { halfWidth: 10, wallHeight: 1.2 });
  b.hermiteTo(wp(-195, 90, N));

  b.section('Laser Gates', { halfWidth: 10, wallHeight: 3, surface: 'neon' });
  b.mark('lasers');
  b.straight(72);
  b.section('Nuclear Fusion Sweep', { halfWidth: 11, wallHeight: 1.2, surface: 'neon' });
  b.mark('sweep');
  b.turnTo(offsetPose(START, -FINISH * K), 30);
  b.section('Finish Straight', { halfWidth: 11, wallHeight: 1.2, surface: 'neon' });
  b.mark('finish');
  // A pair of trick kickers, clear of the starting grid.
  b.straight(3).kicker().straight(16).kicker().straight(FINISH - 19 - 14 / K);
  shapeCity(b);

  const main = b.finish(true);
  const reactor = buildFusionReactor(b.marks.downtown, b.marks.downtownEnd);
  return {
    id: 'cyboogie-city',
    name: 'Doom City',
    main,
    branches: [reactor.branch],
    pits: [...b.pits, ...reactor.pits],
    boostPads: [
      // On the fork, the shortcut side: a boost to clear the vat.
      { s: b.marks.downtown.s + 2, length: 8, lateral: -5, halfWidth: 2.5 },
      { s: b.marks.freeway.s + 30, length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['alley', 'freeway', 'clover', 'sky', 'helix', 'lasers', 'sweep'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 420,
    landmarks: [
      { kind: 'neonArch', ribbon: -1, s: 0 },
      { kind: 'neonArch', ribbon: -1, s: b.marks.alley.s + 3 },
    ],
    itemBoxes: [
      { s: 100, count: 4 },
      { s: b.marks.alley.s + 85, count: 3 },
      { s: b.marks.freeway.s + 120, count: 4 },
      { s: b.marks.sky.s + 150, count: 4 },
      { s: b.marks.sweep.s + 20, count: 4 },
      { s: reactor.boxes, count: 2, ribbon: 0, lateral: -1.5, span: 5, double: true },
    ],
    hazards: [{ kind: 'lasers', at: [b.marks.lasers.s + 15, b.marks.lasers.s + 45, b.marks.lasers.s + 75], period: 2.6 }],
    theme: 'neon',
    music: { lap: 'cyboogie-city' },
  };
}

/**
 * Fusion Reactor: a straight cut through the reactor across the
 * Downtown bulge, with a leap over the core: at 100cc it takes a boost
 * (the pad on the fork, or a mini-turbo), from 150cc flat out makes it.
 */
function buildFusionReactor(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Fusion Reactor', { halfWidth: 5.5, surface: 'neon' });
  // The leap sits a shade earlier than the chord's middle, so its vat stays clear of the street it cuts across.
  b.straight(27);
  // A narrower lip over the vat, so its pit stays clear of the street the shortcut cuts across.
  b.section('Reactor Leap', { halfWidth: 4.6, surface: 'neon' });
  b.elevate(0).rise(16, 2.2);
  b.gap(24, 7, undefined, 12, 1);
  b.elevate(0);
  b.section('Fusion Reactor', { halfWidth: 5.5, surface: 'neon' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Fusion Reactor', mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
  return { branch, pits: b.pits, boxes: 26 };
}

/**
 * Heights, laid over the layout: the ramp's lift and the cloverleaf's climb
 * over it, the freeway's deck across town, the helix down under it and the
 * plunge off the end, the underpass through the laser gates, and a rise
 * over the sweep. Downtown, the alley and the finish stay at street level.
 */
function shapeCity(b: TrackBuilder): void {
  const m = (k: string, d = 0) => b.marks[k].s + d * K;
  // Up the ramp, and on up round the cloverleaf to cross back over it.
  ease(b, m('freeway', 10), m('clover'), 0, RAMP_Y);
  ease(b, m('clover'), m('cloverEnd', 20), RAMP_Y, SKY_Y);
  b.profile(m('cloverEnd', 20), m('helix'), () => SKY_Y, 10);
  // Down the helix, under the freeway, then over the top and down to the street.
  ease(b, m('helix', 30), m('plunge', -40), SKY_Y, HELIX_Y);
  b.profile(m('plunge', -40), m('plunge', 5), () => HELIX_Y, 10);
  plunge(b, m('plunge', 5), m('plunge', 40), HELIX_Y, 0);
  // The laser gates fire across a sunken underpass.
  ease(b, m('lasers', 2), m('lasers', 30), 0, -5);
  ease(b, m('lasers', 30), m('sweep', -3), -5, 0);
  ease(b, m('sweep', 5), m('sweep', 40), 0, 2.5);
  ease(b, m('sweep', 40), m('finish', -3), 2.5, 0);
}

/** Eases the road from height y0 to y1 between arc lengths s0 and s1, level at both ends. */
function ease(b: TrackBuilder, s0: number, s1: number, y0: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + ((y1 - y0) * (1 - Math.cos(Math.PI * u))) / 2);
}

/** Drops the road from y0 at s0 to y1 at s1, falling away at once over the top (a crest to fly off) and easing out at the bottom. */
function plunge(b: TrackBuilder, s0: number, s1: number, y0: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * Math.sin((Math.PI * u) / 2));
}
