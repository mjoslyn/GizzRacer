import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.25;
const START: Pose = { x: 20 * K, z: -220 * K, h: Math.PI / 2 };
const FINISH = 45;
/** Sailing the Moon-Sea swings out round the Sea of Tears in three arcs of this radius and turn; Riding on Moonbeams runs straight across. */
const SEA_R = 42;
const SEA_TURN = 70;
/** Cerebral Asteroids: this many humps, this high. */
const ASTEROIDS = 3;
const ASTEROID = 2.2;
/** Float in the Bright Night: the Moon's gravity, as a share of the usual. */
const MOON_G = 0.6;
/** How deep the Lyre of Lightning is sunk between its walls, and the walls. */
const DEPTH = 6;
const WALL = 6;
/** The Palace Amongst Stars: a climb to this height and over the top. */
const PALACE = 10;
/** The White Rabbit: this many hops. */
const HOPS = 4;
const HOP = 1.4;

/**
 * Chang'e (the Silver Cord Cup's third), after the song about the goddess
 * of the Moon: ten suns explode in the sky and the sea boils; ride
 * cerebral asteroids, cross the scorching sands, find the portal glowing
 * jade, "in you go, be not afraid"; she sits upon the Moon, her lyre of
 * flesh and bone strung with lightning bolts, 2500 volts; sailing the
 * moon-sea, the sea of tears beneath her feet; on the astral planes they
 * dance; her palace amongst the stars, the white rabbit beside her; float in
 * the bright night; eclipse sun and moon; lonely moon. The world is the
 * Moon: grey dust and craters, her palace on a hill, osmanthus trees in
 * gold flower, red lanterns floating up into a black sky full of stars. The
 * lap is her lyre: along its soundbox, Ten Suns (two kickers), Sailing the
 * Moon-Sea swinging out round the Sea of Tears; up the right arm, a horn
 * bowing out and curling in (the Scorching Sands, the Cerebral Asteroids'
 * humps, the Jade Portal), Float in the Bright Night (the Moon's gravity,
 * a leap); across the yoke, the Lyre of Lightning, sunk 6 m between marble
 * walls with its strings across the road, plucked one after another; and
 * down the left arm, the Astral Planes' dance, the climb to the Palace
 * Amongst Stars, the White Rabbit's hops, the Eclipse and the Lonely Moon
 * home. Shortcut: Riding on Moonbeams, straight across the Sea of Tears, on
 * the final lap.
 */
