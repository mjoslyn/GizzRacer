import { describe, expect, it } from 'vitest';
import { FixedLoop, PHYSICS_DT } from '../src/core/loop';
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

describe('test track', () => {
  const track = new Track(TEST_TRACK);

  it('reports road on the centerline and offroad far away', () => {
    const p = pointAt(track.spline, 300);
    expect(track.surfaceAt(p.x, p.z)).toBe('road');
    expect(track.surfaceAt(p.x - p.tz * 20, p.z + p.tx * 20)).toBe('offroad');
  });

  it('has boost pads', () => {
    const pad = TEST_TRACK.boostPads[0];
    const p = pointAt(track.spline, pad.s + pad.length / 2);
    expect(track.surfaceAt(p.x - p.tz * pad.lateral, p.z + p.tx * pad.lateral)).toBe('boost');
  });

  it('places start slots on the road, behind the line', () => {
    for (let i = 0; i < 8; i++) {
      const slot = track.startSlot(i);
      expect(track.surfaceAt(slot.x, slot.z)).not.toBe('offroad');
      expect(nearestOnSpline(track.spline, slot.x, slot.z).s).toBeGreaterThan(track.spline.length / 2);
    }
  });

  it('centerline does not come close to overlapping itself', () => {
    const sp = track.spline;
    const minGap = TEST_TRACK.roadHalfWidth * 2 + 6;
    for (let i = 0; i < sp.count; i += 3) {
      for (let j = 0; j < sp.count; j += 3) {
        const along = Math.abs(sp.dist[i] - sp.dist[j]);
        if (Math.min(along, sp.length - along) < minGap * 3) continue;
        expect(Math.hypot(sp.px[i] - sp.px[j], sp.pz[i] - sp.pz[j])).toBeGreaterThan(minGap);
      }
    }
  });
});

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
