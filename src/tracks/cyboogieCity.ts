import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

/** Layout scale: sized for about 1:45 at 150cc. */
const K = 1.5;
const START: Pose = { x: -18 * K, z: 107 * K, h: Math.PI / 2 };
const FINISH = 60;
/** Top of the skyway, between the towers. */
const SKY_Y = 20;
/** The Robot Stop bulge: three arcs out and back. */
const BUMP_R = 18;
const BUMP_DEG = 80;

/**
 * Cyboogie City (circuit 2, medium): Han-Tyumi's neon downtown at night.
 * A walled boulevard, a tight alley chicane, an elevated freeway that
 * climbs into a coaster skyway between the towers and plunges back to the
 * street, and laser gates that fire on the beat in a sunken underpass.
 */
export function buildCyboogieCity(): TrackDef {
  const b = new TrackBuilder(START, 'Neon Boulevard', { halfWidth: 11, wallHeight: 1.2, surface: 'neon' });
  b.scale = K;
  // Robot Stop: the boulevard swings out round the Munt Machine factory. Open edges where its shortcut forks off and back.
  b.section('Robot Stop', { halfWidth: 11, surface: 'neon' });
  b.straight(3);
  b.mark('robotStop');
  b.arc(BUMP_R, -BUMP_DEG).arc(BUMP_R, 20);
  b.section('Robot Stop', { halfWidth: 11, wallHeight: 1.2, surface: 'neon' });
  b.arc(BUMP_R, 2 * BUMP_DEG - 40);
  b.section('Robot Stop', { halfWidth: 11, surface: 'neon' });
  b.arc(BUMP_R, 20).arc(BUMP_R, -BUMP_DEG);
  b.mark('robotStopEnd');
  b.straight(3);
  b.section('Neon Boulevard', { halfWidth: 11, wallHeight: 1.2, surface: 'neon' });
  b.straight(80 - 6 - 4 * BUMP_R * Math.sin((BUMP_DEG * Math.PI) / 180)).arc(26, 90);

  b.section('Cyboogie Alley', { halfWidth: 7.5, wallHeight: 6, surface: 'neon' });
  b.mark('alley');
  b.straight(30).arc(20, -90).straight(25).arc(20, 90).straight(25).arc(20, 90).straight(20).arc(20, -90).straight(25);
  b.section('Alley Exit', { halfWidth: 9, wallHeight: 6, surface: 'neon' });
  b.arc(28, 90);

  // Up a ramp onto the skyway, round its S high between the towers, and a plunge back to the street.
  b.section('Freeway Ramp', { halfWidth: 10, wallHeight: 1.2 });
  b.mark('freeway');
  b.straight(10);
  b.section('Freeway Ramp', { halfWidth: 10, wallHeight: 1.2, bridge: true });
  b.straight(45);
  b.section('Level 5 Freeway', { halfWidth: 10, wallHeight: 1.2, bridge: true });
  b.mark('sky');
  b.arc(60, 40).arc(60, -40);
  b.section('Freeway Exit', { halfWidth: 10, wallHeight: 1.2, bridge: true });
  b.mark('plunge');
  b.straight(45);
  b.section('Freeway Exit', { halfWidth: 10, wallHeight: 1.2 });
  b.straight(10);
  b.arc(30, 90);

  b.section('Laser Gates', { halfWidth: 10, wallHeight: 3, surface: 'neon' });
  b.mark('lasers');
  b.straight(60);
  b.section('Digital Black Sweep', { halfWidth: 11, wallHeight: 1.2, surface: 'neon' });
  b.mark('sweep');
  b.arc(30, 60).arc(30, -60);
  b.turnTo(offsetPose(START, -FINISH * K), 35);
  b.section('Finish Straight', { halfWidth: 11, wallHeight: 1.2, surface: 'neon' });
  // A pair of trick kickers, clear of the starting grid.
  b.straight(3).kicker().straight(16).kicker().straight(FINISH - 19 - 14 / K);
  shapeCity(b);

  const main = b.finish(true);
  const munt = buildMuntMachine(b.marks.robotStop, b.marks.robotStopEnd);
  return {
    id: 'cyboogie-city',
    name: 'Cyboogie City',
    main,
    branches: [munt.branch],
    pits: [...b.pits, ...munt.pits],
    boostPads: [
      // On the fork, the shortcut side: a boost to clear the vat.
      { s: b.marks.robotStop.s + 2, length: 8, lateral: -5, halfWidth: 2.5 },
      { s: b.marks.freeway.s + 30, length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['alley', 'freeway', 'lasers', 'sweep'].map((m) => b.marks[m].s / main.length),
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
      { s: b.marks.sweep.s + 20, count: 4 },
      { s: munt.boxes, count: 2, ribbon: 0, lateral: -1.5, span: 5, double: true },
    ],
    hazards: [{ kind: 'lasers', at: [b.marks.lasers.s + 15, b.marks.lasers.s + 45, b.marks.lasers.s + 75], period: 2.6 }],
    theme: 'neon',
    music: { lap: 'cyboogie-city' },
  };
}

/**
 * Soy-Protein Munt Machine: a straight cut through the factory across the
 * Robot Stop bulge, with a leap over the vat: at 100cc it takes a boost
 * (the pad on the fork, or a mini-turbo), from 150cc flat out makes it.
 */
function buildMuntMachine(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Soy-Protein Munt Machine', { halfWidth: 5.5, surface: 'neon' });
  b.straight(30);
  b.section('Munt Vat Leap', { halfWidth: 5.5, surface: 'neon' });
  b.elevate(0).rise(16, 2.2);
  b.gap(24, 7, undefined, 12, 1);
  b.elevate(0);
  b.section('Soy-Protein Munt Machine', { halfWidth: 5.5, surface: 'neon' });
  b.straight(chord - b.s);
  // The machine's shutter is only up on the second lap.
  const shutter = { style: 'wall', color: 0xff3ad8, glow: true } as const;
  const branch: BranchDef = { name: 'Soy-Protein Munt Machine', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2], shut: { kind: 'barrier', at: 38, look: shutter } };
  return { branch, pits: b.pits, boxes: 26 };
}

