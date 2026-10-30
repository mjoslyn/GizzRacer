import { TrackBuilder, type Pose } from './builder';
import type { BranchDef, Landmark, TrackDef } from './track';

const K = 1.1;
/**
 * The lap is a double helix, the beast's DNA: two strands twisting round
 * one axis laid corner to corner across the map, out along one strand and
 * back along the other. The axis's direction, a half twist's length along
 * it, the helix's radius (how far either side of the axis each strand
 * swings), and its half twists: the strands cross at each.
 */
const AXIS_H = Math.PI / 4;
const HALF = 160;
const R = 90;
const TWISTS = 3;
/**
 * The hairpin at the far end: over the last two half twists the strands
 * close in toward the axis, to this share of the radius, and turn round
 * each other there.
 */
const PIN = 0.5;
const PIN_FROM = 2;
/** The two legs at the near end: the finish and start straight on one, the leap on the other. */
const LEG = 130;
const FINISH = 45;
/** The helix is shifted along its axis by this much, so the whole lap sits in the middle of the map. */
const SHIFT = -(TWISTS * HALF - LEG) / 2;
/** The decks a strand rides over the other on, and how deep it's sunk under it. */
const TIER = 8;
const DEPTH = 6;
const WALL = 6;
/** Steal a Peep leaves the first strand this far round the helix (in half turns) and rejoins it here, cutting across inside its swing. */
const PEEP_FROM = 0.56;
const PEEP_TO = 1.34;
const PEEP_R = 30;
/** Nine Pearl Fangs: three jaws down the gullet, this far apart, from this far in. */
const JAWS = 3;
const JAW_GAP = 26;
const JAWS_FROM = 20;

const AX = Math.sin(AXIS_H);
const AZ = Math.cos(AXIS_H);
/** Left of the axis's direction. */
const NX = Math.cos(AXIS_H);
const NZ = -Math.sin(AXIS_H);
/** A point `a` along the axis and `w` left of it. */
const at = (a: number, w: number): [number, number] => [(AX * (a + SHIFT) + NX * w) * K, (AZ * (a + SHIFT) + NZ * w) * K];
/** The strands' reach either side of the axis at angle `t` round the helix: the radius, closing in at the hairpin end. */
function reach(t: number): number {
  const u = Math.min(1, Math.max(0, (t / Math.PI - PIN_FROM) / (TWISTS - PIN_FROM)));
  return R * (1 - (1 - PIN) * u * u * (3 - 2 * u));
}
/** A point on strand `side` (1 the first, driven out; -1 the second, back) at angle `t` round the helix. */
const point = (side: number, t: number) => at((t / Math.PI) * HALF, side * reach(t) * Math.cos(t));
/** The pose on strand `side` at angle `t`, heading the way it's driven. */
function strand(side: number, t: number): Pose {
  const [x, z] = point(side, t);
  const [x0, z0] = point(side, t - 1e-4);
  const [x1, z1] = point(side, t + 1e-4);
  return { x, z, h: Math.atan2((x1 - x0) * side, (z1 - z0) * side) };
}
const START: Pose = (() => {
  const [x, z] = at(-LEG + FINISH, R);
  return { x, z, h: AXIS_H };
})();

/**
 * Altered Beast III (the Altered Beast Cup's third), after the third part
 * of the tale, run into Alter Me III: by the tree he finds a place to
 * hide, where he can steal a peep; he looks to the sky and sees angels
 * weep; the beast says "I see you, and I can see right through", and will
 * take him to its altered world; nine white teeth his gums bequeathed,
 * hair on his skin, feeling beastly, a new life trickling in; nine pearl
 * fangs, a true sign he's deformed, once a man, now a monstrosity reborn;
 * and in Alter Me III the chant, the beast's DNA dug into his nucleus. The
 * world is the altered world: flesh and fur under a bruised sky where
 * angels hang weeping, walls of gum lined with teeth, the beast's DNA
 * standing in twisted towers. The lap is that DNA, a double helix: out
 * along one strand and back along the other, the two twisting round each
 * other so they cross three times, and at every crossing one rides over
 * the other, as a helix's strands go: By the Tree (two kickers), Find a
 * Place to Hide under the other strand's deck, Steal a Peep round the
 * strand's first swing, Angels Weep climbing onto a deck over the way
 * back, I See You flying off its crest, the Altered World sunk 6 m between
 * walls of gum under the way back, Nine White Teeth as the strands close
 * in, and Hair on My Skin, the hairpin where they turn round each other.
 * Back: Feeling Beastly on a deck over the Altered World, Nine Pearl Fangs
 * sunk in the gullet, its jaws snapping shut one after another, under
 * Angels Weep; Monstrosity Reborn climbing out onto the deck over the
 * hiding place, and Into Your Nucleus, a leap and the long turn home. The
 * base pairs lie across between the strands. Shortcut: Steal a Peep, a
 * hidden lane cut across inside the first swing, every lap.
 */
