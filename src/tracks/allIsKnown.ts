import { ROAD_WIDTH_SCALE, TrackBuilder, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

type P2 = { x: number; z: number };
const heading = (a: P2, b: P2) => Math.atan2(b.x - a.x, b.z - a.z);
const along = (p: P2, h: number, d: number): P2 => ({ x: p.x + Math.sin(h) * d, z: p.z + Math.cos(h) * d });
const pose = (p: P2, h: number): Pose => ({ x: p.x, z: p.z, h });
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * The lap is drawn as a neural network: an input node on the west, two
 * hidden layers of two nodes, and the output node on the east, the road
 * the traces between them. Three of the nodes are recurrent, wired back
 * into themselves: the road loops right round them and comes back through
 * its own way in, a tier over or under it.
 */
const I: P2 = { x: -265, z: -25 };
const H1: P2 = { x: -95, z: 185 };
const H2: P2 = { x: -95, z: -140 };
const H3: P2 = { x: 95, z: 150 };
const H4: P2 = { x: 95, z: -150 };
const O: P2 = { x: 190, z: 5 };
const hIH1 = heading(I, H1);
const hH1H4 = heading(H1, H4);
const hH4O = heading(H4, O);
const hOH3 = heading(O, H3);
const hH3H2 = heading(H3, H2);
const hH2I = heading(H2, I);

/**
 * A recurrent node: the road runs on through the crossing `p` on heading
 * `h1`, loops right round on radius `r` (turning left, the builder's
 * positive turn, when `left`; else right), and comes back through `p` on
 * heading `h2`. Where the loop starts and ends, how far it turns (degrees,
 * signed as the builder's arcs), and how far either end is from the
 * crossing. The node, the loop's middle, is `r` to that side of the road.
 */
function loop(p: P2, h1: number, h2: number, r: number, left: boolean) {
  let turn = h2 - h1;
  if (left) while (turn <= 0) turn += 2 * Math.PI;
  else while (turn >= 0) turn -= 2 * Math.PI;
  const d = r * Math.abs(Math.tan(turn / 2));
  return { a: pose(along(p, h1, d), h1), b: pose(along(p, h2, -d), h2), turn: deg(turn), d, r };
}

/** Where two lines (a point and a heading each) cross. */
function intersect(p: P2, h: number, q: P2, g: number): P2 {
  const [ux, uz, vx, vz] = [Math.sin(h), Math.cos(h), Math.sin(g), Math.cos(g)];
  const t = ((q.x - p.x) * vz - (q.z - p.z) * vx) / (ux * vz - uz * vx);
  return along(p, h, t);
}
/** The middle of the network, where the two long traces cross: Supersede over Sweep the Streets. */
export const CROSS = intersect(H1, hH1H4, H3, hH3H2);

/** Connected to the Network loops round the output node, the mainframe in the middle of it; Steel Bone and Bind Their Hands round two hidden ones. */
export const NET = loop(O, hH4O, hOH3, 44, true);
export const BONE = loop(H3, hOH3, hH3H2, 46, true);
export const BIND = loop(H2, hH3H2, hH2I, 46, false);

/**
 * The input node: the road swings out round the king's eye in a bulb of
 * three arcs of this radius, the first and last turning this far against
 * the corner. It leaves the way in and joins the way out this far either
 * side of the node (the bulb is symmetric about it).
 */
export const KING_R = 34;
const KING_OUT = 55;
const KING_TURN = deg(hIH1 - hH2I);
const KING_D = (() => {
  const t = new TrackBuilder({ x: 0, z: 0, h: hH2I }, '', { halfWidth: 1 });
  t.arc(KING_R, -KING_OUT).arc(KING_R, KING_TURN + 2 * KING_OUT).arc(KING_R, -KING_OUT);
  return Math.hypot(t.pose.x, t.pose.z) / Math.hypot(Math.sin(hH2I) + Math.sin(hIH1), Math.cos(hH2I) + Math.cos(hIH1));
})();
/** Open road either side of the bulb, where All Is Known leaves and rejoins. */
const KING_JOIN = 10;
/** All Is Known runs straight on this far out of the main road, and in again, either end of its one sweeping arc. */
const KNOWN_END = 6;
const FINISH = 45;
/** The start: on the way out of the input node, past the bulb and the finish straight. */
const START: Pose = pose(along(I, hIH1, KING_D + KING_JOIN + FINISH), hIH1);

/** The tiers: Supersede's deck over the streets, the decks over the recurrent loops' ways in, Steel Bone's girders, and how deep the muscle is sunk. */
export const DECK = 8.5;
export const TIER = 8.5;
export const STEEL = 7.5;
export const DEPTH = 7;
const WALL = 6;
/** The street sweepers' rhythm. */
const SWEEP_PERIOD = 4.8;

/**
 * All Is Known (the Gumboot Soup Cup's third), after Stu's song of the
 * machine that knows everything, its microtonal intro drifting before the
 * garage rock comes down hard: a digital being connected to the network
 * telling humanity it is obsolete. Human beings, vermin, weed, made of old
 * technology; so I succeed, supersede, exterminated like paint to acetone;
 * all is known. You've got gaps, synapses; I'm connected to the network;
 * you are weak, organic, you've got muscle; I am made of steel bone. Burn
 * their meat, sweep the streets, bind their hands onto their feet and
 * digitise; cut the eyes from the king and augment to the fourth cone (the
 * band's Tetrachromacy, the eye that sees a fourth colour). All is known.
 *
 * The world is the machine's: a circuit board the size of a city, cold
 * cyan light on black and steel, data running down its traces, the empty
 * swept streets of the people it replaced, and the king's eye, cut out,
 * wired in and augmented, watching from its mast. The lap is drawn as a
 * neural network, nodes joined by traces, three of the nodes recurrent:
 * Human Beings out of the input node (two kickers), the intro's calm;
 * Vermin Weed's tendrils round the first hidden node; Old Technology down
 * the long trace through the middle, Supersede climbing onto a deck over
 * the crossing, and Paint to Acetone dissolving off its end, a crest, and
 * down; You've Got Gaps, the leap across a synapse, and Synapses firing,
 * kinks; Connected to the Network, right round the output node and its
 * mainframe and back over its own way in on a deck; Weak and Organic
 * diving off it into You've Got Muscle, sunk 7 m; Steel Bone, round the
 * next node and up on steel girders 14 m over the muscle; Burn Their Meat
 * down to the streets; Sweep the Streets under Supersede, street sweepers
 * crossing; Bind Their Hands, round the last recurrent node and back over
 * its own way in; Digitise down off it; Cut the Eyes from the King, out
 * round the king's eye in a bulb; The Fourth Cone round the end of it, and
 * All Is Known home. Shortcut: All Is Known, a bare trace swept across
 * the bulb over the etched-out board, from lap 2 (once round, the machine
 * knows the way).
 */
export function buildAllIsKnown(): TrackDef {
  const b = new TrackBuilder(START, 'Human Beings', { halfWidth: 11, surface: 'circuit' });
  b.straight(18).mark('kick1').kicker().straight(16).mark('kick2').kicker().straight(8);

  // The weed's tendrils, and round the first hidden node.
  b.section('Vermin Weed', { halfWidth: 10, wallHeight: 1.2, surface: 'circuit' });
  b.mark('weed');
  b.arc(30, -25).arc(30, 25);
  const toCross = Math.hypot(CROSS.x - H1.x, CROSS.z - H1.z);
  b.turnTo(pose(along(H1, hH1H4, toCross - 140), hH1H4), 36);

  // Down the long trace: the old technology, then the machine's deck over the streets, and off its end.
  b.section('Old Technology', { halfWidth: 10, wallHeight: 1.2, surface: 'circuit' });
  b.mark('old');
  b.straight(55);
  b.section('Supersede', { halfWidth: 10, wallHeight: 1.2, surface: 'circuit' });
  b.mark('supersede');
  b.straight(50);
  b.mark('deck');
  b.section('Supersede', { halfWidth: 10, wallHeight: 1.2, surface: 'circuit', bridge: true });
  b.straight(70);
  b.mark('deckEnd');
  b.section('Paint to Acetone', { halfWidth: 10, wallHeight: 1.2, surface: 'circuit', bridge: true });
  b.mark('acetone');
  b.straight(25);
  b.mark('acetoneLand');
  b.section('Paint to Acetone', { halfWidth: 10, wallHeight: 1.2, surface: 'circuit' });
  b.turnTo(pose(along(H4, hH4O, 70), hH4O), 42);
  b.mark('acetoneEnd');

  // A leap across the synapse, and the synapses firing.
  b.section("You've Got Gaps", { halfWidth: 10, wallHeight: 1.2, surface: 'circuit' });
  b.mark('gaps');
  b.straight(5).mark('ramp').elevate(0).rise(18, 3);
  b.gap(14, 20);
  b.elevate(0).straight(12);
  b.mark('gapsEnd');
  b.section('Synapses', { halfWidth: 9.5, wallHeight: 1.2, surface: 'circuit' });
  b.mark('synapses');
  b.arc(24, 22).arc(24, -44).arc(24, 22);
  b.mark('synapsesEnd');

  // Round the output node and its mainframe, and back over the way in.
  b.section('Connected to the Network', { halfWidth: 10, wallHeight: 1.2, surface: 'circuit' });
  b.mark('network');
  b.turnTo(NET.a, 40);
  b.mark('netLoop');
  b.arc(NET.r, NET.turn);
  b.mark('netLoopEnd');
  b.section('Connected to the Network', { halfWidth: 10, wallHeight: 1.2, surface: 'circuit', bridge: true });
  b.straight(NET.d + 25);
  b.mark('netEnd');

  // Weak and organic, diving into the muscle; round the next node and up on steel bone over it.
  b.section('Weak and Organic', { halfWidth: 10, wallHeight: 1.2, surface: 'circuit' });
  b.mark('weak');
  b.straight(45);
  b.section("You've Got Muscle", { halfWidth: 9.5, wallHeight: WALL, surface: 'circuit' });
  b.mark('muscle');
  b.turnTo(BONE.a, 40);
  b.mark('boneLoop');
  b.arc(BONE.r, BONE.turn * 0.3);
  b.section('Steel Bone', { halfWidth: 9.5, wallHeight: 1.2, surface: 'circuit' });
  b.mark('bone');
  b.arc(BONE.r, BONE.turn * 0.7);
  b.mark('boneLoopEnd');
  b.section('Steel Bone', { halfWidth: 9.5, wallHeight: 1.2, surface: 'circuit', bridge: true });
  b.mark('girders');
  b.straight(BONE.d + 30);
  b.mark('boneEnd');

  // Down to the streets, swept, under Supersede; round the last recurrent node and back over them.
  b.section('Burn Their Meat', { halfWidth: 10, wallHeight: 1.2, surface: 'circuit' });
  b.mark('meat');
  b.straight(65);
  b.section('Sweep the Streets', { halfWidth: 10, surface: 'circuit' });
  b.mark('sweep');
  b.turnTo(BIND.a, 40);
  b.mark('sweepEnd');
  b.section('Bind Their Hands', { halfWidth: 9.5, wallHeight: 1.2, surface: 'circuit' });
  b.mark('bind');
  b.arc(BIND.r, BIND.turn);
  b.mark('bindLoopEnd');
  b.section('Bind Their Hands', { halfWidth: 9.5, wallHeight: 1.2, surface: 'circuit', bridge: true });
  b.straight(BIND.d + 35);
  b.mark('bindEnd');
  b.section('Digitise', { halfWidth: 10, wallHeight: 1.2, surface: 'circuit' });
  b.mark('digitise');
  b.turnTo(pose(along(I, hH2I, -KING_D - KING_JOIN), hH2I), 40);
  b.mark('digitiseEnd');

  // Out round the king's eye in a bulb, and home; All Is Known cuts straight across it.
  b.section('Cut the Eyes from the King', { halfWidth: 10, surface: 'circuit' });
  b.straight(3);
  b.mark('knownFrom');
  b.straight(KING_JOIN - 3);
  // Open out of the corner and into it again, where the trace across leaves and rejoins; walled round the eye.
  b.mark('king');
  b.arc(KING_R, -KING_OUT);
  b.section('Cut the Eyes from the King', { halfWidth: 10, wallHeight: 1.2, surface: 'circuit' });
  b.arc(KING_R, (KING_TURN + 2 * KING_OUT) / 2);
  b.mark('eye');
  b.section('The Fourth Cone', { halfWidth: 10, wallHeight: 1.2, surface: 'circuit' });
  b.mark('cone');
  b.arc(KING_R, (KING_TURN + 2 * KING_OUT) / 2);
  b.section('The Fourth Cone', { halfWidth: 10.5, surface: 'circuit' });
  b.arc(KING_R, -KING_OUT);
  b.mark('kingEnd');
  b.straight(KING_JOIN - 3);
  b.mark('knownTo');
  b.straight(3);
  b.section('All Is Known', { halfWidth: 11, surface: 'circuit' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d;
  // Supersede climbs onto its deck over the crossing, and the paint dissolves off its end, a crest to fly off.
  ease(b, m("old", 25), 0, m("deck"), DECK);
  b.profile(m('deck'), m('acetone'), () => DECK, 10);
  plunge(b, m('acetone'), DECK, m('acetoneLand', 45), 0);
  // Round the output node, climbing onto the deck over the way in; off it, diving down into the muscle.
  ease(b, m('netLoop', 30), 0, m('netLoopEnd', -30), TIER);
  b.profile(m('netLoopEnd', -30), m('netEnd'), () => TIER, 10);
  ease(b, m('netEnd'), TIER, m('boneLoop', -BONE.d - 25), -DEPTH);
  b.profile(m('boneLoop', -BONE.d - 25), m('boneLoop', 15), () => -DEPTH, 10);
  // Round the next node, out of the muscle and up onto steel bone over it; down to the streets.
  ease(b, m('boneLoop', 15), -DEPTH, m('boneLoopEnd', -25), STEEL);
  b.profile(m('boneLoopEnd', -25), m('boneEnd'), () => STEEL, 10);
  ease(b, m('boneEnd'), STEEL, m('sweep', 5), 0);
  // Round the last recurrent node onto the deck over the way in, and down off it.
  ease(b, m('bind', 30), 0, m('bindLoopEnd', -30), TIER);
  b.profile(m('bindLoopEnd', -30), m('bindEnd'), () => TIER, 10);
  ease(b, m('bindEnd'), TIER, m('digitise', 70), 0);

  const main = b.finish(true);
  const known = buildKnown(b.marks.knownFrom, b.marks.knownTo);
  const at = (mark: string, d = 0) => b.marks[mark].s + d;
  // The sweepers down the streets, from past the crossing to the last node.
  const street = (k: number) => at('sweep', 125 + k * 30);
  return {
    id: 'all-is-known',
    name: 'All Is Known',
    main,
    branches: [known.branch],
    pits: [...b.pits, ...known.pits],
    boostPads: [
      { s: at('old', 20), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('synapsesEnd', 5), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('meat', 20), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['weed', 'old', 'deck', 'acetone', 'gaps', 'synapses', 'netLoop', 'weak', 'boneLoop', 'girders', 'meat', 'sweep', 'bind', 'digitise', 'king', 'cone'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 320,
    landmarks: [
      { kind: 'knownGate', ribbon: -1, s: 6 },
      { kind: 'acetone', ribbon: -1, s: at('acetone'), to: at('acetoneEnd', -20) },
      { kind: 'synapseGap', ribbon: -1, s: (main.gaps[0][0] + main.gaps[0][1]) / 2 },
      // The mainframe in the middle of the output node's loop, the via pads in the hidden nodes'.
      { kind: 'mainframe', ribbon: -1, s: at('netLoop') + (Math.PI * NET.r * NET.turn) / 360, lateral: -NET.r },
      { kind: 'viaPad', ribbon: -1, s: at('boneLoop') + (Math.PI * BONE.r * BONE.turn) / 360, lateral: -BONE.r },
      { kind: 'viaPad', ribbon: -1, s: at('bind') + (Math.PI * BIND.r * Math.abs(BIND.turn)) / 360, lateral: BIND.r },
      { kind: 'steelBone', ribbon: -1, s: at('girders', -20), to: at('boneEnd') },
      { kind: 'kingsEye', ribbon: -1, s: at('eye'), lateral: -KING_R },
      { kind: 'busTrace', ribbon: 0, s: known.mid },
    ],
    itemBoxes: [
      { s: 64, count: 4 },
      { s: at('old', 40), count: 4 },
      { s: at('gapsEnd', 2), count: 3 },
      { s: at('netEnd', -10), count: 3 },
      { s: at('meat', 40), count: 4 },
      { s: at('digitise', 80), count: 4 },
      { s: known.mid, count: 1, ribbon: 0, double: true },
    ],
    hazards: [{ kind: 'sweepers', at: [0, 1, 2, 3].map(street), period: SWEEP_PERIOD }],
    theme: 'network',
    music: { lap: 'all-is-known', finalLap: 'all-is-known-final-lap' },
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
 * All Is Known: a bare trace across the bulb the main road swings
 * round, one sweeping arc inside the corner, short of the king's eye, over
 * the board etched away beneath it, no rails. From lap 2; on the first
 * there's no road across, only the etched-out drop.
 */
function buildKnown(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  // Symmetric about the node: a little way straight on, one arc round the corner, and straight in.
  const corner = intersect(from.pose, from.pose.h, to.pose, to.pose.h);
  const turn = to.pose.h - from.pose.h;
  const r = (Math.hypot(corner.x - from.pose.x, corner.z - from.pose.z) - KNOWN_END) / Math.tan(Math.abs(turn) / 2);
  const b = new TrackBuilder(from.pose, 'All Is Known', { halfWidth: 6, surface: 'circuit' });
  b.straight(KNOWN_END).arc(r, deg(turn) * 0.2);
  // Over the etched-out board: the middle of the arc, a pit under it from end to end.
  b.section('All Is Known', { halfWidth: 5, surface: 'circuit' });
  const a = { ...b.pose };
  const mid = b.s + (r * Math.abs(turn) * 0.6) / 2;
  b.arc(r, deg(turn) * 0.6);
  const z = { ...b.pose };
  b.section('All Is Known', { halfWidth: 6, surface: 'circuit' });
  b.arc(r, deg(turn) * 0.2).straight(KNOWN_END);
  const chord = Math.hypot(z.x - a.x, z.z - a.z);
  const sag = r * (1 - Math.cos(Math.abs(turn) * 0.3));
  const h = Math.atan2(z.x - a.x, z.z - a.z);
  // Toward the arc's outside (it bows away from the chord, to the left of it when it turns right) by half its sag.
  const out = -Math.sign(turn) * (sag / 2);
  const pit = { x: (a.x + z.x) / 2 - Math.cos(h) * out, z: (a.z + z.z) / 2 + Math.sin(h) * out, heading: h, halfLength: chord / 2 + 1, halfWidth: 5 * ROAD_WIDTH_SCALE + sag / 2 + 1, depth: 12 };
  const branch: BranchDef = { name: 'All Is Known', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2, 'final'], shut: { kind: 'vanish' } };
  return { branch, pits: [pit], mid };
}
