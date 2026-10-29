import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1;
const DEG = Math.PI / 180;
/** The mountain's peak, in the infield: the road climbs its east face and coils round it to the summit. */
const PEAK = { x: -80, z: 100 };
/** A point `r` from the peak, `deg` round it anticlockwise from the east, heading round it anticlockwise. */
function round(deg: number, r: number): Pose {
  const t = deg * DEG;
  return { x: PEAK.x + r * Math.cos(t), z: PEAK.z + r * Math.sin(t), h: Math.atan2(-Math.sin(t), Math.cos(t)) };
}
/** A point east of the peak by `dx` and north of it by `dz`, heading `deg` (0 north, 90 east). */
const face = (dx: number, dz: number, deg: number): Pose => ({ x: PEAK.x + dx, z: PEAK.z + dz, h: deg * DEG });
const START: Pose = { x: -190, z: -120, h: Math.PI / 2 };
const FINISH = 45;
/** The Switchbacks: three legs up the east face this far from the peak, from this far south of it to this far north, and the hairpins between. */
const LEGS = [250, 190, 130];
const LEG_FROM = -110;
const LEG_TO = 40;
const HAIRPIN = 30;
/** Where Avalanche Run crosses the legs, south of the peak. */
const FALL_LINE = -70;
/** The height at the top of the switchbacks, and the summit, at the top of the coil. */
const LEDGE = 8;
const SUMMIT = 25;
/** Avalanche Run's viaduct: still this high past the bottom leg. */
const VIADUCT = 12;
/** The Altitude Bend: the road swings out round a frozen tarn in three arcs of this radius and turn. */
const TARN_R = 34;
const TARN_TURN = 70;
/** How deep the Crystal Cave runs into the mountain. */
const CAVE_DEPTH = 6;

/**
 * Magenta Mountain (the Omnium Gatherum Cup's opener): a pink mountain
 * under a sky that cycles through every colour, after the song. The lap
 * climbs the mountain and falls off it: from Base Camp round its foot
 * through the Crystal Fields, crystals tumbling across the road (two
 * kickers among them), up the Switchbacks, three legs and two great
 * hairpins zigzagging up its east face, then the Summit Ledge coiling round
 * the peak to the summit at 25 m. Avalanche Run falls straight back down
 * the face on a viaduct over all three legs of the switchbacks you climbed,
 * off a crest at the top, and on down the Pink Snowfield in the hail. Back
 * along the foot of the mountain over a rail-less crystal bridge on the
 * Rosy Tarn, the road sunk 6 m through the Crystal Cave and over a
 * crevasse, and the Altitude Bend round a frozen tarn, which the Snow
 * Bridge cuts straight across until the avalanche buries it on the second
 * lap.
 */
