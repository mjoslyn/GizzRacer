import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

/** Layout scale: sized for about 1:45 at 150cc. */
const K = 1.165;
const START: Pose = { x: 47 * K, z: 180 * K, h: Math.PI / 2 };
const FINISH = 60;
/** Degrees of the garden's first and last arcs left open, where Catching Smoke forks off and back. */
const SMOKE_OPEN = 43;
/** Heights: the garden where Catching Smoke forks, the Star Leap, and the bottom and top of the Blue Morpho helix. */
const GARDEN_Y = 4;
const LEAP_Y = 24;
const MORPHO_Y = 4;
const MORPHO_TOP = 20;

/**
 * Butterfly 3000 Skyway (circuit 2, hard): a rainbow roller coaster in the
 * sky, the cup's finale. No ground below: leave the road and it's a long
 * drop. A climbing bend and a drop into the garden, a long lift to the
 * Star Leap, switchbacks down, a hump, a helix up through itself and a
 * plunge home. Butterfly swarms buffet karts toward the open edges.
 */
export function buildButterflySkyway(): TrackDef {
  // Open edges (no walls) where a mistake costs a fall: the straights, the leap and the S-bends home.
  const b = new TrackBuilder(START, 'Cloud Nine', { halfWidth: 11, surface: 'rainbow' });
  b.scale = K;
  // Two trick kickers, then the boost pad into the bend.
  b.straight(6).kicker().straight(26).kicker().straight(70 - 32 - 14 / K);
  b.section('Cloud Nine Bend', { halfWidth: 11, wallHeight: 1.2, surface: 'rainbow' });
  b.mark('bend');
  b.arc(40, 120);

  b.section('Butterfly Garden', { halfWidth: 9.5, wallHeight: 1.2, surface: 'rainbow' });
  b.mark('garden');
  b.straight(48);
  // The garden swings out wide; Catching Smoke cuts straight across. Open edges only
  // while the two roads still touch, so a kart sliding wide lands on one or the other.
  b.section('Butterfly Garden', { halfWidth: 9.5, surface: 'rainbow' });
  b.straight(8);
  b.mark('smoke');
  b.arc(40, -SMOKE_OPEN);
  b.section('Butterfly Garden', { halfWidth: 9.5, wallHeight: 1.2, surface: 'rainbow' });
  b.arc(40, SMOKE_OPEN - 70).arc(40, 140).arc(40, SMOKE_OPEN - 70);
  b.section('Butterfly Garden', { halfWidth: 9.5, surface: 'rainbow' });
  b.arc(40, -SMOKE_OPEN);
  b.mark('smokeEnd');
  // The lift: a long climb up to the leap.
  b.section('Dreams', { halfWidth: 9.5, wallHeight: 1.2, surface: 'rainbow' });
  b.mark('lift');
  b.straight(30).arc(35, 50).arc(35, -50).straight(50);
  b.section('Garden Bend', { halfWidth: 10, wallHeight: 1.2, surface: 'rainbow' });
  b.mark('gardenBend');
  b.arc(38, 120);

  b.section('Star Leap', { halfWidth: 9, surface: 'rainbow' });
  b.mark('leap');
  b.straight(20).elevate(LEAP_Y).rise(20, LEAP_Y + 3);
  b.gap(18, 30);
  b.elevate(LEAP_Y).straight(25);

  b.section('Shanghai Chrysalis', { halfWidth: 8.5, wallHeight: 1.2, surface: 'rainbow' });
  b.mark('hairpins');
  b.straight(12).arc(22, 170).straight(16).arc(22, -170).straight(16).arc(22, 170).straight(16).arc(22, -170).straight(12);

  // Walled out of the switchbacks, where a kart spun by an item would slide off; open on the straight.
  b.section('Metamorphosis Mile', { halfWidth: 9, wallHeight: 1.2, surface: 'rainbow' });
  b.mark('mile');
  b.arc(45, 30).arc(45, -30);
  b.section('Metamorphosis Mile', { halfWidth: 9, surface: 'rainbow' });
  b.straight(30);
  // A full turn of helix, climbing over its own start.
  b.section('Blue Morpho', { halfWidth: 9.5, wallHeight: 1.2, surface: 'rainbow' });
  b.mark('morpho');
  b.arc(20, -360);
  b.section('Falling Upwards', { halfWidth: 11, wallHeight: 1.2, surface: 'rainbow' });
  b.mark('glide');
  b.turnTo(offsetPose(START, -FINISH * K), 40);
  b.section('Finish Straight', { halfWidth: 11, surface: 'rainbow' });
  b.mark('finish');
  b.straight(FINISH);
  shapeCoaster(b);

  const main = b.finish(true);
  const smoke = buildCatchingSmoke(b.marks.smoke, b.marks.smokeEnd);
  return {
    id: 'butterfly-skyway',
    name: 'Butterfly 3000 Skyway',
    main,
    branches: [smoke.branch],
    pits: b.pits,
    boostPads: [
      { s: 72, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: b.marks.leap.s + 20, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: b.marks.mile.s + 25, length: 8, lateral: -4, halfWidth: 2.5 },
      { s: b.marks.mile.s + 25, length: 8, lateral: 4, halfWidth: 2.5 },
    ],
    checkpoints: ['garden', 'leap', 'hairpins', 'mile', 'glide'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 420,
    abyss: true,
    landmarks: [
      { kind: 'rainbowArch', ribbon: -1, s: 0 },
      { kind: 'rainbowArch', ribbon: -1, s: b.marks.leap.s + 70 },
    ],
    itemBoxes: [
      { s: 90, count: 4 },
      { s: b.marks.garden.s + 6, count: 4 },
      { s: b.marks.hairpins.s + 55, count: 3 },
      { s: b.marks.mile.s + 10, count: 4 },
      { s: smoke.boxes, count: 2, ribbon: 0, double: true },
    ],
    hazards: [{ kind: 'butterflies', from: b.marks.garden.s + 20, to: b.marks.garden.s + 160, count: 2 }],
    theme: 'dream',
    music: { lap: 'butterfly-skyway', finalLap: 'butterfly-skyway-final-lap' },
  };
}

/**
 * The coaster's heights, laid over the layout. Everything is in the air
 * already, so it only climbs and drops: up the Cloud Nine Bend and off a
 * crest into the garden, the long lift to the Star Leap, down the
 * switchbacks, over a hump on the mile, up the helix and a plunge to the
 * finish. The kickers, the leap and Catching Smoke's junctions keep their own heights.
 */
function shapeCoaster(b: TrackBuilder): void {
  const m = (k: string) => b.marks[k].s;
  ease(b, m('bend') - 6, m('garden') + 4, 0, 12);
  // Over the top into the garden: a drop too steep to touch at speed.
  const garden = m('garden') + 10;
  line(b, garden, garden + 14, 12, GARDEN_Y + 1);
  ease(b, garden + 14, m('smoke') - 4, GARDEN_Y + 1, GARDEN_Y);
  // The garden swing rises and falls between the forks.
  ease(b, m('smoke') + 40, (m('smoke') + m('smokeEnd')) / 2, GARDEN_Y, GARDEN_Y + 5);
  ease(b, (m('smoke') + m('smokeEnd')) / 2, m('smokeEnd') - 40, GARDEN_Y + 5, GARDEN_Y);
  // The lift, the top of it round the Garden Bend, and level for the leap.
  ease(b, m('smokeEnd') + 6, m('gardenBend'), GARDEN_Y, LEAP_Y + 2);
  ease(b, m('gardenBend'), m('leap') + 23, LEAP_Y + 2, LEAP_Y);
  // Down the switchbacks.
  ease(b, m('hairpins') - 10, m('mile'), LEAP_Y, MORPHO_Y + 2);
  // A rounded hump over the mile's S, gentle enough to stay planted on the boost pads.
  ease(b, m('mile') + 2, m('mile') + 30, MORPHO_Y + 2, MORPHO_Y + 5);
  ease(b, m('mile') + 30, m('morpho') - 4, MORPHO_Y + 5, MORPHO_Y);
  // Round the helix and up over its own start.
  b.profile(m('morpho'), m('glide'), (u) => MORPHO_Y + (MORPHO_TOP - MORPHO_Y) * u);
  // Level off clear of the helix, then the plunge home and down to the line.
  const crest = m('glide') + 40;
  ease(b, m('glide'), crest, MORPHO_TOP, MORPHO_TOP + 2);
  line(b, crest, crest + 30, MORPHO_TOP + 2, 4);
  ease(b, crest + 30, m('finish') - 10, 4, 0);
}

/** Eases the road from height y0 to y1 between arc lengths s0 and s1, level at both ends. */
function ease(b: TrackBuilder, s0: number, s1: number, y0: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + ((y1 - y0) * (1 - Math.cos(Math.PI * u))) / 2);
}

/** A straight slope from y0 to y1: a plunge, with a crest at its top. */
function line(b: TrackBuilder, s0: number, s1: number, y0: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * u);
}

/** Catching Smoke: a narrow, rail-less ribbon straight across the garden's swing, over nothing, dipping in the middle. */
function buildCatchingSmoke(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Catching Smoke', { halfWidth: 6, surface: 'rainbow' });
  b.straight(chord);
  // Level where it runs beside the main road at either end.
  b.profile(35, chord - 35, (u) => GARDEN_Y - 2 * Math.sin(Math.PI * u) ** 2);
  // Smoke you can only catch on the final lap: the rest of the race it isn't there.
  const branch: BranchDef = { name: 'Catching Smoke', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: ['final'], shut: { kind: 'vanish' } };
  return { branch, boxes: chord / 2 };
}
