import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.0;
/** The whole lap is laid this far north of the map's middle, so it sits in the middle of it. */
const SHIFT = 64;
/** A waypoint, in builder units. */
const wp = (x: number, z: number, h: number): Pose => ({ x: x * K, z: (z + SHIFT) * K, h });
const W = -Math.PI / 2;
/** How far north the two ribs cross the canyon, and the cul-de-sac's neck crosses over its top. */
const RIB_A = 30;
const RIB_B = -60;
const NECK = 80;
const START: Pose = wp(-50, NECK, W);
const FINISH = 45;
/** The canyon in the chest: sunk this deep between its walls, the spine of the lap. */
const DEPTH = 7;
const WALL = 6;
/** The ribs: the road crosses the canyon on decks this high. */
const RIB = 3;
/** Until the End: the climb to a crest this high, and off it. */
const CREST = 10;
/** Hell and Back: the main road swings out round the hellmouth in three arcs of this radius and turn; the shortcut dives straight through it. */
const HELL_R = 36;
const HELL_TURN = 80;
/** The cul-de-sac's turning circle. */
const BULB = 38;
/** I Don't Feel Anything: bends in the song's eleven, three and three and three and two, this many degrees a beat. */
const ELEVEN = [3, 3, 3, 2];
const FEEL_R = 40;
const FEEL_TURN = 13;
/** The hollows' bar: eleven sixteenths, a row of four in The Void and two more in the canyon under the ribs. */
const PERIOD = 4.4;

/**
 * Altered Beast IV (the Altered Beast Cup's last), after the last of The
 * Tale of the Altered Beast, the story's end: the beast you became is
 * "completely satisfied", it feels no love, no pain, kills for sport, so
 * crooked and curled; "I went to hell and back" to be this, "an altered
 * beast until the end", and "Never!" will it give it up; "I don't feel
 * anything", chanted over and over in eleven sixteenths; ruthless and
 * savage, but the longer it kills the harder the void is to fill, "a
 * canyon has opened up inside of your chest", no turning back, "the end of
 * the cul-de-sac". The world is the inside of the beast that feels
 * nothing: ash and bone under a numb grey sky, the colour drained from
 * everything but the canyon's red walls of sinew, dead trees crooked and
 * curled, carcasses, holes in the ground with nothing in them. The lap is
 * the beast laid open, seen from above: the canyon its spine, the road its
 * ribs, the cul-de-sac its head. Past the No Through Road sign (two
 * kickers), Kill for Sport wiggles and then arches over the canyon on a
 * deck, the first rib; So Crooked and Curled, a hook tightening round;
 * Completely Satisfied, the second rib, back over the canyon; Hell and
 * Back swings out round the hellmouth; Until the End climbs to a 10 m
 * crest, and Never! flies off it and leaps a gap; I Don't Feel Anything's
 * bends fall three, three, three and two, the song's eleven; Ruthless and
 * Savage, a hairpin; then down into The Void, sunk 7 m between walls, the
 * hollows yawning open in the road on the beat, and on up the Canyon in
 * the Chest under both ribs and the ribcage arching over it; and up out of
 * it into the End of the Cul-de-Sac, round its turning circle and back out
 * over the canyon's top, home. Shortcut: Hell and Back, straight across
 * the hellmouth, diving down into it and climbing back out, on the final
 * lap only.
 */

