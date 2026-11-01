import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.2;
/**
 * The lap is an electron's orbit round the nucleus, an ellipse with the
 * nucleus at its focus that precesses a third of a turn back each time
 * round: r = ORBIT / (1 + ECC cos(3f/2)), f running twice round. Three
 * orbits, three long lobes out to their far points and three passes in
 * close by the core, and they cross each other three times, in tiers.
 */
const ORBIT = 70;
const ECC = 0.72;
const deg = (d: number) => (d * Math.PI) / 180;
/** A point on the orbit at angle `f` (degrees), in metres. */
function orbit(f: number): [number, number] {
  const a = deg(f);
  const r = ORBIT / (1 + ECC * Math.cos(1.5 * a));
  return [r * Math.sin(a) * K, r * Math.cos(a) * K];
}
/** The pose on the orbit at angle `f` (degrees), heading along it. */
function onOrbit(f: number): Pose {
  const [x, z] = orbit(f);
  const [x1, z1] = orbit(f + 0.01);
  return { x, z, h: Math.atan2(x1 - x, z1 - z) };
}
/** The orbit's radius of curvature on the way in from the first lobe, where the kickers are, about. */
const LEG_R = 256;
/** The lap starts on the way in from the first lobe, at this angle on the orbit. */
const F0 = 150;
const START: Pose = onOrbit(F0);
const FINISH = 45;
/** The tiers: the deck over the ground at the crossings, the top tier the Rapid Flame burns on, and how deep the lead-lined trench is sunk. */
const DECK = 8;
const TOP = 16;
const DEPTH = 7;
const WALL = 6;
/**
 * Through the Rapid loops right round the nucleus, a keyhole of four arcs
 * of this radius and turn, off the straight past the core between two
 * crossings; Transcend runs straight on through it. The nucleus sits on
 * that straight, this far up from the orbit's focus.
 */
const RAPID_R = 22;
const RAPID_TURN = 90;
const CORE_Z = 38;
/** Transcend rises this far up through the nucleus. */
const RISE = 3;
/** Static: this many kinks one way and the other, round bends of this radius. */
const KINKS = 3;
const KINK_R = 27;
/** Energy and Heat: this many swells, this high. */
const SWELLS = 2;
const SWELL = 2.5;

/** The orbit's arc length (metres) from F0, every quarter of a degree round two turns. */
const LENGTHS: number[] = (() => {
  const out = [0];
  for (let k = 1; k <= 4 * 720; k++) {
    const [px, pz] = orbit(F0 + (k - 1) / 4);
    const [x, z] = orbit(F0 + k / 4);
    out.push(out[k - 1] + Math.hypot(x - px, z - pz));
  }
  return out;
})();
/** The arc length of the orbit from F0 to angle `f` (degrees). */
const orbitLength = (f: number) => LENGTHS[Math.round((f - F0) * 4)];
/** The angle on the orbit this far along it from F0. */
const orbitAngle = (s: number) => F0 + Math.max(0, LENGTHS.findIndex((l) => l >= s)) / 4;

/**
 * Rapid Alpha Decay (the Alien Metal Cup's last), after Ambrose's song of
 * an unstable nucleus throwing off alpha particles, two protons and two
 * neutrons at a time: "climb the walls", burning in a rapid flame; pump my
 * body full with lead, feel it run through, metallic; jumpstart my heart
 * (an alpha source once ran pacemakers), static; transcend through the
 * rapid; I love the keeper of the energy, energy and heat, and at the last
 * "I am the keeper". The world is where the alien metal ends, burnt down
 * to energy in a reactor's core under the cup's night of alien stars: a
 * containment floor leaking green, walls of lead, cooling towers, spent
 * fuel glowing blue, static arcing, and the nucleus pulsing at the heart
 * of it. The lap is an atom: one electron's orbit round the nucleus,
 * precessing as it goes, so that it draws three orbits, three lobes out
 * and three passes in by the core, crossing itself in tiers. Through the
 * reactor's lead doors (two kickers) to Climb the Walls, up between
 * striped walls past the core onto the top tier, 16 m up, over the road
 * home (a kart can't ride a wall, the road being level across, so the
 * road does the climbing); the Rapid Flame burning round the far end of
 * the second orbit up there; Alpha Decay, a crest and down; Full with
 * Lead, sunk 7 m between lead walls under the Keeper's road, alphas fired
 * across it; Metallic, climbing past the core again onto the deck over
 * the start; Jumpstart My Heart, a leap over the coolant; Static's kinks
 * round the third orbit; Through the Rapid, under the top tier and right
 * round the nucleus in a keyhole; the Keeper of the Energy over the lead;
 * and Energy and Heat's swells home, the finish running on into the forge
 * where Alien Metal starts. Shortcut: Transcend, straight on through the
 * nucleus the road loops round, rising up through it, every lap.
 */
