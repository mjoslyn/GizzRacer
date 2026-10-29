import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

/** Layout scale. */
const K = 1.1;
const deg = (d: number) => (d * Math.PI) / 180;
/** A waypoint, in builder units. */
const wp = (x: number, z: number, h: number): Pose => ({ x: x * K, z: z * K, h: deg(h) });
const START = wp(-140, 255, 90);
const FINISH = 60;
/** The heading the glacier flows down, and the end of its tongue, where it flies over the canyon. */
const GLACIER = 215;
const POINT = wp(-20, -80, GLACIER);
/** The canyon runs under the snout at this heading. */
const CANYON = 140;
/** Where the thaw road runs under the glacier's middle. */
const THAW = wp(50, 20, 330);
/** The Icicle Chicane bulges round Mycelium on bends this tight, clear of its leap. */
const CHICANE_R = 24;

/**
 * Ice V (circuit 2, medium): the glacier. Its tongue lies right across the
 * map, a deck of ice from the top of the Ice Shelf down to the snout, and
 * the lap ties itself round it, under it twice. Up the sheet-ice shelf
 * (it slides karts wide) onto the glacier, high over the thaw road and
 * then over the canyon, and a plunge off the snout into the Shelf Bend;
 * the Icicle Chicane and a crevasse jump up the far side, then down into
 * the meltwater canyon, back under the snout, and along its floor round
 * four icy hairpins; a frozen lake where blocks of ice skate across the
 * road, and the thaw road home through a cutting under the glacier's
 * middle. Mycelium cuts straight across the chicane with a leap of its own.
 */
