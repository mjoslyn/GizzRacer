import type { TrackDef } from './track';

/** Milestone 1 flat test circuit: a long straight, a hairpin, sweepers and an S. */
export const TEST_TRACK: TrackDef = {
  id: 'test-track',
  name: 'Test Track',
  centerline: [
    [0, -60],
    [0, 40],
    [15, 120],
    [70, 160],
    [125, 135],
    [130, 75],
    [85, 40],
    [100, -15],
    [160, -45],
    [170, -115],
    [120, -165],
    [45, -170],
    [5, -130],
  ],
  roadHalfWidth: 9,
  bounds: 240,
  boostPads: [
    { s: 40, length: 8, lateral: -4, halfWidth: 2.5 },
    { s: 40, length: 8, lateral: 4, halfWidth: 2.5 },
  ],
  checkpoints: [0.25, 0.5, 0.75],
  laps: 3,
};