export function buildAlteredBeastIV(): TrackDef {
  const b = new TrackBuilder(START, 'No Love No Pain', { halfWidth: 11, surface: 'bone' });
  b.scale = K;
  b.straight(20).mark('kick1').kicker().straight(25).mark('kick2').kicker().straight(10);
  b.arc(30, -90).straight(5).arc(30, -90);

  b.section('Kill for Sport', { halfWidth: 10, wallHeight: 1.2, surface: 'bone' });
  b.mark('sport');
  b.arc(22, -30).arc(22, 60).arc(22, -60).arc(22, 30);
  b.hermiteTo(wp(-40, RIB_A, 1.25));
  b.mark('ribA');
  b.section('Kill for Sport', { halfWidth: 10, wallHeight: 1.2, surface: 'bone', bridge: true });
  b.hermiteTo(wp(40, RIB_A, 1.9));
  b.mark('ribAEnd');
  b.hermiteTo(wp(120, RIB_A - 30, 2.0));

  b.section('So Crooked and Curled', { halfWidth: 9.5, wallHeight: 1.2, surface: 'bone' });
  b.mark('crooked');
  b.arc(30, -35);
  b.spiral(50, 22, 200);
  b.mark('crookedEnd');

  b.section('Completely Satisfied', { halfWidth: 10.5, wallHeight: 1.2, surface: 'bone' });
  b.mark('satisfied');
  b.hermiteTo(wp(40, RIB_B, -1.25));
  b.mark('ribB');
  b.section('Completely Satisfied', { halfWidth: 10.5, wallHeight: 1.2, surface: 'bone', bridge: true });
  b.hermiteTo(wp(-40, RIB_B, -1.9));
  b.mark('ribBEnd');
  b.hermiteTo(wp(-115, RIB_B - 20, -2.2));

  b.section('Hell and Back', { halfWidth: 9.5, surface: 'bone' });
  b.mark('hell');
  b.hermiteTo(wp(-150, RIB_B - 40, Math.PI));
  b.straight(10);
  b.mark('hellFrom');
  b.arc(HELL_R, HELL_TURN).arc(HELL_R, -2 * HELL_TURN).arc(HELL_R, HELL_TURN);
  b.mark('hellTo');
  b.straight(10);
  b.arc(36, -90);

  b.section('Until the End', { halfWidth: 10, wallHeight: 1.2, surface: 'bone' });
  b.mark('until');
  b.arc(90, -22).arc(90, 22);
  b.mark('summit');
  b.section('Never', { halfWidth: 10, wallHeight: 1.2, surface: 'bone' });
  b.mark('never');
  b.straight(15).arc(70, 25).arc(70, -25);
  b.straight(10).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20);
  b.elevate(0).straight(15);
  b.mark('neverEnd');

  b.section("I Don't Feel Anything", { halfWidth: 9.5, wallHeight: 1.2, surface: 'bone' });
  b.mark('feel');
  b.arc(FEEL_R, -FEEL_TURN * 1.5);
  ELEVEN.forEach((beats, k) => b.arc(FEEL_R, (k % 2 ? -1 : 1) * FEEL_TURN * beats));
  b.arc(FEEL_R, FEEL_TURN * 0.5);
  b.mark('feelEnd');

  b.section('Ruthless and Savage', { halfWidth: 9, wallHeight: 1.2, surface: 'bone' });
  b.mark('savage');
  b.straight(10);
  b.arc(26, -180);
  b.mark('savageEnd');
  b.straight(10);

  b.section('The Void', { halfWidth: 9.5, wallHeight: WALL, surface: 'bone' });
  b.mark('void');
  b.hermiteTo(wp(60, RIB_B - 125, -0.9));
  b.hermiteTo(wp(0, RIB_B - 60, 0));
  b.mark('canyonIn');
  b.section('Canyon in the Chest', { halfWidth: 9.5, wallHeight: WALL, surface: 'bone' });
  b.mark('canyon');
  b.hermiteTo(wp(0, RIB_B, 0));
  b.mark('underB');
  // Where the heart was, between the ribs: the canyon kinks round it.
  b.hermiteTo(wp(16, (RIB_A + RIB_B) / 2, 0));
  b.mark('heart');
  b.hermiteTo(wp(0, RIB_A, 0));
  b.mark('underA');
  b.hermiteTo(wp(0, NECK, 0));
  b.mark('canyonEnd');

  b.section('End of the Cul-de-Sac', { halfWidth: 10.5, wallHeight: 1.2, surface: 'bone' });
  b.mark('culdesac');
  b.straight(BULB);
  b.mark('bulb');
  b.arc(BULB, 270);
  b.mark('neck');
  b.section('End of the Cul-de-Sac', { halfWidth: 10.5, wallHeight: 1.2, surface: 'bone', bridge: true });
  b.hermiteTo(offsetPose(START, -FINISH * K));
  b.section('Finish Straight', { halfWidth: 11, surface: 'bone' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  ease(b, m('ribA', -60), 0, m('ribA'), RIB);
  b.profile(m('ribA'), m('ribAEnd'), () => RIB, 10);
  ease(b, m('ribAEnd'), RIB, m('ribAEnd', 60), 0);
  ease(b, m('ribB', -60), 0, m('ribB'), RIB);
  b.profile(m('ribB'), m('ribBEnd'), () => RIB, 10);
  ease(b, m('ribBEnd'), RIB, m('ribBEnd', 60), 0);
  ease(b, m('until'), 0, m('summit'), CREST);
  plunge(b, m('summit'), CREST, m('never', 50), 0);
  ease(b, m('void', 10), 0, m('void', 70), -DEPTH);
  b.profile(m('void', 70), m('canyonIn', 20), () => -DEPTH, 10);
  b.profile(m('canyonIn', 20), m('canyonEnd', 20), () => -DEPTH, 10);
  ease(b, m('canyonEnd', 20), -DEPTH, m('bulb', 30), 0);
  ease(b, m('neck', -50), 0, m('neck', -5), RIB + 1);
  b.profile(m('neck', -5), m('neck', 50), () => RIB + 1, 10);
  ease(b, m('neck', 50), RIB + 1, m('finish', 20), 0);

  const main = b.finish(true);
  const hell = buildHellAndBack(b.marks.hellFrom, b.marks.hellTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'altered-beast-iv',
    name: 'Altered Beast IV',
    main,
    branches: [hell.branch],
    pits: [...b.pits, ...hell.pits],
    boostPads: [
      { s: 36, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('crookedEnd', 5), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('feelEnd', 5), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['sport', 'ribA', 'crooked', 'satisfied', 'hell', 'until', 'never', 'feel', 'savage', 'void', 'canyon', 'heart', 'culdesac', 'neck'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 265,
    landmarks: [
      { kind: 'culDeSac', ribbon: -1, s: 6 },
      { kind: 'culDeSac', ribbon: -1, s: at('bulb', (BULB * Math.PI * 3) / 4), lateral: -BULB },
      { kind: 'ribcage', ribbon: -1, s: at('canyon', 16) },
      { kind: 'ribcage', ribbon: -1, s: at('heart', 0) },
      { kind: 'hellmouth', ribbon: 0, s: hell.boxes },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('satisfied', 25), count: 4 },
      { s: at('hell', 30), count: 4 },
      { s: at('feel', 15), count: 3 },
      { s: at('heart', 22), count: 3 },
      { s: at('underA', 30), count: 4 },
      { s: hell.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'void', at: [at('void', 95), at('void', 125), at('void', 155), at('void', 185)], period: PERIOD },
      { kind: 'void', at: [at('heart', -12), at('heart', 12)], period: PERIOD },
    ],
    theme: 'hollow',
    music: { lap: 'altered-beast-iv', finalLap: 'altered-beast-iv-final-lap' },
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
 * Hell and Back's dive: how deep it goes down into the hellmouth, over how
 * long it goes down and comes up; how long the hellmouth is (no longer than
 * fits where the main road has swung well out round it), and how deep.
 */
const HELL_DEPTH = 5;
const HELL_RAMP = 20;
const HELL_MOUTH = 48;
const HELL_PIT = 24;

/**
 * Hell and Back: straight across the hellmouth the main road swings out
 * round, on a causeway diving down into it and climbing back out, no
 * rails. On the final lap only; on the others there's nothing over it.
 */
function buildHellAndBack(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Hell and Back', { halfWidth: 6, surface: 'bone' });
  b.straight((chord - HELL_MOUTH) / 2);
  b.section('To Hell', { halfWidth: 5, surface: 'bone' });
  const s0 = b.s;
  const deep = HELL_MOUTH;
  const boxes = s0 + deep / 2;
  b.bridge(deep, 0, undefined, HELL_PIT);
  b.section('Hell and Back', { halfWidth: 6, surface: 'bone' });
  b.straight(chord - b.s);
  b.profile(s0, s0 + HELL_RAMP, (u) => -HELL_DEPTH * u * u * (3 - 2 * u));
  b.profile(s0 + HELL_RAMP, s0 + deep - HELL_RAMP, () => -HELL_DEPTH, 10);
  b.profile(s0 + deep - HELL_RAMP, s0 + deep, (u) => -HELL_DEPTH * (1 - u * u * (3 - 2 * u)));
  const branch: BranchDef = { name: 'Hell and Back', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: ['final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
