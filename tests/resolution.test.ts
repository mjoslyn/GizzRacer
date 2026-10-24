import { describe, expect, it } from 'vitest';
import { DynamicResolution, RESOLUTION_SCALES } from '../src/render/resolution';

/** Feeds a second's worth (or more) of frames at one frame time. */
function run(r: DynamicResolution, dt: number, seconds: number): number {
  let changes = 0;
  for (let t = 0; t < seconds; t += dt) if (r.sample(dt)) changes++;
  return changes;
}

describe('dynamic resolution', () => {
  it('holds full resolution while frames keep up with the display', () => {
    const r = new DynamicResolution();
    run(r, 1 / 60, 30);
    expect(r.scale).toBe(1);
  });

  it('steps down when frames drop, and stops at the floor', () => {
    const r = new DynamicResolution();
    run(r, 1 / 60, 2);
    run(r, 1 / 30, 1.05);
    expect(r.scale).toBe(RESOLUTION_SCALES[1]);
    run(r, 1 / 30, 20);
    expect(r.scale).toBe(RESOLUTION_SCALES[RESOLUTION_SCALES.length - 1]);
  });

  it('comes back up once frames have room again', () => {
    const r = new DynamicResolution();
    run(r, 1 / 60, 2);
    run(r, 1 / 30, 2.1);
    expect(r.scale).toBeLessThan(1);
    run(r, 1 / 60, 30);
    expect(r.scale).toBe(1);
  });

  it('waits longer each time a step up has to be undone', () => {
    const r = new DynamicResolution();
    run(r, 1 / 60, 2);
    run(r, 1 / 30, 1.05);
    const low = r.scale;
    run(r, 1 / 60, 4.1);
    expect(r.scale).toBe(1);
    run(r, 1 / 30, 1.05);
    expect(r.scale).toBe(low);
    // Four good seconds were enough the first time; now it takes eight.
    run(r, 1 / 60, 5);
    expect(r.scale).toBe(low);
    run(r, 1 / 60, 4);
    expect(r.scale).toBe(1);
  });

  it('a display held to 30 a second is not dropping frames', () => {
    const r = new DynamicResolution();
    run(r, 1 / 30, 30);
    expect(r.scale).toBe(1);
  });

  it('ignores hitches like a track being built', () => {
    const r = new DynamicResolution();
    for (let i = 0; i < 20; i++) {
      run(r, 1 / 60, 0.5);
      r.sample(0.4);
    }
    expect(r.scale).toBe(1);
  });

  it('a new detail level starts back at full resolution', () => {
    const r = new DynamicResolution();
    run(r, 1 / 60, 2);
    run(r, 1 / 30, 3.1);
    r.reset();
    expect(r.scale).toBe(1);
  });
});