export function buildChangE(): TrackDef {
  const b = new TrackBuilder(START, 'Ten Suns', { halfWidth: 11, surface: 'jade' });
  b.scale = K;
  b.straight(30).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(40);

  // Up the right arm: a horn, bowing out and curling in.
  b.section('Scorching Sands', { halfWidth: 10.5, wallHeight: 1.2, surface: 'jade' });
  b.mark('sands');
  b.arc(70, -70);
  b.section('Cerebral Asteroids', { halfWidth: 10, surface: 'jade' });
  b.mark('asteroids');
  b.straight(30).arc(120, 25).straight(30);
  b.mark('asteroidsEnd');
  b.section('The Jade Portal', { halfWidth: 10, wallHeight: 1.2, surface: 'jade' });
  b.mark('portal');
  b.arc(60, -90);
  b.mark('portalEnd');
  // Through the portal: the Moon's gravity, and a leap.
  b.section('Float in the Bright Night', { halfWidth: 10, wallHeight: 1.2, surface: 'jade', gravity: MOON_G });
  b.mark('float');
  b.straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(14, 20);
  b.elevate(0).straight(10);
  b.mark('floatEnd');
  b.arc(45, -45);

  // Across the yoke: the strings of the lyre, made of lightning, across the road between marble walls.
  b.section('Lyre of Lightning', { halfWidth: 9, wallHeight: WALL, surface: 'jade' });
  b.mark('lyre');
  b.straight(STRINGS_FROM + STRINGS * STRING_GAP + 30);
  b.mark('lyreEnd');
  b.straight(10);

  // On along the yoke, swinging out round the sea of tears.
  b.section('Sailing the Moon-Sea', { halfWidth: 10.5, surface: 'jade' });
  b.mark('sea');
  b.straight(10);
  b.mark('beamFrom');
  b.arc(SEA_R, SEA_TURN).arc(SEA_R, -2 * SEA_TURN).arc(SEA_R, SEA_TURN);
  b.mark('beamTo');
  b.straight(20);

  // Down the left arm.
  b.section('Astral Planes', { halfWidth: 9.5, wallHeight: 1.2, surface: 'jade' });
  b.mark('planes');
  b.arc(45, -45);
  b.arc(28, -40).arc(28, 80).arc(28, -80).arc(28, 40);
  b.mark('planesEnd');
  b.section('Palace Amongst Stars', { halfWidth: 10, surface: 'jade' });
  b.mark('palace');
  b.arc(60, -90);
  b.straight(10);
  b.mark('palaceEnd');
  b.section('White Rabbit', { halfWidth: 10, surface: 'jade' });
  b.mark('rabbit');
  b.arc(120, 25).straight(10);
  b.mark('rabbitEnd');
  b.section('Eclipse', { halfWidth: 10.5, wallHeight: 1.2, surface: 'jade' });
  b.mark('eclipse');
  b.arc(70, -70);
  b.section('Lonely Moon', { halfWidth: 11, surface: 'jade' });
  b.mark('lonely');
  b.turnTo(offsetPose(START, -FINISH * K), 50);
  b.section('Finish Straight', { halfWidth: 11, surface: 'jade' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('asteroids'), m('asteroidsEnd'), (u) => ASTEROID * Math.sin(Math.PI * ASTEROIDS * u) ** 2);
  ease(b, m('lyre', 5), 0, m('lyre', 40), -DEPTH);
  b.profile(m('lyre', 40), m('lyreEnd', -30), () => -DEPTH, 10);
  ease(b, m('lyreEnd', -30), -DEPTH, m('lyreEnd', 10), 0);
  // Up to the palace and over the top.
  ease(b, m('palace'), 0, m('palace', 80), PALACE);
  plunge(b, m('palace', 80), PALACE, m('rabbit', 10), 0);
  // The rabbit's hops.
  b.profile(m('rabbit', 15), m('rabbitEnd'), (u) => HOP * Math.sin(Math.PI * HOPS * u) ** 2);

  const main = b.finish(true);
  const beam = buildMoonbeams(b.marks.beamFrom, b.marks.beamTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  const strings = Array.from({ length: STRINGS }, (_, k) => at('lyre', STRINGS_FROM + k * STRING_GAP));
  return {
    id: 'chang-e',
    name: "Chang'e",
    main,
    branches: [beam.branch],
    pits: [...b.pits, ...beam.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('portalEnd', 2), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('planesEnd', 5), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['sands', 'portal', 'float', 'lyre', 'sea', 'planes', 'palace', 'rabbit', 'eclipse'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'jadePortal', ribbon: -1, s: 6 },
      { kind: 'jadePortal', ribbon: -1, s: at('portalEnd', 1) },
      { kind: 'moonPalace', ribbon: -1, s: at('palace', 60), lateral: 160 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('sands', 20), count: 4 },
      { s: at('lyre', 15), count: 3 },
      { s: at('palace', 30), count: 3 },
      { s: at('eclipse', 20), count: 4 },
      { s: beam.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [{ kind: 'strings', at: strings, period: 4.4 }],
    theme: 'change',
    music: { lap: 'chang-e', finalLap: 'chang-e-final-lap' },
  };
}

/** The Lyre of Lightning's strings: this many, this far apart along the road, from this far in. */
const STRINGS = 5;
const STRING_GAP = 14;
const STRINGS_FROM = 45;

/** Eases the road's height from y0 at arc length s0 to y1 at s1. */
function ease(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * u * u * (3 - 2 * u));
}

/** Drops the road from y0 at s0 to y1 at s1, falling away at once over the top (a crest to fly off) and easing out at the bottom. */
function plunge(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * Math.sin((Math.PI * u) / 2));
}

/**
 * Riding on Moonbeams: a beam of moonlight laid straight across the Sea of
 * Tears that Sailing the Moon-Sea swings round, no rails. It shines only on
 * the final lap.
 */
function buildMoonbeams(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Riding on Moonbeams', { halfWidth: 6, surface: 'jade' });
  b.straight(30);
  b.section('Sea of Tears', { halfWidth: 4.5, surface: 'jade' });
  b.elevate(0).straight(12).elevate(1);
  const sea = chord - 2 * b.s;
  const boxes = b.s + sea / 2;
  b.bridge(sea, 7, 'water');
  b.elevate(1).straight(12).elevate(0);
  b.section('Riding on Moonbeams', { halfWidth: 6, surface: 'jade' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Riding on Moonbeams', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: ['final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
