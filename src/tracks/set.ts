import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.05;
/**
 * The lap is a storm: the road spirals in round its eye, here, from this far
 * out to this close, and after the tornado is flung back out round it,
 * crossing over the spiral in.
 */
const EYE = { x: -5, z: 55 };
const OUTER = 360;
const INNER = 95;
/** The spiral out keeps this close round the eye, then is flung out this far, across the spiral in. */
const CLOSE = 150;
const WIDE = 300;
const DEG = Math.PI / 180;
/** A point on the spiral in, `phi` radians round from the start, heading along it. */
function inward(phi: number): Pose {
  return spiral(phi, (u) => OUTER - (OUTER - INNER) * u);
}
/** A point on the spiral out, `psi` radians round from the eye: close round the eye, flung out across the spiral in, then round the edge of the storm. */
function outward(psi: number): Pose {
  const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  return spiral(psi, (u) => INNER + (CLOSE - INNER) * smooth(u / 0.42) + (WIDE - CLOSE) * smooth((u - 0.44) / 0.22) + (OUTER - WIDE) * smooth((u - 0.66) / 0.34));
}
/** A point `a` radians anticlockwise round the eye from due south, at radius r(a / 2pi), heading along the curve. */
function spiral(a: number, r: (u: number) => number): Pose {
  const at = (t: number) => {
    const th = -Math.PI / 2 + t;
    const rr = r(t / (2 * Math.PI));
    return { x: (EYE.x + rr * Math.cos(th)) * K, z: (EYE.z + rr * Math.sin(th)) * K };
  };
  const p = at(a);
  const q = at(a + 1e-4);
  const o = at(a - 1e-4);
  return { x: p.x, z: p.z, h: Math.atan2(q.x - o.x, q.z - o.z) };
}
const START: Pose = { ...inward(0), h: Math.PI / 2 };
const FINISH = 45;
/** The Snout of a Jackal: out along the snout and back round its tip, a hairpin this tight. */
const SNOUT = 130;
const SNOUT_R = 28;
/** The Tail of a Snake: this many bends, slithering. */
const TAIL = 5;
/** The Tornado: a full turn round the eye of the storm, climbing this high, over the road below. */
const TORNADO_R = 46;
const TORNADO_TOP = 16;
/** Thrown Around: still this high where it crosses back over the spiral in. */
const THROWN = 10;
/** The desert's dunes and the storm's gusts: swells this high. */
const DUNE = 2;
const GUST = 3;
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
 * obelisks and the god's statues, a colossus of Set sat in the sand in the
 * eye of the storm. The lap is the storm, chaos wound round its eye: in
 * along one spiral, a full turn up the tornado, and thrown back out along
 * another that crosses over it. Through the Desert (two kickers, then
 * dunes) sweeping up the south-east; the Snout of a Jackal, out along it
 * toward the eye and back round its tip, under the road thrown out of the
 * tornado; the Tail of a Snake slithering up the east side, the jackal's
 * head and the snake's tail together; Moonbeams over a crest and the
 * Quantum Foam bubbling across the top; the Storm, its gusts rolling the
 * road as it winds in down the west to the eye; the Tornado, a full turn
 * climbing to 16 m over its own road in; Thrown Around, flung out of the
 * top on a deck, back over the snout, round the eye and out across the
 * spiral in over the Quantum Foam, and off a crest; Bones Did Shatter (a
 * leap over a ravine); Slay the Mighty Set sunk 6 m between temple walls
 * down the west side, his eyes, the sun and the moon, rolling across the
 * road; Day into Night, squeezed narrow; Eighty Years of Conflict, swinging
 * out; and Hieroglyphic home. Shortcut: the Tomb, straight through a
 * pyramid inside Eighty Years of Conflict, unsealed from lap 2. The lap is
 * long, so a race is two of them.
 */
