import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.25;
const START: Pose = { x: -60 * K, z: 170 * K, h: Math.PI / 2 };
const FINISH = 55;
/** Heights of the coaster: the top of the first lift, the kicker straight, Red Dwarf Bend and the top of the spiral. */
const LIFT = 20;
const KICK = 6;
const BALROG = 14;
const TOP = 26;

/**
 * Gliese 710, once The Lord of Lightning (hard): a road of starlight over
 * nothing, out where the star of that name will pass through the Oort
 * cloud, the Ice, Death, Planets, Lungs, Mushrooms and Lava Cup's finale.
 * Leave it and you fall forever. Black holes drift across the road
 * dragging karts round and in, static lightning strikes on the straights,
 * the star itself hangs over the line, and Rogue Orbit, a thread of road with no
 * rails, cuts out over the void past the spiral. It rides like a coaster:
 * a lift up to the start, a plunge onto Static Electricity, the leap from
 * Red Dwarf Bend, a helix up the Dead Star Spiral and two drops down the
 * Collision Course.
 */
export function buildMurderOfTheUniverse(): TrackDef {
  const b = new TrackBuilder(START, 'Event Horizon', { halfWidth: 10.5, surface: 'cosmic' });
  b.scale = K;
  b.straight(150);
  b.section('Gliese 710', { halfWidth: 10, wallHeight: 1.2, surface: 'cosmic' });
  b.arc(42, 100);

  // Two kickers down the straight, under the lightning.
  b.section('Static Electricity', { halfWidth: 9, surface: 'neon' });
  b.mark('lightning');
  b.straight(48).elevate(KICK).mark('kick1').kicker().straight(24).mark('kick2').kicker().mark('kicked');
  b.straight(36.8).arc(55, -35).arc(55, 35);

  b.section('Red Dwarf Bend', { halfWidth: 9.5, wallHeight: 1.2, surface: 'cosmic' });
  b.mark('balrog');
  b.arc(36, 80);

  b.section('Oort Cloud Leap', { halfWidth: 9, surface: 'cosmic' });
  b.mark('leap');
  b.straight(15).elevate(BALROG).rise(20, BALROG + 3);
  b.gap(18, 30);
  b.elevate(BALROG).straight(6);
  b.mark('blackFrom');
  // The spiral's first bend is open until Rogue Orbit is well clear of it.
  b.straight(19).arc(24, 35);

  b.section('Dead Star Spiral', { halfWidth: 8, wallHeight: 1.2, surface: 'cosmic' });
  b.mark('spiral');
  b.arc(24, 65).straight(12).arc(22, -160).straight(12).arc(24, 120);

  b.section('Planets Straight', { halfWidth: 9, surface: 'neon' });
  b.mark('han');
  b.straight(30);
  b.mark('blackTo');
  b.straight(20);
  b.section('Collision Course', { halfWidth: 10, wallHeight: 1.2, surface: 'cosmic' });
  b.mark('oblivion');
  b.turnTo(offsetPose(START, -FINISH * K), 40);
  b.section('Finish Straight', { halfWidth: 10.5, surface: 'cosmic' });
  b.straight(FINISH);

  // Heights, over the layout.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  ease(b, 40, 0, 210, LIFT);
  b.profile(210, m('lightning'), () => LIFT, 20);
  plunge(b, m('lightning'), LIFT, m('kick1', -5), KICK);
  ease(b, m('kicked', 4), KICK, m('balrog'), BALROG);
  ease(b, m('spiral', 4), BALROG, m('han', -8), TOP);
  b.profile(m('han', -8), m('oblivion', 36), () => TOP, 20);
  plunge(b, m('oblivion', 36), TOP, m('oblivion', 90), 10);
  ease(b, m('oblivion', 90), 10, m('oblivion', 110), 14);
  plunge(b, m('oblivion', 110), 14, m('oblivion', 155), 0);

  const main = b.finish(true);
  const black = buildRogueOrbit(b.marks.blackFrom, b.marks.blackTo, BALROG, TOP);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'murder-of-the-universe',
    name: 'Gliese 710',
    main,
    branches: [black.branch],
    pits: b.pits,
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leap', 16), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['lightning', 'balrog', 'leap', 'spiral', 'han', 'oblivion'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 440,
    abyss: true,
    landmarks: [
      { kind: 'starGate', ribbon: -1, s: 6 },
      { kind: 'starGate', ribbon: -1, s: at('blackTo', 4) },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('lightning', 20), count: 3 },
      { s: at('leap', 50), count: 3 },
      { s: at('han', 20), count: 3 },
      { s: at('oblivion', 20), count: 4 },
      { s: black.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'blackHoles', from: at('lightning', 10), to: at('lightning', 120), count: 2 },
      { kind: 'lightning', at: [100, 130, at('lightning', 40), at('lightning', 90), at('han', 20)], period: 4 },
      { kind: 'blackHoles', from: 60, to: 140, count: 1 },
    ],
    theme: 'void',
    music: { lap: 'murder-of-the-universe', finalLap: 'murder-of-the-universe-final-lap' },
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
 * Rogue Orbit: a thread of road with no rails that swings out over the
 * void, round the outside of the spiral, and drops onto the Planets
 * Straight. Narrow enough that a nudge sends you off it.
 */
function buildRogueOrbit(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }, y0: number, y1: number) {
  const b = new TrackBuilder(from.pose, 'Rogue Orbit', { halfWidth: 4.5, surface: 'neon' });
  // Out over the void, then in from the outside of the straight, clear of the spiral.
  const approach = offsetPose(to.pose, -42, 22);
  b.straight(3).arc(22, -50).turnTo(approach, 28).hermiteTo(offsetPose(to.pose, -6)).straight(6);
  // Climbing from the leap's height to the straight's, level where it runs beside the main road.
  b.elevate(y1);
  b.profile(0, 45, () => y0, 45);
  ease(b, 45, y0, b.s - 45, y1);
  // Knocked out of its orbit by the final lap: Rogue Orbit is gone.
  const branch: BranchDef = { name: 'Rogue Orbit', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [1, 2], shut: { kind: 'vanish' } };
  return { branch, boxes: branch.length / 2 };
}
