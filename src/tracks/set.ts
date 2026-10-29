import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.1;
const START: Pose = { x: -170 * K, z: -210 * K, h: Math.PI / 2 };
const FINISH = 45;
/** The Snout of a Jackal: out along the snout and back round its tip, a hairpin this tight. */
const SNOUT = 80;
const SNOUT_R = 24;
/** The Tail of a Snake: this many bends, slithering. */
const TAIL = 5;
/** The Tornado: a full turn round the eye of the storm, climbing this high, over the road below. */
const TORNADO_R = 46;
const TORNADO_TOP = 14;
/** Moonbeams: a crest this high. */
const MOON = 6;
/** How deep Slay the Mighty Set is sunk, and its walls. */
const DEPTH = 6;
const WALL = 6;
/** Eighty Years of Conflict swings out in three arcs of this radius and turn; the Tomb cuts straight through. */
const CONFLICT_R = 40;
const CONFLICT_TURN = 70;

/**
 * Set (the Silver Cord Cup's second), after the song about the Egyptian
 * god of the desert, of storms and of chaos: the snout of a jackal and the
 * tail of a snake, slinking through the desert; he gorges on moonbeams and
 * bathes in quantum foam; a tornado lifts him high and throws him around,
 * his bones shatter, but the god doesn't bend; "God of duality and king of
 * the fight, right eye the sun and left the moon's light"; "slay the mighty
 * Set"; eighty years of conflict with Horus; love letter death threats
 * written in the tomb; hieroglyphic. The world is the red land at the edge
 * of day and night, the sun going down one side and the moon up the other,
 * obelisks and the god's statues, a colossus of Set sat in the sand. The
 * lap: Through the Desert (two kickers), out along the Snout of a Jackal
 * and back round its tip, the Tail of a Snake slithering, Moonbeams over a
 * crest and the Quantum Foam, the Tornado (a full turn climbing to 14 m,
 * over the road below) and Thrown Around off the top of it, Bones Did
 * Shatter (a leap over a ravine), Slay the Mighty Set sunk 6 m between
 * temple walls, his eyes, the sun and the moon, rolling across the road;
 * Day into Night, squeezed narrow; Eighty Years of Conflict, swinging out;
 * and Hieroglyphic home. Shortcut: the Tomb, straight through a pyramid
 * under Eighty Years of Conflict, unsealed from lap 2.
 */