export function buildSet(): TrackDef {
  const b = new TrackBuilder(START, 'Through the Desert', { halfWidth: 11, surface: 'hieroglyph' });
  b.scale = K;
  const inTo = (deg: number) => b.hermiteTo(inward(deg * DEG));
  const outTo = (deg: number) => b.hermiteTo(outward(deg * DEG));
  b.straight(30).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(10);
  // The spiral in, round the edge of the storm.
  inTo(35);
  inTo(65);

  // Out along the jackal's long snout, in toward the eye of the storm, and back round its tip.
  b.section('Snout of a Jackal', { halfWidth: 9.5, wallHeight: 1.2, surface: 'hieroglyph' });
  b.mark('snout');
  b.arc(40, -90);
  b.straight(SNOUT);
  b.arc(SNOUT_R, 180);
  b.straight(SNOUT);
  b.mark('snoutEnd');
  b.arc(40, -90);

  b.section('Tail of a Snake', { halfWidth: 9.5, wallHeight: 1.2, surface: 'hieroglyph' });
  b.mark('tail');
  inTo(115);
  b.arc(30, 30);
  for (let k = 0; k < TAIL - 2; k++) b.arc(30, k % 2 ? 60 : -60);
  b.arc(30, 30);
  b.mark('tailEnd');
  inTo(150);

  b.section('Moonbeams', { halfWidth: 10.5, surface: 'hieroglyph' });
  b.mark('moon');
  inTo(170);
  b.mark('moonEnd');
  b.section('Quantum Foam', { halfWidth: 10.5, surface: 'hieroglyph' });
  b.mark('foam');
  inTo(195);
  inTo(225);
  b.mark('foamEnd');

  // Winding in to the eye, and lifted up the tornado: a full turn climbing over the road in.
  b.section('The Storm', { halfWidth: 10, wallHeight: 1.2, surface: 'hieroglyph' });
  b.mark('storm');
  for (let d = 255; d < 360; d += 30) inTo(d);
  inTo(360);
  b.section('The Tornado', { halfWidth: 9.5, wallHeight: 1.2, surface: 'hieroglyph', bridge: true });
  b.mark('tornado');
  b.arc(TORNADO_R, -360);
  b.mark('tornadoTop');
  b.straight(10);
  // Thrown out of the top on a deck: back over the snout, round the eye, and out over the spiral in.
  b.section('Thrown Around', { halfWidth: 10, wallHeight: 1.2, surface: 'hieroglyph', bridge: true });
  b.mark('thrown');
  for (let d = 30; d <= 210; d += 30) outTo(d);
  b.mark('over');
  outTo(225);
  b.mark('thrownEnd');

  // His bones did shatter: a leap over a ravine.
  b.section('Bones Did Shatter', { halfWidth: 9, wallHeight: 1.2, surface: 'hieroglyph' });
  b.mark('bones');
  b.straight(15).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20);
  b.elevate(0).straight(15);
  b.mark('bonesEnd');
  // The spiral out, round the edge of the storm and home.
  outTo(245);

  // Slay the mighty Set: sunk between temple walls, his eyes rolling across.
  b.section('Slay the Mighty Set', { halfWidth: 9, wallHeight: WALL, surface: 'hieroglyph' });
  b.mark('slay');
  outTo(265);
  outTo(285);
  b.mark('slayEnd');
  b.straight(10);

  // Day squeezed into night: narrow, and a chicane.
  b.section('Day into Night', { halfWidth: 7.5, wallHeight: 1.2, surface: 'hieroglyph' });
  b.mark('squeeze');
  b.arc(26, -45).arc(26, 90).arc(26, -45);
  b.mark('squeezeEnd');
  outTo(312);

  b.section('Eighty Years of Conflict', { halfWidth: 10.5, surface: 'hieroglyph' });
  b.mark('conflict');
  b.straight(10);
  b.mark('tombFrom');
  b.arc(CONFLICT_R, CONFLICT_TURN).arc(CONFLICT_R, -2 * CONFLICT_TURN).arc(CONFLICT_R, CONFLICT_TURN);
  b.mark('tombTo');

  b.section('Hieroglyphic', { halfWidth: 11, surface: 'hieroglyph' });
  b.mark('glyph');
  b.hermiteTo(offsetPose(START, -FINISH * K));
  b.section('Finish Straight', { halfWidth: 11, surface: 'hieroglyph' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // Dunes through the desert, and gusts of the storm rolling the road on the way in to the eye.
  b.profile(m('kick2', 30), m('snout', -20), (u) => DUNE * Math.sin(Math.PI * 3 * u) ** 2);
  b.profile(m('storm', 20), m('storm', 320), (u) => GUST * Math.sin(Math.PI * 2 * u) ** 2);
  // A crest under the moon; the quantum foam bubbling the road.
  b.profile(m('moon'), m('moonEnd'), (u) => MOON * Math.sin(Math.PI * u) ** 2);
  b.profile(m('foam'), m('foamEnd'), (u) => 1.6 * Math.sin(Math.PI * 4 * u) ** 2);
  // Up round the tornado, thrown off the top of it and held high over the spiral in, then off a crest.
  b.profile(m('tornado'), m('tornadoTop'), (u) => TORNADO_TOP * u);
  b.profile(m('tornadoTop'), m('thrown', 60), () => TORNADO_TOP, 10);
  ease(b, m('thrown', 60), TORNADO_TOP, m('over', -60), THROWN);
  b.profile(m('over', -60), m('over', 15), () => THROWN, 10);
  plunge(b, m('over', 15), THROWN, m('bones', 5), 0);
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
    checkpoints: ['snout', 'tail', 'moon', 'storm', 'tornado', 'thrown', 'bones', 'slay', 'squeeze', 'conflict'].map((k) => b.marks[k].s / main.length),
    laps: 2,
    bounds: 440,
    landmarks: [
      { kind: 'setGate', ribbon: -1, s: 6 },
      { kind: 'setGate', ribbon: -1, s: at('slay', -2) },
      { kind: 'setColossus', ribbon: -1, s: at('storm', 20), lateral: 120 },
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
