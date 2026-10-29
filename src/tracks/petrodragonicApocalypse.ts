import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

/** Layout scale. */
const K = 0.9;
const START: Pose = { x: 0, z: 200 * K, h: Math.PI };
/** A waypoint on the lap, in builder units. */
const wp = (x: number, z: number, h: number): Pose => ({ x: x * K, z: z * K, h });
const FINISH = 55;
/** Witchcraft: the Mile swings out round a lake of burning oil in three arcs of this radius and turn. */
const LAKE_R = 38;
const LAKE_TURN = 70;
/** Flamethrower: the leap over the burning lake. */
const LAKE_GAP = 24;
/** How high Derrick Row runs along the dragon's back, the trestle over the oil lake, and how deep the gullet is dug. */
const RIDGE = 9;
const TRESTLE = 12;
const GULLET_DEPTH = 8;

/**
 * Dragon (hard): a burning oil field under a black sky.
 * Narrow roads, slicks of crude that slide like ice, a walled gullet where
 * dragons breathe fire across the whole road, a jump over a moat of
 * burning oil, a coil of hairpins on the slick, a rail-less bridge over an
 * oil lake, and burning crude raining down on the straights. The lap is a
 * dragon itself, seen from above as it flies: the grid runs down its neck
 * from the skull at the top of the map (two kickers), Derrick Row along its
 * back on a trestle 9 m up between the derricks, and the Crude Slick slides
 * off the end of it round the curl of the tail, down into Dragon's Gullet,
 * dug 8 m into the earth, which runs back under the dragon's back. Then the
 * left wing: the Burning Moat jump, the Gila Monster Coil's hairpins along
 * the wing's trailing edge, and up its leading edge onto Skull Bridge, 12 m
 * over the oil lake with no rails, and the Wingspan, a trestle sweeping
 * from wing to wing over the dragon's neck, that plunges down onto the
 * Apocalypse Mile; and the right wing, down and round, back up past a
 * burning lake (Witchcraft) that the Flamethrower shortcut leaps straight
 * across, and the Dawn of Eternal Night arching over to the head.
 */
