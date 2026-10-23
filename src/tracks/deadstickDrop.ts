import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const K = 1.12;
const START: Pose = { x: 70 * K, z: 165 * K, h: -Math.PI / 2 };
const FINISH = 45;
/** The Crosswind: the perimeter road swings out round the seaplane basin in three arcs of this radius and turn. */
const BASIN_R = 34;
const BASIN_TURN = 70;
/** The Holding Pattern climbs a full circle on a deck from this height to the clifftop runway's. */
const HOLD_FROM = 2;
const CLIFF = 18;
/** Where the Deadstick lands, well below the runway it left. */
const LANDING = 8;
/** How deep the Hangar Cutting sinks below the field. */
const CUTTING_DEPTH = 6;

/**
 * Deadstick (the Phantom Island Cup's second): a cliff-top airfield
 * on a bright windy day, after the song where the propeller stops in the
 * air. Down the main runway, out along the Prop Wash with planes coming in
 * on a glide to crash-land on it (two kickers), round the Holding Pattern,
 * a full circle climbing on a deck, along the Clifftop Runway with more
 * planes dropping in, then the Deadstick: off the end of the runway with no
 * engine, a jump 10 m down to the slope below. A rail-less seaplane slip
 * over the water, the Hangar Cutting sunk 6 m into the field, and the
 * Crosswind swinging round the seaplane basin, which Tailwind, a narrow
 * plank taxiway, cuts straight across.
 */
export function buildDeadstickDrop(): TrackDef {
  const b = new TrackBuilder(START, 'Main Runway', { halfWidth: 12, surface: 'asphalt' });
  b.scale = K;
  b.straight(140).arc(50, -90);

  // Planes gliding in to land on the road, between two kickers.
  b.section('Prop Wash', { halfWidth: 10, surface: 'asphalt' });
  b.mark('wash');
  b.straight(40).mark('kick1').kicker().straight(30).mark('kick2').kicker().straight(100);

  // A full circle on a deck, climbing over the road it started on.
  b.section('Holding Pattern', { halfWidth: 9, wallHeight: 1.2, surface: 'boards', bridge: true });
  b.mark('hold');
  b.arc(30, -90).straight(20).arc(28, 360);
  b.mark('holdTop');
  b.section('Clifftop Runway', { halfWidth: 10, surface: 'asphalt', bridge: true });
  b.mark('runway');
  b.straight(60);
  b.mark('lip');
  b.rise(18, CLIFF + 3);
  b.gap(14, 30);
  b.section('The Deadstick', { halfWidth: 10, surface: 'rock' });
  b.mark('landing');
  b.elevate(LANDING).straight(20);
  b.arc(34, -90);

  // The seaplane slip: planks over the water, no rails.
  b.section('Seaplane Slip', { halfWidth: 8, surface: 'boards' });
  b.mark('slip');
  b.elevate(0).straight(10).elevate(1.5);
  b.bridge(45, 30, 'water');
  b.elevate(1.5).straight(10).elevate(0);

  b.section('Hangar Cutting', { halfWidth: 9, wallHeight: 1.2, surface: 'asphalt' });
  b.mark('cutting');
  b.arc(32, -60).arc(32, 60);
  b.mark('cuttingEnd');
  b.arc(36, 90);

  b.section('Crosswind', { halfWidth: 9.5, surface: 'asphalt' });
  b.mark('cross');
  b.straight(5);
  b.mark('tailFrom');
  b.arc(BASIN_R, BASIN_TURN).arc(BASIN_R, -2 * BASIN_TURN).arc(BASIN_R, BASIN_TURN);
  b.mark('tailTo');
  b.turnTo(offsetPose(START, -FINISH * K), 38);
  b.section('Finish Straight', { halfWidth: 12, surface: 'asphalt' });
  b.mark('finish');
  b.straight(FINISH);

  // Heights, over the layout: swells on the runway, the climb round the hold, the fall from the Deadstick, the cutting.
  const m = (name: string, d = 0) => b.marks[name].s + d * K;
  b.profile(30, m('wash', -20), (u) => 3 * Math.sin(2 * Math.PI * u) ** 2);
  ease(b, m('hold', 5), 0, m('hold', 50), HOLD_FROM);
  ease(b, m('hold', 50), HOLD_FROM, m('holdTop'), CLIFF);
  b.profile(m('holdTop'), m('lip'), () => CLIFF, 20);
  ease(b, m('landing', 24), LANDING, m('slip', -4), 0);
  ease(b, m('cutting', 8), 0, m('cutting', 40), -CUTTING_DEPTH);
  // Up out of the cutting over a hump, and off it into the bend.
  ease(b, m('cutting', 40), -CUTTING_DEPTH, m('cuttingEnd'), 4);
  plunge(b, m('cuttingEnd'), 4, m('cuttingEnd', 25), 0);
  b.profile(m('tailTo', 40), m('finish', -10), (u) => 4 * Math.sin(Math.PI * u) ** 2);

  const main = b.finish(true);
  const tail = buildTailwind(b.marks.tailFrom, b.marks.tailTo);
  const at = (mark: string, d: number) => b.marks[mark].s + d * K;
  return {
    id: 'deadstick-drop',
    name: 'Deadstick',
    main,
    branches: [tail.branch],
    pits: [...b.pits, ...tail.pits],
    boostPads: [
      { s: 40, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('runway', 20), length: 8, lateral: 0, halfWidth: 2.5 },
      { s: at('cutting', 60), length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['wash', 'hold', 'runway', 'landing', 'slip', 'cutting', 'cross'].map((k) => b.marks[k].s / main.length),
    laps: 3,
    bounds: 440,
    landmarks: [
      { kind: 'runwayGate', ribbon: -1, s: 6 },
      { kind: 'runwayGate', ribbon: -1, s: at('runway', 4) },
    ],
    itemBoxes: [
      { s: 75, count: 4 },
      { s: at('wash', 20), count: 4 },
      { s: at('runway', 40), count: 3 },
      { s: at('landing', 25), count: 3 },
      { s: at('cross', 45), count: 4 },
      { s: tail.boxes, count: 1, ribbon: 0, double: true },
    ],
    hazards: [
      { kind: 'gliders', at: [at('wash', 30), at('wash', 75), at('wash', 120)], period: 5.5 },
      { kind: 'gliders', at: [at('runway', 30)], period: 6 },
    ],
    theme: 'airfield',
    music: { lap: 'deadstick-drop', finalLap: 'deadstick-drop-final-lap' },
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
 * Tailwind: a narrow plank taxiway with no rails, straight across the
 * seaplane basin the Crosswind swings round.
 */
function buildTailwind(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, 'Tailwind', { halfWidth: 6, surface: 'asphalt' });
  b.straight(30);
  b.section('Tailwind Taxiway', { halfWidth: 4, surface: 'boards' });
  b.elevate(0).straight(12).elevate(1);
  const basin = chord - 2 * b.s;
  const boxes = b.s + basin / 2;
  b.bridge(basin, 7, 'water');
  b.elevate(1).straight(12).elevate(0);
  b.section('Tailwind', { halfWidth: 6, surface: 'asphalt' });
  b.straight(chord - b.s);
  const branch: BranchDef = { name: 'Tailwind', mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
  return { branch, pits: b.pits, boxes };
}