export function buildMagentaMountain(): TrackDef {
  const b = new TrackBuilder(START, 'Base Camp', { halfWidth: 11, surface: 'crystal' });
  b.scale = K;
  b.straight(50);
  b.hermiteTo(round(-90, 250));

  // Round the foot of the mountain, crystals tumbling across, between two kickers.
  b.section('Crystal Fields', { halfWidth: 10, surface: 'crystal' });
  b.mark('fields');
  b.hermiteTo(round(-78, 250));
  b.mark('kick1').kicker();
  b.hermiteTo(round(-68, 250));
  b.mark('kick2').kicker();
  b.hermiteTo(round(-50, 250));

  // Three legs up the east face, two great hairpins between them.
  b.section('Switchbacks', { halfWidth: 9, wallHeight: 1.2, surface: 'rock', bridge: true });
  b.mark('switch');
  b.hermiteTo(face(LEGS[0], LEG_FROM, 0));
  b.straight(LEG_TO - LEG_FROM).arc(HAIRPIN, -180);
  b.mark('hairpin');
  b.straight(LEG_TO - LEG_FROM).arc(HAIRPIN, 180);
  b.straight(LEG_TO - LEG_FROM);
  b.mark('ledge');

  // Coiling round the peak to the summit.
  b.section('Summit Ledge', { halfWidth: 9.5, wallHeight: 1.2, surface: 'rock', bridge: true });
  b.hermiteTo(round(80, 120)).hermiteTo(round(130, 110)).hermiteTo(round(180, 100));
  b.mark('coil');
  b.hermiteTo(round(230, 92));
  b.hermiteTo(face(40, FALL_LINE, 90));
  b.mark('summit');

  // Straight back down the face, over the switchbacks.
  b.section('Avalanche Run', { halfWidth: 10, wallHeight: 1.2, surface: 'crystal', bridge: true });
  b.mark('avalanche');
  b.straight(30).arc(400, -6).arc(400, 12).arc(400, -6).straight(30);
  b.mark('viaductEnd');
  b.arc(55, 90);
  b.section('Pink Snowfield', { halfWidth: 9.5, surface: 'crystal' });
  b.mark('snowfield');
  b.straight(45).arc(60, 30).arc(60, -30).straight(30);
  b.arc(55, 90);

  // A crystal bridge, no rails, over the tarn.
  b.section('Rosy Tarn', { halfWidth: 8, surface: 'crystal' });
  b.mark('tarn');
  b.elevate(0).straight(10).elevate(1.5);
  b.bridge(60, 30, 'water');
  b.elevate(1.5).straight(10).elevate(0);

  // Down into the mountain, and out over a crevasse.
  b.section('Crystal Cave', { halfWidth: 9, wallHeight: 1.2, surface: 'rock' });
  b.mark('cave');
  b.arc(50, -25).arc(50, 25).straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30);
  b.elevate(0).straight(20);

  b.section('Altitude Bend', { halfWidth: 9.5, surface: 'crystal' });
  b.mark('bend');
  b.straight(5);
  b.mark('snowFrom');
  b.arc(TARN_R, -TARN_TURN).arc(TARN_R, 2 * TARN_TURN).arc(TARN_R, -TARN_TURN);
  b.mark('snowTo');
  b.turnTo(offsetPose(START, -FINISH * K), 50);
  b.section('Finish Straight', { halfWidth: 11, surface: 'crystal' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: up the switchbacks and the coil to the summit, the fall back down over them, the cave.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(10, m('fields', -10), (u) => 2 * Math.sin(Math.PI * u) ** 2);
  ease(b, m('switch', 20), 0, m('ledge'), LEDGE);
  ease(b, m('ledge'), LEDGE, m('summit', -20), SUMMIT);
  b.profile(m('summit', -20), m('avalanche', 40), () => SUMMIT, 10);
  plunge(b, m('avalanche', 40), SUMMIT, m('avalanche', 260), VIADUCT);
  ease(b, m('avalanche', 260), VIADUCT, m('snowfield', 60), 0);
  ease(b, m('cave', 10), 0, m('cave', 40), -CAVE_DEPTH);
  ease(b, m('cave', 40), -CAVE_DEPTH, m('ramp'), 0);
  b.profile(m('snowTo', 40), m('finish', -10), (u) => 4 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const snow = buildSnowBridge(b.marks.snowFrom, b.marks.snowTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  const coil = b.marks.coil.pose;
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
    checkpoints: ['fields', 'switch', 'ledge', 'avalanche', 'snowfield', 'tarn', 'cave', 'bend'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'crystalGate', ribbon: -1, s: 6 },
      { kind: 'magentaPeak', ribbon: -1, s: b.marks.coil.s, lateral: Math.hypot(coil.x - PEAK.x, coil.z - PEAK.z) },
      { kind: 'crystalGate', ribbon: -1, s: at('bend', 2) },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('fields', 20), count: 4 },
      { s: at('snowfield', 30), count: 3 },
      { s: at('cave', 50), count: 3 },
      { s: at('bend', 45), count: 4 },
      { s: snow.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'crystals', from: at('fields', 5), to: at('fields', 125), count: 2, period: 6.5 },
      { kind: 'hail', at: [at('snowfield', 20), at('snowfield', 110)], period: 5.5 },
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
  b.elevate(0).straight(12).elevate(1);
  const tarn = chord - 2 * b.s;
  const boxes = b.s + tarn / 2;
  b.bridge(tarn, 7, 'water');
  b.elevate(1).straight(12).elevate(0);
  b.section('Snow Bridge', { halfWidth: 6, surface: 'crystal' });
  b.straight(chord - b.s);
  const branch: BranchDef = {
    name: 'Snow Bridge', mainFrom: from.s, mainTo: to.s, ...b.finish(false),
  };
  return { branch, pits: b.pits, boxes };
}