export function buildPetrodragonicApocalypse(): TrackDef {
  const b = new TrackBuilder(START, 'Ashen Grid', { halfWidth: 10 });
  b.scale = K;
  // Down the dragon's neck: two kickers off the dragon bones on the grid straight.
  b.straight(50).mark('kick1').kicker().straight(30).mark('kick2').kicker().mark('grid').straight(60);

  // Along the dragon's back, a trestle between the derricks.
  b.section('Derrick Row', { halfWidth: 8.5, bridge: true });
  b.mark('derricks');
  b.straight(70).arc(40, -30).arc(40, 30).straight(60);

  // Off the end of the back, sliding round the curl of the tail and down under the back.
  b.section('Crude Slick', { halfWidth: 8, wallHeight: 1.2, surface: 'oil' });
  b.mark('slick');
  b.arc(60, -270);
  b.mark('slickEnd');

  // On under the dragon's back, down its throat.
  b.section("Dragon's Gullet", { halfWidth: 6.5, wallHeight: 5, surface: 'rock' });
  b.mark('gullet');
  b.straight(150);

  b.section('Burning Moat', { halfWidth: 8, wallHeight: 1.2, surface: 'rock' });
  b.mark('moat');
  b.straight(14).elevate(0).rise(20, 3.5);
  b.gap(13, 34, 'oil');
  b.elevate(0).straight(25);
  b.arc(40, -90).straight(50);

  // The left wing: a coil of hairpins on the slick, its trailing edge.
  b.section('Gila Monster Coil', { halfWidth: 7, wallHeight: 1.5, surface: 'oil' });
  b.mark('coil');
  b.arc(19, 180).straight(24).arc(19, -180).straight(24).arc(19, 180);
  b.mark('coilEnd');

  // Up the wing's edge on a trestle, high over the burning lake, no rails, then from wing to wing over the dragon's neck.
  b.section('Skull Bridge', { halfWidth: 7, bridge: true });
  b.mark('bridge');
  b.straight(70).elevate(TRESTLE);
  b.bridge(55, 30, 'oil');
  b.elevate(TRESTLE).mark('trestleEnd').straight(10);
  b.section('Wingspan', { halfWidth: 7, wallHeight: 1.2, bridge: true });
  b.mark('wingspan');
  b.turnTo(wp(-150, 60, (65 * Math.PI) / 180), 45);
  b.arc(260, 50);
  b.mark('neckEnd');

  // The right wing: down and round, and back up its far edge.
  b.section('Apocalypse Mile', { halfWidth: 9 });
  b.mark('mile');
  b.arc(70, 60).arc(70, -60);
  b.turnTo(wp(320, -80, 0), 45);
  b.straight(10);

  // The black cat knocked the candle over: the lake is alight. The road
  // goes round it; Flamethrower leaps across.
  b.section('Witchcraft', { halfWidth: 9 });
  b.mark('lakeFrom');
  b.arc(LAKE_R, -LAKE_TURN).arc(LAKE_R, 2 * LAKE_TURN).arc(LAKE_R, -LAKE_TURN);
  b.mark('lakeTo');
  b.section('Dawn of Eternal Night', { halfWidth: 9 });
  b.hermiteTo(offsetPose(START, -FINISH * K));
  b.section('Finish Straight', { halfWidth: 10 });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up onto the dragon's back, down round the tail into the gullet (under the
  // back), up the wing onto the trestle (over the neck) and the plunge off its end.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  ease(b, m('derricks', 10), 0, m('derricks', 60), RIDGE);
  b.profile(m('derricks', 60), m('slick'), (u) => RIDGE + 2 * Math.sin(2 * Math.PI * u) ** 2);
  ease(b, m('slick'), RIDGE, m('slickEnd', -60), 0);
  ease(b, m('gullet', 4), 0, m('gullet', 34), -GULLET_DEPTH);
  b.profile(m('gullet', 34), m('gullet', 100), () => -GULLET_DEPTH, 20);
  ease(b, m('gullet', 100), -GULLET_DEPTH, m('moat', 8), 0);
  ease(b, m('coilEnd'), 0, m('bridge', 70), TRESTLE);
  b.profile(m('bridge', 70), m('neckEnd'), () => TRESTLE, 10);
  plunge(b, m('neckEnd'), TRESTLE, m('neckEnd', 80), 0);
  b.profile(b.marks.lakeTo.s + 45, m('finish', -10), (u) => 3 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const flame = buildFlamethrower(b.marks.lakeFrom, b.marks.lakeTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'petrodragonic-apocalypse',
    name: 'Dragon',
    main,
    branches: [flame.branch],
    pits: [...b.pits, ...flame.pits],
    boostPads: [
      { s: 115, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('moat', 4), length: 8, lateral: 0, halfWidth: 2.5 },
      // On the inside of the Witchcraft bend, lined up for the leap.
      { s: b.marks.lakeFrom.s - 6, length: 8, lateral: -3.5, halfWidth: 2.5 },
    ],
    checkpoints: ['derricks', 'slick', 'gullet', 'moat', 'coil', 'bridge', 'wingspan', 'mile'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'dragonGate', ribbon: -1, s: 6 },
      { kind: 'dragonGate', ribbon: -1, s: at('gullet', 2) },
      { kind: 'dragonFlight', ribbon: -1, s: 0 },
    ],
    itemBoxes: [
      { s: 100, count: 4 },
      { s: at('derricks', 40), count: 3 },
      { s: at('gullet', -20), count: 3 },
      { s: at('coil', 120), count: 3 },
      // Past where karts flying off the trestle come down.
      { s: at('mile', 30), count: 4 },
      { s: flame.boxes, count: 2, ribbon: 0, span: 5, double: true },
    ],
    hazards: [
      { kind: 'oilBombs', at: [at('derricks', 20), at('derricks', 50), at('derricks', 75), at('mile', 20)], period: 5 },
      { kind: 'dragonFire', at: [at('gullet', 22), at('gullet', 50), at('gullet', 76)], period: 3 },
      { kind: 'oilBombs', at: [at('coil', 30), at('coil', 95)], period: 6 },
    ],
    theme: 'petro',
    music: { lap: 'petrodragonic-apocalypse', finalLap: 'petrodragonic-apocalypse-final-lap' },
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
 * Flamethrower: straight across the burning lake inside the Witchcraft
 * bend, over a run-up slick with crude and a leap through the fire rain.
 * From 150cc a kart at full speed clears it; at 100cc it takes the pad at
 * its mouth, or a mini-turbo.
 */
function buildFlamethrower(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Flamethrower', { halfWidth: 6.5 });
  b.straight(36);
  b.section('Flamethrower Slick', { halfWidth: 6.5, surface: 'oil' });
  b.elevate(0).straight(16).elevate(2.4);
  b.gap(LAKE_GAP, 14, 'oil');
  b.elevate(0).straight(12);
  b.section('Flamethrower', { halfWidth: 6.5 });
  b.straight(10);
  const boxes = b.s;
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Flamethrower', mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
  return { branch, pits: b.pits, boxes };
}
