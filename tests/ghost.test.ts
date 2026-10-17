import { describe, expect, it } from 'vitest';
import { GHOST_HZ, GhostRecorder, decodeGhost, encodeGhost, ghostPose } from '../src/core/ghost';
import { PHYSICS_DT } from '../src/core/loop';
import { createKartState } from '../src/physics/kart';

/** A kart driving along +x at 20 m/s, recorded for `seconds` from the green light. */
function drive(seconds: number) {
  const rec = new GhostRecorder();
  const s = createKartState(0, 0, Math.PI / 2);
  for (let t = -1; t < seconds; t += PHYSICS_DT) {
    if (t >= 0) s.x = t * 20;
    rec.record(t, s);
  }
  return rec.finish('neon-moth', seconds);
}

describe('ghost', () => {
  it('samples at GHOST_HZ from the green light only', () => {
    const run = drive(10);
    expect(run.samples.length / 6).toBeCloseTo(10 * GHOST_HZ, -1);
  });

  it('replays the recorded path, interpolating between samples', () => {
    const run = drive(10);
    const out = createKartState();
    ghostPose(run, 5.03, out);
    expect(out.x).toBeCloseTo(100.6, 0);
    expect(out.speed).toBeCloseTo(20, 0);
    // Before the start it sits on the grid; after its finish it waits at the end.
    ghostPose(run, 0, out);
    expect(out.x).toBeCloseTo(0, 1);
    ghostPose(run, 99, out);
    expect(out.x).toBeGreaterThan(195);
  });

  it('survives a trip through text storage', () => {
    const run = drive(3);
    const back = decodeGhost(encodeGhost(run))!;
    expect(back.racerId).toBe('neon-moth');
    expect(back.total).toBe(3);
    expect(Array.from(back.samples)).toEqual(Array.from(run.samples));
    expect(decodeGhost('not a ghost')).toBeNull();
  });

  it('keeps a full 3-lap run small enough for localStorage', () => {
    expect(encodeGhost(drive(300)).length).toBeLessThan(200_000);
  });
});
