import { TrackBuilder, offsetPose, type Pose, type RibbonDef, type SectionProps } from './builder';
import type { BranchDef, TrackDef } from './track';

const deg = (d: number) => (d * Math.PI) / 180;
/** A pose given in map coordinates as seen from above (X east, Y north), heading in degrees counterclockwise from north. */
const at = (X: number, Y: number, hd: number): Pose => ({ x: -X, z: Y, h: deg(hd) });
/** The start: on the plain south of her, by her hand, heading east. */
const START = at(10, -190, -90);
const FINISH = 40;
/** I Am God: the road climbs round her hip to this height, and runs on along it and across her heart. */
export const GOD = 12;
/**
 * The elements: the road bulges out round her hair, swinging out on a
 * bend of this radius and turn, round the top on a wider one, and back on
 * the line it left, climbing into the light; the stream runs in along
 * that line this far, and the wave runs out along it as far.
 */
const ELEM_R = 36;
const ELEM_TOP = 55;
const ELEM_A = 75;
const WAVE_RUN = 8;
export const PHOTON = 9;
/** Dirt Is Deceased: sunk this deep into dead earth, under the start. */
export const DEPTH = 7;
const WALL = 6;
/** The crossings: each deck held level this far either side of where the roads cross. */
const HOLD = 26;
/** Dirt Is Deceased: held at the bottom of its cut this far either side of the start overhead, the road crossing it at a slant. */
const SUNK = 52;
/** Gaia breathes: her ribs heave under the road once every this many seconds, this far apart (about how far a fast kart goes in a breath). */
export const BREATH_PERIOD = 2.5;
export const RIB = 96;

const ROAD: SectionProps = { halfWidth: 10, wallHeight: 1.2, surface: 'earth' };
const OPEN: SectionProps = { halfWidth: 10, surface: 'earth' };

/** Where two lines (a pose each) cross: how far along each. */
function cross(a: Pose, b: Pose): [number, number] {
  const [ux, uz, vx, vz] = [Math.sin(a.h), Math.cos(a.h), Math.sin(b.h), Math.cos(b.h)];
  const den = ux * vz - uz * vx;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return [(dx * vz - dz * vx) / den, (dx * uz - dz * ux) / den];
}

/**
 * Gaia (the All Stars Cup #1's finale, from Omnium Gatherum): sung by the
 * Earth herself, who is the one, the none, nobody, god, you and me; a
 * giant body crawling with parasites, living while others die; the two,
 * you too; the stream, the wind, the rain, the photon and the wave. Gaia
 * sees, Gaia breathes, Gaia's needs incomplete; Gaia bequeaths, dirt is
 * deceased; Gaia dies, and no one sees. The world is her body, a colossal
 * goddess lying in the land, and the lap runs over and through her: from
 * her hand at the start, I Am God climbing round her hip, You and Me's
 * esses along it, and I Am Gaia on a deck across her heart and down her
 * flank; the parasites' mines and pumps on her shoulder; the Two; out
 * round her hair through the elements in the order she names them, the
 * stream, the wind, the rain, up into the light and down the wave; round
 * her eye; down across her chest as it heaves under the road, under the
 * deck, a leap where the road is torn open, and down into dead earth,
 * sunk under the start, the land grey round it, and home. Gaia breathes:
 * her ribs heave across the road on the riff; rise with one and it throws
 * you on; caught as it falls, you sink with it. Shortcut: the Lucky
 * Rainbow, the light through the rain, straight across the bulge of the
 * elements, from lap 2.
 */
