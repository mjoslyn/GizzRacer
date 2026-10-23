import { describe, expect, it } from 'vitest';
import { TrackBuilder } from '../src/tracks/builder';
import { TRACK_LIST } from '../src/tracks/index';
import { Ribbon, Track } from '../src/tracks/track';
import { TURN_AHEAD, findBends, nextBend } from '../src/tracks/turns';
import { turnArrowPath } from '../src/ui/hud';

/** A straight, a wide left sweeper, a straight, a tight right hairpin, a straight. */
function road(): Ribbon {
  const b = new TrackBuilder({ x: 0, z: 0, h: 0 }, 'Test', { halfWidth: 8 });
  b.straight(100).arc(110, 70).straight(100).arc(15, -175).straight(100);
  return new Ribbon(b.finish(false));
}

describe('turn indicators', () => {
  it('finds each bend, which way it goes, how far it turns and how sharp it is', () => {
    const bends = findBends(road());
    expect(bends).toHaveLength(2);
    const [sweep, hairpin] = bends;
    expect(sweep.dir).toBe(-1);
    expect(sweep.angle).toBeGreaterThan(60);
    expect(sweep.angle).toBeLessThan(80);
    expect(sweep.severity).toBe(1);
    expect(hairpin.dir).toBe(1);
    expect(hairpin.angle).toBeGreaterThan(165);
    expect(hairpin.severity).toBe(4);
    expect(sweep.from).toBeGreaterThan(90);
    expect(sweep.from).toBeLessThan(110);
  });

  it('calls the bend ahead with its distance, the one you are in until nearly through, and nothing on a long straight', () => {
    const r = road();
    const bends = findBends(r);
    const L = r.spline.length;
    const [sweep, hairpin] = bends;
    const ahead = nextBend(bends, L, sweep.from - 60)!;
    expect(ahead.bend).toBe(sweep);
    expect(ahead.distance).toBeCloseTo(60, 0);
    expect(nextBend(bends, L, (sweep.from + sweep.to) / 2)).toEqual({ bend: sweep, distance: 0 });
    // Nearly out of it: the hairpin next.
    expect(nextBend(bends, L, sweep.to - 5)!.bend).toBe(hairpin);
    // Too far off to call.
    expect(nextBend(bends, L, sweep.from - TURN_AHEAD - 20)).toBe(null);
  });

  it('every track has bends to call, each with a sane span and severity', () => {
    for (const t of TRACK_LIST) {
      const track = new Track(t.build());
      const bends = findBends(track.main);
      expect(bends.length, t.id).toBeGreaterThanOrEqual(2);
      for (const b of bends) {
        expect(b.to).toBeGreaterThan(b.from);
        expect([1, 2, 3, 4]).toContain(b.severity);
      }
    }
  });

  it('the arrow curls the way the bend goes and stays in its box', () => {
    for (const dir of [-1, 1] as const) {
      for (const angle of [30, 90, 180, 270]) {
        const { line, head } = turnArrowPath(dir, angle);
        const nums = `${line} ${head}`.match(/-?\d+(\.\d+)?/g)!.map(Number);
        for (const n of nums) {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(100);
        }
        // The tip of the head is right of where the stem starts for a right turn, left for a left.
        const start = line.match(/^M(-?[\d.]+) (-?[\d.]+)/)!;
        const tip = head.match(/L(-?[\d.]+) (-?[\d.]+)/)!;
        expect(Math.sign(Number(tip[1]) - Number(start[1]))).toBe(dir);
      }
    }
  });
});