export function buildIceVGlacier(): TrackDef {
  const b = new TrackBuilder(START, 'Base Camp', { halfWidth: 11 });
  b.scale = K;
  b.straight(6).kicker().straight(44).kicker().straight(70 - 50 - 14 / K);
  b.arc(60, 20);

  b.section('Ice Shelf', { halfWidth: 10, surface: 'ice' });
  b.mark('shelf');
  b.straight(5).kicker().straight(40 - 7 / K);
  b.mark('climb');
  b.arc(50, -30).arc(50, 30);
  b.section('Ice Shelf', { halfWidth: 10, wallHeight: 1.2, surface: 'ice' });
  b.turnTo(offsetPose(POINT, -250 * K), 45);
  b.section('Ice V', { halfWidth: 10, wallHeight: 1.2, surface: 'ice', bridge: true });
  b.mark('glacier');
  b.arc(120, -15).arc(120, 15);
  b.turnTo(offsetPose(POINT, -50 * K), 60);
  b.straight(50);
  b.mark('point');
  b.straight(50);
  b.mark('snout');
  b.straight(30);
  b.section('Shelf Bend', { halfWidth: 10, wallHeight: 1.2, surface: 'ice' });
  b.arc(42, 135);
  b.section('Shelf Bend', { halfWidth: 10, surface: 'ice' });
  b.arc(42, 15);

  b.section('Icicle Chicane', { halfWidth: 8.5, surface: 'ice' });
  b.mark('chicane');
  b.arc(CHICANE_R, 70).arc(CHICANE_R, -20);
  b.section('Icicle Chicane Walls', { halfWidth: 8.5, wallHeight: 3, surface: 'ice' });
  b.arc(CHICANE_R, -100);
  b.section('Icicle Chicane', { halfWidth: 8.5, surface: 'ice' });
  b.arc(CHICANE_R, -20).arc(CHICANE_R, 70);
  b.mark('chicaneEnd');

  b.section('Crevasse Leap', { halfWidth: 9, surface: 'rock' });
  b.mark('crevasse');
  b.straight(12);
  b.section('Crevasse Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.straight(13).elevate(0).rise(20, 3);
  b.gap(16, 40, 'water');
  b.elevate(0).straight(24);

  b.section("Hell's Itch Hairpins", { halfWidth: 8.5, wallHeight: 1.5, surface: 'ice' });
  b.mark('canyon');
  const under = { ...POINT, h: deg(CANYON) };
  b.turnTo(offsetPose(under, -60 * K), 35);
  b.straight(60);
  b.mark('under');
  b.straight(15);
  b.arc(40, -50);
  b.mark('hairpins');
  b.straight(12).arc(22, 165).straight(18).arc(22, -165).straight(18).arc(22, 165).straight(18).arc(22, -165).straight(12);
  b.mark('pinsEnd');
  b.arc(45, -90);

  b.section('Gliese 710 Lake', { halfWidth: 11, surface: 'ice' });
  b.mark('lake');
  b.arc(60, 25).arc(60, -50).arc(60, 25);
  b.section('Thaw Road', { halfWidth: 10 });
  b.mark('thaw');
  b.turnTo(offsetPose(THAW, -50 * K), 45);
  b.straight(50);
  b.mark('thawUnder');
  b.straight(50);
  b.turnTo(wp(-50, 120, 270), 50);
  b.turnTo(wp(-160, 190, 270), 45);
  b.turnTo(offsetPose(START, -FINISH * K), 32);
  b.section('Finish Straight', { halfWidth: 11 });
  b.straight(FINISH);
  shapeGlacier(b);

  const main = b.finish(true);
  const mycelium = buildMycelium(b.marks.chicane, b.marks.chicaneEnd);
  return {
    id: 'ice-v-glacier',
    name: 'Ice V',
    main,
    branches: [mycelium.branch],
    pits: [...b.pits, ...mycelium.pits],
    boostPads: [
      { s: 50, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: b.marks.crevasse.s + 20, length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['shelf', 'crevasse', 'hairpins', 'lake', 'thaw'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 420,
    landmarks: [
      { kind: 'iceArch', ribbon: -1, s: b.marks.shelf.s + 4 },
      { kind: 'iceArch', ribbon: -1, s: b.marks.lake.s + 70 },
      { kind: 'gantry', ribbon: -1, s: 0 },
    ],
    itemBoxes: [
      { s: 80, count: 4 },
      { s: b.marks.shelf.s + 30, count: 4 },
      { s: b.marks.hairpins.s + 60, count: 3 },
      { s: b.marks.lake.s + 10, count: 5 },
      { s: mycelium.boxes, count: 2, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'iceBlocks', from: b.marks.lake.s + 20, to: b.marks.lake.s + 75, count: 3, period: 5 },
      { kind: 'iceBlocks', from: b.marks.shelf.s + 140, to: b.marks.shelf.s + 175, count: 1, period: 6 },
    ],
    theme: 'glacier',
    music: { lap: 'ice-v-glacier' },
  };
}

/**
 * Mycelium: a narrow straight cut across the chicane, with a leap over a
 * crevasse in the middle: at 100cc it takes a boost (a mini-turbo out of
 * the Shelf Bend, or a Fuzz Pedal), from 150cc flat out makes it.
 */
function buildMycelium(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Mycelium', { halfWidth: 5, surface: 'ice' });
  b.straight(20);
  b.section('Mycelium Leap', { halfWidth: 5, surface: 'rock' });
  b.elevate(0).rise(16, 2.2);
  b.gap(24, 6.5, 'water');
  b.elevate(0);
  b.section('Mycelium', { halfWidth: 5, surface: 'ice' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Mycelium', mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
  return { branch, pits: b.pits, boxes: 17 };
}

/** The glacier's height over the canyon where it flies over it, and the canyon's floor and the thaw road's cutting. */
const GLACIER_Y = 14;
const CANYON_Y = -9;
const THAW_Y = -3.5;

/**
 * The lie of the land: the climb up the shelf onto the glacier, the glacier
 * on high over the thaw road and the canyon, the plunge off its snout, the
 * canyon sunk under the snout and round the hairpins, and the thaw road's
 * cutting under the glacier. The kickers, the crevasse and Mycelium's
 * junctions stay level.
 */
function shapeGlacier(b: TrackBuilder): void {
  const m = (k: string) => b.marks[k].s;
  // Gently up the open shelf, round its bends onto the glacier, and on up the tongue.
  ease(b, m('shelf') + 14, m('climb'), 0, 2);
  ease(b, m('climb'), m('glacier'), 2, 8);
  ease(b, m('glacier'), m('point') - 60, 8, GLACIER_Y);
  b.profile(m('point') - 60, m('snout'), () => GLACIER_Y, 10);
  // Over the snout: it falls away at once, a crest to fly off, and eases out onto the bend.
  b.profile(m('snout'), m('snout') + 50, (u) => GLACIER_Y * (1 - Math.sin((Math.PI * u) / 2)));
  // Down into the canyon after the crevasse, under the snout, along its floor round the hairpins, and back up to the lake.
  ease(b, m('canyon') - 10, m('canyon') + 60, 0, CANYON_Y);
  b.profile(m('canyon') + 60, m('hairpins'), () => CANYON_Y, 10);
  ease(b, m('hairpins'), m('hairpins') + 120, CANYON_Y, CANYON_Y - 1);
  ease(b, m('hairpins') + 120, m('pinsEnd') - 60, CANYON_Y - 1, CANYON_Y + 1);
  ease(b, m('pinsEnd') - 60, m('pinsEnd'), CANYON_Y + 1, CANYON_Y);
  ease(b, m('pinsEnd'), m('lake') - 10, CANYON_Y, 0);
  // The thaw road runs down through a cutting in the snow, under the glacier.
  ease(b, m('thawUnder') - 100, m('thawUnder') - 50, 0, THAW_Y);
  b.profile(m('thawUnder') - 50, m('thawUnder') + 50, () => THAW_Y, 10);
  ease(b, m('thawUnder') + 50, m('thawUnder') + 100, THAW_Y, 0);
}

/** Eases the road from height y0 to y1 between arc lengths s0 and s1, level at both ends. */
function ease(b: TrackBuilder, s0: number, s1: number, y0: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + ((y1 - y0) * (1 - Math.cos(Math.PI * u))) / 2);
}
