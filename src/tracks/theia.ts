import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.0;
/** The Glowing Thread starts this far from where the Impact crosses it, heading north-east under it. */
const CROSS = 150;
const S2 = Math.SQRT1_2;
const START: Pose = { x: -CROSS * K * S2, z: -CROSS * K * S2, h: Math.PI / 4 };
const FINISH = 45;
/** The tiers the road runs in where it crosses itself: a deck this high over the ground, and the top tier over that. */
const TIER = 8;
const TOP = 16;
/** How deep Theia's Void is sunk, and its walls. */
const DEPTH = 8;
const WALL = 6;
/** The Ticking Clock: six ticks, short kinks one way and the other. */
const TICKS = 6;
/** Spiritual Rebirth swings out round a magma lake in three arcs of this radius and turn; the Silver Cord runs straight across. */
const REBIRTH_R = 42;
const REBIRTH_TURN = 70;
/** Gravitational Waves: this many swells, this high. */
const WAVES = 3;
const WAVE = 3;

/**
 * Theia (the Silver Cord Cup's first), after the song that opens the
 * album: the planet Theia, "a force of destiny, fate intertwined with that
 * of earth", hits the young Earth and makes the Moon, and when it hits "the
 * silver cord did snap", the soul set free to sail; "meet our maker, dance
 * with Theia", "leaving behind our mortal coil", out of the brine and
 * cosmic foam, riding gravitational waves to the astral beach. The world
 * is the young Earth, a black crust cooling over the magma ocean under a
 * vast and honeyed sky, Theia huge in it and coming on. The lap is a figure
 * of eight, the two orbits intertwined: down the Glowing Thread (two
 * kickers) under the Impact, round the first orbit (the Higher Divine, the
 * Force of Destiny, the Ticking Clock's six ticks, Spiritual Rebirth
 * swinging out round a magma lake), Fate Intertwined climbing onto the
 * Impact's deck and over the crossing, down to the Snap, a leap over a
 * crack of magma; then the second orbit, the other way round: Dance with
 * Theia's esses, Meet Our Maker, the Mortal Coil (a spiral), Theia's Void
 * sunk 6 m between walls of crust, silver cords across it, the
 * Gravitational Waves and the Astral Beach home. Shortcut: the silver cord
 * itself, a bridge immortal and unspoken, straight across the magma lake
 * the first orbit swings round; it snaps on the final lap, and it's gone.
 * The lap is long, so a race is two of them.
 */
