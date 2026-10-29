import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 0.96;
const START: Pose = { x: -120 * K, z: -110 * K, h: Math.PI / 2 };
const FINISH = 45;
/** The Vanishing Bend: the shore road swings out round a tidal pool in three arcs of this radius and turn. */
const POOL_R = 40;
const POOL_TURN = 70;
/** How high the road climbs up the Wraith Cliffs, and the Wraith Bridge runs off the top. */
const CLIFF_TOP = 15;
/** The Wraith Cliffs' hairpins, switching back and forth up the middle of the island. */
const SWITCH_R = 24;
/** How deep Mist Hollow sinks below the shore. */
const HOLLOW_DEPTH = 6;

/**
 * Phantom Island (the Phantom Island Cup's opener): an island that comes
 * and goes in a sea mist at dusk, and a lap that never quite reaches it.
 * The road spirals in round the island the way a boat circles land it
 * can't make out: along the Tideline, up the Ghost Light Flats (two
 * kickers, ghost lights drifting over the road), across the top through
 * the Lantern Woods, down the far shore over a rail-less Ruined Pier and a
 * jump across the Phantom Gap, then into the island along Mist Hollow, sunk
 * 6 m. In the middle, the Wraith Cliffs: hairpins switching back and forth
 * up an earth bank to 15 m. Off the top the Wraith Bridge flies straight
 * back out over everything it spiralled in on, Mist Hollow and then the
 * Tideline, and plunges off its end: the eternal return, back where you
 * began. The Vanishing Bend swings round a tidal pool on the way home,
 * which Eternal Return, a narrow causeway with no rails, cuts straight
 * across on the second lap. A ghost lighthouse on the point, the gate an
 * arch that fades.
 */
export function buildPhantomIsland(): TrackDef {
  const b = new TrackBuilder(START, 'Tideline', { halfWidth: 11, surface: 'sand' });
  b.scale = K;
  b.straight(110).mark('tide').arc(70, 20).arc(70, -20).straight(60).arc(80, -90);

  // Spiralling in round the island: ghost lights drift across the flats, between two kickers.
  b.section('Ghost Light Flats', { halfWidth: 10, surface: 'sand' });
  b.mark('flats');
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(40).arc(60, 25).arc(60, -25).straight(60);
  b.arc(80, -90);

  b.section('Lantern Woods', { halfWidth: 9, surface: 'sand' });
  b.mark('woods');
  b.straight(30).arc(36, 40).arc(36, -80).arc(36, 40).straight(60);
  b.arc(80, -90);

  // The old pier, planks and nothing else, over the water.
  b.section('Ruined Pier', { halfWidth: 8, surface: 'boards' });
  b.mark('pier');
  b.elevate(0).straight(10).elevate(1.5);
  b.bridge(60, 30, 'water');
  b.elevate(1.5).straight(10).elevate(0);

  b.section('Phantom Gap', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.mark('gapRun');
  b.straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'water');
  b.elevate(0).straight(20);
  b.arc(60, -90);

  // Into the island, sunk in the mist.
  b.section('Mist Hollow', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.mark('hollow');
  b.straight(150);
  b.mark('hollowEnd');
  b.arc(50, -90);

  // Up the cliff in the middle in switchbacks on an earth bank, then straight back out over everything on a bridge, and off the end.
  b.section('Wraith Cliffs', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.mark('cliff');
  b.straight(80).arc(SWITCH_R, -180).straight(40).arc(SWITCH_R, 180).straight(60).arc(SWITCH_R, -180);
  b.mark('cliffTop');
  b.section('Wraith Bridge', { halfWidth: 9, wallHeight: 1.2, surface: 'rock', bridge: true });
  b.mark('wraith');
  b.straight(150).arc(160, 12).arc(160, -12).straight(113);
  b.mark('wraithEnd');
  b.arc(50, 90);

  b.section('Vanishing Bend', { halfWidth: 9.5, surface: 'sand' });
  b.mark('bend');
  b.straight(5);
  b.mark('returnFrom');
  b.arc(POOL_R, -POOL_TURN).arc(POOL_R, 2 * POOL_TURN).arc(POOL_R, -POOL_TURN);
  b.mark('returnTo');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'sand' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: dunes on the shore, a rise in the woods, Mist Hollow sunk, the climb up the cliffs and the bridge off the top.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(m('tide'), m('flats', -20), (u) => 3 * Math.sin(2 * Math.PI * u) ** 2);
  ease(b, m('woods', 10), 0, m('woods', 35), 5);
  plunge(b, m('woods', 35), 5, m('woods', 60), 0);
  b.profile(m('woods', 70), m('woods', 160), (u) => 2.5 * Math.sin(Math.PI * u) ** 2);
  ease(b, m('hollow', 5), 0, m('hollow', 35), -HOLLOW_DEPTH);
  b.profile(m('hollow', 35), m('hollowEnd', -35), () => -HOLLOW_DEPTH, 10);
  ease(b, m('hollowEnd', -35), -HOLLOW_DEPTH, m('hollowEnd'), 0);
  ease(b, m('cliff'), 0, m('cliffTop'), CLIFF_TOP);
  b.profile(m('cliffTop'), m('wraithEnd', -30), () => CLIFF_TOP, 10);
  plunge(b, m('wraithEnd', -30), CLIFF_TOP, m('wraithEnd', 50), 0);
  b.profile(m('returnTo', 40), m('finish', -10), (u) => 4 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const ret = buildEternalReturn(b.marks.returnFrom, b.marks.returnTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'phantom-island',
    name: 'Phantom Island',
    main,
    branches: [ret.branch],
    pits: [...b.pits, ...ret.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('flats', 100), length: 8, lateral: -3, halfWidth: 2.5 },
      { s: at('gapRun', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['flats', 'woods', 'pier', 'gapRun', 'hollow', 'cliff', 'wraith', 'bend'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'phantomArch', ribbon: -1, s: 6 },
      { kind: 'lighthouse', ribbon: -1, s: at('woods', 40) },
      { kind: 'phantomArch', ribbon: -1, s: at('bend', 2) },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('flats', 20), count: 4 },
      { s: at('woods', 50), count: 3 },
      { s: at('gapRun', 50), count: 3 },
      { s: at('bend', 45), count: 4 },
      { s: ret.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'wisps', from: at('flats', 10), to: at('flats', 150), count: 2 },
      { kind: 'wisps', from: at('woods', 90), to: at('woods', 170), count: 1 },
    ],
    theme: 'phantom',
    music: { lap: 'phantom-island', finalLap: 'phantom-island-final-lap' },
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
 * Eternal Return: a narrow causeway with no rails, straight across the
 * tidal pool the Vanishing Bend swings round. Slip off it and you're in.
 */
function buildEternalReturn(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Eternal Return', { halfWidth: 6, surface: 'sand' });
  b.straight(30);
  b.section('Eternal Return Causeway', { halfWidth: 4, surface: 'boards' });
  b.elevate(0).straight(12).elevate(1);
  const pool = chord - 2 * b.s;
  const boxes = b.s + pool / 2;
  b.bridge(pool, 7, 'water');
  b.elevate(1).straight(12).elevate(0);
  b.section('Eternal Return', { halfWidth: 6, surface: 'sand' });
  b.straight(chord - b.s);
  // A phantom: it's only there on the second lap.
  const branch: BranchDef = { name: 'Eternal Return', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
