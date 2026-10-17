import { describe, expect, it } from 'vitest';
import { NEUTRAL_INPUT } from '../src/core/input';
import { FixedLoop, PHYSICS_DT } from '../src/core/loop';
import { clamp, wrapAngle } from '../src/core/math';
import { Race } from '../src/core/race';
import { createKartState, stepKart } from '../src/physics/kart';
import { RACERS, kartParams } from '../src/physics/racers';
import { TRACK_LIST } from '../src/tracks/index';
import { buildRattlesnakeRun } from '../src/tracks/rattlesnakeRun';
import { LapTracker } from '../src/tracks/laps';
import { buildClosedSpline, nearestOnSpline, pointAt } from '../src/tracks/spline';
import { TEST_TRACK } from '../src/tracks/testTrack';
import { Track } from '../src/tracks/track';

describe('spline', () => {
  // Square-ish loop; Catmull-Rom through 4 points of a circle approximates it.
  const r = 100;
  const circle = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r] as const;
  });
  const sp = buildClosedSpline(circle, 2);

  it('measures length close to circumference', () => {
    expect(sp.length).toBeGreaterThan(2 * Math.PI * r * 0.99);
    expect(sp.length).toBeLessThan(2 * Math.PI * r * 1.01);
  });

  it('finds nearest point and signed lateral offset', () => {
    // Travel is counter-clockwise (x,z) so at (r,0) tangent is +z, right is -x.
    const outside = nearestOnSpline(sp, r + 5, 0);
    expect(outside.distance).toBeCloseTo(5, 0);
    expect(outside.lateral).toBeLessThan(0);
    const inside = nearestOnSpline(sp, r - 5, 0);
    expect(inside.lateral).toBeGreaterThan(0);
    expect(Math.min(inside.s, sp.length - inside.s)).toBeLessThan(1);
  });

  it('pointAt round-trips through nearestOnSpline', () => {
    for (const s of [10, 200, 450, sp.length - 3]) {
      const p = pointAt(sp, s);
      expect(nearestOnSpline(sp, p.x, p.z).s).toBeCloseTo(s, 0);
    }
  });
});

const surfaceAt = (track: Track, x: number, z: number) => track.locate(x, z, 0).surface;

describe('test track', () => {
  const track = new Track(TEST_TRACK);

  it('reports road on the centerline and offroad far away', () => {
    const p = pointAt(track.spline, 300);
    expect(surfaceAt(track, p.x, p.z)).toBe('road');
    expect(surfaceAt(track, p.x - p.tz * 20, p.z + p.tx * 20)).toBe('offroad');
  });

  it('has boost pads', () => {
    const pad = TEST_TRACK.boostPads[0];
    const p = pointAt(track.spline, pad.s + pad.length / 2);
    expect(surfaceAt(track, p.x - p.tz * pad.lateral, p.z + p.tx * pad.lateral)).toBe('boost');
  });

  it('places start slots on the road, behind the line', () => {
    for (let i = 0; i < 8; i++) {
      const slot = track.startSlot(i);
      expect(surfaceAt(track, slot.x, slot.z)).not.toBe('offroad');
      expect(nearestOnSpline(track.spline, slot.x, slot.z).s).toBeGreaterThan(track.spline.length / 2);
    }
  });
});

/** Minimum centerline separation between stretches of road that are far apart along the track. */
function minSelfGap(track: Track): number {
  const sp = track.spline;
  let min = Infinity;
  for (let i = 0; i < sp.count; i += 2) {
    for (let j = 0; j < sp.count; j += 2) {
      const along = Math.abs(sp.dist[i] - sp.dist[j]);
      if (Math.min(along, sp.length - along) < 120) continue;
      const gap = Math.hypot(sp.px[i] - sp.px[j], sp.pz[i] - sp.pz[j]) - track.main.halfWidth[i] - track.main.halfWidth[j];
      min = Math.min(min, gap);
    }
  }
  return min;
}

