import { describe, expect, it } from 'vitest';
import { CPU_SKILL } from '../src/ai/cpuDriver';
import { GHOST_OVERRUN, GhostRecorder, encodeGhost } from '../src/core/ghost';
import { PHYSICS_DT } from '../src/core/loop';
import { Race } from '../src/core/race';
import { PHYSICS_VERSION } from '../src/physics/kart';
import { RACERS } from '../src/physics/racers';
import { TRACK_LIST } from '../src/tracks/index';
import { Track } from '../src/tracks/track';
import { boardName, checkRun, type RunSubmission } from '../src/net/runCheck';

/** A real 3-lap Time Trial, driven by the CPU and recorded like the game does. */
function realRun(): RunSubmission {
  const entry = TRACK_LIST[0];
  const race = new Race(new Track(entry.build()), 1, false);
  const kart = race.addKart(RACERS[0], '100cc', CPU_SKILL['150cc']);
  race.time = 0;
  const rec = new GhostRecorder();
  for (let t = 0; t < 400 && (kart.finishTime === null || race.time - kart.finishTime < GHOST_OVERRUN); t += PHYSICS_DT) {
    race.step(PHYSICS_DT, []);
    rec.record(race.time, kart.state);
  }
  const total = kart.finishTime!;
  return {
    trackId: entry.id,
    engine: '100cc',
    racerId: RACERS[0].id,
    physicsVersion: PHYSICS_VERSION,
    totalMs: Math.round(total * 1000),
    lapsMs: kart.lapTimes.map((l) => Math.round(l * 1000)),
    ghost: encodeGhost(rec.finish(RACERS[0].id, total)),
  };
}

describe('run check', () => {
  const run = realRun();

  it('accepts a real run', () => {
    expect(checkRun(run)).toBeNull();
  });

  it('rejects doctored runs', () => {
    expect(checkRun({ ...run, physicsVersion: PHYSICS_VERSION - 1 })).toMatch(/version/);
    expect(checkRun({ ...run, trackId: 'moon-base' })).toMatch(/track/);
    expect(checkRun({ ...run, totalMs: run.totalMs - 10_000 })).toMatch(/add up/);
    // Claim a much faster time with matching laps: the ghost gives it away.
    const fast = { ...run, lapsMs: run.lapsMs.map((l) => l - 3000), totalMs: run.totalMs - 9000 };
    expect(checkRun(fast)).toMatch(/ghost length/);
    // Absurd laps trip the physics floor.
    expect(checkRun({ ...run, lapsMs: [1000, 1000, 1000], totalMs: 3000 })).toMatch(/too fast/);
    expect(checkRun({ ...run, ghost: 'nope' })).toMatch(/bad ghost/);
  });

  it('rejects a ghost that skips the course', () => {
    // Same claimed time, but the path never leaves the grid.
    const short = realRun();
    const bytes = JSON.parse(short.ghost);
    const floats = new Float32Array(Uint8Array.from(atob(bytes.data), (c) => c.charCodeAt(0)).buffer);
    const stuck = new Float32Array(floats.length);
    for (let i = 0; i < stuck.length; i += 6) stuck.set(floats.subarray(0, 6), i);
    const encode = (f: Float32Array) => {
      const b = new Uint8Array(f.buffer);
      let s = '';
      for (const x of b) s += String.fromCharCode(x);
      return JSON.stringify({ ...bytes, data: btoa(s) });
    };
    expect(checkRun({ ...short, ghost: encode(stuck) })).toMatch(/does not finish/);
  });

  it('names boards by track, class and physics version', () => {
    expect(boardName('rattlesnake-run', '150cc')).toBe(`rattlesnake-run.150cc.v${PHYSICS_VERSION}`);
  });
});