export function buildTheia(): TrackDef {
  const b = new TrackBuilder(START, 'The Glowing Thread', { halfWidth: 11, surface: 'silver' });
  b.scale = K;
  b.straight(30).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(CROSS - 74 + 60);

  // The first orbit.
  b.section('Higher Divine', { halfWidth: 10.5, surface: 'silver' });
  b.mark('divine');
  b.arc(110, 60);
  b.section('Force of Destiny', { halfWidth: 10.5, wallHeight: 1.2, surface: 'silver' });
  b.mark('destiny');
  b.straight(30).arc(70, 50);
  b.section('Ticking Clock', { halfWidth: 9.5, wallHeight: 1.2, surface: 'silver' });
  b.mark('clock');
  for (let k = 0; k < TICKS; k++) b.arc(30, k % 2 ? 22 : -22).straight(6);
  b.mark('clockEnd');
  b.straight(10);
  // Swinging out round a magma lake: the silver cord runs straight across it.
  b.section('Spiritual Rebirth', { halfWidth: 10.5, surface: 'silver' });
  b.mark('rebirth');
  b.straight(10);
  b.mark('cordFrom');
  b.arc(REBIRTH_R, -REBIRTH_TURN).arc(REBIRTH_R, 2 * REBIRTH_TURN).arc(REBIRTH_R, -REBIRTH_TURN);
  b.mark('cordTo');
  b.straight(20);
  b.arc(80, 70);

  // Fate intertwined: right across the map and back over the crossing the other way, up on the Impact's deck.
  b.section('Fate Intertwined', { halfWidth: 10.5, wallHeight: 1.2, surface: 'silver', bridge: true });
  b.mark('fate');
  b.turnTo({ x: -(CROSS + 40) * K * S2, z: (CROSS + 40) * K * S2, h: (3 * Math.PI) / 4 }, 60);
  b.mark('fateEnd');
  b.straight(40);
  b.section('The Impact', { halfWidth: 10, wallHeight: 1.2, surface: 'silver', bridge: true });
  b.mark('impact');
  b.straight(CROSS * 2 - 40);
  b.mark('impactEnd');

  // The Snap: the silver cord snaps, and the road with it: a leap over a crack of magma.
  b.section('The Snap', { halfWidth: 9.5, wallHeight: 1.2, surface: 'silver' });
  b.mark('snap');
  b.straight(15).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20, 'lava');
  b.elevate(0).straight(15);
  b.mark('snapEnd');

  // The second orbit.
  b.section('Dance with Theia', { halfWidth: 9.5, wallHeight: 1.2, surface: 'silver' });
  b.mark('dance');
  b.arc(28, -40).arc(28, 80).arc(28, -80).arc(28, 40);
  b.section('Meet Our Maker', { halfWidth: 10, wallHeight: 1.2, surface: 'silver' });
  b.mark('maker');
  b.arc(34, -150);
  b.straight(20);
  // Leaving behind the mortal coil: a spiral, tightening.
  b.section('Mortal Coil', { halfWidth: 10, wallHeight: 1.2, surface: 'silver', bridge: true });
  b.mark('coil');
  b.spiral(70, 24, 120);
  b.mark('coilEnd');
  b.straight(10);
  b.arc(60, -120);

  b.section("Theia's Void", { halfWidth: 9, wallHeight: WALL, surface: 'silver' });
  b.mark('void');
  b.straight(30).arc(80, -25).arc(80, 25).straight(40);
  b.mark('voidEnd');
  b.straight(10);

  b.section('Gravitational Waves', { halfWidth: 10.5, surface: 'silver' });
  b.mark('waves');
  b.arc(110, -70);
  b.mark('wavesEnd');
  b.section('Astral Beach', { halfWidth: 10.5, wallHeight: 1.2, surface: 'silver', bridge: true });
  b.mark('beach');
  b.turnTo(offsetPose(START, -FINISH * K), 50);
  b.section('Finish Straight', { halfWidth: 11, surface: 'silver' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // The orbits tangle, so the road runs in tiers where it crosses itself: the Glowing Thread and the
  // Ticking Clock on the ground; Fate Intertwined and the Impact on a deck over the Thread; the Mortal
  // Coil over the Clock; and the Astral Beach on the top tier, over the Impact and Fate Intertwined.
  ease(b, m('fate', 250), 0, m('fate', 460), TIER);
  b.profile(m('fate', 460), m('fate', 645), () => TIER, 10);
  ease(b, m('fate', 645), TIER, m('fate', 725), TIER - 5);
  ease(b, m('fate', 805), TIER - 5, m('fate', 905), TIER);
  b.profile(m('fate', 905), m('impact', 200), () => TIER, 10);
  plunge(b, m('impact', 200), TIER, m('snap', 5), 0);
  ease(b, m('maker', 40), 0, m('coil', 40), TIER + 1);
  b.profile(m('coil', 40), m('coil', 150), () => TIER + 1, 10);
  ease(b, m('coil', 150), TIER + 1, m('void', 40), -DEPTH);
  b.profile(m('void', 40), m('voidEnd', -30), () => -DEPTH, 10);
  ease(b, m('voidEnd', -30), -DEPTH, m('voidEnd', 10), 0);
  b.profile(m('waves'), m('wavesEnd'), (u) => WAVE * Math.sin(Math.PI * WAVES * u) ** 2);
  ease(b, m('beach', 40), 0, m('beach', 285), TOP);
  b.profile(m('beach', 285), m('beach', 495), () => TOP, 10);
  ease(b, m('beach', 495), TOP, m('finish', -5), 0);

  const main = b.finish(true);
  const cord = buildSilverCord(b.marks.cordFrom, b.marks.cordTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'theia',
    name: 'Theia',
    main,
    branches: [cord.branch],
    pits: [...b.pits, ...cord.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('clockEnd', 5), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('coilEnd', 5), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['divine', 'clock', 'rebirth', 'fate', 'impact', 'dance', 'coil', 'void', 'waves'].map((k) => b.marks[k].s / main.length),
    // A long lap, the orbits tangled: two laps of it are a race.
    laps: 2,
    bounds: 440,
    landmarks: [
      { kind: 'cordGate', ribbon: -1, s: 6 },
      { kind: 'cordGate', ribbon: -1, s: at('void', -2) },
      { kind: 'theiaPlanet', ribbon: -1, s: at('impact', 120), lateral: -300 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('destiny', 20), count: 4 },
      { s: at('fate', 20), count: 3 },
      { s: at('dance', 10), count: 3 },
      { s: at('void', 50), count: 3 },
      { s: cord.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'cords', at: [at('void', 40), at('void', 58), at('void', 76)], period: 4.2 },
      { kind: 'cords', at: [at('clock', 40)], period: 4.6 },
    ],
    theme: 'theia',
    music: { lap: 'theia', finalLap: 'theia-final-lap' },
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
 * The Silver Cord: "a bridge immortal and unspoken", a glowing thread of a
 * road straight across the magma lake the first orbit swings round, no
 * rails. On the final lap it has snapped, and there's nothing but magma.
 */
function buildSilverCord(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'The Silver Cord', { halfWidth: 6, surface: 'silver' });
  b.straight(30);
  b.section('Bridge Immortal', { halfWidth: 4.5, surface: 'silver' });
  b.elevate(0).straight(12).elevate(1);
  const lake = chord - 2 * b.s;
  const boxes = b.s + lake / 2;
  b.bridge(lake, 7, 'lava');
  b.elevate(1).straight(12).elevate(0);
  b.section('The Silver Cord', { halfWidth: 6, surface: 'silver' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'The Silver Cord', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [1], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
