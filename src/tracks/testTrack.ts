import type { TrackDef } from './track';

/** Flat test circuit (Milestone 1), dressed as the green Speedway until Infinite Loop Speedway is built: a long straight, a hairpin, sweepers and an S. */
export const TEST_TRACK: TrackDef = {
  id: 'test-track',
  name: 'Speedway Test Loop',
  main: {
    points: [
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
    closed: true,
    length: 0,
    sections: [{ name: 'Test Track', from: 0, to: 1e9, halfWidth: 9 }],
    elevation: [[0, 0]],
    gaps: [],
  },
  branches: [],
  pits: [],
  boostPads: [
    { s: 40, length: 8, lateral: -4, halfWidth: 2.5 },
    { s: 40, length: 8, lateral: 4, halfWidth: 2.5 },
  ],
  checkpoints: [0.25, 0.5, 0.75],
  laps: 3,
  bounds: 240,
  landmarks: [],
  itemBoxes: [
    { s: 120, count: 4 },
    { s: 430, count: 4 },
    { s: 700, count: 4 },
  ],
  hazards: [],
  theme: 'speedway',
  music: { lap: 'infinite-loop-speedway' },
};
