import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.2;
const START: Pose = { x: -262 * K, z: -40 * K, h: Math.PI / 2 };
const FINISH = 45;
/** Dual Mono: the right channel swings out round the speaker stacks in three arcs of this radius and turn; the left runs straight. */
const MONO_R = 40;
const MONO_TURN = 60;
/** How deep Inches is sunk, and its walls. */
const DEPTH = 6;
const WALL = 6;
/** The Stitch-Up: tight zigzags across the road, one a stitch. */
const STITCH_R = 20;
const STITCH_TURN = 70;
/** How high the blade's edge rises before it drops toward the tip. */
const CREST = 9;

/**
 * Cut Throat Boogie (the 12 Bar Bruise Cup's third), after the album's
 * boogie, the band's first, and the first song Ambrose sang: a house party
 * gone wrong, a play fight and a broken bottle an inch from his jugular,
 * written after the night it happened to him at sixteen. Stu said it was
 * mixed in dual mono, so in one ear it sounds weird. The world is that
 * party, all night: a seventies boogie in a backyard, a lit dance floor for
 * a road, mirror balls, lava lamps and fairy lights, harmonica on the
 * gates. The lap is an open cut-throat razor: down Boogie Straight (two
 * kickers) along the handle, and Set Sail ("buckle me in"), a leap over
 * the pool, round the Pivot where the blade folds, and back along the
 * blade's spine through Dual Mono, where the road splits in two, the right
 * channel swinging out round speaker stacks and the left channel straight
 * through, narrow and unrailed. Then Inches, sunk 6 m between walls of
 * speakers, cut-throat razors swinging across the road (a close shave is a
 * boost); the Stitch-Up, zigzag after zigzag; and the Blade Edge, one long
 * curve round the tip and home.
 */
export function buildCutThroatBoogie(): TrackDef {
  const b = new TrackBuilder(START, 'Boogie Straight', { halfWidth: 11, surface: 'dancefloor' });
  b.scale = K;
  // Along the underside of the handle.
  b.straight(40).mark('kick1').kicker().straight(34).mark('kick2').kicker().straight(110);

  // Set Sail: over the pool, at the pivot.
  b.section('Set Sail', { halfWidth: 9, wallHeight: 1.2, surface: 'dancefloor' });
  b.mark('sail');
  b.straight(20).mark('ramp').elevate(0).rise(18, 3);
  b.gap(13, 30, 'water');
  b.elevate(0).straight(25);
  b.mark('landed');

  // The blade's edge: one long curve out to the tip.
  b.section('The Blade Edge', { halfWidth: 10.5, surface: 'dancefloor' });
  b.mark('edge');
  b.arc(160, 28).straight(80).arc(120, -68);
  b.section('The Tip', { halfWidth: 10, wallHeight: 1.2, surface: 'dancefloor' });
  b.mark('tip');
  b.arc(40, -140);

  // Back along the spine: the road splits into left and right channels.
  b.section('Dual Mono', { halfWidth: 10, surface: 'dancefloor' });
  b.mark('mono');
  b.straight(20);
  b.mark('monoFrom');
  b.arc(MONO_R, MONO_TURN).arc(MONO_R, -2 * MONO_TURN).arc(MONO_R, MONO_TURN);
  b.mark('monoTo');
  b.straight(20);

  // Inches: the narrow back of the pivot, sunk between walls of speakers.
  b.section('Inches', { halfWidth: 9, wallHeight: WALL, surface: 'dancefloor' });
  b.mark('inches');
  b.arc(80, 20).straight(60).arc(80, -20).straight(40);
  b.mark('inchesEnd');
  b.straight(10);

  // Along the top of the handle, stitched.
  b.section('The Stitch-Up', { halfWidth: 10, wallHeight: 1.2, surface: 'dancefloor' });
  b.mark('stitch');
  b.arc(STITCH_R, -STITCH_TURN / 2);
  for (let k = 0; k < 4; k++) b.arc(STITCH_R, k % 2 ? -STITCH_TURN : STITCH_TURN);
  b.arc(STITCH_R, STITCH_TURN / 2);
  b.section('Handle End', { halfWidth: 10.5, surface: 'dancefloor' });
  b.mark('handle');
  b.straight(40);

  b.turnTo(offsetPose(START, -FINISH * K), 34);
  b.section('Finish Straight', { halfWidth: 11, surface: 'dancefloor' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // The blade's edge swells up its belly and drops off toward the tip.
  ease(b, m('edge', 10), 0, m('edge', 130), CREST);
  plunge(b, m('edge', 130), CREST, m('edge', 175), 0);
  ease(b, m('inches', 5), 0, m('inches', 50), -DEPTH);
  ease(b, m('inches', 120), -DEPTH, m('inchesEnd', 10), 0);

  const main = b.finish(true);
  const left = buildLeftChannel(b.marks.monoFrom, b.marks.monoTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'cut-throat-boogie',
    name: 'Cut Throat Boogie',
    main,
    branches: [left.branch],
    pits: [...b.pits, ...left.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('sail', 10), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('edge', 120), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['sail', 'edge', 'tip', 'mono', 'inches', 'stitch', 'handle'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'harmonicaGate', ribbon: -1, s: 6 },
      { kind: 'harmonicaGate', ribbon: -1, s: at('inches', -2) },
      { kind: 'mirrorBall', ribbon: -1, s: at('edge', 60), lateral: -130 },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('landed', 5), count: 4 },
      { s: at('tip', 10), count: 3 },
      { s: at('inches', 95), count: 3 },
      { s: at('handle', 20), count: 4 },
      { s: left.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'razors', at: [at('inches', 55), at('inches', 95), at('inches', 135)], period: 3.6 },
      { kind: 'razors', at: [at('stitch', 50)], period: 4 },
    ],
    theme: 'boogie',
    music: { lap: 'cut-throat-boogie', finalLap: 'cut-throat-boogie-final-lap' },
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
 * The Left Channel: Dual Mono's other half, straight through where the
 * right channel swings out. Narrow and unrailed, over the speaker cables,
 * on every lap.
 */
function buildLeftChannel(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Left Channel', { halfWidth: 5.5, surface: 'dancefloor' });
  b.straight(chord);
  const branch: BranchDef = { name: 'Left Channel', mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
  return { branch, pits: b.pits, boxes: b.s / 2 };
}