export function buildAlteredBeastIII(): TrackDef {
  const b = new TrackBuilder(START, 'By the Tree', { halfWidth: 11, surface: 'fur' });
  b.scale = K;
  // Marks round the helix in eighths of a half twist: `a` on the way out, `b` on the way back.
  const out = (t: number, name = `a${t}`) => b.hermiteTo(strand(1, (t * Math.PI) / 8)).mark(name);
  const back = (t: number, name = `b${t}`) => b.hermiteTo(strand(-1, (t * Math.PI) / 8)).mark(name);
  b.straight(25).mark('kick1').kicker().straight(25).mark('kick2').kicker();
  out(0);
  out(1);
  b.section('Find a Place to Hide', { halfWidth: 10, wallHeight: 1.2, surface: 'fur' });
  for (const t of [2, 3, 4]) out(t);
  out(PEEP_FROM * 8, 'peepFrom');
  b.section('Steal a Peep', { halfWidth: 10.5, surface: 'fur' });
  for (const t of [6, 7, 8, 9]) out(t);
  out(PEEP_TO * 8, 'peepTo');
  b.section('Angels Weep', { halfWidth: 10, wallHeight: 1.2, surface: 'fur', bridge: true });
  for (const t of [11, 12, 13]) out(t);
  b.section('I See You', { halfWidth: 10, wallHeight: 1.2, surface: 'fur' });
  for (const t of [14, 15, 16]) out(t);
  b.section('Altered World', { halfWidth: 9.5, wallHeight: WALL, surface: 'fur' });
  for (const t of [17, 18, 19, 20, 21, 22]) out(t);
  b.section('Nine White Teeth', { halfWidth: 10, wallHeight: 1.2, surface: 'fur' });
  for (const t of [23, 24]) out(t);
  // Hair on my skin: the hairpin at the far end, the strands turned round each other.
  b.section('Hair on My Skin', { halfWidth: 10, wallHeight: 1.2, surface: 'fur' });
  b.arc(R * PIN, 180);
  b.mark('b24');
  b.section('Feeling Beastly', { halfWidth: 10, wallHeight: 1.2, surface: 'fur', bridge: true });
  for (const t of [23, 22, 21, 20, 19]) back(t);
  b.section('Nine Pearl Fangs', { halfWidth: 9.5, wallHeight: WALL, surface: 'fur' });
  for (const t of [18, 17, 16, 15, 14, 13, 12, 11, 10]) back(t);
  b.section('Monstrosity Reborn', { halfWidth: 10, wallHeight: 1.2, surface: 'fur', bridge: true });
  for (const t of [9, 8, 7, 6, 5, 4, 3]) back(t);
  // Into your nucleus: a leap off the end of the strand, and the long turn home.
  b.section('Into Your Nucleus', { halfWidth: 10.5, wallHeight: 1.2, surface: 'fur' });
  for (const t of [2, 1, 0]) back(t);
  b.straight(20).mark('ramp').elevate(0).rise(18, 3);
  b.gap(14, 20);
  b.elevate(0).straight(LEG - 20 - 18 - 14);
  b.mark('leapEnd');
  b.arc(R, -180);
  b.section('Finish Straight', { halfWidth: 11, surface: 'fur' });
  b.mark('finish');
  b.hermiteTo(START);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // Over and under, as a helix's strands go. Out, the first strand runs under the second at the first crossing
  // (on the ground, the second on a deck), over it at the second, and sunk under it at the third; back, the
  // second strand the other way round.
  ease(b, m('a11', -10), 0, m('a11', 25), TIER);
  b.profile(m('a11', 25), m('a13'), () => TIER, 10);
  plunge(b, m('a13'), TIER, m('a15'), 0);
  ease(b, m('a17'), 0, m('a18', 10), -DEPTH);
  b.profile(m('a18', 10), m('a22', -10), () => -DEPTH, 10);
  ease(b, m('a22', -10), -DEPTH, m('a23', 10), 0);
  ease(b, m('b23'), 0, m('b21'), TIER);
  b.profile(m('b21'), m('b19'), () => TIER, 10);
  plunge(b, m('b19'), TIER, m('b17'), 0);
  ease(b, m('b16', -10), 0, m('b14'), -DEPTH);
  b.profile(m('b14'), m('b10'), () => -DEPTH, 10);
  ease(b, m('b10'), -DEPTH, m('b8'), 0);
  ease(b, m('b8'), 0, m('b6'), TIER);
  b.profile(m('b6'), m('b3'), () => TIER, 10);
  plunge(b, m('b3'), TIER, m('b1'), 0);

  const main = b.finish(true);
  const peep = buildPeep(b.marks.peepFrom, b.marks.peepTo);
  const jaws = Array.from({ length: JAWS }, (_, k) => m('b16', JAWS_FROM + k * JAW_GAP));
  return {
    id: 'altered-beast-iii',
    name: 'Altered Beast III',
    main,
    branches: [peep.branch],
    pits: [...b.pits, ...peep.pits],
    boostPads: [
      { s: m('a2'), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: m('a15', 10), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: m('b9'), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['a3', 'peepFrom', 'peepTo', 'a14', 'a18', 'a22', 'b24', 'b20', 'b16', 'b12', 'b8', 'b4', 'leapEnd'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 400,
    landmarks: [
      { kind: 'fangGate', ribbon: -1, s: 6 },
      { kind: 'fangGate', ribbon: -1, s: m('b16', 4) },
      // The angels in the sky off the empty corner, straight ahead up the climb at Angels Weep.
      { kind: 'weepingAngels', ribbon: -1, s: m('b11'), lateral: 230 },
      ...basePairs(m, peep.branch),
    ],
    itemBoxes: [
      { s: 90, count: 4 },
      { s: m('a7'), count: 4 },
      { s: m('a16', 10), count: 3 },
      { s: m('b22'), count: 4 },
      { s: m('b7'), count: 3 },
      { s: peep.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [{ kind: 'fangs', at: jaws, period: 4.6 }],
    theme: 'altered',
    music: { lap: 'altered-beast-iii', finalLap: 'altered-beast-iii-final-lap' },
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
 * The base pairs: rungs lying across from each point on the first strand
 * to the same point round the helix on the second, wherever the strands
 * are apart and the rung doesn't cross Steal a Peep.
 */
function basePairs(m: (name: string, d?: number) => number, peep: BranchDef): Landmark[] {
  const rungs: Landmark[] = [];
  for (let t = 1; t < 8 * TWISTS; t++) {
    if (t % 8 === 4 || t % 8 === 3 || t % 8 === 5) continue;
    const [ax, az] = point(1, (t * Math.PI) / 8);
    const [bx, bz] = point(-1, (t * Math.PI) / 8);
    const crosses = peep.points.some(([x, z]) => {
      const u = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
      return Math.hypot(ax + (bx - ax) * u - x, az + (bz - az) * u - z) < 14;
    });
    if (!crosses) rungs.push({ kind: 'basePair', ribbon: -1, s: m(`a${t}`), to: m(`b${t}`) });
  }
  return rungs;
}

/**
 * Steal a Peep: a hidden lane through the fur, cut across inside the first
 * strand's swing from just past the hiding place, where you can peep out
 * at the road going round. There every lap.
 */
function buildPeep(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const b = new TrackBuilder(from.pose, 'Steal a Peep', { halfWidth: 6, surface: 'fur' });
  b.turnTo(to.pose, PEEP_R);
  const boxes = b.s / 2;
  const branch: BranchDef = { name: 'Steal a Peep', mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
  return { branch, pits: b.pits, boxes };
}