/**
 * Heights, laid over the layout: the skyway's lift, its swell between the
 * towers and the plunge off the end, the underpass through the laser
 * gates, and a rise over the sweep. Robot Stop, the alley and the finish
 * stay at street level.
 */
function shapeCity(b: TrackBuilder): void {
  const m = (k: string) => b.marks[k].s;
  const sky = m('sky');
  ease(b, m('freeway') + 12, sky + 8, 0, SKY_Y - 2);
  ease(b, sky + 8, sky + 45, SKY_Y - 2, SKY_Y - 6);
  ease(b, sky + 45, sky + 95, SKY_Y - 6, SKY_Y);
  // Over the top at the end of the skyway: a drop too steep to touch at speed, to the street.
  const crest = m('plunge') + 6;
  line(b, crest, crest + 24, SKY_Y, 6);
  ease(b, crest + 24, crest + 44, 6, 0);
  // The laser gates fire across a sunken underpass.
  ease(b, m('lasers') + 2, m('lasers') + 40, 0, -5);
  ease(b, m('lasers') + 40, m('sweep') - 4, -5, 0);
  ease(b, m('sweep') + 6, m('sweep') + 50, 0, 3);
  ease(b, m('sweep') + 50, m('sweep') + 96, 3, 0);
}

/** Eases the road from height y0 to y1 between arc lengths s0 and s1, level at both ends. */
function ease(b: TrackBuilder, s0: number, s1: number, y0: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + ((y1 - y0) * (1 - Math.cos(Math.PI * u))) / 2);
}

/** A straight slope from y0 to y1: a plunge, with a crest at its top. */
function line(b: TrackBuilder, s0: number, s1: number, y0: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * u);
}