export function buildRapidAlphaDecay(): TrackDef {
  const b = new TrackBuilder(START, 'Climb the Walls', { halfWidth: 11, wallHeight: 2.5, surface: 'lead', bridge: true });
  b.scale = K;
  // Follows the orbit from wherever the road is to angle `to`, a pose every 20 m or so.
  let f = F0;
  const along = (to: number, name?: string) => {
    const s0 = orbitLength(f);
    const n = Math.max(1, Math.round((orbitLength(to) - s0) / 20));
    const total = orbitLength(to) - s0;
    let g = f;
    for (let k = 1; k <= n; k++) {
      const want = s0 + (total * k) / n;
      while (g < to && orbitLength(g) < want) g += 0.5;
      b.hermiteTo(onOrbit(Math.min(g, to)));
    }
    f = to;
    if (name) b.mark(name);
    return b;
  };
  // Two kickers on the way in, the road curving with the orbit (its radius here, about) between them.
  b.arc(LEG_R, 3.8).mark('kick1').kicker().arc(LEG_R, 3.8).mark('kick2').kicker().arc(LEG_R, 1.8);
  f = orbitAngle(b.s + 15);
  along(180, 'x2under');
  along(300, 'x3over');
  b.section('Rapid Flame', { halfWidth: 10, wallHeight: 1.2, surface: 'lead', bridge: true });
  b.mark('flame');
  along(345, 'flameEnd');
  b.section('Alpha Decay', { halfWidth: 10, wallHeight: 1.2, surface: 'lead', bridge: true });
  b.mark('decay');
  along(375, 'crest');
  along(400, 'decayEnd');
  b.section('Full with Lead', { halfWidth: 9.5, wallHeight: WALL, surface: 'lead' });
  b.mark('lead');
  along(420, 'x1under');
  along(440, 'leadEnd');
  b.section('Metallic', { halfWidth: 10, wallHeight: 1.2, surface: 'lead', bridge: true });
  b.mark('metallic');
  along(540, 'x2over');
  along(550);
  b.section('Jumpstart My Heart', { halfWidth: 10, wallHeight: 1.2, surface: 'lead' });
  b.mark('jumpstart');
  along(565);
  // Jumpstart my heart: a leap over the coolant, and back onto the orbit a way past it.
  b.straight(8).mark('ramp').elevate(0).rise(18, 3);
  b.gap(12, 20, 'water');
  b.elevate(0).straight(10);
  b.mark('leapEnd');
  f = 580;
  along(590);
  b.section('Static', { halfWidth: 9.5, wallHeight: 1.2, surface: 'lead' });
  b.mark('static');
  along(626);
  b.mark('kinks');
  // Static: kinks one way and the other, and back onto the orbit before the core.
  b.arc(KINK_R, 22);
  for (let k = 0; k < KINKS - 1; k++) b.arc(KINK_R, k % 2 ? 44 : -44);
  b.arc(KINK_R, KINKS % 2 ? -22 : 22);
  b.mark('kinksEnd');
  f = 652;
  along(654);
  b.section('Through the Rapid', { halfWidth: 10.5, surface: 'lead' });
  b.mark('rapid');
  along(660, 'x3under');
  // The straight past the core, the nucleus on it: the road swings round it, Transcend runs straight on through.
  const chord = 4 * RAPID_R * K * Math.sin(deg(RAPID_TURN));
  b.hermiteTo({ x: -chord / 2, z: CORE_Z * K, h: Math.PI / 2 });
  b.mark('transFrom');
  b.arc(RAPID_R, -RAPID_TURN).arc(RAPID_R, RAPID_TURN);
  b.mark('loopTop');
  b.arc(RAPID_R, RAPID_TURN).arc(RAPID_R, -RAPID_TURN);
  b.mark('transTo');
  b.section('Keeper of the Energy', { halfWidth: 10, wallHeight: 1.2, surface: 'lead', bridge: true });
  b.mark('keeper');
  f = 779;
  along(780, 'x1over');
  along(800, 'keeperEnd');
  b.section('Energy and Heat', { halfWidth: 10.5, wallHeight: 1.2, surface: 'lead' });
  b.mark('heat');
  along(orbitAngle(orbitLength(F0 + 720) - FINISH * K - 60), 'heatEnd');
  b.hermiteTo(offsetPose(START, -FINISH * K));
  b.section('Finish Straight', { halfWidth: 11, surface: 'lead' });
  b.mark('finish');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  // Climbing the walls up past the core onto the top tier, over the road home; the Rapid Flame burning up there
  // round the far end of the second orbit, and the decay: a crest, and down. Into the lead, sunk under the
  // Keeper's road; up past the core again, Metallic, onto the deck over the road out; down to leap the coolant,
  // and level round past the nucleus, under the top tier, and over the lead; the heat's swells home.
  ease(b, m('x2under', 35), 0, m('x3over', -20), TOP);
  b.profile(m('x3over', -25), m('crest'), () => TOP, 10);
  plunge(b, m('crest'), TOP, m('decayEnd', -25), 0);
  ease(b, m('decayEnd', -25), 0, m('lead', 20), -DEPTH);
  b.profile(m('lead', 20), m('leadEnd'), () => -DEPTH, 10);
  ease(b, m('leadEnd'), -DEPTH, m('x2over', -40), DECK);
  b.profile(m('x2over', -40), m('jumpstart'), () => DECK, 10);
  ease(b, m('jumpstart'), DECK, m('ramp', -5), 0);
  b.profile(m('heat', 60), m('heatEnd', -20), (u) => SWELL * Math.sin(Math.PI * SWELLS * u) ** 2);

  const main = b.finish(true);
  const transcend = buildTranscend(b.marks.transFrom, b.marks.transTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'rapid-alpha-decay',
    name: 'Rapid Alpha Decay',
    main,
    branches: [transcend.branch],
    pits: [...b.pits, ...transcend.pits],
    boostPads: [
      { s: 60, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('leadEnd', 5), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('kinksEnd', 5), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['x3over', 'flameEnd', 'decayEnd', 'leadEnd', 'x2over', 'leapEnd', 'kinks', 'rapid', 'keeper', 'heat'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 340,
    landmarks: [
      { kind: 'reactorGate', ribbon: -1, s: 6 },
      { kind: 'reactorGate', ribbon: -1, s: at('lead', -2) },
      { kind: 'atomNucleus', ribbon: 0, s: transcend.core },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('flame', 30), count: 4 },
      { s: at('metallic', 20), count: 3 },
      { s: at('static', 10), count: 4 },
      { s: at('heat', 30), count: 3 },
      { s: transcend.core - 12, count: 1, ribbon: 0, double: true },
    ],
    // Alphas fired out of the nucleus across the climb past the core, the lead-lined trench and the loop round the nucleus.
    hazards: [{ kind: 'alphas', at: [at('x2under', 75), at('lead', 28), at('leadEnd', -8), at('loopTop', 0)], period: 4.6, from: transcend.nucleus }],
    theme: 'reactor',
    music: { lap: 'rapid-alpha-decay', finalLap: 'rapid-alpha-decay-final-lap' },
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
 * Transcend: straight on through the nucleus that Through the Rapid swings
 * round, no rails. There every lap.
 */
function buildTranscend(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Transcend', { halfWidth: 6, surface: 'lead' });
  b.straight(chord / 2 - 15);
  b.section('The Nucleus', { halfWidth: 5, surface: 'lead' });
  const core = b.s + 15;
  const nucleus = { x: b.pose.x + Math.sin(b.pose.h) * 15, z: b.pose.z + Math.cos(b.pose.h) * 15 };
  b.straight(30);
  b.section('Transcend', { halfWidth: 6, surface: 'lead' });
  b.straight(chord - b.s);
  // Rising up through the core as it goes, and down again.
  b.profile(0, b.s, (u) => RISE * Math.sin(Math.PI * u) ** 2);
  const branch: BranchDef = { name: 'Transcend', mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
  return { branch, pits: b.pits, core, nucleus };
}