export function buildGaia(): TrackDef {
  const b = new TrackBuilder(START, 'I Am the One', ROAD);
  // I am the one: out past her hand, two kickers.
  b.straight(18).mark('kick1').kicker().straight(14).mark('kick2').kicker();
  b.straight(140 - b.s);
  b.section('I Am Nobody', ROAD);
  b.mark('nobody');
  b.arc(70, 25).arc(70, -25);
  // I am god: round her hip, climbing.
  b.section('I Am God', ROAD);
  b.mark('god');
  b.arc(110, 180);
  b.mark('godEnd');
  // I am you, I am me: esses along the top of it.
  b.section('I Am You, I Am Me', ROAD);
  b.mark('youMe');
  b.arc(60, -35).arc(60, 65);
  // I am Gaia: across her heart over her chest's road, and down her flank.
  b.section('I Am Gaia', ROAD);
  b.mark('gaia');
  const gaiaPose = { ...b.pose };
  b.straight(70);
  b.arc(220, 10).arc(220, -20).arc(220, 10).straight(60);
  // The parasites, gnawing at her shoulder.
  b.section('Giant Body Parasite', ROAD);
  b.mark('parasite');
  b.straight(25).arc(70, -30).straight(15);
  b.section('Gaia Lives While Others Die', ROAD);
  b.mark('lives');
  b.straight(40);
  b.section('I Am the Two', ROAD);
  b.mark('two');
  b.arc(40, -45).straight(12).arc(40, -45);
  // The elements, bulging out round her hair: the stream, the wind, the rain, up into the light, and down the wave.
  // Open along the stream and the wave, where the Lucky Rainbow leaves and joins.
  b.section('I Am the Stream', OPEN);
  b.straight(3);
  b.mark('stream');
  b.straight(WAVE_RUN);
  b.arc(ELEM_R, ELEM_A);
  b.section('I Am Wind', ROAD);
  b.mark('wind');
  b.arc(ELEM_TOP, (-2 * ELEM_A) / 3);
  b.section('I Am Rain', ROAD);
  b.mark('rain');
  b.arc(ELEM_TOP, (-2 * ELEM_A) / 3);
  b.section('I Am Photon', ROAD);
  b.mark('photon');
  b.arc(ELEM_TOP, (-2 * ELEM_A) / 3);
  b.section('I Am Wave', OPEN);
  b.mark('wave');
  b.arc(ELEM_R, ELEM_A);
  b.straight(WAVE_RUN);
  b.mark('waveEnd');
  b.straight(3);
  // Round her eye.
  b.section('Gaia Sees', ROAD);
  b.mark('sees');
  b.arc(48, -120);
  // Across her chest as it heaves, and under the deck.
  b.section('Gaia Breathes', ROAD);
  b.mark('breathes');
  b.arc(350, -8).arc(350, 16).arc(350, -8);
  b.mark('chest');
  const chestPose = { ...b.pose };
  b.straight(215);
  // Gaia's needs incomplete: the road torn open, a leap.
  b.section("Gaia's Needs Incomplete", ROAD);
  b.mark('needs');
  b.straight(18).mark('ramp').elevate(0).rise(18, 3);
  b.gap(14, 18);
  b.elevate(0).straight(10);
  b.mark('needsEnd');
  b.section('Gaia Bequeaths', ROAD);
  b.mark('bequeaths');
  b.arc(50, -44);
  // Dirt is deceased: sinking into dead earth, and under the start.
  b.section('Dirt Is Deceased', { ...ROAD, wallHeight: WALL });
  b.mark('dirt');
  b.arc(50, -44);
  const dirtPose = { ...b.pose };
  const dirtStraight = b.s;
  b.straight(150);
  b.section('Gaia Dies', { ...ROAD, wallHeight: WALL });
  b.mark('dies');
  b.straight(30);
  b.section('Gaia Dies', ROAD);
  b.turnTo(offsetPose(START, -FINISH), 45);
  b.section('No One Sees', OPEN);
  b.mark('home');
  b.straight(FINISH);

  // Where the roads cross: I Am Gaia over her chest, and the start over the dead earth.
  const [overHeart, underHeart] = cross(gaiaPose, chestPose);
  const heart = b.marks.gaia.s + overHeart;
  const chest = b.marks.chest.s + underHeart;
  const [deadOver, underDead] = cross(START, dirtPose);
  const dead = dirtStraight + underDead;
  const m = (name: string, d = 0) => b.marks[name].s + d;

  // I am god: climbing round her hip, along the top, and on across her heart.
  ease(b, m('god', 20), 0, m('godEnd'), GOD);
  b.profile(m('godEnd'), heart + HOLD, () => GOD, 10);
  // Off the crest and down her flank.
  plunge(b, heart + HOLD, GOD, heart + HOLD + 80, 0);
  // The elements: up through the wind and the rain into the light, and down the wave, rolling.
  ease(b, m('wind'), 0, m('photon'), PHOTON);
  b.profile(m('photon'), m('wave'), () => PHOTON, 6);
  b.profile(m('wave'), m('waveEnd', -5), (u) => PHOTON * wave(u), 3);
  // Dirt is deceased: down into the dead earth, under the start, and up out of it.
  ease(b, m('dirt', 5), 0, dead - SUNK, -DEPTH);
  b.profile(dead - SUNK, dead + SUNK, () => -DEPTH, 10);
  ease(b, dead + SUNK, -DEPTH, m('dies', 90), 0);

  const main = b.finish(true);
  // The decks: I Am Gaia over her chest, and the start, at ground level, over the dead earth.
  deck(main, heart - 45, heart + HOLD);
  deck(main, deadOver - HOLD - 4, deadOver + HOLD + 4);

  const rainbow = buildLuckyRainbow(b.marks.stream, b.marks.waveEnd);
  const ribs = [0, 1, 2].map((k) => m('breathes', 40 + k * RIB));
  // Her face, in the middle of the land round her head.
  const face = faceAt(b);
  return {
    id: 'gaia',
    name: 'Gaia',
    main,
    branches: [rainbow.branch],
    pits: [...b.pits, ...rainbow.pits],
    boostPads: [
      { s: m('god', 120), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: m('photon', 6), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: m('dies', 90), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['nobody', 'god', 'youMe', 'gaia', 'parasite', 'two', 'wind', 'photon', 'sees', 'breathes', 'needs', 'dirt', 'dies'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 400,
    landmarks: [
      { kind: 'gaiaHands', ribbon: -1, s: 6 },
      { kind: 'gaiaFace', ribbon: -1, s: face.s, lateral: face.lateral },
      { kind: 'parasites', ribbon: -1, s: m('parasite'), to: m('two', 30) },
      { kind: 'elements', ribbon: -1, s: m('stream'), to: m('waveEnd') },
      { kind: 'gaiaHeart', ribbon: -1, s: heart, to: chest },
      { kind: 'deadEarth', ribbon: -1, s: m('dirt'), to: m('home', 20) },
      { kind: 'luckyRainbow', ribbon: 0, s: rainbow.boxes },
    ],
    itemBoxes: [
      { s: m('nobody', 20), count: 4 },
      { s: m('god', 200), count: 3 },
      { s: m('gaia', 120), count: 4 },
      { s: m('lives', 10), count: 3 },
      { s: m('rain', 20), count: 4 },
      { s: m('sees', 30), count: 3 },
      { s: m('needsEnd', 15), count: 4 },
      { s: m('dies', 140), count: 3 },
      { s: rainbow.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [{ kind: 'breaths', at: ribs, period: BREATH_PERIOD }],
    theme: 'gaia',
    music: { lap: 'gaia', finalLap: 'gaia-final-lap' },
  };
}

/** The wave: from the light down to the ground (1 to 0 as u runs 0 to 1), rolling over a swell on the way. */
export function wave(u: number): number {
  return 1 - u - 0.22 * Math.sin(2 * Math.PI * u);
}

/** Eases the road's height from y0 at arc length s0 to y1 at s1. */
function ease(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * u * u * (3 - 2 * u));
}

/** Drops the road from y0 at s0 to y1 at s1, falling away at once over the top (a crest to fly off) and easing out at the bottom. */
function plunge(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * Math.sin((Math.PI * u) / 2));
}

/** Makes [from, to] (builder arc lengths) of a finished ribbon a deck on pillars, at whatever height the road is there. */
function deck(r: RibbonDef, from: number, to: number): void {
  const out = [];
  for (const s of r.sections) {
    if (s.to <= from || s.from >= to) {
      out.push(s);
      continue;
    }
    if (s.from < from) out.push({ ...s, to: from });
    out.push({ ...s, from: Math.max(s.from, from), to: Math.min(s.to, to), bridge: true });
    if (s.to > to) out.push({ ...s, from: to });
  }
  r.sections.splice(0, r.sections.length, ...out);
}

/** Her face lies in the middle of the land round her head: where, as a distance along the road at the rain and how far to the right of it. */
function faceAt(b: TrackBuilder): { s: number; lateral: number } {
  // Round the lobe the road makes round her head (not out round her hair).
  const ks = ['parasite', 'lives', 'two', 'stream', 'waveEnd', 'sees', 'breathes'];
  const cx = ks.reduce((t, k) => t + b.marks[k].pose.x, 0) / ks.length;
  const cz = ks.reduce((t, k) => t + b.marks[k].pose.z, 0) / ks.length;
  const p = b.marks.rain.pose;
  // A lateral to the right is (-cos h, sin h).
  return { s: b.marks.rain.s, lateral: (cx - p.x) * -Math.cos(p.h) + (cz - p.z) * Math.sin(p.h) };
}

/** The Lucky Rainbow: the ground either side of the gorge it spans, and how high it arches. */
const RAINBOW_IN = 56;
export const RAINBOW_ARCH = 7;

/**
 * The Lucky Rainbow: the light through the rain, straight across the
 * bulge of the elements from the stream to the foot of the wave, arching
 * over the stream's gorge. From lap 2; before that there's only the gorge.
 */
function buildLuckyRainbow(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Lucky Rainbow', { halfWidth: 5, surface: 'rainbow' });
  b.straight(RAINBOW_IN);
  const span = chord - 2 * RAINBOW_IN;
  const boxes = b.s + span / 2;
  b.bridge(span, 9, 'water');
  b.straight(chord - b.s);
  b.profile(RAINBOW_IN, chord - RAINBOW_IN, (u) => RAINBOW_ARCH * Math.sin(Math.PI * u), 4);
  const branch: BranchDef = { name: 'Lucky Rainbow', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2, 'final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
