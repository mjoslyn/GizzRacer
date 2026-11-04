import { TrackBuilder, offsetPose, type Pose, type RibbonDef, type SectionProps } from './builder';
import type { BranchDef, TrackDef } from './track';

const deg = (d: number) => (d * Math.PI) / 180;
/** The valley runs up the map's diagonal, south-west to north-east: the lap is drawn in its own frame (Y up the valley) and turned onto the map this far (degrees, counterclockwise). */
const TURN = -45;
/** A pose in the valley's frame (X across it, Y up it, heading in degrees counterclockwise from up the valley), on the map. */
const ch = (X: number, Y: number, hd: number): Pose => {
  const c = Math.cos(deg(TURN));
  const s = Math.sin(deg(TURN));
  // Map X east, Y north; the builder's x is west.
  return { x: -(X * c - Y * s), z: X * s + Y * c, h: deg(hd + TURN) };
};

/**
 * The middle of the valley, between the two crossings: its west side runs
 * straight down the valley this far out from the middle, this long, on
 * bends of this radius into the crossings; its east side is the same.
 */
const MID_X = 70;
const MID_RUN = 100;
const MID_R = 60;
const START = ch(-MID_X, 0, 180);
const FINISH = 40;
/**
 * The two lobes, each a loop of right-hand bends of radius R off a
 * crossing: out of it on a leg LEG long, across a run RUN long, back down
 * LEG - R, and home along R + RUN into the crossing.
 */
const S_LEG = 205;
const S_R = 85;
const S_RUN = 60;
const N_LEG = 170;
const N_R = 80;
const N_RUN = 90;
/** The billabong: the road bows out round it on bends of this radius and turn; the log lies straight across. */
const POND_R = 45;
const POND_A = 65;
const POND_CHORD = 4 * POND_R * Math.sin(deg(POND_A));
/** It starts this far past the crossing, clear of the deck over the gully. */
const POND_AFTER = 30;
/** Tied Naked to the Trees and Bloodthirsty Tendencies: esses of these radii, 30 degrees each way. */
const TREES_R = 30;
const BLOOD_R = 40;
const ess = (r: number) => 4 * r * Math.sin(deg(30));
/** Killed So Gruesomely: the gully, sunk this deep between walls, under Outlaws on the Run. */
export const DEPTH = 7;
const WALL = 6;
/** Up in the ranges: the road climbs this high round the top of the north lobe, and crosses the valley on the trestle at it. */
export const RANGES = 10;
/** Each crossing's deck held this far either side of where the roads cross. */
const HOLD = 30;
const X1_HOLD = 22;
/** Shot in the Back by Morning starts this far before the trestle's crossing. */
const ONTO_TRESTLE = 25;
/** Mad Dog Morgan's gang ride across the road about once every this many seconds (never quite the same twice). */
export const GANG_PERIOD = 4.6;

const ROAD: SectionProps = { halfWidth: 10, wallHeight: 1.2, surface: 'redgum' };
const OPEN: SectionProps = { halfWidth: 10, surface: 'redgum' };

/**
 * Billabong Valley (the All Stars Cup #2's finale, from Flying Microtonal
 * Banana, 2017): Ambrose's song, and the only one on the record he sings,
 * about the bushranger Daniel "Mad Dog" Morgan, who hid out in the
 * Billabong Valley ("Savage sucker he was"), robbed and murdered across
 * 1860s northern Victoria, went after the police, burned a camp to the
 * ground at Kyeamba, and was shot in the back on the morning of 9 April
 * 1865. Outlaws on the run, faster than a stolen gun; tied naked to the
 * trees, killed so gruesomely; burning tents to the ground, cops won't wave
 * them down; the most wanted men, bushrangers reigning in; bloodthirsty
 * tendencies, antiauthority; Mad Dog Morgan, he never gave a warning; Mad
 * Dog Morgan, shot in the back by morning.
 *
 * A dark bush night going to a blood-red dawn, and a chase up the valley:
 * the lap is a chain of three loops laid up the valley, crossing itself
 * twice in tiers. Outlaws on the Run from the hideout (two kickers), over
 * the gully on a deck and down past the black billabong, bowing out round
 * it (Faster Than a Stolen Gun straight across it on a fallen red gum, from
 * lap 2); Tied Naked to the Trees round the bottom of the valley and its
 * esses through the river red gums; Killed So Gruesomely, sunk in the gully
 * under the outlaws' way out; Burning Tents to the Ground up the valley's
 * east side past the burning camp; under the trestle, and Cops Won't Wave
 * Them Down past the troopers' camp, a leap where they burned the bridge;
 * The Most Wanted Men straight at Morgan's wanted poster; Bushrangers
 * Reigning In, climbing into the ranges; Bloodthirsty Tendencies' esses
 * along the ridge; Antiauthority; Mad Dog Morgan and his gang riding across
 * the ridge road out of the dark, He Never Gave a Warning; and Shot in the
 * Back by Morning, across the valley on the trestle over the troopers' road
 * and down past the homestead to the dawn.
 */