describe('rattlesnake run', () => {
  const def = buildRattlesnakeRun();
  const track = new Track(def);

  it('is a long lap with every section from the spec', () => {
    expect(track.length).toBeGreaterThan(1400);
    const names = def.main.sections.map((s) => s.name);
    for (const n of ['Salt Flat Straight', 'Sidewinder S-Bends', 'Rattle Canyon', 'The Coil', 'Mesa Leap']) expect(names).toContain(n);
    expect(def.branches[0].name).toMatch(/Snake's Mouth/);
  });

  it('the slowest kart at 50cc still clears the Mesa Leap', () => {
    const slow = kartParams(RACERS.find((r) => r.id === 'swamp-witch')!.stats, '50cc');
    expect(jump(track, track.mainS(def.main.gaps[0][0]) - 45, -1, slow.topSpeed, 0, slow)).toBe('cleared');
  });

  it("Snake's Mouth needs a boost to clear", () => {
    const p = kartParams(RACERS[0].stats, '100cc');
    const gapStart = def.branches[0].gaps[0][0];
    expect(jump(track, gapStart - 20, 0, p.topSpeed, 0, p)).toBe('fell');
    // At 150cc a mid-stat kart still needs a boost (only the top-speed racers can skip it).
    const mid = kartParams(RACERS[0].stats, '150cc');
    expect(jump(track, gapStart - 20, 0, mid.topSpeed, 0, mid)).toBe('fell');
    expect(jump(track, gapStart - 20, 0, p.topSpeed * 1.35, 2, p)).toBe('cleared');
  });
});

describe.each(TRACK_LIST.map((t) => [t.name, t.build] as const))('%s', (_name, build) => {
  const def = build();
  const track = new Track(def);

  it('never runs the road over itself', () => {
    expect(minSelfGap(track)).toBeGreaterThan(4);
  });

  it('closes the loop smoothly and stays inside its bounds', () => {
    const sp = track.spline;
    const turn = Math.abs(wrapAngle(Math.atan2(sp.tx[0], sp.tz[0]) - Math.atan2(sp.tx[sp.count - 1], sp.tz[sp.count - 1])));
    expect(turn).toBeLessThan(0.1);
    for (let i = 0; i < sp.count; i++) expect(Math.max(Math.abs(sp.px[i]), Math.abs(sp.pz[i]))).toBeLessThan(def.bounds - 20);
  });

  it('keeps every checkpoint on solid road', () => {
    for (const cp of def.checkpoints) {
      const pose = track.respawnPose(cp * track.length + 2);
      expect(track.locate(pose.x, pose.z, pose.y).onRoad).toBe(true);
    }
  });

  it('can be lapped by autopilot without falling off', () => {
    const race = new Race(track);
    const kart = race.addKart(RACERS[0], '100cc', null);
    race.time = 0; // skip the countdown
    let respawns = 0;
    for (let t = 0; t < 200 && kart.laps.lap < 1; t += PHYSICS_DT) {
      race.step(PHYSICS_DT, [autopilot(track, kart.state, kart.progressS)]);
      if (kart.respawned) respawns++;
    }
    expect(kart.laps.lap).toBe(1);
    expect(respawns).toBe(0);
  });
});

/** Steers toward a point a little further along the main centerline. */
function autopilot(track: Track, s: ReturnType<typeof createKartState>, progress: number) {
  const p = pointAt(track.spline, progress + 14);
  const desired = Math.atan2(p.x - s.x, p.z - s.z);
  const err = wrapAngle(desired - s.heading);
  return { ...NEUTRAL_INPUT, throttle: 1, steer: clamp(-err * 2.5, -1, 1) };
}

/** Drives straight down a ribbon from arc length `s` and reports whether the kart landed or fell. */
function jump(track: Track, s: number, ribbon: number, speed: number, boost: number, p: ReturnType<typeof kartParams>) {
  const r = track.ribbon(ribbon);
  const pt = pointAt(r.spline, s);
  const kart = createKartState(pt.x, pt.z, Math.atan2(pt.tx, pt.tz));
  kart.y = kart.groundY = r.heightAt(s);
  kart.speed = speed;
  kart.boostTime = boost;
  for (let t = 0; t < 4; t += PHYSICS_DT) {
    stepKart(kart, { ...NEUTRAL_INPUT, throttle: 1 }, p, track, PHYSICS_DT);
    if (kart.y < -2) return 'fell';
  }
  return 'cleared';
}

describe('laps', () => {
  const L = 1000;

  it('counts a lap only after all checkpoints', () => {
    const laps = new LapTracker(L, [0.25, 0.5, 0.75]);
    laps.update(990);
    expect(laps.update(5)).toBe(false); // crossing the line at the start
    for (let s = 5; s < L; s += 10) laps.update(s);
    expect(laps.update(3)).toBe(true);
    expect(laps.lap).toBe(1);
  });

  it('does not count reversing over the line', () => {
    const laps = new LapTracker(L, [0.25, 0.5, 0.75]);
    laps.update(10);
    laps.update(990);
    expect(laps.update(10)).toBe(false);
    expect(laps.lap).toBe(0);
  });
});

describe('fixed loop', () => {
  it('runs a fixed number of steps regardless of frame size', () => {
    let steps = 0;
    const loop = new FixedLoop(() => steps++, () => {});
    for (let i = 0; i < 100; i++) loop.advance(1 / 144);
    expect(steps).toBe(Math.floor(100 / 144 / PHYSICS_DT));
    expect(loop.alpha).toBeGreaterThanOrEqual(0);
    expect(loop.alpha).toBeLessThan(1);
  });

  it('caps long frames', () => {
    let steps = 0;
    const loop = new FixedLoop(() => steps++, () => {});
    loop.advance(5);
    expect(steps).toBe(15);
  });
});