export function buildSet(): TrackDef {
  const b = new TrackBuilder(START, 'Through the Desert', { halfWidth: 11, surface: 'hieroglyph' });
  b.scale = K;
  b.straight(30).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(30);

  // Out along the jackal's long snout and back round its tip.
  b.section('Snout of a Jackal', { halfWidth: 9.5, wallHeight: 1.2, surface: 'hieroglyph' });
  b.mark('snout');
  b.arc(40, 90);
  b.straight(SNOUT);
  b.arc(SNOUT_R, -180);
  b.straight(SNOUT);
  b.mark('snoutEnd');
  b.arc(40, 90);

  b.section('Tail of a Snake', { halfWidth: 9.5, wallHeight: 1.2, surface: 'hieroglyph' });
  b.mark('tail');
  b.arc(30, 30);
  for (let k = 0; k < TAIL - 2; k++) b.arc(30, k % 2 ? 60 : -60);
  b.arc(30, 30);
  b.mark('tailEnd');

  b.section('Moonbeams', { halfWidth: 10.5, surface: 'hieroglyph' });
  b.mark('moon');
  b.arc(90, -60);
  b.mark('moonEnd');
  b.section('Quantum Foam', { halfWidth: 10.5, surface: 'hieroglyph' });
  b.mark('foam');
  b.straight(60);
  b.mark('foamEnd');

  // The Tornado: lifted high, round the eye of the storm and over the road coming in.
  b.section('The Tornado', { halfWidth: 9.5, wallHeight: 1.2, surface: 'hieroglyph', bridge: true });
  b.mark('tornado');
  b.arc(TORNADO_R, -360);
  b.mark('tornadoTop');
  b.straight(15);
  b.section('Thrown Around', { halfWidth: 10, wallHeight: 1.2, surface: 'hieroglyph' });
  b.mark('thrown');
  b.arc(40, 30).arc(40, -60);
  b.straight(20);

  // His bones did shatter: a leap over a ravine.
  b.section('Bones Did Shatter', { halfWidth: 9, wallHeight: 1.2, surface: 'hieroglyph' });
  b.mark('bones');
  b.straight(15).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20);
  b.elevate(0).straight(15);
  b.mark('bonesEnd');
  b.arc(50, -90);

  // Slay the mighty Set: sunk between temple walls, his eyes rolling across.
  b.section('Slay the Mighty Set', { halfWidth: 9, wallHeight: WALL, surface: 'hieroglyph' });
  b.mark('slay');
  b.straight(40).arc(70, 25).arc(70, -50).arc(70, 25).straight(40);
  b.mark('slayEnd');
  b.straight(10);

  // Day squeezed into night: narrow, and a chicane.
  b.section('Day into Night', { halfWidth: 7.5, wallHeight: 1.2, surface: 'hieroglyph' });
  b.mark('squeeze');
  b.arc(26, -45).arc(26, 90).arc(26, -45);
  b.mark('squeezeEnd');
  b.straight(30);

  b.section('Eighty Years of Conflict', { halfWidth: 10.5, surface: 'hieroglyph' });
  b.mark('conflict');
  b.straight(10);
  b.mark('tombFrom');
  b.arc(CONFLICT_R, CONFLICT_TURN).arc(CONFLICT_R, -2 * CONFLICT_TURN).arc(CONFLICT_R, CONFLICT_TURN);
  b.mark('tombTo');
  b.straight(20);
  b.arc(50, -90);

  // Hieroglyphic: down the west side and round onto the finish.
  b.section('Hieroglyphic', { halfWidth: 11, surface: 'hieroglyph' });
  b.mark('glyph');
  b.turnTo(offsetPose(START, -FINISH * K), 50);
  b.section('Finish Straight', { halfWidth: 11, surface: 'hieroglyph' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // A crest under the moon; the quantum foam bubbling the road.
  b.profile(m('moon'), m('moonEnd'), (u) => MOON * Math.sin(Math.PI * u) ** 2);
  b.profile(m('foam'), m('foamEnd'), (u) => 1.6 * Math.sin(Math.PI * 3 * u) ** 2);
  // Up round the tornado, and thrown off the top of it.
  b.profile(m('tornado'), m('tornadoTop'), (u) => TORNADO_TOP * u);
  b.profile(m('tornadoTop'), m('thrown', 25), () => TORNADO_TOP, 10);
  plunge(b, m('thrown', 25), TORNADO_TOP, m('bones', 10), 0);
  ease(b, m('slay', 5), 0, m('slay', 40), -DEPTH);
  b.profile(m('slay', 40), m('slayEnd', -30), () => -DEPTH, 10);
  ease(b, m('slayEnd', -30), -DEPTH, m('slayEnd', 10), 0);

  const main = b.finish(true);
  const tomb = buildTomb(b.marks.tombFrom, b.marks.tombTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'set',
    name: 'Set',
    main,
    branches: [tomb.branch],
    pits: [...b.pits, ...tomb.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('tailEnd', 5), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('squeezeEnd', 5), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['snout', 'tail', 'moon', 'tornado', 'bones', 'slay', 'squeeze', 'conflict'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'setGate', ribbon: -1, s: 6 },
      { kind: 'setGate', ribbon: -1, s: at('slay', -2) },
      { kind: 'setColossus', ribbon: -1, s: at('foam', 20), lateral: -150 },
    ],
    itemBoxes: [
      { s: 80, count: 4 },
      { s: at('moon', 30), count: 4 },
      { s: at('thrown', 20), count: 3 },
      { s: at('slay', 100), count: 3 },
      { s: at('conflict', 5), count: 4 },
      { s: tomb.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'sunMoon', at: [at('slay', 55), at('slay', 110), at('slay', 165)], period: 4.6 },
      { kind: 'sunMoon', at: [at('foam', 30)], period: 5 },
    ],
    theme: 'set',
    music: { lap: 'set', finalLap: 'set-final-lap' },
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
 * The Tomb: straight through a pyramid under the bulge Eighty Years of
 * Conflict swings out round, past the love letter death threats written on
 * its walls. Sealed on lap 1: drive on and you drop into the shaft.
 */
function buildTomb(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'The Tomb', { halfWidth: 6, surface: 'hieroglyph' });
  b.straight(30);
  b.section('The Burial Shaft', { halfWidth: 4.5, surface: 'hieroglyph' });
  b.elevate(0).straight(12).elevate(1);
  const shaft = chord - 2 * b.s;
  const boxes = b.s + shaft / 2;
  b.bridge(shaft, 7);
  b.elevate(1).straight(12).elevate(0);
  b.section('The Tomb', { halfWidth: 6, surface: 'hieroglyph' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'The Tomb', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2, 3], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
