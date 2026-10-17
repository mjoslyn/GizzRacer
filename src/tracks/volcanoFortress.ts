import { TrackBuilder, offsetPose, type Pose } from './builder';
import type { TrackDef } from './track';

const START: Pose = { x: 0, z: -150, h: Math.PI / 2 };
const FINISH = 60;

/**
 * Volcano Fortress, first draft (spec section 7, hard): lava switchbacks,
 * a walled basalt fortress, and a rail-less bridge across a lava lake.
 */
export function buildVolcanoFortress(): TrackDef {
  const b = new TrackBuilder(START, 'Ash Plain', { halfWidth: 11 });
  b.straight(140).arc(50, 90);

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
  b.straight(60);
  b.hermiteTo(offsetPose(START, -FINISH), 0.9);
  b.section('Finish Straight', { halfWidth: 11 });
  b.straight(FINISH);

  const main = b.finish(true);
  return {
    id: 'volcano-fortress',
    name: 'Volcano Fortress (draft)',
    main,
    branches: [],
    pits: b.pits,
    boostPads: [{ s: 60, length: 8, lateral: 0, halfWidth: 2.5 }],
    checkpoints: ['switchbacks', 'fortress', 'bridge', 'caldera'].map((m) => b.marks[m].s / main.length),
    laps: 3,
    bounds: 420,
    landmarks: [],
    itemBoxes: [
      { s: 95, count: 4 },
      { s: b.marks.fortress.s + 30, count: 3 },
      { s: b.marks.caldera.s + 25, count: 4 },
    ],
    hazards: [],
    theme: 'volcano',
    music: { lap: 'volcano-fortress' },
  };
}