export function buildBillabongValley(): TrackDef {
  const b = new TrackBuilder(START, 'Outlaws on the Run', ROAD);
  const diag = (MID_X - MID_R * (1 - Math.SQRT1_2)) * Math.SQRT2;
  // Outlaws on the run: out of the hideout, two kickers, and on down the valley.
  b.straight(15).mark('kick1').kicker().straight(12).mark('kick2').kicker();
  b.straight(MID_RUN / 2 - b.s);
  b.arc(MID_R, 45).straight(diag);
  b.mark('x1');
  // Over the gully and down past the billabong, bowing out round it; faster than a stolen gun, the log straight across.
  // Open where the log leaves and rejoins it.
  b.straight(POND_AFTER - 5);
  b.section('Outlaws on the Run', OPEN);
  b.straight(5);
  b.mark('pondFrom');
  b.arc(POND_R, POND_A).arc(POND_R, -2 * POND_A).arc(POND_R, POND_A);
  b.mark('pondTo');
  b.straight(5);
  b.section('Outlaws on the Run', ROAD);
  b.straight(S_LEG - POND_AFTER - POND_CHORD - 5);
  b.arc(S_R, -90);
  // Tied naked to the trees: round the bottom of the valley among the river red gums, and esses between them.
  b.section('Tied Naked to the Trees', ROAD);
  b.mark('trees');
  b.straight(S_RUN);
  b.arc(S_R, -90);
  b.mark('treesEss');
  b.arc(TREES_R, 30).arc(TREES_R, -60).arc(TREES_R, 30);
  b.straight(S_LEG - S_R - ess(TREES_R));
  // Killed so gruesomely: round and down into the gully, under the outlaws' way out.
  b.section('Killed So Gruesomely', { ...ROAD, wallHeight: WALL });
  b.mark('gully');
  b.arc(S_R, -90);
  b.mark('gullyRun');
  b.straight(S_R + S_RUN);
  b.mark('x1b');
  b.straight(diag);
  b.arc(MID_R, 45);
  // Burning tents to the ground: up the valley's east side, past the burning camp in the middle of it.
  b.section('Burning Tents to the Ground', ROAD);
  b.mark('tents');
  b.straight(MID_RUN).arc(MID_R, 45).straight(diag - ONTO_TRESTLE);
  // Cops won't wave them down: under the trestle, past the troopers' camp, and a leap where the bridge was burned.
  b.section("Cops Won't Wave Them Down", ROAD);
  b.mark('cops');
  b.straight(ONTO_TRESTLE);
  b.mark('x2');
  b.straight(40);
  b.mark('ramp').elevate(0).rise(18, 3);
  b.gap(14, 18);
  b.elevate(0).straight(20);
  // The most wanted men: straight at the wanted poster.
  b.section('The Most Wanted Men', ROAD);
  b.mark('wanted');
  b.straight(N_LEG - (b.s - b.marks.x2.s));
  b.mark('poster');
  b.arc(N_R, -90);
  // Bushrangers reigning in: climbing into the ranges.
  b.section('Bushrangers Reigning In', ROAD);
  b.mark('reigning');
  b.straight(N_RUN);
  b.arc(N_R, -90);
  // Bloodthirsty tendencies: esses along the ridge.
  b.section('Bloodthirsty Tendencies', ROAD);
  b.mark('bloodthirsty');
  b.arc(BLOOD_R, -30).arc(BLOOD_R, 60).arc(BLOOD_R, -30);
  b.straight(N_LEG - N_R - ess(BLOOD_R));
  b.section('Antiauthority', ROAD);
  b.mark('anti');
  b.arc(N_R, -90);
  // Mad Dog Morgan, and he never gave a warning: his gang riding across the ridge road out of the dark.
  b.section('Mad Dog Morgan', ROAD);
  b.mark('morgan');
  b.straight(110);
  b.section('He Never Gave a Warning', ROAD);
  b.mark('warning');
  b.straight(N_R + N_RUN - 110 - ONTO_TRESTLE);
  // Shot in the back by morning: across the valley on the trestle, and down past the homestead to the dawn.
  b.section('Shot in the Back by Morning', ROAD);
  b.mark('morning');
  b.straight(ONTO_TRESTLE);
  b.mark('x2b');
  b.straight(diag).arc(MID_R, 45);
  b.turnTo(offsetPose(START, -FINISH), 60);
  b.mark('home');
  b.straight(FINISH);

  const m = (name: string, d = 0) => b.marks[name].s + d;
  // Killed so gruesomely: down into the gully, under the outlaws' deck, and back up out of it.
  ease(b, m('gully', 10), 0, m('x1b', -HOLD - 20), -DEPTH);
  b.profile(m('x1b', -HOLD - 20), m('x1b', HOLD + 20), () => -DEPTH, 10);
  ease(b, m('x1b', HOLD + 20), -DEPTH, m('tents', 30), 0);
  // Bushrangers reigning in: up into the ranges, along the ridge, and across the valley on the trestle.
  ease(b, m('reigning'), 0, m('bloodthirsty', 10), RANGES);
  b.profile(m('bloodthirsty', 10), m('x2b', HOLD), () => RANGES, 10);
  // Shot in the back by morning: down off the trestle toward the dawn.
  ease(b, m('x2b', HOLD), RANGES, m('home', -10), 0);

  const main = b.finish(true);
  // The decks: the outlaws' way out at ground level over the gully, and the trestle over the troopers' road.
  deck(main, m('x1', -X1_HOLD), m('x1', X1_HOLD));
  deck(main, m('x2b', -HOLD - 10), m('x2b', HOLD));

  const log = buildStolenGun(b.marks.pondFrom, b.marks.pondTo);
  return {
    id: 'billabong-valley',
    name: 'Billabong Valley',
    main,
    branches: [log.branch],
    pits: [...b.pits, ...log.pits],
    boostPads: [
      { s: m('trees', 30), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: m('tents', 40), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: m('reigning', 40), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['pondFrom', 'trees', 'gully', 'tents', 'cops', 'wanted', 'reigning', 'bloodthirsty', 'anti', 'morgan', 'warning', 'morning'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 420,
    landmarks: [
      { kind: 'hideoutGate', ribbon: -1, s: 6 },
      { kind: 'blackBillabong', ribbon: -1, s: m('pondFrom'), to: m('pondTo') },
      { kind: 'ropeGums', ribbon: -1, s: m('trees', 10), to: m('gully', -5) },
      // The burning camp in the middle of the valley, between its two sides.
      { kind: 'burningCamp', ribbon: -1, s: m('tents', MID_RUN / 2), lateral: -MID_X },
      { kind: 'troopersCamp', ribbon: -1, s: m('cops'), to: m('wanted') },
      // Outside the bend at the end of the straight, facing down it.
      { kind: 'wantedPoster', ribbon: -1, s: m('poster', 40), lateral: -(N_R * 0.75) },
      { kind: 'trestle', ribbon: -1, s: m('x2b', -HOLD - 10), to: m('x2b', HOLD) },
      // The homestead under siege, out in the corner of the valley beside the run home.
      { kind: 'stationHomestead', ribbon: -1, s: m('x2b', diag + 30), lateral: 55 },
      { kind: 'redDawn', ribbon: -1, s: m('home') },
      { kind: 'stolenGun', ribbon: 0, s: log.boxes },
    ],
    itemBoxes: [
      { s: m('x1b'), count: 8 },
      { s: m('trees', 60), count: 3 },
      { s: m('treesEss', ess(TREES_R) + 20), count: 8 },
      { s: m('tents', 70), count: 3 },
      { s: m('wanted', 30), count: 8 },
      { s: m('reigning', 70), count: 3 },
      { s: m('anti', 10), count: 8 },
      { s: m('x2b', 60), count: 3 },
      { s: log.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      // Mad Dog Morgan and his gang, riding across the ridge road out of the dark, at three places along it.
      { kind: 'bushrangers', at: [m('morgan', 25), m('morgan', 75), m('warning', 15)], period: GANG_PERIOD },
    ],
    theme: 'bushranger',
    music: { lap: 'billabong-valley', finalLap: 'billabong-valley-final-lap' },
  };
}

/** Eases the road's height from y0 at arc length s0 to y1 at s1. */
function ease(b: TrackBuilder, s0: number, y0: number, s1: number, y1: number): void {
  b.profile(s0, s1, (u) => y0 + (y1 - y0) * u * u * (3 - 2 * u));
}

/** Makes [from, to] (builder arc lengths) of a finished ribbon a deck on pillars, at whatever height the road is there. */
function deck(r: RibbonDef, from: number, to: number): void {
  const out = [];
  for (const s of r.sections) {
    if (s.to <= from || s.from >= to) {
      out.push(s);
      continue;
    }
    if (s.from < from) out.push({ ...s, to: from });
    out.push({ ...s, from: Math.max(s.from, from), to: Math.min(s.to, to), bridge: true });
    if (s.to > to) out.push({ ...s, from: to });
  }
  r.sections.splice(0, r.sections.length, ...out);
}

/** Faster Than a Stolen Gun: the bank either side of the black water, and the water the log lies over. */
const LOG_IN = 58;
export const POND_HALF = 22;

/**
 * Faster Than a Stolen Gun: straight across the billabong on a fallen red
 * gum, from where the road bows out round it to where it comes back. From
 * lap 2; on the first there's only the black water.
 */
function buildStolenGun(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Faster Than a Stolen Gun', { halfWidth: 4.5, surface: 'redgum' });
  b.straight(LOG_IN);
  const span = chord - 2 * LOG_IN;
  const boxes = b.s + span / 2;
  b.bridge(span, POND_HALF, 'water');
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Faster Than a Stolen Gun', mainFrom: from.s, mainTo: to.s, ...b.finish(false), openOn: [2, 'final'], shut: { kind: 'vanish' } };
  return { branch, pits: b.pits, boxes };
}
