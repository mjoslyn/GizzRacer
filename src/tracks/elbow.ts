import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.1;
const START: Pose = { x: -230 * K, z: 40 * K, h: Math.PI / 2 };
const FINISH = 45;
/** The Bended Elbow: the hairpin the arm is bent back round. */
const ELBOW_R = 26;
const ELBOW_TURN = 150;
/** How deep Backstab Alley is sunk, and its walls. */
const DEPTH = 6;
const WALL = 6;
/** The eight bends of the Hey Hey Esses, one an "EY". */
const HEY_R = 24;
const HEY_TURN = 62;
/** How high the Forearm swells before it drops away to the fist. */
const CREST = 9;
/** The Flange swings out and back in three arcs of this radius and turn, like the effect sweeping; the Backstab cuts straight across. */
const FLANGE_R = 40;
const FLANGE_TURN = 75;

/**
 * Elbow (the 12 Bar Bruise Cup's first), after the noisy punk song that
 * opens the album: a big shot who betrays you, though he knows better than
 * to bend your elbow back, and stabs you in the back; the band chant "EY"
 * through every chorus, and a huge flange closes the track. The world is a
 * pub's band room on a Saturday night spilled out into the street, the
 * Bended Elbow (the Geelong pub the song may have been about) lit up over
 * it. The lap is an arm: down Big Shot Straight from the shoulder (two
 * kickers), round the Bended Elbow, a hairpin bent right back, along the
 * Forearm to the Fist, four knuckles of kinks, then the Bend It Back climb
 * over the arm it came along. Down Backstab Alley behind the band room,
 * sunk 6 m between walls of amps, arms reaching out of the walls to throw
 * elbows across the road; the Hey Hey Esses, eight bends; and the Flange,
 * swinging out and back like the effect, home. Shortcut: the Backstab,
 * straight across behind the Flange over the band room's cellar, on the
 * final lap only.
 */
export function buildElbow(): TrackDef {
  const b = new TrackBuilder(START, 'Big Shot Straight', { halfWidth: 11, surface: 'carpet' });
  b.scale = K;
  b.straight(40).mark('kick1').kicker().straight(40).mark('kick2').kicker().straight(110);

  // The Bended Elbow: bent right back on itself.
  b.section('The Bended Elbow', { halfWidth: 10, wallHeight: 1.2, surface: 'carpet' });
  b.mark('elbow');
  b.arc(ELBOW_R, ELBOW_TURN);
  b.section('The Forearm', { halfWidth: 10.5, surface: 'carpet' });
  b.mark('forearm');
  b.straight(220);

  // The Fist: four knuckles, then round under the arm.
  b.section('The Fist', { halfWidth: 10, wallHeight: 1.2, surface: 'carpet' });
  b.mark('fist');
  b.arc(30, 30).arc(18, -40).arc(18, 40).arc(18, -30);
  b.section('Wrist Turn', { halfWidth: 10, surface: 'carpet' });
  b.mark('wrist');
  b.straight(12);
  b.arc(70, -150);
  b.straight(60);
  b.mark('stabTo');
  b.straight(30);

  // Backstab Alley, behind the band room, sunk between walls of amps.
  b.section('Backstab Alley', { halfWidth: 9, wallHeight: WALL, surface: 'carpet' });
  b.mark('alley');
  b.straight(190);
  b.mark('alleyEnd');
  b.straight(10);

  b.section('Hey Hey Esses', { halfWidth: 10, wallHeight: 1.2, surface: 'carpet' });
  b.mark('hey');
  b.arc(40, -80);
  for (let k = 0; k < 8; k++) b.arc(HEY_R, k % 2 ? HEY_TURN : -HEY_TURN);
  b.straight(140);
  b.arc(50, -100);

  b.section('The Flange', { halfWidth: 10.5, surface: 'carpet' });
  b.mark('flange');
  b.straight(10);
  b.mark('stabFrom');
  b.arc(FLANGE_R, FLANGE_TURN).arc(FLANGE_R, -2 * FLANGE_TURN).arc(FLANGE_R, FLANGE_TURN);
  b.mark('stabTo');
  b.straight(30);
  b.mark('flangeEnd');

  b.turnTo(offsetPose(START, -FINISH * K), 45);
  b.section('Finish Straight', { halfWidth: 11, surface: 'carpet' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // The Forearm swells up to the fist and drops away again before it.
  ease(b, m('forearm', 20), 0, m('forearm', 150), CREST);
  plunge(b, m('forearm', 150), CREST, m('forearm', 200), 0);
  ease(b, m('alley', 5), 0, m('alley', 50), -DEPTH);
  ease(b, m('alley', 140), -DEPTH, m('alleyEnd', 10), 0);

  const main = b.finish(true);
  const stab = buildBackstab(b.marks.stabFrom, b.marks.stabTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'elbow',
    name: 'Elbow',
    main,
    branches: [stab.branch],
    pits: [...b.pits, ...stab.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('forearm', 60), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('stabTo', 20), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['elbow', 'forearm', 'fist', 'wrist', 'alley', 'hey', 'flange'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'elbowGate', ribbon: -1, s: 6 },
      { kind: 'elbowGate', ribbon: -1, s: at('alley', -2) },
      { kind: 'bentArm', ribbon: -1, s: at('forearm', 80), lateral: 130 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('forearm', 20), count: 4 },
      { s: at('wrist', 30), count: 3 },
      { s: at('alley', 110), count: 3 },
      { s: at('flange', 110), count: 4 },
      { s: stab.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'elbows', at: [at('alley', 60), at('alley', 105), at('alley', 150)], period: 4.4 },
      { kind: 'elbows', at: [at('fist', 30)], period: 4.8 },
    ],
    theme: 'elbow',
    music: { lap: 'elbow', finalLap: 'elbow-final-lap' },
  };
}

/** Drops the road from y0 at s0 to y1 at s1, falling away at once over the top (a crest to fly off) and easing out at the bottom. */
function plunge(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * Math.sin((Math.PI * u) / 2));
}

/** Eases the road's height from y0 at arc length s0 to y1 at s1. */
function ease(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * u * u * (3 - 2 * u));
}

/**
 * The Backstab: straight across the bulge the Flange swings out round,
 * behind the band room, over its cellar with the doors flung open. No
 * rails. There only on the final lap, for the big shot who knows better.
 */
function buildBackstab(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'The Backstab', { halfWidth: 6, surface: 'carpet' });
  b.straight(30);
  b.section('The Cellar Doors', { halfWidth: 4.5, surface: 'boards' });
  b.elevate(0).straight(12).elevate(1);
  const cellar = chord - 2 * b.s;
  const boxes = b.s + cellar / 2;
  b.bridge(cellar, 7);
  b.elevate(1).straight(12).elevate(0);
  b.section('The Backstab', { halfWidth: 6, surface: 'carpet' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'The Backstab', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: ['final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
