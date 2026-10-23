import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

/** Layout scale: sized for about 1:45 at 150cc. */
const K = 1.19;
const START: Pose = { x: -35 * K, z: 155 * K, h: Math.PI / 2 };
const FINISH = 60;

/**
 * Ice V (circuit 2, medium): a sheet-ice shelf that slides karts
 * wide as it climbs the glacier, a plunge off its snout, a crevasse jump,
 * icy hairpins down in a canyon, and a frozen lake where blocks of ice
 * skate across the road.
 */
export function buildIceVGlacier(): TrackDef {
  const b = new TrackBuilder(START, 'Base Camp', { halfWidth: 11 });
  b.scale = K;
  // Trick kickers: a pair either side of the boost pad, and one out on the shelf.
  b.straight(6).kicker().straight(44).kicker().straight(70 - 50 - 14 / K);
  b.arc(40, 90);

  b.section('Ice Shelf', { halfWidth: 10, surface: 'ice' });
  b.mark('shelf');
  b.straight(5).kicker().straight(70 - 7 / K);
  // Up the glacier, and off its snout between low walls.
  b.mark('climb');
  b.arc(50, -70).arc(50, 70);
  b.section('Ice V', { halfWidth: 10, wallHeight: 1.2, surface: 'ice' });
  b.mark('snout');
  b.straight(63);
  b.section('Shelf Bend', { halfWidth: 10, wallHeight: 1.2, surface: 'ice' });
  b.arc(38, 75);
  b.section('Shelf Bend', { halfWidth: 10, surface: 'ice' });
  b.arc(38, 15);

  // Open edges where Mycelium leaves and rejoins; icicle walls round the middle.
  b.section('Icicle Chicane', { halfWidth: 8.5, surface: 'ice' });
  b.mark('chicane');
  b.arc(22, 70).arc(22, -20);
  b.section('Icicle Chicane Walls', { halfWidth: 8.5, wallHeight: 3, surface: 'ice' });
  b.arc(22, -100);
  b.section('Icicle Chicane', { halfWidth: 8.5, surface: 'ice' });
  b.arc(22, -20).arc(22, 70);
  b.mark('chicaneEnd');

  b.section('Crevasse Leap', { halfWidth: 9, surface: 'rock' });
  b.mark('crevasse');
  b.straight(12);
  b.section('Crevasse Leap', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.straight(13).elevate(0).rise(20, 3);
  b.gap(16, 40, 'water');
  b.elevate(0).straight(24);

  b.section("Hell's Itch Hairpins", { halfWidth: 8.5, wallHeight: 1.5, surface: 'ice' });
  b.mark('hairpins');
  b.straight(12).arc(22, 165).straight(18).arc(22, -165).straight(18).arc(22, 165).straight(18).arc(22, -165).straight(12);
  b.arc(40, 90);

  b.section('Gliese 710 Lake', { halfWidth: 11, surface: 'ice' });
  b.mark('lake');
  b.arc(50, -20).arc(50, 20);
  b.section('Thaw Road', { halfWidth: 10 });
  b.mark('thaw');
  b.straight(10);
  b.turnTo(offsetPose(START, -FINISH * K), 40);
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

/**
 * The lie of the land: a swell at base camp, the climb up the glacier and
 * the plunge off its snout, the hairpins sunk in a canyon, and a cutting
 * on the thaw road. The kickers, the crevasse and Mycelium's junctions stay level.
 */
function shapeGlacier(b: TrackBuilder): void {
  const m = (k: string) => b.marks[k].s;
  const GLACIER_Y = 14;
  ease(b, 90, 122, 0, 2.5);
  ease(b, 122, 154, 2.5, 0);
  // Gently up the open shelf, then steeper round its bends to the top of the glacier.
  ease(b, m('shelf') + 14, m('climb'), 0, 3);
  ease(b, m('climb'), m('snout'), 3, GLACIER_Y);
  // Over the snout: a drop too steep to touch at speed, onto the level before the bend.
  const crest = m('snout') + 7;
  line(b, crest, crest + 22, GLACIER_Y, 1);
  ease(b, crest + 22, crest + 40, 1, 0);
  // Down into the canyon after the crevasse, along its floor round the hairpins, and back up to the lake.
  const pins = m('hairpins');
  ease(b, pins - 16, pins + 40, 0, -9);
  ease(b, pins + 40, pins + 110, -9, -7);
  ease(b, pins + 110, pins + 200, -7, -10);
  ease(b, pins + 200, pins + 290, -10, -8);
  ease(b, pins + 290, pins + 384, -8, -9);
  ease(b, pins + 384, m('lake') - 12, -9, 0);
  // The thaw road runs down through a cutting in the snow.
  ease(b, m('thaw') + 5, m('thaw') + 45, 0, -3.5);
  ease(b, m('thaw') + 45, m('thaw') + 85, -3.5, 0);
}

/** Eases the road from height y0 to y1 between arc lengths s0 and s1, level at both ends. */
function ease(b: TrackBuilder, s0: number, s1: number, y0: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + ((y1 - y0) * (1 - Math.cos(Math.PI * u))) / 2);
}

/** A straight slope from y0 to y1: a plunge, with a crest at its top. */
function line(b: TrackBuilder, s0: number, s1: number, y0: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * u);
}
