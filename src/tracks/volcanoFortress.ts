import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { BranchDef, TrackDef } from './track';

const START: Pose = { x: 0, z: -150, h: Math.PI / 2 };
const FINISH = 60;
/** The rim bulges round the caldera on arcs of this radius; Hell's Itch is the chord. */
const RIM_R = 60;

/**
 * Volcano Fortress (spec section 7, hard): lava switchbacks, a walled
 * basalt fortress, a rail-less bridge across a lava lake, then the rim of
 * the caldera, with a narrower causeway straight across its lava.
 */
export function buildVolcanoFortress(): TrackDef {
  const b = new TrackBuilder(START, 'Ash Plain', { halfWidth: 11 });
  b.straight(13).kicker().straight(120).arc(50, 90);

  b.section('Lava Switchbacks', { halfWidth: 9, wallHeight: 1.2 });
  b.mark('switchbacks');
  b.straight(30).arc(26, 160).straight(25).arc(26, -160).straight(30);
  b.arc(50, 90);

  b.section('Fortress Gate', { halfWidth: 7.5, wallHeight: 8, surface: 'rock' });
  b.mark('fortress');
  b.straight(90).arc(70, 40).straight(40).arc(70, -40).straight(30);

  b.section('Magma Bridge', { halfWidth: 6 });
  b.mark('bridge');
  b.elevate(0).straight(14).elevate(2);
  b.bridge(70, 26, 'lava');
  b.elevate(2).straight(14).elevate(0);
  b.arc(55, 90);

  b.section('Caldera Rim', { halfWidth: 10 });
  b.mark('caldera');
  b.arc(40, 90);
  // Satan Speeds Up: a boost pad lined up with the causeway.
  b.section('Satan Speeds Up', { halfWidth: 10 });
  b.straight(30);
  b.section('Caldera Rim', { halfWidth: 10 });
  b.mark('rimStart');
  b.arc(RIM_R, -60).arc(RIM_R, 120).arc(RIM_R, -60);
  b.mark('rimEnd');
  b.hermiteTo(offsetPose(START, -FINISH), 0.9);
  b.section('Finish Straight', { halfWidth: 11 });
  // A kicker short of the line, a second and a half before the Ash Plain one.
  b.straight(13).kicker().straight(FINISH - 20);

  const main = b.finish(true);
  const itch = buildHellsItch(b.marks.rimStart, b.marks.rimEnd);
  return {
    id: 'volcano-fortress',
    name: 'Volcano Fortress',
    main,
    branches: [itch.branch],
    pits: [...b.pits, ...itch.pits],
    boostPads: [
      { s: 60, length: 8, lateral: 0, halfWidth: 2.5 },
      { s: b.marks.rimStart.s - 14, length: 8, lateral: 0, halfWidth: 2.5 },
    ],
    checkpoints: ['switchbacks', 'fortress', 'bridge', 'caldera'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 420,
    landmarks: [
      { kind: 'fortressGate', ribbon: -1, s: b.marks.fortress.s + 6 },
      { kind: 'fortressGate', ribbon: -1, s: b.marks.bridge.s - 8 },
    ],
    itemBoxes: [
      { s: 95, count: 4 },
      { s: b.marks.fortress.s + 30, count: 3 },
      { s: b.marks.caldera.s + 25, count: 4 },
      { s: itch.branch.length / 2, count: 2, ribbon: 0, span: 4, double: true },
    ],
    hazards: [
      { kind: 'lavaBombs', at: [55, 115, b.marks.caldera.s + 45], period: 6 },
      { kind: 'flameJets', at: [b.marks.fortress.s + 50, b.marks.fortress.s + 159, b.marks.fortress.s + 243], period: 3.2 },
    ],
    theme: 'volcano',
    music: { lap: 'volcano-fortress' },
  };
}

/**
 * Hell's Itch: a narrow, rail-less causeway straight across the caldera,
 * over a river of lava. Fall off and you're in it.
 */
function buildHellsItch(from: { s: number; pose: Pose }, to: { s: number; pose: Pose }) {
  const chord = Math.hypot(to.pose.x - from.pose.x, to.pose.z - from.pose.z);
  const b = new TrackBuilder(from.pose, "Hell's Itch", { halfWidth: 4 });
  // Up on the causeway once clear of the rim, so the lava keeps off the main road.
  const run = 46;
  const ramp = 14;
  b.straight(run).elevate(0).straight(ramp).elevate(2);
  b.bridge(chord - 2 * (run + ramp), 14, 'lava');
  b.elevate(2).straight(ramp).elevate(0);
  b.straight(chord - b.s);
  const branch: BranchDef = { name: "Hell's Itch", mainFrom: from.s, mainTo: to.s, ...b.finish(false) };
  return { branch, pits: b.pits };
}
