import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: 70 * K, z: -165 * K, h: -Math.PI / 2 };
const FINISH = 45;
/** The Snowfield: the road swings out round a frozen tarn in three arcs of this radius and turn. */
const TARN_R = 34;
const TARN_TURN = 70;
/** The summit, at the top of the switchbacks. */
const SUMMIT = 25;
/** How deep the Crystal Cave runs into the mountain. */
const CAVE_DEPTH = 6;

/**
 * Magenta Mountain (the Omnium Gatherum Cup's opener): a pink mountain
 * under a sky that cycles through every colour, after the song. Up from
 * Base Camp through the Crystal Fields, crystals tumbling across the road
 * (two kickers among them), the Switchbacks: two great hairpins climbing
 * 25 m to the summit on a ledge, then Avalanche Run, the long fall back
 * down. Hail on the Pink Snowfield, a rail-less crystal bridge over the Rosy
 * Tarn, the road sunk 6 m through the Crystal Cave and over a crevasse,
 * and the last bend round a frozen tarn, which the Snow Bridge cuts
 * straight across until the avalanche buries it on the second lap. The
 * mountain itself stands in the infield.
 */
export function buildMagentaMountain(): TrackDef {
  const b = new TrackBuilder(START, 'Base Camp', { halfWidth: 11, surface: 'crystal' });
  b.scale = K;
  b.straight(140).arc(50, 90);

  // Crystals tumbling across, between two kickers.
  b.section('Crystal Fields', { halfWidth: 10, surface: 'crystal' });
  b.mark('fields');
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(30);

  // Two great hairpins up the mountain on a ledge, to the summit.
  b.section('Switchbacks', { halfWidth: 9, wallHeight: 1.2, surface: 'rock', bridge: true });
  b.mark('switch');
  b.arc(30, 90).straight(20).spiral(44, 26, -200).mark('hairpin').spiral(26, 44, 200).mark('summit').straight(50);
  b.section('Avalanche Run', { halfWidth: 10, surface: 'crystal' });
  b.mark('avalanche');
  b.arc(40, 90).straight(10);
  b.section('Pink Snowfield', { halfWidth: 9.5, surface: 'crystal' });
  b.mark('snowfield');
  b.arc(32, 60).arc(32, -60);

  // A crystal bridge, no rails, over the tarn.
  b.section('Rosy Tarn', { halfWidth: 8, surface: 'crystal' });
  b.mark('tarn');
  b.elevate(0).straight(10).elevate(1.5);
  b.bridge(60, 30, 'water');
  b.elevate(1.5).straight(10).elevate(0);

  // Down into the mountain, and out over a crevasse.
  b.section('Crystal Cave', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.mark('cave');
  b.arc(36, -90).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30);
  b.elevate(0).straight(20);

  b.section('Altitude Bend', { halfWidth: 9.5, surface: 'crystal' });
  b.mark('bend');
  b.straight(5);
  b.mark('snowFrom');
  b.arc(TARN_R, -TARN_TURN).arc(TARN_R, 2 * TARN_TURN).arc(TARN_R, -TARN_TURN);
  b.mark('snowTo');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 11, surface: 'crystal' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: the climb to the summit and the long run down, the cave.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(30, m('fields', -20), (u) => 2 * Math.sin(2 * Math.PI * u) ** 2);
  ease(b, m('switch'), 0, m('summit'), SUMMIT);
  b.profile(m('summit'), m('summit', 10), () => SUMMIT, 10);
  plunge(b, m('summit', 10), SUMMIT, m('avalanche', 70), 0);
  ease(b, m('cave', 10), 0, m('cave', 30), -CAVE_DEPTH);
  ease(b, m('cave', 30), -CAVE_DEPTH, m('ramp'), 0);
  b.profile(m('snowTo', 40), m('finish', -10), (u) => 4 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const snow = buildSnowBridge(b.marks.snowFrom, b.marks.snowTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'magenta-mountain',
    name: 'Magenta Mountain',
    main,
    branches: [snow.branch],
    pits: [...b.pits, ...snow.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('summit', 6), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('cave', 70), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['fields', 'switch', 'avalanche', 'tarn', 'cave', 'bend'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'crystalGate', ribbon: -1, s: 6 },
      { kind: 'magentaPeak', ribbon: -1, s: 70, lateral: 150 },
      { kind: 'crystalGate', ribbon: -1, s: at('bend', 2) },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('fields', 20), count: 4 },
      { s: at('avalanche', 30), count: 3 },
      { s: at('cave', 50), count: 3 },
      { s: at('bend', 45), count: 4 },
      { s: snow.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'crystals', from: at('fields', 5), to: at('fields', 125), count: 2, period: 6.5 },
      { kind: 'hail', at: [at('avalanche', 40), at('snowfield', 10)], period: 5.5 },
    ],
    theme: 'magenta',
    music: { lap: 'magenta-mountain', finalLap: 'magenta-mountain-final-lap' },
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
 * The Snow Bridge: a narrow arch of packed snow straight across the frozen
 * tarn the last bend swings round. No rails.
 */
function buildSnowBridge(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Snow Bridge', { halfWidth: 6, surface: 'crystal' });
  b.straight(30);
  b.section('Snow Bridge Span', { halfWidth: 4, surface: 'boards' });
  // The avalanche comes down where the span is clear of the bend.
  const bar = b.s + 10;
  b.elevate(0).straight(12).elevate(1);
  const tarn = chord - 2 * b.s;
  const boxes = b.s + tarn / 2;
  b.bridge(tarn, 7, 'water');
  b.elevate(1).straight(12).elevate(0);
  b.section('Snow Bridge', { halfWidth: 6, surface: 'crystal' });
  b.straight(chord - b.s);
  // Open on the first lap; the avalanche buries it on the second, and it's dug out for the last.
  const branch: BranchDef = {
    name: 'Snow Bridge', mainFrom: from.s, mainTo: to.s, ...b.finish(false),
    openOn: [1, 'final'], shut: { kind: 'barrier', at: bar, look: { style: 'wall', color: 0xffb8e8 } },
  };
  return { branch, pits: b.pits, boxes };
}
